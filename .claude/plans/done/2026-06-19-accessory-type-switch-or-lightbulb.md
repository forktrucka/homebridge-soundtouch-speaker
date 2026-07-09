---
feature: Configurable accessory type — Switch or Lightbulb
status: done # 2026-06-21
date: 2026-06-19
branch: feat/accessory-type
commit-type: feat
---

# Configurable accessory type — Switch or Lightbulb

## Context

Today every speaker is exposed as a HomeKit **Switch** with a single `On`
characteristic (power), hardcoded in
`SoundTouchSpeakerPlatformAccessory.createAccessory` (`:71`). We want the user to
choose, per speaker (with a global default), whether a speaker appears as a
**Switch** (on/off only — current behavior) or a **Lightbulb** (on/off **and**
volume via Brightness — see plan 02).

This plan delivers only the **accessory-type plumbing + the Lightbulb service
shell**. The Brightness/volume characteristic itself is plan 02, which depends on
this. Default must stay `switch` so existing installs are unchanged.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-19 | `accessoryType` is per-accessory with a global default; default `switch` | No surprise for existing installs on upgrade | Defaulting to `lightbulb` — silently changes every current user's accessory |
| 2026-06-19 | Keep the `On` characteristic on both Switch and Lightbulb | Lightbulb also exposes `On`; reuses `SoundTouchSpeakerOnCharacteristic` unchanged | A separate power class per type |
| 2026-06-19 | Finding: service type is hardcoded to Switch in `createAccessory` (`SoundTouchSpeakerPlatformAccessory.ts:71`) | Single switch-point to branch on | — |
| 2026-06-19 | Finding: `flattenAccessoryConfiguration` copies all keys, but `DeviceConfiguration.create`/`fromAccessoryConfiguration` copy named fields only | New config fields must be threaded through `DeviceConfiguration` explicitly | — |
| 2026-06-19 | Finding: changing an accessory's type leaves an orphan service (different `getServiceName`) | Requires explicit pruning — see checklist | — |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

- `src/ExternalPlatformConfig.ts` — add `accessoryType?: 'switch' | 'lightbulb'`
  to `AccessoryConfig` and to `GlobalConfig` (so a global default flows through
  `flattenAccessoryConfiguration`, which already copies all non-undefined keys).
- `src/devices/SoundTouch/SoundTouchDeviceConfiguration.ts` — add a readonly
  `accessoryType` (default `'switch'`); thread it through the constructor,
  `fromAccessoryConfiguration`, and `create` (these copy named fields explicitly,
  so it won't propagate automatically).
- `src/devices/SoundTouch/SoundTouchDevice.ts` — `getOrCreateDeviceConfiguration`
  builds `DeviceConfiguration` for discovered devices; pass `accessoryType`
  through its `create`/`fromAccessoryConfiguration` calls.
- `src/PlatformConfiguration.ts` — `fromExternalConfiguration` builds configs;
  ensure `accessoryType` (global → per-accessory) reaches `DeviceConfiguration`.
- `src/accessories/services/SoundTouchSpeakerCharacteristic.ts` — extend the
  `ServiceType` enum (e.g. add a `LIGHTBULB` member) used for the service name/subtype.
- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — in `createAccessory`,
  pick `platform.service.Lightbulb` vs `platform.service.Switch` from
  `device.configuration.accessoryType`. The `On` characteristic stays on both
  (Lightbulb also has `On`).
- `config.schema.json` — add an `accessoryType` enum/select under both
  `accessories.items.properties` and `global.properties`.

## Conventions for this change

- **Commit type:** `feat:` → minor release.
- **Config schema touched:** yes — `config.schema.json` + `ExternalPlatformConfig`
  + `DeviceConfiguration`, with matching tests (per **homebridge-developer** config-flow).
- **Tests to add/update:** `src/__tests__/PlatformConfiguration.test.ts`,
  `src/devices/SoundTouch/__tests__/SoundTouchDeviceConfiguration.test.ts`,
  `src/__tests__/ExternalPlatformConfig.test.ts` — assert default `switch`, global
  default, and per-accessory override.
- Follow the **coding-conventions** skill (ESM `.js` imports, lint/format, the
  typecheck+lint+test gate).
- **Target branch:** `dev` (squash-merged; PR title is the released commit message).

## Implementation checklist

- [ ] Add `accessoryType` to `AccessoryConfig` + `GlobalConfig`
- [ ] Add `accessoryType` (default `switch`) to `DeviceConfiguration` and thread
      through `create` / `fromAccessoryConfiguration` / constructor
- [ ] Pass `accessoryType` through `PlatformConfiguration.fromExternalConfiguration`
      and `SoundTouchDevice.getOrCreateDeviceConfiguration`
- [ ] Extend `ServiceType`; branch service creation in `createAccessory`
- [ ] **Prune stale service on type change:** when a cached accessory switches
      Switch↔Lightbulb the old service lingers (different `getServiceName`); remove
      the now-unused service in `ensureAccessoryService`/`createAccessory` so HomeKit
      doesn't show a dead tile
- [ ] Add `accessoryType` to `config.schema.json` (accessory + global)
- [ ] Add/update tests

> shipped; checklist was not maintained

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run watch` — in `test/hbConfig/config.json` set one accessory to
      `lightbulb`, one to default; confirm a Lightbulb vs Switch tile appears and
      both toggle power. Flip an accessory's type and restart; confirm no orphan
      service remains (delete `test/hbConfig/accessories/cachedAccessories` to also
      test a clean install).

## PR / release notes

- **PR title:** `feat: let each speaker be a Switch or a Lightbulb accessory`
- **Targets:** `dev`
