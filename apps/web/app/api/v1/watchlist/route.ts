import { formatCompactUsd } from '@marketroom/core';
import { loadUpdates } from '@marketroom/db';
import { apiJson, parseWatch } from '@/lib/api';
import { directoryRows, investorRows, peopleRows, researchDb, tokenRows } from '@/lib/research';

/**
 * `GET /api/v1/watchlist?items=project:drift,person:cindy-leow,investor:multicoin-capital,token:<mint>`
 *
 * Summaries of a reader's watched records and the updates to them. The list
 * itself lives in the reader's browser; this only answers for what it is sent.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const raw = (new URL(request.url).searchParams.get('items') ?? '')
    .split(',')
    .filter(Boolean)
    .slice(0, 200);
  const want = (kind: string) =>
    raw.filter((r) => r.startsWith(`${kind}:`)).map((r) => r.slice(kind.length + 1));
  const legacy = raw.filter((r) => !r.includes(':'));
  const [projects, investors, people, tokens] = await Promise.all([
    directoryRows(),
    investorRows(),
    peopleRows(),
    tokenRows(),
  ]);

  const projectSlugs = new Set([...want('project'), ...legacy]);
  const items = [
    ...projects
      .filter((p) => projectSlugs.has(p.slug))
      .map((p) => ({
        kind: 'project',
        slug: p.slug,
        name: p.name,
        imageUrl: p.logoUrl,
        href: `/projects/${p.slug}`,
        detail: p.tagline ?? p.category,
        price: p.token?.price ?? null,
        change24h: p.token?.change24h ?? null,
        tvl: p.tvlSolana,
        raised: p.raisedUsd,
        latest: p.latestRound
          ? `${p.latestRound.roundType ?? 'Round'} ${p.latestRound.announcedOn.slice(0, 7)}`
          : null,
      })),
    ...investors
      .filter((i) => i.type === 'organization' && want('investor').includes(i.slug))
      .map((i) => ({
        kind: 'investor',
        slug: i.slug,
        name: i.name,
        imageUrl: i.imageUrl,
        href: `/investors/${i.slug}`,
        detail: `${i.deals} deals · ${i.last12m} in 12 months`,
        price: null,
        change24h: null,
        tvl: null,
        raised: null,
        latest: i.lastDeal ? `Last deal ${i.lastDeal.slice(0, 7)}` : null,
      })),
    ...people
      .filter((p) => want('person').includes(p.slug))
      .map((p) => ({
        kind: 'person',
        slug: p.slug,
        name: p.name,
        imageUrl: p.avatarUrl,
        href: `/people/${p.slug}`,
        detail: p.headline ?? p.roles[0]?.name ?? null,
        price: null,
        change24h: null,
        tvl: null,
        raised: null,
        latest: p.investments ? `${p.investments} investments` : null,
      })),
    ...tokens
      .filter((t) => want('token').includes(t.mint))
      .map((t) => ({
        kind: 'token',
        slug: t.mint,
        name: t.symbol ?? t.mint.slice(0, 6),
        imageUrl: t.logoUrl,
        href: `/tokens/${t.mint}`,
        detail: t.project?.name ?? t.name,
        price: t.market?.price ?? null,
        change24h: t.market?.change24h ?? null,
        tvl: null,
        raised: null,
        latest: t.market?.marketCap ? `Market cap ${formatCompactUsd(t.market.marketCap)}` : null,
      })),
  ];

  const watch = parseWatch(
    raw
      .filter((r) => !r.startsWith('token:'))
      .map((r) => (r.includes(':') ? r : `project:${r}`))
      .join(','),
  );
  const db = await researchDb();
  const updates = watch?.length ? await loadUpdates(db, { watch, limit: 60 }) : [];
  return apiJson({ items, updates }, { maxAge: 30 });
}
