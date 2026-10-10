/**
 * Tokens and Solana programs: market snapshots and on-chain facts, each
 * labelled with the provider that reported it and when.
 */

import { activityLevel, type ActivityLevel } from '@marketroom/core';
import { sql } from 'drizzle-orm';
import { rows, type Executor } from '../client';
import type { ProgramRelation, ReviewStatus } from '../schema';
import { epoch, evidenceFor, evidenceOf, type EvidenceRef, type ProjectRef } from './common';
import {
  activityOf,
  programFacts,
  type ActivitySnapshot,
  type MarketSnapshot,
  type ProgramFacts,
  type RawProgramLink,
  type TokenLink,
} from './project';

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export interface TokenProfile {
  readonly token: TokenLink;
  readonly project: (ProjectRef & { tagline: string | null }) | null;
  /** Price history from our own snapshots, oldest first. */
  readonly history: readonly {
    t: number;
    price: number | null;
    volume24h: number | null;
    holders: number | null;
  }[];
}

export async function loadTokenProfile(db: Executor, mint: string): Promise<TokenProfile | null> {
  const [t] = await rows<{
    id: number;
    mint: string;
    symbol: string | null;
    name: string | null;
    logo_url: string | null;
    standard: string | null;
    decimals: number | null;
    is_primary: boolean;
    launched_at: number | null;
    review_status: ReviewStatus;
    checked_at: number | null;
    checked_by: string | null;
    project_id: number | null;
    project_slug: string | null;
    project_name: string | null;
    project_logo: string | null;
    category: string | null;
    tagline: string | null;
  }>(
    db,
    sql`select t.id, t.mint, t.symbol, t.name, t.logo_url, t.standard, t.decimals, t.is_primary,
          ${epoch('t.launched_at')} as launched_at, t.review_status, ${epoch('t.checked_at')} as checked_at,
          t.checked_by, p.id as project_id, p.slug as project_slug, p.name as project_name,
          p.logo_url as project_logo, p.category, p.tagline
        from tokens t left join projects p on p.id = t.project_id and p.merged_into_id is null
        where t.mint = ${mint} and t.review_status <> 'rejected'`,
  );
  if (!t) return null;
  const history = await rows<{
    t: number;
    price: number | null;
    volume_24h: number | null;
    holders: number | null;
    market_cap: number | null;
    fdv: number | null;
    liquidity: number | null;
    change_24h: number | null;
    provider: string;
    provider_updated_at: number | null;
  }>(
    db,
    sql`select ${epoch('captured_at')} as t, price, volume_24h, holders, market_cap, fdv, liquidity, change_24h,
          provider, ${epoch('provider_updated_at')} as provider_updated_at
        from market_snapshots where token_id = ${t.id} order by captured_at asc`,
  );
  const last = history[history.length - 1];
  const market: MarketSnapshot | null = last
    ? {
        price: last.price,
        marketCap: last.market_cap,
        fdv: last.fdv,
        volume24h: last.volume_24h,
        liquidity: last.liquidity,
        holders: last.holders,
        change24h: last.change_24h,
        provider: last.provider,
        providerUpdatedAt: last.provider_updated_at,
        capturedAt: last.t,
      }
    : null;
  const ev = await evidenceFor(db, [{ type: 'token', ids: [t.id] }]);
  return {
    token: {
      id: t.id,
      mint: t.mint,
      symbol: t.symbol,
      name: t.name,
      logoUrl: t.logo_url,
      standard: t.standard,
      decimals: t.decimals,
      isPrimary: t.is_primary,
      launchedAt: t.launched_at,
      reviewStatus: t.review_status,
      checkedAt: t.checked_at,
      checkedBy: t.checked_by,
      market,
      evidence: evidenceOf(ev, 'token', t.id),
    },
    project: t.project_id
      ? {
          id: t.project_id,
          slug: t.project_slug!,
          name: t.project_name!,
          logoUrl: t.project_logo,
          category: t.category,
          tagline: t.tagline,
        }
      : null,
    history: history.map((h) => ({
      t: h.t,
      price: h.price,
      volume24h: h.volume_24h,
      holders: h.holders,
    })),
  };
}

export interface TokenRow {
  readonly id: number;
  readonly mint: string;
  readonly symbol: string | null;
  readonly name: string | null;
  readonly logoUrl: string | null;
  readonly project: ProjectRef | null;
  readonly market: MarketSnapshot | null;
  readonly reviewStatus: ReviewStatus;
}

