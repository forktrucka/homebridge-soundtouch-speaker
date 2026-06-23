---
feature: Progressive Web App — WiFi provisioning, group management, Homebridge config sync
status: planned # planned | in-progress | done | cancelled
date: 2026-06-19
updated: 2026-06-20
branch: feat/pwa
commit-type: feat
---

# Progressive Web App — WiFi provisioning (phase 1), with group management and Homebridge config sync planned

## Context

A mobile-first Progressive Web App that can be pinned to a phone's home screen.
Phase 1: walk the user through joining a SoundTouch speaker to a WiFi network
(the initial out-of-box setup flow). Later phases: dynamically manage multi-room
speaker zones and push new Homebridge plugin config (e.g. groups, device IPs)
without editing JSON by hand.

This is architecturally distinct from the Homebridge plugin — it's a setup/
management tool, not a HomeKit control path. It likely lives as a new `web/`
workspace in this repo (or a separate repo), served either from GitHub Pages or
from a lightweight HTTP server embedded in the plugin.

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
| 2026-06-23 | **Phase 3 scope expanded — config write must cover preset stations, source selection, and speaker groups** | The internet-radio plan (`2026-06-22-internet-radio-tunein.md`) landed a typed preset system requiring users to hand-edit `config.json` with TuneIn IDs. The PWA is the natural GUI for this: add/edit/delete station presets, change the active source per speaker, and wire up multi-room groups — all via a config-write endpoint, without requiring the Homebridge Config UI. This converges the setup story: speaker added via bose-cloud emulator (see `2026-06-23-speaker-setup-helper.md`), then configured entirely through the PWA. | Separate admin app — extra install friction; Homebridge Config UI — JSON-only, no UX for slots/groups |
| 2026-06-23 | Config-write API must reload the plugin after writing | Homebridge reads `config.json` at startup; a config push that doesn't restart is silently ignored. Options: signal the Homebridge API to restart this platform only (child bridge restart via `api.updatePlatformAccessories`), or instruct the user to restart. Spike B must confirm the cleanest path. | Live-reload without restart — not supported by Homebridge core |
| 2026-06-23 | Phase 3 config-write scope: `accessories[]`, `global.presets[]`, `global.presetSyncInterval` | These three config sections cover the full speaker management use case: add/remove/rename speakers, assign TuneIn presets to slots, and tune the sync schedule. Source selection (active source per speaker) is a live device call, not a config write — it belongs in Phase 2's REST API alongside zone management. | Writing the entire platform config block — too broad; risks overwriting other plugin settings |

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

### Phase 1 — WiFi provisioning

- **New `web/` directory** (monorepo workspace or standalone) — the PWA source.
  Suggest Vite + vanilla TS or React; `manifest.json` + service worker for
  installability and offline caching. Build output goes to `web/dist/`.
- `package.json` — add `web` workspace if monorepo; add a `build:web` script.
- Possibly **a new `src/server/`** — a minimal Express/Fastify server (if hosted
  in-plugin rather than GitHub Pages) to serve `web/dist/` on a configurable
  port; started in `platform.ts` `didFinishLaunching`; reads port from config.
- `config.schema.json` + config classes — `webPort` (opt-in, default off) if the
  embedded server path is chosen.

### Phase 2 — Live device control (source selection + group management)

- The PWA adds a "Groups" screen and a per-speaker "Source" picker.
- **Source selection:** calls `POST /select` on the target speaker with the chosen
  `ContentItem` (AUX, BLUETOOTH, TUNEIN preset, etc.). Sources available via
  `GET /sources`. This is a live device call — no config write needed.
- **Zone management:** create/update/delete multi-room zones via `setZone`,
  `addZoneSlave`, `removeZoneSlave`. `src/devices/SoundTouch/api/zone.ts` already
  implements these.
- All live calls proxied through new routes in `src/server/` (plugin REST API),
  so the PWA doesn't need per-speaker LAN access — it talks to the plugin.

### Phase 3 — Homebridge config write

Scope: `accessories[]` (speakers), `global.presets[]` (TuneIn station slots),
`global.presetSyncInterval`.

- New REST endpoints in `src/server/`:
  - `GET /config` — returns the current plugin platform block (sanitised).
  - `PATCH /config/accessories` — add/remove/rename speakers (name, IP, port).
  - `PATCH /config/presets` — add/edit/delete station preset entries (slot,
    name, tuneInId, imageUrl).
  - `PATCH /config/presetSyncInterval` — update sync schedule.
- Writes atomically to `api.user.storagePath()/config.json`
  (write-then-rename); must not race Homebridge's own config writes.
- Triggers a plugin reload after writing (mechanism TBD — Spike B).
- PWA gains a "Speakers" screen (add speaker by IP, rename) and a "Presets"
  screen (assign TuneIn stations to slots 1–6 per speaker group).

## Conventions for this change

- **Commit type:** `feat:` → minor release (for each phase PR).
- **Config schema touched:** yes if embedded server is chosen — add `webPort`
  (optional integer) to `GlobalConfig` / `config.schema.json` / `PlatformConfiguration`.
- **Tests to add/update:** unit-test any server-side route logic; pure PWA UI is
  not Jest-tested (use Playwright or manual verification). Config class tests in
  `src/__tests__/PlatformConfiguration.test.ts` if `webPort` is added.
- Follow **coding-conventions** for any TypeScript in `src/`; the `web/` workspace
  may have its own toolchain (Vite, ESLint config) — document it in `web/README.md`
  (contributor-facing, not published to npm users).
- **Target branch:** `dev` (each phase as its own PR).

## Implementation checklist

### Spike (prerequisite — block all phases on this)
- [ ] **Spike A:** On a real SoundTouch speaker, document the setup-mode hotspot
      SSID, IP, and any HTTP provisioning endpoints (port, method, payload). If BLE
      is the actual mechanism, document that and evaluate Web Bluetooth feasibility
      on iOS Safari before committing to phase 1.

### Phase 1 — WiFi provisioning PWA
- [ ] Spike A resolved — provisioning mechanism confirmed
- [ ] Scaffold `web/` PWA (Vite + TS, `manifest.json`, service worker, app icon)
- [ ] Implement WiFi scan UI → calls speaker hotspot endpoint
- [ ] Implement credential submission → speaker connects to home network
- [ ] Handle the hotspot→home-network transition gracefully in the UI
- [ ] Decide and implement hosting: GitHub Pages static or embedded plugin server
- [ ] If embedded server: add `webPort` config + `src/server/` Express routes
- [ ] Add `build:web` script and CI step

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
- [ ] PWA "Presets" screen: assign TuneIn station IDs to slots 1–6

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

- **Phase 1 PR title:** `feat: add PWA for SoundTouch WiFi provisioning`
- **Phase 2 PR title:** `feat: add source selection and group management to provisioning PWA`
- **Phase 3 PR title:** `feat: add Homebridge config write to provisioning PWA`
- **Targets:** `dev`
