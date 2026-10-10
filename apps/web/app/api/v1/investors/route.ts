import { normalizeName } from '@marketroom/core';
import { apiJson, intParam } from '@/lib/api';
import { investorRows } from '@/lib/research';

/** `GET /api/v1/investors?q=&page=&limit=` — investors by number of Solana deals. */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const q = normalizeName(p.get('q') ?? '');
  const limit = intParam(p.get('limit'), 50, 500);
  const page = intParam(p.get('page'), 1, 10_000);
  const all = (await investorRows())
    .filter((r) => !q || normalizeName(r.name).includes(q))
    .sort((a, b) => b.deals - a.deals);
  return apiJson({
    total: all.length,
    page,
    investors: all.slice((page - 1) * limit, page * limit).map((r) => ({
      ...r,
      url: r.type === 'person' ? `/people/${r.slug}` : `/investors/${r.slug}`,
    })),
  });
}
