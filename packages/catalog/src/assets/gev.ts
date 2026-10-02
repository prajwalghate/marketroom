import { defineAsset } from '../types';

export default defineAsset({
  id: 'gev',
  symbol: 'GEV',
  name: 'GE Vernova Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Industrials', industry: 'Electrical Equipment' },
  country: 'US',
  peRatio: 50,
  isPrivate: false,
  peers: ['be', 'nbis'],
  summary:
    "General Electric's energy spin-off, covering gas turbines, grid equipment and wind. A direct beneficiary of data-centre electricity demand — AI compute is ultimately a power problem, and GEV sells the power equipment.",
  hyperliquid: ['GEV'],
});
