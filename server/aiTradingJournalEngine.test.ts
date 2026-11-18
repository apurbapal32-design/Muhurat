import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AiTradingJournalService,
  closeExpiredPreviousDayTrades,
  computeJournalSummaryAndDays,
  createDefaultJournalState,
  selectDailyAiCandidates,
  updateOpenJournalTrades,
} from './aiTradingJournalEngine';
import { ApexAlphaRow } from './apexAlphaEngine';

function makeApexCandidate(
  symbol: string,
  sector: string,
  side: 'BUY' | 'SELL',
  score: number,
  isQualified: boolean,
  entryPrice = 1000
): ApexAlphaRow {
  const stopLoss = side === 'BUY' ? entryPrice * 0.99 : entryPrice * 1.01;
  const targetPrice = side === 'BUY' ? entryPrice * 1.016 : entryPrice * 0.984;
  return {
    id: `apex-${symbol}-${side}`,
    symbol,
    displayName: symbol,
    sector,
    sectorChangePct: side === 'BUY' ? 1.2 : -1.2,
    side,
    setupType: 'VWAP_COIL',
    setupLabel: `VWAP COIL ${side}`,
    signalBadge: `ALPHA ${side} • COIL`,
    isQualified,
    score,
    maxScore: 8,
    price: entryPrice,
    prevClose: entryPrice * 0.99,
    changePercent: side === 'BUY' ? 1.4 : -1.4,
    niftyChangePct: 0.4,
    rsVsNifty: side === 'BUY' ? 1.0 : -1.8,
    vwap: entryPrice * 0.996,
    pdh: entryPrice * 1.01,
    pdl: entryPrice * 0.985,
    coilHigh: entryPrice,
    coilLow: entryPrice * 0.994,
    coilRangePct: 0.6,
    ema9: entryPrice * 0.998,
    ema21: entryPrice * 0.995,
    ema50: entryPrice * 0.99,
    rsi14: side === 'BUY' ? 62 : 38,
    atr14: 6,
    atr25: 6,
    atr25Pct: 0.6,
    rvol5m: 1.8,
    barVolRatio: 1.9,
    rawVolume: 250000,
    tradedValueCr: 25,
    bidAskRatio: side === 'BUY' ? 1.5 : 0.65,
    orderBookBias: side === 'BUY' ? 'Buyer Dominant' : 'Seller Dominant',
    oiChangePct: 5,
    cycleBuildup: side === 'BUY' ? 'Long Buildup' : 'Short Buildup',
    listedAt: '10:05:00',
    triggerTime: '10:05:00',
    inEntryWindow: true,
    entryPrice,
    stopLoss,
    stopRiskPct: 1.0,
    targetPrice,
    rrMultiple: 1.6,
    rrRatio: '1 : 1.6',
    trailTriggerPrice: side === 'BUY' ? entryPrice + 9 : entryPrice - 9,
    trailLockPrice: side === 'BUY' ? entryPrice + 1.5 : entryPrice - 1.5,
    riskAmount: 1000,
    positionSize: 100,
    conditions: [],
    reasons: ['Regime', 'Sector', 'RS'],
  };
}

test('selectDailyAiCandidates enforces daily 5-trade cap, dedupes symbols, and ranks Tier 1 BUY/SELL first', () => {
  const apexRows: ApexAlphaRow[] = [
    makeApexCandidate('RELIANCE', 'Energy', 'BUY', 8, true, 1300),
    makeApexCandidate('ICICIBANK', 'Banking', 'BUY', 8, true, 1250),
    makeApexCandidate('SBIN', 'Banking', 'BUY', 8, true, 820),
    makeApexCandidate('HDFCBANK', 'Banking', 'BUY', 8, true, 1700), // 3rd banking should yield to other sectors first
    makeApexCandidate('INFY', 'IT', 'SELL', 8, true, 1850),
    makeApexCandidate('TCS', 'IT', 'SELL', 8, true, 4100),
    makeApexCandidate('LT', 'Infra', 'BUY', 7, false, 3600),
  ];

  const picked = selectDailyAiCandidates({
    apexRows,
    claudeFnoRows: [],
    mostActiveRows: [],
    existingTodaySymbols: new Set(['RELIANCE']),
    existingSectorCounts: new Map([['Energy', 1]]),
    slotsRemaining: 4,
    capital: 100000,
    riskPct: 1.0,
    nowSecIST: 10 * 3600 + 30 * 60,
    allowSecondTierAfter1015: true,
    isMarketOffDay: false,
  });

  assert.equal(picked.length, 4);
  assert.equal(picked.some((p) => p.symbol === 'RELIANCE'), false);
  // Both BUY and SELL qualified setups are included within the 5-trade daily budget
  assert.equal(picked.some((p) => p.side === 'BUY'), true);
  assert.equal(picked.some((p) => p.side === 'SELL'), true);
});

