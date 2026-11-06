import {
  IndexAlertCreatePayload,
  IndexAlertTriggerType,
  IndexIntelligenceData,
  IndexOptionAlert,
  IndexStrikeBattlefieldItem,
  IndexStrikeMoneyness,
  SupportedIndexSymbol,
} from '../types';
import { INDEX_CONFIGS } from './indexOptionsEngine';
import { isMarketHours } from './marketHours';

const INDEX_ALERTS_STORAGE_KEY = 'index_options_alerts_v2';

/**
 * Resolves the EXACT ONE strike contract for any combination of
 * Moneyness (ATM, ITM, OTM), Option Type (CALL/PUT), and Action (BUY/SELL)
 */
export function resolveExactIndexStrike(
  indexData: IndexIntelligenceData,
  moneyness: IndexStrikeMoneyness,
  optionType: 'CE' | 'PE',
  action: 'BUY' | 'SELL',
  customStrikeOverride?: number
): {
  strike: number;
  moneyness: IndexStrikeMoneyness;
  optionType: 'CE' | 'PE';
  action: 'BUY' | 'SELL';
  contractName: string;
  expiryDate: string;
  premiumLtp: number;
  entryPrice: number;
  stopLoss: number;
  stopLossPercent: number;
  target1: number;
  target2: number;
  target3: number;
  riskReward: string;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
  spreadLiquidityScore: number;
  rationale: string;
} {
  const config = INDEX_CONFIGS[indexData.symbol];
  const step = config.strikeStep;
  const spot = indexData.spotPrice;
  const atmStrike = Math.round(spot / step) * step;

  let targetStrike = customStrikeOverride;

  if (!targetStrike) {
    if (optionType === 'CE') {
      switch (moneyness) {
        case 'DEEP_ITM':
          targetStrike = atmStrike - 3 * step;
          break;
        case 'SLIGHT_ITM':
          targetStrike = atmStrike - 1 * step;
          break;
        case 'ATM':
          targetStrike = atmStrike;
          break;
        case 'SLIGHT_OTM':
          targetStrike = atmStrike + 1 * step;
          break;
        case 'FAR_OTM':
          targetStrike = atmStrike + 3 * step;
          break;
      }
    } else {
      // PE Put Option
      switch (moneyness) {
        case 'DEEP_ITM':
          targetStrike = atmStrike + 3 * step;
          break;
        case 'SLIGHT_ITM':
          targetStrike = atmStrike + 1 * step;
          break;
        case 'ATM':
          targetStrike = atmStrike;
          break;
        case 'SLIGHT_OTM':
          targetStrike = atmStrike - 1 * step;
          break;
        case 'FAR_OTM':
          targetStrike = atmStrike - 3 * step;
          break;
      }
    }
  }

  // Find matching strike in battlefield
  const strikeItem =
    indexData.battlefieldStrikes.find((s) => s.strike === targetStrike) ||
    indexData.battlefieldStrikes.find((s) => s.isAtm) ||
    indexData.battlefieldStrikes[Math.floor(indexData.battlefieldStrikes.length / 2)];

  const isCe = optionType === 'CE';
  const premiumLtp = isCe ? strikeItem.callLtp : strikeItem.putLtp;
  const delta = isCe ? strikeItem.callDelta : strikeItem.putDelta;
  const gamma = isCe ? strikeItem.callGamma : strikeItem.putGamma;
  const theta = isCe ? strikeItem.callTheta : strikeItem.putTheta;
  const vega = isCe ? strikeItem.callVega : strikeItem.putVega;
  const iv = isCe ? strikeItem.callIv : strikeItem.putIv;

  // Risk parameters based on moneyness & action
  let stopLossPercent = 30;
  if (action === 'BUY') {
    if (moneyness === 'DEEP_ITM') stopLossPercent = 20;
    else if (moneyness === 'SLIGHT_ITM') stopLossPercent = 25;
    else if (moneyness === 'ATM') stopLossPercent = 30;
    else if (moneyness === 'SLIGHT_OTM') stopLossPercent = 40;
    else stopLossPercent = 50;
  } else {
    // SELL / Option Writing
    stopLossPercent = 40; // 40% SL on premium for sellers
  }

  const entryPrice = premiumLtp;
  const stopLoss =
    action === 'BUY'
      ? Number((premiumLtp * (1 - stopLossPercent / 100)).toFixed(2))
      : Number((premiumLtp * (1 + stopLossPercent / 100)).toFixed(2));

  const target1 =
    action === 'BUY'
      ? Number((premiumLtp * (1 + (stopLossPercent * 1.5) / 100)).toFixed(2))
      : Number((premiumLtp * (1 - (stopLossPercent * 0.5) / 100)).toFixed(2));

  const target2 =
    action === 'BUY'
      ? Number((premiumLtp * (1 + (stopLossPercent * 2.5) / 100)).toFixed(2))
      : Number((premiumLtp * (1 - (stopLossPercent * 0.8) / 100)).toFixed(2));

  const target3 =
    action === 'BUY'
      ? Number((premiumLtp * (1 + (stopLossPercent * 4.0) / 100)).toFixed(2))
      : Number((premiumLtp * 0.1).toFixed(2)); // Near zero decay for seller

  const risk = Math.abs(entryPrice - stopLoss);
  const reward = Math.abs(target1 - entryPrice);
  const riskReward = `1:${(reward / Math.max(1, risk)).toFixed(1)}`;

  const spreadLiquidityScore =
    moneyness === 'ATM'
      ? 99
      : moneyness === 'SLIGHT_ITM'
      ? 95
      : moneyness === 'DEEP_ITM'
      ? 88
      : moneyness === 'SLIGHT_OTM'
      ? 90
      : 65;

  const moneynessLabels: Record<IndexStrikeMoneyness, string> = {
    ATM: 'At-The-Money (ATM)',
    SLIGHT_ITM: 'Slight In-The-Money (ITM)',
    DEEP_ITM: 'Deep In-The-Money (ITM)',
    SLIGHT_OTM: 'Slight Out-Of-The-Money (OTM)',
    FAR_OTM: 'Far Out-Of-The-Money (OTM)',
  };

  const rationale = `${action} ${moneynessLabels[moneyness]} strike ${targetStrike} ${optionType}. Delta Δ ${delta.toFixed(2)}, Gamma Γ ${gamma.toFixed(4)}, Theta burn ₹${Math.abs(theta).toFixed(1)}/day.`;

  return {
    strike: targetStrike,
    moneyness,
    optionType,
    action,
    contractName: `${indexData.symbol} ${config.expiryDate} ${targetStrike} ${optionType}`,
    expiryDate: config.expiryDate,
    premiumLtp,
    entryPrice,
    stopLoss,
    stopLossPercent,
    target1,
    target2,
    target3,
    riskReward,
    delta,
    gamma,
    theta,
    vega,
    iv,
    spreadLiquidityScore,
    rationale,
  };
}

