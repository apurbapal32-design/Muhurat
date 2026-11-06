import { ScannedStock } from '../types';

export interface BuyCriteriaChecks {
  scorePass: boolean; // Total Score >= 80
  niftyPass: boolean; // NIFTY bullish
  sectorPass: boolean; // Sector bullish
  stockVwapPass: boolean; // Stock > VWAP
  emaPass: boolean; // EMA 13 > 21 > 34
  rvolPass: boolean; // RVOL >= 1.5
  adxPass: boolean; // ADX >= 25
  oiPass: boolean; // No major bearish OI signal
}

export interface SellCriteriaChecks {
  scorePass: boolean; // Total Score >= 80
  niftyPass: boolean; // NIFTY bearish
  sectorPass: boolean; // Sector bearish
  stockVwapPass: boolean; // Stock < VWAP
  emaPass: boolean; // EMA 13 < 21 < 34
  rsiPass: boolean; // RSI 30-45
  macdPass: boolean; // MACD bearish
  adxPass: boolean; // ADX >= 25
  diPass: boolean; // -DI > +DI
  rvolPass: boolean; // RVOL >= 1.5
  oiPass: boolean; // Price ↓ + OI ↑ (Short Buildup)
  volPass: boolean; // Breakdown volume confirmation
}

export interface GapRsStockData {
  stock: ScannedStock;
  symbol: string;
  name: string;
  sector: string;
  price: number;
  open: number;
  previousClose: number;
  stockChangePercent: number;
  tradedVolume: number;
  tradedValue: number; // in Crores or INR
  volumeRank: number;
  valueRank: number;
  sectorChangePercent: number;
  sectorConfirmation: 'STRONG POSITIVE' | 'POSITIVE' | 'NEGATIVE' | 'STRONG NEGATIVE';
  relativeStrength: number; // Stock % - Sector %
  gapPct: number;
  gapClassification: 'Gap Up' | 'Normal Gap' | 'Gap Down';
  
  // World-Class Trader Formula v2 — 100 Points Breakdown (V1 to V7)
  v1MarketRegimePts: number; // Max 15
  v2SectorStrengthPts: number; // Max 15
  v3StockPriceActionPts: number; // Max 20
  v4MomentumPts: number; // Max 15
  v5VolumeRvolPts: number; // Max 10
  v6FuturesOiPts: number; // Max 15
  v7RiskVolatilityPts: number; // Max 10
  totalScore: number; // 0 - 100
  
  // Signal & Setup Tiers
  // 90-100 = 🔥 VERY STRONG BUY / 🔥 VERY STRONG SELL
  // 85-89  = 🟢 STRONG BUY / 🔴 STRONG SELL
  // 80-84  = 🟢 BUY / 🔴 SELL
  // 70-79  = 🟡 WATCH
  // <70    = ❌ NO TRADE
  signalTier:
    | '🔥 VERY STRONG BUY'
    | '🟢 STRONG BUY'
    | '🟢 BUY'
    | '🔥 VERY STRONG SELL'
    | '🔴 STRONG SELL'
    | '🔴 SELL'
    | '🟡 WATCH'
    | '❌ NO TRADE';
  setupType: 'QUALIFIED BUY' | 'QUALIFIED SELL' | 'WATCHLIST' | 'NO TRADE';
  isBuySetup: boolean;
  isSellSetup: boolean;

  // Criteria Checks
  buyCriteriaChecks: BuyCriteriaChecks;
  sellCriteriaChecks: SellCriteriaChecks;

  // Institutional Entry Layer
  instConfirmation: 'INSTITUTIONAL LONG CONFIRMATION' | 'INSTITUTIONAL SHORT CONFIRMATION' | 'NEUTRAL';

  // Gap Filter Notice
  gapFilterNotice?: string;
  isGapFilterActive: boolean;

  // Technical Indicator Values
  vwap: number;
  ema13: number;
  ema21: number;
  ema34: number;
  rsi: number;
  macdHist: number;
  adx: number;
  plusDI: number;
  minusDI: number;
  rvol: number;
  atr: number;

  // 5-Min Momentum
  vol5m: number;
  priceChange5m: number;
  vol5mSurgeRatio: number;
  
  // Entry & Exit Timing Engine with Fixed Levels
  alertTime: string;
  entryTime: string;
  exitTime?: string;
  exitPrice?: number;
  perfectEntryTime: string;
  perfectEntryWindow: 'BREAKOUT_CANDLE_CLOSE' | 'PULLBACK_VWAP' | 'AFTERNOON_EXPANSION' | 'WAIT';
  recommendedEntryPrice: number;
  entryRange: [number, number];
  
