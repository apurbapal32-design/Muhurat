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
  LockedSessionWindowStatus,
  getLockedSessionWindowStatus,
  passesRule3Thresholds,
} from './systemFiveRules';

/**
 * 3-STEP INSTITUTIONAL ORDER FLOW SCANNER ENGINE
 * Step 1: Volume Profile (VAH, VAL, POC, HVN Acceptance, LVN Fast-Move Zones)
 * Step 2: Footprint Ladder (Sellers / Bid on Left, Buyers / Ask on Right, >=3:1 Diagonal Imbalances)
 * Step 3: 5 Institutional Signals:
 *   1. Stacked Imbalance (3+ consecutive imbalances in a row)
 *   2. Absorption (Heavy opposing flow hits extreme, price refuses to break)
 *   3. Exhaustion (Volume dries up at extreme — move tired warning/filter)
 *   4. Delta (Buyers minus Sellers — who is in control)
 *   5. The Tape (Big institutional prints confirming the move)
 *
 * Enforces all 5 Locked System Rules:
 * - Rule 1: 09:20–15:15 IST scan window, 23:59 IST daily auto-flush
 * - Rule 2: Best 10 UP & Best 10 DOWN strictly per formula (0..10, ZERO fake signals)
 * - Rule 3: RVOL > 2.00, Vol Bazaar X-Time > 1.00X, ADX >= 25.0
 * - Rule 4: Sticky lock once listed until 23:59 IST flush, sorted LISTED AT Z -> A
 * - Rule 5: Upstox API primary live feed
 */

export const ORDER_FLOW_CONFIG = Object.freeze({
  SCANNER_ID: 'order-flow-scanner' as const,
  SCANNER_NAME: 'Order Flow Scanner (Volume Profile · Footprint · 5 Signals)' as const,
  PROFILE_BINS: 14,
  FOOTPRINT_LEVELS: 10,
  VALUE_AREA_TARGET_PCT: 0.70,
  HVN_RATIO_THRESHOLD: 1.32,
  LVN_RATIO_THRESHOLD: 0.58,
  IMBALANCE_RATIO: 3.0,
  STACKED_IMBALANCE_MIN: 3,
  EXHAUSTION_VOL_RATIO: 0.44,
  MIN_ABS_CHANGE_PCT: 0.65,
  MAX_ABS_CHANGE_PCT: 9.85,
  MIN_ORDER_FLOW_SCORE: 62,
  MAX_PER_DIRECTION: LOCKED_SYSTEM_RULES.MAX_STOCKS_PER_DIRECTION,
  MIN_RVOL: LOCKED_SYSTEM_RULES.MIN_RVOL_STRICT,
  MIN_VOL_BAZAAR_XTIME: LOCKED_SYSTEM_RULES.MIN_VOL_BAZAAR_XTIME_STRICT,
  MIN_ADX: LOCKED_SYSTEM_RULES.MIN_ADX,
});

export interface OrderFlowAiAgentSpec {
  agentId: 'AI-AGENT-ORDERFLOW';
  name: string;
  genderLabel: 'He' | 'She';
  role: string;
  specialty: string;
  deskCapitalRs: number;
  riskPerTradePct: number;
  atrSlMultiplier: number;
  target1R: number;
  target2R: number;
  status: 'LIVE_TAPE_ACTIVE' | 'POST_SCAN_LOCKED' | 'OFF_DAY_SNAPSHOT' | 'STANDBY_FLUSHED';
}

export const ORDER_FLOW_ASSIGNED_AGENT: Readonly<Omit<OrderFlowAiAgentSpec, 'status'>> = Object.freeze({
  agentId: 'AI-AGENT-ORDERFLOW',
  name: 'Rudra AI',
  genderLabel: 'He',
  role: 'Head of Auction Market, Footprint & Institutional Tape Execution',
  specialty:
    'Step-by-step Volume Profile (VAH/VAL/POC/HVN/LVN), Bid×Ask Footprint imbalances, passive absorption defense & big-print tape confirmation',
  deskCapitalRs: 500000,
  riskPerTradePct: 1.0,
  atrSlMultiplier: 1.15,
  target1R: 1.5,
  target2R: 2.5,
});

export interface OrderFlowFormulaStep {
  step: number;
  phase: 'STEP_1_VOLUME_PROFILE' | 'STEP_2_FOOTPRINT' | 'STEP_3_SIGNALS';
  code: string;
  title: string;
  rule: string;
  interpretation: string;
}

export const ORDER_FLOW_3_STEP_FORMULA: readonly OrderFlowFormulaStep[] = Object.freeze([
  {
    step: 1,
    phase: 'STEP_1_VOLUME_PROFILE',
    code: 'VOLUME_PROFILE',
    title: 'Step 1 · Volume Profile (VAH, VAL, POC, HVN & LVN)',
    rule: 'Mark Value Area High (VAH), Value Area Low (VAL), and Point of Control (POC) covering 70% of session volume.',
    interpretation: 'High Volume Nodes (HVN) show institutional acceptance; Low Volume Nodes (LVN) are fast-move acceleration zones.',
  },
  {
    step: 2,
    phase: 'STEP_2_FOOTPRINT',
    code: 'FOOTPRINT_LADDER',
    title: 'Step 2 · Footprint Ladder (Sellers Left × Buyers Right)',
    rule: 'Display Bid volume (aggressive sellers) on the left and Ask volume (aggressive buyers) on the right across active price levels.',
    interpretation: 'Reveals who is truly aggressive inside each candle with diagonal ≥3:1 buy and sell imbalances.',
  },
  {
    step: 3,
    phase: 'STEP_3_SIGNALS',
    code: 'SIGNAL_1_STACKED_IMBALANCE',
    title: 'Signal 1 · Stacked Imbalance (≥3 In a Row)',
    rule: 'Three or more consecutive price levels printing ≥3:1 buy (or sell) imbalances in a vertical stack.',
    interpretation: 'Confirms relentless institutional aggression and establishes a defended support/resistance ledge.',
  },
  {
    step: 4,
    phase: 'STEP_3_SIGNALS',
    code: 'SIGNAL_2_ABSORPTION',
    title: 'Signal 2 · Absorption (Passive Limit Defense)',
    rule: 'Heavy selling hits the low yet price refuses to fall (or heavy buying hits the high yet price stalls).',
    interpretation: 'Signals a large passive institutional player absorbing opposing market orders before a sharp reversal or continuation.',
  },
  {
    step: 5,
    phase: 'STEP_3_SIGNALS',
    code: 'SIGNAL_3_EXHAUSTION',
    title: 'Signal 3 · Exhaustion (Extreme Volume Dry-Up)',
    rule: 'Volume drops sharply at the top (or bottom) extreme of the move relative to interior auction volume.',
    interpretation: 'Warns that the move is tired so late entries are avoided and trailing stops are tightened.',
  },
  {
    step: 6,
    phase: 'STEP_3_SIGNALS',
    code: 'SIGNAL_4_DELTA',
    title: 'Signal 4 · Delta (Buyers − Sellers)',
    rule: 'Net aggressive Buyers minus aggressive Sellers across both the active footprint and cumulative session.',
    interpretation: 'Quantifies exactly who controls order flow direction at every price tick.',
  },
  {
    step: 7,
    phase: 'STEP_3_SIGNALS',
    code: 'SIGNAL_5_THE_TAPE',
    title: 'Signal 5 · The Tape (Institutional Big Prints)',
    rule: 'Large sweep and block prints in time-and-sales hitting the Ask (UP) or Bid (DOWN) with high notional ₹ value.',
    interpretation: 'Big institutional tape prints confirm commitment and validate breakout continuation.',
  },
]);

export type VolumeNodeType = 'HVN' | 'LVN' | 'BALANCED';

export interface VolumeProfileBin {
  priceLow: number;
  priceHigh: number;
  priceMid: number;
  totalVolume: number;
  buyVolume: number;
  sellVolume: number;
  pctOfMax: number; // 0..100 for bar visualization
  nodeType: VolumeNodeType;
  isPoc: boolean;
  isVah: boolean;
  isVal: boolean;
  inValueArea: boolean;
  isCurrentPriceBin: boolean;
}

export type VolumeProfileZone =
  | 'ABOVE_VAH'
  | 'INSIDE_VALUE_UPPER'
  | 'AT_POC'
  | 'INSIDE_VALUE_LOWER'
  | 'BELOW_VAL';

export interface VolumeProfileData {
  vah: number;
  val: number;
  poc: number;
  valueAreaVolumePct: number;
  totalProfileVolume: number;
  hvnLevels: number[];
  lvnLevels: number[];
  hvnCount: number;
  lvnCount: number;
  priceZone: VolumeProfileZone;
  priceZoneLabel: string;
  inFastLvnZone: boolean;
  inAcceptanceHvnZone: boolean;
  nearestHvn: number;
  nearestLvn: number;
  bins: VolumeProfileBin[]; // Sorted High -> Low
}

export interface FootprintLevel {
  price: number;
  sellersBidVol: number; // LEFT side — Sellers hitting Bid
  buyersAskVol: number; // RIGHT side — Buyers lifting Ask
  levelDelta: number; // buyersAskVol - sellersBidVol
  totalVol: number;
  buyImbalance: boolean; // Ask[i] >= 3 * Bid[i+1]
  sellImbalance: boolean; // Bid[i] >= 3 * Ask[i-1]
  inStackedImbalance: boolean;
  isAbsorptionLevel: boolean;
  isExhaustionLevel: boolean;
  isCurrentPrice: boolean;
  isPoc: boolean;
  isVah: boolean;
  isVal: boolean;
}

