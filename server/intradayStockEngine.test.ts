import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIntradayStockReport,
  classifyGapOpen,
  evaluateIntradayStockFormula,
} from './intradayStockEngine';
import { IntradayCandleBar } from './autonomousPriceService';
import { ScannedStock } from '../src/types';

function makeBar(
  timeIST: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 10000,
  dateIST = '2026-11-17'
): IntradayCandleBar {
  const [hh, mm, ss] = timeIST.split(':').map(Number);
  const tsMs = Date.parse(`${dateIST}T${timeIST}+05:30`);
  return {
    tsSec: Math.floor((Number.isFinite(tsMs) ? tsMs : Date.now()) / 1000),
    timeIST,
    dateIST,
    secIST: hh * 3600 + mm * 60 + (ss || 0),
    open,
    high,
    low,
    close,
    volume,
  };
}

function makeMockStock(overrides: Partial<ScannedStock> = {}): ScannedStock {
  return {
    symbol: 'RELIANCE',
    name: 'Reliance Industries',
    sector: 'Energy & Oil',
    sectorChangePercent: 0,
    price: 1325,
    changePercent: 2.1,
    volume: 5000000,
    avgVolume: 2000000,
    rvol: 2.5,
    bidAskRatio: 1.4,
    orderBookBias: 'Buyer Dominance',
    indicators: { pdh: 1295, pdl: 1275, rvol: 2.5 } as any,
    oiData: { changeInOIPercent: 8.5 } as any,
    ...overrides,
  } as ScannedStock;
}

test('Gap Up DFC BUY: Candle 4 closes above DFC High -> Candle 5 is Qualified Entry with SL=DFC Low and T1=DFC HL Diff', () => {
  const prevBars = [makeBar('15:25:00', 1290, 1295, 1280, 1292, 10000, '2026-11-16')];
  const todayBars = [
    // Candle 1 (DFC 09:15): Gap Up open 1300 > PDH 1295, High 1310, Low 1298 => HL diff = 12
    makeBar('09:15:00', 1300, 1310, 1298, 1306, 25000, '2026-11-17'),
    // Candle 2: inside DFC
    makeBar('09:20:00', 1306, 1309, 1301, 1307, 18000, '2026-11-17'),
    // Candle 3: inside DFC
    makeBar('09:25:00', 1307, 1310, 1303, 1309, 20000, '2026-11-17'),
    // Candle 4: Closing Basis Breakout ABOVE DFC High (close 1313 > 1310)
    makeBar('09:30:00', 1309, 1315, 1308, 1313, 35000, '2026-11-17'),
    // Candle 5: Qualified Entry Candle to punch BUY trade (open 1314)
    makeBar('09:35:00', 1314, 1326, 1313, 1325, 42000, '2026-11-17'),
  ];

  const row = evaluateIntradayStockFormula({
    symbol: 'RELIANCE',
    displayName: 'Reliance',
    instrumentType: 'EQUITY_FNO',
    bars5m: [...prevBars, ...todayBars] as any,
    price: 1325,
    changePercent: 2.55,
    sector: 'Energy & Oil',
    sectorChangePct: 1.2,
    bidAskRatio: 1.4,
    orderBookBias: 'Buyer Dominance',
    oiChangePct: 8.5,
    rawVolume: 5000000,
    tradedValueCr: 662.5,
    capital: 100000,
    riskPct: 1.0,
  });

  assert.ok(row);
  assert.equal(row.side, 'BUY');
  assert.equal(row.gapType, 'OUTSIDE_GAP_UP');
  assert.equal(row.signalBadge, 'GAP-UP DFC BUY');
  assert.equal(row.isDfcQualified, true);
  assert.equal(row.entryStatus, 'QUALIFIED_NEXT_CANDLE');
  assert.equal(row.closingCandleNo, 4);
  assert.equal(row.closingCandleTime, '09:30:00');
  assert.equal(row.qualifiedCandleNo, 5);
  assert.equal(row.qualifiedCandleTime, '09:35:00');
  assert.equal(row.listedAt, '09:35:00');
  assert.equal(row.inEntryWindow, true);
  assert.equal(row.entryPrice, 1314);
  assert.equal(row.stopLoss, 1298); // DFC Low
  assert.equal(row.dfcRange, 12); // 1310 - 1298
  assert.equal(row.target1, 1326); // Entry 1314 + DFC HL diff 12
  assert.equal(row.target2, 1338); // Entry 1314 + 2*12 @ 3:25 PM
  assert.equal(row.target2ExitTime, '15:25:00 IST');
});

