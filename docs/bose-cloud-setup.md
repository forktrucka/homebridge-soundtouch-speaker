# Internet radio (TuneIn) after the Bose cloud shutdown

Bose's cloud services were shut down on **6 May 2026**. Without them, speakers
cannot activate TuneIn presets or resolve station stream URLs at play time.

## Recommended solution — SoundCork

**[SoundCork](https://github.com/deborahgu/soundcork)** is the
community-maintained replacement for the Bose cloud, created by
Deborah Kaplan and Allen Petersen and released under the
[MIT License](https://github.com/deborahgu/soundcork/blob/main/LICENSE)
(© 2025 Deborah Kaplan and Allen Petersen).

It is a Python/FastAPI service that answers all four cloud endpoints the
speaker looks up on boot: the TuneIn OPML proxy, preset/account sync, marge
account management, and (optionally) SiriusXM. No traffic leaves your network.

A community fork by [timvw](https://github.com/timvw/soundcork) adds Docker
Compose and Kubernetes deployment guides and a smart proxy mode. It carries the
same MIT license and copyright as the original. Use this fork if you want
container-based deployment.

For most users, **SoundCork (or timvw's fork) is the right tool**. Follow the
setup guide in the repository — it covers all supported models and redirect
methods, including the USB-boot procedure for speakers that do not have SSH
enabled.

## Alternative — `bose-cloud.mjs` (this repo)

`scripts/bose-cloud.mjs` is a minimal, dependency-free Node.js script that
covers the subset SoundCork covers in Python:

- BMX service registry (`/bmx/registry/v1/services`)
- Marge server stub (`/marge/streaming/sourceproviders`)
- TuneIn station resolver (`/bmx/tunein/v1/playback/station/:id`) via the
  RadioTime OPML API

It is useful if you run Homebridge on Node.js and prefer a single-process
setup without Python or Docker. For anything beyond TuneIn presets (accounts,
SiriusXM, recents), use SoundCork.

### Running bose-cloud.mjs

On your Homebridge host (Node.js 22 or 24):

```sh
node scripts/bose-cloud.mjs
```

The script starts on port 8000 and logs every request the speaker sends:

```
Listening on http://10.0.0.94:8000
  bmxRegistryUrl  → http://10.0.0.94:8000/bmx/registry/v1/services
  margeServerUrl  → http://10.0.0.94:8000/marge
```

Override the advertised address when your host has multiple network interfaces:

```sh
HOST=10.0.0.94 node scripts/bose-cloud.mjs
```

To keep it running as a background service on a systemd host:

```ini
# /etc/systemd/system/bose-cloud.service
[Unit]
Description=Bose cloud emulator for SoundTouch TuneIn
After=network.target

[Service]
ExecStart=/usr/bin/node /path/to/homebridge-soundtouch-speaker/scripts/bose-cloud.mjs
Restart=always
Environment=HOST=10.0.0.94

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl enable --now bose-cloud
```

## Redirecting the speaker

The speaker must be told to use your local emulator instead of Bose's servers.
SoundCork's documentation covers the full procedure (including the USB-boot
method that works without SSH). The short version for SSH-accessible devices:

```sh
ssh root@<SPEAKER_IP>
vi /opt/Bose/etc/SoundTouchSdkPrivateCfg.xml
```

Set `bmxRegistryUrl` and `margeServerUrl` to point at your Homebridge host:

```xml
<bmxRegistryUrl>http://<HOMEBRIDGE_IP>:8000/bmx/registry/v1/services</bmxRegistryUrl>
<margeServerUrl>http://<HOMEBRIDGE_IP>:8000/marge</margeServerUrl>
```

Save and reboot the speaker. This change persists across normal restarts but
may be overwritten by a firmware update.

> **Note:** start the emulator before the speaker finishes rebooting, or TuneIn
> will be unavailable until the next reboot.

## Configuring presets in Homebridge

Add a `presets` array and a `server` block to the plugin's `global` config.
The UI schema does not yet expose these fields — edit the Homebridge
`config.json` directly:

```json
{
  "platform": "SoundTouchSpeaker",
  "global": {
    "server": {
      "enabled": true,
      "host": "homebridge.local",
      "port": 8000
    },
    "presets": [
      { "type": "station", "slot": 1, "name": "More FM Auckland", "tuneInId": "s7162" },
      { "type": "station", "slot": 2, "name": "RNZ National",     "tuneInId": "s15720" }
    ],
    "presetSyncSchedule": "0 0 * * *"
  }
}
```

| Field | Required | Description |
| --- | --- | --- |
| `server.enabled` | yes | Must be `true` to activate preset sync |
| `server.host` | no | Hostname/IP where the emulator runs; default `homebridge.local` |
| `server.port` | no | Port the emulator listens on; default `8000` |
| `presets[].type` | yes | Must be `"station"` |
| `presets[].slot` | yes | Preset button number (1–6) |
| `presets[].name` | yes | Display name written to the preset |
| `presets[].tuneInId` | yes | TuneIn station ID (e.g. `s7162`) |
| `presets[].imageUrl` | no | Optional station art URL |
| `presetSyncSchedule` | no | Cron schedule (`minute hour * * *`); default `0 0 * * *` (midnight daily) |

At startup the plugin writes each configured preset to every discovered device.
The emulator resolves the TuneIn ID to a stream URL when the preset button is
pressed.

## Finding TuneIn IDs

Search at [tunein.com](https://tunein.com) and copy the ID from the station
URL: `tunein.com/radio/More-FM-Auckland-s7162/` → `s7162`.

## Troubleshooting

**Preset button plays a tone and stops**

- Confirm the emulator is reachable: `curl http://<HOST>:8000/bmx/registry/v1/services`
- Check the emulator logs — the speaker should send
  `GET /bmx/tunein/v1/playback/station/<id>` when the button is pressed.
- If no request arrives, the speaker was not redirected. Re-check the XML and
  reboot.

**`Connection refused` on port 8000**

- The emulator is not running, or bound to a different address.
  Check with `ss -tlnp | grep 8000`.

**Speaker reverted after firmware update**

- A firmware update may restore the original XML. Re-apply the redirect after
  updating.
