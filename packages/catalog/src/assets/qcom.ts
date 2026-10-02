import { defineAsset } from '../types';

export default defineAsset({
  id: 'qcom',
  symbol: 'QCOM',
  name: 'Qualcomm Incorporated',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductors' },
  country: 'US',
  peRatio: 18,
  isPrivate: false,
  peers: ['avgo', 'arm'],
  summary:
    'The mobile-connectivity leader: Snapdragon processors and modem chips power much of the smartphone world, and its licensing business collects royalties across the industry. Qualcomm is diversifying into automotive, PCs and edge-AI to reduce handset dependence. A relatively low P/E reflects mature smartphone growth and concentration risk around key customers. On-device AI and its auto pipeline are the growth stories to watch.',
  hyperliquid: ['QCOM'],
});
