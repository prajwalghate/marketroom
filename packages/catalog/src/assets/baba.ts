import { defineAsset } from '../types';

export default defineAsset({
  id: 'baba',
  symbol: 'BABA',
  name: 'Alibaba Group Holding Ltd.',
  assetClass: 'equity',
  taxonomy: { sector: 'Consumer Discretionary', industry: 'E-commerce' },
  country: 'CN',
  peRatio: 18,
  isPrivate: false,
  peers: ['ebay', 'amzn', 'kstr'],
  summary:
    "China's e-commerce and cloud giant — Taobao, Tmall and Alibaba Cloud — and one of the country's leading AI developers via its Qwen models. Long weighed down by Chinese regulatory crackdowns and a weak consumer, the stock has swung on stimulus hopes and an AI-cloud re-rating. It offers cheap exposure to Chinese tech, but carries policy risk, U.S.-listing/delisting concerns and geopolitical overhang. Traded here as a U.S.-listed ADS.",
  hyperliquid: ['BABA'],
});
