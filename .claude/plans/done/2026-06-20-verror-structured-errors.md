---
feature: Structured error chaining, context fields, and fine-grained log-level control
status: beta # v0.4.0-beta.1
date: 2026-06-20
branch: feat/structured-errors-logging
commit-type: feat
---

# Structured error chaining, context fields, and fine-grained log-level control

## Context

Two related problems in the current codebase:

**1. Errors lose context as they propagate.** A polling failure logs `'Polling
refresh failed' <Error: ...>` with no trace of which device was involved or what
the underlying API call was. A discovery failure logs the raw axios error with no
device-name context. When errors cross boundaries (API → device → accessory →
platform), each catch site re-logs without chaining — making it hard to correlate
a user-visible failure back to its root cause.

**2. Logging granularity is binary.** The only dial is `verbose: boolean` in
config — `true` enables DEBUG, `false` enables INFO and above. Users can't say
"show warnings and errors only" or "I want error output but not the debug noise."
Additionally, when an error IS logged, the output is equally terse regardless of
whether the user opted into verbose mode.

This plan addresses both with zero new dependencies:

- **Native `Error.cause`** (ES2022, Node 18+) — `new Error('doing X for Kitchen
  Speaker', { cause: originalError })` chains errors without any library.
- **`ContextError` class** (new, ~10 lines) — extends `Error` with a typed
  `context: Record<string, string>` bag for structured metadata (device name,
  endpoint, room) that survives cause-chain traversal.
- **`homebridge-lib`'s `formatError()`** (already a runtime dep) — used per-node
  when traversing the `.cause` chain in `FormattedLogger`.
- **`logLevel` config option** — replaces the binary `verbose` flag with a
  four-value enum (`'debug' | 'info' | 'warn' | 'error'`). `verbose: true`
  continues to work as a deprecated alias for `'debug'`.
