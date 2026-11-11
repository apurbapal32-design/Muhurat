export type SignalType = 'BUY' | 'SELL' | 'NEUTRAL';

export type OIBuildupType =
  | 'LONG_BUILDUP'
  | 'SHORT_BUILDUP'
  | 'SHORT_COVERING'
  | 'LONG_UNWINDING'
  | 'NEUTRAL';

export interface OptionStrikeData {
  strike: number;
  callOI: number;
  callChangeOI: number;
  putOI: number;
  putChangeOI: number;
  callLtp: number;
  putLtp: number;
  callIv?: number;
  putIv?: number;
}

export interface StockOIData {
  openInterest: number; // In Lakhs contracts
  changeInOI: number; // Absolute change in Lakhs
  changeInOIPercent: number; // % Change in OI today
  pcr: number; // Put-Call Ratio
  buildup: OIBuildupType;
  maxPainStrike: number;
  totalCallOI: number; // Total Call OI in Lakhs
  totalPutOI: number; // Total Put OI in Lakhs
  atmStrike: number;
  iv?: number;
  optionChain: OptionStrikeData[];
}

export interface OptionAlertSignal {
  id: string;
  symbol: string;
  stockName: string;
  sector: string;
  optionType: 'CE' | 'PE';
  action: 'BUY' | 'SELL';
  strike: number;
  expiry: string;
  spotPrice: number;
  premiumLtp: number;
  entryRange: [number, number];
  target1: number;
  target2: number;
  stopLoss: number;
  accuracyScore: number; // 90 to 98%
  riskRewardRatio: string;
  oiBuildup: OIBuildupType;
  oiChangePercent: number;
  pcr: number;
  greeks: {
    delta: number;
    gamma: number;
    theta: number;
    iv: number;
  };
  chartTechnicalTriggers: {
    vwapStatus: 'ABOVE_VWAP' | 'BELOW_VWAP';
    cprRelation: 'ABOVE_TC' | 'BELOW_BC' | 'INSIDE_CPR';
    emaTrend: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'STRONG_UPTREND' | 'STRONG_DOWNTREND';
    breakoutSignal: string;
  };
  aiAnalysisReasoning: string;
  generatedAt: string;
}

export interface AIStockRecommendation {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  price: number;
  action: 'BUY' | 'STRONG BUY' | 'SELL' | 'STRONG SELL';
  timeframe: 'INTRADAY' | 'BTST / STBT' | 'SWING (1-3 DAYS)';
  confidence: number; // e.g. 92%
  entryRange: [number, number];
  target1: number;
  target2: number;
  stopLoss: number;
  riskReward: string; // e.g. "1:2.8"
  oiBuildup: OIBuildupType;
  oiChangePercent: number;
  pcr: number;
  keyDrivers: string[];
  aiReasoning: string;
  generatedAt: string;
  aiModelUsed?: string;
}

export interface TechnicalIndicators {
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  avgVolume20: number;
  ema13: number;
  ema21: number;
  ema34: number;
  vwap: number;
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  adx: number;
  plusDi?: number;
  minusDi?: number;
  atr: number;
  atr14Avg?: number;
  atrRatio?: number;
  supertrend: number;
  supertrendDirection: 'BUY' | 'SELL';
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  rvol: number;
  volumeBreakout: boolean;
  pdh: number; // Previous Day High
  pdl: number; // Previous Day Low
  cprPivot: number;
  cprBC: number;
  cprTC: number;
  pivotR1: number;
  pivotS1: number;
  pivotR2: number;
  pivotS2: number;
  swingHigh: number;
  swingLow: number;
  gapPct?: number;
  gapType?: 'STRONG_GAP_UP' | 'GAP_UP' | 'NORMAL_OPEN' | 'GAP_DOWN' | 'STRONG_GAP_DOWN';
  foxTrend?: number;
  foxTrendStatus?: 'BULLISH' | 'BEARISH';
  vwapSlope?: number;
  pcr?: number;
  oiChangePct?: number;
  oiState?: 'LONG_BUILDUP' | 'SHORT_BUILDUP' | 'SHORT_COVERING' | 'LONG_UNWINDING' | 'NEUTRAL';
  optionState?: 'BULLISH_OPTIONS' | 'BEARISH_OPTIONS' | 'NEUTRAL';
  marketState?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sectorState?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  newsScore?: number;
  // Patrick Nill Auction Strategy V2 Fields
  poc?: number;
  vah?: number;
  val?: number;
  marketRegime?: 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGE' | 'CHOPPY_EQUILIBRIUM';
  ema9?: number;
  ema50?: number;
  vwap3Ago?: number;
  rvolHighQuality?: boolean;
}

export type ConfluenceStage = 'WATCH' | 'SETUP' | 'CONFIRMED';

export interface ConfluencePillar {
  id: string;
  name: string;
  category:
    | 'PRICE'
    | 'VOLUME'
    | 'VWAP'
    | 'MARKET_STRUCTURE'
    | 'LIQUIDITY'
    | 'SMC'
    | 'WYCKOFF_PHASE'
    | 'DELTA'
    | 'CVD'
    | 'FUTURES_OI'
    | 'OPTION_OI'
    | 'OPTION_PREMIUM'
    | 'IV'
    | 'GREEKS'
    | 'SECTOR_REGIME'
    | 'NIFTY_REGIME';
  weight: number;
  score: number;
  maxScore: number;
  status: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  valueDisplay: string;
  description: string;
}

export interface ConfluenceExecutionLadder {
  entryPrice: number;
  stopLoss: number;
  stopLossPercent: number;
  target1: number;
  target1Percent: number;
  target1Action: string;
  target2: number;
  target2Percent: number;
  target2Action: string;
  target3: number;
  target3Percent: number;
  target3Action: string;
  riskRewardRatio: string;
  exitStrategy: string;
}

export interface ConfluenceEngineData {
  confluenceScore: number; // 0-100 Score
  stage: ConfluenceStage; // WATCH (40-59), SETUP (60-74), CONFIRMED (75-100)
  signal: SignalType;
  pillars: ConfluencePillar[];
  bullishPillarsCount: number;
  bearishPillarsCount: number;
  neutralPillarsCount: number;
  ladder: ConfluenceExecutionLadder;
  wyckoffPhaseName: string;
  smcStructure: string;
  orderFlowDeltaText: string;
  cvdStatus: string;
  greeksBiasText: string;
  sectorAlignmentText: string;
  niftyRegimeText: string;
  exitReason?: string;
}

export interface AIScoreBreakdown {
  vwap: number;        // Max 8
  emaTrend: number;    // Max 8
  rsi: number;         // Max 6
  adx: number;         // Max 6
  volume: number;      // Max 6
  rvol: number;        // Max 6
  oiScore: number;     // Max 15
  priceAction: number; // Max 5 (Breakout)
  optionsChain?: number; // Max 10
  marketRegime?: number; // Max 5
  sectorRegime?: number; // Max 5
  newsSentiment?: number; // Max 5
  openingGap?: number;   // Max 10
  macd?: number;       // Max 6
  atr?: number;        // Optional
  breakout?: number;   // Optional
  // 16-Pillars Direct Sub-scores:
  price?: number;
  marketStructure?: number;
  liquidity?: number;
  smc?: number;
  wyckoff?: number;
  delta?: number;
  cvd?: number;
  futuresOi?: number;
  optionOi?: number;
  optionPremium?: number;
  iv?: number;
  greeks?: number;
  niftyRegime?: number;
}

export interface RiskManagement {
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3?: number;
  riskAmount: number;
  rewardAmountT1: number;
  rewardAmountT2: number;
  rewardAmountT3?: number;
  riskRewardRatio: number; // e.g. 1:2.5 -> 2.5
  recommendedQty: number; // For default capital 100,000 INR
  positionValue: number;
  marginRequired: number;
}

