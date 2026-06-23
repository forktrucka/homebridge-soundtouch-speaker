---
feature: Bootable USB image for SoundTouch speaker bose-cloud setup
status: planned
date: 2026-06-23
branch: feat/speaker-usb-image
commit-type: feat
---

# Bootable USB image for SoundTouch speaker bose-cloud setup

## Context

Setting up a SoundTouch speaker to work with the `bose-cloud.mjs` emulator
requires SSH access and editing a system XML file on the speaker. The
`scripts/setup-speaker.sh` helper (`2026-06-23-speaker-setup-helper.md`) solves
this for developers, but non-developer users have no path.

This plan delivers a **bootable USB image** that non-developers can flash to a
thumb drive, boot on any computer on their home LAN, and use to configure their
speakers through a simple interactive menu — no Node.js, no npm, no terminal.

**This plan is blocked on research.** The base OS, build toolchain, flash UX,
and distribution model all have open questions that must be answered before
implementation begins. The checklist is structured accordingly.

**Dependencies:**
- `2026-06-22-internet-radio-tunein.md` (PR #118) — `bose-cloud.mjs` must exist.
- `2026-06-23-speaker-setup-helper.md` — USB image should embed and call the
  helper script logic; ship the script first.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-06-23 | Plan is research-first — all architectural decisions deferred to spike | Base image, build toolchain, flash UX, and distribution are all open. Committing to an approach before research risks a costly rewrite. | Picking Alpine/Pi OS now — premature; image size, Node.js availability, and boot UX need verification |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Research questions (must answer before implementation)

### Base OS

- What is the smallest bootable Linux that can run Node.js LTS, has `ssh` and
  `sed`, and works on both x86_64 and ARM64?
  - Candidates: **Alpine Linux** (smallest, musl libc — Node.js available via
    apk), **Raspberry Pi OS Lite** (largest, best Pi support), **Debian netinst
    minimal**.
- Is Node.js LTS available as a pre-built package for Alpine on both arches, or
  does it need to be cross-compiled?
- What is the estimated final image size for each candidate?

### Build toolchain

- Can the image be built reproducibly in a GitHub Actions runner (Linux x86_64)?
  - Candidates: `packer` + QEMU, `docker buildx` (export rootfs → image),
    `alpine-make-rootfs`, custom `debootstrap`.
- How long does a full build take in CI? (Budget: < 15 min.)
- Can ARM64 be built via QEMU emulation on x86_64, or is a native ARM runner needed?

### Boot and flash UX

- What is the simplest interactive menu framework that works on a framebuffer
  console (no X11)? Candidates: `whiptail` (Newt), `dialog`, a tiny Node.js
  Ink CLI.
- How do users flash the image? Etcher (GUI, cross-platform) vs `dd` vs a
  custom web-based flasher?
- Does the image need to handle both BIOS and UEFI boot (x86_64)? Is a single
  MBR image sufficient, or is a hybrid MBR/GPT needed?

### Discovery

- Can the USB image scan for SoundTouch speakers reliably (mDNS, SSDP) from a
  fresh boot with no config?
- What happens if the LAN blocks multicast? Is a manual IP fallback sufficient?

### Distribution

- Where does the `.img.gz` live? Options: GitHub Releases asset, a separate
  `homebridge-soundtouch-speaker-setup` repo, or a CDN.
- Does publishing a binary image add any legal/compliance obligations (GPL
  components, Bose firmware interaction)?

## Affected areas

*(TBD — fill in after research spike)*

The image will likely embed:
- `scripts/bose-cloud.mjs` (from the main repo)
- `scripts/setup-speaker.sh` (or equivalent Node.js port)
- A boot-time interactive menu (whiptail or Node.js CLI)
- Possibly a `systemd` service to auto-start `bose-cloud.mjs` after setup

A GitHub Actions workflow will build and publish the image as a release asset.

## Conventions for this change

- **Commit type:** `feat:` → minor release.
- **No new npm runtime packages** for the plugin itself; image build tooling
  is CI-only.
- **Target branch:** `dev` (after research spike is complete).

## Implementation checklist

### Research spike (block all implementation on this)

- [ ] Answer all questions in the **Research questions** section above.
- [ ] Document answers in the **Decisions & findings** table.
- [ ] Produce a one-page architecture decision record: chosen base OS, build
      toolchain, flash UX, and distribution approach with rationale.

### Implementation (after spike)

- [ ] Base image build script
- [ ] Node.js + deps bundled into image
- [ ] Boot-time interactive menu (scan → select speaker → run setup)
- [ ] `bose-cloud.mjs` starts as a persistent service after setup
- [ ] x86_64 image builds and boots in QEMU
- [ ] ARM64 image boots on a Raspberry Pi 4
- [ ] GitHub Actions workflow builds and publishes `.img.gz` on release

## Verification

- [ ] Boot image in QEMU (x86_64); run full setup flow against a simulated
      speaker (or mock SSH target); confirm XML patched and preset plays.
- [ ] Boot image on a real Raspberry Pi 4 (ARM64); run against a real speaker;
      confirm end-to-end: XML patched → `bose-cloud.mjs` persistent → preset plays.
- [ ] Flash via Etcher on macOS and Windows; confirm both work.

## PR / release notes

- **PR title:** `feat: add bootable USB image for SoundTouch bose-cloud setup`
- **Targets:** `dev`
