---
feature: Progressive Web App — WiFi provisioning, source selection + group management, Homebridge config write
status: planned # planned | in-progress | done | cancelled
date: 2026-06-19
updated: 2026-07-10
branch: feat/pwa
commit-type: feat
---

# Progressive Web App — WiFi provisioning (phase 1), with source selection + group management and Homebridge config write planned

## Context

A mobile-first Progressive Web App that can be pinned to a phone's home screen.
Phase 1: walk the user through joining a SoundTouch speaker to a WiFi network
(the initial out-of-box setup flow). Later phases: dynamically manage multi-room
speaker zones and push new Homebridge plugin config (e.g. groups, device IPs)
without editing JSON by hand.

This is architecturally distinct from the Homebridge plugin — it's a setup/
management tool, not a HomeKit control path. It lives as a new `web/` npm
workspace in this repo, built with **Vite + Svelte 5** and served by an embedded
**hapi** server inside the plugin (see the 2026-06-26 rows in Decisions). State
uses a **flux** model (Svelte stores + an `actions` module); development gets
**HMR** via a separate Vite dev server that proxies `/api` to hapi.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-19 | **Critical finding: the SoundTouch v1.1 public API has NO documented WiFi provisioning endpoints** | Full scan of `api-reference.md` — only control/status endpoints are documented; `/info` exposes read-only `<networkInfo>` but offers no write path | Assuming undocumented endpoints exist without verification |
| 2026-06-20 | Finding: speaker creates a "Bose SoundTouch Wi-Fi Network" hotspot during setup mode | Bose support docs confirm this SSID | BLE provisioning (not used by SoundTouch) |
| 2026-06-20 | Finding: setup mode is triggered by a hardware button combo — **PRESET 2 + VOLUME DOWN**, hold until Wi-Fi indicator turns solid amber/yellow | Bose support (CA) for SoundTouch 10/20/30/Portable; some models differ | Software-triggered setup mode — not possible; user must press buttons |
| 2026-06-20 | **Correction: setup web UI IP is `192.0.2.1`, not `192.168.1.1`** | Community report (Reddit) for SoundTouch 20 manual recovery explicitly uses `http://192.0.2.1`; earlier research citing `192.168.1.1` was from a different Bose product (LS135 III soundbar) and should not be relied upon for SoundTouch | `192.168.1.1` — likely wrong for SoundTouch speakers |
| 2026-06-20 | Finding: standard SoundTouch HTTP API (port 8090) is also available at the setup IP during setup mode | Bose support (DE) instructs visiting `http://192.168.1.1:8090/info` during setup — same pattern expected at `192.0.2.1:8090` | — |
| 2026-06-20 | Finding: browser-based setup UI at `http://192.0.2.1` (port 80) allows WiFi network selection and credential entry | Community-confirmed; this is the manual recovery path when the SoundTouch app fails | — |
| 2026-06-20 | **Key unknown: the provisioning API behind `http://192.0.2.1` is not documented** | The web UI exists and submits WiFi credentials, but the specific HTTP endpoints, methods, and payloads it uses are unconfirmed — must be reverse-engineered via browser devtools during spike | Treating the web UI URL alone as sufficient to implement the PWA |
| 2026-06-20 | WiFi provisioning spike scoped to HTTP only — BLE ruled out for SoundTouch | Research confirms HTTP; no BLE evidence found for SoundTouch provisioning | BLE / Web Bluetooth approach |
| 2026-06-20 | Finding: older SoundTouch speakers only support 2.4 GHz and WPA2-Personal | Bose troubleshooting docs; affects UI copy — the PWA must warn users to confirm network compatibility before provisioning | — |
| 2026-06-20 | Finding: Bose SoundTouch cloud platform discontinued (2026); local WiFi operation continues | The Verge (2026); local HTTP API and this plugin are unaffected | — |
| 2026-06-19 | Phase 2 (group management) IS possible with documented API: `/getZone`, `/setZone`, `/addZoneSlave`, `/removeZoneSlave` | All four endpoints are in the v1.1 spec and implemented in `src/devices/SoundTouch/api/zone.ts` | — |
| 2026-06-19 | Phase 3 (Homebridge config sync) requires an HTTP API endpoint exposed by the plugin | The Homebridge Config UI handles plugin settings via `config.schema.json` in-process; direct config edits need `api.user.storagePath()` and must not race Homebridge's own write | Writing config outside Homebridge storage dir — violates verified-plugin rules |
| 2026-06-19 | PWA must work offline during the provisioning flow | During setup the phone is on the speaker's hotspot, not the home network — the PWA cannot reach the internet or the Homebridge host | Server-side-rendered app that requires constant connectivity |
| 2026-06-20 | **Hosting resolved: embedded HTTP server in the plugin** | Research confirms Homebridge plugins can run their own HTTP server inside the Homebridge process (same pattern as `homebridge-http-webhooks`, `homebridge-mqttthing`). Plugin starts Express on a configurable port in `didFinishLaunching`; serves `web/dist/` statically. Phone installs the PWA from the plugin URL while on the home network, service worker caches it, then it operates offline during the provisioning hotspot step. | GitHub Pages — requires internet during install, no control over hosting; assumes user has internet access during provisioning UX |
| 2026-06-26 | **Webserver = hapi** (`@hapi/hapi` + `@hapi/inert`) — revises the Express choice in the row above | User-directed. hapi's plugin/route model suits a structured, long-lived config/zone API; same embedded-in-plugin pattern, start in `didFinishLaunching` / stop in `shutdown` | Express (the original choice above); Fastify — no specific advantage requested |
| 2026-06-26 | **Frontend = Vite + Svelte 5 (lean SPA)** built to static assets hapi serves | User-directed. App is small/single-purpose — no SSR/SEO/data-loading framework needed; full control of the service worker via `vite-plugin-pwa`; root tsconfig already ships `lib: ["DOM", ...]` | SvelteKit + adapter-static (a server framework forced into static mode); React/vanilla TS from the earlier row |
| 2026-06-26 | **State = Svelte stores + an `actions` module** (flux-shaped, unidirectional) | User asked for "some kind of flux pattern". Svelte stores already implement unidirectional flow; an `actions` module concentrates all mutations so components never poke stores directly. Zero extra runtime deps | Redux Toolkit / Zustand — boilerplate + a dep, non-idiomatic in Svelte, duplicates what stores already do |
| 2026-06-26 | **HMR = separate Vite dev server (`:5173`) proxying `/api` → hapi** | User asked for hot module reloading. Keeps the two toolchains cleanly separated (they meet only over HTTP); the existing `nodemon → tsc && homebridge` loop is preserved unchanged, and UI iterates via HMR with **no Homebridge restart** | Vite middleware embedded in hapi — Vite middleware assumes Express/Connect `(req,res,next)`; hapi's `onRequest`/`ext` lifecycle makes this fiddly and a maintenance liability |
| 2026-06-26 | **Two independent pipelines** keep `watch`/`build` working — server (`src/server/*.ts` → `tsc` → `dist/`) and frontend (`web/**` → Vite → `web/dist/`) | They watch different trees and emit to different dirs, so they don't collide: `nodemon.json` watches `src` only; Vite watches `web` only. The hapi server is just more TS riding the existing restart loop | A single unified build — couples the toolchains and breaks the clean dev separation |
| 2026-06-26 | **`web/` is its own npm workspace**; ship only the pre-built `web/dist/` | Keeps Svelte/Vite/`vite-plugin-pwa` as devDeps of `web/`, not runtime deps of the published plugin (verified-plugin: no heavy install machinery). Plugin gains only `@hapi/hapi` + `@hapi/inert` at runtime. Requires `web` in the root tsconfig `exclude` (own `web/tsconfig.json`) and `web/dist/` in the npm `files`/`.npmignore` | Frontend deps in the root `package.json` — pollutes the published package |
| 2026-06-23 | **Phase 3 scope expanded — config write must cover preset stations, source selection, and speaker groups** | The internet-radio plan (`2026-06-22-internet-radio-tunein.md`) landed a typed preset system requiring users to hand-edit `config.json` with TuneIn IDs. The PWA is the natural GUI for this: add/edit/delete station presets, change the active source per speaker, and wire up multi-room groups — all via a config-write endpoint, without requiring the Homebridge Config UI. | Separate admin app — extra install friction; Homebridge Config UI — JSON-only, no UX for slots/groups |
| 2026-06-23 | Config-write API must reload the plugin after writing | Homebridge reads `config.json` at startup; a config push that doesn't restart is silently ignored. Options: signal the Homebridge API to restart this platform only (child bridge restart via `api.updatePlatformAccessories`), or instruct the user to restart. Spike B must confirm the cleanest path. | Live-reload without restart — not supported by Homebridge core |
| 2026-06-23 | Phase 3 config-write scope: `accessories[]`, `global.presets[]`, `global.presetSyncInterval` | These three config sections cover the full speaker management use case: add/remove/rename speakers, assign TuneIn presets to slots, and tune the sync schedule. Source selection (active source per speaker) is a live device call, not a config write — it belongs in Phase 2's REST API alongside zone management. | Writing the entire platform config block — too broad; risks overwriting other plugin settings |
| 2026-06-23 | PWA "Presets" screen must include **TuneIn station search** — user types a station name, gets results, picks one, assigns it to a slot | Without search the user must know the TuneIn ID (e.g. `s7162`) — not discoverable. RadioTime OPML search endpoint: `https://opml.radiotime.com/Search.ashx?query=<name>&types=station&render=json`. Returns `body[].guide_id` (the TuneIn ID) and `body[].text` (station name). No new npm dep — the plugin proxies this call through the hapi server. | Require users to look up IDs manually — poor UX, blocks non-developers |
| 2026-06-23 | Spotify preset search is deferred — Spotify requires OAuth and a registered app; TuneIn is anonymous | The bose-cloud emulator only handles TUNEIN source today. Spotify presets would need a separate `source="SPOTIFY"` ContentItem path and OAuth flow — significant scope. Note it as a future extension, do not include in the initial Phase 3 PR. | Including Spotify in Phase 3 — too large; unblocks the core use case without it |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## HomeKit / provisioning reality check (resolve via spikes FIRST)

