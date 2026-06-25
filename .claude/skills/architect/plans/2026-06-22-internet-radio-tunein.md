---
feature: Internet radio via TuneIn
status: in-progress
date: 2026-06-22
branch: feat/internet-radio-tunein
commit-type: feat
---

# Internet radio via TuneIn

## Context

Bose's cloud services shut down in February 2026. The SoundTouch speaker's
built-in TuneIn/internet-radio support relied on that cloud, so it no longer
works out of the box.

This feature introduces a **typed preset management system** with internet radio
stations as the first type. Users declare a list of preset slots (1–6) in their
Homebridge config, each with a type and type-specific fields. For now the only
type is `station` (internet radio); Spotify playlists and others may follow
(possibly managed via the PWA — see plan `2026-06-19-progressive-web-app.md`).

**How it works (post-pivot — TUNEIN source via Bose cloud emulator):**

The plugin writes a `TUNEIN` preset to each configured slot on the SoundTouch
device. The preset ContentItem uses `source="TUNEIN"`, `type="stationurl"`,
`isPresetable="true"`, and `location="/v1/playback/station/<tuneInId>"`.

To resolve those station IDs to stream URLs at play time, the speaker must
contact a Bose BMX cloud server. Since Bose's cloud shut down, a lightweight
emulator (`scripts/bose-cloud.mjs`) runs locally and impersonates the BMX
endpoints the speaker needs:
- `GET /bmx/registry/v1/services` — BMX service registry listing TUNEIN
- `GET /marge/streaming/sourceproviders` — source provider list (activates TUNEIN)
- `GET /bmx/tunein/v1/playback/station/:id` — resolves TuneIn ID → stream URL
  via the RadioTime OPML API (`opml.radiotime.com`)

The speaker must be redirected to this emulator by editing
`/opt/Bose/etc/SoundTouchSdkPrivateCfg.xml` over SSH and setting:
- `bmxRegistryUrl → http://<HOST>:8000/bmx/registry/v1/services`
- `margeServerUrl → http://<HOST>:8000/marge`

This is a **one-time manual setup** on the speaker. The plugin itself does not
automate this SSH step.

At startup (and on a configurable schedule), the plugin calls `storePreset` on
each discovered device to write the configured TUNEIN preset into the specified
slot. The emulator handles stream resolution dynamically at play time, so
updating a station's TuneIn ID in config and restarting will re-write the preset
on the device.

**No HomeKit characteristics are added in this plan.** The physical preset
buttons on the speaker work immediately after preset writing. HomeKit integration
is a future concern.

**References used when designing this plan:**
- `https://gist.github.com/rody64/98a59990ff60ea962cac72cbe93edf56` —
  `LOCAL_INTERNET_RADIO` source format, `storePreset` cURL example.
- `https://github.com/Yimura/node-tunein-api/blob/master/src/Constants.js` —
  RadioTime OPML API endpoint and parameters.
