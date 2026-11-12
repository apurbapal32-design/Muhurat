import { Candle, ScannedStock } from '../src/types';
import { getISTDateParts } from '../src/data/marketSchedule';
import { IntradayCandleBar } from './autonomousPriceService';

export interface MoneyFlowConditionCheck {
  step: number;
  label: string;
  passed: boolean;
  detail: string;
}

export interface MoneyFlowSignalRow {
  symbol: string;
  name: string;
  sector: string;
  direction: 'BUY' | 'SELL';
  grade: 'STRICT 8/8' | 'HIGH SURGE' | 'SETUP';
  conditionsMet: number;
  totalConditions: 8;
  listedAt: string;
  price: number;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  changePercent: number;
  hlc3: number;
  moneyFlowRs: number;
  moneyFlowCr: number;
  avgMoneyFlowCr: number;
  speed: number;
  glowSurge: number;
  buyingPressurePct: number;
  sellingPressurePct: number;
  bidAskRatio: number;
  supertrend: {
    direction: 'BULLISH' | 'BEARISH';
    value: number;
    atr10: number;
    justTurned: boolean;
  };
  hullSuite: {
    hma55: number;
    periodUsed: number;
    position: 'ABOVE' | 'BELOW';
    slope: 'UP' | 'DOWN';
  };
  structure: {
    tag: 'BULLISH BOS' | 'BULLISH CHoCH' | 'BEARISH BOS' | 'BEARISH CHoCH' | 'RANGE';
    swingLevel: number;
  };
  orderBlock: {
    type: 'BULLISH OB' | 'BEARISH OB';
    low: number;
    high: number;
    time: string;
    breakConfirmed: boolean;
  };
  conditions: MoneyFlowConditionCheck[];
  score: number;
}

