import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import type { Point } from '../../shared/schema.ts';
import { useStore } from '../store.ts';

interface Props {
  /** The spot to show, in map-picture pixels. */
  pos: Point;
  /** Colour of the marker in the middle. */
  color: string;
  /** Symbol inside the marker. */
  children?: ReactNode;
}

/**
 * A small excerpt of the map around one spot. It is the picture shown for
 * events and places that have no picture of their own, so nothing is ever
 * left without an illustration.
 */
export function MapVignette({ pos, color, children }: Props) {
  const mapDef = useStore((state) => state.bundle!.map);
  const tinted = useStore((state) => state.options.tint);
  const host = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(384);

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const measure = () => setWidth(Math.max(120, Math.round(element.clientWidth)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // flatter on narrow screens, where the panel is short
  const height = Math.round(width * (width < 420 ? 0.4 : 9 / 16));
  const tiles = useMemo(() => {
    const { size, maxZoom, path, ext } = mapDef.tiles;
    const zoom = Math.max(0, maxZoom - 2); // a quarter of full size: enough to recognise the surroundings
    const scale = 2 ** (zoom - maxZoom);
    const left = pos[0] * scale - width / 2;
    const top = pos[1] * scale - height / 2;
    const lastColumn = Math.ceil((mapDef.width * scale) / size) - 1;
    const lastRow = Math.ceil((mapDef.height * scale) / size) - 1;
    const list: Array<{ key: string; src: string; style: CSSProperties }> = [];
    for (let row = Math.max(0, Math.floor(top / size)); row <= Math.min(lastRow, Math.floor((top + height) / size)); row++) {
      for (let column = Math.max(0, Math.floor(left / size)); column <= Math.min(lastColumn, Math.floor((left + width) / size)); column++) {
        list.push({
          key: `${row}/${column}`,
          src: `/media/${path}/${zoom}/${row}/${column}.${ext}`,
          style: { left: Math.round(column * size - left), top: Math.round(row * size - top), width: size, height: size },
        });
      }
    }
    return list;
  }, [mapDef, pos, width, height]);

  const paper = tinted && mapDef.tint ? mapDef.tint : '#ffffff';
  return (
    <div
      ref={host}
      className={`vignette${tinted && mapDef.tint ? ' vignette--tinted' : ''}`}
      style={{ height, background: paper, '--c': color } as CSSProperties}
      role="img"
      aria-label="Map excerpt of the surroundings"
    >
      {tiles.map((tile) => (
        <img key={tile.key} src={tile.src} style={tile.style} alt="" draggable={false} />
      ))}
      <span className="vignette__pin">{children}</span>
    </div>
  );
}
