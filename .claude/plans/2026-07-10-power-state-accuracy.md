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
| 2026-07-19 | **#178's chaining fix (this row's predecessor) is insufficient — replace it with debouncing.** Real-hardware re-verification (2026-07-19) of the rapid off→on→off Home-app sequence, repeated several times, produced a NEW regression: 24 `set status` log entries across two bursts, and a visible desync — the physical device ended genuinely ON (`getSource()` → SPOTIFY) while the Home app tile showed OFF. Root cause: `SoundTouchSpeakerCharacteristic.wrapHapSet` does `await fn(value)`, so `setOn`'s returned promise directly gates HAP's set-ack. Chaining makes a queued call resolve only after the whole backlog ahead of it drains; each `applyPowerState` is 300ms (POWER hold) plus ~1-2s more when powering on (`resumeLastPlayedSource` = `getRecents()` + `selectSource()`), so under a burst later acks exceed HomeKit's set-response window and the tile shows stale/wrong state while the server drains underneath. Arguably worse UX than the original #144 bug (visibly wrong vs. silently settling). **Fix: debounce, decoupling the HAP ack from the physical action.** On each `setOn`: record the desired value on the instance and (re)start a short debounce timer (~300-500ms, tuned by the engineer to coalesce a realistic rapid-tap cadence without making a single deliberate tap feel laggy; document the constant's reasoning), and resolve the returned promise promptly so `wrapHapSet` never blocks on the device action. Only when the debounce window elapses with no newer call does the real live-read + `holdKey` + `resumeLastPlayedSource` sequence run, targeting the LAST desired value — collapsing an entire burst into exactly one physical action. #178's live-`deviceIsOn`-read-before-toggle concept is preserved, just moved inside the debounced action instead of the HAP-blocking path. Since the ack now precedes the real action, a failure in the debounced action can't propagate to the originating caller — catch-and-log it (repo's existing "catch and log own errors" pattern, e.g. `PresetManager.sync()`); the true state resurfaces via the next `refresh()`/reconciliation poll or `getOn()`. Blocks dev→beta until A7 re-verifies on real hardware (repeated rapid Home-app taps; confirm both actual device state AND that the tile visibly tracks it promptly). | Real-device log capture (24 `set status` entries across two bursts; `getSource()` → SPOTIFY while tile OFF). Regression test must prove: (a) N rapid `setOn` within the window → exactly ONE `holdKey`, targeting the LAST value; (b) each `setOn`'s returned promise resolves quickly, not blocking on the debounced device action (the specific thing #178 broke — a "final state correct" assertion alone would NOT catch it, since #178 did eventually reach a correct-ish state, just too slowly and desynced); (c) a single non-bursted `setOn` still applies correctly after the window. | Pure sequential chaining (#178 — rejected: blocks HAP ack, causes visible tile desync under bursts) |
| 2026-07-19 | Bug found on real hardware (reliably reproduced 4/5 trials): `setOn`'s live read-then-act (introduced by #144) had no serialization against overlapping calls. HAP does not serialize rapid `onSet` invocations from the Home app — three quick taps fire three overlapping `setOn` calls, and a later call's live `deviceIsOn` read can land while an earlier call's still-in-flight 300ms POWER hold hasn't yet flipped the device, so it reads stale state and wrongly skips a press it should have made. Net effect: off→on→off tapped quickly could leave the device ON. Fixed by chaining every `setOn` call off a per-instance `pendingSetOn` promise so each call's full read→hold→resume sequence fully settles before the next call starts its own read; this guarantees N overlapping calls settle to the state requested by the *last* call. Chosen over a coalescing/last-write-wins design because each `SoundTouchSpeakerOnCharacteristic` instance is already 1:1 with a device, so an instance field is already "per device" with no extra keying needed, and the promise-chain shape is simpler to reason about and test than tracking/coalescing a separate "latest desired" value. Kept #144's live-read-before-toggle concept unchanged — it was correct; the only defect was the missing concurrency guard around it. | Regression test (`SoundTouchSpeakerOnCharacteristic.test.ts`, "when calls overlap") fires 3 unawaited `setOn` calls against a mocked device with controllable delays on `deviceIsOn`/`holdKey`, asserts the final simulated device state; confirmed red without the fix (final state ended up `true` instead of the last-requested `false`) and green with it | Coalescing/last-write-wins (rejected: more state to track per device for no behavioral gain here, since `setOn` calls are cheap/rare, not high-frequency like volume) |
| 2026-07-19 | Implemented the debounce rework described in the row above. `setOn` now just records `desiredPowerStatus` on the instance and (re)starts a single `debounceTimer` (`clearTimeout` + `setTimeout`), then resolves immediately — no more `pendingSetOn` chain. Chose **`SET_ON_DEBOUNCE_MS = 400`**: comfortably longer than a realistic rapid-tap gap (taps in a burst land well under 400ms apart, so every tap in a burst keeps re-arming the same timer) while still short enough that a single deliberate tap doesn't feel laggy before the speaker responds (300ms `POWER_KEY_HOLD_DURATION_MS` is itself perceptible, so 400ms of pre-roll stays in the same ballpark rather than adding a second, more-noticeable delay). When the timer fires, `runDebouncedPowerAction` runs the live-read (`deviceIsOn`) + `holdKey` + optional `resumeLastPlayedSource` sequence once, targeting whichever value was last requested, wrapped in try/catch that logs via `this.log.error` (mirroring `PresetManager.sync()`'s catch-and-log-own-errors shape) instead of throwing — the HAP ack has already happened by the time this runs, so there's no caller left to propagate to. Whether that action succeeds or is caught, a second try/catch re-reads `SoundTouchDevice.deviceIsOn` and calls `this.characteristic.updateValue(actual)`, closing the loop with verified state immediately in both the success and failure cases rather than waiting on the up-to-5-minute reconciliation poll. One consequence: `setOn`'s returned promise can no longer surface a live-read failure as a synchronous `HapStatusError` (the old "throws HapStatusError when the live read fails" `#setOn` test was replaced — it now asserts the set handler resolves instead — `#getOn`'s equivalent test is unaffected and still asserts the throw). Regression tests added in `SoundTouchSpeakerOnCharacteristic.test.ts` (Jest fake timers + `jest.advanceTimersByTimeAsync`) cover: (a) coalescing — a 3-tap burst produces exactly one `holdKey` call; (b) prompt ack — `setOn` resolves before a permanently-hung `holdKey` mock ever runs; (c) single-tap — still applies once after the window; (d) loop-closing `updateValue` on both the success path and a caught `holdKey`-rejection path. Confirmed red against the pre-fix (#178 chaining) code via `git stash` before implementing (7 of the new/updated tests failed, including a hang risk on the prompt-ack test and wrong `updateValue` call counts), green after. **A7 real-hardware re-verification (rapid Home-app taps; confirm actual device state AND that the tile visibly tracks it promptly) is still required before dev→beta promotion** — untested in this session (no device available). | `npm run typecheck && npm run lint && npm test` all green (478 tests, up from 473); manual git-stash diff run confirmed the new tests fail against #178's code and pass against this fix | — |

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
- [x] setOn: **replace #178's chaining with debouncing.** Record desired value
      on the instance + (re)start a short debounce timer (~300-500ms, tuned +
      documented); resolve the returned promise promptly so `wrapHapSet` never
      blocks on the device action. On timer fire (no newer call): run the real
      live-read + `holdKey` + `resumeLastPlayedSource` targeting the LAST
      desired value — one physical action per burst. Catch-and-log failures in
      the debounced action (repo's own-error-logging pattern). After the action
      settles (success OR caught failure), explicitly re-read
      `SoundTouchDevice.deviceIsOn` and `this.characteristic.updateValue(...)`
      to the actual verified state — close the loop immediately rather than
      leaving the optimistic HAP value to be corrected by the next poll.
      Regression test proves: (a) N rapid calls → exactly ONE `holdKey`,
      targeting the LAST value; (b) each returned promise resolves quickly, not
      blocked on the debounced action; (c) a single non-bursted call still
      applies after the window; (d) after the action settles (success and
      caught-failure paths), `updateValue` is called with a live re-read of
      device state, not the optimistic value.

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
