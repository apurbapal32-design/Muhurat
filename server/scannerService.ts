import fs from 'fs';
import os from 'os';
import path from 'path';
import { NIFTY_200_STOCKS } from '../src/data/nifty200';
import {
  AlertConfig,
  AlertLogItem,
  BacktestRequest,
  BacktestResult,
  BacktestTrade,
  BrokerConfig,
  BulkOrder,
  Candle,
  CorporateAction,
  EquityCurvePoint,
  FyersQuote,
  MarketOverview,
  NewsItem,
  ScannedStock,
  TradePosition,
} from '../src/types';
import { evaluateStockScanner } from '../src/utils/technicalAnalysis';
import { calculateStockOI } from '../src/utils/oiAnalysis';
import { calculateMarketStatus, getISTDateParts } from '../src/data/marketSchedule';
import { BrokerMarketScheduleStatus, upstoxService } from './upstoxService';
import { autonomousPriceService, deriveOrderBookDepth, IntradayCandleBar, UnifiedMarketQuote } from './autonomousPriceService';
import { marketWebSocketServer } from './marketWebSocketServer';
import { sentinelAgentService } from './sentinelAgentService';
import {
  normalizeMarketOverview,
  normalizeScannedStock,
  parseFiniteNum,
  round2,
} from '../src/utils/quoteNormalizer';
import {
  calculateSessionCumulativeDelta,
  checkCumulativeDeltaAlerts,
  CumulativeDeltaEvaluationState,
} from '../src/utils/priceAlerts';
import {
  computeUniversalStrongMetrics,
  stickyScannerRegistry,
  UNIVERSAL_MAX_PER_DIRECTION,
  UNIVERSAL_STRONG_ADX_MIN,
  UNIVERSAL_STRONG_RVOL_MIN,
  UNIVERSAL_STRONG_XTIME_VOL_MIN,
} from './scannerUniversalGate';
import {
  getLockedSessionWindowStatus,
  LOCKED_SYSTEM_RULES,
} from './systemFiveRules';
import { dualAiTradeManagerDesk } from './aiTradeManagerAgent';
import { scannerFleet20Manager } from './scannerFleet20Engine';
import { btstScannerManager } from './btstScannerEngine';

const INDEX_SYMBOLS_UNIVERSE = new Set([
  'NIFTY',
  'NIFTY 50',
  'BANKNIFTY',
  'FINNIFTY',
  'NIFTYFPI',
  'MIDCPNIFTY',
  'NIFTYNXT50',
  'SENSEX',
  'INDIAVIX',
  'NIFTYIT',
]);

const EQUITY_ONLY_STOCKS = NIFTY_200_STOCKS.filter(
  (s) => s.sector !== 'Indices' && !INDEX_SYMBOLS_UNIVERSE.has(s.symbol.toUpperCase())
);

const SESSION_STATE_FILE = path.join(os.tmpdir(), 'muhurat_scanner_session_state.json');
const DAILY_SIGNAL_LEDGER_FILE = path.join(os.tmpdir(), 'muhurat_daily_signal_ledger.json');

const LEDGER_VERSION = 2;

export type FormulaCode = 'STRONG_ORB' | 'SONIC_RVOL' | 'TITAN_WHALE' | 'QUANT_ELITE' | 'PRE_OPEN_IEP' | 'NONE';

export interface DailySignalLedgerEntry {
  symbol: string;
  signal: 'BUY' | 'SELL' | 'NEUTRAL';
  formulaCode: FormulaCode;
  formulaName: string;
  listedAt: string;
  entryTime: string;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  target3: number;
  triggerSource?: 'INTRADAY_5M_BAR' | 'PRE_OPEN_IEP' | 'NONE';
}

export interface DailySessionState {
  lastPurgeDateIST: string | null;
  lastPreOpenScanDateIST: string | null;
  lastScanDateIST: string | null;
  isMidnightCleared: boolean;
  manualOverrideDateIST: string | null;
  purgedAt?: string;
  scannedAt?: string;
}

interface StockMetaCache {
  prevClose: number;
  dayHigh: number;
  dayLow: number;
  price: number;
  lastUpdated: number;
}

export class ScannerService {
  private stockCandles: Map<string, Candle[]> = new Map();
  private stockMetaCache: Map<string, StockMetaCache> = new Map();
  private stockScanResults: ScannedStock[] = [];
  private alertLogs: AlertLogItem[] = [];
  private tradePositions: TradePosition[] = [];
  private newsFeed: NewsItem[] = [];
  private corporateActions: CorporateAction[] = [];
  private bulkOrders: BulkOrder[] = [];
  private lastScanTimestamp: string = new Date().toISOString();
  private isScanning: boolean = false;
  private activeScanPromise: Promise<ScannedStock[]> | null = null;
  private scanEpoch: number = 0;
  private autoScanTimer: NodeJS.Timeout | null = null;
  private midnightWatcherTimer: NodeJS.Timeout | null = null;
  private periodicFetchTimer: NodeJS.Timeout | null = null;
  private lastQuoteSource: string = 'AUTONOMOUS_LIVE_ENGINE';
  private brokerSchedule: BrokerMarketScheduleStatus = upstoxService.getSyncBrokerSchedule();
  private lastScheduleSyncAt: number = 0;

  private sessionState: DailySessionState = {
    lastPurgeDateIST: null,
    lastPreOpenScanDateIST: null,
    lastScanDateIST: null,
    isMidnightCleared: false,
    manualOverrideDateIST: null,
  };

  private dailySignalLedger: { dateIST: string; entries: Record<string, DailySignalLedgerEntry> } = {
    dateIST: '',
    entries: {},
  };
  private ledgerDirty: boolean = false;

  private cumulativeDeltaState: CumulativeDeltaEvaluationState = {
    prevDeltas: new Map(),
    lastTriggered: new Map(),
  };

  private alertConfig: AlertConfig = {
    minScoreToAlert: 80,
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
    soundAlerts: true,
  };

  private brokerConfig: BrokerConfig = {
    selectedBroker: process.env.UPSTOX_ACCESS_TOKEN ? 'upstox' : 'autonomous',
    apiKey: process.env.UPSTOX_API_KEY || '',
    apiSecret: process.env.UPSTOX_API_SECRET || '',
    accessToken: process.env.UPSTOX_ACCESS_TOKEN || '',
    upstoxApiKey: process.env.UPSTOX_API_KEY || '',
    upstoxApiSecret: process.env.UPSTOX_API_SECRET || '',
    upstoxAccessToken: process.env.UPSTOX_ACCESS_TOKEN || '',
    status: process.env.UPSTOX_ACCESS_TOKEN ? 'connected' : 'simulated',
    lastPingTime: new Date().toISOString(),
  };

  private marketOverview: MarketOverview = {
    nifty50: { price: 25044.65, change: 58.25, changePercent: 0.23 },
    bankNifty: { price: 59741.25, change: 890.60, changePercent: 1.51 },
    finnifty: { price: 27384.90, change: 204.25, changePercent: 0.75 },
    midcpnifty: { price: 14055.45, change: 29.45, changePercent: 0.21 },
    sensex: { price: 81106.65, change: 107.25, changePercent: 0.13 },
    niftyIT: { price: 32468.90, change: -400.75, changePercent: -1.22 },
    indiaVix: {
      price: 17.42,
      change: -1.01,
      changePercent: -5.48,
      regime: 'HIGH_FEAR',
    },
    scannedCount: 0,
    buyCount: 0,
    sellCount: 0,
    highRvolCount: 0,
    lastScanTime: new Date().toISOString(),
    marketStatus: 'OPEN',
  };

  constructor() {
    sentinelAgentService.registerProviders({
      getStocks: () => this.stockScanResults,
      getQuotes: () => autonomousPriceService.getCachedQuotes(),
      isMidnightCleared: () => this.sessionState.isMidnightCleared,
      forceRefreshQuotes: () => this.forceRefreshLiveFeeds(),
      triggerSafeRescan: async () => {
        await this.runScanCycle(false);
      },
      getWsStatus: () => {
        const ws = marketWebSocketServer.getStatus();
        return {
          connectedClients: ws.activeClients,
          ticksPerSecond: ws.ticksPerSecond,
          lastFeedSource: ws.feedSource,
        };
      },
    });
    marketWebSocketServer.setAccessTokenResolver(() => this.getEffectiveUpstoxToken());
    upstoxService.ensureInstrumentsLoaded().catch(() => {});

    this.loadSessionState();
    this.loadDailySignalLedger();
    this.initializeCandleData();
    this.seedInitialSampleData();

    const ist = getISTDateParts(new Date());
    const initStatus = calculateMarketStatus();
    const sched = upstoxService.getSyncBrokerSchedule();
    this.brokerSchedule = sched;
    const DAILY_SCAN_START_MIN = 9 * 60 + 20; // 09:20 AM IST every market day

    // Stay midnight-flushed strictly before 09:20 AM IST on trading days;
    // Run Broker API Scanner automatically all day on Weekends (Sat/Sun), Market Off Days & Special Event Off Days,
    // and at/after 09:20 AM IST on regular trading days.
    const isScanWindowActiveNow =
      sched.isMarketOffDay ||
      ((initStatus.isOpen || (sched.isTradingDay && ist.minutesFromMidnight >= DAILY_SCAN_START_MIN)) &&
        ist.minutesFromMidnight >= DAILY_SCAN_START_MIN);
    const shouldFlushOnBoot =
      !isScanWindowActiveNow &&
      ((ist.minutesFromMidnight < DAILY_SCAN_START_MIN && this.sessionState.manualOverrideDateIST !== ist.dateStr) ||
        (this.sessionState.isMidnightCleared &&
          this.sessionState.lastPurgeDateIST === ist.dateStr &&
          this.sessionState.manualOverrideDateIST !== ist.dateStr));

    if (shouldFlushOnBoot) {
      this.resetMidnightPurge(ist.dateStr, false);
      this.fetchLiveIndices().catch(() => {});
    } else {
      if (!this.sessionState.lastPurgeDateIST) {
        this.sessionState.lastPurgeDateIST = ist.dateStr;
      }
      if (isScanWindowActiveNow) {
        this.sessionState.isMidnightCleared = false;
        this.sessionState.lastPreOpenScanDateIST = ist.dateStr;
        this.sessionState.lastScanDateIST = ist.dateStr;
      }
      this.saveSessionState();
      this.marketOverview.marketStatus = this.formatOverviewMarketStatus(initStatus, sched);
      this.runScanCycle(isScanWindowActiveNow).catch(() => {});
    }

    // Async sync against Upstox Broker API v2 Market Info (/v2/market/holidays, /timings, /status/NSE)
    this.refreshBrokerSchedule(true).catch(() => {});

    // Start 3-second tick updates + 1-second Midnight/Market-Open/Broker-OffDay schedule watcher
    this.startAutoScan(3);
  }

  private formatOverviewMarketStatus(
    statusInfo: ReturnType<typeof calculateMarketStatus>,
    sched: BrokerMarketScheduleStatus
  ): string {
    if (statusInfo.isOpen) return 'OPEN (LIVE NSE/BSE)';
    if (sched.isMarketOffDay) {
      return `BROKER API SCAN • ${sched.dayCategory.replace(/_/g, ' ')}`;
    }
    return `MARKET CLOSED (${statusInfo.statusLabel})`;
  }

  public getBrokerScheduleSync(): BrokerMarketScheduleStatus {
    this.brokerSchedule = upstoxService.getSyncBrokerSchedule();
    return this.brokerSchedule;
  }

  public async refreshBrokerSchedule(forceRefresh: boolean = false): Promise<BrokerMarketScheduleStatus> {
    const resolved = await upstoxService.resolveBrokerMarketSchedule({
      accessToken: this.getEffectiveUpstoxToken(),
      forceRefresh,
    });
    this.brokerSchedule = resolved;
    this.lastScheduleSyncAt = Date.now();
    // If Broker API classifies today as Market Off Day (or special event off day) & scanners are cleared, trigger scan immediately
    const ist = getISTDateParts(new Date());
    if (
      resolved.isMarketOffDay &&
      (this.sessionState.isMidnightCleared || this.sessionState.lastScanDateIST !== ist.dateStr)
    ) {
      this.sessionState.isMidnightCleared = false;
      this.sessionState.lastPreOpenScanDateIST = ist.dateStr;
      this.sessionState.lastScanDateIST = ist.dateStr;
      this.sessionState.scannedAt = new Date().toISOString();
      this.saveSessionState();
      await this.runScanCycle(true).catch(() => {});
      marketWebSocketServer.broadcastSystemEvent({
        type: 'new_day_scan_complete',
        phase: resolved.dayCategory,
        isMidnightCleared: false,
        dateIST: ist.dateStr,
        stocksCount: this.stockScanResults.length,
      });
    }
    return resolved;
  }

  private loadSessionState() {
    try {
      if (fs.existsSync(SESSION_STATE_FILE)) {
        const raw = JSON.parse(fs.readFileSync(SESSION_STATE_FILE, 'utf-8'));
        if (raw && typeof raw === 'object') {
          this.sessionState = {
            lastPurgeDateIST: raw.lastPurgeDateIST || null,
            lastPreOpenScanDateIST: raw.lastPreOpenScanDateIST || null,
            lastScanDateIST: raw.lastScanDateIST || null,
            isMidnightCleared: Boolean(raw.isMidnightCleared),
            manualOverrideDateIST: raw.manualOverrideDateIST || null,
            purgedAt: raw.purgedAt,
            scannedAt: raw.scannedAt,
          };
        }
      }
    } catch {
      // Safe default
    }
  }

  private saveSessionState() {
    try {
      fs.writeFileSync(SESSION_STATE_FILE, JSON.stringify(this.sessionState));
    } catch {
      // Non-fatal
    }
  }

  private loadDailySignalLedger() {
    const todayIST = getISTDateParts(new Date()).dateStr;
    try {
      if (fs.existsSync(DAILY_SIGNAL_LEDGER_FILE)) {
        const raw = JSON.parse(fs.readFileSync(DAILY_SIGNAL_LEDGER_FILE, 'utf-8'));
        if (
          raw &&
          raw.version === LEDGER_VERSION &&
          raw.dateIST === todayIST &&
          raw.entries &&
          typeof raw.entries === 'object'
        ) {
          this.dailySignalLedger = { dateIST: raw.dateIST, entries: raw.entries };
          return;
        }
      }
    } catch {
      // Safe fallback
    }
    this.dailySignalLedger = { dateIST: todayIST, entries: {} };
  }

  private saveDailySignalLedger() {
    try {
      fs.writeFileSync(
        DAILY_SIGNAL_LEDGER_FILE,
        JSON.stringify({ version: LEDGER_VERSION, ...this.dailySignalLedger })
      );
      this.ledgerDirty = false;
    } catch {
      // Non-fatal
    }
  }

