---
feature: Harden BoseCloudServer TuneIn station-id handling
status: in-progress # merged to dev via PR #147, awaiting beta cut
date: 2026-07-10
branch: fix/bose-cloud-server-hardening
commit-type: fix
---

# Harden BoseCloudServer TuneIn station-id handling

## Context

`src/server/BoseCloudServer.ts` is an unauthenticated HTTP server (fake Bose
cloud) that LAN speakers call to resolve TuneIn stations. It binds all
interfaces with no auth — unavoidable, speakers must reach it. The route
`GET /bmx/tunein/v1/playback/station/<id>` captures the id with regex
`^\/bmx\/tunein\/v1\/playback\/station\/(.+)$` (line 214-216) and interpolates
it **raw and unencoded** into four outbound URLs in `_resolveTuneIn`
(lines 134-152):

- `http://opml.radiotime.com/Tune.ashx?id=${stationId}&formats=...` (:136)
- `https://opml.radiotime.com/describe.ashx?id=${stationId}&render=json` (:144)
- `/v1/report?stream_id=e3342&guide_id=${stationId}&...` (:152)
- `/v1/favorite/${stationId}` and `/v1/now-playing/station/${stationId}` (:155-157)

Any LAN client can inject extra query params (`123&render=xml`) or path
segments (`../../x`) into requests the plugin makes to radiotime.com, and the
raw id is reflected into the JSON response `name` field (:140, :146). Goal:
validate the id shape, encode at every interpolation site.

## Decisions & findings

| Date | Decision / finding | Rationale / evidence | Alternatives rejected |
| --- | --- | --- | --- |
| 2026-07-10 | Validate station id against a strict pattern, reject with 400 | Only defense available — server can't require auth (speakers won't send it) and can't bind loopback (speakers are remote LAN peers) | Auth token (speakers can't send one); loopback bind (breaks the feature) |
| 2026-07-10 | TuneIn ids are a letter prefix + digits (e.g. `s24939`, station ids `s\d+`, program `p\d+`, topic `t\d+`, group `g\d+`) | Consult `.claude/skills/soundtouch-api-expert/api-reference.md` and `docs/bose-cloud-setup.md` before finalizing the regex; `/^[a-z]?\d+$/i` is the starting point — confirm against real captures in `src/__device__/preset-concept.device.test.ts` and `scripts/bose-cloud.mjs` | Permissive allow-all with encoding only (still allows junk reflected into responses) |
| 2026-07-10 | Also `encodeURIComponent(stationId)` at every interpolation site even after validation | Defense in depth; costs nothing | — |
| 2026-07-10 | Keep all-interfaces bind and `200 {}` catch-all route as-is | Bind is required for speakers; unknown-route behavior may matter to speaker firmware — don't change blind. Out of scope. | Configurable `server.bindAddress` (defer until someone needs it) |
| 2026-07-10 | XML layer needs no changes | Audit confirmed xml2js Builder escapes by default and sax doesn't resolve external entities/DOCTYPE — no injection/XXE path | — |

## If cancelled

> Only fill this in when `status: cancelled`. Leave empty otherwise.

## Affected areas

- `src/server/BoseCloudServer.ts` — add id validation in `_handleRequest`
  (after the match at :214-217, before calling `_resolveTuneIn`): invalid id →
  `res.writeHead(400); res.end()`. Encode the id inside `_resolveTuneIn`
  (:134-157) at all five interpolation points.
- `src/server/__tests__/BoseCloudServer.test.ts` — existing test file; it
  already injects a mock axios via `BoseCloudServer.create({ axiosInstance })`
  (see :38-48), so upstream URLs can be asserted directly.

## Conventions for this change

- **Commit type:** `fix:` → patch release
- **Config schema touched:** no
- **Tests to add/update:** `src/server/__tests__/BoseCloudServer.test.ts`
- **Target branch:** `dev` (squash-merged; PR title is the released commit message).

## Implementation checklist

- [x] Read `coding-conventions` skill (ESM `.js` import rule) before editing
- [x] Confirm the station-id pattern against api-reference/captures; define
      `const STATION_ID_PATTERN = /^[a-z]?\d+$/i` (or as corrected) near the
      other constants at the top of `BoseCloudServer.ts`
- [x] Reject non-matching ids with 400 in `_handleRequest` before
      `_resolveTuneIn` is called; log at debug with the remote address
- [x] `encodeURIComponent` the id in all five URL interpolations in
      `_resolveTuneIn`
- [x] Tests: `123&render=xml` → 400 and axios mock never called;
      `../../etc` → 400; valid `s24939` → 200 and the mock-received URL
      contains the encoded id; reflected `name` falls back to the raw id only
      for valid ids
- [x] `npm run typecheck && npm run lint && npm test`

## Verification

- [x] `npm run lint`
- [x] `npm run build`
- [x] `npm test`
- [ ] `npm run watch` — with `server.enabled: true`, confirm a real speaker
      (or `curl http://<host>:8000/bmx/tunein/v1/playback/station/s24939`)
      still resolves a station, and a malformed id returns 400 — skipped, no
      real speaker available in this session

## PR / release notes

- **PR title (Conventional Commit, becomes the release commit):**
  `fix: validate and encode TuneIn station ids in BoseCloudServer`
- **Targets:** `dev`