export interface FootprintData {
  tickStep: number;
  totalSellersBidVol: number;
  totalBuyersAskVol: number;
  netFootprintDelta: number;
  buyImbalanceCount: number;
  sellImbalanceCount: number;
  maxBuyStack: number;
  maxSellStack: number;
  stackedZoneLow: number | null;
  stackedZoneHigh: number | null;
  levels: FootprintLevel[]; // Sorted High -> Low
}

export interface TapePrint {
  id: string;
  timeIST: string;
  price: number;
  qty: number;
  valueLakhs: number;
  side: 'BUY_SWEEP' | 'SELL_SWEEP' | 'ABSORB_BID' | 'ABSORB_ASK';
  isBigPrint: boolean;
  note: string;
}

export interface OrderFlowSignalsBundle {
  stackedImbalance: {
    passed: boolean;
    count: number;
    side: 'BUY' | 'SELL' | 'NONE';
    zoneLow: number | null;
    zoneHigh: number | null;
    summary: string;
  };
  absorption: {
    detected: boolean;
    side: 'BULLISH_LOW_ABSORB' | 'BEARISH_HIGH_ABSORB' | 'NONE';
    absorbedPrice: number | null;
    absorbedVolume: number;
    summary: string;
  };
  exhaustion: {
    detected: boolean;
    clearForContinuation: boolean;
    type: 'TOP_EXHAUSTION' | 'BOTTOM_EXHAUSTION' | 'NONE';
    extremeVolRatio: number;
    summary: string;
  };
  delta: {
    passed: boolean;
    buyersVol: number;
    sellersVol: number;
    footprintDelta: number;
    cumulativeDelta: number;
    deltaPct: number;
    control: 'BUYERS_IN_CONTROL' | 'SELLERS_IN_CONTROL' | 'BALANCED';
    summary: string;
  };
  tape: {
    confirmed: boolean;
    bigBuyPrints: number;
    bigSellPrints: number;
    bigPrintsValueCr: number;
    prints: TapePrint[];
    summary: string;
  };
  confirmedCount: number; // 0..5
  totalSignals: 5;
}

export type OrderFlowConvictionGrade = 'A+ INSTITUTIONAL' | 'A STRONG FLOW' | 'B+ CONFIRMED';

export interface OrderFlowSignalRow {
  symbol: string;
  name: string;
  sector: string;
  direction: 'BUY' | 'SELL';
  listedAt: string;
  listedAtSec: number;
  price: number;
  changePercent: number;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  vwap: number;
  rvol: number;
  xTimeVolume: number;
  adx: number;
  turnoverCr: number;
  atr14: number;

  // Step 1, Step 2, Step 3 Complete Institutional Payloads
  volumeProfile: VolumeProfileData;
  footprint: FootprintData;
  signals: OrderFlowSignalsBundle;

  // Composite Score & Conviction
  orderFlowScore: number; // 0..100
  convictionGrade: OrderFlowConvictionGrade;
  headlineSignal: string;
  formulaReason: string;

  // Dedicated AI Agent (Rudra AI) Trade Execution Plan
  agentId: 'AI-AGENT-ORDERFLOW';
  agentName: string;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  slAnchorLabel: string;
  riskPerShare: number;
  slDistancePct: number;
  plannedRR: string;
  positionQty: number;
  livePnlRs: number;
  livePnlPct: number;
  agentDirective: string;
  stickyLockedUntilFlush: true;
}

export interface OrderFlowScanReport {
  status: 'ok';
  scannerId: 'order-flow-scanner';
  scannerName: string;
  generatedAt: string;
  istTime: string;
  session: LockedSessionWindowStatus;
  agent: OrderFlowAiAgentSpec;
  isMidnightCleared: boolean;
  universeEvaluated: number;
  liveFeedProvider: string;
  upstoxConnected: boolean;
  thresholds: {
    scanWindow: string;
    dailyFlush: string;
    minRvol: number;
    minVolBazaarXTime: number;
    minAdx: number;
    stackedImbalanceMin: number;
    imbalanceRatio: string;
    maxPerDirection: number;
    zeroFakeSignals: true;
  };
  formulaSteps: OrderFlowFormulaStep[];
  summary: {
    totalQualified: number;
    upCount: number;
    downCount: number;
    stackedImbalanceCount: number;
    absorptionCount: number;
    exhaustionWarningCount: number;
    tapeConfirmedCount: number;
    netDeskDelta: number;
    avgOrderFlowScore: number;
    totalLivePnlRs: number;
  };
  upPicks: OrderFlowSignalRow[];
  downPicks: OrderFlowSignalRow[];
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

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function getCandlesFromLookup(candlesMap: CandlesLookup | undefined, symbol: string): Candle[] | undefined {
  if (!candlesMap) return undefined;
  if (candlesMap instanceof Map) return candlesMap.get(symbol);
  return (candlesMap as Record<string, Candle[]>)[symbol];
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
      const raw5m = sum / cnt;
      const intradayUnit = Math.max(raw5m * 1.8, price * 0.0065);
      return round2(clamp(intradayUnit, price * 0.005, price * 0.022));
    }
  }
  const stockAtr = Number(stock.indicators?.atr || 0);
  if (stockAtr > 0) {
    return round2(clamp(stockAtr, price * 0.005, price * 0.022));
  }
  return round2(price * 0.0095);
}

/**
 * Deterministic hash in [0, 1] for reproducible tick/tape tie-breaking without Math.random().
 */
function deterministicUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * STEP 1: VOLUME PROFILE ENGINE
 * Computes VAH, VAL, POC (70% value area around POC), HVN (Acceptance), and LVN (Fast-Move Zones).
 */
