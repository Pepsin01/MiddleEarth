# To do — handover list

Written 2026-11-11 at the end of the first working session. Delete entries as they get done.

## Where things stand

`main` is stable and runnable. Each finished feature was built on its own branch and merged with a merge commit; nothing has been pushed.

Run it:

```
npm install
npm run media:fetch     # downloads the map and the portraits into data/media (not in git), cuts map tiles
npm run dev             # http://localhost:5173  (API on 8787)
npm run check           # type checks + 72 tests + data check
```

Done and merged: project setup (Node 26, Vite, React, Express), data model + JSON storage + editing API + password login + backups on the server, map pipeline and map view, story data for Seasons 1–2 (126 events, 29 characters, 25 places, Season 3 as empty episodes), main interface (markers, timeline, side panel, legend, search).

## Unfinished branch: `feature/character-journeys`

One "WIP" commit, type-checks, not merged. Already there:

- `src/map/PortalMarker.tsx` — `route` prop: marker glides along a route when its position changes
- `src/map/TrailLayer.tsx` — draws route lines in the `trails` map pane
- `src/scene.ts` — `buildTrails()` and `TrailMode`
- `src/store.ts` — `options.speed`, `PLAY_SECONDS`, `setPlaying(true)` starts at the episode's first event

Still to do on it:

1. `src/map/SceneLayers.tsx`: render character portraits (pane `characters`, `Portrait` size 30, ring = storyline colour, name label on hover, click selects). Put events **and** characters into one `declutter()` call. Keep the previous `scene.time` in a ref and pass `characterPath(prev, now).at(-1)` as `route` when it ends at the new position.
2. Render `<TrailLayer trails={buildTrails(...)} />`.
3. Play button in `Timeline` (the `controls` prop exists) + a `usePlayer` hook: while `playing`, call `step(1)` every `PLAY_SECONDS[speed]`; stop when it returns false. Space = play/pause. Moving the slider by hand pauses.
4. "What the map shows" menu: trails off / this episode / everything; play speed.
5. Styles for the portrait markers; screenshots; tests for `buildTrails`; merge.

## Features not started (one branch each)

- **Editor** (`feature/editor`) — the biggest piece. Edit-mode toggle in the toolbar; login dialog when `session.authRequired`. Forms for event, character, place, episodes/seasons, storylines. Click the map to set a position, drag markers, draw route points. Picture field: upload, drag and drop, paste from clipboard, or a web address the server tries to download. Server still needs `POST /api/media/upload` (multer is installed) and `POST /api/media/fetch`. The API for saving entries already exists (`src/api.ts`). Show `bundle.problems` in edit mode. Keep high effort for this one.
- **Wiki autofill** — server proxy to `https://lotr.fandom.com/api.php` (`opensearch` for search; `prop=pageimages|info` for the link; first paragraph via `action=parse&section=0`, the wiki has no `extracts`). Fill in title, wiki link, summary and the *suggested picture link* only — never download or embed wiki pictures (see below).
- **Spoiler guard** — "watched up to" per saga in localStorage; lock later ticks on the timeline, cap `step`/Play, pass the limit as `searchScope` to `TopBar`, first-visit question. Identity reveals already work (`identityAt`, `hasHiddenIdentity`).
- **Changing-world overlays** — schema, validation and `overlayVisible()` exist and `scene.overlays` is computed; needs map rendering (labels, regions, lines), an editor form, and data (Southlands → Mordor at `s1e7-the-southlands-become-mordor`, siege of Eregion S2E6–E8, Imladris from S2E8, Second Age names over the Third Age labels of the map).
- **Storyline chart** — SVG lanes per storyline across episodes, event dots, lines for followed characters, click jumps to the map.
- **Phone and tablet layout** — panels as bottom sheets/drawers, timeline per season, touch targets. `detailOpen`/`legendOpen` already start closed on small screens.
- **Backups and export** — server snapshots and restore exist (`/api/backups`); needs the UI, plus export/import of everything (data + media) as a zip (`fflate` is installed; check paths against zip-slip on import).
- **Docker and guide** — Dockerfile (Node 26, `npm run build`, `node server/index.ts`, `HOST=0.0.0.0`), compose file with `./data` mounted, `ADMIN_PASSWORD` from `.env`, bound to 127.0.0.1 by default. `README.md` is still empty; write `docs/GUIDE.md` (use, edit, add a season/saga/map, data file format, build, deploy, backups). Docker Desktop was not running when checked.

## Small things

- `npm run media:fetch` once more: `img/characters/stranger.jpg` is still missing (Wikimedia asked for a 10-minute pause).
- No portrait found on Wikimedia Commons for Mirdania, Theo, Waldreg, Estrid and Pharazôn (they show initials). Add by hand once the editor exists.
- Check the portrait crops (`image.focus` in `characters.json`) for everyone, not just the few seen in screenshots.
- Marker rows at low zoom can sit far from their real spots (e.g. Eregion in S2E7–E8); consider a thin leader line or a smaller cluster radius.
- A default opening view (`view` in `saga.json`) centred on the western lands might be nicer than fitting the whole map.

## Decisions and facts worth remembering

- **Pictures.** The LOTR wiki's image host refuses automated downloads (403) and forbids embedding on other sites. Do not work around either. Characters use Wikimedia Commons photos of the actors (500px thumbnails, credited); events/places show a map excerpt and carry `suggestedPicture`, a link to a still on the wiki that the user can add by hand.
- **Spoilers.** Season 3 started on 2026-11-11 and the user is watching it. Keep Season 3 episode titles, plot and promotional material out of the data and out of messages. On the wiki, "Halbrand" and "The Stranger" redirect to the spoiler pages, so those characters only get wiki links from their reveal events on.
- **Map.** "Middle Earth and Numenor – Tolkien Style Map" by KirsiKura (DeviantArt), 12098 × 9630 px. It has Númenor as an inset and uses some Third Age kingdom names (Arthedain, Cardolan) — not a strict Second Age map. Positions in the data are pixels of this picture. Several places are marked "approximate" in their descriptions.
- **Routes.** An event's `via` points are followed only by characters who were on the map, were somewhere else, and for whom the first point is no farther away than the destination (`routeFor` in `shared/timeline.ts`).
- **Tests on Windows.** Use `npm test` (it wraps vitest); calling vitest directly fails in terminals that spell the drive letter in lowercase.
- **Content generator.** The story data was generated by a throwaway script that is not in the repo; from now on the JSON files in `data/sagas/rings-of-power` are the source of truth.
