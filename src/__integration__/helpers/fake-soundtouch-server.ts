import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export function infoXml(
  options: {
    deviceId?: string;
    name?: string;
    type?: string;
    softwareVersion?: string;
    hasComponents?: boolean;
  } = {}
): string {
  const {
    deviceId = 'DEV-INT-1',
    name = 'Test Speaker',
    type = 'SoundTouch 10',
    softwareVersion = '1.0.0',
    hasComponents = true,
  } = options;
  const components = hasComponents
    ? '<components><component>' +
      '<componentCategory>SCM</componentCategory>' +
      `<softwareVersion>${softwareVersion}</softwareVersion>` +
      '<serialNumber>COMPONENT-SERIAL</serialNumber>' +
      '</component></components>'
    : '<components></components>';
  return (
    `<info deviceID="${deviceId}">` +
    `<name>${name}</name>` +
    `<type>${type}</type>` +
    components +
    '<networkInfo><macAddress>AA:BB:CC:DD:EE:FF</macAddress>' +
    '<ipAddress>127.0.0.1</ipAddress></networkInfo>' +
    '</info>'
  );
}

export function nowPlayingXml(
  source: string,
  deviceId = 'DEV-INT-1',
  location?: string
): string {
  return (
    `<nowPlaying deviceID="${deviceId}" source="${source}">` +
    `<ContentItem source="${source}"${location ? ` location="${location}"` : ''}/>` +
    '</nowPlaying>'
  );
}

export function presetsXml(
  presets: { slot: number; source: string; location?: string }[]
): string {
  const presetXml = presets
    .map(
      (p) =>
        `<preset id="${p.slot}" createdOn="1000" updateOn="1000">` +
        `<ContentItem source="${p.source}"${p.location ? ` location="${p.location}"` : ''} isPresetable="true"/>` +
        '</preset>'
    )
    .join('');
  return `<presets>${presetXml}</presets>`;
}

function volumeXml(
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
export interface ReceivedRequest {
  readonly method: string;
  readonly path: string;
  readonly body: string;
}

export class FakeSoundTouchServer {
  private server?: Server;
  private readonly responses = new Map<string, string>();
  readonly requests: ReceivedRequest[] = [];

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
      const path = FakeSoundTouchServer.normalise(
        (req.url ?? '').split('?')[0]
      );

      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        this.requests.push({
          method: req.method ?? 'GET',
          path,
          body: Buffer.concat(chunks).toString('utf8'),
        });

        const xml = this.responses.get(path);

        if (xml === undefined) {
          res.writeHead(404, { 'content-type': 'application/xml' });
          res.end(
            `<errors><error value="404">no canned response for ${path.replace(/[<>&"]/g, (c) => `&#${c.charCodeAt(0)};`)}</error></errors>`
          );
          return;
        }

        res.writeHead(200, { 'content-type': 'application/xml' });
        res.end(xml);
      });
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
