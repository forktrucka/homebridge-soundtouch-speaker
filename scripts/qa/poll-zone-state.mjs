/**
 * Poll a zone's membership (via the primary's /getZone) until it matches
 * --until, or time out.
 *
 * Confirms B11/B12/B13-style manual test steps (zone self-correcting off
 * when its primary powers down, reflecting external Bose-app grouping)
 * without eyeballing the Home app tile.
 *
 * Usage:
 *   node scripts/qa/poll-zone-state.mjs --primary 10.0.0.10 --until active
 *   node scripts/qa/poll-zone-state.mjs --primary 10.0.0.10 --until inactive
 *   node scripts/qa/poll-zone-state.mjs --primary 10.0.0.10 --until active --member <slaveDeviceId>
 *
 * --until: active | inactive  (active = getZone() returns a zone with >=1 member)
 * --member: optional deviceId — if given, also requires that member be present
 * --timeout: seconds (default 90)
 * --interval: seconds between polls (default 3)
 *
 * Requires: npm run build (or npm run watch) to have produced dist/.
 */

import { API, log, parseArgs, pollUntil, requireArg } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const primaryIp = requireArg(args, 'primary', "primary speaker's IP address");
const until = requireArg(args, 'until', 'active | inactive');
const member = args.member;
const timeoutMs = Number(args.timeout ?? 90) * 1000;
const intervalMs = Number(args.interval ?? 3) * 1000;

if (!['active', 'inactive'].includes(until)) {
  console.error(`--until must be one of: active, inactive (got "${until}")`);
  process.exit(2);
}

const api = API.create(primaryIp);

async function check() {
  let zone;
  try {
    zone = await api.getZone();
  } catch (e) {
    log(`request failed (${e.message}) — treating as not-yet-confirmed`);
    return false;
  }
  const active = !!zone && zone.members.length > 0;
  if (until === 'inactive') return !active;
  if (!active) return false;
  if (member) {
    const has = zone.members.some((m) => m.deviceId === member);
    if (!has) log(`zone active but member ${member} not present yet`);
    return has;
  }
  return true;
}

log(
  `Polling primary ${primaryIp}'s zone until ${until}${member ? ` (member ${member})` : ''} (timeout ${timeoutMs / 1000}s)...`
);
try {
  await pollUntil(`zone=${until}`, check, { intervalMs, timeoutMs });
  console.log('PASS');
  process.exit(0);
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
