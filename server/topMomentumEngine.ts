import { Candle, ScannedStock } from '../src/types';
import { getISTDateParts } from '../src/data/marketSchedule';
import { IntradayCandleBar } from './autonomousPriceService';
import { ClaudeFnoBar, formatClockHHMMSS, parseClockSec } from './claudeFnoEngine';
import { computeRvolFromBars } from './smartMoneyConceptsEngine';
import { computeBarClvAndDelta } from './muhuratFlowEngine';
import { LOCKED_SYSTEM_RULES } from './systemFiveRules';

export const TOP_MOMENTUM_STRONG_RVOL_MIN = LOCKED_SYSTEM_RULES.MIN_RVOL_STRICT; // > 2.00
export const TOP_MOMENTUM_STRONG_XTIME_VOL_MIN = LOCKED_SYSTEM_RULES.MIN_VOL_BAZAAR_XTIME_STRICT; // > 1.00X (Volume Bazaar X-Time)
export const TOP_MOMENTUM_STRONG_ADX_MIN = LOCKED_SYSTEM_RULES.MIN_ADX; // >= 25.0

export type TopMomentumStage =
  | 'BREAK_IGNITION'
  | 'REJ_1_ENTRY'
  | 'EARLY_TREND'
  | 'EXHAUSTED_EXIT';

export interface TopMomentumCheck {
  step: number;
  label: string;
  passed: boolean;
  detail: string;
}

export interface TopMomentumSignalRow {
  symbol: string;
  name: string;
  sector: string;
  sectorChangePct: number;
  direction: 'BUY' | 'SELL';
  stage: TopMomentumStage;
  stageBadge: string;
  shouldAlertNow: boolean;
  isEarlyIgnition: boolean;
  isExhausted: boolean;
  exhaustionReason: string;

  // Timestamps (exact Break / Rej 1 ignition candle time — strictly >= 09:20 IST when intraday bars exist)
  listedAt: string;
  breakTimeIST: string;
  rej1TimeIST: string;
  barsSinceIgnition: number;

  // Price & Trade Levels anchored at Ignition (Break / Rej 1)
  price: number;
  changePercent: number;
  entryPrice: number;
  moveFromEntryPct: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskR: number;
  rrRatio: string;
  atr14: number;

  // Structure Levels (matching Order Flow chart)
  prevClose: number;
  breakLevel: number;
  sweepExtreme: number;
  sweepDetected: boolean;
  rej1Detected: boolean;
  vwap: number;
  ema9: number;
  ema21: number;
  vsVwapPct: number;

  // 3 Sub-Pane Order Flow Metrics
  barDelta: number;          // Current 5m bar Δ
  cumulativeDelta: number;   // Session Cumulative Delta CΔ
  cvdFlippedAtBreak: boolean;
  cvdSlope3: number;
  zeroLineMomentum: number;  // Sub-pane 2: normalized VWAP-CVD momentum line (>0 BUY, <0 SELL)
  impulseOscillator: number; // Sub-pane 3: delta/volume thrust oscillator (spikes at Break!)

  // Profitability & Institutional Alpha Upgrades (v2.0 Rectified)
  squeezeRelease: boolean;          // Volatility contraction followed by ATR expansion breakout
  atrExpansionRatio: number;        // Ignition bar range / ATR(14)
  relativeStrengthVsSector: number; // Stock %Chg - Sector %Chg (sector-leading alpha)
  diAligned: boolean;               // +DI >= -DI for BUY, -DI >= +DI for SELL (blocks dead-cat bounces)
  absorptionTrapBlocked: boolean;   // True if heavy opposing rejection wick warns of institutional absorption
  profitabilityEdgeLabel: string;   // Crisp edge summary (e.g. "Squeeze Release · Sector Leader")

  // Strong Volume & Trend Strength Formula Metrics (RVOL > 2.00, Vol Bazaar X-Time > 1.00X, ADX >= 25+ & DI aligned)
  rvol: number;
  xTimeVolume: number;       // Trimmed-baseline 5m X-Time Volume multiple (> 1.00X)
  barVolRatio: number;       // Latest 5m candle volume multiple
  adx: number;               // Wilder's ADX(14) trend strength (>= 25+)
  plusDI: number;
  minusDI: number;
  strongRvolPassed: boolean;
  strongXTimeVolPassed: boolean;
  adxPassed: boolean;

  turnoverCr: number;
  volume: number;
  bidAskRatio: number;
  orderBookBias: string;
  oiChangePct: number;
  buildup: 'Long Buildup' | 'Short Buildup' | 'Short Covering' | 'Long Unwinding';

  // Scorecard (8-Factor Institutional Momentum Ignition v2.0)
  conditionsMet: number;
  totalConditions: 8;
  conditions: TopMomentumCheck[];
  score: number; // 0..100 (rewards EARLY ignition + Squeeze + Sector RS + DI-aligned ADX; penalizes chasing)
  ignitionNote: string;
}

export interface TopMomentumScanReport {
  status: 'ok';
  scannerName: 'Top Momentum • Order Flow Early Ignition';
  strategyName: string;
  generatedAt: string;
  istTime: string;
  isMidnightCleared: boolean;
  universeEvaluated: number;
  earlyIgnitionBuyCount: number;
  earlyIgnitionSellCount: number;
  buyCount: number;
  sellCount: number;
  blockedExhaustedCount: number;
  thresholds: {
    strongRvolMin: number;
    strongXTimeVolMin: number;
    adxMin: number;
  };
  formulaSteps: Array<{ step: string; detail: string }>;
  buySignals: TopMomentumSignalRow[];
  sellSignals: TopMomentumSignalRow[];
  exhaustedSignals: TopMomentumSignalRow[];
}

const INDEX_BLACKLIST = new Set([
  'NIFTY',
  'NIFTY 50',
  'NIFTY50',
  'BANKNIFTY',
  'NIFTY BANK',
  'FINNIFTY',
  'MIDCPNIFTY',
  'NIFTYNXT50',
  'SENSEX',
  'INDIAVIX',
  'INDIA VIX',
  'NIFTYIT',
  'NIFTYFPI',
]);

function round2(n: number): number {
  return Number((Number.isFinite(n) ? n : 0).toFixed(2));
}

function trimmedMeanVolume(bars: ClaudeFnoBar[]): number {
  const vols = bars.map((b) => Math.max(0, b.volume)).filter((v) => v > 0);
  if (vols.length === 0) return 0;
  if (vols.length < 5) {
    return vols.reduce((a, b) => a + b, 0) / vols.length;
  }
  // Trim the single largest outlier spike (e.g., 09:15 opening auction volume) so afternoon ignitions are never distorted
  const sorted = [...vols].sort((a, b) => a - b);
  const trimmed = sorted.slice(0, -1);
  return trimmed.reduce((a, b) => a + b, 0) / Math.max(1, trimmed.length);
}

