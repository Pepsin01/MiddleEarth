import { Layers, Menu, Search as SearchIcon, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode } from 'react';
import { characterAt, endOfEpisode } from '../../shared/timeline.ts';
import type { Time } from '../../shared/timeline.ts';
import { search } from '../lib/search.ts';
import type { SearchResult } from '../lib/search.ts';
import { useScene } from '../scene.ts';
import { useStore } from '../store.ts';
import { Picture, Portrait } from './Picture.tsx';
import { Popover } from './Popover.tsx';

const KIND_LABEL = { event: 'Event', character: 'Character', place: 'Place' } as const;

function Search({ scope }: { scope: Time }) {
  const bundle = useStore((state) => state.bundle)!;
  const timeline = useStore((state) => state.timeline)!;
  const showEvent = useStore((state) => state.showEvent);
  const select = useStore((state) => state.select);
  const flyTo = useStore((state) => state.flyTo);
  const scene = useScene();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  const results = useMemo(() => search(bundle, timeline, query, scope), [bundle, timeline, query, scope]);
  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!host.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => document.removeEventListener('pointerdown', onPointer, true);
  }, [open]);

  // "/" jumps into the search box from anywhere.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) && !target.isContentEditable) {
        event.preventDefault();
        input.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const choose = (result: SearchResult) => {
    if (result.kind === 'event') {
      showEvent(result.id);
    } else if (result.kind === 'character') {
      select({ kind: 'character', id: result.id });
      const now = scene && characterAt(timeline, result.id, scene.time);
      if (now) flyTo(now.pos);
    } else {
      select({ kind: 'place', id: result.id });
      const place = timeline.placeById.get(result.id);
      if (place) flyTo(place.pos);
    }
    setOpen(false);
    setQuery('');
    input.current?.blur();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault();
      choose(results[active]);
    } else if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
      input.current?.blur();
    }
  };

  return (
    <div className="search" ref={host}>
      <div className="panel search__box">
        <SearchIcon aria-hidden="true" />
        <input
          ref={input}
          type="search"
          value={query}
          placeholder="Search events, characters, places"
          aria-label="Search events, characters and places"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls="search-results"
          aria-autocomplete="list"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button type="button" className="icon-button icon-button--small" onClick={() => setQuery('')} aria-label="Clear the search">
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      {open && query.trim().length >= 2 && (
        <ul className="panel search__results" id="search-results" role="listbox">
          {results.length === 0 && <li className="muted search__empty">Nothing found.</li>}
          {results.map((result, index) => (
            <li key={`${result.kind}:${result.id}`} role="option" aria-selected={index === active}>
              <button type="button" className={`result${index === active ? ' is-active' : ''}`} onClick={() => choose(result)} onPointerEnter={() => setActive(index)}>
                {result.kind === 'character' ? (
                  <Portrait image={result.image} name={result.title} size={36} color={result.color} />
                ) : (
                  <span className="result__thumb" style={{ '--c': result.color } as CSSProperties}>
                    <Picture image={result.image} width={96} alt="" />
                  </span>
                )}
                <span className="result__text">
                  <strong>{result.title}</strong>
                  <small>
                    {KIND_LABEL[result.kind]}
                    {result.subtitle && result.kind !== 'place' ? ` · ${result.subtitle}` : ''}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ViewOptions({ children }: { children?: ReactNode }) {
  const options = useStore((state) => state.options);
  const setOption = useStore((state) => state.setOption);
  const hasTint = useStore((state) => Boolean(state.bundle?.map.tint));
  return (
    <Popover label="What the map shows" icon={<Layers aria-hidden="true" />}>
      <h3>On the map</h3>
      <label className="check">
        <input type="checkbox" checked={options.history} onChange={(event) => setOption('history', event.target.checked)} />
        Earlier events, as faded dots
      </label>
      <label className="check">
        <input type="checkbox" checked={options.places} onChange={(event) => setOption('places', event.target.checked)} />
        All named places
      </label>
      {children}
      {hasTint && (
        <label className="check">
          <input type="checkbox" checked={options.tint} onChange={(event) => setOption('tint', event.target.checked)} />
          Old-paper tint
        </label>
      )}
    </Popover>
  );
}

interface Props {
  /** How far into the story the search may look. Defaults to everything. */
  searchScope?: Time;
  /** Extra entries for the "What the map shows" menu. */
  viewOptions?: ReactNode;
  /** Extra toolbar buttons. */
  tools?: ReactNode;
}

export function TopBar({ searchScope, viewOptions, tools }: Props) {
  const bundle = useStore((state) => state.bundle);
  const timeline = useStore((state) => state.timeline);
  const sagas = useStore((state) => state.sagas);
  const openSaga = useStore((state) => state.openSaga);
  const legendOpen = useStore((state) => state.legendOpen);
  const setLegendOpen = useStore((state) => state.setLegendOpen);
  if (!bundle || !timeline) return null;
  const everything = endOfEpisode(Math.max(0, timeline.episodes.length - 1));

  return (
    <header className="topbar" data-map-inset="top">
      <div className="panel brand">
        <button
          type="button"
          className={`icon-button${legendOpen ? ' is-on' : ''}`}
          onClick={() => setLegendOpen(!legendOpen)}
          aria-label="Storylines and characters"
          title="Storylines and characters"
          aria-pressed={legendOpen}
        >
          <Menu aria-hidden="true" />
        </button>
        <div className="brand__text">
          {sagas.length > 1 ? (
            <select value={bundle.saga.id} onChange={(event) => void openSaga(event.target.value)} aria-label="Saga">
              {sagas.map((saga) => (
                <option key={saga.id} value={saga.id}>
                  {saga.title}
                </option>
              ))}
            </select>
          ) : (
            <strong>{bundle.saga.title}</strong>
          )}
          <small>{bundle.saga.subtitle ?? 'Middle-earth Chronicle'}</small>
        </div>
      </div>
      <Search scope={searchScope ?? everything} />
      <div className="panel toolbar">
        <ViewOptions>{viewOptions}</ViewOptions>
        {tools}
      </div>
    </header>
  );
}
