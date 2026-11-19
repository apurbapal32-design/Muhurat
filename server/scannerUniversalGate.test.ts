import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeFlickerResistantRvolFromBars,
  computeUniversalStrongMetrics,
  normalizeBarsTo5m,
  sortRowsByListedAtDescZtoA,
  StickyScannerRegistry,
  UNIVERSAL_STRONG_ADX_MIN,
  UNIVERSAL_STRONG_RVOL_MIN,
  UNIVERSAL_STRONG_XTIME_VOL_MIN,
} from './scannerUniversalGate';
import { calculateADX, evaluateStockScanner } from '../src/utils/technicalAnalysis';
import { computeBarClvAndDelta } from './muhuratFlowEngine';
import { computeBarDeltaFromBuySell } from './intradayStockEngine';
import type { Candle, ScannedStock } from '../src/types';

function makeTrendingBars(opts: {
  count?: number;
  startPrice?: number;
  step?: number;
  baseVol?: number;
  spikeVol?: number;
  appendTinyPartialBar?: boolean;
}): Candle[] {
  const count = opts.count ?? 22;
  const startPrice = opts.startPrice ?? 100;
  const step = opts.step ?? 1.2;
  const baseVol = opts.baseVol ?? 100_000;
  const spikeVol = opts.spikeVol ?? 320_000;
  const bars: Candle[] = [];
  let px = startPrice;

  for (let i = 0; i < count; i++) {
    const isLate = i >= count - 2;
    const open = px;
    const close = Number((open + step).toFixed(2));
    const high = Number((Math.max(open, close) + Math.abs(step) * 0.35).toFixed(2));
    const low = Number((Math.min(open, close) - Math.abs(step) * 0.15).toFixed(2));
    const hh = 9 + Math.floor((15 + i * 5) / 60);
    const mm = (15 + i * 5) % 60;
    bars.push({
      time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`,
      open,
      high,
      low,
      close,
      volume: isLate ? spikeVol : baseVol,
    });
    px = close;
  }

  if (opts.appendTinyPartialBar) {
    const last = bars[bars.length - 1];
    bars.push({
      time: '11:15:00',
      open: last.close,
      high: Number((last.close + 0.2).toFixed(2)),
      low: Number((last.close - 0.1).toFixed(2)),
      close: Number((last.close + 0.1).toFixed(2)),
      volume: 8_000, // Brand-new 5m bar opened 5 seconds ago!
    });
  }

  return bars;
}

function makeChoppyBars(count = 20, baseVol = 100_000, spikeVol = 280_000): Candle[] {
  const bars: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const up = i % 2 === 0;
    const open = up ? 100 : 100.3;
    const close = up ? 100.3 : 100;
    bars.push({
      time: `10:${String((i * 5) % 60).padStart(2, '0')}:00`,
      open,
      high: 100.5,
      low: 99.8,
      close,
      volume: i >= count - 2 ? spikeVol : baseVol,
    });
  }
  return bars;
}

function makeMockStock(symbol: string, price: number, changePercent: number, rvol: number, xTimeVolume: number, adx: number): ScannedStock {
  return {
    symbol,
    name: symbol,
    sector: 'PSU Banks',
    price,
    change: Number((price * (changePercent / 100)).toFixed(2)),
    changePercent,
    volume: 5_000_000,
    signal: changePercent >= 0 ? 'BUY' : 'SELL',
    aiScore: 86,
    scoreBreakdown: { vwap: 8, emaTrend: 8, rsi: 6, adx: 6, volume: 6, rvol: 6, oiScore: 12, priceAction: 5 },
    indicators: {
      price,
      open: price * 0.99,
      high: price * 1.01,
      low: price * 0.985,
      close: price,
      volume: 5_000_000,
      avgVolume20: 1_500_000,
      ema13: price * 0.99,
      ema21: price * 0.985,
      ema34: price * 0.98,
      vwap: price * 0.992,
      rsi: 64,
      macd: 1.2,
      macdSignal: 0.8,
      macdHist: 0.4,
      adx,
      atr: 2.5,
      supertrend: price * 0.98,
      supertrendDirection: changePercent >= 0 ? 'BUY' : 'SELL',
      bbUpper: price * 1.02,
      bbMiddle: price,
      bbLower: price * 0.98,
      rvol,
      xTimeVolume,
      volumeBreakout: true,
      pdh: price * 0.995,
      pdl: price * 0.97,
      cprPivot: price * 0.985,
      cprBC: price * 0.982,
      cprTC: price * 0.988,
      pivotR1: price * 1.01,
      pivotS1: price * 0.97,
      pivotR2: price * 1.02,
      pivotS2: price * 0.96,
      swingHigh: price * 1.01,
      swingLow: price * 0.975,
    },
    risk: {
      entryPrice: price,
      stopLoss: Number((price * 0.985).toFixed(2)),
      target1: Number((price * 1.02).toFixed(2)),
      target2: Number((price * 1.04).toFixed(2)),
      riskAmount: 1000,
      rewardAmountT1: 2000,
      rewardAmountT2: 4000,
      riskRewardRatio: 2.0,
      recommendedQty: 100,
      positionValue: price * 100,
      marginRequired: price * 20,
    },
    lastUpdated: new Date().toISOString(),
    keyTriggers: [],
  };
}

test('calculateADX never fabricates fake 26 for short choppy candles', () => {
  const shortChop = makeChoppyBars(12);
  const res = calculateADX(shortChop, 14);
  assert.ok(res.adx < 25, `Expected choppy short bars ADX < 25, got ${res.adx}`);

  const emptyRes = calculateADX([], 14);
  assert.equal(emptyRes.adx, 0);
});

test('computeUniversalStrongMetrics enforces RVOL >= 2.00, X-Time Vol >= 2.00X, and ADX >= 25+', () => {
  const strongBars = makeTrendingBars({ count: 24, baseVol: 100_000, spikeVol: 320_000 });
  const strongMetrics = computeUniversalStrongMetrics(strongBars, 2.4);
  assert.ok(strongMetrics.rvol >= UNIVERSAL_STRONG_RVOL_MIN);
  assert.ok(strongMetrics.xTimeVolume >= UNIVERSAL_STRONG_XTIME_VOL_MIN);
  assert.ok(strongMetrics.adx >= UNIVERSAL_STRONG_ADX_MIN);
  assert.equal(strongMetrics.passedAll, true);

  // Weak X-Time volume (< 2.00X) must fail even with strong trend + explicit RVOL >= 2.00
  const lowXTimeBars = makeTrendingBars({ count: 24, baseVol: 100_000, spikeVol: 140_000 });
  const weakXTime = computeUniversalStrongMetrics(lowXTimeBars, 2.3);
  assert.equal(weakXTime.strongXTimeVolPassed, false);
  assert.equal(weakXTime.passedAll, false);

  // Choppy low ADX (< 25) must fail even with huge RVOL & X-Time Volume
  const choppyBars = makeChoppyBars(22, 100_000, 350_000);
  const weakAdx = computeUniversalStrongMetrics(choppyBars, 3.0);
  assert.ok(weakAdx.adx < UNIVERSAL_STRONG_ADX_MIN, `Expected choppy ADX < 25, got ${weakAdx.adx}`);
  assert.equal(weakAdx.adxPassed, false);
  assert.equal(weakAdx.passedAll, false);

  // Weak RVOL (< 2.00) must fail
  const lowRvolBars = makeTrendingBars({ count: 24, baseVol: 100_000, spikeVol: 120_000 });
  const weakRvol = computeUniversalStrongMetrics(lowRvolBars, 1.5, 32, 2.5);
  assert.equal(weakRvol.strongRvolPassed, false);
  assert.equal(weakRvol.passedAll, false);
});

test('computeUniversalStrongMetrics X-Time Volume stays flicker-resistant when new 5m bar opens', () => {
  const barsWithNewPartial = makeTrendingBars({
    count: 24,
    baseVol: 100_000,
    spikeVol: 300_000,
    appendTinyPartialBar: true,
  });
  const m = computeUniversalStrongMetrics(barsWithNewPartial, 2.5);
  assert.ok(
    m.xTimeVolume >= 2.0,
    `Expected flicker-resistant X-Time Vol >= 2.00X on brand-new 5m bar, got ${m.xTimeVolume}`
  );
  assert.equal(m.passedAll, true);
});

test('StickyScannerRegistry rejects ineligible stocks and NEVER kicks out listed stocks on refresh', () => {
  const registry = new StickyScannerRegistry();
  const strongBars = makeTrendingBars({ count: 24, startPrice: 270, step: 0.7, baseVol: 100_000, spikeVol: 320_000 });
  const weakBars = makeChoppyBars(22, 100_000, 110_000);

  const liveMap = new Map<string, ScannedStock>([
    ['BANKBARODA', makeMockStock('BANKBARODA', 280.5, 1.85, 2.6, 3.1, 34)],
    ['WEAKSTOCK', makeMockStock('WEAKSTOCK', 100.2, 0.9, 1.2, 1.1, 14)],
  ]);
  const getBars = (sym: string) => (sym === 'BANKBARODA' ? strongBars : weakBars);

  // Cycle 1: Submit both strong & weak candidates
  const cycle1 = registry.filterAndStabilizeRows({
    scannerKey: 'money-flow:BUY',
    rows: [
      { symbol: 'BANKBARODA', price: 280.5, changePercent: 1.85, entryPrice: 279.0, stopLoss: 274.0, listedAt: '09:30:00', rvol: 2.6 },
      { symbol: 'WEAKSTOCK', price: 100.2, changePercent: 0.9, entryPrice: 100.0, stopLoss: 98.0, listedAt: '09:30:00', rvol: 1.2 },
    ],
    liveStockMap: liveMap,
    getBarsFn: getBars,
    isMidnightCleared: false,
    dateIST: '2026-11-19',
    getSymbol: (r) => r.symbol,
    getSide: () => 'BUY',
  });

  assert.equal(cycle1.length, 1, 'Only strictly eligible stock should appear');
  assert.equal(cycle1[0].symbol, 'BANKBARODA');
  assert.equal((cycle1[0] as any).strongGatePassed, true);

  // Cycle 2 (Scanner Refresh!): Fresh scan temporarily drops BANKBARODA due to minor flicker, live price ticks up to 281.40
  liveMap.set('BANKBARODA', makeMockStock('BANKBARODA', 281.4, 2.18, 1.92, 1.88, 24.2));
  const cycle2 = registry.filterAndStabilizeRows({
    scannerKey: 'money-flow:BUY',
    rows: [], // Simulated refresh flicker where engine momentarily dropped it!
    liveStockMap: liveMap,
    getBarsFn: getBars,
    isMidnightCleared: false,
    dateIST: '2026-11-19',
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'BUY',
  });

  assert.equal(cycle2.length, 1, 'Listed stock MUST NOT be kicked out on scanner refresh!');
  assert.equal(cycle2[0].symbol, 'BANKBARODA');
  assert.equal(cycle2[0].price, 281.4, 'Retained stock must reflect updated live price');
  assert.equal(cycle2[0].listedAt, '09:30:00', 'Original listedAt timestamp must remain locked');
  assert.equal(cycle2[0].entryPrice, 279.0, 'Original entryPrice must remain locked');

  // Cycle 3: Hard Stop Loss breached (price drops <= 274.0) -> cleanly exits
  liveMap.set('BANKBARODA', makeMockStock('BANKBARODA', 273.5, -0.8, 2.1, 2.1, 26));
  const cycle3 = registry.filterAndStabilizeRows({
    scannerKey: 'money-flow:BUY',
    rows: [],
    liveStockMap: liveMap,
    getBarsFn: getBars,
    isMidnightCleared: false,
    dateIST: '2026-11-19',
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'BUY',
  });
  assert.equal(cycle3.length, 0, 'Stock must exit when hard stop-loss is breached');
});

test('StickyScannerRegistry clears completely on midnight flush', () => {
  const registry = new StickyScannerRegistry();
  const strongBars = makeTrendingBars({ count: 24, startPrice: 500, step: 1.4, baseVol: 100_000, spikeVol: 320_000 });
  const liveMap = new Map<string, ScannedStock>([
    ['SBIN', makeMockStock('SBIN', 530, 2.1, 2.8, 3.0, 35)],
  ]);

  const beforeMidnight = registry.filterAndStabilizeRows({
    scannerKey: 'top-momentum:BUY',
    rows: [{ symbol: 'SBIN', price: 530, changePercent: 2.1, entryPrice: 525, stopLoss: 515, rvol: 2.8 }],
    liveStockMap: liveMap,
    getBarsFn: () => strongBars,
    isMidnightCleared: false,
    dateIST: '2026-11-19',
    getSymbol: (r) => r.symbol,
    getSide: () => 'BUY',
  });
  assert.equal(beforeMidnight.length, 1);

  const afterMidnight = registry.filterAndStabilizeRows({
    scannerKey: 'top-momentum:BUY',
    rows: [],
    liveStockMap: liveMap,
    getBarsFn: () => strongBars,
    isMidnightCleared: true,
    dateIST: '2026-11-20',
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'BUY',
  });
  assert.equal(afterMidnight.length, 0);
  assert.equal(registry.getLockedCount('top-momentum:BUY'), 0);
});

test('computeFlickerResistantRvolFromBars prevents single-bar RVOL collapse on tiny closing/forming bar', () => {
  const surgeThenQuiet = makeTrendingBars({
    count: 24,
    startPrice: 500,
    step: -1.1,
    baseVol: 100_000,
    spikeVol: 340_000,
    appendTinyPartialBar: true,
  });
  const normBars = normalizeBarsTo5m(surgeThenQuiet);
  const frRvol = computeFlickerResistantRvolFromBars(normBars, 20);
  assert.ok(frRvol >= 2.0, `Expected flicker-resistant RVOL >= 2.00 after volume surge, got ${frRvol}`);

  // Even without explicitRvol, computeUniversalStrongMetrics passes all 3 gates
  const metrics = computeUniversalStrongMetrics(surgeThenQuiet);
  assert.ok(metrics.rvol >= UNIVERSAL_STRONG_RVOL_MIN, `Expected bar-derived RVOL >= 2.0, got ${metrics.rvol}`);
  assert.ok(metrics.xTimeVolume >= UNIVERSAL_STRONG_XTIME_VOL_MIN);
  assert.ok(metrics.adx >= UNIVERSAL_STRONG_ADX_MIN);
  assert.equal(metrics.passedAll, true);

  // Truly quiet stock (all recent bars <= 1.2x average) MUST still fail
  const quietBars = makeTrendingBars({
    count: 24,
    startPrice: 500,
    step: -1.1,
    baseVol: 100_000,
    spikeVol: 115_000,
  });
  const quietMetrics = computeUniversalStrongMetrics(quietBars);
  assert.ok(quietMetrics.rvol < UNIVERSAL_STRONG_RVOL_MIN, `Expected quiet stock RVOL < 2.0, got ${quietMetrics.rvol}`);
  assert.equal(quietMetrics.passedAll, false);
});

test('evaluateStockScanner emits SELL on strong DOWN stock even on green NIFTY day (and mirror BUY on red NIFTY day)', () => {
  // Strong bearish breakdown: -2.2% below VWAP with surging volume & high ADX
  const downBars = makeTrendingBars({
    count: 28,
    startPrice: 5250,
    step: -4.2,
    baseVol: 120_000,
    spikeVol: 360_000,
    appendTinyPartialBar: true,
  });
  const downStock = evaluateStockScanner(
    'ALKEM',
    'Alkem Laboratories',
    'Pharma',
    downBars,
    5260,
    5120,
    5240,
    0.45, // sector slightly green
    1.14  // NIFTY bullish +1.14%
  );
  assert.equal(downStock.signal, 'SELL', `Strong counter-trend breakdown must emit SELL, got ${downStock.signal} (aiScore=${downStock.aiScore})`);
  assert.ok(downStock.indicators.rvol >= 2.0, `Expected flicker-resistant RVOL >= 2.0, got ${downStock.indicators.rvol}`);
  assert.ok(downStock.indicators.adx >= 25, `Expected ADX >= 25, got ${downStock.indicators.adx}`);

  // Exact symmetric mirror: Strong bullish breakout on red NIFTY day (-1.14%)
  const upBars = makeTrendingBars({
    count: 28,
    startPrice: 1000,
    step: 0.9,
    baseVol: 120_000,
    spikeVol: 360_000,
    appendTinyPartialBar: true,
  });
  const upStock = evaluateStockScanner(
    'BANKBARODA',
    'Bank of Baroda',
    'PSU Banks',
    upBars,
    1005,
    985,
    1002,
    -0.45, // sector slightly red
    -1.14  // NIFTY bearish -1.14%
  );
  assert.equal(upStock.signal, 'BUY', `Strong counter-trend breakout must emit BUY, got ${upStock.signal} (aiScore=${upStock.aiScore})`);
  assert.ok(upStock.indicators.rvol >= 2.0);
  assert.ok(upStock.indicators.adx >= 25);
});

test('sortRowsByListedAtDescZtoA & StickyScannerRegistry sort each category by LISTED AT latest-first + Z-to-A tie-break', () => {
  const unsorted = [
    { symbol: 'ALKEM', listedAt: '12:04:59' },
    { symbol: 'UJJIVANSFB', listedAt: '09:19:59' },
    { symbol: 'INFY', listedAt: '14:30:00' },
    { symbol: 'WIPRO', listedAt: '14:30:00' },
    { symbol: 'DATAPATTNS', listedAt: '14:59:59' },
    { symbol: 'TCS', listedAt: '--' },
  ];
  const sorted = sortRowsByListedAtDescZtoA(unsorted);
  assert.deepEqual(
    sorted.map((r) => `${r.symbol}@${r.listedAt}`),
    [
      'DATAPATTNS@14:59:59',
      'WIPRO@14:30:00',
      'INFY@14:30:00',
      'ALKEM@12:04:59',
      'UJJIVANSFB@09:19:59',
      'TCS@--',
    ]
  );

  // Also verify StickyScannerRegistry automatically outputs LISTED AT Z->A per category
  const registry = new StickyScannerRegistry();
  const strongDownBars = makeTrendingBars({ count: 24, startPrice: 500, step: -1.4, baseVol: 100_000, spikeVol: 320_000 });
  const liveMap = new Map<string, ScannedStock>([
    ['ALKEM', makeMockStock('ALKEM', 470, -1.5, 3.0, 3.2, 34)],
    ['WIPRO', makeMockStock('WIPRO', 470, -1.4, 3.0, 3.2, 34)],
    ['INDIGO', makeMockStock('INDIGO', 470, -1.2, 3.0, 3.2, 34)],
  ]);

  const out = registry.filterAndStabilizeRows({
    scannerKey: 'money-flow:SELL',
    rows: [
      { symbol: 'ALKEM', price: 470, changePercent: -1.5, entryPrice: 475, stopLoss: 485, listedAt: '12:04:59', rvol: 3.0 },
      { symbol: 'INDIGO', price: 470, changePercent: -1.2, entryPrice: 475, stopLoss: 485, listedAt: '13:04:59', rvol: 3.0 },
      { symbol: 'WIPRO', price: 470, changePercent: -1.4, entryPrice: 475, stopLoss: 485, listedAt: '13:04:59', rvol: 3.0 },
    ],
    liveStockMap: liveMap,
    getBarsFn: () => strongDownBars,
    isMidnightCleared: false,
    dateIST: '2026-11-19',
    getSymbol: (r) => r.symbol,
    getSide: () => 'SELL',
  });

  assert.deepEqual(
    out.map((r) => r.symbol),
    ['WIPRO', 'INDIGO', 'ALKEM'],
    'Category must be sorted by LISTED AT descending (13:04:59 before 12:04:59) with Z-to-A tie-break (WIPRO before INDIGO)'
  );
});

test('Flat zero-range closing candles (O===H===L===C) produce neutral 0 delta instead of bullish +0.25/+0.5 bias', () => {
  const flatBar = { open: 5145, high: 5145, low: 5145, close: 5145, volume: 80_000 };
  const clvRes = computeBarClvAndDelta(flatBar);
  assert.equal(clvRes.clv, 0, 'Flat bar CLV must be 0, never +0.25');
  assert.equal(clvRes.delta, 0, 'Flat bar delta must be 0, never positive');

  const buySellRes = computeBarDeltaFromBuySell(flatBar);
  assert.equal(buySellRes.delta, 0, 'Flat bar buy/sell delta must be 0, never +0.5*vol');
});


