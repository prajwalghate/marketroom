/**
 * Solana community events, from solana.com/events.
 *
 * Verified 2026-10-10: the page embeds schema.org JSON-LD — a `@graph` with
 * about twenty `Event` objects (name, url, startDate, endDate, eventStatus,
 * location, organizer), each linking to its Luma page. That is structured
 * data the site publishes for machines to read; the visible markup is never
 * parsed, so a redesign of the page does not silently change what is read.
 */

import { getText } from '../http';
import { stripHtml } from './news';
import { USER_AGENT } from './rpc';

export const SOLANA_EVENTS_PAGE = 'https://solana.com/events';

export type EventStatus = 'scheduled' | 'cancelled' | 'postponed' | 'rescheduled' | 'moved_online';

export interface CommunityEvent {
  readonly name: string;
  /** The event's own page — on solana.com, a Luma link. */
  readonly url: string | null;
  /** Unix ms. */
  readonly startsAt: number;
  readonly endsAt: number | null;
  readonly status: EventStatus | null;
  readonly online: boolean;
  /** "London, United Kingdom", or "Online". */
  readonly location: string | null;
  readonly organizer: string | null;
  readonly description: string | null;
}

/** Every JSON-LD block in a page, parsed. A block that is not valid JSON is skipped. */
export function extractJsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re =
    /<script\b[^>]*\btype\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script\s*>/gi;
  for (const match of html.matchAll(re)) {
    const body = match[1]!.trim().replace(/^<!--|-->$/g, '');
    try {
      out.push(JSON.parse(body));
    } catch {
      // A malformed block on someone else's page is not our error to raise.
    }
  }
  return out;
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

/** `@type` as bare names: "Event", or "https://schema.org/Event" → "Event". */
const typesOf = (node: Json): string[] =>
  (Array.isArray(node['@type']) ? node['@type'] : [node['@type']])
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.replace(/^.*[/:#]/, ''));

/** `Event` and its schema.org subtypes (`BusinessEvent`, `Hackathon`…); not `EventSeries`. */
const isEvent = (node: Json) => typesOf(node).some((t) => /Event$|^Hackathon$|^Festival$/.test(t));

const STATUSES: Record<string, EventStatus> = {
  EventScheduled: 'scheduled',
  EventCancelled: 'cancelled',
  EventPostponed: 'postponed',
  EventRescheduled: 'rescheduled',
  EventMovedOnline: 'moved_online',
};

function nameOf(value: unknown): string | null {
  if (Array.isArray(value)) return value.map(nameOf).find(Boolean) ?? null;
  return isObject(value) ? str(value.name) : str(value);
}

function placeOf(value: unknown): { place: string | null; online: boolean } {
  let place: string | null = null;
  let online = false;
  for (const loc of Array.isArray(value) ? value : [value]) {
    if (typeof loc === 'string') {
      place ??= str(loc);
      continue;
    }
    if (!isObject(loc)) continue;
    if (typesOf(loc).includes('VirtualLocation')) {
      online = true;
      continue;
    }
    const address = loc.address;
    const fromAddress = isObject(address)
      ? [address.addressLocality, address.addressRegion, address.addressCountry]
          .map(nameOf)
          .filter(Boolean)
          .join(', ') || null
      : str(address);
    place ??= str(loc.name) ?? fromAddress;
  }
  return { place, online };
}

function toEvent(node: Json): CommunityEvent | null {
  const name = str(node.name);
  const startsAt = Date.parse(str(node.startDate) ?? '');
  if (!name || !Number.isFinite(startsAt)) return null;
  const endsAt = Date.parse(str(node.endDate) ?? '');
  const status = str(node.eventStatus)?.replace(/^.*[/:#]/, '');
  const { place, online } = placeOf(node.location);
  const description = str(node.description) ? stripHtml(str(node.description)!) : null;
  let url: string | null = null;
  try {
    const parsed = new URL(str(node.url) ?? '');
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') url = parsed.toString();
  } catch {
    // No usable link.
  }
  return {
    name: stripHtml(name),
    url,
    startsAt,
    endsAt: Number.isFinite(endsAt) && endsAt >= startsAt ? endsAt : null,
    status: (status && STATUSES[status]) || null,
    online: online || status === 'EventMovedOnline',
    location: place ?? (online ? 'Online' : null),
    organizer: nameOf(node.organizer),
    // Often just the name again; that says nothing.
    description: description && description !== name ? description : null,
  };
}

/**
 * Every event in a set of JSON-LD blocks, wherever it sits: a bare object, an
 * array, a `@graph`, or nested in an item list. Each is read once, even when
 * the page repeats it.
 */
export function eventsFromJsonLd(blocks: readonly unknown[]): CommunityEvent[] {
  const found = new Map<string, CommunityEvent>();
  const walk = (value: unknown, depth: number) => {
    if (depth > 8) return;
    if (Array.isArray(value)) {
      for (const v of value) walk(v, depth + 1);
      return;
    }
    if (!isObject(value)) return;
    if (isEvent(value)) {
      const event = toEvent(value);
      if (event) {
        const key = str(value['@id']) ?? event.url ?? `${event.name}|${event.startsAt}`;
        if (!found.has(key)) found.set(key, event);
      }
      return;
    }
    for (const v of Object.values(value)) walk(v, depth + 1);
  };
  for (const block of blocks) walk(block, 0);
  return [...found.values()];
}

export class SolanaEvents {
  constructor(private readonly options: { signal?: AbortSignal } = {}) {}

  /** The events solana.com lists — upcoming ones, as the page shows them. */
  async list(): Promise<CommunityEvent[]> {
    const html = await getText(SOLANA_EVENTS_PAGE, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
      signal: this.options.signal,
      timeoutMs: 30_000,
      retries: 1,
    });
    return eventsFromJsonLd(extractJsonLd(html));
  }
}
