import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VIEW_STATE,
  isDefaultViewState,
  parseViewState,
  serializeViewState,
} from './urlState';

/**
 * These guard the shareable-link contract: a URL copied from the address bar
 * must render the same view it was copied from, and a hand-mangled URL must
 * degrade rather than break.
 */

describe('parseViewState', () => {
  it('returns defaults for an empty query', () => {
    expect(parseViewState('')).toEqual(DEFAULT_VIEW_STATE);
    expect(parseViewState(null)).toEqual(DEFAULT_VIEW_STATE);
    expect(parseViewState(undefined)).toEqual(DEFAULT_VIEW_STATE);
  });

  it('reads every dimension', () => {
    const state = parseViewState(
      'q=nvda&sector=Technology&class=equity&venue=solana&multi=1&sort=change',
    );
    expect(state.filters.query).toBe('nvda');
    expect(state.filters.sectors).toEqual(['Technology']);
    expect(state.filters.assetClasses).toEqual(['equity']);
    expect(state.filters.venues).toEqual(['solana']);
    expect(state.filters.multiVenueOnly).toBe(true);
    expect(state.sort).toBe('change');
  });

  it('splits CSV lists and drops duplicates', () => {
    const state = parseViewState('class=equity,etf,equity&venue=solana,hyperliquid');
    expect(state.filters.assetClasses).toEqual(['equity', 'etf']);
    expect(state.filters.venues).toEqual(['solana', 'hyperliquid']);
  });

  it('drops values the app does not know, rather than throwing', () => {
    const state = parseViewState('class=equity,not-a-class&venue=ethereum&sort=bogus');
    expect(state.filters.assetClasses).toEqual(['equity']);
    expect(state.filters.venues).toEqual([]);
    expect(state.sort).toBe('volume');
  });

  it('accepts Next’s plain-object searchParams, including repeated keys', () => {
    const state = parseViewState({ q: 'gold', venue: ['solana', 'hyperliquid'] });
    expect(state.filters.query).toBe('gold');
    expect(state.filters.venues).toEqual(['solana', 'hyperliquid']);
  });

  it('caps an absurdly long query instead of passing it through', () => {
    expect(parseViewState(`q=${'x'.repeat(500)}`).filters.query).toHaveLength(120);
  });

  it('treats any multi value other than 1 as off', () => {
    expect(parseViewState('multi=0').filters.multiVenueOnly).toBe(false);
    expect(parseViewState('multi=true').filters.multiVenueOnly).toBe(false);
  });
});

describe('serializeViewState', () => {
  it('omits defaults so an unfiltered view has an empty query string', () => {
    expect(serializeViewState(DEFAULT_VIEW_STATE)).toBe('');
  });

  it('omits the default sort but keeps a chosen one', () => {
    expect(serializeViewState({ ...DEFAULT_VIEW_STATE, sort: 'volume' })).toBe('');
    expect(serializeViewState({ ...DEFAULT_VIEW_STATE, sort: 'change' })).toBe('sort=change');
  });

  it('trims the query', () => {
    const out = serializeViewState({
      ...DEFAULT_VIEW_STATE,
      filters: { ...DEFAULT_VIEW_STATE.filters, query: '  nvda  ' },
    });
    expect(out).toBe('q=nvda');
  });

  it('round-trips every dimension', () => {
    const original = parseViewState(
      'q=memory&sector=Technology&class=equity,etf&venue=solana&multi=1&sort=change',
    );
    expect(parseViewState(serializeViewState(original))).toEqual(original);
  });

  it('round-trips a sector containing a space', () => {
    const original = parseViewState('sector=Health+Care');
    expect(original.filters.sectors).toEqual(['Health Care']);
    expect(parseViewState(serializeViewState(original))).toEqual(original);
  });
});

describe('isDefaultViewState', () => {
  it('is true only when nothing is applied', () => {
    expect(isDefaultViewState(DEFAULT_VIEW_STATE)).toBe(true);
    expect(isDefaultViewState(parseViewState('q=a'))).toBe(false);
    expect(isDefaultViewState(parseViewState('sort=change'))).toBe(false);
    expect(isDefaultViewState(parseViewState('multi=1'))).toBe(false);
  });

  it('ignores whitespace-only queries', () => {
    expect(isDefaultViewState(parseViewState('q=%20%20'))).toBe(true);
  });
});

describe('country filter', () => {
  it('round-trips a country code', () => {
    const state = parseViewState('country=US');
    expect(state.filters.countries).toEqual(['US']);
    expect(serializeViewState(state)).toBe('country=US');
  });

  it('round-trips a dual-listed country code containing a slash', () => {
    const state = parseViewState('country=US%2FAU');
    expect(state.filters.countries).toEqual(['US/AU']);
    expect(parseViewState(serializeViewState(state))).toEqual(state);
  });

  it('counts as a non-default view', () => {
    expect(isDefaultViewState(parseViewState('country=JP'))).toBe(false);
  });
});
