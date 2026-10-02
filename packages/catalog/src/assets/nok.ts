import { defineAsset } from '../types';

export default defineAsset({
  id: 'nok',
  symbol: 'NOK',
  name: 'Nokia Corporation',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Communications Equipment' },
  country: 'FI',
  peRatio: 18,
  isPrivate: false,
  peers: ['lite', 'glw'],
  summary:
    "A Finnish telecom-infrastructure company — one of the few Western vendors of 5G network equipment alongside Ericsson, as operators seek alternatives to China's Huawei. Nokia sells to carriers and, increasingly, enterprises and data centers building private networks. It's a mature, dividend-paying value name with modest growth and a low P/E. Geopolitics (the shift away from Chinese vendors) is a structural tailwind; carrier capex cycles drive the swings.",
  hyperliquid: ['NOK'],
});
