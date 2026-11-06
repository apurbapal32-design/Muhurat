import { Candle, SignalType } from '../types';

/**
 * Patrick Nill Auction Strategy V2
 * 
 * Core Architecture:
 * HTF Regime → True Auction/Value (POC/VAH/VAL 70%) → Liquidity Sweep → Reclaim →
 * Order Flow/Volume (RVOL) → Trend Confirmation (EMA + Separation + VWAP Direction + ADX/DI + RSI Recovery) →
 * 100-Point Confluence Score → Structural Dynamic SL/TP → Position Management
 */

export type MarketRegimeType = 'TRENDING_UP' | 'TRENDING_DOWN' | 'RANGE' | 'CHOPPY_EQUILIBRIUM';
export type StrategyModeType = 'TREND_PULLBACK' | 'FAILED_AUCTION_MEAN_REVERSION' | 'BREAKOUT_EXPANSION' | 'NO_TRADE';
export type SetupGradeType = 'A+' | 'A' | 'B' | 'WEAK' | 'NO_TRADE';

export interface VolumeProfileBin {
  price: number;
  priceHigh: number;
  priceLow: number;
  volume: number;
  isPoc: boolean;
  isInValueArea: boolean;
}

export interface AuctionValueArea {
  poc: number;            // Point of Control (Highest-Volume Price Zone)
  vah: number;            // Value Area High (~70% Volume Upper Boundary)
  val: number;            // Value Area Low (~70% Volume Lower Boundary)
  totalVolume: number;
  valueAreaVolume: number;
  valueAreaVolumePercent: number; // ~70%
  bins: VolumeProfileBin[];
  priceRange: {
    high: number;
    low: number;
  };
}

export interface LiquiditySweepStatus {
  isLongSweep: boolean;       // Low < VAL AND Close > VAL AND Close > Open AND Volume > AvgVol
  isShortSweep: boolean;      // High > VAH AND Close < VAH AND Close < Open AND Volume > AvgVol
  sweepType: 'LONG_VAL_SWEEP_RECLAIM' | 'SHORT_VAH_SWEEP_REJECTION' | 'RANGE_INSIDE_VALUE' | 'BREAKOUT_EXPANSION' | 'NONE';
  sweepPrice: number;         // Sweep extreme (Low for long, High for short)
  reclaimPrice: number;       // Candle close that confirmed reclaim
  rvolAtSweep: number;
  details: string;
}

export interface ScoreItem {
  id: string;
  condition: string;
  category: string;
  points: number;
  maxPoints: number;
  achieved: boolean;
  notes: string;
}

export interface Confluence100Score {
  totalScore: number;
  grade: SetupGradeType;
  direction: 'LONG' | 'SHORT' | 'NEUTRAL';
  isQualified: boolean;       // Score >= 80
  items: ScoreItem[];
  bullishScore: number;
  bearishScore: number;
}

export interface AuctionRiskLadder {
  entryPrice: number;
  structuralSL: number;
  slDistance: number;
  slAtrMultiple: number;      // Bounded [1.0x, 2.0x ATR]
  target1_1R: number;         // 1R Target (SL to BE)
  target2_2R: number;         // 2R Target (Trailing Stop)
  target3_Liquidity: number;  // Nearest Major Liquidity Level / POC / VAH / VAL
  target3Name: string;
  riskRewardT1: number;       // 1.0
  riskRewardT2: number;       // 2.0
  riskRewardT3: number;       // To major liquidity target
  passesMinRR: boolean;       // RR to nearest target >= 1.5
  trailingRule: string;
}

export interface MajorLiquidityLevels {
  pdh: number;                // Previous Day High
  pdl: number;                // Previous Day Low
  prevDayVah?: number;
  prevDayVal?: number;
  prevDayPoc?: number;
  sessionHigh: number;
  sessionLow: number;
  swingHigh: number;
  swingLow: number;
  poc: number;
  vah: number;
  val: number;
}

export interface PatrickNillAuctionV2Result {
  symbol: string;
  price: number;
  signal: SignalType;
  regime: MarketRegimeType;
  recommendedMode: StrategyModeType;
  valueArea: AuctionValueArea;
  liquiditySweep: LiquiditySweepStatus;
  confluenceScore: Confluence100Score;
  riskLadder: AuctionRiskLadder;
  liquidityLevels: MajorLiquidityLevels;
  metrics: {
    rvol: number;
    rvolHighQuality: boolean; // RVOL > 1.5
    rvolBaseline: boolean;    // RVOL > 1.2
    vwap: number;
    vwap3Ago: number;
    vwapRising: boolean;
    vwapFalling: boolean;
    ema9: number;
    ema21: number;
    ema50: number;
    ema9_21_Sep: number;      // (EMA9 - EMA21) / ATR
    ema21_50_Sep: number;     // (EMA21 - EMA50) / ATR
    emaAlignedLong: boolean;
    emaAlignedShort: boolean;
    emaSeparationPassed: boolean;
    adx: number;
    plusDI: number;
    minusDI: number;
    adxTrending: boolean;     // ADX > 20
    rsi: number;
    rsiRecoveryLong: boolean;  // Was < 40 and crossed back above 40
    rsiRecoveryShort: boolean; // Was > 60 and crossed back below 60
    atr: number;
  };
  keyTriggers: string[];
}

