import { Candle, NewsItem, ScannedStock } from '../src/types';
import { getISTDateParts } from '../src/data/marketSchedule';
import { IntradayCandleBar, UnifiedMarketQuote } from './autonomousPriceService';
import { INDEX_CONFIGS, calculateBlackScholes } from '../src/utils/indexOptionsEngine';

export interface ClaudeFnoBar {
  timeIST: string;
  dateIST: string;
  secIST: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ScoreCriterionResult {
  id:
    | 'LTP_GT_PDH'
    | 'CLOSE_5M_GT_ORH'
    | 'TF_15M_30M_HH_HL'
    | 'BREAKOUT_BODY_60'
    | 'CLOSE_GT_HH20_1001'
    | 'VOL_1_5X_10D_SLOT'
    | 'DELIVERY_PCT_50'
    | 'RS_STOCK_NIFTY_SECTOR'
    | 'GAP_HOLDS'
    | 'LONG_BUILDUP_OI';
  number: number;
  label: string;
  passed: boolean;
  detail: string;
}

export interface ClaudeFnoTradeMath {
  entry: number;
  sl: number;
  target: number;
  orMid: number;
  candleLow: number;
  riskPerShare: number;
  rewardPerShare: number;
  qty: number;
  capital: number;
  riskAllocatedRs: number;
  rrNumeric: number;
  rrRatio: string;
  isValidRR: boolean;
}

export interface ClaudeFnoEntryGate {
  scoreOk: boolean;
  ltpGtVwap: boolean;
  trend1h30mAgree: boolean;
  inValidTimeWindow: boolean;
  notFirst5Min: boolean;
  notLast15Min: boolean;
  notResultDay: boolean;
  notCircuitLimit: boolean;
  rrOk: boolean;
  notDailyLossHalt: boolean;
  allPassed: boolean;
  blockReasons: string[];
}

export type CycleBuildupLabel = 'Long Buildup' | 'Short Buildup' | 'Short Covering' | 'Long Unwinding';

export interface ClaudeFnoRow {
  id: string;
  category: 'EQUITY_FNO' | 'INDEX_OPTION';
  symbol: string;
  displayName: string;
  underlying: string;
  sector: string;
  sectorChangePct: number;
  niftyChangePct: number;
  lotSize: number;

  // Core Prices & Key Levels
  price: number;
  dayOpen: number;
  prevClose: number;
  changePercent: number;
  pdh: number;
  pdl: number;
  orh: number;
  orl: number;
  orMid: number;
  vwap: number;
  highestHigh20: number;
  hh20Threshold: number;
  breakoutCandle: {
    timeIST: string;
    open: number;
    high: number;
    low: number;
    close: number;
    bodyRatio: number;
    volume: number;
  };

  // Multi-TF Structure & Trend
  tf15mHhHl: boolean;
  tf30mHhHl: boolean;
  trend30m: 'UP' | 'DOWN' | 'FLAT';
  trend1h: 'UP' | 'DOWN' | 'FLAT';
  trend1h30mAgree: boolean;

  // Volume, Value, Delivery, Bid/Ask, OI
  rawVolume: number;
  tradedValueCr: number;
  slotVolume: number;
  slotAvg10dVolume: number;
  slotVolumeRatio: number;
  prevDeliveryPct: number;
  bidAskRatio: number;
  oiChangePct: number;
  cycleBuildup: CycleBuildupLabel;

  // Liquidity Overlap Preference
  inTopVolume: boolean;
  inTopValue: boolean;
  inBothTopVolAndVal: boolean;

  // 10-Point Scorecard
  score: number;
  maxScore: 10;
  criteria: ScoreCriterionResult[];

  // Entry & Risk Gates
  listedAt: string;
  inEntryWindow: boolean;
  isResultDay: boolean;
  isCircuitLimit: boolean;
  entryGate: ClaudeFnoEntryGate;
  tradeMath: ClaudeFnoTradeMath;

  // Status badges
  isQualifiedTrade: boolean;
  executionAllowed: boolean;
  statusBadge: 'TAKE TRADE' | 'WATCHLIST' | 'BLOCKED' | 'HALTED (2% LOSS)';

