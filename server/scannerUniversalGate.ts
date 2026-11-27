import { Candle, ScannedStock } from '../src/types';
import { getISTDateParts } from '../src/data/marketSchedule';
import { IntradayCandleBar } from './autonomousPriceService';
import { ClaudeFnoBar, formatClockHHMMSS, parseClockSec } from './claudeFnoEngine';
import { computeRvolFromBars } from './smartMoneyConceptsEngine';
import { computeWilderAdx } from './topMomentumEngine';
import {
  getLockedSessionWindowStatus,
  LOCKED_SYSTEM_RULES,
  passesRule3Thresholds,
} from './systemFiveRules';

export const UNIVERSAL_STRONG_RVOL_MIN = LOCKED_SYSTEM_RULES.MIN_RVOL_STRICT; // > 2.00
export const UNIVERSAL_STRONG_XTIME_VOL_MIN = LOCKED_SYSTEM_RULES.MIN_VOL_BAZAAR_XTIME_STRICT; // > 1.00X (Volume Bazaar X-Time)
export const UNIVERSAL_STRONG_ADX_MIN = LOCKED_SYSTEM_RULES.MIN_ADX; // >= 25.0
export const UNIVERSAL_MAX_PER_DIRECTION = LOCKED_SYSTEM_RULES.MAX_STOCKS_PER_DIRECTION; // Best 10 UP / Best 10 DOWN

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

  const rule3 = passesRule3Thresholds(rvol, xTimeVolume, adx, true);

  return {
    rvol,
    xTimeVolume,
    adx,
    plusDI,
    minusDI,
    strongRvolPassed: rule3.strongRvolPassed,
    strongXTimeVolPassed: rule3.strongXTimeVolPassed,
    adxPassed: rule3.adxPassed,
    passedAll: rule3.passedAll,
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
  now?: Date;
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
 * Sticky Session Registry for all Scanners (LOCKED RULES 1, 2, 3, 4):
 * 1. STRICT ADMISSION (Rule 2 & Rule 3): A stock can ONLY enter a scanner if it matches the scanner's
 *    existing formula AND passes Strong RVOL > 2.00, Volume Bazaar X-Time Volume > 1.00X,
 *    and ADX(14) >= 25+. Zero fake signals — if 0 qualify show 0, if 7 qualify show 7, max 10.
 * 2. PERMANENT SAME-DAY LOCK (Rule 4): Once a stock is listed on the dashboard during the session,
 *    it is NEVER removed on subsequent refreshes or intraday pullbacks until 23:59:00 IST auto-flush.
 *    Already-listed stocks hold strict slot priority over newly arriving candidates so an 11th stock
 *    can NEVER evict an already-listed stock.
 * 3. CATEGORY-WISE Z -> A ORDER (Rule 4): Every scanner output is strictly sorted by LISTED AT
 *    newest-first with Z -> A symbol tie-breaking.
 */
export class StickyScannerRegistry {
  private sessionDateIST: string = '';
  private scanners: Map<string, Map<string, StickyEntry<any>>> = new Map();
  private hydratedScanners: Set<string> = new Set();

  public resetAll(): void {
    this.scanners.clear();
    this.hydratedScanners.clear();
  }

  public resetScanner(scannerKey: string): void {
    this.scanners.delete(scannerKey);
    this.hydratedScanners.delete(scannerKey);
  }

  public getLockedCount(scannerKey: string): number {
    return this.scanners.get(scannerKey)?.size || 0;
  }

  private ensureSession(dateIST: string, isMidnightCleared: boolean): void {
    if (isMidnightCleared) {
      if (this.scanners.size > 0) this.scanners.clear();
      if (this.hydratedScanners.size > 0) this.hydratedScanners.clear();
      this.sessionDateIST = dateIST;
      return;
    }
    if (this.sessionDateIST && this.sessionDateIST !== dateIST) {
      this.scanners.clear();
      this.hydratedScanners.clear();
    }
    this.sessionDateIST = dateIST;
  }

  public filterAndStabilizeRows<T>(params: StabilizeParams<T>): T[] {
    const liveSession = getLockedSessionWindowStatus(params.now || new Date());
    const todayIST = params.dateIST || liveSession.dateIST;
    this.ensureSession(todayIST, params.isMidnightCleared);

    if (params.isMidnightCleared) {
      return [];
    }

    let bucket = this.scanners.get(params.scannerKey);
    if (!bucket) {
      bucket = new Map<string, StickyEntry<T>>();
      this.scanners.set(params.scannerKey, bucket);
    }
    const wasAlreadyHydrated = this.hydratedScanners.has(params.scannerKey);
    const stampRealtimeAdmission =
      wasAlreadyHydrated &&
      liveSession.isLiveScanWindow &&
      (!params.dateIST || params.dateIST === liveSession.dateIST);

    const effectiveMax =
      params.maxRows && params.maxRows > 0
        ? params.maxRows
        : UNIVERSAL_MAX_PER_DIRECTION;

    const bypassedRows: T[] = [];
    const freshMatchedMap = new Map<string, { row: T; metrics: UniversalStrongMetrics }>();
    const brandNewEligible: Array<{ sym: string; row: T; metrics: UniversalStrongMetrics }> = [];

    for (const row of params.rows || []) {
      if (params.shouldBypassGate?.(row)) {
        bypassedRows.push(row);
        continue;
      }

      const sym = String(params.getSymbol(row) || '').toUpperCase().trim();
      if (!sym) continue;

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
        // RULE 4: Already listed today — NEVER remove; update live LTP/metrics in-place
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
        freshMatchedMap.set(sym, { row: updatedRow, metrics: stabilizedMetrics });
      } else if (metrics.passedAll && !params.exhaustedSymbols?.has(sym)) {
        // Brand-new strictly eligible candidate (formula + RVOL > 2.00 + Vol Bazaar X-Time > 1.00X + ADX >= 25)
        if (!freshMatchedMap.has(sym) && !brandNewEligible.some((c) => c.sym === sym)) {
          brandNewEligible.push({ sym, row, metrics });
        }
      }
    }

    // 1. First retain ALL previously locked stocks in the bucket (RULE 4: NEVER remove before 23:59 IST!)
    const lockedRows: T[] = [];
    for (const [sym, entry] of bucket.entries()) {
      const freshItem = freshMatchedMap.get(sym);
      if (freshItem) {
        lockedRows.push(freshItem.row);
        continue;
      }
      const liveStock = params.liveStockMap.get(sym);
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
      lockedRows.push(updated);
    }

    // 2. Only fill remaining open slots up to effectiveMax (Best 10) with top-ranked brand-new eligible stocks
    //    So an 11th stock can NEVER evict an already-listed stock (RULE 2 + RULE 4)!
    const openSlots = Math.max(0, effectiveMax - lockedRows.length);
    const newlyAdmitted: T[] = [];
    for (const cand of brandNewEligible.slice(0, openSlots)) {
      const { sym, row, metrics } = cand;
      const liveStock = params.liveStockMap.get(sym);
      const side = params.getSide(row);
      const entryPrice = params.getEntryPrice
        ? params.getEntryPrice(row)
        : Number((row as any).entryPrice ?? (row as any).entry ?? (row as any).price ?? liveStock?.price ?? 0);
      const stopLoss = params.getStopLoss
        ? params.getStopLoss(row)
        : Number((row as any).stopLoss ?? (row as any).sl ?? (row as any).stop ?? 0);
      let enriched = params.enrichRow
        ? params.enrichRow(row, metrics, false)
        : defaultEnrichRow(row, metrics, false);

      // REAL-TIME LIVE ADMISSION: Stamp exact live IST clock when a brand-new stock enters a
      // running live scanner (09:20-15:15 IST), or when input listedAt is missing/'--'.
      const rawEnriched = enriched as any;
      const hasValidListedAt =
        typeof rawEnriched?.listedAt === 'string' &&
        /^\d{2}:\d{2}(:\d{2})?$/.test(rawEnriched.listedAt.trim());
      if (
        rawEnriched &&
        typeof rawEnriched === 'object' &&
        (stampRealtimeAdmission || (!hasValidListedAt && liveSession.isLiveScanWindow))
      ) {
        const stamped: any = {
          ...rawEnriched,
          listedAt: liveSession.timeIST,
        };
        if ('listed_at' in stamped) stamped.listed_at = liveSession.timeIST;
        if ('entryTime' in stamped) stamped.entryTime = liveSession.timeIST;
        if ('signalListedAt' in stamped) stamped.signalListedAt = liveSession.timeIST;
        enriched = stamped as T;
      }

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
      newlyAdmitted.push(enriched);
    }

    // Mark scanner hydrated once it has completed an evaluation pass with market data present
    if ((params.rows && params.rows.length > 0) || bucket.size > 0 || params.liveStockMap.size > 0) {
      this.hydratedScanners.add(params.scannerKey);
    }

    const combined = [...bypassedRows.slice(0, effectiveMax), ...lockedRows, ...newlyAdmitted];
    const finalRows =
      bypassedRows.length > 0 && combined.length > effectiveMax
        ? combined.slice(0, effectiveMax)
        : combined;
    return sortRowsByListedAtDescZtoA(finalRows, params.getSymbol);
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

function stabilizeDualDirectionBest10<T>(
  registry: StickyScannerRegistry,
  baseKey: string,
  rows: T[],
  common: Omit<StabilizeParams<T>, 'scannerKey' | 'rows' | 'maxRows' | 'getSide'> & {
    getSide: (row: T) => 'BUY' | 'SELL';
  }
): T[] {
  const buys: T[] = [];
  const sells: T[] = [];
  for (const r of rows || []) {
    if (common.shouldBypassGate?.(r)) {
      buys.push(r);
      continue;
    }
    if (common.getSide(r) === 'SELL') sells.push(r);
    else buys.push(r);
  }
  const stabilizedBuy = registry.filterAndStabilizeRows({
    ...common,
    scannerKey: `${baseKey}:BUY`,
    rows: buys,
    maxRows: UNIVERSAL_MAX_PER_DIRECTION,
    getSide: () => 'BUY',
  });
  const stabilizedSell = registry.filterAndStabilizeRows({
    ...common,
    scannerKey: `${baseKey}:SELL`,
    rows: sells,
    maxRows: UNIVERSAL_MAX_PER_DIRECTION,
    getSide: () => 'SELL',
  });
  return sortRowsByListedAtDescZtoA([...stabilizedBuy, ...stabilizedSell], common.getSymbol);
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
    maxRows: UNIVERSAL_MAX_PER_DIRECTION,
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
    maxRows: UNIVERSAL_MAX_PER_DIRECTION,
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
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
      maxPerDirection: UNIVERSAL_MAX_PER_DIRECTION,
    },
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
    maxRows: UNIVERSAL_MAX_PER_DIRECTION,
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'BUY',
    getEntryPrice: (r: any) => Number(r.entryPrice) || 0,
    getStopLoss: (r: any) => Number(r.stopLoss) || 0,
    getRvol: (r: any) => Number(r.rvol) || 0,
    getXTimeVol: (r: any) => Number(r.xTimeVolume ?? r.barVolRatio) || 0,
    getAdx: (r: any) => Number(r.adx) || 0,
  });

  const sellSignals = registry.filterAndStabilizeRows({
    scannerKey: 'money-flow:SELL',
    rows: report?.sellSignals || [],
    liveStockMap: liveMap,
    getBarsFn,
    isMidnightCleared: isCleared,
    maxRows: UNIVERSAL_MAX_PER_DIRECTION,
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'SELL',
    getEntryPrice: (r: any) => Number(r.entryPrice) || 0,
    getStopLoss: (r: any) => Number(r.stopLoss) || 0,
    getRvol: (r: any) => Number(r.rvol) || 0,
    getXTimeVol: (r: any) => Number(r.xTimeVolume ?? r.barVolRatio) || 0,
    getAdx: (r: any) => Number(r.adx) || 0,
  });

  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
      maxPerDirection: UNIVERSAL_MAX_PER_DIRECTION,
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
    maxRows: UNIVERSAL_MAX_PER_DIRECTION,
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'BUY',
    getEntryPrice: (r: any) => Number(r.entryPrice) || 0,
    getStopLoss: (r: any) => Number(r.stopLoss) || 0,
    getRvol: (r: any) => Number(r.rvol) || 0,
    getXTimeVol: (r: any) => Number(r.xTimeVolume ?? r.barVolRatio) || 0,
    getAdx: (r: any) => Number(r.adx) || 0,
  });

  const sellSignals = registry.filterAndStabilizeRows({
    scannerKey: 'muhurat-flow:SELL',
    rows: report?.sellSignals || [],
    liveStockMap: liveMap,
    getBarsFn,
    isMidnightCleared: isCleared,
    maxRows: UNIVERSAL_MAX_PER_DIRECTION,
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'SELL',
    getEntryPrice: (r: any) => Number(r.entryPrice) || 0,
    getStopLoss: (r: any) => Number(r.stopLoss) || 0,
    getRvol: (r: any) => Number(r.rvol) || 0,
    getXTimeVol: (r: any) => Number(r.xTimeVolume ?? r.barVolRatio) || 0,
    getAdx: (r: any) => Number(r.adx) || 0,
  });

  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
      maxPerDirection: UNIVERSAL_MAX_PER_DIRECTION,
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

  const runDualCat = (key: string, rows: any[]) =>
    stabilizeDualDirectionBest10(registry, `most-active-fno:${timeframe}:${key}`, rows || [], {
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      shouldBypassGate: isOptionRow,
      getSymbol: (r: any) => r.underlying || r.symbol,
      getSide: (r: any) => inferSide(r),
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.ltp ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol) || 0,
      getXTimeVol: (r: any) => Number(r.xTimeVolume ?? r.barVolRatio) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const nextCats = {
    ...cats,
    mostActiveFno: runDualCat('mostActiveFno', cats.mostActiveFno),
    topTradedByVolume: runDualCat('topTradedByVolume', cats.topTradedByVolume),
    topTradedByValue: runDualCat('topTradedByValue', cats.topTradedByValue),
    mostActiveUnderlying: runDualCat('mostActiveUnderlying', cats.mostActiveUnderlying),
    mostActiveEquities: runDualCat('mostActiveEquities', cats.mostActiveEquities),
    oiChangeLeaders: runDualCat('oiChangeLeaders', cats.oiChangeLeaders),
    rankedFno: runDualCat('rankedFno', cats.rankedFno),
    rankedEquities: runDualCat('rankedEquities', cats.rankedEquities),
  };

  const eqAll = nextCats.mostActiveFno.filter((r: any) => !isOptionRow(r));
  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
      maxPerDirection: UNIVERSAL_MAX_PER_DIRECTION,
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

  const runDualCat = (key: string, rows: any[]) =>
    stabilizeDualDirectionBest10(registry, `claude-fno:${key}`, rows || [], {
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      shouldBypassGate: isOptionRow,
      getSymbol: (r: any) => r.underlying || r.symbol,
      getSide: (r: any) => inferSide(r),
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.ltp ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol) || 0,
      getXTimeVol: (r: any) => Number(r.xTimeVolume ?? r.barVolRatio) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const nextCats = {
    ...cats,
    qualifiedTrades: runDualCat('qualifiedTrades', cats.qualifiedTrades),
    topVolAndValueQualified: runDualCat('topVolAndValueQualified', cats.topVolAndValueQualified),
    equitiesFno: runDualCat('equitiesFno', cats.equitiesFno),
    nearMissWatchlist: runDualCat('nearMissWatchlist', cats.nearMissWatchlist),
    topVolumeRankings: runDualCat('topVolumeRankings', cats.topVolumeRankings),
    topValueRankings: runDualCat('topValueRankings', cats.topValueRankings),
  };

  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
      maxPerDirection: UNIVERSAL_MAX_PER_DIRECTION,
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

  const runSingleCat = (key: string, rows: any[], fixedSide: 'BUY' | 'SELL') =>
    registry.filterAndStabilizeRows({
      scannerKey: `smc:${timeframe}:${key}`,
      rows: rows || [],
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      maxRows: UNIVERSAL_MAX_PER_DIRECTION,
      getSymbol: (r: any) => r.symbol,
      getSide: () => fixedSide,
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol) || 0,
      getXTimeVol: (r: any) => Number(r.xTimeVolume ?? r.barVolRatio) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const runDualCat = (key: string, rows: any[]) =>
    stabilizeDualDirectionBest10(registry, `smc:${timeframe}:${key}`, rows || [], {
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      getSymbol: (r: any) => r.symbol,
      getSide: (r: any) => inferSide(r),
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol) || 0,
      getXTimeVol: (r: any) => Number(r.xTimeVolume ?? r.barVolRatio) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const nextCats = {
    allSetups: runDualCat('allSetups', cats.allSetups),
    qualified5of5: runDualCat('qualified5of5', cats.qualified5of5),
    buyDiscountSetups: runSingleCat('buyDiscountSetups', cats.buyDiscountSetups, 'BUY'),
    sellPremiumSetups: runSingleCat('sellPremiumSetups', cats.sellPremiumSetups, 'SELL'),
    unmitigatedObFvg: runDualCat('unmitigatedObFvg', cats.unmitigatedObFvg),
    bosChochBreaker: runDualCat('bosChochBreaker', cats.bosChochBreaker),
  };

  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
      maxPerDirection: UNIVERSAL_MAX_PER_DIRECTION,
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

  const runSingleCat = (key: string, rows: any[], fixedSide: 'BUY' | 'SELL') =>
    registry.filterAndStabilizeRows({
      scannerKey: `price-action:${key}`,
      rows: rows || [],
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      maxRows: UNIVERSAL_MAX_PER_DIRECTION,
      getSymbol: (r: any) => r.symbol,
      getSide: () => fixedSide,
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol) || 0,
      getXTimeVol: (r: any) => Number(r.xTimeVolume ?? r.barVolRatio) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const runDualCat = (key: string, rows: any[]) =>
    stabilizeDualDirectionBest10(registry, `price-action:${key}`, rows || [], {
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      getSymbol: (r: any) => r.symbol,
      getSide: (r: any) => inferSide(r),
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol) || 0,
      getXTimeVol: (r: any) => Number(r.xTimeVolume ?? r.barVolRatio) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const nextCats = {
    allSignals: runDualCat('allSignals', cats.allSignals),
    qualified9of9: runDualCat('qualified9of9', cats.qualified9of9),
    buySignals: runSingleCat('buySignals', cats.buySignals, 'BUY'),
    sellSignals: runSingleCat('sellSignals', cats.sellSignals, 'SELL'),
    orbMomentum: runDualCat('orbMomentum', cats.orbMomentum),
    demandSupplySweep: runDualCat('demandSupplySweep', cats.demandSupplySweep),
  };

  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
      maxPerDirection: UNIVERSAL_MAX_PER_DIRECTION,
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

  const runSingleCat = (key: string, rows: any[], fixedSide: 'BUY' | 'SELL') =>
    registry.filterAndStabilizeRows({
      scannerKey: `intraday-stock:${key}`,
      rows: rows || [],
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      maxRows: UNIVERSAL_MAX_PER_DIRECTION,
      shouldBypassGate: isIndexTarget,
      getSymbol: (r: any) => r.symbol,
      getSide: () => fixedSide,
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol) || 0,
      getXTimeVol: (r: any) => Number(r.xTimeVolume ?? r.barVolRatio) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const runDualCat = (key: string, rows: any[]) =>
    stabilizeDualDirectionBest10(registry, `intraday-stock:${key}`, rows || [], {
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      shouldBypassGate: isIndexTarget,
      getSymbol: (r: any) => r.symbol,
      getSide: (r: any) => inferSide(r),
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol) || 0,
      getXTimeVol: (r: any) => Number(r.xTimeVolume ?? r.barVolRatio) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const nextCats = {
    allSetups: runDualCat('allSetups', cats.allSetups),
    cumDeltaConfirmed: runDualCat('cumDeltaConfirmed', cats.cumDeltaConfirmed),
    qualifiedDfc: runDualCat('qualifiedDfc', cats.qualifiedDfc),
    buySetups: runSingleCat('buySetups', cats.buySetups, 'BUY'),
    sellSetups: runSingleCat('sellSetups', cats.sellSetups, 'SELL'),
    gapUpBreakouts: runSingleCat('gapUpBreakouts', cats.gapUpBreakouts, 'BUY'),
    gapDownBreakouts: runSingleCat('gapDownBreakouts', cats.gapDownBreakouts, 'SELL'),
    indexTargets: cats.indexTargets || [],
  };

  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
      maxPerDirection: UNIVERSAL_MAX_PER_DIRECTION,
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

  const runSingleCat = (key: string, rows: any[], fixedSide: 'BUY' | 'SELL') =>
    registry.filterAndStabilizeRows({
      scannerKey: `apex-alpha:${key}`,
      rows: rows || [],
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      maxRows: UNIVERSAL_MAX_PER_DIRECTION,
      getSymbol: (r: any) => r.symbol,
      getSide: () => fixedSide,
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol ?? r.rvol5m) || 0,
      getXTimeVol: (r: any) => Number(r.xTimeVolume ?? r.barVolRatio) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const runDualCat = (key: string, rows: any[]) =>
    stabilizeDualDirectionBest10(registry, `apex-alpha:${key}`, rows || [], {
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: isCleared,
      getSymbol: (r: any) => r.symbol,
      getSide: (r: any) => inferSide(r),
      getEntryPrice: (r: any) => Number(r.entryPrice ?? r.price) || 0,
      getStopLoss: (r: any) => Number(r.stopLoss) || 0,
      getRvol: (r: any) => Number(r.rvol ?? r.rvol5m) || 0,
      getXTimeVol: (r: any) => Number(r.xTimeVolume ?? r.barVolRatio) || 0,
      getAdx: (r: any) => Number(r.adx) || 0,
    });

  const nextCats = {
    qualifiedAlpha: runDualCat('qualifiedAlpha', cats.qualifiedAlpha),
    vwapCoilSetups: runDualCat('vwapCoilSetups', cats.vwapCoilSetups),
    pdhPdlReclaim: runDualCat('pdhPdlReclaim', cats.pdhPdlReclaim),
    buySetups: runSingleCat('buySetups', cats.buySetups, 'BUY'),
    sellSetups: runSingleCat('sellSetups', cats.sellSetups, 'SELL'),
    nearTriggerWatch: runDualCat('nearTriggerWatch', cats.nearTriggerWatch),
  };

  return {
    ...report,
    universalThresholds: {
      strongRvolMin: UNIVERSAL_STRONG_RVOL_MIN,
      strongXTimeVolMin: UNIVERSAL_STRONG_XTIME_VOL_MIN,
      adxMin: UNIVERSAL_STRONG_ADX_MIN,
      maxPerDirection: UNIVERSAL_MAX_PER_DIRECTION,
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
