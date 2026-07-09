---
feature: disabled flag — unregister a speaker from Homebridge without removing its config
status: beta # v0.4.0-beta.1
date: 2026-06-21
branch: feat/disabled-flag
commit-type: feat
---

# Disabled flag

## Context

During local testing it's useful to temporarily remove a speaker from HomeKit
without deleting its config entry. A `disabled: true` flag per-accessory
achieves this: when set, `discoverDevices()` skips registration entirely and
unregisters any cached accessory for that device. Flip it back to `false`, save
in the Homebridge UI, and the speaker reappears.

State is durable — `disabled` lives in `config.json` and survives restarts. The
Homebridge Plugin Settings UI checkbox is the "button" — no new HomeKit
characteristic is needed.

Prioritised before [07] WebSocket push so the user can easily toggle a speaker
off while testing the WebSocket path (Spike C Part 2).

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-21 | Unregister the accessory (remove from HomeKit) rather than faking `SERVICE_COMMUNICATION_FAILURE` | User wants a clean absent-accessory scenario, not an unreachable-device scenario | Returning `SERVICE_COMMUNICATION_FAILURE` on all gets/sets — wrong semantics; accessory still shows in Home |
| 2026-06-21 | Gate in `discoverDevices()` in `platform.ts` | Discovery is the single place that registers/unregisters accessories; no characteristic-level changes needed | Per-characteristic guard — wrong layer, accessory stays in HomeKit |
| 2026-06-21 | Per-accessory flag only (not global) | Disabling all speakers at once is not a useful test scenario | Global flag — too blunt for targeted testing |
| 2026-06-21 | Use `unregisterPlatformAccessories` for cached accessories of disabled devices | Keeps stale-pruning logic consistent with existing pattern in `discoverDevices()` | Leaving the cached accessory in place — leaves a ghost in the Home app |
| 2026-06-21 | State lives in config.json (not a runtime toggle) | Homebridge config is the right persistence layer; survives restarts without extra storage | In-memory toggle — lost on restart; separate state file — unnecessary complexity |
| 2026-07-09 | Implementation merged and released to beta | PR #119 merged 2026-06-23 and is contained in `v0.4.0-beta.1`; code evidence: `AccessoryConfig.disabled`, `config.schema.json`, `platform.ts` disabled skip/unregister branch, and platform/config tests | Leaving plan in active `planned` state |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

- `src/ExternalPlatformConfig.ts` — add `disabled?: boolean` to `AccessoryConfig`
- `src/PlatformConfiguration.ts` — verify `disabled` flows through `flattenAccessoryConfiguration` (it should since it's on `AccessoryConfig`); add a targeted test
- `src/platform.ts` — in `discoverDevices()`, when a device config has `disabled: true`: call `unregisterPlatformAccessories` if a cached accessory exists for that UUID, then `continue` to skip registration
- `config.schema.json` — add `disabled` boolean to the per-accessory section with a note that it removes the speaker from HomeKit until re-enabled
- `src/__tests__/PlatformConfiguration.test.ts` — cover `disabled` propagation
- `src/__tests__/platform.test.ts` — cover the skip-and-unregister branch

## Conventions for this change

- **Commit type:** `feat:` → minor release
- **Config schema touched:** yes — `config.schema.json`, `ExternalPlatformConfig.ts`, `PlatformConfiguration.ts`, and their tests
- **Tests to add/update:**
  - `src/__tests__/PlatformConfiguration.test.ts` — `disabled` propagation
  - `src/__tests__/platform.test.ts` — disabled device is skipped; cached accessory for a disabled device is unregistered
- **Target branch:** `dev`

## Implementation checklist

- [x] Add `disabled?: boolean` to `AccessoryConfig` in `src/ExternalPlatformConfig.ts`
- [x] Verify `disabled` flows through `flattenAccessoryConfiguration`; add a targeted `PlatformConfiguration` test
- [x] In `platform.ts` `discoverDevices()`: when `device.disabled === true`, call `unregisterPlatformAccessories` if a cached accessory exists, then `continue`
- [x] Update `config.schema.json` — `disabled` boolean in per-accessory section with description
- [x] Add `platform.ts` tests for the disabled skip-and-unregister path

## Verification

- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm test`
- [ ] `npm run watch` — set `disabled: true` for one speaker in Homebridge UI, save → confirm accessory disappears from Home app; flip back → confirm it reappears

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `feat: add disabled flag to unregister a speaker from HomeKit without removing config`
- **Targets:** `dev`
