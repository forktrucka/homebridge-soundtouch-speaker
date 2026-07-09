# Technical Roadmap

Last updated: 2026-07-09

This file gives the delivery order and dependency chain across all planned
features. The individual plan files contain the detail; this file answers
"what ships in what order and why." Done and cancelled items are removed —
see `plans/done/` and `plans/cancelled/` for the historical record.

## Dependency graph

```mermaid
flowchart TD
    SpikeC{"Spike C Part 2: gabbo\nreal-device capture"}
    SpikeTV{"Spike: TV vs\nper-Switch fallback"}
    SourceNode["[03] Source selection"]
    SpikeA{"Spike A: hotspot\nHTTP API"}
    SpikeB{"Spike B: Homebridge\nconfig write path"}
    PWA1Node["[04] PWA – Phase 1\nWiFi provisioning"]
    PWA2Node["[04] PWA – Phase 2\nGroup management"]
    PWA3Node["[04] PWA – Phase 3\nConfig sync"]

    SpikeC
    SpikeTV --> SourceNode
    SpikeA --> PWA1Node
    PWA1Node --> PWA2Node
    SpikeB --> PWA3Node
    PWA1Node --> PWA3Node
```

## Delivery order

| Order | Plan | Branch | Status | Why this position |
| ----- | ---- | ------ | ------ | ----------------- |
| 1 | **Speaker zones** | `feat/speaker-zones` | 🟢 Next (unblocked) | `zones` config array; `SoundTouchZoneAccessory`; zone API activation at startup sync. `feat:` → minor. Zone API already implemented in `api/zone.ts`. |
| 2 | **Spike C Part 2** | — | 🟡 Unblocked (needs real device) | WebSocket push Phase 1/2 is already in beta; this capture now resolves remaining Phase 3 standby/reconnect/polling-fallback tuning only. |
| 3 | **[03] Source selection** | `feat/source-selection` | 🔴 Blocked (spike) | Blocked on TV-vs-Switch spike (verify Television+InputSource on a real device). |
| 4 | **[04] PWA — Phase 1** | `feat/pwa` | 🔴 Blocked (spike A) | Blocked on spike A (reverse-engineer hotspot provisioning HTTP API at `http://192.0.2.1`). |
| 5 | **[04] PWA — Phase 2** | `feat/pwa` | 🔴 Blocked (needs P1) | Group management via zone API. Needs phase 1 scaffold. |
| 6 | **[04] PWA — Phase 3** | `feat/pwa` | 🔴 Blocked (spike B) | Homebridge config sync. Blocked on spike B + phase 1. |

## Session cost estimates

Per-plan estimate of how much of a single coding session each unit consumes.
Cost is driven by iteration loops (read → edit → test → lint → fix), not line
count. Bands: **Small** (room to spare), **Medium** (one fits comfortably),
**Heavy** (plan on one per session).

| Plan | Band | Drivers that set the band |
| ---- | ---- | ------------------------- |
| **Speaker zones** | Heavy | New `ZoneConfig` type + config schema; `zones` threaded through `PlatformConfiguration`; `SoundTouchZoneAccessory` + `SoundTouchZoneOnCharacteristic`; startup `getZone()` sync; zone set/dissolve via `setZone`/`removeZoneSlave`. |
| **[03] Source selection** | TBD (blocked) | Estimate after TV-vs-Switch spike resolves the architecture. |
| **[04] PWA — Phase 1–3** | TBD (blocked) | New `web/` workspace + embedded `src/server/`. Each phase its own session minimum. |

**Realistic capacity per session:** one Medium/Heavy plan fully verified and
pushed; a second only if the first reaches green with budget clearly remaining.

### Calibration

