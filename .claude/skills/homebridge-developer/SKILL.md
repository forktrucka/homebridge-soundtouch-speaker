---
name: homebridge-developer
description: >-
  Conventions and workflows for developing this Homebridge plugin
  (homebridge-soundtouchspeaker). Use when implementing or modifying the
  platform, accessories, characteristics, or device API; writing or running
  Jest tests; building, running, or debugging the plugin locally; or
  troubleshooting issues like accessories not appearing in the Home app,
  cached accessories not updating, config not taking effect, HAP errors in
  setters, or verified-plugin compliance. Also use when adding a new HomeKit
  service or characteristic, handling discovery failures, or any question
  about the platform/accessory lifecycle. Don't rely on memory for architecture
  patterns — consult this skill any time you touch Homebridge-specific code.
---

# Homebridge Plugin Developer

This is a **TypeScript ESM dynamic platform** Homebridge plugin. Follow the
patterns already in `src/` — this skill points to the canonical examples rather
than restating them.

> **Language, build, lint, and test tooling** (including the ESM `.js`-import
> rule) live in the **plugin-coding-conventions** skill. This skill covers only what is
> specific to Homebridge: architecture, HomeKit wiring, and verified-plugin
> compliance.

## Platform & accessory architecture

The platform is the entry point. Canonical implementation: `src/platform.ts`.

- Class implements `DynamicPlatformPlugin`. The constructor wires
  `api.hap.Service` / `api.hap.Characteristic`, builds config via
  `PlatformConfiguration.fromExternalConfiguration`, and registers a
  `didFinishLaunching` handler that calls `discoverDevices()`.
- **Cache restore:** Homebridge calls `configureAccessory()` for every cached
  accessory *before* `didFinishLaunching`. Stash them in the `_accessories`
  map; in `discoverDevices()` reuse an existing accessory when its UUID matches,
  otherwise `new this.api.platformAccessory(name, uuid)` +
  `registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [...])`.
- **UUID** is derived deterministically from the device id:
  `this.api.hap.uuid.generate(device.id)`.
- **Prune stale accessories:** anything in the cache not rediscovered this run
  gets `unregisterPlatformAccessories`. Keep this loop intact when editing
  discovery.
- New accessories store their device on `accessory.context.device` so it
  survives a restart.

## Characteristic pattern

Each HAP characteristic is its own class extending the base
`SoundTouchSpeakerCharacteristic`. Reference: `src/accessories/services/SoundTouchSpeakerOnCharacteristic.ts`.

- Constructor takes `{ service, device, platform, accessory }`, grabs the
  characteristic via `service.getCharacteristic(platform.characteristic.X)`,
  and binds handlers: `.onSet(this.setX.bind(this)).onGet(this.getX.bind(this))`.
- Implement `init()` (called once, usually `await this.refresh()`) and
  `refresh()` (update HAP value only when it differs, via
  `characteristic.updateValue`).
- On device communication failure in a setter, throw a HAP error — do **not**
  swallow it:
  ```ts
  throw new this.platform.api.hap.HapStatusError(
    this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE
  );
  ```
- Expose a static `create(props)` async factory (some characteristics need
  async setup before returning).
- Log through `this.log` (`.debug`, `.success`, `.error`) — the formatted
  logger, not `console`.

## Config flow

User config → typed config in three coordinated places:

1. `src/ExternalPlatformConfig.ts` — the raw shape Homebridge passes in.
2. `src/PlatformConfiguration.ts` — `fromExternalConfiguration(...)` applies
   defaults, merges `global` into per-accessory settings, and drops accessories
   lacking both `ip` and `room`. Tests in
   `src/__tests__/PlatformConfiguration.test.ts` document the exact rules.
3. `config.schema.json` — the Homebridge UI form. **Keep it in sync** whenever
   you add/rename a config field, or the UI and code diverge.

Identifiers live in `src/settings.ts`: `PLATFORM_NAME` is what users put under
`platforms[].platform`; `PLUGIN_NAME` must equal `package.json`'s `name`. Don't
change these casually — they key the accessory cache.

The SoundTouch device HTTP/XML API lives under `src/devices/SoundTouch/api/`;
discovery uses bonjour / multicast-dns.

## Testing Homebridge code

Generic test setup (Jest + `@swc/jest`, colocated `__tests__/`, coverage,
commands, the "typecheck + lint + test before done" gate) is in the
**plugin-coding-conventions** skill. Homebridge-specific testing notes:

- **Manual mock `__mocks__/homebridge.js`** exists because SWC does not inline
  Homebridge's `const enum`s (e.g. `LogLevel`); `moduleNameMapper` maps
  `homebridge` to it. If a test hits an undefined Homebridge enum value, add it
  there.
- Favor testing pure logic (config transforms, device parsing) over HAP wiring,
  matching the existing `PlatformConfiguration` / `ExternalPlatformConfig` tests.

## Running & debugging locally

- `npm run watch` → `build && npm link && nodemon`. Nodemon (`nodemon.json`)
  rebuilds on `src/**/*.ts` changes and runs
  `homebridge -U ./test/hbConfig -D` (`-D` = debug logging).
