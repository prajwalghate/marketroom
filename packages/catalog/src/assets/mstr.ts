import { defineAsset } from '../types';

export default defineAsset({
  id: 'mstr',
  symbol: 'MSTR',
  name: 'Strategy Inc. (MicroStrategy)',
  assetClass: 'equity',
  taxonomy: { sector: 'Financials', industry: 'Digital Asset Treasury' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['strc', 'purrdat', 'bmnr'],
  summary:
    "Officially a software company, but in practice the largest corporate Bitcoin holder on the planet — a leveraged Bitcoin proxy dressed as an equity. Strategy raises debt and equity to buy and hold BTC, so its stock trades as an amplified bet on Bitcoin's price, often at a premium to the coins it owns. Accounting for its Bitcoin makes a conventional P/E meaningless. Extremely volatile; effectively a way to trade Bitcoin with equity-market plumbing.",
  hyperliquid: ['MSTR'],
  solana: [{ mint: 'XsP7xzNPvEHS1m6qfanPUGjNmdnmsLKEoNAnHjdxxyZ', issuer: 'Backed Finance' }],
});
