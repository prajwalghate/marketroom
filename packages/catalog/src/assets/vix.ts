import { defineAsset } from '../types';

export default defineAsset({
  id: 'vix',
  symbol: 'VIX',
  name: 'CBOE Volatility Index',
  assetClass: 'index',
  taxonomy: { sector: 'Index', industry: 'Volatility' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['sp500', 'vol'],
  summary:
    'The market\'s "fear gauge" — 30-day implied volatility on S&P 500 options. It is strongly negatively correlated with equities, spiking when markets fall, which makes it a hedging instrument rather than a directional one.',
  hyperliquid: ['VIX'],
});
