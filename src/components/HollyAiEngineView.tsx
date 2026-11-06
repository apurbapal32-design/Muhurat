import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Brain,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Shield,
  ShieldAlert,
  Zap,
  Target,
  BarChart3,
  Activity,
  Layers,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Sliders,
  DollarSign,
  Clock,
  ChevronRight,
  Filter,
  Eye,
  Send,
  HelpCircle,
  Award,
  Flame,
  Search,
  Lock,
  Cpu,
} from 'lucide-react';
import {
  HollyEngineMode,
  HollyPerformanceStats,
  HollyRiskMode,
  HollySignal,
  HollyStrategy,
  ScannedStock,
  TradePosition,
} from '../types';
import {
  HOLLY_STRATEGIES,
  generateHollySignals,
  debounceHollySignalList,
  SignalDebounceRecord,
} from '../utils/hollyEngine';
import { safeFetchJson } from '../utils/apiClient';
import { HollyEngineeringFormulaView } from './HollyEngineeringFormulaView';
import { HollyTradingViewChartModal } from './HollyTradingViewChartModal';

interface HollyAiEngineViewProps {
  stocks: ScannedStock[];
  onCreateTrade: (trade: {
    symbol: string;
    signal: 'BUY' | 'SELL';
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    target1: number;
    target2: number;
  }) => void;
  onSelectStock: (stock: ScannedStock) => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const HollyAiEngineView: React.FC<HollyAiEngineViewProps> = ({
  stocks,
  onCreateTrade,
  onSelectStock,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';

  // Engine persona state
  const [selectedEngine, setSelectedEngine] = useState<HollyEngineMode>('ALL_ENGINES');
  const [riskMode, setRiskMode] = useState<HollyRiskMode>('RISK_ON');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'BUY' | 'SHORT'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [minConfidence, setMinConfidence] = useState<number>(85);
  const [activeTab, setActiveTab] = useState<
    'LIVE_SIGNALS' | 'STRATEGY_MATRIX' | 'ENGINEERING_DIAGNOSTICS' | 'PERFORMANCE_SIM'
  >('LIVE_SIGNALS');
  const [diagnosticTargetSymbol, setDiagnosticTargetSymbol] = useState<string>('');
  const [selectedTradingViewSignal, setSelectedTradingViewSignal] = useState<HollySignal | null>(null);

  // Signal Debouncer configuration & cache
  const [debouncerEnabled, setDebouncerEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem('holly_signal_debouncer_enabled');
    return saved !== null ? saved === 'true' : true;
  });
  const [debounceTolerance, setDebounceTolerance] = useState<number>(2.0);
  const [debounceWindowMinutes, setDebounceWindowMinutes] = useState<number>(3);
  const [debouncerResetKey, setDebouncerResetKey] = useState<number>(0);
  const debouncerCacheRef = useRef<Map<string, SignalDebounceRecord>>(new Map());

  // Save debouncer setting to localStorage
  useEffect(() => {
    localStorage.setItem('holly_signal_debouncer_enabled', String(debouncerEnabled));
  }, [debouncerEnabled]);

  const handleResetDebouncerBaseline = () => {
    debouncerCacheRef.current.clear();
    setDebouncerResetKey((prev) => prev + 1);
  };

  // Gemini AI Briefing state
  const [isGeneratingBriefing, setIsGeneratingBriefing] = useState<boolean>(false);
  const [briefingData, setBriefingData] = useState<{
    briefing: string;
    recommendedRiskMode: 'RISK_ON' | 'RISK_OFF';
    regimeAnalysis: string;
    topStrategyPick: string;
  } | null>(null);
  const [isBriefingModalOpen, setIsBriefingModalOpen] = useState<boolean>(false);

  // Compute live signals and performance from stocks
  const { signals: rawLiveSignals, performance } = useMemo(() => {
    return generateHollySignals(stocks);
  }, [stocks]);

  // Apply Signal Debouncer to prevent redundant signals for the same stock if AI score fluctuates within +/- tolerance over 3-min window
  const { debouncedSignals, totalSuppressed } = useMemo(() => {
    return debounceHollySignalList(
      rawLiveSignals,
      debouncerCacheRef.current,
      {
        enabled: debouncerEnabled,
        scoreTolerance: debounceTolerance,
        windowMs: debounceWindowMinutes * 60 * 1000,
      }
    );
  }, [rawLiveSignals, debouncerEnabled, debounceTolerance, debounceWindowMinutes, debouncerResetKey]);

  // Filter signals based on controls
  const filteredSignals = useMemo(() => {
    return debouncedSignals.filter((sig) => {
      // Engine filter
      if (selectedEngine !== 'ALL_ENGINES' && sig.engine !== selectedEngine) {
        return false;
      }
      // Direction filter
      if (directionFilter !== 'ALL' && sig.signal !== directionFilter) {
        return false;
      }
      // Confidence filter
      if (sig.confidenceScore < minConfidence) {
        return false;
      }
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          sig.symbol.toLowerCase().includes(q) ||
          sig.name.toLowerCase().includes(q) ||
          sig.strategyName.toLowerCase().includes(q) ||
          sig.sector.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [debouncedSignals, selectedEngine, directionFilter, minConfidence, searchQuery]);

  // Trigger Gemini AI Briefing
  const handleGenerateBriefing = async () => {
    setIsGeneratingBriefing(true);
    try {
      const data = await safeFetchJson<any>('/api/holly/briefing', {
        method: 'POST',
      });
      if (data && data.status === 'ok') {
        setBriefingData({
          briefing: data.briefing,
          recommendedRiskMode: data.recommendedRiskMode || 'RISK_ON',
          regimeAnalysis: data.regimeAnalysis || 'Trend Expansion',
          topStrategyPick: data.topStrategyPick || 'Holly Grail: Pullback Panther',
        });
        setIsBriefingModalOpen(true);
      }
    } catch (e) {
      console.error('Failed to generate Holly briefing:', e);
    } finally {
      setIsGeneratingBriefing(false);
    }
  };

  // Quick Execute Trade handler
  const handleQuickExecute = (sig: HollySignal) => {
    onCreateTrade({
      symbol: sig.symbol,
      signal: sig.signal === 'SHORT' ? 'SELL' : 'BUY',
      entryPrice: sig.entryPrice,
      quantity: sig.quantity,
      stopLoss: sig.stopLoss,
      target1: riskMode === 'RISK_OFF' ? sig.target1 : sig.target2,
      target2: sig.target3,
    });
  };

  return (
    <div className="space-y-6">
      {/* 1. HOLLY HERO HEADER & ENGINE PERSONA SELECTOR */}
      <div
        className={`p-5 sm:p-6 rounded-2xl border transition-all ${
          isDark
            ? 'bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-indigo-500/30 shadow-xl'
            : 'bg-gradient-to-r from-indigo-50 via-white to-indigo-50 border-indigo-200 shadow-md'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Engine Title & Identity */}
          <div className="flex items-start sm:items-center gap-4">
            <div className="relative p-3.5 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-600 text-white shadow-lg shadow-indigo-500/25 flex-shrink-0 animate-pulse">
              <Brain className="w-8 h-8" />
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 border-2 border-slate-900 rounded-full" />
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                  <span>HOLLY AI</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    QUANTITATIVE MULTI-STRATEGY
                  </span>
                </h1>
                <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1">
                  <Flame className="w-3 h-3" />
                  1M+ SIMULATED TRADES OVERNIGHT
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                Autonomous algorithmic engine simulating 45+ quant models overnight. Selects and triggers only the statistical highest-probability intraday setups for Nifty 200.
              </p>
            </div>
          </div>

          {/* Action CTA & AI Briefing Trigger */}
          <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
            <button
              onClick={handleGenerateBriefing}
              disabled={isGeneratingBriefing}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 hover:from-indigo-500 hover:to-purple-500 text-white font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50"
            >
              <Sparkles className={`w-4 h-4 ${isGeneratingBriefing ? 'animate-spin' : ''}`} />
              <span>{isGeneratingBriefing ? 'Synthesizing...' : 'Gemini AI Regime Briefing'}</span>
            </button>
          </div>
        </div>

        {/* Engine Switcher Bar & Risk Mode Controller */}
        <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          {/* Persona Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800 flex-wrap">
            <button
              onClick={() => setSelectedEngine('ALL_ENGINES')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 ${
                selectedEngine === 'ALL_ENGINES'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>ALL HOLLY ({debouncedSignals.length})</span>
            </button>

            <button
              onClick={() => setSelectedEngine('HOLLY_ALPHA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 ${
                selectedEngine === 'HOLLY_ALPHA'
                  ? 'bg-pink-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-pink-400'
              }`}
            >
              <Cpu className="w-3.5 h-3.5 text-pink-300" />
              <span>ALPHA 100</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-pink-800/80 text-white">
                {debouncedSignals.filter((s) => s.engine === 'HOLLY_ALPHA').length}
              </span>
            </button>

            <button
              onClick={() => setSelectedEngine('HOLLY_STEALTH')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 ${
                selectedEngine === 'HOLLY_STEALTH'
                  ? 'bg-cyan-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-cyan-400'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-cyan-300" />
              <span>STEALTH VWAP</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-800/80 text-white">
                {debouncedSignals.filter((s) => s.engine === 'HOLLY_STEALTH').length}
              </span>
            </button>

            <button
              onClick={() => setSelectedEngine('HOLLY_GAMMA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 ${
                selectedEngine === 'HOLLY_GAMMA'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-rose-400'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-rose-300" />
              <span>GAMMA SQUEEZE</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-800/80 text-white">
                {debouncedSignals.filter((s) => s.engine === 'HOLLY_GAMMA').length}
              </span>
            </button>

            <button
              onClick={() => setSelectedEngine('HOLLY_GRAIL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 ${
                selectedEngine === 'HOLLY_GRAIL'
                  ? 'bg-emerald-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-emerald-400'
              }`}
            >
              <Award className="w-3.5 h-3.5 text-emerald-300" />
              <span>GRAIL</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-800/80 text-white">
                {debouncedSignals.filter((s) => s.engine === 'HOLLY_GRAIL').length}
              </span>
            </button>

            <button
              onClick={() => setSelectedEngine('HOLLY_2_0')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 ${
                selectedEngine === 'HOLLY_2_0'
                  ? 'bg-amber-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-amber-400'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>2.0 (MOMENTUM)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-800/80 text-white">
                {debouncedSignals.filter((s) => s.engine === 'HOLLY_2_0').length}
              </span>
            </button>

            <button
              onClick={() => setSelectedEngine('HOLLY_NEO')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 ${
                selectedEngine === 'HOLLY_NEO'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-purple-400'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5 text-purple-300" />
              <span>NEO (REVERSION)</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-800/80 text-white">
                {debouncedSignals.filter((s) => s.engine === 'HOLLY_NEO').length}
              </span>
            </button>
          </div>

          {/* Risk Management Mode Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-slate-400 uppercase font-bold flex items-center gap-1">
              <Shield className="w-3.5 h-3.5 text-indigo-400" />
              RISK MODE:
            </span>
            <div className="p-1 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center gap-1">
              <button
                onClick={() => setRiskMode('RISK_ON')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1 ${
                  riskMode === 'RISK_ON'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Risk-On: Lets winning positions run with trailing stop to higher targets (Target 2 / 3)"
              >
                <TrendingUp className="w-3 h-3 text-emerald-300" />
                <span>RISK-ON</span>
              </button>

              <button
                onClick={() => setRiskMode('RISK_OFF')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1 ${
                  riskMode === 'RISK_OFF'
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
                title="Risk-Off: Enforces conservative profit booking at Target 1 and rapid capital defense"
              >
                <ShieldAlert className="w-3 h-3 text-rose-300" />
                <span>RISK-OFF</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. HOLLY QUANTITATIVE KPI PERFORMANCE RIBBON */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        {/* Metric 1: Today's Simulated P&L */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>TODAY'S P&L ({riskMode.replace('_', '-')})</span>
            <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div
            className={`text-lg sm:text-xl font-mono font-black ${
              (riskMode === 'RISK_ON' ? performance.todayPnLRiskOn : performance.todayPnLRiskOff) >= 0
                ? 'text-emerald-400'
                : 'text-rose-400'
            }`}
          >
            {(riskMode === 'RISK_ON' ? performance.todayPnLRiskOn : performance.todayPnLRiskOff) >= 0
              ? '+₹'
              : '-₹'}
            {Math.abs(
              riskMode === 'RISK_ON' ? performance.todayPnLRiskOn : performance.todayPnLRiskOff
            ).toLocaleString('en-IN')}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">
            {riskMode === 'RISK_ON' ? 'Trailing stops mode' : 'Target 1 lock mode'}
          </div>
        </div>

        {/* Metric 2: Win Rate */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>HOLLY WIN RATE</span>
            <Award className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg sm:text-xl font-mono font-black text-amber-300">
            {performance.winRate}%
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">
            {performance.winningTradesCount}W / {performance.losingTradesCount}L ({performance.totalSignalsToday} total)
          </div>
        </div>

        {/* Metric 3: Profit Factor */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>PROFIT FACTOR</span>
            <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-lg sm:text-xl font-mono font-black text-indigo-300">
            {performance.profitFactor}x
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">
            Historical benchmark &gt; 2.0x
          </div>
        </div>

        {/* Metric 4: Active Strategy Mode */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>TOP STRATEGY</span>
            <Flame className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div className="text-xs sm:text-sm font-mono font-bold text-slate-100 truncate">
            {performance.topPerformingStrategy.replace('Holly Grail: ', '').replace('Holly 2.0: ', '')}
          </div>
          <div className="text-[10px] text-emerald-400 font-mono mt-1">68.4% edge today</div>
        </div>

        {/* Metric 5: Best Trade Today */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>BEST TRADE</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-base sm:text-lg font-mono font-black text-emerald-400">
            {performance.bestTradeSymbol}
          </div>
          <div className="text-[10px] text-emerald-500 font-mono mt-0.5">
            +₹{performance.bestTradePnL.toLocaleString('en-IN')}
          </div>
        </div>

        {/* Metric 6: Market Regime */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>REGIME ALIGNMENT</span>
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-xs sm:text-sm font-mono font-bold text-cyan-300 truncate">
            {performance.marketRegime}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">GIFT Nifty & ATR sync</div>
        </div>
      </div>

      {/* 3. VIEW TABS NAVIGATION (Live Signals / Strategy Matrix / Performance Simulator) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('LIVE_SIGNALS')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 ${
              activeTab === 'LIVE_SIGNALS'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>LIVE HOLLY SIGNALS ({filteredSignals.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('STRATEGY_MATRIX')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 ${
              activeTab === 'STRATEGY_MATRIX'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>OVERNIGHT ALGORITHM MATRIX ({HOLLY_STRATEGIES.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('ENGINEERING_DIAGNOSTICS')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 ${
              activeTab === 'ENGINEERING_DIAGNOSTICS'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800'
            }`}
          >
            <Cpu className="w-4 h-4 text-pink-300" />
            <span>FORMULA DIAGNOSTICS & HOLLY ENGINEERING</span>
          </button>
        </div>

        {/* Filter Controls (Direction / Search / Confidence) */}
        {activeTab === 'LIVE_SIGNALS' && (
          <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
            {/* Direction Filter */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-950 border border-slate-800">
              <button
                onClick={() => setDirectionFilter('ALL')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold uppercase ${
                  directionFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400'
                }`}
              >
                ALL
              </button>
              <button
                onClick={() => setDirectionFilter('BUY')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold uppercase ${
                  directionFilter === 'BUY' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                }`}
              >
                BUY
              </button>
              <button
                onClick={() => setDirectionFilter('SHORT')}
                className={`px-2.5 py-1 rounded text-[11px] font-mono font-bold uppercase ${
                  directionFilter === 'SHORT' ? 'bg-rose-600 text-white' : 'text-slate-400'
                }`}
              >
                SHORT
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filter symbol or strategy..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-44"
              />
            </div>
          </div>
        )}
      </div>

      {/* 4. CONTENT DISPLAY BASED ON TAB */}
      {activeTab === 'LIVE_SIGNALS' && (
        <div className="space-y-4">
          {/* Signal Debouncer Control Bar */}
          <div
            className={`p-3.5 sm:p-4 rounded-xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-3.5 transition-all ${
              debouncerEnabled
                ? isDark
                  ? 'bg-slate-950/90 border-indigo-500/30 shadow-md shadow-indigo-950/20'
                  : 'bg-indigo-50/70 border-indigo-200'
                : isDark
                ? 'bg-slate-900/40 border-slate-800'
                : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`p-2 rounded-lg flex items-center justify-center ${
                  debouncerEnabled
                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                    : 'bg-slate-800 text-slate-500'
                }`}
              >
                <Shield className={`w-4 h-4 ${debouncerEnabled ? 'text-indigo-400 animate-pulse' : ''}`} />
              </div>

              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-mono font-bold text-slate-100 flex items-center gap-1.5">
                    <span>AI Signal Debouncer</span>
                    <span
                      className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-full uppercase ${
                        debouncerEnabled
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {debouncerEnabled ? `ACTIVE (${debounceWindowMinutes}-MIN / ±${debounceTolerance} PTS)` : 'BYPASSED'}
                    </span>
                  </span>

                  {debouncerEnabled && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5" />
                      <span>{totalSuppressed} Jitter Retriggers Stabilized</span>
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-400 mt-0.5">
                  Locks baseline signals and suppresses noisy re-alerts when AI score fluctuates within ±{debounceTolerance} pts over a 3-minute window.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap self-end md:self-center">
              {/* Tolerance Selector */}
              {debouncerEnabled && (
                <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 text-[11px] font-mono">
                  <span className="text-slate-500 px-1 text-[10px]">TOLERANCE:</span>
                  {[1, 2, 3].map((val) => (
                    <button
                      key={val}
                      onClick={() => setDebounceTolerance(val)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                        debounceTolerance === val
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      ±{val} pts
                    </button>
                  ))}
                </div>
              )}

              {/* Reset Baseline Button */}
              {debouncerEnabled && (
                <button
                  onClick={handleResetDebouncerBaseline}
                  title="Flush 3-min debounce cache and establish fresh AI score baselines"
                  className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-mono flex items-center gap-1.5 transition-all active:scale-95"
                >
                  <RotateCcw className="w-3 h-3 text-slate-400" />
                  <span className="hidden sm:inline">Reset Baseline</span>
                </button>
              )}

              {/* Enable/Disable Toggle */}
              <button
                onClick={() => setDebouncerEnabled(!debouncerEnabled)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                  debouncerEnabled
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                <span>{debouncerEnabled ? 'Debouncer ON' : 'Enable Debouncer'}</span>
              </button>
            </div>
          </div>

          {filteredSignals.length === 0 ? (
            <div
              className={`p-12 text-center rounded-2xl border ${
                isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <Brain className="w-12 h-12 text-slate-600 mx-auto mb-3 animate-pulse" />
              <h3 className="text-base font-mono font-bold text-slate-300">
                No Holly Signals Matching Filter
              </h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Holly's overnight algorithms are continuously scanning 200 stocks for multi-timeframe breakouts and mean-reversion setups. Try selecting 'All Holly Engines' or clearing filters.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredSignals.map((sig) => {
                const isBuy = sig.signal === 'BUY';
                const currentPnL = riskMode === 'RISK_ON' ? sig.riskOnPnL : sig.riskOffPnL;
                const matchedStock = stocks.find((s) => s.symbol === sig.symbol);

                return (
                  <div
                    key={sig.id}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all hover:scale-[1.01] ${
                      isDark
                        ? 'bg-slate-900/95 border-slate-800 hover:border-indigo-500/40 shadow-lg'
                        : 'bg-white border-slate-200 hover:border-indigo-400 shadow-sm'
                    }`}
                  >
                    {/* Top Row: Symbol, Signal & Engine Badge */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base sm:text-lg font-mono font-black text-slate-100">
                            {sig.symbol}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase ${
                              isBuy
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {sig.signal}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                              sig.engine === 'HOLLY_GRAIL'
                                ? 'bg-indigo-500/20 text-indigo-300'
                                : sig.engine === 'HOLLY_2_0'
                                ? 'bg-amber-500/20 text-amber-300'
                                : sig.engine === 'HOLLY_NEO'
                                ? 'bg-purple-500/20 text-purple-300'
                                : sig.engine === 'HOLLY_STEALTH'
                                ? 'bg-cyan-500/20 text-cyan-300'
                                : sig.engine === 'HOLLY_GAMMA'
                                ? 'bg-rose-500/20 text-rose-300'
                                : 'bg-pink-500/20 text-pink-300'
                            }`}
                          >
                            {sig.engine.replace('HOLLY_', '').replace('_', ' ')}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[220px]">
                          {sig.name} • {sig.sector}
                        </div>
                      </div>

                      {/* Live P&L Badge */}
                      <div className="text-right">
                        <div
                          className={`text-sm font-mono font-black ${
                            currentPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {currentPnL >= 0 ? '+₹' : '-₹'}
                          {Math.abs(currentPnL).toLocaleString('en-IN')}
                        </div>
                        <span
                          className={`text-[9px] font-mono px-1.5 py-0.2 rounded font-bold ${
                            sig.status === 'TARGET_2_HIT'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : sig.status === 'TARGET_1_HIT'
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : sig.status === 'STOPPED_OUT'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-indigo-500/20 text-indigo-300'
                          }`}
                        >
                          {sig.status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    </div>

                    {/* Strategy Name, Edge Confidence & Entry Time Info */}
                    <div className="mt-3 p-2 rounded-xl bg-slate-950/80 border border-slate-800/80 flex items-center justify-between text-xs font-mono">
                      <span className="text-indigo-300 font-bold truncate pr-2">
                        {sig.strategyName}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {sig.isDebounced && (
                          <span
                            title="Signal AI Score stabilized within 3-minute debounce window"
                            className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[9px] font-bold flex items-center gap-0.5"
                          >
                            <Lock className="w-2.5 h-2.5" />
                            <span>±{sig.debounceScoreDelta}</span>
                          </span>
                        )}
                        <span className="text-emerald-400 font-bold whitespace-nowrap">
                          {sig.confidenceScore}% Edge
                        </span>
                      </div>
                    </div>

                    {/* Order Execution & Precise Timing Ribbon */}
                    <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px] font-mono">
                      <div className="p-1.5 rounded-lg bg-slate-950/90 border border-slate-800/80 flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-cyan-400" />
                          ENTRY:
                        </span>
                        <span className="text-slate-200 font-bold">
                          {sig.entryTime || '09:25:00'} ({sig.timeInTrade || '25m'})
                        </span>
                      </div>

                      <div className="p-1.5 rounded-lg bg-slate-950/90 border border-slate-800/80 flex items-center justify-between">
                        <span className="text-slate-400 flex items-center gap-1">
                          <Shield className="w-3 h-3 text-amber-400" />
                          SQ-OFF:
                        </span>
                        <span className="text-amber-300 font-bold">
                          {sig.hardSquareOffTime || '15:15:00'}
                        </span>
                      </div>
                    </div>

                    {/* Debouncer Jitter Stabilization Banner if active on this stock */}
                    {sig.isDebounced && (
                      <div className="mt-2 px-2.5 py-1 rounded-lg bg-indigo-950/50 border border-indigo-500/25 flex items-center justify-between text-[10px] font-mono text-indigo-300">
                        <div className="flex items-center gap-1.5">
                          <Lock className="w-3 h-3 text-indigo-400 shrink-0" />
                          <span>Debounce-Locked (3m window • ±{sig.debounceScoreDelta || 0} pts)</span>
                        </div>
                        {sig.fluctuationsSuppressedCount && sig.fluctuationsSuppressedCount > 0 ? (
                          <span className="text-emerald-400 font-bold">
                            {sig.fluctuationsSuppressedCount}x suppressed
                          </span>
                        ) : (
                          <span className="text-indigo-400 font-bold">Baseline Active</span>
                        )}
                      </div>
                    )}

                    {/* Trade Price Levels Matrix & Entry Price Band */}
                    <div className="grid grid-cols-4 gap-1.5 mt-2.5 text-center font-mono text-[10px]">
                      <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800">
                        <div className="text-slate-500">ENTRY PRICE</div>
                        <div className="text-slate-100 font-bold">₹{sig.entryPrice}</div>
                        {sig.entryPriceRange && (
                          <div className="text-[8px] text-slate-400">
                            ₹{sig.entryPriceRange.min}-₹{sig.entryPriceRange.max}
                          </div>
                        )}
                      </div>
                      <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800">
                        <div className="text-rose-400">STOP LOSS</div>
                        <div className="text-rose-300 font-bold">₹{sig.stopLoss}</div>
                        <div className="text-[8px] text-rose-400/80">
                          {(((sig.stopLoss - sig.entryPrice) / sig.entryPrice) * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800">
                        <div className="text-emerald-400">TARGET 1</div>
                        <div className="text-emerald-300 font-bold">₹{sig.target1}</div>
                        <div className="text-[8px] text-emerald-400/80">
                          +{(((sig.target1 - sig.entryPrice) / sig.entryPrice) * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div className="p-1.5 rounded-lg bg-slate-950 border border-slate-800">
                        <div className="text-cyan-400">TARGET 2</div>
                        <div className="text-cyan-300 font-bold">₹{sig.target2}</div>
                        <div className="text-[8px] text-cyan-400/80">
                          +{(((sig.target2 - sig.entryPrice) / sig.entryPrice) * 100).toFixed(1)}%
                        </div>
                      </div>
                    </div>

                    {/* Technical Checklist Badges */}
                    <div className="flex items-center gap-1.5 mt-2.5 flex-wrap text-[10px] font-mono">
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        RSI: {sig.indicators.rsi}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        RVOL: {sig.indicators.rvol}x
                      </span>
                      <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                        VWAP: {sig.indicators.vwapDiffPct > 0 ? '+' : ''}
                        {sig.indicators.vwapDiffPct}%
                      </span>
                      <span className="px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-200">
                        R:R {sig.riskReward}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800/80 text-cyan-300 text-[9px]">
                        {sig.orderTypeRecommendation || 'LIMIT_BRACKET'}
                      </span>
                    </div>

                    {/* AI Rationale */}
                    <p className="text-[11px] text-slate-400 mt-2 line-clamp-2 leading-relaxed">
                      {sig.aiRationale}
                    </p>

                    {/* Action Buttons */}
                    <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-slate-800/80">
                      <button
                        onClick={() => handleQuickExecute(sig)}
                        className="py-2 px-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono font-bold text-xs uppercase flex items-center justify-center gap-1 shadow-md shadow-emerald-600/20 transition-all active:scale-95"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Execute</span>
                      </button>

                      <button
                        onClick={() => setSelectedTradingViewSignal(sig)}
                        className="py-2 px-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-mono font-bold text-xs uppercase flex items-center justify-center gap-1 shadow-md shadow-indigo-600/20 transition-all active:scale-95"
                        title="Open Quantitative TradingView Chart with Entry/Exit price bands and live candlestick telemetry"
                      >
                        <BarChart3 className="w-3.5 h-3.5 text-cyan-300" />
                        <span>TradingView</span>
                      </button>

                      <button
                        onClick={() => {
                          setDiagnosticTargetSymbol(sig.symbol);
                          setActiveTab('ENGINEERING_DIAGNOSTICS');
                        }}
                        className="py-2 px-2 rounded-xl bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-200 border border-indigo-500/30 font-mono font-bold text-xs uppercase flex items-center justify-center gap-1 transition-all"
                        title="Inspect full 6-vector Holly Formula Diagnostics"
                      >
                        <Cpu className="w-3.5 h-3.5 text-pink-300" />
                        <span>Formula</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 5. HOLLY QUANT ENGINEERING FORMULA DIAGNOSTICS TAB */}
      {activeTab === 'ENGINEERING_DIAGNOSTICS' && (
        <HollyEngineeringFormulaView
          stocks={stocks}
          selectedSymbol={diagnosticTargetSymbol || undefined}
          onSelectStock={onSelectStock}
          onExecuteTrade={(stock, sig) => {
            const entry = stock.price;
            const sl = Number((entry * (sig === 'BUY' ? 0.985 : 1.015)).toFixed(2));
            const t1 = Number((entry * (sig === 'BUY' ? 1.025 : 0.975)).toFixed(2));
            const t2 = Number((entry * (sig === 'BUY' ? 1.05 : 0.95)).toFixed(2));
            onCreateTrade({
              symbol: stock.symbol,
              signal: sig,
              entryPrice: entry,
              quantity: 50,
              stopLoss: sl,
              target1: t1,
              target2: t2,
            });
          }}
          theme={theme}
        />
      )}

      {/* 6. STRATEGY MATRIX TAB */}
      {activeTab === 'STRATEGY_MATRIX' && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-2xl border ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            <div className="flex items-center gap-2 mb-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              <h2 className="text-sm font-mono font-bold text-slate-100 uppercase">
                Overnight Backtested Quantitative Algorithms Catalog
              </h2>
            </div>
            <p className="text-xs text-slate-400">
              Each algorithm is continuously simulated overnight against 5+ years of historical Nifty 200 tick data. Only algorithms demonstrating an intraday Profit Factor &gt; 1.8x and Win Rate &gt; 60% are active in today's session.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {HOLLY_STRATEGIES.map((strat) => (
              <div
                key={strat.id}
                className={`p-5 rounded-2xl border transition-all ${
                  isDark ? 'bg-slate-900/95 border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-mono font-bold text-slate-100">{strat.name}</h3>
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                          strat.direction === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : strat.direction === 'SELL'
                            ? 'bg-rose-500/20 text-rose-400'
                            : 'bg-indigo-500/20 text-indigo-300'
                        }`}
                      >
                        {strat.direction}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{strat.description}</p>
                  </div>

                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold whitespace-nowrap">
                    ACTIVE TODAY
                  </span>
                </div>

                {/* Strategy Stats Ribbon */}
                <div className="grid grid-cols-3 gap-2 mt-4 text-center font-mono">
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-500">WIN RATE</div>
                    <div className="text-sm font-bold text-amber-300">{strat.winRate}%</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-500">PROFIT FACTOR</div>
                    <div className="text-sm font-bold text-indigo-300">{strat.profitFactor}x</div>
                  </div>
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="text-[10px] text-slate-500">TESTED TRADES</div>
                    <div className="text-sm font-bold text-slate-200">
                      {strat.tradesCount.toLocaleString()}
                    </div>
                  </div>
                </div>

                {/* Quantitative Rules Checklist */}
                <div className="mt-4 space-y-1.5">
                  <div className="text-[11px] font-mono font-bold text-slate-400 uppercase">
                    Execution Trigger Rules:
                  </div>
                  {strat.rules.map((rule, rIdx) => (
                    <div key={rIdx} className="flex items-start gap-2 text-xs text-slate-300 font-mono">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                      <span>{rule}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. GEMINI AI REGIME BRIEFING MODAL */}
      {isBriefingModalOpen && briefingData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div
            className={`w-full max-w-2xl max-h-[85vh] overflow-y-auto p-6 rounded-2xl border shadow-2xl ${
              isDark ? 'bg-slate-900 border-indigo-500/40 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-mono font-bold">
                    Holly AI Algorithmic Regime Briefing
                  </h2>
                  <p className="text-xs text-slate-400">
                    Overnight quantitative backtest & live Nifty 200 regime synthesis
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsBriefingModalOpen(false)}
                className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono text-xs"
              >
                Close
              </button>
            </div>

            {/* Recommended Stance Badges */}
            <div className="grid grid-cols-2 gap-3 my-4">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] font-mono text-slate-500">RECOMMENDED RISK MODE</div>
                <div className="text-sm font-mono font-black text-emerald-400 mt-0.5">
                  {briefingData.recommendedRiskMode} (Trailing Stops)
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-[10px] font-mono text-slate-500">REGIME ANALYSIS</div>
                <div className="text-sm font-mono font-bold text-cyan-300 mt-0.5">
                  {briefingData.regimeAnalysis}
                </div>
              </div>
            </div>

            {/* Briefing Text */}
            <div className="prose prose-invert max-w-none text-xs sm:text-sm font-mono text-slate-300 leading-relaxed whitespace-pre-wrap">
              {briefingData.briefing}
            </div>

            <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setIsBriefingModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono font-bold text-xs uppercase"
              >
                Done & Return to Scanner
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. HOLLY QUANTITATIVE TRADINGVIEW & ADVANCED CHART MODAL */}
      {selectedTradingViewSignal && (
        <HollyTradingViewChartModal
          signal={selectedTradingViewSignal}
          stock={stocks.find((s) => s.symbol === selectedTradingViewSignal.symbol)}
          onClose={() => setSelectedTradingViewSignal(null)}
          onExecuteTrade={(tradeData) => {
            onCreateTrade(tradeData);
            setSelectedTradingViewSignal(null);
          }}
          theme={theme}
        />
      )}
    </div>
  );
};
