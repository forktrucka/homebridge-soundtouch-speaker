---
date: 2026-07-18
target: dev → beta
prs: [170, 167, 166, 165, 163, 162, 161, 147, 146, 145, 144, 134]
status: blocked # in-progress | complete | blocked
---

# Pre-release test plan — 2026-07-18

Covers every PR merged to `dev` since the last beta promotion (#133,
2026-06-25) — this is the first QA pass run against this backlog, hence its
size. 12 feat/fix PRs; docs/chore-only PRs in the same range are excluded
(nothing to manually verify there).

## Real-device findings (2026-07-19 session)

### ✅ RESOLVED — #145: `PresetManager._scheduleNext` runaway loop on long cron intervals

Confirmed on real hardware during D2 (`presetSyncSchedule: "30 3 15 * *"`, ~27
days out). `src/presets/PresetManager.ts:81-85` passes the raw
`_msUntilNextCron()` result straight into `setTimeout(cb, ms)` with no
clamping. Node's `setTimeout` silently clamps any `ms` over `2147483647`
(~24.8 days) down to firing in ~1ms (`TimeoutOverflowWarning`, confirmed in
logs). Since `_scheduleNext`'s callback calls `sync()` and then immediately
re-schedules itself, and the recomputed delay is still ~27 days (still over
the clamp threshold), this becomes an **infinite tight retry loop**: 7,352+
sync attempts against the real Garage speaker's API in under 3 minutes, 47%
sustained CPU, before being killed. This is a genuine resource-exhaustion bug
that hammers real Bose hardware indefinitely — not a test artifact.

**Directly enabled by #145 itself**: before #145, only minute/hour cron
fields were honored, so a computed delay could never exceed ~24 hours,
staying well under the clamp threshold. #145's whole point was to support
day-of-month/month patterns — which routinely produce delays over ~25 days,
i.e. #145 makes this bug newly and easily reachable via completely normal
config (e.g. "sync on the 1st of each month").

