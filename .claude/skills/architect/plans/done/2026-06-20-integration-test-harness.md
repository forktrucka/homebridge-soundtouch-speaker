---
feature: Integration test harness for end-to-end plugin coverage
status: done
date: 2026-06-20
branch: test/integration-harness
commit-type: test
---

# Integration test harness

## Context

The repo has solid unit tests covering the SoundTouch API parsing layer and config
transforms, but nothing that exercises the full plugin stack — Homebridge platform
bootstrap → device construction → HAP characteristic wiring. This harness adds an
in-process integration test layer that serves real XML from a lightweight Node HTTP
server and asserts on HAP characteristic values, without requiring a physical
speaker or a running Homebridge daemon.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-20 | Run a real `http.createServer` test double, not axios-mock-adapter | `SoundTouchDevice.fromConfiguredAccessory` constructs `new API(ip, port)` with no injected axios instance — a real local HTTP server is the only clean seam | axios-mock-adapter (no injection point at the device-construction layer); msw node adapter (extra dep, same result) |
| 2026-06-20 | Construct the platform in-process, not as a child process | Avoids HAP pairing complexity; `__mocks__/homebridge.js` already provides workable Service/Characteristic stubs; characteristic values can be read directly | Child process + `hap-nodejs` HAPClient (pairing overhead, brittle timing); child process + HAP HTTP polling (same issues, slower) |
| 2026-06-20 | Separate Jest project entry for integration tests | Keeps timeout, coverage, and testMatch independent; integration suite can be excluded from the fast unit-test run via `--selectProjects` | Separate `jest.integration.config.ts` (extra entry point to maintain); mixing integration and unit tests in the same project (different timeout needs) |
| 2026-06-20 | Test files under `src/__integration__/` | Stays inside `roots: ['<rootDir>/src']` so no Jest config changes needed for discovery; clearly distinct from `__tests__/` unit directories | Top-level `test/integration/` dir (outside `roots`, needs config changes); `src/__tests__/` (name clash with unit tests) |
| 2026-06-20 | No new npm deps required | Node built-ins `http` + `net` cover the fake server; `__mocks__/homebridge.js` is the homebridge mock; `@jest/globals` already installed | `nock` (global axios intercept, conflicts with unit tests); `msw` (extra dep) |
| 2026-06-20 | `commit-type: test` — no release triggered | Pure test infrastructure; semantic-release maps `test:` to no version bump | `chore:` (same effect but less precise) |
| 2026-06-20 | **Finding (impl):** `__mocks__/homebridge.js` only exports `LogLevel` — it does **not** provide Service/Characteristic stubs as the planning row assumed | The stub had to supply its own `hap` (Service/Characteristic identifiers, `uuid.generate`, `HapStatusError`/`HAPStatus`) plus a `platformAccessory` class, and pre-create an `AccessoryInformation` service so `SoundTouchSpeakerInformationCharacteristic.init` finds it | Extending `__mocks__/homebridge.js` (would couple unit-test mock to integration needs) |
| 2026-06-20 | **Finding (impl):** polling is hardcoded on — `PlatformConfiguration.fromExternalConfiguration` always sets `pollingInterval: 2000`, so `accessory.init()` always starts the polling loop and the platform never keeps a reference to stop it | Test uses `jest.useFakeTimers({ doNotFake: ['nextTick','setImmediate','queueMicrotask'] })` so the 2s polling timer parks without firing while real HTTP I/O still works; `jest.useRealTimers()` in `afterEach`. Verified no open handles via `--detectOpenHandles` | Real timers + `server.stop()` (leaks a handle, Jest warns); exposing accessories to call `stopPolling()` (larger platform change, out of scope) |
| 2026-06-20 | **Finding (impl):** Jest `projects` mode collects coverage globally — per-project `collectCoverage: false` is not honoured | Used root-level `coveragePathIgnorePatterns: ['<rootDir>/src/__integration__/']` to exclude the harness scaffolding from the report instead; integration tests still contribute production-code coverage (a bonus) | Per-project `collectCoverage` (silently ignored by Jest) |
| 2026-06-20 | **Finding (impl):** `deviceIsOn` → `getSource()` reads the `source` attribute of `/nowPlaying` (not a separate `/sources` call) | Fake server only needs `<nowPlaying source="STANDBY|SPOTIFY">` to drive the On characteristic; `STANDBY` ⇒ off, anything else ⇒ on (matches `SoundTouchDevice.deviceIsOn`) | — |
| 2026-06-20 | **Calibration:** estimated **Medium**, actual ~**Medium–Heavy** | The HTTP fake server was trivial as predicted, but the two unforeseen findings above (HAP stub from scratch + polling-timer neutralisation) pushed it toward the heavy end. Recorded in `ROADMAP.md` calibration table | — |
| 2026-06-20 | **Review (#58):** added a `coverageThreshold.global` guard to `jest.config.ts` | Maintainer asked to enforce coverage in pipeline + local. `coverageThreshold` fails `npm test` (and CI, which runs the tests) on regression — no extra dep or CI step. Floors set just under current (stmts/funcs/lines 80, branches 70) to guard without breaking the build; ratchet up over time | Codecov/coveralls (external service + token); a separate CI coverage step (duplicates what `npm test` already produces) |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

- `jest.config.ts` — add `projects` array splitting unit and integration suites
- `src/__integration__/helpers/fake-soundtouch-server.ts` — Node `http.createServer` serving configurable SoundTouch XML per endpoint
- `src/__integration__/helpers/homebridge-stub.ts` — in-process Homebridge API/HAP stub with assertion helpers
- `src/__integration__/platform-lifecycle.integration.test.ts` — first integration test: platform bootstrap → device discovery → HAP characteristic assertions
- `package.json` — add `"test:unit"` and `"test:integration"` script aliases

## Conventions for this change

- **Commit type:** `test:` → no release
- **Config schema touched:** no
- **Tests to add:** `src/__integration__/**/*.integration.test.ts`
- **Target branch:** `dev` (squash-merged; PR title is the released commit message)
- Follow **coding-conventions** skill: ESM `.js` extensions on all relative imports, `@swc/jest` transform, BDD `describe`/`it` structure, no `console.*`.

## Implementation checklist

### 1. Jest projects split

- [x] Rewrite `jest.config.ts` to use a `projects` array:
  - **unit** project: `testMatch: ['**/__tests__/?(*.)+(spec|test).[tj]s?(x)']`, inherits common settings
  - **integration** project: `testMatch: ['**/__integration__/?(*.)+(spec|test).[tj]s?(x)']`, `testTimeout: 15000`
  - Both inherit `transform`, `moduleNameMapper`, `transformIgnorePatterns`, `testEnvironment: 'node'`, `roots`
  - Coverage kept global (Jest ignores per-project `collectCoverage`); `__integration__/` excluded via `coveragePathIgnorePatterns`
- [x] Add `"test:unit"` and `"test:integration"` script aliases in `package.json` (`jest --selectProjects <name>`)
- [x] Verify `npm test` still runs both projects (25 suites / 187 tests pass)

### 2. Fake SoundTouch HTTP server

- [x] Create `src/__integration__/helpers/fake-soundtouch-server.ts`
  - `class FakeSoundTouchServer` with `responses: Map<string, string>` (endpoint path → XML string)
  - `start(): Promise<number>` — binds to a random free port on `127.0.0.1`, returns it
  - `stop(): Promise<void>` — `closeAllConnections()` + `close()`
  - `setResponse(endpoint: string, xml: string)` — register/override a canned response (path normalised)
  - `static defaultResponses()` — pre-populates `/info`, `/nowPlaying`, `/volume`; exported `infoXml`/`nowPlayingXml`/`volumeXml` builders mirror the raw-XML envelopes asserted in `api/__tests__/api.test.ts`

### 3. In-process Homebridge stub

- [x] Create `src/__integration__/helpers/homebridge-stub.ts`
  - `HomebridgeApiStub` satisfying the `API` slice `SoundTouchHomebridgePlatform` needs: `hap`, `platformAccessory`, `registerPlatformAccessories`, `unregisterPlatformAccessories`, `on(event, cb)`, plus `logger`/`emitDidFinishLaunching`/`asHomebridgeApi` test helpers
  - **Implements** Service/Characteristic stubs itself (the manual mock only exports `LogLevel` — see findings), exposing `StubPlatformAccessory`
  - Exposes `getCharacteristicValue(serviceType, characteristicName)` helper for assertions
  - Tracks registered and unregistered accessories for test assertions

### 4. First integration test

- [x] Create `src/__integration__/platform-lifecycle.integration.test.ts`
  - `describe('SoundTouchHomebridgePlatform')` > `describe('when a device is reachable at a configured IP')`
  - `beforeEach` — start `FakeSoundTouchServer`; set `/info` XML for a device named "Test Speaker"; enable fake timers (parks polling)
  - Config: `ExternalPlatformConfig` with explicit `ip: '127.0.0.1'`, `port: <fakePort>` — bypasses mDNS/bonjour
  - Construct `SoundTouchHomebridgePlatform`, fire the stored `didFinishLaunching` via `api.emitDidFinishLaunching()`
  - `afterEach` — `jest.useRealTimers()` then `server.stop()`
  - Test cases (all 4 passing):
    - `it('registers the accessory with Homebridge')` — `expect(api.registeredAccessories).toHaveLength(1)`
    - `it('initialises the On characteristic to false when the device is in standby')` — `/nowPlaying` source `STANDBY`; `On` is `false`
    - `it('initialises the On characteristic to true when the device is playing')` — `/nowPlaying` source `SPOTIFY`; `On` is `true`
    - `it('unregisters a stale cached accessory not seen in discovery')` — pre-load a cached accessory with a different UUID; assert it lands in `unregisteredAccessories`

## Verification

- [x] `npm run typecheck`
- [x] `npm run lint`
- [x] `npm test` (25 suites / 187 tests pass across both projects, no physical speaker required)
- [x] `npm run test:integration` runs the integration suite in isolation (4 tests, no open handles per `--detectOpenHandles`)

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `test: add in-process integration test harness with fake SoundTouch HTTP server`
- **Targets:** `dev`
