import { Candle, ScannedStock } from '../src/types';
import { getISTDateParts } from '../src/data/marketSchedule';
import { IntradayCandleBar, UnifiedMarketQuote } from './autonomousPriceService';
import { formatClockHHMMSS, parseClockSec, resampleClaudeBars, ClaudeFnoBar } from './claudeFnoEngine';

export type SmcTimeframe = '5m' | '15m' | '30m' | '1h' | 'ALL';
export type SmcSide = 'BUY' | 'SELL';
export type SmcStructureEvent = 'BOS' | 'CHoCH' | 'NONE';
export type SmcZone = 'DISCOUNT' | 'PREMIUM' | 'EQUILIBRIUM';
export type CycleBuildupLabel = 'Long Buildup' | 'Short Buildup' | 'Short Covering' | 'Long Unwinding';

export interface SmcSwingPoint {
  index: number;
  type: 'SH' | 'SL';
  price: number;
  timeIST: string;
  secIST: number;
}

export interface SmcFvg {
  side: SmcSide;
  top: number;
  bottom: number;
  size: number;
  ce: number; // 50% Consequent Encroachment: (top + bottom) / 2
  mitigated: boolean;
  timeIST: string;
  secIST: number;
}

export interface SmcOrderBlock {
  side: SmcSide;
  high: number;
  low: number;
  open: number;
  close: number;
  bodyHigh: number;
  bodyLow: number;
  timeIST: string;
  secIST: number;
  causedDisplacement: boolean;
  leftFvg: boolean;
  sweptLiquidityBeforehand: boolean;
  mitigated: boolean;
  isBreaker: boolean;
  breakerDirection?: SmcSide;
  validScore: number; // 0-4 checklist items
}

export interface SmcLiquidityAnalysis {
  bslLevel: number | null;
  sslLevel: number | null;
  eqhDetected: boolean;
  eqhLevel: number | null;
  eqlDetected: boolean;
  eqlLevel: number | null;
  sweepType: 'SSL_SWEEP' | 'BSL_SWEEP' | 'NONE';
  sweepLevel: number | null;
  sweepTimeIST: string;
  sweepSecIST: number;
  sweepWickPrice: number | null;
}

export interface SmcPremiumDiscount {
  rangeHigh: number;
  rangeLow: number;
  equilibrium: number; // (H + L) / 2
  zone: SmcZone;
  rangePositionPct: number; // 0 = Low, 100 = High
  oteBuy618: number;
  oteBuy705: number; // High - 0.705 * (High - Low)
  oteBuy786: number;
  oteSell618: number;
  oteSell705: number; // Low + 0.705 * (High - Low)
  oteSell786: number;
  inBuyOteBand: boolean;
  inSellOteBand: boolean;
}

export interface SmcTradeMath {
  side: SmcSide;
  capital: number;
  riskPct: number;
  riskAmount: number;
  entry: number;
  oteEntry: number;
  stopLoss: number;
  target: number;
  riskPerUnit: number;
  rewardPerUnit: number;
  positionSize: number;
  rrNumeric: number;
  rrRatio: string;
  breakevenWinRatePct: number; // 1 / (1 + RR) * 100
  isValidRR: boolean;
}

export interface SmcChecklistItem {
  id: 'HTF_BIAS' | 'LIQUIDITY_SWEEP' | 'CHOCH_OR_BOS' | 'OB_OR_FVG_ZONE' | 'RR_MIN_1_2';
  number: number;
  label: string;
  passed: boolean;
  detail: string;
}

export interface SmcSetupRow {
  id: string;
  symbol: string;
  displayName: string;
  category: 'EQUITY_FNO' | 'INDEX';
  timeframe: '5m' | '15m' | '30m' | '1h';
  side: SmcSide;
  sector: string;
  sectorChangePct: number;
  price: number;
  changePercent: number;
  bidAskRatio: number;
  orderBookBias: string;
  oiChangePct: number;
  cycleBuildup: CycleBuildupLabel;
  rawVolume: number;
  tradedValueCr: number;
  rvol: number;
  atr25: number;
  atr25Pct: number;
  rsi: number;
  vwap: number;
  vwapDiffPct: number;
  aboveVwap: boolean;

  // Rule 1: Market Structure
  htfBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  ltfTrend: 'HH + HL (BULLISH)' | 'LH + LL (BEARISH)' | 'RANGING';
  structureEvent: SmcStructureEvent;
  structureTriggerLevel: number | null;
  lastSwingHigh: SmcSwingPoint | null;
  lastSwingLow: SmcSwingPoint | null;

  // Rule 2: Liquidity
  liquidity: SmcLiquidityAnalysis;

  // Rule 3: FVG
  fvg: SmcFvg | null;

  // Rule 4: Order Block / Breaker
  orderBlock: SmcOrderBlock | null;

  // Rule 5: Premium / Discount & OTE
  premiumDiscount: SmcPremiumDiscount;

  // Rule 6 & 7: Checklist & Trade Math
  checklistScore: number; // 0..5
  checklist: SmcChecklistItem[];
  isQualifiedSetup: boolean;
  statusBadge: 'TAKE TRADE (5/5)' | 'HIGH PROBABILITY (4/5)' | 'SETUP FORMING';
  tradeMath: SmcTradeMath;

  // Exact trigger candle time
  listedAt: string;
  inEntryWindow: boolean;
}

export interface SmcReport {
  status: 'ok';
  scannerName: 'Smart Money Concepts';
  generatedAt: string;
  istTime: string;
  entryWindowRule: '09:20:00 - 14:45:00 IST';
  selectedTimeframe: SmcTimeframe;
  availableTimeframes: SmcTimeframe[];
  timeframeCounts: Record<'5m' | '15m' | '30m' | '1h', number>;
  isMidnightCleared: boolean;
  isMarketOffDay: boolean;
  dayCategory: string;
  capital: number;
  riskPct: number;
  universeEvaluated: number;
  totalSetups: number;
  qualifiedCount: number;
  buyCount: number;
  sellCount: number;
  obFvgCount: number;
  breakerCount: number;
  categories: {
    allSetups: SmcSetupRow[];
    qualified5of5: SmcSetupRow[];
    buyDiscountSetups: SmcSetupRow[];
    sellPremiumSetups: SmcSetupRow[];
    unmitigatedObFvg: SmcSetupRow[];
    bosChochBreaker: SmcSetupRow[];
  };
}

