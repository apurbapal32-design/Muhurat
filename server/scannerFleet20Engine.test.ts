import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCANNER_FLEET_20_DEFINITIONS,
  ScannerFleet20Manager,
  classifyMarketVolatilityRegime,
  computeAgentEntryPlan,
  computeVolatilityAdjustedStopLoss,
  evaluateAgentTradeLifecycle,
  evaluateStockForScanner20,
} from './scannerFleet20Engine';
import { calculateCPRAndPivots } from '../src/utils/technicalAnalysis';
import { StickyScannerRegistry, applyUniversalGateToApexAlphaReport } from './scannerUniversalGate';
import { ScannedStock } from '../src/types';

function makeStock(
  overrides: Omit<Partial<ScannedStock>, 'indicators'> & {
    symbol: string;
    indicators?: Partial<ScannedStock['indicators']>;
  }
): ScannedStock {
  const price = overrides.price ?? 500;
  const chg = overrides.changePercent ?? 2.2;
  const isUp = chg >= 0;
  return {
    symbol: overrides.symbol,
    name: overrides.name ?? overrides.symbol,
    sector: overrides.sector ?? 'NIFTY F&O',
    price,
    change: isUp ? 10 : -10,
    changePercent: chg,
    volume: overrides.volume ?? 4_000_000,
    signal: isUp ? 'BUY' : 'SELL',
    aiScore: overrides.aiScore ?? 84,
    listedAt: overrides.listedAt ?? '10:30:00',
    bidAskRatio: overrides.bidAskRatio ?? (isUp ? 1.35 : 0.72),
    ...(overrides.fixedEntryPrice !== undefined ? { fixedEntryPrice: overrides.fixedEntryPrice } : {}),
    ...(overrides.fixedStopLoss !== undefined ? { fixedStopLoss: overrides.fixedStopLoss } : {}),
    indicators: {
      price,
      open: isUp ? price * 0.985 : price * 1.015,
      high: isUp ? price * 1.005 : price * 1.02,
      low: isUp ? price * 0.98 : price * 0.995,
      close: price,
      volume: overrides.volume ?? 4_000_000,
      avgVolume20: 1_200_000,
      ema13: isUp ? price * 0.995 : price * 1.005,
      ema21: isUp ? price * 0.99 : price * 1.01,
      ema34: isUp ? price * 0.985 : price * 1.015,
      vwap: isUp ? price * 0.988 : price * 1.012,
      rsi: isUp ? 64 : 36,
      macd: isUp ? 2.5 : -2.5,
      macdSignal: isUp ? 1.5 : -1.5,
      macdHist: isUp ? 1.0 : -1.0,
      adx: 32,
      atr: price * 0.01,
      supertrend: isUp ? price * 0.98 : price * 1.02,
      supertrendDirection: isUp ? 'BUY' : 'SELL',
      bbUpper: price * 1.01,
      bbMiddle: price,
      bbLower: price * 0.99,
      rvol: 3.2,
      xTimeVolume: 2.1,
      volumeBreakout: true,
      pdh: isUp ? price * 0.99 : price * 1.03,
      pdl: isUp ? price * 0.97 : price * 1.01,
      cprPivot: price,
      cprBC: isUp ? price * 0.985 : price * 1.01,
      cprTC: isUp ? price * 0.99 : price * 1.015,
      pivotR1: price * 1.02,
      pivotS1: price * 0.98,
      pivotR2: price * 1.04,
      pivotS2: price * 0.96,
      swingHigh: price * 1.02,
      swingLow: price * 0.98,
      oiChangePct: isUp ? 6.5 : -5.5,
      oiState: isUp ? 'SHORT_COVERING' : 'LONG_UNWINDING',
      pcr: isUp ? 1.25 : 0.78,
      ...(overrides.indicators || {}),
    },
    ...(overrides.oiData ? { oiData: overrides.oiData } : {}),
  } as ScannedStock;
}

