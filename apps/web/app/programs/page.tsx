import { normalizeName } from '@marketroom/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { programHref, ProjectLink } from '@/components/research/Entities';
import { Estimate, ReviewBadge } from '@/components/research/Evidence';
import { FacetGroup, SearchBox } from '@/components/research/Filters';
import { ago, fmtRate, shortAddress } from '@/components/research/format';
import { Building } from '@/components/research/Profile';
import { Pager } from '@/components/sol/Filters';
import { PageHead } from '@/components/sol/primitives';
import { one, pageOf, type Params } from '@/lib/query';
import { importState, programRows } from '@/lib/research';

export const metadata: Metadata = {
  title: 'Solana programs',
  description:
    'Solana programs mapped to the projects that run them — upgradeability, verified builds, and estimated activity, each with its source.',
};

export const dynamic = 'force-dynamic';

const BASE = '/programs';
const PAGE = 50;

const LEVEL: Record<string, string> = {
  high: 'High',
  moderate: 'Moderate',
  low: 'Low',
  dormant: 'Dormant',
  unknown: 'Not measured',
};

export default async function ProgramsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [all, state] = await Promise.all([programRows(), importState()]);
  const q = normalizeName(one(params.q));
  const level = one(params.activity);
  const mapped = one(params.mapped);
  const verified = one(params.verified);
  const pass = (p: (typeof all)[number], except?: string) =>
    (!q ||
      normalizeName(
        `${p.name ?? ''} ${p.kind ?? ''} ${p.projects.map((x) => x.name).join(' ')}`,
      ).includes(q) ||
      p.address.startsWith(one(params.q))) &&
    (except === 'activity' || !level || p.level === level) &&
    (except === 'mapped' ||
      !mapped ||
      (mapped === 'yes' ? p.projects.length > 0 : p.projects.length === 0)) &&
    (except === 'verified' ||
      !verified ||
      (verified === 'yes' ? p.verifiedBuild === true : p.verifiedBuild !== true));
  const matched = all.filter((p) => pass(p));
  const count = (except: string, test: (p: (typeof all)[number]) => boolean) =>
    all.filter((p) => pass(p, except) && test(p)).length;
  const pages = Math.max(1, Math.ceil(matched.length / PAGE));
  const page = Math.min(pageOf(params), pages);
  const shown = matched.slice((page - 1) * PAGE, page * PAGE);

  return (
    <div className="mr-container">
      <PageHead
        title="Solana programs"
        lead="On-chain programs and the projects behind them. Mappings come from verified-build registries, swap-venue labels and editors; activity is estimated from recent transaction signatures and always marked as an estimate."
        meta={<span>{all.length.toLocaleString('en-US')} programs</span>}
      />
      {all.length === 0 ? (
        <Building what="Program data" running={state.running || state.pending.length > 0} />
      ) : (
        <div className="rx-db">
          <div className="rx-filters" aria-label="Filters">
            <FacetGroup
              title="Activity"
              param="activity"
              options={Object.entries(LEVEL).map(([value, label]) => ({
                value,
                label,
                count: count('activity', (p) => p.level === value),
              }))}
              base={BASE}
              params={params}
            />
            <FacetGroup
              title="Mapped to a project"
              param="mapped"
              options={[
                {
                  value: 'yes',
                  label: 'Mapped',
                  count: count('mapped', (p) => p.projects.length > 0),
                },
                {
                  value: 'no',
                  label: 'Not mapped',
                  count: count('mapped', (p) => p.projects.length === 0),
                },
              ]}
              base={BASE}
              params={params}
            />
            <FacetGroup
              title="Verified build"
              param="verified"
              options={[
                {
                  value: 'yes',
                  label: 'Verified source',
                  count: count('verified', (p) => p.verifiedBuild === true),
                },
                {
                  value: 'no',
                  label: 'Not verified',
                  count: count('verified', (p) => p.verifiedBuild !== true),
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
              placeholder="Search by name, project or address"
              label="Search programs"
            />
            <p className="rx-results-count" role="status">
              <strong>{matched.length.toLocaleString('en-US')}</strong> programs
            </p>
            <div className="rx-table-wrap">
              <table className="rx-table">
                <caption className="sr-only">Solana programs</caption>
                <thead>
                  <tr>
                    <th>Program</th>
                    <th>Project</th>
                    <th>Upgradeable</th>
                    <th>Verified build</th>
                    <th className="is-num">Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link
                          href={programHref(p.address)}
                          className="rx-strong-link"
                          prefetch={false}
                        >
                          {p.name ?? shortAddress(p.address)}
                        </Link>
                        <span className="rx-under mr-num">
                          {shortAddress(p.address)}
                          {p.kind ? ` · ${p.kind}` : ''}
                        </span>
                      </td>
                      <td>
                        {p.projects.length === 0 ? (
                          <span className="rx-muted">Not mapped</span>
                        ) : (
                          <span className="rx-roles">
                            {p.projects.slice(0, 2).map((x) => (
                              <span key={x.id}>
                                <ProjectLink project={x} size={18} />{' '}
                                {x.reviewStatus !== 'verified' && (
                                  <ReviewBadge status={x.reviewStatus} compact />
                                )}
                              </span>
                            ))}
                          </span>
                        )}
                      </td>
                      <td>
                        {p.loader === 'upgradeable' ? (
                          p.upgradeAuthority ? (
                            'Yes'
                          ) : (
                            'No — revoked'
                          )
                        ) : p.loader === 'immutable' ? (
                          'No'
                        ) : (
                          <span className="rx-muted">—</span>
                        )}
                      </td>
                      <td>
                        {p.verifiedBuild ? (
                          'Verified'
                        ) : p.verifiedBuild === false ? (
                          <span className="rx-muted">No longer</span>
                        ) : (
                          <span className="rx-muted">—</span>
                        )}
                      </td>
                      <td className="is-num">
                        {p.activityAt ? (
                          <>
                            <Estimate method="From the program’s latest transaction signatures on a public RPC node.">
                              {fmtRate(p.txPerHour)}
                            </Estimate>
                            <span className="rx-sub-num">{ago(p.activityAt)}</span>
                          </>
                        ) : (
                          <span className="rx-muted">Not measured</span>
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
      )}
    </div>
  );
}
