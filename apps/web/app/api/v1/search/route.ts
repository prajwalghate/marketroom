import { search, searchCounts, type SearchType } from '@marketroom/db';
import { apiError, apiJson, intParam } from '@/lib/api';
import { researchDb } from '@/lib/research';

/**
 * `GET /api/v1/search?q=kamino&types=project,investor&limit=5` — ranked hits
 * across record types. Add `counts=1` for how many of each type match.
 */
export const dynamic = 'force-dynamic';

const TYPES: SearchType[] = ['project', 'person', 'investor', 'token', 'program'];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').slice(0, 100);
  if (!q.trim()) return apiError(400, 'Pass a query: ?q=…');
  const types = (url.searchParams.get('types') ?? '')
    .split(',')
    .filter((t): t is SearchType => TYPES.includes(t as SearchType));
  const db = await researchDb();
  const [results, counts] = await Promise.all([
    search(db, q, {
      perType: intParam(url.searchParams.get('limit'), 6, 50),
      types: types.length ? types : undefined,
    }),
    url.searchParams.get('counts') === '1' ? searchCounts(db, q) : Promise.resolve(undefined),
  ]);
  return apiJson({ query: q, results, ...(counts ? { counts } : {}) }, { maxAge: 30 });
}
