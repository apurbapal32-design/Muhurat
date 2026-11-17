import { Candle, ScannedStock } from '../src/types';
import { getISTDateParts } from '../src/data/marketSchedule';
import { IntradayCandleBar, UnifiedMarketQuote } from './autonomousPriceService';
import {
  ClaudeFnoBar,
  computeOpeningRange0915To0930,
  formatClockHHMMSS,
  parseClockSec,
  resampleClaudeBars,
} from './claudeFnoEngine';
import {
  computeAtr25,
  computeRvolFromBars,
  detectSwingPoints,
  evaluateLiquidity,
  evaluateMarketStructure,
  SmcOrderBlock,
  detectOrderBlock,
  detectLatestFvg,
} from './smartMoneyConceptsEngine';

export type PriceActionSide = 'BUY' | 'SELL';
export type PriceActionCategory =
  | 'ALL_SIGNALS'
  | 'QUALIFIED_9_OF_9'
  | 'BUY_SIGNALS'
  | 'SELL_SIGNALS'
  | 'ORB_MOMENTUM'
  | 'DEMAND_SUPPLY_SWEEP';

export type CycleBuildupLabel =
  | 'Long Buildup'
  | 'Short Buildup'
  | 'Short Covering'
  | 'Long Unwinding';

export interface PriceActionConditionResult {
  number: number; // 1..9
  id:
    | 'HTF_1H_TREND'
    | 'MTF_30M_TREND'
    | 'TF_15M_BOS_CHOCH'
    | 'TF_15M_ZONE_OR_SWEEP'
    | 'TF_5M_BOS'
    | 'TF_5M_CANDLE_STRENGTH'
    | 'TF_5M_RVOL_1_5'
    | 'RS_VS_NIFTY'
    | 'RR_MIN_2';
  label: string;
  passed: boolean;
  detail: string;
}

export interface PriceActionZoneStatus {
  type: 'DEMAND_HOLD' | 'SUPPLY_REJECTION' | 'NONE';
  zoneLow: number | null;
  zoneHigh: number | null;
  sweepDetected: boolean;
  sweepDetail: string;
  passed: boolean;
}

export interface PriceActionCandleStrength {
  side: PriceActionSide;
  open: number;
  high: number;
  low: number;
  close: number;
  bodyPct: number;
  closePositionPct: number; // 0 = low, 100 = high
  upperWickPct: number;
  lowerWickPct: number;
  isStrongCandle: boolean;
  rejectionType: 'BULLISH_MOMENTUM' | 'BEARISH_MOMENTUM' | 'LOWER_WICK_REJECT' | 'UPPER_WICK_REJECT' | 'MIXED';
}

export interface PriceActionRow {
  id: string;
  symbol: string;
  displayName: string;
  category: 'EQUITY_FNO' | 'INDEX';
  side: PriceActionSide;
  signalBadge: 'BUY SIGNAL' | 'SELL SIGNAL' | 'HIGH PROBABILITY' | 'FORMING';
  isFinalSignal: boolean;
  score: number; // 0..9

  // Market & Order Flow context (Formulas 3, 11, 12)
  sector: string;
  sectorChangePct: number;
  price: number;
  changePercent: number;
  niftyChangePct: number;
  relativeStrengthDiff: number; // Stock % - Nifty %
  rsLabel: 'RELATIVE STRENGTH' | 'RELATIVE WEAKNESS' | 'INLINE';
  bidAskRatio: number;
  orderBookBias: string;
  oiChangePct: number;
  cycleBuildup: CycleBuildupLabel;
  rawVolume: number;
  tradedValueCr: number;
  rvol5m: number;
  atr25: number;
  atr25Pct: number;

  // Formula 1 & 13: Multi-Timeframe Structure Alignment
  trend1h: 'HH + HL (BULLISH)' | 'LH + LL (BEARISH)' | 'RANGING';
  trend30m: 'HH + HL (BULLISH)' | 'LH + LL (BEARISH)' | 'RANGING';
  structure15m: 'BOS' | 'CHoCH' | 'NONE';
  structure15mLevel: number | null;
  structure5m: 'BOS' | 'CHoCH' | 'NONE';
  structure5mLevel: number | null;

  // Formula 2 & 10: Support & Resistance + VWAP-Free Opening Range
  pdh: number;
  pdl: number;
  nearestSupport: number;
  nearestResistance: number;
  orh: number;
  orl: number;
  orbStatus: 'ABOVE_ORH' | 'BELOW_ORL' | 'INSIDE_OR';

