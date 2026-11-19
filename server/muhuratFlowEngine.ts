import { Candle, ScannedStock } from '../src/types';
import { getISTDateParts } from '../src/data/marketSchedule';
import { IntradayCandleBar } from './autonomousPriceService';
import { ClaudeFnoBar, formatClockHHMMSS, parseClockSec } from './claudeFnoEngine';
import { computeRvolFromBars } from './smartMoneyConceptsEngine';

export interface MuhuratFlowConditionCheck {
  step: number;
  label: string;
  passed: boolean;
  detail: string;
}

export interface MuhuratFlowScoreBreakdown {
  vwapAnchor: number; // /15
  institutionalVolume: number; // /20
  liquiditySweepAndAbsorption: number; // /25
  cvdOrderFlow: number; // /20
  oiAndOrderBook: number; // /10
  postSweepConfirmation: number; // /10
  total: number; // /100
}

export type MuhuratSweepType =
  | 'SSL_STOP_HUNT_RECLAIM'
  | 'BSL_STOP_HUNT_REJECT'
  | 'DEMAND_ABSORPTION'
  | 'SUPPLY_ABSORPTION'
  | 'ORDER_FLOW_CONTINUATION';

export interface MuhuratFlowSignalRow {
  symbol: string;
  name: string;
  sector: string;
  sectorChangePct: number;
  direction: 'BUY' | 'SELL';
  grade: '6/6 CONFIRMED' | 'STRONG FLOW' | 'WATCHLIST';
  classification: 'Strong BUY' | 'Strong SELL' | 'Good Opportunity' | 'Watchlist';
  sweepType: MuhuratSweepType;
  sweepLabel: string;
  allSixMet: boolean;
  conditionsMet: number;
  totalConditions: 6;
  listedAt: string;
  sweepTimeIST: string;
  confirmationTimeIST: string;
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

  // Order Flow + Whale Footprint Metrics
  vwap: number;
  vsVwapPct: number;
  vsVwapAtr: number;
  pdh: number;
  pdl: number;
  orh: number;
  orl: number;
  sweptLevelPrice: number;
  sweptLevelName: string;
  wickAbsorptionPct: number;
  barValueCr: number;
  turnoverCr: number;
  rvol: number;
  barVolRatio: number;

  // CVD Metrics (approximated from OHLCV intrabar CLV * Volume)
  sessionCvd: number;
  cvdSlope3: number;
  cvdBias: 'ACCUMULATION' | 'DISTRIBUTION' | 'DIVERGENT_ABSORPTION' | 'NEUTRAL';
  cvdDivergenceDetected: boolean;
  clvPct: number;

  // Anti-Chase & Confirmation Discipline
  antiChasePassed: boolean;
  candleAtrMultiple: number;
  confirmCandleBodyPct: number;
  postSweepConfirmed: boolean;

  // OI & Order Book
  bidAskRatio: number;
  orderBookBias: string;
  oiChangePct: number;
  cycleBuildup: 'Long Buildup' | 'Short Buildup' | 'Short Covering' | 'Long Unwinding';

  scoreBreakdown: MuhuratFlowScoreBreakdown;
  conditions: MuhuratFlowConditionCheck[];
  score: number; // 0..100
  footprintNote: string;
}

