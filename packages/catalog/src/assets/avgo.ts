import { defineAsset } from '../types';

export default defineAsset({
  id: 'avgo',
  symbol: 'AVGO',
  name: 'Broadcom Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductors' },
  country: 'US',
  peRatio: 85,
  isPrivate: false,
  peers: ['nvda', 'qcom'],
  summary:
    'A semiconductor and infrastructure-software conglomerate that quietly became an AI heavyweight. Broadcom designs custom AI chips (ASICs) for hyperscalers and dominates high-speed networking silicon — the plumbing of AI data centers. Its VMware acquisition added a large, sticky enterprise-software base. Acquisitive, cash-generative and dividend-paying, it trades on custom-silicon demand from a handful of giant customers, which is also its concentration risk.',
  hyperliquid: ['AVGO'],
});
