---
feature: Internet radio via TuneIn
status: planned
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

**How it works:**

The plugin runs a local HTTP server with **stable, slot-based URLs**:
- `GET /preset/:slot.json` — serves a SoundTouch station descriptor whose
  `streamUrl` points to the proxy endpoint below.
- `GET /stream/:slot` — proxies the resolved audio stream back as HTTP,
  regardless of whether the upstream URL is HTTP or HTTPS.

At startup (and on a configurable schedule), the plugin writes a
`LOCAL_INTERNET_RADIO` preset to each configured slot on the SoundTouch device,
with `location` pointing at the stable `http://host:port/preset/:slot.json` URL.
Because the URL never changes, updating a station's content (new TuneIn ID,
new stream URL) only requires updating the server's response — no device API
call is needed.

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

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

**New files:**

- `src/presets/PresetStation.ts` — resolved station model:
  `{ slot: number; name: string; resolvedStreamUrl: string; imageUrl?: string }`.
  Static `fromConfig(raw)` validates `slot` (1–6), `name`, and at least one of
  `tuneInId`/`streamUrl`.
- `src/presets/TuneInClient.ts` — `static create(axiosInstance?)`.
  `resolveStationUrl(tuneInId: string): Promise<string | null>` calls the
  RadioTime OPML API and returns the first `body[].url`. Returns `null` on
  error (logged); HTTP or HTTPS both accepted (proxy handles it).
- `src/presets/PresetServer.ts` — `static create({ port, host, stations })`.
  Wraps `node:http`; serves:
  - `GET /preset/:slot.json` — SoundTouch station descriptor. `streamUrl` always
    points at the local proxy: `http://host:port/stream/:slot`. Shape:
    ```json
    { "audio": { "hasPlaylist": false, "isRealtime": true,
                 "streamUrl": "http://host:port/stream/1" },
      "imageUrl": "", "name": "...", "streamType": "liveRadio" }
    ```
  - `GET /stream/:slot` — fetches `station.resolvedStreamUrl` via `node:https`
    or `node:http` (scheme-detected), pipes response to client. Passes through
    `Content-Type` and `icy-*` headers. Destroys upstream on `req.on('close')`.
    Returns 404 for unknown slots; 502 on upstream error.
  - `listen(): Promise<void>`, `close(): Promise<void>`,
    `getPresetUrl(slot: number): string`.
- `src/presets/PresetManager.ts` — `static create({ api, config })`. Owns the
  preset write cycle:
  - `sync(): Promise<void>` — resolves TuneIn IDs (parallel `Promise.all`),
    calls `api.storePreset(slot, contentItem)` for each configured slot. Logs
    results (success / failure per slot).
  - `start(intervalMs: number): void` — calls `sync()` immediately, then on the
    given interval.
  - `stop(): void` — clears the interval.
- `src/presets/index.ts` — barrel export.
- `src/presets/__tests__/TuneInClient.test.ts`
- `src/presets/__tests__/PresetServer.test.ts`
- `src/presets/__tests__/PresetManager.test.ts`

**Modified files:**

- `src/devices/SoundTouch/api/content-item.ts` — add `readonly type?: string`
  to `ContentItem`; update `contentItemToElement()` to serialize it as an XML
  attribute. Verify `isPresetable` is already serialized; fix if not.
- `src/devices/SoundTouch/api/endpoints.ts` — add `storePreset = 'storePreset'`.
- `src/devices/SoundTouch/api/api.ts` — add
  `storePreset(slot: number, contentItem: ContentItem): Promise<boolean>`.
  POSTs `<preset id="N"><ContentItem .../></preset>` to `/storePreset`.
