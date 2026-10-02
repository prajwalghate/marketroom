import { defineAsset } from '../types';

export default defineAsset({
  id: 'koru',
  symbol: 'KORU',
  name: 'Direxion Daily South Korea Bull 3X',
  assetClass: 'etf',
  taxonomy: { sector: 'ETF', industry: 'Leveraged ETF' },
  country: 'KR',
  peRatio: null,
  isPrivate: false,
  peers: ['ewy', 'kr200'],
  summary:
    'A 3× daily leveraged South Korea ETF. Daily rebalancing causes decay in volatile conditions — a tactical instrument only.',
  hyperliquid: ['KORU'],
});
