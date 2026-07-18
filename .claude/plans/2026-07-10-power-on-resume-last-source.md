---
feature: HomeKit power-on mimics on-device resume of last-played source
status: in-progress # PR opened against dev, awaiting review/merge
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
| 2026-07-10 | The plugin's power-on path today only sends `POST /key` with `KeyValue.power` (`SoundTouchSpeakerOnCharacteristic.setOn` → `api.ts:109-122` `pressKey`/`holdKey`/`_key`). Per the user, this does not reliably reproduce the on-device experience of resuming the last-played source. Rather than rely on firmware to do this off a bare `POWER` key, the plugin will explicitly resume the last-played source on power-on. | User confirmation of on-device behavior | Waiting on unverifiable firmware behavior instead of just implementing the resume explicitly |
| 2026-07-10 | **The device exposes a `GET /recents` endpoint** — a firmware-maintained, ordered recently-played list of `ContentItem`s (with timestamps), pushed via the `RecentsUpdatedNotifyUI` WebSocket notification (`<recentsUpdated><recents>…</recents></recentsUpdated>`, api-reference.md:297). This is a better source of truth than reconstructing "last played" from `nowPlaying` polling: it's the same list/order the SoundTouch app's "recents" UI and the device's own resume behavior are presumably built on. **The plugin currently does nothing with it**: the gabbo notification parser recognizes the `recents` type but `GabboClient.ts:28` maps it to `undefined` (silently dropped, no event emitted), there is no `recents` entry in `endpoints.ts`, and no client method calls `/recents` anywhere in `src/devices/SoundTouch/api/`. Plan: add the endpoint + client method, wire the `RecentsUpdatedNotifyUI` notification through `GabboClient` like the other typed events, and on `setOn(true)` (after pressing `POWER`) call `selectSource` with the most-recent entry from `/recents`. | Read `api-reference.md` notification table; grepped `GabboClient.ts`, `endpoints.ts`, and `src/devices/SoundTouch/api/` for any existing `/recents` usage — confirmed none exists | Manually tracking last-played via `nowPlaying`/`NowPlayingChange` polling (the original approach in this plan) — rejected once `/recents` was found, since it duplicates device-maintained state and could drift from what the device itself considers "recent" (e.g. AUX/Bluetooth sessions without a `nowPlaying` XML the same way streaming sources have) |
| 2026-07-10 | This plan touches `SoundTouchSpeakerOnCharacteristic.ts`, the same file `plans/2026-07-10-power-state-accuracy.md` (in-progress, `fix/power-state-accuracy`) is fixing for a separate stale-cache toggle bug. Sequence this branch after that one merges (or rebase onto it) to avoid conflicting edits to `setOn` — but the resume behavior itself is not blocked on it. | Avoid duplicate/conflicting edits to the same lines | Implementing both in the same branch — rejected to keep `power-state-accuracy` a clean single-purpose PR |
| 2026-07-18 | `power-state-accuracy` was already merged to `dev` before this session started (`setOn` already does a live `getSource` read to decide whether to press `POWER`). Branched fresh from `dev` — no rebase needed. | Confirmed by reading the current `setOn` implementation on `dev` before starting | — |
| 2026-07-18 | The v1.1 API PDF / `api-reference.md` documents the `RecentsUpdatedNotifyUI` notification shape but **not** the `GET /recents` response body itself — no real-device capture of `/recents` exists in this repo. Modeled `getRecents()`/`recentFromElement` on the `/presets` shape (`<recents><recent utcTime="$UINT64">…<ContentItem/>…</recent></recents>`) and assumed the device returns entries **newest-first** (so `recents[0]` is "most recent"), matching how the plan phrase "the most-recent entry" reads most naturally. This is unverified against a real speaker — flagging as a risk for the `npm run watch` manual verification step. If a real capture later shows a different element/attribute name or a different (oldest-first) order, `recent.ts`/`api.ts#getRecents` is the only place to fix. | No real-device `/recents` capture available in this session | Blocking on a real-device capture before shipping — rejected to avoid stalling the fix; the parser is defensive (returns `undefined` on unexpected shapes rather than throwing) so a wrong guess degrades to a no-op resume, not a crash |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

