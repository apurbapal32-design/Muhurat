import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getLockedSessionWindowStatus,
  isTimeWithinScanWindow,
  LOCKED_SYSTEM_RULES,
  passesRule3Thresholds,
} from './systemFiveRules';
import { StickyScannerRegistry } from './scannerUniversalGate';
import { DualAiTradeManagerDesk } from './aiTradeManagerAgent';
import type { Candle, ScannedStock } from '../src/types';

function makeISTDate(dateStr: string, timeStr: string): Date {
  return new Date(`${dateStr}T${timeStr}+05:30`);
}

function makeStrongBars(count = 24, startPrice = 500, step = 1.5, baseVol = 100_000, spikeVol = 320_000): Candle[] {
  const bars: Candle[] = [];
  let px = startPrice;
  for (let i = 0; i < count; i++) {
    const open = px;
    const close = Number((open + step).toFixed(2));
    const hh = 9 + Math.floor((20 + i * 5) / 60);
    const mm = (20 + i * 5) % 60;
    bars.push({
      time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`,
      open,
      high: Number((Math.max(open, close) + Math.abs(step) * 0.3).toFixed(2)),
      low: Number((Math.min(open, close) - Math.abs(step) * 0.15).toFixed(2)),
      close,
      volume: i >= count - 2 ? spikeVol : baseVol,
    });
    px = close;
  }
  return bars;
}

function makeStock(
  symbol: string,
  side: 'BUY' | 'SELL',
  price: number,
  listedAt: string,
  opts?: { rvol?: number; xTimeVolume?: number; adx?: number; entry?: number; stop?: number }
): ScannedStock {
  const rvol = opts?.rvol ?? 2.8;
  const xTimeVolume = opts?.xTimeVolume ?? 2.1;
  const adx = opts?.adx ?? 32;
  const entry = opts?.entry ?? price;
  const stop = opts?.stop ?? (side === 'BUY' ? Number((entry * 0.99).toFixed(2)) : Number((entry * 1.01).toFixed(2)));
  return {
    symbol,
    name: symbol,
    sector: 'NSE F&O',
    price,
    change: side === 'BUY' ? 12 : -12,
    changePercent: side === 'BUY' ? 1.8 : -1.8,
    volume: 4_000_000,
    signal: side,
    aiScore: 88,
    listedAt,
    fixedEntryPrice: entry,
    fixedStopLoss: stop,
    scoreBreakdown: { vwap: 8, emaTrend: 8, rsi: 6, adx: 6, volume: 6, rvol: 6, oiScore: 12, priceAction: 5 },
    indicators: {
      price,
      open: price,
      high: price * 1.01,
      low: price * 0.99,
      close: price,
      volume: 4_000_000,
      avgVolume20: 1_400_000,
      ema13: price,
      ema21: price,
      ema34: price,
      vwap: price,
      rsi: side === 'BUY' ? 66 : 34,
      macd: 1,
      macdSignal: 0.5,
      macdHist: 0.5,
      adx,
      atr: price * 0.008,
      supertrend: price,
      supertrendDirection: side,
      bbUpper: price * 1.02,
      bbMiddle: price,
      bbLower: price * 0.98,
      rvol,
      xTimeVolume,
      volumeBreakout: true,
      pdh: price,
      pdl: price,
      cprPivot: price,
      cprBC: price,
      cprTC: price,
      pivotR1: price,
      pivotS1: price,
      pivotR2: price,
      pivotS2: price,
      swingHigh: price,
      swingLow: price,
    },
    risk: {
      entryPrice: entry,
      stopLoss: stop,
      target1: side === 'BUY' ? Number((entry * 1.015).toFixed(2)) : Number((entry * 0.985).toFixed(2)),
      target2: side === 'BUY' ? Number((entry * 1.025).toFixed(2)) : Number((entry * 0.975).toFixed(2)),
      riskAmount: 5000,
      rewardAmountT1: 7500,
      rewardAmountT2: 12500,
      riskRewardRatio: 2.5,
      recommendedQty: 100,
      positionValue: price * 100,
      marginRequired: price * 20,
    },
    lastUpdated: new Date().toISOString(),
    keyTriggers: [],
  };
}

test('RULE 1 LOCKED: 09:20–15:15 IST live scan window and exact 23:59:00 IST (11:59 PM) daily auto-flush', () => {
  // 09:19:59 IST -> Empty / Flushed awaiting 09:20
  const beforeStart = getLockedSessionWindowStatus(makeISTDate('2026-11-20', '09:19:59'), false);
  assert.equal(beforeStart.isFlushCleared, true);
  assert.equal(beforeStart.isLiveScanWindow, false);
  assert.equal(beforeStart.phase, 'FLUSHED_EMPTY');

  // 09:20:00 IST -> Live Scan Opens
  const atStart = getLockedSessionWindowStatus(makeISTDate('2026-11-20', '09:20:00'), false);
  assert.equal(atStart.isFlushCleared, false);
  assert.equal(atStart.isLiveScanWindow, true);
  assert.equal(atStart.phase, 'LIVE_SCAN_OPEN');

  // 15:15:00 IST -> Final second of Live Scan Window
  const atEnd = getLockedSessionWindowStatus(makeISTDate('2026-11-20', '15:15:00'), false);
  assert.equal(atEnd.isFlushCleared, false);
  assert.equal(atEnd.isLiveScanWindow, true);

  // 15:15:01 IST -> Post-Scan Locked (stocks remain visible & locked until 23:59)
  const postCutoff = getLockedSessionWindowStatus(makeISTDate('2026-11-20', '15:15:01'), false);
  assert.equal(postCutoff.isFlushCleared, false);
  assert.equal(postCutoff.isLiveScanWindow, false);
  assert.equal(postCutoff.isPostScanLocked, true);
  assert.equal(postCutoff.isSquareOffReached, true);

  // 23:58:59 IST -> Still visible right before 11:59 PM
  const beforeFlush = getLockedSessionWindowStatus(makeISTDate('2026-11-20', '23:58:59'), false);
  assert.equal(beforeFlush.isFlushCleared, false);

  // 23:59:00 IST -> EXACT 11:59 PM Auto-Flush empties EVERYTHING (even on off-day!)
  const atFlush = getLockedSessionWindowStatus(makeISTDate('2026-11-20', '23:59:00'), false);
  assert.equal(atFlush.isFlushCleared, true);
  assert.equal(atFlush.phase, 'FLUSHED_EMPTY');

  const offDayFlush = getLockedSessionWindowStatus(makeISTDate('2026-11-21', '23:59:00'), true);
  assert.equal(offDayFlush.isFlushCleared, true);

  // Scan window timestamp checker
  assert.equal(isTimeWithinScanWindow('09:19:59'), false);
  assert.equal(isTimeWithinScanWindow('09:20:00'), true);
  assert.equal(isTimeWithinScanWindow('15:15:00'), true);
  assert.equal(isTimeWithinScanWindow('15:15:01'), false);
});

test('RULE 2 & RULE 4 LOCKED: 0..10 Best UP/DOWN (zero fake signals), already-listed stocks never evicted by 11th stock, sorted Z->A', () => {
  const registry = new StickyScannerRegistry();
  const strongBars = makeStrongBars(24, 500, 1.5, 100_000, 320_000);

  // Case A: 0 eligible -> 0 shown (zero fake signals)
  const zeroOut = registry.filterAndStabilizeRows({
    scannerKey: 'rule2-test:zero',
    rows: [],
    liveStockMap: new Map(),
    getBarsFn: () => strongBars,
    isMidnightCleared: false,
    dateIST: '2026-11-20',
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'BUY',
  });
  assert.equal(zeroOut.length, 0);

  // Case B: 7 eligible -> exactly 7 shown
  const sevenSyms = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA', 'ECHO', 'FOXTROT', 'GOLF'];
  const liveMap7 = new Map<string, ScannedStock>(
    sevenSyms.map((sym, idx) => [sym, makeStock(sym, 'BUY', 520 + idx, `10:0${idx}:00`)])
  );
  const sevenOut = registry.filterAndStabilizeRows({
    scannerKey: 'rule2-test:seven',
    rows: sevenSyms.map((sym, idx) => ({
      symbol: sym,
      price: 520 + idx,
      listedAt: `10:0${idx}:00`,
      rvol: 2.5,
      xTimeVolume: 1.8,
      adx: 30,
    })),
    liveStockMap: liveMap7,
    getBarsFn: () => strongBars,
    isMidnightCleared: false,
    dateIST: '2026-11-20',
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'BUY',
  });
  assert.equal(sevenOut.length, 7);
  assert.equal(sevenOut[0].symbol, 'GOLF', 'Latest listedAt (10:06:00) must be first');
  assert.equal(sevenOut[6].symbol, 'ALPHA', 'Earliest listedAt (10:00:00) must be last');

  // Case C: 14 eligible -> capped strictly to Best 10; then a 15th arrival MUST NOT evict any of the 10 locked stocks!
  const syms14 = Array.from({ length: 14 }, (_, i) => `STK${String(i + 1).padStart(2, '0')}`);
  const liveMap14 = new Map<string, ScannedStock>(
    syms14.map((sym, idx) => [sym, makeStock(sym, 'BUY', 600 + idx, `10:${String(10 + idx).padStart(2, '0')}:00`)])
  );
  const cap10 = registry.filterAndStabilizeRows({
    scannerKey: 'rule2-test:best10',
    rows: syms14.map((sym, idx) => ({
      symbol: sym,
      price: 600 + idx,
      listedAt: `10:${String(10 + idx).padStart(2, '0')}:00`,
      rvol: 2.8,
      xTimeVolume: 2.0,
      adx: 32,
    })),
    liveStockMap: liveMap14,
    getBarsFn: () => strongBars,
    isMidnightCleared: false,
    dateIST: '2026-11-20',
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'BUY',
  });
  assert.equal(cap10.length, LOCKED_SYSTEM_RULES.MAX_STOCKS_PER_DIRECTION);
  const lockedSet = new Set(cap10.map((r) => r.symbol));
  assert.equal(lockedSet.size, 10);

  // Next refresh sends a brand-new 15th stock 'ZEBRA' at 14:55:00 -> MUST NOT evict any of the 10 already-listed stocks!
  liveMap14.set('ZEBRA', makeStock('ZEBRA', 'BUY', 999, '14:55:00'));
  const afterNewArrival = registry.filterAndStabilizeRows({
    scannerKey: 'rule2-test:best10',
    rows: [{ symbol: 'ZEBRA', price: 999, listedAt: '14:55:00', rvol: 5.0, xTimeVolume: 4.0, adx: 45 }],
    liveStockMap: liveMap14,
    getBarsFn: () => strongBars,
    isMidnightCleared: false,
    dateIST: '2026-11-20',
    getSymbol: (r: any) => r.symbol,
    getSide: () => 'BUY',
  });
  assert.equal(afterNewArrival.length, 10);
  assert.equal(
    afterNewArrival.some((r) => r.symbol === 'ZEBRA'),
    false,
    'Rule 4: Brand-new 11th stock must NEVER evict an already-listed stock'
  );
  for (const sym of lockedSet) {
    assert.ok(afterNewArrival.some((r) => r.symbol === sym), `Already-listed ${sym} must stay locked`);
  }
});

test('RULE 3 LOCKED: Strict RVOL > 2.00 AND Volume Bazaar X-Time > 1.00X AND ADX >= 25', () => {
  assert.equal(passesRule3Thresholds(2.01, 1.01, 25.0).passedAll, true);
  assert.equal(passesRule3Thresholds(2.0, 1.5, 30.0).passedAll, false, 'RVOL == 2.00 must fail (must be strictly > 2.00)');
  assert.equal(passesRule3Thresholds(2.5, 1.0, 30.0).passedAll, false, 'Vol Bazaar X-Time == 1.00 must fail (must be strictly > 1.00)');
  assert.equal(passesRule3Thresholds(2.5, 1.25, 24.9).passedAll, false, 'ADX < 25 must fail');
});

test('DUAL AI TRADE MANAGEMENT DESK (Aryan AI [He] & Aria AI [She]): Entry, Breakeven Trail, T1/T2 Exit, SL Guard, 15:15 Exit & 23:59 Flush', () => {
  const desk = new DualAiTradeManagerDesk();
  const liveScanTime = makeISTDate('2026-11-20', '10:30:00');

  // 1. Aryan AI (He) admits 1 UP (RELIANCE) + 1 DOWN (WIPRO) strictly passing Rule 3
  const relBuy = makeStock('RELIANCE', 'BUY', 1000, '10:15:00', { entry: 1000, stop: 990, rvol: 2.9, xTimeVolume: 1.8, adx: 34 });
  const wipSell = makeStock('WIPRO', 'SELL', 500, '10:20:00', { entry: 500, stop: 505, rvol: 2.6, xTimeVolume: 1.5, adx: 29 });

  const rep1 = desk.syncAndBuildReport({
    topBuyStocks: [relBuy],
    topSellStocks: [wipSell],
    allStocks: [relBuy, wipSell],
    now: liveScanTime,
    upstoxConnected: true,
  });

  assert.equal(rep1.agents.he.name, 'Aryan AI');
  assert.equal(rep1.agents.she.name, 'Aria AI');
  assert.equal(rep1.summary.totalManaged, 2);
  assert.equal(rep1.summary.upCount, 1);
  assert.equal(rep1.summary.downCount, 1);
  assert.equal(rep1.allTrades[0].symbol, 'WIPRO', 'Rule 4: Latest LISTED AT (10:20:00) sorted first');
  assert.equal(rep1.upTrades[0].actionStatus, 'HOLD_ACTIVE');

  // 2. RELIANCE moves +1.1R (1000 -> 1011, risk=10): Aria AI (She) auto-moves SL to Breakeven!
  //    WIPRO drops +2.6R (500 -> 487, risk=5): Aria AI (She) books T2 FULL PROFIT EXIT without removing WIPRO!
  const relTrail = makeStock('RELIANCE', 'BUY', 1011, '10:15:00', { entry: 1000, stop: 990 });
  const wipT2 = makeStock('WIPRO', 'SELL', 487, '10:20:00', { entry: 500, stop: 505 });

  const rep2 = desk.syncAndBuildReport({
    topBuyStocks: [], // Even if scanner refresh omits them, Rule 4 retains them!
    topSellStocks: [],
    allStocks: [relTrail, wipT2],
    now: makeISTDate('2026-11-20', '11:45:00'),
    upstoxConnected: true,
  });

  assert.equal(rep2.summary.totalManaged, 2, 'Rule 4: Managed stocks never disappear on refresh');
  const relTrade = rep2.upTrades[0];
  assert.equal(relTrade.actionStatus, 'TRAIL_SL_BREAKEVEN');
  assert.ok(relTrade.activeStopLoss > 1000, `Aria AI must move SL above entry breakeven, got ${relTrade.activeStopLoss}`);

  const wipTrade = rep2.downTrades[0];
  assert.equal(wipTrade.actionStatus, 'TARGET_HIT_EXIT');
  assert.equal(wipTrade.isClosed, true);
  assert.ok(wipTrade.livePnlRs > 0, 'T2 hit on SELL trade must lock positive P&L');

  // 3. 15:15:01 IST -> Aria AI issues mandatory intraday square-off for open RELIANCE trade while keeping both visible
  const rep3 = desk.syncAndBuildReport({
    topBuyStocks: [],
    topSellStocks: [],
    allStocks: [relTrail, wipT2],
    now: makeISTDate('2026-11-20', '15:15:01'),
    upstoxConnected: true,
  });
  assert.equal(rep3.upTrades[0].actionStatus, 'TIME_EXIT_1515');
  assert.equal(rep3.summary.totalManaged, 2, 'Still visible after 15:15 until 23:59 flush');

  // 4. 23:59:00 IST -> Complete daily auto-flush empties Dual AI Desk!
  const rep4 = desk.syncAndBuildReport({
    topBuyStocks: [relBuy],
    topSellStocks: [wipSell],
    allStocks: [relBuy, wipSell],
    now: makeISTDate('2026-11-20', '23:59:00'),
    upstoxConnected: true,
  });
  assert.equal(rep4.session.isFlushCleared, true);
  assert.equal(rep4.summary.totalManaged, 0);
  assert.equal(rep4.allTrades.length, 0);
});
