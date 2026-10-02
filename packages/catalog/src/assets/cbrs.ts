import { defineAsset } from '../types';

export default defineAsset({
  id: 'cbrs',
  symbol: 'CBRS',
  name: 'Cerebras Systems Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductors' },
  country: 'US',
  peRatio: null,
  isPrivate: true,
  peers: ['nvda', 'cambricon'],
  summary:
    'A challenger AI-chip company known for the wafer-scale engine — a single chip the size of a dinner plate built to train and run large models faster than clusters of conventional GPUs. Cerebras sells both systems and cloud AI compute, positioning itself as a NVIDIA alternative for certain workloads. Recently public and still scaling, so it has no meaningful P/E. A high-conviction, high-risk bet on differentiated AI hardware; sizeable OI cap for a young name.',
  hyperliquid: ['CBRS'],
});
