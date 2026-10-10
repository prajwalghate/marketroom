import { describe, expect, it } from 'vitest';
import { describeSession, nyWallTimeToEpoch, usEquitySession } from './session';

const at = (iso: string) => Date.parse(iso);

describe('nyWallTimeToEpoch', () => {
  it('converts in daylight time (UTC−4)', () => {
    expect(nyWallTimeToEpoch(2026, 10, 6, 9 * 60 + 30)).toBe(at('2026-10-06T13:30:00Z'));
  });

  it('converts in standard time (UTC−5)', () => {
    expect(nyWallTimeToEpoch(2026, 11, 2, 9 * 60 + 30)).toBe(at('2026-11-02T14:30:00Z'));
  });
});

describe('usEquitySession', () => {
  it('is after-hours on a Monday evening, opening Tuesday 9:30 ET', () => {
    // The moment the fixtures in fills.test.ts were measured.
    const s = usEquitySession(at('2026-10-05T22:58:00Z'));
    expect(s.phase).toBe('after-hours');
    expect(s.open).toBe(false);
    expect(s.nextOpen).toBe(at('2026-10-06T13:30:00Z'));
  });

  it('is open mid-session and knows when it closes', () => {
    const s = usEquitySession(at('2026-10-06T14:00:00Z'));
    expect(s.phase).toBe('regular');
    expect(s.open).toBe(true);
    expect(s.closesAt).toBe(at('2026-10-06T20:00:00Z'));
    expect(s.nextOpen).toBe(at('2026-10-07T13:30:00Z'));
  });

  it('distinguishes pre-market from overnight', () => {
    expect(usEquitySession(at('2026-10-06T09:00:00Z')).phase).toBe('pre-market');
    expect(usEquitySession(at('2026-10-06T03:00:00Z')).phase).toBe('overnight');
  });

  it('skips the weekend to Monday', () => {
    const s = usEquitySession(at('2026-10-10T15:00:00Z'));
    expect(s.phase).toBe('weekend');
    expect(s.nextOpen).toBe(at('2026-10-12T13:30:00Z'));
  });

  it('carries the open across the end of daylight time', () => {
    // DST ends Sunday 2026-11-01: Monday's 9:30 is 14:30Z, not 13:30Z.
    expect(usEquitySession(at('2026-10-30T21:00:00Z')).nextOpen).toBe(at('2026-11-02T14:30:00Z'));
  });

  it('carries the open across the start of daylight time', () => {
    // DST starts Sunday 2026-03-08: Monday's 9:30 is 13:30Z.
    expect(usEquitySession(at('2026-03-06T22:00:00Z')).nextOpen).toBe(at('2026-03-09T13:30:00Z'));
  });

  it('closes for Thanksgiving and reopens for the half day after', () => {
    const s = usEquitySession(at('2026-11-26T15:00:00Z'));
    expect(s.phase).toBe('holiday');
    expect(s.holiday).toBe('Thanksgiving Day');
    expect(s.nextOpen).toBe(at('2026-11-27T14:30:00Z'));
  });

  it('closes at 1:00 pm ET on an early-close day', () => {
    const open = usEquitySession(at('2026-11-27T17:00:00Z'));
    expect(open.open).toBe(true);
    expect(open.earlyClose).toBe(true);
    expect(open.closesAt).toBe(at('2026-11-27T18:00:00Z'));
    expect(usEquitySession(at('2026-11-27T18:30:00Z')).phase).toBe('after-hours');
  });

  it('observes Christmas 2027 on Friday the 24th', () => {
    const s = usEquitySession(at('2027-12-24T15:00:00Z'));
    expect(s.phase).toBe('holiday');
    expect(s.nextOpen).toBe(at('2027-12-27T14:30:00Z'));
  });
});

describe('describeSession', () => {
  it('names the next open in New York time', () => {
    const now = at('2026-10-05T22:58:00Z');
    expect(describeSession(usEquitySession(now), now)).toBe(
      'US after-hours · opens Tue 9:30 AM ET',
    );
  });

  it('gives the close time while open', () => {
    const now = at('2026-10-06T14:00:00Z');
    expect(describeSession(usEquitySession(now), now)).toBe('US market open · closes 4:00 PM ET');
  });

  it('names the holiday', () => {
    const now = at('2026-11-26T15:00:00Z');
    expect(describeSession(usEquitySession(now), now)).toBe(
      'US market closed for Thanksgiving Day · opens Fri 9:30 AM ET',
    );
  });
});

describe('external pricing (trade[XYZ] 24/5)', () => {
  it('runs from Sunday 8 PM ET to Friday 8 PM ET', () => {
    expect(usEquitySession(at('2026-10-09T23:59:00Z')).externalPricing).toBe(true); // Fri 7:59 PM
    const friday = usEquitySession(at('2026-10-10T00:00:00Z')); // Fri 8:00 PM
    expect(friday.externalPricing).toBe(false);
    expect(friday.externalResumesAt).toBe(at('2026-10-12T00:00:00Z')); // Sun 8:00 PM ET
    expect(usEquitySession(at('2026-10-12T00:00:00Z')).externalPricing).toBe(true);
  });

  it('is suspended overnight into a holiday and resumes the evening of it', () => {
    // Wednesday 9 PM ET before Thanksgiving.
    const eve = usEquitySession(at('2026-11-26T02:00:00Z'));
    expect(eve.externalPricing).toBe(false);
    expect(eve.externalResumesAt).toBe(at('2026-11-27T01:00:00Z')); // Thu 8:00 PM EST
  });

  it('holds through weekday overnight hours, when the primary market is shut', () => {
    const s = usEquitySession(at('2026-10-06T03:00:00Z')); // Mon 11 PM ET
    expect(s.open).toBe(false);
    expect(s.externalPricing).toBe(true);
  });
});
