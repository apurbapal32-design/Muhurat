import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AgentManagedTrade,
  AgentScannerReport,
  buildAgentCardViewModel,
  computeAgentSessionPerformance,
  computeFleetRiskSummary,
  computeTradeRealizedPnlRs,
  computeTradeStopLossMetrics,
  deriveAgentOperationalStatus,
  filterAndSortAgents,
  formatWinLossRatio,
  sortAgentSessionPerformanceRows,
} from './agentManagement';

function makeTrade(overrides: Partial<AgentManagedTrade> = {}): AgentManagedTrade {
  return {
    scannerId: 'top-momentum',
    scannerName: 'Top Momentum (Order Flow)',
    agentId: 'AI-AGENT-01',
    agentName: 'Aryan AI',
    agentGender: 'He',
    symbol: 'RELIANCE',
    name: 'Reliance Industries',
    sector: 'Energy',
    side: 'BUY',
    listedAt: '10:15:00',
    formulaReason: 'VWAP + EMA thrust',
    formulaScore: 92,
    liveLtp: 1020,
    changePercent: 2.1,
    rvol: 3.2,
    xTimeVolume: 1.85,
    adx: 34.5,
    entryPrice: 1000,
    initialStopLoss: 980,
    activeStopLoss: 1000,
    target1: 1030,
    target2: 1050,
    positionQty: 50,
    riskCapitalRs: 1000,
    rrPlanned: '1:2.5',
    peakFavorablePrice: 1022,
    liveRMultiple: 1.0,
    livePnlPct: 2.0,
    livePnlRs: 1000,
    actionStatus: 'TRAIL_SL_BREAKEVEN',
    actionBadge: 'TRAIL SL -> BE',
    agentDirective: 'Move stop-loss to breakeven',
    isClosed: false,
    stickyLockedUntilFlush: true,
    ...overrides,
  };
}

function makeReport(overrides: Partial<AgentScannerReport> = {}): AgentScannerReport {
  const trades = overrides.allTrades ?? [makeTrade()];
  const upTrades = trades.filter((t) => t.side === 'BUY');
  const downTrades = trades.filter((t) => t.side === 'SELL');
  return {
    rank: 1,
    scannerId: 'top-momentum',
    scannerName: 'Top Momentum (Order Flow)',
    shortTag: 'UP • DOWN',
    tabId: 'momentum',
    category: 'MOMENTUM',
    formulaSummary: 'VWAP + EMA(13/21) + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-01',
      agentNumber: 1,
      name: 'Aryan AI',
      genderLabel: 'He',
      role: 'Momentum Ignition Entry & Exit Manager',
      specialty: 'High-velocity breakout entries',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.15,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
      status: 'SCANNING',
    },
    summary: {
      totalManaged: trades.length,
      upCount: upTrades.length,
      downCount: downTrades.length,
      activeOpenCount: trades.filter((t) => !t.isClosed).length,
      trailingProtectedCount: trades.filter(
        (t) => t.actionStatus === 'TRAIL_SL_BREAKEVEN' || t.actionStatus === 'BOOK_PARTIAL_T1'
      ).length,
      targetHitCount: trades.filter((t) => t.actionStatus === 'TARGET_HIT_EXIT').length,
      slHitCount: trades.filter((t) => t.actionStatus === 'SL_HIT_EXIT').length,
      winCount: trades.filter((t) => t.livePnlRs > 0).length,
      winRatePct: trades.length > 0 ? 100 : 0,
      totalLivePnlRs: trades.reduce((acc, t) => acc + t.livePnlRs, 0),
      avgRMultiple: 1.0,
    },
    upTrades,
    downTrades,
    allTrades: trades,
    ...overrides,
  };
}

