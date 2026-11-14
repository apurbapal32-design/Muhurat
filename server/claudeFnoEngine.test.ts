import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeClaudeTradeMath,
  computeOpeningRange0915To0930,
  detectHhHlAndTrend,
  evaluate10PointScore,
  evaluateDailyLossGuardrail,
  evaluateEntryGate,
  resampleClaudeBars,
  buildClaudeFnoReport,
  ClaudeFnoBar,
} from './claudeFnoEngine';
import { ScannedStock } from '../src/types';

test('evaluate10PointScore grants full 10/10 when all 10 exact criteria pass', () => {
  const res = evaluate10PointScore({
    ltp: 1052.5,
    pdh: 1040.0,
    fiveMinClose: 1048.0,
    orh: 1042.0,
    tf15mHhHl: true,
    tf30mHhHl: true,
    breakoutCandle: { open: 1036.0, high: 1051.0, low: 1035.0, close: 1048.0 }, // body = 12, span = 16 => 0.75 >= 0.60
    highestHigh20: 1046.0, // * 1.001 = 1047.046 < 1048.0
    slotVolume: 180000,
    slotAvg10dVolume: 100000, // 1.8x >= 1.5x
    prevDeliveryPct: 56.4, // >= 50%
    stockChangePct: 2.6,
    niftyChangePct: 0.75,
    sectorChangePct: 1.4, // > 0
    dayOpen: 1024.0,
    prevClose: 1018.0, // gap holds: dayOpen > prevClose & ltp > dayOpen
    oiChangePct: 6.8, // > 0 & price up
  });

  assert.equal(res.score, 10);
  assert.equal(res.criteria.length, 10);
  assert.ok(res.criteria.every((c) => c.passed));
  assert.ok(res.bodyRatio >= 0.6);
  assert.ok(res.slotVolumeRatio >= 1.5);
});

test('evaluate10PointScore catches individual threshold boundaries accurately', () => {
  // Body < 0.60, close <= highestHigh20 * 1.001, vol < 1.5x, delivery < 50%
  const res = evaluate10PointScore({
    ltp: 1052.5,
    pdh: 1040.0,
    fiveMinClose: 1048.0,
    orh: 1042.0,
    tf15mHhHl: true,
    tf30mHhHl: false, // fails #3 because BOTH 15m and 30m must show HH+HL
    breakoutCandle: { open: 1040.0, high: 1058.0, low: 1038.0, close: 1048.0 }, // body=8, span=20 -> 0.40 < 0.60
    highestHigh20: 1047.5, // *1.001 = 1048.55 > 1048.0 -> fails #5
    slotVolume: 140000,
    slotAvg10dVolume: 100000, // 1.40x < 1.5x -> fails #6
    prevDeliveryPct: 49.9, // < 50% -> fails #7
    stockChangePct: 0.6,
    niftyChangePct: 0.8, // fails #8
    sectorChangePct: 0.5,
    dayOpen: 1017.0,
    prevClose: 1018.0, // fails #9
    oiChangePct: -1.5, // fails #10
  });

  assert.equal(res.score, 2); // only #1 (LTP>PDH) and #2 (5m close>ORH) pass
  assert.equal(res.criteria.find((c) => c.id === 'TF_15M_30M_HH_HL')?.passed, false);
  assert.equal(res.criteria.find((c) => c.id === 'BREAKOUT_BODY_60')?.passed, false);
  assert.equal(res.criteria.find((c) => c.id === 'CLOSE_GT_HH20_1001')?.passed, false);
  assert.equal(res.criteria.find((c) => c.id === 'VOL_1_5X_10D_SLOT')?.passed, false);
  assert.equal(res.criteria.find((c) => c.id === 'DELIVERY_PCT_50')?.passed, false);
});

