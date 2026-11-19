import test from 'node:test';
import assert from 'node:assert/strict';
import {
  compactScannedStock,
  deriveUpstoxPriceChange,
  normalizeMarketOverview,
  normalizeScannedStock,
  normalizeScanResultsPayload,
  parseFiniteNum,
  round2,
} from '../src/utils/quoteNormalizer';
import { safeFetchJson } from '../src/utils/apiClient';
import type { MarketOverview, ScannedStock } from '../src/types';

test('parseFiniteNum and round2 handle numeric strings, commas, float drift, and -0 cleanly', () => {
  assert.equal(parseFiniteNum('2,845.678'), 2845.678);
  assert.equal(parseFiniteNum('  -14.235  '), -14.235);
  assert.equal(parseFiniteNum(''), undefined);
  assert.equal(parseFiniteNum('abc'), undefined);
  assert.equal(parseFiniteNum(Number.NaN), undefined);

  assert.equal(round2(2845.678), 2845.68);
  assert.equal(round2('1,234.554'), 1234.55);
  assert.equal(round2(-0.0001), 0);
  assert.equal(Object.is(round2(-0), 0), true);
  assert.equal(round2(undefined, 99.5), 99.5);
});

test('deriveUpstoxPriceChange parses numeric & string Upstox fields and rounds to 2 decimals', () => {
  const fromNumbers = deriveUpstoxPriceChange({
    lastPrice: 2845.678,
    netChange: 32.145,
    ohlcClose: 2813.53,
  });
  assert.deepEqual(fromNumbers, {
    lp: 2845.68,
    prevClose: 2813.53,
    ch: 32.15,
    chp: 1.14,
  });

  // String payloads + net_change=0 while ohlc.close holds prior session close
  const fromStringsZeroNet = deriveUpstoxPriceChange({
    lastPrice: '1450.256',
    netChange: '0',
    ohlcClose: '1425.104',
  });
  assert.deepEqual(fromStringsZeroNet, {
    lp: 1450.26,
    prevClose: 1425.1,
    ch: 25.16,
    chp: 1.77,
  });

  // Fallback prevClose when both net_change=0 and ohlc.close=0
  const fromFallback = deriveUpstoxPriceChange({
    lastPrice: 510.123,
    netChange: 0,
    ohlcClose: 0,
    fallbackPrevClose: 500.004,
  });
  assert.deepEqual(fromFallback, {
    lp: 510.12,
    prevClose: 500,
    ch: 10.12,
    chp: 2.02,
  });

  assert.equal(deriveUpstoxPriceChange({ lastPrice: 'invalid' }), null);
  assert.equal(deriveUpstoxPriceChange({ lastPrice: 0 }), null);
});

test('normalizeScannedStock and compactScannedStock enforce 2-decimal rounding and recover missing CHG%', () => {
  const rawStock = {
    symbol: 'RELIANCE',
    name: 'Reliance Industries Ltd',
    sector: 'Energy',
    price: 2912.346,
    change: 0,
    changePercent: 0,
    sectorChangePercent: 1.236,
    volume: 1234567.8,
    signal: 'BUY',
    aiScore: 88.456,
    fyersData: {
      symbol: 'RELIANCE',
      fyersSymbol: 'NSE_EQ|INE002A01018',
      description: 'RELIANCE (NSE)',
      exchange: 'NSE',
      type: 'EQUITY',
      lp: 2912.346,
      open: 2875.111,
      high: 2920.999,
      low: 2860.004,
      prevClose: 2870.123,
      ch: 42.223,
      chp: 1.471,
      volume: 1234567.8,
      atp: 2895.444,
      ltt: '15:29:59 IST',
      fyersStatus: 'CLOSED_SETTLEMENT',
      lastRefreshed: '2026-11-18T10:00:00Z',
    },
    indicators: {
      price: 2912.346,
      open: 2875.111,
      high: 2920.999,
      low: 2860.004,
      close: 2912.346,
      volume: 1234567,
      avgVolume20: 900000,
      ema13: 2901.123,
      ema21: 2895.987,
      ema34: 2888.111,
      vwap: 2896.555,
      rsi: 64.444,
      macd: 4.129,
      macdSignal: 3.111,
      macdHist: 1.018,
      adx: 29.888,
      atr: 22.333,
      supertrend: 2870.555,
      bbUpper: 2930.111,
      bbMiddle: 2895.222,
      bbLower: 2860.333,
      rvol: 1.856,
      volumeBreakout: true,
      pdh: 2910.444,
      pdl: 2850.555,
      cprPivot: 2880.111,
      cprBC: 2875.222,
      cprTC: 2885.333,
      pivotR1: 2925.444,
      pivotS1: 2845.555,
      pivotR2: 2950.666,
      pivotS2: 2820.777,
      swingHigh: 2921.111,
      swingLow: 2855.222,
    },
    risk: {
      entryPrice: 2912.346,
      stopLoss: 2885.555,
      target1: 2945.888,
      target2: 2968.111,
      target3: 3001.222,
      riskAmount: 500.129,
      rewardAmountT1: 750.555,
      rewardAmountT2: 1200.666,
      riskRewardRatio: 1.504,
      recommendedQty: 18.7,
      positionValue: 55334.574,
      marginRequired: 11066.915,
    },
    scoreBreakdown: { vwap: 8, emaTrend: 8, rsi: 6, adx: 6, volume: 6, rvol: 6, oiScore: 15, priceAction: 5 },
    lastUpdated: '2026-11-18T10:00:00Z',
    keyTriggers: [],
  } as unknown as ScannedStock;

  const normalized = normalizeScannedStock(rawStock);
  assert.equal(normalized.price, 2912.35);
  // Recovered from fyersData.prevClose (2870.12) because raw change/changePercent were 0
  assert.equal(normalized.change, 42.23);
  assert.equal(normalized.changePercent, 1.47);
  assert.equal(normalized.sectorChangePercent, 1.24);
  assert.equal(normalized.indicators.price, 2912.35);
  assert.equal(normalized.indicators.vwap, 2896.56);
  assert.equal(normalized.risk.stopLoss, 2885.56);
  assert.equal(normalized.fyersData?.lp, 2912.35);
  assert.equal(normalized.fyersData?.ch, 42.22);
  assert.equal(normalized.fyersData?.chp, 1.47);

  const compact = compactScannedStock(rawStock);
  assert.equal(compact.price, 2912.35);
  assert.equal(compact.change, 42.23);
  assert.equal(compact.changePercent, 1.47);
  assert.equal(compact.sectorChangePercent, 1.24);
  assert.equal(compact.indicators?.price, 2912.35);
  assert.equal(compact.risk?.target1, 2945.89);
});

