---
feature: Preserve HomeKit accessory renames across Homebridge restarts
status: planned # planned | in-progress | beta | done | cancelled
date: 2026-07-18
branch: fix/preserve-homekit-rename # branched off dev (see sequencing note — zone half may fold into #162)
commit-type: fix
---

# Preserve HomeKit accessory renames across restarts

## Context

Confirmed by real-world testing: renaming a speaker accessory inside the Apple
Home app is silently reverted back to the plugin's config-derived name after a
Homebridge restart.

Root cause (diagnosed from the code, not yet fixed):
`SoundTouchSpeakerInformationCharacteristic.init()`
(`src/accessories/services/SoundTouchSpeakerInformationCharacteristic.ts`, line
30-31) unconditionally calls
`informationService.setCharacteristic(this.platform.characteristic.Name, deviceName)`
on **every** accessory initialization. That `init()` runs for both freshly
created accessories **and** accessories restored from the Homebridge cache
(every restart), because `discoverDevices()` calls the identical
`SoundTouchSpeakerPlatformAccessory.create(...)` path down both branches
(`src/platform.ts` lines 202-206 for the restore branch, 220-224 for the new
branch).

Re-asserting the `Name` characteristic on an already-paired accessory is a known
Homebridge anti-pattern: HomeKit treats the pushed value as an authoritative
rename and overwrites whatever custom name the user set in the Home app. The same
pattern was introduced for zone accessories in the still-open `feat/speaker-zones`
PR #162 — `SoundTouchZoneAccessory._setInformation()`
(`src/zones/SoundTouchZoneAccessory.ts` line 142) sets `Name` on every
`SoundTouchZoneAccessory.create(...)`, which likewise runs on every restart via
`_registerZoneAccessory()` (`src/platform.ts` lines 351-369).

