---
feature: Integration test harness for end-to-end plugin coverage
status: planned
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

- [ ] Rewrite `jest.config.ts` to use a `projects` array:
  - **unit** project: `testMatch: ['**/__tests__/?(*.)+(spec|test).[tj]s?(x)']`, `collectCoverage: true`, inherit current settings
  - **integration** project: `testMatch: ['**/__integration__/?(*.)+(spec|test).[tj]s?(x)']`, `testTimeout: 15000`, `collectCoverage: false`
  - Both inherit `transform`, `moduleNameMapper`, `transformIgnorePatterns`, `testEnvironment: 'node'`
- [ ] Add `"test:unit"` and `"test:integration"` script aliases in `package.json`
- [ ] Verify `npm test` still runs both projects

### 2. Fake SoundTouch HTTP server

- [ ] Create `src/__integration__/helpers/fake-soundtouch-server.ts`
  - `class FakeSoundTouchServer` with `responses: Map<string, string>` (endpoint path → XML string)
  - `start(): Promise<number>` — binds to a random free port, returns it
  - `stop(): Promise<void>` — closes the server
  - `setResponse(endpoint: string, xml: string)` — register/override a canned response
  - `static defaultResponses()` — pre-populates `/info`, `/nowPlaying`, `/volume` with minimal valid XML so tests only override what they care about; base XML on the shapes already in the unit test files under `src/devices/SoundTouch/api/__tests__/`

### 3. In-process Homebridge stub

- [ ] Create `src/__integration__/helpers/homebridge-stub.ts`
  - Minimal `HomebridgeApiStub` satisfying the `API` interface that `SoundTouchHomebridgePlatform` needs: `hap`, `platformAccessory`, `registerPlatformAccessories`, `unregisterPlatformAccessories`, `on(event, cb)`
  - Wraps Service/Characteristic values from `__mocks__/homebridge.js` rather than reimplementing them
  - Exposes `getCharacteristicValue(serviceType: string, characteristicName: string)` helper for assertions
  - Tracks registered and unregistered accessories for test assertions

### 4. First integration test

- [ ] Create `src/__integration__/platform-lifecycle.integration.test.ts`
  - `describe('SoundTouchHomebridgePlatform')` > `describe('when a device is reachable at a configured IP')`
  - `beforeEach` — start `FakeSoundTouchServer`; set `/info` XML for a device named "Test Speaker"
  - Config: `ExternalPlatformConfig` with explicit `ip: '127.0.0.1'`, `port: <fakePort>` — bypasses mDNS/bonjour
  - Construct `SoundTouchHomebridgePlatform`, fire the stored `didFinishLaunching` callback
  - `afterEach` — `server.stop()`
  - Test cases:
    - `it('registers the accessory with Homebridge')` — `expect(stub.registeredAccessories).toHaveLength(1)`
    - `it('initialises the On characteristic to false when the device is in standby')` — `/nowPlaying` returns standby XML; assert `On` value is `false`
    - `it('initialises the On characteristic to true when the device is playing')` — `/nowPlaying` returns playing XML; assert `On` value is `true`
    - `it('unregisters a stale cached accessory not seen in discovery')` — pre-load a cached accessory with a different UUID; assert `unregisterPlatformAccessories` called for it

## Verification

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test` (all projects pass, no physical speaker required)
- [ ] `npm run test:integration` runs the integration suite in isolation

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `test: add in-process integration test harness with fake SoundTouch HTTP server`
- **Targets:** `dev`
