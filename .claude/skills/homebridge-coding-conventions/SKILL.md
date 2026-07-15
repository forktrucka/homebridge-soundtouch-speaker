---
name: homebridge-coding-conventions
description: >-
  How code is written, formatted, built, and tested in this repo: TypeScript
  ESM import rules, the ESLint/Prettier/knip toolchain, the Jest + SWC test
  setup, logging, and the checks that gate "done". Read this skill before
  writing or editing ANY TypeScript source or test file — including bug fixes,
  new features, refactors, and test changes. The single most common footgun:
  missing .js extensions on relative imports compiles fine but silently breaks
  at runtime under Homebridge. If you're about to touch a .ts file and haven't
  read this skill yet, read it first. Also read it before opening a pull request
  — it owns the PR title and description conventions.
---

# Homebridge coding conventions

The canonical, language/tooling-level conventions for this repo. Domain skills
(`homebridge-developer`, `soundtouch-api-expert`) and `architect` link here
rather than restating this — keep style/build/test rules in this one place.

## Contents

- [TypeScript code style](#typescript-code-style)
  - [ESM & imports](#esm--imports)
  - [Class instantiation — static factory methods](#class-instantiation--static-factory-methods)
- [Toolchain](#toolchain)
- [Testing](#testing)
  - [Setup](#setup)
  - [TDD workflow — red → green → refactor](#tdd-workflow--red--green--refactor)
  - [BDD test structure](#bdd-test-structure)
- [Logging](#logging)
- [Dependency management](#dependency-management)
  - [Adding new packages](#adding-new-packages)
  - [Updating existing packages](#updating-existing-packages)
- [Definition of done](#definition-of-done)
- [Pull requests](#pull-requests)
  - [Title](#title)
  - [Description](#description)
  - [No AI attribution](#no-ai-attribution)
- [Scope](#scope)

---

## TypeScript code style

### ESM & imports

> **Do not skip — the most common footgun in this repo.**

- `package.json` has `"type": "module"`; TypeScript emits ESM.
- **Relative imports must include the `.js` extension**, even though the source
  is `.ts`:
  ```ts
  import { SoundTouchDevice } from './devices/SoundTouch/SoundTouchDevice.js';
  ```
  Omitting `.js` compiles but **fails at runtime under Homebridge**.
- Import package types/values **without** an extension:
  `import { API, Service, Characteristic } from 'homebridge';`
- Source lives in `src/`, compiles to `dist/`. Never edit `dist/`.

### `undefined` over `null`

Prefer `undefined` for absent or missing values. Avoid returning or storing
`null` — use `undefined` instead:

```ts
// ✓
async resolveStationUrl(id: string): Promise<string | undefined> { … }

// ✗
async resolveStationUrl(id: string): Promise<string | null> { … }
```

`null` is still acceptable when an external API or library contract requires it
(e.g. JSON payloads where `null` and `undefined` are semantically distinct, or
third-party types that express `null`). Everywhere the codebase controls the
type, use `undefined`.

This rule applies to `it` label wording too — write `'returns undefined when …'`
not `'returns null when …'`.

### Class instantiation — static factory methods

All new classes expose their creation through **named static factory methods**,
not through direct `new ClassName(...)` at call sites. This is the universal
pattern in the codebase:

| Class | Factory method(s) |
| --- | --- |
| `PlatformConfiguration` | `fromExternalConfiguration()` |
| `DeviceConfiguration` | `fromAccessoryConfiguration()`, `create()`, `createForRoom()`, `createForIp()` |
| `Logger` | `forHomebridgeLogger()` |
| `DeviceLogger` | `fromLogger()` |
| `SoundTouchDevice` | `fromConfiguredAccessory()`, `fromDiscoveredAccessory()` |
| `SoundTouchSpeakerPlatformAccessory` | `createAccessory()` |

**Rules:**

- Every new class **must** expose at least one named static factory.
- The constructor is **`private`** (or `protected` for abstract base classes).
  Direct `new ClassName(...)` may only appear *inside* the class itself.
- Factory names follow the existing vocabulary:
  - `static fromX(x: X): ClassName` — when creating from a source object
  - `static create(...): ClassName` — for general construction
  - `static forX(...): ClassName` — for context-specific construction
- **`Error` subclasses are a partial exception** — `throw new MyError(...)` is
  idiomatic JS and acceptable at throw sites. Still provide `static wrap()` or
  `static create()` when construction arguments are complex or repeated.

```ts
export class SoundTouchZoneAccessory {
  private constructor(
    private readonly device: SoundTouchDevice,
    private readonly slaves: SoundTouchDevice[],
  ) {}

  static create(props: {
    device: SoundTouchDevice;
    slaves: SoundTouchDevice[];
  }): SoundTouchZoneAccessory {
    return new SoundTouchZoneAccessory(props.device, props.slaves);
  }
}
```

---

## Toolchain

| Command | Purpose |
| --- | --- |
| `npm run build` | Clean + `tsc` → `dist/` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint, `--max-warnings=0`, auto-`--fix` |
| `npm run format` | Prettier write |
| `npm run knip` | Flag unused files / exports / deps |
| `npm test` (`npx jest`) | Run tests with coverage |
| `npx jest <pattern>` | Run a subset |

ESLint runs with zero tolerance for warnings (`--max-warnings=0`). Prettier
owns formatting — run `npm run format` to auto-write; don't hand-format against
it. Run `npm run knip` after deleting or moving code to catch newly unused
exports, files, or dependencies.

---

## Testing

### Setup

- Runner: **Jest + `@swc/jest`** (not ts-jest). Config: `jest.config.ts`.
- Tests live in `__tests__/` directories **beside the code they cover** and match
  `*.test.ts` / `*.spec.ts`. `roots` is `<rootDir>/src`.
- `moduleNameMapper` rewrites `^(\.{1,2}/.*)\.js$` → `$1` so the `.js` import
  extensions resolve in tests.
- Coverage is collected by default (`collectCoverage: true`).
- Favor testing pure logic (config transforms, payload parsing) over framework
  wiring.
- **Mocking Homebridge** (the manual `__mocks__/homebridge.js` and the SWC
  `const enum` gotcha) is Homebridge-specific — see the **homebridge-developer**
  skill.

### TDD workflow — red → green → refactor

Write tests **before** the implementation for any new behaviour or bug fix:

1. **Red** — write a failing test that captures the intended behaviour. Run it;
   confirm it fails for the right reason (wrong output, not a compile error).
2. **Green** — write the minimum code that makes the test pass. Resist the urge
   to over-engineer here.
3. **Refactor** — clean up the implementation (and test) while keeping the suite
   green.

For bug fixes, start by writing a test that reproduces the bug before touching
production code.

### BDD test structure

Structure tests so they read as a living specification. Use Jest's
`describe`/`it` to express **what** the unit does, not how it does it.

```
describe('ClassName or function name')
  describe('method or scenario')
    it('returns X when Y')
    it('throws when Z')
```

- `describe` labels name the **subject** (`'NowPlayingParser'`, `'#parsePreset'`).
- `it` labels name **observable behaviour** in plain English: `'returns undefined when
  the content item is missing'`, not `'handles missing content item'`.
- Nest a second `describe` for distinct scenarios (`'when the device is in standby'`).
- Structure each test as **Arrange → Act → Assert** with a blank line between
  phases. Skip "Arrange" when setup is trivial (one-liner).
- Use `it('...')`, never `test('...')`.

```ts
describe('VolumeParser', () => {
  describe('#parse', () => {
    it('returns the numeric value from the XML', () => {
      const xml = '<volume><actualvolume>42</actualvolume></volume>';

      const result = VolumeParser.parse(xml);

      expect(result).toBe(42);
    });

    it('returns undefined when the actualvolume element is absent', () => {
      expect(VolumeParser.parse('<volume/>')).toBeUndefined();
    });
  });
});
```

---

## Logging

Log through the formatted logger (`src/utils/FormattedLogger.ts`) — `.debug`,
`.info`, `.success`, `.warn`, `.error`. Never use `console.*`.

---

## Dependency management

### Adding new packages

**Do not `npm install` any new package without prior discussion.** This applies
to both runtime and dev dependencies.

Before suggesting a package:

1. **Exhaust zero-dep alternatives first** — Node built-ins, packages already
   installed, or a small custom implementation. The existing dep list covers a
   lot: `homebridge-lib` (formatError, platform utilities), `axios` (HTTP),
   `xml2js` (XML), `ws` (WebSocket), `homebridge` types. Reach for these before
   reaching for npm.
2. **Check transitive dependencies** — run `npm info <pkg> dependencies` and
   `npm pack --dry-run <pkg>` to count what comes with it. A package that pulls
   in ten transitive deps is ten packages to audit, maintain, and trust.
3. **Flag it explicitly** — any package suggestion must state:
   - The number of direct + transitive dependencies
   - Whether those dependencies are themselves external (vs. bundled/native)
   - Why no existing dep or built-in can serve the need
4. **Prefer lean packages** — if a package is genuinely needed, a package with
   zero or one dependency is strongly preferred over a feature-rich one with a
   deep tree. A package with >5 transitive deps requires strong justification.

The plans in `.claude/plans/` record dependency decisions in
their **Decisions & findings** table — if a package was considered and rejected,
note it there so it isn't re-investigated.

### Updating existing packages

Run `npm outdated` to check for stale packages. The "Wanted" column shows what
satisfies the current semver range; "Latest" shows the newest release (may be a
major bump).

**Safe updates (within semver range):**
```sh
npm update          # brings all deps to their "Wanted" version
```

**Major version bumps** require manually editing the version range in
`package.json`, then running `npm install`. Always verify the toolchain passes
(`npm run typecheck && npm run lint && npm test`) after any major bump.

**Known config update requirements after major bumps:**

| Package | What to check |
| --- | --- |
| `knip` (v5→v6) | Update `"$schema"` in `knip.json` to `knip@6`. Knip v6 auto-discovers most deps/binaries — run `npm run knip` and remove any entries flagged as redundant hints. |
| `typescript-eslint` (major) | If ESLint reports "multiple candidate TSConfigRootDirs", add `parserOptions: { tsconfigRootDir: import.meta.dirname }` to `eslint.config.js`. Also ensure `.claude/**` is in the `ignores` array. |
| `eslint-config-prettier` (v9→v10) | No config changes required; drop-in replacement. |
| `lint-staged` (major) | Check `engines.node` in `npm info lint-staged@<new>` matches runtime before installing. |

**Audit:**
```sh
npm audit
```
A vulnerability scoped to `node_modules/npm/node_modules/...` is inside the npm
CLI itself — not actionable here.

---

## Definition of done

Before considering a code change complete, all three must be green:

```sh
npm run typecheck && npm run lint && npm test
```

---

## Pull requests

### Title

Feature PRs target `dev` and are **squash-merged** — the **PR title becomes the
released commit message**. A required "PR Title" check (commitlint) rejects
anything that isn't a valid Conventional Commit.

- Format: `<type>: <imperative summary>`
- Types and release impact: `feat:` → minor, `fix:` → patch, `feat!:` /
  `BREAKING CHANGE:` footer → major, `chore`/`docs`/`ci`/`test`/`refactor` → none.
- Lower-case after the colon, no trailing period, one line (~50–72 chars).
- Describe the change, not the files: `feat: add volume control`, not
  `Added volume control to the speaker.`
- When the PR delivers an **architect plan**, mirror that plan's `commit-type`
  and `PR title` field exactly.

### Description

Keep it concise — a reviewer should grasp the change without opening the diff.
The repo ships a fill-in template at `.github/PULL_REQUEST_TEMPLATE.md`.

Two sections:

- **What & why** — the change and the reason, *not* the files touched (the diff
  shows those). When the PR delivers an architect plan, link it and summarize its
  Context + what's delivered. With no plan, one or two sentences is enough.
- **Verification** — the checks you ran (`npm run typecheck && npm run lint &&
  npm test`, plus any live `npm run watch` check) and what's still pending.

Delete any section that doesn't apply. Avoid file-by-file "what changed" tables.

### No AI attribution

Nothing pushed to the repo carries AI or assistant attribution:

- **Commit messages:** no `Co-Authored-By: Claude …`, no `*-Session:` trailers,
  no "Generated with …" lines.
- **PR titles & descriptions:** no "🤖 Generated with …" footer, no session link.
- **Review comments:** keep them minimal — some tooling auto-appends attribution
  that can't be suppressed, so comment only when it adds real value.

---

## Scope

This skill covers TypeScript style, build/test tooling, and PR conventions only.
For plugin architecture and HomeKit wiring see **homebridge-developer**; for the
Bose protocol see **soundtouch-api-expert**; for planning, branching, and release
flow see **architect** and `CONTRIBUTING.md`.