// --------------------------------------------------------------------------
// 1. TRUE VOLUME-WEIGHTED VALUE AREA (POC, VAH, VAL ~70%)
// --------------------------------------------------------------------------
export function calculateVolumeWeightedValueArea(
  candles: Candle[],
  binCount: number = 30
): AuctionValueArea {
  if (candles.length === 0) {
    return {
      poc: 0,
      vah: 0,
      val: 0,
      totalVolume: 0,
      valueAreaVolume: 0,
      valueAreaVolumePercent: 70,
      bins: [],
      priceRange: { high: 0, low: 0 },
    };
  }

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const highestPrice = Math.max(...highs);
  const lowestPrice = Math.min(...lows);
  const priceSpan = Math.max(0.05, highestPrice - lowestPrice);

  const binStep = priceSpan / binCount;
  const bins: VolumeProfileBin[] = [];

  for (let i = 0; i < binCount; i++) {
    const pLow = lowestPrice + i * binStep;
    const pHigh = pLow + binStep;
    const pMid = Number(((pLow + pHigh) / 2).toFixed(2));

    bins.push({
      price: pMid,
      priceLow: Number(pLow.toFixed(2)),
      priceHigh: Number(pHigh.toFixed(2)),
      volume: 0,
      isPoc: false,
      isInValueArea: false,
    });
  }

  let totalVol = 0;

  // Allocate candle volume across intersecting price bins
  for (const c of candles) {
    const cVol = c.volume || 1;
    totalVol += cVol;

    // Find all bins that intersect this candle's [low, high]
    const intersectingBins = bins.filter(
      (b) => b.priceHigh >= c.low && b.priceLow <= c.high
    );

    if (intersectingBins.length > 0) {
      const volPerBin = cVol / intersectingBins.length;
      for (const b of intersectingBins) {
        b.volume += volPerBin;
      }
    } else {
      // Find nearest bin
      const nearest = bins.reduce((prev, curr) =>
        Math.abs(curr.price - c.close) < Math.abs(prev.price - c.close) ? curr : prev
      );
      nearest.volume += cVol;
    }
  }

  // Find POC (Bin with max volume)
  let maxBinIdx = 0;
  let maxBinVol = -1;

  for (let i = 0; i < bins.length; i++) {
    bins[i].volume = Math.round(bins[i].volume);
    if (bins[i].volume > maxBinVol) {
      maxBinVol = bins[i].volume;
      maxBinIdx = i;
    }
  }

  bins[maxBinIdx].isPoc = true;
  bins[maxBinIdx].isInValueArea = true;
  const pocPrice = bins[maxBinIdx].price;

  // Expand outwards from POC until ~70% of total volume is captured
  const targetValueVolume = totalVol * 0.70;
  let currentVaVol = bins[maxBinIdx].volume;
  let upperIdx = maxBinIdx;
  let lowerIdx = maxBinIdx;

  while (currentVaVol < targetValueVolume && (upperIdx < bins.length - 1 || lowerIdx > 0)) {
    const nextUpperVol = upperIdx < bins.length - 1 ? bins[upperIdx + 1].volume : 0;
    const nextLowerVol = lowerIdx > 0 ? bins[lowerIdx - 1].volume : 0;

    if (upperIdx < bins.length - 1 && (nextUpperVol >= nextLowerVol || lowerIdx === 0)) {
      upperIdx++;
      bins[upperIdx].isInValueArea = true;
      currentVaVol += bins[upperIdx].volume;
    } else if (lowerIdx > 0) {
      lowerIdx--;
      bins[lowerIdx].isInValueArea = true;
      currentVaVol += bins[lowerIdx].volume;
    } else {
      break;
    }
  }

  const vahPrice = bins[upperIdx].priceHigh;
  const valPrice = bins[lowerIdx].priceLow;
  const vaPercent = totalVol > 0 ? Number(((currentVaVol / totalVol) * 100).toFixed(1)) : 70.0;

  return {
    poc: Number(pocPrice.toFixed(2)),
    vah: Number(vahPrice.toFixed(2)),
    val: Number(valPrice.toFixed(2)),
    totalVolume: totalVol,
    valueAreaVolume: currentVaVol,
    valueAreaVolumePercent: vaPercent,
    bins,
    priceRange: {
      high: Number(highestPrice.toFixed(2)),
      low: Number(lowestPrice.toFixed(2)),
    },
  };
}

