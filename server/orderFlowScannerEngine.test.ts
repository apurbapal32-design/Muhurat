import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ORDER_FLOW_3_STEP_FORMULA,
  OrderFlowScannerManager,
  computeFootprintLadder,
  computeVolumeProfile,
  evaluateFiveOrderFlowSignals,
  evaluateOrderFlowCandidate,
  resolveOrderFlowListedAtSec,
} from './orderFlowScannerEngine';
import { ClaudeFnoBar } from './claudeFnoEngine';
import { getLockedSessionWindowStatus } from './systemFiveRules';
import { ScannedStock } from '../src/types';

function makeIntradayBars(opts: {
  startPrice: number;
  stepPerBar: number;
  baseVol: number;
  surgeLastBars?: boolean;
  lowerWickAbsorption?: boolean;
  topExhaustion?: boolean;
  count?: number;
}): ClaudeFnoBar[] {
  const count = opts.count ?? 16;
  const bars: ClaudeFnoBar[] = [];
  let px = opts.startPrice;
  for (let i = 0; i < count; i++) {
    const secIST = 9 * 3600 + 25 * 60 + i * 300;
    const h = Math.floor(secIST / 3600);
    const m = Math.floor((secIST % 3600) / 60);
    const timeIST = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;

    const open = px;
    const close = Number((open + opts.stepPerBar).toFixed(2));
    const isUp = close >= open;
    let high = Number((Math.max(open, close) + Math.abs(opts.stepPerBar) * 0.25).toFixed(2));
    let low = Number((Math.min(open, close) - Math.abs(opts.stepPerBar) * 0.25).toFixed(2));
    let volume = opts.baseVol;

    if (opts.surgeLastBars && i >= count - 3) {
      volume = Math.round(opts.baseVol * 3.4);
    }
    if (opts.lowerWickAbsorption && i === count - 3) {
      // Heavy selling hits low with long lower wick, closes firm
      low = Number((Math.min(open, close) - Math.abs(opts.stepPerBar) * 2.2).toFixed(2));
      volume = Math.round(opts.baseVol * 4.2);
    }
    if (opts.topExhaustion && i === count - 1) {
      // Volume dries up at extreme high
      high = Number((close + Math.abs(opts.stepPerBar) * 1.4).toFixed(2));
      volume = Math.round(opts.baseVol * 0.14);
    }

    bars.push({
      timeIST,
      dateIST: '2026-11-24',
      secIST,
      open,
      high,
      low,
      close,
      volume,
    });
    px = close;
  }
  return bars;
}

function makeMockStock(overrides: Partial<ScannedStock> & { symbol: string }): ScannedStock {
  const price = overrides.price ?? 1250;
  return {
    symbol: overrides.symbol,
    name: overrides.name ?? `${overrides.symbol} Ltd`,
    sector: overrides.sector ?? 'Banking',
    price,
    change: overrides.change ?? 32,
    changePercent: overrides.changePercent ?? 2.65,
    signal: overrides.signal ?? 'BUY',
    aiScore: overrides.aiScore ?? 86,
    timestamp: new Date().toISOString(),
    indicators: {
      open: price * 0.978,
      high: price * 1.003,
      low: price * 0.972,
      vwap: price * 0.986,
      volume: 2800000,
      avgVolume: 780000,
      rvol: 3.45,
      xTimeVolume: 2.35,
      adx: 34.2,
      atr: price * 0.012,
      rsi: 66,
      ema9: price * 0.994,
      ema21: price * 0.988,
      ...(overrides.indicators || {}),
    },
    ...(overrides as any),
  } as ScannedStock;
}

