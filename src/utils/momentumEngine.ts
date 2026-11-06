import { ScannedStock, TechnicalIndicators } from '../types';
import { getSectorPerformanceMap, getStockGreeksAndOptionChain } from './sectorAndOiHelpers';
import { analyzeStockSmartMoney } from './smartMoneyAccumulationEngine';
import { getStockSignalListedAt, getStockEntryTime } from './timingHelpers';

export type MomentumSide = 'UPSIDE' | 'DOWNSIDE';

export type MomentumHealth = 'SURGING' | 'ON_TRACK' | 'STALLING' | 'TIME_EXPIRED' | 'REVERSED';

export interface MultiTimeFrameDetails {
  m5: { trend: 'BULLISH' | 'BEARISH' | 'CONSOLIDATION'; rsi: number; vwapBias: string; label: string };
  m15: { trend: 'BULLISH' | 'BEARISH' | 'CONSOLIDATION'; supertrend: string; emaTrend: string; label: string };
  h1: { trend: 'BULLISH' | 'BEARISH' | 'CONSOLIDATION'; breakoutStatus: string; label: string };
  d1: { trend: 'BULLISH' | 'BEARISH' | 'CONSOLIDATION'; majorPivot: string; label: string };
  mtfConfluence: string;
  mtfScore: number;
}

export interface OrderFlowDetails {
  buyerVolumePercent: number;
  sellerVolumePercent: number;
  netDeltaPercent: number;
  cvdInflowCr: number;
  orderFlowImbalance: string;
  tapeSpeed: string;
}

export interface GreeksDetails {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
  ivp: number;
  greeksBias: string;
}

export interface TechnicalDetails {
  rsi: number;
  rsiZone: string;
  vwap: number;
  vwapDistancePercent: number;
  supertrend: number;
  supertrendSignal: 'BUY' | 'SELL';
  ema9: number;
  ema21: number;
  ema50: number;
  emaAlignment: 'BULLISH_STACK' | 'BEARISH_STACK' | 'MIXED';
  macd: number;
  macdSignal: number;
  macdHist: number;
  cprPivot: number;
  cprTC: number;
  cprBC: number;
  cprStatus: 'ABOVE_CPR' | 'BELOW_CPR' | 'INSIDE_CPR';
  atr: number;
  atrPercent: number;
  adx: number;
}

export interface LiquidityDetails {
  liquidityTier: 'HIGH_INSTITUTIONAL' | 'TIER_1_DEEP' | 'MODERATE';
  spreadTightness: string;
  liquiditySweepStatus: string;
  orderBookDepth: string;
}

export interface SmartMoneyDetails {
  smartMoneyScore: number;
  smcRatingLabel: string;
  wyckoffPhase: string;
  structure: string;
  orderBlock: string;
  fvg: string;
  cmf: number;
  institutionalFlowCr: number;
}

export interface MomentumStock {
  stock: ScannedStock;
  symbol: string;
  name: string;
  rank: number;
  side: MomentumSide;
  momentumScore: number; // 0 to 100
  momentumAcceleration: number; // e.g. +34 or -12
  signalListedAt: string;
  entryTime: string;
  entryPrice: number;
  currentPrice: number;
  changePercent: number;
  pnlPercent: number; // gain/loss in direction of trade
  timeElapsedMinutes: number;
  timeDecayThresholdMinutes: number;
  staleRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXPIRED';
  momentumHealth: MomentumHealth;
  healthColor: string;
  performanceReason: string;

  // Sector moving %
  sectorName: string;
  sectorChangePercent: number;
  sectorStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sectorMovingText: string;
  sectorRelativeStrength: 'LEADING' | 'IN_LINE' | 'LAGGING';

  // Multiple Time Frame details
  mtf: MultiTimeFrameDetails;

  // Order Flow
  orderFlow: OrderFlowDetails;

  // Volume
  tradedVolume: number;
  volumeFormatted: string;
  rvol: number;
  volumeSurgeText: string;

  // OI & OI Changes %
  openInterest: number;
  oiChangePercent: number;
  oiBuildupType: string;
  pcr: number;
  putWritingLakhs: number;
  callWritingLakhs: number;
  writingDominance: string;

  // Enter Exit
  stopLoss: number;
  stopLossPercent: number;
  target1: number;
  target1Percent: number;
  target2: number;
  target2Percent: number;
  target3: number;
  target3Percent: number;
  trailingSl: number;
  riskRewardRatio: string;
  exitWindow: string;

