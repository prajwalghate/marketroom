import { defineAsset } from '../types';

export default defineAsset({
  id: 'unitree',
  symbol: 'UNITREE',
  name: 'Unitree Robotics',
  assetClass: 'equity',
  taxonomy: { sector: 'Industrials', industry: 'Robotics & Automation' },
  country: 'CN',
  peRatio: null,
  isPrivate: true,
  peers: ['bot', 'tsla'],
  summary:
    'A Chinese robotics maker that has driven quadruped and humanoid robot prices down by an order of magnitude. Private, and one of the clearest pure-plays on embodied AI reaching commercial cost points.',
  hyperliquid: ['UNITREE'],
});
