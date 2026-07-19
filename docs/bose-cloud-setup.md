# Internet radio (TuneIn) after the Bose cloud shutdown

Bose shut down their cloud servers on **6 May 2026**. This plugin restores
TuneIn presets by running a local cloud emulator **built into the plugin** that
intercepts the speaker's TuneIn lookups and proxies them through the RadioTime
OPML API. Enable it with `global.server.enabled = true` in your config.

## Before you start — uncork the speaker

Each speaker must be redirected away from Bose's dead servers to your
Homebridge host. This is called **uncorking**. The plugin expects the emulator
at `http://homebridge.local:8000` by default (configurable — see below).

**Use an IP address, not `homebridge.local`, when uncorking.** SoundTouch
speakers cannot resolve `.local` mDNS hostnames themselves — only your
Homebridge instance and other mDNS-aware clients on the network can. Uncork
with your Homebridge host's actual IP address (or another hostname the
speaker's own DNS can resolve), and set `global.server.host` to that same
value in your config.

**Recommended: use SoundCork**

[SoundCork](https://github.com/deborahgu/soundcork) (© 2025 Deborah Kaplan
and Allen Petersen, MIT licensed) handles the uncork procedure for all speaker
models, including those that require USB boot. A Docker/Kubernetes fork is
maintained by [timvw](https://github.com/timvw/soundcork) under the same
license.

When SoundCork asks for the server address, enter `homebridge.local:8000` (or
whatever you have configured for `global.server.host`/`global.server.port`).

**Manual SSH method**

SoundTouch speakers run old SSH software and require legacy cipher flags:

```sh
ssh -o HostKeyAlgorithms=+ssh-rsa \
    -o KexAlgorithms=+diffie-hellman-group14-sha1,diffie-hellman-group1-sha1 \
    root@<SPEAKER_IP>
```

Then edit the cloud config file:

```sh
vi /opt/Bose/etc/SoundTouchSdkPrivateCfg.xml
```

Set both fields to point at your Homebridge host:

```xml
<bmxRegistryUrl>http://homebridge.local:8000/bmx/registry/v1/services</bmxRegistryUrl>
<margeServerUrl>http://homebridge.local:8000/marge</margeServerUrl>
```

Replace `homebridge.local` with the host's IP address if mDNS is not available
on your network. Save the file and reboot the speaker. This change survives
normal restarts but a firmware update may revert it.

## Configuring the plugin

These fields are all available in the Homebridge Config UI X settings form,
or edit `config.json` directly:

```json
{
  "platform": "SoundTouchHomebridgePlugin",
  "global": {
    "server": {
      "enabled": true
    },
    "presetSyncEnabled": true,
    "presets": [
      { "type": "station", "slot": 1, "name": "More FM Auckland", "tuneInId": "s7162" },
      { "type": "station", "slot": 2, "name": "RNZ National",     "tuneInId": "s15720" }
    ]
  }
}
```

`presetSyncEnabled` must be `true` for presets to sync — `server.enabled`
alone only starts the emulator (needed for on-demand TuneIn lookups), it
doesn't push presets on its own. `presetSyncSchedule` is optional and
defaults to midnight daily (`0 0 * * *`); set it only if you want a different
cron schedule, e.g. `"presetSyncSchedule": "0 3 * * 1"` for weekly at 3am
Monday. See the full field reference in
[docs/CONFIGURATION.md](CONFIGURATION.md#bose-cloud-server-globalserver) for
every option, including per-accessory `presetSyncEnabled` overrides and the
full cron syntax `presetSyncSchedule` supports.

## Finding TuneIn IDs

Search at [tunein.com](https://tunein.com) and copy the ID from the URL:
`tunein.com/radio/More-FM-Auckland-s7162/` → `s7162`.

## Troubleshooting

**Preset button plays a tone and stops**

- Check the Homebridge log for `[FakeBoseCloudServer] Listening on…` — the server must
  be running.
- Confirm the speaker was uncorked: `curl http://homebridge.local:8000/bmx/registry/v1/services`
  should return JSON. If it doesn't, re-check the XML on the speaker and reboot.

**Speaker reverted after a firmware update**

- Re-apply the uncork step and reboot the speaker.
