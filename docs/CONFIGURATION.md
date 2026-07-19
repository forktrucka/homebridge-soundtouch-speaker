# Configuration reference

Full field-by-field reference for every option this plugin supports. For a
quick start, see the [README](../README.md#configuration). For setting up
TuneIn presets and the built-in Bose Cloud emulator specifically, see
[Internet radio (TuneIn) after the Bose cloud shutdown](bose-cloud-setup.md).

## Platform element

*Required fields*

- `platform`: Must always be **SoundTouchHomebridgePlugin**

*Optional fields*

- `discoverAllAccessories`: Discover all accessories on the local network. __default__: **false**
- `accessories`: Array of **Accessory element**. Ignored if `discoverAllAccessories` is `true`.
- `zones`: Array of **Zone element** — multi-room speaker groups.
- `global`: Default configuration for all accessories. See **Global element**.
- `presets`: Top-level alias for `global.presets` — prefer setting presets under `global` (see **Presets**). Hidden in the Homebridge UI once `global.presets` has any entries.

## Accessory element

Each accessory must be matched to a device using either `ip` or `room`. If both are set, `ip` takes precedence.

*Optional fields*

- `name`: The name used for the accessory in HomeKit. Defaults to the device's own name as reported by the speaker.
- `ip`: The IP address of your device on your network.
- `port`: The port used to reach the device. Only used with `ip`. __default__: **8090**
- `room`: Must match exactly the name of the SoundTouch device (as set in the Bose app). Ignored if `ip` is set.
- `accessoryType`: Override the HomeKit accessory type for this speaker — `switch` or `lightbulb`. Overrides the global value.
- `disabled`: When `true`, removes this speaker from HomeKit without deleting the config entry. Set back to `false` to re-register. __default__: **false**
- `presetSyncEnabled`: Override preset sync for this speaker. When set, takes precedence over `global.presetSyncEnabled`. Only shown when `global.server.enabled` is `true`.
- `pollingInterval`: ~~Deprecated — no longer used and can be removed from your config.~~

## Zone element

Zones group a primary speaker with one or more slave speakers into a single
HomeKit accessory. Turning the zone on starts multi-room playback across all
members; turning it off dissolves the group. No separate setup beyond the
config below.

*Required fields*

- `name`: Name shown in HomeKit for this zone.
- `primary`: Name of the master speaker for this zone, matching its name under `accessories` (or its device-reported name).
- `slaves`: Array of speaker names to group with the primary when this zone is turned on. At least one required.

*Optional fields*

- `accessoryType`: HomeKit accessory type for this zone — `switch` or `lightbulb`. The `lightbulb` type also exposes zone volume via Brightness, shifting every member speaker's volume by the same relative amount. __default__: **switch**
- `defaultSource`: Play a configured source on the primary when the zone activates idle (see **Zone default source** below). Never overrides an already-playing primary.

**Renaming is safe.** Once a zone's `primary`/`slaves` references resolve to real devices, the assignment is remembered by each speaker's stable identity (its hardware id) — renaming a speaker later, either in this config or from the Bose app, does not break the zone. You do not need to update `primary`/`slaves` after a rename.

### Zone default source

```json
{
  "zones": [
    {
      "name": "Downstairs",
      "primary": "Kitchen",
      "slaves": ["Lounge", "Dining Room"],
      "accessoryType": "lightbulb",
      "defaultSource": {
        "type": "preset",
        "slot": 1
      }
    }
  ]
}
```

- `defaultSource.type`: Kind of default source. Currently only `preset` is supported.
- `defaultSource.slot`: Preset slot (1–6) on the *primary* speaker to select when the zone activates and the primary isn't already playing anything meaningful. If the primary is already playing something, activating the zone never interrupts it.

## Global element

Default configuration applied to all accessories. Any value here can be overridden per accessory (or, for zones, per zone via that zone's own `accessoryType`).

*Optional fields*

- `logLevel`: Minimum log level written to the Homebridge console — `debug`, `info`, `warn`, or `error`. __default__: **info**
- `accessoryType`: HomeKit accessory type for all speakers — `switch` (default) or `lightbulb`. The `lightbulb` type exposes volume via the Brightness characteristic. __default__: **switch**
- `presets`: Array of **Preset element** — station presets to push to all speakers when preset sync runs. Only shown when `server.enabled` is `true`. See **Presets & TuneIn sync**.
- `presetSyncEnabled`: When `true`, the plugin pushes the configured presets to all speakers on the schedule below. Only shown when `server.enabled` is `true`. __default__: **false**
- `presetSyncSchedule`: Cron expression controlling when preset sync runs. Standard 5-field syntax (minute, hour, day-of-month, month, day-of-week) is fully supported. Only shown when `server.enabled` and `presetSyncEnabled` are both `true`. __default__: **`0 0 * * *`** (midnight daily)
- `server`: Local HTTP server that receives Bose Cloud push notifications and serves TuneIn preset lookups — see **Bose Cloud server** below.
- `verbose`: ~~Deprecated — use `logLevel: "debug"` instead.~~
- `pollingInterval`: ~~Deprecated — no longer used and can be removed from your config.~~

### Preset element

Each entry in `global.presets` (or the top-level `presets` alias):

- `type`: Preset type. Currently only `station` is supported.
- `slot`: Preset slot on the speaker (1–6).
- `name`: Display name for this preset.
- `tuneInId`: TuneIn station ID (e.g. `s12345`).
- `imageUrl`: Optional URL for the station artwork.

### Bose Cloud server (`global.server`)

Since Bose shut down their cloud servers, TuneIn presets require this
plugin's built-in local emulator. Full setup — including the one-time
speaker "uncorking" step required before this will work — is documented in
[Internet radio (TuneIn) after the Bose cloud shutdown](bose-cloud-setup.md).
Field reference:

- `enabled`: Enable the local callback server. __default__: **false**
- `host`: Hostname or IP that Bose's cloud (as redirected by uncorking) uses to reach this server. __default__: **homebridge.local**
- `port`: Port the callback server listens on. __default__: **8000**

## Examples

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
    "accessoryType": "lightbulb"
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

A multi-room zone with a default source, grouping two already-registered speakers:

```json
{
  "platform": "SoundTouchHomebridgePlugin",
  "discoverAllAccessories": true,
  "zones": [
    {
      "name": "Downstairs",
      "primary": "Kitchen",
      "slaves": ["Lounge"],
      "accessoryType": "lightbulb",
      "defaultSource": {
        "type": "preset",
        "slot": 1
      }
    }
  ]
}
```

TuneIn presets synced nightly via the built-in Bose Cloud emulator (requires
speaker uncorking — see [bose-cloud-setup.md](bose-cloud-setup.md)):

```json
{
  "platform": "SoundTouchHomebridgePlugin",
  "discoverAllAccessories": true,
  "global": {
    "server": {
      "enabled": true
    },
    "presetSyncEnabled": true,
    "presetSyncSchedule": "0 0 * * *",
    "presets": [
      { "type": "station", "slot": 1, "name": "More FM Auckland", "tuneInId": "s7162" },
      { "type": "station", "slot": 2, "name": "RNZ National", "tuneInId": "s15720" }
    ]
  }
}
```
