import { defineAsset } from '../types';

export default defineAsset({
  id: 'ibm',
  symbol: 'IBM',
  name: 'International Business Machines',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'IT Services' },
  country: 'US',
  peRatio: 30,
  isPrivate: false,
  peers: ['orcl', 'dell'],
  summary:
    'The century-old tech institution reinvented around hybrid cloud (via Red Hat), consulting and enterprise AI (watsonx), with a side bet on quantum computing. IBM trades as a slower-growth, dividend-paying value name rather than a hyper-growth story. Its appeal is stability, cash flow and deep enterprise relationships; the risk is that growth stays modest while flashier rivals capture the AI narrative. A defensive way to hold big-tech exposure.',
  hyperliquid: ['IBM'],
});
