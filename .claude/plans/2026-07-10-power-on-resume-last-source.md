---
feature: HomeKit power-on mimics on-device resume of last-played source
status: planned
date: 2026-07-10
branch: fix/power-on-resume-last-source
commit-type: fix
---

# HomeKit power-on mimics on-device resume of last-played source

## Context

User report: turning a SoundTouch speaker "On" via HomeKit does not resume
playback the way pressing the physical power button (or a preset button) on
the unit does. On real hardware, powering on from standby resumes whatever was
last playing (last preset, streaming source, AUX input); the complaint is that
our plugin's power-on path looks like it powers the speaker into an idle,
no-playback state instead.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-07-10 | The plugin's power-on path today only sends `POST /key` with `KeyValue.power` (`SoundTouchSpeakerOnCharacteristic.setOn` → `api.ts:109-122` `pressKey`/`holdKey`/`_key`). Per the user, this does not reliably reproduce the on-device experience of resuming the last-played source. Rather than rely on firmware to do this off a bare `POWER` key, the plugin will track the last-played source itself and explicitly resume it on power-on. | User confirmation of on-device behavior; `selectSource(contentItem)` (`api.ts:146-152`) and `getNowPlaying()` (`api.ts:124-133`) already exist as the primitives needed | Waiting on unverifiable firmware behavior instead of just implementing the resume explicitly |
| 2026-07-10 | Last-played source will be tracked in memory on `SoundTouchDevice`, updated from `nowPlaying`/gabbo `NowPlayingChange` events whenever a real (non-empty) `ContentItem` is playing. On `setOn(true)`, after pressing `POWER`, the plugin calls `selectSource` with the tracked `ContentItem` (guarding against a redundant call if the device already resumed the same source on its own). | Session-only, in-memory state avoids any disk persistence concern; reuses existing API primitives | Persisting last source to disk — unnecessary, adds a storage-dir write path for no benefit since the value is only useful while the plugin process is alive |
| 2026-07-10 | This plan touches `SoundTouchSpeakerOnCharacteristic.ts`, the same file `plans/2026-07-10-power-state-accuracy.md` (in-progress, `fix/power-state-accuracy`) is fixing for a separate stale-cache toggle bug. Sequence this branch after that one merges (or rebase onto it) to avoid conflicting edits to `setOn` — but the resume behavior itself is not blocked on it. | Avoid duplicate/conflicting edits to the same lines | Implementing both in the same branch — rejected to keep `power-state-accuracy` a clean single-purpose PR |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

- `src/devices/SoundTouch/SoundTouchDevice.ts` — add in-memory tracking of
  the last non-empty `nowPlaying` `ContentItem`, updated from `nowPlaying`
  polling / gabbo `NowPlayingChange` events (session-only, no disk
  persistence).
- `src/accessories/services/SoundTouchSpeakerOnCharacteristic.ts` — in
  `setOn(true)`, after `pressKey(KeyValue.power)`, call `selectSource` with
  the tracked last `ContentItem` if one exists. Rebase onto
  `power-state-accuracy` once merged (or take over its `setOn` live-read
  change if this plan lands first) — same file, avoid conflicting edits.
- `src/devices/SoundTouch/api/api.ts` — no new endpoint required;
  `selectSource(contentItem)` (:146-152) and `getNowPlaying()` (:124-133)
  already exist.
- New/updated: `src/accessories/services/__tests__/SoundTouchSpeakerOnCharacteristic.test.ts`
  and `src/devices/SoundTouch/__tests__/SoundTouchDevice.test.ts` — coordinate
  with `power-state-accuracy`'s planned test file of the same name.
- **Sequencing:** rebase onto `plans/2026-07-10-power-state-accuracy.md`
  (`fix/power-state-accuracy`) once it merges to avoid conflicting edits to
  `setOn`; the last-source tracking itself can be built in parallel.

## Conventions for this change

- **Commit type:** `fix:` → patch release (behavior-correctness fix; no
  public API/config change in the common-case scope)
- **Config schema touched:** no — resume-on-power-on is the default,
  always-on behavior matching what the physical unit does; no opt-out planned
  unless review surfaces a reason for one.
- **Tests to add/update:** extend
  `src/accessories/services/__tests__/SoundTouchSpeakerOnCharacteristic.test.ts`
  (created by `power-state-accuracy`) with a case asserting `setOn(true)`
  presses `KeyValue.power` and then calls `selectSource` with the tracked
  last `ContentItem`; add device-level tests on
  `SoundTouchDevice.test.ts` for last-source capture from `nowPlaying`/gabbo
  events.
- **Target branch:** `dev` (squash-merged; PR title is the released commit
  message).

## Implementation checklist

- [ ] Read `coding-conventions`, `homebridge-developer`, and
      `soundtouch-api-expert` skills first
- [ ] Rebase onto/confirm merge status of `plans/2026-07-10-power-state-accuracy.md`
      before touching `setOn`; do not duplicate its live-read change
- [ ] Add last-played-source tracking to `SoundTouchDevice`: capture the
      latest non-empty `ContentItem` from `nowPlaying` polling and gabbo
      `NowPlayingChange` events, held in memory
- [ ] In `SoundTouchSpeakerOnCharacteristic.setOn(true)`, after
      `pressKey(KeyValue.power)`, call `selectSource` with the tracked last
      `ContentItem` (no-op if none tracked yet, e.g. first run before any
      playback observed)
- [ ] Unit tests: `setOn(true)` presses `POWER` then selects the tracked
      source; device-level tests for last-source capture from
      `nowPlaying`/gabbo events
- [ ] `npm run typecheck && npm run lint && npm test`

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run watch` — against a real speaker: play a source, power off,
      then HomeKit "On" → confirm the same content resumes

## PR / release notes

- **PR title (Conventional Commit, becomes the released commit):**
  `fix: resume last-played source when powering on via HomeKit`
- **Targets:** `dev`
