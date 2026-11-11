import { ArrowLeft, BookOpen, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, ImageIcon, LocateFixed, MapPin, Pencil, Plus, Route, X } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import type { Character, ImageRef, Place } from '../../shared/schema.ts';
import { characterAt, hasHiddenIdentity, identityAt } from '../../shared/timeline.ts';
import type { Time, TimedEvent } from '../../shared/timeline.ts';
import { formatDate, plural } from '../lib/format.ts';
import { eventPicture, eventsAtPlace, journeySoFar, storylineColor } from '../scene.ts';
import { useScene } from '../useScene.ts';
import { EditorPanel } from '../editor/EditTools.tsx';
import { useStore } from '../store.ts';
import { iconFor } from './icons.tsx';
import { MapVignette } from './MapVignette.tsx';
import { Picture, Portrait } from './Picture.tsx';

const PLACE_KIND: Record<Place['kind'], string> = {
  realm: 'Realm',
  region: 'Region',
  city: 'City',
  fortress: 'Fortress',
  village: 'Village',
  mountain: 'Mountain',
  forest: 'Forest',
  water: 'Sea',
  ruin: 'Ruin',
  other: 'Place',
};

export function WikiLink({ url }: { url: string | undefined }) {
  if (!url) return null;
  return (
    <a className="wiki-link" href={url} target="_blank" rel="noreferrer">
      Read more on the wiki <ExternalLink aria-hidden="true" />
    </a>
  );
}

/** Link to a still on the wiki. The wiki does not let other sites show its pictures, so it can only be linked. */
export function StillLink({ url, label = 'See a still from the series on the wiki' }: { url: string | undefined; label?: string }) {
  if (!url) return null;
  return (
    <a className="wiki-link wiki-link--still" href={url} target="_blank" rel="noreferrer">
      <ImageIcon aria-hidden="true" /> {label} <ExternalLink aria-hidden="true" />
    </a>
  );
}

function PhotoCredit({ image }: { image: ImageRef | undefined }) {
  if (!image?.credit) return null;
  return (
    <p className="credit">
      {image.page ? (
        <a href={image.page} target="_blank" rel="noreferrer">
          {image.credit}
        </a>
      ) : (
        image.credit
      )}
    </p>
  );
}

/** One line in a list of events. */
export function EventRow({ timed, showEpisode = false, onPick }: { timed: TimedEvent; showEpisode?: boolean; onPick: (timed: TimedEvent) => void }) {
  const bundle = useStore((state) => state.bundle)!;
  const selected = useStore((state) => state.selection?.kind === 'event' && state.selection.id === timed.event.id);
  const Icon = iconFor(timed.event);
  const details = [showEpisode ? timed.episode.code : null, timed.place?.name, timed.event.flashback ? 'flashback' : null].filter(Boolean).join(' · ');
  return (
    <li>
      <button type="button" className={`event-row${selected ? ' is-selected' : ''}`} onClick={() => onPick(timed)}>
        <span className={`event-row__icon event-row__icon--${timed.event.importance}`} style={{ '--c': storylineColor(bundle, timed.event.storylineId) } as CSSProperties}>
          <Icon aria-hidden="true" />
        </span>
        <span className="event-row__text">
          <strong>{timed.event.title}</strong>
          {details && <small>{details}</small>}
        </span>
      </button>
    </li>
  );
}

/** A character's portrait and name, as known at the given moment. */
export function CharacterChip({ character, time }: { character: Character; time: Time }) {
  const bundle = useStore((state) => state.bundle)!;
  const timeline = useStore((state) => state.timeline)!;
  const select = useStore((state) => state.select);
  const identity = identityAt(timeline, character, time);
  return (
    <button type="button" className="chip" onClick={() => select({ kind: 'character', id: character.id })}>
      <Portrait image={identity.image} name={identity.name} size={28} color={storylineColor(bundle, identity.storylineId)} />
      {identity.name}
    </button>
  );
}

