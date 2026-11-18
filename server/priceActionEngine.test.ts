import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPriceActionReport,
  computePriceActionTradeLevels,
  evaluateCandleStrength,
  evaluatePriceActionSide,
} from './priceActionEngine';
import { ClaudeFnoBar, resampleClaudeBars } from './claudeFnoEngine';

function makeBar(
  timeIST: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 50000,
  dateIST = '2026-11-17'
): ClaudeFnoBar {
  const [hh, mm, ss] = timeIST.split(':').map((x) => parseInt(x, 10) || 0);
  return {
    timeIST,
    dateIST,
    secIST: hh * 3600 + mm * 60 + ss,
    open,
    high,
    low,
    close,
    volume,
  };
}

/**
 * Generate a 5m intraday + prior-day sequence that cleanly satisfies:
 * 1H = HH + HL, 30M = HH + HL, 15M = Bullish BOS/CHoCH + Demand Hold/SSL Sweep,
 * 5M = Bullish BOS + Strong Bullish Candle + 5M RVOL >= 1.5 + RS > NIFTY + R:R >= 2.0
 */
function buildBullish9Of9Bars(): ClaudeFnoBar[] {
  const bars: ClaudeFnoBar[] = [];
  // Previous day baseline: lower highs & lower lows establishing PDH=110, PDL=95
  for (let i = 0; i < 48; i++) {
    const mins = 9 * 60 + 15 + i * 5;
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    const drift = i < 24 ? 100 - i * 0.2 : 95.2 + (i - 24) * 0.6;
    bars.push(makeBar(`${hh}:${mm}:00`, drift, drift + 0.8, drift - 0.8, drift + 0.2, 40000, '2026-11-16'));
  }

  // Today session 09:15 to 12:35 (41 bars of 5m -> 4 bars of 1H, 7 bars of 30M, 13 bars of 15M)
  // Carefully craft multi-hour ascending HH + HL structure:
  // Hour 1 (09:15..10:10): 100 -> 106 -> pullback to 102
  // Hour 2 (10:15..11:10): sweep SL then rally to 114 -> pullback to 107 (HL > 102)
  // Hour 3 (11:15..12:10): rally to 122 (HH > 114), pullback to 113 (HL > 107)
  // Latest bars (12:15..12:30): SSL sweep then strong breakout BOS with 2.4x RVOL
  const prices: Array<{ o: number; h: number; l: number; c: number; v: number }> = [
    // 09:15-09:40 (Hour 1 first half)
    { o: 100.0, h: 103.0, l: 99.5, c: 102.5, v: 45000 },
    { o: 102.5, h: 105.0, l: 102.0, c: 104.5, v: 42000 },
    { o: 104.5, h: 106.5, l: 104.0, c: 106.0, v: 40000 },
    { o: 106.0, h: 106.2, l: 104.0, c: 104.4, v: 38000 },
    { o: 104.4, h: 104.8, l: 102.0, c: 102.6, v: 35000 },
    { o: 102.6, h: 103.5, l: 101.8, c: 103.2, v: 36000 },
    // 09:45-10:10 (Hour 1 second half -> HL at 101.5, then bounce)
    { o: 103.2, h: 104.0, l: 102.0, c: 102.4, v: 34000 },
    { o: 102.4, h: 102.8, l: 101.5, c: 102.1, v: 35000 },
    { o: 102.1, h: 105.0, l: 102.0, c: 104.8, v: 41000 },
    { o: 104.8, h: 108.0, l: 104.5, c: 107.6, v: 43000 },
    { o: 107.6, h: 110.0, l: 107.0, c: 109.5, v: 44000 },
    { o: 109.5, h: 111.5, l: 109.0, c: 111.0, v: 42000 },
    // 10:15-10:40 (Hour 2 first half -> HH=114.5)
    { o: 111.0, h: 113.0, l: 110.5, c: 112.5, v: 45000 },
    { o: 112.5, h: 114.5, l: 112.0, c: 114.0, v: 48000 },
    { o: 114.0, h: 114.2, l: 111.5, c: 112.0, v: 39000 },
    { o: 112.0, h: 112.4, l: 109.0, c: 109.5, v: 37000 },
    { o: 109.5, h: 110.0, l: 107.2, c: 107.8, v: 36000 },
    { o: 107.8, h: 109.5, l: 107.5, c: 109.2, v: 38000 },
    // 10:45-11:10 (Hour 2 second half -> rally to 116)
    { o: 109.2, h: 112.0, l: 109.0, c: 111.8, v: 42000 },
    { o: 111.8, h: 115.0, l: 111.5, c: 114.6, v: 46000 },
    { o: 114.6, h: 116.5, l: 114.0, c: 116.0, v: 47000 },
    { o: 116.0, h: 116.2, l: 113.5, c: 114.0, v: 39000 },
    { o: 114.0, h: 114.4, l: 111.0, c: 111.5, v: 37000 },
    { o: 111.5, h: 112.5, l: 110.8, c: 112.0, v: 36000 },
    // 11:15-11:40 (Hour 3 first half -> HH=121, pullback HL=115)
    { o: 112.0, h: 116.0, l: 111.8, c: 115.8, v: 46000 },
    { o: 115.8, h: 119.5, l: 115.5, c: 119.0, v: 50000 },
    { o: 119.0, h: 121.5, l: 118.8, c: 121.0, v: 52000 },
    { o: 121.0, h: 121.2, l: 118.0, c: 118.4, v: 40000 },
    { o: 118.4, h: 118.8, l: 115.5, c: 116.0, v: 38000 },
    { o: 116.0, h: 116.8, l: 115.0, c: 116.4, v: 37000 },
    // 11:45-12:10 (Hour 3 second half -> sweep 114.5 & reclaim demand zone)
    { o: 116.4, h: 117.5, l: 115.8, c: 117.2, v: 40000 },
    { o: 117.2, h: 118.2, l: 116.5, c: 118.0, v: 41000 },
    { o: 118.0, h: 118.4, l: 114.4, c: 117.6, v: 48000 }, // wicks below 115.0 & closes above -> SSL sweep!
    { o: 117.6, h: 122.0, l: 117.5, c: 121.8, v: 65000 }, // 15m Bullish BOS close above 121.5? let's make 122.2
    { o: 121.8, h: 123.5, l: 121.0, c: 123.0, v: 60000 },
    { o: 123.0, h: 123.4, l: 121.8, c: 122.2, v: 42000 },
    // 12:15-12:30 (Hour 4 start -> pullback then 5m BOS + Strong Bullish Candle + RVOL >= 1.5)
    { o: 122.2, h: 122.8, l: 121.2, c: 121.6, v: 39000 },
    { o: 121.6, h: 122.5, l: 121.3, c: 122.4, v: 42000 },
    { o: 122.4, h: 126.2, l: 122.2, c: 126.0, v: 115000 }, // 5m BOS > 123.5, body=90%, RVOL ~2.6x
  ];

  prices.forEach((p, idx) => {
    const mins = 9 * 60 + 15 + idx * 5;
    const hh = String(Math.floor(mins / 60)).padStart(2, '0');
    const mm = String(mins % 60).padStart(2, '0');
    bars.push(makeBar(`${hh}:${mm}:00`, p.o, p.h, p.l, p.c, p.v, '2026-11-17'));
  });
  return bars;
}

