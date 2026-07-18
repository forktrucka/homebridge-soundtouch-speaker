/**
 * Confirms the C1/C2/C3 manual test steps: connects its own independent
 * GabboClient to a speaker (separate from the running plugin instance) and
 * logs connect/disconnect/reconnect timing, so the reconnect-backoff growth
 * and reset can be read off directly instead of grepping Homebridge's log.
 *
 * The human still does the physical action (power-cycle the speaker, pull
 * its network) — this just times what happens afterwards and reports
 * whether the observed delays roughly match the documented backoff
 * (5s -> 10s -> 20s -> ... capped at 300s, reset to 5s after a clean
 * reconnect). Run it, do the physical action, watch it print, Ctrl+C when
 * done (or let --timeout end it).
 *
 * Usage:
 *   node scripts/qa/watch-gabbo-reconnect.mjs --ip 10.0.0.22
 *   node scripts/qa/watch-gabbo-reconnect.mjs --ip 10.0.0.22 --timeout 600
 *
 * --timeout: seconds to run before exiting automatically (default 600 = 10 min)
 *
 * Requires: npm run build (or npm run watch) to have produced dist/.
 */

import { GabboClient, log, parseArgs, requireArg } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const ip = requireArg(args, 'ip', 'speaker IP address');
const timeoutMs = Number(args.timeout ?? 600) * 1000;

const client = GabboClient.create(ip);
const events = []; // { type, at }

function record(type) {
  const at = Date.now();
  events.push({ type, at });
  log(type);
}

client.on('connected', () => record('connected'));
client.on('disconnected', () => record('disconnected'));
client.on('error', () => record('error'));

log(`Connecting to ${ip}:8090 (gabbo)... power-cycle / pull the network now.`);
log(`Watching for up to ${timeoutMs / 1000}s. Ctrl+C to stop early and see the summary.`);
client.connect();

function summarize() {
  console.log('\n--- reconnect timeline ---');
  if (events.length < 2) {
    console.log('Not enough events observed to compute deltas.');
    return;
  }
  let prevDisconnect = null;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.type === 'disconnected' || e.type === 'error') {
      prevDisconnect = e.at;
    } else if (e.type === 'connected' && prevDisconnect !== null) {
      const deltaS = ((e.at - prevDisconnect) / 1000).toFixed(1);
      console.log(`  reconnected after ~${deltaS}s`);
      prevDisconnect = null;
    }
  }
  console.log('(Compare successive gaps against the documented backoff: 5s, 10s, 20s, ... capped at 300s,');
  console.log(' resetting to 5s after a clean reconnect. This script reports timing; you judge the pattern.)');
}

process.on('SIGINT', () => {
  client.disconnect();
  summarize();
  process.exit(0);
});

setTimeout(() => {
  client.disconnect();
  summarize();
  process.exit(0);
}, timeoutMs);