function Header({ children }: { children?: ReactNode }) {
  const select = useStore((state) => state.select);
  const selection = useStore((state) => state.selection);
  const setDetailOpen = useStore((state) => state.setDetailOpen);
  const code = useStore((state) => state.timeline?.episodeById.get(state.episodeId)?.code);
  const editing = useStore((state) => state.editing);
  const openEditor = useStore((state) => state.openEditor);
  const editable = editing && selection && selection.kind !== 'overlay' ? selection : null;
  return (
    <header className="detail__header">
      {selection ? (
        <button type="button" className="text-button" onClick={() => select(null)}>
          <ArrowLeft aria-hidden="true" /> {code} overview
        </button>
      ) : (
        <span className="detail__kicker">{children}</span>
      )}
      {editable && (
        <button type="button" className="button button--small" onClick={() => openEditor({ kind: editable.kind as 'event' | 'character' | 'place', id: editable.id })}>
          <Pencil aria-hidden="true" /> Edit
        </button>
      )}
      <button type="button" className="icon-button" onClick={() => setDetailOpen(false)} aria-label="Hide this panel">
        <X aria-hidden="true" />
      </button>
    </header>
  );
}

function EpisodeView() {
  const timeline = useStore((state) => state.timeline)!;
  const episodeId = useStore((state) => state.episodeId);
  const hidden = useStore((state) => state.hiddenStorylines);
  const showEvent = useStore((state) => state.showEvent);
  const editing = useStore((state) => state.editing);
  const openEditor = useStore((state) => state.openEditor);
  const ref = timeline.episodeById.get(episodeId);
  if (!ref) return null;
  const all = timeline.eventsByEpisode.get(episodeId) ?? [];
  const events = all.filter((timed) => !hidden.includes(timed.event.storylineId));
  const date = formatDate(ref.episode.airDate);
  return (
    <>
      <Header>Episode</Header>
      <div className="detail__scroll">
        <Picture image={ref.episode.image} width={960} alt="" className="picture--hero" credit />
        <div className="detail__body">
          <p className="eyebrow">
            {ref.season.title} · Episode {ref.number}
            {date && ` · ${date}`}
          </p>
          <h2>{ref.episode.title}</h2>
          {ref.episode.synopsis && <p className="prose">{ref.episode.synopsis}</p>}
          <WikiLink url={ref.episode.wikiUrl} />
          {!ref.episode.image && <StillLink url={ref.episode.suggestedPicture} />}
          {editing && (
            <div className="actions">
              <button type="button" className="button" onClick={() => openEditor({ kind: 'event', id: null })}>
                <Plus aria-hidden="true" /> Add an event to {ref.code}
              </button>
              <button type="button" className="button" onClick={() => openEditor({ kind: 'saga', id: null })}>
                <CalendarDays aria-hidden="true" /> Episode titles
              </button>
            </div>
          )}
          <section>
            <h3>What happens</h3>
            {events.length > 0 ? (
              <ol className="event-list">
                {events.map((timed) => (
                  <EventRow key={timed.event.id} timed={timed} onPick={(picked) => showEvent(picked.event.id)} />
                ))}
              </ol>
            ) : (
              <p className="muted">{all.length ? 'All storylines of this episode are hidden.' : 'Nothing has been recorded for this episode yet.'}</p>
            )}
            {events.length < all.length && events.length > 0 && <p className="muted">{plural(all.length - events.length, 'event')} hidden by the storyline filter.</p>}
          </section>
        </div>
      </div>
    </>
  );
}

