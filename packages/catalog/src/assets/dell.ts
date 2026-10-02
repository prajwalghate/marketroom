import { defineAsset } from '../types';

export default defineAsset({
  id: 'dell',
  symbol: 'DELL',
  name: 'Dell Technologies Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Hardware' },
  country: 'US',
  peRatio: 20,
  isPrivate: false,
  peers: ['ibm', 'wdc'],
  summary:
    "A PC and enterprise-infrastructure maker that turned into a surprise AI beneficiary. Dell's server business is booming as enterprises and cloud providers buy AI-optimized systems packed with GPUs, though those servers carry thinner margins than its traditional gear. The stock blends a steady PC/services base with an AI-server growth kicker. A reasonable P/E for a lower-margin hardware model; watch AI-server backlog and margin mix.",
  hyperliquid: ['DELL'],
});