/**
 * Retrieves all stored index option alerts
 */
export function getIndexOptionAlerts(): IndexOptionAlert[] {
  try {
    const raw = localStorage.getItem(INDEX_ALERTS_STORAGE_KEY);
    if (!raw) {
      return seedDefaultIndexAlerts();
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return seedDefaultIndexAlerts();
    }
    return parsed;
  } catch (e) {
    console.error('Failed to parse index option alerts:', e);
    return seedDefaultIndexAlerts();
  }
}

/**
 * Saves all alerts to local persistence
 */
export function persistIndexOptionAlerts(alerts: IndexOptionAlert[]): void {
  try {
    localStorage.setItem(INDEX_ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  } catch (e) {
    console.error('Failed to save index option alerts:', e);
  }
}

/**
 * Creates default seed alerts demonstrating ATM, ITM, OTM, CALL, PUT, BUY & SELL
 */
export function seedDefaultIndexAlerts(): IndexOptionAlert[] {
  const defaults: IndexOptionAlert[] = [
    {
      id: 'alert-nifty-itm-buy-ce',
      indexSymbol: 'NIFTY 50',
      moneyness: 'SLIGHT_ITM',
      optionType: 'CE',
      action: 'BUY',
      strike: 24500,
      contractName: 'NIFTY 50 28-AUG-2026 24500 CE',
      expiryDate: '28-AUG-2026',
      triggerType: 'QUANTITATIVE_SIGNAL_FLIP',
      triggerConditionLabel: 'Quantitative Decision Score ≥ 75 (High-Conviction BUY CE)',
      minConfidenceScore: 75,
      entryPrice: 168.4,
      stopLoss: 126.3,
      stopLossPercent: 25,
      target1: 231.55,
      target2: 273.65,
      target3: 336.8,
      riskReward: '1:1.5',
      delta: 0.62,
      gamma: 0.0012,
      theta: -14.2,
      vega: 24.5,
      iv: 13.5,
      isActive: true,
      isTriggered: false,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      soundEnabled: true,
      pushEnabled: true,
    },
    {
      id: 'alert-banknifty-atm-buy-ce',
      indexSymbol: 'BANKNIFTY',
      moneyness: 'ATM',
      optionType: 'CE',
      action: 'BUY',
      strike: 52200,
      contractName: 'BANKNIFTY 27-AUG-2026 52200 CE',
      expiryDate: '27-AUG-2026',
      triggerType: 'SPOT_CROSS_ABOVE',
      triggerConditionLabel: 'Spot Breaks Above Resistance ₹52,300 (ATM Momentum Breakout)',
      triggerTargetValue: 52300,
      entryPrice: 248.5,
      stopLoss: 173.95,
      stopLossPercent: 30,
      target1: 360.3,
      target2: 434.9,
      target3: 546.7,
      riskReward: '1:1.5',
      delta: 0.51,
      gamma: 0.0015,
      theta: -18.6,
      vega: 38.2,
      iv: 15.8,
      isActive: true,
      isTriggered: false,
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      soundEnabled: true,
      pushEnabled: true,
    },
    {
      id: 'alert-finnifty-otm-buy-pe',
      indexSymbol: 'FINNIFTY',
      moneyness: 'SLIGHT_OTM',
      optionType: 'PE',
      action: 'BUY',
      strike: 23850,
      contractName: 'FINNIFTY 26-AUG-2026 23850 PE',
      expiryDate: '26-AUG-2026',
      triggerType: 'GAMMA_SQUEEZE',
      triggerConditionLabel: 'Trapped Writer / Put Gamma Squeeze Breakdown below VWAP',
      entryPrice: 84.2,
      stopLoss: 50.5,
      stopLossPercent: 40,
      target1: 134.7,
      target2: 168.4,
      target3: 218.9,
      riskReward: '1:1.5',
      delta: -0.38,
      gamma: 0.0011,
      theta: -11.4,
      vega: 19.8,
      iv: 14.2,
      isActive: true,
      isTriggered: false,
      createdAt: new Date(Date.now() - 10800000).toISOString(),
      soundEnabled: true,
      pushEnabled: true,
    },
    {
      id: 'alert-sensex-otm-sell-ce',
      indexSymbol: 'SENSEX',
      moneyness: 'FAR_OTM',
      optionType: 'CE',
      action: 'SELL',
      strike: 81000,
      contractName: 'SENSEX 29-AUG-2026 81000 CE',
      expiryDate: '29-AUG-2026',
      triggerType: 'PCR_BREAKOUT',
      triggerConditionLabel: 'Call Writer Wall Defense: PCR drops below 0.85 (Heavy Resistance)',
      triggerTargetValue: 0.85,
      entryPrice: 96.0,
      stopLoss: 134.4,
      stopLossPercent: 40,
      target1: 76.8,
      target2: 65.28,
      target3: 9.6,
      riskReward: '1:1.2',
      delta: 0.22,
      gamma: 0.0006,
      theta: -16.5,
      vega: 28.0,
      iv: 13.2,
      isActive: true,
      isTriggered: false,
      createdAt: new Date(Date.now() - 14400000).toISOString(),
      soundEnabled: true,
      pushEnabled: true,
    },
  ];

  persistIndexOptionAlerts(defaults);
  return defaults;
}

/**
 * Creates a brand new Index Option Alert from a payload
 */
export function createIndexOptionAlert(
  payload: IndexAlertCreatePayload,
  indicesData: Record<SupportedIndexSymbol, IndexIntelligenceData>
): IndexOptionAlert {
  const indexData = indicesData[payload.indexSymbol];
  const strikeDetails = resolveExactIndexStrike(
    indexData,
    payload.moneyness,
    payload.optionType,
    payload.action,
    payload.strike
  );

  let triggerLabel = '';
  switch (payload.triggerType) {
    case 'QUANTITATIVE_SIGNAL_FLIP':
      triggerLabel = `Quantitative AI Score ≥ ${payload.minConfidenceScore || 75} (${payload.action} ${payload.optionType})`;
      break;
    case 'SPOT_CROSS_ABOVE':
      triggerLabel = `Spot Price crosses Above ₹${(payload.triggerTargetValue || indexData.spotPrice).toLocaleString('en-IN')}`;
      break;
    case 'SPOT_CROSS_BELOW':
      triggerLabel = `Spot Price crosses Below ₹${(payload.triggerTargetValue || indexData.spotPrice).toLocaleString('en-IN')}`;
      break;
    case 'PREMIUM_CROSS_ABOVE':
      triggerLabel = `Option Premium crosses Above ₹${(payload.triggerTargetValue || strikeDetails.entryPrice).toFixed(2)}`;
      break;
    case 'GAMMA_SQUEEZE':
      triggerLabel = `Gamma Squeeze / Trapped Writer Cascade Triggered on ${payload.indexSymbol}`;
      break;
    case 'PCR_BREAKOUT':
      triggerLabel = `PCR Breakdown/Surge Threshold (Level: ${payload.triggerTargetValue || 1.25}x)`;
      break;
    case 'SUPERTREND_CROSSOVER':
      triggerLabel = `Supertrend (10,3) flips to ${payload.action === 'BUY' && payload.optionType === 'CE' ? 'BUY' : 'SELL'}`;
      break;
    case 'CPR_TC_BC_BREAKOUT':
      triggerLabel = `Spot Breakout out of Central Pivot Range (CPR)`;
      break;
    case 'INSTITUTIONAL_WRITING_SHIFT':
      triggerLabel = `Institutional Writing Ratio / Positioning Shift Detected (Threshold: ${payload.triggerTargetValue || 2.0}x Put/Call Ratio)`;
      break;
  }

  const newAlert: IndexOptionAlert = {
    id: `alert-${payload.indexSymbol.toLowerCase().replace(/\s+/g, '')}-${payload.moneyness.toLowerCase()}-${payload.optionType.toLowerCase()}-${Date.now()}`,
    indexSymbol: payload.indexSymbol,
    moneyness: payload.moneyness,
    optionType: payload.optionType,
    action: payload.action,
    strike: strikeDetails.strike,
    contractName: strikeDetails.contractName,
    expiryDate: strikeDetails.expiryDate,
    triggerType: payload.triggerType,
    triggerConditionLabel: triggerLabel,
    triggerTargetValue: payload.triggerTargetValue,
    minConfidenceScore: payload.minConfidenceScore || 75,
    entryPrice: strikeDetails.entryPrice,
    stopLoss: strikeDetails.stopLoss,
    stopLossPercent: strikeDetails.stopLossPercent,
    target1: strikeDetails.target1,
    target2: strikeDetails.target2,
    target3: strikeDetails.target3,
    riskReward: strikeDetails.riskReward,
    delta: strikeDetails.delta,
    gamma: strikeDetails.gamma,
    theta: strikeDetails.theta,
    vega: strikeDetails.vega,
    iv: strikeDetails.iv,
    isActive: true,
    isTriggered: false,
    createdAt: new Date().toISOString(),
    soundEnabled: payload.soundEnabled !== false,
    pushEnabled: payload.pushEnabled !== false,
  };

  const existing = getIndexOptionAlerts();
  const updated = [newAlert, ...existing];
  persistIndexOptionAlerts(updated);

  return newAlert;
}

/**
 * Toggle active state of alert
 */
export function toggleIndexAlertActive(id: string): IndexOptionAlert[] {
  const alerts = getIndexOptionAlerts();
  const updated = alerts.map((a) => (a.id === id ? { ...a, isActive: !a.isActive } : a));
  persistIndexOptionAlerts(updated);
  return updated;
}

/**
 * Delete an alert
 */
export function deleteIndexAlert(id: string): IndexOptionAlert[] {
  const alerts = getIndexOptionAlerts();
  const updated = alerts.filter((a) => a.id !== id);
  persistIndexOptionAlerts(updated);
  return updated;
}

/**
 * Reset a triggered alert back to active
 */
export function resetTriggeredIndexAlert(id: string): IndexOptionAlert[] {
  const alerts = getIndexOptionAlerts();
  const updated = alerts.map((a) =>
    a.id === id
      ? {
          ...a,
          isActive: true,
          isTriggered: false,
          triggeredAt: undefined,
          triggeredPrice: undefined,
          triggerMessage: undefined,
        }
      : a
  );
  persistIndexOptionAlerts(updated);
  return updated;
}

/**
 * Synthesizes a multi-frequency chord chime using HTML5 Web Audio API
 */
export function playIndexAlertChime(
  urgency: 'HIGH' | 'MEDIUM' | 'SUCCESS' | 'BULLISH' | 'BEARISH' = 'HIGH'
): void {
  try {
    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioCtx = new AudioContextClass();
    const now = audioCtx.currentTime;

    if (urgency === 'HIGH' || urgency === 'BEARISH') {
      // 3-note ascending alert chime (A5 -> C#6 -> E6)
      const freqs = urgency === 'BEARISH' ? [987.77, 783.99, 659.25] : [880, 1108.73, 1318.51];
      freqs.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);

        gain.gain.setValueAtTime(0.001, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.25, now + idx * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.35);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.36);
      });
    } else {
      // 2-note pleasant confirmation chime
      const freqs = urgency === 'BULLISH' ? [659.25, 880, 1108.73] : [659.25, 987.77];
      freqs.forEach((freq, idx) => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.15);

        gain.gain.setValueAtTime(0.001, now + idx * 0.15);
        gain.gain.exponentialRampToValueAtTime(0.2, now + idx * 0.15 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.4);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now + idx * 0.15);
        osc.stop(now + idx * 0.15 + 0.42);
      });
    }
  } catch (e) {
    console.warn('Audio chime playback failed:', e);
  }
}