export interface FyersQuote {
  symbol: string; // e.g. "SBIN"
  fyersSymbol: string; // e.g. "NSE:SBIN-EQ" or "NSE:NIFTY50-INDEX"
  description: string;
  exchange: string; // "NSE" | "BSE"
  type: string; // "EQUITY" | "INDEX" | "FUTURES" | "OPTIONS"
  lp: number; // Last Price
  open: number;
  high: number;
  low: number;
  prevClose: number;
  ch: number; // Change
  chp: number; // Change Percent
  volume: number;
  atp: number; // Average Traded Price
  ltt: string; // Last Traded Time
  fyersStatus: 'LIVE_V3_FEED' | 'SIMULATED' | 'MARKET_CLOSED_EOD' | 'CLOSED_SETTLEMENT' | 'DISCONNECTED';
  isMarketOpen?: boolean;
  marketSession?: string;
  lastRefreshed: string;
}

export interface StockGreeksData {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  iv: number;
  ivPercentile: number;
  putCallWritingRatio: number;
  putWritingOiLakhs: number;
  callWritingOiLakhs: number;
  writingDominance: 'PUT_WRITING_DOMINANT' | 'CALL_WRITING_DOMINANT' | 'BALANCED_WRITING';
  institutionalOptionBias: 'INSTITUTIONAL_PUT_WRITING' | 'INSTITUTIONAL_CALL_WRITING' | 'LONG_GAMMA_MOMENTUM' | 'SHORT_VEGA_HARVESTING' | 'NEUTRAL_STRADDLE';
  biasSummary: string;
}

export interface ScannedStock {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  signal: SignalType;
  aiScore: number;
  scoreBreakdown: AIScoreBreakdown;
  indicators: TechnicalIndicators;
  risk: RiskManagement;
  sparkline?: number[];
  oiData?: StockOIData;
  greeks?: StockGreeksData;
  fyersSymbol?: string;
  fyersData?: FyersQuote;
  lotSize?: number;
  strikeStep?: number;
  lastUpdated: string;
  alertCreateTime?: string;
  listedAt?: string;
  signalListedAt?: string;
  entryTime?: string;
  exitTime?: string;
  exitPrice?: number;
  tradeStatus?: 'OPEN' | 'CLOSED_TARGET_1' | 'CLOSED_TARGET_2' | 'CLOSED_TARGET_3' | 'CLOSED_STOP_LOSS';
  isClosed?: boolean;
  realizedPoints?: number;
  realizedPct?: number;
  fixedEntryPrice?: number;
  fixedStopLoss?: number;
  fixedTarget1?: number;
  fixedTarget2?: number;
  fixedTarget3?: number;
  formulaName?: string;
  formulaCode?: string;
  bidQty?: number;
  askQty?: number;
  bidAskRatio?: number;
  orderBookBias?: string;
  newsSentiment?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  newsTitle?: string;
  keyTriggers: string[];
  confluenceStage?: ConfluenceStage;
  confluence?: ConfluenceEngineData;
  auctionV2?: any; // PatrickNillAuctionV2Result
  hwsV1?: any; // HwsV1StrategyResult
  smfResult?: SmfInstitutionalResult;
}

export type SmfClassification =
  | 'VERY_WEAK' // 0-20
  | 'WEAK' // 20-40
  | 'NEUTRAL' // 40-50
  | 'WATCH' // 50-60
  | 'POSITIVE' // 60-70
  | 'STRONG' // 70-80
  | 'HIGH_CONFIDENCE' // 80-90
  | 'EXTREME'; // 90-100

export type SmfInstitutionalSignal =
  | 'INSTITUTIONAL_BUY' // 90+ Bullish
  | 'STRONG_BUY' // 80-90 Bullish
  | 'BUY_WATCH' // 75-80 Bullish
  | 'NEUTRAL'
  | 'SELL_WATCH' // 75-80 Bearish
  | 'STRONG_SELL' // 80-90 Bearish
  | 'INSTITUTIONAL_SELL'; // 90+ Bearish

export type SmfVolumeActivityTier =
  | 'NORMAL'
  | 'ABOVE_AVG' // > 1.25x 4-day avg
  | 'STRONG_ABOVE_AVG' // > 1.75x 4-day avg
  | 'EXTREME_SURGE'; // > 2.50x 4-day avg

export interface SmfPillarComponent {
  id: string;
  name: string;
  weight: number; // e.g. 20, 20, 15, 15, 10, 10, 5, 5
  rawScore: number; // 0 to 1
  weightedScore: number; // rawScore * weight
  description: string;
  metrics: Record<string, string | number | boolean>;
}

export interface SmfStreakHistory {
  day1Score: number;
  day2Score: number;
  day3Score: number;
  day4Score: number;
  day4Average: number;
  currentStreakDays: number;
  streakScore: number; // 0.20 for 1D, 0.40 for 2D, 0.60 for 3D, 0.80 for 4D, 1.00 for 5D+
}

export interface SmfSurgeData {
  isSurge: boolean;
  rvol: number;
  activityRatio4D: number;
  priceExpansionAtr: number;
  surgeScore: number; // 0 to 1
  activityTier: SmfVolumeActivityTier;
}

export interface SmfInstitutionalResult {
  symbol: string;
  smfScore: number; // 0 to 100
  institutionalProbabilityPct: number; // 0 to 100%
  classification: SmfClassification;
  signal: SmfInstitutionalSignal;
  directionalBias: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
  isHot: boolean; // SMF >= 80 && RVOL >= 1.5 && Surge && Streak >= 2D
  isSurge: boolean;
  streakDays: number; // e.g. 1, 2, 3, 4, 5+
  volumeAboveAvgLabel: string; // "↑ ABOVE AVG", "↑ STRONG ABOVE AVG", "🔥 EXTREME", "NORMAL"
  components: {
    priceAccumulation: SmfPillarComponent; // 20 pts
    volumeAbnormality: SmfPillarComponent; // 20 pts
    moneyFlow: SmfPillarComponent; // 15 pts
    trendStrength: SmfPillarComponent; // 15 pts
    multiDayPersistence: SmfPillarComponent; // 10 pts
    surgeDetection: SmfPillarComponent; // 10 pts
    oiDerivatives: SmfPillarComponent; // 5 pts
    relativeStrength: SmfPillarComponent; // 5 pts
  };
  rawValues: {
    returnPct: number;
    closeRange: number; // (Close - Low) / (High - Low)
    rvol: number;
    cmf: number;
    ema13: number;
    ema21: number;
    ema34: number;
    adx: number;
    streakDays: number;
    avgVolume4D: number;
    activityRatio4D: number;
    atr14: number;
    priceExpansionRatio: number;
    oiBuildup: OIBuildupType;
    rsNiftyPct: number;
    rsSectorPct: number;
    relativeStrengthScore: number;
    vwap: number;
    pdh: number;
    pdl: number;
  };
  execution: {
    entryPrice: number;
    stopLoss: number;
    target1: number;
    target2: number;
    target3: number;
    riskRewardRatio: string;
    confidenceGrade: 'A+' | 'A' | 'B' | 'C' | 'D';
    recommendedAction: string;
  };
  integratedMatrix: {
    cvdStatus: string;
    oiAction: string;
    optionBias: string;
    wyckoffPhase: string;
    marketRegime: string;
  };
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ema13?: number;
  ema21?: number;
  ema34?: number;
  vwap?: number;
}

