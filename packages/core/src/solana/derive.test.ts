import { describe, expect, it } from 'vitest';
import {
  coInvestors,
  EMPTY_PROJECT_FILTERS,
  filterProjects,
  fundingByMonth,
  fundingInWindow,
  investorsFromRounds,
  projectRows,
  sizeMix,
  slugify,
  sortProjects,
} from './derive';
import type { FundingRound, Project, TokenMarket } from './types';

const day = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 10);

const round = (over: Partial<FundingRound> & { projectName: string }): FundingRound => ({
  id: `${over.projectName}-${over.date ?? NOW}`,
  date: NOW - day,
  projectSlug: slugify(over.projectName),
  round: 'Seed',
  amount: null,
  valuation: null,
  category: 'DeFi',
  leadInvestors: [],
  otherInvestors: [],
  source: null,
  ...over,
});

const project = (over: Partial<Project> & { name: string }): Project => ({
  slug: slugify(over.name),
  logo: null,
  description: null,
  category: 'Dexs',
  chains: ['Solana'],
  links: { website: null, twitter: null, github: [] },
  symbol: null,
  geckoId: null,
  tokenMint: null,
  tvlSolana: null,
  tvlTotal: null,
  tvlChange1d: null,
  tvlChange7d: null,
  listedAt: null,
  parentSlug: null,
  sourceIds: [],
  sourceSlugs: [],
  audits: null,
  products: [],
  ...over,
  tags: over.tags ?? [over.category ?? 'Dexs'],
});

describe('slugify', () => {
  it('makes stable, URL-safe slugs', () => {
    expect(slugify('Polychain Capital')).toBe('polychain-capital');
    expect(slugify('  a16z crypto ')).toBe('a16z-crypto');
    expect(slugify('Placeholder & Co.')).toBe('placeholder-and-co');
    expect(slugify('Ñandú Ventures')).toBe('nandu-ventures');
  });
});

describe('investorsFromRounds', () => {
  const rounds = [
    round({
      projectName: 'Drift',
      date: NOW - 300 * day,
      amount: 23.5e6,
      leadInvestors: ['Polychain Capital'],
      otherInvestors: ['Multicoin Capital'],
    }),
    round({
      projectName: 'Kamino',
      date: NOW - 30 * day,
      amount: 10e6,
      leadInvestors: ['Multicoin capital'],
    }),
    round({
      projectName: 'Drift',
      date: NOW - 5 * day,
      amount: null,
      otherInvestors: ['Multicoin Capital', 'Polychain Capital'],
    }),
  ];
  const investors = investorsFromRounds(rounds);
  const multicoin = investors.find((i) => i.slug === 'multicoin-capital')!;

  it('merges spellings into one investor and keeps the most common name', () => {
    expect(investors.filter((i) => i.slug === 'multicoin-capital')).toHaveLength(1);
    expect(multicoin.name).toBe('Multicoin Capital');
  });

  it('counts deals, leads, distinct projects and disclosed volume', () => {
    expect(multicoin.rounds).toHaveLength(3);
    expect(multicoin.leadCount).toBe(1);
    expect(multicoin.portfolioCount).toBe(2);
    expect(multicoin.roundVolume).toBe(33.5e6);
    expect(multicoin.lastDeal).toBe(NOW - 5 * day);
    expect(multicoin.firstDeal).toBe(NOW - 300 * day);
  });

  it('finds co-investors by how often they share a round', () => {
    expect(coInvestors(multicoin)).toEqual([
      { slug: 'polychain-capital', name: 'Polychain Capital', together: 2 },
    ]);
  });

  it('never counts an investor twice in one round', () => {
    const dup = investorsFromRounds([
      round({ projectName: 'X', leadInvestors: ['Jump Crypto'], otherInvestors: ['Jump Crypto'] }),
    ]);
    expect(dup[0]!.rounds).toHaveLength(1);
    expect(dup[0]!.leadCount).toBe(1);
  });
});

describe('funding over time', () => {
  const rounds = [
    round({ projectName: 'A', date: Date.UTC(2026, 8, 15), amount: 5e6 }),
    round({ projectName: 'B', date: Date.UTC(2026, 8, 20), amount: null }),
    round({ projectName: 'C', date: Date.UTC(2026, 6, 2), amount: 2e6 }),
  ];

  it('buckets by calendar month, keeping empty months', () => {
    const months = fundingByMonth(rounds, 4, NOW);
    expect(months.map((m) => m.month)).toEqual(['2026-07', '2026-08', '2026-09', '2026-10']);
    expect(months.map((m) => m.rounds)).toEqual([1, 0, 2, 0]);
    // An undisclosed round counts as a round, never as $0 raised.
    expect(months[2]!.amount).toBe(5e6);
  });

  it('sums a trailing window and finds its largest disclosed round', () => {
    const w = fundingInWindow(rounds, 30 * day, NOW);
    expect(w.rounds).toBe(2);
    expect(w.amount).toBe(5e6);
    expect(w.largest!.projectName).toBe('A');
  });

  it('gives undisclosed rounds their own size bucket', () => {
    const mix = sizeMix(rounds);
    expect(mix.find((b) => b.label === 'Undisclosed')!.count).toBe(1);
    expect(mix.find((b) => b.label === '$1M – $5M')!.count).toBe(1);
    expect(mix.find((b) => b.label === '$5M – $10M')!.count).toBe(1);
  });
});

describe('project rows', () => {
  const projects = [
    project({ name: 'Drift', tvlSolana: 400e6, geckoId: 'drift-protocol', symbol: 'DRIFT' }),
    project({ name: 'Quiet', tvlSolana: null, category: 'Lending' }),
    project({ name: 'Kamino', tvlSolana: 2e9, category: 'Lending' }),
  ];
  const markets = new Map<string, TokenMarket>([
    ['cg:drift-protocol', { key: 'cg:drift-protocol', marketCap: 300e6 } as TokenMarket],
  ]);
  const rounds = [
    round({ projectName: 'Drift', amount: 23.5e6, leadInvestors: ['Polychain Capital'] }),
    round({ projectName: 'Drift', amount: null }),
  ];
  const rows = projectRows(projects, markets, rounds);

  it('joins market data and sums only disclosed rounds', () => {
    const drift = rows.find((r) => r.project.slug === 'drift')!;
    expect(drift.market!.marketCap).toBe(300e6);
    expect(drift.rounds).toHaveLength(2);
    expect(drift.raised).toBe(23.5e6);
    expect(rows.find((r) => r.project.slug === 'kamino')!.raised).toBeNull();
  });

  it('sorts missing values last, never as zero', () => {
    expect(sortProjects(rows, 'tvl').map((r) => r.project.name)).toEqual([
      'Kamino',
      'Drift',
      'Quiet',
    ]);
  });

  it('filters by category, token, funding and investor', () => {
    const f = EMPTY_PROJECT_FILTERS;
    expect(filterProjects(rows, { ...f, categories: ['Lending'] })).toHaveLength(2);
    expect(filterProjects(rows, { ...f, hasToken: true }).map((r) => r.project.name)).toEqual([
      'Drift',
    ]);
    expect(filterProjects(rows, { ...f, funded: true })).toHaveLength(1);
    expect(filterProjects(rows, { ...f, investor: 'polychain-capital' })).toHaveLength(1);
    expect(filterProjects(rows, { ...f, query: 'kam' })).toHaveLength(1);
  });
});
