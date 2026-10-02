import { defineAsset } from '../types';

export default defineAsset({
  id: 'bb',
  symbol: 'BB',
  name: 'BlackBerry Limited',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Security Software' },
  country: 'CA',
  peRatio: null,
  isPrivate: false,
  peers: ['crwd', 'net'],
  summary:
    "No longer a phone maker — today's BlackBerry is a software company centered on cybersecurity and its QNX embedded operating system, which runs in a huge share of the world's cars. The auto-software and IoT angle is the growth story; the cybersecurity unit is a turnaround. Earnings are thin, so the P/E is high or not meaningful. Canada-headquartered. A speculative software turnaround with a genuinely valuable embedded-systems franchise.",
  hyperliquid: ['BB'],
});
