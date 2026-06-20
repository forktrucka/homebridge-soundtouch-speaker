---
feature: Volume control — Speaker service (Switch mode) and Lightbulb Brightness (Lightbulb mode)
status: in-progress # planned | in-progress | done | cancelled
date: 2026-06-19
updated: 2026-06-20
branch: feat/volume-control
commit-type: feat
---

# Volume control — Speaker service (Switch) and Lightbulb Brightness (Lightbulb)

## Context

Expose speaker volume in HomeKit for both accessory types:

- **Switch mode (default, ships first):** add a linked **Speaker** service with a
  `Volume` characteristic (0–100). This is a separate tile in the Home app,
  independent of the On/Off switch. No dependency on plan 01.
- **Lightbulb mode (plan 01 prerequisite):** expose volume via the Lightbulb's
  `Brightness` characteristic (0–100). `Brightness 0` powers the speaker off;
  raising from 0 powers it back on.

The API layer is already complete: `api.getVolume()` returns
`{ target, actual, isMuted }` (`src/devices/SoundTouch/api/volume.ts`) and
`api.setVolume(value)` POSTs `/volume` (`src/devices/SoundTouch/api/api.ts:69`).
This is purely HomeKit wiring — no protocol work.

**Implementation order:** plan 02 ships before plan 01. The Switch/Speaker path
works independently. The Lightbulb/Brightness path is wired in plan 02 but
activates only once plan 01 enables the Lightbulb accessory type.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-19 | Lightbulb: Volume = `Brightness` 0–100; `Brightness 0` ⇒ power off | Explicit product decision | Brightness 0 = mute but stay powered on |
| 2026-06-19 | Finding: the API already implements `getVolume`/`setVolume` | No protocol work; pure HomeKit wiring | — |
| 2026-06-19 | Finding: the `On` setter sleeps 5s in `finally` (`SoundTouchSpeakerOnCharacteristic.ts:66`) | A near-simultaneous volume set can race; needs reconciling/debounce | — |
| 2026-06-20 | Switch mode: HAP `Speaker` service + `Volume` characteristic as a separate linked service | Semantically correct; appears as its own tile; no dependency on plan 01's Lightbulb plumbing | Fan/RotationSpeed — semantically wrong; Lightbulb-only volume — leaves Switch users without volume control |
| 2026-06-20 | Plan 02 ships before plan 01; dependency on plan 01 removed | Volume should be available immediately on default Switch accessories | Waiting for plan 01 before shipping volume |
| 2026-06-20 | Two characteristic classes: `SoundTouchSpeakerVolumeCharacteristic` (Speaker/Volume) and the Lightbulb Brightness wiring | Different services, different power-off semantics; cleaner to keep them separate than to parameterise one class | One class parameterised by service/characteristic type — more complex with marginal reuse |
| 2026-06-20 | WebSocket push used for external volume changes — no new WS infrastructure needed | The speaker sends a `volumeUpdated` tickle on port 8080 (existing per-device WebSocket connection) whenever volume changes externally. The characteristic's `refresh()` listens for this event and re-fetches via `api.getVolume()`, then pushes the new value to HomeKit via `characteristic.updateValue`. The WS connection is already open; volume just needs to subscribe to the existing event emitter. | Polling on a timer — less responsive and wastes requests; opening a second WebSocket — redundant |
| 2026-06-20 | Promote the `On` setter's 5 s `finally` sleep fix into plan 02 scope (in-scope, not just a finding) | The race has been a passive finding since 2026-06-19. Plan 02 introduces the volume set that races it, and plan 02 already touches the power/volume interaction — so the fix belongs here. The brief must hand this off as a concrete task, not an open hazard. (Polling-loop lifecycle is a *separate* concern — see plan 06.) | Leaving it a passive finding (risk it never gets fixed); a separate fix PR touching `SoundTouchSpeakerOnCharacteristic.ts` (merge-conflict churn with plan 02, which also edits it) |
| 2026-06-20 | **Implemented** the race fix as a non-blocking settle window, not a blocking sleep | Replaced the `finally { await setTimeout(5000) }` with a `settleUntil` timestamp (`POWER_SETTLE_MS = 5000`): a power press records `settleUntil`; the setter returns immediately, so a concurrent volume set is never stalled. A repeated same-state press within the window is skipped (preserves the original anti-hammer intent). Covered by a fake-timer test that hangs against the old blocking sleep. | Keeping the blocking sleep (stalls HomeKit setters); a debounce timer that defers the press (adds latency to a deliberate toggle) |
| 2026-06-20 | **Deferred** the WebSocket `volumeUpdated` push; Switch-path volume uses the existing polling `refresh()` | There is no WebSocket infrastructure in the codebase yet (`grep` for `ws://`/`gabbo`/`8080` finds only the HTTP `sender: 'Gabbo'` string). The plan's WS decision assumed an existing per-device WS connection that does not exist. `SoundTouchSpeakerVolumeCharacteristic.refresh()` follows the same polling-loop pattern as `SoundTouchSpeakerOnCharacteristic`. A WS push layer is its own piece of work (touches every characteristic) and is out of scope for the Switch volume slice. | Building new WS infrastructure inside this PR (scope creep; a cross-cutting concern that belongs in its own plan) |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

