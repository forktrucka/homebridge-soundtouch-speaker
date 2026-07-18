---
feature: Speaker zones — configurable multi-room groups exposed as a HomeKit accessory
status: in-review
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
| 2026-06-21 | `SoundTouchZoneAccessory` and `SoundTouchZoneOnCharacteristic` use private constructors + static factory methods | Follows the repo-wide static factory convention (coding-conventions skill). Mirrors the existing pattern: `SoundTouchSpeakerPlatformAccessory.createAccessory()`, `SoundTouchDevice.fromConfiguredAccessory()`. Factory on `ZoneAccessory`: `static create(props: { config, primary, slaves, api, logger })`. Factory on `ZoneOnCharacteristic`: `static create(props: { service, primary, slaves, logger })`. | Public constructors with `new ZoneAccessory(...)` at call sites (violates factory convention) |
| 2026-06-21 | `SoundTouchZoneOnCharacteristic` extends the existing `SoundTouchSpeakerCharacteristic` base (treating the primary as its `device`) rather than a bespoke base | Reuses `wrapHapGet`/`wrapHapSet`/HAP error handling/`DeviceLogger` wiring already proven for speaker characteristics; the public `create()` factory still takes `primary`/`slaves` per the plan's vocabulary, mapping `primary` to `device` internally. | A zone-specific base class (duplicates HAP error wrapping for no benefit) |
| 2026-06-21 | `_resolveZones()` is called from inside `discoverDevices()`, not from a separate step in `didFinishLaunching` | The existing stale-accessory prune loop at the end of `discoverDevices()` walks every cached accessory not seen this run and unregisters it. Zone UUIDs must be pushed into the same `_discoveredCacheUUIDs` list *before* that loop runs, or a restart would immediately prune a previously-registered zone accessory. Calling `_resolveZones()` after the per-speaker loop but before the prune loop keeps zone accessories under the same pruning logic as speaker accessories for free. | Two separate top-level calls in `didFinishLaunching` (would need to duplicate the prune loop for zones) |
| 2026-06-21 | Extended the integration test helpers (`FakeSoundTouchServer.requests[]`, `StubCharacteristic.invokeSet/invokeGet`) | Neither existed: the fake server didn't capture request bodies (needed to assert the `setZone`/`removeZoneSlave` XML payload), and the HAP stub's `onSet`/`onGet` were no-ops (needed to actually drive a characteristic write end-to-end). Both are additive and backward-compatible with existing integration tests. | Testing only at the unit level (would leave the platform-to-zone-accessory wiring, including startup pruning, unverified) |
| 2026-07-18 | Real-hardware bug: `setZone`/`removeZoneSlave` succeed at the protocol level even when a device is in standby, but the zone produces no audible effect until each device is separately powered on — toggling the zone switch silently did nothing for a speaker left off. Fixed by having `SoundTouchZoneOnCharacteristic#setOn` power on the primary and every slave (via `SoundTouchDevice.deviceIsOn` + `pressKey(KeyValue.power)`, run concurrently with `Promise.all`, only for devices not already in the desired state) before `setZone` on activate, and after `removeZoneSlave` on deactivate — mirroring the existing pattern in `SoundTouchSpeakerOnCharacteristic#setOn`. | Confirmed against a real Bose SoundTouch speaker: `setZone` HTTP call returns success while the target speaker is in standby, but no audio plays until the speaker is powered. | Suppressing the zone switch until all devices are already on (bad UX — defeats the point of a one-tap "whole house" switch); relying on the device's own zone-join behavior to auto-wake it (not observed on real hardware) |
| 2026-07-18 | Landed zone volume control, the feature deferred by the 2026-06-21 "Hard-code as Lightbulb (zone volume control is a separate, later feature)" row above: when a zone's `accessoryType` is `lightbulb`, `SoundTouchZoneAccessory` now also attaches a `SoundTouchZoneVolumeCharacteristic` (Brightness) to the same Lightbulb service, alongside the existing On characteristic. Design is a **relative-offset model**, not "set everyone to the same value" — moving the slider computes `delta = newValue - primary's current volume` (read fresh at set-time) and applies that same delta to the primary and every slave (each read fresh, `Promise.all`'d), clamped to 0–100, preserving whatever relative balance already existed between speakers. `getBrightness()`/`refresh()` report the primary's own volume, mirroring `SoundTouchSpeakerBrightnessCharacteristic`. `value === 0` is a no-op (On characteristic owns power-off, matching the existing single-speaker Brightness characteristic). `gabboEvents = ['volumeUpdated']` is set on the new characteristic for pattern consistency with `SoundTouchSpeakerBrightnessCharacteristic`, though note: unlike the single-speaker accessory, `SoundTouchZoneAccessory` does not currently run a gabbo event-listener loop (that wiring lives in `SoundTouchSpeakerPlatformAccessory#init`, which zones don't share) — the property is inert today and only takes effect if/when zone accessories gain the same gabbo wiring. | Confirmed with the user (2026-07-18 brief) as real Bose-app parity — the Bose app's zone volume slider shifts every member by the same offset rather than syncing them to one level. | "Set everyone to the same value" (destroys pre-existing per-room balance, not how the Bose app behaves) |
| 2026-07-18 | Real-hardware follow-up bug: powering a device via the raw `pressKey(KeyValue.power)` call added above bypasses that device's own `SoundTouchSpeakerOnCharacteristic` entirely, so the device's *own* standalone speaker accessory's On tile in the Home app doesn't refresh promptly. Confirmed on real hardware specifically for **deactivation**: the "Whole House" zone switch correctly showed off, but the individual room accessories still showed "on". The gabbo capture in `plans/done/2026-06-20-websocket-push.md` (2026-07-17 row) confirms the gap is real for this direction — the socket is silent through the entire standby transition (no `close`, no traffic for 113s) — so nothing but the 5-minute reconciliation poll would have caught a power-off. The same capture found the *opposite* direction is not silent: on power-on, `connectionStateUpdated` (plus `nowSelectionUpdated`/`nowPlayingUpdated`) arrived on the gabbo socket, which `SoundTouchSpeakerOnCharacteristic.gabboEvents` already listens for — so the power-on refresh added here is a reasonable-but-unconfirmed "don't wait for the round trip" improvement rather than closing a confirmed gap (the capture didn't verify whether power initiated via this plugin's own HTTP `pressKey` emits the same notification as a physical-button/app-initiated power-on, only that *some* trigger during that session did). Fixed by adding `SoundTouchHomebridgePlatform#refreshAccessoryForDevice(deviceId)` (backed by a new `_accessoryWrappersByDeviceId` map populated/pruned alongside the existing UUID-keyed map; no-ops and never throws when no wrapper is registered for that id) and calling it from `SoundTouchZoneOnCharacteristic#_ensureDevicesPowered` immediately after each device's `pressKey` call, per-device inside the existing `Promise.all`, with its own try/catch so a refresh failure can't block or fail the zone operation — applied symmetrically to both directions since the fix is cheap and harmless even where the gap isn't strictly confirmed. | Confirmed against a real Bose SoundTouch speaker for the deactivate path: after the prior power-on/off fix, the zone switch state was correct but the individual speaker accessories' On tiles were stale until the next reconciliation poll (up to 5 minutes later). The activate-path benefit is inferred from the 2026-07-17 gabbo capture, not independently re-verified against zone activation on real hardware. | A separate device-id-to-uuid lookup table computed on demand (redundant bookkeeping vs. maintaining one small additional map alongside the existing wrapper map); refreshing via the gabbo event bus (adds indirection for no benefit — the platform already owns both the zone characteristic and the speaker wrapper); skipping the refresh on the power-on path since it may be redundant with the existing gabbo listener (rejected — cheap, harmless, and removes a dependency on unconfirmed HTTP-`pressKey`-vs-physical-trigger notification parity) |
| 2026-07-18 | Real-hardware bug: `pressKey(value)` is `holdKey(value, 0)` — a press immediately followed by a release with no deliberate gap. Direct testing against a real Bose speaker confirmed this **silently fails to toggle the POWER key** (device stays in whatever state it was in), while the identical press/release with a 300ms gap toggles reliably every time. `SoundTouchZoneOnCharacteristic#_ensureDevicesPowered` used `pressKey(KeyValue.power)`, meaning a zone activation/deactivation could silently fail to actually power a device — independent of, and in addition to, the HomeKit-tile-staleness bug fixed above. Fixed by switching to `device.api.holdKey(KeyValue.power, POWER_HOLD_DURATION_MS)` with `POWER_HOLD_DURATION_MS = 300`. Scoped to this one call site — `pressKey` itself and every other call site (transport controls, preset select, `storePreset`) are untouched. | Confirmed against a real Bose SoundTouch speaker: two back-to-back zero-gap press/release attempts both failed to toggle POWER; two back-to-back 300ms-gap attempts both succeeded. | Changing `pressKey`'s default behavior globally (would silently alter timing for every other key — transport/preset keys are working correctly today and weren't tested against this failure mode) |

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
  and the resolved slave `SoundTouchDevice[]`. Private constructor; exposes
  `static create(props)`, `init()`, `refresh()`, `stopPolling()`.