- `https://github.com/timvw/soundcork` — Python Bose cloud replacement.
  `examples/Presets.xml` confirmed `type="stationurl"` and `isPresetable="true"`
  are required on ContentItems. `docs/speaker-setup.md` confirmed that redirecting
  the speaker to a custom cloud server requires invasive SSH setup (Mode C ruled out).

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-22 | Finding: native TuneIn ContentItem format is `source="TUNEIN"`, `type="stationurl"`, `location="/v1/playback/station/<id>"` | soundcork `examples/Presets.xml`; requires a soundcork-style BMX server | Informational — native TUNEIN source deferred; would need soundcork or equivalent |
| 2026-06-22 | Use `LOCAL_INTERNET_RADIO` with a Homebridge-hosted server | Fully self-contained; no dependency on soundcork or any other service | `source="TUNEIN"` path — requires a running BMX server |
| 2026-06-22 | `ContentItem.type` is **confirmed required** — `"stationurl"` for radio | Every ContentItem in soundcork Presets.xml carries `type`; current `ContentItem` interface lacks this field and must be extended | Omitting — soundcork evidence shows it is always present |
| 2026-06-22 | `isPresetable="true"` required on ContentItems | soundcork Presets.xml shows this on every preset | Omitting — may prevent device from accepting/storing the ContentItem |
| 2026-06-22 | **Stable slot-based URLs** — server URLs are `/preset/:slot.json` and `/stream/:slot`, keyed by slot number, not station identity | URL written into device preset never changes; updating station content (new TuneIn ID, stream URL, name) only requires updating the server response — no `storePreset` call needed | Station-ID-based URLs — changing a station's ID or TuneIn source would require re-writing the preset on the device |
| 2026-06-22 | Write presets to the device **at startup and on a configurable schedule** | Device may reboot (clearing presets), Homebridge host IP may change via DHCP (making stored URLs stale), TuneIn stream URLs can rotate | Write once only — stale after device reboot or IP change |
| 2026-06-22 | Preset re-write schedule separate from `pollingInterval` | `pollingInterval` drives characteristic refresh (seconds); preset re-write is a maintenance task (minutes/hours); conflating them would either over-write presets or under-refresh characteristics | Re-use `pollingInterval` — wrong frequency for both concerns |
| 2026-06-22 | TuneIn IDs resolved via RadioTime OPML API: `https://opml.radiotime.com/Tune.ashx?id=<id>&render=json&formats=mp3,aac&partnerId=RadioTime` | Used by node-tunein-api and soundcork internally; no new dep — `axios` already present | TuneIn Profiles API — more complex extraction |
| 2026-06-22 | **Stream proxy** — `/stream/:slot` fetches the resolved upstream URL (HTTP or HTTPS) and pipes it to the speaker as HTTP | Eliminates the HTTPS stream constraint entirely; station JSON always contains an HTTP URL | Serving upstream URL verbatim — fails when HTTPS; warning + manual fallback — poor UX |
| 2026-06-22 | Serve station JSON and stream proxy via Node.js built-in `http.createServer()` | `node:http` and `node:https` are built-ins — zero new dependencies | Express/Fastify — transitive deps not justified for 3 routes |
| 2026-06-22 | `serverHost` auto-detects first non-loopback IPv4 via `os.networkInterfaces()`, user-overridable | Speaker needs a reachable LAN IP; spike needed to verify whether `homebridge.local` (mDNS) is supported by the speaker's resolver | Hard-code `127.0.0.1` — always fails; `homebridge.local` without spike — silent failure if unsupported |
| 2026-06-22 | User declares the slot number per preset entry in config | Makes ownership explicit; avoids silently overwriting slots the user cares about | Assign in order — opaque slot allocation |
| 2026-06-22 | Preset config key is `global.presets[]` (typed) with `type: 'station'` | Makes the system extensible (Spotify, etc.); `type` gates which fields are read | `global.internetRadio` — too narrow; won't accommodate future preset types cleanly |
| 2026-06-22 | No HomeKit characteristics in this plan | Physical preset buttons work immediately after preset writing; HomeKit integration is a separate concern; PWA may later manage preset config (see `2026-06-19-progressive-web-app.md`) | Adding switches now — premature; nothing is yet happening with the HomeKit device layer |
| 2026-06-22 | Finding: Mode C (plugin acts as soundcork, speaker redirected to Homebridge) requires invasive SSH setup identical to soundcork — edit `/opt/Bose/etc/SoundTouchSdkPrivateCfg.xml` on the device, reboot | soundcork `docs/speaker-setup.md`; plugin cannot do this automatically | Mode C adds no value over running soundcork; deferred indefinitely |
| 2026-06-22 | Zero new runtime npm packages | `axios` (TuneIn resolution), `node:http`/`node:https` (server + proxy), `node:os` (IP detection) — all already available | `node-tunein-api` — transitive deps for one API call |
| 2026-06-23 | **PIVOT: `LOCAL_INTERNET_RADIO` abandoned in favour of `TUNEIN` source + Bose cloud emulator** | `LOCAL_INTERNET_RADIO` source rejected by the speaker on certain models (SoundTouch 20/30 firmware variants refuse to store or play it). The only reliable path is the native `TUNEIN` source, which requires a BMX cloud server for stream resolution at play time. | Continuing with `LOCAL_INTERNET_RADIO` — model-dependent failure; no known firmware workaround |
| 2026-06-23 | `PresetServer.ts` and `TuneInClient.ts` removed | Stream proxying and TuneIn resolution are now handled entirely by `scripts/bose-cloud.mjs`; the plugin code no longer needs them. Deleted `src/presets/PresetServer.ts` and its tests. | Keeping both — redundant; `bose-cloud.mjs` subsumes all proxy + resolution logic |
| 2026-06-23 | Bose cloud emulator (`scripts/bose-cloud.mjs`) is a **standalone Node.js script**, not part of the plugin process | Keeps it easy to run, inspect, and replace independently of Homebridge. Users run it alongside Homebridge (e.g. `node scripts/bose-cloud.mjs &`). A future plan could wrap it as a child process managed by the platform, but that is out of scope here. | Spawning it inside the plugin process — harder to restart independently; couples lifetimes |
| 2026-06-23 | Speaker setup (SSH to edit `SoundTouchSdkPrivateCfg.xml`) is a **one-time manual step** — the plugin does not automate it | The plugin has no SSH capability and cannot reach the speaker's firmware files over the SoundTouch HTTP API. Documented in the README/bose-cloud script header. | Plugin-side automation — not possible without SSH access |
| 2026-06-23 | `PresetStation` no longer stores a resolved stream URL | Resolution happens at play time inside `bose-cloud.mjs`; the preset only needs the TuneIn ID, name, slot, and optional image URL | Keeping `resolvedStreamUrl` — now unused; keeping dead fields causes confusion |
| 2026-06-23 | **Licensing research task added** — soundcork and this plugin | soundcork (`timvw/soundcork`) was reviewed during design; `bose-cloud.mjs` independently reimplements the same BMX emulation concept. Must confirm: soundcork's licence, whether derived-work obligations apply, and whether attribution notices are required in this repo. | Skipping — incomplete due diligence; soundcork may be GPL or carry other conditions |
| 2026-06-25 | `presetSyncEnabled` added at global level (`global.presetSyncEnabled`) and per-device level (`accessories[n].presetSyncEnabled`); both default `true`; both hidden from Homebridge UI (not in `config.schema.json`) | Global flag short-circuits `_setupPresets()` entirely; per-device flag filters the device list passed to `PresetManager`. Same hidden-field convention as `presets`, `presetSyncSchedule`, `server`. | Separate field names at each level — rejected as unnecessary indirection; per-device opt-out inside `PresetManager` only — rejected because it still creates a `PresetManager` and fires network calls |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

