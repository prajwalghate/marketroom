import { formatCompactUsd } from '@marketroom/core';
import {
  findRoundId,
  forField,
  loadRoundProfile,
  type EvidenceRef,
  type RoundProfile,
} from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import {
  EntityCard,
  partyHref,
  projectHref,
  ProjectLink,
  roundHref,
} from '@/components/research/Entities';
import { Callout, ReviewBadge, SourceLine, Sources } from '@/components/research/Evidence';
import { ago, fmtDay, fmtMonth } from '@/components/research/format';
import {
  AsideCard,
  Breadcrumbs,
  Facts,
  HeroStat,
  ProfileHero,
  ProfileLayout,
  Section,
} from '@/components/research/Profile';
import { Empty } from '@/components/sol/primitives';
import { currentEditor } from '@/lib/admin';
import { researchDb } from '@/lib/research';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string): Promise<RoundProfile> {
  const db = await researchDb();
  const found = await findRoundId(db, decodeURIComponent(slug));
  if (found.kind === 'redirect') permanentRedirect(`/rounds/${found.slug}`);
  if (found.kind === 'missing') notFound();
  const profile = await loadRoundProfile(db, found.value);
  if (!profile) notFound();
  return profile;
}

const title = (p: RoundProfile) => `${p.project.name} — ${p.round.roundType ?? 'Funding round'}`;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  try {
    const profile = await load(slug);
    const lead = profile.investors.filter((i) => i.isLead).map((i) => i.party.name);
    return {
      title: title(profile),
      description: `${profile.project.name} raised ${profile.round.amountUsd ? formatCompactUsd(profile.round.amountUsd) : 'an undisclosed amount'} in ${fmtMonth(profile.round.announcedOn)}${lead.length ? `, led by ${lead.join(', ')}` : ''}.`,
    };
  } catch {
    return { title: 'Funding round' };
  }
}

/** Fields of a round, each with the sources that state it. */
const FIELDS: { field: string; label: string }[] = [
  { field: 'amountUsd', label: 'Amount' },
  { field: 'announcedOn', label: 'Date' },
  { field: 'roundType', label: 'Round type' },
  { field: 'valuationUsd', label: 'Valuation' },
];