### Spike A — WiFi provisioning (block on phase 1)

**Known (from research, 2026-06-20):**
- Setup mode: hold **PRESET 2 + VOLUME DOWN** until Wi-Fi indicator turns solid
  amber/yellow. (Some models differ — SoundTouch 20 alternate: hold AUX 15s.)
- Speaker broadcasts a "Bose SoundTouch Wi-Fi Network" hotspot.
- Setup web UI is at **`http://192.0.2.1`** (port 80). Note: `192.168.1.1` from
  earlier research was a different Bose product — do not use.
- Standard SoundTouch HTTP API (port 8090) is also available at `192.0.2.1:8090`
  during setup mode.
- Mechanism is HTTP, not BLE.
- Speakers are 2.4 GHz only and require WPA2-Personal.
- WiFi-only reset (without full factory reset): hold **BLUETOOTH + VOLUME DOWN**.
- Full factory reset: hold **PRESET 1 + VOLUME DOWN** until restart.

**Per-model setup-mode / reset procedures (research, 2026-07-10):**

Bose's own docs split this into two distinct, differently-named flows for every
preset/display model: **"Putting a system into Setup mode"** (non-destructive,
`PRESET 2 + VOL-` family) vs. **"Resetting your product"** (destructive,
`PRESET 1 + VOL-` family). The PWA's "join WiFi" flow should point users at the
*setup-mode* article/combo, not the factory-reset one — the general findings
above conflated the two. Soundbar/amp/adapter models don't have PRESET/VOLUME
buttons at all and need bespoke instructions.