**New files:**

- `scripts/bose-cloud.mjs` — standalone Bose cloud emulator (port 8000, no npm
  deps). Routes:
  - `GET /bmx/registry/v1/services` — BMX service registry JSON listing TUNEIN.
  - `GET /marge/streaming/sourceproviders` — XML source provider list; activates
    TUNEIN on the speaker.
  - `GET /bmx/tunein/v1/playback/station/:id` — resolves TuneIn ID to stream URL
    via RadioTime OPML API (`opml.radiotime.com`); returns BMX playback JSON.
  - All other routes → `200 {}` stub.
- `src/presets/PresetStation.ts` — station model:
  `{ slot: number; name: string; tuneInId: string; imageUrl?: string }`.
  Static `fromConfig(raw)`.
- `src/presets/PresetManager.ts` — `static create({ devices, stations })`. Owns
  the preset write cycle; writes `TUNEIN` ContentItems:
  ```ts
  { source: 'TUNEIN', sourceAccount: '', type: 'stationurl',
    isPresetable: true, location: `/v1/playback/station/${tuneInId}`,
    itemName: name }
  ```
  - `sync(): Promise<void>` — calls `storePreset` for each configured slot on
    each device; logs per-slot results.
  - `start(intervalMs: number): void` / `stop(): void`.
- `src/presets/index.ts` — barrel export.
- `src/presets/__tests__/PresetManager.test.ts`
- `src/__device__/preset-concept.device.test.ts` — live-device test (gated out
  of CI via `process.env.CI`); requires real speaker at `SPEAKER_IP`.

**Deleted files (pivot):**

- `src/presets/PresetServer.ts` — no longer needed; `bose-cloud.mjs` handles
  stream resolution.
- `src/presets/__tests__/PresetServer.test.ts`
- `src/presets/TuneInClient.ts` — resolution moved to `bose-cloud.mjs`.
- `src/presets/__tests__/TuneInClient.test.ts`

**Modified files:**

