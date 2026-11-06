import {
  ScannedStock,
  SmartMoneyStockAnalysis,
  WyckoffPhaseType,
  SmcSetupType,
  AccumulationRatingType,
  VsaPatternType,
} from '../types';
import { getOiDetailedAction } from './sectorAndOiHelpers';

// Helper to generate clean TradingView Chart URL
export const getTradingViewChartUrl = (symbol: string): string => {
  const cleanSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '');
  return `https://in.tradingview.com/chart/?symbol=NSE:${cleanSymbol}`;
};

/**
 * Calculates Wyckoff Phase for an Indian Equity / FnO Stock
 */
function determineWyckoffPhase(
  price: number,
  changePercent: number,
  rvol: number,
  isAboveVwap: boolean,
  rsi: number,
  cmf: number,
  dayHigh: number,
  dayLow: number
): {
  phase: WyckoffPhaseType;
  phaseLabel: string;
  phaseBadgeCls: string;
  confidence: number;
  description: string;
  actionableTrigger: string;
} {
  const range = Math.max(0.01, dayHigh - dayLow);
  const closePositionInRange = (price - dayLow) / range; // 0 = at low, 1 = at high

  // 1. Spring & Test (Phase C - Highest R:R setup)
  if (closePositionInRange > 0.65 && rvol >= 1.3 && (changePercent >= 0.4 || cmf > 0.12)) {
    return {
      phase: 'PHASE_C_SPRING_TEST',
      phaseLabel: 'Phase C (Spring & Test)',
      phaseBadgeCls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/10',
      confidence: Math.min(98, Math.round(82 + rvol * 5 + cmf * 25)),
      description: 'Liquidity sweep below key support successfully absorbed by institutions with immediate reversal.',
      actionableTrigger: 'Spring test confirmed; Enter on pullback to Spring candle midpoint.',
    };
  }

  // 2. Sign of Strength & Creek Breakout (Phase D)
  if (isAboveVwap && changePercent >= 1.5 && rsi >= 60 && closePositionInRange > 0.8) {
    return {
      phase: 'PHASE_D_SOS_BREAKOUT',
      phaseLabel: 'Phase D (SOS Breakout)',
      phaseBadgeCls: 'bg-teal-500/20 text-teal-300 border-teal-500/40',
      confidence: Math.min(96, Math.round(85 + (changePercent > 2 ? 8 : 4))),
      description: 'Sign of Strength (SOS) breaking out above the accumulation trading range creek.',
      actionableTrigger: 'Enter on breakout retest (Back to the Creek / LPS).',
    };
  }

  // 3. Steady Markup (Phase E)
  if (isAboveVwap && changePercent > 0.5 && rsi >= 55 && cmf > 0.05) {
    return {
      phase: 'PHASE_E_MARKUP',
      phaseLabel: 'Phase E (Active Markup)',
      phaseBadgeCls: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40',
      confidence: 88,
      description: 'Active institutional trend continuation following completed accumulation.',
      actionableTrigger: 'Ride trend with trailing stop along Session VWAP.',
    };
  }

  // 4. Heavy Distribution / UTAD
  if (!isAboveVwap && (changePercent <= -1.5 || (closePositionInRange < 0.3 && rvol > 1.4))) {
    return {
      phase: 'DISTRIBUTION_UTAD',
      phaseLabel: 'Phase D/E (Distribution / UTAD)',
      phaseBadgeCls: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
      confidence: 89,
      description: 'Upthrust After Distribution (UTAD) with heavy institutional supply dumping.',
      actionableTrigger: 'Avoid longs; look for short setups on weak rallies.',
    };
  }

  // 5. Active Markdown
  if (!isAboveVwap && changePercent < -0.6 && rsi <= 45) {
    return {
      phase: 'MARKDOWN',
      phaseLabel: 'Markdown (SOW)',
      phaseBadgeCls: 'bg-rose-600/20 text-rose-400 border-rose-600/40',
      confidence: 86,
      description: 'Clear Sign of Weakness (SOW) with dominating sell-side volume.',
      actionableTrigger: 'Bearish continuation under session lower VWAP bands.',
    };
  }

  // 6. Secondary Test / Phase B Accumulation
  if (cmf >= 0.0 || (rsi >= 48 && rsi <= 58)) {
    return {
      phase: 'PHASE_B_ACCUMULATION',
      phaseLabel: 'Phase B (Absorption Range)',
      phaseBadgeCls: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      confidence: 80,
      description: 'Institutions absorbing supply in tight range; preparing for Phase C spring.',
      actionableTrigger: 'Accumulate near lower range boundary with tight invalidation.',
    };
  }

  // Default: Phase A Stopping Volume
  return {
    phase: 'PHASE_A_STOPPING',
    phaseLabel: 'Phase A (Stopping Volume)',
    phaseBadgeCls: 'bg-slate-700/60 text-slate-300 border-slate-600',
    confidence: 75,
    description: 'Preliminary support establishing floor after prior decline.',
    actionableTrigger: 'Wait for secondary test confirmation before taking position.',
  };
}

