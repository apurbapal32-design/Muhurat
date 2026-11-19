import { AlertConfig, AlertLogItem, FyersQuote, FyersWsTick, ScannedStock, SupportedIndexSymbol } from '../types';

export interface CustomPriceAlert {
  id: string;
  symbol: string;
  stockName: string;
  targetPrice: number;
  condition: 'ABOVE' | 'BELOW' | 'HITS';
  enabled: boolean;
  createdAt: string;
  triggered: boolean;
  triggeredAt?: string;
  triggeredPrice?: number;
}

// Multi-source Feed Reconciliation Types
export type FeedSourceType =
  | 'FYERS_WS'
  | 'BACKUP_REST'
  | 'PREVIOUS_VALIDATED'
  | 'BENCHMARK_REFERENCE';

export interface MultiSourcePriceReconciliationOptions {
  symbol: string | SupportedIndexSymbol;
  wsTick?: Partial<FyersWsTick> | null;
  restQuote?: Partial<FyersQuote> | null;
  previousPrice?: number | null;
  fallbackBasePrice?: number | null;
  prevClose?: number | null;
  allowedDeviationPct?: number; // Maximum allowed deviation from baseline (default 12% for Index Spots, 40% for Options)
  isOptionContract?: boolean;
  strike?: number;
  optionType?: 'CE' | 'PE';
}

export interface ReconciledPriceResult {
  isValid: boolean;
  normalizedPrice: number;
  prevClose: number;
  change: number;
  changePercent: number;
  sourceUsed: FeedSourceType;
  confidenceScore: number; // 0 to 100
  isAnomalyDetected: boolean;
  anomalyReason?: string;
  reconciliationNotes: string[];
  reconciledAt: string;
}

// Known Index Baselines for sanity validation
const KNOWN_INDEX_BASELINES: Record<string, number> = {
  'NIFTY 50': 24090.85,
  NIFTY50: 24090.85,
  NIFTY: 24090.85,
  'NSE:NIFTY50-INDEX': 24090.85,
  BANKNIFTY: 57509.95,
  'NIFTY BANK': 57509.95,
  'NSE:NIFTYBANK-INDEX': 57509.95,
  FINNIFTY: 26280.65,
  'NSE:FINNIFTY-INDEX': 26280.65,
  MIDCPNIFTY: 14948.85,
  'NSE:MIDCPNIFTY-INDEX': 14948.85,
  'NSE:NIFTYMIDSELECT-INDEX': 14948.85,
  SENSEX: 76933.59,
  'BSE:SENSEX-INDEX': 76933.59,
  'BSE:SENSEX30-INDEX': 76933.59,
};

/**
 * Robust Multi-Source Price Feed Reconciliation & Normalization Engine
 * Specifically reconciles real-time Fyers WebSocket ticks vs. Backup REST API quotes vs. Benchmarks
 * to prevent out-of-band anomalies, option-vs-spot contamination, or corrupted zero values in Tick Stream mode.
 */
