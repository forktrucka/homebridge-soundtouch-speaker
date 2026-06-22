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
works. The SoundTouch Web API does, however, expose a `LOCAL_INTERNET_RADIO`
source that lets a local host supply a station-description JSON file and drive
playback entirely over the LAN.

This feature lets users configure a list of internet radio stations (by TuneIn
station ID, or by a raw HTTP stream URL) in their Homebridge config. At
startup the plugin:

1. Resolves each TuneIn ID to a stream URL via the RadioTime OPML API.
2. Starts a minimal Node.js HTTP server to serve per-station JSON files in the
   format the SoundTouch expects for `LOCAL_INTERNET_RADIO`.
3. Exposes each station as a Switch in HomeKit — turning it on selects that
   station on the speaker via `POST /select`.

**References used when designing this plan:**
- `https://gist.github.com/rody64/98a59990ff60ea962cac72cbe93edf56` —
  `LOCAL_INTERNET_RADIO` source format, cURL example storing presets.
- `https://github.com/Yimura/node-tunein-api/blob/master/src/Constants.js` —
  RadioTime API endpoint and parameters used to resolve TuneIn IDs.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-22 | Use `LOCAL_INTERNET_RADIO` as the SoundTouch source, not native TuneIn | Native TuneIn requires Bose cloud (shutdown Feb 2026); `LOCAL_INTERNET_RADIO` is fully local | n/a |