/**
 * Analyzes Smart Money Concepts (SMC): Order Blocks, FVGs, Liquidity Sweeps
 */
function calculateSmcMetrics(
  price: number,
  dayHigh: number,
  dayLow: number,
  changePercent: number,
  isAboveVwap: boolean,
  rvol: number
): {
  setupType: SmcSetupType;
  setupLabel: string;
  setupBadgeCls: string;
  orderBlockRange: [number, number];
  fvgRange?: [number, number];
  liquiditySweepLevel?: number;
  bosLevel?: number;
  isChochConfirmed: boolean;
  proximityToObPercent: number;
  isInObZone: boolean;
} {
  const range = dayHigh - dayLow;

  // Bullish Order Block (OB): Base of the demand impulse
  const obLow = Number((dayLow + range * 0.08).toFixed(2));
  const obHigh = Number((dayLow + range * 0.28).toFixed(2));
  const isInObZone = price >= obLow && price <= obHigh * 1.015;
  const proximityToObPercent = Number((((price - obHigh) / obHigh) * 100).toFixed(2));

  // Fair Value Gap (FVG)
  const fvgLow = Number((dayLow + range * 0.45).toFixed(2));
  const fvgHigh = Number((dayLow + range * 0.58).toFixed(2));

  // Liquidity Sweep Level (Equal Lows / Daily Low swept)
  const liquiditySweepLevel = Number((dayLow * 0.9985).toFixed(2));
  const bosLevel = Number((dayHigh * 1.002).toFixed(2));

  let setupType: SmcSetupType = 'EQUILIBRIUM';
  let setupLabel = 'Equilibrium Zone (50% Fair Value)';
  let setupBadgeCls = 'bg-slate-800 text-slate-300 border-slate-700';
  let isChochConfirmed = false;

  if (isInObZone || (changePercent > 0.3 && proximityToObPercent < 1.2)) {
    setupType = 'BULLISH_ORDER_BLOCK';
    setupLabel = 'Bullish Order Block (Demand Zone)';
    setupBadgeCls = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-emerald-500/10';
    isChochConfirmed = true;
  } else if (price >= fvgLow && price <= fvgHigh && isAboveVwap) {
    setupType = 'FAIR_VALUE_GAP_FVG';
    setupLabel = 'Bullish FVG (Imbalance Fill)';
    setupBadgeCls = 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    isChochConfirmed = true;
  } else if (changePercent >= 1.8 && rvol >= 1.5) {
    setupType = 'BOS_BREAK_OF_STRUCTURE';
    setupLabel = 'BOS (Break of Structure)';
    setupBadgeCls = 'bg-teal-500/20 text-teal-300 border-teal-500/40';
    isChochConfirmed = true;
  } else if (changePercent <= -1.8 && rvol >= 1.4) {
    setupType = 'BEARISH_ORDER_BLOCK';
    setupLabel = 'Bearish Order Block (Supply Zone)';
    setupBadgeCls = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
  } else if (price < dayLow * 1.005 && rvol >= 1.2) {
    setupType = 'LIQUIDITY_GRAB_SWEEP';
    setupLabel = 'Liquidity Grab (Sell-Side Sweep)';
    setupBadgeCls = 'bg-purple-500/20 text-purple-300 border-purple-500/40';
    isChochConfirmed = true;
  }

  return {
    setupType,
    setupLabel,
    setupBadgeCls,
    orderBlockRange: [obLow, obHigh],
    fvgRange: [fvgLow, fvgHigh],
    liquiditySweepLevel,
    bosLevel,
    isChochConfirmed,
    proximityToObPercent,
    isInObZone,
  };
}