export function validateAndNormalizePrice(
  input: MultiSourcePriceReconciliationOptions | string,
  candidatePrice?: number,
  referencePrice?: number,
  allowedDeviationPct?: number
): ReconciledPriceResult {
  // Support both object options and legacy positional arguments
  let opts: MultiSourcePriceReconciliationOptions;
  if (typeof input === 'string') {
    opts = {
      symbol: input,
      previousPrice: referencePrice,
      allowedDeviationPct: allowedDeviationPct,
      fallbackBasePrice: referencePrice,
      wsTick: candidatePrice !== undefined ? { lp: candidatePrice } : null,
    };
  } else {
    opts = input;
  }

  const {
    symbol,
    wsTick,
    restQuote,
    previousPrice,
    fallbackBasePrice,
    isOptionContract = false,
    strike,
    optionType,
  } = opts;

  const notes: string[] = [];
  const nowStr = new Date().toLocaleTimeString('en-IN');
  const upperSymbol = (symbol || '').toUpperCase().trim();

  // 1. Resolve Benchmark Baseline
  const knownBaseline =
    KNOWN_INDEX_BASELINES[upperSymbol] ||
    fallbackBasePrice ||
    (previousPrice && previousPrice > 0 ? previousPrice : undefined) ||
    24000;

  // Determine deviation limit (Index spot tighter tolerance: 12%, Options higher tolerance: 50%)
  const maxDeviationPct =
    opts.allowedDeviationPct ??
    (isOptionContract || upperSymbol.includes('CE') || upperSymbol.includes('PE') ? 50 : 12);

  // 2. Extract Candidate Prices
  const wsLp = wsTick && typeof wsTick.lp === 'number' && !isNaN(wsTick.lp) && wsTick.lp > 0 ? wsTick.lp : null;
  const restLp = restQuote && typeof restQuote.lp === 'number' && !isNaN(restQuote.lp) && restQuote.lp > 0 ? restQuote.lp : null;
  const prevValid = previousPrice && typeof previousPrice === 'number' && !isNaN(previousPrice) && previousPrice > 0 ? previousPrice : null;

  // 3. Resolve Previous Close Reference
  let resolvedPrevClose =
    opts.prevClose ||
    (wsTick && typeof wsTick.prevClose === 'number' && wsTick.prevClose > 0 ? wsTick.prevClose : null) ||
    (restQuote && typeof restQuote.prevClose === 'number' && restQuote.prevClose > 0 ? restQuote.prevClose : null) ||
    (prevValid ? prevValid * 0.995 : knownBaseline * 0.995);

  let selectedPrice = knownBaseline;
  let sourceUsed: FeedSourceType = 'BENCHMARK_REFERENCE';
  let isAnomalyDetected = false;
  let anomalyReason: string | undefined;
  let confidenceScore = 50;

  // 4. Spot vs Option Contamination Check
  const isSpotIndex =
    !isOptionContract &&
    (upperSymbol.includes('NIFTY') ||
      upperSymbol.includes('BANKNIFTY') ||
      upperSymbol.includes('FINNIFTY') ||
      upperSymbol.includes('MIDCPNIFTY') ||
      upperSymbol.includes('SENSEX'));

  // If this is a Spot Index, but candidate price looks like an option premium (< 2,500 for high value index)
  const isOptionPriceContaminatingSpot =
    isSpotIndex && wsLp !== null && wsLp < knownBaseline * 0.35;

  // If this is an Option Contract, but candidate price looks like an index spot (> 4,500)
  const isSpotPriceContaminatingOption =
    isOptionContract && wsLp !== null && wsLp > 4500;

  if (isOptionPriceContaminatingSpot) {
    isAnomalyDetected = true;
    anomalyReason = `Option premium tick (₹${wsLp}) mistakenly targeted Spot Index ${upperSymbol} (baseline ₹${knownBaseline}).`;
    notes.push(`[RECONCILE_REJECT_CONTAMINATION] Rejected WS tick ₹${wsLp}.`);
  }

  if (isSpotPriceContaminatingOption) {
    isAnomalyDetected = true;
    anomalyReason = `Spot Index price (₹${wsLp}) mistakenly targeted Option Strike ${upperSymbol} (strike ${strike} ${optionType}).`;
    notes.push(`[RECONCILE_REJECT_CONTAMINATION] Rejected WS option tick ₹${wsLp}.`);
  }

  // 5. Multi-Source Candidate Evaluation
  if (wsLp !== null && !isOptionPriceContaminatingSpot && !isSpotPriceContaminatingOption) {
    // Check WS tick deviation against known baseline / backup REST
    const refForWs = restLp !== null ? restLp : (prevValid !== null ? prevValid : knownBaseline);
    const deviationFromRef = Math.abs(wsLp - refForWs) / refForWs;

    if (deviationFromRef * 100 <= maxDeviationPct) {
      // WS Tick is clean and within expected threshold
      selectedPrice = wsLp;
      sourceUsed = 'FYERS_WS';
      confidenceScore = restLp !== null ? 98 : 90;
      notes.push(`[SOURCE_FYERS_WS] Accepted live tick ₹${wsLp} (deviation ${(deviationFromRef * 100).toFixed(2)}%).`);
    } else {
      // WS Tick is out of acceptable bounds
      isAnomalyDetected = true;
      anomalyReason = `WS Tick ₹${wsLp} deviated by ${(deviationFromRef * 100).toFixed(1)}% from reference ₹${refForWs} (limit ${maxDeviationPct}%).`;
      notes.push(`[RECONCILE_OUTLIER] WS tick ₹${wsLp} rejected due to excessive deviation.`);

      // Fallback to REST Quote if valid
      if (restLp !== null) {
        const restDev = Math.abs(restLp - knownBaseline) / knownBaseline;
        if (restDev * 100 <= maxDeviationPct * 1.5) {
          selectedPrice = restLp;
          sourceUsed = 'BACKUP_REST';
          confidenceScore = 85;
          notes.push(`[FALLBACK_REST] Reconciled with backup REST quote ₹${restLp}.`);
        } else if (prevValid !== null) {
          selectedPrice = prevValid;
          sourceUsed = 'PREVIOUS_VALIDATED';
          confidenceScore = 75;
          notes.push(`[FALLBACK_PREV] Retained previous validated price ₹${prevValid}.`);
        } else {
          selectedPrice = knownBaseline;
          sourceUsed = 'BENCHMARK_REFERENCE';
          confidenceScore = 60;
          notes.push(`[FALLBACK_BENCHMARK] Reverted to benchmark baseline ₹${knownBaseline}.`);
        }
      } else if (prevValid !== null) {
        selectedPrice = prevValid;
        sourceUsed = 'PREVIOUS_VALIDATED';
        confidenceScore = 75;
        notes.push(`[FALLBACK_PREV] Retained previous validated price ₹${prevValid}.`);
      } else {
        selectedPrice = knownBaseline;
        sourceUsed = 'BENCHMARK_REFERENCE';
        confidenceScore = 60;
        notes.push(`[FALLBACK_BENCHMARK] Reverted to benchmark baseline ₹${knownBaseline}.`);
      }
    }
  } else if (restLp !== null) {
    // No valid WS tick, but REST quote available
    const restDev = Math.abs(restLp - knownBaseline) / knownBaseline;
    if (restDev * 100 <= maxDeviationPct * 1.5) {
      selectedPrice = restLp;
      sourceUsed = 'BACKUP_REST';
      confidenceScore = 88;
      notes.push(`[SOURCE_REST] Accepted backup REST quote ₹${restLp}.`);
    } else if (prevValid !== null) {
      selectedPrice = prevValid;
      sourceUsed = 'PREVIOUS_VALIDATED';
      confidenceScore = 70;
      notes.push(`[FALLBACK_PREV] REST quote out of bounds, retained previous validated price ₹${prevValid}.`);
    } else {
      selectedPrice = knownBaseline;
      sourceUsed = 'BENCHMARK_REFERENCE';
      confidenceScore = 55;
    }
  } else if (prevValid !== null) {
    // Both feeds unavailable, use last known validated
    selectedPrice = prevValid;
    sourceUsed = 'PREVIOUS_VALIDATED';
    confidenceScore = 72;
    notes.push(`[SOURCE_PREV_VALIDATED] Reused previous valid state ₹${prevValid}.`);
  } else {
    selectedPrice = knownBaseline;
    sourceUsed = 'BENCHMARK_REFERENCE';
    confidenceScore = 50;
    notes.push(`[SOURCE_BENCHMARK] Initialized with static benchmark baseline ₹${knownBaseline}.`);
  }

  // 6. Calculate Net Change and Percentage
  const normalizedPrice = Number(selectedPrice.toFixed(2));
  const finalPrevClose = Number(resolvedPrevClose.toFixed(2));
  const change = Number((normalizedPrice - finalPrevClose).toFixed(2));
  const changePercent = finalPrevClose > 0 ? Number(((change / finalPrevClose) * 100).toFixed(2)) : 0;

  return {
    isValid: !isNaN(normalizedPrice) && normalizedPrice > 0,
    normalizedPrice,
    prevClose: finalPrevClose,
    change,
    changePercent,
    sourceUsed,
    confidenceScore,
    isAnomalyDetected,
    anomalyReason,
    reconciliationNotes: notes,
    reconciledAt: nowStr,
  };
}

