/**
 * Is the US stock market open right now?
 *
 * Tokenized equities trade around the clock; the shares behind them do not.
 * Outside the regular session there is no primary-exchange price for anyone to
 * arbitrage against, so on-chain prices are set by on-chain traders alone and
 * a gap between venues means something different. A trust check that ignores
 * the session would read every weekend gap as a warning sign — or wave one
 * through on a Tuesday afternoon, when the same gap should be closed within
 * seconds.
 *
 * Pure. Time-zone conversion uses the platform's `Intl` tables rather than a
 * fixed UTC offset, so daylight-saving transitions land on the right day.
 */

const TIME_ZONE = 'America/New_York';

/**
 * Full-day NYSE closures.
 *
 * Source: the exchange calendar NYSE publishes, cross-checked against the
 * trading schedule Pyth attaches to its US equity feeds. Past dates are kept so
 * the table reads as a calendar rather than a countdown. Extend it each year —
 * a missing holiday degrades to "the market looks open when it is not", which
 * the receipts would then misdescribe.
 */
export const NYSE_HOLIDAYS: Readonly<Record<string, string>> = {
  '2026-01-01': "New Year's Day",
  '2026-01-19': 'Martin Luther King Jr. Day',
  '2026-02-16': "Washington's Birthday",
  '2026-04-03': 'Good Friday',
  '2026-05-25': 'Memorial Day',
  '2026-06-19': 'Juneteenth',
  '2026-07-03': 'Independence Day (observed)',
  '2026-09-07': 'Labor Day',
  '2026-11-26': 'Thanksgiving Day',
  '2026-12-25': 'Christmas Day',
  '2027-01-01': "New Year's Day",
  '2027-01-18': 'Martin Luther King Jr. Day',
  '2027-02-15': "Washington's Birthday",
  '2027-03-26': 'Good Friday',
  '2027-05-31': 'Memorial Day',
  '2027-06-18': 'Juneteenth (observed)',
  '2027-07-05': 'Independence Day (observed)',
  '2027-09-06': 'Labor Day',
  '2027-11-25': 'Thanksgiving Day',
  '2027-12-24': 'Christmas Day (observed)',
};

/** Sessions that close at 1:00 pm ET instead of 4:00 pm. Minutes after midnight, ET. */
export const NYSE_EARLY_CLOSES: Readonly<Record<string, number>> = {
  '2026-11-27': 13 * 60,
  '2026-12-24': 13 * 60,
  '2027-11-26': 13 * 60,
};

const OPEN_MINUTES = 9 * 60 + 30;
const CLOSE_MINUTES = 16 * 60;
const PRE_MARKET_MINUTES = 4 * 60;
const AFTER_HOURS_END_MINUTES = 20 * 60;
/** On a 1:00 pm close, extended trading ends at 5:00 pm rather than 8:00 pm. */
const EARLY_AFTER_HOURS_END_MINUTES = 17 * 60;

export type SessionPhase =
  'regular' | 'pre-market' | 'after-hours' | 'overnight' | 'weekend' | 'holiday';

export interface MarketSession {
  readonly phase: SessionPhase;
  /** True only during the regular session — the hours a primary-exchange price exists. */
  readonly open: boolean;
  /** Name of today's holiday, when the exchange is closed for one. */
  readonly holiday: string | null;
  /** Epoch ms the regular session closes, while it is open. */
  readonly closesAt: number | null;
  /** Epoch ms of the next regular-session open. */
  readonly nextOpen: number;
  readonly earlyClose: boolean;
  /**
   * Whether an external stock price exists at all right now.
   *
   * trade[XYZ] prices US equities from outside venues 24/5 — pre-market,
   * regular, after-hours and the overnight session — from 8 PM ET the evening
   * before each trading day until 8 PM ET on it. Outside that window (Friday
   * night to Sunday night, and around holidays) its oracle follows the perp's
   * own order book through a 30-minute average, so "does it track the stock"
   * has no external answer.
   */
  readonly externalPricing: boolean;
  /** Epoch ms external pricing resumes, while it is suspended. */
  readonly externalResumesAt: number | null;
}

