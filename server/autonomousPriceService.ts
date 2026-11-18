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
    price: 25227.95,
    prevClose: 25387.4,
    name: 'NIFTY 50 Index',
    exchange: 'NSE',
    tvTicker: 'NSE:NIFTY',
    mcId: '9',
  },
  NIFTY: {
    price: 25227.95,
    prevClose: 25387.4,
    name: 'NIFTY 50 Index',
    exchange: 'NSE',
    tvTicker: 'NSE:NIFTY',
    mcId: '9',
  },
  BANKNIFTY: {
    price: 62038.65,
    prevClose: 62273.25,
    name: 'NIFTY Bank Index',
    exchange: 'NSE',
    tvTicker: 'NSE:BANKNIFTY',
    mcId: '23',
  },
  FINNIFTY: {
    price: 27992.25,
    prevClose: 28195.0,
    name: 'NIFTY Financial Services',
    exchange: 'NSE',
    tvTicker: 'NSE:CNXFINANCE',
    mcId: '47',
  },
  MIDCPNIFTY: {
    price: 14083.35,
    prevClose: 14277.45,
    name: 'NIFTY Midcap Select',
    exchange: 'NSE',
    tvTicker: 'NSE:NIFTY_MID_SELECT',
  },
  NIFTYNXT50: {
    price: 71714.7,
    prevClose: 72693.0,
    name: 'NIFTY Next 50 Index',
    exchange: 'NSE',
    tvTicker: 'NSE:NIFTYJR',
    mcId: '6',
  },
  SENSEX: {
    price: 82031.81,
    prevClose: 82532.19,
    name: 'BSE SENSEX 30',
    exchange: 'BSE',
    tvTicker: 'BSE:SENSEX',
    mcId: '4',
  },
  NIFTYIT: {
    price: 31262.3,
    prevClose: 31654.1,
    name: 'NIFTY IT Index',
    exchange: 'NSE',
    tvTicker: 'NSE:CNXIT',
    mcId: '19',
  },
  INDIAVIX: {
    price: 15.52,
    prevClose: 15.52,
    name: 'India Volatility Index',
    exchange: 'NSE',
    tvTicker: 'NSE:INDIAVIX',
    mcId: '36',
  },
};

const TV_SPECIAL_TICKERS: Record<string, string> = {
  'BAJAJ-AUTO': 'NSE:BAJAJ_AUTO',
  'NAM-INDIA': 'NSE:NAM_INDIA',
  'M&M': 'NSE:M_M',
  'M&MFIN': 'NSE:M_MFIN',
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
  'NSE:M_M': 'M&M',
  'NSE:M_MFIN': 'M&MFIN',
};

const GROWW_EQUITY_ALIASES: Record<string, string> = {
  ZOMATO: 'ETERNAL',
  TATAMOTORS: 'TMPV',
  'L&TFH': 'LTF',
  'MCDOWELL-N': 'UNITDSPR',
  GMRINFRA: 'GMRAIRPORT',
};