| Date | Plan | Estimate | Actual | Variance / note |
| ---- | ---- | -------- | ------ | --------------- |
| 2026-06-20 | [05] Integration test harness | Medium | Medium–Heavy | HAP stub written from scratch (homebridge mock provides none); polling hardcoded on (neutralised with fake timers). Lesson: budget for stubbing the framework surface when a test exercises framework wiring. |
| 2026-06-20 | [01] Accessory type | Heavy | Heavy | Full session as estimated. Config threading + orphan pruning touched many files; pruning logic needed extra iteration. |
| 2026-06-20 | [02] Volume — Lightbulb path | Small–Medium | Small–Medium | Landed as estimated. Race fix was the main loop; `On`/`Brightness` ordering required a follow-up fix PR (#91). |
| 2026-06-21 | prefer-it-over-test sweep | Small | Small | Landed as estimated. Pure mechanical rename, no iteration needed. |
| 2026-06-23 | Static factory enforcement | Small | Small | Landed as estimated. Typecheck enforced the constructor/factory migration. |
| 2026-06-23 | Disabled flag | Small | Small | Landed as estimated. Config field plus platform skip/unregister branch. |
| 2026-06-23 | Structured errors + logLevel | Medium | Medium | Landed as estimated, but implementation used `AppError` rather than the planned `ContextError` class name. |
| 2026-06-23 | [07] WebSocket push Phase 1/2 | Heavy | Heavy | `GabboClient`, fake-gabbo harness, lifecycle wiring, debounce, and per-event mapping landed across PRs #117/#124/#125. Phase 3 standby/reconnect tuning remains open. |
| 2026-06-25 | [08] Typed preset management | Heavy | Heavy | Landed with a major pivot from `LOCAL_INTERNET_RADIO`/stream proxy to native `TUNEIN` plus a Bose cloud emulator. Manual setup/licensing follow-up remains in the plan. |

## Spikes (blockers)

### Spike A — SoundTouch setup-mode hotspot HTTP API
**Blocks:** [04] PWA Phase 1.

What we know:
- Enter setup mode: hold **PRESET 2 + VOLUME DOWN** until Wi-Fi indicator turns solid amber.
- Speaker broadcasts "Bose SoundTouch Wi-Fi Network" hotspot.
- Setup web UI is at `http://192.0.2.1` (port 80). Note: `192.168.1.1` is a different Bose product — do not use.
- Standard SoundTouch API (port 8090) also available at `192.0.2.1:8090` during setup.

What must be resolved:
1. Connect a laptop to the hotspot, open browser devtools, walk through WiFi setup. Capture: endpoints, methods, request/response bodies, any tokens.
2. Does the UI scan for available networks, or does the user type the SSID manually?
3. What happens after credentials are submitted — how long until the hotspot drops?
4. Does the phone reconnect to the home network automatically?

### Spike B — Homebridge config write path
**Blocks:** [04] PWA Phase 3.

What must be resolved:
1. `api.user.storagePath()` gives the writable directory — confirm atomic write (write-then-rename) doesn't corrupt Homebridge state.
2. Does Homebridge Config UI X watch for external config changes and reload, or is a restart always required?

### Spike C Part 2 — gabbo WebSocket real-device capture
**Blocks:** [07] WebSocket Phase 3 only (Phase 1 is now unblocked — see below). Part 1 complete (#66).

**Status (2026-06-22):** Questions 1 and 2 below are **confirmed** by reference implementation `Dress13/homebridge-bose-soundtouch` (TypeScript, real-device tested): `gabbo` sub-protocol accepted; all major event shapes match the v1.1 reference; several carry inline data (volume, nowPlaying, presets, zone, bass). Fixed 5 s reconnect + 30 s client-side ping confirmed sufficient in practice.

Remaining open questions (still need real-device capture):

3. Heartbeat / empty-update cadence and server-side idle-timeout behaviour.
4. What happens to the socket on **standby/power-off** — closed? silent? Reconnect trigger?
5. Multi-device reconnect behaviour after a drop.

Run a focused gabbo capture against the device while toggling volume/power/source/preset and putting it into standby.

**Time-box:** one capture session.

## Key coupling notes

- **WebSocket push (plan 07) augments polling — it does not replace it.** Phase 1/2 is in beta. Polling stays as a fallback until Phase 3 resolves standby/reconnect behaviour.
- **Source selection is the highest-risk HomeKit feature.** The Television+InputSource pattern has real caveats (external publishing, `Active`/`On` power model clash, buried UX). The per-source Switch fallback is Plan B if the TV path is too rough.
- **The PWA is architecturally independent** from the HomeKit features. It introduces a new `web/` workspace and `src/server/` embedded HTTP server — no overlap with the HAP characteristic layer.
- **Typed preset management (plan 08) is in beta.** A future plan can wire up HomeKit controls (preset select, station status) or PWA management once the current Bose cloud emulator/manual setup path is settled.
