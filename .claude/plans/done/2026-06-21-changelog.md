---
feature: Introduce and backfill CHANGELOG.md
status: done # 2026-06-21
date: 2026-06-21
branch: docs/changelog
commit-type: docs
---

# Introduce and backfill CHANGELOG.md

## Context

The repo has no `CHANGELOG.md`. Consumers who want to understand what changed
between versions have to read GitHub Releases or raw git log. A hand-maintained
(but automation-friendly) `CHANGELOG.md` checked in at the repo root gives a
durable, offline-readable history and is the conventional expectation for an npm
package.

Going forward, `semantic-release` does **not** currently write a changelog file
— the `.releaserc.json` uses only the `commit-analyzer`, `release-notes-generator`,
`npm`, and `github` plugins. The generator plugin writes notes to GitHub Releases
but never touches the filesystem. We need to decide whether to:

1. **Keep the status quo** (GitHub Releases = source of truth) and add a
   static, hand-curated backfill that is updated manually on each release, or
2. **Add `@semantic-release/changelog`** to `.releaserc.json` so that
   `semantic-release` auto-writes and commits `CHANGELOG.md` on every future
   release.

Option 2 is the right call: it keeps the file accurate without manual discipline.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-21 | Use `@semantic-release/changelog` + `@semantic-release/git` to auto-write CHANGELOG.md on release | Eliminates manual discipline; consistent with semantic-release's own docs | Hand-curating after every release — too easy to forget |
| 2026-06-21 | Plugin order: changelog → npm → git → github | `@semantic-release/git` must come after `npm` so the version bump is already in `package.json` before the commit; `changelog` must come before `git` so the file exists to commit | Other orderings leave files untracked or the commit malformed |
| 2026-06-21 | Backfill covers all tagged releases: v0.2.3, v0.2.4, v0.3.0-beta.1, v0.3.0-beta.2, and the unreleased `dev` changes | Tags are `v0.2.3` (2025-04-27), `v0.2.4` (after #45), `v0.2.4-beta.*` (ci experiments), `v0.3.0-beta.1`, `v0.3.0-beta.2` | Skipping pre-releases would lose meaningful feat/fix context |
| 2026-06-21 | Backfill is written by hand (not generated) | Only user-facing feat/fix/perf entries belong; no chore/docs/ci noise; generated output would need the same pruning anyway | `conventional-changelog` CLI — still requires post-editing |
| 2026-06-21 | `commit-type: docs` → no release triggered | This is purely an infra/docs change; no version bump warranted | `chore:` — equivalent, but docs is more accurate |
| 2026-06-21 | `@semantic-release/git` assets: `["CHANGELOG.md", "package.json"]` | Commits both the updated changelog and the version bump together; matches semantic-release convention | Committing only CHANGELOG.md — leaves package.json bump out of the commit |
| 2026-06-21 | Branch type: planning branch (`docs/changelog`) | No production code changes; CHANGELOG.md and .releaserc.json are both documentation/tooling | Implementation branch — wrong because there is no feature code to deliver |
| 2026-07-09 | Plan completed | Commit `47c5e97` introduced `CHANGELOG.md`, semantic-release changelog/git plugins, and the dev dependencies on 2026-06-21 | Leaving plan in active `in-progress` state |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

- `CHANGELOG.md` — new file at repo root (backfilled, then auto-maintained)
- `.releaserc.json` — add `@semantic-release/changelog` and `@semantic-release/git` plugins
- `package.json` — add `@semantic-release/changelog` and `@semantic-release/git` as devDependencies

## Conventions for this change

- **Commit type:** `docs:` → no release
- **Config schema touched:** no
- **Tests to add/update:** none (tooling-only change)
- **Target branch:** `dev` (squash-merged; PR title is the released commit message)

## Implementation checklist

- [x] Install `@semantic-release/changelog` and `@semantic-release/git` as devDependencies
- [x] Update `.releaserc.json`: add plugins in order — `changelog`, then `git` (after `npm`)
- [x] Write backfilled `CHANGELOG.md` covering all tagged releases (user-facing entries only)
  - [x] `## [Unreleased]` — dev commits since v0.3.0-beta.2 (feat/fix only)
  - [x] `## [0.3.0-beta.2]`
  - [x] `## [0.3.0-beta.1]`
  - [x] `## [0.2.4]`
  - [x] `## [0.2.3]` — initial stable release (no prior public changelog)
- [x] Verify `.releaserc.json` is valid JSON and semantic-release dry-run passes locally (or trust CI)

## Verification

- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm test`
- [x] Confirm `npx semantic-release --dry-run` does not error on the new plugin config (requires `GITHUB_TOKEN` + `NPM_TOKEN` in env, so CI verification is acceptable)

## PR / release notes

- **PR title (Conventional Commit, becomes the released commit message):**
  `docs: introduce CHANGELOG.md and wire semantic-release to maintain it`
- **Targets:** `dev`