const ENTRY_START_SEC = 9 * 3600 + 20 * 60; // 09:20:00 IST
const ENTRY_END_SEC = 14 * 3600 + 45 * 60; // 14:45:00 IST

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

function classifyCycleBuildup(chgPct: number, oiChgPct: number): CycleBuildupLabel {
  if (chgPct >= 0 && oiChgPct >= 0) return 'Long Buildup';
  if (chgPct < 0 && oiChgPct >= 0) return 'Short Buildup';
  if (chgPct >= 0 && oiChgPct < 0) return 'Short Covering';
  return 'Long Unwinding';
}

function normalizeBars(rawBars: IntradayCandleBar[] | Candle[] | undefined): ClaudeFnoBar[] {
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
      }
    }
    const secIST = parseClockSec(timeIST) || 9 * 3600 + 20 * 60;
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

/**
 * Rule 1: Detect Swing Highs (SH) & Swing Lows (SL) using N candles on both sides
 */
export function detectSwingPoints(bars: ClaudeFnoBar[], nSide = 2): {
  swingHighs: SmcSwingPoint[];
  swingLows: SmcSwingPoint[];
} {
  const n = Math.max(1, Math.min(5, Math.floor(nSide)));
  const swingHighs: SmcSwingPoint[] = [];
  const swingLows: SmcSwingPoint[] = [];

  if (bars.length < 2 * n + 1) {
    return { swingHighs, swingLows };
  }

  for (let i = n; i < bars.length - n; i++) {
    const cur = bars[i];
    let isSH = true;
    let isSL = true;
    for (let k = 1; k <= n; k++) {
      if (bars[i - k].high >= cur.high || bars[i + k].high > cur.high) {
        isSH = false;
      }
      if (bars[i - k].low <= cur.low || bars[i + k].low < cur.low) {
        isSL = false;
      }
      if (!isSH && !isSL) break;
    }
    if (isSH) {
      swingHighs.push({
        index: i,
        type: 'SH',
        price: round2(cur.high),
        timeIST: cur.timeIST,
        secIST: cur.secIST,
      });
    }
    if (isSL) {
      swingLows.push({
        index: i,
        type: 'SL',
        price: round2(cur.low),
        timeIST: cur.timeIST,
        secIST: cur.secIST,
      });
    }
  }

  return { swingHighs, swingLows };
}

/**
 * Rule 1: Classify Market Structure (HH/HL vs LH/LL) + BOS / CHoCH body close confirmation
 */
export function evaluateMarketStructure(bars: ClaudeFnoBar[], swingHighs: SmcSwingPoint[], swingLows: SmcSwingPoint[]): {
  trend: 'HH + HL (BULLISH)' | 'LH + LL (BEARISH)' | 'RANGING';
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  event: SmcStructureEvent;
  eventSide: SmcSide | null;
  triggerBar: ClaudeFnoBar | null;
  triggerIndex: number;
  triggerLevel: number | null;
  lastSH: SmcSwingPoint | null;
  lastSL: SmcSwingPoint | null;
} {
  const lastSH = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1] : null;
  const prevSH = swingHighs.length > 1 ? swingHighs[swingHighs.length - 2] : null;
  const lastSL = swingLows.length > 0 ? swingLows[swingLows.length - 1] : null;
  const prevSL = swingLows.length > 1 ? swingLows[swingLows.length - 2] : null;

  let trend: 'HH + HL (BULLISH)' | 'LH + LL (BEARISH)' | 'RANGING' = 'RANGING';
  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';

  if (lastSH && prevSH && lastSL && prevSL) {
    if (lastSH.price > prevSH.price && lastSL.price >= prevSL.price) {
      trend = 'HH + HL (BULLISH)';
      bias = 'BULLISH';
    } else if (lastSH.price <= prevSH.price && lastSL.price < prevSL.price) {
      trend = 'LH + LL (BEARISH)';
      bias = 'BEARISH';
    }
  } else if (bars.length >= 4) {
    const first = bars[0];
    const last = bars[bars.length - 1];
    if (last.close > first.open && last.high > first.high) {
      bias = 'BULLISH';
      trend = 'HH + HL (BULLISH)';
    } else if (last.close < first.open && last.low < first.low) {
      bias = 'BEARISH';
      trend = 'LH + LL (BEARISH)';
    }
  }

  let event: SmcStructureEvent = 'NONE';
  let eventSide: SmcSide | null = null;
  let triggerBar: ClaudeFnoBar | null = null;
  let triggerIndex = -1;
  let triggerLevel: number | null = null;

  // Look for latest candle body close beyond prior swing high / swing low
  for (let i = bars.length - 1; i >= 1; i--) {
    const b = bars[i];
    const priorSH = [...swingHighs].reverse().find((s) => s.index < i - 1);
    const priorSL = [...swingLows].reverse().find((s) => s.index < i - 1);

    const brokeUp = priorSH && b.close > priorSH.price;
    const brokeDown = priorSL && b.close < priorSL.price;

    if (brokeUp && !brokeDown) {
      eventSide = 'BUY';
      triggerBar = b;
      triggerIndex = i;
      triggerLevel = priorSH!.price;
      event = bias === 'BEARISH' ? 'CHoCH' : 'BOS';
      break;
    }
    if (brokeDown && !brokeUp) {
      eventSide = 'SELL';
      triggerBar = b;
      triggerIndex = i;
      triggerLevel = priorSL!.price;
      event = bias === 'BULLISH' ? 'CHoCH' : 'BOS';
      break;
    }
    if (brokeUp && brokeDown) {
      if (b.close >= b.open) {
        eventSide = 'BUY';
        triggerBar = b;
        triggerIndex = i;
        triggerLevel = priorSH!.price;
        event = bias === 'BEARISH' ? 'CHoCH' : 'BOS';
      } else {
        eventSide = 'SELL';
        triggerBar = b;
        triggerIndex = i;
        triggerLevel = priorSL!.price;
        event = bias === 'BULLISH' ? 'CHoCH' : 'BOS';
      }
      break;
    }
  }

  return {
    trend,
    bias,
    event,
    eventSide,
    triggerBar,
    triggerIndex,
    triggerLevel,
    lastSH,
    lastSL,
  };
}

/**
 * Rule 2: Liquidity Detection — BSL / SSL, Equal Highs/Lows (<= 0.1%), & Liquidity Sweep
 */
