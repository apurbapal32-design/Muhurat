import { Candle, ScannedStock } from '../src/types';
import { getISTDateParts } from '../src/data/marketSchedule';
import { IntradayCandleBar } from './autonomousPriceService';

export function passesMoneyFlowTwoPercentFilter(changePercent: number): boolean {
  return Math.abs(Number(changePercent) || 0) >= 2.0;
}

export interface MoneyFlowConditionCheck {
  step: number;
  label: string;
  passed: boolean;
  detail: string;
}

export interface MoneyFlowFvgZone {
  type: 'BULLISH_FVG' | 'BEARISH_FVG';
  bottom: number;
  top: number;
  formedAt: string;
  formedBarIdx: number;
  isFresh: boolean;
  retested: boolean;
  invalidated: boolean;
}

export interface MoneyFlowScoreBreakdown {
  htfTrendConfirmation: number; // /20
  hmaDirectionAndSlope: number; // /20
  fvgQualityAndRetest: number; // /25
  relativeVolume: number; // /20
  supertrendConfirmation: number; // /15
  total: number; // /100
}

export type MoneyFlowClassification =
  | 'Strong BUY'
  | 'Strong SELL'
  | 'Good opportunity'
  | 'Watchlist'
  | 'No trade';

export type RvolInterpretation = 'Weak' | 'Normal' | 'Good' | 'Strong' | 'Very strong';

export interface MoneyFlowSignalRow {
  symbol: string;
  name: string;
  sector: string;
  sectorChangePct?: number;
  direction: 'BUY' | 'SELL';
  grade: '6/6 CONFIRMED' | 'STRONG' | 'GOOD' | 'WATCHLIST';
  classification: MoneyFlowClassification;
  allSixMet: boolean;
  conditionsMet: number;
  totalConditions: 6;
  listedAt: string;
  price: number;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  riskR: number;
  rrRatio: string;
  atr14: number;
  changePercent: number;
  hlc3: number;
  vwap: number;
  pdh: number;
  pdl: number;
  dayHigh: number;
  dayLow: number;
  moneyFlowRs: number;
  moneyFlowCr: number;
  avgMoneyFlowCr: number;
  rvol: number;
  rvolInterpretation: RvolInterpretation;
  speed: number;
  glowSurge: number;
  bidAskRatio: number;
  rejectionCandle: {
    timeIST: string;
    open: number;
    high: number;
    low: number;
    close: number;
    isGreen: boolean;
    bodyPct: number;
    wickRejectionPct: number;
    strongRejection: boolean;
  };
  supertrend: {
    direction: 'BULLISH' | 'BEARISH';
    prevCompletedDirection: 'BULLISH' | 'BEARISH';
    value: number;
    atr10: number;
    justTurned: boolean;
  };
  supertrend15m: {
    direction: 'BULLISH' | 'BEARISH';
    value: number;
  };
  hullSuite: {
    hma55: number;
    periodUsed: number;
    position: 'ABOVE' | 'BELOW';
    slope: 'UP' | 'DOWN';
    slopeStrengthening: boolean;
  };
  hma15m: {
    hma55: number;
    periodUsed: number;
    slope: 'RISING' | 'FALLING';
  };
  fvg: MoneyFlowFvgZone | null;
  scoreBreakdown: MoneyFlowScoreBreakdown;
  conditions: MoneyFlowConditionCheck[];
  score: number; // 0..100
  tradeManagement: string[];
}

export interface MoneyFlowNiftyRegime {
  symbol: 'NIFTY 50';
  price: number;
  vwap: number;
  trend: 'BULLISH' | 'BEARISH';
  vsVwapPct: number;
}

export interface MoneyFlowScanReport {
  status: 'ok';
  strategyName: string;
  generatedAt: string;
  istTime: string;
  isMidnightCleared: boolean;
  universeEvaluated: number;
  confirmedBuyCount: number;
  confirmedSellCount: number;
  strongBuyCount: number;
  strongSellCount: number;
  strictBuyCount: number;
  strictSellCount: number;
  niftyRegime: MoneyFlowNiftyRegime;
  indicatorSettings: Array<{
    indicator: string;
    setting: string;
  }>;
  tradeManagementRules: Array<{
    situation: string;
    action: string;
  }>;
  buySignals: MoneyFlowSignalRow[];
  sellSignals: MoneyFlowSignalRow[];
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
  'NIFTYIT',
  'NIFTYFPI',
]);

