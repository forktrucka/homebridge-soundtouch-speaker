/**
 * Confirms the D1 manual test step: BoseCloudServer's TuneIn station
 * resolution endpoint accepts a valid station id and rejects a malformed
 * one with 400. Requires `server.enabled: true` in the plugin config and
 * the plugin actually running (npm run watch or a live Homebridge instance).
 *
 * Usage:
 *   node scripts/qa/check-tunein-station.mjs --host localhost --port 8000 --valid-id s24939
 *
 * --host: BoseCloudServer host (default localhost)
 * --port: BoseCloudServer port (default 8000, matches config.schema.json default)
 * --valid-id: a real TuneIn station id known to resolve (required)
 */

import { log, parseArgs, requireArg } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const host = args.host ?? 'localhost';
const port = Number(args.port ?? 8000);
const validId = requireArg(args, 'valid-id', 'a real TuneIn station id, e.g. s24939');
const base = `http://${host}:${port}/bmx/tunein/v1/playback/station`;

let failed = false;

log(`Checking valid station id "${validId}" against ${base}/${validId} ...`);
try {
  const res = await fetch(`${base}/${encodeURIComponent(validId)}`);
  if (res.status === 200) {
    log(`valid id: PASS (200)`);
  } else {
    log(`valid id: FAIL — expected 200, got ${res.status}`);
    failed = true;
  }
} catch (e) {
  log(`valid id: FAIL — request errored (${e.message})`);
  failed = true;
}

const malformedCases = [
  ['query-param injection', `123&render=xml`],
  ['path traversal', `../../etc`],
];

for (const [name, malformedId] of malformedCases) {
  log(`Checking malformed id (${name}): "${malformedId}" ...`);
  try {
    const res = await fetch(`${base}/${malformedId}`, { redirect: 'manual' });
    if (res.status === 400) {
      log(`${name}: PASS (400)`);
    } else {
      log(`${name}: FAIL — expected 400, got ${res.status}`);
      failed = true;
    }
  } catch (e) {
    log(`${name}: FAIL — request errored (${e.message})`);
    failed = true;
  }
}

console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
