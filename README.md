# homebridge-soundtouch-speaker

[![npm version](https://badge.fury.io/js/homebridge-soundtouchspeaker.svg)](https://badge.fury.io/js/homebridge-soundtouchspeaker)
[![npm downloads](https://badgen.net/npm/dt/homebridge-soundtouchspeaker)](https://badgen.net/npm/dt/homebridge-soundtouchspeaker)

Bose SoundTouch plugin for [Homebridge](https://github.com/homebridge/homebridge).

This allows you to control your SoundTouch devices with HomeKit and Siri.

Attempts to repair the [plugin](https://github.com/bbriatte/homebridge-soundtouch-platform/blob/master/README.md) originally
made by [@bbriatte](http://github.com/bbriatte) to work on current Homebridge (v1.8 and v2).

Currently supports powering speakers on and off as a Switch or Lightbulb accessory. The Lightbulb type exposes volume via the Brightness characteristic, so Siri commands like "set Kitchen Speaker to 40%" control the volume.

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

Register speakers by IP address:

```json
{
    "platform": "SoundTouchHomebridgePlugin",
    "accessories": [
        {
            "name": "Kitchen Speaker",
            "ip": "192.168.1.100",
            "accessoryType": "lightbulb"
        },
        {
            "name": "Living Room Speaker",
            "ip": "192.168.1.101"
        }
    ]
}
```

Mix of IP and room, with global defaults:

```json
{
    "platform": "SoundTouchHomebridgePlugin",
    "global": {
        "accessoryType": "lightbulb",
        "pollingInterval": 5000
    },
    "accessories": [
        {
            "name": "Kitchen Speaker",
            "ip": "192.168.1.100"
        },
        {
            "name": "Living Room Speaker",
            "room": "Living Room"
        }
    ]
}
```

### Platform element
*Required fields*
* `platform`: Must always be **SoundTouchHomebridgePlugin** 

*Optional fields*
* `discoverAllAccessories`: Discover all accessories on the local network __default__: **false**  
* `accessories`: Array of **Accessory element** ignored if `discoverAllAccessories` is set to true.
* `global`: Default configuration for all accessories. see **Global element**

### Accessory element
Each accessory must be matched to a device using either `ip` or `room`. If both are set, `ip` takes precedence.

*Optional fields*
* `name`: The name used for the accessory in HomeKit. Defaults to the device's own name as reported by the speaker.
* `ip`: The ip address of your device on your network.
* `port`: The port used to reach the device. Only used with `ip`. __default__: **8090**
* `room`: Must match exactly the name of the SoundTouch device (as set in the Bose app). Ignored if `ip` is set.
* `accessoryType`: Override the HomeKit accessory type for this speaker — `switch` or `lightbulb`. Overrides the global value.
* `disabled`: When `true`, removes this speaker from HomeKit without deleting the config entry. Set back to `false` to re-register. __default__: **false**
* `pollingInterval`: ~~Deprecated — no longer used and can be removed from your config.~~


### Global element
Default configuration applied to all accessories. Any value here can be overridden per accessory.

*Optional fields*
* `logLevel`: Minimum log level written to the Homebridge console — `debug`, `info`, `warn`, or `error`. __default__: **info**
* `accessoryType`: HomeKit accessory type for all speakers — `switch` (default) or `lightbulb`. The `lightbulb` type exposes volume via the Brightness characteristic. __default__: **switch**
* `verbose`: ~~Deprecated — use `logLevel: "debug"` instead.~~
* `pollingInterval`: ~~Deprecated — no longer used and can be removed from your config.~~

## References
* [SoundTouch Web API](https://assets.bosecreative.com/m/496577402d128874/original/SoundTouch-Web-API.pdf) — Bose's official API specification this plugin is built against.