test('updateOpenJournalTrades arms +0.90R trail lock then exits on TARGET_HIT with 5-beep event and net P&L', () => {
  const state = createDefaultJournalState();
  state.trades.push({
    id: 'ai-2026-11-18-INFY-BUY-1',
    dateIST: '2026-11-18',
    daySlot: 1,
    source: 'AI_AUTO',
    strategy: 'Apex Alpha Coil (PF 1.87)',
    symbol: 'INFY',
    displayName: 'Infosys',
    sector: 'IT',
    side: 'BUY',
    aiScore: 100,
    convictionLabel: '8/8 VWAP COIL',
    entryTimeIST: '09:45:00',
    entryPrice: 1000,
    stopLoss: 990,
    initialStopLoss: 990,
    trailTriggerPrice: 1009,
    trailLockPrice: 1001.5,
    trailLocked: false,
    targetPrice: 1016,
    rrMultiple: 1.6,
    qty: 100,
    riskAmount: 1000,
    currentPrice: 1000,
    highWatermark: 1000,
    lowWatermark: 1000,
    status: 'OPEN',
    grossPnl: 0,
    pnl: 0,
    rMultiple: 0,
    thesis: '8/8 VWAP Coil',
    createdAtISO: '2026-11-18T04:15:00.000Z',
    updatedAtISO: '2026-11-18T04:15:00.000Z',
  });

  // Step 1: Price reaches +0.95R -> arms trail lock
  const trailEvents = updateOpenJournalTrades({
    state,
    todayDateIST: '2026-11-18',
    nowTimeIST: '10:10:00',
    nowSecIST: 10 * 3600 + 10 * 60,
    isMarketOffDay: false,
    priceLookup: new Map([['INFY', 1009.5]]),
    nowISO: '2026-11-18T04:40:00.000Z',
  });
  assert.equal(trailEvents.length, 1);
  assert.equal(trailEvents[0].eventType, 'AI_TRAIL_LOCK');
  assert.equal(trailEvents[0].beepCount, 5);
  assert.equal(state.trades[0].trailLocked, true);
  assert.equal(state.trades[0].stopLoss, 1001.5);
  assert.equal(state.trades[0].status, 'TRAIL_LOCKED');

  // Step 2: Price hits target 1016 -> exits as WIN
  const targetEvents = updateOpenJournalTrades({
    state,
    todayDateIST: '2026-11-18',
    nowTimeIST: '10:25:00',
    nowSecIST: 10 * 3600 + 25 * 60,
    isMarketOffDay: false,
    priceLookup: new Map([['INFY', 1016]]),
    nowISO: '2026-11-18T04:55:00.000Z',
  });
  assert.equal(targetEvents.length, 1);
  assert.equal(targetEvents[0].eventType, 'AI_EXIT');
  assert.equal(targetEvents[0].exitReason, 'TARGET_HIT');
  assert.equal(targetEvents[0].beepCount, 5);
  assert.ok(targetEvents[0].shareText.includes('INFY'));
  assert.equal(state.trades[0].status, 'WIN');
  assert.ok(state.trades[0].pnl > 1500); // 1600 gross minus ~50.40 cost
});

test('closeExpiredPreviousDayTrades rolls over prior day open trades and aggregates multi-day stats', () => {
  const state = createDefaultJournalState();
  state.trades.push({
    id: 'ai-2026-11-17-SBIN-SELL-1',
    dateIST: '2026-11-17',
    daySlot: 1,
    source: 'AI_AUTO',
    strategy: 'Apex Alpha Reclaim',
    symbol: 'SBIN',
    displayName: 'State Bank',
    sector: 'Banking',
    side: 'SELL',
    aiScore: 100,
    convictionLabel: '8/8 PDL',
    entryTimeIST: '11:00:00',
    entryPrice: 800,
    stopLoss: 808,
    initialStopLoss: 808,
    trailTriggerPrice: 792.8,
    trailLockPrice: 798.8,
    trailLocked: false,
    targetPrice: 788,
    rrMultiple: 1.5,
    qty: 125,
    riskAmount: 1000,
    currentPrice: 792,
    highWatermark: 801,
    lowWatermark: 791,
    status: 'OPEN',
    grossPnl: 1000,
    pnl: 1000,
    rMultiple: 1,
    thesis: 'PDL Breakdown',
    createdAtISO: '2026-11-17T05:30:00.000Z',
    updatedAtISO: '2026-11-17T05:30:00.000Z',
  });

  const events = closeExpiredPreviousDayTrades(
    state,
    '2026-11-18',
    new Map([['SBIN', 790]]),
    '2026-11-18T03:50:00.000Z'
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].exitReason, 'CARRIED_EOD_CLOSE');
  assert.equal(state.trades[0].status, 'WIN');

  const agg = computeJournalSummaryAndDays(state.trades, '2026-11-18', 5, 100000);
  assert.equal(agg.summary.totalTrades, 1);
  assert.equal(agg.summary.wins, 1);
  assert.equal(agg.summary.todayAiCount, 0);
  assert.equal(agg.summary.todayAiRemaining, 5);
  assert.equal(agg.dailySummaries.length, 1);
  assert.equal(agg.dailySummaries[0].dateIST, '2026-11-17');
});

test('AiTradingJournalService persists manual BUY/SELL trades, rejects invalid SL/Target, and closes cleanly', () => {
  const tmpFile = path.join(os.tmpdir(), `test_ai_journal_${Date.now()}.json`);
  try {
    const svc = new AiTradingJournalService(tmpFile);
    assert.throws(() =>
      svc.addManualTrade({
        symbol: 'TCS',
        side: 'BUY',
        entryPrice: 4000,
        stopLoss: 4050, // invalid SL above entry for BUY
        targetPrice: 4100,
      })
    );

    const added = svc.addManualTrade({
      symbol: 'TCS',
      side: 'BUY',
      entryPrice: 4000,
      stopLoss: 3960,
      targetPrice: 4080,
      qty: 25,
      setup: 'VWAP Coil',
    });
    assert.equal(added.event.beepCount, 5);
    assert.equal(added.trade.status, 'OPEN');

    const closed = svc.closeTradeManually(added.trade.id, 4060);
    assert.equal(closed.trade.status, 'WIN');
    assert.ok(closed.trade.pnl > 1400);

    // Reload from disk verifies persistence
    const reloaded = new AiTradingJournalService(tmpFile);
    const rpt = reloaded.getReport(false, false);
    assert.equal(rpt.summary.totalTrades, 1);
    assert.equal(rpt.summary.wins, 1);
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  }
});
