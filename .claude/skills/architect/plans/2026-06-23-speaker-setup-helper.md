---
feature: Speaker setup helper — SSH script to redirect speaker to bose-cloud emulator
status: planned
date: 2026-06-23
branch: feat/speaker-setup-helper
commit-type: feat
---

# Speaker setup helper — SSH script to redirect speaker to bose-cloud emulator

## Context

The internet-radio feature (`2026-06-22-internet-radio-tunein.md`) requires each
SoundTouch speaker to be redirected from Bose's defunct cloud to a local
`bose-cloud.mjs` emulator. This is done by SSHing into the speaker and editing
`/opt/Bose/etc/SoundTouchSdkPrivateCfg.xml` to point `bmxRegistryUrl` and
`margeServerUrl` at the Homebridge host.

Currently that edit is documented in the `bose-cloud.mjs` script header, but
users must do it manually over SSH. This plan delivers a helper script
(`scripts/setup-speaker.sh`) that automates the SSH steps: connect, patch the
XML, reboot.

A bootable USB image for non-developer users is a separate, larger effort that
requires its own research — see `2026-06-23-speaker-usb-image.md`.

**Dependency:** `2026-06-22-internet-radio-tunein.md` (PR #118) must merge first
so `bose-cloud.mjs` and its documented URL values exist in `dev`.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-23 | Finding: speaker SSH access confirmed — soundcork `docs/speaker-setup.md` documents SSH login (`root`, no password on most models) and the XML file path `/opt/Bose/etc/SoundTouchSdkPrivateCfg.xml` | Prerequisite for any automated approach | Telnet / SoundTouch HTTP API — no write path to system files |
| 2026-06-23 | Helper script approach: `ssh root@<IP> "sed -i ..."` to patch the XML in-place | Minimal deps — `ssh` available everywhere; no new npm packages | scp + edit locally + scp back — more moving parts; sed in-place is atomic enough for this single file |
| 2026-06-23 | Script must be idempotent | Running it twice on the same speaker must be safe (writes the same values again, reboots again) | One-shot only — user could run it accidentally after setup; idempotency is free with sed |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

- **New `scripts/setup-speaker.sh`:**
  - Accepts `--ip <SPEAKER_IP>` and `--host <HOMEBRIDGE_HOST>` (defaults to
    first non-loopback IPv4 via `hostname -I`, or `ip route get` equivalent).
  - SSHes into `root@<SPEAKER_IP>` (no password on most SoundTouch models).
  - Patches `bmxRegistryUrl` → `http://<HOMEBRIDGE_HOST>:8000/bmx/registry/v1/services`
    and `margeServerUrl` → `http://<HOMEBRIDGE_HOST>:8000/marge` in
    `/opt/Bose/etc/SoundTouchSdkPrivateCfg.xml`.
  - Reboots the speaker.
  - Prints clear next-step instructions: start `bose-cloud.mjs` before the
    speaker finishes rebooting.
  - No new npm runtime dependencies. `ssh` and `sed` are system tools.
- **New `docs/bose-cloud-setup.md`** — step-by-step user guide: prerequisites,
  running `setup-speaker.sh`, starting `bose-cloud.mjs`, verifying presets work.

## Conventions for this change

- **Commit type:** `feat:` → minor release.
- **No new npm runtime packages.**
- **Helper script must be idempotent.**
- **Target branch:** `dev`.

## Implementation checklist

### Spike (on a real speaker)

- [ ] Confirm SSH root access — `ssh root@<IP>` with no password.
- [ ] Confirm `sed -i` is available on the speaker's busybox shell.
- [ ] Confirm the reboot command (`reboot`, `kill -9 1`, or other).
- [ ] Read the XML before and after patching to verify correct substitution.

### Script

- [ ] `scripts/setup-speaker.sh` — `--ip` / `--host` flags, auto-detect host
      if omitted, SSH + XML patch + reboot, clear output.
- [ ] Idempotency test: run twice on same speaker, confirm no corruption.
- [ ] `docs/bose-cloud-setup.md` — user guide.

## Verification

- [ ] SSH into a real speaker using the script; confirm XML patched correctly;
      speaker reboots; `bose-cloud.mjs` resolves TuneIn; preset plays.
- [ ] Run script a second time; confirm speaker still works.

## PR / release notes

- **PR title:** `feat: add helper script to redirect speaker to local bose-cloud emulator`
- **Targets:** `dev`
