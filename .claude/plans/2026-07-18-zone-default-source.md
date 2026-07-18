---
feature: Zone default source — play a configured source when a zone is activated idle
status: in-progress # PR opened against dev, awaiting review/merge; real-device verification still pending
date: 2026-07-18
branch: feat/zone-default-source # branched off dev AFTER speaker-zones (#162) merges
commit-type: feat
---

# Zone default source

## Context

The **Speaker zones** feature (`2026-06-21-speaker-zones.md`, PR #162, currently
unmerged) adds a `zones[]` config array and a single HomeKit accessory per zone.
Activating the zone calls `setZone(...)` on the primary so it streams in sync to
its slaves; deactivating dissolves the group. PR #162 also gained a follow-up fix
that powers the primary **and** its slaves on/off as part of zone
activate/deactivate.

That leaves one gap: **what plays when you activate a zone and nothing is already
playing.** Today, if the primary is idle (or was just powered on by the zone
activation), grouping the slaves produces silence — the user still has to go pick
a source on the primary. This plan adds an optional per-zone **default source**:
when the zone is activated and the primary has nothing meaningful playing, the
plugin selects the configured source on the primary before grouping, so the whole
zone comes up playing immediately.

This must **compose** with two existing behaviors rather than fight them:

1. **The primary's own `resumeLastPlayedSource`** (shipped in #161,
   `SoundTouchSpeakerOnCharacteristic.setOn`) — powering the *primary speaker's*
   own HomeKit "On" tile resumes its last-played source from `/recents`.
2. **The zone power-on/off fix** on PR #162 — zone activate powers primary +
   slaves on; zone deactivate powers them off.

## Decisions & findings