export interface MarketOverview {
  nifty50: {
    price: number;
    change: number;
    changePercent: number;
    sparkline?: number[];
    trendHistory?: Array<{ time: string; price: number; change?: number }>;
  };
  bankNifty: { price: number; change: number; changePercent: number };
  niftyIT: { price: number; change: number; changePercent: number };
  finnifty?: { price: number; change: number; changePercent: number };
  midcpnifty?: { price: number; change: number; changePercent: number };
  sensex?: { price: number; change: number; changePercent: number };
  indiaVix?: {
    price: number;
    change: number;
    changePercent: number;
    regime?: 'LOW_VOLATILITY' | 'MODERATE' | 'HIGH_FEAR' | 'EXTREME_PANIC';
  };
  scannedCount: number;
  buyCount: number;
  sellCount: number;
  highRvolCount: number;
  lastScanTime: string;
  marketStatus: 'OPEN' | 'CLOSED' | 'PRE-OPEN' | string;
}

export interface AlertConfig {
  minScoreToAlert: number;
  enableOrderQtyAlert?: boolean;
  minOrderSizeQty?: number; // e.g. 50000 Quantity
  minRvolForOrderAlert?: number; // e.g. 1.5x RVol
  orderTypeFilter?: 'BOTH' | 'PURCHASE_ONLY' | 'SALE_ONLY';
  enableTelegram: boolean;
  telegramBotToken: string;
  telegramChatId: string;
  enableWhatsapp: boolean;
  whatsappPhone: string;
  whatsappApiKey: string;
  enableEmail: boolean;
  emailRecipient: string;
  emailSmtpHost: string;
  soundAlerts: boolean;
}

export interface AlertLogItem {
  id: string;
  timestamp: string; // Alert Create Time
  symbol: string;
  signal: SignalType;
  aiScore: number;
  price: number;
  entry: number;
  stopLoss: number;
  target1: number;
  target2: number;
  targetHitStatus: 'ACTIVE' | 'TARGET_1_HIT' | 'TARGET_2_HIT' | 'STOP_LOSS_HIT';
  targetHitTime?: string;
  targetHitPrice?: number;
  sentVia: string[];
  status: 'SENT' | 'FAILED';
  alertCategory?: 'AI_SCORE' | 'LARGE_ORDER_QTY';
  orderQty?: number;
  rvol?: number;
  dealType?: 'PURCHASE' | 'SALE';
  reason?: string;
  accuracyScore?: number;
  sector?: string;
  sectorStatus?: 'POSITIVE' | 'NEGATIVE';
  sectorChangePercent?: number;
  oi?: string;
  oiChangePercent?: number;
  volumeX?: string;
  rsi?: number;
  vwap?: number;
  vwapStatus?: 'ABOVE' | 'BELOW';
  newsSentiment?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  newsTitle?: string;
  purchaseRationale?: string;
  gapPct?: number;
  gapType?: 'STRONG_GAP_UP' | 'GAP_UP' | 'NORMAL_OPEN' | 'GAP_DOWN' | 'STRONG_GAP_DOWN';
}

export interface TradePosition {
  id: string;
  symbol: string;
  signal: SignalType;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  stopLoss: number;
  target1: number;
  target2: number;
  status: 'OPEN' | 'CLOSED';
  createdAt: string; // Trade Create Time
  closedAt?: string; // Trade Close Time
  closePrice?: number;
  closeReason?: 'MANUAL_CLOSE' | 'TARGET_1_HIT' | 'TARGET_2_HIT' | 'STOP_LOSS_HIT';
  realizedPnL?: number;
  realizedPnLPercent?: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  targetHitStatus: 'NONE' | 'TARGET_1_HIT' | 'TARGET_2_HIT' | 'STOP_LOSS_HIT';
  aiScore?: number;
  accuracyScore?: number;
}

export interface BrokerConfig {
  selectedBroker: 'simulator' | 'autonomous' | 'upstox' | 'fyers' | 'zerodha' | 'angelone' | 'dhan';
  apiKey: string;
  apiSecret: string;
  accessToken: string;
  upstoxApiKey?: string;
  upstoxApiSecret?: string;
  upstoxAccessToken?: string;
  upstoxProfileName?: string;
  upstoxTokenType?: 'USER_ACCESS' | 'ANALYTICS_READONLY' | 'NONE';
  fyersAppId?: string;
  fyersAccessToken?: string;
  status: 'connected' | 'disconnected' | 'simulated' | 'autonomous';
  lastPingTime?: string;
}

export interface NewsItem {
  id: string;
  symbol: string;
  companyName: string;
  title: string;
  source: string;
  timestamp: string;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  impactScore: number; // -10 to +10
  category: 'EARNINGS' | 'ORDER_WIN' | 'REGULATORY' | 'RATING_UPGRADE' | 'MACRO' | 'M_AND_A' | 'BULK_ORDER' | 'BLOCK_DEAL';
  summary: string;
  dealDetails?: {
    clientName: string;
    dealType: 'BUY' | 'SELL';
    quantity: number;
    price: number;
    valueInCr: number;
  };
  url?: string;
}

export interface BulkOrder {
  id: string;
  symbol: string;
  companyName: string;
  clientName: string;
  dealType: 'BUY' | 'SELL';
  quantity: number;
  price: number;
  valueInCr: number;
  exchange: 'NSE' | 'BSE';
  timestamp: string;
  sentiment: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  remarks: string;
}

export interface CorporateAction {
  id: string;
  symbol: string;
  companyName: string;
  type: 'DIVIDEND' | 'SPLIT' | 'BONUS' | 'EARNINGS_RELEASE' | 'AGM_EGM' | 'RIGHTS_ISSUE';
  exDate: string;
  recordDate: string;
  details: string;
  value?: string; // e.g. "₹10.00 / share" or "1:1 Bonus"
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface BacktestTrade {
  id: string;
  date: string;
  signal: 'BUY' | 'SELL';
  entryPrice: number;
  exitPrice: number;
  exitDate: string;
  exitReason: 'TARGET_1' | 'TARGET_2' | 'STOP_LOSS' | 'TIME_EXIT';
  returnPercent: number;
  pnl: number;
  holdingPeriodDays: number;
  aiScore: number;
  patternName: string;
}

export interface EquityCurvePoint {
  date: string;
  equity: number;
  benchmark: number;
}

export interface BacktestResult {
  symbol: string;
  companyName: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  initialCapital: number;
  finalCapital: number;
  totalReturnPercent: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePercent: number;
  maxDrawdownPercent: number;
  profitFactor: number;
  averageTradeReturnPercent: number;
  equityCurve: EquityCurvePoint[];
  trades: BacktestTrade[];
}

export interface BacktestRequest {
  symbol: string;
  timeframe: '1M' | '3M' | '6M' | '1Y' | 'YTD';
  initialCapital?: number;
  strategyPreset?: 'BALANCED' | 'AGGRESSIVE' | 'CONSERVATIVE';
  stopLossPercent?: number;
  target1Percent?: number;
  target2Percent?: number;
}

// =========================================================================
// V9 VEGA + GREEKS QUANTITATIVE TRADING ENGINE ARCHITECTURE TYPES (V1 → V9)
// =========================================================================

export type V9IvRegime =
  | 'BULLISH_EXPANSION'      // Price ↑ + IV ↑ (Institutional Call Sweep)
  | 'BULLISH_CONTRACTION'    // Price ↑ + IV ↓ (Grind up / Short Squeeze / Call Writing Absorption)
  | 'BEARISH_EXPANSION'      // Price ↓ + IV ↑ (Panic Put Buying / Institutional Hedge Rush)
  | 'BEARISH_CONTRACTION';   // Price ↓ + IV ↓ (Slow Bleed / Put Writing Decay)

export type V9OiRegime =
  | 'LONG_BUILDUP'      // Price ↑ + OI ↑
  | 'SHORT_BUILDUP'     // Price ↓ + OI ↑
  | 'SHORT_COVERING'    // Price ↑ + OI ↓
  | 'LONG_UNWINDING';   // Price ↓ + OI ↓

export type V9Verdict = 'CE_BUY' | 'PE_BUY' | 'NO_TRADE';

export type V9Conviction =
  | 'HIGH_CONFIDENCE_CE_BUY'
  | 'STANDARD_CE_BUY'
  | 'HIGH_CONFIDENCE_PE_BUY'
  | 'STANDARD_PE_BUY'
  | 'VEGA_TRAP_NO_TRADE'
  | 'THETA_RISK_NO_TRADE'
  | 'GAMMA_RISK_NO_TRADE'
  | 'NEUTRAL_NO_TRADE';

export interface V9EnginePipelineData {
  // V1: Data Engine
  v1Data: {
    symbol: string;
    underlyingPrice: number;
    futuresPrice: number;
    basisPts: number;
    basisPct: number;
    timeframe: '1m' | '3m' | '5m' | '15m';
    strikeStep: number;
    totalStrikesCount: number;
    totalOiLakhs: number;
    totalVolumeLakhs: number;
    fiiLongShortRatio: number;
    marketState: 'OPEN' | 'CLOSED' | 'PRE_MARKET';
  };

