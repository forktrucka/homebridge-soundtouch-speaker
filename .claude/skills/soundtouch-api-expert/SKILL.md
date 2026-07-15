---
name: soundtouch-api-expert
description: >-
  Expert knowledge of the Bose SoundTouch Web API and what a SoundTouch speaker
  is. Use when working with the SoundTouch HTTP/XML API (port 8090), WebSocket
  notifications (port 8080, "gabbo" protocol), device discovery (SSDP/mDNS), or
  interpreting/constructing SoundTouch XML payloads for endpoints like
  /now_playing, /volume, /key, /select, /presets, /bass, /info, /getZone,
  /setZone. Also use when writing or modifying any code under
  src/devices/SoundTouch/api/, adding a new endpoint, debugging API responses,
  or understanding device state changes via WebSocket. Always read the bundled
  api-reference.md before writing or parsing any XML payload — don't guess at
  field names, attribute shapes, or response structure.
---

# SoundTouch Web API Expert

Authoritative reference for the **Bose SoundTouch Web API**, the HTTP/XML +
WebSocket protocol this plugin speaks to control Bose speakers. Source: *Bose
SoundTouch Web API*, Version 1.1 (Bose Corporation) —
<https://assets.bosecreative.com/m/496577402d128874/original/SoundTouch-Web-API.pdf>.

The full endpoint catalog (every URL with request/response XML and all WebSocket
notification shapes) lives in **`api-reference.md`** next to this file. Read it
before writing or parsing any payload — the summary here is the map, that file
is the territory.

## What a SoundTouch speaker is

A SoundTouch speaker is a Wi-Fi/Ethernet–connected Bose wireless speaker that
plays streaming audio and is controllable over the local network via the Web
API. It is one component of the **SoundTouch ecosystem**:

- **SoundTouch Speaker** — the device itself. Products include the SoundTouch
  Portable, SoundTouch 20, SoundTouch 30, Wave SoundTouch, SoundTouch Stereo JC,
  SoundTouch SA-4 amplifier, SoundTouch outdoor systems, and Cinemate /
  Lifestyle / VideoWave home-theater systems.
- **SoundTouch App** — the iOS/Android control app; it discovers speakers on the
  network (SSDP/Bonjour) and controls them with this same API. Third-party
  integrations (like this Homebridge plugin) play the same client role.
- **SoundTouch Cloud Server (deprecated)** — formerly stored accounts, presets,
  recents, and the speaker list. Treat as gone; rely on the speaker locally.

Speakers can be grouped into **multi-room zones** (a "play everywhere" zone with
one master and one or more slaves) so they play in sync.

## Transport fundamentals

- **Control: HTTP on port `8090`.** Commands are `GET` and `POST` with XML
  payloads. Rule of thumb from the spec: any `get*` operation is an HTTP `GET`;
  any `set*` operation is an HTTP `POST` (i.e. requires a payload).
- **Notifications: WebSocket on port `8080`.** Open `ws://$IP` and **you must
  specify the sub-protocol `"gabbo"`** (`new WebSocket("ws://$IP", "gabbo")`).
  The speaker pushes asynchronous `<updates>` messages when state changes.
- Most notifications are **"tickle" style** — they only tell you *what* changed
  (e.g. `<volumeUpdated/>`), not the new value. The client re-fetches via the
  matching GET endpoint. A few (e.g. presets) include the new data.

## Errors & status

- Calls with no special payload return `<status>$STRING</status>`.
- Error responses:
  ```xml
  <errors deviceID="$STRING">
    <error value="$INT" name="$STRING" severity="$STRING">$STRING</error> ...
  </errors>
  ```
- Malformed XML / wrong value yields a parse error, e.g.
  `<error>XML parse error (1:116): Error reading Attributes.</error>` or an
  `<errors>` block with `name="CLIENT_XML_ERROR"`.

## Endpoint index

| Endpoint | Method(s) | Purpose |
| --- | --- | --- |
| `/key` | POST | Send a remote-button press (PLAY, PAUSE, PRESET_1…, POWER, MUTE, …); send `press` then `release` |
| `/select` | POST | Select a source via a `<ContentItem>` (AUX, BLUETOOTH, PRODUCT, …) |
| `/sources` | GET | List available content sources and their status |
| `/bassCapabilities` | GET | Whether bass is adjustable + min/max/default |
| `/bass` | GET, POST | Get/set bass level |
| `/getZone` | GET | Current multi-room zone (master + members) |
| `/setZone` | POST | Create a multi-room zone |
| `/addZoneSlave` | POST | Add a slave to a zone |
| `/removeZoneSlave` | POST | Remove a slave from a zone |
| `/nowPlaying` | GET | Currently playing media (track, artist, art, playStatus, source) |
| `/trackInfo` | GET | Detailed track info (same shape as nowPlaying) |
| `/volume` | GET, POST | Get/set volume (0–100) and mute |
| `/presets` | GET | List of presets (ids 1–6) |
| `/info` | GET | Static device info (id, type, components, network, sw version) |
| `/name` | POST | Set the device name |
| `/capabilities` | GET | Which optional URLs the device supports — gate access on this |
| `/audiodspcontrols` | GET, POST | DSP audio mode (DIRECT/NORMAL/DIALOG/NIGHT), A/V sync delay |
| `/audioproducttonecontrols` | GET, POST | Bass/treble tone controls (value + min/max/step) |
| `/audioproductlevelcontrols` | GET, POST | Front-center / rear-surround levels |

**Capabilities gating:** several endpoints (`/audiodspcontrols`,
`/audioproducttonecontrols`, `/audioproductlevelcontrols`, …) only exist if
listed in the `GET /capabilities` reply. Check `/capabilities` before using
optional URLs rather than assuming they exist.

## Discovery

Speakers are found on the LAN with two redundant protocols (run both for
reliability across VLANs/containers):

- **SSDP** — M-SEARCH over UDP multicast port `1900`. Service types:
  `urn:schemas-upnp-org:device:MediaRenderer:1` (speakers that play audio) and
  `urn:schemas-upnp-org:device:MediaServer:1` (media holders). Track device
  expiry from the `Cache-control: max-age` header (min 1800s); use the
  `Location` header address for all further comms.
- **mDNS / Bonjour / Zero-conf** — service types `_soundtouch._tcp.local`
  (general SoundTouch) and `_raop._tcp.local` (AirPlay, if supported).

## How this maps to the codebase

This Homebridge plugin is itself a SoundTouch Web API client. Ground any change
in the existing client code rather than reinventing payloads:

- **HTTP/XML client:** `src/devices/SoundTouch/api/` — one module per concern
  (`info.ts`, `now-playing.ts`, `volume.ts`, `bass.ts`, `preset.ts`,
  `source.ts`, `zone.ts`, `content-item.ts`, `key`/`select` via `api.ts`).
  Endpoint names are centralized in `api/endpoints.ts`; XML parsing helpers in
  `api/utils/xml-element.ts`; discovery in `api/api-discovery.ts`.
- **Codebase ⇄ spec mismatches to know about:** the client's `Endpoints` enum
  uses `now_playing` (the spec writes `/nowPlaying`) and includes `speaker` and
  `getGroup`, which are **not** in the v1.1 public PDF. Treat the PDF as
  canonical for documented endpoints, and the existing code as canonical for
  the device's actual on-the-wire behavior (it may target older/undocumented
  endpoints). When they disagree, verify against a real device before changing
  wire format.

This skill is only about the Bose protocol. For plugin architecture and HomeKit
wiring use the **homebridge-developer** skill; for code/build/test conventions use
the **plugin-coding-conventions** skill; for planning and release flow use **plugin-architect**.
