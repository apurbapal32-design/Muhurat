import { Candle, ScannedStock } from '../src/types';
import { getISTDateParts } from '../src/data/marketSchedule';
import { IntradayCandleBar } from './autonomousPriceService';
import { ClaudeFnoBar, formatClockHHMMSS, parseClockSec } from './claudeFnoEngine';
import { computeRvolFromBars } from './smartMoneyConceptsEngine';
import { computeWilderAdx } from './topMomentumEngine';

export const UNIVERSAL_STRONG_RVOL_MIN = 2.0;
export const UNIVERSAL_STRONG_XTIME_VOL_MIN = 2.0;
export const UNIVERSAL_STRONG_ADX_MIN = 25.0;

export interface UniversalStrongMetrics {
  rvol: number;
  xTimeVolume: number;
  adx: number;
  plusDI: number;
  minusDI: number;
  strongRvolPassed: boolean;
  strongXTimeVolPassed: boolean;
  adxPassed: boolean;
  passedAll: boolean;
}

function round2(n: number): number {
  return Number((Number.isFinite(n) ? n : 0).toFixed(2));
}

export function normalizeBarsTo5m(
  rawBars: IntradayCandleBar[] | Candle[] | undefined
): ClaudeFnoBar[] {
  if (!rawBars || rawBars.length === 0) return [];
  const out: ClaudeFnoBar[] = [];
  for (const b of rawBars as any[]) {
    const o = Number(b.open);
    const h = Number(b.high);
    const l = Number(b.low);
    const c = Number(b.close);
    const v = Math.max(0, Number(b.volume) || 0);
    if (
      !Number.isFinite(o) ||
      !Number.isFinite(h) ||
      !Number.isFinite(l) ||
      !Number.isFinite(c) ||
      c <= 0
    ) {
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
  out.sort((a, b) =>
    a.dateIST === b.dateIST
      ? a.secIST - b.secIST
      : a.dateIST.localeCompare(b.dateIST)
  );
  return out;
}

/**
 * Computes flicker-resistant 5m X-Time Volume multiple:
 * Compares the peak volume across the most recent 3 bars against the prior 20-bar
 * baseline average volume so opening a new 5m bar with tiny partial volume never
 * falsely drops X-Time Volume to 0.1X.
 */
export function computeXTimeVolumeFromBars(bars: ClaudeFnoBar[]): number {
  if (!bars || bars.length < 3) return 0;
  const recentWindow = bars.slice(-Math.min(3, bars.length));
  const peakRecentVol = Math.max(...recentWindow.map((b) => Math.max(0, b.volume)));
  if (peakRecentVol <= 0) return 0;

  // Baseline: up to 20 bars prior to the latest bar (fallback to all bars except peak if short)
  const baselineSlice =
    bars.length >= 6
      ? bars.slice(Math.max(0, bars.length - 23), bars.length - 1)
      : bars.slice(0, bars.length - 1);
  const meaningful = baselineSlice.map((b) => b.volume).filter((v) => v > 0);
  if (meaningful.length === 0) return 0;

  // Trim single largest spike from baseline if we have enough samples so ignition bar doesn't inflate its own denominator
  const sortedBase = [...meaningful].sort((a, b) => a - b);
  const trimmed = sortedBase.length >= 5 ? sortedBase.slice(0, -1) : sortedBase;
  const avgBase = trimmed.reduce((a, b) => a + b, 0) / Math.max(1, trimmed.length);
  if (avgBase <= 0) return 0;

  return round2(Math.min(25, peakRecentVol / avgBase));
}

/**
 * Flicker-resistant RVOL over the most recent 3 bars vs prior 20-bar baseline:
 * Prevents a single quiet closing candle or newly-opened forming 5m bar from collapsing
 * real institutional volume (e.g., 3.6x -> 0.32x) while keeping genuinely quiet stocks < 2.00.
 */
export function computeFlickerResistantRvolFromBars(
  bars: ClaudeFnoBar[],
  lookback: number = 20
): number {
  if (!bars || bars.length < 3) return 0;
  const rawLastRvol = computeRvolFromBars(bars, lookback);
  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  const prev2 = bars.length >= 3 ? bars[bars.length - 3] : undefined;

  const effectiveVol = Math.max(
    Math.max(0, last.volume),
    prev && prev.volume > 0 ? prev.volume : 0,
    prev2 && prev2.volume > 0 ? prev2.volume * 0.88 : 0
  );
  if (effectiveVol <= 0) return round2(rawLastRvol);

  const baseSlice = bars.slice(Math.max(0, bars.length - (lookback + 2)), bars.length - 1);
  const meaningful = baseSlice.map((b) => Math.max(0, b.volume)).filter((v) => v > 0);
  if (meaningful.length === 0) return round2(rawLastRvol);

  const sortedBase = [...meaningful].sort((a, b) => a - b);
  const trimmed = sortedBase.length >= 6 ? sortedBase.slice(0, -1) : sortedBase;
  const avgBase = trimmed.reduce((a, b) => a + b, 0) / Math.max(1, trimmed.length);
  if (avgBase <= 0) return round2(rawLastRvol);

  return round2(Math.max(rawLastRvol, Math.min(25, effectiveVol / avgBase)));
}

/**
 * Extracts a row's LISTED AT timestamp string across all scanner schemas and parses it into IST seconds.
 */
export function extractListedAtSec(row: any): number {
  if (!row || typeof row !== 'object') return 0;
  const candidates = [
    row.listedAt,
    row.listed_at,
    row.entryTime,
    row.breakTimeIST,
    row.signalTimeIST,
    row.triggerTime,
    row.timeIST,
    row.timestampIST,
  ];
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '--' || trimmed === '--:--:--') continue;
    const match = trimmed.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      const h = parseInt(match[1], 10) || 0;
      const m = parseInt(match[2], 10) || 0;
      const s = parseInt(match[3] || '0', 10) || 0;
      const sec = h * 3600 + m * 60 + s;
      if (sec > 0) return sec;
    }
    const parsed = parseClockSec(trimmed);
    if (parsed > 0) return parsed;
  }
  return 0;
}

