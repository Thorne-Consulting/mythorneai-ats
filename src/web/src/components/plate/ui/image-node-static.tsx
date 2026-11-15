import * as React from 'react';

import type { TElement } from 'platejs';
import type { SlateElementProps } from 'platejs/static';

import { BaseImagePlugin } from '@platejs/media';
import { SlateElement } from 'platejs/static';

/**
 * A picture as Markdown stores it: `![description](/public/media/abc.png?size=800x600)`. The
 * description lives in `caption` (Plate's Markdown rule); the size rides in the address.
 */
export type ImageNode = TElement & {
  url?: string;
  caption?: { text: string }[];
  /** Set while the file uploads; `url` is then a local preview. */
  uploading?: boolean;
  uploadId?: string;
};

export const imageAlt = (element: ImageNode) =>
  (element.caption ?? []).map((part) => part.text).join('');

/** The width and height saved in the address, so the space is kept before the picture loads. */
export function imageSize(url = ''): { width?: number; height?: number } {
  const query = url.split('?')[1];
  if (!query) return {};
  const [width, height] = (new URLSearchParams(query.split('#')[0]).get('size') ?? '')
    .split('x')
    .map(Number);
  return width > 0 && height > 0 ? { width, height } : {};
}

/** Our own uploads, web addresses and local previews. Anything else (javascript:, data:) shows nothing. */
export const safeImageUrl = (url = '') => /^(\/(?!\/)|https?:\/\/|blob:)/i.test(url);

export const imageClass = 'block h-auto max-w-full rounded-md';

export function ImageElementStatic(props: SlateElementProps<ImageNode>) {
  const { url } = props.element;
  return (
    <SlateElement {...props} className="my-4">
      {safeImageUrl(url) && (
        // eslint-disable-next-line @next/next/no-img-element -- Markdown content, any size, any host.
        <img
          src={url}
          alt={imageAlt(props.element)}
          {...imageSize(url)}
          loading="lazy"
          decoding="async"
          className={imageClass}
        />
      )}
      {props.children}
    </SlateElement>
  );
}

export const BaseImageKit = [BaseImagePlugin.withComponent(ImageElementStatic)];
