---
name: homebridge-developer
description: >-
  Conventions and workflows for developing this Homebridge plugin
  (homebridge-soundtouchspeaker). Use when implementing or modifying the
  platform, accessories, characteristics, or device API; writing or running
  Jest tests; or building, running, and debugging the plugin locally.
---

# Homebridge Plugin Developer

This is a **TypeScript ESM dynamic platform** Homebridge plugin. Follow the
patterns already in `src/` — this skill points to the canonical examples rather
than restating them.

## ESM conventions (do not skip)

- `package.json` has `"type": "module"`; TypeScript emits ESM.
- **Relative imports must include the `.js` extension**, even though the source
  is `.ts`: `import { SoundTouchDevice } from './devices/SoundTouch/SoundTouchDevice.js';`
  Omitting `.js` builds but fails at runtime under Homebridge.
- Import Homebridge types/values from `'homebridge'` (no extension — it's a
  package): `import { API, Service, Characteristic } from 'homebridge';`

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

## Testing & quality

- Runner: **Jest + `@swc/jest`** (no ts-jest). Config: `jest.config.ts`.
- Tests live in `__tests__/` dirs and match `*.test.ts` / `*.spec.ts`.
  `roots` is `<rootDir>/src`, so put tests beside the code they cover.
- `moduleNameMapper` rewrites `^(\.{1,2}/.*)\.js$` → `$1` so the `.js` import
  extensions resolve in tests, and maps `homebridge` to the manual mock.
- **Manual mock `__mocks__/homebridge.js`** exists because SWC does not inline
  Homebridge's `const enum`s (e.g. `LogLevel`). If a test hits an undefined
  Homebridge enum value, add it there.
- Coverage is collected by default (`collectCoverage: true`).
- Favor testing pure logic (config transforms, device parsing) over HAP wiring,
  matching the existing `PlatformConfiguration` / `ExternalPlatformConfig` tests.

Commands:

| Command | Purpose |
| --- | --- |
| `npm test` (`npx jest`) | Run tests with coverage |
| `npx jest <pattern>` | Run a subset |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, `--max-warnings=0`, auto-`--fix` |
| `npm run format` | Prettier write |
| `npm run knip` | Unused files/exports/deps |
| `npm run build` | Clean + `tsc` → `dist/` |

Before considering a change done, run typecheck, lint, and tests.

## Running & debugging locally

- `npm run watch` → `build && npm link && nodemon`. Nodemon (`nodemon.json`)
  rebuilds on `src/**/*.ts` changes and runs
  `homebridge -U ./test/hbConfig -D` (`-D` = debug logging).
- The sandbox Homebridge instance reads `test/hbConfig/config.json`. Edit the
  plugin's platform block there to exercise different configs (e.g.
  `discoverAllAccessories`, per-accessory `ip`/`room`, `global.verbose`).
- Cached accessories persist in `test/hbConfig/accessories/cachedAccessories`
  and `test/hbConfig/persist/`. Delete these to simulate a fresh install when
  debugging cache-restore behavior.
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

## What this skill does NOT cover

Release, versioning, and contribution flow (conventional commits,
semantic-release `latest`→`dev`→`beta`, README-vs-CONTRIBUTING rules) are out of
scope — see `CONTRIBUTING.md` and the project memory notes.
