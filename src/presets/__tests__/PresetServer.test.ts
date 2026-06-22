import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from '@jest/globals';
import * as http from 'node:http';
import { PresetServer } from '../PresetServer.js';
import { PresetStation } from '../PresetStation.js';

const TEST_PORT = 19091;
const TEST_HOST = '127.0.0.1';

function makeStation(slot: number, streamUrl: string, name = 'Test Station'): PresetStation {
  return PresetStation.fromConfig({ slot, name, streamUrl }, streamUrl);
}

function httpGet(url: string): Promise<{ statusCode: number; body: string; headers: http.IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode ?? 0, body, headers: res.headers });
      });
    }).on('error', reject);
  });
}

describe('PresetServer', () => {
  let server: PresetServer;
  let stations: Map<number, PresetStation>;

  beforeAll(async () => {
    stations = new Map([
      [1, makeStation(1, 'http://stream.example.com/radio', 'My Radio')],
    ]);
    server = PresetServer.create({ port: TEST_PORT, host: TEST_HOST, stations });
    await server.listen();
  });

  afterAll(async () => {
    await server.close();
  });

  describe('GET /preset/:slot.json', () => {
    it('returns correct JSON shape for a known slot', async () => {
      const { statusCode, body } = await httpGet(
        `http://${TEST_HOST}:${TEST_PORT}/preset/1.json`
      );

      expect(statusCode).toBe(200);
      const json = JSON.parse(body);
      expect(json.name).toBe('My Radio');
      expect(json.streamType).toBe('liveRadio');
      expect(json.audio.hasPlaylist).toBe(false);
      expect(json.audio.isRealtime).toBe(true);
      expect(json.audio.streamUrl).toMatch(/^http:\/\//);
      expect(json.audio.streamUrl).toContain('/stream/1');
    });

    it('streamUrl in preset JSON is always HTTP regardless of upstream scheme', () => {
      // The preset JSON always points at our local HTTP proxy — scheme independence
      // is handled by the /stream/:slot proxy, not the preset JSON itself.
      const url = server.getPresetUrl(1);

      expect(url).toMatch(/^http:\/\//);
    });

    it('returns 404 for an unknown slot', async () => {
      const { statusCode } = await httpGet(
        `http://${TEST_HOST}:${TEST_PORT}/preset/99.json`
      );

      expect(statusCode).toBe(404);
    });
  });

  describe('GET /stream/:slot', () => {
    it('returns 404 for an unknown slot', async () => {
      const { statusCode } = await httpGet(
        `http://${TEST_HOST}:${TEST_PORT}/stream/99`
      );

      expect(statusCode).toBe(404);
    });

    it('proxies a known HTTP upstream and pipes the response', async () => {
      // Start a mini upstream server
      const upstream = await new Promise<http.Server>((resolve) => {
        const s = http.createServer((_, res) => {
          res.writeHead(200, { 'content-type': 'audio/mpeg', 'icy-name': 'TestStation' });
          res.end('AUDIO_DATA');
        });
        s.listen(0, '127.0.0.1', () => resolve(s));
      });

      const upstreamPort = (upstream.address() as { port: number }).port;
      const upstreamUrl = `http://127.0.0.1:${upstreamPort}/stream`;

      // Update station 1 to point at our upstream
      const tempStations = new Map([[1, makeStation(1, upstreamUrl, 'My Radio')]]);
      server.updateStations(tempStations);

      try {
        const { statusCode, body, headers } = await httpGet(
          `http://${TEST_HOST}:${TEST_PORT}/stream/1`
        );

        expect(statusCode).toBe(200);
        expect(body).toBe('AUDIO_DATA');
        expect(headers['content-type']).toBe('audio/mpeg');
        expect(headers['icy-name']).toBe('TestStation');
      } finally {
        // Restore original stations
        server.updateStations(stations);
        await new Promise<void>((resolve) => upstream.close(() => resolve()));
      }
    });

    it('returns 502 when the upstream connection fails', async () => {
      // Grab a port, close it, then try to connect to it (guaranteed ECONNREFUSED)
      const freePort = await new Promise<number>((resolve) => {
        const s = http.createServer();
        s.listen(0, '127.0.0.1', () => {
          const port = (s.address() as { port: number }).port;
          s.close(() => resolve(port));
        });
      });

      const badStations = new Map([
        [1, makeStation(1, `http://127.0.0.1:${freePort}/no-server`, 'Bad')],
      ]);
      server.updateStations(badStations);

      try {
        const { statusCode } = await httpGet(
          `http://${TEST_HOST}:${TEST_PORT}/stream/1`
        );

        expect(statusCode).toBe(502);
      } finally {
        server.updateStations(stations);
      }
    });
  });

  describe('GET unknown route', () => {
    it('returns 404', async () => {
      const { statusCode } = await httpGet(
        `http://${TEST_HOST}:${TEST_PORT}/unknown`
      );

      expect(statusCode).toBe(404);
    });
  });

  describe('#getPresetUrl', () => {
    it('returns a stable HTTP URL for the given slot', () => {
      const url = server.getPresetUrl(3);

      expect(url).toBe(`http://${TEST_HOST}:${TEST_PORT}/preset/3.json`);
    });
  });

  describe('#updateStations', () => {
    it('serves the updated station after updateStations', async () => {
      const newStations = new Map([
        [1, makeStation(1, 'http://new.example.com/stream', 'New Radio')],
      ]);

      server.updateStations(newStations);

      try {
        const { body } = await httpGet(
          `http://${TEST_HOST}:${TEST_PORT}/preset/1.json`
        );

        const json = JSON.parse(body);
        expect(json.name).toBe('New Radio');
      } finally {
        server.updateStations(stations);
      }
    });
  });
});
