import { defineAsset } from '../types';

export default defineAsset({
  id: 'minimax',
  symbol: 'MINIMAX',
  name: 'MiniMax Group',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'AI Models' },
  country: 'CN',
  peRatio: null,
  isPrivate: true,
  peers: ['zhipu'],
  summary:
    "A Chinese AI company building multimodal foundation models spanning text, audio, image, video, coding and agentic workflows — one of China's most prominent AI-application startups. Recently listed in Hong Kong, it's an early-stage, growth-and-investment story with no meaningful P/E yet. This market offers rare synthetic exposure to the Chinese frontier-AI race. Priced in Hong Kong dollars and oracle-converted to USD; carries the policy and geopolitical risk common to Chinese tech.",
  hyperliquid: ['MINIMAX'],
});
