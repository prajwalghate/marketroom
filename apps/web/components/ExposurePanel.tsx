import type { AssetView } from '@marketroom/core';
import { SectionTitle } from '@marketroom/ui';
import { EXPOSURE_SIZES, getExposureInputs } from '@/lib/data';
import { CostOfExposure } from './CostOfExposure';

/**
 * Server shell for the cost comparison, streamed.
 *
 * Measuring execution cost means six upstream quotes — a simulated swap round
 * trip at each offered size, plus the order book — which is ~4s cold. Awaiting
 * that in the page would hold back the price, the chart and the venue
 * comparison behind data none of them need.
 *
 * So it streams: the page paints immediately and this panel arrives when it is
 * ready. This is the one place in the product where a loading state is honest
 * rather than a symptom — the work is genuinely slow and genuinely
 * supplementary, unlike anything on the critical path.
 */
export async function ExposurePanel({ view }: { view: AssetView }) {
  // Quoted at every offered size up front so switching size in the UI is
  // arithmetic rather than another round trip.
  const entries = await Promise.all(
    EXPOSURE_SIZES.map(async (size) => [size, await getExposureInputs(view, size)] as const),
  );

  return (
    <CostOfExposure
      symbol={view.asset.symbol}
      inputsBySize={Object.fromEntries(entries)}
      sizes={EXPOSURE_SIZES}
    />
  );
}

/** Placeholder with the panel's real shape, so nothing jumps when it lands. */
export function ExposurePanelFallback() {
  return (
    <section style={{ marginBottom: 22 }} aria-busy="true">
      <SectionTitle>Cost of exposure</SectionTitle>
      <p
        style={{
          margin: 0,
          padding: '20px 14px',
          fontSize: 'var(--mr-text-sm)',
          color: 'var(--mr-text-subtle)',
          border: '1px dashed var(--mr-border)',
          borderRadius: 'var(--mr-radius-lg)',
        }}
      >
        Measuring execution cost on each venue…
      </p>
    </section>
  );
}
