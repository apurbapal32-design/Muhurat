import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Zap,
  Target,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Search,
  Filter,
  ShieldCheck,
  BarChart3,
  BarChart2,
  Layers,
  ArrowRight,
  Info,
  ChevronDown,
  ChevronUp,
  Flame,
  Volume2,
  DollarSign,
  PieChart,
  Sliders,
  Play,
  RotateCcw,
  ExternalLink,
  X,
  Maximize2,
  Check,
  Award,
  Activity,
  CheckSquare,
} from 'lucide-react';
import { ScannedStock } from '../types';
import {
  processGapRelativeStrengthScan,
  GapRsStockData,
} from '../utils/gapRelativeStrengthEngine';

interface GapRelativeStrengthScannerViewProps {
  stocks: ScannedStock[];
  onSelectStock: (stock: ScannedStock) => void;
  onExecuteTrade?: (stock: ScannedStock, signal: 'BUY' | 'SELL') => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const GapRelativeStrengthScannerView: React.FC<GapRelativeStrengthScannerViewProps> = ({
  stocks,
  onSelectStock,
  onExecuteTrade,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';

  // Filters & State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [setupFilter, setSetupFilter] = useState<'ALL' | 'BUY_SETUPS' | 'SELL_SETUPS' | 'GAP_UP' | 'GAP_DOWN' | 'TOP_10_VOL_VAL' | 'SCORE_80_PLUS'>('ALL');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'SCORE' | 'RELATIVE_STRENGTH' | 'TRADED_VALUE' | 'GAP_PCT' | 'VOLUME_RANK'>('SCORE');
  const [showFormulaModal, setShowFormulaModal] = useState<boolean>(false);
  const [expandedSymbol, setExpandedSymbol] = useState<string | null>(null);
  const [activeChartStock, setActiveChartStock] = useState<GapRsStockData | null>(null);
  const [chartInterval, setChartInterval] = useState<'60' | '15' | '5' | 'D'>('60');
  const [executingSymbol, setExecutingSymbol] = useState<string | null>(null);

  // Process data with engine
  const processedData = useMemo(() => {
    return processGapRelativeStrengthScan(stocks);
  }, [stocks]);

  // Extract unique sectors
  const sectors = useMemo(() => {
    const list = Array.from(new Set(processedData.map((d) => d.sector || 'General'))).sort();
    return ['ALL', ...list];
  }, [processedData]);

  // Filter & Sort
  const filteredData = useMemo(() => {
    let result = processedData.filter((item) => {
      const matchSearch =
        item.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.sector.toLowerCase().includes(searchTerm.toLowerCase());

      const matchSector = selectedSector === 'ALL' || item.sector === selectedSector;

      if (!matchSearch || !matchSector) return false;

      if (setupFilter === 'BUY_SETUPS') {
        return item.isBuySetup || (item.totalScore >= 80 && item.stockChangePercent > 0);
      }
      if (setupFilter === 'SELL_SETUPS') {
        return item.isSellSetup || (item.totalScore >= 80 && item.stockChangePercent < 0);
      }
      if (setupFilter === 'GAP_UP') {
        return item.gapPct >= 2.0;
      }
      if (setupFilter === 'GAP_DOWN') {
        return item.gapPct <= -2.0;
      }
      if (setupFilter === 'TOP_10_VOL_VAL') {
        return item.volumeRank <= 10 || item.valueRank <= 10;
      }
      if (setupFilter === 'SCORE_80_PLUS') {
        return item.totalScore >= 80;
      }

      return true;
    });

    // Sorting logic
    result.sort((a, b) => {
      if (sortBy === 'SCORE') return b.totalScore - a.totalScore;
      if (sortBy === 'RELATIVE_STRENGTH') return Math.abs(b.relativeStrength) - Math.abs(a.relativeStrength);
      if (sortBy === 'TRADED_VALUE') return b.tradedValue - a.tradedValue;
      if (sortBy === 'GAP_PCT') return Math.abs(b.gapPct) - Math.abs(a.gapPct);
      if (sortBy === 'VOLUME_RANK') return a.volumeRank - b.volumeRank;
      return 0;
    });

    return result;
  }, [processedData, searchTerm, setupFilter, selectedSector, sortBy]);

  // KPI calculations
  const buySetupsCount = processedData.filter((d) => d.isBuySetup || (d.totalScore >= 80 && d.stockChangePercent > 0)).length;
  const sellSetupsCount = processedData.filter((d) => d.isSellSetup || (d.totalScore >= 80 && d.stockChangePercent < 0)).length;
  const gapUpCount = processedData.filter((d) => d.gapPct >= 2.0).length;
  const gapDownCount = processedData.filter((d) => d.gapPct <= -2.0).length;
  const score90PlusCount = processedData.filter((d) => d.totalScore >= 90).length;

  const handleTradeClick = async (data: GapRsStockData, signal: 'BUY' | 'SELL') => {
    if (!onExecuteTrade) return;
    setExecutingSymbol(data.symbol);
    await onExecuteTrade(data.stock, signal);
    setTimeout(() => setExecutingSymbol(null), 600);
  };

  const toggleExpandSymbol = (sym: string) => {
    setExpandedSymbol((prev) => (prev === sym ? null : sym));
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Banner Header */}
      <div
        className={`p-6 rounded-2xl border transition-all ${
          isDark
            ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-xl'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/60">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Award className="w-5 h-5" />
              </span>
              <h1 className="text-xl font-black italic tracking-tight uppercase">
                World-Class Trader Formula v2 — 100 Points Scanner
              </h1>
              <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full uppercase">
                7 Vector Architecture
              </span>
            </div>
            <p className="text-xs font-mono opacity-70">
              Evaluates Market Regime (15), Sector (15), Price Action (20), Momentum (15), RVOL (10), Futures/OI (15) & Risk (10) for 100% Signal Conviction.
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => {
                if (filteredData.length > 0) setActiveChartStock(filteredData[0]);
              }}
              className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs font-mono uppercase rounded-xl transition-all shadow-md flex items-center gap-2 border border-blue-400/40 shrink-0"
            >
              <BarChart2 className="w-4 h-4 text-blue-200" />
              <span>Open 60M TradingView Chart</span>
            </button>

            <button
              onClick={() => setShowFormulaModal(true)}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs font-mono uppercase rounded-xl transition-all shadow-md flex items-center gap-2 border border-amber-400/40 shrink-0"
            >
              <Sliders className="w-4 h-4" />
              <span>100-PT Formula v2 Matrix</span>
            </button>
          </div>
        </div>

        {/* Top KPI Cards Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-4 font-mono">
          <div
            className={`p-3.5 rounded-xl border transition-all ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span className="text-[10px] uppercase font-bold opacity-60 block">🟢 Qualified Buy Setups</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xl font-black text-emerald-400">{buySetupsCount}</span>
              <span className="px-1.5 py-0.5 text-[9px] bg-emerald-500/20 text-emerald-300 rounded font-bold">Score ≥ 80</span>
            </div>
            <span className="text-[10px] block opacity-60 mt-1">Passes All 8 Mandatory Filters</span>
          </div>

          <div
            className={`p-3.5 rounded-xl border transition-all ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span className="text-[10px] uppercase font-bold opacity-60 block">🔴 Qualified Sell Setups</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xl font-black text-rose-400">{sellSetupsCount}</span>
              <span className="px-1.5 py-0.5 text-[9px] bg-rose-500/20 text-rose-300 rounded font-bold">Score ≥ 80</span>
            </div>
            <span className="text-[10px] block opacity-60 mt-1">Passes All 12 Mandatory Filters</span>
          </div>

          <div
            className={`p-3.5 rounded-xl border transition-all ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span className="text-[10px] uppercase font-bold opacity-60 block">🔥 Very Strong Signals</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xl font-black text-amber-400">{score90PlusCount}</span>
              <span className="px-1.5 py-0.5 text-[9px] bg-amber-500/20 text-amber-300 rounded font-bold">Score ≥ 90</span>
            </div>
            <span className="text-[10px] block opacity-60 mt-1">🔥 Top Conviction Tier</span>
          </div>

          <div
            className={`p-3.5 rounded-xl border transition-all ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span className="text-[10px] uppercase font-bold opacity-60 block">⚡ Gap Filter Alerts</span>
            <div className="flex items-center justify-between mt-1">
              <span className="text-xl font-black text-indigo-400">{gapUpCount + gapDownCount}</span>
              <span className="px-1.5 py-0.5 text-[9px] bg-indigo-500/20 text-indigo-300 rounded font-bold">≥ |2%| Gap</span>
            </div>
            <span className="text-[10px] block opacity-60 mt-1">Requires Pullback Confirmation</span>
          </div>

          <div
            className={`p-3.5 rounded-xl border transition-all col-span-2 sm:col-span-1 ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span className="text-[10px] uppercase font-bold opacity-60 block">📈 Live 60M Chart</span>
            <div className="flex items-center gap-1.5 mt-1">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
              <span className="text-xs font-black text-blue-400 uppercase">TradingView Live 60M</span>
            </div>
            <span className="text-[10px] block opacity-60 mt-1">1-Click Chart &amp; Targets</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div
        className={`p-4 rounded-2xl border transition-all ${
          isDark
            ? 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-md'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 font-mono">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search symbol, stock name, or sector (e.g. RELIANCE, Banking)..."
              className={`w-full pl-9 pr-4 py-2 text-xs rounded-xl border transition-colors outline-none ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500 focus:border-amber-500'
                  : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400 focus:border-amber-500'
              }`}
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto py-1 custom-scrollbar text-xs shrink-0">
            <button
              onClick={() => setSetupFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg transition-all font-bold uppercase whitespace-nowrap ${
                setupFilter === 'ALL'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              All ({processedData.length})
            </button>
            <button
              onClick={() => setSetupFilter('BUY_SETUPS')}
              className={`px-3 py-1.5 rounded-lg transition-all font-bold uppercase whitespace-nowrap flex items-center gap-1 ${
                setupFilter === 'BUY_SETUPS'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-300" />
              <span>🟢 Qualified Buy ({buySetupsCount})</span>
            </button>
            <button
              onClick={() => setSetupFilter('SELL_SETUPS')}
              className={`px-3 py-1.5 rounded-lg transition-all font-bold uppercase whitespace-nowrap flex items-center gap-1 ${
                setupFilter === 'SELL_SETUPS'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-rose-300 rotate-180" />
              <span>🔴 Qualified Sell ({sellSetupsCount})</span>
            </button>
            <button
              onClick={() => setSetupFilter('GAP_UP')}
              className={`px-3 py-1.5 rounded-lg transition-all font-bold uppercase whitespace-nowrap ${
                setupFilter === 'GAP_UP'
                  ? 'bg-emerald-700 text-white shadow-md'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>Gap Up ≥ +2% ({gapUpCount})</span>
            </button>
            <button
              onClick={() => setSetupFilter('GAP_DOWN')}
              className={`px-3 py-1.5 rounded-lg transition-all font-bold uppercase whitespace-nowrap ${
                setupFilter === 'GAP_DOWN'
                  ? 'bg-rose-700 text-white shadow-md'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>Gap Down ≤ -2% ({gapDownCount})</span>
            </button>
            <button
              onClick={() => setSetupFilter('SCORE_80_PLUS')}
              className={`px-3 py-1.5 rounded-lg transition-all font-bold uppercase whitespace-nowrap ${
                setupFilter === 'SCORE_80_PLUS'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span>Score ≥ 80 ({processedData.filter((d) => d.totalScore >= 80).length})</span>
            </button>
          </div>

          {/* Sector & Sort Dropdowns */}
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className={`px-3 py-1.5 text-xs font-mono font-bold rounded-xl border outline-none ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-800'
              }`}
            >
              {sectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec === 'ALL' ? 'All Sectors' : sec}
                </option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className={`px-3 py-1.5 text-xs font-mono font-bold rounded-xl border outline-none ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-100 border-slate-300 text-slate-800'
              }`}
            >
              <option value="SCORE">Sort: Formula v2 Score (100 Pts)</option>
              <option value="RELATIVE_STRENGTH">Sort: Relative Strength</option>
              <option value="TRADED_VALUE">Sort: Traded Value</option>
              <option value="GAP_PCT">Sort: Gap %</option>
              <option value="VOLUME_RANK">Sort: Volume Rank</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Scanner Table */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isDark
            ? 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-xl'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-black italic tracking-tight uppercase flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Scanned Stocks ({filteredData.length})</span>
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded uppercase font-bold">
              Formula v2 + 60M TradingView Live Chart
            </span>
          </div>

          <div className="text-xs font-mono opacity-60">
            Updated: {new Date().toLocaleTimeString()}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr
                className={`uppercase text-[10px] font-bold border-b ${
                  isDark ? 'bg-slate-950/80 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                }`}
              >
                <th className="py-3 px-3">Symbol / Sector</th>
                <th className="py-3 px-3">Price &amp; Gap %</th>
                <th className="py-3 px-3">RS &amp; Ranks</th>
                <th className="py-3 px-3">Formula v2 (100 Pts)</th>
                <th className="py-3 px-3">Signal Tier &amp; Setup</th>
                <th className="py-3 px-3">Institutional &amp; Gap Alert</th>
                <th className="py-3 px-3">⏱️ Entry Timing</th>
                <th className="py-3 px-3">🎯 Exit, SL &amp; Targets (T1, T2, T3)</th>
                <th className="py-3 px-3 text-right">Chart &amp; Trade</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center opacity-50 font-mono">
                    No stocks match the selected Formula v2 filter criteria. Try resetting search filters!
                  </td>
                </tr>
              ) : (
                filteredData.map((item) => {
                  const isBullish = item.stockChangePercent >= 0;
                  const isExpanded = expandedSymbol === item.symbol;
                  const scoreColor =
                    item.totalScore >= 90
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : item.totalScore >= 85
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : item.totalScore >= 80
                      ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700';

                  return (
                    <React.Fragment key={item.symbol}>
                      <tr
                        className={`transition-colors ${
                          isExpanded
                            ? isDark ? 'bg-slate-800/80' : 'bg-slate-100'
                            : isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'
                        }`}
                      >
                        {/* Symbol & Sector */}
                        <td className="py-3.5 px-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => toggleExpandSymbol(item.symbol)}
                                className="p-0.5 rounded hover:bg-slate-700 text-slate-300 transition-colors"
                                title="Click to view complete 7-Vector Score Breakdown"
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-amber-400" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-slate-400" />
                                )}
                              </button>

                              <span
                                onClick={() => toggleExpandSymbol(item.symbol)}
                                className="font-bold text-sm hover:text-amber-400 cursor-pointer transition-colors"
                              >
                                {item.symbol}
                              </span>

                              {item.volumeRank <= 10 && item.valueRank <= 10 && (
                                <span className="px-1.5 py-0.2 text-[9px] bg-amber-500/20 text-amber-300 font-bold rounded border border-amber-500/30">
                                  TOP 10
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] block opacity-60 pl-5">{item.sector}</span>
                          </div>
                        </td>

                        {/* Current Price & Gap % */}
                        <td className="py-3.5 px-3">
                          <div className="space-y-1">
                            <div className="font-bold">
                              ₹{item.price.toLocaleString('en-IN')}
                              <span
                                className={`text-[11px] ml-1.5 font-bold ${
                                  isBullish
                                    ? isDark ? 'text-emerald-400' : 'text-emerald-600'
                                    : isDark ? 'text-rose-400' : 'text-rose-600'
                                }`}
                              >
                                {isBullish ? '+' : ''}{item.stockChangePercent}%
                              </span>
                            </div>

                            <div>
                              {item.gapClassification === 'Gap Up' ? (
                                <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 inline-block">
                                  🟢 Gap Up: +{item.gapPct}%
                                </span>
                              ) : item.gapClassification === 'Gap Down' ? (
                                <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-rose-500/20 text-rose-300 border border-rose-500/30 inline-block">
                                  🔴 Gap Down: {item.gapPct}%
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-slate-800 text-slate-300 border border-slate-700 inline-block">
                                  ⚪ Normal Open ({item.gapPct}%)
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* RS & Ranks */}
                        <td className="py-3.5 px-3">
                          <div className="space-y-1">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded border inline-block ${
                                item.relativeStrength >= 1.5
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : item.relativeStrength > 0
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : item.relativeStrength <= -1.5
                                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                  : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              }`}
                            >
                              RS: {item.relativeStrength >= 0 ? '+' : ''}{item.relativeStrength}%
                            </span>

                            <div className="text-[10px] opacity-70">
                              Vol #{item.volumeRank} • Val #{item.valueRank}
                            </div>
                          </div>
                        </td>

                        {/* Quant Score */}
                        <td className="py-3.5 px-3">
                          <div className="space-y-1 cursor-pointer" onClick={() => toggleExpandSymbol(item.symbol)}>
                            <div className="flex items-center gap-2">
                              <span className={`px-2.5 py-0.5 text-xs font-black rounded-lg border ${scoreColor}`}>
                                {item.totalScore} / 100 Pts
                              </span>
                            </div>

                            {/* Progress bar */}
                            <div className="w-24 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all ${
                                  item.totalScore >= 85 ? 'bg-emerald-400' : item.totalScore >= 70 ? 'bg-amber-400' : 'bg-slate-600'
                                }`}
                                style={{ width: `${item.totalScore}%` }}
                              ></div>
                            </div>

                            <span className="text-[9px] block text-amber-300 underline opacity-80">
                              View 7 Vectors ➔
                            </span>
                          </div>
                        </td>

                        {/* Signal Tier & Setup */}
                        <td className="py-3.5 px-3">
                          <div className="space-y-1">
                            <span
                              className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase inline-block ${
                                item.signalTier.includes('BUY')
                                  ? 'bg-emerald-500 text-slate-950 font-black'
                                  : item.signalTier.includes('SELL')
                                  ? 'bg-rose-500 text-white font-black'
                                  : item.signalTier.includes('WATCH')
                                  ? 'bg-amber-500 text-slate-950 font-bold'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {item.signalTier}
                            </span>

                            <div>
                              {item.isBuySetup ? (
                                <span className="px-2 py-0.5 text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded inline-block">
                                  🟢 QUALIFIED BUY
                                </span>
                              ) : item.isSellSetup ? (
                                <span className="px-2 py-0.5 text-[9px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded inline-block">
                                  🔴 QUALIFIED SELL
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 text-[9px] opacity-60 bg-slate-800 text-slate-400 rounded inline-block">
                                  ⚪ {item.setupType}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Institutional & Gap Filter Alert */}
                        <td className="py-3.5 px-3">
                          <div className="space-y-1 max-w-[170px]">
                            {item.instConfirmation !== 'NEUTRAL' && (
                              <span
                                className={`px-1.5 py-0.5 text-[9px] font-bold rounded block text-center uppercase ${
                                  item.instConfirmation.includes('LONG')
                                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                }`}
                              >
                                ⚡ {item.instConfirmation.replace('INSTITUTIONAL ', '')}
                              </span>
                            )}

                            {item.isGapFilterActive ? (
                              <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 block">
                                ⚠️ Gap Filter: Wait Pullback
                              </span>
                            ) : (
                              <span className="text-[10px] opacity-60 block">Normal Open Alignment</span>
                            )}
                          </div>
                        </td>

                        {/* Perfect Entry Time */}
                        <td className="py-3.5 px-3">
                          <div className="space-y-1 max-w-[190px]">
                            <div className="text-[11px] font-bold text-amber-300 leading-tight">
                              {item.perfectEntryTime}
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] opacity-70">
                              <span className="text-emerald-400 font-bold">RVOL: {item.rvol.toFixed(1)}x</span>
                              <span>• ADX: {item.adx}</span>
                            </div>
                          </div>
                        </td>

                        {/* Exit, SL & Targets */}
                        <td className="py-3.5 px-3">
                          <div className="space-y-1 max-w-[210px]">
                            <div className="text-[10px] font-bold text-emerald-300 leading-tight">
                              {item.perfectExitTime}
                            </div>

                            <div className="text-[10px] space-x-1 font-mono">
                              <span className="text-emerald-400 font-semibold">T1(1R): ₹{item.target1Exit}</span>
                              <span className="text-amber-300 font-semibold">• T2(1.5R): ₹{item.target2Exit}</span>
                              <span className="text-indigo-300 font-semibold">• T3(2R): ₹{item.target3Exit}</span>
                              <span className="text-rose-400 font-semibold block">SL: ₹{item.stopLossExit} (1R = ₹{item.riskPerShare})</span>
                            </div>
                          </div>
                        </td>

                        {/* Action buttons including 60M TradingView Chart */}
                        <td className="py-3.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* 60M TradingView Chart Button */}
                            <button
                              onClick={() => setActiveChartStock(item)}
                              className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] uppercase rounded-lg transition-all shadow-md flex items-center gap-1 shrink-0"
                              title="Open 60M Interactive TradingView Chart"
                            >
                              <BarChart2 className="w-3.5 h-3.5 text-blue-200" />
                              <span>60M TV Chart</span>
                            </button>

                            {isBullish ? (
                              <button
                                onClick={() => handleTradeClick(item, 'BUY')}
                                disabled={executingSymbol === item.symbol}
                                className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[10px] uppercase rounded-lg transition-all shadow-md shrink-0 disabled:opacity-50"
                              >
                                {executingSymbol === item.symbol ? 'Executing...' : 'Buy'}
                              </button>
                            ) : (
                              <button
                                onClick={() => handleTradeClick(item, 'SELL')}
                                disabled={executingSymbol === item.symbol}
                                className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-[10px] uppercase rounded-lg transition-all shadow-md shrink-0 disabled:opacity-50"
                              >
                                {executingSymbol === item.symbol ? 'Executing...' : 'Sell'}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* EXPANDED 7-VECTOR FORMULA SCORE BREAKDOWN CARD FOR THIS STOCK */}
                      {isExpanded && (
                        <tr>
                          <td colSpan={9} className="p-0 border-b border-amber-500/30">
                            <div className={`p-5 space-y-4 ${isDark ? 'bg-slate-950/90' : 'bg-amber-50/50'}`}>
                              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                                <div className="flex items-center gap-2">
                                  <Sliders className="w-4 h-4 text-amber-400" />
                                  <span className="font-black text-sm uppercase text-amber-300">
                                    {item.symbol} ➔ World-Class Trader Formula v2 (7 Vectors)
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="px-2.5 py-0.5 text-xs font-black bg-amber-600 text-white rounded">
                                    Total Score: {item.totalScore} / 100 PTS
                                  </span>
                                  <button
                                    onClick={() => setActiveChartStock(item)}
                                    className="px-2.5 py-1 bg-blue-600 text-white font-bold text-[10px] rounded flex items-center gap-1"
                                  >
                                    <BarChart2 className="w-3 h-3" />
                                    <span>View 60M TradingView Chart ↗</span>
                                  </button>
                                </div>
                              </div>

                              {/* 7 Formula Vector Component Points Grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 font-mono text-xs">
                                {/* V1. Market Regime */}
                                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'}`}>
                                  <span className="text-[10px] uppercase opacity-60 block font-bold">V1. Market Regime</span>
                                  <span className="font-bold text-amber-300 text-xs">NIFTY Align</span>
                                  <div className="mt-1 flex items-center justify-between text-[10px]">
                                    <span className="opacity-70">Max 15 Pts</span>
                                    <span className="font-bold text-emerald-400">+{item.v1MarketRegimePts}</span>
                                  </div>
                                </div>

                                {/* V2. Sector Strength */}
                                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'}`}>
                                  <span className="text-[10px] uppercase opacity-60 block font-bold">V2. Sector Strength</span>
                                  <span className="font-bold text-amber-300 text-xs">{item.sectorChangePercent >= 0 ? '+' : ''}{item.sectorChangePercent}%</span>
                                  <div className="mt-1 flex items-center justify-between text-[10px]">
                                    <span className="opacity-70">Max 15 Pts</span>
                                    <span className="font-bold text-emerald-400">+{item.v2SectorStrengthPts}</span>
                                  </div>
                                </div>

                                {/* V3. Stock Price Action */}
                                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'}`}>
                                  <span className="text-[10px] uppercase opacity-60 block font-bold">V3. Price Action</span>
                                  <span className="font-bold text-amber-300 text-xs">VWAP &amp; EMA</span>
                                  <div className="mt-1 flex items-center justify-between text-[10px]">
                                    <span className="opacity-70">Max 20 Pts</span>
                                    <span className="font-bold text-emerald-400">+{item.v3StockPriceActionPts}</span>
                                  </div>
                                </div>

                                {/* V4. Momentum */}
                                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'}`}>
                                  <span className="text-[10px] uppercase opacity-60 block font-bold">V4. Momentum</span>
                                  <span className="font-bold text-amber-300 text-xs">RSI {item.rsi} • ADX {item.adx}</span>
                                  <div className="mt-1 flex items-center justify-between text-[10px]">
                                    <span className="opacity-70">Max 15 Pts</span>
                                    <span className="font-bold text-emerald-400">+{item.v4MomentumPts}</span>
                                  </div>
                                </div>

                                {/* V5. Volume / RVOL */}
                                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'}`}>
                                  <span className="text-[10px] uppercase opacity-60 block font-bold">V5. Vol / RVOL</span>
                                  <span className="font-bold text-amber-300 text-xs">RVOL {item.rvol.toFixed(1)}x</span>
                                  <div className="mt-1 flex items-center justify-between text-[10px]">
                                    <span className="opacity-70">Max 10 Pts</span>
                                    <span className="font-bold text-emerald-400">+{item.v5VolumeRvolPts}</span>
                                  </div>
                                </div>

                                {/* V6. Futures / OI */}
                                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'}`}>
                                  <span className="text-[10px] uppercase opacity-60 block font-bold">V6. Futures / OI</span>
                                  <span className="font-bold text-amber-300 text-xs">OI Buildup</span>
                                  <div className="mt-1 flex items-center justify-between text-[10px]">
                                    <span className="opacity-70">Max 15 Pts</span>
                                    <span className="font-bold text-emerald-400">+{item.v6FuturesOiPts}</span>
                                  </div>
                                </div>

                                {/* V7. Risk / Volatility */}
                                <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'}`}>
                                  <span className="text-[10px] uppercase opacity-60 block font-bold">V7. Risk / Vol</span>
                                  <span className="font-bold text-amber-300 text-xs">ATR ₹{item.atr}</span>
                                  <div className="mt-1 flex items-center justify-between text-[10px]">
                                    <span className="opacity-70">Max 10 Pts</span>
                                    <span className="font-bold text-emerald-400">+{item.v7RiskVolatilityPts}</span>
                                  </div>
                                </div>
                              </div>

                              {/* Formula Equation & Mandatory Criteria Checklists */}
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'}`}>
                                  <span className="font-bold text-amber-400 block mb-1">
                                    🧮 Vector Sum Mathematical Score Breakdown:
                                  </span>
                                  <p className="font-mono text-emerald-300 text-[11px] leading-relaxed">
                                    V1({item.v1MarketRegimePts}) + V2({item.v2SectorStrengthPts}) + V3({item.v3StockPriceActionPts}) + V4({item.v4MomentumPts}) + V5({item.v5VolumeRvolPts}) + V6({item.v6FuturesOiPts}) + V7({item.v7RiskVolatilityPts}) = <strong className="text-white text-sm">{item.totalScore} / 100 PTS</strong>
                                  </p>
                                  <span className="text-[10px] opacity-70 block mt-1">
                                    VWAP: ₹{item.vwap} | EMA 13/21/34: ₹{item.ema13}/₹{item.ema21}/₹{item.ema34} | RSI: {item.rsi} | ADX: {item.adx}
                                  </span>
                                </div>

                                <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-300'}`}>
                                  <span className="font-bold text-emerald-400 block mb-1">
                                    ✅ Mandatory Criteria Verification Checklist:
                                  </span>
                                  <div className="space-y-1 text-[10px] font-mono">
                                    <div className="flex items-center gap-1.5">
                                      {item.buyCriteriaChecks.scorePass ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <X className="w-3 h-3 text-rose-400 shrink-0" />}
                                      <span>Total Score ≥ 80 ({item.totalScore} Pts)</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {item.buyCriteriaChecks.stockVwapPass ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <X className="w-3 h-3 text-rose-400 shrink-0" />}
                                      <span>Price &gt; VWAP (₹{item.price} &gt; ₹{item.vwap})</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {item.buyCriteriaChecks.emaPass ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <X className="w-3 h-3 text-rose-400 shrink-0" />}
                                      <span>EMA Alignment (13 &gt; 21 &gt; 34)</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {item.buyCriteriaChecks.rvolPass ? <Check className="w-3 h-3 text-emerald-400 shrink-0" /> : <X className="w-3 h-3 text-rose-400 shrink-0" />}
                                      <span>RVOL ≥ 1.5 ({item.rvol.toFixed(1)}x)</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Gap Filter Banner if active */}
                              {item.isGapFilterActive && (
                                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl text-[11px] text-amber-300 font-mono">
                                  {item.gapFilterNotice}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. 60M TRADINGVIEW CHART MODAL WIDGET */}
      {activeChartStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/85 backdrop-blur-md animate-fade-in font-mono">
          <div
            className={`w-full max-w-5xl p-5 rounded-2xl border shadow-2xl flex flex-col max-h-[92vh] ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800 shrink-0">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/30">
                  <BarChart2 className="w-5 h-5" />
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black italic tracking-tight uppercase">
                      {activeChartStock.symbol} 60M TradingView Live Chart
                    </h3>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-500/20 text-blue-300 rounded border border-blue-500/30">
                      1-HOUR TIMEFRAME
                    </span>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                      SCORE: {activeChartStock.totalScore}/100 PTS
                    </span>
                  </div>
                  <p className="text-[11px] opacity-60">
                    NSE:{activeChartStock.symbol} • {activeChartStock.name} • {activeChartStock.sector}
                  </p>
                </div>
              </div>

              {/* Timeframe & Action Controls */}
              <div className="flex items-center gap-2 shrink-0">
                {/* Interval switch */}
                <div className="flex items-center gap-1 p-1 bg-slate-950 rounded-lg border border-slate-800 text-[11px]">
                  <button
                    onClick={() => setChartInterval('60')}
                    className={`px-2 py-1 rounded font-bold ${
                      chartInterval === '60' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    60M (1H)
                  </button>
                  <button
                    onClick={() => setChartInterval('15')}
                    className={`px-2 py-1 rounded font-bold ${
                      chartInterval === '15' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    15M
                  </button>
                  <button
                    onClick={() => setChartInterval('5')}
                    className={`px-2 py-1 rounded font-bold ${
                      chartInterval === '5' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    5M
                  </button>
                  <button
                    onClick={() => setChartInterval('D')}
                    className={`px-2 py-1 rounded font-bold ${
                      chartInterval === 'D' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    1D
                  </button>
                </div>

                <a
                  href={`https://in.tradingview.com/chart/?symbol=NSE:${activeChartStock.symbol}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold"
                  title="Open full screen in TradingView website"
                >
                  <span>Open TV</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  onClick={() => setActiveChartStock(null)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Quick Metrics Bar above Chart */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 my-3 text-xs shrink-0">
              <div className="p-2 bg-slate-950/80 rounded-lg border border-slate-800 flex items-center justify-between">
                <span className="opacity-60 text-[10px]">Price:</span>
                <span className="font-bold text-white">₹{activeChartStock.price} ({activeChartStock.stockChangePercent}%)</span>
              </div>
              <div className="p-2 bg-slate-950/80 rounded-lg border border-slate-800 flex items-center justify-between">
                <span className="opacity-60 text-[10px]">Relative Strength:</span>
                <span className="font-bold text-emerald-400">{activeChartStock.relativeStrength >= 0 ? '+' : ''}{activeChartStock.relativeStrength}%</span>
              </div>
              <div className="p-2 bg-slate-950/80 rounded-lg border border-slate-800 flex items-center justify-between">
                <span className="opacity-60 text-[10px]">Targets (1R, 1.5R, 2R):</span>
                <span className="font-bold text-amber-300">₹{activeChartStock.target1Exit} / ₹{activeChartStock.target2Exit} / ₹{activeChartStock.target3Exit}</span>
              </div>
              <div className="p-2 bg-slate-950/80 rounded-lg border border-slate-800 flex items-center justify-between">
                <span className="opacity-60 text-[10px]">Stop Loss (1R):</span>
                <span className="font-bold text-rose-400">₹{activeChartStock.stopLossExit}</span>
              </div>
            </div>

            {/* Live TradingView Iframe Widget */}
            <div className="flex-1 w-full min-h-[380px] sm:min-h-[440px] rounded-xl overflow-hidden border border-slate-800 bg-slate-950">
              <iframe
                title={`TradingView 60m Chart ${activeChartStock.symbol}`}
                src={`https://s.tradingview.com/widgetembed/?symbol=NSE:${activeChartStock.symbol}&interval=${chartInterval}&theme=dark&style=1&timezone=Asia/Kolkata&withdatesnapshot=false&hide_side_toolbar=false&allow_symbol_change=true`}
                className="w-full h-full border-none"
                allowFullScreen
              ></iframe>
            </div>

            {/* Modal Footer with Execution Button */}
            <div className="pt-3 mt-3 border-t border-slate-800 flex items-center justify-between shrink-0">
              <div className="text-[11px] opacity-70">
                <span>⏱️ {activeChartStock.perfectEntryTime}</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTradeClick(activeChartStock, 'BUY')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase rounded-xl transition-all shadow-md"
                >
                  Execute Buy Trade
                </button>
                <button
                  onClick={() => handleTradeClick(activeChartStock, 'SELL')}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase rounded-xl transition-all shadow-md"
                >
                  Execute Sell Trade
                </button>
                <button
                  onClick={() => setActiveChartStock(null)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs uppercase rounded-xl"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 100-Point Formula Matrix Modal */}
      {showFormulaModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in font-mono">
          <div
            className={`w-full max-w-3xl p-6 rounded-2xl border shadow-2xl max-h-[90vh] overflow-y-auto ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
              <div className="flex items-center gap-2">
                <span className="p-2 rounded-xl bg-amber-600/20 text-amber-400 border border-amber-500/30">
                  <Award className="w-5 h-5" />
                </span>
                <h3 className="text-base font-black italic tracking-tight uppercase">
                  🏆 World-Class Trader Formula v2 — 100 Points Matrix
                </h3>
              </div>
              <button
                onClick={() => setShowFormulaModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 my-4 text-xs">
              <p className="opacity-80">
                Formula v2 evaluates stocks across 7 institutional vectors totaling 100 points:
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="font-bold text-amber-400 block mb-1">V1 — Market Regime (15 Points)</span>
                  <p className="opacity-70 text-[11px]">
                    NIFTY &gt; VWAP (+5) • NIFTY &gt; EMA 20 (+3) • RSI 50–65 (+2) • ADX &gt; 20 (+2) • 5M Bullish Trend (+3)
                  </p>
                </div>

                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="font-bold text-amber-400 block mb-1">V2 — Sector Strength (15 Points)</span>
                  <p className="opacity-70 text-[11px]">
                    Sector Index &gt; VWAP (+4) • EMA 20 &gt; 50 (+3) • RS vs Nifty (+3) • RVOL &gt; 1.2 (+2) • Momentum (+3)
                  </p>
                </div>

                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="font-bold text-amber-400 block mb-1">V3 — Price Action (20 Points)</span>
                  <p className="opacity-70 text-[11px]">
                    Price &gt; VWAP (+4) • EMA 13 &gt; 21 &gt; 34 (+5) • Higher High/Low (+3) • Breakout (+4) • 5M Close (+4)
                  </p>
                </div>

                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="font-bold text-amber-400 block mb-1">V4 — Momentum (15 Points)</span>
                  <p className="opacity-70 text-[11px]">
                    RSI 55–70 (+4) • MACD Crossover (+3) • MACD Hist (+2) • ADX &gt; 25 (+3) • +DI &gt; -DI (+3)
                  </p>
                </div>

                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="font-bold text-amber-400 block mb-1">V5 — Volume / RVOL (10 Points)</span>
                  <p className="opacity-70 text-[11px]">
                    RVOL &gt; 1.5 (+4) • Vol &gt; 20-bar avg (+3) • Breakout Confirmation (+3)
                  </p>
                </div>

                <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="font-bold text-amber-400 block mb-1">V6 — Futures / OI (15 Points)</span>
                  <p className="opacity-70 text-[11px]">
                    Price ↑ + OI ↑ Long Buildup (+5) • Futures Vol (+3) • OI Momentum (+2) • Basis (+2) • No Divergence (+3)
                  </p>
                </div>

                <div className={`p-3 sm:col-span-2 rounded-xl border ${isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                  <span className="font-bold text-amber-400 block mb-1">V7 — Risk / Volatility (10 Points)</span>
                  <p className="opacity-70 text-[11px]">
                    ATR Intraday Movement (+3) • Spread/Liquidity (+2) • VWAP Extension ≤2.5% (+2) • SL Distance Reasonable (+3)
                  </p>
                </div>
              </div>

              <div className={`p-4 rounded-xl border ${isDark ? 'bg-emerald-950/20 border-emerald-800/50' : 'bg-emerald-50 border-emerald-200'}`}>
                <h4 className="font-black text-emerald-400 uppercase text-xs mb-2">🟢 Mandatory BUY Qualification Checklist</h4>
                <p className="text-[11px] opacity-90 leading-relaxed">
                  Total Score ≥ 80 <strong>AND</strong> NIFTY &gt; VWAP <strong>AND</strong> Sector &gt; VWAP <strong>AND</strong> Stock &gt; VWAP <strong>AND</strong> EMA 13 &gt; 21 &gt; 34 <strong>AND</strong> RVOL ≥ 1.5 <strong>AND</strong> ADX ≥ 25 <strong>AND</strong> No Major Bearish OI.
                </p>
              </div>

              <div className={`p-4 rounded-xl border ${isDark ? 'bg-rose-950/20 border-rose-800/50' : 'bg-rose-50 border-rose-200'}`}>
                <h4 className="font-black text-rose-400 uppercase text-xs mb-2">🔴 Mandatory SELL Qualification Checklist</h4>
                <p className="text-[11px] opacity-90 leading-relaxed">
                  Total Score ≥ 80 <strong>AND</strong> NIFTY &lt; VWAP <strong>AND</strong> Sector &lt; VWAP <strong>AND</strong> Stock &lt; VWAP <strong>AND</strong> EMA 13 &lt; 21 &lt; 34 <strong>AND</strong> RSI 30–45 <strong>AND</strong> MACD Bearish <strong>AND</strong> ADX ≥ 25 <strong>AND</strong> -DI &gt; +DI <strong>AND</strong> RVOL ≥ 1.5 <strong>AND</strong> Short Buildup (Price ↓ + OI ↑).
                </p>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-800/80 flex justify-end">
              <button
                onClick={() => setShowFormulaModal(false)}
                className="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs uppercase rounded-xl transition-all"
              >
                Close Matrix
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