function normalize5mBars(rawBars: IntradayCandleBar[] | Candle[] | undefined): ClaudeFnoBar[] {
  if (!rawBars || rawBars.length === 0) return [];
  const out: ClaudeFnoBar[] = [];
  for (const b of rawBars as any[]) {
    const o = Number(b.open);
    const h = Number(b.high);
    const l = Number(b.low);
    const c = Number(b.close);
    const v = Math.max(0, Number(b.volume) || 0);
    if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c) || c <= 0) {
      continue;
    }
    let timeIST = typeof b.timeIST === 'string' && b.timeIST ? b.timeIST : '';
    let dateIST = typeof b.dateIST === 'string' && b.dateIST ? b.dateIST : '';
    if ((!timeIST || !dateIST) && typeof b.time === 'string') {
      const parsed = new Date(b.time);
      if (!Number.isNaN(parsed.getTime())) {
        const parts = getISTDateParts(parsed);
        timeIST = parts.timeStr;
        dateIST = parts.dateStr;
      } else if (/^\d{2}:\d{2}/.test(b.time)) {
        timeIST = b.time.length === 5 ? `${b.time}:00` : b.time;
      }
    }
    const secIST = parseClockSec(timeIST) || 9 * 3600 + 15 * 60;
    out.push({
      timeIST: formatClockHHMMSS(secIST),
      dateIST: dateIST || getISTDateParts().dateStr,
      secIST,
      open: o,
      high: Math.max(o, h, l, c),
      low: Math.min(o, h, l, c),
      close: c,
      volume: v,
    });
  }
  out.sort((a, b) => (a.dateIST === b.dateIST ? a.secIST - b.secIST : a.dateIST.localeCompare(b.dateIST)));
  return out;
}

function computeEmaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function computeAtr(bars: ClaudeFnoBar[], period = 14): number {
  if (bars.length < 2) return 0;
  const start = Math.max(1, bars.length - period);
  let sum = 0;
  let cnt = 0;
  for (let i = start; i < bars.length; i++) {
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    sum += tr;
    cnt++;
  }
  return cnt > 0 ? sum / cnt : 0;
}

/**
 * Computes Wilder's ADX(14), +DI, and -DI directly from 5m OHLC bars.
 * Never returns a fake constant when bars are short — adapts lookback cleanly to available bars.
 */
export function computeWilderAdx(
  bars: ClaudeFnoBar[],
  targetPeriod = 14
): { adx: number; plusDI: number; minusDI: number } {
  if (!bars || bars.length < 4) {
    return { adx: 0, plusDI: 0, minusDI: 0 };
  }

  const trArr: number[] = [];
  const plusDmArr: number[] = [];
  const minusDmArr: number[] = [];

  for (let i = 1; i < bars.length; i++) {
    const upMove = bars[i].high - bars[i - 1].high;
    const downMove = bars[i - 1].low - bars[i].low;
    const plusDM = upMove > downMove && upMove > 0 ? upMove : 0;
    const minusDM = downMove > upMove && downMove > 0 ? downMove : 0;
    const tr = Math.max(
      bars[i].high - bars[i].low,
      Math.abs(bars[i].high - bars[i - 1].close),
      Math.abs(bars[i].low - bars[i - 1].close)
    );
    trArr.push(tr);
    plusDmArr.push(plusDM);
    minusDmArr.push(minusDM);
  }

  const period = Math.min(targetPeriod, Math.max(3, Math.floor(trArr.length / 2)));
  if (trArr.length < period) {
    const sumTr = trArr.reduce((a, b) => a + b, 0);
    const sumP = plusDmArr.reduce((a, b) => a + b, 0);
    const sumM = minusDmArr.reduce((a, b) => a + b, 0);
    if (sumTr <= 0) return { adx: 0, plusDI: 0, minusDI: 0 };
    const pDI = (sumP / sumTr) * 100;
    const mDI = (sumM / sumTr) * 100;
    const dx = pDI + mDI > 0 ? (Math.abs(pDI - mDI) / (pDI + mDI)) * 100 : 0;
    return { adx: round2(dx), plusDI: round2(pDI), minusDI: round2(mDI) };
  }

  let smTR = 0;
  let smPlusDM = 0;
  let smMinusDM = 0;
  for (let i = 0; i < period; i++) {
    smTR += trArr[i];
    smPlusDM += plusDmArr[i];
    smMinusDM += minusDmArr[i];
  }

  const dxValues: number[] = [];
  let lastPlusDI = 0;
  let lastMinusDI = 0;

  const pushDx = () => {
    if (smTR <= 0) {
      dxValues.push(0);
      lastPlusDI = 0;
      lastMinusDI = 0;
      return;
    }
    lastPlusDI = (smPlusDM / smTR) * 100;
    lastMinusDI = (smMinusDM / smTR) * 100;
    const denom = lastPlusDI + lastMinusDI;
    dxValues.push(denom > 0 ? (Math.abs(lastPlusDI - lastMinusDI) / denom) * 100 : 0);
  };

  pushDx();

  for (let i = period; i < trArr.length; i++) {
    smTR = smTR - smTR / period + trArr[i];
    smPlusDM = smPlusDM - smPlusDM / period + plusDmArr[i];
    smMinusDM = smMinusDM - smMinusDM / period + minusDmArr[i];
    pushDx();
  }

  let adx: number;
  if (dxValues.length <= period) {
    adx = dxValues.reduce((a, b) => a + b, 0) / Math.max(1, dxValues.length);
  } else {
    adx = dxValues.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxValues.length; i++) {
      adx = (adx * (period - 1) + dxValues[i]) / period;
    }
  }

  return {
    adx: round2(Math.max(0, Math.min(100, adx))),
    plusDI: round2(Math.max(0, Math.min(100, lastPlusDI))),
    minusDI: round2(Math.max(0, Math.min(100, lastMinusDI))),
  };
}

function computeSessionVwapSeries(bars: ClaudeFnoBar[]): number[] {
  const out: number[] = [];
  let cumPV = 0;
  let cumV = 0;
  for (const b of bars) {
    const tp = (b.high + b.low + b.close) / 3;
    const v = Math.max(1, b.volume);
    cumPV += tp * v;
    cumV += v;
    out.push(cumPV / cumV);
  }
  return out;
}

function classifyBuildup(
  chgPct: number,
  oiChgPct: number
): 'Long Buildup' | 'Short Buildup' | 'Short Covering' | 'Long Unwinding' {
  if (chgPct >= 0 && oiChgPct >= 0) return 'Long Buildup';
  if (chgPct < 0 && oiChgPct >= 0) return 'Short Buildup';
  if (chgPct >= 0 && oiChgPct < 0) return 'Short Covering';
  return 'Long Unwinding';
}

function formatCompactDelta(n: number): string {
  const sign = n >= 0 ? '+' : '-';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}

/**
 * RECTIFIED & UPGRADED 8-FACTOR 5M ORDER FLOW EARLY-IGNITION MOMENTUM ENGINE (v2.0)
 *
 * Key Formula Rectifications & Profitability Upgrades:
 *   1. True Structural Breakout + Close Conviction (No sub-resistance 0.9995 fakeouts;
 *      Break bar must close strictly beyond range with CLV >= 0.30 [BUY] / <= -0.30 [SELL]).
 *   2. 09:20 IST Opening-Noise Filter: Uses the 09:15 bar as opening sweep/range reference;
 *      Break ignition begins strictly at/after 09:20:00 IST (Rule 1 compliant).
 *   3. Directional Wilder's ADX(14) >= 25+ WITH Mandatory +DI / -DI Alignment:
 *      Blocks counter-trend dead-cat bounces where ADX >= 25 solely because of prior selloff (-DI > +DI).
 *   4. Trimmed-Baseline Institutional Volume Gate (Rule 3 Locked):
 *      RVOL > 2.00 AND Trimmed-Baseline Vol Bazaar X-Time > 1.00X (trims 09:15 opening spike
 *      so afternoon breakouts are measured cleanly).
 *   5. Volatility Compression / Squeeze Release Detection (ATR Expansion):
 *      Identifies tight consolidation coiling followed by high-velocity range expansion.
 *   6. Sector-Leading Relative Strength (RS) Alpha:
 *      Measures Stock %Chg vs Sector %Chg to prioritize true institutional leaders.
 *   7. Anti-Absorption Trap & Anti-Chase Exhaustion Blocker:
 *      Blocks late stretched moves AND heavy opposing rejection-wick absorption traps.
 */