  // V2: Greeks Engine
  v2Greeks: {
    delta: number;
    gamma: number;
    theta: number;
    vega: number;
    rho: number;
    normalizedVegaPct: number; // (Vega / LTP) * 100
    charm: number;
    vanna: number;
    speed: number;
    greeksScore: number; // 0 - 100 composite
    thetaPenaltyPct: number; // (|Theta| / LTP) * 100
    gammaRiskLevel: 'SAFE' | 'ELEVATED' | 'EXTREME_REJECT';
  };

  // V3: IV / Vega Momentum Engine
  v3IvVega: {
    atmIv: number;
    ivRank: number; // 0 - 100
    ivPercentile: number; // 0 - 100
    ivMomentumPct: number; // % Change in IV
    vegaMomentumPct: number; // % Change in Vega
    ivSkew: number; // Call IV - Put IV
    ceIv: number;
    peIv: number;
    vegaExpansionScore: number; // VE Score (> +1.0 Bullish, < -1.0 Bearish)
    ivRegime: V9IvRegime;
    regimeInterpretation: string;
  };

  // V4: OI Engine
  v4OiEngine: {
    callOiLakhs: number;
    putOiLakhs: number;
    callOiChangeLakhs: number;
    putOiChangeLakhs: number;
    callOiChangePct: number;
    putOiChangePct: number;
    pcr: number;
    pcrMomentum: number; // delta PCR
    oiRegime: V9OiRegime;
    oiInterpretation: string;
    maxPainStrike: number;
    callWallStrike: number;
    putWallStrike: number;
  };

  // V5: Technical Engine
  v5Technical: {
    vwap: number;
    spotVsVwapPct: number;
    vwapSlope: 'RISING' | 'FALLING' | 'FLAT';
    ema13: number;
    ema21: number;
    ema34: number;
    emaAlignment: 'BULLISH_STACK' | 'BEARISH_STACK' | 'MIXED_CHOP';
    rsi: number;
    rsiStatus: 'CE_SWEETSPOT' | 'PE_SWEETSPOT' | 'OVERBOUGHT_EXTREME' | 'OVERSOLD_EXTREME' | 'NEUTRAL';
    adx: number;
    adxTrend: 'VERY_STRONG' | 'STRONG' | 'MODERATE' | 'WEAK_CHOP';
    atr: number;
    rvol: number;
    rvolConfirmation: 'VERY_STRONG' | 'STRONG' | 'BELOW_AVERAGE';
    support1: number;
    resistance1: number;
  };

  // V6: Order Flow / CVD Engine
  v6OrderFlow: {
    buyVolumeLakhs: number;
    sellVolumeLakhs: number;
    netDeltaLakhs: number;
    cvd: number; // Cumulative Volume Delta
    normalizedCvd: number; // -100 to +100
    cvdTrend: 'RISING_ACCUMULATION' | 'FALLING_DISTRIBUTION' | 'FLAT_EQUILIBRIUM';
    cvdDivergence: 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE' | 'CONFIRMED_ALIGNED';
    orderFlowScore: number; // 0 - 100
  };

  // V7: Smart Money / Wyckoff Engine
  v7SmartMoney: {
    wyckoffPhase:
      | 'ACCUMULATION_PHASE_C_SPRING'
      | 'SIGN_OF_STRENGTH_SOS'
      | 'DISTRIBUTION_PHASE_C_UTAD'
      | 'SIGN_OF_WEAKNESS_SOW'
      | 'EQUILIBRIUM_TRADING_RANGE';
    smcStructure: 'BOS_BULLISH' | 'CHOCH_REVERSAL_UP' | 'BOS_BEARISH' | 'CHOCH_REVERSAL_DOWN' | 'INTERNAL_RANGE';
    liquiditySweepDetected: boolean;
    liquiditySweepSide: 'BUY_SIDE_LIQUIDITY' | 'SELL_SIDE_LIQUIDITY' | 'NONE';
    demandZone: [number, number];
    supplyZone: [number, number];
  };

  // V8: AI Probabilistic Scoring Engine
  v8AiScoring: {
    weights: {
      greeks: number; // 20%
      ivVega: number; // 20%
      oiPcr: number; // 15%
      orderFlowCvd: number; // 15%
      priceActionVwap: number; // 15%
      volumeRvol: number; // 10%
      marketRegime: number; // 5%
    };
    componentScores: {
      greeks: number;
      ivVega: number;
      oiPcr: number;
      orderFlowCvd: number;
      priceActionVwap: number;
      volumeRvol: number;
      marketRegime: number;
    };
    masterScore: number; // 0 - 100
    probabilities: {
      ceBuyPct: number;
      peBuyPct: number;
      noTradePct: number;
    };
  };