test('computeTradeStopLossMetrics computes BUY trailing SL distance, stage, and ladder coordinates', () => {
  const trade = makeTrade({
    side: 'BUY',
    entryPrice: 1000,
    initialStopLoss: 980,
    activeStopLoss: 1000,
    target2: 1050,
    liveLtp: 1020,
    actionStatus: 'TRAIL_SL_BREAKEVEN',
  });

  const m = computeTradeStopLossMetrics(trade);
  assert.equal(m.slTightened, true);
  assert.equal(m.slStageLabel, 'Breakeven Trail');
  assert.equal(m.slDistanceAbs, 20);
  assert.equal(m.slDistancePct, 1.96);
  assert.equal(m.riskProximity, 'SAFE');
  // span = 1050 - 980 = 70; entry=(20/70)=28.57%, activeSl=28.57%, ltp=(40/70)=57.14%
  assert.equal(m.entryMarkerPct, 28.57);
  assert.equal(m.activeSlMarkerPct, 28.57);
  assert.equal(m.ltpMarkerPct, 57.14);
});

test('computeTradeStopLossMetrics flags CRITICAL tight SL on SELL position near stop-loss', () => {
  const trade = makeTrade({
    side: 'SELL',
    symbol: 'INFY',
    entryPrice: 1500,
    initialStopLoss: 1515,
    activeStopLoss: 1515,
    target1: 1477.5,
    target2: 1462.5,
    liveLtp: 1510,
    actionStatus: 'ENTRY_ACTIVE',
    isClosed: false,
  });

  const m = computeTradeStopLossMetrics(trade);
  assert.equal(m.slTightened, false);
  assert.equal(m.slStageLabel, 'Initial SL');
  assert.equal(m.slDistanceAbs, 5);
  assert.equal(m.slDistancePct, 0.33);
  assert.equal(m.riskProximity, 'CRITICAL');
});

test('deriveAgentOperationalStatus distinguishes flush-cleared, standby, trailing, and guarding states', () => {
  const trailingReport = makeReport();
  assert.equal(deriveAgentOperationalStatus(trailingReport, false).code, 'TRAILING_LOCKED');
  assert.equal(deriveAgentOperationalStatus(trailingReport, true).code, 'FLUSH_CLEARED');

  const standbyReport = makeReport({ allTrades: [] });
  assert.equal(deriveAgentOperationalStatus(standbyReport, false).code, 'STANDBY');

  const resetReport = makeReport({
    allTrades: [],
    agent: { ...makeReport().agent, status: 'STANDBY_RESET' },
  });
  const resetStatus = deriveAgentOperationalStatus(resetReport, false);
  assert.equal(resetStatus.code, 'STANDBY');
  assert.equal(resetStatus.label, 'Reset · Standby');

  const guardingTrade = makeTrade({
    activeStopLoss: 980,
    actionStatus: 'ENTRY_ACTIVE',
  });
  const guardingReport = makeReport({ allTrades: [guardingTrade] });
  assert.equal(deriveAgentOperationalStatus(guardingReport, false).code, 'ACTIVE_GUARDING');
});

