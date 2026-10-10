import { formatCompactUsd, formatCount, formatPrice, normalizeName } from '@marketroom/core';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ProjectLink, tokenHref } from '@/components/research/Entities';
import { SearchBox } from '@/components/research/Filters';
import { ago } from '@/components/research/format';
import { Building } from '@/components/research/Profile';
import { Avatar } from '@/components/sol/Avatar';
import { Pager } from '@/components/sol/Filters';
import { Delta, PageHead } from '@/components/sol/primitives';
import { one, pageOf, type Params } from '@/lib/query';
import { importState, tokenRows } from '@/lib/research';

export const metadata: Metadata = {
  title: 'Tokens',
  description:
    'Tokens of Solana projects, with price, market cap, volume and holders — each labelled with its provider and time.',
};

export const dynamic = 'force-dynamic';

const BASE = '/tokens';
const PAGE = 50;

export default async function TokensPage({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const [all, state] = await Promise.all([tokenRows(), importState()]);
  const q = normalizeName(one(params.q));
  const matched = all.filter(
    (t) =>
      !q ||
      normalizeName(`${t.symbol ?? ''} ${t.name ?? ''} ${t.project?.name ?? ''}`).includes(q) ||
      t.mint.startsWith(one(params.q)),
  );
  const pages = Math.max(1, Math.ceil(matched.length / PAGE));
  const page = Math.min(pageOf(params), pages);
  const shown = matched.slice((page - 1) * PAGE, page * PAGE);
  const fetched = Math.max(0, ...all.map((t) => t.market?.capturedAt ?? 0));

  return (
    <div className="mr-container">
      <PageHead
        title="Tokens"
        lead="Every token mapped to a Solana project, by market cap. Figures are Jupiter’s, refreshed every quarter hour; each token page shows when."
        meta={fetched ? <span>Market data {ago(fetched)}</span> : null}
      />
      {all.length === 0 ? (
        <Building what="Token data" running={state.running || state.pending.length > 0} />
      ) : (
        <>
          <SearchBox
            base={BASE}
            params={params}
            placeholder="Search by symbol, name, project or mint"
            label="Search tokens"
          />
          <div className="rx-table-wrap">
            <table className="rx-table">
              <caption className="sr-only">Tokens by market cap</caption>
              <thead>
                <tr>
                  <th className="is-rank">#</th>
                  <th>Token</th>
                  <th>Project</th>
                  <th className="is-num">Price</th>
                  <th className="is-num">24h</th>
                  <th className="is-num">Market cap</th>
                  <th className="is-num">Volume 24h</th>
                  <th className="is-num">Liquidity</th>
                  <th className="is-num">Holders</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((t, i) => (
                  <tr key={t.id}>
                    <td className="is-rank">{(page - 1) * PAGE + i + 1}</td>
                    <td>
                      <Link href={tokenHref(t.mint)} className="rx-entity" prefetch={false}>
                        <Avatar src={t.logoUrl} name={t.symbol ?? t.mint} size={24} />
                        <span className="rx-entity-text">
                          <span className="rx-entity-name">{t.symbol ?? t.mint.slice(0, 6)}</span>
                          {t.name && <span className="rx-entity-sub">{t.name}</span>}
                        </span>
                      </Link>
                    </td>
                    <td>
                      {t.project ? (
                        <ProjectLink project={t.project} size={20} />
                      ) : (
                        <span className="rx-muted">Unmapped</span>
                      )}
                    </td>
                    <td className="is-num">{formatPrice(t.market?.price ?? null)}</td>
                    <td className="is-num">
                      <Delta value={t.market?.change24h} />
                    </td>
                    <td className="is-num">{formatCompactUsd(t.market?.marketCap ?? null)}</td>
                    <td className="is-num">{formatCompactUsd(t.market?.volume24h ?? null)}</td>
                    <td className="is-num">{formatCompactUsd(t.market?.liquidity ?? null)}</td>
                    <td className="is-num">{formatCount(t.market?.holders ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager base={BASE} params={params} current={page} pages={pages} />
        </>
      )}
    </div>
  );
}