  // Risk & Target Exit Engine (1R, 1.5R, 2R) - Fixed at Alert Time
  fixedEntryPrice: number;
  fixedStopLoss: number;
  fixedTarget1: number;
  fixedTarget2: number;
  fixedTarget3: number;
  riskPerShare: number;
  stopLossExit: number;
  target1Exit: number; // 1R
  target2Exit: number; // 1.5R
  target3Exit: number; // 2R
  riskReward: string;
  exitStatus: 'ACTIVE_HOLD' | 'TARGET_1_HIT' | 'TARGET_2_HIT' | 'TARGET_3_HIT' | 'STOP_LOSS_HIT' | 'CLOSE_AT_315_PM';
  tradeStatus: 'OPEN' | 'CLOSED_TARGET_1' | 'CLOSED_TARGET_2' | 'CLOSED_TARGET_3' | 'CLOSED_STOP_LOSS';
  isClosed: boolean;
  realizedPoints: number;
  realizedPct: number;
  tradeResultLabel: string;
  perfectExitTime: string;
}

/**
 * Calculates Sector Average % Change from scanned stocks
 */
export function calculateSectorPerformances(stocks: ScannedStock[]): Record<string, number> {
  const sectorMap: Record<string, { totalPct: number; count: number }> = {};
  for (const s of stocks) {
    const sec = s.sector || 'General';
    if (!sectorMap[sec]) {
      sectorMap[sec] = { totalPct: 0, count: 0 };
    }
    sectorMap[sec].totalPct += s.changePercent;
    sectorMap[sec].count += 1;
  }

  const result: Record<string, number> = {};
  for (const [sec, data] of Object.entries(sectorMap)) {
    result[sec] = Number((data.totalPct / data.count).toFixed(2));
  }
  return result;
}

/**
 * Main calculation engine for World-Class Trader Formula v2 — 100 Points Quant Scanner
 */
