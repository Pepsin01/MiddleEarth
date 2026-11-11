import { Pause, Play } from 'lucide-react';
import { useEffect } from 'react';
import { PLAY_SECONDS, useStore } from '../store.ts';

/** While Play is on, moves the story one event forward every few seconds and stops at the end. */
export function usePlayer() {
  const playing = useStore((state) => state.playing);
  const speed = useStore((state) => state.options.speed);
  const stepEventId = useStore((state) => state.stepEventId);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(() => {
      const { step, setPlaying } = useStore.getState();
      if (!step(1)) setPlaying(false);
    }, PLAY_SECONDS[speed] * 1000);
    return () => window.clearTimeout(timer);
    // stepEventId restarts the countdown after every step, including steps made by hand
  }, [playing, speed, stepEventId]);
}

export function PlayButton() {
  const playing = useStore((state) => state.playing);
  const setPlaying = useStore((state) => state.setPlaying);
  const label = playing ? 'Pause' : 'Play the story event by event';
  return (
    <button type="button" className={`icon-button play-button${playing ? ' is-on' : ''}`} onClick={() => setPlaying(!playing)} aria-label={label} title={`${label} (Space)`} aria-pressed={playing}>
      {playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
    </button>
  );
}