test('normalizeMarketOverview and normalizeScanResultsPayload sanitize full API payloads', () => {
  const overview = normalizeMarketOverview({
    nifty50: { price: 25044.659, change: 58.254, changePercent: 0.234 },
    bankNifty: { price: 59741.251, change: 890.604, changePercent: 1.514 },
    niftyIT: { price: 32468.909, change: -400.754, changePercent: -1.224 },
    indiaVix: { price: 17.426, change: -1.014, changePercent: -5.484, regime: 'HIGH_FEAR' },
    scannedCount: 1,
    buyCount: 1,
    sellCount: 0,
    highRvolCount: 1,
    lastScanTime: '2026-11-18T10:00:00Z',
    marketStatus: 'OPEN',
  } as MarketOverview);

  assert.equal(overview.nifty50.price, 25044.66);
  assert.equal(overview.nifty50.change, 58.25);
  assert.equal(overview.nifty50.changePercent, 0.23);
  assert.equal(overview.niftyIT.change, -400.75);
  assert.equal(overview.indiaVix?.changePercent, -5.48);

  const payload = normalizeScanResultsPayload({
    stocks: [{ symbol: 'TCS', price: '4120.556', change: '-18.444', changePercent: '-0.446' }],
    top10Buy: [],
    top10Sell: [],
    sectorAvgMap: { IT: -0.446 },
    overview,
  });
  assert.ok(payload);
  assert.equal(payload.stocks.length, 1);
  assert.equal(payload.stocks[0].price, 4120.56);
  assert.equal(payload.stocks[0].change, -18.44);
  assert.equal(payload.stocks[0].changePercent, -0.45);
  assert.equal(payload.sectorAvgMap.IT, -0.45);
});

test('safeFetchJson parses valid JSON, handles +json, malformed JSON, 204, non-OK, and aborted signal cleanly', async () => {
  const originalFetch = globalThis.fetch;
  try {
    // 1. Valid JSON + parse transform
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          stocks: [{ symbol: 'INFY', price: 1842.339, change: 12.119, changePercent: 0.664 }],
          top10Buy: [],
          top10Sell: [],
          sectorAvgMap: {},
        }),
        { status: 200, headers: { 'content-type': 'Application/JSON; charset=utf-8' } }
      )) as typeof fetch;

    const valid = await safeFetchJson('/api/scan/results', {
      parse: normalizeScanResultsPayload,
    });
    assert.ok(valid);
    assert.equal(valid.stocks[0].price, 1842.34);
    assert.equal(valid.stocks[0].change, 12.12);
    assert.equal(valid.stocks[0].changePercent, 0.66);

    // 2. Malformed JSON returns null instead of throwing
    globalThis.fetch = (async () =>
      new Response('{invalid-json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    assert.equal(await safeFetchJson('/api/scan/results'), null);

    // 3. HTTP 204 returns null
    globalThis.fetch = (async () => new Response(null, { status: 204 })) as typeof fetch;
    assert.equal(await safeFetchJson('/api/scan/results'), null);

    // 4. Non-JSON HTML returns null
    globalThis.fetch = (async () =>
      new Response('<html>error</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })) as typeof fetch;
    assert.equal(await safeFetchJson('/api/scan/results'), null);

    // 5. Non-OK status returns null
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: 'Server error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch;
    assert.equal(await safeFetchJson('/api/scan/results'), null);

    // 6. Pre-aborted signal returns null immediately
    const ac = new AbortController();
    ac.abort();
    assert.equal(await safeFetchJson('/api/scan/results', { signal: ac.signal }), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
