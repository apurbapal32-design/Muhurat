import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApexAlphaReport,
  computeAtr14,
  computeEmaSeries,
  computeRsi14,
  deriveNiftyRegime,
  evaluateApexAlphaSetup,
} from './apexAlphaEngine';
import type { ClaudeFnoBar } from './claudeFnoEngine';
import type { ScannedStock } from '../src/types';

function makeBar(dateIST: string, timeIST: string, open: number, high: number, low: number, close: number, volume: number): ClaudeFnoBar {
  const [h, m, s] = timeIST.split(':').map(Number);
  return {
    dateIST,
    timeIST,
    secIST: h * 3600 + m * 60 + (s || 0),
    open,
    high,
    low,
    close,
    volume,
  };
}

function buildCoilBreakoutBars(): ClaudeFnoBar[] {
  const bars: ClaudeFnoBar[] = [];
  // Previous session: steady uptrend from 980 -> 1000 so EMA9 > EMA21 > EMA50 & RVOL baseline ~ 10,000/bar
  for (let i = 0; i < 45; i++) {
    const min = 9 * 60 + 15 + i * 5;
    const hh = String(Math.floor(min / 60)).padStart(2, '0');
    const mm = String(min % 60).padStart(2, '0');
    const trend = 980 + (i * 20) / 45;
    const c = trend + (i % 2 === 0 ? 1.8 : -1.5);
    bars.push(makeBar('2026-11-16', `${hh}:${mm}:00`, trend - 0.5, trend + 2.2, trend - 2.0, i === 44 ? 1000 : c, 10000));
  }
  // Today opening bars (09:15..09:25): mild +0.6% above prev close ~1000, above VWAP ~1004
  bars.push(makeBar('2026-11-17', '09:15:00', 1001.0, 1005.0, 1000.0, 1004.2, 16000));
  bars.push(makeBar('2026-11-17', '09:20:00', 1004.2, 1007.0, 1002.5, 1003.2, 15000));
  bars.push(makeBar('2026-11-17', '09:25:00', 1003.2, 1006.8, 1002.8, 1006.0, 14000));
  // 6-bar tight compression coil around 1004..1008
  bars.push(makeBar('2026-11-17', '09:30:00', 1006.0, 1008.0, 1004.2, 1004.6, 11000));
  bars.push(makeBar('2026-11-17', '09:35:00', 1004.6, 1007.8, 1004.0, 1006.2, 10500));
  bars.push(makeBar('2026-11-17', '09:40:00', 1006.2, 1008.2, 1004.5, 1004.5, 11000));
  bars.push(makeBar('2026-11-17', '09:45:00', 1004.5, 1007.9, 1004.4, 1006.0, 10500));
  bars.push(makeBar('2026-11-17', '09:50:00', 1006.0, 1008.1, 1004.4, 1004.7, 11000));
  bars.push(makeBar('2026-11-17', '09:55:00', 1004.7, 1007.8, 1004.5, 1005.2, 10500));
  // Trigger candle at 10:00:00: breaks > 1008.2 with >=50% body and >=1.45x spike volume
  bars.push(makeBar('2026-11-17', '10:00:00', 1005.4, 1011.2, 1005.2, 1010.2, 24000));
  return bars;
}

test('computeEmaSeries, computeRsi14, computeAtr14 compute finite positive values', () => {
  const bars = buildCoilBreakoutBars();
  const closes = bars.map((b) => b.close);
  const ema9 = computeEmaSeries(closes, 9);
  const ema50 = computeEmaSeries(closes, 50);
  const rsi = computeRsi14(closes, 14);
  const atr = computeAtr14(bars, 14);
  assert.ok(ema9[ema9.length - 1] > ema50[ema50.length - 1]);
  assert.ok(rsi >= 50 && rsi <= 80);
  assert.ok(atr > 0);
});

test('evaluateApexAlphaSetup qualifies 8/8 VWAP_COIL BUY with 1:1.6 RR & 0.9R trail lock', () => {
  const bars = buildCoilBreakoutBars();
  const niftyRegime = deriveNiftyRegime(
    [
      makeBar('2026-11-16', '15:25:00', 25000, 25020, 24990, 25000, 100000),
      makeBar('2026-11-17', '09:15:00', 25020, 25060, 25010, 25050, 120000),
      makeBar('2026-11-17', '09:20:00', 25050, 25085, 25040, 25080, 110000),
      makeBar('2026-11-17', '10:00:00', 25080, 25110, 25075, 25100, 115000),
    ],
    0.4
  );

  const row = evaluateApexAlphaSetup({
    symbol: 'RELIANCE',
    displayName: 'Reliance Industries',
    sector: 'Energy',
    sectorChangePct: 0.72,
    bars5m: bars,
    price: 1010.2,
    changePercent: 1.02,
    niftyRegime,
    bidAskRatio: 1.42,
    orderBookBias: 'Buyers Dominant',
    oiChangePct: 4.5,
    rawVolume: 130000,
    tradedValueCr: 13.2,
    capital: 100000,
    riskPct: 1.0,
  });

  assert.ok(row !== null);
  assert.equal(row!.side, 'BUY');
  assert.equal(row!.setupType, 'VWAP_COIL');
  assert.equal(row!.score, 8, `Failed conditions: ${JSON.stringify(row!.conditions.filter((c) => !c.passed))}`);
  assert.equal(row!.isQualified, true);
  assert.equal(row!.rrMultiple, 1.6);
  assert.ok(row!.stopLoss < row!.entryPrice);
  assert.ok(row!.targetPrice > row!.trailTriggerPrice);
  assert.ok(row!.trailLockPrice > row!.entryPrice);
  assert.ok(row!.positionSize > 0);
});