/**
 * Calculates Institutional Accumulation / Distribution Rating (A+ to D) & CMF
 */
function calculateAccumulationMetrics(
  stock: ScannedStock,
  price: number,
  dayHigh: number,
  dayLow: number,
  changePercent: number,
  volume: number,
  rvol: number
): {
  rating: AccumulationRatingType;
  ratingLabel: string;
  ratingScore: number;
  ratingBadgeCls: string;
  cmf: number;
  cmfLabel: string;
  adiSlope: 'RISING' | 'FALLING' | 'FLAT';
  institutionalFlowCr: number;
  fiiDiiSentiment: 'HEAVY_ACCUMULATION' | 'MILD_ACCUMULATION' | 'NEUTRAL' | 'MILD_DISTRIBUTION' | 'HEAVY_DISTRIBUTION';
  fiiDiiBadgeCls: string;
  deliveryPercent: number;
  isDeliverySpike: boolean;
  deliveryVs20DayAvgPct: number;
} {
  const range = Math.max(0.01, dayHigh - dayLow);
  const closeLoc = (price - dayLow) / range; // 0 to 1

  // Chaikin Money Flow Approximation (-1 to +1)
  const mfv = ((price - dayLow) - (dayHigh - price)) / range;
  const cmf = Number((mfv * 0.4 + (changePercent / 10) * 0.6).toFixed(3));

  // Delivery Percent & Spike Simulation for Indian Cash/FnO Stocks
  const baseDelivery = 42 + ((stock.symbol.charCodeAt(0) * 7) % 28);
  const deliveryBoost = changePercent > 0.5 ? Math.min(22, rvol * 6) : 0;
  const deliveryPercent = Number(Math.min(88, Math.max(25, baseDelivery + deliveryBoost)).toFixed(1));
  const deliveryVs20DayAvgPct = Number((deliveryPercent - 45).toFixed(1));
  const isDeliverySpike = deliveryPercent >= 55 && rvol >= 1.25;

  // Estimated Institutional Flow in ₹ Crores
  const turnoverCr = Number(((price * volume) / 10000000).toFixed(2));
  const instMultiplier = isDeliverySpike ? 0.38 : 0.22;
  const institutionalFlowCr = Number((turnoverCr * instMultiplier * (cmf >= 0 ? 1 : -1)).toFixed(2));

  let score = 50;
  if (cmf > 0.15) score += 25;
  else if (cmf > 0.05) score += 15;
  else if (cmf < -0.15) score -= 25;
  else if (cmf < -0.05) score -= 15;

  if (isDeliverySpike) score += 20;
  if (closeLoc >= 0.7) score += 15;
  else if (closeLoc <= 0.3) score -= 15;

  score = Math.min(99, Math.max(10, Math.round(score + (stock.aiScore - 50) * 0.2)));

  let rating: AccumulationRatingType = 'B_NEUTRAL_ABSORPTION';
  let ratingLabel = 'B (Neutral Absorption)';
  let ratingBadgeCls = 'bg-slate-800 text-slate-300 border-slate-700';

  if (score >= 85) {
    rating = 'A_PLUS_HEAVY_ACCUMULATION';
    ratingLabel = 'A+ Heavy Institutional Absorption';
    ratingBadgeCls = 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-emerald-500/20';
  } else if (score >= 70) {
    rating = 'A_STEADY_ACCUMULATION';
    ratingLabel = 'A (Steady Accumulation)';
    ratingBadgeCls = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  } else if (score <= 30) {
    rating = 'D_HEAVY_DISTRIBUTION';
    ratingLabel = 'D (Heavy Institutional Distribution)';
    ratingBadgeCls = 'bg-rose-500/25 text-rose-300 border-rose-500/50 shadow-rose-500/20';
  } else if (score <= 45) {
    rating = 'C_MILD_DISTRIBUTION';
    ratingLabel = 'C (Mild Distribution)';
    ratingBadgeCls = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
  }

  let fiiDiiSentiment: 'HEAVY_ACCUMULATION' | 'MILD_ACCUMULATION' | 'NEUTRAL' | 'MILD_DISTRIBUTION' | 'HEAVY_DISTRIBUTION' = 'NEUTRAL';
  let fiiDiiBadgeCls = 'bg-slate-800 text-slate-300 border-slate-700';

  if (score >= 82) {
    fiiDiiSentiment = 'HEAVY_ACCUMULATION';
    fiiDiiBadgeCls = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
  } else if (score >= 65) {
    fiiDiiSentiment = 'MILD_ACCUMULATION';
    fiiDiiBadgeCls = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
  } else if (score <= 32) {
    fiiDiiSentiment = 'HEAVY_DISTRIBUTION';
    fiiDiiBadgeCls = 'bg-rose-500/20 text-rose-300 border-rose-500/40';
  } else if (score <= 45) {
    fiiDiiSentiment = 'MILD_DISTRIBUTION';
    fiiDiiBadgeCls = 'bg-rose-500/15 text-rose-400 border-rose-500/30';
  }

  const adiSlope = cmf > 0.08 ? 'RISING' : cmf < -0.08 ? 'FALLING' : 'FLAT';
  const cmfLabel = cmf >= 0 ? `+${cmf.toFixed(3)}` : cmf.toFixed(3);

  return {
    rating,
    ratingLabel,
    ratingScore: score,
    ratingBadgeCls,
    cmf,
    cmfLabel,
    adiSlope,
    institutionalFlowCr,
    fiiDiiSentiment,
    fiiDiiBadgeCls,
    deliveryPercent,
    isDeliverySpike,
    deliveryVs20DayAvgPct,
  };
}

