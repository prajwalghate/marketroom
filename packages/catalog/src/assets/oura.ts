import { defineAsset } from '../types';

export default defineAsset({
  id: 'oura',
  symbol: 'OURA',
  name: 'Oura Health Oy',
  assetClass: 'equity',
  taxonomy: { sector: 'Technology', industry: 'Hardware' },
  country: 'FI',
  peRatio: null,
  isPrivate: true,
  peers: ['hims'],
  summary:
    'A Finnish maker of smart rings for sleep and recovery tracking, and one of the few consumer wearables companies to build a durable subscription business. Still privately held.',
  hyperliquid: ['OURA'],
});
