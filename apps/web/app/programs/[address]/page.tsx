import { loadProgramProfile } from '@marketroom/db';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CopyAddress } from '@/components/CopyAddress';
import { ProjectLink } from '@/components/research/Entities';
import { Callout, Estimate, ReviewBadge, Sources } from '@/components/research/Evidence';
import { ago, fmtDuration, fmtRate, fmtStamp, shortAddress } from '@/components/research/format';
import {
  AsideCard,
  Breadcrumbs,
  Facts,
  HeroStat,
  ProfileHero,
  ProfileLayout,
  Section,
} from '@/components/research/Profile';
import { Empty, MiniLine } from '@/components/sol/primitives';
import { currentEditor } from '@/lib/admin';
import { researchDb } from '@/lib/research';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ address: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { address } = await params;
  const profile = await loadProgramProfile(await researchDb(), address).catch(() => null);
  if (!profile) return { title: 'Program' };
  const name = profile.program.name ?? shortAddress(address);
  return {
    title: `${name} (Solana program)`,
    description: `${name}: who operates it, whether it can be upgraded, whether its build is verified, and how busy it is — each with its source.`,
  };
}

const LOADER: Record<string, string> = {
  upgradeable: 'Upgradeable loader',
  immutable: 'Immutable (non-upgradeable loader)',
  'loader-v4': 'Loader v4',
};