/**
 * Calculates Volume Spread Analysis (VSA) Patterns
 */
function determineVsaPattern(
  changePercent: number,
  rvol: number,
  closeLoc: number
): {
  pattern: VsaPatternType;
  patternLabel: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  volumeSpreadRatio: number;
  note: string;
} {
  const volumeSpreadRatio = Number((rvol * (Math.abs(changePercent) + 0.5)).toFixed(2));

  if (closeLoc > 0.7 && rvol >= 1.5 && changePercent >= 0.5) {
    return {
      pattern: 'ABSORPTION_VOLUME',
      patternLabel: 'Absorption Volume (Heavy Buying)',
      sentiment: 'BULLISH',
      volumeSpreadRatio,
      note: 'Institutional buying absorbing all retail floating supply at highs.',
    };
  }

  if (closeLoc > 0.6 && rvol >= 1.8 && changePercent < 0.2 && changePercent > -0.8) {
    return {
      pattern: 'STOPPING_VOLUME',
      patternLabel: 'Stopping Volume (Demand Floor)',
      sentiment: 'BULLISH',
      volumeSpreadRatio,
      note: 'High volume with narrow spread after a dip indicates strong institutional buying floor.',
    };
  }

  if (changePercent > 0.2 && rvol < 0.8) {
    return {
      pattern: 'NO_SUPPLY_BAR',
      patternLabel: 'No Supply Test (Bullish Setup)',
      sentiment: 'BULLISH',
      volumeSpreadRatio,
      note: 'Price rising easily on low volume indicates lack of sellers; path of least resistance is UP.',
    };
  }

  if (closeLoc < 0.3 && rvol >= 1.8) {
    return {
      pattern: 'UPTHRUST_BAR',
      patternLabel: 'Upthrust Bar (Distribution)',
      sentiment: 'BEARISH',
      volumeSpreadRatio,
      note: 'High volume rejection at resistance; institutions offloading into retail FOMO.',
    };
  }

  if (changePercent < -0.2 && rvol < 0.8) {
    return {
      pattern: 'NO_DEMAND_BAR',
      patternLabel: 'No Demand Bar (Bearish)',
      sentiment: 'BEARISH',
      volumeSpreadRatio,
      note: 'Lack of buying support on pullbacks; downward continuation expected.',
    };
  }

  return {
    pattern: 'NEUTRAL_VOLUME',
    patternLabel: 'Standard Volume Flow',
    sentiment: 'NEUTRAL',
    volumeSpreadRatio,
    note: 'Balanced order flow without significant institutional anomalies.',
  };
}

