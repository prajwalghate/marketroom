import { defineAsset } from '../types';

export default defineAsset({
  id: 'aapl',
  symbol: 'AAPL',
  name: 'Apple Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Hardware' },
  country: 'US',
  peRatio: 35,
  isPrivate: false,
  peers: ['msft', 'googl', 'meta'],
  summary:
    "The world's most valuable consumer-hardware franchise. The iPhone remains the anchor, but Apple's growth story is now its high-margin Services business — the App Store, iCloud, payments and subscriptions layered on roughly two billion active devices. It has been slower on generative AI than peers, partnering out some capabilities. Enormous cash flows and relentless buybacks support the stock. Risks: iPhone upgrade fatigue, China exposure, regulatory pressure on App Store fees, and the perception it is playing catch-up in AI.",
  hyperliquid: ['AAPL'],
  solana: [{ mint: 'XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp', issuer: 'Backed Finance' }],
});