/**
 * Universal Category-Wise LISTED AT Z -> A Sorter:
 * 1) Latest LISTED AT timestamp FIRST (e.g., 15:20:00 -> 14:45:00 -> 10:30:00 -> 09:20:00; missing/'--' at bottom)
 * 2) Tie-breaker: Symbol Z -> A (reverse alphabetical)
 */
export function sortRowsByListedAtDescZtoA<T>(
  rows: T[],
  getSymbol: (row: T) => string = (r: any) => String(r?.symbol || r?.underlying || ''),
  getTimeSec: (row: T) => number = extractListedAtSec
): T[] {
  return [...(rows || [])].sort((a, b) => {
    const secA = getTimeSec(a);
    const secB = getTimeSec(b);
    if (secB !== secA) return secB - secA;
    const symA = String(getSymbol(a) || '').toUpperCase();
    const symB = String(getSymbol(b) || '').toUpperCase();
    return symB.localeCompare(symA);
  });
}

/**
 * Computes the universal Strong Formula Gate metrics across all scanners:
 * - Strong RVOL >= 2.00
 * - Strong X-Time Volume >= 2.00X
 * - Wilder's ADX(14) >= 25.0
 *
 * Strictly zero fake defaults: if real bars are missing and no finite positive
 * value exists, returns 0 and fails the gate.
 */
export function computeUniversalStrongMetrics(
  rawBars: IntradayCandleBar[] | Candle[] | ClaudeFnoBar[] | undefined,
  explicitRvol?: number,
  explicitAdx?: number,
  explicitXTimeVol?: number
): UniversalStrongMetrics {
  const bars =
    Array.isArray(rawBars) && rawBars.length > 0 && typeof (rawBars[0] as any)?.secIST === 'number'
      ? (rawBars as ClaudeFnoBar[])
      : normalizeBarsTo5m(rawBars as IntradayCandleBar[] | Candle[] | undefined);

  const barRvol = bars.length >= 3 ? computeFlickerResistantRvolFromBars(bars, 20) : 0;
  const safeExpRvol = Number.isFinite(explicitRvol) && (explicitRvol as number) > 0 ? (explicitRvol as number) : 0;
  const rvol = round2(Math.max(barRvol, safeExpRvol));

  const barXTime = computeXTimeVolumeFromBars(bars);
  const safeExpXTime =
    Number.isFinite(explicitXTimeVol) && (explicitXTimeVol as number) > 0
      ? (explicitXTimeVol as number)
      : 0;
  const xTimeVolume = round2(Math.max(barXTime, safeExpXTime));

  let adx = 0;
  let plusDI = 0;
  let minusDI = 0;
  if (bars.length >= 4) {
    const adxObj = computeWilderAdx(bars, 14);
    adx = adxObj.adx;
    plusDI = adxObj.plusDI;
    minusDI = adxObj.minusDI;
  } else if (Number.isFinite(explicitAdx) && (explicitAdx as number) > 0) {
    adx = round2(explicitAdx as number);
  }

  const strongRvolPassed = rvol >= UNIVERSAL_STRONG_RVOL_MIN;
  const strongXTimeVolPassed = xTimeVolume >= UNIVERSAL_STRONG_XTIME_VOL_MIN;
  const adxPassed = adx >= UNIVERSAL_STRONG_ADX_MIN;

  return {
    rvol,
    xTimeVolume,
    adx,
    plusDI,
    minusDI,
    strongRvolPassed,
    strongXTimeVolPassed,
    adxPassed,
    passedAll: strongRvolPassed && strongXTimeVolPassed && adxPassed,
  };
}

interface StickyEntry<T = any> {
  symbol: string;
  side: 'BUY' | 'SELL';
  row: T;
  entryPrice: number;
  stopLoss: number;
  peakRvol: number;
  peakXTimeVolume: number;
  peakAdx: number;
  lockedAtMs: number;
}

export interface StabilizeParams<T> {
  scannerKey: string;
  rows: T[];
  liveStockMap: Map<string, ScannedStock>;
  getBarsFn: (symbol: string) => IntradayCandleBar[] | Candle[] | undefined;
  isMidnightCleared: boolean;
  dateIST?: string;
  maxRows?: number;
  getSymbol: (row: T) => string;
  getSide: (row: T) => 'BUY' | 'SELL';
  getEntryPrice?: (row: T) => number;
  getStopLoss?: (row: T) => number;
  getRvol?: (row: T) => number | undefined;
  getAdx?: (row: T) => number | undefined;
  getXTimeVol?: (row: T) => number | undefined;
  shouldBypassGate?: (row: T) => boolean;
  exhaustedSymbols?: Set<string>;
  enrichRow?: (row: T, metrics: UniversalStrongMetrics, isStickyRetained: boolean) => T;
  updateLiveRow?: (lockedRow: T, liveStock: ScannedStock | undefined, freshRow: T | undefined, metrics: UniversalStrongMetrics) => T;
}