export interface MuhuratFlowScanReport {
  status: 'ok';
  scannerName: 'Muhurat Flow Model';
  strategyName: string;
  generatedAt: string;
  istTime: string;
  isMidnightCleared: boolean;
  universeEvaluated: number;
  confirmedBuyCount: number;
  confirmedSellCount: number;
  stopHuntBuyCount: number;
  stopHuntSellCount: number;
  buyCount: number;
  sellCount: number;
  methodologyDisclaimer: string;
  pillars: Array<{
    pillar: string;
    detail: string;
  }>;
  buySignals: MuhuratFlowSignalRow[];
  sellSignals: MuhuratFlowSignalRow[];
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
 * Computes Close Location Value (CLV) in [-1, +1] and bar Delta = volume * CLV.
 * Note: This is an OHLCV intrabar volume-pressure proxy, not exchange L3 trade-aggressor ticks.
 */
export function computeBarClvAndDelta(bar: {
  high: number;
  low: number;
  close: number;
  open: number;
  volume: number;
}): { clv: number; delta: number; lowerWickPct: number; upperWickPct: number; bodyPct: number } {
  const range = bar.high - bar.low;
  if (range <= 0) {
    const sign = bar.close > bar.open ? 0.25 : bar.close < bar.open ? -0.25 : 0;
    return {
      clv: sign,
      delta: Math.round(bar.volume * sign),
      lowerWickPct: 0,
      upperWickPct: 0,
      bodyPct: 0,
    };
  }
  const clv = Math.max(-1, Math.min(1, ((bar.close - bar.low) - (bar.high - bar.close)) / range));
  const bodyTop = Math.max(bar.open, bar.close);
  const bodyBot = Math.min(bar.open, bar.close);
  const lowerWickPct = ((bodyBot - bar.low) / range) * 100;
  const upperWickPct = ((bar.high - bodyTop) / range) * 100;
  const bodyPct = (Math.abs(bar.close - bar.open) / range) * 100;
  return {
    clv: round2(clv),
    delta: Math.round(bar.volume * clv),
    lowerWickPct: round2(lowerWickPct),
    upperWickPct: round2(upperWickPct),
    bodyPct: round2(bodyPct),
  };
}

function classifyCycleBuildup(
  chgPct: number,
  oiChgPct: number
): 'Long Buildup' | 'Short Buildup' | 'Short Covering' | 'Long Unwinding' {
  if (chgPct >= 0 && oiChgPct >= 0) return 'Long Buildup';
  if (chgPct < 0 && oiChgPct >= 0) return 'Short Buildup';
  if (chgPct >= 0 && oiChgPct < 0) return 'Short Covering';
  return 'Long Unwinding';
}

export function evaluateMuhuratFlowSetup(params: {
  symbol: string;
  name: string;
  sector: string;
  sectorChangePct: number;
  bars5m: ClaudeFnoBar[];
  price: number;
  changePercent: number;
  bidAskRatio: number;
  orderBookBias: string;
  oiChangePct: number;
  turnoverCr: number;
  explicitVwap?: number;
  explicitPdh?: number;
  explicitPdl?: number;
}): MuhuratFlowSignalRow | null {
  if (!params.bars5m || params.bars5m.length < 8) return null;

  const latestDate = params.bars5m[params.bars5m.length - 1].dateIST;
  const todayBars = params.bars5m.filter((b) => b.dateIST === latestDate);
  const prevDayBars = params.bars5m.filter((b) => b.dateIST !== latestDate);
  const sessionBars = todayBars.length >= 6 ? todayBars : params.bars5m;
  if (sessionBars.length < 6) return null;

  const pdh = round2(
    prevDayBars.length > 0
      ? Math.max(...prevDayBars.map((b) => b.high))
      : params.explicitPdh || Math.max(...sessionBars.slice(0, 3).map((b) => b.high))
  );
  const pdl = round2(
    prevDayBars.length > 0
      ? Math.min(...prevDayBars.map((b) => b.low))
      : params.explicitPdl || Math.min(...sessionBars.slice(0, 3).map((b) => b.low))
  );
  const orBars = sessionBars.slice(0, Math.min(3, sessionBars.length));
  const orh = round2(Math.max(...orBars.map((b) => b.high)));
  const orl = round2(Math.min(...orBars.map((b) => b.low)));

  // Session cumulative VWAP and CVD series
  let cumTpv = 0;
  let cumVol = 0;
  let cumCvd = 0;
  const cvdSeries: number[] = [];
  const barDeltas: number[] = [];
  const vwapSeries: number[] = [];

  for (const b of sessionBars) {
    const v = Math.max(1, b.volume);
    const tp = (b.high + b.low + b.close) / 3;
    cumTpv += tp * v;
    cumVol += v;
    vwapSeries.push(cumTpv / cumVol);
    const { delta } = computeBarClvAndDelta(b);
    barDeltas.push(delta);
    cumCvd += delta;
    cvdSeries.push(cumCvd);
  }

  const lastIdx = sessionBars.length - 1;
  const latestBar = sessionBars[lastIdx];
  const prevBar = sessionBars[lastIdx - 1];
  const vwap = round2(params.explicitVwap && params.explicitVwap > 0 ? params.explicitVwap : vwapSeries[lastIdx]);
  const livePrice = round2(params.price > 0 ? params.price : latestBar.close);

  const atr14 = Math.max(0.05, computeAtr(params.bars5m, 14));
  const rawRvol = computeRvolFromBars(params.bars5m);

  // Forming-bar aware volume smoothing
  const priorSessionVol = sessionBars.slice(0, lastIdx).reduce((acc, b) => acc + b.volume, 0);
  const meanSessionVol = lastIdx > 0 ? priorSessionVol / lastIdx : latestBar.volume;
  const isFormingBar =
    prevBar && prevBar.volume > 100 && latestBar.volume < prevBar.volume * 0.45;
  const effLatestVol = isFormingBar
    ? Math.max(latestBar.volume, Math.round(prevBar.volume * 0.85))
    : latestBar.volume;
  const barVolRatio = round2(meanSessionVol > 0 ? effLatestVol / meanSessionVol : 1);
  const rvol = round2(isFormingBar && rawRvol < 0.5 ? Math.max(rawRvol, barVolRatio) : rawRvol);

  const latestCompletedIdx = isFormingBar ? lastIdx - 1 : lastIdx;
  const confirmBar = sessionBars[Math.max(1, latestCompletedIdx)];
  const confirmMetrics = computeBarClvAndDelta(confirmBar);

  // Scan recent 6 completed bars (up to confirmIdx) for Liquidity Sweep / Stop-Hunt or Heavy Absorption
  const sweepWindowStart = Math.max(3, latestCompletedIdx - 6);
  const refWindowEnd = Math.max(3, sweepWindowStart);
  const priorSwingSlice = sessionBars.slice(Math.max(0, refWindowEnd - 12), refWindowEnd);
  const recentSwingLow = priorSwingSlice.length > 0 ? Math.min(...priorSwingSlice.map((b) => b.low)) : orl;
  const recentSwingHigh = priorSwingSlice.length > 0 ? Math.max(...priorSwingSlice.map((b) => b.high)) : orh;

  interface DetectedSweep {
    side: 'BUY' | 'SELL';
    sweepType: MuhuratSweepType;
    barIdx: number;
    timeIST: string;
    sweptLevelPrice: number;
    sweptLevelName: string;
    sweepExtreme: number;
    wickPct: number;
    volRatio: number;
    barValCr: number;
  }

  let bestBuySweep: DetectedSweep | null = null;
  let bestSellSweep: DetectedSweep | null = null;

  for (let i = sweepWindowStart; i <= latestCompletedIdx; i++) {
    const b = sessionBars[i];
    const m = computeBarClvAndDelta(b);
    const vRatio = meanSessionVol > 0 ? b.volume / meanSessionVol : 1;
    const valCr = round2((b.close * b.volume) / 1e7);

    // Local swing extremes prior to bar i within today's session
    const localPrior = sessionBars.slice(Math.max(0, i - 10), i);
    const localLow = localPrior.length > 0 ? Math.min(...localPrior.map((x) => x.low)) : recentSwingLow;
    const localHigh = localPrior.length > 0 ? Math.max(...localPrior.map((x) => x.high)) : recentSwingHigh;
    const bullLevels = [
      { name: 'Recent Swing Low', val: localLow },
      { name: 'Opening Range Low', val: orl },
      { name: 'Prev Day Low', val: pdl },
      { name: 'Session VWAP', val: round2(vwapSeries[i] || vwap) },
    ];
    const bearLevels = [
      { name: 'Recent Swing High', val: localHigh },
      { name: 'Opening Range High', val: orh },
      { name: 'Prev Day High', val: pdh },
      { name: 'Session VWAP', val: round2(vwapSeries[i] || vwap) },
    ];

    // Check SSL Stop-Hunt & Reclaim (BUY)
    for (const lvl of bullLevels) {
      if (lvl.val > 0 && b.low < lvl.val && b.close > lvl.val && vRatio >= 1.25) {
        if (!bestBuySweep || vRatio > bestBuySweep.volRatio) {
          bestBuySweep = {
            side: 'BUY',
            sweepType: 'SSL_STOP_HUNT_RECLAIM',
            barIdx: i,
            timeIST: b.timeIST,
            sweptLevelPrice: round2(lvl.val),
            sweptLevelName: lvl.name,
            sweepExtreme: round2(b.low),
            wickPct: m.lowerWickPct,
            volRatio: round2(vRatio),
            barValCr: valCr,
          };
        }
        break;
      }
    }

    // Check Institutional Demand Absorption (high-vol lower-wick / strong reclaim bar)
    if (!bestBuySweep && vRatio >= 1.4 && (m.lowerWickPct >= 34 || (m.clv >= 0.45 && b.close > (vwapSeries[i] || vwap)))) {
      bestBuySweep = {
        side: 'BUY',
        sweepType: 'DEMAND_ABSORPTION',
        barIdx: i,
        timeIST: b.timeIST,
        sweptLevelPrice: round2(localLow),
        sweptLevelName: 'Intraday Value Zone',
        sweepExtreme: round2(b.low),
        wickPct: m.lowerWickPct,
        volRatio: round2(vRatio),
        barValCr: valCr,
      };
    }

    // Check BSL Stop-Hunt & Rejection (SELL)
    for (const lvl of bearLevels) {
      if (lvl.val > 0 && b.high > lvl.val && b.close < lvl.val && vRatio >= 1.25) {
        if (!bestSellSweep || vRatio > bestSellSweep.volRatio) {
          bestSellSweep = {
            side: 'SELL',
            sweepType: 'BSL_STOP_HUNT_REJECT',
            barIdx: i,
            timeIST: b.timeIST,
            sweptLevelPrice: round2(lvl.val),
            sweptLevelName: lvl.name,
            sweepExtreme: round2(b.high),
            wickPct: m.upperWickPct,
            volRatio: round2(vRatio),
            barValCr: valCr,
          };
        }
        break;
      }
    }

    // Check Institutional Supply Absorption (high-vol upper-wick / strong distribution bar)
    if (!bestSellSweep && vRatio >= 1.4 && (m.upperWickPct >= 34 || (m.clv <= -0.45 && b.close < (vwapSeries[i] || vwap)))) {
      bestSellSweep = {
        side: 'SELL',
        sweepType: 'SUPPLY_ABSORPTION',
        barIdx: i,
        timeIST: b.timeIST,
        sweptLevelPrice: round2(localHigh),
        sweptLevelName: 'Intraday Supply Zone',
        sweepExtreme: round2(b.high),
        wickPct: m.upperWickPct,
        volRatio: round2(vRatio),
        barValCr: valCr,
      };
    }
  }

  // CVD Slope over last 3 bars and CVD Divergence detection
  const cvdNow = cvdSeries[latestCompletedIdx];
  const cvd3Ago = cvdSeries[Math.max(0, latestCompletedIdx - 3)];
  const cvdSlope3 = Math.round(cvdNow - cvd3Ago);
  const priceNow = confirmBar.close;
  const price3Ago = sessionBars[Math.max(0, latestCompletedIdx - 3)].close;

  const bullCvdDivergence = priceNow <= price3Ago && cvdSlope3 > 0;
  const bearCvdDivergence = priceNow >= price3Ago && cvdSlope3 < 0;

  // Choose dominant directional candidate based on live flow, sweep, VWAP, CVD & price change
  const buyBiasScore =
    (bestBuySweep ? (bestBuySweep.sweepType === 'SSL_STOP_HUNT_RECLAIM' ? 3 : 2) : 0) +
    (livePrice >= vwap ? 2 : 0) +
    (cvdSlope3 > 0 || cvdNow > 0 ? 2 : 0) +
    (params.changePercent >= 0 ? 1 : 0) +
    (params.bidAskRatio >= 1.15 ? 1 : 0);

  const sellBiasScore =
    (bestSellSweep ? (bestSellSweep.sweepType === 'BSL_STOP_HUNT_REJECT' ? 3 : 2) : 0) +
    (livePrice < vwap ? 2 : 0) +
    (cvdSlope3 < 0 || cvdNow < 0 ? 2 : 0) +
    (params.changePercent < 0 ? 1 : 0) +
    (params.bidAskRatio <= 0.88 ? 1 : 0);

  const direction: 'BUY' | 'SELL' = buyBiasScore >= sellBiasScore ? 'BUY' : 'SELL';
  const activeSweep = direction === 'BUY' ? bestBuySweep : bestSellSweep;

  const sweepType: MuhuratSweepType = activeSweep
    ? activeSweep.sweepType
    : 'ORDER_FLOW_CONTINUATION';

  const sweepLabel =
    sweepType === 'SSL_STOP_HUNT_RECLAIM'
      ? `SSL Stop-Hunt & Reclaim (${activeSweep?.sweptLevelName})`
      : sweepType === 'BSL_STOP_HUNT_REJECT'
        ? `BSL Stop-Hunt & Rejection (${activeSweep?.sweptLevelName})`
        : sweepType === 'DEMAND_ABSORPTION'
          ? 'Institutional Demand Absorption'
          : sweepType === 'SUPPLY_ABSORPTION'
            ? 'Institutional Supply Absorption'
            : direction === 'BUY'
              ? 'Aggressive Buyer Flow Continuation'
              : 'Aggressive Seller Flow Continuation';

  const sweepExtreme =
    activeSweep?.sweepExtreme ??
    (direction === 'BUY'
      ? round2(Math.min(confirmBar.low, prevBar?.low ?? confirmBar.low))
      : round2(Math.max(confirmBar.high, prevBar?.high ?? confirmBar.high)));

  const vsVwapPct = vwap > 0 ? round2(((livePrice - vwap) / vwap) * 100) : 0;
  const vsVwapAtr = round2((livePrice - vwap) / atr14);
  const confirmRange = confirmBar.high - confirmBar.low;
  const candleAtrMultiple = round2(confirmRange / atr14);

  // Anti-Chase + Post-Sweep Confirmation Rule:
  // 1) Do NOT chase a giant climax bar (> 2.4x ATR14) far away from VWAP (> 2.3x ATR14).
  // 2) Confirmation close must follow or hold the sweep bar with directional close location (CLV).
  const isOverextendedSpike = candleAtrMultiple > 2.4 && Math.abs(vsVwapAtr) > 2.0;
  const isTooFarFromVwap = direction === 'BUY' ? vsVwapAtr > 2.5 : vsVwapAtr < -2.5;
  const antiChasePassed = !isOverextendedSpike && !isTooFarFromVwap;

  const confirmFollowsSweep = activeSweep
    ? (latestCompletedIdx > activeSweep.barIdx
        ? direction === 'BUY'
          ? confirmBar.close >= sessionBars[activeSweep.barIdx].close && confirmMetrics.clv >= 0.1
          : confirmBar.close <= sessionBars[activeSweep.barIdx].close && confirmMetrics.clv <= -0.1
        : direction === 'BUY'
          ? confirmMetrics.clv >= 0.35
          : confirmMetrics.clv <= -0.35)
    : false;

  const postSweepConfirmed = Boolean(activeSweep) && confirmFollowsSweep && antiChasePassed;

  const cycleBuildup = classifyCycleBuildup(params.changePercent, params.oiChangePct);
  const oiBullAligned =
    (params.changePercent >= 0.3 && params.oiChangePct >= 0.8) ||
    cycleBuildup === 'Short Covering';
  const oiBearAligned =
    (params.changePercent <= -0.3 && params.oiChangePct >= 0.8) ||
    cycleBuildup === 'Long Unwinding';
  const baAligned =
    direction === 'BUY' ? params.bidAskRatio >= 1.1 : params.bidAskRatio <= 0.92;

  const recentPeakBarVolRatio = activeSweep ? Math.max(barVolRatio, activeSweep.volRatio) : barVolRatio;
  const barValueCr = round2(
    Math.max((confirmBar.close * confirmBar.volume) / 1e7, activeSweep?.barValCr || 0)
  );

  // 6 Institutional Order Flow Gates
  const g1Vwap = direction === 'BUY' ? livePrice > vwap : livePrice < vwap;
  const g2Volume = rvol >= 1.25 || recentPeakBarVolRatio >= 1.45;
  const g3Sweep = Boolean(activeSweep);
  const g4Cvd =
    direction === 'BUY'
      ? cvdSlope3 > 0 || (cvdNow > 0 && confirmMetrics.clv >= 0.15) || bullCvdDivergence
      : cvdSlope3 < 0 || (cvdNow < 0 && confirmMetrics.clv <= -0.15) || bearCvdDivergence;
  const g5OiBook =
    direction === 'BUY'
      ? (oiBullAligned || baAligned) && params.bidAskRatio >= 0.85
      : (oiBearAligned || baAligned) && params.bidAskRatio <= 1.18;
  const g6PostConfirm = postSweepConfirmed;

  const conditions: MuhuratFlowConditionCheck[] = [
    {
      step: 1,
      label: 'VWAP Institutional Anchor',
      passed: g1Vwap,
      detail: `LTP ₹${livePrice} vs VWAP ₹${vwap} (${vsVwapPct >= 0 ? '+' : ''}${vsVwapPct}% | ${vsVwapAtr} ATR)`,
    },
    {
      step: 2,
      label: 'Institutional Volume & Block Footprint',
      passed: g2Volume,
      detail: `RVOL ${rvol}x • Peak Bar ${round2(recentPeakBarVolRatio)}x • ₹${barValueCr} Cr bar`,
    },
    {
      step: 3,
      label: 'Liquidity Sweep / Stop-Hunt / Absorption',
      passed: g3Sweep,
      detail: activeSweep
        ? `${sweepType} @ ₹${activeSweep.sweptLevelPrice} (${activeSweep.timeIST}, Wick ${activeSweep.wickPct}%)`
        : 'No verified liquidity sweep in last 6 bars',
    },
    {
      step: 4,
      label: 'Cumulative Volume Delta (CVD) Flow',
      passed: g4Cvd,
      detail: `CVD ${cumCvd >= 0 ? '+' : ''}${cumCvd.toLocaleString('en-IN')} • 3-Bar Slope ${cvdSlope3 >= 0 ? '+' : ''}${cvdSlope3.toLocaleString('en-IN')}${bullCvdDivergence || bearCvdDivergence ? ' (Div)' : ''}`,
    },
    {
      step: 5,
      label: 'OI Buildup & Order Book Imbalance',
      passed: g5OiBook,
      detail: `${cycleBuildup} (OI ${params.oiChangePct >= 0 ? '+' : ''}${round2(params.oiChangePct)}%) • B/A ${round2(params.bidAskRatio)}x`,
    },
    {
      step: 6,
      label: 'Post-Sweep Confirmation (Anti-Chase)',
      passed: g6PostConfirm,
      detail: antiChasePassed
        ? (confirmFollowsSweep ? `Confirmed @ ${confirmBar.timeIST} (${candleAtrMultiple}x ATR, CLV ${confirmMetrics.clv})` : 'Awaiting post-sweep confirmation close')
        : `Blocked Chase (${candleAtrMultiple}x ATR, ${vsVwapAtr} ATR from VWAP)`,
    },
  ];

  // 100-Point Institutional Order Flow Scoring Model
  const sVwap = g1Vwap ? (Math.abs(vsVwapAtr) <= 1.5 ? 15 : 10) : 0;
  const sVol =
    rvol >= 2.0 || recentPeakBarVolRatio >= 2.2
      ? 20
      : rvol >= 1.5 || recentPeakBarVolRatio >= 1.65
        ? 16
        : g2Volume
          ? 12
          : 4;
  const sSweep =
    activeSweep?.sweepType === 'SSL_STOP_HUNT_RECLAIM' ||
    activeSweep?.sweepType === 'BSL_STOP_HUNT_REJECT'
      ? 25
      : activeSweep
        ? 18
        : 0;
  const sCvd = g4Cvd
    ? (bullCvdDivergence || bearCvdDivergence ? 20 : (direction === 'BUY' ? cvdNow > 0 && cvdSlope3 > 0 : cvdNow < 0 && cvdSlope3 < 0) ? 18 : 14)
    : 3;
  const sOi =
    (direction === 'BUY' ? oiBullAligned : oiBearAligned) && baAligned
      ? 10
      : g5OiBook
        ? 7
        : 2;
  const sConfirm = g6PostConfirm ? 10 : antiChasePassed ? 4 : 0;

  const totalScore = Math.min(100, sVwap + sVol + sSweep + sCvd + sOi + sConfirm);
  const conditionsMet = conditions.filter((c) => c.passed).length;
  const allSixMet = conditionsMet === 6;

  // Entry, Stop-Loss (beyond sweep extreme ± 0.15*ATR14) & T1 (1R) / T2 (2R) / T3 (3R)
  const entryPrice = round2(confirmBar.close);
  const rawRiskMin = Math.max(atr14 * 0.45, entryPrice * 0.0025);
  const stopLoss =
    direction === 'BUY'
      ? round2(Math.min(sweepExtreme - atr14 * 0.15, entryPrice - rawRiskMin))
      : round2(Math.max(sweepExtreme + atr14 * 0.15, entryPrice + rawRiskMin));
  const riskR = round2(Math.max(0.05, Math.abs(entryPrice - stopLoss)));
  const target1 = round2(direction === 'BUY' ? entryPrice + riskR * 1 : Math.max(0.05, entryPrice - riskR * 1));
  const target2 = round2(direction === 'BUY' ? entryPrice + riskR * 2 : Math.max(0.05, entryPrice - riskR * 2));
  const target3 = round2(direction === 'BUY' ? entryPrice + riskR * 3 : Math.max(0.05, entryPrice - riskR * 3));

  const cvdBias: MuhuratFlowSignalRow['cvdBias'] =
    (direction === 'BUY' && bullCvdDivergence) || (direction === 'SELL' && bearCvdDivergence)
      ? 'DIVERGENT_ABSORPTION'
      : cumCvd > 0 && cvdSlope3 > 0
        ? 'ACCUMULATION'
        : cumCvd < 0 && cvdSlope3 < 0
          ? 'DISTRIBUTION'
          : 'NEUTRAL';

  const grade: MuhuratFlowSignalRow['grade'] = allSixMet
    ? '6/6 CONFIRMED'
    : totalScore >= 75
      ? 'STRONG FLOW'
      : 'WATCHLIST';

  const classification: MuhuratFlowSignalRow['classification'] =
    allSixMet && totalScore >= 85
      ? direction === 'BUY'
        ? 'Strong BUY'
        : 'Strong SELL'
      : totalScore >= 70
        ? 'Good Opportunity'
        : 'Watchlist';

  return {
    symbol: params.symbol,
    name: params.name,
    sector: params.sector,
    sectorChangePct: round2(params.sectorChangePct),
    direction,
    grade,
    classification,
    sweepType,
    sweepLabel,
    allSixMet,
    conditionsMet,
    totalConditions: 6,
    listedAt: confirmBar.timeIST,
    sweepTimeIST: activeSweep?.timeIST || confirmBar.timeIST,
    confirmationTimeIST: confirmBar.timeIST,
    price: livePrice,
    entryPrice,
    stopLoss,
    target1,
    target2,
    target3,
    riskR,
    rrRatio: '1 : 2.0 / 3.0',
    atr14: round2(atr14),
    changePercent: round2(params.changePercent),
    vwap,
    vsVwapPct,
    vsVwapAtr,
    pdh,
    pdl,
    orh,
    orl,
    sweptLevelPrice: activeSweep?.sweptLevelPrice || vwap,
    sweptLevelName: activeSweep?.sweptLevelName || 'Session VWAP',
    wickAbsorptionPct: activeSweep?.wickPct || (direction === 'BUY' ? confirmMetrics.lowerWickPct : confirmMetrics.upperWickPct),
    barValueCr,
    turnoverCr: round2(params.turnoverCr),
    rvol,
    barVolRatio: round2(recentPeakBarVolRatio),
    sessionCvd: Math.round(cumCvd),
    cvdSlope3,
    cvdBias,
    cvdDivergenceDetected: bullCvdDivergence || bearCvdDivergence,
    clvPct: round2(((confirmMetrics.clv + 1) / 2) * 100),
    antiChasePassed,
    candleAtrMultiple,
    confirmCandleBodyPct: confirmMetrics.bodyPct,
    postSweepConfirmed,
    bidAskRatio: round2(params.bidAskRatio),
    orderBookBias: params.orderBookBias,
    oiChangePct: round2(params.oiChangePct),
    cycleBuildup,
    scoreBreakdown: {
      vwapAnchor: sVwap,
      institutionalVolume: sVol,
      liquiditySweepAndAbsorption: sSweep,
      cvdOrderFlow: sCvd,
      oiAndOrderBook: sOi,
      postSweepConfirmation: sConfirm,
      total: totalScore,
    },
    conditions,
    score: totalScore,
    footprintNote:
      'Probable institutional-style order-flow footprint inferred from OHLCV volume spikes, liquidity sweeps, intrabar CLV-CVD proxy, OI buildup & VWAP (no participant identity exposed by NSE exchange OHLCV).',
  };
}

export function buildMuhuratFlowReport(params: {
  stocks: ScannedStock[];
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined;
  candlesMap: Map<string, Candle[]>;
  isMidnightCleared?: boolean;
}): MuhuratFlowScanReport {
  const ist = getISTDateParts();
  const methodologyDisclaimer =
    'NSE OHLCV & L1 feeds do not disclose broker or institutional participant IDs. This engine detects probable institutional-style activity—liquidity stop-hunts, wick absorption, abnormal RVOL blocks, intrabar CLV-weighted CVD, OI buildup & VWAP confluence—and waits for post-sweep confirmation rather than chasing extended candles.';

  const pillars = [
    { pillar: '1. Liquidity Sweep & Stop-Hunt', detail: 'Wick sweeps beyond PDH/PDL, ORH/ORL or Swing High/Low followed by immediate reclaim/rejection close.' },
    { pillar: '2. Institutional Volume & Block Footprint', detail: '5m RVOL ≥ 1.25x–1.5x+ or bar volume spike ≥ 1.45x mean with meaningful ₹ Cr turnover.' },
    { pillar: '3. Cumulative Volume Delta (CVD)', detail: 'Session CLV-weighted delta slope & divergence catching hidden absorption before price expands.' },
    { pillar: '4. Open Interest + Order Book', detail: 'Long/Short Buildup or Short Covering/Unwinding + Bid/Ask imbalance confluence.' },
    { pillar: '5. VWAP Institutional Anchor', detail: 'Entries aligned with Session VWAP value zone and SL anchored behind the swept extreme ± 0.15×ATR(14).' },
    { pillar: '6. Post-Sweep Anti-Chase Gate', detail: 'Enters only on post-sweep confirmation close; blocks chasing climax bars (>2.4×ATR14) far from VWAP.' },
  ];

  if (params.isMidnightCleared) {
    return {
      status: 'ok',
      scannerName: 'Muhurat Flow Model',
      strategyName: 'Complete Institutional Order Flow + Whale Sweep Strategy',
      generatedAt: new Date().toISOString(),
      istTime: `${ist.timeStr} IST`,
      isMidnightCleared: true,
      universeEvaluated: 0,
      confirmedBuyCount: 0,
      confirmedSellCount: 0,
      stopHuntBuyCount: 0,
      stopHuntSellCount: 0,
      buyCount: 0,
      sellCount: 0,
      methodologyDisclaimer,
      pillars,
      buySignals: [],
      sellSignals: [],
    };
  }

  // Compute sector averages
  const secBuckets = new Map<string, { sum: number; count: number }>();
  for (const s of params.stocks) {
    const sym = String(s.symbol || '').toUpperCase();
    if (INDEX_BLACKLIST.has(sym)) continue;
    const sec = s.sector || 'NSE F&O';
    const b = secBuckets.get(sec) || { sum: 0, count: 0 };
    b.sum += Number(s.changePercent) || 0;
    b.count += 1;
    secBuckets.set(sec, b);
  }
  const secAvg = new Map<string, number>();
  for (const [sec, b] of secBuckets) {
    secAvg.set(sec, b.count > 0 ? round2(b.sum / b.count) : 0);
  }

  const allBuy: MuhuratFlowSignalRow[] = [];
  const allSell: MuhuratFlowSignalRow[] = [];
  let evaluatedCount = 0;

  for (const s of params.stocks) {
    const sym = String(s.symbol || '').toUpperCase();
    if (INDEX_BLACKLIST.has(sym)) continue;
    const ext = params.getExtendedBarsFn(s.symbol);
    const bars5m = normalize5mBars(ext && ext.length >= 8 ? ext : params.candlesMap.get(s.symbol));
    if (bars5m.length < 8) continue;

    evaluatedCount++;
    const rawVol = Number(s.volume) || bars5m.reduce((acc, b) => acc + b.volume, 0);
    const turnCr = s.price > 0 && rawVol > 0 ? (rawVol * s.price) / 1e7 : Number((s as any).tradedValueCr || 0);

    const row = evaluateMuhuratFlowSetup({
      symbol: s.symbol,
      name: s.name || s.symbol,
      sector: s.sector || 'NSE F&O',
      sectorChangePct: secAvg.get(s.sector || 'NSE F&O') ?? 0,
      bars5m,
      price: Number(s.price) || bars5m[bars5m.length - 1].close,
      changePercent: Number(s.changePercent) || 0,
      bidAskRatio: Number(s.bidAskRatio) || 1.0,
      orderBookBias: s.orderBookBias || 'Balanced Order Book',
      oiChangePct: Number(s.oiData?.changeInOIPercent) || 0,
      turnoverCr: turnCr,
      explicitVwap: Number((s as any).fyersData?.atp || (s as any).indicators?.vwap) || undefined,
      explicitPdh: Number((s as any).indicators?.pdh) || undefined,
      explicitPdl: Number((s as any).indicators?.pdl) || undefined,
    });

    if (!row) continue;
    if (row.allSixMet || row.score >= 65) {
      if (row.direction === 'BUY') allBuy.push(row);
      else allSell.push(row);
    }
  }

  const rankFlowDesc = (a: MuhuratFlowSignalRow, b: MuhuratFlowSignalRow) => {
    if (a.allSixMet !== b.allSixMet) return a.allSixMet ? -1 : 1;
    if (b.score !== a.score) return b.score - a.score;
    return parseClockSec(b.listedAt) - parseClockSec(a.listedAt) || b.rvol - a.rvol;
  };

  allBuy.sort(rankFlowDesc);
  allSell.sort(rankFlowDesc);

  const confirmedBuys = allBuy.filter((r) => r.allSixMet);
  const confirmedSells = allSell.filter((r) => r.allSixMet);

  return {
    status: 'ok',
    scannerName: 'Muhurat Flow Model',
    strategyName: 'Complete Institutional Order Flow + Whale Sweep Strategy',
    generatedAt: new Date().toISOString(),
    istTime: `${ist.timeStr} IST`,
    isMidnightCleared: false,
    universeEvaluated: evaluatedCount,
    confirmedBuyCount: confirmedBuys.length,
    confirmedSellCount: confirmedSells.length,
    stopHuntBuyCount: allBuy.filter((r) => r.sweepType === 'SSL_STOP_HUNT_RECLAIM').length,
    stopHuntSellCount: allSell.filter((r) => r.sweepType === 'BSL_STOP_HUNT_REJECT').length,
    buyCount: allBuy.length,
    sellCount: allSell.length,
    methodologyDisclaimer,
    pillars,
    buySignals: allBuy.slice(0, 30),
    sellSignals: allSell.slice(0, 30),
  };
}