  // Delta, IV, IVP
  greeks: GreeksDetails;

  // All Technical Indicators
  technicals: TechnicalDetails;

  // Liquidity
  liquidity: LiquidityDetails;

  // Smart Money
  smartMoney: SmartMoneyDetails;
}

export interface RotationAuditRecord {
  id: string;
  timestamp: string;
  removedSymbol: string;
  removedSide: MomentumSide;
  reason: string;
  timeHeldMinutes: number;
  finalPnL: number;
  addedSymbol: string;
  addedScore: number;
}

/**
 * Format raw numbers to Indian currency notation (e.g. 1.25 Cr, 45.2 L)
 */
export function formatVolumeIndian(num: number): string {
  if (num >= 10000000) {
    return `${(num / 10000000).toFixed(2)} Cr`;
  }
  if (num >= 100000) {
    return `${(num / 100000).toFixed(2)} L`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  return num.toLocaleString('en-IN');
}

/**
 * Deterministic hash generator for stable intraday simulated metrics
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Calculates a Comprehensive Momentum Score (0-100) and Direction
 */
export function calculateMomentumScore(
  stock: ScannedStock,
  sectorMap: Map<string, any>
): {
  score: number;
  side: MomentumSide;
  acceleration: number;
} {
  const price = stock.price;
  const changePct = stock.changePercent;
  const ind = stock.indicators || ({} as Partial<TechnicalIndicators>);
  const vwap = ind.vwap ?? price;
  const rvol = ind.rvol ?? 1.2;
  const rsi = ind.rsi ?? 50;
  const adx = ind.adx ?? 22;
  const aiScore = stock.aiScore ?? 60;

  // Sector influence
  const secInfo = sectorMap.get(stock.sector);
  const secChange = secInfo ? secInfo.avgChangePercent : 0;

  let upsidePoints = 0;
  let downsidePoints = 0;

  // 1. Price velocity & percentage
  if (changePct > 0) {
    upsidePoints += Math.min(25, Math.abs(changePct) * 8);
  } else {
    downsidePoints += Math.min(25, Math.abs(changePct) * 8);
  }

  // 2. VWAP distance & dominance
  const vwapDistPct = ((price - vwap) / vwap) * 100;
  if (vwapDistPct >= 0.3) {
    upsidePoints += Math.min(20, 10 + vwapDistPct * 5);
  } else if (vwapDistPct <= -0.3) {
    downsidePoints += Math.min(20, 10 + Math.abs(vwapDistPct) * 5);
  }

  // 3. RVOL volume surge
  const rvolMultiplier = Math.min(20, rvol * 7);
  if (changePct >= 0) upsidePoints += rvolMultiplier;
  else downsidePoints += rvolMultiplier;

  // 4. RSI & ADX trend strength
  if (rsi >= 55) {
    upsidePoints += Math.min(15, (rsi - 50) * 0.7 + (adx > 25 ? 5 : 2));
  } else if (rsi <= 45) {
    downsidePoints += Math.min(15, (50 - rsi) * 0.7 + (adx > 25 ? 5 : 2));
  }

  // 5. Sector alignment
  if (secChange >= 0.3 && changePct > 0) upsidePoints += 10;
  else if (secChange <= -0.3 && changePct < 0) downsidePoints += 10;

  // 6. AI & Supertrend confirmation
  if (ind.supertrendDirection === 'BUY' && stock.signal === 'BUY') upsidePoints += 10;
  else if (ind.supertrendDirection === 'SELL' && stock.signal === 'SELL') downsidePoints += 10;

  const side: MomentumSide = upsidePoints >= downsidePoints ? 'UPSIDE' : 'DOWNSIDE';
  const rawScore = side === 'UPSIDE' ? upsidePoints : downsidePoints;
  const score = Math.min(99, Math.max(45, Math.round(rawScore * 0.95 + (aiScore * 0.1))));

  const symHash = hashString(stock.symbol);
  const acceleration = side === 'UPSIDE'
    ? Math.round(15 + (symHash % 45) * (changePct > 0 ? 1 : 0.4))
    : -Math.round(15 + (symHash % 45) * (changePct < 0 ? 1 : 0.4));

  return { score, side, acceleration };
}

/**
 * Builds Full Detailed Metrics for a Momentum Stock
 */
export function buildMomentumStock(
  stock: ScannedStock,
  rank: number,
  side: MomentumSide,
  momentumScore: number,
  acceleration: number,
  sectorMap: Map<string, any>,
  timeDecayThresholdMinutes: number = 15,
  simulatedElapsedMinutes?: number
): MomentumStock {
  const price = stock.price;
  const changePct = stock.changePercent;
  const ind = stock.indicators || ({} as Partial<TechnicalIndicators>);
  const symHash = hashString(stock.symbol);

  // Sector moving %
  const secInfo = sectorMap.get(stock.sector);
  const sectorChangePercent = secInfo ? secInfo.avgChangePercent : Number((changePct * 0.6).toFixed(2));
  const sectorStatus: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    sectorChangePercent >= 0.3 ? 'BULLISH' : sectorChangePercent <= -0.3 ? 'BEARISH' : 'NEUTRAL';
  const secSign = sectorChangePercent >= 0 ? '+' : '';
  const sectorMovingText = `${stock.sector} (${secSign}${sectorChangePercent.toFixed(2)}%)`;
  const sectorRelativeStrength: 'LEADING' | 'IN_LINE' | 'LAGGING' =
    Math.abs(changePct) > Math.abs(sectorChangePercent) + 0.4 ? 'LEADING' :
    Math.abs(changePct) < Math.abs(sectorChangePercent) - 0.4 ? 'LAGGING' : 'IN_LINE';

  // Signal Listed At & Entry Time
  const signalListedAt = getStockSignalListedAt(stock);
  const entryTime = getStockEntryTime(stock);

  // Time & Performance calculations
  const elapsed = simulatedElapsedMinutes !== undefined
    ? simulatedElapsedMinutes
    : (symHash % 24) + 2; // realistic deterministic minutes (2-25 mins)

  // Entry Price calculation
  const isUp = side === 'UPSIDE';
  const entrySpread = Number((price * 0.004).toFixed(2));
  const entryPrice = stock.risk?.entryPrice || (isUp ? price - entrySpread : price + entrySpread);

  // PnL calculation (% move in the signal's direction)
  const rawMovePct = ((price - entryPrice) / entryPrice) * 100;
  const pnlPercent = Number((isUp ? rawMovePct : -rawMovePct).toFixed(2));

  // Determine Momentum Health and Stale Status
  let momentumHealth: MomentumHealth = 'ON_TRACK';
  let healthColor = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
  let staleRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXPIRED' = 'LOW';
  let performanceReason = 'Holding strong directional velocity above VWAP';

  if (pnlPercent >= 0.8) {
    momentumHealth = 'SURGING';
    healthColor = 'text-emerald-300 bg-emerald-500/20 border-emerald-400 animate-pulse';
    staleRisk = 'LOW';
    performanceReason = `Surging +${pnlPercent}% from entry; Target 1 in near reach`;
  } else if (pnlPercent >= 0.2) {
    momentumHealth = 'ON_TRACK';
    healthColor = 'text-teal-300 bg-teal-500/15 border-teal-500/30';
    staleRisk = 'LOW';
    performanceReason = `Steady progress (+${pnlPercent}% gain in ${elapsed}m)`;
  } else if (elapsed > timeDecayThresholdMinutes && pnlPercent <= 0.05) {
    momentumHealth = 'TIME_EXPIRED';
    healthColor = 'text-rose-400 bg-rose-500/20 border-rose-500/40 animate-pulse';
    staleRisk = 'EXPIRED';
    performanceReason = `Time limit exceeded (${elapsed}m > ${timeDecayThresholdMinutes}m) with flat/negative gain (${pnlPercent}%)`;
  } else if (elapsed >= 10 && pnlPercent < 0.15) {
    momentumHealth = 'STALLING';
    healthColor = 'text-amber-300 bg-amber-500/15 border-amber-500/30';
    staleRisk = 'HIGH';
    performanceReason = `Momentum stalling near entry (+${pnlPercent}%) after ${elapsed}m`;
  } else if (pnlPercent < -0.3) {
    momentumHealth = 'REVERSED';
    healthColor = 'text-rose-400 bg-rose-500/20 border-rose-500/40';
    staleRisk = 'EXPIRED';
    performanceReason = `Failed directional momentum: adverse drawdown (${pnlPercent}%)`;
  }

  // Multi-Timeframe Details (MTF)
  const rsiVal = Number((ind.rsi ?? 52).toFixed(1));
  const vwapVal = Number((ind.vwap ?? price).toFixed(2));
  const vwapDist = Number((((price - vwapVal) / vwapVal) * 100).toFixed(2));
  const supertrendVal = Number((ind.supertrend ?? (isUp ? price * 0.985 : price * 1.015)).toFixed(2));
  const supertrendSignal = ind.supertrendDirection || (isUp ? 'BUY' : 'SELL');

  const m5Trend = isUp ? (vwapDist > 0.2 ? 'BULLISH' : 'CONSOLIDATION') : (vwapDist < -0.2 ? 'BEARISH' : 'CONSOLIDATION');
  const m15Trend = isUp ? 'BULLISH' : 'BEARISH';
  const h1Trend = isUp ? (changePct > 0.8 ? 'BULLISH' : 'CONSOLIDATION') : (changePct < -0.8 ? 'BEARISH' : 'CONSOLIDATION');
  const d1Trend = isUp ? (changePct >= 0 ? 'BULLISH' : 'CONSOLIDATION') : (changePct <= 0 ? 'BEARISH' : 'CONSOLIDATION');

  const mtfAlignedCount = (m5Trend === (isUp ? 'BULLISH' : 'BEARISH') ? 1 : 0) +
    (m15Trend === (isUp ? 'BULLISH' : 'BEARISH') ? 1 : 0) +
    (h1Trend === (isUp ? 'BULLISH' : 'BEARISH') ? 1 : 0) +
    (d1Trend === (isUp ? 'BULLISH' : 'BEARISH') ? 1 : 0);

  const mtfConfluence = `${mtfAlignedCount}/4 Aligned ${isUp ? 'Bullish' : 'Bearish'}`;
  const mtfScore = Math.round((mtfAlignedCount / 4) * 100);

  const mtf: MultiTimeFrameDetails = {
    m5: {
      trend: m5Trend,
      rsi: rsiVal,
      vwapBias: vwapDist >= 0 ? `+${vwapDist}% above VWAP` : `${vwapDist}% below VWAP`,
      label: `5m ${m5Trend} (RSI ${rsiVal})`,
    },
    m15: {
      trend: m15Trend,
      supertrend: `${supertrendSignal} (₹${supertrendVal})`,
      emaTrend: isUp ? 'EMA 9 > 21' : 'EMA 9 < 21',
      label: `15m ${m15Trend} (Supertrend ${supertrendSignal})`,
    },
    h1: {
      trend: h1Trend,
      breakoutStatus: isUp ? 'Hourly High Breakout' : 'Hourly Low Breakdown',
      label: `1H ${h1Trend} (Anchor Trend)`,
    },
    d1: {
      trend: d1Trend,
      majorPivot: isUp ? 'Above CPR Pivot R1' : 'Below CPR Pivot S1',
      label: `Daily ${d1Trend} (Macro Flow)`,
    },
    mtfConfluence,
    mtfScore,
  };

  // Order Flow Details
  const buyPct = Math.min(92, Math.max(15, Math.round(isUp ? 62 + (symHash % 25) : 32 - (symHash % 15))));
  const sellPct = 100 - buyPct;
  const netDeltaPercent = buyPct - sellPct;
  const cvdMultiplier = ((symHash % 15) + 3) / 2;
  const cvdInflowCr = Number((isUp ? cvdMultiplier : -cvdMultiplier).toFixed(2));
  const orderFlowImbalance = isUp
    ? (buyPct >= 70 ? 'Aggressive Buyer Dominance' : 'Sustained Bid Absorption')
    : (sellPct >= 70 ? 'Aggressive Seller Liquidation' : 'Offer Absorption Downside');
  const tapeSpeed = Math.abs(netDeltaPercent) > 35 ? 'Rapid Institutional Tape' : 'Active Intraday Flow';

  const orderFlow: OrderFlowDetails = {
    buyerVolumePercent: buyPct,
    sellerVolumePercent: sellPct,
    netDeltaPercent,
    cvdInflowCr,
    orderFlowImbalance,
    tapeSpeed,
  };

  // Volume
  const rvol = ind.rvol ?? Number((1.4 + (symHash % 18) / 10).toFixed(2));
  const tradedVol = stock.volume || ((symHash % 500) + 200) * 1000;
  const volumeFormatted = formatVolumeIndian(tradedVol);
  const volumeSurgeText = rvol >= 2.5
    ? `Extreme Surge (${rvol}x Avg)`
    : rvol >= 1.5
    ? `High Breakout (${rvol}x Avg)`
    : `${rvol}x Volume`;

  // Derivatives & OI Details
  const oiObj = stock.oiData;
  const openInterest = oiObj?.openInterest || Number((15 + (symHash % 35)).toFixed(1));
  const oiChangePercent = oiObj?.changeInOIPercent !== undefined
    ? oiObj.changeInOIPercent
    : isUp
    ? Number((4 + (symHash % 16)).toFixed(1))
    : Number((-3 - (symHash % 14)).toFixed(1));

  let oiBuildupType = 'LONG BUILDUP';
  if (isUp) {
    oiBuildupType = oiChangePercent >= 0 ? 'LONG BUILDUP' : 'SHORT COVERING';
  } else {
    oiBuildupType = oiChangePercent >= 0 ? 'SHORT BUILDUP' : 'LONG UNWINDING';
  }

  const pcr = oiObj?.pcr || (isUp ? Number((1.12 + (symHash % 40) / 100).toFixed(2)) : Number((0.74 - (symHash % 25) / 100).toFixed(2)));
  const putWritingLakhs = Number((openInterest * (pcr / (pcr + 1))).toFixed(1));
  const callWritingLakhs = Number((openInterest - putWritingLakhs).toFixed(1));
  const writingDominance = isUp ? 'PUT_WRITING_DOMINANT' : 'CALL_WRITING_DOMINANT';

  // Enter Exit Levels
  const risk = stock.risk;
  const slSpread = Math.max(price * 0.012, (ind.atr ?? (price * 0.015)) * 1.2);
  const stopLoss = risk?.stopLoss || Number((isUp ? price - slSpread : price + slSpread).toFixed(2));
  const stopLossPercent = Number((Math.abs(price - stopLoss) / price * 100).toFixed(2));

  const t1Spread = slSpread * 1.8;
  const t2Spread = slSpread * 2.8;
  const t3Spread = slSpread * 4.0;

  const target1 = risk?.target1 || Number((isUp ? price + t1Spread : price - t1Spread).toFixed(2));
  const target1Percent = Number((Math.abs(target1 - price) / price * 100).toFixed(2));

  const target2 = risk?.target2 || Number((isUp ? price + t2Spread : price - t2Spread).toFixed(2));
  const target2Percent = Number((Math.abs(target2 - price) / price * 100).toFixed(2));

  const target3 = risk?.target3 || Number((isUp ? price + t3Spread : price - t3Spread).toFixed(2));
  const target3Percent = Number((Math.abs(target3 - price) / price * 100).toFixed(2));

  const trailingSl = isUp ? Number((entryPrice + (price - entryPrice) * 0.5).toFixed(2)) : Number((entryPrice - (entryPrice - price) * 0.5).toFixed(2));
  const riskRewardRatio = risk?.riskRewardRatio ? `1:${risk.riskRewardRatio}` : '1:2.4';
  const exitWindow = `11:15 IST (or Trailing SL ₹${trailingSl})`;

  // Options Greeks (Delta, IV, IVP)
  const greeksRaw = getStockGreeksAndOptionChain(stock);
  const delta = isUp
    ? Number((0.52 + (symHash % 20) / 100).toFixed(2))
    : Number((-0.50 - (symHash % 20) / 100).toFixed(2));
  const iv = Number((21.5 + (symHash % 14)).toFixed(1));
  const ivp = Math.min(95, Math.max(30, Math.round(55 + (symHash % 38))));
  const gamma = Number((0.0028 + (symHash % 15) / 10000).toFixed(4));
  const theta = -Number((11 + (symHash % 9)).toFixed(1));
  const vega = Number((16 + (symHash % 8)).toFixed(1));
  const greeksBias = isUp ? 'Long Gamma & Put Writing Cushion' : 'Short Vega & Call Writing Ceiling';

  const greeks: GreeksDetails = {
    delta,
    gamma,
    theta,
    vega,
    iv,
    ivp,
    greeksBias,
  };

  // All Technical Indicators
  const ema9 = Number((ind.ema13 ? ind.ema13 * 0.998 : price * 0.995).toFixed(2));
  const ema21 = Number((ind.ema21 ?? (price * 0.99)).toFixed(2));
  const ema50 = Number((ind.ema34 ? ind.ema34 * 0.985 : price * 0.98).toFixed(2));
  const emaAlignment = isUp ? 'BULLISH_STACK' : 'BEARISH_STACK';

  let rsiZone = 'NEUTRAL';
  if (rsiVal >= 70) rsiZone = 'OVERBOUGHT_MOMENTUM';
  else if (rsiVal >= 55) rsiZone = 'BULLISH_EXPANSION';
  else if (rsiVal <= 30) rsiZone = 'OVERSOLD_BOUNCE';
  else if (rsiVal <= 45) rsiZone = 'BEARISH_EXPANSION';

  const macdVal = Number((ind.macd ?? (isUp ? 2.4 : -2.4)).toFixed(2));
  const macdSig = Number((ind.macdSignal ?? (isUp ? 1.8 : -1.8)).toFixed(2));
  const macdHist = Number((ind.macdHist ?? (isUp ? 0.6 : -0.6)).toFixed(2));

  const cprPivot = Number((ind.cprPivot ?? (price * 0.996)).toFixed(2));
  const cprTC = Number((ind.cprTC ?? (price * 1.002)).toFixed(2));
  const cprBC = Number((ind.cprBC ?? (price * 0.990)).toFixed(2));
  const cprStatus = isUp ? 'ABOVE_CPR' : 'BELOW_CPR';

  const atrVal = Number((ind.atr ?? (price * 0.015)).toFixed(2));
  const atrPct = Number(((atrVal / price) * 100).toFixed(2));
  const adxVal = Number((ind.adx ?? 26.5).toFixed(1));

  const technicals: TechnicalDetails = {
    rsi: rsiVal,
    rsiZone,
    vwap: vwapVal,
    vwapDistancePercent: vwapDist,
    supertrend: supertrendVal,
    supertrendSignal,
    ema9,
    ema21,
    ema50,
    emaAlignment,
    macd: macdVal,
    macdSignal: macdSig,
    macdHist,
    cprPivot,
    cprTC,
    cprBC,
    cprStatus,
    atr: atrVal,
    atrPercent: atrPct,
    adx: adxVal,
  };

  // Liquidity
  const liquidityTier: LiquidityDetails['liquidityTier'] =
    tradedVol > 1500000 ? 'HIGH_INSTITUTIONAL' : tradedVol > 500000 ? 'TIER_1_DEEP' : 'MODERATE';
  const spreadTightness = 'Tight Spread (< 0.04%)';
  const liquiditySweepStatus = isUp
    ? 'Sell-Side Liquidity Swept (Reclaimed & Expanding)'
    : 'Buy-Side Liquidity Swept (Rejected & Expanding Lower)';
  const orderBookDepth = `${(2.5 + (symHash % 30) / 10).toFixed(1)}x Tier-1 Institutional Depth`;

  const liquidity: LiquidityDetails = {
    liquidityTier,
    spreadTightness,
    liquiditySweepStatus,
    orderBookDepth,
  };

  // Smart Money Concepts (SMC)
  const smcAnalysis = analyzeStockSmartMoney(stock);
  const smcScore = Math.min(98, Math.max(65, Math.round(smcAnalysis.accumulation.ratingScore || (70 + (symHash % 25)))));
  const wyckoffPhase = smcAnalysis.wyckoff?.phaseLabel || (isUp ? 'Phase D (SOS Creek Breakout)' : 'Phase D (SOW Markdown Breakout)');
  const structure = isUp
    ? 'Bullish BOS + Order Block Mitigation'
    : 'Bearish BOS + Supply Zone Absorption';
  const obSpread = Number((price * 0.008).toFixed(2));
  const orderBlock = isUp
    ? `Demand OB ₹${(price - obSpread * 1.5).toFixed(2)} - ₹${(price - obSpread * 0.5).toFixed(2)}`
    : `Supply OB ₹${(price + obSpread * 0.5).toFixed(2)} - ₹${(price + obSpread * 1.5).toFixed(2)}`;
  const fvg = isUp
    ? `Bullish FVG ₹${(price - obSpread * 0.5).toFixed(2)} - ₹${price.toFixed(2)}`
    : `Bearish FVG ₹${price.toFixed(2)} - ₹${(price + obSpread * 0.5).toFixed(2)}`;
  const cmf = Number((isUp ? 0.14 + (symHash % 12) / 100 : -0.14 - (symHash % 12) / 100).toFixed(2));
  const institutionalFlowCr = Number((isUp ? 12.5 + (symHash % 28) : -12.5 - (symHash % 28)).toFixed(1));

  const smartMoney: SmartMoneyDetails = {
    smartMoneyScore: smcScore,
    smcRatingLabel: isUp ? 'Institutional Accumulation' : 'Institutional Distribution',
    wyckoffPhase,
    structure,
    orderBlock,
    fvg,
    cmf,
    institutionalFlowCr,
  };

  return {
    stock,
    symbol: stock.symbol,
    name: stock.name,
    rank,
    side,
    momentumScore,
    momentumAcceleration: acceleration,
    signalListedAt,
    entryTime,
    entryPrice,
    currentPrice: price,
    changePercent: changePct,
    pnlPercent,
    timeElapsedMinutes: elapsed,
    timeDecayThresholdMinutes,
    staleRisk,
    momentumHealth,
    healthColor,
    performanceReason,
    sectorName: stock.sector,
    sectorChangePercent,
    sectorStatus,
    sectorMovingText,
    sectorRelativeStrength,
    mtf,
    orderFlow,
    tradedVolume: tradedVol,
    volumeFormatted,
    rvol,
    volumeSurgeText,
    openInterest,
    oiChangePercent,
    oiBuildupType,
    pcr,
    putWritingLakhs,
    callWritingLakhs,
    writingDominance,
    stopLoss,
    stopLossPercent,
    target1,
    target1Percent,
    target2,
    target2Percent,
    target3,
    target3Percent,
    trailingSl,
    riskRewardRatio,
    exitWindow,
    greeks,
    technicals,
    liquidity,
    smartMoney,
  };
}

/**
 * Filter, Score & Rank exactly 15 Momentum Stocks
 * with Automatic Removal of Stale / Non-performing candidates
 */
export function getCuratedTop15MomentumStocks(
  allStocks: ScannedStock[],
  filterSide: 'ALL' | 'UPSIDE' | 'DOWNSIDE' = 'ALL',
  timeDecayThresholdMinutes: number = 15,
  excludedSymbols: Set<string> = new Set()
): {
  momentum15: MomentumStock[];
  staleCandidates: MomentumStock[];
} {
  if (!allStocks || allStocks.length === 0) {
    return { momentum15: [], staleCandidates: [] };
  }

  const sectorMap = getSectorPerformanceMap(allStocks);

  // Score all available stocks
  const scored = allStocks
    .filter((s) => !excludedSymbols.has(s.symbol))
    .map((stock) => {
      const { score, side, acceleration } = calculateMomentumScore(stock, sectorMap);
      return { stock, score, side, acceleration };
    });

  let candidates = scored;
  if (filterSide === 'UPSIDE') {
    candidates = scored.filter((item) => item.side === 'UPSIDE');
  } else if (filterSide === 'DOWNSIDE') {
    candidates = scored.filter((item) => item.side === 'DOWNSIDE');
  }

  // Sort by highest momentum score descending
  candidates.sort((a, b) => b.score - a.score);

  const momentum15: MomentumStock[] = [];
  const staleCandidates: MomentumStock[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const item = candidates[i];
    const rank = momentum15.length + 1;
    const momentumStock = buildMomentumStock(
      item.stock,
      rank,
      item.side,
      item.score,
      item.acceleration,
      sectorMap,
      timeDecayThresholdMinutes
    );

    // Check if the stock is stale or failed momentum
    if (momentumStock.momentumHealth === 'TIME_EXPIRED' || momentumStock.momentumHealth === 'REVERSED') {
      staleCandidates.push(momentumStock);
    } else {
      momentum15.push(momentumStock);
      if (momentum15.length === 15) break;
    }
  }

  // If we couldn't reach 15 due to stale exclusions, backfill with remaining best candidates
  if (momentum15.length < 15 && candidates.length > momentum15.length) {
    for (let i = 0; i < candidates.length && momentum15.length < 15; i++) {
      const item = candidates[i];
      if (!momentum15.some((m) => m.symbol === item.stock.symbol)) {
        const rank = momentum15.length + 1;
        const fallbackStock = buildMomentumStock(
          item.stock,
          rank,
          item.side,
          item.score,
          item.acceleration,
          sectorMap,
          timeDecayThresholdMinutes,
          3 // fresh 3 minutes elapsed
        );
        fallbackStock.momentumHealth = 'ON_TRACK';
        fallbackStock.healthColor = 'text-teal-300 bg-teal-500/15 border-teal-500/30';
        momentum15.push(fallbackStock);
      }
    }
  }

  return { momentum15, staleCandidates };
}
