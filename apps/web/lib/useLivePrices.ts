'use client';

import { sharedMidPriceStream } from '@marketroom/adapters';
import { useSyncExternalStore } from 'react';

const EMPTY: ReadonlyMap<string, number> = new Map();

/**
 * Live mid prices from the Hyperliquid websocket, keyed by venue symbol
 * (`xyz:NVDA`).
 *
 * `useSyncExternalStore` rather than `useState` + `useEffect` is the whole
 * point: the stream mutates outside React and notifies at most once per
 * animation frame, so a venue pushing hundreds of frames a second still costs
 * one render per frame. The server snapshot is already painted, so this layer
 * only ever upgrades a value that is on screen — it never gates a render.
 */
export function useLivePrices(): ReadonlyMap<string, number> {
  const stream = sharedMidPriceStream({
    wsUrl: process.env.NEXT_PUBLIC_HYPERLIQUID_WS_URL ?? 'wss://api.hyperliquid.xyz/ws',
    dex: process.env.NEXT_PUBLIC_HYPERLIQUID_DEX ?? 'xyz',
  });

  return useSyncExternalStore(
    stream.subscribe,
    stream.getSnapshot,
    // Server render: no socket, so no live prices. The server snapshot is what
    // paints, and hydration stays consistent.
    () => EMPTY,
  );
}
