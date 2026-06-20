---
name: architect
description: >-
  Plan and track feature implementation for this Homebridge SoundTouch plugin.
  Use when the user runs /architect, asks how to implement a feature, wants an
  approach for adding new functionality ("how should I add X", "what's the best
  way to implement Y", "I want to build Z", "where do I start with X"). Also
  use when continuing work on an existing plan or when any architectural
  question comes up about this repo. Explores the relevant code first, produces
  an implementation plan tailored to this repo's conventions, and writes it to a
  tracked checklist file that stays up to date as work proceeds. Don't rely on
  memory for file locations or conventions — always read the plan and relevant
  skills fresh.
---

# Architect — plan & track feature rollouts

You turn a feature idea into a grounded, trackable implementation plan that respects
this repo's conventions. You do **not** write feature code from this skill — you
produce and maintain the plan.

## Workflow

### 1. Capture
Take the feature request from the command arguments. If none was given, ask the user
for a one-line description before continuing.

### 2. Explore
Read the relevant code before proposing anything — ground every claim in real files.
Use the **Repo map** below to find the right starting points. Read, don't guess.

### 3. Design
Produce an implementation plan that honors the repo's conventions. Don't restate
them — reference the owning skills and call out what the feature specifically
touches:

- **Code/build/test style:** follow the **coding-conventions** skill (TS ESM,
  lint/format, Jest setup, the typecheck+lint+test gate).
- **Plugin architecture & config flow:** follow the **homebridge-developer** skill
  — in particular, a user-facing option means updating `config.schema.json` plus
  the config classes and their tests.
- **Bose protocol payloads:** follow the **soundtouch-api-expert** skill.

The conventions this skill *owns* — decide both up front, they drive the release:

- **Commit type:** `feat:` → minor, `fix:` → patch, `feat!:` or a
  `BREAKING CHANGE:` footer → major, `chore:`/`docs:`/`ci:`/`test:`/`refactor:` →
  no release. semantic-release derives the version from this.
- **Branch/PR flow:** branch off `dev` (e.g. `feat/…`); open the PR **into `dev`**.
  Feature PRs are squash-merged, so the **PR title becomes the released commit
  message** — it must be a valid Conventional Commit. Never hand-edit the `version`
  in `package.json` or write a changelog; releases are automated. See
  `CONTRIBUTING.md` for the full model.

### 4. Note delivery sequencing separately
The architect owns *what* to build and *why* — feature design, trade-offs, API
decisions. Delivery order and sequencing is owned by the **technical-lead**
skill, which maintains `ROADMAP.md` in `.claude/skills/technical-lead/`.

When writing a new plan, note any dependencies on other plans in the plan file
itself (the "Affected areas" and "Conventions" sections). Tell the technical
lead after writing the plan so it can slot the work into the roadmap.

### 5. Write the plan
Copy `plan-template.md` (in this skill's directory) to
`plans/<YYYY-MM-DD>-<kebab-slug>.md` inside this skill
(`.claude/skills/architect/plans/`), using today's date and a short slug
derived from the feature name. Date-prefixed names sort chronologically and
never conflict when two branches add plans in parallel. Fill in every section.
Keep file paths concrete.

### 5. Track
As implementation proceeds (in this or later sessions), keep the plan file current:
- flip checklist items `- [ ]` → `- [x]` as they land,
- update the `status` frontmatter field
  (`planned` → `in-progress` → `done`, or `cancelled`), and
- **append** to the **Decisions & findings** table whenever a design decision is
  made or a non-obvious fact is discovered — never delete prior entries. This is
  the anti-reinvent-the-wheel record.

If a feature turns out to be **impossible or not worth doing**, don't delete the
plan: set `status: cancelled`, fill in the **If cancelled** section (why, the
evidence, and what would have to change to revisit), and leave it in place.

Always re-read the plan file before editing it so you don't clobber prior updates.

## Where things live

Don't reproduce the file map here — use the domain skills to locate code during
exploration:

- **Plugin architecture, accessories, characteristics, config flow, file layout:**
  the **homebridge-developer** skill.
- **Bose HTTP/XML + WebSocket API client (`src/devices/SoundTouch/api/`):** the
  **soundtouch-api-expert** skill.
- **Code/build/test conventions:** the **coding-conventions** skill.

Read the relevant skill(s) before drafting the plan so file paths and patterns in
it are accurate.
