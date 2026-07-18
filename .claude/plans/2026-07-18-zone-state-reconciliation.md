---
feature: Zone state reconciliation — primary-power-aware zone "on" + a background reconciliation poll for zone accessories
status: planned # planned | in-progress | beta | done | cancelled
date: 2026-07-18
branch: fix/zone-state-reconciliation # branched off dev AFTER speaker-zones (#162) merges
commit-type: fix
---

# Zone state reconciliation

## Context

The **Speaker zones** feature (`2026-06-21-speaker-zones.md`, PR #162, in review)
exposes each configured zone as a single HomeKit accessory. Its "on" state is
derived by `SoundTouchZoneOnCharacteristic._isZoneActive()`, which today reads
**only** `primary.api.getZone()` and returns `true` when every configured slave
appears in the reported membership.

Two accuracy gaps remain:

1. **A zone whose primary is in standby should read "off", but `_isZoneActive()`
   never checks the primary's power state.** The user's framing: *"if the primary
   speaker is off the zone is off."* If `getZone()` still reports stale membership
   after the master goes to standby (behaviour **not** confirmed on real hardware
   in this repo — see Decisions), the zone tile would keep showing "on" while
   nothing is playing.

2. **Zone accessories have no background reconciliation at all.**
   `SoundTouchZoneAccessory.stopPolling()` is a literal no-op — zone state is only
   refreshed at startup (`getZone()` sync) and on demand (HAP get). By contrast
   `SoundTouchSpeakerPlatformAccessory` runs a `_refreshDeviceServices()` loop
   every `RECONCILIATION_INTERVAL_MS` (5 min), gated on `device.gabbo.isConnected`,
   with a try/catch + `AppError`. **Critically, unlike speaker accessories, zone
   accessories are wired to *no* gabbo push events** (confirmed in the zones plan's
   2026-07-18 volume row — `SoundTouchZoneAccessory` does not run a gabbo listener
   loop). So a poll is the *only* mechanism that can ever correct a zone tile that
   has drifted from device reality (e.g. the primary powered off from its own Home
   tile or the physical Bose app while the zone still shows "on").

The user asked for *"a job of some kind to check the state of the zone — it should
start when the zone is enabled."* This plan adds (1) the primary-power check to
`_isZoneActive()` and (2) a background reconciliation loop on
`SoundTouchZoneAccessory` mirroring the proven speaker-side pattern.

This is a **`fix:`** (patch) — it corrects the accuracy of an existing feature's
reported state; it adds no new user-facing config or capability.

## Decisions & findings

The durable record so we don't re-litigate decisions or re-investigate facts.
**Append, don't overwrite.**

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-07-18 | **No confirmed real-hardware finding exists in this repo on whether `getZone()` still reports slave membership after the master enters standby.** Checked `plans/done/2026-06-20-websocket-push.md` (2026-07-17 gabbo capture) and the `2026-06-21-speaker-zones.md` Decisions table. The gabbo capture confirms standby produces *no socket traffic* and that `setZone`/`removeZoneSlave` succeed over HTTP even while a device is in standby (audio just doesn't play) — but **neither** captures what `GET /getZone` returns after the master goes to standby (auto-dissolve vs. stale membership). | The two most relevant existing captures are silent on this exact question. Assuming either behaviour would be guessing. | Assuming the device auto-dissolves the zone on standby (would leave the tile correct *only if* true — unverified, so unsafe to rely on); assuming it never dissolves (equally unverified). |
| 2026-07-18 | **`_isZoneActive()` gains an explicit primary-power gate that is correct either way:** check `SoundTouchDevice.deviceIsOn(this.device)` first — if the primary is **not** on, return `false` immediately without calling `getZone()`; only when the primary is on, fall through to the existing membership check. | Belt-and-suspenders: correct whether or not the device auto-dissolves. Reuses the exact `SoundTouchDevice.deviceIsOn(...)` helper already used by `SoundTouchSpeakerOnCharacteristic.refresh/getOn/setOn` (`getSource()` → `STANDBY`/`INVALID_SOURCE` mapping), so the zone's notion of "primary on" stays identical to the primary speaker's own tile. Short-circuiting also saves the `getZone()` round-trip when the primary is off. | Calling `getZone()` first then AND-ing power (one extra round-trip when off, no benefit); trusting membership alone (the current bug). |
| 2026-07-18 | **`getOn()`, `refresh()`, and startup `init()` all inherit the fix for free** because they already funnel through `_isZoneActive()`. No separate change to those methods' logic. | `getOn`/`refresh` call `_isZoneActive()` directly today; keeping the gate inside `_isZoneActive()` is the single choke point. | Duplicating the power check into each of `getOn`/`refresh` (three copies to keep in sync). |
| 2026-07-18 | **Reconciliation loop lives on `SoundTouchZoneAccessory`** (parallel to `SoundTouchSpeakerPlatformAccessory`), started in `init()` and stopped in `stopPolling()`. The platform already calls `zoneWrapper.stopPolling()` on both shutdown and stale-accessory unregister (`src/platform.ts` lines ~95, ~262), so teardown wiring already exists and just needs a real implementation behind it. | Natural home; the platform's shutdown/prune loops already iterate `_zoneWrappers` and call `stopPolling()`. Turning today's no-op into a real stop is drop-in. | A platform-level central poller (would need to reach into each zone's characteristics; breaks the per-accessory encapsulation the speaker side uses). |
| 2026-07-18 | **Loop runs continuously while the accessory is registered (always-on, mirroring the speaker), NOT gated on the zone being switched "on".** Recommendation to resolve the open lifecycle question. | (a) It is the **only** correction path for zones — they have zero gabbo push wiring, so a zone created *externally* (physical Bose app grouping the speakers) can only ever be reflected as "on" by a poll that is already running; a start-on-`setOn(true)` loop would be permanently blind to that. (b) It subsumes the user's core case: an always-on loop catches "primary powered off while zone shows on" *and* "zone created externally". (c) It reuses the exact tested speaker pattern (`_isPolling` + `while` loop started in `init()`, stopped in `stopPolling()`), minimising novelty. The user's phrase *"start when the zone is enabled"* maps cleanly to "starts at `init()` when the zone accessory is enabled/created". | **Gated loop** (start on `setOn(true)`, stop on `setOn(false)`/teardown): cheaper, but blind to externally-created zones, and couples poll lifecycle into `setOn` (more moving parts). Documented as the rejected alternative; revisit only if poll cost ever proves material (it won't — see interval row). |
| 2026-07-18 | **Interval: a dedicated `ZONE_RECONCILIATION_INTERVAL_MS = 60 * 1000` (60 s), shorter than the speaker's 5-min `RECONCILIATION_INTERVAL_MS`.** | Zones are few (typically 1–3), so aggregate poll cost is tiny even at 60 s (per zone per tick: one `getSource()` on the primary, plus one `getZone()` only when the primary is on). Unlike speakers — whose 5-min poll is a pure backstop behind instant gabbo pushes — a zone has **no** gabbo backing, so this poll is its *sole* correction path and a 5-min lag on a "whole-house" switch is user-visible. The zone tile is also a moment-of-intent control users watch right when they toggle grouping. | Reusing the 5-min `RECONCILIATION_INTERVAL_MS` for consistency (documented alternative — rejected because a zone has no push channel to make 5 min acceptable); a very aggressive interval (<30 s) — unnecessary traffic for no real UX gain. Interval is a single named constant, trivially tunable if 60 s ever feels wrong. |
| 2026-07-18 | **Loop is gated on `this.primary.gabbo.isConnected`, exactly like the speaker loop's `this.device.gabbo.isConnected` gate.** The zone's primary is *always* also a discovered standalone speaker accessory, whose own wrapper owns and maintains that gabbo connection — the zone accessory reuses it as a reachability signal (skip the poll, log at debug, when the primary is unreachable). The zone accessory does **not** open its own gabbo connection. | Avoids hammering / log-spamming an unreachable device; reuses the connection state already maintained elsewhere. The primary being a standalone accessory is guaranteed by `_resolveZones()` resolving primaries from `_discoveredDevices`. | The zone opening its own gabbo socket (redundant second connection to the same device); no reachability gate (spams warnings when the primary is offline). |
| 2026-07-18 | **Failure handling mirrors the speaker loop exactly:** each tick's `await this.refresh()` is wrapped in try/catch and a failure is logged via `AppError.create({ name: 'PollingRefreshFailed', device: <zone name>, cause: e })` at `warn`, never rethrown — a slow/unreachable device must not crash Homebridge or spam errors. | Direct copy of `SoundTouchSpeakerPlatformAccessory._refreshDeviceServices()`; keeps the verified-plugin "catch and log own errors" requirement intact. | Letting the refresh reject bubble (would leave an unhandled rejection on the Homebridge thread). |
| 2026-07-18 | **`SoundTouchZoneAccessory` must gain a `primary` device reference and a display name** (for the gabbo gate and the `PollingRefreshFailed` log/debug message) in its private constructor + `create()`. Today it only holds `onCharacteristic`, `volumeCharacteristic`, `log`. | The loop needs `primary.gabbo.isConnected` and a human-readable name; `create()` already receives `primary` and `config`, so both are in scope to thread through. | Reaching into the on-characteristic's private `device` (encapsulation break); re-deriving the name from the accessory (already have `config.name`). |
| 2026-07-18 | **`fix:` commit type → patch release.** | Corrects the accuracy of an existing feature's reported state; adds no new config field or user-facing capability. | `feat:` (no new capability — the zone accessory already exists); `chore:` (user-visible behaviour change — a stale tile now self-corrects). |
| 2026-07-18 | **Blocked on Speaker zones (#162) merging to `dev`.** Edits `SoundTouchZoneOnCharacteristic.ts` (`_isZoneActive`) and `SoundTouchZoneAccessory.ts` (loop) — files that only exist on `feat/speaker-zones`. Soft-coupled with **Zone default source (1c)**: both extend the same two zone files (1c touches `setOn`/accessory threading; this touches `_isZoneActive`/accessory loop) — different methods, same files, so **serialise** the two (either order) rather than branch them in parallel to avoid a guaranteed merge conflict. | Branching before #162 lands would rebase-conflict on every touched line; running alongside 1c would churn the same files. | Building in parallel with #162 or 1c (guaranteed conflicts, no benefit). |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

Concrete files/dirs this touches. All build on the state PR #162 leaves in `dev`.
**No config-schema change** — this is a behavioural accuracy fix only.

### Zone runtime

- `src/zones/SoundTouchZoneOnCharacteristic.ts`
  - `_isZoneActive()`: add a leading `await SoundTouchDevice.deviceIsOn(this.device)`
    gate — return `false` (skip `getZone()`) when the primary is not on; otherwise
    keep the existing membership check unchanged. `SoundTouchDevice` is already
    imported here.
  - No change to `getOn()`/`refresh()`/`init()` — they funnel through
    `_isZoneActive()` and inherit the fix.
- `src/zones/SoundTouchZoneAccessory.ts`
  - Add a dedicated `ZONE_RECONCILIATION_INTERVAL_MS = 60 * 1000` module constant.
  - Add `primary: SoundTouchDevice` and a `name: string` (from `config.name`) to
    the private constructor props and thread them from `create()` (both already in
    scope there).
  - Add `private _isPolling = false` and `private async _reconcile(): Promise<void>`
    — a `while (this._isPolling)` loop that `setTimeout`-waits
    `ZONE_RECONCILIATION_INTERVAL_MS`, `continue`s (debug-logs) when
    `!this.primary.gabbo.isConnected`, else `try { await this.refresh() } catch`
    → `this.log.warn(AppError.create({ name: 'PollingRefreshFailed', device: this.name, cause: e }))`.
    Directly mirrors `SoundTouchSpeakerPlatformAccessory._refreshDeviceServices()`.
  - `init()`: after initialising the characteristics, set `this._isPolling = true`
    and kick off `this._reconcile()` (fire-and-forget `.then(() => {})`, same as the
    speaker side).
  - `stopPolling()`: replace the no-op body with `this._isPolling = false;`.
  - Add the `AppError` import (`../errors.js`) and `SoundTouchDevice` import.

### Platform

- `src/platform.ts` — **no code change required.** The shutdown loop (~line 95) and
  the stale-accessory prune loop (~line 262) already call `zoneWrapper.stopPolling()`;
  they simply start doing real work once `stopPolling()` is implemented. Confirm both
  paths during review.

### Tests to add / update

- `src/zones/__tests__/SoundTouchZoneOnCharacteristic.test.ts` — add to the
  `#getOn`/`#refresh` blocks (the fake device already exposes `getSource`, defaulting
  to `'STANDBY'`, and `getZone`):
  - primary in standby (`primarySource: 'STANDBY'`) + a full-membership `getZone`
    response → `getOn()` returns `false`; assert `getZone` is **not** called
    (short-circuit).
  - primary on (`primarySource: 'AUX'`) + full-membership response → `getOn()`
    returns `true` (existing behaviour preserved, now explicitly guarded).
  - primary on + a slave missing → `false` (unchanged).
  - `refresh()`: primary went to standby while the tile shows `true` →
    `updateValue(false)`.
- `src/zones/__tests__/SoundTouchZoneAccessory.test.ts` — **new** file (there is no
  accessory-level test today), mirroring
  `src/accessories/__tests__/SoundTouchSpeakerPlatformAccessory.test.ts` with
  `jest.useFakeTimers()` + `jest.advanceTimersByTimeAsync`:
  - starts the reconciliation loop on `init()`; calls `refresh()` after one
    `ZONE_RECONCILIATION_INTERVAL_MS`.
  - does not fire before the interval elapses.
  - `stopPolling()` halts the loop (drain-then-assert-no-more, like the speaker test).
  - skips `refresh()` when `primary.gabbo.isConnected` is `false`.
  - a `refresh()` rejection is caught (warn logged) and does not stop the loop or
    throw.
  - `stopPolling()` is safe to call before `init()`.

## Conventions for this change

- **Commit type:** `fix:` → **patch** release.
- **Config schema touched:** **no** — behavioural accuracy fix, no new config field.
- **Tests to add/update:** see Affected areas (unit fix on the characteristic +
  new fake-timer loop test on the accessory).
- **Target branch:** `dev` (squash-merged; PR title is the released commit message).
  **Branch off `dev` only after #162 has merged**, and serialise with Zone default
  source (1c) since they share the same two files.
- **ESM import rule:** all relative imports end `.js` — the new `AppError`
  (`../errors.js`) and any `SoundTouchDevice` import in the accessory included.
- **Domain skills to re-read before implementing:** `homebridge-developer`
  (accessory/characteristic lifecycle, verified-plugin "catch and log own errors");
  `soundtouch-api-expert` (`/getZone` shape, `getSource` standby mapping);
  `plugin-coding-conventions` (ESM `.js` imports, the typecheck+lint+test gate,
  fake-timer test setup).

## Implementation checklist

- [ ] Add the primary-power gate to `_isZoneActive()` in
      `SoundTouchZoneOnCharacteristic.ts`
- [ ] Add unit tests: primary-standby → zone off (short-circuit), primary-on →
      unchanged membership behaviour, refresh corrects a stale-on tile
- [ ] Add `ZONE_RECONCILIATION_INTERVAL_MS`, `_isPolling`, `_reconcile()` to
      `SoundTouchZoneAccessory.ts`; thread `primary` + `name`; implement
      `stopPolling()`
- [ ] Start the loop in `init()`; gate ticks on `primary.gabbo.isConnected`;
      wrap `refresh()` in try/catch + `AppError`
- [ ] Add `src/zones/__tests__/SoundTouchZoneAccessory.test.ts` (fake-timer loop
      lifecycle + gate + failure handling)
- [ ] Confirm `platform.ts` shutdown + prune loops drive the now-real
      `stopPolling()` (no code change expected)
- [ ] `npm run typecheck && npm run lint && npm test`
- [ ] `npm run knip` — confirm no unused exports

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run watch` — **real device recommended.** Activate a zone from the Home
      app (tile shows on). Then power the primary off from its **own** Home tile (or
      the physical Bose app); within ~60 s confirm the zone tile self-corrects to
      off. Re-activate the zone, confirm on.
- [ ] Real-device (always-on-loop payoff): group the speakers **externally** via the
      physical Bose app (not through this plugin); within ~60 s confirm the zone tile
      reflects "on" in HomeKit — the behaviour a gated loop could not provide.

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `fix: reconcile zone state so a zone reads off when its primary is off`
- **Targets:** `dev`
</content>