test('Step 1 Volume Profile marks VAH >= POC >= VAL with HVN acceptance and LVN fast-move nodes', () => {
  const bars = makeIntradayBars({
    startPrice: 1000,
    stepPerBar: 2.5,
    baseVol: 120000,
    surgeLastBars: true,
  });
  const dayLow = Math.min(...bars.map((b) => b.low));
  const dayHigh = Math.max(...bars.map((b) => b.high));
  const price = bars[bars.length - 1].close;

  const vp = computeVolumeProfile({
    bars,
    dayHigh,
    dayLow,
    price,
    vwap: 1018,
    dayOpen: 1000,
    totalDayVolume: bars.reduce((s, b) => s + b.volume, 0),
  });

  assert.equal(vp.bins.length, 14);
  assert.ok(vp.vah >= vp.poc, `Expected VAH (${vp.vah}) >= POC (${vp.poc})`);
  assert.ok(vp.poc >= vp.val, `Expected POC (${vp.poc}) >= VAL (${vp.val})`);
  assert.ok(vp.valueAreaVolumePct >= 68, `Expected ~70% value area, got ${vp.valueAreaVolumePct}%`);
  assert.ok(vp.hvnCount >= 1, 'Expected at least 1 HVN acceptance node');
  assert.ok(vp.lvnCount >= 1, 'Expected at least 1 LVN fast-move node');
  // Bins sorted High -> Low
  assert.ok(vp.bins[0].priceMid > vp.bins[vp.bins.length - 1].priceMid);
});

test('Step 2 Footprint separates Sellers (Left) vs Buyers (Right) and detects >=3 Stacked Imbalances', () => {
  const bars = makeIntradayBars({
    startPrice: 500,
    stepPerBar: 1.8,
    baseVol: 100000,
    surgeLastBars: true,
  });
  const dayLow = Math.min(...bars.map((b) => b.low));
  const dayHigh = Math.max(...bars.map((b) => b.high));
  const price = bars[bars.length - 1].close;

  const vp = computeVolumeProfile({
    bars,
    dayHigh,
    dayLow,
    price,
    vwap: 514,
    dayOpen: 500,
    totalDayVolume: bars.reduce((s, b) => s + b.volume, 0),
  });

  const fp = computeFootprintLadder({
    bars,
    price,
    dayHigh,
    dayLow,
    atr14: 6,
    direction: 'BUY',
    bidAskRatio: 1.85,
    totalDayVolume: 2000000,
    profile: vp,
  });

  assert.equal(fp.levels.length, 10);
  assert.ok(fp.levels[0].price > fp.levels[fp.levels.length - 1].price, 'Footprint must be sorted High -> Low');
  assert.ok(fp.totalBuyersAskVol > fp.totalSellersBidVol, 'Bullish footprint should have buyers > sellers');
  assert.ok(fp.netFootprintDelta > 0, 'Bullish footprint delta must be positive');
  assert.ok(fp.maxBuyStack >= 3, `Expected >=3 stacked buy imbalances, got ${fp.maxBuyStack}`);
});

test('Step 3 detects Absorption at lows and flags Top Exhaustion when extreme volume dries up', () => {
  // 1. Absorption test
  const absorbBars = makeIntradayBars({
    startPrice: 800,
    stepPerBar: 2.0,
    baseVol: 90000,
    surgeLastBars: true,
    lowerWickAbsorption: true,
  });
  const lowA = Math.min(...absorbBars.map((b) => b.low));
  const highA = Math.max(...absorbBars.map((b) => b.high));
  const priceA = absorbBars[absorbBars.length - 1].close;
  const vpA = computeVolumeProfile({
    bars: absorbBars,
    dayHigh: highA,
    dayLow: lowA,
    price: priceA,
    vwap: 816,
    dayOpen: 800,
    totalDayVolume: 2100000,
  });
  const fpA = computeFootprintLadder({
    bars: absorbBars,
    price: priceA,
    dayHigh: highA,
    dayLow: lowA,
    atr14: 9,
    direction: 'BUY',
    bidAskRatio: 1.65,
    totalDayVolume: 2100000,
    profile: vpA,
  });
  const sigA = evaluateFiveOrderFlowSignals({
    symbol: 'RELIANCE',
    direction: 'BUY',
    price: priceA,
    dayHigh: highA,
    dayLow: lowA,
    bars: absorbBars,
    profile: vpA,
    footprint: fpA,
    rawCumDelta: 350000,
    rvol: 3.5,
  });
  assert.equal(sigA.absorption.detected, true, 'Expected bullish low absorption to be detected');
  assert.equal(sigA.absorption.side, 'BULLISH_LOW_ABSORB');
  assert.equal(sigA.delta.control, 'BUYERS_IN_CONTROL');
  assert.equal(sigA.tape.prints.length, 6);
  assert.equal(sigA.tape.confirmed, true, 'Expected institutional big tape prints to confirm');

  // 2. Exhaustion test when volume dries up at top
  const exhaustBars = makeIntradayBars({
    startPrice: 800,
    stepPerBar: 2.0,
    baseVol: 140000,
    topExhaustion: true,
  });
  const lowE = Math.min(...exhaustBars.map((b) => b.low));
  const highE = Math.max(...exhaustBars.map((b) => b.high));
  const priceE = exhaustBars[exhaustBars.length - 1].close;
  const vpE = computeVolumeProfile({
    bars: exhaustBars,
    dayHigh: highE,
    dayLow: lowE,
    price: priceE,
    vwap: 814,
    dayOpen: 800,
    totalDayVolume: 1800000,
  });
  const fpE = computeFootprintLadder({
    bars: exhaustBars,
    price: priceE,
    dayHigh: highE,
    dayLow: lowE,
    atr14: 8,
    direction: 'BUY',
    bidAskRatio: 1.25,
    totalDayVolume: 1800000,
    profile: vpE,
  });
  const sigE = evaluateFiveOrderFlowSignals({
    symbol: 'TCS',
    direction: 'BUY',
    price: priceE,
    dayHigh: highE,
    dayLow: lowE,
    bars: exhaustBars,
    profile: vpE,
    footprint: fpE,
    rawCumDelta: 120000,
    rvol: 2.6,
  });
  assert.equal(sigE.exhaustion.detected, true, 'Expected top exhaustion to trigger when extreme volume dries up');
  assert.equal(sigE.exhaustion.type, 'TOP_EXHAUSTION');
});