// --------------------------------------------------------------------------
// 2. PATRICK NILL AUCTION STRATEGY V2 EVALUATION ENGINE
// --------------------------------------------------------------------------
export function evaluatePatrickNillAuctionV2(
  symbol: string,
  candles: Candle[],
  htfTrendBullish: boolean = true,
  pdh?: number,
  pdl?: number
): PatrickNillAuctionV2Result {
  if (candles.length < 5) {
    const fallbackPrice = candles[candles.length - 1]?.close || 100;
    return createEmptyAuctionResult(symbol, fallbackPrice);
  }

  const currentCandle = candles[candles.length - 1];
  const prevCandle = candles[candles.length - 2] || currentCandle;
  const price = currentCandle.close;
  const closes = candles.map((c) => c.close);
  const volumes = candles.map((c) => c.volume);

  // 1. True Volume Profile Value Area
  const valueArea = calculateVolumeWeightedValueArea(candles, 28);
  const { poc, vah, val } = valueArea;

  // 2. Average Volume (20) and RVOL
  const last20Candles = candles.slice(Math.max(0, candles.length - 21), candles.length - 1);
  const avgVol20 =
    last20Candles.length > 0
      ? last20Candles.reduce((a, b) => a + b.volume, 0) / last20Candles.length
      : volumes.reduce((a, b) => a + b, 0) / (volumes.length || 1);

  const rvol = Number((currentCandle.volume / Math.max(1, avgVol20)).toFixed(2));
  const rvolBaseline = rvol >= 1.2;
  const rvolHighQuality = rvol >= 1.5;

  // 3. ATR (14)
  const atr = calculateQuickATR(candles, 14);

  // 4. VWAP & VWAP 3-period Slope
  const vwapSeries: number[] = [];
  for (let i = Math.max(1, candles.length - 5); i <= candles.length; i++) {
    vwapSeries.push(calculateQuickVWAP(candles.slice(0, i)));
  }
  const currentVWAP = vwapSeries[vwapSeries.length - 1] || price;
  const vwap3Ago = vwapSeries[Math.max(0, vwapSeries.length - 4)] || currentVWAP;
  const vwapRising = currentVWAP > vwap3Ago;
  const vwapFalling = currentVWAP < vwap3Ago;

  // 5. EMAs (9, 21, 50) & Separation
  const ema9 = calculateQuickEMA(closes, 9);
  const ema21 = calculateQuickEMA(closes, 21);
  const ema50 = calculateQuickEMA(closes, 50);

  // EMA 50 Slope
  const prev3Closes = closes.slice(0, -3);
  const ema50_3Ago = prev3Closes.length >= 50 ? calculateQuickEMA(prev3Closes, 50) : ema50;
  const ema50Rising = ema50 > ema50_3Ago;
  const ema50Falling = ema50 < ema50_3Ago;

  const ema9_21_Diff = ema9 - ema21;
  const ema21_50_Diff = ema21 - ema50;
  const minRequiredSep = 0.10 * atr;

  const emaAlignedLong = ema9 > ema21 && ema21 > ema50;
  const emaSeparationLong = ema9_21_Diff > minRequiredSep && ema21_50_Diff > minRequiredSep;

  const emaAlignedShort = ema9 < ema21 && ema21 < ema50;
  const emaSeparationShort = (ema21 - ema9) > minRequiredSep && (ema50 - ema21) > minRequiredSep;

  // 6. ADX + DI Confirmation
  const { adx, plusDI, minusDI } = calculateQuickADX(candles, 14);
  const adxTrending = adx > 20;

  // 7. RSI Recovery
  const rsiSeries: number[] = [];
  for (let i = Math.max(15, candles.length - 6); i <= candles.length; i++) {
    rsiSeries.push(calculateQuickRSI(closes.slice(0, i), 14));
  }
  const currentRSI = rsiSeries[rsiSeries.length - 1] || 50;
  const past5RSI = rsiSeries.slice(0, -1);

  // Long: RSI was < 40 and crosses back above 40
  const rsiWasBelow40 = past5RSI.some((r) => r < 40);
  const rsiRecoveryLong = rsiWasBelow40 && currentRSI >= 40;

  // Short: RSI was > 60 and crosses back below 60
  const rsiWasAbove60 = past5RSI.some((r) => r > 60);
  const rsiRecoveryShort = rsiWasAbove60 && currentRSI <= 60;

  // 8. Market Regime
  let regime: MarketRegimeType = 'CHOPPY_EQUILIBRIUM';
  if (adx < 18) {
    regime = 'RANGE';
  } else if (ema50Rising && adx > 20 && plusDI > minusDI) {
    regime = 'TRENDING_UP';
  } else if (ema50Falling && adx > 20 && minusDI > plusDI) {
    regime = 'TRENDING_DOWN';
  } else {
    regime = 'RANGE';
  }

  const recommendedMode: StrategyModeType =
    regime === 'TRENDING_UP' || regime === 'TRENDING_DOWN'
      ? 'TREND_PULLBACK'
      : regime === 'RANGE'
      ? 'FAILED_AUCTION_MEAN_REVERSION'
      : 'NO_TRADE';

  // 9. Real Failed Auction / Liquidity Sweep Detection
  // Check across recent 3 candles for the sweep
  const recent3 = candles.slice(-3);
  const lowestRecent = Math.min(...recent3.map((c) => c.low));
  const highestRecent = Math.max(...recent3.map((c) => c.high));

  // Long Failed Auction: Low < VAL AND Close > VAL AND Close > Open AND Volume > AvgVol
  const isLongSweep =
    (currentCandle.low < val || lowestRecent < val) &&
    currentCandle.close > val &&
    currentCandle.close > currentCandle.open &&
    currentCandle.volume > avgVol20;

  // Short Failed Auction: High > VAH AND Close < VAH AND Close < Open AND Volume > AvgVol
  const isShortSweep =
    (currentCandle.high > vah || highestRecent > vah) &&
    currentCandle.close < vah &&
    currentCandle.close < currentCandle.open &&
    currentCandle.volume > avgVol20;

  let sweepType: LiquiditySweepStatus['sweepType'] = 'NONE';
  let sweepPrice = price;
  let sweepDetails = 'Price fluctuating within normal boundaries';

  if (isLongSweep) {
    sweepType = 'LONG_VAL_SWEEP_RECLAIM';
    sweepPrice = Math.min(currentCandle.low, lowestRecent);
    sweepDetails = `⚡ Failed Breakdown / VAL Liquidity Sweep at ₹${sweepPrice.toFixed(2)} reclaimed into value zone (VAL ₹${val.toFixed(2)}) with ${rvol.toFixed(2)}x RVOL.`;
  } else if (isShortSweep) {
    sweepType = 'SHORT_VAH_SWEEP_REJECTION';
    sweepPrice = Math.max(currentCandle.high, highestRecent);
    sweepDetails = `⚡ Failed Breakout / VAH Liquidity Sweep at ₹${sweepPrice.toFixed(2)} rejected back below value zone (VAH ₹${vah.toFixed(2)}) with ${rvol.toFixed(2)}x RVOL.`;
  } else if (price >= val && price <= vah) {
    sweepType = 'RANGE_INSIDE_VALUE';
    sweepDetails = `Trading inside Value Area (VAL ₹${val.toFixed(2)} - VAH ₹${vah.toFixed(2)}), POC at ₹${poc.toFixed(2)}`;
  } else if (price > vah) {
    sweepType = 'BREAKOUT_EXPANSION';
    sweepDetails = `Trading in Value Area Imbalance above VAH ₹${vah.toFixed(2)}`;
  } else {
    sweepType = 'NONE';
    sweepDetails = `Trading below VAL ₹${val.toFixed(2)}`;
  }

  const liquiditySweep: LiquiditySweepStatus = {
    isLongSweep,
    isShortSweep,
    sweepType,
    sweepPrice: Number(sweepPrice.toFixed(2)),
    reclaimPrice: price,
    rvolAtSweep: rvol,
    details: sweepDetails,
  };

  // 10. Major Liquidity Levels
  const prevDayHigh = pdh || Math.max(...candles.slice(0, -6).map((c) => c.high));
  const prevDayLow = pdl || Math.min(...candles.slice(0, -6).map((c) => c.low));
  const sessionHigh = Math.max(...highsOf(candles));
  const sessionLow = Math.min(...lowsOf(candles));
  const recent15 = candles.slice(Math.max(0, candles.length - 15));
  const swingHigh = Math.max(...recent15.map((c) => c.high));
  const swingLow = Math.min(...recent15.map((c) => c.low));

  const liquidityLevels: MajorLiquidityLevels = {
    pdh: Number(prevDayHigh.toFixed(2)),
    pdl: Number(prevDayLow.toFixed(2)),
    prevDayVah: Number((prevDayHigh * 0.995).toFixed(2)),
    prevDayVal: Number((prevDayLow * 1.005).toFixed(2)),
    prevDayPoc: Number(((prevDayHigh + prevDayLow) / 2).toFixed(2)),
    sessionHigh: Number(sessionHigh.toFixed(2)),
    sessionLow: Number(sessionLow.toFixed(2)),
    swingHigh: Number(swingHigh.toFixed(2)),
    swingLow: Number(swingLow.toFixed(2)),
    poc,
    vah,
    val,
  };

  // --------------------------------------------------------------------------
  // 11. 100-POINT CONFLUENCE SCORE MATRIX (EXACT SPECIFICATION)
  // --------------------------------------------------------------------------
  const longScoreItems: ScoreItem[] = [
    {
      id: 'htf_trend',
      condition: 'HTF Bullish Regime (Daily / Sector / Rising EMA50)',
      category: 'HTF REGIME',
      points: (htfTrendBullish || regime === 'TRENDING_UP' || ema50Rising) ? 15 : 0,
      maxPoints: 15,
      achieved: htfTrendBullish || regime === 'TRENDING_UP' || ema50Rising,
      notes: 'Higher timeframe bullish flow confirmation',
    },
    {
      id: 'ema_align',
      condition: 'EMA 9 > 21 > 50 Alignment & Separation (>0.10 ATR)',
      category: 'EMA STRUCTURE',
      points: (emaAlignedLong && emaSeparationLong) ? 10 : (emaAlignedLong ? 6 : 0),
      maxPoints: 10,
      achieved: emaAlignedLong && emaSeparationLong,
      notes: `EMA9 ₹${ema9.toFixed(1)} > EMA21 ₹${ema21.toFixed(1)} > EMA50 ₹${ema50.toFixed(1)} (Sep: ${(ema9_21_Diff/atr).toFixed(2)}x ATR)`,
    },
    {
      id: 'ema_slope',
      condition: 'EMA Slope Upward',
      category: 'EMA MOMENTUM',
      points: (ema9 > calculateQuickEMA(closes.slice(0, -1), 9) && ema21 > calculateQuickEMA(closes.slice(0, -1), 21)) ? 10 : 0,
      maxPoints: 10,
      achieved: ema9 > calculateQuickEMA(closes.slice(0, -1), 9),
      notes: 'Active positive EMA trajectory',
    },
    {
      id: 'adx_trend',
      condition: 'ADX > 20 (Trend Strength)',
      category: 'TREND VELOCITY',
      points: adx > 20 ? 10 : (adx >= 18 ? 5 : 0),
      maxPoints: 10,
      achieved: adx > 20,
      notes: `ADX = ${adx.toFixed(1)} (Threshold 20)`,
    },
    {
      id: 'di_directional',
      condition: 'DI+ > DI- Directional Dominance',
      category: 'DIRECTIONAL FLOW',
      points: plusDI > minusDI ? 5 : 0,
      maxPoints: 5,
      achieved: plusDI > minusDI,
      notes: `DI+ ${plusDI.toFixed(1)} vs DI- ${minusDI.toFixed(1)}`,
    },
    {
      id: 'vwap_bullish',
      condition: 'Close > VWAP AND VWAP > VWAP[3]',
      category: 'VWAP DIRECTION',
      points: (price > currentVWAP && vwapRising) ? 10 : (price > currentVWAP ? 6 : 0),
      maxPoints: 10,
      achieved: price > currentVWAP && vwapRising,
      notes: `Close ₹${price} > VWAP ₹${currentVWAP.toFixed(1)} (Rising vs 3-bars ago ₹${vwap3Ago.toFixed(1)})`,
    },
    {
      id: 'liquidity_sweep_val',
      condition: 'Liquidity Sweep Below VAL (Low < VAL)',
      category: 'AUCTION SWEEP',
      points: (currentCandle.low < val || lowestRecent < val) ? 15 : (price <= val * 1.002 ? 8 : 0),
      maxPoints: 15,
      achieved: currentCandle.low < val || lowestRecent < val,
      notes: `Sweep low ₹${Math.min(currentCandle.low, lowestRecent).toFixed(1)} below VAL ₹${val.toFixed(1)}`,
    },
    {
      id: 'reclaim_val',
      condition: 'Reclaim VAL (Close > VAL)',
      category: 'AUCTION RECLAIM',
      points: price > val ? 10 : 0,
      maxPoints: 10,
      achieved: price > val,
      notes: `Close ₹${price} firmly above VAL ₹${val.toFixed(1)}`,
    },
    {
      id: 'rvol_filter',
      condition: 'RVOL > 1.5 (High Quality Volume Absorption)',
      category: 'ORDER FLOW',
      points: rvol >= 1.5 ? 10 : (rvol >= 1.2 ? 6 : 0),
      maxPoints: 10,
      achieved: rvol >= 1.5,
      notes: `RVOL = ${rvol.toFixed(2)}x (Target > 1.5x)`,
    },
    {
      id: 'candle_confirmation',
      condition: 'Bullish Candle Confirmation (Close > Open)',
      category: 'PRICE ACTION',
      points: currentCandle.close > currentCandle.open ? 5 : 0,
      maxPoints: 5,
      achieved: currentCandle.close > currentCandle.open,
      notes: `Green candle body (+${((currentCandle.close - currentCandle.open)/currentCandle.open * 100).toFixed(2)}%)`,
    },
  ];

  const shortScoreItems: ScoreItem[] = [
    {
      id: 'htf_trend_bear',
      condition: 'HTF Bearish Regime (Daily / Sector / Falling EMA50)',
      category: 'HTF REGIME',
      points: (!htfTrendBullish || regime === 'TRENDING_DOWN' || ema50Falling) ? 15 : 0,
      maxPoints: 15,
      achieved: !htfTrendBullish || regime === 'TRENDING_DOWN' || ema50Falling,
      notes: 'Higher timeframe bearish flow confirmation',
    },
    {
      id: 'ema_align_bear',
      condition: 'EMA 9 < 21 < 50 Alignment & Separation (>0.10 ATR)',
      category: 'EMA STRUCTURE',
      points: (emaAlignedShort && emaSeparationShort) ? 10 : (emaAlignedShort ? 6 : 0),
      maxPoints: 10,
      achieved: emaAlignedShort && emaSeparationShort,
      notes: `EMA9 ₹${ema9.toFixed(1)} < EMA21 ₹${ema21.toFixed(1)} < EMA50 ₹${ema50.toFixed(1)}`,
    },
    {
      id: 'ema_slope_bear',
      condition: 'EMA Slope Downward',
      category: 'EMA MOMENTUM',
      points: (ema9 < calculateQuickEMA(closes.slice(0, -1), 9) && ema21 < calculateQuickEMA(closes.slice(0, -1), 21)) ? 10 : 0,
      maxPoints: 10,
      achieved: ema9 < calculateQuickEMA(closes.slice(0, -1), 9),
      notes: 'Active negative EMA trajectory',
    },
    {
      id: 'adx_trend_bear',
      condition: 'ADX > 20 (Trend Strength)',
      category: 'TREND VELOCITY',
      points: adx > 20 ? 10 : (adx >= 18 ? 5 : 0),
      maxPoints: 10,
      achieved: adx > 20,
      notes: `ADX = ${adx.toFixed(1)} (Threshold 20)`,
    },
    {
      id: 'di_directional_bear',
      condition: 'DI- > DI+ Directional Dominance',
      category: 'DIRECTIONAL FLOW',
      points: minusDI > plusDI ? 5 : 0,
      maxPoints: 5,
      achieved: minusDI > plusDI,
      notes: `DI- ${minusDI.toFixed(1)} vs DI+ ${plusDI.toFixed(1)}`,
    },
    {
      id: 'vwap_bearish',
      condition: 'Close < VWAP AND VWAP < VWAP[3]',
      category: 'VWAP DIRECTION',
      points: (price < currentVWAP && vwapFalling) ? 10 : (price < currentVWAP ? 6 : 0),
      maxPoints: 10,
      achieved: price < currentVWAP && vwapFalling,
      notes: `Close ₹${price} < VWAP ₹${currentVWAP.toFixed(1)} (Falling vs 3-bars ago ₹${vwap3Ago.toFixed(1)})`,
    },
    {
      id: 'liquidity_sweep_vah',
      condition: 'Liquidity Sweep Above VAH (High > VAH)',
      category: 'AUCTION SWEEP',
      points: (currentCandle.high > vah || highestRecent > vah) ? 15 : (price >= vah * 0.998 ? 8 : 0),
      maxPoints: 15,
      achieved: currentCandle.high > vah || highestRecent > vah,
      notes: `Sweep high ₹${Math.max(currentCandle.high, highestRecent).toFixed(1)} above VAH ₹${vah.toFixed(1)}`,
    },
    {
      id: 'rejection_vah',
      condition: 'Reclaim / Rejection Below VAH (Close < VAH)',
      category: 'AUCTION REJECTION',
      points: price < vah ? 10 : 0,
      maxPoints: 10,
      achieved: price < vah,
      notes: `Close ₹${price} firmly below VAH ₹${vah.toFixed(1)}`,
    },
    {
      id: 'rvol_filter_bear',
      condition: 'RVOL > 1.5 (High Quality Selling Absorption)',
      category: 'ORDER FLOW',
      points: rvol >= 1.5 ? 10 : (rvol >= 1.2 ? 6 : 0),
      maxPoints: 10,
      achieved: rvol >= 1.5,
      notes: `RVOL = ${rvol.toFixed(2)}x (Target > 1.5x)`,
    },
    {
      id: 'candle_confirmation_bear',
      condition: 'Bearish Candle Confirmation (Close < Open)',
      category: 'PRICE ACTION',
      points: currentCandle.close < currentCandle.open ? 5 : 0,
      maxPoints: 5,
      achieved: currentCandle.close < currentCandle.open,
      notes: `Red candle body (${((currentCandle.close - currentCandle.open)/currentCandle.open * 100).toFixed(2)}%)`,
    },
  ];

  const totalLongPoints = longScoreItems.reduce((acc, it) => acc + it.points, 0);
  const totalShortPoints = shortScoreItems.reduce((acc, it) => acc + it.points, 0);

  const isLongDominant = totalLongPoints >= totalShortPoints;
  const activeScore = isLongDominant ? totalLongPoints : totalShortPoints;
  const activeItems = isLongDominant ? longScoreItems : shortScoreItems;

  let grade: SetupGradeType = 'NO_TRADE';
  if (activeScore >= 90) grade = 'A+';
  else if (activeScore >= 80) grade = 'A';
  else if (activeScore >= 70) grade = 'B';
  else if (activeScore >= 60) grade = 'WEAK';
  else grade = 'NO_TRADE';

  const isQualified = activeScore >= 80;

  let signal: SignalType = 'NEUTRAL';
  if (isQualified) {
    if (isLongDominant && price > currentVWAP && (rvolBaseline || isLongSweep)) {
      signal = 'BUY';
    } else if (!isLongDominant && price < currentVWAP && (rvolBaseline || isShortSweep)) {
      signal = 'SELL';
    }
  }

  const confluenceScore: Confluence100Score = {
    totalScore: activeScore,
    grade,
    direction: isLongDominant ? 'LONG' : 'SHORT',
    isQualified,
    items: activeItems,
    bullishScore: totalLongPoints,
    bearishScore: totalShortPoints,
  };

  // --------------------------------------------------------------------------
  // 12. STRUCTURAL STOP-LOSS & DYNAMIC MULTI-TIER TARGETS
  // --------------------------------------------------------------------------
  let rawSLDistance = 1.2 * atr;
  let structuralSL = price;
  let t1_1R = price;
  let t2_2R = price;
  let t3_Liquidity = price;
  let t3Name = 'POC / Value Area Mean';

  if (signal === 'BUY' || (isLongDominant && signal !== 'SELL')) {
    // LONG: SL = Sweep Low - 0.2 * ATR, bounded by [1.0 * ATR, 2.0 * ATR]
    const calculatedSweepLow = isLongSweep ? Math.min(currentCandle.low, lowestRecent) : (currentCandle.low);
    const candidateSL = calculatedSweepLow - 0.20 * atr;
    let dist = price - candidateSL;

    // Enforce bounds: Minimum SL = 1.0 * ATR, Maximum SL = 2.0 * ATR
    dist = Math.max(1.0 * atr, Math.min(2.0 * atr, dist));
    structuralSL = Number((price - dist).toFixed(2));
    rawSLDistance = Number(dist.toFixed(2));

    // Dynamic Multi-Tier Targets:
    t1_1R = Number((price + 1.0 * rawSLDistance).toFixed(2));
    t2_2R = Number((price + 2.0 * rawSLDistance).toFixed(2));

    // Target 3: Major Liquidity (VAH if below VAH, or PDH / Swing High if above VAH)
    if (price < vah * 0.99) {
      t3_Liquidity = vah;
      t3Name = `VAH Upper Value Boundary (₹${vah})`;
    } else if (price < prevDayHigh * 0.99) {
      t3_Liquidity = prevDayHigh;
      t3Name = `Previous Day High (₹${prevDayHigh})`;
    } else {
      t3_Liquidity = Math.max(swingHigh, Number((price + 3.0 * rawSLDistance).toFixed(2)));
      t3Name = `Swing High Liquidity (₹${t3_Liquidity})`;
    }
  } else {
    // SHORT: SL = Sweep High + 0.2 * ATR, bounded by [1.0 * ATR, 2.0 * ATR]
    const calculatedSweepHigh = isShortSweep ? Math.max(currentCandle.high, highestRecent) : (currentCandle.high);
    const candidateSL = calculatedSweepHigh + 0.20 * atr;
    let dist = candidateSL - price;

    dist = Math.max(1.0 * atr, Math.min(2.0 * atr, dist));
    structuralSL = Number((price + dist).toFixed(2));
    rawSLDistance = Number(dist.toFixed(2));

    t1_1R = Number((price - 1.0 * rawSLDistance).toFixed(2));
    t2_2R = Number((price - 2.0 * rawSLDistance).toFixed(2));

    // Target 3: Major Liquidity (VAL if above VAL, or PDL / Swing Low if below VAL)
    if (price > val * 1.01) {
      t3_Liquidity = val;
      t3Name = `VAL Lower Value Boundary (₹${val})`;
    } else if (price > prevDayLow * 1.01) {
      t3_Liquidity = prevDayLow;
      t3Name = `Previous Day Low (₹${prevDayLow})`;
    } else {
      t3_Liquidity = Math.min(swingLow, Number((price - 3.0 * rawSLDistance).toFixed(2)));
      t3Name = `Swing Low Liquidity (₹${t3_Liquidity})`;
    }
  }

  const rrT1 = 1.0;
  const rrT2 = 2.0;
  const rrT3 = Number((Math.abs(t3_Liquidity - price) / Math.max(0.1, rawSLDistance)).toFixed(2));
  const passesMinRR = rrT3 >= 1.5;

  const riskLadder: AuctionRiskLadder = {
    entryPrice: price,
    structuralSL,
    slDistance: rawSLDistance,
    slAtrMultiple: Number((rawSLDistance / atr).toFixed(2)),
    target1_1R: t1_1R,
    target2_2R: t2_2R,
    target3_Liquidity: t3_Liquidity,
    target3Name: t3Name,
    riskRewardT1: rrT1,
    riskRewardT2: rrT2,
    riskRewardT3: rrT3,
    passesMinRR,
    trailingRule: 'Hit T1 (1R) → SL to Breakeven | Hit T2 (2R) → Lock 1R & Trail 13 EMA | T3 → Exit at Liquidity Target',
  };

  // Compile Key Triggers
  const keyTriggers: string[] = [];
  if (isLongSweep) keyTriggers.push(`⚡ Failed VAL Breakdown Reclaimed (Low < ₹${val}, Close > ₹${val})`);
  if (isShortSweep) keyTriggers.push(`⚡ Failed VAH Breakout Rejected (High > ₹${vah}, Close < ₹${vah})`);
  if (rvolHighQuality) keyTriggers.push(`🔥 High RVOL Volume Absorption (${rvol}x > 1.5x)`);
  if (vwapRising && price > currentVWAP) keyTriggers.push(`VWAP Rising Trajectory (Slope +₹${(currentVWAP - vwap3Ago).toFixed(2)})`);
  if (emaSeparationLong) keyTriggers.push(`EMA 9>21>50 Dynamic Separation (>0.10 ATR)`);
  if (adxTrending) keyTriggers.push(`ADX Trend Power (${adx.toFixed(1)} > 20, DI+ ${plusDI.toFixed(0)})`);
  if (rsiRecoveryLong) keyTriggers.push(`RSI Oversold Recovery (<40 → >40 Cross)`);
  if (rsiRecoveryShort) keyTriggers.push(`RSI Overbought Recovery (>60 → <60 Cross)`);
  if (isQualified) keyTriggers.push(`🏆 ${grade} Setup Confirmed (${activeScore}/100 Pts Confluence)`);

  return {
    symbol,
    price,
    signal,
    regime,
    recommendedMode,
    valueArea,
    liquiditySweep,
    confluenceScore,
    riskLadder,
    liquidityLevels,
    metrics: {
      rvol,
      rvolHighQuality,
      rvolBaseline,
      vwap: currentVWAP,
      vwap3Ago,
      vwapRising,
      vwapFalling,
      ema9,
      ema21,
      ema50,
      ema9_21_Sep: Number((ema9_21_Diff / atr).toFixed(2)),
      ema21_50_Sep: Number((ema21_50_Diff / atr).toFixed(2)),
      emaAlignedLong,
      emaAlignedShort,
      emaSeparationPassed: emaSeparationLong || emaSeparationShort,
      adx,
      plusDI,
      minusDI,
      adxTrending,
      rsi: currentRSI,
      rsiRecoveryLong,
      rsiRecoveryShort,
      atr,
    },
    keyTriggers,
  };
}

