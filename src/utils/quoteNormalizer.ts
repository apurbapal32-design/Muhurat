import type {
  FyersQuote,
  MarketOverview,
  ScannedStock,
  TechnicalIndicators,
  RiskManagement,
  AlertConfig,
  BrokerConfig,
  NewsItem,
  CorporateAction,
  BulkOrder,
} from '../types';

export interface ScanResultsResponse {
  stocks: ScannedStock[];
  top10Buy: ScannedStock[];
  top10Sell: ScannedStock[];
  sectorAvgMap: Record<string, number>;
  overview?: MarketOverview;
  broker?: BrokerConfig;
  alerts?: AlertConfig;
  news?: NewsItem[];
  corporateActions?: CorporateAction[];
  bulkOrders?: BulkOrder[];
  sessionState?: any;
}

/**
 * Parses a number or numeric string (including comma-formatted strings like "2,845.65")
 * into a finite number, or returns undefined if invalid/non-numeric.
 */
export function parseFiniteNum(value: unknown): number | undefined {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').trim();
    if (!cleaned) return undefined;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Rounds any valid numeric input to 2 decimal places (avoiding -0 and float drift).
 */
export function round2(value: unknown, fallback = 0): number {
  const num = parseFiniteNum(value);
  if (num === undefined) return fallback;
  const rounded = Math.round((num + Math.sign(num) * 1e-9) * 100) / 100;
  return rounded === 0 ? 0 : Number(rounded.toFixed(2));
}

export interface UpstoxQuoteChangeResult {
  lp: number;
  prevClose: number;
  ch: number;
  chp: number;
}

/**
 * Parses raw Upstox v2/v3 quote fields (`last_price`, `net_change`, `ohlc.close`, optional `% change`)
 * into clean, 2-decimal-rounded price, previous close, change, and changePercent.
 */
export function deriveUpstoxPriceChange(params: {
  lastPrice: unknown;
  netChange?: unknown;
  ohlcClose?: unknown;
  percentChange?: unknown;
  fallbackPrevClose?: unknown;
}): UpstoxQuoteChangeResult | null {
  const rawLp = parseFiniteNum(params.lastPrice);
  if (rawLp === undefined || rawLp <= 0) return null;

  const lp = round2(rawLp);
  const netCh = parseFiniteNum(params.netChange);
  const ohlcClose = parseFiniteNum(params.ohlcClose) ?? 0;
  const fallbackPrevClose = parseFiniteNum(params.fallbackPrevClose) ?? 0;
  const pctHint = parseFiniteNum(params.percentChange);

  let prevClose = lp;
  if (netCh !== undefined && Math.abs(netCh) > 0.0001) {
    prevClose = round2(rawLp - netCh, lp);
  } else if (ohlcClose > 0 && Math.abs(rawLp - ohlcClose) > 0.01) {
    prevClose = round2(ohlcClose, lp);
  } else if (fallbackPrevClose > 0 && Math.abs(rawLp - fallbackPrevClose) > 0.01) {
    prevClose = round2(fallbackPrevClose, lp);
  } else if (
    pctHint !== undefined &&
    Math.abs(pctHint) > 0.0001 &&
    1 + pctHint / 100 > 0
  ) {
    prevClose = round2(rawLp / (1 + pctHint / 100), lp);
  }

  if (prevClose <= 0) {
    prevClose = lp;
  }

  const ch =
    netCh !== undefined && (Math.abs(netCh) > 0.0001 || Math.abs(prevClose - lp) <= 0.01)
      ? round2(netCh)
      : round2(rawLp - prevClose);

  const chp =
    prevClose > 0
      ? round2((ch / prevClose) * 100)
      : pctHint !== undefined
      ? round2(pctHint)
      : 0;

  return { lp, prevClose, ch, chp };
}

function normalizeIndicators(ind: Partial<TechnicalIndicators> | undefined, price: number): TechnicalIndicators {
  const safeInd = (ind || {}) as TechnicalIndicators;
  return {
    ...safeInd,
    price: round2(safeInd.price, price),
    open: round2(safeInd.open, price),
    high: round2(safeInd.high, price),
    low: round2(safeInd.low, price),
    close: round2(safeInd.close, price),
    volume: Math.max(0, Math.round(parseFiniteNum(safeInd.volume) ?? 0)),
    avgVolume20: Math.max(0, Math.round(parseFiniteNum(safeInd.avgVolume20) ?? 0)),
    ema13: round2(safeInd.ema13, price),
    ema21: round2(safeInd.ema21, price),
    ema34: round2(safeInd.ema34, price),
    vwap: round2(safeInd.vwap, price),
    rsi: round2(safeInd.rsi, 50),
    macd: round2(safeInd.macd, 0),
    macdSignal: round2(safeInd.macdSignal, 0),
    macdHist: round2(safeInd.macdHist, 0),
    adx: round2(safeInd.adx, 20),
    atr: round2(safeInd.atr, 0),
    supertrend: round2(safeInd.supertrend, price),
    bbUpper: round2(safeInd.bbUpper, price),
    bbMiddle: round2(safeInd.bbMiddle, price),
    bbLower: round2(safeInd.bbLower, price),
    rvol: round2(safeInd.rvol, 1),
    pdh: round2(safeInd.pdh, price),
    pdl: round2(safeInd.pdl, price),
    cprPivot: round2(safeInd.cprPivot, price),
    cprBC: round2(safeInd.cprBC, price),
    cprTC: round2(safeInd.cprTC, price),
    pivotR1: round2(safeInd.pivotR1, price),
    pivotS1: round2(safeInd.pivotS1, price),
    pivotR2: round2(safeInd.pivotR2, price),
    pivotS2: round2(safeInd.pivotS2, price),
    swingHigh: round2(safeInd.swingHigh, price),
    swingLow: round2(safeInd.swingLow, price),
    gapPct: safeInd.gapPct !== undefined ? round2(safeInd.gapPct) : undefined,
    vwapSlope: safeInd.vwapSlope !== undefined ? round2(safeInd.vwapSlope) : undefined,
    ema9: safeInd.ema9 !== undefined ? round2(safeInd.ema9, price) : undefined,
    ema50: safeInd.ema50 !== undefined ? round2(safeInd.ema50, price) : undefined,
  };
}

function normalizeRisk(risk: Partial<RiskManagement> | undefined): RiskManagement {
  const safeRisk = (risk || {}) as RiskManagement;
  return {
    ...safeRisk,
    entryPrice: round2(safeRisk.entryPrice, 0),
    stopLoss: round2(safeRisk.stopLoss, 0),
    target1: round2(safeRisk.target1, 0),
    target2: round2(safeRisk.target2, 0),
    target3: safeRisk.target3 !== undefined ? round2(safeRisk.target3, 0) : undefined,
    riskAmount: round2(safeRisk.riskAmount, 0),
    rewardAmountT1: round2(safeRisk.rewardAmountT1, 0),
    rewardAmountT2: round2(safeRisk.rewardAmountT2, 0),
    rewardAmountT3: safeRisk.rewardAmountT3 !== undefined ? round2(safeRisk.rewardAmountT3, 0) : undefined,
    riskRewardRatio: round2(safeRisk.riskRewardRatio, 0),
    recommendedQty: Math.max(0, Math.round(parseFiniteNum(safeRisk.recommendedQty) ?? 0)),
    positionValue: round2(safeRisk.positionValue, 0),
    marginRequired: round2(safeRisk.marginRequired, 0),
  };
}

function normalizeFyersQuote(fq: Partial<FyersQuote> | undefined, price: number, change: number, changePercent: number): FyersQuote | undefined {
  if (!fq) return undefined;
  return {
    ...fq,
    symbol: fq.symbol || '',
    fyersSymbol: fq.fyersSymbol || '',
    description: fq.description || fq.symbol || '',
    exchange: fq.exchange || 'NSE',
    type: fq.type || 'EQUITY',
    lp: round2(fq.lp, price),
    open: round2(fq.open, price),
    high: round2(fq.high, price),
    low: round2(fq.low, price),
    prevClose: round2(fq.prevClose, round2(price - change)),
    ch: round2(fq.ch, change),
    chp: round2(fq.chp, changePercent),
    volume: Math.max(0, Math.round(parseFiniteNum(fq.volume) ?? 0)),
    atp: round2(fq.atp, price),
    ltt: fq.ltt || '--',
    fyersStatus: fq.fyersStatus || 'LIVE_V3_FEED',
    lastRefreshed: fq.lastRefreshed || new Date().toISOString(),
  };
}

/**
 * Ensures any ScannedStock object has valid, finite numeric price, change, changePercent,
 * indicators, risk, and quote fields rounded strictly to 2 decimal places.
 */
export function normalizeScannedStock(raw: Partial<ScannedStock> & Record<string, any>): ScannedStock {
  const fyersLp = parseFiniteNum(raw.fyersData?.lp);
  const price = round2(raw.price, fyersLp && fyersLp > 0 ? round2(fyersLp) : 0);

  const prevCloseCandidate =
    parseFiniteNum(raw.fyersData?.prevClose) ??
    (raw.change !== undefined && parseFiniteNum(raw.change) !== undefined
      ? round2(price - (parseFiniteNum(raw.change) ?? 0))
      : undefined);

  let change = parseFiniteNum(raw.change);
  let changePercent = parseFiniteNum(raw.changePercent);

  if (change === undefined && prevCloseCandidate && prevCloseCandidate > 0) {
    change = price - prevCloseCandidate;
  }
  if (
    change !== undefined &&
    Math.abs(change) <= 0.0001 &&
    prevCloseCandidate &&
    prevCloseCandidate > 0 &&
    Math.abs(price - prevCloseCandidate) > 0.01
  ) {
    change = price - prevCloseCandidate;
  }

  const roundedChange = round2(change ?? raw.fyersData?.ch ?? 0);

  if (
    (changePercent === undefined || (Math.abs(changePercent) <= 0.0001 && Math.abs(roundedChange) > 0.01)) &&
    prevCloseCandidate &&
    prevCloseCandidate > 0
  ) {
    changePercent = (roundedChange / prevCloseCandidate) * 100;
  }

  const roundedChangePercent = round2(changePercent ?? raw.fyersData?.chp ?? 0);
  const sectorChangePercent =
    raw.sectorChangePercent !== undefined
      ? round2(raw.sectorChangePercent, roundedChangePercent)
      : roundedChangePercent;

  return {
    ...(raw as ScannedStock),
    symbol: String(raw.symbol || '').trim(),
    name: String(raw.name || raw.symbol || '').trim(),
    sector: String(raw.sector || 'NSE F&O').trim(),
    price,
    change: roundedChange,
    changePercent: roundedChangePercent,
    sectorChangePercent,
    volume: Math.max(0, Math.round(parseFiniteNum(raw.volume) ?? 0)),
    aiScore: round2(raw.aiScore, 0),
    bidQty: raw.bidQty !== undefined ? Math.max(0, Math.round(parseFiniteNum(raw.bidQty) ?? 0)) : undefined,
    askQty: raw.askQty !== undefined ? Math.max(0, Math.round(parseFiniteNum(raw.askQty) ?? 0)) : undefined,
    bidAskRatio: raw.bidAskRatio !== undefined ? round2(raw.bidAskRatio, 1) : undefined,
    fixedEntryPrice: raw.fixedEntryPrice !== undefined ? round2(raw.fixedEntryPrice, 0) : undefined,
    fixedStopLoss: raw.fixedStopLoss !== undefined ? round2(raw.fixedStopLoss, 0) : undefined,
    fixedTarget1: raw.fixedTarget1 !== undefined ? round2(raw.fixedTarget1, 0) : undefined,
    fixedTarget2: raw.fixedTarget2 !== undefined ? round2(raw.fixedTarget2, 0) : undefined,
    fixedTarget3: raw.fixedTarget3 !== undefined ? round2(raw.fixedTarget3, 0) : undefined,
    indicators: normalizeIndicators(raw.indicators, price),
    risk: normalizeRisk(raw.risk),
    fyersData: normalizeFyersQuote(raw.fyersData, price, roundedChange, roundedChangePercent),
    sparkline: Array.isArray(raw.sparkline)
      ? raw.sparkline.map((v: unknown) => round2(v, price))
      : undefined,
  };
}

/**
 * Compact projection of ScannedStock used by `/api/scan/results?compact=1` with all
 * price and change% fields parsed and rounded to 2 decimal places.
 */
export function compactScannedStock(raw: ScannedStock) {
  const s = normalizeScannedStock(raw);
  return {
    symbol: s.symbol,
    name: s.name,
    fyersSymbol: s.fyersSymbol,
    sector: s.sector,
    sectorChangePercent: s.sectorChangePercent,
    price: s.price,
    change: s.change,
    changePercent: s.changePercent,
    volume: s.volume,
    turnover: (s as any).turnover,
    signal: s.signal,
    aiScore: s.aiScore,
    bidQty: s.bidQty,
    askQty: s.askQty,
    bidAskRatio: s.bidAskRatio,
    orderBookBias: s.orderBookBias,
    listedAt: s.listedAt,
    signalListedAt: s.signalListedAt,
    fixedEntryPrice: s.fixedEntryPrice,
    fixedStopLoss: s.fixedStopLoss,
    fixedTarget1: s.fixedTarget1,
    formulaCode: s.formulaCode,
    formulaName: s.formulaName,
    tradeStatus: s.tradeStatus,
    entryTime: s.entryTime,
    strikeStep: s.strikeStep,
    risk: s.risk
      ? {
          entryPrice: round2(s.risk.entryPrice),
          stopLoss: round2(s.risk.stopLoss),
          target1: round2(s.risk.target1),
        }
      : undefined,
    indicators: s.indicators
      ? {
          price: round2(s.indicators.price, s.price),
          vwap: round2(s.indicators.vwap, s.price),
          rsi: round2(s.indicators.rsi, 50),
          adx: round2(s.indicators.adx, 20),
          rvol: round2(s.indicators.rvol, 1),
          high: round2(s.indicators.high, s.price),
          low: round2(s.indicators.low, s.price),
          open: round2(s.indicators.open, s.price),
          close: round2(s.indicators.close, s.price),
          squeezeOn: (s.indicators as any).squeezeOn,
        }
      : undefined,
    fyersData: s.fyersData,
    oiData: s.oiData
      ? {
          buildup: s.oiData.buildup,
          openInterest: s.oiData.openInterest,
          changeInOIPercent: round2(s.oiData.changeInOIPercent),
          pcr: round2(s.oiData.pcr, 1),
        }
      : undefined,
    greeks: s.greeks
      ? {
          iv: round2(s.greeks.iv),
          ivPercentile: round2(s.greeks.ivPercentile),
        }
      : undefined,
  };
}

function normalizeOverviewIndex<T extends { price: number; change: number; changePercent: number }>(
  entry: T | undefined
): T | undefined {
  if (!entry) return entry;
  return {
    ...entry,
    price: round2(entry.price),
    change: round2(entry.change),
    changePercent: round2(entry.changePercent),
  };
}

export function normalizeMarketOverview(overview: MarketOverview): MarketOverview {
  return {
    ...overview,
    nifty50: {
      ...overview.nifty50,
      price: round2(overview.nifty50?.price),
      change: round2(overview.nifty50?.change),
      changePercent: round2(overview.nifty50?.changePercent),
    },
    bankNifty: normalizeOverviewIndex(overview.bankNifty) || { price: 0, change: 0, changePercent: 0 },
    niftyIT: normalizeOverviewIndex(overview.niftyIT) || { price: 0, change: 0, changePercent: 0 },
    finnifty: normalizeOverviewIndex(overview.finnifty),
    midcpnifty: normalizeOverviewIndex(overview.midcpnifty),
    sensex: normalizeOverviewIndex(overview.sensex),
    indiaVix: normalizeOverviewIndex(overview.indiaVix),
  };
}

export function normalizeScanResultsPayload(raw: unknown): ScanResultsResponse | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const obj = raw as Record<string, any>;
  const mapStocks = (arr: unknown): ScannedStock[] =>
    Array.isArray(arr)
      ? arr
          .filter((item): item is Record<string, any> => Boolean(item && typeof item === 'object' && item.symbol))
          .map((item) => normalizeScannedStock(item))
      : [];

  const sectorAvgMap: Record<string, number> = {};
  if (obj.sectorAvgMap && typeof obj.sectorAvgMap === 'object') {
    for (const [sec, val] of Object.entries(obj.sectorAvgMap)) {
      sectorAvgMap[sec] = round2(val, 0);
    }
  }

  return {
    stocks: mapStocks(obj.stocks),
    top10Buy: mapStocks(obj.top10Buy),
    top10Sell: mapStocks(obj.top10Sell),
    sectorAvgMap,
    overview: obj.overview ? normalizeMarketOverview(obj.overview) : undefined,
    broker: obj.broker,
    alerts: obj.alerts,
    news: Array.isArray(obj.news) ? obj.news : undefined,
    corporateActions: Array.isArray(obj.corporateActions) ? obj.corporateActions : undefined,
    bulkOrders: Array.isArray(obj.bulkOrders) ? obj.bulkOrders : undefined,
    sessionState: obj.sessionState,
  };
}
