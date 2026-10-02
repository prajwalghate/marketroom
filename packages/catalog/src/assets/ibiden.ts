import { defineAsset } from '../types';

export default defineAsset({
  id: 'ibiden',
  symbol: 'IBIDEN',
  name: 'Ibiden Co., Ltd.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductor Equipment' },
  country: 'JP',
  peRatio: 30,
  isPrivate: false,
  peers: ['amat', 'lrcx'],
  summary:
    'A Japanese maker of advanced IC package substrates, a genuine bottleneck component in AI accelerator production. A quiet but critical link in the NVIDIA supply chain.',
  hyperliquid: ['IBIDEN'],
});