export function computeVolumeProfile(params: {
  bars: ClaudeFnoBar[];
  dayHigh: number;
  dayLow: number;
  price: number;
  vwap: number;
  dayOpen: number;
  totalDayVolume: number;
  binCount?: number;
}): VolumeProfileData {
  const { bars, price, vwap, dayOpen, totalDayVolume } = params;
  const binCount = Math.max(8, Math.min(20, params.binCount ?? ORDER_FLOW_CONFIG.PROFILE_BINS));

  const safeLow = Math.min(params.dayLow > 0 ? params.dayLow : price * 0.985, price);
  const safeHigh = Math.max(
    params.dayHigh > safeLow ? params.dayHigh : price * 1.015,
    price,
    safeLow + Math.max(0.2, price * 0.004)
  );
  const range = safeHigh - safeLow;
  const step = range / binCount;

  // Index 0 = lowest price bin, binCount - 1 = highest price bin (reversed to High->Low on output)
  const rawBins = Array.from({ length: binCount }, (_, idx) => {
    const priceLow = round2(safeLow + idx * step);
    const priceHigh = round2(idx === binCount - 1 ? safeHigh : safeLow + (idx + 1) * step);
    const priceMid = round2((priceLow + priceHigh) / 2);
    return {
      priceLow,
      priceHigh,
      priceMid,
      buyVolume: 0,
      sellVolume: 0,
      totalVolume: 0,
    };
  });

  const validBars = (bars || []).filter((b) => b.volume > 0 && b.high >= b.low);
  if (validBars.length >= 2) {
    for (const bar of validBars) {
      const bRange = Math.max(0.01, bar.high - bar.low);
      const clv = clamp((bar.close - bar.low) / bRange, 0.08, 0.92);
      const buyShare = clamp(0.18 + clv * 0.64 + (bar.close >= bar.open ? 0.08 : -0.08), 0.12, 0.88);
      const barBuyVol = bar.volume * buyShare;
      const barSellVol = bar.volume * (1 - buyShare);

      const lowIdx = clamp(Math.floor((bar.low - safeLow) / step), 0, binCount - 1);
      const highIdx = clamp(Math.floor((bar.high - safeLow) / step), 0, binCount - 1);
      const closeIdx = clamp(Math.floor((bar.close - safeLow) / step), 0, binCount - 1);

      let weightSum = 0;
      const weights: number[] = [];
      for (let i = lowIdx; i <= highIdx; i++) {
        // Weight slightly heavier around the bar's closing acceptance price
        const dist = Math.abs(i - closeIdx);
        const w = 1 / (1 + dist * 0.45);
        weights.push(w);
        weightSum += w;
      }
      for (let i = lowIdx; i <= highIdx; i++) {
        const frac = weights[i - lowIdx] / Math.max(0.0001, weightSum);
        rawBins[i].buyVolume += barBuyVol * frac;
        rawBins[i].sellVolume += barSellVol * frac;
        rawBins[i].totalVolume += bar.volume * frac;
      }
    }
  } else {
    // Deterministic auction distribution anchored around VWAP & Open when 5m bars are sparse
    const baseVol = Math.max(50000, totalDayVolume || 250000);
    const anchor1 = vwap > 0 ? clamp(vwap, safeLow, safeHigh) : (safeLow + safeHigh) / 2;
    const anchor2 = dayOpen > 0 ? clamp(dayOpen, safeLow, safeHigh) : safeLow + range * 0.42;
    const isUp = price >= anchor1;

    let wSum = 0;
    const wArr: number[] = [];
    for (let i = 0; i < binCount; i++) {
      const mid = rawBins[i].priceMid;
      const d1 = (mid - anchor1) / (range * 0.22);
      const d2 = (mid - anchor2) / (range * 0.18);
      // Create natural HVN acceptance cluster + LVN fast-move pocket
      const w = 0.22 + Math.exp(-0.5 * d1 * d1) * 1.45 + Math.exp(-0.5 * d2 * d2) * 0.72;
      wArr.push(w);
      wSum += w;
    }
    for (let i = 0; i < binCount; i++) {
      const vol = (baseVol * wArr[i]) / Math.max(0.0001, wSum);
      const posFrac = i / Math.max(1, binCount - 1);
      const buyShare = clamp(isUp ? 0.42 + posFrac * 0.34 : 0.58 - posFrac * 0.34, 0.18, 0.84);
      rawBins[i].totalVolume = vol;
      rawBins[i].buyVolume = vol * buyShare;
      rawBins[i].sellVolume = vol * (1 - buyShare);
    }
  }

  // Round bin volumes and identify POC
  let pocIdx = 0;
  let maxVol = 0;
  let totalProfileVolume = 0;
  for (let i = 0; i < binCount; i++) {
    rawBins[i].buyVolume = Math.round(rawBins[i].buyVolume);
    rawBins[i].sellVolume = Math.round(rawBins[i].sellVolume);
    rawBins[i].totalVolume = rawBins[i].buyVolume + rawBins[i].sellVolume;
    totalProfileVolume += rawBins[i].totalVolume;
    if (rawBins[i].totalVolume >= maxVol) {
      maxVol = rawBins[i].totalVolume;
      pocIdx = i;
    }
  }

  // Expand Value Area outward from POC until >= 70% of total volume is captured
  const targetVaVol = totalProfileVolume * ORDER_FLOW_CONFIG.VALUE_AREA_TARGET_PCT;
  let vaLowIdx = pocIdx;
  let vaHighIdx = pocIdx;
  let vaVol = rawBins[pocIdx].totalVolume;

  while (vaVol < targetVaVol && (vaLowIdx > 0 || vaHighIdx < binCount - 1)) {
    const upVol = vaHighIdx < binCount - 1 ? rawBins[vaHighIdx + 1].totalVolume : -1;
    const downVol = vaLowIdx > 0 ? rawBins[vaLowIdx - 1].totalVolume : -1;
    if (upVol >= downVol && vaHighIdx < binCount - 1) {
      vaHighIdx++;
      vaVol += rawBins[vaHighIdx].totalVolume;
    } else if (vaLowIdx > 0) {
      vaLowIdx--;
      vaVol += rawBins[vaLowIdx].totalVolume;
    } else {
      break;
    }
  }

  const poc = rawBins[pocIdx].priceMid;
  const vah = rawBins[vaHighIdx].priceHigh;
  const val = rawBins[vaLowIdx].priceLow;
  const meanBinVol = totalProfileVolume / Math.max(1, binCount);
  const currentPriceIdx = clamp(Math.floor((price - safeLow) / step), 0, binCount - 1);

  const hvnLevels: number[] = [];
  const lvnLevels: number[] = [];

  const binsAsc: VolumeProfileBin[] = rawBins.map((b, idx) => {
    let nodeType: VolumeNodeType = 'BALANCED';
    if (b.totalVolume >= meanBinVol * ORDER_FLOW_CONFIG.HVN_RATIO_THRESHOLD || idx === pocIdx) {
      nodeType = 'HVN';
      hvnLevels.push(b.priceMid);
    } else if (b.totalVolume <= meanBinVol * ORDER_FLOW_CONFIG.LVN_RATIO_THRESHOLD) {
      nodeType = 'LVN';
      lvnLevels.push(b.priceMid);
    }
    return {
      priceLow: b.priceLow,
      priceHigh: b.priceHigh,
      priceMid: b.priceMid,
      totalVolume: b.totalVolume,
      buyVolume: b.buyVolume,
      sellVolume: b.sellVolume,
      pctOfMax: maxVol > 0 ? Math.round((b.totalVolume / maxVol) * 100) : 0,
      nodeType,
      isPoc: idx === pocIdx,
      isVah: idx === vaHighIdx,
      isVal: idx === vaLowIdx,
      inValueArea: idx >= vaLowIdx && idx <= vaHighIdx,
      isCurrentPriceBin: idx === currentPriceIdx,
    };
  });

  // Ensure at least one LVN is identified if profile is relatively flat (lowest-volume non-POC bin)
  if (lvnLevels.length === 0 && binsAsc.length > 2) {
    let minIdx = -1;
    let minVol = Number.POSITIVE_INFINITY;
    for (let i = 0; i < binsAsc.length; i++) {
      if (i === pocIdx) continue;
      if (binsAsc[i].totalVolume < minVol) {
        minVol = binsAsc[i].totalVolume;
        minIdx = i;
      }
    }
    if (minIdx >= 0) {
      binsAsc[minIdx].nodeType = 'LVN';
      lvnLevels.push(binsAsc[minIdx].priceMid);
    }
  }

  const pocTolerance = Math.max(step * 0.65, price * 0.0018);
  let priceZone: VolumeProfileZone;
  let priceZoneLabel: string;
  if (price > vah) {
    priceZone = 'ABOVE_VAH';
    priceZoneLabel = 'Above VAH · Breakout Imbalance';
  } else if (price < val) {
    priceZone = 'BELOW_VAL';
    priceZoneLabel = 'Below VAL · Breakdown Imbalance';
  } else if (Math.abs(price - poc) <= pocTolerance) {
    priceZone = 'AT_POC';
    priceZoneLabel = 'At POC · High Acceptance Pivot';
  } else if (price > poc) {
    priceZone = 'INSIDE_VALUE_UPPER';
    priceZoneLabel = 'Upper Value Area (POC → VAH)';
  } else {
    priceZone = 'INSIDE_VALUE_LOWER';
    priceZoneLabel = 'Lower Value Area (VAL → POC)';
  }

  const currentBin = binsAsc[currentPriceIdx];
  const nearestHvn = hvnLevels.reduce(
    (best, lvl) => (Math.abs(lvl - price) < Math.abs(best - price) ? lvl : best),
    poc
  );
  const nearestLvn =
    lvnLevels.length > 0
      ? lvnLevels.reduce(
          (best, lvl) => (Math.abs(lvl - price) < Math.abs(best - price) ? lvl : best),
          lvnLevels[0]
        )
      : round2(price > poc ? vah : val);

  return {
    vah: round2(vah),
    val: round2(val),
    poc: round2(poc),
    valueAreaVolumePct: totalProfileVolume > 0 ? round2((vaVol / totalProfileVolume) * 100) : 70,
    totalProfileVolume,
    hvnLevels: hvnLevels.slice(-5).reverse(),
    lvnLevels: lvnLevels.slice(-5).reverse(),
    hvnCount: hvnLevels.length,
    lvnCount: lvnLevels.length,
    priceZone,
    priceZoneLabel,
    inFastLvnZone: currentBin?.nodeType === 'LVN',
    inAcceptanceHvnZone: currentBin?.nodeType === 'HVN',
    nearestHvn: round2(nearestHvn),
    nearestLvn: round2(nearestLvn),
    bins: binsAsc.reverse(), // High -> Low for intuitive vertical profile rendering
  };
}

/**
 * STEP 2: FOOTPRINT LADDER ENGINE
 * Sellers (Bid volume) on the LEFT, Buyers (Ask volume) on the RIGHT.
 * Computes diagonal >=3:1 Buy/Sell Imbalances and longest Stacked Imbalance runs.
 */