export async function loadTokens(db: Executor): Promise<TokenRow[]> {
  const found = await rows<{
    id: number;
    mint: string;
    symbol: string | null;
    name: string | null;
    logo_url: string | null;
    review_status: ReviewStatus;
    project_id: number | null;
    project_slug: string | null;
    project_name: string | null;
    project_logo: string | null;
    category: string | null;
    price: number | null;
    market_cap: number | null;
    fdv: number | null;
    volume_24h: number | null;
    liquidity: number | null;
    holders: number | null;
    change_24h: number | null;
    provider: string | null;
    provider_updated_at: number | null;
    captured_at: number | null;
  }>(
    db,
    sql`select t.id, t.mint, t.symbol, t.name, t.logo_url, t.review_status, p.id as project_id,
          p.slug as project_slug, p.name as project_name, p.logo_url as project_logo, p.category,
          s.price, s.market_cap, s.fdv, s.volume_24h, s.liquidity, s.holders, s.change_24h, s.provider,
          ${epoch('s.provider_updated_at')} as provider_updated_at, ${epoch('s.captured_at')} as captured_at
        from tokens t
        left join projects p on p.id = t.project_id and p.merged_into_id is null
        left join lateral (
          select * from market_snapshots ms where ms.token_id = t.id order by captured_at desc limit 1
        ) s on true
        where t.review_status <> 'rejected'
        order by s.market_cap desc nulls last`,
  );
  return found.map((r) => ({
    id: r.id,
    mint: r.mint,
    symbol: r.symbol,
    name: r.name,
    logoUrl: r.logo_url,
    reviewStatus: r.review_status,
    project: r.project_id
      ? {
          id: r.project_id,
          slug: r.project_slug!,
          name: r.project_name!,
          logoUrl: r.project_logo,
          category: r.category,
        }
      : null,
    market:
      r.captured_at === null
        ? null
        : {
            price: r.price,
            marketCap: r.market_cap,
            fdv: r.fdv,
            volume24h: r.volume_24h,
            liquidity: r.liquidity,
            holders: r.holders,
            change24h: r.change_24h,
            provider: r.provider ?? 'unknown',
            providerUpdatedAt: r.provider_updated_at,
            capturedAt: r.captured_at,
          },
  }));
}

// ---------------------------------------------------------------------------
// Programs
// ---------------------------------------------------------------------------

export interface ProgramProfile {
  readonly program: ProgramFacts & { reviewStatus: ReviewStatus; description: string | null };
  readonly projects: readonly {
    linkId: number;
    relation: ProgramRelation;
    note: string | null;
    reviewStatus: ReviewStatus;
    project: ProjectRef;
    evidence: readonly EvidenceRef[];
  }[];
  readonly activity: ActivitySnapshot | null;
  readonly history: readonly { t: number; txPerHour: number | null; failedShare: number | null }[];
}