test('Fleet defines exactly 20 distinct Scanners and 20 unique AI Agents (10 He + 10 She)', () => {
  assert.equal(SCANNER_FLEET_20_DEFINITIONS.length, 20);
  const scannerIds = new Set(SCANNER_FLEET_20_DEFINITIONS.map((d) => d.scannerId));
  const agentIds = new Set(SCANNER_FLEET_20_DEFINITIONS.map((d) => d.agent.agentId));
  const agentNames = new Set(SCANNER_FLEET_20_DEFINITIONS.map((d) => d.agent.name));

  assert.equal(scannerIds.size, 20);
  assert.equal(agentIds.size, 20);
  assert.equal(agentNames.size, 20);

  const heCount = SCANNER_FLEET_20_DEFINITIONS.filter((d) => d.agent.genderLabel === 'He').length;
  const sheCount = SCANNER_FLEET_20_DEFINITIONS.filter((d) => d.agent.genderLabel === 'She').length;
  assert.equal(heCount, 10);
  assert.equal(sheCount, 10);

  // Verify the 2 new scanners (#19 & #20) exist
  assert.ok(scannerIds.has('vwap-surge'));
  assert.ok(scannerIds.has('oi-short-cover'));
});

test('Rule 3 Strict Formula Gate rejects non-eligible stocks across all 20 scanners (Zero Fake Signals)', () => {
  const weakRvol = makeStock({ symbol: 'WEAKRVOL' });
  for (const def of SCANNER_FLEET_20_DEFINITIONS) {
    assert.equal(evaluateStockForScanner20(def.scannerId, weakRvol, 2.0, 1.5, 30), null);
    assert.equal(evaluateStockForScanner20(def.scannerId, weakRvol, 2.5, 1.0, 30), null);
    assert.equal(evaluateStockForScanner20(def.scannerId, weakRvol, 2.5, 1.5, 24.9), null);
    assert.notEqual(evaluateStockForScanner20(def.scannerId, weakRvol, 2.5, 1.5, 30), null);
  }
});

test('Rule 2 Best 10 UP/DOWN Cap, Rule 4 Sticky Lock + Z->A Sort, and Agent Entry/Trail/SL/T2 Management', () => {
  const manager = new ScannerFleet20Manager();
  const liveTime = new Date('2026-11-20T05:30:00Z'); // 11:00:00 IST (LIVE_SCAN_OPEN)

  // 14 strong UP + 3 strong DOWN stocks -> every scanner must admit MAX 10 UP and strictly 3 DOWN (no fake padding)
  const stocks: ScannedStock[] = [];
  for (let i = 1; i <= 14; i++) {
    stocks.push(
      makeStock({
        symbol: `UP${String(i).padStart(2, '0')}`,
        price: 500,
        changePercent: 2.0 + i * 0.1,
        listedAt: `10:${String(10 + i).padStart(2, '0')}:00`,
      })
    );
  }
  for (let i = 1; i <= 3; i++) {
    stocks.push(
      makeStock({
        symbol: `DN${String(i).padStart(2, '0')}`,
        price: 500,
        changePercent: -(2.0 + i * 0.1),
        listedAt: `10:${String(30 + i).padStart(2, '0')}:00`,
      })
    );
  }

  const report1 = manager.syncAll20Scanners({ allStocks: stocks, now: liveTime });
  assert.equal(report1.totalScanners, 20);
  assert.equal(report1.totalAiAgents, 20);
  assert.equal(report1.scanners.length, 20);

  for (const sc of report1.scanners) {
    assert.ok(sc.summary.upCount <= 10, `${sc.scannerId} upCount must be <= 10`);
    assert.ok(sc.summary.downCount <= 10, `${sc.scannerId} downCount must be <= 10`);
    assert.equal(sc.summary.upCount, 10, `${sc.scannerId} should admit Best 10 UP`);
    assert.equal(sc.summary.downCount, 3, `${sc.scannerId} should admit strictly 3 DOWN (zero fake signals)`);

    // Verify LISTED AT Z -> A order inside every scanner
    for (let i = 1; i < sc.upTrades.length; i++) {
      assert.ok(
        sc.upTrades[i - 1].listedAt >= sc.upTrades[i].listedAt,
        `${sc.scannerId} UP must be sorted LISTED AT descending`
      );
    }
  }

  // Simulate refresh where one listed UP stock drops below RVOL threshold & rises to T2 target ->
  // Rule 4: MUST remain locked on dashboard and agent books T2 Full Profit Exit!
  const firstScanner = report1.scanners[0];
  const sampleUp = firstScanner.upTrades[0];
  const updatedStocks = stocks.map((s) =>
    s.symbol === sampleUp.symbol
      ? makeStock({
          ...s,
          price: sampleUp.target2 + 2,
          changePercent: 5.5,
          indicators: { ...s.indicators, rvol: 0.4, xTimeVolume: 0.3, adx: 12 },
        })
      : s
  );

  const report2 = manager.syncAll20Scanners({
    allStocks: updatedStocks,
    now: new Date('2026-11-20T06:30:00Z'), // 12:00:00 IST
  });
  const updatedTrade = report2.scanners[0].upTrades.find((t) => t.symbol === sampleUp.symbol);
  assert.ok(updatedTrade, 'Rule 4: listed stock must NEVER be removed mid-session');
  assert.equal(updatedTrade.actionStatus, 'TARGET_HIT_EXIT');
  assert.equal(updatedTrade.isClosed, true);
  assert.equal(updatedTrade.stickyLockedUntilFlush, true);
  assert.ok(updatedTrade.livePnlRs > 0);
});

