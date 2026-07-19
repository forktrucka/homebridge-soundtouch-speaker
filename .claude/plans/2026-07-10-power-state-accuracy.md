---
feature: Accurate power state — error propagation, toggle drift, stale restore context
status: in-progress # merged to dev via PR #144, awaiting beta cut
date: 2026-07-10
branch: fix/power-state-accuracy
commit-type: fix
---

# Accurate power state — error propagation, toggle drift, stale restore context

## Context

Audit findings (verified 2026-07-10) that make HomeKit power state lie:

1. **`deviceIsOn` swallows errors** — `src/devices/SoundTouch/SoundTouchDevice.ts:220-239`
   ends in `catch { return false; }`. A network failure shows the speaker as
   "off" in HomeKit instead of "No Response". The correct pathway already
   exists: `wrapHapGet`/`wrapHapSet` in
   `src/accessories/services/SoundTouchSpeakerCharacteristic.ts:42-74` convert
   thrown errors to `HapStatusError(SERVICE_COMMUNICATION_FAILURE)`.
2. **Power toggle drift** — `SoundTouchSpeakerOnCharacteristic.ts:53-59`
   (`setOn`) compares the desired value against the **cached**
   `characteristic.value` before pressing `KeyValue.power`, which is a
   *toggle* key. If the cache has drifted from the device, the set no-ops or
   double-toggles.
3. **Stale restore context** — `src/platform.ts:167-183` (restore branch of
   `discoverDevices`) never re-sets `accessory.context.deviceId` or
   `displayName`; only the create branch (:185-198) does. A renamed device
   keeps stale cached context forever.
4. **Unhandled rejections** — the `didFinishLaunching` listener
   (`src/platform.ts:63-72`) awaits `discoverDevices()` (which catches its own
   errors at :155-160) then `_startBoseCloudServer()` / `_setupPresets()`,
   whose rejections have no catch → unhandled rejection.
