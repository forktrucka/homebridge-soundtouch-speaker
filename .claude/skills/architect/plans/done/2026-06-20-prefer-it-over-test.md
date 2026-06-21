---
feature: Prefer it() over test() across the remaining test suites
status: done # 2026-06-21
date: 2026-06-20
branch: test/prefer-it-over-test
commit-type: test
---

# Prefer `it()` over `test()` across the remaining test suites

## Context

The **coding-conventions** skill is explicit: *"Avoid `test('...')` — prefer
`it('...')` so descriptions complete the sentence 'it should …' naturally."*

Most of the suite predates that rule and still uses `test(...)`. PR #72 (accessory
type) converted the three config test files it already touched
(`PlatformConfiguration.test.ts`, `ExternalPlatformConfig.test.ts`,
`SoundTouchDeviceConfiguration.test.ts`) to keep each file internally consistent.
A reviewer asked to defer the rest to its own change rather than expand the
feature PR's scope — hence this plan.

This is a **pure mechanical, no-behaviour-change** sweep of the remaining files.
No production code is touched; no release is cut (`test:` → no version bump).

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-20 | Do the sweep as a standalone `test:`-typed PR, not inside the feature PR | Keeps the accessory-type PR's diff focused on the feature; a convention sweep touching ~21 files would bury it | Bundling into #72 (noisy diff, mixes feature + chore) |
| 2026-06-20 | Convert whole files, not just individual blocks | A file mixing `it`/`test` is worse than either alone; convert each file fully | Leaving partial conversions |
| 2026-06-20 | Scope = the 21 files still on `test(` after #72 merges | The 3 config files were already converted in #72 | Re-touching the 3 already done (no-op churn) |
| 2026-06-20 | Only the call name changes — keep existing description strings as-is | They already read as behaviour (`'creates a room-type configuration'`); they complete "it …" fine. Renaming descriptions is a separate, judgement-heavy task | Rewriting descriptions in the same pass (scope creep, review burden) |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

Test files only — no `src` production code. The files still using `test(` after
#72 (run `rg -l '\btest\(' src` to confirm the live list before starting):

- `src/utils/__tests__/FormattedLogger.test.ts`
- `src/devices/SoundTouch/api/__tests__/*.test.ts` (api, art, bass,
  bass-capabilities, component, connection-status-info, content-item, error,
  group, info, member, network-info, now-playing, preset, source, time, volume,
  zone)
- `src/devices/SoundTouch/api/utils/__tests__/array-compact-map.test.ts`
- `src/devices/SoundTouch/api/utils/__tests__/xml-element.test.ts`

Per file, two mechanical edits:
1. Import: `{ describe, expect, test }` → `{ describe, expect, it }` (drop `test`,
   add `it`; preserve any other named imports like `jest`, `beforeEach`).
2. Calls: every `test(` → `it(`.

Watch for `test.each` / `test.skip` / `test.only` — none exist today (verified
2026-06-20), but re-check before a blind replace; they'd become `it.each` etc.

## Conventions for this change

- **Commit type:** `test:` → **no release**.
- **Config schema touched:** no.
- **Tests to add/update:** none — this *is* the test change; the assertion bodies
  are untouched so the suite must stay green with an identical test count.
- Follow **coding-conventions** (the `it()` preference is the whole point) and the
  typecheck+lint+test gate.
- **Target branch:** `dev`. Best landed **after #72 merges** so the two don't
  both edit the three config files (merge-conflict churn).

## Design notes / risks

- Lowest-risk possible change: no production code, no assertion changes. The only
  failure mode is a botched find/replace (e.g. catching `test` inside a string).
  The full `npm test` run with an unchanged pass count is the safety net.
- ESLint may have a `jest/consistent-test-it` rule available; if cheap to enable,
  add it so the convention is enforced going forward rather than re-drifting.
  Treat that as optional follow-up, not a blocker for the sweep.

## Implementation checklist

- [ ] Confirm the live file list: `rg -l '\btest\(' src`
- [ ] Convert each file's import (`test` → `it`)
- [ ] Convert each file's `test(` calls → `it(`
- [ ] Grep to confirm zero `\btest\(` remain under `src`
- [ ] (Optional) enable `jest/consistent-test-it` in `eslint.config.js`

## Verification

- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm test` — same number of tests pass as before the sweep
- [ ] `rg '\btest\(' src` returns nothing

## PR / release notes

- **PR title:** `test: prefer it() over test() across the suite`
- **Targets:** `dev` (no release — `test:` type)
</content>
</invoke>
