import { defineAsset } from '../types';

export default defineAsset({
  id: 'smsn',
  symbol: 'SMSN',
  name: 'Samsung Electronics Co.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductors' },
  country: 'KR',
  peRatio: 12,
  isPrivate: false,
  peers: ['skhx', 'mu', 'kr200'],
  summary:
    'A sprawling conglomerate spanning memory chips, smartphones (Galaxy), displays and consumer electronics, plus a contract chip-foundry unit chasing TSMC. Samsung is a memory heavyweight racing to catch SK hynix in HBM while defending its handset and display leadership. The diversified base makes it steadier than pure-play memory names but also slower-moving. Trades at a low P/E typical of Korean industrials; priced in won, oracle-converted to USD.',
  hyperliquid: ['SMSN'],
});