| Model | Setup-mode procedure | LED / indicator | Confidence |
| --- | --- | --- | --- |
| SoundTouch 10 | Hold `2` + `Vol -` until Wi-Fi LED glows amber | Solid amber | Confirmed (support.bose.com/s/article/st10-speakerwireless-putting-a-system-into-setup-mode) |
| SoundTouch 20 (orig., display) | Hold `AUX` 15s until display blanks | Display blank, then setup flow | Confirmed — resolves prior "unconfirmed" AUX-15s note (support.bose.com/s/article/soundtouch-20-wi-fi-music-system-resetting-your-product) |
| SoundTouch 20 III / 30 III | Hold `2` + `Vol -` ~5s until "Setup" shown on display | Display reads "Setup", Wi-Fi LED solid amber | Confirmed (support.bose.com/.../soundtouch-20-III-wireless-speaker-resettng-your-product) |
| SoundTouch 300 soundbar | **No PRESET/VOL buttons.** Hold `9` on remote/panel until all lights flash | All lights flash, then Wi-Fi LED solid amber | Confirmed (support.bose.com/s/article/stsb300-soundbar-putting-a-system-into-setup-mode) |
| SoundTouch Portable | Not separately documented; factory reset (`Preset 1` + `Vol -` 10s) is confirmed. Setup-mode-only combo (`2`+`Vol-`) likely exists per the shared article family but wasn't confirmed by direct fetch | Amber (reset path) | **Probable, not confirmed** |
| SoundTouch SA-5 amplifier | **Single `Control` button**, no presets/volume. Hold ~3s until Wi-Fi LED amber. Gotcha: holding 8–10s (too long) instead disables Wi-Fi/Bluetooth | Solid amber | Confirmed (support.bose.com/s/article/soundtouch-sa-5-amplifier-resetting-your-product) |
| SoundTouch Wireless Link Adapter | **Single rear `Control` button.** See detailed subsection below — this is the project's real test device | See below | Confirmed against the official owner's manual (2026-07-10 deep-dive) |
| SoundTouch Flex | No model-specific article found — may not be a real SoundTouch-line product (possibly confused with non-SoundTouch Bose Flexible-line speakers) | — | **Unconfirmed / not found** — verify against Bose's current product list before including in the PWA's model picker |

