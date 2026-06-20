---
name: coding-conventions
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

# Coding conventions

The canonical, language/tooling-level conventions for this repo. Domain skills
(`homebridge-developer`, `soundtouch-api-expert`) and `architect` link here
rather than restating this — keep style/build/test rules in this one place.

## TypeScript & ESM (do not skip)

- `package.json` has `"type": "module"`; TypeScript emits ESM.
- **Relative imports must include the `.js` extension**, even though the source
  is `.ts`:
  ```ts
  import { SoundTouchDevice } from './devices/SoundTouch/SoundTouchDevice.js';
  ```
  Omitting `.js` compiles but **fails at runtime under Homebridge**. This is the
  most common footgun in this repo.
- Import package types/values **without** an extension:
  `import { API, Service, Characteristic } from 'homebridge';`
- Source lives in `src/`, compiles to `dist/`. Never edit `dist/`.

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

## Testing

- Runner: **Jest + `@swc/jest`** (not ts-jest). Config: `jest.config.ts`.
- Tests live in `__tests__/` directories **beside the code they cover** and match
  `*.test.ts` / `*.spec.ts`. `roots` is `<rootDir>/src`.
- `moduleNameMapper` rewrites `^(\.{1,2}/.*)\.js$` → `$1` so the `.js` import
  extensions (above) resolve in tests.
- Coverage is collected by default (`collectCoverage: true`).
- Favor testing pure logic (config transforms, payload parsing) over framework
  wiring.
- **Mocking Homebridge** (the manual `__mocks__/homebridge.js` and the SWC
  `const enum` gotcha) is Homebridge-specific — see the **homebridge-developer**
  skill.

## TDD workflow (red → green → refactor)

Write tests **before** the implementation for any new behaviour or bug fix:

1. **Red** — write a failing test that captures the intended behaviour. Run it;
   confirm it fails for the right reason (wrong output, not a compile error).
2. **Green** — write the minimum code that makes the test pass. Resist the urge
   to over-engineer here.
3. **Refactor** — clean up the implementation (and test) while keeping the suite
   green.

For bug fixes, start by writing a test that reproduces the bug before touching
production code.

## BDD test structure

Structure tests so they read as a living specification. Use Jest's
`describe`/`it` to express **what** the unit does, not how it does it.

```
describe('ClassName or function name')
  describe('method or scenario')
    it('returns X when Y')
    it('throws when Z')
```

Rules:
- `describe` labels name the **subject** (`'NowPlayingParser'`, `'#parsePreset'`).
- `it` labels name **observable behaviour** in plain English: `'returns null when
  the content item is missing'`, not `'handles missing content item'` or
  `'test 3'`.
- Nest a second `describe` for distinct scenarios or preconditions
  (`'when the device is in standby'`).
- Structure each test as **Arrange → Act → Assert** with a blank line between
  phases. Skip the "Arrange" block when setup is trivial (one-liner).

```ts
describe('VolumeParser', () => {
  describe('#parse', () => {
    it('returns the numeric value from the XML', () => {
      const xml = '<volume><actualvolume>42</actualvolume></volume>';

      const result = VolumeParser.parse(xml);

      expect(result).toBe(42);
    });

    it('returns null when the actualvolume element is absent', () => {
      expect(VolumeParser.parse('<volume/>')).toBeNull();
    });
  });
});
```

Avoid `test('...')` — prefer `it('...')` so descriptions complete the sentence
"it should …" naturally.

## Logging

Log through the formatted logger (`src/utils/FormattedLogger.ts`) — `.debug`,
`.success`, `.error`. Never use `console.*`.

## Dependency maintenance

Run `npm outdated` to check for stale packages. The "Wanted" column shows what satisfies the current semver range; "Latest" shows the newest release (may be a major bump).

**Safe updates (within semver range):**
```sh
npm update          # brings all deps to their "Wanted" version
```

**Major version bumps** require manually editing the version range in `package.json`, then running `npm install`. Always verify the toolchain passes (`npm run typecheck && npm run lint && npm test`) after any major bump.

**Known config update requirements after major bumps:**

