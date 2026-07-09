import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { AxiosInstance } from 'axios';
import { request as httpRequest } from 'node:http';
import { BoseCloudServer } from '../BoseCloudServer.js';

// `fetch` resolves `..` path segments client-side before the request is sent,
// so it can't exercise the server's own defense against a raw traversal
// string reaching the route handler. Use a raw request with the literal path.
function rawGet(port: number, rawPath: string): Promise<{ status: number }> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path: rawPath, method: 'GET' },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
      }
    );
    req.on('error', reject);
    req.end();
  });
}

function mockLogger() {
  return {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    success: jest.fn(),
  } as unknown as import('../../utils/FormattedLogger.js').Logger;
}

function mockAxios(tuneResp: object, descResp?: object) {
  return {
    get: jest
      .fn()
      .mockResolvedValueOnce({ data: tuneResp })
      .mockResolvedValueOnce({ data: descResp ?? {} }),
  } as unknown as AxiosInstance;
}

describe('BoseCloudServer', () => {
  let server: BoseCloudServer;
  let port: number;

  beforeAll(async () => {
    server = BoseCloudServer.create({
      host: 'localhost',
      port: 0,
      logger: mockLogger(),
    });
    await server.start();
    port = server.address()!.port;
  });

  afterAll(async () => {
    await server.stop();
  });

  describe('#start', () => {
    it('is idempotent when called twice', async () => {
      await expect(server.start()).resolves.toBeUndefined();
    });
  });

  describe('#stop', () => {
    it('is a no-op when the server was never started', async () => {
      const idle = BoseCloudServer.create({
        host: 'localhost',
        port: 0,
        logger: mockLogger(),
      });
      await expect(idle.stop()).resolves.toBeUndefined();
    });
  });

  describe('#address', () => {
    it('returns undefined before start', () => {
      const idle = BoseCloudServer.create({
        host: 'localhost',
        port: 0,
        logger: mockLogger(),
      });
      expect(idle.address()).toBeUndefined();
    });

    it('returns the actual listening port after start', () => {
      expect(server.address()?.port).toBeGreaterThan(0);
    });
  });

  describe('GET /bmx/registry/v1/services', () => {
    it('returns 200 JSON with a TUNEIN bmx_service entry', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/bmx/registry/v1/services`);

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/json');

      const json = (await res.json()) as { bmx_services: Array<{ id: { name: string } }> };
      expect(json.bmx_services).toHaveLength(1);
      expect(json.bmx_services[0].id.name).toBe('TUNEIN');
    });

    it('includes the configured host in baseUrl', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/bmx/registry/v1/services`);
      const json = (await res.json()) as { bmx_services: Array<{ baseUrl: string }> };
      expect(json.bmx_services[0].baseUrl).toContain('localhost');
    });
  });

  describe('GET /marge/streaming/sourceproviders', () => {
    it('returns 200 XML containing TUNEIN', async () => {
      const res = await fetch(
        `http://127.0.0.1:${port}/marge/streaming/sourceproviders`
      );

      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('application/xml');

      const body = await res.text();
      expect(body).toContain('<name>TUNEIN</name>');
    });
  });

  describe('GET /bmx/tunein/v1/playback/station/:id', () => {
    it('resolves a station via RadioTime and returns the payload', async () => {
      const ax = mockAxios(
        { body: [{ url: 'http://stream.example.com/live' }] },
        { body: [{ name: 'Example FM', logo: 'http://img.example.com/logo.png' }] }
      );
      const s = BoseCloudServer.create({
        host: 'localhost',
        port: 0,
        logger: mockLogger(),
        axiosInstance: ax,
      });
      await s.start();
      const p = s.address()!.port;

      const res = await fetch(
        `http://127.0.0.1:${p}/bmx/tunein/v1/playback/station/s7162`
      );
      expect(res.status).toBe(200);

      const json = (await res.json()) as {
        audio: { streamUrl: string };
        name: string;
        imageUrl: string;
      };
      expect(json.audio.streamUrl).toBe('http://stream.example.com/live');
      expect(json.name).toBe('Example FM');
      expect(json.imageUrl).toBe('http://img.example.com/logo.png');

      await s.stop();
    });

    it('returns 400 and never calls axios when the id has an injected query param', async () => {
      const ax = mockAxios({});
      const s = BoseCloudServer.create({
        host: 'localhost',
        port: 0,
        logger: mockLogger(),
        axiosInstance: ax,
      });
      await s.start();
      const p = s.address()!.port;

      const res = await fetch(
        `http://127.0.0.1:${p}/bmx/tunein/v1/playback/station/123&render=xml`
      );
      expect(res.status).toBe(400);
      expect((ax.get as jest.Mock).mock.calls).toHaveLength(0);

      await s.stop();
    });

    it('returns 400 for an id containing path traversal segments', async () => {
      const ax = mockAxios({});
      const s = BoseCloudServer.create({
        host: 'localhost',
        port: 0,
        logger: mockLogger(),
        axiosInstance: ax,
      });
      await s.start();
      const p = s.address()!.port;

      const res = await rawGet(
        p,
        '/bmx/tunein/v1/playback/station/../../etc'
      );
      expect(res.status).toBe(400);
      expect((ax.get as jest.Mock).mock.calls).toHaveLength(0);

      await s.stop();
    });

    it('encodes the id in the outbound RadioTime URL for a valid id', async () => {
      const ax = mockAxios(
        { body: [{ url: 'http://stream.example.com/live' }] },
        { body: [{ name: 'Example FM', logo: 'http://img.example.com/logo.png' }] }
      );
      const s = BoseCloudServer.create({
        host: 'localhost',
        port: 0,
        logger: mockLogger(),
        axiosInstance: ax,
      });
      await s.start();
      const p = s.address()!.port;

      const res = await fetch(
        `http://127.0.0.1:${p}/bmx/tunein/v1/playback/station/s24939`
      );
      expect(res.status).toBe(200);

      const [tuneUrl] = (ax.get as jest.Mock).mock.calls[0] as [string];
      expect(tuneUrl).toContain(`id=${encodeURIComponent('s24939')}`);

      const json = (await res.json()) as { name: string };
      expect(json.name).toBe('Example FM');

      await s.stop();
    });

    it('returns 502 when RadioTime fails', async () => {
      const ax = {
        get: jest.fn().mockRejectedValue(new Error('network error')),
      } as unknown as AxiosInstance;
      const s = BoseCloudServer.create({
        host: 'localhost',
        port: 0,
        logger: mockLogger(),
        axiosInstance: ax,
      });
      await s.start();
      const p = s.address()!.port;

      const res = await fetch(
        `http://127.0.0.1:${p}/bmx/tunein/v1/playback/station/s0`
      );
      expect(res.status).toBe(502);

      await s.stop();
    });
  });

  describe('unknown routes', () => {
    it('returns 200 empty JSON stub', async () => {
      const res = await fetch(`http://127.0.0.1:${port}/some/unknown/path`);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({});
    });
  });
});
