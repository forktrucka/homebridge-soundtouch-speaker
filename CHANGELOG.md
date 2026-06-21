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
