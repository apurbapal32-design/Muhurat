import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  BarChart3,
  Bell,
  Bot,
  Brain,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Coins,
  Compass,
  Copy,
  Cpu,
  Crosshair,
  DollarSign,
  Download,
  ExternalLink,
  Eye,
  Flame,
  Key,
  Layers,
  Percent,
  Play,
  Plus,
  Radio,
  RefreshCw,
  Rocket,
  Scale,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Volume2,
  Wifi,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import {
  FyersQuote,
  IndexCandidateStrike,
  IndexDecisionType,
  IndexIntelligenceData,
  IndexOptionAlert,
  IndexPaperTrade,
  IndexStrikeBattlefieldItem,
  IndexStrikeMoneyness,
  SupportedIndexSymbol,
  FyersWsTick,
} from '../types';
import {
  INDEX_CONFIGS,
  generateAllIndicesIntelligence,
  generateIndexIntelligence,
} from '../utils/indexOptionsEngine';
import {
  evaluateActiveIndexAlerts,
  getIndexOptionAlerts,
  playIndexAlertChime,
} from '../utils/indexOptionsAlertEngine';
import {
  validateAndNormalizePrice,
  validateIndexSpotFeed,
  validateOptionStrikeFeed,
} from '../utils/priceAlerts';
import { fetchLiveIndexQuotes, testFyersCredentials } from '../utils/fyersHelpers';
import { getMarketHoursDiagnostics, MarketHoursStatus, isMarketHours } from '../utils/marketHours';
import { calculateMarketStatus } from '../data/marketSchedule';
import { useFyersIndexWebSocket } from '../hooks/useFyersIndexWebSocket';
import { IndexOptionAlertModal } from './IndexOptionAlertModal';
import { IndexOptionAlertsHub } from './IndexOptionAlertsHub';
import { IndexAlertToastBanner } from './IndexAlertToastBanner';
import { InstitutionalWritingShiftMonitor } from './InstitutionalWritingShiftMonitor';
import { InstitutionalPositioningModule } from './InstitutionalPositioningModule';
import { IndexMarketHoursAuditModal } from './IndexMarketHoursAuditModal';
import { FyersWebSocketTelemetryModal } from './FyersWebSocketTelemetryModal';
import { V9VegaGreeksPipelineView } from './V9VegaGreeksPipelineView';

