import { defineAsset } from '../types';

export default defineAsset({
  id: 'meta',
  symbol: 'META',
  name: 'Meta Platforms, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Communication Services', industry: 'Interactive Media' },
  country: 'US',
  peRatio: 28,
  isPrivate: false,
  peers: ['googl', 'rddt', 'kstr'],
  summary:
    'Owner of Facebook, Instagram, WhatsApp and Threads — a digital-advertising machine reaching billions daily. AI-driven ad targeting and recommendation have reignited growth after a rough 2022. Meta open-sources its Llama models and spends aggressively on both AI infrastructure and its still-lossmaking Reality Labs metaverse division. The stock rewards ad strength and punishes any hint that the metaverse or AI capex is running ahead of returns. Regulatory and youth-safety scrutiny are constant.',
  hyperliquid: ['META'],
  solana: [{ mint: 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu', issuer: 'Backed Finance' }],
});