**Fixed 2026-07-19 via #176** (`fix: prevent preset-sync scheduler from
silently tight-looping on long cron delays`) — `_scheduleNext` now chains
`setTimeout` hops toward a captured target timestamp, each capped at the safe
32-bit max; only the hop that actually reaches the target calls `sync()`.
Includes a fake-timer regression test proving it doesn't fire early on a
30-day schedule. Re-verified on real hardware post-merge: restarted
Homebridge with the same `presetSyncSchedule: "30 3 15 * *"` config that
triggered the original bug, confirmed exactly **one** "Pushing slot" sync
(the legitimate startup sync), **zero** `TimeoutOverflowWarning`s, and 0% CPU
after 27+ seconds where the old code had already produced 7,000+ requests by
this point. Unblocking the QA pass.

### ✅ RESOLVED — #166: `getPresets()` always returns empty (`presetFromElement` attribute typo)

Confirmed on real hardware during B9/B12. `src/devices/SoundTouch/api/preset.ts`
checks `element.hasAttributes(['id', 'createdOn', 'updateOn'])` and reads
`element.getAttribute('updateOn')` — but the real device's `/presets` XML
attribute is `updatedOn` (confirmed via direct `curl
http://<kitchen-ip>:8090/presets` against real hardware: `<preset id="1"
createdOn="1784432310" updatedOn="1784432310">`). Since no element ever has
an attribute literally named `updateOn`, `presetFromElement` returns
`undefined` for **every** preset, so `getPresets()` **always returns an empty
array** — confirmed directly: `API.create('10.0.0.24').getPresets()` → `[]`,
despite the device having 5 real presets.

`getPresets()` has exactly one production call site in this entire codebase:
`SoundTouchZoneOnCharacteristic._applyDefaultSourceIfIdle()` — **#166's own
defaultSource feature**. Since the presets list is always empty,
`presets?.find(...)` always finds nothing, and the "configured zone default
source preset slot X is empty on the device" warning fires every time —
**the entire defaultSource feature has never worked on any real device.**

**Root cause is old, not new**: `git log -L` traces the typo to PR #52
("fix: correct SoundTouch API spec mismatches"), which changed
`updatedOn`→`updateOn` believing that was the real Bose attribute name — it
was backwards. `getPresets()` had zero production callers before #166, so
the bug was dormant with zero real-world impact until now. **#166 is what
makes this newly load-bearing** — same shape as the #145 finding (an old bug
a new feature in this batch newly depends on).

**Why tests didn't catch it**: `preset.test.ts`'s one happy-path test uses
the *wrong* attribute name (`updateOn`) in its own fixture and asserts
success — it locks in the bug as "correct" behavior. Its other three tests
use the real name (`updatedOn`) but only exercise sad paths (missing
attributes, missing/malformed content item) that don't depend on which name
is checked.

**Fixed 2026-07-19 via #177** (`fix: correct preset updatedOn attribute
name`). The engineer found a **third instance of the same typo** not caught
in the original brief: `presetsXml()` in
`src/__integration__/helpers/fake-soundtouch-server.ts` also used
`updateOn`, meaning the integration test suite's own fake server matched the
buggy production code — this is the real reason the whole test suite gave
false confidence despite exercising the preset-sync path. All three were
fixed together; the happy-path unit test fixture and the `getPresets()`
integration fixture were corrected, and a new regression test using the
exact real-device XML shape (multiple presets, per the `curl` capture above)
was added. Reverting the fix was confirmed to fail 4 tests.

**Re-verified on real hardware post-merge (2026-07-19):**
- `API.create(kitchenIp).getPresets()` now returns the real preset data
  (previously `[]`).
- **B9**: with Kitchen genuinely idle (confirmed off, then powered on),
  activated the zone with `defaultSource` slot 1 — Kitchen actually started
  playing "More FM Auckland" via TUNEIN (confirmed via `getNowPlaying()`),
  and Lounge joined playing the same station. **PASS.**
- **B10**: manually selected a different station ("The Hits Auckland") on
  Kitchen first, then activated the zone with the same `defaultSource`
  slot — Kitchen's `getNowPlaying()` still showed "The Hits Auckland"
  afterward, confirming the already-playing source was **not** overridden.
  **PASS.**
- Process health clean throughout (0% CPU, no warnings).

### 🔴 BLOCKING — #144: `setOn` race condition on rapid power toggles

Confirmed on real hardware during A7 (rapid off→on→off from the Home app —
user report: "off on off stays on"). `src/accessories/services/SoundTouchSpeakerOnCharacteristic.ts`'s
`setOn` does a read-then-act pattern with **no locking between overlapping
calls**: read live device state via `SoundTouchDevice.deviceIsOn`, press
POWER only if it differs from desired. HAP does not serialize rapid `onSet`
calls from the Home app, so three quick taps can produce three overlapping
`setOn` invocations. A later call's live read can return **stale** device
state left over from an earlier call's still-in-flight 300ms power hold,
causing it to wrongly conclude "no action needed" and skip a press that was
actually still required — leaving the device in the wrong final state.

**Reproduced 4/5 times** with a standalone script that fires `setOn(false)`,
`setOn(true)`, `setOn(false)` 250ms apart without awaiting each call's
completion (mirroring `setOn`'s exact logic against a real Office speaker,
resetting to a known ON state before each trial):
```
Trial 1: expected OFF, got ON (BUG)
Trial 2: expected OFF, got ON (BUG)
Trial 3: expected OFF, got ON (BUG)
Trial 4: expected OFF, got ON (BUG)
Trial 5: expected OFF, got off (correct)
```
Reliably reproducible, not a one-off flake.

**Directly tied to #144**: that PR introduced the "read live state before
toggling" pattern this bug lives in (previously the plugin may have toggled
based on cached/optimistic state instead) — the pattern itself needed
serialization against overlapping calls from day one, which #144 didn't add.

**First fix attempt (#178, merged) insufficient — chaining causes a new
responsiveness regression.** #178 serialized `setOn` via a `pendingSetOn`
promise chain, confirmed correct in isolation by a mocked-timer unit test.
Re-verified on real hardware (2026-07-19) with a **repeated** rapid off→on→off
sequence in the Home app (user report: "failed... the speaker was playing and
the app showed as off"). Log evidence: **24** `[Office] - set status` entries
across two bursts (~8s and ~19s), far more than 3 — the user kept tapping
because the tile wasn't updating. Confirmed independently: the physical
device was genuinely ON (`getSource()` → `SPOTIFY`) while the Home app tile
showed off.

**Root cause of the new regression**: `wrapHapSet` does `await fn(value)` —
whatever `setOn` returns directly gates how long HAP waits before acking the
controller. With chaining, a call queued behind others doesn't resolve until
its turn in the backlog finishes; each `applyPowerState` can take 300ms
(power hold) plus ~1-2s more for `resumeLastPlayedSource`'s extra round-trips
when powering on. Under a burst of many taps, later calls in the queue can
take many seconds to resolve — long enough to exceed HomeKit's expected
"set" response window, so the Home app gives up and shows a stale/incorrect
state even though the server is still correctly draining the backlog
underneath. Trades "wrong final state on 2-3 close taps" for "correct-but-
very-delayed final state, with HomeKit visibly desyncing during a longer
burst" — arguably worse, since the mismatch is now visible and confusing
(device audibly playing, tile says off) rather than silent.

**Recommendation: debounce instead of pure sequential chaining** (user's
proposal, correct call). On each `setOn`, record the desired value and
(re)start a short debounce timer; **ack the HAP "set" promptly** (resolve
without waiting for the real device action) so rapid taps never build a
blocking backlog. Only when the debounce window elapses with no newer call
does the real live-read + holdKey + resumeLastPlayedSource sequence run,
targeting whatever the LAST desired value was — collapsing an entire burst
into exactly one physical action. Trade-off to design around: since the HAP
ack now precedes the real action, a debounced action's failure can't
propagate back to the originating call's error path anymore — needs a
catch-and-log (matching this repo's existing pattern elsewhere) and rely on
`refresh()`/reconciliation to surface the true state on the next poll.
Second fix dispatched; still blocking dev→beta until re-verified.

### 🟡 Non-blocking, pre-existing (not part of this release batch) — config-driven speaker rename never worked

While investigating A2/A4 (see below), traced a separate bug: `accessories[]`
config `name` overrides are silently discarded.
`SoundTouchDeviceConfiguration.ts:90` —
`name: props?.name || props.accessoryConfig.name || ''` — checks the raw
*discovered* device name **before** the config override, so
`accessoryConfig.name` never wins. Confirmed via `git log -L` this line is
unchanged since at least PR #72 — long-standing, not introduced by any PR in
this batch. Filed as a backlog item, not a release blocker for this pass.

### Wave 1 results so far
- **A1 (Office, Home-app rename) — ✅ PASSED**, user-confirmed via
  screenshot: renamed tile ("Renamed Speaker") survived a full Homebridge
  restart, exactly the regression #167 targets.
- **A2/A4 (Garage, config-driven rename) — inconclusive for #167's specific
  concern.** Root cause is the pre-existing bug above, not the `isNewAccessory`
  gate #167 added — #167 itself isn't implicated. First attempt used a wrong
  IP from a mismapped local device map (corrected, see
  `2026-07-18-device-map.local.md`); second attempt used the right IP and
  still failed, but for the pre-existing reason, confirmed by reading
  `created device configuration` in the debug log (name reverted from
  "Garage Renamed" back to "Garage" between config-match and
  device-configuration-creation).

## Coverage & plan-alignment findings

**Follow-up test coverage in flight** (dispatched via plugin-engineer,
2026-07-18, user approved "fix all three before testing"):
- `test/gabbo-error-no-close-coverage` — #146's core motivating scenario
  (WebSocket `error` with no `close`) had zero test coverage.
- `test/did-finish-launching-error-coverage` — #144's new `didFinishLaunching`
  try/catch had zero test coverage.
- `test/zone-accessorytype-prune-coverage` — #162's `_pruneOrphanService`
  (undocumented in the plan, not in the checklist) had zero test coverage.

Do not treat this QA pass as `complete` until those three land green and are
merged to `dev`, or the user explicitly decides not to wait for them.

**Accepted / lower-severity gaps** (not blocking, noted for the record):
- #166 zone default source — `_isPrimaryIdle()` untested branch for
  `nowPlaying === undefined`; one idle sub-case (`source` present,
  `location` empty) only covered compositely, not in isolation.
- #165 zone state reconciliation — no integration test for the actual
  stale-`getZone()`-after-standby bug scenario (unit coverage only).
- #163 power key hold duration — power-*off* drift path doesn't assert
  `holdKey` call shape (only power-on direction does).
- #161 power-on resume last source — no test for `getRecents`/`selectSource`
  rejecting mid-resume.
- #147 Bose cloud server hardening — reflected-name fallback branch not
  independently tested (pre-existing behavior, not this PR's own change).
- #145 preset sync cron fix — `next === null` fallback branch (as opposed to
  the constructor throwing) is unverified; only "verified empirically" per
  the plan.
- #134 config schema — CI only validates JSON parses, not that Config UI X
  conditional-visibility expressions actually work; no automated way to test
  that in this repo today.

**Plan-hygiene items to reconcile** (do this in step 7, after the walkthrough):
- #162's plan Verification section still reads as if no real-device testing
  happened, but its own Decisions & findings table records three separate
  real-hardware bugs found and fixed this session. Needs reconciling either
  way once the manual walkthrough below actually re-confirms these.
- #145's plan Verification section still has `npm run watch — not applicable
  (no runtime change)` — a leftover from before the PR's scope pivoted from
  pure doc/dead-code hygiene to an actual cron-timing behavior fix. This QA
  pass's step 25 below closes that gap for real.
- #170's plan frontmatter is `status: in-progress` despite every checklist
  item and automated test being done — correct, since real-device
  verification is still outstanding (this pass is exactly that).

**Correction:** the #134 audit incorrectly claimed that PR's commit is
already on `latest`. Verified directly (`git merge-base --is-ancestor`) —
false. It is unreleased, same as everything else on this list.

## Consolidated manual test steps

**Total restarts: 4** (down from ~13 if every step restarted independently).
**Unattended waits: 4** (flagged inline — kick off, keep going, confirm later).
Assumes **3+ speakers** available so same-mechanism setups (config rename vs.
Bose-app rename, etc.) can be batched into the same restart without
confounding which mechanism produced the result — with only 2 speakers, Wave
3 and Wave 4's member-rename setups still need to stay in separate restarts
from each other, so plan on 5 restarts instead of 4 in that case.

### Wave 0 — no restart needed, do anytime
- [ ] D3. Open the plugin config in Homebridge Config UI X (no save needed);
      confirm each newly-exposed field renders with correct conditional
      visibility: `server.host`/`server.port` only when `server.enabled` is
      on; `global.presets`/`global.presetSyncEnabled` only when
      `server.enabled` is on; `global.presetSyncSchedule` only when both
      `server.enabled` and `presetSyncEnabled` are on; the top-level
      `presets` alias array hides once `global.presets` has entries;
      per-accessory `presetSyncEnabled` follows the same `server.enabled`
      condition — verifies #134

### Wave 1 — config + Home-app prep → restart 1
Batch all of this into one config file save (plus one Home-app action) before
restarting once:
- [ ] Ensure `server.enabled: true` (skip if already set) — enables D1
- [x] Set `presetSyncSchedule` to a non-trivial cron pattern (e.g. a specific
      day-of-month, not just hourly/daily) — setup for D2
- [ ] Rename speaker **X** via its config `name` override — setup for A2/A4
- [ ] Add a not-previously-configured speaker **Y**, if available — setup
      for A3 (skip if no spare speaker exists; note as not-verified)
- [ ] Rename speaker **Z** in the Home app (do this live, before restarting)
      — setup for A1
- [ ] Configure a zone (primary **P** + slave(s) **S**) with `defaultSource`
      set to a preset slot — setup for B1/B9

**Restart Homebridge once.** Then verify:
- [x] D2. With `presetSyncSchedule` set to a >24.8-day-out cron pattern, confirm
      Homebridge runs the single legitimate startup sync and does **not**
      tight-loop — verifies #145 (🤖 `node scripts/qa/check-process-health.mjs
      --log <log file>` — this is the step that originally caught the #145
      runaway-loop bug; re-verified 2026-07-19 post-fix: 1 sync, 0 warnings,
      0% CPU sustained over 27s+) — **RESULT: PASS** (see "Real-device
      findings" above for the full incident/fix/re-verification writeup)
- [x] A1. Speaker **Z**'s Home-app rename persists — verifies #167 —
      **PASS**, user-confirmed via screenshot
- [x] A2/A4. Speaker **X** shows its new config-driven name and the restored
      accessory `context` updated cleanly (no duplicate/crash) — verifies
      #167, #144 — **inconclusive for #167** (context updated cleanly, no
      duplicate/crash — that half passes; the name itself never propagated
      due to the separate pre-existing bug, see "Real-device findings")
- [ ] A3. Speaker **Y** appears with its correct initial name — verifies #167
      — **SKIPPED**, no genuinely unconfigured spare speaker available this
      session
- [x] B1. The zone appears in the Home app — verifies #162 —
      **PASS**, script-confirmed (🤖 `check-accessory-context.mjs`): zone
      "Downstairs" registered with `context.memberDeviceIds` correctly
      mapping Kitchen (primary) and Lounge (slave)

### Wave 2 — live checks, no restart
Build on Wave 1's state. Do the ⏱ steps first so their waits overlap the rest
of this wave.

- [x] B11. With the zone tile reading on, primary **P** (Kitchen) powered
      off directly via device API (🤖 `set-power.mjs`, mirrors what pressing
      its HomeKit tile does) — verifies #165 — **PASS**, user-confirmed via
      Home app screenshot: "Downstairs" zone tile read **Off** after Kitchen
      powered off, without touching the zone tile itself. Note:
      `poll-zone-state.mjs` checks the *device's* raw `/getZone` membership,
      which is a different signal from HomeKit's own characteristic value
      (which is what #165's primary-power gate actually affects) — no
      programmatic way to read the live HomeKit characteristic without a
      paired HAP controller, so this one needed a human screenshot rather
      than a script confirmation.
- [x] D1. — verifies #147 — **PASS**, script-confirmed (🤖
      `check-tunein-station.mjs --valid-id s7162`): valid id 200, query-param
      injection 400, path traversal 400. Note: the script initially used
      `fetch()` for the path-traversal case, which gave a false FAIL —
      `fetch` normalizes `..` client-side before sending, so it never
      actually tested the server. Fixed to use a raw `http.request` with the
      literal path (same gotcha the original #147 PR audit flagged);
      confirmed via a standalone raw request that the server-side protection
      was correct all along before fixing the script.
- [x] B12. Re-activate the zone; confirm it reads **on** again — verifies
      #165 — **PASS**, script-confirmed (🤖 `set-zone.mjs --activate` +
      `poll-zone-state.mjs`)
- [x] B3. With the zone active, confirm slave(s) **S** (Lounge) stay
      independently controllable (volume, source) rather than locked to the
      zone — verifies #162 — **PASS**, script-confirmed: set Lounge's volume
      directly via its own API while zone active, confirmed it took effect
      (37 → 45, then restored to 37) with no zone-side interference
- [x] B9. With primary **P** idle/off, activate the zone; confirm **P**
      starts the configured default-source preset and **S** join playing it
      — verifies #166 — **PASS**, re-verified post-#177 on real hardware:
      Kitchen genuinely idle → zone activated → Kitchen playing "More FM
      Auckland" via TUNEIN, Lounge joined same station (script-confirmed via
      `getNowPlaying()`)
- [x] B10. Fill-if-empty check: start something on **P** first, then
      activate the zone; confirm the already-playing source is **not**
      overridden — verifies #166 — **PASS**, re-verified post-#177: Kitchen
      manually set to "The Hits Auckland" → zone activated with
      `defaultSource` configured → Kitchen still on "The Hits Auckland"
      afterward (script-confirmed)
- [x] B13. Group **P**/**S** into a zone externally (not through HomeKit) —
      verifies #165 — **PASS by equivalence**: every `set-zone.mjs` call in
      B1/B12 already grouped the devices via a direct API call, bypassing
      HomeKit's `onSet` entirely — indistinguishable from the physical Bose
      app having done it from the plugin's reconciliation-loop perspective.
      B11's screenshot already confirmed the always-on reconciliation loop
      correctly reflects device-originated zone-state changes; re-running an
      identical action would add no new signal
- [x] A5. Office toggled off then on via direct device API (🤖
      `set-power.mjs` + `poll-power-state.mjs`, same `holdKey(POWER, 300ms)`
      mechanism the plugin's own tile-triggered `setOn` uses) — verifies #163
      — **PASS**, script-confirmed both directions
- [x] A6. Immediately after A5's power-on, confirm the last-played source
      resumes automatically — verifies #161 — **PASS**, user-confirmed via
      Home app (toggled Office off/on, last-played source resumed)
- [ ] A7. Toggle that same speaker's power from the Home app twice in rapid
      succession; confirm no double-press / no double-toggle artifact —
      verifies #144 — **FAIL**, user-confirmed: off→on→off left the device
      on. Root-caused and reproduced 4/5 times via script — see "🔴 BLOCKING
      — #144" in "Real-device findings" above. Fix dispatched; re-verify
      once it lands.
- [ ] (confirm B13 now, ~60s should have passed)
- [x] A8. Remote unplugged at the wall — verifies #144 — **PASS**:
      device-level unreachability script-confirmed (🤖 `poll-power-state.mjs
      --until unreachable`), tile correctly showed "No Response" (not
      "Off"), user-confirmed — took a little longer to appear than the other
      checks, consistent with the reconciliation-poll interval rather than a
      bug

### Wave 3 — config prep #2 (needs the zone currently ON) → restart 2
Batch before restarting:
- [ ] Leave the zone **ON** going into the restart — setup for B2
- [ ] Change the zone's `accessoryType` in config (switch ↔ lightbulb) —
      setup for B4 (do this **after** `test/zone-accessorytype-prune-coverage`
      has landed, so a real regression is caught by both the new automated
      test and this manual pass)
- [ ] Rename zone member **S** via its config `name` override (a *different*
      device than speaker **X** from Wave 1, to keep signal clean) — setup
      for B5

**Restart Homebridge once.** Then verify:
- [ ] B2. The zone tile initializes as **on** via the startup `getZone()`
      sync (not stale/off) — verifies #162
- [ ] B4. The Home app shows **only** the new accessory type for the zone —
      no orphaned duplicate tile — verifies #162
- [ ] B5. The zone still works and did not disappear after **S**'s
      config-name rename — verifies #170

### Wave 4 — config/physical prep #3 → restart 3
These setups mutate zone membership by three different mechanisms — keep
them in a separate restart from Wave 3 so each result is unambiguous:
- [ ] Rename a zone member (not the one renamed in Wave 3) via the **Bose
      app** (so `info.name` changes, not a config override) — setup for B6
- [ ] Re-point the zone to a different speaker by editing the config name —
      setup for B7
- [ ] Power off or remove a zone member entirely — setup for B8

**Restart Homebridge once.** Then verify:
- [ ] B6. The zone still works despite the Bose-app rename — verifies #170
- [ ] B7. The zone now targets the newly re-pointed speaker — verifies #170
- [ ] B8. The upgraded warn is logged, and — for a partial loss (one slave
      gone, primary + ≥1 slave still resolvable) — the zone still registers
      with the remaining members — verifies #170

### Wave 5 — network resilience → restart 4 (standalone, longest waits)
Run this last — it needs a speaker deliberately unreachable at startup,
which conflicts with the "everything online" precondition of Waves 1-4.
- [ ] C3. Start Homebridge while a configured speaker is fully
      off/unreachable; confirm the client doesn't silently give up after a
      single connection-refused error — it should keep retrying with
      backoff — verifies #146
- [ ] C1. ⏱ Power that speaker back on / power-cycle it while Homebridge is
      running; watch the debug log and confirm gabbo reconnect delays grow
      (5s → 10s → 20s → … → cap over several minutes), then reset to the
      base delay once it comes back online. **This is the longest wait in
      the whole plan — use it to reconcile the plan-hygiene items noted
      above (step 7) rather than sitting idle.** — verifies #146
- [ ] C2. Pull the network (ethernet/WiFi) on a speaker to simulate a
      half-open connection (no clean disconnect); confirm state resumes
      within roughly 2 poll cycles once connectivity returns — verifies #146

## Results

- **D2 — FAIL then PASS.** First attempt (2026-07-19, initial config prep)
  found a severe runaway tight-loop bug in `PresetManager._scheduleNext`
  (script-confirmed via manual log/CPU inspection — `check-process-health.mjs`
  didn't exist yet at that point, built as a direct result of this finding).
  Fixed via #176, re-verified script-confirmed
  (`check-process-health.mjs --log /tmp/homebridge-watch3.log`): 1 sync, 0
  Node runtime warnings, 0% CPU sustained. PASS.
- **A1 — PASS**, user-confirmed via Home-app screenshot: Office's rename
  ("Renamed Speaker") survived a full restart.
- **A2/A4 — inconclusive for #167's specific concern**, not a pass/fail in
  the usual sense. Traced to a separate, pre-existing, non-blocking bug
  (config-driven rename never applies — filed in `ROADMAP.md` backlog, not
  part of this release batch). #167's own `isNewAccessory` gate is not
  implicated. See "Real-device findings" above for the full trace (including
  a self-caught wrong-IP false start, corrected via
  `2026-07-18-device-map.local.md`).

_(remaining steps filled in live during the rest of the walkthrough)_