/**
 * Dedicated helper for Index Spot Feed Validation & Sanitization
 */
export function validateIndexSpotFeed(
  indexSymbol: SupportedIndexSymbol,
  wsTick?: Partial<FyersWsTick> | null,
  restQuote?: Partial<FyersQuote> | null,
  previousPrice?: number | null
): ReconciledPriceResult {
  return validateAndNormalizePrice({
    symbol: indexSymbol,
    wsTick,
    restQuote,
    previousPrice,
    isOptionContract: false,
    allowedDeviationPct: 25, // 25% dynamic tolerance for spot indices
  });
}

/**
 * Dedicated helper for Option Strike Feed Validation & Sanitization
 */
export function validateOptionStrikeFeed(
  symbol: string,
  strike: number,
  optionType: 'CE' | 'PE',
  underlyingSpotPrice: number,
  wsTick?: Partial<FyersWsTick> | null,
  restQuote?: Partial<FyersQuote> | null,
  previousPrice?: number | null
): ReconciledPriceResult {
  return validateAndNormalizePrice({
    symbol,
    strike,
    optionType,
    wsTick,
    restQuote,
    previousPrice,
    isOptionContract: true,
    allowedDeviationPct: 60, // Options can have wider % volatility
  });
}


const ALERTS_STORAGE_KEY = 'custom_price_alerts_v1';

