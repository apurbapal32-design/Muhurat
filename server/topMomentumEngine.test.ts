import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTopMomentumReport,
  computeWilderAdx,
  evaluateTopMomentumOrderFlow,
  TOP_MOMENTUM_STRONG_ADX_MIN,
  TOP_MOMENTUM_STRONG_RVOL_MIN,
  TOP_MOMENTUM_STRONG_XTIME_VOL_MIN,
} from './topMomentumEngine';
import {
  applyUniversalGateToTopMomentumReport,
  StickyScannerRegistry,
} from './scannerUniversalGate';
import { ClaudeFnoBar } from './claudeFnoEngine';
import { ScannedStock } from '../src/types';

function makeBar(
  dateIST: string,
  timeIST: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number
): ClaudeFnoBar {
  const [h, m, s] = timeIST.split(':').map((x) => Number(x) || 0);
  return {
    dateIST,
    timeIST,
    secIST: h * 3600 + m * 60 + s,
    open,
    high,
    low,
    close,
    volume,
  };
}

// Prior day late-session consolidation bars for BANKBARODA around 274.10 - 275.20 (Prev Close = 274.50, avg vol ~200K)
const PREV_DAY_CONSOL: ClaudeFnoBar[] = [
  makeBar('2026-11-18', '14:45:00', 274.6, 275.05, 274.1, 274.4, 180000),
  makeBar('2026-11-18', '14:50:00', 274.4, 274.95, 274.05, 274.7, 175000),
  makeBar('2026-11-18', '14:55:00', 274.7, 275.1, 274.2, 274.55, 190000),
  makeBar('2026-11-18', '15:00:00', 274.55, 275.15, 274.15, 274.6, 210000),
  makeBar('2026-11-18', '15:05:00', 274.6, 275.2, 274.1, 274.35, 200000),
  makeBar('2026-11-18', '15:10:00', 274.35, 274.95, 274.0, 274.45, 195000),
  makeBar('2026-11-18', '15:15:00', 274.45, 275.0, 274.1, 274.55, 220000),
  makeBar('2026-11-18', '15:20:00', 274.55, 275.05, 274.2, 274.5, 215000),
  makeBar('2026-11-18', '15:25:00', 274.5, 274.9, 274.15, 274.5, 210000),
];

test('computeWilderAdx distinguishes strong directional trend (ADX >= 25) from flat sideways chop (ADX < 25)', () => {
  const trendingBars: ClaudeFnoBar[] = [];
  let px = 100;
  for (let i = 0; i < 30; i++) {
    const mm = String((15 + i * 5) % 60).padStart(2, '0');
    const hh = String(9 + Math.floor((15 + i * 5) / 60)).padStart(2, '0');
    trendingBars.push(makeBar('2026-11-19', `${hh}:${mm}:00`, px, px + 1.4, px - 0.1, px + 1.2, 200000));
    px += 1.1;
  }
  const trendAdx = computeWilderAdx(trendingBars, 14);
  assert.ok(trendAdx.adx >= 25, `Expected trending ADX >= 25, got ${trendAdx.adx}`);
  assert.ok(trendAdx.plusDI > trendAdx.minusDI, 'Expected +DI > -DI in uptrend');

  const choppyBars: ClaudeFnoBar[] = [];
  for (let i = 0; i < 30; i++) {
    const mm = String((15 + i * 5) % 60).padStart(2, '0');
    const hh = String(9 + Math.floor((15 + i * 5) / 60)).padStart(2, '0');
    const up = i % 2 === 0;
    choppyBars.push(
      makeBar(
        '2026-11-19',
        `${hh}:${mm}:00`,
        up ? 100 : 100.3,
        100.5,
        99.5,
        up ? 100.3 : 100,
        200000
      )
    );
  }
  const chopAdx = computeWilderAdx(choppyBars, 14);
  assert.ok(chopAdx.adx < 25, `Expected sideways chop ADX < 25, got ${chopAdx.adx}`);
});

