/**
 * Drives a real speaker's power state directly via its own API — mirrors
 * exactly what SoundTouchSpeakerOnCharacteristic.setOn does (drift-aware:
 * only presses power if the device isn't already in the desired state,
 * holds for 300ms since a bare press is confirmed unreliable on real
 * hardware). Use this to simulate "toggle the speaker's HomeKit tile" when
 * driving a QA walkthrough without a HomeKit controller available.
 *
 * Usage:
 *   node scripts/qa/set-power.mjs --ip 10.0.0.36 --to on
 *   node scripts/qa/set-power.mjs --ip 10.0.0.36 --to off
 *
 * Requires: npm run build (or npm run watch) to have produced dist/.
 */

import { API, isPoweredOn, log, parseArgs, requireArg } from './lib.mjs';
import { KeyValue } from '../../dist/devices/SoundTouch/api/special-types.js';

const args = parseArgs(process.argv.slice(2));
const ip = requireArg(args, 'ip', 'speaker IP address');
const to = requireArg(args, 'to', 'on | off');

if (!['on', 'off'].includes(to)) {
  console.error(`--to must be one of: on, off (got "${to}")`);
  process.exit(2);
}

const api = API.create(ip);
const desired = to === 'on';
const current = await isPoweredOn(api);

if (current === desired) {
  log(`${ip} already ${to} — no action taken (matches plugin's drift-aware behavior)`);
} else {
  log(`${ip} is ${current ? 'on' : 'off'}, holding POWER for 300ms to reach ${to}...`);
  await api.holdKey(KeyValue.power, 300);
  log(`Sent. Confirm with poll-power-state.mjs if you need to wait for it to settle.`);
}

console.log('DONE');
