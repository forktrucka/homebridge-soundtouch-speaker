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
exposes each station as a Switch in HomeKit. At startup the plugin:

1. Resolves each TuneIn ID to a stream URL via the RadioTime OPML API.
2. Starts a minimal Node.js HTTP server to serve per-station JSON files in the
   format the SoundTouch expects for `LOCAL_INTERNET_RADIO`.
3. When a Switch is turned on, sends `POST /select` with a `LOCAL_INTERNET_RADIO`
   ContentItem pointing to the local server URL for that station.

**References used when designing this plan:**
- `https://gist.github.com/rody64/98a59990ff60ea962cac72cbe93edf56` —
  `LOCAL_INTERNET_RADIO` source format and cURL preset example.
- `https://github.com/Yimura/node-tunein-api/blob/master/src/Constants.js` —
  RadioTime OPML API endpoint and parameters.
- `https://github.com/timvw/soundcork` — Python Bose cloud replacement. Its
  `examples/Presets.xml` confirmed the native TuneIn ContentItem format and that
  `type="stationurl"` + `isPresetable="true"` are required on ContentItems.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-22 | Finding: native TuneIn ContentItem format is `source="TUNEIN"`, `type="stationurl"`, `location="/v1/playback/station/<id>"` | Confirmed by soundcork `examples/Presets.xml`; this requires a soundcork-style BMX server to resolve streams | n/a — informational |
