import { Maximize, Minus, Plus } from 'lucide-react';
import { useMap } from './MapContext.ts';

/** Zoom buttons, for those who do not use a mouse wheel or pinch gesture. */
export function MapControls() {
  const { map, fitAll } = useMap();
  return (
    <div className="panel map-controls">
      <button type="button" className="icon-button" onClick={() => map.zoomIn()} aria-label="Zoom in" title="Zoom in">
        <Plus aria-hidden="true" />
      </button>
      <button type="button" className="icon-button" onClick={() => map.zoomOut()} aria-label="Zoom out" title="Zoom out">
        <Minus aria-hidden="true" />
      </button>
      <button type="button" className="icon-button" onClick={fitAll} aria-label="Show the whole map" title="Show the whole map">
        <Maximize aria-hidden="true" />
      </button>
    </div>
  );
}
