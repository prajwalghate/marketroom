import { defineAsset } from '../types';

export default defineAsset({
  id: 'mags',
  symbol: 'MAGS',
  name: 'Roundhill Magnificent Seven ETF',
  assetClass: 'etf',
  taxonomy: { sector: 'ETF', industry: 'Thematic ETF' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['nvda', 'aapl', 'msft', 'googl'],
  summary:
    "Equal-weight exposure to the seven mega-cap technology companies that drive most of the S&P 500's returns. A concentrated bet on big tech leadership continuing.",
  hyperliquid: ['MAGS'],
});