  // V9: Live Algo + Risk Engine
  v9LiveAlgo: {
    verdict: V9Verdict;
    conviction: V9Conviction;
    verdictBadgeColor: 'emerald' | 'rose' | 'amber';
    vegaTrapFilterTriggered: boolean;
    thetaPenaltyTriggered: boolean;
    gammaRiskTriggered: boolean;
    activeRuleChecklist: {
      totalScorePassed: boolean;
      vwapRulePassed: boolean;
      emaStackPassed: boolean;
      deltaSweetspotPassed: boolean;
      ivMomentumPassed: boolean;
      vegaMomentumPassed: boolean;
      cvdRulePassed: boolean;
      rvolRulePassed: boolean;
      adxRulePassed: boolean;
    };
    tradeSetup: {
      strike: number;
      optionType: 'CE' | 'PE';
      contractName: string;
      moneyness: IndexStrikeMoneyness;
      ltp: number;
      delta: number;
      gamma: number;
      theta: number;
      vega: number;
      iv: number;
      entryZone: [number, number];
      stopLoss: number;
      stopLossPct: number;
      target1: number;
      target1Pct: number;
      target2: number;
      target2Pct: number;
      target3: number;
      target3Pct: number;
      riskReward: string;
      maxLots: number;
      capitalRequired: number;
      estimatedWinRate: number;
      thesis: string;
    };
  };
}

export interface StockV9Data {
  symbol: string;
  name: string;
  sector: string;
  spotPrice: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  lotSize: number;
  strikeStep: number;
  isFnO: boolean;
  v9Engine: V9EnginePipelineData;
  sparkline?: number[];
  volumeLakhs?: number;
  vwap?: number;
  rsi?: number;
  rvol?: number;
}

export interface StockHistoricalSentimentDay {
  date: string; // YYYY-MM-DD
  sentimentScore: number; // -100 to +100
  newsCount: number;
  newsImpactScore: number; // -10 to +10
  corporateActionScore: number; // -10 to +10
  newsTitle?: string;
  corporateActionText?: string;
  priceCorrelation: number;
}

export type SentimentTrendPoint = StockHistoricalSentimentDay;

export interface StockSentimentTrend {
  symbol: string;
  companyName: string;
  sector: string;
  overall30DayScore: number; // -100 to +100
  trendDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  positiveEventsCount: number;
  negativeEventsCount: number;
  neutralEventsCount: number;
  aiExecutiveSummary: string;
  keyDrivers: string[];
  points: SentimentTrendPoint[];
  lastUpdated: string;
}

export type AppTheme = 'dark' | 'light' | 'midnight' | 'emerald';

export interface ScanFilter {
  searchQuery: string;
  signalFilter: 'ALL' | 'BUY' | 'SELL';
  minScore: number;
  sectorFilter: string;
  sortBy: 'aiScore' | 'rvol' | 'changePercent' | 'price' | 'volume';
  sortOrder: 'asc' | 'desc';
}

// ---------------------------------------------------------------------------
// HOLLY AI MULTI-STRATEGY QUANTITATIVE ENGINE TYPES
// ---------------------------------------------------------------------------
export type HollyEngineMode =
  | 'HOLLY_GRAIL'
  | 'HOLLY_2_0'
  | 'HOLLY_NEO'
  | 'HOLLY_STEALTH'
  | 'HOLLY_GAMMA'
  | 'HOLLY_ALPHA'
  | 'ALL_ENGINES';
export type HollyRiskMode = 'RISK_ON' | 'RISK_OFF' | 'MODERATE';
export type HollySignalStatus = 'ACTIVE' | 'TARGET_1_HIT' | 'TARGET_2_HIT' | 'STOPPED_OUT' | 'TRAILING';

export interface HollyStrategy {
  id: string;
  name: string;
  description: string;
  category:
    | 'MOMENTUM_BREAKOUT'
    | 'PULLBACK_TREND'
    | 'MEAN_REVERSION'
    | 'VOLUME_SURGE'
    | 'GAP_CONTINUATION'
    | 'VWAP_INSTITUTIONAL'
    | 'GAMMA_SHORT_SQUEEZE'
    | 'MULTI_CONFLUENCE';
  engine: 'HOLLY_GRAIL' | 'HOLLY_2_0' | 'HOLLY_NEO' | 'HOLLY_STEALTH' | 'HOLLY_GAMMA' | 'HOLLY_ALPHA';
  winRate: number;
  profitFactor: number;
  tradesCount: number;
  avgWinLossRatio: number;
  isActiveToday: boolean;
  direction: 'BUY' | 'SELL' | 'BOTH';
  rules: string[];
  suggestedHoldingMinutes?: number;
  recommendedOrderType?: 'LIMIT_ORDER' | 'MARKET_ORDER' | 'STOP_LIMIT';
}

export interface HollySignal {
  id: string;
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  signal: 'BUY' | 'SHORT';
  strategyId: string;
  strategyName: string;
  engine: 'HOLLY_GRAIL' | 'HOLLY_2_0' | 'HOLLY_NEO' | 'HOLLY_STEALTH' | 'HOLLY_GAMMA' | 'HOLLY_ALPHA';
  entryPrice: number;
  entryPriceRange?: { min: number; max: number };
  entryTime: string;
  entryTimeFormatted?: string;
  timeInTrade?: string;
  exitTimeProjected?: string;
  hardSquareOffTime?: string;
  maxHoldingPeriodMinutes?: number;
  orderTypeRecommendation?: 'LIMIT_ORDER' | 'MARKET_ORDER' | 'STOP_LIMIT';
  slippageTolerancePct?: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  trailingStopTriggerPrice?: number;
  trailingStopActive?: boolean;
  riskOnExitPrice: number;
  riskOffExitPrice: number;
  riskReward: string;
  confidenceScore: number;
  quantity: number;
  status: HollySignalStatus;
  livePnL: number;
  livePnLPercent: number;
  riskOnPnL: number;
  riskOffPnL: number;
  indicators: {
    rsi: number;
    rvol: number;
    vwapDiffPct: number;
    emaTrend: string;
    supertrend: 'BULLISH' | 'BEARISH';
  };
  exitTriggers?: {
    target1: { price: number; returnPct: number; estTime: string; status: 'PENDING' | 'HIT' | 'MISSED' };
    target2: { price: number; returnPct: number; estTime: string; status: 'PENDING' | 'HIT' | 'MISSED' };
    target3: { price: number; returnPct: number; estTime: string; status: 'PENDING' | 'HIT' | 'MISSED' };
    stopLoss: { price: number; returnPct: number; riskAmount: number; status: 'ACTIVE' | 'HIT' };
    hardSquareOff: { time: string; action: string };
  };
  aiRationale: string;
  isDebounced?: boolean;
  debounceScoreDelta?: number;
  lastScoreUpdateTimestamp?: number;
  fluctuationsSuppressedCount?: number;
}


export interface HollyPerformanceStats {
  totalSignalsToday: number;
  winningTradesCount: number;
  losingTradesCount: number;
  winRate: number;
  todayPnLRiskOn: number;
  todayPnLRiskOff: number;
  profitFactor: number;
  topPerformingStrategy: string;
  bestTradeSymbol: string;
  bestTradePnL: number;
  marketRegime: string;
}

export type ClusterType =
  | 'BULLISH_SURGE'
  | 'BEARISH_LIQUIDATION'
  | 'ROTATION_INFLOW'
  | 'NEUTRAL_CHOP';

export interface SectorMomentumCluster {
  id: string;
  sectorName: string;
  clusterType: ClusterType;
  clusterIntensity: number; // 0 - 100
  signalCoOccurrenceRate: number; // e.g. 85.5%
  buySignalsCount: number;
  sellSignalsCount: number;
  neutralCount: number;
  totalStocks: number;
  avgRvol: number;
  avgChangePct: number;
  avgCorrelation: number; // -1.0 to 1.0
  leaderStock: {
    symbol: string;
    name: string;
    changePercent: number;
    rvol: number;
    signal: 'BUY' | 'SELL';
    price: number;
    aiScore: number;
  };
  sympathyStock: {
    symbol: string;
    name: string;
    changePercent: number;
    rvol: number;
    signal: 'BUY' | 'SELL';
    price: number;
    potentialCatchUpPct: number;
    aiScore: number;
  };
  stocks: ScannedStock[];
  aiClusterInsight: string;
}

export interface SignalCorrelationPair {
  id: string;
  symbolA: string;
  symbolB: string;
  nameA: string;
  nameB: string;
  sectorA: string;
  sectorB: string;
  isSameSector: boolean;
  correlation: number; // -1.0 to +1.0
  coOccurrenceScore: number; // 0 to 100
  signalA: 'BUY' | 'SELL' | 'NEUTRAL';
  signalB: 'BUY' | 'SELL' | 'NEUTRAL';
  relationship:
    | 'STRONG_MOMENTUM_SYNC'
    | 'MODERATE_SYNC'
    | 'UNCORRELATED'
    | 'INVERSE_HEDGE';
  leadStock: string;
  lagStock: string;
  spreadPct: number;
  changePctA: number;
  changePctB: number;
  rvolA: number;
  rvolB: number;
}

export interface SectorCorrelationMatrixData {
  sectors: string[];
  matrix: Record<string, Record<string, number>>;
  clusters: SectorMomentumCluster[];
  topPairs: SignalCorrelationPair[];
  marketWideCoOccurrenceIndex: number;
  broadBasedRallyScore: number; // 0-100
  apexBullishCluster: string;
  apexBearishCluster: string;
}

// ---------------------------------------------------------------------------
// HOLLY FORMULA ENGINEERING & QUANT DIAGNOSTICS TYPES
// ---------------------------------------------------------------------------
export interface HollyFormulaRuleItem {
  id: string;
  name: string;
  requirement: string;
  actualValue: string;
  passed: boolean;
  pointsEarned: number;
  maxPoints: number;
  explanation: string;
}

export interface HollyDiagnosticVector {
  vectorId: string;
  title: string;
  subtitle: string;
  weight: number;
  pointsEarned: number;
  maxPoints: number;
  formulaEquation: string;
  color: string;
  rules: HollyFormulaRuleItem[];
}

export interface HollyEngineeringParams {
  minRvolThreshold: number;
  confidenceCutoff: number;
  vwapTolerancePct: number;
  minRiskReward: number;
  debouncerTolerance: number;
  debouncerWindowMinutes: number;
  grailWeight: number;
  h2Weight: number;
  neoWeight: number;
}

export interface HollyStockDiagnostics {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  changePercent: number;
  rvol: number;
  totalScore: number;
  grade: 'A+ (Apex Institutional)' | 'A (High Conviction)' | 'B (Moderate Edge)' | 'C (Sub-Optimal / Avoid)';
  qualificationStatus: 'QUALIFIED_BUY' | 'QUALIFIED_SHORT' | 'WATCHLIST_PENDING' | 'REJECTED';
  matchingHollyStrategies: string[];
  recommendedRiskMode: 'RISK_ON' | 'RISK_OFF';
  vectors: HollyDiagnosticVector[];
  aiEngineeringVerdict: string;
  debouncerStatus: {
    isDebounced: boolean;
    baselineScore: number;
    scoreDelta: number;
    windowMinutes: number;
  };
}

// ---------------------------------------------------------------------------
// NSE INDEX OPTIONS & OI STRIKE BATTLEFIELD INTELLIGENCE TYPES
// ---------------------------------------------------------------------------
export type SupportedIndexSymbol =
  | 'NIFTY 50'
  | 'BANKNIFTY'
  | 'FINNIFTY'
  | 'MIDCPNIFTY'
  | 'SENSEX';

export type IndexDecisionType =
  | 'BUY CE'
  | 'BUY PE'
  | 'SELL CE'
  | 'SELL PE'
  | 'NO TRADE';

export type IndexStrikeMoneyness =
  | 'DEEP_ITM'
  | 'SLIGHT_ITM'
  | 'ATM'
  | 'SLIGHT_OTM'
  | 'FAR_OTM';

export interface IndexOptionGreeks {
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  charm?: number;
  vanna?: number;
  speed?: number;
  rho?: number;
  iv: number;
  ivRank: number; // 0 - 100
  ivPercentile: number; // 0 - 100
}

export interface IndexStrikeBattlefieldItem {
  strike: number;
  moneyness: IndexStrikeMoneyness;
  isAtm: boolean;
  distanceFromSpot: number;
  
