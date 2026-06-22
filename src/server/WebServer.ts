import * as http from 'node:http';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { fileURLToPath } from 'node:url';

const ICON_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI6QAAAABJRU5ErkJggg==';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.png': 'image/png',
};

const ROUTES: Record<string, string> = {
  '/': 'index.html',
  '/manifest.json': 'manifest.json',
  '/sw.js': 'sw.js',
  '/icon-192.png': 'icon-192.png',
  '/icon-512.png': 'icon-512.png',
};

function resolveWebDir(): string {
  const thisFile = fileURLToPath(import.meta.url);
  // At runtime: dist/server/WebServer.js → go up two levels to dist/, then into web/
  const distDir = path.resolve(path.dirname(thisFile), '..');
  return path.join(distDir, 'web');
}

function detectLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const entry of iface) {
      if (entry.family === 'IPv4' && !entry.internal) {
        return entry.address;
      }
    }
  }
  return '127.0.0.1';
}

export class WebServer {
  private readonly iconBuffer: Buffer;
  private readonly webDir: string;
  private server: http.Server | null = null;

  private constructor(
    private readonly port: number,
    private readonly host: string,
  ) {
    this.iconBuffer = Buffer.from(ICON_PNG_BASE64, 'base64');
    this.webDir = resolveWebDir();
  }

  static create(props: { port: number; host?: string }): WebServer {
    return new WebServer(props.port, props.host ?? '0.0.0.0');
  }

  async listen(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        this.handleRequest(req, res);
      });

      server.on('error', reject);

      server.listen(this.port, this.host, () => {
        this.server = server;
        resolve();
      });
    });
  }

  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }
      this.server.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.server = null;
          resolve();
        }
      });
    });
  }

  get url(): string {
    const ip = this.host === '0.0.0.0' ? detectLocalIp() : this.host;
    return `http://${ip}:${this.port}`;
  }

  private handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
    const pathname = req.url?.split('?')[0] ?? '/';
    const filename = ROUTES[pathname];

    if (!filename) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    // Icons are served from a hardcoded buffer — no disk read needed
    if (filename === 'icon-192.png' || filename === 'icon-512.png') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(this.iconBuffer);
      return;
    }

    const filePath = path.join(this.webDir, filename);
    const ext = path.extname(filename);
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';

    try {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
    }
  }
}