/**
 * Calculates Multi-Band Standard Deviation VWAP
 */
function calculateMultiBandVwap(price: number, vwap: number, dayHigh: number, dayLow: number) {
  const atrApprox = Math.max(price * 0.008, (dayHigh - dayLow) * 0.5);
  const stdDev1 = atrApprox * 0.85;
  const stdDev2 = atrApprox * 1.7;

  const upperBand1 = Number((vwap + stdDev1).toFixed(2));
  const lowerBand1 = Number((vwap - stdDev1).toFixed(2));
  const upperBand2 = Number((vwap + stdDev2).toFixed(2));
  const lowerBand2 = Number((vwap - stdDev2).toFixed(2));

  const vwapDiffPct = Number((((price - vwap) / vwap) * 100).toFixed(2));

  let positionTier: 'ABOVE_UPPER_2' | 'INSIDE_UPPER_BAND' | 'AT_VWAP' | 'INSIDE_LOWER_BAND' | 'BELOW_LOWER_2' = 'AT_VWAP';
  let tierLabel = 'At Fair Value (VWAP Baseline)';

  if (price >= upperBand2) {
    positionTier = 'ABOVE_UPPER_2';
    tierLabel = '+2σ Extended Bullish Stretch';
  } else if (price >= upperBand1) {
    positionTier = 'INSIDE_UPPER_BAND';
    tierLabel = '+1σ Institutional Momentum Zone';
  } else if (price <= lowerBand2) {
    positionTier = 'BELOW_LOWER_2';
    tierLabel = '-2σ Extreme Oversold Absorption';
  } else if (price <= lowerBand1) {
    positionTier = 'INSIDE_LOWER_BAND';
    tierLabel = '-1σ Institutional Demand Discount';
  }

  return {
    vwap,
    upperBand1,
    lowerBand1,
    upperBand2,
    lowerBand2,
    vwapDiffPct,
    positionTier,
    tierLabel,
  };
}

/**
 * Analyzes a single stock and generates complete Smart Money & Institutional Profile
 */
