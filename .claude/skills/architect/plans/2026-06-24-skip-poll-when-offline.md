---
feature: Skip reconciliation poll when speaker is offline
status: planned
date: 2026-06-24
branch: fix/skip-polling-when-offline
commit-type: fix
---

# Skip reconciliation poll when speaker is offline

## Context

The 5-minute reconciliation loop in `SoundTouchSpeakerPlatformAccessory` calls
every characteristic's `refresh()` when a device is unreachable (offline,
rebooting, or on a different subnet). Each refresh makes an HTTP request that
times out after 10 seconds, producing a `PollingRefreshFailed` warning per
characteristic per cycle. On a two-characteristic accessory that is one warning
every 5 minutes; on a fully-featured accessory it is several. Collectively this
makes the Homebridge log noisy and wastes network resources.

The fix: check `device.gabbo.isConnected` before calling `refresh()`. Gabbo
auto-reconnects every 5 seconds, so when the device comes back online the next
5-minute cycle will proceed without any manual intervention.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-24 | Use `device.gabbo.isConnected` as the reachability probe | It is a free boolean property check (no I/O). Gabbo auto-reconnects every 5 s (`RECONNECT_DELAY_MS = 5000`) so resumed connectivity is detected quickly. Both Gabbo and the HTTP API target the same device on the same network — if the socket is open the HTTP API is almost certainly reachable. | HTTP HEAD to `/info`: adds I/O and a dependency on axios timeout (~10 s worst-case) before we even start the real poll. TCP socket probe: requires `net` module and custom timeout logic. `device.api.getInfo()`: full XML parse, heavier than needed. |
| 2026-06-24 | Log at `debug`, not `warn`, when skipping | The device being temporarily offline is expected (power cycle, firmware update). A `warn` every 5 minutes for a device that is simply off would be noisy. `debug` is visible when `verbose: true` and invisible otherwise. | `warn`: too noisy for a normal power-off scenario. No log: harder to diagnose why refreshes aren't happening. |

## If cancelled

> Only fill this in when `status: cancelled`.

## Affected areas

- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — add `isConnected`
  guard in `_refreshDeviceServices()` before calling `this.refresh()`
- `src/accessories/__tests__/SoundTouchSpeakerPlatformAccessory.test.ts` — add
  tests: skips refresh when Gabbo disconnected; resumes when reconnected

## Conventions for this change

- **Commit type:** `fix:` → patch release
- **Config schema touched:** no
- **Tests to add/update:** `src/accessories/__tests__/SoundTouchSpeakerPlatformAccessory.test.ts`
- **Target branch:** `dev` (squash-merged; PR title is the released commit message)

## Implementation checklist

- [ ] In `_refreshDeviceServices()`, add `if (!this.device.gabbo.isConnected) { this.log.debug('[${this.accessory.displayName}] Offline — skipping reconciliation poll'); continue; }` before the `try`/`refresh()` block
- [ ] Add test: when `gabbo.isConnected` is `false`, `refresh()` is not called
- [ ] Add test: when `gabbo.isConnected` is `true`, `refresh()` is called as normal
- [ ] Run `npm run typecheck && npm run lint && npm test`

## Verification

- [ ] `npm run typecheck && npm run lint && npm test`
- [ ] `npm run watch` — take a speaker offline mid-session; confirm no `PollingRefreshFailed` warnings; bring it back and confirm refreshes resume

## PR / release notes

- **PR title:** `fix: skip reconciliation poll when speaker is offline`
- **Targets:** `dev`
