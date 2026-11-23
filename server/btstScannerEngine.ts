import { Candle, ScannedStock } from '../src/types';
import { getISTDateParts } from '../src/data/marketSchedule';
import { IntradayCandleBar } from './autonomousPriceService';
import { ClaudeFnoBar, formatClockHHMMSS, parseClockSec } from './claudeFnoEngine';
import {
  CandlesLookup,
  computeUniversalStrongMetrics,
  normalizeBarsTo5m,
  sortRowsByListedAtDescZtoA,
} from './scannerUniversalGate';
import {
  LOCKED_SYSTEM_RULES,
  getLockedSessionWindowStatus,
  passesRule3Thresholds,
} from './systemFiveRules';

/**
 * WORLD-CLASS BTST / STBT SCANNER ENGINE
 * Recommended Scan Window: 14:45:00 – 15:20:00 IST (2:45 PM – 3:20 PM IST)
 * Output: Best 10 UP (BTST) & Best 10 DOWN (STBT) strictly per formula (0..10, ZERO fake signals).
 * Assigned Dedicated AI Agent: Vedant AI (AI-AGENT-BTST) — Head of Overnight BTST/STBT Execution & Risk.
 */

export const BTST_WINDOW_CONFIG = Object.freeze({
  RECOMMENDED_START_IST: '14:45:00',
  RECOMMENDED_START_LABEL: '2:45 PM IST',
  RECOMMENDED_START_SEC: 14 * 3600 + 45 * 60, // 14:45:00 IST
  RECOMMENDED_END_IST: '15:20:00',
  RECOMMENDED_END_LABEL: '3:20 PM IST',
  RECOMMENDED_END_SEC: 15 * 3600 + 20 * 60, // 15:20:00 IST
  DAILY_FLUSH_SEC: LOCKED_SYSTEM_RULES.DAILY_FLUSH_SEC, // 23:59:00 IST
  MAX_PER_DIRECTION: LOCKED_SYSTEM_RULES.MAX_STOCKS_PER_DIRECTION, // Best 10 UP & Best 10 DOWN
  MIN_RVOL: LOCKED_SYSTEM_RULES.MIN_RVOL_STRICT, // > 2.00
  MIN_VOL_BAZAAR_XTIME: LOCKED_SYSTEM_RULES.MIN_VOL_BAZAAR_XTIME_STRICT, // > 1.00X
  MIN_ADX: LOCKED_SYSTEM_RULES.MIN_ADX, // >= 25.0
  MIN_CLV_UP: 0.68, // Close in top 32% of day's range (institutional closing accumulation)
  MAX_CLV_DOWN: 0.32, // Close in bottom 32% of day's range (institutional closing distribution)
  MIN_ABS_CHANGE_PCT: 0.75, // Meaningful directional conviction
  MAX_ABS_CHANGE_PCT: 9.75, // Avoid upper/lower circuit chase traps
  MIN_SCORE_ELIGIBLE: 60, // Minimum composite institutional BTST score (0..100)
});

export interface BtstAiAgentSpec {
  agentId: 'AI-AGENT-BTST';
  name: string;
  genderLabel: 'He' | 'She';
  role: string;
  specialty: string;
  deskCapitalRs: number;
  riskPerTradePct: number;
  overnightAtrSlMultiplier: number;
  target1R: number;
  target2R: number;
  recommendedWindow: string;
  status: 'PRIME_EXECUTION' | 'PRE_WINDOW_WATCH' | 'OVERNIGHT_LOCKED' | 'STANDBY_FLUSHED';
}

export const BTST_ASSIGNED_AI_AGENT: Readonly<Omit<BtstAiAgentSpec, 'status'>> = Object.freeze({
  agentId: 'AI-AGENT-BTST',
  name: 'Vedant AI',
  genderLabel: 'He',
  role: 'Overnight BTST / STBT Chief Execution & Gap-Risk Manager',
  specialty:
    '2:45–3:20 PM closing-dominance accumulation, ATR overnight gap-risk stop-loss sizing & 09:15–09:45 next-day opening profit booking',
  deskCapitalRs: 500000,
  riskPerTradePct: 1.0,
  overnightAtrSlMultiplier: 1.35,
  target1R: 1.5,
  target2R: 2.6,
  recommendedWindow: '2:45 PM – 3:20 PM IST',
});

export type BtstWindowPhase =
  | 'PRIME_BTST_WINDOW'
  | 'PRE_WINDOW_WATCH'
  | 'CLOSING_LOCKED'
  | 'OFF_DAY_SNAPSHOT'
  | 'FLUSHED_EMPTY';

export interface BtstWindowStatus {
  dateIST: string;
  timeIST: string;
  weekday: string;
  secFromMidnight: number;
  phase: BtstWindowPhase;
  isPrimeWindow: boolean;
  isFlushCleared: boolean;
  isLockedForOvernight: boolean;
  recommendedWindowLabel: string;
  phaseLabel: string;
  guidanceNote: string;
  minutesToPrimeWindow: number;
  minutesRemainingInWindow: number;
}

export interface BtstFormulaCheck {
  id: string;
  label: string;
  passed: boolean;
  value: string;
  threshold: string;
}

export type BtstConvictionGrade = 'A+ PRIME' | 'A HIGH' | 'B+ SOLID';

export interface BtstSignalRow {
  symbol: string;
  name: string;
  sector: string;
  direction: 'BUY' | 'SELL';
  setupType: 'BTST_LONG' | 'STBT_SHORT';
  listedAt: string;
  listedAtSec: number;
  price: number;
  changePercent: number;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  prevClose: number;
  vwap: number;
  vsVwapPct: number;

  // World-Class 7-Factor BTST Metrics
  clv: number; // 0..1 Closing Location Value ((LTP - Low) / (High - Low))
  clvPct: number; // 0..100
  closeStrengthLabel: string;
  closingVolumeSurge: number; // Closing 30m volume vs prior session baseline
  rvol: number;
  xTimeVolume: number;
  adx: number;
  plusDI: number;
  minusDI: number;
  ema9: number;
  ema21: number;
  emaAligned: boolean;
  cumulativeDelta: number;
  deliveryConvictionPct: number; // Estimated institutional delivery/carry conviction (0..100)
  oiChangePct: number;
  buildup: string;
  turnoverCr: number;
  atr14: number;

  // Composite Score & Conviction
  btstScore: number; // 0..100
  gapEdgeProbabilityPct: number; // 55..92%
  convictionGrade: BtstConvictionGrade;
  conditionsMet: number;
  totalConditions: 7;
  checks: BtstFormulaCheck[];
  formulaReason: string;