  // Call Side
  callLtp: number;
  callChange: number;
  callChangePercent: number;
  callOiLakhs: number;
  callChangeOiLakhs: number;
  callChangeOiPercent: number;
  callVolumeLakhs: number;
  callIv: number;
  callDelta: number;
  callGamma: number;
  callTheta: number;
  callVega: number;
  callBuildup: OIBuildupType;
  callWritingDominance: 'HEAVY_CALL_WRITING' | 'CALL_UNWINDING' | 'CALL_BUYING' | 'NEUTRAL';
  isMaxCallOi: boolean;
  isSecondMaxCallOi: boolean;

  // Put Side
  putLtp: number;
  putChange: number;
  putChangePercent: number;
  putOiLakhs: number;
  putChangeOiLakhs: number;
  putChangeOiPercent: number;
  putVolumeLakhs: number;
  putIv: number;
  putDelta: number;
  putGamma: number;
  putTheta: number;
  putVega: number;
  putBuildup: OIBuildupType;
  putWritingDominance: 'HEAVY_PUT_WRITING' | 'PUT_UNWINDING' | 'PUT_BUYING' | 'NEUTRAL';
  isMaxPutOi: boolean;
  isSecondMaxPutOi: boolean;

  // Strike Analytics
  totalOiLakhs: number;
  netOiChangeLakhs: number;
  straddlePrice: number;
  pcrAtStrike: number;
  fyersCallSymbol?: string;
  fyersPutSymbol?: string;
}

export interface IndexCandidateStrike {
  id: string;
  strike: number;
  optionType: 'CE' | 'PE';
  action: 'BUY' | 'SELL';
  contractName: string;
  expiryDate: string;
  moneyness: IndexStrikeMoneyness;
  premiumLtp: number;
  greeks: IndexOptionGreeks;
  quantitativeScore: number; // 0-100
  isRecommended: boolean;
  entryPrice: number;
  stopLoss: number;
  stopLossPoints: number;
  stopLossPercent: number;
  target1: number;
  target2: number;
  target3: number;
  riskReward: string;
  deltaCaptureRate: number; // %
  thetaBurnPerDay: number; // ₹ or pts
  breakEvenSpot: number;
  spreadLiquidityScore: number; // 0-100
  winProbabilityPct: number;
  rationale: string;
  fyersSymbol?: string;
}

export interface IndexFuturesTelemetry {
  symbol: string;
  futuresLtp: number;
  spotPrice: number;
  basisPoints: number; // Futures - Spot
  basisPercent: number;
  basisSentiment: 'PREMIUM_BULLISH' | 'DISCOUNT_BEARISH' | 'FAIR_VALUE';
  futuresOiLakhs: number;
  futuresOiChangeLakhs: number;
  futuresOiChangePercent: number;
  futuresBuildup: OIBuildupType;
  rolloverPercent: number;
  vwap: number;
  aboveVwap: boolean;
  vwapDistancePct: number;
}

export interface IndexTechnicals {
  spotPrice: number;
  open: number;
  high: number;
  low: number;
  previousClose: number;
  change: number;
  changePercent: number;
  vwap: number;
  ema9: number;
  ema21: number;
  ema50: number;
  ema200: number;
  trendEma: 'STRONG_BULLISH' | 'MILD_BULLISH' | 'NEUTRAL' | 'MILD_BEARISH' | 'STRONG_BEARISH';
  supertrend: {
    value: number;
    direction: 'BUY' | 'SELL';
  };
  rsi14: number;
  rsiRegime: 'OVERSOLD' | 'BULLISH_MOMENTUM' | 'NEUTRAL_RANGE' | 'BEARISH_MOMENTUM' | 'OVERBOUGHT';
  macd: {
    line: number;
    signal: number;
    histogram: number;
    crossStatus: 'BULLISH_CROSS' | 'BEARISH_CROSS' | 'NEUTRAL';
  };
  adx: {
    adx: number;
    plusDi: number;
    minusDi: number;
    trendStrength: 'STRONG_TREND' | 'MODERATE_TREND' | 'CHOPPY_RANGE';
  };
  atr14: number;
  cpr: {
    pivot: number;
    tc: number;
    bc: number;
    widthPct: number;
    rangeType: 'NARROW_BREAKOUT' | 'AVERAGE' | 'WIDE_RANGE_BOUND';
    cprStatus: 'ABOVE_TC' | 'BELOW_BC' | 'INSIDE_CPR';
  };
  intradayPivots: {
    r3: number;
    r2: number;
    r1: number;
    pivot: number;
    s1: number;
    s2: number;
    s3: number;
  };
}

export interface IndexQuantitativeScoreVector {
  vectorName: string;
  weight: number;
  score: number;
  maxScore: number;
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  description: string;
}

export interface IndexInstitutionalMovement {
  fiiNetFuturesLongContracts: number;
  fiiNetFuturesShortContracts: number;
  fiiLongShortRatio: number;
  fiiIndexSentiment: 'AGGRESSIVE_BULLISH' | 'MILD_BULLISH' | 'NEUTRAL' | 'MILD_BEARISH' | 'AGGRESSIVE_BEARISH';
  fiiNetCrores: number;
  diiNetCrores: number;
  totalBlockDealsCrores: number;
  combinedAtmStraddleLtp: number;
  straddleDecayRatePerHour: number;
  expectedExpiryMovePoints: number;
  expectedLowerRange: number;
  expectedUpperRange: number;
  gammaSqueezeAlert: {
    detected: boolean;
    strike: number;
    side: 'CE_SHORT_COVERING_SQUEEZE' | 'PE_LONG_UNWINDING_SQUEEZE' | 'NONE';
    intensity: 'HIGH' | 'MEDIUM' | 'NONE';
    message: string;
  };
  writingShiftTelemetry?: InstitutionalWritingShiftTelemetry;
}

export interface IndexIntelligenceData {
  symbol: SupportedIndexSymbol;
  name: string;
  exchange: 'NSE' | 'BSE';
  lotSize: number;
  strikeStep: number;
  expiryDate: string;
  daysToExpiry: number;
  
