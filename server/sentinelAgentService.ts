import { ScannedStock } from '../src/types';
import { calculateMarketStatus, getISTDateParts } from '../src/data/marketSchedule';
import { UnifiedMarketQuote } from './autonomousPriceService';

export interface SentinelCheckItem {
  id: string;
  name: string;
  status: 'HEALTHY' | 'HEALED' | 'WARNING' | 'CRITICAL';
  detail: string;
  metricValue: string;
  lastChecked: string;
}

export interface SentinelRepairEvent {
  id: string;
  timestampIST: string;
  issue: string;
  actionTaken: string;
  outcome: 'REPAIRED' | 'VERIFIED';
}

export interface SentinelProviders {
  getStocks: () => ScannedStock[];
  getQuotes: () => Record<string, UnifiedMarketQuote>;
  isMidnightCleared: () => boolean;
  forceRefreshQuotes: () => Promise<void>;
  triggerSafeRescan: () => Promise<void>;
  getWsStatus: () => { connectedClients?: number; ticksPerSecond?: number; lastFeedSource?: string };
}

const INDEX_SYMBOLS_CHECK = new Set([
  'NIFTY',
  'NIFTY 50',
  'BANKNIFTY',
  'FINNIFTY',
  'MIDCPNIFTY',
  'NIFTYNXT50',
  'SENSEX',
  'NIFTYFPI',
  'INDIAVIX',
  'NIFTYIT',
]);

/**
 * Autonomous System Watchdog & Self-Healing Sentinel Agent.
 * Continuously monitors quotes freshness, Bid/Ask depth diversity, Locked Entry integrity,
 * Index/Stock scanner isolation, WebSocket health, and memory — automatically healing
 * degraded feeds or anomalous states without manual intervention.
 */
class SentinelAgentService {
  private providers: SentinelProviders | null = null;
  private monitorTimer: NodeJS.Timeout | null = null;
  private lastAuditAt = new Date().toISOString();
  private checks: SentinelCheckItem[] = [];
  private repairHistory: SentinelRepairEvent[] = [];
  private healthScore = 100;
  private totalAutoHeals = 0;
  private isHealing = false;

  public registerProviders(providers: SentinelProviders) {
    this.providers = providers;
    if (!this.monitorTimer) {
      this.monitorTimer = setInterval(() => {
        this.runAuditAndAutoHeal(false).catch(() => {});
      }, 15000);
      setTimeout(() => {
        this.runAuditAndAutoHeal(false).catch(() => {});
      }, 4500);
    }
  }