- The sandbox Homebridge instance reads `test/hbConfig/config.json` — this
  file is gitignored (personal: real device names/IPs, drifts constantly
  during testing) and **will not exist on a fresh checkout or a fresh git
  worktree**. **Always check it exists before debugging anything else** —
  `ls test/hbConfig/config.json`. If missing: `cp
  test/hbConfig/config.example.json test/hbConfig/config.json`. Edit the
  plugin's platform block there to exercise different configs (e.g.
  `discoverAllAccessories`, per-accessory `ip`/`room`, `global.verbose`) —
  your local edits never get committed.
- **This file also carries the HAP bridge identity** (`bridge.username`,
  `bridge.port`, `bridge.pin`), which must match whatever the real, paired
  `test/hbConfig/persist/AccessoryInfo.<MAC>.json` file expects — check
  `persist/` for which MAC actually has a non-empty `pairedClients` before
  writing a fresh `bridge` block, or you'll create a *new*, unpaired identity
  instead of recovering the real one. Getting this wrong (e.g. losing/wiping
  `config.json` without restoring the matching `bridge` block) makes every
  accessory show **"No Response"** in the Home app — it looks like a device
  or network outage but isn't; the giveaway is that the plugin's own device
  polling in the log keeps succeeding while HomeKit shows nothing reachable.
  When recreating, prefer `discoverAllAccessories: false` and an empty
  `accessories: []` first (temporarily disables speaker registration) so
  re-pairing the bridge doesn't also force every already-set-up speaker
  accessory to be re-added and re-assigned to rooms in the Home app — turn
  discovery back on once the bridge itself is confirmed paired.
- Cached accessories persist in `test/hbConfig/accessories/cachedAccessories`
  and `test/hbConfig/persist/`. Delete these to simulate a fresh install when
  debugging cache-restore behavior.
- **Stop the running Homebridge process first, always, before editing or
  deleting `config.json`, `persist/`, or `cachedAccessories`.** A live process
  holds this state in memory and periodically writes it back to disk (on
  accessory changes, HAP events, shutdown) — an edit or delete made while it's
  still running can look like it worked and then get silently overwritten by
  the process's next write, undoing the fix. Confirm nothing is bound to the
  bridge port first: `lsof -i :<bridge.port>` (default `51826`) should return
  nothing before you touch these files, and again after — if a stray process
  from an earlier session is still holding the port, kill it before
  continuing.
- Set `verbose: true` (or `global.verbose`) to raise the formatted logger to
  `DEBUG`; the platform already logs discovery and accessory lifecycle at debug.
- **Discovery not finding devices:** bonjour/multicast-dns mDNS often fails
  across subnets/VLANs or in containers. Fall back to an explicit `ip` (+
  optional `port`, default 8090) accessory config to bypass discovery.

## Homebridge official guidance & verified-plugin compliance

All changes must keep the plugin aligned with the official Homebridge developer
docs and the **verified-plugin requirements** (last updated by Homebridge
2024-11-02). Treat these as hard constraints — the repo currently satisfies
them, so don't regress them.