export function analyzeStockSmartMoney(stock: ScannedStock): SmartMoneyStockAnalysis {
  const price = stock.price || 100;
  const change = stock.change || 0;
  const changePercent = stock.changePercent || 0;
  const volume = stock.volume || 100000;
  const rvol = stock.indicators?.rvol || 1.0;
  const rsi = stock.indicators?.rsi || 50;
  const vwap = stock.indicators?.vwap || price;
  const isAboveVwap = price >= vwap;
  const dayHigh = stock.indicators?.high || price * 1.015;
  const dayLow = stock.indicators?.low || price * 0.985;
  const range = Math.max(0.01, dayHigh - dayLow);
  const closeLoc = (price - dayLow) / range;
  const totalValueCr = Number(((price * volume) / 10000000).toFixed(2));

  // 1. Calculate Wyckoff Phase
  const cmfApprox = Number(((((price - dayLow) - (dayHigh - price)) / range) * 0.4 + (changePercent / 10) * 0.6).toFixed(3));
  const wyckoff = determineWyckoffPhase(price, changePercent, rvol, isAboveVwap, rsi, cmfApprox, dayHigh, dayLow);

  // 2. Calculate SMC Metrics
  const smc = calculateSmcMetrics(price, dayHigh, dayLow, changePercent, isAboveVwap, rvol);

  // 3. Calculate Accumulation / Distribution Rating
  const accumulation = calculateAccumulationMetrics(stock, price, dayHigh, dayLow, changePercent, volume, rvol);

  // 4. Determine VSA Pattern
  const vsa = determineVsaPattern(changePercent, rvol, closeLoc);

  // 5. Multi-Band VWAP
  const vwapBands = calculateMultiBandVwap(price, vwap, dayHigh, dayLow);

  // 6. Options Dynamics
  const oiDetail = getOiDetailedAction(stock);
  const pcr = oiDetail?.pcr || Number((0.85 + (changePercent > 0 ? 0.35 : -0.25)).toFixed(2));
  const pcrSentiment = pcr >= 1.15 ? 'BULLISH_PUT_WRITING' : pcr <= 0.75 ? 'BEARISH_CALL_WRITING' : 'NEUTRAL';
  const maxPain = Number((price * (1 + (pcr > 1.0 ? 0.005 : -0.005))).toFixed(2));
  const maxPainDistancePct = Number((((maxPain - price) / price) * 100).toFixed(2));
  const putWritingPressure = Number(((volume / 25000) * (pcr >= 1.0 ? 1.6 : 0.8)).toFixed(1));
  const callWritingPressure = Number(((volume / 25000) * (pcr < 1.0 ? 1.6 : 0.8)).toFixed(1));
  const gammaBias = pcr >= 1.1 ? 'LONG_GAMMA' : pcr <= 0.8 ? 'SHORT_GAMMA' : 'NEUTRAL';
  const ivRank = Math.round(35 + ((stock.symbol.charCodeAt(0) * 11) % 45));

  // 7. Complete Trade Execution Setup
  const entryLow = Number((price * 0.995).toFixed(2));
  const entryHigh = Number((price * 1.005).toFixed(2));
  const stopLoss = Number((dayLow * 0.992).toFixed(2));
  const riskAmount = Math.max(price * 0.008, price - stopLoss);
  const target1 = Number((price + riskAmount * 1.5).toFixed(2));
  const target2 = Number((price + riskAmount * 2.5).toFixed(2));
  const target3 = Number((price + riskAmount * 4.0).toFixed(2));
  const riskRewardRatio = `1:${(3.2).toFixed(1)}`;

  const confluenceNotes: string[] = [];
  if (accumulation.rating === 'A_PLUS_HEAVY_ACCUMULATION' || accumulation.rating === 'A_STEADY_ACCUMULATION') {
    confluenceNotes.push(`Heavy Institutional Accumulation (${accumulation.ratingLabel}) with CMF ${accumulation.cmfLabel}`);
  }
  if (wyckoff.phase === 'PHASE_C_SPRING_TEST' || wyckoff.phase === 'PHASE_D_SOS_BREAKOUT') {
    confluenceNotes.push(`Wyckoff ${wyckoff.phaseLabel} with ${wyckoff.confidence}% quant confidence`);
  }
  if (smc.isInObZone || smc.setupType === 'BULLISH_ORDER_BLOCK') {
    confluenceNotes.push(`Trading directly inside Bullish Order Block demand zone (₹${smc.orderBlockRange[0]} - ₹${smc.orderBlockRange[1]})`);
  }
  if (accumulation.isDeliverySpike) {
    confluenceNotes.push(`Delivery % Spike at ${accumulation.deliveryPercent}% (Institutional Delivery Confirmation)`);
  }
  if (pcrSentiment === 'BULLISH_PUT_WRITING') {
    confluenceNotes.push(`Options Confluence: Bullish Put Writing Support with PCR ${pcr.toFixed(2)}`);
  }
  if (isAboveVwap) {
    confluenceNotes.push(`Sustaining above Session VWAP (+${vwapBands.vwapDiffPct}%) in ${vwapBands.tierLabel}`);
  }

  let bias: 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL' = 'NEUTRAL';
  let biasBadgeCls = 'bg-slate-800 text-slate-300 border-slate-700';

  if (accumulation.ratingScore >= 80 && (wyckoff.phase === 'PHASE_C_SPRING_TEST' || wyckoff.phase === 'PHASE_D_SOS_BREAKOUT')) {
    bias = 'STRONG_BUY';
    biasBadgeCls = 'bg-emerald-500/25 text-emerald-300 border-emerald-500/50 shadow-emerald-500/20 font-black';
  } else if (accumulation.ratingScore >= 65 || wyckoff.phase === 'PHASE_E_MARKUP') {
    bias = 'BUY';
    biasBadgeCls = 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-bold';
  } else if (accumulation.ratingScore <= 30 || wyckoff.phase === 'DISTRIBUTION_UTAD') {
    bias = 'STRONG_SELL';
    biasBadgeCls = 'bg-rose-500/25 text-rose-300 border-rose-500/50 shadow-rose-500/20 font-black';
  } else if (accumulation.ratingScore <= 45 || wyckoff.phase === 'MARKDOWN') {
    bias = 'SELL';
    biasBadgeCls = 'bg-rose-500/15 text-rose-400 border-rose-500/30 font-bold';
  }

  return {
    symbol: stock.symbol,
    name: stock.name,
    sector: stock.sector,
    price,
    change,
    changePercent,
    volume,
    rvol,
    totalValueCr,
    deliveryPercent: accumulation.deliveryPercent,
    isDeliverySpike: accumulation.isDeliverySpike,
    deliveryVs20DayAvgPct: accumulation.deliveryVs20DayAvgPct,
    wyckoff,
    smc,
    accumulation: {
      rating: accumulation.rating,
      ratingLabel: accumulation.ratingLabel,
      ratingScore: accumulation.ratingScore,
      ratingBadgeCls: accumulation.ratingBadgeCls,
      cmf: accumulation.cmf,
      cmfLabel: accumulation.cmfLabel,
      adiSlope: accumulation.adiSlope,
      institutionalFlowCr: accumulation.institutionalFlowCr,
      fiiDiiSentiment: accumulation.fiiDiiSentiment,
      fiiDiiBadgeCls: accumulation.fiiDiiBadgeCls,
    },
    vsa,
    vwapBands,
    optionsDynamics: {
      pcr,
      pcrSentiment,
      maxPain,
      maxPainDistancePct,
      putWritingPressure,
      callWritingPressure,
      gammaBias,
      ivRank,
    },
    tradeSetup: {
      bias,
      biasBadgeCls,
      entryZone: [entryLow, entryHigh],
      stopLoss,
      target1,
      target2,
      target3,
      riskRewardRatio,
      overallScore: accumulation.ratingScore,
      confluenceNotes,
    },
    tradingViewUrl: getTradingViewChartUrl(stock.symbol),
    lastUpdated: new Date().toLocaleTimeString('en-IN'),
  };
}

