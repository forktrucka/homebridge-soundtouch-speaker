---
feature: Replace bare Error with structured, chained errors using native Error.cause
status: planned
date: 2026-06-20
branch: refactor/verror-structured-errors
commit-type: refactor
---

# Replace bare Error with structured, chained errors using native Error.cause

## Context

Error messages today lose context as they propagate up the stack. A polling
failure logs `'Polling refresh failed' <Error: ...>` with no trace of which
device was involved or what the underlying API call was. A discovery failure
logs the raw axios error with no device-name context. When errors cross
boundaries (API → device → accessory → platform), each catch site re-logs
without chaining — making it hard to correlate a user-visible failure back
to its root cause.

The fix uses two zero-dependency building blocks already available in this repo:

- **Native `Error.cause`** (ES2022, Node 18+) — `new Error('doing X for Kitchen
  Speaker', { cause: originalError })` chains errors without any library. The
  repo's `tsconfig.json` targets ES2022 and `lib: ["ES2022"]`; Node 22+ at
  runtime. Zero new dependencies.
- **`homebridge-lib`'s `formatError()`** (already a runtime dep) — handles
  system errors (ECONNREFUSED, etc.), axios errors, and plain Errors with
  consistent human-readable output. Used per-node when traversing the `.cause`
  chain in `FormattedLogger`.

