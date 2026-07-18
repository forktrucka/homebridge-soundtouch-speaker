/**
 * Confirms A1-A4/B2/B4-B8-style manual test steps by reading Homebridge's
 * persisted cachedAccessories file directly, instead of opening the Home
 * app: prints each accessory's displayName, context.deviceId, and (for
 * zones) context.memberDeviceIds, and can assert one accessory's
 * displayName equals an expected value.
 *
 * Usage:
 *   node scripts/qa/check-accessory-context.mjs
 *   node scripts/qa/check-accessory-context.mjs --path test/hbConfig/accessories/cachedAccessories
 *   node scripts/qa/check-accessory-context.mjs --expect-name "Kitchen"
 *
 * --path: cachedAccessories file (default test/hbConfig/accessories/cachedAccessories,
 *         matching this repo's local dev setup — see homebridge-developer skill;
 *         for a real Homebridge install this is under api.user.storagePath())
 * --expect-name: if given, exits non-zero unless some accessory's displayName
 *                 matches this exactly (useful to assert a rename took effect)
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const path = args.path ?? 'test/hbConfig/accessories/cachedAccessories';
const expectName = args['expect-name'];

let accessories;
try {
  accessories = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
  console.error(`Could not read/parse ${path}: ${e.message}`);
  process.exit(2);
}

const ours = accessories.filter(
  (a) => a.plugin === 'homebridge-soundtouchspeaker'
);

console.log(`${ours.length} accessory(ies) from this plugin in ${path}:\n`);
for (const a of ours) {
  const ctx = a.context ?? {};
  console.log(`- ${a.displayName}`);
  console.log(`    UUID: ${a.UUID}`);
  if (ctx.deviceId) console.log(`    context.deviceId: ${ctx.deviceId}`);
  if (ctx.memberDeviceIds) {
    console.log(`    context.memberDeviceIds:`);
    for (const [ref, id] of Object.entries(ctx.memberDeviceIds)) {
      console.log(`      "${ref}" -> ${id}`);
    }
  }
}

if (expectName) {
  const match = ours.some((a) => a.displayName === expectName);
  console.log(
    `\n--expect-name "${expectName}": ${match ? 'PASS' : 'FAIL — no accessory with that displayName'}`
  );
  process.exit(match ? 0 : 1);
}
