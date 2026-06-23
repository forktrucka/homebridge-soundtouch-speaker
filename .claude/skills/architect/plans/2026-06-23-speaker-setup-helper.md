---
feature: Speaker setup helper — bose-cloud redirect automation
status: planned
date: 2026-06-23
branch: feat/speaker-setup-helper
commit-type: feat
---

# Speaker setup helper — bose-cloud redirect automation

## Context

The internet-radio feature (`2026-06-22-internet-radio-tunein.md`) requires each
SoundTouch speaker to be redirected from Bose's defunct cloud to a local
`bose-cloud.mjs` emulator. This is done by SSHing into the speaker and editing
`/opt/Bose/etc/SoundTouchSdkPrivateCfg.xml` to point `bmxRegistryUrl` and
`margeServerUrl` at the Homebridge host.

Currently that setup is purely manual. This plan explores making it easier via:

1. **A helper script** (`scripts/setup-speaker.sh` or `scripts/setup-speaker.mjs`)
   that automates the SSH steps: connects to the speaker, edits the XML, and
   reboots — driven by a known IP address.
2. **A bootable USB image** that can be flashed to a USB drive, inserted into a
   computer on the same LAN as the speakers, and run without any Node.js / npm
   install. Useful for users who aren't developers.

These are distinct deliverables that can land independently. The helper script
is lower risk and can ship first; the USB image is a larger effort.

**Dependency:** `2026-06-22-internet-radio-tunein.md` (PR #118) must merge first
so the `bose-cloud.mjs` emulator and its documented config values exist in `dev`.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-23 | Finding: speaker SSH access confirmed — soundcork `docs/speaker-setup.md` documents SSH login (`root`, no password on most models) and the XML file path | Prerequisite for any automated approach | Telnet / SoundTouch API — no write path to system files via HTTP API |
| 2026-06-23 | Helper script approach: `ssh root@<IP> "sed -i ..."` to patch the XML in-place | Minimal deps — `ssh` available everywhere; no new npm packages in the plugin | scp + edit locally + scp back — more moving parts; sed in-place is atomic enough for this file |
| 2026-06-23 | USB image approach deferred to spike | Requires selecting a base image (Alpine Linux, Raspberry Pi OS Lite, etc.), packaging Node.js + the scripts, and automating the flash workflow (Etcher, `dd`). Scope is significant — needs feasibility check. | Shipping USB image immediately — too much unknown; helper script delivers value sooner |
| 2026-06-23 | USB image target: x86_64 + ARM64 (Raspberry Pi) | Most users run Homebridge on a Pi; a Pi-compatible image can also run in a VM on x86 | x86-only — excludes the dominant Homebridge hardware |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

### Helper script

- **New `scripts/setup-speaker.sh`** (or `.mjs`):
  - Accepts `--ip <SPEAKER_IP>` and `--host <HOMEBRIDGE_HOST>` (defaults to
    auto-detected LAN IP, same logic as the platform).
  - SSHes into `root@<SPEAKER_IP>` (no password on most SoundTouch models).
  - Reads `/opt/Bose/etc/SoundTouchSdkPrivateCfg.xml`.
  - Patches `bmxRegistryUrl` → `http://<HOMEBRIDGE_HOST>:8000/bmx/registry/v1/services`
    and `margeServerUrl` → `http://<HOMEBRIDGE_HOST>:8000/marge`.
  - Reboots the speaker (`reboot` or `kill -9 1`).
  - Prints clear instructions: "Now start `bose-cloud.mjs` on your Homebridge
    host before the speaker comes back online."
- No new npm runtime deps. `ssh` is a system tool.
- Add usage docs to the script header and/or a `docs/bose-cloud-setup.md`.

### USB image (spike first)

- Base image TBD (Alpine Linux recommended for size; Raspberry Pi OS Lite for
  Pi compatibility).
- Packages to bundle: Node.js LTS, this plugin's `scripts/` directory.
- Boot flow: auto-run a TUI or simple interactive menu that:
  1. Scans the LAN for SoundTouch speakers (mDNS / SSDP).
  2. Lets the user select a speaker.
  3. Runs the helper script against the selected speaker.
  4. Optionally starts `bose-cloud.mjs` persistently (systemd service).
- Build tooling: `packer`, `docker buildx`, or a custom shell script with
  `debootstrap` / `alpine-make-rootfs`.
- Output: `.img.gz` file published as a GitHub Release asset.

## Conventions for this change

- **Commit type:** `feat:` → minor release.
- **No new npm runtime packages** — helper script uses `node:child_process`
  (for `.mjs`) or plain `ssh` (for `.sh`). USB image build tooling is dev/CI
  only, not shipped in the npm package.
- **Helper script must be idempotent** — running it twice on the same speaker
  should be safe (write the same values again, reboot again).
- **Target branch:** `dev`.

## Implementation checklist

### Research / spike

- [ ] Confirm SSH root access on SoundTouch 20 and SoundTouch 30 (no-password
      login). Test `ssh root@<IP> cat /opt/Bose/etc/SoundTouchSdkPrivateCfg.xml`.
- [ ] Confirm `sed -i` is available on the speaker's busybox shell (or identify
      the correct in-place edit command).
- [ ] Confirm reboot command (`reboot` or `kill -9 1` or other).
- [ ] Spike USB image: evaluate Alpine Linux vs Raspberry Pi OS Lite as base;
      estimate final image size; confirm Node.js LTS package availability.

### Helper script

- [ ] `scripts/setup-speaker.sh` (or `.mjs`):
      - `--ip` / `--host` flags; auto-detect host if omitted.
      - SSH + XML patch + reboot.
      - Clear success/failure output.
- [ ] Idempotency test: run twice, confirm no corruption.
- [ ] `docs/bose-cloud-setup.md` — step-by-step user guide linking the script.
- [ ] Add `setup-speaker` entry to `package.json` `scripts` (optional convenience).

### USB image

- [ ] Spike complete — base image and toolchain decided
- [ ] Build script (`scripts/build-usb-image.sh`)
- [ ] Boot-time TUI / interactive menu
- [ ] `bose-cloud.mjs` bundled and launchable as a persistent service
- [ ] x86_64 image builds and boots in QEMU
- [ ] ARM64 image boots on a Raspberry Pi
- [ ] GitHub Actions workflow publishes `.img.gz` as a release asset

## Verification

- [ ] Helper script: SSH into a real speaker, confirm XML patched correctly,
      speaker reboots, `bose-cloud.mjs` resolves TuneIn, preset plays.
- [ ] Helper script: run twice — no side effects, speaker still works.
- [ ] USB image (if shipped): boot on Pi, run setup against a real speaker,
      confirm end-to-end: XML patched → `bose-cloud.mjs` starts → preset plays.

## PR / release notes

- **Helper script PR title:** `feat: add helper script to redirect speaker to local bose-cloud emulator`
- **USB image PR title:** `feat: add bootable USB image for speaker bose-cloud setup`
- **Targets:** `dev`