test('Rule 1: 23:59:00 IST Auto-Flush empties ALL 20 Scanners and ALL 20 AI Agents', () => {
  const manager = new ScannerFleet20Manager();
  const stock = makeStock({ symbol: 'FLUSHME', price: 600, changePercent: 2.5 });

  const openRep = manager.syncAll20Scanners({
    allStocks: [stock],
    now: new Date('2026-11-20T05:00:00Z'), // 10:30:00 IST
  });
  assert.ok(openRep.fleetSummary.totalManagedPositions > 0);

  // 23:59:10 IST -> ALL 20 scanners & 20 AI agents MUST be emptied
  const flushedRep = manager.syncAll20Scanners({
    allStocks: [stock],
    now: new Date('2026-11-20T18:29:10Z'), // 23:59:10 IST
  });
  assert.equal(flushedRep.session.phase, 'FLUSHED_EMPTY');
  assert.equal(flushedRep.fleetSummary.totalManagedPositions, 0);
  assert.equal(flushedRep.fleetSummary.totalActiveScanners, 0);
  for (const sc of flushedRep.scanners) {
    assert.equal(sc.summary.totalManaged, 0);
    assert.equal(sc.agent.status, 'STANDBY_FLUSHED');
  }
});

test('Rule 1: Missing listedAt during post-scan hours never leaks post-15:15 clock (clamps strictly inside 09:20-15:15 IST)', () => {
  const manager = new ScannerFleet20Manager();
  const stockNoTime = makeStock({ symbol: 'INFY', price: 1100, changePercent: 2.1, listedAt: '--' });
  // 23:42:00 IST (POST_SCAN_LOCKED, before 23:59 flush)
  const postRep = manager.syncAll20Scanners({
    allStocks: [stockNoTime],
    now: new Date('2026-11-20T18:12:00Z'),
  });
  for (const sc of postRep.scanners) {
    for (const tr of sc.allTrades) {
      assert.ok(
        tr.listedAt >= '09:20:00' && tr.listedAt <= '15:15:00',
        `${sc.scannerId} listedAt '${tr.listedAt}' must stay within 09:20:00-15:15:00 IST`
      );
    }
  }
});

test('Autonomous Optimization: classifyMarketVolatilityRegime maps VIX into LOW/NORMAL/ELEVATED/EXTREME multipliers', () => {
  const low = classifyMarketVolatilityRegime(11.4);
  assert.equal(low.regime, 'LOW');
  assert.ok(low.vixMultiplier < 1.0);

  const normal = classifyMarketVolatilityRegime(15.2);
  assert.equal(normal.regime, 'NORMAL');
  assert.equal(normal.vixMultiplier, 1.0);

  const elevated = classifyMarketVolatilityRegime(18.8);
  assert.equal(elevated.regime, 'ELEVATED');
  assert.ok(elevated.vixMultiplier > 1.15);

  const extreme = classifyMarketVolatilityRegime(26.5);
  assert.equal(extreme.regime, 'EXTREME');
  assert.ok(extreme.vixMultiplier > elevated.vixMultiplier);
});