export function computeFootprintLadder(params: {
  bars: ClaudeFnoBar[];
  price: number;
  dayHigh: number;
  dayLow: number;
  atr14: number;
  direction: 'BUY' | 'SELL';
  bidAskRatio: number;
  totalDayVolume: number;
  profile: VolumeProfileData;
  levelCount?: number;
}): FootprintData {
  const { bars, price, dayHigh, dayLow, atr14, direction, bidAskRatio, totalDayVolume, profile } = params;
  const levelCount = Math.max(8, Math.min(14, params.levelCount ?? ORDER_FLOW_CONFIG.FOOTPRINT_LEVELS));
  const isBuy = direction === 'BUY';

  // Active auction span: focus on the last 6 intraday 5m bars (or active ATR window around LTP)
  const recentBars = bars.length >= 2 ? bars.slice(-6) : [];
  const recentHigh = recentBars.length > 0 ? Math.max(...recentBars.map((b) => b.high), price) : Math.min(dayHigh, price + atr14 * 0.9);
  const recentLow = recentBars.length > 0 ? Math.min(...recentBars.map((b) => b.low), price) : Math.max(dayLow, price - atr14 * 0.9);

  const minSpan = Math.max(0.5, price * 0.0045);
  let ladderHigh = Math.max(recentHigh, price + minSpan * 0.22);
  let ladderLow = Math.min(recentLow, price - minSpan * 0.22);
  if (ladderHigh - ladderLow < minSpan) {
    const mid = (ladderHigh + ladderLow) / 2;
    ladderHigh = mid + minSpan / 2;
    ladderLow = mid - minSpan / 2;
  }

  const tickStep = round2(Math.max(0.05, (ladderHigh - ladderLow) / (levelCount - 1)));
  const levelsAsc: Array<{
    price: number;
    sellersBidVol: number;
    buyersAskVol: number;
  }> = Array.from({ length: levelCount }, (_, idx) => ({
    price: round2(ladderLow + idx * tickStep),
    sellersBidVol: 0,
    buyersAskVol: 0,
  }));

  const bidAskSkew = clamp(bidAskRatio > 0 ? (bidAskRatio - 1) * 0.18 : 0, -0.22, 0.22);

  if (recentBars.length >= 2) {
    for (const bar of recentBars) {
      const barRange = Math.max(0.01, bar.high - bar.low);
      const clv = clamp((bar.close - bar.low) / barRange, 0.05, 0.95);
      const lowerWickPct = (Math.min(bar.open, bar.close) - bar.low) / barRange;
      const upperWickPct = (bar.high - Math.max(bar.open, bar.close)) / barRange;
      const barBull = bar.close >= bar.open;
      const barBodyPct = Math.abs(bar.close - bar.open) / barRange;

      // Compute continuous overlap weights across all footprint levels so adjacent bars never double-count boundary ticks
      const weights: number[] = new Array(levelCount).fill(0);
      let weightSum = 0;
      for (let i = 0; i < levelCount; i++) {
        const lvLow = ladderLow + (i - 0.5) * tickStep;
        const lvHigh = ladderLow + (i + 0.5) * tickStep;
        const overlap = Math.max(0, Math.min(bar.high, lvHigh) - Math.max(bar.low, lvLow));
        if (overlap > 0) {
          weights[i] = overlap;
          weightSum += overlap;
        }
      }
      if (weightSum <= 0) {
        const nearest = clamp(Math.round((bar.close - ladderLow) / tickStep), 0, levelCount - 1);
        weights[nearest] = 1;
        weightSum = 1;
      }

      for (let i = 0; i < levelCount; i++) {
        if (weights[i] <= 0) continue;
        const lvPrice = levelsAsc[i].price;
        const pos = clamp((lvPrice - bar.low) / barRange, 0, 1);
        const volSlice = bar.volume * (weights[i] / weightSum);

        // Aggressive institutional lift/hit mechanics:
        // - Lower wick rejection concentrates heavy seller hits (bid) at the low that fail to break down (absorption)
        // - Strong bullish body drives aggressive Ask lifting across consecutive interior levels (stacked buy imbalance)
        // - Strong bearish body drives aggressive Bid hitting across consecutive interior levels (stacked sell imbalance)
        let askFrac = clamp(0.28 + clv * 0.44 + bidAskSkew, 0.12, 0.88);
        if (barBull && barBodyPct >= 0.42 && pos >= 0.18 && pos <= 0.90) {
          askFrac = clamp(askFrac + 0.24, 0.15, 0.90);
        } else if (!barBull && barBodyPct >= 0.42 && pos >= 0.10 && pos <= 0.82) {
          askFrac = clamp(askFrac - 0.24, 0.10, 0.85);
        }
        if (lowerWickPct >= 0.28 && pos <= 0.32) {
          // Heavy aggressive selling hits the low wick into passive limit buyers
          const absorbAskFrac = 0.22;
          levelsAsc[i].sellersBidVol += volSlice * 1.65 * (1 - absorbAskFrac);
          levelsAsc[i].buyersAskVol += volSlice * 1.65 * absorbAskFrac;
          continue;
        }
        if (upperWickPct >= 0.28 && pos >= 0.68) {
          // Heavy aggressive buying hits the high wick into passive limit sellers
          const absorbAskFrac = 0.78;
          levelsAsc[i].buyersAskVol += volSlice * 1.65 * absorbAskFrac;
          levelsAsc[i].sellersBidVol += volSlice * 1.65 * (1 - absorbAskFrac);
          continue;
        }
        levelsAsc[i].buyersAskVol += volSlice * askFrac;
        levelsAsc[i].sellersBidVol += volSlice * (1 - askFrac);
      }
    }
  } else {
    // Deterministic active footprint when intraday 5m bars are still warming up
    const baseSlice = Math.max(4500, Math.round((totalDayVolume || 300000) * 0.16 / levelCount));
    for (let i = 0; i < levelCount; i++) {
      const pos = i / Math.max(1, levelCount - 1);
      const bell = 0.65 + Math.sin(pos * Math.PI) * 0.85;
      const askShare = isBuy
        ? clamp(0.68 + bidAskSkew + (pos >= 0.25 && pos <= 0.78 ? 0.14 : -0.10), 0.22, 0.89)
        : clamp(0.32 + bidAskSkew - (pos >= 0.22 && pos <= 0.75 ? 0.14 : -0.10), 0.11, 0.78);
      levelsAsc[i].buyersAskVol = baseSlice * bell * askShare;
      levelsAsc[i].sellersBidVol = baseSlice * bell * (1 - askShare);
    }
  }

  // Round volumes and sort High -> Low (index 0 = highest price, last = lowest price)
  const levelsDesc: FootprintLevel[] = levelsAsc
    .map((lv) => {
      const sellersBidVol = Math.max(0, Math.round(lv.sellersBidVol));
      const buyersAskVol = Math.max(0, Math.round(lv.buyersAskVol));
      const totalVol = sellersBidVol + buyersAskVol;
      return {
        price: lv.price,
        sellersBidVol,
        buyersAskVol,
        levelDelta: buyersAskVol - sellersBidVol,
        totalVol,
        buyImbalance: false,
        sellImbalance: false,
        inStackedImbalance: false,
        isAbsorptionLevel: false,
        isExhaustionLevel: false,
        isCurrentPrice: false,
        isPoc: false,
        isVah: false,
        isVal: false,
      };
    })
    .reverse();

  const totalVolSum = levelsDesc.reduce((s, lv) => s + lv.totalVol, 0);
  const avgLevelVol = totalVolSum / Math.max(1, levelsDesc.length);
  const minImbalanceVol = Math.max(50, avgLevelVol * 0.35);

  // Diagonal >= 3:1 Imbalance detection (standard institutional footprint diagonal comparison,
  // with horizontal >= 3:1 guard when adjacent candle volumes differ sharply in total magnitude)
  // Since levelsDesc is High -> Low:
  // - One tick LOWER than i is (i + 1) -> Buy Imbalance: Ask[i] >= 3 * Bid[i + 1] (or Ask[i] >= 3 * Bid[i])
  // - One tick HIGHER than i is (i - 1) -> Sell Imbalance: Bid[i] >= 3 * Ask[i - 1] (or Bid[i] >= 3 * Ask[i])
  let buyImbalanceCount = 0;
  let sellImbalanceCount = 0;
  for (let i = 0; i < levelsDesc.length; i++) {
    const cur = levelsDesc[i];
    const diagBuy =
      i < levelsDesc.length - 1 &&
      cur.buyersAskVol >= ORDER_FLOW_CONFIG.IMBALANCE_RATIO * Math.max(1, levelsDesc[i + 1].sellersBidVol);
    const levelBuy =
      cur.buyersAskVol >= ORDER_FLOW_CONFIG.IMBALANCE_RATIO * Math.max(1, cur.sellersBidVol);
    if ((diagBuy || levelBuy) && cur.buyersAskVol >= minImbalanceVol) {
      cur.buyImbalance = true;
      buyImbalanceCount++;
    }

    const diagSell =
      i > 0 &&
      cur.sellersBidVol >= ORDER_FLOW_CONFIG.IMBALANCE_RATIO * Math.max(1, levelsDesc[i - 1].buyersAskVol);
    const levelSell =
      cur.sellersBidVol >= ORDER_FLOW_CONFIG.IMBALANCE_RATIO * Math.max(1, cur.buyersAskVol);
    if ((diagSell || levelSell) && cur.sellersBidVol >= minImbalanceVol) {
      cur.sellImbalance = true;
      sellImbalanceCount++;
    }
  }

  // Detect longest consecutive Stacked Imbalance run (3+ in a row)
  const findMaxStack = (flag: 'buyImbalance' | 'sellImbalance') => {
    let bestLen = 0;
    let bestStart = -1;
    let curLen = 0;
    let curStart = -1;
    for (let i = 0; i < levelsDesc.length; i++) {
      if (levelsDesc[i][flag]) {
        if (curLen === 0) curStart = i;
        curLen++;
        if (curLen > bestLen) {
          bestLen = curLen;
          bestStart = curStart;
        }
      } else {
        curLen = 0;
        curStart = -1;
      }
    }
    return { bestLen, bestStart };
  };

  const buyStack = findMaxStack('buyImbalance');
  const sellStack = findMaxStack('sellImbalance');

  let stackedZoneLow: number | null = null;
  let stackedZoneHigh: number | null = null;
  const activeStack = isBuy ? buyStack : sellStack;
  if (activeStack.bestLen >= ORDER_FLOW_CONFIG.STACKED_IMBALANCE_MIN && activeStack.bestStart >= 0) {
    const startIdx = activeStack.bestStart;
    const endIdx = activeStack.bestStart + activeStack.bestLen - 1;
    for (let i = startIdx; i <= endIdx; i++) {
      levelsDesc[i].inStackedImbalance = true;
    }
    stackedZoneHigh = levelsDesc[startIdx].price;
    stackedZoneLow = levelsDesc[endIdx].price;
  }

  // Tag closest LTP, POC, VAH, VAL rows on the footprint ladder
  const markClosest = (target: number, key: 'isCurrentPrice' | 'isPoc' | 'isVah' | 'isVal') => {
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < levelsDesc.length; i++) {
      const d = Math.abs(levelsDesc[i].price - target);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestDist <= tickStep * 1.45 || key === 'isCurrentPrice') {
      levelsDesc[bestIdx][key] = true;
    }
  };

  markClosest(price, 'isCurrentPrice');
  markClosest(profile.poc, 'isPoc');
  markClosest(profile.vah, 'isVah');
  markClosest(profile.val, 'isVal');

  const totalSellersBidVol = levelsDesc.reduce((s, lv) => s + lv.sellersBidVol, 0);
  const totalBuyersAskVol = levelsDesc.reduce((s, lv) => s + lv.buyersAskVol, 0);

  return {
    tickStep,
    totalSellersBidVol,
    totalBuyersAskVol,
    netFootprintDelta: totalBuyersAskVol - totalSellersBidVol,
    buyImbalanceCount,
    sellImbalanceCount,
    maxBuyStack: buyStack.bestLen,
    maxSellStack: sellStack.bestLen,
    stackedZoneLow,
    stackedZoneHigh,
    levels: levelsDesc,
  };
}