test('BANKBARODA Stage 1 (Break @ 09:20, +0.58%) with Strong RVOL > 2.00, X-Time Vol > 1.00X, ADX 25+: fires IMMEDIATE BREAK_IGNITION alert', () => {
  const bars: ClaudeFnoBar[] = [
    ...PREV_DAY_CONSOL,
    makeBar('2026-11-19', '09:15:00', 275.0, 275.15, 272.5, 274.95, 420000),
    makeBar('2026-11-19', '09:20:00', 274.95, 276.3, 274.85, 276.1, 580000),
  ];

  const res = evaluateTopMomentumOrderFlow({
    symbol: 'BANKBARODA',
    name: 'Bank of Baroda',
    sector: 'PSU Bank',
    sectorChangePct: 0.35,
    bars5m: bars,
    price: 276.1,
    prevClose: 274.5,
    changePercent: 0.58,
    bidAskRatio: 1.48,
    orderBookBias: 'Buyer Dominance',
    oiChangePct: 4.1,
    turnoverCr: 62.5,
    volume: 1000000,
    explicitRvol: 2.35,
    explicitAdx: 29.4,
  });

  assert.ok(res, 'Should detect BANKBARODA Break ignition when RVOL > 2.0, X-Time Vol > 1.0X, ADX >= 25');
  assert.equal(res.direction, 'BUY');
  assert.equal(res.stage, 'BREAK_IGNITION');
  assert.equal(res.shouldAlertNow, true);
  assert.ok(res.rvol > TOP_MOMENTUM_STRONG_RVOL_MIN);
  assert.ok(res.xTimeVolume > TOP_MOMENTUM_STRONG_XTIME_VOL_MIN);
  assert.ok(res.adx >= TOP_MOMENTUM_STRONG_ADX_MIN);
  assert.equal(res.strongRvolPassed, true);
  assert.equal(res.strongXTimeVolPassed, true);
  assert.equal(res.adxPassed, true);
  assert.equal(res.totalConditions, 8);
  assert.ok(res.relativeStrengthVsSector > 0);
});

test('BANKBARODA Stage 2 (Rej 1 @ 09:25, +0.91%): fires IMMEDIATE REJ_1_ENTRY alert with Strong RVOL / X-Time Vol / ADX 25+', () => {
  const bars: ClaudeFnoBar[] = [
    ...PREV_DAY_CONSOL,
    makeBar('2026-11-19', '09:15:00', 275.0, 275.15, 272.5, 274.95, 420000),
    makeBar('2026-11-19', '09:20:00', 274.95, 276.3, 274.85, 276.1, 580000),
    makeBar('2026-11-19', '09:25:00', 276.1, 277.15, 275.45, 277.0, 510000),
  ];

  const res = evaluateTopMomentumOrderFlow({
    symbol: 'BANKBARODA',
    name: 'Bank of Baroda',
    sector: 'PSU Bank',
    sectorChangePct: 0.55,
    bars5m: bars,
    price: 277.0,
    prevClose: 274.5,
    changePercent: 0.91,
    bidAskRatio: 1.55,
    orderBookBias: 'Heavy Buyer Accumulation',
    oiChangePct: 5.8,
    turnoverCr: 98.0,
    volume: 1510000,
    explicitRvol: 2.55,
    explicitAdx: 31.8,
  });

  assert.ok(res, 'Should detect Rej 1 prime entry');
  assert.equal(res.stage, 'REJ_1_ENTRY');
  assert.equal(res.shouldAlertNow, true);
  assert.equal(res.rej1Detected, true);
  assert.ok(res.xTimeVolume > 1.0);
  assert.ok(res.adx >= 25);
});