/**
 * Sticky Session Registry for all Scanners:
 * 1. STRICT ADMISSION: A stock can ONLY enter a scanner if it matches the scanner's
 *    existing formula AND passes Strong RVOL >= 2.00, Strong X-Time Volume >= 2.00X,
 *    and ADX(14) >= 25+. Ineligible stocks are NEVER shown.
 * 2. ZERO REFRESH KICK-OUT: Once a stock genuinely qualifies and is listed in a scanner,
 *    subsequent scanner refreshes update its live price/CHG%/metrics WITHOUT removing it
 *    on minor tick/bar flickers — unless Hard Stop Loss is breached, direction reverses
 *    sharply opposite to its locked side, exhaustion exit triggers, or 12:00 AM IST resets.
 */
export class StickyScannerRegistry {
  private sessionDateIST: string = '';
  private scanners: Map<string, Map<string, StickyEntry<any>>> = new Map();

  public resetAll(): void {
    this.scanners.clear();
  }

  public resetScanner(scannerKey: string): void {
    this.scanners.delete(scannerKey);
  }

  public getLockedCount(scannerKey: string): number {
    return this.scanners.get(scannerKey)?.size || 0;
  }

  private ensureSession(dateIST: string, isMidnightCleared: boolean): void {
    if (isMidnightCleared) {
      if (this.scanners.size > 0) this.scanners.clear();
      this.sessionDateIST = dateIST;
      return;
    }
    if (this.sessionDateIST && this.sessionDateIST !== dateIST) {
      this.scanners.clear();
    }
    this.sessionDateIST = dateIST;
  }

  private isInvalidated(
    entry: StickyEntry<any>,
    liveStock: ScannedStock | undefined,
    exhaustedSymbols?: Set<string>
  ): boolean {
    if (exhaustedSymbols && exhaustedSymbols.has(entry.symbol)) {
      return true;
    }
    if (!liveStock || !Number.isFinite(liveStock.price) || liveStock.price <= 0) {
      return false;
    }
    const lp = liveStock.price;
    const chg = Number(liveStock.changePercent) || 0;

    if (entry.side === 'BUY') {
      if (entry.stopLoss > 0 && lp <= entry.stopLoss) return true;
      if (entry.entryPrice > 0 && chg <= -0.5 && lp < entry.entryPrice * 0.992) return true;
    } else {
      if (entry.stopLoss > 0 && lp >= entry.stopLoss) return true;
      if (entry.entryPrice > 0 && chg >= 0.5 && lp > entry.entryPrice * 1.008) return true;
    }
    return false;
  }

