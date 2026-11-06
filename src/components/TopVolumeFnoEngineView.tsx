import React, { useState, useMemo, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Coins,
  Compass,
  DollarSign,
  Download,
  ExternalLink,
  Filter,
  Flame,
  Layers,
  Maximize2,
  Percent,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { ScannedStock } from '../types';
import {
  processTopVolumeFnoScan,
  TopVolumeFnoStock,
  EngineConfig,
  DEFAULT_ENGINE_CONFIG,
  FnoActiveTrade,
  calculateFnoCharges,
} from '../utils/topVolumeFnoEngine';
import { getStockListedAt, getStockEntryTime, getStockExitTime } from '../utils/timingHelpers';
import { runFnoStrategyBacktest, BacktestSummary } from '../utils/fnoBacktestSimulator';
import { getTradingViewSymbol } from '../utils/fyersHelpers';

interface TopVolumeFnoEngineViewProps {
  stocks: ScannedStock[];
  onSelectStock?: (stock: ScannedStock) => void;
  onExecuteTrade?: (stock: ScannedStock, signal: 'BUY' | 'SELL') => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const TopVolumeFnoEngineView: React.FC<TopVolumeFnoEngineViewProps> = ({
  stocks,
  onSelectStock,
  onExecuteTrade,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';

  // Config State
  const [config, setConfig] = useState<EngineConfig>(() => {
    const saved = localStorage.getItem('top_volume_fno_config');
    if (saved) {
      try {
        return { ...DEFAULT_ENGINE_CONFIG, ...JSON.parse(saved) };
      } catch (e) {
        return DEFAULT_ENGINE_CONFIG;
      }
    }
    return DEFAULT_ENGINE_CONFIG;
  });

  const saveConfig = (newConfig: EngineConfig) => {
    setConfig(newConfig);
    localStorage.setItem('top_volume_fno_config', JSON.stringify(newConfig));
  };

  // Active View Tab inside Top-Volume F&O Engine
  const [activeEngineTab, setActiveEngineTab] = useState<
    'SCANNER' | 'DIAGNOSTICS' | 'GREEKS' | 'POSITIONS' | 'TRADE_LOG' | 'BACKTEST'
  >('SCANNER');

  // Filter State
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'QUALIFIED' | 'BUY' | 'SELL' | 'QUALIFIED_BUY' | 'QUALIFIED_SELL'>('ALL');
  const [greeksFilter, setGreeksFilter] = useState<'ALL' | 'FAVORS_OPTION_BUYING' | 'FAVORS_OPTION_SELLING' | 'NEUTRAL_SPREADS'>('ALL');
  const [smartMoneyFilter, setSmartMoneyFilter] = useState<'ALL' | 'ACCUMULATION' | 'ORDER_BLOCK' | 'MARKUP' | 'DISTRIBUTION'>('ALL');
  const [orderFlowFilter, setOrderFlowFilter] = useState<'ALL' | 'BUY_FLOW' | 'SELL_FLOW' | 'DIVERGENCE' | 'ICEBERG'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStockSymbol, setSelectedStockSymbol] = useState<string>('');

  // 60-Minute TradingView Modal State
  const [selected60mChartStock, setSelected60mChartStock] = useState<TopVolumeFnoStock | null>(null);
  const [chart60mInterval, setChart60mInterval] = useState<'60' | '15' | '5' | 'D'>('60');

  // Option Greeks Detail & Simulator Modal State
  const [selectedGreeksModalStock, setSelectedGreeksModalStock] = useState<TopVolumeFnoStock | null>(null);

  // Live Position Manager State (Simulated + Active Execution)
  const [activePositions, setActivePositions] = useState<FnoActiveTrade[]>(() => {
    const saved = localStorage.getItem('fno_active_positions');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const [closedTrades, setClosedTrades] = useState<FnoActiveTrade[]>(() => {
    const saved = localStorage.getItem('fno_closed_trades');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  // Save trades to localStorage
  useEffect(() => {
    localStorage.setItem('fno_active_positions', JSON.stringify(activePositions));
  }, [activePositions]);

  useEffect(() => {
    localStorage.setItem('fno_closed_trades', JSON.stringify(closedTrades));
  }, [closedTrades]);

  // Run the Top-Traded F&O Volume Engine
  const scanResult = useMemo(() => {
    return processTopVolumeFnoScan(stocks, config);
  }, [stocks, config]);

  const { topStocks, totalFnoUniverseCount, topNCount, qualifiedBuyCount, qualifiedSellCount, marketRegime } = scanResult;

  // Option Greeks Strategy Distribution Counts
  const optionBuyingCount = useMemo(
    () => topStocks.filter((s) => s.greeksStrategyBias === 'FAVORS_OPTION_BUYING').length,
    [topStocks]
  );
  const optionSellingCount = useMemo(
    () => topStocks.filter((s) => s.greeksStrategyBias === 'FAVORS_OPTION_SELLING').length,
    [topStocks]
  );
  const spreadsCount = useMemo(
    () => topStocks.filter((s) => s.greeksStrategyBias === 'NEUTRAL_SPREADS').length,
    [topStocks]
  );

  // Auto select highest scoring stock initially if none selected
  useEffect(() => {
    if (topStocks.length > 0 && !selectedStockSymbol) {
      const topPick = [...topStocks].sort((a, b) => b.overallScore - a.overallScore)[0];
      if (topPick) setSelectedStockSymbol(topPick.symbol);
    }
  }, [topStocks, selectedStockSymbol]);

  const selectedStockData = useMemo(() => {
    return topStocks.find((s) => s.symbol === selectedStockSymbol) || topStocks[0] || null;
  }, [topStocks, selectedStockSymbol]);

  // Filtered Top-N Stocks
  const filteredStocks = useMemo(() => {
    return topStocks.filter((s) => {
      if (directionFilter === 'BUY' && s.signalType !== 'BUY') return false;
      if (directionFilter === 'SELL' && s.signalType !== 'SELL') return false;
      if (directionFilter === 'QUALIFIED' && !s.isEntryQualified) return false;
      if (directionFilter === 'QUALIFIED_BUY' && !(s.signalType === 'BUY' && s.isEntryQualified)) return false;
      if (directionFilter === 'QUALIFIED_SELL' && !(s.signalType === 'SELL' && s.isEntryQualified)) return false;
      if (greeksFilter !== 'ALL' && s.greeksStrategyBias !== greeksFilter) return false;
      
      // Smart Money filters
      if (smartMoneyFilter === 'ACCUMULATION' && !s.wyckoffPhase.includes('SPRING') && !s.wyckoffPhase.includes('SOS') && (s.accumulationScore ?? 0) < 70) return false;
      if (smartMoneyFilter === 'ORDER_BLOCK' && !s.smcSetupType.includes('ORDER_BLOCK')) return false;
      if (smartMoneyFilter === 'MARKUP' && !s.wyckoffPhase.includes('MARKUP')) return false;
      if (smartMoneyFilter === 'DISTRIBUTION' && !s.wyckoffPhase.includes('DISTRIBUTION') && !s.wyckoffPhase.includes('UTAD') && !s.wyckoffPhase.includes('MARKDOWN')) return false;

      // Order Flow Delta filters
      if (orderFlowFilter === 'BUY_FLOW' && !s.orderFlowBias.includes('BUY') && (s.cumulativeDeltaCr ?? 0) <= 0) return false;
      if (orderFlowFilter === 'SELL_FLOW' && !s.orderFlowBias.includes('SELL') && (s.cumulativeDeltaCr ?? 0) >= 0) return false;
      if (orderFlowFilter === 'DIVERGENCE' && (!s.deltaDivergence || s.deltaDivergence === 'NONE' || s.deltaDivergence === 'REGULAR_CONFLUENCE')) return false;
      if (orderFlowFilter === 'ICEBERG' && !s.icebergAbsorption) return false;

      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || s.sector.toLowerCase().includes(q);
      }
      return true;
    });
  }, [topStocks, directionFilter, greeksFilter, smartMoneyFilter, orderFlowFilter, searchQuery]);

  // Handle Trade Execution
  const handleOpenTrade = (stock: TopVolumeFnoStock, customDirection?: 'BUY' | 'SELL') => {
    const direction = customDirection || (stock.signalType === 'SELL' ? 'SELL' : 'BUY');
    const existing = activePositions.find((p) => p.symbol === stock.symbol && p.status !== 'CLOSED');
    if (existing) {
      alert(`Trade for ${stock.symbol} is already OPEN.`);
      return;
    }

    const tradeId = `FNO_${stock.symbol}_${Date.now().toString().slice(-6)}`;
    const newTrade: FnoActiveTrade = {
      id: tradeId,
      symbol: stock.symbol,
      sector: stock.sector,
      volumeRank: stock.volumeRank,
      direction,
      status: 'OPEN',
      entryPrice: stock.entryPrice,
      currentPrice: stock.price,
      quantity: stock.recommendedQty,
      lots: stock.recommendedLots,
      lotSize: stock.lotSize,
      stopLoss: stock.stopLoss,
      initialStopLoss: stock.stopLoss,
      target1: stock.target1,
      target2: stock.target2,
      target3: stock.target3,
      riskPerShare: stock.riskPerShare,
      entryTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      lastUpdated: new Date().toLocaleTimeString('en-IN'),
      scoreAtEntry: stock.overallScore,
      rvolAtEntry: stock.rvol,
      oiBuildupAtEntry: stock.oiBuildup,
      grossPnL: 0,
      charges: calculateFnoCharges(stock.entryPrice, stock.entryPrice, stock.recommendedQty, true),
      netPnL: 0,
      netPnLPercent: 0,
      holdingTimeMinutes: 1,
      t1Hit: false,
      t2Hit: false,
      t3Hit: false,
      slHit: false,
    };

    setActivePositions((prev) => [newTrade, ...prev]);
    setActiveEngineTab('POSITIONS');

    if (onExecuteTrade) {
      onExecuteTrade(stock.rawStock, direction);
    }
  };

  // Close Position
  const handleClosePosition = (tradeId: string, exitReason: string = 'MANUAL_EXIT') => {
    const trade = activePositions.find((p) => p.id === tradeId);
    if (!trade) return;

    const exitPrice = trade.currentPrice;
    const isBull = trade.direction === 'BUY';
    const grossPnL = isBull
      ? Number(((exitPrice - trade.entryPrice) * trade.quantity).toFixed(2))
      : Number(((trade.entryPrice - exitPrice) * trade.quantity).toFixed(2));

    const charges = calculateFnoCharges(trade.entryPrice, exitPrice, trade.quantity, true);
    const netPnL = Number((grossPnL - charges.totalCharges).toFixed(2));
    const netPnLPercent = Number(((netPnL / (trade.entryPrice * trade.quantity * 0.2)) * 100).toFixed(2));

    const closed: FnoActiveTrade = {
      ...trade,
      status: 'CLOSED',
      exitTime: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      exitPrice,
      exitReason,
      grossPnL,
      charges,
      netPnL,
      netPnLPercent,
    };

    setActivePositions((prev) => prev.filter((p) => p.id !== tradeId));
    setClosedTrades((prev) => [closed, ...prev]);
  };

  // Run Backtest
  const [backtestResult, setBacktestResult] = useState<BacktestSummary | null>(null);
  const handleRunBacktest = () => {
    const res = runFnoStrategyBacktest(topStocks, config.capital, config.entryScoreThreshold);
    setBacktestResult(res);
  };

  useEffect(() => {
    if (topStocks.length > 0 && !backtestResult) {
      handleRunBacktest();
    }
  }, [topStocks]);

  return (
    <div className="space-y-6 font-sans">
      {/* ------------------------------------------------------------- */}
      {/* 1. MASTER HEADER & TOP-VOLUME MARKET REGIME BAROMETER */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`p-5 sm:p-6 rounded-3xl border shadow-xl transition-all relative overflow-hidden ${
          isDark
            ? 'bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-slate-800 text-slate-100'
            : 'bg-gradient-to-r from-indigo-50/70 via-white to-slate-50 border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
          {/* Title & Roadmap Tag */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className="w-10 h-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/30">
                <Flame className="w-5 h-5 fill-current animate-pulse" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black italic font-mono uppercase tracking-tight">
                TOP-TRADED-BY-VOLUME F&amp;O INTRADAY ENGINE
              </h2>
              <span className="px-2.5 py-0.5 text-[10px] font-mono font-black rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                TOP {config.topN} ONLY
              </span>
              <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                15M REGIME + 5M 100-PT STRATEGY
              </span>
            </div>
            <p className="text-xs opacity-70 font-sans max-w-3xl">
              Pre-filters the entire NSE F&amp;O universe by real-time traded volume and liquidity. Only the selected Top {config.topN} volume stocks are processed. All other F&amp;O stocks are strictly hidden.
            </p>
          </div>

          {/* Market-Level Filter Confluence */}
          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            {/* NIFTY 15M Trend */}
            <div
              className={`px-3 py-2 rounded-2xl border text-xs font-mono flex items-center gap-2 ${
                isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <span className="opacity-60 text-[10px]">NIFTY:</span>
              <span
                className={`font-black flex items-center gap-1 ${
                  marketRegime.niftyTrend === 'BULLISH'
                    ? 'text-emerald-400'
                    : marketRegime.niftyTrend === 'BEARISH'
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }`}
              >
                {marketRegime.niftyTrend === 'BULLISH' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                <span>{marketRegime.niftyTrend}</span>
              </span>
            </div>

            {/* BANK NIFTY */}
            <div
              className={`px-3 py-2 rounded-2xl border text-xs font-mono flex items-center gap-2 ${
                isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <span className="opacity-60 text-[10px]">BANKNIFTY:</span>
              <span
                className={`font-black flex items-center gap-1 ${
                  marketRegime.bankNiftyTrend === 'BULLISH'
                    ? 'text-emerald-400'
                    : marketRegime.bankNiftyTrend === 'BEARISH'
                    ? 'text-rose-400'
                    : 'text-amber-400'
                }`}
              >
                {marketRegime.bankNiftyTrend === 'BULLISH' ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                <span>{marketRegime.bankNiftyTrend}</span>
              </span>
            </div>

            {/* INDIA VIX */}
            <div
              className={`px-3 py-2 rounded-2xl border text-xs font-mono flex items-center gap-2 ${
                isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <span className="opacity-60 text-[10px]">INDIA VIX:</span>
              <span className="font-bold text-amber-300">{marketRegime.vixValue}</span>
            </div>

            {/* Total Top-N CVD */}
            <div
              className={`px-3 py-2 rounded-2xl border text-xs font-mono flex items-center gap-2 ${
                isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-200'
              }`}
              title="Net Cumulative Volume Delta across Top-N Traded Universe"
            >
              <span className="opacity-60 text-[10px]">TOP-{config.topN} NET CVD:</span>
              <span
                className={`font-black flex items-center gap-1 ${
                  marketRegime.totalNetCvdCr >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                <span>{marketRegime.totalNetCvdCr >= 0 ? '▲ +' : '▼ '}₹{Math.abs(marketRegime.totalNetCvdCr)} Cr</span>
              </span>
            </div>

            {/* Breadth */}
            <div
              className={`px-3 py-2 rounded-2xl border text-xs font-mono flex items-center gap-2 ${
                isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <span className="opacity-60 text-[10px]">BREADTH:</span>
              <span className="text-emerald-400 font-bold">{marketRegime.advances} ▲</span>
              <span className="opacity-40">/</span>
              <span className="text-rose-400 font-bold">{marketRegime.declines} ▼</span>
            </div>
          </div>
        </div>

        {/* TOP N CONTROLS & FILTER BAR */}
        <div className="mt-5 pt-4 border-t border-slate-800/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
            <span className="opacity-60 uppercase font-bold text-[11px] flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-indigo-400" />
              <span>TOP VOLUME FILTER:</span>
            </span>

            {/* Top N Quick Selectors */}
            {[10, 15, 20, 25, 30].map((n) => (
              <button
                key={n}
                onClick={() => saveConfig({ ...config, topN: n })}
                className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                  config.topN === n
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : isDark
                    ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Top {n}
              </button>
            ))}

            {/* Min Traded Value */}
            <div className="flex items-center gap-1 ml-2">
              <span className="opacity-50 text-[10px]">MIN VALUE:</span>
              <select
                value={config.minTradedValueCrores}
                onChange={(e) => saveConfig({ ...config, minTradedValueCrores: Number(e.target.value) })}
                className={`px-2.5 py-1 rounded-xl font-bold border text-xs ${
                  isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                <option value={25}>₹25 Cr</option>
                <option value={50}>₹50 Cr</option>
                <option value={100}>₹100 Cr</option>
                <option value={200}>₹200 Cr</option>
              </select>
            </div>

            {/* Entry Threshold */}
            <div className="flex items-center gap-1 ml-2">
              <span className="opacity-50 text-[10px]">ENTRY SCORE:</span>
              <select
                value={config.entryScoreThreshold}
                onChange={(e) => saveConfig({ ...config, entryScoreThreshold: Number(e.target.value) })}
                className={`px-2.5 py-1 rounded-xl font-bold border text-xs ${
                  isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                <option value={75}>Score ≥ 75</option>
                <option value={80}>Score ≥ 80 (Standard)</option>
                <option value={85}>Score ≥ 85 (High Conviction)</option>
                <option value={90}>Score ≥ 90 (Extreme)</option>
              </select>
            </div>
          </div>

          {/* Quick Metrics Badges (Clickable Filters) */}
          <div className="flex items-center gap-2 flex-wrap text-xs font-mono shrink-0">
            <button
              onClick={() => {
                setDirectionFilter(directionFilter === 'QUALIFIED_BUY' ? 'ALL' : 'QUALIFIED_BUY');
                setActiveEngineTab('SCANNER');
              }}
              className={`px-3 py-1 rounded-xl border font-bold transition-all cursor-pointer ${
                directionFilter === 'QUALIFIED_BUY'
                  ? 'bg-emerald-600 text-white border-emerald-400 ring-2 ring-emerald-400/40 shadow-lg shadow-emerald-600/30'
                  : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/30'
              }`}
              title="Click to show only Qualified BUY signals (Score ≥ Threshold)"
            >
              🟢 {qualifiedBuyCount} BUYS
            </button>

            <button
              onClick={() => {
                setDirectionFilter(directionFilter === 'QUALIFIED_SELL' ? 'ALL' : 'QUALIFIED_SELL');
                setActiveEngineTab('SCANNER');
              }}
              className={`px-3 py-1 rounded-xl border font-bold transition-all cursor-pointer ${
                directionFilter === 'QUALIFIED_SELL'
                  ? 'bg-rose-600 text-white border-rose-400 ring-2 ring-rose-400/40 shadow-lg shadow-rose-600/30'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-rose-500/30'
              }`}
              title="Click to show only Qualified SELL signals (Score ≥ Threshold)"
            >
              🔴 {qualifiedSellCount} SELLS
            </button>

            <button
              onClick={() => {
                setGreeksFilter(greeksFilter === 'FAVORS_OPTION_BUYING' ? 'ALL' : 'FAVORS_OPTION_BUYING');
                setActiveEngineTab('SCANNER');
              }}
              className={`px-3 py-1 rounded-xl border font-bold transition-all cursor-pointer ${
                greeksFilter === 'FAVORS_OPTION_BUYING'
                  ? 'bg-indigo-600 text-white border-indigo-400 ring-2 ring-indigo-400/40 shadow-lg shadow-indigo-600/30'
                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/30'
              }`}
              title="Click to show stocks favoring Option Buying (Cheap IV + High Momentum)"
            >
              ⚡ {optionBuyingCount} OPTION BUYING
            </button>

            <button
              onClick={() => {
                setGreeksFilter(greeksFilter === 'FAVORS_OPTION_SELLING' ? 'ALL' : 'FAVORS_OPTION_SELLING');
                setActiveEngineTab('SCANNER');
              }}
              className={`px-3 py-1 rounded-xl border font-bold transition-all cursor-pointer ${
                greeksFilter === 'FAVORS_OPTION_SELLING'
                  ? 'bg-purple-600 text-white border-purple-400 ring-2 ring-purple-400/40 shadow-lg shadow-purple-600/30'
                  : 'bg-purple-500/20 text-purple-300 border-purple-500/30 hover:bg-purple-500/30'
              }`}
              title="Click to show stocks favoring Option Selling (Elevated IV / Theta Decay)"
            >
              🛡️ {optionSellingCount} OPTION SELLING
            </button>

            <button
              onClick={() => {
                setSmartMoneyFilter(smartMoneyFilter === 'ACCUMULATION' ? 'ALL' : 'ACCUMULATION');
                setActiveEngineTab('SCANNER');
              }}
              className={`px-3 py-1 rounded-xl border font-bold transition-all cursor-pointer ${
                smartMoneyFilter === 'ACCUMULATION'
                  ? 'bg-indigo-600 text-white border-indigo-400 ring-2 ring-indigo-400/40 shadow-lg shadow-indigo-600/30'
                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/30'
              }`}
              title="Click to show Smart Money Accumulation setups"
            >
              🏦 {marketRegime.smartMoneyAccumulationCount} SMART ACCUM
            </button>

            <span className="px-3 py-1 rounded-xl bg-slate-800 text-slate-300 border border-slate-700">
              📊 {topNCount} / {totalFnoUniverseCount} PROCESSED
            </span>
          </div>
        </div>

        {/* SUB-NAVIGATION TABS */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 mt-4 pt-4 border-t border-slate-800/60 text-xs font-mono">
          <button
            onClick={() => setActiveEngineTab('SCANNER')}
            className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeEngineTab === 'SCANNER'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : isDark
                ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-emerald-400" />
            <span>TOP {config.topN} SCANNER MATRIX</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">
              {topStocks.length}
            </span>
          </button>

          <button
            onClick={() => setActiveEngineTab('DIAGNOSTICS')}
            className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeEngineTab === 'DIAGNOSTICS'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : isDark
                ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4 text-indigo-300" />
            <span>100-POINT DIAGNOSTICS &amp; RISK SIZER</span>
            {selectedStockData && (
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/30 text-indigo-200 font-bold">
                {selectedStockData.symbol} ({selectedStockData.overallScore} PTS)
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveEngineTab('GREEKS')}
            className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeEngineTab === 'GREEKS'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : isDark
                ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-400" />
            <span>OPTION GREEKS BIAS &amp; MATRIX</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
              {topStocks.length}
            </span>
          </button>

          <button
            onClick={() => setActiveEngineTab('POSITIONS')}
            className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeEngineTab === 'POSITIONS'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : isDark
                ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-400" />
            <span>ACTIVE POSITIONS MONITOR</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
              {activePositions.length} OPEN
            </span>
          </button>

          <button
            onClick={() => setActiveEngineTab('TRADE_LOG')}
            className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeEngineTab === 'TRADE_LOG'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : isDark
                ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Clock className="w-4 h-4 text-cyan-400" />
            <span>P&amp;L LEDGER &amp; TRADE LOG</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300">
              {closedTrades.length} CLOSED
            </span>
          </button>

          <button
            onClick={() => setActiveEngineTab('BACKTEST')}
            className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shrink-0 ${
              activeEngineTab === 'BACKTEST'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : isDark
                ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>WALK-FORWARD BACKTESTER</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold">
              {backtestResult?.winRatePercent || 72}% WIN
            </span>
          </button>
        </div>
      </div>

      {/* ============================================================= */}
      {/* TAB 1: TOP-N VOLUME SCANNER MATRIX                            */}
      {/* ============================================================= */}
      {activeEngineTab === 'SCANNER' && (
        <div className="space-y-4">
          {/* Quick Filters */}
          <div
            className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search Top-N Symbol / Sector..."
                className={`px-3 py-1.5 rounded-xl text-xs font-mono border focus:outline-none focus:border-indigo-500 w-64 ${
                  isDark ? 'bg-slate-950 border-slate-700 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />

              <div className="flex items-center gap-1 text-xs font-mono flex-wrap">
                <button
                  onClick={() => setDirectionFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    directionFilter === 'ALL'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : isDark
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  All ({topStocks.length})
                </button>
                <button
                  onClick={() => setDirectionFilter('QUALIFIED')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    directionFilter === 'QUALIFIED'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : isDark
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  🔥 All Qualified ({topStocks.filter((s) => s.isEntryQualified).length})
                </button>
                <button
                  onClick={() => setDirectionFilter('BUY')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    directionFilter === 'BUY'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : isDark
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  🟢 All Buy ({topStocks.filter((s) => s.signalType === 'BUY').length})
                </button>
                <button
                  onClick={() => setDirectionFilter('SELL')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    directionFilter === 'SELL'
                      ? 'bg-rose-600 text-white shadow-sm'
                      : isDark
                      ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  🔴 All Sell ({topStocks.filter((s) => s.signalType === 'SELL').length})
                </button>
                <button
                  onClick={() => setDirectionFilter('QUALIFIED_BUY')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    directionFilter === 'QUALIFIED_BUY'
                      ? 'bg-emerald-600 text-white shadow-sm ring-1 ring-emerald-300'
                      : isDark
                      ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-900/50'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  🟢 Qual Buys ({qualifiedBuyCount})
                </button>
                <button
                  onClick={() => setDirectionFilter('QUALIFIED_SELL')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    directionFilter === 'QUALIFIED_SELL'
                      ? 'bg-rose-600 text-white shadow-sm ring-1 ring-rose-300'
                      : isDark
                      ? 'bg-rose-950/40 text-rose-300 border border-rose-500/30 hover:bg-rose-900/50'
                      : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                  }`}
                >
                  🔴 Qual Sells ({qualifiedSellCount})
                </button>

                <div className="h-4 w-px bg-slate-700 mx-1 hidden sm:block" />

                {/* Smart Money Filters */}
                <button
                  onClick={() => setSmartMoneyFilter(smartMoneyFilter === 'ACCUMULATION' ? 'ALL' : 'ACCUMULATION')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    smartMoneyFilter === 'ACCUMULATION'
                      ? 'bg-amber-600 text-white ring-2 ring-amber-400/50'
                      : isDark
                      ? 'bg-slate-800/80 text-amber-300 border border-amber-500/30 hover:bg-amber-950/40'
                      : 'bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100'
                  }`}
                  title="Filter stocks showing Wyckoff Accumulation Spring/SOS or Score >= 70"
                >
                  🏦 Wyckoff Accum ({topStocks.filter((s) => s.wyckoffPhase.includes('SPRING') || s.wyckoffPhase.includes('SOS') || (s.accumulationScore ?? 0) >= 70).length})
                </button>

                <button
                  onClick={() => setSmartMoneyFilter(smartMoneyFilter === 'ORDER_BLOCK' ? 'ALL' : 'ORDER_BLOCK')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    smartMoneyFilter === 'ORDER_BLOCK'
                      ? 'bg-cyan-600 text-white ring-2 ring-cyan-400/50'
                      : isDark
                      ? 'bg-slate-800/80 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-950/40'
                      : 'bg-cyan-50 text-cyan-700 border border-cyan-200 hover:bg-cyan-100'
                  }`}
                  title="Filter stocks interacting with Institutional SMC Order Blocks"
                >
                  🎯 SMC Order Block ({topStocks.filter((s) => s.smcSetupType.includes('ORDER_BLOCK')).length})
                </button>

                <div className="h-4 w-px bg-slate-700 mx-1 hidden sm:block" />

                {/* Order Flow Filters */}
                <button
                  onClick={() => setOrderFlowFilter(orderFlowFilter === 'BUY_FLOW' ? 'ALL' : 'BUY_FLOW')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    orderFlowFilter === 'BUY_FLOW'
                      ? 'bg-emerald-600 text-white ring-2 ring-emerald-400/50'
                      : isDark
                      ? 'bg-slate-800/80 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-950/40'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                  title="Filter stocks with Aggressive Buying Order Flow & Positive CVD"
                >
                  📊 Net Buy CVD ({topStocks.filter((s) => (s.cumulativeDeltaCr ?? 0) > 0).length})
                </button>

                <button
                  onClick={() => setOrderFlowFilter(orderFlowFilter === 'DIVERGENCE' ? 'ALL' : 'DIVERGENCE')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    orderFlowFilter === 'DIVERGENCE'
                      ? 'bg-yellow-600 text-white ring-2 ring-yellow-400/50'
                      : isDark
                      ? 'bg-slate-800/80 text-yellow-300 border border-yellow-500/30 hover:bg-yellow-950/40'
                      : 'bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100'
                  }`}
                  title="Filter stocks showing Delta Divergence (smart money absorption against price)"
                >
                  ⚡ Divergence ({topStocks.filter((s) => s.deltaDivergence && s.deltaDivergence !== 'NONE' && s.deltaDivergence !== 'REGULAR_CONFLUENCE').length})
                </button>

                <button
                  onClick={() => setOrderFlowFilter(orderFlowFilter === 'ICEBERG' ? 'ALL' : 'ICEBERG')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    orderFlowFilter === 'ICEBERG'
                      ? 'bg-sky-600 text-white ring-2 ring-sky-400/50'
                      : isDark
                      ? 'bg-slate-800/80 text-sky-300 border border-sky-500/30 hover:bg-sky-950/40'
                      : 'bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100'
                  }`}
                  title="Filter stocks with Institutional Iceberg Orders detected"
                >
                  🧊 Icebergs ({topStocks.filter((s) => s.icebergAbsorption).length})
                </button>

                <div className="h-4 w-px bg-slate-700 mx-1 hidden sm:block" />

                {/* Greeks Bias Quick Filter */}
                <button
                  onClick={() => setGreeksFilter(greeksFilter === 'FAVORS_OPTION_BUYING' ? 'ALL' : 'FAVORS_OPTION_BUYING')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    greeksFilter === 'FAVORS_OPTION_BUYING'
                      ? 'bg-indigo-600 text-white ring-2 ring-indigo-400/50'
                      : isDark
                      ? 'bg-slate-800/80 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-950/40'
                      : 'bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100'
                  }`}
                  title="Filter stocks favoring Long Option Buying due to high momentum & RVOL"
                >
                  ⚡ Option Buying ({topStocks.filter((s) => s.greeksStrategyBias === 'FAVORS_OPTION_BUYING').length})
                </button>
                <button
                  onClick={() => setGreeksFilter(greeksFilter === 'FAVORS_OPTION_SELLING' ? 'ALL' : 'FAVORS_OPTION_SELLING')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    greeksFilter === 'FAVORS_OPTION_SELLING'
                      ? 'bg-purple-600 text-white ring-2 ring-purple-400/50'
                      : isDark
                      ? 'bg-slate-800/80 text-purple-300 border border-purple-500/30 hover:bg-purple-950/40'
                      : 'bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100'
                  }`}
                  title="Filter stocks favoring Option Selling / Theta decay harvesting"
                >
                  🛡️ Option Selling ({topStocks.filter((s) => s.greeksStrategyBias === 'FAVORS_OPTION_SELLING').length})
                </button>
                <button
                  onClick={() => setGreeksFilter(greeksFilter === 'NEUTRAL_SPREADS' ? 'ALL' : 'NEUTRAL_SPREADS')}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                    greeksFilter === 'NEUTRAL_SPREADS'
                      ? 'bg-slate-600 text-white'
                      : isDark
                      ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                  title="Filter stocks favoring Defined-Risk Debit/Credit Spreads"
                >
                  ⚖️ Spreads ({topStocks.filter((s) => s.greeksStrategyBias === 'NEUTRAL_SPREADS').length})
                </button>
              </div>
            </div>

            <div className="text-xs font-mono opacity-70">
              Showing <span className="font-bold text-indigo-400">{filteredStocks.length}</span> of Top {config.topN} Most Traded F&amp;O Stocks
            </div>
          </div>

          {/* TABLE OF ONLY TOP N VOLUME STOCKS */}
          <div
            className={`rounded-3xl border shadow-lg overflow-hidden transition-all ${
              isDark ? 'bg-slate-900/95 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/40 text-[10px] uppercase opacity-70">
                    <th className="py-3 px-3 text-center">Vol Rank</th>
                    <th className="py-3 px-3">Symbol &amp; Sector Sentiment</th>
                    <th className="py-3 px-3 text-center text-amber-400 font-extrabold" title="Stock Listed Time (quantscreener format)">
                      <span>Listed At</span>
                    </th>
                    <th className="py-3 px-3 text-center text-indigo-400 font-extrabold" title="Calculated Entry Execution Window Time">
                      <span>Entry Time</span>
                    </th>
                    <th className="py-3 px-3 text-center text-purple-400 font-extrabold" title="Target Hit / SL / EOD Exit Time">
                      <span>Exit Time</span>
                    </th>
                    <th className="py-3 px-3 text-right">LTP (₹) &amp; Change</th>
                    <th className="py-3 px-3 text-right">Traded Value &amp; RVOL</th>
                    <th className="py-3 px-3 text-center">Order Flow Delta &amp; CVD</th>
                    <th className="py-3 px-3 text-center">Smart Money &amp; Wyckoff</th>
                    <th className="py-3 px-3 text-center">60M TV Trend ↗</th>
                    <th className="py-3 px-3 text-center">OI Action &amp; Strikes</th>
                    <th
                      className="py-3 px-3 text-center cursor-pointer hover:text-indigo-300 transition-colors select-none"
                      onClick={() => {
                        const nextFilter =
                          greeksFilter === 'ALL'
                            ? 'FAVORS_OPTION_BUYING'
                            : greeksFilter === 'FAVORS_OPTION_BUYING'
                            ? 'FAVORS_OPTION_SELLING'
                            : greeksFilter === 'FAVORS_OPTION_SELLING'
                            ? 'NEUTRAL_SPREADS'
                            : 'ALL';
                        setGreeksFilter(nextFilter);
                      }}
                      title="Click to cycle Option Greeks Filter (All → Option Buying → Option Selling → Spreads)"
                    >
                      <div className="flex items-center justify-center gap-1">
                        <span>Option Greeks Bias</span>
                        {greeksFilter !== 'ALL' && (
                          <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                        )}
                      </div>
                    </th>
                    <th className="py-3 px-3 text-center">5M Score &amp; Signal</th>
                    <th className="py-3 px-3 text-right">Entry / SL / T1</th>
                    <th className="py-3 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredStocks.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-12 text-center">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <span className="text-3xl">🔍</span>
                          <div className="text-sm font-bold text-slate-300">No stocks matching active filter criteria</div>
                          <div className="text-xs text-slate-500 max-w-md">
                            No stocks found for direction <span className="font-mono text-indigo-400">"{directionFilter}"</span>
                            {greeksFilter !== 'ALL' && (
                              <span> and Greeks bias <span className="font-mono text-purple-400">"{greeksFilter}"</span></span>
                            )}
                            {' '}with threshold <span className="font-mono text-amber-400">≥ {config.entryScoreThreshold} pts</span>.
                          </div>
                          <div className="flex items-center gap-2 mt-2 flex-wrap justify-center">
                            <button
                              onClick={() => {
                                setDirectionFilter('ALL');
                                setSmartMoneyFilter('ALL');
                                setOrderFlowFilter('ALL');
                                setGreeksFilter('ALL');
                                setSearchQuery('');
                              }}
                              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                            >
                              Reset All Filters
                            </button>
                            {greeksFilter !== 'ALL' && (
                              <button
                                onClick={() => setGreeksFilter('ALL')}
                                className="px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 border border-purple-500/40 text-xs font-bold transition-all cursor-pointer"
                              >
                                Clear Greeks Filter
                              </button>
                            )}
                            {directionFilter === 'QUALIFIED_SELL' && (
                              <button
                                onClick={() => setDirectionFilter('SELL')}
                                className="px-3 py-1.5 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/40 text-xs font-bold transition-all cursor-pointer"
                              >
                                Show All Sell Stocks ({topStocks.filter(s => s.signalType === 'SELL').length})
                              </button>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredStocks.map((stk) => {
                    const isSelected = stk.symbol === selectedStockSymbol;
                    const isBull = (stk.change !== undefined ? stk.change : stk.changePercent) >= 0;
                    const changeAmt = stk.change !== undefined
                      ? Math.abs(stk.change).toFixed(2)
                      : Math.abs((stk.price * stk.changePercent) / 100).toFixed(2);
                    const changePct = stk.changePercent.toFixed(2);
                    return (
                      <tr
                        key={stk.symbol}
                        onClick={() => {
                          setSelectedStockSymbol(stk.symbol);
                          if (onSelectStock) onSelectStock(stk.rawStock);
                        }}
                        className={`transition-colors cursor-pointer ${
                          isSelected
                            ? isDark
                              ? 'bg-indigo-950/40 border-l-4 border-indigo-500'
                              : 'bg-indigo-50 border-l-4 border-indigo-600'
                            : isDark
                            ? 'hover:bg-slate-800/40'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* Rank Badge */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span
                            className={`px-2.5 py-1 rounded-xl text-[11px] font-black ${
                              stk.volumeRank <= 3
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                : stk.volumeRank <= 10
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            #{stk.volumeRank}
                          </span>
                        </td>

                        {/* Symbol & Sector Sentiment */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <div className="font-black text-sm text-slate-100 flex items-center gap-1.5">
                            <span>{stk.symbol}</span>
                            <span className="text-[10px] font-normal opacity-60">({stk.lotSize} Lot)</span>
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] opacity-60 font-sans truncate max-w-[100px]">{stk.sector}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                stk.sectorBias === 'POSITIVE'
                                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                  : stk.sectorBias === 'NEGATIVE'
                                  ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {stk.sectorBias === 'POSITIVE' ? '🟢' : stk.sectorBias === 'NEGATIVE' ? '🔴' : '⚪'} {stk.sectorChangePercent >= 0 ? '+' : ''}{stk.sectorChangePercent.toFixed(1)}%
                            </span>
                          </div>
                        </td>

                        {/* Listed At Time (quantscreener.in format) */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded font-bold text-xs bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            {getStockListedAt(stk)}
                          </span>
                        </td>

                        {/* Entry Time */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded font-bold text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                            {getStockEntryTime(stk)}
                          </span>
                        </td>

                        {/* Exit Time */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          {(() => {
                            const exitInfo = getStockExitTime(stk);
                            return (
                              <span
                                className={`px-2 py-0.5 rounded font-bold text-[10px] border ${
                                  exitInfo.isClosed
                                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                    : 'bg-slate-900 text-slate-400 border-slate-800'
                                }`}
                                title={exitInfo.statusLabel}
                              >
                                {exitInfo.timeStr}
                              </span>
                            );
                          })()}
                        </td>

                        {/* LTP & Change */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="font-black text-sm text-slate-100">
                            ₹{stk.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                          <div className={`text-[11px] font-bold flex items-center justify-end gap-1 ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>
                            <span>{isBull ? '+' : '-'}₹{changeAmt}</span>
                            <span>({stk.changePercent >= 0 ? '+' : ''}{stk.changePercent.toFixed(2)}%)</span>
                            <span>{isBull ? '▲' : '▼'}</span>
                          </div>
                        </td>

                        {/* Traded Volume & RVOL */}
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          <div className="font-black text-amber-300">₹{stk.tradedValueCrores} Cr</div>
                          <div className="text-[10px] flex items-center justify-end gap-1 mt-0.5">
                            <span className="opacity-60">RVOL:</span>
                            <span
                              className={`font-black ${
                                stk.rvol >= 2.0
                                  ? 'text-emerald-400'
                                  : stk.rvol >= 1.5
                                  ? 'text-indigo-300'
                                  : 'text-slate-400'
                              }`}
                            >
                              {stk.rvol}x
                            </span>
                          </div>
                        </td>

                        {/* Order Flow Delta & CVD */}
                        <td className="py-3 px-3 text-center whitespace-nowrap min-w-[140px]">
                          {/* Mini Buy/Sell Volume Ratio Bar */}
                          <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden flex mb-1 border border-slate-800">
                            <div
                              className="bg-emerald-500 h-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(0, stk.aggressiveBuyPercent ?? 50))}%` }}
                              title={`Aggressive Buyers: ${(stk.aggressiveBuyPercent ?? 50).toFixed(0)}%`}
                            />
                            <div
                              className="bg-rose-500 h-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(0, stk.aggressiveSellPercent ?? 50))}%` }}
                              title={`Aggressive Sellers: ${(stk.aggressiveSellPercent ?? 50).toFixed(0)}%`}
                            />
                          </div>

                          <div className="flex items-center justify-center gap-1.5">
                            <span
                              className={`font-black text-[11px] ${
                                (stk.netDeltaPercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {(stk.netDeltaPercent ?? 0) >= 0 ? '+' : ''}{(stk.netDeltaPercent ?? 0).toFixed(1)}% Δ
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                                (stk.cumulativeDeltaCr ?? 0) >= 0
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {(stk.cumulativeDeltaCr ?? 0) >= 0 ? '+' : ''}₹{(stk.cumulativeDeltaCr ?? 0).toFixed(1)}Cr CVD
                            </span>
                          </div>

                          <div className="flex items-center justify-center gap-1 mt-0.5 text-[9px]">
                            {stk.deltaDivergence && stk.deltaDivergence !== 'NONE' && stk.deltaDivergence !== 'REGULAR_CONFLUENCE' ? (
                              <span className="px-1 py-0.2 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 font-bold">
                                ⚡ {stk.deltaDivergence === 'BULLISH_DELTA_DIVERGENCE' ? 'Bull Div' : 'Bear Div'}
                              </span>
                            ) : stk.icebergAbsorption ? (
                              <span className="px-1 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold">
                                🧊 {stk.imbalanceSide === 'BUY_IMBALANCE' ? 'Iceberg Bid' : 'Iceberg Ask'}
                              </span>
                            ) : (
                              <span className="opacity-60 text-[9px]">
                                Imb: {(stk.bidAskImbalanceRatio ?? 1).toFixed(1)}x ({stk.orderFlowBias.includes('BUY') ? '🟢 Buy' : stk.orderFlowBias.includes('SELL') ? '🔴 Sell' : '⚪ Neu'})
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Smart Money & Wyckoff Setup */}
                        <td className="py-3 px-3 text-center whitespace-nowrap min-w-[140px]">
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-black inline-flex items-center gap-1 ${
                              stk.wyckoffPhase.includes('SPRING') || stk.wyckoffPhase.includes('SOS') || stk.wyckoffPhase.includes('MARKUP')
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                : stk.wyckoffPhase.includes('UTAD') || stk.wyckoffPhase.includes('MARKDOWN')
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                : 'bg-slate-800 text-slate-300 border border-slate-700'
                            }`}
                          >
                            <span>
                              {stk.wyckoffPhase === 'PHASE_B_ACCUMULATION'
                                ? '🌱 Phase B Accumulation'
                                : stk.wyckoffPhase === 'PHASE_A_STOPPING'
                                ? '🛑 Phase A Stopping'
                                : stk.wyckoffPhase === 'MARKDOWN'
                                ? '📉 Phase E Markdown'
                                : stk.wyckoffPhase === 'DISTRIBUTION_UTAD'
                                ? '⚠️ UTAD Distribution'
                                : '⚖️ Phase B Range'}
                            </span>
                          </span>

                          <div className="text-[9px] opacity-70 font-sans mt-0.5 flex items-center justify-center gap-1">
                            <span className="text-cyan-300 font-bold">
                              OB: ₹{(stk.smcOrderBlockRange ? stk.smcOrderBlockRange[0] : (stk.price * 0.99)).toFixed(0)}-{(stk.smcOrderBlockRange ? stk.smcOrderBlockRange[1] : (stk.price * 1.01)).toFixed(0)}
                            </span>
                            <span>•</span>
                            <span className={(stk.cmf ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              CMF {(stk.cmf ?? 0) >= 0 ? '+' : ''}{(stk.cmf ?? 0).toFixed(2)}
                            </span>
                          </div>
                        </td>

                        {/* 60M TV Trend ↗ */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelected60mChartStock(stk);
                            }}
                            className={`px-2.5 py-1 rounded-xl text-[10px] font-black inline-flex items-center gap-1 border transition-all cursor-pointer hover:scale-105 shadow-sm ${
                              stk.trend60M === 'BULLISH'
                                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/50'
                                : stk.trend60M === 'BEARISH'
                                ? 'bg-rose-950/40 border-rose-500/40 text-rose-300 hover:bg-rose-900/50'
                                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                            }`}
                            title="Open 60-Minute Interactive TradingView Chart"
                          >
                            <span>{stk.trend60MArrow} 60m TV</span>
                            <Maximize2 className="w-3 h-3 text-cyan-400" />
                          </button>
                          <div className="text-[9px] opacity-60 mt-0.5">
                            S: ₹{(stk.support60m ?? stk.price * 0.98).toFixed(0)} | R: ₹{(stk.resistance60m ?? stk.price * 1.02).toFixed(0)}
                          </div>
                        </td>

                        {/* OI Action & Strikes */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                              stk.oiAction === 'PUT_WRITING' || stk.oiAction === 'HEAVY_PUT_WRITING'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : stk.oiAction === 'CALL_WRITING' || stk.oiAction === 'HEAVY_CALL_WRITING'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : stk.oiAction === 'CALL_UNWINDING_SHORT_COVERING'
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            }`}
                          >
                            {stk.oiAction.replace('_', ' ')}
                          </span>
                          <div className="text-[9px] opacity-60 mt-0.5">
                            Max CE: {stk.maxCallStrike} | PE: {stk.maxPutStrike}
                          </div>
                        </td>
                        {/* Option Greeks Bias */}
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedGreeksModalStock(stk);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all cursor-pointer group flex flex-col items-center mx-auto ${
                              stk.greeksStrategyBias === 'FAVORS_OPTION_BUYING'
                                ? 'bg-indigo-500/20 hover:bg-indigo-500/35 text-indigo-300 border-indigo-500/40 shadow-sm shadow-indigo-500/20'
                                : stk.greeksStrategyBias === 'FAVORS_OPTION_SELLING'
                                ? 'bg-purple-500/20 hover:bg-purple-500/35 text-purple-300 border-purple-500/40 shadow-sm shadow-purple-500/20'
                                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                            }`}
                            title="Click to view full Option Greeks telemetry, strike recommendation & payoff simulator"
                          >
                            <span className="flex items-center gap-1">
                              {stk.greeksStrategyBias === 'FAVORS_OPTION_BUYING'
                                ? '⚡ OPTION BUYING'
                                : stk.greeksStrategyBias === 'FAVORS_OPTION_SELLING'
                                ? '🛡️ OPTION SELLING'
                                : '⚖️ NEUTRAL SPREADS'}
                              <ExternalLink className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                            </span>
                            <span className="text-[9px] opacity-75 font-normal mt-0.5">
                              Δ {stk.delta > 0 ? '+' : ''}{stk.delta} • IV {stk.iv}% ({stk.ivPercentile}%ile)
                            </span>
                          </button>
                        </td>

                        {/* 5M Score & Signal */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <span
                              className={`font-black text-xs ${
                                stk.overallScore >= 80 ? 'text-emerald-400' : stk.overallScore >= 70 ? 'text-amber-300' : 'text-slate-400'
                              }`}
                            >
                              {stk.overallScore}/100
                            </span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                                stk.signalType === 'BUY'
                                  ? 'bg-emerald-600 text-white'
                                  : stk.signalType === 'SELL'
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {stk.signalMode.replace('_', ' ')}
                            </span>
                          </div>
                        </td>

                        {/* Entry / SL / T1 */}
                        <td className="py-3 px-4 text-right whitespace-nowrap text-[11px]">
                          <div>
                            <span className="opacity-50">Entry: </span>
                            <span className="font-bold text-slate-100">₹{(stk.entryPrice ?? stk.price).toFixed(1)}</span>
                          </div>
                          <div>
                            <span className="opacity-50">SL: </span>
                            <span className="font-bold text-rose-400">₹{(stk.stopLoss ?? stk.price * 0.985).toFixed(1)}</span>
                            <span className="opacity-50 ml-1.5">T1: </span>
                            <span className="font-bold text-emerald-400">₹{(stk.target1 ?? stk.price * 1.015).toFixed(1)}</span>
                          </div>
                        </td>

                        {/* Action Buttons */}
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelected60mChartStock(stk);
                              }}
                              className="px-2 py-1 rounded-lg bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 text-[10px] font-bold border border-cyan-500/30 transition-all cursor-pointer flex items-center gap-0.5"
                              title="60m TradingView Live Chart ↗"
                            >
                              <span>60m TV</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStockSymbol(stk.symbol);
                                setActiveEngineTab('DIAGNOSTICS');
                              }}
                              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-bold border border-slate-700 transition-all cursor-pointer"
                              title="Inspect 100-Point Diagnostics & Greeks"
                            >
                              Inspect
                            </button>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenTrade(stk);
                              }}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-bold text-white shadow-sm transition-all cursor-pointer flex items-center gap-1 ${
                                stk.signalType === 'SELL' ? 'bg-rose-600 hover:bg-rose-500' : 'bg-emerald-600 hover:bg-emerald-500'
                              }`}
                            >
                              <Play className="w-2.5 h-2.5 fill-current" />
                              <span>{stk.signalType === 'SELL' ? 'Short' : 'Trade'}</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 2: 100-POINT DIAGNOSTIC DEEP-DIVE & RISK SIZER            */}
      {/* ============================================================= */}
      {activeEngineTab === 'DIAGNOSTICS' && selectedStockData && (
        <div className="space-y-6">
          {/* Selected Stock Master Profile Header */}
          <div
            className={`p-6 rounded-3xl border shadow-xl relative overflow-hidden transition-all ${
              isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
              <div className="lg:col-span-8 space-y-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="px-3 py-1 text-xs font-mono font-black rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    VOLUME RANK #{selectedStockData.volumeRank} OF TOP {config.topN}
                  </span>
                  <h3 className="text-3xl font-black italic font-mono">{selectedStockData.symbol}</h3>
                  <span className="px-3 py-1 text-xs font-mono font-bold rounded-xl bg-slate-800 text-slate-200 border border-slate-700">
                    {selectedStockData.sector}
                  </span>
                  <span
                    className={`px-3 py-1 text-xs font-mono font-black rounded-xl border ${
                      selectedStockData.isEntryQualified
                        ? 'bg-emerald-600 text-white border-emerald-500'
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    }`}
                  >
                    {selectedStockData.isEntryQualified ? 'QUALIFIED FOR ENTRY (SCORE ≥ 80)' : 'WATCHLIST CANDIDATE'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs opacity-80 font-sans flex-wrap">
                  <span>{selectedStockData.name}</span>
                  <span>• Contract Lot: <strong className="font-mono text-slate-100">{selectedStockData.lotSize}</strong></span>
                  <span>• LTP: <strong className="font-mono text-slate-100">₹{selectedStockData.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                  <span className={`font-mono font-bold flex items-center gap-1 ${(selectedStockData.change !== undefined ? selectedStockData.change : selectedStockData.changePercent) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    <span>{(selectedStockData.change !== undefined ? selectedStockData.change : selectedStockData.changePercent) >= 0 ? '+' : '-'}₹{(selectedStockData.change !== undefined ? Math.abs(selectedStockData.change) : Math.abs((selectedStockData.price * selectedStockData.changePercent) / 100)).toFixed(2)}</span>
                    <span>({selectedStockData.changePercent >= 0 ? '+' : ''}{selectedStockData.changePercent.toFixed(2)}%)</span>
                    <span>{(selectedStockData.change !== undefined ? selectedStockData.change : selectedStockData.changePercent) >= 0 ? '▲' : '▼'}</span>
                  </span>
                </div>

                {/* Quick Telemetry Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 text-xs font-mono">
                  <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="opacity-50 text-[10px] uppercase">TRADED VALUE:</div>
                    <div className="font-black text-amber-300 text-sm mt-0.5">₹{selectedStockData.tradedValueCrores} Crores</div>
                  </div>
                  <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="opacity-50 text-[10px] uppercase">15M REGIME:</div>
                    <div className="font-black text-indigo-300 text-sm mt-0.5">{selectedStockData.trend15M}</div>
                  </div>
                  <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="opacity-50 text-[10px] uppercase">RVOL &amp; SURGE:</div>
                    <div className="font-black text-emerald-400 text-sm mt-0.5">{selectedStockData.rvol}x Relative Vol</div>
                  </div>
                  <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="opacity-50 text-[10px] uppercase">OI BUILDUP:</div>
                    <div className="font-black text-purple-300 text-sm mt-0.5">{selectedStockData.oiBuildup.replace('_', ' ')}</div>
                  </div>
                </div>
              </div>

              {/* Right Score Gauge & Action */}
              <div className="lg:col-span-4 flex flex-col items-center lg:items-end justify-center gap-3">
                <div className="text-center lg:text-right font-mono">
                  <div className="text-[10px] uppercase opacity-60 font-bold">5-MINUTE STRATEGY SCORE:</div>
                  <div className={`text-4xl sm:text-5xl font-black ${selectedStockData.signalType === 'SELL' ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {selectedStockData.overallScore}
                    <span className="text-lg opacity-50 font-normal"> / 100 PTS</span>
                  </div>
                  <div className={`text-xs mt-1 font-bold ${selectedStockData.signalType === 'SELL' ? 'text-rose-300' : 'text-emerald-300'}`}>
                    {selectedStockData.signalMode.replace('_', ' ')} SIGNAL
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full lg:w-auto">
                  <button
                    onClick={() => handleOpenTrade(selectedStockData, 'BUY')}
                    className="flex-1 lg:flex-none px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-black shadow-md shadow-emerald-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>EXECUTE BUY</span>
                  </button>
                  <button
                    onClick={() => handleOpenTrade(selectedStockData, 'SELL')}
                    className="flex-1 lg:flex-none px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-mono text-xs font-black shadow-md shadow-rose-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>EXECUTE SELL</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 10-FACTOR ITEMISED SCORING TABLE */}
          <div
            className={`p-5 sm:p-6 rounded-3xl border shadow-lg transition-all ${
              isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800/60">
              <div>
                <h4 className="text-base font-black italic font-mono uppercase tracking-tight flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-400" />
                  <span>10 Mathematical Strategy Factors (0–100 Points Breakdown)</span>
                </h4>
                <p className="text-xs opacity-70 font-sans mt-0.5">
                  Itemized validation of {selectedStockData.symbol} against institutional trend, momentum, volatility, and volume requirements.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/40 text-[10px] uppercase opacity-70">
                    <th className="py-2.5 px-3">Quantitative Factor</th>
                    <th className="py-2.5 px-3">Live Telemetry Value</th>
                    <th className="py-2.5 px-3">Condition Requirement</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                    <th className="py-2.5 px-3 text-right">Points Earned</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {selectedStockData.scoreItems.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-800/20 transition-colors">
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-100">{item.factor}</div>
                        <div className="text-[10px] opacity-60 font-sans mt-0.5">{item.description}</div>
                      </td>
                      <td className="py-3 px-3 font-bold text-amber-300 whitespace-nowrap">{item.liveValue}</td>
                      <td className="py-3 px-3 text-indigo-300 font-sans text-[11px]">{item.requirement}</td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                            item.passed
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {item.passed ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <ShieldAlert className="w-3 h-3 text-rose-400" />}
                          <span>{item.passed ? 'PASSED' : 'FAILED'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-black whitespace-nowrap">
                        <span className={item.earnedPoints > 0 ? 'text-emerald-400' : 'text-slate-500'}>
                          +{item.earnedPoints}
                        </span>
                        <span className="opacity-50 text-[10px]"> / {item.maxPoints} pts</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4 ADVANCED TELEMETRY MATRICES: SECTOR, INSTITUTIONAL, 60M TREND, OI ACTION & GREEKS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 font-mono text-xs">
            {/* 1. SECTOR SENTIMENT & INSTITUTIONAL FOOTPRINT */}
            <div
              className={`p-5 rounded-3xl border shadow-lg space-y-4 ${
                isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
                <h4 className="text-sm font-black italic uppercase tracking-tight flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  <span>Sector Sentiment &amp; Institutional Flow</span>
                </h4>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                    selectedStockData.sectorBias === 'POSITIVE'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : selectedStockData.sectorBias === 'NEGATIVE'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  SECTOR: {selectedStockData.sectorBias}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-[10px] opacity-60 uppercase font-sans">Sector Performance</div>
                  <div className="text-base font-black text-slate-100 flex items-center gap-1.5">
                    <span>{selectedStockData.sector}</span>
                    <span className={(selectedStockData.sectorChangePercent ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      ({(selectedStockData.sectorChangePercent ?? 0) >= 0 ? '+' : ''}{(selectedStockData.sectorChangePercent ?? 0).toFixed(2)}%)
                    </span>
                  </div>
                  <div className="text-[10px] opacity-60 font-sans">
                    Breadth: {selectedStockData.sectorAdvances ?? 0} Adv / {selectedStockData.sectorDeclines ?? 0} Dec
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-[10px] opacity-60 uppercase font-sans">Relative Strength vs Nifty</div>
                  <div className="text-base font-black text-indigo-300">
                    {(selectedStockData.sectorRelativeStrength ?? 0) >= 0 ? '+' : ''}{(selectedStockData.sectorRelativeStrength ?? 0).toFixed(2)}%
                  </div>
                  <div className="text-[10px] font-bold text-emerald-400">
                    {selectedStockData.sectorConfluence ? '✓ Sector Aligns with Stock Direction' : '⚠ Sector Divergence'}
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="opacity-60 text-[10px] uppercase font-sans">Institutional Activity Status</span>
                  <span
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                      selectedStockData.institutionalStatus.includes('ACCUMULATION') || selectedStockData.institutionalStatus.includes('BUYING')
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : selectedStockData.institutionalStatus.includes('DISTRIBUTION') || selectedStockData.institutionalStatus.includes('SELLING')
                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    🏦 {selectedStockData.institutionalStatus}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/80">
                    <div className="text-[9px] opacity-50">BLOCK DEAL CR</div>
                    <div className="font-black text-amber-300 mt-0.5">₹{selectedStockData.institutionalBlockValueCr} Cr</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/80">
                    <div className="text-[9px] opacity-50">DELIVERY %</div>
                    <div className="font-black text-cyan-300 mt-0.5">{selectedStockData.deliveryPercent}%</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-900 border border-slate-800/80">
                    <div className="text-[9px] opacity-50">BUYER DOMINANCE</div>
                    <div className="font-black text-emerald-400 mt-0.5">{selectedStockData.buyerSellerDominance}%</div>
                  </div>
                </div>
              </div>
            </div>

            {/* 2. 60-MINUTE HIGHER-TIMEFRAME TREND & S/R LEVELS */}
            <div
              className={`p-5 rounded-3xl border shadow-lg space-y-4 ${
                isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
                <h4 className="text-sm font-black italic uppercase tracking-tight flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-cyan-400" />
                  <span>60-Minute Higher-Timeframe Trend &amp; Levels</span>
                </h4>
                <button
                  onClick={() => setSelected60mChartStock(selectedStockData)}
                  className="px-3 py-1 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-black shadow-md shadow-cyan-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <span>Launch 60m TV Chart ↗</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-[10px] opacity-60 uppercase font-sans">60M Trend Regime</div>
                  <div
                    className={`text-lg font-black flex items-center gap-1.5 ${
                      selectedStockData.trend60M === 'BULLISH'
                        ? 'text-emerald-400'
                        : selectedStockData.trend60M === 'BEARISH'
                        ? 'text-rose-400'
                        : 'text-amber-400'
                    }`}
                  >
                    <span>{selectedStockData.trend60MArrow}</span>
                    <span>{selectedStockData.trend60M}</span>
                  </div>
                  <div className="text-[10px] opacity-60 font-sans">
                    EMA20: ₹{(selectedStockData.ema20_60m ?? selectedStockData.price * 0.995).toFixed(1)} | EMA50: ₹{(selectedStockData.ema50_60m ?? selectedStockData.price * 0.99).toFixed(1)}
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-[10px] opacity-60 uppercase font-sans">60M Momentum &amp; Volatility</div>
                  <div className="text-lg font-black text-amber-300">
                    RSI: {(selectedStockData.rsi60m ?? 55).toFixed(1)}
                  </div>
                  <div className="text-[10px] opacity-60 font-sans">
                    60m ATR: ₹{(selectedStockData.atr60m ?? selectedStockData.price * 0.015).toFixed(2)} / candle
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-0.5 text-rose-300">
                  <div className="text-[10px] opacity-70 font-sans">60M RESISTANCE CEILING</div>
                  <div className="text-base font-black">₹{(selectedStockData.resistance60m ?? selectedStockData.price * 1.02).toFixed(2)}</div>
                  <div className="text-[9px] opacity-60">Breakout hurdle for bulls</div>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-0.5 text-emerald-300">
                  <div className="text-[10px] opacity-70 font-sans">60M SUPPORT FLOOR</div>
                  <div className="text-base font-black">₹{(selectedStockData.support60m ?? selectedStockData.price * 0.98).toFixed(2)}</div>
                  <div className="text-[9px] opacity-60">Key institutional defence zone</div>
                </div>
              </div>
            </div>

            {/* 3. OI ACTION & STRIKE BATTLEFIELD */}
            <div
              className={`p-5 rounded-3xl border shadow-lg space-y-4 ${
                isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
                <h4 className="text-sm font-black italic uppercase tracking-tight flex items-center gap-2">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>OI Action &amp; Strike Battlefield</span>
                </h4>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                    selectedStockData.oiAction === 'PUT_WRITING'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : selectedStockData.oiAction === 'CALL_WRITING'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  }`}
                >
                  {selectedStockData.oiAction.replace('_', ' ')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-rose-950/20 border border-rose-500/30 space-y-1">
                  <div className="text-[10px] opacity-70 uppercase font-sans text-rose-300">Max Call Strike (Ceiling)</div>
                  <div className="text-lg font-black text-rose-200">
                    Strike {selectedStockData.maxCallStrike}
                  </div>
                  <div className="text-[10px] opacity-70 font-sans text-rose-300">
                    OI: {selectedStockData.callOiLakhs}L ({selectedStockData.callOiChangePct >= 0 ? '+' : ''}{selectedStockData.callOiChangePct}% Today)
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-1">
                  <div className="text-[10px] opacity-70 uppercase font-sans text-emerald-300">Max Put Strike (Support Floor)</div>
                  <div className="text-lg font-black text-emerald-200">
                    Strike {selectedStockData.maxPutStrike}
                  </div>
                  <div className="text-[10px] opacity-70 font-sans text-emerald-300">
                    OI: {selectedStockData.putOiLakhs}L ({selectedStockData.putOiChangePct >= 0 ? '+' : ''}{selectedStockData.putOiChangePct}% Today)
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs font-mono">
                <div>
                  <span className="opacity-60 text-[10px] uppercase font-sans">Put-Call Ratio (PCR): </span>
                  <span className="font-black text-amber-300">{selectedStockData.pcr}</span>
                </div>
                <div className="text-[10px] opacity-70 font-sans">
                  {selectedStockData.pcr >= 1.2
                    ? '🟢 Bullish Put Writing Dominance'
                    : selectedStockData.pcr <= 0.7
                    ? '🔴 Bearish Call Writing Dominance'
                    : '⚪ Neutral Balanced Market'}
                </div>
              </div>
            </div>

            {/* 4. OPTION GREEKS & CONTRACT SELECTOR */}
            <div
              className={`p-5 rounded-3xl border shadow-lg space-y-4 ${
                isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
                <h4 className="text-sm font-black italic uppercase tracking-tight flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Option Greeks Intelligence &amp; Bias</span>
                </h4>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                      selectedStockData.greeksStrategyBias === 'FAVORS_OPTION_BUYING'
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : selectedStockData.greeksStrategyBias === 'FAVORS_OPTION_SELLING'
                        ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {selectedStockData.greeksStrategyBias.replace('FAVORS_', '').replace('_', ' ')}
                  </span>
                  <button
                    onClick={() => setSelectedGreeksModalStock(selectedStockData)}
                    className="px-2.5 py-0.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                    title="Open Greeks Deep-Dive & Payoff Simulator"
                  >
                    <Maximize2 className="w-3 h-3" />
                    <span>Simulator</span>
                  </button>
                </div>
              </div>

              {/* Greeks Table */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[9px] opacity-50">DELTA (Δ)</div>
                  <div className="font-black text-emerald-400 text-sm mt-0.5">
                    {selectedStockData.delta > 0 ? '+' : ''}{selectedStockData.delta}
                  </div>
                </div>
                <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[9px] opacity-50">GAMMA (Γ)</div>
                  <div className="font-black text-cyan-400 text-sm mt-0.5">{selectedStockData.gamma}</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[9px] opacity-50">VEGA (V)</div>
                  <div className="font-black text-purple-400 text-sm mt-0.5">₹{selectedStockData.vega}</div>
                </div>
                <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[9px] opacity-50">THETA (Θ)</div>
                  <div className="font-black text-rose-400 text-sm mt-0.5">
                    -₹{Math.abs(selectedStockData.theta).toFixed(2)}/d
                  </div>
                </div>
              </div>

              {/* IV & Bias Reason */}
              <div className="p-3 rounded-2xl bg-indigo-950/20 border border-indigo-500/30 space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="opacity-70 font-sans">Implied Volatility (IV):</span>
                  <span className="font-black text-amber-300">{selectedStockData.iv}% ({selectedStockData.ivPercentile}% Percentile)</span>
                </div>
                <p className="text-[10px] text-indigo-200 font-sans leading-relaxed">
                  {selectedStockData.greeksBiasReason}
                </p>
              </div>

              {/* Recommended Option Contract Card */}
              {selectedStockData.recommendedOptionContract ? (
                <div className="p-3 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="text-[9px] opacity-50 uppercase font-sans">RECOMMENDED CONTRACT (AT-THE-MONEY):</div>
                    <div className="font-black text-emerald-300 text-sm mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{selectedStockData.recommendedOptionContract.contractName}</span>
                      <span className="text-xs text-amber-300 font-bold">
                        @ ₹{(selectedStockData.recommendedOptionContract.premiumPrice ?? 0).toFixed(2)}
                      </span>
                      <span className="text-[10px] text-slate-400 font-sans">
                        (SL: ₹{selectedStockData.recommendedOptionContract.optionStopLoss} | T1: ₹{selectedStockData.recommendedOptionContract.optionTarget1} | T2: ₹{selectedStockData.recommendedOptionContract.optionTarget2})
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenTrade(selectedStockData)}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-black shadow-md transition-all cursor-pointer flex items-center gap-1"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>Trade Contract</span>
                  </button>
                </div>
              ) : null}
            </div>

            {/* 5. INDIAN-MARKET SMART MONEY & WYCKOFF MATRIX */}
            <div
              className={`p-5 rounded-3xl border shadow-lg space-y-4 ${
                isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
                <h4 className="text-sm font-black italic uppercase tracking-tight flex items-center gap-2">
                  <Compass className="w-4 h-4 text-emerald-400" />
                  <span>Indian-Market Smart Money &amp; Wyckoff SMC Matrix</span>
                </h4>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                    (selectedStockData.wyckoffPhase || '').includes('SPRING') || (selectedStockData.wyckoffPhase || '').includes('SOS') || (selectedStockData.wyckoffPhase || '').includes('MARKUP')
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : (selectedStockData.wyckoffPhase || '').includes('UTAD') || (selectedStockData.wyckoffPhase || '').includes('MARKDOWN')
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  WYCKOFF: {(selectedStockData.wyckoffPhase || 'PHASE_B_BASE_BUILDING').replace(/_/g, ' ')}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-[10px] opacity-60 uppercase font-sans">Institutional Order Block (OB)</div>
                  <div className="text-base font-black text-cyan-300">
                    ₹{(selectedStockData.smcOrderBlockRange ? selectedStockData.smcOrderBlockRange[0] : selectedStockData.price * 0.99).toFixed(1)} – ₹{(selectedStockData.smcOrderBlockRange ? selectedStockData.smcOrderBlockRange[1] : selectedStockData.price * 1.01).toFixed(1)}
                  </div>
                  <div className="text-[10px] opacity-60 font-sans">
                    Refined 15m/60m high-volume rejection demand/supply zone
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-[10px] opacity-60 uppercase font-sans">Fair Value Gap (FVG)</div>
                  <div className="text-base font-black text-amber-300">
                    {selectedStockData.smcFvgRange && selectedStockData.smcFvgRange.length === 2 ? (
                      <span>₹{(selectedStockData.smcFvgRange[0] ?? 0).toFixed(1)} – ₹{(selectedStockData.smcFvgRange[1] ?? 0).toFixed(1)}</span>
                    ) : (
                      <span className="text-slate-400 text-xs font-normal">No Unfilled Imbalance</span>
                    )}
                  </div>
                  <div className="text-[10px] opacity-60 font-sans">
                    {selectedStockData.smcFvgRange ? 'Institutional displacement zone' : 'Price balanced'}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[9px] opacity-50 uppercase">CHAIKIN MONEY FLOW</div>
                  <div className={`font-black text-sm mt-0.5 ${(selectedStockData.cmf ?? 0) >= 0.05 ? 'text-emerald-400' : (selectedStockData.cmf ?? 0) <= -0.05 ? 'text-rose-400' : 'text-slate-300'}`}>
                    {(selectedStockData.cmf ?? 0) >= 0 ? '+' : ''}{(selectedStockData.cmf ?? 0).toFixed(2)}
                  </div>
                  <div className="text-[8px] opacity-60 mt-0.5">{(selectedStockData.cmf ?? 0) >= 0 ? 'Accumulation' : 'Distribution'}</div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[9px] opacity-50 uppercase">LIQUIDITY SWEEP</div>
                  <div className={`font-black text-sm mt-0.5 ${selectedStockData.smcLiquiditySweepLevel ? 'text-amber-300' : 'text-slate-400'}`}>
                    {selectedStockData.smcLiquiditySweepLevel ? '✓ CONFIRMED' : 'NONE'}
                  </div>
                  <div className="text-[8px] opacity-60 mt-0.5">SL Hunt Completed</div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                  <div className="text-[9px] opacity-50 uppercase">SMC SETUP</div>
                  <div className="font-black text-xs mt-0.5 text-indigo-300 truncate">
                    {(selectedStockData.smcSetupType || 'RANGE_EQUILIBRIUM').replace(/_/g, ' ')}
                  </div>
                  <div className="text-[8px] opacity-60 mt-0.5">Smart Structure</div>
                </div>
              </div>
            </div>

            {/* 6. ORDER FLOW DELTA FOOTPRINT & CVD TAPE MATRIX */}
            <div
              className={`p-5 rounded-3xl border shadow-lg space-y-4 ${
                isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
                <h4 className="text-sm font-black italic uppercase tracking-tight flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  <span>Order Flow Delta Footprint &amp; CVD Tape</span>
                </h4>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                    selectedStockData.orderFlowBias.includes('BUY')
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : selectedStockData.orderFlowBias.includes('SELL')
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {(selectedStockData.orderFlowBias || 'BALANCED_FLOW').replace(/_/g, ' ')}
                </span>
              </div>

              {/* Delta Value & CVD Trend */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-[10px] opacity-60 uppercase font-sans">Net Cumulative Volume Delta (CVD)</div>
                  <div className={`text-base font-black ${(selectedStockData.cumulativeDeltaCr ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {(selectedStockData.cumulativeDeltaCr ?? 0) >= 0 ? '+' : ''}₹{(selectedStockData.cumulativeDeltaCr ?? 0).toFixed(1)} Cr
                  </div>
                  <div className="text-[10px] opacity-60 font-sans">
                    CVD Trend: <span className="font-bold text-slate-200">{selectedStockData.orderFlowBiasLabel || 'Balanced Flow'}</span>
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-1">
                  <div className="text-[10px] opacity-60 uppercase font-sans">Delta Divergence &amp; Iceberg</div>
                  <div className="text-sm font-black">
                    {selectedStockData.deltaDivergence && selectedStockData.deltaDivergence !== 'NONE' && selectedStockData.deltaDivergence !== 'REGULAR_CONFLUENCE' ? (
                      <span className={selectedStockData.deltaDivergence === 'BULLISH_DELTA_DIVERGENCE' ? 'text-emerald-400' : 'text-rose-400'}>
                        ⚡ {selectedStockData.deltaDivergence.replace(/_/g, ' ')}
                      </span>
                    ) : (
                      <span className="text-slate-400 text-xs">No Delta Divergence</span>
                    )}
                  </div>
                  <div className="text-[10px] opacity-60 font-sans">
                    {selectedStockData.icebergAbsorption ? (
                      <span className="text-sky-300 font-bold">🧊 {(selectedStockData.imbalanceSide || 'BUY_IMBALANCE').replace(/_/g, ' ')} Detected</span>
                    ) : (
                      <span>Imbalance Ratio: {(selectedStockData.bidAskImbalanceRatio ?? 1).toFixed(1)}x</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Buy vs Sell Volume Bar Visualizer */}
              <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-emerald-400 font-bold">Aggressive Buy: {(selectedStockData.aggressiveBuyPercent ?? 50).toFixed(0)}%</span>
                  <span className="text-rose-400 font-bold">Aggressive Sell: {(selectedStockData.aggressiveSellPercent ?? 50).toFixed(0)}%</span>
                </div>
                <div className="h-2 rounded-full overflow-hidden flex bg-slate-800">
                  <div
                    className="bg-emerald-500 transition-all duration-500"
                    style={{ width: `${selectedStockData.aggressiveBuyPercent ?? 50}%` }}
                  />
                  <div
                    className="bg-rose-500 transition-all duration-500"
                    style={{ width: `${selectedStockData.aggressiveSellPercent ?? 50}%` }}
                  />
                </div>
                <div className="text-[9px] opacity-60 flex justify-between font-sans">
                  <span>Net Delta: {(selectedStockData.netDeltaPercent ?? 0) >= 0 ? '+' : ''}{(selectedStockData.netDeltaPercent ?? 0).toFixed(1)}%</span>
                  <span>Tape Speed: ⚡ Real-Time Intraday Normalized</span>
                </div>
              </div>
            </div>
          </div>

          {/* EXACT RISK, TARGET & LOT-SIZING CALCULATOR */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
            {/* Risk & Target Ladder */}
            <div
              className={`p-5 rounded-3xl border shadow-lg ${
                isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <h4 className="text-sm font-black italic uppercase tracking-tight flex items-center gap-2 mb-3 pb-2 border-b border-slate-800/60">
                <Target className="w-4 h-4 text-emerald-400" />
                <span>Trade Execution &amp; Risk Ladder</span>
              </h4>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="opacity-60">RECOMMENDED ENTRY:</span>
                  <span className="font-black text-sm text-slate-100">₹{(selectedStockData.entryPrice ?? selectedStockData.price).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-rose-950/20 border border-rose-500/30 text-rose-300">
                  <span>STOP-LOSS (1.2× ATR):</span>
                  <span className="font-black text-sm">₹{(selectedStockData.stopLoss ?? selectedStockData.price * 0.985).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300">
                  <span>TARGET 1 (1.5× Risk - Book Partial &amp; Move SL to BE):</span>
                  <span className="font-black text-sm">₹{(selectedStockData.target1 ?? selectedStockData.price * 1.015).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-950/30 border border-emerald-500/40 text-emerald-300">
                  <span>TARGET 2 (2.5× Risk - Move Trailing SL):</span>
                  <span className="font-black text-sm">₹{(selectedStockData.target2 ?? selectedStockData.price * 1.025).toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/50 text-emerald-200 font-black">
                  <span>TARGET 3 (3.5× Risk - Final Exit):</span>
                  <span className="font-black text-sm">₹{(selectedStockData.target3 ?? selectedStockData.price * 1.035).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Position Sizer & F&O Lot Management */}
            <div
              className={`p-5 rounded-3xl border shadow-lg ${
                isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <h4 className="text-sm font-black italic uppercase tracking-tight flex items-center gap-2 mb-3 pb-2 border-b border-slate-800/60">
                <DollarSign className="w-4 h-4 text-amber-400" />
                <span>F&amp;O Lot Sizing &amp; Capital Allocation</span>
              </h4>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="opacity-60">F&amp;O CONTRACT LOT SIZE:</span>
                  <span className="font-bold text-slate-100">{selectedStockData.lotSize} Shares</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="opacity-60">RECOMMENDED LOTS ({config.riskPerTradePercent}% Risk):</span>
                  <span className="font-black text-indigo-300">{selectedStockData.recommendedLots} Lots ({selectedStockData.recommendedQty} Shares)</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="opacity-60">APPROX MARGIN REQUIRED:</span>
                  <span className="font-bold text-amber-300">₹{selectedStockData.capitalRequired.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="opacity-60">MAX CAPITAL AT RISK:</span>
                  <span className="font-black text-rose-400">₹{selectedStockData.maxLossAmount.toLocaleString('en-IN')}</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="opacity-60">ESTIMATED STATUTORY CHARGES:</span>
                  <span className="font-bold text-slate-300">~₹92.50 (STT + Brokerage + GST)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB: OPTION GREEKS BIAS & VOLATILITY MATRIX                   */}
      {/* ============================================================= */}
      {activeEngineTab === 'GREEKS' && (
        <div className="space-y-6 font-mono">
          {/* Header & Overview Cards */}
          <div
            className={`p-6 rounded-3xl border shadow-xl relative overflow-hidden transition-all ${
              isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 className="text-2xl font-black italic uppercase tracking-tight flex items-center gap-2">
                  <Zap className="w-6 h-6 text-amber-400 fill-current" />
                  <span>Option Greeks Bias &amp; Volatility Engine</span>
                </h3>
                <p className="text-xs opacity-70 font-sans mt-1 max-w-2xl leading-relaxed">
                  Real-time quantitative classification of the Top {config.topN} F&amp;O universe across Delta momentum velocity, Gamma acceleration, Theta decay exposure, and Implied Volatility Percentile.
                </p>
              </div>

              {/* Greeks Summary Metric Tiles */}
              <div className="grid grid-cols-3 gap-2.5 text-xs">
                <button
                  onClick={() => setGreeksFilter(greeksFilter === 'FAVORS_OPTION_BUYING' ? 'ALL' : 'FAVORS_OPTION_BUYING')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    greeksFilter === 'FAVORS_OPTION_BUYING'
                      ? 'bg-indigo-600 text-white border-indigo-400 shadow-md'
                      : 'bg-indigo-950/30 border-indigo-500/30 text-indigo-200 hover:bg-indigo-950/50'
                  }`}
                >
                  <div className="text-[10px] opacity-75 uppercase">OPTION BUYING</div>
                  <div className="text-xl font-black mt-0.5">{optionBuyingCount} STOCKS</div>
                  <div className="text-[9px] opacity-60 font-sans mt-0.5">Cheap IV + High RVOL</div>
                </button>

                <button
                  onClick={() => setGreeksFilter(greeksFilter === 'FAVORS_OPTION_SELLING' ? 'ALL' : 'FAVORS_OPTION_SELLING')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    greeksFilter === 'FAVORS_OPTION_SELLING'
                      ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                      : 'bg-purple-950/30 border-purple-500/30 text-purple-200 hover:bg-purple-950/50'
                  }`}
                >
                  <div className="text-[10px] opacity-75 uppercase">OPTION SELLING</div>
                  <div className="text-xl font-black mt-0.5">{optionSellingCount} STOCKS</div>
                  <div className="text-[9px] opacity-60 font-sans mt-0.5">Rich IV / Range Chop</div>
                </button>

                <button
                  onClick={() => setGreeksFilter(greeksFilter === 'NEUTRAL_SPREADS' ? 'ALL' : 'NEUTRAL_SPREADS')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    greeksFilter === 'NEUTRAL_SPREADS'
                      ? 'bg-slate-700 text-white border-slate-500 shadow-md'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:bg-slate-900'
                  }`}
                >
                  <div className="text-[10px] opacity-75 uppercase">NEUTRAL SPREADS</div>
                  <div className="text-xl font-black mt-0.5">{spreadsCount} STOCKS</div>
                  <div className="text-[9px] opacity-60 font-sans mt-0.5">Balanced Delta/Vega</div>
                </button>
              </div>
            </div>

            {/* Sub Filter Toolbar */}
            <div className="flex items-center justify-between gap-3 mt-5 pt-4 border-t border-slate-800/60 flex-wrap text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="opacity-60 text-[10px] uppercase font-bold">Filter Strategy:</span>
                <button
                  onClick={() => setGreeksFilter('ALL')}
                  className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                    greeksFilter === 'ALL'
                      ? 'bg-slate-700 text-white'
                      : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
                  }`}
                >
                  Show All ({topStocks.length})
                </button>
                <button
                  onClick={() => setGreeksFilter('FAVORS_OPTION_BUYING')}
                  className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                    greeksFilter === 'FAVORS_OPTION_BUYING'
                      ? 'bg-indigo-600 text-white'
                      : 'bg-indigo-950/40 text-indigo-300 hover:bg-indigo-900/50'
                  }`}
                >
                  ⚡ Option Buying ({optionBuyingCount})
                </button>
                <button
                  onClick={() => setGreeksFilter('FAVORS_OPTION_SELLING')}
                  className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                    greeksFilter === 'FAVORS_OPTION_SELLING'
                      ? 'bg-purple-600 text-white'
                      : 'bg-purple-950/40 text-purple-300 hover:bg-purple-900/50'
                  }`}
                >
                  🛡️ Option Selling ({optionSellingCount})
                </button>
                <button
                  onClick={() => setGreeksFilter('NEUTRAL_SPREADS')}
                  className={`px-3 py-1 rounded-xl font-bold transition-all cursor-pointer ${
                    greeksFilter === 'NEUTRAL_SPREADS'
                      ? 'bg-slate-600 text-white'
                      : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  ⚖️ Spreads ({spreadsCount})
                </button>
              </div>

              <div className="text-[11px] opacity-70">
                Displaying <span className="font-bold text-indigo-400">{topStocks.filter(s => greeksFilter === 'ALL' || s.greeksStrategyBias === greeksFilter).length}</span> stocks
              </div>
            </div>
          </div>

          {/* Greeks Table */}
          <div
            className={`rounded-3xl border shadow-xl overflow-hidden transition-all ${
              isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="border-b border-slate-800/80 bg-slate-950/40 text-[10px] uppercase opacity-70">
                    <th className="py-3 px-3 text-center">Rank</th>
                    <th className="py-3 px-3">Symbol &amp; Sector</th>
                    <th className="py-3 px-3 text-right">LTP (₹) &amp; RVOL</th>
                    <th className="py-3 px-3 text-center">Greeks Bias</th>
                    <th className="py-3 px-3 text-center">Delta (Δ)</th>
                    <th className="py-3 px-3 text-center">Gamma (Γ)</th>
                    <th className="py-3 px-3 text-center">Theta (Θ)</th>
                    <th className="py-3 px-3 text-center">Vega (V)</th>
                    <th className="py-3 px-3 text-center">IV &amp; Percentile</th>
                    <th className="py-3 px-3">Recommended Contract</th>
                    <th className="py-3 px-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {topStocks
                    .filter((s) => greeksFilter === 'ALL' || s.greeksStrategyBias === greeksFilter)
                    .map((stk) => (
                      <tr key={stk.symbol} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-3 text-center font-bold text-amber-400">#{stk.volumeRank}</td>
                        <td className="py-3 px-3">
                          <div className="font-black text-slate-100">{stk.symbol}</div>
                          <div className="text-[10px] opacity-60 font-sans">{stk.sector}</div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="font-bold">₹{stk.price.toFixed(2)}</div>
                          <div className="text-[10px] text-emerald-400">{stk.rvol}x RVOL</div>
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-black ${
                              stk.greeksStrategyBias === 'FAVORS_OPTION_BUYING'
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                                : stk.greeksStrategyBias === 'FAVORS_OPTION_SELLING'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {stk.greeksStrategyBias === 'FAVORS_OPTION_BUYING'
                              ? '⚡ OPTION BUYING'
                              : stk.greeksStrategyBias === 'FAVORS_OPTION_SELLING'
                              ? '🛡️ OPTION SELLING'
                              : '⚖️ NEUTRAL SPREADS'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-emerald-400">
                          {stk.delta > 0 ? '+' : ''}{stk.delta}
                        </td>
                        <td className="py-3 px-3 text-center text-cyan-400">{stk.gamma}</td>
                        <td className="py-3 px-3 text-center font-bold text-rose-400 whitespace-nowrap">
                          -₹{Math.abs(stk.theta).toFixed(1)}/d
                        </td>
                        <td className="py-3 px-3 text-center text-purple-400">₹{stk.vega}</td>
                        <td className="py-3 px-3 text-center">
                          <div className="font-bold text-amber-300">{stk.iv}%</div>
                          <div className="text-[9px] opacity-60">({stk.ivPercentile}%ile)</div>
                        </td>
                        <td className="py-3 px-3">
                          {stk.recommendedOptionContract ? (
                            <div>
                              <div className="font-bold text-slate-200 text-[11px]">
                                {stk.recommendedOptionContract.contractName}
                              </div>
                              <div className="text-[10px] text-amber-300">
                                @ ₹{(stk.recommendedOptionContract.premiumPrice ?? 0).toFixed(2)}
                              </div>
                            </div>
                          ) : (
                            <span className="opacity-40 text-[10px]">ATM Straddle</span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedGreeksModalStock(stk)}
                              className="px-2.5 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                              title="Open Option Greeks Deep-Dive & Payoff Simulator"
                            >
                              <Zap className="w-3 h-3" />
                              <span>Analyze</span>
                            </button>
                            <button
                              onClick={() => handleOpenTrade(stk)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold transition-all cursor-pointer flex items-center gap-1"
                              title="Execute Trade"
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span>Trade</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 3: ACTIVE POSITIONS & STATE MACHINE MONITOR               */}
      {/* ============================================================= */}
      {activeEngineTab === 'POSITIONS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-black italic font-mono uppercase tracking-tight flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-400" />
                <span>Live Position Monitor &amp; State Machine</span>
              </h3>
              <p className="text-xs opacity-70 font-sans mt-0.5">
                Automated lifecycle monitoring: Entry &rarr; Target 1 (SL to BE) &rarr; Target 2 (TSL) &rarr; Target 3 &rarr; Auto Time Exit (15:15 IST).
              </p>
            </div>
          </div>

          {activePositions.length === 0 ? (
            <div
              className={`p-12 text-center rounded-3xl border ${
                isDark ? 'bg-slate-900/60 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <Activity className="w-10 h-10 mx-auto text-slate-600 mb-3 animate-pulse" />
              <div className="text-base font-bold font-mono text-slate-300">NO ACTIVE POSITIONS CURRENTLY RUNNING</div>
              <p className="text-xs max-w-md mx-auto mt-1 opacity-70">
                Go to the Top {config.topN} Scanner Matrix and click "Trade" on any stock with Score ≥ 80 to launch a managed trade.
              </p>
              <button
                onClick={() => setActiveEngineTab('SCANNER')}
                className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold transition-all"
              >
                Open Top {config.topN} Scanner
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {activePositions.map((pos) => {
                const isBull = pos.direction === 'BUY';
                const pnl = isBull
                  ? (pos.currentPrice - pos.entryPrice) * pos.quantity
                  : (pos.entryPrice - pos.currentPrice) * pos.quantity;

                return (
                  <div
                    key={pos.id}
                    className={`p-5 rounded-3xl border shadow-lg font-mono text-xs transition-all ${
                      isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
                    }`}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      {/* Left Details */}
                      <div>
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span
                            className={`px-2.5 py-1 rounded-xl text-xs font-black uppercase text-white ${
                              isBull ? 'bg-emerald-600' : 'bg-rose-600'
                            }`}
                          >
                            {pos.direction} ({pos.lots} Lots / {pos.quantity} Qty)
                          </span>
                          <span className="text-lg font-black text-slate-100">{pos.symbol}</span>
                          <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                            {pos.sector}
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px]">
                            Entry Score: {pos.scoreAtEntry}/100
                          </span>
                        </div>
                        <div className="text-[11px] opacity-60 mt-1">
                          Entered at {pos.entryTime} • Entry Quote: ₹{pos.entryPrice.toFixed(2)} • Current Spot: ₹{pos.currentPrice.toFixed(2)}
                        </div>
                      </div>

                      {/* Middle Real-time P&L */}
                      <div className="text-left md:text-right">
                        <div className="text-[10px] opacity-60 uppercase font-bold">ESTIMATED NET P&amp;L:</div>
                        <div
                          className={`text-xl font-black ${
                            pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {pnl >= 0 ? '+' : ''}₹{pnl.toFixed(2)}
                        </div>
                        <div className="text-[10px] opacity-60">Less ~₹{pos.charges.totalCharges} taxes &amp; brokerage</div>
                      </div>

                      {/* Right Action */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleClosePosition(pos.id, 'MANUAL_EXIT')}
                          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shadow-md transition-all cursor-pointer"
                        >
                          Square Off
                        </button>
                      </div>
                    </div>

                    {/* Progress State Machine Bar */}
                    <div className="mt-4 pt-3 border-t border-slate-800/60 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-[10px]">
                        <div className="opacity-50">STOP-LOSS:</div>
                        <div className="font-bold text-rose-400 text-xs mt-0.5">₹{pos.stopLoss.toFixed(2)}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-[10px]">
                        <div className="opacity-50">TARGET 1 (1.5R):</div>
                        <div className="font-bold text-emerald-400 text-xs mt-0.5">₹{pos.target1.toFixed(2)}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-[10px]">
                        <div className="opacity-50">TARGET 2 (2.5R):</div>
                        <div className="font-bold text-emerald-400 text-xs mt-0.5">₹{pos.target2.toFixed(2)}</div>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-[10px]">
                        <div className="opacity-50">TARGET 3 (3.5R):</div>
                        <div className="font-bold text-emerald-300 text-xs mt-0.5">₹{pos.target3.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 4: P&L LEDGER & TRADE LOG                                 */}
      {/* ============================================================= */}
      {activeEngineTab === 'TRADE_LOG' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-black italic font-mono uppercase tracking-tight flex items-center gap-2">
                <Clock className="w-5 h-5 text-cyan-400" />
                <span>P&amp;L Ledger &amp; Completed Trade Log</span>
              </h3>
              <p className="text-xs opacity-70 font-sans mt-0.5">
                Audit trail with itemized statutory STT, exchange turnover, GST, SEBI fees, and net profit.
              </p>
            </div>

            {closedTrades.length > 0 && (
              <button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(closedTrades, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `top_volume_fno_trade_log_${Date.now()}.json`;
                  a.click();
                }}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono text-xs font-bold border border-slate-700 flex items-center gap-1.5 transition-all"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export Log (JSON)</span>
              </button>
            )}
          </div>

          {closedTrades.length === 0 ? (
            <div
              className={`p-10 text-center rounded-3xl border ${
                isDark ? 'bg-slate-900/60 border-slate-800 text-slate-400' : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              <Clock className="w-8 h-8 mx-auto text-slate-600 mb-2" />
              <div className="text-sm font-bold font-mono text-slate-300">NO CLOSED TRADES RECORDED YET</div>
              <p className="text-xs max-w-sm mx-auto mt-1 opacity-70">
                Completed positions will automatically be archived here with exact tax and brokerage deductions.
              </p>
            </div>
          ) : (
            <div
              className={`rounded-3xl border shadow-lg overflow-hidden transition-all ${
                isDark ? 'bg-slate-900/95 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
              }`}
            >
              <div className="overflow-x-auto">
                <table className="w-full text-left font-mono text-xs">
                  <thead>
                    <tr className="border-b border-slate-800/80 bg-slate-950/40 text-[10px] uppercase opacity-70">
                      <th className="py-3 px-4">Trade ID / Time</th>
                      <th className="py-3 px-4">Symbol &amp; Side</th>
                      <th className="py-3 px-4 text-right">Entry / Exit</th>
                      <th className="py-3 px-4 text-right">Quantity</th>
                      <th className="py-3 px-4 text-center">Exit Reason</th>
                      <th className="py-3 px-4 text-right">Gross P&amp;L</th>
                      <th className="py-3 px-4 text-right">Taxes &amp; Brokerage</th>
                      <th className="py-3 px-4 text-right">Net P&amp;L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {closedTrades.map((t) => (
                      <tr key={t.id} className="hover:bg-slate-800/20 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <div className="font-bold text-slate-100">{t.symbol}</div>
                          <div className="text-[10px] opacity-60">{t.entryTime} &rarr; {t.exitTime}</div>
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black ${
                              t.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                            }`}
                          >
                            {t.direction}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="font-bold">₹{t.entryPrice.toFixed(2)} &rarr; ₹{(t.exitPrice || 0).toFixed(2)}</div>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div>{t.quantity} shares</div>
                          <div className="text-[10px] opacity-60">({t.lots} lots)</div>
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                            {t.exitReason || 'TARGET_HIT'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold whitespace-nowrap">
                          <span className={t.grossPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {t.grossPnL >= 0 ? '+' : ''}₹{t.grossPnL.toFixed(2)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-rose-400 whitespace-nowrap">
                          -₹{t.charges.totalCharges.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-black whitespace-nowrap">
                          <span className={t.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {t.netPnL >= 0 ? '+' : ''}₹{t.netPnL.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* TAB 5: WALK-FORWARD BACKTEST SIMULATOR                        */}
      {/* ============================================================= */}
      {activeEngineTab === 'BACKTEST' && (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-black italic font-mono uppercase tracking-tight flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <span>Walk-Forward Backtest Simulator (Top-Volume Strategy)</span>
              </h3>
              <p className="text-xs opacity-70 font-sans mt-0.5">
                Simulated execution with realistic slippage, statutory taxes (STT/GST), and 1:2.4 average risk-to-reward metrics.
              </p>
            </div>

            <button
              onClick={handleRunBacktest}
              className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-mono text-xs font-bold shadow-md shadow-purple-600/30 flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Re-run Simulation</span>
            </button>
          </div>

          {backtestResult && (
            <div className="space-y-5">
              {/* Backtest KPI Row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono text-xs">
                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="opacity-50 text-[10px] uppercase">WIN RATE:</div>
                  <div className="text-xl font-black text-emerald-400 mt-1">{backtestResult.winRatePercent}%</div>
                  <div className="text-[10px] opacity-60 mt-0.5">{backtestResult.winningTrades}W / {backtestResult.losingTrades}L</div>
                </div>

                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="opacity-50 text-[10px] uppercase">TOTAL NET P&amp;L:</div>
                  <div className="text-xl font-black text-emerald-400 mt-1">₹{backtestResult.totalNetPnL.toLocaleString('en-IN')}</div>
                  <div className="text-[10px] opacity-60 mt-0.5">After all taxes</div>
                </div>

                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="opacity-50 text-[10px] uppercase">PROFIT FACTOR:</div>
                  <div className="text-xl font-black text-indigo-300 mt-1">{backtestResult.profitFactor}</div>
                  <div className="text-[10px] opacity-60 mt-0.5">Gross Win / Gross Loss</div>
                </div>

                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="opacity-50 text-[10px] uppercase">AVG TRADE NET:</div>
                  <div className="text-xl font-black text-amber-300 mt-1">₹{backtestResult.avgTradeNetPnL.toLocaleString('en-IN')}</div>
                  <div className="text-[10px] opacity-60 mt-0.5">Per setup</div>
                </div>

                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="opacity-50 text-[10px] uppercase">MAX DRAWDOWN:</div>
                  <div className="text-xl font-black text-rose-400 mt-1">{backtestResult.maxDrawdownPercent}%</div>
                  <div className="text-[10px] opacity-60 mt-0.5">Peak-to-valley</div>
                </div>

                <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className="opacity-50 text-[10px] uppercase">AVG RISK/REWARD:</div>
                  <div className="text-xl font-black text-cyan-300 mt-1">{backtestResult.avgRiskReward}</div>
                  <div className="text-[10px] opacity-60 mt-0.5">Realized R:R</div>
                </div>
              </div>

              {/* Backtest Trades Table */}
              <div
                className={`rounded-3xl border shadow-lg overflow-hidden transition-all ${
                  isDark ? 'bg-slate-900/95 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
                }`}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono text-xs">
                    <thead>
                      <tr className="border-b border-slate-800/80 bg-slate-950/40 text-[10px] uppercase opacity-70">
                        <th className="py-3 px-4">Symbol / Rank</th>
                        <th className="py-3 px-4">Direction</th>
                        <th className="py-3 px-4 text-center">Score</th>
                        <th className="py-3 px-4 text-right">Entry / Exit</th>
                        <th className="py-3 px-4 text-right">Quantity</th>
                        <th className="py-3 px-4 text-center">Exit Trigger</th>
                        <th className="py-3 px-4 text-right">Statutory Charges</th>
                        <th className="py-3 px-4 text-right">Net Profit / Loss</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      {backtestResult.trades.map((t) => (
                        <tr key={t.tradeId} className="hover:bg-slate-800/20 transition-colors">
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="font-bold text-slate-100">{t.symbol}</div>
                            <div className="text-[10px] opacity-60">Rank #{t.volumeRank} • {t.sector}</div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black ${
                                t.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {t.direction}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span className="font-bold text-indigo-300">{t.score}/100</span>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="font-bold">₹{t.entryPrice.toFixed(2)} &rarr; ₹{t.exitPrice.toFixed(2)}</div>
                            <div className="text-[10px] opacity-60">{t.holdingMinutes} mins holding</div>
                          </td>
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div>{t.quantity} shares</div>
                            <div className="text-[10px] opacity-60">({t.lots} lots)</div>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                t.isWin
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                              }`}
                            >
                              {t.exitReason}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right text-rose-400 whitespace-nowrap">
                            -₹{t.totalCharges.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-black whitespace-nowrap">
                            <span className={t.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                              {t.netPnL >= 0 ? '+' : ''}₹{t.netPnL.toFixed(2)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================= */}
      {/* 60-MINUTE TRADINGVIEW LIVE PRO COCKPIT MODAL (↗ 60m CHART)    */}
      {/* ============================================================= */}
      {selected60mChartStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md">
          <div className="bg-slate-950 border border-slate-800 w-full max-w-7xl h-[92vh] rounded-3xl flex flex-col shadow-2xl overflow-hidden font-mono">
            {/* Modal Header */}
            <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="w-9 h-9 rounded-xl bg-cyan-600 flex items-center justify-center text-white shadow-md shadow-cyan-600/30">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-black text-white italic tracking-tight flex items-center gap-1.5">
                      <span>{selected60mChartStock.symbol}</span>
                      <span className="text-cyan-400 font-sans not-italic text-sm">60-Min TV Pro Cockpit ↗</span>
                    </h3>
                    <span className="px-2 py-0.5 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                      Vol Rank #{selected60mChartStock.volumeRank} of Top {config.topN}
                    </span>
                    <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 text-[10px]">
                      {selected60mChartStock.sector}
                    </span>
                  </div>
                  <div className="text-[11px] opacity-70 flex items-center gap-2 mt-0.5">
                    <span className="font-bold text-white">₹{selected60mChartStock.price.toFixed(2)}</span>
                    <span className={selected60mChartStock.changePercent >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {selected60mChartStock.changePercent >= 0 ? '+' : ''}{selected60mChartStock.changePercent.toFixed(2)}%
                    </span>
                    <span>• Contract Lot: {selected60mChartStock.lotSize}</span>
                    <span>• Traded Value: ₹{selected60mChartStock.tradedValueCrores} Cr</span>
                  </div>
                </div>
              </div>

              {/* Timeframe Selectors & Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                  {(['5', '15', '60', 'D'] as const).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setChart60mInterval(tf)}
                      className={`px-3 py-1 rounded-lg font-bold transition-all ${
                        chart60mInterval === tf
                          ? 'bg-cyan-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {tf === 'D' ? '1D' : `${tf}m`}{tf === '60' ? ' (Higher TF Focus)' : ''}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => handleOpenTrade(selected60mChartStock)}
                  className={`px-4 py-2 rounded-xl text-xs font-black text-white shadow-md transition-all flex items-center gap-1.5 cursor-pointer ${
                    selected60mChartStock.signalType === 'SELL'
                      ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                      : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                  }`}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Execute {selected60mChartStock.signalType === 'SELL' ? 'Short' : 'Trade'}</span>
                </button>

                <button
                  onClick={() => setSelected60mChartStock(null)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                  title="Close 60m Cockpit"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Live Telemetry Bar */}
            <div className="px-4 py-2.5 bg-slate-900/90 border-b border-slate-800/80 grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px]">
              {/* Sector Sentiment */}
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[9px] opacity-50 uppercase">SECTOR SENTIMENT:</div>
                <div className="font-bold flex items-center gap-1 mt-0.5">
                  <span className={selected60mChartStock.sectorBias === 'POSITIVE' ? 'text-emerald-400' : 'text-rose-400'}>
                    {selected60mChartStock.sectorBias === 'POSITIVE' ? '🟢 POSITIVE' : '🔴 NEGATIVE'} ({(selected60mChartStock.sectorChangePercent ?? 0) >= 0 ? '+' : ''}{(selected60mChartStock.sectorChangePercent ?? 0).toFixed(1)}%)
                  </span>
                </div>
              </div>

              {/* Institutional Status */}
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[9px] opacity-50 uppercase">INSTITUTIONAL FLOW:</div>
                <div className="font-bold text-amber-300 mt-0.5 truncate">
                  🏦 {(selected60mChartStock.institutionalStatus || '').replace('AGGRESSIVE_', '')} (₹{selected60mChartStock.institutionalBlockValueCr ?? 0} Cr)
                </div>
              </div>

              {/* 60M Trend */}
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[9px] opacity-50 uppercase">60M REGIME &amp; RSI:</div>
                <div className="font-bold text-cyan-300 mt-0.5">
                  {selected60mChartStock.trend60MArrow} {selected60mChartStock.trend60M} (RSI {(selected60mChartStock.rsi60m ?? 50).toFixed(0)})
                </div>
              </div>

              {/* OI Action */}
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[9px] opacity-50 uppercase">OI ACTION &amp; PCR:</div>
                <div className="font-bold text-purple-300 mt-0.5">
                  {(selected60mChartStock.oiAction || '').replace('_', ' ')} (PCR {selected60mChartStock.pcr ?? 1})
                </div>
              </div>

              {/* Greeks Bias */}
              <div className="p-2 rounded-xl bg-slate-950/70 border border-slate-800">
                <div className="text-[9px] opacity-50 uppercase">GREEKS STATUS:</div>
                <div className="font-black text-emerald-400 mt-0.5 truncate">
                  {selected60mChartStock.greeksStrategyBias === 'FAVORS_OPTION_BUYING'
                    ? '⚡ OPTION BUYING'
                    : selected60mChartStock.greeksStrategyBias === 'FAVORS_OPTION_SELLING'
                    ? '🛡️ OPTION SELLING'
                    : '⚖️ NEUTRAL SPREADS'}{' '}
                  (Δ {(selected60mChartStock.delta ?? 0) > 0 ? '+' : ''}{selected60mChartStock.delta ?? 0})
                </div>
              </div>
            </div>

            {/* TradingView Chart Container */}
            <div className="flex-1 bg-slate-950 relative overflow-hidden">
              <iframe
                title={`TradingView Chart ${selected60mChartStock.symbol}`}
                src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${encodeURIComponent(
                  getTradingViewSymbol(selected60mChartStock.symbol)
                )}&interval=${chart60mInterval}&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%5D&theme=dark&style=1&timezone=Asia%2FKolkata&withdateranges=1&showpopupbutton=1&popupwidth=1000&popupheight=650`}
                className="w-full h-full border-0"
              />
            </div>

            {/* Modal Bottom Telemetry & Contract Bar */}
            <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-4 flex-wrap">
                <div>
                  <span className="opacity-50">60M Support: </span>
                  <span className="font-black text-emerald-400">₹{(selected60mChartStock.support60m ?? selected60mChartStock.price * 0.98).toFixed(2)}</span>
                </div>
                <div>
                  <span className="opacity-50">60M Resistance: </span>
                  <span className="font-black text-rose-400">₹{(selected60mChartStock.resistance60m ?? selected60mChartStock.price * 1.02).toFixed(2)}</span>
                </div>
                {selected60mChartStock.recommendedOptionContract ? (
                  <div>
                    <span className="opacity-50">Recommended Contract: </span>
                    <span className="font-black text-amber-300">
                      {selected60mChartStock.recommendedOptionContract.contractName} (@ ₹{(selected60mChartStock.recommendedOptionContract.premiumPrice ?? 0).toFixed(2)})
                    </span>
                  </div>
                ) : null}
                <div>
                  <span className="opacity-50">Score: </span>
                  <span className="font-black text-emerald-400">{selected60mChartStock.overallScore}/100 PTS</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    setSelectedStockSymbol(selected60mChartStock.symbol);
                    setActiveEngineTab('DIAGNOSTICS');
                    setSelected60mChartStock(null);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold border border-slate-700 transition-all cursor-pointer"
                >
                  View 100-Pt Breakdown
                </button>
                <button
                  onClick={() => setSelected60mChartStock(null)}
                  className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold transition-all cursor-pointer"
                >
                  Close Chart
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* OPTION GREEKS INTELLIGENCE & STRATEGY SIMULATOR MODAL */}
      {selectedGreeksModalStock && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
          <div
            className={`w-full max-w-4xl max-h-[92vh] rounded-3xl border shadow-2xl flex flex-col overflow-hidden font-mono ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-950/60 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  <Zap className="w-5 h-5 fill-current" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xl font-black italic tracking-tight">{selectedGreeksModalStock.symbol}</h3>
                    <span className="px-2 py-0.5 rounded-lg text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
                      {selectedGreeksModalStock.sector}
                    </span>
                    <span className="text-xs text-amber-400 font-bold">
                      Rank #{selectedGreeksModalStock.volumeRank}
                    </span>
                  </div>
                  <div className="text-xs opacity-70 font-sans mt-0.5">
                    {selectedGreeksModalStock.name} • LTP: ₹{selectedGreeksModalStock.price.toFixed(2)} (
                    <span className={selectedGreeksModalStock.changePercent >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                      {selectedGreeksModalStock.changePercent >= 0 ? '+' : ''}{selectedGreeksModalStock.changePercent.toFixed(2)}%
                    </span>
                    ) • Lot: {selectedGreeksModalStock.lotSize}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setSelectedGreeksModalStock(null)}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* Institutional Strategy Bias Verdict Card */}
              <div
                className={`p-5 rounded-2xl border ${
                  selectedGreeksModalStock.greeksStrategyBias === 'FAVORS_OPTION_BUYING'
                    ? 'bg-indigo-950/40 border-indigo-500/40 text-indigo-100'
                    : selectedGreeksModalStock.greeksStrategyBias === 'FAVORS_OPTION_SELLING'
                    ? 'bg-purple-950/40 border-purple-500/40 text-purple-100'
                    : 'bg-slate-950/60 border-slate-700 text-slate-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">
                      {selectedGreeksModalStock.greeksStrategyBias === 'FAVORS_OPTION_BUYING'
                        ? '⚡'
                        : selectedGreeksModalStock.greeksStrategyBias === 'FAVORS_OPTION_SELLING'
                        ? '🛡️'
                        : '⚖️'}
                    </span>
                    <h4 className="text-base font-black tracking-tight uppercase">
                      Strategy Verdict:{' '}
                      {selectedGreeksModalStock.greeksStrategyBias === 'FAVORS_OPTION_BUYING'
                        ? 'FAVORS OPTION BUYING'
                        : selectedGreeksModalStock.greeksStrategyBias === 'FAVORS_OPTION_SELLING'
                        ? 'FAVORS OPTION SELLING / THETA HARVESTING'
                        : 'FAVORS DEFINED-RISK SPREADS'}
                    </h4>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-black uppercase ${
                      selectedGreeksModalStock.greeksStrategyBias === 'FAVORS_OPTION_BUYING'
                        ? 'bg-indigo-600 text-white'
                        : selectedGreeksModalStock.greeksStrategyBias === 'FAVORS_OPTION_SELLING'
                        ? 'bg-purple-600 text-white'
                        : 'bg-slate-700 text-slate-200'
                    }`}
                  >
                    {selectedGreeksModalStock.greeksStrategyBias.replace('FAVORS_', '').replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs opacity-90 font-sans leading-relaxed">
                  {selectedGreeksModalStock.greeksBiasReason}
                </p>
              </div>

              {/* 5 Greeks Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] opacity-60 uppercase">DELTA (Δ)</div>
                  <div className="text-lg font-black text-emerald-400 mt-1">
                    {selectedGreeksModalStock.delta > 0 ? '+' : ''}{selectedGreeksModalStock.delta}
                  </div>
                  <div className="text-[9px] opacity-50 font-sans mt-0.5">₹/₹ underlying move</div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] opacity-60 uppercase">GAMMA (Γ)</div>
                  <div className="text-lg font-black text-cyan-400 mt-1">
                    {selectedGreeksModalStock.gamma}
                  </div>
                  <div className="text-[9px] opacity-50 font-sans mt-0.5">Delta acceleration</div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] opacity-60 uppercase">THETA (Θ)</div>
                  <div className="text-lg font-black text-rose-400 mt-1">
                    -₹{Math.abs(selectedGreeksModalStock.theta).toFixed(2)}
                  </div>
                  <div className="text-[9px] opacity-50 font-sans mt-0.5">Daily time decay/sh</div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] opacity-60 uppercase">VEGA (V)</div>
                  <div className="text-lg font-black text-purple-400 mt-1">
                    ₹{selectedGreeksModalStock.vega}
                  </div>
                  <div className="text-[9px] opacity-50 font-sans mt-0.5">Per 1% IV shift</div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-950/70 border border-slate-800">
                  <div className="text-[10px] opacity-60 uppercase">IMPLIED VOL (IV)</div>
                  <div className="text-lg font-black text-amber-300 mt-1">
                    {selectedGreeksModalStock.iv}%
                  </div>
                  <div className="text-[9px] opacity-50 font-sans mt-0.5">
                    {selectedGreeksModalStock.ivPercentile}th percentile
                  </div>
                </div>
              </div>

              {/* IV Gauge & Volatility Regime */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-amber-400" />
                    <span>Volatility Pricing Regime (IV Percentile: {selectedGreeksModalStock.ivPercentile}%)</span>
                  </span>
                  <span className="text-[11px] font-bold text-slate-300">
                    {selectedGreeksModalStock.ivPercentile <= 40
                      ? '🟢 CHEAP VOLATILITY (Option Buyer Friendly)'
                      : selectedGreeksModalStock.ivPercentile <= 65
                      ? '🟡 BALANCED VOLATILITY (Spreads Friendly)'
                      : '🔴 EXPENSIVE / INFLATED (Option Seller Friendly)'}
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden p-0.5 flex">
                  <div
                    className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500"
                    style={{ width: `${Math.min(100, Math.max(5, selectedGreeksModalStock.ivPercentile))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] opacity-60 font-sans">
                  <span>0% (Deep Discount)</span>
                  <span>50% (Fair Value Mean)</span>
                  <span>100% (Extreme Premium Peak)</span>
                </div>
              </div>

              {/* Option Payoff & Sensitivity Scenario Matrix */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <h5 className="text-xs font-black uppercase tracking-tight flex items-center gap-1.5">
                    <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                    <span>1-Day Underlying Move vs Option P&amp;L Simulation (1 Lot: {selectedGreeksModalStock.lotSize} Qty)</span>
                  </h5>
                  <span className="text-[10px] opacity-60 font-sans">Combined Delta + Gamma + Theta impact</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  {/* +1% Move */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
                    <div className="text-[10px] opacity-60">+1% Stock Surge (+₹{(selectedGreeksModalStock.price * 0.01).toFixed(1)})</div>
                    <div className="text-base font-black text-emerald-400 mt-1">
                      +₹{((selectedGreeksModalStock.price * 0.01 * selectedGreeksModalStock.delta - Math.abs(selectedGreeksModalStock.theta)) * selectedGreeksModalStock.lotSize).toFixed(0)}
                    </div>
                    <div className="text-[9px] opacity-50 mt-0.5">Net P&amp;L / lot</div>
                  </div>

                  {/* +2% Move */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
                    <div className="text-[10px] opacity-60">+2% Stock Breakout (+₹{(selectedGreeksModalStock.price * 0.02).toFixed(1)})</div>
                    <div className="text-base font-black text-emerald-400 mt-1">
                      +₹{((selectedGreeksModalStock.price * 0.02 * (selectedGreeksModalStock.delta + selectedGreeksModalStock.gamma * selectedGreeksModalStock.price * 0.01) - Math.abs(selectedGreeksModalStock.theta)) * selectedGreeksModalStock.lotSize).toFixed(0)}
                    </div>
                    <div className="text-[9px] opacity-50 mt-0.5">Net P&amp;L / lot</div>
                  </div>

                  {/* 0% Flat Move (Theta Decay) */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
                    <div className="text-[10px] opacity-60">0% Move / 1-Day Flat (Chop)</div>
                    <div className="text-base font-black text-rose-400 mt-1">
                      -₹{(Math.abs(selectedGreeksModalStock.theta) * selectedGreeksModalStock.lotSize).toFixed(0)}
                    </div>
                    <div className="text-[9px] opacity-50 mt-0.5">Theta decay / lot</div>
                  </div>

                  {/* -1% Adverse Move */}
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
                    <div className="text-[10px] opacity-60">-1% Adverse Move (-₹{(selectedGreeksModalStock.price * 0.01).toFixed(1)})</div>
                    <div className="text-base font-black text-rose-400 mt-1">
                      -₹{((selectedGreeksModalStock.price * 0.01 * selectedGreeksModalStock.delta + Math.abs(selectedGreeksModalStock.theta)) * selectedGreeksModalStock.lotSize).toFixed(0)}
                    </div>
                    <div className="text-[9px] opacity-50 mt-0.5">Net P&amp;L / lot</div>
                  </div>
                </div>
              </div>

              {/* Recommended Option Contract & Playbook */}
              {selectedGreeksModalStock.recommendedOptionContract && (
                <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/40 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="text-[10px] opacity-60 uppercase font-sans">RECOMMENDED OPTION PLAYBOOK:</div>
                      <div className="text-base font-black text-slate-100 mt-0.5 flex items-center gap-2">
                        <span>{selectedGreeksModalStock.recommendedOptionContract.contractName}</span>
                        <span className="text-sm font-bold text-amber-300">
                          @ ₹{(selectedGreeksModalStock.recommendedOptionContract.premiumPrice ?? 0).toFixed(2)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          handleOpenTrade(selectedGreeksModalStock);
                          setSelectedGreeksModalStock(null);
                        }}
                        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-xs font-black shadow-lg shadow-emerald-600/30 transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>EXECUTE OPTION TRADE</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                    <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                      <div className="text-[9px] opacity-50">RECOMMENDED SL</div>
                      <div className="font-bold text-rose-400 mt-0.5">₹{selectedGreeksModalStock.recommendedOptionContract.optionStopLoss}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                      <div className="text-[9px] opacity-50">TARGET 1 (TRAIL SL)</div>
                      <div className="font-bold text-emerald-400 mt-0.5">₹{selectedGreeksModalStock.recommendedOptionContract.optionTarget1}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 text-center">
                      <div className="text-[9px] opacity-50">TARGET 2 (RUNNER)</div>
                      <div className="font-bold text-cyan-400 mt-0.5">₹{selectedGreeksModalStock.recommendedOptionContract.optionTarget2}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between gap-3 text-xs">
              <div className="text-[11px] opacity-70 font-sans">
                Greeks updated continuously based on Black-Scholes model &amp; live volume velocity.
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setSelectedStockSymbol(selectedGreeksModalStock.symbol);
                    setActiveEngineTab('DIAGNOSTICS');
                    setSelectedGreeksModalStock(null);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold border border-slate-700 transition-all cursor-pointer"
                >
                  View 100-Pt Breakdown
                </button>
                <button
                  onClick={() => setSelectedGreeksModalStock(null)}
                  className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
