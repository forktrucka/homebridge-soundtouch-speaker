---
feature: Gabbo WebSocket reconnect backoff and dead-connection detection
status: in-progress
date: 2026-07-10
branch: fix/gabbo-resilience
commit-type: fix
---

# Gabbo WebSocket reconnect backoff and dead-connection detection

## Context

`src/devices/SoundTouch/api/GabboClient.ts` (native Node WebSocket, `gabbo`
subprotocol, default port 8080) has two robustness flaws:

1. **Fixed reconnect forever** — `RECONNECT_DELAY_MS = 5000` (:36) with no
   backoff or cap (`scheduleReconnect`, :127-133). An offline speaker is
   retried every 5 s indefinitely.
2. **No dead-connection detection** — `startPing` (:119-125) sends an empty
   frame every 30 s (`PING_INTERVAL_MS`) but nothing tracks whether the peer
   is alive. A half-open socket stays `readyState === OPEN`, so
   `isConnected` stays true. This is worse than it looks: the 5-minute
   reconciliation poll in `SoundTouchSpeakerPlatformAccessory.ts:95-98`
   **skips `refresh()` whenever gabbo reports connected**, so a half-open
   socket silently freezes all state updates for that speaker.

Current structure (verified 2026-07-10): `connect()` (:64-67) sets
`shouldReconnect` and calls `openSocket()`; `openSocket` (:76-100) creates a
fresh `WebSocket` per attempt with `open`/`message`/`close`/`error` listeners;
`close` (:89-95) runs `cleanup()` (clears both timers, :135-144), emits
`disconnected`, and schedules reconnect; `error` (:97-99) only re-emits.
Listeners attach per-socket so they don't accumulate. A permanent no-op
`error` listener on the EventEmitter (:53) prevents crash-on-unhandled.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-07-10 | Exponential backoff: start 5 s, double per failed attempt, cap 5 min, reset to 5 s on successful `open` | Stops hammering offline speakers; 5 min cap keeps recovery reasonably fast | Fixed longer delay (slow recovery after brief outages); jitter (single client per speaker, unnecessary) |
| 2026-07-10 | Liveness via `lastActivityAt` timestamp updated on every incoming `message`; in the ping interval, if `now - lastActivityAt > 2 × PING_INTERVAL_MS`, call `socket.close()` to force the normal close→reconnect path | Speakers push frequent notifications; native WebSocket API exposes no pong event, so app-level activity tracking is the available signal. Reuses existing close-path cleanup instead of a parallel teardown path | Raw `ws`-library ping/pong (would add a runtime dep — `ws` is devDep-only per the websocket-push plan); counting sent pings (no ack to observe) |
| 2026-07-10 | `Date.now()` must be injectable or the tests must use jest fake timers | Existing `GabboClient.test.ts` and `fake-gabbo-server.ts` integration harness exist; fake timers are the established pattern — check how `GabboClient.test.ts` currently handles the ping interval before choosing | — |
| 2026-07-10 | `attempt` counter lives on the class, reset in the `open` listener | Simplest state that survives across `openSocket()` calls | — |
| 2026-07-10 | **Reversed:** the `error` handler now also routes through the same disconnect/reconnect teardown as `close`, guarded by a per-socket `handledDisconnect` flag so both firing together can't double-schedule | Verified against the real Node global `WebSocket` (not just the fake-gabbo harness): a pre-open failure (connection refused, handshake rejected) fires only `error`, never `close`; a post-open drop fires only `close`, never `error`. The original assumption ("error is always followed by close") was wrong — without this fix, an offline speaker at `connect()` time would fire one `error` and then never reconnect, since only `close` scheduled reconnects | Leaving `error` as re-emit-only (would silently break reconnect-from-offline, the primary case this plan exists to fix) |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

- `src/devices/SoundTouch/api/GabboClient.ts` — backoff state + cap in
  `scheduleReconnect`; reset in the `open` listener; `lastActivityAt` update
  in the `message` listener; staleness check inside the `startPing` interval.
  New constants alongside :36-38: `RECONNECT_MAX_DELAY_MS = 300_000`,
  `STALE_CONNECTION_MS = 2 * PING_INTERVAL_MS`.
- `src/devices/SoundTouch/api/__tests__/GabboClient.test.ts` — backoff
  growth/cap/reset, stale-socket forced close.
- `src/__integration__/gabbo-notifications.integration.test.ts` +
  `src/__integration__/helpers/fake-gabbo-server.ts` — end-to-end: server
  goes silent → client detects staleness, closes, reconnects.

## Conventions for this change

- **Commit type:** `fix:` → patch release
- **Config schema touched:** no
- **Tests to add/update:** `src/devices/SoundTouch/api/__tests__/GabboClient.test.ts`, `src/__integration__/gabbo-notifications.integration.test.ts`
- **Target branch:** `dev` (squash-merged; PR title is the released commit message).

## Implementation checklist

- [x] Read `coding-conventions` skill before editing
- [x] Add backoff: `reconnectAttempts` field; delay =
      `min(RECONNECT_DELAY_MS * 2 ** attempts, RECONNECT_MAX_DELAY_MS)`;
      increment when scheduling, reset to 0 in the `open` listener
- [x] Add `lastActivityAt` updated in the `message` listener; initialize in
      the `open` listener
- [x] In the ping interval: if connected and
      `Date.now() - lastActivityAt > STALE_CONNECTION_MS`, log/emit and
      `this.socket?.close()` (close listener handles cleanup + reconnect)
- [x] Also route `error` through the same disconnect/reconnect teardown as
      `close` (see Decisions & findings — `error` and `close` are not
      reliably paired on Node's global `WebSocket`)
- [x] Unit tests with fake timers: delays grow 5s→10s→20s…→cap at 300s;
      reset after successful open; silent socket closed after 60 s
- [x] Integration test: fake-gabbo server stops responding → client
      reconnects; verify no timer leaks (cleanup on `disconnect()`)
- [x] `npm run typecheck && npm run lint && npm test`

## Verification

- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm test`
- [ ] `npm run watch` — power-cycle a real speaker: reconnect delays grow in
      the debug log, then reset after it comes back; pull ethernet/wifi to
      test half-open detection (state resumes within ~2 poll cycles)
      (not run — no physical speaker available in this session; noted in the
      PR description as skipped)

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `fix: add reconnect backoff and dead-connection detection to GabboClient`
- **Targets:** `dev`
