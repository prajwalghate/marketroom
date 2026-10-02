/**
 * Curated metadata for every live market, used once by `generate.ts` to emit
 * the per-asset files under `src/assets/`.
 *
 * Those generated files are the source of truth and are edited by hand from
 * then on — this table exists so the initial 129 entries could be produced
 * consistently rather than typed out one at a time.
 *
 * The taxonomy here deliberately replaces the reference's 49 flat freeform
 * strings with a two-level sector → industry tree.
 */

export interface Curated {
  symbol: string;
  name: string;
  assetClass: 'equity' | 'index' | 'etf' | 'commodity' | 'fx' | 'crypto';
  sector: string;
  industry: string;
  country: string | null;
  pe?: number | null;
  isPrivate?: boolean;
  peers?: string[];
  summary?: string;
  /** Hyperliquid venue symbol, when it differs from `symbol`. */
  hl?: string;
}

/** Reference sector string → our two-level taxonomy. */
export const TAXONOMY_MAP: Record<string, { sector: string; industry: string }> = {
  Semiconductors: { sector: 'Technology', industry: 'Semiconductors' },
  'Semiconductors (Memory)': { sector: 'Technology', industry: 'Memory & Storage' },
  'Semiconductors (NAND)': { sector: 'Technology', industry: 'Memory & Storage' },
  'Semiconductors & Software': { sector: 'Technology', industry: 'Semiconductors' },
  'Semiconductors & Electronics': { sector: 'Technology', industry: 'Semiconductors' },
  'Semiconductor Equipment': { sector: 'Technology', industry: 'Semiconductor Equipment' },
  'Semiconductor Foundry': { sector: 'Technology', industry: 'Semiconductors' },
  'Semiconductor IP': { sector: 'Technology', industry: 'Semiconductors' },
  'AI Chips': { sector: 'Technology', industry: 'Semiconductors' },
  'Data Storage': { sector: 'Technology', industry: 'Memory & Storage' },
  'Data Storage (Flash)': { sector: 'Technology', industry: 'Memory & Storage' },
  'AI Cloud': { sector: 'Technology', industry: 'Cloud & AI Infrastructure' },
  'AI Cloud & GPU': { sector: 'Technology', industry: 'Cloud & AI Infrastructure' },
  'AI Cloud & Consumer': { sector: 'Technology', industry: 'Cloud & AI Infrastructure' },
  'AI Models': { sector: 'Technology', industry: 'AI Models' },
  'Software & Cloud': { sector: 'Technology', industry: 'Software' },
  'Enterprise Software': { sector: 'Technology', industry: 'Software' },
  'Communications Software': { sector: 'Technology', industry: 'Software' },
  'Cybersecurity Software': { sector: 'Technology', industry: 'Security Software' },
  'Data & AI Software': { sector: 'Technology', industry: 'Software' },
  'Enterprise Tech': { sector: 'Technology', industry: 'IT Services' },
  'Hardware & Infrastructure': { sector: 'Technology', industry: 'Hardware' },
  'Consumer Electronics': { sector: 'Technology', industry: 'Hardware' },
  'Big Tech & Internet': { sector: 'Technology', industry: 'Internet' },
  'Social & Advertising': { sector: 'Communication Services', industry: 'Interactive Media' },
  'Streaming Media': { sector: 'Communication Services', industry: 'Entertainment' },
  'Telecom Equipment': { sector: 'Technology', industry: 'Communications Equipment' },
  'Optics & Photonics': { sector: 'Technology', industry: 'Communications Equipment' },
  'Quantum Computing': { sector: 'Technology', industry: 'Emerging Compute' },
  'Robotics & AI': { sector: 'Industrials', industry: 'Robotics & Automation' },
  'Space & Aerospace': { sector: 'Industrials', industry: 'Aerospace & Defense' },
  'Clean Energy': { sector: 'Energy', industry: 'Renewable Energy' },
  'Materials & Mining': { sector: 'Materials', industry: 'Metals & Mining' },
  Automotive: { sector: 'Consumer Discretionary', industry: 'Automobiles' },
  'EV & Auto': { sector: 'Consumer Discretionary', industry: 'Automobiles' },
  Retail: { sector: 'Consumer Discretionary', industry: 'Retail' },
  'E-commerce': { sector: 'Consumer Discretionary', industry: 'E-commerce' },
  'E-commerce & Cloud': { sector: 'Consumer Discretionary', industry: 'E-commerce' },
  'Online Betting': { sector: 'Consumer Discretionary', industry: 'Gaming & Leisure' },
  Pharmaceuticals: { sector: 'Health Care', industry: 'Pharmaceuticals' },
  'Healthcare & Telehealth': { sector: 'Health Care', industry: 'Health Care Services' },
  'Asset Management': { sector: 'Financials', industry: 'Asset Management' },
  'Fintech Brokerage': { sector: 'Financials', industry: 'Capital Markets' },
  'Crypto Exchange': { sector: 'Financials', industry: 'Crypto Financials' },
  'Stablecoin & Fintech': { sector: 'Financials', industry: 'Crypto Financials' },
  'Bitcoin Treasury': { sector: 'Financials', industry: 'Digital Asset Treasury' },
  'Bitcoin Treasury (Preferred)': { sector: 'Financials', industry: 'Digital Asset Treasury' },
  'Crypto Treasury': { sector: 'Financials', industry: 'Digital Asset Treasury' },
  'Tech Investment Holding': { sector: 'Financials', industry: 'Diversified Holdings' },
};

