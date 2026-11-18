import { Candle, ScannedStock } from '../src/types';
import { getISTDateParts } from '../src/data/marketSchedule';
import { IntradayCandleBar, UnifiedMarketQuote } from './autonomousPriceService';
import { ClaudeFnoBar, formatClockHHMMSS, parseClockSec } from './claudeFnoEngine';
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
  isDfcQualified: boolean;
  entryStatus: IntradayEntryStatus;
  volatileChop: boolean;

  // PDF Candlestick & Day First Candle (DFC @ 09:15 5m)
  dfcTime: string;
  dfcColor: 'GREEN' | 'RED';
  dfcOpen: number;
  dfcHigh: number;
  dfcLow: number;
  dfcClose: number;
  dfcRange: number; // DFC HL Difference = Target 1 distance
  dfcRangePct: number;

  // Previous Day & Gap Open Formula (Pages 6-7)
  pdh: number;
  pdl: number;
  prevClose: number;
  gapType: IntradayGapType;
  gapOpenPct: number;

  // Closing Basis Breakout + Next Qualified Candle Rule (Pages 3, 5, 6, 7)
  prevCandleBreakout: 'ABOVE_PREV_HIGH' | 'BELOW_PREV_LOW' | 'NONE';
  closingCandleNo: number | null;
  closingCandleTime: string;
  closingCandleClose: number | null;
  qualifiedCandleNo: number | null;
  qualifiedCandleTime: string;
  listedAt: string;
  inEntryWindow: boolean;

  // Exact PDF Stop Loss & Targets (Pages 4-5)
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
  sourceFormula: 'Secret Formula of Intraday Trading Techniques (DFC 5m Closing Breakout)';
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
  buyCount: number;
  sellCount: number;
  gapUpBreakoutCount: number;
  gapDownBreakoutCount: number;
  indexCount: number;
  totalEligibleUpCount: number;
  totalEligibleDownCount: number;
  categories: {
    allSetups: IntradayStockRow[];
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

  // Previous-candle closing basis breakout check (Page 3 of PDF)
  const lastBar = session5m[session5m.length - 1];
  const prevBar = session5m[session5m.length - 2];
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

  // Also capture the most recent active closing breakout if one re-triggered after a chop
  const volatileChop = buyCloseIdx !== -1 && sellCloseIdx !== -1;

  let side: IntradayStockSide;
  let chosenCloseIdx = -1;
  if (buyCloseIdx !== -1 && sellCloseIdx !== -1) {
    // Pick the direction aligned with current LTP vs DFC midpoint or latest breakout
    if (params.price >= dfcHigh || lastBar.close >= dfcHigh) {
      side = 'BUY';
      chosenCloseIdx = buyCloseIdx;
    } else if (params.price <= dfcLow || lastBar.close <= dfcLow) {
      side = 'SELL';
      chosenCloseIdx = sellCloseIdx;
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
  } else {
    side =
      prevCandleBreakout === 'ABOVE_PREV_HIGH'
        ? 'BUY'
        : prevCandleBreakout === 'BELOW_PREV_LOW'
          ? 'SELL'
          : params.price >= (dfcHigh + dfcLow) / 2
            ? 'BUY'
            : 'SELL';
  }

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
      // Exact PDF rule: "The next candle to closing candle will be a qualified candle to go for trade."
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

  // Exact PDF Stop Loss & Targets:
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

  const rvol5m = computeRvolFromBars(params.bars5m);
  const { atr25, atr25Pct } = computeAtr25(params.bars5m, params.price);

  return {
    id: `${params.symbol}_${side}`,
    symbol: params.symbol,
    displayName: params.displayName,
    instrumentType: params.instrumentType,
    side,
    signalBadge,
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
    price: round2(params.price),
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

  const empty: IntradayStockReport = {
    status: 'ok',
    scannerName: 'Intraday Stock',
    sourceFormula: 'Secret Formula of Intraday Trading Techniques (DFC 5m Closing Breakout)',
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
    buyCount: 0,
    sellCount: 0,
    gapUpBreakoutCount: 0,
    gapDownBreakoutCount: 0,
    indexCount: 0,
    totalEligibleUpCount: 0,
    totalEligibleDownCount: 0,
    categories: {
      allSetups: [],
      qualifiedDfc: [],
      buySetups: [],
      sellSetups: [],
      gapUpBreakouts: [],
      gapDownBreakouts: [],
      indexTargets: [],
    },
  };

  if (params.isMidnightCleared) return empty;

  // Pure-equity arithmetic-mean SECTOR %
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
      explicitPdh: Number(eq.indicators?.pdh) || undefined,
      explicitPdl: Number(eq.indicators?.pdl) || undefined,
    });
    if (row) allCollected.push(row);
  }

  // Include Benchmark Indices (PDF explicitly notes "Useful for Nifty & Bank nifty")
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
      explicitPrevClose: Number(q.prevClose) || undefined,
    });
    if (row) allCollected.push(row);
  }

  const scoreFormulaQuality = (row: IntradayStockRow): number => {
    let pts = 0;
    if (row.isDfcQualified) pts += 1000;
    if (row.entryStatus === 'QUALIFIED_NEXT_CANDLE') pts += 250;
    if (!row.volatileChop) pts += 350; // PDF rule: Trend over sideways chop
    if (
      (row.side === 'BUY' && row.gapType === 'OUTSIDE_GAP_UP') ||
      (row.side === 'SELL' && row.gapType === 'OUTSIDE_GAP_DOWN')
    ) {
      pts += 220; // PDF Gap Open formula alignment
    }
    if (row.inEntryWindow) pts += 120; // 09:20-14:45 IST window
    if (
      (row.side === 'BUY' && row.prevCandleBreakout === 'ABOVE_PREV_HIGH') ||
      (row.side === 'SELL' && row.prevCandleBreakout === 'BELOW_PREV_LOW')
    ) {
      pts += 110;
    }
    if (
      (row.side === 'BUY' && row.changePercent > 0) ||
      (row.side === 'SELL' && row.changePercent < 0)
    ) {
      pts += 140; // Directional day % momentum confirms side
    }
    if (
      (row.side === 'BUY' && row.bidAskRatio >= 1.15) ||
      (row.side === 'SELL' && row.bidAskRatio <= 0.85)
    ) {
      pts += 70;
    }
    pts += Math.min(120, (Number(row.rvol5m) || 0) * 18);
    pts += Math.min(120, Math.abs(Number(row.changePercent) || 0) * 18);
    pts += Math.min(80, Math.log10(Math.max(1, Number(row.tradedValueCr) || 1)) * 22);
    return round2(pts);
  };

  // Evaluate formula rank score across equities and indices separately
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

  // Strictly pick Best 10 UP (BUY) stocks and Best 10 DOWN (SELL) stocks by formula quality
  const upCandidates = equityRows.filter((r) => r.side === 'BUY').sort(rankByFormulaDesc);
  const downCandidates = equityRows.filter((r) => r.side === 'SELL').sort(rankByFormulaDesc);

  const best10Up = upCandidates.slice(0, 10).map((r, i) => ({ ...r, directionRank: i + 1 }));
  const best10Down = downCandidates.slice(0, 10).map((r, i) => ({ ...r, directionRank: i + 1 }));

  // Re-sort Best 10 UP, Best 10 DOWN, and combined Best 20 Z -> A by listedAt
  best10Up.sort(sortListedZToA);
  best10Down.sort(sortListedZToA);
  const best20Combined = [...best10Up, ...best10Down].sort(sortListedZToA);
  indexTargets.sort(sortListedZToA);

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
    sourceFormula: 'Secret Formula of Intraday Trading Techniques (DFC 5m Closing Breakout)',
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
    buyCount: best10Up.length,
    sellCount: best10Down.length,
    gapUpBreakoutCount: gapUpBreakouts.length,
    gapDownBreakoutCount: gapDownBreakouts.length,
    indexCount: indexTargets.length,
    totalEligibleUpCount: upCandidates.length,
    totalEligibleDownCount: downCandidates.length,
    categories: {
      allSetups: best20Combined,
      qualifiedDfc,
      buySetups: best10Up,
      sellSetups: best10Down,
      gapUpBreakouts,
      gapDownBreakouts,
      indexTargets,
    },
  };
}
