# Technical Roadmap

Last updated: 2026-06-20

This file gives the delivery order and dependency chain across all planned
features. The individual plan files contain the detail; this file answers
"what ships in what order and why."

## Dependency graph

```
[05] Integration test harness  ──────────────────────────────────────────────┐
                                                                              │
[02] Volume – Switch path (Speaker service)  ─────────────────────────────── │ ──> ships independently
                                                                              │
[01] Accessory type (Switch / Lightbulb)  ────────────────────────────────── │ ──> unlocks ↓
                    │                                                         │
                    └──> [02] Volume – Lightbulb path (Brightness)  ──────── │ ──> ships as follow-up to 01
                                                                              │
[03] Source selection  ──── spike required ──────────────────────────────────┘
                                │
                       resolve TV vs per-Switch fallback
                                │
                                └──> build out chosen path

[04] PWA  ──── three independent phases, each spike-gated
   Phase 1: WiFi provisioning  ──── spike A (hotspot HTTP API)
   Phase 2: Group management   ──── zone API already done; needs phase 1 scaffold
   Phase 3: Config sync        ──── spike B (Homebridge config write path)
```

## Anticipated delivery order

| Order | Plan | Branch | Why this position |
| ----- | ---- | ------ | ----------------- |
| 1 | **[05] Integration test harness** | `test/integration-harness` | Pure test infrastructure, no release. Gives confidence before shipping any user-facing feature. No dependencies. |
| 2 | **[02] Volume — Switch path** | `feat/volume-control` | Adds immediate value to all existing users on the default Switch accessory type. The Speaker-service path has no dependency on plan 01. Ships first so volume isn't blocked on the accessory-type rework. |
| 3 | **[01] Accessory type** | `feat/accessory-type` | Independent of plans 02 and 03, but it's the gate for the Lightbulb/Brightness volume path. Delivering it after the Switch volume path avoids holding volume hostage to the larger config-threading change. |
| 4 | **[02] Volume — Lightbulb path** | (small follow-up PR or bundled with 01) | Brightness characteristic wiring is a small addition once plan 01's `accessoryType` gate exists. Can ship in the same PR as plan 01 or immediately after. |
| 5 | **[03] Source selection** | `feat/source-selection` | Independent of 01/02. Blocked on a **spike** (verify Television+InputSource on a real device; choose TV path vs per-source Switch fallback). Cannot be committed until the spike resolves the architecture choice. |
| 6 | **[04] PWA — Phase 1** | `feat/pwa` | Architecturally separate (new `web/` workspace + embedded HTTP server). Blocked on **spike A** (reverse-engineer the hotspot provisioning HTTP API at `http://192.0.2.1`). Phase 1 must ship before phases 2 and 3 (it creates the web scaffold and embedded server). |
| 7 | **[04] PWA — Phase 2** | `feat/pwa` | Group management via the zone API (`/getZone`, `/setZone`, etc. — already implemented in `src/devices/SoundTouch/api/zone.ts`). Needs the phase 1 PWA scaffold and embedded server to be in place. |
| 8 | **[04] PWA — Phase 3** | `feat/pwa` | Homebridge config sync. Blocked on **spike B** (confirm atomic config write path safety under Homebridge). Requires phase 1 scaffold. |

## Spikes (blockers)

Two features are gated on spikes that must happen on a real device before code
is written. These are not implementation tasks — they're time-boxed
investigations with a concrete question to answer.

### Spike A — SoundTouch setup-mode hotspot HTTP API
**Blocks:** plan 03 (TV path decision) is independent; plan 04 phase 1 is fully blocked.

What we know:
- Enter setup mode: hold **PRESET 2 + VOLUME DOWN** until Wi-Fi indicator turns solid amber.
- Speaker broadcasts "Bose SoundTouch Wi-Fi Network" hotspot.
- Setup web UI is at `http://192.0.2.1` (port 80). Note: `192.168.1.1` is a different Bose product — do not use.
- Standard SoundTouch API (port 8090) is also available at `192.0.2.1:8090` during setup.

What must be resolved:
1. Connect a laptop to the hotspot, open browser devtools, walk through WiFi setup. Capture: endpoints, methods, request/response bodies, any tokens.
2. Does the UI scan for available networks, or does the user type the SSID manually?
3. What happens after credentials are submitted — how long until the hotspot drops?
4. Does the phone reconnect to the home network automatically?

### Spike B — Homebridge config write path
**Blocks:** plan 04 phase 3.

What must be resolved:
1. `api.user.storagePath()` gives the writable directory — confirm atomic write (write-then-rename) doesn't corrupt Homebridge state.
2. Does Homebridge Config UI X watch for external config changes and reload, or is a restart always required?

## Key coupling notes

- **Volume and accessory type are intentionally decoupled for delivery.** Plan 02's Switch/Speaker path ships first and independently; the Lightbulb/Brightness path is a small follow-up gated on plan 01. Users get volume control without waiting for the accessory-type rework.
- **The integration test harness (plan 05) is infrastructure, not a feature.** It has no user impact and no release, but it provides the safety net that makes the subsequent feature PRs lower risk.
- **The PWA (plan 04) is architecturally independent** from the HomeKit features (plans 01–03). It introduces a new `web/` workspace and a `src/server/` embedded HTTP server — concerns that don't overlap with the HAP characteristic layer. Its phases can proceed in parallel with plans 01–03 once spike A is resolved.
- **Source selection (plan 03) is the highest-risk HomeKit feature.** The Television+InputSource pattern has real caveats (external publishing, `Active`/`On` power model clash, buried UX). The spike must answer the architecture question before any code is written; the per-source Switch fallback is the documented Plan B if the TV path is too rough.
