---
name: coding-conventions
description: >-
  How code is written, formatted, built, and tested in this repo: TypeScript
  ESM import rules, the ESLint/Prettier/knip toolchain, the Jest + SWC test
  setup, logging, and the checks that gate "done". Use before writing or
  editing any TypeScript source or test in this project.
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

ESLint runs with zero tolerance for warnings; Prettier owns formatting (don't
hand-format against it). `knip` keeps the dependency/export surface clean.

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
