import { apiJson, intParam } from '@/lib/api';
import { roundRows } from '@/lib/research';

/**
 * `GET /api/v1/rounds?since=YYYY-MM-DD&round=Seed&page=&limit=` — funding
 * rounds, newest first, each with its investors and strongest source.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const since = p.get('since') ?? '';
  const type = p.get('round') ?? '';
  const limit = intParam(p.get('limit'), 50, 500);
  const page = intParam(p.get('page'), 1, 10_000);
  const all = (await roundRows()).filter(
    (r) => (!since || r.announcedOn >= since) && (!type || r.roundType === type),
  );
  return apiJson({
    total: all.length,
    page,
    rounds: all
      .slice((page - 1) * limit, page * limit)
      .map((r) => ({ ...r, url: `/rounds/${r.slug}` })),
  });
}