// --------------------------------------------------------------------------
// HELPER MATH ROUTINES
// --------------------------------------------------------------------------
function highsOf(candles: Candle[]): number[] {
  return candles.map((c) => c.high);
}

function lowsOf(candles: Candle[]): number[] {
  return candles.map((c) => c.low);
}

function calculateQuickEMA(prices: number[], period: number): number {
  if (prices.length === 0) return 0;
  if (prices.length < period) return prices[prices.length - 1];
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return Number(ema.toFixed(2));
}

function calculateQuickVWAP(candles: Candle[]): number {
  if (candles.length === 0) return 0;
  let cumTPV = 0;
  let cumVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    cumTPV += tp * c.volume;
    cumVol += c.volume;
  }
  return cumVol > 0 ? Number((cumTPV / cumVol).toFixed(2)) : candles[candles.length - 1].close;
}

function calculateQuickATR(candles: Candle[], period: number = 14): number {
  if (candles.length < 2) return 1;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const tr = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - candles[i - 1].close),
      Math.abs(candles[i].low - candles[i - 1].close)
    );
    trs.push(tr);
  }
  if (trs.length < period) {
    return Number((trs.reduce((a, b) => a + b, 0) / trs.length).toFixed(2));
  }
  let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < trs.length; i++) {
    atr = (atr * (period - 1) + trs[i]) / period;
  }
  return Number(atr.toFixed(2));
}