export default async function ProgramPage({ params }: Props) {
  const { address } = await params;
  const [profile, editor] = await Promise.all([
    researchDb().then((db) => loadProgramProfile(db, address)),
    currentEditor(),
  ]);
  if (!profile) notFound();
  const { program, projects, activity, history } = profile;
  const name = program.name ?? shortAddress(program.address);
  const series = history.filter((h) => h.txPerHour !== null).map((h) => h.txPerHour!);

  return (
    <div className="mr-container">
      <Breadcrumbs items={[{ label: 'Programs', href: '/programs' }, { label: name }]} />
      <ProfileHero
        name={name}
        title={name}
        extra={program.kind ? <span className="rx-status is-kind">{program.kind}</span> : null}
        badges={<ReviewBadge status={program.reviewStatus} />}
        subtitle={
          projects.length ? (
            <>
              {projects[0]!.relation === 'operates' ? 'Operated by ' : 'Used by '}
              <ProjectLink project={projects[0]!.project} size={18} />
              {projects.length > 1 ? ` and ${projects.length - 1} more` : ''}
            </>
          ) : (
            'Not yet mapped to a project.'
          )
        }
        links={
          <>
            <CopyAddress address={program.address} />
            <a
              className="rx-pill"
              href={`https://explorer.solana.com/address/${program.address}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Solana Explorer<span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a
              className="rx-pill"
              href={`https://solscan.io/account/${program.address}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Solscan<span className="sr-only"> (opens in a new tab)</span>
            </a>
          </>
        }
        actions={
          editor ? (
            <Link
              className="rx-link is-editor"
              href={`/admin/edit/program/${program.id}`}
              prefetch={false}
            >
              Edit program
            </Link>
          ) : null
        }
        stats={
          <>
            <HeroStat
              label="Activity"
              value={
                activity ? (
                  <Estimate method={activity.method}>{fmtRate(activity.txPerHour)}</Estimate>
                ) : (
                  'Not measured yet'
                )
              }
              sub={activity ? `${activity.provider} · ${ago(activity.capturedAt)}` : null}
            />
            <HeroStat
              label="Last transaction"
              value={activity?.latestTxAt ? ago(activity.latestTxAt) : '—'}
            />
            <HeroStat
              label="Failed share"
              value={
                activity?.failedShare !== null && activity?.failedShare !== undefined
                  ? `${Math.round(activity.failedShare * 100)}%`
                  : '—'
              }
              sub="of sampled transactions"
            />
            <HeroStat
              label="Upgradeable"
              value={
                program.loader === 'upgradeable'
                  ? program.upgradeAuthority
                    ? 'Yes'
                    : 'No — revoked'
                  : program.loader === 'immutable'
                    ? 'No'
                    : '—'
              }
              sub={program.upgradeAuthority ? shortAddress(program.upgradeAuthority) : null}
            />
            <HeroStat
              label="Verified build"
              value={
                program.verifiedBuild ? 'Yes' : program.verifiedBuild === false ? 'No longer' : '—'
              }
            />
          </>
        }
      />
      <ProfileLayout
        main={
          <>
            <Section id="projects" title="Projects" count={projects.length}>
              {projects.length === 0 ? (
                <Empty>No project mapped to this program yet.</Empty>
              ) : (
                <div className="rx-table-wrap">
                  <table className="rx-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Relation</th>
                        <th>Mapping</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projects.map((p) => (
                        <tr key={p.linkId}>
                          <td>
                            <ProjectLink project={p.project} />
                          </td>
                          <td>{p.relation === 'operates' ? 'Operates it' : 'Uses it'}</td>
                          <td>
                            <ReviewBadge status={p.reviewStatus} compact />
                            {p.note && <span className="rx-under">{p.note}</span>}
                          </td>
                          <td>
                            <Sources evidence={p.evidence} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
            <Section id="activity" title="Activity">
              <Callout>
                This is an estimate. A public RPC node returns the program’s most recent transaction
                signatures; the rate is how many of them fall between the oldest one returned and
                now. It shows how busy the program is — it says nothing about who funds the project
                or how much it earns.
              </Callout>
              {activity ? (
                <>
                  <dl className="rx-metrics">
                    <div className="rx-metric">
                      <dt>Rate</dt>
                      <dd>
                        <Estimate method={activity.method}>
                          <span className="mr-num">{fmtRate(activity.txPerHour)}</span>
                        </Estimate>
                      </dd>
                    </div>
                    <div className="rx-metric">
                      <dt>Sample</dt>
                      <dd className="mr-num">
                        {activity.sampleSize.toLocaleString('en-US')} signatures
                      </dd>
                    </div>
                    <div className="rx-metric">
                      <dt>Window</dt>
                      <dd className="mr-num">{fmtDuration(activity.windowSeconds)}</dd>
                    </div>
                    <div className="rx-metric">
                      <dt>Failed</dt>
                      <dd className="mr-num">
                        {activity.failedShare !== null
                          ? `${Math.round(activity.failedShare * 100)}%`
                          : '—'}
                      </dd>
                    </div>
                  </dl>
                  {series.length > 2 && (
                    <div className="rx-subsec">
                      <h3 className="rx-subsec-title">Estimated rate over time</h3>
                      <MiniLine
                        values={series}
                        width={640}
                        height={60}
                        label={`${name} estimated transactions per hour over time`}
                      />
                    </div>
                  )}
                  <p className="rx-footnote">
                    {activity.method} Measured by {activity.provider},{' '}
                    {fmtStamp(activity.capturedAt)}.
                  </p>
                </>
              ) : (
                <Empty>Not measured yet. Programs are measured hourly, mapped ones first.</Empty>
              )}
            </Section>
          </>
        }
        aside={
          <AsideCard title="On-chain facts">
            <Facts
              items={[
                { label: 'Address', value: <CopyAddress address={program.address} /> },
                {
                  label: 'Loader',
                  value: program.loader
                    ? (LOADER[program.loader] ?? program.loader)
                    : 'Not read yet',
                },
                {
                  label: 'Upgrade authority',
                  value: program.upgradeAuthority ? (
                    <CopyAddress address={program.upgradeAuthority} />
                  ) : program.loader === 'upgradeable' ? (
                    'Revoked'
                  ) : null,
                  source: (
                    <Sources
                      evidence={program.evidence.filter((e) => e.field === 'upgradeAuthority')}
                      align="end"
                    />
                  ),
                },
                {
                  label: 'Last deployed',
                  value: program.lastDeploySlot
                    ? `slot ${program.lastDeploySlot.toLocaleString('en-US')}`
                    : null,
                },
                {
                  label: 'Read on-chain',
                  value: program.onchainCheckedAt ? ago(program.onchainCheckedAt) : null,
                },
                {
                  label: 'Verified build',
                  value: program.verifiedRepo ? (
                    <a
                      className="rx-clear"
                      href={program.verifiedRepo}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {program.verifiedRepo.replace('https://github.com/', '')}
                    </a>
                  ) : null,
                  source: (
                    <Sources
                      evidence={program.evidence.filter(
                        (e) => e.field === 'verifiedBuild' || e.field === 'verifiedRepo',
                      )}
                      align="end"
                    />
                  ),
                },
              ]}
            />
          </AsideCard>
        }
      />
    </div>
  );
}
