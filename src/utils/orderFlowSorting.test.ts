import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { OrderFlowSignalRow } from '../../server/orderFlowScannerEngine';
import {
  DEFAULT_ORDER_FLOW_SORT,
  formatOrderFlowSortSummary,
  getOrderFlowSortMetric,
  isDefaultOrderFlowSort,
  parseListedTimeSeconds,
  sortOrderFlowRows,
  toggleOrderFlowSort,
} from './orderFlowSorting';

function makeRow(overrides: Partial<OrderFlowSignalRow> & {
  symbol: string;
  footprintDelta?: number;
  profileTotalVol?: number;
}): OrderFlowSignalRow {
  const { footprintDelta = 120000, profileTotalVol = 500000, ...rest } = overrides;
  return {
    symbol: rest.symbol,
    name: rest.name ?? rest.symbol,
    sector: rest.sector ?? 'NIFTY',
    direction: rest.direction ?? 'BUY',
    listedAt: rest.listedAt ?? '10:00:00',
    listedAtSec: rest.listedAtSec ?? 36000,
    price: rest.price ?? 1000,
    changePercent: rest.changePercent ?? 2.5,
    dayOpen: 980,
    dayHigh: 1015,
    dayLow: 975,
    vwap: 995,
    rvol: rest.rvol ?? 2.6,
    xTimeVolume: rest.xTimeVolume ?? 1.8,
    adx: 31,
    turnoverCr: rest.turnoverCr ?? 120,
    atr14: 18,
    volumeProfile: {
      totalProfileVolume: profileTotalVol,
    } as unknown as OrderFlowSignalRow['volumeProfile'],
    footprint: {} as OrderFlowSignalRow['footprint'],
    signals: {
      delta: {
        footprintDelta,
        deltaPct: 24,
      },
    } as OrderFlowSignalRow['signals'],
    orderFlowScore: rest.orderFlowScore ?? 82,
    convictionGrade: 'A STRONG FLOW',
    headlineSignal: 'Stacked Buy',
    formulaReason: 'Rule 3 passed',
    agentId: 'AI-AGENT-ORDERFLOW',
    agentName: 'Rudra AI',
    entryPrice: 1000,
    stopLoss: 980,
    target1: 1030,
    target2: 1050,
    slAnchorLabel: 'VAL',
    riskPerShare: 20,
    slDistancePct: 2.0,
    plannedRR: '1:2.5',
    positionQty: 250,
    livePnlRs: 1500,
    livePnlPct: 0.6,
    agentDirective: 'Hold above POC',
    stickyLockedUntilFlush: true,
    ...rest,
  };
}