test('computeClaudeTradeMath computes exact Entry, SL = max(candleLow, (ORH+ORL)/2), Target, Qty & 1:2 RR', () => {
  // Case 1: candleLow (1022) > (ORH+ORL)/2 ((1030+1010)/2 = 1020)
  const math1 = computeClaudeTradeMath({
    breakoutCandleHigh: 1040,
    breakoutCandleLow: 1022,
    orh: 1030,
    orl: 1010,
    capital: 100000,
  });
  assert.equal(math1.entry, 1040);
  assert.equal(math1.orMid, 1020);
  assert.equal(math1.sl, 1022);
  assert.equal(math1.riskPerShare, 18);
  assert.equal(math1.target, 1040 + 2 * 18); // 1076
  assert.equal(math1.qty, Math.floor(1000 / 18)); // (100000 * 1%) / 18 = 55
  assert.equal(math1.rrNumeric, 2);
  assert.equal(math1.isValidRR, true);

  // Case 2: (ORH+ORL)/2 (1026) > candleLow (1020) -> SL picks 1026
  const math2 = computeClaudeTradeMath({
    breakoutCandleHigh: 1040,
    breakoutCandleLow: 1020,
    orh: 1036,
    orl: 1016,
    capital: 200000,
  });
  assert.equal(math2.sl, 1026);
  assert.equal(math2.riskPerShare, 14);
  assert.equal(math2.target, 1068);
  assert.equal(math2.qty, Math.floor(2000 / 14)); // 142

  // Case 3: Invalid when Entry <= SL
  const mathBad = computeClaudeTradeMath({
    breakoutCandleHigh: 1015,
    breakoutCandleLow: 1010,
    orh: 1030,
    orl: 1010, // orMid = 1020 >= 1015
    capital: 100000,
  });
  assert.equal(mathBad.isValidRR, false);
  assert.equal(mathBad.qty, 0);
});

test('evaluateEntryGate enforces score >= 8, LTP > VWAP, 1H & 30m trend agree, window & exclusions', () => {
  const validGate = evaluateEntryGate({
    score: 8,
    ltp: 505,
    vwap: 500,
    trend1h: 'UP',
    trend30m: 'UP',
    candleSecIST: 10 * 3600 + 15 * 60, // 10:15 IST
    isResultDay: false,
    isCircuitLimit: false,
    isValidRR: true,
    dailyLossHalted: false,
  });
  assert.equal(validGate.allPassed, true);
  assert.deepEqual(validGate.blockReasons, []);

  // Rejects score < 8, first 5 min, last 15 min, result day, circuit limit, 2% loss halt
  const blockedGate = evaluateEntryGate({
    score: 7,
    ltp: 499,
    vwap: 500,
    trend1h: 'UP',
    trend30m: 'DOWN',
    candleSecIST: 9 * 3600 + 17 * 60, // first 5 mins
    isResultDay: true,
    isCircuitLimit: true,
    isValidRR: false,
    dailyLossHalted: true,
  });
  assert.equal(blockedGate.allPassed, false);
  assert.ok(blockedGate.blockReasons.length >= 6);
});

test('evaluateDailyLossGuardrail halts trading for day at >= 2.0% capital loss', () => {
  assert.equal(evaluateDailyLossGuardrail(1.99).halted, false);
  assert.equal(evaluateDailyLossGuardrail(2.0).halted, true);
  assert.equal(evaluateDailyLossGuardrail(3.5).halted, true);
});

test('resampleClaudeBars, detectHhHlAndTrend, and computeOpeningRange0915To0930 compute HH+HL & 9:15-9:30 ORH', () => {
  const bars: ClaudeFnoBar[] = [];
  const startSec = 9 * 3600 + 15 * 60;
  // Build 18 5m bars (90 minutes -> six 15m, three 30m, two 1H buckets) smoothly trending higher
  for (let i = 0; i < 18; i++) {
    const sec = startSec + i * 300;
    const base = 1000 + i * 2.5;
    bars.push({
      dateIST: '2026-11-13',
      secIST: sec,
      timeIST: `${String(Math.floor(sec / 3600)).padStart(2, '0')}:${String(Math.floor((sec % 3600) / 60)).padStart(2, '0')}:00`,
      open: base,
      high: base + 3.0,
      low: base - 0.5,
      close: base + 2.4,
      volume: 10000 + i * 2000,
    });
  }

  const orb = computeOpeningRange0915To0930(bars, 1000, 1005);
  assert.equal(orb.orh, 1008); // 3rd 5m bar (09:25) base=1005 + 3.0 = 1008
  assert.equal(orb.orl, 999.5); // 1st 5m bar (09:15) low = 999.5

  const bars15m = resampleClaudeBars(bars, 15);
  const bars30m = resampleClaudeBars(bars, 30);
  const bars1h = resampleClaudeBars(bars, 60);

  const d15 = detectHhHlAndTrend(bars15m);
  const d30 = detectHhHlAndTrend(bars30m);
  const d1h = detectHhHlAndTrend(bars1h);

  assert.equal(d15.isHhHl, true);
  assert.equal(d30.isHhHl, true);
  assert.equal(d30.trend, 'UP');
  assert.equal(d1h.trend, 'UP');
});