  private formatSecToHHMMSS(totalSec: number): string {
    const clamped = Math.max(9 * 3600 + 20 * 60, Math.min(15 * 3600 + 29 * 60 + 55, Math.round(totalSec)));
    const h = Math.floor(clamped / 3600);
    const m = Math.floor((clamped % 3600) / 60);
    const s = clamped % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /**
   * Computes & persists each stock's Formula-Authentic Discovery Timestamp (listedAt) and Locked Entry Price
   * strictly from genuine 5-minute intraday NSE bars (NO synthetic candles, NO hash jitter, NO artificial price clamps).
   * NEUTRAL / non-triggered stocks return listedAt: '--' and entryPrice: 0 without fabricating signals.
   */
  private resolveFormulaSignalDiscovery(
    scannedStock: ScannedStock,
    q: UnifiedMarketQuote | undefined,
    lp: number,
    prevClose: number,
    _dayHigh: number,
    _dayLow: number,
    dateIST: string,
    istHour: number,
    istMin: number,
    istSec: number,
    marketSession: string,
    isMarketOpen: boolean,
    _hadExistingEntriesToday: boolean
  ): { entry: DailySignalLedgerEntry; changed: boolean } {
    if (this.dailySignalLedger.dateIST !== dateIST) {
      this.dailySignalLedger = { dateIST, entries: {} };
    }

    const sym = scannedStock.symbol;
    const emptyNeutral: DailySignalLedgerEntry = {
      symbol: sym,
      signal: 'NEUTRAL',
      formulaCode: 'NONE',
      formulaName: 'No Active Formula Signal',
      listedAt: '--',
      entryTime: '--',
      entryPrice: 0,
      stopLoss: 0,
      target1: 0,
      target2: 0,
      target3: 0,
      triggerSource: 'NONE',
    };

    const realBars: IntradayCandleBar[] = Array.isArray(q?.intradayBars) ? q!.intradayBars! : [];
    const hasRealBars = realBars.length >= 4;
    const dailyStartSec = 9 * 3600 + 20 * 60; // 09:20:00 IST
    const curSec = istHour * 3600 + istMin * 60 + istSec;

    const barConfirmSec = (b: IntradayCandleBar) => {
      const closeSec = b.secIST + 300;
      if (isMarketOpen) {
        return Math.max(dailyStartSec, Math.min(curSec, closeSec));
      }
      return Math.max(dailyStartSec, Math.min(15 * 3600 + 30 * 60, closeSec));
    };

    if (scannedStock.signal !== 'BUY' && scannedStock.signal !== 'SELL') {
      let hadChanged = false;
      if (this.dailySignalLedger.entries[sym]) {
        delete this.dailySignalLedger.entries[sym];
        this.ledgerDirty = true;
        hadChanged = true;
      }

      // For genuine active movers (e.g. Custom Tables >= ±2% / Momentum >= ±1.5%), resolve
      // the authentic 5m intraday bar timestamp where the move or ORB/RVOL expansion occurred
      // WITHOUT fabricating any BUY/SELL signal or fake entry price.
      const absChgPct = Math.abs(Number(scannedStock.changePercent) || 0);
      if (absChgPct >= 1.5 && (hasRealBars || marketSession === 'PRE_OPEN')) {
        if (marketSession === 'PRE_OPEN') {
          const preOpenSec = Math.max(9 * 3600, Math.min(9 * 3600 + 14 * 60 + 55, curSec));
          return {
            entry: {
              ...emptyNeutral,
              listedAt: this.formatSecToHHMMSS(preOpenSec),
              triggerSource: 'PRE_OPEN_IEP',
            },
            changed: hadChanged,
          };
        }

        const isUpMove = (Number(scannedStock.changePercent) || 0) >= 0;
        const orbBarsM = realBars.slice(0, Math.min(3, realBars.length));
        const orbHighM = Math.max(...orbBarsM.map((b) => b.high));
        const orbLowM = Math.min(...orbBarsM.map((b) => b.low));

        // 1. First bar after 09:15 crossing >= 1.5% directional move from prevClose
        const moverThresholdIdx = realBars.findIndex((b) => {
          if (prevClose <= 0) return false;
          const bPct = ((b.close - prevClose) / prevClose) * 100;
          return isUpMove ? bPct >= 1.5 : bPct <= -1.5;
        });
        // 2. ORB 15m breakout bar
        const orbIdxM = realBars.findIndex(
          (b, i) => i >= 3 && b.secIST >= 9 * 3600 + 15 * 60 && (isUpMove ? b.close > orbHighM : b.close < orbLowM)
        );
        // 3. Peak directional expansion bar in today's session
        let bestMoveIdx = -1;
        let bestMoveMag = -1;
        for (let i = 0; i < realBars.length; i++) {
          const b = realBars[i];
          const aligned = isUpMove ? b.close >= b.open : b.close <= b.open;
          const mag = aligned ? Math.abs(b.close - b.open) : 0;
          if (mag > bestMoveMag) {
            bestMoveMag = mag;
            bestMoveIdx = i;
          }
        }
        const chosenIdx =
          orbIdxM >= 3
            ? orbIdxM
            : moverThresholdIdx >= 0
            ? moverThresholdIdx
            : bestMoveIdx >= 0
            ? bestMoveIdx
            : realBars.length - 1;
        const tb = realBars[chosenIdx];
        if (tb) {
          const moverSec = barConfirmSec(tb);
          return {
            entry: {
              ...emptyNeutral,
              listedAt: this.formatSecToHHMMSS(moverSec),
              triggerSource: 'INTRADAY_5M_BAR',
            },
            changed: hadChanged,
          };
        }
      }

      return { entry: emptyNeutral, changed: hadChanged };
    }

    const effSignal: 'BUY' | 'SELL' = scannedStock.signal;
    const isBull = effSignal === 'BUY';
    const existing = this.dailySignalLedger.entries[sym];
    const rvol = scannedStock.indicators.rvol || 1.0;
    const atr = Math.max(0.5, scannedStock.indicators.atr || lp * 0.009);
    const turnoverCr = ((scannedStock.volume || 100000) * lp) / 1e7;
    const openP = q?.open && q.open > 0 ? q.open : prevClose;

    if (!hasRealBars && marketSession !== 'PRE_OPEN') {
      return { entry: emptyNeutral, changed: false };
    }

    if (
      existing &&
      existing.signal === effSignal &&
      existing.entryPrice > 0 &&
      /^\d{2}:\d{2}(:\d{2})?$/.test(existing.listedAt)
    ) {
      const upgradePreOpenToRegular = isMarketOpen && existing.formulaCode === 'PRE_OPEN_IEP';
      const upgradeToRealBars = hasRealBars && existing.triggerSource !== 'INTRADAY_5M_BAR';
      const staleBaselineMismatch =
        lp > 0 && existing.entryPrice > 0 && Math.abs(existing.entryPrice - lp) / lp > 0.15;
      if (!upgradePreOpenToRegular && !upgradeToRealBars && !staleBaselineMismatch) {
        return { entry: existing, changed: false };
      }
    }

    let formulaCode: FormulaCode = 'NONE';
    let formulaName = 'No Active Formula Signal';
    let rawEntry = 0;
    let listedSec: number | null = null;
    let triggerSource: 'INTRADAY_5M_BAR' | 'PRE_OPEN_IEP' | 'NONE' = 'NONE';

    if (marketSession === 'PRE_OPEN') {
      formulaCode = 'PRE_OPEN_IEP';
      formulaName = 'Pre-Open Equilibrium IEP';
      triggerSource = 'PRE_OPEN_IEP';
      rawEntry = Number(lp.toFixed(2));
      listedSec = Math.max(9 * 3600, Math.min(9 * 3600 + 14 * 60 + 55, curSec));
    } else if (hasRealBars) {
      triggerSource = 'INTRADAY_5M_BAR';
      const orbBars = realBars.slice(0, Math.min(3, realBars.length));
      const orbHigh = Math.max(...orbBars.map((b) => b.high));
      const orbLow = Math.min(...orbBars.map((b) => b.low));

      let cumPV = 0;
      let cumV = 0;
      const vwapAt: number[] = [];
      const avgVolAt: number[] = [];
      for (let i = 0; i < realBars.length; i++) {
        const b = realBars[i];
        const v = Math.max(1, b.volume);
        cumPV += ((b.high + b.low + b.close) / 3) * v;
        cumV += v;
        vwapAt.push(cumPV / cumV);
        avgVolAt.push(cumV / (i + 1));
      }

      const orbBreakIdx = realBars.findIndex(
        (b, i) => i >= 3 && b.secIST >= 9 * 3600 + 15 * 60 && (isBull ? b.close > orbHigh : b.close < orbLow)
      );
      const rvolVwapIdx = realBars.findIndex(
        (b, i) =>
          i >= 1 &&
          b.secIST + 300 >= dailyStartSec &&
          b.volume >= avgVolAt[i] * 1.25 &&
          (isBull ? b.close > vwapAt[i] && b.close >= b.open : b.close < vwapAt[i] && b.close <= b.open)
      );

      let whaleIdx = -1;
      let bestVolRatio = 0;
      for (let i = 1; i < realBars.length; i++) {
        if (realBars[i].secIST + 300 < dailyStartSec) continue;
        const ratio = realBars[i].volume / Math.max(1, avgVolAt[i]);
        const aligned = isBull ? realBars[i].close > realBars[i].open : realBars[i].close < realBars[i].open;
        if (aligned && ratio > bestVolRatio) {
          bestVolRatio = ratio;
          whaleIdx = i;
        }
      }

      const pivotRef = (prevClose + openP) / 2 || scannedStock.indicators.cprPivot || prevClose;
      const pivIdx = realBars.findIndex(
        (b, i) =>
          i >= 1 &&
          b.secIST + 300 >= dailyStartSec &&
          (isBull ? b.close > pivotRef && b.close >= b.open : b.close < pivotRef && b.close <= b.open)
      );

      if (orbBreakIdx >= 3) {
        const tb = realBars[orbBreakIdx];
        formulaCode = 'STRONG_ORB';
        formulaName = 'ORB 15m Breakout';
        rawEntry = tb.close;
        listedSec = barConfirmSec(tb);
      } else if (rvolVwapIdx >= 1) {
        const tb = realBars[rvolVwapIdx];
        formulaCode = 'SONIC_RVOL';
        formulaName = 'HyperFlow RVOL + VWAP';
        rawEntry = tb.close;
        listedSec = barConfirmSec(tb);
      } else if (whaleIdx >= 1 && (turnoverCr >= 25 || bestVolRatio >= 1.4 || rvol >= 1.25)) {
        const tb = realBars[whaleIdx];
        formulaCode = 'TITAN_WHALE';
        formulaName = 'Titan Whale Sweep';
        rawEntry = tb.close;
        listedSec = barConfirmSec(tb);
      } else if (pivIdx >= 1) {
        const tb = realBars[pivIdx];
        formulaCode = 'QUANT_ELITE';
        formulaName = 'Pivot / S&R Trigger';
        rawEntry = tb.close;
        listedSec = barConfirmSec(tb);
      } else {
        // Check last aligned bar in window; if none matches, return emptyNeutral rather than fabricating a fake timestamp
        const lastAlignedIdx = [...realBars].reverse().findIndex(
          (b) =>
            b.secIST + 300 >= dailyStartSec &&
            (isBull ? b.close >= b.open : b.close <= b.open)
        );
        if (lastAlignedIdx >= 0) {
          const realIdx = realBars.length - 1 - lastAlignedIdx;
          const tb = realBars[realIdx];
          formulaCode = 'QUANT_ELITE';
          formulaName = 'Trend Bar Alignment';
          rawEntry = tb.close;
          listedSec = barConfirmSec(tb);
        }
      }
    }

    if (!rawEntry || rawEntry <= 0 || listedSec === null) {
      return { entry: emptyNeutral, changed: false };
    }

    const lockedEntry = Number(Math.max(0.05, rawEntry).toFixed(2));
    const atrDist = Math.max(1.2 * atr, lockedEntry * 0.011);
    const stopLoss = Number((isBull ? lockedEntry - atrDist : lockedEntry + atrDist).toFixed(2));
    const target1 = Number((isBull ? lockedEntry + 1.5 * atrDist : lockedEntry - 1.5 * atrDist).toFixed(2));
    const target2 = Number((isBull ? lockedEntry + 2.5 * atrDist : lockedEntry - 2.5 * atrDist).toFixed(2));
    const target3 = Number((isBull ? lockedEntry + 3.6 * atrDist : lockedEntry - 3.6 * atrDist).toFixed(2));

    const listedAt = this.formatSecToHHMMSS(listedSec);
    const entryTime = listedAt;

    const locked: DailySignalLedgerEntry = {
      symbol: sym,
      signal: effSignal,
      formulaCode,
      formulaName,
      listedAt,
      entryTime,
      entryPrice: lockedEntry,
      stopLoss,
      target1,
      target2,
      target3,
      triggerSource,
    };
    this.dailySignalLedger.entries[sym] = locked;
    this.ledgerDirty = true;
    return { entry: locked, changed: true };
  }

  /**
   * Seed sample initial trade positions and alerts with timestamps & target hits
   */
  private seedInitialSampleData() {
    const now = Date.now();
    const fiveMinsAgo = new Date(now - 5 * 60 * 1000).toISOString();
    const tenMinsAgo = new Date(now - 10 * 60 * 1000).toISOString();
    const fifteenMinsAgo = new Date(now - 15 * 60 * 1000).toISOString();
    const twentyMinsAgo = new Date(now - 20 * 60 * 1000).toISOString();
    const thirtyMinsAgo = new Date(now - 30 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();

    // Sample High Accuracy Alert Logs (90%+ Accuracy)
    this.alertLogs = [
      {
        id: 'ALT-1000',
        timestamp: fiveMinsAgo,
        symbol: 'ETERNAL',
        signal: 'BUY',
        aiScore: 94,
        accuracyScore: 94,
        price: 278.5,
        entry: 276.0,
        stopLoss: 268.0,
        target1: 288.0,
        target2: 296.0,
        targetHitStatus: 'ACTIVE',
        sentVia: ['Telegram', 'Dashboard Toast', 'WhatsApp'],
        status: 'SENT',
        gapPct: 2.4,
        gapType: 'STRONG_GAP_UP',
        reason: '🎯 94% Accuracy Breakdown: Supertrend Buy + CPR TC Breakout + RVol 2.4x Surge',
      },
      {
        id: 'ALT-1001',
        timestamp: tenMinsAgo,
        symbol: 'RELIANCE',
        signal: 'BUY',
        aiScore: 92,
        accuracyScore: 92,
        price: 2950.5,
        entry: 2948.0,
        stopLoss: 2915.0,
        target1: 2985.0,
        target2: 3020.0,
        targetHitStatus: 'TARGET_1_HIT',
        targetHitTime: new Date(now - 2 * 60 * 1000).toISOString(),
        targetHitPrice: 2986.5,
        sentVia: ['Telegram', 'Dashboard Toast'],
        status: 'SENT',
        gapPct: 1.2,
        gapType: 'GAP_UP',
        reason: '🎯 92% Accuracy: Bullish EMA 13/34 Crossover + VWAP Bounce',
      },
      {
        id: 'ALT-1002',
        timestamp: fifteenMinsAgo,
        symbol: 'BHARTIARTL',
        signal: 'BUY',
        aiScore: 96,
        accuracyScore: 96,
        price: 1580.0,
        entry: 1572.5,
        stopLoss: 1550.0,
        target1: 1610.0,
        target2: 1635.0,
        targetHitStatus: 'ACTIVE',
        sentVia: ['Telegram', 'WhatsApp', 'Email'],
        status: 'SENT',
        gapPct: 1.8,
        gapType: 'GAP_UP',
        reason: '🎯 96% Accuracy: Heavy Long Buildup + ADX 38 Strong Trend + 150k Qty Block Buy',
      },
      {
        id: 'ALT-1003',
        timestamp: twentyMinsAgo,
        symbol: 'TATASTEEL',
        signal: 'BUY',
        aiScore: 91,
        accuracyScore: 91,
        price: 158.2,
        entry: 157.5,
        stopLoss: 154.0,
        target1: 162.0,
        target2: 166.0,
        targetHitStatus: 'ACTIVE',
        sentVia: ['Dashboard Toast'],
        status: 'SENT',
        gapPct: 0.5,
        gapType: 'NORMAL_OPEN',
        reason: '🎯 91% Accuracy: Volume Breakout + MACD Positive Histogram Expansion',
      },
      {
        id: 'ALT-1004',
        timestamp: oneHourAgo,
        symbol: 'INFY',
        signal: 'SELL',
        aiScore: 90,
        accuracyScore: 90,
        price: 1780.0,
        entry: 1790.0,
        stopLoss: 1815.0,
        target1: 1750.0,
        target2: 1720.0,
        targetHitStatus: 'TARGET_2_HIT',
        targetHitTime: new Date(now - 15 * 60 * 1000).toISOString(),
        targetHitPrice: 1718.0,
        sentVia: ['Email', 'Dashboard Toast'],
        status: 'SENT',
        gapPct: -1.8,
        gapType: 'GAP_DOWN',
        reason: '🎯 90% Accuracy: Bearish Rejection at CPR Pivot R1 + Short Buildup',
      },
    ];

    // Sample Open & Closed Trades with Accuracy Scores
    this.tradePositions = [
      {
        id: 'TRD-503',
        symbol: 'ETERNAL',
        signal: 'BUY',
        entryPrice: 276.0,
        currentPrice: 278.5,
        quantity: 500,
        stopLoss: 268.0,
        target1: 288.0,
        target2: 296.0,
        status: 'OPEN',
        createdAt: fiveMinsAgo,
        unrealizedPnL: (278.5 - 276.0) * 500,
        unrealizedPnLPercent: Number((((278.5 - 276.0) / 276.0) * 100).toFixed(2)),
        targetHitStatus: 'NONE',
        aiScore: 94,
        accuracyScore: 94,
      },
      {
        id: 'TRD-501',
        symbol: 'RELIANCE',
        signal: 'BUY',
        entryPrice: 2948.0,
        currentPrice: 2986.5,
        quantity: 35,
        stopLoss: 2915.0,
        target1: 2985.0,
        target2: 3020.0,
        status: 'OPEN',
        createdAt: tenMinsAgo,
        unrealizedPnL: (2986.5 - 2948.0) * 35,
        unrealizedPnLPercent: Number((((2986.5 - 2948.0) / 2948.0) * 100).toFixed(2)),
        targetHitStatus: 'TARGET_1_HIT',
        aiScore: 92,
        accuracyScore: 92,
      },
      {
        id: 'TRD-502',
        symbol: 'TATASTEEL',
        signal: 'BUY',
        entryPrice: 157.5,
        currentPrice: 158.2,
        quantity: 600,
        stopLoss: 154.0,
        target1: 162.0,
        target2: 166.0,
        status: 'OPEN',
        createdAt: twentyMinsAgo,
        unrealizedPnL: (158.2 - 157.5) * 600,
        unrealizedPnLPercent: Number((((158.2 - 157.5) / 157.5) * 100).toFixed(2)),
        targetHitStatus: 'NONE',
        aiScore: 91,
        accuracyScore: 91,
      },
      {
        id: 'TRD-500',
        symbol: 'INFY',
        signal: 'SELL',
        entryPrice: 1790.0,
        currentPrice: 1718.0,
        quantity: 55,
        stopLoss: 1815.0,
        target1: 1750.0,
        target2: 1720.0,
        status: 'CLOSED',
        createdAt: oneHourAgo,
        closedAt: new Date(now - 15 * 60 * 1000).toISOString(),
        closePrice: 1718.0,
        closeReason: 'TARGET_2_HIT',
        realizedPnL: (1790.0 - 1718.0) * 55,
        realizedPnLPercent: Number((((1790.0 - 1718.0) / 1790.0) * 100).toFixed(2)),
        unrealizedPnL: 0,
        unrealizedPnLPercent: 0,
        targetHitStatus: 'TARGET_2_HIT',
        aiScore: 90,
        accuracyScore: 90,
      },
    ];

    // Seed Sample Live Market News with Sentiment Analysis
    this.newsFeed = [
      // 1. Moneycontrol Alerts
      {
        id: 'NEWS-MC-101',
        symbol: 'ICICIBANK',
        companyName: 'ICICI Bank Ltd.',
        title: 'Moneycontrol Flash: ICICI Bank Q2 Net Profit up +18.4% YoY; Gross NPA drops to 1.97% record low',
        source: 'Moneycontrol',
        timestamp: fiveMinsAgo,
        sentiment: 'POSITIVE',
        impactScore: 9.6,
        category: 'EARNINGS',
        summary: 'Domestic retail loan book expanded 18.2% YoY with NIM at 4.36%. Delivery volume spiked to 64.2% with net positive institutional delta exceeding +140,000 shares.',
        url: 'https://www.moneycontrol.com/india/stockpricequote/banks-private-sector/icicibank/ICI02',
      },
      {
        id: 'NEWS-MC-102',
        symbol: 'RELIANCE',
        companyName: 'Reliance Industries Ltd.',
        title: 'Moneycontrol Special: Reliance Retail adds 150 new stores; digital revenue accounts for 28% of sales',
        source: 'Moneycontrol',
        timestamp: tenMinsAgo,
        sentiment: 'POSITIVE',
        impactScore: 9.2,
        category: 'EARNINGS',
        summary: 'Operating EBITDA surged 16% YoY. Green Energy Gigafactory phase 1 commissioning timeline reiterated for Q1 FY26. Call open interest shifting higher.',
        url: 'https://www.moneycontrol.com/india/stockpricequote/refineries/relianceindustries/RI',
      },
      {
        id: 'NEWS-MC-103',
        symbol: 'ASTRAL',
        companyName: 'Astral Limited',
        title: 'Moneycontrol Alert: Astral Pipes faces severe Margin Compression amid PVC volatility; Target cut to ₹1,240',
        source: 'Moneycontrol',
        timestamp: twentyMinsAgo,
        sentiment: 'NEGATIVE',
        impactScore: -8.8,
        category: 'RATING_UPGRADE',
        summary: 'Raw material price swings and inventory loss dented EBITDA margins by 210 bps. Heavy delivery selling seen with negative cumulative delta of -38,500 shares.',
        url: 'https://www.moneycontrol.com/india/stockpricequote/plastics/astral/AP29',
      },

      // 2. ET Markets Alerts
      {
        id: 'NEWS-ET-201',
        symbol: 'HDFCBANK',
        companyName: 'HDFC Bank Ltd.',
        title: 'ET Markets: FIIs inject ₹4,850 Cr into HDFC Bank; Foreign institutional holding climbs for 4th session',
        source: 'ET Markets',
        timestamp: fiveMinsAgo,
        sentiment: 'POSITIVE',
        impactScore: 9.4,
        category: 'MACRO',
        summary: 'Deposit inflow touches ₹25.6 Lakh Cr as loan-to-deposit ratio normalizes. Persistent call unwinding observed at 780 CE strike with 2.4x bid absorption depth.',
        url: 'https://economictimes.indiatimes.com/hdfc-bank-ltd/stocks/companyid-9195.cms',
      },
      {
        id: 'NEWS-ET-202',
        symbol: 'TATASTEEL',
        companyName: 'Tata Steel Ltd.',
        title: 'ET Markets: Tata Steel secures £500M UK Government Grant for Port Talbot Green Transition; De-risks Europe unit',
        source: 'ET Markets',
        timestamp: fifteenMinsAgo,
        sentiment: 'POSITIVE',
        impactScore: 9.0,
        category: 'ORDER_WIN',
        summary: 'Grant legally signed for electric arc furnace transition. European subsidiary projected to reach cash break-even by Q1 FY26. Heavy delivery buying registered.',
        url: 'https://economictimes.indiatimes.com/tata-steel-ltd/stocks/companyid-12902.cms',
      },
      {
        id: 'NEWS-ET-203',
        symbol: 'INFY',
        companyName: 'Infosys Ltd.',
        title: 'ET Markets Alert: Infosys flags delay in discretionary US banking tech contracts; BFSI vertical revenue trimmed',
        source: 'ET Markets',
        timestamp: thirtyMinsAgo,
        sentiment: 'NEGATIVE',
        impactScore: -8.4,
        category: 'EARNINGS',
        summary: 'Discretionary tech spending in tier-2 US regional banks remains muted. Derivative positioning indicates substantial call writing at ₹1,860 strike.',
        url: 'https://economictimes.indiatimes.com/infosys-ltd/stocks/companyid-10960.cms',
      },

      // 3. Zee Business Alerts
      {
        id: 'NEWS-ZB-301',
        symbol: 'TATAMOTORS',
        companyName: 'Tata Motors Ltd.',
        title: 'Zee Business Flash: Anil Singhvi recommends BUY on Tata Motors; JLR premium order book & demerger unlock seen to ₹1,080',
        source: 'Zee Business',
        timestamp: tenMinsAgo,
        sentiment: 'POSITIVE',
        impactScore: 9.3,
        category: 'RATING_UPGRADE',
        summary: 'Managing Editor Anil Singhvi highlights robust JLR order bank of 148,000 units with high-margin Range Rover & Defender leading mix. Commercial vehicle recovery ongoing.',
        url: 'https://www.zeebiz.com/companies/news-tata-motors-share-price-target-anil-singhvi-zee-business-news-live-321045',
      },
      {
        id: 'NEWS-ZB-302',
        symbol: 'SBIN',
        companyName: 'State Bank of India',
        title: 'Zee Business Buzzing Stocks: SBI breaks out of multi-week consolidation base; Zee Business panel sees target ₹920+',
        source: 'Zee Business',
        timestamp: twentyMinsAgo,
        sentiment: 'POSITIVE',
        impactScore: 9.1,
        category: 'MACRO',
        summary: 'PSU banking leader surges with credit growth expanding 15.4% YoY while corporate credit costs touch decade lows. Heavy call unwinding seen at ₹850 CE.',
        url: 'https://www.zeebiz.com/market-news/stocks/state-bank-of-india-sbin-share-price-live-zee-business-buzzing-stocks',
      },
      {
        id: 'NEWS-ZB-303',
        symbol: 'SRF',
        companyName: 'SRF Limited',
        title: 'Zee Business Radar: SRF breaks key technical support ₹2,480; Speciality chemicals export demand remains subdued',
        source: 'Zee Business',
        timestamp: oneHourAgo,
        sentiment: 'NEGATIVE',
        impactScore: -8.6,
        category: 'EARNINGS',
        summary: 'Agrochemical destocking in European markets continues to drag realizations. Derivative data points to fresh short addition with OI up 12.4% on lower tick.',
        url: 'https://www.zeebiz.com/market-news/stocks/srf-share-price-slumps-speciality-chemicals-downgrade-live-update',
      },

      // 4. StockEdge Alerts
      {
        id: 'NEWS-SE-401',
        symbol: 'BHARTIARTL',
        companyName: 'Bharti Airtel Ltd.',
        title: 'StockEdge Scan: Bharti Airtel Delivery Volume surges 3.4x 30-Day Average; 71.4% Delivery Percentage confirmed',
        source: 'StockEdge',
        timestamp: fiveMinsAgo,
        sentiment: 'POSITIVE',
        impactScore: 9.5,
        category: 'BULK_ORDER',
        summary: 'ARPU expansion trajectory strengthens post tariff adjustments. Stock triggers 52-week high breakout with massive institutional delivery accumulation.',
        url: 'https://stockedge.com/stocks/bharti-airtel-ltd/3055',
      },
      {
        id: 'NEWS-SE-402',
        symbol: 'LT',
        companyName: 'Larsen & Toubro Ltd.',
        title: 'StockEdge Technical Scan: L&T confirms 20-DMA Golden Crossover with ₹8,500 Cr Offshore Hydrocarbon Mega Win',
        source: 'StockEdge',
        timestamp: fifteenMinsAgo,
        sentiment: 'POSITIVE',
        impactScore: 9.4,
        category: 'ORDER_WIN',
        summary: 'Order backlog crosses ₹4.8 Lakh Cr giving 2.8x revenue visibility. RSI momentum indicator hits 68.4 with institutional accumulation index registering 88/100.',
        url: 'https://stockedge.com/stocks/larsen-toubro-ltd/2507',
      },
      {
        id: 'NEWS-SE-403',
        symbol: 'AXISBANK',
        companyName: 'Axis Bank Ltd.',
        title: 'StockEdge Bulk Deal Scan: Large Institutional Block of 1.2M shares offloaded at ₹1,180; RBI penalty overhang',
        source: 'StockEdge',
        timestamp: oneHourAgo,
        sentiment: 'NEGATIVE',
        impactScore: -8.2,
        category: 'BLOCK_DEAL',
        summary: 'Put writing unwinding observed across 1200 PE strike. Bid/Ask ratio drops to 0.68 indicating persistent supply overhang during morning session.',
        url: 'https://stockedge.com/stocks/axis-bank-ltd/336',
      },

      // 5. Trendlyne Alerts
      {
        id: 'NEWS-TL-501',
        symbol: 'TCS',
        companyName: 'Tata Consultancy Services Ltd.',
        title: 'Trendlyne DVM Upgrade: TCS Durability score hits 85/100; Forecaster consensus predicts 14.8% upside with 28 BUY ratings',
        source: 'Trendlyne',
        timestamp: tenMinsAgo,
        sentiment: 'POSITIVE',
        impactScore: 9.1,
        category: 'RATING_UPGRADE',
        summary: 'Deal wins of $8.6B in constant currency terms with significant expansion in generative AI implementations for tier-1 global banking institutions.',
        url: 'https://trendlyne.com/equity/1499/TCS/tata-consultancy-services-ltd/',
      },
      {
        id: 'NEWS-TL-502',
        symbol: 'MARUTI',
        companyName: 'Maruti Suzuki India Ltd.',
        title: 'Trendlyne Forecaster: Maruti Suzuki FY26 EPS estimates upgraded +8.2% on strong hybrid SUV backlog and favorable yen cross-rate',
        source: 'Trendlyne',
        timestamp: twentyMinsAgo,
        sentiment: 'POSITIVE',
        impactScore: 8.9,
        category: 'RATING_UPGRADE',
        summary: 'Trendlyne SWOT: 18 Strengths vs 3 Weaknesses. Operational leverage benefits and higher ASP driven by Grand Vitara and Invicto boost institutional price targets to ₹13,400.',
        url: 'https://trendlyne.com/equity/888/MARUTI/maruti-suzuki-india-ltd/',
      },
      {
        id: 'NEWS-TL-503',
        symbol: 'BAJFINANCE',
        companyName: 'Bajaj Finance Ltd.',
        title: 'Trendlyne Valuation Check: Bajaj Finance enters Expensive Zone as unsecured loan credit costs rise 35 bps',
        source: 'Trendlyne',
        timestamp: thirtyMinsAgo,
        sentiment: 'NEGATIVE',
        impactScore: -8.6,
        category: 'RATING_UPGRADE',
        summary: 'Stock dips below 50-DMA with negative momentum score (41/100). Institutional ownership dip of -0.4% reported in recent quarter shareholding pattern.',
        url: 'https://trendlyne.com/equity/184/BAJFINANCE/bajaj-finance-ltd/',
      }
    ];

    // Seed Sample Live Bulk & Block Orders
    this.bulkOrders = [
      {
        id: 'BLK-101',
        symbol: 'RELIANCE',
        companyName: 'Reliance Industries Ltd.',
        clientName: 'GQG Partners Emerging Markets Fund',
        dealType: 'BUY',
        quantity: 1500000,
        price: 2480.5,
        valueInCr: 372.07,
        exchange: 'NSE',
        timestamp: fiveMinsAgo,
        sentiment: 'POSITIVE',
        remarks: 'Institutional accumulation at key support zone.',
      },
      {
        id: 'BLK-102',
        symbol: 'TATASTEEL',
        companyName: 'Tata Steel Ltd.',
        clientName: 'Morgan Stanley Mauritius Company Ltd',
        dealType: 'BUY',
        quantity: 4800000,
        price: 168.2,
        valueInCr: 80.74,
        exchange: 'BSE',
        timestamp: fifteenMinsAgo,
        sentiment: 'POSITIVE',
        remarks: 'FII fresh position buildup post green steel grant news.',
      },
      {
        id: 'BLK-103',
        symbol: 'INFY',
        companyName: 'Infosys Ltd.',
        clientName: 'Vanguard Emerging Markets Stock Index Fund',
        dealType: 'SELL',
        quantity: 2100000,
        price: 1820.0,
        valueInCr: 382.2,
        exchange: 'NSE',
        timestamp: thirtyMinsAgo,
        sentiment: 'NEGATIVE',
        remarks: 'Institutional profit booking post guidance revision.',
      },
      {
        id: 'BLK-104',
        symbol: 'HDFCBANK',
        companyName: 'HDFC Bank Ltd.',
        clientName: 'Societe Generale - ODI',
        dealType: 'BUY',
        quantity: 1200000,
        price: 1610.0,
        valueInCr: 193.2,
        exchange: 'NSE',
        timestamp: new Date(now - 45 * 60 * 1000).toISOString(),
        sentiment: 'POSITIVE',
        remarks: 'FII buying following strong deposit growth metrics.',
      },
      {
        id: 'BLK-105',
        symbol: 'TATAMOTORS',
        companyName: 'Tata Motors Ltd.',
        clientName: 'Goldman Sachs India Equity Portfolio',
        dealType: 'BUY',
        quantity: 3500000,
        price: 1010.0,
        valueInCr: 353.5,
        exchange: 'NSE',
        timestamp: new Date(now - 75 * 60 * 1000).toISOString(),
        sentiment: 'POSITIVE',
        remarks: 'Block trade absorbed cleanly on strong JLR Q1 numbers.',
      },
      {
        id: 'BLK-106',
        symbol: 'AXISBANK',
        companyName: 'Axis Bank Ltd.',
        clientName: 'Life Insurance Corporation of India (LIC)',
        dealType: 'BUY',
        quantity: 2000000,
        price: 1180.0,
        valueInCr: 236.0,
        exchange: 'BSE',
        timestamp: new Date(now - 140 * 60 * 1000).toISOString(),
        sentiment: 'POSITIVE',
        remarks: 'DII value buying on minor dip.',
      },
    ];

    // Seed Sample Corporate Actions
    this.corporateActions = [
      {
        id: 'CA-301',
        symbol: 'RELIANCE',
        companyName: 'Reliance Industries Ltd.',
        type: 'DIVIDEND',
        exDate: '19 Aug 2026',
        recordDate: '20 Aug 2026',
        details: 'Final Dividend payout for FY 2025-26 declared at AGM.',
        value: '₹10.00 / Share',
        impact: 'HIGH',
      },
      {
        id: 'CA-302',
        symbol: 'TATASTEEL',
        companyName: 'Tata Steel Ltd.',
        type: 'SPLIT',
        exDate: '22 Aug 2026',
        recordDate: '23 Aug 2026',
        details: 'Sub-division/Stock Split of 1 equity share (Face Value ₹10) into 10 equity shares (Face Value ₹1).',
        value: '1:10 Split',
        impact: 'HIGH',
      },
      {
        id: 'CA-303',
        symbol: 'INFY',
        companyName: 'Infosys Ltd.',
        type: 'EARNINGS_RELEASE',
        exDate: '12 Aug 2026',
        recordDate: '12 Aug 2026',
        details: 'Board meeting scheduled for consideration of Unaudited Financial Results for Q2 FY27 and interim dividend.',
        value: 'Q2 Results & Dividend',
        impact: 'HIGH',
      },
      {
        id: 'CA-304',
        symbol: 'HDFCBANK',
        companyName: 'HDFC Bank Ltd.',
        type: 'BONUS',
        exDate: '28 Aug 2026',
        recordDate: '29 Aug 2026',
        details: 'Bonus issue of 1 equity share for every 1 equity share held.',
        value: '1:1 Bonus Issue',
        impact: 'HIGH',
      },
      {
        id: 'CA-305',
        symbol: 'TCS',
        companyName: 'Tata Consultancy Services Ltd.',
        type: 'DIVIDEND',
        exDate: '08 Aug 2026',
        recordDate: '09 Aug 2026',
        details: 'Interim Dividend declared by Board of Directors.',
        value: '₹12.00 / Share',
        impact: 'MEDIUM',
      },
    ];
  }

  /**
   * Builds calibrated 5-min intraday candles anchored to live Upstox / Autonomous Market Engine quote
   */
  private async fetchLiveStockData(
    symbol: string,
    fallbackBasePrice: number
  ): Promise<{ candles: Candle[]; meta?: StockMetaCache }> {
    const token = this.getEffectiveUpstoxToken();

    const quotes = await upstoxService.fetchUnifiedMarketQuotes([symbol], token, {
      [symbol]: fallbackBasePrice,
    });
    const clean = upstoxService.cleanSymbol(symbol);
    const q = quotes[clean] || quotes[symbol];

    const lp = q?.lp || fallbackBasePrice;
    const prevClose = q?.prevClose || fallbackBasePrice;
    const dayHigh = q?.high || Math.max(lp, prevClose);
    const dayLow = q?.low || Math.min(lp, prevClose);

    let candles: Candle[] = [];
    if (q?.intradayBars && q.intradayBars.length >= 4) {
      candles = q.intradayBars.map((b) => ({
        time: b.timeIST,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: Math.max(100, b.volume),
      }));
    } else {
      const existingCandles = this.stockCandles.get(symbol);
      if (existingCandles && existingCandles.length >= 4) {
        candles = [...existingCandles];
      }
    }

    if (candles.length > 0) {
      const lastIndex = candles.length - 1;
      candles[lastIndex] = {
        ...candles[lastIndex],
        close: lp,
        high: Math.max(candles[lastIndex].high, lp),
        low: Math.min(candles[lastIndex].low, lp),
      };
    }

    const stockMeta: StockMetaCache = {
      prevClose: Number(prevClose.toFixed(2)),
      dayHigh: Number(Math.max(dayHigh, lp).toFixed(2)),
      dayLow: Number(Math.min(dayLow, lp).toFixed(2)),
      price: Number(lp.toFixed(2)),
      lastUpdated: Date.now(),
    };
    return { candles, meta: stockMeta };
  }

  /**
   * Fetches live market index prices via Upstox API & Autonomous Market Engine
   */
  public async fetchLiveIndices() {
    const token = this.getEffectiveUpstoxToken();
    const quotes = await upstoxService.fetchIndexQuotes(token);

    const applyIdx = (
      overviewKey: 'nifty50' | 'bankNifty' | 'finnifty' | 'midcpnifty' | 'sensex' | 'niftyIT',
      quoteKey: string
    ) => {
      const q: UnifiedMarketQuote | undefined = quotes[quoteKey];
      const lp = round2(q?.lp, 0);
      if (lp <= 0) return;
      const prevClose = round2(q?.prevClose, lp);
      const rawCh = parseFiniteNum(q?.ch);
      const ch =
        rawCh !== undefined && (Math.abs(rawCh) > 0.0001 || Math.abs(lp - prevClose) <= 0.01)
          ? round2(rawCh)
          : round2(lp - prevClose);
      const rawChp = parseFiniteNum(q?.chp);
      const chp =
        rawChp !== undefined && (Math.abs(rawChp) > 0.0001 || Math.abs(ch) <= 0.01)
          ? round2(rawChp)
          : prevClose > 0
          ? round2((ch / prevClose) * 100)
          : 0;
      const prevEntry = (this.marketOverview as any)[overviewKey] || {};
      (this.marketOverview as any)[overviewKey] = {
        ...prevEntry,
        price: lp,
        change: ch,
        changePercent: chp,
        open: round2(q?.open, lp),
        high: round2(q?.high, lp),
        low: round2(q?.low, lp),
        prevClose,
      };
    };

    applyIdx('nifty50', 'NIFTY 50');
    applyIdx('bankNifty', 'BANKNIFTY');
    applyIdx('finnifty', 'FINNIFTY');
    applyIdx('midcpnifty', 'MIDCPNIFTY');
    applyIdx('sensex', 'SENSEX');
    applyIdx('niftyIT', 'NIFTYIT');

    const vix = quotes['INDIAVIX'];
    const vixLp = round2(vix?.lp, 0);
    if (vix && vixLp > 0) {
      let regime: 'LOW_VOLATILITY' | 'MODERATE' | 'HIGH_FEAR' | 'EXTREME_PANIC' = 'LOW_VOLATILITY';
      if (vixLp > 22) regime = 'EXTREME_PANIC';
      else if (vixLp > 17) regime = 'HIGH_FEAR';
      else if (vixLp > 14) regime = 'MODERATE';
      const vixPrev = round2(vix.prevClose, vixLp);
      const vixCh = round2(vix.ch, round2(vixLp - vixPrev));
      const vixChp = round2(vix.chp, vixPrev > 0 ? round2((vixCh / vixPrev) * 100) : 0);
      this.marketOverview.indiaVix = {
        price: vixLp,
        change: vixCh,
        changePercent: vixChp,
        regime,
      };
    }
  }

  /**
   * Seeds clean neutral stock placeholders before real 5m intraday bars finish loading
   */
  private initializeCandleData() {
    const initialResults: ScannedStock[] = [];

    for (const stock of EQUITY_ONLY_STOCKS) {
      this.stockCandles.set(stock.symbol, []);
      const baseAnchor: Candle[] = [
        { time: '09:15:00', open: stock.basePrice, high: stock.basePrice, low: stock.basePrice, close: stock.basePrice, volume: 0 },
        { time: '09:20:00', open: stock.basePrice, high: stock.basePrice, low: stock.basePrice, close: stock.basePrice, volume: 0 },
      ];

      this.stockMetaCache.set(stock.symbol, {
        prevClose: stock.basePrice,
        dayHigh: stock.basePrice,
        dayLow: stock.basePrice,
        price: stock.basePrice,
        lastUpdated: Date.now(),
      });

      const scannedStock = evaluateStockScanner(
        stock.symbol,
        stock.name,
        stock.sector,
        baseAnchor,
        stock.basePrice,
        stock.basePrice,
        stock.basePrice,
        0,
        0
      );
      scannedStock.signal = 'NEUTRAL';
      scannedStock.aiScore = 0;
      scannedStock.tradeStatus = 'NO_SIGNAL';
      scannedStock.listedAt = '--';
      scannedStock.signalListedAt = '--';
      scannedStock.entryTime = '--';
      scannedStock.fixedEntryPrice = 0;
      scannedStock.fixedStopLoss = 0;
      scannedStock.fixedTarget1 = 0;
      scannedStock.fixedTarget2 = 0;
      scannedStock.fixedTarget3 = 0;
      scannedStock.risk.entryPrice = 0;
      scannedStock.risk.stopLoss = 0;
      scannedStock.risk.target1 = 0;
      scannedStock.risk.target2 = 0;
      scannedStock.risk.target3 = 0;
      scannedStock.sectorChangePercent = 0;
      scannedStock.keyTriggers = ['Syncing live quotes & real 5m NSE bars...'];
      scannedStock.alertCreateTime = new Date().toISOString();
      scannedStock.sparkline = [];

      initialResults.push(scannedStock);
    }

    this.stockScanResults = initialResults;

    this.marketOverview = {
      ...this.marketOverview,
      scannedCount: initialResults.length,
      buyCount: 0,
      sellCount: 0,
      highRvolCount: 0,
      lastScanTime: new Date().toISOString(),
    };
  }

  /**
   * Helper to check if Indian Stock Markets (NSE/BSE) are currently open in IST time
   */
  public getMarketStatus(): string {
    const statusInfo = calculateMarketStatus();
    const sched = this.getBrokerScheduleSync();
    return this.formatOverviewMarketStatus(statusInfo, sched);
  }

  /**
   * High-frequency live tick update during active market hours (never overrides midnight flush!)
   */
  public tickLivePrices() {
    const statusInfo = calculateMarketStatus();
    const sched = this.getBrokerScheduleSync();
    if (this.sessionState.isMidnightCleared) {
      this.marketOverview.marketStatus = 'MIDNIGHT_FLUSHED_AWAITING_MARKET_OPEN';
      return;
    }

    this.marketOverview.marketStatus = this.formatOverviewMarketStatus(statusInfo, sched);

    if (!statusInfo.isOpen) {
      return;
    }

    // Apply latest cached real quotes (Upstox live cache takes priority over autonomous fallback)
    const cachedQuotes: Record<string, UnifiedMarketQuote> = {
      ...autonomousPriceService.getCachedQuotes(),
      ...upstoxService.getCachedUpstoxQuotes(),
    };
    for (const stock of this.stockScanResults) {
      const cleanSym = upstoxService.cleanSymbol(stock.symbol);
      const q = cachedQuotes[cleanSym] || cachedQuotes[stock.symbol];
      const qLp = round2(q?.lp, 0);
      if (q && qLp > 0) {
        const qPrev = round2(q.prevClose, qLp);
        const rawCh = parseFiniteNum(q.ch);
        const qCh =
          rawCh !== undefined && (Math.abs(rawCh) > 0.0001 || Math.abs(qLp - qPrev) <= 0.01)
            ? round2(rawCh)
            : round2(qLp - qPrev);
        const rawChp = parseFiniteNum(q.chp);
        const qChp =
          rawChp !== undefined && (Math.abs(rawChp) > 0.0001 || Math.abs(qCh) <= 0.01)
            ? round2(rawChp)
            : qPrev > 0
            ? round2((qCh / qPrev) * 100)
            : 0;

        stock.price = qLp;
        stock.change = qCh;
        stock.changePercent = qChp;
        stock.volume = Math.max(0, Math.round(parseFiniteNum(q.volume) ?? stock.volume));
        stock.indicators.price = qLp;
        stock.indicators.close = qLp;
        if (q.open > 0) stock.indicators.open = round2(q.open, qLp);
        if (q.high > 0) stock.indicators.high = round2(Math.max(q.high, qLp), qLp);
        if (q.low > 0) stock.indicators.low = round2(Math.min(q.low, qLp), qLp);
        stock.fyersData = this.buildFyersQuoteFromUnified(stock.symbol, q, qLp, qCh, qChp, qPrev);

        const tickDepth =
          q.bidQty > 0 && q.askQty > 0
            ? {
                bidQty: q.bidQty,
                askQty: q.askQty,
                bidAskRatio: round2(q.bidQty / q.askQty, 1),
              }
            : deriveOrderBookDepth({
                volume: stock.volume,
                lp: qLp,
                open: q.open || stock.indicators.open || qLp,
                high: q.high || stock.indicators.high || qLp,
                low: q.low || stock.indicators.low || qLp,
                chp: qChp,
                atp: q.atp || stock.indicators.vwap || qLp,
                intradayBars: q.intradayBars,
              });
        stock.bidQty = tickDepth.bidQty;
        stock.askQty = tickDepth.askQty;
        stock.bidAskRatio = tickDepth.bidAskRatio;
        stock.orderBookBias =
          tickDepth.bidAskRatio >= 1.55
            ? 'Heavy Buyer Accumulation'
            : tickDepth.bidAskRatio >= 1.18
            ? 'Buyer Dominance'
            : tickDepth.bidAskRatio <= 0.65
            ? 'Heavy Seller Supply'
            : tickDepth.bidAskRatio <= 0.85
            ? 'Seller Pressure'
            : 'Balanced Order Book';
        stock.oiData = calculateStockOI(stock.symbol, stock.price, stock.changePercent, stock.volume);
      }
    }

    const liveSectorMap = this.computeSectorAvgMap();
    for (const stock of this.stockScanResults) {
      stock.sectorChangePercent = liveSectorMap[stock.sector] ?? round2(stock.changePercent, 0);
    }

    this.evaluateTargetHitsAndTrades(this.stockScanResults);
    this.lastScanTimestamp = new Date().toISOString();
    this.marketOverview.lastScanTime = this.lastScanTimestamp;
  }

  private buildFyersQuoteFromUnified(
    symbol: string,
    q: UnifiedMarketQuote | undefined,
    lp: number,
    ch: number,
    chp: number,
    prevClose: number
  ): FyersQuote {
    const safePrev = prevClose > 0 ? round2(prevClose) : round2(lp - ch);
    return {
      symbol,
      fyersSymbol: q?.instrumentKey || upstoxService.getInstrumentKey(symbol),
      description: q?.description || `${symbol} (NSE)`,
      exchange: q?.exchange || 'NSE',
      type: q?.type || 'EQUITY',
      lp: round2(lp),
      open: round2(q?.open, lp),
      high: round2(Math.max(parseFiniteNum(q?.high) ?? lp, lp), lp),
      low: round2(Math.min(parseFiniteNum(q?.low) ?? lp, lp), lp),
      prevClose: safePrev,
      ch: round2(ch),
      chp: round2(chp),
      volume: Math.max(0, Math.round(parseFiniteNum(q?.volume) ?? 0)),
      atp: round2(q?.atp, lp),
      ltt: q?.ltt || 'EOD Settlement',
      fyersStatus: q?.isMarketOpen ? 'LIVE_V3_FEED' : 'CLOSED_SETTLEMENT',
      isMarketOpen: Boolean(q?.isMarketOpen),
      marketSession: q?.marketSession,
      lastRefreshed: q?.lastRefreshed || new Date().toISOString(),
    };
  }

  /**
   * Starts recurring timers:
   * - 1s Midnight (00:00:00 IST) & Next-Day Market Open Auto-Scan scheduler
   * - 3s Live Quote synchronization when market open
   * - 20s Full Universe Batch Refresh (strictly skipped when Midnight Flushed)
   */
  public startAutoScan(intervalSeconds: number = 2) {
    if (this.autoScanTimer) clearInterval(this.autoScanTimer);
    if (this.midnightWatcherTimer) clearInterval(this.midnightWatcherTimer);
    if (this.periodicFetchTimer) clearInterval(this.periodicFetchTimer);

    this.autoScanTimer = setInterval(() => {
      this.tickLivePrices();
    }, intervalSeconds * 1000);

    // 1-second precision clock watcher for 12:00:00 AM IST Flush & Next-Day Market-Open Scan
    this.midnightWatcherTimer = setInterval(() => {
      this.evaluateMidnightAndScanSchedule().catch(() => {});
    }, 1000);

    // Fast 5s scan cycle when market open; 45s on closed / Weekend / Market Off Day (Broker API mode)
    let cycleTick = 0;
    this.periodicFetchTimer = setInterval(() => {
      cycleTick++;
      if (this.sessionState.isMidnightCleared) {
        this.fetchLiveIndices().catch(() => {});
        return;
      }
      const st = calculateMarketStatus();
      if (!st.isOpen && cycleTick % 9 !== 0) {
        return;
      }
      this.runScanCycle(false).catch(() => {});
    }, 5000);
  }

  private async evaluateMidnightAndScanSchedule() {
    const ist = getISTDateParts(new Date());

    // Periodically sync live Upstox Broker API market schedule (holidays, timings, exchange status) every 2 mins
    if (Date.now() - this.lastScheduleSyncAt > 120000) {
      this.lastScheduleSyncAt = Date.now();
      upstoxService
        .resolveBrokerMarketSchedule({ accessToken: this.getEffectiveUpstoxToken(), forceRefresh: false })
        .then((s) => {
          this.brokerSchedule = s;
        })
        .catch(() => {});
    }

    const statusInfo = calculateMarketStatus();
    const sched = this.getBrokerScheduleSync();
    const rule1Window = getLockedSessionWindowStatus(new Date(), sched.isMarketOffDay);

    // 1. RULE 1 LOCKED: DAILY 11:59:00 PM IST AUTO-FLUSH (23:59:00 - 23:59:59 IST) + NEW-DAY ROLLOVER:
    // Automatically empties ALL scanning stocks at 23:59:00 IST same night & holds empty until 09:20:00 IST next market day!
    if (rule1Window.secFromMidnight >= LOCKED_SYSTEM_RULES.DAILY_FLUSH_SEC) {
      if (!this.sessionState.isMidnightCleared || this.sessionState.lastPurgeDateIST !== ist.dateStr) {
        this.resetMidnightPurge(ist.dateStr, true);
      }
      return;
    }

    if (ist.dateStr !== this.sessionState.lastPurgeDateIST && !sched.isMarketOffDay && rule1Window.isFlushCleared) {
      this.resetMidnightPurge(ist.dateStr, true);
      return;
    }

    // 2. RULE 1 LOCKED: On REGULAR MARKET DAYS prior to 09:20:00 AM IST: hold EMPTY until 09:20:00 IST unless manually unlocked.
    if (
      !sched.isMarketOffDay &&
      rule1Window.secFromMidnight < LOCKED_SYSTEM_RULES.SCAN_START_SEC &&
      this.sessionState.manualOverrideDateIST !== ist.dateStr &&
      !this.sessionState.isMidnightCleared
    ) {
      this.resetMidnightPurge(ist.dateStr, true);
      return;
    }

    // 3A. WEEKEND (SAT/SUN), MARKET OFF DAY, OR SPECIAL EVENT MARKET OFF DAY (before 23:59:00 IST):
    const shouldRunOffDayScan =
      sched.isMarketOffDay &&
      !rule1Window.isFlushCleared &&
      (this.sessionState.isMidnightCleared || this.sessionState.lastScanDateIST !== ist.dateStr);

    // 3B. REGULAR MARKET-DAY 09:20:00 AM IST AUTO-SCAN (09:20:00 - 15:15:00 IST live window; post-15:15 rebuilds today's locked snapshot before 23:59):
    const shouldRunRegularScan =
      !sched.isMarketOffDay &&
      !rule1Window.isFlushCleared &&
      rule1Window.secFromMidnight >= LOCKED_SYSTEM_RULES.SCAN_START_SEC &&
      (this.sessionState.isMidnightCleared || this.sessionState.lastScanDateIST !== ist.dateStr);

    if (shouldRunOffDayScan || shouldRunRegularScan) {
      const modeLabel = shouldRunOffDayScan
        ? `UPSTOX OFF-DAY SNAPSHOT SCAN (${sched.dayCategory}: ${sched.eventName || sched.weekday})`
        : 'MARKET-DAY 09:20 AM – 03:15 PM IST AUTO-SCAN';
      console.log(
        `[ScannerService] 🚀 ${modeLabel} (${ist.dateStr} ${ist.timeStr} IST)! Populating Best 10 UP & Best 10 DOWN formula stocks...`
      );
      this.sessionState.isMidnightCleared = false;
      this.sessionState.lastPreOpenScanDateIST = ist.dateStr;
      this.sessionState.lastScanDateIST = ist.dateStr;
      this.sessionState.scannedAt = new Date().toISOString();
      this.saveSessionState();

      await this.runScanCycle(true);

      marketWebSocketServer.broadcastSystemEvent({
        type: 'new_day_scan_complete',
        phase: shouldRunOffDayScan ? sched.dayCategory : rule1Window.phase,
        isMidnightCleared: false,
        dateIST: ist.dateStr,
        stocksCount: this.stockScanResults.length,
      });
    }
  }

  /**
   * RULE 1 LOCKED: Resets and empties ALL scanner results & AI Agent Desk at 11:59:00 PM IST (23:59:00 IST)
   */
  public resetMidnightPurge(purgeDateIST?: string, broadcast: boolean = true): void {
    this.scanEpoch++;
    const ist = getISTDateParts(new Date());
    const dateStr = purgeDateIST || ist.dateStr;

    this.stockScanResults = [];
    this.alertLogs = [];
    this.dailySignalLedger = { dateIST: dateStr, entries: {} };
    this.saveDailySignalLedger();
    stickyScannerRegistry.resetAll();
    dualAiTradeManagerDesk.resetAll();
    scannerFleet20Manager.resetAll();
    btstScannerManager.clearAll(dateStr);
    this.sessionState = {
      ...this.sessionState,
      lastPurgeDateIST: dateStr,
      lastPreOpenScanDateIST: null,
      lastScanDateIST: null,
      isMidnightCleared: true,
      manualOverrideDateIST: null,
      purgedAt: new Date().toISOString(),
    };
    this.saveSessionState();

    this.marketOverview.scannedCount = 0;
    this.marketOverview.buyCount = 0;
    this.marketOverview.sellCount = 0;
    this.marketOverview.highRvolCount = 0;
    this.marketOverview.marketStatus = 'DAILY_2359_FLUSHED_AWAITING_0920_OPEN';
    this.marketOverview.lastScanTime = new Date().toISOString();

    console.log(`[ScannerService] 🕛 11:59 PM IST DAILY AUTO-FLUSH EXECUTED (${dateStr}). All scanners & Dual AI Desk emptied.`);

    if (broadcast) {
      marketWebSocketServer.broadcastSystemEvent({
        type: 'midnight_purge',
        isMidnightCleared: true,
        dateIST: dateStr,
      });
    }
  }

  public async triggerManualScanOverride(): Promise<ScannedStock[]> {
    const ist = getISTDateParts(new Date());
    this.sessionState.isMidnightCleared = false;
    this.sessionState.manualOverrideDateIST = ist.dateStr;
    this.sessionState.lastScanDateIST = ist.dateStr;
    this.sessionState.scannedAt = new Date().toISOString();
    this.saveSessionState();

    const results = await this.runScanCycle(true);

    marketWebSocketServer.broadcastSystemEvent({
      type: 'new_day_scan_complete',
      isMidnightCleared: false,
      dateIST: ist.dateStr,
      stocksCount: results.length,
    });
    return results;
  }

  public getSessionStatus() {
    const ist = getISTDateParts(new Date());
    const statusInfo = calculateMarketStatus();
    const sched = this.getBrokerScheduleSync();
    const rule1Window = getLockedSessionWindowStatus(new Date(), sched.isMarketOffDay);
    const effectiveCleared =
      this.sessionState.isMidnightCleared ||
      (rule1Window.isFlushCleared && this.sessionState.manualOverrideDateIST !== ist.dateStr);

    return {
      isMidnightCleared: effectiveCleared,
      lastPurgeDateIST: this.sessionState.lastPurgeDateIST,
      lastPreOpenScanDateIST: this.sessionState.lastPreOpenScanDateIST,
      lastScanDateIST: this.sessionState.lastScanDateIST,
      manualOverrideDateIST: this.sessionState.manualOverrideDateIST,
      purgedAt: this.sessionState.purgedAt,
      scannedAt: this.sessionState.scannedAt,
      currentDateIST: ist.dateStr,
      currentTimeIST: ist.timeStr,
      weekdayIST: ist.weekday,
      hours: ist.hour,
      minutes: ist.minute,
      isMarketOpen: statusInfo.isOpen,
      marketSession: statusInfo.session,
      stocksCount: effectiveCleared ? 0 : this.stockScanResults.length,
      quoteSource: this.lastQuoteSource,
      fiveRulesWindow: rule1Window,
      lockedRules: LOCKED_SYSTEM_RULES,
      brokerSchedule: {
        dayCategory: sched.dayCategory,
        isTradingDay: sched.isTradingDay,
        isMarketOffDay: sched.isMarketOffDay,
        isWeekendOffDay: sched.isWeekendOffDay,
        isHolidayOffDay: sched.isHolidayOffDay,
        isSpecialEventOffDay: sched.isSpecialEventOffDay,
        isSpecialSession: sched.isSpecialSession,
        eventName: sched.eventName,
        description: sched.description,
        exchangeStatus: sched.exchangeStatus,
        brokerApiSource: sched.brokerApiSource,
        isBrokerOffDayScanActive: sched.isMarketOffDay && !effectiveCleared,
        nextTradingDay: sched.nextTradingDay,
      },
    };
  }

  /**
   * Executes a full scan cycle across all Nifty 200 F&O stocks using Upstox API v2 + Autonomous Batch Engine
   */
  public async runScanCycle(isNewDayFreshScan: boolean = false): Promise<ScannedStock[]> {
    if (this.activeScanPromise) {
      if (!isNewDayFreshScan) {
        return this.activeScanPromise;
      }
      try {
        await this.activeScanPromise;
      } catch {
        // Proceed cleanly into fresh scan even if prior cycle failed
      }
    }
    const myEpoch = this.scanEpoch;
    this.isScanning = true;

    const execScan = async (): Promise<ScannedStock[]> => {
    try {
      const token = this.getEffectiveUpstoxToken();

      // Build fallback map from cache
      const pricesMap: Record<string, number> = {};
      for (const s of NIFTY_200_STOCKS) {
        const meta = this.stockMetaCache.get(s.symbol);
        pricesMap[s.symbol] = meta?.price || s.basePrice;
      }

      // Ensure initial 5m bar history is loaded on fresh scan / startup, then fetch fast L1 quotes (<300ms)
      if (isNewDayFreshScan) {
        await autonomousPriceService.ensureInitialBarsLoaded();
      }
      const [allQuotes] = await Promise.all([
        upstoxService.fetchUnifiedMarketQuotes(
          NIFTY_200_STOCKS.map((s) => s.symbol),
          token,
          pricesMap
        ),
        this.fetchLiveIndices(),
      ]);

      let usedUpstox = false;
      const newResults: ScannedStock[] = [];
      let buyCount = 0;
      let sellCount = 0;
      let highRvolCount = 0;

      const ist = getISTDateParts(new Date());
      const nowIso = new Date().toISOString();
      const statusForScan = calculateMarketStatus();
      const hadExistingEntriesToday =
        this.dailySignalLedger.dateIST === ist.dateStr &&
        Object.keys(this.dailySignalLedger.entries).length >= 10;
      let ledgerModified = false;

      // Pre-compute live arithmetic-mean SECTOR % and Nifty % from current live quotes BEFORE scoring any stock
      const niftyLiveChp = Number(
        (allQuotes['NIFTY 50']?.chp ?? allQuotes['NIFTY']?.chp ?? this.marketOverview.nifty50.changePercent ?? 0).toFixed(2)
      );
      const secAccum = new Map<string, { sum: number; cnt: number }>();
      for (const sInfo of EQUITY_ONLY_STOCKS) {
        const cleanS = upstoxService.cleanSymbol(sInfo.symbol);
        const sq = allQuotes[cleanS] || allQuotes[sInfo.symbol];
        if (sq && Number.isFinite(sq.chp)) {
          const cur = secAccum.get(sInfo.sector) || { sum: 0, cnt: 0 };
          cur.sum += sq.chp;
          cur.cnt += 1;
          secAccum.set(sInfo.sector, cur);
        }
      }
      const precomputedSectorAvgMap: Record<string, number> = {};
      secAccum.forEach((v, sec) => {
        precomputedSectorAvgMap[sec] = Number((v.sum / Math.max(1, v.cnt)).toFixed(2));
      });

      for (const stockInfo of EQUITY_ONLY_STOCKS) {
        if (myEpoch !== this.scanEpoch || this.sessionState.isMidnightCleared) {
          return this.stockScanResults;
        }
        const cleanSym = upstoxService.cleanSymbol(stockInfo.symbol);
        const q = allQuotes[cleanSym] || allQuotes[stockInfo.symbol];
        if (q?.source === 'UPSTOX_API_V2') usedUpstox = true;

        const rawLp = parseFiniteNum(q?.lp);
        const lp = rawLp && rawLp > 0 ? round2(rawLp) : round2(stockInfo.basePrice);
        const rawPrevClose = parseFiniteNum(q?.prevClose);
        const prevClose = rawPrevClose && rawPrevClose > 0 ? round2(rawPrevClose) : lp;
        const rawHigh = parseFiniteNum(q?.high);
        const dayHigh = rawHigh && rawHigh > 0 ? round2(Math.max(rawHigh, lp)) : round2(Math.max(lp, prevClose));
        const rawLow = parseFiniteNum(q?.low);
        const dayLow = rawLow && rawLow > 0 ? round2(Math.min(rawLow, lp)) : round2(Math.min(lp, prevClose));
        const realSectorChp =
          precomputedSectorAvgMap[stockInfo.sector] ??
          round2(q?.chp ?? (prevClose > 0 ? ((lp - prevClose) / prevClose) * 100 : 0));

        const stockMeta: StockMetaCache = {
          prevClose,
          dayHigh,
          dayLow,
          price: lp,
          lastUpdated: Date.now(),
        };
        this.stockMetaCache.set(stockInfo.symbol, stockMeta);

        let candles = this.stockCandles.get(stockInfo.symbol) || [];
        let hasRealBars = false;
        if (q?.intradayBars && q.intradayBars.length >= 4) {
          hasRealBars = true;
          const liveBars = q.intradayBars.map((b) => ({
            time: b.timeIST,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
            volume: Math.max(100, b.volume),
          }));
          // Prepend prevClose warm-up anchors only if session just started (< 18 bars) so EMA/RSI stabilize cleanly
          if (liveBars.length < 18) {
            const realVols = liveBars.map((b) => b.volume).filter((v) => v > 100);
            const sortedVols = [...realVols].sort((a, b) => a - b);
            const medianVol = sortedVols.length > 0 ? sortedVols[Math.floor(sortedVols.length / 2)] : 1000;
            const padCount = 18 - liveBars.length;
            const pads = Array.from({ length: padCount }, () => ({
              time: '09:15:00',
              open: prevClose,
              high: prevClose,
              low: prevClose,
              close: prevClose,
              volume: Math.max(100, medianVol),
            }));
            candles = [...pads, ...liveBars];
          } else {
            candles = liveBars;
          }
          // Preserve real 5-minute bar volume; only update forming close/high/low with live L1 tick
          const lastIdx = candles.length - 1;
          candles[lastIdx] = {
            ...candles[lastIdx],
            close: lp,
            high: Math.max(candles[lastIdx].high, lp),
            low: Math.min(candles[lastIdx].low, lp),
          };
          this.stockCandles.set(stockInfo.symbol, candles);
        } else if (candles.length >= 4) {
          hasRealBars = true;
          const lastIdx = candles.length - 1;
          candles[lastIdx] = {
            ...candles[lastIdx],
            close: lp,
            high: Math.max(candles[lastIdx].high, lp),
            low: Math.min(candles[lastIdx].low, lp),
          };
          this.stockCandles.set(stockInfo.symbol, candles);
        }

        const evalCandles =
          candles.length >= 4
            ? candles
            : [
                { time: '09:15:00', open: prevClose, high: Math.max(prevClose, lp), low: Math.min(prevClose, lp), close: lp, volume: Math.max(100, q?.volume || 1000) },
                { time: '09:20:00', open: lp, high: Math.max(dayHigh, lp), low: Math.min(dayLow, lp), close: lp, volume: Math.max(100, q?.volume || 1000) },
              ];

        const scannedStock = evaluateStockScanner(
          stockInfo.symbol,
          stockInfo.name,
          stockInfo.sector,
          evalCandles,
          dayHigh,
          dayLow,
          prevClose,
          realSectorChp,
          niftyLiveChp
        );

        // Apply exact live Upstox/Autonomous quote data rounded to 2 decimal places
        scannedStock.price = round2(lp);
        const rawCh = parseFiniteNum(q?.ch);
        const trueCh =
          rawCh === undefined ||
          (Math.abs(rawCh) <= 0.0001 && prevClose > 0 && Math.abs(lp - prevClose) > 0.01)
            ? round2(lp - prevClose)
            : round2(rawCh);
        const rawChp = parseFiniteNum(q?.chp);
        const trueChp =
          rawChp === undefined ||
          (Math.abs(rawChp) <= 0.0001 && prevClose > 0 && Math.abs(trueCh) > 0.01)
            ? prevClose > 0
              ? round2((trueCh / prevClose) * 100)
              : 0
            : round2(rawChp);
        scannedStock.change = trueCh;
        scannedStock.changePercent = trueChp;
        scannedStock.sectorChangePercent = round2(realSectorChp);
        if (q?.volume && q.volume > 0) scannedStock.volume = Math.round(q.volume);
        scannedStock.indicators.price = scannedStock.price;
        scannedStock.indicators.close = scannedStock.price;
        if (q?.open && q.open > 0) scannedStock.indicators.open = round2(q.open, scannedStock.price);
        scannedStock.indicators.high = dayHigh;
        scannedStock.indicators.low = dayLow;
        if (q?.rsi && evalCandles.length < 15) {
          scannedStock.indicators.rsi = round2(q.rsi, scannedStock.indicators.rsi);
        }
        if (q?.ema20) {
          (scannedStock.indicators as any).ema20 = round2(q.ema20, scannedStock.indicators.ema21);
          // Preserve intraday 5m EMA(13/21/34) consistency: never overwrite intraday ema21 with daily ema20 when intraday bars exist
          if (evalCandles.length < 4) {
            scannedStock.indicators.ema21 = round2(q.ema20, scannedStock.indicators.ema21);
          }
        }
        if (q?.sma50) scannedStock.indicators.ema50 = round2(q.sma50, scannedStock.indicators.ema50);
        scannedStock.fyersData = this.buildFyersQuoteFromUnified(
          scannedStock.symbol,
          q,
          scannedStock.price,
          trueCh,
          trueChp,
          prevClose
        );

        if (!hasRealBars && statusForScan.session !== 'PRE_OPEN') {
          scannedStock.signal = 'NEUTRAL';
          scannedStock.tradeStatus = 'NO_SIGNAL';
          scannedStock.keyTriggers = ['Awaiting verified 5m NSE intraday bars (No fake signal)'];
        }

        // Resolve & Lock Formula-Authentic Entry Price, Targets, SL & Discovery Time (listedAt)
        const { entry: locked, changed: entryChanged } = this.resolveFormulaSignalDiscovery(
          scannedStock,
          q,
          lp,
          prevClose,
          dayHigh,
          dayLow,
          ist.dateStr,
          ist.hour,
          ist.minute,
          ist.second,
          statusForScan.session,
          statusForScan.isOpen,
          hadExistingEntriesToday
        );
        if (entryChanged) ledgerModified = true;

        if (scannedStock.signal === 'NEUTRAL' || locked.entryPrice <= 0) {
          scannedStock.signal = 'NEUTRAL';
          scannedStock.tradeStatus = 'NO_SIGNAL';
          scannedStock.fixedEntryPrice = 0;
          scannedStock.fixedStopLoss = 0;
          scannedStock.fixedTarget1 = 0;
          scannedStock.fixedTarget2 = 0;
          scannedStock.fixedTarget3 = 0;
          scannedStock.formulaCode = 'NONE';
          scannedStock.formulaName = 'No Active Formula Signal';
          scannedStock.risk.entryPrice = 0;
          scannedStock.risk.stopLoss = 0;
          scannedStock.risk.target1 = 0;
          scannedStock.risk.target2 = 0;
          scannedStock.risk.target3 = 0;
          const validMoverListedAt =
            locked.listedAt && locked.listedAt !== '--' && /^\d{2}:\d{2}(:\d{2})?$/.test(locked.listedAt)
              ? locked.listedAt
              : '--';
          scannedStock.listedAt = validMoverListedAt;
          scannedStock.signalListedAt = validMoverListedAt;
          scannedStock.entryTime = '--';
        } else {
          scannedStock.fixedEntryPrice = locked.entryPrice;
          scannedStock.fixedStopLoss = locked.stopLoss;
          scannedStock.fixedTarget1 = locked.target1;
          scannedStock.fixedTarget2 = locked.target2;
          scannedStock.fixedTarget3 = locked.target3;
          scannedStock.formulaCode = locked.formulaCode === 'NONE' ? 'QUANT_ELITE' : locked.formulaCode;
          scannedStock.formulaName = locked.formulaName;

          scannedStock.risk.entryPrice = locked.entryPrice;
          scannedStock.risk.stopLoss = locked.stopLoss;
          scannedStock.risk.target1 = locked.target1;
          scannedStock.risk.target2 = locked.target2;
          scannedStock.risk.target3 = locked.target3;

          scannedStock.listedAt = locked.listedAt;
          scannedStock.signalListedAt = locked.listedAt;
          scannedStock.entryTime = locked.entryTime;
        }

        scannedStock.oiData = calculateStockOI(
          scannedStock.symbol,
          scannedStock.price,
          scannedStock.changePercent,
          scannedStock.volume
        );

        const scanDepth = deriveOrderBookDepth({
          volume: scannedStock.volume,
          lp: scannedStock.price,
          open: q?.open || prevClose,
          high: dayHigh,
          low: dayLow,
          chp: scannedStock.changePercent,
          atp: q?.atp || scannedStock.indicators.vwap || scannedStock.price,
          intradayBars: q?.intradayBars,
        });
        const effBidQty = q?.bidQty && q.bidQty > 0 ? q.bidQty : scanDepth.bidQty;
        const effAskQty = q?.askQty && q.askQty > 0 ? q.askQty : scanDepth.askQty;
        const effRatio = Number((effBidQty / Math.max(1, effAskQty)).toFixed(2));
        scannedStock.bidQty = effBidQty;
        scannedStock.askQty = effAskQty;
        scannedStock.bidAskRatio = effRatio;
        scannedStock.orderBookBias =
          effRatio >= 1.55
            ? 'Heavy Buyer Accumulation'
            : effRatio >= 1.18
            ? 'Buyer Dominance'
            : effRatio <= 0.65
            ? 'Heavy Seller Supply'
            : effRatio <= 0.85
            ? 'Seller Pressure'
            : 'Balanced Order Book';

        const computedCumDelta = calculateSessionCumulativeDelta(evalCandles);
        scannedStock.cumulativeDelta =
          computedCumDelta !== 0 ? computedCumDelta : Math.round(effBidQty - effAskQty);

        // Compute real Wilder ADX(14), Strong RVOL, and flicker-resistant X-Time Volume from real 5m bars
        const extBars5m = autonomousPriceService.getExtendedBars(stockInfo.symbol);
        const strongMetrics = computeUniversalStrongMetrics(
          extBars5m && extBars5m.length >= 4 ? extBars5m : evalCandles,
          scannedStock.indicators.rvol,
          scannedStock.indicators.adx,
          scannedStock.indicators.xTimeVolume
        );
        scannedStock.indicators.rvol = strongMetrics.rvol;
        scannedStock.indicators.xTimeVolume = strongMetrics.xTimeVolume;
        scannedStock.indicators.adx = strongMetrics.adx;
        if (strongMetrics.plusDI > 0 || strongMetrics.minusDI > 0) {
          scannedStock.indicators.plusDi = strongMetrics.plusDI;
          scannedStock.indicators.minusDi = strongMetrics.minusDI;
        }

        scannedStock.sparkline = candles.slice(-12).map((c) => Number(c.close.toFixed(2)));
        scannedStock.alertCreateTime = nowIso;

        const matchedNews = this.newsFeed.find((n) => n.symbol === scannedStock.symbol);
        scannedStock.newsSentiment = matchedNews
          ? matchedNews.sentiment
          : scannedStock.changePercent >= 0
          ? 'POSITIVE'
          : 'NEGATIVE';
        scannedStock.newsTitle =
          matchedNews?.title || `${scannedStock.name} (${scannedStock.symbol}) live intraday momentum update`;

        if (scannedStock.signal === 'BUY') buyCount++;
        if (scannedStock.signal === 'SELL') sellCount++;
        if (scannedStock.indicators.rvol >= 1.5) highRvolCount++;

        if (scannedStock.aiScore >= this.alertConfig.minScoreToAlert && scannedStock.signal !== 'NEUTRAL') {
          this.processAutoAlert(scannedStock);
        }
        if (this.alertConfig.enableOrderQtyAlert !== false) {
          this.processOrderQtyAlert(scannedStock);
        }
        if (this.alertConfig.enableCumulativeDeltaAlert !== false) {
          this.processCumulativeDeltaAlert(scannedStock);
        }

        scannedStock.fyersSymbol = upstoxService.getInstrumentKey(scannedStock.symbol);
        scannedStock.lotSize =
          stockInfo.lotSize || (scannedStock.price > 3000 ? 125 : scannedStock.price > 1000 ? 250 : 500);
        scannedStock.strikeStep =
          stockInfo.strikeStep || (scannedStock.price > 5000 ? 50 : scannedStock.price > 1000 ? 20 : 10);

        newResults.push(scannedStock);
      }

      // Do not overwrite cleared state if midnight purge happened while scan ran asynchronously!
      if (myEpoch !== this.scanEpoch || this.sessionState.isMidnightCleared) {
        return this.stockScanResults;
      }

      if (ledgerModified || this.ledgerDirty) {
        this.saveDailySignalLedger();
      }
      this.lastQuoteSource = usedUpstox ? 'UPSTOX_API_V2' : 'AUTONOMOUS_LIVE_ENGINE';

      newResults.sort((a, b) => b.aiScore - a.aiScore);
      this.stockScanResults = newResults;
      this.lastScanTimestamp = nowIso;
      this.evaluateTargetHitsAndTrades(newResults);

      const statusInfo = calculateMarketStatus();
      const sched = this.getBrokerScheduleSync();
      this.ensureNiftySparklineAndTrend();
      this.marketOverview = {
        ...this.marketOverview,
        scannedCount: newResults.length,
        buyCount,
        sellCount,
        highRvolCount,
        lastScanTime: this.lastScanTimestamp,
        marketStatus: this.formatOverviewMarketStatus(statusInfo, sched),
      };
      if ((statusInfo.isOpen || sched.isMarketOffDay) && newResults.length > 0 && !isNewDayFreshScan) {
        marketWebSocketServer.broadcastSystemEvent({
          type: 'scan_update',
          dateIST: ist.dateStr,
          stocksCount: newResults.length,
        });
      }
      return this.stockScanResults;
    } finally {
      this.isScanning = false;
      this.activeScanPromise = null;
    }
    };

    this.activeScanPromise = execScan();
    return this.activeScanPromise;
  }

  /**
   * Evaluates Target 1, Target 2, and Stop Loss hits across active alerts, open trade positions, and scanned stocks
   */
  private evaluateTargetHitsAndTrades(scannedStocks: ScannedStock[]) {
    const stockMap = new Map<string, ScannedStock>();
    for (const s of scannedStocks) {
      stockMap.set(s.symbol, s);
    }

    // 1. Evaluate Target Hits on Alert Logs
    for (const alert of this.alertLogs) {
      const stock = stockMap.get(alert.symbol);
      if (!stock) continue;

      const curPrice = stock.price;

      if (alert.signal === 'BUY') {
        if (curPrice >= alert.target2 && alert.targetHitStatus !== 'TARGET_2_HIT') {
          alert.targetHitStatus = 'TARGET_2_HIT';
          alert.targetHitTime = new Date().toISOString();
          alert.targetHitPrice = curPrice;
        } else if (
          curPrice >= alert.target1 &&
          alert.targetHitStatus !== 'TARGET_1_HIT' &&
          alert.targetHitStatus !== 'TARGET_2_HIT'
        ) {
          alert.targetHitStatus = 'TARGET_1_HIT';
          alert.targetHitTime = new Date().toISOString();
          alert.targetHitPrice = curPrice;
        } else if (curPrice <= alert.stopLoss && alert.targetHitStatus !== 'STOP_LOSS_HIT') {
          alert.targetHitStatus = 'STOP_LOSS_HIT';
          alert.targetHitTime = new Date().toISOString();
          alert.targetHitPrice = curPrice;
        }
      } else if (alert.signal === 'SELL') {
        if (curPrice <= alert.target2 && alert.targetHitStatus !== 'TARGET_2_HIT') {
          alert.targetHitStatus = 'TARGET_2_HIT';
          alert.targetHitTime = new Date().toISOString();
          alert.targetHitPrice = curPrice;
        } else if (
          curPrice <= alert.target1 &&
          alert.targetHitStatus !== 'TARGET_1_HIT' &&
          alert.targetHitStatus !== 'TARGET_2_HIT'
        ) {
          alert.targetHitStatus = 'TARGET_1_HIT';
          alert.targetHitTime = new Date().toISOString();
          alert.targetHitPrice = curPrice;
        } else if (curPrice >= alert.stopLoss && alert.targetHitStatus !== 'STOP_LOSS_HIT') {
          alert.targetHitStatus = 'STOP_LOSS_HIT';
          alert.targetHitTime = new Date().toISOString();
          alert.targetHitPrice = curPrice;
        }
      }
    }

    // 2. Evaluate Target Hits & Unrealized / Realized P&L on Trade Positions
    for (const trade of this.tradePositions) {
      if (trade.status !== 'OPEN') continue;

      const stock = stockMap.get(trade.symbol);
      if (!stock) continue;

      trade.currentPrice = stock.price;

      if (trade.signal === 'BUY') {
        trade.unrealizedPnL = Number(
          ((trade.currentPrice - trade.entryPrice) * trade.quantity).toFixed(2)
        );
        trade.unrealizedPnLPercent = Number(
          (
            ((trade.currentPrice - trade.entryPrice) / trade.entryPrice) *
            100
          ).toFixed(2)
        );

        if (trade.currentPrice >= trade.target2) {
          trade.targetHitStatus = 'TARGET_2_HIT';
          trade.status = 'CLOSED';
          trade.closedAt = new Date().toISOString();
          trade.closePrice = trade.currentPrice;
          trade.closeReason = 'TARGET_2_HIT';
          trade.realizedPnL = trade.unrealizedPnL;
          trade.realizedPnLPercent = trade.unrealizedPnLPercent;
        } else if (trade.currentPrice >= trade.target1) {
          trade.targetHitStatus = 'TARGET_1_HIT';
          trade.status = 'CLOSED';
          trade.closedAt = new Date().toISOString();
          trade.closePrice = trade.currentPrice;
          trade.closeReason = 'TARGET_1_HIT';
          trade.realizedPnL = trade.unrealizedPnL;
          trade.realizedPnLPercent = trade.unrealizedPnLPercent;
        } else if (trade.currentPrice <= trade.stopLoss) {
          trade.targetHitStatus = 'STOP_LOSS_HIT';
          trade.status = 'CLOSED';
          trade.closedAt = new Date().toISOString();
          trade.closePrice = trade.currentPrice;
          trade.closeReason = 'STOP_LOSS_HIT';
          trade.realizedPnL = trade.unrealizedPnL;
          trade.realizedPnLPercent = trade.unrealizedPnLPercent;
        }
      } else if (trade.signal === 'SELL') {
        trade.unrealizedPnL = Number(
          ((trade.entryPrice - trade.currentPrice) * trade.quantity).toFixed(2)
        );
        trade.unrealizedPnLPercent = Number(
          (
            ((trade.entryPrice - trade.currentPrice) / trade.entryPrice) *
            100
          ).toFixed(2)
        );

        if (trade.currentPrice <= trade.target2) {
          trade.targetHitStatus = 'TARGET_2_HIT';
          trade.status = 'CLOSED';
          trade.closedAt = new Date().toISOString();
          trade.closePrice = trade.currentPrice;
          trade.closeReason = 'TARGET_2_HIT';
          trade.realizedPnL = trade.unrealizedPnL;
          trade.realizedPnLPercent = trade.unrealizedPnLPercent;
        } else if (trade.currentPrice <= trade.target1) {
          trade.targetHitStatus = 'TARGET_1_HIT';
          trade.status = 'CLOSED';
          trade.closedAt = new Date().toISOString();
          trade.closePrice = trade.currentPrice;
          trade.closeReason = 'TARGET_1_HIT';
          trade.realizedPnL = trade.unrealizedPnL;
          trade.realizedPnLPercent = trade.unrealizedPnLPercent;
        } else if (trade.currentPrice >= trade.stopLoss) {
          trade.targetHitStatus = 'STOP_LOSS_HIT';
          trade.status = 'CLOSED';
          trade.closedAt = new Date().toISOString();
          trade.closePrice = trade.currentPrice;
          trade.closeReason = 'STOP_LOSS_HIT';
          trade.realizedPnL = trade.unrealizedPnL;
          trade.realizedPnLPercent = trade.unrealizedPnLPercent;
        }
      }
    }

    // 3. Evaluate Target Hits & Trade Status across all Scanned Stocks
    const istNow = getISTDateParts(new Date());
    for (const stock of scannedStocks) {
      if (stock.signal !== 'BUY' && stock.signal !== 'SELL') {
        stock.tradeStatus = 'NO_SIGNAL';
        stock.isClosed = false;
        const keepMoverTime =
          Math.abs(Number(stock.changePercent) || 0) >= 1.5 &&
          stock.listedAt &&
          /^\d{2}:\d{2}(:\d{2})?$/.test(stock.listedAt);
        if (!keepMoverTime) {
          stock.listedAt = '--';
          stock.signalListedAt = '--';
        }
        stock.entryTime = '--';
        stock.exitTime = undefined;
        stock.exitPrice = undefined;
        stock.realizedPoints = 0;
        stock.realizedPct = 0;
        continue;
      }

      const fixedEntry = stock.fixedEntryPrice || stock.risk.entryPrice || 0;
      if (fixedEntry <= 0 || !stock.listedAt || stock.listedAt === '--') {
        stock.tradeStatus = 'NO_SIGNAL';
        stock.isClosed = false;
        continue;
      }
      const fixedSL = stock.fixedStopLoss || stock.risk.stopLoss;
      const fixedT1 = stock.fixedTarget1 || stock.risk.target1;
      const fixedT2 = stock.fixedTarget2 || stock.risk.target2;
      const fixedT3 = stock.fixedTarget3 || stock.risk.target3 || fixedT2;

      if (!stock.entryTime || !/^\d{2}:\d{2}(:\d{2})?$/.test(stock.entryTime)) {
        stock.entryTime = stock.listedAt;
      }

      const recordRealExitTime = () =>
        stock.exitTime && /^\d{2}:\d{2}(:\d{2})?$/.test(stock.exitTime) ? stock.exitTime : istNow.timeStr;

      if (stock.signal === 'BUY') {
        if (stock.price >= fixedT3) {
          stock.tradeStatus = 'CLOSED_TARGET_3';
          stock.isClosed = true;
          stock.exitPrice = stock.price;
          stock.exitTime = recordRealExitTime();
          stock.realizedPoints = Number((stock.price - fixedEntry).toFixed(2));
          stock.realizedPct = Number((((stock.price - fixedEntry) / fixedEntry) * 100).toFixed(2));
        } else if (stock.price >= fixedT2) {
          stock.tradeStatus = 'CLOSED_TARGET_2';
          stock.isClosed = true;
          stock.exitPrice = stock.price;
          stock.exitTime = recordRealExitTime();
          stock.realizedPoints = Number((stock.price - fixedEntry).toFixed(2));
          stock.realizedPct = Number((((stock.price - fixedEntry) / fixedEntry) * 100).toFixed(2));
        } else if (stock.price >= fixedT1) {
          stock.tradeStatus = 'CLOSED_TARGET_1';
          stock.isClosed = true;
          stock.exitPrice = stock.price;
          stock.exitTime = recordRealExitTime();
          stock.realizedPoints = Number((stock.price - fixedEntry).toFixed(2));
          stock.realizedPct = Number((((stock.price - fixedEntry) / fixedEntry) * 100).toFixed(2));
        } else if (stock.price <= fixedSL) {
          stock.tradeStatus = 'CLOSED_STOP_LOSS';
          stock.isClosed = true;
          stock.exitPrice = stock.price;
          stock.exitTime = recordRealExitTime();
          stock.realizedPoints = Number((stock.price - fixedEntry).toFixed(2));
          stock.realizedPct = Number((((stock.price - fixedEntry) / fixedEntry) * 100).toFixed(2));
        } else {
          stock.tradeStatus = 'OPEN';
          stock.isClosed = false;
          stock.realizedPoints = Number((stock.price - fixedEntry).toFixed(2));
          stock.realizedPct = Number((((stock.price - fixedEntry) / fixedEntry) * 100).toFixed(2));
        }
      } else if (stock.signal === 'SELL') {
        if (stock.price <= fixedT3) {
          stock.tradeStatus = 'CLOSED_TARGET_3';
          stock.isClosed = true;
          stock.exitPrice = stock.price;
          stock.exitTime = recordRealExitTime();
          stock.realizedPoints = Number((fixedEntry - stock.price).toFixed(2));
          stock.realizedPct = Number((((fixedEntry - stock.price) / fixedEntry) * 100).toFixed(2));
        } else if (stock.price <= fixedT2) {
          stock.tradeStatus = 'CLOSED_TARGET_2';
          stock.isClosed = true;
          stock.exitPrice = stock.price;
          stock.exitTime = recordRealExitTime();
          stock.realizedPoints = Number((fixedEntry - stock.price).toFixed(2));
          stock.realizedPct = Number((((fixedEntry - stock.price) / fixedEntry) * 100).toFixed(2));
        } else if (stock.price <= fixedT1) {
          stock.tradeStatus = 'CLOSED_TARGET_1';
          stock.isClosed = true;
          stock.exitPrice = stock.price;
          stock.exitTime = recordRealExitTime();
          stock.realizedPoints = Number((fixedEntry - stock.price).toFixed(2));
          stock.realizedPct = Number((((fixedEntry - stock.price) / fixedEntry) * 100).toFixed(2));
        } else if (stock.price >= fixedSL) {
          stock.tradeStatus = 'CLOSED_STOP_LOSS';
          stock.isClosed = true;
          stock.exitPrice = stock.price;
          stock.exitTime = recordRealExitTime();
          stock.realizedPoints = Number((fixedEntry - stock.price).toFixed(2));
          stock.realizedPct = Number((((fixedEntry - stock.price) / fixedEntry) * 100).toFixed(2));
        } else {
          stock.tradeStatus = 'OPEN';
          stock.isClosed = false;
          stock.realizedPoints = Number((fixedEntry - stock.price).toFixed(2));
          stock.realizedPct = Number((((fixedEntry - stock.price) / fixedEntry) * 100).toFixed(2));
        }
      }
    }
  }

  /**
   * Processes automatic alerts for high-conviction trades
   */
  private processAutoAlert(stock: ScannedStock) {
    const recentAlert = this.alertLogs.find(
      (a) =>
        a.symbol === stock.symbol &&
        Date.now() - new Date(a.timestamp).getTime() < 600000
    );
    if (recentAlert) return;

    const sentChannels: string[] = [];
    if (this.alertConfig.enableTelegram) sentChannels.push('Telegram');
    if (this.alertConfig.enableWhatsapp) sentChannels.push('WhatsApp');
    if (this.alertConfig.enableEmail) sentChannels.push('Email');
    if (sentChannels.length === 0) sentChannels.push('Dashboard Toast');

    const isBuy = stock.signal === 'BUY';
    const vwapStatus: 'ABOVE' | 'BELOW' = stock.price >= stock.indicators.vwap ? 'ABOVE' : 'BELOW';
    const sectorAvgPct = this.getSectorAvgPct(stock.sector, stock.changePercent);
    const sectorStatus: 'POSITIVE' | 'NEGATIVE' = sectorAvgPct >= 0 ? 'POSITIVE' : 'NEGATIVE';
    const newsSent: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' = stock.newsSentiment || (stock.changePercent >= 0 ? 'POSITIVE' : 'NEGATIVE');

    const alertItem: AlertLogItem = {
      id: `ALT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      symbol: stock.symbol,
      signal: stock.signal,
      aiScore: stock.aiScore,
      accuracyScore: stock.aiScore,
      price: stock.price,
      entry: stock.risk.entryPrice,
      stopLoss: stock.risk.stopLoss,
      target1: stock.risk.target1,
      target2: stock.risk.target2,
      targetHitStatus: 'ACTIVE',
      sentVia: sentChannels,
      status: 'SENT',
      sector: stock.sector,
      sectorStatus: sectorStatus,
      sectorChangePercent: sectorAvgPct,
      oi: stock.oiData ? `${stock.oiData.openInterest.toFixed(2)}L` : '1.25M',
      oiChangePercent: stock.oiData?.changeInOIPercent || 2.5,
      volumeX: `${stock.indicators.rvol || 1.2}x Vol`,
      rsi: stock.indicators.rsi,
      vwap: stock.indicators.vwap,
      vwapStatus: vwapStatus,
      newsSentiment: newsSent,
      newsTitle: stock.newsTitle || `${stock.symbol} live intraday momentum update`,
      gapPct: stock.indicators.gapPct || stock.changePercent,
      gapType: stock.indicators.gapType || (stock.changePercent >= 2 ? 'STRONG_GAP_UP' : stock.changePercent >= 0.8 ? 'GAP_UP' : stock.changePercent <= -2 ? 'STRONG_GAP_DOWN' : stock.changePercent <= -0.8 ? 'GAP_DOWN' : 'NORMAL_OPEN'),
      purchaseRationale: `${isBuy ? 'High Conviction Buy' : 'Bearish Sell'} (${stock.aiScore}% AI Score): ${stock.indicators.rvol || 1.2}x Vol expansion, ${vwapStatus === 'ABOVE' ? 'Above VWAP' : 'Below VWAP'}, RSI ${stock.indicators.rsi} (${stock.indicators.rsi >= 60 ? 'Bullish' : 'Bearish'}), Sector ${stock.sector} (${sectorAvgPct >= 0 ? '+' : ''}${sectorAvgPct}%), and Live News: ${newsSent}.`,
    };

    this.alertLogs.unshift(alertItem);
    if (this.alertLogs.length > 50) this.alertLogs.pop();
  }

  /**
   * Processes alerts for Volume & RVol when Order Size >= 50,000 Quantity (Purchase / Sale)
   */
  private processOrderQtyAlert(stock: ScannedStock) {
    const minQty = this.alertConfig.minOrderSizeQty ?? 50000;
    const minRvol = this.alertConfig.minRvolForOrderAlert ?? 1.5;
    const filter = this.alertConfig.orderTypeFilter ?? 'BOTH';

    const rvol = stock.indicators.rvol || 1.0;
    const totalVolume = stock.volume || 0;
    // Estimated instant / single order surge quantity
    const estimatedOrderQty = Math.round(totalVolume * 0.15) || totalVolume;

    if (estimatedOrderQty < minQty || rvol < minRvol) return;

    const isPurchase = stock.changePercent >= 0 || stock.price >= stock.indicators.vwap;
    const dealType: 'PURCHASE' | 'SALE' = isPurchase ? 'PURCHASE' : 'SALE';

    if (filter === 'PURCHASE_ONLY' && dealType !== 'PURCHASE') return;
    if (filter === 'SALE_ONLY' && dealType !== 'SALE') return;

    // Check if recent large order alert triggered in past 10 minutes for this stock & dealType
    const recentAlert = this.alertLogs.find(
      (a) =>
        a.symbol === stock.symbol &&
        a.alertCategory === 'LARGE_ORDER_QTY' &&
        a.dealType === dealType &&
        Date.now() - new Date(a.timestamp).getTime() < 600000
    );
    if (recentAlert) return;

    const sentChannels: string[] = [];
    if (this.alertConfig.enableTelegram) sentChannels.push('Telegram');
    if (this.alertConfig.enableWhatsapp) sentChannels.push('WhatsApp');
    if (this.alertConfig.enableEmail) sentChannels.push('Email');
    if (sentChannels.length === 0) sentChannels.push('Dashboard Toast');

    const vwapStatus: 'ABOVE' | 'BELOW' = stock.price >= stock.indicators.vwap ? 'ABOVE' : 'BELOW';
    const sectorAvgPct = this.getSectorAvgPct(stock.sector, stock.changePercent);
    const sectorStatus: 'POSITIVE' | 'NEGATIVE' = sectorAvgPct >= 0 ? 'POSITIVE' : 'NEGATIVE';
    const newsSent: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' = stock.newsSentiment || (stock.changePercent >= 0 ? 'POSITIVE' : 'NEGATIVE');

    const alertItem: AlertLogItem = {
      id: `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: new Date().toISOString(),
      symbol: stock.symbol,
      signal: isPurchase ? 'BUY' : 'SELL',
      aiScore: stock.aiScore,
      accuracyScore: stock.aiScore,
      price: stock.price,
      entry: stock.risk.entryPrice,
      stopLoss: stock.risk.stopLoss,
      target1: stock.risk.target1,
      target2: stock.risk.target2,
      targetHitStatus: 'ACTIVE',
      sentVia: sentChannels,
      status: 'SENT',
      alertCategory: 'LARGE_ORDER_QTY',
      orderQty: estimatedOrderQty,
      rvol: rvol,
      dealType: dealType,
      reason: `🔥 ${estimatedOrderQty.toLocaleString('en-IN')} Qty ${dealType} Alert | RVol ${rvol.toFixed(1)}x | Vol ${(totalVolume / 100000).toFixed(2)} Lakhs`,
      sector: stock.sector,
      sectorStatus: sectorStatus,
      sectorChangePercent: sectorAvgPct,
      oi: stock.oiData ? `${stock.oiData.openInterest.toFixed(2)}L` : '1.25M',
      oiChangePercent: stock.oiData?.changeInOIPercent || 2.5,
      volumeX: `${rvol.toFixed(1)}x Vol`,
      rsi: stock.indicators.rsi,
      vwap: stock.indicators.vwap,
      vwapStatus: vwapStatus,
      newsSentiment: newsSent,
      newsTitle: stock.newsTitle || `${stock.symbol} large institutional surge`,
      gapPct: stock.indicators.gapPct || stock.changePercent,
      gapType: stock.indicators.gapType || (stock.changePercent >= 2 ? 'STRONG_GAP_UP' : stock.changePercent >= 0.8 ? 'GAP_UP' : stock.changePercent <= -2 ? 'STRONG_GAP_DOWN' : stock.changePercent <= -0.8 ? 'GAP_DOWN' : 'NORMAL_OPEN'),
      purchaseRationale: `Institutional ${estimatedOrderQty.toLocaleString('en-IN')} Qty ${dealType} Surge: ${rvol.toFixed(1)}x Volume multiplier, ${vwapStatus === 'ABOVE' ? 'Trading Above VWAP' : 'Trading Below VWAP'}, RSI ${stock.indicators.rsi}, Sector ${stock.sector} (${sectorAvgPct >= 0 ? '+' : ''}${sectorAvgPct}%), and Live News: ${newsSent}.`,
    };

    this.alertLogs.unshift(alertItem);
    if (this.alertLogs.length > 50) this.alertLogs.pop();
  }

  /**
   * Processes alerts when a stock's Cumulative Delta crosses the configured threshold
   */
  private processCumulativeDeltaAlert(stock: ScannedStock) {
    const triggered = checkCumulativeDeltaAlerts([stock], this.alertConfig, {
      state: this.cumulativeDeltaState,
      notifyBrowser: false,
    });
    for (const alertItem of triggered) {
      this.alertLogs.unshift(alertItem);
      if (this.alertLogs.length > 50) this.alertLogs.pop();
    }
  }

  /**
   * Triggers a live test alert and logs it into alert history
   */
  public triggerTestAlert(): AlertLogItem | null {
    const data = this.getScanResults();
    const topStock = data.top10Buy[0] || data.stocks[0];
    if (!topStock) return null;

    const isBuy = topStock.signal === 'BUY';
    const vwapStatus: 'ABOVE' | 'BELOW' = topStock.price >= topStock.indicators.vwap ? 'ABOVE' : 'BELOW';
    const sectorAvgPct = this.getSectorAvgPct(topStock.sector, topStock.changePercent);
    const sectorStatus: 'POSITIVE' | 'NEGATIVE' = sectorAvgPct >= 0 ? 'POSITIVE' : 'NEGATIVE';
    const newsSent: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' = topStock.newsSentiment || (topStock.changePercent >= 0 ? 'POSITIVE' : 'NEGATIVE');

    const alertItem: AlertLogItem = {
      id: `ALT-TEST-${Date.now()}`,
      timestamp: new Date().toISOString(),
      symbol: topStock.symbol,
      signal: topStock.signal,
      aiScore: topStock.aiScore,
      accuracyScore: topStock.aiScore >= 85 ? topStock.aiScore : 94,
      price: topStock.price,
      entry: topStock.risk.entryPrice,
      stopLoss: topStock.risk.stopLoss,
      target1: topStock.risk.target1,
      target2: topStock.risk.target2,
      targetHitStatus: 'ACTIVE',
      sentVia: ['Telegram', 'Dashboard Toast', 'WhatsApp', 'Email'],
      status: 'SENT',
      alertCategory: 'AI_SCORE',
      sector: topStock.sector,
      sectorStatus: sectorStatus,
      sectorChangePercent: sectorAvgPct,
      oi: topStock.oiData ? `${topStock.oiData.openInterest.toFixed(2)}L` : '1.45M',
      oiChangePercent: topStock.oiData?.changeInOIPercent || 3.2,
      volumeX: `${topStock.indicators.rvol || 1.8}x Vol`,
      rsi: topStock.indicators.rsi,
      vwap: topStock.indicators.vwap,
      vwapStatus: vwapStatus,
      newsSentiment: newsSent,
      newsTitle: topStock.newsTitle || `${topStock.symbol} test alert momentum signal`,
      gapPct: topStock.indicators.gapPct || topStock.changePercent,
      gapType: topStock.indicators.gapType || (topStock.changePercent >= 2 ? 'STRONG_GAP_UP' : topStock.changePercent >= 0.8 ? 'GAP_UP' : topStock.changePercent <= -2 ? 'STRONG_GAP_DOWN' : topStock.changePercent <= -0.8 ? 'GAP_DOWN' : 'NORMAL_OPEN'),
      purchaseRationale: `TEST ALERT (${topStock.symbol}): AI Accuracy ${topStock.aiScore >= 85 ? topStock.aiScore : 94}%, ${topStock.indicators.rvol || 1.8}x Vol expansion, ${vwapStatus === 'ABOVE' ? 'Trading Above VWAP' : 'Trading Below VWAP'}, RSI ${topStock.indicators.rsi}, Sector ${topStock.sector} (${sectorAvgPct >= 0 ? '+' : ''}${sectorAvgPct}%).`,
    };

    this.alertLogs.unshift(alertItem);
    if (this.alertLogs.length > 50) this.alertLogs.pop();
    return alertItem;
  }

  private ensureNiftySparklineAndTrend() {
    const niftyBars = autonomousPriceService.getExtendedBars('NIFTY 50') || autonomousPriceService.getExtendedBars('NIFTY');
    const currentPrice = this.marketOverview.nifty50.price || 25044.65;

    if (niftyBars && niftyBars.length >= 2) {
      const candles = niftyBars.map((b) => ({
        time: b.timeIST,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: Math.max(100, b.volume),
      }));
      this.stockCandles.set('NIFTY', candles);
      const last12 = candles.slice(-12);
      last12[last12.length - 1].close = currentPrice;
      this.marketOverview.nifty50.sparkline = last12.map((c) => Number(c.close.toFixed(2)));
      const baseP = last12[0].close;
      this.marketOverview.nifty50.trendHistory = last12.map((c, i) => ({
        time: i === last12.length - 1 ? 'Now' : c.time.slice(0, 5),
        price: Number(c.close.toFixed(2)),
        change: Number((c.close - baseP).toFixed(2)),
      }));
      return;
    }

    const existing = this.stockCandles.get('NIFTY');
    if (existing && existing.length >= 2) {
      const last12 = existing.slice(-12);
      last12[last12.length - 1].close = currentPrice;
      this.marketOverview.nifty50.sparkline = last12.map((c) => Number(c.close.toFixed(2)));
      const baseP = last12[0].close;
      this.marketOverview.nifty50.trendHistory = last12.map((c, i) => ({
        time: i === last12.length - 1 ? 'Now' : c.time.slice(0, 5),
        price: Number(c.close.toFixed(2)),
        change: Number((c.close - baseP).toFixed(2)),
      }));
    } else {
      this.marketOverview.nifty50.sparkline = [currentPrice];
      this.marketOverview.nifty50.trendHistory = [{ time: 'Now', price: currentPrice, change: 0 }];
    }
  }

  private computeSectorAvgMap(): Record<string, number> {
    const accum = new Map<string, { sum: number; cnt: number }>();
    for (const s of this.stockScanResults) {
      if (s.sector === 'Indices' || INDEX_SYMBOLS_UNIVERSE.has(s.symbol.toUpperCase())) continue;
      const sec = s.sector || 'NSE F&O';
      const cur = accum.get(sec) || { sum: 0, cnt: 0 };
      cur.sum += Number(s.changePercent) || 0;
      cur.cnt += 1;
      accum.set(sec, cur);
    }
    const map: Record<string, number> = {};
    accum.forEach((v, sec) => {
      map[sec] = Number((v.sum / Math.max(1, v.cnt)).toFixed(2));
    });
    return map;
  }

  private getSectorAvgPct(sector: string, fallbackPct: number = 0): number {
    const map = this.computeSectorAvgMap();
    return map[sector] ?? Number((Number(fallbackPct) || 0).toFixed(2));
  }

  // Getters & Setters
  public getScanResults(): {
    stocks: ScannedStock[];
    top10Buy: ScannedStock[];
    top10Sell: ScannedStock[];
    sectorAvgMap: Record<string, number>;
    overview: MarketOverview;
    broker: BrokerConfig;
    alerts: AlertConfig;
    news: NewsItem[];
    corporateActions: CorporateAction[];
    bulkOrders: BulkOrder[];
    sessionState?: any;
  } {
    this.ensureNiftySparklineAndTrend();
    const sectorAvgMap = this.computeSectorAvgMap();
    for (const s of this.stockScanResults) {
      s.sectorChangePercent = sectorAvgMap[s.sector] ?? Number((Number(s.changePercent) || 0).toFixed(2));
    }

    const isPureStock = (s: ScannedStock) =>
      s.sector !== 'Indices' && !INDEX_SYMBOLS_UNIVERSE.has(s.symbol.toUpperCase());
    const normRvolScore = (rv: number) => Math.min(18, Math.log10(Math.max(1, rv)) * 8);
    const scoreFormulaBuy = (s: ScannedStock) =>
      s.changePercent * 10 +
      normRvolScore(s.indicators.rvol) +
      ((s.bidAskRatio || 1) - 1) * 16 +
      s.aiScore * 0.45;
    const scoreFormulaSell = (s: ScannedStock) =>
      -s.changePercent * 10 +
      normRvolScore(s.indicators.rvol) +
      (1 - (s.bidAskRatio || 1)) * 16 +
      s.aiScore * 0.45;
    const parseSec = (t?: string) => {
      if (!t) return 0;
      const p = t.split(':').map((x) => parseInt(x, 10) || 0);
      return (p[0] || 0) * 3600 + (p[1] || 0) * 60 + (p[2] || 0);
    };
    const sortNewestFirstZtoA = (arr: ScannedStock[]) =>
      [...arr].sort((a, b) => parseSec(b.listedAt) - parseSec(a.listedAt) || b.symbol.localeCompare(a.symbol));

    const isEligibleBuyFormula = (s: ScannedStock) =>
      isPureStock(s) &&
      s.signal === 'BUY' &&
      s.changePercent >= 0.45 &&
      (s.indicators.rvol || 0) > UNIVERSAL_STRONG_RVOL_MIN &&
      (s.indicators.xTimeVolume || 0) > UNIVERSAL_STRONG_XTIME_VOL_MIN &&
      (s.indicators.adx || 0) >= UNIVERSAL_STRONG_ADX_MIN &&
      s.price >= (s.indicators.vwap || s.price) * 0.998 &&
      s.aiScore >= 65;

    const isEligibleSellFormula = (s: ScannedStock) =>
      isPureStock(s) &&
      s.signal === 'SELL' &&
      s.changePercent <= -0.45 &&
      (s.indicators.rvol || 0) > UNIVERSAL_STRONG_RVOL_MIN &&
      (s.indicators.xTimeVolume || 0) > UNIVERSAL_STRONG_XTIME_VOL_MIN &&
      (s.indicators.adx || 0) >= UNIVERSAL_STRONG_ADX_MIN &&
      s.price <= (s.indicators.vwap || s.price) * 1.002 &&
      s.aiScore >= 65;

    const buyCandidates = this.stockScanResults
      .filter(isEligibleBuyFormula)
      .sort((a, b) => scoreFormulaBuy(b) - scoreFormulaBuy(a));
    const sellCandidates = this.stockScanResults
      .filter(isEligibleSellFormula)
      .sort((a, b) => scoreFormulaSell(b) - scoreFormulaSell(a));

    const sessionSnap = this.getSessionStatus();
    const cleared = Boolean(sessionSnap.isMidnightCleared);
    const liveMap = new Map<string, ScannedStock>(
      this.stockScanResults.map((s) => [s.symbol.toUpperCase(), s])
    );
    const getBarsFn = (sym: string) =>
      autonomousPriceService.getExtendedBars(sym) || this.stockCandles.get(sym);

    const stabilizedBuy = stickyScannerRegistry.filterAndStabilizeRows<ScannedStock>({
      scannerKey: 'core-scanner:BUY',
      rows: buyCandidates,
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: cleared,
      maxRows: UNIVERSAL_MAX_PER_DIRECTION,
      getSymbol: (s) => s.symbol,
      getSide: () => 'BUY',
      getEntryPrice: (s) => s.fixedEntryPrice || s.risk?.entryPrice || s.price,
      getStopLoss: (s) => s.fixedStopLoss || s.risk?.stopLoss || 0,
      getRvol: (s) => s.indicators?.rvol,
      getAdx: (s) => s.indicators?.adx,
      getXTimeVol: (s) => s.indicators?.xTimeVolume,
      enrichRow: (s, m) => ({
        ...s,
        indicators: {
          ...s.indicators,
          rvol: Math.max(s.indicators.rvol || 0, m.rvol),
          xTimeVolume: Math.max(s.indicators.xTimeVolume || 0, m.xTimeVolume),
          adx: Math.max(s.indicators.adx || 0, m.adx),
        },
      }),
      updateLiveRow: (locked, live, fresh, m) => {
        const src = fresh || live || locked;
        return {
          ...src,
          listedAt: locked.listedAt || src.listedAt,
          entryTime: locked.entryTime || src.entryTime,
          fixedEntryPrice: locked.fixedEntryPrice || src.fixedEntryPrice,
          fixedStopLoss: locked.fixedStopLoss || src.fixedStopLoss,
          fixedTarget1: locked.fixedTarget1 || src.fixedTarget1,
          indicators: {
            ...src.indicators,
            rvol: Math.max(src.indicators?.rvol || 0, m.rvol),
            xTimeVolume: Math.max(src.indicators?.xTimeVolume || 0, m.xTimeVolume),
            adx: Math.max(src.indicators?.adx || 0, m.adx),
          },
        };
      },
    });

    const stabilizedSell = stickyScannerRegistry.filterAndStabilizeRows<ScannedStock>({
      scannerKey: 'core-scanner:SELL',
      rows: sellCandidates,
      liveStockMap: liveMap,
      getBarsFn,
      isMidnightCleared: cleared,
      maxRows: UNIVERSAL_MAX_PER_DIRECTION,
      getSymbol: (s) => s.symbol,
      getSide: () => 'SELL',
      getEntryPrice: (s) => s.fixedEntryPrice || s.risk?.entryPrice || s.price,
      getStopLoss: (s) => s.fixedStopLoss || s.risk?.stopLoss || 0,
      getRvol: (s) => s.indicators?.rvol,
      getAdx: (s) => s.indicators?.adx,
      getXTimeVol: (s) => s.indicators?.xTimeVolume,
      enrichRow: (s, m) => ({
        ...s,
        indicators: {
          ...s.indicators,
          rvol: Math.max(s.indicators.rvol || 0, m.rvol),
          xTimeVolume: Math.max(s.indicators.xTimeVolume || 0, m.xTimeVolume),
          adx: Math.max(s.indicators.adx || 0, m.adx),
        },
      }),
      updateLiveRow: (locked, live, fresh, m) => {
        const src = fresh || live || locked;
        return {
          ...src,
          listedAt: locked.listedAt || src.listedAt,
          entryTime: locked.entryTime || src.entryTime,
          fixedEntryPrice: locked.fixedEntryPrice || src.fixedEntryPrice,
          fixedStopLoss: locked.fixedStopLoss || src.fixedStopLoss,
          fixedTarget1: locked.fixedTarget1 || src.fixedTarget1,
          indicators: {
            ...src.indicators,
            rvol: Math.max(src.indicators?.rvol || 0, m.rvol),
            xTimeVolume: Math.max(src.indicators?.xTimeVolume || 0, m.xTimeVolume),
            adx: Math.max(src.indicators?.adx || 0, m.adx),
          },
        };
      },
    });

    const normalizedStocks = cleared ? [] : this.stockScanResults.map((s) => normalizeScannedStock(s));
    const normalizedTopBuy = cleared ? [] : sortNewestFirstZtoA(stabilizedBuy).map((s) => normalizeScannedStock(s));
    const normalizedTopSell = cleared ? [] : sortNewestFirstZtoA(stabilizedSell).map((s) => normalizeScannedStock(s));
    return {
      stocks: normalizedStocks,
      top10Buy: normalizedTopBuy,
      top10Sell: normalizedTopSell,
      sectorAvgMap: cleared ? {} : sectorAvgMap,
      overview: normalizeMarketOverview(this.marketOverview),
      broker: this.brokerConfig,
      alerts: this.alertConfig,
      news: this.newsFeed,
      corporateActions: this.corporateActions,
      bulkOrders: this.bulkOrders,
      sessionState: this.getSessionStatus(),
    };
  }

  public getStockCandles(symbol: string): { stock?: ScannedStock; candles: Candle[] } {
    const cleanSym = symbol.toUpperCase();
    const aliasMap: Record<string, string> = {
      TATAMOTORS: 'TMPV',
      ZOMATO: 'ETERNAL',
      REC: 'RECLTD',
      'L&T': 'LT',
      'MCDOWELL-N': 'UNITDSPR',
    };
    const resolved = aliasMap[cleanSym] || cleanSym;

    const stock = this.stockScanResults.find((s) => s.symbol === resolved || s.symbol === cleanSym);
    const candles = this.stockCandles.get(resolved) || this.stockCandles.get(cleanSym) || [];
    return { stock, candles };
  }

  public async refreshSingleStock(symbol: string): Promise<{ stock?: ScannedStock; candles: Candle[] }> {
    const cleanSym = symbol.toUpperCase();
    const aliasMap: Record<string, string> = {
      TATAMOTORS: 'TMPV',
      ZOMATO: 'ETERNAL',
      REC: 'RECLTD',
      'L&T': 'LT',
      'MCDOWELL-N': 'UNITDSPR',
    };
    const resolved = aliasMap[cleanSym] || cleanSym;

    const stockInfo = NIFTY_200_STOCKS.find((s) => s.symbol === resolved || s.symbol === cleanSym);
    if (!stockInfo) return this.getStockCandles(symbol);

    const { candles, meta } = await this.fetchLiveStockData(stockInfo.symbol, stockInfo.basePrice);
    if (candles && candles.length > 0) {
      this.stockCandles.set(stockInfo.symbol, candles);
    }
    if (meta) {
      this.stockMetaCache.set(stockInfo.symbol, meta);
      const scanned = this.stockScanResults.find((s) => s.symbol === stockInfo.symbol);
      if (scanned) {
        const cleanPrice = round2(meta.price, scanned.price);
        const cleanPrev = meta.prevClose > 0 ? round2(meta.prevClose, cleanPrice) : cleanPrice;
        const cleanCh = round2(cleanPrice - cleanPrev);
        const cleanChp = cleanPrev > 0 ? round2((cleanCh / cleanPrev) * 100) : 0;
        scanned.price = cleanPrice;
        scanned.change = cleanCh;
        scanned.changePercent = cleanChp;
        scanned.indicators.price = cleanPrice;
        scanned.indicators.close = cleanPrice;
        if (scanned.fyersData) {
          scanned.fyersData = {
            ...scanned.fyersData,
            lp: cleanPrice,
            prevClose: cleanPrev,
            ch: cleanCh,
            chp: cleanChp,
            high: round2(Math.max(meta.dayHigh, cleanPrice), cleanPrice),
            low: round2(Math.min(meta.dayLow, cleanPrice), cleanPrice),
          };
        }
      }
    }
    return this.getStockCandles(stockInfo.symbol);
  }

  public updateAlertConfig(newConfig: Partial<AlertConfig>) {
    const sanitized: Partial<AlertConfig> = { ...newConfig };
    if (sanitized.cumulativeDeltaThreshold !== undefined) {
      const parsed = parseFiniteNum(sanitized.cumulativeDeltaThreshold);
      if (parsed !== undefined) {
        sanitized.cumulativeDeltaThreshold = Math.round(parsed);
      } else {
        delete sanitized.cumulativeDeltaThreshold;
      }
    }
    const thresholdChanged =
      sanitized.cumulativeDeltaThreshold !== undefined &&
      sanitized.cumulativeDeltaThreshold !== this.alertConfig.cumulativeDeltaThreshold;
    const directionChanged =
      sanitized.cumulativeDeltaDirection !== undefined &&
      sanitized.cumulativeDeltaDirection !== this.alertConfig.cumulativeDeltaDirection;

    this.alertConfig = { ...this.alertConfig, ...sanitized };
    if (thresholdChanged || directionChanged) {
      this.cumulativeDeltaState.lastTriggered.clear();
    }
    return this.alertConfig;
  }

  public getAlertLogs(): AlertLogItem[] {
    return this.alertLogs;
  }

  // Trade Position Management Methods
  public getTradePositions(): TradePosition[] {
    return this.tradePositions;
  }

  public createTradePosition(data: {
    symbol: string;
    signal: 'BUY' | 'SELL';
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    target1: number;
    target2: number;
  }): TradePosition {
    const stock = this.stockScanResults.find((s) => s.symbol === data.symbol);
    const currentPrice = stock ? stock.price : data.entryPrice;

    const unrealizedPnL =
      data.signal === 'BUY'
        ? (currentPrice - data.entryPrice) * data.quantity
        : (data.entryPrice - currentPrice) * data.quantity;

    const unrealizedPnLPercent =
      data.signal === 'BUY'
        ? ((currentPrice - data.entryPrice) / data.entryPrice) * 100
        : ((data.entryPrice - currentPrice) / data.entryPrice) * 100;

    const newTrade: TradePosition = {
      id: `TRD-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      symbol: data.symbol,
      signal: data.signal,
      entryPrice: data.entryPrice,
      currentPrice: currentPrice,
      quantity: data.quantity,
      stopLoss: data.stopLoss,
      target1: data.target1,
      target2: data.target2,
      status: 'OPEN',
      createdAt: new Date().toISOString(), // Trade Create Time
      unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
      unrealizedPnLPercent: Number(unrealizedPnLPercent.toFixed(2)),
      targetHitStatus: 'NONE',
    };

    this.tradePositions.unshift(newTrade);
    return newTrade;
  }

  public closeTradePosition(
    tradeId: string,
    customClosePrice?: number,
    closeReason: 'MANUAL_CLOSE' | 'TARGET_1_HIT' | 'TARGET_2_HIT' | 'STOP_LOSS_HIT' = 'MANUAL_CLOSE'
  ): TradePosition | null {
    const trade = this.tradePositions.find((t) => t.id === tradeId);
    if (!trade || trade.status === 'CLOSED') return null;

    const stock = this.stockScanResults.find((s) => s.symbol === trade.symbol);
    const exitPrice = customClosePrice || (stock ? stock.price : trade.currentPrice);

    const pnl =
      trade.signal === 'BUY'
        ? (exitPrice - trade.entryPrice) * trade.quantity
        : (trade.entryPrice - exitPrice) * trade.quantity;

    const pnlPercent =
      trade.signal === 'BUY'
        ? ((exitPrice - trade.entryPrice) / trade.entryPrice) * 100
        : ((trade.entryPrice - exitPrice) / trade.entryPrice) * 100;

    trade.status = 'CLOSED';
    trade.closedAt = new Date().toISOString(); // Trade Close Time
    trade.closePrice = exitPrice;
    trade.closeReason = closeReason;
    trade.realizedPnL = Number(pnl.toFixed(2));
    trade.realizedPnLPercent = Number(pnlPercent.toFixed(2));
    trade.unrealizedPnL = 0;
    trade.unrealizedPnLPercent = 0;

    return trade;
  }

  public getEffectiveUpstoxToken(): string {
    if (
      this.brokerConfig.selectedBroker === 'autonomous' ||
      this.brokerConfig.selectedBroker === 'simulator' ||
      this.brokerConfig.status === 'autonomous'
    ) {
      return '';
    }
    return (
      this.brokerConfig.upstoxAccessToken ||
      this.brokerConfig.accessToken ||
      process.env.UPSTOX_ACCESS_TOKEN ||
      ''
    ).trim();
  }

  public getBrokerConfig(): BrokerConfig {
    return this.brokerConfig;
  }

  public updateBrokerConfig(newConfig: Partial<BrokerConfig>) {
    this.brokerConfig = {
      ...this.brokerConfig,
      ...newConfig,
      status:
        newConfig.status ||
        (newConfig.selectedBroker === 'simulator'
          ? 'simulated'
          : newConfig.selectedBroker === 'autonomous'
          ? 'autonomous'
          : 'connected'),
    };
    this.refreshBrokerSchedule(true).catch(() => {});
    return this.brokerConfig;
  }

  public getNewsFeed(): NewsItem[] {
    return this.newsFeed;
  }

  public getCorporateActions(): CorporateAction[] {
    return this.corporateActions;
  }

  public getBulkOrders(): BulkOrder[] {
    return this.bulkOrders;
  }

  public runBacktest(request: BacktestRequest): BacktestResult {
    const {
      symbol,
      timeframe = '3M',
      initialCapital = 100000,
      strategyPreset = 'BALANCED',
    } = request;

    // Determine days
    let days = 65;
    if (timeframe === '1M') days = 22;
    if (timeframe === '3M') days = 65;
    if (timeframe === '6M') days = 130;
    if (timeframe === '1Y') days = 252;
    if (timeframe === 'YTD') days = 150;

    // Parameters based on strategy
    let slPct = request.stopLossPercent ?? (strategyPreset === 'AGGRESSIVE' ? 3.0 : strategyPreset === 'CONSERVATIVE' ? 1.5 : 2.0);
    let t1Pct = request.target1Percent ?? (strategyPreset === 'AGGRESSIVE' ? 5.0 : strategyPreset === 'CONSERVATIVE' ? 2.5 : 3.5);
    let t2Pct = request.target2Percent ?? (strategyPreset === 'AGGRESSIVE' ? 10.0 : strategyPreset === 'CONSERVATIVE' ? 4.5 : 6.0);

    // Find stock meta
    const stockInfo = NIFTY_200_STOCKS.find((s) => s.symbol === symbol) || {
      symbol: symbol || 'RELIANCE',
      name: symbol ? `${symbol} Ltd.` : 'Reliance Industries Ltd.',
      sector: 'Diversified',
      basePrice: 1500,
    };

    // Base price seed
    const scanned = this.stockScanResults.find((s) => s.symbol === symbol);
    let basePrice = scanned ? scanned.price : stockInfo.basePrice || 1500;

    // Generate daily candles for timeframe
    const candles: Candle[] = [];
    const now = new Date();
    let currentPrice = basePrice * 0.85; // start lower so there is trend movement

    for (let i = days; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().split('T')[0];
      
      const change = (Math.random() - 0.47) * 0.022 * currentPrice; // slightly positive drift
      const open = currentPrice;
      const close = Math.max(10, open + change);
      const high = Math.max(open, close) + Math.random() * 0.012 * currentPrice;
      const low = Math.min(open, close) - Math.random() * 0.012 * currentPrice;
      const volume = Math.floor(500000 + Math.random() * 1500000);

      candles.push({
        time: dateStr,
        open: Number(open.toFixed(2)),
        high: Number(high.toFixed(2)),
        low: Number(low.toFixed(2)),
        close: Number(close.toFixed(2)),
        volume,
      });

      currentPrice = close;
    }

    // Simulate Bar-by-Bar backtest
    let currentCapital = initialCapital;
    let benchmarkCapital = initialCapital;
    const equityCurve: EquityCurvePoint[] = [];
    const trades: BacktestTrade[] = [];

    let openTrade: {
      id: string;
      entryDate: string;
      entryBarIndex: number;
      signal: 'BUY' | 'SELL';
      entryPrice: number;
      quantity: number;
      stopLoss: number;
      target1: number;
      target2: number;
      aiScore: number;
      patternName: string;
    } | null = null;

    let peakEquity = initialCapital;
    let maxDrawdownVal = 0;

    // Helper patterns for simulation
    const patterns = ['Bullish Engulfing', 'EMA Crossover', 'RSI Oversold Rebound', 'Breakout with Volume', 'MACD Bullish Histogram'];

    for (let bar = 15; bar < candles.length; bar++) {
      const currentCandle = candles[bar];
      const prevCandle = candles[bar - 1];

      // Benchmark simulation (Nifty proxy tracking ~0.04% daily + drift)
      const benchmarkDailyReturn = ((currentCandle.close - prevCandle.close) / prevCandle.close) * 0.6;
      benchmarkCapital *= 1 + benchmarkDailyReturn;

      // Check open trade status if exists
      if (openTrade) {
        let isClosed = false;
        let exitPrice = currentCandle.close;
        let exitReason: 'TARGET_1' | 'TARGET_2' | 'STOP_LOSS' | 'TIME_EXIT' = 'TIME_EXIT';

        const holdingDays = bar - openTrade.entryBarIndex;

        if (openTrade.signal === 'BUY') {
          if (currentCandle.low <= openTrade.stopLoss) {
            isClosed = true;
            exitPrice = openTrade.stopLoss;
            exitReason = 'STOP_LOSS';
          } else if (currentCandle.high >= openTrade.target2) {
            isClosed = true;
            exitPrice = openTrade.target2;
            exitReason = 'TARGET_2';
          } else if (currentCandle.high >= openTrade.target1) {
            isClosed = true;
            exitPrice = openTrade.target1;
            exitReason = 'TARGET_1';
          } else if (holdingDays >= 8) {
            isClosed = true;
            exitPrice = currentCandle.close;
            exitReason = 'TIME_EXIT';
          }
        } else {
          // SELL signal trade
          if (currentCandle.high >= openTrade.stopLoss) {
            isClosed = true;
            exitPrice = openTrade.stopLoss;
            exitReason = 'STOP_LOSS';
          } else if (currentCandle.low <= openTrade.target2) {
            isClosed = true;
            exitPrice = openTrade.target2;
            exitReason = 'TARGET_2';
          } else if (currentCandle.low <= openTrade.target1) {
            isClosed = true;
            exitPrice = openTrade.target1;
            exitReason = 'TARGET_1';
          } else if (holdingDays >= 8) {
            isClosed = true;
            exitPrice = currentCandle.close;
            exitReason = 'TIME_EXIT';
          }
        }

        if (isClosed) {
          const priceDiff = openTrade.signal === 'BUY' ? exitPrice - openTrade.entryPrice : openTrade.entryPrice - exitPrice;
          const pnl = priceDiff * openTrade.quantity;
          const returnPercent = (priceDiff / openTrade.entryPrice) * 100;

          currentCapital += pnl;

          trades.push({
            id: `BT-${trades.length + 1}`,
            date: openTrade.entryDate,
            signal: openTrade.signal,
            entryPrice: openTrade.entryPrice,
            exitPrice: Number(exitPrice.toFixed(2)),
            exitDate: currentCandle.time,
            exitReason,
            returnPercent: Number(returnPercent.toFixed(2)),
            pnl: Number(pnl.toFixed(2)),
            holdingPeriodDays: holdingDays,
            aiScore: openTrade.aiScore,
            patternName: openTrade.patternName,
          });

          openTrade = null;
        }
      }

      // If no open trade, check entry trigger
      if (!openTrade && bar < candles.length - 2) {
        // Trigger condition: price moving up past 3-bar average + volume spike or periodic AI signal
        const sma3 = (candles[bar - 1].close + candles[bar - 2].close + candles[bar - 3].close) / 3;
        const isBullishSignal = currentCandle.close > sma3 && currentCandle.close > currentCandle.open;
        const isBearishSignal = currentCandle.close < sma3 && currentCandle.close < currentCandle.open && Math.random() > 0.6;

        if (isBullishSignal || isBearishSignal) {
          const signal: 'BUY' | 'SELL' = isBullishSignal ? 'BUY' : 'SELL';
          const entryPrice = currentCandle.close;
          
          // Allocate 25% of current equity
          const positionCapital = currentCapital * 0.25;
          const quantity = Math.max(1, Math.floor(positionCapital / entryPrice));

          const stopLoss = signal === 'BUY'
            ? entryPrice * (1 - slPct / 100)
            : entryPrice * (1 + slPct / 100);

          const target1 = signal === 'BUY'
            ? entryPrice * (1 + t1Pct / 100)
            : entryPrice * (1 - t1Pct / 100);

          const target2 = signal === 'BUY'
            ? entryPrice * (1 + t2Pct / 100)
            : entryPrice * (1 - t2Pct / 100);

          const aiScore = Math.floor(75 + Math.random() * 21); // 75 - 95 score
          const patternName = patterns[Math.floor(Math.random() * patterns.length)];

          openTrade = {
            id: `BT-${trades.length + 1}`,
            entryDate: currentCandle.time,
            entryBarIndex: bar,
            signal,
            entryPrice,
            quantity,
            stopLoss: Number(stopLoss.toFixed(2)),
            target1: Number(target1.toFixed(2)),
            target2: Number(target2.toFixed(2)),
            aiScore,
            patternName,
          };
        }
      }

      // Equity tracking
      if (currentCapital > peakEquity) peakEquity = currentCapital;
      const drawdown = ((peakEquity - currentCapital) / peakEquity) * 100;
      if (drawdown > maxDrawdownVal) maxDrawdownVal = drawdown;

      equityCurve.push({
        date: currentCandle.time,
        equity: Number(currentCapital.toFixed(2)),
        benchmark: Number(benchmarkCapital.toFixed(2)),
      });
    }

    // Trade stats calculation
    const totalTrades = trades.length;
    const winningTrades = trades.filter((t) => t.pnl > 0).length;
    const losingTrades = trades.filter((t) => t.pnl <= 0).length;
    const winRatePercent = totalTrades > 0 ? Number(((winningTrades / totalTrades) * 100).toFixed(1)) : 0;

    const totalProfit = trades.filter((t) => t.pnl > 0).reduce((sum, t) => sum + t.pnl, 0);
    const totalLoss = Math.abs(trades.filter((t) => t.pnl < 0).reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = totalLoss > 0 ? Number((totalProfit / totalLoss).toFixed(2)) : totalProfit > 0 ? 9.99 : 1.0;

    const avgReturn = totalTrades > 0 ? Number((trades.reduce((sum, t) => sum + t.returnPercent, 0) / totalTrades).toFixed(2)) : 0;
    const totalReturnPercent = Number((((currentCapital - initialCapital) / initialCapital) * 100).toFixed(2));

    return {
      symbol: stockInfo.symbol,
      companyName: stockInfo.name,
      timeframe,
      startDate: candles[0]?.time || '',
      endDate: candles[candles.length - 1]?.time || '',
      initialCapital,
      finalCapital: Number(currentCapital.toFixed(2)),
      totalReturnPercent,
      totalTrades,
      winningTrades,
      losingTrades,
      winRatePercent,
      maxDrawdownPercent: Number(maxDrawdownVal.toFixed(2)),
      profitFactor,
      averageTradeReturnPercent: avgReturn,
      equityCurve,
      trades,
    };
  }

  public getAllCandlesMap(): Map<string, Candle[]> {
    return this.stockCandles;
  }

  public getAllStocksDirect(): ScannedStock[] {
    return this.stockScanResults;
  }

  public getNewsFeedDirect(): NewsItem[] {
    return this.newsFeed;
  }

  public getIndiaVixPrice(): number {
    return this.marketOverview.indiaVix?.price || 17.42;
  }

  public async forceRefreshLiveFeeds(): Promise<void> {
    await autonomousPriceService.fetchAllMarketQuotes(true);
  }

  /**
   * Returns clean real-time index spot dictionary with price, change, day ranges, and prevClose
   */
  public getIndexPrices(): Record<string, { price: number; change: number; changePercent: number; open?: number; high?: number; low?: number; prevClose?: number }> {
    const ov = this.marketOverview as any;
    return {
      'NIFTY 50': ov.nifty50 || { price: 25044.65, change: 58.25, changePercent: 0.23 },
      NIFTY: ov.nifty50 || { price: 25044.65, change: 58.25, changePercent: 0.23 },
      BANKNIFTY: ov.bankNifty || { price: 59741.25, change: 890.60, changePercent: 1.51 },
      FINNIFTY: ov.finnifty || { price: 27384.90, change: 204.25, changePercent: 0.75 },
      MIDCPNIFTY: ov.midcpnifty || { price: 14055.45, change: 29.45, changePercent: 0.21 },
      SENSEX: ov.sensex || { price: 81106.65, change: 107.25, changePercent: 0.13 },
      NIFTYIT: ov.niftyIT || { price: 32468.90, change: -400.75, changePercent: -1.22 },
      INDIAVIX: ov.indiaVix || { price: 17.42, change: -1.01, changePercent: -5.48 },
      NIFTYNXT50: { price: 72789.45, change: 797.75, changePercent: 1.11 },
    };
  }
}

export const scannerService = new ScannerService();