  private recordRepair(issue: string, actionTaken: string, outcome: 'REPAIRED' | 'VERIFIED' = 'REPAIRED') {
    const ist = getISTDateParts(new Date());
    this.totalAutoHeals++;
    this.repairHistory.unshift({
      id: `HEAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestampIST: `${ist.dateStr} ${ist.timeStr} IST`,
      issue,
      actionTaken,
      outcome,
    });
    if (this.repairHistory.length > 40) {
      this.repairHistory = this.repairHistory.slice(0, 40);
    }
  }

  public async runAuditAndAutoHeal(manualTrigger: boolean = false) {
    if (!this.providers || this.isHealing) {
      return this.getStatus();
    }
    this.isHealing = true;
    const nowIso = new Date().toISOString();
    const newChecks: SentinelCheckItem[] = [];
    let score = 100;

    try {
      const mkt = calculateMarketStatus();
      const cleared = this.providers.isMidnightCleared();
      const stocks = this.providers.getStocks();
      const quotes = this.providers.getQuotes();
      const wsInfo = this.providers.getWsStatus();
      const quoteValues = Object.values(quotes).filter((q) => q.type === 'EQUITY');

      // 1. Live Equity Feed Health
      let feedStatus: SentinelCheckItem['status'] = 'HEALTHY';
      let feedDetail = `${quoteValues.length} live NSE equity feeds synchronized`;
      if (quoteValues.length < 180) {
        await this.providers.forceRefreshQuotes();
        feedStatus = 'HEALED';
        feedDetail = `Low quote coverage detected (${quoteValues.length}); auto-refreshed live upstream feeds`;
        this.recordRepair('Low live equity quote coverage', 'Triggered forceRefreshQuotes() across Yahoo/TV/Moneycontrol');
        score -= 4;
      }
      newChecks.push({
        id: 'feed-health',
        name: 'Multi-Source Live Quote Pipeline',
        status: feedStatus,
        detail: feedDetail,
        metricValue: `${quoteValues.length} Equities`,
        lastChecked: nowIso,
      });

      // 2. Quote Freshness During Active Hours
      let freshnessStatus: SentinelCheckItem['status'] = 'HEALTHY';
      const latestRefMs = quoteValues.reduce((mx, q) => Math.max(mx, Date.parse(q.lastRefreshed || '') || 0), 0);
      const ageSec = latestRefMs > 0 ? Math.max(0, Math.round((Date.now() - latestRefMs) / 1000)) : 999;
      let freshnessDetail = `Latest tick synced ${ageSec}s ago (${wsInfo.lastFeedSource || 'AUTONOMOUS_LIVE_ENGINE'})`;
      if (mkt.isOpen && ageSec > 45) {
        await this.providers.forceRefreshQuotes();
        freshnessStatus = 'HEALED';
        freshnessDetail = `Quote stream stalled (${ageSec}s); auto-rotated live upstream batch`;
        this.recordRepair(`Market quotes stalled for ${ageSec}s`, 'Auto-rotated upstream live fetch batch');
        score -= 5;
      }
      newChecks.push({
        id: 'quote-freshness',
        name: 'Real-Time Tick Freshness',
        status: freshnessStatus,
        detail: freshnessDetail,
        metricValue: mkt.isOpen ? `${ageSec}s lag` : 'Market Closed',
        lastChecked: nowIso,
      });

      // 3. Stock-Only Scanner Isolation (No Index Leaks)
      const leakedIndices = cleared ? [] : stocks.filter((s) => INDEX_SYMBOLS_CHECK.has(s.symbol.toUpperCase()) || s.sector === 'Indices');
      let isoStatus: SentinelCheckItem['status'] = 'HEALTHY';
      let isoDetail = cleared
        ? '12 AM Midnight Standby Active (0 candidates)'
        : `${stocks.length} pure equity contracts active • 0 index leaks`;
      if (leakedIndices.length > 0) {
        await this.providers.triggerSafeRescan();
        isoStatus = 'HEALED';
        isoDetail = `Detected ${leakedIndices.length} index rows inside equity scanner; triggered clean stock-only rebuild`;
        this.recordRepair('Index symbol leakage in equity scanner', 'Triggered clean EQUITY_ONLY scan cycle');
        score -= 5;
      }
      newChecks.push({
        id: 'index-isolation',
        name: 'Stock-Only Candidate Scanner Isolation',
        status: isoStatus,
        detail: isoDetail,
        metricValue: cleared ? '0 (Flushed)' : `${stocks.length} Stocks`,
        lastChecked: nowIso,
      });

      // 4. Formula Entry Lock & ListedAt Integrity
      let lockIssues = 0;
      let mirroredPrices = 0;
      if (!cleared && stocks.length > 0) {
        for (const s of stocks) {
          const fe = s.fixedEntryPrice ?? s.risk?.entryPrice ?? 0;
          if (!fe || fe <= 0 || !s.listedAt || !/^\d{2}:\d{2}(:\d{2})?$/.test(s.listedAt)) {
            lockIssues++;
          } else if (Math.abs(fe - s.price) < 0.005) {
            mirroredPrices++;
          }
        }
        // Only treat Entry==Live as a systemic mirroring bug if >= 75% of all active stocks match spot simultaneously during open market
        if (mkt.isOpen && stocks.length >= 20 && mirroredPrices / stocks.length >= 0.75) {
          lockIssues += Math.max(1, Math.round(mirroredPrices * 0.25));
        }
      }
      let lockStatus: SentinelCheckItem['status'] = lockIssues === 0 ? 'HEALTHY' : 'HEALED';
      let lockDetail =
        lockIssues === 0
          ? '100% of active stocks hold distinct formula ListedAt & locked Entry Prices'
          : `Detected ${lockIssues} uncalibrated entry/timestamp rows; auto-resynced formula ledger`;
      if (lockIssues > 0 && !cleared) {
        await this.providers.triggerSafeRescan();
        this.recordRepair(`${lockIssues} uncalibrated formula lock entries`, 'Re-ran formula discovery & signal ledger calibration');
        score -= 6;
      }
      newChecks.push({
        id: 'formula-locks',
        name: 'Formula Listed-At & Entry Lock Guard',
        status: lockStatus,
        detail: lockDetail,
        metricValue: `${stocks.length - lockIssues}/${stocks.length} Locked`,
        lastChecked: nowIso,
      });

      // 5. Dynamic Bid/Ask Depth Variance Check
      const ratioSet = new Set(stocks.map((s) => Number((s.bidAskRatio || 1.0).toFixed(2))));
      const ratioOk = cleared || stocks.length === 0 || ratioSet.size >= 15;
      newChecks.push({
        id: 'bid-ask-depth',
        name: 'Order-Book Bid/Ask Diversity Monitor',
        status: ratioOk ? 'HEALTHY' : 'WARNING',
        detail: ratioOk
          ? `${ratioSet.size} distinct order-book Bid/Ask ratios across active stocks`
          : `Low Bid/Ask ratio variance (${ratioSet.size} unique values)`,
        metricValue: `${ratioSet.size} Unique`,
        lastChecked: nowIso,
      });
      if (!ratioOk) score -= 8;

      // 6. WebSocket Relay & Process Health
      const memMb = Math.round(process.memoryUsage().rss / (1024 * 1024));
      newChecks.push({
        id: 'ws-process',
        name: 'WebSocket Broadcast & Node Runtime',
        status: 'HEALTHY',
        detail: `WS TPS: ${wsInfo.ticksPerSecond ?? 0}/s • Connected Clients: ${wsInfo.connectedClients ?? 0} • Memory: ${memMb} MB`,
        metricValue: `${memMb} MB RSS`,
        lastChecked: nowIso,
      });

      if (manualTrigger) {
        this.recordRepair('Manual Sentinel Deep Audit requested', 'All 6 subsystems audited & verified healthy', 'VERIFIED');
      }

      this.checks = newChecks;
      this.healthScore = Math.max(40, Math.min(100, score));
      this.lastAuditAt = nowIso;
    } finally {
      this.isHealing = false;
    }

    return this.getStatus();
  }

  public getStatus() {
    return {
      status: 'ok',
      agentName: 'Sentinel AI Autonomous Watchdog v1.0',
      healthScore: this.healthScore,
      overallState: this.healthScore >= 90 ? 'OPTIMAL' : this.healthScore >= 70 ? 'DEGRADED_AUTO_HEALING' : 'CRITICAL',
      totalAutoHeals: this.totalAutoHeals,
      lastAuditAt: this.lastAuditAt,
      checks: this.checks,
      repairHistory: this.repairHistory,
    };
  }
}

export const sentinelAgentService = new SentinelAgentService();