test('Candle Strength and VWAP-free Risk-Reward Filter calculate accurately', () => {
  const bull = evaluateCandleStrength(makeBar('10:00:00', 100, 110, 99, 109), 'BUY');
  assert.equal(bull.isStrongCandle, true);
  assert.ok(bull.bodyPct >= 80);
  assert.equal(bull.rejectionType, 'BULLISH_MOMENTUM');

  const weakDoji = evaluateCandleStrength(makeBar('10:05:00', 100, 108, 95, 100.5), 'BUY');
  assert.equal(weakDoji.isStrongCandle, false);

  const bear = evaluateCandleStrength(makeBar('10:10:00', 110, 111, 100, 101), 'SELL');
  assert.equal(bear.isStrongCandle, true);
  assert.equal(bear.rejectionType, 'BEARISH_MOMENTUM');

  const rrTrade = computePriceActionTradeLevels({
    side: 'BUY',
    entryPrice: 126,
    pdh: 110,
    pdl: 95,
    orh: 106.5,
    orl: 99.5,
    swingHighs: [116, 121.5],
    swingLows: [114.4, 121.2],
    zoneLow: 114.4,
    zoneHigh: 118.4,
    atr25: 2.2,
    capital: 100000,
    riskPct: 1,
  });
  assert.ok(rrTrade.rrNumeric >= 2.0);
  assert.ok(rrTrade.positionSize > 0);
  assert.equal(rrTrade.riskAmount, 1000);
});

