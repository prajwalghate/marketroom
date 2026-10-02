import { defineAsset } from '../types';

export default defineAsset({
  id: 'amd',
  symbol: 'AMD',
  name: 'Advanced Micro Devices, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Semiconductors' },
  country: 'US',
  peRatio: 105,
  isPrivate: false,
  peers: ['nvda', 'intc', 'avgo'],
  summary:
    "NVIDIA's chief challenger in AI accelerators and a share-gainer in server and PC CPUs. Its MI-series data-center GPUs are the credible number-two option for AI compute, and EPYC processors keep taking data-center share from Intel. The high P/E prices in rapid AI-driven growth, so any stumble in accelerator ramp or guidance hits hard. The bull thesis is a genuine two-horse race in AI silicon; the bear case is NVIDIA's software moat and AMD's execution risk.",
  hyperliquid: ['AMD'],
  solana: [{ mint: 'XsXcJ6GZ9kVnjqGsjBnktRcuwMBmvKWh8S93RefZ1rF', issuer: 'Backed Finance' }],
});
