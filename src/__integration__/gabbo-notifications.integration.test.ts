import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { FakeGabboServer } from './helpers/fake-gabbo-server.js';
import {
  parseGabboFrame,
  type GabboNotification,
} from '../devices/SoundTouch/api/notifications/gabbo-notification.js';
import { Endpoints } from '../devices/SoundTouch/api/endpoints.js';
import { GabboClient } from '../devices/SoundTouch/api/GabboClient.js';

/** Wait for an event to fire on an EventEmitter, resolving with its first argument. */
function nextEvent(emitter: GabboClient, event: string): Promise<unknown> {
  return new Promise((resolve) => {
    emitter.once(event, (payload) => resolve(payload));
  });
}

/**
 * Spike C, Part 1 (no hardware): prove our connect → receive → parse → dispatch
 * chain works against a faithful fake of the gabbo channel. A real global
 * `WebSocket` client connects to a `ws` server over an actual socket, so this
 * exercises sub-protocol negotiation and framing for real — only the speaker
 * itself is faked.
 */
describe('gabbo WebSocket notifications', () => {
  let server: FakeGabboServer;
  let port: number;
  let socket: WebSocket | undefined;

  beforeEach(async () => {
    server = new FakeGabboServer();
    port = await server.start();
  });

  afterEach(async () => {
    socket?.close();
    socket = undefined;
    await server.stop();
  });

  function open(protocols?: string | string[]): Promise<WebSocket> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, protocols);
    socket = ws;
    return new Promise((resolve, reject) => {
      ws.addEventListener('open', () => resolve(ws));
      ws.addEventListener('error', () => reject(new Error('connection failed')));
    });
  }

  function nextFrame(ws: WebSocket): Promise<string> {
    return new Promise((resolve) => {
      ws.addEventListener(
        'message',
        (event) => resolve(String((event as MessageEvent).data)),
        { once: true }
      );
    });
  }

  describe('sub-protocol negotiation', () => {
    it('negotiates the gabbo sub-protocol on connect', async () => {
      const ws = await open('gabbo');

      expect(ws.protocol).toBe('gabbo');
      expect(server.connectionCount).toBe(1);
      expect(server.negotiatedProtocols).toEqual(['gabbo']);
    });

    it('rejects a client that does not request the gabbo sub-protocol', async () => {
      await expect(open()).rejects.toThrow();
    });
  });

  describe('receiving and dispatching frames', () => {
    it('parses a pushed volume tickle into a volume re-fetch', async () => {
      const ws = await open('gabbo');
      const frame = nextFrame(ws);

      server.push('<updates deviceID="DEV1"><volumeUpdated/></updates>');

      const [notification] = await parseGabboFrame(await frame);
      expect(notification.type).toBe('volume');
      expect(notification.refetch).toBe(Endpoints.volume);
    });

    it('parses a pushed now-playing change into a now-playing re-fetch', async () => {
      const ws = await open('gabbo');
      const frame = nextFrame(ws);

      server.push(
        '<updates deviceID="DEV1"><nowPlayingUpdated>' +
          '<nowPlaying source="SPOTIFY"/></nowPlayingUpdated></updates>'
      );

      const [notification] = await parseGabboFrame(await frame);
      expect(notification.type).toBe('nowPlaying');
      expect(notification.refetch).toBe(Endpoints.nowPlaying);
    });

    it('treats an empty frame as a heartbeat with no notifications', async () => {
      const ws = await open('gabbo');
      const frame = nextFrame(ws);

      server.push('<updates deviceID="DEV1"></updates>');

      const notifications: GabboNotification[] = await parseGabboFrame(
        await frame
      );
      expect(notifications).toEqual([]);
    });
  });

  /**
   * Spike C, Part 2 (resilience): a `GabboClient` connected to a server that
   * goes silent (stops responding to pings, never actually closes the TCP
   * connection) must notice the dead connection, force a close, and
   * reconnect once the server comes back — without leaking timers.
   */
  describe('reconnect resilience', () => {
    let client: GabboClient | undefined;

    afterEach(() => {
      client?.disconnect();
      client = undefined;
    });

    it('closes and reconnects a client when the server goes silent, then recovers', async () => {
      client = GabboClient.create('127.0.0.1', port);

      jest.useFakeTimers({ advanceTimers: false });

      try {
        client.connect();
        await nextEvent(client, 'connected');
        expect(client.isConnected).toBe(true);

        // The server never closes the connection, but also never sends
        // anything back — simulating a half-open/dead peer.
        const disconnected = nextEvent(client, 'disconnected');
        jest.advanceTimersByTime(90000); // > STALE_CONNECTION_MS (2x30s ping interval)
        await disconnected;

        expect(client.isConnected).toBe(false);

        // The server is still up on the same port, so the scheduled
        // reconnect (5s backoff) should succeed.
        const reconnected = nextEvent(client, 'connected');
        jest.advanceTimersByTime(5000);
        await reconnected;

        expect(client.isConnected).toBe(true);
      } finally {
        jest.useRealTimers();
      }
    });

    it('leaves no pending timers after disconnect()', async () => {
      client = GabboClient.create('127.0.0.1', port);

      jest.useFakeTimers({ advanceTimers: false });

      try {
        client.connect();
        await nextEvent(client, 'connected');

        client.disconnect();

        // If the ping interval or a reconnect timer were still scheduled,
        // this would throw synchronously (fake timers surface leaks via a
        // pending-timer count) or trigger further 'connected'/'disconnected'
        // events after being advanced well past every relevant interval.
        const events: string[] = [];
        client.on('connected', () => events.push('connected'));
        client.on('disconnected', () => events.push('disconnected'));

        jest.advanceTimersByTime(600000);

        expect(events).toHaveLength(0);
        expect(jest.getTimerCount()).toBe(0);
      } finally {
        jest.useRealTimers();
      }
    });
  });
});