  public filterAndStabilizeRows<T>(params: StabilizeParams<T>): T[] {
    const todayIST = params.dateIST || getISTDateParts().dateStr;
    this.ensureSession(todayIST, params.isMidnightCleared);

    if (params.isMidnightCleared) {
      return [];
    }

    let bucket = this.scanners.get(params.scannerKey);
    if (!bucket) {
      bucket = new Map<string, StickyEntry<T>>();
      this.scanners.set(params.scannerKey, bucket);
    }

    const bypassedRows: T[] = [];
    const freshBySym = new Map<string, { row: T; metrics: UniversalStrongMetrics }>();

    for (const row of params.rows || []) {
      if (params.shouldBypassGate?.(row)) {
        bypassedRows.push(row);
        continue;
      }

      const sym = String(params.getSymbol(row) || '').toUpperCase().trim();
      if (!sym) continue;
      if (params.exhaustedSymbols?.has(sym)) {
        bucket.delete(sym);
        continue;
      }

      const liveStock = params.liveStockMap.get(sym);
      const bars = params.getBarsFn(sym);
      const expRvol = params.getRvol ? params.getRvol(row) : liveStock?.indicators?.rvol;
      const expAdx = params.getAdx ? params.getAdx(row) : liveStock?.indicators?.adx;
      const expXTime = params.getXTimeVol ? params.getXTimeVol(row) : liveStock?.indicators?.xTimeVolume;

      const metrics = computeUniversalStrongMetrics(
        bars,
        Math.max(Number(expRvol) || 0, Number(liveStock?.indicators?.rvol) || 0),
        Number(expAdx) || Number(liveStock?.indicators?.adx) || 0,
        Math.max(Number(expXTime) || 0, Number(liveStock?.indicators?.xTimeVolume) || 0)
      );

      const existing = bucket.get(sym);
      if (existing) {
        // Already genuinely qualified earlier today — update live values, keep sticky
        const stabilizedMetrics: UniversalStrongMetrics = {
          ...metrics,
          rvol: Math.max(metrics.rvol, existing.peakRvol),
          xTimeVolume: Math.max(metrics.xTimeVolume, existing.peakXTimeVolume),
          adx: Math.max(metrics.adx, existing.peakAdx),
          strongRvolPassed: true,
          strongXTimeVolPassed: true,
          adxPassed: true,
          passedAll: true,
        };
        existing.peakRvol = stabilizedMetrics.rvol;
        existing.peakXTimeVolume = stabilizedMetrics.xTimeVolume;
        existing.peakAdx = stabilizedMetrics.adx;

        const updatedRow = params.updateLiveRow
          ? params.updateLiveRow(existing.row, liveStock, row, stabilizedMetrics)
          : params.enrichRow
          ? params.enrichRow(row, stabilizedMetrics, true)
          : defaultMergeLiveFields(existing.row, liveStock, row, stabilizedMetrics);
        existing.row = updatedRow;
        freshBySym.set(sym, { row: updatedRow, metrics: stabilizedMetrics });
      } else if (metrics.passedAll) {
        // Brand-new strictly eligible qualification (existing formula + RVOL>=2 + XTime>=2 + ADX>=25)
        const side = params.getSide(row);
        const entryPrice = params.getEntryPrice ? params.getEntryPrice(row) : Number((row as any).entryPrice ?? (row as any).entry ?? (row as any).price ?? liveStock?.price ?? 0);
        const stopLoss = params.getStopLoss ? params.getStopLoss(row) : Number((row as any).stopLoss ?? (row as any).sl ?? (row as any).stop ?? 0);
        const enriched = params.enrichRow
          ? params.enrichRow(row, metrics, false)
          : defaultEnrichRow(row, metrics, false);

        bucket.set(sym, {
          symbol: sym,
          side,
          row: enriched,
          entryPrice,
          stopLoss,
          peakRvol: metrics.rvol,
          peakXTimeVolume: metrics.xTimeVolume,
          peakAdx: metrics.adx,
          lockedAtMs: Date.now(),
        });
        freshBySym.set(sym, { row: enriched, metrics });
      }
    }

    // Build final stabilized output: fresh eligible/updated rows + sticky retained rows that weren't invalidated
    const result: T[] = [...bypassedRows];
    const seenSyms = new Set<string>();

    // First include all currently active fresh rows in their engine-ranked order
    for (const [sym, item] of freshBySym.entries()) {
      const entry = bucket.get(sym);
      const liveStock = params.liveStockMap.get(sym);
      if (entry && this.isInvalidated(entry, liveStock, params.exhaustedSymbols)) {
        bucket.delete(sym);
        continue;
      }
      result.push(item.row);
      seenSyms.add(sym);
    }

    // Then retain previously locked rows that temporarily flickered out during scanner refresh
    for (const [sym, entry] of [...bucket.entries()]) {
      if (seenSyms.has(sym)) continue;
      const liveStock = params.liveStockMap.get(sym);
      if (this.isInvalidated(entry, liveStock, params.exhaustedSymbols)) {
        bucket.delete(sym);
        continue;
      }
      const bars = params.getBarsFn(sym);
      const liveMetrics = computeUniversalStrongMetrics(
        bars,
        liveStock?.indicators?.rvol,
        liveStock?.indicators?.adx,
        liveStock?.indicators?.xTimeVolume
      );
      const retainedMetrics: UniversalStrongMetrics = {
        ...liveMetrics,
        rvol: Math.max(liveMetrics.rvol, entry.peakRvol),
        xTimeVolume: Math.max(liveMetrics.xTimeVolume, entry.peakXTimeVolume),
        adx: Math.max(liveMetrics.adx, entry.peakAdx),
        strongRvolPassed: true,
        strongXTimeVolPassed: true,
        adxPassed: true,
        passedAll: true,
      };
      const updated = params.updateLiveRow
        ? params.updateLiveRow(entry.row, liveStock, undefined, retainedMetrics)
        : defaultMergeLiveFields(entry.row, liveStock, undefined, retainedMetrics);
      entry.row = updated;
      result.push(updated);
      seenSyms.add(sym);
    }

    const capped =
      params.maxRows && params.maxRows > 0 && result.length > params.maxRows
        ? result.slice(0, params.maxRows)
        : result;
    return sortRowsByListedAtDescZtoA(capped, params.getSymbol);
  }
}

function defaultEnrichRow<T>(
  row: T,
  metrics: UniversalStrongMetrics,
  isStickyRetained: boolean
): T {
  const r = row as any;
  return {
    ...r,
    rvol: Math.max(Number(r.rvol) || 0, metrics.rvol),
    xTimeVolume: metrics.xTimeVolume,
    adx: metrics.adx,
    plusDI: metrics.plusDI || r.plusDI || 0,
    minusDI: metrics.minusDI || r.minusDI || 0,
    strongRvolPassed: metrics.strongRvolPassed,
    strongXTimeVolPassed: metrics.strongXTimeVolPassed,
    adxPassed: metrics.adxPassed,
    strongGatePassed: metrics.passedAll,
    stickyRetained: isStickyRetained,
  };
}

