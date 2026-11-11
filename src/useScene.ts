import { useMemo } from 'react';
import { buildScene } from './scene.ts';
import type { Scene } from './scene.ts';
import { useStore } from './store.ts';

/** The scene for the current state of the app (episode, step, filters). */
export function useScene(): Scene | null {
  const bundle = useStore((state) => state.bundle);
  const timeline = useStore((state) => state.timeline);
  const episodeId = useStore((state) => state.episodeId);
  const stepEventId = useStore((state) => state.stepEventId);
  const hiddenStorylines = useStore((state) => state.hiddenStorylines);
  const followed = useStore((state) => state.followed);
  const showHistory = useStore((state) => state.options.history);
  return useMemo(
    () => (bundle && timeline ? buildScene(bundle, timeline, episodeId, stepEventId, hiddenStorylines, followed, showHistory) : null),
    [bundle, timeline, episodeId, stepEventId, hiddenStorylines, followed, showHistory],
  );
}
