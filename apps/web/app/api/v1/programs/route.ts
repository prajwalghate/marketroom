import { apiJson, intParam } from '@/lib/api';
import { programRows } from '@/lib/research';

/** `GET /api/v1/programs?page=&limit=` — Solana programs, their projects, and estimated activity. */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const limit = intParam(p.get('limit'), 50, 500);
  const page = intParam(p.get('page'), 1, 10_000);
  const all = await programRows();
  return apiJson({
    total: all.length,
    page,
    note: 'txPerHour is an estimate from recent transaction signatures; see each program for its method.',
    programs: all
      .slice((page - 1) * limit, page * limit)
      .map((r) => ({ ...r, url: `/programs/${r.address}` })),
  });
}
