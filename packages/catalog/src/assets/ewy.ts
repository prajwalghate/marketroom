import { defineAsset } from '../types';

export default defineAsset({
  id: 'ewy',
  symbol: 'EWY',
  name: 'iShares MSCI South Korea ETF',
  assetClass: 'etf',
  taxonomy: { sector: 'ETF', industry: 'Country ETF' },
  country: 'KR',
  peRatio: null,
  isPrivate: false,
  peers: ['kr200', 'skhx', 'smsn'],
  summary:
    'South Korean equities in dollar terms, heavily concentrated in Samsung and SK hynix. Carries both equity and won currency risk.',
  hyperliquid: ['EWY'],
});
