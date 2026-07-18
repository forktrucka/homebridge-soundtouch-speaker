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
| 2026-07-18 | [1b] Power-on resume last-played source | Medium | Medium | Landed as estimated (#161). Real-device verification against a live speaker caught the response shape assumption early: `/recents` nests lowercase `<contentItem>`, not the capitalized `<ContentItem>` used elsewhere — would have been a silent permanent no-op on real hardware if shipped unverified. Lesson: don't trust an undocumented response shape by analogy to a similar endpoint; verify against a real device when one is available. |
| 2026-07-18 | [1] Speaker zones | Heavy | Heavy+ (multiple follow-up sessions in one) | Core plan landed as estimated, but real-hardware testing during the same session surfaced four additional real bugs beyond the original scope, all fixed and shipped in the same PR (#162) before merge: (1) `setZone` succeeds even when a device is in standby, producing no audible effect — needed an explicit power-on/off step; (2) powering a device via the zone bypassed its own standalone accessory's characteristics, leaving its HomeKit tile stale for up to 5 minutes; (3) `pressKey` (zero-gap press+release) silently fails to toggle POWER on real hardware — needed a deliberate `holdKey` duration; (4) added zone volume control (relative-offset model) as a user-requested extension of the already-planned-but-deferred lightbulb `accessoryType`. Lesson: a "Heavy" real-device-integrating feature should budget for a second Heavy-equivalent pass of live-hardware bug fixing beyond the original implementation — none of these four issues were discoverable by unit/integration tests against the fake SoundTouch server, only by exercising real devices. Two further follow-up items (zone state reconciliation, HomeKit rename preservation) were scoped out to their own plans (1d, 1e) rather than absorbed into this session. |
