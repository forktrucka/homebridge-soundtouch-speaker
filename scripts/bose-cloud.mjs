/**
 * Minimal Bose cloud emulator.
 *
 * Serves the endpoints a SoundTouch speaker needs on boot to activate TUNEIN:
 *
 *   GET /bmx/registry/v1/services          — BMX service registry
 *   GET /marge/streaming/sourceproviders    — marge source provider list
 *   GET /bmx/tunein/v1/playback/station/:id — resolve TuneIn station to stream URL
 *
 * All other requests return 200 stubs so the speaker doesn't error out.
 *
 * Speaker config (SoundTouchSdkPrivateCfg.xml):
 *   bmxRegistryUrl  → http://<HOST>:8000/bmx/registry/v1/services
 *   margeServerUrl  → http://<HOST>:8000/marge
 *
 * Usage:
 *   node scripts/bose-cloud.mjs
 */

import { createServer as createHttpServer } from 'node:http';
import { get as httpsGet } from 'node:https';
import { get as httpGet } from 'node:http';

const HTTP_PORT = 8000;
const HOST = process.env.HOST ?? '10.0.0.94';
const BASE_URL = `http://${HOST}:${HTTP_PORT}`;

const BMX_SERVICES = {
  _links: { bmx_services_availability: { href: '../servicesAvailability' } },
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
          largeSvg: `${BASE_URL}/media/tunein-smallSvg.svg`,
          smallSvg: `${BASE_URL}/media/tunein-smallSvg.svg`,
          monochromePng: `${BASE_URL}/media/tunein-monochromePng.png`,
          monochromeSvg: `${BASE_URL}/media/tunein-monochromeSvg.svg`,
          defaultAlbumArt: `${BASE_URL}/media/tunein-default-album-art.png`,
        },
        name: 'TuneIn',
      },
      authenticationModel: { anonymousAccount: { autoCreate: true, enabled: true } },
      baseUrl: `${BASE_URL}/bmx/tunein`,
      id: { name: 'TUNEIN', value: 25 },
      streamTypes: ['liveRadio', 'onDemand'],
    },
  ],
};

// Static source provider list — tells the speaker which source types exist.
// The speaker needs TUNEIN (id 25) present to activate TUNEIN presets.
const SOURCE_PROVIDERS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sourceProviders>
<sourceprovider id="1"><createdOn>2012-09-19T12:43:00.000+00:00</createdOn><name>PANDORA</name><updatedOn>2012-09-19T12:43:00.000+00:00</updatedOn></sourceprovider>
<sourceprovider id="2"><createdOn>2012-09-19T12:43:00.000+00:00</createdOn><name>INTERNET_RADIO</name><updatedOn>2012-09-19T12:43:00.000+00:00</updatedOn></sourceprovider>
<sourceprovider id="9"><createdOn>2012-09-19T12:43:00.000+00:00</createdOn><name>AUX</name><updatedOn>2012-09-19T12:43:00.000+00:00</updatedOn></sourceprovider>
<sourceprovider id="11"><createdOn>2012-09-19T12:43:00.000+00:00</createdOn><name>LOCAL_INTERNET_RADIO</name><updatedOn>2012-09-19T12:43:00.000+00:00</updatedOn></sourceprovider>
<sourceprovider id="15"><createdOn>2012-09-19T12:43:00.000+00:00</createdOn><name>SPOTIFY</name><updatedOn>2012-09-19T12:43:00.000+00:00</updatedOn></sourceprovider>
<sourceprovider id="25"><createdOn>2012-09-19T12:43:00.000+00:00</createdOn><name>TUNEIN</name><updatedOn>2012-09-19T12:43:00.000+00:00</updatedOn></sourceprovider>
<sourceprovider id="34"><createdOn>2012-09-19T12:43:00.000+00:00</createdOn><name>ALEXA</name><updatedOn>2012-09-19T12:43:00.000+00:00</updatedOn></sourceprovider>
</sourceProviders>`;

function fetch(url) {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('https') ? httpsGet : httpGet;
    transport(url, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function resolveTuneIn(stationId) {
  const streamResp = await fetch(
    `http://opml.radiotime.com/Tune.ashx?id=${stationId}&formats=mp3,aac,ogg&render=json`
  );
  const streamJson = JSON.parse(streamResp);
  const streamUrl = streamJson?.body?.[0]?.url ?? '';

  let name = stationId;
  let imageUrl = '';
  try {
    const descResp = await fetch(
      `https://opml.radiotime.com/describe.ashx?id=${stationId}&render=json`
    );
    const descJson = JSON.parse(descResp);
    name = descJson?.body?.[0]?.name ?? stationId;
    imageUrl = descJson?.body?.[0]?.logo ?? '';
  } catch (_) { /* name/image are cosmetic */ }

  const reporting = `/v1/report?stream_id=e3342&guide_id=${stationId}&listen_id=3432432423&stream_type=liveRadio`;
  return {
    links: {
      bmx_favorite: { href: `/v1/favorite/${stationId}` },
      bmx_nowplaying: { href: `/v1/now-playing/station/${stationId}`, useInternalClient: 'ALWAYS' },
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

async function handler(req, res) {
  const url = req.url?.split('?')[0] ?? '/';
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);

  if (req.method === 'GET' && url === '/bmx/registry/v1/services') {
    const body = JSON.stringify(BMX_SERVICES);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    return res.end(body);
  }

  if (req.method === 'GET' && url === '/marge/streaming/sourceproviders') {
    const body = SOURCE_PROVIDERS_XML;
    res.writeHead(200, { 'Content-Type': 'application/xml', 'Content-Length': Buffer.byteLength(body) });
    return res.end(body);
  }

  const tuneInMatch = url.match(/^\/bmx\/tunein\/v1\/playback\/station\/(.+)$/);
  if (req.method === 'GET' && tuneInMatch) {
    try {
      const payload = await resolveTuneIn(tuneInMatch[1]);
      const body = JSON.stringify(payload);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
      return res.end(body);
    } catch (err) {
      console.error('TuneIn resolve error:', err.message);
      res.writeHead(502);
      return res.end('Bad Gateway');
    }
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end('{}');
}

createHttpServer(handler).listen(HTTP_PORT, () => {
  console.log(`Listening on http://${HOST}:${HTTP_PORT}`);
  console.log(`  bmxRegistryUrl  → ${BASE_URL}/bmx/registry/v1/services`);
  console.log(`  margeServerUrl  → ${BASE_URL}/marge`);
});