test('Gap Down DFC SELL: Candle 2 closes below DFC Low -> Candle 3 is Qualified Entry with SL=DFC High and T1=DFC HL Diff', () => {
  const prevBars = [makeBar('15:25:00', 1785, 1795, 1776, 1780, 10000, '2026-11-16')];
  const todayBars = [
    // Candle 1 (DFC 09:15): Gap Down open 1770 < PDL 1776, High 1775, Low 1760 => HL diff = 15
    makeBar('09:15:00', 1770, 1775, 1760, 1762, 30000, '2026-11-17'),
    // Candle 2: Closing Basis Breakdown BELOW DFC Low (close 1756 < 1760)
    makeBar('09:20:00', 1762, 1763, 1755, 1756, 40000, '2026-11-17'),
    // Candle 3: Qualified Candle to punch SELL trade (open 1755)
    makeBar('09:25:00', 1755, 1757, 1740, 1742, 45000, '2026-11-17'),
  ];

  const row = evaluateIntradayStockFormula({
    symbol: 'HDFCBANK',
    displayName: 'HDFC Bank',
    instrumentType: 'EQUITY_FNO',
    bars5m: [...prevBars, ...todayBars] as any,
    price: 1742,
    changePercent: -2.13,
    sector: 'Banking & Financials',
    sectorChangePct: -0.9,
    bidAskRatio: 0.72,
    orderBookBias: 'Seller Pressure',
    oiChangePct: 9.2,
    rawVolume: 4000000,
    tradedValueCr: 696.8,
    capital: 100000,
    riskPct: 1.0,
  });

  assert.ok(row);
  assert.equal(row.side, 'SELL');
  assert.equal(row.gapType, 'OUTSIDE_GAP_DOWN');
  assert.equal(row.signalBadge, 'GAP-DOWN DFC SELL');
  assert.equal(row.closingCandleNo, 2);
  assert.equal(row.qualifiedCandleNo, 3);
  assert.equal(row.listedAt, '09:25:00');
  assert.equal(row.entryPrice, 1755);
  assert.equal(row.stopLoss, 1775); // DFC High
  assert.equal(row.dfcRange, 15); // 1775 - 1760
  assert.equal(row.target1, 1740); // Entry 1755 - DFC HL diff 15
  assert.equal(row.target2, 1725); // 1755 - 30
});

test('classifyGapOpen accurately separates Outside Gap Up, Outside Gap Down, and Inside Prev Day', () => {
  assert.equal(classifyGapOpen(105, 100, 90), 'OUTSIDE_GAP_UP');
  assert.equal(classifyGapOpen(88, 100, 90), 'OUTSIDE_GAP_DOWN');
  assert.equal(classifyGapOpen(95, 100, 90), 'INSIDE_PREV_DAY');
});

test('buildIntradayStockReport enforces zero fake rows when real intraday bars are absent and sorts Z->A', () => {
  const stockWithBars = makeMockStock({ symbol: 'TCS', price: 3940, changePercent: 1.8 });
  const stockWithoutBars = makeMockStock({ symbol: 'FAKEZERO', price: 500, changePercent: 4.5 });

  const barsMap = new Map<string, IntradayCandleBar[]>([
    [
      'TCS',
      [
        makeBar('09:15:00', 3900, 3915, 3895, 3910, 15000, '2026-11-17'),
        makeBar('09:20:00', 3910, 3922, 3908, 3920, 22000, '2026-11-17'),
        makeBar('09:25:00', 3921, 3945, 3920, 3940, 30000, '2026-11-17'),
      ],
    ],
  ]);

  const report = buildIntradayStockReport({
    stocks: [stockWithBars, stockWithoutBars],
    getExtendedBarsFn: (s) => barsMap.get(s),
    candlesMap: new Map(),
    indexQuotes: {},
    isMidnightCleared: false,
    capital: 100000,
    riskPct: 1,
  });

  assert.equal(report.totalScanned, 1);
  assert.equal(report.qualifiedDfcCount, 1);
  assert.equal(report.categories.allSetups[0].symbol, 'TCS');
  assert.equal(report.categories.allSetups.some((r) => r.symbol === 'FAKEZERO'), false);
});

