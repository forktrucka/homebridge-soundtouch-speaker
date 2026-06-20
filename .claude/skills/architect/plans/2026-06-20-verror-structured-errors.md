---
feature: Replace bare Error with VError for structured, chained errors
status: planned
date: 2026-06-20
branch: refactor/verror-structured-errors
commit-type: refactor
---

# Replace bare Error with VError for structured, chained errors

## Context

Error messages today lose context as they propagate up the stack. A polling
failure logs `'Polling refresh failed' <Error: ...>` with no trace of which
device was involved or what the underlying API call was. A discovery failure
logs the raw axios error with no device-name context. When errors cross
boundaries (API → device → accessory → platform), each catch site re-logs
without chaining — making it hard to correlate a user-visible failure back
to its root cause.

[`verror`](https://github.com/oven-sh/verror) (Joyent/Node.js community
standard) adds three primitives we need:

- **Cause chaining** — `new VError(cause, 'doing X for device %s', name)`
  preserves the original error and its stack as `.cause`.
- **Structured info** — `new VError({ cause, info: { deviceId, ip } }, '…')`
  attaches arbitrary metadata retrievable via `VError.info(err)`.
- **Full stack** — `VError.fullStack(err)` emits the complete causal chain in
  one string, making logs immediately actionable.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-20 | Use `refactor:` commit type — no release | Error structure is internal; no user-facing API or behaviour changes | `fix:` (not a bug fix, no observable behaviour change for users) |
| 2026-06-20 | Keep `APIErrors extends Error` as-is | It carries structured SoundTouch API payload (`errors: APIError[]`, `deviceId`) that has no VError analogue. Wrap it at catch sites with VError rather than extending VError. | Rewriting `APIErrors` to extend `VError` (high churn, loses typed `.errors` array accessor) |
| 2026-06-20 | Import as `import VError from 'verror'` (default import) | `verror` is CommonJS; `esModuleInterop: true` + `allowSyntheticDefaultImports: true` in `tsconfig.json` enable this in the NodeNext module resolution already used by the repo. | Named import `import { VError } from 'verror'` (not exported that way from the CJS module) |
| 2026-06-20 | Add `@types/verror` as devDependency | `verror` ships no built-in types; `@types/verror` provides them. | Inline `declare module` shim (fragile, not maintained) |
| 2026-06-20 | Improve `FormattedLogger.error` to emit `VError.fullStack()` when available | The call sites already pass the raw error object as the second arg; upgrading the logger centralises the improvement without touching every call site individually. | Updating every `logger.error(msg, e)` call site to call `VError.fullStack(e)` inline (repetitive, easy to miss new sites) |
| 2026-06-20 | Do NOT add VError to HAP characteristic throws | `HapStatusError` is a HAP protocol requirement and must remain unwrapped — HomeKit depends on its exact shape. Only the `logger.error` call before the throw gains context. | Wrapping HapStatusError in VError (breaks HAP) |
| 2026-06-20 | `SoundTouchSpeakerOnCharacteristic.getOn()` has no catch — leave it | The method returns `false` on `deviceIsOn()` failure (silent catch inside `SoundTouchDevice`); there is no logged error to enrich. | Adding a wrapping catch (adds behaviour, out of scope for a refactor) |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

### New dependency

- `package.json` — add `"verror": "^1.10.1"` to `dependencies` and
  `"@types/verror": "^1.10.6"` to `devDependencies`.

### Changed files

- `src/errors.ts` — `apiNotFoundWithName` returns `new VError({ info: { name } }, "Can't find device using the name '%s' on your network", name)`.
- `src/utils/FormattedLogger.ts` — `error(msg, err?)`: when `err` is an
  `Error`, emit `VError.fullStack(err)` (falls back gracefully for non-VError
  instances since `VError.fullStack` handles plain `Error` too).
- `src/devices/SoundTouch/SoundTouchDevice.ts`
  - `discoverAllAccessories` catch: wrap with `new VError(e, 'creating device %s', device.ip ?? device.name)`.
  - `fromConfiguredAccessory` throws: replace `new Error('Could not find a device')` / `new Error('Could not find device info')` with `VError` with `{ info: { name, room, ip } }`.
- `src/devices/SoundTouch/api/api.ts`
  - `_req` catch: wrap non-response network errors — `throw new VError(err, 'network request to %s failed', endpoint)`.
- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts`
  - Polling catch: `new VError(e as Error, 'polling refresh for %s', this.accessory.displayName)` (log, don't rethrow).
- `src/platform.ts`
  - `searchDevices` catch in `allSettled` handler: `new VError(result.reason, 'loading configured accessory %s', name)`.
  - `discoverDevices` two catch sites: wrap with device name context.
- `src/accessories/services/SoundTouchSpeakerBrightnessCharacteristic.ts`
  - Both catch blocks: log `new VError(e as Error, 'brightness %s for %s', action, deviceName)` before throwing `HapStatusError`.
- `src/accessories/services/SoundTouchSpeakerOnCharacteristic.ts`
  - `setOn` catch: log `new VError(e as Error, 'setOn for %s', deviceName)` before throwing `HapStatusError`.
- `src/accessories/services/SoundTouchSpeakerInformationCharacteristic.ts`
  - `new Error('No information service found')` → `new VError('no HAP information service registered for %s', accessoryName)`.

### Test files to add / update

- `src/utils/__tests__/FormattedLogger.test.ts` — add cases: `error()` with a
  plain `Error`, a `VError` chain, and no error arg; assert the full-stack
  output appears.
- `src/devices/SoundTouch/__tests__/SoundTouchDeviceConfiguration.test.ts` —
  no change needed (config, not errors).
- `src/devices/SoundTouch/api/__tests__/error.test.ts` — `APIErrors` unchanged,
  existing tests stay green as-is.
- Integration tests: error-path branches in the existing integration suites
  (`platform-lifecycle.integration.test.ts`) exercise the error paths through
  the platform; verify they still pass with the new wrapping.

## Conventions for this change

- **Commit type:** `refactor:` → no release.
- **Config schema touched:** no.
- **Tests to add/update:** `src/utils/__tests__/FormattedLogger.test.ts` (new
  VError cases); integration tests pass unchanged (smoke check).
- **Target branch:** `dev` (squash-merged; PR title is the released commit
  message).

## Implementation checklist

- [ ] `npm install verror && npm install --save-dev @types/verror`
- [ ] Update `src/utils/FormattedLogger.ts` — emit `VError.fullStack()` in `error()`
- [ ] Update `src/errors.ts` — `apiNotFoundWithName` → `VError` with `info: { name }`
- [ ] Update `src/devices/SoundTouch/SoundTouchDevice.ts` — wrap throws and catch sites
- [ ] Update `src/devices/SoundTouch/api/api.ts` — wrap network error in `_req`
- [ ] Update `src/platform.ts` — wrap both catch sites with device-name context
- [ ] Update `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — polling catch
- [ ] Update `src/accessories/services/SoundTouchSpeakerBrightnessCharacteristic.ts`
- [ ] Update `src/accessories/services/SoundTouchSpeakerOnCharacteristic.ts`
- [ ] Update `src/accessories/services/SoundTouchSpeakerInformationCharacteristic.ts`
- [ ] Add/update `FormattedLogger` tests for VError chain output
- [ ] Run `npm run knip` — confirm `verror` is not flagged as unused
- [ ] `npm run typecheck && npm run lint && npm test`

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] Confirm `VError.fullStack()` output appears in logs during `npm run watch`
  (e.g. simulate a device unreachable by pointing config at a bad IP)

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `refactor: replace bare Error with VError for structured, chained errors`
- **Targets:** `dev`
