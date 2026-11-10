import { useEffect } from 'react';
import { MapView } from './map/MapView.tsx';
import { useStore } from './store.ts';

export function App() {
  const status = useStore((state) => state.status);
  const error = useStore((state) => state.error);
  const bundle = useStore((state) => state.bundle);
  const init = useStore((state) => state.init);

  useEffect(() => {
    void init();
  }, [init]);

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
      <MapView mapDef={bundle.map} initialView={bundle.saga.view} />
      <a className="map-credit" href={bundle.map.creditUrl} target="_blank" rel="noreferrer">
        {bundle.map.credit}
      </a>
    </div>
  );
}
