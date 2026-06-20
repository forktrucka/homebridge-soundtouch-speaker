import { WebSocketServer, type WebSocket } from 'ws';
import type { AddressInfo } from 'node:net';
import type { IncomingMessage } from 'node:http';

/**
 * An in-process stand-in for a SoundTouch speaker's `gabbo` notification
 * WebSocket (normally port 8080). Node ships a global `WebSocket` *client*, but
 * no server, so the harness needs `ws` (a devDependency) to accept connections
 * and push `<updates>` frames.
 *
 * The server only accepts the `gabbo` sub-protocol — a client that fails to
 * request it is rejected, which is exactly the handshake behaviour Spike C
 * needs to validate. Tests drive it with `push()` to emit a frame to every
 * connected client.
 */
export class FakeGabboServer {
  private server?: WebSocketServer;
  private readonly sockets = new Set<WebSocket>();

  /** The sub-protocol each connection negotiated, in connection order. */
  readonly negotiatedProtocols: string[] = [];

  start(): Promise<number> {
    const server = new WebSocketServer({
      host: '127.0.0.1',
      port: 0,
      // Reject the upgrade outright unless the client offered `gabbo`...
      verifyClient: (info: { req: IncomingMessage }) =>
        String(info.req.headers['sec-websocket-protocol'] ?? '')
          .split(',')
          .map((protocol) => protocol.trim())
          .includes('gabbo'),
      // ...then echo `gabbo` back as the negotiated sub-protocol.
      handleProtocols: (protocols) => (protocols.has('gabbo') ? 'gabbo' : false),
    });
    this.server = server;

    server.on('connection', (socket) => {
      this.sockets.add(socket);
      this.negotiatedProtocols.push(socket.protocol);
      socket.on('close', () => this.sockets.delete(socket));
    });

    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.once('listening', () => {
        resolve((server.address() as AddressInfo).port);
      });
    });
  }

  /** Push a raw frame (e.g. an `<updates>` XML string) to every client. */
  push(frame: string): void {
    for (const socket of this.sockets) {
      socket.send(frame);
    }
  }

  get connectionCount(): number {
    return this.sockets.size;
  }

  stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server) {
      return Promise.resolve();
    }
    for (const socket of this.sockets) {
      socket.terminate();
    }
    this.sockets.clear();
    return new Promise((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
}
