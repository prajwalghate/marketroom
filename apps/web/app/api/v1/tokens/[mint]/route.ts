import { loadTokenProfile } from '@marketroom/db';
import { apiError, apiJson } from '@/lib/api';
import { researchDb } from '@/lib/research';

/** `GET /api/v1/tokens/{mint}` — a token, its project, its latest market snapshot and snapshot history. */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ mint: string }> }) {
  const { mint } = await params;
  const profile = await loadTokenProfile(await researchDb(), mint);
  return profile ? apiJson(profile, { maxAge: 120 }) : apiError(404, `No token ${mint}`);
}