test('filterAndSortAgents searches across agent name, scanner name, and managed stock symbols', () => {
  const r1 = makeReport({
    rank: 1,
    scannerId: 'top-momentum',
    scannerName: 'Top Momentum',
    allTrades: [makeTrade({ symbol: 'TCS', liveLtp: 4000, activeStopLoss: 3985, initialStopLoss: 3960 })],
  });
  const r2 = makeReport({
    rank: 20,
    scannerId: 'oi-short-cover',
    scannerName: 'OI Breakout & Short-Cover Trap',
    category: 'FNO_OI',
    agent: {
      agentId: 'AI-AGENT-20',
      agentNumber: 20,
      name: 'Meera AI',
      genderLabel: 'She',
      role: 'Short-Cover Trap Manager',
      specialty: 'OI squeeze traps',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.1,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
      status: 'SCANNING',
    },
    allTrades: [
      makeTrade({
        symbol: 'HDFCBANK',
        side: 'SELL',
        entryPrice: 1700,
        initialStopLoss: 1720,
        activeStopLoss: 1712,
        target2: 1650,
        liveLtp: 1708,
        livePnlRs: -400,
        actionStatus: 'ENTRY_ACTIVE',
      }),
    ],
  });

  const vms = [buildAgentCardViewModel(r1, false), buildAgentCardViewModel(r2, false)];

  // Search by stock symbol inside an agent's stock list
  const bySymbol = filterAndSortAgents(vms, {
    search: 'hdfcbank',
    gender: 'ALL',
    category: 'ALL',
    status: 'ALL',
    sortBy: 'rank',
  });
  assert.equal(bySymbol.length, 1);
  assert.equal(bySymbol[0].report.agent.name, 'Meera AI');

  // Filter by gender She
  const sheOnly = filterAndSortAgents(vms, {
    search: '',
    gender: 'She',
    category: 'ALL',
    status: 'ALL',
    sortBy: 'rank',
  });
  assert.equal(sheOnly.length, 1);
  assert.equal(sheOnly[0].report.scannerId, 'oi-short-cover');

  // Sort by tightest SL puts tighter buffer first (HDFCBANK ~0.23% vs TCS ~0.38%)
  const tightestFirst = filterAndSortAgents(vms, {
    search: '',
    gender: 'ALL',
    category: 'ALL',
    status: 'ALL',
    sortBy: 'tightest_sl',
  });
  assert.equal(tightestFirst[0].report.scannerId, 'oi-short-cover');

  // Fleet summary aggregates open SLs and tight alerts accurately
  const summary = computeFleetRiskSummary(vms);
  assert.equal(summary.totalAgents, 2);
  assert.equal(summary.activeAgents, 2);
  assert.equal(summary.totalOpenStopLosses, 2);
  assert.equal(summary.totalTightSlAlerts, 2);
});

test('computeTradeRealizedPnlRs handles closed T2/SL exits, 50% partial T1 bookings, and open trades', () => {
  const t2Closed = makeTrade({
    isClosed: true,
    actionStatus: 'TARGET_HIT_EXIT',
    livePnlRs: 2500,
  });
  assert.equal(computeTradeRealizedPnlRs(t2Closed), 2500);

  const slClosed = makeTrade({
    isClosed: true,
    actionStatus: 'SL_HIT_EXIT',
    livePnlRs: -950,
  });
  assert.equal(computeTradeRealizedPnlRs(slClosed), -950);

  // BUY entry 1000 -> T1 1030 (+30), qty 50 => 50% booked = 25 * 30 = +750
  const partialT1 = makeTrade({
    side: 'BUY',
    isClosed: false,
    actionStatus: 'BOOK_PARTIAL_T1',
    entryPrice: 1000,
    target1: 1030,
    positionQty: 50,
    livePnlRs: 1600,
  });
  assert.equal(computeTradeRealizedPnlRs(partialT1), 750);

  // Open unbooked position has ₹0 realized profit
  const openTrade = makeTrade({
    isClosed: false,
    actionStatus: 'ENTRY_ACTIVE',
    livePnlRs: 420,
  });
  assert.equal(computeTradeRealizedPnlRs(openTrade), 0);
});