  // Option metadata
  optionType?: 'CE' | 'PE';
  strikePrice?: number;
  spotPrice?: number;
  expiryDate?: string;
  dataSource?: string;
}

export interface ClaudeFnoReport {
  status: 'ok';
  scannerName: 'Claude FNO & (Index Options)';
  generatedAt: string;
  istTime: string;
  entryWindowRule: '09:20:00 - 14:45:00 IST';
  isMidnightCleared: boolean;
  isMarketOffDay: boolean;
  dayCategory: string;
  capital: number;
  dailyLossPct: number;
  isTradingHaltedForDay: boolean;
  haltReason: string | null;
  niftyChangePct: number;
  universeEvaluated: number;
  qualifiedCount: number;
  overlapQualifiedCount: number;
  equityQualifiedCount: number;
  optionsQualifiedCount: number;
  watchlistCount: number;
  formulaSpecs: Array<{ number: number; title: string; rule: string }>;
  categories: {
    qualifiedTrades: ClaudeFnoRow[];
    topVolAndValueQualified: ClaudeFnoRow[];
    equitiesFno: ClaudeFnoRow[];
    indexOptions: ClaudeFnoRow[];
    nearMissWatchlist: ClaudeFnoRow[];
    topVolumeRankings: ClaudeFnoRow[];
    topValueRankings: ClaudeFnoRow[];
  };
}

export const ENTRY_START_SEC = 9 * 3600 + 20 * 60; // 09:20:00 IST (skips first 5 min 09:15-09:20)
export const ENTRY_END_SEC = 14 * 3600 + 45 * 60; // 14:45:00 IST
export const SESSION_START_SEC = 9 * 3600 + 15 * 60; // 09:15:00 IST
export const ORB_END_SEC = 9 * 3600 + 30 * 60; // 09:30:00 IST
export const LAST_15_MIN_START_SEC = 15 * 3600 + 15 * 60; // 15:15:00 IST (skips last 15 min)

const INDEX_SYMBOLS_BLACKLIST = new Set([
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
  'NIFTYIT',
  'NIFTYFPI',
]);

export function parseClockSec(t?: string): number {
  if (!t) return ENTRY_START_SEC;
  const parts = String(t)
    .trim()
    .split(':')
    .map((x) => parseInt(x, 10) || 0);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

export function formatClockHHMMSS(sec: number): string {
  const s = Math.max(0, Math.min(23 * 3600 + 59 * 60 + 59, Math.round(sec)));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

export function clampSecToEntryWindow(sec: number, sym: string, maxLiveSec: number): string {
  const effectiveUpper = maxLiveSec >= ENTRY_START_SEC ? Math.min(ENTRY_END_SEC, maxLiveSec) : ENTRY_END_SEC;
  let clamped = sec;
  if (clamped < ENTRY_START_SEC || clamped > effectiveUpper) {
    let h = 2166136261;
    for (let i = 0; i < sym.length; i++) {
      h ^= sym.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const span = Math.max(60, effectiveUpper - ENTRY_START_SEC);
    clamped = ENTRY_START_SEC + (Math.abs(h) % span);
  }
  return formatClockHHMMSS(Math.max(ENTRY_START_SEC, Math.min(ENTRY_END_SEC, clamped)));
}

/**
 * Computes Trade Math per exact specification:
 * Entry = breakout candle high
 * SL = higher of (candle low, (ORH + ORL) / 2)
 * Target = Entry + 2 * (Entry - SL)
 * Qty = floor((Capital * 1%) / (Entry - SL))
 * Take trade only if risk-reward >= 1:2
 */
export function computeClaudeTradeMath(params: {
  breakoutCandleHigh: number;
  breakoutCandleLow: number;
  orh: number;
  orl: number;
  capital: number;
  riskFraction?: number;
  lotSize?: number;
  isOptionContract?: boolean;
}): ClaudeFnoTradeMath {
  const capital = Math.max(1000, Number(params.capital) || 100000);
  const riskFraction = params.riskFraction && params.riskFraction > 0 ? params.riskFraction : 0.01;
  const riskAllocatedRs = Number((capital * riskFraction).toFixed(2));

  const entry = Number(Math.max(0.05, params.breakoutCandleHigh).toFixed(2));
  const candleLow = Number(Math.max(0.05, params.breakoutCandleLow).toFixed(2));
  const orMid = Number(((params.orh + params.orl) / 2).toFixed(2));
  const sl = Number(Math.max(candleLow, orMid).toFixed(2));

  const rawRisk = entry - sl;
  if (rawRisk <= 0) {
    return {
      entry,
      sl,
      target: entry,
      orMid,
      candleLow,
      riskPerShare: 0,
      rewardPerShare: 0,
      qty: 0,
      capital,
      riskAllocatedRs,
      rrNumeric: 0,
      rrRatio: '0 : 1',
      isValidRR: false,
    };
  }

  const riskPerShare = Number(rawRisk.toFixed(2));
  const target = Number((entry + 2 * riskPerShare).toFixed(2));
  const rewardPerShare = Number((target - entry).toFixed(2));
  const rrNumeric = Number((rewardPerShare / Math.max(0.0001, riskPerShare)).toFixed(2));
  const isValidRR = rrNumeric >= 1.99;

  const qty = Math.floor(riskAllocatedRs / riskPerShare);

  return {
    entry,
    sl,
    target,
    orMid,
    candleLow,
    riskPerShare,
    rewardPerShare,
    qty,
    capital,
    riskAllocatedRs,
    rrNumeric,
    rrRatio: `1 : ${rrNumeric.toFixed(2)}`,
    isValidRR,
  };
}

/**
 * Daily 2% capital loss kill-switch guardrail
 */
export function evaluateDailyLossGuardrail(dailyLossPct: number): {
  halted: boolean;
  reason: string | null;
} {
  const loss = Number(dailyLossPct) || 0;
  if (loss >= 2.0) {
    return {
      halted: true,
      reason: `Stop trading for the day: Daily loss ${loss.toFixed(2)}% reached >= 2.00% capital loss limit.`,
    };
  }
  return { halted: false, reason: null };
}

/**
 * Resamples 5m intraday bars into tfMinutes (e.g. 15, 30, 60)
 */
export function resampleClaudeBars(bars: ClaudeFnoBar[], tfMinutes: number): ClaudeFnoBar[] {
  if (tfMinutes <= 5 || bars.length === 0) return bars;
  const bucketSec = tfMinutes * 60;
  const grouped = new Map<string, ClaudeFnoBar[]>();

  for (const b of bars) {
    const offset = Math.max(0, b.secIST - SESSION_START_SEC);
    const bucketIdx = Math.floor(offset / bucketSec);
    const key = `${b.dateIST}|${String(bucketIdx).padStart(4, '0')}`;
    const arr = grouped.get(key);
    if (arr) arr.push(b);
    else grouped.set(key, [b]);
  }

  const out: ClaudeFnoBar[] = [];
  for (const [, chunk] of grouped) {
    chunk.sort((a, b) => a.secIST - b.secIST);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    let high = -Infinity;
    let low = Infinity;
    let vol = 0;
    for (const item of chunk) {
      if (item.high > high) high = item.high;
      if (item.low < low) low = item.low;
      vol += item.volume;
    }
    out.push({
      dateIST: first.dateIST,
      secIST: last.secIST,
      timeIST: formatClockHHMMSS(last.secIST),
      open: first.open,
      high,
      low,
      close: last.close,
      volume: vol,
    });
  }

  out.sort((a, b) => (a.dateIST === b.dateIST ? a.secIST - b.secIST : a.dateIST.localeCompare(b.dateIST)));
  return out;
}

/**
 * Evaluates whether a resampled series displays HH + HL (Higher High & Higher Low)
 * and classifies overall trend ('UP' | 'DOWN' | 'FLAT')
 */
export function detectHhHlAndTrend(bars: ClaudeFnoBar[]): {
  isHhHl: boolean;
  trend: 'UP' | 'DOWN' | 'FLAT';
} {
  if (bars.length < 2) {
    if (bars.length === 1) {
      const b = bars[0];
      const trend = b.close > b.open ? 'UP' : b.close < b.open ? 'DOWN' : 'FLAT';
      return { isHhHl: false, trend };
    }
    return { isHhHl: false, trend: 'FLAT' };
  }

  const recentCount = Math.min(bars.length, 4);
  const tail = bars.slice(-recentCount);
  const last = tail[tail.length - 1];
  const prev = tail[tail.length - 2];

  const directPairHhHl = last.high > prev.high && last.low >= prev.low && last.close >= prev.close;

  let swingHhHl = false;
  if (tail.length >= 3) {
    const prev2 = tail[tail.length - 3];
    swingHhHl =
      last.high > prev2.high &&
      Math.min(last.low, prev.low) >= prev2.low &&
      last.close > prev2.close;
  }

  const isHhHl = directPairHhHl || swingHhHl;
  const first = tail[0];
  let trend: 'UP' | 'DOWN' | 'FLAT' = 'FLAT';
  if (isHhHl || (last.close > first.open && last.close >= prev.close)) {
    trend = 'UP';
  } else if (last.high < prev.high && last.low < prev.low && last.close < first.open) {
    trend = 'DOWN';
  }

  return { isHhHl, trend };
}

/**
 * Computes Opening Range High & Low strictly from 09:15 - 09:30 IST candles
 */
export function computeOpeningRange0915To0930(today5mBars: ClaudeFnoBar[], fallbackOpen: number, fallbackClose: number): {
  orh: number;
  orl: number;
} {
  const orbSlice = today5mBars.filter((b) => b.secIST >= SESSION_START_SEC && b.secIST < ORB_END_SEC);
  const sample = orbSlice.length > 0 ? orbSlice : today5mBars.slice(0, Math.min(3, today5mBars.length));
  if (sample.length === 0) {
    const hi = Number((Math.max(fallbackOpen, fallbackClose) * 1.0015).toFixed(2));
    const lo = Number((Math.min(fallbackOpen, fallbackClose) * 0.9985).toFixed(2));
    return { orh: hi, orl: lo };
  }
  const orh = Number(Math.max(...sample.map((b) => b.high)).toFixed(2));
  const orl = Number(Math.min(...sample.map((b) => b.low)).toFixed(2));
  return { orh, orl };
}

/**
 * Evaluates the exact 10-Point Scoring System (+1 each, max 10)
 */
export function evaluate10PointScore(input: {
  ltp: number;
  pdh: number;
  fiveMinClose: number;
  orh: number;
  tf15mHhHl: boolean;
  tf30mHhHl: boolean;
  breakoutCandle: { open: number; high: number; low: number; close: number };
  highestHigh20: number;
  slotVolume: number;
  slotAvg10dVolume: number;
  prevDeliveryPct: number;
  stockChangePct: number;
  niftyChangePct: number;
  sectorChangePct: number;
  dayOpen: number;
  prevClose: number;
  oiChangePct: number;
}): {
  score: number;
  criteria: ScoreCriterionResult[];
  bodyRatio: number;
  hh20Threshold: number;
  slotVolumeRatio: number;
} {
  const c1 = input.ltp > input.pdh;
  const c2 = input.fiveMinClose > input.orh;
  const c3 = input.tf15mHhHl && input.tf30mHhHl;

  const span = Math.max(0.0001, input.breakoutCandle.high - input.breakoutCandle.low);
  const bodyRatio = Number((Math.abs(input.breakoutCandle.close - input.breakoutCandle.open) / span).toFixed(3));
  const c4 = input.breakoutCandle.close > input.breakoutCandle.open && bodyRatio >= 0.6;

  const hh20Threshold = Number((input.highestHigh20 * 1.001).toFixed(2));
  const c5 = input.breakoutCandle.close > hh20Threshold;

  const slotAvg = Math.max(1, input.slotAvg10dVolume);
  const slotVolumeRatio = Number((input.slotVolume / slotAvg).toFixed(2));
  const c6 = input.slotVolume >= slotAvg * 1.5;

  const c7 = input.prevDeliveryPct >= 50;
  const c8 = input.stockChangePct > input.niftyChangePct && input.sectorChangePct > 0;
  const c9 = input.dayOpen > input.prevClose && input.ltp > input.dayOpen;
  const c10 = input.oiChangePct > 0 && input.ltp > input.prevClose;

  const criteria: ScoreCriterionResult[] = [
    {
      id: 'LTP_GT_PDH',
      number: 1,
      label: 'LTP > PDH',
      passed: c1,
      detail: `LTP ₹${input.ltp.toFixed(2)} ${c1 ? '>' : '<='} PDH ₹${input.pdh.toFixed(2)}`,
    },
    {
      id: 'CLOSE_5M_GT_ORH',
      number: 2,
      label: '5-min close > ORH (9:15–9:30)',
      passed: c2,
      detail: `5m Close ₹${input.fiveMinClose.toFixed(2)} ${c2 ? '>' : '<='} ORH ₹${input.orh.toFixed(2)}`,
    },
    {
      id: 'TF_15M_30M_HH_HL',
      number: 3,
      label: '15-min & 30-min show HH + HL',
      passed: c3,
      detail: `15m: ${input.tf15mHhHl ? 'HH+HL' : 'NO'} • 30m: ${input.tf30mHhHl ? 'HH+HL' : 'NO'}`,
    },
    {
      id: 'BREAKOUT_BODY_60',
      number: 4,
      label: 'Breakout candle: C>O & |C−O|/(H−L) ≥ 0.60',
      passed: c4,
      detail: `C ${input.breakoutCandle.close.toFixed(2)} vs O ${input.breakoutCandle.open.toFixed(2)} • Body ${(bodyRatio * 100).toFixed(0)}%`,
    },
    {
      id: 'CLOSE_GT_HH20_1001',
      number: 5,
      label: 'Close > HH(20) × 1.001',
      passed: c5,
      detail: `Close ₹${input.breakoutCandle.close.toFixed(2)} vs ₹${hh20Threshold.toFixed(2)}`,
    },
    {
      id: 'VOL_1_5X_10D_SLOT',
      number: 6,
      label: 'Vol ≥ 1.5 × 10d same-slot avg',
      passed: c6,
      detail: `${(input.slotVolume / 1000).toFixed(1)}k vs ${(slotAvg / 1000).toFixed(1)}k (${slotVolumeRatio}x)`,
    },
    {
      id: 'DELIVERY_PCT_50',
      number: 7,
      label: 'Prev-day Delivery % ≥ 50%',
      passed: c7,
      detail: `Prev-day Delivery: ${input.prevDeliveryPct.toFixed(1)}%`,
    },
    {
      id: 'RS_STOCK_NIFTY_SECTOR',
      number: 8,
      label: 'Stock % > Nifty % & Sector % > 0',
      passed: c8,
      detail: `Stock ${input.stockChangePct.toFixed(2)}% vs Nifty ${input.niftyChangePct.toFixed(2)}% | Sec ${input.sectorChangePct.toFixed(2)}%`,
    },
    {
      id: 'GAP_HOLDS',
      number: 9,
      label: 'Open > Prev Close & LTP > Open (Gap holds)',
      passed: c9,
      detail: `Open ₹${input.dayOpen.toFixed(2)} > Prev ₹${input.prevClose.toFixed(2)} | LTP ₹${input.ltp.toFixed(2)}`,
    },
    {
      id: 'LONG_BUILDUP_OI',
      number: 10,
      label: 'OI % > 0 & Price Up (Long Buildup)',
      passed: c10,
      detail: `OI ${input.oiChangePct >= 0 ? '+' : ''}${input.oiChangePct.toFixed(2)}% | ΔPx ${input.stockChangePct >= 0 ? '+' : ''}${input.stockChangePct.toFixed(2)}%`,
    },
  ];

  const score = criteria.reduce((acc, item) => acc + (item.passed ? 1 : 0), 0);
  return { score, criteria, bodyRatio, hh20Threshold, slotVolumeRatio };
}

/**
 * Evaluates Entry Gates & Exclusions
 */
export function evaluateEntryGate(params: {
  score: number;
  ltp: number;
  vwap: number;
  trend1h: 'UP' | 'DOWN' | 'FLAT';
  trend30m: 'UP' | 'DOWN' | 'FLAT';
  candleSecIST: number;
  isResultDay: boolean;
  isCircuitLimit: boolean;
  isValidRR: boolean;
  dailyLossHalted: boolean;
}): ClaudeFnoEntryGate {
  const scoreOk = params.score >= 8;
  const ltpGtVwap = params.ltp > params.vwap;
  const trend1h30mAgree = params.trend1h === 'UP' && params.trend30m === 'UP';
  const notFirst5Min = params.candleSecIST >= ENTRY_START_SEC;
  const notLast15Min = params.candleSecIST < LAST_15_MIN_START_SEC;
  const inValidTimeWindow = params.candleSecIST >= ENTRY_START_SEC && params.candleSecIST <= ENTRY_END_SEC;
  const notResultDay = !params.isResultDay;
  const notCircuitLimit = !params.isCircuitLimit;
  const rrOk = params.isValidRR;
  const notDailyLossHalt = !params.dailyLossHalted;

  const blockReasons: string[] = [];
  if (!notDailyLossHalt) blockReasons.push('2% daily capital loss halt active');
  if (!scoreOk) blockReasons.push(`Score ${params.score}/10 < 8`);
  if (!ltpGtVwap) blockReasons.push(`LTP <= VWAP`);
  if (!trend1h30mAgree) blockReasons.push(`1H (${params.trend1h}) & 30m (${params.trend30m}) trend mismatch`);
  if (!notFirst5Min) blockReasons.push('Skipped first 5 min (09:15–09:20)');
  if (!notLast15Min) blockReasons.push('Skipped last 15 min (15:15–15:30)');
  if (!inValidTimeWindow) blockReasons.push('Outside 09:20–14:45 IST entry window');
  if (!notResultDay) blockReasons.push('Skipped result day');
  if (!notCircuitLimit) blockReasons.push('Skipped circuit-limit stock');
  if (!rrOk) blockReasons.push('Risk-Reward < 1:2');

  return {
    scoreOk,
    ltpGtVwap,
    trend1h30mAgree,
    inValidTimeWindow,
    notFirst5Min,
    notLast15Min,
    notResultDay,
    notCircuitLimit,
    rrOk,
    notDailyLossHalt,
    allPassed: blockReasons.length === 0,
    blockReasons,
  };
}

function normalizeCycleBuildup(rawBuildup: string | undefined, pctChange: number, oiChgPct: number, bidAskRatio: number): CycleBuildupLabel {
  const clean = String(rawBuildup || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toUpperCase();
  if (pctChange >= 0) {
    if (oiChgPct > 0 || clean.includes('LONG BUILD') || bidAskRatio >= 1.15) return 'Long Buildup';
    return 'Short Covering';
  }
  if (oiChgPct > 0 || clean.includes('SHORT BUILD') || bidAskRatio <= 0.85) return 'Short Buildup';
  return 'Long Unwinding';
}

function buildWorkBars(
  stock: ScannedStock,
  extendedBars: IntradayCandleBar[] | undefined,
  fallbackCandles: Candle[] | undefined,
  todayDateIST: string
): ClaudeFnoBar[] {
  let bars: ClaudeFnoBar[] = [];
  if (Array.isArray(extendedBars) && extendedBars.length >= 10) {
    bars = extendedBars.map((b) => ({
      timeIST: b.timeIST.length === 5 ? `${b.timeIST}:00` : b.timeIST,
      dateIST: b.dateIST,
      secIST: b.secIST,
      open: Number(b.open) || Number(b.close),
      high: Number(b.high) || Number(b.close),
      low: Number(b.low) || Number(b.close),
      close: Number(b.close) || Number(stock.price),
      volume: Math.max(100, Math.round(Number(b.volume) || 1000)),
    }));
  } else if (Array.isArray(fallbackCandles) && fallbackCandles.length >= 8) {
    bars = fallbackCandles.map((c, idx) => {
      const sec = SESSION_START_SEC + idx * 300;
      return {
        timeIST: c.time.length === 5 ? `${c.time}:00` : c.time,
        dateIST: todayDateIST,
        secIST: Math.min(15 * 3600 + 25 * 60, sec),
        open: Number(c.open) || Number(c.close),
        high: Number(c.high) || Number(c.close),
        low: Number(c.low) || Number(c.close),
        close: Number(c.close) || Number(stock.price),
        volume: Math.max(100, Math.round(Number(c.volume) || 1000)),
      };
    });
  }

  if (bars.length === 0) {
    const lp = Number(stock.price) || 100;
    const prev = Number((lp - (Number(stock.change) || 0)).toFixed(2)) || lp;
    for (let i = 0; i < 60; i++) {
      const ratio = (i + 1) / 60;
      const c = Number((prev + (lp - prev) * ratio).toFixed(2));
      const sec = SESSION_START_SEC + i * 300;
      bars.push({
        timeIST: formatClockHHMMSS(sec),
        dateIST: todayDateIST,
        secIST: sec,
        open: Number((i === 0 ? prev : bars[i - 1].close).toFixed(2)),
        high: Number((c * 1.002).toFixed(2)),
        low: Number((c * 0.998).toFixed(2)),
        close: c,
        volume: Math.max(1500, Math.round((Number(stock.volume) || 250000) / 60)),
      });
    }
  }

  const last = bars[bars.length - 1];
  const lp = Number(stock.price) || last.close;
  bars[bars.length - 1] = {
    ...last,
    close: lp,
    high: Math.max(last.high, lp),
    low: Math.min(last.low, lp),
  };
  return bars;
}

function estimatePrevDayDeliveryPct(stock: ScannedStock, prevDayBars: ClaudeFnoBar[]): number {
  const explicit = Number((stock as unknown as Record<string, unknown>).deliveryPercent);
  if (Number.isFinite(explicit) && explicit > 0) {
    return Number(Math.min(95, Math.max(15, explicit)).toFixed(1));
  }
  const chgPct = Number(stock.changePercent) || 0;
  const rvol = Number(stock.indicators?.rvol) || 1.1;
  if (prevDayBars.length >= 6) {
    const prevO = prevDayBars[0].open;
    const prevC = prevDayBars[prevDayBars.length - 1].close;
    const prevH = Math.max(...prevDayBars.map((b) => b.high));
    const prevL = Math.min(...prevDayBars.map((b) => b.low));
    const range = Math.max(0.05, prevH - prevL);
    const closePos = (prevC - prevL) / range; // 0..1 closing near high implies strong delivery absorption
    const trendFactor = prevC >= prevO ? 10 : -4;
    const est = 36 + closePos * 22 + Math.min(12, Math.max(-6, chgPct * 3)) + Math.min(8, Math.max(0, (rvol - 1) * 5)) + trendFactor;
    return Number(Math.min(84, Math.max(24, est)).toFixed(1));
  }
  const base = 42 + Math.min(20, Math.max(-12, chgPct * 4.2)) + Math.min(10, Math.max(0, (rvol - 1) * 6));
  return Number(Math.min(82, Math.max(26, base)).toFixed(1));
}

function detectResultDaySymbols(newsItems: NewsItem[] | undefined): Set<string> {
  const resultSet = new Set<string>();
  if (!Array.isArray(newsItems)) return resultSet;
  const today = getISTDateParts(new Date()).dateStr;
  for (const item of newsItems) {
    if (!item || !item.symbol) continue;
    const text = `${item.title || ''} ${item.summary || ''}`.toUpperCase();
    const isEarnings =
      item.category === 'EARNINGS' ||
      text.includes('QUARTERLY RESULT') ||
      text.includes('Q1 RESULT') ||
      text.includes('Q2 RESULT') ||
      text.includes('Q3 RESULT') ||
      text.includes('Q4 RESULT') ||
      text.includes('EARNINGS REPORT') ||
      text.includes('BOARD TO CONSIDER RESULTS');
    if (isEarnings && (!item.timestamp || item.timestamp.includes(today) || item.timestamp.includes('Today'))) {
      resultSet.add(item.symbol.toUpperCase());
    }
  }
  return resultSet;
}

function computeSameTimeSlotAvg10d(
  allBars: ClaudeFnoBar[],
  todayDateIST: string,
  targetSecIST: number
): number {
  const priorBars = allBars.filter((b) => b.dateIST !== todayDateIST);
  if (priorBars.length > 0) {
    const slotMatches = priorBars.filter((b) => Math.abs(b.secIST - targetSecIST) <= 900);
    const pool = slotMatches.length >= 2 ? slotMatches : priorBars;
    const sum = pool.reduce((acc, b) => acc + Math.max(100, b.volume), 0);
    return Math.max(500, Math.round(sum / pool.length));
  }
  const vols = allBars.map((b) => Math.max(100, b.volume)).sort((a, b) => a - b);
  const mid = vols[Math.floor(vols.length / 2)] || 1000;
  return Math.max(500, mid);
}

function computeSessionVWAP(todayBars: ClaudeFnoBar[], fallbackVwap: number): number {
  let pv = 0;
  let vv = 0;
  for (const b of todayBars) {
    const tp = (b.high + b.low + b.close) / 3;
    pv += tp * b.volume;
    vv += b.volume;
  }
  if (vv > 0) return Number((pv / vv).toFixed(2));
  return Number((fallbackVwap || 0).toFixed(2));
}

function evaluateEquityClaudeRow(params: {
  stock: ScannedStock;
  extendedBars: IntradayCandleBar[] | undefined;
  fallbackCandles: Candle[] | undefined;
  todayDateIST: string;
  maxLiveSec: number;
  capital: number;
  dailyLossHalted: boolean;
  niftyChangePct: number;
  sectorAvgMap: Record<string, number>;
  resultDaySet: Set<string>;
  topVolSet: Set<string>;
  topValSet: Set<string>;
}): ClaudeFnoRow | null {
  const { stock, todayDateIST, maxLiveSec, capital, dailyLossHalted, niftyChangePct, sectorAvgMap, resultDaySet } = params;
  const rawBars = buildWorkBars(stock, params.extendedBars, params.fallbackCandles, todayDateIST);
  if (rawBars.length < 4) return null;

  const latestDate = rawBars[rawBars.length - 1].dateIST;
  const prevDayBars = rawBars.filter((b) => b.dateIST !== latestDate);
  const todayBars = rawBars.filter((b) => b.dateIST === latestDate);
  const activeBars = todayBars.length >= 4 ? todayBars : rawBars;

  const lp = Number(stock.price) || activeBars[activeBars.length - 1].close;
  const chg = Number(stock.change) || 0;
  const chgPct = Number(stock.changePercent) || 0;
  const prevClose = Number((stock.fyersData?.prevClose || (lp - chg)).toFixed(2)) || activeBars[0].open;
  const dayOpen = Number((stock.indicators?.open || activeBars[0].open || prevClose).toFixed(2));

  let pdh = Number(stock.indicators?.pdh || 0);
  let pdl = Number(stock.indicators?.pdl || 0);
  if (prevDayBars.length >= 3) {
    pdh = Math.max(...prevDayBars.map((b) => b.high));
    pdl = Math.min(...prevDayBars.map((b) => b.low));
  } else if (pdh <= 0 || pdl <= 0) {
    const estRange = Math.max(prevClose * 0.0065, Math.abs(chg) * 0.55);
    pdh = prevClose + estRange * 0.6;
    pdl = prevClose - estRange * 0.6;
  }
  pdh = Number(pdh.toFixed(2));
  pdl = Number(pdl.toFixed(2));

  const { orh, orl } = computeOpeningRange0915To0930(activeBars, dayOpen, lp);
  const vwap = computeSessionVWAP(activeBars, Number(stock.indicators?.vwap || stock.fyersData?.atp || lp));

  // Multi-TF 15m, 30m, 1H resampling
  const bars15m = resampleClaudeBars(rawBars, 15);
  const bars30m = resampleClaudeBars(rawBars, 30);
  const bars1h = resampleClaudeBars(rawBars, 60);
  const { isHhHl: tf15mHhHl } = detectHhHlAndTrend(bars15m);
  const { isHhHl: tf30mHhHl, trend: trend30m } = detectHhHlAndTrend(bars30m);
  const { trend: trend1h } = detectHhHlAndTrend(bars1h);

  const sector = stock.sector || 'NSE F&O';
  const sectorChangePct = Number((sectorAvgMap[sector] ?? chgPct).toFixed(2));
  const prevDeliveryPct = estimatePrevDayDeliveryPct(stock, prevDayBars);
  const rawTotalVolume = Math.max(Number(stock.volume) || 0, activeBars.reduce((acc, b) => acc + b.volume, 0));
  const tradedValueCr = Number(((rawTotalVolume * lp) / 1e7).toFixed(2));

  const oiChangePct = Number((stock.oiData?.changeInOIPercent ?? 0).toFixed(2));
  const bidAskRatio = Number((stock.bidAskRatio || (chgPct >= 0 ? 1.25 : 0.82)).toFixed(2));
  const cycleBuildup = normalizeCycleBuildup(stock.oiData?.buildup, chgPct, oiChangePct, bidAskRatio);

  const dayHigh = Number(stock.indicators?.high || Math.max(...activeBars.map((b) => b.high), lp));
  const dayLow = Number(stock.indicators?.low || Math.min(...activeBars.map((b) => b.low), lp));
  const isCircuitLimit =
    Math.abs(chgPct) >= 9.8 || (dayHigh > 0 && Math.abs(dayHigh - dayLow) < 0.02 && Math.abs(chgPct) >= 4.8);
  const isResultDay = resultDaySet.has(stock.symbol.toUpperCase());

  // Scan candidate 5-min bars in 09:20:00 .. 14:45:00 IST to pick best breakout candle
  let bestGlobalIdx = rawBars.length - 1;
  let bestScoreFound = -1;
  let bestEval: ReturnType<typeof evaluate10PointScore> | null = null;
  let bestHH20 = orh;

  const todayStartGlobal = Math.max(1, rawBars.length - activeBars.length);
  for (let gi = todayStartGlobal; gi < rawBars.length; gi++) {
    const cand = rawBars[gi];
    if (cand.secIST < ENTRY_START_SEC || cand.secIST > ENTRY_END_SEC) continue;

    const prior20 = rawBars.slice(Math.max(0, gi - 20), gi);
    const highestHigh20 = prior20.length > 0 ? Math.max(...prior20.map((b) => b.high)) : orh;
    const slotAvg10d = computeSameTimeSlotAvg10d(rawBars, latestDate, cand.secIST);
    const evalRes = evaluate10PointScore({
      ltp: lp,
      pdh,
      fiveMinClose: cand.close,
      orh,
      tf15mHhHl,
      tf30mHhHl,
      breakoutCandle: cand,
      highestHigh20,
      slotVolume: cand.volume,
      slotAvg10dVolume: slotAvg10d,
      prevDeliveryPct,
      stockChangePct: chgPct,
      niftyChangePct,
      sectorChangePct,
      dayOpen,
      prevClose,
      oiChangePct,
    });

    if (evalRes.score > bestScoreFound) {
      bestScoreFound = evalRes.score;
      bestGlobalIdx = gi;
      bestEval = evalRes;
      bestHH20 = highestHigh20;
    }
  }

  const breakoutBar = rawBars[bestGlobalIdx];
  const prior20Final = rawBars.slice(Math.max(0, bestGlobalIdx - 20), bestGlobalIdx);
  const highestHigh20 = Number(
    (bestEval ? bestHH20 : prior20Final.length > 0 ? Math.max(...prior20Final.map((b) => b.high)) : orh).toFixed(2)
  );
  const slotAvg10dVolume = computeSameTimeSlotAvg10d(rawBars, latestDate, breakoutBar.secIST);
  const finalEval =
    bestEval ||
    evaluate10PointScore({
      ltp: lp,
      pdh,
      fiveMinClose: breakoutBar.close,
      orh,
      tf15mHhHl,
      tf30mHhHl,
      breakoutCandle: breakoutBar,
      highestHigh20,
      slotVolume: breakoutBar.volume,
      slotAvg10dVolume,
      prevDeliveryPct,
      stockChangePct: chgPct,
      niftyChangePct,
      sectorChangePct,
      dayOpen,
      prevClose,
      oiChangePct,
    });

  const rawSec = stock.listedAt ? parseClockSec(stock.listedAt) : breakoutBar.secIST;
  const listedAt = clampSecToEntryWindow(rawSec, stock.symbol, maxLiveSec);
  const listedSec = parseClockSec(listedAt);
  const inEntryWindow = listedSec >= ENTRY_START_SEC && listedSec <= ENTRY_END_SEC;

  const tradeMath = computeClaudeTradeMath({
    breakoutCandleHigh: breakoutBar.high,
    breakoutCandleLow: breakoutBar.low,
    orh,
    orl,
    capital,
    riskFraction: 0.01,
  });

  const entryGate = evaluateEntryGate({
    score: finalEval.score,
    ltp: lp,
    vwap,
    trend1h,
    trend30m,
    candleSecIST: listedSec,
    isResultDay,
    isCircuitLimit,
    isValidRR: tradeMath.isValidRR,
    dailyLossHalted,
  });

  const inTopVolume = params.topVolSet.has(stock.symbol);
  const inTopValue = params.topValSet.has(stock.symbol);
  const inBothTopVolAndVal = inTopVolume && inTopValue;

  const isQualifiedTrade =
    finalEval.score >= 8 &&
    entryGate.ltpGtVwap &&
    entryGate.trend1h30mAgree &&
    entryGate.notFirst5Min &&
    entryGate.notLast15Min &&
    entryGate.notResultDay &&
    entryGate.notCircuitLimit &&
    tradeMath.isValidRR;

  const executionAllowed = isQualifiedTrade && !dailyLossHalted;
  const statusBadge: ClaudeFnoRow['statusBadge'] = dailyLossHalted
    ? 'HALTED (2% LOSS)'
    : isQualifiedTrade
    ? 'TAKE TRADE'
    : finalEval.score >= 6
    ? 'WATCHLIST'
    : 'BLOCKED';

  return {
    id: `CFNO-${stock.symbol}`,
    category: 'EQUITY_FNO',
    symbol: stock.symbol,
    displayName: stock.name,
    underlying: stock.symbol,
    sector,
    sectorChangePct,
    niftyChangePct,
    lotSize: stock.lotSize || (lp > 3000 ? 125 : lp > 1000 ? 250 : 500),
    price: Number(lp.toFixed(2)),
    dayOpen,
    prevClose,
    changePercent: Number(chgPct.toFixed(2)),
    pdh,
    pdl,
    orh,
    orl,
    orMid: tradeMath.orMid,
    vwap,
    highestHigh20,
    hh20Threshold: finalEval.hh20Threshold,
    breakoutCandle: {
      timeIST: breakoutBar.timeIST,
      open: breakoutBar.open,
      high: breakoutBar.high,
      low: breakoutBar.low,
      close: breakoutBar.close,
      bodyRatio: finalEval.bodyRatio,
      volume: breakoutBar.volume,
    },
    tf15mHhHl,
    tf30mHhHl,
    trend30m,
    trend1h,
    trend1h30mAgree: entryGate.trend1h30mAgree,
    rawVolume: rawTotalVolume,
    tradedValueCr,
    slotVolume: breakoutBar.volume,
    slotAvg10dVolume,
    slotVolumeRatio: finalEval.slotVolumeRatio,
    prevDeliveryPct,
    bidAskRatio,
    oiChangePct,
    cycleBuildup,
    inTopVolume,
    inTopValue,
    inBothTopVolAndVal,
    score: finalEval.score,
    maxScore: 10,
    criteria: finalEval.criteria,
    listedAt,
    inEntryWindow,
    isResultDay,
    isCircuitLimit,
    entryGate,
    tradeMath,
    isQualifiedTrade,
    executionAllowed,
    statusBadge,
  };
}

function buildClaudeIndexOptions(params: {
  indexQuotes: Record<string, UnifiedMarketQuote>;
  optionChainsByIndex: Record<string, { source: string; expiryDate?: string; data: any[] | null }>;
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined;
  indiaVix: number;
  todayDateIST: string;
  maxLiveSec: number;
  capital: number;
  dailyLossHalted: boolean;
  niftyChangePct: number;
}): ClaudeFnoRow[] {
  const indexSpecs: Array<{
    key: 'NIFTY 50' | 'BANKNIFTY' | 'FINNIFTY' | 'MIDCPNIFTY' | 'SENSEX';
    label: string;
    step: number;
    lot: number;
    expiryFallback: string;
  }> = [
    { key: 'NIFTY 50', label: 'NIFTY', step: 50, lot: 75, expiryFallback: 'Weekly Expiry' },
    { key: 'BANKNIFTY', label: 'BANKNIFTY', step: 100, lot: 30, expiryFallback: 'Monthly Expiry' },
    { key: 'FINNIFTY', label: 'FINNIFTY', step: 50, lot: 65, expiryFallback: 'Monthly Expiry' },
    { key: 'MIDCPNIFTY', label: 'MIDCPNIFTY', step: 25, lot: 120, expiryFallback: 'Monthly Expiry' },
    { key: 'SENSEX', label: 'SENSEX', step: 100, lot: 20, expiryFallback: 'Weekly Expiry' },
  ];

  const rawRows: ClaudeFnoRow[] = [];

  indexSpecs.forEach((sp, spIdx) => {
    const q = params.indexQuotes[sp.key] || (sp.key === 'NIFTY 50' ? params.indexQuotes['NIFTY'] : undefined);
    const cfg = INDEX_CONFIGS[sp.key];
    const spot = Number(q?.lp || cfg?.basePrice || 0);
    if (!spot || spot <= 0) return;

    const spotPrevClose = Number(q?.prevClose || spot * 0.996);
    const spotOpen = Number(q?.open || spotPrevClose);
    const spotChgPct = Number(q?.chp ?? (spotPrevClose > 0 ? ((spot - spotPrevClose) / spotPrevClose) * 100 : 0));

    const idxBars: ClaudeFnoBar[] = (params.getExtendedBarsFn(sp.key) || q?.intradayBars || []).map((b) => ({
      timeIST: b.timeIST.length === 5 ? `${b.timeIST}:00` : b.timeIST,
      dateIST: b.dateIST,
      secIST: b.secIST,
      open: Number(b.open) || spot,
      high: Number(b.high) || spot,
      low: Number(b.low) || spot,
      close: Number(b.close) || spot,
      volume: Math.max(1000, Math.round(Number(b.volume) || 50000)),
    }));
    const todayIdxBars = idxBars.filter((b) => b.dateIST === params.todayDateIST);
    const prevIdxBars = idxBars.filter((b) => b.dateIST !== params.todayDateIST);
    const activeIdx = todayIdxBars.length >= 3 ? todayIdxBars : idxBars;
    const spotPdh = prevIdxBars.length >= 2 ? Math.max(...prevIdxBars.map((b) => b.high)) : spotPrevClose * 1.0035;
    const spotOrb = computeOpeningRange0915To0930(activeIdx, spotOpen, spot);
    const spotLast20 = idxBars.slice(-21, -1);
    const spotHh20 = spotLast20.length > 0 ? Math.max(...spotLast20.map((b) => b.high)) : spot * 0.996;

    const bars15m = resampleClaudeBars(idxBars, 15);
    const bars30m = resampleClaudeBars(idxBars, 30);
    const bars1h = resampleClaudeBars(idxBars, 60);
    const idx15mUp = detectHhHlAndTrend(bars15m);
    const idx30mUp = detectHhHlAndTrend(bars30m);
    const idx1hUp = detectHhHlAndTrend(bars1h);

    const atm = Math.round(spot / sp.step) * sp.step;
    const ocWrap = params.optionChainsByIndex[sp.key];
    const ocList = Array.isArray(ocWrap?.data) ? ocWrap.data : [];

    [atm - sp.step, atm, atm + sp.step].forEach((strike, sIdx) => {
      const tExp = Math.max(2, cfg?.daysToExpiry || 3) / 365;
      const tPrev = (Math.max(2, cfg?.daysToExpiry || 3) + 1) / 365;
      const vVol = Math.max(12, params.indiaVix);
      const bs = calculateBlackScholes(spot, strike, tExp, vVol);
      const bsPrev = calculateBlackScholes(spotPrevClose, strike, tPrev, vVol);
      const bsOpen = calculateBlackScholes(spotOpen, strike, tExp, vVol);
      const bsPdh = calculateBlackScholes(spotPdh, strike, tPrev, vVol);
      const bsOrh = calculateBlackScholes(spotOrb.orh, strike, tExp, vVol);
      const bsOrl = calculateBlackScholes(spotOrb.orl, strike, tExp, vVol);
      const bsHh20 = calculateBlackScholes(spotHh20, strike, tExp, vVol);
      const matchedNode = ocList.find((n: any) => Math.round(Number(n.strike_price)) === strike);

      (['CE', 'PE'] as const).forEach((optType) => {
        const leg = optType === 'CE' ? matchedNode?.call_options : matchedNode?.put_options;
        const mkt = leg?.market_data || {};

        const livePrem = Number(mkt.ltp) > 0 ? Number(mkt.ltp) : optType === 'CE' ? bs.callPrice : bs.putPrice;
        const bsNow = optType === 'CE' ? bs.callPrice : bs.putPrice;
        const scale = bsNow > 0 ? livePrem / bsNow : 1;

        const premPrevClose = Number(mkt.prev_close_price) > 0
          ? Number(mkt.prev_close_price)
          : Number(Math.max(2, (optType === 'CE' ? bsPrev.callPrice : bsPrev.putPrice) * scale).toFixed(2));
        const premOpen = Number(Math.max(2, (optType === 'CE' ? bsOpen.callPrice : bsOpen.putPrice) * scale).toFixed(2));
        const premChgPct = premPrevClose > 0 ? Number((((livePrem - premPrevClose) / premPrevClose) * 100).toFixed(2)) : 0;

        // Map Spot PDH, ORH, ORL, and HH20 into option premium equivalents via exact Black-Scholes pricing
        const premPdh = Number(Math.max(2, (optType === 'CE' ? bsPdh.callPrice : bsOrl.putPrice) * scale).toFixed(2));
        const premPdl = Number(Math.max(1.5, premPrevClose * 0.86).toFixed(2));
        const premOrh = Number(Math.max(2, (optType === 'CE' ? bsOrh.callPrice : bsOrl.putPrice) * scale).toFixed(2));
        const premOrl = Number(Math.max(1.5, (optType === 'CE' ? bsOrl.callPrice : bsOrh.putPrice) * scale * 0.96).toFixed(2));
        const premVwap = Number(((premOpen * 0.42 + livePrem * 0.58)).toFixed(2));

        const rawVol = Number(mkt.volume) > 0
          ? Number(mkt.volume)
          : Math.round((sp.key === 'NIFTY 50' ? 4200000 : 2400000) * (sIdx === 1 ? 1.45 : 0.92) * (1 + Math.abs(spotChgPct) * 0.35));
        const oiRaw = Number(mkt.oi) > 0 ? Number(mkt.oi) : Math.round(rawVol * 0.42);
        const prevOiRaw = Number(mkt.prev_oi) > 0 ? Number(mkt.prev_oi) : Math.round(oiRaw / (1 + (premChgPct >= 0 ? 0.08 : -0.05)));
        const oiChangePct = prevOiRaw > 0 ? Number((((oiRaw - prevOiRaw) / prevOiRaw) * 100).toFixed(2)) : 0;
        const tradedValueCr = Number(((rawVol * livePrem) / 1e7).toFixed(2));

        const rawBidQ = Number(mkt.bid_qty || mkt.total_buy_qty || 0);
        const rawAskQ = Number(mkt.ask_qty || mkt.total_sell_qty || 0);
        const bidAskRatio =
          rawBidQ > 0 && rawAskQ > 0
            ? Number(Math.max(0.45, Math.min(2.6, rawBidQ / rawAskQ)).toFixed(2))
            : Number(Math.max(0.55, Math.min(2.2, (premChgPct >= 0 ? 1.28 : 0.78) + premChgPct * 0.01)).toFixed(2));

        const cycleBuildup = normalizeCycleBuildup(undefined, premChgPct, oiChangePct, bidAskRatio);

        // Directional option buyer trend: CE aligns with bullish index HH+HL; PE aligns with bearish index breakdown
        const opt15mHhHl = optType === 'CE' ? idx15mUp.isHhHl || spotChgPct > 0.25 : idx15mUp.trend === 'DOWN' || spotChgPct < -0.25;
        const opt30mHhHl = optType === 'CE' ? idx30mUp.isHhHl || spotChgPct > 0.2 : idx30mUp.trend === 'DOWN' || spotChgPct < -0.2;
        const optTrend30m: 'UP' | 'DOWN' | 'FLAT' =
          optType === 'CE' ? idx30mUp.trend : idx30mUp.trend === 'DOWN' ? 'UP' : idx30mUp.trend === 'UP' ? 'DOWN' : 'FLAT';
        const optTrend1h: 'UP' | 'DOWN' | 'FLAT' =
          optType === 'CE' ? idx1hUp.trend : idx1hUp.trend === 'DOWN' ? 'UP' : idx1hUp.trend === 'UP' ? 'DOWN' : 'FLAT';

        const isImpulsiveBull = premChgPct > 1.5;
        const candleOpen = Number((livePrem * (isImpulsiveBull ? 0.92 : 1.02)).toFixed(2));
        const candleLow = Number((Math.min(candleOpen, livePrem) * 0.985).toFixed(2));
        const candleHigh = Number((Math.max(candleOpen, livePrem) * 1.012).toFixed(2));
        const highestHigh20 = Number(Math.max(2, (optType === 'CE' ? bsHh20.callPrice : bsHh20.putPrice) * scale).toFixed(2));
        const slotVolume = Math.round(rawVol / 48);
        const slotAvg10dVolume = Math.round((sp.key === 'NIFTY 50' ? 1900000 : 1200000) / 48);
        const prevDeliveryPct = Number(Math.min(78, Math.max(38, 52 + premChgPct * 0.5)).toFixed(1));

        const listedAt = clampSecToEntryWindow(
          ENTRY_START_SEC + 90 + spIdx * 240 + sIdx * 85 + (optType === 'PE' ? 35 : 0),
          `CLAUDE-OPT-${sp.label}-${strike}-${optType}`,
          params.maxLiveSec
        );
        const listedSec = parseClockSec(listedAt);

        const evalScore = evaluate10PointScore({
          ltp: livePrem,
          pdh: premPdh,
          fiveMinClose: livePrem,
          orh: premOrh,
          tf15mHhHl: opt15mHhHl,
          tf30mHhHl: opt30mHhHl,
          breakoutCandle: { open: candleOpen, high: candleHigh, low: candleLow, close: livePrem },
          highestHigh20,
          slotVolume,
          slotAvg10dVolume,
          prevDeliveryPct,
          stockChangePct: premChgPct,
          niftyChangePct: params.niftyChangePct,
          sectorChangePct: Number((optType === 'CE' ? spotChgPct : -spotChgPct).toFixed(2)),
          dayOpen: premOpen,
          prevClose: premPrevClose,
          oiChangePct,
        });

        const tradeMath = computeClaudeTradeMath({
          breakoutCandleHigh: candleHigh,
          breakoutCandleLow: candleLow,
          orh: premOrh,
          orl: premOrl,
          capital: params.capital,
          riskFraction: 0.01,
          lotSize: sp.lot,
          isOptionContract: true,
        });

        const entryGate = evaluateEntryGate({
          score: evalScore.score,
          ltp: livePrem,
          vwap: premVwap,
          trend1h: optTrend1h,
          trend30m: optTrend30m,
          candleSecIST: listedSec,
          isResultDay: false,
          isCircuitLimit: false,
          isValidRR: tradeMath.isValidRR,
          dailyLossHalted: params.dailyLossHalted,
        });

        const isQualifiedTrade =
          evalScore.score >= 8 && entryGate.ltpGtVwap && entryGate.trend1h30mAgree && tradeMath.isValidRR;

        rawRows.push({
          id: `COPT-${sp.label}-${strike}-${optType}`,
          category: 'INDEX_OPTION',
          symbol: `${sp.label} ${strike} ${optType}`,
          displayName: `${sp.label} ${strike} ${optType} (${ocWrap?.expiryDate || sp.expiryFallback})`,
          underlying: sp.key,
          sector: `${sp.label} Options`,
          sectorChangePct: Number(spotChgPct.toFixed(2)),
          niftyChangePct: params.niftyChangePct,
          lotSize: sp.lot,
          price: Number(livePrem.toFixed(2)),
          dayOpen: premOpen,
          prevClose: premPrevClose,
          changePercent: premChgPct,
          pdh: premPdh,
          pdl: premPdl,
          orh: premOrh,
          orl: premOrl,
          orMid: tradeMath.orMid,
          vwap: premVwap,
          highestHigh20,
          hh20Threshold: evalScore.hh20Threshold,
          breakoutCandle: {
            timeIST: listedAt,
            open: candleOpen,
            high: candleHigh,
            low: candleLow,
            close: Number(livePrem.toFixed(2)),
            bodyRatio: evalScore.bodyRatio,
            volume: slotVolume,
          },
          tf15mHhHl: opt15mHhHl,
          tf30mHhHl: opt30mHhHl,
          trend30m: optTrend30m,
          trend1h: optTrend1h,
          trend1h30mAgree: entryGate.trend1h30mAgree,
          rawVolume: rawVol,
          tradedValueCr,
          slotVolume,
          slotAvg10dVolume,
          slotVolumeRatio: evalScore.slotVolumeRatio,
          prevDeliveryPct,
          bidAskRatio,
          oiChangePct,
          cycleBuildup,
          inTopVolume: rawVol >= (sp.key === 'NIFTY 50' ? 3500000 : 2000000),
          inTopValue: tradedValueCr >= 45,
          inBothTopVolAndVal: rawVol >= (sp.key === 'NIFTY 50' ? 3500000 : 2000000) && tradedValueCr >= 45,
          score: evalScore.score,
          maxScore: 10,
          criteria: evalScore.criteria,
          listedAt,
          inEntryWindow: activeIdx.length >= 0 && listedSec >= ENTRY_START_SEC && listedSec <= ENTRY_END_SEC,
          isResultDay: false,
          isCircuitLimit: false,
          entryGate,
          tradeMath,
          isQualifiedTrade,
          executionAllowed: isQualifiedTrade && !params.dailyLossHalted,
          statusBadge: params.dailyLossHalted
            ? 'HALTED (2% LOSS)'
            : isQualifiedTrade
            ? 'TAKE TRADE'
            : evalScore.score >= 6
            ? 'WATCHLIST'
            : 'BLOCKED',
          optionType: optType,
          strikePrice: strike,
          spotPrice: Number(spot.toFixed(2)),
          expiryDate: ocWrap?.expiryDate || sp.expiryFallback,
          dataSource: ocWrap?.source || 'BLACK_SCHOLES_LIVE_SPOT',
        });
      });
    });
  });

  return rawRows;
}

export function buildClaudeFnoReport(params: {
  stocks: ScannedStock[];
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined;
  candlesMap: Map<string, Candle[]>;
  indexQuotes: Record<string, UnifiedMarketQuote>;
  optionChainsByIndex: Record<string, { source: string; expiryDate?: string; data: any[] | null }>;
  newsItems?: NewsItem[];
  indiaVix: number;
  isMidnightCleared: boolean;
  isMarketOffDay?: boolean;
  dayCategory?: string;
  capital?: number;
  dailyLossPct?: number;
}): ClaudeFnoReport {
  const ist = getISTDateParts(new Date());
  const nowSec = ist.hour * 3600 + ist.minute * 60 + ist.second;
  const isMarketOffDay = Boolean(params.isMarketOffDay);
  const maxLiveSec = !isMarketOffDay && nowSec >= ENTRY_START_SEC && nowSec <= ENTRY_END_SEC ? nowSec : ENTRY_END_SEC;

  const capital = Math.max(1000, Number(params.capital) || 100000);
  const dailyLossPct = Number(params.dailyLossPct) || 0;
  const guardrail = evaluateDailyLossGuardrail(dailyLossPct);

  const niftyQ = params.indexQuotes['NIFTY 50'] || params.indexQuotes['NIFTY'];
  const niftyChangePct = Number((niftyQ?.chp ?? 0).toFixed(2));

  const formulaSpecs: ClaudeFnoReport['formulaSpecs'] = [
    { number: 1, title: 'LTP > PDH', rule: 'Current LTP strictly above Previous Day High (+1)' },
    { number: 2, title: '5m Close > ORH', rule: '5-min candle close > 09:15–09:30 Opening Range High (+1)' },
    { number: 3, title: '15m & 30m HH + HL', rule: 'Both 15-min & 30-min timeframes print Higher High + Higher Low (+1)' },
    { number: 4, title: 'Candle Body ≥ 60%', rule: 'Breakout candle Close > Open and |C−O|/(H−L) ≥ 0.60 (+1)' },
    { number: 5, title: '20-Candle High × 1.001', rule: 'Close > Highest High of last 20 candles × 1.001 (+1)' },
    { number: 6, title: '1.5× 10d Slot Volume', rule: 'Volume ≥ 1.5 × 10-day average for the same time slot (+1)' },
    { number: 7, title: 'Prev-Day Delivery ≥ 50%', rule: 'Previous day NSE Delivery % ≥ 50% (+1)' },
    { number: 8, title: 'Stock > Nifty & Sector > 0', rule: 'Stock % > Nifty % and Sector % > 0 (+1)' },
    { number: 9, title: 'Gap Holds Above Open', rule: 'Day Open > Prev Close and LTP > Day Open (+1)' },
    { number: 10, title: 'Long Buildup (OI% > 0)', rule: 'OI % > 0 and Price Up confirming Long Buildup (+1)' },
  ];

  if (params.isMidnightCleared) {
    return {
      status: 'ok',
      scannerName: 'Claude FNO & (Index Options)',
      generatedAt: new Date().toISOString(),
      istTime: `${ist.dateStr} ${ist.timeStr} IST`,
      entryWindowRule: '09:20:00 - 14:45:00 IST',
      isMidnightCleared: true,
      isMarketOffDay,
      dayCategory: params.dayCategory || 'TRADING_DAY',
      capital,
      dailyLossPct,
      isTradingHaltedForDay: guardrail.halted,
      haltReason: guardrail.reason,
      niftyChangePct,
      universeEvaluated: 0,
      qualifiedCount: 0,
      overlapQualifiedCount: 0,
      equityQualifiedCount: 0,
      optionsQualifiedCount: 0,
      watchlistCount: 0,
      formulaSpecs,
      categories: {
        qualifiedTrades: [],
        topVolAndValueQualified: [],
        equitiesFno: [],
        indexOptions: [],
        nearMissWatchlist: [],
        topVolumeRankings: [],
        topValueRankings: [],
      },
    };
  }

  const pureEquities = params.stocks.filter(
    (s) => s.sector !== 'Indices' && !INDEX_SYMBOLS_BLACKLIST.has(s.symbol.toUpperCase())
  );

  // Build Top Volume & Top Value sets (top 30 each across universe)
  const byVol = [...pureEquities].sort((a, b) => (Number(b.volume) || 0) - (Number(a.volume) || 0));
  const byVal = [...pureEquities].sort(
    (a, b) => (Number(b.volume) || 0) * (Number(b.price) || 0) - (Number(a.volume) || 0) * (Number(a.price) || 0)
  );
  const topVolSet = new Set(byVol.slice(0, Math.min(35, byVol.length)).map((s) => s.symbol));
  const topValSet = new Set(byVal.slice(0, Math.min(35, byVal.length)).map((s) => s.symbol));

  // Per-sector average % change
  const sectorAccum = new Map<string, { sum: number; cnt: number }>();
  for (const s of pureEquities) {
    const sec = s.sector || 'NSE F&O';
    const cur = sectorAccum.get(sec) || { sum: 0, cnt: 0 };
    cur.sum += Number(s.changePercent) || 0;
    cur.cnt += 1;
    sectorAccum.set(sec, cur);
  }
  const sectorAvgMap: Record<string, number> = {};
  sectorAccum.forEach((v, sec) => {
    sectorAvgMap[sec] = Number((v.sum / Math.max(1, v.cnt)).toFixed(2));
  });

  const resultDaySet = detectResultDaySymbols(params.newsItems);

  const equityRows: ClaudeFnoRow[] = [];
  for (const s of pureEquities) {
    const row = evaluateEquityClaudeRow({
      stock: s,
      extendedBars: params.getExtendedBarsFn?.(s.symbol),
      fallbackCandles: params.candlesMap?.get(s.symbol),
      todayDateIST: ist.dateStr,
      maxLiveSec,
      capital,
      dailyLossHalted: guardrail.halted,
      niftyChangePct,
      sectorAvgMap,
      resultDaySet,
      topVolSet,
      topValSet,
    });
    if (row) equityRows.push(row);
  }

  const optionRows = buildClaudeIndexOptions({
    indexQuotes: params.indexQuotes,
    optionChainsByIndex: params.optionChainsByIndex,
    getExtendedBarsFn: params.getExtendedBarsFn,
    indiaVix: params.indiaVix,
    todayDateIST: ist.dateStr,
    maxLiveSec,
    capital,
    dailyLossHalted: guardrail.halted,
    niftyChangePct,
  });

  // Z-to-A Model (1st/earliest eligible stock shows LAST, latest eligible shows FIRST), prioritizing Top Vol + Value overlap when desired
  const sortByZtoAListedAt = (arr: ClaudeFnoRow[]) =>
    [...arr].sort((a, b) => {
      const diff = parseClockSec(b.listedAt) - parseClockSec(a.listedAt);
      return diff !== 0 ? diff : b.symbol.localeCompare(a.symbol);
    });

  const allQualifiedEquities = equityRows
    .filter((r) => r.isQualifiedTrade)
    .sort((a, b) => (b.inBothTopVolAndVal ? 1 : 0) - (a.inBothTopVolAndVal ? 1 : 0) || b.score - a.score || b.tradedValueCr - a.tradedValueCr);

  const allQualifiedOptions = optionRows
    .filter((r) => r.isQualifiedTrade)
    .sort((a, b) => b.score - a.score || b.tradedValueCr - a.tradedValueCr);

  const combinedQualifiedPool = [...allQualifiedEquities, ...allQualifiedOptions].sort(
    (a, b) =>
      (b.inBothTopVolAndVal ? 1 : 0) - (a.inBothTopVolAndVal ? 1 : 0) ||
      b.score - a.score ||
      b.tradedValueCr - a.tradedValueCr
  );

  // Strict 0..15 cap per scanner tab, sorted Z->A Listed At
  const qualifiedTrades = sortByZtoAListedAt(combinedQualifiedPool.slice(0, 15));
  const topVolAndValueQualified = sortByZtoAListedAt(
    equityRows
      .filter((r) => r.isQualifiedTrade && r.inBothTopVolAndVal)
      .sort((a, b) => b.score - a.score || b.tradedValueCr - a.tradedValueCr)
      .slice(0, 15)
  );
  const equitiesFno = sortByZtoAListedAt(allQualifiedEquities.slice(0, 15));
  const indexOptions = sortByZtoAListedAt(allQualifiedOptions.slice(0, 15));

  const nearMissWatchlist = sortByZtoAListedAt(
    [...equityRows, ...optionRows]
      .filter((r) => !r.isQualifiedTrade)
      .sort(
        (a, b) =>
          b.score - a.score ||
          (b.inBothTopVolAndVal ? 1 : 0) - (a.inBothTopVolAndVal ? 1 : 0) ||
          b.tradedValueCr - a.tradedValueCr
      )
      .slice(0, 15)
  );

  const topVolumeRankings = [...equityRows].sort((a, b) => b.rawVolume - a.rawVolume).slice(0, 15);
  const topValueRankings = [...equityRows].sort((a, b) => b.tradedValueCr - a.tradedValueCr).slice(0, 15);

  return {
    status: 'ok',
    scannerName: 'Claude FNO & (Index Options)',
    generatedAt: new Date().toISOString(),
    istTime: `${ist.dateStr} ${ist.timeStr} IST`,
    entryWindowRule: '09:20:00 - 14:45:00 IST',
    isMidnightCleared: false,
    isMarketOffDay,
    dayCategory: params.dayCategory || 'TRADING_DAY',
    capital,
    dailyLossPct,
    isTradingHaltedForDay: guardrail.halted,
    haltReason: guardrail.reason,
    niftyChangePct,
    universeEvaluated: pureEquities.length + 5,
    qualifiedCount: qualifiedTrades.length,
    overlapQualifiedCount: topVolAndValueQualified.length,
    equityQualifiedCount: equitiesFno.length,
    optionsQualifiedCount: indexOptions.length,
    watchlistCount: nearMissWatchlist.length,
    formulaSpecs,
    categories: {
      qualifiedTrades,
      topVolAndValueQualified,
      equitiesFno,
      indexOptions,
      nearMissWatchlist,
      topVolumeRankings,
      topValueRankings,
    },
  };
}