- `src/ExternalPlatformConfig.ts` — add config interfaces:
  ```ts
  interface StationPresetConfig {
    readonly type: 'station';
    readonly slot: number;         // 1–6
    readonly name: string;
    readonly tuneInId?: string;    // e.g. "s24861"
    readonly streamUrl?: string;   // direct URL; bypasses TuneIn resolution
    readonly imageUrl?: string;
  }
  // Union for future types:
  type PresetConfig = StationPresetConfig; // | SpotifyPresetConfig | …

  interface PresetsServerConfig {
    readonly port?: number;       // default 18090
    readonly host?: string;       // auto-detected if omitted
  }

  // GlobalConfig gains:
  readonly presetsServer?: PresetsServerConfig;
  readonly presets?: PresetConfig[];
  readonly presetSyncInterval?: number;  // ms; default 3600000 (1 hour); 0 = startup only
  ```
- `src/PlatformConfiguration.ts` — parse `global.presets` and
  `global.presetsServer`; validate each entry (type present, slot 1–6, name,
  at least one of `tuneInId`/`streamUrl` for `type: 'station'`); drop + warn on
  invalid entries; apply defaults. Add tests to
  `src/__tests__/PlatformConfiguration.test.ts`.
- `src/platform.ts` — in `didFinishLaunching`, if `config.presets` is non-empty:
  1. `TuneInClient.create()` → resolve all `tuneInId` entries in parallel.
  2. `PresetServer.create({ port, host, stations }).listen()` — log address.
  3. `PresetManager.create({ api, config }).start(presetSyncInterval)` — writes
     presets to every discovered device; logs per-slot results.
  4. Register shutdown hooks: `server.close()`, `manager.stop()`.
- `config.schema.json` — add:
  - `global.presetsServer.port` (integer, default 18090)
  - `global.presetsServer.host` (string, optional)
  - `global.presetSyncInterval` (integer ms, default 3600000)
  - `global.presets[]` — each entry: `type` (required, currently `"station"`),
    `slot` (integer 1–6, required), `name` (required), `tuneInId` (optional),
    `streamUrl` (optional), `imageUrl` (optional).

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

### Spike (verify on a real device before building out)

- [ ] Call `POST /storePreset` with a `LOCAL_INTERNET_RADIO` ContentItem
      (`type="stationurl"`, `isPresetable="true"`, `location=<local-server-url>`).
      Confirm the preset is stored and the physical button plays the station.
- [ ] Confirm the SoundTouch device can reach the Homebridge host's LAN IP on
      port 18090. Check whether a firewall rule is needed.
- [ ] Call RadioTime OPML API for `s24861` (BBC World Service); confirm
      `body[].url` response shape. HTTP or HTTPS — proxy handles both.
- [ ] Check whether the SoundTouch can resolve `homebridge.local` (mDNS `.local`
      address) — if so, `presetsServer.host` can be dropped from the schema.
- [ ] Confirm what happens to stored presets when the device reboots — verify
      whether presets persist or are cleared (determines how critical the sync
      schedule is).

### ContentItem + API extension

- [ ] Add `readonly type?: string` to `ContentItem` in
      `src/devices/SoundTouch/api/content-item.ts`; update `contentItemToElement()`.
- [ ] Verify `isPresetable` is serialized; fix if not.
- [ ] Add unit tests for `type` + `isPresetable` serialization.
- [ ] Add `storePreset = 'storePreset'` to `src/devices/SoundTouch/api/endpoints.ts`.
- [ ] Implement `api.storePreset(slot, contentItem)` in
      `src/devices/SoundTouch/api/api.ts`; add unit test.

### Config types

- [ ] Add `StationPresetConfig`, `PresetConfig`, `PresetsServerConfig` to
      `src/ExternalPlatformConfig.ts`; wire into `GlobalConfig`.
- [ ] Parse and validate in `src/PlatformConfiguration.ts`; apply defaults
      (`port: 18090`, `presetSyncInterval: 3_600_000`).
- [ ] `src/__tests__/PlatformConfiguration.test.ts`:
      - Valid station entry accepted.
      - Entry missing `slot` → dropped + warning.
      - Entry missing both `tuneInId` and `streamUrl` → dropped + warning.
      - Slot out of range (0, 7) → dropped + warning.
      - Default `port` and `presetSyncInterval` applied when absent.

