import { EventEmitter } from 'node:events';
import {
  parseGabboFrame,
  type GabboNotification,
} from './notifications/gabbo-notification.js';

export type GabboUpdateType =
  | 'volumeUpdated'
  | 'nowPlayingUpdated'
  | 'nowSelectionUpdated'
  | 'presetsUpdated'
  | 'zoneUpdated'
  | 'bassUpdated'
  | 'connectionStateUpdated'
  | 'recentsUpdated';

const NOTIFICATION_TYPE_TO_UPDATE_TYPE: Readonly<
  Record<GabboNotification['type'], GabboUpdateType | undefined>
> = {
  volume: 'volumeUpdated',
  nowPlaying: 'nowPlayingUpdated',
  nowSelection: 'nowSelectionUpdated',
  presets: 'presetsUpdated',
  zone: 'zoneUpdated',
  bass: 'bassUpdated',
  connectionState: 'connectionStateUpdated',
  sources: undefined,
  info: undefined,
  recents: 'recentsUpdated',
  swUpdateStatus: undefined,
  siteSurveyResults: undefined,
  acctMode: undefined,
};

type GabboEvent = GabboUpdateType | 'connected' | 'disconnected' | 'error';

const RECONNECT_DELAY_MS = 5000;
const RECONNECT_MAX_DELAY_MS = 300_000;
const PING_INTERVAL_MS = 30000;
const STALE_CONNECTION_MS = 2 * PING_INTERVAL_MS;
const DEFAULT_WEBSOCKET_PORT = 8080;

export class GabboClient extends EventEmitter {
  private socket: WebSocket | undefined;
  private shouldReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private reconnectAttempts = 0;
  private lastActivityAt: number | undefined;

  private constructor(
    private readonly host: string,
    private readonly port: number
  ) {
    super();
    // Suppress Node's "unhandled error event" crash. Callers that care about
    // connection errors should add their own 'error' listener.
    this.on('error', () => undefined);
  }

  static create(
    host: string,
    port: number = DEFAULT_WEBSOCKET_PORT
  ): GabboClient {
    return new GabboClient(host, port);
  }

  get isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(): void {
    this.shouldReconnect = true;
    this.openSocket();
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.cleanup();
    this.socket?.close();
    this.socket = undefined;
  }

  private openSocket(): void {
    const ws = new WebSocket(`ws://${this.host}:${this.port}`, ['gabbo']);
    this.socket = ws;

    // Node's built-in WebSocket does not reliably pair 'error' with 'close':
    // a pre-open failure (e.g. connection refused, handshake rejected) fires
    // only 'error', while a post-open drop fires only 'close'. Route both
    // through the same teardown so reconnects are always scheduled, guarded
    // against running twice if a future Node version fires both.
    let handledDisconnect = false;
    const handleDisconnect = (): void => {
      if (handledDisconnect) {
        return;
      }
      handledDisconnect = true;
      this.cleanup();
      this.emit('disconnected' satisfies GabboEvent);
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    };

    ws.addEventListener('open', () => {
      this.reconnectAttempts = 0;
      this.lastActivityAt = Date.now();
      this.startPing();
      this.emit('connected' satisfies GabboEvent);
    });

    ws.addEventListener('message', (event) => {
      this.lastActivityAt = Date.now();
      this.handleMessage(String(event.data));
    });

    ws.addEventListener('close', handleDisconnect);

    ws.addEventListener('error', (event) => {
      this.emit('error' satisfies GabboEvent, event);
      handleDisconnect();
    });
  }

  private handleMessage(data: string): void {
    parseGabboFrame(data)
      .then((notifications) => {
        for (const notification of notifications) {
          const updateType =
            NOTIFICATION_TYPE_TO_UPDATE_TYPE[notification.type];
          if (updateType !== undefined) {
            this.emit(updateType, notification.element);
          }
        }
      })
      .catch(() => {
        // Silently drop unparseable frames — a bad frame should not
        // disrupt the connection.
      });
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      if (!this.isConnected) {
        return;
      }
      if (
        this.lastActivityAt !== undefined &&
        Date.now() - this.lastActivityAt > STALE_CONNECTION_MS
      ) {
        this.emit(
          'error' satisfies GabboEvent,
          new Error('Gabbo connection appears stale; forcing reconnect')
        );
        this.socket?.close();
        return;
      }
      this.socket?.send('');
    }, PING_INTERVAL_MS);
  }

  private scheduleReconnect(): void {
    const delay = Math.min(
      RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_DELAY_MS
    );
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect) {
        this.openSocket();
      }
    }, delay);
  }

  private cleanup(): void {
    if (this.pingTimer !== undefined) {
      clearInterval(this.pingTimer);
      this.pingTimer = undefined;
    }
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}