  // Spot & Futures Telemetry
  spotPrice: number;
  change: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  sparkline: number[];
  futures: IndexFuturesTelemetry;
  technicals: IndexTechnicals;

  // Option Chain & OI Battlefield
  atmStrike: number;
  maxCallOiStrike: number;
  maxPutOiStrike: number;
  secondMaxCallOiStrike: number;
  secondMaxPutOiStrike: number;
  maxPainStrike: number;
  totalCallOiLakhs: number;
  totalPutOiLakhs: number;
  totalCallOiChangeLakhs: number;
  totalPutOiChangeLakhs: number;
  pcrOi: number;
  pcrVolume: number;
  pcrTrend: 'BULLISH_RISING' | 'BEARISH_FALLING' | 'NEUTRAL_FLAT';
  battlefieldStrikes: IndexStrikeBattlefieldItem[];

  // Quantitative Decision & Scoring Model
  decision: IndexDecisionType;
  overallScore: number; // 0-100
  confidencePct: number; // 0-100
  winProbabilityPct: number;
  strategyCategory: 'MOMENTUM_BREAKOUT' | 'PULLBACK_BUY' | 'REVERSAL_EXHAUSTION' | 'RANGE_THETA_COLLECTOR' | 'VOLATILITY_EXPANSION';
  decisionRationale: string;
  scoreVectors: IndexQuantitativeScoreVector[];

  // Strike Selection Intelligence (ATM, ITM, OTM Candidates)
  candidateStrikes: IndexCandidateStrike[];
  recommendedCandidate: IndexCandidateStrike;

  // Institutional Movement & Greeks
  institutionalFlow: IndexInstitutionalMovement;
  overallGreeks: IndexOptionGreeks;
  lastUpdated: string;
  isMarketOpen?: boolean;
  marketSession?: string;
  marketStatusLabel?: string;
  fyersData?: FyersQuote;
  fyersSymbol?: string;
  fyersStatus?: 'LIVE_V3_FEED' | 'SIMULATED' | 'MARKET_CLOSED_EOD' | 'CLOSED_SETTLEMENT' | 'DISCONNECTED';
  v9Engine?: V9EnginePipelineData;
}

export interface IndexPaperTrade {
  id: string;
  indexSymbol: SupportedIndexSymbol;
  contractName: string;
  optionType: 'CE' | 'PE';
  action: 'BUY' | 'SELL';
  strike: number;
  entryPrice: number;
  currentPrice: number;
  quantity: number;
  lots: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  pnl: number;
  pnlPercent: number;
  status: 'OPEN' | 'TARGET1_HIT' | 'TARGET2_HIT' | 'TARGET3_HIT' | 'SL_HIT' | 'CLOSED';
  entryTime: string;
  exitTime?: string;
  exitPrice?: number;
  fyersSymbol?: string;
}

export type IndexAlertTriggerType =
  | 'QUANTITATIVE_SIGNAL_FLIP' // AI Engine score triggers BUY CE/PE or reaches threshold
  | 'SPOT_CROSS_ABOVE' // Spot price breaks above level
  | 'SPOT_CROSS_BELOW' // Spot price breaks below level
  | 'PREMIUM_CROSS_ABOVE' // Option premium breaks above entry price
  | 'GAMMA_SQUEEZE' // Gamma squeeze / short covering burst
  | 'PCR_BREAKOUT' // PCR crosses above or below threshold
  | 'SUPERTREND_CROSSOVER' // Supertrend flips BUY or SELL
  | 'CPR_TC_BC_BREAKOUT' // Spot breaks out of CPR Top/Bottom central pivot
  | 'INSTITUTIONAL_WRITING_SHIFT'; // Significant change in Put/Call writing velocity or institutional positioning shift

export interface InstitutionalWritingShiftTelemetry {
  id: string;
  indexSymbol: SupportedIndexSymbol;
  timestamp: string;
  shiftType:
    | 'BULLISH_PUT_WRITING_SURGE' // Aggressive institutional floor building (put writers accumulating)
    | 'BEARISH_CALL_WRITING_WALL' // Aggressive institutional ceiling cap (call writers accumulating)
    | 'CALL_UNWINDING_SHORT_COVER' // Call writers running for cover (breakout imminent)
    | 'PUT_UNWINDING_LONG_PANIC' // Put writers capitulating (breakdown imminent)
    | 'PCR_WRITING_RATIO_SPIKE' // Rapid delta change in Put Writing vs Call Writing volume
    | 'STRADDLE_IV_CRUSH_WRITING'; // Institutional heavy double-sided writing collecting premium
  severity: 'CRITICAL_SHIFT' | 'HIGH' | 'MODERATE';
  writingRatio: number; // Put Writing OI Change / Call Writing OI Change (or vice-versa)
  putWritingLakhs: number;
  callWritingLakhs: number;
  netWritingBias: 'STRONG_BULLISH' | 'MILD_BULLISH' | 'NEUTRAL' | 'MILD_BEARISH' | 'STRONG_BEARISH';
  institutionalConfidenceScore: number; // 0-100
  keyStrikesImpacted: number[];
  primaryDriver: string;
  actionableVerdict: string;
  fiiDiiAlignment: string;
  detectedAt: string;
}

export interface IndexOptionAlert {
  id: string;
  indexSymbol: SupportedIndexSymbol;

  // Explicit Strike & Strategy Identification
  moneyness: IndexStrikeMoneyness; // 'ATM' | 'SLIGHT_ITM' | 'DEEP_ITM' | 'SLIGHT_OTM' | 'FAR_OTM'
  optionType: 'CE' | 'PE'; // 'CE' (CALL) | 'PE' (PUT)
  action: 'BUY' | 'SELL'; // 'BUY' | 'SELL'
  strike: number; // e.g. 24550
  contractName: string; // e.g. "NIFTY 50 28-AUG-2026 24550 CE"
  expiryDate: string;

  // Trigger Condition
  triggerType: IndexAlertTriggerType;
  triggerConditionLabel: string;
  triggerTargetValue?: number; // e.g. Spot level (24600) or Premium (160) or PCR (1.25)
  minConfidenceScore?: number;

  // Trade Setup & Greek Matrix Snapshot
  entryPrice: number;
  stopLoss: number;
  stopLossPercent: number;
  target1: number;
  target2: number;
  target3: number;
  riskReward: string;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;