test('All 9 BUY conditions trigger BUY SIGNAL when multi-timeframe Price Action aligns', () => {
  const bars5m = buildBullish9Of9Bars();
  const bars15m = resampleClaudeBars(bars5m, 15);
  const bars30m = resampleClaudeBars(bars5m, 30);
  const bars1h = resampleClaudeBars(bars5m, 60);

  const row = evaluatePriceActionSide({
    symbol: 'TITAN',
    displayName: 'Titan Company',
    category: 'EQUITY_FNO',
    side: 'BUY',
    bars5m,
    bars15m,
    bars30m,
    bars1h,
    price: 126.0,
    changePercent: 3.4,
    niftyChangePct: 0.6,
    sector: 'Consumer Durables',
    sectorChangePct: 1.8,
    bidAskRatio: 1.85,
    orderBookBias: 'Buyer Dominance',
    oiChangePct: 6.2,
    rawVolume: 2400000,
    tradedValueCr: 302.4,
    capital: 100000,
    riskPct: 1,
  });

  // Verify Condition 6 (Candle), 7 (RVOL >= 1.5), 8 (RS > NIFTY), 9 (RR >= 2.0) and MTF structure
  const map = Object.fromEntries(row.conditions.map((c) => [c.id, c]));
  assert.equal(map.HTF_1H_TREND.passed, true, map.HTF_1H_TREND.detail);
  assert.equal(map.MTF_30M_TREND.passed, true, map.MTF_30M_TREND.detail);
  assert.equal(map.TF_15M_BOS_CHOCH.passed, true, map.TF_15M_BOS_CHOCH.detail);
  assert.equal(map.TF_15M_ZONE_OR_SWEEP.passed, true, map.TF_15M_ZONE_OR_SWEEP.detail);
  assert.equal(map.TF_5M_BOS.passed, true, map.TF_5M_BOS.detail);
  assert.equal(map.TF_5M_CANDLE_STRENGTH.passed, true, map.TF_5M_CANDLE_STRENGTH.detail);
  assert.equal(map.TF_5M_RVOL_1_5.passed, true, map.TF_5M_RVOL_1_5.detail);
  assert.equal(map.RS_VS_NIFTY.passed, true, map.RS_VS_NIFTY.detail);
  assert.equal(map.RR_MIN_2.passed, true, map.RR_MIN_2.detail);

  assert.equal(row.score, 9);
  assert.equal(row.isFinalSignal, true);
  assert.equal(row.signalBadge, 'BUY SIGNAL');
  assert.equal(row.orbStatus, 'ABOVE_ORH');
  assert.equal(row.rsLabel, 'RELATIVE STRENGTH');
});

test('SELL conditions mirror BUY logic cleanly and Condition 8 enforces Stock RS < FNO & All Index (not < NIFTY)', () => {
  const bullBars = buildBullish9Of9Bars();
  // Invert around 250 so trend, sweeps, and breakouts mirror cleanly downward
  const bearBars: ClaudeFnoBar[] = bullBars.map((b) => ({
    ...b,
    open: Number((250 - b.open).toFixed(2)),
    high: Number((250 - b.low).toFixed(2)),
    low: Number((250 - b.high).toFixed(2)),
    close: Number((250 - b.close).toFixed(2)),
  }));

  // 1) Stock (-2.9%) < FNO (-0.8%) and < All Index (+0.7%) -> Condition 8 PASSES (9/9 SELL SIGNAL)
  const passRow = evaluatePriceActionSide({
    symbol: 'INDUSINDBK',
    displayName: 'IndusInd Bank',
    category: 'EQUITY_FNO',
    side: 'SELL',
    bars5m: bearBars,
    bars15m: resampleClaudeBars(bearBars, 15),
    bars30m: resampleClaudeBars(bearBars, 30),
    bars1h: resampleClaudeBars(bearBars, 60),
    price: 124.0,
    changePercent: -2.9,
    niftyChangePct: 0.4,
    fnoAvgChangePct: -0.8,
    allIndexChangePct: 0.7,
    sector: 'Banking & Financials',
    sectorChangePct: -1.1,
    bidAskRatio: 0.45,
    orderBookBias: 'Heavy Seller Supply',
    oiChangePct: 8.1,
    rawVolume: 4100000,
    tradedValueCr: 508.4,
    capital: 100000,
    riskPct: 1,
  });

  const c8Pass = passRow.conditions.find((c) => c.number === 8);
  assert.ok(c8Pass);
  assert.equal(c8Pass.id, 'RS_LT_FNO_AND_ALL_INDEX');
  assert.equal(c8Pass.label, 'Stock RS < FNO & All Index');
  assert.equal(c8Pass.passed, true);
  assert.equal(passRow.score, 9);
  assert.equal(passRow.isFinalSignal, true);
  assert.equal(passRow.signalBadge, 'SELL SIGNAL');
  assert.equal(passRow.rsLabel, 'RELATIVE WEAKNESS');
  assert.equal(passRow.rsBenchmarkLabel, 'FNO & ALL INDEX');
  assert.equal(passRow.orbStatus, 'BELOW_ORL');

  // 2) Stock (-0.4%) IS < NIFTY (+0.4%), BUT NOT < FNO (-0.8%) -> Condition 8 FAILS (8/9, NO SELL SIGNAL)
  const failOldNiftyRuleRow = evaluatePriceActionSide({
    symbol: 'INDUSINDBK',
    displayName: 'IndusInd Bank',
    category: 'EQUITY_FNO',
    side: 'SELL',
    bars5m: bearBars,
    bars15m: resampleClaudeBars(bearBars, 15),
    bars30m: resampleClaudeBars(bearBars, 30),
    bars1h: resampleClaudeBars(bearBars, 60),
    price: 124.0,
    changePercent: -0.4,
    niftyChangePct: 0.4,
    fnoAvgChangePct: -0.8,
    allIndexChangePct: 0.7,
    sector: 'Banking & Financials',
    sectorChangePct: -1.1,
    bidAskRatio: 0.45,
    orderBookBias: 'Heavy Seller Supply',
    oiChangePct: 8.1,
    rawVolume: 4100000,
    tradedValueCr: 508.4,
    capital: 100000,
    riskPct: 1,
  });

  const c8Fail = failOldNiftyRuleRow.conditions.find((c) => c.number === 8);
  assert.ok(c8Fail);
  assert.equal(c8Fail.id, 'RS_LT_FNO_AND_ALL_INDEX');
  assert.equal(c8Fail.passed, false);
  assert.equal(failOldNiftyRuleRow.score, 8);
  assert.equal(failOldNiftyRuleRow.isFinalSignal, false);
});

