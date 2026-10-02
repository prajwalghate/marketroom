import { defineAsset } from '../types';

export default defineAsset({
  id: 'crwd',
  symbol: 'CRWD',
  name: 'CrowdStrike Holdings, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Security Software' },
  country: 'US',
  peRatio: 120,
  isPrivate: false,
  peers: ['net', 'pltr'],
  summary:
    'A cloud-native endpoint security platform and one of the fastest-growing enterprise software franchises. Its 2024 faulty-update outage demonstrated both how deeply embedded it is in corporate IT and the concentration risk that creates.',
  hyperliquid: ['CRWD'],
});