#### SoundTouch Wireless Link Adapter — deep dive (2026-07-10, project's real test device)

Source: official Bose owner's manual (`support.bose.com` articles are an
unfetchable Salesforce SPA shell; the manual, read via a ManualsLib mirror of
the same document, was used as the primary source instead —
`https://www.manualslib.com/manual/1222731/Bose-Soundtouch-Wireless-Link.html`,
canonical PDF at
`https://assets.bose.com/content/dam/Bose_DAM/Web/consumer_electronics/global/products/speakers/soundtouch_wireless_link/PDF/774339_og_soundtouch-adapter_en.pdf`
though that URL wasn't directly fetchable from this environment). Relevant
pages: 23–24 (LEDs), 27–29 (troubleshooting/reset), 30–31 (USB setup
connector). A newer "2018" ManualsLib listing (id `1580059`) also exists and
wasn't diffed against this one — check it if the unit's firmware/hardware
revision looks different.

**One button, three operations — split by power-cycle, not duration:**

- **Enter setup mode (keeps existing network config):** hold `Control` **8–10s**
  while already powered on, until the Wi-Fi LED flashes once then glows solid
  amber.
- **Disable networking:** hold `Control` **8–10s** the same way, until the
  Wi-Fi LED turns **off** entirely — this is a third, distinct state (not
  setup mode, not connected). Easy to overshoot into this if timing is off.
- **Factory reset (wipes network + source settings):** unplug power, **hold
  `Control` while reconnecting power**, release once the Wi-Fi LED is solid
  amber. Manual gives no numeric duration for this one — the differentiator
  from "enter setup mode" is that the button is held *through a cold boot*,
  not while already running. End LED state (solid amber) is identical to
  plain setup-mode entry, so the power-cycle is the only way to tell which
  path you're on. Bose notes the SoundTouch account/presets survive this but
  become unassociated from the unit until re-setup with the same account.

**LEDs (two indicators — Wi-Fi and Bluetooth; this model does support
Bluetooth pass-through per manual ch. 20):**

| Wi-Fi LED | Meaning |
| --- | --- |
| Blinking white | Searching for Wi-Fi network |
| Solid white (dim) | Power-saving mode, connected |
| Solid white (bright) | On and connected |
| Solid amber | Setup mode |
| Blinking fast amber | Firmware error |
| Off | Networking disabled |

| Bluetooth LED | Meaning |
| --- | --- |
| Slow blinking white | Ready to connect |
| Blinking white | Connecting |
| Solid white | Connected |

No documented "factory-reset-in-progress" LED state — presumably passes
through normal boot states before landing on solid amber, but not confirmed.

**Provisioning-relevant quirks:**

- **Same-subnet requirement (openHAB community report):** this model appears
  stricter than regular SoundTouch speakers about the controlling client's
  source IP — a user hit persistent `COMMUNICATION_ERROR`/connect-timeout
  until their client was on the same subnet/network as the adapter (no such
  issue on a SoundTouch 10 on the same LAN). Worth testing explicitly: if the
  PWA/hapi server host is ever on a different subnet/VLAN from the adapter,
  provisioning may silently fail. (`community.openhab.org/t/bosesoundtouch-binding-is-not-connecting-to-bose-soundtouch-wireless-link-adapter/46236`)