### TuneIn client

- [ ] `src/presets/TuneInClient.ts` — `static create()`, `resolveStationUrl(tuneInId)`.
- [ ] `src/presets/__tests__/TuneInClient.test.ts`:
      - Returns first `body[].url` from mocked RadioTime JSON.
      - Returns `null` and logs on HTTP error or empty `body`.

### Station model

- [ ] `src/presets/PresetStation.ts` — `static fromConfig(raw)`.
- [ ] `src/presets/index.ts` — barrel export.

### Preset server

- [ ] `src/presets/PresetServer.ts` — `static create(...)`, `listen()`, `close()`,
      `getPresetUrl(slot)`.
  - Route `GET /preset/:slot.json`: serve station JSON with `streamUrl` pointing
    to `/stream/:slot`.
  - Route `GET /stream/:slot`: detect upstream scheme, pipe via `node:https` or
    `node:http`, pass `Content-Type` + `icy-*`, destroy upstream on client close,
    502 on upstream error.
  - 404 for any unknown slot on either route.
- [ ] `src/presets/__tests__/PresetServer.test.ts`:
      - GET `/preset/1.json` → correct JSON shape; `streamUrl` is HTTP and
        contains `/stream/1`.
      - GET `/preset/99.json` → 404.
      - GET `/stream/1` with mocked HTTP upstream → response piped through.
      - GET `/stream/1` with mocked HTTPS upstream → response piped through.
      - GET `/stream/99` → 404.

### Preset manager

- [ ] `src/presets/PresetManager.ts` — `static create(...)`, `sync()`, `start(intervalMs)`,
      `stop()`.
  - `sync()`: parallel `Promise.all` over configured slots; for each, call
    `api.storePreset(slot, contentItem)` where `contentItem.location` is the
    stable `getPresetUrl(slot)` URL; log success/failure per slot per device.
  - `start(0)` → call `sync()` once, no interval.
  - `start(N)` → call `sync()` immediately, then every N ms.
- [ ] `src/presets/__tests__/PresetManager.test.ts`:
      - `sync()` calls `storePreset` for each configured slot.
      - `storePreset` failure on one slot is logged but does not abort others.
      - `start(N)` triggers `sync()` on interval; `stop()` cancels it.

### Platform wiring

- [ ] `src/platform.ts` — in `didFinishLaunching`, skip entirely if
      `config.presets` is empty. Otherwise:
      1. `TuneInClient.create()` → resolve `tuneInId` entries in parallel;
         filter nulls; log per-station failures.
      2. Build `PresetStation[]` from resolved + raw `streamUrl` entries.
      3. `PresetServer.create({ port, host, stations }).listen()`; log address.
      4. `PresetManager.create({ devices, server }).start(presetSyncInterval)`.
      5. Register shutdown hooks: `server.close()`, `manager.stop()`.

### Config schema

- [ ] `config.schema.json` — add `global.presetsServer` (`port`, `host`),
      `global.presetSyncInterval`, and `global.presets[]` (`type`, `slot`,
      `name`, `tuneInId`, `streamUrl`, `imageUrl`).

## Verification

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run knip` — no new unused exports/deps.
- [ ] `npm run watch` — with a real speaker:
      - Configure two station presets (one `tuneInId`, one `streamUrl`) on
        different slots.
      - Confirm the preset server starts and logs its address.
      - Press the physical preset button on the speaker → station plays.
      - Change the station's `tuneInId` in config, restart Homebridge → same
        physical button plays the new station (server response updated; preset
        URL unchanged on device).
      - Simulate a device reboot; confirm `presetSyncInterval` re-writes the
        preset without manual intervention.

## PR / release notes

- **PR title:** `feat: add typed preset management with internet radio stations`
- **Targets:** `dev`