test('Rectified v2.0 Rejects counter-trend ADX traps (-DI > +DI on BUY), shooting-star wick fakeouts, and Rule 3 failures', () => {
  // 1. Counter-trend ADX trap: stock crashed hard (so ADX >= 25 with -DI >> +DI), then prints 1 green bounce bar
  const crashThenBounce: ClaudeFnoBar[] = [];
  let p = 320;
  for (let i = 0; i < 16; i++) {
    const mm = String((15 + i * 5) % 60).padStart(2, '0');
    const hh = String(9 + Math.floor((15 + i * 5) / 60)).padStart(2, '0');
    crashThenBounce.push(makeBar('2026-11-18', `${hh}:${mm}:00`, p, p + 0.3, p - 2.6, p - 2.4, 200000));
    p -= 2.4;
  }
  const bounceBase = p;
  crashThenBounce.push(makeBar('2026-11-19', '09:15:00', bounceBase, bounceBase + 0.4, bounceBase - 1.2, bounceBase + 0.1, 250000));
  crashThenBounce.push(makeBar('2026-11-19', '09:20:00', bounceBase + 0.1, bounceBase + 1.8, bounceBase, bounceBase + 1.6, 620000));

  const deadCatRes = evaluateTopMomentumOrderFlow({
    symbol: 'FALLINGKNIFE',
    name: 'Falling Knife Ltd',
    sector: 'IT',
    sectorChangePct: -0.5,
    bars5m: crashThenBounce,
    price: bounceBase + 1.6,
    prevClose: bounceBase,
    changePercent: 0.56,
    bidAskRatio: 1.3,
    orderBookBias: 'Buyer Dominance',
    oiChangePct: 1.5,
    turnoverCr: 80,
    volume: 870000,
    explicitRvol: 2.8,
  });
  assert.equal(deadCatRes, null, 'MUST reject BUY dead-cat bounce when ADX is high solely due to bearish -DI > +DI');

  // 2. Shooting-star fakeout candle (long upper wick closing weak below resistance) -> MUST return null
  const fakeoutBars: ClaudeFnoBar[] = [
    ...PREV_DAY_CONSOL,
    makeBar('2026-11-19', '09:15:00', 275.0, 275.15, 272.5, 274.95, 260000),
    // Breaks intraday high to 277.20 but slams back down to close at 275.35 (weak CLV & tiny body = upper wick trap!)
    makeBar('2026-11-19', '09:20:00', 275.0, 277.2, 274.9, 275.35, 620000),
  ];
  const fakeoutRes = evaluateTopMomentumOrderFlow({
    symbol: 'FAKEOUT',
    name: 'Fakeout Corp',
    sector: 'PSU Bank',
    sectorChangePct: 0.5,
    bars5m: fakeoutBars,
    price: 275.35,
    prevClose: 274.5,
    changePercent: 0.31,
    bidAskRatio: 1.4,
    orderBookBias: 'Buyer Dominance',
    oiChangePct: 2.0,
    turnoverCr: 65,
    volume: 880000,
    explicitRvol: 2.6,
    explicitAdx: 31,
  });
  assert.equal(fakeoutRes, null, 'MUST reject shooting-star upper-wick fakeout breakout');

  // 3. Rule 3 failures (ADX < 25, Vol Bazaar X-Time <= 1.00X, RVOL <= 2.00)
  const strongBars: ClaudeFnoBar[] = [
    ...PREV_DAY_CONSOL,
    makeBar('2026-11-19', '09:15:00', 275.0, 275.15, 272.5, 274.95, 240000),
    makeBar('2026-11-19', '09:20:00', 274.95, 276.3, 274.85, 276.1, 580000),
  ];
  const lowAdx = evaluateTopMomentumOrderFlow({
    symbol: 'BANKBARODA',
    name: 'Bank of Baroda',
    sector: 'PSU Bank',
    sectorChangePct: 0.72,
    bars5m: strongBars,
    price: 276.1,
    prevClose: 274.5,
    changePercent: 0.58,
    bidAskRatio: 1.48,
    orderBookBias: 'Buyer Dominance',
    oiChangePct: 4.1,
    turnoverCr: 62.5,
    volume: 1000000,
    explicitRvol: 2.4,
    explicitAdx: 21.5,
  });
  assert.equal(lowAdx, null, 'MUST reject setup when ADX < 25');

  const weakVolBars: ClaudeFnoBar[] = [
    ...PREV_DAY_CONSOL,
    makeBar('2026-11-19', '09:15:00', 275.0, 275.15, 272.5, 274.95, 190000),
    makeBar('2026-11-19', '09:20:00', 274.95, 276.3, 274.85, 276.1, 180000),
  ];
  const lowXTime = evaluateTopMomentumOrderFlow({
    symbol: 'BANKBARODA',
    name: 'Bank of Baroda',
    sector: 'PSU Bank',
    sectorChangePct: 0.72,
    bars5m: weakVolBars,
    price: 276.1,
    prevClose: 274.5,
    changePercent: 0.58,
    bidAskRatio: 1.48,
    orderBookBias: 'Buyer Dominance',
    oiChangePct: 4.1,
    turnoverCr: 62.5,
    volume: 1000000,
    explicitRvol: 2.3,
    explicitAdx: 30.0,
  });
  assert.equal(lowXTime, null, 'MUST reject setup when Vol Bazaar X-Time Volume <= 1.00X');
});

