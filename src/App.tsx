import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { AiAnalysisView } from './components/AiAnalysisView';
import { AlertsView } from './components/AlertsView';
import { BrokerConfigView } from './components/BrokerConfigView';
import { Header } from './components/Header';
import { KpiOverview } from './components/KpiOverview';
import { MasterScannerTable } from './components/MasterScannerTable';
import { InstitutionalScannerView } from './components/InstitutionalScannerView';
import { SmartMoneyAccumulationScannerView } from './components/SmartMoneyAccumulationScannerView';
import { MarketHeatmap } from './components/MarketHeatmap';
import { LiveNewsCorporateActionsView } from './components/LiveNewsCorporateActionsView';
import { LiveOiAiRecommendationsView } from './components/LiveOiAiRecommendationsView';
import { BacktestView } from './components/BacktestView';
import { MarketScheduleView } from './components/MarketScheduleView';
import { PythonExporterView } from './components/PythonExporterView';
import { StrategyMatrixView } from './components/StrategyMatrixView';
import { MarketVolatilityView } from './components/MarketVolatilityView';
import { SegmentSignalsView } from './components/SegmentSignalsView';
import { GiftNiftyView } from './components/GiftNiftyView';
import { SectorPerformanceView } from './components/SectorPerformanceView';
import { InstitutionalDealFlowView } from './components/InstitutionalDealFlowView';
import { GapRelativeStrengthScannerView } from './components/GapRelativeStrengthScannerView';
import { PatrickNillAuctionV2View } from './components/PatrickNillAuctionV2View';
import { HwsV1InstitutionalSetupView } from './components/HwsV1InstitutionalSetupView';
import { SmfInstitutionalScreenerView } from './components/SmfInstitutionalScreenerView';
import { FormulaDiagnosticsDashboard } from './components/FormulaDiagnosticsDashboard';
import { IndexOptionsScannerView } from './components/IndexOptionsScannerView';
import { V9GreeksQuantDashboard } from './components/V9GreeksQuantDashboard';
import { V9VegaGreeksPipelineView } from './components/V9VegaGreeksPipelineView';
import { generateIndexIntelligence } from './utils/indexOptionsEngine';
import { TopVolumeFnoEngineView } from './components/TopVolumeFnoEngineView';
import { HollyAiEngineView } from './components/HollyAiEngineView';
import { SignalCorrelationMatrixView } from './components/SignalCorrelationMatrixView';
import { BeginnerDashboardView } from './components/BeginnerDashboardView';
import { ProfessionalMomentumDashboardView } from './components/ProfessionalMomentumDashboardView';
import { QuantScreenerModelView } from './components/QuantScreenerModelView';
import { TredyeQuantDashboardView } from './components/TredyeQuantDashboardView';
import { StockDetailModal } from './components/StockDetailModal';
import { TopPickCards } from './components/TopPickCards';
import { UtmGeneratorModal } from './components/UtmGeneratorModal';
import {
  INITIAL_BULK_ORDERS,
  INITIAL_CORPORATE_ACTIONS,
  INITIAL_NEWS,
} from './data/initialNewsData';
import { checkAndTriggerPriceAlerts, checkOrderQtyAndRvolAlerts } from './utils/priceAlerts';
import { safeFetchJson } from './utils/apiClient';
import { isMarketHours, getMarketHoursDiagnostics } from './utils/marketHours';
import {
  AlertConfig,
  AlertLogItem,
  BrokerConfig,
  BulkOrder,
  CorporateAction,
  MarketOverview,
  NewsItem,
  ScannedStock,
  TradePosition,
} from './types';

