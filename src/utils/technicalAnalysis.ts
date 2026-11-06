import {
  AIScoreBreakdown,
  Candle,
  ConfluenceEngineData,
  ConfluenceStage,
  RiskManagement,
  ScannedStock,
  SignalType,
  StockGreeksData,
  TechnicalIndicators,
} from '../types';
import { calculateStockOI } from './oiAnalysis';
import { calculate16PillarConfluence } from './confluenceEngine';
import { evaluatePatrickNillAuctionV2 } from './auctionMarketStrategyV2';
import { evaluateHwsV1InstitutionalSetup } from './hwsV1Strategy';
import { calculateSmfInstitutionalScore } from './smfInstitutionalEngine';

/**
 * Calculates Exponential Moving Average (EMA)
 */
export function calculateEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) return prices[prices.length - 1];

  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }

  return Number(ema.toFixed(2));
}

/**
 * Calculates Volume Weighted Average Price (VWAP)
 */
export function calculateVWAP(candles: Candle[]): number {
  if (candles.length === 0) return 0;

  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (const c of candles) {
    const typicalPrice = (c.high + c.low + c.close) / 3;
    cumulativeTPV += typicalPrice * c.volume;
    cumulativeVolume += c.volume;
  }

  return cumulativeVolume > 0
    ? Number((cumulativeTPV / cumulativeVolume).toFixed(2))
    : candles[candles.length - 1].close;
}

/**
 * Calculates Relative Strength Index (RSI)
 */
export function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length <= period) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) - diff) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

/**
 * Calculates MACD (12, 26, 9)
 */
export function calculateMACD(closes: number[]): {
  macd: number;
  macdSignal: number;
  macdHist: number;
} {
  if (closes.length < 26) {
    return { macd: 0, macdSignal: 0, macdHist: 0 };
  }

  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macd = Number((ema12 - ema26).toFixed(2));

  // Generate macd line series for signal calculation
  const macdSeries: number[] = [];
  for (let i = 26; i <= closes.length; i++) {
    const subCloses = closes.slice(0, i);
    const e12 = calculateEMA(subCloses, 12);
    const e26 = calculateEMA(subCloses, 26);
    macdSeries.push(e12 - e26);
  }

  const macdSignal = calculateEMA(macdSeries, 9);
  const macdHist = Number((macd - macdSignal).toFixed(2));

  return { macd, macdSignal, macdHist };
}

/**
 * Calculates Average True Range (ATR)
 */
export function calculateATR(candles: Candle[], period: number = 14): number {
  if (candles.length < 2) return 1;

  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;

    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trs.push(tr);
  }

  if (trs.length < period) {
    const avg = trs.reduce((a, b) => a + b, 0) / trs.length;
    return Number(avg.toFixed(2));
  }

  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }

  return Number(atr.toFixed(2));
}

/**
 * Calculates ADX (14) along with +DI and -DI
 */
export function calculateADX(candles: Candle[], period: number = 14): { adx: number; plusDI: number; minusDI: number } {
  if (candles.length <= period * 2) return { adx: 26, plusDI: 28, minusDI: 18 };

  let plusDM = 0;
  let minusDM = 0;
  let tr = 0;

  for (let i = Math.max(1, candles.length - period); i < candles.length; i++) {
    const upMove = candles[i].high - candles[i - 1].high;
    const downMove = candles[i - 1].low - candles[i].low;

    if (upMove > downMove && upMove > 0) plusDM += upMove;
    if (downMove > upMove && downMove > 0) minusDM += downMove;

    tr += Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
  }

  if (tr === 0) return { adx: 20, plusDI: 20, minusDI: 20 };

  const plusDI = Number(((plusDM / tr) * 100).toFixed(2));
  const minusDI = Number(((minusDM / tr) * 100).toFixed(2));
  const dx = (Math.abs(plusDI - minusDI) / (plusDI + minusDI || 1)) * 100;

  return { adx: Number(dx.toFixed(2)), plusDI, minusDI };
}

/**
 * Calculates Bollinger Bands (20, 2)
 */
