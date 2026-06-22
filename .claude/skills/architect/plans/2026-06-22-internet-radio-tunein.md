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

This feature lets users configure a list of internet radio stations (by TuneIn
station ID, or by a raw HTTP stream URL) in their Homebridge config, and
exposes each station as a Switch in HomeKit. The implementation runs in
**two modes** depending on whether the user also runs
[soundcork](https://github.com/timvw/soundcork) (a self-hosted Bose cloud
replacement):

**Mode A — soundcork (preferred):** soundcork runs alongside Homebridge and
emulates the Bose cloud BMX server. The plugin sends a `TUNEIN` ContentItem
with `location="/v1/playback/station/<tuneInId>"`. The SoundTouch device hits
soundcork for stream resolution. Zero stream-URL handling in this plugin.

**Mode B — standalone:** No soundcork. The plugin resolves each TuneIn ID to a
stream URL at startup (via the RadioTime OPML API), starts a minimal Node.js
HTTP server to serve per-station JSON files, and sends a `LOCAL_INTERNET_RADIO`
ContentItem pointing to the local server URL.

The mode is selected by whether `global.internetRadio.soundcorkUrl` is set in
config.

**References used when designing this plan:**
- `https://gist.github.com/rody64/98a59990ff60ea962cac72cbe93edf56` —
  `LOCAL_INTERNET_RADIO` source format and cURL preset example.
- `https://github.com/Yimura/node-tunein-api/blob/master/src/Constants.js` —
  RadioTime OPML API endpoint and parameters.
- `https://github.com/timvw/soundcork` — Python Bose cloud replacement; its
  `examples/Presets.xml` is the ground-truth source for the actual on-device
  ContentItem format the SoundTouch uses for TuneIn.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-22 | Finding: the real native TuneIn ContentItem format is `source="TUNEIN"`, `type="stationurl"`, `location="/v1/playback/station/<stationId>"` | Confirmed by soundcork `examples/Presets.xml` — this is the exact XML the SoundTouch device stores for TuneIn presets | `LOCAL_INTERNET_RADIO` was the initial assumption; it is valid for standalone mode but NOT how TuneIn natively works |
