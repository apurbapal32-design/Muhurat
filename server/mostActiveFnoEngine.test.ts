import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMostActiveFnoReport } from './mostActiveFnoEngine';
import { IntradayCandleBar } from './autonomousPriceService';
import { getISTDateParts } from '../src/data/marketSchedule';
import { ScannedStock } from '../src/types';

function makeStock(overrides: Partial<ScannedStock>): ScannedStock {
  const lp = Number(overrides.price ?? 1000);
  const chgPct = Number(overrides.changePercent ?? -1.5);
  return {
    symbol: overrides.symbol || 'TESTSTK',
    name: overrides.name || 'Test Stock Ltd',
    sector: overrides.sector || 'Capital Goods & Defense',
    price: lp,
    change: Number((lp * (chgPct / 100)).toFixed(2)),
    changePercent: chgPct,
    volume: overrides.volume ?? 450000,
    signal: chgPct >= 0 ? 'BUY' : 'SELL',
    aiScore: 86,
    bidAskRatio: chgPct >= 0 ? 1.42 : 0.72,
    keyTriggers: ['ORB Breakdown'],
    listedAt: overrides.listedAt,
    fixedEntryPrice: overrides.fixedEntryPrice,
    scoreBreakdown: {
      vwap: 7,
      emaTrend: 7,
      rsi: 5,
      adx: 5,
      volume: 6,
      rvol: 6,
      oiScore: 12,
      priceAction: 5,
    },
    indicators: {
      price: lp,
      open: lp * 1.02,
      high: lp * 1.025,
      low: lp * 0.992,
      close: lp,
      volume: overrides.volume ?? 450000,
      avgVolume20: 180000,
      ema13: lp * 0.998,
      ema21: lp * 1.004,
      ema34: lp * 1.01,
      vwap: lp * 1.005,
      rsi: chgPct >= 0 ? 64 : 34,
      macd: chgPct >= 0 ? 4 : -4,
      macdSignal: 0,
      macdHist: chgPct >= 0 ? 2 : -2,
      adx: 28,
      atr: lp * 0.012,
      supertrend: lp * 1.01,
      supertrendDirection: chgPct >= 0 ? 'BUY' : 'SELL',
      bbUpper: lp * 1.03,
      bbMiddle: lp,
      bbLower: lp * 0.97,
      rvol: 2.1,
      volumeBreakout: true,
      pdh: lp * 1.02,
      pdl: lp * 0.99,
      cprPivot: lp,
      cprBC: lp * 0.995,
      cprTC: lp * 1.005,
      pivotR1: lp * 1.015,
      pivotS1: lp * 0.995,
      pivotR2: lp * 1.03,
      pivotS2: lp * 0.98,
      swingHigh: lp * 1.02,
      swingLow: lp * 0.99,
    },
    risk: {
      entryPrice: overrides.fixedEntryPrice ?? lp,
      stopLoss: lp * 1.02,
      target1: lp * 0.96,
      target2: lp * 0.93,
      riskAmount: 20,
      rewardAmountT1: 40,
      rewardAmountT2: 70,
      riskRewardRatio: 2.0,
      recommendedQty: 50,
      positionValue: 50000,
      marginRequired: 10000,
    },
    oiData: {
      openInterest: 24.5,
      changeInOI: 3.1,
      changeInOIPercent: 14.5,
      pcr: chgPct >= 0 ? 1.28 : 0.72,
      buildup: chgPct >= 0 ? 'LONG_BUILDUP' : 'SHORT_BUILDUP',
      maxPainStrike: Math.round(lp / 50) * 50,
      totalCallOI: 12,
      totalPutOI: 12,
      atmStrike: Math.round(lp / 50) * 50,
      optionChain: [],
    },
    lastUpdated: new Date().toISOString(),
  };
}

function makeSessionBars(
  todayDateIST: string,
  prevDateIST: string,
  prevRange: [number, number],
  todayCandles: Array<{ time: string; o: number; h: number; l: number; c: number; v: number }>
): IntradayCandleBar[] {
  const prevBars: IntradayCandleBar[] = [
    {
      tsSec: Math.floor((Date.now() - 86400000) / 1000),
      dateIST: prevDateIST,
      timeIST: '09:15:00',
      secIST: 9 * 3600 + 15 * 60,
      open: (prevRange[0] + prevRange[1]) / 2,
      high: prevRange[1],
      low: prevRange[0],
      close: (prevRange[0] + prevRange[1]) / 2,
      volume: 12000,
    },
    {
      tsSec: Math.floor((Date.now() - 86000000) / 1000),
      dateIST: prevDateIST,
      timeIST: '10:00:00',
      secIST: 10 * 3600,
      open: (prevRange[0] + prevRange[1]) / 2,
      high: prevRange[1] - 5,
      low: prevRange[0] + 5,
      close: prevRange[1] - 10,
      volume: 11000,
    },
  ];
  const currBars: IntradayCandleBar[] = todayCandles.map((b, idx) => {
    const [hh, mm, ss] = b.time.split(':').map(Number);
    return {
      tsSec: Math.floor(Date.now() / 1000) + idx * 300,
      dateIST: todayDateIST,
      timeIST: b.time,
      secIST: hh * 3600 + mm * 60 + (ss || 0),
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v,
    };
  });
  return [...prevBars, ...currBars];
}