export function evaluateLiquidity(
  bars: ClaudeFnoBar[],
  swingHighs: SmcSwingPoint[],
  swingLows: SmcSwingPoint[]
): SmcLiquidityAnalysis {
  const bslLevel = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1].price : (bars.length ? round2(Math.max(...bars.map((b) => b.high))) : null);
  const sslLevel = swingLows.length > 0 ? swingLows[swingLows.length - 1].price : (bars.length ? round2(Math.min(...bars.map((b) => b.low))) : null);

  let eqhDetected = false;
  let eqhLevel: number | null = null;
  for (let i = swingHighs.length - 1; i >= 1 && !eqhDetected; i--) {
    for (let j = i - 1; j >= 0; j--) {
      const diffPct = Math.abs(swingHighs[i].price - swingHighs[j].price) / Math.max(0.01, swingHighs[j].price);
      if (diffPct <= 0.001) {
        eqhDetected = true;
        eqhLevel = round2((swingHighs[i].price + swingHighs[j].price) / 2);
        break;
      }
    }
  }

  let eqlDetected = false;
  let eqlLevel: number | null = null;
  for (let i = swingLows.length - 1; i >= 1 && !eqlDetected; i--) {
    for (let j = i - 1; j >= 0; j--) {
      const diffPct = Math.abs(swingLows[i].price - swingLows[j].price) / Math.max(0.01, swingLows[j].price);
      if (diffPct <= 0.001) {
        eqlDetected = true;
        eqlLevel = round2((swingLows[i].price + swingLows[j].price) / 2);
        break;
      }
    }
  }

  let sweepType: 'SSL_SWEEP' | 'BSL_SWEEP' | 'NONE' = 'NONE';
  let sweepLevel: number | null = null;
  let sweepTimeIST = '--';
  let sweepSecIST = 0;
  let sweepWickPrice: number | null = null;

  for (let i = bars.length - 1; i >= 1; i--) {
    const b = bars[i];
    const priorSL = [...swingLows].reverse().find((s) => s.index < i);
    const priorSH = [...swingHighs].reverse().find((s) => s.index < i);

    const sweptSSL = priorSL && b.low < priorSL.price && b.close > priorSL.price;
    const sweptBSL = priorSH && b.high > priorSH.price && b.close < priorSH.price;

    if (sweptSSL) {
      sweepType = 'SSL_SWEEP';
      sweepLevel = priorSL!.price;
      sweepTimeIST = b.timeIST;
      sweepSecIST = b.secIST;
      sweepWickPrice = round2(b.low);
      break;
    }
    if (sweptBSL) {
      sweepType = 'BSL_SWEEP';
      sweepLevel = priorSH!.price;
      sweepTimeIST = b.timeIST;
      sweepSecIST = b.secIST;
      sweepWickPrice = round2(b.high);
      break;
    }
  }

  return {
    bslLevel,
    sslLevel,
    eqhDetected,
    eqhLevel,
    eqlDetected,
    eqlLevel,
    sweepType,
    sweepLevel,
    sweepTimeIST,
    sweepSecIST,
    sweepWickPrice,
  };
}

/**
 * Rule 3: Fair Value Gap (FVG) exact 3-candle formula:
 * Bullish FVG: C1.high < C3.low => bottom = C1.high, top = C3.low
 * Bearish FVG: C1.low > C3.high => top = C1.low, bottom = C3.high
 * CE (50% Consequent Encroachment) = (top + bottom) / 2
 */
export function detectLatestFvg(bars: ClaudeFnoBar[], preferredSide?: SmcSide): SmcFvg | null {
  if (bars.length < 3) return null;

  let latestMatch: SmcFvg | null = null;
  for (let i = bars.length - 1; i >= 2; i--) {
    const c1 = bars[i - 2];
    const c2 = bars[i - 1];
    const c3 = bars[i];

    const isBullFvg = c1.high < c3.low && c2.close > c2.open;
    const isBearFvg = c1.low > c3.high && c2.close < c2.open;

    if (isBullFvg && (!preferredSide || preferredSide === 'BUY')) {
      const bottom = round2(c1.high);
      const top = round2(c3.low);
      const size = round2(top - bottom);
      const ce = round2((top + bottom) / 2);
      const mitigated = bars.slice(i + 1).some((later) => later.low <= bottom);
      const fvg: SmcFvg = {
        side: 'BUY',
        top,
        bottom,
        size,
        ce,
        mitigated,
        timeIST: c3.timeIST,
        secIST: c3.secIST,
      };
      if (!mitigated) return fvg;
      if (!latestMatch) latestMatch = fvg;
    }

    if (isBearFvg && (!preferredSide || preferredSide === 'SELL')) {
      const top = round2(c1.low);
      const bottom = round2(c3.high);
      const size = round2(top - bottom);
      const ce = round2((top + bottom) / 2);
      const mitigated = bars.slice(i + 1).some((later) => later.high >= top);
      const fvg: SmcFvg = {
        side: 'SELL',
        top,
        bottom,
        size,
        ce,
        mitigated,
        timeIST: c3.timeIST,
        secIST: c3.secIST,
      };
      if (!mitigated) return fvg;
      if (!latestMatch) latestMatch = fvg;
    }
  }
  return latestMatch;
}

/**
 * Rule 4: Order Block (OB) & Breaker Block detection
 * Bullish OB: last bearish (down) candle before upward impulse causing BOS/CHoCH
 * Bearish OB: last bullish (up) candle before downward impulse causing BOS/CHoCH
 */
