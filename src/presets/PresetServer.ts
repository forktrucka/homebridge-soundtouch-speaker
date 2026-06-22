import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import * as nodeHttp from 'node:http';
import * as nodeHttps from 'node:https';
import { PresetStation } from './PresetStation.js';

export class PresetServer {
  private readonly server: Server;

  private constructor(
    private readonly port: number,
    private readonly host: string,
    private stations: Map<number, PresetStation>
  ) {
    this.server = createServer((req, res) => this._handleRequest(req, res));
  }

  static create(props: {
    port: number;
    host: string;
    stations: Map<number, PresetStation>;
  }): PresetServer {
    return new PresetServer(props.port, props.host, props.stations);
  }

  listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, () => {
        this.server.removeListener('error', reject);
        resolve();
      });
    });
  }

  close(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  getPresetUrl(slot: number): string {
    return `http://${this.host}:${this.port}/preset/${slot}.json`;
  }

  updateStations(stations: Map<number, PresetStation>): void {
    this.stations = stations;
  }

  private _handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? '';

    const presetMatch = url.match(/^\/preset\/(\d+)\.json$/);
    if (presetMatch) {
      this._handlePresetJson(res, Number(presetMatch[1]));
      return;
    }

    const streamMatch = url.match(/^\/stream\/(\d+)$/);
    if (streamMatch) {
      this._handleStream(req, res, Number(streamMatch[1]));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }

  private _handlePresetJson(res: ServerResponse, slot: number): void {
    const station = this.stations.get(slot);
    if (!station) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unknown slot' }));
      return;
    }

    const body = JSON.stringify({
      audio: {
        hasPlaylist: false,
        isRealtime: true,
        streamUrl: `http://${this.host}:${this.port}/stream/${slot}`,
      },
      imageUrl: station.data.imageUrl ?? '',
      name: station.data.name,
      streamType: 'liveRadio',
    });

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
    });
    res.end(body);
  }

  private _handleStream(
    req: IncomingMessage,
    res: ServerResponse,
    slot: number
  ): void {
    const station = this.stations.get(slot);
    if (!station) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Unknown slot');
      return;
    }

    const upstreamUrl = station.data.resolvedStreamUrl;
    const isHttps = upstreamUrl.startsWith('https://');
    const transport = isHttps ? nodeHttps : nodeHttp;

    const upstreamReq = transport.get(upstreamUrl, (upstreamRes) => {
      const headers: Record<string, string | string[] | undefined> = {
        'content-type': upstreamRes.headers['content-type'],
      };

      for (const [key, value] of Object.entries(upstreamRes.headers)) {
        if (key.toLowerCase().startsWith('icy-')) {
          headers[key] = value;
        }
      }

      res.writeHead(upstreamRes.statusCode ?? 200, headers);
      upstreamRes.pipe(res);

      req.on('close', () => {
        upstreamReq.destroy();
      });
    });

    upstreamReq.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(502, { 'Content-Type': 'text/plain' });
        res.end('Bad Gateway');
      }
    });
  }
}
