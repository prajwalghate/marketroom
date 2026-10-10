import { formatCompactUsd, normalizeName, ROUND_SIZES } from '@marketroom/core';
import type { RoundRow } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AreaSpark, PieChart } from '@/components/charts/Charts';
import { ColumnChart } from '@/components/charts/ColumnChart';
import { colorFor } from '@/components/charts/palette';
import { PartyStack, ProjectLink, roundHref } from '@/components/research/Entities';
import { ReviewBadge, sourceKindLabel } from '@/components/research/Evidence';
import { ActiveFilters, FacetGroup, SearchBox, SortHeader } from '@/components/research/Filters';
import { fmtDay } from '@/components/research/format';
import { Building } from '@/components/research/Profile';
import { Pager } from '@/components/sol/Filters';
import { Kpi, PageHead, Panel } from '@/components/sol/primitives';
import { fundingTrend, roundTypeSlices } from '@/lib/funding';
import { one, pageOf, type Params } from '@/lib/query';
import { importState, roundRows } from '@/lib/research';

export const metadata: Metadata = {
  title: 'Fundraising',
  description:
    'Every disclosed funding round for a Solana project — amount, date, type, investors and the announcement it comes from.',
};

export const dynamic = 'force-dynamic';

const BASE = '/fundraising';
const PAGE = 30;
const DAY = 86_400_000;

const SORTS: Record<string, (a: RoundRow, b: RoundRow) => number> = {
  date: (a, b) => b.announcedOn.localeCompare(a.announcedOn),
  amount: (a, b) => (b.amountUsd ?? -1) - (a.amountUsd ?? -1),
  valuation: (a, b) => (b.valuationUsd ?? -1) - (a.valuationUsd ?? -1),
};

