import { queryDirectory } from '@marketroom/db';
import { apiJson, intParam } from '@/lib/api';
import { directoryRows } from '@/lib/research';

/**
 * `GET /api/v1/projects` — the project directory, with the same filters as the
 * page: `q, category, status, round, investor, activity, funded, review,
 * sort (tvl | raised | latest | activity | checked | name), page, limit`.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  const all = await directoryRows();
  const pageSize = intParam(p.get('limit'), 50, 500);
  const result = queryDirectory(
    all,
    {
      q: p.get('q') ?? '',
      category: p.get('category') ?? '',
      status: p.get('status') ?? '',
      round: p.get('round') ?? '',
      investor: p.get('investor') ?? '',
      activity: p.get('activity') ?? '',
      funded: p.get('funded') ?? '',
      review: p.get('review') ?? '',
      sort: p.get('sort') ?? 'tvl',
      page: intParam(p.get('page'), 1, 10_000),
    },
    { pageSize },
  );
  return apiJson({
    total: result.total,
    page: result.page,
    pages: result.pages,
    sort: result.sort,
    projects: result.rows.map(({ searchText: _searchText, ...row }) => ({
      ...row,
      url: `/projects/${row.slug}`,
    })),
    facets: result.facets,
  });
}