export function detectOrderBlock(
  bars: ClaudeFnoBar[],
  side: SmcSide,
  triggerIndex: number,
  fvg: SmcFvg | null,
  liquidity: SmcLiquidityAnalysis
): SmcOrderBlock | null {
  if (bars.length < 3) return null;
  const searchEnd = triggerIndex > 1 ? triggerIndex : bars.length - 1;
  const searchStart = Math.max(0, searchEnd - 10);

  let obBar: ClaudeFnoBar | null = null;
  let obIdx = -1;
  for (let i = searchEnd - 1; i >= searchStart; i--) {
    const b = bars[i];
    if (side === 'BUY' && b.close < b.open) {
      obBar = b;
      obIdx = i;
      break;
    }
    if (side === 'SELL' && b.close > b.open) {
      obBar = b;
      obIdx = i;
      break;
    }
  }
  if (!obBar) return null;

  const afterBars = bars.slice(obIdx + 1);
  const impulseBar = afterBars[0];
  const obRange = Math.max(0.01, obBar.high - obBar.low);
  const causedDisplacement = Boolean(
    impulseBar &&
      Math.abs(impulseBar.close - impulseBar.open) >= Math.max(obRange * 0.85, obBar.close * 0.002)
  );
  const leftFvg = Boolean(fvg && fvg.side === side && fvg.secIST >= obBar.secIST);
  const sweptLiquidityBeforehand =
    (side === 'BUY' && liquidity.sweepType === 'SSL_SWEEP' && liquidity.sweepSecIST <= (triggerIndex >= 0 ? bars[triggerIndex].secIST : obBar.secIST + 1800)) ||
    (side === 'SELL' && liquidity.sweepType === 'BSL_SWEEP' && liquidity.sweepSecIST <= (triggerIndex >= 0 ? bars[triggerIndex].secIST : obBar.secIST + 1800));

  const laterBars = bars.slice(Math.max(obIdx + 2, triggerIndex > 0 ? triggerIndex + 1 : obIdx + 2));
  let mitigated = false;
  let isBreaker = false;
  for (const lb of laterBars) {
    if (side === 'BUY') {
      if (lb.close < obBar.low) {
        isBreaker = true;
        mitigated = true;
        break;
      }
      if (lb.low <= obBar.high) {
        mitigated = true;
      }
    } else {
      if (lb.close > obBar.high) {
        isBreaker = true;
        mitigated = true;
        break;
      }
      if (lb.high >= obBar.low) {
        mitigated = true;
      }
    }
  }

  const validScore =
    (causedDisplacement ? 1 : 0) +
    (leftFvg ? 1 : 0) +
    (sweptLiquidityBeforehand ? 1 : 0) +
    (!mitigated ? 1 : 0);

  return {
    side,
    high: round2(obBar.high),
    low: round2(obBar.low),
    open: round2(obBar.open),
    close: round2(obBar.close),
    bodyHigh: round2(Math.max(obBar.open, obBar.close)),
    bodyLow: round2(Math.min(obBar.open, obBar.close)),
    timeIST: obBar.timeIST,
    secIST: obBar.secIST,
    causedDisplacement,
    leftFvg,
    sweptLiquidityBeforehand,
    mitigated,
    isBreaker,
    breakerDirection: isBreaker ? (side === 'BUY' ? 'SELL' : 'BUY') : undefined,
    validScore,
  };
}

/**
 * Rule 5: Premium / Discount + Exact OTE (0.618 - 0.786, midpoint 0.705)
 * Equilibrium = (High + Low) / 2
 * Buy OTE = High - 0.705 * (High - Low)
 * Sell OTE = Low + 0.705 * (High - Low)
 */
export function computePremiumDiscountAndOte(rangeHigh: number, rangeLow: number, currentPrice: number): SmcPremiumDiscount {
  const high = Math.max(rangeHigh, rangeLow);
  const low = Math.min(rangeHigh, rangeLow);
  const span = Math.max(0.01, high - low);
  const equilibrium = round2((high + low) / 2);

  const oteBuy618 = round2(high - 0.618 * span);
  const oteBuy705 = round2(high - 0.705 * span);
  const oteBuy786 = round2(high - 0.786 * span);

  const oteSell618 = round2(low + 0.618 * span);
  const oteSell705 = round2(low + 0.705 * span);
  const oteSell786 = round2(low + 0.786 * span);

  const rangePositionPct = round2(Math.max(0, Math.min(100, ((currentPrice - low) / span) * 100)));
  let zone: SmcZone = 'EQUILIBRIUM';
  if (currentPrice > equilibrium * 1.0005) zone = 'PREMIUM';
  else if (currentPrice < equilibrium * 0.9995) zone = 'DISCOUNT';

  const inBuyOteBand = currentPrice <= oteBuy618 && currentPrice >= oteBuy786;
  const inSellOteBand = currentPrice >= oteSell618 && currentPrice <= oteSell786;

  return {
    rangeHigh: round2(high),
    rangeLow: round2(low),
    equilibrium,
    zone,
    rangePositionPct,
    oteBuy618,
    oteBuy705,
    oteBuy786,
    oteSell618,
    oteSell705,
    oteSell786,
    inBuyOteBand,
    inSellOteBand,
  };
}

/**
 * Rule 7: Exact Position Size, RR & Breakeven Win Rate
 * RiskAmount = Capital * (RiskPct / 100)
 * PositionSize = floor(RiskAmount / RiskPerUnit)
 * RR = Reward / Risk
 * BreakevenWinRate = (1 / (1 + RR)) * 100
 */
export function computeSmcTradeMath(params: {
  side: SmcSide;
  capital: number;
  riskPct: number;
  entry: number;
  oteEntry: number;
  stopLoss: number;
  target: number;
}): SmcTradeMath {
  const capital = Math.max(1000, Number(params.capital) || 100000);
  const riskPct = Math.max(0.1, Math.min(10, Number(params.riskPct) || 1.0));
  const riskAmount = round2(capital * (riskPct / 100));
  const entry = round2(Math.max(0.05, params.entry));
  const oteEntry = round2(Math.max(0.05, params.oteEntry));
  const stopLoss = round2(Math.max(0.05, params.stopLoss));
  const target = round2(Math.max(0.05, params.target));

  const riskPerUnit =
    params.side === 'BUY' ? round2(Math.max(0, entry - stopLoss)) : round2(Math.max(0, stopLoss - entry));
  const rewardPerUnit =
    params.side === 'BUY' ? round2(Math.max(0, target - entry)) : round2(Math.max(0, entry - target));

  const rrNumeric = riskPerUnit > 0 ? round2(rewardPerUnit / riskPerUnit) : 0;
  const positionSize = riskPerUnit > 0 ? Math.floor(riskAmount / riskPerUnit) : 0;
  const breakevenWinRatePct = rrNumeric > 0 ? round2((1 / (1 + rrNumeric)) * 100) : 100;
  const isValidRR = rrNumeric >= 1.99;

  return {
    side: params.side,
    capital,
    riskPct,
    riskAmount,
    entry,
    oteEntry,
    stopLoss,
    target,
    riskPerUnit,
    rewardPerUnit,
    positionSize,
    rrNumeric,
    rrRatio: rrNumeric > 0 ? `1 : ${rrNumeric.toFixed(2)}` : '0 : 1',
    breakevenWinRatePct,
    isValidRR,
  };
}

