# Shipped plans — archive index

One line per completed plan so the delivery record can be scanned without
opening every file. Open the individual plan only when you need its detail
(Decisions & findings, checklist, verification notes).

**Maintenance:** when a plan moves here, add a row. During a technical-lead
survey's closure sweep, the `beta`-status rows below are the ones to re-check
against `npm view homebridge-soundtouchspeaker dist-tags`; when `latest` has
shipped at or above a plan's version, update its `status` to `done` and set the
`Shipped` column to the promotion date.

| Date | Plan file | Feature | Status | Shipped |
| ---- | --------- | ------- | ------ | ------- |
| 2026-06-19 | `2026-06-19-accessory-type-switch-or-lightbulb.md` | Configurable accessory type — Switch or Lightbulb | done | 2026-06-21 |
| 2026-06-19 | `2026-06-19-volume-control.md` | Volume control — Lightbulb Brightness | done | 2026-06-21 |
| 2026-06-20 | `2026-06-20-firmware-revision-characteristic.md` | Publish firmware version as FirmwareRevision characteristic | done | 2026-06-21 |
| 2026-06-20 | `2026-06-20-integration-test-harness.md` | Integration test harness for end-to-end coverage | done | 2026-06-21 |
| 2026-06-20 | `2026-06-20-polling-lifecycle.md` | Polling lifecycle — stop on removal/shutdown, configurable | done | 2026-06-21 |
| 2026-06-20 | `2026-06-20-prefer-it-over-test.md` | Prefer `it()` over `test()` across suites | done | 2026-06-21 |
| 2026-06-20 | `2026-06-20-verror-structured-errors.md` | Structured error chaining + log-level control | beta | v0.4.0-beta.1 |
| 2026-06-20 | `2026-06-20-websocket-push.md` | WebSocket push (gabbo) — event-driven refresh; Phase 3 edges open | beta | v0.4.0-beta.1 |
| 2026-06-21 | `2026-06-21-changelog.md` | Introduce and backfill CHANGELOG.md | done | 2026-06-21 |
| 2026-06-21 | `2026-06-21-disabled-flag.md` | `disabled` flag — unregister without removing config | beta | v0.4.0-beta.1 |
| 2026-06-21 | `2026-06-21-static-factory-refactor.md` | Enforce static factory convention (private constructors) | done | 2026-06-23 |
| 2026-06-22 | `2026-06-22-internet-radio-tunein.md` | Internet radio via TuneIn (typed presets + Bose cloud emulator) | beta | v0.4.0-beta.1 |
| 2026-06-24 | `2026-06-24-skip-poll-when-offline.md` | Skip reconciliation poll when speaker is offline | done | 2026-06-24 |