export function getCustomPriceAlerts(): CustomPriceAlert[] {
  try {
    const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse price alerts from localStorage:', e);
    return [];
  }
}

export function saveCustomPriceAlert(alert: CustomPriceAlert): void {
  const alerts = getCustomPriceAlerts();
  const existingIndex = alerts.findIndex((a) => a.symbol === alert.symbol);
  if (existingIndex >= 0) {
    alerts[existingIndex] = alert;
  } else {
    alerts.push(alert);
  }
  localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
}

export function removeCustomPriceAlert(symbol: string): void {
  const alerts = getCustomPriceAlerts();
  const filtered = alerts.filter((a) => a.symbol !== symbol);
  localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(filtered));
}

export async function requestPushNotificationPermission(): Promise<boolean> {
  if (!('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  if (Notification.permission !== 'denied') {
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  }
  return false;
}

export function triggerPushNotification(title: string, body: string, playSound: boolean = false): void {
  // 1. Browser Native Push Notification
  if ('Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'price-alert-' + Date.now(),
      });
    } catch (e) {
      console.error('Push notification error:', e);
    }
  }

  // 2. Web Audio API Chime (Only if explicitly enabled)
  if (playSound) {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
      // Audio fallback
    }
  }
}

export function checkAndTriggerPriceAlerts(stocks: ScannedStock[]): CustomPriceAlert[] {
  const alerts = getCustomPriceAlerts();
  let updated = false;
  const newlyTriggered: CustomPriceAlert[] = [];

  for (const alert of alerts) {
    if (!alert.enabled || alert.triggered) continue;

    const matchedStock = stocks.find((s) => s.symbol === alert.symbol);
    if (!matchedStock) continue;

    const price = matchedStock.price;
    let isHit = false;

    if (alert.condition === 'ABOVE' && price >= alert.targetPrice) {
      isHit = true;
    } else if (alert.condition === 'BELOW' && price <= alert.targetPrice) {
      isHit = true;
    } else if (alert.condition === 'HITS') {
      const diffPercent = Math.abs(price - alert.targetPrice) / alert.targetPrice;
      if (diffPercent <= 0.002) {
        isHit = true;
      }
    }

    if (isHit) {
      alert.triggered = true;
      alert.triggeredAt = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      alert.triggeredPrice = price;
      updated = true;
      newlyTriggered.push(alert);

      const title = `🚨 Custom Price Alert Hit: ${alert.symbol}!`;
      const body = `${alert.stockName} (${alert.symbol}) price ₹${price.toLocaleString(
        'en-IN'
      )} reached your target alert ₹${alert.targetPrice.toLocaleString('en-IN')} (${
        alert.condition
      })!`;

      triggerPushNotification(title, body);
    }
  }

  if (updated) {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  }

  return newlyTriggered;
}

// Track recently triggered order size alerts in memory to prevent duplicate spam
const recentOrderQtyAlerts = new Map<string, number>();

