import React, { useState, useMemo } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  DollarSign,
  Flame,
  Layers,
  Percent,
  Play,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  HollyEngineeringParams,
  HollyStockDiagnostics,
  ScannedStock,
} from '../types';
import {
  DEFAULT_HOLLY_ENGINEERING_PARAMS,
  evaluateHollyFormulaDiagnostics,
  batchEvaluateHollyDiagnostics,
  HOLLY_STRATEGIES,
} from '../utils/hollyEngine';

interface HollyEngineeringFormulaViewProps {
  stocks: ScannedStock[];
  selectedSymbol?: string;
  onSelectStock?: (stock: ScannedStock) => void;
  onExecuteTrade?: (stock: ScannedStock, signal: 'BUY' | 'SELL') => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const HollyEngineeringFormulaView: React.FC<HollyEngineeringFormulaViewProps> = ({
  stocks,
  selectedSymbol: initialSymbol,
  onSelectStock,
  onExecuteTrade,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';

  // Engineering Parameter State
  const [params, setParams] = useState<HollyEngineeringParams>(
    DEFAULT_HOLLY_ENGINEERING_PARAMS
  );
  const [isTunerOpen, setIsTunerOpen] = useState<boolean>(false);

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<
    'ALL' | 'APEX' | 'QUALIFIED_BUY' | 'QUALIFIED_SHORT' | 'WATCHLIST' | 'REJECTED'
  >('ALL');
  const [sectorFilter, setSectorFilter] = useState<string>('ALL');

  // Expanded vector accordions
  const [expandedVectors, setExpandedVectors] = useState<Record<string, boolean>>({
    HV1: true,
    HV2: true,
    HV3: true,
    HV4: true,
    HV5: true,
    HV6: true,
  });

  const toggleVector = (vId: string) => {
    setExpandedVectors((prev) => ({ ...prev, [vId]: !prev[vId] }));
  };

  const expandAll = () => {
    setExpandedVectors({
      HV1: true,
      HV2: true,
      HV3: true,
      HV4: true,
      HV5: true,
      HV6: true,
    });
  };

  const collapseAll = () => {
    setExpandedVectors({
      HV1: false,
      HV2: false,
      HV3: false,
      HV4: false,
      HV5: false,
      HV6: false,
    });
  };

  // Run Batch Diagnostics across the universe with current parameters
  const diagnosticsList: HollyStockDiagnostics[] = useMemo(() => {
    return batchEvaluateHollyDiagnostics(stocks, params);
  }, [stocks, params]);

  // Selected Stock Symbol
  const [selectedSymbol, setSelectedSymbol] = useState<string>(() => {
    if (initialSymbol && diagnosticsList.some((d) => d.symbol === initialSymbol)) {
      return initialSymbol;
    }
    if (diagnosticsList.length > 0) {
      // Default to highest scoring stock
      const sorted = [...diagnosticsList].sort((a, b) => b.totalScore - a.totalScore);
      return sorted[0].symbol;
    }
    return '';
  });

  // Current selected stock diagnostics
  const currentDiagnostics = useMemo<HollyStockDiagnostics | undefined>(() => {
    return (
      diagnosticsList.find((d) => d.symbol === selectedSymbol) ||
      diagnosticsList[0]
    );
  }, [diagnosticsList, selectedSymbol]);

  // Matching original ScannedStock object for trade execution & chart inspection
  const currentScannedStock = useMemo<ScannedStock | undefined>(() => {
    if (!currentDiagnostics) return undefined;
    return stocks.find((s) => s.symbol === currentDiagnostics.symbol);
  }, [stocks, currentDiagnostics]);

  // Sector list for filter dropdown
  const sectorList = useMemo(() => {
    const set = new Set<string>();
    stocks.forEach((s) => {
      if (s.sector) set.add(s.sector);
    });
    return Array.from(set).sort();
  }, [stocks]);

  // Filtered diagnostics list for sidebar / quick picker
  const filteredDiagnostics = useMemo(() => {
    return diagnosticsList.filter((d) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matches =
          d.symbol.toLowerCase().includes(q) ||
          d.name.toLowerCase().includes(q) ||
          d.sector.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (sectorFilter !== 'ALL' && d.sector !== sectorFilter) {
        return false;
      }
      if (statusFilter === 'APEX') return d.totalScore >= 90;
      if (statusFilter === 'QUALIFIED_BUY') return d.qualificationStatus === 'QUALIFIED_BUY';
      if (statusFilter === 'QUALIFIED_SHORT') return d.qualificationStatus === 'QUALIFIED_SHORT';
      if (statusFilter === 'WATCHLIST') return d.qualificationStatus === 'WATCHLIST_PENDING';
      if (statusFilter === 'REJECTED') return d.qualificationStatus === 'REJECTED';
      return true;
    });
  }, [diagnosticsList, searchQuery, sectorFilter, statusFilter]);

  // Universe KPI Summary stats
  const kpis = useMemo(() => {
    const total = diagnosticsList.length;
    const apexCount = diagnosticsList.filter((d) => d.totalScore >= 90).length;
    const qualifiedBuyCount = diagnosticsList.filter(
      (d) => d.qualificationStatus === 'QUALIFIED_BUY'
    ).length;
    const qualifiedShortCount = diagnosticsList.filter(
      (d) => d.qualificationStatus === 'QUALIFIED_SHORT'
    ).length;
    const avgScore =
      total > 0
        ? Math.round(
            diagnosticsList.reduce((acc, d) => acc + d.totalScore, 0) / total
          )
        : 0;
    return {
      total,
      apexCount,
      qualifiedBuyCount,
      qualifiedShortCount,
      avgScore,
    };
  }, [diagnosticsList]);

  // Handle parameter reset
  const handleResetParams = () => {
    setParams(DEFAULT_HOLLY_ENGINEERING_PARAMS);
  };

  return (
    <div className="space-y-6">
      {/* 1. HERO HEADER & QUANT ENGINEERING BANNER */}
      <div
        className={`p-5 sm:p-6 rounded-2xl border transition-all ${
          isDark
            ? 'bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-indigo-500/30 shadow-xl'
            : 'bg-gradient-to-r from-indigo-50 via-white to-purple-50 border-indigo-200 shadow-md'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="relative p-3.5 rounded-2xl bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 text-white shadow-lg shadow-indigo-500/25 flex-shrink-0 animate-pulse">
              <Cpu className="w-8 h-8" />
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 border-2 border-slate-900 rounded-full" />
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                  <span>HOLLY QUANT FORMULA DIAGNOSTICS</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    6 VECTORS • 100 PTS
                  </span>
                </h2>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  HOLLY AI ENGINE v2.4
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Real-time rule verification and parameter sensitivity sandbox evaluating moving average velocity ribbons, RVOL surges, order flow asymmetry, and overnight statistical expectancy.
              </p>
            </div>
          </div>

          {/* Quick Action Button: Parameter Tuner Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsTunerOpen(!isTunerOpen)}
              className={`px-4 py-2.5 rounded-xl font-mono font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition-all border ${
                isTunerOpen
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                  : isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-300 hover:bg-slate-900'
                  : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Sliders className="w-4 h-4 text-indigo-400" />
              <span>{isTunerOpen ? 'Hide Formula Tuner' : 'Tune Formula Parameters'}</span>
            </button>
          </div>
        </div>

        {/* 2. SUMMARY METRICS STRIP */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 pt-5 border-t border-slate-800/80">
          <div
            className={`p-3 rounded-xl border ${
              isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white/80 border-slate-200'
            }`}
          >
            <div className="text-[10px] font-mono text-slate-400 uppercase">Scanned Universe</div>
            <div className="text-lg sm:text-xl font-mono font-black text-slate-100">
              {kpis.total} Stocks
            </div>
            <div className="text-[10px] text-slate-500 font-mono">Nifty 200 Universe</div>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white/80 border-slate-200'
            }`}
          >
            <div className="text-[10px] font-mono text-slate-400 uppercase">Apex A+ Setups</div>
            <div className="text-lg sm:text-xl font-mono font-black text-amber-400 flex items-center gap-1.5">
              <span>{kpis.apexCount}</span>
              <Award className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-[10px] text-amber-500/80 font-mono">Score &gt;= 90 pts</div>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white/80 border-slate-200'
            }`}
          >
            <div className="text-[10px] font-mono text-slate-400 uppercase">Qualified Buy</div>
            <div className="text-lg sm:text-xl font-mono font-black text-emerald-400">
              {kpis.qualifiedBuyCount}
            </div>
            <div className="text-[10px] text-emerald-500/80 font-mono">Above {params.confidenceCutoff} Cutoff</div>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white/80 border-slate-200'
            }`}
          >
            <div className="text-[10px] font-mono text-slate-400 uppercase">Qualified Short</div>
            <div className="text-lg sm:text-xl font-mono font-black text-rose-400">
              {kpis.qualifiedShortCount}
            </div>
            <div className="text-[10px] text-rose-500/80 font-mono">Bearish Breakdown</div>
          </div>

          <div
            className={`p-3 rounded-xl border ${
              isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white/80 border-slate-200'
            }`}
          >
            <div className="text-[10px] font-mono text-slate-400 uppercase">Avg Universe Score</div>
            <div className="text-lg sm:text-xl font-mono font-black text-indigo-300">
              {kpis.avgScore} / 100
            </div>
            <div className="text-[10px] text-slate-500 font-mono">Composite Mean</div>
          </div>
        </div>
      </div>

      {/* 3. INTERACTIVE QUANT PARAMETER TUNER (Collapsible Sandbox) */}
      {isTunerOpen && (
        <div
          className={`p-5 sm:p-6 rounded-2xl border transition-all ${
            isDark
              ? 'bg-slate-900/95 border-indigo-500/40 shadow-xl'
              : 'bg-white border-indigo-200 shadow-md'
          }`}
        >
          <div className="flex items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-400" />
              <h3 className="text-sm sm:text-base font-mono font-black uppercase text-slate-100">
                Formula Engineering Sandbox & Sensitivity Tuner
              </h3>
            </div>
            <button
              onClick={handleResetParams}
              className="text-xs font-mono text-indigo-400 hover:text-indigo-300 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Quant Defaults</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mt-5">
            {/* Tuner 1: Min RVOL */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Min RVOL Threshold:</span>
                <span className="font-bold text-emerald-400">{params.minRvolThreshold.toFixed(1)}x</span>
              </div>
              <input
                type="range"
                min="1.0"
                max="3.0"
                step="0.1"
                value={params.minRvolThreshold}
                onChange={(e) =>
                  setParams((p) => ({ ...p, minRvolThreshold: parseFloat(e.target.value) }))
                }
                className="w-full accent-indigo-500"
              />
              <div className="text-[10px] text-slate-500">Benchmark: 1.3x 20-day volume</div>
            </div>

            {/* Tuner 2: Confidence Cutoff */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Confidence Cutoff:</span>
                <span className="font-bold text-indigo-300">{params.confidenceCutoff} Pts</span>
              </div>
              <input
                type="range"
                min="70"
                max="92"
                step="1"
                value={params.confidenceCutoff}
                onChange={(e) =>
                  setParams((p) => ({ ...p, confidenceCutoff: parseInt(e.target.value, 10) }))
                }
                className="w-full accent-indigo-500"
              />
              <div className="text-[10px] text-slate-500">Minimum score for live qualification</div>
            </div>

            {/* Tuner 3: VWAP Pullback Tolerance */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">VWAP Pullback Tolerance:</span>
                <span className="font-bold text-amber-300">±{params.vwapTolerancePct.toFixed(1)}%</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="3.5"
                step="0.1"
                value={params.vwapTolerancePct}
                onChange={(e) =>
                  setParams((p) => ({ ...p, vwapTolerancePct: parseFloat(e.target.value) }))
                }
                className="w-full accent-indigo-500"
              />
              <div className="text-[10px] text-slate-500">Max allowable distance from VWAP</div>
            </div>

            {/* Tuner 4: Min Risk:Reward Multiple */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-400">Min Risk-to-Reward:</span>
                <span className="font-bold text-rose-300">1:{params.minRiskReward.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="1.5"
                max="3.5"
                step="0.1"
                value={params.minRiskReward}
                onChange={(e) =>
                  setParams((p) => ({ ...p, minRiskReward: parseFloat(e.target.value) }))
                }
                className="w-full accent-indigo-500"
              />
              <div className="text-[10px] text-slate-500">Asymmetric Target 2 requirement</div>
            </div>
          </div>
        </div>
      )}

      {/* 4. MAIN WORKSPACE: STOCK SELECTOR & DIAGNOSTIC DEEP DIVE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Stock Selection & Filter Panel (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Search & Filter Bar */}
          <div
            className={`p-4 rounded-2xl border space-y-3 ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono font-bold text-slate-300 uppercase">
                Select Stock ({filteredDiagnostics.length})
              </span>
              <span className="text-[10px] font-mono text-slate-500">NIFTY 200</span>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search symbol, sector..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500'
                    : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                }`}
              />
            </div>

            {/* Status Filter Chips */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  { key: 'ALL', label: 'All' },
                  { key: 'APEX', label: 'Apex 90+' },
                  { key: 'QUALIFIED_BUY', label: 'Buy' },
                  { key: 'QUALIFIED_SHORT', label: 'Short' },
                  { key: 'WATCHLIST', label: 'Watch' },
                ] as const
              ).map((filter) => (
                <button
                  key={filter.key}
                  onClick={() => setStatusFilter(filter.key)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold uppercase transition-all ${
                    statusFilter === filter.key
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : isDark
                      ? 'bg-slate-950 text-slate-400 hover:bg-slate-800'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            {/* Sector Dropdown */}
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className={`w-full px-3 py-1.5 text-xs font-mono rounded-xl border focus:outline-none ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-300'
                  : 'bg-slate-50 border-slate-300 text-slate-700'
              }`}
            >
              <option value="ALL">All Sectors ({sectorList.length})</option>
              {sectorList.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
          </div>

          {/* Stock List Scrollable Box */}
          <div
            className={`rounded-2xl border overflow-hidden max-h-[620px] overflow-y-auto custom-scrollbar ${
              isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            {filteredDiagnostics.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-slate-500">
                No stocks match your filter criteria.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {filteredDiagnostics.map((item) => {
                  const isSelected = item.symbol === selectedSymbol;
                  const isPositive = item.changePercent >= 0;

                  return (
                    <button
                      key={item.symbol}
                      onClick={() => {
                        setSelectedSymbol(item.symbol);
                        const found = stocks.find((s) => s.symbol === item.symbol);
                        if (found && onSelectStock) onSelectStock(found);
                      }}
                      className={`w-full p-3.5 text-left transition-all flex items-center justify-between gap-3 ${
                        isSelected
                          ? isDark
                            ? 'bg-indigo-950/60 border-l-4 border-l-indigo-500'
                            : 'bg-indigo-50/80 border-l-4 border-l-indigo-600'
                          : isDark
                          ? 'hover:bg-slate-800/50'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-sm text-slate-100">
                            {item.symbol}
                          </span>
                          <span
                            className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold uppercase ${
                              item.totalScore >= 90
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : item.qualificationStatus === 'QUALIFIED_BUY'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : item.qualificationStatus === 'QUALIFIED_SHORT'
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {item.grade.split(' ')[0]}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[170px] mt-0.5">
                          {item.name} • {item.sector}
                        </div>
                      </div>

                      <div className="text-right flex flex-col items-end">
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`text-sm font-mono font-black ${
                              item.totalScore >= 80 ? 'text-indigo-300' : 'text-slate-300'
                            }`}
                          >
                            {item.totalScore}
                            <span className="text-[10px] text-slate-500">/100</span>
                          </div>
                        </div>
                        <div
                          className={`text-xs font-mono font-bold flex items-center gap-0.5 ${
                            isPositive ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isPositive ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3" />
                          )}
                          <span>
                            {isPositive ? '+' : ''}
                            {item.changePercent.toFixed(2)}%
                          </span>
                        </div>
                        <div className="text-[9px] font-mono text-slate-500">
                          {item.rvol.toFixed(1)}x RVOL
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Stock Deep-Dive Formula Diagnostics (8 Cols) */}
        <div className="lg:col-span-8 space-y-6">
          {currentDiagnostics ? (
            <>
              {/* Selected Stock Hero Card */}
              <div
                className={`p-5 sm:p-6 rounded-2xl border transition-all ${
                  isDark
                    ? 'bg-slate-900/90 border-slate-800 shadow-lg'
                    : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-2xl font-mono font-black text-slate-100 tracking-tight">
                        {currentDiagnostics.symbol}
                      </h3>
                      <span className="text-sm font-mono font-bold text-slate-400">
                        ₹{currentDiagnostics.price.toLocaleString('en-IN')}
                      </span>
                      <span
                        className={`text-xs font-mono font-bold px-2 py-0.5 rounded-md ${
                          currentDiagnostics.changePercent >= 0
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {currentDiagnostics.changePercent >= 0 ? '+' : ''}
                        {currentDiagnostics.changePercent.toFixed(2)}%
                      </span>
                      <span className="text-xs font-mono text-slate-400">
                        {currentDiagnostics.sector}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">
                      {currentDiagnostics.name} • Matching Quant Strategy:{' '}
                      <span className="text-indigo-400 font-bold">
                        {currentDiagnostics.matchingHollyStrategies[0] || 'Holly Grail'}
                      </span>
                    </div>
                  </div>

                  {/* Quick Action CTAs */}
                  <div className="flex items-center gap-2">
                    {onExecuteTrade && currentScannedStock && (
                      <button
                        onClick={() =>
                          onExecuteTrade(
                            currentScannedStock,
                            currentDiagnostics.qualificationStatus === 'QUALIFIED_SHORT'
                              ? 'SELL'
                              : 'BUY'
                          )
                        }
                        className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider flex items-center gap-2 text-white shadow-md transition-all active:scale-95 ${
                          currentDiagnostics.qualificationStatus === 'QUALIFIED_SHORT'
                            ? 'bg-rose-600 hover:bg-rose-500 shadow-rose-600/30'
                            : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/30'
                        }`}
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>
                          Execute {currentDiagnostics.qualificationStatus === 'QUALIFIED_SHORT' ? 'SHORT' : 'BUY'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Score Breakdown Bar */}
                <div className="mt-5 pt-4 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      Holly Composite Score
                    </div>
                    <div className="text-2xl font-mono font-black text-indigo-400">
                      {currentDiagnostics.totalScore}
                      <span className="text-sm text-slate-500 font-normal"> / 100</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full mt-1.5 overflow-hidden">
                      <div
                        className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                        style={{ width: `${currentDiagnostics.totalScore}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      Engineering Grade
                    </div>
                    <div className="text-sm font-mono font-bold text-amber-300 mt-1">
                      {currentDiagnostics.grade}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                      Statistical Conviction
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      Qualification Status
                    </div>
                    <div
                      className={`text-xs font-mono font-bold mt-1 uppercase ${
                        currentDiagnostics.qualificationStatus === 'QUALIFIED_BUY'
                          ? 'text-emerald-400'
                          : currentDiagnostics.qualificationStatus === 'QUALIFIED_SHORT'
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {currentDiagnostics.qualificationStatus.replace('_', ' ')}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                      Threshold: {params.confidenceCutoff} Pts
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] font-mono text-slate-400 uppercase">
                      Signal Debouncer
                    </div>
                    <div className="text-xs font-mono font-bold text-cyan-300 mt-1">
                      {currentDiagnostics.debouncerStatus.isDebounced ? 'ACTIVE LOCK' : 'FRESH DISCOVERY'}
                    </div>
                    <div className="text-[10px] text-slate-500 font-mono mt-1">
                      3-Min Stability Filter
                    </div>
                  </div>
                </div>

                {/* AI Engineering Verdict Narrative */}
                <div
                  className={`mt-4 p-3.5 rounded-xl border text-xs font-mono leading-relaxed ${
                    isDark
                      ? 'bg-slate-950/80 border-indigo-500/20 text-indigo-200'
                      : 'bg-indigo-50/80 border-indigo-200 text-indigo-900'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold uppercase text-[10px] text-indigo-400 mb-1">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Algorithmic Engineering Verdict</span>
                  </div>
                  {currentDiagnostics.aiEngineeringVerdict}
                </div>
              </div>

              {/* Vector Accordion Header Controls */}
              <div className="flex items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span className="text-xs font-mono font-bold text-slate-300 uppercase">
                    Quantitative Vectors & Mathematical Equations (6)
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs font-mono">
                  <button
                    onClick={expandAll}
                    className="text-slate-400 hover:text-slate-200 px-2 py-1 rounded bg-slate-900 border border-slate-800"
                  >
                    Expand All
                  </button>
                  <button
                    onClick={collapseAll}
                    className="text-slate-400 hover:text-slate-200 px-2 py-1 rounded bg-slate-900 border border-slate-800"
                  >
                    Collapse All
                  </button>
                </div>
              </div>

              {/* 6 Quantitative Vectors List */}
              <div className="space-y-4">
                {currentDiagnostics.vectors.map((vector) => {
                  const isOpen = expandedVectors[vector.vectorId];
                  const pct = Math.round((vector.pointsEarned / vector.maxPoints) * 100);

                  return (
                    <div
                      key={vector.vectorId}
                      className={`rounded-2xl border transition-all overflow-hidden ${
                        isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
                      }`}
                    >
                      {/* Vector Header Button */}
                      <button
                        onClick={() => toggleVector(vector.vectorId)}
                        className={`w-full p-4 text-left flex items-center justify-between gap-4 transition-colors ${
                          isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center font-mono font-bold text-xs ${
                              isDark ? 'bg-slate-800 text-indigo-300' : 'bg-slate-100 text-indigo-600'
                            }`}
                          >
                            {vector.vectorId}
                          </div>
                          <div>
                            <div className="font-mono font-bold text-sm text-slate-100">
                              {vector.title}
                            </div>
                            <div className="text-xs text-slate-400 mt-0.5">
                              {vector.subtitle}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <div className="text-sm font-mono font-bold text-indigo-300">
                              {vector.pointsEarned} / {vector.maxPoints} pts
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {pct}% efficiency
                            </div>
                          </div>
                          {isOpen ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                      </button>

                      {/* Vector Content Body */}
                      {isOpen && (
                        <div className="p-4 pt-0 border-t border-slate-800/60 space-y-4 mt-2">
                          {/* Mathematical Equation Card */}
                          <div
                            className={`p-3 rounded-xl border font-mono text-xs ${
                              isDark
                                ? 'bg-slate-950/80 border-slate-800 text-cyan-300'
                                : 'bg-slate-100 border-slate-300 text-slate-800'
                            }`}
                          >
                            <div className="text-[10px] text-slate-500 uppercase font-bold mb-1">
                              Mathematical Formula Equation
                            </div>
                            <code>{vector.formulaEquation}</code>
                          </div>

                          {/* Rule Verification Table */}
                          <div className="space-y-2.5">
                            {vector.rules.map((rule) => (
                              <div
                                key={rule.id}
                                className={`p-3 rounded-xl border text-xs font-mono transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                  rule.passed
                                    ? isDark
                                      ? 'bg-emerald-950/20 border-emerald-500/20'
                                      : 'bg-emerald-50/50 border-emerald-200'
                                    : isDark
                                    ? 'bg-slate-950/60 border-slate-800'
                                    : 'bg-slate-50 border-slate-200'
                                }`}
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    {rule.passed ? (
                                      <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                                    ) : (
                                      <XCircle className="w-4 h-4 text-slate-500 flex-shrink-0" />
                                    )}
                                    <span className="font-bold text-slate-200">
                                      {rule.name}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-400 pl-6">
                                    Requirement: {rule.requirement}
                                  </div>
                                  <div className="text-[10px] text-slate-500 pl-6">
                                    {rule.explanation}
                                  </div>
                                </div>

                                <div className="text-right pl-6 sm:pl-0">
                                  <div
                                    className={`font-bold ${
                                      rule.passed ? 'text-emerald-400' : 'text-slate-400'
                                    }`}
                                  >
                                    {rule.actualValue}
                                  </div>
                                  <div className="text-[10px] text-slate-500 mt-0.5">
                                    +{rule.pointsEarned} / {rule.maxPoints} pts
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Comprehensive Mathematical Architecture Reference Card */}
              <div
                className={`p-5 rounded-2xl border transition-all ${
                  isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center gap-2 mb-3">
                  <Brain className="w-5 h-5 text-purple-400" />
                  <h4 className="font-mono font-bold text-sm text-slate-200 uppercase">
                    Holly AI Multi-Strategy Quant Engineering Architecture
                  </h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono text-slate-400">
                  <div
                    className={`p-3.5 rounded-xl border ${
                      isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-indigo-400 uppercase mb-1">
                      1. Holly Grail (35% Weight)
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Specializes in trend-following pullbacks and narrow CPR breakouts. Uses dynamic trailing ATR stops in Risk-On mode.
                    </p>
                  </div>

                  <div
                    className={`p-3.5 rounded-xl border ${
                      isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-purple-400 uppercase mb-1">
                      2. Holly 2.0 (35% Weight)
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Captures high-velocity Opening Range Breakouts (ORB) and RVOL surges (&gt;2.5x). Fast profit locking on Target 1.
                    </p>
                  </div>

                  <div
                    className={`p-3.5 rounded-xl border ${
                      isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="font-bold text-pink-400 uppercase mb-1">
                      3. Holly Neo (30% Weight)
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      Exploits institutional block absorption traps and extreme mean reversion from 2.5 Bollinger Band stretches back to VWAP.
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-xs font-mono text-slate-500">
              Select a stock from the universe to view full Holly Formula Diagnostics.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
