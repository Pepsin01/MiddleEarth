import { Focus, X } from 'lucide-react';
import { useMemo } from 'react';
import { useScene } from '../scene.ts';
import type { SceneCharacter } from '../scene.ts';
import { useStore } from '../store.ts';
import { Portrait } from './Picture.tsx';

/** The storylines (click to show or hide) and the characters who are on the map right now. */
export function Legend() {
  const bundle = useStore((state) => state.bundle);
  const timeline = useStore((state) => state.timeline);
  const open = useStore((state) => state.legendOpen);
  const setOpen = useStore((state) => state.setLegendOpen);
  const episodeId = useStore((state) => state.episodeId);
  const hidden = useStore((state) => state.hiddenStorylines);
  const toggle = useStore((state) => state.toggleStoryline);
  const solo = useStore((state) => state.soloStoryline);
  const select = useStore((state) => state.select);
  const flyTo = useStore((state) => state.flyTo);
  const selection = useStore((state) => state.selection);
  const scene = useScene();

  const groups = useMemo(() => {
    const byGroup = new Map<string, SceneCharacter[]>();
    for (const entry of scene?.characters ?? []) {
      const name = entry.character.group ?? 'Others';
      byGroup.set(name, [...(byGroup.get(name) ?? []), entry]);
    }
    return [...byGroup.entries()];
  }, [scene]);

  if (!bundle || !timeline || !open) return null;
  const inEpisode = timeline.eventsByEpisode.get(episodeId) ?? [];

  return (
    <aside className="panel legend" data-map-inset="left" aria-label="Storylines and characters">
      <header className="legend__header">
        <h3>Storylines</h3>
        <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Hide this panel">
          <X aria-hidden="true" />
        </button>
      </header>
      <ul className="storylines">
        {bundle.saga.storylines.map((storyline) => {
          const off = hidden.includes(storyline.id);
          const count = inEpisode.filter((timed) => timed.event.storylineId === storyline.id).length;
          return (
            <li key={storyline.id} className={off ? 'is-off' : ''}>
              <button type="button" className="storyline" onClick={() => toggle(storyline.id)} aria-pressed={!off} title={off ? 'Show this storyline' : 'Hide this storyline'}>
                <span className="swatch" style={{ background: storyline.color }} />
                <span className="storyline__title">{storyline.title}</span>
                {count > 0 && <span className="count">{count}</span>}
              </button>
              <button type="button" className="icon-button icon-button--small" onClick={() => solo(storyline.id)} aria-label={`Show only ${storyline.title}`} title="Show only this storyline">
                <Focus aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      <h3>On the map now</h3>
      {groups.length === 0 && <p className="muted">Nobody yet.</p>}
      {groups.map(([name, members]) => (
        <section key={name} className="legend__group">
          <h4>{name}</h4>
          <div className="chips">
            {members.map(({ character, identity, pos, color }) => (
              <button
                key={character.id}
                type="button"
                className={`chip${selection?.kind === 'character' && selection.id === character.id ? ' is-selected' : ''}`}
                onClick={() => {
                  select({ kind: 'character', id: character.id });
                  flyTo(pos);
                }}
              >
                <Portrait image={identity.image} name={identity.name} size={28} color={color} />
                {identity.name}
              </button>
            ))}
          </div>
        </section>
      ))}
    </aside>
  );
}
