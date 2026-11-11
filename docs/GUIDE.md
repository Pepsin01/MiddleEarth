# Middle-earth Chronicle — guide

How to use the app, add to it, run it and put it on a server.

- [1. Running it on your computer](#1-running-it-on-your-computer)
- [2. Using the app](#2-using-the-app)
- [3. Editing in the app](#3-editing-in-the-app)
- [4. Pictures](#4-pictures)
- [5. Spoilers and secret identities](#5-spoilers-and-secret-identities)
- [6. Adding a season, the films, or another map](#6-adding-a-season-the-films-or-another-map)
- [7. Editing the data files by hand](#7-editing-the-data-files-by-hand)
- [8. Backups](#8-backups)
- [9. Docker](#9-docker)
- [10. Putting it on a server](#10-putting-it-on-a-server)
- [11. Working on the code](#11-working-on-the-code)
- [12. When something goes wrong](#12-when-something-goes-wrong)

What is finished and what is still planned is tracked in [TODO.md](../TODO.md).

## 1. Running it on your computer

You need [Node.js](https://nodejs.org) 24 or newer (the project was built with 26).

```text
npm install            once, and again after pulling changes
npm run media:fetch    once: downloads the map and portraits, cuts the map into tiles
npm run dev            starts the app; open http://localhost:5173
```

`npm run dev` is meant for working on the app: it reloads when code changes. Stop it with Ctrl+C.

To run it the way a server does (one port, no reloading):

```text
npm run build
npm start              open http://127.0.0.1:8787
```

Pictures and map tiles are kept in `data/media`, which is deliberately **not** stored in git. That is why `npm run media:fetch` is needed after cloning the project on a new machine. It only downloads what is missing, so it is safe to run again. If a website answers "too many requests", wait a few minutes and run it again.

## 2. Using the app

| To do this | Do this |
| --- | --- |
| Move through the story | Click an episode on the time slider, drag along it, or press the left/right arrow keys |
| Step through single events | The two skip buttons next to Play, or Shift + arrow keys |
| Let the story play | The Play button or the Space bar. The map follows each event. |
| Read about something | Click an event marker, a portrait, or a faded dot (an earlier event) |
| Hide a storyline | Menu button (top left), then click the storyline. The small target icon shows only that one. |
| Follow one character | Open the character and press "Follow the journey": the whole route is drawn |
| Search | The search box, or press `/`. It finds events, characters and places. |
| Avoid spoilers | Eye button (top right): say how far you have watched; later episodes are locked |
| Change what the map shows | Layers button (top right): earlier events, place names, routes, Play speed, paper tint |
| Zoom | Mouse wheel, pinch, or the + and − buttons. The frame button shows the whole map. |

The address bar always describes what you are looking at (saga, episode, selection), so a bookmark or a copied link brings you back to the same view.

Events without a picture of their own show an excerpt of the map around them. Where a fitting still exists on the LOTR wiki, a link to it is shown underneath.

## 3. Editing in the app

Press the **pencil** button (top right) to switch edit mode on. If a password is set on the server, you are asked for it first.

**Add an event**

1. Move the time slider to the episode.
2. Press "Add an event to S…E…" in the side panel (or Add → An event).
3. Give it a title and choose the storyline.
4. Say where it happens: choose a named place, or press "Pick on the map" and click the spot.
5. Tick the characters taking part. Their portraits move to this event.
6. Optionally add a description, a picture and a wiki link, then press Save.

Other fields of the event form:

- **Comes** — where in the episode the event sits. The order inside an episode is the order of the story.
- **Kind** — major (large marker), minor (small marker) or waypoint (a tiny marker that mainly shapes a route).
- **Who leaves the map after this** — for deaths and disappearances. The character vanishes after the event and comes back if a later event lists them again.
- **Route taken to get here** — press "Add route points" and click the map along the way. Without route points characters travel in a straight line. Route points are followed only by characters who come from that direction; anyone arriving from elsewhere takes a straight line. If two groups arrive by different roads, give each group its own waypoint event first.
- **Flashback** — the event is shown, but nobody travels to it.

**Change or delete something** — select it on the map (or through search), then press Edit at the top of the side panel. Delete is at the bottom of the form. A place or character that is still used by events can only be deleted after a second confirmation, which explains what happens to those events.

**Characters** — Add → A character. Name, group (used in the list on the left), storyline colour, actor, portrait, wiki link. A character appears on the map from their first event on.

**Places** — Add → A place. Places save you from clicking the exact same spot again and again, and the side panel collects everything that happened there.

**Episode titles, seasons, storylines** — Add → Episodes, seasons, storylines. Season 3 episodes are called "Episode 1" to "Episode 8" until you rename them. An episode or storyline can only be removed while nothing uses it.

Every save first makes a backup of all data files (see [Backups](#8-backups)).

## 4. Pictures

A picture can get into the app in four ways. In any picture field:

- **Choose a file** from your computer,
- **drag** a file onto the field,
- **paste** a copied picture with Ctrl+V,
- or type a picture's **web address** and press Fetch. The server then downloads it — if the website allows that.

Click on the preview to mark the most important point (for example a face); round portraits and cropped views keep that point visible.

**Why are there no stills from the series?** The LOTR wiki does not allow its pictures to be downloaded by programs or shown inside other websites, and the app respects that. Instead:

- characters have photos of their actors from Wikimedia Commons (free licences, credited under the portrait);
- events and places show a map excerpt, with a link to a fitting still on the wiki.

To add a still yourself: open the suggested link, right-click the picture, choose "Copy image", come back to the form and press Ctrl+V. This is a manual copy for your private use; the stills remain the property of Amazon. Keep `data/media` out of any public repository — it already is ignored by git.

Uploaded pictures are stored in `data/media/img/uploads`. They exist only on your machine, so include `data/media` when you copy the project somewhere else.

## 5. Spoilers and secret identities

The app never shows anything later than the moment the time slider is on, and that includes names. A character can have **reveals**: from a certain episode — or exactly from a certain event — on, they get a new name, description, wiki link, colour or actor.

In the data this is why "Halbrand" and "The Stranger" have no wiki link at first: on the wiki those names redirect to pages that give the secret away. The link is part of the reveal instead.

When you add a new character with a secret, enter the name as first known, leave the wiki link empty, and add a reveal (in the character form) for the moment the truth comes out.

**The spoiler guard.** The first time you open a saga the app asks how far you have watched. Episodes after that are locked on the time slider (a small padlock), and search, stepping and Play stay inside the limit; the titles of locked episodes are not shown either. Click a locked episode to unlock everything up to it, or use the eye button in the toolbar to move the limit or switch the guard off. The setting is remembered in your browser. Wiki pages opened from the app can of course still contain spoilers.

## 6. Adding a season, the films, or another map

**A new season of the same series** — Add → Episodes, seasons, storylines → "Add a season", then "Add an episode" as often as needed. New episodes get ids like `s4e1` automatically.

**Another series or the films** — these are separate *sagas*, each with its own timeline, characters and events, and its own map if you like. There is no form for creating a saga yet. Until there is, create the folder by hand:

```text
data/sagas/the-films/saga.json
```

```json
{
  "id": "the-films",
  "title": "The Lord of the Rings",
  "mapId": "second-age",
  "seasons": [
    { "id": "s1", "title": "The Fellowship of the Ring", "episodes": [{ "id": "s1e1", "title": "The Shire" }] }
  ],
  "storylines": [{ "id": "fellowship", "title": "The Fellowship", "color": "#2b6cb0" }]
}
```

Reload the page: a saga switcher appears next to the title, and everything else can be added in the app. A "season" can be a film and an "episode" a chapter of it — whatever steps you want on the time slider.

**Another map picture** (for example a Third Age map for the films):

```text
npm run map:add -- --id third-age --title "Middle-earth in the Third Age" --file "C:\Pictures\map.jpg" --credit "Map by …" --url "https://where-it-came-from"
```

This copies the picture into `data/media/maps/third-age/`, writes `data/maps/third-age.json` and cuts the tiles. Then set `"mapId": "third-age"` in the saga's `saga.json`. Positions are pixels of the map picture, so places and events of one map do not fit another one.

About the current map: it is a fan-made map in the style of the books, with Númenor as an inset at the bottom left. It uses some Third Age names (Arthedain, Cardolan), so it is not a strict Second Age map, and several series locations are marked "approximate" in their descriptions.

## 7. Editing the data files by hand

Everything the app knows is in readable JSON files, and editing them in a text editor is fine.

```text
data/maps/<map>.json                      a map: size, source, credit
data/sagas/<saga>/saga.json               title, seasons and episodes, storylines
data/sagas/<saga>/places.json             named places
data/sagas/<saga>/characters.json         characters
data/sagas/<saga>/overlays.json           regions, lines and labels that appear and disappear over time
data/sagas/<saga>/events/<episode>.json   the events of one episode, in story order
```

An event:

```json
{
  "id": "s1e6-orodruin-erupts",
  "title": "Orodruin erupts",
  "storylineId": "southlands",
  "importance": "major",
  "icon": "disaster",
  "placeId": "orodruin",
  "description": "Water meets fire beneath the mountain.",
  "characters": [],
  "wikiUrl": "https://lotr.fandom.com/wiki/Mount_Doom"
}
```

Rules worth knowing:

- An `id` uses lowercase letters, digits and dashes, and must be unique. Other entries refer to it, so do not change it later.
- An event needs either `placeId` (a place from `places.json`) or `pos` (`[x, y]` in pixels of the map picture, from its top-left corner).
- The file name of an events file is the episode id. To move an event to another episode, move it to the other file.
- The order of events inside a file is the order of the story.
- `importance` is `major`, `minor` or `travel`. `icon` is one of: star, battle, council, journey, arrival, death, magic, craft, discovery, omen, disaster, crown, ship, bond.
- All fields are described, with comments, in [shared/schema.ts](../shared/schema.ts).

**The changing world.** `overlays.json` holds annotations that are only shown during part of the story — the Southlands becoming Mordor, a siege, an army's march. There is no form for them yet, so they are edited by hand:

```json
{
  "id": "siege-of-eregion",
  "kind": "region",
  "title": "Eregion besieged",
  "points": [[4380, 3640], [4560, 3600], [4700, 3690], [4690, 3810], [4520, 3870], [4360, 3800]],
  "color": "#5a3d8a",
  "dashed": true,
  "from": "s2e6",
  "fromEvent": "s2e6-the-siege-of-eregion-begins",
  "untilEvent": "s2e8-the-death-of-celebrimbor"
}
```

- `kind`: `region` (an outline, three or more points), `line` (two or more points), `label` or `marker` (one point; a marker has an `icon`).
- `from` is the episode it appears in; add `fromEvent` to make it appear exactly when that event happens.
- `until` is the last episode it is shown in; `untilEvent` makes it disappear exactly when that event happens. Leave both out for "from then on".
- To read positions off the map, switch edit mode on, start adding a place, click the map and note the two numbers shown next to "Move it".
- Zoomed far out, overlays shrink to small symbols; hover or zoom in to read them. They can be switched off in the layers menu.

After editing, check your work:

```text
npm run data:check
```

It reports typos, broken references ("event X lists the unknown character Y") and entries it had to skip. A mistake in one entry does not break the app: that entry is skipped and listed as a problem (also in the app, in edit mode, under the warning triangle). Entries the app could not understand are left untouched when it saves a file.

Restart is not needed after editing files; reload the page.

## 8. Backups

Before every change made through the app, all data files (not the pictures) are copied to

```text
data/backups/<date and time>--<what was done>/
```

The newest 40 are kept, plus one per day for older ones up to 60 days.

**To undo something:** switch edit mode on and press the clock button in the toolbar. It lists the backups, newest first, each with what was about to happen ("before deleting an event"). "Restore" brings all data back to that point — after backing up the current state, so a restore can itself be undone. "Back up now" makes one by hand.

**Export and import.** The same menu exports everything as one zip file: the data, optionally the pictures (portraits and your uploads), and optionally the large map picture. "Import a zip" unpacks such a file on another machine; entries in the zip replace the current ones, everything else stays. Only files that belong to an export are accepted. After importing on a new machine run `npm run media:fetch` once so the map tiles are built.

By hand it also works: stop the app and copy the `sagas` and `maps` folders from a backup over the ones in `data/`.

The data files are also in git, so `git diff` shows what changed and `git checkout -- data/sagas` throws uncommitted changes away. Committing the data now and then gives you a second, independent history.

To move everything to another machine, use the export, or copy the whole `data` folder including `data/media`.

## 9. Docker

> The Docker files are written but have **not been built or run yet** — Docker Desktop was not running when they were made. Treat the first run as a test.

You need Docker Desktop (Windows, Mac) or Docker Engine with the compose plugin (Linux).

```text
copy .env.example .env             (Linux/Mac: cp .env.example .env) — then edit .env
docker compose up -d --build       builds the image and starts the app
```

Open <http://localhost:8080>.

The container keeps nothing of value inside: the `data` folder of the project is mounted into it. If the pictures and tiles are not there yet, fetch them once with the container's own tools:

```text
docker compose run --rm chronicle npm run media:fetch
```

Everyday commands:

| Command | What it does |
| --- | --- |
| `docker compose up -d --build` | Start, or rebuild and restart after pulling changes |
| `docker compose logs -f` | Watch the log |
| `docker compose down` | Stop |
| `docker compose run --rm chronicle npm run data:check` | Check the data files |

Settings in `.env`:

| Setting | Meaning |
| --- | --- |
| `ADMIN_PASSWORD` | Password for editing. Empty means everybody who can open the app can edit. |
| `BIND_ADDRESS` | `127.0.0.1` (default): only this computer. `0.0.0.0`: everybody who can reach the machine. |
| `PORT` | Port on the machine (default 8080) |
| `READ_ONLY` | `true`: nobody can edit |
| `TRUST_PROXY` | `true` behind a reverse proxy that provides HTTPS |

On Linux the container runs as user id 1000. If saving fails with a permission error, give that user the data folder: `sudo chown -R 1000:1000 data`.

## 10. Putting it on a server

1. Get the project onto the server (`git clone`), and the `data/media` folder — either copy it from your computer or run `media:fetch` as shown above. Pictures you uploaded by hand exist only in your copy of `data/media`.
2. Create `.env` with a good `ADMIN_PASSWORD`. Without a password anyone who finds the address can change your data.
3. Put it behind a reverse proxy that provides HTTPS, keep `BIND_ADDRESS=127.0.0.1` and set `TRUST_PROXY=true`. With [Caddy](https://caddyserver.com) the whole configuration is:

   ```text
   chronicle.example.org {
       reverse_proxy 127.0.0.1:8080
   }
   ```

4. `docker compose up -d --build`

Without Docker it works the same way with Node installed: `npm ci`, `npm run build`, then start `node server/index.ts` with the settings as environment variables (`PORT`, `HOST`, `ADMIN_PASSWORD`, `TRUST_PROXY`) under a process manager such as systemd.

Before making it public, think about the pictures. The portraits are freely licensed (keep the credits). Stills you added yourself are copyrighted by Amazon; a public site should not show them.

## 11. Working on the code

```text
src/        the web app (React, TypeScript, Leaflet)
server/     the API server (Express, run directly by Node - no build step)
shared/     data model and story logic used by both
scripts/    command-line helpers (media:fetch, map:add, data:check)
tests/      automated tests
data/       the story data
```

- `npm run check` runs the type checks, the tests and the data check. Run it before committing.
- Use `npm test`, not `vitest` directly: on Windows some terminals spell the drive letter in lowercase, which breaks vitest; the npm script works around it.
- The project uses one git branch per feature (`feature/…`), merged into `main` when it works. If a feature goes wrong, delete its branch and nothing else is affected.

## 12. When something goes wrong

| What you see | What to do |
| --- | --- |
| A grey or empty map | The tiles are missing: `npm run media:fetch` |
| Portraits show initials | The picture is missing (run `npm run media:fetch`) or none was found for that character — add one in the editor |
| "Cannot reach the server" | The server stopped: start `npm run dev` (or `npm start`) again |
| Saving says a file "could not be read" | A data file is not valid JSON after a hand edit. `npm run data:check` names the file; fix it or restore a backup |
| An entry disappeared after a hand edit | It has a mistake and was skipped: `npm run data:check` explains which field |
| `media:fetch` says a site "asks for a pause" | Too many downloads at once. Wait and run it again; finished downloads are kept |
| Port already in use | Another copy is running, or set `PORT` to a free number |