**Authoritative sources** (check the live pages, don't rely on memory):

- API reference (services, characteristics, valid values):
  https://developers.homebridge.io/#/
- Homebridge core + wiki: https://github.com/homebridge/homebridge
- Verified requirements: https://github.com/homebridge/plugins/wiki/Verified-Plugins
- Plugin Settings GUI / config schema:
  https://github.com/homebridge/homebridge-config-ui-x/wiki/Developers:-Plugin-Settings-GUI

**Requirements and how this repo meets them — keep them true:**

| Requirement | Where it's satisfied / what to preserve |
| --- | --- |
| Must be a **dynamic platform** plugin | `SoundTouchHomebridgePlatform implements DynamicPlatformPlugin` (`src/platform.ts`). Registered in `src/index.ts`. |
| **No duplicate accessories** on restart | Reuse cached accessories by UUID and prune stale ones in `discoverDevices()`. Don't register an accessory whose UUID is already in the cache. |
| **Catch and log own errors** — no unhandled exceptions | Discovery wraps `searchDevices()` in try/catch; per-accessory init is wrapped; setters throw `HapStatusError` (a handled HAP error), never raw throws that crash Homebridge. Mirror this in new code. |
| **Implement the Plugin Settings GUI** | Maintain a valid `config.schema.json`; every config field must appear there. Validate after edits. |
| **Install must not start unless configured**; no system-modifying post-install scripts | Keep `package.json` scripts dev-only. `prepare`/`husky` run for contributors, not end users of the published package — don't add post-install side effects. |
| **Run on all supported LTS Node** (v22, v24) | `engines.node` is `^22.10.0 \|\| ^24.0.0`. Don't use APIs unavailable on these. |
| **Homebridge v1 + v2** support | `engines.homebridge` is `^1.8.0 \|\| ^2.0.0`; `homebridge-lib`/`homebridge` peer-compatible. Avoid v2-only or v1-removed APIs without guarding. |
| **Write files only inside the Homebridge storage dir** | If you ever persist to disk, use `api.user.storagePath()` — never arbitrary paths or the cwd. |
| **No analytics / user tracking** | Don't add telemetry or phone-home calls. |
| **Set AccessoryInformation** with a unique SerialNumber | `SoundTouchSpeakerInformationCharacteristic` sets Manufacturer/Model/SerialNumber (`device.id`, unique)/FirmwareRevision. Keep SerialNumber stable and unique per device. |
| **Stable UUIDs** | Always `api.hap.uuid.generate(<stable unique id>)`; never random or display-name-derived. |
| **Child bridge compatible** | Automatic for dynamic platforms — no code needed. Don't add global/singleton state or fixed ports that would break running in an isolated child-bridge process. |
| **Use real HAP service/characteristic types** | Look up service/characteristic names and allowed values in the developer API reference before inventing or hard-coding values. |

**Before submitting plugin changes**, confirm: dynamic-platform contract intact
· cache reuse + stale pruning intact · new config fields added to
`config.schema.json` · errors caught and logged (no raw throws on the
Homebridge thread) · AccessoryInformation populated with a unique SerialNumber ·
`npm run typecheck && npm run lint && npm test` all green.

## Common issues & quick fixes

**Accessory not appearing in the Home app after changes:**
- Did you restart Homebridge? (`npm run watch` does this automatically on save.)
- Is the UUID stable? If the UUID computation changed, Home sees a new accessory and the old one orphans. Fix UUID derivation first, then delete cached accessories.
- Delete `test/hbConfig/accessories/cachedAccessories` and restart to force re-registration.

**"Accessory disappeared" or stale accessories after config change:**
- The stale-pruning loop in `discoverDevices()` removes accessories whose UUID isn't rediscovered. Check that the device's `id` (used for UUID generation) hasn't changed.
- If you renamed a config field, the `PlatformConfiguration` transform may be dropping the accessor silently — check the `fromExternalConfiguration` logic.

**HAP `SERVICE_COMMUNICATION_FAILURE` in the Home app:**
- A setter threw a `HapStatusError` — expected behavior when the speaker is unreachable. Verify the device IP is reachable and the SoundTouch API is responding on port 8090.
- If it's a new characteristic, check the `onSet`/`onGet` handlers are correctly bound and the error propagation follows the pattern in `SoundTouchSpeakerOnCharacteristic.ts`.

**Discovery not finding a device:**
- mDNS/Bonjour often fails across subnets, VLANs, or inside Docker. Bypass discovery entirely with an explicit `ip` (+ optional `port`, default `8090`) in the accessory config.

**"Accessory belongs to another home" / pairing times out with no logs:**
- HomeKit cloud retains a pairing record for a bridge's MAC (`username`) even after the bridge's local persist files are wiped. The bridge looks unpaired to Homebridge but HomeKit refuses to re-pair.
- **First try:** restart the phone. HomeKit's pairing cache is sometimes stale in memory and a reboot clears it.
- **If that doesn't work:** change the bridge `username` in `test/hbConfig/config.json` to a new locally-administered MAC (first octet with bit 1 set, e.g. `0E:4A:B2:7C:D3:91`), delete the stale persist files (`test/hbConfig/persist/AccessoryInfo.<OLD>.json`, `IdentifierCache.<OLD>.json`, and `test/hbConfig/accessories/cachedAccessories`), then restart Homebridge. The new MAC is invisible to HomeKit's cloud so it pairs as a fresh bridge.
- The bridge's `username` `AA:BB:CC:DD:EE:FF` is the Ethernet broadcast address — avoid it; some HAP implementations behave oddly with it, and it's exactly the kind of default that ends up genuinely paired at some point and then triggers this error later. Prefer a proper locally-administered MAC from the start.
- This can recur — it isn't a one-time fix. If it comes back, repeat the same steps with another fresh MAC.

**Home app "finding device..." hangs indefinitely when adding the bridge:**
- The dev machine has multiple active network interfaces (VPN, Thunderbolt bridges, virtual adapters), and by default Homebridge's HAP/mDNS advertiser binds and broadcasts on all of them. If any of those interfaces are unreachable from the phone (a VPN subnet, a virtual bridge), HomeKit can receive ambiguous or dead-end mDNS records for the same bridge and stall on "finding device" instead of connecting.
- Fix: add `"bind": ["<interface>"]` to the `bridge` block in `test/hbConfig/config.json`, restricting advertisement to the real Wi-Fi/LAN interface only — the one on the same subnet as the SoundTouch speakers. Find it with `ifconfig | grep "inet "` (matching the speakers' subnet) cross-referenced against `networksetup -listallhardwareports` to confirm which device is actually the Wi-Fi port (Wi-Fi is not always the lowest-numbered `en*` interface on a machine with many virtual adapters).

## Related skills

- **plugin-coding-conventions** — TypeScript/ESM rules, lint/format, generic Jest setup,
  logging, and the pre-done checks.
- **soundtouch-api-expert** — the Bose SoundTouch HTTP/XML + WebSocket protocol.
- **plugin-architect** — planning a feature, and the branching/release flow
  (conventional commits, semantic-release `latest`→`dev`→`beta`). For the full
  contribution rules see `CONTRIBUTING.md`.
