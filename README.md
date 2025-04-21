# homebridge-soundtouch-platform

[![npm version](https://badge.fury.io/js/homebridge-soundtouchspeaker.svg)](https://badge.fury.io/js/homebridge-soundtouchspeaker)
[![npm downloads](https://badgen.net/npm/dt/homebridge-soundtouchspeaker)](https://badgen.net/npm/dt/homebridge-soundtouchspeaker)

[Bose SoundTouch](https://www.bose.com/soundtouch-systems.html) plugin for [Homebridge](https://github.com/nfarina/homebridge)

This allows you to control your SoundTouch devices with HomeKit and Siri.

Attempts to repair the [plugin](https://github.com/bbriatte/homebridge-soundtouch-platform/blob/master/README.md) originally 
made by [@bbriatte](http://github.com/bbriatte) to work on Homebridge v1.8.

Initial version only supports a switch accessory type, to power a speaker on and off. Future versions hope to reinstate support
other features like volume control, sources, presets, lightbulb mode if there is demand.

## Prerequisites
1. [Homebridge](https://github.com/homebridge/homebridge) v1.8.0 or later
2. Node 18, 20, or 22

## Installation
1. Install the plugin to homebridge `hb-service add homebridge-soundtouchspeaker@beta` 
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
*Optional fields*
* `name`: The name you want to use to control the SoundTouch. Defaults to the name of the device suffixed with speaker.
* `ip`: The ip address of your device on your network.
* `room`: Should match exactly with the name of the SoundTouch device. Ignored if `ip` is set.


### Global element
*Optional fields*
* `verbose`: Log all device information
* `pollingInterval`: If set, poll the device each interval
