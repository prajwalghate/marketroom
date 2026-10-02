import { defineAsset } from '../types';

export default defineAsset({
  id: 'bot',
  symbol: 'BOT',
  name: 'RoboStrategy, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Industrials', industry: 'Robotics & Automation' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['unitree', 'tsla'],
  summary:
    "A publicly listed closed-end investment company focused on robotics and 'embodied AI' — it holds equity and equity-linked stakes across private and public robotics, humanoid and physical-AI companies. Rather than one operating business, it's a basket bet on the robotics theme, so its value tracks its holdings and it has no conventional P/E. A way to gain diversified, thematic exposure to the humanoid-robot and physical-AI trend in a single ticker. Sentiment- and NAV-driven.",
  hyperliquid: ['BOT'],
});
