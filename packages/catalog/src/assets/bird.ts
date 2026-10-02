import { defineAsset } from '../types';

export default defineAsset({
  id: 'bird',
  symbol: 'BIRD',
  name: 'NewBird AI (formerly Allbirds)',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Cloud & AI Infrastructure' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['crwv', 'shaz'],
  summary:
    "An unusual story: the company once known for sustainable wool footwear (Allbirds) is pivoting toward becoming a GPU-as-a-service and AI-cloud provider. This kind of dramatic reinvention toward AI infrastructure makes the stock highly speculative and narrative-driven, with no meaningful P/E through the transition. Traders here are betting on the pivot's credibility rather than the legacy shoe business. Expect volatility tied to announcements about the AI strategy's substance.",
  hyperliquid: ['BIRD'],
});