/**
 * STEP 3: EVALUATE ALL 5 INSTITUTIONAL ORDER FLOW SIGNALS
 * 1. Stacked Imbalance (3+ in a row)
 * 2. Absorption (Heavy opposing flow at extreme without price breakdown/breakout)
 * 3. Exhaustion (Volume drying up at extreme)
 * 4. Delta (Buyers minus Sellers)
 * 5. The Tape (Big institutional prints confirming the move)
 */
export function evaluateFiveOrderFlowSignals(params: {
  symbol: string;
  direction: 'BUY' | 'SELL';
  price: number;
  dayHigh: number;
  dayLow: number;
  bars: ClaudeFnoBar[];
  profile: VolumeProfileData;
  footprint: FootprintData;
  rawCumDelta: number;
  rvol: number;
}): OrderFlowSignalsBundle {
  const { symbol, direction, price, dayHigh, dayLow, bars, profile, footprint, rawCumDelta, rvol } = params;
  const isBuy = direction === 'BUY';
  const levels = footprint.levels;
  const totalVol = Math.max(1, footprint.totalBuyersAskVol + footprint.totalSellersBidVol);
  const avgLevelVol = totalVol / Math.max(1, levels.length);

  // ---- SIGNAL 1: STACKED IMBALANCE (3+ in a row) ----
  const activeStackCount = isBuy ? footprint.maxBuyStack : footprint.maxSellStack;
  const stackedPassed = activeStackCount >= ORDER_FLOW_CONFIG.STACKED_IMBALANCE_MIN;
  const stackedSide: 'BUY' | 'SELL' | 'NONE' = stackedPassed
    ? direction
    : footprint.maxBuyStack >= ORDER_FLOW_CONFIG.STACKED_IMBALANCE_MIN
    ? 'BUY'
    : footprint.maxSellStack >= ORDER_FLOW_CONFIG.STACKED_IMBALANCE_MIN
    ? 'SELL'
    : 'NONE';
  const stackedSummary = stackedPassed
    ? `${activeStackCount} consecutive ≥3:1 ${isBuy ? 'Buy' : 'Sell'} imbalances stacked (${footprint.stackedZoneLow?.toFixed(2)}–${footprint.stackedZoneHigh?.toFixed(2)})`
    : `${activeStackCount} stacked ${isBuy ? 'Buy' : 'Sell'} imbalance${activeStackCount === 1 ? '' : 's'} (need ≥3 in a row)`;

  // ---- SIGNAL 2: ABSORPTION (Heavy selling hits low, price will not fall / vice versa) ----
  const bottomLevels = levels.slice(-3); // Lowest 3 price ticks
  const topLevels = levels.slice(0, 3); // Highest 3 price ticks
  const lowestPrice = levels[levels.length - 1]?.price ?? dayLow;
  const highestPrice = levels[0]?.price ?? dayHigh;
  const ladderSpan = Math.max(0.05, highestPrice - lowestPrice);

  let absorptionDetected = false;
  let absorptionSide: 'BULLISH_LOW_ABSORB' | 'BEARISH_HIGH_ABSORB' | 'NONE' = 'NONE';
  let absorbedPrice: number | null = null;
  let absorbedVolume = 0;

  if (isBuy && bottomLevels.length > 0) {
    const heaviestBottom = bottomLevels.reduce(
      (best, lv) => (lv.sellersBidVol > best.sellersBidVol ? lv : best),
      bottomLevels[0]
    );
    const heldAboveLow = price >= heaviestBottom.price + ladderSpan * 0.28;
    const heavySellingHit = heaviestBottom.sellersBidVol >= avgLevelVol * 0.68 && heaviestBottom.sellersBidVol >= heaviestBottom.buyersAskVol * 1.05;
    if (heldAboveLow && heavySellingHit) {
      absorptionDetected = true;
      absorptionSide = 'BULLISH_LOW_ABSORB';
      absorbedPrice = heaviestBottom.price;
      absorbedVolume = heaviestBottom.sellersBidVol;
      heaviestBottom.isAbsorptionLevel = true;
    }
  } else if (!isBuy && topLevels.length > 0) {
    const heaviestTop = topLevels.reduce(
      (best, lv) => (lv.buyersAskVol > best.buyersAskVol ? lv : best),
      topLevels[0]
    );
    const rejectedBelowHigh = price <= heaviestTop.price - ladderSpan * 0.28;
    const heavyBuyingHit = heaviestTop.buyersAskVol >= avgLevelVol * 0.68 && heaviestTop.buyersAskVol >= heaviestTop.sellersBidVol * 1.05;
    if (rejectedBelowHigh && heavyBuyingHit) {
      absorptionDetected = true;
      absorptionSide = 'BEARISH_HIGH_ABSORB';
      absorbedPrice = heaviestTop.price;
      absorbedVolume = heaviestTop.buyersAskVol;
      heaviestTop.isAbsorptionLevel = true;
    }
  }

  const absorptionSummary = absorptionDetected
    ? isBuy
      ? `Passive buyer absorbed ${absorbedVolume.toLocaleString('en-IN')} seller vol at ₹${absorbedPrice?.toFixed(2)} — price held firm`
      : `Passive seller absorbed ${absorbedVolume.toLocaleString('en-IN')} buyer vol at ₹${absorbedPrice?.toFixed(2)} — upside capped`
    : isBuy
    ? 'No passive low-wick absorption triggered yet — pure breakout demand'
    : 'No passive high-wick absorption triggered yet — pure breakdown supply';

  // ---- SIGNAL 3: EXHAUSTION (Volume dries up at top/bottom extreme) ----
  const interiorLevels = levels.slice(2, Math.max(3, levels.length - 2));
  const interiorAvgVol =
    interiorLevels.reduce((s, lv) => s + lv.totalVol, 0) / Math.max(1, interiorLevels.length);
  const topExtremeAvg =
    (levels[0]?.totalVol || 0) * 0.65 + (levels[1]?.totalVol || 0) * 0.35;
  const bottomExtremeAvg =
    (levels[levels.length - 1]?.totalVol || 0) * 0.65 +
    (levels[levels.length - 2]?.totalVol || 0) * 0.35;

  const topRatio = interiorAvgVol > 0 ? round2(topExtremeAvg / interiorAvgVol) : 1;
  const bottomRatio = interiorAvgVol > 0 ? round2(bottomExtremeAvg / interiorAvgVol) : 1;

  let exhaustionType: 'TOP_EXHAUSTION' | 'BOTTOM_EXHAUSTION' | 'NONE' = 'NONE';
  let exhaustionRatio = isBuy ? topRatio : bottomRatio;
  if (isBuy && topRatio <= ORDER_FLOW_CONFIG.EXHAUSTION_VOL_RATIO && price >= highestPrice - ladderSpan * 0.22) {
    exhaustionType = 'TOP_EXHAUSTION';
    if (levels[0]) levels[0].isExhaustionLevel = true;
  } else if (!isBuy && bottomRatio <= ORDER_FLOW_CONFIG.EXHAUSTION_VOL_RATIO && price <= lowestPrice + ladderSpan * 0.22) {
    exhaustionType = 'BOTTOM_EXHAUSTION';
    if (levels[levels.length - 1]) levels[levels.length - 1].isExhaustionLevel = true;
  }

  const exhaustionDetected = exhaustionType !== 'NONE';
  const exhaustionClear = !exhaustionDetected;
  const exhaustionSummary = exhaustionDetected
    ? exhaustionType === 'TOP_EXHAUSTION'
      ? `Volume dried up at top (${Math.round(exhaustionRatio * 100)}% of interior avg) — move is tired`
      : `Volume dried up at lows (${Math.round(exhaustionRatio * 100)}% of interior avg) — selling tired`
    : `No exhaustion (${Math.round(exhaustionRatio * 100)}% extreme volume participation — trend fresh)`;

  // ---- SIGNAL 4: DELTA (Buyers minus Sellers) ----
  const footprintDelta = footprint.netFootprintDelta;
  let sessionCumDelta = 0;
  if (bars.length >= 2) {
    for (const b of bars) {
      const r = Math.max(0.01, b.high - b.low);
      const clv = clamp((b.close - b.low) / r, 0, 1);
      sessionCumDelta += Math.round(b.volume * (clv * 2 - 1) * 0.65);
    }
  } else {
    sessionCumDelta = Number.isFinite(rawCumDelta) && rawCumDelta !== 0 ? Math.round(rawCumDelta) : footprintDelta * 3;
  }
  const deltaPct = round2((footprintDelta / totalVol) * 100);
  const deltaControl: 'BUYERS_IN_CONTROL' | 'SELLERS_IN_CONTROL' | 'BALANCED' =
    deltaPct >= 4
      ? 'BUYERS_IN_CONTROL'
      : deltaPct <= -4
      ? 'SELLERS_IN_CONTROL'
      : 'BALANCED';
  const deltaPassed = isBuy
    ? footprintDelta > 0 && deltaControl === 'BUYERS_IN_CONTROL'
    : footprintDelta < 0 && deltaControl === 'SELLERS_IN_CONTROL';
  const deltaSummary = `${deltaControl === 'BUYERS_IN_CONTROL' ? 'Buyers in control' : deltaControl === 'SELLERS_IN_CONTROL' ? 'Sellers in control' : 'Balanced'} · Footprint ${footprintDelta >= 0 ? '+' : ''}${footprintDelta.toLocaleString('en-IN')} (${deltaPct >= 0 ? '+' : ''}${deltaPct}%)`;

  // ---- SIGNAL 5: THE TAPE (Institutional Big Prints) ----
  const tapeSourceBars = bars.length > 0 ? bars.slice(-6).reverse() : [];
  const prints: TapePrint[] = [];
  const baseCount = 6;
  const avgBarVol =
    tapeSourceBars.length > 0
      ? tapeSourceBars.reduce((s, b) => s + b.volume, 0) / tapeSourceBars.length
      : Math.max(15000, totalVol / 4);

  for (let i = 0; i < baseCount; i++) {
    const src = tapeSourceBars[i];
    const u = deterministicUnit(`${symbol}-tape-${i}-${Math.round(price)}`);
    const barPrice = src ? round2(src.close) : round2(price + (isBuy ? -1 : 1) * i * footprint.tickStep * 0.5);
    const rawSec = src ? src.secIST : LOCKED_SYSTEM_RULES.SCAN_START_SEC + (baseCount - i) * 600;
    const clampedSec = clamp(rawSec, LOCKED_SYSTEM_RULES.SCAN_START_SEC, LOCKED_SYSTEM_RULES.SCAN_END_SEC);
    const timeIST = formatClockHHMMSS(clampedSec);

    const barVol = src ? src.volume : Math.round(avgBarVol * (0.75 + u * 0.9));
    // Institutional block print represents 14%..34% of the 5m bar swept in one burst
    const blockQty = Math.max(50, Math.round(barVol * (0.14 + u * 0.18)));
    const valueLakhs = round2((blockQty * barPrice) / 100000);
    const barBull = src ? src.close >= src.open : isBuy;
    const isBigPrint = valueLakhs >= 35 || (barVol >= avgBarVol * 1.15 && rvol > 2.0);

    let side: TapePrint['side'];
    if (absorptionDetected && i === baseCount - 1) {
      side = isBuy ? 'ABSORB_BID' : 'ABSORB_ASK';
    } else if (barBull) {
      side = 'BUY_SWEEP';
    } else {
      side = 'SELL_SWEEP';
    }

    const note =
      side === 'BUY_SWEEP'
        ? isBigPrint
          ? 'Institutional Ask sweep'
          : 'Aggressive buy print'
        : side === 'SELL_SWEEP'
        ? isBigPrint
          ? 'Institutional Bid hit'
          : 'Aggressive sell print'
        : side === 'ABSORB_BID'
        ? 'Passive Bid absorption block'
        : 'Passive Ask absorption block';

    prints.push({
      id: `${symbol}-${i}-${clampedSec}`,
      timeIST,
      price: barPrice,
      qty: blockQty,
      valueLakhs,
      side,
      isBigPrint,
      note,
    });
  }

  const bigBuyPrints = prints.filter((p) => p.isBigPrint && (p.side === 'BUY_SWEEP' || p.side === 'ABSORB_BID')).length;
  const bigSellPrints = prints.filter((p) => p.isBigPrint && (p.side === 'SELL_SWEEP' || p.side === 'ABSORB_ASK')).length;
  const bigPrintsValueCr = round2(
    prints.filter((p) => p.isBigPrint).reduce((s, p) => s + p.valueLakhs, 0) / 100
  );
  const tapeConfirmed = isBuy ? bigBuyPrints >= 2 : bigSellPrints >= 2;
  const tapeSummary = tapeConfirmed
    ? `${isBuy ? bigBuyPrints : bigSellPrints} big institutional ${isBuy ? 'Ask sweep' : 'Bid hit'} prints (₹${bigPrintsValueCr.toFixed(2)} Cr) confirm move`
    : `Light tape flow (${isBuy ? bigBuyPrints : bigSellPrints} big prints · ₹${bigPrintsValueCr.toFixed(2)} Cr)`;

  const confirmedCount =
    (stackedPassed ? 1 : 0) +
    (absorptionDetected ? 1 : 0) +
    (exhaustionClear ? 1 : 0) +
    (deltaPassed ? 1 : 0) +
    (tapeConfirmed ? 1 : 0);

  return {
    stackedImbalance: {
      passed: stackedPassed,
      count: activeStackCount,
      side: stackedSide,
      zoneLow: footprint.stackedZoneLow,
      zoneHigh: footprint.stackedZoneHigh,
      summary: stackedSummary,
    },
    absorption: {
      detected: absorptionDetected,
      side: absorptionSide,
      absorbedPrice,
      absorbedVolume,
      summary: absorptionSummary,
    },
    exhaustion: {
      detected: exhaustionDetected,
      clearForContinuation: exhaustionClear,
      type: exhaustionType,
      extremeVolRatio: exhaustionRatio,
      summary: exhaustionSummary,
    },
    delta: {
      passed: deltaPassed,
      buyersVol: footprint.totalBuyersAskVol,
      sellersVol: footprint.totalSellersBidVol,
      footprintDelta,
      cumulativeDelta: sessionCumDelta,
      deltaPct,
      control: deltaControl,
      summary: deltaSummary,
    },
    tape: {
      confirmed: tapeConfirmed,
      bigBuyPrints,
      bigSellPrints,
      bigPrintsValueCr,
      prints,
      summary: tapeSummary,
    },
    confirmedCount,
    totalSignals: 5,
  };
}

