import type L from 'leaflet';
import { createContext, useContext } from 'react';
import type { Point } from '../../shared/schema.ts';

/** What map layers need: the Leaflet map and converters between data positions (picture pixels) and Leaflet coordinates. */
export interface MapApi {
  map: L.Map;
  maxZoom: number;
  toLatLng: (point: Point) => L.LatLng;
  toPoint: (latLng: L.LatLng) => Point;
  /** Shows the whole map in the area not covered by panels. */
  fitAll: () => void;
}

export const MapContext = createContext<MapApi | null>(null);

export function useMap(): MapApi {
  const api = useContext(MapContext);
  if (!api) throw new Error('useMap must be used inside <MapView>');
  return api;
}
