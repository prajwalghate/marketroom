import { defineAsset } from '../types';

export default defineAsset({
  id: 'sndk',
  symbol: 'SNDK',
  name: 'Sandisk Corporation',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Memory & Storage' },
  country: 'US',
  peRatio: 15,
  isPrivate: false,
  peers: ['wdc', 'kioxia', 'mu'],
  summary:
    "The flash-memory and SSD business spun out of Western Digital, now trading as a standalone company. Sandisk makes NAND flash and solid-state storage for consumer devices, enterprise and data centers — a market lifted by AI's appetite for fast storage but subject to the same brutal memory cycles as DRAM. A large OI cap here suggests active trader interest in the newly independent name. Cyclical earnings keep the headline P/E low.",
  solana: [{ mint: 'Xswbpc8UqU6e1j9QZEWCjBMjyvz4twqD7PCy6j2e7jj', issuer: 'Backed Finance' }],
  hyperliquid: ['SNDK'],
});
