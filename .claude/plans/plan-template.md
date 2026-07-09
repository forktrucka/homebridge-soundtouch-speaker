---
feature: <one-line feature name>
status: planned # planned | in-progress | beta | done | cancelled
date: <YYYY-MM-DD>
branch: <feat/…, branched off dev>
commit-type: <feat | fix | feat! | chore | docs | ci | test | refactor>
---

# <Feature name>

## Context

Why this change is being made — the problem or need it addresses and the intended
outcome.

## Decisions & findings

The durable record so we don't re-litigate decisions or re-investigate facts.
**Append, don't overwrite** — keep entries even after they're acted on. Capture
each design decision (and the alternative rejected), and each non-obvious fact
discovered while exploring the code/device.

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| <YYYY-MM-DD> | <what was decided or learned> | <why / where it came from> | <what we chose against, and why> |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

Why this feature was abandoned or isn't possible, the evidence for that
conclusion, and what would have to change to revisit it. Recording a dead end is
a deliverable — it stops the next person re-attempting it.

## Affected areas

Concrete files/dirs this touches (pull from the repo map):

- `src/...` — what changes here

## Conventions for this change

- **Commit type:** `<type>:` → <release impact: major/minor/patch/none>
- **Config schema touched:** <yes/no> — if yes, update `config.schema.json`,
  `src/PlatformConfiguration.ts` / `src/ExternalPlatformConfig.ts`, and their tests.
- **Tests to add/update:** `src/.../__tests__/...test.ts`
- **Target branch:** `dev` (squash-merged; PR title is the released commit message).

## Implementation checklist

- [ ] Step 1
- [ ] Step 2
- [ ] Add/update tests
- [ ] Update `config.schema.json` (if user-facing config changed)

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run watch` — live Homebridge test of the behavior

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `<type>: <imperative summary>`
- **Targets:** `dev`