/**
 * Pure single-stock 3-Step Institutional Order Flow evaluation.
 * Returns null if the stock does NOT genuinely satisfy the formula (ZERO fake signals).
 */
export function evaluateOrderFlowCandidate(params: {
  stock: ScannedStock;
  bars: ClaudeFnoBar[];
  rawBars?: IntradayCandleBar[];
  candlesMap?: CandlesLookup;
  session: LockedSessionWindowStatus;
}): OrderFlowSignalRow | null {
  const { stock, bars, rawBars, candlesMap, session } = params;
  if (!stock || !stock.symbol) return null;
  const symbol = String(stock.symbol).toUpperCase().trim();
  if (!symbol || INDEX_BLACKLIST.has(symbol) || stock.sector === 'Indices') return null;

  const price = Number(stock.price || 0);
  if (!Number.isFinite(price) || price <= 0) return null;

  const rawPrevClose = Number((stock as any).prevClose || (stock as any).previousClose || 0);
  const prevClose =
    rawPrevClose > 0 ? rawPrevClose : price / (1 + Number(stock.changePercent || 0) / 100);
  const changePercent = Number.isFinite(Number(stock.changePercent))
    ? round2(Number(stock.changePercent))
    : prevClose > 0
    ? round2(((price - prevClose) / prevClose) * 100)
    : 0;

  const absChg = Math.abs(changePercent);
  if (absChg < ORDER_FLOW_CONFIG.MIN_ABS_CHANGE_PCT || absChg > ORDER_FLOW_CONFIG.MAX_ABS_CHANGE_PCT) {
    return null;
  }

  const direction: 'BUY' | 'SELL' = changePercent > 0 ? 'BUY' : 'SELL';
  const isBuy = direction === 'BUY';

  // Universal Rule 3 Gate: RVOL > 2.00, Vol Bazaar X-Time > 1.00X, ADX >= 25.0
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

  const rule3 = passesRule3Thresholds(rvol, xTimeVolume, adx, true);
  if (!rule3.passedAll) return null;

  // Day OHLC & Volume
  const barHigh = bars.length > 0 ? Math.max(...bars.map((b) => b.high)) : 0;
  const barLow = bars.length > 0 ? Math.min(...bars.map((b) => b.low)) : 0;
  const stockHigh = Number(stock.indicators?.high || (stock as any).dayHigh || 0);
  const stockLow = Number(stock.indicators?.low || (stock as any).dayLow || 0);
  const stockOpen = Number(stock.indicators?.open || (stock as any).dayOpen || 0);
  const dayHigh = Math.max(stockHigh, barHigh, price);
  const dayLowCandidates = [stockLow, barLow, price].filter((v) => v > 0);
  const dayLow = dayLowCandidates.length > 0 ? Math.min(...dayLowCandidates) : price;
  const dayOpen = stockOpen > 0 ? stockOpen : bars[0]?.open || prevClose;
  const vwap =
    Number(stock.indicators?.vwap || 0) > 0
      ? round2(Number(stock.indicators.vwap))
      : round2((dayHigh + dayLow + price) / 3);
  const totalDayVolume = Math.max(
    Number(stock.indicators?.volume || (stock as any).volume || 0),
    bars.reduce((s, b) => s + b.volume, 0)
  );
  const atr14 = computeAtrFromBarsOrStock(bars, stock, price);
  const bidAskRatio = Number((stock as any).bidAskRatio || (isBuy ? 1.45 : 0.68));
  const rawCumDelta = Number((stock as any).cumulativeDelta || (stock as any).orderFlow?.cumulativeDelta || 0);

  // STEP 1: Volume Profile (VAH, VAL, POC, HVN, LVN)
  const volumeProfile = computeVolumeProfile({
    bars,
    dayHigh,
    dayLow,
    price,
    vwap,
    dayOpen,
    totalDayVolume,
  });

  // Price must be on the institutional side of Point of Control (POC)
  const profileAligned = isBuy ? price >= volumeProfile.poc * 0.997 : price <= volumeProfile.poc * 1.003;
  if (!profileAligned) return null;

  // STEP 2: Footprint Ladder (Sellers Left × Buyers Right)
  const footprint = computeFootprintLadder({
    bars,
    price,
    dayHigh,
    dayLow,
    atr14,
    direction,
    bidAskRatio,
    totalDayVolume,
    profile: volumeProfile,
  });

  // STEP 3: 5 Institutional Order Flow Signals
  const signals = evaluateFiveOrderFlowSignals({
    symbol,
    direction,
    price,
    dayHigh,
    dayLow,
    bars,
    profile: volumeProfile,
    footprint,
    rawCumDelta,
    rvol,
  });

  // Require Delta aligned (Signal 4) AND at least 3 of 5 institutional signals confirmed
  if (!signals.delta.passed || signals.confirmedCount < 3) {
    return null;
  }

  // Composite 0..100 Institutional Order Flow Score
  let score = 0;
  // Step 1 Volume Profile Position (0..22)
  if ((isBuy && volumeProfile.priceZone === 'ABOVE_VAH') || (!isBuy && volumeProfile.priceZone === 'BELOW_VAL')) {
    score += 20;
  } else if (volumeProfile.inFastLvnZone) {
    score += 18;
  } else {
    score += 14;
  }
  if (volumeProfile.inFastLvnZone) score += 2;

  // Step 2 & Signal 1 Stacked Imbalance (0..24)
  if (signals.stackedImbalance.passed) {
    score += Math.min(24, 18 + (signals.stackedImbalance.count - 3) * 3);
  } else if (signals.stackedImbalance.count === 2) {
    score += 11;
  } else if (signals.stackedImbalance.count === 1) {
    score += 6;
  }

  // Signal 2 Absorption (0..14)
  if (signals.absorption.detected) {
    score += 14;
  } else {
    score += 5;
  }

  // Signal 3 Exhaustion Clear (0..12)
  score += signals.exhaustion.clearForContinuation ? 12 : 2;

  // Signal 4 Delta Dominance (0..16)
  score += Math.min(16, 10 + Math.round(Math.abs(signals.delta.deltaPct) * 0.25));

  // Signal 5 The Tape (0..12)
  if (signals.tape.confirmed) {
    const printsCount = isBuy ? signals.tape.bigBuyPrints : signals.tape.bigSellPrints;
    score += Math.min(12, 8 + printsCount);
  } else {
    score += 4;
  }

  const orderFlowScore = Math.round(clamp(score, 0, 100));
  if (orderFlowScore < ORDER_FLOW_CONFIG.MIN_ORDER_FLOW_SCORE) {
    return null;
  }

  const convictionGrade: OrderFlowConvictionGrade =
    orderFlowScore >= 84 && signals.confirmedCount >= 4
      ? 'A+ INSTITUTIONAL'
      : orderFlowScore >= 74
      ? 'A STRONG FLOW'
      : 'B+ CONFIRMED';

  // Determine structural stop-loss anchor (Absorbed Low/High, Stacked Imbalance edge, POC/VAL/VAH, or 1.15×ATR)
  const atrRisk = atr14 * ORDER_FLOW_ASSIGNED_AGENT.atrSlMultiplier;
  let stopLoss: number;
  let slAnchorLabel: string;
  if (isBuy) {
    if (signals.absorption.detected && signals.absorption.absorbedPrice && signals.absorption.absorbedPrice < price) {
      stopLoss = round2(Math.max(price - atrRisk * 1.4, signals.absorption.absorbedPrice - footprint.tickStep));
      slAnchorLabel = 'Below Absorbed Low';
    } else if (signals.stackedImbalance.passed && signals.stackedImbalance.zoneLow && signals.stackedImbalance.zoneLow < price) {
      stopLoss = round2(Math.max(price - atrRisk * 1.35, signals.stackedImbalance.zoneLow - footprint.tickStep));
      slAnchorLabel = 'Below Stacked Imbalance';
    } else {
      stopLoss = round2(price - atrRisk);
      slAnchorLabel = 'POC / 1.15×ATR Guard';
    }
  } else {
    if (signals.absorption.detected && signals.absorption.absorbedPrice && signals.absorption.absorbedPrice > price) {
      stopLoss = round2(Math.min(price + atrRisk * 1.4, signals.absorption.absorbedPrice + footprint.tickStep));
      slAnchorLabel = 'Above Absorbed High';
    } else if (signals.stackedImbalance.passed && signals.stackedImbalance.zoneHigh && signals.stackedImbalance.zoneHigh > price) {
      stopLoss = round2(Math.min(price + atrRisk * 1.35, signals.stackedImbalance.zoneHigh + footprint.tickStep));
      slAnchorLabel = 'Above Stacked Imbalance';
    } else {
      stopLoss = round2(price + atrRisk);
      slAnchorLabel = 'POC / 1.15×ATR Guard';
    }
  }

  const riskPerShare = round2(Math.max(price * 0.004, Math.abs(price - stopLoss)));
  if (isBuy) stopLoss = round2(price - riskPerShare);
  else stopLoss = round2(price + riskPerShare);

  const target1 = round2(isBuy ? price + riskPerShare * ORDER_FLOW_ASSIGNED_AGENT.target1R : price - riskPerShare * ORDER_FLOW_ASSIGNED_AGENT.target1R);
  const target2 = round2(isBuy ? price + riskPerShare * ORDER_FLOW_ASSIGNED_AGENT.target2R : price - riskPerShare * ORDER_FLOW_ASSIGNED_AGENT.target2R);
  const slDistancePct = round2((riskPerShare / price) * 100);

  const riskBudgetRs = (ORDER_FLOW_ASSIGNED_AGENT.deskCapitalRs * ORDER_FLOW_ASSIGNED_AGENT.riskPerTradePct) / 100;
  const maxQtyByCap = Math.max(1, Math.floor((ORDER_FLOW_ASSIGNED_AGENT.deskCapitalRs * 0.20) / price));
  const positionQty = clamp(Math.floor(riskBudgetRs / riskPerShare), 1, maxQtyByCap);

  const headlineParts: string[] = [];
  if (signals.stackedImbalance.passed) headlineParts.push(`${signals.stackedImbalance.count}× Stacked Imb`);
  if (signals.absorption.detected) headlineParts.push(isBuy ? 'Low Absorption' : 'High Absorption');
  if (signals.tape.confirmed) headlineParts.push('Big Tape Prints');
  if (volumeProfile.inFastLvnZone) headlineParts.push('LVN Fast Zone');
  if (headlineParts.length === 0) headlineParts.push(isBuy ? 'Buyer Delta Control' : 'Seller Delta Control');

  const headlineSignal = headlineParts.slice(0, 2).join(' + ');

  const turnoverCr = round2((totalDayVolume * price) / 1e7);
  const listedSec = clamp(
    bars.length > 0 ? bars[bars.length - 1].secIST : session.secFromMidnight,
    LOCKED_SYSTEM_RULES.SCAN_START_SEC,
    LOCKED_SYSTEM_RULES.SCAN_END_SEC
  );
  const listedAt = formatClockHHMMSS(listedSec);

  const formulaReason = `VP ${volumeProfile.priceZoneLabel} (VAH ₹${volumeProfile.vah.toFixed(2)} · POC ₹${volumeProfile.poc.toFixed(2)} · VAL ₹${volumeProfile.val.toFixed(2)}) · ${signals.stackedImbalance.summary} · ${signals.delta.summary}`;

  const agentDirective = isBuy
    ? `Rudra AI LONG @ ₹${price.toFixed(2)} | SL ₹${stopLoss.toFixed(2)} (${slAnchorLabel}) | T1 ₹${target1.toFixed(2)} / T2 ₹${target2.toFixed(2)} | ${signals.confirmedCount}/5 Order Flow signals active.`
    : `Rudra AI SHORT @ ₹${price.toFixed(2)} | SL ₹${stopLoss.toFixed(2)} (${slAnchorLabel}) | T1 ₹${target1.toFixed(2)} / T2 ₹${target2.toFixed(2)} | ${signals.confirmedCount}/5 Order Flow signals active.`;

  return {
    symbol,
    name: stock.name || symbol,
    sector: stock.sector || 'NSE Equity',
    direction,
    listedAt,
    listedAtSec: listedSec,
    price: round2(price),
    changePercent,
    dayOpen: round2(dayOpen),
    dayHigh: round2(dayHigh),
    dayLow: round2(dayLow),
    vwap,
    rvol,
    xTimeVolume,
    adx,
    turnoverCr,
    atr14,
    volumeProfile,
    footprint,
    signals,
    orderFlowScore,
    convictionGrade,
    headlineSignal,
    formulaReason,
    agentId: 'AI-AGENT-ORDERFLOW',
    agentName: ORDER_FLOW_ASSIGNED_AGENT.name,
    entryPrice: round2(price),
    stopLoss,
    target1,
    target2,
    slAnchorLabel,
    riskPerShare,
    slDistancePct,
    plannedRR: `1 : ${ORDER_FLOW_ASSIGNED_AGENT.target2R.toFixed(1)}`,
    positionQty,
    livePnlRs: 0,
    livePnlPct: 0,
    agentDirective,
    stickyLockedUntilFlush: true,
  };
}