**Fix intent (user's words):** "update the information characteristic so it keeps
our internal identifiers, and honors the changes made in HomeKit." Concretely:

- Keep re-asserting the non-user-editable identity fields unconditionally on
  every init — `Manufacturer`, `Model`, `SerialNumber` (stable per-device id;
  required by verified-plugin compliance), and `FirmwareRevision` (should update
  when it changes). These are not editable in the Home app, so re-asserting them
  is harmless and desirable.
- Set `Name` **only on true first creation** of an accessory (a brand-new
  accessory legitimately needs its initial name). On a cache-restore, do **not**
  touch `Name`, so a HomeKit-side rename survives.

## Decisions & findings

The durable record so we don't re-litigate decisions or re-investigate facts.
**Append, don't overwrite.**

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-07-18 | **Root cause confirmed:** `Name` is re-pushed on every restart because `init()` / `_setInformation()` run identically for cache-restored and new accessories. | `SoundTouchSpeakerInformationCharacteristic.init()` line 30-31 sets `Name` unconditionally; `SoundTouchSpeakerPlatformAccessory.create` is called down both the restore (`platform.ts` 202) and new (`platform.ts` 220) branches. Zone equivalent: `SoundTouchZoneAccessory._setInformation()` line 142, called from `_registerZoneAccessory` for both branches. | — |
| 2026-07-18 | **Signal mechanism = an explicit `isNewAccessory: boolean` prop threaded through the static factories** from `discoverDevices()` down to the information characteristic. | `discoverDevices()` already cleanly distinguishes the two cases (`const existingAccessory = this._accessories.get(uuid)`); `isNewAccessory = existingAccessory === undefined`. Threading an explicit boolean matches this repo's explicit-props static-factory convention (`plugin-coding-conventions`), keeps the decision at the one place that already knows it, and is trivially unit-testable. | (a) **Persist a "created" flag in `accessory.context`** — works across restarts but adds redundant persisted state duplicating what the platform branch already knows, and must be written on first create. (b) **Infer from whether `Name` already has a value** — unreliable: `new this.api.platformAccessory(device.name, uuid)` pre-populates the AccessoryInformation `Name` to `device.name`, so a new accessory already has a Name before `init()` runs. |
| 2026-07-18 | **Safe-to-always-assert fields:** `Manufacturer`, `Model`, `SerialNumber`, `FirmwareRevision`. **Set-once-only field:** `Name`. | Manufacturer/Model/SerialNumber/FirmwareRevision are not user-editable in the Home app; re-asserting is harmless and keeps `SerialNumber` stable/unique per device (verified-plugin requirement in `homebridge-developer`). `FirmwareRevision` *should* refresh when it changes. Only `Name` is user-editable, so only `Name` must be gated. | Gating all fields behind `isNewAccessory` — would regress the "always set a unique SerialNumber" compliance requirement and stop FirmwareRevision from updating. |
| 2026-07-18 | **New-accessory path still needs to set `Name` once** (not a no-op). | `SoundTouchSpeakerInformationCharacteristic.calculateDeviceName()` appends `" Speaker"` when the device name doesn't already end in it; `new platformAccessory(device.name, uuid)` only pre-sets the raw `device.name`. So first creation must push the computed name to get the intended initial label. | Never setting `Name` at all — would drop the `" Speaker"` suffix behaviour on genuinely new accessories. |
| 2026-07-18 | **`fix:` commit type → patch release.** | Corrects a confirmed user-facing bug (renames revert). No new config, no new capability. | `feat:` (not a new feature), `chore:` (user-visible correctness fix). |
| 2026-07-18 | **Secondary consideration to verify on-device, not part of the core fix:** the restore branch also reassigns `existingAccessory.displayName = device.name` (`platform.ts` line 200, and line 356 for zones). | `displayName` is Homebridge's internal/bridge-side cached name and, unlike re-pushing the HAP `Name` characteristic, is not the confirmed trigger of the HomeKit rename revert. The confirmed, code-diagnosed cause is the `Name` characteristic re-assertion. Flagged so the real-device verification step checks whether the `displayName` reassignment contributes; if it does, address as a follow-up rather than expanding this fix's scope speculatively. | Rewriting the `displayName` handling pre-emptively — unverified, risks regressing the legitimate config-driven rename path (renaming a speaker in config *should* still propagate). |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

Concrete files/dirs this touches.

### Speaker accessory (pre-existing bug — independent of zones)

- `src/accessories/services/SoundTouchSpeakerInformationCharacteristic.ts` — add
  `isNewAccessory: boolean` to the constructor props and `create(...)` factory,
  store it, and in `init()` guard the `Name` `setCharacteristic` call behind it.
  Keep Manufacturer / Model / SerialNumber / FirmwareRevision set unconditionally.
- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — thread
  `isNewAccessory` through `create(...)` → `createAccessory(...)` →
  `SoundTouchSpeakerInformationCharacteristic.create(...)`
  (`defaultCharacteristics` construction, line 169-171).
- `src/platform.ts` `discoverDevices()` — compute
  `const isNewAccessory = existingAccessory === undefined;` once and pass it into
  both `SoundTouchSpeakerPlatformAccessory.create({ ..., isNewAccessory })` calls
  (restore branch line 202, new branch line 220).

### Zone accessory (bug introduced in still-open #162 — see sequencing note)

- `src/zones/SoundTouchZoneAccessory.ts` — add `isNewAccessory: boolean` to
  `create(...)` props and pass it into `_setInformation(...)`; guard the `Name`
  `setCharacteristic` call (line 142) behind it while keeping
  Manufacturer/Model/SerialNumber unconditional.
- `src/platform.ts` `_registerZoneAccessory()` — pass
  `isNewAccessory: existingAccessory === undefined` into
  `SoundTouchZoneAccessory.create(...)` (line 363).

### Tests

- **New:** `src/accessories/services/__tests__/SoundTouchSpeakerInformationCharacteristic.test.ts`
  — unit-cover the gate directly (no such test exists today):
  - `isNewAccessory: true` → `init()` sets `Name` (to `calculateDeviceName()`),
    plus Manufacturer/Model/SerialNumber/FirmwareRevision.
  - `isNewAccessory: false` → `init()` does **not** set `Name`, but **still**
    sets Manufacturer/Model/SerialNumber/FirmwareRevision.
  - Spy on the AccessoryInformation service's `setCharacteristic` and assert which
    characteristic constants were/weren't passed. Use the manual
    `__mocks__/homebridge.js` for characteristic constants.
- **Extend:** `src/zones/__tests__/SoundTouchZoneOnCharacteristic.test.ts` or a
  focused new test around `_setInformation` — same matrix for zones (Name gated,
  identity fields always set).
- **Integration (the load-bearing proof):**
  `src/__integration__/platform-lifecycle.integration.test.ts` — add a
  restart-cycle scenario: (1) run `discoverDevices()` once (new accessory
  registered, Name set); (2) simulate a HomeKit rename by mutating the
  AccessoryInformation `Name` characteristic value (and/or `displayName`) on the
  cached accessory; (3) re-run `discoverDevices()` with the accessory now present
  in `_accessories` (the cache-restore path); (4) assert the mutated custom Name
  **survived** — the plugin did not re-push its config-derived name. Reuse the
  existing integration helpers in `src/__integration__/helpers`. This is the
  scenario that a plain unit test misses, because the bug only manifests across a
  restore cycle.

## Conventions for this change

- **Commit type:** `fix:` → **patch** release.
- **Config schema touched:** **no** — no user-facing config field changes.
- **Tests to add/update:** new info-characteristic unit test + zone unit
  coverage + a restart-cycle integration scenario (see Affected areas).
- **Target branch:** `dev` (squash-merged; PR title is the released commit
  message).
- **ESM import rule:** any new relative imports in tests/source end in `.js`
  (`plugin-coding-conventions`).
- **Domain skills to re-read before implementing:** `homebridge-developer`
  (AccessoryInformation / verified-plugin SerialNumber requirement, cache-restore
  lifecycle), `plugin-coding-conventions` (static-factory props, Jest + homebridge
  mock, the typecheck+lint+test gate).

## Sequencing / branching (open question for the technical lead)

The two halves share plumbing: **both** compute `isNewAccessory` inside
`discoverDevices()` in `src/platform.ts`. That coupling drives the branching
decision — two independent PRs both editing `discoverDevices()` will conflict.

- **Speaker half** is a pre-existing bug already shipped in `latest`, unrelated
  to zones → warrants a `fix/` branch off `dev` and its own patch release.
- **Zone half** fixes a bug that only exists on the still-open `feat/speaker-zones`
  branch (PR #162, `status: in-review`). Ideally it lands **before** #162 merges
  so the bug never reaches even a beta.

Options (decision deferred — flag to the technical lead / user):

1. **Fold the zone half into #162** (it is that plan's own code, so it belongs on
   the implementation branch) and ship the **speaker half** as a separate `fix/`
   branch off `dev`. Cleanest release story, but the two touch the same
   `discoverDevices()` lines, so whichever lands second must rebase/resolve the
   shared `isNewAccessory` plumbing.
2. **Single combined `fix/` branch off `dev` after #162 merges**, covering both
   accessory types in one patch (`fix: preserve HomeKit accessory renames across
   restart`). Avoids the plumbing conflict entirely; downside is the zone rename
   bug rides in the #162 beta briefly (low harm — zones is a brand-new feature
   not yet in `latest`).

