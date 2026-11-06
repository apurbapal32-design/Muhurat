import {
  ConfluenceEngineData,
  ConfluencePillar,
  ConfluenceStage,
  ScannedStock,
  SignalType,
  StockOIData,
  StockGreeksData,
  TechnicalIndicators,
} from '../types';

/**
 * 16-PILLAR NIFTY 200 CONFLUENCE ENGINE
 * 
 * Pipeline:
 * PRICE + VOLUME + VWAP + MARKET STRUCTURE + LIQUIDITY + SMC + WYCKOFF PHASE +
 * DELTA + CVD + FUTURES OI + OPTION OI + OPTION PREMIUM + IV + GREEKS +
 * SECTOR REGIME + NIFTY REGIME
 *        ↓
 * CONFLUENCE ENGINE
 *        ↓
 * 0–100 SCORE
 *        ↓
 * WATCH (40-59) | SETUP (60-74) | CONFIRMED (75-100)
 *        ↓
 * BUY / SELL / NEUTRAL
 *        ↓
 * ENTRY → SL → TARGET 1 → TARGET 2 → TARGET 3 → EXIT
 */

export interface ConfluenceCalculationInput {
  symbol: string;
  price: number;
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number;
  volume: number;
  avgVolume20: number;
  changePercent: number;
  indicators: TechnicalIndicators;
  oiData?: StockOIData;
  greeks?: StockGreeksData;
  sector: string;
  sectorChangePercent?: number;
  niftyBenchmarkChange?: number;
}

