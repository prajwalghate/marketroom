import { runDueJobs } from '@marketroom/db';
import { NextResponse } from 'next/server';
import { clearReadCache, getDb, jobEnv } from '@/lib/db';

/**
 * The import schedule, for a cron service to call (Vercel Cron sends
 * `Authorization: Bearer $CRON_SECRET`). Runs whatever jobs are due and
 * reports what ran. Without a configured secret it only answers in development.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (secret ? auth !== `Bearer ${secret}` : process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const ran = await runDueJobs(await getDb(), { env: jobEnv(), requestedBy: 'cron' });
  if (ran.length) clearReadCache();
  return NextResponse.json({
    ran: ran.map((r) => ({ job: r.job, status: r.status, stats: r.stats, error: r.error })),
  });
}
