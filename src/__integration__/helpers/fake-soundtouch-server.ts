import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export function infoXml(
  options: { deviceId?: string; name?: string; type?: string } = {}
): string {
  const {
    deviceId = 'DEV-INT-1',
    name = 'Test Speaker',
    type = 'SoundTouch 10',
  } = options;
  return (
    `<info deviceID="${deviceId}">` +
    `<name>${name}</name>` +
    `<type>${type}</type>` +
    '<components><component>' +
    '<softwareVersion>1.0.0</softwareVersion>' +
    `<serialNumber>${deviceId}</serialNumber>` +
    '</component></components>' +
    '<networkInfo><macAddress>AA:BB:CC:DD:EE:FF</macAddress>' +
    '<ipAddress>127.0.0.1</ipAddress></networkInfo>' +
    '</info>'
  );
}

export function nowPlayingXml(source: string, deviceId = 'DEV-INT-1'): string {
  return (
    `<nowPlaying deviceID="${deviceId}" source="${source}">` +
    `<ContentItem source="${source}"/>` +
    '</nowPlaying>'
  );
}

export function volumeXml(
  options: { target?: number; actual?: number; muted?: boolean } = {}
): string {
  const { target = 20, actual = 20, muted = false } = options;
  return (
    '<volume deviceID="DEV-INT-1">' +
    `<targetvolume>${target}</targetvolume>` +
    `<actualvolume>${actual}</actualvolume>` +
    `<muteenabled>${muted}</muteenabled>` +
    '</volume>'
  );
}

/**
 * A dependency-free in-process stand-in for a real SoundTouch speaker's HTTP
 * API (normally port 8090). `SoundTouchDevice` constructs its own axios
 * instance internally, so there is no client to inject — binding a real local
 * HTTP server on a random port is the clean seam for integration tests.
 *
 * Responses are keyed by request path (e.g. `/info`, `/nowPlaying`). Tests
 * override only the endpoints they care about; everything else falls back to
 * the canned defaults.
 */
export class FakeSoundTouchServer {
  private server?: Server;
  private readonly responses = new Map<string, string>();

  constructor() {
    for (const [endpoint, xml] of FakeSoundTouchServer.defaultResponses()) {
      this.responses.set(endpoint, xml);
    }
  }

  setResponse(endpoint: string, xml: string): void {
    this.responses.set(FakeSoundTouchServer.normalise(endpoint), xml);
  }

  start(): Promise<number> {
    const server = createServer((req, res) => {
      // Drain the request body so POST sockets close cleanly.
      req.resume();

      const path = FakeSoundTouchServer.normalise((req.url ?? '').split('?')[0]);
      const xml = this.responses.get(path);

      if (xml === undefined) {
        res.writeHead(404, { 'content-type': 'application/xml' });
        res.end(
          `<errors><error value="404">no canned response for ${path}</error></errors>`
        );
        return;
      }

      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end(xml);
    });
    this.server = server;

    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        resolve((server.address() as AddressInfo).port);
      });
    });
  }

  stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) {
      return Promise.resolve();
    }
    // Tear down any lingering keep-alive sockets so close() resolves promptly.
    server.closeAllConnections();
    return new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }

  private static normalise(endpoint: string): string {
    return endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  }

  static defaultResponses(): Map<string, string> {
    return new Map<string, string>([
      ['/info', infoXml()],
      ['/nowPlaying', nowPlayingXml('STANDBY')],
      ['/volume', volumeXml()],
    ]);
  }
}
