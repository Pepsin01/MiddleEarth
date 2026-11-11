import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ImageRef } from '../../shared/schema.ts';
import { focusPosition, imageUrl } from '../lib/media.ts';
import type { ThumbWidth } from '../lib/media.ts';

interface PictureProps {
  image: ImageRef | undefined;
  width: ThumbWidth;
  alt: string;
  className?: string;
  /** Show the picture's credit line underneath. */
  credit?: boolean;
}

/** A rectangular picture (event, place, episode). Renders nothing when there is no picture or it fails to load. */
export function Picture({ image, width, alt, className = '', credit = false }: PictureProps) {
  const url = imageUrl(image, width);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  if (!url || failed) return null;
  return (
    <figure className={`picture ${className}`}>
      <img
        src={url}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        style={{ objectPosition: focusPosition(image, '50% 30%') }}
        onError={() => setFailed(true)}
      />
      {credit && image?.credit && (
        <figcaption>
          {image.page ? (
            <a href={image.page} target="_blank" rel="noreferrer">
              {image.credit}
            </a>
          ) : (
            image.credit
          )}
        </figcaption>
      )}
    </figure>
  );
}

interface PortraitProps {
  image: ImageRef | undefined;
  name: string;
  /** Diameter in pixels. */
  size: number;
  /** Colour of the ring around the portrait (the character's storyline). */
  color?: string;
  className?: string;
}

/** A round portrait. Without a picture (or if it fails to load) the initials are shown instead. */
export function Portrait({ image, name, size, color, className = '' }: PortraitProps) {
  const url = imageUrl(image, size > 96 ? 480 : size > 48 ? 192 : 96);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]);
  const initials = name
    .replace(/^(The|the)\s+/, '')
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  const style = { width: size, height: size, '--ring': color ?? 'var(--edge)', fontSize: Math.round(size * 0.38) } as CSSProperties;
  return (
    <span className={`portrait ${className}`} style={style}>
      {url && !failed ? (
        <img
          src={url}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          draggable={false}
          style={{ objectPosition: focusPosition(image) }}
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </span>
  );
}
