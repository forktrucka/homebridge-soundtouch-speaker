---
feature: Key zone primary/slave assignment by stable device id, not a mutable name
status: in-progress # planned | in-progress | beta | done | cancelled
date: 2026-07-18
branch: fix/zone-stable-device-id # branched off dev
commit-type: fix
---

# Key zone membership by stable device id

## Context

`_resolveZones()` in `src/platform.ts` resolves a zone's configured `primary` /
`slaves` references to live `SoundTouchDevice` objects **by pure name-string
equality** — `_findDeviceByName(name)` returns
`this._discoveredDevices.find((device) => device.name === name)`
(`src/platform.ts` line 302-304). That `device.name` is the *mutable* display
name: `SoundTouchDevice.fromDiscoveredAccessory()` sets
`name: accessoryConfig.name || info.name` (`SoundTouchDevice.ts` line 203, 212)
— i.e. either a config-file `accessories[].name` override or the device's own
reported name (which a user can change from the Bose app).

`device.id`, by contrast, is `info.deviceId` (`SoundTouchDevice.ts` line 213) —
the speaker's MAC address, a stable hardware identifier resolved from the
`/info` call, independent of any name resolution. It is already treated as the
authoritative key everywhere else: speaker accessory UUIDs are
`uuid.generate(device.id)` and `existingAccessory.context.deviceId = device.id`
(`src/platform.ts` line 184, 199, 218).

**The bug:** if a speaker's name changes for any reason — the config `name`
override is edited, or the device's reported name changes — the zone's
`primary`/`slaves` references silently stop matching. `_resolveZones()` logs a
`warn` and skips that primary / slave / whole zone (`src/platform.ts` lines
310-333), and on the next discovery pass the now-unresolved zone accessory is
pruned and unregistered — it **silently vanishes from the Home app** with no
clearly-actionable signal.

This is the exact same class of bug the just-shipped
`plans/2026-07-18-preserve-homekit-rename.md` (PR #167) fixed one layer up:
HomeKit's `Name` characteristic was being reverted on restart because the plugin
re-asserted a config-derived value instead of treating a stable identifier
(`SerialNumber` = `device.id`) as authoritative and letting the display name
vary independently. Zone config has the identical structural flaw: it should be
keyed by the same stable `device.id`, not a name string that can change out from
under it.

**Why now:** the PWA's Phase 2 (group management,
`plans/2026-06-19-progressive-web-app.md`) will let users manage zone/group
assignments — and rename speakers — through a UI. If zone assignment stays
name-keyed, that UI would silently orphan zones the same way HomeKit renames
used to. This should land **before** PWA Phase 2 so Phase 2 builds on the
corrected identifier model rather than inheriting the fragile one.

**The crux design tension (deliberately resolved, not left open):** an earlier
zones decision already rejected keying config by raw identifier —
`plans/2026-06-21-speaker-zones.md` Decisions row 2026-06-21: *"Require IP-based
slave reference (worse UX for users who use room-based discovery)"*. A MAC
address is not something a typical user knows off-hand, and Config UI X's
`oneOf`/dropdown affordances are built around friendly names. So the config
surface must **stay name-authored**; only the internal, persisted runtime
relationship becomes id-keyed. See the Decisions table for the chosen shape.

## Decisions & findings

