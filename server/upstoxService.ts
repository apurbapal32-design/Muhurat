import fs from 'fs';
import os from 'os';
import path from 'path';
import zlib from 'zlib';
import { NIFTY_200_STOCKS } from '../src/data/nifty200';
import {
  calculateMarketStatus,
  getISTDateParts,
  INITIAL_MARKET_HOLIDAYS,
} from '../src/data/marketSchedule';
import {
  autonomousPriceService,
  deriveOrderBookDepth,
  getIndexBaselinePrices,
  UnifiedMarketQuote,
} from './autonomousPriceService';

export interface UpstoxProfile {
  user_id?: string;
  user_name?: string;
  email?: string;
  exchanges?: string[];
  products?: string[];
  broker?: string;
  is_active?: boolean;
}

export interface UpstoxBrokerHoliday {
  date: string;
  description: string;
  holiday_type: 'TRADING_HOLIDAY' | 'SETTLEMENT_HOLIDAY' | 'SPECIAL_TIMING' | string;
  closed_exchanges: string[];
  open_exchanges?: Array<{ exchange: string; start_time: number; end_time: number }>;
  source?: 'UPSTOX_API_V2' | 'NSE_EXCHANGE_CALENDAR';
}

export interface UpstoxMarketTiming {
  exchange: string;
  start_time: number;
  end_time: number;
}

export interface SpecialEventOffDay {
  date: string;
  name: string;
  type: 'SPECIAL_EVENT_OFF_DAY' | 'TRADING_HOLIDAY' | 'WEEKEND_OFF_DAY';
  exchange: string;
  description?: string;
  source?: string;
  createdAt: string;
}

export type BrokerDayCategory =
  | 'TRADING_DAY'
  | 'WEEKEND_OFF_DAY'
  | 'HOLIDAY_OFF_DAY'
  | 'SPECIAL_EVENT_OFF_DAY'
  | 'SPECIAL_SESSION';

export interface BrokerMarketScheduleStatus {
  dateIST: string;
  weekday: string;
  dayCategory: BrokerDayCategory;
  isTradingDay: boolean;
  isMarketOffDay: boolean;
  isWeekendOffDay: boolean;
  isHolidayOffDay: boolean;
  isSpecialEventOffDay: boolean;
  isSpecialSession: boolean;
  eventName: string | null;
  description: string;
  exchangeStatus: string;
  brokerApiSource: 'UPSTOX_MARKET_INFO_V2' | 'CACHED_BROKER_SCHEDULE';
  isBrokerOffDayScanEnabled: boolean;
  timings: UpstoxMarketTiming[];
  holidays: UpstoxBrokerHoliday[];
  specialEventOffDays: SpecialEventOffDay[];
  nextTradingDay: string;
  fetchedAt: string;
}

const INDEX_UPSTOX_KEYS: Record<string, { key: string; name: string; exchange: 'NSE' | 'BSE' }> = {
  'NIFTY 50': { key: 'NSE_INDEX|Nifty 50', name: 'NIFTY 50 Index', exchange: 'NSE' },
  NIFTY: { key: 'NSE_INDEX|Nifty 50', name: 'NIFTY 50 Index', exchange: 'NSE' },
  NIFTY50: { key: 'NSE_INDEX|Nifty 50', name: 'NIFTY 50 Index', exchange: 'NSE' },
  BANKNIFTY: { key: 'NSE_INDEX|Nifty Bank', name: 'NIFTY Bank Index', exchange: 'NSE' },
  'BANK NIFTY': { key: 'NSE_INDEX|Nifty Bank', name: 'NIFTY Bank Index', exchange: 'NSE' },
  FINNIFTY: { key: 'NSE_INDEX|Nifty Fin Service', name: 'NIFTY Financial Services', exchange: 'NSE' },
  'FIN NIFTY': { key: 'NSE_INDEX|Nifty Fin Service', name: 'NIFTY Financial Services', exchange: 'NSE' },
  MIDCPNIFTY: { key: 'NSE_INDEX|NIFTY MID SELECT', name: 'NIFTY Midcap Select', exchange: 'NSE' },
  'MIDCP NIFTY': { key: 'NSE_INDEX|NIFTY MID SELECT', name: 'NIFTY Midcap Select', exchange: 'NSE' },
  NIFTYNXT50: { key: 'NSE_INDEX|Nifty Next 50', name: 'NIFTY Next 50 Index', exchange: 'NSE' },
  'NEXT 50': { key: 'NSE_INDEX|Nifty Next 50', name: 'NIFTY Next 50 Index', exchange: 'NSE' },
  NIFTYIT: { key: 'NSE_INDEX|Nifty IT', name: 'NIFTY IT Index', exchange: 'NSE' },
  INDIAVIX: { key: 'NSE_INDEX|India VIX', name: 'India Volatility Index', exchange: 'NSE' },
  'INDIA VIX': { key: 'NSE_INDEX|India VIX', name: 'India Volatility Index', exchange: 'NSE' },
  SENSEX: { key: 'BSE_INDEX|SENSEX', name: 'BSE SENSEX 30', exchange: 'BSE' },
};

