import { defineAsset } from '../types';

export default defineAsset({
  id: 'amat',
  symbol: 'AMAT',
  name: 'Applied Materials, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductor Equipment' },
  country: 'US',
  peRatio: 22,
  isPrivate: false,
  peers: ['asml', 'lrcx'],
  summary:
    'The largest supplier of semiconductor and display manufacturing equipment. Applied Materials sells the deposition, etching, implantation and inspection systems used to fabricate every chip, so it profits broadly from rising global chip capacity rather than any single design win. Growth tracks fab build-out and technology transitions; exposure to China export rules is a swing factor. A steadier, lower-P/E way to play the semiconductor cycle.',
  hyperliquid: ['AMAT'],
});
