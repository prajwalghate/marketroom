/**
 * Hyperliquid realtime stream.
 *
 * Design note — this is the piece that makes the "no spinners" requirement hold
 * under live data. A naive implementation calls `setState` on every frame;
 * `allMids` across 129 markets would then re-render the index page hundreds of
 * times a second and drop frames.
 *
 * Instead:
 *   1. Frames land in a plain mutable `Map` outside React.
 *   2. A single `requestAnimationFrame` coalesces all updates in a tick.
 *   3. Subscribers are notified once per frame, and read through
 *      `useSyncExternalStore`.
 *
 * So the socket can be as noisy as it likes and React still re-renders at most
 * once per animation frame.
 */

export interface StreamConfig {
  readonly wsUrl: string;
  readonly dex: string;
}

export const DEFAULT_STREAM_CONFIG: StreamConfig = {
  wsUrl: 'wss://api.hyperliquid.xyz/ws',
  dex: 'xyz',
};

export type ConnectionState = 'idle' | 'connecting' | 'open' | 'closed';

type Listener = () => void;

interface WireMids {
  channel: string;
  data?: { mids?: Record<string, string> };
}

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

/**
 * Live mid prices for every market on the venue, from one subscription.
 *
 * Deliberately framework-agnostic: it exposes the `subscribe`/`getSnapshot`
 * contract `useSyncExternalStore` wants, but has no React dependency, so it is
 * testable in plain Node.
 */
export class MidPriceStream {
  private socket: WebSocket | null = null;
  private readonly prices = new Map<string, number>();
  private readonly listeners = new Set<Listener>();
  private state: ConnectionState = 'idle';
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private frameHandle: number | null = null;
  private dirty = false;
  /** Replaced on each flush so `useSyncExternalStore` sees a new reference. */
  private snapshot: ReadonlyMap<string, number> = new Map();

  constructor(private readonly config: StreamConfig = DEFAULT_STREAM_CONFIG) {}

  getConnectionState(): ConnectionState {
    return this.state;
  }

  getSnapshot = (): ReadonlyMap<string, number> => this.snapshot;

  /** `useSyncExternalStore` contract. Connects lazily on first subscriber. */
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.connect();

    return () => {
      this.listeners.delete(listener);
      // Last subscriber gone — drop the socket rather than leaking it.
      if (this.listeners.size === 0) this.disconnect();
    };
  };

  private connect(): void {
    if (typeof WebSocket === 'undefined') return; // SSR: no-op.
    if (this.socket) return;

    this.state = 'connecting';
    const socket = new WebSocket(this.config.wsUrl);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.state = 'open';
      this.reconnectAttempts = 0;
      socket.send(
        JSON.stringify({
          method: 'subscribe',
          subscription: { type: 'allMids', dex: this.config.dex },
        }),
      );
      this.notify();
    });

    socket.addEventListener('message', (event) => {
      let frame: WireMids;
      try {
        frame = JSON.parse(String(event.data)) as WireMids;
      } catch {
        return; // Malformed frame: ignore rather than tear down the socket.
      }
      if (frame.channel !== 'allMids' || !frame.data?.mids) return;

      for (const [symbol, raw] of Object.entries(frame.data.mids)) {
        const price = Number(raw);
        if (Number.isFinite(price)) {
          this.prices.set(symbol, price);
          this.dirty = true;
        }
      }
      this.scheduleFlush();
    });

    socket.addEventListener('close', () => {
      this.state = 'closed';
      this.socket = null;
      this.notify();
      if (this.listeners.size > 0) this.scheduleReconnect();
    });

    socket.addEventListener('error', () => socket.close());
  }

  /** Coalesce every frame received this tick into a single notification. */
  private scheduleFlush(): void {
    if (this.frameHandle !== null) return;

    const flush = () => {
      this.frameHandle = null;
      if (!this.dirty) return;
      this.dirty = false;
      this.snapshot = new Map(this.prices);
      this.notify();
    };

    this.frameHandle =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(flush)
        : (setTimeout(flush, 16) as unknown as number);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    // Exponential backoff with jitter, capped — a venue outage must not turn
    // into a reconnect storm from every open tab.
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_MS);
    this.reconnectAttempts += 1;
    this.reconnectTimer = setTimeout(
      () => {
        this.reconnectTimer = null;
        if (this.listeners.size > 0) this.connect();
      },
      delay + Math.random() * 500,
    );
  }

  private disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.frameHandle !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = null;
    }
    this.socket?.close();
    this.socket = null;
    this.state = 'idle';
  }

  private notify(): void {
    for (const listener of this.listeners) listener();
  }
}

/** Process-wide singleton: one socket per tab, however many components read it. */
let shared: MidPriceStream | null = null;

export function sharedMidPriceStream(config?: StreamConfig): MidPriceStream {
  shared ??= new MidPriceStream(config);
  return shared;
}