| Package | What to check |
| --- | --- |
| `knip` (v5→v6) | Update `"$schema"` in `knip.json` to `knip@6`. Knip v6 auto-discovers most deps/binaries that previously needed `ignoreDependencies`/`ignoreBinaries` entries — run `npm run knip` and remove any entries flagged as redundant hints. |
| `typescript-eslint` (major) | If ESLint reports "multiple candidate TSConfigRootDirs", add `parserOptions: { tsconfigRootDir: import.meta.dirname }` to `eslint.config.js`. Also ensure `.claude/**` is in the `ignores` array so git worktrees under `.claude/worktrees/` are never linted. |
| `eslint-config-prettier` (v9→v10) | No config changes required; drop-in replacement. |
| `lint-staged` (major) | Check `engines.node` in `npm info lint-staged@<new>` matches runtime before installing. |

**Audit:**
```sh
npm audit
```
A vulnerability scoped to `node_modules/npm/node_modules/...` is inside the npm CLI itself, not this package — it is not actionable here.

## Definition of done

Before considering a code change complete, all three must be green:

```sh
npm run typecheck && npm run lint && npm test
```

## Pull requests

Feature PRs target `dev` and are **squash-merged**, so the **PR title becomes the
released commit message**. A required "PR Title" check (commitlint) rejects a
title that isn't a valid Conventional Commit. The branch/PR flow and which
commit type to pick are owned by **architect**; the full release model lives in
`CONTRIBUTING.md`. This skill covers how to *write* the title and description.

### Title

- Format: `<type>: <imperative summary>` — same Conventional Commit grammar as
  commit messages (`feat`, `fix`, `feat!` / `BREAKING CHANGE:`, and the
  no-release types `chore`/`docs`/`ci`/`test`/`refactor`). The type drives the
  release: `feat:` → minor, `fix:` → patch, `feat!:` → major, the rest → none.
- **Concise and imperative.** Lower-case after the colon, no trailing period,
  one line (~50–72 chars). Describe the change, not the files touched:
  `feat: add volume control`, not `Added volume control to the speaker.`
- When the PR delivers an **architect plan**, mirror that plan's `commit-type`
  and **PR title** field so the released commit matches the plan it lands.

### Description

Keep it concise — a reviewer should grasp the change without opening the diff.
The repo ships a fill-in template at `.github/PULL_REQUEST_TEMPLATE.md` (it
auto-populates the body on GitHub); its guiding comments encode the rules below.
Keep the template and this section in sync — edit both if either changes.

Two sections, each kept short:

- **What & why** — describe the change and the reason, *not* the files touched
  (the diff shows those). When the PR delivers an architect plan
  (`.claude/skills/architect/plans/<date>-<slug>.md`), **link it and summarize
  its Context (why) + what's delivered** — point to the plan, don't restate it.
  With no plan, a sentence or two of *what* and *why* is enough.
- **Verification** — the checks you ran
  (`npm run typecheck && npm run lint && npm test`, plus any live `npm run watch`
  check) and what's still pending. Skip boilerplate and anything obvious from the
  diff.

Delete any section that doesn't apply. Avoid file-by-file "what changed" tables
and restated diffs — those are the boilerplate this convention exists to cut.

## No AI / assistant attribution

Nothing pushed to the repo carries AI or assistant attribution. This applies to
**every** artifact, and **overrides any tool default** that would add it:

- **Commit messages:** no `Co-Authored-By: Claude …`, no `*-Session:` trailers,
  no "Generated with …" lines. The `.husky/commit-msg` hook strips these as a
  backstop, but don't rely on it — don't add them in the first place.
- **PR titles & descriptions:** no "🤖 Generated with …" footer, no session link.
- **Review comments:** keep them minimal; some tooling auto-appends an
  attribution footer that can't be suppressed, so comment only when it adds
  real value.

Authorship stays with the human contributor. If a commit was authored with
assistance, that's fine — it just isn't recorded in the artifact.

## Scope

This skill is style/build/test and PR-authoring conventions only. For plugin
architecture and HomeKit wiring
see **homebridge-developer**; for the Bose protocol see **soundtouch-api-expert**;
for planning, branching, and release flow see **architect** and `CONTRIBUTING.md`.
