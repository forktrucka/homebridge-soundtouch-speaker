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
`selectSource()` driven by `ActiveIdentifier`. ⚠️ This is the riskiest item — see
the HomeKit reality check before committing to it.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-19 | Provisional: Television + InputSource for source selection, **pending a spike** | The "correct" HomeKit input picker | Per-source Switches (kept as documented Plan B); read-only current-source |
| 2026-06-19 | Finding: the API already implements `getSources`/`selectSource`/`getSource` | No protocol work; pure HomeKit wiring | — |
| 2026-06-19 | Risk/finding: Televisions generally need external publishing, `Active` clashes with our `On` power model, and the picker UX is buried | Could force the Plan-B fallback — resolve in the spike before building out | — |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## HomeKit reality check (resolve via a spike FIRST)

The Television/InputSource pattern is the *correct* HomeKit input picker, but has
real caveats that need verifying on a real device + the Home app before building
out:

1. **Televisions usually must be published as external accessories**
   (`api.publishExternalAccessories(...)`), not as part of the bridged platform —
   multiple TVs on one bridge are known to misbehave. This plugin currently only
   bridges accessories, so this is new wiring in `discoverDevices`.
2. **Power model clash:** a Television has its own `Active` characteristic for
   power, which overlaps the Switch/Lightbulb `On` we already use. Decide whether
   the Television is a *separate* accessory (input only) or replaces the power
   surface — don't drive power from two services inconsistently.
3. **UX:** the input picker lives in the Home app's accessory settings / the
   Control-Center Remote, not as front-and-center tiles. Confirm it's acceptable.

**Fallback if the spike shows the TV path is too rough:** expose each source as a
its own Switch (radio-button style — turning one on calls `selectSource`, and the
others turn off). Simpler, fits the existing Switch model, reliably works; cost is
multiple tiles per speaker. Keep this as the documented Plan B.

## Affected areas

- **New** `src/accessories/services/SoundTouchSpeakerSourceCharacteristic.ts` (or a
  small service wrapper) — build the Television + linked InputSource services from
  `api.getSources()` (filter `status === READY`), map each to an identifier, set
  `ConfiguredName`/`InputSourceType`, and on `ActiveIdentifier` `onSet` call
  `api.selectSource({ source, sourceAccount })`. `refresh()`/`onGet` reflects the
  current source from `api.getSource()`.
- `src/accessories/SoundTouchSpeakerPlatformAccessory.ts` — create/link the
  Television + InputSource services; if published externally, coordinate with the
  platform (below).
- `src/platform.ts` — if external publishing is required, add
  `publishExternalAccessories` wiring in `discoverDevices` and keep cache
  reuse/pruning correct for it.
- Possibly `config.schema.json` — only if source selection becomes opt-in
  (e.g. `enableSourceSelection`); decide during the spike.

## Conventions for this change

- **Commit type:** `feat:` → minor release.
- **Config schema touched:** maybe (decide in spike); if so, mirror in
  `config.schema.json` + config classes + tests.
- **Tests to add/update:** unit-test source→identifier mapping and the
  `selectSource` `ContentItem` construction (pure logic); HAP/Television wiring is
  hard to unit-test, so verify on device.
- Use **soundtouch-api-expert** for the `/sources` + `/select` payload shapes and
  **homebridge-developer** for the verified-plugin / real-HAP-types rules; follow
  **coding-conventions** for style/tests.
- **Target branch:** `dev`.

## Implementation checklist

- [ ] **Spike:** prototype a Television+InputSource on a real speaker; confirm the
      caveats above are acceptable. Decide TV-path vs per-source-Switch fallback
- [ ] Build InputSources from `getSources()` (filter `READY`); map identifiers
- [ ] `ActiveIdentifier` onSet → `selectSource({ source, sourceAccount })`
- [ ] Reflect current source on refresh/onGet via `getSource()`
- [ ] External-accessory publishing wiring (if TV path) + cache correctness
- [ ] Decide/add any opt-in config + schema
- [ ] Add tests for mapping + ContentItem construction

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run watch` — on a real speaker: confirm sources appear, selecting one
      changes the playing source, and the current source reflects back. Exercise
      both a fresh install and a cached accessory.

## PR / release notes

- **PR title:** `feat: add source selection`
- **Targets:** `dev`
