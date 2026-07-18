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
| 2026-07-18 | The v1.1 API PDF / `api-reference.md` documents the `RecentsUpdatedNotifyUI` notification shape but **not** the `GET /recents` response body itself — no real-device capture of `/recents` existed in this repo at session start. Initially modeled `getRecents()`/`recentFromElement` on the `/presets` shape (`<ContentItem>`, capitalized) and assumed newest-first ordering. | Read `api-reference.md`; no existing capture in-repo | — superseded by the next row |
| 2026-07-18 | **Real-device capture confirms and corrects the above.** A live speaker's `GET /recents` returns `<recents><recent deviceID="…" utcTime="$UINT64" [id="…"]><contentItem source="…" type="…" location="…" sourceAccount="…" isPresetable="…"><itemName>…</itemName>[<containerArt>…</containerArt>]</contentItem></recent>…</recents>`. Two corrections vs. the initial `/presets`-based guess: (1) the nested element is **lowercase `<contentItem>`**, not `<ContentItem>` — `/presets` and `/recents` disagree on casing, and xml2js tag matching is case-sensitive, so the original parser would have silently returned `undefined` for every entry against a real device; (2) **ordering is confirmed newest-first** (most-recent `utcTime` is index 0), matching the assumption. Fixed `recent.ts` to match (`hasChild('contentItem')`/`getChild('contentItem')`) and re-verified end-to-end against the live device (built `dist/`, called `API.getRecents()` directly over the LAN) — 50 entries returned, correctly parsed, correctly ordered newest-first. | Live capture + direct `API.getRecents()` call against a real speaker on the LAN, 2026-07-18 | Shipping the uncorrected `/presets`-cased guess — would have silently no-op'd the resume feature on every real device (parser returns `undefined`, no crash, but no resume either) |
| 2026-07-18 | **Related real-hardware finding, separate fix:** `setOn`'s power toggle itself (`this.device.api.pressKey(KeyValue.power)`, the line immediately before the `resumeLastPlayedSource()` call this plan added) was confirmed unreliable on real hardware — `pressKey` is `holdKey(value, 0)`, a press+release with ~0ms gap, and a live speaker silently no-ops the POWER toggle at that gap while a ~300ms hold reliably toggles it. This means `resumeLastPlayedSource()` could have been firing after a power press that never actually turned the speaker on. Fixed separately in `fix/power-key-hold-duration` (`SoundTouchSpeakerOnCharacteristic.setOn` now calls `holdKey(KeyValue.power, POWER_KEY_HOLD_DURATION_MS)` instead of `pressKey`); `resumeLastPlayedSource()` itself is unchanged and should now fire against a device that has actually powered on. | Live testing against a real "Office" speaker: press+release ~0ms gap failed twice, ~300ms hold succeeded twice | Leaving `pressKey` as-is and only fixing at the `resumeLastPlayedSource` layer — rejected, the root cause is the power toggle itself, not the resume logic |

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
- [x] `getRecents()` parsing verified directly against a real speaker
      (built `dist/`, called `API.getRecents()` over the LAN) — confirmed the
      response shape, fixed the lowercase-`contentItem` bug this caught, and
      confirmed newest-first ordering (see 2026-07-18 finding)
- [ ] `npm run watch` — full HomeKit end-to-end still not run this session:
      play a source, power off, then HomeKit "On" → confirm the same content
      resumes. The `/recents` parsing itself is now real-device-verified;
      this remaining step exercises the full `setOn` → `pressKey` →
      `getRecents` → `selectSource` path end-to-end through HomeKit.

## PR / release notes

- **PR title (Conventional Commit, becomes the released commit):**
  `fix: resume last-played source when powering on via HomeKit`
- **Targets:** `dev`
