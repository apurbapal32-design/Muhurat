import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMuhuratFlowReport,
  computeBarClvAndDelta,
  evaluateMuhuratFlowSetup,
} from './muhuratFlowEngine';
import type { ClaudeFnoBar } from './claudeFnoEngine';
import type { ScannedStock } from '../src/types';

function makeBar(
  dateIST: string,
  timeIST: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number
): ClaudeFnoBar {
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

test('computeBarClvAndDelta computes buying vs selling pressure and wick percentages accurately', () => {
  // Pin bar lower wick absorption: opens 100, drops to 96, closes 100.5 near high 101
  const bullPin = computeBarClvAndDelta({ open: 100, high: 101, low: 96, close: 100.5, volume: 10000 });
  assert.ok(bullPin.clv > 0.7, `Expected positive CLV near +0.8, got ${bullPin.clv}`);
  assert.ok(bullPin.delta > 7000);
  assert.ok(bullPin.lowerWickPct >= 75);

  // Upper wick rejection: spikes to 105, closes near low 100.2
  const bearPin = computeBarClvAndDelta({ open: 100.5, high: 105, low: 100, close: 100.2, volume: 10000 });
  assert.ok(bearPin.clv < -0.7);
  assert.ok(bearPin.delta < -7000);
  assert.ok(bearPin.upperWickPct >= 80);
});

test('evaluateMuhuratFlowSetup detects SSL Stop-Hunt & Post-Sweep Confirmation BUY (6/6) with VWAP/CVD/OI confluence', () => {
  const bars: ClaudeFnoBar[] = [];
  // Prior day establishing PDL = 995.0, PDH = 1010.0
  for (let i = 0; i < 12; i++) {
    const min = 14 * 60 + i * 5;
    const hh = String(Math.floor(min / 60)).padStart(2, '0');
    const mm = String(min % 60).padStart(2, '0');
    bars.push(makeBar('2026-11-17', `${hh}:${mm}:00`, 1000, 1008, i === 6 ? 995.0 : 997, 1002, 10000));
  }
  // Today opening bars above PDL = 995
  bars.push(makeBar('2026-11-18', '09:15:00', 1001, 1003, 997.5, 999.0, 11000));
  bars.push(makeBar('2026-11-18', '09:20:00', 999.0, 1000.5, 996.2, 997.5, 10000));
  bars.push(makeBar('2026-11-18', '09:25:00', 997.5, 998.5, 995.6, 996.5, 10000));
  bars.push(makeBar('2026-11-18', '09:30:00', 996.5, 998.0, 995.8, 997.2, 10500));
  // 09:35 Sweep bar: stop-hunt dips below PDL (995.0) to 991.8, absorbs sell stops on 2.8x vol & reclaims 998.2
  bars.push(makeBar('2026-11-18', '09:35:00', 996.8, 999.0, 991.8, 998.5, 32000));
  // 09:40 Confirmation bar: clean controlled candle closing above VWAP (~998.7) & above sweep close without overextending
  bars.push(makeBar('2026-11-18', '09:40:00', 998.5, 1002.4, 998.0, 1001.9, 26000));

  const row = evaluateMuhuratFlowSetup({
    symbol: 'HDFCBANK',
    name: 'HDFC Bank Ltd',
    sector: 'Banking',
    sectorChangePct: 0.9,
    bars5m: bars,
    price: 1002.0,
    changePercent: 0.95,
    bidAskRatio: 1.55,
    orderBookBias: 'Heavy Buyer Accumulation',
    oiChangePct: 4.2,
    turnoverCr: 340,
  });

  assert.ok(row !== null);
  assert.equal(row!.direction, 'BUY');
  assert.equal(row!.sweepType, 'SSL_STOP_HUNT_RECLAIM');
  assert.equal(row!.allSixMet, true, `Failed checks: ${JSON.stringify(row!.conditions.filter((c) => !c.passed))}`);
  assert.equal(row!.conditionsMet, 6);
  assert.ok(row!.score >= 80, `Expected score >= 80, got ${row!.score}`);
  assert.equal(row!.antiChasePassed, true);
  assert.ok(row!.stopLoss < 991.8);
  assert.ok(row!.target1 > row!.entryPrice && row!.target2 > row!.target1 && row!.target3 > row!.target2);
  assert.equal(row!.confirmationTimeIST, '09:40:00');
});

test('evaluateMuhuratFlowSetup detects BSL Stop-Hunt & Reject SELL (6/6) and blocks extended climax chase candles', () => {
  const bars: ClaudeFnoBar[] = [];
  for (let i = 0; i < 12; i++) {
    const min = 14 * 60 + i * 5;
    const hh = String(Math.floor(min / 60)).padStart(2, '0');
    const mm = String(min % 60).padStart(2, '0');
    bars.push(makeBar('2026-11-17', `${hh}:${mm}:00`, 500, i === 6 ? 506.0 : 503, 498, 501, 10000));
  }
  bars.push(makeBar('2026-11-18', '09:15:00', 501, 504, 500, 503.0, 11000));
  bars.push(makeBar('2026-11-18', '09:20:00', 503, 505, 501.5, 504.2, 10500));
  bars.push(makeBar('2026-11-18', '09:25:00', 504.2, 505.5, 502.5, 504.8, 10000));
  bars.push(makeBar('2026-11-18', '09:30:00', 504.8, 505.4, 503.0, 504.0, 10000));
  // 09:35 BSL stop-hunt spikes above PDH 506.0 to 508.8 and rejects back below 506 closing at 502.5
  bars.push(makeBar('2026-11-18', '09:35:00', 504.2, 508.8, 502.0, 502.5, 30000));
  // 09:40 Bearish post-sweep confirmation close below VWAP
  bars.push(makeBar('2026-11-18', '09:40:00', 502.5, 503.0, 499.6, 500.0, 24000));

  const sellRow = evaluateMuhuratFlowSetup({
    symbol: 'INFY',
    name: 'Infosys Ltd',
    sector: 'IT',
    sectorChangePct: -1.1,
    bars5m: bars,
    price: 499.9,
    changePercent: -1.2,
    bidAskRatio: 0.65,
    orderBookBias: 'Seller Pressure',
    oiChangePct: 5.5,
    turnoverCr: 220,
  });

  assert.ok(sellRow !== null);
  assert.equal(sellRow!.direction, 'SELL');
  assert.equal(sellRow!.sweepType, 'BSL_STOP_HUNT_REJECT');
  assert.equal(sellRow!.allSixMet, true, `Failed checks: ${JSON.stringify(sellRow!.conditions.filter((c) => !c.passed))}`);
  assert.ok(sellRow!.stopLoss > 508.8);
  assert.ok(sellRow!.target1 < sellRow!.entryPrice);

  // Now append a huge runaway spike candle chasing far from VWAP -> Anti-Chase should reject 6/6
  const chaseBars = [
    ...bars,
    makeBar('2026-11-18', '09:45:00', 500.0, 500.2, 478.0, 478.5, 42000),
  ];
  const chased = evaluateMuhuratFlowSetup({
    symbol: 'INFY',
    name: 'Infosys Ltd',
    sector: 'IT',
    sectorChangePct: -1.1,
    bars5m: chaseBars,
    price: 478.5,
    changePercent: -4.5,
    bidAskRatio: 0.65,
    orderBookBias: 'Seller Pressure',
    oiChangePct: 5.5,
    turnoverCr: 290,
  });
  assert.ok(chased !== null);
  assert.equal(chased!.antiChasePassed, false, 'Expected runaway >2.4x ATR candle far from VWAP to fail Anti-Chase');
  assert.equal(chased!.allSixMet, false);
});

test('buildMuhuratFlowReport includes transparent NSE OHLCV caveat and returns zero rows when midnight cleared', () => {
  const mockStocks = [
    {
      symbol: 'RELIANCE',
      name: 'Reliance Industries',
      sector: 'Energy',
      price: 1320,
      changePercent: 1.4,
      volume: 500000,
      bidAskRatio: 1.35,
    } as unknown as ScannedStock,
  ];
  const cleared = buildMuhuratFlowReport({
    stocks: mockStocks,
    getExtendedBarsFn: () => undefined,
    candlesMap: new Map(),
    isMidnightCleared: true,
  });
  assert.equal(cleared.isMidnightCleared, true);
  assert.equal(cleared.buySignals.length, 0);
  assert.equal(cleared.sellSignals.length, 0);
  assert.ok(cleared.methodologyDisclaimer.includes('OHLCV'));
  assert.equal(cleared.pillars.length, 6);
});