interface IndexOptionsScannerViewProps {
  onBackToScanner?: () => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const IndexOptionsScannerView: React.FC<IndexOptionsScannerViewProps> = ({
  onBackToScanner,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';

  // All Indices Data Cache
  const [indicesData, setIndicesData] = useState<
    Record<SupportedIndexSymbol, IndexIntelligenceData>
  >(() => generateAllIndicesIntelligence());

  const [selectedIndex, setSelectedIndex] = useState<SupportedIndexSymbol>('NIFTY 50');
  const [selectedSubTab, setSelectedSubTab] = useState<
    'v9-engine' | 'battlefield' | 'strikes' | 'alerts' | 'technicals' | 'institutional' | 'trades'
  >('battlefield');

  // Filter option chain view
  const [chainFilter, setChainFilter] = useState<'ALL' | 'NEAR_ATM' | 'HIGH_OI'>('NEAR_ATM');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(true);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number>(2500);

  // Fyers API Live Status & Configuration
  const [fyersAppId, setFyersAppId] = useState<string>(() => localStorage.getItem('fyers_app_id') || '');
  const [fyersAccessToken, setFyersAccessToken] = useState<string>(() => localStorage.getItem('fyers_access_token') || '');
  const [isFyersModalOpen, setIsFyersModalOpen] = useState<boolean>(false);
  const [fyersLiveStatus, setFyersLiveStatus] = useState<
    'LIVE_V3_FEED' | 'SIMULATED' | 'MARKET_CLOSED_EOD' | 'CLOSED_SETTLEMENT' | 'DISCONNECTED' | 'CONNECTING'
  >('LIVE_V3_FEED');
  const [lastSyncTime, setLastSyncTime] = useState<string>(new Date().toLocaleTimeString('en-IN'));
  const [fyersTesting, setFyersTesting] = useState<boolean>(false);
  const [fyersTestResult, setFyersTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedSymbol, setCopiedSymbol] = useState<string | null>(null);
  const [orderStatusToast, setOrderStatusToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Spot Price Flash Animation State
  const [priceFlash, setPriceFlash] = useState<'up' | 'down' | null>(null);
  const [prevPrice, setPrevPrice] = useState<number>(() => indicesData[selectedIndex]?.spotPrice || 24275.0);

  // Market Hours & Integrity Audit State
  const [marketDiagnostics, setMarketDiagnostics] = useState<MarketHoursStatus>(() => getMarketHoursDiagnostics());
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);

  // Dedicated Fyers WebSocket State
  const [isWsModalOpen, setIsWsModalOpen] = useState<boolean>(false);
  const [wsStreamEnabled, setWsStreamEnabled] = useState<boolean>(true);

  // Index Alerts State
  const [alerts, setAlerts] = useState<IndexOptionAlert[]>(() => getIndexOptionAlerts());
  const [isAlertModalOpen, setIsAlertModalOpen] = useState<boolean>(false);
  const [activeToastAlert, setActiveToastAlert] = useState<IndexOptionAlert | null>(null);

  // Pre-fill parameters when opening alert modal from a specific strike
  const [alertModalInitialConfig, setAlertModalInitialConfig] = useState<{
    indexSymbol: SupportedIndexSymbol;
    moneyness: IndexStrikeMoneyness;
    optionType: 'CE' | 'PE';
    action: 'BUY' | 'SELL';
    strike?: number;
  }>({
    indexSymbol: 'NIFTY 50',
    moneyness: 'SLIGHT_ITM',
    optionType: 'CE',
    action: 'BUY',
  });

  // Active Paper Trades
  const [paperTrades, setPaperTrades] = useState<IndexPaperTrade[]>(() => {
    const saved = localStorage.getItem('index_paper_trades');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  // Modal for placing trade
  const [tradeModalStrike, setTradeModalStrike] = useState<IndexCandidateStrike | null>(null);
  const [tradeLots, setTradeLots] = useState<number>(2);

  // Current active index data
  const currentData: IndexIntelligenceData = indicesData[selectedIndex];

  // Save paper trades to localStorage
  useEffect(() => {
    localStorage.setItem('index_paper_trades', JSON.stringify(paperTrades));
  }, [paperTrades]);

  // Handle Copy Symbol to Clipboard
  const handleCopySymbol = (sym: string) => {
    navigator.clipboard.writeText(sym);
    setCopiedSymbol(sym);
    setTimeout(() => setCopiedSymbol(null), 2000);
  };

  // Dispatch Fyers Order via Server API
  const handleExecuteFyersOrder = async (candidate: IndexCandidateStrike, lots: number = 2) => {
    const config = INDEX_CONFIGS[selectedIndex];
    const qty = lots * (config?.lotSize || 25);
    try {
      const response = await fetch('/api/upstox/place-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: candidate.fyersSymbol,
          qty,
          side: candidate.action === 'BUY' ? 'BUY' : 'SELL',
          productType: 'INTRADAY',
          limitPrice: candidate.entryPrice,
        }),
      });
      const data = await response.json();
      if (data.status === 'success') {
        setOrderStatusToast({
          message: data.message || `Order dispatched for ${candidate.fyersSymbol}`,
          type: 'success',
        });
        // Also record in paper trades list
        handleExecutePaperTrade(candidate, lots);
      } else {
        setOrderStatusToast({
          message: data.error || 'Failed to place Fyers order',
          type: 'error',
        });
      }
    } catch (err: any) {
      setOrderStatusToast({
        message: err.message || 'Error executing order',
        type: 'error',
      });
    }
    setTimeout(() => setOrderStatusToast(null), 4000);
  };

  // Test Fyers API Credentials
  const handleTestFyers = async () => {
    if (!fyersAppId || !fyersAccessToken) {
      setFyersTestResult({
        success: false,
        message: 'Please fill in both Fyers App ID and Access Token',
      });
      return;
    }
    setFyersTesting(true);
    setFyersTestResult(null);
    try {
      const result = await testFyersCredentials(fyersAppId, fyersAccessToken);
      setFyersTestResult(result);
      if (result.success) {
        localStorage.setItem('fyers_app_id', fyersAppId);
        localStorage.setItem('fyers_access_token', fyersAccessToken);
        setFyersLiveStatus('LIVE_V3_FEED');
        // Trigger immediate fetch with new token
        fetchLiveQuotes();
      }
    } catch (err: any) {
      setFyersTestResult({
        success: false,
        message: err.message || 'Connection test failed',
      });
    } finally {
      setFyersTesting(false);
    }
  };

  // Dedicated Real-Time WebSocket Tick Handler (Bypasses Polling Bottleneck)
  const handleWebSocketTick = useCallback(
    (tick: FyersWsTick) => {
      setIndicesData((prev) => {
        let targetIndexKey: SupportedIndexSymbol | null = null;
        const isStrictSpotTick =
          tick.isSpot === true &&
          !tick.isOption &&
          !tick.symbol.includes('CE') &&
          !tick.symbol.includes('PE') &&
          !tick.symbol.includes('FUT');

        if (isStrictSpotTick) {
          if (
            tick.symbol === 'NSE:NIFTY50-INDEX' ||
            tick.symbol === 'NSE:NIFTY-INDEX' ||
            tick.cleanSymbol === 'NIFTY 50' ||
            tick.indexSymbol === 'NIFTY 50'
          )
            targetIndexKey = 'NIFTY 50';
          else if (
            tick.symbol === 'NSE:NIFTYBANK-INDEX' ||
            tick.cleanSymbol === 'BANKNIFTY' ||
            tick.indexSymbol === 'BANKNIFTY'
          )
            targetIndexKey = 'BANKNIFTY';
          else if (
            tick.symbol === 'NSE:FINNIFTY-INDEX' ||
            tick.cleanSymbol === 'FINNIFTY' ||
            tick.indexSymbol === 'FINNIFTY'
          )
            targetIndexKey = 'FINNIFTY';
          else if (
            tick.symbol === 'NSE:MIDCPNIFTY-INDEX' ||
            tick.symbol === 'NSE:NIFTYMIDSELECT-INDEX' ||
            tick.cleanSymbol === 'MIDCPNIFTY' ||
            tick.indexSymbol === 'MIDCPNIFTY'
          )
            targetIndexKey = 'MIDCPNIFTY';
          else if (
            tick.symbol === 'BSE:SENSEX-INDEX' ||
            tick.symbol === 'BSE:SENSEX30-INDEX' ||
            tick.cleanSymbol === 'SENSEX' ||
            tick.indexSymbol === 'SENSEX'
          )
            targetIndexKey = 'SENSEX';
          else if (tick.indexSymbol && !tick.isOption) targetIndexKey = tick.indexSymbol;
        }

        // 1. Index Spot Tick
        if (targetIndexKey && prev[targetIndexKey]) {
          const existing = prev[targetIndexKey];

          // Reconcile and normalize tick using robust multi-source feed validator
          const spotReconciliation = validateIndexSpotFeed(
            targetIndexKey,
            tick,
            undefined,
            existing.spotPrice
          );

          if (!spotReconciliation.isValid) {
            console.warn(
              `[Tick Stream Reconciliation Rejected] ${targetIndexKey}:`,
              spotReconciliation.anomalyReason
            );
            return prev;
          }

          const oldPrice = existing.spotPrice;
          const newPrice = spotReconciliation.normalizedPrice;

          // Instant price flash on tick
          if (targetIndexKey === selectedIndex && Math.abs(newPrice - oldPrice) > 0.01) {
            setPriceFlash(newPrice > oldPrice ? 'up' : 'down');
            setTimeout(() => setPriceFlash(null), 600);
          }

          const currentMarketStatus = calculateMarketStatus();
          const updatedIndex = generateIndexIntelligence(targetIndexKey, {
            spotPrice: newPrice,
            change: spotReconciliation.change,
            changePercent: spotReconciliation.changePercent,
            dayHigh: tick.high ? Math.max(tick.high, existing.dayHigh) : existing.dayHigh,
            dayLow: tick.low ? Math.min(tick.low, existing.dayLow) : existing.dayLow,
            ltt: tick.ltt || new Date().toLocaleTimeString('en-IN'),
            fyersStatus: 'LIVE_V3_FEED',
            isMarketOpen: currentMarketStatus.isOpen,
          });

          const next = {
            ...prev,
            [targetIndexKey]: updatedIndex,
          };

          // Instant Alert Evaluation
          const { updatedAlerts, newlyTriggeredAlerts } = evaluateActiveIndexAlerts(next);
          if (newlyTriggeredAlerts.length > 0) {
            setAlerts(updatedAlerts);
            setActiveToastAlert(newlyTriggeredAlerts[0]);
          }

          return next;
        }

        // 2. Option Strike Tick
        const isOptionTick =
          tick.isOption === true ||
          tick.symbol.includes('CE') ||
          tick.symbol.includes('PE') ||
          (tick.strike !== undefined && tick.optionType !== undefined);

        if (isOptionTick) {
          const targetIndex: SupportedIndexSymbol = tick.indexSymbol || selectedIndex;
          const currentIndexData = prev[targetIndex];

          if (currentIndexData) {
            let strikeUpdated = false;
            const updatedCandidateStrikes = currentIndexData.candidateStrikes.map((candidate) => {
              const isMatch =
                (candidate.fyersSymbol && candidate.fyersSymbol === tick.symbol) ||
                (tick.strike === candidate.strike && tick.optionType === candidate.optionType);

              if (isMatch) {
                // Validate and normalize option strike feed
                const optionReconciliation = validateOptionStrikeFeed(
                  candidate.fyersSymbol || tick.symbol,
                  candidate.strike,
                  candidate.optionType,
                  currentIndexData.spotPrice,
                  tick,
                  undefined,
                  candidate.premiumLtp
                );

                if (!optionReconciliation.isValid) {
                  return candidate;
                }

                strikeUpdated = true;
                const newLtp = optionReconciliation.normalizedPrice;
                const slPct = candidate.stopLossPercent || 28;
                const newSl = Number((newLtp * (1 - slPct / 100)).toFixed(2));
                const newT1 = Number((newLtp * (1 + (slPct * 1.5) / 100)).toFixed(2));
                const newT2 = Number((newLtp * (1 + (slPct * 2.5) / 100)).toFixed(2));
                const newT3 = Number((newLtp * (1 + (slPct * 4.0) / 100)).toFixed(2));

                return {
                  ...candidate,
                  premiumLtp: newLtp,
                  entryPrice: newLtp,
                  stopLoss: newSl,
                  stopLossPoints: Number((newLtp - newSl).toFixed(2)),
                  target1: newT1,
                  target2: newT2,
                  target3: newT3,
                };
              }
              return candidate;
            });

            // Also update battlefield strikes option chain
            const updatedBattlefield = currentIndexData.battlefieldStrikes.map((s) => {
              if (tick.strike && s.strike === tick.strike) {
                if (tick.optionType === 'CE' || tick.symbol.includes('CE')) {
                  const optRec = validateOptionStrikeFeed(
                    tick.symbol,
                    s.strike,
                    'CE',
                    currentIndexData.spotPrice,
                    tick,
                    undefined,
                    s.callLtp
                  );
                  if (optRec.isValid) {
                    const diff = Number((optRec.normalizedPrice - s.callLtp).toFixed(2));
                    const chPct = s.callLtp > 0 ? Number(((diff / s.callLtp) * 100).toFixed(1)) : 0;
                    return {
                      ...s,
                      callLtp: optRec.normalizedPrice,
                      callChange: diff,
                      callChangePercent: chPct,
                      callOiLakhs: tick.oi ? Number((tick.oi / 100000).toFixed(1)) : s.callOiLakhs,
                    };
                  }
                } else if (tick.optionType === 'PE' || tick.symbol.includes('PE')) {
                  const optRec = validateOptionStrikeFeed(
                    tick.symbol,
                    s.strike,
                    'PE',
                    currentIndexData.spotPrice,
                    tick,
                    undefined,
                    s.putLtp
                  );
                  if (optRec.isValid) {
                    const diff = Number((optRec.normalizedPrice - s.putLtp).toFixed(2));
                    const chPct = s.putLtp > 0 ? Number(((diff / s.putLtp) * 100).toFixed(1)) : 0;
                    return {
                      ...s,
                      putLtp: optRec.normalizedPrice,
                      putChange: diff,
                      putChangePercent: chPct,
                      putOiLakhs: tick.oi ? Number((tick.oi / 100000).toFixed(1)) : s.putOiLakhs,
                    };
                  }
                }
              }
              return s;
            });

            if (strikeUpdated) {
              const updatedRec =
                updatedCandidateStrikes.find(
                  (c) =>
                    c.strike === currentIndexData.recommendedCandidate.strike &&
                    c.optionType === currentIndexData.recommendedCandidate.optionType
                ) || currentIndexData.recommendedCandidate;

              return {
                ...prev,
                [targetIndex]: {
                  ...currentIndexData,
                  candidateStrikes: updatedCandidateStrikes,
                  recommendedCandidate: updatedRec,
                  battlefieldStrikes: updatedBattlefield,
                  lastUpdated: tick.ltt || currentIndexData.lastUpdated,
                },
              };
            }
          }
        }

        return prev;
      });

      // Update Open Paper Trades
      setPaperTrades((prevTrades) => {
        let tradeModified = false;
        const updatedTrades = prevTrades.map((t) => {
          if (
            t.status === 'OPEN' &&
            (t.fyersSymbol === tick.symbol ||
              (tick.isOption &&
                t.strike === tick.strike &&
                t.optionType === tick.optionType &&
                (!tick.indexSymbol || tick.indexSymbol === t.indexSymbol)))
          ) {
            tradeModified = true;
            const pnl = Number(((tick.lp - t.entryPrice) * t.quantity).toFixed(2));
            const pnlPercent = Number((((tick.lp - t.entryPrice) / t.entryPrice) * 100).toFixed(2));
            return {
              ...t,
              currentPrice: tick.lp,
              pnl,
              pnlPercent,
            };
          }
          return t;
        });
        return tradeModified ? updatedTrades : prevTrades;
      });

      setLastSyncTime(tick.ltt || new Date().toLocaleTimeString('en-IN'));
    },
    [selectedIndex]
  );

  // Dedicated Fyers Index WebSocket Stream Hook
  const {
    status: wsStatus,
    isConnected: isWsConnected,
    ticksPerSecond,
    latencyMs,
    ticksCount,
    reconnect: reconnectWs,
  } = useFyersIndexWebSocket({
    indexSymbol: selectedIndex,
    candidateStrikes: indicesData[selectedIndex]?.candidateStrikes,
    enabled: wsStreamEnabled,
    onTick: handleWebSocketTick,
  });

  // Fetch Live Quotes from Fyers & recalculate all models (Fallback & EOD sync)
  const fetchLiveQuotes = async () => {
    try {
      const currentDiag = getMarketHoursDiagnostics();
      setMarketDiagnostics(currentDiag);

      const liveQuotes = await fetchLiveIndexQuotes();
      if (liveQuotes && Object.keys(liveQuotes).length > 0) {
        setIndicesData((prev) => {
          const updated = generateAllIndicesIntelligence(liveQuotes);

          // Check if current selected index price moved to trigger flash (only during live market hours)
          if (currentDiag.isMarketHours) {
            const currentNewPrice = updated[selectedIndex]?.spotPrice;
            const currentOldPrice = prev[selectedIndex]?.spotPrice;
            if (currentNewPrice && currentOldPrice) {
              if (currentNewPrice > currentOldPrice) {
                setPriceFlash('up');
                setTimeout(() => setPriceFlash(null), 800);
              } else if (currentNewPrice < currentOldPrice) {
                setPriceFlash('down');
                setTimeout(() => setPriceFlash(null), 800);
              }
            }
          } else {
            setPriceFlash(null);
          }

          // Evaluate active alerts against newly refreshed live data
          const { updatedAlerts, newlyTriggeredAlerts } = evaluateActiveIndexAlerts(updated);
          if (newlyTriggeredAlerts.length > 0) {
            setAlerts(updatedAlerts);
            setActiveToastAlert(newlyTriggeredAlerts[0]);
          }

          return updated;
        });

        const activeQuote = liveQuotes[selectedIndex];
        if (activeQuote?.fyersStatus) {
          setFyersLiveStatus(activeQuote.fyersStatus);
        }
        setLastSyncTime(new Date().toLocaleTimeString('en-IN'));
      }
    } catch (err) {
      console.warn('[Fyers Feed] Polling error, maintaining intelligent engine state:', err);
    }
  };

  // Initial fetch on mount
  useEffect(() => {
    fetchLiveQuotes();
  }, []);

  // Periodic polling effect
  useEffect(() => {
    if (!autoRefreshEnabled) return;
    const interval = setInterval(() => {
      fetchLiveQuotes();
    }, refreshIntervalMs);

    return () => clearInterval(interval);
  }, [autoRefreshEnabled, refreshIntervalMs, selectedIndex]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchLiveQuotes();
    setIsRefreshing(false);
  };

  const handleExecutePaperTrade = (candidate: IndexCandidateStrike, lots: number) => {
    const config = INDEX_CONFIGS[candidate.contractName.split(' ')[0] as SupportedIndexSymbol] || INDEX_CONFIGS[selectedIndex];
    const totalQty = lots * config.lotSize;

    const newTrade: IndexPaperTrade = {
      id: `IPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      indexSymbol: selectedIndex,
      contractName: candidate.contractName,
      optionType: candidate.optionType,
      action: candidate.action,
      strike: candidate.strike,
      entryPrice: candidate.entryPrice,
      currentPrice: candidate.entryPrice,
      quantity: totalQty,
      lots,
      stopLoss: candidate.stopLoss,
      target1: candidate.target1,
      target2: candidate.target2,
      target3: candidate.target3,
      pnl: 0,
      pnlPercent: 0,
      status: 'OPEN',
      entryTime: new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      fyersSymbol: candidate.fyersSymbol,
    };

    setPaperTrades((prev) => [newTrade, ...prev]);
    setTradeModalStrike(null);
    setSelectedSubTab('trades');
  };

  const handleClosePaperTrade = (tradeId: string) => {
    setPaperTrades((prev) =>
      prev.map((t) => {
        if (t.id === tradeId) {
          return {
            ...t,
            status: 'CLOSED',
            exitTime: new Date().toLocaleTimeString('en-IN'),
            exitPrice: t.currentPrice,
          };
        }
        return t;
      })
    );
  };

  const indexSymbols: SupportedIndexSymbol[] = [
    'NIFTY 50',
    'BANKNIFTY',
    'FINNIFTY',
    'MIDCPNIFTY',
    'SENSEX',
  ];

  const handleOpenAlertModal = (preset?: {
    indexSymbol?: SupportedIndexSymbol;
    moneyness?: IndexStrikeMoneyness;
    optionType?: 'CE' | 'PE';
    action?: 'BUY' | 'SELL';
    strike?: number;
  }) => {
    setAlertModalInitialConfig({
      indexSymbol: preset?.indexSymbol || selectedIndex,
      moneyness: preset?.moneyness || 'SLIGHT_ITM',
      optionType: preset?.optionType || 'CE',
      action: preset?.action || 'BUY',
      strike: preset?.strike,
    });
    setIsAlertModalOpen(true);
  };

  const handleAlertCreated = (newAlert: IndexOptionAlert) => {
    setAlerts((prev) => [newAlert, ...prev]);
  };

  const handleToggleAlert = (alertId: string) => {
    setAlerts((prev) => {
      const next = prev.map((a) => (a.id === alertId ? { ...a, isActive: !a.isActive } : a));
      localStorage.setItem('index_options_alerts_v2', JSON.stringify(next));
      return next;
    });
  };

  const handleDeleteAlert = (alertId: string) => {
    setAlerts((prev) => {
      const next = prev.filter((a) => a.id !== alertId);
      localStorage.setItem('index_options_alerts_v2', JSON.stringify(next));
      return next;
    });
  };

  const handleTestTriggerAlert = (alert: IndexOptionAlert) => {
    playIndexAlertChime(alert.action === 'BUY' ? 'BULLISH' : 'BEARISH');
    setActiveToastAlert({
      ...alert,
      triggeredAt: new Date().toLocaleTimeString('en-IN'),
      triggerMessage: `TEST TRIGGER: ${alert.indexSymbol} simulated alert fired for ${alert.contractName}!`,
    });
  };

  const handleTradeFromAlert = (alert: IndexOptionAlert) => {
    const config = INDEX_CONFIGS[alert.indexSymbol];
    const newTrade: IndexPaperTrade = {
      id: `IPT-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      indexSymbol: alert.indexSymbol,
      contractName: alert.contractName,
      optionType: alert.optionType,
      action: alert.action,
      strike: alert.strike,
      entryPrice: alert.entryPrice,
      currentPrice: alert.entryPrice,
      quantity: 2 * (config?.lotSize || 25),
      lots: 2,
      stopLoss: alert.stopLoss,
      target1: alert.target1,
      target2: alert.target2,
      target3: alert.target3,
      pnl: 0,
      pnlPercent: 0,
      status: 'OPEN',
      entryTime: new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      fyersSymbol: alert.contractName,
    };

    setPaperTrades((prev) => [newTrade, ...prev]);
    setSelectedSubTab('trades');
  };

  const handleTradeFromV9Setup = (tradeSetup: any) => {
    const config = INDEX_CONFIGS[selectedIndex];
    const lots = tradeSetup.maxLots || 2;
    const newTrade: IndexPaperTrade = {
      id: `IPT-V9-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      indexSymbol: selectedIndex,
      contractName: tradeSetup.contractName,
      optionType: tradeSetup.optionType,
      action: 'BUY',
      strike: tradeSetup.strike,
      entryPrice: tradeSetup.ltp,
      currentPrice: tradeSetup.ltp,
      quantity: lots * (config?.lotSize || 25),
      lots,
      stopLoss: tradeSetup.stopLoss,
      target1: tradeSetup.target1,
      target2: tradeSetup.target2,
      target3: tradeSetup.target3,
      pnl: 0,
      pnlPercent: 0,
      status: 'OPEN',
      entryTime: new Date().toLocaleTimeString('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }),
      fyersSymbol: tradeSetup.contractName,
    };

    setPaperTrades((prev) => [newTrade, ...prev]);
    setOrderStatusToast({
      message: `🚀 V9 Live Algo: Executed ${newTrade.contractName} (${lots} Lots)`,
      type: 'success',
    });
    setTimeout(() => setOrderStatusToast(null), 3500);
    setSelectedSubTab('trades');
  };

  const activeAlertsCount = alerts.filter((a) => a.isActive).length;

  if (!currentData) return null;

  const isBullishDecision = currentData.decision === 'BUY CE' || currentData.decision === 'SELL PE';
  const isBearishDecision = currentData.decision === 'BUY PE' || currentData.decision === 'SELL CE';

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* Toast Notification for Orders */}
      {orderStatusToast && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-2xl shadow-2xl border flex items-center gap-3 backdrop-blur-xl animate-in slide-in-from-top-3 ${
            orderStatusToast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200 shadow-emerald-950/60'
              : 'bg-rose-950/90 border-rose-500 text-rose-200 shadow-rose-950/60'
          }`}
        >
          {orderStatusToast.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
          )}
          <span className="font-mono text-xs font-bold">{orderStatusToast.message}</span>
        </div>
      )}

      {/* Top Banner Header with Fyers Controls */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border shadow-xl backdrop-blur-md flex flex-wrap items-center justify-between gap-4 transition-all ${
          isDark
            ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-slate-950/50'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/20">
            <Zap className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black font-mono tracking-tight bg-gradient-to-r from-emerald-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
                🚀 V9 VEGA + GREEKS QUANT ENGINE
              </h1>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                <span>V1→V9 ARCHITECTURE</span>
              </div>
            </div>
            <p className="text-xs opacity-70 font-mono flex items-center gap-2 mt-0.5">
              <span>Vega + Greeks + IV Regimes + OI + Price Action + Order Flow + Wyckoff Live Algo</span>
              <span className="opacity-40">•</span>
              <span className="text-indigo-400">Sync: {lastSyncTime}</span>
            </p>
          </div>
        </div>

        {/* Action Controls & Fyers Integration Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Fyers API Settings Modal Trigger */}
          <button
            onClick={() => setIsFyersModalOpen(true)}
            className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border border-cyan-500/40 bg-gradient-to-r from-cyan-500/20 to-blue-500/20 hover:from-cyan-500/30 hover:to-blue-500/30 text-cyan-300 shadow-md shadow-cyan-500/10 transition-all"
            title="Configure Fyers API v3 Credentials"
          >
            <Key className="w-3.5 h-3.5 text-cyan-400" />
            <span>Fyers API v3</span>
            {fyersAccessToken ? (
              <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
            )}
          </button>

          {/* Create Alert Button */}
          <button
            onClick={() => handleOpenAlertModal()}
            className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border border-amber-500/40 bg-gradient-to-r from-amber-500/20 to-orange-500/20 hover:from-amber-500/30 hover:to-orange-500/30 text-amber-300 shadow-md shadow-amber-500/10 transition-all"
          >
            <Bell className="w-3.5 h-3.5 fill-current text-amber-400 animate-bounce" />
            <span>Set Alert</span>
            {activeAlertsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-400 text-slate-950 text-[10px] font-black">
                {activeAlertsCount}
              </span>
            )}
          </button>

          {/* Manual Refresh Button */}
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border transition-all ${
              isDark
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Fetch Fyers Live</span>
          </button>

          {/* Market Signal Audit Button */}
          <button
            onClick={() => setIsAuditModalOpen(true)}
            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border transition-all ${
              marketDiagnostics.isMarketHours
                ? 'border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300'
                : 'border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300'
            }`}
            title="Inspect Market Hours & False Signal Audit"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Audit Engine</span>
          </button>
        </div>
      </div>

      {/* Real-time Market Session & False Signal Guardrail Banner */}
      <div
        className={`p-3 sm:p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 shadow-md backdrop-blur-md transition-all ${
          marketDiagnostics.isMarketHours
            ? isDark
              ? 'bg-gradient-to-r from-emerald-950/40 via-slate-900/90 to-emerald-950/20 border-emerald-500/30 text-emerald-200'
              : 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
            : isDark
            ? 'bg-gradient-to-r from-amber-950/40 via-slate-900/90 to-amber-950/20 border-amber-500/40 text-amber-200'
            : 'bg-amber-50/80 border-amber-200 text-amber-900'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-2 rounded-xl border ${
              marketDiagnostics.isMarketHours
                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                : 'bg-amber-500/20 text-amber-400 border-amber-500/40'
            }`}
          >
            {marketDiagnostics.isMarketHours ? (
              <Radio className="w-4 h-4 animate-pulse" />
            ) : (
              <ShieldAlert className="w-4 h-4" />
            )}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-bold text-xs">
                {marketDiagnostics.isMarketHours
                  ? '🟢 LIVE SESSION: NSE / BSE Regular Market Open'
                  : '🔒 MARKET CLOSED: EOD Price Settlement Locked'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black font-mono bg-slate-800 text-slate-200 border border-slate-700">
                {marketDiagnostics.istTime}
              </span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-bold font-mono ${
                  marketDiagnostics.isMarketHours
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-indigo-500/20 text-indigo-300'
                }`}
              >
                {marketDiagnostics.isMarketHours
                  ? 'Active Tick Streaming'
                  : 'Noise Suppression ACTIVE'}
              </span>
            </div>
            <p className="text-[11px] font-mono opacity-80 mt-0.5">
              {marketDiagnostics.isMarketHours
                ? 'Live 09:15 - 15:30 IST session. Real-time Fyers API v3 tick streaming & Greeks calculations active.'
                : 'Market is closed outside 09:15 - 15:30 IST. Price jitter is suppressed and alerts are paused to prevent false signals.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAuditModalOpen(true)}
            className="px-3 py-1.5 rounded-xl font-mono text-xs font-bold border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1.5 transition-all"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Verify Audit &amp; Feed</span>
          </button>
        </div>
      </div>

      {/* Index Selector Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {indexSymbols.map((sym) => {
          const idxData = indicesData[sym];
          const isSelected = selectedIndex === sym;
          const isPos = idxData.changePercent >= 0;

          return (
            <button
              key={sym}
              onClick={() => {
                setSelectedIndex(sym);
                setPrevPrice(idxData.spotPrice);
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between ${
                isSelected
                  ? isDark
                    ? 'bg-gradient-to-b from-indigo-950/80 to-slate-900 border-indigo-500 shadow-lg shadow-indigo-500/20 ring-2 ring-indigo-500/40'
                    : 'bg-indigo-50/80 border-indigo-500 shadow-md ring-2 ring-indigo-500/30'
                  : isDark
                  ? 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-800/60 text-slate-300'
                  : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <span className="font-mono font-black text-xs tracking-wider block">
                    {sym}
                  </span>
                  <span className="text-[9px] font-mono text-cyan-400 opacity-70">
                    {idxData.fyersSymbol || 'NSE'}
                  </span>
                </div>
                <span
                  className={`text-[9px] font-bold px-1.5 py-0.2 rounded font-mono ${
                    idxData.decision === 'BUY CE'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : idxData.decision === 'BUY PE'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  {idxData.decision}
                </span>
              </div>

              {/* Price & Change */}
              <div className="mb-2">
                <div
                  className={`text-base font-black font-mono tracking-tight transition-all duration-300 ${
                    isSelected && priceFlash === 'up'
                      ? 'text-emerald-400 scale-105'
                      : isSelected && priceFlash === 'down'
                      ? 'text-rose-400 scale-105'
                      : ''
                  }`}
                >
                  ₹{idxData.spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div
                  className={`flex items-center gap-1 text-[11px] font-bold font-mono ${
                    isPos ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {isPos ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  <span>
                    {isPos ? '+' : ''}
                    {idxData.change} ({isPos ? '+' : ''}
                    {idxData.changePercent}%)
                  </span>
                </div>
              </div>

              {/* Bottom Quick Stats */}
              <div className="pt-2 border-t border-slate-800/50 flex items-center justify-between text-[10px] font-mono opacity-80">
                <span>PCR {idxData.pcrOi}x</span>
                <span>Score {idxData.overallScore}/100</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Quantitative Cockpit Banner with Live Fyers Ticker */}
      <div
        className={`p-5 sm:p-6 rounded-3xl border shadow-2xl relative overflow-hidden transition-all ${
          isBullishDecision
            ? isDark
              ? 'bg-gradient-to-r from-emerald-950/70 via-slate-900 to-indigo-950/60 border-emerald-500/40 shadow-emerald-950/30'
              : 'bg-gradient-to-r from-emerald-50 via-white to-teal-50 border-emerald-300'
            : isBearishDecision
            ? isDark
              ? 'bg-gradient-to-r from-rose-950/70 via-slate-900 to-indigo-950/60 border-rose-500/40 shadow-rose-950/30'
              : 'bg-gradient-to-r from-rose-50 via-white to-orange-50 border-rose-300'
            : isDark
            ? 'bg-slate-900/90 border-slate-800 shadow-slate-950/40'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left Column: Decision & Strategy Verdict */}
          <div className="lg:col-span-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-mono flex-wrap">
              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold border border-indigo-500/30">
                {currentData.name} ({currentData.exchange})
              </span>
              <button
                onClick={() => handleCopySymbol(currentData.fyersSymbol || '')}
                className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold border border-cyan-500/30 flex items-center gap-1 hover:bg-cyan-500/30 transition-all"
                title="Click to copy Fyers Symbol"
              >
                <span>{currentData.fyersSymbol}</span>
                {copiedSymbol === currentData.fyersSymbol ? (
                  <Check className="w-3 h-3 text-emerald-400" />
                ) : (
                  <Copy className="w-3 h-3 opacity-60" />
                )}
              </button>
              <span className="opacity-60">Expiry: {currentData.expiryDate}</span>
            </div>

            {/* Giant Decision Stamp */}
            <div className="flex items-baseline gap-3 flex-wrap">
              <div
                className={`text-3xl sm:text-4xl font-black font-mono tracking-tight px-4 py-2 rounded-2xl border flex items-center gap-3 shadow-lg ${
                  isBullishDecision
                    ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-emerald-500/30'
                    : isBearishDecision
                    ? 'bg-rose-500 text-white border-rose-300 shadow-rose-500/30'
                    : 'bg-amber-400 text-slate-950 border-amber-200 shadow-amber-400/20'
                }`}
              >
                <span>{currentData.decision}</span>
              </div>
              <div className="font-mono text-xs">
                <span className="opacity-60 block">WIN PROBABILITY</span>
                <span className="text-xl font-black text-indigo-400">
                  {currentData.winProbabilityPct}%
                </span>
              </div>
              <div className="font-mono text-xs">
                <span className="opacity-60 block">AI CONFIDENCE</span>
                <span className="text-xl font-black text-purple-400">
                  {currentData.confidencePct}%
                </span>
              </div>
            </div>

            {/* Primary Recommended Trade Contract */}
            <div className="p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80 flex items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-mono uppercase opacity-60 block">
                  Top Recommended Strike Selection
                </span>
                <div className="font-mono font-black text-sm text-indigo-300 flex items-center gap-2">
                  <span>{currentData.recommendedCandidate.contractName}</span>
                  <span className="text-xs px-1.5 py-0.2 rounded bg-indigo-500/20 border border-indigo-500/40">
                    LTP ₹{currentData.recommendedCandidate.premiumLtp}
                  </span>
                </div>
                <div className="text-[11px] font-mono opacity-80 mt-0.5">
                  Target 1: ₹{currentData.recommendedCandidate.target1} • Stop Loss: ₹{currentData.recommendedCandidate.stopLoss}
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleCopySymbol(currentData.recommendedCandidate.fyersSymbol || '')}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700"
                  title="Copy Fyers Option Symbol"
                >
                  {copiedSymbol === currentData.recommendedCandidate.fyersSymbol ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => {
                    setTradeModalStrike(currentData.recommendedCandidate);
                    setTradeLots(2);
                  }}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-mono font-black text-xs shadow-md shadow-emerald-500/20 transition-all shrink-0 flex items-center gap-1"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Execute</span>
                </button>
              </div>
            </div>

            <p className="text-xs opacity-80 font-sans leading-relaxed">
              {currentData.decisionRationale}
            </p>
          </div>

          {/* Middle Column: Live Index Price Card & Technical Gauges */}
          <div className="lg:col-span-4 space-y-3">
            <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800">
              <div className="flex items-center justify-between text-xs font-mono opacity-70 mb-1">
                <span>Fyers Spot Index LTP</span>
                <span className="text-emerald-400 font-bold">● LIVE</span>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <div
                  className={`text-3xl font-black font-mono tracking-tight transition-colors duration-300 ${
                    priceFlash === 'up'
                      ? 'text-emerald-400'
                      : priceFlash === 'down'
                      ? 'text-rose-400'
                      : ''
                  }`}
                >
                  ₹{currentData.spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div
                  className={`text-sm font-black font-mono ${
                    currentData.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {currentData.changePercent >= 0 ? '+' : ''}
                  {currentData.change} ({currentData.changePercent >= 0 ? '+' : ''}
                  {currentData.changePercent}%)
                </div>
              </div>

              {/* Day High / Low Range Progress Bar */}
              <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-1">
                <div className="flex items-center justify-between text-[10px] font-mono opacity-70">
                  <span>Day Low: ₹{currentData.dayLow.toLocaleString('en-IN')}</span>
                  <span>Day High: ₹{currentData.dayHigh.toLocaleString('en-IN')}</span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden relative">
                  {(() => {
                    const range = Math.max(1, currentData.dayHigh - currentData.dayLow);
                    const pos = Math.min(100, Math.max(0, ((currentData.spotPrice - currentData.dayLow) / range) * 100));
                    return (
                      <div
                        className="h-full bg-gradient-to-r from-rose-500 via-amber-400 to-emerald-400"
                        style={{ width: `${pos}%` }}
                      />
                    );
                  })()}
                </div>
              </div>

              {/* Quick Technicals strip */}
              <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800/80 text-[10px] font-mono">
                <div>
                  <span className="opacity-60 block">RSI (14)</span>
                  <span className="font-bold text-indigo-300">{currentData.technicals.rsi14}</span>
                </div>
                <div>
                  <span className="opacity-60 block">CPR Status</span>
                  <span className="font-bold text-emerald-300">
                    {currentData.technicals.cpr.cprStatus.replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <span className="opacity-60 block">Futures Basis</span>
                  <span className="font-bold text-purple-300">
                    {currentData.futures.basisPoints > 0 ? '+' : ''}
                    {currentData.futures.basisPoints} pts
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: AI Quantitative Scoring Radar */}
          <div className="lg:col-span-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase opacity-80 flex items-center gap-1.5">
                <Brain className="w-3.5 h-3.5 text-purple-400" />
                Score Matrix
              </span>
              <span className="text-xs font-mono font-black text-indigo-400">
                {currentData.overallScore}/100
              </span>
            </div>

            <div className="space-y-2">
              {currentData.scoreVectors.map((vec) => {
                const pct = vec.score;
                return (
                  <div key={vec.vectorName} className="space-y-0.5">
                    <div className="flex justify-between text-[11px] font-mono">
                      <span className="opacity-80">{vec.vectorName}</span>
                      <span className="font-bold">{vec.score}/100</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          pct >= 70
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                            : pct >= 50
                            ? 'bg-gradient-to-r from-indigo-500 to-cyan-400'
                            : 'bg-gradient-to-r from-rose-500 to-amber-500'
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800/60 pb-2 overflow-x-auto custom-scrollbar">
        {[
          { id: 'v9-engine', label: '🚀 V1 → V9 Vega & Greeks Engine', icon: Rocket, isSpecial: true },
          { id: 'battlefield', label: 'OI Strike Battlefield & Greeks', icon: Crosshair },
          { id: 'institutional', label: 'Institutional Positioning (Greeks & Writing)', icon: Building2 },
          { id: 'strikes', label: 'ATM / ITM / OTM Strike Selector', icon: Sparkles },
          { id: 'technicals', label: 'Technical & Greeks Cockpit', icon: Activity },
          { id: 'alerts', label: `Index Alerts Hub (${activeAlertsCount})`, icon: Bell },
          { id: 'trades', label: `Active Paper Trades (${paperTrades.filter((t) => t.status === 'OPEN').length})`, icon: Coins },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = selectedSubTab === tab.id;
          const isAlertTab = tab.id === 'alerts';
          const isV9Tab = tab.id === 'v9-engine';
          return (
            <button
              key={tab.id}
              onClick={() => setSelectedSubTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all shrink-0 border relative ${
                isActive
                  ? isV9Tab
                    ? 'bg-gradient-to-r from-emerald-500 via-indigo-600 to-purple-600 text-white border-emerald-400 shadow-lg shadow-indigo-600/30 ring-1 ring-emerald-400 font-black'
                    : isAlertTab
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 border-amber-400 shadow-md shadow-amber-500/30'
                    : 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                  : isV9Tab
                  ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
                  : isDark
                  ? 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isV9Tab ? 'text-emerald-300 animate-pulse' : isAlertTab && activeAlertsCount > 0 ? 'text-amber-400 animate-pulse' : ''}`} />
              <span>{tab.label}</span>
              {isV9Tab && (
                <span className="px-1.5 py-0.2 rounded text-[9px] bg-emerald-400 text-slate-950 font-black uppercase">
                  ACTIVE
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* TAB 0: V1 -> V9 VEGA + GREEKS ENGINE PIPELINE */}
      {selectedSubTab === 'v9-engine' && (
        <V9VegaGreeksPipelineView
          data={currentData}
          onSelectStrikeForTrade={handleTradeFromV9Setup}
          theme={theme}
        />
      )}

      {/* TAB 1: OI STRIKE BATTLEFIELD & OPTION CHAIN */}
      {selectedSubTab === 'battlefield' && (
        <div className="space-y-4">
          {/* Key Strike Walls Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div
              className={`p-3 rounded-2xl border ${
                isDark ? 'bg-rose-950/30 border-rose-500/30 text-rose-300' : 'bg-rose-50 border-rose-200 text-rose-900'
              }`}
            >
              <div className="text-[10px] font-mono font-bold uppercase opacity-80 flex items-center justify-between">
                <span>Max Call OI (Ceiling Resistance)</span>
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              </div>
              <div className="text-xl font-black font-mono mt-1">
                {currentData.maxCallOiStrike}
              </div>
              <p className="text-[10px] font-mono opacity-70 mt-0.5">
                2nd Res: {currentData.secondMaxCallOiStrike}
              </p>
            </div>

            <div
              className={`p-3 rounded-2xl border ${
                isDark ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="text-[10px] font-mono font-bold uppercase opacity-80 flex items-center justify-between">
                <span>Max Put OI (Floor Support)</span>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="text-xl font-black font-mono mt-1">
                {currentData.maxPutOiStrike}
              </div>
              <p className="text-[10px] font-mono opacity-70 mt-0.5">
                2nd Supp: {currentData.secondMaxPutOiStrike}
              </p>
            </div>

            <div
              className={`p-3 rounded-2xl border ${
                isDark ? 'bg-indigo-950/30 border-indigo-500/30 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-900'
              }`}
            >
              <div className="text-[10px] font-mono font-bold uppercase opacity-80 flex items-center justify-between">
                <span>ATM Strike &amp; Straddle</span>
                <Target className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <div className="text-xl font-black font-mono mt-1">
                {currentData.atmStrike}
              </div>
              <p className="text-[10px] font-mono opacity-70 mt-0.5">
                Combined Straddle: ₹{currentData.institutionalFlow.combinedAtmStraddleLtp}
              </p>
            </div>

            <div
              className={`p-3 rounded-2xl border ${
                isDark ? 'bg-purple-950/30 border-purple-500/30 text-purple-300' : 'bg-purple-50 border-purple-200 text-purple-900'
              }`}
            >
              <div className="text-[10px] font-mono font-bold uppercase opacity-80 flex items-center justify-between">
                <span>PCR Flow &amp; Trend</span>
                <Activity className="w-3.5 h-3.5 text-purple-400" />
              </div>
              <div className="text-xl font-black font-mono mt-1">
                {currentData.pcrOi}x
              </div>
              <p className="text-[10px] font-mono opacity-70 mt-0.5">
                {currentData.pcrTrend.replace('_', ' ')} (Vol PCR {currentData.pcrVolume}x)
              </p>
            </div>
          </div>

          {/* Gamma Squeeze Alert Banner if Active */}
          {currentData.institutionalFlow.gammaSqueezeAlert.detected && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/20 to-rose-500/20 border border-amber-500/40 text-amber-200 flex items-center justify-between gap-3 animate-pulse">
              <div className="flex items-center gap-3">
                <Flame className="w-6 h-6 text-amber-400 shrink-0 fill-current" />
                <div>
                  <div className="font-bold font-mono text-sm uppercase">
                    {currentData.institutionalFlow.gammaSqueezeAlert.message}
                  </div>
                  <p className="text-xs opacity-80 font-sans">
                    Institutional short-sellers are trapped. High velocity delta explosion anticipated.
                  </p>
                </div>
              </div>
              <span className="px-3 py-1 rounded-xl bg-amber-400 text-slate-950 font-black text-xs uppercase shrink-0">
                GAMMA SQUEEZE
              </span>
            </div>
          )}

          {/* Option Chain Filter Controls */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="opacity-60">Show Strikes:</span>
              {(['NEAR_ATM', 'ALL', 'HIGH_OI'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setChainFilter(filter)}
                  className={`px-3 py-1 rounded-lg border text-xs font-bold transition-all ${
                    chainFilter === filter
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : isDark
                      ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-200'
                  }`}
                >
                  {filter.replace('_', ' ')}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 text-xs font-mono opacity-70">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> Put Support
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block" /> Call Resistance
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded bg-amber-400 inline-block" /> ATM Strike
              </span>
            </div>
          </div>

          {/* Option Chain Table */}
          <div className="rounded-2xl border border-slate-800/80 overflow-x-auto shadow-xl custom-scrollbar">
            <table className="w-full text-xs font-mono text-left border-collapse">
              <thead>
                <tr className="bg-slate-950 text-slate-300 border-b border-slate-800 text-[11px] uppercase">
                  <th colSpan={7} className="py-2.5 px-3 text-center bg-emerald-950/40 text-emerald-300 border-r border-slate-800 font-black">
                    CALL OPTIONS (CE) - RESISTANCE SIDE
                  </th>
                  <th className="py-2.5 px-4 text-center bg-slate-900 text-slate-200 font-black border-r border-l border-slate-800">
                    STRIKE
                  </th>
                  <th colSpan={7} className="py-2.5 px-3 text-center bg-rose-950/40 text-rose-300 border-l border-slate-800 font-black">
                    PUT OPTIONS (PE) - SUPPORT SIDE
                  </th>
                </tr>
                <tr className="bg-slate-900/90 text-slate-400 text-[10px] border-b border-slate-800">
                  <th className="py-2 px-2 text-right">OI (Lakhs)</th>
                  <th className="py-2 px-2 text-right">Chg OI</th>
                  <th className="py-2 px-2 text-right">Vol</th>
                  <th className="py-2 px-2 text-right">IV</th>
                  <th className="py-2 px-2 text-right">Delta</th>
                  <th className="py-2 px-2 text-right">Theta</th>
                  <th className="py-2 px-3 text-right text-emerald-300 font-bold border-r border-slate-800">
                    LTP (₹)
                  </th>
                  <th className="py-2 px-4 text-center font-bold text-slate-200 border-r border-l border-slate-800">
                    STRIKE
                  </th>
                  <th className="py-2 px-3 text-left text-rose-300 font-bold border-l border-slate-800">
                    LTP (₹)
                  </th>
                  <th className="py-2 px-2 text-left">Theta</th>
                  <th className="py-2 px-2 text-left">Delta</th>
                  <th className="py-2 px-2 text-left">IV</th>
                  <th className="py-2 px-2 text-left">Vol</th>
                  <th className="py-2 px-2 text-left">Chg OI</th>
                  <th className="py-2 px-2 text-left">OI (Lakhs)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {currentData.battlefieldStrikes
                  .filter((s) => {
                    if (chainFilter === 'NEAR_ATM') return Math.abs(s.strike - currentData.atmStrike) <= currentData.strikeStep * 6;
                    if (chainFilter === 'HIGH_OI') return s.isMaxCallOi || s.isMaxPutOi || s.isSecondMaxCallOi || s.isSecondMaxPutOi || s.isAtm;
                    return true;
                  })
                  .map((s) => {
                    const isAtm = s.isAtm;
                    const isMaxCall = s.isMaxCallOi;
                    const isMaxPut = s.isMaxPutOi;

                    return (
                      <tr
                        key={s.strike}
                        className={`hover:bg-slate-800/40 transition-colors ${
                          isAtm
                            ? 'bg-amber-500/10 font-bold'
                            : s.strike < currentData.spotPrice
                            ? 'bg-emerald-950/10'
                            : 'bg-rose-950/10'
                        }`}
                      >
                        {/* CALL SIDE */}
                        <td className="py-2 px-2 text-right">
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              isMaxCall
                                ? 'bg-rose-500/20 text-rose-300 font-black border border-rose-500/40'
                                : ''
                            }`}
                          >
                            {s.callOiLakhs}L
                          </span>
                        </td>
                        <td
                          className={`py-2 px-2 text-right font-bold ${
                            s.callChangeOiLakhs > 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {s.callChangeOiLakhs > 0 ? '+' : ''}
                          {s.callChangeOiLakhs}L
                        </td>
                        <td className="py-2 px-2 text-right opacity-80">{s.callVolumeLakhs}L</td>
                        <td className="py-2 px-2 text-right opacity-70">{s.callIv}%</td>
                        <td className="py-2 px-2 text-right text-emerald-400 font-bold">
                          +{s.callDelta}
                        </td>
                        <td className="py-2 px-2 text-right text-rose-400 opacity-80">
                          -₹{Math.abs(s.callTheta)}
                        </td>
                        <td className="py-2 px-3 text-right font-black text-emerald-400 border-r border-slate-800">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleCopySymbol(s.fyersCallSymbol || '')}
                              className="opacity-0 hover:opacity-100 transition-opacity p-0.5 text-cyan-400"
                              title={`Copy Fyers Symbol: ${s.fyersCallSymbol}`}
                            >
                              <Copy className="w-2.5 h-2.5" />
                            </button>
                            <button
                              onClick={() =>
                                handleOpenAlertModal({
                                  indexSymbol: selectedIndex,
                                  moneyness: isAtm ? 'ATM' : s.strike < currentData.atmStrike ? 'SLIGHT_ITM' : 'SLIGHT_OTM',
                                  optionType: 'CE',
                                  action: 'BUY',
                                  strike: s.strike,
                                })
                              }
                              className="hover:underline hover:text-emerald-300 transition-colors inline-flex items-center gap-1 group"
                              title={`Create Alert on ${selectedIndex} ${s.strike} CE (₹${s.callLtp})`}
                            >
                              <span>₹{s.callLtp}</span>
                              <Bell className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-amber-400 transition-opacity" />
                            </button>
                          </div>
                        </td>

                        {/* STRIKE CENTER */}
                        <td
                          className={`py-2 px-4 text-center font-black text-sm border-r border-l ${
                            isAtm
                              ? 'bg-amber-400 text-slate-950 font-black'
                              : isDark
                              ? 'bg-slate-950/60 text-slate-100 border-indigo-900/40'
                              : 'bg-slate-100 text-slate-900 border-slate-300'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1.5">
                            <span>{s.strike}</span>
                            {isAtm && (
                              <span className="text-[8px] px-1 py-0.2 bg-slate-950 text-amber-300 rounded font-black">
                                ATM
                              </span>
                            )}
                            {isMaxCall && (
                              <span className="text-[8px] px-1 py-0.2 bg-rose-600 text-white rounded font-black">
                                RES
                              </span>
                            )}
                            {isMaxPut && (
                              <span className="text-[8px] px-1 py-0.2 bg-emerald-600 text-white rounded font-black">
                                SUPP
                              </span>
                            )}
                          </div>
                        </td>

                        {/* PUT SIDE */}
                        <td className="py-2 px-3 text-left font-black text-rose-400 border-l border-slate-800">
                          <div className="flex items-center justify-start gap-1.5">
                            <button
                              onClick={() =>
                                handleOpenAlertModal({
                                  indexSymbol: selectedIndex,
                                  moneyness: isAtm ? 'ATM' : s.strike > currentData.atmStrike ? 'SLIGHT_ITM' : 'SLIGHT_OTM',
                                  optionType: 'PE',
                                  action: 'BUY',
                                  strike: s.strike,
                                })
                              }
                              className="hover:underline hover:text-rose-300 transition-colors inline-flex items-center gap-1 group"
                              title={`Create Alert on ${selectedIndex} ${s.strike} PE (₹${s.putLtp})`}
                            >
                              <span>₹{s.putLtp}</span>
                              <Bell className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 text-amber-400 transition-opacity" />
                            </button>
                            <button
                              onClick={() => handleCopySymbol(s.fyersPutSymbol || '')}
                              className="opacity-0 hover:opacity-100 transition-opacity p-0.5 text-cyan-400"
                              title={`Copy Fyers Symbol: ${s.fyersPutSymbol}`}
                            >
                              <Copy className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </td>
                        <td className="py-2 px-2 text-left text-rose-400 opacity-80">
                          -₹{Math.abs(s.putTheta)}
                        </td>
                        <td className="py-2 px-2 text-left text-rose-400 font-bold">
                          {s.putDelta}
                        </td>
                        <td className="py-2 px-2 text-left opacity-70">{s.putIv}%</td>
                        <td className="py-2 px-2 text-left opacity-80">{s.putVolumeLakhs}L</td>
                        <td
                          className={`py-2 px-2 text-left font-bold ${
                            s.putChangeOiLakhs > 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {s.putChangeOiLakhs > 0 ? '+' : ''}
                          {s.putChangeOiLakhs}L
                        </td>
                        <td className="py-2 px-2 text-left">
                          <span
                            className={`px-1.5 py-0.5 rounded ${
                              isMaxPut
                                ? 'bg-emerald-500/20 text-emerald-300 font-black border border-emerald-500/40'
                                : ''
                            }`}
                          >
                            {s.putOiLakhs}L
                          </span>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: ATM / ITM / OTM STRIKE SELECTOR */}
      {selectedSubTab === 'strikes' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {currentData.candidateStrikes.map((cand) => {
              const isBest = cand.isRecommended;
              const isCall = cand.optionType === 'CE';

              return (
                <div
                  key={cand.id}
                  className={`p-5 rounded-3xl border transition-all relative overflow-hidden flex flex-col justify-between ${
                    isBest
                      ? isDark
                        ? 'bg-gradient-to-b from-indigo-950/80 to-slate-900 border-indigo-400 shadow-xl shadow-indigo-500/20 ring-2 ring-indigo-500/40'
                        : 'bg-indigo-50 border-indigo-400 shadow-lg ring-2 ring-indigo-400/30'
                      : isDark
                      ? 'bg-slate-900/70 border-slate-800'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  {isBest && (
                    <div className="absolute top-0 right-0 px-3 py-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-mono font-black text-[10px] rounded-bl-xl uppercase tracking-wider flex items-center gap-1 shadow-md">
                      <Sparkles className="w-3 h-3" />
                      <span>Best AI Selection</span>
                    </div>
                  )}

                  <div>
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black font-mono uppercase ${
                          isCall
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {cand.moneyness.replace('_', ' ')}
                      </span>
                      <span className="text-xs font-mono font-bold opacity-60">
                        {cand.action} {cand.optionType}
                      </span>
                    </div>

                    {/* Contract Name & Fyers Symbol */}
                    <h3 className="text-base font-black font-mono tracking-tight text-slate-100 mb-1">
                      {cand.contractName}
                    </h3>
                    <div className="flex items-center gap-1 text-[11px] font-mono text-cyan-400 mb-3">
                      <span>{cand.fyersSymbol}</span>
                      <button
                        onClick={() => handleCopySymbol(cand.fyersSymbol || '')}
                        className="p-1 hover:text-white transition-colors"
                        title="Copy Fyers Symbol"
                      >
                        {copiedSymbol === cand.fyersSymbol ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>
                    </div>

                    {/* Price & Score Grid */}
                    <div className="grid grid-cols-2 gap-2 p-3 rounded-2xl bg-slate-950/50 border border-slate-800/80 mb-3 font-mono">
                      <div>
                        <span className="text-[10px] opacity-60 block">Option LTP</span>
                        <span className="text-xl font-black text-emerald-400">
                          ₹{cand.premiumLtp}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] opacity-60 block">Quant Score</span>
                        <span className="text-xl font-black text-indigo-400">
                          {cand.quantitativeScore}/100
                        </span>
                      </div>
                    </div>

                    {/* Targets & Greeks */}
                    <div className="space-y-1.5 text-xs font-mono mb-4">
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="opacity-60">Stop Loss</span>
                        <span className="font-bold text-rose-400">
                          ₹{cand.stopLoss} (-{cand.stopLossPercent}%)
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="opacity-60">Target 1</span>
                        <span className="font-bold text-emerald-400">₹{cand.target1}</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="opacity-60">Delta / Theta</span>
                        <span className="font-bold text-slate-300">
                          Δ +{cand.greeks.delta} • Θ -₹{cand.thetaBurnPerDay}
                        </span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-800/60">
                        <span className="opacity-60">Win Probability</span>
                        <span className="font-bold text-indigo-300">{cand.winProbabilityPct}%</span>
                      </div>
                    </div>

                    <p className="text-xs opacity-75 font-sans mb-4">{cand.rationale}</p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                    <button
                      onClick={() =>
                        handleOpenAlertModal({
                          indexSymbol: selectedIndex,
                          moneyness: cand.moneyness,
                          optionType: cand.optionType,
                          action: cand.action,
                          strike: cand.strike,
                        })
                      }
                      className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-mono font-bold border border-slate-700 flex items-center gap-1.5"
                    >
                      <Bell className="w-3.5 h-3.5 text-amber-400" />
                      <span>Alert</span>
                    </button>

                    <button
                      onClick={() => handleExecuteFyersOrder(cand, 2)}
                      className="flex-1 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white text-xs font-mono font-black shadow-md shadow-cyan-600/20 flex items-center justify-center gap-1.5"
                      title="Dispatch order to Fyers / Paper Trade"
                    >
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      <span>Fyers 1-Click Order</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: INDEX ALERTS HUB */}
      {selectedSubTab === 'alerts' && (
        <IndexOptionAlertsHub
          alerts={alerts}
          indicesData={indicesData}
          onAlertsUpdated={(updated) => setAlerts(updated)}
          onOpenCreateModal={() => handleOpenAlertModal()}
          onPlacePaperTradeFromAlert={handleTradeFromAlert}
          onTriggerTestAlert={handleTestTriggerAlert}
          theme={theme}
        />
      )}

      {/* TAB 4: TECHNICAL & GREEKS COCKPIT */}
      {selectedSubTab === 'technicals' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs font-mono opacity-60 block">Supertrend (10, 3)</span>
              <div className="text-xl font-black font-mono text-emerald-400 mt-1">
                {currentData.technicals.supertrend.direction} (₹{currentData.technicals.supertrend.value})
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs font-mono opacity-60 block">EMA 9 / 21 / 50</span>
              <div className="text-xl font-black font-mono text-indigo-400 mt-1">
                {currentData.technicals.trendEma.replace('_', ' ')}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs font-mono opacity-60 block">CPR Pivots</span>
              <div className="text-xl font-black font-mono text-purple-400 mt-1">
                TC: {currentData.technicals.cpr.tc} • BC: {currentData.technicals.cpr.bc}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
              <span className="text-xs font-mono opacity-60 block">IV Percentile / Rank</span>
              <div className="text-xl font-black font-mono text-amber-400 mt-1">
                IVP {currentData.overallGreeks.ivPercentile}% (Rank {currentData.overallGreeks.ivRank}%)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB: INSTITUTIONAL POSITIONING MODULE (DELTA, GAMMA, VEGA, IV & WRITING RATIOS) */}
      {selectedSubTab === 'institutional' && (
        <div className="space-y-5">
          <InstitutionalPositioningModule
            indexData={currentData}
            indicesData={indicesData}
            onSelectIndex={setSelectedIndex}
            onOpenAlertModal={(payload) => handleOpenAlertModal(payload)}
            isWsConnected={isWsConnected}
            latencyMs={latencyMs}
            ticksPerSecond={ticksPerSecond}
            theme={theme}
          />
          <InstitutionalWritingShiftMonitor
            indicesData={indicesData}
            selectedIndex={selectedIndex}
            onSelectIndex={setSelectedIndex}
            onQuickCreateShiftAlert={(preset) => {
              handleOpenAlertModal({
                indexSymbol: preset.indexSymbol,
                optionType: preset.optionType,
                action: preset.action,
              });
            }}
            theme={theme}
          />
        </div>
      )}

      {/* TAB 6: ACTIVE PAPER TRADES */}
      {selectedSubTab === 'trades' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black font-mono">Simulated &amp; Fyers Paper Trades</h3>
            <span className="text-xs font-mono opacity-70">
              Total Trades: {paperTrades.length}
            </span>
          </div>

          {paperTrades.length === 0 ? (
            <div className="p-8 text-center rounded-2xl border border-slate-800 text-slate-500 font-mono">
              No active trades yet. Choose a recommended candidate from the Strike Selector or Option Chain.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {paperTrades.map((trade) => (
                <div
                  key={trade.id}
                  className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex justify-between items-center"
                >
                  <div>
                    <div className="font-mono font-black text-sm">{trade.contractName}</div>
                    <div className="text-xs opacity-70 font-mono mt-0.5">
                      Entry: ₹{trade.entryPrice} • SL: ₹{trade.stopLoss} • T1: ₹{trade.target1}
                    </div>
                    {trade.fyersSymbol && (
                      <div className="text-[10px] text-cyan-400 font-mono mt-0.5">
                        {trade.fyersSymbol}
                      </div>
                    )}
                  </div>
                  {trade.status === 'OPEN' && (
                    <button
                      onClick={() => handleClosePaperTrade(trade.id)}
                      className="px-3 py-1.5 rounded-xl bg-rose-600 text-white text-xs font-mono font-bold"
                    >
                      Close
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* FYERS API CONFIGURATION MODAL */}
      {isFyersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div
            className={`w-full max-w-lg p-6 rounded-3xl border shadow-2xl space-y-5 ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Key className="w-5 h-5 text-cyan-400" />
                <h3 className="font-mono font-black text-lg">Fyers API v3 Settings</h3>
              </div>
              <button
                onClick={() => setIsFyersModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs font-mono">
              <p className="opacity-80">
                Connect your Fyers App ID and today's generated Access Token to receive direct 100% real-time streaming quotes for NIFTY 50, BANKNIFTY, FINNIFTY, MIDCPNIFTY, and SENSEX.
              </p>

              <div>
                <label className="block font-bold mb-1 opacity-70">Fyers App ID</label>
                <input
                  type="text"
                  placeholder="e.g. RMR62XB492-100"
                  value={fyersAppId}
                  onChange={(e) => setFyersAppId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block font-bold mb-1 opacity-70">Fyers Access Token (Today's Session)</label>
                <textarea
                  rows={3}
                  placeholder="Paste your active access token here..."
                  value={fyersAccessToken}
                  onChange={(e) => setFyersAccessToken(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:border-cyan-500"
                />
              </div>

              {fyersTestResult && (
                <div
                  className={`p-3 rounded-xl border flex items-center gap-2 ${
                    fyersTestResult.success
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-300'
                      : 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                  }`}
                >
                  {fyersTestResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  )}
                  <span>{fyersTestResult.message}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-3 border-t border-slate-800">
              <button
                onClick={handleTestFyers}
                disabled={fyersTesting}
                className="flex-1 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-black text-xs flex items-center justify-center gap-2"
              >
                {fyersTesting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
                <span>Test &amp; Connect API v3</span>
              </button>

              <button
                onClick={() => {
                  localStorage.setItem('fyers_app_id', fyersAppId);
                  localStorage.setItem('fyers_access_token', fyersAccessToken);
                  setIsFyersModalOpen(false);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono font-bold text-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PAPER TRADE ORDER MODAL */}
      {tradeModalStrike && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
          <div
            className={`w-full max-w-md p-6 rounded-3xl border shadow-2xl space-y-4 ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-mono font-black text-base">Execute Index Option Order</h3>
              <button onClick={() => setTradeModalStrike(null)}>
                <X className="w-5 h-5 opacity-60 hover:opacity-100" />
              </button>
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800">
                <div className="font-bold text-sm text-indigo-300">{tradeModalStrike.contractName}</div>
                <div className="text-[11px] text-cyan-400 mt-0.5">{tradeModalStrike.fyersSymbol}</div>
                <div className="text-xl font-black text-emerald-400 mt-1">₹{tradeModalStrike.premiumLtp}</div>
              </div>

              <div>
                <label className="opacity-70 block mb-1">Select Lot Quantity</label>
                <div className="flex gap-2">
                  {[1, 2, 4, 8].map((l) => (
                    <button
                      key={l}
                      onClick={() => setTradeLots(l)}
                      className={`flex-1 py-2 rounded-xl font-bold border transition-all ${
                        tradeLots === l
                          ? 'bg-indigo-600 text-white border-indigo-500'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {l} ({l * currentData.lotSize})
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800">
                  <span className="opacity-60 text-[10px] block">Stop Loss</span>
                  <span className="font-bold text-rose-400">₹{tradeModalStrike.stopLoss}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-950/40 border border-slate-800">
                  <span className="opacity-60 text-[10px] block">Target 1</span>
                  <span className="font-bold text-emerald-400">₹{tradeModalStrike.target1}</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-[11px]">
                Total Margin Capital Required: ₹
                {(tradeModalStrike.premiumLtp * tradeLots * currentData.lotSize).toLocaleString('en-IN', {
                  maximumFractionDigits: 2,
                })}
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setTradeModalStrike(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 font-mono font-bold text-xs hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => handleExecuteFyersOrder(tradeModalStrike, tradeLots)}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-indigo-600 text-white font-mono font-black text-xs shadow-lg shadow-emerald-500/20"
              >
                Confirm Execution
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INDEX OPTION ALERT MODAL */}
      <IndexOptionAlertModal
        isOpen={isAlertModalOpen}
        onClose={() => setIsAlertModalOpen(false)}
        onAlertCreated={handleAlertCreated}
        initialIndex={alertModalInitialConfig.indexSymbol}
        initialMoneyness={alertModalInitialConfig.moneyness}
        initialOptionType={alertModalInitialConfig.optionType}
        initialAction={alertModalInitialConfig.action}
        initialStrike={alertModalInitialConfig.strike}
        indicesData={indicesData}
        theme={theme}
      />

      {/* LIVE ALERT TOAST POPUP BANNER */}
      <IndexAlertToastBanner
        alert={activeToastAlert}
        onDismiss={() => setActiveToastAlert(null)}
        onTradeNow={handleTradeFromAlert}
        theme={theme}
      />

      {/* MARKET HOURS & FALSE SIGNAL AUDIT MODAL */}
      <IndexMarketHoursAuditModal
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        indicesData={indicesData}
        fyersLiveStatus={fyersLiveStatus}
        fyersAppId={fyersAppId}
        theme={theme}
      />

      {/* DEDICATED FYERS WEBSOCKET TELEMETRY & TICK INSPECTOR MODAL */}
      <FyersWebSocketTelemetryModal
        isOpen={isWsModalOpen}
        onClose={() => setIsWsModalOpen(false)}
        selectedIndex={selectedIndex}
        theme={theme}
      />
    </div>
  );
};
