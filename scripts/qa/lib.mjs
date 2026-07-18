/**
 * Shared helpers for the scripts/qa/*.mjs QA-support scripts.
 *
 * These import the plugin's own compiled API/GabboClient classes from
 * dist/, so they need `npm run build` (or `npm run watch`, which builds on
 * every save) to have run at least once. They talk directly to a real
 * speaker over the network — nothing here touches Homebridge itself.
 */

import { API } from '../../dist/devices/SoundTouch/api/api.js';
import { GabboClient } from '../../dist/devices/SoundTouch/api/GabboClient.js';

export { API, GabboClient };

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

export function requireArg(args, name, hint) {
  const value = args[name];
  if (value === undefined || value === true) {
    console.error(`Missing required --${name}${hint ? ` (${hint})` : ''}`);
    process.exit(2);
  }
  return value;
}

export function timestamp() {
  return new Date().toISOString().split('T')[1].replace('Z', '');
}

export function log(...parts) {
  console.log(`[${timestamp()}]`, ...parts);
}

/** Mirrors SoundTouchDevice.deviceIsOn's source-status interpretation. */
export async function isPoweredOn(api) {
  const source = await api.getSource();
  if (!source) return false;
  return source !== 'STANDBY';
}

/**
 * Poll `check()` every `intervalMs` until it returns a truthy value or
 * `timeoutMs` elapses. Logs each poll. Returns the truthy result, or
 * throws on timeout.
 */
export async function pollUntil(
  description,
  check,
  { intervalMs = 2000, timeoutMs = 90000 } = {}
) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt++;
    const result = await check();
    if (result) {
      log(`${description}: confirmed after ${attempt} poll(s)`);
      return result;
    }
    log(`${description}: not yet (poll ${attempt})`);
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `${description}: timed out after ${timeoutMs}ms (${attempt} polls)`
  );
}
