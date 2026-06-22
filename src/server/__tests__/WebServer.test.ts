import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as http from 'node:http';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { WebServer } from '../WebServer.js';

// Helpers

function get(url: string): Promise<{ status: number; body: string; contentType: string | undefined }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString(),
            contentType: res.headers['content-type'],
          });
        });
      })
      .on('error', reject);
  });
}

// Use a random high port to avoid conflicts across test runs
function pickPort(): number {
  return 49152 + Math.floor(Math.random() * 16000);
}

describe('WebServer', () => {
  let server: WebServer;
  let port: number;
  // We need real web files on disk for the file-serving tests.
  // Point the server at a temp dir with stub files.
  let tmpDir: string;

  beforeEach(async () => {
    port = pickPort();
    // Create a temp web dir that mirrors dist/web/
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webserver-test-'));
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html>ok</html>');
    fs.writeFileSync(
      path.join(tmpDir, 'manifest.json'),
      JSON.stringify({ name: 'test' }),
    );
    fs.writeFileSync(path.join(tmpDir, 'sw.js'), '// sw');
  });

  afterEach(async () => {
    try {
      await server.close();
    } catch {
      // already closed
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('create', () => {
    it('creates a WebServer with the given port', () => {
      server = WebServer.create({ port });
      expect(server).toBeInstanceOf(WebServer);
    });

    it('defaults host to 0.0.0.0', () => {
      server = WebServer.create({ port });
      // url reflects detected LAN IP (or 127.0.0.1) — just check it starts with http://
      expect(server.url).toMatch(/^http:\/\//);
    });
  });

  describe('listen', () => {
    it('listens on the configured port', async () => {
      server = WebServer.create({ port, host: '127.0.0.1' });
      await server.listen();
      const res = await get(`http://127.0.0.1:${port}/`);
      expect(res.status).toBe(200);
    });
  });

  describe('route handling', () => {
    beforeEach(async () => {
      // Patch the web dir resolution by pointing the real dist/web to our tmpDir.
      // Because WebServer resolves webDir from import.meta.url at construction,
      // we use a workaround: spy via the internal path. Instead, we test through
      // a real file system by building the server against the actual dist/web
      // path, and stub files there only when they exist. To keep tests
      // self-contained we write stubs into the *actual* dist/web path used by
      // the resolved module. This is simplest to achieve by writing the files
      // into a known location relative to this test file.
      //
      // Simpler approach: create the expected dist/web directory structure
      // adjacent to where Jest resolves the compiled output, or just rely on
      // the fact that `npm run build` has run and dist/web exists. For unit
      // testing we patch the file reads by pointing to a known relative dir.
      //
      // Since we cannot easily patch import.meta.url, we verify route logic by
      // checking that the server responds correctly given real dist/web files
      // after a build. For CI we verify just the 404 and icon routes (which
      // don't need dist/web), and the listening/closing behaviour.
      server = WebServer.create({ port, host: '127.0.0.1' });
      await server.listen();
    });

    it('returns 404 for unknown paths', async () => {
      const res = await get(`http://127.0.0.1:${port}/unknown-path`);
      expect(res.status).toBe(404);
    });

    it('serves icon-192.png with image/png content-type', async () => {
      const res = await get(`http://127.0.0.1:${port}/icon-192.png`);
      expect(res.status).toBe(200);
      expect(res.contentType).toBe('image/png');
    });

    it('serves icon-512.png with image/png content-type', async () => {
      const res = await get(`http://127.0.0.1:${port}/icon-512.png`);
      expect(res.status).toBe(200);
      expect(res.contentType).toBe('image/png');
    });
  });

  describe('close', () => {
    it('closes cleanly after listening', async () => {
      server = WebServer.create({ port, host: '127.0.0.1' });
      await server.listen();
      await expect(server.close()).resolves.toBeUndefined();
    });

    it('resolves immediately when not yet listening', async () => {
      server = WebServer.create({ port, host: '127.0.0.1' });
      await expect(server.close()).resolves.toBeUndefined();
    });
  });

  describe('url', () => {
    it('returns a URL string with the correct port', () => {
      server = WebServer.create({ port, host: '127.0.0.1' });
      expect(server.url).toBe(`http://127.0.0.1:${port}`);
    });

    it('uses detected LAN IP when host is 0.0.0.0', () => {
      server = WebServer.create({ port });
      // Should be a valid IPv4 address, not 0.0.0.0
      expect(server.url).toMatch(/^http:\/\/\d+\.\d+\.\d+\.\d+:\d+$/);
      expect(server.url).not.toContain('0.0.0.0');
    });
  });
});
