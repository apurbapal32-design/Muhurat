import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCANNER_FLEET_20_DEFINITIONS,
  ScannerFleet20Manager,
  classifyMarketVolatilityRegime,
  computeVolatilityAdjustedStopLoss,
  evaluateStockForScanner20,
} from './scannerFleet20Engine';
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
    bidAskRatio: isUp ? 1.35 : 0.72,
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


