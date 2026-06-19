# homebridge-soundtouch-speaker

[![npm version](https://badge.fury.io/js/homebridge-soundtouchspeaker.svg)](https://badge.fury.io/js/homebridge-soundtouchspeaker)
[![npm downloads](https://badgen.net/npm/dt/homebridge-soundtouchspeaker)](https://badgen.net/npm/dt/homebridge-soundtouchspeaker)

[Bose SoundTouch](https://www.bose.com/soundtouch-systems.html) plugin for [Homebridge](https://github.com/homebridge/homebridge).

This allows you to control your SoundTouch devices with HomeKit and Siri.

Attempts to repair the [plugin](https://github.com/bbriatte/homebridge-soundtouch-platform/blob/master/README.md) originally
made by [@bbriatte](http://github.com/bbriatte) to work on current Homebridge (v1.8 and v2).

Initial version only supports a switch accessory type, to power a speaker on and off. Future versions hope to reinstate support
for other features like volume control, sources, presets, lightbulb mode if there is demand.

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
Example `config.json` to discover all SoundTouch accessories

```json
{
    "platform": "SoundTouchHomebridgePlugin",
    "discoverAllAccessories": true
}
```

Example `config.json` to register a SoundTouch accessory using the speaker name from the Bose Soundtouch app:

```json
{
    "platform": "SoundTouchHomebridgePlugin",
    "discoverAllAccessories": false,
    "accessories": [
        {
            "name": "Kitchen Speaker",
            "room": "Kitchen"
        }
    ]
}
```

Example `config.json` to register a SoundTouch accessory using the ip address of the speaker:

```json
{
    "platform": "SoundTouchHomebridgePlugin",
    "discoverAllAccessories": false,
    "accessories": [
        {
            "name": "Kitchen Speaker",
            "ip": "<ip>"
        }
    ]
}
```

Example `config.json` for multiple speakers:

```json
{
    "platform": "SoundTouchHomebridgePlugin",
    "discoverAllAccessories": false,
    "accessories": [
        {
            "name": "Kitchen Speaker",
            "ip": "<ip>"
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
* `pollingInterval`: Poll this device every interval in milliseconds. Overrides the global value.


### Global element
Default configuration applied to all accessories. Any value here can be overridden per accessory.

*Optional fields*
* `verbose`: Log all device information __default__: **false**
* `pollingInterval`: Poll each device every interval in milliseconds __default__: **2000**
