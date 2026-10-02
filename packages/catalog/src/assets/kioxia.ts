import { defineAsset } from '../types';

export default defineAsset({
  id: 'kioxia',
  symbol: 'KIOXIA',
  name: 'Kioxia Holdings Corporation',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Memory & Storage' },
  country: 'JP',
  peRatio: 15,
  isPrivate: false,
  peers: ['sndk', 'wdc', 'ymtc'],
  summary:
    "Japan's flagship NAND-flash maker, formerly Toshiba Memory, and one of the handful of companies that control global flash supply. Kioxia's fortunes rise and fall with the memory cycle, and AI-driven storage demand has been a tailwind. Recently public on the Tokyo Stock Exchange; priced in yen and oracle-converted to USD. A cyclical, supply-driven story much like SK hynix and Micron on the NAND side.",
  hyperliquid: ['KIOXIA'],
});