export default function App() {
  const [experienceMode, setExperienceMode] = useState<'beginner' | 'pro'>(() => {
    const saved = localStorage.getItem('app_experience_mode');
    if (saved === 'pro' || saved === 'beginner') return saved as 'beginner' | 'pro';
    return 'beginner';
  });

  const [activeTab, setActiveTab] = useState<string>(() => {
    const savedMode = localStorage.getItem('app_experience_mode');
    return savedMode === 'pro' ? 'v9-vega-greeks' : 'beginner-home';
  });

  const handleToggleExperienceMode = (mode: 'beginner' | 'pro') => {
    setExperienceMode(mode);
    localStorage.setItem('app_experience_mode', mode);
  };

  const [theme, setTheme] = useState<'dark' | 'light' | 'midnight' | 'emerald'>(() => {
    const saved = localStorage.getItem('app_theme');
    if (saved === 'light' || saved === 'midnight' || saved === 'emerald' || saved === 'dark') {
      return saved as 'dark' | 'light' | 'midnight' | 'emerald';
    }
    return 'dark';
  });

  const [stocks, setStocks] = useState<ScannedStock[]>([]);
  const [topBuy, setTopBuy] = useState<ScannedStock[]>([]);
  const [topSell, setTopSell] = useState<ScannedStock[]>([]);
  const [selectedStock, setSelectedStock] = useState<ScannedStock | null>(null);
  const [isUtmModalOpen, setIsUtmModalOpen] = useState<boolean>(false);

  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(false);

  const handleSelectTheme = (newTheme: 'dark' | 'light' | 'midnight' | 'emerald') => {
    setTheme(newTheme);
    localStorage.setItem('app_theme', newTheme);
  };

  const toggleTheme = () => {
    const order: Array<'dark' | 'midnight' | 'emerald' | 'light'> = ['dark', 'midnight', 'emerald', 'light'];
    const nextIdx = (order.indexOf(theme) + 1) % order.length;
    handleSelectTheme(order[nextIdx]);
  };

  const [broker, setBroker] = useState<BrokerConfig>({
    selectedBroker: 'fyers',
    apiKey: 'RMR62XB492-100',
    apiSecret: '0WF68SFOJD',
    accessToken: '',
    fyersAppId: 'RMR62XB492-100',
    fyersAccessToken: '',
    status: 'connected',
  });

  const [alertsConfig, setAlertsConfig] = useState<AlertConfig>({
    minScoreToAlert: 90,
    enableOrderQtyAlert: true,
    minOrderSizeQty: 50000,
    minRvolForOrderAlert: 1.5,
    orderTypeFilter: 'BOTH',
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
  });

  const [alertLogs, setAlertLogs] = useState<AlertLogItem[]>([]);
  const [trades, setTrades] = useState<TradePosition[]>([]);
  const [news, setNews] = useState<NewsItem[]>(INITIAL_NEWS);
  const [corporateActions, setCorporateActions] = useState<CorporateAction[]>(INITIAL_CORPORATE_ACTIONS);
  const [bulkOrders, setBulkOrders] = useState<BulkOrder[]>(INITIAL_BULK_ORDERS);

  const [overview, setOverview] = useState<MarketOverview>({
    nifty50: { price: 24520.4, change: 185.3, changePercent: 0.76 },
    bankNifty: { price: 52140.8, change: 412.5, changePercent: 0.8 },
    niftyIT: { price: 39850.2, change: -120.4, changePercent: -0.3 },
    scannedCount: 200,
    buyCount: 0,
    sellCount: 0,
    highRvolCount: 0,
    lastScanTime: new Date().toISOString(),
    marketStatus: 'OPEN',
  });

  // Audio Beep generator using Web Audio API
  const playAlertSound = () => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      // Audio context fallback
    }
  };

  const fetchScanResults = async () => {
    try {
      const data = await safeFetchJson<any>('/api/scan/results');
      if (data) {
        if (data.stocks) {
          setStocks(data.stocks);
          checkAndTriggerPriceAlerts(data.stocks);
          const newOrderAlerts = checkOrderQtyAndRvolAlerts(data.stocks, alertsConfig);
          if (newOrderAlerts.length > 0) {
            setAlertLogs((prev) => {
              const map = new Map();
              [...newOrderAlerts, ...prev].forEach((item) => {
                if (item && item.id && !map.has(item.id)) map.set(item.id, item);
              });
              return Array.from(map.values()).slice(0, 50);
            });
            playAlertSound();
          }
        }
        if (data.top10Buy) setTopBuy(data.top10Buy);
        if (data.top10Sell) setTopSell(data.top10Sell);
        if (data.overview) setOverview(data.overview);
        if (data.broker) setBroker(data.broker);
        if (data.alerts) setAlertsConfig(data.alerts);
        if (data.news && Array.isArray(data.news) && data.news.length > 0) setNews(data.news);
        if (data.corporateActions && Array.isArray(data.corporateActions) && data.corporateActions.length > 0)
          setCorporateActions(data.corporateActions);
        if (data.bulkOrders && Array.isArray(data.bulkOrders) && data.bulkOrders.length > 0)
          setBulkOrders(data.bulkOrders);
      }

      // Check alert logs
      const logsData = await safeFetchJson<AlertLogItem[]>('/api/alerts/history');
      if (Array.isArray(logsData)) {
        setAlertLogs((prev) => {
          const map = new Map();
          [...logsData, ...prev].forEach((item) => {
            if (item && item.id && !map.has(item.id)) map.set(item.id, item);
          });
          return Array.from(map.values()).slice(0, 50);
        });
      }

      // Fetch trades
      const tradesData = await safeFetchJson<TradePosition[]>('/api/trades');
      if (Array.isArray(tradesData)) setTrades(tradesData);

      // Fetch Live Market News
      const newsData = await safeFetchJson<NewsItem[]>('/api/news');
      if (Array.isArray(newsData)) setNews(newsData);

      // Fetch Corporate Actions
      const caData = await safeFetchJson<CorporateAction[]>('/api/corporate-actions');
      if (Array.isArray(caData)) setCorporateActions(caData);

      // Fetch Bulk & Block Orders
      const bulkData = await safeFetchJson<BulkOrder[]>('/api/bulk-orders');
      if (Array.isArray(bulkData)) setBulkOrders(bulkData);
    } catch (e) {
      console.error('Failed to fetch scan results:', e);
    }
  };

  const handleCreateTrade = async (tradeData: {
    symbol: string;
    signal: 'BUY' | 'SELL';
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    target1: number;
    target2: number;
  }) => {
    try {
      const data = await safeFetchJson<{ trade?: TradePosition }>('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tradeData),
      });
      if (data?.trade) {
        playAlertSound();
        fetchScanResults();
      }
    } catch (e) {
      console.error('Failed to create trade:', e);
    }
  };

  const handleCloseTrade = async (tradeId: string) => {
    try {
      const data = await safeFetchJson<{ trade?: TradePosition }>('/api/trades/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tradeId }),
      });
      if (data?.trade) {
        fetchScanResults();
      }
    } catch (e) {
      console.error('Failed to close trade:', e);
    }
  };

  const handleManualScan = async () => {
    setIsScanning(true);
    try {
      await fetch('/api/scan/trigger', { method: 'POST' });
      await fetchScanResults();
      playAlertSound();
    } catch (e) {
      console.error('Failed to trigger manual scan:', e);
    } finally {
      setIsScanning(false);
    }
  };

  // Initial load and periodic polling guarded by isMarketHours (09:15 - 15:30 IST)
  useEffect(() => {
    // Initial fetch to load the latest state snapshot
    fetchScanResults();

    // Automated interval polling: checks isMarketHours validation helper
    // Pauses automated updates outside 09:15-15:30 IST to save API usage and prevent stale signals
    const interval = setInterval(() => {
      if (isMarketHours()) {
        fetchScanResults();
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const handleUpdateAlertConfig = async (newConfig: Partial<AlertConfig>) => {
    try {
      const data = await safeFetchJson<{ config?: AlertConfig }>('/api/alerts/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (data?.config) setAlertsConfig(data.config);
    } catch (e) {
      console.error('Failed to update alert config:', e);
    }
  };

  const handleSendTestAlert = async () => {
    try {
      await safeFetchJson('/api/alerts/test', { method: 'POST' });
      playAlertSound();
      fetchScanResults();
    } catch (e) {
      console.error('Test alert error:', e);
    }
  };

  const handleUpdateBroker = async (newConfig: Partial<BrokerConfig>) => {
    try {
      const data = await safeFetchJson<{ broker?: BrokerConfig }>('/api/broker/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig),
      });
      if (data?.broker) setBroker(data.broker);
    } catch (e) {
      console.error('Failed to update broker config:', e);
    }
  };

  return (
    <div
      className={`min-h-screen transition-colors duration-200 font-sans antialiased selection:bg-indigo-500 selection:text-white ${
        theme === 'midnight'
          ? 'bg-[#0a0e1a] text-slate-100'
          : theme === 'emerald'
          ? 'bg-[#051311] text-emerald-100'
          : theme === 'light'
          ? 'bg-slate-100 text-slate-900'
          : 'bg-slate-950 text-slate-100'
      }`}
    >
      {/* Header */}
      <Header
        overview={overview}
        broker={broker}
        onRefreshScan={handleManualScan}
        isScanning={isScanning}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenUtmModal={() => setIsUtmModalOpen(true)}
        theme={theme}
        onSelectTheme={handleSelectTheme}
        onToggleTheme={toggleTheme}
        experienceMode={experienceMode}
        onToggleExperienceMode={handleToggleExperienceMode}
      />

      {/* Main Content Area */}
      <main className="max-w-[1600px] mx-auto px-3 sm:px-6 lg:px-8 pb-12">
        {activeTab !== 'scanner' && activeTab !== 'beginner-home' && (
          <div
            className={`mb-5 flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl border shadow-lg backdrop-blur-md transition-colors ${
              theme === 'light'
                ? 'bg-white border-slate-200 text-slate-900 shadow-sm'
                : 'bg-slate-900/80 border-slate-800/80 text-slate-100'
            }`}
          >
            <button
              onClick={() => setActiveTab(experienceMode === 'beginner' ? 'beginner-home' : 'scanner')}
              className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 border transition-all cursor-pointer ${
                theme === 'dark'
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-600/30'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600 shadow-md'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>{experienceMode === 'beginner' ? '← Back to Beginner Dashboard' : '← Back to Master Scanner Dashboard'}</span>
            </button>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="opacity-50">Current Page:</span>
              <span className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold uppercase">
                {activeTab.replace('-', ' ')}
              </span>
            </div>
          </div>
        )}

        {activeTab === 'beginner-home' && (
          <BeginnerDashboardView
            stocks={stocks}
            topBuy={topBuy}
            topSell={topSell}
            overview={overview}
            trades={trades}
            onSelectStock={(s) => setSelectedStock(s)}
            onCreateTrade={handleCreateTrade}
            onCloseTrade={handleCloseTrade}
            onSwitchToProMode={(tab) => {
              handleToggleExperienceMode('pro');
              setActiveTab(tab || 'v9-vega-greeks');
            }}
            theme={theme}
            isScanning={isScanning}
            onRefreshScan={handleManualScan}
          />
        )}

        {activeTab === 'momentum-dashboard' && (
          <ProfessionalMomentumDashboardView
            stocks={stocks}
            onSelectStock={(s) => setSelectedStock(s)}
            onExecuteTrade={(stk, sig) =>
              handleCreateTrade({
                symbol: stk.symbol,
                signal: sig,
                entryPrice: stk.price,
                quantity: stk.risk?.recommendedQty || 50,
                stopLoss: stk.risk?.stopLoss || Number((stk.price * (sig === 'BUY' ? 0.985 : 1.015)).toFixed(2)),
                target1: stk.risk?.target1 || Number((stk.price * (sig === 'BUY' ? 1.02 : 0.98)).toFixed(2)),
                target2: stk.risk?.target2 || Number((stk.price * (sig === 'BUY' ? 1.04 : 0.96)).toFixed(2)),
              })
            }
            onBackToScanner={() => setActiveTab(experienceMode === 'beginner' ? 'beginner-home' : 'scanner')}
            theme={theme}
          />
        )}

        {activeTab === 'tredye-dashboard' && (
          <TredyeQuantDashboardView
            stocks={stocks}
            onSelectStock={(s) => setSelectedStock(s)}
            onExecuteTrade={(stk, sig) =>
              handleCreateTrade({
                symbol: stk.symbol,
                signal: sig,
                entryPrice: stk.price,
                quantity: stk.risk?.recommendedQty || 50,
                stopLoss: stk.risk?.stopLoss || Number((stk.price * (sig === 'BUY' ? 0.985 : 1.015)).toFixed(2)),
                target1: stk.risk?.target1 || Number((stk.price * (sig === 'BUY' ? 1.02 : 0.98)).toFixed(2)),
                target2: stk.risk?.target2 || Number((stk.price * (sig === 'BUY' ? 1.04 : 0.96)).toFixed(2)),
              })
            }
            theme={theme}
          />
        )}

        {activeTab === 'quant-screener' && (
          <QuantScreenerModelView
            stocks={stocks}
            onSelectStock={(s) => setSelectedStock(s)}
            onExecuteTrade={(stk, sig) =>
              handleCreateTrade({
                symbol: stk.symbol,
                signal: sig,
                entryPrice: stk.price,
                quantity: stk.risk?.recommendedQty || 50,
                stopLoss: stk.risk?.stopLoss || Number((stk.price * (sig === 'BUY' ? 0.985 : 1.015)).toFixed(2)),
                target1: stk.risk?.target1 || Number((stk.price * (sig === 'BUY' ? 1.02 : 0.98)).toFixed(2)),
                target2: stk.risk?.target2 || Number((stk.price * (sig === 'BUY' ? 1.04 : 0.96)).toFixed(2)),
              })
            }
            theme={theme}
          />
        )}

        {activeTab === 'scanner' && (
          <>
            <KpiOverview overview={overview} stocks={stocks} theme={theme} />
            <TopPickCards
              topBuy={topBuy}
              topSell={topSell}
              onSelectStock={(s) => setSelectedStock(s)}
              theme={theme}
            />
            <MarketHeatmap
              stocks={stocks}
              onSelectStock={(s) => setSelectedStock(s)}
              theme={theme}
            />
            <MasterScannerTable
              stocks={stocks}
              onSelectStock={(s) => setSelectedStock(s)}
              onSwitchToInstScanner={() => setActiveTab('inst-scanner')}
              theme={theme}
              isScanning={isScanning}
              onManualScan={handleManualScan}
              lastScanTime={overview.lastScanTime}
            />
          </>
        )}

        {activeTab === 'inst-scanner' && (
          <InstitutionalScannerView
            stocks={stocks}
            onSelectStock={setSelectedStock}
            onBackToScanner={() => setActiveTab('scanner')}
            theme={theme}
            isScanning={isScanning}
            onManualScan={handleManualScan}
          />
        )}

        {activeTab === 'smart-money-scanner' && (
          <SmartMoneyAccumulationScannerView
            stocks={stocks}
            onSelectStock={setSelectedStock}
            onBackToScanner={() => setActiveTab('scanner')}
            theme={theme === 'light' ? 'light' : 'dark'}
            isScanning={isScanning}
            onManualScan={handleManualScan}
            onCreateTrade={(stock, tradeType) =>
              handleCreateTrade({
                symbol: stock.symbol,
                signal: tradeType,
                entryPrice: stock.price,
                quantity: stock.risk?.recommendedQty || 50,
                stopLoss: stock.risk?.stopLoss || Number((stock.price * 0.985).toFixed(2)),
                target1: stock.risk?.target1 || Number((stock.price * 1.02).toFixed(2)),
                target2: stock.risk?.target2 || Number((stock.price * 1.04).toFixed(2)),
              })
            }
          />
        )}

        {activeTab === 'sector-performance' && (
          <SectorPerformanceView
            stocks={stocks}
            onSelectStock={setSelectedStock}
            onBackToScanner={() => setActiveTab('scanner')}
            theme={theme === 'light' ? 'light' : 'dark'}
          />
        )}

        {activeTab === 'gift-nifty' && (
          <GiftNiftyView
            stocks={stocks}
            onCreateTrade={handleCreateTrade}
            onSelectStock={setSelectedStock}
            onBackToScanner={() => setActiveTab('scanner')}
            theme={theme}
          />
        )}

        {activeTab === 'index-options' && (
          <IndexOptionsScannerView
            onBackToScanner={() => setActiveTab('scanner')}
            theme={theme}
          />
        )}

        {activeTab === 'v9-greeks-dashboard' && (
          <V9GreeksQuantDashboard
            liveStocks={stocks}
            onSelectStockForDeepDive={(stk) => {
              setActiveTab('index-options');
            }}
            onTradeSetup={(trade) => {
              handleCreateTrade({
                symbol: trade.symbol || trade.contractName,
                signal: trade.optionType === 'CE' ? 'BUY' : 'SELL',
                entryPrice: trade.entryPrice || trade.ltp,
                quantity: (trade.lots || 1) * (trade.lotSize || 50),
                stopLoss: trade.stopLoss,
                target1: trade.target1,
                target2: trade.target2,
              });
            }}
            onBackToScanner={() => setActiveTab('scanner')}
            theme={theme}
          />
        )}

        {activeTab === 'v9-vega-greeks' && (
          <V9VegaGreeksPipelineView
            data={generateIndexIntelligence('NIFTY 50')}
            liveStocks={stocks}
            onSelectStrikeForTrade={(trade) => {
              handleCreateTrade({
                symbol: trade.symbol || trade.contractName,
                signal: trade.optionType === 'CE' ? 'BUY' : 'SELL',
                entryPrice: trade.entryPrice || trade.ltp,
                quantity: (trade.lots || 1) * (trade.lotSize || 50),
                stopLoss: trade.stopLoss,
                target1: trade.target1,
                target2: trade.target2,
              });
            }}
            theme={theme}
          />
        )}

        {activeTab === 'top-volume-fno' && (
          <TopVolumeFnoEngineView
            stocks={stocks}
            onSelectStock={setSelectedStock}
            onExecuteTrade={(stk, sig) =>
              handleCreateTrade({
                symbol: stk.symbol,
                signal: sig,
                entryPrice: stk.price,
                quantity: stk.risk?.recommendedQty || 50,
                stopLoss: stk.risk?.stopLoss || Number((stk.price * 0.985).toFixed(2)),
                target1: stk.risk?.target1 || Number((stk.price * 1.02).toFixed(2)),
                target2: stk.risk?.target2 || Number((stk.price * 1.04).toFixed(2)),
              })
            }
            theme={theme}
          />
        )}

        {activeTab === 'holly' && (
          <HollyAiEngineView
            stocks={stocks}
            onCreateTrade={handleCreateTrade}
            onSelectStock={setSelectedStock}
            theme={theme}
          />
        )}

        {activeTab === 'segment-signals' && (
          <SegmentSignalsView
            stocks={stocks}
            onCreateTrade={handleCreateTrade}
            onSelectStock={setSelectedStock}
            theme={theme === 'light' ? 'light' : 'dark'}
          />
        )}

        {activeTab === 'correlation-matrix' && (
          <SignalCorrelationMatrixView
            stocks={stocks}
            onCreateTrade={handleCreateTrade}
            onSelectStock={setSelectedStock}
            theme={theme}
          />
        )}

        {activeTab === 'institutional-deals' && (
          <InstitutionalDealFlowView
            stocks={stocks}
            onSelectStock={setSelectedStock}
            onNavigateToDiagnostics={(sym) => {
              const matched = stocks.find((s) => s.symbol === sym);
              if (matched) setSelectedStock(matched);
              setActiveTab('formula-diagnostics');
            }}
            theme={theme}
          />
        )}

        {activeTab === 'gap-rs' && (
          <GapRelativeStrengthScannerView
            stocks={stocks}
            onSelectStock={setSelectedStock}
            onExecuteTrade={(stk, sig) =>
              handleCreateTrade({
                symbol: stk.symbol,
                signal: sig,
                entryPrice: stk.price,
                quantity: stk.risk?.recommendedQty || 50,
                stopLoss: stk.risk?.stopLoss || Number((stk.price * 0.985).toFixed(2)),
                target1: stk.risk?.target1 || Number((stk.price * 1.02).toFixed(2)),
                target2: stk.risk?.target2 || Number((stk.price * 1.04).toFixed(2)),
              })
            }
            theme={theme}
          />
        )}

        {activeTab === 'smf-screener' && (
          <SmfInstitutionalScreenerView
            stocks={stocks}
            selectedSymbol={selectedStock?.symbol}
            onSelectStock={setSelectedStock}
            onExecuteTrade={(stk, sig) =>
              handleCreateTrade({
                symbol: stk.symbol,
                signal: sig,
                entryPrice: stk.price,
                quantity: stk.risk?.recommendedQty || 50,
                stopLoss: stk.smfResult?.execution?.stopLoss || stk.risk?.stopLoss || Number((stk.price * 0.985).toFixed(2)),
                target1: stk.smfResult?.execution?.target1 || stk.risk?.target1 || Number((stk.price * 1.02).toFixed(2)),
                target2: stk.smfResult?.execution?.target2 || stk.risk?.target2 || Number((stk.price * 1.04).toFixed(2)),
              })
            }
            theme={theme}
          />
        )}

        {activeTab === 'hws-v1' && (
          <HwsV1InstitutionalSetupView
            stocks={stocks}
            selectedSymbol={selectedStock?.symbol}
            onSelectStock={setSelectedStock}
            onExecuteTrade={(stk, sig) =>
              handleCreateTrade({
                symbol: stk.symbol,
                signal: sig,
                entryPrice: stk.price,
                quantity: stk.risk?.recommendedQty || 50,
                stopLoss: stk.hwsV1?.riskLadder?.structuralSL || stk.risk?.stopLoss || Number((stk.price * 0.985).toFixed(2)),
                target1: stk.hwsV1?.riskLadder?.target1_1R || stk.risk?.target1 || Number((stk.price * 1.02).toFixed(2)),
                target2: stk.hwsV1?.riskLadder?.target2_2R || stk.risk?.target2 || Number((stk.price * 1.04).toFixed(2)),
              })
            }
            theme={theme}
          />
        )}

        {activeTab === 'auction-v2' && (
          <PatrickNillAuctionV2View
            stocks={stocks}
            selectedSymbol={selectedStock?.symbol}
            onSelectStock={setSelectedStock}
            onExecuteTrade={(stk, sig) =>
              handleCreateTrade({
                symbol: stk.symbol,
                signal: sig,
                entryPrice: stk.price,
                quantity: stk.risk?.recommendedQty || 50,
                stopLoss: stk.auctionV2?.riskLadder?.structuralSL || stk.risk?.stopLoss || Number((stk.price * 0.985).toFixed(2)),
                target1: stk.auctionV2?.riskLadder?.target1_1R || stk.risk?.target1 || Number((stk.price * 1.02).toFixed(2)),
                target2: stk.auctionV2?.riskLadder?.target2_2R || stk.risk?.target2 || Number((stk.price * 1.04).toFixed(2)),
              })
            }
            theme={theme}
          />
        )}

        {activeTab === 'formula-diagnostics' && (
          <FormulaDiagnosticsDashboard
            stocks={stocks}
            selectedSymbol={selectedStock?.symbol}
            onSelectStock={setSelectedStock}
            onExecuteTrade={(stk, sig) =>
              handleCreateTrade({
                symbol: stk.symbol,
                signal: sig,
                entryPrice: stk.price,
                quantity: stk.risk?.recommendedQty || 50,
                stopLoss: stk.risk?.stopLoss || Number((stk.price * 0.985).toFixed(2)),
                target1: stk.risk?.target1 || Number((stk.price * 1.02).toFixed(2)),
                target2: stk.risk?.target2 || Number((stk.price * 1.04).toFixed(2)),
              })
            }
            theme={theme === 'light' ? 'light' : 'dark'}
          />
        )}

        {activeTab === 'ai-analysis' && (
          <AiAnalysisView topBuy={topBuy} topSell={topSell} theme={theme === 'light' ? 'light' : 'dark'} />
        )}

        {activeTab === 'oi-ai' && (
          <LiveOiAiRecommendationsView
            stocks={stocks}
            theme={theme}
            overview={overview}
            onRefreshScan={handleManualScan}
            onCreateTrade={(t: any) =>
              handleCreateTrade({
                symbol: t.symbol,
                signal: t.type || t.signal || 'BUY',
                entryPrice: t.entryPrice || 0,
                quantity: t.quantity || 50,
                stopLoss: t.stopLoss || 0,
                target1: t.target1 || 0,
                target2: t.target2 || 0,
              })
            }
            onSelectStock={setSelectedStock}
          />
        )}

        {activeTab === 'news' && (
          <LiveNewsCorporateActionsView
            news={news}
            corporateActions={corporateActions}
            bulkOrders={bulkOrders}
            stocks={stocks}
            onCreateTrade={handleCreateTrade}
            onSelectStock={setSelectedStock}
            theme={theme === 'light' ? 'light' : 'dark'}
          />
        )}

        {activeTab === 'backtest' && (
          <BacktestView onCreateTrade={handleCreateTrade} theme={theme === 'light' ? 'light' : 'dark'} />
        )}

        {activeTab === 'schedule' && (
          <MarketScheduleView theme={theme === 'light' ? 'light' : 'dark'} />
        )}

        {activeTab === 'strategy-matrix' && (
          <StrategyMatrixView
            stocks={stocks}
            onSelectStock={(s) => setSelectedStock(s)}
            theme={theme === 'light' ? 'light' : 'dark'}
          />
        )}

        {activeTab === 'volatility' && (
          <MarketVolatilityView
            stocks={stocks}
            onSelectStock={(s) => setSelectedStock(s)}
            onCreateTrade={(stock, type) =>
              handleCreateTrade({
                symbol: stock.symbol,
                signal: type,
                entryPrice: stock.price,
                quantity: stock.risk?.recommendedQty || 50,
                stopLoss: stock.risk?.stopLoss || Number((stock.price * 0.985).toFixed(2)),
                target1: stock.risk?.target1 || Number((stock.price * 1.02).toFixed(2)),
                target2: stock.risk?.target2 || Number((stock.price * 1.04).toFixed(2)),
              })
            }
            theme={theme === 'light' ? 'light' : 'dark'}
          />
        )}

        {activeTab === 'alerts' && (
          <AlertsView
            config={alertsConfig}
            logs={alertLogs}
            trades={trades}
            stocks={stocks}
            news={news}
            onUpdateConfig={handleUpdateAlertConfig}
            onSendTestAlert={handleSendTestAlert}
            onCreateTrade={handleCreateTrade}
            onCloseTrade={handleCloseTrade}
            theme={theme}
          />
        )}

        {activeTab === 'broker' && (
          <BrokerConfigView
            broker={broker}
            onUpdateBroker={handleUpdateBroker}
            theme={theme === 'light' ? 'light' : 'dark'}
          />
        )}

        {activeTab === 'python-code' && <PythonExporterView theme={theme === 'light' ? 'light' : 'dark'} />}
      </main>

      {/* Stock Detail Inspector Modal */}
      <StockDetailModal
        stock={selectedStock}
        news={news}
        corporateActions={corporateActions}
        bulkOrders={bulkOrders}
        onClose={() => setSelectedStock(null)}
        onCreateTrade={handleCreateTrade}
      />

      {/* UTM Share Link Generator Modal (Mobile & Laptop) */}
      <UtmGeneratorModal
        isOpen={isUtmModalOpen}
        onClose={() => setIsUtmModalOpen(false)}
        stocks={stocks}
      />
    </div>
  );
}