test('Most Active FNO derives equity entryPrice and listedAt from actual trigger candle instead of stale fixedEntryPrice', () => {
  const ist = getISTDateParts(new Date());
  const prevDateIST = '2025-01-01';

  // Mirror real ABB bug case: ORB breakdown happens at 10:15:00 (O:6882.5 H:6882.5 L:6834.5 C:6845)
  // while stale stock.fixedEntryPrice was 6950.83 and stock.listedAt was 10:17:45.
  const abbStock = makeStock({
    symbol: 'ABB',
    name: 'ABB India Ltd',
    sector: 'Capital Goods & Defense',
    price: 6853,
    changePercent: -2.4,
    volume: 406196,
    fixedEntryPrice: 6950.83,
    listedAt: '10:17:45',
  });
  const peerCapStock = makeStock({
    symbol: 'SIEMENS',
    name: 'Siemens Ltd',
    sector: 'Capital Goods & Defense',
    price: 5400,
    changePercent: -1.2,
    volume: 280000,
  });

  const abbBars = makeSessionBars(ist.dateStr, prevDateIST, [6880, 7120], [
    { time: '09:15:00', o: 7034.5, h: 7034.5, l: 6870.0, c: 6991.0, v: 57218 },
    { time: '09:20:00', o: 6990.0, h: 6993.5, l: 6917.0, c: 6923.5, v: 38677 },
    { time: '09:25:00', o: 6923.5, h: 6923.5, l: 6865.5, c: 6875.0, v: 45633 },
    { time: '09:30:00', o: 6876.0, h: 6924.5, l: 6876.0, c: 6906.0, v: 20015 },
    { time: '09:45:00', o: 6920.0, h: 6989.0, l: 6906.0, c: 6944.5, v: 23708 },
    { time: '10:00:00', o: 6946.5, h: 6950.0, l: 6901.5, c: 6914.0, v: 8175 },
    { time: '10:10:00', o: 6910.0, h: 6916.0, l: 6860.0, c: 6884.0, v: 19361 },
    { time: '10:15:00', o: 6882.5, h: 6882.5, l: 6834.5, c: 6845.0, v: 61409 },
    { time: '10:20:00', o: 6842.0, h: 6865.0, l: 6828.5, c: 6853.5, v: 13183 },
    { time: '10:25:00', o: 6851.5, h: 6876.0, l: 6851.5, c: 6870.0, v: 6105 },
    { time: '10:30:00', o: 6869.0, h: 6872.0, l: 6857.0, c: 6860.0, v: 5268 },
    // Bogus cumulative trailing daily bar (like live quote merge):
    { time: '10:35:00', o: 7100.0, h: 7107.0, l: 6834.0, c: 6853.0, v: 406196 },
  ]);
  const peerBars = makeSessionBars(ist.dateStr, prevDateIST, [5420, 5520], [
    { time: '09:15:00', o: 5460, h: 5470, l: 5430, c: 5450, v: 25000 },
    { time: '09:25:00', o: 5450, h: 5452, l: 5410, c: 5420, v: 22000 },
    { time: '09:35:00', o: 5420, h: 5425, l: 5395, c: 5402, v: 28000 },
    { time: '10:00:00', o: 5402, h: 5410, l: 5390, c: 5400, v: 21000 },
  ]);

  const niftyBars = makeSessionBars(ist.dateStr, prevDateIST, [25000, 25150], [
    { time: '09:15:00', o: 25120, h: 25140, l: 25080, c: 25110, v: 85000 },
    { time: '09:30:00', o: 25110, h: 25180, l: 25100, c: 25175, v: 95000 },
    { time: '10:00:00', o: 25175, h: 25240, l: 25170, c: 25230, v: 110000 },
    { time: '10:15:00', o: 25230, h: 25270, l: 25220, c: 25255, v: 105000 },
  ]);

  const report = buildMostActiveFnoReport({
    stocks: [abbStock, peerCapStock],
    getExtendedBarsFn: (sym) => {
      if (sym === 'ABB') return abbBars;
      if (sym === 'SIEMENS') return peerBars;
      if (sym === 'NIFTY 50' || sym === 'NIFTY') return niftyBars;
      return undefined;
    },
    candlesMap: new Map(),
    indexQuotes: {
      'NIFTY 50': {
        symbol: 'NIFTY 50',
        instrumentKey: 'NSE_INDEX|Nifty 50',
        description: 'NIFTY 50',
        exchange: 'NSE',
        type: 'INDEX',
        lp: 25255,
        open: 25120,
        high: 25270,
        low: 25080,
        prevClose: 25045,
        ch: 210,
        chp: 0.84,
        volume: 5000000,
        turnoverCr: 2450,
        atp: 25190,
        bid: 25254,
        ask: 25256,
        bidQty: 500,
        askQty: 450,
        oi: 12000000,
        ltt: '10:35:00',
        source: 'AUTONOMOUS_LIVE_ENGINE',
        isMarketOpen: true,
        marketSession: 'OPEN',
        lastRefreshed: new Date().toISOString(),
      },
    },
    optionChainsByIndex: {},
    indiaVix: 15.5,
    isMidnightCleared: false,
    isMarketOffDay: true,
    timeframe: '5m',
  });

  const abbRow = report.categories.rankedEquities.find((r) => r.symbol === 'ABB');
  assert.ok(abbRow, 'ABB should exist in rankedEquities');

  // 1. Entry price must NOT copy stale fixedEntryPrice (6950.83) and MUST come from trigger candle
  const sig5m = abbRow.mtfSignals['5m'];
  assert.notEqual(sig5m.entryPrice, 6950.83);
  assert.ok(sig5m.entryPrice >= 6834.5 && sig5m.entryPrice <= 6882.5, `5m entry ${sig5m.entryPrice} must be inside trigger candle range [6834.5, 6882.5]`);
  assert.ok(sig5m.listedAt >= '10:15:00' && sig5m.listedAt <= '10:19:59', `5m listedAt ${sig5m.listedAt} must belong to 10:15 breakdown candle`);

  // SELL ordering: T2 < T1 < Entry < SL
  assert.ok(sig5m.target2 < sig5m.target1);
  assert.ok(sig5m.target1 < sig5m.entryPrice);
  assert.ok(sig5m.entryPrice < sig5m.stopLoss);

  // 2. Sector % must equal true arithmetic mean of (-2.4 and -1.2) = -1.80
  assert.equal(abbRow.sectorChangePct, -1.8);
  const peerRow = report.categories.rankedEquities.find((r) => r.symbol === 'SIEMENS');
  assert.equal(peerRow?.sectorChangePct, -1.8);

  // 3. Index options should have valid listedAt & sensible entryPrem (not below prevClose on BUY)
  const niftyCe = report.categories.rankedIndexOptions.find((r) => r.underlying === 'NIFTY 50' && r.optionType === 'CE' && r.direction === 'BUY');
  assert.ok(niftyCe, 'NIFTY 50 CE BUY option should exist');
  assert.ok(niftyCe.listedAt >= '09:20:00' && niftyCe.listedAt <= '14:45:00');
  assert.ok(niftyCe.stopLoss < niftyCe.entryPrice && niftyCe.entryPrice < niftyCe.target1 && niftyCe.target1 < niftyCe.target2);
  // 4. Bid/Ask ratio comes from live underlying quote (500 / 450 = 1.11 for CE)
  assert.equal(niftyCe.bidAskRatio, 1.11);
  assert.equal(abbRow.bidAskRatio, 0.72);
});

test('Most Active FNO produces zero fake equity or index option signals when real intraday candles are absent', () => {
  const noCandleStock = makeStock({
    symbol: 'INFY',
    name: 'Infosys Ltd',
    sector: 'IT',
    price: 1850,
    changePercent: 3.2,
    volume: 1250000,
  });

  const report = buildMostActiveFnoReport({
    stocks: [noCandleStock],
    getExtendedBarsFn: () => undefined,
    candlesMap: new Map(),
    indexQuotes: {},
    optionChainsByIndex: {},
    indiaVix: 15.0,
    isMidnightCleared: false,
    isMarketOffDay: true,
    timeframe: '5m',
  });

  assert.equal(report.categories.mostActiveEquities.length, 0);
  assert.equal(report.categories.rankedEquities.length, 0);
  assert.equal(report.categories.mostActiveContractsIndexOptions.length, 0);
});