  // Formula 4, 6, 7: Candle Strength, Demand/Supply, Liquidity Sweep
  candleStrength: PriceActionCandleStrength;
  zone15m: PriceActionZoneStatus;

  // Formula 14: Risk-to-Reward & Position Sizing (NO VWAP)
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  stopDistance: number;
  targetDistance: number;
  rrNumeric: number;
  rrRatio: string;
  positionSize: number;
  riskAmount: number;

  // Exact 9 BUY or 9 SELL conditions + 14-Formula Matrix check
  conditions: PriceActionConditionResult[];
  formulasActiveCount: number; // out of 14
  listedAt: string;
  inEntryWindow: boolean;
}

export interface PriceActionReport {
  status: 'ok';
  scannerName: 'Price Action';
  generatedAt: string;
  istTime: string;
  entryWindowRule: '09:20:00 - 14:45:00 IST';
  vwapFreeRule: true;
  niftyChangePct: number;
  capital: number;
  riskPct: number;
  isMidnightCleared: boolean;
  isMarketOffDay: boolean;
  dayCategory: string;
  universeEvaluated: number;
  totalScanned: number;
  qualifiedCount: number;
  buySignalCount: number;
  sellSignalCount: number;
  orbCount: number;
  demandSupplyCount: number;
  categories: {
    allSignals: PriceActionRow[];
    qualified9of9: PriceActionRow[];
    buySignals: PriceActionRow[];
    sellSignals: PriceActionRow[];
    orbMomentum: PriceActionRow[];
    demandSupplySweep: PriceActionRow[];
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
      } else if (/^\d{2}:\d{2}/.test(b.time)) {
        timeIST = b.time.length === 5 ? `${b.time}:00` : b.time;
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
 * Strip trailing flat zero-range tick bars if any so candle strength reads true 5m OHLC bar
 */
function pickReal5mCandle(bars5m: ClaudeFnoBar[], triggerBar: ClaudeFnoBar | null): ClaudeFnoBar {
  if (triggerBar && triggerBar.high > triggerBar.low) return triggerBar;
  for (let i = bars5m.length - 1; i >= 0; i--) {
    if (bars5m[i].high > bars5m[i].low) return bars5m[i];
  }
  return bars5m[bars5m.length - 1];
}

/**
 * Formula 4: Candle Strength & Price Rejection
 */
export function evaluateCandleStrength(bar: ClaudeFnoBar, targetSide: PriceActionSide): PriceActionCandleStrength {
  const range = Math.max(0.01, bar.high - bar.low);
  const body = Math.abs(bar.close - bar.open);
  const bodyPct = round2((body / range) * 100);
  const closePositionPct = round2(((bar.close - bar.low) / range) * 100);
  const upperWick = bar.high - Math.max(bar.open, bar.close);
  const lowerWick = Math.min(bar.open, bar.close) - bar.low;
  const upperWickPct = round2((upperWick / range) * 100);
  const lowerWickPct = round2((lowerWick / range) * 100);

  let rejectionType: PriceActionCandleStrength['rejectionType'] = 'MIXED';
  if (bar.close > bar.open && bodyPct >= 55 && closePositionPct >= 65) {
    rejectionType = 'BULLISH_MOMENTUM';
  } else if (bar.close < bar.open && bodyPct >= 55 && closePositionPct <= 35) {
    rejectionType = 'BEARISH_MOMENTUM';
  } else if (lowerWickPct >= 45 && closePositionPct >= 60) {
    rejectionType = 'LOWER_WICK_REJECT';
  } else if (upperWickPct >= 45 && closePositionPct <= 40) {
    rejectionType = 'UPPER_WICK_REJECT';
  }

  const isStrongBullish =
    bar.close > bar.open && (bodyPct >= 55 || (closePositionPct >= 75 && lowerWickPct >= 20));
  const isStrongBearish =
    bar.close < bar.open && (bodyPct >= 55 || (closePositionPct <= 25 && upperWickPct >= 20));

  return {
    side: targetSide,
    open: round2(bar.open),
    high: round2(bar.high),
    low: round2(bar.low),
    close: round2(bar.close),
    bodyPct,
    closePositionPct,
    upperWickPct,
    lowerWickPct,
    isStrongCandle: targetSide === 'BUY' ? isStrongBullish : isStrongBearish,
    rejectionType,
  };
}

/**
 * Formula 6 & 7: 15M Demand/Supply Zone Hold or Rejection + Liquidity Sweep
 */
export function evaluate15mZoneAndSweep(
  bars15m: ClaudeFnoBar[],
  side: PriceActionSide,
  price: number
): PriceActionZoneStatus {
  const { swingHighs, swingLows } = detectSwingPoints(bars15m, Math.min(2, Math.max(1, Math.floor(bars15m.length / 6))));
  const struct = evaluateMarketStructure(bars15m, swingHighs, swingLows);
  const liq = evaluateLiquidity(bars15m, swingHighs, swingLows);
  const fvg = detectLatestFvg(bars15m, side);
  const ob: SmcOrderBlock | null = detectOrderBlock(bars15m, side, struct.triggerIndex, fvg, liq);

  const lastBar = bars15m[bars15m.length - 1];
  if (side === 'BUY') {
    const demandHold =
      Boolean(ob && !ob.mitigated && lastBar.low <= ob.high * 1.015 && Math.max(price, lastBar.close) >= ob.low);
    const sweepReclaim = liq.sweepType === 'SSL_SWEEP';
    return {
      type: demandHold ? 'DEMAND_HOLD' : 'NONE',
      zoneLow: ob ? ob.low : null,
      zoneHigh: ob ? ob.high : null,
      sweepDetected: sweepReclaim,
      sweepDetail: sweepReclaim ? `SSL Sweep & Reclaim @ ₹${liq.sweepLevel}` : 'No SSL sweep',
      passed: demandHold || sweepReclaim,
    };
  }

  const supplyReject =
    Boolean(ob && !ob.mitigated && lastBar.high >= ob.low * 0.985 && Math.min(price, lastBar.close) <= ob.high);
  const sweepReject = liq.sweepType === 'BSL_SWEEP';
  return {
    type: supplyReject ? 'SUPPLY_REJECTION' : 'NONE',
    zoneLow: ob ? ob.low : null,
    zoneHigh: ob ? ob.high : null,
    sweepDetected: sweepReject,
    sweepDetail: sweepReject ? `BSL Sweep & Reject @ ₹${liq.sweepLevel}` : 'No BSL sweep',
    passed: supplyReject || sweepReject,
  };
}

/**
 * Compute Key S&R levels, Stop Loss, Target, and R:R = TargetDistance / StopDistance
 */
export function computePriceActionTradeLevels(params: {
  side: PriceActionSide;
  entryPrice: number;
  pdh: number;
  pdl: number;
  orh: number;
  orl: number;
  swingHighs: number[];
  swingLows: number[];
  zoneLow: number | null;
  zoneHigh: number | null;
  atr25: number;
  capital: number;
  riskPct: number;
}): {
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  nearestSupport: number;
  nearestResistance: number;
  stopDistance: number;
  targetDistance: number;
  rrNumeric: number;
  rrRatio: string;
  positionSize: number;
  riskAmount: number;
} {
  const entry = round2(params.entryPrice);
  const buffer = Math.max(0.05, round2(params.atr25 * 0.2));
  const supportsBelow = [...params.swingLows, params.pdl, params.orl, params.zoneLow ?? 0]
    .filter((v) => Number.isFinite(v) && v > 0 && v < entry)
    .sort((a, b) => b - a);
  const resistancesAbove = [...params.swingHighs, params.pdh, params.orh, params.zoneHigh ?? 0]
    .filter((v) => Number.isFinite(v) && v > entry)
    .sort((a, b) => a - b);

  const nearestSupport = round2(supportsBelow[0] ?? entry * 0.99);
  const nearestResistance = round2(resistancesAbove[0] ?? entry * 1.01);

  let stopLoss = entry;
  let targetPrice = entry;

  if (params.side === 'BUY') {
    const baseSL = Math.min(
      supportsBelow[0] ?? entry - Math.max(params.atr25, entry * 0.005),
      entry - Math.max(0.1, params.atr25 * 0.4)
    );
    stopLoss = round2(Math.min(entry * 0.997, baseSL - buffer));
    const stopDist = Math.max(0.05, entry - stopLoss);
    const min2RTarget = round2(entry + 2.0 * stopDist);

    // Pick next key structural resistance above entry that yields >= 2R if present;
    // if an immediate resistance sits directly overhead (< 2R), check whether breakout already cleared all tracked resistances.
    const nextOverhead = resistancesAbove.find((r) => r >= entry + stopDist * 0.4);
    if (!nextOverhead) {
      // Blue-sky / fresh breakout above PDH, ORH & prior Swing Highs -> project 2R extension
      targetPrice = min2RTarget;
    } else if (nextOverhead >= min2RTarget) {
      targetPrice = round2(nextOverhead);
    } else {
      // Check next higher resistance cluster beyond tight barrier vs tight cap
      const higherRes = resistancesAbove.find((r) => r >= min2RTarget);
      if (higherRes && nextOverhead <= entry + stopDist * 0.5) {
        targetPrice = round2(higherRes);
      } else {
        // Respect nearest overhead resistance so Condition 9 evaluates R:R authentically
        targetPrice = round2(nextOverhead);
      }
    }
  } else {
    const baseSL = Math.max(
      resistancesAbove[0] ?? entry + Math.max(params.atr25, entry * 0.005),
      entry + Math.max(0.1, params.atr25 * 0.4)
    );
    stopLoss = round2(Math.max(entry * 1.003, baseSL + buffer));
    const stopDist = Math.max(0.05, stopLoss - entry);
    const min2RTarget = round2(entry - 2.0 * stopDist);

    const nextUnderfoot = supportsBelow.find((s) => s <= entry - stopDist * 0.4);
    if (!nextUnderfoot) {
      targetPrice = Math.max(0.05, min2RTarget);
    } else if (nextUnderfoot <= min2RTarget) {
      targetPrice = round2(nextUnderfoot);
    } else {
      const lowerSup = supportsBelow.find((s) => s <= min2RTarget);
      if (lowerSup && nextUnderfoot >= entry - stopDist * 0.5) {
        targetPrice = round2(lowerSup);
      } else {
        targetPrice = round2(nextUnderfoot);
      }
    }
  }

  const stopDistance = round2(
    params.side === 'BUY' ? Math.max(0.05, entry - stopLoss) : Math.max(0.05, stopLoss - entry)
  );
  const targetDistance = round2(
    params.side === 'BUY' ? Math.max(0, targetPrice - entry) : Math.max(0, entry - targetPrice)
  );
  const rrNumeric = stopDistance > 0 ? round2(targetDistance / stopDistance) : 0;
  const riskAmount = round2((params.capital * params.riskPct) / 100);
  const positionSize = stopDistance > 0 ? Math.floor(riskAmount / stopDistance) : 0;

  return {
    entryPrice: entry,
    stopLoss,
    targetPrice,
    nearestSupport,
    nearestResistance,
    stopDistance,
    targetDistance,
    rrNumeric,
    rrRatio: `1 : ${rrNumeric.toFixed(2)}`,
    positionSize,
    riskAmount,
  };
}

/**
 * Evaluate all 9 BUY or 9 SELL conditions + 14 Formulas for one instrument
 */
export function evaluatePriceActionSide(params: {
  symbol: string;
  displayName: string;
  category: 'EQUITY_FNO' | 'INDEX';
  side: PriceActionSide;
  bars5m: ClaudeFnoBar[];
  bars15m: ClaudeFnoBar[];
  bars30m: ClaudeFnoBar[];
  bars1h: ClaudeFnoBar[];
  price: number;
  changePercent: number;
  niftyChangePct: number;
  sector: string;
  sectorChangePct: number;
  bidAskRatio: number;
  orderBookBias: string;
  oiChangePct: number;
  rawVolume: number;
  tradedValueCr: number;
  capital: number;
  riskPct: number;
  explicitPdh?: number;
  explicitPdl?: number;
}): PriceActionRow {
  const latestDate = params.bars5m[params.bars5m.length - 1].dateIST;
  const todayBars5m = params.bars5m.filter((b) => b.dateIST === latestDate);
  const prevDayBars5m = params.bars5m.filter((b) => b.dateIST !== latestDate);
  const session5m = todayBars5m.length >= 2 ? todayBars5m : params.bars5m;

  const pdh =
    prevDayBars5m.length >= 2
      ? round2(Math.max(...prevDayBars5m.map((b) => b.high)))
      : round2(params.explicitPdh || Math.max(...params.bars5m.slice(0, -1).map((b) => b.high), params.price));
  const pdl =
    prevDayBars5m.length >= 2
      ? round2(Math.min(...prevDayBars5m.map((b) => b.low)))
      : round2(params.explicitPdl || Math.min(...params.bars5m.slice(0, -1).map((b) => b.low), params.price));

  const dayOpen = session5m[0].open;
  const { orh, orl } = computeOpeningRange0915To0930(session5m, dayOpen, params.price);
  const orbStatus: PriceActionRow['orbStatus'] =
    params.price > orh ? 'ABOVE_ORH' : params.price < orl ? 'BELOW_ORL' : 'INSIDE_OR';

  const { swingHighs: sh1h, swingLows: sl1h } = detectSwingPoints(params.bars1h, 1);
  const struct1h = evaluateMarketStructure(params.bars1h, sh1h, sl1h);

  const { swingHighs: sh30m, swingLows: sl30m } = detectSwingPoints(params.bars30m, 1);
  const struct30m = evaluateMarketStructure(params.bars30m, sh30m, sl30m);

  const { swingHighs: sh15m, swingLows: sl15m } = detectSwingPoints(params.bars15m, 1);
  const struct15m = evaluateMarketStructure(params.bars15m, sh15m, sl15m);
  const zone15m = evaluate15mZoneAndSweep(params.bars15m, params.side, params.price);

  const { swingHighs: sh5m, swingLows: sl5m } = detectSwingPoints(params.bars5m, 2);
  const struct5m = evaluateMarketStructure(params.bars5m, sh5m, sl5m);

  const activeCandle5m = pickReal5mCandle(
    params.bars5m,
    struct5m.eventSide === params.side ? struct5m.triggerBar : null
  );
  const candleStrength = evaluateCandleStrength(activeCandle5m, params.side);
  const rvol5m = computeRvolFromBars(params.bars5m);
  const { atr25, atr25Pct } = computeAtr25(params.bars5m, params.price);

  const rsDiff = round2(params.changePercent - params.niftyChangePct);
  const rsLabel: PriceActionRow['rsLabel'] =
    rsDiff > 0 ? 'RELATIVE STRENGTH' : rsDiff < 0 ? 'RELATIVE WEAKNESS' : 'INLINE';

  const triggerBar = struct5m.eventSide === params.side ? struct5m.triggerBar : activeCandle5m;
  const triggerSec = triggerBar ? triggerBar.secIST : params.bars5m[params.bars5m.length - 1].secIST;
  const listedAt = triggerSec > 0 ? formatClockHHMMSS(triggerSec) : '--';
  const inEntryWindow = triggerSec >= ENTRY_START_SEC && triggerSec <= ENTRY_END_SEC;

  const trade = computePriceActionTradeLevels({
    side: params.side,
    entryPrice: params.price,
    pdh,
    pdl,
    orh: round2(orh),
    orl: round2(orl),
    swingHighs: [...sh15m.map((s) => s.price), ...sh5m.map((s) => s.price)],
    swingLows: [...sl15m.map((s) => s.price), ...sl5m.map((s) => s.price)],
    zoneLow: zone15m.zoneLow,
    zoneHigh: zone15m.zoneHigh,
    atr25,
    capital: params.capital,
    riskPct: params.riskPct,
  });

  // Exact 9 BUY / 9 SELL conditions
  const isBuy = params.side === 'BUY';
  const c1 = isBuy ? struct1h.trend === 'HH + HL (BULLISH)' : struct1h.trend === 'LH + LL (BEARISH)';
  const c2 = isBuy ? struct30m.trend === 'HH + HL (BULLISH)' : struct30m.trend === 'LH + LL (BEARISH)';
  const c3 =
    struct15m.eventSide === params.side && (struct15m.event === 'BOS' || struct15m.event === 'CHoCH');
  const c4 = zone15m.passed;
  const c5 = struct5m.eventSide === params.side && struct5m.event === 'BOS';
  const c6 = candleStrength.isStrongCandle;
  const c7 = rvol5m >= 1.5;
  const c8 = isBuy ? params.changePercent > params.niftyChangePct : params.changePercent < params.niftyChangePct;
  const c9 = trade.rrNumeric >= 2.0;

  const conditions: PriceActionConditionResult[] = [
    {
      number: 1,
      id: 'HTF_1H_TREND',
      label: isBuy ? '1H = HH + HL' : '1H = LH + LL',
      passed: c1,
      detail: `1H Structure: ${struct1h.trend}`,
    },
    {
      number: 2,
      id: 'MTF_30M_TREND',
      label: isBuy ? '30M = HH + HL' : '30M = LH + LL',
      passed: c2,
      detail: `30M Structure: ${struct30m.trend}`,
    },
    {
      number: 3,
      id: 'TF_15M_BOS_CHOCH',
      label: isBuy ? '15M = Bullish BOS or CHoCH' : '15M = Bearish BOS or CHoCH',
      passed: c3,
      detail: `15M: ${struct15m.event} (${struct15m.eventSide || 'NEUTRAL'})${struct15m.triggerLevel ? ' @ ₹' + struct15m.triggerLevel : ''}`,
    },
    {
      number: 4,
      id: 'TF_15M_ZONE_OR_SWEEP',
      label: isBuy ? '15M = Demand Hold OR Sweep+Reclaim' : '15M = Supply Reject OR Sweep+Reject',
      passed: c4,
      detail: `${zone15m.type !== 'NONE' ? zone15m.type.replace('_', ' ') : 'No zone'} • ${zone15m.sweepDetail}`,
    },
    {
      number: 5,
      id: 'TF_5M_BOS',
      label: isBuy ? '5M = Bullish BOS' : '5M = Bearish BOS',
      passed: c5,
      detail: `5M: ${struct5m.event} (${struct5m.eventSide || 'NEUTRAL'})${struct5m.triggerLevel ? ' @ ₹' + struct5m.triggerLevel : ''}`,
    },
    {
      number: 6,
      id: 'TF_5M_CANDLE_STRENGTH',
      label: isBuy ? '5M = Strong Bullish Candle' : '5M = Strong Bearish Candle',
      passed: c6,
      detail: `Body ${candleStrength.bodyPct}% • Close Pos ${candleStrength.closePositionPct}% (${candleStrength.rejectionType})`,
    },
    {
      number: 7,
      id: 'TF_5M_RVOL_1_5',
      label: '5M RVOL ≥ 1.5',
      passed: c7,
      detail: `5M RVOL: ${rvol5m.toFixed(2)}x`,
    },
    {
      number: 8,
      id: 'RS_VS_NIFTY',
      label: isBuy ? 'Stock RS > NIFTY' : 'Stock RS < NIFTY',
      passed: c8,
      detail: `Stock ${params.changePercent >= 0 ? '+' : ''}${params.changePercent.toFixed(2)}% vs NIFTY ${params.niftyChangePct >= 0 ? '+' : ''}${params.niftyChangePct.toFixed(2)}% (RS ${rsDiff >= 0 ? '+' : ''}${rsDiff}%)`,
    },
    {
      number: 9,
      id: 'RR_MIN_2',
      label: 'Target Dist / Stop Dist ≥ 2',
      passed: c9,
      detail: `R:R ${trade.rrRatio} (Target ₹${trade.targetDistance} / Stop ₹${trade.stopDistance})`,
    },
  ];

  const score = conditions.filter((c) => c.passed).length;
  const isFinalSignal = score === 9;
  const signalBadge: PriceActionRow['signalBadge'] = isFinalSignal
    ? isBuy
      ? 'BUY SIGNAL'
      : 'SELL SIGNAL'
    : score >= 7
      ? 'HIGH PROBABILITY'
      : 'FORMING';

  // Count how many of the 14 Price Action Modules are actively aligned
  const formulasChecks = [
    c1 || c2, // 1 Market Structure
    (isBuy && params.price > trade.nearestSupport) || (!isBuy && params.price < trade.nearestResistance), // 2 Support & Resistance
    (isBuy && params.bidAskRatio >= 1.0) || (!isBuy && params.bidAskRatio <= 1.0) || c7, // 3 Volume Analysis
    c6, // 4 Candle Strength
    (isBuy && orbStatus === 'ABOVE_ORH') || (!isBuy && orbStatus === 'BELOW_ORL') || c5, // 5 Breakout/Breakdown
    zone15m.type !== 'NONE', // 6 Demand & Supply
    zone15m.sweepDetected, // 7 Liquidity Sweep
    struct15m.event === 'BOS' || struct5m.event === 'BOS', // 8 BOS
    struct15m.event === 'CHoCH' || struct5m.event === 'CHoCH', // 9 CHoCH
    (isBuy && orbStatus === 'ABOVE_ORH') || (!isBuy && orbStatus === 'BELOW_ORL'), // 10 VWAP-free ORB
    rsDiff > 0, // 11 Relative Strength
    rsDiff < 0, // 12 Relative Weakness
    c1 && c2 && c3 && c5, // 13 MTF Alignment
    c9, // 14 Risk-to-Reward Filter
  ];
  const formulasActiveCount = formulasChecks.filter(Boolean).length;

  return {
    id: `${params.symbol}_${params.side}`,
    symbol: params.symbol,
    displayName: params.displayName,
    category: params.category,
    side: params.side,
    signalBadge,
    isFinalSignal,
    score,
    sector: params.sector,
    sectorChangePct: params.sectorChangePct,
    price: round2(params.price),
    changePercent: round2(params.changePercent),
    niftyChangePct: round2(params.niftyChangePct),
    relativeStrengthDiff: rsDiff,
    rsLabel,
    bidAskRatio: round2(params.bidAskRatio),
    orderBookBias: params.orderBookBias,
    oiChangePct: round2(params.oiChangePct),
    cycleBuildup: classifyCycleBuildup(params.changePercent, params.oiChangePct),
    rawVolume: Math.round(params.rawVolume),
    tradedValueCr: round2(params.tradedValueCr),
    rvol5m,
    atr25,
    atr25Pct,
    trend1h: struct1h.trend,
    trend30m: struct30m.trend,
    structure15m: struct15m.event,
    structure15mLevel: struct15m.triggerLevel,
    structure5m: struct5m.event,
    structure5mLevel: struct5m.triggerLevel,
    pdh,
    pdl,
    nearestSupport: trade.nearestSupport,
    nearestResistance: trade.nearestResistance,
    orh: round2(orh),
    orl: round2(orl),
    orbStatus,
    candleStrength,
    zone15m,
    entryPrice: trade.entryPrice,
    stopLoss: trade.stopLoss,
    targetPrice: trade.targetPrice,
    stopDistance: trade.stopDistance,
    targetDistance: trade.targetDistance,
    rrNumeric: trade.rrNumeric,
    rrRatio: trade.rrRatio,
    positionSize: trade.positionSize,
    riskAmount: trade.riskAmount,
    conditions,
    formulasActiveCount,
    listedAt,
    inEntryWindow,
  };
}

export function buildPriceActionReport(params: {
  stocks: ScannedStock[];
  getExtendedBarsFn: (symbol: string) => IntradayCandleBar[] | undefined;
  candlesMap: Map<string, Candle[]>;
  indexQuotes: Record<string, UnifiedMarketQuote>;
  isMidnightCleared: boolean;
  isMarketOffDay?: boolean;
  dayCategory?: string;
  capital?: number;
  riskPct?: number;
}): PriceActionReport {
  const ist = getISTDateParts();
  const capital = Math.max(1000, Number(params.capital) || 100000);
  const riskPct = Math.max(0.1, Math.min(10, Number(params.riskPct) || 1.0));
  const niftyQ = params.indexQuotes['NIFTY 50'] || params.indexQuotes['NIFTY'];
  const niftyChangePct = round2(Number(niftyQ?.chp) || 0);

  const emptyReport: PriceActionReport = {
    status: 'ok',
    scannerName: 'Price Action',
    generatedAt: new Date().toISOString(),
    istTime: `${ist.dateStr} ${ist.timeStr} IST`,
    entryWindowRule: '09:20:00 - 14:45:00 IST',
    vwapFreeRule: true,
    niftyChangePct,
    capital,
    riskPct,
    isMidnightCleared: Boolean(params.isMidnightCleared),
    isMarketOffDay: Boolean(params.isMarketOffDay),
    dayCategory: params.dayCategory || 'TRADING_DAY',
    universeEvaluated: 0,
    totalScanned: 0,
    qualifiedCount: 0,
    buySignalCount: 0,
    sellSignalCount: 0,
    orbCount: 0,
    demandSupplyCount: 0,
    categories: {
      allSignals: [],
      qualified9of9: [],
      buySignals: [],
      sellSignals: [],
      orbMomentum: [],
      demandSupplySweep: [],
    },
  };

  if (params.isMidnightCleared) {
    return emptyReport;
  }

  // Uniform pure-equity arithmetic-mean SECTOR %
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

  const allCollected: PriceActionRow[] = [];

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
    explicitPdh?: number;
    explicitPdl?: number;
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

    const bars15m = resampleClaudeBars(bars5m, 15);
    const bars30m = resampleClaudeBars(bars5m, 30);
    const bars1h = resampleClaudeBars(bars5m, 60);
    if (bars15m.length < 3 || bars30m.length < 2 || bars1h.length < 1) return;

    const common = {
      ...target,
      bars5m,
      bars15m,
      bars30m,
      bars1h,
      niftyChangePct,
      capital,
      riskPct,
    };

    const buyRow = evaluatePriceActionSide({ ...common, side: 'BUY' });
    const sellRow = evaluatePriceActionSide({ ...common, side: 'SELL' });

    // Pick stronger aligned side (all 9/9 takes priority, then higher score, then RS direction)
    let chosen: PriceActionRow;
    if (buyRow.score !== sellRow.score) {
      chosen = buyRow.score > sellRow.score ? buyRow : sellRow;
    } else {
      chosen = target.changePercent >= niftyChangePct ? buyRow : sellRow;
    }
    allCollected.push(chosen);
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
      orderBookBias:
        eq.orderBookBias ||
        (ba >= 1.15 ? 'Buyer Dominance' : ba <= 0.85 ? 'Seller Pressure' : 'Balanced Order Book'),
      oiChangePct: Number(eq.oiData?.changeInOIPercent) || 0,
      rawVolume: rawVol,
      tradedValueCr: turnCr,
      explicitPdh: Number(eq.indicators?.pdh) || undefined,
      explicitPdl: Number(eq.indicators?.pdl) || undefined,
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
      orderBookBias:
        q.orderBookBias ||
        (ba >= 1.15 ? 'Buyer Dominance' : ba <= 0.85 ? 'Seller Pressure' : 'Balanced Order Book'),
      oiChangePct: 0,
      rawVolume: rawVol,
      tradedValueCr: Number(q.turnoverCr) || (rawVol * q.lp) / 1e7,
      quoteBars: q.intradayBars,
    });
  }

  // Z->A sorting by listedAt (latest listed first), then score (9/9 -> 0), then turnover
  allCollected.sort((a, b) => {
    if (b.isFinalSignal !== a.isFinalSignal) return b.isFinalSignal ? 1 : -1;
    const tDiff = parseClockSec(b.listedAt) - parseClockSec(a.listedAt);
    if (tDiff !== 0) return tDiff;
    if (b.score !== a.score) return b.score - a.score;
    return b.tradedValueCr - a.tradedValueCr;
  });

  const qualified9of9 = allCollected.filter((r) => r.isFinalSignal);
  const buySignals = allCollected.filter((r) => r.side === 'BUY');
  const sellSignals = allCollected.filter((r) => r.side === 'SELL');
  const orbMomentum = allCollected.filter((r) => r.orbStatus !== 'INSIDE_OR');
  const demandSupplySweep = allCollected.filter((r) => r.zone15m.passed);

  return {
    status: 'ok',
    scannerName: 'Price Action',
    generatedAt: new Date().toISOString(),
    istTime: `${ist.dateStr} ${ist.timeStr} IST`,
    entryWindowRule: '09:20:00 - 14:45:00 IST',
    vwapFreeRule: true,
    niftyChangePct,
    capital,
    riskPct,
    isMidnightCleared: false,
    isMarketOffDay: Boolean(params.isMarketOffDay),
    dayCategory: params.dayCategory || 'TRADING_DAY',
    universeEvaluated: pureEquities.length + 5,
    totalScanned: allCollected.length,
    qualifiedCount: qualified9of9.length,
    buySignalCount: buySignals.filter((r) => r.isFinalSignal).length,
    sellSignalCount: sellSignals.filter((r) => r.isFinalSignal).length,
    orbCount: orbMomentum.length,
    demandSupplyCount: demandSupplySweep.length,
    categories: {
      allSignals: allCollected.slice(0, 80),
      qualified9of9: qualified9of9.slice(0, 50),
      buySignals: buySignals.slice(0, 50),
      sellSignals: sellSignals.slice(0, 50),
      orbMomentum: orbMomentum.slice(0, 50),
      demandSupplySweep: demandSupplySweep.slice(0, 50),
    },
  };
}