- `src/devices/SoundTouch/api/content-item.ts` — add `readonly type?: string`
  to `ContentItem`; update `contentItemToElement()` to serialize it as an XML
  attribute. Verify `isPresetable` is already serialized; fix if not.
- `src/devices/SoundTouch/api/endpoints.ts` — add `storePreset = 'storePreset'`.
- `src/devices/SoundTouch/api/api.ts` — add
  `storePreset(slot: number, contentItem: ContentItem): Promise<boolean>`.
  POSTs `<preset id="N"><ContentItem .../></preset>` to `/storePreset`.
- `src/ExternalPlatformConfig.ts` — config interfaces:
  ```ts
  interface StationPresetConfig {
    readonly type: 'station';
    readonly slot: number;       // 1–6
    readonly name: string;
    readonly tuneInId: string;   // e.g. "s7162" (More FM Auckland)
    readonly imageUrl?: string;
  }
  type PresetConfig = StationPresetConfig;

  // GlobalConfig gains:
  readonly presets?: PresetConfig[];
  readonly presetSyncInterval?: number;  // ms; default 3600000 (1 hour)
  ```
- `src/PlatformConfiguration.ts` — parse `global.presets`; validate entries
  (type `'station'`, slot 1–6, name, tuneInId); drop + warn on invalid.
- `src/platform.ts` — `_setupPresets()` builds `Map<number, PresetStation>`,
  creates `PresetManager`, calls `presetManager.start(presetSyncInterval)`;
  shutdown hook calls `presetManager.stop()`. No server lifecycle.
- `config.schema.json` — add `global.presetSyncInterval` and `global.presets[]`
  (`type`, `slot`, `name`, `tuneInId`, `imageUrl`). Removed `presetsServer`
  block (no longer exists).
- `jest.config.ts` — device test project gated behind `process.env.CI` so live
  tests never run in CI.

## Conventions for this change

- **Commit type:** `feat:` → minor release.
- **Config schema touched:** yes — `config.schema.json`,
  `src/ExternalPlatformConfig.ts`, `src/PlatformConfiguration.ts`,
  `src/__tests__/PlatformConfiguration.test.ts`.
- **No new runtime npm packages.** `axios`, `node:http`, `node:https`, `node:os`
  — all available. Verify with `npm run knip` after implementation.
- **ESM `.js` extension rule** on all relative imports in new files.
- **Static factory pattern** throughout — `private` constructors, `static create(...)`.
- **Tests to add/update:**
  - `src/devices/SoundTouch/api/__tests__/content-item.test.ts` (type + isPresetable serialization)
  - `src/devices/SoundTouch/api/__tests__/api.test.ts` (storePreset)
  - `src/presets/__tests__/TuneInClient.test.ts`
  - `src/presets/__tests__/PresetServer.test.ts`
  - `src/presets/__tests__/PresetManager.test.ts`
  - `src/__tests__/PlatformConfiguration.test.ts`
- **Target branch:** `dev`.
- **Related plans:** `2026-06-19-progressive-web-app.md` — PWA may later provide
  a UI for managing preset slot assignments, removing the need to edit
  `config.json` directly.

## Implementation checklist

### Research / licensing

- [ ] Review soundcork (`github.com/timvw/soundcork`) licence. Determine whether
      `scripts/bose-cloud.mjs` constitutes a derived work or independent
      reimplementation. If derived: identify licence obligations (attribution,
      licence header, NOTICE file). Add any required notices to the repo.
- [ ] Review this plugin's own licence (`LICENSE` file) for compatibility with
      any notice requirements from the above.

### Spike (verify on a real device before building out)

- [x] Call `POST /storePreset` with a `TUNEIN` ContentItem
      (`type="stationurl"`, `isPresetable="true"`,
      `location="/v1/playback/station/<tuneInId>"`).
      Confirmed: preset stored and physical button plays the station via
      `bose-cloud.mjs` emulator.
- [x] Confirm the SoundTouch device can reach the Homebridge host's LAN IP on
      port 8000 (bose-cloud emulator).
- [x] Confirm RadioTime OPML API resolves station IDs to stream URLs. Verified
      with `s7162` (More FM Auckland).
- [x] Confirm presets persist across speaker reboot; sync schedule ensures
      re-write if lost.