test('computeAgentSessionPerformance calculates Win/Loss ratio, realized profit, fleet totals, and sorting', () => {
  // Agent 1: 2 wins (1 T2 closed +2500, 1 T1 partial booked +750 realized / +1600 live), 1 closed loss (-900)
  // => wins=2, losses=1, W/L ratio = 2.00 : 1, realized = 2500 + 750 - 900 = +2350, total = +3200, unrealized = +850
  const r1 = makeReport({
    rank: 1,
    scannerId: 'top-momentum',
    allTrades: [
      makeTrade({ symbol: 'RELIANCE', isClosed: true, actionStatus: 'TARGET_HIT_EXIT', livePnlRs: 2500 }),
      makeTrade({
        symbol: 'TCS',
        side: 'BUY',
        isClosed: false,
        actionStatus: 'BOOK_PARTIAL_T1',
        entryPrice: 1000,
        target1: 1030,
        positionQty: 50,
        livePnlRs: 1600,
      }),
      makeTrade({ symbol: 'INFY', isClosed: true, actionStatus: 'SL_HIT_EXIT', livePnlRs: -900 }),
    ],
  });

  // Agent 2: 3 wins (all T2 closed +1000 each), 0 losses => perfect 3 : 0 ratio, realized = +3000
  const r2 = makeReport({
    rank: 2,
    scannerId: 'money-flow',
    scannerName: 'Money Flow',
    agent: {
      agentId: 'AI-AGENT-02',
      agentNumber: 2,
      name: 'Aria AI',
      genderLabel: 'She',
      role: 'Money Flow Manager',
      specialty: 'Flow',
      riskPerTradePct: 1,
      atrSlMultiplier: 1.1,
      trailBreakevenR: 1,
      target1R: 1.5,
      target2R: 2.5,
      status: 'SCANNING',
    },
    allTrades: [
      makeTrade({ symbol: 'SBIN', isClosed: true, actionStatus: 'TARGET_HIT_EXIT', livePnlRs: 1000 }),
      makeTrade({ symbol: 'HDFCBANK', isClosed: true, actionStatus: 'TARGET_HIT_EXIT', livePnlRs: 1000 }),
      makeTrade({ symbol: 'ICICIBANK', isClosed: true, actionStatus: 'TARGET_HIT_EXIT', livePnlRs: 1000 }),
    ],
  });

  // Agent 3: 0 trades (Standby)
  const r3 = makeReport({
    rank: 3,
    scannerId: 'most-active-fno',
    scannerName: 'Most Active F&O',
    allTrades: [],
  });

  const vms = [
    buildAgentCardViewModel(r1, false),
    buildAgentCardViewModel(r2, false),
    buildAgentCardViewModel(r3, false),
  ];

  const { rows, totals } = computeAgentSessionPerformance(vms);
  assert.equal(rows.length, 3);

  const row1 = rows[0];
  assert.equal(row1.wins, 2);
  assert.equal(row1.losses, 1);
  assert.equal(row1.winLossRatio, 2);
  assert.equal(row1.winLossRatioLabel, '2.00 : 1');
  assert.equal(row1.realizedPnlRs, 2350);
  assert.equal(row1.unrealizedPnlRs, 850);
  assert.equal(row1.totalSessionPnlRs, 3200);
  assert.equal(row1.closedTrades, 2);
  assert.equal(row1.partialT1BookedCount, 1);

  const row2 = rows[1];
  assert.equal(row2.wins, 3);
  assert.equal(row2.losses, 0);
  assert.equal(row2.winLossRatio, Number.POSITIVE_INFINITY);
  assert.equal(row2.winLossRatioLabel, '3 : 0');
  assert.equal(row2.realizedPnlRs, 3000);

  const row3 = rows[2];
  assert.equal(row3.winLossRatioLabel, '—');
  assert.equal(row3.realizedPnlRs, 0);

  // Fleet totals: 5 wins, 1 loss => 5.00 : 1, realized = 5350, unrealized = 850, total = 6200
  assert.equal(totals.wins, 5);
  assert.equal(totals.losses, 1);
  assert.equal(totals.winLossRatio, 5);
  assert.equal(totals.winLossRatioLabel, '5.00 : 1');
  assert.equal(totals.realizedPnlRs, 5350);
  assert.equal(totals.unrealizedPnlRs, 850);
  assert.equal(totals.totalSessionPnlRs, 6200);
  assert.equal(formatWinLossRatio(0, 0), '—');

  // Sorting by winLossRatio desc puts perfect 3:0 (Aria) ahead of 2.00:1 (Aryan) ahead of 0 (Standby)
  const byRatio = sortAgentSessionPerformanceRows(rows, 'winLossRatio', 'desc');
  assert.equal(byRatio[0].scannerId, 'money-flow');
  assert.equal(byRatio[1].scannerId, 'top-momentum');
  assert.equal(byRatio[2].scannerId, 'most-active-fno');

  // Sorting by realizedPnlRs desc puts +3000 ahead of +2350 ahead of 0
  const byRealized = sortAgentSessionPerformanceRows(rows, 'realizedPnlRs', 'desc');
  assert.equal(byRealized[0].scannerId, 'money-flow');
  assert.equal(byRealized[1].scannerId, 'top-momentum');
  assert.equal(byRealized[2].scannerId, 'most-active-fno');
});
