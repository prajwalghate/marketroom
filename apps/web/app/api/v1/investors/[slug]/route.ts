import { findOrganizationId, loadInvestorProfile } from '@marketroom/db';
import { apiError, apiJson } from '@/lib/api';
import { researchDb } from '@/lib/research';

/** `GET /api/v1/investors/{slug}` — an investor's team, portfolio, rounds and co-investors, with sources. */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = await researchDb();
  const found = await findOrganizationId(db, slug);
  if (found.kind === 'redirect')
    return apiJson({ redirect: `/api/v1/investors/${found.slug}` }, { status: 301 });
  if (found.kind === 'missing') return apiError(404, `No investor ${slug}`);
  const profile = await loadInvestorProfile(db, found.value);
  return profile ? apiJson(profile) : apiError(404, `No investor ${slug}`);
}