  // Alert State
  isActive: boolean;
  isTriggered: boolean;
  triggeredAt?: string;
  triggeredPrice?: number;
  triggerMessage?: string;
  createdAt: string;
  soundEnabled: boolean;
  pushEnabled: boolean;
}

export interface IndexAlertCreatePayload {
  indexSymbol: SupportedIndexSymbol;
  moneyness: IndexStrikeMoneyness;
  optionType: 'CE' | 'PE';
  action: 'BUY' | 'SELL';
  strike?: number; // Optional specific strike override, otherwise auto-computed from moneyness
  triggerType: IndexAlertTriggerType;
  triggerTargetValue?: number;
  minConfidenceScore?: number;
  soundEnabled?: boolean;
  pushEnabled?: boolean;
}

// =========================================================================
// FYERS API v3 REAL-TIME WEBSOCKET PROTOCOL & TELEMETRY TYPES
// =========================================================================

export type FyersWsConnectionState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'ERROR';

export interface FyersWsTick {
  symbol: string; // e.g. "NSE:NIFTY50-INDEX" or "NSE:NIFTY24AUG24550CE"
  cleanSymbol?: string; // e.g. "NIFTY 50" or "24550 CE"
  indexSymbol?: SupportedIndexSymbol;
  strike?: number;
  optionType?: 'CE' | 'PE';
  isSpot?: boolean;
  isOption?: boolean;
  lp: number; // Last Traded Price (LTP)
  ch?: number; // Net Change
  chp?: number; // Net Change %
  open?: number;
  high?: number;
  low?: number;
  prevClose?: number;
  volume?: number;
  atp?: number; // Average Traded Price
  oi?: number; // Open Interest
  prevOi?: number;
  oiChange?: number;
  bid?: number;
  ask?: number;
  bidQty?: number;
  askQty?: number;
  iv?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
  timestamp: number; // Unix Epoch ms
  ltt: string; // Last Traded Time string (e.g. "14:23:45 IST")
  feedMode: 'LTP' | 'FULL_QUOTE' | 'DEPTH';
  source: 'UPSTOX_API_V2' | 'AUTONOMOUS_WS_RELAY' | 'FYERS_V3_WS' | 'SERVER_WS_RELAY' | 'SIMULATED_WS';
}

export interface FyersWsStatus {
  state: FyersWsConnectionState;
  isLiveFyers: boolean;
  subscribedSymbols: string[];
  ticksCount: number;
  ticksPerSecond: number;
  lastTickTime?: string;
  latencyMs: number;
  reconnectAttempts: number;
  error?: string;
  transport: 'NATIVE_WS' | 'SERVER_RELAY' | 'UPSTOX_LIVE_RELAY' | 'AUTONOMOUS_LIVE_RELAY';
  connectedAt?: string;
}

export interface FyersWsClientMessage {
  type: 'subscribe' | 'unsubscribe' | 'subscribe_index_options' | 'ping' | 'get_status';
  symbols?: string[];
  index?: SupportedIndexSymbol;
  strikes?: number[];
  mode?: 'LTP' | 'FULL_QUOTE' | 'DEPTH';
  clientTimestamp?: number;
}

export interface FyersWsServerMessage {
  type: 'tick' | 'ticks_batch' | 'subscribed' | 'unsubscribed' | 'pong' | 'status' | 'error';
  tick?: FyersWsTick;
  ticks?: FyersWsTick[];
  symbols?: string[];
  status?: Partial<FyersWsStatus>;
  clientTimestamp?: number;
  serverTimestamp?: number;
  latencyMs?: number;
  message?: string;
}

// -------------------------------------------------------------
// Indian Market Smart Money & Institutional Accumulation / Distribution Types
// -------------------------------------------------------------

export type WyckoffPhaseType =
  | 'PHASE_A_STOPPING'
  | 'PHASE_B_ACCUMULATION'
  | 'PHASE_C_SPRING_TEST'
  | 'PHASE_D_SOS_BREAKOUT'
  | 'PHASE_E_MARKUP'
  | 'DISTRIBUTION_UTAD'
  | 'MARKDOWN';

export type SmcSetupType =
  | 'BULLISH_ORDER_BLOCK'
  | 'BEARISH_ORDER_BLOCK'
  | 'FAIR_VALUE_GAP_FVG'
  | 'LIQUIDITY_GRAB_SWEEP'
  | 'BOS_BREAK_OF_STRUCTURE'
  | 'CHOCH_CHANGE_OF_CHARACTER'
  | 'EQUILIBRIUM';

export type AccumulationRatingType =
  | 'A_PLUS_HEAVY_ACCUMULATION'
  | 'A_STEADY_ACCUMULATION'
  | 'B_NEUTRAL_ABSORPTION'
  | 'C_MILD_DISTRIBUTION'
  | 'D_HEAVY_DISTRIBUTION';

export type VsaPatternType =
  | 'STOPPING_VOLUME'
  | 'ABSORPTION_VOLUME'
  | 'NO_SUPPLY_BAR'
  | 'EFFORT_VS_RESULT_BULL'
  | 'UPTHRUST_BAR'
  | 'NO_DEMAND_BAR'
  | 'CLIMAX_CHURN'
  | 'NEUTRAL_VOLUME';

export interface SmartMoneyStockAnalysis {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  rvol: number;
  totalValueCr: number;
  deliveryPercent: number;
  isDeliverySpike: boolean;
  deliveryVs20DayAvgPct: number;

  // Wyckoff Phase Detection
  wyckoff: {
    phase: WyckoffPhaseType;
    phaseLabel: string;
    phaseBadgeCls: string;
    confidence: number; // 0 to 100
    description: string;
    actionableTrigger: string;
  };

  // Smart Money Concepts (SMC)
  smc: {
    setupType: SmcSetupType;
    setupLabel: string;
    setupBadgeCls: string;
    orderBlockRange: [number, number]; // [Low, High]
    fvgRange?: [number, number];
    liquiditySweepLevel?: number;
    bosLevel?: number;
    isChochConfirmed: boolean;
    proximityToObPercent: number;
    isInObZone: boolean;
  };

  // Institutional Accumulation / Distribution (ADI & CMF)
  accumulation: {
    rating: AccumulationRatingType;
    ratingLabel: string;
    ratingScore: number; // 0 to 100
    ratingBadgeCls: string;
    cmf: number; // Chaikin Money Flow (-1 to +1)
    cmfLabel: string;
    adiSlope: 'RISING' | 'FALLING' | 'FLAT';
    institutionalFlowCr: number; // Estimated Institutional Net Flow in ₹ Cr
    fiiDiiSentiment: 'HEAVY_ACCUMULATION' | 'MILD_ACCUMULATION' | 'NEUTRAL' | 'MILD_DISTRIBUTION' | 'HEAVY_DISTRIBUTION';
    fiiDiiBadgeCls: string;
  };

  // Volume Spread Analysis (VSA)
  vsa: {
    pattern: VsaPatternType;
    patternLabel: string;
    sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    volumeSpreadRatio: number;
    note: string;
  };

  // Multi-Band VWAP Analysis
  vwapBands: {
    vwap: number;
    upperBand1: number;
    lowerBand1: number;
    upperBand2: number;
    lowerBand2: number;
    vwapDiffPct: number;
    positionTier: 'ABOVE_UPPER_2' | 'INSIDE_UPPER_BAND' | 'AT_VWAP' | 'INSIDE_LOWER_BAND' | 'BELOW_LOWER_2';
    tierLabel: string;
  };

  // Options Confluence
  optionsDynamics: {
    pcr: number;
    pcrSentiment: 'BULLISH_PUT_WRITING' | 'BEARISH_CALL_WRITING' | 'NEUTRAL';
    maxPain: number;
    maxPainDistancePct: number;
    putWritingPressure: number; // in Lakhs
    callWritingPressure: number; // in Lakhs
    gammaBias: 'LONG_GAMMA' | 'SHORT_GAMMA' | 'NEUTRAL';
    ivRank: number;
  };

  // Trade Execution Plan
  tradeSetup: {
    bias: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
    biasBadgeCls: string;
    entryZone: [number, number];
    stopLoss: number;
    target1: number;
    target2: number;
    target3: number;
    riskRewardRatio: string;
    overallScore: number; // 0 to 100
    confluenceNotes: string[];
  };

  tradingViewUrl: string;
  lastUpdated: string;
}