- `src/zones/SoundTouchZoneOnCharacteristic.ts` — `On` (Switch) or `On` +
  `Brightness` (Lightbulb) characteristic. Private constructor; exposes
  `static create(props)`. `setOn(true)` calls `api.setZone(…)`;
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

- [x] Add `ZoneConfig` to `src/ExternalPlatformConfig.ts`
- [x] Add `ZoneConfiguration` to `src/PlatformConfiguration.ts` and thread
      through `fromExternalConfiguration`
- [x] Update `config.schema.json` with `zones` array
- [x] Update `PlatformConfiguration` and `ExternalPlatformConfig` tests
- [x] Create `src/zones/SoundTouchZoneOnCharacteristic.ts`
- [x] Create `src/zones/SoundTouchZoneAccessory.ts`
- [x] Add `_zoneWrappers` and `_resolveZones()` to `src/platform.ts`
- [x] Register/restore zone accessories in `discoverDevices()`
- [x] Add `src/zones/__tests__/SoundTouchZoneOnCharacteristic.test.ts`
- [x] Add `src/__integration__/zone-lifecycle.integration.test.ts`
- [x] `npm run typecheck && npm run lint && npm test`
- [x] `npm run knip` — confirm no unused exports
- [x] Add `src/zones/SoundTouchZoneVolumeCharacteristic.ts` (relative-offset
      zone volume control, wired into `SoundTouchZoneAccessory` for
      `accessoryType: 'lightbulb'` zones)
- [x] Add `src/zones/__tests__/SoundTouchZoneVolumeCharacteristic.test.ts`
- [x] Add `src/__integration__/zone-volume.integration.test.ts`

## Verification

- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm test`
- [ ] `npm run watch` — confirm zone accessory appears in Home app; toggle zone
      on/off and verify slave speakers continue to respond independently
      (not run against a real device this session — see note below)
- [ ] Restart Homebridge with zone active — confirm zone characteristic
      initialises as "on" via `getZone()` startup sync
      (not run against a real device this session — see note below)

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `feat: add configurable multi-room speaker zones`
- **Targets:** `dev`
