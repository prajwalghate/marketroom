import { defineAsset } from '../types';

export default defineAsset({
  id: 'cvx',
  symbol: 'CVX',
  name: 'Chevron Corporation',
  assetClass: 'equity',
  taxonomy: { sector: 'Energy', industry: 'Integrated Oil & Gas' },
  country: 'US',
  peRatio: 15,
  isPrivate: false,
  peers: ['xle', 'cl'],
  summary:
    'A US integrated oil major spanning upstream production to refining, with a large Permian position. Valued on free cash flow and dividend durability rather than growth.',
  solana: [{ mint: 'XsNNMt7WTNA2sV3jrb1NNfNgapxRF5i4i6GcnTRRHts', issuer: 'Backed Finance' }],
  hyperliquid: ['CVX'],
});