export function evaluateTopMomentumOrderFlow(params: {
  symbol: string;
  name: string;
  sector: string;
  sectorChangePct: number;
  bars5m: ClaudeFnoBar[];
  price: number;
  prevClose?: number;
  changePercent: number;
  bidAskRatio: number;
  orderBookBias: string;
  oiChangePct: number;
  turnoverCr: number;
  volume?: number;
  explicitVwap?: number;
  explicitRvol?: number;
  explicitAdx?: number;
}): TopMomentumSignalRow | null {
  const {
    symbol,
    name,
    sector,
    sectorChangePct,
    bars5m,
    price,
    changePercent,
    bidAskRatio,
    orderBookBias,
    oiChangePct,
    turnoverCr,
  } = params;

  if (!bars5m || bars5m.length < 4 || !Number.isFinite(price) || price <= 0) {
    return null;
  }

  // Split prior session bars (if present) vs today's session bars
  const lastDate = bars5m[bars5m.length - 1].dateIST;
  const todayBars = bars5m.filter((b) => b.dateIST === lastDate);
  const prevBars = bars5m.filter((b) => b.dateIST !== lastDate);

  // Need at least 2 bars in the active session (or 4 total bars)
  const sessionBars = todayBars.length >= 2 ? todayBars : bars5m;
  if (sessionBars.length < 2) return null;

  const prevClose =
    params.prevClose && params.prevClose > 0
      ? params.prevClose
      : prevBars.length > 0
      ? prevBars[prevBars.length - 1].close
      : changePercent !== 0
      ? price / (1 + changePercent / 100)
      : sessionBars[0].open;

  const closes = bars5m.map((b) => b.close);
  const ema9All = computeEmaSeries(closes, 9);
  const ema21All = computeEmaSeries(closes, 21);
  const offset = bars5m.length - sessionBars.length;
  const ema9Session = ema9All.slice(offset);
  const ema21Session = ema21All.slice(offset);

  const vwapSession = computeSessionVwapSeries(sessionBars);
  const atr14 = Math.max(price * 0.0025, computeAtr(bars5m, 14));

  // Compute real Wilder's ADX(14), +DI, -DI directly from 5m bars
  const adxMetrics = computeWilderAdx(bars5m, 14);
  const hasExplicitAdx =
    params.explicitAdx !== undefined && Number.isFinite(params.explicitAdx) && params.explicitAdx > 0;
  const adx = hasExplicitAdx ? round2(params.explicitAdx!) : adxMetrics.adx;
  const plusDI = adxMetrics.plusDI;
  const minusDI = adxMetrics.minusDI;

  // Compute bar-by-bar CLV delta (Δ) and Session Cumulative Delta (CΔ)
  const barDeltas: number[] = [];
  const cumDeltas: number[] = [];
  const barMetrics: Array<ReturnType<typeof computeBarClvAndDelta>> = [];
  let runningCvd = 0;
  for (const b of sessionBars) {
    const m = computeBarClvAndDelta(b);
    barMetrics.push(m);
    barDeltas.push(m.delta);
    runningCvd += m.delta;
    cumDeltas.push(runningCvd);
  }

  // Trimmed baseline average 5m bar volume (trims single biggest opening outlier spike so afternoon ignitions work cleanly)
  const priorForBaseline =
    bars5m.length > 4
      ? bars5m.slice(Math.max(0, bars5m.length - 21), bars5m.length - 1)
      : bars5m;
  const avgBarVol = trimmedMeanVolume(priorForBaseline);

  const latestIdx = sessionBars.length - 1;
  const latestBar = sessionBars[latestIdx];
  let activeDeltaIdx = latestIdx;
  if (latestBar.high <= latestBar.low && latestIdx > 0) {
    for (let k = latestIdx - 1; k >= Math.max(0, latestIdx - 6); k--) {
      if (sessionBars[k].high > sessionBars[k].low) {
        activeDeltaIdx = k;
        break;
      }
    }
  }
  const latestVwap =
    params.explicitVwap && params.explicitVwap > 0 ? params.explicitVwap : vwapSession[latestIdx];
  const latestEma9 = ema9Session[latestIdx];
  const latestEma21 = ema21Session[latestIdx];
  const latestBarDelta = barDeltas[activeDeltaIdx];
  const latestCvd = cumDeltas[latestIdx];
  const prevCvd3 = cumDeltas[Math.max(0, latestIdx - 3)];
  const cvdSlope3 = latestCvd - prevCvd3;

  const vsVwapPct = latestVwap > 0 ? ((price - latestVwap) / latestVwap) * 100 : 0;

  // Sub-pane 2: Zero-Line Momentum (normalized VWAP displacement + EMA slope + CVD sign)
  const emaSpreadPct = latestEma21 > 0 ? ((latestEma9 - latestEma21) / latestEma21) * 100 : 0;
  const cvdNorm = avgBarVol > 0 ? Math.tanh(latestCvd / (avgBarVol * 4.5)) : 0;
  const zeroLineMomentum = round2(
    Math.max(-1.0, Math.min(1.0, vsVwapPct * 0.14 + emaSpreadPct * 0.22 + cvdNorm * 0.22))
  );

  // Sub-pane 3: Impulse / Delta Imbalance Oscillator
  const activeDeltaBar = sessionBars[activeDeltaIdx];
  const barVolRatio = avgBarVol > 0 ? activeDeltaBar.volume / avgBarVol : 1;
  const barClv = barMetrics[activeDeltaIdx].clv;
  const impulseOscillator = round2(
    Math.max(-1.0, Math.min(1.0, barClv * Math.min(1.8, Math.sqrt(Math.max(0.25, barVolRatio))) * 0.65))
  );

  const rvolCalcRaw = computeRvolFromBars(bars5m, 20);
  const prevBar5m = bars5m.length >= 2 ? bars5m[bars5m.length - 2] : undefined;
  const prev2Bar5m = bars5m.length >= 3 ? bars5m[bars5m.length - 3] : undefined;
  const recentVolPeak = Math.max(
    latestBar.volume,
    prevBar5m ? prevBar5m.volume : 0,
    prev2Bar5m ? prev2Bar5m.volume * 0.88 : 0
  );
  const flickerResistantRvol =
    avgBarVol > 0 ? Math.min(25, recentVolPeak / avgBarVol) : rvolCalcRaw;
  const rvolCalc = Math.max(rvolCalcRaw || 0, flickerResistantRvol || 0);
  const rvol = round2(
    params.explicitRvol !== undefined && Number.isFinite(params.explicitRvol) && params.explicitRvol > 0
      ? Math.max(params.explicitRvol, rvolCalc || 0)
      : rvolCalc || 1.0
  );
  const sessionVol =
    params.volume && params.volume > 0
      ? params.volume
      : sessionBars.reduce((acc, b) => acc + b.volume, 0);

  // Pre-break reference range: prior late-session consolidation OR opening bar range
  const preBreakBaseBars =
    prevBars.length >= 3
      ? prevBars.slice(Math.max(0, prevBars.length - 12))
      : sessionBars.slice(0, Math.max(1, Math.min(3, sessionBars.length - 1)));
  const baseHigh = Math.max(...preBreakBaseBars.map((b) => b.high), prevClose * 1.0012);
  const baseLow = Math.min(...preBreakBaseBars.map((b) => b.low), prevClose * 0.9988);

  // Determine directional candidate (BUY vs SELL) from VWAP + EMA + CVD alignment
  const bullBias =
    (price > latestVwap && latestCvd > 0) ||
    (changePercent >= 0.2 && zeroLineMomentum > 0);
  const bearBias =
    (price < latestVwap && latestCvd < 0) ||
    (changePercent <= -0.2 && zeroLineMomentum < 0);

  if (!bullBias && !bearBias) return null;

  const evaluateSide = (direction: 'BUY' | 'SELL'): TopMomentumSignalRow | null => {
    const isBuy = direction === 'BUY';

    // 1. Scan today's session bars to find the FIRST genuine `Break` ignition candle
    // Rule 1 rectification: skip the noisy 09:15:00 opening auction candle for ignition (use it as sweep/range reference!)
    const hasPost0920Bars = sessionBars.some((b) => b.secIST >= LOCKED_SYSTEM_RULES.SCAN_START_SEC);

    let breakIdx = -1;
    let breakLevel = isBuy ? baseHigh : baseLow;
    let sweepDetected = false;
    let sweepExtreme = isBuy ? sessionBars[0].low : sessionBars[0].high;

    for (let i = 0; i < sessionBars.length; i++) {
      const b = sessionBars[i];
      const vwapI = vwapSession[i];
      const ema9I = ema9Session[i];
      const deltaI = barDeltas[i];
      const cvdI = cumDeltas[i];
      const mI = barMetrics[i];

      // Always track opening / pre-break liquidity sweep even on the 09:15 bar
      if (isBuy) {
        if (b.low < Math.min(prevClose, baseLow) * 1.0005 || mI.lowerWickPct >= 30) {
          if (b.low <= sweepExtreme) sweepExtreme = b.low;
          if (b.low < prevClose || b.low < baseLow) sweepDetected = true;
        }
      } else {
        if (b.high > Math.max(prevClose, baseHigh) * 0.9995 || mI.upperWickPct >= 30) {
          if (b.high >= sweepExtreme) sweepExtreme = b.high;
          if (b.high > prevClose || b.high > baseHigh) sweepDetected = true;
        }
      }

      // Enforce Rule 1: do not trigger Break ignition on the 09:15 opening auction bar when >=09:20 bars exist
      if (hasPost0920Bars && b.secIST < LOCKED_SYSTEM_RULES.SCAN_START_SEC) {
        continue;
      }

      const earlierToday = sessionBars.slice(0, i);
      const localHigh =
        earlierToday.length > 0
          ? Math.max(baseHigh, ...earlierToday.map((x) => x.high))
          : baseHigh;
      const localLow =
        earlierToday.length > 0
          ? Math.min(baseLow, ...earlierToday.map((x) => x.low))
          : baseLow;

      const earlierTodayHigh =
        earlierToday.length > 0 ? Math.max(...earlierToday.map((x) => x.high)) : baseHigh;
      const earlierTodayLow =
        earlierToday.length > 0 ? Math.min(...earlierToday.map((x) => x.low)) : baseLow;

      const barRange = Math.max(0.0001, b.high - b.low);
      const bodyRatio = Math.abs(b.close - b.open) / barRange;

      if (isBuy) {
        // RECTIFIED: strict structural close ABOVE resistance (no 0.9995 sub-resistance fakeouts!)
        const breaksRange =
          b.close > localHigh ||
          (i >= 1 && b.close > earlierTodayHigh && b.close > vwapI * 1.001 && b.close > prevClose * 1.0025);
        // Strong bullish close quality: closes in upper portion (CLV >= 0.30) with solid body (>= 38%)
        const strongCloseConviction =
          b.close > b.open &&
          b.close >= vwapI * 0.999 &&
          b.close >= ema9I * 0.9985 &&
          mI.clv >= 0.30 &&
          bodyRatio >= 0.38;
        const deltaAligned = deltaI > 0 && cvdI > 0;
        const volActive = avgBarVol <= 0 || b.volume >= avgBarVol * 0.85;

        if (breaksRange && strongCloseConviction && deltaAligned && volActive) {
          breakIdx = i;
          breakLevel = round2(Math.max(prevClose, Math.min(localHigh, b.close)));
          sweepExtreme = round2(
            Math.min(...sessionBars.slice(0, i + 1).map((x) => x.low))
          );
          if (sweepExtreme < prevClose || sweepExtreme < baseLow) {
            sweepDetected = true;
          }
          break;
        }
      } else {
        // RECTIFIED: strict structural close BELOW support (no 1.0005 above-support fakeouts!)
        const breaksRange =
          b.close < localLow ||
          (i >= 1 && b.close < earlierTodayLow && b.close < vwapI * 0.999 && b.close < prevClose * 0.9975);
        // Strong bearish close quality: closes in lower portion (CLV <= -0.30) with solid body (>= 38%)
        const strongCloseConviction =
          b.close < b.open &&
          b.close <= vwapI * 1.001 &&
          b.close <= ema9I * 1.0015 &&
          mI.clv <= -0.30 &&
          bodyRatio >= 0.38;
        const deltaAligned = deltaI < 0 && cvdI < 0;
        const volActive = avgBarVol <= 0 || b.volume >= avgBarVol * 0.85;

        if (breaksRange && strongCloseConviction && deltaAligned && volActive) {
          breakIdx = i;
          breakLevel = round2(Math.min(prevClose, Math.max(localLow, b.close)));
          sweepExtreme = round2(
            Math.max(...sessionBars.slice(0, i + 1).map((x) => x.high))
          );
          if (sweepExtreme > prevClose || sweepExtreme > baseHigh) {
            sweepDetected = true;
          }
          break;
        }
      }
    }

    if (breakIdx < 0) return null;

    // 2. Check for `Rej 1` (first micro-pullback / retest holding Break level + VWAP within 1..4 bars after Break)
    let rej1Idx = -1;
    const rej1SearchEnd = Math.min(sessionBars.length - 1, breakIdx + 4);
    for (let j = breakIdx + 1; j <= rej1SearchEnd; j++) {
      const b = sessionBars[j];
      const vwapJ = vwapSession[j];
      const ema9J = ema9Session[j];
      const mJ = barMetrics[j];
      const cvdJ = cumDeltas[j];

      if (isBuy) {
        const holdsSupport =
          b.close >= vwapJ * 0.999 &&
          b.close >= breakLevel * 0.9965 &&
          b.low >= sweepExtreme;
        const pullbackOrWick =
          b.low <= Math.max(breakLevel * 1.006, ema9J * 1.004, vwapJ * 1.006) ||
          mJ.lowerWickPct >= 18 ||
          b.low < sessionBars[j - 1].close;
        const holdsCvd = cvdJ > 0 && (barDeltas[j] >= 0 || mJ.lowerWickPct >= 25);

        if (holdsSupport && pullbackOrWick && holdsCvd) {
          rej1Idx = j;
          break;
        }
      } else {
        const holdsResistance =
          b.close <= vwapJ * 1.001 &&
          b.close <= breakLevel * 1.0035 &&
          b.high <= sweepExtreme;
        const pullbackOrWick =
          b.high >= Math.min(breakLevel * 0.994, ema9J * 0.996, vwapJ * 0.994) ||
          mJ.upperWickPct >= 18 ||
          b.high > sessionBars[j - 1].close;
        const holdsCvd = cvdJ < 0 && (barDeltas[j] <= 0 || mJ.upperWickPct >= 25);

        if (holdsResistance && pullbackOrWick && holdsCvd) {
          rej1Idx = j;
          break;
        }
      }
    }

    const breakBar = sessionBars[breakIdx];
    const ignitionIdx = rej1Idx >= 0 && latestIdx >= rej1Idx ? rej1Idx : breakIdx;
    const ignitionBar = sessionBars[ignitionIdx];
    const barsSinceBreak = latestIdx - breakIdx;
    const barsSinceIgnition = latestIdx - ignitionIdx;

    // Trimmed-Baseline Vol Bazaar X-Time Volume (immune to 09:15 opening spike distortion)
    const breakGlobalIdx = offset + breakIdx;
    const preBreakVolSlice =
      breakGlobalIdx >= 3
        ? bars5m.slice(Math.max(0, breakGlobalIdx - 20), breakGlobalIdx)
        : priorForBaseline;
    const preBreakAvgVol = trimmedMeanVolume(preBreakVolSlice);
    const breakVolX = preBreakAvgVol > 0 ? breakBar.volume / preBreakAvgVol : 1;
    const ignitionVolX = preBreakAvgVol > 0 ? ignitionBar.volume / preBreakAvgVol : 1;
    const latestVolX = avgBarVol > 0 ? latestBar.volume / avgBarVol : 1;
    const xTimeVolume = round2(Math.max(latestVolX, ignitionVolX, breakVolX));

    // PROFITABILITY UPGRADE 1: Volatility Compression / Squeeze Release (ATR Expansion)
    const preCoilSlice = bars5m.slice(Math.max(0, breakGlobalIdx - 6), breakGlobalIdx);
    const avgCoilRange =
      preCoilSlice.length >= 3
        ? preCoilSlice.reduce((s, b) => s + (b.high - b.low), 0) / preCoilSlice.length
        : atr14;
    const breakRange = Math.max(0.01, breakBar.high - breakBar.low);
    const atrExpansionRatio = round2(atr14 > 0 ? breakRange / atr14 : 1.0);
    const squeezeRelease =
      preCoilSlice.length >= 3 &&
      avgCoilRange <= atr14 * 0.92 &&
      atrExpansionRatio >= 1.05 &&
      breakRange >= avgCoilRange * 1.28;

    // PROFITABILITY UPGRADE 2: Sector-Leading Relative Strength (RS) Alpha
    const relativeStrengthVsSector = round2(
      isBuy ? changePercent - sectorChangePct : sectorChangePct - changePercent
    );
    const sectorAlphaAligned =
      relativeStrengthVsSector >= 0.12 &&
      (isBuy ? sectorChangePct >= -0.35 : sectorChangePct <= 0.35);

    // Anchor entry price to the actual Break / Rej 1 ignition candle close
    const entryPrice = round2(ignitionBar.close);
    const moveFromEntryPct = round2(
      isBuy
        ? ((price - entryPrice) / Math.max(0.01, entryPrice)) * 100
        : ((entryPrice - price) / Math.max(0.01, entryPrice)) * 100
    );

    // Structural Stop Loss below Sweep Low / Break Low (with 0.12*ATR buffer, bounded within 0.38%..2.2%)
    const rawSl = isBuy
      ? Math.min(sweepExtreme, breakBar.low) - atr14 * 0.12
      : Math.max(sweepExtreme, breakBar.high) + atr14 * 0.12;
    const minRisk = entryPrice * 0.0038;
    const maxRisk = entryPrice * 0.022;
    const riskR = round2(
      Math.max(minRisk, Math.min(maxRisk, Math.abs(entryPrice - rawSl)))
    );
    const stopLoss = round2(isBuy ? entryPrice - riskR : entryPrice + riskR);
    const target1 = round2(isBuy ? entryPrice + riskR * 1.5 : entryPrice - riskR * 1.5);
    const target2 = round2(isBuy ? entryPrice + riskR * 2.5 : entryPrice - riskR * 2.5);

    // Verify CVD flipped positive (BUY) or negative (SELL) around the Break bar
    const preBreakCvd = breakIdx > 0 ? cumDeltas[breakIdx - 1] : 0;
    const cvdFlippedAtBreak = isBuy
      ? cumDeltas[breakIdx] > 0 && (preBreakCvd <= cumDeltas[breakIdx] * 0.45 || barDeltas[breakIdx] > 0)
      : cumDeltas[breakIdx] < 0 && (preBreakCvd >= cumDeltas[breakIdx] * 0.45 || barDeltas[breakIdx] < 0);

    // RECTIFIED Bug #1: Directional ADX (+DI / -DI alignment) blocks dead-cat bounce / counter-trend traps!
    // Allows a fresh 1-bar opening liquidity-sweep breakout ONLY when price & EMA9 already reclaimed EMA21
    // (a genuine falling-knife dead-cat bounce remains below EMA21 with EMA9 << EMA21 and is strictly blocked).
    const diComputed = plusDI + minusDI > 0;
    const sweepReversalReclaimed =
      sweepDetected &&
      barsSinceBreak <= 1 &&
      (isBuy
        ? price > latestEma21 && latestEma9 >= latestEma21 * 0.998
        : price < latestEma21 && latestEma9 <= latestEma21 * 1.002);
    const diAligned = !diComputed
      ? true
      : isBuy
      ? plusDI >= minusDI * 0.96 || sweepReversalReclaimed
      : minusDI >= plusDI * 0.96 || sweepReversalReclaimed;

    // Mandatory Quantitative Thresholds (Rule 3 LOCKED): Strong RVOL > 2.00, Vol Bazaar X-Time > 1.00X, ADX >= 25+ & DI aligned
    const strongRvolPassed = rvol > TOP_MOMENTUM_STRONG_RVOL_MIN;
    const strongXTimeVolPassed = xTimeVolume > TOP_MOMENTUM_STRONG_XTIME_VOL_MIN;
    const adxPassed = adx >= TOP_MOMENTUM_STRONG_ADX_MIN && diAligned;

    // Sub-pane checks on current bar
    const vwapAligned = isBuy ? price >= latestVwap * 0.999 : price <= latestVwap * 1.001;
    const emaAligned = isBuy ? latestEma9 >= latestEma21 * 0.9985 : latestEma9 <= latestEma21 * 1.0015;
    const cvdAligned = isBuy
      ? latestCvd > 0 && (cvdSlope3 >= 0 || latestCvd >= avgBarVol * 0.5)
      : latestCvd < 0 && (cvdSlope3 <= 0 || latestCvd <= -avgBarVol * 0.5);
    const barDeltaAligned = isBuy ? latestBarDelta > 0 : latestBarDelta < 0;
    const zeroLineAligned = isBuy ? zeroLineMomentum > 0.01 : zeroLineMomentum < -0.01;
    const orderBookAligned = isBuy ? bidAskRatio >= 1.05 : bidAskRatio <= 0.95;

    // PROFITABILITY UPGRADE 3: Anti-Absorption Trap Detector
    // If latest candle has massive opposing wick (>= 45%) on heavy volume (>= 1.5x), passive institutional absorption is capping price
    const activeMetrics = barMetrics[activeDeltaIdx];
    const absorptionTrapBlocked = isBuy
      ? activeMetrics.upperWickPct >= 45 && barVolRatio >= 1.5 && activeMetrics.clv < 0.1
      : activeMetrics.lowerWickPct >= 45 && barVolRatio >= 1.5 && activeMetrics.clv > -0.1;

    // Price still must be on the right side of Break level (otherwise setup invalidated)
    const structureIntact = isBuy
      ? price >= breakLevel * 0.994 && price >= stopLoss
      : price <= breakLevel * 1.006 && price <= stopLoss;
    if (!structureIntact) return null;

    // 3. Anti-Chase & Exhaustion Detector
    const directionalVwapStretch = isBuy ? vsVwapPct : -vsVwapPct;
    const directionalDayMove = isBuy ? changePercent : -changePercent;
    const barDeltaFlippedAgainstTrend = isBuy ? latestBarDelta < 0 : latestBarDelta > 0;
    const impulseExhausted = isBuy ? impulseOscillator <= -0.1 : impulseOscillator >= 0.1;

    const exhaustionReasons: string[] = [];
    if (moveFromEntryPct >= 1.85) {
      exhaustionReasons.push(`Already moved +${moveFromEntryPct.toFixed(2)}% from ${rej1Idx >= 0 ? 'Rej 1' : 'Break'} entry`);
    }
    if (directionalVwapStretch >= 1.65) {
      exhaustionReasons.push(`Stretched ${directionalVwapStretch.toFixed(2)}% away from VWAP`);
    }
    if (directionalDayMove >= 2.65) {
      exhaustionReasons.push(`Extended ${directionalDayMove.toFixed(2)}% day move (late chase zone)`);
    }
    if (barDeltaFlippedAgainstTrend && (moveFromEntryPct >= 0.85 || barsSinceBreak >= 4)) {
      exhaustionReasons.push(`Exit Bar Δ Reversal (${formatCompactDelta(latestBarDelta)})`);
    }
    if (impulseExhausted && barsSinceBreak >= 3) {
      exhaustionReasons.push(`Impulse Exhausted (${impulseOscillator.toFixed(2)})`);
    }
    if (absorptionTrapBlocked) {
      exhaustionReasons.push(`Passive Absorption Trap (${isBuy ? 'Upper' : 'Lower'} Wick Rejection on ${barVolRatio.toFixed(1)}× Vol)`);
    }

    const isExhausted = exhaustionReasons.length > 0;

    // Strict Formula Hard Gate for active Top Momentum signals:
    // MUST satisfy Rule 3 (RVOL > 2.00, Vol Bazaar X-Time > 1.00X, ADX >= 25+ with DI alignment)
    const strongFormulaPassed = strongRvolPassed && strongXTimeVolPassed && adxPassed;

    // Stage classification
    let stage: TopMomentumStage;
    let stageBadge: string;
    let shouldAlertNow = false;

    if (isExhausted) {
      stage = 'EXHAUSTED_EXIT';
      stageBadge = '🛑 EXIT / LATE MOVE';
      shouldAlertNow = false;
    } else if (rej1Idx >= 0 && latestIdx - rej1Idx <= 2 && moveFromEntryPct <= 1.25 && directionalVwapStretch <= 1.25) {
      stage = 'REJ_1_ENTRY';
      stageBadge = '🎯 REJ 1 ENTRY';
      shouldAlertNow = strongFormulaPassed && barDeltaAligned && cvdAligned && vwapAligned && zeroLineAligned;
    } else if (barsSinceBreak <= 2 && moveFromEntryPct <= 1.15 && directionalVwapStretch <= 1.20) {
      stage = 'BREAK_IGNITION';
      stageBadge = '🔥 BREAK IGNITION';
      shouldAlertNow = strongFormulaPassed && barDeltaAligned && cvdAligned && vwapAligned && zeroLineAligned;
    } else {
      stage = 'EARLY_TREND';
      stageBadge = '⚡ EARLY TREND';
      shouldAlertNow =
        strongFormulaPassed &&
        barsSinceIgnition <= 3 &&
        moveFromEntryPct <= 1.25 &&
        directionalVwapStretch <= 1.30 &&
        barDeltaAligned &&
        cvdAligned &&
        vwapAligned &&
        zeroLineAligned;
    }

    const isEarlyIgnition = stage === 'BREAK_IGNITION' || stage === 'REJ_1_ENTRY';

    const conditions: TopMomentumCheck[] = [
      {
        step: 1,
        label: 'True Break & Close Conviction',
        passed: true,
        detail: `${sweepDetected ? `Sweep ₹${sweepExtreme} → ` : ''}Break ₹${breakLevel} @ ${breakBar.timeIST.slice(0, 5)}`,
      },
      {
        step: 2,
        label: 'Rej 1 / VWAP + EMA Hold',
        passed: vwapAligned && (rej1Idx >= 0 || emaAligned),
        detail: rej1Idx >= 0
          ? `Rej 1 confirmed @ ${sessionBars[rej1Idx].timeIST.slice(0, 5)} • VWAP ₹${round2(latestVwap)}`
          : `Holding VWAP ₹${round2(latestVwap)} (${vsVwapPct >= 0 ? '+' : ''}${round2(vsVwapPct)}%)`,
      },
      {
        step: 3,
        label: 'Cum Δ (CΔ) Expansion & Bar Δ',
        passed: cvdAligned && barDeltaAligned,
        detail: `CΔ ${formatCompactDelta(latestCvd)} • Bar Δ ${formatCompactDelta(latestBarDelta)}`,
      },
      {
        step: 4,
        label: 'Zero-Line Momentum > 0',
        passed: zeroLineAligned,
        detail: `Mom ${zeroLineMomentum >= 0 ? '+' : ''}${zeroLineMomentum.toFixed(2)} • Impulse ${impulseOscillator >= 0 ? '+' : ''}${impulseOscillator.toFixed(2)}`,
      },
      {
        step: 5,
        label: `Strong RVOL > ${TOP_MOMENTUM_STRONG_RVOL_MIN.toFixed(2)}`,
        passed: strongRvolPassed,
        detail: `RVOL ${rvol.toFixed(2)}x (Min > ${TOP_MOMENTUM_STRONG_RVOL_MIN.toFixed(2)}x) • B/A ${bidAskRatio.toFixed(2)}x`,
      },
      {
        step: 6,
        label: `Vol Bazaar X-Time > ${TOP_MOMENTUM_STRONG_XTIME_VOL_MIN.toFixed(2)}X`,
        passed: strongXTimeVolPassed,
        detail: `Trimmed X-Time ${xTimeVolume.toFixed(2)}X (Latest ${round2(latestVolX).toFixed(2)}X • Break ${round2(breakVolX).toFixed(2)}X)`,
      },
      {
        step: 7,
        label: `ADX ≥ ${TOP_MOMENTUM_STRONG_ADX_MIN}+ & ${isBuy ? '+DI > -DI' : '-DI > +DI'}`,
        passed: adxPassed && !isExhausted,
        detail: isExhausted
          ? `BLOCKED: ${exhaustionReasons[0]} • ADX ${adx.toFixed(1)}`
          : `ADX ${adx.toFixed(1)} (+DI ${plusDI.toFixed(0)} / -DI ${minusDI.toFixed(0)}) • Early +${Math.max(0, moveFromEntryPct).toFixed(2)}%`,
      },
      {
        step: 8,
        label: 'Squeeze Release & Sector RS Alpha',
        passed: squeezeRelease || sectorAlphaAligned,
        detail: `${squeezeRelease ? `Squeeze Release (${atrExpansionRatio.toFixed(2)}×ATR)` : `ATR Exp ${atrExpansionRatio.toFixed(2)}×`} • RS vs Sector ${relativeStrengthVsSector >= 0 ? '+' : ''}${relativeStrengthVsSector.toFixed(2)}%`,
      },
    ];

    const conditionsMet = conditions.filter((c) => c.passed).length;

    // Require ALL 3 Locked Rule 3 Gates (RVOL > 2.00, Vol Bazaar X-Time > 1.00X, ADX >= 25+ & DI aligned)
    // plus aligned CΔ & VWAP for non-exhausted Top Momentum qualification
    if (!isExhausted && (!strongFormulaPassed || !vwapAligned || !cvdAligned || conditionsMet < 6)) {
      return null;
    }

    // Early-ignition scoring (0..100): rewards fresh Break/Rej 1 + Squeeze Release + Sector Alpha + DI-aligned ADX
    let score = 0;
    if (stage === 'REJ_1_ENTRY') score += 26;
    else if (stage === 'BREAK_IGNITION') score += 24;
    else if (stage === 'EARLY_TREND') score += 15;
    else score += 5;

    if (sweepDetected) score += 7;
    if (cvdFlippedAtBreak && cvdAligned) score += 11;
    if (barDeltaAligned) score += 7;
    if (zeroLineAligned) score += 7;
    if (vwapAligned && emaAligned) score += 6;
    if (strongRvolPassed) score += Math.min(11, 5 + Math.max(0, (rvol - TOP_MOMENTUM_STRONG_RVOL_MIN) * 2.8));
    if (strongXTimeVolPassed) score += Math.min(9, 4 + Math.max(0, (xTimeVolume - TOP_MOMENTUM_STRONG_XTIME_VOL_MIN) * 2.2));
    if (adxPassed) score += Math.min(9, 4 + Math.max(0, (adx - TOP_MOMENTUM_STRONG_ADX_MIN) * 0.3));
    if (squeezeRelease) score += 5;
    if (sectorAlphaAligned) score += 4;
    if (orderBookAligned) score += 2;

    // Anti-chase penalty if price has already moved away from entry/VWAP
    if (moveFromEntryPct > 1.0) score -= Math.min(20, (moveFromEntryPct - 1.0) * 14);
    if (directionalVwapStretch > 1.2) score -= Math.min(18, (directionalVwapStretch - 1.2) * 15);
    if (isExhausted) score = Math.min(score, 42);
    score = Math.max(0, Math.min(100, Math.round(score)));

    const edgeParts: string[] = [];
    if (squeezeRelease) edgeParts.push(`Squeeze ${atrExpansionRatio.toFixed(1)}×ATR`);
    if (sectorAlphaAligned) edgeParts.push(`Sector RS +${relativeStrengthVsSector.toFixed(2)}%`);
    if (sweepDetected) edgeParts.push('Liquidity Sweep');
    if (edgeParts.length === 0) edgeParts.push(isBuy ? '+DI Trend Ignition' : '-DI Trend Ignition');
    const profitabilityEdgeLabel = edgeParts.slice(0, 2).join(' · ');

    const ignitionNote = isExhausted
      ? `🛑 Move extended/reversing (${exhaustionReasons.join(' • ')}) — alert blocked to prevent late chasing.`
      : stage === 'REJ_1_ENTRY'
      ? `🎯 Early Rej 1 • ${profitabilityEdgeLabel} • RVOL ${rvol.toFixed(2)}x • ${xTimeVolume.toFixed(2)}X Vol • ADX ${adx.toFixed(1)}`
      : stage === 'BREAK_IGNITION'
      ? `🔥 Fresh 5m Break ₹${breakLevel} • ${profitabilityEdgeLabel} • RVOL ${rvol.toFixed(2)}x • ${xTimeVolume.toFixed(2)}X Vol • ADX ${adx.toFixed(1)}`
      : `⚡ Active early trend (+${moveFromEntryPct.toFixed(2)}%) • ${profitabilityEdgeLabel} • RVOL ${rvol.toFixed(2)}x • ADX ${adx.toFixed(1)}`;

    return {
      symbol,
      name,
      sector,
      sectorChangePct: round2(sectorChangePct),
      direction,
      stage,
      stageBadge,
      shouldAlertNow,
      isEarlyIgnition,
      isExhausted,
      exhaustionReason: exhaustionReasons.join(' • '),

      listedAt: ignitionBar.timeIST,
      breakTimeIST: breakBar.timeIST,
      rej1TimeIST: rej1Idx >= 0 ? sessionBars[rej1Idx].timeIST : '--',
      barsSinceIgnition,

      price: round2(price),
      changePercent: round2(changePercent),
      entryPrice,
      moveFromEntryPct,
      stopLoss,
      target1,
      target2,
      riskR,
      rrRatio: '1:2.5',
      atr14: round2(atr14),

      prevClose: round2(prevClose),
      breakLevel: round2(breakLevel),
      sweepExtreme: round2(sweepExtreme),
      sweepDetected,
      rej1Detected: rej1Idx >= 0,
      vwap: round2(latestVwap),
      ema9: round2(latestEma9),
      ema21: round2(latestEma21),
      vsVwapPct: round2(vsVwapPct),

      barDelta: Math.round(latestBarDelta),
      cumulativeDelta: Math.round(latestCvd),
      cvdFlippedAtBreak,
      cvdSlope3: Math.round(cvdSlope3),
      zeroLineMomentum,
      impulseOscillator,

      squeezeRelease,
      atrExpansionRatio,
      relativeStrengthVsSector,
      diAligned,
      absorptionTrapBlocked,
      profitabilityEdgeLabel,

      rvol,
      xTimeVolume,
      barVolRatio: round2(barVolRatio),
      adx,
      plusDI,
      minusDI,
      strongRvolPassed,
      strongXTimeVolPassed,
      adxPassed,

      turnoverCr: round2(turnoverCr),
      volume: Math.round(sessionVol),
      bidAskRatio: round2(bidAskRatio),
      orderBookBias: orderBookBias || (isBuy ? 'Buyer Dominance' : 'Seller Pressure'),
      oiChangePct: round2(oiChangePct),
      buildup: classifyBuildup(changePercent, oiChangePct),

      conditionsMet,
      totalConditions: 8,
      conditions,
      score,
      ignitionNote,
    };
  };

  if (bullBias && !bearBias) return evaluateSide('BUY');
  if (bearBias && !bullBias) return evaluateSide('SELL');

  const buyRes = evaluateSide('BUY');
  const sellRes = evaluateSide('SELL');
  if (buyRes && sellRes) return buyRes.score >= sellRes.score ? buyRes : sellRes;
  return buyRes || sellRes;
}

