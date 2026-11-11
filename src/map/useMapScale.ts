import { useEffect, useState } from 'react';
import { useMap } from './MapContext.ts';

/** Screen pixels per map-picture pixel at the current zoom (updated when a zoom finishes). */
export function useMapScale(): number {
  const { map, maxZoom } = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useEffect(() => {
    const update = () => setZoom(map.getZoom());
    map.on('zoomend', update);
    return () => {
      map.off('zoomend', update);
    };
  }, [map]);
  return 2 ** (zoom - maxZoom);
}