export default async function RoundPage({ params }: Props) {
  const { slug } = await params;
  const [profile, editor] = await Promise.all([load(slug), currentEditor()]);
  const { round, project, investors, evidence } = profile;
  const leads = investors.filter((i) => i.isLead);
  const others = investors.filter((i) => !i.isLead);
  const uniqueSources = [...new Map(evidence.map((e) => [e.sourceId, e])).values()];

  return (
    <div className="mr-container">
      <Breadcrumbs
        items={[
          { label: 'Fundraising', href: '/fundraising' },
          { label: project.name, href: projectHref(project.slug) },
          { label: round.roundType ?? 'Round' },
        ]}
      />

      <ProfileHero
        image={project.logoUrl}
        name={project.name}
        title={
          <>
            <Link href={projectHref(project.slug)} className="rx-hero-link" prefetch={false}>
              {project.name}
            </Link>{' '}
            <span className="rx-hero-dim">— {round.roundType ?? 'Funding round'}</span>
          </>
        }
        badges={
          <ReviewBadge
            status={round.reviewStatus}
            checkedAt={round.checkedAt}
            checkedBy={round.checkedBy}
          />
        }
        subtitle={project.tagline}
        actions={
          editor ? (
            <Link
              className="rx-link is-editor"
              href={`/admin/edit/round/${round.id}`}
              prefetch={false}
            >
              Edit round
            </Link>
          ) : null
        }
        stats={
          <>
            <HeroStat
              label="Amount"
              value={round.amountUsd ? formatCompactUsd(round.amountUsd) : 'Undisclosed'}
              sub={<Sources evidence={forField(evidence, 'amountUsd')} />}
            />
            <HeroStat
              label="Announced"
              value={fmtDay(round.announcedOn)}
              sub={<Sources evidence={forField(evidence, 'announcedOn')} />}
            />
            <HeroStat label="Round" value={round.roundType ?? 'Not stated'} />
            <HeroStat
              label="Valuation"
              value={round.valuationUsd ? formatCompactUsd(round.valuationUsd) : 'Not disclosed'}
            />
            <HeroStat
              label="Investors"
              value={String(investors.length)}
              sub={leads.length ? `${leads.length} lead` : 'No lead named'}
            />
          </>
        }
      />

      <ProfileLayout
        main={
          <>
            <Section id="investors" title="Investors" count={investors.length}>
              {investors.length === 0 ? (
                <Empty>No investors were named.</Empty>
              ) : (
                <>
                  {leads.length > 0 && <h3 className="rx-subsec-title">Led by</h3>}
                  {leads.length > 0 && (
                    <ul className="rx-cards">
                      {leads.map((i) => (
                        <EntityCard
                          key={i.linkId}
                          href={partyHref(i.party)}
                          name={i.party.name}
                          imageUrl={i.party.imageUrl}
                          shape={i.party.type === 'person' ? 'round' : 'square'}
                          sub={i.party.type === 'person' ? 'Angel investor' : 'Lead investor'}
                        >
                          <span className="rx-card-meta">
                            <ReviewBadge status={i.reviewStatus} compact />
                            <Sources evidence={i.evidence} />
                          </span>
                        </EntityCard>
                      ))}
                    </ul>
                  )}
                  {others.length > 0 && (
                    <h3 className="rx-subsec-title">{leads.length ? 'With' : 'Participants'}</h3>
                  )}
                  {others.length > 0 && (
                    <ul className="rx-cards">
                      {others.map((i) => (
                        <EntityCard
                          key={i.linkId}
                          href={partyHref(i.party)}
                          name={i.party.name}
                          imageUrl={i.party.imageUrl}
                          shape={i.party.type === 'person' ? 'round' : 'square'}
                          sub={i.party.type === 'person' ? 'Angel investor' : 'Participant'}
                        >
                          <span className="rx-card-meta">
                            <ReviewBadge status={i.reviewStatus} compact />
                            <Sources evidence={i.evidence} />
                          </span>
                        </EntityCard>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Section>

            <Section id="sources" title="Announcement and sources" count={uniqueSources.length}>
              <Callout>
                A round is recorded from what was announced — the announcement itself, press
                coverage or a funding database. On-chain transfers are never used to create, size or
                date a round.
              </Callout>
              <div className="rx-table-wrap">
                <table className="rx-table">
                  <thead>
                    <tr>
                      <th>Fact</th>
                      <th>Value</th>
                      <th>Stated by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FIELDS.map(({ field, label }) => {
                      const own = evidence.filter((e) => e.field === field);
                      const value =
                        field === 'amountUsd'
                          ? round.amountUsd
                            ? formatCompactUsd(round.amountUsd)
                            : 'Undisclosed'
                          : field === 'valuationUsd'
                            ? round.valuationUsd
                              ? formatCompactUsd(round.valuationUsd)
                              : 'Not disclosed'
                            : field === 'announcedOn'
                              ? fmtDay(round.announcedOn)
                              : (round.roundType ?? 'Not stated');
                      return (
                        <tr key={field}>
                          <th scope="row">{label}</th>
                          <td className="mr-num">
                            {value}
                            {round.lockedFields.includes(field) && (
                              <span className="rx-muted"> · set by an editor</span>
                            )}
                          </td>
                          <td>
                            {own.length ? (
                              <SourceList evidence={own} />
                            ) : (
                              <span className="rx-nosrc">No source for this fact</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {round.notes && <p className="rx-prose-block">{round.notes}</p>}
            </Section>

            {profile.otherRounds.length > 0 && (
              <Section
                id="history"
                title={`${project.name}’s other rounds`}
                count={profile.otherRounds.length}
              >
                <ul className="rx-feed">
                  {profile.otherRounds.map((r) => (
                    <li key={r.slug}>
                      <time dateTime={r.announcedOn}>{fmtDay(r.announcedOn)}</time>
                      <div>
                        <Link href={roundHref(r.slug)} className="rx-feed-title" prefetch={false}>
                          {r.roundType ?? 'Round'}
                        </Link>
                        <span className="rx-feed-meta mr-num">
                          {r.amountUsd ? formatCompactUsd(r.amountUsd) : 'Undisclosed'}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {profile.nearby.length > 0 && (
              <Section
                id="nearby"
                title="Announced around the same time"
                lead="Rounds within six weeks of this one, same type first."
              >
                <div className="rx-table-wrap">
                  <table className="rx-table">
                    <tbody>
                      {profile.nearby.map((n) => (
                        <tr key={n.slug}>
                          <td className="mr-num">{fmtDay(n.announcedOn)}</td>
                          <td>
                            <ProjectLink project={n.project} />
                          </td>
                          <td>
                            <Link
                              href={roundHref(n.slug)}
                              className="rx-strong-link"
                              prefetch={false}
                            >
                              {n.roundType ?? 'Round'}
                            </Link>
                          </td>
                          <td className="is-num">
                            {n.amountUsd ? (
                              formatCompactUsd(n.amountUsd)
                            ) : (
                              <span className="rx-muted">Undisclosed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Section>
            )}
          </>
        }
        aside={
          <>
            <AsideCard title="Round">
              <Facts
                items={[
                  { label: 'Project', value: <ProjectLink project={project} size={18} /> },
                  { label: 'Category', value: project.category },
                  { label: 'Type', value: round.roundType ?? 'Not stated' },
                  { label: 'Announced', value: fmtDay(round.announcedOn) },
                  {
                    label: 'Lead',
                    value: leads.length ? leads.map((l) => l.party.name).join(', ') : 'None named',
                  },
                ]}
              />
            </AsideCard>
            <AsideCard title="Data checks">
              <div className="rx-check">
                <ReviewBadge
                  status={round.reviewStatus}
                  checkedAt={round.checkedAt}
                  checkedBy={round.checkedBy}
                />
                <p>
                  {round.reviewStatus === 'verified'
                    ? `Checked against its announcement by ${round.checkedBy ?? 'an editor'} on ${fmtDay(round.checkedAt)}.`
                    : uniqueSources.some((e) => e.kind !== 'database')
                      ? 'Imported from a funding database and the announcement it cites; not yet checked by an editor.'
                      : 'Imported from a funding database, which cites no announcement for it. An editor has not yet found and checked one.'}
                </p>
              </div>
            </AsideCard>
            {profile.changes.length > 0 && (
              <AsideCard title="History">
                <ul className="rx-changes">
                  {profile.changes.map((c) => (
                    <li key={c.id}>
                      <span>{c.summary}</span>
                      <span className="rx-muted">
                        {c.actor.startsWith('import:') ? 'import' : c.actor} · {ago(c.at)}
                      </span>
                    </li>
                  ))}
                </ul>
              </AsideCard>
            )}
          </>
        }
      />
    </div>
  );
}

function SourceList({ evidence }: { evidence: readonly EvidenceRef[] }) {
  return (
    <ul className="rx-ev-list is-inline">
      {evidence.map((e) => (
        <SourceLine key={`${e.sourceId}:${e.method}`} e={e} />
      ))}
    </ul>
  );
}
