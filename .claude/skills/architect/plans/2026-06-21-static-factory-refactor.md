---
feature: Enforce static factory convention — private constructors across all project classes
status: planned
date: 2026-06-21
branch: refactor/static-factory-enforcement
commit-type: refactor
---

# Enforce static factory convention — private constructors across all project classes

## Context

The coding-conventions skill (PR #102) documents that all project classes should
expose creation through named static factory methods and keep constructors
`private`. The pattern is already well-established: `PlatformConfiguration`,
`DeviceConfiguration`, `SoundTouchDevice`, `Logger`, `DeviceLogger`, and
`SoundTouchSpeakerPlatformAccessory` all have factories.

However, two gaps remain:

1. **All existing factories leave constructors `public`** — nothing prevents
   `new ClassName(...)` at external call sites. The convention is only advisory
   until constructors are made `private`.
2. **`API` (the SoundTouch HTTP client) has no factory at all** — it is
   instantiated directly with `new API(host, port)` in `api-discovery.ts` and
   (via `fromConfiguredAccessory`) in `SoundTouchDevice`.

This plan makes the convention structural: a `private` constructor means the
compiler enforces it.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-21 | `refactor:` commit type — no release | All changes are internal; no user-visible API or behaviour changes. | `fix:` (not a bug fix) |
| 2026-06-21 | `API` factory: `static create(host, port?, axiosInstance?)` | The third `axiosInstance` arg is used in tests for axios injection — it must survive the refactor. Naming `create` is consistent with `DeviceConfiguration.create()`. Alternatively `forHost()` is a fit, but loses the test-injection escape hatch without an overload. | `static forHost()` without axios param (breaks test injection); two separate overloads (unnecessary complexity) |
| 2026-06-21 | Make constructors `private` on all classes with existing factories | Compile-time enforcement of the convention. The `protected` exception applies only to `SoundTouchSpeakerCharacteristic` (abstract base — subclasses call `super()`). | `protected` on all (too permissive — allows external subclassing); leave `public` (advisory only) |
| 2026-06-21 | `XMLElement` constructor stays `private` — it is already only used inside its own methods | Audit confirmed all three `new XMLElement(...)` calls are inside `XMLElement` itself. No change needed beyond confirming it. | — |
| 2026-06-21 | Tests that use `new ClassName(...)` directly must be updated to use the factory | Making constructors `private` will be a compile error in tests. The fix is straightforward — replace `new Foo(...)` with `Foo.create(...)` or the appropriate named factory. No test logic changes, only creation calls. | Keep test constructors public via `@internal` tag (TS doesn't enforce this; doesn't actually help) |
| 2026-06-21 | `SoundTouchSpeakerCharacteristic` abstract base keeps `protected` constructor | It's an abstract class; subclasses call `super()`. Making it `private` would prevent subclassing. | `private` (compile error in subclass constructors) |
| 2026-06-21 | Do this as a single squash-merged PR | All changes are mechanical; no logic changes. Splitting by file/class would produce multiple small PRs with no independent value. | Per-class PRs (unnecessary overhead) |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

### `src/devices/SoundTouch/api/api.ts`

Add static factory; make constructor `private`:

```ts
static create(
  host: string,
  port: number = 8090,
  axiosInstance?: AxiosInstance
): API {
  return new API(host, port, axiosInstance);
}

private constructor(
  host: string,
  port: number = 8090,
  axiosInstance?: AxiosInstance
) { … }
```

### `src/devices/SoundTouch/api/api-discovery.ts`

Update the `_APIFromService` helper to use the factory:

```ts
// Before:
return new API(ipAddress, service.port);
// After:
return API.create(ipAddress, service.port);
```

### Classes needing constructor visibility change only (factories already exist)

For each class below: change `constructor(…)` → `private constructor(…)`.
No other changes.

| Class | File |
| --- | --- |
| `PlatformConfiguration` | `src/PlatformConfiguration.ts` |
| `DeviceConfiguration` | `src/devices/SoundTouch/SoundTouchDeviceConfiguration.ts` |
| `SoundTouchDevice` | `src/devices/SoundTouch/SoundTouchDevice.ts` |
| `Logger` | `src/utils/FormattedLogger.ts` |
| `DeviceLogger` | `src/utils/FormattedLogger.ts` |
| `APIErrors` | `src/devices/SoundTouch/api/error.ts` |
| `SoundTouchSpeakerPlatformAccessory` | `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` |
| `SoundTouchSpeakerOnCharacteristic` | `src/accessories/services/SoundTouchSpeakerOnCharacteristic.ts` |
| `SoundTouchSpeakerBrightnessCharacteristic` | `src/accessories/services/SoundTouchSpeakerBrightnessCharacteristic.ts` |
| `SoundTouchSpeakerInformationCharacteristic` | `src/accessories/services/SoundTouchSpeakerInformationCharacteristic.ts` |

### Tests needing factory calls instead of `new`

- `src/accessories/__tests__/SoundTouchSpeakerPlatformAccessory.test.ts:15` —
  replace `new SoundTouchSpeakerPlatformAccessory(…)` with the appropriate factory.
- `src/accessories/services/__tests__/SoundTouchSpeakerBrightnessCharacteristic.test.ts:59` —
  replace `new SoundTouchSpeakerBrightnessCharacteristic(…)` with `.create(…)`.
- `src/devices/SoundTouch/api/__tests__/api.test.ts` (lines 18, 35) —
  replace `new API(…)` with `API.create(…)`.

## Conventions for this change

- **Commit type:** `refactor:` → no release.
- **Config schema touched:** no.
- **Tests to add/update:** existing tests updated (factory call sites only, no new assertions needed).
- **Target branch:** `dev` (squash-merged; PR title is the released commit message).
- **Gate:** `npm run typecheck && npm run lint && npm test` — if typecheck passes
  with private constructors, the enforcement is working.

## Implementation checklist

- [ ] Add `static create()` to `API` and make its constructor `private`
- [ ] Update `api-discovery.ts` — `_APIFromService` uses `API.create()`
- [ ] Make constructors `private` on `PlatformConfiguration`
- [ ] Make constructors `private` on `DeviceConfiguration`
- [ ] Make constructors `private` on `SoundTouchDevice`
- [ ] Make constructors `private` on `Logger` and `DeviceLogger`
- [ ] Make constructors `private` on `APIErrors`
- [ ] Make constructors `private` on `SoundTouchSpeakerPlatformAccessory`
- [ ] Make constructors `private` on `SoundTouchSpeakerOnCharacteristic`
- [ ] Make constructors `private` on `SoundTouchSpeakerBrightnessCharacteristic`
- [ ] Make constructors `private` on `SoundTouchSpeakerInformationCharacteristic`
- [ ] Update `SoundTouchSpeakerPlatformAccessory.test.ts` — use factory
- [ ] Update `SoundTouchSpeakerBrightnessCharacteristic.test.ts` — use factory
- [ ] Update `api.test.ts` — use `API.create()`
- [ ] `npm run typecheck && npm run lint && npm test`
- [ ] `npm run knip` — confirm no unused exports

## Verification

- [ ] `npm run typecheck` passes — confirms private constructors are enforced at
      compile time and no call sites use `new` illegally
- [ ] `npm run lint`
- [ ] `npm test`

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `refactor: enforce private constructors and add API.create() factory`
- **Targets:** `dev`
