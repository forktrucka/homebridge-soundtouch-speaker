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
  read this skill yet, read it first.
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

## Definition of done

Before considering a code change complete, all three must be green:

```sh
npm run typecheck && npm run lint && npm test
```

## Scope

This skill is style/build/test only. For plugin architecture and HomeKit wiring
see **homebridge-developer**; for the Bose protocol see **soundtouch-api-expert**;
for planning, branching, and release flow see **architect** and `CONTRIBUTING.md`.