Lean: option 2 if #162 is close to merging (simplest, no shared-line conflict);
option 1 if #162 will linger, to keep the zone bug out of beta. Either way this
is one plan — the delivery split is the technical lead's call.

## Implementation checklist

- [ ] Thread `isNewAccessory` through
      `SoundTouchSpeakerInformationCharacteristic` (constructor + `create`) and
      gate the `Name` set in `init()`
- [ ] Thread `isNewAccessory` through
      `SoundTouchSpeakerPlatformAccessory.create` → `createAccessory` →
      info-characteristic `create`
- [ ] Compute and pass `isNewAccessory` from `discoverDevices()` (both branches)
- [ ] Thread `isNewAccessory` through `SoundTouchZoneAccessory.create` →
      `_setInformation` and pass it from `_registerZoneAccessory()`
- [ ] Add `SoundTouchSpeakerInformationCharacteristic.test.ts`
- [ ] Add zone `_setInformation` unit coverage
- [ ] Add the restart-cycle integration scenario (rename survives restore)
- [ ] `npm run typecheck && npm run lint && npm test`
- [ ] `npm run knip` — confirm no unused exports introduced

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run watch` — **real device / real Home app required** (HomeKit's own
      rename storage lives outside the plugin and cannot be exercised by unit
      tests): pair the plugin, rename a speaker accessory in the Home app,
      restart Homebridge (nodemon does this on save), and confirm the custom
      name **persists**. Repeat for a zone accessory. Also confirm a genuinely
      new accessory still gets its correct initial `" Speaker"` name, and that a
      rename done via **config** (device `name` change) still propagates as
      expected. While there, sanity-check whether the `displayName` reassignment
      (Decisions row 2026-07-18, secondary consideration) has any residual effect.

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `fix: preserve HomeKit accessory renames across restart`
- **Targets:** `dev`
