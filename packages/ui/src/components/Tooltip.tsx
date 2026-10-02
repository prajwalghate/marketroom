import clsx from 'clsx';
import type { ReactNode } from 'react';

/**
 * Tooltip.
 *
 * CSS-only, and that is the whole design. Three things were wrong with the
 * native `title` attribute it replaces:
 *
 *   1. It takes ~1s to appear and cannot be styled, so it reads as a browser
 *      artefact rather than part of the product.
 *   2. It never appears on touch at all — on a phone the explanation of what
 *      `PERP` means simply does not exist.
 *   3. On a `<span>` it is unreliably announced by screen readers.
 *
 * A JS tooltip would fix those and cost a `'use client'` boundary on every
 * badge in a 129-row table. This one opens on hover *and* on keyboard focus,
 * is announced through `aria-describedby`, and ships zero JavaScript, so it is
 * safe inside Server Components.
 *
 * Two constraints to know before using it:
 *
 *   - The trigger is focusable, so it must NOT be nested inside a link or a
 *     button. Interactive content inside interactive content is invalid HTML and
 *     wrecks tab order. In a table row that is already a link, use
 *     `<Badge title>` instead — that keeps the native tooltip for mouse users
 *     and exposes the text to screen readers without adding a tab stop.
 *   - The bubble is absolutely positioned inside the trigger, so an ancestor
 *     with `overflow: hidden` will clip it. Pass `side="bottom"` near the top
 *     of the viewport, and `align="end"` / `align="start"` for a trigger that
 *     sits at the right / left edge of its container — otherwise the bubble
 *     overhangs the viewport on a narrow screen.
 *
 * Deliberate deviation from WAI-ARIA APG: dismissing with Escape needs a key
 * handler, which needs JS. Moving focus away dismisses it, which is the part
 * that actually matters for keyboard users.
 */

/**
 * Deterministic id from the content string.
 *
 * `useId` would be the obvious choice but it is a client hook and would throw
 * in a Server Component. Hashing the content is stable across server and
 * client, so there is no hydration mismatch; and if two tooltips with identical
 * text collide, `aria-describedby` resolves to an element with exactly the
 * right words in it, so the collision is harmless.
 */
function tooltipId(content: string): string {
  let hash = 0;
  for (let index = 0; index < content.length; index += 1) {
    hash = (hash * 31 + content.charCodeAt(index)) | 0;
  }
  return `mr-tip-${(hash >>> 0).toString(36)}`;
}

export interface TooltipProps {
  /** The explanation. Prose — a sentence, not a label. Keep it under ~140 chars. */
  content: string;
  children: ReactNode;
  /** Flip below the trigger when there is no room above. */
  side?: 'top' | 'bottom';
  /**
   * Which edge of the trigger the bubble anchors to.
   *
   * A centred bubble on a trigger near a viewport edge overhangs it, and no
   * width can fix that — pass `end` for a trigger sitting at the right edge of
   * its container, `start` at the left.
   */
  align?: 'center' | 'start' | 'end';
  /**
   * Dotted underline on the trigger, the conventional "there is more here"
   * affordance. Leave off when the trigger already looks like a chip or an icon.
   */
  underline?: boolean;
  className?: string;
}

export function Tooltip({
  content,
  children,
  side = 'top',
  align = 'center',
  underline = false,
  className,
}: TooltipProps) {
  const id = tooltipId(content);

  return (
    <span className={clsx('mr-tooltip', className)}>
      <span
        className={clsx('mr-tooltip-anchor', underline && 'mr-tooltip-trigger')}
        tabIndex={0}
        aria-describedby={id}
      >
        {children}
      </span>
      <span
        role="tooltip"
        id={id}
        className="mr-tooltip-bubble"
        data-side={side}
        data-align={align}
      >
        {content}
      </span>
    </span>
  );
}
