import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { FakeGabboServer } from './helpers/fake-gabbo-server.js';
import {
  parseGabboFrame,
  type GabboNotification,
} from '../devices/SoundTouch/api/notifications/gabbo-notification.js';
import { Endpoints } from '../devices/SoundTouch/api/endpoints.js';

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
});