function defaultMergeLiveFields<T>(
  lockedRow: T,
  liveStock: ScannedStock | undefined,
  freshRow: T | undefined,
  metrics: UniversalStrongMetrics
): T {
  const base: any = freshRow
    ? {
        ...(freshRow as any),
        // Preserve original anchor levels & listing time so they never jump on refresh
        listedAt: (lockedRow as any).listedAt || (freshRow as any).listedAt,
        entryTime: (lockedRow as any).entryTime || (freshRow as any).entryTime,
        breakTimeIST: (lockedRow as any).breakTimeIST || (freshRow as any).breakTimeIST,
        rej1TimeIST: (lockedRow as any).rej1TimeIST || (freshRow as any).rej1TimeIST,
        entryPrice: (lockedRow as any).entryPrice || (freshRow as any).entryPrice,
        stopLoss: (lockedRow as any).stopLoss || (freshRow as any).stopLoss,
        target1: (lockedRow as any).target1 || (freshRow as any).target1,
        target2: (lockedRow as any).target2 || (freshRow as any).target2,
      }
    : { ...(lockedRow as any) };

  if (liveStock && liveStock.price > 0) {
    if ('price' in base) base.price = liveStock.price;
    if ('ltp' in base) base.ltp = liveStock.price;
    if ('changePercent' in base) base.changePercent = liveStock.changePercent;
    if ('chgPct' in base) base.chgPct = liveStock.changePercent;
    if ('volume' in base && liveStock.volume > 0) base.volume = liveStock.volume;
    if ('vwap' in base && liveStock.indicators?.vwap > 0) base.vwap = liveStock.indicators.vwap;
    if ('bidAskRatio' in base && liveStock.bidAskRatio) base.bidAskRatio = liveStock.bidAskRatio;
    if ('turnoverCr' in base && liveStock.volume > 0) {
      base.turnoverCr = round2((liveStock.volume * liveStock.price) / 1e7);
    }
  }

  return defaultEnrichRow(base, metrics, !freshRow);
}

export const stickyScannerRegistry = new StickyScannerRegistry();

// ============================================================================
// REPORT-LEVEL UNIVERSAL GATE + STICKY LOCK ADAPTERS FOR ALL BACKEND SCANNERS
// ============================================================================

function buildLiveStockMap(stocks: ScannedStock[]): Map<string, ScannedStock> {
  const m = new Map<string, ScannedStock>();
  for (const s of stocks || []) {
    if (s?.symbol) m.set(s.symbol.toUpperCase(), s);
  }
  return m;
}

export type CandlesLookup = Map<string, Candle[]> | Record<string, Candle[]>;

function makeBarsGetter(
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined,
  candlesMap: CandlesLookup
) {
  return (sym: string): IntradayCandleBar[] | Candle[] | undefined => {
    const ext = getExtendedBarsFn(sym);
    if (ext && ext.length > 0) return ext;
    if (candlesMap instanceof Map) {
      return candlesMap.get(sym) || candlesMap.get(sym.toUpperCase());
    }
    return candlesMap[sym] || candlesMap[sym.toUpperCase()];
  };
}

function inferSide(row: any, fallback: 'BUY' | 'SELL' = 'BUY'): 'BUY' | 'SELL' {
  const raw = String(
    row?.direction ?? row?.side ?? row?.signal ?? row?.action ?? row?.bias ?? ''
  ).toUpperCase();
  if (raw.includes('SELL') || raw.includes('SHORT') || raw.includes('BEAR') || raw.includes('PE')) {
    return 'SELL';
  }
  if (raw.includes('BUY') || raw.includes('LONG') || raw.includes('BULL') || raw.includes('CE')) {
    return 'BUY';
  }
  const chg = Number(row?.changePercent ?? row?.chgPct ?? 0);
  if (chg < 0) return 'SELL';
  if (chg > 0) return 'BUY';
  return fallback;
}

export function applyUniversalGateToTopMomentumReport(
  report: any,
  stocks: ScannedStock[],
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined,
  candlesMap: CandlesLookup,
  registry: StickyScannerRegistry = stickyScannerRegistry
) {
  const liveMap = buildLiveStockMap(stocks);
  const getBarsFn = makeBarsGetter(getExtendedBarsFn, candlesMap);
  const isCleared = Boolean(report?.isMidnightCleared);
  const exhaustedSyms = new Set<string>(
    (report?.exhaustedSignals || []).map((r: any) => String(r.symbol || '').toUpperCase())
  );

  const buySignals = registry.filterAndStabilizeRows({
    scannerKey: 'top-momentum:BUY',
    rows: report?.buySignals || [],
    liveStockMap: liveMap,
    getBarsFn,
    isMidnightCleared: isCleared,
    maxRows: 20,
    exhaustedSymbols: exhaustedSyms,
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'BUY',
    getEntryPrice: (r: any) => Number(r.entryPrice) || 0,
    getStopLoss: (r: any) => Number(r.stopLoss) || 0,
    getRvol: (r: any) => Number(r.rvol) || 0,
    getAdx: (r: any) => Number(r.adx) || 0,
    getXTimeVol: (r: any) => Number(r.xTimeVolume) || 0,
  });

  const sellSignals = registry.filterAndStabilizeRows({
    scannerKey: 'top-momentum:SELL',
    rows: report?.sellSignals || [],
    liveStockMap: liveMap,
    getBarsFn,
    isMidnightCleared: isCleared,
    maxRows: 20,
    exhaustedSymbols: exhaustedSyms,
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'SELL',
    getEntryPrice: (r: any) => Number(r.entryPrice) || 0,
    getStopLoss: (r: any) => Number(r.stopLoss) || 0,
    getRvol: (r: any) => Number(r.rvol) || 0,
    getAdx: (r: any) => Number(r.adx) || 0,
    getXTimeVol: (r: any) => Number(r.xTimeVolume) || 0,
  });

  return {
    ...report,
    buySignals,
    sellSignals,
    buyCount: buySignals.length,
    sellCount: sellSignals.length,
    earlyIgnitionBuyCount: buySignals.filter((r: any) => r.shouldAlertNow).length,
    earlyIgnitionSellCount: sellSignals.filter((r: any) => r.shouldAlertNow).length,
  };
}