- **Firmware update quirk (AVS Forum, unconfirmed — thread paywalled):**
  reports of firmware updates getting stuck (Wi-Fi LED blinking white then
  amber) via both app and USB; Bose support apparently advised updating
  incrementally rather than jumping to latest, warning of bricking risk on
  skipped steps. Worth checking the test unit's current firmware version
  before/during provisioning testing.
- **USB setup connector exists** (rear USB-A to USB-Micro-B) as a fallback
  provisioning path via a "SoundTouch app for computer" from
  `global.Bose.com/Support/STWL` — manual explicitly warns not to plug in
  unless the guided setup prompts for it. Not needed for the HTTP-based PWA
  approach, but useful as a manual fallback if HTTP provisioning testing gets
  stuck on the real unit.
- **`/info` endpoint:** expected to return the standard SoundTouch `/info` XML
  (same `deviceID` convention as other models), but the exact `type`/
  `deviceType` string this model reports and whether it lists two MAC
  addresses (Wi-Fi vs. Bluetooth vs. a second radio) was not confirmed from
  secondhand sources. **Action item: once the test unit is on the network,
  capture a real `GET /info` response from it directly** rather than
  guessing — this should be the first thing done with the physical device
  once network-joined, both to settle this and to seed Spike A's "what does
  this model actually report" question for the model-picker/auto-detect
  logic mentioned above.

Implication for the PWA: the "join WiFi" onboarding screen cannot use one
generic "hold these two buttons" graphic — it needs a per-model-family
instruction set (display/preset models vs. soundbar vs. amp vs. adapter vs.
portable), selected by a model picker or auto-detected from `/info`.

Sources are WebSearch snippet-cache citations of `support.bose.com` articles,
not full-page fetches (Bose's support site is a JS-rendered SPA that
`WebFetch` cannot render). If verbatim quoting is needed later, re-fetch via a
JS-rendering method or manually visit the article before finalizing copy.

**Still unknown — must resolve on a real speaker:**
1. **What HTTP calls does `http://192.0.2.1` actually make?** Connect a laptop
   to the hotspot, open browser devtools (Network tab), walk through WiFi setup.
   Capture: endpoints, methods, request/response bodies, any tokens or cookies.
2. **Does the UI scan for available networks** (i.e. is there a network-list
   endpoint), or does the user type the SSID manually?
3. **What happens after credentials are submitted?** Does the speaker drop the
   hotspot immediately? How long does it take to join the home network?
4. **Transition UX:** Does the user need to manually reconnect their phone, or
   does the phone drop back to the home network automatically?

### Spike B — Homebridge config write path (block on phase 3)

1. Confirm `api.user.storagePath()` gives the writable path and that atomically
   updating `config.json` there (write-then-rename) doesn't corrupt Homebridge
   state.
2. Check whether Homebridge Config UI X watches for external config changes and
   reloads — or whether a restart is always required after a config push.

## Affected areas

### Webserver + build/dev infrastructure (foundation for all phases)

- **New `web/` workspace** — the PWA source (Vite + Svelte 5, own `package.json`,
  `tsconfig.json`, `vite.config.ts`, ESLint, `web/README.md`).
  - `web/src/` — Svelte components; `stores/` (writable/derived, the single source
    of truth); `actions/` (the **only** place stores are mutated); `lib/api.ts`
    (fetch wrapper hitting `/api`).
  - `web/public/manifest.webmanifest` + icons; service worker via
    `vite-plugin-pwa`. Build output → **`web/dist/`** (served by hapi; shipped in
    the npm tarball).
- **New `src/server/`** — hapi server.
  - `server.ts` — `createServer({ port, root })`: registers `@hapi/inert`, serves
    `web/dist/` statically (SPA fallback to `index.html`), mounts `/api`. Exposes
    `start()` / `stop()`.
  - `routes/` — `/api/health` first; zone + config-sync routes added in phases 2/3.
  - `src/server/__tests__/` — unit tests for route handlers / pure server logic.
- `src/platform.ts` — instantiate the server when `webPort` is set; `start()` in
  the `didFinishLaunching` handler (alongside `discoverDevices()`), `stop()` in
  the `shutdown` handler (alongside `stopPolling()`).
