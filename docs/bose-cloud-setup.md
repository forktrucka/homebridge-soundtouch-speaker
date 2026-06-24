# Setting up a SoundTouch speaker for internet radio

Bose's cloud services shut down in early 2026. This means the speaker's built-in
TuneIn support no longer works — it can't resolve station IDs to stream URLs.

This plugin restores that functionality by running a **lightweight local cloud
emulator** (`scripts/bose-cloud.mjs`) that the speaker talks to instead of
Bose's servers. The emulator proxies TuneIn lookups through the RadioTime OPML
API, which is still live.

## What you need

- SSH access to the speaker (root, no password on most models)
- Node.js 22 or 24 on your Homebridge host
- The speaker's IP address (find it in your router's DHCP table or via
  `dns-sd -B _soundtouch._tcp local` on macOS)

## Step 1 — Redirect the speaker to your local emulator

SSH into the speaker and edit its cloud-server config file:

```sh
ssh root@<SPEAKER_IP>
```

Open the config file (busybox vi or sed):

```sh
vi /opt/Bose/etc/SoundTouchSdkPrivateCfg.xml
```

Find the `bmxRegistryUrl` and `margeServerUrl` fields and change them to point
at your Homebridge host's IP address:

```xml
<bmxRegistryUrl>http://<HOMEBRIDGE_IP>:8000/bmx/registry/v1/services</bmxRegistryUrl>
<margeServerUrl>http://<HOMEBRIDGE_IP>:8000/marge</margeServerUrl>
```

Save the file, then reboot the speaker:

```sh
reboot
```

This is a **one-time setup**. The change persists across normal speaker restarts.

> **Finding your Homebridge IP:** run `hostname -I` on your Homebridge host and
> use the first address shown (the LAN IPv4, not `127.0.0.1`).

## Step 2 — Start the bose-cloud emulator

On your Homebridge host, run:

```sh
node scripts/bose-cloud.mjs
```

The emulator starts on port 8000 and logs each request the speaker makes:

```
Listening on http://10.0.0.94:8000
  bmxRegistryUrl  → http://10.0.0.94:8000/bmx/registry/v1/services
  margeServerUrl  → http://10.0.0.94:8000/marge
```

> **Timing:** start the emulator before the speaker finishes rebooting, or the
> speaker will fail its initial cloud check and TuneIn will be unavailable until
> the next reboot.

The `HOST` environment variable overrides the address used in the BMX registry
response (useful if your Homebridge host has multiple interfaces):

```sh
HOST=10.0.0.94 node scripts/bose-cloud.mjs
```

## Step 3 — Configure presets in Homebridge

Add a `presets` array to your plugin's `global` config block:

```json
{
  "platform": "SoundTouchSpeaker",
  "global": {
    "presets": [
      { "type": "station", "slot": 1, "name": "More FM Auckland", "tuneInId": "s7162" },
      { "type": "station", "slot": 2, "name": "RNZ National",     "tuneInId": "s15720" }
    ],
    "presetSyncInterval": 3600000
  }
}
```

| Field | Required | Description |
| --- | --- | --- |
| `type` | yes | Must be `"station"` |
| `slot` | yes | Preset button number (1–6) |
| `name` | yes | Display name written to the preset |
| `tuneInId` | yes | TuneIn station ID (e.g. `s7162`) |
| `imageUrl` | no | Optional station art URL |
| `presetSyncInterval` | no | How often (ms) to re-write presets; default 3 600 000 (1 hour); `0` = startup only |

At startup the plugin calls `storePreset` on every discovered device for each
configured slot. The emulator resolves the TuneIn ID to a stream URL at play time.

## Finding TuneIn IDs

Search for a station at [tunein.com](https://tunein.com) and copy the ID from
the URL: `tunein.com/radio/More-FM-Auckland-s7162/` → `s7162`.

## Running the emulator persistently

To keep the emulator running when you close your terminal, add it as a
background service. On a systemd host:

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

## Troubleshooting

**Preset button does nothing / plays a tone and stops**

- Confirm the emulator is running and reachable: `curl http://<HOST>:8000/bmx/registry/v1/services`
- Check the emulator logs — the speaker should send a `GET /bmx/tunein/v1/playback/station/<id>` when the button is pressed.
- If no request arrives, the speaker hasn't been redirected. Re-check the XML and reboot.

**`Connection refused` on port 8000**

- The emulator is not running, or it started on a different IP. Check with `ss -tlnp | grep 8000`.

**Speaker reverted after firmware update**

- A firmware update may restore the original XML. Re-run Step 1 after updating.