test('Autonomous Optimization: computeVolatilityAdjustedStopLoss widens SL in high VIX, tightens in low VIX, and never degrades trailed breakeven protection', () => {
  // High VIX BUY -> widens SL lower (further cushion below entry)
  const highBuy = computeVolatilityAdjustedStopLoss({
    side: 'BUY',
    entryPrice: 500,
    initialStopLoss: 494,
    baseStopLoss: 494,
    liveLtp: 502,
    atr: 8.5,
    stockRangePct: 3.1,
    indiaVix: 21.5,
    isClosed: false,
  });
  assert.equal(highBuy.shiftDirection, 'WIDENED');
  assert.ok(highBuy.adjustedStopLoss < 494, 'Elevated/high VIX BUY must widen SL downward');

  // Low VIX BUY -> tightens SL higher (closer to entry)
  const lowBuy = computeVolatilityAdjustedStopLoss({
    side: 'BUY',
    entryPrice: 500,
    initialStopLoss: 492,
    baseStopLoss: 492,
    liveLtp: 502,
    atr: 3.5,
    stockRangePct: 1.0,
    indiaVix: 11.2,
    isClosed: false,
  });
  assert.equal(lowBuy.shiftDirection, 'TIGHTENED');
  assert.ok(lowBuy.adjustedStopLoss > 492 && lowBuy.adjustedStopLoss < 500);

  // High VIX SELL -> widens SL higher (above entry)
  const highSell = computeVolatilityAdjustedStopLoss({
    side: 'SELL',
    entryPrice: 500,
    initialStopLoss: 506,
    baseStopLoss: 506,
    liveLtp: 498,
    atr: 8.5,
    stockRangePct: 3.0,
    indiaVix: 22.8,
    isClosed: false,
  });
  assert.equal(highSell.shiftDirection, 'WIDENED');
  assert.ok(highSell.adjustedStopLoss > 506, 'High VIX SELL must widen SL upward');

  // Trailed-in-profit BUY -> must NEVER drop below breakeven floor even in extreme VIX
  const trailedBuy = computeVolatilityAdjustedStopLoss({
    side: 'BUY',
    entryPrice: 500,
    initialStopLoss: 494,
    baseStopLoss: 504.5, // T1 trailed in profit
    liveLtp: 511,
    atr: 9.0,
    stockRangePct: 3.5,
    indiaVix: 25.0,
    isClosed: false,
  });
  assert.ok(
    trailedBuy.adjustedStopLoss >= 500.3,
    'Trailed BUY position must preserve breakeven profit protection'
  );
  assert.ok(trailedBuy.adjustedStopLoss < 511);
});

test('Autonomous Optimization: per-agent toggle shifts SL live and toggling OFF cleanly restores exact base SL', () => {
  const manager = new ScannerFleet20Manager();
  const liveTime = new Date('2026-11-20T05:30:00Z');
  const stock = makeStock({
    symbol: 'VOLTEST',
    price: 1000,
    changePercent: 2.0,
    indicators: { atr: 18, high: 1018, low: 982 },
  });

  // Baseline with Autonomous Optimization OFF
  const baseRep = manager.syncAll20Scanners({
    allStocks: [stock],
    now: liveTime,
    indiaVix: 20.4, // Elevated volatility
  });
  assert.equal(baseRep.marketVolatility.regime, 'ELEVATED');
  assert.equal(baseRep.fleetSummary.autonomousOptimizedAgents, 0);
  const baseSc0 = baseRep.scanners.find((s) => s.scannerId === 'top-momentum')!;
  const baseSc1 = baseRep.scanners.find((s) => s.scannerId === 'money-flow')!;
  assert.equal(baseSc0.agent.autonomousOptimization, false);
  const baseSl0 = baseSc0.upTrades[0].activeStopLoss;
  const baseSl1 = baseSc1.upTrades[0].activeStopLoss;

  // Toggle ON only for top-momentum (Aryan AI)
  assert.equal(manager.setAutonomousOptimization('top-momentum', true), true);
  const optRep = manager.syncAll20Scanners({
    allStocks: [stock],
    now: liveTime,
    indiaVix: 20.4,
  });
  assert.equal(optRep.fleetSummary.autonomousOptimizedAgents, 1);
  const optSc0 = optRep.scanners.find((s) => s.scannerId === 'top-momentum')!;
  const optSc1 = optRep.scanners.find((s) => s.scannerId === 'money-flow')!;

  assert.equal(optSc0.agent.autonomousOptimization, true);
  assert.equal(optSc0.upTrades[0].volatilityAdjusted, true);
  assert.equal(optSc0.upTrades[0].baseStopLoss, baseSl0);
  assert.notEqual(optSc0.upTrades[0].activeStopLoss, baseSl0);
  assert.ok(optSc0.upTrades[0].activeStopLoss < baseSl0, 'Elevated VIX widens BUY SL');

  // Unselected agent (money-flow) must remain completely unaffected
  assert.equal(optSc1.agent.autonomousOptimization, false);
  assert.equal(optSc1.upTrades[0].activeStopLoss, baseSl1);

  // Toggle OFF -> must restore exact original baseStopLoss with zero drift
  manager.setAutonomousOptimization('top-momentum', false);
  const restoredRep = manager.syncAll20Scanners({
    allStocks: [stock],
    now: liveTime,
    indiaVix: 20.4,
  });
  const restSc0 = restoredRep.scanners.find((s) => s.scannerId === 'top-momentum')!;
  assert.equal(restSc0.agent.autonomousOptimization, false);
  assert.equal(restSc0.upTrades[0].activeStopLoss, baseSl0);
  assert.equal(restSc0.upTrades[0].volatilityAdjusted, false);

  // Bulk enable all 20 agents
  manager.setAllAutonomousOptimization(true);
  const bulkRep = manager.syncAll20Scanners({
    allStocks: [stock],
    now: liveTime,
    indiaVix: 20.4,
  });
  assert.equal(bulkRep.fleetSummary.autonomousOptimizedAgents, 20);
  assert.ok(bulkRep.fleetSummary.volatilityShiftedStopLosses >= 1);
});

