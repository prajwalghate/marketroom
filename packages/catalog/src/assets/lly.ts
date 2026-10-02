import { defineAsset } from '../types';

export default defineAsset({
  id: 'lly',
  symbol: 'LLY',
  name: 'Eli Lilly and Company',
  assetClass: 'equity',
  taxonomy: { sector: 'Health Care', industry: 'Pharmaceuticals' },
  country: 'US',
  peRatio: 60,
  isPrivate: false,
  peers: ['hims', 'mrna', 'xbi'],
  summary:
    "The pharmaceutical company at the center of the obesity-drug boom. Lilly's GLP-1 therapies (tirzepatide) for diabetes and weight loss have become blockbusters, driving explosive revenue growth and one of the highest valuations in big pharma. It also has strong oncology, immunology and Alzheimer's pipelines. The premium P/E prices continued GLP-1 dominance; risks are manufacturing capacity, competition (notably Novo Nordisk), and pricing pressure. A rare high-growth story among healthcare mega-caps.",
  solana: [{ mint: 'Xsnuv4omNoHozR6EEW5mXkw8Nrny5rB3jVfLqi6gKMH', issuer: 'Backed Finance' }],
  hyperliquid: ['LLY'],
});
