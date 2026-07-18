# SoundTouch Web API — Full Reference

Verbatim-faithful catalog of the Bose SoundTouch Web API (v1.1). Control calls
are HTTP on **port 8090**; notifications are WebSocket on **port 8080**
(sub-protocol `gabbo`). Placeholders (`$STRING`, `$INT`, `$MACADDR`, …) follow
the special types below. `get*` ⇒ GET, `set*` ⇒ POST (payload required).

## Special types

| Type | Meaning |
| --- | --- |
| `BOOL` | `"true"` or `"false"` |
| `INT` | 32-bit signed integer |
| `UINT` | 32-bit unsigned integer |
| `UINT64` | 64-bit unsigned integer |
| `STRING` | any valid XML-escaped string |
| `URL` | a URL encoded as a string |
| `IPADDR` | an IP address as a string |
| `MACADDR` | a MAC address, upper-cased, as a string |
| `PRESET_ID` | integer 1–6 inclusive |

**`ART_STATUS`**: `INVALID`, `SHOW_DEFAULT_IMAGE`, `DOWNLOADING`, `IMAGE_PRESENT`

**`PLAY_STATUS`**: `PLAY_STATE`, `PAUSE_STATE`, `STOP_STATE`, `BUFFERING_STATE`,
`INVALID_PLAY_STATUS`

**`SOURCE_STATUS`**: `UNAVAILABLE`, `READY`

**`AUDIO_MODE`**: `AUDIO_MODE_DIRECT`, `AUDIO_MODE_NORMAL`, `AUDIO_MODE_DIALOG`,
`AUDIO_MODE_NIGHT`

**`KEY_STATE`**: `press`, `release`

**`KEY_VALUE`**: `PLAY`, `PAUSE`, `STOP`, `PREV_TRACK`, `NEXT_TRACK`,
`THUMBS_UP`, `THUMBS_DOWN`, `BOOKMARK`, `POWER`, `MUTE`, `VOLUME_UP`,
`VOLUME_DOWN`, `PRESET_1`, `PRESET_2`, `PRESET_3`, `PRESET_4`, `PRESET_5`,
`PRESET_6`, `AUX_INPUT`, `SHUFFLE_OFF`, `SHUFFLE_ON`, `REPEAT_OFF`, `REPEAT_ONE`,
`REPEAT_ALL`, `PLAY_PAUSE`, `ADD_FAVORITE`, `REMOVE_FAVORITE`, `INVALID_KEY`

## General status / errors

```xml
<!-- default success for calls with no special payload -->
<status>$STRING</status>

<!-- error -->
<errors deviceID="$STRING">
  <error value="$INT" name="$STRING" severity="$STRING">$STRING</error> ...
</errors>

<!-- malformed request -->
<error>XML parse error (1:116): Error reading Attributes.</error>
<errors deviceID="D05FB8A9591D"><error value="1019" name="CLIENT_XML_ERROR" severity="Unknown">1019</error></errors>
```

---

## Endpoints

### `/key` — POST
Send a remote button press. Best practice: two discrete POSTs, `press` then
`release`, to simulate a real key click.
```xml
<key state="press" sender="Gabbo">$KEY_VALUE</key>
<key state="release" sender="Gabbo">$KEY_VALUE</key>
```

### `/select` — POST
Select an available source. Availability varies by product/account — query
`/sources` first.
```xml
<ContentItem source="AUX" sourceAccount="AUX"></ContentItem>
<ContentItem source="AUX" sourceAccount="AUX3"></ContentItem>
<ContentItem source="BLUETOOTH"></ContentItem>
<ContentItem source="PRODUCT" sourceAccount="TV"></ContentItem>
```

### `/sources` — GET
List all available content sources.
```xml
<sources deviceID="$MACADDR">
  <sourceItem source="$SOURCE" sourceAccount="$STRING" status="$SOURCE_STATUS">$STRING</sourceItem>
  ...
</sources>
```

### `/bassCapabilities` — GET
Whether bass is adjustable on this speaker.
```xml
<bassCapabilities deviceID="$MACADDR">
  <bassAvailable>$BOOL</bassAvailable>
  <bassMin>$INT</bassMin>
  <bassMax>$INT</bassMax>
  <bassDefault>$INT</bassDefault>
</bassCapabilities>
```

### `/bass` — GET / POST
Get or set bass. Gate on `/bassCapabilities`.
```xml
<!-- GET -->
<bass deviceID="$MACADDR">
  <targetbass>$INT</targetbass>
  <actualbass>$INT</actualbass>
</bass>
<!-- POST -->
<bass>$INT</bass>
```

### `/getZone` — GET
Current multi-room zone. First member is the master.
```xml
<zone master="$MACADDR">
  <member ipaddress="$MASTER_IPADDR">$MASTER_MACADDR</member>
  <member ipaddress="$SLAVE1_IPADDR">$SLAVE1_MACADDR</member> ...
</zone>
```