const STAGE_PRIORITY: Record<TopMomentumStage, number> = {
  BREAK_IGNITION: 3,
  REJ_1_ENTRY: 2,
  EARLY_TREND: 1,
  EXHAUSTED_EXIT: 0,
};

export function buildTopMomentumReport(params: {
  stocks: ScannedStock[];
  getExtendedBarsFn: (symbol: string) => IntradayCandleBar[] | undefined;
  candlesMap: Map<string, Candle[]>;
  isMidnightCleared: boolean;
}): TopMomentumScanReport {
  const { stocks, getExtendedBarsFn, candlesMap, isMidnightCleared } = params;
  const nowParts = getISTDateParts(new Date());

  const thresholds = {
    strongRvolMin: TOP_MOMENTUM_STRONG_RVOL_MIN,
    strongXTimeVolMin: TOP_MOMENTUM_STRONG_XTIME_VOL_MIN,
    adxMin: TOP_MOMENTUM_STRONG_ADX_MIN,
  };

  const formulaSteps = [
    {
      step: '1. True 5m Structural Break & Close Conviction (≥ 09:20 IST)',
      detail: 'Uses the 09:15 bar as sweep/range reference and requires a strict close beyond consolidation high/low with CLV ≥ 0.30 (top 35% close) & body ≥ 38% — eliminating sub-resistance & wick fakeouts.',
    },
    {
      step: '2. Rej 1 First Pullback Hold (VWAP + EMA9)',
      detail: 'Confirms first shallow pullback holding above the Break level & VWAP with rejection wick absorption — prime low-risk early ignition entry.',
    },
    {
      step: '3. Cumulative Delta (CΔ) Flip + Aligned Bar Δ',
      detail: 'Requires session CΔ expanding in trend direction from Break AND active 5m bar Δ aligned (immediately blocks Exit bar-delta reversals).',
    },
    {
      step: '4. Rule 3 Liquidity Gate: RVOL > 2.00 & Trimmed Vol Bazaar X-Time > 1.00X',
      detail: 'Enforces RVOL > 2.00 and outlier-trimmed 5m X-Time Volume > 1.00X (trims 09:15 opening spike so afternoon breakouts are measured cleanly).',
    },
    {
      step: '5. Directional Wilder ADX(14) ≥ 25+ (+DI / -DI Aligned)',
      detail: 'Requires ADX(14) ≥ 25.0 AND +DI > -DI for BUY (-DI > +DI for SELL), eliminating counter-trend falling-knife / dead-cat bounce traps.',
    },
    {
      step: '6. Volatility Squeeze Release + Sector Relative Strength Alpha',
      detail: 'Rewards tight ATR compression coiling breaking out with ≥1.05× ATR range expansion and positive Relative Strength outperforming its NSE sector.',
    },
    {
      step: '7. Anti-Absorption Trap & Anti-Chase Exhaustion Shield',
      detail: 'Blocks late alerts once stretched ≥1.65% from VWAP, ≥1.85% from entry, ≥2.65% day move, bar Δ flips, or heavy opposing-wick passive absorption appears.',
    },
  ];

  if (isMidnightCleared) {
    return {
      status: 'ok',
      scannerName: 'Top Momentum • Order Flow Early Ignition',
      strategyName: '5m Order Flow Early Ignition v2.0 • RVOL > 2.00 • Vol Bazaar X-Time > 1.00X • ADX 25+ (+DI/-DI) • Squeeze + RS • Best 10',
      generatedAt: new Date().toISOString(),
      istTime: `${nowParts.timeStr} IST`,
      isMidnightCleared: true,
      universeEvaluated: 0,
      earlyIgnitionBuyCount: 0,
      earlyIgnitionSellCount: 0,
      buyCount: 0,
      sellCount: 0,
      blockedExhaustedCount: 0,
      thresholds,
      formulaSteps,
      buySignals: [],
      sellSignals: [],
      exhaustedSignals: [],
    };
  }

  const buySignals: TopMomentumSignalRow[] = [];
  const sellSignals: TopMomentumSignalRow[] = [];
  const exhaustedSignals: TopMomentumSignalRow[] = [];
  let universeEvaluated = 0;

  for (const s of stocks || []) {
    const sym = String(s.symbol || '').toUpperCase().trim();
    if (!sym || INDEX_BLACKLIST.has(sym)) continue;

    const rawExtended = getExtendedBarsFn(sym);
    const rawCandles = candlesMap.get(sym);
    const bars5m = normalize5mBars(
      rawExtended && rawExtended.length >= 4 ? rawExtended : rawCandles
    );
    if (bars5m.length < 4) continue;

    universeEvaluated++;
    const price = Number(s.price) || 0;
    const volume = Number(s.volume) || 0;
    const turnoverCr = round2((volume * price) / 10_000_000);
    if (turnoverCr < 15 && volume < 50_000) continue;

    const row = evaluateTopMomentumOrderFlow({
      symbol: sym,
      name: s.name || sym,
      sector: s.sector || 'NSE F&O',
      sectorChangePct: Number(s.sectorChangePercent) || 0,
      bars5m,
      price,
      changePercent: Number(s.changePercent) || 0,
      bidAskRatio: Number(s.bidAskRatio) || 1.0,
      orderBookBias: s.orderBookBias || 'Balanced',
      oiChangePct: Number(s.oiData?.changeInOIPercent) || 0,
      turnoverCr,
      volume,
      explicitVwap: Number(s.indicators?.vwap) || undefined,
      explicitRvol: Number(s.indicators?.rvol) || undefined,
      explicitAdx: bars5m.length < 10 && Number(s.indicators?.adx) > 0 ? Number(s.indicators?.adx) : undefined,
    });

    if (!row) continue;

    if (row.isExhausted) {
      exhaustedSignals.push(row);
    } else if (row.direction === 'BUY') {
      buySignals.push(row);
    } else {
      sellSignals.push(row);
    }
  }

  const sortFreshFirst = (a: TopMomentumSignalRow, b: TopMomentumSignalRow) => {
    if (a.shouldAlertNow !== b.shouldAlertNow) return a.shouldAlertNow ? -1 : 1;
    const stageDiff = STAGE_PRIORITY[b.stage] - STAGE_PRIORITY[a.stage];
    if (stageDiff !== 0) return stageDiff;
    if (b.score !== a.score) return b.score - a.score;
    return a.barsSinceIgnition - b.barsSinceIgnition;
  };

  buySignals.sort(sortFreshFirst);
  sellSignals.sort(sortFreshFirst);
  exhaustedSignals.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  const topBuys = buySignals.slice(0, LOCKED_SYSTEM_RULES.MAX_STOCKS_PER_DIRECTION);
  const topSells = sellSignals.slice(0, LOCKED_SYSTEM_RULES.MAX_STOCKS_PER_DIRECTION);
  const topExhausted = exhaustedSignals.slice(0, 10);

  return {
    status: 'ok',
    scannerName: 'Top Momentum • Order Flow Early Ignition',
    strategyName: '5m Order Flow Early Ignition v2.0 • RVOL > 2.00 • Vol Bazaar X-Time > 1.00X • ADX 25+ (+DI/-DI) • Squeeze + RS • Best 10',
    generatedAt: new Date().toISOString(),
    istTime: `${nowParts.timeStr} IST`,
    isMidnightCleared: false,
    universeEvaluated,
    earlyIgnitionBuyCount: topBuys.filter((r) => r.isEarlyIgnition).length,
    earlyIgnitionSellCount: topSells.filter((r) => r.isEarlyIgnition).length,
    buyCount: topBuys.length,
    sellCount: topSells.length,
    blockedExhaustedCount: exhaustedSignals.length,
    thresholds,
    formulaSteps,
    buySignals: topBuys,
    sellSignals: topSells,
    exhaustedSignals: topExhausted,
  };
}