/** Reference country name → ISO-3166 alpha-2. */
export const COUNTRY_MAP: Record<string, string> = {
  USA: 'US',
  'South Korea': 'KR',
  China: 'CN',
  Netherlands: 'NL',
  Japan: 'JP',
  Taiwan: 'TW',
  'United Kingdom': 'GB',
  Canada: 'CA',
  Finland: 'FI',
  'USA / Australia': 'US/AU',
};

/**
 * The 67 live markets the reference never covered, plus corrections to its
 * ticker symbols. These are what turn a stale 62-row snapshot into full
 * coverage of the venue.
 */
export const EXTRA: Curated[] = [
  // --- Equity indices ---
  {
    symbol: 'SP500',
    name: 'S&P 500 Index',
    assetClass: 'index',
    sector: 'Index',
    industry: 'US Equity Index',
    country: null,
    peers: ['xyz100', 'vix'],
    summary:
      'The benchmark US large-cap index, covering roughly 500 leading companies and about 80% of US market capitalisation. The single most-referenced equity benchmark in the world, and here one of the highest-volume markets on the venue — traders use it as a liquid proxy for broad US risk appetite without touching individual names.',
  },
  {
    symbol: 'XYZ100',
    name: 'XYZ 100 Index',
    assetClass: 'index',
    sector: 'Index',
    industry: 'Thematic Index',
    country: null,
    peers: ['sp500'],
    summary:
      "The venue's own flagship basket index and, by 24h notional, the most actively traded market in the book. It offers broad exposure in a single position rather than requiring a basket of individual stock perps.",
  },
  {
    symbol: 'JP225',
    name: 'Nikkei 225 Index',
    assetClass: 'index',
    sector: 'Index',
    industry: 'International Equity Index',
    country: 'JP',
    peers: ['ewj', 'softbank'],
    summary:
      "Japan's headline equity benchmark, a price-weighted index of 225 Tokyo-listed companies. Heavily influenced by exporters and semiconductor-equipment names, and closely tied to the yen — a weaker JPY typically flatters it.",
  },
  {
    symbol: 'KR200',
    name: 'KOSPI 200 Index',
    assetClass: 'index',
    sector: 'Index',
    industry: 'International Equity Index',
    country: 'KR',
    peers: ['ewy', 'skhx', 'smsn'],
    summary:
      "South Korea's large-cap benchmark, dominated by Samsung Electronics and SK hynix. In practice it trades as a leveraged expression of the memory-semiconductor cycle more than as a broad national index.",
  },
  {
    symbol: 'NIFTY',
    name: 'Nifty 50 Index',
    assetClass: 'index',
    sector: 'Index',
    industry: 'International Equity Index',
    country: 'IN',
    peers: ['sp500'],
    summary:
      "India's benchmark index of 50 large-cap NSE-listed companies, weighted toward financials and IT services. A direct way to express a view on one of the fastest-growing major economies.",
  },
  {
    symbol: 'IBOV',
    name: 'Ibovespa Index',
    assetClass: 'index',
    sector: 'Index',
    industry: 'International Equity Index',
    country: 'BR',
    peers: ['ewz'],
    summary:
      "Brazil's headline equity index, concentrated in commodity producers and banks. Tends to track iron ore, oil and the real, making it a high-beta proxy for emerging-market commodity sentiment.",
  },
  {
    symbol: 'VIX',
    name: 'CBOE Volatility Index',
    assetClass: 'index',
    sector: 'Index',
    industry: 'Volatility',
    country: 'US',
    peers: ['sp500', 'vol'],
    summary:
      'The market\'s "fear gauge" — 30-day implied volatility on S&P 500 options. It is strongly negatively correlated with equities, spiking when markets fall, which makes it a hedging instrument rather than a directional one.',
  },
  {
    symbol: 'VOL',
    name: 'Volatility Index',
    assetClass: 'index',
    sector: 'Index',
    industry: 'Volatility',
    country: null,
    peers: ['vix'],
    summary:
      'A volatility benchmark market on the venue, used to take direct exposure to market turbulence rather than to price direction.',
  },
  {
    symbol: 'DXY',
    name: 'US Dollar Index',
    assetClass: 'fx',
    sector: 'Currency',
    industry: 'FX Index',
    country: 'US',
    peers: ['eur', 'jpy', 'gbp'],
    summary:
      'The dollar measured against a basket of six major currencies, dominated by the euro. A broad risk barometer: a rising DXY tightens global financial conditions and typically pressures commodities and emerging markets.',
  },

  // --- ETFs ---
  {
    symbol: 'SMH',
    name: 'VanEck Semiconductor ETF',
    assetClass: 'etf',
    sector: 'ETF',
    industry: 'Sector ETF',
    country: 'US',
    peers: ['nvda', 'tsm', 'soxl'],
    summary:
      'Concentrated exposure to the largest semiconductor companies, led by NVIDIA and TSMC. A single-ticket way to trade the AI hardware cycle without picking an individual winner.',
  },
  {
    symbol: 'SOXL',
    name: 'Direxion Daily Semiconductor Bull 3X',
    assetClass: 'etf',
    sector: 'ETF',
    industry: 'Leveraged ETF',
    country: 'US',
    peers: ['smh', 'nvda'],
    summary:
      'A 3× daily leveraged semiconductor ETF. Because leverage resets daily, it decays in choppy markets and is a short-horizon trading instrument, not a hold — and trading it as a perp layers leverage on leverage.',
  },
  {
    symbol: 'MAGS',
    name: 'Roundhill Magnificent Seven ETF',
    assetClass: 'etf',
    sector: 'ETF',
    industry: 'Thematic ETF',
    country: 'US',
    peers: ['nvda', 'aapl', 'msft', 'googl'],
    summary:
      "Equal-weight exposure to the seven mega-cap technology companies that drive most of the S&P 500's returns. A concentrated bet on big tech leadership continuing.",
  },
  {
    symbol: 'XLE',
    name: 'Energy Select Sector SPDR',
    assetClass: 'etf',
    sector: 'ETF',
    industry: 'Sector ETF',
    country: 'US',
    peers: ['cvx', 'cl'],
    summary:
      'The large-cap US energy sector, dominated by integrated oil majors. Tracks crude prices with a lag and provides equity-flavoured energy exposure rather than direct commodity risk.',
  },
  {
    symbol: 'XBI',
    name: 'SPDR S&P Biotech ETF',
    assetClass: 'etf',
    sector: 'ETF',
    industry: 'Sector ETF',
    country: 'US',
    peers: ['mrna', 'lly'],
    summary:
      'Equal-weighted US biotech, which tilts it toward small and mid-cap drug developers. Highly sensitive to interest rates and clinical-trial outcomes, making it one of the more volatile sector ETFs.',
  },
  {
    symbol: 'URNM',
    name: 'Sprott Uranium Miners ETF',
    assetClass: 'etf',
    sector: 'ETF',
    industry: 'Thematic ETF',
    country: 'US',
    peers: ['uranium'],
    summary:
      'Uranium miners and physical uranium holdings. A levered play on nuclear power demand — including the growing argument that AI data-centre load needs baseload nuclear generation.',
  },
  {
    symbol: 'TLT',
    name: 'iShares 20+ Year Treasury Bond ETF',
    assetClass: 'etf',
    sector: 'ETF',
    industry: 'Fixed Income ETF',
    country: 'US',
    peers: ['sp500'],
    summary:
      'Long-dated US Treasuries, and the cleanest liquid proxy for long-end interest rates. Its price moves inversely to yields, making it the standard instrument for expressing a duration view.',
  },
  {
    symbol: 'EWY',
    name: 'iShares MSCI South Korea ETF',
    assetClass: 'etf',
    sector: 'ETF',
    industry: 'Country ETF',
    country: 'KR',
    peers: ['kr200', 'skhx', 'smsn'],
    summary:
      'South Korean equities in dollar terms, heavily concentrated in Samsung and SK hynix. Carries both equity and won currency risk.',
  },
  {
    symbol: 'EWJ',
    name: 'iShares MSCI Japan ETF',
    assetClass: 'etf',
    sector: 'ETF',
    industry: 'Country ETF',
    country: 'JP',
    peers: ['jp225', 'softbank'],
    summary:
      'Broad Japanese equity exposure in dollars. Unhedged, so a weakening yen can offset local-currency equity gains — a dynamic that has repeatedly caught out foreign investors.',
  },
  {
    symbol: 'EWT',
    name: 'iShares MSCI Taiwan ETF',
    assetClass: 'etf',
    sector: 'ETF',
    industry: 'Country ETF',
    country: 'TW',
    peers: ['tsm'],
    summary:
      'Taiwanese equities, dominated by TSMC to the point that it trades largely as a TSMC proxy with added geopolitical risk premium.',
  },
  {
    symbol: 'EWZ',
    name: 'iShares MSCI Brazil ETF',
    assetClass: 'etf',
    sector: 'ETF',
    industry: 'Country ETF',
    country: 'BR',
    peers: ['ibov'],
    summary:
      'Brazilian large-caps in dollar terms, concentrated in commodities and banking. High beta to commodity prices and to the real.',
  },
  {
    symbol: 'KORU',
    name: 'Direxion Daily South Korea Bull 3X',
    assetClass: 'etf',
    sector: 'ETF',
    industry: 'Leveraged ETF',
    country: 'KR',
    peers: ['ewy', 'kr200'],
    summary:
      'A 3× daily leveraged South Korea ETF. Daily rebalancing causes decay in volatile conditions — a tactical instrument only.',
  },

  // --- Commodities ---
  {
    symbol: 'GOLD',
    name: 'Gold',
    assetClass: 'commodity',
    sector: 'Commodity',
    industry: 'Precious Metals',
    country: null,
    peers: ['silver', 'platinum'],
    summary:
      'The oldest monetary asset and the default haven. Gold responds to real interest rates, the dollar and central-bank buying rather than to industrial demand, which is what makes it a genuine portfolio diversifier.',
  },
  {
    symbol: 'SILVER',
    name: 'Silver',
    assetClass: 'commodity',
    sector: 'Commodity',
    industry: 'Precious Metals',
    country: null,
    peers: ['gold'],
    summary:
      'Both a precious and an industrial metal — roughly half of demand is industrial, much of it solar. That dual role makes silver more volatile than gold and more sensitive to the manufacturing cycle.',
  },
  {
    symbol: 'PLATINUM',
    name: 'Platinum',
    assetClass: 'commodity',
    sector: 'Commodity',
    industry: 'Precious Metals',
    country: null,
    peers: ['palladium', 'gold'],
    summary:
      'A precious metal with heavy autocatalyst demand, concentrated in South African supply. Its price is driven as much by mine disruption and vehicle emissions rules as by investment flows.',
  },
  {
    symbol: 'PALLADIUM',
    name: 'Palladium',
    assetClass: 'commodity',
    sector: 'Commodity',
    industry: 'Precious Metals',
    country: null,
    peers: ['platinum'],
    summary:
      'Primarily a gasoline-autocatalyst metal with highly concentrated Russian and South African supply. Thin liquidity and supply concentration make it prone to violent squeezes.',
  },
  {
    symbol: 'COPPER',
    name: 'Copper',
    assetClass: 'commodity',
    sector: 'Commodity',
    industry: 'Base Metals',
    country: null,
    peers: ['aluminium'],
    summary:
      'Known as "Dr. Copper" for its read on global industrial health. Structural demand from electrification, grid build-out and data centres is colliding with a thin mine-supply pipeline.',
  },
  {
    symbol: 'ALUMINIUM',
    name: 'Aluminium',
    assetClass: 'commodity',
    sector: 'Commodity',
    industry: 'Base Metals',
    country: null,
    peers: ['copper'],
    summary:
      'An energy-intensive base metal — smelting economics track power prices closely, so aluminium often trades as a derivative of energy costs as much as of industrial demand.',
  },
  {
    symbol: 'CL',
    name: 'WTI Crude Oil',
    assetClass: 'commodity',
    sector: 'Commodity',
    industry: 'Energy',
    country: 'US',
    peers: ['brentoil', 'xle'],
    summary:
      'West Texas Intermediate, the US crude benchmark priced at Cushing, Oklahoma. One of the highest-volume markets on the venue and the reference price for North American oil.',
  },
  {
    symbol: 'BRENTOIL',
    name: 'Brent Crude Oil',
    assetClass: 'commodity',
    sector: 'Commodity',
    industry: 'Energy',
    country: null,
    peers: ['cl'],
    summary:
      'The global seaborne crude benchmark, pricing roughly two-thirds of internationally traded oil. More exposed to geopolitical supply risk than WTI; the Brent-WTI spread is itself a widely traded relationship.',
  },
  {
    symbol: 'NATGAS',
    name: 'Natural Gas (Henry Hub)',
    assetClass: 'commodity',
    sector: 'Commodity',
    industry: 'Energy',
    country: 'US',
    peers: ['ttf', 'cl'],
    summary:
      'The US natural gas benchmark. Notoriously volatile — weather, storage levels and LNG export capacity can move it double digits in a session.',
  },
  {
    symbol: 'TTF',
    name: 'Dutch TTF Natural Gas',
    assetClass: 'commodity',
    sector: 'Commodity',
    industry: 'Energy',
    country: null,
    peers: ['natgas'],
    summary:
      "The European gas benchmark, and the price that defined the continent's 2022 energy crisis. Driven by LNG import competition, storage levels and winter weather.",
  },
  {
    symbol: 'HO',
    name: 'Heating Oil',
    assetClass: 'commodity',
    sector: 'Commodity',
    industry: 'Energy',
    country: 'US',
    peers: ['cl'],
    summary:
      'A refined distillate contract that also serves as a proxy for diesel. The crack spread against crude is a direct read on refining margins.',
  },
  {
    symbol: 'URANIUM',
    name: 'Uranium',
    assetClass: 'commodity',
    sector: 'Commodity',
    industry: 'Energy',
    country: null,
    peers: ['urnm'],
    summary:
      'Nuclear fuel, traded in a thin and opaque market historically dominated by long-term utility contracts. Renewed interest is driven by decarbonisation and by data-centre power demand.',
  },
  {
    symbol: 'CORN',
    name: 'Corn',
    assetClass: 'commodity',
    sector: 'Commodity',
    industry: 'Agriculture',
    country: 'US',
    peers: ['wheat'],
    summary:
      'The largest US grain crop, used for feed, ethanol and food. Driven by planting acreage, weather in the Midwest and export demand.',
  },
  {
    symbol: 'WHEAT',
    name: 'Wheat',
    assetClass: 'commodity',
    sector: 'Commodity',
    industry: 'Agriculture',
    country: null,
    peers: ['corn'],
    summary:
      'A global food staple with supply concentrated in a handful of exporting regions, which makes it unusually sensitive to conflict and export restrictions.',
  },

  // --- FX ---
  {
    symbol: 'EUR',
    name: 'Euro / US Dollar',
    assetClass: 'fx',
    sector: 'Currency',
    industry: 'Major FX',
    country: null,
    peers: ['dxy', 'gbp'],
    summary:
      'The most traded currency pair in the world. Driven by the ECB–Fed policy differential and by European energy costs, and the dominant component of the dollar index.',
  },
  {
    symbol: 'JPY',
    name: 'Japanese Yen / US Dollar',
    assetClass: 'fx',
    sector: 'Currency',
    industry: 'Major FX',
    country: 'JP',
    peers: ['jp225', 'dxy'],
    summary:
      'A traditional funding currency and haven. Decades of ultra-low Japanese rates made the yen the leg of the global carry trade, so unwinds can be violent and spill into equities.',
  },
  {
    symbol: 'GBP',
    name: 'British Pound / US Dollar',
    assetClass: 'fx',
    sector: 'Currency',
    industry: 'Major FX',
    country: 'GB',
    peers: ['eur', 'dxy'],
    summary:
      'Sterling against the dollar, "cable". Sensitive to Bank of England policy and UK fiscal credibility — the 2022 gilt crisis showed how fast that repricing can happen.',
  },
  {
    symbol: 'KRW',
    name: 'Korean Won / US Dollar',
    assetClass: 'fx',
    sector: 'Currency',
    industry: 'Asian FX',
    country: 'KR',
    peers: ['kr200', 'ewy'],
    summary:
      'The won is a high-beta Asian currency closely tied to the semiconductor export cycle, which makes it an indirect read on global memory demand.',
  },

  // --- Technology equities missing from the reference ---
  {
    symbol: 'NET',
    name: 'Cloudflare, Inc.',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Cloud & AI Infrastructure',
    country: 'US',
    pe: null,
    peers: ['crwd', 'crwv'],
    summary:
      'An edge network sitting in front of a large share of the web, providing CDN, DDoS protection and zero-trust security. It has pushed aggressively into edge compute and inference, positioning itself as infrastructure for distributed AI workloads.',
  },
  {
    symbol: 'CRWD',
    name: 'CrowdStrike Holdings, Inc.',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Security Software',
    country: 'US',
    pe: 120,
    peers: ['net', 'pltr'],
    summary:
      'A cloud-native endpoint security platform and one of the fastest-growing enterprise software franchises. Its 2024 faulty-update outage demonstrated both how deeply embedded it is in corporate IT and the concentration risk that creates.',
  },
  {
    symbol: 'RDDT',
    name: 'Reddit, Inc.',
    assetClass: 'equity',
    sector: 'Communication Services',
    industry: 'Interactive Media',
    country: 'US',
    pe: null,
    peers: ['meta'],
    summary:
      'A large social discussion platform whose archive of human-written conversation turned out to be valuable AI training data, producing substantial data-licensing revenue alongside advertising.',
  },
  {
    symbol: 'MRNA',
    name: 'Moderna, Inc.',
    assetClass: 'equity',
    sector: 'Health Care',
    industry: 'Biotechnology',
    country: 'US',
    pe: null,
    peers: ['lly', 'xbi'],
    summary:
      'An mRNA biotechnology company that scaled dramatically during the pandemic and has since faced collapsing vaccine demand. The investment case now rests on whether its mRNA platform delivers in oncology and other indications.',
  },
  {
    symbol: 'IREN',
    name: 'IREN Limited',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Cloud & AI Infrastructure',
    country: 'AU',
    pe: null,
    peers: ['crwv', 'bmnr'],
    summary:
      'A bitcoin miner that has pivoted toward AI data-centre hosting, converting power-dense sites into GPU capacity. Its value rests on secured grid connections — the scarcest input in AI infrastructure.',
  },
  {
    symbol: 'AAOI',
    name: 'Applied Optoelectronics, Inc.',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Communications Equipment',
    country: 'US',
    pe: null,
    peers: ['lite', 'glw'],
    summary:
      'A supplier of optical transceivers for data-centre interconnect. Small and volatile, but directly levered to the optics build-out that AI cluster networking demands.',
  },
  {
    symbol: 'LRCX',
    name: 'Lam Research Corporation',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Semiconductor Equipment',
    country: 'US',
    pe: 25,
    peers: ['amat', 'asml'],
    summary:
      'A leading supplier of etch and deposition equipment, with particular strength in memory manufacturing. Its order book is one of the better leading indicators for the NAND and DRAM capex cycle.',
  },
  {
    symbol: 'GLW',
    name: 'Corning Incorporated',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Communications Equipment',
    country: 'US',
    pe: 25,
    peers: ['aaoi', 'lite'],
    summary:
      'A materials science company making display glass, Gorilla Glass and optical fibre. The optical communications segment has become the growth story as AI data centres consume enormous quantities of fibre.',
  },
  {
    symbol: 'UMC',
    name: 'United Microelectronics Corp.',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Semiconductors',
    country: 'TW',
    pe: 14,
    peers: ['tsm'],
    summary:
      "Taiwan's second foundry, specialising in mature-node manufacturing rather than competing at the leading edge. Exposed to automotive and consumer chip demand and to Chinese mature-node competition.",
  },
  {
    symbol: 'TWST',
    name: 'Twist Bioscience Corporation',
    assetClass: 'equity',
    sector: 'Health Care',
    industry: 'Life Sciences Tools',
    country: 'US',
    pe: null,
    peers: ['xbi'],
    summary:
      'A synthetic DNA manufacturer using a silicon-based platform to drive down the cost of writing DNA, serving drug discovery and DNA data storage research.',
  },
  {
    symbol: 'OURA',
    name: 'Oura Health Oy',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Hardware',
    country: 'FI',
    pe: null,
    isPrivate: true,
    peers: ['hims'],
    summary:
      'A Finnish maker of smart rings for sleep and recovery tracking, and one of the few consumer wearables companies to build a durable subscription business. Still privately held.',
  },
  {
    symbol: 'SHEIN',
    name: 'Shein Group Ltd.',
    assetClass: 'equity',
    sector: 'Consumer Discretionary',
    industry: 'E-commerce',
    country: 'SG',
    pe: null,
    isPrivate: true,
    peers: ['baba', 'ebay'],
    summary:
      'An ultra-fast-fashion retailer built on an on-demand supply chain that compresses design-to-delivery to days. Private, with a long-rumoured listing and persistent regulatory and labour scrutiny.',
  },
  {
    symbol: 'UNITREE',
    name: 'Unitree Robotics',
    assetClass: 'equity',
    sector: 'Industrials',
    industry: 'Robotics & Automation',
    country: 'CN',
    pe: null,
    isPrivate: true,
    peers: ['bot', 'tsla'],
    summary:
      'A Chinese robotics maker that has driven quadruped and humanoid robot prices down by an order of magnitude. Private, and one of the clearest pure-plays on embodied AI reaching commercial cost points.',
  },
  {
    symbol: 'CAMBRICON',
    name: 'Cambricon Technologies',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Semiconductors',
    country: 'CN',
    pe: null,
    peers: ['cbrs', 'nvda'],
    summary:
      "A Chinese AI chip designer positioned as a domestic alternative to NVIDIA. Its prospects are tied directly to export controls and to Beijing's semiconductor self-sufficiency push.",
  },
  {
    symbol: 'YMTC',
    name: 'Yangtze Memory Technologies',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Memory & Storage',
    country: 'CN',
    pe: null,
    isPrivate: true,
    peers: ['mu', 'skhx'],
    summary:
      "China's leading NAND flash manufacturer, notable for its Xtacking architecture. Operating under US export restrictions, making its technology roadmap a geopolitical question as much as an engineering one.",
  },
  {
    symbol: 'CXMT',
    name: 'ChangXin Memory Technologies',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Memory & Storage',
    country: 'CN',
    pe: null,
    isPrivate: true,
    peers: ['mu', 'skhx', 'dram'],
    summary:
      "China's principal DRAM manufacturer and the main domestic challenger to the Samsung–SK hynix–Micron oligopoly. Its capacity ramp is one of the key variables in the memory cycle.",
  },
  {
    symbol: 'IBIDEN',
    name: 'Ibiden Co., Ltd.',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Semiconductor Equipment',
    country: 'JP',
    pe: 30,
    peers: ['amat', 'lrcx'],
    summary:
      'A Japanese maker of advanced IC package substrates, a genuine bottleneck component in AI accelerator production. A quiet but critical link in the NVIDIA supply chain.',
  },
  {
    symbol: 'GIGADEV',
    name: 'GigaDevice Semiconductor',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Memory & Storage',
    country: 'CN',
    pe: 40,
    peers: ['cxmt', 'mu'],
    summary:
      'A Chinese supplier of NOR flash memory and microcontrollers, a significant beneficiary of domestic substitution in Chinese electronics manufacturing.',
  },
  {
    symbol: 'KSTR',
    name: 'Kuaishou Technology',
    assetClass: 'equity',
    sector: 'Communication Services',
    industry: 'Interactive Media',
    country: 'CN',
    pe: 15,
    peers: ['meta', 'rddt'],
    summary:
      'A Chinese short-video and live-streaming platform, the main domestic rival to Douyin, with a large live-commerce business and its own video generation models.',
  },
  {
    symbol: 'GEV',
    name: 'GE Vernova Inc.',
    assetClass: 'equity',
    sector: 'Industrials',
    industry: 'Electrical Equipment',
    country: 'US',
    pe: 50,
    peers: ['be', 'nbis'],
    summary:
      "General Electric's energy spin-off, covering gas turbines, grid equipment and wind. A direct beneficiary of data-centre electricity demand — AI compute is ultimately a power problem, and GEV sells the power equipment.",
  },
  {
    symbol: 'LYTE',
    name: 'Lightmatter, Inc.',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Emerging Compute',
    country: 'US',
    pe: null,
    isPrivate: true,
    peers: ['qnt', 'lite'],
    summary:
      'A photonic computing company using light rather than electrons for chip interconnect, targeting the bandwidth and power limits of large AI clusters. Private and pre-revenue at scale.',
  },
  {
    symbol: 'NCLD',
    name: 'Nscale Global Holdings',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Cloud & AI Infrastructure',
    country: 'GB',
    pe: null,
    isPrivate: true,
    peers: ['crwv', 'nbis'],
    summary:
      'A GPU cloud operator building out AI data-centre capacity with an emphasis on low-carbon power. Private, competing in the neocloud segment against CoreWeave and Nebius.',
  },
  {
    symbol: 'BMNR',
    name: 'Bitmine Immersion Technologies',
    assetClass: 'equity',
    sector: 'Financials',
    industry: 'Digital Asset Treasury',
    country: 'US',
    pe: null,
    peers: ['mstr', 'iren'],
    summary:
      'A digital asset treasury and immersion-cooled mining company. Like other treasury vehicles it trades largely as a leveraged proxy for its underlying crypto holdings rather than on operating fundamentals.',
  },
  {
    symbol: 'SNXX',
    name: 'Synopsys Inc.',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Software',
    country: 'US',
    pe: 45,
    peers: ['now', 'arm'],
    summary:
      'The dominant electronic design automation vendor. Every advanced chip is designed in software like this, giving it a toll-booth position across the entire semiconductor industry.',
  },
  {
    symbol: 'CVX',
    name: 'Chevron Corporation',
    assetClass: 'equity',
    sector: 'Energy',
    industry: 'Integrated Oil & Gas',
    country: 'US',
    pe: 15,
    peers: ['xle', 'cl'],
    summary:
      'A US integrated oil major spanning upstream production to refining, with a large Permian position. Valued on free cash flow and dividend durability rather than growth.',
  },
  {
    symbol: 'DRAM',
    name: 'DRAM Spot Price Index',
    assetClass: 'index',
    sector: 'Index',
    industry: 'Commodity Index',
    country: null,
    peers: ['mu', 'skhx', 'cxmt'],
    summary:
      'A spot price benchmark for DRAM memory chips. Memory is genuinely commodity-like and deeply cyclical, and this gives direct exposure to that cycle without taking single-company risk.',
  },
  {
    symbol: 'H100',
    name: 'NVIDIA H100 GPU Price Index',
    assetClass: 'index',
    sector: 'Index',
    industry: 'Commodity Index',
    country: null,
    peers: ['nvda', 'crwv'],
    summary:
      'A price benchmark for H100 GPU rental or spot capacity — effectively the unit cost of AI compute. One of the more novel markets in the book, turning compute scarcity itself into a tradable instrument.',
  },
  {
    symbol: 'SKHY',
    name: 'SK hynix (secondary line)',
    assetClass: 'equity',
    sector: 'Technology',
    industry: 'Memory & Storage',
    country: 'KR',
    pe: 10,
    peers: ['skhx', 'mu'],
    summary:
      'A second SK hynix market line on the venue, alongside the primary SKHX listing. SK hynix is the leading supplier of HBM memory for AI accelerators.',
  },
];

