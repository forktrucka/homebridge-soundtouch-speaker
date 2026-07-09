---
feature: Publish firmware version as FirmwareRevision characteristic
status: done # 2026-06-21
date: 2026-06-20
branch: test/firmware-revision-coverage
commit-type: test
---

# Publish firmware version as FirmwareRevision characteristic

## Context

The user asked whether the plugin can fetch and publish the SoundTouch speaker's
firmware version to HomeKit's `FirmwareRevision` characteristic. **The production
code already does this end-to-end** — no new feature code is needed. The only gap
is test coverage: nothing currently asserts that `FirmwareRevision` is actually
populated on the `AccessoryInformation` service.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-20 | Feature is already fully implemented | `component.ts` parses `softwareVersion`; `SoundTouchDevice.fromDiscoveredAccessory` sets `device.version`; `SoundTouchSpeakerInformationCharacteristic.init()` conditionally sets `FirmwareRevision` | N/A |
| 2026-06-20 | Version is derived from the component whose `serialNumber` matches `info.deviceId` (case-insensitive) | `SoundTouchDevice.ts:187-189` | Could use first component or `componentCategory === 'DEVICE'` — but serial=deviceId is the established convention in the codebase and matches what real SoundTouch devices return |
| 2026-06-20 | `FirmwareRevision` is only set when a matching component is found (`if (this.device.version)`) | `SoundTouchSpeakerInformationCharacteristic.ts:40-45` — the conditional avoids publishing an empty string | Skipping the conditional would set an empty value in HAP |
| 2026-06-20 | Homebridge stub already has `FirmwareRevision` in `CharacteristicTypes` and `AccessoryInformation` service pre-populated | `homebridge-stub.ts:31`, `85-88` | — |
| 2026-06-20 | `infoXml()` in the fake server already sets `serialNumber: deviceId` so the component match succeeds | `fake-soundtouch-server.ts:17-18` | — |

## If cancelled

> Leave empty — not cancelled.

## Affected areas

- `src/__integration__/platform-lifecycle.integration.test.ts` — add two new `it` blocks (firmware present / firmware absent)
- `src/__integration__/helpers/fake-soundtouch-server.ts` — expose an option to omit the matching component so the "absent" case can be tested

## Conventions for this change

- **Commit type:** `test:` → no release
- **Config schema touched:** no
- **Tests to add/update:** `src/__integration__/platform-lifecycle.integration.test.ts`
- **Target branch:** `dev` (squash-merged; PR title is the released commit message).

## Implementation checklist

- [ ] Extend `infoXml()` in `fake-soundtouch-server.ts` to accept an optional `softwareVersion` parameter (default `'1.0.0'`) and a `matchSerialToDeviceId` flag (default `true`); when `false`, emit a component with a different serial so no version match occurs
- [ ] In `platform-lifecycle.integration.test.ts`, add a `describe('FirmwareRevision characteristic')` block with:
  - [ ] `it('sets FirmwareRevision to the component softwareVersion when the serial matches')` — assert `api.getCharacteristicValue('AccessoryInformation', 'FirmwareRevision')` equals `'1.0.0'`
  - [ ] `it('does not set FirmwareRevision when no component serial matches the device id')` — assert value is `undefined`

> shipped; checklist was not maintained

## Verification

- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm test`

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `test: verify FirmwareRevision is published from /info component softwareVersion`
- **Targets:** `dev`