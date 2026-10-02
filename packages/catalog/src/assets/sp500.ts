import { defineAsset } from '../types';

export default defineAsset({
  id: 'sp500',
  symbol: 'SP500',
  name: 'S&P 500 Index',
  assetClass: 'index',
  taxonomy: { sector: 'Index', industry: 'US Equity Index' },
  country: null,
  peRatio: null,
  isPrivate: false,
  peers: ['xyz100', 'vix'],
  summary:
    'The benchmark US large-cap index, covering roughly 500 leading companies and about 80% of US market capitalisation. The single most-referenced equity benchmark in the world, and here one of the highest-volume markets on the venue — traders use it as a liquid proxy for broad US risk appetite without touching individual names.',
  hyperliquid: ['SP500'],
  // NOTE: deliberately NOT mapped to the Solana SPYx / GLDx tokens.
  // Those track an ETF share, which is priced at roughly 1/10 of this
  // instrument. Treating them as the same asset produced a meaningless ~980%
  // "cross-venue spread". Different unit scale = different asset.
});
