import { findRoundId, loadRoundProfile } from '@marketroom/db';
import { apiError, apiJson } from '@/lib/api';
import { researchDb } from '@/lib/research';

/** `GET /api/v1/rounds/{slug}` — a round's amount, date, type, investors, and the source for each fact. */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await researchDb();
  const found = await findRoundId(db, slug);
  if (found.kind === 'redirect')
    return apiJson({ redirect: `/api/v1/rounds/${found.slug}` }, { status: 301 });
  if (found.kind === 'missing') return apiError(404, `No round ${slug}`);
  const profile = await loadRoundProfile(db, found.value);
  return profile ? apiJson(profile) : apiError(404, `No round ${slug}`);
}
