import { loadProgramProfile } from '@marketroom/db';
import { apiError, apiJson } from '@/lib/api';
import { researchDb } from '@/lib/research';

/** `GET /api/v1/programs/{address}` — a program's projects, on-chain facts and activity estimates, with sources. */
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const profile = await loadProgramProfile(await researchDb(), address);
  return profile ? apiJson(profile, { maxAge: 120 }) : apiError(404, `No program ${address}`);
}