export function applyUniversalGateToMoneyFlowReport(
  report: any,
  stocks: ScannedStock[],
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined,
  candlesMap: CandlesLookup,
  registry: StickyScannerRegistry = stickyScannerRegistry
) {
  const liveMap = buildLiveStockMap(stocks);
  const getBarsFn = makeBarsGetter(getExtendedBarsFn, candlesMap);
  const isCleared = Boolean(report?.isMidnightCleared);

  const buySignals = registry.filterAndStabilizeRows({
    scannerKey: 'money-flow:BUY',
    rows: report?.buySignals || [],
    liveStockMap: liveMap,
    getBarsFn,
    isMidnightCleared: isCleared,
    maxRows: 25,
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'BUY',
    getEntryPrice: (r: any) => Number(r.entryPrice) || 0,
    getStopLoss: (r: any) => Number(r.stopLoss) || 0,
    getRvol: (r: any) => Number(r.rvol) || 0,
    getAdx: (r: any) => Number(r.adx) || 0,
  });

  const sellSignals = registry.filterAndStabilizeRows({
    scannerKey: 'money-flow:SELL',
    rows: report?.sellSignals || [],
    liveStockMap: liveMap,
    getBarsFn,
    isMidnightCleared: isCleared,
    maxRows: 25,
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'SELL',
    getEntryPrice: (r: any) => Number(r.entryPrice) || 0,
    getStopLoss: (r: any) => Number(r.stopLoss) || 0,
    getRvol: (r: any) => Number(r.rvol) || 0,
    getAdx: (r: any) => Number(r.adx) || 0,
  });

  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
    },
    buySignals,
    sellSignals,
    buyCount: buySignals.length,
    sellCount: sellSignals.length,
    confirmedBuyCount: buySignals.filter((r: any) => r.allSixMet || r.conditionsMet >= 6).length,
    confirmedSellCount: sellSignals.filter((r: any) => r.allSixMet || r.conditionsMet >= 6).length,
  };
}

export function applyUniversalGateToMuhuratFlowReport(
  report: any,
  stocks: ScannedStock[],
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined,
  candlesMap: CandlesLookup,
  registry: StickyScannerRegistry = stickyScannerRegistry
) {
  const liveMap = buildLiveStockMap(stocks);
  const getBarsFn = makeBarsGetter(getExtendedBarsFn, candlesMap);
  const isCleared = Boolean(report?.isMidnightCleared);

  const buySignals = registry.filterAndStabilizeRows({
    scannerKey: 'muhurat-flow:BUY',
    rows: report?.buySignals || [],
    liveStockMap: liveMap,
    getBarsFn,
    isMidnightCleared: isCleared,
    maxRows: 30,
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'BUY',
    getEntryPrice: (r: any) => Number(r.entryPrice) || 0,
    getStopLoss: (r: any) => Number(r.stopLoss) || 0,
    getRvol: (r: any) => Number(r.rvol) || 0,
    getAdx: (r: any) => Number(r.adx) || 0,
  });

  const sellSignals = registry.filterAndStabilizeRows({
    scannerKey: 'muhurat-flow:SELL',
    rows: report?.sellSignals || [],
    liveStockMap: liveMap,
    getBarsFn,
    isMidnightCleared: isCleared,
    maxRows: 30,
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'SELL',
    getEntryPrice: (r: any) => Number(r.entryPrice) || 0,
    getStopLoss: (r: any) => Number(r.stopLoss) || 0,
    getRvol: (r: any) => Number(r.rvol) || 0,
    getAdx: (r: any) => Number(r.adx) || 0,
  });

  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
    },
    buySignals,
    sellSignals,
    buyCount: buySignals.length,
    sellCount: sellSignals.length,
    confirmedBuyCount: buySignals.filter((r: any) => r.allSixMet).length,
    confirmedSellCount: sellSignals.filter((r: any) => r.allSixMet).length,
  };
}

export function applyUniversalGateToMostActiveFnoReport(
  report: any,
  stocks: ScannedStock[],
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined,
  candlesMap: CandlesLookup,
  timeframe: string = '5m',
  registry: StickyScannerRegistry = stickyScannerRegistry
) {
  const liveMap = buildLiveStockMap(stocks);
  const getBarsFn = makeBarsGetter(getExtendedBarsFn, candlesMap);
  const isCleared = Boolean(report?.isMidnightCleared);
  const cats = report?.categories || {};

  const isOptionRow = (r: any) =>
    r?.instrumentType === 'INDEX_OPTION' ||
    r?.category === 'INDEX_OPTIONS' ||
    /CE$|PE$/.test(String(r?.contractName || r?.symbol || '').toUpperCase());

  const runCat = (key: string, rows: any[], maxRows = 40) =>
    registry.filterAndStabilizeRows({
      scannerKey: `most-active-fno:${timeframe}:${key}`,
      rows: rows || [],
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      maxRows,
      shouldBypassGate: isOptionRow,
      getSymbol: (r: any) => r.underlying || r.symbol,
      getSide: (r: any) => inferSide(r),
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.ltp ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const nextCats = {
    ...cats,
    mostActiveFno: runCat('mostActiveFno', cats.mostActiveFno),
    topTradedByVolume: runCat('topTradedByVolume', cats.topTradedByVolume),
    topTradedByValue: runCat('topTradedByValue', cats.topTradedByValue),
    mostActiveUnderlying: runCat('mostActiveUnderlying', cats.mostActiveUnderlying),
    mostActiveEquities: runCat('mostActiveEquities', cats.mostActiveEquities),
    oiChangeLeaders: runCat('oiChangeLeaders', cats.oiChangeLeaders),
    rankedFno: runCat('rankedFno', cats.rankedFno),
    rankedEquities: runCat('rankedEquities', cats.rankedEquities),
  };

  const eqAll = nextCats.mostActiveFno.filter((r: any) => !isOptionRow(r));
  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
    },
    strictQualifiedBuyCount: eqAll.filter((r: any) => inferSide(r) === 'BUY').length,
    strictQualifiedSellCount: eqAll.filter((r: any) => inferSide(r) === 'SELL').length,
    categories: nextCats,
  };
}

