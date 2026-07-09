# Session cost calibration

Estimate-vs-actual history for shipped units of work. Its purpose is to sharpen
future session-cost estimates (see the "Session cost estimates" section in
`ROADMAP.md`, and step 5 of `SKILL.md`). This is a historical log — it is not
part of the active delivery sequence and does not need to be read during
routine sequencing. Consult it when sizing a new plan against comparable past
work, and append a row each time a unit ships.

| Date | Plan | Estimate | Actual | Variance / note |
| ---- | ---- | -------- | ------ | --------------- |
| 2026-06-20 | [05] Integration test harness | Medium | Medium–Heavy | HAP stub written from scratch (homebridge mock provides none); polling hardcoded on (neutralised with fake timers). Lesson: budget for stubbing the framework surface when a test exercises framework wiring. |
| 2026-06-20 | [01] Accessory type | Heavy | Heavy | Full session as estimated. Config threading + orphan pruning touched many files; pruning logic needed extra iteration. |
| 2026-06-20 | [02] Volume — Lightbulb path | Small–Medium | Small–Medium | Landed as estimated. Race fix was the main loop; `On`/`Brightness` ordering required a follow-up fix PR (#91). |
| 2026-06-21 | prefer-it-over-test sweep | Small | Small | Landed as estimated. Pure mechanical rename, no iteration needed. |
| 2026-06-23 | Static factory enforcement | Small | Small | Landed as estimated. Typecheck enforced the constructor/factory migration. |
| 2026-06-23 | Disabled flag | Small | Small | Landed as estimated. Config field plus platform skip/unregister branch. |
| 2026-06-23 | Structured errors + logLevel | Medium | Medium | Landed as estimated, but implementation used `AppError` rather than the planned `ContextError` class name. |
| 2026-06-23 | [07] WebSocket push Phase 1/2 | Heavy | Heavy | `GabboClient`, fake-gabbo harness, lifecycle wiring, debounce, and per-event mapping landed across PRs #117/#124/#125. Phase 3 standby/reconnect tuning remains open. |
| 2026-06-25 | [08] Typed preset management | Heavy | Heavy | Landed with a major pivot from `LOCAL_INTERNET_RADIO`/stream proxy to native `TUNEIN` plus a Bose cloud emulator. Manual setup/licensing follow-up remains in the plan. |
