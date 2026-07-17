---
feature: WebSocket push (gabbo) — event-driven characteristic refresh, augmenting HTTP polling
status: beta # v0.4.0-beta.1; Phase 3 standby/reconnect edges remain open
date: 2026-06-20
branch: feat/websocket-push
commit-type: feat
---

# WebSocket push (gabbo) — event-driven refresh

## Context

Today every characteristic is refreshed by a fixed HTTP **polling** loop
(`SoundTouchSpeakerPlatformAccessory._refreshDeviceServices`, 2 s). That is
laggy (up to one interval behind a real change) and wasteful (every device is
re-GET'd on a timer whether or not anything changed).

The SoundTouch speaker also exposes a **WebSocket notification channel** on
port `8080`, sub-protocol `gabbo`. It pushes `<updates>` frames when state
changes — `volumeUpdated`, `nowPlayingUpdated`, `bassUpdated`, `zoneUpdated`,
`presetsUpdated`, `infoUpdated`, … . Most are "tickles" (they say *what*
changed; the client re-GETs the matching endpoint); a few carry data inline.

This plan adopts that channel to drive refresh **reactively**: when a tickle
arrives, refresh the affected characteristic immediately. The target is an
**augmentation**, not a replacement — polling stays on as a relaxed-interval
fallback (see decisions). This depends on **plan 06 (polling lifecycle)** for
the connection-lifecycle machinery and the configurable polling it makes the
fallback, and is **blocked on Spike C** (see `ROADMAP.md`) until the gabbo
channel's real-device behaviour is confirmed.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-20 | **Finding (correction):** there is **no** existing WebSocket connection in the codebase | `grep` for `ws://`/`gabbo`/`8080`/`WebSocket` over `src/` finds only the literal `sender: 'Gabbo'` in the `/key` POST body (`api/api.ts`). The optimistic claim in the volume plan's findings (2026-06-20, "existing per-device WebSocket connection") is **wrong** — the WS channel must be built from scratch. This is exactly why volume's WS path was deferred. | — |
| 2026-06-20 | **Finding:** the WS *client* needs no new runtime dependency | Node 22/24 ship a global `WebSocket` (undici) supporting sub-protocol negotiation; `engines.node` is `^22.10.0 \|\| ^24.0.0`. `new WebSocket("ws://<ip>:8080", "gabbo")` works out of the box. | Adding `ws` as a runtime dependency (unnecessary; larger supply-chain surface) |
| 2026-06-20 | **Finding:** the local *test* fake-gabbo server **does** need `ws` (devDependency) | Node has no built-in WS *server*; the fake-gabbo harness (mirroring `FakeSoundTouchServer`) needs one to emit reference frames. Dev-only, so no end-user impact. | Hand-rolling an RFC6455 server (over-engineered for a test double) |
| 2026-06-20 | **Decision:** augment polling, don't replace it | WS sockets drop (Wi-Fi, speaker standby, idle timeout) and a tickle can be missed. Polling at a relaxed interval (e.g. 30–60 s) is a cheap safety net that reconciles missed events; WS gives the instant updates. User-selected. | Replace polling entirely (no safety net if the socket drops or a tickle is missed) |
| 2026-06-20 | **Decision:** sequence after plan 06 (polling lifecycle); serialise, don't parallelise | The WS connection has the same lifecycle as the polling loop — open on `init`, tear down on unregister/`shutdown`. Plan 06 builds exactly that (retain wrappers in a `Map`, stop on unregister/shutdown). WS reuses it. Both touch `SoundTouchSpeakerPlatformAccessory.ts` + `platform.ts`, so they **must** serialise. Plan 06 also makes polling configurable, which is what turns polling into the relaxed fallback. | Parallel with plan 06 (guaranteed merge conflicts on shared lifecycle files); before plan 06 (would build connection-lifecycle twice) |
| 2026-06-20 | **Decision (this session):** research/docs only — no probe or harness code yet | User directive. Record the spike definition, findings, and rollout plan; defer building the probe script and fake-gabbo harness until the spike is scheduled (and ideally a real device is available). | Building the Part-1 harness now (premature given no real-device validation lined up) |
| 2026-06-20 | **Open (Spike C):** real-device behaviour is unverified | Heartbeat/idle cadence, socket behaviour on standby/power-off, reconnect/backoff semantics, and whether real frames match the v1.1 reference are all undocumented. These shape the reconnect strategy and the fallback interval. Must be answered before implementation. | Building on documented assumptions alone (higher risk of a reconnect-storm or missed-event bug) |
| 2026-06-21 | **Blocked:** waiting on `disabled` flag and structured-errors/logLevel to ship first | User wants easier testing setup before validating WebSocket behaviour — disable speakers cleanly and read logs clearly during the real-device capture session (Spike C Part 2). | Starting implementation now — testing the WebSocket path is harder without the prerequisites. |
| 2026-06-22 | **Finding:** reference implementation `Dress13/homebridge-bose-soundtouch` confirms `gabbo` protocol on real hardware | The plugin's `soundtouchWebSocket.ts` uses `new WebSocket("ws://${host}:8080", "gabbo")` with the `ws` package and confirms: (1) sub-protocol negotiation works; (2) `volumeUpdated`, `nowPlayingUpdated`, `nowSelectionUpdated`, `presetsUpdated`, `zoneUpdated`, `bassUpdated`, `connectionStateUpdated` all fire; (3) several carry inline data (volume, nowPlaying, presets, zone, bass) — not only tickles; (4) a fixed 5 s reconnect delay on `close` is sufficient in practice; (5) client-sent 30 s pings keep the socket alive; (6) `connectionStateUpdated` fires with `state`/`up` fields — useful for standby detection. Remaining unknowns: exact socket behaviour on speaker standby/power-off (closed vs silent), server-side idle timeout, and real-frame timing. | — |
| 2026-06-22 | **Decision (revised):** Spike C Part 2 is **narrowed**, not a hard phase-1 blocker | Connection pattern and all major event shapes are now confirmed by the reference. Phase 1 (connection + lifecycle) can proceed once the testing prerequisites (disabled flag, logging) ship. Phase 3 (standby edge cases, reconnect tuning) still benefits from a real-device capture, but it is no longer blocking Phase 1. | Holding all phases behind Spike C (over-cautious given confirmed reference) |
| 2026-06-22 | **Decision:** keep native `WebSocket` (Node 22/24) for runtime; `ws` for devDep only | Reference uses `ws` package at runtime; Node 22/24 native `WebSocket` (undici) supports sub-protocols (`new WebSocket(url, protocols)`) and avoids adding a runtime dependency. Sub-protocol negotiation confirmed equivalent. `ws` stays as devDep for the fake-gabbo test server only. | Switching to `ws` as a runtime dep (adds supply-chain surface with no functional benefit on Node 22+) |
| 2026-07-09 | Phase 1 and Phase 2 implementation merged and released to beta | PR #117 added `GabboClient`, parser, fake-gabbo harness, lifecycle wiring, and broad refresh; PR #124 debounced notifications; PR #125 mapped gabbo events to specific characteristics. All are contained in `v0.4.0-beta.1`. Phase 3 real-device standby/reconnect tuning remains open. | Leaving the whole plan marked `blocked` after the delivered phases shipped |
| 2026-07-17 | **Spike C Part 2 real-device capture complete — both remaining questions answered** | Live `gabbo` capture against a real speaker ("Remote", `10.0.0.22`) via a standalone `ws` script, covering ~2 min idle, volume changes, source switches (Spotify → Bluetooth → AUX), standby, and power-on. Q3 (heartbeat/idle-timeout cadence): **no server-side heartbeat or keepalive traffic observed at all** — 2+ minutes fully idle produced zero messages after the initial `SoundTouchSdkInfo` handshake; the socket is push-only, silent when nothing changes. Q4 (standby socket behaviour): **the socket stays open and fully silent during standby** — no `close`, no ping/pong, no traffic for 113 s of standby; on power-on, `connectionStateUpdated` and `nowSelectionUpdated`/`nowPlayingUpdated` (resuming the last source, here AUX) arrived on the **same** connection, confirming standby does not close or require reconnecting the socket. This resolves the last open items for Phase 3: no idle-timeout to defend against, and no standby-triggered reconnect logic is needed — the existing 5 s reconnect-on-`close` + 30 s client ping (already implemented) is sufficient, since standby simply produces no traffic rather than a drop. | — |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

> Indicative — to be finalised by the architect after Spike C resolves.

- **New** `src/devices/SoundTouch/api/notifications/` (or similar) — a
  `gabbo` WebSocket client: connect to `ws://<ip>:8080` with sub-protocol
  `"gabbo"`, parse `<updates>` frames (reuse `XMLElement` /
  `api/utils/xml-element.ts`), and emit typed events (`volumeUpdated`,
  `nowPlayingUpdated`, …). Owns reconnect/backoff and teardown.
- `src/devices/SoundTouch/SoundTouchDevice.ts` — own the notification client
  alongside the HTTP `api`; expose subscribe/teardown.
- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — on a relevant
  tickle, call the matching characteristic's `refresh()`. Polling becomes the
  relaxed fallback (interval from plan 06's config).
- `src/accessories/services/*Characteristic.ts` — no shape change; their
  existing `refresh()` is the reuse point (updates HAP only when changed).
- `src/platform.ts` — tear down notification clients on unregister/`shutdown`
  (alongside plan 06's `stopPolling()`).
- **New (test)** `src/__integration__/helpers/fake-gabbo-server.ts` — a
  `ws`-backed fake emitting reference frames, mirroring `FakeSoundTouchServer`.
- `package.json` — add `ws` (+ `@types/ws`) as **devDependencies** only.

## Conventions for this change

- **Commit type:** `feat:` → minor release. (Phased; each phase its own PR.)
- **Config schema touched:** likely yes in a later phase (e.g. a toggle to
  disable push, or to set the fallback interval) — defer the exact shape to the
  architect post-spike. No schema change in phase 1 if push is always-on with
  polling fallback.
- **Tests to add/update:** fake-gabbo harness + a notification-client unit test
  (connect, parse tickle, emit event, reconnect on close); an integration test
  asserting a pushed `volumeUpdated` updates the HAP value without advancing the
  poll timer.
- Follow **coding-conventions**, the SoundTouch protocol in
  **soundtouch-api-expert** (read `api-reference.md` → "WebSocket
  notifications"), and the lifecycle patterns in **homebridge-developer**.
- **Target branch:** `dev`.

## Phased rollout (post-spike)

Sequenced **after plan 06**. Each phase is its own PR.

- **Phase 1 — connection + lifecycle.** `gabbo` client module: connect,
  sub-protocol negotiate, parse `<updates>`, reconnect/backoff, teardown on
  unregister/shutdown. Wire it to trigger the existing accessory `refresh()` on
  any state-change tickle. Polling retained as fallback. *Heavy.*
- **Phase 2 — per-event mapping.** Map specific tickles to specific
  characteristic refreshes (`volumeUpdated`→volume, `nowPlayingUpdated`→on/
  source, `bassUpdated`→bass, …) instead of refreshing everything; optionally
  consume inline data to skip the re-GET. *Medium.*
- **Phase 3 — tune polling + edges.** Relax/disable the polling fallback now
  that push is primary (config-driven via plan 06); handle reconnect storms,
  the zone-map update sequence, and standby/power-off socket behaviour per the
  spike findings. *Medium.*

## Implementation checklist

> Do **not** start until Spike C is resolved and plan 06 has merged.

- [ ] (Spike C) Resolve real-device standby/reconnect behaviour — see `ROADMAP.md` → Spike C
- [x] Phase 1: `gabbo` WebSocket client (connect, parse, reconnect, teardown)
- [x] Phase 1: trigger accessory `refresh()` on state-change tickles
- [x] Phase 1: add `ws` + `@types/ws` devDependencies; fake-gabbo test harness
- [x] Phase 1: tear down clients on unregister/shutdown (reuse plan 06 lifecycle)
- [x] Phase 2: map individual tickles → individual characteristic refreshes
- [ ] Phase 3: relax/disable polling fallback; handle reconnect + zone sequences
- [x] Add/update tests (client unit + integration push-updates-HAP)
- [ ] Update `config.schema.json` if a push/fallback config field is added

## Verification

- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm test`
- [ ] `npm run watch` — with a real speaker: change volume/source from the Bose
      app and confirm HomeKit reflects it near-instantly (faster than the poll
      interval); pull the speaker's power and confirm the client reconnects
      cleanly when it returns.

## PR / release notes

- **PR title (per phase):** e.g. `feat: add gabbo WebSocket client for push updates`
- **Targets:** `dev`
