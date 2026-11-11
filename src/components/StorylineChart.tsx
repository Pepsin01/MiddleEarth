import { ChartGantt, X } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { storylineColor } from '../scene.ts';
import { useStore, watchedIndex } from '../store.ts';

const COLUMN = 58;
const ROW = 34;
const HEAD = 34;
const LABELS = 236;
const SEASON_GAP = 14;

/** Toolbar button that opens and closes the chart. */
export function ChartButton() {
  const open = useStore((state) => state.chartOpen);
  const setOpen = useStore((state) => state.setChartOpen);
  return (
    <button type="button" className={`icon-button${open ? ' is-on' : ''}`} onClick={() => setOpen(!open)} aria-pressed={open} aria-label="Storyline chart" title="Storyline chart">
      <ChartGantt aria-hidden="true" />
    </button>
  );
}

/**
 * The story at a glance: one lane per storyline, one column per episode, a dot
 * per event. The journeys of followed characters (and of the selected one) are
 * drawn as lines weaving between the lanes. Clicking a dot goes there on the map.
 */
export function StorylineChart() {
  const open = useStore((state) => state.chartOpen);
  const setOpen = useStore((state) => state.setChartOpen);
  const bundle = useStore((state) => state.bundle);
  const timeline = useStore((state) => state.timeline);
  const episodeId = useStore((state) => state.episodeId);
  const selection = useStore((state) => state.selection);
  const followed = useStore((state) => state.followed);
  const hidden = useStore((state) => state.hiddenStorylines);
  const showEvent = useStore((state) => state.showEvent);
  const setEpisode = useStore((state) => state.setEpisode);
  const limit = useStore(watchedIndex);
  const scroller = useRef<HTMLDivElement>(null);

  const layout = useMemo(() => {
    if (!bundle || !timeline) return null;
    const storylines = bundle.saga.storylines.filter((storyline) => !hidden.includes(storyline.id));
    const rowOf = new Map(storylines.map((storyline, index) => [storyline.id, index]));
    // x of every episode column; seasons are set a little apart
    const columnX: number[] = [];
    let x = LABELS;
    timeline.episodes.forEach((ref, index) => {
      if (index > 0 && ref.seasonIndex !== timeline.episodes[index - 1].seasonIndex) x += SEASON_GAP;
      columnX.push(x);
      x += COLUMN;
    });
    const width = x + 12;
    const height = HEAD + storylines.length * ROW + 10;

    const dots = new Map<string, { x: number; y: number }>();
    for (const ref of timeline.episodes) {
      if (ref.index > limit) continue;
      const events = timeline.eventsByEpisode.get(ref.id) ?? [];
      events.forEach((timed, order) => {
        const row = rowOf.get(timed.event.storylineId);
        if (row === undefined) return;
        dots.set(timed.event.id, {
          x: columnX[ref.index] + ((order + 1) / (events.length + 1)) * COLUMN,
          y: HEAD + row * ROW + ROW / 2,
        });
      });
    }
    return { storylines, columnX, width, height, dots };
  }, [bundle, timeline, hidden, limit]);

  // Bring the current episode into view when the chart opens or the slider moves.
  useEffect(() => {
    if (!open || !layout || !timeline || !scroller.current) return;
    const index = timeline.episodeById.get(episodeId)?.index ?? 0;
    const target = layout.columnX[index] - scroller.current.clientWidth / 2 + COLUMN / 2;
    scroller.current.scrollTo({ left: Math.max(0, target), behavior: 'smooth' });
  }, [open, episodeId, layout, timeline]);

  if (!open || !bundle || !timeline || !layout) return null;
  const { storylines, columnX, width, height, dots } = layout;
  const selectedEvent = selection?.kind === 'event' ? selection.id : null;
  const traced = [...new Set([...followed, ...(selection?.kind === 'character' ? [selection.id] : [])])];

  return (
    <section className="panel chart" data-map-inset="bottom" aria-label="Storyline chart">
      <header className="chart__header">
        <h3>Storylines through the episodes</h3>
        <span className="muted">{traced.length ? 'Lines show the journeys of the characters you follow.' : 'Follow a character to see their path through the storylines.'}</span>
        <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close the chart">
          <X aria-hidden="true" />
        </button>
      </header>
      <div className="chart__scroll" ref={scroller}>
        <svg width={width} height={height} role="img" aria-label="Events per storyline and episode">
          {/* episode columns */}
          {timeline.episodes.map((ref) => {
            const locked = ref.index > limit;
            return (
              <g key={ref.id} className={`chart__column${ref.id === episodeId ? ' is-current' : ''}${locked ? ' is-locked' : ''}`} onClick={() => !locked && setEpisode(ref.id)}>
                <rect x={columnX[ref.index]} y={0} width={COLUMN} height={height} />
                <text x={columnX[ref.index] + COLUMN / 2} y={21} textAnchor="middle">
                  {ref.code}
                </text>
                <title>{locked ? `${ref.code} · not watched yet` : `${ref.code} · ${ref.episode.title}`}</title>
              </g>
            );
          })}

          {/* storyline lanes */}
          {storylines.map((storyline, row) => (
            <g key={storyline.id}>
              <line className="chart__lane" x1={LABELS} x2={width - 12} y1={HEAD + row * ROW + ROW / 2} y2={HEAD + row * ROW + ROW / 2} stroke={storyline.color} />
              <circle cx={12} cy={HEAD + row * ROW + ROW / 2} r={5} fill={storyline.color} />
              <text className="chart__label" x={24} y={HEAD + row * ROW + ROW / 2 + 5}>
                {storyline.title}
              </text>
            </g>
          ))}

          {/* journeys of followed characters */}
          {traced.map((characterId) => {
            const character = timeline.characterById.get(characterId);
            if (!character) return null;
            const points = (timeline.tracks.get(characterId) ?? []).map((stop) => dots.get(stop.at.event.id)).filter((point): point is { x: number; y: number } => point !== undefined);
            if (points.length < 2) return null;
            return (
              <polyline
                key={characterId}
                className="chart__journey"
                points={points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')}
                stroke={storylineColor(bundle, character.storylineId)}
              >
                <title>{character.name}</title>
              </polyline>
            );
          })}

          {/* events */}
          {timeline.events.map((timed) => {
            const dot = dots.get(timed.event.id);
            if (!dot) return null;
            const radius = timed.event.importance === 'major' ? 6 : timed.event.importance === 'minor' ? 4.5 : 3;
            return (
              <circle
                key={timed.event.id}
                className={`chart__dot${timed.event.id === selectedEvent ? ' is-selected' : ''}${timed.event.flashback ? ' is-flashback' : ''}`}
                cx={dot.x}
                cy={dot.y}
                r={radius}
                fill={storylineColor(bundle, timed.event.storylineId)}
                tabIndex={0}
                role="button"
                aria-label={`${timed.episode.code}: ${timed.event.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  showEvent(timed.event.id);
                }}
                onKeyDown={(event) => event.key === 'Enter' && showEvent(timed.event.id)}
              >
                <title>{`${timed.episode.code} · ${timed.event.title}`}</title>
              </circle>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