export function applyUniversalGateToClaudeFnoReport(
  report: any,
  stocks: ScannedStock[],
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined,
  candlesMap: CandlesLookup,
  registry: StickyScannerRegistry = stickyScannerRegistry
) {
  const liveMap = buildLiveStockMap(stocks);
  const getBarsFn = makeBarsGetter(getExtendedBarsFn, candlesMap);
  const isCleared = Boolean(report?.isMidnightCleared);
  const cats = report?.categories || {};

  const isOptionRow = (r: any) =>
    r?.instrumentType === 'INDEX_OPTION' ||
    r?.assetClass === 'INDEX_OPTION' ||
    /CE$|PE$/.test(String(r?.contractName || r?.symbol || '').toUpperCase());

  const runCat = (key: string, rows: any[], maxRows = 40) =>
    registry.filterAndStabilizeRows({
      scannerKey: `claude-fno:${key}`,
      rows: rows || [],
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      maxRows,
      shouldBypassGate: isOptionRow,
      getSymbol: (r: any) => r.underlying || r.symbol,
      getSide: (r: any) => inferSide(r),
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.ltp ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const nextCats = {
    ...cats,
    qualifiedTrades: runCat('qualifiedTrades', cats.qualifiedTrades),
    topVolAndValueQualified: runCat('topVolAndValueQualified', cats.topVolAndValueQualified),
    equitiesFno: runCat('equitiesFno', cats.equitiesFno),
    nearMissWatchlist: runCat('nearMissWatchlist', cats.nearMissWatchlist),
    topVolumeRankings: runCat('topVolumeRankings', cats.topVolumeRankings),
    topValueRankings: runCat('topValueRankings', cats.topValueRankings),
  };

  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
    },
    qualifiedCount: nextCats.qualifiedTrades.length,
    overlapQualifiedCount: nextCats.topVolAndValueQualified.length,
    equityQualifiedCount: nextCats.equitiesFno.length,
    watchlistCount: nextCats.nearMissWatchlist.length,
    categories: nextCats,
  };
}

export function applyUniversalGateToSmcReport(
  report: any,
  stocks: ScannedStock[],
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined,
  candlesMap: CandlesLookup,
  timeframe: string = '5m',
  registry: StickyScannerRegistry = stickyScannerRegistry
) {
  const liveMap = buildLiveStockMap(stocks);
  const getBarsFn = makeBarsGetter(getExtendedBarsFn, candlesMap);
  const isCleared = Boolean(report?.isMidnightCleared);
  const cats = report?.categories || {};

  const runCat = (key: string, rows: any[], maxRows = 50) =>
    registry.filterAndStabilizeRows({
      scannerKey: `smc:${timeframe}:${key}`,
      rows: rows || [],
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      maxRows,
      getSymbol: (r: any) => r.symbol,
      getSide: (r: any) => inferSide(r),
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const nextCats = {
    allSetups: runCat('allSetups', cats.allSetups),
    qualified5of5: runCat('qualified5of5', cats.qualified5of5),
    buyDiscountSetups: runCat('buyDiscountSetups', cats.buyDiscountSetups),
    sellPremiumSetups: runCat('sellPremiumSetups', cats.sellPremiumSetups),
    unmitigatedObFvg: runCat('unmitigatedObFvg', cats.unmitigatedObFvg),
    bosChochBreaker: runCat('bosChochBreaker', cats.bosChochBreaker),
  };

  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
    },
    totalSetups: nextCats.allSetups.length,
    qualifiedCount: nextCats.qualified5of5.length,
    buyCount: nextCats.buyDiscountSetups.length,
    sellCount: nextCats.sellPremiumSetups.length,
    obFvgCount: nextCats.unmitigatedObFvg.length,
    breakerCount: nextCats.bosChochBreaker.length,
    categories: nextCats,
  };
}

export function applyUniversalGateToPriceActionReport(
  report: any,
  stocks: ScannedStock[],
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined,
  candlesMap: CandlesLookup,
  registry: StickyScannerRegistry = stickyScannerRegistry
) {
  const liveMap = buildLiveStockMap(stocks);
  const getBarsFn = makeBarsGetter(getExtendedBarsFn, candlesMap);
  const isCleared = Boolean(report?.isMidnightCleared);
  const cats = report?.categories || {};

  const runCat = (key: string, rows: any[], maxRows = 50) =>
    registry.filterAndStabilizeRows({
      scannerKey: `price-action:${key}`,
      rows: rows || [],
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      maxRows,
      getSymbol: (r: any) => r.symbol,
      getSide: (r: any) => inferSide(r),
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const nextCats = {
    allSignals: runCat('allSignals', cats.allSignals),
    qualified9of9: runCat('qualified9of9', cats.qualified9of9),
    buySignals: runCat('buySignals', cats.buySignals),
    sellSignals: runCat('sellSignals', cats.sellSignals),
    orbMomentum: runCat('orbMomentum', cats.orbMomentum),
    demandSupplySweep: runCat('demandSupplySweep', cats.demandSupplySweep),
  };

  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
    },
    totalScanned: nextCats.allSignals.length,
    qualifiedCount: nextCats.qualified9of9.length,
    buySignalCount: nextCats.buySignals.filter((r: any) => r.isFinalSignal !== false).length,
    sellSignalCount: nextCats.sellSignals.filter((r: any) => r.isFinalSignal !== false).length,
    orbCount: nextCats.orbMomentum.length,
    demandSupplyCount: nextCats.demandSupplySweep.length,
    categories: nextCats,
  };
}