/**
 * Analyzes an entire array of stocks
 */
export function analyzeAllStocksSmartMoney(stocks: ScannedStock[]): SmartMoneyStockAnalysis[] {
  if (!stocks || stocks.length === 0) return [];
  return stocks.map(analyzeStockSmartMoney);
}

/**
 * Summary KPI Statistics for the Smart Money Dashboard
 */
export function calculateSmartMoneyKpis(analyses: SmartMoneyStockAnalysis[]) {
  const total = analyses.length;
  if (total === 0) {
    return {
      total: 0,
      springCount: 0,
      sosBreakoutCount: 0,
      heavyAccumulationCount: 0,
      distributionCount: 0,
      deliverySpikeCount: 0,
      orderBlockCount: 0,
      totalInstFlowCr: 0,
      avgDeliveryPct: 0,
    };
  }

  let springCount = 0;
  let sosBreakoutCount = 0;
  let heavyAccumulationCount = 0;
  let distributionCount = 0;
  let deliverySpikeCount = 0;
  let orderBlockCount = 0;
  let totalInstFlowCr = 0;
  let sumDeliveryPct = 0;

  analyses.forEach((a) => {
    if (a.wyckoff.phase === 'PHASE_C_SPRING_TEST') springCount++;
    if (a.wyckoff.phase === 'PHASE_D_SOS_BREAKOUT') sosBreakoutCount++;
    if (a.accumulation.rating === 'A_PLUS_HEAVY_ACCUMULATION' || a.accumulation.rating === 'A_STEADY_ACCUMULATION') {
      heavyAccumulationCount++;
    }
    if (a.accumulation.rating === 'D_HEAVY_DISTRIBUTION' || a.wyckoff.phase === 'DISTRIBUTION_UTAD') {
      distributionCount++;
    }
    if (a.isDeliverySpike) deliverySpikeCount++;
    if (a.smc.setupType === 'BULLISH_ORDER_BLOCK' || a.smc.isInObZone) orderBlockCount++;
    totalInstFlowCr += a.accumulation.institutionalFlowCr;
    sumDeliveryPct += a.deliveryPercent;
  });

  return {
    total,
    springCount,
    sosBreakoutCount,
    heavyAccumulationCount,
    distributionCount,
    deliverySpikeCount,
    orderBlockCount,
    totalInstFlowCr: Number(totalInstFlowCr.toFixed(1)),
    avgDeliveryPct: Number((sumDeliveryPct / total).toFixed(1)),
  };
}

