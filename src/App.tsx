import { useEffect } from 'react';
import { DetailPanel } from './components/DetailPanel.tsx';
import { Legend } from './components/Legend.tsx';
import { PlayButton, usePlayer } from './components/Player.tsx';
import { SpoilerGuard, SpoilerQuestion } from './components/SpoilerGuard.tsx';
import { ChartButton, StorylineChart } from './components/StorylineChart.tsx';
import { Timeline } from './components/Timeline.tsx';
import { TopBar } from './components/TopBar.tsx';
import { EditTools } from './editor/EditTools.tsx';
import { PickLayer } from './editor/PickLayer.tsx';
import { MapControls } from './map/MapControls.tsx';
import { MapView } from './map/MapView.tsx';
import { SceneLayers } from './map/SceneLayers.tsx';
import { useStore } from './store.ts';

/** Keyboard: arrows move through episodes, Shift+arrows through single events, Escape goes back to the overview. */
function useKeyboard() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const { step, stepEpisode, select, selection, playing, setPlaying } = useStore.getState();
      if (event.key === ' ' && target.tagName !== 'BUTTON' && target.tagName !== 'A') {
        event.preventDefault();
        setPlaying(!playing);
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        const delta = event.key === 'ArrowRight' ? 1 : -1;
        if (event.shiftKey) {
          step(delta);
        } else {
          setPlaying(false);
          stepEpisode(delta);
        }
      } else if (event.key === 'Escape' && selection && !useStore.getState().editorTarget) {
        select(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function App() {
  const status = useStore((state) => state.status);
  const error = useStore((state) => state.error);
  const bundle = useStore((state) => state.bundle);
  const init = useStore((state) => state.init);

  useEffect(() => {
    void init();
  }, [init]);
  useKeyboard();
  usePlayer();

  if (status === 'error') {
    return (
      <main className="boot">
        <h1>Middle-earth Chronicle</h1>
        <p className="boot__error">{error}</p>
        <button className="button" onClick={() => void init()}>
          Try again
        </button>
      </main>
    );
  }

  if (!bundle) {
    return (
      <main className="boot">
        <h1>Middle-earth Chronicle</h1>
        <p>{status === 'loading' ? 'Unrolling the map…' : 'There is no story data yet. Add a saga to the data folder (see docs/GUIDE.md).'}</p>
      </main>
    );
  }

  return (
    <div className="app">
      <MapView key={`${bundle.map.id}:${bundle.map.tiles.path}:${bundle.map.width}`} mapDef={bundle.map} initialView={bundle.saga.view}>
        <SceneLayers />
        <PickLayer />
        <MapControls />
      </MapView>
      <TopBar
        tools={
          <>
            <ChartButton />
            <SpoilerGuard />
            <EditTools />
          </>
        }
      />
      <Legend />
      <DetailPanel />
      <Timeline controls={<PlayButton />} />
      <StorylineChart />
      <SpoilerQuestion />
      <a className="map-credit" href={bundle.map.creditUrl} target="_blank" rel="noreferrer">
        {bundle.map.credit}
      </a>
    </div>
  );
}
