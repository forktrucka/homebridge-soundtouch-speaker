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
  | 'connectionStateUpdated';

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
  recents: undefined,
  swUpdateStatus: undefined,
  siteSurveyResults: undefined,
  acctMode: undefined,
};

type GabboEvent = GabboUpdateType | 'connected' | 'disconnected' | 'error';

const RECONNECT_DELAY_MS = 5000;
const PING_INTERVAL_MS = 30000;
const DEFAULT_WEBSOCKET_PORT = 8080;

export class GabboClient extends EventEmitter {
  private socket: WebSocket | undefined;
  private shouldReconnect = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  private pingTimer: ReturnType<typeof setInterval> | undefined;

  private constructor(
    private readonly host: string,
    private readonly port: number
  ) {
    super();
    // Suppress Node's "unhandled error event" crash. Callers that care about
    // connection errors should add their own 'error' listener.
    this.on('error', () => undefined);
  }

  static create(host: string, port: number = DEFAULT_WEBSOCKET_PORT): GabboClient {
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

    ws.addEventListener('open', () => {
      this.startPing();
      this.emit('connected' satisfies GabboEvent);
    });

    ws.addEventListener('message', (event) => {
      this.handleMessage(String(event.data));
    });

    ws.addEventListener('close', () => {
      this.cleanup();
      this.emit('disconnected' satisfies GabboEvent);
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    });

    ws.addEventListener('error', (event) => {
      this.emit('error' satisfies GabboEvent, event);
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
      if (this.isConnected) {
        this.socket?.send('');
      }
    }, PING_INTERVAL_MS);
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      if (this.shouldReconnect) {
        this.openSocket();
      }
    }, RECONNECT_DELAY_MS);
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