Together they give cause chaining and readable structured output without adding
any package.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-20 | Use `refactor:` commit type — no release | Error structure is internal; no user-facing API or behaviour changes | `fix:` (not a bug fix, no observable behaviour change for users) |
| 2026-06-20 | Keep `APIErrors extends Error` as-is | It carries structured SoundTouch API payload (`errors: APIError[]`, `deviceId`) that has no native-cause analogue. Wrap it at catch sites rather than rewriting the class. | Rewriting `APIErrors` (high churn, loses typed `.errors` array accessor) |
| 2026-06-20 | **Drop `verror`** — use native `Error.cause` (ES2022) instead | `verror` is a third-party CJS dependency. Native `Error.cause` is available in ES2022 (this repo's TS target) and Node 18+ (runtime is Node 22). Zero new runtime or dev deps required. `{ cause }` option accepted by all `Error` subclasses natively. | `verror` (external dep, CJS interop complexity); `pino`/`winston` (heavy, wrong layer — logging not error chaining) |
| 2026-06-20 | Use `homebridge-lib`'s `formatError()` per node in the cause chain | `homebridge-lib` is already a runtime dep (v8.1.1). Its `formatError(e, useChalk?)` handles ECONNREFUSED, axios errors, and plain errors better than `.message` alone. Calling it on each node in the `.cause` chain gives better output than either `.message` or `.stack` alone. | Reimplementing formatError ourselves (duplication); calling `.stack` raw (verbose, hard to read for ECONNREFUSED) |
| 2026-06-20 | `FormattedLogger.error()` traverses the `.cause` chain centrally | Call sites already pass the raw error as the second arg. Upgrading the logger centralises the improvement without touching every call site. Output: `message: top-level message\n  caused by: cause message\n  caused by: root message`. | Updating every `logger.error(msg, e)` call site inline (repetitive, easy to miss new sites) |
| 2026-06-20 | Context goes in the Error message string, not in structured metadata | `Error.cause` carries no structured `info` bag (unlike `verror`). Device name / endpoint are interpolated directly into the message string at throw time: `new Error(\`polling refresh for ${device.name}\`, { cause: e })`. Sufficient for log readability; metadata queries are not used anywhere in this codebase. | Adding a custom `ContextError extends Error` with an `info` map (over-engineering for current needs) |
| 2026-06-20 | Do NOT add cause-wrapping to HAP characteristic throws | `HapStatusError` is a HAP protocol requirement and must remain unwrapped. Only the `logger.error` call *before* the `throw HapStatusError` gains the contextual Error. | Wrapping HapStatusError in a cause chain (breaks HAP) |
| 2026-06-20 | `SoundTouchSpeakerOnCharacteristic.getOn()` has no catch — leave it | The method returns `false` on `deviceIsOn()` failure (silent catch inside `SoundTouchDevice`); there is no logged error to enrich. | Adding a wrapping catch (adds behaviour, out of scope for a refactor) |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

### No new dependencies

No `npm install` step. `Error.cause` is built into Node 22+ / ES2022.
`formatError` is already exported from `homebridge-lib`.

### Changed files

- `src/utils/FormattedLogger.ts` — enhance `error(msg, err?)`:
  ```ts
  import { formatError } from 'homebridge-lib';

  // In error():
  if (err instanceof Error) {
    let node: unknown = err;
    const lines: string[] = [];
    while (node instanceof Error) {
      lines.push(formatError(node));
      node = node.cause;
    }
    this._log(LogLevel.ERROR, `${msg}: ${lines.join('\n  caused by: ')}`);
  } else {
    this._log(LogLevel.ERROR, msg);
  }
  ```
- `src/errors.ts` — `apiNotFoundWithName`: `new Error(
  \`Can't find device using the name '${name}' on your network\`)` stays
  unchanged (no cause here — it is the root). No change needed.
- `src/devices/SoundTouch/SoundTouchDevice.ts`
  - `discoverAllAccessories` catch: `new Error(\`creating device ${device.ip ?? device.name}\`, { cause: e })` (log only, don't rethrow).
  - `fromConfiguredAccessory` throws: `new Error(\`Could not find a device for room '${accessoryConfig.room}'\`)` and `new Error('Could not find device info', { cause: undefined })` — add room/name context to message.
- `src/devices/SoundTouch/api/api.ts`
  - `_req` catch (non-response network error): `throw new Error(\`network request to ${endpoint} failed\`, { cause: err })`.
- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts`
  - Polling catch: log `new Error(\`polling refresh for ${this.accessory.displayName}\`, { cause: e as Error })`.
- `src/platform.ts`
  - `searchDevices` allSettled handler: `new Error(\`loading configured accessory ${name}\`, { cause: result.reason })`.
  - `discoverDevices` two catch sites: wrap with device name context.
- `src/accessories/services/SoundTouchSpeakerBrightnessCharacteristic.ts`
  - Both catch blocks: log wrapped error before throwing `HapStatusError`.
- `src/accessories/services/SoundTouchSpeakerOnCharacteristic.ts`
  - `setOn` catch: log wrapped error before throwing `HapStatusError`.
- `src/accessories/services/SoundTouchSpeakerInformationCharacteristic.ts`
  - `new Error('No information service found')` → add accessory name to message.

### Test files to add / update

- `src/utils/__tests__/FormattedLogger.test.ts` — add cases:
  - `error()` with a plain `Error` (no cause)
  - `error()` with a two-level cause chain — assert "caused by:" appears
  - `error()` with no error arg
- `src/devices/SoundTouch/api/__tests__/error.test.ts` — `APIErrors` unchanged,
  existing tests stay green as-is.
- Integration tests: error-path branches in the existing integration suites
  (`platform-lifecycle.integration.test.ts`) exercise the error paths through
  the platform; verify they still pass with the new wrapping.

## Conventions for this change

- **Commit type:** `refactor:` → no release.
- **Config schema touched:** no.
- **Tests to add/update:** `src/utils/__tests__/FormattedLogger.test.ts` (new
  cause-chain cases); integration tests pass unchanged (smoke check).
- **Target branch:** `dev` (squash-merged; PR title is the released commit
  message).

## Implementation checklist

- [ ] Update `src/utils/FormattedLogger.ts` — traverse `.cause` chain using
      `homebridge-lib`'s `formatError()` in `error()`
- [ ] Update `src/devices/SoundTouch/SoundTouchDevice.ts` — add context to
      throws and catch site
- [ ] Update `src/devices/SoundTouch/api/api.ts` — wrap network error in `_req`
- [ ] Update `src/platform.ts` — wrap both catch sites with device-name context
- [ ] Update `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — polling catch
- [ ] Update `src/accessories/services/SoundTouchSpeakerBrightnessCharacteristic.ts`
- [ ] Update `src/accessories/services/SoundTouchSpeakerOnCharacteristic.ts`
- [ ] Update `src/accessories/services/SoundTouchSpeakerInformationCharacteristic.ts`
- [ ] Add/update `FormattedLogger` tests for cause chain output
- [ ] `npm run typecheck && npm run lint && npm test`

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] Confirm cause chain appears in logs during `npm run watch` — simulate
      unreachable device (bad IP in config); expect `network request to /volume
      failed\n  caused by: ECONNREFUSED …`

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `refactor: chain errors with native Error.cause and log full cause chain`
- **Targets:** `dev`