### `/setZone` — POST
Create a multi-room ("play everywhere") zone.
```xml
<zone master="$MACADDR" senderIPAddress="$IPADDR">
  <member ipaddress="$IPADDR">$MACADDR</member> ...
</zone>
```

### `/addZoneSlave` — POST
Add a slave to an existing zone.
```xml
<zone master="$MACADDR">
  <member ipaddress="$IPADDR">$MACADDR</member> ...
</zone>
```

### `/removeZoneSlave` — POST
Remove a slave from a zone.
```xml
<zone master="$MACADDR">
  <member ipaddress="$IPADDR">$MACADDR</member> ...
</zone>
```

### `/nowPlaying` — GET
Everything about the currently playing media.
```xml
<nowPlaying deviceID="$MACADDR" source="$SOURCE">
  <ContentItem source="$SOURCE" location="$STRING" sourceAccount="$STRING" isPresetable="$BOOL">
    <itemName>$STRING</itemName>
  </ContentItem>
  <track>$STRING</track>
  <artist>$STRING</artist>
  <album>$STRING</album>
  <stationName>$STRING</stationName>
  <art artImageStatus="$ART_STATUS">$URL</art>
  <playStatus>$PLAY_STATUS</playStatus>
  <description>$STRING</description>
  <stationLocation>$STRING</stationLocation>
</nowPlaying>
```

### `/trackInfo` — GET
Track information; same `<nowPlaying>` shape as above.

### `/volume` — GET / POST
Volume 0–100 inclusive. On POST, `muteenabled` is applied first; the system
unmutes if the new volume exceeds the current setting.
```xml
<!-- GET -->
<volume deviceID="$MACADDR">
  <targetvolume>$INT</targetvolume>
  <actualvolume>$INT</actualvolume>
  <muteenabled>$BOOL</muteenabled>
</volume>
<!-- POST -->
<volume>$INT<muteenabled>$BOOL</muteenabled></volume>
```

### `/presets` — GET
Current presets (ids 1–6).
```xml
<presets>
  <preset id="$PRESET_ID" createdOn="$UINT64" updateOn="$UINT64">
    <ContentItem source="$SOURCE" location="$STRING" sourceAccount="$STRING" isPresetable="$BOOL">
      <itemName>$STRING</itemName>
    </ContentItem>
  </preset>
  ...
</presets>
```

### `/info` — GET
Mostly-static device info: id, type, per-component sw/serial, cloud account,
network info.
```xml
<info deviceID="$MACADDR">
  <name>$STRING</name>
  <type>$STRING</type>
  <margeAccountUUID>$STRING</margeAccountUUID>
  <components>
    <component>
      <componentCategory>$STRING</componentCategory>
      <softwareVersion>$STRING</softwareVersion>
      <serialNumber>$STRING</serialNumber>
    </component> ...
  </components>
  <margeURL>$URL</margeURL>
  <networkInfo type="$STRING">
    <macAddress>$MACADDR</macAddress>
    <ipAddress>$IPADDR</ipAddress>
  </networkInfo>
  ...
</info>
```

### `/name` — POST
Set the device name.
```xml
<name>$STRING</name>
```

### `/capabilities` — GET
Lists optional capabilities and the URLs to access them. **Only access an
optional URL if it appears here.**
```xml
<capabilities deviceID="$MACADDR"> ...
  <capability name="$STRING" url="/$STRING" info="$STRING"/> ...
</capabilities>
```

### `/audiodspcontrols` — GET / POST
DSP audio mode. Only present if listed in `/capabilities`.
`supportedaudiomodes` lists the modes accepted by POST. Omitted POST fields are
left unchanged.
```xml
<!-- GET -->
<audiodspcontrols audiomode="$AUDIO_MODE" videosyncaudiodelay="0"
  supportedaudiomodes="$AUDIO_MODE|$AUDIO_MODE..."/>
<!-- POST -->
<audiodspcontrols audiomode="$AUDIO_MODE" videosyncaudiodelay="$UINT"/>
```

### `/audioproducttonecontrols` — GET / POST
Bass/treble tone controls. Only present if listed in `/capabilities`.
`minValue`/`maxValue`/`step` constrain the POST value. Omitted fields unchanged.
```xml
<!-- GET -->
<audioproducttonecontrols>
  <bass value="$INT" minValue="$INT" maxValue="$INT" step="$UINT"/>
  <treble value="$INT" minValue="$INT" maxValue="$INT" step="$UINT"/>
</audioproducttonecontrols>
<!-- POST -->
<audioproducttonecontrols>
  <bass value="$INT" />
  <treble value="$INT" />
</audioproducttonecontrols>
```

### `/audioproductlevelcontrols` — GET / POST
Front-center / rear-surround levels. Only present if listed in `/capabilities`.
Omitted fields unchanged.
```xml
<!-- GET -->
<audioproductlevelcontrols>
  <frontCenterSpeakerLevel value="$INT" minValue="$INT" maxValue="$INT" step="$UINT"/>
  <rearSurroundSpeakersLevel value="$INT" minValue="$INT" maxValue="$INT" step="$UINT"/>
</audioproductlevelcontrols>
<!-- POST -->
<audioproductlevelcontrols>
  <frontCenterSpeakerLevel value="$INT" />
  <rearSurroundSpeakersLevel value="$INT" />
</audioproductlevelcontrols>
```

