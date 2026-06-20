---
feature: Polling lifecycle — stop polling on accessory removal/shutdown and make it configurable
status: planned # planned | in-progress | done | cancelled
date: 2026-06-20
branch: fix/polling-lifecycle
commit-type: fix
---

# Polling lifecycle — stoppable, configurable device polling

## Context

Surfaced while building the integration test harness (plan 05): the device
polling loop can never be stopped, and it can't be turned off via config.

- `SoundTouchSpeakerPlatformAccessory.init()` starts a 2 s polling loop
  (`_refreshDeviceServices`) whenever `device.configuration.pollingInterval`
  is defined — which it **always** is (`DeviceConfiguration` defaults it to
  `2000`, and `PlatformConfiguration.fromExternalConfiguration` also hardcodes
  the platform-level value).
- `stopPolling()` exists on the accessory wrapper, but
  `SoundTouchHomebridgePlatform.discoverDevices` **discards the wrapper** after
  `create()` — it only retains the HAP `PlatformAccessory` in `_accessories`.
  Nothing holds a reference that can call `stopPolling()`.

Consequences in production:
1. **Leak on removal:** when a cached accessory is no longer discovered, the
   platform calls `unregisterPlatformAccessories` but the orphaned wrapper's
   polling loop keeps firing `getSource()` against the gone device forever.
2. **No clean shutdown:** Homebridge restart/shutdown leaves the loop running
   until the process dies.
3. **Not configurable:** there is no way to slow or disable polling; the
   interval is effectively fixed at 2 s per accessory.

The harness only *worked around* this with `jest.useFakeTimers()` to park the
loop. This plan fixes the underlying lifecycle in production code.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-20 | Finding: the platform discards the `SoundTouchSpeakerPlatformAccessory` wrapper returned by `create()` (`platform.ts:114-130`); only the HAP `PlatformAccessory` is kept in `_accessories` | `stopPolling()` is unreachable, so polling never stops | — |
| 2026-06-20 | Finding: `pollingInterval` is always defined — `DeviceConfiguration` defaults it to `2000` and there is no config path that yields `undefined` | `init()`'s `pollingInterval !== undefined` guard is always true, so polling is unconditional | — |
| 2026-06-20 | Finding: `PlatformConfiguration.fromExternalConfiguration` hardcodes `pollingInterval` **and** `verbose`, ignoring `props.global?.pollingInterval`/`verbose` (`PlatformConfiguration.ts:41-42`) | Global config for these two fields is silently dropped — a related config-threading bug worth fixing in the same pass | — |
| 2026-06-20 | Decision: retain wrappers in a `Map<uuid, SoundTouchSpeakerPlatformAccessory>` on the platform and call `stopPolling()` on unregister and on Homebridge `shutdown` | Smallest change that makes the loop stoppable; mirrors the existing `_accessories` map | Passing an `AbortSignal` into the accessory (larger refactor); a global polling scheduler (over-engineered for the device count) |
| 2026-06-20 | Decision: treat `pollingInterval <= 0` as "disable polling" | Gives users an off switch without a new boolean field | A separate `polling: boolean` field (more schema surface for the same effect) |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

- `src/platform.ts` — keep the `SoundTouchSpeakerPlatformAccessory` wrappers in a
  `Map<uuid, …>`; call `stopPolling()` in the stale-accessory unregister branch;
  register an `api.on('shutdown', …)` handler that stops all wrappers.
- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — only start the polling
  loop when `pollingInterval > 0`; ensure `stopPolling()` is idempotent.
- `src/PlatformConfiguration.ts` — thread `global.pollingInterval` and
  `global.verbose` through instead of hardcoding the defaults.
- `src/devices/SoundTouch/SoundTouchDeviceConfiguration.ts` — allow a `0`/disabled
  interval to pass through rather than being coerced to the 2 s default.

## Conventions for this change

- **Commit type:** `fix:` → patch release.
- **Config schema touched:** `pollingInterval` already exists in config; document
  that `0` disables polling in `config.schema.json` description (no new field).
- **Tests to add/update:**
  - `src/__tests__/PlatformConfiguration.test.ts` — global `pollingInterval`/
    `verbose` now honoured; `0` preserved.
  - `src/__integration__/platform-lifecycle.integration.test.ts` — extend: a
    stale-accessory unregister stops its polling; `shutdown` stops all. (This can
    drop the fake-timer workaround for the stop path.)
- Follow **coding-conventions** and the platform/accessory patterns in
  **homebridge-developer**.
- **Target branch:** `dev`.

## Implementation checklist

- [ ] Platform: retain wrappers in a `Map<uuid, SoundTouchSpeakerPlatformAccessory>`
- [ ] Platform: call `stopPolling()` when unregistering a stale cached accessory
- [ ] Platform: add an `api.on('shutdown', …)` handler that stops all wrappers
- [ ] Accessory: start polling only when `pollingInterval > 0`; make `stopPolling()` idempotent
- [ ] Config: thread `global.pollingInterval` and `global.verbose` through `PlatformConfiguration`
- [ ] Config: let `pollingInterval: 0` survive as "disabled" through `DeviceConfiguration`
- [ ] Add/update tests (config + integration lifecycle)
- [ ] Update `config.schema.json` description noting `0` disables polling

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run watch` — confirm a removed accessory stops polling (no further
      requests in logs) and a restart shuts the loop down cleanly

## PR / release notes

- **PR title:** `fix: stop device polling on accessory removal/shutdown and honour polling config`
- **Targets:** `dev`
