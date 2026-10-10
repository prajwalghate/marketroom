import { findProjectId, loadProjectProfile } from '@marketroom/db';
import { apiError, apiJson } from '@/lib/api';
import { researchDb } from '@/lib/research';

/**
 * `GET /api/v1/projects/{slug}` — one project with every connected record:
 * team, rounds and their investors, programs and their activity estimates,
 * tokens and their latest market snapshot, news, events, and each source with
 * what it supports.
 */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await researchDb();
  const found = await findProjectId(db, slug);
  if (found.kind === 'redirect')
    return apiJson({ redirect: `/api/v1/projects/${found.slug}` }, { status: 301 });
  if (found.kind === 'missing') return apiError(404, `No project ${slug}`);
  const profile = await loadProjectProfile(db, found.value);
  if (!profile) return apiError(404, `No project ${slug}`);
  return apiJson(profile);
}