test('Zero Fake Signals (Rule 3) rejects weak RVOL/VolX stocks, enforces Best 10 cap, sticky lock & 23:59 flush', () => {
  const liveSessionTime = new Date('2026-11-24T05:30:00.000Z'); // 11:00:00 IST
  const session = getLockedSessionWindowStatus(liveSessionTime, false);
  assert.equal(session.phase, 'LIVE_SCAN_OPEN');

  const barsStrongUp = makeIntradayBars({
    startPrice: 1180,
    stepPerBar: 3.5,
    baseVol: 110000,
    surgeLastBars: true,
    lowerWickAbsorption: true,
  });
  const barsStrongDown = makeIntradayBars({
    startPrice: 960,
    stepPerBar: -3.2,
    baseVol: 110000,
    surgeLastBars: true,
  });

  // Weak stock with flat low-volume bars fails Rule 3 (RVOL <= 2.0, VolX <= 1.0) -> must return null
  const barsWeak = makeIntradayBars({
    startPrice: 1200,
    stepPerBar: 0.4,
    baseVol: 60000,
    surgeLastBars: false,
  });
  const weakStock = makeMockStock({
    symbol: 'WEAKCO',
    price: barsWeak[barsWeak.length - 1].close,
    changePercent: 1.2,
    indicators: { rvol: 1.1, xTimeVolume: 0.8, adx: 18 } as any,
  });
  const weakResult = evaluateOrderFlowCandidate({
    stock: weakStock,
    bars: barsWeak,
    session,
  });
  assert.equal(weakResult, null, 'Stock failing Rule 3 must never be admitted (zero fake signals)');

  // Build 12 strong UP stocks + 3 strong DOWN stocks -> Best 10 UP cap + 3 DOWN
  const upStocks = Array.from({ length: 12 }, (_, idx) =>
    makeMockStock({
      symbol: `UPFLOW${String(idx + 1).padStart(2, '0')}`,
      price: barsStrongUp[barsStrongUp.length - 1].close,
      changePercent: 2.2 + idx * 0.15,
      indicators: {
        open: 1180,
        high: barsStrongUp[barsStrongUp.length - 1].high,
        low: barsStrongUp[0].low,
        vwap: 1205,
        rvol: 3.1 + idx * 0.1,
        xTimeVolume: 2.2 + idx * 0.08,
        adx: 32 + idx,
      } as any,
    })
  );
  const downStocks = Array.from({ length: 3 }, (_, idx) =>
    makeMockStock({
      symbol: `DNFLOW${String(idx + 1).padStart(2, '0')}`,
      price: barsStrongDown[barsStrongDown.length - 1].close,
      changePercent: -(2.1 + idx * 0.3),
      signal: 'SELL',
      indicators: {
        open: 960,
        high: barsStrongDown[0].high,
        low: barsStrongDown[barsStrongDown.length - 1].low,
        vwap: 938,
        rvol: 3.4,
        xTimeVolume: 2.5,
        adx: 35,
      } as any,
    })
  );

  const mgr = new OrderFlowScannerManager();
  const report1 = mgr.syncAndBuildReport({
    allStocks: [...upStocks, ...downStocks, weakStock],
    getExtendedBarsFn: (sym) =>
      sym === 'WEAKCO'
        ? (barsWeak as any)
        : sym.startsWith('DN')
        ? (barsStrongDown as any)
        : (barsStrongUp as any),
    now: liveSessionTime,
    upstoxConnected: true,
    bypassCache: true,
  });

  assert.equal(report1.upPicks.length, 10, 'Best 10 UP cap must be enforced');
  assert.equal(report1.downPicks.length, 3, 'Strictly 3 qualified DOWN stocks shown (no padding)');
  assert.equal(report1.formulaSteps.length, ORDER_FLOW_3_STEP_FORMULA.length);
  assert.equal(report1.agent.agentId, 'AI-AGENT-ORDERFLOW');

  // Verify Rule 4 sticky lock: even if stock weakens later in the day, it stays locked until 23:59 flush
  const lockedSym = report1.upPicks[0].symbol;
  const laterTime = new Date('2026-11-24T09:00:00.000Z'); // 14:30:00 IST
  const report2 = mgr.syncAndBuildReport({
    allStocks: [
      makeMockStock({
        symbol: lockedSym,
        price: report1.upPicks[0].price + 12,
        changePercent: 0.2,
        indicators: { rvol: 0.9, xTimeVolume: 0.5, adx: 15 } as any,
      }),
    ],
    getExtendedBarsFn: () => [],
    now: laterTime,
    upstoxConnected: true,
    bypassCache: true,
  });
  const stillLocked = report2.upPicks.find((r) => r.symbol === lockedSym);
  assert.ok(stillLocked, 'Rule 4 sticky lock must keep listed stock until 23:59 IST');
  assert.ok(stillLocked.livePnlRs > 0, 'Sticky locked row should update live MTM P&L');

  // Verify Rule 1 23:59:00 IST daily auto-flush empties all stocks
  const flushTime = new Date('2026-11-24T18:29:10.000Z'); // 23:59:10 IST
  const reportFlush = mgr.syncAndBuildReport({
    allStocks: upStocks,
    getExtendedBarsFn: () => barsStrongUp as any,
    now: flushTime,
    upstoxConnected: true,
    bypassCache: true,
  });
  assert.equal(reportFlush.isMidnightCleared, true);
  assert.equal(reportFlush.upPicks.length, 0);
  assert.equal(reportFlush.downPicks.length, 0);
});