function EventView({ timed }: { timed: TimedEvent }) {
  const bundle = useStore((state) => state.bundle)!;
  const timeline = useStore((state) => state.timeline)!;
  const episodeId = useStore((state) => state.episodeId);
  const select = useStore((state) => state.select);
  const flyTo = useStore((state) => state.flyTo);
  const showEvent = useStore((state) => state.showEvent);
  const { event, episode, place } = timed;
  const storyline = bundle.saga.storylines.find((entry) => entry.id === event.storylineId);
  const siblings = timeline.eventsByEpisode.get(event.episodeId) ?? [];
  const index = siblings.indexOf(timed);
  const previous = siblings[index - 1];
  const next = siblings[index + 1];
  const characters = event.characters.map((id) => timeline.characterById.get(id)).filter((entry): entry is Character => entry !== undefined);
  const picture = eventPicture(timed);
  const Icon = iconFor(event);

  return (
    <>
      <Header />
      <div className="detail__scroll">
        {picture ? (
          <Picture image={picture} width={960} alt="" className="picture--hero" credit />
        ) : (
          timed.pos && (
            <MapVignette pos={timed.pos} color={storyline?.color ?? '#6b5b45'}>
              <Icon aria-hidden="true" />
            </MapVignette>
          )
        )}
        <div className="detail__body">
          <p className="eyebrow">
            <span className="swatch" style={{ background: storyline?.color }} />
            {storyline?.title} · {episode.code}
          </p>
          <h2>{event.title}</h2>
          {event.flashback && <p className="tag">A scene from the past</p>}
          <button
            type="button"
            className="place-link"
            onClick={() => {
              if (place) select({ kind: 'place', id: place.id });
              if (timed.pos) flyTo(timed.pos);
            }}
          >
            {place ? <MapPin aria-hidden="true" /> : <LocateFixed aria-hidden="true" />}
            {place ? place.name : 'Show on the map'}
          </button>
          {event.description && <p className="prose">{event.description}</p>}
          {characters.length > 0 && (
            <section>
              <h3>Who is there</h3>
              <div className="chips">
                {characters.map((character) => (
                  <CharacterChip key={character.id} character={character} time={timed.time} />
                ))}
              </div>
            </section>
          )}
          <WikiLink url={event.wikiUrl} />
          {!event.image && <StillLink url={event.suggestedPicture} />}
          {event.episodeId !== episodeId && (
            <p className="notice">
              This happens in {episode.code}, “{episode.episode.title}”.{' '}
              <button type="button" className="text-button" onClick={() => showEvent(event.id)}>
                Move the timeline there
              </button>
            </p>
          )}
        </div>
      </div>
      <footer className="detail__nav">
        <button type="button" className="text-button" disabled={!previous} onClick={() => previous && showEvent(previous.event.id)}>
          <ChevronLeft aria-hidden="true" /> Earlier
        </button>
        <span>
          {index + 1} of {siblings.length} in {episode.code}
        </span>
        <button type="button" className="text-button" disabled={!next} onClick={() => next && showEvent(next.event.id)}>
          Later <ChevronRight aria-hidden="true" />
        </button>
      </footer>
    </>
  );
}

