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
