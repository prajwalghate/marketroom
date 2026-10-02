import { defineAsset } from '../types';

export default defineAsset({
  id: 'coin',
  symbol: 'COIN',
  name: 'Coinbase Global, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Financials', industry: 'Crypto Financials' },
  country: 'US',
  peRatio: 40,
  isPrivate: false,
  peers: ['hood', 'crcl'],
  summary:
    'The largest publicly traded U.S. crypto exchange and a proxy for crypto adoption itself. Coinbase earns trading fees, custody and a growing stream of stablecoin and subscription revenue, and it operates the Base layer-2 network. Earnings are highly sensitive to crypto market cycles, so its P/E is volatile and cycle-dependent. Regulatory clarity in the U.S. is a major swing factor — friendlier rules expand its runway; crackdowns compress it.',
  hyperliquid: ['COIN'],
  solana: [{ mint: 'Xs7ZdzSHLU9ftNJsii5fCeJhoRWSC32SQGzGQtePxNu', issuer: 'Backed Finance' }],
});
