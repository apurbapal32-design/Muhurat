import { NIFTY_200_STOCKS } from '../src/data/nifty200';
import { calculateMarketStatus } from '../src/data/marketSchedule';

export interface IntradayCandleBar {
  tsSec: number;
  dateIST: string;
  timeIST: string;
  secIST: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface UnifiedMarketQuote {
  symbol: string;
  instrumentKey: string;
  description: string;
  exchange: 'NSE' | 'BSE';
  type: 'INDEX' | 'EQUITY';
  lp: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  ch: number;
  chp: number;
  volume: number;
  turnoverCr: number;
  atp: number;
  bid: number;
  ask: number;
  bidQty: number;
  askQty: number;
  bidAskRatio?: number;
  orderBookBias?: string;
  oi: number;
  ltt: string;
  quoteTimestampSec?: number;
  rsi?: number;
  macd?: number;
  ema20?: number;
  sma50?: number;
  recommendScore?: number;
  intradayBars?: IntradayCandleBar[];
  source: 'UPSTOX_API_V2' | 'AUTONOMOUS_LIVE_ENGINE' | 'MONEYCONTROL_FEED' | 'SETTLED_CLOSE';
  isMarketOpen: boolean;
  marketSession: string;
  lastRefreshed: string;
}

const INDEX_BASELINE_PRICES: Record<
  string,
  { price: number; prevClose: number; name: string; exchange: 'NSE' | 'BSE'; tvTicker: string; mcId?: string }
> = {
  'NIFTY 50': {
    price: 25255.05,
    prevClose: 25044.65,
    name: 'NIFTY 50 Index',
    exchange: 'NSE',
    tvTicker: 'NSE:NIFTY',
    mcId: '9',
  },
  NIFTY: {
    price: 25255.05,
    prevClose: 25044.65,
    name: 'NIFTY 50 Index',
    exchange: 'NSE',
    tvTicker: 'NSE:NIFTY',
    mcId: '9',
  },
  BANKNIFTY: {
    price: 60792.4,
    prevClose: 59741.25,
    name: 'NIFTY Bank Index',
    exchange: 'NSE',
    tvTicker: 'NSE:BANKNIFTY',
    mcId: '23',
  },
  FINNIFTY: {
    price: 27663.4,
    prevClose: 27384.9,
    name: 'NIFTY Financial Services',
    exchange: 'NSE',
    tvTicker: 'NSE:CNXFINANCE',
    mcId: '47',
  },
  MIDCPNIFTY: {
    price: 14193.55,
    prevClose: 14055.45,
    name: 'NIFTY Midcap Select',
    exchange: 'NSE',
    tvTicker: 'NSE:NIFTY_MID_SELECT',
  },
  NIFTYNXT50: {
    price: 73486.2,
    prevClose: 72789.45,
    name: 'NIFTY Next 50 Index',
    exchange: 'NSE',
    tvTicker: 'NSE:NIFTYJR',
    mcId: '6',
  },
  SENSEX: {
    price: 81879.4,
    prevClose: 81106.65,
    name: 'BSE SENSEX 30',
    exchange: 'BSE',
    tvTicker: 'BSE:SENSEX',
    mcId: '4',
  },
  NIFTYIT: {
    price: 32468.9,
    prevClose: 32869.65,
    name: 'NIFTY IT Index',
    exchange: 'NSE',
    tvTicker: 'NSE:CNXIT',
    mcId: '19',
  },
  INDIAVIX: {
    price: 17.55,
    prevClose: 17.42,
    name: 'India Volatility Index',
    exchange: 'NSE',
    tvTicker: 'NSE:INDIAVIX',
  },
};

const TV_SPECIAL_TICKERS: Record<string, string> = {
  'BAJAJ-AUTO': 'NSE:BAJAJ_AUTO',
  'NAM-INDIA': 'NSE:NAM_INDIA',
};

const TV_TICKER_REVERSE: Record<string, string> = {
  'NSE:NIFTY': 'NIFTY 50',
  'NSE:BANKNIFTY': 'BANKNIFTY',
  'NSE:CNXFINANCE': 'FINNIFTY',
  'NSE:NIFTY_MID_SELECT': 'MIDCPNIFTY',
  'NSE:NIFTYJR': 'NIFTYNXT50',
  'BSE:SENSEX': 'SENSEX',
  'NSE:CNXIT': 'NIFTYIT',
  'NSE:INDIAVIX': 'INDIAVIX',
  'NSE:BAJAJ_AUTO': 'BAJAJ-AUTO',
  'NSE:NAM_INDIA': 'NAM-INDIA',
};

function cleanSymName(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\.NS$/, '')
    .replace(/^NSE:/, '')
    .replace(/^BSE:/, '')
    .replace(/-EQ$/, '')
    .replace(/-INDEX$/, '')
    .trim();
}

function toTvTicker(cleanSym: string): string | null {
  if (INDEX_BASELINE_PRICES[cleanSym]) return INDEX_BASELINE_PRICES[cleanSym].tvTicker;
  if (cleanSym === 'NIFTYFPI') return null;
  if (TV_SPECIAL_TICKERS[cleanSym]) return TV_SPECIAL_TICKERS[cleanSym];
  return `NSE:${cleanSym}`;
}

export function getIndexBaselinePrices() {
  return INDEX_BASELINE_PRICES;
}

/**
 * Derives realistic NSE order-book Bid/Ask Quantities & Bid/Ask Ratio from
 * real 5-minute intraday OHLCV accumulation/distribution pressure, intraday range location,
 * VWAP/ATP control, and session momentum whenever full exchange depth is not provided.
 */