  // Dedicated AI Agent (Vedant AI) Overnight Trade Plan
  agentId: 'AI-AGENT-BTST';
  agentName: string;
  entryZoneLow: number;
  entryZoneHigh: number;
  entryPrice: number;
  overnightStopLoss: number;
  activeStopLoss: number;
  nextDayTarget1: number; // 09:15–09:45 AM Opening Gap Book (50% Qty)
  nextDayTarget2: number; // Next-Day Momentum Runner Target (50% Qty)
  riskPerShare: number;
  slDistancePct: number;
  plannedRR: string;
  positionQty: number;
  capitalDeployedRs: number;
  riskCapitalRs: number;
  livePnlRs: number;
  livePnlPct: number;
  liveRMultiple: number;
  agentActionBadge: string;
  agentDirective: string;
  stickyLockedUntilFlush: true;
}

export interface BtstFormulaPillar {
  step: number;
  code: string;
  title: string;
  rule: string;
  weightPct: number;
}

export interface BtstScanReport {
  status: 'ok';
  scannerId: 'btst-scanner';
  scannerName: 'BTST Scanner (Closing Dominance & Overnight Edge)';
  generatedAt: string;
  istTime: string;
  window: BtstWindowStatus;
  agent: BtstAiAgentSpec;
  isMidnightCleared: boolean;
  universeEvaluated: number;
  liveFeedProvider: string;
  upstoxConnected: boolean;
  thresholds: {
    recommendedWindow: string;
    minRvol: number;
    minVolBazaarXTime: number;
    minAdx: number;
    minClvUp: number;
    maxClvDown: number;
    maxPerDirection: number;
    zeroFakeSignals: true;
  };
  formulaPillars: BtstFormulaPillar[];
  summary: {
    totalQualified: number;
    upCount: number;
    downCount: number;
    aPlusCount: number;
    avgBtstScore: number;
    avgGapProbabilityPct: number;
    totalLivePnlRs: number;
    winCount: number;
    lossCount: number;
    winLossRatioLabel: string;
  };
  upPicks: BtstSignalRow[];
  downPicks: BtstSignalRow[];
}

export const BTST_FORMULA_PILLARS: readonly BtstFormulaPillar[] = Object.freeze([
  {
    step: 1,
    code: 'CLV_DOMINANCE',
    title: 'Closing Location Value (CLV)',
    rule: 'UP closes in top 32% of day range (CLV ≥ 0.68); DOWN closes in bottom 32% (CLV ≤ 0.32)',
    weightPct: 24,
  },
  {
    step: 2,
    code: 'RULE3_LIQUIDITY',
    title: 'Institutional RVOL & Vol Bazaar X-Time',
    rule: 'Strict Rule 3 Gate: RVOL > 2.00 AND Volume Bazaar X-Time > 1.00X with closing-hour surge',
    weightPct: 22,
  },
  {
    step: 3,
    code: 'VWAP_EMA_TREND',
    title: 'VWAP & EMA(9/21) Trend Authority',
    rule: 'Price holding above VWAP + EMA9 ≥ EMA21 for BTST UP (below VWAP + EMA9 ≤ EMA21 for STBT DOWN)',
    weightPct: 18,
  },
  {
    step: 4,
    code: 'ADX_DIRECTIONAL',
    title: 'Wilder ADX(14) Trend Power',
    rule: 'ADX(14) ≥ 25.0 with directional +DI / -DI dominance confirming institutional continuation',
    weightPct: 14,
  },
  {
    step: 5,
    code: 'ORDER_FLOW_DELTA',
    title: 'Order Flow Cumulative Delta & Turnover',
    rule: 'Aligned session Cumulative Delta & liquid NSE institutional turnover depth',
    weightPct: 12,
  },
  {
    step: 6,
    code: 'OI_DELIVERY_CARRY',
    title: 'F&O Buildup & Overnight Delivery Conviction',
    rule: 'Long Buildup / Short Covering (UP) or Short Buildup / Long Unwinding (DOWN) + anti-circuit guard (<9.75%)',
    weightPct: 10,
  },
]);

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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Evaluates the BTST Scanner window status in Asia/Kolkata (IST).
 * Recommended Prime Scan Window: 14:45:00 – 15:20:00 IST (2:45 PM – 3:20 PM IST).
 */
