import { defineAsset } from '../types';

export default defineAsset({
  id: 'gigadev',
  symbol: 'GIGADEV',
  name: 'GigaDevice Semiconductor',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Memory & Storage' },
  country: 'CN',
  peRatio: 40,
  isPrivate: false,
  peers: ['cxmt', 'mu'],
  summary:
    'A Chinese supplier of NOR flash memory and microcontrollers, a significant beneficiary of domestic substitution in Chinese electronics manufacturing.',
  hyperliquid: ['GIGADEV'],
});