export function deriveOrderBookDepth(params: {
  volume: number;
  lp: number;
  open: number;
  high: number;
  low: number;
  chp: number;
  atp?: number;
  intradayBars?: IntradayCandleBar[];
  isIdx?: boolean;
}): { bidQty: number; askQty: number; bidAskRatio: number; orderBookBias: string } {
  const { volume, lp, open, high, low, chp, atp, intradayBars, isIdx } = params;
  const effVol = Math.max(isIdx ? 1000000 : 25000, Number(volume) || 0);
  const effAtp = atp && atp > 0 ? atp : (open + high + low + lp) / 4;

  // 1. Intraday bar Close-Location Value (CLV) weighted toward latest 5m candles
  let barsPressure = 0;
  if (Array.isArray(intradayBars) && intradayBars.length >= 2) {
    const recent = intradayBars.slice(-10);
    let weightedClv = 0;
    let weightSum = 0;
    for (let i = 0; i < recent.length; i++) {
      const b = recent[i];
      const span = Math.max(0.05, b.high - b.low);
      const clv = Math.max(-1, Math.min(1, ((b.close - b.low) / span) * 2 - 1));
      const w = (i + 1) * Math.max(1, Math.sqrt(b.volume || 1000));
      weightedClv += clv * w;
      weightSum += w;
    }
    barsPressure = weightSum > 0 ? Math.max(-1, Math.min(1, weightedClv / weightSum)) : 0;
  } else {
    const barSpan = Math.max(0.05, high - low);
    barsPressure = Math.max(-1, Math.min(1, ((lp - open) / barSpan) * 1.4));
  }

  // 2. Session day-range location [-1 .. +1]
  const daySpan = high > low ? high - low : Math.max(0.05, lp * 0.01);
  const rangePos = Math.max(-1, Math.min(1, ((lp - low) / daySpan) * 2 - 1));

  // 3. VWAP / ATP control [-1 .. +1]
  const vwapBias = Math.max(-1, Math.min(1, (lp - effAtp) / Math.max(0.05, lp * 0.008)));

  // 4. Directional momentum [-1 .. +1]
  const momentumBias = Math.max(-1, Math.min(1, chp / 2.8));

  const imbalance = Math.max(
    -0.95,
    Math.min(0.95, 0.38 * barsPressure + 0.24 * rangePos + 0.16 * vwapBias + 0.22 * momentumBias)
  );

  // Maps smoothly to realistic NSE depth ratio ~0.38x (heavy selling) .. ~2.65x (heavy buying)
  const rawRatio = Math.exp(imbalance * 1.02);
  const bidAskRatio = Number(Math.max(0.35, Math.min(2.85, rawRatio)).toFixed(2));

  const bookFactor = isIdx ? 0.018 : 0.042;
  const totalDepth = Math.max(2500, Math.round(effVol * bookFactor));
  const bidQty = Math.max(150, Math.round(totalDepth * (bidAskRatio / (bidAskRatio + 1))));
  const askQty = Math.max(150, totalDepth - bidQty);
  const exactRatio = Number((bidQty / askQty).toFixed(2));

  let orderBookBias = 'Balanced Order Book';
  if (exactRatio >= 1.55) orderBookBias = 'Heavy Buyer Accumulation';
  else if (exactRatio >= 1.18) orderBookBias = 'Buyer Dominance';
  else if (exactRatio <= 0.65) orderBookBias = 'Heavy Seller Supply';
  else if (exactRatio <= 0.85) orderBookBias = 'Seller Pressure';

  return { bidQty, askQty, bidAskRatio: exactRatio, orderBookBias };
}

const YAHOO_EQUITY_ALIASES: Record<string, string> = {
  ZOMATO: 'ETERNAL.NS',
  TATAMOTORS: 'TMPV.NS',
  'M&M': 'M&M.NS',
  'M&MFIN': 'M&MFIN.NS',
  'L&TFH': 'LTF.NS',
  'MCDOWELL-N': 'UNITDSPR.NS',
  GMRINFRA: 'GMRAIRPORT.NS',
};

const YAHOO_INDEX_TICKERS: Array<{ sym: string; yf: string; exchange: 'NSE' | 'BSE' }> = [
  { sym: 'NIFTY 50', yf: '^NSEI', exchange: 'NSE' },
  { sym: 'BANKNIFTY', yf: '^NSEBANK', exchange: 'NSE' },
  { sym: 'FINNIFTY', yf: 'NIFTY_FIN_SERVICE.NS', exchange: 'NSE' },
  { sym: 'MIDCPNIFTY', yf: 'NIFTY_MID_SELECT.NS', exchange: 'NSE' },
  { sym: 'NIFTYNXT50', yf: '^NSMIDCP', exchange: 'NSE' },
  { sym: 'NIFTYIT', yf: '^CNXIT', exchange: 'NSE' },
  { sym: 'SENSEX', yf: '^BSESN', exchange: 'BSE' },
  { sym: 'INDIAVIX', yf: '^INDIAVIX', exchange: 'NSE' },
];

function toYahooEquityTicker(cleanSym: string): string {
  if (YAHOO_EQUITY_ALIASES[cleanSym]) return YAHOO_EQUITY_ALIASES[cleanSym];
  return `${cleanSym}.NS`;
}

function getISTPartsFromEpochSec(tsSec: number): { dateIST: string; timeIST: string; secIST: number } {
  const d = new Date(tsSec * 1000 + 19800000);
  const dateIST = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate()
  ).padStart(2, '0')}`;
  const hh = d.getUTCHours();
  const mm = d.getUTCMinutes();
  const ss = d.getUTCSeconds();
  return {
    dateIST,
    timeIST: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`,
    secIST: hh * 3600 + mm * 60 + ss,
  };
}

class AutonomousPriceService {
  private lastQuoteCache: Map<string, UnifiedMarketQuote> = new Map();
  private lastBarsCache: Map<string, IntradayCandleBar[]> = new Map();
  private lastExtendedBarsCache: Map<string, IntradayCandleBar[]> = new Map();
  private lastFetchTimestamp = 0;
  private lastYahooFetchTimestamp = 0;
  private inFlightPromise: Promise<Record<string, UnifiedMarketQuote>> | null = null;
  private yahooInFlightPromise: Promise<void> | null = null;

  public getExtendedBars(symbol: string): IntradayCandleBar[] | undefined {
    const clean = cleanSymName(symbol);
    return this.lastExtendedBarsCache.get(clean) || this.lastBarsCache.get(clean);
  }

