import React, { useState, useMemo } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Brain,
  CheckCircle2,
  ChevronRight,
  Clock,
  Compass,
  Filter,
  Layers,
  LineChart,
  Lock,
  PieChart,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  AIStockRecommendation,
  MarketOverview,
  OIBuildupType,
  OptionAlertSignal,
  ScannedStock,
} from '../types';
import {
  generateAIStockRecommendations,
  generateOptionCallPutAlerts,
  getMarketIndexOISummary,
} from '../utils/oiAnalysis';
import { getSectorPerformanceMap, getInstitutionalEntryAction, getOiDetailedAction } from '../utils/sectorAndOiHelpers';
import { getMarketHoursAlertTime } from '../data/marketSchedule';
import { ScrollContainer } from './ScrollContainer';

interface LiveOiAiRecommendationsViewProps {
  stocks: ScannedStock[];
  theme: string;
  overview?: MarketOverview;
  onRefreshScan?: () => void;
  onCreateTrade?: (trade: {
    symbol: string;
    stockName: string;
    type: 'BUY' | 'SELL';
    entryPrice: number;
    stopLoss: number;
    target1: number;
    target2: number;
  }) => void;
  onSelectStock?: (stock: ScannedStock) => void;
}

export const LiveOiAiRecommendationsView: React.FC<
  LiveOiAiRecommendationsViewProps
