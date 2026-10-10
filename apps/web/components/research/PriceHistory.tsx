import { formatCompactUsd, formatPrice } from '@marketroom/core';
import { TimeSeriesChart } from '@/components/charts/TimeSeriesChart';
import { Delta, Empty } from '@/components/sol/primitives';
import { getTokenPriceHistory } from '@/lib/solana';
import { ago } from './format';

/**
 * A token's daily price candles from its deepest Solana pool on GeckoTerminal,
 * with the change over common periods — shared by project and token pages.
 */

const DAY = 86_400_000;

/** The price history, or why there is none: no pool listed, or the request failed. */
export async function priceHistory(mint: string, ms: number) {
  return Promise.race([
    getTokenPriceHistory(mint).then(
      (history) => ({ ok: true as const, history }),
      () => ({ ok: false as const, history: null }),
    ),
    new Promise<{ ok: false; history: null }>((resolve) =>
      setTimeout(() => resolve({ ok: false, history: null }), ms),
    ),
  ]);
}

export async function PriceChart({ mint, symbol }: { mint: string; symbol: string }) {
  const { ok, history } = await priceHistory(mint, 9_000);
  if (!history) {
    return (
      <Empty>
        {ok
          ? 'GeckoTerminal lists no Solana pool with daily prices for this token yet.'
          : 'GeckoTerminal did not answer in time. The price history is fetched again on the next visit.'}
      </Empty>
    );
  }
  const { candles, pool, fetchedAt } = history;
  const last = candles[candles.length - 1]!;
  const first = candles[0]!;
  const periods = [
    { label: '7 days', days: 7 },
    { label: '30 days', days: 30 },
    { label: '90 days', days: 90 },
    { label: '180 days', days: 180 },
    { label: '1 year', days: 365 },
  ]
    .filter((p) => last.t - first.t >= (p.days - 1) * DAY)
    .map((p) => {
      const base = candles.find((c) => c.t >= last.t - p.days * DAY);
      return { ...p, change: base && base.c > 0 ? last.c / base.c - 1 : null };
    });
  const high = Math.max(...candles.map((c) => c.h));
  const low = Math.min(...candles.map((c) => c.l));
  const spanDays = Math.round((last.t - first.t) / DAY) + 1;
  return (
    <>
      <TimeSeriesChart
        candles={candles.map(({ t, o, h, l, c }) => ({ t, o, h, l, c }))}
        kind="price"
        label={`${symbol} price, daily`}
        height={300}
        note={`Daily candles from GeckoTerminal for the ${pool.name} pool on ${pool.dex}, the deepest Solana pool it lists for ${symbol} (${formatCompactUsd(pool.reserveUsd)} in reserves). One pool’s trades, not an average across venues. Fetched ${ago(fetchedAt)}.`}
      />
      <dl className="rx-perf">
        {periods.map((p) => (
          <div key={p.label}>
            <dt>{p.label}</dt>
            <dd>
              <Delta value={p.change} />
            </dd>
          </div>
        ))}
        <div>
          <dt>{spanDays}-day range</dt>
          <dd className="mr-num">
            {formatPrice(low)} – {formatPrice(high)}
          </dd>
        </div>
      </dl>
    </>
  );
}