- **New** `src/accessories/services/SoundTouchSpeakerVolumeCharacteristic.ts` —
  characteristic class for the **Speaker** service path. Takes
  `{ service, device, platform, accessory }`, grabs
  `platform.characteristic.Volume`, binds `onSet`/`onGet`, implements
  `init()`/`refresh()` (update only when changed via `characteristic.updateValue`),
  exposes static async `create`. Logs via `this.log`.
- **New** `src/accessories/services/SoundTouchSpeakerBrightnessCharacteristic.ts` —
  characteristic class for the **Lightbulb** path. Same pattern but uses
  `platform.characteristic.Brightness`; additionally maps `0 → power off` and
  `>0 from off → power on` (coordinates with `SoundTouchSpeakerOnCharacteristic`).
- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts`:
  - **Switch path:** add a linked Speaker service and wire
    `SoundTouchSpeakerVolumeCharacteristic` to it.
  - **Lightbulb path (plan 01 gate):** add `SoundTouchSpeakerBrightnessCharacteristic`
    to the Lightbulb service alongside `On`.

## Conventions for this change

- **Commit type:** `feat:` → minor release.
- **Config schema touched:** no new fields; volume is always-on per accessory type.
- **Tests to add/update:**
  - `src/accessories/services/__tests__/SoundTouchSpeakerVolumeCharacteristic.test.ts`
    — volume get/set, HAP error on device failure.
  - `src/accessories/services/__tests__/SoundTouchSpeakerBrightnessCharacteristic.test.ts`
    — volume↔brightness mapping, `0 ⇒ off`, `>0-from-off ⇒ on`, race condition
    with the `On` setter.
- Follow **coding-conventions** (ESM `.js` imports, lint/format, the
  typecheck+lint+test gate) and the characteristic pattern in **homebridge-developer**.
- **Target branch:** `dev`.

## Design notes / risks

- **On + Brightness interplay (Lightbulb only):** HomeKit often sends `On` and
  `Brightness` together (e.g. turning on sends `On=true` then `Brightness=last`).
  Treat `setBrightness(0)` as power-off; `setBrightness(>0)` as set-volume
  (powering on first if currently off). Guard against fighting the `On` setter's
  5s settle sleep (`SoundTouchSpeakerOnCharacteristic.ts:66`).
- **Speaker service on Switch:** the Speaker service appears as a linked tile in
  HomeKit, not embedded in the Switch tile. Confirm the UX is acceptable on a real
  device before finalising.
- `getVolume().actual` is the live value for both `refresh()` paths.

## Implementation checklist

### Switch path (this PR)

- [x] Add `SoundTouchSpeakerVolumeCharacteristic` (Speaker service, Volume 0–100)
- [x] Wire Speaker service + volume characteristic into `createAccessory` for the
      Switch path
- [x] **Fix the power/volume race:** replaced the `On` setter's blocking 5 s
      `finally` sleep with a non-blocking `settleUntil` window, so a
      near-simultaneous volume set isn't blocked or fought by the power set
- [x] Add the Volume characteristic tests (get/set, HAP error, refresh) and a
      power+volume interaction test that hangs against the old 5 s sleep
- [x] Extend the integration harness (Speaker/Volume stub types) + assert the
      Speaker Volume initialises from the device

### Lightbulb path (deferred — gated on plan 01)

- [ ] Add `SoundTouchSpeakerBrightnessCharacteristic` (Lightbulb Brightness ↔
      volume, 0 = power off)
- [ ] Wire Brightness characteristic into `createAccessory` for the Lightbulb path
      (behind the plan 01 `accessoryType` gate)
- [ ] Reconcile On/Brightness ordering with `SoundTouchSpeakerOnCharacteristic`

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run watch` — with a **Switch** speaker: confirm the Speaker tile appears,
      dragging volume tracks the speaker, and external volume changes reflect back.
- [ ] `npm run watch` — with a **Lightbulb** speaker (after plan 01): drag brightness,
      confirm volume tracks; set to 0, confirm power off; raise from 0, confirm power
      on.

## PR / release notes

- **PR title:** `feat: add volume control via Speaker service and Lightbulb brightness`
- **Targets:** `dev`