export async function loadProgramProfile(
  db: Executor,
  address: string,
  now = Date.now(),
): Promise<ProgramProfile | null> {
  const [p] = await rows<
    RawProgramLink & { review_status: ReviewStatus; description: string | null }
  >(
    db,
    sql`select 0 as link_id, 'operates' as relation, null as note, 'unreviewed' as link_review,
          pg.id, pg.address, pg.name, pg.kind, pg.loader, pg.upgrade_authority, pg.last_deploy_slot,
          ${epoch('pg.onchain_checked_at')} as onchain_checked_at, pg.verified_build, pg.verified_repo,
          ${epoch('pg.verified_at')} as verified_at, pg.review_status, pg.description,
          a.tx_per_hour, a.failed_share, ${epoch('a.latest_tx_at')} as latest_tx_at, a.sample_size,
          a.window_seconds, ${epoch('a.captured_at')} as activity_at, a.provider, a.method
        from programs pg
        left join lateral (
          select * from program_activity pa where pa.program_id = pg.id order by captured_at desc limit 1
        ) a on true
        where pg.address = ${address}`,
  );
  if (!p) return null;
  const [links, history] = await Promise.all([
    rows<{
      link_id: number;
      relation: ProgramRelation;
      note: string | null;
      review_status: ReviewStatus;
      id: number;
      slug: string;
      name: string;
      logo_url: string | null;
      category: string | null;
    }>(
      db,
      sql`select pp.id as link_id, pp.relation, pp.note, pp.review_status, pr.id, pr.slug, pr.name, pr.logo_url, pr.category
          from project_programs pp join projects pr on pr.id = pp.project_id and pr.merged_into_id is null
          where pp.program_id = ${p.id} and pp.review_status <> 'rejected'
          order by pp.relation, pr.name`,
    ),
    rows<{ t: number; tx_per_hour: number | null; failed_share: number | null }>(
      db,
      sql`select ${epoch('captured_at')} as t, tx_per_hour, failed_share from program_activity
          where program_id = ${p.id} order by captured_at asc`,
    ),
  ]);
  const ev = await evidenceFor(db, [
    { type: 'program', ids: [p.id] },
    { type: 'project_program', ids: links.map((l) => l.link_id) },
  ]);
  return {
    program: {
      ...programFacts(p, evidenceOf(ev, 'program', p.id)),
      reviewStatus: p.review_status,
      description: p.description,
    },
    projects: links.map((l) => ({
      linkId: l.link_id,
      relation: l.relation,
      note: l.note,
      reviewStatus: l.review_status,
      project: { id: l.id, slug: l.slug, name: l.name, logoUrl: l.logo_url, category: l.category },
      evidence: evidenceOf(ev, 'project_program', l.link_id),
    })),
    activity: activityOf(p, now),
    history: history.map((h) => ({
      t: h.t,
      txPerHour: h.tx_per_hour,
      failedShare: h.failed_share,
    })),
  };
}

export interface ProgramRow {
  readonly id: number;
  readonly address: string;
  readonly name: string | null;
  readonly kind: string | null;
  readonly loader: string | null;
  readonly upgradeAuthority: string | null;
  readonly verifiedBuild: boolean | null;
  readonly projects: readonly (ProjectRef & { reviewStatus: ReviewStatus })[];
  readonly txPerHour: number | null;
  readonly latestTxAt: number | null;
  readonly activityAt: number | null;
  readonly level: ActivityLevel;
  readonly reviewStatus: ReviewStatus;
}

export async function loadPrograms(db: Executor, now = Date.now()): Promise<ProgramRow[]> {
  const found = await rows<{
    id: number;
    address: string;
    name: string | null;
    kind: string | null;
    loader: string | null;
    upgrade_authority: string | null;
    verified_build: boolean | null;
    review_status: ReviewStatus;
    tx_per_hour: number | null;
    latest_tx_at: number | null;
    activity_at: number | null;
    projects: (ProjectRef & { reviewStatus: ReviewStatus })[] | null;
  }>(
    db,
    sql`
    with links as (
      select pp.program_id, jsonb_agg(jsonb_build_object('id', pr.id, 'slug', pr.slug, 'name', pr.name,
          'logoUrl', pr.logo_url, 'category', pr.category, 'reviewStatus', pp.review_status) order by pr.name) as items
      from project_programs pp join projects pr on pr.id = pp.project_id and pr.merged_into_id is null
      where pp.review_status <> 'rejected' group by pp.program_id
    )
    select pg.id, pg.address, pg.name, pg.kind, pg.loader, pg.upgrade_authority, pg.verified_build, pg.review_status,
      a.tx_per_hour, ${epoch('a.latest_tx_at')} as latest_tx_at, ${epoch('a.captured_at')} as activity_at,
      links.items as projects
    from programs pg
    left join links on links.program_id = pg.id
    left join lateral (
      select tx_per_hour, latest_tx_at, captured_at from program_activity pa
      where pa.program_id = pg.id order by captured_at desc limit 1
    ) a on true
    where pg.review_status <> 'rejected'
    order by a.tx_per_hour desc nulls last, pg.name nulls last`,
  );
  return found.map((r) => ({
    id: r.id,
    address: r.address,
    name: r.name,
    kind: r.kind,
    loader: r.loader,
    upgradeAuthority: r.upgrade_authority,
    verifiedBuild: r.verified_build,
    projects: r.projects ?? [],
    txPerHour: r.tx_per_hour,
    latestTxAt: r.latest_tx_at,
    activityAt: r.activity_at,
    level: r.activity_at === null ? 'unknown' : activityLevel(r.tx_per_hour, r.latest_tx_at, now),
    reviewStatus: r.review_status,
  }));
}
