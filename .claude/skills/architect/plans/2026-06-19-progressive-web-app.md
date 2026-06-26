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
| 2026-06-19 | Phase 2 (group management) IS possible with documented API: `/getZone`, `/setZone`, `/addZoneSlave`, `/removeZoneSlave` | All four endpoints are in the v1.1 spec and implemented in `src/devices/SoundTouch/api/zone.ts` | — |
| 2026-06-19 | Phase 3 (Homebridge config sync) requires an HTTP API endpoint exposed by the plugin | The Homebridge Config UI handles plugin settings via `config.schema.json` in-process; direct config edits need `api.user.storagePath()` and must not race Homebridge's own write | Writing config outside Homebridge storage dir — violates verified-plugin rules |
| 2026-06-19 | PWA must work offline during the provisioning flow | During setup the phone is on the speaker's hotspot, not the home network — the PWA cannot reach the internet or the Homebridge host | Server-side-rendered app that requires constant connectivity |
| 2026-06-20 | **Hosting resolved: embedded HTTP server in the plugin** | Research confirms Homebridge plugins can run their own HTTP server inside the Homebridge process (same pattern as `homebridge-http-webhooks`, `homebridge-mqttthing`). Plugin starts Express on a configurable port in `didFinishLaunching`; serves `web/dist/` statically. Phone installs the PWA from the plugin URL while on the home network, service worker caches it, then it operates offline during the provisioning hotspot step. | GitHub Pages — requires internet during install, no control over hosting; assumes user has internet access during provisioning UX |

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

### Phase 2 — Group management (zone API)

- The PWA adds a "Groups" screen calling the Homebridge plugin's REST API (or
  talking directly to speakers if the phone is on the same LAN).
- `src/devices/SoundTouch/api/zone.ts` already implements `getZone`, `setZone`,
  `addZoneSlave`, `removeZoneSlave` — these are the backend calls.
- If surfaced via the plugin's REST API: new routes in `src/server/`.

### Phase 3 — Homebridge config sync

- New REST endpoint(s) in `src/server/` to GET/PATCH the plugin's platform block
  in `config.json` (under `api.user.storagePath()`). Write atomically.
- The PWA gains a "Settings" screen to edit speaker IPs, names, groups.

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

### Phase 2 — Group management
- [ ] PWA "Groups" screen: discover speakers (via Homebridge REST API or direct
      mDNS on same LAN), show current zones
- [ ] Create/update/delete zones → `setZone` / `addZoneSlave` / `removeZoneSlave`
- [ ] REST routes in `src/server/` proxying the zone API calls

### Phase 3 — Homebridge config sync
- [ ] Spike B: confirm config write path safety
- [ ] REST GET/PATCH routes for plugin config (`src/server/`)
- [ ] Atomic config write (write-then-rename in `api.user.storagePath()`)
- [ ] PWA "Settings" screen
- [ ] Trigger Homebridge reload or surface restart prompt after config push

## Verification

- [ ] `npm run lint`
- [ ] `npm run build` (plugin + web)
- [ ] `npm test`
- [ ] **Phase 1:** On a real speaker in setup mode, run through the full
      provisioning flow on an iOS + Android device; confirm PWA installs from home
      screen and works offline on the speaker's hotspot.
- [ ] **Phase 2:** Create, modify, and destroy a zone from the PWA; confirm
      Homebridge reflects the change.
- [ ] **Phase 3:** Push a config change from the PWA; restart Homebridge; confirm
      the new config takes effect.

## PR / release notes

- **Foundation PR title:** `feat: add embedded hapi webserver and Svelte PWA scaffold`
- **Phase 1 PR title:** `feat: add PWA for SoundTouch WiFi provisioning`
- **Phase 2 PR title:** `feat: add group management to provisioning PWA`
- **Phase 3 PR title:** `feat: add Homebridge config sync to provisioning PWA`
- **Targets:** `dev`