test('Global Reset clears all 20 agent statuses, stop-loss levels, Auto-Opt toggles, and profit counters across polls until resumed', () => {
  const manager = new ScannerFleet20Manager();
  const liveTime = new Date('2026-11-20T05:30:00Z');
  const stock = makeStock({
    symbol: 'RESETTEST',
    price: 1000,
    changePercent: 2.5,
    indicators: { atr: 16, high: 1020, low: 984 },
  });

  // 1) Populate all 20 agents with active trades, profit & Autonomous Optimization ON
  manager.setAllAutonomousOptimization(true);
  const activeRep = manager.syncAll20Scanners({
    allStocks: [stock],
    now: liveTime,
    indiaVix: 20.4,
  });
  assert.ok(activeRep.fleetSummary.totalManagedPositions > 0);
  assert.equal(activeRep.fleetSummary.autonomousOptimizedAgents, 20);
  assert.equal(activeRep.globalReset.active, false);

  // Move price upward so P&L and trailing stop-loss levels are non-zero
  const liftedStock = makeStock({
    symbol: 'RESETTEST',
    price: 1035,
    changePercent: 4.0,
    indicators: { atr: 16, high: 1040, low: 984 },
  });
  const profitRep = manager.syncAll20Scanners({
    allStocks: [liftedStock],
    now: liveTime,
    indiaVix: 20.4,
  });
  assert.ok(profitRep.fleetSummary.fleetLivePnlRs > 0, 'Profit counter must be positive before reset');

  // 2) Perform Global Reset
  const resetState = manager.performGlobalReset(liveTime);
  assert.equal(resetState.active, true);
  assert.equal(resetState.resetCount, 1);

  // 3) Sync repeatedly (simulating 5s background polls) — reset state must persist without re-admitting trades
  const postResetRep = manager.syncAll20Scanners({
    allStocks: [liftedStock],
    now: liveTime,
    indiaVix: 20.4,
  });
  assert.equal(postResetRep.globalReset.active, true);
  assert.equal(postResetRep.fleetSummary.totalActiveScanners, 0);
  assert.equal(postResetRep.fleetSummary.totalManagedPositions, 0);
  assert.equal(postResetRep.fleetSummary.totalTrailingProtected, 0);
  assert.equal(postResetRep.fleetSummary.totalTargetHits, 0);
  assert.equal(postResetRep.fleetSummary.totalSlHits, 0);
  assert.equal(postResetRep.fleetSummary.fleetLivePnlRs, 0);
  assert.equal(postResetRep.fleetSummary.fleetWinRatePct, 0);
  assert.equal(postResetRep.fleetSummary.autonomousOptimizedAgents, 0);
  assert.equal(postResetRep.fleetSummary.volatilityShiftedStopLosses, 0);
  for (const sc of postResetRep.scanners) {
    assert.equal(sc.agent.status, 'STANDBY_RESET');
    assert.equal(sc.agent.autonomousOptimization, false);
    assert.equal(sc.summary.totalManaged, 0);
    assert.equal(sc.summary.activeOpenCount, 0);
    assert.equal(sc.summary.totalLivePnlRs, 0);
  }

  // 4) Resume live scan -> agents cleanly re-populate under baseline fixed ATR SL
  manager.resumeFromGlobalReset();
  const resumedRep = manager.syncAll20Scanners({
    allStocks: [liftedStock],
    now: liveTime,
    indiaVix: 20.4,
  });
  assert.equal(resumedRep.globalReset.active, false);
  assert.ok(resumedRep.fleetSummary.totalManagedPositions > 0);
  assert.equal(resumedRep.fleetSummary.autonomousOptimizedAgents, 0);
});