| 2026-06-22 | Resolve TuneIn IDs via RadioTime OPML API: `https://opml.radiotime.com/Tune.ashx?id=<id>&render=json&formats=mp3,aac&partnerId=RadioTime` | This is what the node-tunein-api library uses (Constants.js); no dependency needed, just `axios` (already in package.json) | TuneIn Profiles API (`api.tunein.com`) — returns richer search results but resolving to a playable stream URL is more complex |
| 2026-06-22 | Serve station JSON via a built-in Node.js `http.createServer()` on a configurable port (default 18090) | SoundTouch must fetch the JSON over HTTP from a URL it can reach; `node:http` is a built-in — zero new dependencies | Express/Fastify — adds transitive deps for a 3-route server |
| 2026-06-22 | Stream URLs **must be HTTP, not HTTPS** | SoundTouch hardware limitation (documented in reference gist); RadioTime API may return HTTPS URLs in `render=json` mode; needs spike verification | Proxy/redirect — adds complexity; SoundTouch may not follow redirects to HTTPS anyway |
| 2026-06-22 | Expose stations as individual Switch accessories per speaker | Simplest; works standalone without depending on the source-selection plan; avoids TV-service complexity | Television + InputSource — depends on source-selection plan (2026-06-19-source-selection.md) landing first; Station presence as preset slots — device preset slots 1–6 are the user's to manage |
| 2026-06-22 | Station config lives under `global.internetRadio` (not per-accessory) | Station list is the same regardless of which speaker plays; per-speaker playback is driven by which switch is toggled | Per-accessory `internetRadio` block — creates redundant config for multi-speaker setups |
| 2026-06-22 | `serverHost` auto-detects the first non-loopback IPv4 via `os.networkInterfaces()` but is user-overridable | SoundTouch device needs a reachable LAN IP, not `127.0.0.1`; `os.networkInterfaces()` is a built-in | Hard-code `127.0.0.1` — would always fail (speaker can't reach loopback) |
| 2026-06-22 | `ContentItem.type` field: the gist shows `type="stationurl"` in the XML but the existing `ContentItem` interface and `contentItemToElement()` don't include a `type` attribute — needs spike to verify whether the attribute is required | The device may accept `LOCAL_INTERNET_RADIO` without `type`; investigation deferred to implementation | Extending the `ContentItem` interface immediately without verifying the device behaviour |
| 2026-06-22 | `getOn()` for a station switch checks `nowPlaying.source === 'LOCAL_INTERNET_RADIO'` AND `nowPlaying.contentItem.location` contains the station's JSON URL | Only way to reflect which station is currently playing; nowPlaying is already polled by `SoundTouchSpeakerOnCharacteristic` | Stateless (always return false) — means Home app tile never shows active state |
| 2026-06-22 | Zero new runtime npm packages | `axios` (HTTP), `node:http` (server), `node:os` (IP detection) all already available | `node-tunein-api` — adds transitive deps; too heavyweight for a single API call pattern |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

**New files:**

- `src/internetRadio/InternetRadioStation.ts` — `InternetRadioStation` value
  type: `{ id: string; name: string; resolvedUrl: string }`. Static factory
  `fromConfig()` validates that either `tuneInId` or `streamUrl` is present.
- `src/internetRadio/TuneInClient.ts` — `TuneInClient` class. Private
  constructor + `static create(axiosInstance?: AxiosInstance)`. Method
  `resolveStationUrl(tuneInId: string): Promise<string | null>` calls
  `https://opml.radiotime.com/Tune.ashx?id=<id>&render=json&formats=mp3,aac&partnerId=RadioTime`
  and returns the first `body[].url`. Logs a warning if the URL is HTTPS (SoundTouch limitation).
- `src/internetRadio/InternetRadioServer.ts` — `InternetRadioServer` class.
  Wraps `node:http` to serve `GET /station/:id.json`. `static create({ port, host, stations })`.
  `getStationUrl(id: string): string` returns the full URL SoundTouch should
  fetch. Station JSON shape:
  ```json
  { "audio": { "hasPlaylist": false, "isRealtime": true, "streamUrl": "http://..." },
    "imageUrl": "", "name": "...", "streamType": "liveRadio" }
  ```
- `src/internetRadio/index.ts` — barrel export.
- `src/internetRadio/__tests__/TuneInClient.test.ts` — unit tests (mock axios).
- `src/internetRadio/__tests__/InternetRadioServer.test.ts` — integration-style
  tests: start server, `fetch()` a station URL, verify JSON shape.
- `src/accessories/services/SoundTouchSpeakerInternetRadioCharacteristic.ts` —
  characteristic managing one Switch service per station. `static create({ station, stationUrl, service, device, platform, accessory })`.
  - `setOn(true)`: calls `api.selectSource({ source: 'LOCAL_INTERNET_RADIO', sourceAccount: '', location: stationUrl, itemName: station.name })`.
  - `setOn(false)`: no-op (switch-off means the user wants to stop; emit a
    POWER key via `api.pressKey(KeyValue.POWER)` only if this station is
    currently playing, to avoid cutting off a different source).
  - `getOn()` / `refresh()`: `nowPlaying.source === 'LOCAL_INTERNET_RADIO'` &&
    `nowPlaying.contentItem?.location` contains `stationUrl`.
- `src/accessories/services/__tests__/SoundTouchSpeakerInternetRadioCharacteristic.test.ts`

**Modified files:**

- `src/ExternalPlatformConfig.ts` — add `InternetRadioConfig` interface and wire
  it into `GlobalConfig`:
  ```ts
  interface StationExternalConfig {
    readonly name: string;
    readonly tuneInId?: string;
    readonly streamUrl?: string;
  }
  interface InternetRadioConfig {
    readonly serverPort?: number;    // default 18090
    readonly serverHost?: string;    // default: auto-detect via os.networkInterfaces()
    readonly stations?: StationExternalConfig[];
  }
  // GlobalConfig gains:
  readonly internetRadio?: InternetRadioConfig;
  ```
- `src/PlatformConfiguration.ts` — parse `global.internetRadio`; validate
  each station entry (must have `name` + at least one of `tuneInId`/`streamUrl`);
  expose as `internetRadio: ResolvedInternetRadioConfig` on the config object.
  Add tests to `src/__tests__/PlatformConfiguration.test.ts`.
- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — in `createAccessory()`,
  if `platformConfig.internetRadio.stations` is non-empty, add one `Switch`
  service per station and create a `SoundTouchSpeakerInternetRadioCharacteristic`
  per service. Services are labelled `<stationName> Radio`.
- `src/platform.ts` — in `didFinishLaunching`:
  1. Instantiate `TuneInClient`.
  2. Resolve all `tuneInId` stations (log warnings for failures / HTTPS URLs).
  3. Start `InternetRadioServer` (log the listening address).
  4. Pass resolved stations + server into `discoverDevices()` so each accessory
     can wire them up.
- `config.schema.json` — add `global.internetRadio` section:
  - `serverPort` (integer, default hint 18090) — description: "Port the plugin
    uses to serve station JSON files to your speakers (must be reachable from
    the speakers' network segment)".
  - `serverHost` (string, optional) — description: "LAN IP of this Homebridge
    host; auto-detected if omitted".
  - `stations` (array) — each entry: `name` (string, required), `tuneInId`
    (string, optional, "TuneIn station ID, e.g. s24861"), `streamUrl` (string,
    optional, "Direct HTTP stream URL; use when TuneIn ID is unknown or
    the resolved URL is HTTPS").

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

### Spike (resolve before building out)

- [ ] Verify `LOCAL_INTERNET_RADIO` on a real device: POST `/select` with a
      ContentItem, confirm the device fetches the JSON and begins playing.
      Check whether `type="stationurl"` is required on the `<ContentItem>` element
      (not in current `ContentItem` interface — extend if needed).
- [ ] Verify RadioTime OPML response: call
      `https://opml.radiotime.com/Tune.ashx?id=s24861&render=json&formats=mp3,aac&partnerId=RadioTime`
      (BBC World Service); confirm response shape and whether `body[].url` is
      HTTP or HTTPS.
- [ ] Verify that the SoundTouch device can fetch the locally-served station
      JSON over the LAN (not just localhost). Confirm the listening port
      doesn't need firewall rules or is firewall-friendly on the Homebridge host.

### Config types

- [ ] Add `StationExternalConfig`, `InternetRadioConfig` to
      `src/ExternalPlatformConfig.ts`; wire `internetRadio?` into `GlobalConfig`.
- [ ] Parse and validate in `src/PlatformConfiguration.ts`; add a
      `ResolvedInternetRadioConfig` internal type (same shape, defaults applied).
- [ ] Update `src/__tests__/PlatformConfiguration.test.ts`:
      - Station with `tuneInId` only → accepted.
      - Station with `streamUrl` only → accepted.
      - Station with neither → dropped + warning.
      - Defaults: `serverPort=18090`, `serverHost` left as `undefined` (resolved at runtime).

### TuneIn client

- [ ] `src/internetRadio/TuneInClient.ts` — `static create()`, `resolveStationUrl(tuneInId)`.
- [ ] Write `src/internetRadio/__tests__/TuneInClient.test.ts`:
      - Returns first `body[].url` from mocked RadioTime JSON response.
      - Returns `null` and logs on HTTP error or empty body.
      - Logs a warning when resolved URL is HTTPS.

### Station model

- [ ] `src/internetRadio/InternetRadioStation.ts` — static `fromConfig(id, raw)`.
      Validates presence of `name` + (`tuneInId` or `streamUrl`).
- [ ] Barrel `src/internetRadio/index.ts`.

### Local HTTP server

- [ ] `src/internetRadio/InternetRadioServer.ts` — `static create({ port, host, stations })`,
      `listen(): Promise<void>`, `close(): Promise<void>`, `getStationUrl(id)`.
      Serve `GET /station/:id.json` with `Content-Type: application/json`.
      Respond 404 for unknown IDs.
- [ ] `src/internetRadio/__tests__/InternetRadioServer.test.ts`:
      - Start server on ephemeral port; GET known station; verify JSON shape.
      - GET unknown station → 404.

### Platform wiring

- [ ] `src/platform.ts` — in `didFinishLaunching`:
      1. Skip if `config.internetRadio.stations` is empty.
      2. `TuneInClient.create()` → resolve all `tuneInId` stations (parallel
         `Promise.all`); log failures; filter out nulls.
      3. Build `InternetRadioStation[]` from resolved URLs + raw `streamUrl` entries.
      4. `InternetRadioServer.create({ port, host, stations })` → `server.listen()`.
      5. Register `homebridge` `shutdown` hook: `server.close()`.
      6. Pass `{ stations, server }` down to `discoverDevices()`.

### HomeKit characteristic

- [ ] `src/accessories/services/SoundTouchSpeakerInternetRadioCharacteristic.ts`:
      - `static create({ station, stationUrl, service, device, platform, accessory })`.
      - `init()` → `refresh()`.
      - `setOn(true)` → `api.selectSource({ source: 'LOCAL_INTERNET_RADIO', sourceAccount: '', location: stationUrl, itemName: station.name })`.
      - `setOn(false)` → if currently playing this station, `api.pressKey(KeyValue.POWER)`.
      - `refresh()` → compare `nowPlaying` source + location; `characteristic.updateValue(isMatch)`.
      - On API failure: throw `HapStatusError(SERVICE_COMMUNICATION_FAILURE)`.
- [ ] `src/accessories/services/__tests__/SoundTouchSpeakerInternetRadioCharacteristic.test.ts`:
      - `setOn(true)` → `selectSource` called with correct ContentItem.
      - `setOn(false)` while playing this station → POWER key sent.
      - `setOn(false)` while playing a different source → POWER key not sent.
      - `refresh()` while nowPlaying matches station URL → characteristic updated to `true`.

### Accessory wiring

- [ ] `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — add one Switch
      service per station in `createAccessory()`; prune orphaned radio services on
      config change; create `SoundTouchSpeakerInternetRadioCharacteristic` for each.

### Config schema

- [ ] `config.schema.json` — add `global.internetRadio` block with `serverPort`,
      `serverHost`, and `stations[]` (each has `name`, `tuneInId`, `streamUrl`).
      Mark `name` as required within each station entry.

## Verification

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run knip` — confirm no new unused exports/deps.
- [ ] `npm run watch` — with a real speaker:
      - Configure one TuneIn station (e.g. BBC World Service `s24861`) and one
        direct `streamUrl` entry.
      - Confirm two Switch tiles appear in the Home app.
      - Toggle the TuneIn station on → speaker begins playing.
      - Tile reflects active state (On) while playing; reflects Off after stopping.
      - Toggle the direct-URL station → plays.
      - Add/remove a station from config → accessory cache handled correctly.
      - Restart Homebridge → cached accessories rehydrate without duplicate services.

## PR / release notes

- **PR title:** `feat: add internet radio stations via TuneIn`
- **Targets:** `dev`