test('evaluateApexAlphaSetup rejects strict BUY qualification when NIFTY regime is BEARISH', () => {
  const bars = buildCoilBreakoutBars();
  const bearNifty = {
    niftyChangePct: -0.65,
    niftyBullSoft: false,
    niftyBearStrict: true,
    regimeLabel: 'BEARISH' as const,
  };
  const row = evaluateApexAlphaSetup({
    symbol: 'TCS',
    displayName: 'TCS',
    sector: 'IT',
    sectorChangePct: -0.5,
    bars5m: bars,
    price: 1015.4,
    changePercent: 1.54,
    niftyRegime: bearNifty,
    bidAskRatio: 1.1,
    orderBookBias: 'Balanced',
    oiChangePct: 1.2,
    rawVolume: 130000,
    tradedValueCr: 13.2,
    capital: 100000,
    riskPct: 1.0,
  });

  assert.ok(row !== null);
  assert.equal(row!.isQualified, false);
  assert.ok(row!.score < 8);
});

test('buildApexAlphaReport returns zero rows when isMidnightCleared is true and populates leaderboard', () => {
  const mockStocks: ScannedStock[] = [
    {
      symbol: 'RELIANCE',
      name: 'Reliance',
      sector: 'Energy',
      price: 1015.4,
      prevClose: 1000,
      change: 15.4,
      changePercent: 1.54,
      volume: 130000,
      open: 1001,
      high: 1016,
      low: 1000,
      bidAskRatio: 1.4,
      orderBookBias: 'Buyers Dominant',
      lotSize: 250,
    } as unknown as ScannedStock,
  ];
  const cleared = buildApexAlphaReport({
    stocks: mockStocks,
    getExtendedBarsFn: () => buildCoilBreakoutBars() as any,
    candlesMap: new Map(),
    isMidnightCleared: true,
  });
  assert.equal(cleared.isMidnightCleared, true);
  assert.equal(cleared.qualifiedCount, 0);
  assert.equal(cleared.categories.qualifiedAlpha.length, 0);
  assert.ok(cleared.backtestLeaderboard.length >= 9);
  assert.equal(cleared.backtestLeaderboard[0].isWinner, true);
});

test('evaluateApexAlphaSetup preserves earlier 8/8 VWAP_COIL breakout even when latest forming 5m bar has zero body/partial volume', () => {
  const bars = buildCoilBreakoutBars();
  // Append a flat forming candle at 10:05:00 with open===close and tiny volume
  bars.push(makeBar('2026-11-17', '10:05:00', 1010.2, 1010.5, 1009.9, 1010.2, 400));

  const niftyRegime = deriveNiftyRegime(
    [
      makeBar('2026-11-16', '15:25:00', 25000, 25020, 24990, 25000, 100000),
      makeBar('2026-11-17', '09:15:00', 25020, 25060, 25010, 25050, 120000),
      makeBar('2026-11-17', '09:20:00', 25050, 25085, 25040, 25080, 110000),
      makeBar('2026-11-17', '10:05:00', 25080, 25110, 25075, 25100, 115000),
    ],
    0.4
  );

  const row = evaluateApexAlphaSetup({
    symbol: 'RELIANCE',
    displayName: 'Reliance Industries',
    sector: 'Energy',
    sectorChangePct: 0.72,
    bars5m: bars,
    price: 1010.2,
    changePercent: 1.02,
    niftyRegime,
    bidAskRatio: 1.42,
    orderBookBias: 'Buyers Dominant',
    oiChangePct: 4.5,
    rawVolume: 130400,
    tradedValueCr: 13.2,
    capital: 100000,
    riskPct: 1.0,
  });

  assert.ok(row !== null);
  assert.equal(row!.isQualified, true);
  assert.equal(row!.score, 8);
  assert.equal(row!.listedAt, '10:00:00');
});