test('Audit Fix 1: calculateCPRAndPivots never inverts TC below BC on bearish prior days', () => {
  // Bearish prior day: high=1050, low=1000, close=1005 (below midpoint 1025)
  const bearishCpr = calculateCPRAndPivots(1050, 1000, 1005);
  assert.ok(
    bearishCpr.cprTC >= bearishCpr.cprBC,
    `Expected cprTC (${bearishCpr.cprTC}) >= cprBC (${bearishCpr.cprBC}) on bearish prior day`
  );
  assert.ok(bearishCpr.cprPivot >= bearishCpr.cprBC && bearishCpr.cprPivot <= bearishCpr.cprTC);

  // Bullish prior day: high=1050, low=1000, close=1045
  const bullishCpr = calculateCPRAndPivots(1050, 1000, 1045);
  assert.ok(bullishCpr.cprTC >= bullishCpr.cprBC);
});

test('Audit Fix 2: DI-Aligned ADX rejects counter-trend traps across ALL 20 scanners', () => {
  const buyStock = makeStock({ symbol: 'COUNTERBUY', price: 500, changePercent: 2.0 });
  const sellStock = makeStock({ symbol: 'COUNTERSELL', price: 500, changePercent: -2.0 });

  for (const def of SCANNER_FLEET_20_DEFINITIONS) {
    // Strong ADX=35, but -DI=34 > +DI=11 -> MUST reject BUY
    assert.equal(
      evaluateStockForScanner20(def.scannerId, buyStock, 3.0, 1.8, 35, 11, 34),
      null,
      `${def.scannerId} must reject BUY when -DI > +DI`
    );
    // Strong ADX=35, +DI=34 > -DI=11 -> BUY passes
    assert.notEqual(
      evaluateStockForScanner20(def.scannerId, buyStock, 3.0, 1.8, 35, 34, 11),
      null,
      `${def.scannerId} should allow BUY when +DI > -DI`
    );
    // Strong ADX=35, but +DI=34 > -DI=11 -> MUST reject SELL
    assert.equal(
      evaluateStockForScanner20(def.scannerId, sellStock, 3.0, 1.8, 35, 34, 11),
      null,
      `${def.scannerId} must reject SELL when +DI > -DI`
    );
    // Strong ADX=35, -DI=34 > +DI=11 -> SELL passes
    assert.notEqual(
      evaluateStockForScanner20(def.scannerId, sellStock, 3.0, 1.8, 35, 11, 34),
      null,
      `${def.scannerId} should allow SELL when -DI > +DI`
    );
  }
});

test('Audit Fix 3: Universal anti-exhaustion & wick-trap guards block chasing and shooting stars', () => {
  // Overextended +7.5% above VWAP
  const overextended = makeStock({
    symbol: 'CHASEME',
    price: 537.5,
    changePercent: 7.5,
    indicators: { vwap: 500 },
  });
  // Shooting star rejection wick: high=530, low=490, price=498 (dayRangePct=20%)
  const shootingStar = makeStock({
    symbol: 'WICKTRAP',
    price: 498,
    changePercent: 1.5,
    indicators: { high: 530, low: 490, vwap: 494 },
  });

  for (const def of SCANNER_FLEET_20_DEFINITIONS) {
    assert.equal(
      evaluateStockForScanner20(def.scannerId, overextended, 3.0, 2.0, 32),
      null,
      `${def.scannerId} must reject >6.5% VWAP overextension`
    );
    assert.equal(
      evaluateStockForScanner20(def.scannerId, shootingStar, 3.0, 2.0, 32),
      null,
      `${def.scannerId} must reject shooting-star opposing wick trap`
    );
  }
});