  public async ensureInitialBarsLoaded(): Promise<void> {
    if (this.lastBarsCache.size >= 150) return;
    if (!this.yahooInFlightPromise) {
      await this.fetchAllMarketQuotes(false);
    }
    if (this.yahooInFlightPromise) {
      await Promise.race([
        this.yahooInFlightPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 12000)),
      ]);
    }
  }

  /**
   * Overlays a real-time Upstox / TV quote onto the active 5-minute forming candle and quote cache
   * so Money Flow, Supertrend, Hull Suite, and Scanner triggers never lag behind Yahoo's 5m feed.
   */
  public overlayLiveTickOnBars(symbol: string, quote: UnifiedMarketQuote) {
    const clean = cleanSymName(symbol);
    if (!clean || !quote || !Number.isFinite(quote.lp) || quote.lp <= 0) return;

    this.lastQuoteCache.set(clean, quote);
    if (clean === 'NIFTY 50') this.lastQuoteCache.set('NIFTY', quote);

    if (!quote.isMarketOpen) return;

    const nowTsSec = Math.floor(Date.now() / 1000);
    const istNow = getISTPartsFromEpochSec(nowTsSec);
    if (istNow.secIST < 9 * 3600 + 15 * 60 || istNow.secIST > 15 * 3600 + 30 * 60) return;

    const bucketSec = Math.floor(istNow.secIST / 300) * 300;
    const bh = String(Math.floor(bucketSec / 3600)).padStart(2, '0');
    const bm = String(Math.floor((bucketSec % 3600) / 60)).padStart(2, '0');
    const bucketTimeIST = `${bh}:${bm}:00`;
    const bucketTsSec = nowTsSec - (istNow.secIST - bucketSec);

    const updateArr = (arr: IntradayCandleBar[] | undefined): IntradayCandleBar[] => {
      const list = Array.isArray(arr) ? arr.slice() : [];
      const prevTotalVol = list.reduce((s, b) => s + (b.volume || 0), 0);
      const liveDeltaVol = quote.volume > prevTotalVol ? Math.max(100, quote.volume - prevTotalVol) : 0;

      if (list.length > 0 && list[list.length - 1].dateIST === istNow.dateIST && list[list.length - 1].secIST === bucketSec) {
        const last = list[list.length - 1];
        list[list.length - 1] = {
          ...last,
          high: Number(Math.max(last.high, quote.lp).toFixed(2)),
          low: Number(Math.min(last.low, quote.lp).toFixed(2)),
          close: Number(quote.lp.toFixed(2)),
          volume: liveDeltaVol > 0 ? last.volume + liveDeltaVol : Math.max(last.volume, Math.round((quote.volume || 1000) / Math.max(1, list.length))),
        };
      } else {
        const openPx = list.length > 0 && list[list.length - 1].dateIST === istNow.dateIST
          ? list[list.length - 1].close
          : Number((quote.open || quote.lp).toFixed(2));
        list.push({
          tsSec: bucketTsSec,
          dateIST: istNow.dateIST,
          timeIST: bucketTimeIST,
          secIST: bucketSec,
          open: openPx,
          high: Number(Math.max(openPx, quote.lp).toFixed(2)),
          low: Number(Math.min(openPx, quote.lp).toFixed(2)),
          close: Number(quote.lp.toFixed(2)),
          volume: liveDeltaVol > 0 ? liveDeltaVol : Math.max(100, Math.round((quote.volume || 10000) / Math.max(1, list.length + 1))),
        });
      }
      return list;
    };

    if (this.lastBarsCache.has(clean)) {
      this.lastBarsCache.set(clean, updateArr(this.lastBarsCache.get(clean)));
    }
    if (this.lastExtendedBarsCache.has(clean)) {
      this.lastExtendedBarsCache.set(clean, updateArr(this.lastExtendedBarsCache.get(clean)).slice(-140));
    }
  }

  public getCachedQuotes(): Record<string, UnifiedMarketQuote> {
    const out: Record<string, UnifiedMarketQuote> = {};
    this.lastQuoteCache.forEach((v, k) => {
      out[k] = v;
    });
    return out;
  }

  /**
   * Fetches all Indian Benchmark Indices and Nifty 200 F&O Equities concurrently
   * using fast batch L1 quotes (<400ms) while refreshing 5m historical bars non-blockingly in background.
   */
  public async fetchAllMarketQuotes(forceRefresh = false): Promise<Record<string, UnifiedMarketQuote>> {
    const now = Date.now();
    const status = calculateMarketStatus();
    const isOpen = status.isOpen;
    const isTransitionWindow = status.session === 'POST_MARKET' || status.session === 'PRE_OPEN';
    const minTtlMs = isOpen ? 1200 : isTransitionWindow ? 30000 : 10 * 60 * 1000;
    if (!forceRefresh && now - this.lastFetchTimestamp < minTtlMs && this.lastQuoteCache.size > 100) {
      return this.getCachedQuotes();
    }
    if (this.inFlightPromise) {
      return this.inFlightPromise;
    }

    this.inFlightPromise = this.executeBatchFetch(forceRefresh)
      .finally(() => {
        this.inFlightPromise = null;
      });

    return this.inFlightPromise;
  }

  private triggerBackgroundYahooRefresh(
    equitySymbols: string[],
    todayDateIST: string,
    isOpen: boolean,
    marketSession: string,
    istTime: string,
    nowIso: string
  ) {
    if (this.yahooInFlightPromise) return;
    this.lastYahooFetchTimestamp = Date.now();
    this.yahooInFlightPromise = this.fetchYahooRealTimeQuotesAndBars(
      equitySymbols,
      todayDateIST,
      isOpen,
      marketSession,
      istTime,
      nowIso
    )
      .then((yahooQuotes) => {
        for (const [sym, yq] of Object.entries(yahooQuotes)) {
          const existing = this.lastQuoteCache.get(sym);
          if (!existing) {
            this.lastQuoteCache.set(sym, yq);
          } else {
            const existingIsVerifiedUpstox = existing.source === 'UPSTOX_API_V2';
            if (!existingIsVerifiedUpstox && (yq.quoteTimestampSec || 0) >= (existing.quoteTimestampSec || 0)) {
              existing.lp = yq.lp;
              existing.ltt = yq.ltt;
              existing.quoteTimestampSec = yq.quoteTimestampSec;
            }
            existing.open = yq.open > 0 ? yq.open : existing.open;
            existing.high = Math.max(yq.high || 0, existing.lp);
            existing.low = yq.low > 0 ? Math.min(yq.low, existing.lp) : existing.lp;
            existing.prevClose = yq.prevClose > 0 ? yq.prevClose : existing.prevClose;
            existing.ch = Number((existing.lp - existing.prevClose).toFixed(2));
            existing.chp = existing.prevClose > 0 ? Number(((existing.ch / existing.prevClose) * 100).toFixed(2)) : existing.chp;
            existing.volume = Math.max(yq.volume || 0, existing.volume || 0);
            existing.atp = yq.atp > 0 ? yq.atp : existing.atp;
            existing.turnoverCr = Number(((existing.volume * (existing.atp || existing.lp)) / 10000000).toFixed(2));
            existing.intradayBars = yq.intradayBars || existing.intradayBars;
            if (isOpen && existing.lp > 0) {
              this.overlayLiveTickOnBars(sym, existing);
            }
            const depthMerged = deriveOrderBookDepth({
              volume: existing.volume,
              lp: existing.lp,
              open: existing.open,
              high: existing.high,
              low: existing.low,
              chp: existing.chp,
              atp: existing.atp,
              intradayBars: this.lastBarsCache.get(sym) || existing.intradayBars,
              isIdx: existing.type === 'INDEX',
            });
            existing.bidQty = depthMerged.bidQty;
            existing.askQty = depthMerged.askQty;
            existing.bidAskRatio = depthMerged.bidAskRatio;
            existing.orderBookBias = depthMerged.orderBookBias;
            this.lastQuoteCache.set(sym, existing);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        this.yahooInFlightPromise = null;
      });
  }

  private async fetchYahooSparkL1Quotes(
    equitySymbols: string[],
    isOpen: boolean,
    marketSession: string,
    istTime: string,
    nowIso: string
  ): Promise<Record<string, UnifiedMarketQuote>> {
    const out: Record<string, UnifiedMarketQuote> = {};
    const jobs: Array<{ sym: string; yf: string; exchange: 'NSE' | 'BSE'; isIdx: boolean }> = [
      ...YAHOO_INDEX_TICKERS.map((idx) => ({ sym: idx.sym, yf: idx.yf, exchange: idx.exchange, isIdx: true })),
      ...equitySymbols.map((sym) => ({ sym, yf: toYahooEquityTicker(sym), exchange: 'NSE' as const, isIdx: false })),
    ];

    const chunks: Array<typeof jobs> = [];
    for (let i = 0; i < jobs.length; i += 20) {
      chunks.push(jobs.slice(i, i + 20));
    }

    const batchResponses = await Promise.allSettled(
      chunks.map(async (chunk) => {
        const symsParam = encodeURIComponent(chunk.map((j) => j.yf).join(','));
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 2800);
        try {
          const res = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${symsParam}&range=1d&interval=5m`,
            {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                Accept: 'application/json',
              },
              signal: controller.signal,
            }
          );
          if (!res.ok) return null;
          const json = await res.json();
          return { chunk, json };
        } finally {
          clearTimeout(tid);
        }
      })
    );

    for (const r of batchResponses) {
      if (r.status !== 'fulfilled' || !r.value || !r.value.json) continue;
      const { chunk, json } = r.value;
      for (const job of chunk) {
        const item = json[job.yf];
        if (!item) continue;

        const closesRaw: any[] = Array.isArray(item.close) ? item.close : [];
        const tsRaw: any[] = Array.isArray(item.timestamp) ? item.timestamp : [];
        const validCloses: number[] = [];
        let firstValidClose = 0;
        let lastTsSec = 0;

        for (let i = 0; i < closesRaw.length; i++) {
          const val = Number(closesRaw[i]);
          if (Number.isFinite(val) && val > 0) {
            if (!firstValidClose) firstValidClose = val;
            validCloses.push(val);
            if (Number.isFinite(Number(tsRaw[i])) && Number(tsRaw[i]) > 0) {
              lastTsSec = Number(tsRaw[i]);
            }
          }
        }

        const fullDayPx = Number(item.fulldayPrice);
        const lp = Number.isFinite(fullDayPx) && fullDayPx > 0
          ? fullDayPx
          : validCloses.length > 0
          ? validCloses[validCloses.length - 1]
          : 0;
        if (!Number.isFinite(lp) || lp <= 0) continue;

        const prevCached = this.lastQuoteCache.get(job.sym);
        const prevCloseRaw = Number(item.previousClose || item.chartPreviousClose || prevCached?.prevClose || lp);
        const prevClose = Number(prevCloseRaw.toFixed(2));
        const ch = Number((lp - prevClose).toFixed(2));
        const chp = prevClose > 0 ? Number(((ch / prevClose) * 100).toFixed(2)) : 0;

        const existingBars = this.lastBarsCache.get(job.sym);
        const sparkHigh = validCloses.length > 0 ? Math.max(...validCloses, lp) : lp;
        const sparkLow = validCloses.length > 0 ? Math.min(...validCloses, lp) : lp;
        const dayOpen = Number((existingBars?.[0]?.open || prevCached?.open || firstValidClose || prevClose).toFixed(2));
        const dayHigh = Number(Math.max(prevCached?.high || 0, sparkHigh, lp).toFixed(2));
        const dayLow = Number(
          (prevCached?.low && prevCached.low > 0 ? Math.min(prevCached.low, sparkLow, lp) : Math.min(sparkLow, lp)).toFixed(2)
        );
        const volume = prevCached?.volume || (job.isIdx ? 35000000 : 450000);
        const atp = prevCached?.atp && prevCached.atp > 0
          ? prevCached.atp
          : Number(((dayOpen + dayHigh + dayLow + lp) / 4).toFixed(2));
        const turnoverCr = Number(((volume * atp) / 10000000).toFixed(2));

        const depth = deriveOrderBookDepth({
          volume,
          lp,
          open: dayOpen,
          high: dayHigh,
          low: dayLow,
          chp,
          atp,
          intradayBars: existingBars,
          isIdx: job.isIdx,
        });

        const lttClock = lastTsSec > 0 ? `${getISTPartsFromEpochSec(lastTsSec).timeIST} IST` : `${istTime} IST`;
        const qObj: UnifiedMarketQuote = {
          symbol: job.sym,
          instrumentKey: job.isIdx ? `${job.exchange}_INDEX|${job.sym}` : `${job.exchange}_EQ|${job.sym}`,
          description: INDEX_BASELINE_PRICES[job.sym]?.name || `${job.sym} (${job.exchange})`,
          exchange: job.exchange,
          type: job.isIdx ? 'INDEX' : 'EQUITY',
          lp: Number(lp.toFixed(2)),
          open: dayOpen,
          high: dayHigh,
          low: dayLow,
          prevClose,
          ch,
          chp,
          volume,
          turnoverCr,
          atp: Number(atp.toFixed(2)),
          bid: Number((lp - (job.isIdx ? 0.25 : 0.05)).toFixed(2)),
          ask: Number((lp + (job.isIdx ? 0.25 : 0.05)).toFixed(2)),
          bidQty: depth.bidQty,
          askQty: depth.askQty,
          bidAskRatio: depth.bidAskRatio,
          orderBookBias: depth.orderBookBias,
          oi: prevCached?.oi || 0,
          ltt: isOpen ? lttClock : 'EOD Settlement',
          quoteTimestampSec: lastTsSec || Math.floor(Date.now() / 1000),
          rsi: prevCached?.rsi,
          macd: prevCached?.macd,
          ema20: prevCached?.ema20,
          sma50: prevCached?.sma50,
          recommendScore: prevCached?.recommendScore,
          intradayBars: existingBars,
          source: 'AUTONOMOUS_LIVE_ENGINE',
          isMarketOpen: isOpen,
          marketSession: isOpen ? marketSession : 'CLOSED_SETTLEMENT',
          lastRefreshed: nowIso,
        };

        out[job.sym] = qObj;
        if (job.sym === 'NIFTY 50') out['NIFTY'] = qObj;
      }
    }

    return out;
  }

  private async executeBatchFetch(forceRefresh = false): Promise<Record<string, UnifiedMarketQuote>> {
    const marketStatus = calculateMarketStatus();
    const isOpen = marketStatus.isOpen;
    const isTransitionWindow = marketStatus.session === 'POST_MARKET' || marketStatus.session === 'PRE_OPEN';
    const yahooTtlMs = isOpen ? 30000 : isTransitionWindow ? 90000 : 10 * 60 * 1000;
    const nowIso = new Date().toISOString();
    const istTime = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
    });
    const todayDateIST = getISTPartsFromEpochSec(Math.floor(Date.now() / 1000)).dateIST;

    const tickers: string[] = [
      'NSE:NIFTY',
      'NSE:BANKNIFTY',
      'NSE:CNXFINANCE',
      'NSE:NIFTY_MID_SELECT',
      'NSE:NIFTYJR',
      'BSE:SENSEX',
      'NSE:CNXIT',
      'NSE:INDIAVIX',
    ];

    const equitySymbols: string[] = [];
    for (const stock of NIFTY_200_STOCKS) {
      const clean = cleanSymName(stock.symbol);
      if (!INDEX_BASELINE_PRICES[clean] && clean !== 'NIFTYFPI' && !equitySymbols.includes(clean)) {
        equitySymbols.push(clean);
      }
      const tv = toTvTicker(clean);
      if (tv && !tickers.includes(tv)) {
        tickers.push(tv);
      }
    }

    const resultMap: Record<string, UnifiedMarketQuote> = {};

    // Fire 5m OHLCV bar history warmup asynchronously in background
    const needYahooRefresh =
      forceRefresh ||
      this.lastBarsCache.size < 150 ||
      Date.now() - this.lastYahooFetchTimestamp > yahooTtlMs;
    if (needYahooRefresh) {
      this.triggerBackgroundYahooRefresh(equitySymbols, todayDateIST, isOpen, marketStatus.session, istTime, nowIso);
    }

    // 1. Primary Real-Time L1 Poll via Yahoo Finance Spark (~220ms across all 225 symbols, zero 15-min TV delay)
    const sparkTask = this.fetchYahooSparkL1Quotes(
      equitySymbols,
      isOpen,
      marketStatus.session,
      istTime,
      nowIso
    ).catch(() => ({} as Record<string, UnifiedMarketQuote>));

    // 2. Supplementary TradingView Batch Scan (volume/turnover/indicators + fallback only when Yahoo misses a ticker)
    const tvDataMap: Record<string, {
      lp: number;
      open: number;
      high: number;
      low: number;
      prevClose: number;
      ch: number;
      chp: number;
      volume: number;
      turnoverCr: number;
      rsi?: number;
      macd?: number;
      ema20?: number;
      sma50?: number;
      recommendScore?: number;
      exchange: 'NSE' | 'BSE';
      isIdx: boolean;
    }> = {};

    const tvTask = (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), forceRefresh ? 2400 : 1800);

        const response = await fetch('https://scanner.tradingview.com/india/scan', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          },
          body: JSON.stringify({
            symbols: { tickers, query: { types: [] } },
            columns: [
              'name',
              'close',
              'change',
              'change_abs',
              'open',
              'high',
              'low',
              'volume',
              'Value.Traded',
              'RSI',
              'MACD.macd',
              'EMA20',
              'SMA50',
              'Recommend.All',
            ],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const json = await response.json();
          const rows = Array.isArray(json?.data) ? json.data : [];

          for (const row of rows) {
            const tvSym: string = row?.s;
            const cols: any[] = row?.d;
            if (!tvSym || !Array.isArray(cols) || cols.length < 7) continue;

            const lp = Number(cols[1]);
            if (!Number.isFinite(lp) || lp <= 0) continue;

            const chpRaw = Number(cols[2]);
            const chRaw = Number(cols[3]);
            const openPrice = Number(cols[4]) || lp;
            const highPrice = Number(cols[5]) || lp;
            const lowPrice = Number(cols[6]) || lp;
            const volume = Math.round(Number(cols[7]) || 0);
            const valueTraded = Number(cols[8]) || volume * lp;
            const rsi = Number.isFinite(Number(cols[9])) ? Number(Number(cols[9]).toFixed(2)) : undefined;
            const macd = Number.isFinite(Number(cols[10])) ? Number(Number(cols[10]).toFixed(2)) : undefined;
            const ema20 = Number.isFinite(Number(cols[11])) ? Number(Number(cols[11]).toFixed(2)) : undefined;
            const sma50 = Number.isFinite(Number(cols[12])) ? Number(Number(cols[12]).toFixed(2)) : undefined;
            const recommendScore = Number.isFinite(Number(cols[13]))
              ? Number(Number(cols[13]).toFixed(2))
              : undefined;

            const ch = Number.isFinite(chRaw) ? Number(chRaw.toFixed(2)) : 0;
            const chp = Number.isFinite(chpRaw) ? Number(chpRaw.toFixed(2)) : 0;
            const prevClose = Number((lp - ch).toFixed(2));
            const turnoverCr = Number((valueTraded / 10000000).toFixed(2));
            const cleanSym =
              TV_TICKER_REVERSE[tvSym] || tvSym.replace(/^NSE:/, '').replace(/^BSE:/, '');
            const isIdx = Boolean(INDEX_BASELINE_PRICES[cleanSym]);
            const exchange: 'NSE' | 'BSE' = tvSym.startsWith('BSE:') ? 'BSE' : 'NSE';

            tvDataMap[cleanSym] = {
              lp: Number(lp.toFixed(2)),
              open: Number(openPrice.toFixed(2)),
              high: Number(highPrice.toFixed(2)),
              low: Number(lowPrice.toFixed(2)),
              prevClose,
              ch,
              chp,
              volume: volume || (isIdx ? 35000000 : 450000),
              turnoverCr: turnoverCr > 0 ? turnoverCr : Number(((volume * lp) / 10000000).toFixed(2)),
              rsi,
              macd,
              ema20,
              sma50,
              recommendScore,
              exchange,
              isIdx,
            };
            if (cleanSym === 'NIFTY 50') tvDataMap['NIFTY'] = tvDataMap[cleanSym];
            else if (cleanSym === 'NIFTY') tvDataMap['NIFTY 50'] = tvDataMap[cleanSym];
          }
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('[AutonomousPriceService] TV fetch notice:', err?.message || err);
        }
      }
    })();

    const [sparkQuotes] = await Promise.all([sparkTask, tvTask]);

    // Seed real-time Yahoo Spark quotes first
    for (const [sym, sq] of Object.entries(sparkQuotes)) {
      resultMap[sym] = { ...sq };
    }

    // Supplement volume/technicals (or fallback quote only if Yahoo missed a ticker) without EVER overwriting real-time Yahoo L1 prices with delayed TV prices
    for (const [sym, tv] of Object.entries(tvDataMap)) {
      const liveQ = resultMap[sym];
      if (liveQ) {
        if (tv.volume > 0 && (!liveQ.volume || tv.volume > liveQ.volume)) {
          liveQ.volume = tv.volume;
        }
        if (tv.turnoverCr > 0 && (!liveQ.turnoverCr || tv.turnoverCr > liveQ.turnoverCr)) {
          liveQ.turnoverCr = tv.turnoverCr;
        }
        if (tv.rsi !== undefined) liveQ.rsi = tv.rsi;
        if (tv.macd !== undefined) liveQ.macd = tv.macd;
        if (tv.ema20 !== undefined) liveQ.ema20 = tv.ema20;
        if (tv.sma50 !== undefined) liveQ.sma50 = tv.sma50;
        if (tv.recommendScore !== undefined) liveQ.recommendScore = tv.recommendScore;

        const hasChartBars = Boolean(this.lastBarsCache.get(sym)?.length);
        if (!hasChartBars) {
          liveQ.open = tv.open || liveQ.open;
          liveQ.high = Number(Math.max(tv.high || 0, liveQ.high, liveQ.lp).toFixed(2));
          liveQ.low = Number(Math.min(tv.low > 0 ? tv.low : liveQ.lp, liveQ.low > 0 ? liveQ.low : liveQ.lp, liveQ.lp).toFixed(2));
        }

        const refreshedDepth = deriveOrderBookDepth({
          volume: liveQ.volume,
          lp: liveQ.lp,
          open: liveQ.open,
          high: liveQ.high,
          low: liveQ.low,
          chp: liveQ.chp,
          atp: liveQ.atp,
          intradayBars: this.lastBarsCache.get(sym) || liveQ.intradayBars,
          isIdx: liveQ.type === 'INDEX',
        });
        liveQ.bidQty = refreshedDepth.bidQty;
        liveQ.askQty = refreshedDepth.askQty;
        liveQ.bidAskRatio = refreshedDepth.bidAskRatio;
        liveQ.orderBookBias = refreshedDepth.orderBookBias;
        this.lastQuoteCache.set(sym, liveQ);
      } else {
        const depthTv = deriveOrderBookDepth({
          volume: tv.volume,
          lp: tv.lp,
          open: tv.open,
          high: tv.high,
          low: tv.low,
          chp: tv.chp,
          atp: (tv.open + tv.high + tv.low + tv.lp) / 4,
          intradayBars: this.lastBarsCache.get(sym),
          isIdx: tv.isIdx,
        });
        const quoteObj: UnifiedMarketQuote = {
          symbol: sym,
          instrumentKey: tv.isIdx ? `${tv.exchange}_INDEX|${sym}` : `${tv.exchange}_EQ|${sym}`,
          description: INDEX_BASELINE_PRICES[sym]?.name || `${sym} (${tv.exchange})`,
          exchange: tv.exchange,
          type: tv.isIdx ? 'INDEX' : 'EQUITY',
          lp: tv.lp,
          open: tv.open,
          high: tv.high,
          low: tv.low,
          prevClose: tv.prevClose,
          ch: tv.ch,
          chp: tv.chp,
          volume: tv.volume,
          turnoverCr: tv.turnoverCr,
          atp: Number(((tv.open + tv.high + tv.low + tv.lp) / 4).toFixed(2)),
          bid: Number((tv.lp - (tv.isIdx ? 0.25 : 0.05)).toFixed(2)),
          ask: Number((tv.lp + (tv.isIdx ? 0.25 : 0.05)).toFixed(2)),
          bidQty: depthTv.bidQty,
          askQty: depthTv.askQty,
          bidAskRatio: depthTv.bidAskRatio,
          orderBookBias: depthTv.orderBookBias,
          oi: 0,
          ltt: isOpen ? `${istTime} IST` : 'EOD Settlement',
          rsi: tv.rsi,
          macd: tv.macd,
          ema20: tv.ema20,
          sma50: tv.sma50,
          recommendScore: tv.recommendScore,
          intradayBars: this.lastBarsCache.get(sym),
          source: 'AUTONOMOUS_LIVE_ENGINE',
          isMarketOpen: isOpen,
          marketSession: isOpen ? marketStatus.session : 'CLOSED_SETTLEMENT',
          lastRefreshed: nowIso,
        };
        resultMap[sym] = quoteObj;
        this.lastQuoteCache.set(sym, quoteObj);
      }
    }

    // Store all Spark quotes into lastQuoteCache and overlay live ticks onto active forming 5m bars
    for (const [sym, q] of Object.entries(resultMap)) {
      this.lastQuoteCache.set(sym, q);
      if (isOpen && q.lp > 0) {
        this.overlayLiveTickOnBars(sym, q);
      }
      q.intradayBars = this.lastBarsCache.get(sym) || q.intradayBars;
    }

    for (const sym of equitySymbols) {
      if (!resultMap[sym] && this.lastQuoteCache.has(sym)) {
        const cached = { ...this.lastQuoteCache.get(sym)! };
        cached.isMarketOpen = isOpen;
        cached.marketSession = isOpen ? marketStatus.session : 'CLOSED_SETTLEMENT';
        cached.intradayBars = this.lastBarsCache.get(sym) || cached.intradayBars;
        resultMap[sym] = cached;
      }
    }

    // When closed, preserve previously settled cached indices so transient single-source timeouts never cause wobble
    if (!isOpen) {
      for (const idxSym of ['NIFTY 50', 'NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYNXT50', 'SENSEX', 'NIFTYIT', 'INDIAVIX']) {
        if (!resultMap[idxSym] && this.lastQuoteCache.has(idxSym)) {
          const cachedIdx = { ...this.lastQuoteCache.get(idxSym)! };
          cachedIdx.isMarketOpen = false;
          cachedIdx.marketSession = 'CLOSED_SETTLEMENT';
          cachedIdx.ltt = 'EOD Settlement';
          resultMap[idxSym] = cachedIdx;
        }
      }
    }

    // Ensure major benchmark indices via Moneycontrol backup only if missing
    if (!resultMap['NIFTY 50'] || !resultMap['BANKNIFTY'] || !resultMap['SENSEX']) {
      await this.fetchMoneycontrolIndicesBackup(resultMap, isOpen, marketStatus.session, istTime, nowIso);
    }

    if (Object.keys(resultMap).length > 0) {
      this.lastFetchTimestamp = Date.now();
    }

    return Object.keys(resultMap).length > 0 ? resultMap : this.getCachedQuotes();
  }

  private async fetchYahooRealTimeQuotesAndBars(
    equitySymbols: string[],
    todayDateIST: string,
    isOpen: boolean,
    marketSession: string,
    istTime: string,
    nowIso: string
  ): Promise<Record<string, UnifiedMarketQuote>> {
    const out: Record<string, UnifiedMarketQuote> = {};
    const jobs: Array<{ sym: string; yf: string; exchange: 'NSE' | 'BSE'; isIdx: boolean }> = [
      ...YAHOO_INDEX_TICKERS.map((idx) => ({ sym: idx.sym, yf: idx.yf, exchange: idx.exchange, isIdx: true })),
      ...equitySymbols.map((sym) => ({ sym, yf: toYahooEquityTicker(sym), exchange: 'NSE' as const, isIdx: false })),
    ];

    let cursor = 0;
    const workerCount = 10;

    const runOne = async (job: { sym: string; yf: string; exchange: 'NSE' | 'BSE'; isIdx: boolean }) => {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 3200);
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(job.yf)}?interval=5m&range=5d`,
          {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
              Accept: 'application/json',
            },
            signal: controller.signal,
          }
        );
        clearTimeout(tid);
        if (!res.ok) return;

        const data = await res.json();
        const chart = data?.chart?.result?.[0];
        const meta = chart?.meta;
        if (!meta) return;

        const lp = Number(meta.regularMarketPrice || 0);
        if (!Number.isFinite(lp) || lp <= 0) return;
        const regTimeSec = Number(meta.regularMarketTime || 0);

        const rawTs: number[] = Array.isArray(chart?.timestamp) ? chart.timestamp : [];
        const q0 = chart?.indicators?.quote?.[0] || {};
        const opens: number[] = Array.isArray(q0.open) ? q0.open : [];
        const highs: number[] = Array.isArray(q0.high) ? q0.high : [];
        const lows: number[] = Array.isArray(q0.low) ? q0.low : [];
        const closes: number[] = Array.isArray(q0.close) ? q0.close : [];
        const vols: number[] = Array.isArray(q0.volume) ? q0.volume : [];

        const bars: IntradayCandleBar[] = [];
        for (let i = 0; i < rawTs.length; i++) {
          const tsSec = Number(rawTs[i] || 0);
          const c = Number(closes[i]);
          if (!tsSec || !Number.isFinite(c) || c <= 0) continue;
          const o = Number.isFinite(Number(opens[i])) && Number(opens[i]) > 0 ? Number(opens[i]) : c;
          const h = Number.isFinite(Number(highs[i])) && Number(highs[i]) > 0 ? Number(highs[i]) : Math.max(o, c);
          const l = Number.isFinite(Number(lows[i])) && Number(lows[i]) > 0 ? Number(lows[i]) : Math.min(o, c);
          const v = Math.max(0, Math.round(Number(vols[i]) || 0));

          const istP = getISTPartsFromEpochSec(tsSec);
          if (istP.secIST < 9 * 3600 + 15 * 60 || istP.secIST > 15 * 3600 + 30 * 60) continue;

          bars.push({
            tsSec,
            dateIST: istP.dateIST,
            timeIST: istP.timeIST,
            secIST: istP.secIST,
            open: Number(o.toFixed(2)),
            high: Number(h.toFixed(2)),
            low: Number(l.toFixed(2)),
            close: Number(c.toFixed(2)),
            volume: v,
          });
        }

        const todayBars = bars.filter((b) => b.dateIST === todayDateIST);
        const latestBarDate = bars.length > 0 ? bars[bars.length - 1].dateIST : todayDateIST;
        const activeDate = todayBars.length >= 2 ? todayDateIST : latestBarDate;
        const activeBars = bars.filter((b) => b.dateIST === activeDate);
        const priorBars = bars.filter((b) => b.dateIST < activeDate);
        const prevDayClose = priorBars.length > 0 ? priorBars[priorBars.length - 1].close : undefined;

        const prevClose = Number(
          meta.chartPreviousClose || meta.previousClose || meta.regularMarketPreviousClose || prevDayClose || lp
        );
        const ch = Number((lp - prevClose).toFixed(2));
        const chp = prevClose > 0 ? Number(((ch / prevClose) * 100).toFixed(2)) : 0;

        let volSum = 0;
        let tpvSum = 0;
        let barOpenFirst = 0;
        let barHighMax = 0;
        let barLowMin = Infinity;
        for (const ab of activeBars) {
          if (!barOpenFirst) barOpenFirst = ab.open;
          if (ab.high > barHighMax) barHighMax = ab.high;
          if (ab.low < barLowMin) barLowMin = ab.low;
          volSum += ab.volume;
          tpvSum += ((ab.high + ab.low + ab.close) / 3) * (ab.volume || 1);
        }

        if (activeBars.length > 0) {
          this.lastBarsCache.set(job.sym, activeBars);
        }
        if (bars.length > 0) {
          this.lastExtendedBarsCache.set(job.sym, bars.slice(-140));
        }

        const volume = Number(meta.regularMarketVolume || volSum || (job.isIdx ? 35000000 : 450000));
        const dayHigh = Number(meta.regularMarketDayHigh || (barHighMax > 0 ? barHighMax : Math.max(lp, prevClose)));
        const dayLow = Number(meta.regularMarketDayLow || (barLowMin < Infinity ? barLowMin : Math.min(lp, prevClose)));
        const dayOpen = barOpenFirst || Number(meta.regularMarketOpen || prevClose);
        const atp = volSum > 0 ? Number((tpvSum / volSum).toFixed(2)) : Number(((dayOpen + dayHigh + dayLow + lp) / 4).toFixed(2));
        const turnoverCr = Number(((volume * atp) / 10000000).toFixed(2));

        const depthYf = deriveOrderBookDepth({
          volume,
          lp,
          open: dayOpen,
          high: dayHigh,
          low: dayLow,
          chp,
          atp,
          intradayBars: activeBars,
          isIdx: job.isIdx,
        });
        const chartLtt = regTimeSec > 0 ? `${getISTPartsFromEpochSec(regTimeSec).timeIST} IST` : `${istTime} IST`;
        const qObj: UnifiedMarketQuote = {
          symbol: job.sym,
          instrumentKey: job.isIdx ? `${job.exchange}_INDEX|${job.sym}` : `${job.exchange}_EQ|${job.sym}`,
          description: INDEX_BASELINE_PRICES[job.sym]?.name || `${job.sym} (${job.exchange})`,
          exchange: job.exchange,
          type: job.isIdx ? 'INDEX' : 'EQUITY',
          lp: Number(lp.toFixed(2)),
          open: Number(dayOpen.toFixed(2)),
          high: Number(dayHigh.toFixed(2)),
          low: Number(dayLow.toFixed(2)),
          prevClose: Number(prevClose.toFixed(2)),
          ch,
          chp,
          volume,
          turnoverCr,
          atp,
          bid: Number((lp - (job.isIdx ? 0.25 : 0.05)).toFixed(2)),
          ask: Number((lp + (job.isIdx ? 0.25 : 0.05)).toFixed(2)),
          bidQty: depthYf.bidQty,
          askQty: depthYf.askQty,
          bidAskRatio: depthYf.bidAskRatio,
          orderBookBias: depthYf.orderBookBias,
          oi: 0,
          ltt: isOpen ? chartLtt : 'EOD Settlement',
          quoteTimestampSec: regTimeSec || Math.floor(Date.now() / 1000),
          intradayBars: activeBars,
          source: 'AUTONOMOUS_LIVE_ENGINE',
          isMarketOpen: isOpen,
          marketSession: isOpen ? marketSession : 'CLOSED_SETTLEMENT',
          lastRefreshed: nowIso,
        };

        out[job.sym] = qObj;
        if (job.sym === 'NIFTY 50') out['NIFTY'] = qObj;
      } catch {
        // Non-fatal per ticker
      }
    };

    const workers = Array.from({ length: Math.min(workerCount, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const idx = cursor++;
        if (idx < jobs.length) await runOne(jobs[idx]);
      }
    });

    await Promise.allSettled(workers);
    if (Object.keys(out).length >= 50) {
      this.lastYahooFetchTimestamp = Date.now();
    }
    return out;
  }

  private async fetchMoneycontrolIndicesBackup(
    resultMap: Record<string, UnifiedMarketQuote>,
    isOpen: boolean,
    marketSession: string,
    istTime: string,
    nowIso: string
  ) {
    const mcEntries: Array<{ sym: string; mcId: string; exchange: 'NSE' | 'BSE' }> = [
      { sym: 'NIFTY 50', mcId: '9', exchange: 'NSE' },
      { sym: 'BANKNIFTY', mcId: '23', exchange: 'NSE' },
      { sym: 'FINNIFTY', mcId: '47', exchange: 'NSE' },
      { sym: 'NIFTYNXT50', mcId: '6', exchange: 'NSE' },
      { sym: 'SENSEX', mcId: '4', exchange: 'BSE' },
    ];

    await Promise.allSettled(
      mcEntries.map(async (item) => {
        if (resultMap[item.sym]) return;
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 3500);
          const res = await fetch(
            `https://appfeeds.moneycontrol.com/jsonapi/market/indices&ind_id=${item.mcId}`,
            { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal }
          );
          clearTimeout(tid);
          if (!res.ok) return;
          const j = await res.json();
          const idx = j?.indices;
          if (!idx?.lastprice) return;

          const parseNum = (v: any) => Number(String(v).replace(/,/g, '')) || 0;
          const lp = parseNum(idx.lastprice);
          const ch = parseNum(idx.change);
          const chp = parseNum(idx.percentchange);
          if (lp <= 0) return;

          const prevClose = Number((lp - ch).toFixed(2));
          const mcOpen = parseNum(idx.open) || prevClose;
          const mcHigh = parseNum(idx.high) || lp;
          const mcLow = parseNum(idx.low) || lp;
          const depthMc = deriveOrderBookDepth({
            volume: 35000000,
            lp,
            open: mcOpen,
            high: mcHigh,
            low: mcLow,
            chp,
            atp: lp,
            isIdx: true,
          });
          const quoteObj: UnifiedMarketQuote = {
            symbol: item.sym,
            instrumentKey: `${item.exchange}_INDEX|${item.sym}`,
            description: INDEX_BASELINE_PRICES[item.sym]?.name || item.sym,
            exchange: item.exchange,
            type: 'INDEX',
            lp: Number(lp.toFixed(2)),
            open: mcOpen,
            high: mcHigh,
            low: mcLow,
            prevClose,
            ch: Number(ch.toFixed(2)),
            chp: Number(chp.toFixed(2)),
            volume: 35000000,
            turnoverCr: 0,
            atp: lp,
            bid: Number((lp - 0.25).toFixed(2)),
            ask: Number((lp + 0.25).toFixed(2)),
            bidQty: depthMc.bidQty,
            askQty: depthMc.askQty,
            bidAskRatio: depthMc.bidAskRatio,
            orderBookBias: depthMc.orderBookBias,
            oi: 0,
            ltt: isOpen ? `${istTime} IST` : 'EOD Settlement',
            source: 'MONEYCONTROL_FEED',
            isMarketOpen: isOpen,
            marketSession: isOpen ? marketSession : 'CLOSED_SETTLEMENT',
            lastRefreshed: nowIso,
          };

          resultMap[item.sym] = quoteObj;
          this.lastQuoteCache.set(item.sym, quoteObj);
          if (item.sym === 'NIFTY 50') {
            resultMap['NIFTY'] = quoteObj;
            this.lastQuoteCache.set('NIFTY', quoteObj);
          }
        } catch {
          // Safe ignore
        }
      })
    );
  }
}

export const autonomousPriceService = new AutonomousPriceService();