| 2026-06-22 | `ContentItem.type` field is **confirmed required** — value `"stationurl"` for radio, `"tracklisturl"` for podcasts | soundcork Presets.xml and API spec both show `type` attribute present on every ContentItem; the current `ContentItem` interface in `src/devices/SoundTouch/api/content-item.ts` lacks this field and must be extended | Spike was planned to determine this; soundcork source resolves the question definitively |
| 2026-06-22 | `isPresetable="true"` should be set on radio station ContentItems | soundcork Presets.xml shows this on all TuneIn presets; also makes stations saveable to device preset buttons | Omitting it — may cause device to reject saving/playing |
| 2026-06-22 | Two-mode architecture: Mode A (soundcork, `TUNEIN` source) and Mode B (standalone, `LOCAL_INTERNET_RADIO`) | Mode A is the native, correct path — soundcork handles stream resolution and HTTPS/HTTP; Mode B works for users who haven't deployed soundcork | Single-mode standalone only — excludes soundcork users who get a better experience by using it |
| 2026-06-22 | Mode selection via `global.internetRadio.soundcorkUrl` config option | Explicit opt-in is clearer than auto-detection; soundcork might be on the network but not properly configured — don't assume | Auto-detect soundcork — fragile; would incorrectly activate Mode A if soundcork is present but not authoritative for this device |
| 2026-06-22 | Resolve TuneIn IDs via RadioTime OPML API (Mode B only): `https://opml.radiotime.com/Tune.ashx?id=<id>&render=json&formats=mp3,aac&partnerId=RadioTime` | Used by node-tunein-api (Constants.js); soundcork uses the same endpoint internally; no new dependency, just `axios` | TuneIn Profiles API (`api.tunein.com`) — more complex for stream URL extraction |
| 2026-06-22 | Serve station JSON via a built-in Node.js `http.createServer()` on a configurable port (default 18090) — Mode B only | SoundTouch must fetch the station JSON over HTTP from a LAN-reachable URL; `node:http` is a built-in — zero new dependencies | Express/Fastify — transitive deps not justified for a 3-route server |
| 2026-06-22 | Stream URL HTTP/HTTPS constraint (Mode B): stream URLs inside the station JSON must be HTTP | SoundTouch hardware limitation per reference gist; soundcork has explicit `ssl_downgrade` logic for RadioBrowser for the same reason; RadioTime OPML API may return HTTPS URLs — user should provide `streamUrl` directly when TuneIn resolution yields HTTPS | n/a |
| 2026-06-22 | `serverHost` auto-detects the first non-loopback IPv4 via `os.networkInterfaces()` but is user-overridable (Mode B only) | SoundTouch device needs a reachable LAN IP, not `127.0.0.1` | Hard-code `127.0.0.1` — would always fail (speaker can't reach loopback) |
| 2026-06-22 | Expose stations as individual Switch accessories per speaker | Simplest; works for both modes without depending on the source-selection plan; avoids TV-service complexity | Television + InputSource — depends on source-selection plan (2026-06-19-source-selection.md) landing first |
| 2026-06-22 | Station config lives under `global.internetRadio` (not per-accessory) | Station list is the same regardless of which speaker plays; per-speaker playback is driven by which switch is toggled | Per-accessory block — creates redundant config for multi-speaker setups |
| 2026-06-22 | `getOn()` checks `nowPlaying.source === 'TUNEIN'` (Mode A) or `nowPlaying.source === 'LOCAL_INTERNET_RADIO'` (Mode B), plus `nowPlaying.contentItem.location` matches the station | Only way to reflect which station is currently playing | Stateless `getOn() → false` — tile never shows active state |
| 2026-06-22 | Zero new runtime npm packages | `axios` (HTTP + TuneIn resolution), `node:http` (server, Mode B), `node:os` (IP detection, Mode B) are all already available | `node-tunein-api` — adds transitive deps for one API call |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

**New files:**

- `src/internetRadio/InternetRadioStation.ts` — resolved station model:
  `{ id: string; name: string; tuneInId?: string; resolvedStreamUrl?: string; imageUrl?: string }`.
  Static `fromConfig(id, raw)` validates `name` + at least one of `tuneInId`/`streamUrl`.
- `src/internetRadio/TuneInClient.ts` — **Mode B only.** `static create()`.
  `resolveStationUrl(tuneInId: string): Promise<string | null>` — calls
  `https://opml.radiotime.com/Tune.ashx?id=<id>&render=json&formats=mp3,aac&partnerId=RadioTime`,
  returns first `body[].url`. Logs a warning if the URL is HTTPS.
- `src/internetRadio/InternetRadioServer.ts` — **Mode B only.** Node.js
  `http.createServer()` on configurable port (default 18090). Serves
  `GET /station/:id.json` with SoundTouch station JSON:
  ```json
  { "audio": { "hasPlaylist": false, "isRealtime": true, "streamUrl": "http://..." },
    "imageUrl": "", "name": "...", "streamType": "liveRadio" }
  ```
  `static create({ port, host, stations })`. `getStationUrl(id): string` returns
  the full URL the SoundTouch device should fetch.
- `src/internetRadio/index.ts` — barrel export.
- `src/internetRadio/__tests__/TuneInClient.test.ts`
- `src/internetRadio/__tests__/InternetRadioServer.test.ts`
- `src/accessories/services/SoundTouchSpeakerInternetRadioCharacteristic.ts` —
  one Switch service per station. `static create({ station, mode, soundcorkUrl, stationJsonUrl, service, device, platform, accessory })`.
  - **`setOn(true)` Mode A (soundcork):** `api.selectSource({ source: 'TUNEIN', sourceAccount: '', type: 'stationurl', location: '/v1/playback/station/<tuneInId>', itemName: station.name, isPresetable: true })`.
  - **`setOn(true)` Mode B (standalone):** `api.selectSource({ source: 'LOCAL_INTERNET_RADIO', sourceAccount: '', type: 'stationurl', location: stationJsonUrl, itemName: station.name, isPresetable: true })`.
  - **`setOn(false)`:** if currently playing this station, send `KeyValue.POWER` key; otherwise no-op.
  - **`refresh()`:** Mode A: `nowPlaying.source === 'TUNEIN'` && location matches `/v1/playback/station/<tuneInId>`. Mode B: `nowPlaying.source === 'LOCAL_INTERNET_RADIO'` && location contains `stationJsonUrl`.
- `src/accessories/services/__tests__/SoundTouchSpeakerInternetRadioCharacteristic.test.ts`

**Modified files:**

- `src/devices/SoundTouch/api/content-item.ts` — **extend `ContentItem` interface** with `readonly type?: string` and update `contentItemToElement()` to serialize it as the `type` XML attribute. Also add `isPresetable` serialization if it's missing (verify current code).
- `src/ExternalPlatformConfig.ts` — add config interfaces:
  ```ts
  interface StationExternalConfig {
    readonly name: string;
    readonly tuneInId?: string;     // TuneIn station ID, e.g. "s24861"
    readonly streamUrl?: string;    // Direct HTTP stream URL (Mode B only; bypasses TuneIn resolution)
    readonly imageUrl?: string;     // Optional artwork URL (HTTP)
  }
  interface InternetRadioConfig {
    readonly soundcorkUrl?: string; // e.g. "http://192.168.1.50:8080" — activates Mode A
    readonly serverPort?: number;   // Mode B only; default 18090
    readonly serverHost?: string;   // Mode B only; auto-detected if omitted
    readonly stations?: StationExternalConfig[];
  }
  // GlobalConfig gains:
  readonly internetRadio?: InternetRadioConfig;
  ```
- `src/PlatformConfiguration.ts` — parse `global.internetRadio`; validate stations
  (`name` + one of `tuneInId`/`streamUrl`); set `mode: 'soundcork' | 'standalone'`
  based on presence of `soundcorkUrl`; apply defaults (`serverPort: 18090`).
  Add tests to `src/__tests__/PlatformConfiguration.test.ts`.
- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — in `createAccessory()`,
  if `internetRadio.stations` is non-empty, add one `Switch` service per station
  (labelled `<stationName> Radio`); prune orphaned services on config change.
- `src/platform.ts` — in `didFinishLaunching`:
  - **Mode A:** no HTTP server; pass `{ mode: 'soundcork', soundcorkUrl, stations }` to accessories.
  - **Mode B:** `TuneInClient.create()` → resolve all `tuneInId` stations in parallel
    (filter out nulls, warn on HTTPS); `InternetRadioServer.create().listen()`;
    register shutdown hook; pass `{ mode: 'standalone', server, stations }` to accessories.
- `config.schema.json` — add `global.internetRadio` section:
  - `soundcorkUrl` (string, optional) — "URL of your soundcork instance (e.g. http://192.168.1.50:8080). When set, stations play via soundcork using the native TUNEIN source."
  - `serverPort` (integer, default 18090) — "Standalone mode only: port the plugin uses to serve station JSON files."
  - `serverHost` (string, optional) — "Standalone mode only: LAN IP of this Homebridge host; auto-detected if omitted."
  - `stations[]` — `name` (required), `tuneInId` (optional), `streamUrl` (optional, "Direct HTTP stream URL; use when TuneIn ID is unknown or the resolved URL is HTTPS"), `imageUrl` (optional).

## Conventions for this change

- **Commit type:** `feat:` → minor release.
- **Config schema touched:** yes — update `config.schema.json`,
  `src/ExternalPlatformConfig.ts`, `src/PlatformConfiguration.ts`, and
  `src/__tests__/PlatformConfiguration.test.ts`.
- **No new runtime npm packages.** Uses `axios` (already a runtime dep),
  `node:http`, and `node:os` (Node built-ins). Verify with `npm run knip` after
  the implementation.
- **ESM `.js` extension rule:** all relative imports in new files must end `.js`.
- **Static factory pattern:** all new classes expose a `static create(...)` and
  keep constructors `private`.
- **Tests to add/update:**
  - `src/internetRadio/__tests__/TuneInClient.test.ts`
  - `src/internetRadio/__tests__/InternetRadioServer.test.ts`
  - `src/accessories/services/__tests__/SoundTouchSpeakerInternetRadioCharacteristic.test.ts`
  - `src/__tests__/PlatformConfiguration.test.ts` (extend existing suite)
- **Target branch:** `dev`.
- **Dependency on other plans:** `2026-06-19-source-selection.md` is independent
  — these two features can ship in either order. If source-selection ships first
  and introduces a Television service, the radio switches remain valid; they
  complement, not duplicate it.

## Implementation checklist

### Spike (verify before building out)

- [ ] **Mode A spike** — with soundcork running: POST `/select` with
      `source="TUNEIN"`, `type="stationurl"`, `location="/v1/playback/station/s24861"`,
      `isPresetable="true"`. Confirm the speaker begins playing BBC World Service.
      Confirm `nowPlaying` reflects `source=TUNEIN` and the matching location.
- [ ] **Mode B spike** — without soundcork: POST `/select` with
      `source="LOCAL_INTERNET_RADIO"`, `type="stationurl"`, `location=<local-server-url>`.
      Confirm the speaker fetches the JSON and begins playing.
      Confirm the SoundTouch device can reach the Homebridge host's LAN IP on the chosen port.
- [ ] **RadioTime OPML response shape** — call
      `https://opml.radiotime.com/Tune.ashx?id=s24861&render=json&formats=mp3,aac&partnerId=RadioTime`;
      confirm `body[].url` shape and whether URLs are HTTP or HTTPS.

### ContentItem interface extension (both modes)

- [ ] Add `readonly type?: string` to `ContentItem` in
      `src/devices/SoundTouch/api/content-item.ts`.
- [ ] Update `contentItemToElement()` to write `type` as an XML attribute when
      present.
- [ ] Confirm `isPresetable` is already serialized to XML (it's in the interface
      but verify `contentItemToElement` writes it).
- [ ] Add/update unit tests for `contentItemToElement` covering `type` and
      `isPresetable` serialization.

### Config types

- [ ] Add `StationExternalConfig`, `InternetRadioConfig` to
      `src/ExternalPlatformConfig.ts`; wire `internetRadio?` into `GlobalConfig`.
- [ ] Parse in `src/PlatformConfiguration.ts`: derive `mode: 'soundcork' | 'standalone'`
      from presence of `soundcorkUrl`; validate each station (`name` + `tuneInId`|`streamUrl`);
      apply defaults (`serverPort: 18090`).
- [ ] Update `src/__tests__/PlatformConfiguration.test.ts`:
      - `soundcorkUrl` present → `mode === 'soundcork'`.
      - `soundcorkUrl` absent → `mode === 'standalone'`.
      - Station with `tuneInId` only → accepted.
      - Station with `streamUrl` only → accepted.
      - Station with neither → dropped + warning.
      - Defaults: `serverPort=18090`, `serverHost` left as `undefined`.

### Station model

- [ ] `src/internetRadio/InternetRadioStation.ts` — static `fromConfig(id, raw)`.
- [ ] Barrel `src/internetRadio/index.ts`.

### TuneIn client (Mode B only)

- [ ] `src/internetRadio/TuneInClient.ts` — `static create()`, `resolveStationUrl(tuneInId)`.
- [ ] `src/internetRadio/__tests__/TuneInClient.test.ts`:
      - Returns first `body[].url` from mocked RadioTime JSON.
      - Returns `null` and logs on HTTP error or empty body.
      - Logs a warning when resolved URL is HTTPS.

### Local HTTP server (Mode B only)

- [ ] `src/internetRadio/InternetRadioServer.ts` — `static create({ port, host, stations })`,
      `listen(): Promise<void>`, `close(): Promise<void>`, `getStationUrl(id)`.
      Serve `GET /station/:id.json` with `Content-Type: application/json`; 404 for unknown IDs.
- [ ] `src/internetRadio/__tests__/InternetRadioServer.test.ts`:
      - Start on ephemeral port; GET known station; verify JSON shape.
      - GET unknown station → 404.

### Platform wiring

- [ ] `src/platform.ts` — in `didFinishLaunching`, skip entirely if `internetRadio.stations` is empty.
      **Mode A (soundcork):** no server — pass `{ mode: 'soundcork', soundcorkUrl, stations }` to `discoverDevices()`.
      **Mode B (standalone):** resolve TuneIn IDs in parallel (`Promise.all`), start `InternetRadioServer`,
      register shutdown hook, pass `{ mode: 'standalone', server, stations }` to `discoverDevices()`.

### HomeKit characteristic

- [ ] `src/accessories/services/SoundTouchSpeakerInternetRadioCharacteristic.ts` — `static create(...)`.
      - `setOn(true)` Mode A: `selectSource({ source: 'TUNEIN', type: 'stationurl', location: '/v1/playback/station/<id>', sourceAccount: '', itemName, isPresetable: true })`.
      - `setOn(true)` Mode B: `selectSource({ source: 'LOCAL_INTERNET_RADIO', type: 'stationurl', location: stationJsonUrl, sourceAccount: '', itemName, isPresetable: true })`.
      - `setOn(false)`: POWER key if this station is currently playing; no-op otherwise.
      - `refresh()`: check `nowPlaying` source + location; `characteristic.updateValue(isMatch)`.
      - API failure: throw `HapStatusError(SERVICE_COMMUNICATION_FAILURE)`.
- [ ] `src/accessories/services/__tests__/SoundTouchSpeakerInternetRadioCharacteristic.test.ts`:
      - Mode A `setOn(true)` → `selectSource` with `TUNEIN` source and correct location.
      - Mode B `setOn(true)` → `selectSource` with `LOCAL_INTERNET_RADIO` and JSON URL.
      - `setOn(false)` while playing this station → POWER key sent.
      - `setOn(false)` while playing a different source → POWER key not sent.
      - `refresh()` matching nowPlaying → characteristic `true`; mismatch → `false`.

### Accessory wiring

- [ ] `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — add one Switch service per
      station in `createAccessory()`; prune orphaned radio services on config change.

### Config schema

- [ ] `config.schema.json` — add `global.internetRadio` block: `soundcorkUrl`, `serverPort`,
      `serverHost`, `stations[]` (each: `name` required, `tuneInId`, `streamUrl`, `imageUrl`).

## Verification

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run knip` — confirm no new unused exports/deps.
- [ ] `npm run watch` — with a real speaker:
      - **Mode A (soundcork):** configure `soundcorkUrl` + TuneIn station IDs; confirm Switch
        tiles appear; toggling on plays the station; tile reflects active/inactive state.
      - **Mode B (standalone):** remove `soundcorkUrl`; configure one `tuneInId` and one `streamUrl`
        entry; confirm local server starts (logged address); Switch tiles appear; playback works;
        tile reflects state.
      - Add/remove a station from config → cached accessory services updated correctly.
      - Restart Homebridge → cached accessories rehydrate without duplicate Switch services.

## PR / release notes

- **PR title:** `feat: add internet radio stations via TuneIn`
- **Targets:** `dev`
