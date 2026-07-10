---
feature: Plan-doc hygiene, roadmap fixes, and TuneInClient dead-code removal
status: in-progress # PR #145 open
date: 2026-07-10
branch: chore/plan-hygiene-dead-code
commit-type: fix
---

# Plan-doc hygiene, roadmap fixes, and TuneInClient dead-code removal

## Context

The 2026-07-10 plans-vs-source review found doc drift and one piece of dead
code. All items verified against the tree on that date. No behavior changes
except deleting an unused class.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-07-10 | `src/presets/TuneInClient.ts` is dead code — grep shows zero production imports (only its own file and its test reference it). The internet-radio plan (`.claude/plans/done/2026-06-22-internet-radio-tunein.md`) already records it as deleted in the 2026-06-23 pivot; the deletion never happened. `BoseCloudServer._resolveTuneIn` does the TuneIn resolution directly | Delete it + its test, matching the recorded decision | Keeping it for the PWA plan (PWA plan doesn't reference it; resurrect from git if ever needed) |
| 2026-07-10 | Internet-radio plan doc is stale in three ways: claims presets are "hidden from config.schema.json" (false since PR #134 exposed `global.presets`/`presetSyncEnabled`/`presetSyncSchedule`/`server`); names `presetSyncInterval` (ms) where code/schema use `presetSyncSchedule` (cron); omits that the emulator also exists in-source as `src/server/BoseCloudServer.ts` | Append corrections to its Decisions table — don't rewrite history, per the template's "append, don't overwrite" | — |
| 2026-07-10 | Four `status: done` plans have fully unchecked checklists (work verifiably shipped): `2026-06-19-volume-control.md`, `2026-06-19-accessory-type-switch-or-lightbulb.md`, `2026-06-20-prefer-it-over-test.md`, `2026-06-20-firmware-revision-characteristic.md`. `prefer-it-over-test` also has a stray trailing `</content></invoke>` artifact | Add a one-line note under each checklist ("shipped; checklist was not maintained") rather than back-ticking boxes; delete the artifact | Ticking every box retroactively (fabricates a record) |
| 2026-07-10 | Two ROADMAP.md items originally scoped here (nonexistent `plans/cancelled/` reference; missing preset-sync host/port decoupling backlog row) were moved to the `docs/remediation-plans` planning PR | Roadmap edits belong on a planning branch, not an implementation branch, per the technical-lead convention | Bundling roadmap edits into this chore branch (couples planning churn to this PR's review) |
| 2026-07-10 | `PresetManager._msUntilNextCron` (`src/presets/PresetManager.ts:87-103`) parses only minute+hour and ignores day/month/day-of-week | Document the limitation in the `presetSyncSchedule` description in `config.schema.json` rather than implementing full cron | Full cron parsing (unneeded complexity for a daily sync) |
| 2026-07-10 | Superseded: user rejected the doc-only fix — honor the full cron expression instead of silently ignoring fields. Add `croner` (zero runtime/transitive dependencies, 154KB unpacked) as a new dependency and use it to compute next-run time in `_msUntilNextCron`, replacing the hand-rolled minute/hour-only parsing. `cron-parser` and `cron` were also considered but both pull in `luxon` as a transitive dep — `croner` is the only zero-dep option and clears the coding-conventions bar ("zero or one dependency strongly preferred") | User: "if we need to take a dependency on something low-level to resolve the cron expression, that follows our guidelines then we should [do that] rather than having a cron expression and ignoring sections of it" | Custom hand-rolled 5-field parser (more code to own/test for zero dep benefit — user opted for the well-tested library instead) |
| 2026-07-10 | Implemented: `croner@10.0.1` installed (`npm ls croner` confirms zero transitive deps). `_msUntilNextCron` now does `new Cron(schedule).nextRun()` wrapped in try/catch — confirmed empirically the constructor throws (not returns null) on an invalid pattern (`CronPattern: invalid configuration format (...)`), so both the throw path and a `null` return from `nextRun()` fall back to the existing 24h retry. Public signature unchanged, `_scheduleNext` untouched. Added two tests: one asserting `0 3 15 * *` lands on the 15th at 03:00 (was previously firing daily, ignoring the day-of-month field), one asserting the 24h fallback on an unparseable schedule. `presetSyncSchedule` description in `config.schema.json` updated to describe full 5-field support. Full gate green: `typecheck`, `lint`, `test` (330 passed), `knip` (clean, only pre-existing unrelated config hints), `build` | — | — |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

- Delete: `src/presets/TuneInClient.ts`, `src/presets/__tests__/TuneInClient.test.ts`;
  check `src/presets/index.ts` for a re-export to remove
- `.claude/plans/done/2026-06-22-internet-radio-tunein.md` — append corrections
- `.claude/plans/done/2026-06-19-volume-control.md`,
  `…accessory-type-switch-or-lightbulb.md`, `…prefer-it-over-test.md`
  (+ artifact removal), `…firmware-revision-characteristic.md` — checklist notes
- `src/presets/PresetManager.ts` — replace `_msUntilNextCron` internals with
  `croner`-based next-run computation (full 5-field cron support)
- `package.json` — add `croner` runtime dependency
- `config.schema.json` — `presetSyncSchedule` description: describe full cron
  support (standard 5-field syntax), not the minute/hour-only limitation

## Conventions for this change

- **Commit type:** `fix:` → patch release (superseded from `chore:` — the
  cron fix is a real behavior change, not doc-only, so the PR as a whole now
  releases)
- **Config schema touched:** yes (description text only — no shape change, but
  the commit hook runs schema validation)
- **Tests to add/update:** two new `#_msUntilNextCron` tests (day-of-month
  honored; 24h fallback on invalid schedule)
- **Target branch:** `dev` (squash-merged; PR title is the released commit message).

## Implementation checklist

- [x] Read `coding-conventions` skill first
- [x] Delete `TuneInClient.ts` + test; fix any re-export in `src/presets/index.ts`
- [x] `npm run knip` — confirm clean (and fix anything else it flags that
      this deletion exposes)
- [x] Append corrections to the internet-radio done-plan
- [x] Add "shipped; checklist not maintained" notes to the four done-plans;
      remove the `</content></invoke>` artifact from prefer-it-over-test
- [x] Update `presetSyncSchedule` description in `config.schema.json`
- [x] Add `croner` runtime dependency; replace `_msUntilNextCron` internals
      with croner-based next-run computation (full 5-field cron support)
- [x] `npm run typecheck && npm run lint && npm test`

## Verification

- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm test`
- [x] `npm run knip` — no unused exports/files
- [ ] `npm run watch` — not applicable (no runtime behavior change)

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `fix: honor full cron expressions in preset sync schedule`
- **Targets:** `dev`