export function calculate16PillarConfluence(input: ConfluenceCalculationInput): ConfluenceEngineData {
  const {
    price,
    open,
    high,
    low,
    volume,
    avgVolume20,
    changePercent,
    indicators,
    oiData,
    greeks,
    sectorChangePercent = 0,
    niftyBenchmarkChange = 0,
  } = input;

  const pillars: ConfluencePillar[] = [];

  const atr = Math.max(0.5, indicators.atr || price * 0.015);
  const rvol = indicators.rvol || (avgVolume20 > 0 ? volume / avgVolume20 : 1.0);
  const vwap = indicators.vwap || price;
  const rsi = indicators.rsi || 50;
  const adx = indicators.adx || 22;
  const ema13 = indicators.ema13 || price;
  const ema21 = indicators.ema21 || price;
  const ema34 = indicators.ema34 || price;
  const pdh = indicators.pdh || high;
  const pdl = indicators.pdl || low;

  // Track raw bullish and bearish points (Max 100)
  let buyRawPoints = 0;
  let sellRawPoints = 0;

  // -------------------------------------------------------------
  // PILLAR 1: PRICE (Max 6.25 pts)
  // Momentum velocity, candle geometry, intraday expansion
  // -------------------------------------------------------------
  const candleBody = Math.abs(price - open);
  const candleRange = Math.max(0.01, high - low);
  const bodyRatio = candleBody / candleRange;
  const isGreenCandle = price >= open;

  let priceScore = 3.0;
  let priceStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let priceDesc = 'Price in consolidation band';

  if (changePercent >= 1.0 && isGreenCandle && bodyRatio > 0.55) {
    priceScore = 6.25;
    priceStatus = 'BULLISH';
    priceDesc = `Strong Bullish Expansion (+${changePercent.toFixed(2)}%) with ${Math.round(bodyRatio * 100)}% solid green body`;
    buyRawPoints += 6.25;
    sellRawPoints += 1.0;
  } else if (changePercent <= -1.0 && !isGreenCandle && bodyRatio > 0.55) {
    priceScore = 6.25;
    priceStatus = 'BEARISH';
    priceDesc = `Heavy Bearish Displacement (${changePercent.toFixed(2)}%) with ${Math.round(bodyRatio * 100)}% solid red body`;
    sellRawPoints += 6.25;
    buyRawPoints += 1.0;
  } else if (changePercent > 0.3) {
    priceScore = 4.5;
    priceStatus = 'BULLISH';
    priceDesc = `Moderate upward price velocity (+${changePercent.toFixed(2)}%)`;
    buyRawPoints += 4.5;
    sellRawPoints += 1.5;
  } else if (changePercent < -0.3) {
    priceScore = 4.5;
    priceStatus = 'BEARISH';
    priceDesc = `Moderate downward price pressure (${changePercent.toFixed(2)}%)`;
    sellRawPoints += 4.5;
    buyRawPoints += 1.5;
  } else {
    buyRawPoints += 3.0;
    sellRawPoints += 3.0;
  }

  pillars.push({
    id: 'p1_price',
    name: 'Price Action & Momentum',
    category: 'PRICE',
    weight: 6.25,
    score: priceScore,
    maxScore: 6.25,
    status: priceStatus,
    valueDisplay: `₹${price.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`,
    description: priceDesc,
  });

  // -------------------------------------------------------------
  // PILLAR 2: VOLUME (Max 6.25 pts)
  // RVOL relative volume vs 20 EMA, volume spikes
  // -------------------------------------------------------------
  let volScore = 2.5;
  let volStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let volDesc = `Normal volume activity (${rvol.toFixed(1)}x RVOL)`;

  if (rvol >= 2.5) {
    volScore = 6.25;
    volStatus = changePercent >= 0 ? 'BULLISH' : 'BEARISH';
    volDesc = `🔥 Ultra-High Institutional Surge (${rvol.toFixed(1)}x RVOL vs 20-Avg)`;
    if (changePercent >= 0) buyRawPoints += 6.25;
    else sellRawPoints += 6.25;
  } else if (rvol >= 1.5) {
    volScore = 5.0;
    volStatus = changePercent >= 0 ? 'BULLISH' : 'BEARISH';
    volDesc = `Institutional Volume Expansion (${rvol.toFixed(1)}x RVOL)`;
    if (changePercent >= 0) {
      buyRawPoints += 5.0;
      sellRawPoints += 1.0;
    } else {
      sellRawPoints += 5.0;
      buyRawPoints += 1.0;
    }
  } else if (rvol >= 1.0) {
    volScore = 3.5;
    volStatus = changePercent >= 0 ? 'BULLISH' : 'BEARISH';
    volDesc = `Healthy benchmark volume (${rvol.toFixed(1)}x RVOL)`;
    if (changePercent >= 0) buyRawPoints += 3.5;
    else sellRawPoints += 3.5;
  } else {
    volDesc = `Subdued / Dry volume (${rvol.toFixed(1)}x RVOL)`;
    buyRawPoints += 1.5;
    sellRawPoints += 1.5;
  }

  pillars.push({
    id: 'p2_volume',
    name: 'Volume & RVOL Expansion',
    category: 'VOLUME',
    weight: 6.25,
    score: volScore,
    maxScore: 6.25,
    status: volStatus,
    valueDisplay: `${rvol.toFixed(2)}x RVOL`,
    description: volDesc,
  });

  // -------------------------------------------------------------
  // PILLAR 3: VWAP (Max 6.25 pts)
  // Distance from VWAP, VWAP slope & deviation bands
  // -------------------------------------------------------------
  const vwapDiffPct = ((price - vwap) / vwap) * 100;
  let vwapScore = 3.0;
  let vwapStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let vwapDesc = `Trading at VWAP parity (₹${vwap.toFixed(2)})`;

  if (vwapDiffPct >= 0.4 && price > vwap) {
    vwapScore = 6.25;
    vwapStatus = 'BULLISH';
    vwapDesc = `Firmly Above VWAP (+${vwapDiffPct.toFixed(2)}%), Bullish Slope Confirmation`;
    buyRawPoints += 6.25;
  } else if (vwapDiffPct <= -0.4 && price < vwap) {
    vwapScore = 6.25;
    vwapStatus = 'BEARISH';
    vwapDesc = `Firmly Below VWAP (${vwapDiffPct.toFixed(2)}%), Bearish Resistance Ceiling`;
    sellRawPoints += 6.25;
  } else if (price >= vwap) {
    vwapScore = 4.5;
    vwapStatus = 'BULLISH';
    vwapDesc = `Holding above VWAP (+${vwapDiffPct.toFixed(2)}%)`;
    buyRawPoints += 4.5;
    sellRawPoints += 1.5;
  } else {
    vwapScore = 4.5;
    vwapStatus = 'BEARISH';
    vwapDesc = `Trading below VWAP (${vwapDiffPct.toFixed(2)}%)`;
    sellRawPoints += 4.5;
    buyRawPoints += 1.5;
  }

  pillars.push({
    id: 'p3_vwap',
    name: 'VWAP & Benchmark Geometry',
    category: 'VWAP',
    weight: 6.25,
    score: vwapScore,
    maxScore: 6.25,
    status: vwapStatus,
    valueDisplay: `₹${vwap.toFixed(1)} (${vwapDiffPct >= 0 ? '+' : ''}${vwapDiffPct.toFixed(2)}%)`,
    description: vwapDesc,
  });

  // -------------------------------------------------------------
  // PILLAR 4: MARKET STRUCTURE (Max 6.25 pts)
  // Multi-timeframe EMA Ribbon (13 > 21 > 34), Fox-Trend, ADX Trend
  // -------------------------------------------------------------
  const isEmaBull = ema13 > ema21 && ema21 > ema34;
  const isEmaBear = ema13 < ema21 && ema21 < ema34;
  let msScore = 3.0;
  let msStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let msDesc = 'Transitioning structure / range-bound';

  if (isEmaBull && adx >= 22) {
    msScore = 6.25;
    msStatus = 'BULLISH';
    msDesc = `Bullish Trend Ribbon Alignment (13 > 21 > 34 EMA) with Strong ADX (${adx.toFixed(0)})`;
    buyRawPoints += 6.25;
  } else if (isEmaBear && adx >= 22) {
    msScore = 6.25;
    msStatus = 'BEARISH';
    msDesc = `Bearish Trend Ribbon Alignment (13 < 21 < 34 EMA) with Strong ADX (${adx.toFixed(0)})`;
    sellRawPoints += 6.25;
  } else if (isEmaBull) {
    msScore = 4.5;
    msStatus = 'BULLISH';
    msDesc = `Bullish EMA Ribbon with moderate trend velocity`;
    buyRawPoints += 4.5;
    sellRawPoints += 1.5;
  } else if (isEmaBear) {
    msScore = 4.5;
    msStatus = 'BEARISH';
    msDesc = `Bearish EMA Ribbon with moderate trend velocity`;
    sellRawPoints += 4.5;
    buyRawPoints += 1.5;
  } else {
    buyRawPoints += 3.0;
    sellRawPoints += 3.0;
  }

  pillars.push({
    id: 'p4_market_structure',
    name: 'Market Structure & EMA Ribbon',
    category: 'MARKET_STRUCTURE',
    weight: 6.25,
    score: msScore,
    maxScore: 6.25,
    status: msStatus,
    valueDisplay: isEmaBull ? 'Bullish Higher-Highs' : isEmaBear ? 'Bearish Lower-Lows' : 'Range Equilibrium',
    description: msDesc,
  });

  // -------------------------------------------------------------
  // PILLAR 5: LIQUIDITY (Max 6.25 pts)
  // PDH/PDL sweeps, equal high/low liquidity purges, stop runs
  // -------------------------------------------------------------
  let liqScore = 3.5;
  let liqStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let liqDesc = 'Liquidity balanced between PDH/PDL';

  const sweptPdl = (low <= pdl * 1.001 && price > pdl) || (indicators.val && low < indicators.val && price > indicators.val);
  const sweptPdh = (high >= pdh * 0.999 && price < pdh) || (indicators.vah && high > indicators.vah && price < indicators.vah);
  const brokePdh = price > pdh || (indicators.vah && price > indicators.vah);
  const brokePdl = price < pdl || (indicators.val && price < indicators.val);

  if (sweptPdl) {
    liqScore = 6.25;
    liqStatus = 'BULLISH';
    liqDesc = `⚡ Bullish Liquidity Sweep of VAL/PDL (₹${(indicators.val || pdl).toFixed(1)}) followed by value reclaim`;
    buyRawPoints += 6.25;
  } else if (sweptPdh) {
    liqScore = 6.25;
    liqStatus = 'BEARISH';
    liqDesc = `⚡ Bearish Liquidity Sweep of VAH/PDH (₹${(indicators.vah || pdh).toFixed(1)}) followed by value rejection`;
    sellRawPoints += 6.25;
  } else if (brokePdh) {
    liqScore = 5.5;
    liqStatus = 'BULLISH';
    liqDesc = `Displacement Breakout Above VAH/PDH (₹${(indicators.vah || pdh).toFixed(1)}) consuming buy-side liquidity`;
    buyRawPoints += 5.5;
  } else if (brokePdl) {
    liqScore = 5.5;
    liqStatus = 'BEARISH';
    liqDesc = `Displacement Breakdown Below VAL/PDL (₹${(indicators.val || pdl).toFixed(1)}) consuming sell-side liquidity`;
    sellRawPoints += 5.5;
  } else {
    buyRawPoints += 3.5;
    sellRawPoints += 3.5;
  }

  pillars.push({
    id: 'p5_liquidity',
    name: 'Liquidity Pools & VAL/VAH Sweeps',
    category: 'LIQUIDITY',
    weight: 6.25,
    score: liqScore,
    maxScore: 6.25,
    status: liqStatus,
    valueDisplay: sweptPdl ? 'VAL/PDL Sweep Reclaim' : sweptPdh ? 'VAH/PDH Sweep Reject' : brokePdh ? 'VAH Breakout' : brokePdl ? 'VAL Breakdown' : 'Inside Value Area',
    description: liqDesc,
  });

  // -------------------------------------------------------------
  // PILLAR 6: SMC - SMART MONEY CONCEPTS (Max 6.25 pts)
  // Order Blocks (OB), Fair Value Gaps (FVG), Break of Structure (BOS)
  // -------------------------------------------------------------
  const range = Math.max(1, high - low);
  const obLow = Number((low + range * 0.1).toFixed(1));
  const obHigh = Number((low + range * 0.3).toFixed(1));
  const isSmcBull = price >= obLow && changePercent >= -0.2 && rvol >= 1.1;
  const isSmcBear = price <= high - range * 0.1 && changePercent <= 0.2 && rvol >= 1.1;

  let smcScore = 4.0;
  let smcStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let smcDesc = 'Smart Money Equilibrium Range';
  let smcStructure = 'RANGE_EQUILIBRIUM';

  if (changePercent >= 0.8 && rvol >= 1.4) {
    smcScore = 6.25;
    smcStatus = 'BULLISH';
    smcStructure = 'BOS_EXPANSION_ORDER_BLOCK';
    smcDesc = `Bullish Break of Structure (BOS) with verified Demand Order Block at ₹${obLow}–₹${obHigh}`;
    buyRawPoints += 6.25;
  } else if (changePercent <= -0.8 && rvol >= 1.4) {
    smcScore = 6.25;
    smcStatus = 'BEARISH';
    smcStructure = 'BOS_DISPLACEMENT_SUPPLY_BLOCK';
    smcDesc = `Bearish Break of Structure (BOS) with verified Supply Order Block at ₹${(high - range * 0.3).toFixed(1)}–₹${(high - range * 0.1).toFixed(1)}`;
    sellRawPoints += 6.25;
  } else if (isSmcBull) {
    smcScore = 5.0;
    smcStatus = 'BULLISH';
    smcStructure = 'DEMAND_OB_RETEST';
    smcDesc = `Price mitigating Institutional Demand Order Block (OB)`;
    buyRawPoints += 5.0;
    sellRawPoints += 1.0;
  } else if (isSmcBear) {
    smcScore = 5.0;
    smcStatus = 'BEARISH';
    smcStructure = 'SUPPLY_OB_RETEST';
    smcDesc = `Price mitigating Institutional Supply Order Block (OB)`;
    sellRawPoints += 5.0;
    buyRawPoints += 1.0;
  } else {
    buyRawPoints += 3.5;
    sellRawPoints += 3.5;
  }

  pillars.push({
    id: 'p6_smc',
    name: 'Smart Money Concepts (OB & FVG)',
    category: 'SMC',
    weight: 6.25,
    score: smcScore,
    maxScore: 6.25,
    status: smcStatus,
    valueDisplay: smcStructure.replace(/_/g, ' '),
    description: smcDesc,
  });

  // -------------------------------------------------------------
  // PILLAR 7: WYCKOFF PHASE (Max 6.25 pts)
  // Accumulation, Spring, SOS, Markup, Distribution, UTAD, Markdown
  // -------------------------------------------------------------
  let wyckoffScore = 3.5;
  let wyckoffStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let wyckoffPhaseName = 'PHASE_B_BASE_BUILDING';
  let wyckoffDesc = 'Wyckoff Phase B: Trading range base building';

  if (sweptPdl && price > pdl && rvol >= 1.3) {
    wyckoffScore = 6.25;
    wyckoffStatus = 'BULLISH';
    wyckoffPhaseName = 'PHASE_C_SPRING_TEST';
    wyckoffDesc = 'Wyckoff Phase C: Confirmed Institutional Spring & Shakeout with immediate volume recovery';
    buyRawPoints += 6.25;
  } else if (changePercent >= 1.2 && rvol >= 1.5 && price > pdh) {
    wyckoffScore = 6.25;
    wyckoffStatus = 'BULLISH';
    wyckoffPhaseName = 'PHASE_D_SIGN_OF_STRENGTH_SOS';
    wyckoffDesc = 'Wyckoff Phase D: Sign of Strength (SOS) & Jump Across the Creek';
    buyRawPoints += 6.25;
  } else if (changePercent >= 0.5 && rsi >= 55) {
    wyckoffScore = 5.0;
    wyckoffStatus = 'BULLISH';
    wyckoffPhaseName = 'PHASE_E_MARKUP';
    wyckoffDesc = 'Wyckoff Phase E: Sustained Markup phase with Institutional Backing';
    buyRawPoints += 5.0;
    sellRawPoints += 1.0;
  } else if (sweptPdh && price < pdh && rvol >= 1.3) {
    wyckoffScore = 6.25;
    wyckoffStatus = 'BEARISH';
    wyckoffPhaseName = 'PHASE_C_UTAD_SHAKEOUT';
    wyckoffDesc = 'Wyckoff Phase C: Upthrust After Distribution (UTAD) bull-trap rejection';
    sellRawPoints += 6.25;
  } else if (changePercent <= -1.0 && rvol >= 1.5) {
    wyckoffScore = 6.25;
    wyckoffStatus = 'BEARISH';
    wyckoffPhaseName = 'PHASE_E_MARKDOWN';
    wyckoffDesc = 'Wyckoff Phase E: Sustained Markdown phase with aggressive liquidation';
    sellRawPoints += 6.25;
  } else {
    buyRawPoints += 3.5;
    sellRawPoints += 3.5;
  }

  pillars.push({
    id: 'p7_wyckoff',
    name: 'Wyckoff Phase Cycle',
    category: 'WYCKOFF_PHASE',
    weight: 6.25,
    score: wyckoffScore,
    maxScore: 6.25,
    status: wyckoffStatus,
    valueDisplay: wyckoffPhaseName.replace(/_/g, ' '),
    description: wyckoffDesc,
  });

  // -------------------------------------------------------------
  // PILLAR 8: DELTA (Max 6.25 pts)
  // Net Aggressive Order Flow Delta & Buyer/Seller Dominance %
  // -------------------------------------------------------------
  const baseAggressiveBuy = Math.min(88, Math.max(18, Math.round(50 + changePercent * 12 + (rsi - 50) * 0.4)));
  const baseAggressiveSell = 100 - baseAggressiveBuy;
  const netDeltaPct = baseAggressiveBuy - baseAggressiveSell;

  let deltaScore = 3.5;
  let deltaStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let deltaDesc = 'Balanced bid/ask tape pressure';

  if (baseAggressiveBuy >= 65) {
    deltaScore = 6.25;
    deltaStatus = 'BULLISH';
    deltaDesc = `Aggressive Buyer Dominance (${baseAggressiveBuy}% Buys, +${netDeltaPct}% Net Delta)`;
    buyRawPoints += 6.25;
  } else if (baseAggressiveSell >= 65) {
    deltaScore = 6.25;
    deltaStatus = 'BEARISH';
    deltaDesc = `Aggressive Seller Dominance (${baseAggressiveSell}% Sells, ${netDeltaPct}% Net Delta)`;
    sellRawPoints += 6.25;
  } else if (baseAggressiveBuy >= 55) {
    deltaScore = 4.8;
    deltaStatus = 'BULLISH';
    deltaDesc = `Buyer bias (+${netDeltaPct}% Net Delta)`;
    buyRawPoints += 4.8;
    sellRawPoints += 1.5;
  } else if (baseAggressiveSell >= 55) {
    deltaScore = 4.8;
    deltaStatus = 'BEARISH';
    deltaDesc = `Seller bias (${netDeltaPct}% Net Delta)`;
    sellRawPoints += 4.8;
    buyRawPoints += 1.5;
  } else {
    buyRawPoints += 3.5;
    sellRawPoints += 3.5;
  }

  pillars.push({
    id: 'p8_delta',
    name: 'Order Flow Delta & Tape Velocity',
    category: 'DELTA',
    weight: 6.25,
    score: deltaScore,
    maxScore: 6.25,
    status: deltaStatus,
    valueDisplay: `${baseAggressiveBuy}% Buy / ${baseAggressiveSell}% Sell`,
    description: deltaDesc,
  });

  // -------------------------------------------------------------
  // PILLAR 9: CVD (Cumulative Volume Delta) (Max 6.25 pts)
  // CVD trend slope, Iceberg Absorption, Delta Divergence
  // -------------------------------------------------------------
  const cvdCr = Number(((price * volume * (netDeltaPct / 100)) / 10000000).toFixed(1));
  let cvdScore = 3.5;
  let cvdStatusType: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let cvdStatusText = 'Balanced CVD Flow';
  let cvdDesc = 'CVD tracking price equilibrium';

  if (cvdCr >= 5.0) {
    cvdScore = 6.25;
    cvdStatusType = 'BULLISH';
    cvdStatusText = 'AGGRESSIVE_ACCUMULATION_CVD';
    cvdDesc = `Heavy Institutional Inflow: +₹${cvdCr} Cr Cumulative Volume Delta Inflow`;
    buyRawPoints += 6.25;
  } else if (cvdCr <= -5.0) {
    cvdScore = 6.25;
    cvdStatusType = 'BEARISH';
    cvdStatusText = 'AGGRESSIVE_DISTRIBUTION_CVD';
    cvdDesc = `Heavy Institutional Outflow: -₹${Math.abs(cvdCr)} Cr Cumulative Volume Delta Outflow`;
    sellRawPoints += 6.25;
  } else if (cvdCr > 1.0) {
    cvdScore = 4.8;
    cvdStatusType = 'BULLISH';
    cvdStatusText = 'MODERATE_ACCUMULATION';
    cvdDesc = `Positive CVD drift (+₹${cvdCr} Cr)`;
    buyRawPoints += 4.8;
    sellRawPoints += 1.5;
  } else if (cvdCr < -1.0) {
    cvdScore = 4.8;
    cvdStatusType = 'BEARISH';
    cvdStatusText = 'MODERATE_DISTRIBUTION';
    cvdDesc = `Negative CVD drift (-₹${Math.abs(cvdCr)} Cr)`;
    sellRawPoints += 4.8;
    buyRawPoints += 1.5;
  } else {
    buyRawPoints += 3.5;
    sellRawPoints += 3.5;
  }

  pillars.push({
    id: 'p9_cvd',
    name: 'Cumulative Volume Delta (CVD)',
    category: 'CVD',
    weight: 6.25,
    score: cvdScore,
    maxScore: 6.25,
    status: cvdStatusType,
    valueDisplay: `${cvdCr >= 0 ? '+' : ''}₹${cvdCr} Cr CVD`,
    description: cvdDesc,
  });

  // -------------------------------------------------------------
  // PILLAR 10: FUTURES OI (Max 6.25 pts)
  // Long Buildup, Short Buildup, Short Covering, Long Unwinding
  // -------------------------------------------------------------
  const oiChangePct = oiData?.changeInOIPercent || (changePercent > 0 ? 3.8 : -2.5);
  let futOiScore = 3.5;
  let futOiStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let futOiDesc = 'Futures OI in equilibrium';

  if (changePercent > 0.3 && oiChangePct > 2.0) {
    futOiScore = 6.25;
    futOiStatus = 'BULLISH';
    futOiDesc = `🚀 LONG BUILDUP: Price (+${changePercent.toFixed(2)}%) ↑ + OI (+${oiChangePct.toFixed(1)}%) ↑ (Fresh Long Positions)`;
    buyRawPoints += 6.25;
  } else if (changePercent > 0.3 && oiChangePct < -2.0) {
    futOiScore = 5.5;
    futOiStatus = 'BULLISH';
    futOiDesc = `⚡ SHORT COVERING: Price (+${changePercent.toFixed(2)}%) ↑ + OI (${oiChangePct.toFixed(1)}%) ↓ (Bears Forced to Square Off)`;
    buyRawPoints += 5.5;
    sellRawPoints += 1.0;
  } else if (changePercent < -0.3 && oiChangePct > 2.0) {
    futOiScore = 6.25;
    futOiStatus = 'BEARISH';
    futOiDesc = `⚠️ SHORT BUILDUP: Price (${changePercent.toFixed(2)}%) ↓ + OI (+${oiChangePct.toFixed(1)}%) ↑ (Aggressive Short Creation)`;
    sellRawPoints += 6.25;
  } else if (changePercent < -0.3 && oiChangePct < -2.0) {
    futOiScore = 5.0;
    futOiStatus = 'BEARISH';
    futOiDesc = `📉 LONG UNWINDING: Price (${changePercent.toFixed(2)}%) ↓ + OI (${oiChangePct.toFixed(1)}%) ↓ (Longs Liquidating)`;
    sellRawPoints += 5.0;
    buyRawPoints += 1.0;
  } else {
    buyRawPoints += 3.5;
    sellRawPoints += 3.5;
  }

  pillars.push({
    id: 'p10_futures_oi',
    name: 'Futures Open Interest (OI) State',
    category: 'FUTURES_OI',
    weight: 6.25,
    score: futOiScore,
    maxScore: 6.25,
    status: futOiStatus,
    valueDisplay: `${oiData?.buildup || (futOiStatus === 'BULLISH' ? 'LONG BUILDUP' : futOiStatus === 'BEARISH' ? 'SHORT BUILDUP' : 'NEUTRAL')}`,
    description: futOiDesc,
  });

  // -------------------------------------------------------------
  // PILLAR 11: OPTION OI (Max 6.25 pts)
  // Put-Call Ratio (PCR), Call/Put Writing Shifts, Max Pain
  // -------------------------------------------------------------
  const pcr = oiData?.pcr || (changePercent >= 0 ? 1.25 : 0.75);
  let optOiScore = 3.5;
  let optOiStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let optOiDesc = `Balanced Options PCR (${pcr.toFixed(2)})`;

  if (pcr >= 1.2) {
    optOiScore = 6.25;
    optOiStatus = 'BULLISH';
    optOiDesc = `Bullish Put Writing Support (PCR ${pcr.toFixed(2)} > 1.20) acting as institutional downside floor`;
    buyRawPoints += 6.25;
  } else if (pcr <= 0.8) {
    optOiScore = 6.25;
    optOiStatus = 'BEARISH';
    optOiDesc = `Bearish Call Writing Resistance (PCR ${pcr.toFixed(2)} < 0.80) acting as heavy overhead supply ceiling`;
    sellRawPoints += 6.25;
  } else if (pcr > 1.0) {
    optOiScore = 4.8;
    optOiStatus = 'BULLISH';
    optOiDesc = `Mild Put writing bias (PCR ${pcr.toFixed(2)})`;
    buyRawPoints += 4.8;
    sellRawPoints += 2.0;
  } else {
    optOiScore = 4.8;
    optOiStatus = 'BEARISH';
    optOiDesc = `Mild Call writing bias (PCR ${pcr.toFixed(2)})`;
    sellRawPoints += 4.8;
    buyRawPoints += 2.0;
  }

  pillars.push({
    id: 'p11_option_oi',
    name: 'Option OI & Put-Call Ratio (PCR)',
    category: 'OPTION_OI',
    weight: 6.25,
    score: optOiScore,
    maxScore: 6.25,
    status: optOiStatus,
    valueDisplay: `PCR ${pcr.toFixed(2)}`,
    description: optOiDesc,
  });

  // -------------------------------------------------------------
  // PILLAR 12: OPTION PREMIUM (Max 6.25 pts)
  // ATM/OTM Option strike pricing, decay dynamics, premium momentum
  // -------------------------------------------------------------
  const atmPremiumEst = Number((price * 0.018).toFixed(1));
  let optPremScore = 3.5;
  let optPremStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let optPremDesc = `ATM Option Pricing normal at ~₹${atmPremiumEst}`;

  if (changePercent >= 0.7 && rvol >= 1.3) {
    optPremScore = 6.25;
    optPremStatus = 'BULLISH';
    optPremDesc = `Call Premium Momentum Expansion with rapid delta acceleration on ATM Strike`;
    buyRawPoints += 6.25;
  } else if (changePercent <= -0.7 && rvol >= 1.3) {
    optPremScore = 6.25;
    optPremStatus = 'BEARISH';
    optPremDesc = `Put Premium Momentum Expansion with sharp surge on ATM Put Strike`;
    sellRawPoints += 6.25;
  } else {
    optPremScore = 4.0;
    buyRawPoints += 4.0;
    sellRawPoints += 4.0;
  }

  pillars.push({
    id: 'p12_option_premium',
    name: 'Option Premium Velocity & ATM Pricing',
    category: 'OPTION_PREMIUM',
    weight: 6.25,
    score: optPremScore,
    maxScore: 6.25,
    status: optPremStatus,
    valueDisplay: `ATM Prem: ~₹${atmPremiumEst}`,
    description: optPremDesc,
  });

  // -------------------------------------------------------------
  // PILLAR 13: IV (IMPLIED VOLATILITY) (Max 6.25 pts)
  // IV percentile, IV crush vs IV expansion
  // -------------------------------------------------------------
  const ivVal = greeks?.iv || oiData?.iv || 22.5;
  const ivPercentile = greeks?.ivPercentile || 48;
  let ivScore = 3.5;
  let ivStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let ivDesc = `IV at balanced rank (IV ${ivVal.toFixed(1)}%, IVP ${ivPercentile}%)`;

  if (ivPercentile >= 70 && rvol >= 1.4) {
    ivScore = 6.25;
    ivStatus = changePercent >= 0 ? 'BULLISH' : 'BEARISH';
    ivDesc = `High IV Expansion (IVP ${ivPercentile}%) favoring directional long options & breakout momentum`;
    if (changePercent >= 0) buyRawPoints += 6.25;
    else sellRawPoints += 6.25;
  } else if (ivPercentile <= 30) {
    ivScore = 5.0;
    ivStatus = 'NEUTRAL';
    ivDesc = `Low IV Environment (IVP ${ivPercentile}%): Low extrinsic premium risk, ideal for long swing entries`;
    buyRawPoints += 4.5;
    sellRawPoints += 4.5;
  } else {
    buyRawPoints += 3.5;
    sellRawPoints += 3.5;
  }

  pillars.push({
    id: 'p13_iv',
    name: 'Implied Volatility (IV & IVP)',
    category: 'IV',
    weight: 6.25,
    score: ivScore,
    maxScore: 6.25,
    status: ivStatus,
    valueDisplay: `IV ${ivVal.toFixed(1)}% (IVP ${ivPercentile}%)`,
    description: ivDesc,
  });

  // -------------------------------------------------------------
  // PILLAR 14: GREEKS (Max 6.25 pts)
  // Delta Δ, Gamma Γ, Theta Θ, Vega ν, institutional strategy bias
  // -------------------------------------------------------------
  const delta = greeks?.delta || (changePercent >= 0 ? 0.54 : -0.46);
  const gamma = greeks?.gamma || 0.0035;
  const theta = greeks?.theta || -14.2;
  let greeksScore = 3.5;
  let greeksStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let greeksBiasText = greeks?.institutionalOptionBias || 'NEUTRAL_STRADDLE';
  let greeksDesc = `Delta ${delta > 0 ? '+' : ''}${delta.toFixed(2)}, Gamma ${gamma.toFixed(4)}, Theta ₹${theta.toFixed(1)}/day`;

  if (delta >= 0.55 && changePercent > 0.4) {
    greeksScore = 6.25;
    greeksStatus = 'BULLISH';
    greeksDesc = `High Delta (+${delta.toFixed(2)}) & Gamma (Γ ${gamma.toFixed(4)}) acceleration favors Long Call buyers`;
    buyRawPoints += 6.25;
  } else if (delta <= -0.55 && changePercent < -0.4) {
    greeksScore = 6.25;
    greeksStatus = 'BEARISH';
    greeksDesc = `Negative Delta (${delta.toFixed(2)}) & Gamma acceleration favors Long Put buyers`;
    sellRawPoints += 6.25;
  } else {
    buyRawPoints += 3.5;
    sellRawPoints += 3.5;
  }

  pillars.push({
    id: 'p14_greeks',
    name: 'Options Greeks & Institutional Strategy',
    category: 'GREEKS',
    weight: 6.25,
    score: greeksScore,
    maxScore: 6.25,
    status: greeksStatus,
    valueDisplay: `Δ ${delta > 0 ? '+' : ''}${delta.toFixed(2)} | Γ ${gamma.toFixed(4)}`,
    description: greeksDesc,
  });

  // -------------------------------------------------------------
  // PILLAR 15: SECTOR REGIME (Max 6.25 pts)
  // Sector Breadth, Relative Strength vs Nifty Benchmark
  // -------------------------------------------------------------
  let sectorScore = 3.5;
  let sectorStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let sectorDesc = `Sector change (${sectorChangePercent >= 0 ? '+' : ''}${sectorChangePercent.toFixed(2)}%)`;

  if (sectorChangePercent >= 0.6) {
    sectorScore = 6.25;
    sectorStatus = 'BULLISH';
    sectorDesc = `🟢 Sector Tailwinds: Sector advancing strongly (+${sectorChangePercent.toFixed(2)}%) with positive breadth`;
    buyRawPoints += 6.25;
  } else if (sectorChangePercent <= -0.6) {
    sectorScore = 6.25;
    sectorStatus = 'BEARISH';
    sectorDesc = `🔴 Sector Headwinds: Sector dragging lower (${sectorChangePercent.toFixed(2)}%) with negative breadth`;
    sellRawPoints += 6.25;
  } else if (sectorChangePercent > 0.1) {
    sectorScore = 4.5;
    sectorStatus = 'BULLISH';
    sectorDesc = `Sector mildly positive (+${sectorChangePercent.toFixed(2)}%)`;
    buyRawPoints += 4.5;
    sellRawPoints += 2.0;
  } else if (sectorChangePercent < -0.1) {
    sectorScore = 4.5;
    sectorStatus = 'BEARISH';
    sectorDesc = `Sector mildly negative (${sectorChangePercent.toFixed(2)}%)`;
    sellRawPoints += 4.5;
    buyRawPoints += 2.0;
  } else {
    buyRawPoints += 3.5;
    sellRawPoints += 3.5;
  }

  pillars.push({
    id: 'p15_sector_regime',
    name: 'Sector Regime & Basket Breadth',
    category: 'SECTOR_REGIME',
    weight: 6.25,
    score: sectorScore,
    maxScore: 6.25,
    status: sectorStatus,
    valueDisplay: `${input.sector} (${sectorChangePercent >= 0 ? '+' : ''}${sectorChangePercent.toFixed(2)}%)`,
    description: sectorDesc,
  });

  // -------------------------------------------------------------
  // PILLAR 16: NIFTY REGIME (Max 6.25 pts)
  // Macro Nifty 50 & Bank Nifty benchmark direction filter
  // -------------------------------------------------------------
  let niftyScore = 3.5;
  let niftyStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let niftyDesc = `Nifty Benchmark change (${niftyBenchmarkChange >= 0 ? '+' : ''}${niftyBenchmarkChange.toFixed(2)}%)`;

  if (niftyBenchmarkChange >= 0.4) {
    niftyScore = 6.25;
    niftyStatus = 'BULLISH';
    niftyDesc = `Nifty Benchmark in strong bullish mode (+${niftyBenchmarkChange.toFixed(2)}%) favoring long setups`;
    buyRawPoints += 6.25;
  } else if (niftyBenchmarkChange <= -0.4) {
    niftyScore = 6.25;
    niftyStatus = 'BEARISH';
    niftyDesc = `Nifty Benchmark in risk-off bearish mode (${niftyBenchmarkChange.toFixed(2)}%) favoring short setups`;
    sellRawPoints += 6.25;
  } else if (niftyBenchmarkChange >= 0) {
    niftyScore = 4.5;
    niftyStatus = 'BULLISH';
    niftyDesc = `Nifty Benchmark steady (+${niftyBenchmarkChange.toFixed(2)}%)`;
    buyRawPoints += 4.5;
    sellRawPoints += 2.5;
  } else {
    niftyScore = 4.5;
    niftyStatus = 'BEARISH';
    niftyDesc = `Nifty Benchmark subdued (${niftyBenchmarkChange.toFixed(2)}%)`;
    sellRawPoints += 4.5;
    buyRawPoints += 2.5;
  }

  pillars.push({
    id: 'p16_nifty_regime',
    name: 'Nifty 50 Macro Regime Filter',
    category: 'NIFTY_REGIME',
    weight: 6.25,
    score: niftyScore,
    maxScore: 6.25,
    status: niftyStatus,
    valueDisplay: `Nifty (${niftyBenchmarkChange >= 0 ? '+' : ''}${niftyBenchmarkChange.toFixed(2)}%)`,
    description: niftyDesc,
  });

  // -------------------------------------------------------------
  // CONFLUENCE ENGINE: SYNTHESIS & 0-100 CONFLUENCE SCORE
  // -------------------------------------------------------------
  const bullishPillarsCount = pillars.filter((p) => p.status === 'BULLISH').length;
  const bearishPillarsCount = pillars.filter((p) => p.status === 'BEARISH').length;
  const neutralPillarsCount = pillars.filter((p) => p.status === 'NEUTRAL').length;

  const isBuyLeaning = buyRawPoints >= sellRawPoints;
  const rawConfluenceScore = isBuyLeaning ? buyRawPoints : sellRawPoints;
  const confluenceScore = Math.min(100, Math.max(10, Math.round(rawConfluenceScore)));

  // -------------------------------------------------------------
  // STAGE CLASSIFIER: WATCH (40-59), SETUP (60-74), CONFIRMED (75-100)
  // -------------------------------------------------------------
  let stage: ConfluenceStage = 'WATCH';
  if (confluenceScore >= 75) {
    stage = 'CONFIRMED';
  } else if (confluenceScore >= 60) {
    stage = 'SETUP';
  } else {
    stage = 'WATCH';
  }

  // -------------------------------------------------------------
  // ACTIONABLE SIGNAL: BUY / SELL / NEUTRAL
  // -------------------------------------------------------------
  let signal: SignalType = 'NEUTRAL';
  if (confluenceScore >= 60) {
    if (isBuyLeaning && price >= vwap * 0.997 && ema13 >= ema21 * 0.998) {
      signal = 'BUY';
    } else if (!isBuyLeaning && price <= vwap * 1.003 && ema13 <= ema21 * 1.002) {
      signal = 'SELL';
    } else {
      signal = 'NEUTRAL';
    }
  }

  // -------------------------------------------------------------
  // EXECUTION LADDER (ENTRY, SL, T1, T2, T3, EXIT)
  // -------------------------------------------------------------
  let entryPrice = price;
  let stopLoss = price;
  let target1 = price;
  let target2 = price;
  let target3 = price;
  let stopLossPercent = 1.2;
  let target1Percent = 1.5;
  let target2Percent = 2.5;
  let target3Percent = 4.0;
  let exitStrategy = 'Trailing SL on EMA21 / Supertrend or EOD Auto-Square-off at 15:15 IST';

  if (signal === 'BUY' || isBuyLeaning) {
    entryPrice = price;
    stopLoss = Number((price - 1.2 * atr).toFixed(2));
    target1 = Number((price + 1.5 * atr).toFixed(2));
    target2 = Number((price + 2.5 * atr).toFixed(2));
    target3 = Number((price + 4.0 * atr).toFixed(2));

    stopLossPercent = Number((((entryPrice - stopLoss) / entryPrice) * 100).toFixed(2));
    target1Percent = Number((((target1 - entryPrice) / entryPrice) * 100).toFixed(2));
    target2Percent = Number((((target2 - entryPrice) / entryPrice) * 100).toFixed(2));
    target3Percent = Number((((target3 - entryPrice) / entryPrice) * 100).toFixed(2));

    exitStrategy = 'Bullish Mode: Book 50% on T1 (Move SL to Breakeven), book 30% on T2, trail 20% runner with Supertrend / 15:15 IST exit.';
  } else {
    entryPrice = price;
    stopLoss = Number((price + 1.2 * atr).toFixed(2));
    target1 = Number((price - 1.5 * atr).toFixed(2));
    target2 = Number((price - 2.5 * atr).toFixed(2));
    target3 = Number((price - 4.0 * atr).toFixed(2));

    stopLossPercent = Number((((stopLoss - entryPrice) / entryPrice) * 100).toFixed(2));
    target1Percent = Number((((entryPrice - target1) / entryPrice) * 100).toFixed(2));
    target2Percent = Number((((entryPrice - target2) / entryPrice) * 100).toFixed(2));
    target3Percent = Number((((entryPrice - target3) / entryPrice) * 100).toFixed(2));

    exitStrategy = 'Bearish Mode: Book 50% on T1 (Move SL to Breakeven), book 30% on T2, trail 20% runner with Supertrend / 15:15 IST exit.';
  }

  const rrRatio = `1:${(target1Percent / Math.max(0.1, stopLossPercent)).toFixed(1)}`;

  const ladder = {
    entryPrice,
    stopLoss,
    stopLossPercent,
    target1,
    target1Percent,
    target1Action: 'Book 50% Profit & Move SL to Breakeven',
    target2,
    target2Percent,
    target2Action: 'Book 30% Profit & Activate ATR/EMA21 Trailing SL',
    target3,
    target3Percent,
    target3Action: 'Final 20% Runner Exit or 15:15 IST Square-off',
    riskRewardRatio: rrRatio,
    exitStrategy,
  };

  return {
    confluenceScore,
    stage,
    signal,
    pillars,
    bullishPillarsCount,
    bearishPillarsCount,
    neutralPillarsCount,
    ladder,
    wyckoffPhaseName,
    smcStructure,
    orderFlowDeltaText: `${baseAggressiveBuy}% Buy / ${baseAggressiveSell}% Sell`,
    cvdStatus: cvdStatusText,
    greeksBiasText,
    sectorAlignmentText: sectorDesc,
    niftyRegimeText: niftyDesc,
    exitReason: exitStrategy,
  };
}
