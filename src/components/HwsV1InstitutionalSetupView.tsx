import React, { useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart2,
  Brain,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Download,
  Eye,
  FileCode,
  Filter,
  Flame,
  Layers,
  Percent,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { ScannedStock } from '../types';
import {
  HwsV1StrategyResult,
  generateHwsV1PineScript,
  generateHwsV1PythonScannerCode,
  evaluateHwsV1InstitutionalSetup,
} from '../utils/hwsV1Strategy';

interface HwsV1InstitutionalSetupViewProps {
  stocks: ScannedStock[];
  selectedSymbol?: string;
  onSelectStock?: (stock: ScannedStock) => void;
  onExecuteTrade?: (stock: ScannedStock, signal: 'BUY' | 'SELL') => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const HwsV1InstitutionalSetupView: React.FC<HwsV1InstitutionalSetupViewProps> = ({
  stocks,
  selectedSymbol,
  onSelectStock,
  onExecuteTrade,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';

  // Filters & State
  const [filterMode, setFilterMode] = useState<'ALL' | 'QUALIFIED' | 'APEX_A_PLUS' | 'BLOCKED' | 'BUY_ONLY' | 'SELL_ONLY'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeCodeTab, setActiveCodeTab] = useState<'PINE' | 'PYTHON' | 'MONTE_CARLO'>('PINE');
  const [showCodeModal, setShowCodeModal] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [activePipelineTab, setActivePipelineTab] = useState<number>(7); // Default to V7 Composite Score

  // Ensure every stock has an evaluated HwsV1 result
  const enrichedStocks = useMemo(() => {
    return stocks.map((stk) => {
      if (stk.hwsV1) return stk;
      const res = evaluateHwsV1InstitutionalSetup(
        stk.symbol,
        [
          {
            time: new Date().toISOString(),
            open: stk.indicators?.open || stk.price * 0.995,
            high: stk.indicators?.high || stk.price * 1.008,
            low: stk.indicators?.low || stk.price * 0.992,
            close: stk.price,
            volume: stk.volume || 100000,
          },
        ],
        stk.indicators?.sectorState === 'BULLISH',
        stk.oiData,
        stk.greeks,
        stk.indicators?.pdh,
        stk.indicators?.pdl
      );
      return { ...stk, hwsV1: res };
    });
  }, [stocks]);

  // Active Selected Stock
  const [selectedSymbolState, setSelectedSymbolState] = useState<string>(
    selectedSymbol || (enrichedStocks.length > 0 ? enrichedStocks[0].symbol : 'NIFTY')
  );

  const activeStock = useMemo(() => {
    return enrichedStocks.find((s) => s.symbol === selectedSymbolState) || enrichedStocks[0] || null;
  }, [enrichedStocks, selectedSymbolState]);

  const activeHws: HwsV1StrategyResult | null = activeStock?.hwsV1 || null;

  // Filtered stocks
  const filteredStocks = useMemo(() => {
    return enrichedStocks.filter((stk) => {
      const hws = stk.hwsV1 as HwsV1StrategyResult | undefined;
      const matchesSearch =
        stk.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        stk.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        stk.sector.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (filterMode === 'QUALIFIED') return hws?.scoreCard.isQualified && !hws?.noTradeFilter.isBlocked;
      if (filterMode === 'APEX_A_PLUS') return hws?.scoreCard.grade === 'A+' && !hws?.noTradeFilter.isBlocked;
      if (filterMode === 'BLOCKED') return hws?.noTradeFilter.isBlocked;
      if (filterMode === 'BUY_ONLY') return hws?.scoreCard.signal === 'BUY' && !hws?.noTradeFilter.isBlocked;
      if (filterMode === 'SELL_ONLY') return hws?.scoreCard.signal === 'SELL' && !hws?.noTradeFilter.isBlocked;

      return true;
    });
  }, [enrichedStocks, searchQuery, filterMode]);

  // Aggregate Strategy Metrics
  const stats = useMemo(() => {
    let qualifiedCount = 0;
    let apexCount = 0;
    let blockedCount = 0;
    let buyCount = 0;
    let sellCount = 0;
    let highestScore = 0;
    let topStockSymbol = '';

    enrichedStocks.forEach((stk) => {
      const hws = stk.hwsV1 as HwsV1StrategyResult | undefined;
      if (!hws) return;
      if (hws.scoreCard.isQualified && !hws.noTradeFilter.isBlocked) {
        qualifiedCount++;
        if (hws.scoreCard.grade === 'A+') apexCount++;
        if (hws.scoreCard.signal === 'BUY') buyCount++;
        if (hws.scoreCard.signal === 'SELL') sellCount++;
      }
      if (hws.noTradeFilter.isBlocked) blockedCount++;
      if (hws.scoreCard.totalScore > highestScore) {
        highestScore = hws.scoreCard.totalScore;
        topStockSymbol = stk.symbol;
      }
    });

    return {
      totalScanned: enrichedStocks.length,
      qualifiedCount,
      apexCount,
      blockedCount,
      buyCount,
      sellCount,
      highestScore,
      topStockSymbol,
    };
  }, [enrichedStocks]);

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleDownloadCode = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`space-y-6 ${isDark ? 'text-slate-100' : 'text-slate-900'}`}>
      {/* -------------------------------------------------------------------- */}
      {/* HERO STRATEGY BANNER & KPI STATS                                     */}
      {/* -------------------------------------------------------------------- */}
      <div
        className={`p-5 sm:p-6 rounded-2xl border relative overflow-hidden transition-all shadow-xl ${
          isDark
            ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950/70 border-indigo-500/30'
            : 'bg-gradient-to-br from-white via-indigo-50/40 to-emerald-50/40 border-indigo-200'
        }`}
      >
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-1 text-xs font-black tracking-widest uppercase rounded-md bg-gradient-to-r from-emerald-500 via-teal-500 to-indigo-600 text-slate-950 shadow-md">
                100-POINT SCORING
              </span>
              <span
                className={`px-2.5 py-1 text-xs font-mono font-bold rounded-md border ${
                  isDark ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                }`}
              >
                15M BIAS • 5M ENTRY • 1M/5M EXECUTION
              </span>
              <span
                className={`px-2.5 py-1 text-xs font-mono font-bold rounded-md border ${
                  isDark ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}
              >
                V1 → V9 QUANTITATIVE PIPELINE
              </span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black tracking-tight flex items-center gap-2">
              <span>HWS-V1: High-Confidence Institutional Setup</span>
            </h2>
            <p className="text-xs sm:text-sm opacity-75 max-w-4xl font-sans">
              Precision quantitative architecture combining 5 institutional pillars: <strong>Market Regime (20 pts)</strong>,{' '}
              <strong>Order Flow &amp; CVD (25 pts)</strong>, <strong>Options OI &amp; Strike Unwinding (25 pts)</strong>,{' '}
              <strong>Wyckoff &amp; SMC (20 pts)</strong>, and <strong>Hard Execution Filters (10 pts)</strong>. Backed by strict
              No-Trade Filter Guards and Dynamic Multi-Tier Target Management (1.0R / 2.0R / 3.0R).
            </p>
          </div>

          {/* Quick Action Code Modal Triggers */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => {
                setActiveCodeTab('PINE');
                setShowCodeModal(true);
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md hover:from-indigo-500 hover:to-purple-500 transition-all cursor-pointer"
            >
              <FileCode className="w-4 h-4" />
              <span>Pine Script v5</span>
            </button>
            <button
              onClick={() => {
                setActiveCodeTab('PYTHON');
                setShowCodeModal(true);
              }}
              className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 text-slate-950 font-black shadow-md hover:from-emerald-500 hover:to-teal-500 transition-all cursor-pointer"
            >
              <Code2 className="w-4 h-4 text-slate-950" />
              <span>Python Live Scanner</span>
            </button>
          </div>
        </div>

        {/* 5-Metric Quick Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-6 pt-5 border-t border-slate-700/40">
          <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white/80 border-slate-200'}`}>
            <span className="text-[10px] font-mono uppercase opacity-60">Scanned Universe</span>
            <div className="text-lg sm:text-xl font-mono font-black">{stats.totalScanned} Instruments</div>
            <span className="text-[10px] opacity-70">NIFTY 200 / F&amp;O</span>
          </div>

          <div className={`p-3 rounded-xl border ${isDark ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-emerald-50/60 border-emerald-200'}`}>
            <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold">Apex A+ Qualified</span>
            <div className="text-lg sm:text-xl font-mono font-black text-emerald-400">{stats.apexCount} Setups</div>
            <span className="text-[10px] text-emerald-400/80">Score ≥ 90 / 100</span>
          </div>

          <div className={`p-3 rounded-xl border ${isDark ? 'bg-teal-950/20 border-teal-500/30' : 'bg-teal-50/60 border-teal-200'}`}>
            <span className="text-[10px] font-mono uppercase text-teal-400 font-bold">Grade A Qualified</span>
            <div className="text-lg sm:text-xl font-mono font-black text-teal-400">{stats.qualifiedCount} Setups</div>
            <span className="text-[10px] text-teal-400/80">Score ≥ 80 / 100</span>
          </div>

          <div className={`p-3 rounded-xl border ${isDark ? 'bg-rose-950/20 border-rose-500/30' : 'bg-rose-50/60 border-rose-200'}`}>
            <span className="text-[10px] font-mono uppercase text-rose-400 font-bold">No-Trade Guard Blocked</span>
            <div className="text-lg sm:text-xl font-mono font-black text-rose-400">{stats.blockedCount} Blocked</div>
            <span className="text-[10px] text-rose-400/80">Chop / Divergence</span>
          </div>

          <div className={`p-3 rounded-xl border ${isDark ? 'bg-indigo-950/20 border-indigo-500/30' : 'bg-indigo-50/60 border-indigo-200'}`}>
            <span className="text-[10px] font-mono uppercase text-indigo-400 font-bold">Directional Bias</span>
            <div className="text-lg sm:text-xl font-mono font-black text-indigo-300">
              {stats.buyCount} BUY <span className="text-xs font-normal opacity-60">/ {stats.sellCount} SELL</span>
            </div>
            <span className="text-[10px] text-indigo-400/80">Active Executable</span>
          </div>

          <div className={`p-3 rounded-xl border ${isDark ? 'bg-amber-950/20 border-amber-500/30' : 'bg-amber-50/60 border-amber-200'}`}>
            <span className="text-[10px] font-mono uppercase text-amber-400 font-bold">Top Scoring Asset</span>
            <div className="text-lg sm:text-xl font-mono font-black text-amber-400">{stats.topStockSymbol || 'NIFTY'}</div>
            <span className="text-[10px] text-amber-400/80">{stats.highestScore}/100 Pts</span>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* FILTER & SEARCH BAR                                                  */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
          <button
            onClick={() => setFilterMode('ALL')}
            className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg border transition-all ${
              filterMode === 'ALL'
                ? isDark
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                  : 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                : isDark
                ? 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900'
            }`}
          >
            ALL SCANNED ({enrichedStocks.length})
          </button>
          <button
            onClick={() => setFilterMode('QUALIFIED')}
            className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg border transition-all flex items-center gap-1.5 ${
              filterMode === 'QUALIFIED'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                : isDark
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>QUALIFIED (≥80) ({stats.qualifiedCount})</span>
          </button>
          <button
            onClick={() => setFilterMode('APEX_A_PLUS')}
            className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg border transition-all flex items-center gap-1.5 ${
              filterMode === 'APEX_A_PLUS'
                ? 'bg-teal-600 text-white border-teal-500 shadow-md'
                : isDark
                ? 'bg-teal-500/10 border-teal-500/30 text-teal-400 hover:bg-teal-500/20'
                : 'bg-teal-50 border-teal-200 text-teal-700 hover:bg-teal-100'
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            <span>APEX A+ (≥90) ({stats.apexCount})</span>
          </button>
          <button
            onClick={() => setFilterMode('BLOCKED')}
            className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg border transition-all flex items-center gap-1.5 ${
              filterMode === 'BLOCKED'
                ? 'bg-rose-600 text-white border-rose-500 shadow-md'
                : isDark
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20'
                : 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>NO-TRADE VETO ({stats.blockedCount})</span>
          </button>
          <button
            onClick={() => setFilterMode('BUY_ONLY')}
            className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg border transition-all ${
              filterMode === 'BUY_ONLY'
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                : isDark
                ? 'bg-slate-900 border-slate-800 text-emerald-400'
                : 'bg-white border-slate-200 text-emerald-700'
            }`}
          >
            BUY ONLY ({stats.buyCount})
          </button>
          <button
            onClick={() => setFilterMode('SELL_ONLY')}
            className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg border transition-all ${
              filterMode === 'SELL_ONLY'
                ? 'bg-rose-600 text-white border-rose-500 shadow-md'
                : isDark
                ? 'bg-slate-900 border-slate-800 text-rose-400'
                : 'bg-white border-slate-200 text-rose-700'
            }`}
          >
            SELL ONLY ({stats.sellCount})
          </button>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search symbol, sector..."
            className={`w-full pl-9 pr-3 py-1.5 text-xs font-mono rounded-lg border focus:outline-none focus:ring-2 focus:ring-indigo-500/50 ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
            }`}
          />
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* TWO-COLUMN LAYOUT: SCANNER LIST + DEEP-DIVE COCKPIT                   */}
      {/* -------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: LIVE SCANNER LIST (4 COLS) */}
        <div className="lg:col-span-4 space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-mono font-bold uppercase opacity-75">
              Live Scanned Stocks ({filteredStocks.length})
            </span>
            <span className="text-[10px] font-mono opacity-50">Select to inspect</span>
          </div>

          <div className="space-y-2 max-h-[820px] overflow-y-auto pr-1 custom-scrollbar">
            {filteredStocks.map((stk) => {
              const hws = stk.hwsV1 as HwsV1StrategyResult | undefined;
              const isSelected = stk.symbol === selectedSymbolState;
              const isQualified = hws?.scoreCard.isQualified && !hws?.noTradeFilter.isBlocked;
              const isApex = hws?.scoreCard.grade === 'A+';
              const isBlocked = hws?.noTradeFilter.isBlocked;

              return (
                <div
                  key={stk.symbol}
                  onClick={() => {
                    setSelectedSymbolState(stk.symbol);
                    if (onSelectStock) onSelectStock(stk);
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer relative overflow-hidden ${
                    isSelected
                      ? isDark
                        ? 'bg-indigo-950/60 border-indigo-500 shadow-lg shadow-indigo-500/20 ring-1 ring-indigo-500'
                        : 'bg-indigo-50 border-indigo-400 shadow-md ring-1 ring-indigo-400'
                      : isDark
                      ? 'bg-slate-900/80 border-slate-800/80 hover:bg-slate-800/70 hover:border-slate-700'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm">{stk.symbol}</span>
                        <span className="text-[10px] opacity-60 font-sans">{stk.sector}</span>
                      </div>
                      <div className="text-xs font-mono font-bold text-slate-300">
                        ₹{stk.price.toFixed(2)}{' '}
                        <span className={`text-[10px] ${stk.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          ({stk.changePercent >= 0 ? '+' : ''}
                          {stk.changePercent.toFixed(2)}%)
                        </span>
                      </div>
                    </div>

                    {/* Score Badge */}
                    <div className="text-right">
                      <div
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-black shadow-sm ${
                          isApex
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950'
                            : isQualified
                            ? 'bg-emerald-600 text-white'
                            : isBlocked
                            ? 'bg-rose-600/80 text-white'
                            : isDark
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        <span>{hws?.scoreCard.totalScore || stk.aiScore}/100</span>
                        <span className="text-[10px] font-bold">[{hws?.scoreCard.grade || 'C'}]</span>
                      </div>
                      <div className="text-[10px] font-mono mt-0.5 opacity-70">
                        {isBlocked ? (
                          <span className="text-rose-400 font-bold">NO-TRADE VETO</span>
                        ) : (
                          <span className={hws?.scoreCard.signal === 'BUY' ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                            {hws?.scoreCard.signal} SETUP
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 5-Pillar Score Progress Bars */}
                  {hws && (
                    <div className="mt-3 grid grid-cols-5 gap-1 text-[9px] font-mono text-center pt-2 border-t border-slate-700/30">
                      <div>
                        <span className="opacity-50 block">REG</span>
                        <span className="font-bold text-indigo-400">{hws.scoreCard.regimeScore}/20</span>
                      </div>
                      <div>
                        <span className="opacity-50 block">FLOW</span>
                        <span className="font-bold text-teal-400">{hws.scoreCard.orderFlowScore}/25</span>
                      </div>
                      <div>
                        <span className="opacity-50 block">OI</span>
                        <span className="font-bold text-amber-400">{hws.scoreCard.optionsOiScore}/25</span>
                      </div>
                      <div>
                        <span className="opacity-50 block">WYCK</span>
                        <span className="font-bold text-purple-400">{hws.scoreCard.wyckoffScore}/20</span>
                      </div>
                      <div>
                        <span className="opacity-50 block">GATE</span>
                        <span className="font-bold text-emerald-400">{hws.scoreCard.entryFilterScore}/10</span>
                      </div>
                    </div>
                  )}

                  {/* Quick indicators summary */}
                  <div className="mt-2 flex items-center justify-between text-[10px] font-mono opacity-70">
                    <span>RVOL: {stk.indicators?.rvol?.toFixed(2) || 1.2}x</span>
                    <span>ADX: {stk.indicators?.adx?.toFixed(1) || 22}</span>
                    <span>PCR: {stk.indicators?.pcr?.toFixed(2) || 1.0}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT COLUMN: DEEP-DIVE COCKPIT (8 COLS) */}
        <div className="lg:col-span-8 space-y-6">
          {activeStock && activeHws ? (
            <>
              {/* ASSET HEADER CARD */}
              <div
                className={`p-5 rounded-2xl border transition-all ${
                  isDark ? 'bg-slate-900/90 border-slate-800 shadow-xl' : 'bg-white border-slate-200 shadow-lg'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-2xl font-black font-mono tracking-tight">{activeStock.symbol}</h3>
                      <span
                        className={`px-2.5 py-0.5 text-xs font-mono font-bold rounded border ${
                          isDark ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        }`}
                      >
                        {activeStock.sector}
                      </span>
                      <span
                        className={`px-2.5 py-0.5 text-xs font-mono font-black rounded ${
                          activeHws.scoreCard.grade === 'A+'
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-slate-950'
                            : activeHws.scoreCard.grade === 'A'
                            ? 'bg-emerald-600 text-white'
                            : activeHws.noTradeFilter.isBlocked
                            ? 'bg-rose-600 text-white'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        GRADE {activeHws.scoreCard.grade} ({activeHws.scoreCard.totalScore}/100)
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-sm font-mono">
                      <span className="text-xl font-bold">₹{activeStock.price.toFixed(2)}</span>
                      <span
                        className={`font-bold ${
                          activeStock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {activeStock.changePercent >= 0 ? '+' : ''}
                        {activeStock.changePercent.toFixed(2)}%
                      </span>
                      <span className="text-xs opacity-60">| Lot: {activeStock.lotSize || 250}</span>
                    </div>
                  </div>

                  {/* 1-Click Order Execution */}
                  <div className="flex items-center gap-2">
                    {onExecuteTrade && (
                      <button
                        onClick={() => onExecuteTrade(activeStock, activeHws.scoreCard.signal === 'SELL' ? 'SELL' : 'BUY')}
                        disabled={activeHws.noTradeFilter.isBlocked}
                        className={`px-4 py-2.5 rounded-xl font-mono text-xs font-black shadow-lg transition-all flex items-center gap-2 ${
                          activeHws.noTradeFilter.isBlocked
                            ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
                            : activeHws.scoreCard.signal === 'BUY'
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 hover:from-emerald-400 hover:to-teal-500 shadow-emerald-500/20'
                            : 'bg-gradient-to-r from-rose-600 to-red-600 text-white hover:from-rose-500 hover:to-red-500 shadow-rose-500/20'
                        }`}
                      >
                        <Zap className="w-4 h-4 fill-current" />
                        <span>
                          {activeHws.noTradeFilter.isBlocked
                            ? 'EXECUTION BLOCKED'
                            : `EXECUTE ${activeHws.scoreCard.signal} SETUP (1-CLICK)`}
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Verdict Summary Bar */}
                <div
                  className={`mt-4 p-3 rounded-xl border text-xs font-mono ${
                    activeHws.noTradeFilter.isBlocked
                      ? isDark
                        ? 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                      : isDark
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  }`}
                >
                  <div className="font-bold flex items-center gap-2">
                    {activeHws.noTradeFilter.isBlocked ? (
                      <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    )}
                    <span>{activeHws.summaryVerdict}</span>
                  </div>
                </div>
              </div>

              {/* -------------------------------------------------------------- */}
              {/* 🎯 STRUCTURAL DYNAMIC RISK & MULTI-TIER TARGETS LADDER           */}
              {/* -------------------------------------------------------------- */}
              <div
                className={`p-5 rounded-2xl border transition-all ${
                  isDark ? 'bg-slate-900/90 border-slate-800 shadow-xl' : 'bg-white border-slate-200 shadow-lg'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-indigo-400" />
                    <h4 className="font-mono font-black text-sm uppercase tracking-wide">
                      Structural Risk &amp; Multi-Tier Profit Targets
                    </h4>
                  </div>
                  <span className="text-xs font-mono px-2 py-0.5 bg-indigo-500/10 text-indigo-300 rounded border border-indigo-500/20">
                    SL = Swing Low/High ± 0.25 × ATR(14)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Entry */}
                  <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <span className="text-[10px] font-mono uppercase opacity-60">Entry Trigger</span>
                    <div className="text-lg font-mono font-black text-slate-100">₹{activeHws.riskLadder.entryPrice.toFixed(2)}</div>
                    <span className="text-[10px] opacity-70">Market / Limit IOC</span>
                  </div>

                  {/* Stop Loss */}
                  <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-rose-950/20 border-rose-500/30' : 'bg-rose-50 border-rose-200'}`}>
                    <span className="text-[10px] font-mono uppercase text-rose-400 font-bold">Structural Stop Loss</span>
                    <div className="text-lg font-mono font-black text-rose-400">₹{activeHws.riskLadder.structuralSL.toFixed(2)}</div>
                    <span className="text-[10px] text-rose-400/80">
                      Risk: ₹{activeHws.riskLadder.slDistance.toFixed(2)} / share
                    </span>
                  </div>

                  {/* Target 1 */}
                  <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'}`}>
                    <span className="text-[10px] font-mono uppercase text-emerald-400 font-bold">Target 1 (1.0R)</span>
                    <div className="text-lg font-mono font-black text-emerald-400">₹{activeHws.riskLadder.target1_1R.toFixed(2)}</div>
                    <span className="text-[10px] text-emerald-400/80">Action: SL → Breakeven</span>
                  </div>

                  {/* Target 2 & 3 */}
                  <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-teal-950/20 border-teal-500/30' : 'bg-teal-50 border-teal-200'}`}>
                    <span className="text-[10px] font-mono uppercase text-teal-400 font-bold">Target 2 (2.0R) &amp; T3 (3.0R)</span>
                    <div className="text-lg font-mono font-black text-teal-400">
                      ₹{activeHws.riskLadder.target2_2R.toFixed(2)}{' '}
                      <span className="text-xs opacity-70 font-normal">| T3: ₹{activeHws.riskLadder.target3_3R.toFixed(2)}</span>
                    </div>
                    <span className="text-[10px] text-teal-400/80">1:2 R:R Guaranteed Pass</span>
                  </div>
                </div>

                <div className="mt-3 p-2.5 rounded-lg bg-slate-950/50 border border-slate-800 text-[11px] font-mono opacity-80">
                  <strong>Trade Management Protocol:</strong> {activeHws.riskLadder.trailingManagementRule}
                </div>
              </div>

              {/* -------------------------------------------------------------- */}
              {/* 🚫 STRICT NO-TRADE FILTER GUARD STATUS PANEL                     */}
              {/* -------------------------------------------------------------- */}
              <div
                className={`p-5 rounded-2xl border transition-all ${
                  activeHws.noTradeFilter.isBlocked
                    ? isDark
                      ? 'bg-rose-950/20 border-rose-500/40 shadow-xl'
                      : 'bg-rose-50/70 border-rose-200 shadow-md'
                    : isDark
                    ? 'bg-emerald-950/20 border-emerald-500/40 shadow-xl'
                    : 'bg-emerald-50/70 border-emerald-200 shadow-md'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className={`w-5 h-5 ${activeHws.noTradeFilter.isBlocked ? 'text-rose-400' : 'text-emerald-400'}`} />
                    <h4 className="font-mono font-black text-sm uppercase tracking-wide">
                      Strict No-Trade Filter Guard (Loss Prevention System)
                    </h4>
                  </div>
                  <span
                    className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                      activeHws.noTradeFilter.isBlocked
                        ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    }`}
                  >
                    {activeHws.noTradeFilter.passedCount} / {activeHws.noTradeFilter.totalChecks} CHECKS PASSED
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5 mt-3">
                  <div
                    className={`p-2.5 rounded-lg border text-xs font-mono flex items-center justify-between ${
                      activeHws.noTradeFilter.checks.scorePassed
                        ? isDark
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : isDark
                        ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    <span>1. Score ≥ 80 Pts</span>
                    {activeHws.noTradeFilter.checks.scorePassed ? <Check className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                  </div>

                  <div
                    className={`p-2.5 rounded-lg border text-xs font-mono flex items-center justify-between ${
                      activeHws.noTradeFilter.checks.cvdDivergencePassed
                        ? isDark
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : isDark
                        ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    <span>2. CVD &amp; Price Sync</span>
                    {activeHws.noTradeFilter.checks.cvdDivergencePassed ? <Check className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                  </div>

                  <div
                    className={`p-2.5 rounded-lg border text-xs font-mono flex items-center justify-between ${
                      activeHws.noTradeFilter.checks.volumeAdequacyPassed
                        ? isDark
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : isDark
                        ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    <span>3. RVOL ≥ 1.2x Baseline</span>
                    {activeHws.noTradeFilter.checks.volumeAdequacyPassed ? <Check className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                  </div>

                  <div
                    className={`p-2.5 rounded-lg border text-xs font-mono flex items-center justify-between ${
                      activeHws.noTradeFilter.checks.adxTrendingPassed
                        ? isDark
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : isDark
                        ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    <span>4. ADX ≥ 18 (No Chop)</span>
                    {activeHws.noTradeFilter.checks.adxTrendingPassed ? <Check className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                  </div>

                  <div
                    className={`p-2.5 rounded-lg border text-xs font-mono flex items-center justify-between ${
                      activeHws.noTradeFilter.checks.vwapTrapPassed
                        ? isDark
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : isDark
                        ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    <span>5. Clear of VWAP Trap</span>
                    {activeHws.noTradeFilter.checks.vwapTrapPassed ? <Check className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                  </div>

                  <div
                    className={`p-2.5 rounded-lg border text-xs font-mono flex items-center justify-between ${
                      activeHws.noTradeFilter.checks.barrierFreePassed
                        ? isDark
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : isDark
                        ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    <span>6. Runway &gt; 0.5R Free</span>
                    {activeHws.noTradeFilter.checks.barrierFreePassed ? <Check className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                  </div>

                  <div
                    className={`p-2.5 rounded-lg border text-xs font-mono flex items-center justify-between ${
                      activeHws.noTradeFilter.checks.oiAlignmentPassed
                        ? isDark
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : isDark
                        ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    <span>7. Options OI Harmony</span>
                    {activeHws.noTradeFilter.checks.oiAlignmentPassed ? <Check className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                  </div>

                  <div
                    className={`p-2.5 rounded-lg border text-xs font-mono flex items-center justify-between ${
                      activeHws.noTradeFilter.checks.riskRewardPassed
                        ? isDark
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                          : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : isDark
                        ? 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    <span>8. Risk/Reward ≥ 1:2</span>
                    {activeHws.noTradeFilter.checks.riskRewardPassed ? <Check className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-rose-400" />}
                  </div>
                </div>

                {activeHws.noTradeFilter.isBlocked && (
                  <div className="mt-3 p-3 rounded-xl bg-rose-950/40 border border-rose-500/50 text-xs font-mono text-rose-300">
                    <strong>Veto Causes:</strong>
                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                      {activeHws.noTradeFilter.blockedReasons.map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* -------------------------------------------------------------- */}
              {/* 100-POINT 5-PILLAR DETAILED SCORE MATRIX                       */}
              {/* -------------------------------------------------------------- */}
              <div
                className={`p-5 rounded-2xl border transition-all ${
                  isDark ? 'bg-slate-900/90 border-slate-800 shadow-xl' : 'bg-white border-slate-200 shadow-lg'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BarChart2 className="w-5 h-5 text-emerald-400" />
                    <h4 className="font-mono font-black text-sm uppercase tracking-wide">
                      100-Point 5-Pillar Score Breakdown
                    </h4>
                  </div>
                  <div className="text-xs font-mono font-bold text-emerald-400">
                    Total: {activeHws.scoreCard.totalScore} / 100 Pts
                  </div>
                </div>

                {/* 5 Pillar Subcards */}
                <div className="space-y-4">
                  {/* Pillar 1: Market Regime (20 Pts) */}
                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-mono font-bold text-xs">
                          1
                        </span>
                        <h5 className="font-mono font-bold text-xs uppercase">Market Regime (20 Points)</h5>
                      </div>
                      <span className="font-mono font-black text-xs text-indigo-400">
                        {activeHws.scoreCard.regimeScore} / 20 PTS
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                      {activeHws.scoreCard.items
                        .filter((i) => i.pillar === 'REGIME')
                        .map((item) => (
                          <div
                            key={item.id}
                            className={`p-2.5 rounded-lg border text-xs font-mono ${
                              item.achieved
                                ? isDark
                                  ? 'bg-slate-900 border-indigo-500/30'
                                  : 'bg-white border-indigo-200'
                                : isDark
                                ? 'bg-slate-900/40 border-slate-800 opacity-60'
                                : 'bg-slate-100 border-slate-200 opacity-60'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold">{item.name}</span>
                              <span className="text-indigo-400 font-bold">+{item.points} pts</span>
                            </div>
                            <div className="text-[10px] opacity-70 mt-1">{item.notes}</div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Pillar 2: Order Flow & CVD (25 Pts) */}
                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-teal-500/20 text-teal-400 flex items-center justify-center font-mono font-bold text-xs">
                          2
                        </span>
                        <h5 className="font-mono font-bold text-xs uppercase">Order Flow &amp; CVD (25 Points)</h5>
                      </div>
                      <span className="font-mono font-black text-xs text-teal-400">
                        {activeHws.scoreCard.orderFlowScore} / 25 PTS
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                      {activeHws.scoreCard.items
                        .filter((i) => i.pillar === 'ORDER_FLOW')
                        .map((item) => (
                          <div
                            key={item.id}
                            className={`p-2.5 rounded-lg border text-xs font-mono ${
                              item.achieved
                                ? isDark
                                  ? 'bg-slate-900 border-teal-500/30'
                                  : 'bg-white border-teal-200'
                                : isDark
                                ? 'bg-slate-900/40 border-slate-800 opacity-60'
                                : 'bg-slate-100 border-slate-200 opacity-60'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold">{item.name}</span>
                              <span className="text-teal-400 font-bold">+{item.points} pts</span>
                            </div>
                            <div className="text-[10px] opacity-70 mt-1">{item.notes}</div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Pillar 3: Options OI (25 Pts) */}
                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-amber-500/20 text-amber-400 flex items-center justify-center font-mono font-bold text-xs">
                          3
                        </span>
                        <h5 className="font-mono font-bold text-xs uppercase">Options OI &amp; Strike Unwinding (25 Points)</h5>
                      </div>
                      <span className="font-mono font-black text-xs text-amber-400">
                        {activeHws.scoreCard.optionsOiScore} / 25 PTS
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                      {activeHws.scoreCard.items
                        .filter((i) => i.pillar === 'OPTIONS_OI')
                        .map((item) => (
                          <div
                            key={item.id}
                            className={`p-2.5 rounded-lg border text-xs font-mono ${
                              item.achieved
                                ? isDark
                                  ? 'bg-slate-900 border-amber-500/30'
                                  : 'bg-white border-amber-200'
                                : isDark
                                ? 'bg-slate-900/40 border-slate-800 opacity-60'
                                : 'bg-slate-100 border-slate-200 opacity-60'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold">{item.name}</span>
                              <span className="text-amber-400 font-bold">+{item.points} pts</span>
                            </div>
                            <div className="text-[10px] opacity-70 mt-1">{item.notes}</div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Pillar 4: Wyckoff & SMC (20 Pts) */}
                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-purple-500/20 text-purple-400 flex items-center justify-center font-mono font-bold text-xs">
                          4
                        </span>
                        <h5 className="font-mono font-bold text-xs uppercase">Wyckoff &amp; Smart Money Concepts (20 Points)</h5>
                      </div>
                      <span className="font-mono font-black text-xs text-purple-400">
                        {activeHws.scoreCard.wyckoffScore} / 20 PTS
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-2">
                      {activeHws.scoreCard.items
                        .filter((i) => i.pillar === 'WYCKOFF_SMC')
                        .map((item) => (
                          <div
                            key={item.id}
                            className={`p-2.5 rounded-lg border text-xs font-mono ${
                              item.achieved
                                ? isDark
                                  ? 'bg-slate-900 border-purple-500/30'
                                  : 'bg-white border-purple-200'
                                : isDark
                                ? 'bg-slate-900/40 border-slate-800 opacity-60'
                                : 'bg-slate-100 border-slate-200 opacity-60'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold">{item.name}</span>
                              <span className="text-purple-400 font-bold">+{item.points} pts</span>
                            </div>
                            <div className="text-[10px] opacity-70 mt-1">{item.notes}</div>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Pillar 5: Execution Filter Guard (10 Pts) */}
                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-mono font-bold text-xs">
                          5
                        </span>
                        <h5 className="font-mono font-bold text-xs uppercase">Entry Filter &amp; Execution Guard (10 Points)</h5>
                      </div>
                      <span className="font-mono font-black text-xs text-emerald-400">
                        {activeHws.scoreCard.entryFilterScore} / 10 PTS
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                      {activeHws.scoreCard.items
                        .filter((i) => i.pillar === 'ENTRY_FILTER')
                        .map((item) => (
                          <div
                            key={item.id}
                            className={`p-2.5 rounded-lg border text-xs font-mono ${
                              item.achieved
                                ? isDark
                                  ? 'bg-slate-900 border-emerald-500/30'
                                  : 'bg-white border-emerald-200'
                                : isDark
                                ? 'bg-slate-900/40 border-slate-800 opacity-60'
                                : 'bg-slate-100 border-slate-200 opacity-60'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold">{item.name}</span>
                              <span className="text-emerald-400 font-bold">+{item.points} pts</span>
                            </div>
                            <div className="text-[10px] opacity-70 mt-1">{item.notes}</div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* -------------------------------------------------------------- */}
              {/* ⭐ COMPLETE V1 → V9 QUANTITATIVE PIPELINE INTERACTIVE ENGINE    */}
              {/* -------------------------------------------------------------- */}
              <div
                className={`p-5 rounded-2xl border transition-all ${
                  isDark ? 'bg-slate-900/90 border-slate-800 shadow-xl' : 'bg-white border-slate-200 shadow-lg'
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-teal-400" />
                    <h4 className="font-mono font-black text-sm uppercase tracking-wide">
                      V1 → V9 Quantitative Architecture Navigator
                    </h4>
                  </div>
                  <span className="text-xs font-mono opacity-60">Full Quantitative Progression</span>
                </div>

                {/* V1 to V9 Tabs */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-2 custom-scrollbar">
                  {[
                    { id: 1, label: 'V1 Technical', desc: 'EMA/VWAP/ADX' },
                    { id: 2, label: 'V2 Volume', desc: 'RVOL Surge' },
                    { id: 3, label: 'V3 Order Flow', desc: 'Delta + CVD' },
                    { id: 4, label: 'V4 Greeks', desc: 'Gamma + IV' },
                    { id: 5, label: 'V5 Options OI', desc: 'Strikes + PCR' },
                    { id: 6, label: 'V6 Wyckoff', desc: 'Spring + BOS' },
                    { id: 7, label: 'V7 Scoring', desc: '100-Pt Score' },
                    { id: 8, label: 'V8 Backtest', desc: 'Monte Carlo' },
                    { id: 9, label: 'V9 Live Scanner', desc: 'Python Engine' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setActivePipelineTab(tab.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-mono font-bold shrink-0 border transition-all ${
                        activePipelineTab === tab.id
                          ? 'bg-gradient-to-r from-teal-500 to-indigo-600 text-white border-teal-400 shadow-md font-black'
                          : isDark
                          ? 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                          : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <div>{tab.label}</div>
                      <div className="text-[9px] opacity-70 font-normal">{tab.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Pipeline Tab Content */}
                <div className="mt-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-xs font-mono">
                  {activePipelineTab === 1 && (
                    <div className="space-y-2">
                      <div className="text-teal-400 font-bold text-sm">V1: Multi-Timeframe Technical Foundation</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                        <div>
                          <span className="opacity-60 block">EMA 13 / 21 / 34</span>
                          <span className="font-bold">
                            ₹{activeHws.pipeline.v1Technical.ema13} / ₹{activeHws.pipeline.v1Technical.ema21} / ₹
                            {activeHws.pipeline.v1Technical.ema34}
                          </span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Intraday VWAP</span>
                          <span className="font-bold">₹{activeHws.pipeline.v1Technical.vwap}</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">ADX (14)</span>
                          <span className="font-bold">{activeHws.pipeline.v1Technical.adx}</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">ATR (14) Volatility</span>
                          <span className="font-bold">₹{activeHws.pipeline.v1Technical.atr}</span>
                        </div>
                      </div>
                      <p className="opacity-75 pt-2">Status: {activeHws.pipeline.v1Technical.status}</p>
                    </div>
                  )}

                  {activePipelineTab === 2 && (
                    <div className="space-y-2">
                      <div className="text-teal-400 font-bold text-sm">V2: Relative Volume (RVOL) &amp; Expansion</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                        <div>
                          <span className="opacity-60 block">Current Bar Volume</span>
                          <span className="font-bold">{activeHws.pipeline.v2Volume.volume.toLocaleString()} shares</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">20-Bar SMA Volume</span>
                          <span className="font-bold">{activeHws.pipeline.v2Volume.avgVolume20.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">RVOL Ratio</span>
                          <span className="font-bold text-emerald-400">{activeHws.pipeline.v2Volume.rvol.toFixed(2)}x</span>
                        </div>
                      </div>
                      <p className="opacity-75 pt-2">Status: {activeHws.pipeline.v2Volume.status}</p>
                    </div>
                  )}

                  {activePipelineTab === 3 && (
                    <div className="space-y-2">
                      <div className="text-teal-400 font-bold text-sm">V3: Order Flow &amp; Cumulative Volume Delta (CVD)</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                        <div>
                          <span className="opacity-60 block">Bar Volume Delta</span>
                          <span className="font-bold text-teal-400">
                            {activeHws.pipeline.v3OrderFlow.delta > 0 ? '+' : ''}
                            {activeHws.pipeline.v3OrderFlow.delta.toLocaleString()} ({activeHws.pipeline.v3OrderFlow.deltaPercent}%)
                          </span>
                        </div>
                        <div>
                          <span className="opacity-60 block">CVD Cumulative</span>
                          <span className="font-bold">{activeHws.pipeline.v3OrderFlow.cvd.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">CVD Slope</span>
                          <span className="font-bold text-emerald-400">
                            {activeHws.pipeline.v3OrderFlow.isCvdRising ? 'RISING (+ Net Inflow)' : 'FALLING (- Net Outflow)'}
                          </span>
                        </div>
                      </div>
                      <p className="opacity-75 pt-2">Status: {activeHws.pipeline.v3OrderFlow.status}</p>
                    </div>
                  )}

                  {activePipelineTab === 4 && (
                    <div className="space-y-2">
                      <div className="text-teal-400 font-bold text-sm">V4: Option Greeks &amp; Volatility Dynamics</div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
                        <div>
                          <span className="opacity-60 block">Delta (Δ)</span>
                          <span className="font-bold">{activeHws.pipeline.v4OptionGreeks.delta}</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Gamma (Γ)</span>
                          <span className="font-bold">{activeHws.pipeline.v4OptionGreeks.gamma}</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Vega (ν)</span>
                          <span className="font-bold">₹{activeHws.pipeline.v4OptionGreeks.vega}</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Theta (θ)</span>
                          <span className="font-bold">₹{activeHws.pipeline.v4OptionGreeks.theta}/day</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Implied Vol (IV)</span>
                          <span className="font-bold">{activeHws.pipeline.v4OptionGreeks.iv}%</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {activePipelineTab === 5 && (
                    <div className="space-y-2">
                      <div className="text-teal-400 font-bold text-sm">V5: Options Open Interest &amp; Strike Analysis</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                        <div>
                          <span className="opacity-60 block">Put-Call Ratio (PCR)</span>
                          <span className="font-bold text-amber-400">{activeHws.pipeline.v5OptionsOI.pcr.toFixed(2)}</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Put Writing Total</span>
                          <span className="font-bold">{activeHws.pipeline.v5OptionsOI.putWritingLakhs} Lakhs</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Call Writing Total</span>
                          <span className="font-bold">{activeHws.pipeline.v5OptionsOI.callWritingLakhs} Lakhs</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Dominant Strike</span>
                          <span className="font-bold">₹{activeHws.pipeline.v5OptionsOI.dominantStrike}</span>
                        </div>
                      </div>
                      <p className="opacity-75 pt-2">Status: {activeHws.pipeline.v5OptionsOI.status}</p>
                    </div>
                  )}

                  {activePipelineTab === 6 && (
                    <div className="space-y-2">
                      <div className="text-teal-400 font-bold text-sm">V6: Smart Money Concepts &amp; Wyckoff Matrix</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                        <div>
                          <span className="opacity-60 block">Wyckoff Phase</span>
                          <span className="font-bold text-purple-400">{activeHws.pipeline.v6WyckoffSMC.phase}</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Liquidity Sweep</span>
                          <span className="font-bold">
                            {activeHws.pipeline.v6WyckoffSMC.hasLiquiditySweep ? 'YES (Confirmed)' : 'NO'}
                          </span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Spring / UTAD</span>
                          <span className="font-bold">
                            {activeHws.pipeline.v6WyckoffSMC.hasSpringOrUtad ? 'DETECTED (+ Phase C)' : 'NONE'}
                          </span>
                        </div>
                      </div>
                      <p className="opacity-75 pt-2">Status: {activeHws.pipeline.v6WyckoffSMC.status}</p>
                    </div>
                  )}

                  {activePipelineTab === 7 && (
                    <div className="space-y-2">
                      <div className="text-teal-400 font-bold text-sm">V7: Institutional 100-Point Composite Score</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                        <div>
                          <span className="opacity-60 block">Composite Score</span>
                          <span className="font-bold text-emerald-400 text-lg">
                            {activeHws.pipeline.v7CompositeScore.score} / 100
                          </span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Setup Grade</span>
                          <span className="font-bold text-lg">GRADE {activeHws.pipeline.v7CompositeScore.grade}</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Institutional Quality Tier</span>
                          <span className="font-bold text-teal-300">
                            {activeHws.pipeline.v7CompositeScore.institutionalQuality}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {activePipelineTab === 8 && (
                    <div className="space-y-2">
                      <div className="text-teal-400 font-bold text-sm">V8: Backtest Performance &amp; Monte Carlo Expectancy</div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                        <div>
                          <span className="opacity-60 block">Simulated Win Rate</span>
                          <span className="font-bold text-emerald-400 text-lg">
                            {activeHws.pipeline.v8BacktestPerformance.simulatedWinRate}%
                          </span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Profit Factor</span>
                          <span className="font-bold text-lg">{activeHws.pipeline.v8BacktestPerformance.profitFactor}</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Expected Value</span>
                          <span className="font-bold text-teal-300">
                            {activeHws.pipeline.v8BacktestPerformance.expectedValueR} R / trade
                          </span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Max Drawdown</span>
                          <span className="font-bold text-rose-400">
                            {activeHws.pipeline.v8BacktestPerformance.maxDrawdownPct}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {activePipelineTab === 9 && (
                    <div className="space-y-2">
                      <div className="text-teal-400 font-bold text-sm">V9: Live Multi-Asset Execution Engine</div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                        <div>
                          <span className="opacity-60 block">Instrument</span>
                          <span className="font-bold">{activeHws.pipeline.v9LiveExecution.instrument}</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Action</span>
                          <span className="font-bold text-emerald-400">{activeHws.pipeline.v9LiveExecution.action}</span>
                        </div>
                        <div>
                          <span className="opacity-60 block">Execution Readiness</span>
                          <span className="font-bold text-teal-300">
                            {activeHws.pipeline.v9LiveExecution.readyForExecution ? 'READY FOR BROKER API' : 'STANDBY / BLOCKED'}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="p-12 text-center border border-dashed rounded-2xl border-slate-700 opacity-60">
              Select a stock from the left list to inspect full HWS-V1 institutional setup.
            </div>
          )}
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* CODE & SCRIPT MODAL (PINE SCRIPT V5 / PYTHON LIVE SCANNER)            */}
      {/* -------------------------------------------------------------------- */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-4xl max-h-[85vh] rounded-2xl border flex flex-col overflow-hidden shadow-2xl ${
              isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-indigo-400" />
                <h3 className="text-base sm:text-lg font-mono font-black uppercase">
                  {activeCodeTab === 'PINE' ? 'HWS-V1 Pine Script v5 Strategy' : 'HWS-V1 Live Python Scanner Engine'}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    handleCopyCode(
                      activeCodeTab === 'PINE'
                        ? generateHwsV1PineScript(activeStock?.symbol || 'NIFTY')
                        : generateHwsV1PythonScannerCode()
                    )
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-indigo-600 text-white flex items-center gap-1.5 hover:bg-indigo-500 cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>{copiedCode ? 'COPIED!' : 'COPY CODE'}</span>
                </button>

                <button
                  onClick={() =>
                    handleDownloadCode(
                      activeCodeTab === 'PINE'
                        ? generateHwsV1PineScript(activeStock?.symbol || 'NIFTY')
                        : generateHwsV1PythonScannerCode(),
                      activeCodeTab === 'PINE' ? 'HwsV1Strategy.pine' : 'hws_v1_scanner.py'
                    )
                  }
                  className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-emerald-600 text-white flex items-center gap-1.5 hover:bg-emerald-500 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>DOWNLOAD</span>
                </button>

                <button
                  onClick={() => setShowCodeModal(false)}
                  className="p-1.5 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-400 hover:text-slate-100 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Subtabs */}
            <div className="flex items-center gap-2 px-5 pt-3 border-b border-slate-800/80">
              <button
                onClick={() => setActiveCodeTab('PINE')}
                className={`pb-2.5 px-3 text-xs font-mono font-bold border-b-2 transition-all cursor-pointer ${
                  activeCodeTab === 'PINE'
                    ? 'border-indigo-500 text-indigo-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Pine Script v5 (TradingView)
              </button>
              <button
                onClick={() => setActiveCodeTab('PYTHON')}
                className={`pb-2.5 px-3 text-xs font-mono font-bold border-b-2 transition-all cursor-pointer ${
                  activeCodeTab === 'PYTHON'
                    ? 'border-emerald-500 text-emerald-400'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Python Live Scanner (NIFTY 200 Universe)
              </button>
            </div>

            {/* Code Body */}
            <div className="p-4 sm:p-5 flex-1 overflow-y-auto font-mono text-xs custom-scrollbar bg-slate-950">
              <pre className="text-slate-300 leading-relaxed overflow-x-auto whitespace-pre">
                {activeCodeTab === 'PINE'
                  ? generateHwsV1PineScript(activeStock?.symbol || 'NIFTY')
                  : generateHwsV1PythonScannerCode()}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
