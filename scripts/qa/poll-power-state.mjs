/**
 * Poll a real speaker's power state until it matches --until, or time out.
 *
 * Confirms A5/A6/A7/A8-style manual test steps (power toggle, resume,
 * "No Response" vs "Off") without eyeballing the Home app — the human still
 * performs the physical action (press the tile, unplug the speaker); this
 * just reports back what the device itself says, fast and unambiguously.
 *
 * Usage:
 *   node scripts/qa/poll-power-state.mjs --ip 10.0.0.22 --until on
 *   node scripts/qa/poll-power-state.mjs --ip 10.0.0.22 --until off --timeout 30
 *   node scripts/qa/poll-power-state.mjs --ip 10.0.0.22 --until unreachable
 *
 * --until: on | off | unreachable
 * --timeout: seconds (default 90)
 * --interval: seconds between polls (default 2)
 *
 * Requires: npm run build (or npm run watch) to have produced dist/.
 */

import { API, isPoweredOn, log, parseArgs, pollUntil, requireArg } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const ip = requireArg(args, 'ip', 'speaker IP address');
const until = requireArg(args, 'until', 'on | off | unreachable');
const timeoutMs = Number(args.timeout ?? 90) * 1000;
const intervalMs = Number(args.interval ?? 2) * 1000;

if (!['on', 'off', 'unreachable'].includes(until)) {
  console.error(`--until must be one of: on, off, unreachable (got "${until}")`);
  process.exit(2);
}

const api = API.create(ip);

async function check() {
  if (until === 'unreachable') {
    try {
      await api.getInfo();
      return false; // still reachable
    } catch {
      return true; // confirmed unreachable
    }
  }
  try {
    const on = await isPoweredOn(api);
    return until === 'on' ? on : !on;
  } catch (e) {
    log(`request failed (${e.message}) — treating as not-yet-confirmed`);
    return false;
  }
}

log(`Polling ${ip} until power is "${until}" (timeout ${timeoutMs / 1000}s)...`);
try {
  await pollUntil(`power=${until}`, check, { intervalMs, timeoutMs });
  console.log('PASS');
  process.exit(0);
} catch (e) {
  console.error('FAIL:', e.message);
  process.exit(1);
}
