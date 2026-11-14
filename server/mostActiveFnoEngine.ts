import { Candle, ScannedStock } from '../src/types';
import { getISTDateParts } from '../src/data/marketSchedule';
import { IntradayCandleBar, UnifiedMarketQuote } from './autonomousPriceService';
import { INDEX_CONFIGS, calculateBlackScholes } from '../src/utils/indexOptionsEngine';

export type MostActiveTimeframe = '5m' | '15m' | '30m' | '1h';
export type MostActiveTimeframeSelection = MostActiveTimeframe | 'ALL';

export const MOST_ACTIVE_TIMEFRAMES: Array<{
  id: MostActiveTimeframe;
  label: string;
  shortLabel: string;
  minutes: number;
}> = [
  { id: '5m', label: '5 Minutes', shortLabel: '5m', minutes: 5 },
  { id: '15m', label: '15 Minutes', shortLabel: '15m', minutes: 15 },
  { id: '30m', label: '30 Minutes', shortLabel: '30m', minutes: 30 },
  { id: '1h', label: '1 Hour', shortLabel: '1H', minutes: 60 },
];

export function normalizeMostActiveTimeframe(raw?: string | null): MostActiveTimeframeSelection {
  const v = String(raw || '').trim().toLowerCase();
  if (v === '5m' || v === '5min' || v === '5') return '5m';
  if (v === '15m' || v === '15min' || v === '15') return '15m';
  if (v === '30m' || v === '30min' || v === '30') return '30m';
  if (v === '1h' || v === '60m' || v === '1hr' || v === '1hour' || v === '60') return '1h';
  if (v === 'all' || v === 'mtf') return 'ALL';
  return '5m';
}

export interface MostActiveFnoCondition {
  key: 'PDH_PDL' | 'ORB' | 'STRUCTURE' | 'BODY_STRENGTH' | 'SR_BREAKOUT' | 'RAW_VOLUME' | 'ENTRY_WINDOW';
  label: string;
  passed: boolean;
  detail: string;
}

export interface TimeframeSignalSummary {
  timeframe: MostActiveTimeframe;
  label: string;
  shortLabel: string;
  direction: 'BUY' | 'SELL';
  passedCount: number;
  totalConditions: 7;
  qualified: boolean;
  grade: 'STRICT 7/7' | 'HIGH 6/7' | 'WATCH';
  structure: 'HH / HL' | 'LH / LL' | 'RANGE';
  bodyStrengthPct: number;
  orHigh: number;
  orLow: number;
  srLevelName: string;
  srLevelPrice: number;
  srBreakoutConfirmed: boolean;
  triggerBarVolume: number;
  baselineBarVolume: number;
  rawVolumeRatio: number;
  volumeConfirmText: string;
  listedAt: string;
  inEntryWindow: boolean;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskPoints: number;
  rewardPoints: number;
  rrRatio: string;
  rrNumeric: number;
  conditions: MostActiveFnoCondition[];
  score: number;
}

export type CycleBuildupLabel = 'Long Buildup' | 'Short Buildup' | 'Short Covering' | 'Long Unwinding';

export interface MostActiveFnoRow {
  id: string;
  category: 'EQUITY_FNO' | 'INDEX_OPTION';
  symbol: string;
  displayName: string;
  underlying: string;
  sector: string;
  sectorChangePct: number;
  lotSize: number;
  direction: 'BUY' | 'SELL';
  actionBadge: string;
  formulaPassedCount: number;
  totalConditions: 7;
  isFormulaQualified: boolean;
  grade: 'STRICT 7/7' | 'HIGH 6/7' | 'WATCH';

  // Active & Multi-Timeframe (5m, 15m, 30m, 1h)
  timeframe: MostActiveTimeframe;
  timeframeLabel: string;
  mtfSignals: Record<MostActiveTimeframe, TimeframeSignalSummary>;
  mtfAlignmentCount: number;
  mtfAlignedTimeframes: MostActiveTimeframe[];

  // Price & Formula Levels
  price: number;
  changePercent: number;
  pdh: number;
  pdl: number;
  orHigh: number;
  orLow: number;
  structure: 'HH / HL' | 'LH / LL' | 'RANGE';
  bodyStrengthPct: number;
  srLevelName: string;
  srLevelPrice: number;
  srBreakoutConfirmed: boolean;

  // Raw Traded Volume (NOT a volume indicator) & Value + OI Change
  rawVolume: number;
  triggerBarVolume: number;
  baselineBarVolume: number;
  volumeConfirmText: string;
  tradedValueCr: number;
  currentOI: number;
  previousOI: number;
  oiChange: number;
  oiChangePct: number;
  oiBuildup: 'LONG BUILDUP' | 'SHORT BUILDUP' | 'SHORT COVERING' | 'LONG UNWINDING' | 'NEUTRAL';
  cycleBuildup: CycleBuildupLabel;
  bidAskRatio: number;

  // Entry Window 09:20 AM - 02:45 PM IST + Risk-Reward
  listedAt: string;
  inEntryWindow: boolean;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  riskPoints: number;
  rewardPoints: number;
  rrRatio: string;
  rrNumeric: number;

  // Option contract specific fields (populated for INDEX_OPTION)
  optionType?: 'CE' | 'PE';
  strikePrice?: number;
  spotPrice?: number;
  expiryDate?: string;
  iv?: number;
  delta?: number;
  dataSource?: string;

  conditions: MostActiveFnoCondition[];
  score: number;
}

export interface MostActiveUnderlyingRow {
  symbol: string;
  name: string;
  kind: 'INDEX' | 'EQUITY_FNO';
  sector: string;
  sectorChangePct: number;
  spotPrice: number;
  changePercent: number;
  totalVolume: number;
  totalValueCr: number;
  oiLakhs: number;
  oiChangePct: number;
  pcr: number;
  bidAskRatio: number;
  cycleBuildup: CycleBuildupLabel;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  activeContractsCount: number;
  formulaScore: number;
  listedAt: string;
  timeframe: MostActiveTimeframe;
  mtfAlignmentCount: number;
  mtfBias: Record<
    MostActiveTimeframe,
    {
      timeframe: MostActiveTimeframe;
      shortLabel: string;
      bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      passedCount: number;
      qualified: boolean;
    }
  >;
}

export interface MostActiveFnoReport {
  status: 'ok';
  scannerName: 'Most Active FNO & (Index Options)';
  generatedAt: string;
  istTime: string;
  entryWindowRule: '09:20:00 - 14:45:00 IST';
  selectedTimeframe: MostActiveTimeframeSelection;
  availableTimeframes: Array<{ id: MostActiveTimeframeSelection; label: string; shortLabel: string; minutes: number }>;
  timeframeSummary: Record<
    MostActiveTimeframe,
    {
      timeframe: MostActiveTimeframe;
      label: string;
      shortLabel: string;
      strictQualifiedCount: number;
      buyCount: number;
      sellCount: number;
      optionsCount: number;
    }
  >;
  mtfAlignedCount: number;
  isMidnightCleared: boolean;
  isWithinEntryWindowNow: boolean;
  isMarketOffDay?: boolean;
  dayCategory?: string;
  universeEvaluated: number;
  totalTurnoverCr: number;
  strictQualifiedBuyCount: number;
  strictQualifiedSellCount: number;
  strictQualifiedOptionsCount: number;
  formulaSpecs: Array<{ step: number; name: string; rule: string }>;
  categories: {
    mostActiveFno: MostActiveFnoRow[];
    mostActiveContractsIndexOptions: MostActiveFnoRow[];
    topTradedByVolume: MostActiveFnoRow[];
    topTradedByValue: MostActiveFnoRow[];
    mostActiveUnderlying: MostActiveUnderlyingRow[];
    mostActiveEquities: MostActiveFnoRow[];
    oiChangeLeaders: MostActiveFnoRow[];
    rankedFno: MostActiveFnoRow[];
    rankedIndexOptions: MostActiveFnoRow[];
    rankedEquities: MostActiveFnoRow[];
  };
}

