import { defineAsset } from '../types';

export default defineAsset({
  id: 'tsm',
  symbol: 'TSM',
  name: 'Taiwan Semiconductor (TSMC)',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductors' },
  country: 'TW',
  peRatio: 28,
  isPrivate: false,
  peers: ['smsn', 'umc', 'asml'],
  summary:
    "The world's most important company you rarely hear about. TSMC manufactures the advanced chips designed by NVIDIA, Apple, AMD and virtually everyone else — a near-monopoly on leading-edge fabrication. Its technology lead and pricing power are immense, and AI demand keeps its most advanced nodes sold out. The dominant risk is geopolitical: its concentration in Taiwan sits at the center of U.S.–China tension. Traded here as a U.S.-listed ADS.",
  solana: [{ mint: 'XsafvsGtzFqqHgTnA3aPC83EAMkacU5mcGtcSayhpVV', issuer: 'Backed Finance' }],
  hyperliquid: ['TSM'],
});
