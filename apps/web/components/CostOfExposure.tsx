'use client';

import type { VenueCostInputs } from '@marketroom/core';
import { compareExposure, formatCompactUsd, formatPercentAbs, formatPrice } from '@marketroom/core';
import { Badge, SectionTitle, VenueBadge } from '@marketroom/ui';
import { useMemo, useState } from 'react';

/**
 * What it actually costs to hold this asset, per venue.
 *
 * The reason this exists: a cross-venue price spread is trivia. The question a
 * reader has is "which venue should I use", and that has a real answer that
 * changes with how long they intend to hold.
 *
 * All the slow inputs — order-book spread, simulated AMM round trips at three
 * sizes — are fetched on the server. Everything here is arithmetic, so dragging
 * the holding period or switching size is instant and does no network at all.
 */

export interface CostOfExposureProps {
  symbol: string;
  /** Pre-quoted inputs, keyed by notional size. */
  inputsBySize: Record<number, VenueCostInputs[]>;
  sizes: readonly number[];
}

const DAY_STOPS = [1, 7, 14, 30, 60, 90, 180, 365];

export function CostOfExposure({ symbol, inputsBySize, sizes }: CostOfExposureProps) {
  const [size, setSize] = useState(sizes[1] ?? sizes[0] ?? 10_000);
  const [days, setDays] = useState(30);

  const inputs = inputsBySize[size] ?? [];
  const result = useMemo(
    () => compareExposure(inputs, { notionalUsd: size, days }),
    [inputs, size, days],
  );

  const measurable = result.costs.filter((c) => c.complete);
  if (measurable.length === 0) return null;

  const worst = Math.max(...measurable.map((c) => Math.abs(c.totalFraction)), 1e-6);

  return (
    <section style={{ marginBottom: 22 }}>
      <SectionTitle
        action={
          <span style={{ fontSize: 'var(--mr-text-2xs)', color: 'var(--mr-text-subtle)' }}>
            estimate · live funding &amp; depth
          </span>
        }
      >
        Cost of exposure
      </SectionTitle>

      {/* ── Controls ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          alignItems: 'flex-end',
          marginBottom: 14,
        }}
      >
        <div>
          <div className="mr-control-label">Position size</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {sizes.map((value) => (
              <button
                key={value}
                type="button"
                className="mr-chip"
                aria-pressed={size === value}
                onClick={() => setSize(value)}
              >
                {formatCompactUsd(value, 0)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: '1 1 220px', minWidth: 200 }}>
          <div className="mr-control-label">
            Holding period —{' '}
            <span className="mr-num" style={{ color: 'var(--mr-text)' }}>
              {days} {days === 1 ? 'day' : 'days'}
            </span>
          </div>
          <input
            type="range"
            className="mr-range"
            min={0}
            max={DAY_STOPS.length - 1}
            step={1}
            value={Math.max(0, DAY_STOPS.indexOf(days))}
            onChange={(event) => setDays(DAY_STOPS[Number(event.target.value)] ?? 30)}
            aria-label="Holding period in days"
            aria-valuetext={`${days} days`}
          />
        </div>
      </div>

      {/* ── The answer ──────────────────────────────────────────────────── */}
      {/* Stating the conclusion is the whole point. A crossover exists only when
          the perp's cheaper entry actually buys it time before funding catches
          up; when it does not — which is common — the ranking never changes and
          saying so plainly is more useful than saying nothing. */}
      <p
        style={{
          margin: '0 0 14px',
          fontSize: 'var(--mr-text-sm)',
          lineHeight: 1.65,
          color: 'var(--mr-text-muted)',
        }}
      >
        {result.crossoverDays !== null && result.cheaperBefore && result.cheaperAfter ? (
          <>
            For {formatCompactUsd(size, 0)} of {symbol}, the{' '}
            <strong style={{ color: 'var(--mr-text)' }}>
              {label(result.cheaperBefore.kind)} is cheaper up to{' '}
              <span className="mr-num">{formatDays(result.crossoverDays)}</span>
            </strong>
            ; beyond that the {label(result.cheaperAfter.kind)} wins.
          </>
        ) : measurable.length > 1 && result.cheapest ? (
          <>
            For {formatCompactUsd(size, 0)} of {symbol}, the{' '}
            <strong style={{ color: 'var(--mr-text)' }}>
              {label(result.cheapest.kind)} is cheaper at every holding period
            </strong>{' '}
            — it costs less to get into <em>and</em> less to keep.
          </>
        ) : (
          <>Only one venue could be priced, so there is nothing to compare against.</>
        )}{' '}
        A perp is cheap to open and charges funding for as long as you hold it; a token costs more
        to swap into and nothing to keep.
      </p>

      {/* ── Per-venue breakdown ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gap: 10 }}>
        {result.costs.map((cost) => {
          const isCheapest = result.cheapest?.listingId === cost.listingId;
          const width = `${Math.min(100, (Math.abs(cost.totalFraction) / worst) * 100)}%`;
          const income = cost.totalFraction < 0;

          return (
            <div
              key={cost.listingId}
              style={{
                background: 'var(--mr-surface-1)',
                border: `1px solid ${isCheapest ? 'var(--mr-accent-border)' : 'var(--mr-border)'}`,
                borderRadius: 'var(--mr-radius-lg)',
                padding: '12px 14px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  marginBottom: 9,
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <VenueBadge venue={cost.venue} />
                  {isCheapest && <Badge tone="accent">Cheaper</Badge>}
                  {!cost.complete && (
                    <Badge tone="warn" title="One or more cost inputs were unavailable">
                      Incomplete
                    </Badge>
                  )}
                </span>

                <span style={{ textAlign: 'right' }}>
                  <span
                    className="mr-num"
                    style={{
                      fontSize: 'var(--mr-text-lg)',
                      fontWeight: 600,
                      color: income ? 'var(--mr-up)' : 'var(--mr-text)',
                    }}
                  >
                    {income ? '+' : '−'}
                    {formatPrice(Math.abs(cost.totalUsd))}
                  </span>
                  <span
                    className="mr-num"
                    style={{
                      marginLeft: 8,
                      fontSize: 'var(--mr-text-xs)',
                      color: 'var(--mr-text-subtle)',
                    }}
                  >
                    {formatPercentAbs(cost.totalFraction)}
                  </span>
                </span>
              </div>

              {/* Magnitude bar, so two venues compare at a glance. */}
              <div
                aria-hidden="true"
                style={{
                  height: 4,
                  background: 'var(--mr-surface-3)',
                  borderRadius: 'var(--mr-radius-full)',
                  overflow: 'hidden',
                  marginBottom: 9,
                }}
              >
                <div
                  style={{
                    width,
                    height: '100%',
                    background: income ? 'var(--mr-up)' : 'var(--mr-flat)',
                  }}
                />
              </div>

              <dl
                style={{
                  margin: 0,
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '4px 10px',
                  fontSize: 'var(--mr-text-xs)',
                }}
              >
                {cost.components.map((component) => (
                  <Row
                    key={component.label}
                    label={component.label}
                    value={`${component.fraction < 0 ? '+' : ''}${formatPrice(Math.abs(component.usd))}`}
                  />
                ))}
                <Row
                  label="Capital required"
                  value={formatPrice(cost.capitalRequiredUsd)}
                  hint={
                    cost.capitalRequiredUsd < size
                      ? 'Leverage means less capital posted — and a liquidation price.'
                      : undefined
                  }
                />
              </dl>
            </div>
          );
        })}
      </div>

      <p
        style={{
          margin: '10px 0 0',
          fontSize: 'var(--mr-text-2xs)',
          color: 'var(--mr-text-subtle)',
          lineHeight: 1.6,
        }}
      >
        Execution cost is measured now — order-book spread plus taker fees for the perp, a simulated
        round-trip swap for the token. Funding is projected forward at the current rate, which will
        change. This is a cost comparison, not advice, and it excludes liquidation risk on the perp
        and issuer risk on the token.
      </p>
    </section>
  );
}

function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <>
      <dt style={{ color: 'var(--mr-text-subtle)' }} title={hint}>
        {label}
      </dt>
      <dd
        className="mr-num"
        style={{ margin: 0, textAlign: 'right', color: 'var(--mr-text-muted)' }}
      >
        {value}
      </dd>
    </>
  );
}

const label = (kind: string) => (kind === 'perpetual' ? 'perp' : 'token');

function formatDays(days: number): string {
  if (days < 1) return `${Math.round(days * 24)} hours`;
  if (days < 60) return `${days.toFixed(days < 10 ? 1 : 0)} days`;
  return `${(days / 30).toFixed(1)} months`;
}