- `src/devices/SoundTouch/api/endpoints.ts` — add `recents = 'recents'`.
- `src/devices/SoundTouch/api/api.ts` — add `getRecents()` (`GET /recents`),
  parsed the same way as `getNowPlaying`/`getPresets`; returns the ordered
  recents list (each entry wraps a `ContentItem` + timestamp).
- `src/devices/SoundTouch/api/notifications/gabbo-notification.ts` /
  `GabboClient.ts` — wire `recentsUpdated` through like the other typed
  events (currently mapped to `undefined` and dropped at `GabboClient.ts:28`)
  so callers can react to `RecentsUpdatedNotifyUI` instead of only polling.
- `src/accessories/services/SoundTouchSpeakerOnCharacteristic.ts` — in
  `setOn(true)`, after `pressKey(KeyValue.power)`, fetch `/recents` and call
  `selectSource` with the most-recent entry's `ContentItem` if the list is
  non-empty. Rebase onto `power-state-accuracy` once merged (or take over its
  `setOn` live-read change if this plan lands first) — same file, avoid
  conflicting edits.
- New/updated: `src/devices/SoundTouch/api/__tests__/api.test.ts` (or
  equivalent) for `getRecents`; `src/accessories/services/__tests__/SoundTouchSpeakerOnCharacteristic.test.ts`
  — coordinate with `power-state-accuracy`'s planned test file of the same
  name.
- **Sequencing:** rebase onto `plans/2026-07-10-power-state-accuracy.md`
  (`fix/power-state-accuracy`) once it merges to avoid conflicting edits to
  `setOn`; the `/recents` client + gabbo wiring can be built in parallel.

## Conventions for this change

- **Commit type:** `fix:` → patch release (behavior-correctness fix; no
  public API/config change in the common-case scope)
- **Config schema touched:** no — resume-on-power-on is the default,
  always-on behavior matching what the physical unit does; no opt-out planned
  unless review surfaces a reason for one.
- **Tests to add/update:** extend
  `src/accessories/services/__tests__/SoundTouchSpeakerOnCharacteristic.test.ts`
  (created by `power-state-accuracy`) with a case asserting `setOn(true)`
  presses `KeyValue.power` and then calls `selectSource` with the
  `ContentItem` from the most recent `/recents` entry; add API-layer tests
  for `getRecents()` XML parsing and gabbo-notification tests for
  `recentsUpdated` wiring.
- **Target branch:** `dev` (squash-merged; PR title is the released commit
  message).

## Implementation checklist

- [x] Read `coding-conventions`, `homebridge-developer`, and
      `soundtouch-api-expert` skills first
- [x] Rebase onto/confirm merge status of `plans/2026-07-10-power-state-accuracy.md`
      before touching `setOn`; do not duplicate its live-read change
      (already merged — `setOn` does a live `getSource` read before deciding
      whether to press `POWER`; this plan only adds the resume step)
- [x] Add `recents = 'recents'` to `endpoints.ts` and a `getRecents()` method
      to `api.ts` (`GET /recents`), parsing the XML response into an ordered
      list of `{ ContentItem, timestamp }`
- [x] Wire `recentsUpdated` through `GabboClient` (currently dropped) so it's
      available as an event like `volumeUpdated`/`nowPlayingUpdated`
- [x] In `SoundTouchSpeakerOnCharacteristic.setOn(true)`, after
      `pressKey(KeyValue.power)`, call `getRecents()` and `selectSource` with
      the most-recent entry's `ContentItem` (no-op if the list is empty)
- [x] Unit tests: `getRecents()` XML parsing; `setOn(true)` presses `POWER`
      then selects the most-recent `/recents` entry
- [x] `npm run typecheck && npm run lint && npm test`

## Verification

- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm test`
- [ ] `npm run watch` — against a real speaker: play a source, power off,
      then HomeKit "On" → confirm the same content resumes (**not run this
      session** — see the 2026-07-18 finding above: the `/recents` XML shape
      is unverified against a real device; this manual check would also
      validate/correct that assumption)

## PR / release notes

- **PR title (Conventional Commit, becomes the released commit):**
  `fix: resume last-played source when powering on via HomeKit`
- **Targets:** `dev`
