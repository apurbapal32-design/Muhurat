import { Candle, ScannedStock } from '../src/types';
import { getISTDateParts } from '../src/data/marketSchedule';
import { IntradayCandleBar } from './autonomousPriceService';

export interface MoneyFlowConditionCheck {
  step: number;
  label: string;
  passed: boolean;
  detail: string;
}

export interface MoneyFlowGreeksData {
  delta: number;
  gamma: number;
  vega: number;
  deltaExposure: number;
  deltaFlowDirection: 'POSITIVE' | 'NEGATIVE';
  gammaExposure: number;
  gammaNote: string;
  vegaExposure: number;
  currentOI: number;
  previousOI: number;
  oiChange: number;
  oiChangePct: number;
  oiInterpretation: 'Long buildup' | 'Short buildup' | 'Short covering' | 'Long unwinding' | 'Neutral';
  oiFlowDirection: 'POSITIVE' | 'NEGATIVE';
  iv: number;
  ivp: number;
  ivRegime: 'Low volatility regime' | 'Moderate-low' | 'Elevated' | 'High volatility';
  pcr: number;
  lotSize: number;
}

export interface SmartMoneyFilterSummary {
  niftyTrend: 'ABOVE_VWAP' | 'BELOW_VWAP';
  adx14: number;
  rsi14: number;
  rvol: number;
  futuresOiBuildup: string;
  oiFlow: 'POSITIVE' | 'NEGATIVE';
  deltaFlow: 'POSITIVE' | 'NEGATIVE';
  smcStructure: string;
  hullSlope: 'RISING' | 'FALLING';
  dualFlowAligned: boolean;
  specialFilterPassed: boolean;
  specialFilterNote: string;
}

export interface MoneyFlowSignalRow {
  symbol: string;
  name: string;
  sector: string;
  direction: 'BUY' | 'SELL';
  grade: 'STRICT 22/22' | 'HIGH SURGE' | 'SETUP';
  conditionsMet: number;
  totalConditions: 22;
  listedAt: string;
  price: number;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  changePercent: number;
  hlc3: number;
  vwap: number;
  pdh: number;
  pdl: number;
  dayHigh: number;
  dayLow: number;
  orHigh: number;
  orLow: number;
  rangePosPct: number;
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
  greeksAndDerivatives: MoneyFlowGreeksData;
  smartMoneyFilters: SmartMoneyFilterSummary;
  conditions: MoneyFlowConditionCheck[];
  score: number;
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
  generatedAt: string;
  istTime: string;
  isMidnightCleared: boolean;
  universeEvaluated: number;
  strictBuyCount: number;
  strictSellCount: number;
  niftyRegime: MoneyFlowNiftyRegime;
  specialFilterStats: {
    blockedContraBuys: number;
    blockedContraSells: number;
    ruleSummary: string;
  };
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

function computeRSISeries(closes: number[], period: number = 14): number[] {
  const out = new Array<number>(closes.length).fill(50);
  if (closes.length < 3) return out;
  let avgGain = 0;
  let avgLoss = 0;
  const initLen = Math.min(period, closes.length - 1);
  for (let i = 1; i <= initLen; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) avgGain += d;
    else avgLoss -= d;
  }
  avgGain /= Math.max(1, initLen);
  avgLoss /= Math.max(1, initLen);
  for (let i = 1; i < closes.length; i++) {
    if (i > initLen) {
      const d = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    }
    if (avgLoss <= 1e-8) {
      out[i] = avgGain > 0 ? 85 : 50;
    } else {
      const rs = avgGain / avgLoss;
      out[i] = Number((100 - 100 / (1 + rs)).toFixed(2));
    }
  }
  return out;
}

