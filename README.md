# Middle-earth Chronicle

An interactive story map of Middle-earth. It shows where the events of *The Rings of Power* happen, episode by episode, and where the main characters are at each point of the story.

- A zoomable hand-drawn-style map with a marker for every event of the selected episode
- A time slider with one step per episode, plus Play to walk through the story event by event
- Character portraits that move along their routes as the story advances
- A side panel with a description, the people involved and a wiki link for every event, character and place
- Story data kept in plain JSON files that can be edited by hand

- An editor: add events, characters, places and episodes in the app, with pictures

The full guide is in [docs/GUIDE.md](docs/GUIDE.md): using and editing, pictures, adding seasons, films and maps, the data files, backups, Docker and deployment. [TODO.md](TODO.md) lists what is finished and what is still planned.

## Run it on your computer

You need [Node.js](https://nodejs.org) 24 or newer.

```
npm install
npm run media:fetch
npm run dev
```

Then open <http://localhost:5173>.

`npm run media:fetch` downloads the map picture and the character portraits into `data/media` and cuts the map into tiles. That folder is deliberately not stored in git, so the command is needed once after cloning. If a download is refused because of too many requests, run it again a few minutes later; it only fetches what is missing.

To run the built app the way a server would:

```
npm run build
npm start
```

and open <http://127.0.0.1:8787>.

## Useful commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the app for development (web on port 5173, API on 8787) |
| `npm run check` | Type checks, tests and a consistency check of the data files |
| `npm run data:check` | Checks the files in `data/` after editing them by hand |
| `npm run media:fetch` | Downloads missing pictures and builds missing map tiles |
| `npm run map:add` | Registers another map picture (for example for the films) |

## Using it

- Click a tick on the time slider, or use the left and right arrow keys, to move between episodes.
- Shift + arrow keys step through single events; Space starts and stops Play.
- Click a marker, a portrait or a faded dot (an earlier event) to read about it.
- The menu button at the top left lists the storylines (click to hide or show one) and who is on the map.
- The layers button at the top right controls what the map shows.

## Where the data lives

```
data/maps/<map>.json                      a map picture: size, source, credit
data/sagas/<saga>/saga.json               seasons, episodes, storylines
data/sagas/<saga>/places.json             named places and their position on the map
data/sagas/<saga>/characters.json         tracked characters
data/sagas/<saga>/events/<episode>.json   the events of one episode, in story order
data/media/                               pictures and map tiles (not in git)
data/backups/                             automatic copies made before every change (not in git)
```

Positions are pixels of the map picture, measured from its top-left corner. The fields are described in [shared/schema.ts](shared/schema.ts).

## Settings

Set these as environment variables before `npm start`:

| Variable | Meaning |
|---|---|
| `PORT` | Port to listen on (default 8787) |
| `HOST` | Address to listen on (default `127.0.0.1`, this computer only) |
| `ADMIN_PASSWORD` | When set, changing data requires logging in with this password |
| `READ_ONLY` | `true` switches all editing off |
| `DATA_DIR` | Folder with the data (default `data`) |

## Credits

- Map: "Middle Earth and Numenor – Tolkien Style Map" by KirsiKura (fan art, DeviantArt). It shows Númenor as an inset and uses some Third Age names.
- Portraits: photos of the actors from Wikimedia Commons under Creative Commons licences; each portrait links to its source and names its photographer.
- Stills from the series are not included. The LOTR wiki does not allow its pictures to be copied or embedded automatically, so the app links to fitting stills instead.
- This is a personal fan project, not affiliated with Amazon, the Tolkien Estate or the wiki.
