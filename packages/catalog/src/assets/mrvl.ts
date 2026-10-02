import { defineAsset } from '../types';

export default defineAsset({
  id: 'mrvl',
  symbol: 'MRVL',
  name: 'Marvell Technology, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductors' },
  country: 'US',
  peRatio: 40,
  isPrivate: false,
  peers: ['avgo', 'nvda'],
  summary:
    'A data-infrastructure chipmaker riding AI networking and custom-silicon demand. Marvell builds the interconnects, optical DSPs and custom compute chips that move data inside AI data centers, and is a key partner for hyperscalers designing their own accelerators. Growth is tied to the same AI-capex wave as NVIDIA and Broadcom, giving it a healthy OI cap. Execution on custom-silicon wins and networking share drives the stock.',
  solana: [{ mint: 'XsuxRGDzbLjnJ72v74b7p9VY6N66uYgTCyfwwRjVCJA', issuer: 'Backed Finance' }],
  hyperliquid: ['MRVL'],
});
