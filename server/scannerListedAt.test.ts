import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStockScanner } from '../src/utils/technicalAnalysis';
import type { Candle } from '../src/types';

test('evaluateStockScanner smooths partial forming-bar volume so RVOL stays accurate instead of crashing near 0', () => {
  const candles: Candle[] = [];
  for (let i = 0; i < 20; i++) {
    const px = 1000 + i * 0.8;
    candles.push({
      time: `09:${String(15 + i * 5).padStart(2, '0')}:00`,
      open: px - 0.5,
      high: px + 1.2,
      low: px - 1.0,
      close: px,
      volume: 10000,
    });
  }
  // Previous completed bar had 2.0x surge (20,000), while active forming bar only has 500 volume so far
  candles.push({
    time: '10:55:00',
    open: 1016,
    high: 1020,
    low: 1015,
    close: 1019.5,
    volume: 20000,
  });
  candles.push({
    time: '11:00:00',
    open: 1019.5,
    high: 1022,
    low: 1019,
    close: 1021.5,
    volume: 500,
  });

  const res = evaluateStockScanner('TESTBUY', 'Test Buy Ltd', 'Auto', candles, 1022, 998, 995, 0.8, 0.4);
  assert.ok(res.indicators.rvol >= 1.2, `Expected RVOL >= 1.2 on partial forming bar, got ${res.indicators.rvol}`);
  assert.equal(res.indicators.foxTrendStatus, 'BULLISH');
  assert.equal(res.signal, 'BUY');
});

test('evaluateStockScanner flips iterative FoxTrend / Supertrend to BEARISH and generates SELL on strong downtrend', () => {
  const candles: Candle[] = [];
  for (let i = 0; i < 12; i++) {
    const px = 502 + (i % 2 === 0 ? 0.4 : -0.2);
    candles.push({
      time: `09:${String(15 + i * 5).padStart(2, '0')}:00`,
      open: px - 0.2,
      high: px + 0.8,
      low: px - 0.7,
      close: px,
      volume: 8000,
    });
  }
  let px = 502;
  for (let i = 0; i < 16; i++) {
    // Net downtrend with relief bounces so RSI lands ~35-42 inside 32-48 sell band
    const delta = i % 2 === 1 ? 0.65 : -1.25;
    const prevPx = px;
    px = Number((px + delta).toFixed(2));
    candles.push({
      time: `${i < 5 ? '10' : '11'}:${String(((i * 5 + 15) % 60)).padStart(2, '0')}:00`,
      open: prevPx,
      high: Math.max(prevPx, px) + 0.6,
      low: Math.min(prevPx, px) - 0.7,
      close: px,
      volume: i >= 13 ? 22000 : 10000,
    });
  }

  const res = evaluateStockScanner('INFY', 'Infosys Ltd', 'IT', candles, 505, px - 1, 505, -2.5, -1.2);
  assert.equal(res.indicators.foxTrendStatus, 'BEARISH', 'Expected iterative Supertrend to flip BEARISH on downtrend');
  assert.ok(res.indicators.rvol >= 1.2, `Expected RVOL >= 1.2, got ${res.indicators.rvol}`);
  assert.equal(res.signal, 'SELL', `Expected SELL signal on strong downtrend, got ${res.signal} (score ${res.aiScore}, rsi ${res.indicators.rsi}, adx ${res.indicators.adx})`);
});

test('evaluateStockScanner keeps strong relative-strength BUY leaders active during mild bearish NIFTY drift', () => {
  const candles: Candle[] = [];
  for (let i = 0; i < 12; i++) {
    const px = 1000 + (i % 2 === 0 ? 0.5 : -0.2);
    candles.push({
      time: `09:${String(15 + i * 5).padStart(2, '0')}:00`,
      open: px - 0.3,
      high: px + 0.9,
      low: px - 0.7,
      close: px,
      volume: 10000,
    });
  }
  let px = 1001;
  for (let i = 0; i < 16; i++) {
    const delta = i % 3 === 1 ? -0.9 : 2.1;
    const prevPx = px;
    px = Number((px + delta).toFixed(2));
    candles.push({
      time: `${i < 5 ? '10' : '11'}:${String(((i * 5 + 15) % 60)).padStart(2, '0')}:00`,
      open: prevPx,
      high: Math.max(prevPx, px) + 0.8,
      low: Math.min(prevPx, px) - 0.5,
      close: px,
      volume: i >= 13 ? 32000 : 12000,
    });
  }

  // Nifty is mildly negative (-0.28%), while stock + sector are strongly bullish
  const res = evaluateStockScanner('MAXHEALTH', 'Max Healthcare', 'Healthcare', candles, px + 1, 994, 990, 1.2, -0.28);
  assert.equal(res.indicators.foxTrendStatus, 'BULLISH');
  assert.ok(res.aiScore >= 75, `Expected aiScore >= 75, got ${res.aiScore} (rsi ${res.indicators.rsi})`);
  assert.equal(res.signal, 'BUY', `Expected strong relative-strength leader to get BUY, got ${res.signal}`);
});