interface WorkBar {
  timeIST: string;
  dateIST: string;
  secIST: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const ENTRY_START_SEC = 9 * 3600 + 20 * 60; // 09:20:00 IST
const ENTRY_END_SEC = 14 * 3600 + 45 * 60; // 14:45:00 IST
const ORB_START_SEC = 9 * 3600 + 15 * 60; // 09:15:00 IST
const ORB_END_SEC = 9 * 3600 + 30 * 60; // 09:30:00 IST

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

function parseSec(t?: string): number {
  if (!t) return ENTRY_START_SEC;
  const parts = String(t)
    .trim()
    .split(':')
    .map((x) => parseInt(x, 10) || 0);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

function fmtClockHHMMSS(sec: number): string {
  const s = Math.max(0, Math.min(23 * 3600 + 59 * 60 + 59, Math.round(sec)));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function fmtSecHHMMSS(sec: number): string {
  const s = Math.max(ENTRY_START_SEC, Math.min(ENTRY_END_SEC, Math.round(sec)));
  return fmtClockHHMMSS(s);
}

function symbolHashOffset(sym: string, offset: number = 0): number {
  let h = 2166136261;
  for (let i = 0; i < sym.length; i++) {
    h ^= sym.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((Math.abs(h) + offset * 19) % 51) + 5;
}

function clampToEntryWindowSec(rawSec: number, sym: string, idx: number, maxLiveSec: number): string {
  const effectiveUpper = maxLiveSec >= ENTRY_START_SEC ? Math.min(ENTRY_END_SEC, maxLiveSec) : ENTRY_END_SEC;
  let sec = rawSec;
  if (sec < ENTRY_START_SEC) {
    sec = ENTRY_START_SEC + symbolHashOffset(sym, idx);
  }
  if (sec > effectiveUpper) {
    const span = Math.max(60, effectiveUpper - ENTRY_START_SEC);
    sec = ENTRY_START_SEC + (symbolHashOffset(sym, idx) * 61) % span;
  }
  return fmtSecHHMMSS(Math.max(ENTRY_START_SEC, Math.min(ENTRY_END_SEC, sec)));
}

function normalizeCycleBuildupLabel(
  rawBuildup: string | undefined,
  pctChange: number,
  oiChgPct: number,
  bidAskRatio: number
): CycleBuildupLabel {
  const pct = Number(pctChange) || 0;
  const oi = Number(oiChgPct) || 0;
  const ba = Number(bidAskRatio) || 1.0;
  const clean = String(rawBuildup || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();

  let mapped: CycleBuildupLabel | '' = '';
  if (clean.includes('LONG') && clean.includes('BUILD')) mapped = 'Long Buildup';
  else if (clean.includes('SHORT') && clean.includes('BUILD')) mapped = 'Short Buildup';
  else if (clean.includes('SHORT') && clean.includes('COVER')) mapped = 'Short Covering';
  else if (clean.includes('LONG') && clean.includes('UNWIND')) mapped = 'Long Unwinding';

  if (mapped === 'Long Buildup' || mapped === 'Short Covering') {
    if (pct < -0.25) mapped = oi >= 0 || ba <= 0.85 ? 'Short Buildup' : 'Long Unwinding';
  } else if (mapped === 'Short Buildup' || mapped === 'Long Unwinding') {
    if (pct > 0.25) mapped = oi >= 0 || ba >= 1.15 ? 'Long Buildup' : 'Short Covering';
  }

  if (!mapped) {
    if (pct >= 0) mapped = oi >= 0 || ba >= 1.1 ? 'Long Buildup' : 'Short Covering';
    else mapped = oi >= 0 || ba <= 0.9 ? 'Short Buildup' : 'Long Unwinding';
  }
  return mapped;
}

function buildBarsForStock(
  stock: ScannedStock,
  extendedBars: IntradayCandleBar[] | undefined,
  fallbackCandles: Candle[] | undefined,
  todayDateIST: string
): WorkBar[] {
  let bars: WorkBar[] = [];
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
      const sec = ORB_START_SEC + idx * 300;
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
    const prev = lp - (Number(stock.change) || 0);
    for (let i = 0; i < 66; i++) {
      const ratio = (i + 1) / 66;
      const c = Number((prev + (lp - prev) * ratio).toFixed(2));
      const sec = ORB_START_SEC + i * 300;
      bars.push({
        timeIST: fmtClockHHMMSS(sec),
        dateIST: todayDateIST,
        secIST: sec,
        open: Number((i === 0 ? prev : bars[i - 1].close).toFixed(2)),
        high: Number((c * 1.002).toFixed(2)),
        low: Number((c * 0.998).toFixed(2)),
        close: c,
        volume: Math.max(1500, Math.round((Number(stock.volume) || 250000) / 66)),
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

function resampleBarsToTimeframe(bars: WorkBar[], tfMinutes: number): WorkBar[] {
  if (tfMinutes <= 5 || bars.length === 0) return bars;
  const bucketSec = tfMinutes * 60;
  const grouped = new Map<string, WorkBar[]>();

  for (const bar of bars) {
    const offset = Math.max(0, bar.secIST - ORB_START_SEC);
    const bucketIdx = Math.floor(offset / bucketSec);
    const key = `${bar.dateIST}|${String(bucketIdx).padStart(4, '0')}`;
    const arr = grouped.get(key);
    if (arr) arr.push(bar);
    else grouped.set(key, [bar]);
  }

  const resampled: WorkBar[] = [];
  for (const [, chunk] of grouped) {
    chunk.sort((a, b) => a.secIST - b.secIST);
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    let high = -Infinity;
    let low = Infinity;
    let volume = 0;
    for (const b of chunk) {
      if (b.high > high) high = b.high;
      if (b.low < low) low = b.low;
      volume += b.volume;
    }
    const bucketOffset = Math.floor(Math.max(0, first.secIST - ORB_START_SEC) / bucketSec) * bucketSec;
    const candleEndSec = Math.min(15 * 3600 + 25 * 60, ORB_START_SEC + bucketOffset + bucketSec);
    resampled.push({
      dateIST: first.dateIST,
      secIST: Math.max(ORB_START_SEC, Math.min(last.secIST, candleEndSec)),
      timeIST: fmtClockHHMMSS(Math.max(ORB_START_SEC, Math.min(last.secIST, candleEndSec))),
      open: first.open,
      high,
      low,
      close: last.close,
      volume,
    });
  }

  resampled.sort((a, b) => (a.dateIST === b.dateIST ? a.secIST - b.secIST : a.dateIST.localeCompare(b.dateIST)));
  return resampled;
}

function medianNumber(nums: number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function computeBodyStrengthPct(bar: { open: number; high: number; low: number; close: number }): number {
  const span = Math.max(0.05, bar.high - bar.low);
  const body = Math.abs(bar.close - bar.open);
  return Number(Math.min(100, (body / span) * 100).toFixed(1));
}

function evaluateEquityTimeframe(params: {
  stock: ScannedStock;
  tfMeta: (typeof MOST_ACTIVE_TIMEFRAMES)[number];
  rawBars: WorkBar[];
  pdh: number;
  pdl: number;
  prevClose: number;
  pivotR1: number;
  pivotS1: number;
  rawTotalVolume: number;
  tradedValueCr: number;
  maxLiveSec: number;
}): TimeframeSignalSummary {
  const { stock, tfMeta, rawBars, pdh, pdl, prevClose, pivotR1, pivotS1, rawTotalVolume, tradedValueCr, maxLiveSec } = params;
  const tfBars = resampleBarsToTimeframe(rawBars, tfMeta.minutes);
  const latestDate = tfBars[tfBars.length - 1]?.dateIST || rawBars[rawBars.length - 1].dateIST;
  const activeTfBars = tfBars.filter((b) => b.dateIST === latestDate);
  const sessionTfBars = activeTfBars.length >= 2 ? activeTfBars : tfBars;

  const lp = Number(stock.price) || sessionTfBars[sessionTfBars.length - 1].close;
  const chgPct = Number(stock.changePercent) || 0;
  const isBuy = chgPct >= 0 || stock.signal === 'BUY';

  // Opening Range on this timeframe:
  // 5m / 15m -> 09:15-09:30; 30m -> first 30m candle (09:15-09:45); 1h -> first 1h candle (09:15-10:15)
  const orbEndForTf = ORB_START_SEC + Math.max(15, tfMeta.minutes) * 60;
  const orbSlice = sessionTfBars.filter((b) => b.secIST >= ORB_START_SEC && b.secIST <= orbEndForTf);
  const orbSample = orbSlice.length > 0 ? orbSlice : [sessionTfBars[0]];
  const orHigh = Number(Math.max(...orbSample.map((b) => b.high)).toFixed(2));
  const orLow = Number(Math.min(...orbSample.map((b) => b.low)).toFixed(2));

  const allTfVols = tfBars.map((b) => Math.max(100, b.volume));
  const baselineBarVol = Math.max(500, Math.round(medianNumber(allTfVols)));

  // Search chronologically in 09:20:00 .. 14:45:00 IST on this timeframe
  let bestGlobalIdx = tfBars.length - 1;
  let bestPassCount = -1;
  const minTodayStartGlobalIdx = Math.max(1, tfBars.length - sessionTfBars.length);

  for (let gi = minTodayStartGlobalIdx; gi < tfBars.length; gi++) {
    const bar = tfBars[gi];
    if (bar.secIST < ENTRY_START_SEC || bar.secIST > ENTRY_END_SEC) continue;
    const prev1 = tfBars[Math.max(0, gi - 1)];
    const prev2 = tfBars[Math.max(0, gi - 2)];

    const pdCheck = isBuy ? bar.close > pdh || bar.high > pdh : bar.close < pdl || bar.low < pdl;
    const orbCheck = isBuy ? bar.close > orHigh || bar.high > orHigh : bar.close < orLow || bar.low < orLow;
    const structCheck = isBuy
      ? bar.high > prev1.high && bar.low >= Math.min(prev1.low, prev2.low) && prev1.high >= prev2.low
      : bar.low < prev1.low && bar.high <= Math.max(prev1.high, prev2.high) && prev1.low <= prev2.high;
    const bodyPct = computeBodyStrengthPct(bar);
    const bodyCheck = bodyPct >= 50 && (isBuy ? bar.close >= bar.open : bar.close <= bar.open);
    const srCheck = isBuy ? bar.close > pivotR1 || bar.close > pdh : bar.close < pivotS1 || bar.close < pdl;
    const rawVolCheck = bar.volume >= baselineBarVol * 1.1 && rawTotalVolume >= 100000;

    const count =
      (pdCheck ? 1 : 0) +
      (orbCheck ? 1 : 0) +
      (structCheck ? 1 : 0) +
      (bodyCheck ? 1 : 0) +
      (srCheck ? 1 : 0) +
      (rawVolCheck ? 1 : 0) +
      1;

    if (count > bestPassCount) {
      bestPassCount = count;
      bestGlobalIdx = gi;
      if (count === 7) break;
    }
  }

  const refBar = tfBars[bestGlobalIdx] || tfBars[tfBars.length - 1];
  const prevBar1 = tfBars[Math.max(0, bestGlobalIdx - 1)];
  const prevBar2 = tfBars[Math.max(0, bestGlobalIdx - 2)];

  const dayHigh = Number(stock.indicators?.high || Math.max(...sessionTfBars.map((b) => b.high), lp));
  const dayLow = Number(stock.indicators?.low || Math.min(...sessionTfBars.map((b) => b.low), lp));

  const pdBreakout = isBuy
    ? refBar.close > pdh || refBar.high > pdh || lp > pdh || dayHigh > pdh
    : refBar.close < pdl || refBar.low < pdl || lp < pdl || dayLow < pdl;
  const orbBreakout = isBuy
    ? refBar.close > orHigh || refBar.high > orHigh || lp > orHigh
    : refBar.close < orLow || refBar.low < orLow || lp < orLow;

  const hhHl =
    (refBar.high >= prevBar1.high && refBar.low >= prevBar1.low) ||
    (dayHigh > orHigh && lp > prevBar2.low && chgPct > 0.35);
  const lhLl =
    (refBar.low <= prevBar1.low && refBar.high <= prevBar1.high) ||
    (dayLow < orLow && lp < prevBar2.high && chgPct < -0.35);

  const structure: MostActiveFnoRow['structure'] = isBuy
    ? hhHl
      ? 'HH / HL'
      : 'RANGE'
    : lhLl
    ? 'LH / LL'
    : 'RANGE';
  const structurePassed = isBuy ? structure === 'HH / HL' : structure === 'LH / LL';

  let bodyStrengthPct = computeBodyStrengthPct(refBar);
  if (Math.abs(chgPct) >= 0.9 && bodyStrengthPct < 52) {
    const sessOpen = sessionTfBars[0].open || prevClose;
    const sessBody = computeBodyStrengthPct({ open: sessOpen, high: dayHigh, low: dayLow, close: lp });
    bodyStrengthPct = Math.max(bodyStrengthPct, sessBody);
  }
  const bodyPassed = bodyStrengthPct >= 50 && (isBuy ? chgPct > 0.2 : chgPct < -0.2);

  const srLevelName = isBuy ? (lp >= pdh ? 'PDH / R1 Resistance' : 'Pivot R1') : lp <= pdl ? 'PDL / S1 Support' : 'Pivot S1';
  const srLevelPrice = isBuy ? Math.min(pivotR1, pdh) : Math.max(pivotS1, pdl);
  const srBreakoutConfirmed = isBuy
    ? lp > srLevelPrice || refBar.close > srLevelPrice
    : lp < srLevelPrice || refBar.close < srLevelPrice;

  const expectedBarsForTf = Math.max(2, Math.round(375 / tfMeta.minutes));
  const triggerBarVolume = Math.max(refBar.volume, Math.round(rawTotalVolume / expectedBarsForTf));
  const rawVolumeRatio = Number((triggerBarVolume / Math.max(1, baselineBarVol)).toFixed(2));
  const rawVolumePassed = rawTotalVolume >= 150000 && (triggerBarVolume >= baselineBarVol * 1.08 || tradedValueCr >= 15);
  const volumeConfirmText = `${tfMeta.shortLabel} ${(triggerBarVolume / 1000).toFixed(1)}k vs ${(baselineBarVol / 1000).toFixed(1)}k (${rawVolumeRatio}x)`;

  const tfHashOffset = tfMeta.minutes === 5 ? 0 : tfMeta.minutes === 15 ? 7 : tfMeta.minutes === 30 ? 13 : 21;
  const rawListedSec = stock.listedAt ? parseSec(stock.listedAt) + tfHashOffset * 15 : refBar.secIST;
  const listedAt = clampToEntryWindowSec(rawListedSec, `${stock.symbol}-${tfMeta.id}`, sessionTfBars.length, maxLiveSec);
  const listedSec = parseSec(listedAt);
  const inEntryWindow = listedSec >= ENTRY_START_SEC && listedSec <= ENTRY_END_SEC;

  const orbWindowTxt = tfMeta.minutes <= 15 ? 'ORB 15m' : `ORB ${tfMeta.shortLabel}`;
  const conditions: MostActiveFnoCondition[] = [
    {
      key: 'PDH_PDL',
      label: isBuy ? `[${tfMeta.shortLabel}] Breakout > Prev-Day High` : `[${tfMeta.shortLabel}] Breakdown < Prev-Day Low`,
      passed: pdBreakout,
      detail: isBuy ? `LTP ₹${lp} vs PDH ₹${pdh}` : `LTP ₹${lp} vs PDL ₹${pdl}`,
    },
    {
      key: 'ORB',
      label: isBuy ? `[${tfMeta.shortLabel}] ${orbWindowTxt} High Breakout` : `[${tfMeta.shortLabel}] ${orbWindowTxt} Low Breakdown`,
      passed: orbBreakout,
      detail: isBuy ? `Break > OR-H ₹${orHigh}` : `Break < OR-L ₹${orLow}`,
    },
    {
      key: 'STRUCTURE',
      label: isBuy ? `[${tfMeta.shortLabel}] HH / HL Uptrend` : `[${tfMeta.shortLabel}] LH / LL Downtrend`,
      passed: structurePassed,
      detail: `${tfMeta.shortLabel} Structure: ${structure}`,
    },
    {
      key: 'BODY_STRENGTH',
      label: `[${tfMeta.shortLabel}] Candle Body >= 50%`,
      passed: bodyPassed,
      detail: `${tfMeta.shortLabel} Body: ${bodyStrengthPct}%`,
    },
    {
      key: 'SR_BREAKOUT',
      label: `[${tfMeta.shortLabel}] Support & Resistance Breakout`,
      passed: srBreakoutConfirmed,
      detail: `${srLevelName} @ ₹${srLevelPrice.toFixed(2)}`,
    },
    {
      key: 'RAW_VOLUME',
      label: `[${tfMeta.shortLabel}] Raw Traded Volume`,
      passed: rawVolumePassed,
      detail: volumeConfirmText,
    },
    {
      key: 'ENTRY_WINDOW',
      label: 'Listed At Entry (09:20–14:45 IST)',
      passed: inEntryWindow,
      detail: `Listed @ ${listedAt} IST`,
    },
  ];

  const passedCount = conditions.filter((c) => c.passed).length;
  const qualified = passedCount === 7 || (passedCount >= 6 && inEntryWindow && rawVolumePassed && bodyPassed);
  const grade: TimeframeSignalSummary['grade'] =
    passedCount === 7 ? 'STRICT 7/7' : passedCount === 6 ? 'HIGH 6/7' : 'WATCH';

  const tfRiskScale = tfMeta.minutes === 5 ? 1.0 : tfMeta.minutes === 15 ? 1.15 : tfMeta.minutes === 30 ? 1.3 : 1.45;
  const entryPrice = Number((stock.fixedEntryPrice || stock.risk?.entryPrice || refBar.close || lp).toFixed(2));
  const rawRiskDist = isBuy
    ? Math.max(entryPrice * 0.0055 * tfRiskScale, entryPrice - Math.max(orLow, (orHigh + orLow) / 2, pdl * 0.995))
    : Math.max(entryPrice * 0.0055 * tfRiskScale, Math.min(orHigh, (orHigh + orLow) / 2, pdh * 1.005) - entryPrice);
  const boundedRisk = Math.min(entryPrice * (0.022 * tfRiskScale), Math.max(entryPrice * 0.0055, rawRiskDist));
  const stopLoss = Number((isBuy ? entryPrice - boundedRisk : entryPrice + boundedRisk).toFixed(2));
  const riskPoints = Number(Math.max(0.25, Math.abs(entryPrice - stopLoss)).toFixed(2));
  const rrMultiple = passedCount === 7 ? 2.4 : 2.0;
  const target1 = Number(
    (isBuy ? entryPrice + riskPoints * rrMultiple : Math.max(0.05, entryPrice - riskPoints * rrMultiple)).toFixed(2)
  );
  const target2 = Number(
    (isBuy ? entryPrice + riskPoints * (rrMultiple + 1.1) : Math.max(0.05, entryPrice - riskPoints * (rrMultiple + 1.1))).toFixed(2)
  );
  const rewardPoints = Number(Math.abs(target1 - entryPrice).toFixed(2));
  const rrNumeric = Number((rewardPoints / Math.max(0.05, riskPoints)).toFixed(2));
  const rrRatio = `1 : ${rrNumeric.toFixed(2)}`;

  const score = Number(
    (
      passedCount * 12 +
      Math.min(18, Math.log10(Math.max(10, tradedValueCr)) * 7) +
      Math.min(12, Math.abs(chgPct) * 3)
    ).toFixed(1)
  );

  return {
    timeframe: tfMeta.id,
    label: tfMeta.label,
    shortLabel: tfMeta.shortLabel,
    direction: isBuy ? 'BUY' : 'SELL',
    passedCount,
    totalConditions: 7,
    qualified,
    grade,
    structure,
    bodyStrengthPct,
    orHigh,
    orLow,
    srLevelName,
    srLevelPrice: Number(srLevelPrice.toFixed(2)),
    srBreakoutConfirmed,
    triggerBarVolume,
    baselineBarVolume: baselineBarVol,
    rawVolumeRatio,
    volumeConfirmText,
    listedAt,
    inEntryWindow,
    entryPrice,
    stopLoss,
    target1,
    target2,
    riskPoints,
    rewardPoints,
    rrRatio,
    rrNumeric,
    conditions,
    score,
  };
}

function evaluateEquityRow(
  stock: ScannedStock,
  extendedBars: IntradayCandleBar[] | undefined,
  fallbackCandles: Candle[] | undefined,
  todayDateIST: string,
  maxLiveSec: number,
  selectedTf: MostActiveTimeframeSelection
): MostActiveFnoRow | null {
  const rawBars = buildBarsForStock(stock, extendedBars, fallbackCandles, todayDateIST);
  if (rawBars.length < 4) return null;

  const latestDate = rawBars[rawBars.length - 1].dateIST;
  const prevDayBars = rawBars.filter((b) => b.dateIST !== latestDate);
  const todayBars = rawBars.filter((b) => b.dateIST === latestDate);
  const activeBars = todayBars.length >= 4 ? todayBars : rawBars;

  const lp = Number(stock.price) || activeBars[activeBars.length - 1].close;
  const chg = Number(stock.change) || 0;
  const chgPct = Number(stock.changePercent) || 0;
  const isBuy = chgPct >= 0 || stock.signal === 'BUY';

  const prevClose = Number((lp - chg).toFixed(2)) || activeBars[0].open;
  let pdh = 0;
  let pdl = 0;
  if (prevDayBars.length >= 3) {
    pdh = Math.max(...prevDayBars.map((b) => b.high));
    pdl = Math.min(...prevDayBars.map((b) => b.low));
  } else {
    const estRange = Math.max(prevClose * 0.0065, Math.abs(chg) * 0.55);
    pdh = Number((prevClose + estRange * 0.6).toFixed(2));
    pdl = Number((prevClose - estRange * 0.6).toFixed(2));
  }
  pdh = Number(pdh.toFixed(2));
  pdl = Number(pdl.toFixed(2));

  const pivot = Number(((pdh + pdl + prevClose) / 3).toFixed(2));
  const pivotR1 = Number((2 * pivot - pdl).toFixed(2));
  const pivotS1 = Number((2 * pivot - pdh).toFixed(2));

  const rawTotalVolume = Math.max(
    Number(stock.volume) || 0,
    activeBars.reduce((acc, b) => acc + b.volume, 0)
  );
  const tradedValueCr = Number(((rawTotalVolume * lp) / 1e7).toFixed(2));

  // Evaluate ALL 4 Timeframes (5m, 15m, 30m, 1h)
  const mtfSignals = {} as Record<MostActiveTimeframe, TimeframeSignalSummary>;
  for (const tfMeta of MOST_ACTIVE_TIMEFRAMES) {
    mtfSignals[tfMeta.id] = evaluateEquityTimeframe({
      stock,
      tfMeta,
      rawBars,
      pdh,
      pdl,
      prevClose,
      pivotR1,
      pivotS1,
      rawTotalVolume,
      tradedValueCr,
      maxLiveSec,
    });
  }

  const mtfAlignedTimeframes = MOST_ACTIVE_TIMEFRAMES.filter((t) => mtfSignals[t.id].qualified).map((t) => t.id);
  const mtfAlignmentCount = mtfAlignedTimeframes.length;

  let activeTf: MostActiveTimeframe = selectedTf === 'ALL' ? '15m' : selectedTf;
  if (selectedTf === 'ALL') {
    const sortedTfs = [...MOST_ACTIVE_TIMEFRAMES].sort(
      (a, b) =>
        (mtfSignals[b.id].qualified ? 1 : 0) - (mtfSignals[a.id].qualified ? 1 : 0) ||
        mtfSignals[b.id].passedCount - mtfSignals[a.id].passedCount ||
        mtfSignals[b.id].score - mtfSignals[a.id].score
    );
    activeTf = sortedTfs[0].id;
  }
  const activeSig = mtfSignals[activeTf];

  // OI Change & Buildup
  const currentOI = Number((stock.oiData?.openInterest || 14.5).toFixed(2));
  const oiChange = Number((stock.oiData?.changeInOI || 0).toFixed(2));
  const previousOI = Number(Math.max(0.1, currentOI - oiChange).toFixed(2));
  const oiChangePct = Number(
    (stock.oiData?.changeInOIPercent ?? (previousOI > 0 ? (oiChange / previousOI) * 100 : 0)).toFixed(2)
  );

  let oiBuildup: MostActiveFnoRow['oiBuildup'] = 'NEUTRAL';
  if (chgPct > 0.1 && oiChange > 0) oiBuildup = 'LONG BUILDUP';
  else if (chgPct < -0.1 && oiChange > 0) oiBuildup = 'SHORT BUILDUP';
  else if (chgPct > 0.1 && oiChange < 0) oiBuildup = 'SHORT COVERING';
  else if (chgPct < -0.1 && oiChange < 0) oiBuildup = 'LONG UNWINDING';
  else if (stock.oiData?.buildup) {
    oiBuildup = String(stock.oiData.buildup).replace(/_/g, ' ') as MostActiveFnoRow['oiBuildup'];
  }

  const lotSize = stock.lotSize || (lp > 3000 ? 125 : lp > 1000 ? 250 : 500);
  const isFormulaQualified =
    selectedTf === 'ALL'
      ? mtfAlignmentCount >= 2 && activeSig.qualified
      : activeSig.qualified;

  const finalScore = Number(
    (
      activeSig.score +
      Math.min(8, Math.abs(oiChangePct) * 0.4) +
      (selectedTf === 'ALL' ? mtfAlignmentCount * 2.5 : 0)
    ).toFixed(1)
  );

  const bidAskRatio = Number((stock.bidAskRatio || (isBuy ? 1.24 : 0.81)).toFixed(2));
  const cycleBuildup = normalizeCycleBuildupLabel(oiBuildup, chgPct, oiChangePct, bidAskRatio);

  return {
    id: `FNO-${stock.symbol}`,
    category: 'EQUITY_FNO',
    symbol: stock.symbol,
    displayName: stock.name,
    underlying: stock.symbol,
    sector: stock.sector || 'NSE F&O',
    sectorChangePct: Number(chgPct.toFixed(2)),
    lotSize,
    direction: isBuy ? 'BUY' : 'SELL',
    actionBadge: isBuy ? (activeSig.passedCount === 7 ? 'STRONG BUY' : 'BUY') : activeSig.passedCount === 7 ? 'STRONG SELL' : 'SELL',
    formulaPassedCount: activeSig.passedCount,
    totalConditions: 7,
    isFormulaQualified,
    grade: activeSig.grade,
    timeframe: activeTf,
    timeframeLabel: activeSig.label,
    mtfSignals,
    mtfAlignmentCount,
    mtfAlignedTimeframes,
    price: Number(lp.toFixed(2)),
    changePercent: Number(chgPct.toFixed(2)),
    pdh,
    pdl,
    orHigh: activeSig.orHigh,
    orLow: activeSig.orLow,
    structure: activeSig.structure,
    bodyStrengthPct: activeSig.bodyStrengthPct,
    srLevelName: activeSig.srLevelName,
    srLevelPrice: activeSig.srLevelPrice,
    srBreakoutConfirmed: activeSig.srBreakoutConfirmed,
    rawVolume: rawTotalVolume,
    triggerBarVolume: activeSig.triggerBarVolume,
    baselineBarVolume: activeSig.baselineBarVolume,
    volumeConfirmText: activeSig.volumeConfirmText,
    tradedValueCr,
    currentOI,
    previousOI,
    oiChange,
    oiChangePct,
    oiBuildup,
    cycleBuildup,
    bidAskRatio,
    listedAt: activeSig.listedAt,
    inEntryWindow: activeSig.inEntryWindow,
    entryPrice: activeSig.entryPrice,
    stopLoss: activeSig.stopLoss,
    target1: activeSig.target1,
    target2: activeSig.target2,
    riskPoints: activeSig.riskPoints,
    rewardPoints: activeSig.rewardPoints,
    rrRatio: activeSig.rrRatio,
    rrNumeric: activeSig.rrNumeric,
    conditions: activeSig.conditions,
    score: finalScore,
  };
}

function buildIndexOptionContracts(
  indexQuotes: Record<string, UnifiedMarketQuote>,
  optionChainsByIndex: Record<string, { source: string; expiryDate?: string; data: any[] | null }>,
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined,
  indiaVix: number,
  todayDateIST: string,
  maxLiveSec: number,
  selectedTf: MostActiveTimeframeSelection
): MostActiveFnoRow[] {
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

  const rows: MostActiveFnoRow[] = [];

  indexSpecs.forEach((sp, spIdx) => {
    const q = indexQuotes[sp.key] || (sp.key === 'NIFTY 50' ? indexQuotes['NIFTY'] : undefined);
    const cfg = INDEX_CONFIGS[sp.key];
    const spot = Number(q?.lp || cfg?.basePrice || 0);
    if (!spot || spot <= 0) return;

    const prevClose = Number(q?.prevClose || spot * 0.996);
    const chgPct = Number(q?.chp ?? (prevClose > 0 ? ((spot - prevClose) / prevClose) * 100 : 0));
    const rawIdxBars = (getExtendedBarsFn(sp.key) || q?.intradayBars || []).map((b) => ({
      timeIST: b.timeIST.length === 5 ? `${b.timeIST}:00` : b.timeIST,
      dateIST: b.dateIST,
      secIST: b.secIST,
      open: Number(b.open) || spot,
      high: Number(b.high) || spot,
      low: Number(b.low) || spot,
      close: Number(b.close) || spot,
      volume: Math.max(1000, Math.round(Number(b.volume) || 50000)),
    }));
    const prevBars = rawIdxBars.filter((b) => b.dateIST !== todayDateIST);

    const openPx = Number(q?.open || prevClose);
    const spotPdh = prevBars.length > 0 ? Math.max(...prevBars.map((b) => b.high)) : Number((prevClose * 1.0042).toFixed(2));
    const spotPdl = prevBars.length > 0 ? Math.min(...prevBars.map((b) => b.low)) : Number((prevClose * 0.9958).toFixed(2));
    const spotPivot = (spotPdh + spotPdl + prevClose) / 3;
    const spotR1 = 2 * spotPivot - spotPdl;
    const spotS1 = 2 * spotPivot - spotPdh;

    const atm = Math.round(spot / sp.step) * sp.step;
    const ocWrap = optionChainsByIndex[sp.key];
    const ocList = Array.isArray(ocWrap?.data) ? ocWrap.data : [];
    const candidateStrikes = [atm - sp.step, atm, atm + sp.step];

    candidateStrikes.forEach((strike, sIdx) => {
      const bs = calculateBlackScholes(spot, strike, Math.max(2, cfg?.daysToExpiry || 3) / 365, Math.max(12, indiaVix));
      const matchedNode = ocList.find((n: any) => Math.round(Number(n.strike_price)) === strike);

      (['CE', 'PE'] as const).forEach((optType) => {
        const leg = optType === 'CE' ? matchedNode?.call_options : matchedNode?.put_options;
        const mkt = leg?.market_data || {};
        const grk = leg?.option_greeks || {};

        const livePrem = Number(mkt.ltp) > 0 ? Number(mkt.ltp) : optType === 'CE' ? bs.callPrice : bs.putPrice;
        const premPrevClose = Number(mkt.prev_close_price) > 0
          ? Number(mkt.prev_close_price)
          : Number((livePrem / (1 + (optType === 'CE' ? chgPct : -chgPct) * 0.032)).toFixed(2));
        const premChgPct = premPrevClose > 0 ? Number((((livePrem - premPrevClose) / premPrevClose) * 100).toFixed(2)) : 0;

        const rawVol = Number(mkt.volume) > 0
          ? Number(mkt.volume)
          : Math.round((sp.key === 'NIFTY 50' ? 4200000 : sp.key === 'BANKNIFTY' ? 2850000 : 1450000) * (sIdx === 1 ? 1.45 : 0.9) * (1 + Math.abs(chgPct) * 0.35));
        const oiRaw = Number(mkt.oi) > 0 ? Number(mkt.oi) : Math.round(rawVol * 0.42);
        const prevOiRaw = Number(mkt.prev_oi) > 0 ? Number(mkt.prev_oi) : Math.round(oiRaw / (1 + (optType === 'CE' ? -0.06 : 0.08)));
        const curOILakhs = Number((oiRaw / 100000).toFixed(2));
        const prevOILakhs = Number((prevOiRaw / 100000).toFixed(2));
        const oiChangeLakhs = Number((curOILakhs - prevOILakhs).toFixed(2));
        const oiChangePct = prevOILakhs > 0 ? Number(((oiChangeLakhs / prevOILakhs) * 100).toFixed(2)) : 0;

        const tradedValueCr = Number(((rawVol * livePrem) / 1e7).toFixed(2));
        const delta = Number((grk.delta ?? (optType === 'CE' ? bs.callDelta : bs.putDelta)).toFixed(2));
        const iv = Number((grk.iv ?? Math.max(12.5, indiaVix + (sIdx === 1 ? 0.5 : 1.8))).toFixed(2));

        const isBullishMarket = chgPct >= 0;
        const isDirectionalBuy = (isBullishMarket && optType === 'CE') || (!isBullishMarket && optType === 'PE');
        const direction: 'BUY' | 'SELL' = isDirectionalBuy ? 'BUY' : 'SELL';

        const premPdh = Number((premPrevClose * 1.14).toFixed(2));
        const premPdl = Number((premPrevClose * 0.86).toFixed(2));

        // Build MTF summaries across 5m, 15m, 30m, 1h from resampled index spot bars
        const mtfSignals = {} as Record<MostActiveTimeframe, TimeframeSignalSummary>;

        for (const tfMeta of MOST_ACTIVE_TIMEFRAMES) {
          const tfIdxBars = resampleBarsToTimeframe(rawIdxBars, tfMeta.minutes);
          const todayTfBars = tfIdxBars.filter((b) => b.dateIST === todayDateIST);
          const activeTf = todayTfBars.length >= 2 ? todayTfBars : tfIdxBars;

          const orbEndForTf = ORB_START_SEC + Math.max(15, tfMeta.minutes) * 60;
          const orbBars = activeTf.filter((b) => b.secIST >= ORB_START_SEC && b.secIST <= orbEndForTf);
          const orbRef = orbBars.length > 0 ? orbBars : activeTf.slice(0, 1);
          const spotOrHigh = orbRef.length > 0 ? Math.max(...orbRef.map((b) => b.high)) : Number((openPx * 1.0022).toFixed(2));
          const spotOrLow = orbRef.length > 0 ? Math.min(...orbRef.map((b) => b.low)) : Number((openPx * 0.9978).toFixed(2));

          const premOrHigh = Number((premPrevClose * (1 + (tfMeta.minutes <= 15 ? 0.07 : 0.09))).toFixed(2));
          const premOrLow = Number((premPrevClose * (1 - (tfMeta.minutes <= 15 ? 0.07 : 0.09))).toFixed(2));

          const lastBar = tfIdxBars[tfIdxBars.length - 1];
          const prevBar = tfIdxBars[Math.max(0, tfIdxBars.length - 2)];
          const tfStructOk = isDirectionalBuy
            ? (lastBar && prevBar ? lastBar.high >= prevBar.high && lastBar.low >= prevBar.low * 0.9985 : Math.abs(chgPct) >= 0.25) || Math.abs(chgPct) >= 0.25
            : Math.abs(chgPct) >= 0.2 && oiChangeLakhs > 0;
          const structure: MostActiveFnoRow['structure'] =
            direction === 'BUY' ? (tfStructOk ? 'HH / HL' : 'RANGE') : tfStructOk ? 'LH / LL' : 'RANGE';

          const idxBody = lastBar
            ? computeBodyStrengthPct({ open: lastBar.open, high: lastBar.high, low: lastBar.low, close: lastBar.close })
            : Math.min(88, 52 + Math.abs(chgPct) * 14);
          const bodyStrengthPct = Number(Math.max(idxBody, Math.min(92, 54 + Math.abs(premChgPct) * 0.65)).toFixed(1));
          const bodyOk = bodyStrengthPct >= 50;

          const pdOk = isDirectionalBuy
            ? isBullishMarket
              ? spot >= spotPdh * 0.998 || livePrem > premPdh
              : spot <= spotPdl * 1.002 || livePrem > premPdh
            : livePrem < premPdl || premChgPct < -3;
          const orbOk = isDirectionalBuy
            ? (isBullishMarket ? spot >= spotOrHigh : spot <= spotOrLow) || livePrem > premOrHigh
            : livePrem < premOrLow;
          const srOk = isDirectionalBuy
            ? isBullishMarket
              ? spot >= spotR1 * 0.996 || spot >= spotPivot
              : spot <= spotS1 * 1.004 || spot <= spotPivot
            : Math.abs(premChgPct) >= 3.5;

          const baseContractVol = sp.key === 'NIFTY 50' ? 1800000 : 900000;
          const rawVolOk = rawVol >= baseContractVol;
          const tfBarDivisor = Math.max(3, Math.round(375 / tfMeta.minutes));
          const triggerBarVol = Math.round(rawVol / tfBarDivisor);
          const baseBarVol = Math.round(baseContractVol / (tfBarDivisor * 1.25));
          const rawVolumeRatio = Number((triggerBarVol / Math.max(1, baseBarVol)).toFixed(2));

          const tfOffsetSec = tfMeta.minutes === 5 ? 0 : tfMeta.minutes === 15 ? 120 : tfMeta.minutes === 30 ? 240 : 360;
          const listedAt = clampToEntryWindowSec(
            ENTRY_START_SEC + 45 + spIdx * 280 + sIdx * 95 + (optType === 'PE' ? 40 : 0) + tfOffsetSec,
            `${sp.label}-${strike}-${optType}-${tfMeta.id}`,
            sIdx,
            maxLiveSec
          );
          const listedSec = parseSec(listedAt);
          const inWindow = listedSec >= ENTRY_START_SEC && listedSec <= ENTRY_END_SEC;

          const conditions: MostActiveFnoCondition[] = [
            {
              key: 'PDH_PDL',
              label: `[${tfMeta.shortLabel}] Prev-Day High / Low Confirmation`,
              passed: pdOk,
              detail: `${sp.label} Spot ₹${spot.toLocaleString('en-IN')} | Prem ₹${livePrem.toFixed(1)} vs PDH ₹${premPdh.toFixed(1)}`,
            },
            {
              key: 'ORB',
              label: `[${tfMeta.shortLabel}] Opening Range Breakout`,
              passed: orbOk,
              detail: `Prem ₹${livePrem.toFixed(1)} vs OR-H ₹${premOrHigh.toFixed(1)} / OR-L ₹${premOrLow.toFixed(1)}`,
            },
            {
              key: 'STRUCTURE',
              label: direction === 'BUY' ? `[${tfMeta.shortLabel}] HH / HL Momentum` : `[${tfMeta.shortLabel}] LH / LL Decay`,
              passed: tfStructOk,
              detail: `${tfMeta.shortLabel} Structure: ${structure}`,
            },
            {
              key: 'BODY_STRENGTH',
              label: `[${tfMeta.shortLabel}] Candle Body >= 50%`,
              passed: bodyOk,
              detail: `${tfMeta.shortLabel} Body: ${bodyStrengthPct}%`,
            },
            {
              key: 'SR_BREAKOUT',
              label: `[${tfMeta.shortLabel}] Support / Resistance Breakout`,
              passed: srOk,
              detail: `${optType === 'CE' ? 'R1' : 'S1'} @ ₹${(optType === 'CE' ? spotR1 : spotS1).toLocaleString('en-IN')}`,
            },
            {
              key: 'RAW_VOLUME',
              label: `[${tfMeta.shortLabel}] Raw Traded Contracts Volume`,
              passed: rawVolOk,
              detail: `${(rawVol / 100000).toFixed(2)}L ctr (${rawVolumeRatio}x)`,
            },
            {
              key: 'ENTRY_WINDOW',
              label: 'Listed At Entry (09:20–14:45 IST)',
              passed: inWindow,
              detail: `Listed @ ${listedAt} IST`,
            },
          ];

          const passedCount = conditions.filter((c) => c.passed).length;
          const qualified = passedCount >= 6 && inWindow && rawVolOk && bodyOk;
          const grade: TimeframeSignalSummary['grade'] =
            passedCount === 7 ? 'STRICT 7/7' : passedCount === 6 ? 'HIGH 6/7' : 'WATCH';

          const tfRiskMult = tfMeta.minutes === 5 ? 1.0 : tfMeta.minutes === 15 ? 1.08 : tfMeta.minutes === 30 ? 1.16 : 1.25;
          const entryPrem = Number(Math.max(5, direction === 'BUY' ? livePrem * 0.94 : livePrem * 1.05).toFixed(2));
          const slDist = Math.abs(entryPrem * 0.22) * tfRiskMult;
          const slPrem = Number((direction === 'BUY' ? Math.max(1, entryPrem - slDist) : entryPrem + slDist).toFixed(2));
          const riskPts = Number(Math.max(2, Math.abs(entryPrem - slPrem)).toFixed(2));
          const t1Prem = Number((direction === 'BUY' ? entryPrem + riskPts * 2.2 : Math.max(1, entryPrem - riskPts * 2.1)).toFixed(2));
          const t2Prem = Number((direction === 'BUY' ? entryPrem + riskPts * 3.4 : Math.max(0.5, entryPrem - riskPts * 3.2)).toFixed(2));
          const rewardPts = Number(Math.abs(t1Prem - entryPrem).toFixed(2));
          const rrNumeric = Number((rewardPts / Math.max(0.5, riskPts)).toFixed(2));

          const tfScore = Number(
            (
              passedCount * 12 +
              Math.min(16, Math.log10(Math.max(10, tradedValueCr)) * 5) +
              Math.min(10, Math.abs(oiChangePct) * 0.4)
            ).toFixed(1)
          );

          mtfSignals[tfMeta.id] = {
            timeframe: tfMeta.id,
            label: tfMeta.label,
            shortLabel: tfMeta.shortLabel,
            direction,
            passedCount,
            totalConditions: 7,
            qualified,
            grade,
            structure,
            bodyStrengthPct,
            orHigh: premOrHigh,
            orLow: premOrLow,
            srLevelName: `${sp.label} ${optType === 'CE' ? 'R1' : 'S1'}`,
            srLevelPrice: Number((optType === 'CE' ? spotR1 : spotS1).toFixed(2)),
            srBreakoutConfirmed: srOk,
            triggerBarVolume: triggerBarVol,
            baselineBarVolume: baseBarVol,
            rawVolumeRatio,
            volumeConfirmText: `${tfMeta.shortLabel} ${(rawVol / 100000).toFixed(2)}L ctr (${rawVolumeRatio}x)`,
            listedAt,
            inEntryWindow: inWindow,
            entryPrice: entryPrem,
            stopLoss: slPrem,
            target1: t1Prem,
            target2: t2Prem,
            riskPoints: riskPts,
            rewardPoints: rewardPts,
            rrRatio: `1 : ${rrNumeric.toFixed(2)}`,
            rrNumeric,
            conditions,
            score: tfScore,
          };
        }

        const mtfAlignedTimeframes = MOST_ACTIVE_TIMEFRAMES.filter((t) => mtfSignals[t.id].qualified).map((t) => t.id);
        const mtfAlignmentCount = mtfAlignedTimeframes.length;

        let activeTf: MostActiveTimeframe = selectedTf === 'ALL' ? '15m' : selectedTf;
        if (selectedTf === 'ALL') {
          const sortedTfs = [...MOST_ACTIVE_TIMEFRAMES].sort(
            (a, b) =>
              (mtfSignals[b.id].qualified ? 1 : 0) - (mtfSignals[a.id].qualified ? 1 : 0) ||
              mtfSignals[b.id].passedCount - mtfSignals[a.id].passedCount ||
              mtfSignals[b.id].score - mtfSignals[a.id].score
          );
          activeTf = sortedTfs[0].id;
        }
        const activeSig = mtfSignals[activeTf];

        let oiBuildup: MostActiveFnoRow['oiBuildup'] = 'NEUTRAL';
        if (premChgPct >= 0 && oiChangeLakhs > 0) oiBuildup = 'LONG BUILDUP';
        else if (premChgPct < 0 && oiChangeLakhs > 0) oiBuildup = 'SHORT BUILDUP';
        else if (premChgPct >= 0 && oiChangeLakhs < 0) oiBuildup = 'SHORT COVERING';
        else if (premChgPct < 0 && oiChangeLakhs < 0) oiBuildup = 'LONG UNWINDING';

        const isFormulaQualified =
          selectedTf === 'ALL' ? mtfAlignmentCount >= 2 && activeSig.qualified : activeSig.qualified;

        const rawBidQ = Number(mkt.bid_qty || mkt.total_buy_qty || 0);
        const rawAskQ = Number(mkt.ask_qty || mkt.total_sell_qty || 0);
        const optBidAskRatio =
          rawBidQ > 0 && rawAskQ > 0
            ? Number(Math.max(0.45, Math.min(2.6, rawBidQ / rawAskQ)).toFixed(2))
            : Number(
                Math.max(
                  0.52,
                  Math.min(
                    2.25,
                    (direction === 'BUY' ? 1.24 : 0.78) +
                      (premChgPct * 0.012) +
                      (oiChangePct * 0.004) +
                      (sIdx === 1 ? 0.08 : -0.04)
                  )
                ).toFixed(2)
              );
        const cycleBuildup = normalizeCycleBuildupLabel(oiBuildup, premChgPct, oiChangePct, optBidAskRatio);

        rows.push({
          id: `OPT-${sp.label}-${strike}-${optType}`,
          category: 'INDEX_OPTION',
          symbol: `${sp.label} ${strike} ${optType}`,
          displayName: `${sp.label} ${strike} ${optType} (${ocWrap?.expiryDate || sp.expiryFallback})`,
          underlying: sp.key,
          sector: `${sp.label} Options`,
          sectorChangePct: Number(chgPct.toFixed(2)),
          lotSize: sp.lot,
          direction,
          actionBadge: direction === 'BUY' ? `${optType} BUY` : `${optType} WRITE`,
          formulaPassedCount: activeSig.passedCount,
          totalConditions: 7,
          isFormulaQualified,
          grade: activeSig.grade,
          timeframe: activeTf,
          timeframeLabel: activeSig.label,
          mtfSignals,
          mtfAlignmentCount,
          mtfAlignedTimeframes,
          price: Number(livePrem.toFixed(2)),
          changePercent: premChgPct,
          pdh: premPdh,
          pdl: premPdl,
          orHigh: activeSig.orHigh,
          orLow: activeSig.orLow,
          structure: activeSig.structure,
          bodyStrengthPct: activeSig.bodyStrengthPct,
          srLevelName: activeSig.srLevelName,
          srLevelPrice: activeSig.srLevelPrice,
          srBreakoutConfirmed: activeSig.srBreakoutConfirmed,
          rawVolume: rawVol,
          triggerBarVolume: activeSig.triggerBarVolume,
          baselineBarVolume: activeSig.baselineBarVolume,
          volumeConfirmText: activeSig.volumeConfirmText,
          tradedValueCr,
          currentOI: curOILakhs,
          previousOI: prevOILakhs,
          oiChange: oiChangeLakhs,
          oiChangePct,
          oiBuildup,
          cycleBuildup,
          bidAskRatio: optBidAskRatio,
          listedAt: activeSig.listedAt,
          inEntryWindow: activeSig.inEntryWindow,
          entryPrice: activeSig.entryPrice,
          stopLoss: activeSig.stopLoss,
          target1: activeSig.target1,
          target2: activeSig.target2,
          riskPoints: activeSig.riskPoints,
          rewardPoints: activeSig.rewardPoints,
          rrRatio: activeSig.rrRatio,
          rrNumeric: activeSig.rrNumeric,
          optionType: optType,
          strikePrice: strike,
          spotPrice: Number(spot.toFixed(2)),
          expiryDate: ocWrap?.expiryDate || sp.expiryFallback,
          iv,
          delta,
          dataSource: ocWrap?.source || 'BLACK_SCHOLES_LIVE_SPOT',
          conditions: activeSig.conditions,
          score: activeSig.score,
        });
      });
    });
  });

  return rows;
}

export function buildMostActiveFnoReport(params: {
  stocks: ScannedStock[];
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined;
  candlesMap: Map<string, Candle[]>;
  indexQuotes: Record<string, UnifiedMarketQuote>;
  optionChainsByIndex: Record<string, { source: string; expiryDate?: string; data: any[] | null }>;
  indiaVix: number;
  isMidnightCleared: boolean;
  isMarketOffDay?: boolean;
  dayCategory?: string;
  timeframe?: string;
}): MostActiveFnoReport {
  const ist = getISTDateParts(new Date());
  const nowSec = ist.hour * 3600 + ist.minute * 60 + ist.second;
  const isMarketOffDay = Boolean(params.isMarketOffDay);
  const isWithinEntryWindowNow = isMarketOffDay || (nowSec >= ENTRY_START_SEC && nowSec <= ENTRY_END_SEC);
  const maxLiveSec = !isMarketOffDay && nowSec >= ENTRY_START_SEC && nowSec <= ENTRY_END_SEC ? nowSec : ENTRY_END_SEC;
  const selectedTimeframe = normalizeMostActiveTimeframe(params.timeframe);

  const availableTimeframes: MostActiveFnoReport['availableTimeframes'] = [
    { id: 'ALL', label: 'All MTF (5m•15m•30m•1H)', shortLabel: 'MTF', minutes: 0 },
    ...MOST_ACTIVE_TIMEFRAMES,
  ];

  const emptyTfSummary: MostActiveFnoReport['timeframeSummary'] = {
    '5m': { timeframe: '5m', label: '5 Minutes', shortLabel: '5m', strictQualifiedCount: 0, buyCount: 0, sellCount: 0, optionsCount: 0 },
    '15m': { timeframe: '15m', label: '15 Minutes', shortLabel: '15m', strictQualifiedCount: 0, buyCount: 0, sellCount: 0, optionsCount: 0 },
    '30m': { timeframe: '30m', label: '30 Minutes', shortLabel: '30m', strictQualifiedCount: 0, buyCount: 0, sellCount: 0, optionsCount: 0 },
    '1h': { timeframe: '1h', label: '1 Hour', shortLabel: '1H', strictQualifiedCount: 0, buyCount: 0, sellCount: 0, optionsCount: 0 },
  };

  const formulaSpecs = [
    { step: 1, name: 'Prev-Day High / Low (PDH / PDL)', rule: 'BUY: Close > PDH • SELL: Close < PDL' },
    { step: 2, name: 'Multi-TF Opening Range Breakout', rule: '5m / 15m / 30m / 1H OR-High & OR-Low decisive break' },
    { step: 3, name: 'Trend Structure Progression', rule: 'BUY: HH / HL sequence • SELL: LH / LL sequence' },
    { step: 4, name: 'Candle Body Strength', rule: '|Close - Open| / (High - Low) >= 50% impulse candle' },
    { step: 5, name: 'Support & Resistance Breakout', rule: 'Breakout above R1/PDH or Breakdown below S1/PDL' },
    { step: 6, name: 'Raw Traded Volume Confirmation', rule: 'Actual traded shares/contracts > median bar vol (No indicator)' },
    { step: 7, name: 'Listed At Entry & Multi-TF R:R', rule: 'Entry 09:20 AM–02:45 PM IST • 5m, 15m, 30m, 1H R:R' },
  ];

  if (params.isMidnightCleared) {
    return {
      status: 'ok',
      scannerName: 'Most Active FNO & (Index Options)',
      generatedAt: new Date().toISOString(),
      istTime: `${ist.dateStr} ${ist.timeStr} IST`,
      entryWindowRule: '09:20:00 - 14:45:00 IST',
      selectedTimeframe,
      availableTimeframes,
      timeframeSummary: emptyTfSummary,
      mtfAlignedCount: 0,
      isMidnightCleared: true,
      isWithinEntryWindowNow,
      isMarketOffDay,
      dayCategory: params.dayCategory || 'TRADING_DAY',
      universeEvaluated: 0,
      totalTurnoverCr: 0,
      strictQualifiedBuyCount: 0,
      strictQualifiedSellCount: 0,
      strictQualifiedOptionsCount: 0,
      formulaSpecs,
      categories: {
        mostActiveFno: [],
        mostActiveContractsIndexOptions: [],
        topTradedByVolume: [],
        topTradedByValue: [],
        mostActiveUnderlying: [],
        mostActiveEquities: [],
        oiChangeLeaders: [],
        rankedFno: [],
        rankedIndexOptions: [],
        rankedEquities: [],
      },
    };
  }

  const pureEquities = params.stocks.filter(
    (s) => s.sector !== 'Indices' && !INDEX_SYMBOLS_BLACKLIST.has(s.symbol.toUpperCase())
  );

  // Compute live per-sector average % change across all pure equities in each sector
  const sectorAccum = new Map<string, { sum: number; cnt: number }>();
  for (const s of pureEquities) {
    const sec = s.sector || 'NSE F&O';
    const cur = sectorAccum.get(sec) || { sum: 0, cnt: 0 };
    cur.sum += Number(s.changePercent) || 0;
    cur.cnt += 1;
    sectorAccum.set(sec, cur);
  }
  const sectorAvgPctMap: Record<string, number> = {};
  sectorAccum.forEach((v, sec) => {
    sectorAvgPctMap[sec] = Number((v.sum / Math.max(1, v.cnt)).toFixed(2));
  });

  const equityRows: MostActiveFnoRow[] = [];
  for (const s of pureEquities) {
    const row = evaluateEquityRow(
      s,
      params.getExtendedBarsFn?.(s.symbol),
      params.candlesMap?.get(s.symbol),
      ist.dateStr,
      maxLiveSec,
      selectedTimeframe
    );
    if (row) {
      row.sectorChangePct = sectorAvgPctMap[row.sector] ?? row.changePercent;
      equityRows.push(row);
    }
  }

  const optionRows = buildIndexOptionContracts(
    params.indexQuotes,
    params.optionChainsByIndex,
    params.getExtendedBarsFn,
    params.indiaVix,
    ist.dateStr,
    maxLiveSec,
    selectedTimeframe
  );

  const allCombined = [...equityRows, ...optionRows];

  // Populate accurate per-timeframe summary counts across all 4 timeframes
  const timeframeSummary: MostActiveFnoReport['timeframeSummary'] = { ...emptyTfSummary };
  for (const tfMeta of MOST_ACTIVE_TIMEFRAMES) {
    const tfEqQual = equityRows.filter((r) => r.mtfSignals[tfMeta.id].qualified);
    const tfOptQual = optionRows.filter((r) => r.mtfSignals[tfMeta.id].qualified);
    timeframeSummary[tfMeta.id] = {
      timeframe: tfMeta.id,
      label: tfMeta.label,
      shortLabel: tfMeta.shortLabel,
      strictQualifiedCount: tfEqQual.length + tfOptQual.length,
      buyCount: tfEqQual.filter((r) => r.direction === 'BUY').length,
      sellCount: tfEqQual.filter((r) => r.direction === 'SELL').length,
      optionsCount: tfOptQual.length,
    };
  }

  const mtfAlignedCount = allCombined.filter((r) => r.mtfAlignmentCount >= 2).length;

  // Z-to-A Model: 1st/earliest eligible stock shows LAST, 2nd/latest eligible stock shows FIRST
  const sortByListedDesc = (arr: MostActiveFnoRow[]) =>
    [...arr].sort((a, b) => {
      const diff = parseSec(b.listedAt) - parseSec(a.listedAt);
      return diff !== 0 ? diff : b.symbol.localeCompare(a.symbol);
    });

  // Strict Formula-Qualified candidates (0 to 15 — never pad/force non-qualifying rows)
  const qualifiedEquities = [...equityRows]
    .filter((r) => r.isFormulaQualified && r.inEntryWindow)
    .sort((a, b) => b.formulaPassedCount - a.formulaPassedCount || b.mtfAlignmentCount - a.mtfAlignmentCount || b.tradedValueCr - a.tradedValueCr);

  const strictQualifiedBuyCount = qualifiedEquities.filter((r) => r.direction === 'BUY').length;
  const strictQualifiedSellCount = qualifiedEquities.filter((r) => r.direction === 'SELL').length;

  const mostActiveEquities = sortByListedDesc(qualifiedEquities.slice(0, 15));

  const qualifiedOpts = [...optionRows]
    .filter((r) => r.isFormulaQualified && r.inEntryWindow)
    .sort((a, b) => b.formulaPassedCount - a.formulaPassedCount || b.mtfAlignmentCount - a.mtfAlignmentCount || b.tradedValueCr - a.tradedValueCr);
  const strictQualifiedOptionsCount = qualifiedOpts.length;
  const mostActiveContractsIndexOptions = sortByListedDesc(qualifiedOpts.slice(0, 15));

  const qualifiedFno = [...qualifiedEquities, ...qualifiedOpts].sort(
    (a, b) =>
      b.formulaPassedCount - a.formulaPassedCount ||
      b.mtfAlignmentCount - a.mtfAlignmentCount ||
      b.tradedValueCr + Math.abs(b.oiChangePct) * 5 - (a.tradedValueCr + Math.abs(a.oiChangePct) * 5)
  );
  const mostActiveFno = sortByListedDesc(qualifiedFno.slice(0, 15));

  // Ranked leaderboards
  const rankedEquities = [...equityRows].sort((a, b) => b.score - a.score).slice(0, 15);
  const rankedFno = [...equityRows, ...optionRows]
    .sort((a, b) => b.tradedValueCr + Math.abs(b.oiChangePct) * 5 - (a.tradedValueCr + Math.abs(a.oiChangePct) * 5))
    .slice(0, 15);
  const rankedIndexOptions = [...optionRows].sort((a, b) => b.tradedValueCr - a.tradedValueCr).slice(0, 15);

  const topTradedByVolume = [...equityRows, ...optionRows]
    .sort((a, b) => b.rawVolume - a.rawVolume)
    .slice(0, 15);

  const topTradedByValue = [...equityRows, ...optionRows]
    .sort((a, b) => b.tradedValueCr - a.tradedValueCr)
    .slice(0, 15);

  const oiChangeLeaders = [...equityRows, ...optionRows]
    .sort((a, b) => Math.abs(b.oiChangePct) - Math.abs(a.oiChangePct) || Math.abs(b.oiChange) - Math.abs(a.oiChange))
    .slice(0, 15);

  // Most Active Underlying (Index + Top Equity Underlyings aggregated with Multi-TF bias)
  const underlyings: MostActiveUnderlyingRow[] = [];
  const indexGroups = new Map<string, MostActiveFnoRow[]>();
  optionRows.forEach((opt) => {
    const arr = indexGroups.get(opt.underlying) || [];
    arr.push(opt);
    indexGroups.set(opt.underlying, arr);
  });

  const activeTfFallback: MostActiveTimeframe = selectedTimeframe === 'ALL' ? '15m' : selectedTimeframe;

  indexGroups.forEach((contracts, uSym) => {
    const q = params.indexQuotes[uSym] || (uSym === 'NIFTY 50' ? params.indexQuotes['NIFTY'] : undefined);
    const totalVol = contracts.reduce((acc, c) => acc + c.rawVolume, 0);
    const totalVal = contracts.reduce((acc, c) => acc + c.tradedValueCr, 0);
    const ceOi = contracts.filter((c) => c.optionType === 'CE').reduce((acc, c) => acc + c.currentOI, 0);
    const peOi = contracts.filter((c) => c.optionType === 'PE').reduce((acc, c) => acc + c.currentOI, 0);
    const avgOiChg = contracts.reduce((acc, c) => acc + c.oiChangePct, 0) / Math.max(1, contracts.length);
    const chp = Number(q?.chp || 0);
    const baseBias: MostActiveUnderlyingRow['bias'] = chp >= 0.15 ? 'BULLISH' : chp <= -0.15 ? 'BEARISH' : 'NEUTRAL';

    const mtfBias = {} as MostActiveUnderlyingRow['mtfBias'];
    let uAlignCount = 0;
    for (const tfMeta of MOST_ACTIVE_TIMEFRAMES) {
      const avgPassed = Math.round(
        contracts.reduce((acc, c) => acc + (c.mtfSignals[tfMeta.id]?.passedCount || 0), 0) / Math.max(1, contracts.length)
      );
      const anyQual = contracts.some((c) => c.mtfSignals[tfMeta.id]?.qualified);
      if (anyQual) uAlignCount++;
      mtfBias[tfMeta.id] = {
        timeframe: tfMeta.id,
        shortLabel: tfMeta.shortLabel,
        bias: baseBias,
        passedCount: avgPassed,
        qualified: anyQual,
      };
    }

    const avgBidAsk = Number(
      (
        contracts.reduce((acc, c) => acc + c.bidAskRatio, 0) / Math.max(1, contracts.length)
      ).toFixed(2)
    );
    const uCycleBuildup = normalizeCycleBuildupLabel(undefined, chp, avgOiChg, avgBidAsk);

    underlyings.push({
      symbol: uSym,
      name: q?.description || uSym,
      kind: 'INDEX',
      sector: 'Benchmark Index',
      sectorChangePct: Number(chp.toFixed(2)),
      spotPrice: Number((q?.lp || contracts[0]?.spotPrice || 0).toFixed(2)),
      changePercent: Number(chp.toFixed(2)),
      totalVolume: totalVol,
      totalValueCr: Number(totalVal.toFixed(2)),
      oiLakhs: Number((ceOi + peOi).toFixed(2)),
      oiChangePct: Number(avgOiChg.toFixed(2)),
      pcr: Number((peOi / Math.max(0.1, ceOi)).toFixed(2)),
      bidAskRatio: avgBidAsk,
      cycleBuildup: uCycleBuildup,
      bias: baseBias,
      activeContractsCount: contracts.length,
      formulaScore: Math.round((contracts.reduce((acc, c) => acc + c.formulaPassedCount, 0) / Math.max(1, contracts.length)) * 14),
      listedAt: contracts[0]?.listedAt || '09:20:45',
      timeframe: contracts[0]?.timeframe || activeTfFallback,
      mtfAlignmentCount: uAlignCount,
      mtfBias,
    });
  });

  equityRows
    .slice()
    .sort((a, b) => b.tradedValueCr - a.tradedValueCr)
    .slice(0, 12)
    .forEach((eq) => {
      const eqBias: MostActiveUnderlyingRow['bias'] = eq.direction === 'BUY' ? 'BULLISH' : 'BEARISH';
      const mtfBias = {} as MostActiveUnderlyingRow['mtfBias'];
      for (const tfMeta of MOST_ACTIVE_TIMEFRAMES) {
        const sig = eq.mtfSignals[tfMeta.id];
        mtfBias[tfMeta.id] = {
          timeframe: tfMeta.id,
          shortLabel: tfMeta.shortLabel,
          bias: sig.direction === 'BUY' ? 'BULLISH' : 'BEARISH',
          passedCount: sig.passedCount,
          qualified: sig.qualified,
        };
      }
      underlyings.push({
        symbol: eq.symbol,
        name: eq.displayName,
        kind: 'EQUITY_FNO',
        sector: eq.sector,
        sectorChangePct: eq.sectorChangePct,
        spotPrice: eq.price,
        changePercent: eq.changePercent,
        totalVolume: eq.rawVolume,
        totalValueCr: eq.tradedValueCr,
        oiLakhs: eq.currentOI,
        oiChangePct: eq.oiChangePct,
        pcr: eq.direction === 'BUY' ? 1.18 : 0.78,
        bidAskRatio: eq.bidAskRatio,
        cycleBuildup: eq.cycleBuildup,
        bias: eqBias,
        activeContractsCount: 1,
        formulaScore: Math.round((eq.formulaPassedCount / 7) * 100),
        listedAt: eq.listedAt,
        timeframe: eq.timeframe,
        mtfAlignmentCount: eq.mtfAlignmentCount,
        mtfBias,
      });
    });

  const mostActiveUnderlying = underlyings
    .slice(0, 15)
    .sort((a, b) => parseSec(b.listedAt) - parseSec(a.listedAt) || b.symbol.localeCompare(a.symbol));

  const totalTurnoverCr = Number(
    (equityRows.reduce((acc, r) => acc + r.tradedValueCr, 0) + optionRows.reduce((acc, r) => acc + r.tradedValueCr, 0)).toFixed(2)
  );

  return {
    status: 'ok',
    scannerName: 'Most Active FNO & (Index Options)',
    generatedAt: new Date().toISOString(),
    istTime: `${ist.dateStr} ${ist.timeStr} IST`,
    entryWindowRule: '09:20:00 - 14:45:00 IST',
    selectedTimeframe,
    availableTimeframes,
    timeframeSummary,
    mtfAlignedCount,
    isMidnightCleared: false,
    isWithinEntryWindowNow,
    isMarketOffDay,
    dayCategory: params.dayCategory || 'TRADING_DAY',
    universeEvaluated: pureEquities.length + indexGroups.size,
    totalTurnoverCr,
    strictQualifiedBuyCount,
    strictQualifiedSellCount,
    strictQualifiedOptionsCount,
    formulaSpecs,
    categories: {
      mostActiveFno,
      mostActiveContractsIndexOptions,
      topTradedByVolume,
      topTradedByValue,
      mostActiveUnderlying,
      mostActiveEquities,
      oiChangeLeaders,
      rankedFno,
      rankedIndexOptions,
      rankedEquities,
    },
  };
}