The durable record so we don't re-litigate decisions or re-investigate facts.
**Append, don't overwrite.**

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-07-18 | **Default source value = a preset-slot reference on the primary** (`{ type: 'preset', slot: 1–6 }`), not a hand-authored `ContentItem`. | The friendliest, least error-prone shape and the one that matches this repo's existing config patterns: `PresetConfig` (`src/ExternalPlatformConfig.ts`) is already a `type`-discriminated config object keyed by a `slot` (1–6). Resolution reuses the proven path `api.getPresets()` → `api.selectSource(preset.contentItem)` (same `selectSource(contentItem)` the source-selection plan builds on). Presets live on the primary, which is exactly the device the zone streams from. | (a) **Inline `ContentItem`** (`{ source, sourceAccount?, location? }`) — users hand-authoring `source`/`sourceAccount`/`location` is a foot-gun (typos silently produce a failed `/select`); deferred, see next row. (b) Reference by preset *name* — brittle vs. the numeric slot the device actually indexes. |
| 2026-07-18 | **v1 ships the `preset` variant only**, but `defaultSource` is modeled as a `type`-discriminated union so an inline-`ContentItem` variant (`type: 'source'`) can be added later without a breaking schema change. | Keeps this a clean, single-purpose release unit and mirrors how `PresetConfig` is written as an extensible union (`export type PresetConfig = StationPresetConfig`). AUX/BLUETOOTH/direct-`ContentItem` defaults are a deliberate future extension, not an oversight. | Building both variants now — doubles schema/validation/test surface for a use case (non-preset default) nobody has asked for yet. |
| 2026-07-18 | **Trigger semantics: fill-if-empty, never override.** The default source is selected on the primary **only when the primary is not already actively playing** a resumable source at activation time. If the primary is already playing something, the zone extends *that* to the slaves untouched. | A zone is most often activated to spread whatever's already on the primary into other rooms; force-overriding to a fixed default would be surprising and destructive of an in-progress session. Fill-if-empty is also what makes this compose cleanly with `resumeLastPlayedSource` (see next row). | **Always override** — fights resume-last-source, clobbers an active session, and makes zone activation feel like it "hijacks" the primary. Rejected. |
| 2026-07-18 | **Compose rule with `resumeLastPlayedSource` (#161) and the #162 power fix:** on zone activate the order is (1) power on primary + slaves [#162 fix], (2) evaluate the primary's `nowPlaying`, (3) if `defaultSource` is set **and** the primary is idle, `selectSource(resolved ContentItem)` on the primary, (4) `setZone(...)`. | The primary's own `resumeLastPlayedSource` only fires from the *primary speaker's* On tile — a different code path from the zone tile — so there is no direct double-trigger. The fill-if-empty check in step (3) is what reconciles the indirect case: if the user powered the primary on via its own tile first (resume-last-source ran) and *then* activates the zone, the primary is already playing, so the default source is skipped. Select-before-group avoids slaves briefly joining a silent/wrong-source primary. | Select *after* `setZone` — risks a momentary silence or a slave briefly mirroring the pre-select source. Doing the power-on inside the zone path via the speaker's `setOn` (to reuse resume-last-source) — rejected; the zone path drives the primary API directly and must stay decoupled from the speaker characteristic. |
| 2026-07-18 | **Deactivate is unaffected** — the default source is an activation-only concept. Zone deactivate keeps the #162 behavior (dissolve + power off); no source action. | There is no "default source" meaning on teardown. | Selecting/clearing a source on deactivate — pointless, the speakers are being powered off. |
| 2026-07-18 | **"Nothing meaningful playing" predicate** = primary `getNowPlaying()` reports `source` ∈ {`STANDBY`, `INVALID_SOURCE`} **or** no usable `contentItem` (empty `source`/no `location`). `deviceIsOn` alone is insufficient — after the #162 power-on the primary is no longer in STANDBY, so the check must look at `nowPlaying`, not just power state. | Grounds the check in the real state the device reports (`SoundTouchDevice.deviceIsOn` already special-cases `SourceStatus.standBy`/`invalid` from `getSource()`; `now-playing.ts` exposes `source` + `contentItem`). Exact edge behavior (e.g. `playStatus === STOP` on a valid source) to be confirmed on-device. | Trusting `deviceIsOn()` — returns `true` for any non-standby source, so it can't distinguish "on but idle" from "on and playing"; would suppress the default source right after power-on. |
| 2026-07-18 | **`feat:` commit type → minor release.** | Adds a new optional user-facing config field (`zones[].defaultSource`) and new activation behavior. | `fix:` (not a bug fix), `chore:` (user-visible). |
| 2026-07-18 | **Blocked on Speaker zones (#162) merging to `dev`.** Touches the same files (`SoundTouchZoneOnCharacteristic.ts`, `ZoneConfig`, `ZoneConfiguration`/`validateZones`, `config.schema.json` `zones` block, zone tests). | Direct extension of the zone activation path; branching before #162 lands would guarantee a rebase conflict on every touched file. | Building in parallel on a sibling branch — churns the same lines, no benefit. |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

Concrete files/dirs this touches. All build on the state PR #162 leaves in `dev`.

### Config (user-facing — all layers change together)

- `config.schema.json` — add an optional `defaultSource` object to each entry in
  the existing `zones[]` `items.properties`. v1 shape:
  `{ "type": "preset", "slot": <1–6> }` (enum `type: ["preset"]`, integer `slot`
  1–6). Add a `description` and, since Config-UI-X supports it, gate `slot`
  visibility on `type === 'preset'`.
- `src/ExternalPlatformConfig.ts` — add a `ZoneDefaultSourceConfig` union
  (v1: `interface ZonePresetDefaultSourceConfig { type: 'preset'; slot: number }`,
  `export type ZoneDefaultSourceConfig = ZonePresetDefaultSourceConfig`) and add
  `readonly defaultSource?: ZoneDefaultSourceConfig` to the existing `ZoneConfig`
  interface.
- `src/PlatformConfiguration.ts`:
  - Add a `defaultSource?: ZoneDefaultSourceConfig` field to `ZoneConfiguration`
    (thread through the private constructor and `ZoneConfiguration.create`).
  - Extend `validateZones()` to parse/validate `defaultSource`: accept only
    `type === 'preset'` with an integer `slot` 1–6 (reuse the exact slot-range
    check already in `validatePresets`); on anything invalid, `warn(...)` and
    drop just the `defaultSource` (keep the zone — a bad default shouldn't
    discard a valid zone).
- `src/__tests__/ExternalPlatformConfig.test.ts` — shape tests for
  `defaultSource` present/absent.
- `src/__tests__/PlatformConfiguration.test.ts` — round-trip tests: valid
  preset default survives; absent → `undefined`; invalid slot / unknown `type`
  → dropped with the zone retained.

### Zone runtime

- `src/zones/SoundTouchZoneOnCharacteristic.ts` — the core change:
  - Add `defaultSource?: ZoneDefaultSourceConfig` to the constructor props and
    `create(...)` factory (threaded from the accessory).
  - In `setOn(true)`, after the primary is powered on and before `setZone(...)`,
    call a new private `_applyDefaultSourceIfIdle()`:
    1. return early if `defaultSource` is unset;
    2. `getNowPlaying()` on the primary; return if it is already actively
       playing (per the predicate decision above);
    3. resolve the preset: `getPresets()` on the primary, find `slot`; if the
       slot is empty/missing, `log.warn` and return (don't throw — activation
       still succeeds, just without a default);
    4. `await this.device.api.selectSource(preset.contentItem)`.
  - Keep `setOn(false)` unchanged (deactivate path).
  - Preserve the existing HAP-error semantics from `SoundTouchSpeakerCharacteristic`
    (`wrapHapSet`); a failed `selectSource` should surface as
    `SERVICE_COMMUNICATION_FAILURE`, consistent with the rest of the codebase.
- `src/zones/SoundTouchZoneAccessory.ts` — pass `config.defaultSource` from the
  `ZoneConfiguration` into `SoundTouchZoneOnCharacteristic.create(...)`.

### Tests to add / update

- `src/zones/__tests__/SoundTouchZoneOnCharacteristic.test.ts`:
  - default source applied: primary `getNowPlaying()` idle (STANDBY) → `setOn(true)`
    resolves the preset via `getPresets()` and calls `selectSource()` with that
    preset's `contentItem` **before** `setZone()` (assert call order);
  - fill-if-empty: primary already playing a real source → `selectSource()` is
    **not** called; `setZone()` still runs;
  - no `defaultSource` configured → `selectSource()` never called (current
    behavior preserved);
  - configured slot is empty on the device → warns, no `selectSource()`, zone
    still activates.
- `src/__integration__/zone-lifecycle.integration.test.ts` — extend the existing
  integration test: `FakeSoundTouchServer` for the primary returns a STANDBY
  `nowPlaying` and a populated `presets`; assert the full activate cycle emits a
  `/select` POST (correct `ContentItem` XML) ordered before `/setZone`. Reuse the
  `FakeSoundTouchServer.requests[]` capture and `StubCharacteristic.invokeSet`
  helpers that #162 already added.

## Conventions for this change

- **Commit type:** `feat:` → **minor** release.
- **Config schema touched:** **yes** — `config.schema.json`,
  `src/ExternalPlatformConfig.ts`, `src/PlatformConfiguration.ts`, and both their
  test files must change together.
- **Tests to add/update:** see Affected areas above (unit + integration + config
  round-trip).
- **Target branch:** `dev` (squash-merged; PR title is the released commit
  message). **Branch off `dev` only after #162 has merged.**
- **ESM import rule:** all relative imports end `.js` — the new
  `ZoneDefaultSourceConfig` import in `PlatformConfiguration.ts` and any type
  import in the zone files included.
- **Domain skills to re-read before implementing:** `soundtouch-api-expert`
  (`/select` `ContentItem` payload, `/presets`, `/getZone`); `homebridge-developer`
  (characteristic setter HAP-error pattern); `plugin-coding-conventions`
  (ESM `.js` imports, the typecheck+lint+test gate).

## Implementation checklist

- [x] Add `ZoneDefaultSourceConfig` union + `defaultSource?` to `ZoneConfig`
      (`src/ExternalPlatformConfig.ts`)
- [x] Add `defaultSource?` to `ZoneConfiguration` and validate it in
      `validateZones()` (`src/PlatformConfiguration.ts`)
- [x] Update `config.schema.json` `zones[]` with the `defaultSource` object
- [x] Update `ExternalPlatformConfig` + `PlatformConfiguration` tests
- [x] Thread `defaultSource` through `SoundTouchZoneAccessory` →
      `SoundTouchZoneOnCharacteristic.create`
- [x] Implement `_applyDefaultSourceIfIdle()` in the zone characteristic and
      call it in `setOn(true)` before `setZone` (fill-if-empty, select-then-group)
- [x] Add/extend `SoundTouchZoneOnCharacteristic.test.ts`
- [x] Extend `zone-lifecycle.integration.test.ts`
- [x] `npm run typecheck && npm run lint && npm test`
- [x] `npm run knip` — confirm no unused exports

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run watch` — **real device required.** Configure a zone with a
      `defaultSource` preset slot. With the primary idle/off, activate the zone
      from the Home app and confirm the primary starts the configured preset and
      the slaves join playing it. Confirm the fill-if-empty rule: start something
      on the primary first, then activate the zone, and confirm the running
      source is **not** overridden.
- [ ] Real-device: verify compose with the #162 power-on and #161
      resume-last-source paths (power the primary on via its own tile → its
      last source resumes; then activate the zone → default source is skipped
      because the primary is already playing). Confirm the select-then-group
      ordering produces no audible wrong-source blip on slaves.

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `feat: add per-zone default source played when a zone activates idle`
- **Targets:** `dev`
