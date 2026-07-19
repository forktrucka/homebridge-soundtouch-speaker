# homebridge-soundtouch-speaker

[![npm version](https://badge.fury.io/js/homebridge-soundtouchspeaker.svg)](https://badge.fury.io/js/homebridge-soundtouchspeaker)
[![npm downloads](https://badgen.net/npm/dt/homebridge-soundtouchspeaker)](https://badgen.net/npm/dt/homebridge-soundtouchspeaker)

Bring your Bose SoundTouch speakers into HomeKit and Siri — turn them on/off
or set the volume by voice, group them into multi-room zones, and keep TuneIn
radio presets working even though Bose shut down the cloud servers they used
to depend on.

Originally a repair of the [plugin](https://github.com/bbriatte/homebridge-soundtouch-platform/blob/master/README.md)
by [@bbriatte](http://github.com/bbriatte) to work on current Homebridge
(v1.8 and v2) — it's since grown well beyond that.

## Features

- **Speakers as Switch or Lightbulb accessories**, with Siri volume control on the Lightbulb type.
- **Multi-room zones** — group speakers into a single HomeKit accessory that starts/stops synchronized playback across all members. See [zones in the configuration reference](docs/CONFIGURATION.md#zone-element).
- **TuneIn preset restoration** — Bose shut down their cloud servers, breaking TuneIn presets on real hardware. This plugin runs a local emulator so presets keep working. See [Internet radio (TuneIn) after the Bose cloud shutdown](docs/bose-cloud-setup.md).

## Prerequisites
1. [Homebridge](https://github.com/homebridge/homebridge) v1.8.0 or later (Homebridge v2 is supported)
2. Node.js 22 or 24

## Installation
Install through the [Homebridge UI](https://github.com/homebridge/homebridge-config-ui-x) (search for **SoundTouch Speaker**), or from the command line:

```sh
# stable
hb-service add homebridge-soundtouchspeaker

# latest pre-release
hb-service add homebridge-soundtouchspeaker@beta
```
## Configuration

Discover all SoundTouch speakers on the network automatically:

```json
{
    "platform": "SoundTouchHomebridgePlugin",
    "discoverAllAccessories": true,
    "global": {
        "accessoryType": "lightbulb"
    }
}
```

Register specific speakers by room name (as set in the Bose app):

```json
{
    "platform": "SoundTouchHomebridgePlugin",
    "accessories": [
        {
            "name": "Kitchen Speaker",
            "room": "Kitchen",
            "accessoryType": "lightbulb"
        }
    ]
}
```

That covers the common case. For every option this plugin supports —
registering by IP, multi-room **zones**, TuneIn preset sync, and the full
field reference — see **[docs/CONFIGURATION.md](docs/CONFIGURATION.md)**.

## References
* [SoundTouch Web API](https://assets.bosecreative.com/m/496577402d128874/original/SoundTouch-Web-API.pdf) — Bose's official API specification this plugin is built against.
* [Configuration reference](docs/CONFIGURATION.md) — every field this plugin's config supports.
* [Internet radio (TuneIn) after the Bose cloud shutdown](docs/bose-cloud-setup.md) — restoring TuneIn presets, including the one-time speaker "uncorking" step.
