/**
 * Confirms a Homebridge instance under QA test isn't runaway-looping —
 * catches exactly the class of bug a functional test can miss (a step
 * "passes" because the feature works, while quietly hammering a device or
 * pegging CPU in the background). Run this after every restart, before
 * moving on to that wave's verification steps.
 *
 * Checks two independent signals:
 *   1. Sustained CPU% on the `homebridge` process, sampled twice a few
 *      seconds apart (a single high sample can just be normal startup
 *      work; sustained high CPU across both samples is the runaway-loop
 *      signature).
 *   2. Node runtime warnings in the log (TimeoutOverflowWarning,
 *      MaxListenersExceededWarning, UnhandledPromiseRejectionWarning,
 *      DeprecationWarning) — these often show up before a resource issue
 *      is otherwise visible. This is exactly how the #145 preset-sync
 *      tight-loop was first noticed.
 *
 * Usage:
 *   node scripts/qa/check-process-health.mjs --log /tmp/homebridge-watch.log
 *   node scripts/qa/check-process-health.mjs --log /tmp/homebridge-watch.log --cpu-threshold 20 --interval 5
 *
 * --log: path to the Homebridge stdout/stderr log being tailed (required)
 * --cpu-threshold: %CPU considered suspicious if sustained across both
 *                   samples (default 20)
 * --interval: seconds between the two CPU samples (default 5)
 *
 * Exit 0 + PASS if healthy, exit 1 + FAIL if either signal looks wrong —
 * treat a FAIL exactly like any other failed manual-test step (stop, don't
 * silently continue).
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { log, parseArgs, requireArg } from './lib.mjs';

const args = parseArgs(process.argv.slice(2));
const logPath = requireArg(args, 'log', 'path to the Homebridge log file being tailed');
const cpuThreshold = Number(args['cpu-threshold'] ?? 20);
const intervalMs = Number(args.interval ?? 5) * 1000;

function sampleCpu() {
  let pid;
  try {
    // pgrep -x matches the exact command name, sidestepping ps's fragile
    // column-alignment/trailing-whitespace quoting when piped through grep.
    pid = execSync('pgrep -x homebridge', { encoding: 'utf8' })
      .trim()
      .split('\n')[0];
  } catch {
    return null; // no matching process
  }
  if (!pid) return null;
  try {
    const out = execSync(`ps -p ${pid} -o pcpu=`, { encoding: 'utf8' }).trim();
    return { pid, cpu: Number(out) };
  } catch {
    return null; // process disappeared between pgrep and ps
  }
}

const first = sampleCpu();
if (!first) {
  console.error(
    'No running `homebridge` process found — is it actually up? (checked via `pgrep -x homebridge`)'
  );
  process.exit(1);
}
log(`Sample 1: PID ${first.pid}, ${first.cpu}% CPU`);

log(`Waiting ${intervalMs / 1000}s for a second sample...`);
await new Promise((r) => setTimeout(r, intervalMs));

const second = sampleCpu();
if (!second) {
  console.error('Process disappeared between samples — it may have crashed.');
  process.exit(1);
}
log(`Sample 2: PID ${second.pid}, ${second.cpu}% CPU`);

let failed = false;

if (first.cpu >= cpuThreshold && second.cpu >= cpuThreshold) {
  console.error(
    `FAIL: sustained CPU >= ${cpuThreshold}% across both samples (${first.cpu}%, ${second.cpu}%) — looks like a runaway loop, not normal activity.`
  );
  failed = true;
} else {
  log(`CPU looks normal (threshold ${cpuThreshold}%).`);
}

let logTail = '';
try {
  const content = readFileSync(logPath, 'utf8');
  logTail = content.slice(-200_000); // last ~200KB, avoid loading huge logs
} catch (e) {
  console.error(`Could not read log at ${logPath}: ${e.message}`);
  process.exit(2);
}

const warningPatterns = [
  'TimeoutOverflowWarning',
  'MaxListenersExceededWarning',
  'UnhandledPromiseRejectionWarning',
  'DeprecationWarning',
];

for (const pattern of warningPatterns) {
  const count = (logTail.match(new RegExp(pattern, 'g')) ?? []).length;
  if (count > 0) {
    console.error(`FAIL: ${count}x "${pattern}" found in the log tail.`);
    failed = true;
  } else {
    log(`No "${pattern}" in the log tail.`);
  }
}

console.log(failed ? 'FAIL' : 'PASS');
process.exit(failed ? 1 : 0);
