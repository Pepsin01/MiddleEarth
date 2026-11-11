import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store.ts';
import { Popover } from './Popover.tsx';

function EpisodeSelect({ value, onChange }: { value: string; onChange: (episodeId: string) => void }) {
  const timeline = useStore((state) => state.timeline)!;
  const limit = useStore((state) => (state.watched ? (state.timeline?.episodeById.get(state.watched)?.index ?? -1) : -1));
  return (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Last episode watched">
      {timeline.episodes.map((ref) => (
        // Titles of episodes that are still locked are not shown: they can be spoilers.
        <option key={ref.id} value={ref.id}>
          {ref.index <= limit || limit < 0 ? `${ref.code} · ${ref.episode.title}` : ref.code}
        </option>
      ))}
    </select>
  );
}

/** Toolbar button for the spoiler guard: how far have you watched? */
export function SpoilerGuard() {
  const timeline = useStore((state) => state.timeline);
  const watched = useStore((state) => state.watched);
  const episodeId = useStore((state) => state.episodeId);
  const setWatched = useStore((state) => state.setWatched);
  if (!timeline) return null;
  const code = watched ? timeline.episodeById.get(watched)?.code : undefined;

  return (
    <Popover label="Spoiler guard" icon={watched ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />} text={code ? `to ${code}` : undefined} active={Boolean(watched)}>
      <h3>Spoiler guard</h3>
      <label className="check">
        <input type="checkbox" checked={Boolean(watched)} onChange={(event) => setWatched(event.target.checked ? episodeId : null)} />
        Hide everything after the last episode I watched
      </label>
      {watched && (
        <label className="field-row">
          Watched up to
          <EpisodeSelect value={watched} onChange={setWatched} />
        </label>
      )}
      <p className="muted">{watched ? 'Later episodes are locked on the time slider. Wiki pages can still contain spoilers.' : 'Everything is shown.'}</p>
    </Popover>
  );
}

/** Asked once per saga, before anything can be given away. */
export function SpoilerQuestion() {
  const timeline = useStore((state) => state.timeline);
  const answered = useStore((state) => state.watchedAnswered);
  const setWatched = useStore((state) => state.setWatched);
  const title = useStore((state) => state.bundle?.saga.title);
  const [choice, setChoice] = useState('');
  if (!timeline || answered || timeline.episodes.length === 0) return null;
  const first = timeline.episodes[0].id;

  return (
    <div className="dialog-backdrop">
      <div className="panel dialog" role="dialog" aria-modal="true" aria-label="How far have you watched?">
        <h2>How far have you watched?</h2>
        <p>This map can hide everything that happens after the last episode of {title} you have seen, so nothing is spoiled. You can change this any time with the eye button.</p>
        <label className="field-row">
          I have watched up to
          <select value={choice || first} onChange={(event) => setChoice(event.target.value)} aria-label="Last episode watched">
            {timeline.episodes.map((ref) => (
              <option key={ref.id} value={ref.id}>
                {ref.code}
              </option>
            ))}
          </select>
        </label>
        <div className="form__buttons">
          <button type="button" className="button button--primary" onClick={() => setWatched(choice || first)}>
            Hide the rest
          </button>
          <button type="button" className="button" onClick={() => setWatched(null)}>
            I have seen it all — show everything
          </button>
        </div>
      </div>
    </div>
  );
}
