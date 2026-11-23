import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BTST_ASSIGNED_AI_AGENT,
  BTST_WINDOW_CONFIG,
  BtstScannerManager,
  evaluateBtstCandidate,
  getBtstWindowStatus,
} from './btstScannerEngine';
import { ScannedStock } from '../src/types';
import { IntradayCandleBar } from './autonomousPriceService';

function istDate(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}+05:30`);
}

function makeBars(
  direction: 'UP' | 'DOWN' | 'FLAT',
  basePrice: number,
  dateIST = '2026-11-20'
): IntradayCandleBar[] {
  const bars: IntradayCandleBar[] = [];
  let p = basePrice;
  const startMin = 9 * 60 + 20;
  for (let i = 0; i < 68; i++) {
    const m = startMin + i * 5;
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    const step = direction === 'UP' ? basePrice * 0.00055 : direction === 'DOWN' ? -basePrice * 0.00055 : 0;
    const o = p;
    const c = Math.max(10, o + step);
    const h = Math.max(o, c) * (direction === 'UP' ? 1.0012 : 1.0025);
    const l = Math.min(o, c) * (direction === 'DOWN' ? 0.9988 : 0.9975);
    const isClosingSurge = i >= 63;
    const vol = isClosingSurge
      ? direction === 'FLAT'
        ? 45000
        : 240000
      : 60000;
    const secIST = m * 60;
    const tsSec = Math.floor(istDate(dateIST, `${hh}:${mm}:00`).getTime() / 1000);
    bars.push({
      tsSec,
      secIST,
      timeIST: `${hh}:${mm}:00`,
      dateIST,
      open: Number(o.toFixed(2)),
      high: Number(h.toFixed(2)),
      low: Number(l.toFixed(2)),
      close: Number(c.toFixed(2)),
      volume: vol,
    });
    p = c;
  }
  return bars;
}

function makeStock(overrides: Record<string, any>): ScannedStock {
  return {
    symbol: 'RELIANCE',
    name: 'Reliance Industries',
    sector: 'Energy',
    price: 2980,
    change: 80,
    changePercent: 2.76,
    listedAt: '14:55:00',
    indicators: {
      price: 2980,
      open: 2905,
      high: 2988,
      low: 2898,
      close: 2980,
      volume: 9500000,
      avgVolume20: 2800000,
      rvol: 3.39,
      xTimeVolume: 2.4,
      vwap: 2942,
      ema9: 2968,
      ema13: 2960,
      ema21: 2948,
      ema34: 2935,
      ema50: 2920,
      rsi: 68,
      adx: 34.5,
      atr: 28,
      supertrend: 2930,
      supertrendDirection: 'BUY',
    },
    oiData: {
      openInterest: 35,
      changeInOI: 3.2,
      changeInOIPercent: 9.2,
      pcr: 1.25,
      buildup: 'LONG_BUILDUP',
      maxPainStrike: 2950,
      totalCallOI: 14,
      totalPutOI: 18,
      atmStrike: 2980,
      optionChain: [],
    },
    score: 88,
    signal: 'BUY',
    ...overrides,
  } as unknown as ScannedStock;
}

test('getBtstWindowStatus accurately classifies 2:45-3:20 PM Prime Window, Pre-Window, Lock & 23:59 Flush', () => {
  const preWindow = getBtstWindowStatus(istDate('2026-11-20', '11:30:00'), false);
  assert.equal(preWindow.phase, 'PRE_WINDOW_WATCH');
  assert.equal(preWindow.isPrimeWindow, false);
  assert.equal(preWindow.isFlushCleared, false);
  assert.ok(preWindow.minutesToPrimeWindow > 0);

  const primeStart = getBtstWindowStatus(istDate('2026-11-20', '14:45:00'), false);
  assert.equal(primeStart.phase, 'PRIME_BTST_WINDOW');
  assert.equal(primeStart.isPrimeWindow, true);
  assert.equal(primeStart.minutesRemainingInWindow, 35);

  const primeMid = getBtstWindowStatus(istDate('2026-11-20', '15:10:00'), false);
  assert.equal(primeMid.phase, 'PRIME_BTST_WINDOW');
  assert.equal(primeMid.isPrimeWindow, true);
  assert.equal(primeMid.minutesRemainingInWindow, 10);

  const lockedAfter = getBtstWindowStatus(istDate('2026-11-20', '15:25:00'), false);
  assert.equal(lockedAfter.phase, 'CLOSING_LOCKED');
  assert.equal(lockedAfter.isLockedForOvernight, true);
  assert.equal(lockedAfter.isFlushCleared, false);

  const flushedNight = getBtstWindowStatus(istDate('2026-11-20', '23:59:10'), false);
  assert.equal(flushedNight.phase, 'FLUSHED_EMPTY');
  assert.equal(flushedNight.isFlushCleared, true);

  const offDay = getBtstWindowStatus(istDate('2026-11-21', '14:00:00'), true);
  assert.equal(offDay.phase, 'OFF_DAY_SNAPSHOT');
  assert.equal(offDay.isFlushCleared, false);
});

test('evaluateBtstCandidate qualifies strong UP (BTST) & DOWN (STBT) stocks and rejects weak/fake signals', () => {
  const win = getBtstWindowStatus(istDate('2026-11-20', '15:00:00'), false);

  // 1. Strong UP BTST candidate
  const upBars = makeBars('UP', 2900);
  const upLast = upBars[upBars.length - 1];
  const upStock = makeStock({
    symbol: 'TRENT',
    price: upLast.close,
    changePercent: Number((((upLast.close - 2900) / 2900) * 100).toFixed(2)),
    indicators: {
      price: upLast.close,
      open: 2900,
      high: upLast.high,
      low: 2895,
      close: upLast.close,
      volume: 8500000,
      rvol: 3.4,
      xTimeVolume: 2.5,
      vwap: upLast.close * 0.988,
      ema9: upLast.close * 0.996,
      ema21: upLast.close * 0.99,
      adx: 34,
      atr: 30,
    },
  });

  const upEval = evaluateBtstCandidate({
    stock: upStock,
    bars: upBars.map((b) => ({ ...b, secIST: 14 * 3600 + 55 * 60 })),
    rawBars: upBars,
    windowStatus: win,
  });
  assert.ok(upEval, 'Expected strong UP stock to qualify for BTST');
  assert.equal(upEval.direction, 'BUY');
  assert.equal(upEval.setupType, 'BTST_LONG');
  assert.equal(upEval.agentId, BTST_ASSIGNED_AI_AGENT.agentId);
  assert.equal(upEval.agentName, 'Vedant AI');
  assert.ok(upEval.clv >= BTST_WINDOW_CONFIG.MIN_CLV_UP);
  assert.ok(upEval.overnightStopLoss < upEval.entryPrice);
  assert.ok(upEval.nextDayTarget1 > upEval.entryPrice);
  assert.ok(upEval.nextDayTarget2 > upEval.nextDayTarget1);

  // 2. Strong DOWN STBT candidate
  const dnBars = makeBars('DOWN', 1800);
  const dnLast = dnBars[dnBars.length - 1];
  const dnStock = makeStock({
    symbol: 'INDUSINDBK',
    price: dnLast.close,
    changePercent: Number((((dnLast.close - 1800) / 1800) * 100).toFixed(2)),
    oiData: {
      openInterest: 22,
      changeInOI: 2.4,
      changeInOIPercent: 11.4,
      pcr: 0.62,
      buildup: 'SHORT_BUILDUP',
      maxPainStrike: 1780,
      totalCallOI: 16,
      totalPutOI: 10,
      atmStrike: 1750,
      optionChain: [],
    },
    indicators: {
      price: dnLast.close,
      open: 1800,
      high: 1804,
      low: dnLast.low,
      close: dnLast.close,
      volume: 6500000,
      rvol: 3.2,
      xTimeVolume: 2.3,
      vwap: dnLast.close * 1.012,
      ema9: dnLast.close * 1.004,
      ema21: dnLast.close * 1.01,
      adx: 36,
      atr: 22,
    },
  });

  const dnEval = evaluateBtstCandidate({
    stock: dnStock,
    bars: dnBars.map((b) => ({ ...b, secIST: 15 * 3600 + 5 * 60 })),
    rawBars: dnBars,
    windowStatus: win,
  });
  assert.ok(dnEval, 'Expected strong DOWN stock to qualify for STBT');
  assert.equal(dnEval.direction, 'SELL');
  assert.equal(dnEval.setupType, 'STBT_SHORT');
  assert.ok(dnEval.clv <= BTST_WINDOW_CONFIG.MAX_CLV_DOWN);
  assert.ok(dnEval.overnightStopLoss > dnEval.entryPrice);
  assert.ok(dnEval.nextDayTarget1 < dnEval.entryPrice);
  assert.ok(dnEval.nextDayTarget2 < dnEval.nextDayTarget1);

  // 3. Reject weak RVOL / mid-range stock (ZERO fake signals)
  const weakStock = makeStock({
    symbol: 'WEAKCO',
    price: 1015,
    changePercent: 1.5,
    indicators: {
      price: 1015,
      open: 1000,
      high: 1040,
      low: 990,
      close: 1015,
      volume: 100000,
      rvol: 1.15,
      xTimeVolume: 0.7,
      vwap: 1010,
      ema9: 1012,
      ema21: 1010,
      adx: 18,
      atr: 10,
    },
  });
  const weakBars = makeBars('FLAT', 1000);
  const weakEval = evaluateBtstCandidate({
    stock: weakStock,
    bars: weakBars.map((b) => ({ ...b, secIST: 14 * 3600 + 50 * 60 })),
    rawBars: weakBars,
    windowStatus: win,
  });
  assert.equal(weakEval, null, 'Weak/mid-range/low-RVOL stock must NOT produce a fake BTST signal');
});

test('BtstScannerManager enforces Best 10 cap, sticky lock, LISTED AT Z->A order, and 23:59 flush', () => {
  const manager = new BtstScannerManager();
  const stocks: ScannedStock[] = [];
  const barsBySym = new Map<string, IntradayCandleBar[]>();

  const upSymbols = ['ADANIENT', 'BAJFINANCE', 'CIPLA', 'DLF', 'EICHERMOT', 'GAIL', 'HAL', 'INFY', 'JSWSTEEL', 'LT', 'M&M', 'NTPC', 'ZOMATO'];
  const dnSymbols = ['AXISBANK', 'BPCL', 'COALINDIA', 'DABUR', 'GRASIM', 'HDFCBANK', 'ICICIBANK', 'KOTAKBANK', 'LUPIN', 'MARUTI', 'SBIN', 'WIPRO'];

  upSymbols.forEach((sym, idx) => {
    const base = 1000 + idx * 50;
    const bars = makeBars('UP', base);
    const last = bars[bars.length - 1];
    barsBySym.set(sym, bars);
    stocks.push(
      makeStock({
        symbol: sym,
        price: last.close,
        changePercent: Number((((last.close - base) / base) * 100).toFixed(2)),
        indicators: {
          price: last.close,
          open: base,
          high: last.high,
          low: base * 0.998,
          close: last.close,
          volume: 6000000,
          rvol: 3.1 + idx * 0.1,
          xTimeVolume: 2.2,
          vwap: last.close * 0.986,
          ema9: last.close * 0.996,
          ema21: last.close * 0.99,
          adx: 34,
          atr: 18,
        },
      })
    );
  });

  dnSymbols.forEach((sym, idx) => {
    const base = 1200 + idx * 40;
    const bars = makeBars('DOWN', base);
    const last = bars[bars.length - 1];
    barsBySym.set(sym, bars);
    stocks.push(
      makeStock({
        symbol: sym,
        price: last.close,
        changePercent: Number((((last.close - base) / base) * 100).toFixed(2)),
        oiData: {
          openInterest: 18,
          changeInOI: 1.5,
          changeInOIPercent: 8.5,
          pcr: 0.68,
          buildup: 'SHORT_BUILDUP',
          maxPainStrike: base,
          totalCallOI: 12,
          totalPutOI: 8,
          atmStrike: base,
          optionChain: [],
        },
        indicators: {
          price: last.close,
          open: base,
          high: base * 1.002,
          low: last.low,
          close: last.close,
          volume: 5500000,
          rvol: 3.0 + idx * 0.1,
          xTimeVolume: 2.1,
          vwap: last.close * 1.014,
          ema9: last.close * 1.004,
          ema21: last.close * 1.01,
          adx: 35,
          atr: 20,
        },
      })
    );
  });

  const report = manager.syncAndBuildReport({
    allStocks: stocks,
    getExtendedBarsFn: (sym) => barsBySym.get(sym),
    now: istDate('2026-11-20', '15:02:00'),
    isMarketOffDay: false,
    bypassCache: true,
  });

  assert.equal(report.window.phase, 'PRIME_BTST_WINDOW');
  assert.equal(report.agent.name, 'Vedant AI');
  assert.equal(report.upPicks.length, 10, 'UP picks must be strictly capped at Best 10');
  assert.equal(report.downPicks.length, 10, 'DOWN picks must be strictly capped at Best 10');

  for (let i = 1; i < report.upPicks.length; i++) {
    const prev = report.upPicks[i - 1];
    const curr = report.upPicks[i];
    if (prev.listedAtSec === curr.listedAtSec) {
      assert.ok(prev.symbol.localeCompare(curr.symbol) >= 0, 'Same-time picks must sort Z -> A');
    } else {
      assert.ok(prev.listedAtSec >= curr.listedAtSec, 'Listed At must sort newest first');
    }
  }

  const firstUpSym = report.upPicks[0].symbol;
  const bumpedStocks = stocks.map((s) =>
    s.symbol === firstUpSym ? { ...s, price: Number((s.price * 1.02).toFixed(2)) } : s
  );
  const refreshed = manager.syncAndBuildReport({
    allStocks: bumpedStocks,
    getExtendedBarsFn: (sym) => barsBySym.get(sym),
    now: istDate('2026-11-20', '15:18:00'),
    isMarketOffDay: false,
    bypassCache: true,
  });
  const tracked = refreshed.upPicks.find((r) => r.symbol === firstUpSym);
  assert.ok(tracked, 'Locked UP pick must persist until 23:59 flush');
  assert.ok(tracked.livePnlRs > 0, 'Live P&L should update cleanly when LTP moves favorably');

  const flushed = manager.syncAndBuildReport({
    allStocks: stocks,
    getExtendedBarsFn: (sym) => barsBySym.get(sym),
    now: istDate('2026-11-20', '23:59:15'),
    isMarketOffDay: false,
    bypassCache: true,
  });
  assert.equal(flushed.isMidnightCleared, true);
  assert.equal(flushed.upPicks.length, 0);
  assert.equal(flushed.downPicks.length, 0);
});
