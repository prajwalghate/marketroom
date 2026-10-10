import { normalizeName } from '@marketroom/core';
import type { InvestorRow } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { partyHref, projectHref } from '@/components/research/Entities';
import { ReviewBadge } from '@/components/research/Evidence';
import { ActiveFilters, FacetGroup, SearchBox, SortHeader } from '@/components/research/Filters';
import { fmtMonth } from '@/components/research/format';
import { Building } from '@/components/research/Profile';
import { Avatar } from '@/components/sol/Avatar';
import { Pager } from '@/components/sol/Filters';
import { PageHead } from '@/components/sol/primitives';
import { one, pageOf, type Params } from '@/lib/query';
import { importState, investorRows } from '@/lib/research';

export const metadata: Metadata = {
  title: 'Investors',
  description:
    'Every investor in Solana projects — funds, angels and firms — with their deals, leads, portfolio and focus.',
};

export const dynamic = 'force-dynamic';

const BASE = '/investors';
const PAGE = 40;

const SORTS: Record<string, (a: InvestorRow, b: InvestorRow) => number> = {
  deals: (a, b) => b.deals - a.deals || b.leads - a.leads,
  recent: (a, b) => b.last12m - a.last12m || (b.lastDeal ?? '').localeCompare(a.lastDeal ?? ''),
  leads: (a, b) => b.leads - a.leads || b.deals - a.deals,
  portfolio: (a, b) => b.portfolio - a.portfolio,
  latest: (a, b) => (b.lastDeal ?? '').localeCompare(a.lastDeal ?? ''),
  name: (a, b) => a.name.localeCompare(b.name),
};

const KIND: Record<string, string> = {
  vc: 'Venture capital',
  angel_group: 'Angel group',
  accelerator: 'Accelerator',
  exchange: 'Exchange',
  foundation: 'Foundation',
  dao: 'DAO',
  corporate: 'Corporate',
  company: 'Company',
  other: 'Other',
  person: 'Individual (angel)',
  unclassified: 'Not classified yet',
};