const GROWW_INDEX_SLUGS: Array<{ sym: string; exchange: 'NSE' | 'BSE'; slug: string }> = [
  { sym: 'NIFTY 50', exchange: 'NSE', slug: 'NIFTY' },
  { sym: 'BANKNIFTY', exchange: 'NSE', slug: 'BANKNIFTY' },
  { sym: 'FINNIFTY', exchange: 'NSE', slug: 'FINNIFTY' },
  { sym: 'MIDCPNIFTY', exchange: 'NSE', slug: 'MIDCPNIFTY' },
  { sym: 'NIFTYNXT50', exchange: 'NSE', slug: 'NIFTYNXT50' },
  { sym: 'NIFTYIT', exchange: 'NSE', slug: 'CNXIT' },
  { sym: 'SENSEX', exchange: 'BSE', slug: 'SENSEX' },
];

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
 * Derives NSE order-book Bid/Ask Quantities & Bid/Ask Ratio from
 * 5-minute intraday OHLCV accumulation/distribution pressure, range location,
 * VWAP/ATP control, and session momentum whenever full exchange depth is absent.
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

  const daySpan = high > low ? high - low : Math.max(0.05, lp * 0.01);
  const rangePos = Math.max(-1, Math.min(1, ((lp - low) / daySpan) * 2 - 1));
  const vwapBias = Math.max(-1, Math.min(1, (lp - effAtp) / Math.max(0.05, lp * 0.008)));
  const momentumBias = Math.max(-1, Math.min(1, chp / 2.8));

  const imbalance = Math.max(
    -0.95,
    Math.min(0.95, 0.38 * barsPressure + 0.24 * rangePos + 0.16 * vwapBias + 0.22 * momentumBias)
  );

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
  private lastBarsRefreshTimestamp = 0;
  private inFlightPromise: Promise<Record<string, UnifiedMarketQuote>> | null = null;
  private barsInFlightPromise: Promise<void> | null = null;

  public getExtendedBars(symbol: string): IntradayCandleBar[] | undefined {
    const clean = cleanSymName(symbol);
    return this.lastExtendedBarsCache.get(clean) || this.lastBarsCache.get(clean);
  }

  public setSymbolBars(symbol: string, activeBars: IntradayCandleBar[], extendedBars?: IntradayCandleBar[]) {
    const clean = cleanSymName(symbol);
    if (!clean) return;
    if (activeBars.length > 0) {
      this.lastBarsCache.set(clean, activeBars);
      if (clean === 'NIFTY 50') this.lastBarsCache.set('NIFTY', activeBars);
    }
    if (extendedBars && extendedBars.length > 0) {
      this.lastExtendedBarsCache.set(clean, extendedBars.slice(-140));
      if (clean === 'NIFTY 50') this.lastExtendedBarsCache.set('NIFTY', extendedBars.slice(-140));
    }
    const existing = this.lastQuoteCache.get(clean);
    if (existing && activeBars.length > 0) {
      existing.intradayBars = activeBars;
      this.lastQuoteCache.set(clean, existing);
    }
    this.lastBarsRefreshTimestamp = Date.now();
  }

  public async ensureInitialBarsLoaded(): Promise<void> {
    if (this.lastBarsCache.size >= 150) return;
    if (!this.barsInFlightPromise) {
      await this.fetchAllMarketQuotes(false);
    }
    if (this.barsInFlightPromise) {
      await Promise.race([
        this.barsInFlightPromise,
        new Promise<void>((resolve) => setTimeout(resolve, 22000)),
      ]);
    }
  }

  /**
   * Overlays a real-time Upstox quote onto the active 5-minute forming candle and quote cache.
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

  private triggerBackgroundBarsRefresh(equitySymbols: string[], todayDateIST: string) {
    if (this.barsInFlightPromise) return;
    this.lastBarsRefreshTimestamp = Date.now();
    this.barsInFlightPromise = this.fetchNse5mBarsFallback(equitySymbols, todayDateIST)
      .catch(() => {})
      .finally(() => {
        this.barsInFlightPromise = null;
      });
  }

  /**
   * Fetches NSE 5-minute OHLCV candles from Groww's NSE delayed charting endpoint
   * (zero Yahoo Finance) ONLY to hydrate missing technical bars when Upstox candles are not yet populated.
   * Never mutates L1 lp / prevClose / ch / chp.
   */
  private async fetchNse5mBarsFallback(equitySymbols: string[], todayDateIST: string): Promise<void> {
    const nowSec = Math.floor(Date.now() / 1000);
    const startSec = nowSec - 5 * 86400;

    const jobs: Array<{ sym: string; url: string }> = [
      ...GROWW_INDEX_SLUGS.map((idx) => ({
        sym: idx.sym,
        url: `https://groww.in/v1/api/charting_service/v2/chart/delayed/exchange/${idx.exchange}/segment/CASH/${encodeURIComponent(idx.slug)}?endTimeInMillis=${nowSec * 1000}&intervalInMinutes=5&startTimeInMillis=${startSec * 1000}`,
      })),
      ...equitySymbols.map((sym) => {
        const gSym = GROWW_EQUITY_ALIASES[sym] || sym;
        return {
          sym,
          url: `https://groww.in/v1/api/charting_service/v2/chart/delayed/exchange/NSE/segment/CASH/${encodeURIComponent(gSym)}?endTimeInMillis=${nowSec * 1000}&intervalInMinutes=5&startTimeInMillis=${startSec * 1000}`,
        };
      }),
    ];

    let cursor = 0;
    const workerCount = 16;

    const runOne = async (job: { sym: string; url: string }) => {
      try {
        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), 3200);
        const res = await fetch(job.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', Accept: 'application/json' },
          signal: controller.signal,
        });
        clearTimeout(tid);
        if (!res.ok) return;

        const json = await res.json();
        const rawCandles: any[] = Array.isArray(json?.candles) ? json.candles : [];
        if (rawCandles.length === 0) return;

        const bucketMap = new Map<string, IntradayCandleBar & { cumVol: number }>();
        for (const row of rawCandles) {
          if (!Array.isArray(row) || row.length < 5) continue;
          const tsSec = Number(row[0] || 0);
          const o = Number(row[1]);
          const h = Number(row[2]);
          const l = Number(row[3]);
          const c = Number(row[4]);
          const cumVol = Math.max(0, Math.round(Number(row[5]) || 0));
          if (!tsSec || !Number.isFinite(c) || c <= 0) continue;

          const istP = getISTPartsFromEpochSec(tsSec);
          if (istP.secIST < 9 * 3600 + 15 * 60 || istP.secIST > 15 * 3600 + 30 * 60) continue;

          const bucketSec = Math.floor(istP.secIST / 300) * 300;
          const bh = String(Math.floor(bucketSec / 3600)).padStart(2, '0');
          const bm = String(Math.floor((bucketSec % 3600) / 60)).padStart(2, '0');
          const bucketKey = `${istP.dateIST}|${bucketSec}`;
          const existing = bucketMap.get(bucketKey);

          const openPx = Number.isFinite(o) && o > 0 ? o : c;
          const highPx = Number.isFinite(h) && h > 0 ? Math.max(openPx, h, c) : Math.max(openPx, c);
          const lowPx = Number.isFinite(l) && l > 0 ? Math.min(openPx, l, c) : Math.min(openPx, c);

          if (!existing) {
            bucketMap.set(bucketKey, {
              tsSec: tsSec - (istP.secIST - bucketSec),
              dateIST: istP.dateIST,
              timeIST: `${bh}:${bm}:00`,
              secIST: bucketSec,
              open: Number(openPx.toFixed(2)),
              high: Number(highPx.toFixed(2)),
              low: Number(lowPx.toFixed(2)),
              close: Number(c.toFixed(2)),
              volume: cumVol,
              cumVol,
            });
          } else {
            existing.high = Number(Math.max(existing.high, highPx).toFixed(2));
            existing.low = Number(Math.min(existing.low, lowPx).toFixed(2));
            existing.close = Number(c.toFixed(2));
            existing.cumVol = Math.max(existing.cumVol, cumVol);
          }
        }

        const sortedRaw = Array.from(bucketMap.values()).sort((a, b) => a.tsSec - b.tsSec);
        // Convert Groww's cumulative session volume into accurate per-5m-bar delta volume
        let prevDate = '';
        let prevCum = 0;
        const bars: IntradayCandleBar[] = sortedRaw.map((b) => {
          let barVol = b.cumVol;
          if (b.dateIST === prevDate) {
            barVol = b.cumVol >= prevCum ? Math.max(0, b.cumVol - prevCum) : b.cumVol;
          }
          prevDate = b.dateIST;
          prevCum = b.cumVol;
          return {
            tsSec: b.tsSec,
            dateIST: b.dateIST,
            timeIST: b.timeIST,
            secIST: b.secIST,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: barVol,
          };
        });

        const todayBars = bars.filter((b) => b.dateIST === todayDateIST);
        const latestBarDate = bars.length > 0 ? bars[bars.length - 1].dateIST : todayDateIST;
        const activeDate = todayBars.length >= 2 ? todayDateIST : latestBarDate;
        const activeBars = bars.filter((b) => b.dateIST === activeDate);

        if (activeBars.length > 0) {
          this.lastBarsCache.set(job.sym, activeBars);
          if (job.sym === 'NIFTY 50') this.lastBarsCache.set('NIFTY', activeBars);
        }
        if (bars.length > 0) {
          this.lastExtendedBarsCache.set(job.sym, bars.slice(-140));
          if (job.sym === 'NIFTY 50') this.lastExtendedBarsCache.set('NIFTY', bars.slice(-140));
        }

        const cachedQuote = this.lastQuoteCache.get(job.sym);
        if (cachedQuote && activeBars.length > 0) {
          cachedQuote.intradayBars = activeBars;
          const depth = deriveOrderBookDepth({
            volume: cachedQuote.volume,
            lp: cachedQuote.lp,
            open: cachedQuote.open,
            high: cachedQuote.high,
            low: cachedQuote.low,
            chp: cachedQuote.chp,
            atp: cachedQuote.atp,
            intradayBars: activeBars,
            isIdx: cachedQuote.type === 'INDEX',
          });
          cachedQuote.bidQty = depth.bidQty;
          cachedQuote.askQty = depth.askQty;
          cachedQuote.bidAskRatio = depth.bidAskRatio;
          cachedQuote.orderBookBias = depth.orderBookBias;
          this.lastQuoteCache.set(job.sym, cachedQuote);
        }
      } catch {
        // Non-fatal per symbol
      }
    };

    const workers = Array.from({ length: Math.min(workerCount, jobs.length) }, async () => {
      while (cursor < jobs.length) {
        const idx = cursor++;
        if (idx < jobs.length) await runOne(jobs[idx]);
      }
    });

    await Promise.allSettled(workers);
    if (this.lastBarsCache.size >= 50) {
      this.lastBarsRefreshTimestamp = Date.now();
    }
  }

  private async executeBatchFetch(forceRefresh = false): Promise<Record<string, UnifiedMarketQuote>> {
    const marketStatus = calculateMarketStatus();
    const isOpen = marketStatus.isOpen;
    const isTransitionWindow = marketStatus.session === 'POST_MARKET' || marketStatus.session === 'PRE_OPEN';
    const barsTtlMs = isOpen ? 30000 : isTransitionWindow ? 90000 : 10 * 60 * 1000;
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

    const needBarsRefresh =
      forceRefresh ||
      this.lastBarsCache.size < 150 ||
      Date.now() - this.lastBarsRefreshTimestamp > barsTtlMs;
    if (needBarsRefresh) {
      this.triggerBackgroundBarsRefresh(equitySymbols, todayDateIST);
    }

    // Autonomous Non-Yahoo Batch Scan (TradingView India + Moneycontrol Indices fallback when Upstox token is inactive)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), forceRefresh ? 3500 : 2500);

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
          const cleanSym = TV_TICKER_REVERSE[tvSym] || tvSym.replace(/^NSE:/, '').replace(/^BSE:/, '');
          const isIdx = Boolean(INDEX_BASELINE_PRICES[cleanSym]);
          const exchange: 'NSE' | 'BSE' = tvSym.startsWith('BSE:') ? 'BSE' : 'NSE';
          const volume = Math.round(Number(cols[7]) || (isIdx ? 35000000 : 450000));
          const valueTraded = Number(cols[8]) || volume * lp;
          const rsi = Number.isFinite(Number(cols[9])) ? Number(Number(cols[9]).toFixed(2)) : undefined;
          const macd = Number.isFinite(Number(cols[10])) ? Number(Number(cols[10]).toFixed(2)) : undefined;
          const ema20 = Number.isFinite(Number(cols[11])) ? Number(Number(cols[11]).toFixed(2)) : undefined;
          const sma50 = Number.isFinite(Number(cols[12])) ? Number(Number(cols[12]).toFixed(2)) : undefined;
          const recommendScore = Number.isFinite(Number(cols[13]))
            ? Number(Number(cols[13]).toFixed(2))
            : undefined;

          const ch = Number.isFinite(chRaw) ? Number(chRaw.toFixed(2)) : 0;
          const prevClose = Number((lp - ch).toFixed(2));
          const chp = Number.isFinite(chpRaw)
            ? Number(chpRaw.toFixed(2))
            : prevClose > 0
            ? Number(((ch / prevClose) * 100).toFixed(2))
            : 0;
          const turnoverCr = Number((valueTraded / 10000000).toFixed(2));
          const bars = this.lastBarsCache.get(cleanSym);

          const depthTv = deriveOrderBookDepth({
            volume,
            lp,
            open: Number(openPrice.toFixed(2)),
            high: Number(highPrice.toFixed(2)),
            low: Number(lowPrice.toFixed(2)),
            chp,
            atp: (openPrice + highPrice + lowPrice + lp) / 4,
            intradayBars: bars,
            isIdx,
          });

          const quoteObj: UnifiedMarketQuote = {
            symbol: cleanSym,
            instrumentKey: isIdx ? `${exchange}_INDEX|${cleanSym}` : `${exchange}_EQ|${cleanSym}`,
            description: INDEX_BASELINE_PRICES[cleanSym]?.name || `${cleanSym} (${exchange})`,
            exchange,
            type: isIdx ? 'INDEX' : 'EQUITY',
            lp: Number(lp.toFixed(2)),
            open: Number(openPrice.toFixed(2)),
            high: Number(highPrice.toFixed(2)),
            low: Number(lowPrice.toFixed(2)),
            prevClose,
            ch,
            chp,
            volume,
            turnoverCr: turnoverCr > 0 ? turnoverCr : Number(((volume * lp) / 10000000).toFixed(2)),
            atp: Number(((openPrice + highPrice + lowPrice + lp) / 4).toFixed(2)),
            bid: Number((lp - (isIdx ? 0.25 : 0.05)).toFixed(2)),
            ask: Number((lp + (isIdx ? 0.25 : 0.05)).toFixed(2)),
            bidQty: depthTv.bidQty,
            askQty: depthTv.askQty,
            bidAskRatio: depthTv.bidAskRatio,
            orderBookBias: depthTv.orderBookBias,
            oi: 0,
            ltt: isOpen ? `${istTime} IST` : 'EOD Settlement',
            quoteTimestampSec: Math.floor(Date.now() / 1000),
            rsi,
            macd,
            ema20,
            sma50,
            recommendScore,
            intradayBars: bars,
            source: 'AUTONOMOUS_LIVE_ENGINE',
            isMarketOpen: isOpen,
            marketSession: isOpen ? marketStatus.session : 'CLOSED_SETTLEMENT',
            lastRefreshed: nowIso,
          };

          resultMap[cleanSym] = quoteObj;
          this.lastQuoteCache.set(cleanSym, quoteObj);
          if (cleanSym === 'NIFTY 50') {
            resultMap['NIFTY'] = quoteObj;
            this.lastQuoteCache.set('NIFTY', quoteObj);
          } else if (cleanSym === 'NIFTY') {
            resultMap['NIFTY 50'] = quoteObj;
            this.lastQuoteCache.set('NIFTY 50', quoteObj);
          }
          if (isOpen && quoteObj.lp > 0) {
            this.overlayLiveTickOnBars(cleanSym, quoteObj);
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.warn('[AutonomousPriceService] Fallback quote notice:', err?.message || err);
      }
    }

    // Backfill cached quotes if any symbol missed
    for (const sym of equitySymbols) {
      if (!resultMap[sym] && this.lastQuoteCache.has(sym)) {
        const cached = { ...this.lastQuoteCache.get(sym)! };
        cached.isMarketOpen = isOpen;
        cached.marketSession = isOpen ? marketStatus.session : 'CLOSED_SETTLEMENT';
        cached.intradayBars = this.lastBarsCache.get(sym) || cached.intradayBars;
        resultMap[sym] = cached;
      }
    }

    // Ensure major benchmark indices + INDIAVIX change via Moneycontrol if missing or 0-change VIX
    if (
      !resultMap['NIFTY 50'] ||
      !resultMap['BANKNIFTY'] ||
      !resultMap['SENSEX'] ||
      !resultMap['INDIAVIX'] ||
      resultMap['INDIAVIX'].ch === 0
    ) {
      await this.fetchMoneycontrolIndicesBackup(resultMap, isOpen, marketStatus.session, istTime, nowIso);
    }

    if (Object.keys(resultMap).length > 0) {
      this.lastFetchTimestamp = Date.now();
    }

    return Object.keys(resultMap).length > 0 ? resultMap : this.getCachedQuotes();
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
      { sym: 'INDIAVIX', mcId: '36', exchange: 'NSE' },
    ];

    await Promise.allSettled(
      mcEntries.map(async (item) => {
        const existing = resultMap[item.sym];
        if (existing && !(item.sym === 'INDIAVIX' && existing.ch === 0)) return;
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
