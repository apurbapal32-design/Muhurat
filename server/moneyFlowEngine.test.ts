import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSmartMoneyFlowReport,
  classifyFinUrlScore,
  classifyRvol,
  computeHMA,
  computeSupertrend,
  evaluateStockFinUrlStrategy,
  findBestPriorFvg,
  MoneyFlowWorkBar,
  passesMoneyFlowTwoPercentFilter,
} from './moneyFlowEngine';
import type { ScannedStock } from '../src/types';

function makeBar(
  dateIST: string,
  timeIST: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number
): MoneyFlowWorkBar {
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

function buildBullishFvgRetestBars(): MoneyFlowWorkBar[] {
  const bars: MoneyFlowWorkBar[] = [];
  // Previous 3 days of 5m uptrend so 15m HMA(55) & 5m HMA(55) + 15m/5m Supertrend(10,2) are cleanly bullish
  const dates = ['2026-11-13', '2026-11-16', '2026-11-17'];
  let px = 900;
  for (const d of dates) {
    for (let i = 0; i < 75; i++) {
      const min = 9 * 60 + 15 + i * 5;
      const hh = String(Math.floor(min / 60)).padStart(2, '0');
      const mm = String(min % 60).padStart(2, '0');
      const open = px;
      const close = px + 0.45;
      bars.push(makeBar(d, `${hh}:${mm}:00`, open, close + 0.35, open - 0.35, close, 10000));
      px = close;
    }
  }

  // Today (2026-11-18): steady rise -> clean 3-candle Bullish FVG -> pullback retest + green rejection with RVOL >= 2.0x
  const todayBase = px;
  for (let i = 0; i < 6; i++) {
    const min = 9 * 60 + 15 + i * 5;
    const hh = String(Math.floor(min / 60)).padStart(2, '0');
    const mm = String(min % 60).padStart(2, '0');
    const o = todayBase + i * 0.4;
    const c = o + 0.4;
    bars.push(makeBar('2026-11-18', `${hh}:${mm}:00`, o, c + 0.3, o - 0.25, c, 10000));
  }
  const c1Top = bars[bars.length - 1].high; // e.g. ~1004.2
  // Impulse Candle 2 (gap creator)
  bars.push(makeBar('2026-11-18', '09:45:00', c1Top - 0.2, c1Top + 3.2, c1Top - 0.3, c1Top + 3.0, 18000));
  // Candle 3: Low strictly > C1.high -> Bullish FVG [c1Top .. c1Top + 1.4]
  bars.push(makeBar('2026-11-18', '09:50:00', c1Top + 2.8, c1Top + 4.2, c1Top + 1.4, c1Top + 3.8, 12000));
  // Rejection Retest Bar at 09:55:00: dips into FVG zone (low = c1Top + 0.5 <= c3.low), closes green with lower wick & RVOL >= 2.0x
  bars.push(makeBar('2026-11-18', '09:55:00', c1Top + 2.2, c1Top + 4.0, c1Top + 0.5, c1Top + 3.9, 28000));

  return bars;
}

function buildBearishFvgRetestBars(): MoneyFlowWorkBar[] {
  const bars: MoneyFlowWorkBar[] = [];
  const dates = ['2026-11-13', '2026-11-16', '2026-11-17'];
  let px = 1200;
  for (const d of dates) {
    for (let i = 0; i < 75; i++) {
      const min = 9 * 60 + 15 + i * 5;
      const hh = String(Math.floor(min / 60)).padStart(2, '0');
      const mm = String(min % 60).padStart(2, '0');
      const open = px;
      const close = px - 0.45;
      bars.push(makeBar(d, `${hh}:${mm}:00`, open, open + 0.35, close - 0.35, close, 10000));
      px = close;
    }
  }

  const todayBase = px;
  for (let i = 0; i < 6; i++) {
    const min = 9 * 60 + 15 + i * 5;
    const hh = String(Math.floor(min / 60)).padStart(2, '0');
    const mm = String(min % 60).padStart(2, '0');
    const o = todayBase - i * 0.4;
    const c = o - 0.4;
    bars.push(makeBar('2026-11-18', `${hh}:${mm}:00`, o, o + 0.25, c - 0.3, c, 10000));
  }
  const c1Low = bars[bars.length - 1].low;
  // Impulse Bearish Candle 2
  bars.push(makeBar('2026-11-18', '09:45:00', c1Low + 0.2, c1Low + 0.3, c1Low - 3.2, c1Low - 3.0, 18000));
  // Candle 3: High < C1.low -> Bearish FVG [c1Low - 1.4 .. c1Low]
  bars.push(makeBar('2026-11-18', '09:50:00', c1Low - 2.8, c1Low - 1.4, c1Low - 4.2, c1Low - 3.8, 12000));
  // Bearish Rejection Retest Bar at 09:55:00: rallies into FVG (high = c1Low - 0.5 >= c3.high), closes red with upper wick & RVOL >= 2.0x
  bars.push(makeBar('2026-11-18', '09:55:00', c1Low - 2.2, c1Low - 0.5, c1Low - 4.0, c1Low - 3.9, 28000));

  return bars;
}

test('HMA(55), FVG 3-candle imbalance, Supertrend(10,2), and scoring bands compute accurately', () => {
  const closes = Array.from({ length: 80 }, (_, i) => 100 + i * 0.8);
  const { series, periodUsed } = computeHMA(closes, 55);
  assert.equal(periodUsed, 55);
  assert.ok(series[series.length - 1] > series[series.length - 2]);

  assert.equal(classifyRvol(0.8), 'Weak');
  assert.equal(classifyRvol(1.2), 'Normal');
  assert.equal(classifyRvol(1.4), 'Good');
  assert.equal(classifyRvol(1.7), 'Strong');
  assert.equal(classifyRvol(2.2), 'Very strong');

  assert.equal(classifyFinUrlScore(90, 'BUY'), 'Strong BUY');
  assert.equal(classifyFinUrlScore(88, 'SELL'), 'Strong SELL');
  assert.equal(classifyFinUrlScore(78, 'BUY'), 'Good opportunity');
  assert.equal(classifyFinUrlScore(65, 'SELL'), 'Watchlist');
  assert.equal(classifyFinUrlScore(45, 'BUY'), 'No trade');
  assert.equal(passesMoneyFlowTwoPercentFilter(2.1), true);
  assert.equal(passesMoneyFlowTwoPercentFilter(1.2), false);

  const bullBars = buildBullishFvgRetestBars();
  const fvg = findBestPriorFvg(bullBars, bullBars.length - 1, 'BUY', 20);
  assert.ok(fvg !== null);
  assert.equal(fvg!.type, 'BULLISH_FVG');
  assert.equal(fvg!.retested, true);
  assert.equal(fvg!.isFresh, true);

  const st = computeSupertrend(bullBars, 10, 2.0);
  assert.equal(st.dir[st.dir.length - 1], 1);
});

test('evaluateStockFinUrlStrategy confirms 6/6 BUY setup with exact Entry, SL, T1/T2/T3 & 100-pt score >= 85', () => {
  const bars = buildBullishFvgRetestBars();
  const last = bars[bars.length - 1];
  const stock = {
    symbol: 'RELIANCE',
    name: 'Reliance Industries',
    sector: 'Energy',
    price: last.close,
    changePercent: 1.45,
    bidAskRatio: 1.38,
    volume: 500000,
  } as unknown as ScannedStock;

  const { buyRow } = evaluateStockFinUrlStrategy({
    stock,
    bars,
    sectorChangePct: 0.9,
    istDateStr: '2026-11-18',
    istTimeStr: '10:05:00',
  });

  assert.ok(buyRow !== null);
  assert.equal(buyRow!.direction, 'BUY');
  assert.equal(buyRow!.allSixMet, true, `Failed: ${JSON.stringify(buyRow!.conditions.filter((c) => !c.passed))}`);
  assert.equal(buyRow!.conditionsMet, 6);
  assert.ok(buyRow!.score >= 85, `Expected Strong BUY >=85 score, got ${buyRow!.score}`);
  assert.equal(buyRow!.classification, 'Strong BUY');
  assert.equal(buyRow!.entryPrice, Number(last.high.toFixed(2)));
  assert.ok(buyRow!.stopLoss < Math.min(buyRow!.fvg!.bottom, last.low));
  assert.ok(buyRow!.target1 > buyRow!.entryPrice);
  assert.ok(buyRow!.target2 > buyRow!.target1);
  assert.ok(buyRow!.target3 > buyRow!.target2);
  const r = Number((buyRow!.entryPrice - buyRow!.stopLoss).toFixed(2));
  assert.ok(Math.abs((buyRow!.target2 - buyRow!.entryPrice) - 2 * r) <= 0.05);
  assert.ok(Math.abs((buyRow!.target3 - buyRow!.entryPrice) - 3 * r) <= 0.05);
});

test('evaluateStockFinUrlStrategy confirms 6/6 SELL setup with Bearish FVG retest, RVOL >= 1.5x & inverse T1-T3 math', () => {
  const bars = buildBearishFvgRetestBars();
  const last = bars[bars.length - 1];
  const stock = {
    symbol: 'TATASTEEL',
    name: 'Tata Steel',
    sector: 'Metals',
    price: last.close,
    changePercent: -1.65,
    bidAskRatio: 0.72,
    volume: 500000,
  } as unknown as ScannedStock;

  const { sellRow } = evaluateStockFinUrlStrategy({
    stock,
    bars,
    sectorChangePct: -0.9,
    istDateStr: '2026-11-18',
    istTimeStr: '10:05:00',
  });

  assert.ok(sellRow !== null);
  assert.equal(sellRow!.direction, 'SELL');
  assert.equal(sellRow!.allSixMet, true, `Failed: ${JSON.stringify(sellRow!.conditions.filter((c) => !c.passed))}`);
  assert.ok(sellRow!.score >= 85);
  assert.equal(sellRow!.classification, 'Strong SELL');
  assert.equal(sellRow!.entryPrice, Number(last.low.toFixed(2)));
  assert.ok(sellRow!.stopLoss > Math.max(sellRow!.fvg!.top, last.high));
  assert.ok(sellRow!.target1 < sellRow!.entryPrice);
  assert.ok(sellRow!.target2 < sellRow!.target1);
  assert.ok(sellRow!.target3 < sellRow!.target2);
});

test('buildSmartMoneyFlowReport respects isMidnightCleared and returns zero signals when flushed', () => {
  const bars = buildBullishFvgRetestBars();
  const stock = {
    symbol: 'RELIANCE',
    name: 'Reliance Industries',
    sector: 'Energy',
    price: bars[bars.length - 1].close,
    changePercent: 1.5,
    bidAskRatio: 1.3,
    volume: 300000,
  } as unknown as ScannedStock;

  const cleared = buildSmartMoneyFlowReport(
    [stock],
    () => bars as any,
    new Map(),
    true,
    { price: 25200, vwap: 25150 }
  );
  assert.equal(cleared.isMidnightCleared, true);
  assert.equal(cleared.buySignals.length, 0);
  assert.equal(cleared.sellSignals.length, 0);
});