export default async function InvestorsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [all, state] = await Promise.all([investorRows(), importState()]);
  const q = normalizeName(one(params.q));
  const kind = one(params.kind);
  const category = one(params.category);
  const round = one(params.round);
  const active = one(params.active);
  const sort = SORTS[one(params.sort)] ? one(params.sort) : 'deals';
  const kindOf = (i: InvestorRow) => (i.type === 'person' ? 'person' : (i.kind ?? 'unclassified'));

  const pass = (i: InvestorRow, except?: string) =>
    (!q || normalizeName(i.name).includes(q)) &&
    (except === 'kind' || !kind || kindOf(i) === kind) &&
    (except === 'category' || !category || i.categories.includes(category)) &&
    (except === 'round' || !round || i.roundTypes.includes(round)) &&
    (except === 'active' || !active || i.last12m > 0);
  const matched = all
    .filter((i) => pass(i))
    .sort((a, b) => SORTS[sort]!(a, b) || a.name.localeCompare(b.name));
  const facet = (
    except: string,
    values: (i: InvestorRow) => readonly string[],
    label: (v: string) => string = (v) => v,
  ) => {
    const counts = new Map<string, number>();
    for (const i of all.filter((x) => pass(x, except)))
      for (const v of new Set(values(i))) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts.entries()]
      .map(([value, count]) => ({ value, label: label(value), count }))
      .sort((a, b) => b.count - a.count);
  };

  const pages = Math.max(1, Math.ceil(matched.length / PAGE));
  const page = Math.min(pageOf(params), pages);
  const shown = matched.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="mr-container">
      <PageHead
        title="Investors"
        lead="Funds, firms and angels named in Solana funding rounds, ranked by how many they have joined. Each one links to its portfolio, its rounds and who it invests alongside."
        meta={<span>{all.length.toLocaleString('en-US')} investors</span>}
      />
      {all.length === 0 ? (
        <Building
          what="The investor directory"
          running={state.running || state.pending.length > 0}
        />
      ) : (
        <div className="rx-db">
          <div className="rx-filters" aria-label="Filters">
            <FacetGroup
              title="Type"
              param="kind"
              options={facet(
                'kind',
                (i) => [kindOf(i)],
                (v) => KIND[v] ?? v,
              )}
              base={BASE}
              params={params}
            />
            <FacetGroup
              title="Invests in"
              param="category"
              options={facet('category', (i) => i.categories)}
              base={BASE}
              params={params}
            />
            <FacetGroup
              title="Round type"
              param="round"
              options={facet('round', (i) => i.roundTypes)}
              base={BASE}
              params={params}
            />
            <FacetGroup
              title="Activity"
              param="active"
              options={[
                {
                  value: '12m',
                  label: 'Invested in the last 12 months',
                  count: all.filter((i) => pass(i, 'active') && i.last12m > 0).length,
                },
              ]}
              base={BASE}
              params={params}
            />
          </div>
          <div>
            <SearchBox
              base={BASE}
              params={params}
              placeholder="Search investors"
              label="Search investors"
            />
            <div className="rx-results-head">
              <p className="rx-results-count" role="status">
                <strong>{matched.length.toLocaleString('en-US')}</strong> investors
              </p>
              <ActiveFilters
                base={BASE}
                params={params}
                labels={{
                  q: (v) => `“${v}”`,
                  kind: (v) => KIND[v] ?? v,
                  category: (v) => v,
                  round: (v) => `${v} rounds`,
                  active: () => 'Active in 12 months',
                }}
              />
            </div>
            {shown.length === 0 ? (
              <p className="rx-empty">No investor matches these filters.</p>
            ) : (
              <div className="rx-table-wrap">
                <table className="rx-table">
                  <caption className="sr-only">Investors, {matched.length} results</caption>
                  <thead>
                    <tr>
                      <th className="is-rank">#</th>
                      <SortHeader base={BASE} params={params} sort="name" current={sort}>
                        Investor
                      </SortHeader>
                      <SortHeader base={BASE} params={params} sort="deals" current={sort} numeric>
                        Deals
                      </SortHeader>
                      <SortHeader base={BASE} params={params} sort="leads" current={sort} numeric>
                        Led
                      </SortHeader>
                      <SortHeader base={BASE} params={params} sort="recent" current={sort} numeric>
                        12 months
                      </SortHeader>
                      <th>Recent portfolio</th>
                      <SortHeader base={BASE} params={params} sort="latest" current={sort}>
                        Latest deal
                      </SortHeader>
                      <th>Profile</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((i, n) => (
                      <tr key={`${i.type}:${i.id}`}>
                        <td className="is-rank">{(page - 1) * PAGE + n + 1}</td>
                        <td>
                          <Link href={partyHref(i)} className="rx-entity" prefetch={false}>
                            <Avatar
                              src={i.imageUrl}
                              name={i.name}
                              size={28}
                              shape={i.type === 'person' ? 'round' : 'square'}
                            />
                            <span className="rx-entity-text">
                              <span className="rx-entity-name">{i.name}</span>
                              <span className="rx-entity-sub">{KIND[kindOf(i)]}</span>
                            </span>
                          </Link>
                        </td>
                        <td className="is-num">{i.deals}</td>
                        <td className="is-num">{i.leads || <span className="rx-muted">—</span>}</td>
                        <td className="is-num">
                          {i.last12m || <span className="rx-muted">—</span>}
                        </td>
                        <td>
                          <span className="rx-logos">
                            {i.recent.map((p) => (
                              <Link
                                key={p.slug}
                                href={projectHref(p.slug)}
                                title={p.name}
                                prefetch={false}
                                className="rx-logo-link"
                              >
                                <Avatar src={p.logoUrl} name={p.name} size={22} shape="square" />
                                <span className="sr-only">{p.name}</span>
                              </Link>
                            ))}
                          </span>
                        </td>
                        <td className="mr-num">{fmtMonth(i.lastDeal)}</td>
                        <td>
                          <ReviewBadge status={i.reviewStatus} checkedAt={i.checkedAt} compact />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pager base={BASE} params={params} current={page} pages={pages} />
          </div>
        </div>
      )}
    </div>
  );
}