/** Ticker corrections: reference display name → actual venue symbol. */
export const SYMBOL_FIXES: Record<string, string> = {
  SKHYNIX: 'SKHX',
  SAMSUNG: 'SMSN',
  WTIOIL: 'CL',
};

/** Peer relationships for the reference's 62, which had no peer concept at all. */
export const PEERS: Record<string, string[]> = {
  nvda: ['amd', 'avgo', 'tsm', 'smh'],
  amd: ['nvda', 'intc', 'avgo'],
  intc: ['amd', 'nvda', 'tsm'],
  tsm: ['smsn', 'umc', 'asml'],
  mu: ['skhx', 'smsn', 'dram'],
  skhx: ['mu', 'smsn', 'dram'],
  smsn: ['skhx', 'mu', 'kr200'],
  sndk: ['wdc', 'kioxia', 'mu'],
  wdc: ['sndk', 'kioxia'],
  kioxia: ['sndk', 'wdc', 'ymtc'],
  asml: ['amat', 'lrcx', 'tsm'],
  amat: ['asml', 'lrcx'],
  aapl: ['msft', 'googl', 'meta'],
  msft: ['googl', 'amzn', 'orcl'],
  googl: ['meta', 'msft', 'amzn'],
  meta: ['googl', 'rddt', 'kstr'],
  amzn: ['baba', 'msft', 'ebay'],
  tsla: ['rivn', 'hyundai', 'bot'],
  rivn: ['tsla', 'hyundai'],
  hyundai: ['tsla', 'rivn'],
  mstr: ['strc', 'purrdat', 'bmnr'],
  strc: ['mstr', 'purrdat'],
  purrdat: ['mstr', 'strc'],
  coin: ['hood', 'crcl'],
  hood: ['coin', 'dkng'],
  crcl: ['coin', 'bx'],
  crwv: ['nbis', 'iren', 'ncld'],
  nbis: ['crwv', 'iren', 'ncld'],
  shaz: ['crwv', 'nbis'],
  bird: ['crwv', 'shaz'],
  zhipu: ['minimax', 'cambricon'],
  minimax: ['zhipu'],
  pltr: ['crwd', 'now'],
  now: ['pltr', 'snxx'],
  bb: ['crwd', 'net'],
  cbrs: ['nvda', 'cambricon'],
  arm: ['nvda', 'qcom'],
  qcom: ['avgo', 'arm'],
  avgo: ['nvda', 'qcom'],
  mrvl: ['avgo', 'nvda'],
  orcl: ['msft', 'ibm'],
  ibm: ['orcl', 'dell'],
  dell: ['ibm', 'wdc'],
  nflx: ['googl', 'meta'],
  cost: ['gme', 'ebay'],
  gme: ['cost', 'ebay'],
  ebay: ['baba', 'amzn'],
  baba: ['ebay', 'amzn', 'kstr'],
  lly: ['hims', 'mrna', 'xbi'],
  hims: ['lly', 'oura'],
  be: ['gev', 'usar'],
  usar: ['copper', 'be'],
  bx: ['crcl', 'hood'],
  dkng: ['hood'],
  nok: ['lite', 'glw'],
  lite: ['aaoi', 'glw', 'nok'],
  bot: ['unitree', 'tsla'],
  softbank: ['arm', 'jp225'],
  qnt: ['lyte', 'cbrs'],
  spcx: ['rklb'],
  rklb: ['spcx'],
  zm: ['now', 'net'],
};