test('Listed At Timestamp: resolves authentic per-stock Order Flow ignition bar time (not 15:15:00) and locks exact live IST admission time', () => {
  // Post-market snapshot (18:10 IST) with candles running all the way to 15:25:00
  const postMarketSession = getLockedSessionWindowStatus(new Date('2026-11-24T12:40:00.000Z'), false);
  assert.equal(postMarketSession.phase, 'POST_SCAN_LOCKED');

  // Stock A ignites at 10:05:00 (bar idx 8), Stock B ignites at 11:45:00 (bar idx 28), both have bars until 15:25:00
  const makeSessionBarsWithSpike = (spikeBarIdx: number): ClaudeFnoBar[] => {
    const out: ClaudeFnoBar[] = [];
    let px = 1000;
    for (let i = 0; i < 73; i++) {
      const secIST = 9 * 3600 + 25 * 60 + i * 300; // 09:25 .. 15:25
      const h = Math.floor(secIST / 3600);
      const m = Math.floor((secIST % 3600) / 60);
      const timeIST = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
      const isSpike = i === spikeBarIdx;
      const open = px;
      const close = isSpike ? px + 8 : i < spikeBarIdx ? px - 0.1 : px + 0.3;
      out.push({
        timeIST,
        dateIST: '2026-11-24',
        secIST,
        open: Number(open.toFixed(2)),
        high: Number((Math.max(open, close) + 0.5).toFixed(2)),
        low: Number((Math.min(open, close) - 0.5).toFixed(2)),
        close: Number(close.toFixed(2)),
        volume: isSpike ? 600000 : 100000,
      });
      px = close;
    }
    return out;
  };

  const barsA = makeSessionBarsWithSpike(8); // 10:05:00
  const barsB = makeSessionBarsWithSpike(28); // 11:45:00

  const secA = resolveOrderFlowListedAtSec({
    bars: barsA,
    direction: 'BUY',
    poc: 1002,
    vwap: 1002,
    session: postMarketSession,
    isIncrementalLiveAdmission: false,
  });
  const secB = resolveOrderFlowListedAtSec({
    bars: barsB,
    direction: 'BUY',
    poc: 1002,
    vwap: 1002,
    session: postMarketSession,
    isIncrementalLiveAdmission: false,
  });

  assert.equal(secA, 10 * 3600 + 5 * 60, 'Stock A must list at 10:05:00, not 15:15:00');
  assert.equal(secB, 11 * 3600 + 45 * 60, 'Stock B must list at 11:45:00, not 15:15:00');
  assert.notEqual(secA, 15 * 3600 + 15 * 60);
  assert.notEqual(secB, 15 * 3600 + 15 * 60);

  // Incremental live admission inside 09:20-15:15 IST stamps exact live IST second and locks it permanently
  const mgr = new OrderFlowScannerManager();
  const t1 = new Date('2026-11-24T04:40:00.000Z'); // 10:10:00 IST
  const barsInit = makeIntradayBars({
    startPrice: 1180,
    stepPerBar: 3.5,
    baseVol: 110000,
    surgeLastBars: true,
    lowerWickAbsorption: true,
    count: 10,
  });
  const stock1 = makeMockStock({
    symbol: 'FIRSTFLOW',
    price: barsInit[barsInit.length - 1].close,
    changePercent: 2.5,
    indicators: {
      open: 1180,
      high: barsInit[barsInit.length - 1].high,
      low: barsInit[0].low,
      vwap: 1195,
      rvol: 3.4,
      xTimeVolume: 2.3,
      adx: 34,
    } as any,
  });
  const rep1 = mgr.syncAndBuildReport({
    allStocks: [stock1],
    getExtendedBarsFn: () => barsInit as any,
    now: t1,
    upstoxConnected: true,
    bypassCache: true,
  });
  assert.equal(rep1.upPicks.length, 1);
  const firstListedAt = rep1.upPicks[0].listedAt;

  // 60 seconds later at 10:11:00 IST, a brand-new stock qualifies -> stamped 10:11:00 IST & sorted first (Z->A)
  const t2 = new Date('2026-11-24T04:41:00.000Z'); // 10:11:00 IST
  const stock2 = makeMockStock({
    symbol: 'SECONDFLOW',
    price: barsInit[barsInit.length - 1].close,
    changePercent: 2.8,
    indicators: {
      open: 1180,
      high: barsInit[barsInit.length - 1].high,
      low: barsInit[0].low,
      vwap: 1195,
      rvol: 3.6,
      xTimeVolume: 2.4,
      adx: 36,
    } as any,
  });
  const rep2 = mgr.syncAndBuildReport({
    allStocks: [stock1, stock2],
    getExtendedBarsFn: () => barsInit as any,
    now: t2,
    upstoxConnected: true,
    bypassCache: true,
  });
  assert.equal(rep2.upPicks.length, 2);
  assert.equal(rep2.upPicks[0].symbol, 'SECONDFLOW', 'Newly admitted stock at 10:11:00 must sort first (Z->A)');
  assert.equal(rep2.upPicks[0].listedAt, '10:11:00');
  assert.equal(rep2.upPicks[1].symbol, 'FIRSTFLOW');
  assert.equal(rep2.upPicks[1].listedAt, firstListedAt, 'Original stock listedAt must stay permanently locked');
});