function CharacterView({ character }: { character: Character }) {
  const bundle = useStore((state) => state.bundle)!;
  const timeline = useStore((state) => state.timeline)!;
  const followed = useStore((state) => state.followed.includes(character.id));
  const toggleFollow = useStore((state) => state.toggleFollow);
  const flyTo = useStore((state) => state.flyTo);
  const peekEvent = useStore((state) => state.peekEvent);
  const scene = useScene();
  if (!scene) return null;
  const identity = identityAt(timeline, character, scene.time);
  const state = characterAt(timeline, character.id, scene.time);
  const journey = journeySoFar(timeline, character.id, scene.time);
  const where = state?.stop.at.place?.name ?? state?.stop.at.event.title;

  return (
    <>
      <Header />
      <div className="detail__scroll">
        <div className="detail__body">
          <div className="who">
            <Portrait image={identity.image} name={identity.name} size={104} color={storylineColor(bundle, identity.storylineId)} />
            <div>
              {character.group && <p className="eyebrow">{character.group}</p>}
              <h2>{identity.name}</h2>
              {identity.playedBy && <p className="played-by">Played by {identity.playedBy}</p>}
              {state ? (
                <button type="button" className="place-link" onClick={() => flyTo(state.pos)}>
                  <MapPin aria-hidden="true" /> {where}
                </button>
              ) : (
                <p className="muted">{journey.length ? 'No longer on the map at this point of the story.' : 'Has not appeared yet at this point of the story.'}</p>
              )}
            </div>
          </div>
          <PhotoCredit image={identity.image} />
          {identity.description && <p className="prose">{identity.description}</p>}
          <div className="actions">
            <button type="button" className={`button${followed ? ' is-on' : ''}`} onClick={() => toggleFollow(character.id)} aria-pressed={followed}>
              <Route aria-hidden="true" /> {followed ? 'Following the journey' : 'Follow the journey'}
            </button>
            <WikiLink url={identity.wikiUrl} />
          </div>
          {journey.length > 0 && !hasHiddenIdentity(timeline, character, scene.time) && (
            <StillLink url={character.suggestedPicture} label="See the character on the wiki" />
          )}
          {journey.length > 0 && (
            <section>
              <h3>Journey so far</h3>
              <ol className="event-list">
                {journey.map((timed) => (
                  <EventRow key={timed.event.id} timed={timed} showEpisode onPick={(picked) => peekEvent(picked.event.id)} />
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function PlaceView({ place }: { place: Place }) {
  const timeline = useStore((state) => state.timeline)!;
  const flyTo = useStore((state) => state.flyTo);
  const peekEvent = useStore((state) => state.peekEvent);
  const scene = useScene();
  if (!scene) return null;
  const events = eventsAtPlace(timeline, place.id, scene.time);
  const present = scene.characters.filter((entry) => entry.pos[0] === place.pos[0] && entry.pos[1] === place.pos[1]);

  return (
    <>
      <Header />
      <div className="detail__scroll">
        {place.image ? (
          <Picture image={place.image} width={960} alt="" className="picture--hero" credit />
        ) : (
          <MapVignette pos={place.pos} color="#6b5b45">
            <MapPin aria-hidden="true" />
          </MapVignette>
        )}
        <div className="detail__body">
          <p className="eyebrow">{PLACE_KIND[place.kind]}</p>
          <h2>{place.name}</h2>
          <button type="button" className="place-link" onClick={() => flyTo(place.pos)}>
            <LocateFixed aria-hidden="true" /> Show on the map
          </button>
          {place.description && <p className="prose">{place.description}</p>}
          <WikiLink url={place.wikiUrl} />
          {!place.image && <StillLink url={place.suggestedPicture} />}
          {present.length > 0 && (
            <section>
              <h3>Here now</h3>
              <div className="chips">
                {present.map((entry) => (
                  <CharacterChip key={entry.character.id} character={entry.character} time={scene.time} />
                ))}
              </div>
            </section>
          )}
          <section>
            <h3>What has happened here</h3>
            {events.length > 0 ? (
              <ol className="event-list">
                {events.map((timed) => (
                  <EventRow key={timed.event.id} timed={timed} showEpisode onPick={(picked) => peekEvent(picked.event.id)} />
                ))}
              </ol>
            ) : (
              <p className="muted">Nothing yet at this point of the story.</p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/** The side panel: an overview of the current episode, or details of whatever is selected. */
export function DetailPanel() {
  const open = useStore((state) => state.detailOpen);
  const setOpen = useStore((state) => state.setDetailOpen);
  const selection = useStore((state) => state.selection);
  const timeline = useStore((state) => state.timeline);
  const editorOpen = useStore((state) => state.editorTarget !== null);
  if (!timeline) return null;

  if (editorOpen) {
    return (
      <aside className="panel detail detail--editor" data-map-inset="right" aria-label="Editor">
        <EditorPanel />
      </aside>
    );
  }

  if (!open) {
    return (
      <button type="button" className="panel-tab panel-tab--detail" onClick={() => setOpen(true)} aria-label="Show details">
        <BookOpen aria-hidden="true" />
      </button>
    );
  }

  const timed = selection?.kind === 'event' ? timeline.eventById.get(selection.id) : undefined;
  const character = selection?.kind === 'character' ? timeline.characterById.get(selection.id) : undefined;
  const place = selection?.kind === 'place' ? timeline.placeById.get(selection.id) : undefined;

  return (
    <aside className="panel detail" data-map-inset="right" aria-label="Details">
      {timed ? <EventView key={timed.event.id} timed={timed} /> : character ? <CharacterView key={character.id} character={character} /> : place ? <PlaceView key={place.id} place={place} /> : <EpisodeView />}
    </aside>
  );
}
