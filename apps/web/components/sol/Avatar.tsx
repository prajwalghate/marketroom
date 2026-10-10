'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * A logo, or the name's initials when there is none or it fails to load.
 *
 * Logos come from third-party CDNs and some 404; a broken-image glyph in a
 * table row reads as a broken product. The initials are always rendered
 * underneath, so a failed image leaves a clean mark rather than a hole.
 *
 * Many Solana token logos live on IPFS, and the busiest public gateway
 * answers rate-limited readers with 429s. An IPFS logo that fails is tried on
 * other public gateways before falling back to the initials.
 */

const IPFS_GATEWAYS = ['https://ipfs.filebase.io/ipfs/', 'https://4everland.io/ipfs/'];

/** The URLs to try for a logo, in order. */
export function logoCandidates(src: string): string[] {
  const path =
    /^ipfs:\/\/(?:ipfs\/)?(.+)$/i.exec(src)?.[1] ??
    /^https?:\/\/[^/]+\/ipfs\/(.+)$/i.exec(src)?.[1] ??
    (() => {
      const sub = /^https?:\/\/([a-z0-9]+)\.ipfs\.[^/]+\/?(.*)$/i.exec(src);
      return sub ? `${sub[1]}${sub[2] ? `/${sub[2]}` : ''}` : null;
    })();
  if (!path) return [src];
  const alternatives = IPFS_GATEWAYS.map((g) => g + path);
  // An ipfs:// URL cannot be loaded by a browser at all; start with a gateway.
  return src.startsWith('ipfs:') ? alternatives : [src, ...alternatives.filter((a) => a !== src)];
}

export function Avatar({
  src,
  name,
  size = 24,
  shape = 'round',
}: {
  src: string | null;
  name: string;
  size?: number;
  /** Organisations and projects read as marks; people as portraits. */
  shape?: 'round' | 'square';
}) {
  const candidates = useMemo(() => (src ? logoCandidates(src) : []), [src]);
  const [attempt, setAttempt] = useState(0);
  const img = useRef<HTMLImageElement>(null);
  useEffect(() => setAttempt(0), [src]);

  // An image that failed before hydration attached `onError` has already
  // fired its event; load it again so the handler sees the outcome.
  useEffect(() => {
    const el = img.current;
    const url = el?.getAttribute('src');
    if (el && url && el.complete && el.naturalWidth === 0) el.setAttribute('src', url);
  }, []);

  const initials =
    name
      .replace(/[^A-Za-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';
  const current = candidates[attempt];
  return (
    <span
      className={shape === 'square' ? 'rx-avatar is-square' : 'rx-avatar'}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {initials}
      {current && (
        <img
          ref={img}
          key={current}
          src={current}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setAttempt((a) => a + 1)}
        />
      )}
    </span>
  );
}