> = ({ stocks, theme, overview, onRefreshScan, onCreateTrade, onSelectStock }) => {
  const isDark = theme === 'dark';

  // Sub-tab selection: 'options' | 'equityRecs' | 'oiTable'
  const [activeSubTab, setActiveSubTab] = useState<'options' | 'equityRecs' | 'oiTable'>('options');
  
  // Filters
  const [categoryFilter, setCategoryFilter] = useState<'ALL' | 'INDEX' | 'STOCKS'>('ALL');
  const [optionTypeFilter, setOptionTypeFilter] = useState<'ALL' | 'CE' | 'PE'>('ALL');
  const [accuracyFilter, setAccuracyFilter] = useState<'ALL' | '95_PLUS' | '90_PLUS'>('ALL');
  const [buildupFilter, setBuildupFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals & Executed trades tracking
  const [selectedStrikeStock, setSelectedStrikeStock] = useState<ScannedStock | null>(null);
  const [inspectingOptionAlert, setInspectingOptionAlert] = useState<OptionAlertSignal | null>(null);
  const [executedTradeIds, setExecutedTradeIds] = useState<Set<string>>(new Set());
  const [isRefreshingAi, setIsRefreshingAi] = useState<boolean>(false);
  const [selectedStockSymbolForCheck, setSelectedStockSymbolForCheck] = useState<string>(stocks[0]?.symbol || 'TVSMOTOR');

  // Currently selected stock for Quick Price & Option Checker
  const activeCheckerStock = useMemo(() => {
    return stocks.find((s) => s.symbol === selectedStockSymbolForCheck) || stocks[0];
  }, [stocks, selectedStockSymbolForCheck]);

  const activeCheckerAtmStrike = activeCheckerStock?.oiData?.atmStrike || Math.round((activeCheckerStock?.price || 100) / 50) * 50;
  const activeCheckerChain = activeCheckerStock?.oiData?.optionChain || [];
  const activeCheckerAtmOption = activeCheckerChain.find((i) => i.strike === activeCheckerAtmStrike) || activeCheckerChain[Math.floor(activeCheckerChain.length / 2)] || {
    strike: activeCheckerAtmStrike,
    callLtp: Number(((activeCheckerStock?.price || 100) * 0.02).toFixed(2)),
    putLtp: Number(((activeCheckerStock?.price || 100) * 0.018).toFixed(2)),
    callOI: 12.5,
    putOI: 10.2,
  };

  // Compute live option alerts & stock recommendations
  const optionAlerts = useMemo(() => {
    return generateOptionCallPutAlerts(stocks, overview);
  }, [stocks, overview]);

  const stockRecommendations = useMemo(() => {
    return generateAIStockRecommendations(stocks);
  }, [stocks]);

  // Major Index OI summary
  const indexSummary = useMemo(() => getMarketIndexOISummary(overview), [overview]);

  // Sector Performance Lookup Map
  const sectorMap = useMemo(() => getSectorPerformanceMap(stocks), [stocks]);

  // Filter Option Call / Put Alerts
  const filteredOptionAlerts = useMemo(() => {
    return optionAlerts.filter((alert) => {
      // Category filter (Index vs Stocks)
      if (categoryFilter === 'INDEX' && alert.sector !== 'INDEX') return false;
      if (categoryFilter === 'STOCKS' && alert.sector === 'INDEX') return false;

      // Option type filter
      if (optionTypeFilter === 'CE' && alert.optionType !== 'CE') return false;
      if (optionTypeFilter === 'PE' && alert.optionType !== 'PE') return false;

      // Accuracy filter
      if (accuracyFilter === '95_PLUS' && alert.accuracyScore < 95) return false;
      if (accuracyFilter === '90_PLUS' && alert.accuracyScore < 90) return false;

      // Buildup filter
      if (buildupFilter !== 'ALL' && alert.oiBuildup !== buildupFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          alert.symbol.toLowerCase().includes(q) ||
          alert.stockName.toLowerCase().includes(q) ||
          alert.sector.toLowerCase().includes(q) ||
          `${alert.strike} ${alert.optionType}`.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [optionAlerts, categoryFilter, optionTypeFilter, accuracyFilter, buildupFilter, searchQuery]);

  // Filter Equity Stock Recommendations
  const filteredStockRecs = useMemo(() => {
    return stockRecommendations.filter((rec) => {
      if (buildupFilter !== 'ALL' && rec.oiBuildup !== buildupFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          rec.symbol.toLowerCase().includes(q) ||
          rec.name.toLowerCase().includes(q) ||
          rec.sector.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [stockRecommendations, buildupFilter, searchQuery]);

  // Filter stocks for full OI Table
  const filteredOiStocks = useMemo(() => {
    return stocks.filter((stock) => {
      if (buildupFilter !== 'ALL' && stock.oiData?.buildup !== buildupFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          stock.symbol.toLowerCase().includes(q) ||
          stock.name.toLowerCase().includes(q) ||
          stock.sector.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [stocks, buildupFilter, searchQuery]);

  // Handle Option Trade Execution
  const handleExecuteOptionTrade = (alert: OptionAlertSignal) => {
    if (onCreateTrade) {
      onCreateTrade({
        symbol: `${alert.symbol} ${alert.strike} ${alert.optionType}`,
        stockName: `${alert.stockName} (${alert.optionType} Premium)`,
        type: 'BUY',
        entryPrice: alert.premiumLtp,
        stopLoss: alert.stopLoss,
        target1: alert.target1,
        target2: alert.target2,
      });
      setExecutedTradeIds((prev) => new Set(prev).add(alert.id));
    }
  };

  // Handle Equity Stock Trade Execution
  const handleExecuteStockTrade = (rec: AIStockRecommendation) => {
    if (onCreateTrade) {
      onCreateTrade({
        symbol: rec.symbol,
        stockName: rec.name,
        type: rec.action.includes('BUY') ? 'BUY' : 'SELL',
        entryPrice: rec.price,
        stopLoss: rec.stopLoss,
        target1: rec.target1,
        target2: rec.target2,
      });
      setExecutedTradeIds((prev) => new Set(prev).add(rec.id));
    }
  };

  // Trigger AI Refresh Simulation
  const handleRefreshAi = () => {
    setIsRefreshingAi(true);
    if (onRefreshScan) {
      onRefreshScan();
    }
    setTimeout(() => {
      setIsRefreshingAi(false);
    }, 700);
  };

  // Helper badge for buildup tag
  const getBuildupBadge = (buildup?: OIBuildupType) => {
    switch (buildup) {
      case 'LONG_BUILDUP':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-400" />
            Long Buildup
          </span>
        );
      case 'SHORT_BUILDUP':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-rose-500/15 text-rose-400 border border-rose-500/30 flex items-center gap-1">
            <TrendingDown className="w-3 h-3 text-rose-400" />
            Short Buildup
          </span>
        );
      case 'SHORT_COVERING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <ArrowUpRight className="w-3 h-3 text-amber-400" />
            Short Covering
          </span>
        );
      case 'LONG_UNWINDING':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 flex items-center gap-1">
            <ArrowDownRight className="w-3 h-3 text-indigo-400" />
            Long Unwinding
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-slate-500/15 text-slate-400 border border-slate-500/30">
            Neutral
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div
        className={`p-6 rounded-2xl border transition-all ${
          isDark
            ? 'bg-slate-900/90 border-slate-800 shadow-xl'
            : 'bg-white border-slate-200/80 shadow-md'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
                <Brain className="w-5 h-5 text-indigo-400" />
              </span>
              <h1 className="text-xl font-bold tracking-tight">
                FnO Option Call/Put & Live Market OI AI Engine
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 animate-pulse flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                90%-100% ACCURACY TARGET
              </span>
            </div>
            <p className="text-xs opacity-75 max-w-3xl">
              Real-time Option Call (CE) & Put (PE) Buy/Sell Alerts powered by Live Open Interest, % Change in OI, Strike-wise Call/Put Writing, VWAP, CPR, EMA Crossovers & Gemini AI Quant Analysis.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleRefreshAi}
              disabled={isRefreshingAi}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase transition-all flex items-center gap-2 shadow-md cursor-pointer ${
                isRefreshingAi ? 'opacity-50' : 'hover:scale-105'
              } ${
                isDark
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingAi ? 'animate-spin' : ''}`} />
              <span>{isRefreshingAi ? 'Analyzing Feed...' : 'Re-Analyze Market'}</span>
            </button>
          </div>
        </div>

        {/* Major Index OI Snapshot Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 mt-6 pt-5 border-t border-slate-800/60">
          {indexSummary.map((idx) => {
            const isUp = idx.change >= 0;
            return (
              <div
                key={idx.index}
                className={`p-3.5 rounded-xl border transition-all ${
                  isDark
                    ? 'bg-slate-800/50 border-slate-700/60'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs">{idx.index}</span>
                    <span
                      className={`text-[10px] font-bold font-mono ${
                        isUp ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isUp ? '+' : ''}
                      {idx.changePercent}%
                    </span>
                  </div>
                  {getBuildupBadge(idx.buildup)}
                </div>

                <div className="flex items-baseline justify-between font-mono mb-2">
                  <span className="text-base font-extrabold">
                    ₹{idx.price.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[11px] opacity-75">
                    PCR:{' '}
                    <strong className={idx.pcr >= 1.0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {idx.pcr}
                    </strong>
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono opacity-80 pt-1 border-t border-slate-700/30 mb-2">
                  <div>
                    <span className="block opacity-60">Total OI:</span>
                    <span className="font-semibold">{idx.totalOI}</span>
                  </div>
                  <div>
                    <span className="block opacity-60">Chg in OI:</span>
                    <span className="font-semibold text-emerald-400">{idx.changeOI}</span>
                  </div>
                </div>

                {/* Index FnO Option Recommendation Badge */}
                <button
                  type="button"
                  onClick={() => {
                    setActiveSubTab('options');
                    setCategoryFilter('INDEX');
                  }}
                  className={`w-full py-1.5 px-2 rounded-lg text-[10px] font-bold font-mono uppercase transition-all flex items-center justify-between cursor-pointer border ${
                    idx.buildup === 'SHORT_BUILDUP' || idx.change < 0
                      ? 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                  }`}
                >
                  <span className="flex items-center gap-1">
                    <Zap className="w-3 h-3 text-amber-300 animate-pulse" />
                    <span>
                      {idx.buildup === 'SHORT_BUILDUP' || idx.change < 0
                        ? `BUY ${idx.atmStrike} PE`
                        : `BUY ${idx.atmStrike} CE`}
                    </span>
                  </span>
                  <span className="px-1.5 py-0.2 rounded bg-black/40 text-amber-300 font-extrabold text-[9px]">
                    {idx.index.includes('NIFTY 50')
                      ? '97% Acc'
                      : idx.index.includes('BANK')
                      ? '95% Acc'
                      : '96% Acc'}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Stock & Option Price Checker Tool */}
      {activeCheckerStock && (
        <div className={`p-4 rounded-xl border font-mono transition-all ${
          isDark ? 'bg-slate-800/80 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900 shadow-sm'
        }`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-slate-700/40">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400 animate-pulse" />
              <div>
                <h3 className="text-sm font-extrabold uppercase tracking-tight flex items-center gap-2">
                  <span>Stock & Option Price Checker</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded font-bold border border-emerald-500/30">
                    LIVE QUOTES
                  </span>
                </h3>
                <p className="text-[11px] opacity-70">
                  Select any stock to check its spot price alongside call (CE) & put (PE) option premiums
                </p>
              </div>
            </div>

            {/* Stock Selector Dropdown */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold opacity-80 uppercase">Select Stock:</span>
              <select
                value={selectedStockSymbolForCheck}
                onChange={(e) => setSelectedStockSymbolForCheck(e.target.value)}
                className={`px-3 py-1.5 rounded-lg border font-bold text-xs focus:outline-none transition-all ${
                  isDark ? 'bg-slate-900 border-slate-600 text-emerald-400' : 'bg-slate-100 border-slate-300 text-indigo-700'
                }`}
              >
                {stocks.map((st) => (
                  <option key={st.symbol} value={st.symbol}>
                    {st.symbol} — ₹{st.price.toLocaleString('en-IN')} ({st.changePercent >= 0 ? '+' : ''}{st.changePercent}%)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
            {/* Spot Stock Price */}
            <div className={`p-3 rounded-lg border ${
              isDark ? 'bg-slate-900/80 border-slate-700' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-extrabold text-indigo-300 uppercase">Current Price</span>
                <span className={`font-extrabold text-[10px] px-1.5 py-0.5 rounded ${
                  activeCheckerStock.signal === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                }`}>
                  {activeCheckerStock.signal}
                </span>
              </div>
              <div className="text-xl font-black text-indigo-400">
                ₹{activeCheckerStock.price.toLocaleString('en-IN')}
              </div>
              <div className="text-xs flex items-center justify-between mt-1">
                <span className={activeCheckerStock.changePercent >= 0 ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {activeCheckerStock.changePercent >= 0 ? '+' : ''}{activeCheckerStock.changePercent}%
                </span>
                <span className="text-indigo-400 font-mono text-[10px]">
                  Alerts Time: {getMarketHoursAlertTime(activeCheckerStock.alertCreateTime || activeCheckerStock.lastUpdated)}
                </span>
              </div>
            </div>

            {/* ATM Call Option (CE) Price */}
            <div className={`p-3 rounded-lg border ${
              isDark ? 'bg-slate-900/80 border-slate-700' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-emerald-400 uppercase">
                  AI Alerts Price (CE @ ₹{activeCheckerAtmStrike})
                </span>
                <span className="text-[10px] opacity-60">IV: {(activeCheckerAtmOption as any).callIv || 18.5}%</span>
              </div>
              <div className="text-xl font-black text-emerald-400">
                ₹{activeCheckerAtmOption.callLtp}
              </div>
              <div className="text-[11px] flex items-center justify-between mt-1 font-semibold">
                <span className="text-emerald-400">Target 1: ₹{(activeCheckerAtmOption.callLtp * 1.35).toFixed(1)}</span>
                <span className="text-rose-400">SL: ₹{(activeCheckerAtmOption.callLtp * 0.75).toFixed(1)}</span>
              </div>
            </div>

            {/* ATM Put Option (PE) Price */}
            <div className={`p-3 rounded-lg border ${
              isDark ? 'bg-slate-900/80 border-slate-700' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-rose-400 uppercase">
                  AI Alerts Price (PE @ ₹{activeCheckerAtmStrike})
                </span>
                <span className="text-[10px] opacity-60">IV: {(activeCheckerAtmOption as any).putIv || 19.2}%</span>
              </div>
              <div className="text-xl font-black text-rose-400">
                ₹{activeCheckerAtmOption.putLtp}
              </div>
              <div className="text-[11px] flex items-center justify-between mt-1 font-semibold">
                <span className="text-emerald-400">Target 1: ₹{(activeCheckerAtmOption.putLtp * 1.35).toFixed(1)}</span>
                <span className="text-rose-400">SL: ₹{(activeCheckerAtmOption.putLtp * 0.75).toFixed(1)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mt-3 text-xs pt-2 border-t border-slate-700/30">
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <span className="px-2 py-0.5 rounded font-black font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30" title="Live Market AI Score Rating">
                🎯 AI Score: {activeCheckerStock.aiScore || 92}/100
              </span>
              <span className={`px-2 py-0.5 rounded font-bold font-mono border ${(activeCheckerStock.indicators?.rsi ?? 58.5) >= 55 ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : (activeCheckerStock.indicators?.rsi ?? 58.5) <= 45 ? 'bg-rose-500/15 text-rose-300 border-rose-500/30' : 'bg-amber-500/15 text-amber-300 border-amber-500/30'}`} title="14-Period Relative Strength Index">
                RSI: {activeCheckerStock.indicators?.rsi ?? 58.5}
              </span>
              <span className={`px-2 py-0.5 rounded font-bold font-mono border ${activeCheckerStock.price >= (activeCheckerStock.indicators?.vwap ?? activeCheckerStock.price) ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-rose-500/15 text-rose-300 border-rose-500/30'}`} title="Volume Weighted Average Price Status">
                VWAP: ₹{(activeCheckerStock.indicators?.vwap ?? activeCheckerStock.price).toLocaleString('en-IN')} ({activeCheckerStock.price >= (activeCheckerStock.indicators?.vwap ?? activeCheckerStock.price) ? 'Above VWAP ▲' : 'Below VWAP ▼'})
              </span>
              <span className="opacity-70 text-[11px] font-mono">
                PCR: <strong>{activeCheckerStock.oiData?.pcr || '1.0'}</strong> | OI: <strong>{activeCheckerStock.oiData?.openInterest || '15'} L</strong> | Max Pain: <strong>₹{activeCheckerStock.oiData?.maxPainStrike || activeCheckerAtmStrike}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                if (onSelectStock) onSelectStock(activeCheckerStock);
                else setSelectedStrikeStock(activeCheckerStock);
              }}
              className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer text-xs"
            >
              <span>Inspect {activeCheckerStock.symbol} Option Chain</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Navigation Sub-Tabs */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center p-1 rounded-xl bg-slate-800/40 border border-slate-700/50">
          <button
            onClick={() => setActiveSubTab('options')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'options'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>FnO Call/Put Option Alerts ({filteredOptionAlerts.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('equityRecs')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'equityRecs'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Stock AI Recs ({filteredStockRecs.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('oiTable')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeSubTab === 'oiTable'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <LineChart className="w-3.5 h-3.5" />
            <span>Live Stock OI Table ({filteredOiStocks.length})</span>
          </button>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {activeSubTab === 'options' && (
            <>
              {/* Category Filter (Index Options vs Stock Options) */}
              <div className="flex items-center p-0.5 rounded-lg bg-slate-800/40 border border-slate-700/50 text-[11px] font-mono">
                <button
                  onClick={() => setCategoryFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    categoryFilter === 'ALL'
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  ALL ASSETS
                </button>
                <button
                  onClick={() => setCategoryFilter('INDEX')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    categoryFilter === 'INDEX'
                      ? 'bg-amber-600 text-white font-bold'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  🏛️ INDEX OPTIONS
                </button>
                <button
                  onClick={() => setCategoryFilter('STOCKS')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    categoryFilter === 'STOCKS'
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  📈 STOCK FnO
                </button>
              </div>

              {/* Option Type Filter */}
              <div className="flex items-center p-0.5 rounded-lg bg-slate-800/40 border border-slate-700/50 text-[11px] font-mono">
                <button
                  onClick={() => setOptionTypeFilter('ALL')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    optionTypeFilter === 'ALL'
                      ? 'bg-indigo-600 text-white font-bold'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  ALL
                </button>
                <button
                  onClick={() => setOptionTypeFilter('CE')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    optionTypeFilter === 'CE'
                      ? 'bg-emerald-600 text-white font-bold'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  CALL (CE)
                </button>
                <button
                  onClick={() => setOptionTypeFilter('PE')}
                  className={`px-2.5 py-1 rounded-md transition-all ${
                    optionTypeFilter === 'PE'
                      ? 'bg-rose-600 text-white font-bold'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  PUT (PE)
                </button>
              </div>

              {/* Accuracy Tier Filter */}
              <select
                value={accuracyFilter}
                onChange={(e: any) => setAccuracyFilter(e.target.value)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                  isDark
                    ? 'bg-slate-800 border-slate-700 text-slate-200'
                    : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                <option value="ALL">All Accuracy Levels (90%+)</option>
                <option value="95_PLUS">95%+ High Accuracy</option>
                <option value="90_PLUS">90%+ Standard Accuracy</option>
              </select>
            </>
          )}

          {/* Buildup Filter */}
          <select
            value={buildupFilter}
            onChange={(e) => setBuildupFilter(e.target.value)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
              isDark
                ? 'bg-slate-800 border-slate-700 text-slate-200'
                : 'bg-white border-slate-300 text-slate-800'
            }`}
          >
            <option value="ALL">All OI Buildups</option>
            <option value="LONG_BUILDUP">Long Buildup</option>
            <option value="SHORT_BUILDUP">Short Buildup</option>
            <option value="SHORT_COVERING">Short Covering</option>
            <option value="LONG_UNWINDING">Long Unwinding</option>
          </select>

          {/* Search Input */}
          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <input
              type="text"
              placeholder="Search symbol, strike..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs transition-all ${
                isDark
                  ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              }`}
            />
          </div>
        </div>
      </div>

      {/* SUB TAB 1: FNO OPTION CALL / PUT ALERTS */}
      {activeSubTab === 'options' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredOptionAlerts.length === 0 ? (
            <div className="col-span-full py-12 text-center opacity-50 font-mono">
              No FnO Call/Put option alerts match your filter criteria. Try clearing search filters.
            </div>
          ) : (
            filteredOptionAlerts.map((alert) => {
              const isCall = alert.optionType === 'CE';
              const isExecuted = executedTradeIds.has(alert.id);

              return (
                <div
                  key={alert.id}
                  className={`p-5 rounded-2xl border transition-all relative flex flex-col justify-between group hover:scale-[1.01] ${
                    isDark
                      ? isCall
                        ? 'bg-gradient-to-b from-slate-900 via-slate-900/90 to-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/60 shadow-lg shadow-emerald-950/20'
                        : 'bg-gradient-to-b from-slate-900 via-slate-900/90 to-rose-950/20 border-rose-500/30 hover:border-rose-500/60 shadow-lg shadow-rose-950/20'
                      : isCall
                      ? 'bg-white border-emerald-300 hover:border-emerald-500 shadow-md'
                      : 'bg-white border-rose-300 hover:border-rose-500 shadow-md'
                  }`}
                >
                  <div>
                    {/* Top Header: Strike, Option Tag, Market Open Hours Alert Time & Accuracy Badge */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded font-black font-mono text-xs ${
                              isCall
                                ? 'bg-emerald-500 text-slate-950'
                                : 'bg-rose-500 text-white'
                            }`}
                          >
                            {alert.optionType}
                          </span>
                          <h3 className="font-extrabold text-base tracking-tight font-mono">
                            {alert.symbol} ₹{alert.strike} {alert.optionType}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap font-mono">
                          <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20" title="Alerts time created strictly within market open hours (09:15 AM - 03:30 PM IST)">
                            <Clock className="w-3 h-3 text-indigo-400" />
                            <span>Alerts Time: {getMarketHoursAlertTime(alert.generatedAt)}</span>
                          </span>

                          {/* Institutional Entry Buying / Selling Badge */}
                          {(() => {
                            const matchedStock = stocks.find((s) => s.symbol === alert.symbol);
                            const inst = matchedStock
                              ? getInstitutionalEntryAction(matchedStock)
                              : {
                                  type: isCall ? ('BUYING' as const) : ('SELLING' as const),
                                  label: isCall ? ('INSTITUTIONAL BUYING' as const) : ('INSTITUTIONAL SELLING' as const),
                                  badgeBg: isCall ? 'bg-emerald-500/15' : 'bg-rose-500/15',
                                  badgeText: isCall ? 'text-emerald-400' : 'text-rose-400',
                                  badgeBorder: isCall ? 'border-emerald-500/30' : 'border-rose-500/30',
                                  description: 'Institutional Entry Block Accumulation',
                                  qtyLabel: '75k+ Qty Buy',
                                };
                            return (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${inst.badgeBg} ${inst.badgeText} ${inst.badgeBorder}`}
                                title={inst.description}
                              >
                                🏛️ {inst.label}
                              </span>
                            );
                          })()}

                          {/* OI Change: Put Writing or Call Writing Badge */}
                          {(() => {
                            const matchedStock = stocks.find((s) => s.symbol === alert.symbol);
                            const oiAction = matchedStock
                              ? getOiDetailedAction(matchedStock)
                              : {
                                  actionLabel: isCall ? ('PUT WRITING' as const) : ('CALL WRITING' as const),
                                  badgeBg: isCall ? 'bg-emerald-500/15' : 'bg-rose-500/15',
                                  badgeText: isCall ? 'text-emerald-400' : 'text-rose-400',
                                  badgeBorder: isCall ? 'border-emerald-500/30' : 'border-rose-500/30',
                                  changeInOIPercent: 12.8,
                                };
                            return (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold border ${oiAction.badgeBg} ${oiAction.badgeText} ${oiAction.badgeBorder}`}
                              >
                                {isCall ? '📈' : '📉'} {oiAction.actionLabel} ({alert.oiChangePercent >= 0 ? '+' : ''}{alert.oiChangePercent}% OI)
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-xs opacity-75 flex items-center gap-1.5 flex-wrap mt-1">
                          <span>{alert.stockName}</span>
                          {sectorMap.has(alert.sector) && (() => {
                            const sec = sectorMap.get(alert.sector)!;
                            const isSecPos = sec.avgChangePercent >= 0;
                            return (
                              <span
                                className={`px-1.5 py-0.2 rounded text-[8px] font-mono font-bold border ${
                                  isSecPos
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                }`}
                              >
                                {alert.sector} {isSecPos ? 'SECTOR POSITIVE (+)' : 'SECTOR NEGATIVE (-)'} {isSecPos ? '+' : ''}{sec.avgChangePercent}%
                              </span>
                            );
                          })()}
                        </p>
                      </div>

                      {/* Accuracy Score Pill */}
                      <div className="text-right">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm">
                          <ShieldCheck className="w-3 h-3 text-emerald-400" />
                          {alert.accuracyScore}% ACCURACY
                        </span>
                        <span className="block text-[10px] font-mono mt-1 opacity-70">
                          R:R {alert.riskRewardRatio}
                        </span>
                      </div>
                    </div>

                    {/* Full Price Details: Current Price vs AI Alerts Price & Entry Zone */}
                    <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 font-mono my-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2 pb-2 border-b border-slate-700/40">
                        <div>
                          <span className="block text-[10px] opacity-60 font-bold uppercase text-indigo-300">Current Spot Price</span>
                          <span className="text-base font-extrabold text-indigo-300">
                            ₹{alert.spotPrice.toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="block text-[10px] opacity-60 font-bold uppercase text-emerald-400">AI Alerts Price</span>
                          <span className="text-base font-extrabold text-emerald-400">
                            ₹{alert.premiumLtp}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="opacity-70 text-[10px]">Option Entry Range:</span>
                        <span className="font-bold text-amber-300">
                          ₹{alert.entryRange[0]} - ₹{alert.entryRange[1]}
                        </span>
                      </div>

                      {/* Targets & Stop Loss Price Details */}
                      <div className="grid grid-cols-3 gap-1.5 text-[10px] pt-2 border-t border-slate-700/40 text-center">
                        <div className="p-1.5 rounded bg-rose-500/10 border border-rose-500/20 text-rose-300">
                          <span className="block opacity-60">SL Price</span>
                          <strong className="font-mono">₹{alert.stopLoss}</strong>
                        </div>
                        <div className="p-1.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                          <span className="block opacity-60">Target 1</span>
                          <strong className="font-mono">₹{alert.target1}</strong>
                        </div>
                        <div className="p-1.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-200">
                          <span className="block opacity-60">Target 2</span>
                          <strong className="font-mono">₹{alert.target2}</strong>
                        </div>
                      </div>
                    </div>

                    {/* AI Indicators & Technical Chart Triggers (AI Score, RSI, VWAP) */}
                    {(() => {
                      const matchedStock = stocks.find((s) => s.symbol === alert.symbol);
                      const aiScore = alert.accuracyScore || matchedStock?.aiScore || 92;
                      const rsiVal = matchedStock?.indicators?.rsi ?? (isCall ? 62.5 : 38.0);
                      const vwapVal = matchedStock?.indicators?.vwap ?? alert.spotPrice;
                      const isAboveVwap = alert.spotPrice >= vwapVal;

                      return (
                        <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 text-xs mb-3 space-y-2">
                          {/* AI Score, RSI, VWAP Metrics Grid */}
                          <div className="grid grid-cols-3 gap-1.5 text-center font-mono">
                            <div className="p-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30">
                              <span className="block text-[9px] opacity-70 uppercase font-sans">AI Score</span>
                              <strong className="text-indigo-300 text-xs font-black">🎯 {aiScore}%</strong>
                            </div>

                            <div className="p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30">
                              <span className="block text-[9px] opacity-70 uppercase font-sans">RSI (14)</span>
                              <strong className={`text-xs font-bold ${rsiVal >= 55 ? 'text-emerald-400' : rsiVal <= 45 ? 'text-rose-400' : 'text-amber-300'}`}>
                                {rsiVal}
                              </strong>
                            </div>

                            <div className="p-1.5 rounded-lg bg-blue-500/15 border border-blue-500/30">
                              <span className="block text-[9px] opacity-70 uppercase font-sans">VWAP</span>
                              <strong className="text-blue-300 text-xs font-bold block">₹{vwapVal.toLocaleString('en-IN')}</strong>
                              <span className={`block text-[9px] font-extrabold ${isAboveVwap ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isAboveVwap ? 'Above VWAP ▲' : 'Below VWAP ▼'}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1 pt-1 text-[10px] font-mono border-t border-slate-700/30">
                            <div className="flex items-center justify-between">
                              <span className="opacity-60">VWAP Alignment:</span>
                              <span className={`font-bold ${isAboveVwap ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isAboveVwap ? 'Above VWAP (Bullish ▲)' : 'Below VWAP (Bearish ▼)'}
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="opacity-60">EMA Trend:</span>
                              <span className="font-bold text-amber-300">
                                {alert.chartTechnicalTriggers.emaTrend.replace('_', ' ')}
                              </span>
                            </div>

                            <div className="text-[10px] opacity-90 pt-1 text-emerald-300 font-sans">
                              ⚡ {alert.chartTechnicalTriggers.breakoutSignal}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Option Greeks Bar */}
                    <div className="grid grid-cols-4 gap-1 p-2 rounded-lg bg-slate-800/20 border border-slate-700/30 text-[9px] font-mono opacity-80 text-center mb-4">
                      <div>
                        <span className="block opacity-50">Delta</span>
                        <strong className="text-white">{alert.greeks.delta}</strong>
                      </div>
                      <div>
                        <span className="block opacity-50">Gamma</span>
                        <strong className="text-white">{alert.greeks.gamma}</strong>
                      </div>
                      <div>
                        <span className="block opacity-50">Theta</span>
                        <strong className="text-rose-400">{alert.greeks.theta}</strong>
                      </div>
                      <div>
                        <span className="block opacity-50">IV %</span>
                        <strong className="text-amber-300">{alert.greeks.iv}%</strong>
                      </div>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="pt-3 border-t border-slate-800/50 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setInspectingOptionAlert(alert)}
                      className="text-[10px] font-bold font-mono text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <Layers className="w-3 h-3" />
                      <span>Full AI Analysis</span>
                    </button>

                    <button
                      onClick={() => handleExecuteOptionTrade(alert)}
                      disabled={isExecuted}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold uppercase font-mono transition-all flex items-center gap-1.5 cursor-pointer shadow-md ${
                        isExecuted
                          ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                          : isCall
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 hover:scale-105'
                          : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 hover:scale-105'
                      }`}
                    >
                      {isExecuted ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Trade Active</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5" />
                          <span>Buy {alert.optionType} Option</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SUB TAB 2: EQUITY STOCK RECOMMENDATIONS */}
      {activeSubTab === 'equityRecs' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredStockRecs.length === 0 ? (
            <div className="col-span-full py-12 text-center opacity-50 font-mono">
              No stock recommendations match your filter criteria. Try clearing search filters.
            </div>
          ) : (
            filteredStockRecs.map((rec) => {
              const isBuy = rec.action.includes('BUY');
              const isExecuted = executedTradeIds.has(rec.id);

              return (
                <div
                  key={rec.id}
                  className={`p-5 rounded-2xl border transition-all relative flex flex-col justify-between group hover:scale-[1.01] ${
                    isDark
                      ? isBuy
                        ? 'bg-gradient-to-b from-slate-900 via-slate-900/90 to-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/60 shadow-lg shadow-emerald-950/20'
                        : 'bg-gradient-to-b from-slate-900 via-slate-900/90 to-rose-950/20 border-rose-500/30 hover:border-rose-500/60 shadow-lg shadow-rose-950/20'
                      : isBuy
                      ? 'bg-white border-emerald-300 hover:border-emerald-500 shadow-md'
                      : 'bg-white border-rose-300 hover:border-rose-500 shadow-md'
                  }`}
                >
                  <div>
                    {/* Top Row: Symbol & Action */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h3 className="font-extrabold text-base tracking-tight font-mono">
                            {rec.symbol}
                          </h3>
                          <span className="text-[10px] font-mono font-bold opacity-70 uppercase">
                            {rec.sector}
                          </span>
                          {sectorMap.has(rec.sector) && (() => {
                            const sec = sectorMap.get(rec.sector)!;
                            const isSecPos = sec.avgChangePercent >= 0;
                            return (
                              <span
                                className={`px-1.5 py-0.2 rounded text-[8px] font-mono font-bold border ${
                                  isSecPos
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                }`}
                              >
                                {isSecPos ? 'SECTOR POSITIVE (+)' : 'SECTOR NEGATIVE (-)'} {isSecPos ? '+' : ''}{sec.avgChangePercent}%
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-xs opacity-75 truncate max-w-[200px]">
                          {rec.name}
                        </p>
                      </div>

                      <div className="text-right">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg text-xs font-black uppercase font-mono tracking-wide shadow-sm ${
                            isBuy
                              ? 'bg-emerald-500 text-slate-950 shadow-emerald-500/30'
                              : 'bg-rose-500 text-white shadow-rose-500/30'
                          }`}
                        >
                          {rec.action}
                        </span>
                        <span className="block text-[10px] font-mono mt-1 opacity-80">
                          Confidence: <strong className="text-indigo-400">{rec.confidence}%</strong>
                        </span>
                      </div>
                    </div>

                    {/* Price & OI Status Bar with Current Price & AI Alerts Price */}
                    <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 font-mono my-3 space-y-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="flex items-center gap-1 text-[11px] font-mono font-bold text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20" title="Alerts time created strictly within market open hours (09:15 AM - 03:30 PM IST)">
                          <Clock className="w-3 h-3 text-indigo-400" />
                          <span>Alerts Time: {getMarketHoursAlertTime(rec.generatedAt)}</span>
                        </span>

                        {/* Institutional Entry Badge */}
                        {(() => {
                          const matchedStock = stocks.find((s) => s.symbol === rec.symbol);
                          const inst = matchedStock
                            ? getInstitutionalEntryAction(matchedStock)
                            : {
                                type: isBuy ? ('BUYING' as const) : ('SELLING' as const),
                                label: isBuy ? ('INSTITUTIONAL BUYING' as const) : ('INSTITUTIONAL SELLING' as const),
                                badgeBg: isBuy ? 'bg-emerald-500/15' : 'bg-rose-500/15',
                                badgeText: isBuy ? 'text-emerald-400' : 'text-rose-400',
                                badgeBorder: isBuy ? 'border-emerald-500/30' : 'border-rose-500/30',
                                description: 'Institutional Entry Block Accumulation',
                                qtyLabel: '75k+ Qty Buy',
                              };
                          return (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${inst.badgeBg} ${inst.badgeText} ${inst.badgeBorder}`}
                              title={inst.description}
                            >
                              🏛️ {inst.label}
                            </span>
                          );
                        })()}

                        {/* OI Change: Put Writing or Call Writing */}
                        {(() => {
                          const matchedStock = stocks.find((s) => s.symbol === rec.symbol);
                          const oiAction = matchedStock
                            ? getOiDetailedAction(matchedStock)
                            : {
                                actionLabel: isBuy ? ('PUT WRITING' as const) : ('CALL WRITING' as const),
                                badgeBg: isBuy ? 'bg-emerald-500/15' : 'bg-rose-500/15',
                                badgeText: isBuy ? 'text-emerald-400' : 'text-rose-400',
                                badgeBorder: isBuy ? 'border-emerald-500/30' : 'border-rose-500/30',
                                changeInOIPercent: 14.2,
                              };
                          return (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold border ${oiAction.badgeBg} ${oiAction.badgeText} ${oiAction.badgeBorder}`}
                            >
                              {isBuy ? '📈' : '📉'} {oiAction.actionLabel} ({oiAction.changeInOIPercent >= 0 ? '+' : ''}{oiAction.changeInOIPercent}% OI)
                            </span>
                          );
                        })()}
                      </div>

                      <div className="grid grid-cols-2 gap-2 pb-2 border-b border-slate-700/40">
                        <div>
                          <span className="block text-[10px] opacity-60 font-bold uppercase text-indigo-300">Current Price</span>
                          <span className="text-base font-extrabold text-indigo-300">₹{rec.price.toLocaleString('en-IN')}</span>
                        </div>
                        <div className="text-right">
                          <span className="block text-[10px] opacity-60 font-bold uppercase text-emerald-400">AI Alerts Price</span>
                          <span className="text-base font-extrabold text-emerald-400">₹{((rec.entryRange[0] + rec.entryRange[1]) / 2).toFixed(1)}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-0.5">
                        <span className="block text-[10px] opacity-60">OI Chg Today:</span>
                        <span className={`text-xs font-bold ${rec.oiChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {rec.oiChangePercent >= 0 ? '+' : ''}{rec.oiChangePercent}%
                        </span>
                      </div>

                      {/* AI Score, RSI, VWAP Details Metrics Grid */}
                      {(() => {
                        const matchedStock = stocks.find((s) => s.symbol === rec.symbol);
                        const aiScore = rec.confidence || matchedStock?.aiScore || 90;
                        const rsiVal = matchedStock?.indicators?.rsi ?? (isBuy ? 63.8 : 37.2);
                        const vwapVal = matchedStock?.indicators?.vwap ?? rec.price;

                        return (
                          <div className="grid grid-cols-3 gap-1.5 pt-2 border-t border-slate-700/40 text-center font-mono">
                            <div className="p-1 rounded bg-indigo-500/15 border border-indigo-500/25">
                              <span className="block text-[8px] opacity-70 uppercase font-sans">AI Score</span>
                              <strong className="text-indigo-300 text-[11px] font-black">🎯 {aiScore}%</strong>
                            </div>

                            <div className="p-1 rounded bg-amber-500/15 border border-amber-500/25">
                              <span className="block text-[8px] opacity-70 uppercase font-sans">RSI</span>
                              <strong className={`text-[11px] font-bold ${rsiVal >= 55 ? 'text-emerald-400' : rsiVal <= 45 ? 'text-rose-400' : 'text-amber-300'}`}>
                                {rsiVal}
                              </strong>
                            </div>

                            <div className="p-1 rounded bg-blue-500/15 border border-blue-500/25">
                              <span className="block text-[8px] opacity-70 uppercase font-sans">VWAP</span>
                              <strong className="text-blue-300 text-[10px] font-bold block">₹{vwapVal.toLocaleString('en-IN')}</strong>
                              <span className={`block text-[8px] font-bold ${rec.price >= vwapVal ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {rec.price >= vwapVal ? 'Above VWAP ▲' : 'Below VWAP ▼'}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Trade Levels Grid / Price Details */}
                    <div className="grid grid-cols-3 gap-2 text-[10px] font-mono mb-3">
                      <div className="p-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
                        <span className="block opacity-60">Entry Zone</span>
                        <span className="font-bold text-amber-300">
                          ₹{rec.entryRange[0]} - ₹{rec.entryRange[1]}
                        </span>
                      </div>

                      <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300">
                        <span className="block opacity-60">Stop Loss</span>
                        <span className="font-bold">₹{rec.stopLoss}</span>
                      </div>

                      <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                        <span className="block opacity-60">Target 1</span>
                        <span className="font-bold">₹{rec.target1}</span>
                      </div>
                    </div>

                    {/* AI Reasoning Rationale */}
                    <div className="p-3 rounded-xl bg-slate-800/20 border border-slate-700/30 text-xs mb-4">
                      <div className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-400 uppercase font-mono mb-1">
                        <Sparkles className="w-3 h-3 text-indigo-400" />
                        AI Quant Rationale
                      </div>
                      <p className="opacity-80 leading-relaxed text-[11px]">
                        {rec.aiReasoning}
                      </p>
                    </div>
                  </div>

                  {/* Execute Button */}
                  <div className="pt-3 border-t border-slate-800/50 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono opacity-50 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {rec.timeframe}
                    </span>

                    <button
                      onClick={() => handleExecuteStockTrade(rec)}
                      disabled={isExecuted}
                      className={`px-4 py-2 rounded-xl text-xs font-extrabold uppercase font-mono transition-all flex items-center gap-1.5 cursor-pointer shadow-md ${
                        isExecuted
                          ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                          : isBuy
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30 hover:scale-105'
                          : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30 hover:scale-105'
                      }`}
                    >
                      {isExecuted ? (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Trade Executed</span>
                        </>
                      ) : (
                        <>
                          <Zap className="w-3.5 h-3.5" />
                          <span>Execute {rec.action.split(' ')[0]}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SUB TAB 3: LIVE STOCK OI TABLE */}
      {activeSubTab === 'oiTable' && (
        <div
          className={`p-6 rounded-2xl border transition-colors ${
            isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <ScrollContainer isDark={isDark} scrollAmount={300}>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr
                  className={`border-b font-mono uppercase text-[10px] ${
                    isDark
                      ? 'border-slate-800 text-slate-400 bg-slate-800/40'
                      : 'border-slate-200 text-slate-500 bg-slate-100/60'
                  }`}
                >
                  <th className="py-3 px-3.5">Stock</th>
                  <th className="py-3 px-3.5">Institutional Entry</th>
                  <th className="py-3 px-3.5">Alerts Time</th>
                  <th className="py-3 px-3.5 text-indigo-300 font-extrabold">Current Price</th>
                  <th className="py-3 px-3.5 text-emerald-400 font-extrabold">AI Alerts Price</th>
                  <th className="py-3 px-3.5 text-indigo-400 font-black">AI Score</th>
                  <th className="py-3 px-3.5 text-amber-300 font-extrabold">RSI (14)</th>
                  <th className="py-3 px-3.5 text-blue-300 font-extrabold">VWAP</th>
                  <th className="py-3 px-3.5">Price Chg %</th>
                  <th className="py-3 px-3.5 text-blue-400">60m Trend</th>
                  <th className="py-3 px-3.5">Total OI (Lakhs)</th>
                  <th className="py-3 px-3.5">Chg in OI</th>
                  <th className="py-3 px-3.5">OI Chg %</th>
                  <th className="py-3 px-3.5">PCR</th>
                  <th className="py-3 px-3.5">OI Action & Buildup</th>
                  <th className="py-3 px-3.5">ATM Strike</th>
                  <th className="py-3 px-3.5">Max Pain</th>
                  <th className="py-3 px-3.5 text-right">Option Chain</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 font-mono">
                {filteredOiStocks.map((stock) => {
                  const oi = stock.oiData;
                  if (!oi) return null;
                  const isUp = stock.changePercent >= 0;
                  const instInfo = getInstitutionalEntryAction(stock);
                  const oiDetailed = getOiDetailedAction(stock);

                  return (
                    <tr
                      key={stock.symbol}
                      className={`transition-colors ${
                        isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3 px-3.5">
                        <div className="font-bold font-mono text-sm">{stock.symbol}</div>
                        <div className="text-[10px] opacity-70 truncate max-w-[150px]">
                          {stock.name}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                          <span className="text-[9px] font-bold opacity-70 uppercase">
                            {stock.sector}
                          </span>
                          {sectorMap.has(stock.sector) && (() => {
                            const sec = sectorMap.get(stock.sector)!;
                            const isSecPos = sec.avgChangePercent >= 0;
                            return (
                              <span
                                className={`px-1 py-0.2 rounded text-[8px] font-mono font-bold border ${
                                  isSecPos
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                }`}
                              >
                                {isSecPos ? 'SECTOR (+)' : 'SECTOR (-)'} {isSecPos ? '+' : ''}{sec.avgChangePercent}%
                              </span>
                            );
                          })()}
                        </div>
                      </td>

                      {/* Institutional Entry Column */}
                      <td className="py-3 px-3.5">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded border uppercase inline-block whitespace-nowrap ${instInfo.badgeBg} ${instInfo.badgeText} ${instInfo.badgeBorder}`}
                          title={instInfo.description}
                        >
                          🏛️ {instInfo.label}
                        </span>
                      </td>

                      {/* Market Open Hours Restricted Alert Time */}
                      <td className="py-3 px-3.5 font-mono text-[11px] whitespace-nowrap">
                        <div className="flex items-center gap-1 text-indigo-400 font-bold" title="Alert creation time restricted to market open hours (09:15 AM - 03:30 PM IST)">
                          <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                          <span>{getMarketHoursAlertTime(stock.alertCreateTime || stock.lastUpdated)}</span>
                        </div>
                      </td>

                      {/* Current Price */}
                      <td className="py-3 px-3.5 font-extrabold text-indigo-300">
                        ₹{stock.price.toLocaleString('en-IN')}
                      </td>

                      {/* AI Alerts Price */}
                      <td className="py-3 px-3.5 font-extrabold text-emerald-400">
                        ₹{(stock.risk?.entryPrice || stock.price).toLocaleString('en-IN')}
                      </td>

                      {/* AI Score */}
                      <td className="py-3 px-3.5 font-bold text-indigo-300 whitespace-nowrap">
                        🎯 {stock.aiScore || 88}%
                      </td>

                      {/* RSI */}
                      <td className={`py-3 px-3.5 font-bold whitespace-nowrap ${(stock.indicators?.rsi ?? 50) >= 55 ? 'text-emerald-400' : (stock.indicators?.rsi ?? 50) <= 45 ? 'text-rose-400' : 'text-amber-300'}`}>
                        {stock.indicators?.rsi ?? 50}
                      </td>

                      {/* VWAP */}
                      <td className="py-3 px-3.5 font-bold text-blue-300 whitespace-nowrap">
                        <div>₹{(stock.indicators?.vwap ?? stock.price).toLocaleString('en-IN')}</div>
                        <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded inline-block mt-0.5 ${stock.price >= (stock.indicators?.vwap ?? stock.price) ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'}`}>
                          {stock.price >= (stock.indicators?.vwap ?? stock.price) ? 'Above VWAP ▲' : 'Below VWAP ▼'}
                        </span>
                      </td>

                      {/* Price Chg % */}
                      <td
                        className={`py-3 px-3.5 font-bold ${
                          isUp ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isUp ? '+' : ''}
                        {stock.changePercent}%
                      </td>

                      {/* 60m Trend TV Chart Link */}
                      <td className="py-3 px-3.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(
                              `https://in.tradingview.com/chart/?symbol=NSE:${stock.symbol.replace('&', '_')}`,
                              '_blank'
                            );
                          }}
                          className="px-2 py-1 text-[10px] font-bold rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors flex items-center gap-1 whitespace-nowrap cursor-pointer"
                          title={`Click to open 60m TradingView Chart for ${stock.symbol}`}
                        >
                          <span>📈 60m Chart</span>
                          <span className="text-[8px]">↗</span>
                        </button>
                      </td>

                      <td className="py-3 px-3.5">{oi.openInterest} L</td>

                      <td
                        className={`py-3 px-3.5 font-bold ${
                          oi.changeInOI >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {oi.changeInOI >= 0 ? '+' : ''}
                        {oi.changeInOI} L
                      </td>

                      <td
                        className={`py-3 px-3.5 font-bold ${
                          oi.changeInOIPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {oi.changeInOIPercent >= 0 ? '+' : ''}
                        {oi.changeInOIPercent}%
                      </td>

                      <td
                        className={`py-3 px-3.5 font-bold ${
                          oi.pcr >= 1.0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {oi.pcr}
                      </td>

                      <td className="py-3 px-3.5 space-y-1">
                        <div>{getBuildupBadge(oi.buildup)}</div>
                        <div className="mt-1">
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-bold rounded border inline-block whitespace-nowrap ${oiDetailed.badgeBg} ${oiDetailed.badgeText} ${oiDetailed.badgeBorder}`}
                          >
                            {oiDetailed.actionLabel}
                          </span>
                        </div>
                      </td>


                      <td className="py-3 px-3.5 font-bold opacity-90">₹{oi.atmStrike}</td>

                      <td className="py-3 px-3.5 text-indigo-400 font-bold">
                        ₹{oi.maxPainStrike}
                      </td>

                      <td className="py-3 px-3.5 text-right">
                        <button
                          onClick={() => setSelectedStrikeStock(stock)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-bold transition-all cursor-pointer inline-flex items-center gap-1"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>Inspect Chain</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </ScrollContainer>
        </div>
      )}

      {/* OPTION ALERT DETAILED INSPECTION MODAL */}
      {inspectingOptionAlert && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className={`w-full max-w-2xl rounded-2xl border p-6 shadow-2xl space-y-5 ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-4 border-slate-700/60">
              <div className="flex items-center gap-2">
                <span
                  className={`px-2.5 py-1 rounded font-black font-mono text-sm ${
                    inspectingOptionAlert.optionType === 'CE'
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-rose-500 text-white'
                  }`}
                >
                  {inspectingOptionAlert.optionType}
                </span>
                <div>
                  <h2 className="text-lg font-bold font-mono">
                    {inspectingOptionAlert.symbol} ₹{inspectingOptionAlert.strike} {inspectingOptionAlert.optionType}
                  </h2>
                  <p className="text-xs opacity-70">
                    Expiry: {inspectingOptionAlert.expiry} • Spot LTP: ₹{inspectingOptionAlert.spotPrice.toLocaleString('en-IN')}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setInspectingOptionAlert(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
                <div>
                  <span className="font-extrabold text-sm text-emerald-300">
                    {inspectingOptionAlert.accuracyScore}% Confluence Accuracy Rating
                  </span>
                  <p className="text-[11px] opacity-80">
                    Options Flow, Put-Call Writing, VWAP & Chart Crossovers fully aligned
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <h4 className="font-bold text-indigo-400 font-mono uppercase text-[10px]">
                Full AI Quant Rationale & Confluence breakdown
              </h4>
              <p className="opacity-90 leading-relaxed p-3.5 rounded-xl bg-slate-800/40 border border-slate-700/40">
                {inspectingOptionAlert.aiAnalysisReasoning}
              </p>

              {/* AI Score, RSI, VWAP Technical Breakdown Grid */}
              {(() => {
                const matchedStock = stocks.find((s) => s.symbol === inspectingOptionAlert.symbol);
                const aiScore = inspectingOptionAlert.accuracyScore || matchedStock?.aiScore || 92;
                const rsiVal = matchedStock?.indicators?.rsi ?? (inspectingOptionAlert.optionType === 'CE' ? 62.5 : 38.0);
                const vwapVal = matchedStock?.indicators?.vwap ?? inspectingOptionAlert.spotPrice;

                return (
                  <div className="grid grid-cols-3 gap-3 p-3 rounded-xl bg-slate-800/40 border border-slate-700/50 text-center font-mono">
                    <div className="p-2 rounded-lg bg-indigo-500/15 border border-indigo-500/30">
                      <span className="block text-[10px] opacity-70 uppercase font-sans">AI Score</span>
                      <strong className="text-indigo-300 text-sm font-black">🎯 {aiScore}%</strong>
                    </div>

                    <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30">
                      <span className="block text-[10px] opacity-70 uppercase font-sans">RSI (14)</span>
                      <strong className={`text-sm font-bold ${rsiVal >= 55 ? 'text-emerald-400' : rsiVal <= 45 ? 'text-rose-400' : 'text-amber-300'}`}>
                        {rsiVal}
                      </strong>
                    </div>

                    <div className="p-2 rounded-lg bg-blue-500/15 border border-blue-500/30">
                      <span className="block text-[10px] opacity-70 uppercase font-sans">VWAP</span>
                      <strong className="text-blue-300 text-sm font-bold block">₹{vwapVal.toLocaleString('en-IN')}</strong>
                      <span className={`block text-[10px] font-bold ${inspectingOptionAlert.spotPrice >= vwapVal ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {inspectingOptionAlert.spotPrice >= vwapVal ? 'Above VWAP ▲' : 'Below VWAP ▼'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-3 rounded-xl bg-slate-800/30 border border-slate-700/30 font-mono">
                  <span className="block opacity-60 text-[10px] uppercase">OI Buildup</span>
                  <strong className="text-sm">{inspectingOptionAlert.oiBuildup.replace('_', ' ')}</strong>
                  <span className="block text-[11px] text-emerald-400 mt-1">
                    OI Change: +{inspectingOptionAlert.oiChangePercent}%
                  </span>
                </div>

                <div className="p-3 rounded-xl bg-slate-800/30 border border-slate-700/30 font-mono">
                  <span className="block opacity-60 text-[10px] uppercase">Put Call Ratio (PCR)</span>
                  <strong className="text-sm">{inspectingOptionAlert.pcr}</strong>
                  <span className="block text-[11px] text-indigo-300 mt-1">
                    Delta: {inspectingOptionAlert.greeks.delta} | Theta: {inspectingOptionAlert.greeks.theta}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-700/60 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  handleExecuteOptionTrade(inspectingOptionAlert);
                  setInspectingOptionAlert(null);
                }}
                className="px-5 py-2.5 rounded-xl text-xs font-extrabold uppercase font-mono bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg transition-all cursor-pointer flex items-center gap-1.5"
              >
                <Zap className="w-4 h-4" />
                <span>Execute Option Trade</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OPTION CHAIN INSPECTOR MODAL */}
      {selectedStrikeStock && selectedStrikeStock.oiData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div
            className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border p-6 shadow-2xl space-y-5 ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-4 border-slate-700/60">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-bold font-mono">
                    {selectedStrikeStock.symbol} Option Chain Analysis
                  </h2>
                  <span className="px-2.5 py-0.5 rounded text-[10px] font-bold font-mono uppercase bg-indigo-500/20 text-indigo-300">
                    LTP: ₹{selectedStrikeStock.price.toLocaleString('en-IN')}
                  </span>
                </div>
                <p className="text-xs opacity-75 mt-0.5">
                  PCR: {selectedStrikeStock.oiData.pcr} | Max Pain: ₹{selectedStrikeStock.oiData.maxPainStrike} | Total Call OI: {selectedStrikeStock.oiData.totalCallOI}L | Total Put OI: {selectedStrikeStock.oiData.totalPutOI}L
                </p>
              </div>

              <button
                onClick={() => setSelectedStrikeStock(null)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold transition-all cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Option Chain Table */}
            <ScrollContainer isDark={isDark} scrollAmount={250}>
              <div className="overflow-x-auto">
                <table className="w-full text-center text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-800/60 border-b border-slate-700 text-[10px] font-mono uppercase text-slate-400">
                    <th className="py-2.5 px-3 text-emerald-400">Call OI (L)</th>
                    <th className="py-2.5 px-3 text-emerald-400">Call Chg OI</th>
                    <th className="py-2.5 px-3 text-emerald-400">Call LTP</th>
                    <th className="py-2.5 px-3 bg-indigo-900/40 text-indigo-200 font-bold">
                      Strike Price
                    </th>
                    <th className="py-2.5 px-3 text-rose-400">Put LTP</th>
                    <th className="py-2.5 px-3 text-rose-400">Put Chg OI</th>
                    <th className="py-2.5 px-3 text-rose-400">Put OI (L)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {selectedStrikeStock.oiData.optionChain.map((item) => {
                    const isAtm = item.strike === selectedStrikeStock.oiData?.atmStrike;
                    return (
                      <tr
                        key={item.strike}
                        className={`transition-colors ${
                          isAtm
                            ? 'bg-indigo-600/20 font-bold border-y-2 border-indigo-500/50'
                            : 'hover:bg-slate-800/30'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-semibold text-emerald-400">
                          {item.callOI} L
                        </td>
                        <td className="py-2.5 px-3 text-[11px] opacity-80">
                          {item.callChangeOI >= 0 ? '+' : ''}
                          {item.callChangeOI}
                        </td>
                        <td className="py-2.5 px-3 font-bold">₹{item.callLtp}</td>
                        <td
                          className={`py-2.5 px-3 text-sm font-extrabold ${
                            isAtm ? 'text-indigo-300' : 'opacity-90'
                          }`}
                        >
                          ₹{item.strike} {isAtm && '(ATM)'}
                        </td>
                        <td className="py-2.5 px-3 font-bold">₹{item.putLtp}</td>
                        <td className="py-2.5 px-3 text-[11px] opacity-80">
                          {item.putChangeOI >= 0 ? '+' : ''}
                          {item.putChangeOI}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-rose-400">
                          {item.putOI} L
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </ScrollContainer>
          </div>
        </div>
      )}
    </div>
  );
};