test('deriveNiftyRegime prefers accurate live quote chp when prior-day bar diverges and avoids NEUTRAL dead-zone on -0.13% intraday dip', () => {
  const regime = deriveNiftyRegime(
    [
      makeBar('2026-11-17', '15:25:00', 25400, 25410, 25380, 25390, 100000),
      makeBar('2026-11-18', '09:15:00', 25323.15, 25330, 25280, 25290, 120000),
      makeBar('2026-11-18', '09:20:00', 25290, 25295, 25260, 25266.9, 110000),
    ],
    -0.13
  );
  assert.equal(regime.niftyChangePct, -0.13);
  assert.equal(regime.regimeLabel, 'BEARISH');
  assert.equal(regime.niftyBearStrict, true);
});

test('buildApexAlphaReport strictly caps qualified setups to Best 10 UP and Best 10 DOWN', () => {
  const bullBars = buildCoilBreakoutBars();
  const bearBars: ClaudeFnoBar[] = [];
  for (let i = 0; i < 45; i++) {
    const min = 9 * 60 + 15 + i * 5;
    const hh = String(Math.floor(min / 60)).padStart(2, '0');
    const mm = String(min % 60).padStart(2, '0');
    const trend = 1020 - (i * 20) / 45;
    const c = trend + (i % 2 === 0 ? -1.8 : 1.5);
    bearBars.push(makeBar('2026-11-16', `${hh}:${mm}:00`, trend + 0.5, trend + 2.0, trend - 2.2, i === 44 ? 1000 : c, 10000));
  }
  bearBars.push(makeBar('2026-11-17', '09:15:00', 999.0, 1000.0, 995.0, 995.8, 16000));
  bearBars.push(makeBar('2026-11-17', '09:20:00', 995.8, 997.5, 993.0, 996.8, 15000));
  bearBars.push(makeBar('2026-11-17', '09:25:00', 996.8, 997.2, 993.2, 994.0, 14000));
  bearBars.push(makeBar('2026-11-17', '09:30:00', 994.0, 995.8, 992.0, 995.4, 11000));
  bearBars.push(makeBar('2026-11-17', '09:35:00', 995.4, 996.0, 992.2, 993.8, 10500));
  bearBars.push(makeBar('2026-11-17', '09:40:00', 993.8, 995.5, 991.8, 995.5, 11000));
  bearBars.push(makeBar('2026-11-17', '09:45:00', 995.5, 995.6, 992.1, 994.0, 10500));
  bearBars.push(makeBar('2026-11-17', '09:50:00', 994.0, 995.6, 991.9, 995.3, 11000));
  bearBars.push(makeBar('2026-11-17', '09:55:00', 995.3, 995.5, 992.2, 994.8, 10500));
  bearBars.push(makeBar('2026-11-17', '10:00:00', 994.6, 994.8, 988.8, 989.8, 24000));

  // Build 14 bullish stocks in neutral/mild-up NIFTY or test with 14 BUY stocks on NIFTY +0.4%
  const stocks: ScannedStock[] = [];
  const barsBySym = new Map<string, ClaudeFnoBar[]>();
  for (let i = 1; i <= 14; i++) {
    const sym = `BULL${i}`;
    stocks.push({
      symbol: sym,
      name: sym,
      sector: 'Energy',
      price: 1010.2,
      prevClose: 1000,
      change: 10.2,
      changePercent: 1.02 + i * 0.05,
      volume: 130000 + i * 5000,
      open: 1001,
      high: 1011.2,
      low: 1000,
      bidAskRatio: 1.3 + i * 0.02,
      orderBookBias: 'Buyers Dominant',
      oiData: { changeInOIPercent: 4.5 },
      lotSize: 250,
    } as unknown as ScannedStock);
    barsBySym.set(sym, bullBars);
  }

  const report = buildApexAlphaReport({
    stocks,
    getExtendedBarsFn: (sym) => barsBySym.get(sym) as any,
    candlesMap: new Map(),
    indexQuotes: {
      'NIFTY 50': {
        symbol: 'NIFTY 50',
        lp: 25100,
        chp: 0.4,
        intradayBars: [
          makeBar('2026-11-16', '15:25:00', 25000, 25020, 24990, 25000, 100000),
          makeBar('2026-11-17', '09:15:00', 25020, 25060, 25010, 25050, 120000),
          makeBar('2026-11-17', '09:20:00', 25050, 25085, 25040, 25080, 110000),
          makeBar('2026-11-17', '10:00:00', 25080, 25110, 25075, 25100, 115000),
        ] as any,
      } as any,
    },
  });

  assert.equal(report.maxPerDirection, 10);
  assert.equal(report.totalQualifiedUpCount, 14);
  assert.equal(report.categories.qualifiedAlpha.filter((r) => r.side === 'BUY').length, 10);
  assert.equal(report.categories.buySetups.length, 10);
  assert.ok(report.categories.buySetups.every((r) => (r.directionRank || 0) >= 1 && (r.directionRank || 0) <= 10));
});