test('buildClaudeFnoReport integrates stocks, Top Vol+Val overlap, Z->A Listed At, and 2% loss halt', () => {
  const today = '2026-11-13';
  const prev = '2026-11-12';
  const makeBars = (base: number, strongBreakout: boolean) => {
    const out: any[] = [];
    for (let i = 0; i < 10; i++) {
      const sec = 9 * 3600 + 15 * 60 + i * 300;
      out.push({
        tsSec: 1700000000 + i * 300,
        dateIST: prev,
        timeIST: '09:30',
        secIST: sec,
        open: base - 15 + i * 0.5,
        high: base - 10 + i * 0.5,
        low: base - 18 + i * 0.5,
        close: base - 11 + i * 0.5,
        volume: 10000,
      });
    }
    for (let i = 0; i < 25; i++) {
      const sec = 9 * 3600 + 15 * 60 + i * 300;
      const step = strongBreakout ? i * 1.4 : i * 0.1;
      const open = base + step;
      const close = i === 24 && strongBreakout ? open + 12 : open + (strongBreakout ? 2.2 : 0.1);
      const high = i === 24 && strongBreakout ? open + 13 : open + 2.5;
      const low = open - 0.5;
      out.push({
        tsSec: 1700100000 + i * 300,
        dateIST: today,
        timeIST: '11:15',
        secIST: sec,
        open,
        high,
        low,
        close,
        volume: i === 24 && strongBreakout ? 45000 : 12000,
      });
    }
    return out;
  };

  const strongStock: ScannedStock = {
    symbol: 'TATAELXSI',
    name: 'Tata Elxsi',
    sector: 'IT',
    price: 1046,
    change: 56,
    changePercent: 5.6,
    volume: 9500000,
    signal: 'BUY',
    aiScore: 92,
    scoreBreakdown: {} as any,
    indicators: { open: 1002, high: 1048, low: 999, close: 990, vwap: 1020, pdh: 1000, pdl: 970 } as any,
    risk: {} as any,
    oiData: { openInterest: 20, changeInOI: 3, changeInOIPercent: 14.5, pcr: 1.2, buildup: 'LONG_BUILDUP', maxPainStrike: 1050, totalCallOI: 10, totalPutOI: 12, atmStrike: 1050, optionChain: [] },
    lastUpdated: '11:15:00',
    listedAt: '11:15:00',
    bidAskRatio: 1.45,
    keyTriggers: [],
  };
  (strongStock as any).deliveryPercent = 62.5;

  const report = buildClaudeFnoReport({
    stocks: [strongStock],
    getExtendedBarsFn: () => makeBars(1000, true),
    candlesMap: new Map(),
    indexQuotes: {
      'NIFTY 50': {
        symbol: 'NIFTY 50',
        instrumentKey: 'NSE_INDEX|Nifty 50',
        description: 'NIFTY 50',
        exchange: 'NSE',
        type: 'INDEX',
        lp: 25250,
        open: 25150,
        high: 25280,
        low: 25120,
        prevClose: 25100,
        ch: 150,
        chp: 0.6,
        volume: 0,
        turnoverCr: 0,
        atp: 25200,
        bid: 25249,
        ask: 25251,
        bidQty: 0,
        askQty: 0,
        oi: 0,
        ltt: '11:15:00',
        source: 'AUTONOMOUS_LIVE_ENGINE',
        isMarketOpen: true,
        marketSession: 'OPEN',
        lastRefreshed: new Date().toISOString(),
      },
    },
    optionChainsByIndex: {},
    indiaVix: 15,
    isMidnightCleared: false,
    isMarketOffDay: false,
    capital: 100000,
    dailyLossPct: 0,
  });

  assert.equal(report.scannerName, 'Claude FNO & (Index Options)');
  assert.equal(report.isTradingHaltedForDay, false);
  assert.equal(report.categories.equitiesFno.length, 1);
  const hit = report.categories.equitiesFno[0];
  assert.ok(hit.score >= 8, `Expected score >= 8, got ${hit.score}`);
  assert.equal(hit.inBothTopVolAndVal, true);
  assert.equal(hit.statusBadge, 'TAKE TRADE');
  assert.ok(hit.tradeMath.rrNumeric >= 2);
  assert.ok(hit.tradeMath.qty > 0);

  // Now simulate >= 2% daily capital loss halt
  const haltedReport = buildClaudeFnoReport({
    stocks: [strongStock],
    getExtendedBarsFn: () => makeBars(1000, true),
    candlesMap: new Map(),
    indexQuotes: {},
    optionChainsByIndex: {},
    indiaVix: 15,
    isMidnightCleared: false,
    capital: 100000,
    dailyLossPct: 2.1,
  });
  assert.equal(haltedReport.isTradingHaltedForDay, true);
  assert.ok(haltedReport.haltReason?.includes('2.00%'));
  assert.equal(haltedReport.categories.equitiesFno.every((r) => !r.executionAllowed), true);
});
