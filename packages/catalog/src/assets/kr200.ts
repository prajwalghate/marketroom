import { defineAsset } from '../types';

export default defineAsset({
  id: 'kr200',
  symbol: 'KR200',
  name: 'KOSPI 200 Index',
  assetClass: 'index',
  taxonomy: { sector: 'Index', industry: 'International Equity Index' },
  country: 'KR',
  peRatio: null,
  isPrivate: false,
  peers: ['ewy', 'skhx', 'smsn'],
  summary:
    "South Korea's large-cap benchmark, dominated by Samsung Electronics and SK hynix. In practice it trades as a leveraged expression of the memory-semiconductor cycle more than as a broad national index.",
  hyperliquid: ['KR200'],
});