test('BANKBARODA Stage 3 (Late Exhaustion / Exit @ 10:35, 283.20, +3.17%, Δ -22.10K): BLOCKS late alert as EXHAUSTED_EXIT', () => {
  const bars: ClaudeFnoBar[] = [
    ...PREV_DAY_CONSOL,
    makeBar('2026-11-19', '09:15:00', 275.0, 275.15, 272.5, 274.95, 420000),
    makeBar('2026-11-19', '09:20:00', 274.95, 276.3, 274.85, 276.1, 580000),
    makeBar('2026-11-19', '09:25:00', 276.1, 277.15, 275.45, 277.0, 510000),
    makeBar('2026-11-19', '09:30:00', 277.0, 278.5, 276.9, 278.4, 490000),
    makeBar('2026-11-19', '09:35:00', 278.4, 279.9, 278.2, 279.6, 520000),
    makeBar('2026-11-19', '09:40:00', 279.6, 280.8, 279.5, 280.6, 480000),
    makeBar('2026-11-19', '09:45:00', 280.6, 281.8, 280.4, 281.5, 450000),
    makeBar('2026-11-19', '09:50:00', 281.5, 282.6, 281.2, 282.4, 430000),
    makeBar('2026-11-19', '10:05:00', 282.4, 283.4, 282.1, 283.2, 410000),
    makeBar('2026-11-19', '10:25:00', 283.2, 284.27, 283.1, 284.0, 440000),
    makeBar('2026-11-19', '10:35:00', 284.0, 284.27, 283.0, 283.2, 351490),
  ];

  const res = evaluateTopMomentumOrderFlow({
    symbol: 'BANKBARODA',
    name: 'Bank of Baroda',
    sector: 'PSU Bank',
    sectorChangePct: 1.9,
    bars5m: bars,
    price: 283.2,
    prevClose: 274.5,
    changePercent: 3.17,
    bidAskRatio: 0.55,
    orderBookBias: 'Seller Pressure',
    oiChangePct: 8.2,
    turnoverCr: 310.0,
    volume: 11100000,
    explicitVwap: 280.56,
    explicitRvol: 2.6,
    explicitAdx: 36.2,
  });

  assert.ok(res, 'Should classify exhausted stock for transparent blocking');
  assert.equal(res.stage, 'EXHAUSTED_EXIT');
  assert.equal(res.isExhausted, true);
  assert.equal(res.shouldAlertNow, false);
});