The durable record so we don't re-litigate decisions or re-investigate facts.
**Append, don't overwrite.**

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-07-18 | **`device.id` is a stable hardware key available at zone-resolution time; `device.name` is mutable.** `device.id = info.deviceId` (MAC), set independently of any name logic; `device.name = accessoryConfig.name \|\| info.name`. Every `SoundTouchDevice` in `_discoveredDevices` already carries `.id`, and `_resolveZones()` runs after that list is populated. | `SoundTouchDevice.ts` lines 203, 212-213; `platform.ts` line 234 pushes each device into `_discoveredDevices` before `_resolveZones()` (line 240). | — |
| 2026-07-18 | **Chosen shape: config stays name-authored; the platform resolves names → `device.id` once at startup and *persists* the resolution in the zone accessory's `context`.** On later startups, resolution is **name-match first, persisted-id fallback second**: if the configured name still matches a live device, use it and refresh the persisted id; if it no longer matches (rename happened), fall back to the persisted id — so a rename does not require the user to also edit `zones[].primary`/`slaves`. | Mirrors the established `existingAccessory.context.deviceId` pattern for speaker accessories (`platform.ts` line 199, 218), which Homebridge persists automatically in cachedAccessories. Keeps the human-facing config exactly as the 2026-06-21 UX rejection demanded (friendly names), while making the runtime wiring id-keyed. Name-match-first preserves intentional re-pointing (edit the config name to aim a zone at a *different* speaker → resolves to the new device and re-persists). | (a) **Change the schema to require MAC/id in config** — reintroduces the exact UX regression rejected 2026-06-21; users don't know MACs; Config UI X dropdowns are name-oriented. (b) **Persist the resolution into `config.json`** — requires a config write path (Spike B, unresolved) and violates the repo's "no file writes without explicit permission" rule (MEMORY). `accessory.context` is the correct, already-used, auto-persisted store. (c) **Id-fallback first, name second** — would ignore a deliberate config re-point. |
| 2026-07-18 | **Persisted context shape: `accessory.context.memberDeviceIds: Record<string, string>` mapping each config reference string (the primary string and each slave string) → resolved `device.id`.** Merge-on-write: `context.memberDeviceIds = { ...persisted, ...newlyResolved }`. | Keying by the exact config string (not by list position) is stable across slave reordering and additions, and makes an *edited* slave string naturally fall through to name-resolution (no persisted entry for the new string → correct, since editing the string is an intentional change). Merging preserves the mapping for a device that is transiently offline during one discovery pass, so it can recover on a later pass instead of being permanently forgotten. | Position-indexed `slaveDeviceIds: string[]` (fragile — reordering/inserting a slave misaligns the mapping); overwrite-not-merge (drops a temporarily-offline device's mapping permanently). |
| 2026-07-18 | **Zone-name rename is out of scope and expected to re-resolve by name.** The zone accessory UUID is `uuid.generate('zone::' + zoneConfig.name)` (`platform.ts` line 345), so renaming the *zone itself* produces a new accessory with empty `context` → falls back to name resolution for its members (which still works). The persistence protects against **speaker** renames, not zone renames. | The zone name is the accessory identity, not a member reference; changing it is a deliberate act that legitimately creates a new accessory (documented behavior since 2026-06-21). | Trying to migrate context across a zone rename (no stable key to migrate from; over-engineering). |
| 2026-07-18 | **Orthogonal to 1c (zone default source, #166) and 1e (zone state reconciliation, #165).** Both consume `primary`/`slaves` as already-resolved `SoundTouchDevice` objects handed to `SoundTouchZoneOnCharacteristic`/`SoundTouchZoneAccessory` — this change only alters the *resolution step* inside `_resolveZones()`/`_registerZoneAccessory()`; the `SoundTouchDevice` instances passed downstream are byte-for-byte the same. It does **not** edit `SoundTouchZoneOnCharacteristic.ts` or `SoundTouchZoneVolumeCharacteristic.ts` (the files 1c/1e serialize on), so it does not need to serialize with them. | `_registerZoneAccessory()` passes `primary`/`slaves` (SoundTouchDevice) into `SoundTouchZoneAccessory.create()` (`platform.ts` line 363-369); those characteristics never see the config strings. | — |
| 2026-07-18 | **Migration is non-breaking with no user action.** Existing installs have `zones[]` by name and no persisted `memberDeviceIds` yet. First run after upgrade: names still match → resolve by name → persist ids. Zero config change required. | The fallback is additive: name-match is tried first and still works for every currently-valid config, so nothing regresses; persistence just accrues silently. | A migration/upgrade script (unnecessary — the name-first path *is* the migration). |
| 2026-07-18 | **Known migration limitation (documented, not fixed here):** an install whose zone name reference is *already broken* before upgrading (rename happened pre-upgrade, no context persisted yet) still can't self-heal on the first post-upgrade run — there is no persisted id to fall back to. The user fixes the name once; it is durable thereafter. | The fallback needs at least one successful name-resolution to seed the persisted id. Cannot recover history that was never recorded. | Attempting fuzzy/heuristic name matching (unreliable, could mis-bind to the wrong speaker). |
| 2026-07-18 | **Unresolvable-member handling (the "why did my zone disappear" signal).** (1) Primary unresolvable by *both* name and persisted id → the zone cannot function (no master) → keep the existing `warn` and skip; a zone with no master has nothing to drive. (2) Some slaves unresolvable but primary + ≥1 slave resolve → register the zone with the resolvable members and `warn` per missing slave (matches today's partial behavior). The `warn` message is upgraded to name the zone, the missing reference, and state that a previously-grouped device is no longer discoverable (device replaced/reset/offline). | Mirrors the `homebridge-developer` "catch and log own errors" convention. A `warn` is judged sufficient: there is no clean HAP "misconfigured/faulted" state for a Switch, and throwing `HapStatusError` from the characteristic get would make the tile show "No Response" without explaining why. Escalation is explicitly considered and deferred. | (a) Throwing `HapStatusError` to force a visible "No Response" tile — no room to convey the cause, and scope creep. (b) Keeping a fully-unresolvable (no primary) zone registered as a dead tile — misleading; a master-less zone can do nothing. Both recorded as considered-and-deferred so a future session can revisit if warns prove too quiet in practice. |
| 2026-07-18 | **`fix:` commit type → patch.** Corrects fragile behavior in an already-shipped feature (zones silently orphan on speaker rename); no new user-facing config field (schema field *types* unchanged — only description text clarifies rename tolerance). | Same class and reasoning as the preserve-homekit-rename fix (`fix:`, PR #167). | `feat:` (no new capability or config field); `chore:`/`refactor:` (user-visible correctness fix, not internal-only). |
| 2026-07-18 | **Persist-on-change write site chosen: inside `_registerZoneAccessory()`, immediately after the accessory (new or restored) is resolved**, comparing the merged `memberDeviceIds` against whatever is already on `accessory.context.memberDeviceIds` via a small `memberDeviceIdsEqual()` helper (order-independent shallow compare). `_resolveZones()` now also does its own uuid/`existingAccessory` lookup up front (needed to read `persistedIds` before resolving), so `_registerZoneAccessory()` takes `uuid` + `existingAccessory` as params instead of re-deriving them — avoids a duplicate cache lookup as the plan allowed. | Mirrors the existing speaker-accessory `contextChanged` pattern at the site that already owns the accessory object for both the new- and restored-accessory branches. | Persisting inside `_resolveZones()` before the accessory object exists (new-accessory case) would require passing the not-yet-created accessory back out, or a second lookup — more plumbing for no benefit. |
| 2026-07-18 | **Test-harness finding (not a design decision, but worth recording so a future session doesn't re-discover it): `Logger.warn(string)` forwards to `homebridgeLogger.log(LogLevel.WARN, message, ...)`, not `homebridgeLogger.warn(...)`.** Unit tests asserting on zone warn messages must inspect the `homebridgeLogger.log` mock's calls filtered to `LogLevel.WARN` (`'warn'` in the manual mock), not `homebridgeLogger.warn` directly — the latter is present on the stub but never invoked by the formatted logger for plain-string warnings. | Discovered when the resolution-tier unit tests initially asserted `homebridgeLogger.warn` and got 0 calls; confirmed via `src/utils/FormattedLogger.ts` `warn()`/`log()`. | — |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

Concrete files/dirs this touches.

### Platform resolution (the core change)

- `src/platform.ts`
  - Add `_findDeviceById(id: string): SoundTouchDevice | undefined` —
    `this._discoveredDevices.find((d) => d.id === id)`.
  - Rework `_resolveZones()` so that, per zone, it computes the zone UUID and
    looks up the existing cached accessory (currently done only inside
    `_registerZoneAccessory()`), reads
    `existingAccessory?.context.memberDeviceIds`, and resolves each config
    reference via a helper that is **name-match first, persisted-id fallback
    second**, recording every successful resolution into a fresh
    `Record<string,string>`.
  - Persist the merged `{ ...persisted, ...resolved }` back onto
    `accessory.context.memberDeviceIds` and call
    `this.api.updatePlatformAccessories([accessory])` when it changed (mirror the
    `contextChanged` pattern at `platform.ts` line 195-212).
  - Upgrade the three unresolved-member `warn` messages (lines 310-333) to name
    the zone + missing reference and note the device is no longer discoverable.
  - Thread the already-resolved `existingAccessory` (or its uuid) into
    `_registerZoneAccessory()` to avoid a second cache lookup, or persist inside
    `_registerZoneAccessory()` after it resolves the accessory — pick whichever
    keeps the persist-on-change write at the single site that owns the accessory
    object. Keep the `_findDeviceByName` primary path intact (do not delete it —
    it is now the first resolution tier).

### Config (schema description only — field shape unchanged)

- `config.schema.json` `zones[].primary` / `zones[].slaves` descriptions — add a
  sentence clarifying that a speaker may be renamed later without breaking the
  zone (the assignment is remembered by the speaker's stable identity). **No
  change to field types** — they stay name strings. This satisfies the
  2026-06-21 friendly-name UX requirement.
- `src/ExternalPlatformConfig.ts` / `src/PlatformConfiguration.ts` — **no shape
  change.** `ZoneConfig`/`ZoneConfiguration` keep `primary: string` /
  `slaves: string[]`. (Confirm no validation change is needed; the persisted
  `memberDeviceIds` lives in accessory context, not config.)

### Tests

- **Extend platform-level coverage / add a focused new test** for
  `_resolveZones()` resolution tiers:
  - Fresh config, no persisted context → resolves by name, persists ids into
    `accessory.context.memberDeviceIds`.
  - Speaker renamed (config `name` or device-reported name differs from the zone
    reference) **but** persisted context present → resolves via the persisted id,
    zone still registers.
  - Config re-pointed to a different live speaker (name now matches device B) →
    resolves to B and re-persists B's id (name-first wins).
  - Member truly gone (neither name nor persisted id resolves): primary gone →
    zone skipped with the upgraded warn; one slave gone → zone registers with the
    remaining members and warns for the missing one.
  - Persisted-id merge preserves a transiently-absent device's mapping across a
    pass where it wasn't discovered.
- **Integration (load-bearing proof):**
  `src/__integration__/zone-rename.integration.test.ts` (new, or extend
  `zone-lifecycle.integration.test.ts`) — run `discoverDevices()` once to
  register a zone (ids persisted), then re-run `discoverDevices()` with the
  primary/a slave reporting a **changed name**, and assert the zone accessory is
  **still registered and functional** (resolved via persisted id) rather than
  pruned. This is the cross-restart scenario a unit test can't cover; reuse the
  integration helpers noted in `plans/2026-06-21-speaker-zones.md`
  (`FakeSoundTouchServer`, `StubCharacteristic`).

## Conventions for this change

- **Commit type:** `fix:` → **patch** release.
- **Config schema touched:** description text only — no field-shape change, so no
  `ExternalPlatformConfig`/`PlatformConfiguration` shape edits and no new config
  round-trip tests (confirm during implementation).
- **Tests to add/update:** `_resolveZones()` resolution-tier unit coverage + a
  zone-rename integration scenario (see Affected areas).
- **Target branch:** `dev` (squash-merged; PR title is the released commit
  message).
- **ESM import rule:** any new relative imports in tests/source end in `.js`
  (`plugin-coding-conventions`).
- **Domain skills to re-read before implementing:** `homebridge-developer`
  (accessory `context` persistence + cache-restore lifecycle,
  `updatePlatformAccessories`), `plugin-coding-conventions` (Jest + homebridge
  mock, static-factory props, the typecheck+lint+test gate). No `soundtouch-api`
  payload work — this is pure platform-resolution plumbing.

## Dependencies / sequencing (for the technical lead)

- **Builds on** merged Speaker zones (#162) — needs `_resolveZones()`,
  `_registerZoneAccessory()`, and the zone accessory `context` to exist.
- **Orthogonal to** 1c (zone default source, #166) and 1e (zone state
  reconciliation, #165): those edit `SoundTouchZoneOnCharacteristic.ts` /
  `SoundTouchZoneVolumeCharacteristic.ts`; this edits only `platform.ts`
  resolution. No shared-file serialization needed with them. (It does not touch
  `_isZoneActive()` or the characteristics.)
- **Sequence ahead of PWA Phase 2** (group management): Phase 2 should build on
  the id-keyed model so its rename/group-edit UI can't silently orphan zones.
  Recorded in `ROADMAP.md` as item 1f with a Phase-2 coupling note.

## Implementation checklist

- [x] Add `_findDeviceById()` to `src/platform.ts`
- [x] Rework `_resolveZones()` to resolve name-first / persisted-id-fallback and
      read `existingAccessory.context.memberDeviceIds`
- [x] Persist merged `memberDeviceIds` to accessory context +
      `updatePlatformAccessories` on change (single write site)
- [x] Upgrade the unresolved-member `warn` messages
- [x] Confirm no config-shape change needed; update `config.schema.json`
      descriptions only
- [x] Add `_resolveZones()` resolution-tier unit tests
- [x] Add the zone-rename integration scenario (persisted id survives a rename)
- [x] `npm run typecheck && npm run lint && npm test`
- [x] `npm run knip` — confirm no unused exports introduced

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run watch` — real device: create a zone, confirm it activates; then
      rename a member speaker (via config `name` **and**, separately, via the
      Bose app so `info.name` changes), restart Homebridge, and confirm the zone
      **still works** and did not disappear. Then confirm re-pointing a zone to a
      different speaker by editing the config name still takes effect. Finally,
      power off / remove a member entirely and confirm the upgraded warn is
      emitted (and, for a partial loss, the zone still registers with the
      remaining members).

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `fix: keep zone membership stable when a speaker is renamed`
- **Targets:** `dev`