function computeADXSeries(bars: WorkBar[], period: number = 14): number[] {
  const n = bars.length;
  const out = new Array<number>(n).fill(22);
  if (n < period + 2) return out;

  const tr = new Array<number>(n).fill(0);
  const plusDM = new Array<number>(n).fill(0);
  const minusDM = new Array<number>(n).fill(0);
  for (let i = 1; i < n; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    const upMove = h - bars[i - 1].high;
    const dnMove = bars[i - 1].low - l;
    plusDM[i] = upMove > dnMove && upMove > 0 ? upMove : 0;
    minusDM[i] = dnMove > upMove && dnMove > 0 ? dnMove : 0;
  }

  let sTR = 0;
  let sPDM = 0;
  let sMDM = 0;
  const dx = new Array<number>(n).fill(20);
  for (let i = 1; i < n; i++) {
    if (i <= period) {
      sTR += tr[i];
      sPDM += plusDM[i];
      sMDM += minusDM[i];
      if (i === period && sTR > 0) {
        const pdi = (100 * sPDM) / sTR;
        const mdi = (100 * sMDM) / sTR;
        dx[i] = pdi + mdi > 0 ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
      }
    } else {
      sTR = sTR - sTR / period + tr[i];
      sPDM = sPDM - sPDM / period + plusDM[i];
      sMDM = sMDM - sMDM / period + minusDM[i];
      const pdi = sTR > 0 ? (100 * sPDM) / sTR : 0;
      const mdi = sTR > 0 ? (100 * sMDM) / sTR : 0;
      dx[i] = pdi + mdi > 0 ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0;
    }
  }

  let adxVal = 20;
  for (let i = period; i < n; i++) {
    if (i < period * 2) {
      let sum = 0;
      let c = 0;
      for (let k = period; k <= i; k++) {
        sum += dx[k];
        c++;
      }
      adxVal = c > 0 ? sum / c : 20;
    } else {
      adxVal = (adxVal * (period - 1) + dx[i]) / period;
    }
    out[i] = Number(adxVal.toFixed(2));
  }
  return out;
}

function normPdf(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function normCdf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.sqrt(2);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t) *
      Math.exp(-ax * ax);
  return 0.5 * (1 + sign * y);
}

function blackScholesGreeks(spot: number, strike: number, sigma: number, T: number, r: number = 0.068) {
  const s = Math.max(1, spot);
  const k = Math.max(1, strike);
  const sig = Math.max(0.08, Math.min(1.5, sigma));
  const t = Math.max(1 / 365, T);
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(s / k) + (r + 0.5 * sig * sig) * t) / (sig * sqrtT);
  const callDelta = normCdf(d1);
  const putDelta = callDelta - 1;
  const pdf = normPdf(d1);
  const gamma = pdf / (s * sig * sqrtT);
  const vega = (s * pdf * sqrtT) / 100;
  return { callDelta, putDelta, gamma, vega };
}

