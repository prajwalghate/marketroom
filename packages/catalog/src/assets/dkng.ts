import { defineAsset } from '../types';

export default defineAsset({
  id: 'dkng',
  symbol: 'DKNG',
  name: 'DraftKings Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Consumer Discretionary', industry: 'Gaming & Leisure' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['hood'],
  summary:
    'A leading U.S. online sports-betting and iGaming operator riding the state-by-state legalization of sports wagering. DraftKings has been spending heavily on marketing to win market share, so profitability is only recently emerging and its P/E is high or not meaningful. Growth tracks new state launches, hold rates and user monetization. A high-beta consumer-tech play; sensitive to regulation, competition (FanDuel) and sports calendars.',
  hyperliquid: ['DKNG'],
});
