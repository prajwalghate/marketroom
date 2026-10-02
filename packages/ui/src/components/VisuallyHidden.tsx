import clsx from 'clsx';
import type { ReactNode } from 'react';

/**
 * Text for screen readers only.
 *
 * This lives in @marketroom/ui rather than in the app because the package
 * itself depends on it — `PriceChange` emits a direction word that must not be
 * painted. A component cannot rely on a class defined one layer above it, which
 * is exactly what `.sr-only` in the app's `globals.css` was.
 *
 * Use it for information that sighted users get from position, colour or an
 * icon, and that nobody else would otherwise get:
 *
 *   - the word "up" next to a green `+2.13%`
 *   - the venue name behind a 6px coloured dot
 *   - the word "Loading" beside a skeleton
 *
 * Do NOT use it to hide decoration. Decoration gets `aria-hidden`, which is the
 * opposite operation.
 */
export interface VisuallyHiddenProps {
  children: ReactNode;
  /**
   * Element to render. `span` is correct almost always; `div` exists for the
   * handful of places a phrasing element is invalid.
   */
  as?: 'span' | 'div';
  /** Set when something references this text via `aria-describedby`. */
  id?: string;
  className?: string;
}

export function VisuallyHidden({ children, as: Tag = 'span', id, className }: VisuallyHiddenProps) {
  return (
    <Tag id={id} className={clsx('mr-sr-only', className)}>
      {children}
    </Tag>
  );
}