- `config.schema.json` + config classes — `webPort` (opt-in integer, default off:
  absence ⇒ no server, no new port, no behaviour change).
- **Build / dev / packaging** (`package.json` root):
  - `"build": "npm run clean && tsc && npm run build:web"`,
    `"build:web": "npm -w web run build"`
  - `"dev:web": "npm -w web run dev"` (Vite, HMR, `/api` proxy);
    optional `"dev": "npm-run-all -p watch dev:web"`
  - add `web` to `workspaces`; add `@hapi/hapi` + `@hapi/inert` to dependencies
  - `nodemon.json` unchanged (the hapi server rides the existing `tsc && homebridge`
    restart); `tsconfig.json` adds `"web"` to `exclude`; `.npmignore`/`files`
    ship `web/dist/` (not `web/src`); scope `knip.json` + root `eslint.config.js`
    so they don't fight the `web` workspace toolchain.

### Phase 2 — Live device control (source selection + group management)

- The PWA adds a "Groups" screen and a per-speaker "Source" picker.
- **Source selection:** calls `POST /select` on the target speaker with the chosen
  `ContentItem` (AUX, BLUETOOTH, TUNEIN preset, etc.). Sources available via
  `GET /sources`. This is a live device call — no config write needed.
- **Zone management:** create/update/delete multi-room zones via `setZone`,
  `addZoneSlave`, `removeZoneSlave`. `src/devices/SoundTouch/api/zone.ts` already
  implements these.
- **All live calls proxied through new routes in `src/server/`** (the hapi REST
  API), so the PWA never talks to speakers directly — it always talks to the
  plugin, which is the one thing on the LAN that already knows every speaker's
  IP. This also means the PWA can run from the plugin's own origin without CORS
  or per-speaker network reachability from the phone.

### Phase 3 — Homebridge config write

Scope: `accessories[]` (speakers), `global.presets[]` (TuneIn station slots),
`global.presetSyncInterval`.

- New REST endpoints in `src/server/` (hapi), same proxy pattern as Phase 2:
  - `GET /config` — returns the current plugin platform block (sanitised).
  - `PATCH /config/accessories` — add/remove/rename speakers (name, IP, port).
  - `PATCH /config/presets` — add/edit/delete station preset entries (slot,
    name, tuneInId, imageUrl).
  - `PATCH /config/presetSyncInterval` — update sync schedule.
  - `GET /tunein/search?q=<name>` — proxy to RadioTime `Search.ashx`; returns
    `[{ tuneInId, name, imageUrl }]`. Powers the PWA "Presets" search UI.
- Writes atomically to `api.user.storagePath()/config.json`
  (write-then-rename); must not race Homebridge's own config writes.
- Triggers a plugin reload after writing (mechanism TBD — Spike B).
- PWA gains a "Speakers" screen (add speaker by IP, rename) and a "Presets"
  screen (assign TuneIn stations to slots 1–6 per speaker group).

## Conventions for this change

- **Commit type:** `feat:` → minor release (for each phase PR).
- **Config schema touched:** yes — add `webPort` (optional integer) to
  `config.schema.json`, `src/ExternalPlatformConfig.ts`,
  `src/PlatformConfiguration.ts`, and `src/__tests__/PlatformConfiguration.test.ts`
  (use `??`, no default ⇒ server disabled when absent).
- **Tests to add/update:** `src/server/__tests__/*.test.ts` (route/server logic);
  pure Svelte UI is not Jest-tested (use the Vite dev server / Playwright / manual).
- Follow **coding-conventions** for any TypeScript in `src/` (ESM `.js` import
  extensions, lint/format, the typecheck+lint+test gate); the `web/` workspace runs
  its own Vite/Svelte toolchain — document it in `web/README.md` (contributor-facing,
  not published to npm users).
- **Verified-plugin guardrails** (homebridge-developer skill): server is opt-in via
  `webPort` (off by default), port is configurable (child-bridge safe), errors are
  caught/logged (no raw throws on the Homebridge thread), any disk writes go through
  `api.user.storagePath()`.
- **Target branch:** `dev` (the webserver/build foundation lands first; each PWA
  phase as its own subsequent PR).

## Implementation checklist

