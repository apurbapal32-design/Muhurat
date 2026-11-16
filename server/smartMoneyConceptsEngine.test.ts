import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSmartMoneyConceptsReport,
  computeAtr25,
  computePremiumDiscountAndOte,
  computeRsi14,
  computeRvolFromBars,
  computeSessionVwap,
  computeSmcTradeMath,
  detectLatestFvg,
  detectOrderBlock,
  detectSwingPoints,
  evaluateLiquidity,
  evaluateMarketStructure,
} from './smartMoneyConceptsEngine';
import { ClaudeFnoBar } from './claudeFnoEngine';

function makeBar(timeIST: string, open: number, high: number, low: number, close: number, volume = 50000): ClaudeFnoBar {
  const [hh, mm, ss] = timeIST.split(':').map((x) => parseInt(x, 10) || 0);
  return {
    timeIST,
    dateIST: '2026-11-16',
    secIST: hh * 3600 + mm * 60 + ss,
    open,
    high,
    low,
    close,
    volume,
  };
}

test('Worked Example: Buy & Sell OTE 0.705, Risk 1%, Position Size 144, RR 2.04, Breakeven 33.33% at 1:2', () => {
  const pdBuy = computePremiumDiscountAndOte(120, 100, 105.9);
  assert.equal(pdBuy.equilibrium, 110);
  assert.equal(pdBuy.zone, 'DISCOUNT');
  assert.equal(pdBuy.oteBuy705, 105.9);

  const buyMath = computeSmcTradeMath({
    side: 'BUY',
    capital: 100000,
    riskPct: 1,
    entry: pdBuy.oteBuy705,
    oteEntry: pdBuy.oteBuy705,
    stopLoss: 99,
    target: 120,
  });
  assert.equal(buyMath.riskAmount, 1000);
  assert.equal(buyMath.riskPerUnit, 6.9);
  assert.equal(buyMath.rrNumeric, 2.04);
  assert.equal(buyMath.positionSize, 144);

  const pdSell = computePremiumDiscountAndOte(120, 100, 114.1);
  assert.equal(pdSell.zone, 'PREMIUM');
  assert.equal(pdSell.oteSell705, 114.1);

  const sellMath = computeSmcTradeMath({
    side: 'SELL',
    capital: 100000,
    riskPct: 1,
    entry: pdSell.oteSell705,
    oteEntry: pdSell.oteSell705,
    stopLoss: 121,
    target: 100,
  });
  assert.equal(sellMath.riskPerUnit, 6.9);
  assert.equal(sellMath.rrNumeric, 2.04);
  assert.equal(sellMath.positionSize, 144);

  const rr2Math = computeSmcTradeMath({
    side: 'BUY',
    capital: 100000,
    riskPct: 1,
    entry: 110,
    oteEntry: 110,
    stopLoss: 100,
    target: 130,
  });
  assert.equal(rr2Math.rrNumeric, 2);
  assert.equal(rr2Math.breakevenWinRatePct, 33.33);
});

test('3-Candle FVG & Consequent Encroachment (CE) detects bullish and bearish gaps accurately', () => {
  const bullBars = [
    makeBar('09:20:00', 100, 104, 99, 103),
    makeBar('09:25:00', 103, 112, 102.5, 111),
    makeBar('09:30:00', 111, 115, 108, 114),
  ];
  const bullFvg = detectLatestFvg(bullBars, 'BUY');
  assert.ok(bullFvg);
  assert.equal(bullFvg.bottom, 104);
  assert.equal(bullFvg.top, 108);
  assert.equal(bullFvg.size, 4);
  assert.equal(bullFvg.ce, 106);
  assert.equal(bullFvg.mitigated, false);

  const bearBars = [
    makeBar('09:20:00', 120, 121, 116, 117),
    makeBar('09:25:00', 117, 117.5, 108, 109),
    makeBar('09:30:00', 109, 112, 106, 107),
  ];
  const bearFvg = detectLatestFvg(bearBars, 'SELL');
  assert.ok(bearFvg);
  assert.equal(bearFvg.top, 116);
  assert.equal(bearFvg.bottom, 112);
  assert.equal(bearFvg.size, 4);
  assert.equal(bearFvg.ce, 114);
  assert.equal(bearFvg.mitigated, false);
});

