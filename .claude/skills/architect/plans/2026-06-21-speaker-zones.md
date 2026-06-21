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
is dissolved. Individual slave accessories remain **fully functional in HomeKit**
throughout — users can still turn a slave off or adjust its volume while the zone
is active (e.g. to quieten one room without leaving the zone entirely).

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-21 | Zone API is already fully implemented | `src/devices/SoundTouch/api/zone.ts` + `api.ts` expose `getZone`, `setZone`, `addZoneSlave`, `removeZoneSlave`. Zone model: `{ master: string (MAC), members: Member[], senderIpAddress?: string }`. No new API code needed. | — |
| 2026-06-21 | Zone accessory UUID: `uuid.generate('zone::' + zone.name)` | Zone name is user-chosen and stable across restarts; prefixing with `zone::` avoids colliding with speaker UUIDs (which use the MAC address). | Hash of member list (changes if slaves change) |
| 2026-06-21 | `setZone` requires master MAC + slave MACs + IPs — must be resolved at runtime | The zone API payload is `<zone master="$MAC" senderIPAddress="$IP"><member ipaddress="$IP">$MAC</member>…</zone>`. MACs are only known after the device's `/info` call resolves. Zone config references speaker *names*; the platform must cross-reference to resolved `SoundTouchDevice` objects to get MAC/IP. | Store MACs in config (brittle, breaks when devices change IP/reimaged) |
| 2026-06-21 | No slave suppression — slaves remain fully controllable while a zone is active | Users need to adjust individual slave volume or power during a zone (e.g. quieten one room). Suppression would block that. The zone on/off just drives grouping; individual accessories are independent. | Suppress slaves with HapStatusError (blocks volume/power control — bad UX); unregister accessories (loses room/automation state — destructive) |
| 2026-06-21 | Zone activation POSTs to master only; dissolution also POSTs to master | `setZone` is called on the master's API. To dissolve, call `removeZoneSlave` per slave from the master's API (or `setZone` with an empty member list — verify against real device in Spike C Part 2). | Call each slave's API to leave the zone (race-prone) |
| 2026-06-21 | Startup zone sync: call `getZone()` on each primary at `didFinishLaunching` | If Homebridge restarts while a zone was active, the characteristic must start as "on". `getZone()` on the master reveals current zone membership. | Persist zone state in accessory context (stale on device reboot) |
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
  `Brightness` (Lightbulb) characteristic. `setOn(true)` calls `api.setZone(…)`;
  `setOn(false)` dissolves the zone via `removeZoneSlave` (or equivalent).
  `getOn()` calls `api.getZone()` and checks whether membership matches the
  configured slaves.
- `src/zones/__tests__/SoundTouchZoneOnCharacteristic.test.ts`

### Modified files

- `src/platform.ts`
  - Add `_zoneWrappers: Map<string, SoundTouchZoneAccessory>` alongside
    `_accessoryWrappers`.
  - In `discoverDevices()`: after individual speaker accessories are set up,
    call `_resolveZones()`.
  - Add `_resolveZones()`: for each `ZoneConfiguration`, find primary and slave
    `SoundTouchDevice` objects by name; call `getZone()` on the primary to sync
    initial zone-on state; register or restore the zone accessory.
- No changes to `SoundTouchSpeakerOnCharacteristic`, `SoundTouchSpeakerBrightnessCharacteristic`,
  or `SoundTouchSpeakerPlatformAccessory` — slaves remain fully independent.

### Tests to add / update

- `src/zones/__tests__/SoundTouchZoneOnCharacteristic.test.ts` — unit tests:
  zone on calls `setZone()` with correct master/slave MACs; zone off calls
  `removeZoneSlave()` per slave; `getOn()` returns true when `getZone()` response
  includes all configured slaves; startup sync from `getZone()`.
- `src/__integration__/zone-lifecycle.integration.test.ts` — integration test
  using `FakeSoundTouchServer` for both primary and slave, asserting full
  activate/deactivate cycle. No suppression assertions needed.

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
- [ ] Create `src/zones/SoundTouchZoneOnCharacteristic.ts`
- [ ] Create `src/zones/SoundTouchZoneAccessory.ts`
- [ ] Add `_zoneWrappers` and `_resolveZones()` to `src/platform.ts`
- [ ] Register/restore zone accessories in `discoverDevices()`
- [ ] Add `src/zones/__tests__/SoundTouchZoneOnCharacteristic.test.ts`
- [ ] Add `src/__integration__/zone-lifecycle.integration.test.ts`
- [ ] `npm run typecheck && npm run lint && npm test`
- [ ] `npm run knip` — confirm no unused exports

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run watch` — confirm zone accessory appears in Home app; toggle zone
      on/off and verify slave speakers continue to respond independently
- [ ] Restart Homebridge with zone active — confirm zone characteristic
      initialises as "on" via `getZone()` startup sync

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `feat: add configurable multi-room speaker zones`
- **Targets:** `dev`
