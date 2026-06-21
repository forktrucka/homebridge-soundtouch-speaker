---
feature: Speaker zones — configurable multi-room groups exposed as a HomeKit accessory
status: planned
date: 2026-06-21
branch: feat/speaker-zones
commit-type: feat
---

# Speaker zones

## Context

The SoundTouch "Play Everywhere" zone API lets one speaker act as master and
stream to one or more slave speakers in sync. Today the plugin treats every
speaker as an independent HomeKit accessory — there is no way to activate a
multi-room group from the Home app.

This plan adds a top-level `zones` config array. Each entry names a primary
(master) speaker and one or more slave speakers (by the name used in `accessories`
or on the device), gives the group a HomeKit display name, and exposes a single
switch/lightbulb accessory for the zone. When the zone is turned on, the
SoundTouch zone API is invoked to group the speakers; when turned off the zone
is dissolved. While a zone is active its slave speakers are made **unavailable**
in HomeKit (HAP `SERVICE_COMMUNICATION_FAILURE` on every getter/setter) so users
aren't confused by conflicting controls. Slaves are restored when the zone is
dissolved or when Homebridge restarts and `getZone()` shows no active zone.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-21 | Zone API is already fully implemented | `src/devices/SoundTouch/api/zone.ts` + `api.ts` expose `getZone`, `setZone`, `addZoneSlave`, `removeZoneSlave`. Zone model: `{ master: string (MAC), members: Member[], senderIpAddress?: string }`. No new API code needed. | — |
| 2026-06-21 | Zone accessory UUID: `uuid.generate('zone::' + zone.name)` | Zone name is user-chosen and stable across restarts; prefixing with `zone::` avoids colliding with speaker UUIDs (which use the MAC address). | Hash of member list (changes if slaves change) |
| 2026-06-21 | `setZone` requires master MAC + slave MACs + IPs — must be resolved at runtime | The zone API payload is `<zone master="$MAC" senderIPAddress="$IP"><member ipaddress="$IP">$MAC</member>…</zone>`. MACs are only known after the device's `/info` call resolves. Zone config references speaker *names*; the platform must cross-reference to resolved `SoundTouchDevice` objects to get MAC/IP. | Store MACs in config (brittle, breaks when devices change IP/reimaged) |
| 2026-06-21 | Slave suppression: make accessories unavailable (HapStatusError) — do NOT unregister | Unregistering removes HomeKit room assignments, automations, and scenes. Making slaves report `SERVICE_COMMUNICATION_FAILURE` keeps their tile visible but prevents conflicting control while zoned. | Unregister accessories (loses room/automation state — destructive UX) |
| 2026-06-21 | Platform holds a `Set<string>` of suppressed device IDs | Platform already holds `_accessories` and `_accessoryWrappers`; adding `_suppressedDeviceIds: Set<string>` lets all characteristic getters/setters ask "am I suppressed?" without coupling to zone state directly. | Suppression flag on each `SoundTouchDevice` (requires all devices to hold platform ref) |
| 2026-06-21 | Zone activation POSTs to master only; dissolution also POSTs to master | `setZone` is called on the master's API. To dissolve, call `removeZoneSlave` per slave from the master's API (or `setZone` with an empty member list — verify against real device in Spike C Part 2). | Call each slave's API to leave the zone (race-prone) |
| 2026-06-21 | Startup zone sync: call `getZone()` on each primary at `didFinishLaunching` | If Homebridge restarts while a zone was active, the characteristic must start as "on" and slaves must start suppressed. `getZone()` on the master reveals current zone membership. | Persist zone state in accessory context (stale on device reboot) |
| 2026-06-21 | `feat:` commit type — minor release | Adds a new user-facing config field and accessory class. | `chore:` (wrong — user-visible change), `fix:` (wrong) |
| 2026-06-21 | Slave name matching: match `zone.slaves[]` against `DeviceConfiguration.name` first, then device-reported name | Users set `name` in `accessories`; that name appears in `DeviceConfiguration.name`. If unmatched at startup, log a warning and skip that slave (don't crash). | Require IP-based slave reference (worse UX for users who use room-based discovery) |
| 2026-06-21 | Zone accessory type: always Switch by default; honour per-zone `accessoryType` override | A zone on/off is binary and doesn't imply volume control. Volume on the primary still works via the primary's own lightbulb. | Hard-code as Lightbulb (zone volume control is a separate, later feature) |
| 2026-06-21 | Zone `accessoryType` can be overridden per zone in config | Keeps the pattern consistent with per-speaker `accessoryType`. | Global-only override (inflexible) |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

### Config (user-facing — all three layers must change together)

- `config.schema.json` — add top-level `zones` array with `name` (string,
  required), `primary` (string, required), `slaves` (string[], min 1, required),
  `accessoryType` (`'switch' | 'lightbulb'`, optional).
- `src/ExternalPlatformConfig.ts` — add `ZoneConfig` interface and `zones?:
  ZoneConfig[]` to `ExternalPlatformConfig`.
- `src/PlatformConfiguration.ts` — thread `zones: ZoneConfiguration[]` through
  `fromExternalConfiguration`; add `ZoneConfiguration` typed internal class.
- `src/__tests__/PlatformConfiguration.test.ts` — add zone config round-trip
  tests (present, absent, defaults).
- `src/__tests__/ExternalPlatformConfig.test.ts` — add zone shape tests.

### New files

- `src/zones/SoundTouchZoneAccessory.ts` — the zone's platform accessory
  wrapper. Mirrors `SoundTouchSpeakerPlatformAccessory` but controls a zone
  rather than a single speaker. Holds refs to the primary `SoundTouchDevice`
  and the resolved slave `SoundTouchDevice[]`. Exposes `init()`, `refresh()`,
  `stopPolling()`.
- `src/zones/SoundTouchZoneOnCharacteristic.ts` — `On` (Switch) or `On` +
  `Brightness` (Lightbulb) characteristic. `setOn(true)` calls
  `api.setZone(…)` and suppresses slaves; `setOn(false)` dissolves the zone
  and restores slaves. `getOn()` calls `api.getZone()` and checks whether
  membership matches the configured slaves.
- `src/zones/__tests__/SoundTouchZoneOnCharacteristic.test.ts`

### Modified files

- `src/platform.ts`
  - Add `_suppressedDeviceIds: Set<string>` (line ~25 block).
  - Add `_zoneWrappers: Map<string, SoundTouchZoneAccessory>` alongside
    `_accessoryWrappers`.
  - In `discoverDevices()`: after individual speaker accessories are set up,
    call `_resolveZones()`.
  - Add `_resolveZones()`: for each `ZoneConfiguration`, find primary and slave
    `SoundTouchDevice` objects by name; call `getZone()` on the primary to sync
    initial suppression state; register or restore the zone accessory.
  - Expose `isSuppressed(deviceId: string): boolean` and
    `setSuppressed(deviceId: string, suppressed: boolean): void` helpers.
- `src/accessories/services/SoundTouchSpeakerOnCharacteristic.ts` — check
  `platform.isSuppressed(device.id)` at the start of both `setOn` and `getOn`;
  throw `HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE)` if suppressed.
- `src/accessories/services/SoundTouchSpeakerBrightnessCharacteristic.ts` —
  same suppression guard in `getBrightness` and `setBrightness`.
- `src/accessories/services/SoundTouchSpeakerInformationCharacteristic.ts` —
  no change; information service is never suppressed.
- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — suppress polling
  refresh: skip `this.refresh()` when `platform.isSuppressed(device.id)` to
  avoid spamming the master speaker with status requests.

### Tests to add / update

- `src/zones/__tests__/SoundTouchZoneOnCharacteristic.test.ts` — unit tests
  using the fake-gabbo + fake-soundtouch harness stubs; test: zone on activates
  API + suppresses slaves; zone off dissolves + restores; `getOn` reflects API
  response; startup sync from `getZone()`.
- `src/__integration__/zone-lifecycle.integration.test.ts` — integration test
  using `FakeSoundTouchServer` for both primary and slave, asserting full
  activate/deactivate cycle and suppression behaviour.
- Existing characteristic tests — add one case each: getter/setter returns
  `SERVICE_COMMUNICATION_FAILURE` when `platform.isSuppressed()` returns true.

## Conventions for this change

- **Commit type:** `feat:` → minor release.
- **Config schema touched:** yes — `config.schema.json`, `ExternalPlatformConfig`,
  `PlatformConfiguration`, and both their test files.
- **Tests to add/update:** see Affected areas above.
- **Target branch:** `dev` (squash-merged; PR title is the released commit
  message).
- **ESM import rule:** all relative imports end `.js` — especially
  `./zones/SoundTouchZoneAccessory.js` etc.
- **Domain skill to re-read before implementing:** `soundtouch-api-expert`
  (zone payload shapes); `homebridge-developer` (dynamic platform accessory
  lifecycle — critical for zone accessory registration and UUID stability).

## Implementation checklist

- [ ] Add `ZoneConfig` to `src/ExternalPlatformConfig.ts`
- [ ] Add `ZoneConfiguration` to `src/PlatformConfiguration.ts` and thread
      through `fromExternalConfiguration`
- [ ] Update `config.schema.json` with `zones` array
- [ ] Update `PlatformConfiguration` and `ExternalPlatformConfig` tests
- [ ] Add `_suppressedDeviceIds`, `isSuppressed()`, `setSuppressed()` to
      `src/platform.ts`
- [ ] Add suppression guard to `SoundTouchSpeakerOnCharacteristic` (set + get)
- [ ] Add suppression guard to `SoundTouchSpeakerBrightnessCharacteristic`
      (set + get)
- [ ] Skip polling refresh in `SoundTouchSpeakerPlatformAccessory` when suppressed
- [ ] Create `src/zones/SoundTouchZoneOnCharacteristic.ts`
- [ ] Create `src/zones/SoundTouchZoneAccessory.ts`
- [ ] Add `_resolveZones()` to `src/platform.ts`
- [ ] Register/restore zone accessories in `discoverDevices()`
- [ ] Add `src/zones/__tests__/SoundTouchZoneOnCharacteristic.test.ts`
- [ ] Add `src/__integration__/zone-lifecycle.integration.test.ts`
- [ ] Update existing characteristic tests with suppression cases
- [ ] `npm run typecheck && npm run lint && npm test`
- [ ] `npm run knip` — confirm no unused exports

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run watch` — confirm zone accessory appears in Home app, slave tiles
      become unresponsive when zone is on, recover when zone is off
- [ ] Restart Homebridge with zone active — confirm characteristic initialises
      as "on" and slaves remain suppressed

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `feat: add configurable speaker zones with slave suppression`
- **Targets:** `dev`