test('Swing Points, Equal Lows (<=0.1%), SSL Sweep, CHoCH/BOS, and Order Block work end-to-end', () => {
  const bars: ClaudeFnoBar[] = [
    makeBar('09:15:00', 110, 112, 105, 106),
    makeBar('09:20:00', 106, 108, 102, 104),
    makeBar('09:25:00', 104, 105, 100.0, 103), // SL #1 at 100.0
    makeBar('09:30:00', 103, 107, 101.5, 106),
    makeBar('09:35:00', 106, 109, 103, 105),
    makeBar('09:40:00', 105, 111, 104, 107), // SH at 111
    makeBar('09:45:00', 107, 108, 103, 104),
    makeBar('09:50:00', 104, 106, 102, 103),
    makeBar('09:55:00', 103, 104, 100.05, 102), // EQL within 0.05% (< 0.1%)
    makeBar('10:00:00', 102, 105, 101, 104),
    makeBar('10:05:00', 104, 106, 102, 104),
    // SSL Sweep candle: wicks below 100.0 (low=99.2), closes above 100.0 (close=101.5), bearish OB candle before impulse
    makeBar('10:10:00', 104, 104.5, 99.2, 101.5),
    // Strong bullish impulse breaking above prior SH 111 -> BOS/CHoCH + leaves FVG
    makeBar('10:15:00', 101.5, 113, 101.5, 112.5),
    makeBar('10:20:00', 112.5, 116, 109.5, 115),
  ];

  const { swingHighs, swingLows } = detectSwingPoints(bars, 2);
  assert.ok(swingHighs.length >= 1);
  assert.ok(swingLows.length >= 2);

  const liq = evaluateLiquidity(bars, swingHighs, swingLows);
  assert.equal(liq.eqlDetected, true);
  assert.equal(liq.sweepType, 'SSL_SWEEP');
  assert.equal(liq.sweepTimeIST, '10:10:00');

  const struct = evaluateMarketStructure(bars, swingHighs, swingLows);
  assert.equal(struct.eventSide, 'BUY');
  assert.ok(struct.event === 'BOS' || struct.event === 'CHoCH');
  assert.equal(struct.triggerBar?.timeIST, '10:20:00');

  const fvg = detectLatestFvg(bars, 'BUY');
  assert.ok(fvg);
  assert.equal(fvg.bottom, 104.5);
  assert.equal(fvg.top, 109.5);

  const ob = detectOrderBlock(bars, 'BUY', struct.triggerIndex, fvg, liq);
  assert.ok(ob);
  assert.equal(ob.timeIST, '10:10:00');
  assert.equal(ob.sweptLiquidityBeforehand, true);
  assert.equal(ob.mitigated, false);
});