### Spike (prerequisite — block all phases on this)
- [ ] **Spike A:** On a real SoundTouch speaker, document the setup-mode hotspot
      SSID, IP, and any HTTP provisioning endpoints (port, method, payload). If BLE
      is the actual mechanism, document that and evaluate Web Bluetooth feasibility
      on iOS Safari before committing to phase 1.

### Webserver + build foundation (lands before the phases below)
- [ ] Add `web` as an npm workspace; scaffold `web/` (Vite + Svelte 5, TS,
      `vite-plugin-pwa`, `manifest.webmanifest`, icons, `web/README.md`)
- [ ] Svelte flux layer: `stores/` (writable/derived) + `actions/` (sole mutators)
      + `lib/api.ts` fetch wrapper
- [ ] Vite dev server proxies `/api` → hapi (HMR working)
- [ ] Add `@hapi/hapi` + `@hapi/inert`; build `src/server/server.ts`
      (`start`/`stop`, inert static serving of `web/dist/` with SPA fallback)
- [ ] `/api/health` route + `src/server/__tests__/` unit test
- [ ] Add `webPort` to `ExternalPlatformConfig`, `PlatformConfiguration`,
      `config.schema.json`, and `PlatformConfiguration.test.ts`
- [ ] Wire server `start()`/`stop()` into `platform.ts`
      (`didFinishLaunching` / `shutdown`), gated on `webPort`
- [ ] Update root `package.json` scripts (`build`, `build:web`, `dev:web`),
      `tsconfig.json` exclude, `.npmignore`/`files`, `knip.json`, CI step
- [ ] Confirm `npm run watch` still restarts cleanly and `vite` HMR works beside it

### Phase 1 — WiFi provisioning PWA
- [ ] Spike A resolved — provisioning mechanism confirmed
- [ ] Implement WiFi scan UI → calls speaker hotspot endpoint
- [ ] Implement credential submission → speaker connects to home network
- [ ] Handle the hotspot→home-network transition gracefully in the UI

### Phase 2 — Live device control (source selection + group management)
- [ ] Plugin REST API routes in `src/server/`:
      `GET /speakers` (list known devices), `POST /speakers/:id/source`,
      `GET /speakers/:id/sources`, `GET /speakers/:id/zone`,
      `POST /speakers/:id/zone`, `DELETE /speakers/:id/zone`
- [ ] PWA "Groups" screen: show current zones, create/edit/delete zones
- [ ] PWA per-speaker "Source" picker: list available sources, select active one

### Phase 3 — Homebridge config write
- [ ] Spike B: confirm config write path safety + reload mechanism
- [ ] Plugin REST API routes: `GET /config`, `PATCH /config/accessories`,
      `PATCH /config/presets`, `PATCH /config/presetSyncInterval`
- [ ] Atomic config write (write-then-rename in `api.user.storagePath()`)
- [ ] Trigger plugin reload after write (or surface restart prompt)
- [ ] PWA "Speakers" screen: add/remove/rename speakers by IP
- [ ] PWA "Presets" screen:
      - Search TuneIn by station name → results list → pick station → assign to
        slot 1–6. Plugin proxies RadioTime search (`Search.ashx?query=<name>`)
        and returns `[{ tuneInId, name, imageUrl }]`.
      - Show existing preset assignments (read from current config).
      - Save → `PATCH /config/presets` → plugin writes config + reloads.
      - (Future) Spotify preset search — deferred; requires OAuth.

## Verification

- [ ] `npm run lint`
- [ ] `npm run build` (plugin + web)
- [ ] `npm test`
- [ ] **Phase 1:** On a real speaker in setup mode, run through the full
      provisioning flow on an iOS + Android device; confirm PWA installs from home
      screen and works offline on the speaker's hotspot.
- [ ] **Phase 2:** Select AUX source from PWA on a real speaker → source changes.
      Create a zone (master + slave), confirm multi-room playback, then delete zone.
- [ ] **Phase 3:** Add a TuneIn preset via PWA "Presets" screen → config.json
      updated, plugin reloads, preset button on speaker plays the station.

## PR / release notes

- **Foundation PR title:** `feat: add embedded hapi webserver and Svelte PWA scaffold`
- **Phase 1 PR title:** `feat: add PWA for SoundTouch WiFi provisioning`
- **Phase 2 PR title:** `feat: add source selection and group management to provisioning PWA`
- **Phase 3 PR title:** `feat: add Homebridge config write to provisioning PWA`
- **Targets:** `dev`
