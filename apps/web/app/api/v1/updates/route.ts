import { loadUpdates } from '@marketroom/db';
import { apiJson, intParam, parseWatch } from '@/lib/api';
import { researchDb } from '@/lib/research';

/**
 * `GET /api/v1/updates?watch=project:drift,organization:multicoin-capital&since=<ms>`
 *
 * What changed: rounds added, people linked, programs mapped, profiles checked,
 * and news that mentions a record. Without `watch`, everything public.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const since = Number(url.searchParams.get('since')) || undefined;
  const updates = await loadUpdates(await researchDb(), {
    since,
    limit: intParam(url.searchParams.get('limit'), 50, 200),
    watch: parseWatch(url.searchParams.get('watch')),
  });
  return apiJson({ updates }, { maxAge: 60 });
}
