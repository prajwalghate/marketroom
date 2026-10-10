import 'server-only';

import {
  jobStatuses,
  loadDirectory,
  loadImportCounts,
  loadInvestors,
  loadPeople,
  loadPrograms,
  loadRecentRoles,
  loadRounds,
  loadTokens,
  type Db,
} from '@marketroom/db';
import { after } from 'next/server';
import { cachedRead, getDb, nudgeUpkeep, upkeepRunning } from './db';

/**
 * What the research pages read. Whole-table lists are cached in process for
 * a minute (edits and finished imports clear the cache); profiles are read
 * fresh, since they are a handful of indexed queries.
 *
 * Every read also nudges upkeep: the import schedule is checked after the
 * response is sent, so keeping the data current costs a reader nothing.
 */

function keepFresh() {
  try {
    after(() => nudgeUpkeep() ?? undefined);
  } catch {
    // Outside a request (a script, a test): nudge directly.
    void nudgeUpkeep();
  }
}

export async function researchDb(): Promise<Db> {
  keepFresh();
  return getDb();
}

const MINUTE = 60_000;

export const directoryRows = async () => {
  keepFresh();
  return cachedRead('directory', MINUTE, async () => loadDirectory(await getDb()));
};
export const investorRows = async () => {
  keepFresh();
  return cachedRead('investors', MINUTE, async () => loadInvestors(await getDb()));
};
export const roundRows = async () => {
  keepFresh();
  return cachedRead('rounds', MINUTE, async () => loadRounds(await getDb()));
};
export const peopleRows = async () => {
  keepFresh();
  return cachedRead('people', MINUTE, async () => loadPeople(await getDb()));
};
export const programRows = async () => {
  keepFresh();
  return cachedRead('programs', MINUTE, async () => loadPrograms(await getDb()));
};
export const recentRoles = async () => {
  keepFresh();
  return cachedRead('recent-roles', MINUTE, async () => loadRecentRoles(await getDb(), 10));
};
export const tokenRows = async () => {
  keepFresh();
  return cachedRead('tokens', MINUTE, async () => loadTokens(await getDb()));
};

export interface ImportState {
  readonly running: boolean;
  /** Jobs that have never finished: their data is not in yet. */
  readonly pending: readonly string[];
  readonly counts: {
    projects: number;
    rounds: number;
    people: number;
    programs: number;
    news: number;
    events: number;
  };
  readonly lastImportAt: number | null;
}

/** How far the imports have got — for "still importing" notices and freshness lines. */
export async function importState(): Promise<ImportState> {
  keepFresh();
  return cachedRead('import-state', 15_000, async () => {
    const db = await getDb();
    const [jobs, counts] = await Promise.all([jobStatuses(db), loadImportCounts(db)]);
    return {
      running: upkeepRunning(),
      pending: jobs.filter((j) => !j.lastOk).map((j) => j.name),
      counts: {
        projects: counts.projects,
        rounds: counts.rounds,
        people: counts.people,
        programs: counts.programs,
        news: counts.news,
        events: counts.events,
      },
      lastImportAt: counts.lastImportAt,
    };
  });
}