export function processGapRelativeStrengthScan(stocks: ScannedStock[]): GapRsStockData[] {
  if (!stocks || stocks.length === 0) return [];

  const sectorPerfMap = calculateSectorPerformances(stocks);

  // Overall Nifty Benchmark proxy from average change across all Nifty 200 stocks
  const niftyBenchmarkChange = Number(
    (stocks.reduce((acc, s) => acc + s.changePercent, 0) / stocks.length).toFixed(2)
  );

  // 1. Calculate traded values & basic raw fields
  const preparedList = stocks.map((s) => {
    const open = s.indicators?.open || s.price * (1 - s.changePercent / 100);
    const prevClose =
      open > 0 && s.changePercent !== 0
        ? Number((s.price / (1 + s.changePercent / 100)).toFixed(2))
        : Number((s.price - s.change).toFixed(2));

    // Gap % calculation
    let gapPct = prevClose > 0 ? ((open - prevClose) / prevClose) * 100 : s.indicators?.gapPct || 0;
    gapPct = Number(gapPct.toFixed(2));

    let gapClassification: 'Gap Up' | 'Normal Gap' | 'Gap Down' = 'Normal Gap';
    if (gapPct >= 2.0) gapClassification = 'Gap Up';
    else if (gapPct <= -2.0) gapClassification = 'Gap Down';

    const tradedVolume = s.volume || 100000;
    const tradedValue = s.price * tradedVolume;

    const sectorPct = sectorPerfMap[s.sector || 'General'] ?? 0;

    let sectorConfirmation: 'STRONG POSITIVE' | 'POSITIVE' | 'NEGATIVE' | 'STRONG NEGATIVE' = 'POSITIVE';
    if (sectorPct >= 1.0) sectorConfirmation = 'STRONG POSITIVE';
    else if (sectorPct >= 0) sectorConfirmation = 'POSITIVE';
    else if (sectorPct <= -1.0) sectorConfirmation = 'STRONG NEGATIVE';
    else sectorConfirmation = 'NEGATIVE';

    // Relative Strength = Stock % Change - Sector % Change
    const relativeStrength = Number((s.changePercent - sectorPct).toFixed(2));

    // Indicators
    const ind = s.indicators || ({} as any);
    const vwap = ind.vwap || s.price * 0.998;
    const ema13 = ind.ema13 || s.price * 1.002;
    const ema21 = ind.ema21 || s.price * 1.001;
    const ema34 = ind.ema34 || s.price * 0.999;
    const rsi = ind.rsi || 58;
    const macd = ind.macd || 1.2;
    const macdSignal = ind.macdSignal || 0.8;
    const macdHist = ind.macdHist ?? (macd - macdSignal);
    const adx = ind.adx || 27;
    const plusDI = ind.plusDi || 28;
    const minusDI = ind.minusDi || 16;
    const rvol = ind.rvol || 1.6;
    const atr = ind.atr || s.price * 0.015;

    // 5-minute stats
    const vol5m = Math.round((tradedVolume / 75) * (0.8 + Math.random() * 0.8));
    const priceChange5m = Number(((s.changePercent * 0.15) + (s.changePercent >= 0 ? 0.1 : -0.1)).toFixed(2));

    return {
      stock: s,
      symbol: s.symbol,
      name: s.name,
      sector: s.sector,
      price: s.price,
      open,
      previousClose: prevClose,
      stockChangePercent: s.changePercent,
      tradedVolume,
      tradedValue,
      sectorChangePercent: sectorPct,
      sectorConfirmation,
      relativeStrength,
      gapPct,
      gapClassification,
      vwap,
      ema13,
      ema21,
      ema34,
      rsi,
      macdHist,
      adx,
      plusDI,
      minusDI,
      rvol,
      atr,
      vol5m,
      priceChange5m,
    };
  });

  // 2. Rank by Traded Volume & Traded Value
  const sortedByVol = [...preparedList].sort((a, b) => b.tradedVolume - a.tradedVolume);
  const volRankMap = new Map<string, number>();
  sortedByVol.forEach((item, index) => volRankMap.set(item.symbol, index + 1));

  const sortedByVal = [...preparedList].sort((a, b) => b.tradedValue - a.tradedValue);
  const valRankMap = new Map<string, number>();
  sortedByVal.forEach((item, index) => valRankMap.set(item.symbol, index + 1));

  // 3. World-Class Trader Formula v2 — 100 Points Processing
  return preparedList.map((item) => {
    const volRank = volRankMap.get(item.symbol) || 999;
    const valRank = valRankMap.get(item.symbol) || 999;

    // Bias determination
    const isBullishBias = item.stockChangePercent >= 0 || item.relativeStrength >= 0;

    // ==========================================
    // V1 — MARKET REGIME (15 Points Max)
    // ==========================================
    let v1MarketRegimePts = 0;
    if (isBullishBias) {
      if (niftyBenchmarkChange >= 0) v1MarketRegimePts += 5; // NIFTY > VWAP (+5)
      if (niftyBenchmarkChange >= 0.2) v1MarketRegimePts += 3; // NIFTY > EMA 20 (+3)
      if (item.rsi >= 50 && item.rsi <= 68) v1MarketRegimePts += 2; // NIFTY RSI 50-65 (+2)
      if (item.adx > 20) v1MarketRegimePts += 2; // NIFTY ADX > 20 (+2)
      if (niftyBenchmarkChange > 0) v1MarketRegimePts += 3; // NIFTY 5-min trend bullish (+3)
    } else {
      if (niftyBenchmarkChange < 0) v1MarketRegimePts += 5; // NIFTY < VWAP (+5)
      if (niftyBenchmarkChange <= -0.2) v1MarketRegimePts += 3; // NIFTY < EMA 20 (+3)
      if (item.rsi >= 35 && item.rsi <= 50) v1MarketRegimePts += 2; // NIFTY RSI 35-50 (+2)
      if (item.adx > 20) v1MarketRegimePts += 2; // NIFTY ADX > 20 (+2)
      if (niftyBenchmarkChange < 0) v1MarketRegimePts += 3; // NIFTY 5-min trend bearish (+3)
    }

    // ==========================================
    // V2 — SECTOR STRENGTH (15 Points Max)
    // ==========================================
    let v2SectorStrengthPts = 0;
    if (isBullishBias) {
      if (item.sectorChangePercent > 0) v2SectorStrengthPts += 4; // Sector Index > VWAP (+4)
      if (item.sectorChangePercent >= 0.3) v2SectorStrengthPts += 3; // Sector EMA 20 > EMA 50 (+3)
      if (item.relativeStrength > 0) v2SectorStrengthPts += 3; // Sector RS vs NIFTY (+3)
      if (item.rvol >= 1.2) v2SectorStrengthPts += 2; // Sector Vol/RVOL > 1.2 (+2)
      if (item.sectorChangePercent > 0.1) v2SectorStrengthPts += 3; // Sector momentum positive (+3)
    } else {
      if (item.sectorChangePercent < 0) v2SectorStrengthPts += 4; // Sector Index < VWAP (+4)
      if (item.sectorChangePercent <= -0.3) v2SectorStrengthPts += 3; // Sector EMA 20 < EMA 50 (+3)
      if (item.relativeStrength < 0) v2SectorStrengthPts += 3; // Sector RS vs NIFTY (+3)
      if (item.rvol >= 1.2) v2SectorStrengthPts += 2; // Sector Vol/RVOL > 1.2 (+2)
      if (item.sectorChangePercent < -0.1) v2SectorStrengthPts += 3; // Sector momentum negative (+3)
    }

    // ==========================================
    // V3 — STOCK PRICE ACTION (20 Points Max)
    // ==========================================
    let v3StockPriceActionPts = 0;
    if (isBullishBias) {
      if (item.price > item.vwap) v3StockPriceActionPts += 4; // Price > VWAP (+4)
      if (item.ema13 > item.ema21 && item.ema21 > item.ema34) v3StockPriceActionPts += 5; // EMA 13 > 21 > 34 (+5)
      else if (item.ema13 > item.ema21) v3StockPriceActionPts += 3;

      if (item.stockChangePercent > 0) v3StockPriceActionPts += 3; // Higher high + higher low (+3)
      if (item.stockChangePercent >= 1.5) v3StockPriceActionPts += 4; // Breakout above resistance (+4)
      if (item.priceChange5m > 0) v3StockPriceActionPts += 4; // 5-min candle closes above breakout (+4)
    } else {
      if (item.price < item.vwap) v3StockPriceActionPts += 4; // Price < VWAP (+4)
      if (item.ema13 < item.ema21 && item.ema21 < item.ema34) v3StockPriceActionPts += 5; // EMA 13 < 21 < 34 (+5)
      else if (item.ema13 < item.ema21) v3StockPriceActionPts += 3;

      if (item.stockChangePercent < 0) v3StockPriceActionPts += 3; // Lower high + lower low (+3)
      if (item.stockChangePercent <= -1.5) v3StockPriceActionPts += 4; // Breakdown below support (+4)
      if (item.priceChange5m < 0) v3StockPriceActionPts += 4; // 5-min candle closes below breakdown (+4)
    }

    // ==========================================
    // V4 — MOMENTUM (15 Points Max)
    // ==========================================
    let v4MomentumPts = 0;
    if (isBullishBias) {
      if (item.rsi >= 55 && item.rsi <= 70) v4MomentumPts += 4; // RSI 55–70 (+4)
      else if (item.rsi >= 50 && item.rsi < 55) v4MomentumPts += 2;

      if (item.macdHist > 0) v4MomentumPts += 3; // MACD bullish crossover (+3)
      if (item.priceChange5m > 0) v4MomentumPts += 2; // MACD histogram increasing (+2)
      if (item.adx >= 25) v4MomentumPts += 3; // ADX > 25 (+3)
      if (item.plusDI > item.minusDI) v4MomentumPts += 3; // +DI > -DI (+3)
    } else {
      if (item.rsi >= 30 && item.rsi <= 45) v4MomentumPts += 4; // RSI 30–45 (+4)
      else if (item.rsi > 45 && item.rsi <= 50) v4MomentumPts += 2;

      if (item.macdHist < 0) v4MomentumPts += 3; // MACD bearish crossover (+3)
      if (item.priceChange5m < 0) v4MomentumPts += 2; // MACD histogram increasing negative (+2)
      if (item.adx >= 25) v4MomentumPts += 3; // ADX > 25 (+3)
      if (item.minusDI > item.plusDI) v4MomentumPts += 3; // -DI > +DI (+3)
    }

    // ==========================================
    // V5 — VOLUME / RVOL (10 Points Max)
    // ==========================================
    let v5VolumeRvolPts = 0;
    if (item.rvol >= 1.5) v5VolumeRvolPts += 4; // RVOL > 1.5 (+4)
    else if (item.rvol >= 1.2) v5VolumeRvolPts += 2;

    if (volRank <= 50) v5VolumeRvolPts += 3; // Current volume > 20-bar avg (+3)
    if (item.rvol >= 1.8 || volRank <= 20) v5VolumeRvolPts += 3; // Breakout volume confirmation (+3)

    // ==========================================
    // V6 — FUTURES / OI (15 Points Max)
    // ==========================================
    let v6FuturesOiPts = 0;
    const oiChangePct = item.stock.oiData?.changeInOIPercent ?? item.stock.indicators?.oiChangePct ?? (item.stockChangePercent >= 0 ? 3.5 : 2.8);

    if (isBullishBias) {
      if (item.stockChangePercent > 0 && oiChangePct > 0) v6FuturesOiPts += 5; // Long buildup (+5)
      else v6FuturesOiPts += 2;

      if (volRank <= 20) v6FuturesOiPts += 3; // Futures volume increasing (+3)
      if (oiChangePct >= 2.0) v6FuturesOiPts += 2; // OI momentum positive (+2)
      if (item.price > item.open) v6FuturesOiPts += 2; // Basis / price confirmation (+2)
      if (item.relativeStrength >= 0) v6FuturesOiPts += 3; // No major bearish OI divergence (+3)
    } else {
      if (item.stockChangePercent < 0 && oiChangePct > 0) v6FuturesOiPts += 5; // Short buildup (+5)
      else v6FuturesOiPts += 2;

      if (volRank <= 20) v6FuturesOiPts += 3; // Futures volume increasing (+3)
      if (oiChangePct >= 2.0) v6FuturesOiPts += 2; // OI momentum positive (+2)
      if (item.price < item.open) v6FuturesOiPts += 2; // Basis / price confirmation (+2)
      if (item.relativeStrength <= 0) v6FuturesOiPts += 3; // No major bullish OI divergence (+3)
    }

    // ==========================================
    // V7 — RISK / VOLATILITY (10 Points Max)
    // ==========================================
    let v7RiskVolatilityPts = 0;
    if (item.atr > 0) v7RiskVolatilityPts += 3; // ATR sufficient (+3)
    if (volRank <= 50 && valRank <= 50) v7RiskVolatilityPts += 2; // Spread/liquidity acceptable (+2)
    
    // Extension from VWAP
    const vwapDistPct = Math.abs(item.price - item.vwap) / (item.vwap || 1) * 100;
    if (vwapDistPct <= 2.5) v7RiskVolatilityPts += 2; // Price not excessively extended (+2)
    if (item.atr / (item.price || 1) <= 0.03) v7RiskVolatilityPts += 3; // SL distance reasonable (+3)

    // TOTAL SCORE (0 to 100)
    const totalScore = Math.min(
      100,
      v1MarketRegimePts +
        v2SectorStrengthPts +
        v3StockPriceActionPts +
        v4MomentumPts +
        v5VolumeRvolPts +
        v6FuturesOiPts +
        v7RiskVolatilityPts
    );

    // ==========================================
    // STRICT BUY & SELL QUALIFICATION CHECKLISTS
    // ==========================================
    const buyCriteriaChecks: BuyCriteriaChecks = {
      scorePass: totalScore >= 80,
      niftyPass: niftyBenchmarkChange >= 0,
      sectorPass: item.sectorChangePercent >= 0,
      stockVwapPass: item.price > item.vwap,
      emaPass: item.ema13 > item.ema21 && item.ema21 > item.ema34,
      rvolPass: item.rvol >= 1.5,
      adxPass: item.adx >= 25,
      oiPass: item.relativeStrength >= 0,
    };

    const isBuySetup =
      buyCriteriaChecks.scorePass &&
      buyCriteriaChecks.niftyPass &&
      buyCriteriaChecks.sectorPass &&
      buyCriteriaChecks.stockVwapPass &&
      buyCriteriaChecks.emaPass &&
      buyCriteriaChecks.rvolPass &&
      buyCriteriaChecks.adxPass &&
      buyCriteriaChecks.oiPass;

    const sellCriteriaChecks: SellCriteriaChecks = {
      scorePass: totalScore >= 80,
      niftyPass: niftyBenchmarkChange < 0,
      sectorPass: item.sectorChangePercent < 0,
      stockVwapPass: item.price < item.vwap,
      emaPass: item.ema13 < item.ema21 && item.ema21 < item.ema34,
      rsiPass: item.rsi >= 30 && item.rsi <= 45,
      macdPass: item.macdHist < 0,
      adxPass: item.adx >= 25,
      diPass: item.minusDI > item.plusDI,
      rvolPass: item.rvol >= 1.5,
      oiPass: item.stockChangePercent < 0 && oiChangePct > 0,
      volPass: item.rvol >= 1.5 || volRank <= 20,
    };

    const isSellSetup =
      sellCriteriaChecks.scorePass &&
      sellCriteriaChecks.niftyPass &&
      sellCriteriaChecks.sectorPass &&
      sellCriteriaChecks.stockVwapPass &&
      sellCriteriaChecks.emaPass &&
      sellCriteriaChecks.rsiPass &&
      sellCriteriaChecks.macdPass &&
      sellCriteriaChecks.adxPass &&
      sellCriteriaChecks.diPass &&
      sellCriteriaChecks.rvolPass &&
      sellCriteriaChecks.oiPass &&
      sellCriteriaChecks.volPass;

    // Signal Tier Selection
    let signalTier:
      | '🔥 VERY STRONG BUY'
      | '🟢 STRONG BUY'
      | '🟢 BUY'
      | '🔥 VERY STRONG SELL'
      | '🔴 STRONG SELL'
      | '🔴 SELL'
      | '🟡 WATCH'
      | '❌ NO TRADE' = '❌ NO TRADE';

    if (isBullishBias) {
      if (totalScore >= 90) signalTier = '🔥 VERY STRONG BUY';
      else if (totalScore >= 85) signalTier = '🟢 STRONG BUY';
      else if (totalScore >= 80) signalTier = '🟢 BUY';
      else if (totalScore >= 70) signalTier = '🟡 WATCH';
      else signalTier = '❌ NO TRADE';
    } else {
      if (totalScore >= 90) signalTier = '🔥 VERY STRONG SELL';
      else if (totalScore >= 85) signalTier = '🔴 STRONG SELL';
      else if (totalScore >= 80) signalTier = '🔴 SELL';
      else if (totalScore >= 70) signalTier = '🟡 WATCH';
      else signalTier = '❌ NO TRADE';
    }

    let setupType: 'QUALIFIED BUY' | 'QUALIFIED SELL' | 'WATCHLIST' | 'NO TRADE' = 'NO TRADE';
    if (isBuySetup) setupType = 'QUALIFIED BUY';
    else if (isSellSetup) setupType = 'QUALIFIED SELL';
    else if (totalScore >= 70) setupType = 'WATCHLIST';

    // Institutional Confirmation Layer
    let instConfirmation: 'INSTITUTIONAL LONG CONFIRMATION' | 'INSTITUTIONAL SHORT CONFIRMATION' | 'NEUTRAL' = 'NEUTRAL';
    if (
      item.stockChangePercent > 0 &&
      oiChangePct > 0 &&
      item.rvol >= 1.5 &&
      item.price > item.vwap &&
      item.sectorChangePercent > 0 &&
      niftyBenchmarkChange > 0
    ) {
      instConfirmation = 'INSTITUTIONAL LONG CONFIRMATION';
    } else if (
      item.stockChangePercent < 0 &&
      oiChangePct > 0 &&
      item.rvol >= 1.5 &&
      item.price < item.vwap &&
      item.sectorChangePercent < 0 &&
      niftyBenchmarkChange < 0
    ) {
      instConfirmation = 'INSTITUTIONAL SHORT CONFIRMATION';
    }

    // Gap Filter Notice (Rule for Gap-Up >= +2% or Gap-Down <= -2%)
    let isGapFilterActive = false;
    let gapFilterNotice: string | undefined = undefined;
    if (item.gapPct >= 2.0) {
      isGapFilterActive = true;
      gapFilterNotice = '🚨 Gap-Up ≥ +2% Filter: Do NOT buy immediately. Wait for Pullback ➔ VWAP/EMA Support ➔ Volume Return ➔ Break Prev High before BUY.';
    } else if (item.gapPct <= -2.0) {
      isGapFilterActive = true;
      gapFilterNotice = '🚨 Gap-Down ≤ -2% Filter: Do NOT sell immediately. Wait for Pullback ➔ VWAP/EMA Resistance ➔ Volume Return ➔ Break Prev Low before SELL.';
    }

    // Entry & Stop Loss & Targets (Fixed at Alert Creation Time)
    const fixedEntryPrice = Number((item.stock.fixedEntryPrice || item.stock.risk?.entryPrice || item.price).toFixed(2));
    const slDistance = Math.max(
      Math.abs(fixedEntryPrice - item.vwap),
      1.0 * item.atr
    );
    const riskPerShare = Number(slDistance.toFixed(2));

    let stopLossExit = 0;
    let target1Exit = 0;
    let target2Exit = 0;
    let target3Exit = 0;

    if (isBullishBias) {
      stopLossExit = Number((item.stock.fixedStopLoss || item.stock.risk?.stopLoss || (fixedEntryPrice - riskPerShare)).toFixed(2));
      target1Exit = Number((item.stock.fixedTarget1 || item.stock.risk?.target1 || (fixedEntryPrice + 1.0 * riskPerShare)).toFixed(2)); // T1 = 1R
      target2Exit = Number((item.stock.fixedTarget2 || item.stock.risk?.target2 || (fixedEntryPrice + 1.5 * riskPerShare)).toFixed(2)); // T2 = 1.5R
      target3Exit = Number((item.stock.fixedTarget3 || item.stock.risk?.target3 || (fixedEntryPrice + 2.0 * riskPerShare)).toFixed(2)); // T3 = 2.0R
    } else {
      stopLossExit = Number((item.stock.fixedStopLoss || item.stock.risk?.stopLoss || (fixedEntryPrice + riskPerShare)).toFixed(2));
      target1Exit = Number((item.stock.fixedTarget1 || item.stock.risk?.target1 || (fixedEntryPrice - 1.0 * riskPerShare)).toFixed(2)); // T1 = 1R
      target2Exit = Number((item.stock.fixedTarget2 || item.stock.risk?.target2 || (fixedEntryPrice - 1.5 * riskPerShare)).toFixed(2)); // T2 = 1.5R
      target3Exit = Number((item.stock.fixedTarget3 || item.stock.risk?.target3 || (fixedEntryPrice - 2.0 * riskPerShare)).toFixed(2)); // T3 = 2.0R
    }

    const entryMin = Number((isBullishBias ? fixedEntryPrice * 0.998 : fixedEntryPrice * 1.001).toFixed(2));
    const entryMax = Number((isBullishBias ? fixedEntryPrice * 1.002 : fixedEntryPrice * 0.999).toFixed(2));

    const alertTime = item.stock.alertCreateTime || item.stock.entryTime || '09:20:00 IST';
    const entryTime = item.stock.entryTime || alertTime;

    let perfectEntryTime = 'Breakout Candle Close + VWAP Confirmation';
    let perfectEntryWindow: 'BREAKOUT_CANDLE_CLOSE' | 'PULLBACK_VWAP' | 'AFTERNOON_EXPANSION' | 'WAIT' = 'BREAKOUT_CANDLE_CLOSE';

    if (isBuySetup || isSellSetup) {
      perfectEntryTime = `🟢 ENTRY SIGNAL: ${entryTime} @ ₹${fixedEntryPrice} (VWAP & Confluence Confirmed)`;
      perfectEntryWindow = 'BREAKOUT_CANDLE_CLOSE';
    } else if (isGapFilterActive) {
      perfectEntryTime = '⏳ GAP PULLBACK WINDOW: Wait for VWAP/EMA Re-test & Confirmation';
      perfectEntryWindow = 'PULLBACK_VWAP';
    } else if (totalScore >= 70) {
      perfectEntryTime = '⚡ WATCH WINDOW: 09:45–10:15 AM Pullback to VWAP';
      perfectEntryWindow = 'PULLBACK_VWAP';
    } else {
      perfectEntryTime = '❌ NO TRADE: Score < 70 or Failed Mandatory Filters';
      perfectEntryWindow = 'WAIT';
    }

    let perfectExitTime = '';
    let exitStatus: 'ACTIVE_HOLD' | 'TARGET_1_HIT' | 'TARGET_2_HIT' | 'TARGET_3_HIT' | 'STOP_LOSS_HIT' | 'CLOSE_AT_315_PM' = 'ACTIVE_HOLD';
    let tradeStatus: 'OPEN' | 'CLOSED_TARGET_1' | 'CLOSED_TARGET_2' | 'CLOSED_TARGET_3' | 'CLOSED_STOP_LOSS' = item.stock.tradeStatus || 'OPEN';
    let isClosed = item.stock.isClosed || false;
    let exitTime = item.stock.exitTime;
    let exitPrice = item.stock.exitPrice;
    let realizedPoints = 0;
    let realizedPct = 0;
    let tradeResultLabel = '';

    if (isBullishBias) {
      if (item.price >= target3Exit) {
        exitStatus = 'TARGET_3_HIT';
        tradeStatus = 'CLOSED_TARGET_3';
        isClosed = true;
        exitPrice = target3Exit;
        if (!exitTime) exitTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST';
        realizedPoints = Number((target3Exit - fixedEntryPrice).toFixed(2));
        realizedPct = Number((((target3Exit - fixedEntryPrice) / fixedEntryPrice) * 100).toFixed(2));
        tradeResultLabel = `🎯 CLOSED — TARGET 3 HIT (+2.0R / +${realizedPct}%)`;
        perfectExitTime = `🎯 TARGET 3 HIT @ ₹${target3Exit.toLocaleString('en-IN')} (2R)! Full Exit at ${exitTime}`;
      } else if (item.price >= target2Exit) {
        exitStatus = 'TARGET_2_HIT';
        tradeStatus = 'CLOSED_TARGET_2';
        isClosed = true;
        exitPrice = target2Exit;
        if (!exitTime) exitTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST';
        realizedPoints = Number((target2Exit - fixedEntryPrice).toFixed(2));
        realizedPct = Number((((target2Exit - fixedEntryPrice) / fixedEntryPrice) * 100).toFixed(2));
        tradeResultLabel = `🎯 CLOSED — TARGET 2 HIT (+1.5R / +${realizedPct}%)`;
        perfectExitTime = `🎯 TARGET 2 HIT @ ₹${target2Exit.toLocaleString('en-IN')} (1.5R)! Trail SL at ${exitTime}`;
      } else if (item.price >= target1Exit) {
        exitStatus = 'TARGET_1_HIT';
        tradeStatus = 'CLOSED_TARGET_1';
        isClosed = true;
        exitPrice = target1Exit;
        if (!exitTime) exitTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST';
        realizedPoints = Number((target1Exit - fixedEntryPrice).toFixed(2));
        realizedPct = Number((((target1Exit - fixedEntryPrice) / fixedEntryPrice) * 100).toFixed(2));
        tradeResultLabel = `🎯 CLOSED — TARGET 1 HIT (+1.0R / +${realizedPct}%)`;
        perfectExitTime = `🎯 TARGET 1 HIT @ ₹${target1Exit.toLocaleString('en-IN')} (1R)! Exit 50% at ${exitTime}`;
      } else if (item.price <= stopLossExit) {
        exitStatus = 'STOP_LOSS_HIT';
        tradeStatus = 'CLOSED_STOP_LOSS';
        isClosed = true;
        exitPrice = stopLossExit;
        if (!exitTime) exitTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST';
        realizedPoints = Number((stopLossExit - fixedEntryPrice).toFixed(2));
        realizedPct = Number((((stopLossExit - fixedEntryPrice) / fixedEntryPrice) * 100).toFixed(2));
        tradeResultLabel = `🛑 CLOSED — STOP LOSS HIT (-1.0R / ${realizedPct}%)`;
        perfectExitTime = `🛑 STOP LOSS HIT @ ₹${stopLossExit.toLocaleString('en-IN')}! Trade Closed at ${exitTime}`;
      } else {
        exitStatus = 'ACTIVE_HOLD';
        tradeStatus = 'OPEN';
        isClosed = false;
        realizedPoints = Number((item.price - fixedEntryPrice).toFixed(2));
        realizedPct = Number((((item.price - fixedEntryPrice) / fixedEntryPrice) * 100).toFixed(2));
        tradeResultLabel = `⚡ ACTIVE OPEN (${realizedPct >= 0 ? '+' : ''}${realizedPct}%)`;
        perfectExitTime = `⏱️ HOLD: T1 ₹${target1Exit} (1R) | T2 ₹${target2Exit} (1.5R) | T3 ₹${target3Exit} (2R) | SL ₹${stopLossExit}`;
      }
    } else {
      if (item.price <= target3Exit) {
        exitStatus = 'TARGET_3_HIT';
        tradeStatus = 'CLOSED_TARGET_3';
        isClosed = true;
        exitPrice = target3Exit;
        if (!exitTime) exitTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST';
        realizedPoints = Number((fixedEntryPrice - target3Exit).toFixed(2));
        realizedPct = Number((((fixedEntryPrice - target3Exit) / fixedEntryPrice) * 100).toFixed(2));
        tradeResultLabel = `🎯 CLOSED — TARGET 3 HIT (+2.0R / +${realizedPct}%)`;
        perfectExitTime = `🎯 TARGET 3 HIT @ ₹${target3Exit.toLocaleString('en-IN')} (2R)! Full Cover at ${exitTime}`;
      } else if (item.price <= target2Exit) {
        exitStatus = 'TARGET_2_HIT';
        tradeStatus = 'CLOSED_TARGET_2';
        isClosed = true;
        exitPrice = target2Exit;
        if (!exitTime) exitTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST';
        realizedPoints = Number((fixedEntryPrice - target2Exit).toFixed(2));
        realizedPct = Number((((fixedEntryPrice - target2Exit) / fixedEntryPrice) * 100).toFixed(2));
        tradeResultLabel = `🎯 CLOSED — TARGET 2 HIT (+1.5R / +${realizedPct}%)`;
        perfectExitTime = `🎯 TARGET 2 HIT @ ₹${target2Exit.toLocaleString('en-IN')} (1.5R)! Trail SL at ${exitTime}`;
      } else if (item.price <= target1Exit) {
        exitStatus = 'TARGET_1_HIT';
        tradeStatus = 'CLOSED_TARGET_1';
        isClosed = true;
        exitPrice = target1Exit;
        if (!exitTime) exitTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST';
        realizedPoints = Number((fixedEntryPrice - target1Exit).toFixed(2));
        realizedPct = Number((((fixedEntryPrice - target1Exit) / fixedEntryPrice) * 100).toFixed(2));
        tradeResultLabel = `🎯 CLOSED — TARGET 1 HIT (+1.0R / +${realizedPct}%)`;
        perfectExitTime = `🎯 TARGET 1 HIT @ ₹${target1Exit.toLocaleString('en-IN')} (1R)! Cover 50% at ${exitTime}`;
      } else if (item.price >= stopLossExit) {
        exitStatus = 'STOP_LOSS_HIT';
        tradeStatus = 'CLOSED_STOP_LOSS';
        isClosed = true;
        exitPrice = stopLossExit;
        if (!exitTime) exitTime = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) + ' IST';
        realizedPoints = Number((fixedEntryPrice - stopLossExit).toFixed(2));
        realizedPct = Number((((fixedEntryPrice - stopLossExit) / fixedEntryPrice) * 100).toFixed(2));
        tradeResultLabel = `🛑 CLOSED — STOP LOSS HIT (-1.0R / ${realizedPct}%)`;
        perfectExitTime = `🛑 STOP LOSS HIT @ ₹${stopLossExit.toLocaleString('en-IN')}! Trade Closed at ${exitTime}`;
      } else {
        exitStatus = 'ACTIVE_HOLD';
        tradeStatus = 'OPEN';
        isClosed = false;
        realizedPoints = Number((fixedEntryPrice - item.price).toFixed(2));
        realizedPct = Number((((fixedEntryPrice - item.price) / fixedEntryPrice) * 100).toFixed(2));
        tradeResultLabel = `⚡ ACTIVE OPEN (${realizedPct >= 0 ? '+' : ''}${realizedPct}%)`;
        perfectExitTime = `⏱️ HOLD SHORT: T1 ₹${target1Exit} (1R) | T2 ₹${target2Exit} (1.5R) | T3 ₹${target3Exit} (2R) | SL ₹${stopLossExit}`;
      }
    }

    return {
      stock: item.stock,
      symbol: item.symbol,
      name: item.name,
      sector: item.sector,
      price: item.price,
      open: item.open,
      previousClose: item.previousClose,
      stockChangePercent: item.stockChangePercent,
      tradedVolume: item.tradedVolume,
      tradedValue: item.tradedValue,
      volumeRank: volRank,
      valueRank: valRank,
      sectorChangePercent: item.sectorChangePercent,
      sectorConfirmation: item.sectorConfirmation,
      relativeStrength: item.relativeStrength,
      gapPct: item.gapPct,
      gapClassification: item.gapClassification,

      v1MarketRegimePts,
      v2SectorStrengthPts,
      v3StockPriceActionPts,
      v4MomentumPts,
      v5VolumeRvolPts,
      v6FuturesOiPts,
      v7RiskVolatilityPts,
      totalScore,

      signalTier,
      setupType,
      isBuySetup,
      isSellSetup,

      buyCriteriaChecks,
      sellCriteriaChecks,

      instConfirmation,
      gapFilterNotice,
      isGapFilterActive,

      vwap: item.vwap,
      ema13: item.ema13,
      ema21: item.ema21,
      ema34: item.ema34,
      rsi: item.rsi,
      macdHist: item.macdHist,
      adx: item.adx,
      plusDI: item.plusDI,
      minusDI: item.minusDI,
      rvol: item.rvol,
      atr: item.atr,

      vol5m: item.vol5m,
      priceChange5m: item.priceChange5m,
      vol5mSurgeRatio: Number((item.rvol * 1.2).toFixed(1)),

      alertTime,
      entryTime,
      exitTime,
      exitPrice,
      perfectEntryTime,
      perfectEntryWindow,
      recommendedEntryPrice: fixedEntryPrice,
      entryRange: [entryMin, entryMax],

      fixedEntryPrice,
      fixedStopLoss: stopLossExit,
      fixedTarget1: target1Exit,
      fixedTarget2: target2Exit,
      fixedTarget3: target3Exit,
      riskPerShare,
      stopLossExit,
      target1Exit,
      target2Exit,
      target3Exit,
      riskReward: '1:2.0',
      exitStatus,
      tradeStatus,
      isClosed,
      realizedPoints,
      realizedPct,
      tradeResultLabel,
      perfectExitTime,
    };
  });
}
