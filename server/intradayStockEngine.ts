import { Candle, ScannedStock } from '../src/types';
import { getISTDateParts } from '../src/data/marketSchedule';
import { IntradayCandleBar, UnifiedMarketQuote } from './autonomousPriceService';
import {
  ClaudeFnoBar,
  detectHhHlAndTrend,
  formatClockHHMMSS,
  parseClockSec,
  resampleClaudeBars,
} from './claudeFnoEngine';
import { computeAtr25, computeRvolFromBars } from './smartMoneyConceptsEngine';

export type IntradayStockSide = 'BUY' | 'SELL';
export type IntradayGapType = 'OUTSIDE_GAP_UP' | 'OUTSIDE_GAP_DOWN' | 'INSIDE_PREV_DAY';
export type IntradayEntryStatus =
  | 'QUALIFIED_NEXT_CANDLE'
  | 'AWAITING_NEXT_CANDLE'
  | 'PREV_CANDLE_BREAKOUT'
  | 'INSIDE_DFC_RANGE';

export type CycleBuildupLabel =
  | 'Long Buildup'
  | 'Short Buildup'
  | 'Short Covering'
  | 'Long Unwinding';

export interface IntradayCumDeltaCondition {
  step: number;
  label: string;
  passed: boolean;
  detail: string;
}

export type CumDeltaInterpretation =
  | 'Bullish confirmation'
  | 'Bearish confirmation'
  | 'Possible bearish divergence'
  | 'Possible bullish divergence'
  | 'Buying pressure'
  | 'Selling pressure';

export type CumDeltaPressureTag =
  | 'Buyers becoming aggressive'
  | 'Sellers becoming aggressive'
  | 'Strong Buying Pressure (+)'
  | 'Strong Selling Pressure (-)'
  | 'Buying pressure (+)'
  | 'Selling pressure (-)'
  | 'Neutral Flow';

export interface IntradayStockRow {
  id: string;
  symbol: string;
  displayName: string;
  instrumentType: 'EQUITY_FNO' | 'INDEX';
  side: IntradayStockSide;
  signalBadge:
    | 'DFC BUY SIGNAL'
    | 'DFC SELL SIGNAL'
    | 'GAP-UP DFC BUY'
    | 'GAP-DOWN DFC SELL'
    | 'DFC BREAKOUT LIVE'
    | 'PREV CANDLE BO'
    | 'INSIDE DFC WATCH';
  cumDeltaBadge: '6/6 CUM Δ BUY' | '6/6 CUM Δ SELL' | 'CUM Δ FORMING';
  isDfcQualified: boolean;
  entryStatus: IntradayEntryStatus;
  volatileChop: boolean;

  // Candlestick & Day First Candle (DFC @ 09:15 5m)
  dfcTime: string;
  dfcColor: 'GREEN' | 'RED';
  dfcOpen: number;
  dfcHigh: number;
  dfcLow: number;
  dfcClose: number;
  dfcRange: number; // DFC HL Difference = Target 1 distance
  dfcRangePct: number;

  // Previous Day & Gap Open Formula
  pdh: number;
  pdl: number;
  prevClose: number;
  gapType: IntradayGapType;
  gapOpenPct: number;

  // Closing Basis Breakout + Next Qualified Candle Rule
  prevCandleBreakout: 'ABOVE_PREV_HIGH' | 'BELOW_PREV_LOW' | 'NONE';
  closingCandleNo: number | null;
  closingCandleTime: string;
  closingCandleClose: number | null;
  qualifiedCandleNo: number | null;
  qualifiedCandleTime: string;
  listedAt: string;
  inEntryWindow: boolean;

  // Stop Loss & Targets
  price: number;
  changePercent: number;
  entryPrice: number;
  stopLoss: number; // BUY -> DFC Low | SELL -> DFC High
  target1: number; // Entry +/- DFC HL Difference
  target2: number; // 3:25 PM Hold projection (Entry +/- 2x DFC HL Diff)
  target2ExitTime: '15:25:00 IST';
  riskPerUnit: number;
  rrT1: number;
  rrT1Ratio: string;
  positionSize: number;
  riskAmount: number;

  // Cumulative Delta (Cum Δ) + VWAP + 15m Trend + RVOL 2x Formula
  vwap: number;
  vsVwapPct: number;
  barBuyVolume: number;
  barSellVolume: number;
  currentDelta: number; // Current Bar Total Buy Vol - Total Sell Vol
  prevCumDelta: number;
  cumDelta: number; // Previous Cum Delta + Current Delta
  cumDeltaSlope3: number;
  sessionBuyVolume: number;
  sessionSellVolume: number;
  totalBuyQty: number;
  totalSellQty: number;
  trend15m: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  cumDeltaInterpretation: CumDeltaInterpretation;
  cumDeltaPressureTag: CumDeltaPressureTag;
  cumDeltaDivergence: boolean;
  cumDeltaScore: number; // 0..6
  allSixCumDeltaMet: boolean;
  cumDeltaConditions: IntradayCumDeltaCondition[];

  // Standard Live Market Flow Telemetry
  sector: string;
  sectorChangePct: number;
  rvol5m: number;
  rawVolume: number;
  tradedValueCr: number;
  bidAskRatio: number;
  orderBookBias: string;
  oiChangePct: number;
  cycleBuildup: CycleBuildupLabel;
  atr25: number;
  atr25Pct: number;
  formulaRankScore?: number;
  directionRank?: number;
}