export function computeAtr25(
  bars: ClaudeFnoBar[],
  price: number,
  fallbackAtr?: number
): { atr25: number; atr25Pct: number } {
  let atrVal = 0;
  if (bars.length >= 2) {
    const trs: number[] = [];
    for (let i = 1; i < bars.length; i++) {
      const h = bars[i].high;
      const l = bars[i].low;
      const pc = bars[i - 1].close;
      trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const window = trs.slice(-25);
    if (window.length > 0) {
      atrVal = window.reduce((a, b) => a + b, 0) / window.length;
    }
  } else if (bars.length === 1) {
    atrVal = Math.max(0, bars[0].high - bars[0].low);
  }
  if ((!Number.isFinite(atrVal) || atrVal <= 0) && Number.isFinite(fallbackAtr) && (fallbackAtr || 0) > 0) {
    atrVal = Number(fallbackAtr);
  }
  const atr25 = round2(Math.max(0, atrVal));
  const atr25Pct = price > 0 ? round2((atr25 / price) * 100) : 0;
  return { atr25, atr25Pct };
}

export function computeRsi14(bars: ClaudeFnoBar[], fallbackRsi?: number): number {
  if (bars.length >= 15) {
    const period = 14;
    let gainSum = 0;
    let lossSum = 0;
    for (let i = 1; i <= period; i++) {
      const diff = bars[i].close - bars[i - 1].close;
      if (diff >= 0) gainSum += diff;
      else lossSum += Math.abs(diff);
    }
    let avgGain = gainSum / period;
    let avgLoss = lossSum / period;
    for (let i = period + 1; i < bars.length; i++) {
      const diff = bars[i].close - bars[i - 1].close;
      const g = diff > 0 ? diff : 0;
      const l = diff < 0 ? Math.abs(diff) : 0;
      avgGain = (avgGain * (period - 1) + g) / period;
      avgLoss = (avgLoss * (period - 1) + l) / period;
    }
    if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
    const rs = avgGain / avgLoss;
    return round2(100 - 100 / (1 + rs));
  }
  if (bars.length >= 4) {
    let gains = 0;
    let losses = 0;
    for (let i = 1; i < bars.length; i++) {
      const diff = bars[i].close - bars[i - 1].close;
      if (diff >= 0) gains += diff;
      else losses += Math.abs(diff);
    }
    const n = bars.length - 1;
    const avgG = gains / n;
    const avgL = losses / n;
    if (avgL === 0) return avgG === 0 ? 50 : 100;
    return round2(100 - 100 / (1 + avgG / avgL));
  }
  if (Number.isFinite(fallbackRsi) && (fallbackRsi || 0) > 0) {
    return round2(Math.min(100, Math.max(0, Number(fallbackRsi))));
  }
  return 50;
}

function medianPositive(nums: number[]): number {
  const valid = nums.filter((n) => Number.isFinite(n) && n > 0).sort((a, b) => a - b);
  if (valid.length === 0) return 0;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 1 ? valid[mid] : (valid[mid - 1] + valid[mid]) / 2;
}

function cleanIncrementalBars(bars: ClaudeFnoBar[]): ClaudeFnoBar[] {
  if (bars.length < 5) return bars;
  const baseMed = medianPositive(bars.slice(0, -2).map((b) => b.volume));
  let end = bars.length;
  // Strip trailing cumulative-volume quote dumps (>25x median bar volume) or flat zero-range quote ticks
  while (end > 4) {
    const b = bars[end - 1];
    const isCumDump = baseMed > 0 && b.volume > baseMed * 25;
    const isFlatTick = b.high === b.low && b.open === b.close && b.volume <= 500;
    if (isCumDump || isFlatTick) {
      end -= 1;
    } else {
      break;
    }
  }
  return bars.slice(0, end);
}

export function computeSessionVwap(bars5m: ClaudeFnoBar[], fallbackVwap: number): number {
  if (bars5m.length === 0) return round2(fallbackVwap);
  const latestDate = bars5m[bars5m.length - 1].dateIST;
  const sessionBars = bars5m.filter((b) => b.dateIST === latestDate);
  const active = cleanIncrementalBars(sessionBars.length > 0 ? sessionBars : bars5m);
  let cumTPV = 0;
  let cumVol = 0;
  for (const b of active) {
    const tp = (b.high + b.low + b.close) / 3;
    const v = Math.max(0, Number(b.volume) || 0);
    cumTPV += tp * v;
    cumVol += v;
  }
  if (cumVol > 0) return round2(cumTPV / cumVol);
  return round2(fallbackVwap > 0 ? fallbackVwap : active[active.length - 1].close);
}

export function computeRvolFromBars(bars: ClaudeFnoBar[], fallbackRvol?: number): number {
  const cleaned = cleanIncrementalBars(bars);
  if (cleaned.length >= 4) {
    const prev = cleaned.slice(0, -1).slice(-20);
    const avgVol = prev.reduce((s, b) => s + Math.max(0, b.volume), 0) / Math.max(1, prev.length);
    const curVol = Math.max(0, cleaned[cleaned.length - 1].volume);
    if (avgVol > 0) return round2(curVol / avgVol);
  }
  if (Number.isFinite(fallbackRvol) && (fallbackRvol || 0) > 0 && (fallbackRvol || 0) <= 25) {
    return round2(Number(fallbackRvol));
  }
  return 1.0;
}

function evaluateSymbolOnTimeframe(params: {
  symbol: string;
  displayName: string;
  category: 'EQUITY_FNO' | 'INDEX';
  timeframe: '5m' | '15m' | '30m' | '1h';
  bars5m: ClaudeFnoBar[];
  sector: string;
  sectorChangePct: number;
  price: number;
  changePercent: number;
  bidAskRatio: number;
  orderBookBias: string;
  oiChangePct: number;
  rawVolume: number;
  tradedValueCr: number;
  rvol?: number;
  fallbackAtr?: number;
  fallbackRsi?: number;
  fallbackVwap?: number;
  capital: number;
  riskPct: number;
}): SmcSetupRow | null {
  const tfMinutes =
    params.timeframe === '5m' ? 5 : params.timeframe === '15m' ? 15 : params.timeframe === '30m' ? 30 : 60;

  const tfBars = tfMinutes === 5 ? params.bars5m : resampleClaudeBars(params.bars5m, tfMinutes);
  const htfBars = resampleClaudeBars(params.bars5m, 60);
  if (tfBars.length < 5) return null;

  const { swingHighs: htfSH, swingLows: htfSL } = detectSwingPoints(htfBars.length >= 5 ? htfBars : tfBars, 1);
  const htfStruct = evaluateMarketStructure(htfBars.length >= 5 ? htfBars : tfBars, htfSH, htfSL);

  const { swingHighs, swingLows } = detectSwingPoints(tfBars, tfMinutes >= 30 ? 1 : 2);
  const struct = evaluateMarketStructure(tfBars, swingHighs, swingLows);
  const liquidity = evaluateLiquidity(tfBars, swingHighs, swingLows);

  // Determine direction from genuine structure/sweep/HTF bias (require at least one confirmed SMC event)
  let side: SmcSide | null = struct.eventSide;
  if (!side && liquidity.sweepType === 'SSL_SWEEP') side = 'BUY';
  else if (!side && liquidity.sweepType === 'BSL_SWEEP') side = 'SELL';
  if (!side) return null;

  const fvg = detectLatestFvg(tfBars, side);
  const ob = detectOrderBlock(tfBars, side, struct.triggerIndex, fvg, liquidity);

  // Need at least a confirmed structure event (BOS/CHoCH) OR liquidity sweep OR OB+FVG so zero empty/noise rows appear
  if (struct.event === 'NONE' && liquidity.sweepType === 'NONE' && (!ob || !fvg)) {
    return null;
  }

  const recentLookback = tfBars.slice(-24);
  const rangeHigh = Math.max(...recentLookback.map((b) => b.high));
  const rangeLow = Math.min(...recentLookback.map((b) => b.low));
  const pd = computePremiumDiscountAndOte(rangeHigh, rangeLow, params.price);

  // Exact trigger time from real BOS/CHoCH bar or Sweep bar or FVG C3 bar — ZERO synthetic timestamps
  const triggerBar = struct.triggerBar;
  const triggerSec = triggerBar ? triggerBar.secIST : liquidity.sweepSecIST || fvg?.secIST || 0;
  const listedAt = triggerSec > 0 ? formatClockHHMMSS(triggerSec) : '--';
  const inEntryWindow = triggerSec >= ENTRY_START_SEC && triggerSec <= ENTRY_END_SEC;

  // Determine authentic Entry, SL, and Target (next BSL/SSL)
  const atrEst = round2(
    recentLookback.reduce((acc, b) => acc + (b.high - b.low), 0) / Math.max(1, recentLookback.length)
  );
  const buffer = Math.max(0.05, round2(atrEst * 0.15));

  let entryPrice = params.price;
  let slPrice = 0;
  let targetPrice = 0;

  if (side === 'BUY') {
    if (ob && !ob.mitigated && params.price <= ob.high * 1.015) {
      entryPrice = round2(ob.bodyHigh);
    } else if (fvg && !fvg.mitigated) {
      entryPrice = round2(fvg.ce);
    } else if (triggerBar) {
      entryPrice = round2(triggerBar.close);
    }
    const baseLow = Math.min(
      ob ? ob.low : Infinity,
      liquidity.sweepWickPrice ?? Infinity,
      triggerBar ? triggerBar.low : entryPrice * 0.99
    );
    const safeLow = Number.isFinite(baseLow) ? baseLow : entryPrice - Math.max(atrEst, entryPrice * 0.006);
    slPrice = round2(Math.min(entryPrice * 0.996, safeLow - buffer));
    const minSlDist = Math.max(0.1, entryPrice - slPrice);
    const bslTarget = liquidity.bslLevel && liquidity.bslLevel > entryPrice + minSlDist * 1.5
      ? liquidity.bslLevel
      : pd.rangeHigh;
    targetPrice = round2(Math.max(bslTarget, entryPrice + 2 * minSlDist));
  } else {
    if (ob && !ob.mitigated && params.price >= ob.low * 0.985) {
      entryPrice = round2(ob.bodyLow);
    } else if (fvg && !fvg.mitigated) {
      entryPrice = round2(fvg.ce);
    } else if (triggerBar) {
      entryPrice = round2(triggerBar.close);
    }
    const baseHigh = Math.max(
      ob ? ob.high : -Infinity,
      liquidity.sweepWickPrice ?? -Infinity,
      triggerBar ? triggerBar.high : entryPrice * 1.01
    );
    const safeHigh = Number.isFinite(baseHigh) && baseHigh > 0 ? baseHigh : entryPrice + Math.max(atrEst, entryPrice * 0.006);
    slPrice = round2(Math.max(entryPrice * 1.004, safeHigh + buffer));
    const minSlDist = Math.max(0.1, slPrice - entryPrice);
    const sslTarget = liquidity.sslLevel && liquidity.sslLevel < entryPrice - minSlDist * 1.5
      ? liquidity.sslLevel
      : pd.rangeLow;
    targetPrice = round2(Math.min(sslTarget, entryPrice - 2 * minSlDist));
  }

  const tradeMath = computeSmcTradeMath({
    side,
    capital: params.capital,
    riskPct: params.riskPct,
    entry: entryPrice,
    oteEntry: side === 'BUY' ? pd.oteBuy705 : pd.oteSell705,
    stopLoss: slPrice,
    target: targetPrice,
  });

  // 5-Point Pre-Entry Checklist
  const htfMatches =
    (side === 'BUY' && htfStruct.bias === 'BULLISH') || (side === 'SELL' && htfStruct.bias === 'BEARISH');
  const liquiditySwept =
    (side === 'BUY' && liquidity.sweepType === 'SSL_SWEEP') ||
    (side === 'SELL' && liquidity.sweepType === 'BSL_SWEEP');
  const structureConfirmed = struct.event === 'CHoCH' || struct.event === 'BOS';
  const rightZone =
    (side === 'BUY' && pd.zone === 'DISCOUNT') || (side === 'SELL' && pd.zone === 'PREMIUM');
  const hasUnmitigatedObOrFvg = Boolean((ob && !ob.mitigated) || (fvg && !fvg.mitigated));

  const checklist: SmcChecklistItem[] = [
    {
      id: 'HTF_BIAS',
      number: 1,
      label: 'HTF Bias Matches',
      passed: htfMatches,
      detail: `HTF ${htfStruct.bias} vs ${side}`,
    },
    {
      id: 'LIQUIDITY_SWEEP',
      number: 2,
      label: side === 'BUY' ? 'SSL Swept First' : 'BSL Swept First',
      passed: liquiditySwept,
      detail: liquiditySwept ? `${liquidity.sweepType} @ ₹${liquidity.sweepLevel}` : 'No sweep yet',
    },
    {
      id: 'CHOCH_OR_BOS',
      number: 3,
      label: 'CHoCH / BOS Confirmed',
      passed: structureConfirmed,
      detail: structureConfirmed ? `${struct.event} @ ₹${struct.triggerLevel}` : 'Awaiting break',
    },
    {
      id: 'OB_OR_FVG_ZONE',
      number: 4,
      label: side === 'BUY' ? 'Unmitigated OB/FVG (Discount)' : 'Unmitigated OB/FVG (Premium)',
      passed: rightZone && hasUnmitigatedObOrFvg,
      detail: `Zone: ${pd.zone} (${pd.rangePositionPct}%) • OB:${ob && !ob.mitigated ? 'Unmit' : ob ? 'Mit' : 'None'} • FVG:${fvg && !fvg.mitigated ? 'Open' : fvg ? 'Filled' : 'None'}`,
    },
    {
      id: 'RR_MIN_1_2',
      number: 5,
      label: 'R:R ≥ 1:2',
      passed: tradeMath.isValidRR,
      detail: `R:R ${tradeMath.rrRatio} (BE ${tradeMath.breakevenWinRatePct}%)`,
    },
  ];

  const checklistScore = checklist.filter((c) => c.passed).length;
  const isQualifiedSetup = checklistScore === 5;
  const statusBadge: SmcSetupRow['statusBadge'] =
    checklistScore === 5
      ? 'TAKE TRADE (5/5)'
      : checklistScore >= 4
      ? 'HIGH PROBABILITY (4/5)'
      : 'SETUP FORMING';

  const { atr25, atr25Pct } = computeAtr25(tfBars, params.price, params.fallbackAtr);
  const rsi = computeRsi14(tfBars, params.fallbackRsi);
  const vwap = computeSessionVwap(params.bars5m, params.fallbackVwap ?? params.price);
  const vwapDiffPct = vwap > 0 ? round2(((params.price - vwap) / vwap) * 100) : 0;
  const aboveVwap = params.price >= vwap;
  const rvol = computeRvolFromBars(tfBars, params.rvol);

  return {
    id: `${params.symbol}_${params.timeframe}_${side}`,
    symbol: params.symbol,
    displayName: params.displayName,
    category: params.category,
    timeframe: params.timeframe,
    side,
    sector: params.sector,
    sectorChangePct: params.sectorChangePct,
    price: round2(params.price),
    changePercent: round2(params.changePercent),
    bidAskRatio: round2(params.bidAskRatio),
    orderBookBias: params.orderBookBias,
    oiChangePct: round2(params.oiChangePct),
    cycleBuildup: classifyCycleBuildup(params.changePercent, params.oiChangePct),
    rawVolume: Math.round(params.rawVolume),
    tradedValueCr: round2(params.tradedValueCr),
    rvol,
    atr25,
    atr25Pct,
    rsi,
    vwap,
    vwapDiffPct,
    aboveVwap,
    htfBias: htfStruct.bias,
    ltfTrend: struct.trend,
    structureEvent: struct.event,
    structureTriggerLevel: struct.triggerLevel,
    lastSwingHigh: struct.lastSH,
    lastSwingLow: struct.lastSL,
    liquidity,
    fvg,
    orderBlock: ob,
    premiumDiscount: pd,
    checklistScore,
    checklist,
    isQualifiedSetup,
    statusBadge,
    tradeMath,
    listedAt,
    inEntryWindow,
  };
}

export function buildSmartMoneyConceptsReport(params: {
  stocks: ScannedStock[];
  getExtendedBarsFn: (symbol: string) => IntradayCandleBar[] | undefined;
  candlesMap: Map<string, Candle[]>;
  indexQuotes: Record<string, UnifiedMarketQuote>;
  isMidnightCleared: boolean;
  isMarketOffDay?: boolean;
  dayCategory?: string;
  timeframe?: SmcTimeframe;
  capital?: number;
  riskPct?: number;
}): SmcReport {
  const ist = getISTDateParts();
  const timeframe: SmcTimeframe =
    params.timeframe && ['5m', '15m', '30m', '1h', 'ALL'].includes(params.timeframe)
      ? params.timeframe
      : '5m';
  const capital = Math.max(1000, Number(params.capital) || 100000);
  const riskPct = Math.max(0.1, Math.min(10, Number(params.riskPct) || 1.0));

  const emptyReport: SmcReport = {
    status: 'ok',
    scannerName: 'Smart Money Concepts',
    generatedAt: new Date().toISOString(),
    istTime: `${ist.dateStr} ${ist.timeStr} IST`,
    entryWindowRule: '09:20:00 - 14:45:00 IST',
    selectedTimeframe: timeframe,
    availableTimeframes: ['5m', '15m', '30m', '1h', 'ALL'],
    timeframeCounts: { '5m': 0, '15m': 0, '30m': 0, '1h': 0 },
    isMidnightCleared: Boolean(params.isMidnightCleared),
    isMarketOffDay: Boolean(params.isMarketOffDay),
    dayCategory: params.dayCategory || 'TRADING_DAY',
    capital,
    riskPct,
    universeEvaluated: 0,
    totalSetups: 0,
    qualifiedCount: 0,
    buyCount: 0,
    sellCount: 0,
    obFvgCount: 0,
    breakerCount: 0,
    categories: {
      allSetups: [],
      qualified5of5: [],
      buyDiscountSetups: [],
      sellPremiumSetups: [],
      unmitigatedObFvg: [],
      bosChochBreaker: [],
    },
  };

  if (params.isMidnightCleared) {
    return emptyReport;
  }

  // Compute uniform arithmetic-mean SECTOR % from pure equities
  const pureEquities = params.stocks.filter(
    (s) => !INDEX_BLACKLIST.has(String(s.symbol || '').toUpperCase())
  );
  const secAgg = new Map<string, { sum: number; count: number }>();
  for (const eq of pureEquities) {
    const sec = eq.sector || 'NSE Equities';
    const cur = secAgg.get(sec) || { sum: 0, count: 0 };
    cur.sum += Number(eq.changePercent) || 0;
    cur.count += 1;
    secAgg.set(sec, cur);
  }
  const sectorAvgMap = new Map<string, number>();
  for (const [sec, v] of secAgg.entries()) {
    sectorAvgMap.set(sec, v.count > 0 ? round2(v.sum / v.count) : 0);
  }

  const tfList: Array<'5m' | '15m' | '30m' | '1h'> = ['5m', '15m', '30m', '1h'];
  const tfCounts: Record<'5m' | '15m' | '30m' | '1h', number> = { '5m': 0, '15m': 0, '30m': 0, '1h': 0 };
  const allCollected: SmcSetupRow[] = [];

  const evaluateTarget = (target: {
    symbol: string;
    displayName: string;
    category: 'EQUITY_FNO' | 'INDEX';
    sector: string;
    sectorChangePct: number;
    price: number;
    changePercent: number;
    bidAskRatio: number;
    orderBookBias: string;
    oiChangePct: number;
    rawVolume: number;
    tradedValueCr: number;
    rvol?: number;
    fallbackAtr?: number;
    fallbackRsi?: number;
    fallbackVwap?: number;
    quoteBars?: IntradayCandleBar[];
  }) => {
    const ext = params.getExtendedBarsFn(target.symbol);
    const mapBars = params.candlesMap.get(target.symbol);
    const bars5m = normalizeBars(
      ext && ext.length >= 5
        ? ext
        : target.quoteBars && target.quoteBars.length >= 5
          ? target.quoteBars
          : mapBars
    );
    if (bars5m.length < 5) return;

    for (const tf of tfList) {
      const row = evaluateSymbolOnTimeframe({
        ...target,
        timeframe: tf,
        bars5m,
        capital,
        riskPct,
      });
      if (row) {
        tfCounts[tf] += 1;
        if (timeframe === 'ALL' || timeframe === tf) {
          allCollected.push(row);
        }
      }
    }
  };

  for (const eq of pureEquities) {
    const sec = eq.sector || 'NSE Equities';
    const secPct = sectorAvgMap.get(sec) ?? round2(Number(eq.sectorChangePercent) || 0);
    const rawVol = Number(eq.volume) || 0;
    const turnCr = (rawVol * eq.price) / 1e7;
    const ba = Number(eq.bidAskRatio) || 1.0;
    evaluateTarget({
      symbol: eq.symbol,
      displayName: eq.name || eq.symbol,
      category: 'EQUITY_FNO',
      sector: sec,
      sectorChangePct: secPct,
      price: eq.price,
      changePercent: eq.changePercent,
      bidAskRatio: ba,
      orderBookBias: eq.orderBookBias || (ba >= 1.15 ? 'Buyer Dominance' : ba <= 0.85 ? 'Seller Pressure' : 'Balanced Order Book'),
      oiChangePct: Number(eq.oiData?.changeInOIPercent) || 0,
      rawVolume: rawVol,
      tradedValueCr: turnCr,
      rvol: Number(eq.indicators?.rvol) || undefined,
      fallbackAtr: Number(eq.indicators?.atr) || undefined,
      fallbackRsi: Number(eq.indicators?.rsi) || undefined,
      fallbackVwap: Number(eq.indicators?.vwap || eq.fyersData?.atp) || undefined,
    });
  }

  for (const idxSym of ['NIFTY 50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX']) {
    const q = params.indexQuotes[idxSym] || (idxSym === 'NIFTY 50' ? params.indexQuotes['NIFTY'] : undefined);
    if (!q || !q.lp) continue;
    const ba = Number(q.bidAskRatio) || 1.0;
    const rawVol = Number(q.volume) || 0;
    evaluateTarget({
      symbol: idxSym,
      displayName: `${idxSym} Spot Index`,
      category: 'INDEX',
      sector: 'Benchmark Index',
      sectorChangePct: round2(Number(q.chp) || 0),
      price: q.lp,
      changePercent: Number(q.chp) || 0,
      bidAskRatio: ba,
      orderBookBias: q.orderBookBias || (ba >= 1.15 ? 'Buyer Dominance' : ba <= 0.85 ? 'Seller Pressure' : 'Balanced Order Book'),
      oiChangePct: 0,
      rawVolume: rawVol,
      tradedValueCr: Number(q.turnoverCr) || (rawVol * q.lp) / 1e7,
      fallbackRsi: Number(q.rsi) || undefined,
      fallbackVwap: Number(q.atp) || undefined,
      quoteBars: q.intradayBars,
    });
  }

  // Z->A sorting by listedAt (latest listed first), then checklist score, then turnover
  const sortZtoA = (a: SmcSetupRow, b: SmcSetupRow) => {
    const tDiff = parseClockSec(b.listedAt) - parseClockSec(a.listedAt);
    if (tDiff !== 0) return tDiff;
    if (b.checklistScore !== a.checklistScore) return b.checklistScore - a.checklistScore;
    return b.tradedValueCr - a.tradedValueCr;
  };

  allCollected.sort(sortZtoA);

  const qualified5of5 = allCollected.filter((r) => r.checklistScore === 5);
  const buyDiscountSetups = allCollected.filter(
    (r) => r.side === 'BUY' && r.premiumDiscount.zone === 'DISCOUNT'
  );
  const sellPremiumSetups = allCollected.filter(
    (r) => r.side === 'SELL' && r.premiumDiscount.zone === 'PREMIUM'
  );
  const unmitigatedObFvg = allCollected.filter(
    (r) => Boolean((r.orderBlock && !r.orderBlock.mitigated) || (r.fvg && !r.fvg.mitigated))
  );
  const bosChochBreaker = allCollected.filter(
    (r) => r.structureEvent !== 'NONE' || Boolean(r.orderBlock?.isBreaker)
  );

  return {
    status: 'ok',
    scannerName: 'Smart Money Concepts',
    generatedAt: new Date().toISOString(),
    istTime: `${ist.dateStr} ${ist.timeStr} IST`,
    entryWindowRule: '09:20:00 - 14:45:00 IST',
    selectedTimeframe: timeframe,
    availableTimeframes: ['5m', '15m', '30m', '1h', 'ALL'],
    timeframeCounts: tfCounts,
    isMidnightCleared: false,
    isMarketOffDay: Boolean(params.isMarketOffDay),
    dayCategory: params.dayCategory || 'TRADING_DAY',
    capital,
    riskPct,
    universeEvaluated: pureEquities.length + 5,
    totalSetups: allCollected.length,
    qualifiedCount: qualified5of5.length,
    buyCount: allCollected.filter((r) => r.side === 'BUY').length,
    sellCount: allCollected.filter((r) => r.side === 'SELL').length,
    obFvgCount: unmitigatedObFvg.length,
    breakerCount: allCollected.filter((r) => Boolean(r.orderBlock?.isBreaker)).length,
    categories: {
      allSetups: allCollected.slice(0, 60),
      qualified5of5: qualified5of5.slice(0, 40),
      buyDiscountSetups: buyDiscountSetups.slice(0, 40),
      sellPremiumSetups: sellPremiumSetups.slice(0, 40),
      unmitigatedObFvg: unmitigatedObFvg.slice(0, 40),
      bosChochBreaker: bosChochBreaker.slice(0, 40),
    },
  };
}