### ContentItem + API extension

- [x] Add `readonly type?: string` to `ContentItem` in
      `src/devices/SoundTouch/api/content-item.ts`; update `contentItemToElement()`.
- [x] Verify `isPresetable` is serialized; fix if not.
- [x] Add `storePreset = 'storePreset'` to `src/devices/SoundTouch/api/endpoints.ts`.
- [x] Implement `api.storePreset(slot, contentItem)` in
      `src/devices/SoundTouch/api/api.ts`.

### Config types

- [x] Add `StationPresetConfig`, `PresetConfig` to `src/ExternalPlatformConfig.ts`;
      wire into `GlobalConfig`. (`presetsServer` block removed — no longer needed.)
- [x] Parse and validate in `src/PlatformConfiguration.ts`; apply defaults
      (`presetSyncInterval: 3_600_000`).
- [x] `src/__tests__/PlatformConfiguration.test.ts` — preset config tests.

### Station model

- [x] `src/presets/PresetStation.ts` — `{ slot, name, tuneInId, imageUrl? }`;
      `static fromConfig(raw)`.
- [x] `src/presets/index.ts` — barrel export.

### Bose cloud emulator

- [x] `scripts/bose-cloud.mjs` — standalone emulator (port 8000):
      BMX registry, marge source providers, TuneIn station resolution.
- [x] Document speaker setup steps (SSH + `SoundTouchSdkPrivateCfg.xml` edit)
      in `docs/bose-cloud-setup.md`.

### Preset manager

- [x] `src/presets/PresetManager.ts` — `static create({ devices, stations })`,
      `sync()`, `start(intervalMs)`, `stop()`. Writes TUNEIN ContentItems.
- [x] `src/presets/__tests__/PresetManager.test.ts`:
      - `sync()` calls `storePreset` for each configured slot.
      - `storePreset` failure on one slot does not abort others.
      - `start(N)` triggers `sync()` on interval; `stop()` cancels it.
      - `stop()` before `start()` is a no-op.

### Platform wiring

- [x] `src/platform.ts` — `_setupPresets()` builds `Map<number, PresetStation>`,
      creates `PresetManager.create({ devices, stations })`, starts it.
      Shutdown hook calls `presetManager.stop()`.

### Config schema

- [x] `config.schema.json` — `global.presetSyncInterval` and `global.presets[]`
      (`type`, `slot`, `name`, `tuneInId`, `imageUrl`). `presetsServer` removed.

### CI / device tests

- [x] `jest.config.ts` — device test project gated behind `process.env.CI`.

### presetSyncEnabled flags

- [ ] `src/ExternalPlatformConfig.ts` — add `presetSyncEnabled?: boolean` to `GlobalConfig` (inherited by `AccessoryConfig`)
- [ ] `src/PlatformConfiguration.ts` — add `presetSyncEnabled: boolean` (default `true`); read from `props.global?.presetSyncEnabled ?? true`
- [ ] `src/devices/SoundTouch/SoundTouchDeviceConfiguration.ts` — add `presetSyncEnabled: boolean` (default `true`); wire through `fromAccessoryConfiguration` and `create`
- [ ] `src/platform.ts` `_setupPresets()` — bail early if `this.configuration.presetSyncEnabled === false`; filter `this._discoveredDevices` by `device.configuration.presetSyncEnabled !== false`
- [ ] `src/__tests__/PlatformConfiguration.test.ts` — test global flag defaults to `true`; test `false` preserved
- [ ] `src/devices/SoundTouch/__tests__/SoundTouchDeviceConfiguration.test.ts` — test per-device flag defaults to `true`; test `false` from config

## Verification

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm test` (unit + integration; device tests gated out of CI)
- [x] `npm run knip` — no new unused exports/deps.
- [ ] `npm run watch` — with a real speaker + `bose-cloud.mjs` running:
      - Configure a station preset (`tuneInId: "s7162"`, slot 1).
      - Confirm `PresetManager` logs a successful `storePreset` at startup.
      - Press physical preset button 1 → More FM Auckland plays.
      - Change `tuneInId` in config, restart Homebridge → button plays new station.

## PR / release notes

- **PR title:** `feat: add typed preset management with internet radio stations`
- **Targets:** `dev`