test('buildPriceActionReport computes FNO Avg % and All Index Avg % across F&O stocks and all benchmark indices', () => {
  const bullBars = buildBullish9Of9Bars();
  const bearBars: ClaudeFnoBar[] = bullBars.map((b) => ({
    ...b,
    open: Number((250 - b.open).toFixed(2)),
    high: Number((250 - b.low).toFixed(2)),
    low: Number((250 - b.high).toFixed(2)),
    close: Number((250 - b.close).toFixed(2)),
  }));
  const report = buildPriceActionReport({
    stocks: [
      {
        symbol: 'INDUSINDBK',
        name: 'IndusInd Bank',
        sector: 'Banking & Financials',
        price: 124,
        changePercent: -3.0,
        volume: 3000000,
        bidAskRatio: 0.5,
      } as any,
      {
        symbol: 'RELIANCE',
        name: 'Reliance Industries',
        sector: 'Energy & Oil',
        price: 1320,
        changePercent: 1.0,
        volume: 2000000,
        bidAskRatio: 1.3,
      } as any,
    ],
    getExtendedBarsFn: (sym) => (sym === 'INDUSINDBK' ? bearBars : undefined) as any,
    candlesMap: new Map(),
    indexQuotes: {
      'NIFTY 50': { chp: 0.5 } as any,
      BANKNIFTY: { chp: 1.5 } as any,
      FINNIFTY: { chp: 1.0 } as any,
      SENSEX: { chp: 1.0 } as any,
    },
    isMidnightCleared: false,
  });

  // FNO Avg = (-3.0 + 1.0) / 2 = -1.0; All Index Avg = (0.5 + 1.5 + 1.0 + 1.0) / 4 = 1.0; Composite = 0.0
  assert.equal(report.fnoAvgChangePct, -1.0);
  assert.equal(report.allIndexChangePct, 1.0);
  assert.equal(report.fnoAndAllIndexPct, 0);
  const indus = report.categories.allSignals.find((r) => r.symbol === 'INDUSINDBK');
  assert.ok(indus);
  assert.equal(indus.conditions.find((c) => c.number === 8)?.passed, true);
});

test('buildPriceActionReport generates zero fake rows when real intraday candles are missing', () => {
  const report = buildPriceActionReport({
    stocks: [
      {
        symbol: 'TCS',
        name: 'Tata Consultancy Services',
        sector: 'IT Services',
        price: 4120,
        changePercent: 1.9,
        volume: 1500000,
        bidAskRatio: 1.4,
      } as any,
    ],
    getExtendedBarsFn: () => undefined,
    candlesMap: new Map(),
    indexQuotes: {},
    isMidnightCleared: false,
  });

  assert.equal(report.totalScanned, 0);
  assert.equal(report.qualifiedCount, 0);
  assert.equal(report.categories.allSignals.length, 0);
});
