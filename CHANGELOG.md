## [0.4.0-beta.1](https://github.com/forktrucka/homebridge-soundtouch-speaker/compare/v0.3.0...v0.4.0-beta.1) (2026-06-25)

### New Features

* add disabled flag to unregister a speaker from HomeKit without removing config ([#119](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/119)) ([b0511af](https://github.com/forktrucka/homebridge-soundtouch-speaker/commit/b0511afe8d58f27bf670dc806cc97b237c8e3532))
* add gabbo WebSocket client for push updates ([#117](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/117)) ([449e1e3](https://github.com/forktrucka/homebridge-soundtouch-speaker/commit/449e1e370a74bf6e3d5fbb2f71cd53941f057c6f))
* add logLevel config and structured error chaining with cause context ([#120](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/120)) ([01c5db6](https://github.com/forktrucka/homebridge-soundtouch-speaker/commit/01c5db68ee3044de7407372164f1bd60f2813f2c))
* internet radio via TuneIn presets and bose-cloud emulator ([#118](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/118)) ([cb6a04f](https://github.com/forktrucka/homebridge-soundtouch-speaker/commit/cb6a04f693a21a0e727c3f9a9af33026fbcb5cb1))

### Fixes

* debounce gabbo WebSocket notifications to avoid redundant refreshes ([#124](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/124)) ([b359030](https://github.com/forktrucka/homebridge-soundtouch-speaker/commit/b35903066b51387c01f57cf1020df92641af1475))
* map gabbo events to specific characteristics instead of full refresh ([#125](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/125)) ([cd6478d](https://github.com/forktrucka/homebridge-soundtouch-speaker/commit/cd6478dfa9dcc757f924cb0655a3f818cae84374))
* skip disabled accessories before any network calls ([#123](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/123)) ([8859a2c](https://github.com/forktrucka/homebridge-soundtouch-speaker/commit/8859a2c4941ee39ec8ec32b7d51d334836870ddf))
* skip reconciliation poll when speaker is offline ([#127](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/127)) ([e5876ee](https://github.com/forktrucka/homebridge-soundtouch-speaker/commit/e5876ee12c14e4661dead6e0d3d73dd70eb7935e))

# Changelog

## [0.3.0](https://github.com/forktrucka/homebridge-soundtouch-speaker/compare/v0.2.4...v0.3.0) (2026-06-21)

### New Features

* let each speaker be configured as a Switch or a Lightbulb accessory (`accessoryType`) ([#72](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/72))
* add volume control via Speaker service on the Switch accessory ([#62](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/62))
* add volume control via Lightbulb brightness ([#86](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/86))

### Fixes

* correct SoundTouch API spec mismatches (response shapes, field names) ([#52](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/52))
* stop device polling on accessory removal/shutdown; honour `pollingInterval` config ([#65](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/65))
* use `softwareVersion` from SCM component for the FirmwareRevision characteristic ([#85](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/85))
* prevent brightness-zero/setOn race that bounced volume back to its previous level ([#91](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/91))
* pin `undici` >=6.27.0 to address security advisories ([#95](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/95))
* escape XML special characters in fake SoundTouch server error responses ([#110](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/110))

---

## [0.2.4](https://github.com/forktrucka/homebridge-soundtouch-speaker/compare/v0.2.3...v0.2.4) (2026-06-19)

### Fixes

* correct config schema: `name` is optional, `port` is configurable ([#43](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/43))
* fix critical bugs in polling loop, logger, and power control ([#21](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/21))
* fix error handling resilience and ESM import consistency ([#22](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/22))
* resolve npm deprecation warnings and address security vulnerabilities ([#35](https://github.com/forktrucka/homebridge-soundtouch-speaker/issues/35))

---

## 0.2.3 (2025-04-27)

Initial public release.