export function checkOrderQtyAndRvolAlerts(
  stocks: ScannedStock[],
  config: AlertConfig
): AlertLogItem[] {
  if (config.enableOrderQtyAlert === false) return [];

  const minQty = config.minOrderSizeQty ?? 50000;
  const minRvol = config.minRvolForOrderAlert ?? 1.5;
  const filter = config.orderTypeFilter ?? 'BOTH';

  const newOrderAlerts: AlertLogItem[] = [];
  const now = Date.now();

  for (const stock of stocks) {
    const rvol = stock.indicators.rvol || 1.0;
    const totalVolume = stock.volume || 0;
    
    // Estimate single candle surge or instantaneous order size (typically 10-25% of total current candle volume or total volume)
    const estimatedOrderQty = Math.round(totalVolume * 0.15) || totalVolume;

    // Check if total volume or estimated order size meets threshold (e.g. 100,000 Qty) AND RVol meets min threshold (e.g. 1.5x)
    if (estimatedOrderQty >= minQty && rvol >= minRvol) {
      const isPurchase = stock.changePercent >= 0 || stock.price >= stock.indicators.vwap;
      const dealType: 'PURCHASE' | 'SALE' = isPurchase ? 'PURCHASE' : 'SALE';

      if (filter === 'PURCHASE_ONLY' && dealType !== 'PURCHASE') continue;
      if (filter === 'SALE_ONLY' && dealType !== 'SALE') continue;

      const cacheKey = `${stock.symbol}_${dealType}`;
      const lastTrigger = recentOrderQtyAlerts.get(cacheKey) || 0;

      // 5-minute cooldown per stock per deal type
      if (now - lastTrigger < 300000) continue;

      recentOrderQtyAlerts.set(cacheKey, now);

      const vwapStatus: 'ABOVE' | 'BELOW' = stock.price >= stock.indicators.vwap ? 'ABOVE' : 'BELOW';
      const sectorStatus: 'POSITIVE' | 'NEGATIVE' = stock.changePercent >= 0 ? 'POSITIVE' : 'NEGATIVE';
      const newsSent: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' = stock.newsSentiment || (stock.changePercent >= 0 ? 'POSITIVE' : 'NEGATIVE');

      const alertItem: AlertLogItem = {
        id: `ORD-${now}-${Math.floor(Math.random() * 1000)}`,
        timestamp: new Date().toISOString(),
        symbol: stock.symbol,
        signal: isPurchase ? 'BUY' : 'SELL',
        aiScore: stock.aiScore,
        price: stock.price,
        entry: stock.risk.entryPrice,
        stopLoss: stock.risk.stopLoss,
        target1: stock.risk.target1,
        target2: stock.risk.target2,
        targetHitStatus: 'ACTIVE',
        sentVia: ['Dashboard Toast', 'Audio Beep', ...(config.enableTelegram ? ['Telegram'] : []), ...(config.enableWhatsapp ? ['WhatsApp'] : [])],
        status: 'SENT',
        alertCategory: 'LARGE_ORDER_QTY',
        orderQty: estimatedOrderQty,
        rvol: rvol,
        dealType: dealType,
        reason: `🔥 ${estimatedOrderQty.toLocaleString('en-IN')} Qty ${dealType} Surge | RVol ${rvol.toFixed(1)}x | Vol ${(totalVolume / 100000).toFixed(2)}L`,
        sector: stock.sector,
        sectorStatus: sectorStatus,
        sectorChangePercent: stock.changePercent,
        oi: stock.oiData ? `${stock.oiData.openInterest.toFixed(2)}L` : '1.25M',
        oiChangePercent: stock.oiData?.changeInOIPercent || 2.5,
        volumeX: `${rvol.toFixed(1)}x Vol`,
        rsi: stock.indicators.rsi,
        vwap: stock.indicators.vwap,
        vwapStatus: vwapStatus,
        newsSentiment: newsSent,
        newsTitle: stock.newsTitle || `${stock.symbol} order surge detected`,
        purchaseRationale: `Order Surge (${estimatedOrderQty.toLocaleString('en-IN')} Qty ${dealType}): ${rvol.toFixed(1)}x Vol surge, ${vwapStatus === 'ABOVE' ? 'Above VWAP' : 'Below VWAP'}, RSI ${stock.indicators.rsi}, Sector ${stock.sector} (${sectorStatus === 'POSITIVE' ? '+' : ''}${stock.changePercent}%), and Live News: ${newsSent}.`,
      };

      newOrderAlerts.push(alertItem);

      // Trigger Browser Push & Sound
      const iconEmoji = dealType === 'PURCHASE' ? '🟢' : '🔴';
      const title = `${iconEmoji} ${dealType} Order Alert: ${stock.symbol}`;
      const body = `${stock.symbol} detected ${estimatedOrderQty.toLocaleString('en-IN')} Qty ${dealType} order surge at ₹${stock.price}! RVol: ${rvol.toFixed(1)}x`;

      triggerPushNotification(title, body);
    }
  }

  return newOrderAlerts;
}

export interface CumulativeDeltaEvaluationState {
  prevDeltas: Map<string, number>;
  lastTriggered: Map<string, number>;
}

const defaultCumulativeDeltaState: CumulativeDeltaEvaluationState = {
  prevDeltas: new Map<string, number>(),
  lastTriggered: new Map<string, number>(),
};

/**
 * Computes intraday session Cumulative Volume Delta (CVD) from OHLCV bars using Close Location Value (CLV).
 */
