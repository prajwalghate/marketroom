import { formatCompactUsd } from '@marketroom/core';
import { queryDirectory, type DirectoryRow } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { colorFor } from '@/components/charts/palette';
import { ProjectLink, roundHref } from '@/components/research/Entities';
import { Estimate, ReviewBadge } from '@/components/research/Evidence';
import { ActiveFilters, FacetGroup, SearchBox, SortHeader } from '@/components/research/Filters';
import { fmtDay, fmtMonth, fmtRate } from '@/components/research/format';
import { Building } from '@/components/research/Profile';
import { Pager } from '@/components/sol/Filters';
import { Delta, PageHead } from '@/components/sol/primitives';
import { hrefWith, one, pageOf, type Params } from '@/lib/query';
import { directoryRows, importState, investorRows } from '@/lib/research';

export const metadata: Metadata = {
  title: 'Projects',
  description:
    'Every Solana project in one directory — what it does, its category and status, its latest funding, its on-chain activity, and when its profile was last checked.',
};

export const dynamic = 'force-dynamic';

const BASE = '/projects';

const ACTIVITY_DOT: Record<string, string> = {
  high: 'is-high',
  moderate: 'is-moderate',
  low: 'is-low',
  dormant: 'is-dormant',
  unknown: 'is-unknown',
};

