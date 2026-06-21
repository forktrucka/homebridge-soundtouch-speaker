# Changelog

All notable changes to this project will be documented in this file.

Going forward this file is maintained automatically by
[`@semantic-release/changelog`](https://github.com/semantic-release/changelog).
Entries below were backfilled by hand from the git history.

---

## [0.3.0] — 2026-06-21

### New Features

- Add volume control via Lightbulb brightness (Lightbulb accessory type) (#86)
- Let each speaker be configured as a Switch or a Lightbulb accessory (`accessoryType`) (#72)
- Add volume control via Speaker service on the Switch accessory (#62)

### Fixes

- Escape XML special characters in fake SoundTouch server error responses (#110)
- Pin `undici` >=6.27.0 to address security advisories (Dependabot #62, #64, #65) (#95)
- Prevent brightness-zero/setOn race that bounced volume back to its previous level (#91)
- Use `softwareVersion` from SCM component for the FirmwareRevision characteristic (#85)
- Stop device polling on accessory removal/shutdown; honour `pollingInterval` config (#65)
- Correct SoundTouch API spec mismatches (response shapes, field names) (#52)

---

## [0.2.4] — 2026-06-19

### Fixes

- Correct config schema: `name` is optional, `port` is configurable (#43)
- Resolve npm deprecation warnings and address security vulnerabilities (#35)
- Fix critical bugs in polling loop, logger, and power control (#21)
- Fix error handling resilience and ESM import consistency (#22)

---

## [0.2.3] — 2025-04-27

Initial public release.
