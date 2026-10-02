import { defineAsset } from '../types';

export default defineAsset({
  id: 'crcl',
  symbol: 'CRCL',
  name: 'Circle Internet Group, Inc.',
  assetClass: 'equity',
  taxonomy: { sector: 'Financials', industry: 'Crypto Financials' },
  country: 'US',
  peRatio: null,
  isPrivate: false,
  peers: ['coin', 'bx'],
  summary:
    'The issuer of USDC, the second-largest dollar stablecoin, and one of the most important on-ramps between traditional dollars and crypto. Circle earns interest on the reserves backing USDC, so its revenue rises with both stablecoin supply and interest rates. A high-profile recent IPO, it trades on stablecoin adoption and regulatory tailwinds as the U.S. formalizes stablecoin rules. Earnings are rate-sensitive, and its valuation has been richly priced.',
  hyperliquid: ['CRCL'],
  solana: [{ mint: 'XsueG8BtpquVJX9LVLLEGuViXUungE6WmK5YZ3p3bd1', issuer: 'Backed Finance' }],
});