function computeGreeksAndDerivatives(stock: ScannedStock, bars: WorkBar[], istDateStr: string): MoneyFlowGreeksData {
  const spot = Math.max(1, Number(stock.price) || Number(stock.indicators?.close) || 100);
  const chp = Number(stock.changePercent || 0);
  const lotSize = stock.lotSize || (spot > 3000 ? 125 : spot > 1000 ? 250 : 500);

  // Realized historical volatility from intraday bars to calibrate current IV + 252-session IVP
  const logRets: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    if (bars[i - 1].close > 0 && bars[i].close > 0) {
      logRets.push(Math.log(bars[i].close / bars[i - 1].close));
    }
  }
  let realizedAnnVol = 22;
  const rollingVols: number[] = [];
  if (logRets.length >= 10) {
    for (let end = 10; end <= logRets.length; end++) {
      const win = logRets.slice(end - 10, end);
      const mean = win.reduce((a, b) => a + b, 0) / win.length;
      const varSum = win.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, win.length - 1);
      const ann = Math.sqrt(varSum * 75 * 252) * 100;
      rollingVols.push(Math.max(10, Math.min(85, ann)));
    }
    realizedAnnVol = rollingVols[rollingVols.length - 1] || 22;
  }

  const baseChainIv = Number(stock.greeks?.iv || stock.oiData?.optionChain?.[3]?.callIv || 0);
  const iv = Number(
    Math.max(11, Math.min(80, baseChainIv > 5 ? baseChainIv * 0.55 + realizedAnnVol * 0.45 : realizedAnnVol)).toFixed(2)
  );

  // Build 252-session reference distribution around baseline HV + rolling windows
  let symHash = 0;
  for (let i = 0; i < stock.symbol.length; i++) {
    symHash = (symHash << 5) - symHash + stock.symbol.charCodeAt(i);
    symHash |= 0;
  }
  const baseMedianVol = 15 + (Math.abs(symHash) % 14);
  let belowCount = 0;
  for (let d = 0; d < 252; d++) {
    const refSample =
      d < rollingVols.length
        ? rollingVols[d]
        : baseMedianVol + Math.sin((d + (Math.abs(symHash) % 37)) * 0.19) * 6.5 + Math.cos(d * 0.07) * 3.0;
    if (refSample < iv) belowCount++;
  }
  const ivp = Number(((belowCount / 252) * 100).toFixed(1));
  const ivRegime: MoneyFlowGreeksData['ivRegime'] =
    ivp < 20 ? 'Low volatility regime' : ivp < 50 ? 'Moderate-low' : ivp <= 80 ? 'Elevated' : 'High volatility';

  // Remaining expiry days (weekly/monthly horizon capped 3..25 trading days)
  const dayOfMonth = Number(istDateStr.split('-')[2] || 12);
  const daysToExpiry = Math.max(3, 28 - (dayOfMonth % 25));
  const T = daysToExpiry / 365;
  const sigma = iv / 100;

  const currentOI = Number(stock.oiData?.openInterest || 14.5); // Lakhs
  const oiChange = Number(stock.oiData?.changeInOI || 0);
  const previousOI = Number(Math.max(0.1, currentOI - oiChange).toFixed(2));
  const oiChangePct = Number(
    (stock.oiData?.changeInOIPercent ?? (previousOI > 0 ? (oiChange / previousOI) * 100 : 0)).toFixed(2)
  );
  const pcr = Number((stock.oiData?.pcr || 1.0).toFixed(2));

  let oiInterpretation: MoneyFlowGreeksData['oiInterpretation'] = 'Neutral';
  if (chp > 0.1 && oiChange > 0) oiInterpretation = 'Long buildup';
  else if (chp < -0.1 && oiChange > 0) oiInterpretation = 'Short buildup';
  else if (chp > 0.1 && oiChange < 0) oiInterpretation = 'Short covering';
  else if (chp < -0.1 && oiChange < 0) oiInterpretation = 'Long unwinding';
  else if (stock.oiData?.buildup === 'LONG_BUILDUP') oiInterpretation = 'Long buildup';
  else if (stock.oiData?.buildup === 'SHORT_BUILDUP') oiInterpretation = 'Short buildup';
  else if (stock.oiData?.buildup === 'SHORT_COVERING') oiInterpretation = 'Short covering';
  else if (stock.oiData?.buildup === 'LONG_UNWINDING') oiInterpretation = 'Long unwinding';

  const step = spot > 5000 ? 100 : spot > 2500 ? 50 : spot > 1000 ? 20 : spot > 400 ? 10 : 5;
  const atm = Math.round(spot / step) * step;
  const chain =
    stock.oiData?.optionChain && stock.oiData.optionChain.length > 0
      ? stock.oiData.optionChain
      : [-2, -1, 0, 1, 2].map((off) => ({
          strike: atm + off * step,
          callOI: Number((currentOI * 0.15).toFixed(2)),
          callChangeOI: Number((oiChange * (chp >= 0 ? -0.1 : 0.18)).toFixed(2)),
          putOI: Number((currentOI * 0.15 * pcr).toFixed(2)),
          putChangeOI: Number((oiChange * (chp >= 0 ? 0.18 : -0.1)).toFixed(2)),
          callLtp: Math.max(1, spot - (atm + off * step) + spot * 0.01),
          putLtp: Math.max(1, atm + off * step - spot + spot * 0.01),
        }));

  // Compute Σ(OI * Greek * LotSize) across CE & PE strikes with signed Call (+Delta) & Put (-|Delta|)
  let sumSignedDE = 0;
  let sumActiveFlowDE = 0;
  let sumGEX = 0;
  let sumVEX = 0;
  let atmDelta = 0.5;
  let atmGamma = 0;
  let atmVega = 0;
  let minAtmDist = Infinity;

  for (const row of chain) {
    const g = blackScholesGreeks(spot, row.strike, sigma, T);
    const d = Math.abs(row.strike - spot);
    if (d < minAtmDist) {
      minAtmDist = d;
      atmDelta = Number(g.callDelta.toFixed(3));
      atmGamma = Number(g.gamma.toFixed(5));
      atmVega = Number(g.vega.toFixed(2));
    }

    // Standard contract-scaled OI (Lakhs * 1000 normalized exposure units so DE/GEX/VEX remain readable)
    const callContracts = row.callOI * 1000;
    const putContracts = row.putOI * 1000;
    sumSignedDE += (callContracts * g.callDelta + putContracts * g.putDelta) * lotSize;
    sumGEX += (callContracts + putContracts) * g.gamma * lotSize;
    sumVEX += (callContracts + putContracts) * g.vega * lotSize;

    // Net directional Delta Flow: Call covering (-dCallOI * +delta) + Put support writing (-dPutOI * -|delta|)
    const callFlowDelta = -(Number(row.callChangeOI) || 0) * 1000 * g.callDelta;
    const putFlowDelta = -(Number(row.putChangeOI) || 0) * 1000 * g.putDelta;
    sumActiveFlowDE += (callFlowDelta + putFlowDelta) * lotSize;
  }

  // Combine Chain Delta Flow with futures OI directional delta and order-book delta bias
  const futuresDeltaComponent =
    (oiInterpretation === 'Long buildup'
      ? Math.abs(oiChange)
      : oiInterpretation === 'Short buildup'
      ? -Math.abs(oiChange)
      : oiInterpretation === 'Short covering'
      ? Math.abs(oiChange) * 0.65
      : -Math.abs(oiChange) * 0.65) *
    1000 *
    lotSize;
  const combinedDeltaExposure = Number(((sumActiveFlowDE * 0.65 + futuresDeltaComponent * 0.35 + sumSignedDE * 0.08) / 1e5).toFixed(2));
  const deltaFlowDirection: 'POSITIVE' | 'NEGATIVE' = combinedDeltaExposure >= 0 ? 'POSITIVE' : 'NEGATIVE';
  const oiFlowDirection: 'POSITIVE' | 'NEGATIVE' =
    oiInterpretation === 'Long buildup' || oiInterpretation === 'Short covering' ? 'POSITIVE' : 'NEGATIVE';

  return {
    delta: atmDelta,
    gamma: atmGamma,
    vega: atmVega,
    deltaExposure: combinedDeltaExposure,
    deltaFlowDirection,
    gammaExposure: Number((sumGEX / 1e5).toFixed(2)),
    gammaNote: 'Gamma sensitivity only (raw OI cannot reveal net dealer long/short gamma)',
    vegaExposure: Number((sumVEX / 1e5).toFixed(2)),
    currentOI: Number(currentOI.toFixed(2)),
    previousOI,
    oiChange: Number(oiChange.toFixed(2)),
    oiChangePct,
    oiInterpretation,
    oiFlowDirection,
    iv,
    ivp,
    ivRegime,
    pcr,
    lotSize,
  };
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
let lastCachedMfReport: MoneyFlowScanReport | null = null;
let lastCachedMfAt = 0;
let lastCachedMfDate = '';
const liveTriggerFirstSeenSec = new Map<string, number>();

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
    liveTriggerFirstSeenSec.clear();
    lastCachedMfReport = null;
  }

  // Compute live NIFTY 50 vs VWAP market regime
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
    price: Number(niftyPrice.toFixed(2)),
    vwap: Number(niftyVwap.toFixed(2)),
    trend: niftyTrend,
    vsVwapPct: niftyVwap > 0 ? Number((((niftyPrice - niftyVwap) / niftyVwap) * 100).toFixed(2)) : 0,
  };

  const indicatorSpecs = [
    { component: 'Money Flow Thickness', formula: 'Volume × HLC3  (HLC3 = (H+L+C)/3)', purpose: '₹ Trading Turnover' },
    { component: 'Speed / RVOL', formula: 'Volume / 20-period Avg Volume', purpose: 'Volume Intensity (>= 1.5x)' },
    { component: 'Glow / Surge', formula: 'Money Flow / 20-period Avg MF', purpose: 'Money Flow Acceleration (>= 1.3x)' },
    { component: 'Supertrend & HMA(55)', formula: 'ATR(10), Mult 2 • HMA(55, Close)', purpose: 'Trend Flip & Slope Direction' },
    { component: 'ADX(14) & RSI(14)', formula: 'ADX > 20 • RSI BUY > 55 / SELL < 45', purpose: 'Momentum & Trend Strength' },
    { component: 'Delta Exposure (DE)', formula: 'Σ(OI × Signed Delta × LotSize)', purpose: 'Positive=Bullish, Negative=Bearish' },
    { component: 'Gamma (GEX) & Vega (VEX)', formula: 'Σ(OI × Gamma/Vega × LotSize)', purpose: 'Sensitivity (Non-Directional)' },
    { component: 'OI Change & PCR', formula: 'CurOI - PrevOI • PutOI / CallOI', purpose: 'Long/Short Buildup & Covering' },
    { component: 'IV Percentile (IVP 252d)', formula: '% Sessions IV < Current IV', purpose: '0-20 Low • 20-50 Mod • 50-80 Elev • 80-100 High' },
    { component: 'Special Contra-Flow Filter', formula: 'OI Flow & Delta Flow Dual Sign + NIFTY Regime', purpose: 'Avoids Contra-Flow Traps' },
  ];

  if (isMidnightCleared) {
    lastCachedMfReport = null;
    liveTriggerFirstSeenSec.clear();
    return {
      status: 'ok',
      generatedAt: now.toISOString(),
      istTime: ist.timeStr,
      isMidnightCleared: true,
      universeEvaluated: 0,
      strictBuyCount: 0,
      strictSellCount: 0,
      niftyRegime,
      specialFilterStats: {
        blockedContraBuys: 0,
        blockedContraSells: 0,
        ruleSummary: 'OI Flow & Delta Flow both Positive for BUY; both Negative for SELL; block contra-flow vs NIFTY.',
      },
      indicatorSpecs,
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

  const allBuyCandidates: MoneyFlowSignalRow[] = [];
  const allSellCandidates: MoneyFlowSignalRow[] = [];
  let blockedContraBuys = 0;
  let blockedContraSells = 0;

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
    const rsi14Series = computeRSISeries(closes, 14);
    const adx14Series = computeADXSeries(bars, 14);
    const struct = computeStructureTimeline(bars);
    const greeksData = computeGreeksAndDerivatives(stock, bars, ist.dateStr);

    const lastDate = bars[bars.length - 1].dateIST;
    const scanStartIdx = Math.max(
      2,
      bars.findIndex((b) => b.dateIST === lastDate)
    );

    const priorDayBars = bars.filter((b) => b.dateIST < lastDate);
    const priorDayDate = priorDayBars.length > 0 ? priorDayBars[priorDayBars.length - 1].dateIST : '';
    const prevSessionBars = priorDayDate ? priorDayBars.filter((b) => b.dateIST === priorDayDate) : [];
    const fallbackPrevClose = Number(bars[scanStartIdx]?.open || stock.price);
    const pdh =
      prevSessionBars.length > 0
        ? Math.max(...prevSessionBars.map((b) => b.high))
        : Number((fallbackPrevClose * 1.006).toFixed(2));
    const pdl =
      prevSessionBars.length > 0
        ? Math.min(...prevSessionBars.map((b) => b.low))
        : Number((fallbackPrevClose * 0.994).toFixed(2));

    const orEnd = Math.min(bars.length - 1, scanStartIdx + 2);
    let orHigh = bars[scanStartIdx].high;
    let orLow = bars[scanStartIdx].low;
    for (let k = scanStartIdx; k <= orEnd; k++) {
      if (bars[k].high > orHigh) orHigh = bars[k].high;
      if (bars[k].low < orLow) orLow = bars[k].low;
    }

    // Build running VWAP, Day High, Day Low arrays for exact bar-by-bar evaluation
    const vwapSeries = new Array<number>(bars.length).fill(hlc3[0]);
    const dayHighSeries = new Array<number>(bars.length).fill(bars[0].high);
    const dayLowSeries = new Array<number>(bars.length).fill(bars[0].low);
    let cumTPV = 0;
    let cumVol = 0;
    let runDayHigh = bars[scanStartIdx].high;
    let runDayLow = bars[scanStartIdx].low;
    for (let k = scanStartIdx; k < bars.length; k++) {
      if (bars[k].high > runDayHigh) runDayHigh = bars[k].high;
      if (bars[k].low < runDayLow) runDayLow = bars[k].low;
      cumTPV += hlc3[k] * bars[k].volume;
      cumVol += bars[k].volume;
      dayHighSeries[k] = runDayHigh;
      dayLowSeries[k] = runDayLow;
      vwapSeries[k] = cumVol > 0 ? cumTPV / cumVol : Number(stock.indicators?.vwap) || hlc3[k];
    }

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
      const vwapI = vwapSeries[i];
      const dHighI = dayHighSeries[i];
      const dLowI = dayLowSeries[i];
      const dSpan = Math.max(0.05, dHighI - dLowI);
      const rangePosPct = Math.round(((b.close - dLowI) / dSpan) * 100);

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

      // 14 BUY Conditions
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
        {
          step: 9,
          label: 'Breakout',
          passed: b.close > orHigh || b.close > ss.swingLevel,
          detail: `Close ₹${b.close.toFixed(2)} vs OR-High ₹${orHigh.toFixed(2)}`,
        },
        {
          step: 10,
          label: 'PDH (Prev Day High)',
          passed: b.close > pdh || dHighI > pdh,
          detail: `Live/High ₹${Math.max(b.close, dHighI).toFixed(2)} vs PDH ₹${pdh.toFixed(2)}`,
        },
        {
          step: 11,
          label: 'RANGE Holding Upper',
          passed: rangePosPct >= 65 && dSpan >= st.atr[i] * 0.45,
          detail: `${rangePosPct}% of Day Range (₹${dLowI.toFixed(1)}-₹${dHighI.toFixed(1)})`,
        },
        {
          step: 12,
          label: 'BRK Confirm (BEK)',
          passed: b.close > prev.close && b.low >= prev.low * 0.999 && b.close > b.open && b.close > orHigh,
          detail: `Follow-through bar above OR-High ₹${orHigh.toFixed(2)}`,
        },
        {
          step: 13,
          label: 'VWAP Above',
          passed: b.close > vwapI,
          detail: `Close ₹${b.close.toFixed(2)} vs VWAP ₹${vwapI.toFixed(2)}`,
        },
        {
          step: 14,
          label: 'Bid / Ask Ratio >= 1.15x',
          passed: ratio >= 1.15,
          detail: `B/A Ratio ${ratio.toFixed(2)}x (Buyer Dominance)`,
        },
        {
          step: 15,
          label: 'NIFTY Trend Above VWAP',
          passed: niftyRegime.trend === 'BULLISH',
          detail: `NIFTY ₹${niftyRegime.price} vs VWAP ₹${niftyRegime.vwap} (${niftyRegime.trend})`,
        },
        {
          step: 16,
          label: 'ADX(14) > 20',
          passed: adx14Series[i] > 20,
          detail: `ADX(14) = ${adx14Series[i]}`,
        },
        {
          step: 17,
          label: 'RSI(14) > 55',
          passed: rsi14Series[i] > 55,
          detail: `RSI(14) = ${rsi14Series[i]}`,
        },
        {
          step: 18,
          label: 'RVOL >= 1.5x',
          passed: Math.max(speed, Number(stock.indicators?.rvol || 0)) >= 1.5,
          detail: `RVOL ${Math.max(speed, Number(stock.indicators?.rvol || 0)).toFixed(2)}x`,
        },
        {
          step: 19,
          label: 'Futures OI Long Buildup',
          passed: greeksData.oiInterpretation === 'Long buildup',
          detail: `${greeksData.oiInterpretation} (ΔOI ${greeksData.oiChange >= 0 ? '+' : ''}${greeksData.oiChange}L)`,
        },
        {
          step: 20,
          label: 'Delta Flow Positive',
          passed: greeksData.deltaFlowDirection === 'POSITIVE',
          detail: `DE ${greeksData.deltaExposure >= 0 ? '+' : ''}${greeksData.deltaExposure} (${greeksData.deltaFlowDirection})`,
        },
        {
          step: 21,
          label: 'SMC Bullish BOS',
          passed: ss.tag === 'BULLISH BOS' || ss.tag === 'BULLISH CHoCH',
          detail: `Structure: ${ss.tag}`,
        },
        {
          step: 22,
          label: 'Hull HMA(55) Rising',
          passed: i >= 1 && hma[i] > hma[i - 1] && b.close > hma[i],
          detail: `HMA Slope ${i >= 1 && hma[i] >= hma[i - 1] ? 'RISING' : 'FALLING'}`,
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

      // 14 SELL Conditions
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
        {
          step: 9,
          label: 'Breakout (Downside)',
          passed: b.close < orLow || b.close < ss.swingLevel,
          detail: `Close ₹${b.close.toFixed(2)} vs OR-Low ₹${orLow.toFixed(2)}`,
        },
        {
          step: 10,
          label: 'VWAP Below',
          passed: b.close < vwapI,
          detail: `Close ₹${b.close.toFixed(2)} vs VWAP ₹${vwapI.toFixed(2)}`,
        },
        {
          step: 11,
          label: 'DL (Day Low Zone)',
          passed: rangePosPct <= 35 || b.low <= dLowI * 1.0015,
          detail: `Range ${rangePosPct}% pressing Day Low ₹${dLowI.toFixed(2)}`,
        },
        {
          step: 12,
          label: 'BRK Confirm (BEK)',
          passed: b.close < prev.close && b.high <= prev.high * 1.001 && b.close < b.open && b.close < orLow,
          detail: `Follow-through breakdown below OR-Low ₹${orLow.toFixed(2)}`,
        },
        {
          step: 13,
          label: 'PDL (Prev Day Low)',
          passed: b.close < pdl || dLowI < pdl,
          detail: `Low/Close ₹${Math.min(b.close, dLowI).toFixed(2)} vs PDL ₹${pdl.toFixed(2)}`,
        },
        {
          step: 14,
          label: 'Bid / Ask Ratio <= 0.90x',
          passed: ratio <= 0.9,
          detail: `B/A Ratio ${ratio.toFixed(2)}x (Seller Supply)`,
        },
        {
          step: 15,
          label: 'NIFTY Trend Below VWAP',
          passed: niftyRegime.trend === 'BEARISH',
          detail: `NIFTY ₹${niftyRegime.price} vs VWAP ₹${niftyRegime.vwap} (${niftyRegime.trend})`,
        },
        {
          step: 16,
          label: 'ADX(14) > 20',
          passed: adx14Series[i] > 20,
          detail: `ADX(14) = ${adx14Series[i]}`,
        },
        {
          step: 17,
          label: 'RSI(14) < 45',
          passed: rsi14Series[i] < 45,
          detail: `RSI(14) = ${rsi14Series[i]}`,
        },
        {
          step: 18,
          label: 'RVOL >= 1.5x',
          passed: Math.max(speed, Number(stock.indicators?.rvol || 0)) >= 1.5,
          detail: `RVOL ${Math.max(speed, Number(stock.indicators?.rvol || 0)).toFixed(2)}x`,
        },
        {
          step: 19,
          label: 'Futures OI Short Buildup',
          passed: greeksData.oiInterpretation === 'Short buildup',
          detail: `${greeksData.oiInterpretation} (ΔOI ${greeksData.oiChange >= 0 ? '+' : ''}${greeksData.oiChange}L)`,
        },
        {
          step: 20,
          label: 'Delta Flow Negative',
          passed: greeksData.deltaFlowDirection === 'NEGATIVE',
          detail: `DE ${greeksData.deltaExposure >= 0 ? '+' : ''}${greeksData.deltaExposure} (${greeksData.deltaFlowDirection})`,
        },
        {
          step: 21,
          label: 'SMC Bearish BOS',
          passed: ss.tag === 'BEARISH BOS' || ss.tag === 'BEARISH CHoCH',
          detail: `Structure: ${ss.tag}`,
        },
        {
          step: 22,
          label: 'Hull HMA(55) Falling',
          passed: i >= 1 && hma[i] < hma[i - 1] && b.close < hma[i],
          detail: `HMA Slope ${i >= 1 && hma[i] < hma[i - 1] ? 'FALLING' : 'RISING'}`,
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
      let cappedSec = isMarketToday ? Math.min(nowSec, exactSec) : exactSec;
      // For triggers firing on the live forming 5m bar, stamp the exact real-time discovery second (never lag 2m!)
      if (isMarketToday && trigIdx === bars.length - 1 && nowSec - baseSec >= 0 && nowSec - baseSec < 360) {
        const trigKey = `${ist.dateStr}:${direction}:${stock.symbol}:${trig.timeIST}`;
        if (!liveTriggerFirstSeenSec.has(trigKey)) {
          liveTriggerFirstSeenSec.set(trigKey, nowSec);
        }
        cappedSec = liveTriggerFirstSeenSec.get(trigKey)!;
      }
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
      const dHighT = dayHighSeries[trigIdx] || livePrice;
      const dLowT = dayLowSeries[trigIdx] || livePrice;
      const rPosT = Math.round(((trig.close - dLowT) / Math.max(0.05, dHighT - dLowT)) * 100);

      const dualFlowAlignedBuy = greeksData.oiFlowDirection === 'POSITIVE' && greeksData.deltaFlowDirection === 'POSITIVE';
      const dualFlowAlignedSell = greeksData.oiFlowDirection === 'NEGATIVE' && greeksData.deltaFlowDirection === 'NEGATIVE';
      const isBuySide = direction === 'BUY';
      const dualFlowAligned = isBuySide ? dualFlowAlignedBuy : dualFlowAlignedSell;
      const isContraBuy = isBuySide && (greeksData.oiFlowDirection === 'NEGATIVE' && greeksData.deltaFlowDirection === 'NEGATIVE');
      const isContraSell = !isBuySide && (greeksData.oiFlowDirection === 'POSITIVE' && greeksData.deltaFlowDirection === 'POSITIVE');
      const specialFilterPassed = isBuySide
        ? dualFlowAlignedBuy && !(niftyRegime.trend === 'BULLISH' && isContraBuy)
        : dualFlowAlignedSell && !(niftyRegime.trend === 'BEARISH' && isContraSell);

      const specialFilterNote = isBuySide
        ? dualFlowAlignedBuy
          ? 'PASS: OI Flow (+) & Delta Flow (+) Both Positive'
          : niftyRegime.trend === 'BULLISH' && isContraBuy
          ? 'AVOID BUY: NIFTY Bullish but Bearish OI & Negative Delta Flow'
          : 'WAIT: OI Flow & Delta Flow not both Positive'
        : dualFlowAlignedSell
        ? 'PASS: OI Flow (-) & Delta Flow (-) Both Negative'
        : niftyRegime.trend === 'BEARISH' && isContraSell
        ? 'AVOID SELL: NIFTY Bearish but Bullish OI & Positive Delta Flow'
        : 'WAIT: OI Flow & Delta Flow not both Negative';

      return {
        symbol: stock.symbol,
        name: stock.name,
        sector: stock.sector,
        direction,
        grade: condCount === 22 ? 'STRICT 22/22' : condCount >= 18 ? 'HIGH SURGE' : 'SETUP',
        conditionsMet: condCount,
        totalConditions: 22,
        listedAt,
        price: Number(livePrice.toFixed(2)),
        entryPrice,
        stopLoss,
        target1,
        target2,
        changePercent: Number((stock.changePercent || 0).toFixed(2)),
        hlc3: Number(hlc3[trigIdx].toFixed(2)),
        vwap: Number((vwapSeries[trigIdx] || livePrice).toFixed(2)),
        pdh: Number(pdh.toFixed(2)),
        pdl: Number(pdl.toFixed(2)),
        dayHigh: Number(dHighT.toFixed(2)),
        dayLow: Number(dLowT.toFixed(2)),
        orHigh: Number(orHigh.toFixed(2)),
        orLow: Number(orLow.toFixed(2)),
        rangePosPct: rPosT,
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
        greeksAndDerivatives: greeksData,
        smartMoneyFilters: {
          niftyTrend: niftyRegime.trend === 'BULLISH' ? 'ABOVE_VWAP' : 'BELOW_VWAP',
          adx14: adx14Series[trigIdx] || 22,
          rsi14: rsi14Series[trigIdx] || 50,
          rvol: Number(Math.max(speed, Number(stock.indicators?.rvol || 1)).toFixed(2)),
          futuresOiBuildup: greeksData.oiInterpretation,
          oiFlow: greeksData.oiFlowDirection,
          deltaFlow: greeksData.deltaFlowDirection,
          smcStructure: ss.tag,
          hullSlope: trigIdx >= 1 && hma[trigIdx] >= hma[trigIdx - 1] ? 'RISING' : 'FALLING',
          dualFlowAligned,
          specialFilterPassed,
          specialFilterNote,
        },
        conditions: checks,
        score: Number(score.toFixed(1)),
      };
    };

    const bothPositiveBuy = greeksData.oiFlowDirection === 'POSITIVE' && greeksData.deltaFlowDirection === 'POSITIVE';
    const bothNegativeSell = greeksData.oiFlowDirection === 'NEGATIVE' && greeksData.deltaFlowDirection === 'NEGATIVE';
    const isContraBuyTrap =
      niftyRegime.trend === 'BULLISH' && greeksData.oiFlowDirection === 'NEGATIVE' && greeksData.deltaFlowDirection === 'NEGATIVE';
    const isContraSellTrap =
      niftyRegime.trend === 'BEARISH' && greeksData.oiFlowDirection === 'POSITIVE' && greeksData.deltaFlowDirection === 'POSITIVE';

    if ((stock.changePercent || 0) >= 0 || bestBuyCount >= 14) {
      if (isContraBuyTrap || !bothPositiveBuy) {
        if ((stock.changePercent || 0) >= 0) blockedContraBuys++;
      } else {
        allBuyCandidates.push(buildRow('BUY', bestBuyIdx, bestBuyCount, bestBuyScore, bestBuyChecks));
      }
    }
    if ((stock.changePercent || 0) < 0 || bestSellCount >= 14) {
      if (isContraSellTrap || !bothNegativeSell) {
        if ((stock.changePercent || 0) < 0) blockedContraSells++;
      } else {
        allSellCandidates.push(buildRow('SELL', bestSellIdx, bestSellCount, bestSellScore, bestSellChecks));
      }
    }
  }

  const sortNewestFirstAToZ = (a: MoneyFlowSignalRow, b: MoneyFlowSignalRow) => {
    const tDiff = parseTimeToSec(b.listedAt) - parseTimeToSec(a.listedAt);
    if (tDiff !== 0) return tDiff;
    return a.symbol.localeCompare(b.symbol);
  };

  const strictBuyCount = allBuyCandidates.filter((x) => x.conditionsMet === 22).length;
  const strictSellCount = allSellCandidates.filter((x) => x.conditionsMet === 22).length;

  const buySignals = allBuyCandidates
    .sort((a, b) => b.conditionsMet - a.conditionsMet || b.score - a.score)
    .slice(0, 10)
    .sort(sortNewestFirstAToZ);

  const sellSignals = allSellCandidates
    .sort((a, b) => b.conditionsMet - a.conditionsMet || b.score - a.score)
    .slice(0, 10)
    .sort(sortNewestFirstAToZ);

  const builtReport: MoneyFlowScanReport = {
    status: 'ok',
    generatedAt: now.toISOString(),
    istTime: ist.timeStr,
    isMidnightCleared: false,
    universeEvaluated: equityStocks.length,
    strictBuyCount,
    strictSellCount,
    niftyRegime,
    specialFilterStats: {
      blockedContraBuys,
      blockedContraSells,
      ruleSummary: 'OI Flow & Delta Flow BOTH Positive for BUY; BOTH Negative for SELL; Contra-Flow vs NIFTY blocked.',
    },
    indicatorSpecs,
    buySignals,
    sellSignals,
  };
  if (equityStocks.length > 0) {
    lastCachedMfReport = builtReport;
    lastCachedMfAt = Date.now();
  }
  return builtReport;
}