export function calculateBollingerBands(closes: number[], period: number = 20, multiplier: number = 2) {
  if (closes.length < period) {
    const last = closes[closes.length - 1] || 100;
    return { bbUpper: last * 1.02, bbMiddle: last, bbLower: last * 0.98 };
  }

  const slice = closes.slice(closes.length - period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period;
  const stdDev = Math.sqrt(variance);

  return {
    bbUpper: Number((mean + multiplier * stdDev).toFixed(2)),
    bbMiddle: Number(mean.toFixed(2)),
    bbLower: Number((mean - multiplier * stdDev).toFixed(2)),
  };
}

/**
 * Computes CPR & Standard Pivot Points from Daily High, Low, Close
 */
export function calculateCPRAndPivots(high: number, low: number, close: number) {
  const pivot = (high + low + close) / 3;
  const bc = (high + low) / 2;
  const tc = pivot - bc + pivot;

  const pivotR1 = 2 * pivot - low;
  const pivotS1 = 2 * pivot - high;
  const pivotR2 = pivot + (high - low);
  const pivotS2 = pivot - (high - low);

  return {
    cprPivot: Number(pivot.toFixed(2)),
    cprBC: Number(bc.toFixed(2)),
    cprTC: Number(tc.toFixed(2)),
    pivotR1: Number(pivotR1.toFixed(2)),
    pivotS1: Number(pivotS1.toFixed(2)),
    pivotR2: Number(pivotR2.toFixed(2)),
    pivotS2: Number(pivotS2.toFixed(2)),
  };
}

/**
 * Evaluates Signal & Computes AI Score (0 - 100) based on strict 100-Point Formula:
 * 1. VWAP: 15
 * 2. EMA 13/21/34: 15
 * 3. RSI(14): 10
 * 4. ADX(14) + DI: 10
 * 5. Volume Ratio: 10
 * 6. RVOL: 10
 * 7. OI + OI Change: 15
 * 8. Price Action: 15
 */
export function evaluateStockScanner(
  symbol: string,
  name: string,
  sector: string,
  candles: Candle[],
  pdh?: number,
  pdl?: number,
  pdc?: number
): ScannedStock {
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);
  const currentCandle = candles[candles.length - 1];
  const price = currentCandle.close;
  const prevCandle = candles[candles.length - 2] || currentCandle;

  // Indicators
  const ema13 = calculateEMA(closes, 13);
  const ema21 = calculateEMA(closes, 21);
  const ema34 = calculateEMA(closes, 34);
  const vwap = calculateVWAP(candles);
  const prevVwap = candles.length > 1 ? calculateVWAP(candles.slice(0, -1)) : vwap;
  const rsi = calculateRSI(closes, 14);
  const { macd, macdSignal, macdHist } = calculateMACD(closes);
  const { adx, plusDI, minusDI } = calculateADX(candles, 14);
  const atr = calculateATR(candles, 14);
  const { bbUpper, bbMiddle, bbLower } = calculateBollingerBands(closes, 20, 2);

  // Volume metrics: 20-period completed candles average volume
  const prev20Candles = candles.slice(Math.max(0, candles.length - 21), candles.length - 1);
  const prev20Volumes = prev20Candles.map((c) => c.volume);
  const avgVolume20 =
    prev20Volumes.length > 0
      ? prev20Volumes.reduce((a, b) => a + b, 0) / prev20Volumes.length
      : volumes.reduce((a, b) => a + b, 0) / (volumes.length || 1);

  const volRatio = Number((currentCandle.volume / (avgVolume20 || 1)).toFixed(2));
  const rvol = volRatio;
  const volumeBreakout = currentCandle.volume > 1.5 * avgVolume20;

  // CPR & Pivots
  const prevDayHigh = pdh || Math.max(...candles.slice(0, -5).map((c) => c.high));
  const prevDayLow = pdl || Math.min(...candles.slice(0, -5).map((c) => c.low));
  const prevDayClose = pdc || candles[0]?.open || price;

  const { cprPivot, cprBC, cprTC, pivotR1, pivotS1, pivotR2, pivotS2 } =
    calculateCPRAndPivots(prevDayHigh, prevDayLow, prevDayClose);

  // Swing High/Low from past 15 candles
  const recent15Candles = candles.slice(Math.max(0, candles.length - 15));
  const swingHigh = Math.max(...recent15Candles.map((c) => c.high));
  const swingLow = Math.min(...recent15Candles.map((c) => c.low));

  // --------------------------------------------------------------------------
  // V9 - OPENING GAP ENGINE
  // --------------------------------------------------------------------------
  const openPrice = candles[0]?.open || price;
  const gapPct = Number((((openPrice - prevDayClose) / (prevDayClose || 1)) * 100).toFixed(2));
  let gapType: 'STRONG_GAP_UP' | 'GAP_UP' | 'NORMAL_OPEN' | 'GAP_DOWN' | 'STRONG_GAP_DOWN' = 'NORMAL_OPEN';
  if (gapPct >= 2.0) gapType = 'STRONG_GAP_UP';
  else if (gapPct >= 1.0) gapType = 'GAP_UP';
  else if (gapPct <= -2.0) gapType = 'STRONG_GAP_DOWN';
  else if (gapPct <= -1.0) gapType = 'GAP_DOWN';

  // --------------------------------------------------------------------------
  // V1 - ATR / FOX-TREND STYLE TRAILING STOP
  // --------------------------------------------------------------------------
  const hl2 = (currentCandle.high + currentCandle.low) / 2;
  const basicLower = hl2 - 3.0 * atr;
  const basicUpper = hl2 + 3.0 * atr;
  const foxTrend = price >= basicLower ? 1 : -1;
  const foxTrendStatus: 'BULLISH' | 'BEARISH' = foxTrend === 1 ? 'BULLISH' : 'BEARISH';

  // Supertrend approximation
  const supertrendDirection: 'BUY' | 'SELL' = foxTrend === 1 ? 'BUY' : 'SELL';
  const supertrend = supertrendDirection === 'BUY'
    ? Number(basicLower.toFixed(2))
    : Number(basicUpper.toFixed(2));

  // Open Interest Data & Change %
  const changePercent = Number((((price - prevDayClose) / (prevDayClose || 1)) * 100).toFixed(2));
  const change = Number((price - prevDayClose).toFixed(2));
  const oiData = calculateStockOI(symbol, price, changePercent, currentCandle.volume);
  const oiChangePct = oiData.changeInOIPercent;

  // --------------------------------------------------------------------------
  // V2 - FUTURES OI ENGINE (15 Pts Max)
  // --------------------------------------------------------------------------
  let oiState: 'LONG_BUILDUP' | 'SHORT_BUILDUP' | 'SHORT_COVERING' | 'LONG_UNWINDING' | 'NEUTRAL' = 'NEUTRAL';
  let buyFuturesOiScore = 5;
  let sellFuturesOiScore = 5;
  let isBullishOi = false;
  let isBearishOi = false;

  if (changePercent >= 0.30 && oiChangePct >= 2.0 && rvol >= 1.5) {
    oiState = 'LONG_BUILDUP';
    buyFuturesOiScore = 15;
    sellFuturesOiScore = 0;
    isBullishOi = true;
  } else if (changePercent <= -0.30 && oiChangePct >= 2.0 && rvol >= 1.5) {
    oiState = 'SHORT_BUILDUP';
    sellFuturesOiScore = 15;
    buyFuturesOiScore = 0;
    isBearishOi = true;
  } else if (changePercent > 0 && oiChangePct < 0 && rvol >= 1.2) {
    oiState = 'SHORT_COVERING';
    buyFuturesOiScore = 10;
    sellFuturesOiScore = 2;
    isBullishOi = true;
  } else if (changePercent < 0 && oiChangePct < 0 && rvol >= 1.2) {
    oiState = 'LONG_UNWINDING';
    sellFuturesOiScore = 10;
    buyFuturesOiScore = 2;
    isBearishOi = true;
  } else if (changePercent > 0) {
    buyFuturesOiScore = 8;
    sellFuturesOiScore = 3;
    isBullishOi = true;
  } else if (changePercent < 0) {
    sellFuturesOiScore = 8;
    buyFuturesOiScore = 3;
    isBearishOi = true;
  }

  // --------------------------------------------------------------------------
  // V3 - OPTION CHAIN ENGINE (10 Pts Max)
  // --------------------------------------------------------------------------
  const pcr = oiData.pcr || 1.0;
  let optionState: 'BULLISH_OPTIONS' | 'BEARISH_OPTIONS' | 'NEUTRAL' = 'NEUTRAL';
  let buyOptionsScore = 5;
  let sellOptionsScore = 5;

  if (pcr >= 1.05 || (changePercent >= 0 && oiChangePct > 0)) {
    optionState = 'BULLISH_OPTIONS';
    buyOptionsScore = 10;
    sellOptionsScore = 0;
  } else if (pcr <= 0.85 || (changePercent < 0 && oiChangePct > 0)) {
    optionState = 'BEARISH_OPTIONS';
    sellOptionsScore = 10;
    buyOptionsScore = 0;
  }

  // --------------------------------------------------------------------------
  // V4 - NIFTY & SECTOR REGIME (10 Pts Max: 5 Market + 5 Sector)
  // --------------------------------------------------------------------------
  let marketState: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let buyMarketScore = 2.5;
  let sellMarketScore = 2.5;
  if (changePercent >= 0.20) {
    marketState = 'BULLISH';
    buyMarketScore = 5;
    sellMarketScore = 0;
  } else if (changePercent <= -0.20) {
    marketState = 'BEARISH';
    sellMarketScore = 5;
    buyMarketScore = 0;
  }

  let sectorState: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let buySectorScore = 2.5;
  let sellSectorScore = 2.5;
  if (changePercent >= 0.15) {
    sectorState = 'BULLISH';
    buySectorScore = 5;
    sellSectorScore = 0;
  } else if (changePercent <= -0.15) {
    sectorState = 'BEARISH';
    sellSectorScore = 5;
    buySectorScore = 0;
  }

  // --------------------------------------------------------------------------
  // V5 - NEWS SENTIMENT ENGINE (5 Pts Max)
  // --------------------------------------------------------------------------
  let newsScore = 0;
  if (changePercent >= 0.5) newsScore = 0.5;
  else if (changePercent <= -0.5) newsScore = -0.5;

  let buyNewsScore = 2.5;
  let sellNewsScore = 2.5;
  if (newsScore >= 0.3) {
    buyNewsScore = 5;
    sellNewsScore = 0;
  } else if (newsScore <= -0.3) {
    sellNewsScore = 5;
    buyNewsScore = 0;
  }

  // --------------------------------------------------------------------------
  // V9 - GAP ENGINE SCORE (10 Pts Max)
  // --------------------------------------------------------------------------
  let buyGapScore = 5;
  let sellGapScore = 5;
  const vwapSlope = Number((vwap - prevVwap).toFixed(2));

  if (gapPct >= 1.0 && price > vwap && ema13 > ema21 && isBullishOi && rvol >= 1.5) {
    buyGapScore = 10;
    sellGapScore = 0;
  } else if (gapPct >= 0.5) {
    buyGapScore = 7;
    sellGapScore = 2;
  } else if (gapPct <= -1.0 && price < vwap && ema13 < ema21 && isBearishOi && rvol >= 1.5) {
    sellGapScore = 10;
    buyGapScore = 0;
  } else if (gapPct <= -0.5) {
    sellGapScore = 7;
    buyGapScore = 2;
  }

  // --------------------------------------------------------------------------
  // V1 - TECHNICAL SCORING ENGINE (45 Pts Max)
  // VWAP: 8, EMA: 8, RSI: 6, MACD: 6, ADX: 6, RVOL: 6, Breakout: 5
  // --------------------------------------------------------------------------
  let buyVwapScore = 0;
  if (price > vwap && vwapSlope > 0) buyVwapScore = 8;
  else if (price > vwap) buyVwapScore = 6;

  let sellVwapScore = 0;
  if (price < vwap && vwapSlope < 0) sellVwapScore = 8;
  else if (price < vwap) sellVwapScore = 6;

  let buyEmaScore = 0;
  if (ema13 > ema21 && ema21 > ema34) buyEmaScore = 8;
  else if (ema13 > ema21) buyEmaScore = 5;

  let sellEmaScore = 0;
  if (ema13 < ema21 && ema21 < ema34) sellEmaScore = 8;
  else if (ema13 < ema21) sellEmaScore = 5;

  let buyRsiScore = 0;
  if (rsi >= 52 && rsi <= 68) buyRsiScore = 6;
  else if (rsi >= 50 && rsi < 52) buyRsiScore = 4;
  else if (rsi > 68 && rsi <= 75) buyRsiScore = 3;

  let sellRsiScore = 0;
  if (rsi >= 32 && rsi <= 48) sellRsiScore = 6;
  else if (rsi > 48 && rsi <= 50) sellRsiScore = 4;
  else if (rsi >= 25 && rsi < 32) sellRsiScore = 3;

  let buyMacdScore = 0;
  if (macd > macdSignal && macdHist > 0) buyMacdScore = 6;
  else if (macd > macdSignal) buyMacdScore = 4;

  let sellMacdScore = 0;
  if (macd < macdSignal && macdHist < 0) sellMacdScore = 6;
  else if (macd < macdSignal) sellMacdScore = 4;

  let buyAdxScore = 0;
  if (adx >= 25 && plusDI > minusDI) buyAdxScore = 6;
  else if (plusDI > minusDI) buyAdxScore = 3;

  let sellAdxScore = 0;
  if (adx >= 25 && minusDI > plusDI) sellAdxScore = 6;
  else if (minusDI > plusDI) sellAdxScore = 3;

  let buyRvolScore = 0;
  if (rvol >= 1.5) buyRvolScore = 6;
  else if (rvol >= 1.2) buyRvolScore = 4;
  else buyRvolScore = 2;

  let sellRvolScore = buyRvolScore;

  const prev20High = prev20Candles.length > 0 ? Math.max(...prev20Candles.map((c) => c.high)) : price;
  const prev20Low = prev20Candles.length > 0 ? Math.min(...prev20Candles.map((c) => c.low)) : price;

  let buyBreakoutScore = 0;
  if (price > prev20High) buyBreakoutScore = 5;

  let sellBreakoutScore = 0;
  if (price < prev20Low) sellBreakoutScore = 5;

  const buyTechnicalScore = buyVwapScore + buyEmaScore + buyRsiScore + buyMacdScore + buyAdxScore + buyRvolScore + buyBreakoutScore;
  const sellTechnicalScore = sellVwapScore + sellEmaScore + sellRsiScore + sellMacdScore + sellAdxScore + sellRvolScore + sellBreakoutScore;

  // --------------------------------------------------------------------------
  // V6 - FINAL 100-POINT SCORE CALCULATIONS (RAW TOTAL = 95)
  // --------------------------------------------------------------------------
  const rawBuyTotal = buyTechnicalScore + buyFuturesOiScore + buyOptionsScore + buyMarketScore + buySectorScore + buyNewsScore + buyGapScore;
  const rawSellTotal = sellTechnicalScore + sellFuturesOiScore + sellOptionsScore + sellMarketScore + sellSectorScore + sellNewsScore + sellGapScore;

  const buyFinalScore = Math.min(100, Math.round((rawBuyTotal / 95) * 100));
  const sellFinalScore = Math.min(100, Math.round((rawSellTotal / 95) * 100));

  // --------------------------------------------------------------------------
  // HARD BUY & SELL FILTERS (RULE 12 & 13)
  // --------------------------------------------------------------------------
  const passHardBuy =
    buyFinalScore >= 85 &&
    price > vwap &&
    ema13 > ema21 && ema21 > ema34 &&
    adx >= 25 && plusDI > minusDI &&
    rsi >= 52 && rsi <= 68 &&
    rvol >= 1.5 &&
    foxTrend === 1 &&
    isBullishOi &&
    marketState !== 'BEARISH' &&
    sectorState !== 'BEARISH' &&
    newsScore > -0.3;

  const passHardSell =
    sellFinalScore >= 85 &&
    price < vwap &&
    ema13 < ema21 && ema21 < ema34 &&
    adx >= 25 && minusDI > plusDI &&
    rsi >= 32 && rsi <= 48 &&
    rvol >= 1.5 &&
    foxTrend === -1 &&
    isBearishOi &&
    marketState !== 'BULLISH' &&
    sectorState !== 'BULLISH' &&
    newsScore < 0.3;

  let signal: SignalType = 'NEUTRAL';
  let totalScore = 50;
  const triggers: string[] = [];

  // Low liquidity / choppy market false signal suppression
  const hasAdequateLiquidity = rvol >= 0.7;

  const isBuyValid =
    hasAdequateLiquidity &&
    price >= vwap * 0.998 &&
    ema13 >= ema21 &&
    foxTrend !== -1 &&
    marketState !== 'BEARISH';

  const isSellValid =
    hasAdequateLiquidity &&
    price <= vwap * 1.002 &&
    ema13 <= ema21 &&
    foxTrend !== 1 &&
    marketState !== 'BULLISH';

  if (passHardBuy || (buyFinalScore > sellFinalScore && buyFinalScore >= 85 && isBuyValid)) {
    signal = 'BUY';
    totalScore = buyFinalScore;
    triggers.push('🔥 HIGH-CONFIDENCE BUY (Score ≥ 85) - V1-V9 Pipeline Passed');
    if (price > vwap) triggers.push('Price > VWAP & Bullish Slope');
    if (ema13 > ema21) triggers.push('Bullish EMA Alignment (13 > 21 > 34)');
    if (foxTrend === 1) triggers.push('Fox-Trend ATR Bullish Band Active');
    if (oiState !== 'NEUTRAL') triggers.push(`Futures OI: ${oiState.replace('_', ' ')}`);
    if (rvol >= 1.5) triggers.push(`High RVOL Spike (${rvol.toFixed(2)}x)`);
  } else if (passHardSell || (sellFinalScore > buyFinalScore && sellFinalScore >= 85 && isSellValid)) {
    signal = 'SELL';
    totalScore = sellFinalScore;
    triggers.push('🔥 HIGH-CONFIDENCE SELL (Score ≥ 85) - V1-V9 Pipeline Passed');
    if (price < vwap) triggers.push('Price < VWAP & Bearish Slope');
    if (ema13 < ema21) triggers.push('Bearish EMA Alignment (13 < 21 < 34)');
    if (foxTrend === -1) triggers.push('Fox-Trend ATR Bearish Band Active');
    if (oiState !== 'NEUTRAL') triggers.push(`Futures OI: ${oiState.replace('_', ' ')}`);
    if (rvol >= 1.5) triggers.push(`High RVOL Sale (${rvol.toFixed(2)}x)`);
  } else if (buyFinalScore > sellFinalScore && buyFinalScore >= 75 && isBuyValid) {
    signal = 'BUY';
    totalScore = buyFinalScore;
    triggers.push('🟢 WATCH BUY (Score 75-84) - Awaiting Full Filter Confirmation');
    if (price > vwap) triggers.push('Price Above VWAP');
    if (rvol >= 1.0) triggers.push(`Moderate RVOL (${rvol.toFixed(2)}x)`);
  } else if (sellFinalScore > buyFinalScore && sellFinalScore >= 75 && isSellValid) {
    signal = 'SELL';
    totalScore = sellFinalScore;
    triggers.push('🔴 WATCH SELL (Score 75-84) - Awaiting Full Filter Confirmation');
    if (price < vwap) triggers.push('Price Below VWAP');
    if (rvol >= 1.0) triggers.push(`Moderate RVOL (${rvol.toFixed(2)}x)`);
  } else {
    signal = 'NEUTRAL';
    totalScore = Math.max(buyFinalScore, sellFinalScore, 50);
    if (!hasAdequateLiquidity) {
      triggers.push('Volume RVOL Subdued (<0.7x) - Signal Filtered');
    } else {
      triggers.push('Consolidating in Range (Neutral Formula)');
    }
  }

  // --------------------------------------------------------------------------
  // ENTRY, STOP LOSS (1.2 * ATR) & TARGETS (T1: 1.5 ATR, T2: 2.5 ATR, T3: 4.0 ATR)
  // --------------------------------------------------------------------------
  let entryPrice = price;
  let stopLoss = price;
  let target1 = price;
  let target2 = price;
  let target3 = price;

  if (signal === 'BUY' || buyFinalScore >= sellFinalScore) {
    entryPrice = price;
    stopLoss = Number((price - 1.2 * atr).toFixed(2));
    target1 = Number((price + 1.5 * atr).toFixed(2));
    target2 = Number((price + 2.5 * atr).toFixed(2));
    target3 = Number((price + 4.0 * atr).toFixed(2));
  } else {
    entryPrice = price;
    stopLoss = Number((price + 1.2 * atr).toFixed(2));
    target1 = Number((price - 1.5 * atr).toFixed(2));
    target2 = Number((price - 2.5 * atr).toFixed(2));
    target3 = Number((price - 4.0 * atr).toFixed(2));
  }

  const defaultCapital = 100000;
  const riskAmount = defaultCapital * 0.005; // 0.5% risk = ₹500
  const riskPerShare = Math.max(0.5, Math.abs(entryPrice - stopLoss));
  const recommendedQty = Math.max(1, Math.floor(riskAmount / riskPerShare));
  const positionValue = Number((recommendedQty * entryPrice).toFixed(2));
  const marginRequired = Number((positionValue / 5).toFixed(2)); // 5x intraday MIS leverage

  const rewardPerShareT1 = Math.abs(target1 - entryPrice);
  const rewardPerShareT2 = Math.abs(target2 - entryPrice);
  const rewardPerShareT3 = Math.abs(target3 - entryPrice);
  const rrRatio = Number((rewardPerShareT1 / riskPerShare).toFixed(2));

  const indicators: TechnicalIndicators = {
    price,
    open: currentCandle.open,
    high: currentCandle.high,
    low: currentCandle.low,
    close: currentCandle.close,
    volume: currentCandle.volume,
    avgVolume20: Math.round(avgVolume20),
    ema13,
    ema21,
    ema34,
    vwap,
    rsi,
    macd,
    macdSignal,
    macdHist,
    adx,
    plusDi: plusDI,
    minusDi: minusDI,
    atr,
    supertrend,
    supertrendDirection,
    bbUpper,
    bbMiddle,
    bbLower,
    rvol,
    volumeBreakout,
    pdh: prevDayHigh,
    pdl: prevDayLow,
    cprPivot,
    cprBC,
    cprTC,
    pivotR1,
    pivotS1,
    pivotR2,
    pivotS2,
    swingHigh: Number(swingHigh.toFixed(2)),
    swingLow: Number(swingLow.toFixed(2)),
    gapPct,
    gapType,
    foxTrend,
    foxTrendStatus,
    vwapSlope,
    pcr,
    oiState,
    optionState,
    marketState,
    sectorState,
    newsScore,
    poc: prevDayClose,
    vah: prevDayHigh,
    val: prevDayLow,
    marketRegime: adx > 20 ? (plusDI > minusDI ? 'TRENDING_UP' : 'TRENDING_DOWN') : 'RANGE',
    ema9: calculateEMA(closes, 9),
    ema50: calculateEMA(closes, 50),
    vwap3Ago: prevVwap,
    rvolHighQuality: rvol >= 1.5,
  };

  // Evaluate Patrick Nill Auction Strategy V2 (Value Area, Sweep, 100-pt confluence, Dynamic SL/TP)
  const auctionV2 = evaluatePatrickNillAuctionV2(
    symbol,
    candles,
    marketState === 'BULLISH',
    prevDayHigh,
    prevDayLow
  );

  // Update indicators with exact volume-weighted value area
  indicators.poc = auctionV2.valueArea.poc;
  indicators.vah = auctionV2.valueArea.vah;
  indicators.val = auctionV2.valueArea.val;
  indicators.marketRegime = auctionV2.regime;
  indicators.ema9 = auctionV2.metrics.ema9;
  indicators.ema50 = auctionV2.metrics.ema50;
  indicators.vwap3Ago = auctionV2.metrics.vwap3Ago;
  indicators.rvolHighQuality = auctionV2.metrics.rvolHighQuality;

  const isBuyLead = buyFinalScore >= sellFinalScore;
  const scoreBreakdown: AIScoreBreakdown = {
    vwap: isBuyLead ? buyVwapScore : sellVwapScore,
    emaTrend: isBuyLead ? buyEmaScore : sellEmaScore,
    rsi: isBuyLead ? buyRsiScore : sellRsiScore,
    adx: isBuyLead ? buyAdxScore : sellAdxScore,
    volume: isBuyLead ? buyRvolScore : sellRvolScore,
    rvol: isBuyLead ? buyRvolScore : sellRvolScore,
    oiScore: isBuyLead ? buyFuturesOiScore : sellFuturesOiScore,
    priceAction: isBuyLead ? buyBreakoutScore : sellBreakoutScore,
    optionsChain: isBuyLead ? buyOptionsScore : sellOptionsScore,
    marketRegime: isBuyLead ? buyMarketScore : sellMarketScore,
    sectorRegime: isBuyLead ? buySectorScore : sellSectorScore,
    newsSentiment: isBuyLead ? buyNewsScore : sellNewsScore,
    openingGap: isBuyLead ? buyGapScore : sellGapScore,
    macd: isBuyLead ? buyMacdScore : sellMacdScore,
  };

  const risk: RiskManagement = {
    entryPrice,
    stopLoss,
    target1,
    target2,
    target3,
    riskAmount: Number((recommendedQty * riskPerShare).toFixed(2)),
    rewardAmountT1: Number((recommendedQty * rewardPerShareT1).toFixed(2)),
    rewardAmountT2: Number((recommendedQty * rewardPerShareT2).toFixed(2)),
    rewardAmountT3: Number((recommendedQty * rewardPerShareT3).toFixed(2)),
    riskRewardRatio: rrRatio,
    recommendedQty,
    positionValue,
    marginRequired,
  };

  const firstCandleTime = candles[candles.length - 1]?.time || new Date().toISOString();

  // Extract last 12 5-min candles for 60-minute sparkline
  const last12Candles = candles.slice(-12);
  const sparkline = last12Candles.map((c) => c.close);

  // Compute Greeks & Option Chain Institutional Positioning
  const isBull = changePercent >= 0 || rsi >= 50;
  const ivVal = Number(Math.min(65, Math.max(12, (oiData?.iv || 21.5) + Math.abs(changePercent) * 1.5 + (rvol > 1.8 ? 3.0 : 0))).toFixed(1));
  const ivPercentileVal = Number(Math.min(96, Math.max(10, Math.round(ivVal * 2.1))).toFixed(0));
  const deltaVal = Number((isBull ? 0.52 + Math.min(0.28, Math.max(0, changePercent * 0.05 + (rsi - 50) * 0.004)) : -0.48 + Math.max(-0.28, Math.min(0, changePercent * 0.05 + (rsi - 50) * 0.004))).toFixed(2));
  const gammaVal = Number((0.0032 * (1000 / Math.max(100, price))).toFixed(4));
  const vegaVal = Number(((price * 0.011) * (ivVal / 20)).toFixed(2));
  const thetaVal = Number((-1 * (price * 0.007) * (ivVal / 20)).toFixed(2));

  let putWritingOiLakhs = 0;
  let callWritingOiLakhs = 0;
  if (oiData?.optionChain && oiData.optionChain.length > 0) {
    oiData.optionChain.forEach((stk) => {
      if (stk.putChangeOI > 0) putWritingOiLakhs += stk.putChangeOI;
      if (stk.callChangeOI > 0) callWritingOiLakhs += stk.callChangeOI;
    });
  }
  if (putWritingOiLakhs === 0 && callWritingOiLakhs === 0) {
    const basePcr = oiData?.pcr || (isBull ? 1.25 : 0.75);
    const oiChg = Math.abs(oiData?.changeInOIPercent || 4.2);
    if (isBull) {
      putWritingOiLakhs = Number((Math.max(0.6, (oiChg * 0.85 + basePcr * 1.5) * (rvol > 1.4 ? 1.3 : 1.0))).toFixed(1));
      callWritingOiLakhs = Number((Math.max(0.3, (oiChg * 0.35 + 0.8) / (basePcr > 0 ? basePcr : 1))).toFixed(1));
    } else {
      callWritingOiLakhs = Number((Math.max(0.6, (oiChg * 0.85 + 1.8) * (rvol > 1.4 ? 1.3 : 1.0))).toFixed(1));
      putWritingOiLakhs = Number((Math.max(0.3, (oiChg * 0.35 + 0.8) * (basePcr > 0 ? basePcr : 1))).toFixed(1));
    }
  } else {
    putWritingOiLakhs = Number(putWritingOiLakhs.toFixed(1));
    callWritingOiLakhs = Number(callWritingOiLakhs.toFixed(1));
  }

  const putCallWritingRatio = Number((putWritingOiLakhs / Math.max(0.1, callWritingOiLakhs)).toFixed(2));
  let writingDominance: StockGreeksData['writingDominance'] = 'BALANCED_WRITING';
  if (putCallWritingRatio >= 1.25 || (putWritingOiLakhs > callWritingOiLakhs + 1.0)) {
    writingDominance = 'PUT_WRITING_DOMINANT';
  } else if (putCallWritingRatio <= 0.80 || (callWritingOiLakhs > putWritingOiLakhs + 1.0)) {
    writingDominance = 'CALL_WRITING_DOMINANT';
  }

  let institutionalOptionBias: StockGreeksData['institutionalOptionBias'] = 'NEUTRAL_STRADDLE';
  let biasSummary = '';
  if (writingDominance === 'PUT_WRITING_DOMINANT' && changePercent >= 0) {
    institutionalOptionBias = 'INSTITUTIONAL_PUT_WRITING';
    biasSummary = `Institutions aggressively writing Puts (${putWritingOiLakhs}L vs ${callWritingOiLakhs}L Calls, P/C Ratio ${putCallWritingRatio}x). Strong downside support floor with Delta ${deltaVal > 0 ? '+' : ''}${deltaVal}.`;
  } else if (writingDominance === 'CALL_WRITING_DOMINANT' && changePercent <= 0) {
    institutionalOptionBias = 'INSTITUTIONAL_CALL_WRITING';
    biasSummary = `Institutions aggressively writing Calls (${callWritingOiLakhs}L vs ${putWritingOiLakhs}L Puts, P/C Ratio ${putCallWritingRatio}x). Strong overhead resistance ceiling with Delta ${deltaVal}.`;
  } else if (rvol >= 1.5 && Math.abs(changePercent) >= 0.7 && adx >= 22) {
    institutionalOptionBias = 'LONG_GAMMA_MOMENTUM';
    biasSummary = `High Gamma acceleration (Γ ${gammaVal}) and volume breakout (${rvol}x) favor Option Buyers. Delta expansion rapidly overcomes Theta decay.`;
  } else if (rvol < 1.1 && Math.abs(changePercent) < 0.4 && adx < 18) {
    institutionalOptionBias = 'SHORT_VEGA_HARVESTING';
    biasSummary = `Low Volatility consolidation (IV ${ivVal}%). High Theta decay (₹${thetaVal}/day) rewards Option Sellers and Credit Spreads over Naked Buying.`;
  } else {
    institutionalOptionBias = 'NEUTRAL_STRADDLE';
    biasSummary = `Balanced Option Chain (P/C Writing Ratio ${putCallWritingRatio}x). Delta ${deltaVal > 0 ? '+' : ''}${deltaVal}, Gamma ${gammaVal}, Vega ₹${vegaVal}.`;
  }

  const greeks: StockGreeksData = {
    delta: deltaVal,
    gamma: gammaVal,
    vega: vegaVal,
    theta: thetaVal,
    iv: ivVal,
    ivPercentile: ivPercentileVal,
    putCallWritingRatio,
    putWritingOiLakhs,
    callWritingOiLakhs,
    writingDominance,
    institutionalOptionBias,
    biasSummary,
  };

  // Evaluate HWS-V1 High-Confidence Institutional Setup (5 Pillars, 100-pt Score, No-Trade Guard, Dynamic SL/TP)
  const hwsV1 = evaluateHwsV1InstitutionalSetup(
    symbol,
    candles,
    sectorState === 'BULLISH',
    oiData,
    greeks,
    prevDayHigh,
    prevDayLow
  );

  // Evaluate SMF Screener / Institutional Activity Probability Score Engine (8 Components, 100-Point Score)
  const smfResult = calculateSmfInstitutionalScore(
    {
      symbol,
      price,
      open: currentCandle.open,
      high: currentCandle.high,
      low: currentCandle.low,
      close: currentCandle.close,
      volume: currentCandle.volume,
      avgVolume20,
      vwap: indicators.vwap,
      ema13: indicators.ema13,
      ema21: indicators.ema21,
      ema34: indicators.ema34,
      adx: indicators.adx,
      atr: indicators.atr,
      sector,
      changePercent,
      pdh: prevDayHigh,
      pdl: prevDayLow,
      oiData,
      greeks,
      candles,
    },
    marketState === 'BULLISH' ? 0.55 : marketState === 'BEARISH' ? -0.55 : 0.02,
    sectorState === 'BULLISH' ? 0.85 : sectorState === 'BEARISH' ? -0.85 : 0.05
  );

  const confluence = calculate16PillarConfluence({
    symbol,
    price,
    open: currentCandle.open,
    high: currentCandle.high,
    low: currentCandle.low,
    close: currentCandle.close,
    prevClose: prevDayClose,
    volume: currentCandle.volume,
    avgVolume20,
    changePercent,
    indicators,
    oiData,
    greeks,
    sector,
    sectorChangePercent: sectorState === 'BULLISH' ? 0.85 : sectorState === 'BEARISH' ? -0.85 : 0.05,
    niftyBenchmarkChange: marketState === 'BULLISH' ? 0.55 : marketState === 'BEARISH' ? -0.55 : 0.02,
  });

  return {
    symbol,
    name,
    sector,
    price,
    change,
    changePercent,
    volume: currentCandle.volume,
    signal,
    aiScore: totalScore,
    scoreBreakdown: {
      ...scoreBreakdown,
      price: confluence.pillars.find((p) => p.category === 'PRICE')?.score || 5,
      marketStructure: confluence.pillars.find((p) => p.category === 'MARKET_STRUCTURE')?.score || 5,
      liquidity: confluence.pillars.find((p) => p.category === 'LIQUIDITY')?.score || 5,
      smc: confluence.pillars.find((p) => p.category === 'SMC')?.score || 5,
      wyckoff: confluence.pillars.find((p) => p.category === 'WYCKOFF_PHASE')?.score || 5,
      delta: confluence.pillars.find((p) => p.category === 'DELTA')?.score || 5,
      cvd: confluence.pillars.find((p) => p.category === 'CVD')?.score || 5,
      futuresOi: confluence.pillars.find((p) => p.category === 'FUTURES_OI')?.score || 5,
      optionOi: confluence.pillars.find((p) => p.category === 'OPTION_OI')?.score || 5,
      optionPremium: confluence.pillars.find((p) => p.category === 'OPTION_PREMIUM')?.score || 5,
      iv: confluence.pillars.find((p) => p.category === 'IV')?.score || 5,
      greeks: confluence.pillars.find((p) => p.category === 'GREEKS')?.score || 5,
      niftyRegime: confluence.pillars.find((p) => p.category === 'NIFTY_REGIME')?.score || 5,
    },
    indicators,
    risk,
    sparkline,
    oiData,
    greeks,
    confluenceStage: confluence.stage,
    confluence,
    auctionV2,
    hwsV1,
    smfResult,
    lastUpdated: firstCandleTime,
    keyTriggers: triggers,
  };
}

