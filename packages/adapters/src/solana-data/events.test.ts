import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { eventsFromJsonLd, extractJsonLd } from './events';

const page = readFileSync(new URL('./__fixtures__/solana-events.html', import.meta.url), 'utf8');

describe('solana.com/events JSON-LD', () => {
  it('parses every valid JSON-LD block and skips a broken one', () => {
    expect(extractJsonLd(page)).toHaveLength(2);
  });

  const events = eventsFromJsonLd(extractJsonLd(page));
  const byName = new Map(events.map((e) => [e.name, e]));

  it('finds each event in the @graph once, and nothing else', () => {
    expect(events.map((e) => e.name)).toEqual([
      '20/20 Vision: Solana x Huma Happy Hour',
      'The Solana Ecosystem Call | October',
      'Solana Hacker House - London',
      'Solana Breakpoint 2026',
      'El Taller - Hackathon de Colosseum',
      'Solana Meetup Lisbon',
    ]);
  });

  it('reads dates, place, link, organiser and status', () => {
    expect(byName.get('20/20 Vision: Solana x Huma Happy Hour')).toEqual({
      name: '20/20 Vision: Solana x Huma Happy Hour',
      url: 'https://lu.ma/solana-huma-happy-hour',
      startsAt: Date.UTC(2026, 9, 21, 0, 0),
      endsAt: Date.UTC(2026, 9, 21, 2, 0),
      status: 'scheduled',
      online: false,
      location: 'Las Vegas, NV',
      organizer: 'Solana',
      // The page repeats the name as the description; that says nothing.
      description: null,
    });
    expect(byName.get('Solana Breakpoint 2026')).toMatchObject({
      location: 'London, United Kingdom',
      endsAt: Date.UTC(2026, 10, 17, 19, 0),
    });
  });

  it('marks online events and cancellations', () => {
    expect(byName.get('The Solana Ecosystem Call | October')).toMatchObject({
      online: true,
      location: 'Online',
    });
    expect(byName.get('Solana Meetup Lisbon')?.status).toBe('cancelled');
  });

  it('finds events however the JSON-LD nests them', () => {
    const event = { '@type': ['Thing', 'Hackathon'], name: 'Renaissance', startDate: '2024-03-04' };
    expect(eventsFromJsonLd([event])).toHaveLength(1);
    expect(eventsFromJsonLd([[{ '@graph': [event] }]])).toHaveLength(1);
    expect(
      eventsFromJsonLd([{ '@type': 'EventSeries', name: 'x', startDate: '2024-03-04' }]),
    ).toEqual([]);
    expect(eventsFromJsonLd([{ '@type': 'Event', name: 'No date' }])).toEqual([]);
  });
});