test('buildIntradayStockReport strictly caps equity setups to Best 10 UP + Best 10 DOWN by DFC formula quality and sorts Z->A', () => {
  const stocks: ScannedStock[] = [];
  const barsMap = new Map<string, IntradayCandleBar[]>();

  // Create 13 UP stocks: 10 clean DFC BUY breakouts + 2 volatile chop BUY + 1 inside DFC watch BUY
  for (let i = 1; i <= 13; i++) {
    const sym = `UPSTOCK${String(i).padStart(2, '0')}`;
    const isClean = i <= 10;
    const isChop = i === 11 || i === 12;
    const minOffset = (i % 9) * 5;
    const boTime = `09:${String(20 + minOffset).padStart(2, '0')}:00`;
    const qualTime = `09:${String(25 + minOffset).padStart(2, '0')}:00`;
    const prevClose = 980;
    const pdh = 990;
    const pdl = 970;
    const prevBars = [makeBar('15:25:00', 980, pdh, pdl, prevClose, 10000, '2026-11-16')];
    const todayBars = isClean
      ? [
          // Clean Gap-Up DFC BUY breakout
          makeBar('09:15:00', 995, 1005, 992, 1002, 20000, '2026-11-17'),
          makeBar(boTime, 1002, 1012, 1000, 1010, 45000, '2026-11-17'),
          makeBar(qualTime, 1011, 1025, 1010, 1022, 50000, '2026-11-17'),
        ]
      : isChop
        ? [
            // Choppy: closes below DFC low first, then above DFC high -> volatileChop=true
            makeBar('09:15:00', 985, 1000, 990, 995, 20000, '2026-11-17'),
            makeBar('09:20:00', 995, 996, 985, 987, 15000, '2026-11-17'),
            makeBar(boTime, 987, 1006, 986, 1004, 15000, '2026-11-17'),
            makeBar(qualTime, 1005, 1008, 1003, 1007, 15000, '2026-11-17'),
          ]
        : [
            // Inside DFC watch (no closing breakout)
            makeBar('09:15:00', 985, 1000, 990, 995, 12000, '2026-11-17'),
            makeBar('09:20:00', 995, 999, 992, 998, 12000, '2026-11-17'),
          ];
    stocks.push(
      makeMockStock({
        symbol: sym,
        price: isClean ? 1022 : 998,
        changePercent: isClean ? 2.5 + i * 0.1 : 0.4,
        bidAskRatio: isClean ? 1.45 : 1.01,
        indicators: { pdh, pdl, rvol: isClean ? 2.2 + i * 0.1 : 0.9 } as any,
      })
    );
    barsMap.set(sym, [...prevBars, ...todayBars]);
  }

  // Create 12 DOWN stocks: 10 clean DFC SELL breakouts + 2 volatile chop SELL
  for (let i = 1; i <= 12; i++) {
    const sym = `DNSTOCK${String(i).padStart(2, '0')}`;
    const isClean = i <= 10;
    const minOffset = (i % 9) * 5;
    const boTime = `10:${String(15 + minOffset).padStart(2, '0')}:00`;
    const qualTime = `10:${String(20 + minOffset).padStart(2, '0')}:00`;
    const pdh = 1020;
    const pdl = 1000;
    const prevBars = [makeBar('15:25:00', 1010, pdh, pdl, 1005, 10000, '2026-11-16')];
    const todayBars = isClean
      ? [
          // Clean Gap-Down DFC SELL breakdown
          makeBar('09:15:00', 995, 998, 985, 988, 22000, '2026-11-17'),
          makeBar(boTime, 988, 989, 978, 980, 48000, '2026-11-17'),
          makeBar(qualTime, 979, 980, 965, 968, 52000, '2026-11-17'),
        ]
      : [
          // Choppy SELL
          makeBar('09:15:00', 1005, 1010, 995, 1000, 15000, '2026-11-17'),
          makeBar('09:20:00', 1000, 1013, 999, 1012, 15000, '2026-11-17'),
          makeBar(boTime, 1012, 1013, 990, 992, 15000, '2026-11-17'),
          makeBar(qualTime, 991, 992, 988, 989, 15000, '2026-11-17'),
        ];
    stocks.push(
      makeMockStock({
        symbol: sym,
        price: isClean ? 968 : 989,
        changePercent: isClean ? -(2.3 + i * 0.1) : -0.3,
        bidAskRatio: isClean ? 0.65 : 1.0,
        indicators: { pdh, pdl, rvol: isClean ? 2.1 + i * 0.1 : 0.8 } as any,
      })
    );
    barsMap.set(sym, [...prevBars, ...todayBars]);
  }

  const report = buildIntradayStockReport({
    stocks,
    getExtendedBarsFn: (s) => barsMap.get(s),
    candlesMap: new Map(),
    indexQuotes: {},
    isMidnightCleared: false,
    capital: 100000,
    riskPct: 1,
  });

  assert.equal(report.totalEligibleUpCount, 13);
  assert.equal(report.totalEligibleDownCount, 12);
  assert.equal(report.buyCount, 10);
  assert.equal(report.sellCount, 10);
  assert.equal(report.categories.buySetups.length, 10);
  assert.equal(report.categories.sellSetups.length, 10);
  assert.equal(report.categories.allSetups.length, 20);

  // Choppy / weak UPSTOCK11-13 & DNSTOCK11-12 must be excluded from Best 10 UP & Best 10 DOWN
  assert.equal(report.categories.buySetups.some((r) => ['UPSTOCK11', 'UPSTOCK12', 'UPSTOCK13'].includes(r.symbol)), false);
  assert.equal(report.categories.sellSetups.some((r) => ['DNSTOCK11', 'DNSTOCK12'].includes(r.symbol)), false);

  // Direction ranks 1..10 assigned properly
  const upRanks = report.categories.buySetups.map((r) => r.directionRank).sort((a, b) => (a || 0) - (b || 0));
  const dnRanks = report.categories.sellSetups.map((r) => r.directionRank).sort((a, b) => (a || 0) - (b || 0));
  assert.deepEqual(upRanks, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual(dnRanks, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

  // Verify Z->A listedAt sort order on allSetups
  for (let i = 1; i < report.categories.allSetups.length; i++) {
    assert.ok(
      report.categories.allSetups[i - 1].listedAt >= report.categories.allSetups[i].listedAt,
      `Expected Z->A order at index ${i}`
    );
  }
});