test('ATR-25, RVOL, Turnover, RSI(14), VWAP, and Bid/Ask Ratio compute accurately and attach to SmcSetupRow', () => {
  const seqBars: ClaudeFnoBar[] = [];
  for (let i = 0; i < 30; i++) {
    const hh = 9 + Math.floor((15 + i * 5) / 60);
    const mm = (15 + i * 5) % 60;
    const t = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
    const base = 100 + i * 0.5;
    seqBars.push(makeBar(t, base, base + 2, base - 2, base + 0.5, i === 29 ? 150000 : 50000));
  }
  const { atr25, atr25Pct } = computeAtr25(seqBars, 115);
  assert.equal(atr25, 4);
  assert.equal(atr25Pct, 3.48);

  const rsi = computeRsi14(seqBars);
  assert.equal(rsi, 100); // monotonic +0.5 closes

  const rvol = computeRvolFromBars(seqBars);
  assert.equal(rvol, 3); // 150000 / 50000

  const vwap = computeSessionVwap(seqBars, 115);
  assert.ok(vwap > 100 && vwap < 115);

  const fullBars: ClaudeFnoBar[] = [
    makeBar('09:15:00', 110, 112, 105, 106, 40000),
    makeBar('09:20:00', 106, 108, 102, 104, 40000),
    makeBar('09:25:00', 104, 105, 100.0, 103, 40000),
    makeBar('09:30:00', 103, 107, 101.5, 106, 40000),
    makeBar('09:35:00', 106, 109, 103, 105, 40000),
    makeBar('09:40:00', 105, 111, 104, 107, 40000),
    makeBar('09:45:00', 107, 108, 103, 104, 40000),
    makeBar('09:50:00', 104, 106, 102, 103, 40000),
    makeBar('09:55:00', 103, 104, 100.05, 102, 40000),
    makeBar('10:00:00', 102, 105, 101, 104, 40000),
    makeBar('10:05:00', 104, 106, 102, 104, 40000),
    makeBar('10:10:00', 104, 104.5, 99.2, 101.5, 60000),
    makeBar('10:15:00', 101.5, 113, 101.5, 112.5, 100000),
    makeBar('10:20:00', 112.5, 116, 109.5, 115, 120000),
  ];

  const report = buildSmartMoneyConceptsReport({
    stocks: [
      {
        symbol: 'INFY',
        name: 'Infosys',
        sector: 'IT Services',
        price: 115,
        changePercent: 2.1,
        sectorChangePercent: 1.4,
        volume: 2000000,
        bidAskRatio: 1.65,
        orderBookBias: 'Buyer Dominance',
        indicators: { rvol: 2.4, atr: 3.5, rsi: 66.2, vwap: 109.5 },
        oiData: { changeInOIPercent: 5.2 },
      } as any,
    ],
    getExtendedBarsFn: () => fullBars.map((b) => ({ ...b, tsSec: b.secIST })),
    candlesMap: new Map(),
    indexQuotes: {},
    isMidnightCleared: false,
    timeframe: '5m',
    capital: 100000,
    riskPct: 1,
  });

  assert.equal(report.totalSetups, 1);
  const row = report.categories.allSetups[0];
  assert.equal(row.rvol, 2.6); // 120000 / avg(40k..100k) = 2.60x
  assert.equal(row.tradedValueCr, 23); // 2,000,000 * 115 / 1e7 = 23 Cr
  assert.equal(row.bidAskRatio, 1.65);
  assert.ok(row.atr25 > 0);
  assert.ok(row.atr25Pct > 0);
  assert.ok(row.rsi > 50);
  assert.ok(row.vwap > 100);
  assert.equal(row.aboveVwap, true);

  // Verify trailing cumulative day-volume dump does not corrupt RVOL
  const contaminated = [...fullBars, makeBar('10:25:00', 115, 115, 115, 115, 2500000)];
  assert.equal(computeRvolFromBars(contaminated, 640.69), 2.6);
});

test('buildSmartMoneyConceptsReport generates zero fake rows when intraday candles are missing', () => {
  const report = buildSmartMoneyConceptsReport({
    stocks: [
      {
        symbol: 'RELIANCE',
        name: 'Reliance Industries',
        sector: 'Energy',
        price: 1320,
        open: 1310,
        high: 1325,
        low: 1305,
        prevClose: 1300,
        change: 20,
        changePercent: 1.54,
        sectorChangePercent: 0.8,
        volume: 5000000,
        avgVolume: 3000000,
        rvol: 1.67,
        vwap: 1315,
        bidQty: 120000,
        askQty: 80000,
        bidAskRatio: 1.5,
        orderBookBias: 'Buyer Dominance',
        oiChangePct: 4.5,
        cycleBuildup: 'Long Buildup',
        signal: 'BUY',
        confidence: 80,
        score: 80,
        listedAt: '10:15:00',
        fixedEntryPrice: 1315,
      } as any,
    ],
    getExtendedBarsFn: () => undefined,
    candlesMap: new Map(),
    indexQuotes: {},
    isMidnightCleared: false,
    timeframe: '5m',
    capital: 100000,
    riskPct: 1,
  });

  assert.equal(report.totalSetups, 0);
  assert.equal(report.categories.allSetups.length, 0);
});
