import clsx from 'clsx';
import type { PartyRef, PersonRef, ProjectRef } from '@marketroom/db';
import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { Avatar } from '@/components/sol/Avatar';

/**
 * Every name links to its own profile. These are the links.
 */

export const projectHref = (slug: string) => `/projects/${slug}`;
export const personHref = (slug: string) => `/people/${slug}`;
export const investorHref = (slug: string) => `/investors/${slug}`;
export const partyHref = (p: Pick<PartyRef, 'type' | 'slug'>) =>
  p.type === 'person' ? personHref(p.slug) : investorHref(p.slug);
export const roundHref = (slug: string) => `/rounds/${slug}`;
export const tokenHref = (mint: string) => `/tokens/${mint}`;
export const programHref = (address: string) => `/programs/${address}`;

export function ProjectLink({
  project,
  size = 22,
  sub,
}: {
  project: Pick<ProjectRef, 'slug' | 'name' | 'logoUrl'>;
  size?: number;
  sub?: ReactNode;
}) {
  return (
    <Link href={projectHref(project.slug)} className="rx-entity" prefetch={false}>
      <Avatar src={project.logoUrl} name={project.name} size={size} />
      <span className="rx-entity-text">
        <span className="rx-entity-name">{project.name}</span>
        {sub && <span className="rx-entity-sub">{sub}</span>}
      </span>
    </Link>
  );
}

/** An investor or person in a round: organisations square-ish, people round. */
export function PartyChip({
  party,
  lead,
  href,
}: {
  party: Pick<PartyRef, 'type' | 'slug' | 'name' | 'imageUrl'>;
  lead?: boolean;
  href?: string;
}) {
  return (
    <Link
      href={href ?? partyHref(party)}
      className={lead ? 'rx-chip is-lead' : 'rx-chip'}
      prefetch={false}
    >
      <Avatar
        src={party.imageUrl}
        name={party.name}
        size={18}
        shape={party.type === 'person' ? 'round' : 'square'}
      />
      <span>{party.name}</span>
      {lead && <span className="rx-chip-tag">Lead</span>}
      {party.type === 'person' && !lead && <span className="rx-chip-note">Angel</span>}
    </Link>
  );
}

/** A row of chips that stops after `max`, saying how many more there are. */
export function PartyChips({
  parties,
  max = 4,
  moreHref,
}: {
  parties: readonly (Pick<PartyRef, 'type' | 'slug' | 'name' | 'imageUrl'> & {
    isLead?: boolean;
  })[];
  max?: number;
  moreHref?: string;
}) {
  if (parties.length === 0) return <span className="rx-muted">Not disclosed</span>;
  const shown = parties.slice(0, max);
  const rest = parties.length - shown.length;
  return (
    <span className="rx-chips">
      {shown.map((p) => (
        <PartyChip key={`${p.type}:${p.slug}`} party={p} lead={p.isLead} />
      ))}
      {rest > 0 &&
        (moreHref ? (
          <Link href={moreHref} className="rx-chip is-more" prefetch={false}>
            +{rest} more
          </Link>
        ) : (
          <span className="rx-chip is-more">+{rest} more</span>
        ))}
    </span>
  );
}

/**
 * Investors as a stack of logos with the first names spelled out — leads
 * first — and a count of the rest. Denser than chips, for tables.
 */
export function PartyStack({
  parties,
  names = 2,
  moreHref,
}: {
  parties: readonly (Pick<PartyRef, 'type' | 'slug' | 'name' | 'imageUrl'> & {
    isLead?: boolean;
  })[];
  names?: number;
  moreHref?: string;
}) {
  if (parties.length === 0) return <span className="rx-muted">Not disclosed</span>;
  const ordered = [...parties].sort((a, b) => Number(!!b.isLead) - Number(!!a.isLead));
  const rest = ordered.length - Math.min(names, ordered.length);
  return (
    <span className="rx-pstack">
      <span className="rx-pstack-faces" aria-hidden="true">
        {ordered.slice(0, 4).map((p) => (
          <Avatar
            key={`${p.type}:${p.slug}`}
            src={p.imageUrl}
            name={p.name}
            size={22}
            shape={p.type === 'person' ? 'round' : 'square'}
          />
        ))}
      </span>
      <span className="rx-pstack-names">
        {ordered.slice(0, names).map((p, i) => (
          <Fragment key={`${p.type}:${p.slug}`}>
            {i > 0 && ', '}
            <Link href={partyHref(p)} className="rx-clear" prefetch={false}>
              {p.name}
            </Link>
            {p.isLead && <span className="rx-lead-tag">Lead</span>}
          </Fragment>
        ))}
        {rest > 0 &&
          (moreHref ? (
            <Link href={moreHref} className="rx-pstack-more" prefetch={false}>
              +{rest}
              <span className="sr-only"> more investors</span>
            </Link>
          ) : (
            <span className="rx-pstack-more">+{rest}</span>
          ))}
      </span>
    </span>
  );
}

export function PersonLink({
  person,
  size = 22,
}: {
  person: Pick<PersonRef, 'slug' | 'name' | 'avatarUrl'>;
  size?: number;
}) {
  return (
    <Link href={personHref(person.slug)} className="rx-entity" prefetch={false}>
      <Avatar src={person.avatarUrl} name={person.name} size={size} />
      <span className="rx-entity-name">{person.name}</span>
    </Link>
  );
}

/** A card for a person on a team: photo, name, role, and anything else passed in. */
export function PersonCard({
  person,
  role,
  former,
  children,
}: {
  person: Pick<PersonRef, 'slug' | 'name' | 'avatarUrl' | 'headline'>;
  role: string;
  former?: boolean;
  children?: ReactNode;
}) {
  return (
    <li className={clsx('rx-card', former && 'is-former')}>
      <Avatar src={person.avatarUrl} name={person.name} size={40} />
      <div className="rx-card-body">
        <Link href={personHref(person.slug)} className="rx-card-title" prefetch={false}>
          {person.name}
        </Link>
        <span className="rx-card-sub">
          {role}
          {former && <span className="rx-card-flag">Former</span>}
        </span>
        {children}
      </div>
    </li>
  );
}

/** A card for an organisation or project in a grid. */
export function EntityCard({
  href,
  name,
  imageUrl,
  sub,
  shape = 'square',
  children,
}: {
  href: string;
  name: string;
  imageUrl: string | null;
  sub?: ReactNode;
  shape?: 'round' | 'square';
  children?: ReactNode;
}) {
  return (
    <li className="rx-card">
      <Avatar src={imageUrl} name={name} size={40} shape={shape} />
      <div className="rx-card-body">
        <Link href={href} className="rx-card-title" prefetch={false}>
          {name}
        </Link>
        {sub && <span className="rx-card-sub">{sub}</span>}
        {children}
      </div>
    </li>
  );
}