test('Mirror SELL Early Ignition with Strong RVOL > 2.00, X-Time Vol > 1.00X, ADX 25+ fires immediate SELL alert', () => {
  const prevBearConsol: ClaudeFnoBar[] = [
    makeBar('2026-11-18', '15:00:00', 500.2, 501.0, 499.6, 500.0, 200000),
    makeBar('2026-11-18', '15:05:00', 500.0, 500.8, 499.5, 500.1, 195000),
    makeBar('2026-11-18', '15:10:00', 500.1, 500.9, 499.7, 500.0, 210000),
    makeBar('2026-11-18', '15:15:00', 500.0, 500.7, 499.5, 499.9, 205000),
    makeBar('2026-11-18', '15:20:00', 499.9, 500.6, 499.6, 500.0, 215000),
    makeBar('2026-11-18', '15:25:00', 500.0, 500.5, 499.6, 500.0, 200000),
  ];

  const bars: ClaudeFnoBar[] = [
    ...prevBearConsol,
    makeBar('2026-11-19', '09:15:00', 500.1, 503.2, 499.7, 499.8, 390000),
    makeBar('2026-11-19', '09:20:00', 499.8, 500.0, 496.9, 497.1, 560000),
  ];

  const res = evaluateTopMomentumOrderFlow({
    symbol: 'TATASTEEL',
    name: 'Tata Steel',
    sector: 'Metals',
    sectorChangePct: -0.25,
    bars5m: bars,
    price: 497.1,
    prevClose: 500.0,
    changePercent: -0.58,
    bidAskRatio: 0.68,
    orderBookBias: 'Seller Pressure',
    oiChangePct: 4.5,
    turnoverCr: 84.0,
    volume: 950000,
    explicitRvol: 2.45,
    explicitAdx: 28.5,
  });

  assert.ok(res);
  assert.equal(res.direction, 'SELL');
  assert.equal(res.stage, 'BREAK_IGNITION');
  assert.equal(res.shouldAlertNow, true);
  assert.ok(res.rvol > 2.0);
  assert.ok(res.xTimeVolume > 1.0);
  assert.ok(res.adx >= 25);
});

test('applyUniversalGateToTopMomentumReport counts earlyIgnitionSellCount from sellSignals (not buySignals) and respects midnight flush', () => {
  const buyBars: ClaudeFnoBar[] = [];
  let px = 262.0;
  for (let i = 0; i < 16; i++) {
    const mm = String((15 + i * 5) % 60).padStart(2, '0');
    const hh = String(9 + Math.floor((15 + i * 5) / 60)).padStart(2, '0');
    buyBars.push(makeBar('2026-11-18', `${hh}:${mm}:00`, px, px + 1.0, px - 0.15, px + 0.85, 200000));
    px += 0.8;
  }
  buyBars.push(makeBar('2026-11-19', '09:15:00', 274.8, 275.2, 274.2, 275.0, 260000));
  buyBars.push(makeBar('2026-11-19', '09:20:00', 275.0, 276.4, 274.9, 276.1, 640000));
  const dummyStock = {
    symbol: 'BANKBARODA',
    name: 'Bank of Baroda',
    sector: 'PSU Bank',
    price: 276.1,
    change: 1.6,
    changePercent: 0.58,
    volume: 1000000,
    bidAskRatio: 1.5,
    indicators: { vwap: 274.8, rvol: 2.35, adx: 30 },
  } as unknown as ScannedStock;

  const cleared = buildTopMomentumReport({
    stocks: [dummyStock],
    getExtendedBarsFn: () => undefined,
    candlesMap: new Map(),
    isMidnightCleared: true,
  });
  assert.equal(cleared.isMidnightCleared, true);
  assert.deepEqual(cleared.thresholds, {
    strongRvolMin: 2.0,
    strongXTimeVolMin: 1.0,
    adxMin: 25.0,
  });
  assert.equal(cleared.buySignals.length, 0);
  assert.equal(cleared.sellSignals.length, 0);

  // Verify earlyIgnitionSellCount is 0 when only 1 BUY signal exists and 0 SELL signals exist
  const rawReport = {
    isMidnightCleared: false,
    buySignals: [
      {
        symbol: 'BANKBARODA',
        direction: 'BUY',
        shouldAlertNow: true,
        entryPrice: 276.1,
        stopLoss: 273.5,
        rvol: 2.4,
        xTimeVolume: 2.5,
        adx: 31,
        listedAt: '09:20:00',
      },
    ],
    sellSignals: [],
    exhaustedSignals: [],
  };
  const reg = new StickyScannerRegistry();
  const gated = applyUniversalGateToTopMomentumReport(
    rawReport,
    [dummyStock],
    () => buyBars as any,
    new Map(),
    reg
  );
  assert.equal(gated.buyCount, 1);
  assert.equal(gated.sellCount, 0);
  assert.equal(gated.earlyIgnitionBuyCount, 1);
  assert.equal(gated.earlyIgnitionSellCount, 0, 'earlyIgnitionSellCount MUST count sellSignals, never buySignals');
});