export default async function FundraisingPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [all, state] = await Promise.all([roundRows(), importState()]);
  const now = Date.now();

  const q = normalizeName(one(params.q));
  const type = one(params.round);
  const size = one(params.size);
  const category = one(params.category);
  const year = one(params.year);
  const investor = one(params.investor);
  const sort = SORTS[one(params.sort)] ? one(params.sort) : 'date';
  const bucket = ROUND_SIZES.find((b) => b.key === size);

  const pass = (r: RoundRow, except?: string) =>
    (!q ||
      normalizeName(`${r.project.name} ${r.investors.map((i) => i.name).join(' ')}`).includes(q)) &&
    (except === 'round' || !type || r.roundType === type) &&
    (except === 'size' ||
      !size ||
      (size === 'undisclosed'
        ? r.amountUsd === null
        : !!bucket &&
          r.amountUsd !== null &&
          r.amountUsd >= bucket.min &&
          r.amountUsd < bucket.max)) &&
    (except === 'category' || !category || r.project.category === category) &&
    (except === 'year' || !year || r.announcedOn.startsWith(year)) &&
    (except === 'investor' || !investor || r.investors.some((i) => i.slug === investor));
  const matched = all.filter((r) => pass(r)).sort((a, b) => SORTS[sort]!(a, b) || b.id - a.id);
  const facet = (except: string, values: (r: RoundRow) => (string | null)[]) => {
    const counts = new Map<string, number>();
    for (const r of all.filter((x) => pass(x, except)))
      for (const v of new Set(values(r))) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()]
      .map(([value, count]) => ({ value, label: value, count }))
      .sort((a, b) => b.count - a.count);
  };
  const sizeOptions = [
    ...ROUND_SIZES.map((b) => ({
      value: b.key,
      label: b.label,
      count: all.filter(
        (r) =>
          pass(r, 'size') && r.amountUsd !== null && r.amountUsd >= b.min && r.amountUsd < b.max,
      ).length,
    })),
    {
      value: 'undisclosed',
      label: 'Undisclosed',
      count: all.filter((r) => pass(r, 'size') && r.amountUsd === null).length,
    },
  ];
  const investorNames = new Map(
    all.flatMap((r) => r.investors.map((i) => [i.slug, i.name] as const)),
  );

  // Headline figures over the last year, from disclosed rounds only.
  const yearAgo = new Date(now - 365 * DAY).toISOString().slice(0, 10);
  const lastYear = all.filter((r) => r.announcedOn >= yearAgo);
  const disclosed = lastYear
    .filter((r) => r.amountUsd !== null)
    .map((r) => r.amountUsd!)
    .sort((a, b) => a - b);
  const total = disclosed.reduce((s, v) => s + v, 0);
  const median = disclosed.length ? disclosed[Math.floor(disclosed.length / 2)]! : null;
  const investorsYear = new Set(
    lastYear.flatMap((r) => r.investors.map((i) => `${i.type}:${i.slug}`)),
  ).size;
  const trend = fundingTrend(all, 24, 6, now);
  const types = roundTypeSlices(lastYear);
  const pages = Math.max(1, Math.ceil(matched.length / PAGE));
  const page = Math.min(pageOf(params), pages);
  const shown = matched.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="mr-container">
      <PageHead
        title="Fundraising"
        lead="Every disclosed round for a Solana project, from its announcement or a funding database — never from on-chain transfers. Each round links to its investors and its source."
        meta={<span>{all.length.toLocaleString('en-US')} rounds on record</span>}
      />
      {all.length === 0 ? (
        <Building what="Funding data" running={state.running || state.pending.length > 0} />
      ) : (
        <>
          <dl className="rx-kpis">
            <Kpi
              label="Rounds, last 12 months"
              value={String(lastYear.length)}
              sub={`${disclosed.length} with a disclosed amount`}
              chart={
                <AreaSpark
                  values={trend.counts.slice(-12)}
                  tone="accent"
                  label="Rounds per month, last 12 months"
                />
              }
            />
            <Kpi
              label="Disclosed, last 12 months"
              value={formatCompactUsd(total)}
              sub="sum of disclosed rounds"
              chart={
                <AreaSpark
                  values={trend.totals.slice(-12)}
                  tone="accent"
                  label="Disclosed funding per month, last 12 months"
                />
              }
            />
            <Kpi
              label="Median round"
              value={formatCompactUsd(median)}
              sub="disclosed rounds, 12 months"
            />
            <Kpi
              label="Active investors"
              value={String(investorsYear)}
              sub="named in a round, 12 months"
            />
          </dl>
          <div className="rx-grid is-2-1">
            <Panel title="Funding trend by category, two years">
              <ColumnChart
                labels={trend.labels}
                series={trend.series}
                line={{ label: 'Rounds', values: trend.counts }}
                format="usd"
                lineFormat="count"
                height={330}
                label="Disclosed funding per month by project category, with the number of rounds"
              />
            </Panel>
            <Panel title="Rounds by type, 12 months">
              <PieChart
                slices={types}
                label="Funding rounds by type, last 12 months"
                inner={0.62}
                size={170}
                center={{ value: String(lastYear.length), caption: 'rounds' }}
              />
            </Panel>
          </div>

          <div className="rx-db" style={{ marginTop: 18 }}>
            <div className="rx-filters" aria-label="Filters">
              <FacetGroup
                title="Round type"
                param="round"
                options={facet('round', (r) => [r.roundType])}
                base={BASE}
                params={params}
              />
              <FacetGroup
                title="Round size"
                param="size"
                options={sizeOptions}
                base={BASE}
                params={params}
              />
              <FacetGroup
                title="Category"
                param="category"
                options={facet('category', (r) => [r.project.category])}
                base={BASE}
                params={params}
                limit={8}
              />
              <FacetGroup
                title="Year"
                param="year"
                options={facet('year', (r) => [r.announcedOn.slice(0, 4)]).sort((a, b) =>
                  b.value.localeCompare(a.value),
                )}
                base={BASE}
                params={params}
              />
              <FacetGroup
                title="Investor"
                param="investor"
                options={facet('investor', (r) => r.investors.map((i) => i.slug)).map((f) => ({
                  ...f,
                  label: investorNames.get(f.value) ?? f.value,
                }))}
                base={BASE}
                params={params}
                open={!!investor}
              />
            </div>
            <div>
              <SearchBox
                base={BASE}
                params={params}
                placeholder="Search by project or investor"
                label="Search rounds"
              />
              <div className="rx-results-head">
                <p className="rx-results-count" role="status">
                  <strong>{matched.length.toLocaleString('en-US')}</strong> rounds
                </p>
                <ActiveFilters
                  base={BASE}
                  params={params}
                  labels={{
                    q: (v) => `“${v}”`,
                    round: (v) => v,
                    size: (v) => sizeOptions.find((s) => s.value === v)?.label ?? v,
                    category: (v) => v,
                    year: (v) => v,
                    investor: (v) => `With ${investorNames.get(v) ?? v}`,
                  }}
                />
              </div>
              <div className="rx-table-wrap">
                <table className="rx-table">
                  <caption className="sr-only">Funding rounds, {matched.length} results</caption>
                  <thead>
                    <tr>
                      <SortHeader base={BASE} params={params} sort="date" current={sort}>
                        Date
                      </SortHeader>
                      <th>Project</th>
                      <th>Round</th>
                      <SortHeader base={BASE} params={params} sort="amount" current={sort} numeric>
                        Amount
                      </SortHeader>
                      <SortHeader
                        base={BASE}
                        params={params}
                        sort="valuation"
                        current={sort}
                        numeric
                      >
                        Valuation
                      </SortHeader>
                      <th>Investors</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.id}>
                        <td className="mr-num">
                          <time dateTime={r.announcedOn}>{fmtDay(r.announcedOn)}</time>
                        </td>
                        <td>
                          <ProjectLink
                            project={r.project}
                            sub={
                              r.project.category ? (
                                <>
                                  <span
                                    className="rx-tag-dot"
                                    style={{ background: colorFor(r.project.category) }}
                                    aria-hidden="true"
                                  />
                                  {r.project.category}
                                </>
                              ) : null
                            }
                          />
                        </td>
                        <td>
                          <Link
                            href={roundHref(r.slug)}
                            className="rx-strong-link"
                            prefetch={false}
                          >
                            {r.roundType ?? 'Round'}
                          </Link>
                          <span className="rx-under">
                            <ReviewBadge status={r.reviewStatus} checkedAt={r.checkedAt} compact />
                          </span>
                        </td>
                        <td className="is-num">
                          {r.amountUsd ? (
                            formatCompactUsd(r.amountUsd)
                          ) : (
                            <span className="rx-muted">Undisclosed</span>
                          )}
                        </td>
                        <td className="is-num">
                          {r.valuationUsd ? (
                            formatCompactUsd(r.valuationUsd)
                          ) : (
                            <span className="rx-muted">—</span>
                          )}
                        </td>
                        <td>
                          <PartyStack parties={r.investors} moreHref={roundHref(r.slug)} />
                        </td>
                        <td>
                          {r.source ? (
                            <a
                              href={r.source.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rx-src-link"
                            >
                              {r.source.publisher ?? sourceKindLabel(r.source.kind)}
                              <span className="rx-ext" aria-hidden="true">
                                ↗
                              </span>
                              <span className="sr-only"> (opens in a new tab)</span>
                            </a>
                          ) : (
                            <span className="rx-nosrc">No source</span>
                          )}
                          {r.sourceCount > 1 && (
                            <span className="rx-muted"> +{r.sourceCount - 1}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager base={BASE} params={params} current={page} pages={pages} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
