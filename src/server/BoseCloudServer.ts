import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { create as axiosCreate, type AxiosInstance } from 'axios';
import { Logger } from '../utils/FormattedLogger.js';

const SOURCE_PROVIDERS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sourceProviders>
<sourceprovider id="1"><createdOn>2012-09-19T12:43:00.000+00:00</createdOn><name>PANDORA</name><updatedOn>2012-09-19T12:43:00.000+00:00</updatedOn></sourceprovider>
<sourceprovider id="2"><createdOn>2012-09-19T12:43:00.000+00:00</createdOn><name>INTERNET_RADIO</name><updatedOn>2012-09-19T12:43:00.000+00:00</updatedOn></sourceprovider>
<sourceprovider id="9"><createdOn>2012-09-19T12:43:00.000+00:00</createdOn><name>AUX</name><updatedOn>2012-09-19T12:43:00.000+00:00</updatedOn></sourceprovider>
<sourceprovider id="15"><createdOn>2012-09-19T12:43:00.000+00:00</createdOn><name>SPOTIFY</name><updatedOn>2012-09-19T12:43:00.000+00:00</updatedOn></sourceprovider>
<sourceprovider id="25"><createdOn>2012-09-19T12:43:00.000+00:00</createdOn><name>TUNEIN</name><updatedOn>2012-09-19T12:43:00.000+00:00</updatedOn></sourceprovider>
</sourceProviders>`;

// TuneIn ids observed from real presets are a single letter type prefix
// (e.g. `s` for station) followed by digits, e.g. `s7162`. See
// docs/bose-cloud-setup.md and src/__device__/preset-concept.device.test.ts.
const STATION_ID_PATTERN = /^[a-z]?\d+$/i;

interface RadioTimeTuneResponse {
  body?: Array<{ url?: string }>;
}

interface RadioTimeDescribeResponse {
  body?: Array<{ name?: string; logo?: string }>;
}

export class BoseCloudServer {
  private _server: Server | undefined;

  private constructor(
    private readonly host: string,
    private readonly port: number,
    private readonly logger: Logger,
    private readonly axios: AxiosInstance
  ) {}

  static create(props: {
    host: string;
    port: number;
    logger: Logger;
    axiosInstance?: AxiosInstance;
  }): BoseCloudServer {
    return new BoseCloudServer(
      props.host,
      props.port,
      props.logger,
      props.axiosInstance ?? axiosCreate({ timeout: 10_000 })
    );
  }

  start(): Promise<void> {
    if (this._server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this._server = createServer((req, res) => {
        this._handleRequest(req, res).catch((err: unknown) => {
          this.logger.error('[FakeBoseCloud] Handler error', err);
          if (!res.headersSent) {
            res.writeHead(500);
            res.end();
          }
        });
      });
      this._server.listen(this.port, () => {
        const addr = this.address();
        this.logger.info(
          `[FakeBoseCloudServer] Listening on http://${this.host}:${addr?.port ?? this.port}`
        );
        resolve();
      });
      this._server.on('error', reject);
    });
  }

  stop(): Promise<void> {
    if (!this._server) return Promise.resolve();
    return new Promise((resolve) => {
      this._server!.close(() => {
        this._server = undefined;
        resolve();
      });
    });
  }

  address(): { host: string; port: number } | undefined {
    if (!this._server) return undefined;
    const addr = this._server.address();
    if (!addr || typeof addr === 'string') return undefined;
    return { host: this.host, port: addr.port };
  }

  private get _baseUrl(): string {
    const effectivePort = this.address()?.port ?? this.port;
    return `http://${this.host}:${effectivePort}`;
  }

  private _buildBmxServices(): object {
    const base = this._baseUrl;
    return {
      _links: {
        bmx_services_availability: { href: '../servicesAvailability' },
      },
      askAgainAfter: 1230482,
      bmx_services: [
        {
          _links: {
            bmx_navigate: { href: '/v1/navigate' },
            bmx_token: { href: '/v1/token' },
            self: { href: '/' },
          },
          askAdapter: false,
          assets: {
            color: '#000000',
            description: 'TuneIn',
            icons: {
              largeSvg: `${base}/media/tunein-smallSvg.svg`,
              smallSvg: `${base}/media/tunein-smallSvg.svg`,
              monochromePng: `${base}/media/tunein-monochromePng.png`,
              monochromeSvg: `${base}/media/tunein-monochromeSvg.svg`,
              defaultAlbumArt: `${base}/media/tunein-default-album-art.png`,
            },
            name: 'TuneIn',
          },
          authenticationModel: {
            anonymousAccount: { autoCreate: true, enabled: true },
          },
          baseUrl: `${base}/bmx/tunein`,
          id: { name: 'TUNEIN', value: 25 },
          streamTypes: ['liveRadio', 'onDemand'],
        },
      ],
    };
  }

  private async _resolveTuneIn(stationId: string): Promise<object> {
    const encodedId = encodeURIComponent(stationId);

    const streamResp = await this.axios.get<RadioTimeTuneResponse>(
      `http://opml.radiotime.com/Tune.ashx?id=${encodedId}&formats=mp3,aac,ogg&render=json`
    );
    const streamUrl = streamResp.data?.body?.[0]?.url ?? '';

    let name = stationId;
    let imageUrl = '';
    try {
      const descResp = await this.axios.get<RadioTimeDescribeResponse>(
        `https://opml.radiotime.com/describe.ashx?id=${encodedId}&render=json`
      );
      name = descResp.data?.body?.[0]?.name ?? stationId;
      imageUrl = descResp.data?.body?.[0]?.logo ?? '';
    } catch {
      // name and imageUrl are cosmetic — don't abort on failure
    }

    const reporting = `/v1/report?stream_id=e3342&guide_id=${encodedId}&listen_id=3432432423&stream_type=liveRadio`;
    return {
      links: {
        bmx_favorite: { href: `/v1/favorite/${encodedId}` },
        bmx_nowplaying: {
          href: `/v1/now-playing/station/${encodedId}`,
          useInternalClient: 'ALWAYS',
        },
        bmx_reporting: { href: reporting },
      },
      audio: {
        hasPlaylist: true,
        isRealtime: true,
        maxTimeout: 60,
        streamUrl,
        streams: [
          {
            links: { bmx_reporting: { href: reporting } },
            hasPlaylist: true,
            isRealtime: true,
            maxTimeout: 60,
            bufferingTimeout: 20,
            connectingTimeout: 10,
            streamUrl,
          },
        ],
      },
      imageUrl,
      isFavorite: false,
      name,
      streamType: 'liveRadio',
    };
  }

  private async _handleRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    const url = req.url?.split('?')[0] ?? '/';
    this.logger.debug(
      `[FakeBoseCloudServer] ${req.socket.remoteAddress} ${req.method} ${req.url}`
    );

    if (req.method === 'GET' && url === '/bmx/registry/v1/services') {
      const body = JSON.stringify(this._buildBmxServices());
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    if (req.method === 'GET' && url === '/marge/streaming/sourceproviders') {
      res.writeHead(200, {
        'Content-Type': 'application/xml',
        'Content-Length': Buffer.byteLength(SOURCE_PROVIDERS_XML),
      });
      res.end(SOURCE_PROVIDERS_XML);
      return;
    }

    const tuneInMatch = url.match(
      /^\/bmx\/tunein\/v1\/playback\/station\/(.+)$/
    );
    if (req.method === 'GET' && tuneInMatch) {
      const stationId = tuneInMatch[1];
      if (!STATION_ID_PATTERN.test(stationId)) {
        this.logger.debug(
          `[FakeBoseCloudServer] Rejected malformed TuneIn station id "${stationId}" from ${req.socket.remoteAddress}`
        );
        res.writeHead(400);
        res.end();
        return;
      }
      try {
        const payload = await this._resolveTuneIn(stationId);
        const body = JSON.stringify(payload);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        });
        res.end(body);
      } catch (err) {
        this.logger.error('[FakeBoseCloudServer] TuneIn resolve error', err);
        res.writeHead(502);
        res.end('Bad Gateway');
      }
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{}');
  }
}
