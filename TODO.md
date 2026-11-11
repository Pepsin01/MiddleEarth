# To do — handover list

Written 2026-11-11 at the end of the first working session. Delete entries as they get done.

## Where things stand

`main` is stable and runnable. Each finished feature was built on its own branch and merged with a merge commit; nothing has been pushed.

Run it:

```
npm install
npm run media:fetch     # downloads the map and the portraits into data/media (not in git), cuts map tiles
npm run dev             # http://localhost:5173  (API on 8787)
npm run check           # type checks + tests + data check
```

Done and merged: project setup (Node 26, Vite, React, Express), data model + JSON storage + editing API + password login + backups on the server, map pipeline and map view, story data for Seasons 1–2 (126 events, 29 characters, 25 places, Season 3 as empty episodes), main interface (markers, timeline, side panel, legend, search), character journeys (portraits on the map that glide along their routes, route lines, Play mode with Space, speed and route options in the "What the map shows" menu), editor (pencil button: add/edit/delete events, characters and places, episode titles, seasons and storylines; click the map for positions and route points; pictures by file, drag and drop, Ctrl+V or web address; login dialog when a password is set), the guide (`docs/GUIDE.md`) and the Docker files, spoiler guard (eye button: "watched up to"; later episodes are locked on the slider and excluded from search, stepping and Play; asked once on the first visit), changing-world overlays (regions, lines, labels and symbols timed by episode or event; 11 for Seasons 1–2 in `overlays.json`; switch in the "What the map shows" menu), backups and export (clock button in edit mode: list and restore automatic backups, back up now, export everything as a zip, import a zip), wiki autofill (the "Wiki link" field of the forms searches the LOTR wiki from the browser and fills in link, opening paragraph and suggested picture).

## Features not started (one branch each)

- **Storyline chart** — SVG lanes per storyline across episodes, event dots, lines for followed characters, click jumps to the map.
- **Phone and tablet layout** — panels as bottom sheets/drawers, timeline per season, touch targets. `detailOpen`/`legendOpen` already start closed on small screens.
- **Docker: first build and run.** `Dockerfile`, `docker-compose.yml` and `.env.example` are written but were never built (Docker Desktop was not running). Start Docker, run `docker compose up -d --build`, fix what breaks, then remove the "not been built" note in `docs/GUIDE.md` section 9.

## Editor leftovers

- Checked in a real browser: adding and deleting an event (with map click), the character form. Not yet clicked through: place form, episodes/storylines form, picture upload from the form (the server side is tested), login dialog (server side is tested).
- No form yet for overlays (edit `overlays.json` by hand, see the guide), for creating a new saga, or for registering a map (use `npm run map:add` and the API for now).
- Events can be placed "before X / last"; there is no drag-to-reorder list and markers cannot be dragged on the map.
- Deleting the last event of an episode leaves an empty `events/<episode>.json` (`[]`); harmless.

## Small things

- Keep `docs/GUIDE.md` in step with new features: it says a saga form are "planned".

- `npm run media:fetch` once more: `img/characters/stranger.jpg` is still missing (Wikimedia asked for a 10-minute pause).
- No portrait found on Wikimedia Commons for Mirdania, Theo, Waldreg, Estrid and Pharazôn (they show initials). Add by hand once the editor exists.
- Check the portrait crops (`image.focus` in `characters.json`) for everyone, not just the few seen in screenshots.
- Marker rows at low zoom can sit far from their real spots (e.g. Eregion in S2E7–E8); consider a thin leader line or a smaller cluster radius.
- Play mode: consider showing a small progress ring on the Play button, and pausing while the pointer is over the side panel.
- A default opening view (`view` in `saga.json`) centred on the western lands might be nicer than fitting the whole map.

## Decisions and facts worth remembering

- **Pictures.** The LOTR wiki's image host refuses automated downloads (403) and forbids embedding on other sites. Do not work around either. Characters use Wikimedia Commons photos of the actors (500px thumbnails, credited); events/places show a map excerpt and carry `suggestedPicture`, a link to a still on the wiki that the user can add by hand.
- **Spoilers.** Season 3 started on 2026-11-11 and the user is watching it. Keep Season 3 episode titles, plot and promotional material out of the data and out of messages. On the wiki, "Halbrand" and "The Stranger" redirect to the spoiler pages, so those characters only get wiki links from their reveal events on.
- **Map.** "Middle Earth and Numenor – Tolkien Style Map" by KirsiKura (DeviantArt), 12098 × 9630 px. It has Númenor as an inset and uses some Third Age kingdom names (Arthedain, Cardolan) — not a strict Second Age map. Positions in the data are pixels of this picture. Several places are marked "approximate" in their descriptions.
- **Routes.** An event's `via` points are followed only by characters who were on the map, were somewhere else, and for whom the first point is no farther away than the destination (`routeFor` in `shared/timeline.ts`).
- **Tests on Windows.** Use `npm test` (it wraps vitest); calling vitest directly fails in terminals that spell the drive letter in lowercase.
- **Content generator.** The story data was generated by a throwaway script that is not in the repo; from now on the JSON files in `data/sagas/rings-of-power` are the source of truth.