test('Audit Fix 4: Individual scanner formula regressions (#04, #09, #10, #11, #13, #14, #15, #19, #20)', () => {
  // #20 oi-short-cover: neutral PCR=1.00 & NEUTRAL OI MUST NOT trigger BUY or SELL
  const neutralOiBuy = makeStock({
    symbol: 'NEUTOI',
    price: 500,
    changePercent: 1.5,
    indicators: { oiState: 'NEUTRAL', pcr: 1.0, oiChangePct: 0.2 },
  });
  assert.equal(evaluateStockForScanner20('oi-short-cover', neutralOiBuy, 3.0, 1.8, 30), null);

  const genuineShortCover = makeStock({
    symbol: 'SCOVER',
    price: 500,
    changePercent: 1.5,
    indicators: { oiState: 'SHORT_COVERING', pcr: 1.22, oiChangePct: -4.2 },
  });
  assert.notEqual(evaluateStockForScanner20('oi-short-cover', genuineShortCover, 3.0, 1.8, 30), null);

  // #11 titan & #14 titan-cash: heavy whale selling (bidAsk=0.45) must NEVER pass BUY even with +1.5% chg
  const bearishFlowBuy = makeStock({
    symbol: 'WHALESELL',
    price: 500,
    changePercent: 1.5,
    bidAskRatio: 0.45,
  });
  assert.equal(evaluateStockForScanner20('titan', bearishFlowBuy, 3.0, 1.8, 30), null);
  assert.equal(evaluateStockForScanner20('titan-cash', bearishFlowBuy, 3.0, 1.8, 30), null);

  // #13 elite-pro: negative MACD histogram (-0.15) must NOT pass BUY
  const negMacdBuy = makeStock({
    symbol: 'NEGMACD',
    price: 500,
    changePercent: 1.5,
    indicators: { macdHist: -0.15 },
  });
  assert.equal(evaluateStockForScanner20('elite-pro', negMacdBuy, 3.0, 1.8, 30), null);

  // #15 cloud-ai: enforces stated aiScore >= 72 (rejects 65)
  const lowAi = makeStock({ symbol: 'LOWAI', price: 500, changePercent: 1.5, aiScore: 65 });
  assert.equal(evaluateStockForScanner20('cloud-ai', lowAi, 3.0, 1.8, 30), null);

  // #04 claude-fno: rejects SHORT_BUILDUP on BUY even when chg=+1.5%
  const shortBuildupBuy = makeStock({
    symbol: 'SBUILD',
    price: 500,
    changePercent: 1.5,
    indicators: { oiState: 'SHORT_BUILDUP', pcr: 0.72 },
  });
  assert.equal(evaluateStockForScanner20('claude-fno', shortBuildupBuy, 3.0, 1.8, 30), null);

  // #10 sonic: symmetric OI requirement on SELL (rejects zero OI change + NEUTRAL)
  const flatOiSell = makeStock({
    symbol: 'FLATOISELL',
    price: 500,
    changePercent: -1.5,
    indicators: { oiState: 'NEUTRAL', oiChangePct: 0.1 },
  });
  assert.equal(evaluateStockForScanner20('sonic', flatOiSell, 3.0, 1.8, 30), null);

  // #19 vwap-surge: rejects small 0.38% VWAP distance (<0.55%) and overextended 5.1% (>4.5%)
  const tinyVwapDist = makeStock({
    symbol: 'TINYVWAP',
    price: 501.9,
    changePercent: 1.0,
    indicators: { vwap: 500 },
  });
  const hugeVwapDist = makeStock({
    symbol: 'HUGEVWAP',
    price: 525.5,
    changePercent: 5.1,
    indicators: { vwap: 500 },
  });
  assert.equal(evaluateStockForScanner20('vwap-surge', tinyVwapDist, 3.0, 1.8, 30), null);
  assert.equal(evaluateStockForScanner20('vwap-surge', hugeVwapDist, 3.0, 1.8, 30), null);

  // #09 strong: safely normalizes inverted raw cprTC < cprBC (price below true top CPR rejected on BUY)
  const invertedCprRejected = makeStock({
    symbol: 'INVCPR',
    price: 500,
    changePercent: 1.5,
    indicators: { cprTC: 495, cprBC: 510 }, // inverted raw input: true top CPR is 510!
  });
  assert.equal(evaluateStockForScanner20('strong', invertedCprRejected, 3.0, 1.8, 30), null);
});