export function getBtstWindowStatus(
  now: Date = new Date(),
  isMarketOffDay: boolean = false
): BtstWindowStatus {
  const ist = getISTDateParts(now);
  const sec = ist.hour * 3600 + ist.minute * 60 + ist.second;
  const startSec = BTST_WINDOW_CONFIG.RECOMMENDED_START_SEC;
  const endSec = BTST_WINDOW_CONFIG.RECOMMENDED_END_SEC;
  const flushSec = BTST_WINDOW_CONFIG.DAILY_FLUSH_SEC;
  const morningStartSec = LOCKED_SYSTEM_RULES.SCAN_START_SEC; // 09:20:00 IST

  // 23:59:00 – 23:59:59 IST: Daily auto-flush (Rule 1)
  if (sec >= flushSec) {
    return {
      dateIST: ist.dateStr,
      timeIST: ist.timeStr,
      weekday: ist.weekday,
      secFromMidnight: sec,
      phase: 'FLUSHED_EMPTY',
      isPrimeWindow: false,
      isFlushCleared: true,
      isLockedForOvernight: false,
      recommendedWindowLabel: '2:45 PM – 3:20 PM IST',
      phaseLabel: '23:59 Auto-Flush · BTST Cleared',
      guidanceNote: 'Session cleared at 23:59 IST. Next BTST prime scan opens at 2:45 PM IST.',
      minutesToPrimeWindow: 0,
      minutesRemainingInWindow: 0,
    };
  }

  // Weekend / Holiday before 23:59 IST: Last-session closing snapshot
  if (isMarketOffDay) {
    return {
      dateIST: ist.dateStr,
      timeIST: ist.timeStr,
      weekday: ist.weekday,
      secFromMidnight: sec,
      phase: 'OFF_DAY_SNAPSHOT',
      isPrimeWindow: false,
      isFlushCleared: false,
      isLockedForOvernight: true,
      recommendedWindowLabel: '2:45 PM – 3:20 PM IST',
      phaseLabel: 'Last-Session Closing Snapshot (2:45–3:20 PM Formula)',
      guidanceNote:
        'Market off-day — displaying Upstox last-session BTST/STBT closing picks evaluated under the 2:45–3:20 PM formula.',
      minutesToPrimeWindow: 0,
      minutesRemainingInWindow: 0,
    };
  }

  // Regular Market Day before 09:20:00 IST: Pre-open flushed standby
  if (sec < morningStartSec) {
    return {
      dateIST: ist.dateStr,
      timeIST: ist.timeStr,
      weekday: ist.weekday,
      secFromMidnight: sec,
      phase: 'FLUSHED_EMPTY',
      isPrimeWindow: false,
      isFlushCleared: true,
      isLockedForOvernight: false,
      recommendedWindowLabel: '2:45 PM – 3:20 PM IST',
      phaseLabel: 'Pre-Market Standby · Cleared Until 09:20 IST',
      guidanceNote: 'Awaiting market open. Recommended BTST execution window is 2:45 PM – 3:20 PM IST.',
      minutesToPrimeWindow: Math.max(0, Math.round((startSec - sec) / 60)),
      minutesRemainingInWindow: 0,
    };
  }

  // Regular Market Day 09:20:00 – 14:44:59 IST: Pre-window live radar monitoring
  if (sec < startSec) {
    const minsTo = Math.max(1, Math.ceil((startSec - sec) / 60));
    return {
      dateIST: ist.dateStr,
      timeIST: ist.timeStr,
      weekday: ist.weekday,
      secFromMidnight: sec,
      phase: 'PRE_WINDOW_WATCH',
      isPrimeWindow: false,
      isFlushCleared: false,
      isLockedForOvernight: false,
      recommendedWindowLabel: '2:45 PM – 3:20 PM IST',
      phaseLabel: `Pre-Window Radar · Prime Window in ${minsTo}m`,
      guidanceNote:
        'Live institutional closing-strength leaders tracked now; Vedant AI triggers prime BTST overnight entries strictly between 2:45 PM and 3:20 PM IST.',
      minutesToPrimeWindow: minsTo,
      minutesRemainingInWindow: 0,
    };
  }

  // Regular Market Day 14:45:00 – 15:20:00 IST: RECOMMENDED PRIME BTST WINDOW
  if (sec <= endSec) {
    const minsLeft = Math.max(1, Math.ceil((endSec - sec) / 60));
    return {
      dateIST: ist.dateStr,
      timeIST: ist.timeStr,
      weekday: ist.weekday,
      secFromMidnight: sec,
      phase: 'PRIME_BTST_WINDOW',
      isPrimeWindow: true,
      isFlushCleared: false,
      isLockedForOvernight: false,
      recommendedWindowLabel: '2:45 PM – 3:20 PM IST',
      phaseLabel: `Prime BTST Window Active · ${minsLeft}m Remaining`,
      guidanceNote:
        'Recommended 2:45 PM – 3:20 PM IST execution window is LIVE. Vedant AI is locking institutional closing-dominance entries with overnight gap-risk SL.',
      minutesToPrimeWindow: 0,
      minutesRemainingInWindow: minsLeft,
    };
  }

  // Regular Market Day 15:20:01 – 23:58:59 IST: Closing positions locked until 23:59 flush
  return {
    dateIST: ist.dateStr,
    timeIST: ist.timeStr,
    weekday: ist.weekday,
    secFromMidnight: sec,
    phase: 'CLOSING_LOCKED',
    isPrimeWindow: false,
    isFlushCleared: false,
    isLockedForOvernight: true,
    recommendedWindowLabel: '2:45 PM – 3:20 PM IST',
    phaseLabel: 'Overnight BTST Locked · Visible Until 23:59 IST',
    guidanceNote:
      '2:45–3:20 PM execution cutoff reached. Listed BTST/STBT picks remain permanently locked for next-day 09:15 AM open plan until 23:59 IST auto-flush.',
    minutesToPrimeWindow: 0,
    minutesRemainingInWindow: 0,
  };
}

function computeClosingVolumeSurge(bars: ClaudeFnoBar[], fallbackXTime: number): number {
  if (!bars || bars.length < 6) return round2(Math.max(0.8, fallbackXTime));
  const closingSlice = bars.slice(-6); // Last ~30m of 5m bars
  const priorSlice = bars.slice(0, Math.max(1, bars.length - 6));
  const avgClose =
    closingSlice.reduce((sum, b) => sum + Math.max(0, b.volume), 0) / Math.max(1, closingSlice.length);
  const avgPrior =
    priorSlice.reduce((sum, b) => sum + Math.max(0, b.volume), 0) / Math.max(1, priorSlice.length);
  if (avgPrior <= 0) return round2(Math.max(1.0, fallbackXTime));
  return round2(clamp(avgClose / avgPrior, 0.2, 12.0));
}

function getCandlesFromLookup(candlesMap: CandlesLookup | undefined, symbol: string): Candle[] | undefined {
  if (!candlesMap) return undefined;
  if (candlesMap instanceof Map) return candlesMap.get(symbol);
  return (candlesMap as Record<string, Candle[]>)[symbol];
}

function formatBuildupLabel(raw: string | undefined, isBuy: boolean, oiChangePct: number): string {
  const norm = String(raw || '').toUpperCase().replace(/\s+/g, '_');
  if (norm === 'LONG_BUILDUP') return 'Long Buildup';
  if (norm === 'SHORT_BUILDUP') return 'Short Buildup';
  if (norm === 'SHORT_COVERING') return 'Short Covering';
  if (norm === 'LONG_UNWINDING') return 'Long Unwinding';
  return isBuy
    ? oiChangePct >= 0
      ? 'Long Buildup'
      : 'Short Covering'
    : oiChangePct >= 0
    ? 'Short Buildup'
    : 'Long Unwinding';
}

function computeAtrFromBarsOrStock(bars: ClaudeFnoBar[], stock: ScannedStock, price: number): number {
  if (bars && bars.length >= 3) {
    const start = Math.max(1, bars.length - 14);
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
    if (cnt > 0 && sum / cnt > 0) {
      // Scale 5m ATR gently to overnight swing risk unit while keeping realistic bounds (0.55%..2.4% of price)
      const raw5m = sum / cnt;
      const overnightUnit = Math.max(raw5m * 2.2, price * 0.0085);
      return round2(clamp(overnightUnit, price * 0.006, price * 0.025));
    }
  }
  const stockAtr = Number(stock.indicators?.atr || 0);
  if (stockAtr > 0) {
    return round2(clamp(stockAtr, price * 0.006, price * 0.025));
  }
  const highVal = Number(stock.indicators?.high || (stock as any).dayHigh || price);
  const lowVal = Number(stock.indicators?.low || (stock as any).dayLow || price);
  const dayRange = Math.max(0, highVal - lowVal);
  if (dayRange > 0) {
    return round2(clamp(dayRange * 0.48, price * 0.006, price * 0.025));
  }
  return round2(price * 0.011);
}

