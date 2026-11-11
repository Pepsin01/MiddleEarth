import type { ImageRef } from '../../shared/schema.ts';

/** Widths the server can shrink pictures to (see THUMB_WIDTHS in server/media.ts). */
export type ThumbWidth = 96 | 192 | 480 | 960 | 1600;

/**
 * Address of a picture at roughly the given width: a local copy (uploaded or
 * downloaded) is shrunk by our own server; a picture that only has a web
 * address is loaded from there as it is.
 */
export function imageUrl(image: ImageRef | undefined, width: ThumbWidth): string | undefined {
  if (!image) return undefined;
  if (image.file) return `/thumb/${width}/${image.file.split('/').map(encodeURIComponent).join('/')}`;
  return image.source;
}

/** CSS object-position that keeps the picture's point of interest in view when it is cropped. */
export function focusPosition(image: ImageRef | undefined, fallback = '50% 22%'): string {
  if (!image?.focus) return fallback;
  return `${Math.round(image.focus[0] * 100)}% ${Math.round(image.focus[1] * 100)}%`;
}