export interface MoneyFlowWorkBar {
  timeIST: string;
  dateIST: string;
  secIST: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function round2(n: number): number {
  return Number((Number(n) || 0).toFixed(2));
}

function parseTimeToSec(t?: string): number {
  if (!t || t === '--') return 0;
  const parts = t.trim().split(':').map((x) => parseInt(x, 10) || 0);
  if (parts.length < 2) return 0;
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

function formatSecToHHMMSS(sec: number): string {
  const s = Math.max(0, Math.min(23 * 3600 + 59 * 60 + 59, Math.round(sec)));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

/**
 * Weighted Moving Average series: WMA(values, period).
 */
export function computeWMA(values: number[], period: number): number[] {
  const n = Math.max(1, Math.floor(period));
  const out = new Array<number>(values.length).fill(values[0] || 0);
  for (let i = 0; i < values.length; i++) {
    const winStart = Math.max(0, i - n + 1);
    const len = i - winStart + 1;
    const denom = (len * (len + 1)) / 2;
    let num = 0;
    for (let j = 0; j < len; j++) {
      num += values[winStart + j] * (j + 1);
    }
    out[i] = denom > 0 ? num / denom : values[i];
  }
  return out;
}

/**
 * Hull Moving Average: HMA(n) = WMA(2 * WMA(C, n/2) - WMA(C, n), round(sqrt(n))).
 */
export function computeHMA(closes: number[], targetPeriod: number = 55): { series: number[]; periodUsed: number } {
  if (closes.length === 0) return { series: [], periodUsed: targetPeriod };
  const periodUsed =
    closes.length >= targetPeriod + 4 ? targetPeriod : Math.max(9, Math.min(targetPeriod, closes.length));
  const halfLen = Math.max(2, Math.floor(periodUsed / 2));
  const sqrtLen = Math.max(2, Math.round(Math.sqrt(periodUsed)));
  const wmaHalf = computeWMA(closes, halfLen);
  const wmaFull = computeWMA(closes, periodUsed);
  const diff = closes.map((_, i) => 2 * wmaHalf[i] - wmaFull[i]);
  return { series: computeWMA(diff, sqrtLen), periodUsed };
}

/**
 * Wilder ATR series (for both ATR 10 and ATR 14).
 */
export function computeAtrSeries(bars: MoneyFlowWorkBar[], period: number = 14): number[] {
  const len = bars.length;
  const out = new Array<number>(len).fill(0);
  if (len === 0) return out;
  for (let i = 0; i < len; i++) {
    const b = bars[i];
    if (i === 0) {
      out[i] = Math.max(0.05, b.high - b.low);
    } else {
      const pc = bars[i - 1].close;
      const tr = Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
      out[i] = (out[i - 1] * (period - 1) + tr) / period;
    }
  }
  return out;
}

/**
 * Supertrend(ATR 10, Multiplier 2.0) — standard non-repainting closed-bar band progression.
 */
export function computeSupertrend(
  bars: MoneyFlowWorkBar[],
  atrLen: number = 10,
  mult: number = 2.0
): {
  dir: Array<1 | -1>;
  line: number[];
  atr: number[];
  turnedBull: boolean[];
  turnedBear: boolean[];
} {
  const len = bars.length;
  const atr = computeAtrSeries(bars, atrLen);
  const dir = new Array<1 | -1>(len).fill(1);
  const finalUpper = new Array<number>(len).fill(0);
  const finalLower = new Array<number>(len).fill(0);
  const line = new Array<number>(len).fill(0);
  const turnedBull = new Array<boolean>(len).fill(false);
  const turnedBear = new Array<boolean>(len).fill(false);

  for (let i = 0; i < len; i++) {
    const b = bars[i];
    const hl2 = (b.high + b.low) / 2;
    const basicUpper = hl2 + mult * atr[i];
    const basicLower = hl2 - mult * atr[i];

    if (i === 0) {
      finalUpper[i] = basicUpper;
      finalLower[i] = basicLower;
      dir[i] = b.close >= hl2 ? 1 : -1;
      line[i] = dir[i] === 1 ? finalLower[i] : finalUpper[i];
      continue;
    }

    const prevClose = bars[i - 1].close;
    finalUpper[i] =
      basicUpper < finalUpper[i - 1] || prevClose > finalUpper[i - 1] ? basicUpper : finalUpper[i - 1];
    finalLower[i] =
      basicLower > finalLower[i - 1] || prevClose < finalLower[i - 1] ? basicLower : finalLower[i - 1];

    const prevDir = dir[i - 1];
    if (prevDir === -1 && b.close > finalUpper[i]) {
      dir[i] = 1;
      turnedBull[i] = true;
    } else if (prevDir === 1 && b.close < finalLower[i]) {
      dir[i] = -1;
      turnedBear[i] = true;
    } else {
      dir[i] = prevDir;
    }

    line[i] = dir[i] === 1 ? finalLower[i] : finalUpper[i];
  }

  return { dir, line, atr, turnedBull, turnedBear };
}

/**
 * Resample 5-minute OHLCV bars into exact NSE 15-minute buckets (09:15, 09:30, 09:45...).
 */
export function resampleBarsTo15m(bars5m: MoneyFlowWorkBar[]): Array<MoneyFlowWorkBar & { bucketEndSecIST: number }> {
  const buckets = new Map<string, MoneyFlowWorkBar & { bucketEndSecIST: number }>();
  const startOfDaySec = 9 * 3600 + 15 * 60;

  for (const b of bars5m) {
    const slot = Math.max(0, Math.floor((b.secIST - startOfDaySec) / 900));
    const bucketSec = startOfDaySec + slot * 900;
    const key = `${b.dateIST}_${bucketSec}`;
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, {
        dateIST: b.dateIST,
        timeIST: formatSecToHHMMSS(bucketSec),
        secIST: bucketSec,
        bucketEndSecIST: b.secIST,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      });
    } else {
      existing.high = Math.max(existing.high, b.high);
      existing.low = Math.min(existing.low, b.low);
      existing.close = b.close;
      existing.volume += b.volume;
      existing.bucketEndSecIST = Math.max(existing.bucketEndSecIST, b.secIST);
    }
  }

  return Array.from(buckets.values()).sort(
    (a, b) => a.dateIST.localeCompare(b.dateIST) || a.secIST - b.secIST
  );
}

/**
 * Detect latest active (unmitigated preferred) 3-candle Fair Value Gap prior to bar index `trigIdx`.
 * Bullish FVG: Low(Candle3) > High(Candle1) -> Bottom = High(C1), Top = Low(C3)
 * Bearish FVG: High(Candle3) < Low(Candle1) -> Bottom = High(C3), Top = Low(C1)
 */
export function findBestPriorFvg(
  bars: MoneyFlowWorkBar[],
  trigIdx: number,
  side: 'BUY' | 'SELL',
  lookbackBars: number = 40
): MoneyFlowFvgZone | null {
  const bTrig = bars[trigIdx];
  const minEndIdx = Math.max(2, trigIdx - lookbackBars);
  let fallbackMitigated: MoneyFlowFvgZone | null = null;

  for (let c3Idx = trigIdx - 1; c3Idx >= minEndIdx; c3Idx--) {
    const c1 = bars[c3Idx - 2];
    const c3 = bars[c3Idx];
    if (!c1 || !c3) continue;

    if (side === 'BUY') {
      if (c3.low <= c1.high) continue;
      const bottom = round2(c1.high);
      const top = round2(c3.low);

      // Check bars between c3Idx + 1 and trigIdx - 1 for invalidation or prior mitigation
      let invalidated = false;
      let priorTouched = false;
      for (let m = c3Idx + 1; m < trigIdx; m++) {
        if (bars[m].close < bottom) {
          invalidated = true;
          break;
        }
        if (bars[m].low <= top) {
          priorTouched = true;
        }
      }
      if (invalidated) continue;

      const retestedNow = bTrig.low <= top && bTrig.close >= bottom;
      const zone: MoneyFlowFvgZone = {
        type: 'BULLISH_FVG',
        bottom,
        top,
        formedAt: c3.timeIST,
        formedBarIdx: c3Idx,
        isFresh: !priorTouched,
        retested: retestedNow,
        invalidated: bTrig.close < bottom,
      };
      if (retestedNow && !priorTouched) return zone;
      if (retestedNow && !fallbackMitigated) fallbackMitigated = zone;
      else if (!fallbackMitigated) fallbackMitigated = zone;
    } else {
      if (c3.high >= c1.low) continue;
      const bottom = round2(c3.high);
      const top = round2(c1.low);

      let invalidated = false;
      let priorTouched = false;
      for (let m = c3Idx + 1; m < trigIdx; m++) {
        if (bars[m].close > top) {
          invalidated = true;
          break;
        }
        if (bars[m].high >= bottom) {
          priorTouched = true;
        }
      }
      if (invalidated) continue;

      const retestedNow = bTrig.high >= bottom && bTrig.close <= top;
      const zone: MoneyFlowFvgZone = {
        type: 'BEARISH_FVG',
        bottom,
        top,
        formedAt: c3.timeIST,
        formedBarIdx: c3Idx,
        isFresh: !priorTouched,
        retested: retestedNow,
        invalidated: bTrig.close > top,
      };
      if (retestedNow && !priorTouched) return zone;
      if (retestedNow && !fallbackMitigated) fallbackMitigated = zone;
      else if (!fallbackMitigated) fallbackMitigated = zone;
    }
  }

  return fallbackMitigated;
}

export function classifyRvol(rvol: number): RvolInterpretation {
  if (rvol >= 2.0) return 'Very strong';
  if (rvol >= 1.5) return 'Strong';
  if (rvol >= 1.3) return 'Good';
  if (rvol >= 1.0) return 'Normal';
  return 'Weak';
}

export function classifyFinUrlScore(score: number, side: 'BUY' | 'SELL'): MoneyFlowClassification {
  if (score >= 85) return side === 'BUY' ? 'Strong BUY' : 'Strong SELL';
  if (score >= 75) return 'Good opportunity';
  if (score >= 60) return 'Watchlist';
  return 'No trade';
}

function smaAt(values: number[], idx: number, period: number): number {
  const start = Math.max(0, idx - period + 1);
  let sum = 0;
  let cnt = 0;
  for (let k = start; k <= idx; k++) {
    sum += values[k];
    cnt++;
  }
  return cnt > 0 ? sum / cnt : values[idx] || 0;
}

function buildWorkBars(
  stock: ScannedStock,
  extendedBars: IntradayCandleBar[] | undefined,
  fallbackCandles: Candle[] | undefined,
  todayDateIST: string
): MoneyFlowWorkBar[] {
  let raw: MoneyFlowWorkBar[] = [];

  if (Array.isArray(extendedBars) && extendedBars.length >= 6) {
    raw = extendedBars.map((b) => ({
      timeIST: b.timeIST.length === 5 ? `${b.timeIST}:00` : b.timeIST,
      dateIST: b.dateIST,
      secIST: b.secIST,
      open: Number(b.open) || Number(b.close),
      high: Number(b.high) || Number(b.close),
      low: Number(b.low) || Number(b.close),
      close: Number(b.close) || Number(stock.price),
      volume: Math.max(1, Math.round(Number(b.volume) || 0)),
    }));
  } else if (Array.isArray(fallbackCandles) && fallbackCandles.length >= 6) {
    raw = fallbackCandles.map((c, idx) => {
      const parsed = c.time ? parseTimeToSec(c.time) : 0;
      const sec = parsed >= 9 * 3600 + 15 * 60 ? parsed : 9 * 3600 + 15 * 60 + idx * 300;
      return {
        timeIST: c.time.length === 5 ? `${c.time}:00` : c.time,
        dateIST: todayDateIST,
        secIST: Math.min(15 * 3600 + 29 * 60, sec),
        open: Number(c.open) || Number(c.close),
        high: Number(c.high) || Number(c.close),
        low: Number(c.low) || Number(c.close),
        close: Number(c.close) || Number(stock.price),
        volume: Math.max(1, Math.round(Number(c.volume) || 0)),
      };
    });
  }

  if (raw.length === 0) return [];

  const last = raw[raw.length - 1];
  const lp = Number(stock.price) || last.close;
  raw[raw.length - 1] = {
    ...last,
    close: lp,
    high: Math.max(last.high, lp),
    low: Math.min(last.low, lp),
  };

  return raw;
}

const TRADE_MANAGEMENT_RULES = [
  { situation: 'Entry triggered', action: 'Open position above rejection High (BUY) / below Low (SELL)' },
  { situation: 'Target 1 reached (+1R)', action: 'Book 50% quantity' },
  { situation: 'Target 2 reached (+2R)', action: 'Book 30% quantity (1:2 target)' },
  { situation: 'Target 3 reached (+3R)', action: 'Exit remaining 20% quantity' },
  { situation: 'Supertrend reverses', action: 'Exit remaining position immediately' },
  { situation: 'Stop-loss hit', action: 'Exit immediately (min(FVG Bottom, Low) - 0.1*ATR14)' },
  { situation: 'FVG invalidated before entry', action: 'Cancel setup before entry trigger' },
];

const INDICATOR_SETTINGS = [
  { indicator: 'HMA', setting: '55  |  WMA(2·WMA(C, n/2) − WMA(C, n), √n)' },
  { indicator: 'FVG', setting: '3-candle imbalance (C3.Low > C1.High Bull | C3.High < C1.Low Bear)' },
  { indicator: 'Volume SMA', setting: '20 bars (RelativeVolume = CurrentVol / SMA(Vol, 20))' },
  { indicator: 'Volume spike', setting: '1.5× (Strong ≥1.5× | Very strong ≥2.0×)' },
  { indicator: 'Supertrend ATR / Mult', setting: 'ATR 10 • Multiplier 2.0 (Prev completed bar anti-repaint)' },
  { indicator: 'Timeframes', setting: '5m Entry + 15m Trend Confirmation (Min 1:2 R:R)' },
];

export function evaluateStockFinUrlStrategy(params: {
  stock: ScannedStock;
  bars: MoneyFlowWorkBar[];
  sectorChangePct: number;
  istDateStr: string;
  istTimeStr: string;
}): { buyRow: MoneyFlowSignalRow | null; sellRow: MoneyFlowSignalRow | null } {
  const { stock, bars, sectorChangePct, istDateStr, istTimeStr } = params;
  if (bars.length < 10) return { buyRow: null, sellRow: null };

  const closes5 = bars.map((b) => b.close);
  const hlc3 = bars.map((b) => (b.high + b.low + b.close) / 3);
  const vols5 = bars.map((b) => b.volume);
  const mf5 = bars.map((b, i) => b.volume * hlc3[i]);

  const atr14Arr = computeAtrSeries(bars, 14);
  const st5 = computeSupertrend(bars, 10, 2.0);
  const { series: hma5, periodUsed: hma5Period } = computeHMA(closes5, 55);

  const bars15m = resampleBarsTo15m(bars);
  const closes15 = bars15m.map((b) => b.close);
  const st15 = computeSupertrend(bars15m, 10, 2.0);
  const { series: hma15, periodUsed: hma15Period } = computeHMA(closes15, 55);

  const lastDate = bars[bars.length - 1].dateIST;
  const firstTodayIdx = bars.findIndex((b) => b.dateIST === lastDate);
  const scanStartIdx = Math.max(3, firstTodayIdx >= 0 ? firstTodayIdx : bars.length - 10);

  const priorDayBars = bars.filter((b) => b.dateIST < lastDate);
  const priorDate = priorDayBars.length > 0 ? priorDayBars[priorDayBars.length - 1].dateIST : '';
  const prevSess = priorDate ? priorDayBars.filter((b) => b.dateIST === priorDate) : [];
  const pdh = round2(prevSess.length > 0 ? Math.max(...prevSess.map((b) => b.high)) : bars[scanStartIdx].high);
  const pdl = round2(prevSess.length > 0 ? Math.min(...prevSess.map((b) => b.low)) : bars[scanStartIdx].low);

  // Build running 5m VWAP + Day High/Low up to bar i
  const vwapSeries = new Array<number>(bars.length).fill(hlc3[0]);
  const dayHighSeries = new Array<number>(bars.length).fill(bars[0].high);
  const dayLowSeries = new Array<number>(bars.length).fill(bars[0].low);
  let cumTPV = 0;
  let cumVol = 0;
  let rHigh = bars[scanStartIdx].high;
  let rLow = bars[scanStartIdx].low;
  for (let k = scanStartIdx; k < bars.length; k++) {
    if (bars[k].high > rHigh) rHigh = bars[k].high;
    if (bars[k].low < rLow) rLow = bars[k].low;
    cumTPV += hlc3[k] * bars[k].volume;
    cumVol += bars[k].volume;
    dayHighSeries[k] = rHigh;
    dayLowSeries[k] = rLow;
    vwapSeries[k] = cumVol > 0 ? cumTPV / cumVol : Number(stock.indicators?.vwap) || hlc3[k];
  }

  // Helper: map 5m bar index `i` to the most recent completed/active 15m bar index (anti-repainting: prefer previous completed 15m bar when available)
  let ptr15 = 0;
  const map15mIndex = (i5: number): number => {
    const b5 = bars[i5];
    while (
      ptr15 + 1 < bars15m.length &&
      (bars15m[ptr15 + 1].dateIST < b5.dateIST ||
        (bars15m[ptr15 + 1].dateIST === b5.dateIST && bars15m[ptr15 + 1].secIST <= b5.secIST))
    ) {
      ptr15++;
    }
    return ptr15;
  };

  const evaluateSideAtBar = (i: number, side: 'BUY' | 'SELL'): MoneyFlowSignalRow | null => {
    const b = bars[i];
    const prev = bars[i - 1];
    const isLatestBar = i === bars.length - 1;
    const h15Idx = map15mIndex(i);
    // Use completed 15m bar direction to avoid intrabar repainting when available
    const completed15Idx =
      h15Idx >= 1 && b.secIST - bars15m[h15Idx].secIST < 600 ? h15Idx - 1 : h15Idx;

    // 1. 15-minute HMA 55 rising/falling
    const hma15Cur = hma15[h15Idx] ?? b.close;
    const hma15Prev = hma15[Math.max(0, h15Idx - 1)] ?? hma15Cur;
    const hma15Rising = hma15Cur > hma15Prev;
    const hma15Falling = hma15Cur < hma15Prev;
    const cond1HtfHma = side === 'BUY' ? hma15Rising : hma15Falling;

    // 2. 15-minute Supertrend(10, 2.0) bullish/bearish (non-repainting)
    const st15Dir = st15.dir[completed15Idx] ?? 1;
    const cond2HtfSt = side === 'BUY' ? st15Dir === 1 : st15Dir === -1;

    // 3. 5-minute close vs HMA 55 & 5m HMA direction/slope
    const hma5Cur = hma5[i];
    const hma5Prev = hma5[i - 1] ?? hma5Cur;
    const hma5Prev2 = hma5[Math.max(0, i - 2)] ?? hma5Prev;
    const slope1 = hma5Cur - hma5Prev;
    const slope0 = hma5Prev - hma5Prev2;
    const hma5BiasOk = side === 'BUY' ? b.close > hma5Cur && slope1 > 0 : b.close < hma5Cur && slope1 < 0;
    const slopeStrengthening =
      side === 'BUY' ? slope1 > 0 && slope1 >= slope0 : slope1 < 0 && slope1 <= slope0;
    const cond3Hma5 = hma5BiasOk;

    // 4 & 5. Fair Value Gap formed & retested
    const fvg = findBestPriorFvg(bars, i, side, 40);
    const cond4FvgFormed = Boolean(fvg && !fvg.invalidated);
    const cond5FvgRetest = Boolean(fvg && fvg.retested && !fvg.invalidated);

    // 6. Rejection candle + Volume RVOL >= 1.5x + 5m Supertrend non-repainting bullish/bearish
    const avgVol20 = smaAt(vols5, Math.max(0, i - 1), 20);
    const avgMf20 = smaAt(mf5, Math.max(0, i - 1), 20);
    const effectiveVol =
      isLatestBar && prev && prev.volume > 100 && b.volume < prev.volume * 0.4
        ? Math.max(b.volume, Math.round(prev.volume * 0.9))
        : b.volume;
    const rvol = round2(avgVol20 > 0 ? effectiveVol / avgVol20 : Number(stock.indicators?.rvol || 1));
    const speed = rvol;
    const glowSurge = round2(avgMf20 > 0 ? (effectiveVol * hlc3[i]) / avgMf20 : speed);

    const range = Math.max(0.05, b.high - b.low);
    const bodyPct = Math.round((Math.abs(b.close - b.open) / range) * 100);
    const lowerWickPct = Math.round(((Math.min(b.open, b.close) - b.low) / range) * 100);
    const upperWickPct = Math.round(((b.high - Math.max(b.open, b.close)) / range) * 100);
    const wickRejectionPct = side === 'BUY' ? lowerWickPct : upperWickPct;

    const isGreen = b.close > b.open;
    const isRed = b.close < b.open;
    const strongRejection =
      side === 'BUY'
        ? isGreen && (wickRejectionPct >= 22 || (b.close - b.low) / range >= 0.65)
        : isRed && (wickRejectionPct >= 22 || (b.high - b.close) / range >= 0.65);

    // Non-repainting Supertrend check: previous completed candle and current bar aligned
    const st5PrevDir = st5.dir[Math.max(0, i - 1)];
    const st5CurDir = st5.dir[i];
    const st5Aligned =
      side === 'BUY' ? st5CurDir === 1 && st5PrevDir === 1 : st5CurDir === -1 && st5PrevDir === -1;

    const cond6RejectVolSt =
      (side === 'BUY' ? isGreen : isRed) && rvol >= 1.5 && st5Aligned;

    // 100-Point FinURL Smart Money Scoring System
    const htfTrendConfirmation = cond1HtfHma && cond2HtfSt ? 20 : cond1HtfHma || cond2HtfSt ? 10 : 0;
    const hmaDirectionAndSlope =
      (cond3Hma5 ? 10 : (side === 'BUY' ? b.close > hma5Cur : b.close < hma5Cur) ? 5 : 0) +
      (slopeStrengthening ? 10 : (side === 'BUY' ? slope1 > 0 : slope1 < 0) ? 5 : 0);
    const fvgQualityAndRetest =
      (cond4FvgFormed ? (fvg!.isFresh ? 10 : 6) : 0) +
      (cond5FvgRetest ? 10 : 0) +
      (strongRejection ? 5 : (side === 'BUY' ? isGreen : isRed) ? 2 : 0);
    const relativeVolume = rvol >= 2.0 ? 20 : rvol >= 1.5 ? 15 : rvol >= 1.3 ? 10 : rvol >= 1.0 ? 5 : 0;
    const supertrendConfirmation = st5Aligned ? 15 : st5CurDir === (side === 'BUY' ? 1 : -1) ? 8 : 0;

    const score =
      htfTrendConfirmation +
      hmaDirectionAndSlope +
      fvgQualityAndRetest +
      relativeVolume +
      supertrendConfirmation;

    const conditions: MoneyFlowConditionCheck[] = [
      {
        step: 1,
        label: `15m HMA(55) ${side === 'BUY' ? 'Rising' : 'Falling'}`,
        passed: cond1HtfHma,
        detail: `15m HMA ₹${round2(hma15Cur)} vs prev ₹${round2(hma15Prev)}`,
      },
      {
        step: 2,
        label: `15m Supertrend(10,2) ${side === 'BUY' ? 'Bullish' : 'Bearish'}`,
        passed: cond2HtfSt,
        detail: `15m ST ${st15Dir === 1 ? 'BULLISH' : 'BEARISH'} @ ₹${round2(st15.line[completed15Idx] || b.close)}`,
      },
      {
        step: 3,
        label: `5m Close ${side === 'BUY' ? '>' : '<'} HMA(${hma5Period})`,
        passed: cond3Hma5,
        detail: `Close ₹${round2(b.close)} vs HMA ₹${round2(hma5Cur)}`,
      },
      {
        step: 4,
        label: `${side === 'BUY' ? 'Bullish' : 'Bearish'} FVG Formed`,
        passed: cond4FvgFormed,
        detail: fvg
          ? `FVG ₹${fvg.bottom}–₹${fvg.top} (${fvg.isFresh ? 'Unmitigated' : 'Tested'} @ ${fvg.formedAt})`
          : 'No unmitigated 3-candle FVG in last 40 bars',
      },
      {
        step: 5,
        label: `Retrace into ${side === 'BUY' ? 'Bullish' : 'Bearish'} FVG Zone`,
        passed: cond5FvgRetest,
        detail: cond5FvgRetest && fvg ? `Retested ₹${fvg.bottom}–₹${fvg.top}` : 'Awaiting FVG pullback retest',
      },
      {
        step: 6,
        label: `${side === 'BUY' ? 'Bullish' : 'Bearish'} Rejection + RVOL >= 1.5x + 5m ST`,
        passed: cond6RejectVolSt,
        detail: `${isGreen ? 'Green' : isRed ? 'Red' : 'Doji'} • RVOL ${rvol}x (${classifyRvol(rvol)}) • 5m ST ${st5CurDir === 1 ? 'BULL' : 'BEAR'}`,
      },
    ];

    const conditionsMet = conditions.filter((c) => c.passed).length;
    const allSixMet = conditionsMet === 6;

    // Exact Entry, Stop Loss & T1/T2/T3 Targets
    const atr14 = Math.max(0.1, atr14Arr[i] || b.close * 0.005);
    let entryPrice: number;
    let stopLoss: number;
    if (side === 'BUY') {
      entryPrice = round2(b.high);
      const slBase = fvg ? Math.min(fvg.bottom, b.low) : b.low;
      stopLoss = round2(Math.max(0.05, slBase - 0.1 * atr14));
    } else {
      entryPrice = round2(b.low);
      const slBase = fvg ? Math.max(fvg.top, b.high) : b.high;
      stopLoss = round2(slBase + 0.1 * atr14);
    }

    const riskR = round2(Math.max(0.05, side === 'BUY' ? entryPrice - stopLoss : stopLoss - entryPrice));
    const target1 = round2(side === 'BUY' ? entryPrice + riskR : Math.max(0.05, entryPrice - riskR));
    const target2 = round2(side === 'BUY' ? entryPrice + 2 * riskR : Math.max(0.05, entryPrice - 2 * riskR));
    const target3 = round2(side === 'BUY' ? entryPrice + 3 * riskR : Math.max(0.05, entryPrice - 3 * riskR));

    // Authentic trigger bar confirmation timestamp capped at current IST time
    const barConfirmSec = Math.min(15 * 3600 + 29 * 60 + 55, b.secIST + 299);
    const nowParts = istTimeStr.split(':').map((x) => parseInt(x, 10) || 0);
    const nowSec = (nowParts[0] || 0) * 3600 + (nowParts[1] || 0) * 60 + (nowParts[2] || 0);
    const isMarketToday = b.dateIST === istDateStr && nowSec >= 9 * 3600 + 15 * 60 && nowSec <= 15 * 3600 + 30 * 60;
    const listedAt = formatSecToHHMMSS(isMarketToday ? Math.min(nowSec, barConfirmSec) : barConfirmSec);

    const livePrice = round2(Number(stock.price) || b.close);
    const classification = classifyFinUrlScore(score, side);
    const grade: MoneyFlowSignalRow['grade'] = allSixMet
      ? '6/6 CONFIRMED'
      : score >= 85
        ? 'STRONG'
        : score >= 75
          ? 'GOOD'
          : 'WATCHLIST';

    return {
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector || 'NSE F&O',
      sectorChangePct: round2(sectorChangePct),
      direction: side,
      grade,
      classification,
      allSixMet,
      conditionsMet,
      totalConditions: 6,
      listedAt,
      price: livePrice,
      entryPrice,
      stopLoss,
      target1,
      target2,
      target3,
      riskR,
      rrRatio: '1:2 / 1:3',
      atr14: round2(atr14),
      changePercent: round2(Number(stock.changePercent) || 0),
      hlc3: round2(hlc3[i]),
      vwap: round2(vwapSeries[i] || livePrice),
      pdh,
      pdl,
      dayHigh: round2(dayHighSeries[i] || livePrice),
      dayLow: round2(dayLowSeries[i] || livePrice),
      moneyFlowRs: Math.round(mf5[i]),
      moneyFlowCr: round2(mf5[i] / 1e7),
      avgMoneyFlowCr: round2(avgMf20 / 1e7),
      rvol,
      rvolInterpretation: classifyRvol(rvol),
      speed,
      glowSurge,
      bidAskRatio: round2(Number(stock.bidAskRatio) || 1.0),
      rejectionCandle: {
        timeIST: b.timeIST,
        open: round2(b.open),
        high: round2(b.high),
        low: round2(b.low),
        close: round2(b.close),
        isGreen,
        bodyPct,
        wickRejectionPct,
        strongRejection,
      },
      supertrend: {
        direction: st5CurDir === 1 ? 'BULLISH' : 'BEARISH',
        prevCompletedDirection: st5PrevDir === 1 ? 'BULLISH' : 'BEARISH',
        value: round2(st5.line[i]),
        atr10: round2(st5.atr[i]),
        justTurned: side === 'BUY' ? st5.turnedBull[i] : st5.turnedBear[i],
      },
      supertrend15m: {
        direction: st15Dir === 1 ? 'BULLISH' : 'BEARISH',
        value: round2(st15.line[completed15Idx] || b.close),
      },
      hullSuite: {
        hma55: round2(hma5Cur),
        periodUsed: hma5Period,
        position: b.close >= hma5Cur ? 'ABOVE' : 'BELOW',
        slope: slope1 >= 0 ? 'UP' : 'DOWN',
        slopeStrengthening,
      },
      hma15m: {
        hma55: round2(hma15Cur),
        periodUsed: hma15Period,
        slope: hma15Rising ? 'RISING' : 'FALLING',
      },
      fvg,
      scoreBreakdown: {
        htfTrendConfirmation,
        hmaDirectionAndSlope,
        fvgQualityAndRetest,
        relativeVolume,
        supertrendConfirmation,
        total: score,
      },
      conditions,
      score,
      tradeManagement: TRADE_MANAGEMENT_RULES.map((r) => `${r.situation}: ${r.action}`),
    };
  };

  // Scan today's 5m bars newest -> oldest so a genuine 6/6 FVG retest + RVOL trigger today stays locked,
  // otherwise surface highest-scoring active Watchlist/Good setup (>= 60 pts) from the latest qualifying bar.
  let bestBuy: MoneyFlowSignalRow | null = null;
  let bestSell: MoneyFlowSignalRow | null = null;

  for (let i = bars.length - 1; i >= scanStartIdx; i--) {
    const bCand = evaluateSideAtBar(i, 'BUY');
    if (bCand) {
      if (bCand.allSixMet && (!bestBuy || !bestBuy.allSixMet || bCand.score > bestBuy.score)) {
        bestBuy = bCand;
      } else if (
        !bestBuy ||
        (!bestBuy.allSixMet && (bCand.conditionsMet > bestBuy.conditionsMet || (bCand.conditionsMet === bestBuy.conditionsMet && bCand.score > bestBuy.score)))
      ) {
        bestBuy = bCand;
      }
    }

    const sCand = evaluateSideAtBar(i, 'SELL');
    if (sCand) {
      if (sCand.allSixMet && (!bestSell || !bestSell.allSixMet || sCand.score > bestSell.score)) {
        bestSell = sCand;
      } else if (
        !bestSell ||
        (!bestSell.allSixMet && (sCand.conditionsMet > bestSell.conditionsMet || (sCand.conditionsMet === bestSell.conditionsMet && sCand.score > bestSell.score)))
      ) {
        bestSell = sCand;
      }
    }

    if (bestBuy?.allSixMet && bestSell?.allSixMet) break;
  }

  // Keep dominant side cleanly if stock isn't genuinely 6/6 on opposite side
  const buyOut = bestBuy && bestBuy.score >= 60 && (bestBuy.allSixMet || bestBuy.changePercent >= -0.5) ? bestBuy : null;
  const sellOut = bestSell && bestSell.score >= 60 && (bestSell.allSixMet || bestSell.changePercent <= 0.5) ? bestSell : null;

  return { buyRow: buyOut, sellRow: sellOut };
}

let lastCachedMfReport: MoneyFlowScanReport | null = null;
let lastCachedMfAt = 0;
let lastCachedMfDate = '';

export function buildSmartMoneyFlowReport(
  stocks: ScannedStock[],
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined,
  candlesMap: Map<string, Candle[]>,
  isMidnightCleared: boolean,
  niftyInfo?: { price?: number; vwap?: number; chp?: number; bars?: IntradayCandleBar[] }
): MoneyFlowScanReport {
  const now = new Date();
  const ist = getISTDateParts(now);

  if (lastCachedMfDate !== ist.dateStr) {
    lastCachedMfDate = ist.dateStr;
    lastCachedMfReport = null;
  }

  const nBars = Array.isArray(niftyInfo?.bars) ? niftyInfo!.bars : getExtendedBarsFn('NIFTY 50');
  const niftyPrice = Number(niftyInfo?.price || (nBars && nBars.length > 0 ? nBars[nBars.length - 1].close : 25250));
  let niftyVwap = Number(niftyInfo?.vwap || 0);
  if ((!niftyVwap || niftyVwap <= 0) && nBars && nBars.length > 0) {
    const latestNDate = nBars[nBars.length - 1].dateIST;
    const todayNBars = nBars.filter((b) => b.dateIST === latestNDate);
    const activeN = todayNBars.length > 0 ? todayNBars : nBars.slice(-20);
    let tpv = 0;
    let vol = 0;
    for (const nb of activeN) {
      const hlc = (nb.high + nb.low + nb.close) / 3;
      const v = Math.max(1, nb.volume || 1);
      tpv += hlc * v;
      vol += v;
    }
    if (vol > 0) niftyVwap = Number((tpv / vol).toFixed(2));
  }
  if (!niftyVwap || niftyVwap <= 0) {
    const chpEst = Number(niftyInfo?.chp || 0);
    niftyVwap = Number((niftyPrice / (1 + (chpEst * 0.5) / 100)).toFixed(2));
  }
  const niftyTrend: 'BULLISH' | 'BEARISH' = niftyPrice >= niftyVwap ? 'BULLISH' : 'BEARISH';
  const niftyRegime: MoneyFlowNiftyRegime = {
    symbol: 'NIFTY 50',
    price: round2(niftyPrice),
    vwap: round2(niftyVwap),
    trend: niftyTrend,
    vsVwapPct: niftyVwap > 0 ? round2(((niftyPrice - niftyVwap) / niftyVwap) * 100) : 0,
  };

  if (isMidnightCleared) {
    lastCachedMfReport = null;
    return {
      status: 'ok',
      strategyName: 'FinURL HMA 55 + FVG + Volume + Supertrend Strategy',
      generatedAt: now.toISOString(),
      istTime: ist.timeStr,
      isMidnightCleared: true,
      universeEvaluated: 0,
      confirmedBuyCount: 0,
      confirmedSellCount: 0,
      strongBuyCount: 0,
      strongSellCount: 0,
      strictBuyCount: 0,
      strictSellCount: 0,
      niftyRegime,
      indicatorSettings: INDICATOR_SETTINGS,
      tradeManagementRules: TRADE_MANAGEMENT_RULES,
      buySignals: [],
      sellSignals: [],
    };
  }

  if (
    lastCachedMfReport &&
    !lastCachedMfReport.isMidnightCleared &&
    stocks.length > 0 &&
    Date.now() - lastCachedMfAt < 2500
  ) {
    return lastCachedMfReport;
  }

  const equityStocks = stocks.filter(
    (s) => s.sector !== 'Indices' && !INDEX_BLACKLIST.has(s.symbol.toUpperCase())
  );

  const sectorAccum = new Map<string, { sum: number; cnt: number }>();
  for (const s of equityStocks) {
    const sec = s.sector || 'NSE F&O';
    const cur = sectorAccum.get(sec) || { sum: 0, cnt: 0 };
    cur.sum += Number(s.changePercent) || 0;
    cur.cnt += 1;
    sectorAccum.set(sec, cur);
  }
  const sectorAvgPctMap: Record<string, number> = {};
  sectorAccum.forEach((v, sec) => {
    sectorAvgPctMap[sec] = round2(v.sum / Math.max(1, v.cnt));
  });

  const allBuyCandidates: MoneyFlowSignalRow[] = [];
  const allSellCandidates: MoneyFlowSignalRow[] = [];

  for (const stock of equityStocks) {
    const bars = buildWorkBars(stock, getExtendedBarsFn(stock.symbol), candlesMap.get(stock.symbol), ist.dateStr);
    if (bars.length < 10) continue;

    const { buyRow, sellRow } = evaluateStockFinUrlStrategy({
      stock,
      bars,
      sectorChangePct: sectorAvgPctMap[stock.sector || 'NSE F&O'] ?? 0,
      istDateStr: ist.dateStr,
      istTimeStr: ist.timeStr,
    });

    if (buyRow) allBuyCandidates.push(buyRow);
    if (sellRow) allSellCandidates.push(sellRow);
  }

  const rankComparator = (a: MoneyFlowSignalRow, b: MoneyFlowSignalRow) => {
    if (a.allSixMet !== b.allSixMet) return a.allSixMet ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return parseTimeToSec(b.listedAt) - parseTimeToSec(a.listedAt) || b.rvol - a.rvol;
  };

  const buySignals = allBuyCandidates.sort(rankComparator).slice(0, 25);
  const sellSignals = allSellCandidates.sort(rankComparator).slice(0, 25);

  const confirmedBuyCount = allBuyCandidates.filter((x) => x.allSixMet).length;
  const confirmedSellCount = allSellCandidates.filter((x) => x.allSixMet).length;
  const strongBuyCount = allBuyCandidates.filter((x) => x.score >= 85).length;
  const strongSellCount = allSellCandidates.filter((x) => x.score >= 85).length;

  const builtReport: MoneyFlowScanReport = {
    status: 'ok',
    strategyName: 'FinURL HMA 55 + FVG + Volume + Supertrend Strategy',
    generatedAt: now.toISOString(),
    istTime: ist.timeStr,
    isMidnightCleared: false,
    universeEvaluated: equityStocks.length,
    confirmedBuyCount,
    confirmedSellCount,
    strongBuyCount,
    strongSellCount,
    strictBuyCount: confirmedBuyCount,
    strictSellCount: confirmedSellCount,
    niftyRegime,
    indicatorSettings: INDICATOR_SETTINGS,
    tradeManagementRules: TRADE_MANAGEMENT_RULES,
    buySignals,
    sellSignals,
  };

  if (equityStocks.length > 0) {
    lastCachedMfReport = builtReport;
    lastCachedMfAt = Date.now();
  }
  return builtReport;
}