5. **Zero test coverage** on `SoundTouchSpeakerOnCharacteristic` (no test
   file exists — the largest coverage gap; only Brightness has a service test).

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-07-10 | Let `deviceIsOn` throw; catch in the reconciliation path only | HomeKit "No Response" is the correct UX for comm failure; `wrapHapGet` already does the conversion. The 5-min reconciliation loop (`SoundTouchSpeakerPlatformAccessory.ts:90-105`, `_refreshDeviceServices`) must not die — its `refresh()` call needs a try/catch logging at debug | Keeping `return false` (misreports state); catching in `getOn` (defeats the purpose) |
| 2026-07-10 | `setOn` reads live state via `deviceIsOn` before deciding to press the toggle key | The power key is a toggle; only a live read makes the decision safe. Adds one GET per set — sets are rare | Trusting `characteristic.value` (the current bug); tracking state locally (duplicates device state, drifts) |
| 2026-07-10 | Restore branch mirrors the create branch: update `context.deviceId`, `displayName`, then `api.updatePlatformAccessories([accessory])` when anything changed | Same data is available at :167; `updatePlatformAccessories` is the Homebridge API for persisting context changes (see `homebridge-developer` skill) | Unregister+re-register (loses HomeKit room/scene assignments) |
| 2026-07-10 | Wrap the whole `didFinishLaunching` body in try/catch, log via `AppError` from `src/errors.ts` (pattern: `AppError.create(...)`, see existing catch sites in `platform.ts`) | Matches the structured-errors convention from the 2026-06-20 verror plan | Per-call `.catch()` (verbose, easy to miss the next addition) |
| 2026-07-10 | Out of scope, recorded deliberately: volume-slider debounce and refresh coalescing (last-write-wins, harmless; revisit with source-selection), cron day/month fields in `PresetManager._msUntilNextCron` (documented in schema instead — see plan-hygiene plan) | Keep this PR reviewable | — |
| 2026-07-18 | QA follow-up: added unit coverage in `src/__tests__/platform.test.ts` for the `didFinishLaunching` try/catch (PR #144 had shipped it with zero test coverage). Confirmed the callback logs `AppError.create({ name: 'DidFinishLaunchingFailed', cause })` via `logger.error` and resolves without throwing when the startup sequence rejects, and logs nothing on the happy path. No bug found — behavior matches the original design intent. | Grep confirmed zero `'didFinishLaunching'` references in the test file pre-fix; a regression here (e.g. silent swallow, or the catch itself throwing) would have gone undetected | — |
| 2026-07-19 | Bug found on real hardware (reliably reproduced 4/5 trials): `setOn`'s live read-then-act (introduced by #144) had no serialization against overlapping calls. HAP does not serialize rapid `onSet` invocations from the Home app — three quick taps fire three overlapping `setOn` calls, and a later call's live `deviceIsOn` read can land while an earlier call's still-in-flight 300ms POWER hold hasn't yet flipped the device, so it reads stale state and wrongly skips a press it should have made. Net effect: off→on→off tapped quickly could leave the device ON. Fixed by chaining every `setOn` call off a per-instance `pendingSetOn` promise so each call's full read→hold→resume sequence fully settles before the next call starts its own read; this guarantees N overlapping calls settle to the state requested by the *last* call. Chosen over a coalescing/last-write-wins design because each `SoundTouchSpeakerOnCharacteristic` instance is already 1:1 with a device, so an instance field is already "per device" with no extra keying needed, and the promise-chain shape is simpler to reason about and test than tracking/coalescing a separate "latest desired" value. Kept #144's live-read-before-toggle concept unchanged — it was correct; the only defect was the missing concurrency guard around it. | Regression test (`SoundTouchSpeakerOnCharacteristic.test.ts`, "when calls overlap") fires 3 unawaited `setOn` calls against a mocked device with controllable delays on `deviceIsOn`/`holdKey`, asserts the final simulated device state; confirmed red without the fix (final state ended up `true` instead of the last-requested `false`) and green with it | Coalescing/last-write-wins (rejected: more state to track per device for no behavioral gain here, since `setOn` calls are cheap/rare, not high-frequency like volume) |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

- `src/devices/SoundTouch/SoundTouchDevice.ts` — remove the swallow in
  `deviceIsOn` (:236-238)
- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — try/catch around
  `refresh()` inside `_refreshDeviceServices` (:90-105); check whether
  `_refreshCharacteristics` (:80-88, `Promise.allSettled`) already tolerates
  rejections (it should — allSettled)
- `src/accessories/services/SoundTouchSpeakerOnCharacteristic.ts` — `setOn`
  live-read (:53-59)
- `src/platform.ts` — restore-branch context refresh (:167-183); try/catch in
  `didFinishLaunching` listener (:63-72)
- New: `src/accessories/services/__tests__/SoundTouchSpeakerOnCharacteristic.test.ts`
  (model on the existing
  `src/accessories/services/__tests__/SoundTouchSpeakerBrightnessCharacteristic.test.ts`)
- `src/__tests__/platform.test.ts` — restore-path context assertions

## Conventions for this change

- **Commit type:** `fix:` → patch release
- **Config schema touched:** no
- **Tests to add/update:** new `SoundTouchSpeakerOnCharacteristic.test.ts`; extend `platform.test.ts`; possibly `SoundTouchSpeakerPlatformAccessory.test.ts` for the reconciliation catch
- **Target branch:** `dev` (squash-merged; PR title is the released commit message).

## Implementation checklist

- [x] Read `coding-conventions` and `homebridge-developer` skills first
- [x] `deviceIsOn`: delete the catch; audit every caller (`getOn`, `refresh`
      in the On characteristic, anything else via grep) and decide
      propagate-vs-catch per the decisions table
- [x] Reconciliation loop: try/catch around `refresh()`, log at debug, loop
      continues (already in place on `dev` from #127 — verified, no change
      needed)
- [x] `setOn`: `const actual = await SoundTouchDevice.deviceIsOn(this.device)`
      then press only when `actual !== value`; errors propagate to `wrapHapSet`
- [x] Platform restore branch: refresh `context.deviceId` + `displayName`,
      `updatePlatformAccessories` when changed
- [x] Wrap `didFinishLaunching` body in try/catch with `AppError` logging
- [x] New On-characteristic tests: getOn on/standby/error → HapStatusError;
      setOn drift cases (cache says off, device on → no press when target on)
- [x] `npm run typecheck && npm run lint && npm test`
- [x] setOn: serialize per-device against overlapping onSet calls so N rapid
      toggles settle to the last requested state (+ race regression test)

## Verification

- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm test`
- [ ] `npm run watch` — unplug a speaker: tile shows "No Response" (not
      "Off"); toggle power from Home app twice rapidly: no double-toggle;
      rename a device in config: restored accessory context updates
      (skipped — no real speaker available in this session; noted in the PR)

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `fix: report communication failures and read live state before power toggle`
- **Targets:** `dev`
