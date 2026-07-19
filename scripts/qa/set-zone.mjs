/**
 * Drives a zone's activation/deactivation directly against the primary and
 * slave devices' own APIs — mirrors exactly what
 * SoundTouchZoneOnCharacteristic.setOn does (ensure devices powered,
 * fill-if-idle default source, then setZone/removeZoneSlave), so a real
 * device can be exercised without a HomeKit controller available.
 *
 * This bypasses HomeKit's own onSet wiring entirely — that wiring is
 * already covered by this repo's unit/integration tests. What this proves
 * is whether the *device* behaves correctly when this exact sequence of API
 * calls is issued against it, which is what real-hardware testing uniquely
 * adds. It is NOT a substitute for verifying the HomeKit tile itself
 * reflects the change (a separate, already-unit-tested concern).
 *
 * Usage:
 *   node scripts/qa/set-zone.mjs --activate \
 *     --primary-ip 10.0.0.24 --primary-id 907065C7241A \
 *     --slave-ip 10.0.0.21 --slave-id EC24B89E6FD2
 *
 *   node scripts/qa/set-zone.mjs --activate ... --default-source-slot 1
 *
 *   node scripts/qa/set-zone.mjs --deactivate \
 *     --primary-ip 10.0.0.24 --primary-id 907065C7241A \
 *     --slave-ip 10.0.0.21 --slave-id EC24B89E6FD2
 *
 * --activate / --deactivate: exactly one required
 * --default-source-slot: (activate only) preset slot to fill-if-idle, mirrors
 *   the plugin's _applyDefaultSourceIfIdle — only fires if the primary has
 *   nothing meaningful playing (STANDBY/invalid/no content item)
 * --no-ensure-power: skip the power-on-devices-first step (default: ensures
 *   both devices match the desired power state, holding 300ms per device
 *   that needs it, same as _ensureDevicesPowered)
 *
 * Requires: npm run build (or npm run watch) to have produced dist/.
 */

import { API, isPoweredOn, log, parseArgs, requireArg } from './lib.mjs';
import { KeyValue, SourceStatus } from '../../dist/devices/SoundTouch/api/special-types.js';

const args = parseArgs(process.argv.slice(2));
const activate = !!args.activate;
const deactivate = !!args.deactivate;
if (activate === deactivate) {
  console.error('Specify exactly one of --activate or --deactivate');
  process.exit(2);
}

const primaryIp = requireArg(args, 'primary-ip', "primary speaker's IP");
const primaryId = requireArg(args, 'primary-id', "primary speaker's deviceId");
const slaveIp = requireArg(args, 'slave-ip', "slave speaker's IP");
const slaveId = requireArg(args, 'slave-id', "slave speaker's deviceId");
const defaultSourceSlot = args['default-source-slot']
  ? Number(args['default-source-slot'])
  : undefined;
const ensurePower = args['no-ensure-power'] !== true;

const primaryApi = API.create(primaryIp);
const slaveApi = API.create(slaveIp);

function isPrimaryIdle(nowPlaying) {
  if (!nowPlaying) return true;
  if (
    nowPlaying.source === SourceStatus.standBy ||
    nowPlaying.source === SourceStatus.invalid
  )
    return true;
  if (!nowPlaying.contentItem?.source || !nowPlaying.contentItem?.location)
    return true;
  return false;
}

async function ensureDevicesPowered(desired) {
  for (const [name, api] of [
    ['primary', primaryApi],
    ['slave', slaveApi],
  ]) {
    const isOn = await isPoweredOn(api);
    if (isOn !== desired) {
      log(`${name} is ${isOn ? 'on' : 'off'}, holding POWER for 300ms to reach ${desired ? 'on' : 'off'}...`);
      await api.holdKey(KeyValue.power, 300);
    } else {
      log(`${name} already ${desired ? 'on' : 'off'}`);
    }
  }
}

const zone = {
  master: primaryId,
  senderIpAddress: primaryIp,
  members: [{ deviceId: slaveId, ipAddress: slaveIp }],
};

if (activate) {
  if (ensurePower) {
    log('Ensuring both devices are powered on...');
    await ensureDevicesPowered(true);
  }

  if (defaultSourceSlot !== undefined) {
    log(`Checking if primary is idle (fill-if-empty, slot ${defaultSourceSlot})...`);
    const nowPlaying = await primaryApi.getNowPlaying();
    if (isPrimaryIdle(nowPlaying)) {
      const presets = await primaryApi.getPresets();
      const preset = presets?.find((p) => p.id === defaultSourceSlot);
      if (!preset) {
        log(`WARNING: preset slot ${defaultSourceSlot} is empty on the primary — skipping default source`);
      } else {
        log(`Primary idle — selecting preset slot ${defaultSourceSlot} (${preset.contentItem.itemName ?? 'unnamed'})...`);
        await primaryApi.selectSource(preset.contentItem);
      }
    } else {
      log('Primary is already playing something — not overriding (fill-if-empty rule)');
    }
  }

  log('Calling setZone...');
  await primaryApi.setZone(zone);
  log('Zone activated.');
} else {
  log('Calling removeZoneSlave...');
  await primaryApi.removeZoneSlave(zone);
  if (ensurePower) {
    log('Ensuring both devices are powered off...');
    await ensureDevicesPowered(false);
  }
  log('Zone deactivated.');
}

console.log('DONE');
