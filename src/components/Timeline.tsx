import { ChevronLeft, ChevronRight, SkipBack, SkipForward } from 'lucide-react';
import { useMemo, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react';
import type { EpisodeRef } from '../../shared/timeline.ts';
import { formatDate } from '../lib/format.ts';
import { useStore } from '../store.ts';

interface Props {
  /** Extra controls placed next to the step buttons (the Play button). */
  controls?: ReactNode;
}

/** The time slider: one tick per episode, grouped by season. */
export function Timeline({ controls }: Props) {
  const bundle = useStore((state) => state.bundle);
  const timeline = useStore((state) => state.timeline);
  const episodeId = useStore((state) => state.episodeId);
  const stepEventId = useStore((state) => state.stepEventId);
  const setEpisode = useStore((state) => state.setEpisode);
  const stepEpisode = useStore((state) => state.stepEpisode);
  const step = useStore((state) => state.step);
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  /** Which storylines appear in each episode: drawn as small coloured dots under the tick. */
  const colours = useMemo(() => {
    const map = new Map<string, string[]>();
    if (!bundle || !timeline) return map;
    for (const ref of timeline.episodes) {
      const present = new Set((timeline.eventsByEpisode.get(ref.id) ?? []).map((timed) => timed.event.storylineId));
      map.set(ref.id, bundle.saga.storylines.filter((storyline) => present.has(storyline.id)).map((storyline) => storyline.color));
    }
    return map;
  }, [bundle, timeline]);

  if (!bundle || !timeline) return null;
  const current = timeline.episodeById.get(episodeId);
  const seasons = bundle.saga.seasons.map((season) => ({ season, episodes: timeline.episodes.filter((ref) => ref.season.id === season.id) }));

  const stepping = stepEventId ? timeline.eventById.get(stepEventId) : undefined;
  const inEpisode = timeline.eventsByEpisode.get(episodeId) ?? [];

  /** Picks the episode whose tick is nearest to a horizontal screen position (used while dragging along the slider). */
  const pickAt = (clientX: number) => {
    let best: { id: string; distance: number } | null = null;
    track.current?.querySelectorAll<HTMLElement>('[data-episode]').forEach((tick) => {
      const box = tick.getBoundingClientRect();
      const distance = Math.abs(box.left + box.width / 2 - clientX);
      if (!best || distance < best.distance) best = { id: tick.dataset.episode!, distance };
    });
    const found = best as { id: string; distance: number } | null;
    if (found && found.id !== useStore.getState().episodeId) setEpisode(found.id);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragging.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    pickAt(event.clientX);
  };

  const tick = (ref: EpisodeRef) => {
    const selected = ref.id === episodeId;
    const classes = ['tick'];
    if (selected) classes.push('is-current');
    if (current && ref.index < current.index) classes.push('is-past');
    if ((colours.get(ref.id) ?? []).length === 0) classes.push('is-empty');
    return (
      <button
        key={ref.id}
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={`${ref.code}: ${ref.episode.title}`}
        title={`${ref.code} · ${ref.episode.title}`}
        className={classes.join(' ')}
        data-episode={ref.id}
        tabIndex={selected ? 0 : -1}
        onClick={() => setEpisode(ref.id)}
      >
        <span className="tick__number">{ref.number}</span>
        <span className="tick__dots" aria-hidden="true">
          {(colours.get(ref.id) ?? []).map((colour) => (
            <i key={colour} style={{ background: colour }} />
          ))}
        </span>
      </button>
    );
  };

  return (
    <div className="panel timeline" data-map-inset="bottom">
      <div className="timeline__now">
        <div className="timeline__controls">
          <button type="button" className="icon-button" onClick={() => step(-1)} aria-label="Previous event" title="Previous event">
            <SkipBack aria-hidden="true" />
          </button>
          {controls}
          <button type="button" className="icon-button" onClick={() => step(1)} aria-label="Next event" title="Next event">
            <SkipForward aria-hidden="true" />
          </button>
        </div>
        <div className="timeline__title" aria-live="polite">
          {current && (
            <>
              <strong>{current.code}</strong>
              <span className="timeline__name">{current.episode.title}</span>
              {stepping ? (
                <em>
                  event {stepping.time.ord + 1} of {inEpisode.length}
                </em>
              ) : (
                current.episode.airDate && <em className="timeline__date">{formatDate(current.episode.airDate)}</em>
              )}
            </>
          )}
        </div>
        <div className="timeline__controls">
          <button type="button" className="icon-button" onClick={() => stepEpisode(-1)} aria-label="Previous episode" title="Previous episode">
            <ChevronLeft aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={() => stepEpisode(1)} aria-label="Next episode" title="Next episode">
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>

      <div
        className="timeline__track"
        ref={track}
        role="radiogroup"
        aria-label="Episode"
        onPointerDown={onPointerDown}
        onPointerMove={(event) => dragging.current && pickAt(event.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {seasons.map(({ season, episodes }) => (
          <div className="season" key={season.id} style={{ flexGrow: Math.max(1, episodes.length) }}>
            <span className="season__label">{season.title}</span>
            <div className="season__ticks">{episodes.map(tick)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
