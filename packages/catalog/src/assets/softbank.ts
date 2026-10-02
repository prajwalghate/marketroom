import { defineAsset } from '../types';

export default defineAsset({
  id: 'softbank',
  symbol: 'SOFTBANK',
  name: 'SoftBank Group Corp.',
  assetClass: 'equity',
  taxonomy: { sector: 'Financials', industry: 'Diversified Holdings' },
  country: 'JP',
  peRatio: 15,
  isPrivate: false,
  peers: ['arm', 'jp225'],
  summary:
    "A Japanese technology-investment holding company — effectively a giant, high-conviction AI portfolio. SoftBank owns a controlling stake in Arm, runs the Vision Fund, and has made huge bets across AI and semiconductors. Its stock trades on the value of those holdings (net asset value) and famously at a discount to them, so a P/E is only loosely meaningful. Volatile and reflexive to the AI trade and to Arm's share price. Priced in yen, oracle-converted to USD.",
  hyperliquid: ['SOFTBANK'],
});