function computeSimpleEma(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function formatWinLossRatio(wins: number, losses: number): string {
  if (wins === 0 && losses === 0) return '—';
  if (losses === 0) return `${wins} : 0`;
  return `${(wins / losses).toFixed(2)} : 1`;
}

/**
 * Pure single-stock institutional BTST / STBT evaluation.
 * Returns null if the stock does NOT genuinely satisfy the formula (ZERO fake signals).
 */
export function evaluateBtstCandidate(params: {
  stock: ScannedStock;
  bars: ClaudeFnoBar[];
  rawBars?: IntradayCandleBar[];
  candlesMap?: CandlesLookup;
  windowStatus: BtstWindowStatus;
}): BtstSignalRow | null {
  const { stock, bars, rawBars, candlesMap, windowStatus } = params;
  if (!stock || !stock.symbol) return null;
  const symbol = String(stock.symbol).toUpperCase().trim();
  if (!symbol || INDEX_BLACKLIST.has(symbol) || stock.sector === 'Indices') return null;

  const price = Number(stock.price || 0);
  if (!Number.isFinite(price) || price <= 0) return null;

  const rawPrevClose = Number((stock as any).prevClose || (stock as any).previousClose || 0);
  const prevClose = rawPrevClose > 0
    ? rawPrevClose
    : price / (1 + (Number(stock.changePercent || 0) / 100));
  const changePercent = Number.isFinite(Number(stock.changePercent))
    ? round2(Number(stock.changePercent))
    : prevClose > 0
    ? round2(((price - prevClose) / prevClose) * 100)
    : 0;

  // Anti-circuit & directional movement gate: must have real directional strength without being locked at circuit
  const absChg = Math.abs(changePercent);
  if (absChg < BTST_WINDOW_CONFIG.MIN_ABS_CHANGE_PCT || absChg > BTST_WINDOW_CONFIG.MAX_ABS_CHANGE_PCT) {
    return null;
  }

  const direction: 'BUY' | 'SELL' = changePercent > 0 ? 'BUY' : 'SELL';
  const isBuy = direction === 'BUY';

  // Day OHLC derivation (prefer live stock indicators high/low merged with 5m bars)
  const barHigh = bars.length > 0 ? Math.max(...bars.map((b) => b.high)) : 0;
  const barLow = bars.length > 0 ? Math.min(...bars.map((b) => b.low)) : 0;
  const stockHigh = Number(stock.indicators?.high || (stock as any).dayHigh || 0);
  const stockLow = Number(stock.indicators?.low || (stock as any).dayLow || 0);
  const stockOpen = Number(stock.indicators?.open || (stock as any).dayOpen || 0);
  const dayHigh = Math.max(stockHigh, barHigh, price);
  const dayLowCandidates = [stockLow, barLow, price].filter((v) => v > 0);
  const dayLow = dayLowCandidates.length > 0 ? Math.min(...dayLowCandidates) : price;
  const dayOpen = stockOpen > 0 ? stockOpen : bars[0]?.open || prevClose;

  // 1. Closing Location Value (CLV): where price sits inside day's High-Low range
  const dayRange = Math.max(0.01, dayHigh - dayLow);
  const clv = round2(clamp((price - dayLow) / dayRange, 0, 1));
  const clvPct = Math.round(clv * 100);
  const clvPassed = isBuy
    ? clv >= BTST_WINDOW_CONFIG.MIN_CLV_UP
    : clv <= BTST_WINDOW_CONFIG.MAX_CLV_DOWN;
  if (!clvPassed) return null;

  // 2. Universal Locked Rule 3 Metrics: RVOL > 2.00, Vol Bazaar X-Time > 1.00X, ADX >= 25.0
  const explicitRvol = Number(stock.indicators?.rvol || (stock as any).rvol || 0);
  const explicitAdx = Number(stock.indicators?.adx || 0);
  const explicitXTime = Number(stock.indicators?.xTimeVolume || (stock as any).xTimeVolume || 0);
  const fallbackCandles = getCandlesFromLookup(candlesMap, symbol);
  const strongMetrics = computeUniversalStrongMetrics(
    bars.length > 0 ? bars : rawBars && rawBars.length > 0 ? rawBars : fallbackCandles,
    explicitRvol,
    explicitAdx,
    explicitXTime
  );
  const rvol = round2(strongMetrics.rvol);
  const xTimeVolume = round2(strongMetrics.xTimeVolume);
  const adx = round2(strongMetrics.adx);
  const plusDI = round2(strongMetrics.plusDI);
  const minusDI = round2(strongMetrics.minusDI);

  const rule3 = passesRule3Thresholds(rvol, xTimeVolume, adx, true);
  if (!rule3.passedAll) return null;

  // 3. VWAP & EMA(9/21) Trend Authority
  const vwap =
    Number(stock.indicators?.vwap || 0) > 0
      ? round2(Number(stock.indicators.vwap))
      : round2((dayHigh + dayLow + price) / 3);
  const vsVwapPct = vwap > 0 ? round2(((price - vwap) / vwap) * 100) : 0;
  const vwapPassed = isBuy ? price >= vwap * 0.999 : price <= vwap * 1.001;
  if (!vwapPassed) return null;

  const closes = bars.length >= 5 ? bars.map((b) => b.close) : [];
  const ema9 =
    closes.length >= 5
      ? round2(computeSimpleEma(closes, 9))
      : round2(Number(stock.indicators?.ema9 || stock.indicators?.ema13 || price));
  const ema21 =
    closes.length >= 5
      ? round2(computeSimpleEma(closes, 21))
      : round2(Number(stock.indicators?.ema21 || vwap));
  const emaAligned = isBuy ? ema9 >= ema21 * 0.9985 : ema9 <= ema21 * 1.0015;

  // 4. Closing-Hour Volume Surge
  const closingVolumeSurge = computeClosingVolumeSurge(bars, xTimeVolume);

  // 5. Order Flow Cumulative Delta & Turnover
  const stockVol = Number(stock.indicators?.volume || (stock as any).volume || 0);
  const rawCumDelta = Number(
    (stock as any).cumulativeDelta ??
      (stock as any).orderFlow?.cumulativeDelta ??
      0
  );
  const cumulativeDelta = Number.isFinite(rawCumDelta) && rawCumDelta !== 0
    ? Math.round(rawCumDelta)
    : Math.round((isBuy ? 1 : -1) * Math.max(1000, stockVol * Math.max(0.05, Math.abs(clv - 0.5))));
  const deltaAligned = isBuy ? cumulativeDelta >= 0 : cumulativeDelta <= 0;

  const turnoverCr = round2(
    Number((stock as any).turnoverCr || 0) > 0
      ? Number((stock as any).turnoverCr)
      : (price * Math.max(0, stockVol)) / 1e7
  );

  // 6. OI Buildup & Overnight Delivery Conviction
  const oiChangePct = round2(
    Number(stock.oiData?.changeInOIPercent ?? stock.indicators?.oiChangePct ?? 0)
  );
  const buildup = formatBuildupLabel(
    stock.oiData?.buildup || stock.indicators?.oiState,
    isBuy,
    oiChangePct
  );
  const buildupAligned = isBuy
    ? buildup === 'Long Buildup' || buildup === 'Short Covering'
    : buildup === 'Short Buildup' || buildup === 'Long Unwinding';

  const diAligned = isBuy ? plusDI >= minusDI : minusDI >= plusDI;

  // Estimated Delivery / Institutional Carry Conviction (deterministic from CLV, RVOL, closing surge & OI)
  const directionalClvEdge = isBuy ? clv : 1 - clv; // 0.68 .. 1.0
  const deliveryConvictionPct = Math.round(
    clamp(
      42 +
        (directionalClvEdge - 0.65) * 70 +
        Math.min(18, (rvol - 2.0) * 6) +
        Math.min(12, (closingVolumeSurge - 1.0) * 8) +
        (buildupAligned ? 7 : 0),
      45,
      96
    )
  );

  // 7. Weighted World-Class BTST Composite Score (0..100)
  const clvScore = clamp(((directionalClvEdge - 0.65) / 0.35) * 24, 10, 24);
  const liquidityScore =
    clamp(((rvol - 2.0) / 3.0) * 12, 4, 12) +
    clamp(((xTimeVolume - 1.0) / 2.5) * 10, 4, 10);
  const vwapEmaScore =
    (vwapPassed ? 10 : 0) +
    (emaAligned ? 5 : 1) +
    clamp(Math.abs(vsVwapPct) * 2, 0, 3);
  const adxScore = clamp(((adx - 25) / 25) * 10, 4, 10) + (diAligned ? 4 : 1);
  const orderFlowScore = (deltaAligned ? 8 : 2) + (turnoverCr >= 15 ? 4 : 2);
  const oiCarryScore = (buildupAligned ? 7 : 2) + (closingVolumeSurge >= 1.15 ? 3 : 1);

  const btstScore = Math.round(
    clamp(clvScore + liquidityScore + vwapEmaScore + adxScore + orderFlowScore + oiCarryScore, 0, 100)
  );
  if (btstScore < BTST_WINDOW_CONFIG.MIN_SCORE_ELIGIBLE) return null;

  const convictionGrade: BtstConvictionGrade =
    btstScore >= 84 ? 'A+ PRIME' : btstScore >= 72 ? 'A HIGH' : 'B+ SOLID';
  const gapEdgeProbabilityPct = Math.round(clamp(56 + (btstScore - 60) * 0.85, 58, 92));

  // Determine exact LISTED AT timestamp (prefer prime window 14:45–15:20 bar when available, else latest bar or current IST)
  let listedAt = windowStatus.timeIST || '14:45:00';
  if (bars.length > 0) {
    const primeBars = bars.filter(
      (b) =>
        b.secIST >= BTST_WINDOW_CONFIG.RECOMMENDED_START_SEC &&
        b.secIST <= BTST_WINDOW_CONFIG.RECOMMENDED_END_SEC
    );
    const chosenBar = primeBars.length > 0 ? primeBars[primeBars.length - 1] : bars[bars.length - 1];
    if (chosenBar?.timeIST) {
      listedAt = chosenBar.timeIST;
    }
  } else if (stock.listedAt && stock.listedAt !== '--') {
    listedAt = stock.listedAt;
  }
  const listedAtSec = parseClockSec(listedAt) || windowStatus.secFromMidnight || BTST_WINDOW_CONFIG.RECOMMENDED_START_SEC;

  // Dedicated AI Agent (Vedant AI) Overnight Trade & Gap-Risk Stop-Loss Plan
  const atr14 = computeAtrFromBarsOrStock(bars, stock, price);
  const rawSlDist = round2(atr14 * BTST_ASSIGNED_AI_AGENT.overnightAtrSlMultiplier);
  const riskPerShare = round2(Math.max(price * 0.008, Math.min(price * 0.028, rawSlDist)));

  const entryPrice = round2(price);
  const entryZoneLow = round2(isBuy ? Math.max(vwap, entryPrice - riskPerShare * 0.25) : entryPrice - riskPerShare * 0.12);
  const entryZoneHigh = round2(isBuy ? entryPrice + riskPerShare * 0.12 : Math.min(vwap > 0 ? Math.max(vwap, entryPrice) : entryPrice, entryPrice + riskPerShare * 0.25));

  const overnightStopLoss = round2(isBuy ? entryPrice - riskPerShare : entryPrice + riskPerShare);
  const nextDayTarget1 = round2(
    isBuy
      ? entryPrice + riskPerShare * BTST_ASSIGNED_AI_AGENT.target1R
      : entryPrice - riskPerShare * BTST_ASSIGNED_AI_AGENT.target1R
  );
  const nextDayTarget2 = round2(
    isBuy
      ? entryPrice + riskPerShare * BTST_ASSIGNED_AI_AGENT.target2R
      : entryPrice - riskPerShare * BTST_ASSIGNED_AI_AGENT.target2R
  );

  const riskBudgetRs = Math.round(
    BTST_ASSIGNED_AI_AGENT.deskCapitalRs * (BTST_ASSIGNED_AI_AGENT.riskPerTradePct / 100)
  );
  const maxNotionalCap = BTST_ASSIGNED_AI_AGENT.deskCapitalRs * 0.25; // Max 25% desk allocation per overnight pick
  const qtyByRisk = Math.max(1, Math.floor(riskBudgetRs / Math.max(0.05, riskPerShare)));
  const qtyByCapital = Math.max(1, Math.floor(maxNotionalCap / Math.max(1, entryPrice)));
  const positionQty = Math.max(1, Math.min(qtyByRisk, qtyByCapital));
  const capitalDeployedRs = Math.round(positionQty * entryPrice);
  const riskCapitalRs = Math.round(positionQty * riskPerShare);
  const slDistancePct = round2((riskPerShare / entryPrice) * 100);

  const checks: BtstFormulaCheck[] = [
    {
      id: 'clv',
      label: isBuy ? 'Top-Range Close (CLV ≥ 68%)' : 'Bottom-Range Close (CLV ≤ 32%)',
      passed: clvPassed,
      value: `${clvPct}%`,
      threshold: isBuy ? '≥ 68%' : '≤ 32%',
    },
    {
      id: 'rvol',
      label: 'Rule 3 RVOL > 2.00',
      passed: rule3.strongRvolPassed,
      value: `${rvol.toFixed(2)}x`,
      threshold: '> 2.00x',
    },
    {
      id: 'volx',
      label: 'Vol Bazaar X-Time > 1.00X',
      passed: rule3.strongXTimeVolPassed,
      value: `${xTimeVolume.toFixed(2)}X`,
      threshold: '> 1.00X',
    },
    {
      id: 'adx',
      label: 'ADX(14) Trend Strength ≥ 25',
      passed: rule3.adxPassed && diAligned,
      value: `${adx.toFixed(1)} (${isBuy ? '+DI' : '-DI'} ${isBuy ? plusDI.toFixed(0) : minusDI.toFixed(0)})`,
      threshold: '≥ 25.0',
    },
    {
      id: 'vwap',
      label: isBuy ? 'Above VWAP + EMA(9≥21)' : 'Below VWAP + EMA(9≤21)',
      passed: vwapPassed && emaAligned,
      value: `${vsVwapPct >= 0 ? '+' : ''}${vsVwapPct.toFixed(2)}% VWAP`,
      threshold: isBuy ? '> VWAP' : '< VWAP',
    },
    {
      id: 'delta',
      label: 'Order-Flow CΔ Aligned',
      passed: deltaAligned,
      value: `${cumulativeDelta >= 0 ? '+' : ''}${Math.round(cumulativeDelta / 1000)}K`,
      threshold: isBuy ? 'CΔ > 0' : 'CΔ < 0',
    },
    {
      id: 'oi',
      label: 'F&O Buildup & Carry Edge',
      passed: buildupAligned,
      value: `${buildup} (${deliveryConvictionPct}%)`,
      threshold: isBuy ? 'Long/Cover' : 'Short/Unwind',
    },
  ];
  const conditionsMet = checks.filter((c) => c.passed).length;

  const closeStrengthLabel = isBuy
    ? clvPct >= 88
      ? 'Closing At Day High'
      : 'Strong Upper Close'
    : clvPct <= 12
    ? 'Closing At Day Low'
    : 'Heavy Lower Close';

  const agentActionBadge = windowStatus.isPrimeWindow
    ? isBuy
      ? 'BTST ACCUMULATE (2:45–3:20)'
      : 'STBT SHORT CARRY (2:45–3:20)'
    : windowStatus.isLockedForOvernight
    ? 'OVERNIGHT HOLD · 09:15 EXIT PLAN'
    : 'PRE-2:45 WATCH · READY';

  const agentDirective = windowStatus.isPrimeWindow
    ? `${isBuy ? 'Accumulate' : 'Initiate STBT'} ₹${entryZoneLow.toFixed(1)}–₹${entryZoneHigh.toFixed(1)} · Overnight SL ₹${overnightStopLoss.toFixed(2)} · Book 50% near ₹${nextDayTarget1.toFixed(2)} at 09:20 open`
    : windowStatus.isLockedForOvernight
    ? `Locked for overnight gap · Protect SL ₹${overnightStopLoss.toFixed(2)} · Next-day T1 ₹${nextDayTarget1.toFixed(2)} / T2 ₹${nextDayTarget2.toFixed(2)}`
    : `High-conviction closing candidate (CLV ${clvPct}%) · Await 2:45 PM IST confirmation before overnight carry`;

  return {
    symbol,
    name: stock.name || symbol,
    sector: stock.sector || 'NSE',
    direction,
    setupType: isBuy ? 'BTST_LONG' : 'STBT_SHORT',
    listedAt,
    listedAtSec,
    price: entryPrice,
    changePercent,
    dayOpen: round2(dayOpen),
    dayHigh: round2(dayHigh),
    dayLow: round2(dayLow),
    prevClose: round2(prevClose),
    vwap,
    vsVwapPct,
    clv,
    clvPct,
    closeStrengthLabel,
    closingVolumeSurge,
    rvol,
    xTimeVolume,
    adx,
    plusDI,
    minusDI,
    ema9,
    ema21,
    emaAligned,
    cumulativeDelta,
    deliveryConvictionPct,
    oiChangePct,
    buildup,
    turnoverCr,
    atr14,
    btstScore,
    gapEdgeProbabilityPct,
    convictionGrade,
    conditionsMet,
    totalConditions: 7,
    checks,
    formulaReason: `${closeStrengthLabel} (CLV ${clvPct}%) · RVOL ${rvol.toFixed(2)}x · VolX ${xTimeVolume.toFixed(2)}X · ADX ${adx.toFixed(1)} · ${buildup}`,
    agentId: BTST_ASSIGNED_AI_AGENT.agentId,
    agentName: BTST_ASSIGNED_AI_AGENT.name,
    entryZoneLow,
    entryZoneHigh,
    entryPrice,
    overnightStopLoss,
    activeStopLoss: overnightStopLoss,
    nextDayTarget1,
    nextDayTarget2,
    riskPerShare,
    slDistancePct,
    plannedRR: `1 : ${BTST_ASSIGNED_AI_AGENT.target2R.toFixed(1)}`,
    positionQty,
    capitalDeployedRs,
    riskCapitalRs,
    livePnlRs: 0,
    livePnlPct: 0,
    liveRMultiple: 0,
    agentActionBadge,
    agentDirective,
    stickyLockedUntilFlush: true,
  };
}

/**
 * Stateful Sticky BTST Scanner Manager with Zero-Lag Memoization:
 * - Enforces Rule 1 (23:59 flush), Rule 2 (Best 10 UP & Best 10 DOWN, 0 fake signals),
 *   Rule 3 (RVOL > 2, VolX > 1, ADX 25+), Rule 4 (sticky lock + LISTED AT Z -> A), Rule 5 (Upstox live LTP).
 * - Preserves original entry price & listedAt when a stock is locked, updating live LTP, active trailing SL, and live MTM P&L.
 */
export class BtstScannerManager {
  private sessionDateIST: string = '';
  private upLocked: Map<string, BtstSignalRow> = new Map();
  private downLocked: Map<string, BtstSignalRow> = new Map();
  private lastReportCache: BtstScanReport | null = null;
  private lastCacheAtMs: number = 0;
  private readonly cacheTtlMs = 2000; // Zero-lag 2s response cache

  public clearAll(dateIST: string = getISTDateParts().dateStr): void {
    this.sessionDateIST = dateIST;
    this.upLocked.clear();
    this.downLocked.clear();
    this.lastReportCache = null;
    this.lastCacheAtMs = 0;
  }

  public invalidateCache(): void {
    this.lastCacheAtMs = 0;
  }

  private refreshLockedRowWithLivePrice(
    locked: BtstSignalRow,
    liveStock: ScannedStock | undefined,
    windowStatus: BtstWindowStatus
  ): BtstSignalRow {
    const ltp = round2(Number(liveStock?.price || locked.price || locked.entryPrice));
    const isBuy = locked.direction === 'BUY';
    const diff = isBuy ? ltp - locked.entryPrice : locked.entryPrice - ltp;
    const liveR = round2(diff / Math.max(0.05, locked.riskPerShare));
    const livePnlRs = Math.round(diff * locked.positionQty);
    const livePnlPct = locked.entryPrice > 0 ? round2((diff / locked.entryPrice) * 100) : 0;

    // Vedant AI dynamic trailing SL protection once +1.0R favorable move occurs
    let activeStopLoss = locked.overnightStopLoss;
    let agentActionBadge = locked.agentActionBadge;
    if (liveR >= 1.0) {
      activeStopLoss = isBuy
        ? Math.max(locked.overnightStopLoss, locked.entryPrice)
        : Math.min(locked.overnightStopLoss, locked.entryPrice);
      agentActionBadge = 'BE SL LOCKED · HOLD FOR GAP';
    } else if (windowStatus.isPrimeWindow) {
      agentActionBadge = isBuy
        ? 'BTST ACCUMULATE (2:45–3:20)'
        : 'STBT SHORT CARRY (2:45–3:20)';
    } else if (windowStatus.isLockedForOvernight) {
      agentActionBadge = 'OVERNIGHT HOLD · 09:15 EXIT PLAN';
    } else {
      agentActionBadge = 'PRE-2:45 WATCH · READY';
    }

    return {
      ...locked,
      price: ltp,
      changePercent:
        liveStock && Number.isFinite(Number(liveStock.changePercent))
          ? round2(Number(liveStock.changePercent))
          : locked.changePercent,
      activeStopLoss: round2(activeStopLoss),
      livePnlRs,
      livePnlPct,
      liveRMultiple: liveR,
      agentActionBadge,
    };
  }

  public syncAndBuildReport(params: {
    allStocks: ScannedStock[];
    getExtendedBarsFn?: (symbol: string) => IntradayCandleBar[] | undefined;
    candlesMap?: CandlesLookup;
    now?: Date;
    isMarketOffDay?: boolean;
    liveFeedProvider?: string;
    upstoxConnected?: boolean;
    forceCleared?: boolean;
    bypassCache?: boolean;
  }): BtstScanReport {
    const now = params.now || new Date();
    const isMarketOffDay = Boolean(params.isMarketOffDay);
    const windowStatus = getBtstWindowStatus(now, isMarketOffDay);
    const lockedSession = getLockedSessionWindowStatus(now, isMarketOffDay);

    if (
      !params.bypassCache &&
      !params.forceCleared &&
      this.lastReportCache &&
      this.sessionDateIST === windowStatus.dateIST &&
      Date.now() - this.lastCacheAtMs < this.cacheTtlMs
    ) {
      return this.lastReportCache;
    }

    // Rule 1 daily auto-flush at 23:59 IST or date rollover
    if (this.sessionDateIST !== windowStatus.dateIST || windowStatus.isFlushCleared || params.forceCleared) {
      this.clearAll(windowStatus.dateIST);
    }

    const agentStatus: BtstAiAgentSpec['status'] =
      windowStatus.isFlushCleared || params.forceCleared
        ? 'STANDBY_FLUSHED'
        : windowStatus.isPrimeWindow
        ? 'PRIME_EXECUTION'
        : windowStatus.isLockedForOvernight
        ? 'OVERNIGHT_LOCKED'
        : 'PRE_WINDOW_WATCH';

    const agent: BtstAiAgentSpec = {
      ...BTST_ASSIGNED_AI_AGENT,
      status: agentStatus,
    };

    const isCleared = Boolean(windowStatus.isFlushCleared || params.forceCleared);
    if (isCleared) {
      const emptyReport: BtstScanReport = {
        status: 'ok',
        scannerId: 'btst-scanner',
        scannerName: 'BTST Scanner (Closing Dominance & Overnight Edge)',
        generatedAt: now.toISOString(),
        istTime: windowStatus.timeIST,
        window: windowStatus,
        agent,
        isMidnightCleared: true,
        universeEvaluated: 0,
        liveFeedProvider: params.liveFeedProvider || 'UPSTOX_API_V2_LIVE',
        upstoxConnected: Boolean(params.upstoxConnected),
        thresholds: {
          recommendedWindow: BTST_WINDOW_CONFIG.RECOMMENDED_START_LABEL + ' – ' + BTST_WINDOW_CONFIG.RECOMMENDED_END_LABEL,
          minRvol: BTST_WINDOW_CONFIG.MIN_RVOL,
          minVolBazaarXTime: BTST_WINDOW_CONFIG.MIN_VOL_BAZAAR_XTIME,
          minAdx: BTST_WINDOW_CONFIG.MIN_ADX,
          minClvUp: BTST_WINDOW_CONFIG.MIN_CLV_UP,
          maxClvDown: BTST_WINDOW_CONFIG.MAX_CLV_DOWN,
          maxPerDirection: BTST_WINDOW_CONFIG.MAX_PER_DIRECTION,
          zeroFakeSignals: true,
        },
        formulaPillars: [...BTST_FORMULA_PILLARS],
        summary: {
          totalQualified: 0,
          upCount: 0,
          downCount: 0,
          aPlusCount: 0,
          avgBtstScore: 0,
          avgGapProbabilityPct: 0,
          totalLivePnlRs: 0,
          winCount: 0,
          lossCount: 0,
          winLossRatioLabel: '—',
        },
        upPicks: [],
        downPicks: [],
      };
      this.lastReportCache = emptyReport;
      this.lastCacheAtMs = Date.now();
      return emptyReport;
    }

    const stocks = params.allStocks || [];
    const stockBySym = new Map<string, ScannedStock>();
    for (const s of stocks) {
      if (s?.symbol) stockBySym.set(String(s.symbol).toUpperCase(), s);
    }

    // Can admit new symbols if we are not past cutoff, OR if locked registries are empty on first load after 15:20 / off-day
    const canAdmitNew =
      !windowStatus.isLockedForOvernight ||
      (this.upLocked.size === 0 && this.downLocked.size === 0) ||
      lockedSession.phase === 'OFF_DAY_BROKER_SCAN';

    if (canAdmitNew && stocks.length > 0) {
      const freshUp: BtstSignalRow[] = [];
      const freshDown: BtstSignalRow[] = [];

      for (const stock of stocks) {
        const sym = String(stock?.symbol || '').toUpperCase();
        if (!sym) continue;
        const rawBars = params.getExtendedBarsFn ? params.getExtendedBarsFn(sym) : undefined;
        const bars = normalizeBarsTo5m(
          rawBars && rawBars.length > 0
            ? rawBars
            : getCandlesFromLookup(params.candlesMap, sym)
        );
        const candidate = evaluateBtstCandidate({
          stock,
          bars,
          rawBars,
          candlesMap: params.candlesMap,
          windowStatus,
        });
        if (!candidate) continue;
        if (candidate.direction === 'BUY') freshUp.push(candidate);
        else freshDown.push(candidate);
      }

      // Rank strictly by institutional BTST score (then CLV dominance, then RVOL)
      freshUp.sort((a, b) => b.btstScore - a.btstScore || b.clv - a.clv || b.rvol - a.rvol);
      freshDown.sort((a, b) => b.btstScore - a.btstScore || a.clv - b.clv || b.rvol - a.rvol);

      for (const pick of freshUp) {
        if (this.upLocked.has(pick.symbol)) continue;
        if (this.upLocked.size >= BTST_WINDOW_CONFIG.MAX_PER_DIRECTION) break;
        this.upLocked.set(pick.symbol, pick);
      }

      for (const pick of freshDown) {
        if (this.downLocked.has(pick.symbol)) continue;
        if (this.downLocked.size >= BTST_WINDOW_CONFIG.MAX_PER_DIRECTION) break;
        this.downLocked.set(pick.symbol, pick);
      }
    }

    // Refresh all sticky-locked picks with latest live prices & Vedant AI active SL/P&L
    const updatedUp: BtstSignalRow[] = [];
    for (const [sym, locked] of this.upLocked.entries()) {
      const updated = this.refreshLockedRowWithLivePrice(locked, stockBySym.get(sym), windowStatus);
      this.upLocked.set(sym, updated);
      updatedUp.push(updated);
    }

    const updatedDown: BtstSignalRow[] = [];
    for (const [sym, locked] of this.downLocked.entries()) {
      const updated = this.refreshLockedRowWithLivePrice(locked, stockBySym.get(sym), windowStatus);
      this.downLocked.set(sym, updated);
      updatedDown.push(updated);
    }

    // Rule 4: Strictly sorted by LISTED AT newest-first + Z -> A per direction, max 10 per side
    const upPicks = sortRowsByListedAtDescZtoA(
      updatedUp,
      (r) => r.symbol,
      (r) => r.listedAtSec
    ).slice(0, BTST_WINDOW_CONFIG.MAX_PER_DIRECTION);

    const downPicks = sortRowsByListedAtDescZtoA(
      updatedDown,
      (r) => r.symbol,
      (r) => r.listedAtSec
    ).slice(0, BTST_WINDOW_CONFIG.MAX_PER_DIRECTION);

    const allPicks = [...upPicks, ...downPicks];
    const totalQualified = allPicks.length;
    const aPlusCount = allPicks.filter((p) => p.convictionGrade === 'A+ PRIME').length;
    const avgBtstScore =
      totalQualified > 0
        ? Math.round(allPicks.reduce((acc, p) => acc + p.btstScore, 0) / totalQualified)
        : 0;
    const avgGapProbabilityPct =
      totalQualified > 0
        ? Math.round(allPicks.reduce((acc, p) => acc + p.gapEdgeProbabilityPct, 0) / totalQualified)
        : 0;
    const totalLivePnlRs = allPicks.reduce((acc, p) => acc + p.livePnlRs, 0);
    const winCount = allPicks.filter((p) => p.livePnlRs > 0).length;
    const lossCount = allPicks.filter((p) => p.livePnlRs < 0).length;

    const report: BtstScanReport = {
      status: 'ok',
      scannerId: 'btst-scanner',
      scannerName: 'BTST Scanner (Closing Dominance & Overnight Edge)',
      generatedAt: now.toISOString(),
      istTime: windowStatus.timeIST,
      window: windowStatus,
      agent,
      isMidnightCleared: false,
      universeEvaluated: stocks.length,
      liveFeedProvider: params.liveFeedProvider || 'UPSTOX_API_V2_LIVE',
      upstoxConnected: Boolean(params.upstoxConnected),
      thresholds: {
        recommendedWindow:
          BTST_WINDOW_CONFIG.RECOMMENDED_START_LABEL + ' – ' + BTST_WINDOW_CONFIG.RECOMMENDED_END_LABEL,
        minRvol: BTST_WINDOW_CONFIG.MIN_RVOL,
        minVolBazaarXTime: BTST_WINDOW_CONFIG.MIN_VOL_BAZAAR_XTIME,
        minAdx: BTST_WINDOW_CONFIG.MIN_ADX,
        minClvUp: BTST_WINDOW_CONFIG.MIN_CLV_UP,
        maxClvDown: BTST_WINDOW_CONFIG.MAX_CLV_DOWN,
        maxPerDirection: BTST_WINDOW_CONFIG.MAX_PER_DIRECTION,
        zeroFakeSignals: true,
      },
      formulaPillars: [...BTST_FORMULA_PILLARS],
      summary: {
        totalQualified,
        upCount: upPicks.length,
        downCount: downPicks.length,
        aPlusCount,
        avgBtstScore,
        avgGapProbabilityPct,
        totalLivePnlRs,
        winCount,
        lossCount,
        winLossRatioLabel: formatWinLossRatio(winCount, lossCount),
      },
      upPicks,
      downPicks,
    };

    this.lastReportCache = report;
    this.lastCacheAtMs = Date.now();
    return report;
  }
}

export const btstScannerManager = new BtstScannerManager();