export function applyUniversalGateToIntradayStockReport(
  report: any,
  stocks: ScannedStock[],
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined,
  candlesMap: CandlesLookup,
  registry: StickyScannerRegistry = stickyScannerRegistry
) {
  const liveMap = buildLiveStockMap(stocks);
  const getBarsFn = makeBarsGetter(getExtendedBarsFn, candlesMap);
  const isCleared = Boolean(report?.isMidnightCleared);
  const cats = report?.categories || {};

  const isIndexTarget = (r: any) => Boolean(r?.isIndex) || String(r?.assetType || '').toUpperCase() === 'INDEX';

  const runCat = (key: string, rows: any[], maxRows = 50) =>
    registry.filterAndStabilizeRows({
      scannerKey: `intraday-stock:${key}`,
      rows: rows || [],
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      maxRows,
      shouldBypassGate: isIndexTarget,
      getSymbol: (r: any) => r.symbol,
      getSide: (r: any) => inferSide(r),
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const nextCats = {
    allSetups: runCat('allSetups', cats.allSetups),
    cumDeltaConfirmed: runCat('cumDeltaConfirmed', cats.cumDeltaConfirmed),
    qualifiedDfc: runCat('qualifiedDfc', cats.qualifiedDfc),
    buySetups: runCat('buySetups', cats.buySetups),
    sellSetups: runCat('sellSetups', cats.sellSetups),
    gapUpBreakouts: runCat('gapUpBreakouts', cats.gapUpBreakouts),
    gapDownBreakouts: runCat('gapDownBreakouts', cats.gapDownBreakouts),
    indexTargets: cats.indexTargets || [],
  };

  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
    },
    totalScanned: nextCats.allSetups.length,
    qualifiedDfcCount: nextCats.qualifiedDfc.length,
    confirmedCumDeltaBuyCount: nextCats.cumDeltaConfirmed.filter((r: any) => inferSide(r) === 'BUY').length,
    confirmedCumDeltaSellCount: nextCats.cumDeltaConfirmed.filter((r: any) => inferSide(r) === 'SELL').length,
    buyCount: nextCats.buySetups.length,
    sellCount: nextCats.sellSetups.length,
    gapUpBreakoutCount: nextCats.gapUpBreakouts.length,
    gapDownBreakoutCount: nextCats.gapDownBreakouts.length,
    totalEligibleUpCount: nextCats.buySetups.length,
    totalEligibleDownCount: nextCats.sellSetups.length,
    categories: nextCats,
  };
}

export function applyUniversalGateToApexAlphaReport(
  report: any,
  stocks: ScannedStock[],
  getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined,
  candlesMap: CandlesLookup,
  registry: StickyScannerRegistry = stickyScannerRegistry
) {
  const liveMap = buildLiveStockMap(stocks);
  const getBarsFn = makeBarsGetter(getExtendedBarsFn, candlesMap);
  const isCleared = Boolean(report?.isMidnightCleared);
  const cats = report?.categories || {};

  const runCat = (key: string, rows: any[], maxRows = 40) =>
    registry.filterAndStabilizeRows({
      scannerKey: `apex-alpha:${key}`,
      rows: rows || [],
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      maxRows,
      getSymbol: (r: any) => r.symbol,
      getSide: (r: any) => inferSide(r),
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const nextCats = {
    qualifiedAlpha: runCat('qualifiedAlpha', cats.qualifiedAlpha),
    vwapCoilSetups: runCat('vwapCoilSetups', cats.vwapCoilSetups),
    pdhPdlReclaim: runCat('pdhPdlReclaim', cats.pdhPdlReclaim),
    buySetups: runCat('buySetups', cats.buySetups),
    sellSetups: runCat('sellSetups', cats.sellSetups),
    nearTriggerWatch: runCat('nearTriggerWatch', cats.nearTriggerWatch),
  };

  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
    },
    qualifiedCount: nextCats.qualifiedAlpha.length,
    coilCount: nextCats.vwapCoilSetups.length,
    reclaimCount: nextCats.pdhPdlReclaim.length,
    buyCount: nextCats.buySetups.length,
    sellCount: nextCats.sellSetups.length,
    watchCount: nextCats.nearTriggerWatch.length,
    totalQualifiedUpCount: nextCats.qualifiedAlpha.filter((r: any) => inferSide(r) === 'BUY').length,
    totalQualifiedDownCount: nextCats.qualifiedAlpha.filter((r: any) => inferSide(r) === 'SELL').length,
    totalEligibleUpCount: nextCats.buySetups.length,
    totalEligibleDownCount: nextCats.sellSetups.length,
    categories: nextCats,
  };
}
