# CLAUDE.md

`homebridge-soundtouchspeaker` — a TypeScript ESM dynamic-platform Homebridge
plugin that controls Bose SoundTouch speakers over their local HTTP/XML +
WebSocket API.

## Branching

All work branches from `dev`. Cut a new branch from the latest `dev` before starting any task:

```sh
git fetch origin dev
git checkout -b <type>/<slug> origin/dev
```

The release branches (`latest` and `beta`) are managed by semantic-release and are never worked on directly.

## Use the skills

This repo's working knowledge lives in `.claude/skills/`. Consult the relevant
skill **before** acting — don't rely on memory for these:

- **plugin-coding-conventions** — read before writing or editing **any** TypeScript
  source or test. Covers the ESM `.js`-import rule (a frequent runtime footgun),
  lint/format, the Jest + SWC setup, logging, and the typecheck+lint+test gate.
- **homebridge-developer** — plugin architecture, accessories, characteristics,
  config flow, local run/debug, and Homebridge verified-plugin compliance.
- **soundtouch-api-expert** — the Bose SoundTouch HTTP/XML + WebSocket protocol
  and how it maps to `src/devices/SoundTouch/api/`.
- **plugin-architect** (`/plugin-architect`) — plan and track a new feature; owns the
  branching/release flow (conventional commits, semantic-release
  `dev`→`beta` and `dev`→`latest`). See also `CONTRIBUTING.md`.
- **plugin-technical-lead** — surveys the roadmap and plans, identifies the next
  unblocked item, resolves/surfaces blockers, and produces engineering briefs.
  Can brief multiple engineers in parallel when work is independent.
- **plugin-engineer** — receives a brief from the technical lead and implements it:
  reads domain skills, follows TDD, creates a branch, and delivers a tested PR.