/**
 * Filter Smart Money Analyses
 */
export function filterSmartMoneyAnalyses(
  analyses: SmartMoneyStockAnalysis[],
  preset: string,
  searchQuery: string,
  sector: string
): SmartMoneyStockAnalysis[] {
  return analyses.filter((a) => {
    // 1. Search Query
    if (searchQuery) {
      const q = searchQuery.toUpperCase();
      const matchSymbol = a.symbol.toUpperCase().includes(q);
      const matchName = a.name.toUpperCase().includes(q);
      const matchSector = a.sector.toUpperCase().includes(q);
      if (!matchSymbol && !matchName && !matchSector) return false;
    }

    // 2. Sector Filter
    if (sector && sector !== 'ALL' && a.sector !== sector) {
      return false;
    }

    // 3. Preset Quick Filter
    switch (preset) {
      case 'WYCKOFF_SPRING_SOS':
        return a.wyckoff.phase === 'PHASE_C_SPRING_TEST' || a.wyckoff.phase === 'PHASE_D_SOS_BREAKOUT';
      case 'BULLISH_ORDER_BLOCKS':
        return a.smc.setupType === 'BULLISH_ORDER_BLOCK' || a.smc.isInObZone;
      case 'FVG_IMBALANCE':
        return a.smc.setupType === 'FAIR_VALUE_GAP_FVG';
      case 'HIGH_DELIVERY_ACCUMULATION':
        return a.isDeliverySpike || a.deliveryPercent >= 55;
      case 'PUT_WRITING_SUPPORT':
        return a.optionsDynamics.pcrSentiment === 'BULLISH_PUT_WRITING';
      case 'TOP_RR_SETUPS':
        return a.tradeSetup.bias === 'STRONG_BUY' || a.tradeSetup.bias === 'BUY';
      case 'DISTRIBUTION_WARNING':
        return a.accumulation.rating === 'D_HEAVY_DISTRIBUTION' || a.wyckoff.phase === 'DISTRIBUTION_UTAD';
      default:
        return true;
    }
  });
}

/**
 * CSV Exporter for Smart Money Analytics
 */
export function exportSmartMoneyToCsv(analyses: SmartMoneyStockAnalysis[]): string {
  const headers = [
    'Symbol',
    'Name',
    'Sector',
    'Price',
    'Change %',
    'Volume',
    'RVOL',
    'Delivery %',
    'Delivery Spike',
    'Wyckoff Phase',
    'Wyckoff Confidence %',
    'SMC Setup',
    'Order Block Range',
    'Accumulation Rating',
    'CMF Score',
    'Inst Net Flow (Cr)',
    'VSA Pattern',
    'VWAP Tier',
    'PCR Ratio',
    'Trade Bias',
    'Entry Zone',
    'Stop Loss',
    'Target 1',
    'Target 2',
    'Target 3',
    'R:R Ratio',
  ];

  const rows = analyses.map((a) => [
    a.symbol,
    `"${a.name}"`,
    `"${a.sector}"`,
    a.price,
    `${a.changePercent}%`,
    a.volume,
    a.rvol,
    `${a.deliveryPercent}%`,
    a.isDeliverySpike ? 'YES' : 'NO',
    `"${a.wyckoff.phaseLabel}"`,
    `${a.wyckoff.confidence}%`,
    `"${a.smc.setupLabel}"`,
    `"${a.smc.orderBlockRange[0]} - ${a.smc.orderBlockRange[1]}"`,
    `"${a.accumulation.ratingLabel}"`,
    a.accumulation.cmfLabel,
    a.accumulation.institutionalFlowCr,
    `"${a.vsa.patternLabel}"`,
    `"${a.vwapBands.tierLabel}"`,
    a.optionsDynamics.pcr,
    a.tradeSetup.bias,
    `"${a.tradeSetup.entryZone[0]} - ${a.tradeSetup.entryZone[1]}"`,
    a.tradeSetup.stopLoss,
    a.tradeSetup.target1,
    a.tradeSetup.target2,
    a.tradeSetup.target3,
    a.tradeSetup.riskRewardRatio,
  ]);

  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}
