import { defineAsset } from '../types';

export default defineAsset({
  id: 'nflx',
  symbol: 'NFLX',
  name: 'Netflix, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Communication Services', industry: 'Entertainment' },
  country: 'US',
  peRatio: 45,
  isPrivate: false,
  peers: ['googl', 'meta'],
  summary:
    "The streaming leader that won the format it invented. After a growth scare, Netflix reignited results with a paid-sharing crackdown and a fast-growing ad tier, and it now generates substantial free cash flow. It's expanding into live events, gaming and advertising. The premium P/E prices continued subscriber and ad growth; risks include content costs, competition and saturation in mature markets. The clearest pure-play on streaming.",
  hyperliquid: ['NFLX'],
  solana: [{ mint: 'XsEH7wWfJJu2ZT3UCFeVfALnVA6CP5ur7Ee11KmzVpL', issuer: 'Backed Finance' }],
});
