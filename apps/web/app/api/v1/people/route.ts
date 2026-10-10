import { normalizeName } from '@marketroom/core';
import { apiJson, intParam } from '@/lib/api';
import { peopleRows } from '@/lib/research';

/** `GET /api/v1/people?q=&page=&limit=` — people and what they are connected to. */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const q = normalizeName(p.get('q') ?? '');
  const limit = intParam(p.get('limit'), 50, 500);
  const page = intParam(p.get('page'), 1, 10_000);
  const all = (await peopleRows()).filter((r) => !q || normalizeName(r.name).includes(q));
  return apiJson({
    total: all.length,
    page,
    people: all
      .slice((page - 1) * limit, page * limit)
      .map((r) => ({ ...r, url: `/people/${r.slug}` })),
  });
}
