import { defineAsset } from '../types';

export default defineAsset({
  id: 'hyundai',
  symbol: 'HYUNDAI',
  name: 'Hyundai Motor Company',
  assetClass: 'equity',
  taxonomy: { sector: 'Consumer Discretionary', industry: 'Automobiles' },
  country: 'KR',
  peRatio: 5,
  isPrivate: false,
  peers: ['tsla', 'rivn'],
  summary:
    "One of the world's largest automakers, and a serious EV and hybrid competitor whose designs have won broad praise. Hyundai also owns a controlling stake in robotics firm Boston Dynamics, giving it an under-appreciated robotics angle. It trades at a strikingly low single-digit P/E, typical of the deep value placed on Korean industrials ('the Korea discount'). Priced in won, oracle-converted to USD. A cheap, cash-generative auto play with an embedded robotics option.",
  hyperliquid: ['HYUNDAI'],
});
