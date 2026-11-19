import test from 'node:test';
import assert from 'node:assert/strict';
import type { AlertConfig, ScannedStock } from '../src/types';
import {
  calculateSessionCumulativeDelta,
  checkCumulativeDeltaAlerts,
  createCumulativeDeltaTestAlert,
  CumulativeDeltaEvaluationState,
  getStockCumulativeDelta,
} from '../src/utils/priceAlerts';

function makeStock(overrides: Partial<ScannedStock> = {}): ScannedStock {
  return {
    symbol: 'RELIANCE',
    name: 'Reliance Industries Ltd.',
    sector: 'Energy',
    price: 1425.5,
    change: 18.2,
    changePercent: 1.29,
    volume: 1200000,
    signal: 'BUY',
    aiScore: 90,
    scoreBreakdown: {
      vwap: 8,
      emaTrend: 8,
      rsi: 6,
      adx: 6,
      volume: 6,
      rvol: 6,
      oiScore: 15,
      priceAction: 5,
    },
    indicators: {
      price: 1425.5,
      open: 1410,
      high: 1430,
      low: 1405,
      close: 1425.5,
      volume: 1200000,
      avgVolume20: 600000,
      ema13: 1420,
      ema21: 1415,
      ema34: 1410,
      vwap: 1418,
      rsi: 64.5,
      macd: 4.2,
      macdSignal: 3.1,
      macdHist: 1.1,
      adx: 29,
      atr: 14,
      supertrend: 1408,
      supertrendDirection: 'BUY',
      bbUpper: 1435,
      bbMiddle: 1418,
      bbLower: 1401,
      rvol: 2.0,
      volumeBreakout: true,
      pdh: 1422,
      pdl: 1395,
      cprPivot: 1410,
      cprBC: 1406,
      cprTC: 1414,
      pivotR1: 1428,
      pivotS1: 1398,
      pivotR2: 1440,
      pivotS2: 1385,
      swingHigh: 1430,
      swingLow: 1405,
    },
    risk: {
      entryPrice: 1425.5,
      stopLoss: 1408,
      target1: 1455,
      target2: 1480,
      riskAmount: 17.5,
      rewardAmountT1: 29.5,
      rewardAmountT2: 54.5,
      riskRewardRatio: 1.69,
      recommendedQty: 100,
      positionValue: 142550,
      marginRequired: 28510,
    },
    lastUpdated: new Date().toISOString(),
    keyTriggers: ['VWAP Hold'],
    ...overrides,
  };
}

function makeConfig(overrides: Partial<AlertConfig> = {}): AlertConfig {
  return {
    minScoreToAlert: 85,
    enableOrderQtyAlert: true,
    minOrderSizeQty: 50000,
    minRvolForOrderAlert: 1.5,
    orderTypeFilter: 'BOTH',
    enableCumulativeDeltaAlert: true,
    cumulativeDeltaThreshold: 50000,
    cumulativeDeltaDirection: 'BOTH',
    enableTelegram: false,
    telegramBotToken: '',
    telegramChatId: '',
    enableWhatsapp: false,
    whatsappPhone: '',
    whatsappApiKey: '',
    enableEmail: false,
    emailRecipient: '',
    emailSmtpHost: '',
    soundAlerts: false,
    ...overrides,
  };
}

test('calculateSessionCumulativeDelta computes positive and negative CLV volume flow accurately', () => {
  const bullishBars = [
    { open: 100, high: 110, low: 100, close: 110, volume: 40000 }, // CLV = +1 -> +40,000
    { open: 110, high: 120, low: 110, close: 115, volume: 20000 }, // CLV = 0  -> 0
    { open: 115, high: 125, low: 115, close: 125, volume: 30000 }, // CLV = +1 -> +30,000
  ];
  assert.equal(calculateSessionCumulativeDelta(bullishBars), 70000);

  const bearishBars = [
    { open: 120, high: 120, low: 110, close: 110, volume: 60000 }, // CLV = -1 -> -60,000
  ];
  assert.equal(calculateSessionCumulativeDelta(bearishBars), -60000);
});

test('getStockCumulativeDelta prefers explicit cumulativeDelta and falls back cleanly', () => {
  const withExplicit = makeStock({ cumulativeDelta: 62500.4 });
  assert.equal(getStockCumulativeDelta(withExplicit), 62500);

  const withoutExplicit = makeStock({ cumulativeDelta: undefined, bidQty: 80000, askQty: 30000 });
  assert.ok(Number.isFinite(getStockCumulativeDelta(withoutExplicit)));
});

test('checkCumulativeDeltaAlerts returns empty when disabled', () => {
  const state: CumulativeDeltaEvaluationState = { prevDeltas: new Map(), lastTriggered: new Map() };
  const alerts = checkCumulativeDeltaAlerts(
    [makeStock({ cumulativeDelta: 90000 })],
    makeConfig({ enableCumulativeDeltaAlert: false }),
    { state, now: 1000, notifyBrowser: false }
  );
  assert.equal(alerts.length, 0);
});