interface WallClock {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly minutes: number;
  /** 0 = Sunday. */
  readonly weekday: number;
  readonly dateKey: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hourCycle: 'h23',
  weekday: 'short',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function wallClock(epochMs: number): WallClock & { second: number } {
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(new Date(epochMs))) parts[part.type] = part.value;
  const year = Number(parts.year);
  const month = Number(parts.month);
  const day = Number(parts.day);
  const hour = Number(parts.hour) % 24;
  return {
    year,
    month,
    day,
    minutes: hour * 60 + Number(parts.minute),
    second: Number(parts.second),
    weekday: WEEKDAYS.indexOf(parts.weekday ?? ''),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/** Milliseconds New York wall-clock time is ahead of UTC at this instant (negative). */
function offsetMs(epochMs: number): number {
  const c = wallClock(epochMs);
  const asUtc = Date.UTC(c.year, c.month - 1, c.day, 0, c.minutes, c.second);
  return asUtc - Math.floor(epochMs / 1000) * 1000;
}

/** Epoch ms of a New York wall-clock time. Correct across DST transitions. */
export function nyWallTimeToEpoch(year: number, month: number, day: number, minutes: number) {
  const naive = Date.UTC(year, month - 1, day, 0, minutes);
  const first = naive - offsetMs(naive);
  // A second pass settles the one-hour ambiguity on transition days.
  return naive - offsetMs(first);
}

function isTradingDay(clock: Pick<WallClock, 'weekday' | 'dateKey'>): boolean {
  return clock.weekday !== 0 && clock.weekday !== 6 && !(clock.dateKey in NYSE_HOLIDAYS);
}

/** Calendar date `days` after the given one, as a New York wall clock at noon. */
function addDays(clock: WallClock, days: number): WallClock {
  // Noon, not midnight, so a DST shift can never carry the date across a day.
  const noon = nyWallTimeToEpoch(clock.year, clock.month, clock.day, 12 * 60);
  return wallClock(noon + days * 24 * 60 * 60 * 1000);
}

function nextOpenAfter(clock: WallClock): number {
  let candidate = clock;
  if (isTradingDay(candidate) && candidate.minutes < OPEN_MINUTES) {
    return nyWallTimeToEpoch(candidate.year, candidate.month, candidate.day, OPEN_MINUTES);
  }
  // Two weeks bounds the search well past any real closure run.
  for (let i = 0; i < 14; i++) {
    candidate = addDays(candidate, 1);
    if (isTradingDay(candidate)) {
      return nyWallTimeToEpoch(candidate.year, candidate.month, candidate.day, OPEN_MINUTES);
    }
  }
  throw new Error('No NYSE trading day within two weeks — the holiday table is wrong.');
}

/** The evening before each trading day, external 24/5 pricing begins. */
const EXTERNAL_DAY_START_MINUTES = 20 * 60;

/**
 * The trading day an instant's external pricing belongs to: from 8 PM ET the
 * session rolls to the next calendar day.
 */
function pricingDay(clock: WallClock): WallClock {
  return clock.minutes >= EXTERNAL_DAY_START_MINUTES ? addDays(clock, 1) : clock;
}

function externalPricing(clock: WallClock): { external: boolean; resumesAt: number | null } {
  let day = pricingDay(clock);
  if (isTradingDay(day)) return { external: true, resumesAt: null };
  for (let i = 0; i < 14; i++) {
    day = addDays(day, 1);
    if (isTradingDay(day)) {
      const eve = addDays(day, -1);
      return {
        external: false,
        resumesAt: nyWallTimeToEpoch(eve.year, eve.month, eve.day, EXTERNAL_DAY_START_MINUTES),
      };
    }
  }
  throw new Error('No NYSE trading day within two weeks — the holiday table is wrong.');
}

export function usEquitySession(now: number): MarketSession {
  const clock = wallClock(now);
  const pricing = externalPricing(clock);
  const holiday = NYSE_HOLIDAYS[clock.dateKey] ?? null;
  const weekend = clock.weekday === 0 || clock.weekday === 6;
  const closeMinutes = NYSE_EARLY_CLOSES[clock.dateKey] ?? CLOSE_MINUTES;
  const earlyClose = clock.dateKey in NYSE_EARLY_CLOSES;
  const afterHoursEnd = earlyClose ? EARLY_AFTER_HOURS_END_MINUTES : AFTER_HOURS_END_MINUTES;

  const base = {
    holiday,
    earlyClose,
    nextOpen: 0,
    closesAt: null as number | null,
    externalPricing: pricing.external,
    externalResumesAt: pricing.resumesAt,
  };

  if (weekend) return { ...base, phase: 'weekend', open: false, nextOpen: nextOpenAfter(clock) };
  if (holiday) return { ...base, phase: 'holiday', open: false, nextOpen: nextOpenAfter(clock) };

  const m = clock.minutes;
  if (m >= OPEN_MINUTES && m < closeMinutes) {
    return {
      ...base,
      phase: 'regular',
      open: true,
      closesAt: nyWallTimeToEpoch(clock.year, clock.month, clock.day, closeMinutes),
      nextOpen: nextOpenAfter({ ...clock, minutes: closeMinutes }),
    };
  }

  const phase: SessionPhase =
    m >= PRE_MARKET_MINUTES && m < OPEN_MINUTES
      ? 'pre-market'
      : m >= closeMinutes && m < afterHoursEnd
        ? 'after-hours'
        : 'overnight';

  return { ...base, phase, open: false, nextOpen: nextOpenAfter(clock) };
}

const timeLabel = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  hour: 'numeric',
  minute: '2-digit',
});

const dayTimeLabel = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  weekday: 'short',
  hour: 'numeric',
  minute: '2-digit',
});

/** "Tue 9:30 AM ET", or "9:30 AM ET" when it is later today in New York. */
export function formatNyTime(epochMs: number, now: number): string {
  const sameDay = wallClock(epochMs).dateKey === wallClock(now).dateKey;
  return `${(sameDay ? timeLabel : dayTimeLabel).format(new Date(epochMs))} ET`;
}

const PHASE_LABEL: Record<SessionPhase, string> = {
  regular: 'US market open',
  'pre-market': 'US pre-market',
  'after-hours': 'US after-hours',
  overnight: 'US market closed',
  weekend: 'US market closed for the weekend',
  holiday: 'US market closed',
};

/** One line for a status strip: what the session is, and when that changes. */
export function describeSession(session: MarketSession, now: number): string {
  if (session.open && session.closesAt !== null) {
    return `${PHASE_LABEL.regular} · closes ${formatNyTime(session.closesAt, now)}${
      session.earlyClose ? ' (early close)' : ''
    }`;
  }
  const label = session.holiday
    ? `${PHASE_LABEL.holiday} for ${session.holiday}`
    : PHASE_LABEL[session.phase];
  return `${label} · opens ${formatNyTime(session.nextOpen, now)}`;
}