export function calculateSessionCumulativeDelta(
  candles: Array<{ open: number; high: number; low: number; close: number; volume: number }>
): number {
  if (!Array.isArray(candles) || candles.length === 0) return 0;
  let cumDelta = 0;
  for (const bar of candles) {
    const vol = Math.max(0, Number(bar.volume) || 0);
    if (vol <= 0) continue;
    const high = Number(bar.high) || 0;
    const low = Number(bar.low) || 0;
    const close = Number(bar.close) || 0;
    const open = Number(bar.open) || 0;
    const range = high - low;
    let clv = 0;
    if (range > 0.0001) {
      clv = ((close - low) - (high - close)) / range;
    } else if (close > open) {
      clv = 0.5;
    } else if (close < open) {
      clv = -0.5;
    }
    cumDelta += clv * vol;
  }
  const rounded = Math.round(cumDelta);
  return rounded === 0 ? 0 : rounded;
}

/**
 * Resolves a stock's numeric Cumulative Delta, preferring the server-computed session CVD
 * and falling back deterministically to intraday CLV * volume or order-book imbalance.
 */
export function getStockCumulativeDelta(stock: ScannedStock): number {
  if (typeof stock.cumulativeDelta === 'number' && Number.isFinite(stock.cumulativeDelta)) {
    return Math.round(stock.cumulativeDelta);
  }
  const high = Number(stock.indicators?.high) || 0;
  const low = Number(stock.indicators?.low) || 0;
  const close = Number(stock.price) || Number(stock.indicators?.close) || 0;
  const vol = Math.max(0, Number(stock.volume) || 0);
  if (high > low && vol > 0) {
    const clv = ((close - low) - (high - close)) / (high - low);
    return Math.round(clv * vol * 0.35);
  }
  if (typeof stock.bidQty === 'number' && typeof stock.askQty === 'number') {
    return Math.round(stock.bidQty - stock.askQty);
  }
  return 0;
}

export function formatSignedDelta(value: number): string {
  const rounded = Math.round(value);
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  return `${sign}${Math.abs(rounded).toLocaleString('en-IN')}`;
}

/**
 * Detects when any stock's Cumulative Delta crosses the user's configured threshold value.
 * Supports ABOVE (>= threshold), BELOW (<= threshold), and BOTH (>= +|threshold| or <= -|threshold|).
 */