test('checkCumulativeDeltaAlerts detects ABOVE threshold crossing and respects cooldown', () => {
  const state: CumulativeDeltaEvaluationState = { prevDeltas: new Map(), lastTriggered: new Map() };
  const cfg = makeConfig({ cumulativeDeltaThreshold: 50000, cumulativeDeltaDirection: 'ABOVE' });

  // Below threshold initially -> no alert
  const first = checkCumulativeDeltaAlerts([makeStock({ cumulativeDelta: 35000 })], cfg, {
    state,
    now: 1000,
    notifyBrowser: false,
  });
  assert.equal(first.length, 0);

  // Crosses above 50,000 -> triggers alert
  const second = checkCumulativeDeltaAlerts([makeStock({ cumulativeDelta: 56000 })], cfg, {
    state,
    now: 2000,
    notifyBrowser: false,
  });
  assert.equal(second.length, 1);
  assert.equal(second[0].alertCategory, 'CUMULATIVE_DELTA');
  assert.equal(second[0].cumulativeDelta, 56000);
  assert.equal(second[0].prevCumulativeDelta, 35000);
  assert.equal(second[0].cumulativeDeltaThreshold, 50000);
  assert.equal(second[0].cumulativeDeltaDirection, 'ABOVE');
  assert.equal(second[0].signal, 'BUY');

  // Stays above threshold -> no duplicate alert
  const third = checkCumulativeDeltaAlerts([makeStock({ cumulativeDelta: 64000 })], cfg, {
    state,
    now: 3000,
    notifyBrowser: false,
  });
  assert.equal(third.length, 0);

  // Dips below and crosses again within cooldown -> suppressed
  checkCumulativeDeltaAlerts([makeStock({ cumulativeDelta: 40000 })], cfg, {
    state,
    now: 4000,
    notifyBrowser: false,
  });
  const fourth = checkCumulativeDeltaAlerts([makeStock({ cumulativeDelta: 55000 })], cfg, {
    state,
    now: 5000,
    cooldownMs: 300000,
    notifyBrowser: false,
  });
  assert.equal(fourth.length, 0);

  // After cooldown expires -> triggers again
  checkCumulativeDeltaAlerts([makeStock({ cumulativeDelta: 45000 })], cfg, {
    state,
    now: 310000,
    notifyBrowser: false,
  });
  const fifth = checkCumulativeDeltaAlerts([makeStock({ cumulativeDelta: 58000 })], cfg, {
    state,
    now: 320000,
    cooldownMs: 300000,
    notifyBrowser: false,
  });
  assert.equal(fifth.length, 1);
});

test('checkCumulativeDeltaAlerts detects BELOW negative threshold and symmetric BOTH crossings', () => {
  const stateBelow: CumulativeDeltaEvaluationState = { prevDeltas: new Map(), lastTriggered: new Map() };
  const belowCfg = makeConfig({ cumulativeDeltaThreshold: -40000, cumulativeDeltaDirection: 'BELOW' });

  assert.equal(
    checkCumulativeDeltaAlerts([makeStock({ symbol: 'TCS', cumulativeDelta: -20000 })], belowCfg, {
      state: stateBelow,
      now: 1000,
      notifyBrowser: false,
    }).length,
    0
  );

  const crossedBelow = checkCumulativeDeltaAlerts(
    [makeStock({ symbol: 'TCS', cumulativeDelta: -48000 })],
    belowCfg,
    { state: stateBelow, now: 2000, notifyBrowser: false }
  );
  assert.equal(crossedBelow.length, 1);
  assert.equal(crossedBelow[0].cumulativeDeltaDirection, 'BELOW');
  assert.equal(crossedBelow[0].signal, 'SELL');
  assert.equal(crossedBelow[0].cumulativeDeltaThreshold, -40000);

  // BOTH mode catches crossing below -|threshold| as well as above +|threshold|
  const stateBoth: CumulativeDeltaEvaluationState = { prevDeltas: new Map(), lastTriggered: new Map() };
  const bothCfg = makeConfig({ cumulativeDeltaThreshold: 50000, cumulativeDeltaDirection: 'BOTH' });
  const bothAlerts = checkCumulativeDeltaAlerts(
    [
      makeStock({ symbol: 'INFY', cumulativeDelta: 52000 }),
      makeStock({ symbol: 'SBIN', cumulativeDelta: -61000 }),
      makeStock({ symbol: 'HDFCBANK', cumulativeDelta: 12000 }),
    ],
    bothCfg,
    { state: stateBoth, now: 5000, notifyBrowser: false }
  );
  assert.equal(bothAlerts.length, 2);
  assert.equal(bothAlerts.find((a) => a.symbol === 'INFY')?.cumulativeDeltaDirection, 'ABOVE');
  assert.equal(bothAlerts.find((a) => a.symbol === 'SBIN')?.cumulativeDeltaDirection, 'BELOW');
});

test('createCumulativeDeltaTestAlert generates a valid UI notification alert payload', () => {
  const testAlert = createCumulativeDeltaTestAlert(
    makeStock({ symbol: 'ICICIBANK', price: 1320.4 }),
    makeConfig({ cumulativeDeltaThreshold: 75000, cumulativeDeltaDirection: 'ABOVE' })
  );
  assert.equal(testAlert.alertCategory, 'CUMULATIVE_DELTA');
  assert.equal(testAlert.symbol, 'ICICIBANK');
  assert.equal(testAlert.cumulativeDeltaDirection, 'ABOVE');
  assert.equal(testAlert.cumulativeDeltaThreshold, 75000);
  assert.ok((testAlert.cumulativeDelta ?? 0) > 75000);
});