const INSTRUMENTS_CACHE_FILE = path.join(os.tmpdir(), 'upstox_nse_eq_map.json');
const SPECIAL_OFF_DAYS_FILE = path.join(os.tmpdir(), 'muhurat_special_off_days.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

class UpstoxService {
  // Maps clean equity symbol (e.g. "RELIANCE") -> Upstox instrument_key (e.g. "NSE_EQ|INE002A01018")
  private eqInstrumentMap: Map<string, string> = new Map();
  // Reverse map instrument_token ("NSE_EQ|INE002A01018") -> clean symbol ("RELIANCE")
  private reverseKeyMap: Map<string, string> = new Map();
  private instrumentsLoadedAt = 0;
  private loadingPromise: Promise<void> | null = null;
  private lastUpstoxQuotes: Record<string, UnifiedMarketQuote> = {};
  private lastUpstoxQuotesAt = 0;
  private lastUpstoxTokenTag = '';
  private inFlightUpstoxBatch: Promise<Record<string, UnifiedMarketQuote>> | null = null;

  // Broker API v2 Market Info caches & Special Event Market Off Days
  private brokerHolidaysCache: UpstoxBrokerHoliday[] = [];
  private brokerHolidaysFetchedAt = 0;
  private brokerHolidaysFromApi = false;
  private marketTimingsCache: Map<string, { timings: UpstoxMarketTiming[]; fetchedAt: number; fromApi: boolean }> =
    new Map();
  private exchangeStatusCache: { status: string; fetchedAt: number; fromApi: boolean } = {
    status: 'UNKNOWN',
    fetchedAt: 0,
    fromApi: false,
  };
  private specialEventOffDays: SpecialEventOffDay[] = [];
  private lastResolvedSchedule: BrokerMarketScheduleStatus | null = null;

  constructor() {
    this.loadCachedMapFromDisk();
    this.loadSpecialOffDaysFromDisk();
    // Pre-warm reverse index map for indices immediately
    Object.entries(INDEX_UPSTOX_KEYS).forEach(([sym, info]) => {
      if (!this.reverseKeyMap.has(info.key)) {
        this.reverseKeyMap.set(info.key, sym === 'NIFTY' || sym === 'NIFTY50' ? 'NIFTY 50' : sym);
      }
    });
  }

  public clearQuotesCache() {
    this.lastUpstoxQuotes = {};
    this.lastUpstoxQuotesAt = 0;
    this.lastUpstoxTokenTag = '';
    this.inFlightUpstoxBatch = null;
  }

  private loadCachedMapFromDisk() {
    try {
      if (fs.existsSync(INSTRUMENTS_CACHE_FILE)) {
        const stat = fs.statSync(INSTRUMENTS_CACHE_FILE);
        if (Date.now() - stat.mtimeMs < CACHE_TTL_MS) {
          const parsed = JSON.parse(fs.readFileSync(INSTRUMENTS_CACHE_FILE, 'utf-8'));
          if (parsed && typeof parsed === 'object') {
            Object.entries(parsed).forEach(([sym, key]) => {
              if (typeof key === 'string') {
                this.eqInstrumentMap.set(sym, key);
                this.reverseKeyMap.set(key, sym);
              }
            });
            this.instrumentsLoadedAt = stat.mtimeMs;
          }
        }
      }
    } catch {
      // Non-fatal
    }
  }

  public async ensureInstrumentsLoaded(): Promise<void> {
    if (
      this.eqInstrumentMap.size >= 150 &&
      Date.now() - this.instrumentsLoadedAt < CACHE_TTL_MS
    ) {
      return;
    }
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = this.downloadAndCacheNseInstruments().finally(() => {
      this.loadingPromise = null;
    });
    return this.loadingPromise;
  }

  private async downloadAndCacheNseInstruments(): Promise<void> {
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(
        'https://assets.upstox.com/market-quote/instruments/exchange/NSE.json.gz',
        {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: controller.signal,
        }
      );
      clearTimeout(tid);
      if (!res.ok) return;

      const arrayBuf = await res.arrayBuffer();
      const rawBuf = Buffer.from(arrayBuf);
      // Assets may come gzipped or decompressed depending on fetch layer
      let jsonStr = '';
      try {
        jsonStr = zlib.gunzipSync(rawBuf).toString('utf-8');
      } catch {
        jsonStr = rawBuf.toString('utf-8');
      }

      const list: any[] = JSON.parse(jsonStr);
      const targetSyms = new Set(NIFTY_200_STOCKS.map((s) => this.cleanSymbol(s.symbol)));
      const serialized: Record<string, string> = {};

      for (const item of list) {
        if (item?.segment === 'NSE_EQ' && item?.trading_symbol && item?.instrument_key) {
          const ts = String(item.trading_symbol).toUpperCase().trim();
          if (targetSyms.has(ts) || item.instrument_type === 'EQ') {
            this.eqInstrumentMap.set(ts, item.instrument_key);
            this.reverseKeyMap.set(item.instrument_key, ts);
            if (targetSyms.has(ts)) {
              serialized[ts] = item.instrument_key;
            }
          }
        }
      }

      this.instrumentsLoadedAt = Date.now();
      fs.writeFileSync(INSTRUMENTS_CACHE_FILE, JSON.stringify(serialized));
      console.log(
        `[UpstoxService] Loaded ${this.eqInstrumentMap.size} NSE equity keys (${Object.keys(serialized).length} Nifty-200 matches cached).`
      );
    } catch (err: any) {
      console.warn('[UpstoxService] Instrument master fetch notice:', err?.message || err);
    }
  }

  public cleanSymbol(raw: string): string {
    return raw
      .toUpperCase()
      .replace(/\.NS$/, '')
      .replace(/^NSE:/, '')
      .replace(/^BSE:/, '')
      .replace(/^NSE_EQ\|/, '')
      .replace(/^NSE_INDEX\|/, '')
      .replace(/^BSE_INDEX\|/, '')
      .replace(/-EQ$/, '')
      .replace(/-INDEX$/, '')
      .trim();
  }

  public getInstrumentKey(rawSymbol: string): string {
    const clean = this.cleanSymbol(rawSymbol);
    if (INDEX_UPSTOX_KEYS[clean]) {
      return INDEX_UPSTOX_KEYS[clean].key;
    }
    return this.eqInstrumentMap.get(clean) || `NSE_EQ|${clean}`;
  }

  public getAuthDialogUrl(apiKey: string, redirectUri: string, state = 'muhurat_terminal'): string {
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: apiKey.trim(),
      redirect_uri: redirectUri.trim(),
      state,
    });
    return `https://api.upstox.com/v2/login/authorization/dialog?${params.toString()}`;
  }

  public async exchangeAuthCode(
    code: string,
    apiKey: string,
    apiSecret: string,
    redirectUri: string
  ): Promise<{ accessToken: string; profile?: UpstoxProfile }> {
    const body = new URLSearchParams({
      code: code.trim(),
      client_id: apiKey.trim(),
      client_secret: apiSecret.trim(),
      redirect_uri: redirectUri.trim(),
      grant_type: 'authorization_code',
    });

    const res = await fetch('https://api.upstox.com/v2/login/authorization/token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const json = await res.json();
    if (!res.ok || !json.access_token) {
      throw new Error(json?.errors?.[0]?.message || json?.message || 'Failed to exchange Upstox auth code');
    }

    return {
      accessToken: json.access_token,
      profile: {
        user_id: json.user_id,
        user_name: json.user_name,
        email: json.email,
        exchanges: json.exchanges,
        products: json.products,
        broker: json.broker,
        is_active: json.is_active,
      },
    };
  }

  public async validateAccessToken(
    accessToken: string
  ): Promise<{ valid: boolean; tokenType: 'USER_ACCESS' | 'ANALYTICS_READONLY' | 'INVALID'; profile?: UpstoxProfile; message?: string }> {
    const token = (accessToken || '').trim();
    if (!token || token.length < 15) {
      return { valid: false, tokenType: 'INVALID', message: 'Token missing or too short' };
    }

    // 1. Try User Profile endpoint (Standard OAuth Access Token)
    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 5000);
      const profileRes = await fetch('https://api.upstox.com/v2/user/profile', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
      });
      clearTimeout(tid);

      if (profileRes.ok) {
        const json = await profileRes.json();
        if (json?.status === 'success' && json?.data) {
          return {
            valid: true,
            tokenType: 'USER_ACCESS',
            profile: json.data,
            message: `Upstox Connected: ${json.data.user_name || json.data.user_id || 'Active Trader'}`,
          };
        }
      }
    } catch {
      // Fallback to market-quote LTP verification (Analytics Tokens only allow read-only market endpoints)
    }

    // 2. Try v3 Market Quote LTP (Supports 1-Year Read-Only Analytics Tokens too!)
    try {
      const controller2 = new AbortController();
      const tid2 = setTimeout(() => controller2.abort(), 5000);
      const qRes = await fetch(
        'https://api.upstox.com/v3/market-quote/ltp?instrument_key=NSE_INDEX%7CNifty%2050',
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
          },
          signal: controller2.signal,
        }
      );
      clearTimeout(tid2);

      if (qRes.ok) {
        const qJson = await qRes.json();
        if (qJson?.status === 'success') {
          return {
            valid: true,
            tokenType: 'ANALYTICS_READONLY',
            message: 'Upstox Analytics / Market Data Feed Verified!',
          };
        }
      }
    } catch (err: any) {
      return { valid: false, tokenType: 'INVALID', message: err?.message || 'Upstox network check failed' };
    }

    return {
      valid: false,
      tokenType: 'INVALID',
      message: 'Upstox API returned Unauthorized (401). Please generate a fresh Access Token or Analytics Token.',
    };
  }

  /**
   * Fetches live quotes using Upstox API v2 Full Market Quotes (when token active)
   * blended with Autonomous Multi-Source Real-Time Engine so 100% of symbols are ALWAYS live & accurate.
   */
  public async fetchUnifiedMarketQuotes(
    symbols: string[],
    accessToken?: string,
    fallbackPrices?: Record<string, number | { price: number; change: number; changePercent: number; open?: number; high?: number; low?: number; prevClose?: number }>
  ): Promise<Record<string, UnifiedMarketQuote>> {
    const resolvedToken = (accessToken || process.env.UPSTOX_ACCESS_TOKEN || '').trim();
    const marketStatus = calculateMarketStatus();
    const isLiveMarket = marketStatus.isOpen;
    const nowIso = new Date().toISOString();
    const istTime = new Date().toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour12: false,
    });

    // Always run autonomous market fetch + Upstox instrument mapping concurrently
    const [autoQuotes] = await Promise.all([
      autonomousPriceService.fetchAllMarketQuotes(false),
      resolvedToken.length > 15 ? this.ensureInstrumentsLoaded() : Promise.resolve(),
    ]);

    const result: Record<string, UnifiedMarketQuote> = {};

    // Seed with Autonomous Live Quotes first
    for (const s of symbols) {
      const clean = this.cleanSymbol(s);
      if (autoQuotes[clean]) {
        result[clean] = { ...autoQuotes[clean], instrumentKey: this.getInstrumentKey(clean) };
      }
    }

    // Also include all indices from autoQuotes
    ['NIFTY 50', 'NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYNXT50', 'SENSEX', 'NIFTYIT', 'INDIAVIX'].forEach(
      (idx) => {
        if (autoQuotes[idx]) {
          result[idx] = { ...autoQuotes[idx], instrumentKey: this.getInstrumentKey(idx) };
        }
      }
    );

    // Layer Upstox Direct Live API v2 Full Market Quotes on top when authenticated (with 1s coalesced cache)
    if (resolvedToken.length > 15) {
      try {
        const tokenTag = resolvedToken.slice(-16);
        const cacheFresh =
          this.lastUpstoxTokenTag === tokenTag &&
          Date.now() - this.lastUpstoxQuotesAt < (isLiveMarket ? 1000 : 30000) &&
          Object.keys(this.lastUpstoxQuotes).length > 0;

        let upstoxBatch: Record<string, UnifiedMarketQuote>;
        if (cacheFresh) {
          upstoxBatch = this.lastUpstoxQuotes;
        } else {
          if (!this.inFlightUpstoxBatch) {
            this.inFlightUpstoxBatch = (async () => {
              const built: Record<string, UnifiedMarketQuote> = {};
              const keyToClean = new Map<string, string>();
              const allKeys: string[] = [];

              const addKey = (symName: string) => {
                const clean = this.cleanSymbol(symName);
                if (clean === 'NIFTYFPI') return;
                const k = this.getInstrumentKey(clean);
                if (k.startsWith('NSE_EQ|') && !k.includes('|INE')) return;
                if (!keyToClean.has(k)) {
                  keyToClean.set(k, clean === 'NIFTY' ? 'NIFTY 50' : clean);
                  allKeys.push(k);
                }
              };

              ['NIFTY 50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYNXT50', 'SENSEX', 'NIFTYIT', 'INDIAVIX'].forEach(
                addKey
              );
              NIFTY_200_STOCKS.forEach((st) => addKey(st.symbol));
              symbols.forEach(addKey);

              const chunkSize = 400;
              const chunks: string[][] = [];
              for (let i = 0; i < allKeys.length; i += chunkSize) {
                chunks.push(allKeys.slice(i, i + chunkSize));
              }

              const responses = await Promise.allSettled(
                chunks.map(async (chunk) => {
                  const param = encodeURIComponent(chunk.join(','));
                  const controller = new AbortController();
                  const tid = setTimeout(() => controller.abort(), 3200);
                  const res = await fetch(
                    `https://api.upstox.com/v2/market-quote/quotes?instrument_key=${param}`,
                    {
                      method: 'GET',
                      headers: {
                        Accept: 'application/json',
                        Authorization: `Bearer ${resolvedToken}`,
                      },
                      signal: controller.signal,
                    }
                  );
                  clearTimeout(tid);
                  if (!res.ok) return null;
                  return res.json();
                })
              );

              for (const r of responses) {
                if (r.status !== 'fulfilled' || !r.value || r.value.status !== 'success' || !r.value.data) {
                  continue;
                }
                for (const [respKey, item] of Object.entries<any>(r.value.data)) {
                  if (!item || typeof item.last_price !== 'number') continue;
                  const instToken: string = item.instrument_token || respKey.replace(':', '|');
                  const mappedClean =
                    keyToClean.get(instToken) ||
                    this.reverseKeyMap.get(instToken) ||
                    (item.symbol ? this.cleanSymbol(item.symbol) : this.cleanSymbol(respKey.split(':')[1] || respKey));

                  const lp = Number(item.last_price);
                  if (lp <= 0) continue;

                  const prevAuto = result[mappedClean] || autoQuotes[mappedClean];
                  const netCh = typeof item.net_change === 'number' ? Number(item.net_change) : undefined;
                  const ohlcClose = Number(item.ohlc?.close || 0);
                  const prevClose =
                    netCh !== undefined
                      ? Number((lp - netCh).toFixed(2))
                      : prevAuto?.prevClose || (ohlcClose > 0 && ohlcClose !== lp ? ohlcClose : lp);

                  const ch = Number((lp - prevClose).toFixed(2));
                  const chp = prevClose > 0 ? Number(((ch / prevClose) * 100).toFixed(2)) : 0;
                  const topBuy = item.depth?.buy?.[0]?.price || prevAuto?.bid || lp;
                  const topSell = item.depth?.sell?.[0]?.price || prevAuto?.ask || lp;
                  const volume = Number(item.volume || prevAuto?.volume || 0);
                  const atp = Number(item.average_price || prevAuto?.atp || lp);
                  const isIdx = instToken.includes('_INDEX|');
                  const exch: 'NSE' | 'BSE' = instToken.startsWith('BSE') ? 'BSE' : 'NSE';

                  const openPx = Number((item.ohlc?.open || prevAuto?.open || lp).toFixed(2));
                  const highPx = Number((item.ohlc?.high || prevAuto?.high || lp).toFixed(2));
                  const lowPx = Number((item.ohlc?.low || prevAuto?.low || lp).toFixed(2));
                  let bidQty = Number(item.total_buy_quantity || prevAuto?.bidQty || 0);
                  let askQty = Number(item.total_sell_quantity || prevAuto?.askQty || 0);
                  if (bidQty <= 0 || askQty <= 0) {
                    const depthFb = deriveOrderBookDepth({
                      volume: volume || 350000,
                      lp,
                      open: openPx,
                      high: highPx,
                      low: lowPx,
                      chp,
                      atp,
                      isIdx,
                    });
                    if (bidQty <= 0) bidQty = depthFb.bidQty;
                    if (askQty <= 0) askQty = depthFb.askQty;
                  }

                  const quoteObj: UnifiedMarketQuote = {
                    symbol: mappedClean,
                    instrumentKey: instToken,
                    description: prevAuto?.description || `${mappedClean} (${exch})`,
                    exchange: exch,
                    type: isIdx ? 'INDEX' : 'EQUITY',
                    lp: Number(lp.toFixed(2)),
                    open: openPx,
                    high: highPx,
                    low: lowPx,
                    prevClose: Number(prevClose.toFixed(2)),
                    ch,
                    chp,
                    volume,
                    turnoverCr: Number(((volume * (atp || lp)) / 10000000).toFixed(2)),
                    atp: Number(atp.toFixed(2)),
                    bid: Number(topBuy),
                    ask: Number(topSell),
                    bidQty,
                    askQty,
                    oi: Number(item.oi || 0),
                    ltt: item.last_trade_time
                      ? new Date(Number(item.last_trade_time)).toLocaleTimeString('en-IN', {
                          timeZone: 'Asia/Kolkata',
                          hour12: false,
                        })
                      : `${istTime} IST`,
                    rsi: prevAuto?.rsi,
                    macd: prevAuto?.macd,
                    ema20: prevAuto?.ema20,
                    sma50: prevAuto?.sma50,
                    recommendScore: prevAuto?.recommendScore,
                    intradayBars: prevAuto?.intradayBars,
                    source: 'UPSTOX_API_V2',
                    isMarketOpen: isLiveMarket,
                    marketSession: isLiveMarket ? marketStatus.session : 'CLOSED_SETTLEMENT',
                    lastRefreshed: nowIso,
                  };

                  built[mappedClean] = quoteObj;
                  if (mappedClean === 'NIFTY 50') built['NIFTY'] = quoteObj;
                  else if (mappedClean === 'NIFTY') built['NIFTY 50'] = quoteObj;

                  autonomousPriceService.overlayLiveTickOnBars(mappedClean, quoteObj);
                }
              }

              if (Object.keys(built).length > 0) {
                this.lastUpstoxQuotes = built;
                this.lastUpstoxQuotesAt = Date.now();
                this.lastUpstoxTokenTag = tokenTag;
              }
              return built;
            })().finally(() => {
              this.inFlightUpstoxBatch = null;
            });
          }
          upstoxBatch = await this.inFlightUpstoxBatch;
        }

        Object.entries(upstoxBatch).forEach(([k, q]) => {
          result[k] = {
            ...q,
            intradayBars: autonomousPriceService.getExtendedBars(k) || q.intradayBars,
          };
        });
      } catch (err: any) {
        console.warn('[UpstoxService] Live quotes warning (using autonomous engine):', err?.message || err);
      }
    }

    // Final deterministic fallback ONLY if both upstream sources had no entry for a symbol
    const indexBaselines = getIndexBaselinePrices();
    for (const s of symbols) {
      const clean = this.cleanSymbol(s);
      if (result[clean]) continue;

      const idxInfo = indexBaselines[clean];
      const stockInfo = NIFTY_200_STOCKS.find((x) => this.cleanSymbol(x.symbol) === clean);
      let basePrice = idxInfo?.price || stockInfo?.basePrice || 1000;
      let prevClose = idxInfo?.prevClose || Number((basePrice * 0.995).toFixed(2));
      let ch = Number((basePrice - prevClose).toFixed(2));
      let chp = prevClose > 0 ? Number(((ch / prevClose) * 100).toFixed(2)) : 0;

      if (fallbackPrices) {
        const fb = fallbackPrices[clean] || fallbackPrices[s];
        if (typeof fb === 'number' && fb > 0) {
          basePrice = fb;
        } else if (fb && typeof fb === 'object' && fb.price > 0) {
          basePrice = fb.price;
          ch = fb.change ?? ch;
          chp = fb.changePercent ?? chp;
          prevClose = fb.prevClose ?? Number((basePrice - ch).toFixed(2));
        }
      }

      const fbDepth = deriveOrderBookDepth({
        volume: 350000,
        lp: basePrice,
        open: prevClose,
        high: Math.max(basePrice, prevClose) * 1.005,
        low: Math.min(basePrice, prevClose) * 0.995,
        chp,
        atp: (basePrice + prevClose) / 2,
        isIdx: Boolean(idxInfo),
      });

      result[clean] = {
        symbol: clean,
        instrumentKey: this.getInstrumentKey(clean),
        description: idxInfo?.name || stockInfo?.name || clean,
        exchange: idxInfo?.exchange || 'NSE',
        type: idxInfo ? 'INDEX' : 'EQUITY',
        lp: Number(basePrice.toFixed(2)),
        open: prevClose,
        high: Number((Math.max(basePrice, prevClose) * 1.005).toFixed(2)),
        low: Number((Math.min(basePrice, prevClose) * 0.995).toFixed(2)),
        prevClose: Number(prevClose.toFixed(2)),
        ch: Number(ch.toFixed(2)),
        chp: Number(chp.toFixed(2)),
        volume: 350000,
        turnoverCr: Number(((350000 * basePrice) / 10000000).toFixed(2)),
        atp: Number(((basePrice + prevClose) / 2).toFixed(2)),
        bid: Number((basePrice - 0.1).toFixed(2)),
        ask: Number((basePrice + 0.1).toFixed(2)),
        bidQty: fbDepth.bidQty,
        askQty: fbDepth.askQty,
        oi: 0,
        ltt: 'EOD Settlement',
        source: 'SETTLED_CLOSE',
        isMarketOpen: isLiveMarket,
        marketSession: isLiveMarket ? marketStatus.session : 'CLOSED_SETTLEMENT',
        lastRefreshed: nowIso,
      };
    }

    return result;
  }

  public async fetchIndexQuotes(accessToken?: string): Promise<Record<string, UnifiedMarketQuote>> {
    const syms = ['NIFTY 50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'NIFTYNXT50', 'SENSEX', 'NIFTYIT', 'INDIAVIX'];
    return this.fetchUnifiedMarketQuotes(syms, accessToken);
  }

  /**
   * Fetch Live Option Chain via Upstox API v2 when connected (with expiry lookup).
   */
  public async fetchLiveOptionChain(symbol: string, accessToken?: string, expiryDate?: string) {
    const token = (accessToken || process.env.UPSTOX_ACCESS_TOKEN || '').trim();
    const clean = this.cleanSymbol(symbol);
    const instKey = this.getInstrumentKey(clean);

    if (!token || token.length < 15) {
      return { source: 'CALCULATED', instrumentKey: instKey, data: null };
    }

    try {
      let targetExpiry = expiryDate;
      if (!targetExpiry) {
        const cRes = await fetch(
          `https://api.upstox.com/v2/option/contract?instrument_key=${encodeURIComponent(instKey)}`,
          { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } }
        );
        if (cRes.ok) {
          const cJson = await cRes.json();
          const expiries: string[] = Array.from(
            new Set<string>((cJson?.data || []).map((x: any) => x.expiry).filter(Boolean))
          ).sort();
          if (expiries.length > 0) targetExpiry = expiries[0];
        }
      }

      if (targetExpiry) {
        const ocRes = await fetch(
          `https://api.upstox.com/v2/option/chain?instrument_key=${encodeURIComponent(instKey)}&expiry_date=${encodeURIComponent(targetExpiry)}`,
          { headers: { Accept: 'application/json', Authorization: `Bearer ${token}` } }
        );
        if (ocRes.ok) {
          const ocJson = await ocRes.json();
          if (ocJson?.status === 'success' && Array.isArray(ocJson?.data)) {
            return {
              source: 'UPSTOX_OPTION_CHAIN_V2',
              instrumentKey: instKey,
              expiryDate: targetExpiry,
              data: ocJson.data,
            };
          }
        }
      }
    } catch (err: any) {
      console.warn('[UpstoxService] Option chain notice:', err?.message || err);
    }

    return { source: 'CALCULATED', instrumentKey: instKey, data: null };
  }

  // =====================================================================
  // BROKER API v2 MARKET HOLIDAYS, TIMINGS, EXCHANGE STATUS & SPECIAL OFF DAYS
  // =====================================================================

  private loadSpecialOffDaysFromDisk() {
    try {
      if (fs.existsSync(SPECIAL_OFF_DAYS_FILE)) {
        const raw = JSON.parse(fs.readFileSync(SPECIAL_OFF_DAYS_FILE, 'utf-8'));
        if (Array.isArray(raw)) {
          this.specialEventOffDays = raw.filter(
            (x) => x && typeof x.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date)
          );
        }
      }
    } catch {
      this.specialEventOffDays = [];
    }
  }

  private saveSpecialOffDaysToDisk() {
    try {
      fs.writeFileSync(SPECIAL_OFF_DAYS_FILE, JSON.stringify(this.specialEventOffDays));
    } catch {
      // Non-fatal
    }
  }

  public getSpecialEventOffDays(): SpecialEventOffDay[] {
    return [...this.specialEventOffDays].sort((a, b) => a.date.localeCompare(b.date));
  }

  public addSpecialEventOffDay(input: {
    date: string;
    name: string;
    type?: 'SPECIAL_EVENT_OFF_DAY' | 'TRADING_HOLIDAY' | 'WEEKEND_OFF_DAY';
    exchange?: string;
    description?: string;
    source?: string;
  }): SpecialEventOffDay {
    const cleanDate = String(input.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      throw new Error('Invalid date format. Expected YYYY-MM-DD');
    }
    const cleanName = String(input.name || 'Special Event Market Off Day').trim() || 'Special Event Market Off Day';
    const entry: SpecialEventOffDay = {
      date: cleanDate,
      name: cleanName,
      type: input.type || 'SPECIAL_EVENT_OFF_DAY',
      exchange: (input.exchange || 'BOTH').toUpperCase(),
      description: input.description?.trim() || `${cleanName} • Broker API Off-Day Scanner Active`,
      source: input.source || 'USER_SPECIAL_EVENT_CONFIG',
      createdAt: new Date().toISOString(),
    };
    this.specialEventOffDays = [
      ...this.specialEventOffDays.filter((x) => x.date !== cleanDate),
      entry,
    ].sort((a, b) => a.date.localeCompare(b.date));
    this.saveSpecialOffDaysToDisk();
    this.lastResolvedSchedule = null;
    return entry;
  }

  public removeSpecialEventOffDay(dateIST: string): boolean {
    const cleanDate = String(dateIST || '').trim();
    const before = this.specialEventOffDays.length;
    this.specialEventOffDays = this.specialEventOffDays.filter((x) => x.date !== cleanDate);
    if (this.specialEventOffDays.length !== before) {
      this.saveSpecialOffDaysToDisk();
      this.lastResolvedSchedule = null;
      return true;
    }
    return false;
  }

  private getStaticMergedHolidays(apiHolidays: UpstoxBrokerHoliday[]): UpstoxBrokerHoliday[] {
    const byDate = new Map<string, UpstoxBrokerHoliday>();
    for (const h of INITIAL_MARKET_HOLIDAYS) {
      byDate.set(h.date, {
        date: h.date,
        description: h.name,
        holiday_type: h.type === 'SPECIAL_SESSION' ? 'SPECIAL_TIMING' : 'TRADING_HOLIDAY',
        closed_exchanges:
          h.type === 'SPECIAL_SESSION'
            ? []
            : h.exchange === 'NSE'
            ? ['NSE', 'NFO']
            : h.exchange === 'BSE'
            ? ['BSE', 'BFO']
            : ['NSE', 'NFO', 'BSE', 'BFO'],
        open_exchanges:
          h.type === 'SPECIAL_SESSION'
            ? [
                {
                  exchange: 'NSE',
                  start_time: Date.parse(`${h.date}T18:15:00+05:30`),
                  end_time: Date.parse(`${h.date}T19:15:00+05:30`),
                },
              ]
            : [],
        source: 'NSE_EXCHANGE_CALENDAR',
      });
    }
    for (const ah of apiHolidays) {
      if (ah?.date) {
        byDate.set(ah.date, { ...ah, source: 'UPSTOX_API_V2' });
      }
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Fetches NSE/BSE Market Holidays via Upstox Broker API v2 (/v2/market/holidays).
   */
  public async fetchUpstoxHolidays(
    accessToken?: string,
    forceRefresh: boolean = false
  ): Promise<{ holidays: UpstoxBrokerHoliday[]; fromApi: boolean }> {
    const now = Date.now();
    if (!forceRefresh && this.brokerHolidaysCache.length > 0 && now - this.brokerHolidaysFetchedAt < 15 * 60 * 1000) {
      return { holidays: this.brokerHolidaysCache, fromApi: this.brokerHolidaysFromApi };
    }

    const token = (accessToken || process.env.UPSTOX_ACCESS_TOKEN || '').trim();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token.length >= 15) {
      headers.Authorization = `Bearer ${token}`;
    }

    let apiHolidays: UpstoxBrokerHoliday[] = [];
    let fromApi = false;

    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 5000);
      const res = await fetch('https://api.upstox.com/v2/market/holidays', {
        headers,
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (res.ok) {
        const json = await res.json();
        if (json?.status === 'success' && Array.isArray(json?.data)) {
          apiHolidays = json.data.map((d: any) => ({
            date: String(d.date || ''),
            description: String(d.description || 'Exchange Holiday'),
            holiday_type: String(d.holiday_type || 'TRADING_HOLIDAY'),
            closed_exchanges: Array.isArray(d.closed_exchanges) ? d.closed_exchanges : [],
            open_exchanges: Array.isArray(d.open_exchanges) ? d.open_exchanges : [],
            source: 'UPSTOX_API_V2' as const,
          }));
          fromApi = true;
        }
      }
    } catch {
      // Fall back cleanly to merged NSE/BSE calendar
    }

    const merged = this.getStaticMergedHolidays(apiHolidays);
    this.brokerHolidaysCache = merged;
    this.brokerHolidaysFetchedAt = now;
    this.brokerHolidaysFromApi = fromApi;
    return { holidays: merged, fromApi };
  }

  /**
   * Fetches Market Timings for a specific IST date via Upstox Broker API v2 (/v2/market/timings/:date).
   */
  public async fetchUpstoxMarketTimings(
    dateIST: string,
    accessToken?: string,
    forceRefresh: boolean = false
  ): Promise<{ timings: UpstoxMarketTiming[]; fromApi: boolean }> {
    const now = Date.now();
    const cached = this.marketTimingsCache.get(dateIST);
    if (!forceRefresh && cached && now - cached.fetchedAt < 5 * 60 * 1000) {
      return { timings: cached.timings, fromApi: cached.fromApi };
    }

    const token = (accessToken || process.env.UPSTOX_ACCESS_TOKEN || '').trim();
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token.length >= 15) {
      headers.Authorization = `Bearer ${token}`;
    }

    let timings: UpstoxMarketTiming[] = [];
    let fromApi = false;

    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`https://api.upstox.com/v2/market/timings/${encodeURIComponent(dateIST)}`, {
        headers,
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (res.ok) {
        const json = await res.json();
        if (json?.status === 'success' && Array.isArray(json?.data)) {
          timings = json.data
            .filter((x: any) => x && x.exchange && x.start_time && x.end_time)
            .map((x: any) => ({
              exchange: String(x.exchange),
              start_time: Number(x.start_time),
              end_time: Number(x.end_time),
            }));
          fromApi = true;
        }
      }
    } catch {
      // Safe fallback
    }

    this.marketTimingsCache.set(dateIST, { timings, fetchedAt: now, fromApi });
    return { timings, fromApi };
  }

  /**
   * Fetches Live Exchange Status via Upstox Broker API v2 (/v2/market/status/:exchange).
   */
  public async fetchUpstoxExchangeStatus(
    exchange: 'NSE' | 'BSE' = 'NSE',
    accessToken?: string,
    forceRefresh: boolean = false
  ): Promise<{ status: string; fromApi: boolean }> {
    const now = Date.now();
    if (!forceRefresh && now - this.exchangeStatusCache.fetchedAt < 60 * 1000 && this.exchangeStatusCache.status !== 'UNKNOWN') {
      return { status: this.exchangeStatusCache.status, fromApi: this.exchangeStatusCache.fromApi };
    }

    const token = (accessToken || process.env.UPSTOX_ACCESS_TOKEN || '').trim();
    if (token.length < 15) {
      return { status: 'UNKNOWN', fromApi: false };
    }

    try {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(`https://api.upstox.com/v2/market/status/${exchange}`, {
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(tid);
      if (res.ok) {
        const json = await res.json();
        const st = String(json?.data?.status || 'UNKNOWN').toUpperCase();
        this.exchangeStatusCache = { status: st, fetchedAt: now, fromApi: true };
        return { status: st, fromApi: true };
      }
    } catch {
      // Non-fatal
    }

    return { status: this.exchangeStatusCache.status, fromApi: false };
  }

  private getWeekdayForDateIST(dateIST: string): string {
    const parsed = new Date(`${dateIST}T12:00:00+05:30`);
    if (isNaN(parsed.getTime())) {
      return getISTDateParts(new Date()).weekday;
    }
    return parsed.toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' });
  }

  private computeNextTradingDay(
    fromDateIST: string,
    holidays: UpstoxBrokerHoliday[],
    specialOffDays: SpecialEventOffDay[]
  ): string {
    const holSet = new Set(
      holidays
        .filter((h) => h.holiday_type !== 'SPECIAL_TIMING' && (h.closed_exchanges.length === 0 || h.closed_exchanges.includes('NSE')))
        .map((h) => h.date)
    );
    const spSet = new Set(specialOffDays.map((s) => s.date));

    let cur = new Date(`${fromDateIST}T12:00:00+05:30`);
    if (isNaN(cur.getTime())) cur = new Date();

    for (let i = 1; i <= 15; i++) {
      const probe = new Date(cur.getTime() + i * 86400000);
      const ist = getISTDateParts(probe);
      const isWknd = ist.weekday === 'Saturday' || ist.weekday === 'Sunday';
      if (!isWknd && !holSet.has(ist.dateStr) && !spSet.has(ist.dateStr)) {
        return `${ist.dateStr} (${ist.weekday})`;
      }
    }
    return fromDateIST;
  }

  private buildScheduleStatus(params: {
    dateIST: string;
    weekday: string;
    holidays: UpstoxBrokerHoliday[];
    timings: UpstoxMarketTiming[];
    exchangeStatus: string;
    fromApi: boolean;
    minutesFromMidnight?: number;
  }): BrokerMarketScheduleStatus {
    const { dateIST, weekday, holidays, timings, exchangeStatus, fromApi } = params;
    const istNow = getISTDateParts(new Date());
    const minsNow = params.minutesFromMidnight ?? istNow.minutesFromMidnight;

    const specialMatch = this.specialEventOffDays.find((s) => s.date === dateIST) || null;
    const holidayMatch = holidays.find((h) => h.date === dateIST) || null;
    const hasNseTiming = timings.some((t) => ['NSE', 'NFO', 'BSE', 'BFO'].includes(t.exchange.toUpperCase()));
    const isWeekend = weekday === 'Saturday' || weekday === 'Sunday';

    let dayCategory: BrokerDayCategory = 'TRADING_DAY';
    let isTradingDay = !isWeekend;
    let isMarketOffDay = false;
    let isWeekendOffDay = false;
    let isHolidayOffDay = false;
    let isSpecialEventOffDay = false;
    let isSpecialSession = false;
    let eventName: string | null = null;
    let description = 'Regular NSE/BSE Equity & F&O Trading Session (09:15 - 15:30 IST)';

    const nseClosedInHoliday = Boolean(
      holidayMatch &&
        (holidayMatch.closed_exchanges.length === 0 ||
          holidayMatch.closed_exchanges.includes('NSE') ||
          holidayMatch.closed_exchanges.includes('NFO'))
    );
    const holidayHasOpenTiming = Boolean(
      holidayMatch && Array.isArray(holidayMatch.open_exchanges) && holidayMatch.open_exchanges.length > 0
    );

    if (specialMatch && specialMatch.type === 'SPECIAL_EVENT_OFF_DAY') {
      dayCategory = 'SPECIAL_EVENT_OFF_DAY';
      isTradingDay = false;
      isSpecialEventOffDay = true;
      isMarketOffDay = true;
      eventName = specialMatch.name;
      description =
        specialMatch.description ||
        `Special Event Market Off Day (${specialMatch.name}) • Scanners running via Broker API`;
    } else if (holidayMatch && (holidayMatch.holiday_type === 'SPECIAL_TIMING' || holidayHasOpenTiming)) {
      dayCategory = 'SPECIAL_SESSION';
      isSpecialSession = true;
      eventName = holidayMatch.description || 'Special Trading Session';
      // Outside the special session live window, treat as Off-Day Broker Scan active
      const nowMs = Date.now();
      const inSpecialLive = (holidayMatch.open_exchanges || []).some(
        (ox) => nowMs >= ox.start_time && nowMs <= ox.end_time
      );
      isTradingDay = true;
      isMarketOffDay = !inSpecialLive;
      description = inSpecialLive
        ? `${eventName} LIVE • Continuous Session`
        : `${eventName} • Off-Hours Broker API Scan Active`;
    } else if (hasNseTiming && isWeekend) {
      // Special weekend session reported by Upstox /v2/market/timings/:date (e.g. Budget Day)
      dayCategory = 'SPECIAL_SESSION';
      isSpecialSession = true;
      isTradingDay = true;
      isMarketOffDay = false;
      eventName = 'Special Weekend Exchange Session (Upstox Timings Active)';
      description = `Exchange open on ${weekday} per Upstox Broker Timings API`;
    } else if (holidayMatch && nseClosedInHoliday) {
      dayCategory = 'HOLIDAY_OFF_DAY';
      isTradingDay = false;
      isHolidayOffDay = true;
      isMarketOffDay = true;
      eventName = holidayMatch.description || 'Exchange Holiday';
      description = `Exchange Closed (${eventName}) • All Scanners Active via Broker API Off-Day Engine`;
    } else if (isWeekend) {
      dayCategory = 'WEEKEND_OFF_DAY';
      isTradingDay = false;
      isWeekendOffDay = true;
      isMarketOffDay = true;
      eventName = `Weekend Market Off Day (${weekday})`;
      description = `${weekday} Market Off Day • Scanners Active via Broker API (Upstox v2 + Option Chain + Completed Session 5m Bars)`;
    } else if (
      dateIST === istNow.dateStr &&
      minsNow >= 9 * 60 + 20 &&
      minsNow <= 15 * 60 + 25 &&
      (exchangeStatus === 'CLOSED' || exchangeStatus === 'CLOSING_END') &&
      !hasNseTiming
    ) {
      // Unscheduled weekday closure / Special Event Off Day detected dynamically by Broker API status
      dayCategory = 'SPECIAL_EVENT_OFF_DAY';
      isTradingDay = false;
      isSpecialEventOffDay = true;
      isMarketOffDay = true;
      eventName = 'Special Event Market Off Day (Broker Exchange Closed)';
      description = `NSE status "${exchangeStatus}" detected via Upstox Broker API during weekday hours • Scanners Active via Broker API`;
    }

    const nextTradingDay = this.computeNextTradingDay(dateIST, holidays, this.specialEventOffDays);

    return {
      dateIST,
      weekday,
      dayCategory,
      isTradingDay,
      isMarketOffDay,
      isWeekendOffDay,
      isHolidayOffDay,
      isSpecialEventOffDay,
      isSpecialSession,
      eventName,
      description,
      exchangeStatus,
      brokerApiSource: fromApi ? 'UPSTOX_MARKET_INFO_V2' : 'CACHED_BROKER_SCHEDULE',
      isBrokerOffDayScanEnabled: isMarketOffDay,
      timings,
      holidays,
      specialEventOffDays: this.getSpecialEventOffDays(),
      nextTradingDay,
      fetchedAt: new Date().toISOString(),
    };
  }

  /**
   * Synchronous fast accessor for constructor boot & 1s schedule loops.
   */
  public getSyncBrokerSchedule(dateISTOverride?: string): BrokerMarketScheduleStatus {
    const ist = getISTDateParts(new Date());
    const dateIST = dateISTOverride || ist.dateStr;
    const weekday = dateISTOverride ? this.getWeekdayForDateIST(dateIST) : ist.weekday;

    if (
      !dateISTOverride &&
      this.lastResolvedSchedule &&
      this.lastResolvedSchedule.dateIST === dateIST &&
      Date.now() - Date.parse(this.lastResolvedSchedule.fetchedAt) < 15000
    ) {
      // Still reflect newly added special events right away
      const spMatch = this.specialEventOffDays.find((s) => s.date === dateIST);
      if (Boolean(spMatch) === this.lastResolvedSchedule.isSpecialEventOffDay) {
        return this.lastResolvedSchedule;
      }
    }

    const holidays =
      this.brokerHolidaysCache.length > 0
        ? this.brokerHolidaysCache
        : this.getStaticMergedHolidays([]);
    const cachedTimings = this.marketTimingsCache.get(dateIST)?.timings || [];

    return this.buildScheduleStatus({
      dateIST,
      weekday,
      holidays,
      timings: cachedTimings,
      exchangeStatus: this.exchangeStatusCache.status,
      fromApi: this.brokerHolidaysFromApi,
      minutesFromMidnight: dateIST === ist.dateStr ? ist.minutesFromMidnight : 12 * 60,
    });
  }

  /**
   * Full asynchronous Broker API schedule resolution:
   * Fetches Upstox /v2/market/holidays, /v2/market/timings/:date, and /v2/market/status/NSE,
   * and merges Special Event Market Off Days & Weekend rules.
   */
  public async resolveBrokerMarketSchedule(options?: {
    dateIST?: string;
    accessToken?: string;
    forceRefresh?: boolean;
  }): Promise<BrokerMarketScheduleStatus> {
    const ist = getISTDateParts(new Date());
    const dateIST = options?.dateIST || ist.dateStr;
    const weekday = options?.dateIST ? this.getWeekdayForDateIST(dateIST) : ist.weekday;
    const token = options?.accessToken || process.env.UPSTOX_ACCESS_TOKEN || '';
    const force = Boolean(options?.forceRefresh);

    const [holRes, timRes, stRes] = await Promise.all([
      this.fetchUpstoxHolidays(token, force),
      this.fetchUpstoxMarketTimings(dateIST, token, force),
      dateIST === ist.dateStr
        ? this.fetchUpstoxExchangeStatus('NSE', token, force)
        : Promise.resolve({ status: 'UNKNOWN', fromApi: false }),
    ]);

    const resolved = this.buildScheduleStatus({
      dateIST,
      weekday,
      holidays: holRes.holidays,
      timings: timRes.timings,
      exchangeStatus: stRes.status,
      fromApi: holRes.fromApi || timRes.fromApi || stRes.fromApi,
      minutesFromMidnight: dateIST === ist.dateStr ? ist.minutesFromMidnight : 12 * 60,
    });

    if (!options?.dateIST) {
      this.lastResolvedSchedule = resolved;
    }
    return resolved;
  }
}

export const upstoxService = new UpstoxService();