- **Level-aware error formatting in `FormattedLogger`** — at DEBUG, `error()` shows
  the full cause chain and stack traces; at INFO/WARN/ERROR it shows the top-level
  message and the immediate cause only.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-20 | **Drop `verror`** — use native `Error.cause` (ES2022) instead | `verror` is a third-party CJS dependency. Native `Error.cause` is available in ES2022 (this repo's TS target) and Node 18+ (runtime is Node 22). Zero new runtime or dev deps required. | `verror` (external dep, CJS interop complexity); `pino`/`winston` (heavy, wrong layer) |
| 2026-06-20 | Keep `APIErrors extends Error` as-is | It carries structured SoundTouch API payload (`errors: APIError[]`, `deviceId`) that has no native-cause analogue. Wrap it at catch sites rather than rewriting the class. | Rewriting `APIErrors` (high churn, loses typed `.errors` array accessor) |
| 2026-06-20 | Do NOT add cause-wrapping to HAP characteristic throws | `HapStatusError` is a HAP protocol requirement and must remain unwrapped. Only the `logger.error` call *before* the `throw HapStatusError` gains the contextual Error. | Wrapping HapStatusError in a cause chain (breaks HAP) |
| 2026-06-20 | `SoundTouchSpeakerOnCharacteristic.getOn()` has no catch — leave it | The method returns `false` on `deviceIsOn()` failure (silent catch inside `SoundTouchDevice`); there is no logged error to enrich. | Adding a wrapping catch (adds behaviour, out of scope) |
| 2026-06-21 | `logLevel: 'debug' \| 'info' \| 'warn' \| 'error'` replaces `verbose: boolean` | Four values cover all practical needs. `verbose: true` stays as a deprecated alias for `'debug'` so existing configs don't break. `LogLevel` from homebridge maps directly: `DEBUG / INFO / WARN / ERROR`. | Keeping `verbose` only (too coarse); per-channel toggles (over-engineered) |
| 2026-06-21 | `logLevel` is a top-level `global` config option, threaded through `PlatformConfiguration` | Consistent with `pollingInterval`, `accessoryType`, and `verbose` — all live under `global`. `PlatformConfiguration.logLevel` replaces `verbose` internally; `verbose` is read only as an alias. | Per-accessory `logLevel` (log level is a platform concern, not per-device) |
| 2026-06-21 | Level-aware error output in `Logger.error()`: DEBUG → full cause chain + stacks; others → top message + immediate cause | Users in verbose/debug mode need root-cause visibility; users in default INFO mode need a concise signal. Same call site, output determined by `requiredLogLevel`. | Separate `logger.verboseError()` method (leaks implementation detail into call sites); always-verbose (noisy for default users) |
| 2026-06-21 | Introduce `ContextError extends Error` with `context: Record<string, string>` | Device name is already handled by `DeviceLogger` prefix. `ContextError` handles endpoint, room, operation — metadata that belongs with the error itself, not in the message string. `FormattedLogger` detects `instanceof ContextError` and renders context fields inline. | Interpolating everything into the message string (loses structure, can't filter/reformat); custom `info` map on all errors (requires touching more files) |
| 2026-06-21 | `ContextError` lives in `src/errors.ts` alongside `apiNotFoundWithName` | One place for shared error primitives. | New file `src/utils/ContextError.ts` (unnecessary file for 10 lines) |
| 2026-06-21 | `ContextError` constructor is `private`; exposes `static wrap(message, context, cause)` | Follows the repo-wide static factory convention (coding-conventions skill). `wrap()` eliminates the `{ cause: err }` options bag at every catch site and is the idiomatic creation path. `throw new ContextError(...)` remains acceptable only inside the class itself. | `new ContextError(...)` at all call sites (violates factory convention for complex-arg Error subclasses) |
| 2026-06-21 | commit-type is `feat:` — minor release | `logLevel` config option is user-visible and expands capability. | `refactor:` (wrong — user-facing config change) |
| 2026-06-21 | Use `homebridge-lib`'s `formatError()` per node in the cause chain | Already a runtime dep. Handles ECONNREFUSED, axios errors, plain Errors consistently. | Reimplementing formatError (duplication); `.stack` raw (verbose, unreadable for ECONNREFUSED) |
| 2026-07-09 | Implementation merged with design drift: `AppError` replaced the planned `ContextError` name | PR #120 merged 2026-06-23 and is contained in `v0.4.0-beta.1`; code evidence: `src/errors.ts` now provides `AppError.create(...)` with typed context/cause, `FormattedLogger` renders cause chains by log level, and `config.schema.json` exposes `logLevel` | Leaving plan in active `planned` state; renaming implemented `AppError` back to `ContextError` just for plan fidelity |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

### No new npm dependencies

`Error.cause` and `ContextError` are zero-dep. `formatError` is from `homebridge-lib`
(already installed). `logLevel` maps to homebridge's existing `LogLevel` enum.

### New / changed source files

#### `src/errors.ts` — add `ContextError`

```ts
export class ContextError extends Error {
  readonly context: Record<string, string>;

  private constructor(
    message: string,
    context: Record<string, string>,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'ContextError';
    this.context = context;
  }

  static wrap(
    message: string,
    context: Record<string, string>,
    cause: unknown
  ): ContextError {
    return new ContextError(message, context, { cause });
  }
}

export function apiNotFoundWithName(name: string): Error {
  return new Error(`Can't find device using the name '${name}' on your network`);
}
```

#### `src/ExternalPlatformConfig.ts` — add `logLevel`

```ts
interface BaseGlobalConfig {
  readonly verbose?: boolean;  // deprecated alias for logLevel: 'debug'
  readonly logLevel?: 'debug' | 'info' | 'warn' | 'error';
}
```

#### `src/PlatformConfiguration.ts` — thread `logLevel`

- Add `logLevel: LogLevel` property (internal, typed).
- In `fromExternalConfiguration`: resolve `logLevel` from `props.global.logLevel`
  first; fall back to `verbose: true → 'debug'`; default to `'info'`.
- Map string → `LogLevel` enum: `'debug' → LogLevel.DEBUG`, etc.
- Remove the `verbose` property (replaced internally by `logLevel`).

#### `config.schema.json` — expose `logLevel`

Add to `global` object:
```json
"logLevel": {
  "type": "string",
  "enum": ["debug", "info", "warn", "error"],
  "default": "info",
  "description": "Minimum log level written to the Homebridge console."
}
```

#### `src/utils/FormattedLogger.ts` — level-aware error formatting

```ts
import { formatError } from 'homebridge-lib';
import { ContextError } from '../errors.js';

// Replace the existing error() body:
error(message: string, err?: unknown): void {
  if (!(err instanceof Error)) {
    this.log(LogLevel.ERROR, message);
    return;
  }

  const isDebug = !Logger.excludeLog(LogLevel.DEBUG, this.requiredLogLevel);

  if (isDebug) {
    // Full cause chain + context fields + stack at debug verbosity
    const lines: string[] = [];
    let node: unknown = err;
    while (node instanceof Error) {
      const ctx = node instanceof ContextError
        ? ` [${Object.entries(node.context).map(([k, v]) => `${k}: ${v}`).join(', ')}]`
        : '';
      lines.push(`${formatError(node)}${ctx}`);
      if (node.stack) lines.push(`  ${node.stack.split('\n').slice(1, 4).join('\n  ')}`);
      node = node.cause;
    }
    this.log(LogLevel.ERROR, `${message}:\n  ${lines.join('\n  caused by:\n  ')}`);
  } else {
    // Concise: top message + immediate cause
    const ctx = err instanceof ContextError
      ? ` [${Object.entries(err.context).map(([k, v]) => `${k}: ${v}`).join(', ')}]`
      : '';
    const cause = err.cause instanceof Error ? `\n  caused by: ${formatError(err.cause)}` : '';
    this.log(LogLevel.ERROR, `${message}: ${formatError(err)}${ctx}${cause}`);
  }
}
```

#### `src/platform.ts` — use `configuration.logLevel`

Replace:
```ts
level: this.configuration.verbose ? LogLevel.DEBUG : LogLevel.INFO,
```
With:
```ts
level: this.configuration.logLevel,
```

#### Call sites — wrap errors with `ContextError.wrap()`

All catch sites use `ContextError.wrap(message, context, cause)` — never
`new ContextError(...)` directly (that is private to the class).

- `src/devices/SoundTouch/SoundTouchDevice.ts`
  - `discoverAllAccessories` catch: `ContextError.wrap('creating device', { ip: device.ip ?? '', name: device.name ?? '' }, e)`
  - `fromConfiguredAccessory` throws: add room/name to existing message strings (plain `Error`, no cause here).
- `src/devices/SoundTouch/api/api.ts`
  - `_req` catch: `throw ContextError.wrap('network request failed', { endpoint }, err)`.
- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts`
  - Polling catch: `ContextError.wrap('polling refresh', { device: this.accessory.displayName }, e)`.
- `src/platform.ts`
  - `searchDevices` allSettled handler: `ContextError.wrap('loading configured accessory', { name }, result.reason)`.
  - `discoverDevices` catch sites: wrap with device name context.
- `src/accessories/services/SoundTouchSpeakerBrightnessCharacteristic.ts`
  - Both catch blocks: log wrapped error before throwing `HapStatusError`.
- `src/accessories/services/SoundTouchSpeakerOnCharacteristic.ts`
  - `setOn` catch: log wrapped error before throwing `HapStatusError`.
- `src/accessories/services/SoundTouchSpeakerInformationCharacteristic.ts`
  - Add accessory name to existing message string.

### Test files to add / update

- `src/utils/__tests__/FormattedLogger.test.ts`
  - `error()` with plain `Error` (no cause) — concise path
  - `error()` with `ContextError` — context fields appear in output
  - `error()` with two-level cause chain at DEBUG level — full chain + "caused by:" appears
  - `error()` with two-level cause chain at INFO level — only top + immediate cause
  - `error()` with no error arg — message only
- `src/__tests__/PlatformConfiguration.test.ts`
  - `logLevel: 'warn'` maps to `LogLevel.WARN`
  - `verbose: true` maps to `LogLevel.DEBUG` (backward compat)
  - Default is `LogLevel.INFO`
- `src/devices/SoundTouch/api/__tests__/error.test.ts` — `APIErrors` unchanged; existing tests stay green.
- Integration tests: `platform-lifecycle.integration.test.ts` error paths pass unchanged (smoke check).

## Conventions for this change

- **Commit type:** `feat:` → minor release.
- **Config schema touched:** yes — `config.schema.json` (`logLevel`), `ExternalPlatformConfig`
  (`logLevel`), `PlatformConfiguration` (`logLevel`, drop `verbose`), and their tests.
- **Tests to add/update:** `FormattedLogger.test.ts`, `PlatformConfiguration.test.ts`.
- **Target branch:** `dev` (squash-merged; PR title is the released commit message).
- **ESM import rule:** `import { ContextError } from '../errors.js'` — don't omit `.js`.
- **Domain skill to re-read before implementing:** `coding-conventions` (level-aware
  logging, test structure).

## Implementation checklist

- [x] Add structured `AppError` class to `src/errors.ts`
- [x] Add `logLevel` to `ExternalPlatformConfig.ts` (keep `verbose` as deprecated alias)
- [x] Update `PlatformConfiguration.ts` — add `logLevel: LogLevel`, resolve from config,
      remove `verbose` property
- [x] Update `config.schema.json` — add `logLevel` enum to `global`
- [x] Update `src/platform.ts` — use `configuration.logLevel` instead of
      `configuration.verbose ? DEBUG : INFO`
- [x] Update `src/utils/FormattedLogger.ts` — level-aware `error()` with cause chain
      traversal and structured error context rendering
- [x] Update `src/devices/SoundTouch/SoundTouchDevice.ts` — wrap catch/throw sites
- [x] Update `src/devices/SoundTouch/api/api.ts` — wrap `_req` network error
- [x] Update `src/platform.ts` — wrap both catch sites with structured errors
- [x] Update `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — polling catch
- [x] Update `src/accessories/services/SoundTouchSpeakerBrightnessCharacteristic.ts`
- [x] Update `src/accessories/services/SoundTouchSpeakerOnCharacteristic.ts`
- [x] Update `src/accessories/services/SoundTouchSpeakerInformationCharacteristic.ts`
- [x] Add/update `FormattedLogger` tests (plain, structured error, chain at DEBUG, chain at INFO)
- [x] Add `PlatformConfiguration` tests for `logLevel` resolution
- [x] `npm run typecheck && npm run lint && npm test`
- [ ] `npm run knip` — confirm no unused exports

## Verification

- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm test`
- [ ] `npm run watch` with `logLevel: 'debug'` + bad IP — expect full chain:
      `network request failed [endpoint: /volume]\n  caused by: ECONNREFUSED …`
- [ ] `npm run watch` with `logLevel: 'info'` (default) — same scenario shows concise:
      `polling refresh [device: Kitchen]: network request failed [endpoint: /volume]\n  caused by: ECONNREFUSED …`
- [ ] `npm run watch` with `logLevel: 'warn'` — info messages suppressed, errors still appear
- [ ] Confirm `verbose: true` still works (backward compat alias for `debug`)

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `feat: add logLevel config and structured error chaining with cause context`
- **Targets:** `dev`