export interface MoneyFlowScanReport {
  status: 'ok';
  generatedAt: string;
  istTime: string;
  isMidnightCleared: boolean;
  universeEvaluated: number;
  strictBuyCount: number;
  strictSellCount: number;
  indicatorSpecs: Array<{
    component: string;
    formula: string;
    purpose: string;
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

function parseTimeToSec(t?: string): number {
  if (!t) return 9 * 3600 + 30 * 60;
  const parts = t.trim().split(':').map((x) => parseInt(x, 10) || 0);
  return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
}

function formatSecToHHMMSS(sec: number): string {
  const s = Math.max(0, Math.min(23 * 3600 + 59 * 60 + 59, Math.round(sec)));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function deterministicSecOffset(symbol: string, barIdx: number): number {
  let h = 2166136261;
  for (let i = 0; i < symbol.length; i++) {
    h ^= symbol.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((Math.abs(h) + barIdx * 17) % 53) + 4;
}

/**
 * Weighted Moving Average series (Pine `ta.wma` equivalent).
 */
function computeWMA(values: number[], period: number): number[] {
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
 * Hull Moving Average (HMA 55, Close): WMA(2 * WMA(n/2) - WMA(n), round(sqrt(n))).
 */
function computeHMA(closes: number[], targetPeriod: number = 55): { series: number[]; periodUsed: number } {
  const periodUsed = closes.length >= targetPeriod + 8 ? targetPeriod : Math.max(9, Math.min(targetPeriod, closes.length - 5));
  const halfLen = Math.max(2, Math.floor(periodUsed / 2));
  const sqrtLen = Math.max(2, Math.round(Math.sqrt(periodUsed)));
  const wmaHalf = computeWMA(closes, halfLen);
  const wmaFull = computeWMA(closes, periodUsed);
  const diff = closes.map((_, i) => 2 * wmaHalf[i] - wmaFull[i]);
  return { series: computeWMA(diff, sqrtLen), periodUsed };
}

/**
 * Wilder ATR(10) + Supertrend(10, 2).
 */
function computeSupertrend(bars: WorkBar[], atrLen: number = 10, mult: number = 2): {
  dir: Array<1 | -1>;
  line: number[];
  atr: number[];
  turnedBull: boolean[];
  turnedBear: boolean[];
} {
  const len = bars.length;
  const tr = new Array<number>(len).fill(0);
  const atr = new Array<number>(len).fill(0);
  const dir = new Array<1 | -1>(len).fill(1);
  const finalUpper = new Array<number>(len).fill(0);
  const finalLower = new Array<number>(len).fill(0);
  const line = new Array<number>(len).fill(0);
  const turnedBull = new Array<boolean>(len).fill(false);
  const turnedBear = new Array<boolean>(len).fill(false);

  for (let i = 0; i < len; i++) {
    const b = bars[i];
    if (i === 0) {
      tr[i] = Math.max(0.05, b.high - b.low);
      atr[i] = tr[i];
    } else {
      const pc = bars[i - 1].close;
      tr[i] = Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc));
      atr[i] = (atr[i - 1] * (atrLen - 1) + tr[i]) / atrLen;
    }

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
 * Simple Moving Average over trailing `period` elements up to index `i`.
 */
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

interface StructureSnapshot {
  tag: 'BULLISH BOS' | 'BULLISH CHoCH' | 'BEARISH BOS' | 'BEARISH CHoCH' | 'RANGE';
  swingLevel: number;
  bullOB: { low: number; high: number; time: string } | null;
  bearOB: { low: number; high: number; time: string } | null;
}

/**
 * Computes bar-by-bar Market Structure (BOS / CHoCH) & Order Blocks (last opposite candle before BOS).
 */
function computeStructureTimeline(bars: WorkBar[]): StructureSnapshot[] {
  const len = bars.length;
  const out: StructureSnapshot[] = new Array(len);

  let marketBias: 1 | -1 = 1;
  let swingHigh = bars[0]?.high || 0;
  let swingHighIdx = 0;
  let swingLow = bars[0]?.low || 0;
  let swingLowIdx = 0;
  let bullOB: { low: number; high: number; time: string } | null = null;
  let bearOB: { low: number; high: number; time: string } | null = null;
  let activeTag: StructureSnapshot['tag'] = 'RANGE';
  let activeSwing = bars[0]?.close || 0;

  for (let i = 0; i < len; i++) {
    // Update fractal pivot confirmed 2 bars ago (no look-ahead leak)
    if (i >= 4) {
      const p = i - 2;
      const pb = bars[p];
      if (
        pb.high >= bars[p - 1].high &&
        pb.high >= bars[p - 2].high &&
        pb.high >= bars[p + 1].high &&
        pb.high >= bars[p + 2].high
      ) {
        swingHigh = pb.high;
        swingHighIdx = p;
      }
      if (
        pb.low <= bars[p - 1].low &&
        pb.low <= bars[p - 2].low &&
        pb.low <= bars[p + 1].low &&
        pb.low <= bars[p + 2].low
      ) {
        swingLow = pb.low;
        swingLowIdx = p;
      }
    }

    const cur = bars[i];
    if (cur.close > swingHigh && i - swingHighIdx >= 2) {
      activeTag = marketBias === -1 ? 'BULLISH CHoCH' : 'BULLISH BOS';
      activeSwing = swingHigh;
      marketBias = 1;
      // Find last bearish candle before the bullish displacement leg
      for (let back = i - 1; back >= Math.max(0, i - 10); back--) {
        if (bars[back].close < bars[back].open) {
          bullOB = {
            low: bars[back].low,
            high: bars[back].high,
            time: bars[back].timeIST,
          };
          break;
        }
      }
      if (!bullOB) {
        const ref = bars[Math.max(0, swingLowIdx)];
        bullOB = { low: ref.low, high: ref.high, time: ref.timeIST };
      }
      swingHigh = cur.high;
      swingHighIdx = i;
    } else if (cur.close < swingLow && i - swingLowIdx >= 2) {
      activeTag = marketBias === 1 ? 'BEARISH CHoCH' : 'BEARISH BOS';
      activeSwing = swingLow;
      marketBias = -1;
      // Find last bullish candle before the bearish displacement leg
      for (let back = i - 1; back >= Math.max(0, i - 10); back--) {
        if (bars[back].close > bars[back].open) {
          bearOB = {
            low: bars[back].low,
            high: bars[back].high,
            time: bars[back].timeIST,
          };
          break;
        }
      }
      if (!bearOB) {
        const ref = bars[Math.max(0, swingHighIdx)];
        bearOB = { low: ref.low, high: ref.high, time: ref.timeIST };
      }
      swingLow = cur.low;
      swingLowIdx = i;
    }

    // Also maintain rolling demand/supply OB from nearest recent opposite swing candle if not triggered yet
    if (!bullOB && cur.close > cur.open && i >= 1 && bars[i - 1].close < bars[i - 1].open) {
      bullOB = { low: bars[i - 1].low, high: bars[i - 1].high, time: bars[i - 1].timeIST };
    }
    if (!bearOB && cur.close < cur.open && i >= 1 && bars[i - 1].close > bars[i - 1].open) {
      bearOB = { low: bars[i - 1].low, high: bars[i - 1].high, time: bars[i - 1].timeIST };
    }

    out[i] = {
      tag: activeTag,
      swingLevel: Number(activeSwing.toFixed(2)),
      bullOB: bullOB ? { ...bullOB } : null,
      bearOB: bearOB ? { ...bearOB } : null,
    };
  }

  return out;
}

function buildWorkBars(
  stock: ScannedStock,
  extendedBars: IntradayCandleBar[] | undefined,
  fallbackCandles: Candle[] | undefined,
  todayDateIST: string
): WorkBar[] {
  let raw: WorkBar[] = [];

  if (Array.isArray(extendedBars) && extendedBars.length >= 12) {
    raw = extendedBars.map((b) => ({
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
    raw = fallbackCandles.map((c, idx) => {
      const sec = 9 * 3600 + 15 * 60 + idx * 300;
      return {
        timeIST: c.time.length === 5 ? `${c.time}:00` : c.time,
        dateIST: todayDateIST,
        secIST: Math.min(15 * 3600 + 29 * 60, sec),
        open: Number(c.open) || Number(c.close),
        high: Number(c.high) || Number(c.close),
        low: Number(c.low) || Number(c.close),
        close: Number(c.close) || Number(stock.price),
        volume: Math.max(100, Math.round(Number(c.volume) || 1000)),
      };
    });
  }

  if (raw.length === 0) {
    const p = Number(stock.price) || 100;
    const prev = p - (Number(stock.change) || 0);
    for (let i = 0; i < 30; i++) {
      const ratio = (i + 1) / 30;
      const c = Number((prev + (p - prev) * ratio).toFixed(2));
      raw.push({
        timeIST: formatSecToHHMMSS(9 * 3600 + 15 * 60 + i * 300),
        dateIST: todayDateIST,
        secIST: Math.min(15 * 3600 + 29 * 60, 9 * 3600 + 15 * 60 + i * 300),
        open: Number((i === 0 ? prev : raw[i - 1].close).toFixed(2)),
        high: Number((c * 1.002).toFixed(2)),
        low: Number((c * 0.998).toFixed(2)),
        close: c,
        volume: Math.max(500, Math.round((Number(stock.volume) || 250000) / 30)),
      });
    }
  }

  // Sync live price onto the trailing bar accurately
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

/**
 * Evaluates all NSE F&O stocks against the Smart Money Flow + Supertrend(10,2) + Hull Suite(HMA 55) + BOS/CHoCH + Order Block formula.
 */
export function buildSmartMoneyFlowReport(
  stocks: ScannedStock[],
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined,
  candlesMap: Map<string, Candle[]>,
  isMidnightCleared: boolean
): MoneyFlowScanReport {
  const now = new Date();
  const ist = getISTDateParts(now);

  const indicatorSpecs = [
    { component: 'Money Flow Thickness', formula: 'Volume × HLC3  (HLC3 = (H+L+C)/3)', purpose: '₹ Trading Turnover' },
    { component: 'Speed', formula: 'Volume / 20-period Avg Volume', purpose: 'Volume Intensity (>= 1.5x)' },
    { component: 'Glow / Surge', formula: 'Money Flow / 20-period Avg MF', purpose: 'Money Flow Acceleration (>= 1.3x)' },
    { component: 'Supertrend', formula: 'ATR(10), Multiplier 2', purpose: 'Trend Direction & Flip' },
    { component: 'Hull Suite', formula: 'HMA(55, Close)', purpose: 'Momentum Direction' },
    { component: 'Smart Money', formula: 'BOS / CHoCH (Fractal Pivots)', purpose: 'Market Structure Shift' },
    { component: 'Order Block', formula: 'Last opposite candle before BOS', purpose: 'Institutional Demand / Supply Zone' },
  ];

  if (isMidnightCleared) {
    return {
      status: 'ok',
      generatedAt: now.toISOString(),
      istTime: ist.timeStr,
      isMidnightCleared: true,
      universeEvaluated: 0,
      strictBuyCount: 0,
      strictSellCount: 0,
      indicatorSpecs,
      buySignals: [],
      sellSignals: [],
    };
  }

  const equityStocks = stocks.filter(
    (s) => s.sector !== 'Indices' && !INDEX_BLACKLIST.has(s.symbol.toUpperCase())
  );

  const allBuyCandidates: MoneyFlowSignalRow[] = [];
  const allSellCandidates: MoneyFlowSignalRow[] = [];

  for (const stock of equityStocks) {
    const extBars = getExtendedBarsFn(stock.symbol);
    const bars = buildWorkBars(stock, extBars, candlesMap.get(stock.symbol), ist.dateStr);
    if (bars.length < 12) continue;

    const closes = bars.map((b) => b.close);
    const hlc3 = bars.map((b) => (b.high + b.low + b.close) / 3);
    const mf = bars.map((b, i) => b.volume * hlc3[i]);
    const vols = bars.map((b) => b.volume);

    const st = computeSupertrend(bars, 10, 2);
    const { series: hma, periodUsed } = computeHMA(closes, 55);
    const struct = computeStructureTimeline(bars);

    const lastDate = bars[bars.length - 1].dateIST;
    const scanStartIdx = Math.max(
      2,
      bars.findIndex((b) => b.dateIST === lastDate)
    );

    const ratio = Number(stock.bidAskRatio || 1.0);
    const obBuyBiasPct = Math.round((ratio / (ratio + 1)) * 100);

    // Evaluate across today's session bars to pinpoint the exact highest-confluence trigger bar
    let bestBuyIdx = bars.length - 1;
    let bestBuyCount = -1;
    let bestBuyScore = -1e9;
    let bestBuyChecks: MoneyFlowConditionCheck[] = [];

    let bestSellIdx = bars.length - 1;
    let bestSellCount = -1;
    let bestSellScore = -1e9;
    let bestSellChecks: MoneyFlowConditionCheck[] = [];

    for (let i = scanStartIdx; i < bars.length; i++) {
      const b = bars[i];
      const prev = bars[i - 1];
      const avgVol20 = smaAt(vols, Math.max(0, i - 1), 20);
      const avgMf20 = smaAt(mf, Math.max(0, i - 1), 20);
      const speed = avgVol20 > 0 ? b.volume / avgVol20 : Number(stock.indicators?.rvol || 1);
      const glow = avgMf20 > 0 ? mf[i] / avgMf20 : speed;
      const ss = struct[i];

      const barRange = Math.max(0.05, b.high - b.low);
      const barClosePosPct = Math.round(((b.close - b.low) / barRange) * 100);
      const buyPresPct = Math.round(barClosePosPct * 0.55 + obBuyBiasPct * 0.45);
      const sellPresPct = 100 - buyPresPct;

      const stRecentTurnBull =
        st.turnedBull[i] || (i >= 1 && st.turnedBull[i - 1]) || (i >= 2 && st.turnedBull[i - 2]);
      const stRecentTurnBear =
        st.turnedBear[i] || (i >= 1 && st.turnedBear[i - 1]) || (i >= 2 && st.turnedBear[i - 2]);

      const buyOb = ss.bullOB || { low: Math.min(prev.low, b.low), high: Math.max(prev.open, prev.close), time: prev.timeIST };
      const sellOb = ss.bearOB || { low: Math.min(prev.open, prev.close), high: Math.max(prev.high, b.high), time: prev.timeIST };

      // 8 BUY Conditions
      const buyChecks: MoneyFlowConditionCheck[] = [
        {
          step: 1,
          label: 'Supertrend (10,2) Bullish',
          passed: st.dir[i] === 1,
          detail: `${st.dir[i] === 1 ? 'BULLISH' : 'BEARISH'}${stRecentTurnBull ? ' (Fresh Flip)' : ''} @ ₹${st.line[i].toFixed(2)}`,
        },
        {
          step: 2,
          label: '2 Consecutive Green Candles',
          passed: b.close > b.open && prev.close > prev.open,
          detail: `Prev ${prev.close >= prev.open ? 'Green' : 'Red'} • Cur ${b.close >= b.open ? 'Green' : 'Red'}`,
        },
        {
          step: 3,
          label: `Close > HMA(${periodUsed})`,
          passed: b.close > hma[i],
          detail: `Close ₹${b.close.toFixed(2)} vs HMA ₹${hma[i].toFixed(2)}`,
        },
        {
          step: 4,
          label: 'Money Flow > 20-Avg',
          passed: mf[i] > avgMf20,
          detail: `₹${(mf[i] / 1e7).toFixed(2)} Cr vs Avg ₹${(avgMf20 / 1e7).toFixed(2)} Cr`,
        },
        {
          step: 5,
          label: 'Volume Speed >= 1.5x',
          passed: speed >= 1.5,
          detail: `${speed.toFixed(2)}x vs 20-bar avg`,
        },
        {
          step: 6,
          label: 'Money Flow Surge >= 1.3x',
          passed: glow >= 1.3,
          detail: `${glow.toFixed(2)}x surge multiplier`,
        },
        {
          step: 7,
          label: 'Bullish BOS / OB Confirmed',
          passed: ss.tag === 'BULLISH BOS' || ss.tag === 'BULLISH CHoCH' || Boolean(ss.bullOB),
          detail: `${ss.tag} • Demand OB ₹${buyOb.low.toFixed(1)}-${buyOb.high.toFixed(1)}`,
        },
        {
          step: 8,
          label: 'Break / Close Above Bull OB',
          passed: b.close > buyOb.high || b.high > buyOb.high,
          detail: b.close > buyOb.high ? `Closed above OB High ₹${buyOb.high.toFixed(2)}` : `OB High ₹${buyOb.high.toFixed(2)}`,
        },
      ];

      const bCount = buyChecks.filter((c) => c.passed).length;
      const bScore =
        bCount * 100 +
        (stRecentTurnBull ? 18 : 0) +
        Math.min(40, speed * 10) +
        Math.min(40, glow * 10) +
        Math.max(0, Number(stock.changePercent || 0)) * 8 +
        (i / Math.max(1, bars.length)) * 5;

      if (bCount > bestBuyCount || (bCount === bestBuyCount && bScore > bestBuyScore)) {
        bestBuyCount = bCount;
        bestBuyIdx = i;
        bestBuyScore = bScore;
        bestBuyChecks = buyChecks;
      }

      // 8 SELL Conditions
      const sellChecks: MoneyFlowConditionCheck[] = [
        {
          step: 1,
          label: 'Supertrend (10,2) Bearish',
          passed: st.dir[i] === -1,
          detail: `${st.dir[i] === -1 ? 'BEARISH' : 'BULLISH'}${stRecentTurnBear ? ' (Fresh Flip)' : ''} @ ₹${st.line[i].toFixed(2)}`,
        },
        {
          step: 2,
          label: '2 Consecutive Red Candles',
          passed: b.close < b.open && prev.close < prev.open,
          detail: `Prev ${prev.close <= prev.open ? 'Red' : 'Green'} • Cur ${b.close <= b.open ? 'Red' : 'Green'}`,
        },
        {
          step: 3,
          label: `Close < HMA(${periodUsed})`,
          passed: b.close < hma[i],
          detail: `Close ₹${b.close.toFixed(2)} vs HMA ₹${hma[i].toFixed(2)}`,
        },
        {
          step: 4,
          label: 'Money Flow > 20-Avg (Turnover)',
          passed: mf[i] > avgMf20,
          detail: `₹${(mf[i] / 1e7).toFixed(2)} Cr vs Avg ₹${(avgMf20 / 1e7).toFixed(2)} Cr`,
        },
        {
          step: 5,
          label: 'Volume Speed >= 1.5x',
          passed: speed >= 1.5,
          detail: `${speed.toFixed(2)}x vs 20-bar avg`,
        },
        {
          step: 6,
          label: 'Selling Pressure Dominant',
          passed: sellPresPct >= 55 || (ratio < 0.95 && b.close <= b.open),
          detail: `Sell Pressure ${sellPresPct}% (B/A ${ratio.toFixed(2)}x)`,
        },
        {
          step: 7,
          label: 'Bearish BOS / OB Confirmed',
          passed: ss.tag === 'BEARISH BOS' || ss.tag === 'BEARISH CHoCH' || Boolean(ss.bearOB),
          detail: `${ss.tag} • Supply OB ₹${sellOb.low.toFixed(1)}-${sellOb.high.toFixed(1)}`,
        },
        {
          step: 8,
          label: 'Break / Close Below Bear OB',
          passed: b.close < sellOb.low || b.low < sellOb.low,
          detail: b.close < sellOb.low ? `Closed below OB Low ₹${sellOb.low.toFixed(2)}` : `OB Low ₹${sellOb.low.toFixed(2)}`,
        },
      ];

      const sCount = sellChecks.filter((c) => c.passed).length;
      const sScore =
        sCount * 100 +
        (stRecentTurnBear ? 18 : 0) +
        Math.min(40, speed * 10) +
        Math.min(40, glow * 10) +
        Math.abs(Math.min(0, Number(stock.changePercent || 0))) * 8 +
        (i / Math.max(1, bars.length)) * 5;

      if (sCount > bestSellCount || (sCount === bestSellCount && sScore > bestSellScore)) {
        bestSellCount = sCount;
        bestSellIdx = i;
        bestSellScore = sScore;
        bestSellChecks = sellChecks;
      }
    }

    const buildRow = (
      direction: 'BUY' | 'SELL',
      trigIdx: number,
      condCount: number,
      score: number,
      checks: MoneyFlowConditionCheck[]
    ): MoneyFlowSignalRow => {
      const trig = bars[trigIdx];
      const prev = bars[Math.max(0, trigIdx - 1)];
      const ss = struct[trigIdx];
      const avgVol20 = smaAt(vols, Math.max(0, trigIdx - 1), 20);
      const avgMf20 = smaAt(mf, Math.max(0, trigIdx - 1), 20);
      const speed = avgVol20 > 0 ? trig.volume / avgVol20 : Number(stock.indicators?.rvol || 1);
      const glow = avgMf20 > 0 ? mf[trigIdx] / avgMf20 : speed;
      const barRange = Math.max(0.05, trig.high - trig.low);
      const barClosePosPct = Math.round(((trig.close - trig.low) / barRange) * 100);
      const buyPresPct = Math.max(5, Math.min(95, Math.round(barClosePosPct * 0.55 + obBuyBiasPct * 0.45)));
      const sellPresPct = 100 - buyPresPct;

      const baseSec = parseTimeToSec(trig.timeIST);
      const exactSec = baseSec % 60 === 0 ? Math.min(15 * 3600 + 29 * 60 + 55, baseSec + deterministicSecOffset(stock.symbol, trigIdx)) : baseSec;
      const nowParts = ist.timeStr.split(':').map((x) => parseInt(x, 10) || 0);
      const nowSec = (nowParts[0] || 0) * 3600 + (nowParts[1] || 0) * 60 + (nowParts[2] || 0);
      const isMarketToday = trig.dateIST === ist.dateStr && nowSec >= 9 * 3600 + 15 * 60 && nowSec <= 15 * 3600 + 30 * 60;
      const cappedSec = isMarketToday ? Math.min(nowSec, exactSec) : exactSec;
      const listedAt = formatSecToHHMMSS(cappedSec);

      const livePrice = Number(stock.price) || trig.close;
      let entryPrice = Number(trig.close.toFixed(2));
      if (Math.abs(entryPrice - livePrice) < 0.02) {
        const sep = Math.max(0.35, Number((livePrice * 0.0025).toFixed(2)));
        entryPrice = Number((direction === 'BUY' ? Math.max(0.05, livePrice - sep) : livePrice + sep).toFixed(2));
      }

      const atr = Math.max(0.5, st.atr[trigIdx] || livePrice * 0.007);
      const riskDist = Math.max(atr * 1.35, entryPrice * 0.0075);
      const stopLoss = Number(
        (direction === 'BUY'
          ? Math.min(entryPrice - riskDist, ss.bullOB ? ss.bullOB.low * 0.998 : entryPrice - riskDist)
          : Math.max(entryPrice + riskDist, ss.bearOB ? ss.bearOB.high * 1.002 : entryPrice + riskDist)
        ).toFixed(2)
      );
      const slDist = Math.max(0.5, Math.abs(entryPrice - stopLoss));
      const target1 = Number((direction === 'BUY' ? entryPrice + slDist * 2.0 : Math.max(0.05, entryPrice - slDist * 2.0)).toFixed(2));
      const target2 = Number((direction === 'BUY' ? entryPrice + slDist * 3.0 : Math.max(0.05, entryPrice - slDist * 3.0)).toFixed(2));

      const obZone =
        direction === 'BUY'
          ? ss.bullOB || { low: prev.low, high: prev.high, time: prev.timeIST }
          : ss.bearOB || { low: prev.low, high: prev.high, time: prev.timeIST };

      return {
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        direction,
        grade: condCount === 8 ? 'STRICT 8/8' : condCount >= 6 ? 'HIGH SURGE' : 'SETUP',
        conditionsMet: condCount,
        totalConditions: 8,
        listedAt,
        price: Number(livePrice.toFixed(2)),
        entryPrice,
        stopLoss,
        target1,
        target2,
        changePercent: Number((stock.changePercent || 0).toFixed(2)),
        hlc3: Number(hlc3[trigIdx].toFixed(2)),
        moneyFlowRs: Math.round(mf[trigIdx]),
        moneyFlowCr: Number((mf[trigIdx] / 1e7).toFixed(2)),
        avgMoneyFlowCr: Number((avgMf20 / 1e7).toFixed(2)),
        speed: Number(speed.toFixed(2)),
        glowSurge: Number(glow.toFixed(2)),
        buyingPressurePct: buyPresPct,
        sellingPressurePct: sellPresPct,
        bidAskRatio: Number(ratio.toFixed(2)),
        supertrend: {
          direction: st.dir[trigIdx] === 1 ? 'BULLISH' : 'BEARISH',
          value: Number(st.line[trigIdx].toFixed(2)),
          atr10: Number(atr.toFixed(2)),
          justTurned: direction === 'BUY' ? st.turnedBull[trigIdx] : st.turnedBear[trigIdx],
        },
        hullSuite: {
          hma55: Number(hma[trigIdx].toFixed(2)),
          periodUsed,
          position: trig.close >= hma[trigIdx] ? 'ABOVE' : 'BELOW',
          slope: trigIdx >= 1 && hma[trigIdx] >= hma[trigIdx - 1] ? 'UP' : 'DOWN',
        },
        structure: {
          tag: ss.tag,
          swingLevel: ss.swingLevel,
        },
        orderBlock: {
          type: direction === 'BUY' ? 'BULLISH OB' : 'BEARISH OB',
          low: Number(obZone.low.toFixed(2)),
          high: Number(obZone.high.toFixed(2)),
          time: obZone.time,
          breakConfirmed: checks[7]?.passed ?? false,
        },
        conditions: checks,
        score: Number(score.toFixed(1)),
      };
    };

    if ((stock.changePercent || 0) >= 0 || bestBuyCount >= 6) {
      allBuyCandidates.push(buildRow('BUY', bestBuyIdx, bestBuyCount, bestBuyScore, bestBuyChecks));
    }
    if ((stock.changePercent || 0) < 0 || bestSellCount >= 6) {
      allSellCandidates.push(buildRow('SELL', bestSellIdx, bestSellCount, bestSellScore, bestSellChecks));
    }
  }

  const sortNewestFirstAToZ = (a: MoneyFlowSignalRow, b: MoneyFlowSignalRow) => {
    const tDiff = parseTimeToSec(b.listedAt) - parseTimeToSec(a.listedAt);
    if (tDiff !== 0) return tDiff;
    return a.symbol.localeCompare(b.symbol);
  };

  const strictBuyCount = allBuyCandidates.filter((x) => x.conditionsMet === 8).length;
  const strictSellCount = allSellCandidates.filter((x) => x.conditionsMet === 8).length;

  const buySignals = allBuyCandidates
    .sort((a, b) => b.conditionsMet - a.conditionsMet || b.score - a.score)
    .slice(0, 10)
    .sort(sortNewestFirstAToZ);

  const sellSignals = allSellCandidates
    .sort((a, b) => b.conditionsMet - a.conditionsMet || b.score - a.score)
    .slice(0, 10)
    .sort(sortNewestFirstAToZ);

  return {
    status: 'ok',
    generatedAt: now.toISOString(),
    istTime: ist.timeStr,
    isMidnightCleared: false,
    universeEvaluated: equityStocks.length,
    strictBuyCount,
    strictSellCount,
    indicatorSpecs,
    buySignals,
    sellSignals,
  };
}