describe('Order Flow Scanner column sorting', () => {
  const sampleRows: OrderFlowSignalRow[] = [
    makeRow({
      symbol: 'RELIANCE',
      listedAt: '09:35:00',
      listedAtSec: 34500,
      turnoverCr: 480.5,
      rvol: 3.1,
      changePercent: 1.85,
      orderFlowScore: 86,
      footprintDelta: 320000,
    }),
    makeRow({
      symbol: 'TRENT',
      listedAt: '11:45:00',
      listedAtSec: 42300,
      turnoverCr: 195.2,
      rvol: 4.5,
      changePercent: 5.42,
      orderFlowScore: 93,
      footprintDelta: 145000,
    }),
    makeRow({
      symbol: 'HAL',
      listedAt: '10:20:00',
      listedAtSec: 37200,
      turnoverCr: 310.0,
      rvol: 2.8,
      changePercent: 3.15,
      orderFlowScore: 79,
      footprintDelta: 510000,
    }),
  ];

  it('sorts by Time (Listed At) descending by default and toggles to ascending', () => {
    const desc = sortOrderFlowRows(sampleRows, DEFAULT_ORDER_FLOW_SORT);
    assert.deepEqual(
      desc.map((r) => r.symbol),
      ['TRENT', 'HAL', 'RELIANCE']
    );

    const asc = sortOrderFlowRows(sampleRows, { column: 'time', direction: 'asc' });
    assert.deepEqual(
      asc.map((r) => r.symbol),
      ['RELIANCE', 'HAL', 'TRENT']
    );

    // Must not mutate original array
    assert.deepEqual(
      sampleRows.map((r) => r.symbol),
      ['RELIANCE', 'TRENT', 'HAL']
    );
  });

  it('falls back to parsing listedAt HH:MM:SS when listedAtSec is 0 or missing', () => {
    assert.equal(parseListedTimeSeconds('14:05:30'), 14 * 3600 + 5 * 60 + 30);
    assert.equal(parseListedTimeSeconds('invalid'), 0);

    const rows = [
      makeRow({ symbol: 'EARLY', listedAt: '09:20:00', listedAtSec: 0 }),
      makeRow({ symbol: 'LATE', listedAt: '14:10:00', listedAtSec: 0 }),
    ];
    const sorted = sortOrderFlowRows(rows, { column: 'time', direction: 'desc' });
    assert.deepEqual(
      sorted.map((r) => r.symbol),
      ['LATE', 'EARLY']
    );
  });

  it('sorts by Volume (institutional turnoverCr, with RVOL tie-breaker)', () => {
    const desc = sortOrderFlowRows(sampleRows, { column: 'volume', direction: 'desc' });
    assert.deepEqual(
      desc.map((r) => r.symbol),
      ['RELIANCE', 'HAL', 'TRENT']
    );

    const asc = sortOrderFlowRows(sampleRows, { column: 'volume', direction: 'asc' });
    assert.deepEqual(
      asc.map((r) => r.symbol),
      ['TRENT', 'HAL', 'RELIANCE']
    );

    // Fallback when turnoverCr is 0 uses volumeProfile.totalVolume
    const fallbackRow = makeRow({ symbol: 'FALLBACK', turnoverCr: 0, profileTotalVol: 910000 });
    assert.equal(getOrderFlowSortMetric(fallbackRow, 'volume'), 910000);
  });

  it('sorts by Price Impact using absolute % change for both UP and DOWN tables', () => {
    const upDesc = sortOrderFlowRows(sampleRows, { column: 'priceImpact', direction: 'desc' });
    assert.deepEqual(
      upDesc.map((r) => r.symbol),
      ['TRENT', 'HAL', 'RELIANCE']
    );

    const downRows = [
      makeRow({ symbol: 'WEAK_A', direction: 'SELL', changePercent: -1.45 }),
      makeRow({ symbol: 'CRASH_B', direction: 'SELL', changePercent: -6.20 }),
      makeRow({ symbol: 'SLIDE_C', direction: 'SELL', changePercent: -3.10 }),
    ];
    const downDesc = sortOrderFlowRows(downRows, { column: 'priceImpact', direction: 'desc' });
    assert.deepEqual(
      downDesc.map((r) => r.symbol),
      ['CRASH_B', 'SLIDE_C', 'WEAK_A']
    );

    const downAsc = sortOrderFlowRows(downRows, { column: 'priceImpact', direction: 'asc' });
    assert.deepEqual(
      downAsc.map((r) => r.symbol),
      ['WEAK_A', 'SLIDE_C', 'CRASH_B']
    );
  });

  it('sorts by Flow Score and Delta magnitude cleanly with deterministic tie-breakers', () => {
    const byScore = sortOrderFlowRows(sampleRows, { column: 'score', direction: 'desc' });
    assert.deepEqual(
      byScore.map((r) => r.symbol),
      ['TRENT', 'RELIANCE', 'HAL']
    );

    const byDelta = sortOrderFlowRows(sampleRows, { column: 'delta', direction: 'desc' });
    assert.deepEqual(
      byDelta.map((r) => r.symbol),
      ['HAL', 'RELIANCE', 'TRENT']
    );

    // Equal metric breaks ties by latest time, then symbol A -> Z
    const tied = [
      makeRow({ symbol: 'ZETA', listedAtSec: 36000, changePercent: 2.5 }),
      makeRow({ symbol: 'ALPHA', listedAtSec: 36000, changePercent: 2.5 }),
      makeRow({ symbol: 'LATER', listedAtSec: 40000, changePercent: 2.5 }),
    ];
    const resolved = sortOrderFlowRows(tied, { column: 'priceImpact', direction: 'desc' });
    assert.deepEqual(
      resolved.map((r) => r.symbol),
      ['LATER', 'ALPHA', 'ZETA']
    );
  });

  it('transitions sort state accurately on column clicks and formats labels', () => {
    assert.equal(isDefaultOrderFlowSort(DEFAULT_ORDER_FLOW_SORT), true);

    // Clicking a new column defaults to desc
    const volDesc = toggleOrderFlowSort(DEFAULT_ORDER_FLOW_SORT, 'volume');
    assert.deepEqual(volDesc, { column: 'volume', direction: 'desc' });
    assert.equal(isDefaultOrderFlowSort(volDesc), false);
    assert.equal(formatOrderFlowSortSummary(volDesc), 'Sorted by Volume (High → Low)');

    // Clicking the same active column toggles desc -> asc
    const volAsc = toggleOrderFlowSort(volDesc, 'volume');
    assert.deepEqual(volAsc, { column: 'volume', direction: 'asc' });
    assert.equal(formatOrderFlowSortSummary(volAsc), 'Sorted by Volume (Low → High)');

    // Clicking priceImpact resets direction to desc
    const impactDesc = toggleOrderFlowSort(volAsc, 'priceImpact');
    assert.deepEqual(impactDesc, { column: 'priceImpact', direction: 'desc' });
    assert.equal(formatOrderFlowSortSummary(impactDesc), 'Sorted by Price Impact (High → Low)');
  });
});