export function checkCumulativeDeltaAlerts(
  stocks: ScannedStock[],
  config: AlertConfig,
  options?: {
    state?: CumulativeDeltaEvaluationState;
    now?: number;
    cooldownMs?: number;
    notifyBrowser?: boolean;
  }
): AlertLogItem[] {
  if (config.enableCumulativeDeltaAlert === false) return [];

  const rawThreshold = config.cumulativeDeltaThreshold;
  if (rawThreshold === undefined || rawThreshold === null || !Number.isFinite(Number(rawThreshold))) {
    return [];
  }

  const threshold = Number(rawThreshold);
  const direction = config.cumulativeDeltaDirection ?? 'BOTH';
  const state = options?.state ?? defaultCumulativeDeltaState;
  const now = options?.now ?? Date.now();
  const cooldownMs = options?.cooldownMs ?? 300000; // 5-minute cooldown per symbol & direction
  const notifyBrowser = options?.notifyBrowser ?? true;

  const triggeredAlerts: AlertLogItem[] = [];

  for (const stock of stocks) {
    if (!stock?.symbol) continue;
    const curr = getStockCumulativeDelta(stock);
    const prev = state.prevDeltas.get(stock.symbol);
    state.prevDeltas.set(stock.symbol, curr);

    let crossedDirection: 'ABOVE' | 'BELOW' | null = null;
    let appliedThreshold = threshold;

    if (direction === 'ABOVE') {
      if (curr >= threshold && (prev === undefined || prev < threshold)) {
        crossedDirection = 'ABOVE';
        appliedThreshold = threshold;
      }
    } else if (direction === 'BELOW') {
      if (curr <= threshold && (prev === undefined || prev > threshold)) {
        crossedDirection = 'BELOW';
        appliedThreshold = threshold;
      }
    } else {
      const absThreshold = Math.abs(threshold);
      if (absThreshold === 0) {
        if (prev !== undefined && prev < 0 && curr >= 0) {
          crossedDirection = 'ABOVE';
          appliedThreshold = 0;
        } else if (prev !== undefined && prev > 0 && curr <= 0) {
          crossedDirection = 'BELOW';
          appliedThreshold = 0;
        }
      } else if (curr >= absThreshold && (prev === undefined || prev < absThreshold)) {
        crossedDirection = 'ABOVE';
        appliedThreshold = absThreshold;
      } else if (curr <= -absThreshold && (prev === undefined || prev > -absThreshold)) {
        crossedDirection = 'BELOW';
        appliedThreshold = -absThreshold;
      }
    }

    if (!crossedDirection) continue;

    const cacheKey = `${stock.symbol}_${crossedDirection}_${appliedThreshold}`;
    const lastTrigger = state.lastTriggered.get(cacheKey);
    if (lastTrigger !== undefined && now - lastTrigger < cooldownMs) continue;

    state.lastTriggered.set(cacheKey, now);

    const isBullish = crossedDirection === 'ABOVE';
    const rvol = Number(stock.indicators?.rvol) || 1.0;
    const vwap = Number(stock.indicators?.vwap) || stock.price;
    const vwapStatus: 'ABOVE' | 'BELOW' = stock.price >= vwap ? 'ABOVE' : 'BELOW';
    const sectorStatus: 'POSITIVE' | 'NEGATIVE' = (stock.changePercent || 0) >= 0 ? 'POSITIVE' : 'NEGATIVE';
    const newsSent: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' =
      stock.newsSentiment || (isBullish ? 'POSITIVE' : 'NEGATIVE');

    const sentVia = [
      'UI Notification',
      ...(config.soundAlerts ? ['Audio Beep'] : []),
      ...(config.enableTelegram ? ['Telegram'] : []),
      ...(config.enableWhatsapp ? ['WhatsApp'] : []),
      ...(config.enableEmail ? ['Email'] : []),
    ];

    const arrowLabel = isBullish ? 'crossed above' : 'crossed below';
    const deltaStr = formatSignedDelta(curr);
    const thresholdStr = formatSignedDelta(appliedThreshold);
    const prevStr = prev !== undefined ? ` (from ${formatSignedDelta(prev)})` : '';

    const alertItem: AlertLogItem = {
      id: `CVD-${stock.symbol}-${crossedDirection}-${now}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date(now).toISOString(),
      symbol: stock.symbol,
      signal: isBullish ? 'BUY' : 'SELL',
      aiScore: stock.aiScore || 85,
      accuracyScore: stock.aiScore || 85,
      price: stock.price,
      entry: stock.risk?.entryPrice || stock.price,
      stopLoss: stock.risk?.stopLoss || Number((stock.price * (isBullish ? 0.988 : 1.012)).toFixed(2)),
      target1: stock.risk?.target1 || Number((stock.price * (isBullish ? 1.018 : 0.982)).toFixed(2)),
      target2: stock.risk?.target2 || Number((stock.price * (isBullish ? 1.032 : 0.968)).toFixed(2)),
      targetHitStatus: 'ACTIVE',
      sentVia,
      status: 'SENT',
      alertCategory: 'CUMULATIVE_DELTA',
      rvol,
      cumulativeDelta: curr,
      prevCumulativeDelta: prev,
      cumulativeDeltaThreshold: appliedThreshold,
      cumulativeDeltaDirection: crossedDirection,
      reason: `Cum Δ ${deltaStr} ${arrowLabel} ${thresholdStr}${prevStr} | ₹${stock.price.toLocaleString('en-IN')}`,
      sector: stock.sector,
      sectorStatus,
      sectorChangePercent: stock.sectorChangePercent ?? stock.changePercent,
      oi: stock.oiData ? `${stock.oiData.openInterest.toFixed(2)}L` : '1.25M',
      oiChangePercent: stock.oiData?.changeInOIPercent || 2.1,
      volumeX: `${rvol.toFixed(1)}x Vol`,
      rsi: stock.indicators?.rsi ?? 55,
      vwap,
      vwapStatus,
      newsSentiment: newsSent,
      newsTitle: stock.newsTitle || `${stock.symbol} Cumulative Delta threshold crossing`,
      purchaseRationale: `Cumulative Delta Threshold Alert (${stock.symbol}): Session Cum Δ reached ${deltaStr} and ${arrowLabel} configured threshold ${thresholdStr}${prevStr}. Trading ${vwapStatus === 'ABOVE' ? 'Above' : 'Below'} VWAP (₹${vwap}) with ${rvol.toFixed(1)}x RVol.`,
    };

    triggeredAlerts.push(alertItem);

    if (notifyBrowser && typeof window !== 'undefined') {
      const emoji = isBullish ? '📈' : '📉';
      triggerPushNotification(
        `${emoji} Cumulative Delta Alert: ${stock.symbol}`,
        `${stock.symbol} Cum Δ ${deltaStr} ${arrowLabel} ${thresholdStr} at ₹${stock.price.toLocaleString('en-IN')}`
      );
    }
  }

  return triggeredAlerts;
}

/**
 * Builds an immediate simulated Cumulative Delta crossing AlertLogItem using the user's active threshold config
 * so traders can test and preview UI notifications directly from AlertsView.
 */
export function createCumulativeDeltaTestAlert(
  stock: ScannedStock | undefined,
  config: AlertConfig
): AlertLogItem {
  const now = Date.now();
  const rawThreshold = Number(config.cumulativeDeltaThreshold ?? 50000);
  const directionPref = config.cumulativeDeltaDirection ?? 'BOTH';
  const crossedDirection: 'ABOVE' | 'BELOW' =
    directionPref === 'BELOW' || (directionPref === 'BOTH' && rawThreshold < 0)
      ? 'BELOW'
      : 'ABOVE';

  const appliedThreshold =
    directionPref === 'BOTH'
      ? crossedDirection === 'ABOVE'
        ? Math.abs(rawThreshold)
        : -Math.abs(rawThreshold)
      : rawThreshold;

  const deltaBuffer = Math.max(2500, Math.round(Math.abs(appliedThreshold) * 0.14));
  const simulatedCurrent =
    crossedDirection === 'ABOVE' ? appliedThreshold + deltaBuffer : appliedThreshold - deltaBuffer;
  const simulatedPrev =
    crossedDirection === 'ABOVE' ? appliedThreshold - deltaBuffer : appliedThreshold + deltaBuffer;

  const symbol = stock?.symbol || 'RELIANCE';
  const price = stock?.price || 1425.5;
  const isBullish = crossedDirection === 'ABOVE';
  const vwap = stock?.indicators?.vwap || price;
  const rvol = stock?.indicators?.rvol || 1.9;
  const deltaStr = formatSignedDelta(simulatedCurrent);
  const thresholdStr = formatSignedDelta(appliedThreshold);
  const prevStr = formatSignedDelta(simulatedPrev);

  return {
    id: `CVD-TEST-${symbol}-${now}`,
    timestamp: new Date(now).toISOString(),
    symbol,
    signal: isBullish ? 'BUY' : 'SELL',
    aiScore: stock?.aiScore || 91,
    accuracyScore: stock?.aiScore || 91,
    price,
    entry: stock?.risk?.entryPrice || price,
    stopLoss: stock?.risk?.stopLoss || Number((price * (isBullish ? 0.988 : 1.012)).toFixed(2)),
    target1: stock?.risk?.target1 || Number((price * (isBullish ? 1.018 : 0.982)).toFixed(2)),
    target2: stock?.risk?.target2 || Number((price * (isBullish ? 1.032 : 0.968)).toFixed(2)),
    targetHitStatus: 'ACTIVE',
    sentVia: ['UI Notification', 'Alert History'],
    status: 'SENT',
    alertCategory: 'CUMULATIVE_DELTA',
    rvol,
    cumulativeDelta: simulatedCurrent,
    prevCumulativeDelta: simulatedPrev,
    cumulativeDeltaThreshold: appliedThreshold,
    cumulativeDeltaDirection: crossedDirection,
    reason: `Cum Δ ${deltaStr} ${isBullish ? 'crossed above' : 'crossed below'} ${thresholdStr} (from ${prevStr})`,
    sector: stock?.sector || 'Energy',
    sectorStatus: (stock?.changePercent ?? 0.8) >= 0 ? 'POSITIVE' : 'NEGATIVE',
    sectorChangePercent: stock?.sectorChangePercent ?? stock?.changePercent ?? 0.8,
    oi: stock?.oiData ? `${stock.oiData.openInterest.toFixed(2)}L` : '1.42M',
    oiChangePercent: stock?.oiData?.changeInOIPercent ?? 3.1,
    volumeX: `${rvol.toFixed(1)}x Vol`,
    rsi: stock?.indicators?.rsi ?? 63.4,
    vwap,
    vwapStatus: price >= vwap ? 'ABOVE' : 'BELOW',
    newsSentiment: isBullish ? 'POSITIVE' : 'NEGATIVE',
    newsTitle: `${symbol} Cumulative Delta threshold test notification`,
    purchaseRationale: `Cumulative Delta Test Trigger (${symbol}): Session Cum Δ moved from ${prevStr} to ${deltaStr}, crossing ${isBullish ? 'above' : 'below'} your ${thresholdStr} threshold.`,
  };
}