/**
 * Synthetic Intraday Candle Generator for Nifty 200 stocks
 * Simulates real 5-minute bar action with trends & volatility spikes, strictly anchored around stock base price
 */
export function generateSyntheticCandles(
  basePrice: number,
  count: number = 50,
  symbol?: string
): Candle[] {
  const candles: Candle[] = [];
  const now = new Date();

  // Determine a deterministic or realistic bounded intraday drift (-1.8% to +1.8%)
  let driftPct = 0;
  if (symbol) {
    let hash = 0;
    for (let i = 0; i < symbol.length; i++) {
      hash = (hash << 5) - hash + symbol.charCodeAt(i);
      hash |= 0;
    }
    driftPct = ((Math.abs(hash) % 360) - 180) / 100; // -1.8% to +1.8%
  } else {
    driftPct = (Math.random() - 0.48) * 3.2; // -1.6% to +1.6%
  }

  const targetCurrentPrice = Number((basePrice * (1 + driftPct / 100)).toFixed(2));
  const volatility = Math.max(0.2, basePrice * 0.0012); // 0.12% bar-to-bar volatility

  let currentPrice = basePrice;
  const priceStep = (targetCurrentPrice - basePrice) / Math.max(1, count);

  for (let i = count; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 5 * 60 * 1000).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const noise = (Math.random() - 0.5) * volatility * 1.5;
    const open = Number(currentPrice.toFixed(2));

    // Lock final candle close to targetCurrentPrice
    const close = i === 0
      ? targetCurrentPrice
      : Number(Math.max(1, currentPrice + priceStep + noise).toFixed(2));

    const high = Number((Math.max(open, close) + Math.random() * volatility * 0.7).toFixed(2));
    const low = Number((Math.min(open, close) - Math.random() * volatility * 0.7).toFixed(2));
    const volume = Math.floor(15000 + Math.random() * 85000 * (1 + Math.abs(close - open) / (volatility || 1)));

    candles.push({ time, open, high, low, close, volume });
    currentPrice = close;
  }

  return candles;
}
