---
date: 2026-07-18
target: dev → beta
prs: [170, 167, 166, 165, 163, 162, 161, 147, 146, 145, 144, 134]
status: in-progress # in-progress | complete | blocked
---

# Pre-release test plan — 2026-07-18

Covers every PR merged to `dev` since the last beta promotion (#133,
2026-06-25) — this is the first QA pass run against this backlog, hence its
size. 12 feat/fix PRs; docs/chore-only PRs in the same range are excluded
(nothing to manually verify there).

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
- [ ] Set `presetSyncSchedule` to a non-trivial cron pattern (e.g. a specific
      day-of-month, not just hourly/daily) — setup for D2 (⏱ **unattended
      wait — the actual firing may be hours/days out; kick this off now and
      check server logs independently later, don't block the rest of this
      walkthrough on it**)
- [ ] Rename speaker **X** via its config `name` override — setup for A2/A4
- [ ] Add a not-previously-configured speaker **Y**, if available — setup
      for A3 (skip if no spare speaker exists; note as not-verified)
- [ ] Rename speaker **Z** in the Home app (do this live, before restarting)
      — setup for A1
- [ ] Configure a zone (primary **P** + slave(s) **S**) with `defaultSource`
      set to a preset slot — setup for B1/B9

**Restart Homebridge once.** Then verify:
- [ ] A1. Speaker **Z**'s Home-app rename persists — verifies #167
      (🤖 `node scripts/qa/check-accessory-context.mjs --expect-name "<Z's new name>"`)
- [ ] A2/A4. Speaker **X** shows its new config-driven name and the restored
      accessory `context` updated cleanly (no duplicate/crash) — verifies
      #167, #144 (🤖 `node scripts/qa/check-accessory-context.mjs --expect-name "<X's new name>"`)
- [ ] A3. Speaker **Y** appears with its correct initial name — verifies #167
      (🤖 `node scripts/qa/check-accessory-context.mjs` — inspect the printed list)
- [ ] B1. The zone appears in the Home app — verifies #162
      (🤖 `node scripts/qa/check-accessory-context.mjs` — confirm the zone
      accessory is listed with the expected `context.memberDeviceIds`)

### Wave 2 — live checks, no restart
Build on Wave 1's state. Do the ⏱ steps first so their waits overlap the rest
of this wave.

- [ ] B11. ⏱ With the zone tile reading **on** (activate it first if not
      already), power off primary **P** externally (its own tile, or the
      physical Bose app) — not via the zone tile. **Kick off now, continue
      below** — while you do, run
      🤖 `node scripts/qa/poll-zone-state.mjs --primary <P's IP> --until inactive`
      to block until the zone self-corrects to **off** or times out —
      verifies #165
- [ ] D1. (independent of speaker state — do while waiting on B11) 🤖 `node
      scripts/qa/check-tunein-station.mjs --valid-id <a real TuneIn station id>`
      — verifies #147
- [ ] B12. Re-activate the zone; confirm it reads **on** again — verifies
      #165 (🤖 `node scripts/qa/poll-zone-state.mjs --primary <P's IP> --until active`)
- [ ] B3. With the zone active, confirm slave(s) **S** stay independently
      controllable (volume, source) rather than locked to the zone —
      verifies #162
- [ ] B9. With primary **P** idle/off, activate the zone; confirm **P**
      starts the configured default-source preset and **S** join playing it
      — verifies #166
- [ ] B10. Fill-if-empty check: start something on **P** first, then
      activate the zone; confirm the already-playing source is **not**
      overridden — verifies #166
- [ ] B13. ⏱ Group **P**/**S** into a zone **externally**, via the physical
      Bose app (not through this plugin). **Kick off now, continue below,
      come back in ~60s** to confirm the zone tile reflects **on** in
      HomeKit — the always-on reconciliation loop's specific payoff —
      verifies #165
- [ ] A5. On a speaker **not** in the zone, toggle power off then on via its
      own HomeKit tile; confirm the device's actual power state reliably
      follows both directions — verifies #163
- [ ] A6. Immediately after A5's power-on, confirm the last-played source
      resumes automatically — verifies #161 (combined with A5 since both
      touch the same power-toggle code path per the auditors' cross-reference)
- [ ] A7. Toggle that same speaker's power from the Home app twice in rapid
      succession; confirm no double-press / no double-toggle artifact —
      verifies #144
- [ ] (confirm B13 now, ~60s should have passed)
- [ ] A8. Unplug or power off a speaker at the mains/device level (not via
      HomeKit) — do this last since it takes the speaker offline; confirm
      its tile shows **"No Response"**, not **"Off"** — verifies #144

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

_(filled in live during the walkthrough)_