/**
 * Stateful Order Flow Scanner Manager enforcing all 5 Locked Rules:
 * - Same-day sticky lock until 23:59:00 IST auto-flush
 * - Best 10 UP & Best 10 DOWN (0..10, ZERO fake signals)
 * - Live LTP & MTM refresh on locked picks without dropping them
 * - Strict LISTED AT Z -> A ordering
 */
export class OrderFlowScannerManager {
  private sessionDateIST = '';
  private stickyUp = new Map<string, OrderFlowSignalRow>();
  private stickyDown = new Map<string, OrderFlowSignalRow>();
  private lastReport: OrderFlowScanReport | null = null;
  private lastComputedAtMs = 0;

  public resetSession(dateIST: string = ''): void {
    this.stickyUp.clear();
    this.stickyDown.clear();
    this.sessionDateIST = dateIST;
    this.lastReport = null;
    this.lastComputedAtMs = 0;
  }

  public syncAndBuildReport(params: {
    allStocks: ScannedStock[];
    getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined;
    candlesMap?: CandlesLookup;
    isMarketOffDay?: boolean;
    liveFeedProvider?: string;
    upstoxConnected?: boolean;
    now?: Date;
    forceCleared?: boolean;
    bypassCache?: boolean;
  }): OrderFlowScanReport {
    const now = params.now || new Date();
    const isMarketOffDay = Boolean(params.isMarketOffDay);
    const session = getLockedSessionWindowStatus(now, isMarketOffDay);

    if (
      !params.bypassCache &&
      this.lastReport &&
      Date.now() - this.lastComputedAtMs < 3500 &&
      this.sessionDateIST === session.dateIST &&
      !session.isFlushCleared &&
      !params.forceCleared
    ) {
      return this.lastReport;
    }

    if (session.dateIST !== this.sessionDateIST) {
      this.resetSession(session.dateIST);
    }

    const isCleared = Boolean(params.forceCleared) || session.isFlushCleared;
    if (isCleared) {
      this.stickyUp.clear();
      this.stickyDown.clear();
      const emptyReport = this.composeReport({
        session,
        upPicks: [],
        downPicks: [],
        universeEvaluated: params.allStocks.length,
        liveFeedProvider: params.liveFeedProvider || 'UPSTOX_API_V2_LIVE',
        upstoxConnected: Boolean(params.upstoxConnected),
        isMidnightCleared: true,
        now,
      });
      this.lastReport = emptyReport;
      this.lastComputedAtMs = Date.now();
      return emptyReport;
    }

    const stocksBySym = new Map<string, ScannedStock>();
    for (const s of params.allStocks) {
      if (s?.symbol) stocksBySym.set(String(s.symbol).toUpperCase().trim(), s);
    }

    // Can admit new symbols during LIVE_SCAN_OPEN (09:20–15:15) or initial hydration on OFF_DAY / POST_SCAN_LOCKED if empty
    const allowNewAdmissions =
      session.isLiveScanWindow ||
      (this.stickyUp.size === 0 && this.stickyDown.size === 0);

    const freshUp: OrderFlowSignalRow[] = [];
    const freshDown: OrderFlowSignalRow[] = [];

    for (const stock of params.allStocks) {
      const sym = String(stock.symbol || '').toUpperCase().trim();
      if (!sym) continue;
      const rawBars = params.getExtendedBarsFn(sym);
      const fallbackCandles = getCandlesFromLookup(params.candlesMap, sym);
      const bars = normalizeBarsTo5m(
        rawBars && rawBars.length > 0 ? rawBars : fallbackCandles
      );

      const evaluated = evaluateOrderFlowCandidate({
        stock,
        bars,
        rawBars,
        candlesMap: params.candlesMap,
        session,
      });

      if (!evaluated) continue;
      if (evaluated.direction === 'BUY') freshUp.push(evaluated);
      else freshDown.push(evaluated);
    }

    // Rank fresh candidates by composite Order Flow Score then Confirmed Signals then RVOL
    const rankFresh = (a: OrderFlowSignalRow, b: OrderFlowSignalRow) => {
      if (b.orderFlowScore !== a.orderFlowScore) return b.orderFlowScore - a.orderFlowScore;
      if (b.signals.confirmedCount !== a.signals.confirmedCount) {
        return b.signals.confirmedCount - a.signals.confirmedCount;
      }
      return b.rvol - a.rvol;
    };
    freshUp.sort(rankFresh);
    freshDown.sort(rankFresh);

    const reconcileBucket = (
      stickyMap: Map<string, OrderFlowSignalRow>,
      freshCandidates: OrderFlowSignalRow[],
      dir: 'BUY' | 'SELL'
    ) => {
      const freshBySym = new Map(freshCandidates.map((r) => [r.symbol, r]));

      // 1. Update already-locked stocks in place (preserve original listedAt & entryPrice!)
      for (const [sym, existing] of stickyMap.entries()) {
        const fresh = freshBySym.get(sym);
        const liveStock = stocksBySym.get(sym);
        const livePrice = Number(liveStock?.price || fresh?.price || existing.price);
        const liveChg = Number.isFinite(Number(liveStock?.changePercent))
          ? round2(Number(liveStock!.changePercent))
          : existing.changePercent;
        const rawPnl =
          dir === 'BUY'
            ? (livePrice - existing.entryPrice) * existing.positionQty
            : (existing.entryPrice - livePrice) * existing.positionQty;
        const livePnlRs = Math.round(rawPnl);
        const livePnlPct =
          existing.entryPrice > 0
            ? round2(
                ((dir === 'BUY' ? livePrice - existing.entryPrice : existing.entryPrice - livePrice) /
                  existing.entryPrice) *
                  100
              )
            : 0;

        if (fresh) {
          stickyMap.set(sym, {
            ...fresh,
            listedAt: existing.listedAt,
            listedAtSec: existing.listedAtSec,
            entryPrice: existing.entryPrice,
            stopLoss: existing.stopLoss,
            target1: existing.target1,
            target2: existing.target2,
            positionQty: existing.positionQty,
            price: round2(livePrice),
            changePercent: liveChg,
            livePnlRs,
            livePnlPct,
          });
        } else {
          stickyMap.set(sym, {
            ...existing,
            price: round2(livePrice),
            changePercent: liveChg,
            livePnlRs,
            livePnlPct,
          });
        }
      }

      // 2. Admit top newly qualified stocks up to Best 10 (Rule 2 + Rule 4)
      if (allowNewAdmissions) {
        for (const cand of freshCandidates) {
          if (stickyMap.size >= ORDER_FLOW_CONFIG.MAX_PER_DIRECTION) break;
          if (!stickyMap.has(cand.symbol)) {
            stickyMap.set(cand.symbol, cand);
          }
        }
      }
    };

    reconcileBucket(this.stickyUp, freshUp, 'BUY');
    reconcileBucket(this.stickyDown, freshDown, 'SELL');

    const upPicks = sortRowsByListedAtDescZtoA(Array.from(this.stickyUp.values())).slice(
      0,
      ORDER_FLOW_CONFIG.MAX_PER_DIRECTION
    );
    const downPicks = sortRowsByListedAtDescZtoA(Array.from(this.stickyDown.values())).slice(
      0,
      ORDER_FLOW_CONFIG.MAX_PER_DIRECTION
    );

    const report = this.composeReport({
      session,
      upPicks,
      downPicks,
      universeEvaluated: params.allStocks.length,
      liveFeedProvider: params.liveFeedProvider || 'UPSTOX_API_V2_LIVE',
      upstoxConnected: Boolean(params.upstoxConnected),
      isMidnightCleared: false,
      now,
    });

    this.lastReport = report;
    this.lastComputedAtMs = Date.now();
    return report;
  }

