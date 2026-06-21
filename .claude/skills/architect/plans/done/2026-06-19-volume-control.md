---
feature: Volume control — Lightbulb Brightness (Lightbulb mode)
status: done # 2026-06-21
date: 2026-06-19
updated: 2026-06-20
branch: feat/lightbulb-brightness-volume
commit-type: feat
---

# Volume control — Lightbulb Brightness (Lightbulb)

## Context

Expose speaker volume in HomeKit via the Lightbulb accessory type:

- **Lightbulb mode (requires plan 01):** expose volume via the Lightbulb's
  `Brightness` characteristic (0–100). `Brightness 0` powers the speaker off;
  raising from 0 powers it back on.

The Switch path was evaluated and cancelled — see Decisions & findings below.

The API layer is already complete: `api.getVolume()` returns
`{ target, actual, isMuted }` (`src/devices/SoundTouch/api/volume.ts`) and
`api.setVolume(value)` POSTs `/volume` (`src/devices/SoundTouch/api/api.ts:69`).
This is purely HomeKit wiring — no protocol work.

**Implementation order:** plan 01 (accessory type) ships first — it is the gate
that enables the Lightbulb service. Plan 02 Lightbulb path ships immediately
after, bundled with or as a quick follow-up to plan 01.

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
| 2026-06-20 | **DECISION: Switch volume path cancelled.** HAP `Switch` service exposes only a binary `On` characteristic — there is no `Volume` characteristic it can own. Bolting a linked `Speaker`/`Volume` service onto a Switch accessory creates a disconnected second tile with no clear relationship to the Switch tile. Switch = binary (0/1); volume = range (0–100). The two are architecturally incompatible in a single coherent HomeKit UX. The correct range characteristic is `Lightbulb.Brightness` (0–100), which is the target. | HAP constraint: Switch cannot natively carry a range characteristic. UX constraint: a linked tile is confusing and unintuitive. Volume on `Brightness` is the semantically correct mapping: 0 = off, 1–100 = volume level. | Keeping Switch path (unintuitive UX, HAP mismatch); adding a Speaker tile linked to Switch (disconnected tile, no power semantics). |
| 2026-06-20 | Plan 01 (accessory type) is now the immediate prerequisite — plan 02 gates on it | Lightbulb path cannot ship without the `accessoryType` config gate. Plan 01 ships first; plan 02 Lightbulb path follows immediately. | Attempting to embed volume-on-Switch as a stop-gap before Plan 01 (rejected: binary vs range mismatch; already reverted from #62) |
| 2026-06-20 | **Plan 01 (accessory type) shipped** — `accessoryType: lightbulb` is live in `dev`, Lightbulb service is wired. Plan 02 is now unblocked. | PR #82 merged `accessoryType` docs + config; `discoverAllAccessories` + per-accessory `ip`/`room` paths both support it. Verified via `test/hbConfig/config.json` (`accessoryType: lightbulb`) and `cachedAccessories` (Lightbulb service UUID `00000043` present). | — |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

- **New** `src/accessories/services/SoundTouchSpeakerBrightnessCharacteristic.ts` —
  characteristic class for the **Lightbulb** path. Uses
  `platform.characteristic.Brightness`; maps `0 → power off` and
  `>0 from off → power on` (coordinates with `SoundTouchSpeakerOnCharacteristic`).
  Pattern: `{ service, device, platform, accessory }`, binds `onSet`/`onGet`,
  implements `init()`/`refresh()` (update only when changed via
  `characteristic.updateValue`), exposes static async `create`. Logs via
  `this.log`.
- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts`:
  - **Lightbulb path (plan 01 gate):** add `SoundTouchSpeakerBrightnessCharacteristic`
    to the Lightbulb service alongside `On`.

## Conventions for this change

- **Commit type:** `feat:` → minor release.
- **Config schema touched:** no new fields; volume is always-on for Lightbulb
  accessory type (plan 01 adds `accessoryType` field).
- **Tests to add/update:**
  - `src/accessories/services/__tests__/SoundTouchSpeakerBrightnessCharacteristic.test.ts`
    — volume↔brightness mapping, `0 ⇒ off`, `>0-from-off ⇒ on`, race condition
    with the `On` setter.
- Follow **coding-conventions** (ESM `.js` imports, lint/format, the
  typecheck+lint+test gate) and the characteristic pattern in **homebridge-developer**.
- **Target branch:** `dev`.

## Design notes / risks

- **On + Brightness interplay:** HomeKit often sends `On` and `Brightness`
  together (e.g. turning on sends `On=true` then `Brightness=last`).
  Treat `setBrightness(0)` as power-off; `setBrightness(>0)` as set-volume
  (powering on first if currently off). Guard against fighting the `On` setter's
  5s settle sleep (`SoundTouchSpeakerOnCharacteristic.ts:66`).
- `getVolume().actual` is the live value for `refresh()`.

## Implementation checklist

> **Prerequisite:** plan 01 (accessory type) ✅ shipped — `accessoryType: lightbulb` is live in `dev`. Plan 02 is unblocked.

- [ ] Add `SoundTouchSpeakerBrightnessCharacteristic` (Lightbulb Brightness ↔
      volume, 0 = power off)
- [ ] Wire Brightness characteristic into `createAccessory` for the Lightbulb path
      (behind the plan 01 `accessoryType` gate)
- [ ] Reconcile On/Brightness ordering with `SoundTouchSpeakerOnCharacteristic`
- [ ] **Fix the power/volume race:** replace the `On` setter's blocking 5 s
      `finally` sleep (`SoundTouchSpeakerOnCharacteristic.ts:66`) with a
      non-blocking settle/debounce, so a near-simultaneous volume set isn't
      blocked or fought by the power set
- [ ] Add tests for `SoundTouchSpeakerBrightnessCharacteristic` (incl. a
      power+volume interaction test that would fail against the old 5 s sleep)

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run watch` — with a **Lightbulb** speaker (requires plan 01): drag
      brightness, confirm volume tracks; set to 0, confirm power off; raise from 0,
      confirm power on.

## PR / release notes

- **PR title:** `feat: add volume control via Lightbulb brightness`
- **Targets:** `dev`