export interface IntradayStockReport {
  status: 'ok';
  scannerName: 'Intraday Stock';
  sourceFormula: 'Cumulative Delta (Cum Δ) + VWAP + 15m Trend + RVOL ≥ 2x + 5m DFC Formula';
  generatedAt: string;
  istTime: string;
  timeframe: '5m';
  entryWindowRule: '09:20:00 - 14:45:00 IST';
  target2ExitRule: '15:25:00 IST';
  capital: number;
  riskPct: number;
  isMidnightCleared: boolean;
  isMarketOffDay: boolean;
  dayCategory: string;
  universeEvaluated: number;
  totalScanned: number;
  qualifiedDfcCount: number;
  confirmedCumDeltaBuyCount: number;
  confirmedCumDeltaSellCount: number;
  buyCount: number;
  sellCount: number;
  gapUpBreakoutCount: number;
  gapDownBreakoutCount: number;
  indexCount: number;
  totalEligibleUpCount: number;
  totalEligibleDownCount: number;
  cumDeltaFormulaSummary: {
    deltaFormula: string;
    cumDeltaFormula: string;
    buyRules: string[];
    sellRules: string[];
  };
  categories: {
    allSetups: IntradayStockRow[];
    cumDeltaConfirmed: IntradayStockRow[];
    qualifiedDfc: IntradayStockRow[];
    buySetups: IntradayStockRow[];
    sellSetups: IntradayStockRow[];
    gapUpBreakouts: IntradayStockRow[];
    gapDownBreakouts: IntradayStockRow[];
    indexTargets: IntradayStockRow[];
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

export function classifyGapOpen(dayOpen: number, pdh: number, pdl: number): IntradayGapType {
  if (pdh > 0 && dayOpen > pdh) return 'OUTSIDE_GAP_UP';
  if (pdl > 0 && dayOpen < pdl) return 'OUTSIDE_GAP_DOWN';
  return 'INSIDE_PREV_DAY';
}

export function computeBarDeltaFromBuySell(bar: {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}): { barBuyVolume: number; barSellVolume: number; delta: number } {
  const vol = Math.max(0, Math.round(Number(bar.volume) || 0));
  const range = bar.high - bar.low;
  const clv =
    range > 0
      ? Math.max(-1, Math.min(1, ((bar.close - bar.low) - (bar.high - bar.close)) / range))
      : bar.close > bar.open
        ? 0.5
        : bar.close < bar.open
          ? -0.5
          : 0;
  const buyShare = (clv + 1) / 2;
  const barBuyVolume = Math.round(vol * buyShare);
  const barSellVolume = Math.max(0, vol - barBuyVolume);
  const delta = barBuyVolume - barSellVolume;
  return { barBuyVolume, barSellVolume, delta };
}

function compute15mTrendDirection(bars5m: ClaudeFnoBar[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  const bars15m = resampleClaudeBars(bars5m, 15);
  if (bars15m.length === 0) return 'NEUTRAL';
  const last15 = bars15m[bars15m.length - 1];
  if (bars15m.length === 1) {
    if (last15.close > last15.open) return 'BULLISH';
    if (last15.close < last15.open) return 'BEARISH';
    return 'NEUTRAL';
  }
  // 9-bar EMA on 15m closes
  const k = 2 / (Math.min(9, bars15m.length) + 1);
  let ema = bars15m[0].close;
  for (let i = 1; i < bars15m.length; i++) {
    ema = bars15m[i].close * k + ema * (1 - k);
  }
  const hhhl = detectHhHlAndTrend(bars15m);
  const prev15 = bars15m[bars15m.length - 2];

  if (
    (last15.close > ema && (last15.close >= prev15.close || last15.close >= last15.open)) ||
    (hhhl.trend === 'UP' && last15.close >= ema)
  ) {
    return 'BULLISH';
  }
  if (
    (last15.close < ema && (last15.close <= prev15.close || last15.close <= last15.open)) ||
    (hhhl.trend === 'DOWN' && last15.close <= ema)
  ) {
    return 'BEARISH';
  }
  return 'NEUTRAL';
}

export function evaluateIntradayStockFormula(params: {
  symbol: string;
  displayName: string;
  instrumentType: 'EQUITY_FNO' | 'INDEX';
  bars5m: ClaudeFnoBar[];
  price: number;
  changePercent: number;
  sector: string;
  sectorChangePct: number;
  bidAskRatio: number;
  orderBookBias: string;
  oiChangePct: number;
  rawVolume: number;
  tradedValueCr: number;
  capital: number;
  riskPct: number;
  bidQty?: number;
  askQty?: number;
  fallbackRvol?: number;
  explicitVwap?: number;
  explicitPdh?: number;
  explicitPdl?: number;
  explicitPrevClose?: number;
}): IntradayStockRow | null {
  if (!params.bars5m || params.bars5m.length < 2) return null;

  const latestDate = params.bars5m[params.bars5m.length - 1].dateIST;
  const todayBars = params.bars5m.filter((b) => b.dateIST === latestDate);
  const prevDayBars = params.bars5m.filter((b) => b.dateIST !== latestDate);
  const session5m = todayBars.length >= 2 ? todayBars : params.bars5m;

  // Day First Candle (DFC) = first 5-min candle of the session (09:15 AM)
  const dfc = session5m[0];
  const dfcOpen = round2(dfc.open);
  const dfcHigh = round2(dfc.high);
  const dfcLow = round2(dfc.low);
  const dfcClose = round2(dfc.close);
  const dfcRange = round2(Math.max(0.05, dfcHigh - dfcLow));
  const dfcRangePct = dfcLow > 0 ? round2((dfcRange / dfcLow) * 100) : 0;
  const dfcColor: 'GREEN' | 'RED' = dfcClose >= dfcOpen ? 'GREEN' : 'RED';

  // Previous Day High / Low / Close
  const pdh =
    prevDayBars.length >= 1
      ? round2(Math.max(...prevDayBars.map((b) => b.high)))
      : round2(params.explicitPdh || dfcHigh);
  const pdl =
    prevDayBars.length >= 1
      ? round2(Math.min(...prevDayBars.map((b) => b.low)))
      : round2(params.explicitPdl || dfcLow);
  const prevClose =
    prevDayBars.length >= 1
      ? round2(prevDayBars[prevDayBars.length - 1].close)
      : round2(
          params.explicitPrevClose ||
            (params.changePercent !== -100 ? params.price / (1 + params.changePercent / 100) : dfcOpen)
        );

  const gapType = classifyGapOpen(dfcOpen, pdh, pdl);
  const gapOpenPct = prevClose > 0 ? round2(((dfcOpen - prevClose) / prevClose) * 100) : 0;

  // Session VWAP + Cumulative Delta (Cum Δ) calculation across today's 5m candles
  let cumTpv = 0;
  let cumVol = 0;
  let runningCumDelta = 0;
  let sessionBuyVolume = 0;
  let sessionSellVolume = 0;
  const cumDeltaSeries: number[] = [];
  const barStats: Array<{ barBuyVolume: number; barSellVolume: number; delta: number }> = [];

  for (const b of session5m) {
    const v = Math.max(1, b.volume);
    const tp = (b.high + b.low + b.close) / 3;
    cumTpv += tp * v;
    cumVol += v;

    const st = computeBarDeltaFromBuySell(b);
    barStats.push(st);
    sessionBuyVolume += st.barBuyVolume;
    sessionSellVolume += st.barSellVolume;
    runningCumDelta += st.delta;
    cumDeltaSeries.push(runningCumDelta);
  }

  const lastIdx = session5m.length - 1;
  const lastBar = session5m[lastIdx];
  const prevBar = session5m[lastIdx - 1];
  const sessionVwap = cumVol > 0 ? cumTpv / cumVol : lastBar.close;
  const vwap = round2(params.explicitVwap && params.explicitVwap > 0 ? params.explicitVwap : sessionVwap);
  const livePrice = round2(params.price > 0 ? params.price : lastBar.close);
  const vsVwapPct = vwap > 0 ? round2(((livePrice - vwap) / vwap) * 100) : 0;

  // Forming-bar aware active index for current delta & RVOL
  const isFormingBar = Boolean(
    lastIdx >= 2 && prevBar && prevBar.volume > 100 && lastBar.volume < prevBar.volume * 0.45
  );
  const activeDeltaIdx = isFormingBar ? lastIdx - 1 : lastIdx;
  const activeBarStat = barStats[activeDeltaIdx] || barStats[lastIdx];
  const currentDelta = activeBarStat.delta;
  const barBuyVolume = activeBarStat.barBuyVolume;
  const barSellVolume = activeBarStat.barSellVolume;
  const cumDelta = cumDeltaSeries[activeDeltaIdx];
  const prevCumDelta = activeDeltaIdx > 0 ? cumDeltaSeries[activeDeltaIdx - 1] : 0;
  const slopeBaseIdx = Math.max(0, activeDeltaIdx - 3);
  const cumDeltaSlope3 = cumDelta - (activeDeltaIdx > 0 ? cumDeltaSeries[slopeBaseIdx] : 0);

  // Total Buy vs Total Sell Qty (live L1 depth preferred; fallback to bidAskRatio/session flow)
  let totalBuyQty = Math.round(Number(params.bidQty) || 0);
  let totalSellQty = Math.round(Number(params.askQty) || 0);
  if (totalBuyQty <= 0 || totalSellQty <= 0) {
    if (params.bidAskRatio > 1.01 || params.bidAskRatio < 0.99) {
      const baseDepth = Math.max(1000, Math.round((sessionBuyVolume + sessionSellVolume) * 0.05));
      totalBuyQty = Math.max(100, Math.round(baseDepth * (params.bidAskRatio / (params.bidAskRatio + 1))));
      totalSellQty = Math.max(100, baseDepth - totalBuyQty);
    } else {
      totalBuyQty = sessionBuyVolume;
      totalSellQty = sessionSellVolume;
    }
  }

  // RVOL (5m) with forming bar guard
  const rawRvol = computeRvolFromBars(params.bars5m, params.fallbackRvol);
  const completedRvol =
    isFormingBar && session5m.length >= 4
      ? computeRvolFromBars(params.bars5m.slice(0, -1), params.fallbackRvol)
      : rawRvol;
  const rvol5m = round2(isFormingBar ? Math.max(rawRvol, completedRvol) : rawRvol);

  // 15-minute trend
  const trend15m = compute15mTrendDirection(params.bars5m);

  // 8-Case Cumulative Delta Interpretation
  const priceRefIdx = Math.max(0, activeDeltaIdx - 3);
  const priceDelta3 = session5m[activeDeltaIdx].close - session5m[priceRefIdx].close;
  const avgBarVol =
    session5m.reduce((acc, b) => acc + Math.max(0, b.volume), 0) / Math.max(1, session5m.length);

  let cumDeltaInterpretation: CumDeltaInterpretation;
  if (priceDelta3 > 0 && cumDeltaSlope3 > 0) {
    cumDeltaInterpretation = 'Bullish confirmation';
  } else if (priceDelta3 < 0 && cumDeltaSlope3 < 0) {
    cumDeltaInterpretation = 'Bearish confirmation';
  } else if (priceDelta3 > 0 && cumDeltaSlope3 < 0) {
    cumDeltaInterpretation = 'Possible bearish divergence';
  } else if (priceDelta3 < 0 && cumDeltaSlope3 > 0) {
    cumDeltaInterpretation = 'Possible bullish divergence';
  } else if (cumDelta >= 0) {
    cumDeltaInterpretation = 'Buying pressure';
  } else {
    cumDeltaInterpretation = 'Selling pressure';
  }

  let cumDeltaPressureTag: CumDeltaPressureTag;
  if (cumDeltaSlope3 > avgBarVol * 1.15 && currentDelta > 0) {
    cumDeltaPressureTag = 'Buyers becoming aggressive';
  } else if (cumDeltaSlope3 < -avgBarVol * 1.15 && currentDelta < 0) {
    cumDeltaPressureTag = 'Sellers becoming aggressive';
  } else if (cumDelta > avgBarVol * 1.5) {
    cumDeltaPressureTag = 'Strong Buying Pressure (+)';
  } else if (cumDelta < -avgBarVol * 1.5) {
    cumDeltaPressureTag = 'Strong Selling Pressure (-)';
  } else if (cumDelta > 0) {
    cumDeltaPressureTag = 'Buying pressure (+)';
  } else if (cumDelta < 0) {
    cumDeltaPressureTag = 'Selling pressure (-)';
  } else {
    cumDeltaPressureTag = 'Neutral Flow';
  }

  const cumDeltaDivergence =
    cumDeltaInterpretation === 'Possible bearish divergence' ||
    cumDeltaInterpretation === 'Possible bullish divergence';

  // Previous-candle closing basis breakout check
  const prevCandleBreakout: IntradayStockRow['prevCandleBreakout'] =
    lastBar.close > prevBar.high
      ? 'ABOVE_PREV_HIGH'
      : lastBar.close < prevBar.low
        ? 'BELOW_PREV_LOW'
        : 'NONE';

  // Scan session candles i = 1..N-1 for DFC Closing Breakout (Candle #2, #3, #4, #5, ...)
  let buyCloseIdx = -1;
  let sellCloseIdx = -1;
  for (let i = 1; i < session5m.length; i++) {
    if (buyCloseIdx === -1 && session5m[i].close > dfcHigh) {
      buyCloseIdx = i;
    }
    if (sellCloseIdx === -1 && session5m[i].close < dfcLow) {
      sellCloseIdx = i;
    }
  }

  const volatileChop = buyCloseIdx !== -1 && sellCloseIdx !== -1;

  // Evaluate 6-Condition Cum Delta score for BUY and SELL independently first
  const buildBuyChecks = (): IntradayCumDeltaCondition[] => [
    {
      step: 1,
      label: 'Price above VWAP',
      passed: livePrice > vwap,
      detail: `LTP ₹${livePrice} vs VWAP ₹${vwap}`,
    },
    {
      step: 2,
      label: 'Cum Delta positive & increasing',
      passed: cumDelta > 0 && cumDelta > prevCumDelta,
      detail: `Cum Δ ${cumDelta >= 0 ? '+' : ''}${cumDelta.toLocaleString('en-IN')} (Prev ${prevCumDelta >= 0 ? '+' : ''}${prevCumDelta.toLocaleString('en-IN')})`,
    },
    {
      step: 3,
      label: 'Current Delta positive',
      passed: currentDelta > 0,
      detail: `Curr Δ ${currentDelta >= 0 ? '+' : ''}${currentDelta.toLocaleString('en-IN')} (Buy ${barBuyVolume.toLocaleString('en-IN')} - Sell ${barSellVolume.toLocaleString('en-IN')})`,
    },
    {
      step: 4,
      label: 'Total Buy > Total Sell',
      passed: totalBuyQty > totalSellQty,
      detail: `Buy ${totalBuyQty.toLocaleString('en-IN')} vs Sell ${totalSellQty.toLocaleString('en-IN')}`,
    },
    {
      step: 5,
      label: '15-minute trend bullish',
      passed: trend15m === 'BULLISH',
      detail: `15m Trend: ${trend15m}`,
    },
    {
      step: 6,
      label: 'RVOL ≥ 2.0x',
      passed: rvol5m >= 2.0,
      detail: `5m RVOL ${rvol5m.toFixed(2)}x`,
    },
  ];

  const buildSellChecks = (): IntradayCumDeltaCondition[] => [
    {
      step: 1,
      label: 'Price below VWAP',
      passed: livePrice < vwap,
      detail: `LTP ₹${livePrice} vs VWAP ₹${vwap}`,
    },
    {
      step: 2,
      label: 'Cum Delta negative & decreasing',
      passed: cumDelta < 0 && cumDelta < prevCumDelta,
      detail: `Cum Δ ${cumDelta >= 0 ? '+' : ''}${cumDelta.toLocaleString('en-IN')} (Prev ${prevCumDelta >= 0 ? '+' : ''}${prevCumDelta.toLocaleString('en-IN')})`,
    },
    {
      step: 3,
      label: 'Current Delta negative',
      passed: currentDelta < 0,
      detail: `Curr Δ ${currentDelta >= 0 ? '+' : ''}${currentDelta.toLocaleString('en-IN')} (Buy ${barBuyVolume.toLocaleString('en-IN')} - Sell ${barSellVolume.toLocaleString('en-IN')})`,
    },
    {
      step: 4,
      label: 'Total Sell > Total Buy',
      passed: totalSellQty > totalBuyQty,
      detail: `Sell ${totalSellQty.toLocaleString('en-IN')} vs Buy ${totalBuyQty.toLocaleString('en-IN')}`,
    },
    {
      step: 5,
      label: '15-minute trend bearish',
      passed: trend15m === 'BEARISH',
      detail: `15m Trend: ${trend15m}`,
    },
    {
      step: 6,
      label: 'RVOL ≥ 2.0x',
      passed: rvol5m >= 2.0,
      detail: `5m RVOL ${rvol5m.toFixed(2)}x`,
    },
  ];

  const buyChecks = buildBuyChecks();
  const sellChecks = buildSellChecks();
  const buyChecksCount = buyChecks.filter((c) => c.passed).length;
  const sellChecksCount = sellChecks.filter((c) => c.passed).length;

  let side: IntradayStockSide;
  let chosenCloseIdx = -1;
  if (buyCloseIdx !== -1 && sellCloseIdx !== -1) {
    if (params.price >= dfcHigh || lastBar.close >= dfcHigh) {
      side = 'BUY';
      chosenCloseIdx = buyCloseIdx;
    } else if (params.price <= dfcLow || lastBar.close <= dfcLow) {
      side = 'SELL';
      chosenCloseIdx = sellCloseIdx;
    } else if (buyChecksCount !== sellChecksCount) {
      side = buyChecksCount > sellChecksCount ? 'BUY' : 'SELL';
      chosenCloseIdx = side === 'BUY' ? buyCloseIdx : sellCloseIdx;
    } else {
      side = buyCloseIdx >= sellCloseIdx ? 'BUY' : 'SELL';
      chosenCloseIdx = side === 'BUY' ? buyCloseIdx : sellCloseIdx;
    }
  } else if (buyCloseIdx !== -1) {
    side = 'BUY';
    chosenCloseIdx = buyCloseIdx;
  } else if (sellCloseIdx !== -1) {
    side = 'SELL';
    chosenCloseIdx = sellCloseIdx;
  } else if (buyChecksCount !== sellChecksCount) {
    side = buyChecksCount > sellChecksCount ? 'BUY' : 'SELL';
  } else {
    side =
      prevCandleBreakout === 'ABOVE_PREV_HIGH'
        ? 'BUY'
        : prevCandleBreakout === 'BELOW_PREV_LOW'
          ? 'SELL'
          : livePrice >= vwap
            ? 'BUY'
            : 'SELL';
  }

  const cumDeltaConditions = side === 'BUY' ? buyChecks : sellChecks;
  const cumDeltaScore = side === 'BUY' ? buyChecksCount : sellChecksCount;
  const allSixCumDeltaMet = cumDeltaScore === 6;
  const cumDeltaBadge: IntradayStockRow['cumDeltaBadge'] = allSixCumDeltaMet
    ? side === 'BUY'
      ? '6/6 CUM Δ BUY'
      : '6/6 CUM Δ SELL'
    : 'CUM Δ FORMING';

  let entryStatus: IntradayEntryStatus;
  let isDfcQualified = false;
  let closingCandleNo: number | null = null;
  let closingCandleTime = '--';
  let closingCandleClose: number | null = null;
  let qualifiedCandleNo: number | null = null;
  let qualifiedCandleTime = '--';
  let entryPrice = round2(params.price);
  let listedAt = lastBar.timeIST;
  let triggerSec = lastBar.secIST;

  if (chosenCloseIdx !== -1) {
    const closeBar = session5m[chosenCloseIdx];
    closingCandleNo = chosenCloseIdx + 1;
    closingCandleTime = closeBar.timeIST;
    closingCandleClose = round2(closeBar.close);

    if (chosenCloseIdx + 1 < session5m.length) {
      const nextCandle = session5m[chosenCloseIdx + 1];
      entryStatus = 'QUALIFIED_NEXT_CANDLE';
      isDfcQualified = true;
      qualifiedCandleNo = chosenCloseIdx + 2;
      qualifiedCandleTime = nextCandle.timeIST;
      entryPrice = round2(nextCandle.open);
      listedAt = nextCandle.timeIST;
      triggerSec = nextCandle.secIST;
    } else {
      entryStatus = 'AWAITING_NEXT_CANDLE';
      isDfcQualified = true;
      qualifiedCandleNo = chosenCloseIdx + 2;
      qualifiedCandleTime = `Next 5m (${formatClockHHMMSS(closeBar.secIST + 300)})`;
      entryPrice = round2(closeBar.close);
      listedAt = closeBar.timeIST;
      triggerSec = closeBar.secIST;
    }
  } else if (prevCandleBreakout !== 'NONE') {
    entryStatus = 'PREV_CANDLE_BREAKOUT';
    entryPrice = round2(lastBar.close);
    listedAt = lastBar.timeIST;
    triggerSec = lastBar.secIST;
  } else {
    entryStatus = 'INSIDE_DFC_RANGE';
    entryPrice = round2(side === 'BUY' ? dfcHigh : dfcLow);
    listedAt = lastBar.timeIST;
    triggerSec = lastBar.secIST;
  }

  const inEntryWindow = triggerSec >= ENTRY_START_SEC && triggerSec <= ENTRY_END_SEC;

  // Stop Loss & Targets:
  // BUY:  SL = DFC Low  | Target 1 = Entry + DFC HL Diff | Target 2 @ 3:25 PM
  // SELL: SL = DFC High | Target 1 = Entry - DFC HL Diff | Target 2 @ 3:25 PM
  const stopLoss = side === 'BUY' ? dfcLow : dfcHigh;
  const target1 = round2(side === 'BUY' ? entryPrice + dfcRange : Math.max(0.05, entryPrice - dfcRange));
  const target2 = round2(
    side === 'BUY' ? entryPrice + dfcRange * 2 : Math.max(0.05, entryPrice - dfcRange * 2)
  );
  const riskPerUnit = round2(
    Math.max(0.05, side === 'BUY' ? entryPrice - stopLoss : stopLoss - entryPrice)
  );
  const rewardT1 = round2(
    Math.max(0, side === 'BUY' ? target1 - entryPrice : entryPrice - target1)
  );
  const rrT1 = round2(riskPerUnit > 0 ? rewardT1 / riskPerUnit : 0);
  const rrT1Ratio = `1 : ${rrT1.toFixed(2)}`;

  const riskAmount = round2(params.capital * (params.riskPct / 100));
  const positionSize = riskPerUnit > 0 ? Math.floor(riskAmount / riskPerUnit) : 0;

  let signalBadge: IntradayStockRow['signalBadge'];
  if (isDfcQualified) {
    if (entryStatus === 'AWAITING_NEXT_CANDLE') {
      signalBadge = 'DFC BREAKOUT LIVE';
    } else if (side === 'BUY' && gapType === 'OUTSIDE_GAP_UP') {
      signalBadge = 'GAP-UP DFC BUY';
    } else if (side === 'SELL' && gapType === 'OUTSIDE_GAP_DOWN') {
      signalBadge = 'GAP-DOWN DFC SELL';
    } else {
      signalBadge = side === 'BUY' ? 'DFC BUY SIGNAL' : 'DFC SELL SIGNAL';
    }
  } else if (entryStatus === 'PREV_CANDLE_BREAKOUT') {
    signalBadge = 'PREV CANDLE BO';
  } else {
    signalBadge = 'INSIDE DFC WATCH';
  }

  const { atr25, atr25Pct } = computeAtr25(params.bars5m, params.price);

  return {
    id: `${params.symbol}_${side}`,
    symbol: params.symbol,
    displayName: params.displayName,
    instrumentType: params.instrumentType,
    side,
    signalBadge,
    cumDeltaBadge,
    isDfcQualified,
    entryStatus,
    volatileChop,
    dfcTime: dfc.timeIST,
    dfcColor,
    dfcOpen,
    dfcHigh,
    dfcLow,
    dfcClose,
    dfcRange,
    dfcRangePct,
    pdh,
    pdl,
    prevClose,
    gapType,
    gapOpenPct,
    prevCandleBreakout,
    closingCandleNo,
    closingCandleTime,
    closingCandleClose,
    qualifiedCandleNo,
    qualifiedCandleTime,
    listedAt,
    inEntryWindow,
    price: livePrice,
    changePercent: round2(params.changePercent),
    entryPrice,
    stopLoss,
    target1,
    target2,
    target2ExitTime: '15:25:00 IST',
    riskPerUnit,
    rrT1,
    rrT1Ratio,
    positionSize,
    riskAmount,
    vwap,
    vsVwapPct,
    barBuyVolume,
    barSellVolume,
    currentDelta,
    prevCumDelta,
    cumDelta,
    cumDeltaSlope3,
    sessionBuyVolume,
    sessionSellVolume,
    totalBuyQty,
    totalSellQty,
    trend15m,
    cumDeltaInterpretation,
    cumDeltaPressureTag,
    cumDeltaDivergence,
    cumDeltaScore,
    allSixCumDeltaMet,
    cumDeltaConditions,
    sector: params.sector,
    sectorChangePct: params.sectorChangePct,
    rvol5m,
    rawVolume: Math.round(params.rawVolume),
    tradedValueCr: round2(params.tradedValueCr),
    bidAskRatio: round2(params.bidAskRatio),
    orderBookBias: params.orderBookBias,
    oiChangePct: round2(params.oiChangePct),
    cycleBuildup: classifyCycleBuildup(params.changePercent, params.oiChangePct),
    atr25,
    atr25Pct,
  };
}

export function buildIntradayStockReport(params: {
  stocks: ScannedStock[];
  getExtendedBarsFn: (symbol: string) => IntradayCandleBar[] | undefined;
  candlesMap: Map<string, Candle[]>;
  indexQuotes: Record<string, UnifiedMarketQuote>;
  isMidnightCleared: boolean;
  isMarketOffDay?: boolean;
  dayCategory?: string;
  capital?: number;
  riskPct?: number;
}): IntradayStockReport {
  const ist = getISTDateParts();
  const capital = Math.max(1000, Number(params.capital) || 100000);
  const riskPct = Math.max(0.1, Math.min(10, Number(params.riskPct) || 1.0));

  const cumDeltaFormulaSummary = {
    deltaFormula: 'Delta = Total Buy Volume − Total Sell Volume',
    cumDeltaFormula: 'Cum Delta = Previous Cum Delta + Current Delta',
    buyRules: [
      'Price above VWAP',
      'Cum Delta positive and increasing',
      'Current Delta positive',
      'Total Buy greater than Total Sell',
      '15-minute trend bullish',
      'RVOL ≥ 2.0x',
    ],
    sellRules: [
      'Price below VWAP',
      'Cum Delta negative and decreasing',
      'Current Delta negative',
      'Total Sell greater than Total Buy',
      '15-minute trend bearish',
      'RVOL ≥ 2.0x',
    ],
  };

  const empty: IntradayStockReport = {
    status: 'ok',
    scannerName: 'Intraday Stock',
    sourceFormula: 'Cumulative Delta (Cum Δ) + VWAP + 15m Trend + RVOL ≥ 2x + 5m DFC Formula',
    generatedAt: new Date().toISOString(),
    istTime: `${ist.dateStr} ${ist.timeStr} IST`,
    timeframe: '5m',
    entryWindowRule: '09:20:00 - 14:45:00 IST',
    target2ExitRule: '15:25:00 IST',
    capital,
    riskPct,
    isMidnightCleared: Boolean(params.isMidnightCleared),
    isMarketOffDay: Boolean(params.isMarketOffDay),
    dayCategory: params.dayCategory || 'TRADING_DAY',
    universeEvaluated: 0,
    totalScanned: 0,
    qualifiedDfcCount: 0,
    confirmedCumDeltaBuyCount: 0,
    confirmedCumDeltaSellCount: 0,
    buyCount: 0,
    sellCount: 0,
    gapUpBreakoutCount: 0,
    gapDownBreakoutCount: 0,
    indexCount: 0,
    totalEligibleUpCount: 0,
    totalEligibleDownCount: 0,
    cumDeltaFormulaSummary,
    categories: {
      allSetups: [],
      cumDeltaConfirmed: [],
      qualifiedDfc: [],
      buySetups: [],
      sellSetups: [],
      gapUpBreakouts: [],
      gapDownBreakouts: [],
      indexTargets: [],
    },
  };

  if (params.isMidnightCleared) return empty;

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

  const allCollected: IntradayStockRow[] = [];

  for (const eq of pureEquities) {
    const ext = params.getExtendedBarsFn(eq.symbol);
    const mapBars = params.candlesMap.get(eq.symbol);
    const bars5m = normalize5mBars(ext && ext.length >= 2 ? ext : mapBars);
    if (bars5m.length < 2) continue;

    const sec = eq.sector || 'NSE Equities';
    const secPct = sectorAvgMap.get(sec) ?? round2(Number(eq.sectorChangePercent) || 0);
    const rawVol = Number(eq.volume) || 0;
    const turnCr = (rawVol * eq.price) / 1e7;
    const ba = Number(eq.bidAskRatio) || 1.0;

    const row = evaluateIntradayStockFormula({
      symbol: eq.symbol,
      displayName: eq.name || eq.symbol,
      instrumentType: 'EQUITY_FNO',
      bars5m,
      price: eq.price,
      changePercent: eq.changePercent,
      sector: sec,
      sectorChangePct: secPct,
      bidAskRatio: ba,
      orderBookBias:
        eq.orderBookBias ||
        (ba >= 1.15 ? 'Buyer Dominance' : ba <= 0.85 ? 'Seller Pressure' : 'Balanced Order Book'),
      oiChangePct: Number(eq.oiData?.changeInOIPercent) || 0,
      rawVolume: rawVol,
      tradedValueCr: turnCr,
      capital,
      riskPct,
      bidQty: Number((eq as any).bidQty) || undefined,
      askQty: Number((eq as any).askQty) || undefined,
      fallbackRvol: Number(eq.indicators?.rvol ?? (eq as any).rvol) || undefined,
      explicitVwap: Number((eq as any).fyersData?.atp || eq.indicators?.vwap) || undefined,
      explicitPdh: Number(eq.indicators?.pdh) || undefined,
      explicitPdl: Number(eq.indicators?.pdl) || undefined,
    });
    if (row) allCollected.push(row);
  }

  // Include Benchmark Indices
  for (const idxSym of ['NIFTY 50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX']) {
    const q = params.indexQuotes[idxSym] || (idxSym === 'NIFTY 50' ? params.indexQuotes['NIFTY'] : undefined);
    if (!q || !q.lp) continue;
    const ext = params.getExtendedBarsFn(idxSym);
    const bars5m = normalize5mBars(ext && ext.length >= 2 ? ext : q.intradayBars);
    if (bars5m.length < 2) continue;
    const ba = Number(q.bidAskRatio) || 1.0;
    const rawVol = Number(q.volume) || 0;

    const row = evaluateIntradayStockFormula({
      symbol: idxSym,
      displayName: `${idxSym} Spot Index`,
      instrumentType: 'INDEX',
      bars5m,
      price: q.lp,
      changePercent: Number(q.chp) || 0,
      sector: 'Benchmark Index',
      sectorChangePct: round2(Number(q.chp) || 0),
      bidAskRatio: ba,
      orderBookBias:
        q.orderBookBias ||
        (ba >= 1.15 ? 'Buyer Dominance' : ba <= 0.85 ? 'Seller Pressure' : 'Balanced Order Book'),
      oiChangePct: 0,
      rawVolume: rawVol,
      tradedValueCr: Number(q.turnoverCr) || (rawVol * q.lp) / 1e7,
      capital,
      riskPct,
      bidQty: Number(q.bidQty) || undefined,
      askQty: Number(q.askQty) || undefined,
      explicitVwap: Number(q.atp) || undefined,
      explicitPrevClose: Number(q.prevClose) || undefined,
    });
    if (row) allCollected.push(row);
  }

  const scoreFormulaQuality = (row: IntradayStockRow): number => {
    let pts = 0;
    // Cumulative Delta 6-Rule Strategy Core Weight
    if (row.allSixCumDeltaMet) pts += 1200;
    pts += row.cumDeltaScore * 140;
    if (
      (row.side === 'BUY' && row.cumDeltaInterpretation === 'Bullish confirmation') ||
      (row.side === 'SELL' && row.cumDeltaInterpretation === 'Bearish confirmation')
    ) {
      pts += 110;
    } else if (
      (row.side === 'BUY' && row.cumDeltaInterpretation === 'Possible bearish divergence') ||
      (row.side === 'SELL' && row.cumDeltaInterpretation === 'Possible bullish divergence')
    ) {
      pts -= 120;
    }
    if (
      (row.side === 'BUY' && row.cumDeltaPressureTag === 'Buyers becoming aggressive') ||
      (row.side === 'SELL' && row.cumDeltaPressureTag === 'Sellers becoming aggressive')
    ) {
      pts += 120;
    }

    // DFC Breakout, Non-Chop & Execution Alignment
    if (row.isDfcQualified) pts += 500;
    if (row.entryStatus === 'QUALIFIED_NEXT_CANDLE') pts += 180;
    if (!row.volatileChop) pts += 250;
    if (
      (row.side === 'BUY' && row.gapType === 'OUTSIDE_GAP_UP') ||
      (row.side === 'SELL' && row.gapType === 'OUTSIDE_GAP_DOWN')
    ) {
      pts += 140;
    }
    if (row.inEntryWindow) pts += 90;
    if (
      (row.side === 'BUY' && row.prevCandleBreakout === 'ABOVE_PREV_HIGH') ||
      (row.side === 'SELL' && row.prevCandleBreakout === 'BELOW_PREV_LOW')
    ) {
      pts += 80;
    }
    if (
      (row.side === 'BUY' && row.changePercent > 0) ||
      (row.side === 'SELL' && row.changePercent < 0)
    ) {
      pts += 90;
    }
    pts += Math.min(120, (Number(row.rvol5m) || 0) * 18);
    pts += Math.min(120, Math.abs(Number(row.changePercent) || 0) * 18);
    pts += Math.min(80, Math.log10(Math.max(1, Number(row.tradedValueCr) || 1)) * 22);
    return round2(pts);
  };

  const equityRows = allCollected.filter((r) => r.instrumentType === 'EQUITY_FNO');
  const indexTargets = allCollected.filter((r) => r.instrumentType === 'INDEX');
  for (const row of allCollected) {
    row.formulaRankScore = scoreFormulaQuality(row);
  }

  const rankByFormulaDesc = (a: IntradayStockRow, b: IntradayStockRow): number => {
    const sDiff = (b.formulaRankScore || 0) - (a.formulaRankScore || 0);
    if (sDiff !== 0) return sDiff;
    const rDiff = (b.rvol5m || 0) - (a.rvol5m || 0);
    if (rDiff !== 0) return rDiff;
    const tDiff = parseClockSec(b.listedAt) - parseClockSec(a.listedAt);
    if (tDiff !== 0) return tDiff;
    return b.tradedValueCr - a.tradedValueCr;
  };

  const sortListedZToA = (a: IntradayStockRow, b: IntradayStockRow): number => {
    const tDiff = parseClockSec(b.listedAt) - parseClockSec(a.listedAt);
    if (tDiff !== 0) return tDiff;
    return (b.formulaRankScore || 0) - (a.formulaRankScore || 0);
  };

  const upCandidates = equityRows.filter((r) => r.side === 'BUY').sort(rankByFormulaDesc);
  const downCandidates = equityRows.filter((r) => r.side === 'SELL').sort(rankByFormulaDesc);

  const best10Up = upCandidates.slice(0, 10).map((r, i) => ({ ...r, directionRank: i + 1 }));
  const best10Down = downCandidates.slice(0, 10).map((r, i) => ({ ...r, directionRank: i + 1 }));

  best10Up.sort(sortListedZToA);
  best10Down.sort(sortListedZToA);
  const best20Combined = [...best10Up, ...best10Down].sort(sortListedZToA);
  indexTargets.sort(sortListedZToA);

  const cumDeltaConfirmedUp = upCandidates
    .filter((r) => r.allSixCumDeltaMet)
    .slice(0, 10)
    .map((r, i) => ({ ...r, directionRank: i + 1 }));
  const cumDeltaConfirmedDn = downCandidates
    .filter((r) => r.allSixCumDeltaMet)
    .slice(0, 10)
    .map((r, i) => ({ ...r, directionRank: i + 1 }));
  const cumDeltaConfirmed = [...cumDeltaConfirmedUp, ...cumDeltaConfirmedDn].sort(sortListedZToA);

  const qualifiedDfc = best20Combined.filter((r) => r.isDfcQualified);
  const gapUpBreakouts = upCandidates
    .filter((r) => r.isDfcQualified && r.gapType === 'OUTSIDE_GAP_UP')
    .slice(0, 10)
    .map((r, i) => ({ ...r, directionRank: i + 1 }))
    .sort(sortListedZToA);
  const gapDownBreakouts = downCandidates
    .filter((r) => r.isDfcQualified && r.gapType === 'OUTSIDE_GAP_DOWN')
    .slice(0, 10)
    .map((r, i) => ({ ...r, directionRank: i + 1 }))
    .sort(sortListedZToA);

  return {
    status: 'ok',
    scannerName: 'Intraday Stock',
    sourceFormula: 'Cumulative Delta (Cum Δ) + VWAP + 15m Trend + RVOL ≥ 2x + 5m DFC Formula',
    generatedAt: new Date().toISOString(),
    istTime: `${ist.dateStr} ${ist.timeStr} IST`,
    timeframe: '5m',
    entryWindowRule: '09:20:00 - 14:45:00 IST',
    target2ExitRule: '15:25:00 IST',
    capital,
    riskPct,
    isMidnightCleared: false,
    isMarketOffDay: Boolean(params.isMarketOffDay),
    dayCategory: params.dayCategory || 'TRADING_DAY',
    universeEvaluated: pureEquities.length + 5,
    totalScanned: allCollected.length,
    qualifiedDfcCount: qualifiedDfc.length,
    confirmedCumDeltaBuyCount: cumDeltaConfirmedUp.length,
    confirmedCumDeltaSellCount: cumDeltaConfirmedDn.length,
    buyCount: best10Up.length,
    sellCount: best10Down.length,
    gapUpBreakoutCount: gapUpBreakouts.length,
    gapDownBreakoutCount: gapDownBreakouts.length,
    indexCount: indexTargets.length,
    totalEligibleUpCount: upCandidates.length,
    totalEligibleDownCount: downCandidates.length,
    cumDeltaFormulaSummary,
    categories: {
      allSetups: best20Combined,
      cumDeltaConfirmed,
      qualifiedDfc,
      buySetups: best10Up,
      sellSetups: best10Down,
      gapUpBreakouts,
      gapDownBreakouts,
      indexTargets,
    },
  };
}

