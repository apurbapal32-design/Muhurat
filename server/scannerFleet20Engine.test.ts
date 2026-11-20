import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCANNER_FLEET_20_DEFINITIONS,
  ScannerFleet20Manager,
  evaluateStockForScanner20,
} from './scannerFleet20Engine';
import { ScannedStock } from '../src/types';

function makeStock(overrides: Partial<ScannedStock> & { symbol: string }): ScannedStock {
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
