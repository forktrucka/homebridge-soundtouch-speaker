---
feature: Source selection
status: planned # planned | in-progress | done | cancelled
date: 2026-06-19
branch: feat/source-selection
commit-type: feat
---

# Source selection

## Context

Expose the speaker's available **sources** in HomeKit and let the user switch
between them. The API layer is already complete: `api.getSources()` returns the
list (`src/devices/SoundTouch/api/source.ts` — each `Source` has `source`,
`sourceAccount`, `status`), `api.selectSource(contentItem)` POSTs `/select`
(`api.ts:131`), and `api.getSource()` returns the current source name from
`/now_playing`. No protocol work — this is HomeKit wiring.

Chosen representation: **Television service + one InputSource per source**, with
`selectSource()` driven by `ActiveIdentifier`. A real-device spike
(2026-07-18, branch `spike/tv-input-source`,
`src/accessories/SoundTouchTVSpikeAccessory.ts`) has now **confirmed this path
end-to-end** and resolved the three open HomeKit questions — see the settled
summary below and the 2026-07-18 rows in Decisions & findings. A round-2 session
on the same branch/device (2026-07-19) went further and confirmed the full
remote-control surface: `RemoteKey` transport controls, a linked
`TelevisionSpeaker` service for real volume/mute, `CurrentMediaState`, always-on
Bluetooth, and slot-numbered presets — see the 2026-07-19 rows. A same-day round-3
session found and fixed three real bugs surfaced by extended live testing
(ambiguous current-source matching across same-source presets, cycling silently
resetting whenever the device is off/on an unlisted source, and a Home app
picker-ordering quirk requiring 1-based `DisplayOrder` identifiers) — see the
later 2026-07-19 rows. The spike file is a **reference only**; it is
env-var-gated throwaway code (`TV_SPIKE`) that is not wired into
discovery/cache lifecycle and must not be shipped as-is.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-19 | Provisional: Television + InputSource for source selection, **pending a spike** | The "correct" HomeKit input picker | Per-source Switches (kept as documented Plan B); read-only current-source |
| 2026-06-19 | Finding: the API already implements `getSources`/`selectSource`/`getSource` | No protocol work; pure HomeKit wiring | — |
| 2026-06-19 | Risk/finding: Televisions generally need external publishing, `Active` clashes with our `On` power model, and the picker UX is buried | Could force the Plan-B fallback — resolve in the spike before building out | — |
| 2026-07-18 | **Spike complete: Television + InputSource prototype confirmed working end-to-end on a real device.** External accessory publishing, pairing, `Active` (power) toggling, and `ActiveIdentifier` → `selectSource()` input switching all functioned correctly once real-device network issues (unrelated to this plugin) were resolved. | Per-source Switches — no longer required as a fallback for functional reasons; still viable stylistically |
| 2026-07-18 | **Finding (revises the row above): the `Active`/`On` power-model clash is real, confirmed live.** The spike ran the TV as a *separate external accessory* alongside the existing bridged Switch/Lightbulb accessory for the same physical device — both back onto the same `SoundTouchDevice.deviceIsOn()` check, but as two independent HAP characteristics on two different accessories, with no push-notification link between them. Toggling power via the TV's `Active` characteristic correctly changed the real device (confirmed via `/now_playing`: `STANDBY`), but the separate bridged accessory's `On` tile kept showing stale "On" until its own next poll cycle. A real user would see the two tiles visibly disagree for a stretch after any power change. | Treating the two characteristics as independently pollable — proven insufficient; a real implementation must either fully replace the power surface with the Television service, or actively push `updateValue()` to both in lock-step (ideally reactively via the gabbo WebSocket) whenever either changes |
| 2026-07-18 | **Finding: HomeKit's TV UX is a full-screen "remote control" view (power toggle + vertical input list), not a normal tile grid** — a genuinely different interaction paradigm from the rest of this plugin's Switch/Lightbulb tiles. | Observed directly in the Home app after pairing | — |
| 2026-07-18 | **Finding: HomeKit's input-naming setup step ignores the `ConfiguredName` values set by the accessory** — it always presents generic placeholders ("Input Source", "Input Source 2", …) for the user to (re)name, regardless of what the accessory suggests. | Observed directly during pairing; not something the accessory can bypass | — |
| 2026-07-18 | **Finding: some source names returned by `getSources()` are real personal data** — on the real test device, two `SPOTIFY` sources are named by their linked account's login email address (Bose/Spotify's own account-linking behavior, not something the plugin controls). Exposing these verbatim as HomeKit input tile names is a real privacy concern for actual users. | Observed directly via `/sources` on a real device during this spike | — |
| 2026-07-18 | **Decision: exclude `SPOTIFY` sources from v1 of source selection** | Two reasons converged: (1) the privacy concern above — Spotify source names can be real email addresses; (2) reliability — attempting to select a Spotify source on the real test device failed silently, falling back to `INVALID_SOURCE`, consistent with a `MUSIC_SERVICE_ACCOUNT_LOGIN_FAILED` error observed independently during the Spike C Part 2 gabbo capture (2026-07-17) — Spotify account auth on the device appears to be in an expired/invalid state, unrelated to this plugin. AUX and ALEXA sources both worked correctly in the same test. | Showing Spotify sources with a generic label instead of filtering them — doesn't resolve the reliability problem, only the privacy one |
| 2026-07-18 | **Decision (final architecture): ship source selection as Television + InputSource. The per-source-Switch fallback (Plan B) is formally retired.** | The spike proved the TV path works end-to-end on a real device (publishing, pairing, `Active` power, `ActiveIdentifier` → `selectSource()`). Plan B only ever existed as a hedge against the TV path being functionally unworkable; the spike disproved that premise. The one remaining concern (the power-model clash) is a solvable in-code wiring problem, not an architectural dead end — see the next row. | Per-source Switch radio-buttons (Plan B) — retired: it was a fallback for a risk that did not materialise, and it costs multiple tiles per speaker while still needing its own mutual-exclusion + power coordination. Read-only current-source display — insufficient (no switching). |
| 2026-07-18 | **Decision: solve the `Active`/`On` power-model clash by keeping both surfaces in lock-step via the existing gabbo reactive-refresh mechanism — NOT by removing the existing `On` surface.** The real external Television accessory gets its own wrapper that subscribes its `Active` characteristic to the same gabbo events the bridged `On` characteristic already declares (`SoundTouchSpeakerOnCharacteristic.gabboEvents = ['connectionStateUpdated']`, plus the now-playing/selection event that carries source changes). Both read `SoundTouchDevice.deviceIsOn()` and both `updateValue()` on the same device push, so they cannot drift. | Root cause of the spike's stale-tile disagreement was that `SoundTouchTVSpikeAccessory` used raw `onGet` with **no gabbo wiring at all** — it never refreshed reactively. The bridged `On` characteristic already refreshes reactively through the `gabboEvents` → `device.gabbo.on(...)` path in `SoundTouchSpeakerPlatformAccessory.init()`. Wiring the real external accessory into that same established path is the minimal correct fix and keeps the Switch/Lightbulb power+volume tiles current users depend on. | (a) Removing/replacing the existing `On` surface when source selection is enabled — a breaking topology change for existing users that also strands volume-via-Brightness; (b) independent polling of the two characteristics — proven insufficient by the spike. |
| 2026-07-18 | ~~Decision: defer presets-as-inputs out of v1~~ — **superseded by the row below (user directive).** | — | — |
| 2026-07-18 | **Decision (final, overrides the row above): presets-as-inputs ARE in v1 scope.** User directive: ship the device's stored presets (`api.getPresets()`) as additional selectable `InputSource` entries alongside plain sources, reusing `selectSource(contentItem)` with each preset's own `ContentItem` — exactly what the spike prototyped. This was typechecked/linted clean during the spike but not live-verified in the Home app that evening (WiFi issues cut the session short) — **on-device verification of presets-as-inputs is therefore a required part of this PR's verification step, not optional.** Preset item names come from the user's own preset labels (e.g. "More FM Auckland"), not raw account identifiers, so the SPOTIFY-email privacy concern does not apply to presets the same way it does to plain sources — but a preset whose `ContentItem.source === 'SPOTIFY'` should still be excluded for consistency with the plain-source SPOTIFY exclusion decision, unless the user wants that revisited too. | Deferring to Phase 2 — retired per direct user instruction; no coordination blocker with preset-sync/typed-preset-management was actually identified beyond both features reading the same `getPresets()` data, which is read-only and non-conflicting. |
| 2026-07-18 | **Decision: source selection is opt-in per device via a new config flag (default off).** Add e.g. `sourceSelectionEnabled` (mergeable from `global` like the other per-accessory settings). Only when enabled for a device does the plugin publish that device's external Television accessory. | Enabling it changes the device's HomeKit topology (adds a second, external accessory) and imposes the full-screen TV "remote" UX plus the unavoidable one-time manual input-renaming (both confirmed above) on the user. Existing users' topology must not change unless they explicitly opt in. Requires `config.schema.json` + `ExternalPlatformConfig.ts` + `PlatformConfiguration.ts` + tests to stay in sync. | Always-on — imposes the topology/UX change and manual renaming on every existing user without consent. |
| 2026-07-19 | **Round 2 spike (same branch, same real device): remote-control surface confirmed usable end-to-end — `RemoteKey`, a linked `TelevisionSpeaker` service, and `CurrentMediaState` all functioned correctly against the real speaker.** `RemoteKey` up/down cycles through the input list (wrapping); left/right/rewind/fast-forward all press track-skip keys; center (`SELECT`) toggles play/pause; a linked `TelevisionSpeaker` service exposed real `Volume`/`Mute`/`VolumeSelector`, confirmed moving the actual speaker volume; `CurrentMediaState` correctly reflected `getNowPlaying().playStatus`. | Confirms the Television service can carry the *entire* remote-control surface (not just power + input), not only the minimal path exercised in round 1 | — |
| 2026-07-19 | **Finding: the standard remote UI (Home app / Control Center) only renders a fixed button set — power, D-pad, select, play/pause, volume.** `RemoteKey` values with no on-screen affordance in that UI (`REWIND`, `FAST_FORWARD`, `BACK`, `EXIT`, `INFORMATION`) are effectively unreachable from it regardless of whether they're wired up. Confirmed live: wiring `INFORMATION` doesn't make an "i" button appear anywhere. | Observed directly across both the Home app's own TV control screen and Control Center's Remote card | — |
| 2026-07-19 | **Decision: map the D-pad to source cycling (up/down) and track skip (left/right), not volume.** Volume is fully covered by the `TelevisionSpeaker` service's own rocker/slider, so the D-pad is free for a second purpose. Center (`SELECT`) is play/pause. Rewind/fast-forward mirror left/right (track skip) since SoundTouch has no true scrub/seek API — redundant with the D-pad, but harmless, and there for the (rare) client that does render them. | An earlier iteration mapped up/down to volume ±5 before the `TelevisionSpeaker` service existed; superseded once real volume control was wired up, freeing the D-pad for source cycling | Up/down as volume (retired — redundant with `TelevisionSpeaker`); select cycling sources instead of play/pause (tried, reverted — play/pause is the more expected center-button action once a dedicated cycling control exists on up/down) |
| 2026-07-19 | **Decision: label preset inputs by slot number (`Preset 1`…`Preset 6`), not the stored station name, and always list all 6 slots regardless of whether a slot currently has anything stored** — matching the physical device's own numbered preset buttons. Selecting a populated slot uses its stored `ContentItem` via `selectSource()` (unchanged); selecting an empty slot presses the corresponding `PRESET_n` key instead, mirroring what the physical button does. | User directive, for parity with the physical device's labeling and button layout, plus a "grayed out but present" UX for empty slots being clearer than an inconsistently-sized list | Station-name labels (round 1's approach) — retired; only listing populated slots (also round 1) — retired, since users expect all 6 physical buttons to be present even if empty |
| 2026-07-19 | **Finding: `BLUETOOTH` reports `status="UNAVAILABLE"` on `/sources` whenever nothing is actively paired over Bluetooth — confirmed via a direct `/sources` request against the real device.** Unlike account-gated services (Spotify, Pandora, etc.), Bluetooth's `UNAVAILABLE` status doesn't mean "can't be selected" — Bose's own `/select` spec documents `<ContentItem source="BLUETOOTH">` as a valid payload with no `sourceAccount`, and selecting it is exactly what should trigger the speaker's discoverable/pairing mode. | Verified directly via `GET /sources` against the real device (`BLUETOOTH` present with `status="UNAVAILABLE"`, no `sourceAccount`) | — |
| 2026-07-19 | **Decision: always include `BLUETOOTH` as a selectable source regardless of its `status`, as a special case alongside the existing `status === ready` filter — and additionally exclude `ALEXA`** (found present as a `READY` source on the real device but not something a v1 "select an input" UX should surface as a first-class tile). | Filtering Bluetooth out by its `UNAVAILABLE` status would permanently hide the one source a user is most likely to want to actively select (to trigger pairing) | Requiring Bluetooth to already be `READY` (round 1's implicit behavior) — retired, since that's a state Bluetooth can only reach *after* being selected |
| 2026-07-19 | **Round 3 spike (same branch/device, same day): three real bugs found and fixed by extended live testing of cycling/ordering, plus the volume/mute UX from round 2 confirmed fully working.** Not new architecture — all fixes are within the already-confirmed Television + InputSource path. | Extended interactive testing (D-pad cycling, preset ordering, remote volume/mute) surfaced issues that a short pairing-and-poke session doesn't | — |
| 2026-07-19 | **Bug/fix: `TelevisionSpeaker`'s volume rocker/mute buttons did nothing in the remote UI with `VolumeControlType.ABSOLUTE`.** Apple's on-screen remote only routes its volume +/- taps to the accessory's `VolumeSelector` handler when the type is `RELATIVE` or `RELATIVE_WITH_CURRENT` — `ABSOLUTE` signals "controlled via the numeric `Volume` characteristic directly," which the standard remote UI doesn't expose a rocker for. Switching to `RELATIVE_WITH_CURRENT` fixed it; volume and mute are now confirmed working end-to-end from the on-screen remote. | Confirmed live: buttons were inert under `ABSOLUTE`, worked immediately after switching to `RELATIVE_WITH_CURRENT` | — |
| 2026-07-19 | **Decision: TuneIn presets are excluded as v1 scope only for the plain `TUNEIN` source entry — the generic "browse TuneIn" tile — not for presets themselves, which remain fully in scope.** Presets whose underlying `ContentItem.source === 'TUNEIN'` are unaffected; only the bare `TUNEIN` entry from `getSources()` is dropped from the plain-sources list (alongside the existing `SPOTIFY`/`ALEXA` exclusions), since a generic "TuneIn" source with no station selected isn't a meaningful HomeKit input on its own — users reach TuneIn stations via their numbered presets. | User directive; presets already carry real station names/content and remain the intended path to TuneIn content | — |
| 2026-07-19 | **Bug found: matching "what's currently playing" back to an input by `contentItem.source` alone is ambiguous and actively wrong whenever multiple items share a source** — confirmed live: this device's presets 1–4 are *all* `TUNEIN` (different stations, distinguished only by `ContentItem.location`, e.g. `/v1/playback/station/s7162` vs `/v1/playback/station/s87086`). Matching by `source` alone always resolved to the *first* matching item (preset 1) regardless of which preset was actually playing, so cycling from preset 2/3/4 jumped from the wrong position — visible to the user as landing on a seemingly random/wrong entry. | Verified directly via `GET /presets` on the real device (4 of 6 populated slots all report `source="TUNEIN"`) | — |
| 2026-07-19 | **Decision: match current input by `source` + `location` together (via `getNowPlaying().contentItem`, which carries `location`), not `source` alone**, everywhere "what's currently selected" needs to be resolved back to an input (the picker's `ActiveIdentifier` `onGet`). This is necessary and sufficient to disambiguate same-source presets/sources. | Fixes the bug above with the minimum change — `location` is exactly the field the Bose API uses to distinguish stations within the same source | Comparing the full `ContentItem` object — unnecessary; `source` + `location` is already unique per the API's own model |
| 2026-07-19 | **Second, deeper bug found: cycling (D-pad up/down) re-derived "current position" from a fresh device lookup on every press, which is ambiguous *or entirely absent* whenever the device is off or on a source not in our list — silently resetting the cycle to index 0 every single press.** Confirmed live via direct API call: with the speaker powered off, `getNowPlaying()` returns `source: "STANDBY"`, matching nothing in the input list, so every Up/Down press quietly restarted from AUX instead of remembering the previous position — this is what looked like "including an invalid source" to the user, distinct from and in addition to the same-source ambiguity bug above. | Verified directly: calling `device.api.getNowPlaying()` against the real (powered-off) speaker returned `source: "STANDBY"` | — |
| 2026-07-19 | **Decision: cycling pivots off HomeKit's own cached `ActiveIdentifier` characteristic value, not a fresh device lookup.** The Home app already tracks "what's currently selected" as HAP characteristic state; reusing that is stable regardless of whether the device is reachable, on, or on an out-of-list source, and avoids re-deriving ambiguous state from the device on every remote press. The picker's own `ActiveIdentifier` `onGet` still reads live device state (via the `source`+`location` fix above) since that path genuinely needs to reflect reality, just not the cycling pivot. | Root-causes and fixes the STANDBY bug directly; the device-derived approach is fundamentally unreliable for this specific purpose (remembering position across presses) even after the ambiguity fix, since "off" and "on an unlisted source" have no matching input by construction | Re-fetching + defaulting to index 0 on no-match (round 1/2 behavior) — retired, this is the actual root cause |
| 2026-07-19 | **Decision: presets are listed before plain sources in the combined input list** (previously sources-first), and the D-pad cycling walks that same ordered list, skipping unavailable/empty entries (`available: false` — an unpopulated preset slot, or a source whose `status !== ready`) rather than landing on them. One ordered list drives both the picker and the cycling — no separate order to keep in sync. | User directive | — |
| 2026-07-19 | **Implementation: replaced modulo-arithmetic array wraparound with an explicit circular doubly-linked list over the input items**, per user request, so wraparound at either end is structural (`node.next`/`node.prev`) rather than index math. Functionally equivalent to the array+modulo approach it replaced. | User directive | Modulo-indexed array (round 2's approach) — functionally fine, replaced only for the explicit-structure preference |
| 2026-07-19 | **Bug found: the Home app's input picker does not reliably fall back to registration/`Identifier`-ascending order** — reordering the underlying `items` array (and thus each `InputSource`'s `Identifier`) did not visibly reorder the picker. The actual HAP mechanism for controlling picker order is the optional `DisplayOrder` characteristic on the `Television` service (a TLV8 list of `Identifier` values in display order), which round 1/2 never set. | Confirmed live: presets-first array order alone did not change the observed picker order until `DisplayOrder` was explicitly set | — |
| 2026-07-19 | **Deeper bug found: identifier `0` renders last in the Home app picker regardless of its position in the `DisplayOrder` list** — tested both an ascending list (`[0,1,2,...]`, item 0 rendered last) and that same list reversed (`[...,2,1,0]`, every *other* item correctly flipped to the opposite order, but item 0 *still* rendered last). This isolates the bug specifically to identifier value `0`, not a general forward/reverse ambiguity. | Two independent live tests (ascending, then fully reversed) both isolated `0` specifically as anomalous, ruling out a simple forward/reverse mixup | A general "reverse the whole list" fix — tried first, rejected once the reversed test still showed `0` last, proving the bug is about the value `0` specifically |
| 2026-07-19 | **Decision: use 1-based identifiers everywhere** (`Identifier` on each `InputSource`, `ActiveIdentifier`, and the `DisplayOrder` list all start at `1`, never `0`) — this resolved the ordering bug completely. | Directly fixes the isolated `0`-specific bug above; avoiding the value entirely is simpler and more robust than working around whatever Home app internal treats `0` as a sentinel | Reversing the list — insufficient, per the isolating test above |
| 2026-07-19 | **Implementation: `DisplayOrder`'s TLV8 payload is built with a small local encoder (`encodeDisplayOrder`, ~10 lines) rather than importing `@homebridge/hap-nodejs`'s own `tlv.encode`.** `@homebridge/hap-nodejs` is already present in `node_modules` (a dependency of the `homebridge` devDependency) and would add zero new transitive dependencies, but it is not declared in this package's own `package.json` — importing it directly failed the repo's knip pre-commit gate (undeclared dependency) and violates the "no new dependencies without discussion" convention even though nothing new is actually installed. | Keeps the pre-commit gate green without a dependency discussion for a few bytes of TLV8 framing; the same reasoning (implicit runtime availability via the host Homebridge process) that lets this codebase import types from `'homebridge'` without declaring it would apply equally to `@homebridge/hap-nodejs`, so revisiting this — declaring it properly, or adding a knip ignore — is a reasonable option for the real (non-spike) implementation if more TLV8/HAP-internals usage comes up | Declaring `@homebridge/hap-nodejs` as a dependency and importing its `tlv.encode` — viable alternative, not chosen for the spike to avoid a dependency discussion mid-session |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## HomeKit reality check — RESOLVED (spike, 2026-07-18)

The blocking spike is complete; all three open questions are answered and the
Television + InputSource path is the confirmed architecture (Plan B retired). See
the 2026-07-18 rows in Decisions & findings for the full evidence. Settled
summary:

1. **External-accessory publishing works.** Televisions are published via
   `api.publishExternalAccessories(PLUGIN_NAME, [accessory])` (not bridged). The
   spike paired and operated one successfully on a real device; the failures
   encountered along the way were all local network/harness issues (WiFi
   flakiness, an mDNS/loopback binding quirk, a stale-pairing-cache issue from a
   bad bridge `username`, an `homebridge.local` mDNS name collision) — **none
   are code problems**. This is new wiring in `discoverDevices` / `platform.ts`.
2. **Power-model clash is real but solvable — must be built, not hoped.** Two
   independent HAP characteristics (`Active` on the external TV and `On` on the
   bridged Switch/Lightbulb) both reading `deviceIsOn()` visibly disagreed after a
   power change in the spike, because the spike accessory had no reactive refresh.
   The v1 implementation keeps both in lock-step by wiring the external TV
   accessory into the existing gabbo `gabboEvents` refresh path (see the
   power-clash decision row). The existing `On` surface is **kept**, not replaced.
3. **UX is acceptable, with two knowns to document for users:** (a) HomeKit
   renders a TV accessory as a full-screen "remote" (power toggle + vertical input
   list), a different paradigm from the plugin's tile-based accessories; (b)
   HomeKit's pairing-time input-naming step ignores the accessory's
   `ConfiguredName` and always shows generic placeholders, so users must manually
   (re)name inputs once during setup. Neither is bypassable from the accessory.

**Plan B (per-source Switches) is retired** — kept only in the Decisions &
findings record for history.

Grounded in the spike; the throwaway `SoundTouchTVSpikeAccessory.ts` is a
reference for *what worked*, not code to reuse.

- **New** `src/accessories/SoundTouchTVAccessory.ts` (real replacement for the
  spike file) — a proper wrapper for the external Television accessory. Owns the
  `PlatformAccessory` (category `TELEVISION`), the `Television` service, the
  `InputSource` services, and AccessoryInformation with a **stable, unique**
  `SerialNumber` and a **stable UUID** (`uuid.generate(<device.id>-tv)` — distinct
  from the bridged accessory's `uuid.generate(device.id)`). Builds InputSources
  from `api.getSources()` filtered by `status === SourceStatus.ready` **and**
  `source !== 'SPOTIFY'` **and** `source !== 'ALEXA'` **and** `source !== 'TUNEIN'`
  (a bare "browse TuneIn" tile isn't meaningful — presets are the intended path
  to TuneIn content), **except** `BLUETOOTH` is always included regardless of
  `status` (per the 2026-07-19 findings — Bluetooth's `UNAVAILABLE` status just
  means nothing is currently paired, and selecting it is what triggers pairing
  mode); maps each to a **1-based** stable `Identifier` (never `0` — see the
  round-3 `DisplayOrder` finding); sets an explicit `DisplayOrder` characteristic
  (a TLV8 list of those 1-based identifiers in the intended display order — the
  Home app does not reliably fall back to registration/`Identifier` order
  without it); `ActiveIdentifier` `onSet` → `api.selectSource({ source,
  sourceAccount })`; current source reflected from `getNowPlaying().contentItem`
  matched by **`source` + `location` together, not `source` alone** (multiple
  inputs — e.g. several TuneIn presets — can share the same `source`, distinguished
  only by `location`).
- **New** `src/accessories/services/SoundTouchSpeakerActiveCharacteristic.ts` (or
  reuse/parameterise `SoundTouchSpeakerOnCharacteristic`) — the TV `Active` power
  characteristic. Must declare `gabboEvents` identical to the bridged `On`
  characteristic (`connectionStateUpdated`, plus the now-playing/selection event
  that carries source changes) so it refreshes reactively and stays in lock-step
  with the bridged `On` tile. Same `deviceIsOn()`/`pressKey(power)` mechanism.
- **New** source-selection characteristic (`ActiveIdentifier`) — `onSet` calls
  `selectSource`; `refresh()`/`onGet` reads `getSource()` and maps back to the
  input identifier; subscribes to the gabbo source-change event so switching the
  source on the device (or via a preset button) reflects back into HomeKit.
- `src/platform.ts` / `discoverDevices()` — for each device with
  `sourceSelectionEnabled`, build the TV wrapper and publish it via
  `api.publishExternalAccessories(PLUGIN_NAME, [accessory])`. External accessories
  are **not** in Homebridge's normal cache lifecycle, so keep them out of the
  `_accessories`/`_discoveredCacheUUIDs` bridged-cache reuse/prune loops; track and
  tear them down (stop gabbo/polling) alongside the bridged wrappers on `shutdown`
  and when a device disappears. Remove the `_maybeRunTVSpike` env-var hook and the
  spike import once the real path lands.
- `config.schema.json` + `src/ExternalPlatformConfig.ts` +
  `src/PlatformConfiguration.ts` — add the opt-in `sourceSelectionEnabled` flag
  (per-accessory, mergeable from `global`, default off), mirrored in all three
  plus `src/__tests__/PlatformConfiguration.test.ts`.
- **In v1 scope (user directive, overrides the earlier deferral):**
  presets-as-inputs — build the InputSource list from `getSources()` (filtered
  `status === ready && source !== 'SPOTIFY'`) **plus** `getPresets()` (each
  preset's `ContentItem`, also excluding any `source === 'SPOTIFY'` preset for
  consistency), combined into one identifier-mapped list. `ActiveIdentifier`
  onSet calls `selectSource(item.contentItem)` for either kind uniformly.
  **Revised per the 2026-07-19 findings:** always list all 6 preset slots (label
  `Preset 1`…`Preset 6`, keyed by `Preset.id`), not just populated ones; an empty
  slot's `ActiveIdentifier` `onSet` presses the matching `PRESET_n` key instead of
  calling `selectSource` (no `ContentItem` to select).
- **Confirmed feasible and fully working end-to-end (round 2 + round 3 spikes),
  scope decision (ship in v1 vs. a follow-up) not yet made — flag for the next
  planning pass:** a linked `TelevisionSpeaker` service (real
  `Volume`/`Mute`/`VolumeSelector`, wired the same way as the existing
  Brightness-based volume characteristic — **must use
  `VolumeControlType.RELATIVE_WITH_CURRENT`, not `ABSOLUTE`**, or the on-screen
  remote's volume/mute buttons are inert; see the round-3 finding), `RemoteKey`
  handling (D-pad cycles the input list — pivoting off HomeKit's own cached
  `ActiveIdentifier`, not a live device lookup, see the round-3 STANDBY-bug
  finding — left/right/rewind/fast-forward skip tracks, center toggles
  play/pause), and `CurrentMediaState` (from `getNowPlaying().playStatus`). All
  three were exercised live against a real device across two sessions and
  confirmed working, including the on-screen remote's actual volume/mute
  buttons (not just typecheck-clean) — see the 2026-07-19 Decisions & findings
  rows for the exact mapping and rationale. None of this is required for source
  *selection* itself; it's an opportunistic expansion of the same Television
  accessory's remote-control surface that the spike happened to prove out. If
  this ships, the real `InputSource`-picker implementation also needs the
  round-3 fixes: 1-based `Identifier`/`ActiveIdentifier`/`DisplayOrder` values
  (never `0`), an explicit `DisplayOrder` characteristic, and current-input
  matching by `source` + `location` (not `source` alone).

**Roadmap dependency:** this plan is self-contained (API already implemented) and
has no hard dependency on other plans. It does add external-accessory publishing
to `platform.ts`, which lightly overlaps the PWA plan's `discoverDevices` changes
— sequence to avoid a merge collision but no functional coupling.

## Conventions for this change

- **Commit type:** `feat:` → minor release.
- **Config schema touched:** **yes** — add `sourceSelectionEnabled` (opt-in,
  default off); mirror in `config.schema.json`, `src/ExternalPlatformConfig.ts`,
  `src/PlatformConfiguration.ts`, and `src/__tests__/PlatformConfiguration.test.ts`.
- **Tests to add/update:** unit-test source→identifier mapping, the SPOTIFY +
  `status` filtering, and the `selectSource` `ContentItem` construction (pure
  logic); config default/merge behaviour for `sourceSelectionEnabled`. HAP /
  Television / external-publishing wiring is hard to unit-test — verify on device.
- Use **soundtouch-api-expert** for the `/sources` + `/select` payload shapes and
  **homebridge-developer** for the verified-plugin / real-HAP-types rules; follow
  **coding-conventions** for style/tests.
- **Target branch:** `dev`.

## Implementation checklist

- [x] **Spike:** Television + InputSource prototyped on a real speaker; TV path
      confirmed, Plan B retired, power-clash + Spotify + UX questions resolved
      (2026-07-18, `spike/tv-input-source`). Spike code is reference-only.
- [x] **Spike round 2:** RemoteKey transport controls, linked `TelevisionSpeaker`
      volume/mute, `CurrentMediaState`, always-listed numbered preset slots, and
      always-on Bluetooth all confirmed working live on the same real device
      (2026-07-19, same branch). Scope decision on whether the remote/volume/
      media-state surface ships in v1 or a follow-up is still open — see the
      "confirmed feasible" bullet above.
- [x] **Spike round 3** (2026-07-19, same day/branch): found and fixed three
      real bugs from extended live testing — ambiguous same-source current-input
      matching, cycling resetting whenever the device is off/on an unlisted
      source, and a Home app `DisplayOrder`/identifier-`0` picker-ordering quirk
      — plus confirmed the `TelevisionSpeaker` volume/mute buttons actually work
      end-to-end once `VolumeControlType` is `RELATIVE_WITH_CURRENT`. All fixes
      folded into the checklist items below.
- [ ] Add opt-in `sourceSelectionEnabled` config (default off) across
      `config.schema.json` + `ExternalPlatformConfig.ts` + `PlatformConfiguration.ts`
- [ ] New `SoundTouchTVAccessory` wrapper: TV service + AccessoryInformation
      (stable unique SerialNumber, stable `<device.id>-tv` UUID)
- [ ] Build InputSources from `getSources()`, filtered
      `status === ready && source !== 'SPOTIFY' && source !== 'ALEXA' && source
      !== 'TUNEIN'`, except `BLUETOOTH` always included regardless of `status`;
      map to **1-based** stable identifiers (never `0` — see round-3 findings);
      set an explicit `DisplayOrder` characteristic (TLV8 list of those
      identifiers in display order)
- [ ] Add all 6 preset slots to the same InputSource list, listed **before**
      plain sources, labeled `Preset 1`…`Preset 6` (not the stored station
      name); populated slots use `selectSource(preset.contentItem)`, empty
      slots press the matching `PRESET_n` key (in v1 — user directive, revised
      2026-07-19)
- [ ] `ActiveIdentifier` onSet → `selectSource(item.contentItem)` (uniform for
      both plain sources and presets); onGet/refresh ← match
      `getNowPlaying().contentItem` by **`source` + `location` together** (not
      `source` alone — same-source presets are otherwise indistinguishable),
      subscribed to the gabbo source-change event
- [ ] If the D-pad/cycling surface ships: pivot cycling off HomeKit's own
      cached `ActiveIdentifier` value, not a fresh device lookup each press
      (the device's live source is ambiguous or absent whenever it's off or on
      an unlisted source — see the round-3 STANDBY-bug finding); skip
      unavailable/empty entries (`available: false`) rather than landing on them
- [ ] TV `Active` power characteristic wired into the **same `gabboEvents`
      refresh path** as the bridged `On` — keep the two power tiles in lock-step
      (the power-clash fix); keep the existing `On` surface, do not replace it
- [ ] `publishExternalAccessories` wiring in `discoverDevices` for enabled
      devices; keep external accessories out of the bridged cache reuse/prune
      loops; tear down (gabbo/polling) on shutdown and on device removal
- [ ] Remove the `_maybeRunTVSpike` env hook + `SoundTouchTVSpikeAccessory` import
      from `platform.ts`, and delete the throwaway spike accessory file
- [ ] Tests: source→identifier mapping (1-based, never `0`), preset→identifier
      mapping, SPOTIFY/ALEXA/TUNEIN/`status` filtering (both sources and
      presets, including the always-on Bluetooth special case), `ContentItem`
      construction, always-listed 6 preset slots (populated vs. empty →
      `PRESET_n` key), current-input matching by `source` + `location` together
      (same-source-presets disambiguation), and `sourceSelectionEnabled` config
      default/merge

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [x] **On-device: presets-as-inputs actually selectable and playable from the
      Home app** — live-verified during the 2026-07-19 round-2 spike session
      (selecting a preset input actually tuned the station on the real speaker)
- [x] **On-device: Home app input picker shows presets 1–6 then sources, in the
      correct order** — live-verified during the 2026-07-19 round-3 spike
      session, required the 1-based-identifier + `DisplayOrder` fix (identifier
      `0` otherwise always rendered last regardless of list position)
- [x] **On-device: `TelevisionSpeaker` volume rocker and mute actually move the
      real speaker's volume from the on-screen remote** — live-verified during
      round 3; required `VolumeControlType.RELATIVE_WITH_CURRENT` (not
      `ABSOLUTE`, which left the buttons inert)
- [ ] On-device: TV `Active` and bridged `On` tiles stay in lock-step after a
      power change made via either one (the power-clash fix)
- [ ] `npm run watch` — on a real speaker (`sourceSelectionEnabled: true`):
      confirm the external Television pairs, sources appear (no SPOTIFY, no email
      addresses), selecting one changes the playing source, and the current source
      reflects back. Exercise both a fresh install and a cached accessory.
- [ ] **Power lock-step (the spike's key failure):** toggle power from the TV's
      `Active`, confirm the bridged Switch/Lightbulb `On` tile updates reactively
      (no stale disagreement), and vice-versa.
- [ ] With `sourceSelectionEnabled` off (default), confirm no external accessory
      is published and existing topology is unchanged.

## PR / release notes

- **PR title:** `feat: add source selection`
- **Targets:** `dev`
