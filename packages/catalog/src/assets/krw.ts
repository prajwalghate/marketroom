import { defineAsset } from '../types';

export default defineAsset({
  id: 'krw',
  symbol: 'KRW',
  name: 'Korean Won / US Dollar',
  assetClass: 'fx',
  taxonomy: { sector: 'Currency', industry: 'Asian FX' },
  country: 'KR',
  peRatio: null,
  isPrivate: false,
  peers: ['kr200', 'ewy'],
  summary:
    'The won is a high-beta Asian currency closely tied to the semiconductor export cycle, which makes it an indirect read on global memory demand.',
  hyperliquid: ['KRW'],
});
