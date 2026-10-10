import { findPersonId, loadPersonProfile } from '@marketroom/db';
import { apiError, apiJson } from '@/lib/api';
import { researchDb } from '@/lib/research';

/** `GET /api/v1/people/{slug}` — a person, their projects, organisations and investments, with sources. */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await researchDb();
  const found = await findPersonId(db, slug);
  if (found.kind === 'redirect')
    return apiJson({ redirect: `/api/v1/people/${found.slug}` }, { status: 301 });
  if (found.kind === 'missing') return apiError(404, `No person ${slug}`);
  const profile = await loadPersonProfile(db, found.value);
  return profile ? apiJson(profile) : apiError(404, `No person ${slug}`);
}