test('Audit Fix 5: computeAgentEntryPlan bounds wide SL and evaluateAgentTradeLifecycle computes true blended 50% T1 + 50% runner R', () => {
  const agent = SCANNER_FLEET_20_DEFINITIONS[0].agent;
  // Inherited fixedStopLoss 8% away (460 vs 500) must be rejected and replaced by bounded intraday ATR SL
  const wideSlStock = makeStock({
    symbol: 'WIDESL',
    price: 500,
    fixedEntryPrice: 500,
    fixedStopLoss: 460,
    indicators: { atr: 5 },
  });
  const plan = computeAgentEntryPlan(wideSlStock, 'BUY', agent, 500_000);
  const slDistPct = ((plan.entryPrice - plan.initialStopLoss) / plan.entryPrice) * 100;
  assert.ok(slDistPct >= 0.4 && slDistPct <= 2.5, `Expected bounded SL distance (0.4%..2.5%), got ${slDistPct.toFixed(2)}%`);

  // Blended P&L check: Entry=100, SL=96 (risk=4), T1=106 (+1.5R), T2=110 (+2.5R), qty=100
  const baseTrade = {
    symbol: 'BLEND',
    name: 'Blend Co',
    sector: 'IT',
    side: 'BUY' as const,
    listedAt: '10:00:00',
    formulaReason: 'Test',
    formulaScore: 90,
    entryPrice: 100,
    initialStopLoss: 96,
    activeStopLoss: 96,
    target1: 106,
    target2: 110,
    positionQty: 100,
    riskCapitalRs: 400,
    peakFavorablePrice: 106.5, // Already hit T1 (+1.5R)
    peakRvol: 3.0,
    peakXTimeVolume: 1.8,
    peakAdx: 32,
    lastLtp: 106,
    lastChangePercent: 2.0,
    lastAtr: 1.5,
    lastRangePct: 2.4,
    t1Booked: true,
  };

  // Case A: Remaining 50% hits T2 (110 = +2.5R) -> blended R = (1.5R * 50 + 2.5R * 50) / 100 = +2.00R (₹800)
  const t2Res = evaluateAgentTradeLifecycle(baseTrade, agent, 110, false);
  assert.equal(t2Res.actionStatus, 'TARGET_HIT_EXIT');
  assert.equal(t2Res.liveRMultiple, 2.0);
  assert.equal(t2Res.livePnlRs, 800);

  // Case B: After T1 booked (+1.5R), price pulls back to trailed SL 103 (+0.75R) -> blended R = (1.5R + 0.75R) / 2 = +1.13R (₹450)
  const trailSlRes = evaluateAgentTradeLifecycle(baseTrade, agent, 103, false);
  assert.equal(trailSlRes.actionStatus, 'SL_HIT_EXIT');
  assert.equal(trailSlRes.liveRMultiple, 1.13);
  assert.equal(trailSlRes.livePnlRs, 450);
  assert.ok(trailSlRes.actionBadge.includes('PROFIT LOCKED'));
});

test('Audit Fix 6: applyUniversalGateToApexAlphaReport reads rvol5m instead of dropping rows with 0', () => {
  const reg = new StickyScannerRegistry();
  const stock = makeStock({
    symbol: 'APEXOK',
    price: 500,
    changePercent: 2.1,
    indicators: { rvol: 3.1, xTimeVolume: 1.9, adx: 32 },
  });
  const apexReport = {
    isMidnightCleared: false,
    categories: {
      qualifiedAlpha: [
        {
          symbol: 'APEXOK',
          direction: 'BUY',
          price: 500,
          entryPrice: 500,
          stopLoss: 493,
          rvol5m: 3.1, // ApexAlphaRow stores rvol in rvol5m, NOT rvol!
          xTimeVolume: 1.9,
          adx: 32,
        },
      ],
      vwapCoilSetups: [],
      pdhPdlReclaim: [],
      buySetups: [],
      sellSetups: [],
      nearTriggerWatch: [],
    },
  };

  const gated = applyUniversalGateToApexAlphaReport(
    apexReport,
    [stock],
    () => undefined,
    new Map(),
    reg
  );
  assert.equal(gated.categories.qualifiedAlpha.length, 1);
  assert.ok(gated.categories.qualifiedAlpha[0].rvol >= 3.0);
});