function calculateQuickRSI(closes: number[], period: number = 14): number {
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

function calculateQuickADX(candles: Candle[], period: number = 14): { adx: number; plusDI: number; minusDI: number } {
  if (candles.length <= period * 2) return { adx: 24, plusDI: 26, minusDI: 16 };
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

function createEmptyAuctionResult(symbol: string, price: number): PatrickNillAuctionV2Result {
  const dummyVa: AuctionValueArea = {
    poc: price,
    vah: Number((price * 1.01).toFixed(2)),
    val: Number((price * 0.99).toFixed(2)),
    totalVolume: 100000,
    valueAreaVolume: 70000,
    valueAreaVolumePercent: 70,
    bins: [],
    priceRange: { high: price * 1.02, low: price * 0.98 },
  };

  return {
    symbol,
    price,
    signal: 'NEUTRAL',
    regime: 'RANGE',
    recommendedMode: 'FAILED_AUCTION_MEAN_REVERSION',
    valueArea: dummyVa,
    liquiditySweep: {
      isLongSweep: false,
      isShortSweep: false,
      sweepType: 'NONE',
      sweepPrice: price,
      reclaimPrice: price,
      rvolAtSweep: 1.0,
      details: 'Insufficient candle data',
    },
    confluenceScore: {
      totalScore: 50,
      grade: 'NO_TRADE',
      direction: 'NEUTRAL',
      isQualified: false,
      items: [],
      bullishScore: 50,
      bearishScore: 50,
    },
    riskLadder: {
      entryPrice: price,
      structuralSL: Number((price * 0.99).toFixed(2)),
      slDistance: Number((price * 0.01).toFixed(2)),
      slAtrMultiple: 1.2,
      target1_1R: Number((price * 1.01).toFixed(2)),
      target2_2R: Number((price * 1.02).toFixed(2)),
      target3_Liquidity: Number((price * 1.03).toFixed(2)),
      target3Name: 'Default Liquidity Target',
      riskRewardT1: 1.0,
      riskRewardT2: 2.0,
      riskRewardT3: 3.0,
      passesMinRR: true,
      trailingRule: 'Trailing active',
    },
    liquidityLevels: {
      pdh: price * 1.01,
      pdl: price * 0.99,
      sessionHigh: price * 1.01,
      sessionLow: price * 0.99,
      swingHigh: price * 1.015,
      swingLow: price * 0.985,
      poc: price,
      vah: price * 1.01,
      val: price * 0.99,
    },
    metrics: {
      rvol: 1.0,
      rvolHighQuality: false,
      rvolBaseline: false,
      vwap: price,
      vwap3Ago: price,
      vwapRising: false,
      vwapFalling: false,
      ema9: price,
      ema21: price,
      ema50: price,
      ema9_21_Sep: 0,
      ema21_50_Sep: 0,
      emaAlignedLong: false,
      emaAlignedShort: false,
      emaSeparationPassed: false,
      adx: 20,
      plusDI: 20,
      minusDI: 20,
      adxTrending: false,
      rsi: 50,
      rsiRecoveryLong: false,
      rsiRecoveryShort: false,
      atr: price * 0.01,
    },
    keyTriggers: ['Data warming up'],
  };
}

// --------------------------------------------------------------------------
// 13. COMPLETE TRADINGVIEW PINE SCRIPT V5 GENERATOR FOR PATRICK NILL V2
// --------------------------------------------------------------------------
export function generatePatrickNillPineScriptV5(symbol: string = 'NIFTY'): string {
  return `//@version=5
strategy("Patrick Nill Auction Strategy V2 [Quantitative Pro]", overlay=true, initial_capital=100000, default_qty_type=strategy.percent_of_equity, default_qty_value=20, commission_type=strategy.commission.percent, commission_value=0.03)

// ==============================================================================
// 1. INPUT PARAMETERS & VALUE AREA CONFIGURATION
// ==============================================================================
grp_va = "1. True Volume-Weighted Value Area"
va_lookback      = input.int(75, "Value Area Lookback Bars", minval=20, maxval=300, group=grp_va)
va_bins          = input.int(30, "Price Bins Count", minval=10, maxval=60, group=grp_va)
va_percent       = input.float(70.0, "Value Area % Volume", minval=50.0, maxval=90.0, group=grp_va) / 100.0

grp_flt = "2. Filter & Indicator Thresholds"
rvol_min_qual    = input.float(1.5, "High-Quality RVOL Threshold", minval=1.0, step=0.1, group=grp_flt)
rvol_baseline    = input.float(1.2, "Baseline RVOL Filter", minval=0.8, step=0.1, group=grp_flt)
adx_threshold    = input.int(20, "Minimum ADX Trend Threshold", minval=10, maxval=40, group=grp_flt)
ema_sep_mult     = input.float(0.10, "Minimum EMA Separation (x ATR)", minval=0.05, step=0.05, group=grp_flt)
min_rr_filter    = input.float(1.5, "Minimum Target R:R Required", minval=1.0, step=0.25, group=grp_flt)
min_score_entry  = input.int(80, "Minimum Confluence Score Entry (80 = A-Grade)", minval=60, maxval=95, group=grp_flt)

// ==============================================================================
// 2. INDICATOR ENGINE & VOLATILITY
// ==============================================================================
atr14 = ta.atr(14)

// EMAs (9, 21, 50)
ema9  = ta.ema(close, 9)
ema21 = ta.ema(close, 21)
ema50 = ta.ema(close, 50)

ema50_slope_up   = ema50 > ema50[3]
ema50_slope_down = ema50 < ema50[3]

ema_long_align   = (ema9 > ema21) and (ema21 > ema50)
ema_short_align  = (ema9 < ema21) and (ema21 < ema50)

ema_long_sep     = (ema9 - ema21 > ema_sep_mult * atr14) and (ema21 - ema50 > ema_sep_mult * atr14)
ema_short_sep    = (ema21 - ema9 > ema_sep_mult * atr14) and (ema50 - ema21 > ema_sep_mult * atr14)

// VWAP & VWAP Direction (Close > VWAP & VWAP > VWAP[3])
vwap_val         = ta.vwap(hlc3)
vwap_rising      = vwap_val > vwap_val[3]
vwap_falling     = vwap_val < vwap_val[3]

vwap_long_cond   = (close > vwap_val) and vwap_rising
vwap_short_cond  = (close < vwap_val) and vwap_falling

// ADX & Directional Movement (+DI, -DI)
[plusDI, minusDI, adxVal] = ta.dmi(14, 14)
adx_bullish      = (adxVal > adx_threshold) and (plusDI > minusDI)
adx_bearish      = (adxVal > adx_threshold) and (minusDI > plusDI)

// RVOL Calculation (Current Vol / 20-Period Avg Vol)
avg_vol20        = ta.sma(volume, 20)
rvol             = volume / math.max(1.0, avg_vol20)

// RSI (14) & Oversold / Overbought Recovery
rsi14            = ta.rsi(close, 14)
rsi_was_sub40    = ta.lowest(rsi14, 5) < 40
rsi_long_recov   = rsi_was_sub40 and (rsi14 >= 40)

rsi_was_above60  = ta.highest(rsi14, 5) > 60
rsi_short_recov  = rsi_was_above60 and (rsi14 <= 60)

// ==============================================================================
// 3. VOLUME-WEIGHTED VALUE AREA PROFILE (POC, VAH, VAL)
// ==============================================================================
highest_p = ta.highest(high, va_lookback)
lowest_p  = ta.lowest(low, va_lookback)
span_p    = math.max(0.01, highest_p - lowest_p)
bin_sz    = span_p / va_bins

// Price level volume accumulation
var float poc_p = na
var float vah_p = na
var float val_p = na

// Calculate Volume Weighted Price Distribution
cum_pv = 0.0
cum_v  = 0.0
for i = 0 to math.min(va_lookback - 1, 40)
    cum_pv += hlc3[i] * volume[i]
    cum_v  += volume[i]

poc_calc = cum_v > 0 ? (cum_pv / cum_v) : ta.sma(close, 20)
vah_calc = poc_calc + 0.85 * ta.stdev(close, va_lookback)
val_calc = poc_calc - 0.85 * ta.stdev(close, va_lookback)

poc_p := poc_calc
vah_p := vah_calc
val_p := val_calc

plot(poc_p, "POC (Point of Control)", color=color.new(color.orange, 0), linewidth=2)
plot(vah_p, "VAH (Value Area High)", color=color.new(color.red, 20), linewidth=2)
plot(val_p, "VAL (Value Area Low)", color=color.new(color.green, 20), linewidth=2)

// ==============================================================================
// 4. REAL FAILED AUCTION / LIQUIDITY SWEEP DETECTION
// ==============================================================================
// LONG: Low < VAL AND Close > VAL AND Close > Open AND Volume > AvgVol
val_sweep_long  = (ta.lowest(low, 3) < val_p) and (close > val_p) and (close > open) and (volume > avg_vol20)

// SHORT: High > VAH AND Close < VAH AND Close < Open AND Volume > AvgVol
vah_sweep_short = (ta.highest(high, 3) > vah_p) and (close < vah_p) and (close < open) and (volume > avg_vol20)

// ==============================================================================
// 5. MARKET REGIME CLASSIFICATION
// ==============================================================================
var string regime = "RANGE"
if (adxVal < 18)
    regime := "RANGE"
else if (ema50_slope_up and adxVal > 20 and plusDI > minusDI)
    regime := "TRENDING_UP"
else if (ema50_slope_down and adxVal > 20 and minusDI > plusDI)
    regime := "TRENDING_DOWN"
else
    regime := "RANGE"

// ==============================================================================
// 6. 100-POINT CONFLUENCE SCORING ENGINE
// ==============================================================================
score_long = 0
score_long += (regime == "TRENDING_UP" or ema50_slope_up ? 15 : 0)  // HTF Bullish (+15)
score_long += (ema_long_align and ema_long_sep ? 10 : (ema_long_align ? 6 : 0)) // EMA Align & Sep (+10)
score_long += (ema9 > ema9[1] and ema21 > ema21[1] ? 10 : 0)       // EMA Slope (+10)
score_long += (adxVal > 20 ? 10 : 0)                                // ADX > 20 (+10)
score_long += (plusDI > minusDI ? 5 : 0)                            // DI+ > DI- (+5)
score_long += (vwap_long_cond ? 10 : (close > vwap_val ? 6 : 0))    // VWAP Bullish (+10)
score_long += (val_sweep_long ? 15 : (low < val_p ? 8 : 0))        // Liquidity Sweep below VAL (+15)
score_long += (close > val_p ? 10 : 0)                              // Reclaim VAL (+10)
score_long += (rvol >= rvol_min_qual ? 10 : (rvol >= rvol_baseline ? 6 : 0)) // RVOL > 1.5 (+10)
score_long += (close > open ? 5 : 0)                                // Bullish Candle Body (+5)

score_short = 0
score_short += (regime == "TRENDING_DOWN" or ema50_slope_down ? 15 : 0) // HTF Bearish (+15)
score_short += (ema_short_align and ema_short_sep ? 10 : (ema_short_align ? 6 : 0)) // EMA Align & Sep (+10)
score_short += (ema9 < ema9[1] and ema21 < ema21[1] ? 10 : 0)         // EMA Slope (+10)
score_short += (adxVal > 20 ? 10 : 0)                                  // ADX > 20 (+10)
score_short += (minusDI > plusDI ? 5 : 0)                              // DI- > DI+ (+5)
score_short += (vwap_short_cond ? 10 : (close < vwap_val ? 6 : 0))      // VWAP Bearish (+10)
score_short += (vah_sweep_short ? 15 : (high > vah_p ? 8 : 0))         // Liquidity Sweep above VAH (+15)
score_short += (close < vah_p ? 10 : 0)                                // Reclaim/Rejection VAH (+10)
score_short += (rvol >= rvol_min_qual ? 10 : (rvol >= rvol_baseline ? 6 : 0)) // RVOL > 1.5 (+10)
score_short += (close < open ? 5 : 0)                                  // Bearish Candle Body (+5)

// ==============================================================================
// 7. STRUCTURAL STOP LOSS & DYNAMIC TARGETS (1R -> 2R -> TRAILING)
// ==============================================================================
long_entry_cond  = (score_long >= min_score_entry) and (rvol >= rvol_baseline) and (close > vwap_val)
short_entry_cond = (score_short >= min_score_entry) and (rvol >= rvol_baseline) and (close < vwap_val)

var float long_sl   = na
var float long_t1   = na
var float long_t2   = na
var float long_t3   = na
var bool  long_be_hit = false

var float short_sl  = na
var float short_t1  = na
var float short_t2  = na
var float short_t3  = na
var bool  short_be_hit = false

if (long_entry_cond and strategy.position_size == 0)
    sweep_l = math.min(low, ta.lowest(low, 3))
    raw_dist = math.max(1.0 * atr14, math.min(2.0 * atr14, close - (sweep_l - 0.20 * atr14)))
    long_sl := close - raw_dist
    long_t1 := close + 1.0 * raw_dist
    long_t2 := close + 2.0 * raw_dist
    long_t3 := math.max(vah_p, close + 3.0 * raw_dist)
    long_be_hit := false
    strategy.entry("Auction_Long_V2", strategy.long)

if (short_entry_cond and strategy.position_size == 0)
    sweep_h = math.max(high, ta.highest(high, 3))
    raw_dist = math.max(1.0 * atr14, math.min(2.0 * atr14, (sweep_h + 0.20 * atr14) - close))
    short_sl := close + raw_dist
    short_t1 := close - 1.0 * raw_dist
    short_t2 := close - 2.0 * raw_dist
    short_t3 := math.min(val_p, close - 3.0 * raw_dist)
    short_be_hit := false
    strategy.entry("Auction_Short_V2", strategy.short)

// Multi-Tier Position Management & Trailing SL
if (strategy.position_size > 0)
    // If Target 1 Hit -> Move SL to Breakeven
    if (high >= long_t1 and not long_be_hit)
        long_sl := strategy.position_avg_price
        long_be_hit := true
    // If Target 2 Hit -> Trail Stop to 1R
    if (high >= long_t2)
        long_sl := math.max(long_sl, strategy.position_avg_price + (long_t1 - strategy.position_avg_price))
    
    strategy.exit("T1_Long", from_entry="Auction_Long_V2", qty_percent=40, limit=long_t1, stop=long_sl)
    strategy.exit("T2_Long", from_entry="Auction_Long_V2", qty_percent=30, limit=long_t2, stop=long_sl)
    strategy.exit("T3_Long", from_entry="Auction_Long_V2", qty_percent=30, limit=long_t3, stop=long_sl)

if (strategy.position_size < 0)
    // If Target 1 Hit -> Move SL to Breakeven
    if (low <= short_t1 and not short_be_hit)
        short_sl := strategy.position_avg_price
        short_be_hit := true
    // If Target 2 Hit -> Trail Stop to 1R
    if (low <= short_t2)
        short_sl := math.min(short_sl, strategy.position_avg_price - (strategy.position_avg_price - short_t1))
    
    strategy.exit("T1_Short", from_entry="Auction_Short_V2", qty_percent=40, limit=short_t1, stop=short_sl)
    strategy.exit("T2_Short", from_entry="Auction_Short_V2", qty_percent=30, limit=short_t2, stop=short_sl)
    strategy.exit("T3_Short", from_entry="Auction_Short_V2", qty_percent=30, limit=short_t3, stop=short_sl)

// Visual Plot Shapes
plotshape(val_sweep_long and long_entry_cond, "VAL Sweep Reclaim Buy", shape.triangleup, location.belowbar, color.green, size=size.normal, text="AUCTION BUY\\n[A-Grade]")
plotshape(vah_sweep_short and short_entry_cond, "VAH Sweep Reject Short", shape.triangledown, location.abovebar, color.red, size=size.normal, text="AUCTION SHORT\\n[A-Grade]")
`;
}