const STATUS: Record<string, string> = {
  active: 'Active',
  inactive: 'Inactive',
  acquired: 'Acquired',
  closed: 'Closed',
  pre_launch: 'Pre-launch',
  unknown: 'Not assessed',
};

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [all, state, investors] = await Promise.all([
    directoryRows(),
    importState(),
    investorRows(),
  ]);

  const filters = {
    q: one(params.q),
    category: one(params.category),
    status: one(params.status),
    round: one(params.round),
    investor: one(params.investor),
    activity: one(params.activity),
    funded: one(params.funded),
    review: one(params.review),
    sort: one(params.sort) || 'tvl',
    page: pageOf(params),
  };
  const result = queryDirectory(all, filters);
  const investorName = new Map(
    investors.filter((i) => i.type === 'organization').map((i) => [i.slug, i.name]),
  );
  const checked = all.filter((r) => r.reviewStatus === 'verified').length;

  return (
    <div className="mr-container">
      <PageHead
        title="Projects"
        lead="Every project building on Solana, connected to its team, investors, funding, programs and token. Each profile shows its sources and when an editor last checked it."
        meta={
          <span>
            {all.length.toLocaleString('en-US')} projects · {checked.toLocaleString('en-US')}{' '}
            checked by an editor
            {state.lastImportAt ? ` · imports ${fmtDay(state.lastImportAt)}` : ''}
          </span>
        }
      />

      {all.length === 0 ? (
        <Building
          what="The project directory"
          running={state.running || state.pending.length > 0}
        />
      ) : (
        <div className="rx-db">
          <div className="rx-filters" aria-label="Filters">
            <FacetGroup
              title="Category"
              param="category"
              options={result.facets.category}
              base={BASE}
              params={params}
              limit={10}
            />
            <FacetGroup
              title="Project status"
              param="status"
              options={result.facets.status}
              base={BASE}
              params={params}
            />
            <FacetGroup
              title="Funding round"
              param="round"
              options={result.facets.round}
              base={BASE}
              params={params}
            />
            <FacetGroup
              title="Funding"
              param="funded"
              options={[
                { value: 'yes', label: 'Has disclosed funding' },
                { value: '12m', label: 'Raised in the last 12 months' },
                { value: 'no', label: 'No funding on record' },
              ]}
              base={BASE}
              params={params}
            />
            <FacetGroup
              title="Investor"
              param="investor"
              options={result.facets.investor.map((f) => ({
                ...f,
                label: investorName.get(f.value) ?? f.value,
              }))}
              base={BASE}
              params={params}
              limit={8}
              open={!!filters.investor}
            />
            <FacetGroup
              title="Solana activity"
              param="activity"
              options={result.facets.activity}
              base={BASE}
              params={params}
            />
            <FacetGroup
              title="Profile check"
              param="review"
              options={[
                ...result.facets.review,
                { value: 'stale', label: 'Not checked in 90 days' },
              ]}
              base={BASE}
              params={params}
              open={!!filters.review}
            />
          </div>

          <div>
            <SearchBox
              base={BASE}
              params={params}
              placeholder="Search by name, alias or token symbol"
              label="Search projects"
            />
            <div className="rx-results-head">
              <p className="rx-results-count" role="status">
                <strong>{result.total.toLocaleString('en-US')}</strong>{' '}
                {result.total === 1 ? 'project' : 'projects'}
              </p>
              <ActiveFilters
                base={BASE}
                params={params}
                labels={{
                  q: (v) => `“${v}”`,
                  category: (v) => v,
                  status: (v) => STATUS[v] ?? v,
                  round: (v) => `${v} round`,
                  investor: (v) => `Backed by ${investorName.get(v) ?? v}`,
                  activity: (v) => `Activity: ${v}`,
                  funded: (v) =>
                    v === 'yes' ? 'Funded' : v === 'no' ? 'No funding' : 'Raised in 12 months',
                  review: (v) =>
                    v === 'verified'
                      ? 'Checked'
                      : v === 'stale'
                        ? 'Check overdue'
                        : v === 'needs_review'
                          ? 'Flagged'
                          : 'Not yet checked',
                }}
              />
            </div>

            {result.rows.length === 0 ? (
              <p className="rx-empty">No project matches these filters.</p>
            ) : (
              <div className="rx-table-wrap">
                <table className="rx-table rx-dir">
                  <caption className="sr-only">
                    Solana projects, {result.total} results, page {result.page} of {result.pages}
                  </caption>
                  <thead>
                    <tr>
                      <th className="is-rank">#</th>
                      <SortHeader base={BASE} params={params} sort="name" current={result.sort}>
                        Project
                      </SortHeader>
                      <th>Category</th>
                      <SortHeader base={BASE} params={params} sort="latest" current={result.sort}>
                        Latest funding
                      </SortHeader>
                      <SortHeader base={BASE} params={params} sort="activity" current={result.sort}>
                        Solana activity
                      </SortHeader>
                      <SortHeader
                        base={BASE}
                        params={params}
                        sort="tvl"
                        current={result.sort}
                        numeric
                      >
                        Value locked
                      </SortHeader>
                      <SortHeader base={BASE} params={params} sort="checked" current={result.sort}>
                        Profile checked
                      </SortHeader>
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((r, i) => (
                      <Row key={r.id} r={r} rank={(result.page - 1) * 30 + i + 1} />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pager base={BASE} params={params} current={result.page} pages={result.pages} />
            <p className="rx-footnote">
              Activity is estimated from each project’s mapped Solana programs — their most recent
              transaction signatures on a public RPC node — and is shown only where programs are
              mapped. It measures use, not funding. Value locked is DefiLlama’s. The same view is
              available as JSON at{' '}
              <Link
                className="rx-clear"
                href={hrefWith('/api/v1/projects', params, {})}
                prefetch={false}
              >
                /api/v1/projects
              </Link>
              .
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ r, rank }: { r: DirectoryRow; rank: number }) {
  return (
    <tr>
      <td className="is-rank">{rank}</td>
      <td className="rx-dir-project">
        <ProjectLink
          project={r}
          size={28}
          sub={r.tagline ?? (r.token?.symbol ? `$${r.token.symbol}` : null)}
        />
      </td>
      <td>
        {r.category ? (
          <Link
            href={hrefWith(BASE, {}, { category: r.category })}
            className="rx-tag"
            prefetch={false}
          >
            <span
              className="rx-tag-dot"
              style={{ background: colorFor(r.category) }}
              aria-hidden="true"
            />
            {r.category}
          </Link>
        ) : (
          <span className="rx-muted">—</span>
        )}
        {r.status && r.status !== 'active' && (
          <span className={`rx-status is-${r.status}`}>{STATUS[r.status]}</span>
        )}
      </td>
      <td>
        {r.latestRound ? (
          <Link href={roundHref(r.latestRound.slug)} className="rx-dir-round" prefetch={false}>
            <span className="rx-dir-round-type">{r.latestRound.roundType ?? 'Round'}</span>
            <span className="mr-num">
              {r.latestRound.amountUsd ? formatCompactUsd(r.latestRound.amountUsd) : 'Undisclosed'}
            </span>
            <span className="rx-muted">{fmtMonth(r.latestRound.announcedOn)}</span>
          </Link>
        ) : (
          <span className="rx-muted">None on record</span>
        )}
      </td>
      <td>
        {r.programCount === 0 ? (
          <span className="rx-muted" title="No Solana programs mapped to this project yet">
            —
          </span>
        ) : r.txPerHour === null && r.latestTxAt === null ? (
          <span className="rx-muted">Not measured yet</span>
        ) : (
          <span className="rx-activity">
            <span className={`rx-dot ${ACTIVITY_DOT[r.activity]}`} aria-hidden="true" />
            {r.activity === 'dormant' ? (
              <span>Dormant</span>
            ) : (
              <Estimate
                method={`Across ${r.programCount} mapped program${r.programCount === 1 ? '' : 's'}, from their latest transaction signatures on a public RPC node.`}
              >
                <span className="mr-num">{fmtRate(r.txPerHour)}</span>
              </Estimate>
            )}
          </span>
        )}
      </td>
      <td className="is-num">
        {formatCompactUsd(r.tvlSolana)}
        {r.tvlChange7d !== null && (
          <span className="rx-sub-num">
            <Delta value={r.tvlChange7d} />
          </span>
        )}
      </td>
      <td>
        {r.reviewStatus === 'verified' ? (
          <ReviewBadge status="verified" checkedAt={r.checkedAt} />
        ) : (
          <ReviewBadge status={r.reviewStatus} compact />
        )}
      </td>
    </tr>
  );
}