---

## WebSocket notifications (port 8080, protocol `gabbo`)

Open `ws://$IP` with sub-protocol `"gabbo"`. The speaker pushes `<updates>`
frames. Most are "tickles" — react by re-fetching the matching GET endpoint.

```js
socket = new WebSocket("ws://$IP", "gabbo")
```

```xml
<!-- heartbeat / empty -->
<updates deviceID="$MACADDR"></updates>
<!-- some carry data inline -->
<updates deviceID="$MACADDR">
  <volume><targetvolume>$INT</targetvolume><actualvolume>$INT</actualvolume></volume>
</updates>
```

| Notification | Payload | React by |
| --- | --- | --- |
| **PresetsChangedNotifyUI** | `<presetsUpdated><presets>…</presets></presetsUpdated>` (includes new presets inline) | use inline data or re-GET `/presets` |
| **RecentsUpdatedNotifyUI** | `<recentsUpdated><recents>…</recents></recentsUpdated>` (inline) | re-GET `/recents` |
| **AcctModeChangedNotifyUI** | `<acctModeUpdated></acctModeUpdated>` | cloud account association changed |
| **ErrorNotification** | `ErrorNotification` | handle error |
| **NowPlayingChange** | `<nowPlayingUpdated><nowPlaying …>…</nowPlaying></nowPlayingUpdated>` (inline) | use inline data or re-GET `/nowPlaying` |
| **VolumeChange** | `<volumeUpdated/>` | re-GET `/volume` |
| **BassChange** | `<bassUpdated/>` | re-GET `/bass` |
| **ZoneMapChange** | `<zoneUpdated/>` (master + slave variants) | re-GET `/getZone` |
| **SWUpdateStatusChange** | `<swUpdateStatusUpdated/>` | no action needed |
| **SiteSurveyResultsChange** | `<siteSurveyResultsUpdated/>` | no action needed |
| **SourcesChange** | `<sourcesUpdated/>` | re-GET `/sources` |
| **NowSelectionChange** | `<nowSelectionUpdated><preset …>…</preset></nowSelectionUpdated>` (inline) | note selected preset |
| **NetworkConnectionStatus** | `<connectionStateUpdated/>` | check connection |
| **InfoChange** | `<infoUpdated/>` (e.g. name changed) | re-GET `/info` |

### Zone map change sequencing
When a slave joins a zone, the master emits a series of per-slave updates:
```xml
<updates deviceID="slave $MACADDR"><zoneUpdated/></updates>
<updates deviceID="slave $MACADDR"><volumeUpdated/></updates>
<updates deviceID="slave $MACADDR"><nowPlayingUpdated/></updates>
```
When a slave leaves, you'll see `<zoneUpdated/>` + `<nowPlayingUpdated/>`. The
master also emits its own `<zoneUpdated/>` whenever a slave joins or leaves.

### Real-device confirmed: idle, heartbeat, and standby behavior

Confirmed by a live capture against a real speaker (2026-07-17), resolving
what the v1.1 spec leaves ambiguous:

- **No heartbeat/keepalive traffic exists.** The empty `<updates
  deviceID="$MACADDR"></updates>` frame shown above is a documented *shape*,
  not something observed being sent periodically — a fully idle socket
  produced zero messages (not even an empty tickle) for 2+ minutes after the
  initial `SoundTouchSdkInfo` handshake. Treat the channel as push-only and
  silent when nothing changes; don't build any idle-timeout expectation
  around it.
- **The socket stays open and silent through standby/power-off** — no
  `close`, no ping/pong, no traffic at all for 113s of standby in testing.
  Activity (including the resumed source) arrives on the **same** connection
  once powered back on — no reconnect is triggered by entering or leaving
  standby.
- Practical implication: a fixed reconnect-on-`close` (e.g. 5s) plus a
  client-sent keepalive ping (e.g. 30s) is sufficient — there's no
  server-side idle timeout to defend against, and standby is not a
  disconnect event to special-case.

---

## Discovery details

**SSDP** — M-SEARCH over UDP multicast port `1900` with the desired service
type. Service types:
- `urn:schemas-upnp-org:device:MediaRenderer:1` — audio players (SoundTouch speakers)
- `urn:schemas-upnp-org:device:MediaServer:1` — media holders (app / music server)

Service providers `NOTIFY` with `ssdp:alive` (USN = uuid, `Cache-control:
max-age` ≥ 1800s) and `ssdp:byebye` on shutdown. Clients must track expiry and
use the `Location` header address for follow-up calls.

**mDNS / Bonjour / Zero-conf** — service types:
- `_soundtouch._tcp.local` — general SoundTouch capabilities
- `_raop._tcp.local` — AirPlay, if supported on that speaker

Run both protocols for redundancy; port availability and multicast reachability
vary across networks (VLANs, containers).
