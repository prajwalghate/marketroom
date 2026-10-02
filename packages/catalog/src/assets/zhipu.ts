import { defineAsset } from '../types';

export default defineAsset({
  id: 'zhipu',
  symbol: 'ZHIPU',
  name: 'Zhipu AI / Z.ai',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'AI Models' },
  country: 'CN',
  peRatio: null,
  isPrivate: true,
  peers: ['minimax', 'cambricon'],
  summary:
    "One of China's leading large-model developers (also known as Z.ai), building general-purpose AI models and applications across coding, vision, audio, video and agents. A flagship of China's AI ecosystem, recently public in Hong Kong, still in heavy-investment mode with no meaningful P/E. Alongside MiniMax, it lets traders take a position on China's frontier-AI champions. Priced in Hong Kong dollars, oracle-converted to USD; exposed to Chinese tech policy and U.S.–China tech tensions.",
  hyperliquid: ['ZHIPU'],
});