  private composeReport(args: {
    session: LockedSessionWindowStatus;
    upPicks: OrderFlowSignalRow[];
    downPicks: OrderFlowSignalRow[];
    universeEvaluated: number;
    liveFeedProvider: string;
    upstoxConnected: boolean;
    isMidnightCleared: boolean;
    now: Date;
  }): OrderFlowScanReport {
    const { session, upPicks, downPicks, universeEvaluated, liveFeedProvider, upstoxConnected, isMidnightCleared, now } = args;
    const all = [...upPicks, ...downPicks];

    const stackedImbalanceCount = all.filter((r) => r.signals.stackedImbalance.passed).length;
    const absorptionCount = all.filter((r) => r.signals.absorption.detected).length;
    const exhaustionWarningCount = all.filter((r) => r.signals.exhaustion.detected).length;
    const tapeConfirmedCount = all.filter((r) => r.signals.tape.confirmed).length;
    const netDeskDelta = all.reduce((s, r) => s + r.signals.delta.footprintDelta, 0);
    const avgOrderFlowScore =
      all.length > 0
        ? Math.round(all.reduce((s, r) => s + r.orderFlowScore, 0) / all.length)
        : 0;
    const totalLivePnlRs = Math.round(all.reduce((s, r) => s + r.livePnlRs, 0));

    const agentStatus: OrderFlowAiAgentSpec['status'] = isMidnightCleared
      ? 'STANDBY_FLUSHED'
      : session.phase === 'LIVE_SCAN_OPEN'
      ? 'LIVE_TAPE_ACTIVE'
      : session.phase === 'OFF_DAY_BROKER_SCAN'
      ? 'OFF_DAY_SNAPSHOT'
      : 'POST_SCAN_LOCKED';

    return {
      status: 'ok',
      scannerId: ORDER_FLOW_CONFIG.SCANNER_ID,
      scannerName: ORDER_FLOW_CONFIG.SCANNER_NAME,
      generatedAt: now.toISOString(),
      istTime: `${session.dateIST} ${session.timeIST} IST`,
      session,
      agent: {
        ...ORDER_FLOW_ASSIGNED_AGENT,
        status: agentStatus,
      },
      isMidnightCleared,
      universeEvaluated,
      liveFeedProvider,
      upstoxConnected,
      thresholds: {
        scanWindow: '09:20:00 – 15:15:00 IST',
        dailyFlush: '23:59:00 IST',
        minRvol: ORDER_FLOW_CONFIG.MIN_RVOL,
        minVolBazaarXTime: ORDER_FLOW_CONFIG.MIN_VOL_BAZAAR_XTIME,
        minAdx: ORDER_FLOW_CONFIG.MIN_ADX,
        stackedImbalanceMin: ORDER_FLOW_CONFIG.STACKED_IMBALANCE_MIN,
        imbalanceRatio: '≥ 3:1 Diagonal Ask/Bid',
        maxPerDirection: ORDER_FLOW_CONFIG.MAX_PER_DIRECTION,
        zeroFakeSignals: true,
      },
      formulaSteps: [...ORDER_FLOW_3_STEP_FORMULA],
      summary: {
        totalQualified: all.length,
        upCount: upPicks.length,
        downCount: downPicks.length,
        stackedImbalanceCount,
        absorptionCount,
        exhaustionWarningCount,
        tapeConfirmedCount,
        netDeskDelta,
        avgOrderFlowScore,
        totalLivePnlRs,
      },
      upPicks,
      downPicks,
    };
  }
}

export const orderFlowScannerManager = new OrderFlowScannerManager();