| 2026-06-22 | Use `LOCAL_INTERNET_RADIO` (standalone, no soundcork) | Plugin resolves stream URLs itself and serves them locally; no dependency on soundcork or any other service | `source="TUNEIN"` path deferred — requires a running soundcork/BMX server; may be added as a future mode |
| 2026-06-22 | `ContentItem.type` is **confirmed required** — value `"stationurl"` for radio | Every ContentItem in soundcork Presets.xml carries `type`; the current `ContentItem` interface in `src/devices/SoundTouch/api/content-item.ts` lacks this field and must be extended | Spike had flagged this as uncertain; soundcork source resolves it |
| 2026-06-22 | `isPresetable="true"` should be set on radio station ContentItems | soundcork Presets.xml shows this on every TuneIn preset | Omitting — may prevent device from accepting the ContentItem |
| 2026-06-22 | Resolve TuneIn IDs via RadioTime OPML API: `https://opml.radiotime.com/Tune.ashx?id=<id>&render=json&formats=mp3,aac&partnerId=RadioTime` | Used by node-tunein-api (Constants.js) and by soundcork internally; no new dep, `axios` is already a runtime dep | TuneIn Profiles API (`api.tunein.com`) — more complex for stream URL extraction |
| 2026-06-22 | Serve station JSON via Node.js built-in `http.createServer()` on a configurable port (default 18090) | SoundTouch must fetch the JSON over HTTP from a LAN-reachable URL; `node:http` is a built-in — zero new dependencies | Express/Fastify — transitive deps not justified for a 3-route server |
| 2026-06-22 | Stream URLs inside the station JSON must be HTTP, not HTTPS | SoundTouch hardware limitation per reference gist; soundcork has explicit `ssl_downgrade` logic for the same reason; RadioTime API may return HTTPS — user should provide `streamUrl` directly in that case | n/a |
| 2026-06-22 | `serverHost` auto-detects the first non-loopback IPv4 via `os.networkInterfaces()` but is user-overridable | SoundTouch device needs a reachable LAN IP, not `127.0.0.1` | Hard-code `127.0.0.1` — always fails (speaker can't reach loopback) |
| 2026-06-22 | Expose stations as individual Switch accessories per speaker | Simplest; avoids TV-service complexity; no dependency on source-selection plan | Television + InputSource — depends on 2026-06-19-source-selection.md landing first |
| 2026-06-22 | Station config lives under `global.internetRadio` (not per-accessory) | Same station list regardless of which speaker plays; per-speaker control is via which Switch is toggled | Per-accessory block — redundant config for multi-speaker setups |
| 2026-06-22 | `getOn()` checks `nowPlaying.source === 'LOCAL_INTERNET_RADIO'` AND `nowPlaying.contentItem.location` contains the station's JSON URL | Only way to reflect which station is currently playing | Stateless `getOn() → false` — tile never shows active state |
| 2026-06-22 | Zero new runtime npm packages | `axios` (resolution), `node:http` (server), `node:os` (IP detection) are all already available | `node-tunein-api` — adds transitive deps for one API call |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

**New files:**

- `src/internetRadio/InternetRadioStation.ts` — resolved station model:
  `{ id: string; name: string; tuneInId?: string; resolvedStreamUrl?: string; imageUrl?: string }`.
  Static `fromConfig(id, raw)` validates `name` + at least one of `tuneInId`/`streamUrl`.
- `src/internetRadio/TuneInClient.ts` — `static create(axiosInstance?)`.
  `resolveStationUrl(tuneInId: string): Promise<string | null>` — calls the
  RadioTime OPML API, returns the first `body[].url`. Logs a warning if the
  URL is HTTPS (SoundTouch can't play it; user should supply `streamUrl` instead).
- `src/internetRadio/InternetRadioServer.ts` — `static create({ port, host, stations })`.
  Wraps `node:http`; serves `GET /station/:id.json` with:
  ```json
  { "audio": { "hasPlaylist": false, "isRealtime": true, "streamUrl": "http://..." },
    "imageUrl": "", "name": "...", "streamType": "liveRadio" }
  ```
  `listen(): Promise<void>`, `close(): Promise<void>`,
  `getStationUrl(id: string): string` (returns the full LAN URL).
- `src/internetRadio/index.ts` — barrel export.
- `src/internetRadio/__tests__/TuneInClient.test.ts`
- `src/internetRadio/__tests__/InternetRadioServer.test.ts`
- `src/accessories/services/SoundTouchSpeakerInternetRadioCharacteristic.ts` —
  one Switch service per station.
  `static create({ station, stationJsonUrl, service, device, platform, accessory })`.
  - `setOn(true)`: `api.selectSource({ source: 'LOCAL_INTERNET_RADIO', sourceAccount: '', type: 'stationurl', location: stationJsonUrl, itemName: station.name, isPresetable: true })`.
  - `setOn(false)`: if currently playing this station, `api.pressKey(KeyValue.POWER)`; otherwise no-op.
  - `refresh()`: `nowPlaying.source === 'LOCAL_INTERNET_RADIO'` && `nowPlaying.contentItem?.location` contains `stationJsonUrl`; call `characteristic.updateValue(isMatch)`.
  - On API failure: throw `HapStatusError(SERVICE_COMMUNICATION_FAILURE)`.
- `src/accessories/services/__tests__/SoundTouchSpeakerInternetRadioCharacteristic.test.ts`

**Modified files:**

- `src/devices/SoundTouch/api/content-item.ts` — add `readonly type?: string` to
  the `ContentItem` interface; update `contentItemToElement()` to serialize it
  as an XML attribute. Also verify `isPresetable` is serialized (it's in the
  interface; confirm the serializer writes it).
- `src/ExternalPlatformConfig.ts` — add config interfaces:
  ```ts
  interface StationExternalConfig {
    readonly name: string;
    readonly tuneInId?: string;   // TuneIn station ID, e.g. "s24861"
    readonly streamUrl?: string;  // Direct HTTP stream URL; bypasses TuneIn resolution
    readonly imageUrl?: string;   // Optional artwork URL (HTTP)
  }
  interface InternetRadioConfig {
    readonly serverPort?: number;   // default 18090
    readonly serverHost?: string;   // auto-detected if omitted
    readonly stations?: StationExternalConfig[];
  }
  // GlobalConfig gains:
  readonly internetRadio?: InternetRadioConfig;
  ```
- `src/PlatformConfiguration.ts` — parse `global.internetRadio`; validate each
  station (`name` required; at least one of `tuneInId`/`streamUrl` required; drop
  + warn on invalid entries); apply defaults (`serverPort: 18090`).
  Add tests to `src/__tests__/PlatformConfiguration.test.ts`.
- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — in `createAccessory()`,
  if `internetRadio.stations` is non-empty, add one Switch service per station
  (labelled `<stationName> Radio`); prune orphaned services on config change.
- `src/platform.ts` — in `didFinishLaunching`: skip if `internetRadio.stations`
  is empty. Otherwise: `TuneInClient.create()` → resolve all `tuneInId` stations
  in parallel (`Promise.all`); log failures and HTTPS warnings; filter out nulls.
  `InternetRadioServer.create({ port, host, stations }).listen()`. Register
  shutdown hook: `server.close()`. Pass `{ stations, server }` to `discoverDevices()`.
- `config.schema.json` — add `global.internetRadio` section:
  - `serverPort` (integer, default hint 18090) — "Port the plugin uses to serve
    station JSON files to your speakers. Must be reachable from the speakers'
    network segment."
  - `serverHost` (string, optional) — "LAN IP of this Homebridge host.
    Auto-detected if omitted."
  - `stations[]` — `name` (string, required), `tuneInId` (string, optional,
    e.g. `"s24861"`), `streamUrl` (string, optional, "Direct HTTP stream URL;
    use when the TuneIn ID is unknown or the resolved URL is HTTPS"),
    `imageUrl` (string, optional).

## Conventions for this change

- **Commit type:** `feat:` → minor release.
- **Config schema touched:** yes — update `config.schema.json`,
  `src/ExternalPlatformConfig.ts`, `src/PlatformConfiguration.ts`, and
  `src/__tests__/PlatformConfiguration.test.ts`.
- **No new runtime npm packages.** Uses `axios` (already a runtime dep),
  `node:http`, and `node:os` (built-ins). Verify with `npm run knip` after
  implementation.
- **ESM `.js` extension rule:** all relative imports in new files must end `.js`.
- **Static factory pattern:** all new classes use `private` constructors and
  expose `static create(...)`.
- **Tests to add/update:**
  - `src/devices/SoundTouch/api/__tests__/content-item.test.ts` (new or extend)
  - `src/internetRadio/__tests__/TuneInClient.test.ts`
  - `src/internetRadio/__tests__/InternetRadioServer.test.ts`
  - `src/accessories/services/__tests__/SoundTouchSpeakerInternetRadioCharacteristic.test.ts`
  - `src/__tests__/PlatformConfiguration.test.ts` (extend existing suite)
- **Target branch:** `dev`.
- **Dependency on other plans:** `2026-06-19-source-selection.md` is independent.

## Implementation checklist

### Spike (verify on a real device before building out)

- [ ] POST `/select` with `source="LOCAL_INTERNET_RADIO"`, `type="stationurl"`,
      `location=<local-server-url>`, `isPresetable="true"`. Confirm the speaker
      fetches the JSON and begins playing.
- [ ] Confirm the SoundTouch device can reach the Homebridge host's LAN IP on
      port 18090 (or check whether a firewall rule is needed).
- [ ] Call RadioTime OPML API for `s24861` (BBC World Service); confirm the
      response shape and whether `body[].url` is HTTP or HTTPS.

### ContentItem extension

- [ ] Add `readonly type?: string` to `ContentItem` in
      `src/devices/SoundTouch/api/content-item.ts`.
- [ ] Update `contentItemToElement()` to serialize `type` as an XML attribute.
- [ ] Verify `isPresetable` is already serialized; fix if not.
- [ ] Add/update unit tests covering `type` and `isPresetable` serialization.

### Config types

- [ ] Add `StationExternalConfig`, `InternetRadioConfig` to
      `src/ExternalPlatformConfig.ts`; wire `internetRadio?` into `GlobalConfig`.
- [ ] Parse and validate in `src/PlatformConfiguration.ts`; apply defaults.
- [ ] `src/__tests__/PlatformConfiguration.test.ts`:
      - Station with `tuneInId` only → accepted.
      - Station with `streamUrl` only → accepted.
      - Station with neither → dropped + warning logged.
      - Default `serverPort` is `18090`.
      - `serverHost` left as `undefined` (resolved at runtime).

### Station model

- [ ] `src/internetRadio/InternetRadioStation.ts` — `static fromConfig(id, raw)`.
- [ ] `src/internetRadio/index.ts` — barrel export.

### TuneIn client

- [ ] `src/internetRadio/TuneInClient.ts` — `static create()`, `resolveStationUrl(tuneInId)`.
- [ ] `src/internetRadio/__tests__/TuneInClient.test.ts`:
      - Returns first `body[].url` from a mocked RadioTime JSON response.
      - Returns `null` and logs on HTTP error or empty `body`.
      - Logs a warning when the resolved URL is HTTPS.

### Local HTTP server

- [ ] `src/internetRadio/InternetRadioServer.ts` — `static create({ port, host, stations })`,
      `listen()`, `close()`, `getStationUrl(id)`.
      Serve `GET /station/:id.json` with `Content-Type: application/json`; 404 for unknown IDs.
- [ ] `src/internetRadio/__tests__/InternetRadioServer.test.ts`:
      - Start on ephemeral port; GET known station URL; verify JSON shape.
      - GET unknown station ID → 404.

### Platform wiring

- [ ] `src/platform.ts` — in `didFinishLaunching`:
      1. Skip if `config.internetRadio.stations` is empty.
      2. `TuneInClient.create()` → resolve `tuneInId` stations in parallel; warn + filter nulls.
      3. `InternetRadioServer.create({ port, host, stations }).listen()`; log listening address.
      4. Register shutdown hook: `server.close()`.
      5. Pass `{ stations, server }` into `discoverDevices()`.

### HomeKit characteristic

- [ ] `src/accessories/services/SoundTouchSpeakerInternetRadioCharacteristic.ts` — `static create(...)`.
      - `init()` → `refresh()`.
      - `setOn(true)` → `api.selectSource(...)` with `LOCAL_INTERNET_RADIO` ContentItem.
      - `setOn(false)` → POWER key if this station is currently playing; no-op otherwise.
      - `refresh()` → compare `nowPlaying`; `characteristic.updateValue(isMatch)`.
      - API failure → `HapStatusError(SERVICE_COMMUNICATION_FAILURE)`.
- [ ] `src/accessories/services/__tests__/SoundTouchSpeakerInternetRadioCharacteristic.test.ts`:
      - `setOn(true)` → `selectSource` called with correct ContentItem fields.
      - `setOn(false)` while playing this station → POWER key sent.
      - `setOn(false)` while a different source is playing → POWER key not sent.
      - `refresh()` matching `nowPlaying` → characteristic `true`; mismatch → `false`.

### Accessory wiring

- [ ] `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — create one Switch
      service per station in `createAccessory()`; prune orphaned radio services on
      config change; create `SoundTouchSpeakerInternetRadioCharacteristic` per station.

### Config schema

- [ ] `config.schema.json` — add `global.internetRadio` block: `serverPort`,
      `serverHost`, `stations[]` (`name` required; `tuneInId`, `streamUrl`,
      `imageUrl` optional).

## Verification

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run knip` — no new unused exports/deps.
- [ ] `npm run watch` — with a real speaker:
      - Configure one `tuneInId` station (e.g. `s24861` BBC World Service) and one
        `streamUrl` station.
      - Confirm two Switch tiles appear in the Home app.
      - Toggle the TuneIn station on → speaker begins playing.
      - Tile reflects active (On) while playing; Off after stopping.
      - Toggle the direct-URL station → plays.
      - Add/remove a station from config → cached accessory services updated
        correctly (no orphaned or duplicate Switch services).
      - Restart Homebridge → accessories rehydrate from cache correctly.

## PR / release notes

- **PR title:** `feat: add internet radio stations via TuneIn`
- **Targets:** `dev`
