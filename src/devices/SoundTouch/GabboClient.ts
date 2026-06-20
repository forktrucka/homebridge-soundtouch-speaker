import { parseGabboFrame } from './api/notifications/gabbo-notification.js';
import { Logger } from '../../utils/FormattedLogger.js';

const GABBO_DEFAULT_PORT = 8080;
const GABBO_PROTOCOL = 'gabbo';

type VolumeTickleCallback = () => void;

/**
 * Minimal WebSocket client for the SoundTouch `gabbo` notification channel
 * (port 8080). Spike scope: only dispatches `volumeUpdated` tickles to a
 * single registered callback. No reconnect logic — connect once, close on
 * teardown.
 *
 * The global `WebSocket` class (undici) is available in Node 22+.  No runtime
 * dependency is added; `ws` remains a devDependency for the fake server only.
 */
export class GabboClient {
  private readonly url: string;
  private readonly log: Logger;
  private socket?: WebSocket;
  private onVolumeUpdated?: VolumeTickleCallback;

  constructor({
    host,
    log,
    port = GABBO_DEFAULT_PORT,
  }: {
    host: string;
    log: Logger;
    port?: number;
  }) {
    this.url = `ws://${host}:${port}`;
    this.log = log;
  }

  /** Register a callback that fires on every `volumeUpdated` tickle. */
  onVolume(callback: VolumeTickleCallback): void {
    this.onVolumeUpdated = callback;
  }

  /** Open the WebSocket connection. Resolves once the connection is open. */
  connect(): Promise<void> {
    const ws = new WebSocket(this.url, GABBO_PROTOCOL);
    this.socket = ws;

    ws.addEventListener('message', (event: MessageEvent) => {
      this._handleFrame(String(event.data)).catch((err: unknown) => {
        this.log.error('gabbo frame error', err);
      });
    });

    ws.addEventListener('error', () => {
      this.log.error('gabbo WebSocket error');
    });

    ws.addEventListener('close', () => {
      this.log.debug('gabbo WebSocket closed');
    });

    return new Promise((resolve, reject) => {
      ws.addEventListener('open', () => resolve(), { once: true });
      ws.addEventListener('error', () => reject(new Error('gabbo connection failed')), { once: true });
    });
  }

  /** Close the WebSocket — call on teardown. */
  close(): void {
    this.socket?.close();
    this.socket = undefined;
  }

  private async _handleFrame(xml: string): Promise<void> {
    const notifications = await parseGabboFrame(xml);
    for (const notification of notifications) {
      if (notification.type === 'volume') {
        this.log.debug('gabbo: volumeUpdated tickle received');
        this.onVolumeUpdated?.();
      }
    }
  }
}