/**
 * Native Browser Push Notification
 */
export function sendBrowserPushNotification(title: string, body: string): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: `index-alert-${Date.now()}`,
      });
    } catch (e) {
      console.warn('Notification error:', e);
    }
  }
}

/**
 * Evaluates all active index alerts against the live index market state
 */
export function evaluateActiveIndexAlerts(
  indicesData: Record<SupportedIndexSymbol, IndexIntelligenceData>
): {
  updatedAlerts: IndexOptionAlert[];
  newlyTriggeredAlerts: IndexOptionAlert[];
} {
  const alerts = getIndexOptionAlerts();

  // AUDIT GUARD: Prevent false alert triggers outside official Indian market hours (09:15 - 15:30 IST)
  if (!isMarketHours()) {
    return {
      updatedAlerts: alerts,
      newlyTriggeredAlerts: [],
    };
  }

  let hasChanges = false;
  const newlyTriggeredAlerts: IndexOptionAlert[] = [];

  const updatedAlerts = alerts.map((alert) => {
    if (!alert.isActive || alert.isTriggered) return alert;

    const indexData = indicesData[alert.indexSymbol];
    if (!indexData) return alert;

    const spot = indexData.spotPrice;
    const isCe = alert.optionType === 'CE';
    const currentStrikeItem = indexData.battlefieldStrikes.find((s) => s.strike === alert.strike);
    const livePremium = currentStrikeItem
      ? isCe
        ? currentStrikeItem.callLtp
        : currentStrikeItem.putLtp
      : alert.entryPrice;

    let isHit = false;
    let hitReason = '';

    switch (alert.triggerType) {
      case 'QUANTITATIVE_SIGNAL_FLIP':
        if (
          indexData.overallScore >= (alert.minConfidenceScore || 70) &&
          (alert.action === 'BUY'
            ? isCe
              ? indexData.decision === 'BUY CE'
              : indexData.decision === 'BUY PE'
            : isCe
            ? indexData.decision === 'SELL CE' || indexData.decision === 'NO TRADE'
            : indexData.decision === 'SELL PE' || indexData.decision === 'NO TRADE')
        ) {
          isHit = true;
          hitReason = `AI Quantitative Score surged to ${indexData.overallScore}/100 with ${indexData.decision} decision!`;
        }
        break;

      case 'SPOT_CROSS_ABOVE':
        if (alert.triggerTargetValue && spot >= alert.triggerTargetValue) {
          isHit = true;
          hitReason = `Spot Price ₹${spot.toLocaleString('en-IN')} crossed ABOVE target ₹${alert.triggerTargetValue.toLocaleString('en-IN')}!`;
        }
        break;

      case 'SPOT_CROSS_BELOW':
        if (alert.triggerTargetValue && spot <= alert.triggerTargetValue) {
          isHit = true;
          hitReason = `Spot Price ₹${spot.toLocaleString('en-IN')} crossed BELOW target ₹${alert.triggerTargetValue.toLocaleString('en-IN')}!`;
        }
        break;

      case 'PREMIUM_CROSS_ABOVE':
        if (alert.triggerTargetValue && livePremium >= alert.triggerTargetValue) {
          isHit = true;
          hitReason = `Option Premium ₹${livePremium.toFixed(2)} crossed ABOVE trigger entry ₹${alert.triggerTargetValue.toFixed(2)}!`;
        }
        break;

      case 'GAMMA_SQUEEZE':
        if (indexData.institutionalFlow.gammaSqueezeAlert.detected) {
          isHit = true;
          hitReason = `Gamma Squeeze Alert: ${indexData.institutionalFlow.gammaSqueezeAlert.message}`;
        }
        break;

      case 'PCR_BREAKOUT':
        if (
          alert.triggerTargetValue &&
          ((alert.optionType === 'CE' && indexData.pcrOi >= alert.triggerTargetValue) ||
            (alert.optionType === 'PE' && indexData.pcrOi <= alert.triggerTargetValue))
        ) {
          isHit = true;
          hitReason = `PCR reached ${indexData.pcrOi}x target trigger level!`;
        }
        break;

      case 'SUPERTREND_CROSSOVER':
        if (
          (alert.optionType === 'CE' && indexData.technicals.supertrend.direction === 'BUY') ||
          (alert.optionType === 'PE' && indexData.technicals.supertrend.direction === 'SELL')
        ) {
          isHit = true;
          hitReason = `Supertrend (10,3) confirmed ${indexData.technicals.supertrend.direction} trend switch at ₹${indexData.technicals.supertrend.value.toLocaleString('en-IN')}!`;
        }
        break;

      case 'CPR_TC_BC_BREAKOUT':
        if (
          (isCe && indexData.technicals.cpr.cprStatus === 'ABOVE_TC') ||
          (!isCe && indexData.technicals.cpr.cprStatus === 'BELOW_BC')
        ) {
          isHit = true;
          hitReason = `Spot broke out of Central Pivot Range (${indexData.technicals.cpr.cprStatus.replace('_', ' ')})!`;
        }
        break;

      case 'INSTITUTIONAL_WRITING_SHIFT':
        const telemetry = indexData.institutionalFlow.writingShiftTelemetry;
        if (telemetry) {
          if (
            (alert.optionType === 'CE' &&
              (telemetry.shiftType === 'BULLISH_PUT_WRITING_SURGE' ||
                telemetry.shiftType === 'CALL_UNWINDING_SHORT_COVER' ||
                (telemetry.writingRatio >= (alert.triggerTargetValue || 2.0)))) ||
            (alert.optionType === 'PE' &&
              (telemetry.shiftType === 'BEARISH_CALL_WRITING_WALL' ||
                telemetry.shiftType === 'PUT_UNWINDING_LONG_PANIC' ||
                (telemetry.writingRatio <= (alert.triggerTargetValue || 0.5))))
          ) {
            isHit = true;
            hitReason = `🏛️ Institutional Shift (${telemetry.shiftType.replace(/_/g, ' ')}): ${telemetry.primaryDriver} (Ratio: ${telemetry.writingRatio}x)`;
          }
        }
        break;
    }

    if (isHit) {
      hasChanges = true;
      const triggeredAlert: IndexOptionAlert = {
        ...alert,
        isTriggered: true,
        isActive: false,
        triggeredAt: new Date().toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
        triggeredPrice: livePremium,
        triggerMessage: hitReason,
      };
      newlyTriggeredAlerts.push(triggeredAlert);

      if (alert.soundEnabled) {
        playIndexAlertChime('HIGH');
      }

      if (alert.pushEnabled) {
        sendBrowserPushNotification(
          `🚨 [INDEX ALERT HIT] ${alert.action} ${alert.contractName} (${alert.moneyness.replace('_', ' ')})`,
          `${hitReason} Live Premium: ₹${livePremium.toFixed(2)} | T1: ₹${alert.target1.toFixed(2)} | SL: ₹${alert.stopLoss.toFixed(2)}`
        );
      }

      return triggeredAlert;
    }

    return alert;
  });

  if (hasChanges) {
    persistIndexOptionAlerts(updatedAlerts);
  }

  return {
    updatedAlerts,
    newlyTriggeredAlerts,
  };
}
