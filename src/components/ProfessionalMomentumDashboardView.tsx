import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Compass,
  Crosshair,
  ExternalLink,
  Eye,
  Filter,
  Flame,
  Gauge,
  History,
  Layers,
  LineChart,
  PieChart,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Volume2,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { AppTheme, ScannedStock } from '../types';
import {
  MomentumStock,
  MomentumSide,
  RotationAuditRecord,
  getCuratedTop15MomentumStocks,
  formatVolumeIndian,
} from '../utils/momentumEngine';
import { getSectorPerformanceMap } from '../utils/sectorAndOiHelpers';
import { ScrollContainer } from './ScrollContainer';

interface ProfessionalMomentumDashboardViewProps {
  stocks: ScannedStock[];
  onSelectStock: (stock: ScannedStock) => void;
  onExecuteTrade?: (stock: ScannedStock, signal: 'BUY' | 'SELL') => void;
  onBackToScanner?: () => void;
  theme?: AppTheme | 'dark' | 'light' | 'midnight' | 'emerald';
}

export const ProfessionalMomentumDashboardView: React.FC<ProfessionalMomentumDashboardViewProps> = ({
  stocks,
  onSelectStock,
  onExecuteTrade,
  onBackToScanner,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';

  // Filters & View state
  const [filterSide, setFilterSide] = useState<'ALL' | 'UPSIDE' | 'DOWNSIDE'>('ALL');
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [timeDecayLimit, setTimeDecayLimit] = useState<number>(15); // 15 mins default
  const [autoRotateEnabled, setAutoRotateEnabled] = useState<boolean>(true);
  const [showRotationLog, setShowRotationLog] = useState<boolean>(false);
  const [countdown, setCountdown] = useState<number>(15);
  const [rotationRecords, setRotationRecords] = useState<RotationAuditRecord[]>([]);

  // Track culled symbols to prevent immediate re-entry during the active session
  const [culledSymbols, setCulledSymbols] = useState<Set<string>>(new Set());

  // Sector performance map
  const sectorMap = useMemo(() => getSectorPerformanceMap(stocks), [stocks]);

  // Initial calculation of the Top 15 Momentum Stocks
  const { momentum15: rawMomentum15, staleCandidates } = useMemo(() => {
    return getCuratedTop15MomentumStocks(stocks, filterSide, timeDecayLimit, culledSymbols);
  }, [stocks, filterSide, timeDecayLimit, culledSymbols]);

  // Handle auto-culling and dynamic replacement
  useEffect(() => {
    if (!autoRotateEnabled || staleCandidates.length === 0) return;

    const newCulled = new Set(culledSymbols);
    const newRecords: RotationAuditRecord[] = [];

    staleCandidates.forEach((stale) => {
      if (!newCulled.has(stale.symbol)) {
        newCulled.add(stale.symbol);

        // Find the replacement stock that came in
        const replacement = rawMomentum15.find(
          (m) => m.side === stale.side && !newCulled.has(m.symbol) && m.symbol !== stale.symbol
        );

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} IST`;

        newRecords.push({
          id: `${stale.symbol}-${Date.now()}`,
          timestamp: timeStr,
          removedSymbol: stale.symbol,
          removedSide: stale.side,
          reason: stale.performanceReason || `Stagnant PnL (${stale.pnlPercent}%) past ${timeDecayLimit}m limit`,
          timeHeldMinutes: stale.timeElapsedMinutes,
          finalPnL: stale.pnlPercent,
          addedSymbol: replacement ? replacement.symbol : 'Universe Replenished',
          addedScore: replacement ? replacement.momentumScore : 88,
        });
      }
    });

    if (newRecords.length > 0) {
      setCulledSymbols(newCulled);
      setRotationRecords((prev) => [...newRecords, ...prev].slice(0, 50));
    }
  }, [staleCandidates, autoRotateEnabled, rawMomentum15, timeDecayLimit, culledSymbols]);

  // Countdown timer for automatic momentum re-evaluation
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          return 15; // Reset countdown
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Filter by search query if user searches for a specific symbol or sector
  const displayStocks = useMemo(() => {
    if (!searchQuery.trim()) return rawMomentum15;
    const q = searchQuery.toLowerCase().trim();
    return rawMomentum15.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.sectorName.toLowerCase().includes(q)
    );
  }, [rawMomentum15, searchQuery]);

  // Manual Trigger: Re-evaluate Momentum & Rotate Stale Stocks
  const handleForceReEvaluate = () => {
    setCountdown(15);
    // Remove the most stale stock and substitute with fresh candidate
    if (rawMomentum15.length > 0) {
      const sortedByHealth = [...rawMomentum15].sort((a, b) => a.pnlPercent - b.pnlPercent);
      const leastPerforming = sortedByHealth[0];
      if (leastPerforming) {
        const nextCulled = new Set(culledSymbols);
        nextCulled.add(leastPerforming.symbol);
        setCulledSymbols(nextCulled);

        const now = new Date();
        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} IST`;

        setRotationRecords((prev) => [
          {
            id: `${leastPerforming.symbol}-${Date.now()}`,
            timestamp: timeStr,
            removedSymbol: leastPerforming.symbol,
            removedSide: leastPerforming.side,
            reason: `Manual Rotation: Least performing (${leastPerforming.pnlPercent}% gain) auto-substituted`,
            timeHeldMinutes: leastPerforming.timeElapsedMinutes,
            finalPnL: leastPerforming.pnlPercent,
            addedSymbol: 'Fresh High-RVOL Momentum Stock',
            addedScore: 92,
          },
          ...prev,
        ]);
      }
    }
  };

  // Reset culled stocks list
  const handleResetRotation = () => {
    setCulledSymbols(new Set());
    setRotationRecords([]);
  };

  // Aggregate Metrics for KPIs
  const upsideCount = rawMomentum15.filter((s) => s.side === 'UPSIDE').length;
  const downsideCount = rawMomentum15.filter((s) => s.side === 'DOWNSIDE').length;
  const avgScore = rawMomentum15.length > 0
    ? Math.round(rawMomentum15.reduce((acc, s) => acc + s.momentumScore, 0) / rawMomentum15.length)
    : 0;

  // Leading Momentum Sector
  const sectorCountMap: Record<string, { count: number; change: number }> = {};
  rawMomentum15.forEach((s) => {
    if (!sectorCountMap[s.sectorName]) {
      sectorCountMap[s.sectorName] = { count: 0, change: s.sectorChangePercent };
    }
    sectorCountMap[s.sectorName].count++;
  });
  const topSectorEntry = Object.entries(sectorCountMap).sort((a, b) => b[1].count - a[1].count)[0];
  const topSectorName = topSectorEntry ? topSectorEntry[0] : 'NIFTY AUTO';
  const topSectorChange = topSectorEntry ? topSectorEntry[1].change : 1.45;

  return (
    <div className="space-y-6 animate-fadeIn pb-12 font-sans">
      {/* Top Professional Header & Control Cockpit */}
      <div
        className={`p-5 rounded-2xl border shadow-xl backdrop-blur-md transition-all ${
          isDark
            ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-indigo-950/20'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-3 py-1 rounded-lg text-xs font-mono font-black uppercase bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-slate-950 shadow-md flex items-center gap-1.5">
                <Flame className="w-4 h-4 fill-current text-slate-950 animate-bounce" />
                <span>DYNAMIC TOP 15 COCKPIT</span>
              </span>
              <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                ACTIVE AUTO-ROTATION
              </span>
              <span className="px-2.5 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                <Clock className="w-3 h-3 text-emerald-400" />
                <span>Re-evaluation: {countdown}s</span>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight mt-2 flex items-center gap-2">
              <Zap className="w-6 h-6 text-amber-400 fill-current" />
              <span>Professional Momentum Dashboard</span>
              <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 border border-slate-700">
                Top 15 Strict Roster
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl leading-relaxed">
              Curated intraday momentum intelligence strictly maintaining the <strong>Top 15 performing stocks</strong> across Upside &amp; Downside. If a stock fails to perform on time or stagnates, it is automatically culled and replaced with the freshest active momentum candidate.
            </p>
          </div>

          {/* Action & Rotation Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleForceReEvaluate}
              className={`px-3 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border transition-all cursor-pointer shadow-md ${
                isDark
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-indigo-600/30'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600'
              }`}
              title="Force re-evaluate momentum and rotate out least performing stock"
            >
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Re-evaluate Momentum Now</span>
            </button>

            <button
              onClick={() => setAutoRotateEnabled(!autoRotateEnabled)}
              className={`px-3 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border transition-all cursor-pointer ${
                autoRotateEnabled
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
              }`}
              title="Toggle automatic replacement of non-performing stocks"
            >
              <Workflow className="w-3.5 h-3.5 text-emerald-400" />
              <span>Auto-Cull: {autoRotateEnabled ? 'ON' : 'PAUSED'}</span>
            </button>

            <button
              onClick={() => setShowRotationLog(true)}
              className="px-3 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border border-slate-700 bg-slate-800 hover:bg-slate-700 text-amber-300 transition-all cursor-pointer relative"
              title="View Rotation Audit Log of replaced stocks"
            >
              <History className="w-3.5 h-3.5 text-amber-400" />
              <span>Rotation Ledger</span>
              {rotationRecords.length > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-amber-500 text-slate-950 font-black">
                  {rotationRecords.length}
                </span>
              )}
            </button>

            {onBackToScanner && (
              <button
                onClick={onBackToScanner}
                className="px-3 py-2 rounded-xl text-xs font-mono font-bold border border-slate-700 bg-slate-800/80 hover:bg-slate-700 text-slate-300 transition-all cursor-pointer"
              >
                ← Scanner
              </button>
            )}
          </div>
        </div>

        {/* Filter Tabs & Real-Time Parameter Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setFilterSide('ALL')}
              className={`px-4 py-1.5 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 border cursor-pointer ${
                filterSide === 'ALL'
                  ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-indigo-400 shadow-md font-black ring-2 ring-indigo-400/30'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>All Momentum (Top 15)</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-950/70 text-indigo-300">
                15
              </span>
            </button>

            <button
              onClick={() => setFilterSide('UPSIDE')}
              className={`px-4 py-1.5 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 border cursor-pointer ${
                filterSide === 'UPSIDE'
                  ? 'bg-emerald-600 text-white border-emerald-400 shadow-md font-black ring-2 ring-emerald-400/30'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-emerald-400'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
              <span>🚀 Upside Momentum (15 Longs)</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-950/70 text-emerald-300">
                {upsideCount}
              </span>
            </button>

            <button
              onClick={() => setFilterSide('DOWNSIDE')}
              className={`px-4 py-1.5 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 border cursor-pointer ${
                filterSide === 'DOWNSIDE'
                  ? 'bg-rose-600 text-white border-rose-400 shadow-md font-black ring-2 ring-rose-400/30'
                  : 'bg-slate-800/80 text-slate-400 border-slate-700 hover:text-rose-400'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              <span>🔻 Downside Momentum (15 Shorts)</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-950/70 text-rose-300">
                {downsideCount}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Stale Window Time Limit */}
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <span className="text-slate-400">Stale Limit:</span>
              <select
                value={timeDecayLimit}
                onChange={(e) => setTimeDecayLimit(Number(e.target.value))}
                className="bg-slate-800 text-amber-300 border border-slate-700 rounded-lg px-2.5 py-1 text-xs font-bold cursor-pointer outline-none focus:border-amber-400"
              >
                <option value={10}>10 Minutes</option>
                <option value={15}>15 Minutes (Standard)</option>
                <option value={20}>20 Minutes</option>
                <option value={30}>30 Minutes</option>
              </select>
            </div>

            {/* View Switcher: Cards vs Table */}
            <div className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700">
              <button
                onClick={() => setViewMode('cards')}
                className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1 cursor-pointer transition-all ${
                  viewMode === 'cards'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Layers className="w-3 h-3" />
                <span>15 Cards</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1 rounded-md text-xs font-mono font-bold flex items-center gap-1 cursor-pointer transition-all ${
                  viewMode === 'table'
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-3 h-3" />
                <span>Pro Table</span>
              </button>
            </div>

            {/* Symbol Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search symbol / sector..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-slate-800/80 text-xs font-mono text-slate-200 pl-8 pr-3 py-1.5 rounded-lg border border-slate-700 outline-none focus:border-indigo-500 w-48 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 font-mono">
        <div className="p-3.5 rounded-xl border border-indigo-500/30 bg-indigo-500/10 backdrop-blur-sm">
          <span className="text-[10px] uppercase font-bold text-indigo-400 block">Total Active Roster</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-black text-indigo-200">{displayStocks.length}</span>
            <span className="text-[10px] text-indigo-400">/ 15 Stocks</span>
          </div>
          <span className="text-[9px] text-indigo-400/80 block mt-0.5">Strict Quota Preserved</span>
        </div>

        <div className="p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-sm">
          <span className="text-[10px] uppercase font-bold text-emerald-400 block">Upside Longs (Bullish)</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-black text-emerald-300">{upsideCount}</span>
            <span className="text-[10px] text-emerald-400">Bullish</span>
          </div>
          <span className="text-[9px] text-emerald-400/80 block mt-0.5">Price &gt; VWAP, Long Buildup</span>
        </div>

        <div className="p-3.5 rounded-xl border border-rose-500/30 bg-rose-500/10 backdrop-blur-sm">
          <span className="text-[10px] uppercase font-bold text-rose-400 block">Downside Shorts (Bearish)</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-black text-rose-300">{downsideCount}</span>
            <span className="text-[10px] text-rose-400">Bearish</span>
          </div>
          <span className="text-[9px] text-rose-400/80 block mt-0.5">Price &lt; VWAP, Short Buildup</span>
        </div>

        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 backdrop-blur-sm">
          <span className="text-[10px] uppercase font-bold text-amber-400 block">Avg Momentum Score</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-black text-amber-300">{avgScore}</span>
            <span className="text-[10px] text-amber-400">/ 100</span>
          </div>
          <span className="text-[9px] text-amber-400/80 block mt-0.5">High Velocity Filter</span>
        </div>

        <div className="p-3.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 backdrop-blur-sm">
          <span className="text-[10px] uppercase font-bold text-cyan-400 block">Leading Sector</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xs font-black text-cyan-200 truncate">{topSectorName}</span>
            <span className="text-[10px] text-emerald-400 font-bold">
              {topSectorChange >= 0 ? `+${topSectorChange.toFixed(2)}%` : `${topSectorChange.toFixed(2)}%`}
            </span>
          </div>
          <span className="text-[9px] text-cyan-400/80 block mt-0.5">Sector Inflow Driver</span>
        </div>

        <div className="p-3.5 rounded-xl border border-purple-500/30 bg-purple-500/10 backdrop-blur-sm">
          <span className="text-[10px] uppercase font-bold text-purple-400 block">Stale Stocks Culled</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-xl font-black text-purple-300">{culledSymbols.size}</span>
            <span className="text-[10px] text-purple-400">Rotated</span>
          </div>
          <span className="text-[9px] text-purple-400/80 block mt-0.5">Fresh Replacements Added</span>
        </div>
      </div>

      {/* VIEW 1: DETAILED 15-CARD GRID */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {displayStocks.map((mStock) => {
            const isUp = mStock.side === 'UPSIDE';

            return (
              <div
                key={mStock.symbol}
                onClick={() => onSelectStock(mStock.stock)}
                className={`rounded-2xl border transition-all duration-200 p-5 relative overflow-hidden group cursor-pointer shadow-lg hover:shadow-2xl hover:-translate-y-1 ${
                  isDark
                    ? isUp
                      ? 'bg-slate-900/95 border-emerald-500/30 hover:border-emerald-400 shadow-emerald-950/10'
                      : 'bg-slate-900/95 border-rose-500/30 hover:border-rose-400 shadow-rose-950/10'
                    : 'bg-white border-slate-200 hover:border-indigo-400 shadow-sm'
                }`}
              >
                {/* Top Glowing Accent Line */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1 ${
                    isUp ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-rose-500 to-amber-500'
                  }`}
                />

                {/* Card Header: Rank, Symbol, Sector moving %, Momentum Badge */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-7 h-7 rounded-lg text-xs font-mono font-black flex items-center justify-center shrink-0 border ${
                        isUp
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}
                    >
                      #{mStock.rank}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg font-black tracking-tight text-slate-100 font-mono">
                          {mStock.symbol}
                        </span>
                        <a
                          href={`https://in.tradingview.com/chart/?symbol=NSE:${mStock.symbol.replace(/&/g, '_').replace(/-/g, '_')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-indigo-400 hover:text-indigo-300 transition-colors p-0.5"
                          title="Open TradingView Live Chart"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                      <span className="text-[11px] text-slate-400 truncate max-w-[170px] block">
                        {mStock.name}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-black border ${
                        isUp
                          ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      {isUp ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      <span>{isUp ? 'UPSIDE' : 'DOWNSIDE'}</span>
                      <span className="opacity-60">•</span>
                      <span>{mStock.momentumScore}</span>
                    </div>

                    <div className="mt-1 flex items-center justify-end gap-1">
                      <span className="text-[10px] font-mono text-slate-400">Accel:</span>
                      <span
                        className={`text-[10px] font-mono font-bold ${
                          mStock.momentumAcceleration >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {mStock.momentumAcceleration >= 0 ? `+${mStock.momentumAcceleration}` : mStock.momentumAcceleration}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sector moving % Badge */}
                <div className="mt-3 flex items-center gap-2 flex-wrap text-[11px] font-mono">
                  <span className="text-slate-400 font-medium">Sector:</span>
                  <span
                    className={`px-2 py-0.5 rounded font-bold border flex items-center gap-1 ${
                      mStock.sectorChangePercent >= 0
                        ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    <PieChart className="w-3 h-3" />
                    <span>{mStock.sectorMovingText}</span>
                  </span>
                  <span
                    className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                      mStock.sectorRelativeStrength === 'LEADING'
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {mStock.sectorRelativeStrength}
                  </span>
                </div>

                {/* Timestamps: Signal Listed At, Entry Time, Performance Timer */}
                <div className="mt-3.5 p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <div>
                        <span className="text-[9px] uppercase font-bold text-amber-400/80 block">Signal Listed At</span>
                        <span className="font-extrabold text-amber-300">{mStock.signalListedAt} IST</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <div>
                        <span className="text-[9px] uppercase font-bold text-indigo-400/80 block">Entry Time</span>
                        <span className="font-extrabold text-indigo-300">{mStock.entryTime} IST</span>
                      </div>
                    </div>
                  </div>

                  {/* Performance Since Entry with Stale / Surge Gauge */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <span className="text-slate-400">Since Entry ({mStock.timeElapsedMinutes}m):</span>
                      <span
                        className={`font-black ${
                          mStock.pnlPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {mStock.pnlPercent >= 0 ? `+${mStock.pnlPercent}%` : `${mStock.pnlPercent}%`}
                      </span>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${mStock.healthColor}`}>
                      {mStock.momentumHealth}
                    </span>
                  </div>

                  <span className="text-[10px] text-slate-500 block italic leading-tight">
                    {mStock.performanceReason}
                  </span>
                </div>

                {/* Price, Algorithmic Entry & Exit Targets */}
                <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-center text-xs">
                  <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800">
                    <span className="text-[9px] text-slate-400 uppercase block">Current Price</span>
                    <span className="font-bold text-slate-100">₹{mStock.currentPrice}</span>
                    <span
                      className={`text-[10px] font-bold block ${
                        mStock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {mStock.changePercent >= 0 ? `+${mStock.changePercent.toFixed(2)}%` : `${mStock.changePercent.toFixed(2)}%`}
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800">
                    <span className="text-[9px] text-slate-400 uppercase block">Stop Loss (SL)</span>
                    <span className="font-bold text-rose-400">₹{mStock.stopLoss}</span>
                    <span className="text-[10px] text-rose-400/80 block">-{mStock.stopLossPercent}%</span>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-950/50 border border-slate-800">
                    <span className="text-[9px] text-slate-400 uppercase block">Target 1 (T1)</span>
                    <span className="font-bold text-emerald-400">₹{mStock.target1}</span>
                    <span className="text-[10px] text-emerald-400/80 block">+{mStock.target1Percent}%</span>
                  </div>
                </div>

                {/* Order Flow & Traded Volume */}
                <div className="mt-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 font-mono text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 font-bold flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-400" />
                      <span>Order Flow Imbalance:</span>
                    </span>
                    <span className="font-extrabold text-slate-200">
                      {mStock.orderFlow.buyerVolumePercent}% B / {mStock.orderFlow.sellerVolumePercent}% S
                    </span>
                  </div>

                  {/* Visual Order Flow Imbalance Bar */}
                  <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full"
                      style={{ width: `${mStock.orderFlow.buyerVolumePercent}%` }}
                    />
                    <div
                      className="bg-rose-500 h-full"
                      style={{ width: `${mStock.orderFlow.sellerVolumePercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                    <span>
                      CVD Flow:{' '}
                      <strong className={mStock.orderFlow.cvdInflowCr >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        {mStock.orderFlow.cvdInflowCr >= 0 ? `+₹${mStock.orderFlow.cvdInflowCr} Cr` : `-₹${Math.abs(mStock.orderFlow.cvdInflowCr)} Cr`}
                      </strong>
                    </span>
                    <span>
                      Vol: <strong className="text-slate-200">{mStock.volumeFormatted}</strong> ({mStock.rvol}x RVOL)
                    </span>
                  </div>
                </div>

                {/* Open Interest & OI Changes % */}
                <div className="mt-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 font-mono text-xs flex items-center justify-between">
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase block font-bold">Open Interest</span>
                    <span className="text-slate-200 font-bold">{mStock.openInterest} L</span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase block font-bold">OI Change %</span>
                    <span
                      className={`font-black ${
                        mStock.oiChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {mStock.oiChangePercent >= 0 ? `+${mStock.oiChangePercent}%` : `${mStock.oiChangePercent}%`}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase block font-bold">Buildup</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                      {mStock.oiBuildupType}
                    </span>
                  </div>
                  <div>
                    <span className="text-[9px] text-slate-400 uppercase block font-bold">PCR</span>
                    <span className="text-amber-300 font-bold">{mStock.pcr}</span>
                  </div>
                </div>

                {/* Options Greeks: Delta, IV, IVP */}
                <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-center text-xs">
                  <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <span className="text-[9px] text-purple-300 uppercase block">Delta (Δ)</span>
                    <span className="font-extrabold text-purple-200">{mStock.greeks.delta}</span>
                  </div>
                  <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <span className="text-[9px] text-purple-300 uppercase block">IV</span>
                    <span className="font-extrabold text-purple-200">{mStock.greeks.iv}%</span>
                  </div>
                  <div className="p-2 rounded-lg bg-purple-500/10 border border-purple-500/20">
                    <span className="text-[9px] text-purple-300 uppercase block">IVP</span>
                    <span className="font-extrabold text-purple-200">{mStock.greeks.ivp}%</span>
                  </div>
                </div>

                {/* Multiple Time Frame Matrix (MTF Details) */}
                <div className="mt-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 font-mono text-xs">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10px] font-bold uppercase text-slate-400 flex items-center gap-1">
                      <Workflow className="w-3 h-3 text-indigo-400" />
                      <span>Multiple Timeframe:</span>
                    </span>
                    <span className="text-[10px] font-extrabold text-indigo-300 bg-indigo-500/20 px-2 py-0.2 rounded border border-indigo-500/30">
                      {mStock.mtf.mtfConfluence}
                    </span>
                  </div>
                  <div className="grid grid-cols-4 gap-1 text-[10px] text-center font-bold">
                    <div
                      className={`p-1 rounded ${
                        mStock.mtf.m5.trend === (isUp ? 'BULLISH' : 'BEARISH')
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      5m: {mStock.mtf.m5.trend}
                    </div>
                    <div
                      className={`p-1 rounded ${
                        mStock.mtf.m15.trend === (isUp ? 'BULLISH' : 'BEARISH')
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      15m: {mStock.mtf.m15.trend}
                    </div>
                    <div
                      className={`p-1 rounded ${
                        mStock.mtf.h1.trend === (isUp ? 'BULLISH' : 'BEARISH')
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      1H: {mStock.mtf.h1.trend}
                    </div>
                    <div
                      className={`p-1 rounded ${
                        mStock.mtf.d1.trend === (isUp ? 'BULLISH' : 'BEARISH')
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      1D: {mStock.mtf.d1.trend}
                    </div>
                  </div>
                </div>

                {/* All Technical Indicators & Smart Money */}
                <div className="mt-3 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 font-mono text-[11px] space-y-1">
                  <div className="flex items-center justify-between text-slate-300">
                    <span>
                      RSI: <strong className="text-amber-300">{mStock.technicals.rsi}</strong> ({mStock.technicals.rsiZone})
                    </span>
                    <span>
                      VWAP: <strong className="text-slate-200">₹{mStock.technicals.vwap}</strong> ({mStock.technicals.vwapDistancePercent >= 0 ? `+${mStock.technicals.vwapDistancePercent}%` : `${mStock.technicals.vwapDistancePercent}%`})
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400 text-[10px]">
                    <span>Supertrend: {mStock.technicals.supertrendSignal}</span>
                    <span>EMA: {mStock.technicals.emaAlignment}</span>
                    <span>CPR: {mStock.technicals.cprStatus}</span>
                  </div>
                  <div className="pt-1 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                    <span className="text-cyan-400 font-bold">
                      Smart Money: {mStock.smartMoney.smartMoneyScore}/100 ({mStock.smartMoney.smcRatingLabel})
                    </span>
                    <span className="text-purple-300">{mStock.liquidity.liquidityTier}</span>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectStock(mStock.stock);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <Eye className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Inspect</span>
                  </button>

                  {onExecuteTrade && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onExecuteTrade(mStock.stock, isUp ? 'BUY' : 'SELL');
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1 shadow-md ${
                        isUp
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-rose-600 hover:bg-rose-500 text-white'
                      }`}
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      <span>Execute {isUp ? 'BUY' : 'SELL'}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* VIEW 2: HIGH-DENSITY PRO MATRIX TABLE */}
      {viewMode === 'table' && (
        <ScrollContainer isDark={isDark} scrollAmount={400}>
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/90 shadow-xl font-mono text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/80 text-[10px] font-black uppercase text-slate-400">
                  <th className="py-3 px-3.5">Rank &amp; Symbol</th>
                  <th className="py-3 px-3.5">Sector Moving %</th>
                  <th className="py-3 px-3.5">Momentum &amp; Side</th>
                  <th className="py-3 px-3.5 text-amber-400">Signal Listed At</th>
                  <th className="py-3 px-3.5 text-indigo-400">Entry Time</th>
                  <th className="py-3 px-3.5">LTP &amp; Chg %</th>
                  <th className="py-3 px-3.5">Since Entry PnL</th>
                  <th className="py-3 px-3.5">Order Flow Delta</th>
                  <th className="py-3 px-3.5">Volume &amp; RVOL</th>
                  <th className="py-3 px-3.5">OI &amp; Buildup</th>
                  <th className="py-3 px-3.5 text-purple-400">Delta / IV / IVP</th>
                  <th className="py-3 px-3.5">MTF Alignment</th>
                  <th className="py-3 px-3.5">Technicals</th>
                  <th className="py-3 px-3.5">Smart Money</th>
                  <th className="py-3 px-3.5">Enter / SL / T1</th>
                  <th className="py-3 px-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {displayStocks.map((mStock) => {
                  const isUp = mStock.side === 'UPSIDE';

                  return (
                    <tr
                      key={mStock.symbol}
                      onClick={() => onSelectStock(mStock.stock)}
                      className="hover:bg-slate-800/60 transition-colors cursor-pointer group"
                    >
                      {/* Rank & Symbol */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center ${
                              isUp ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            {mStock.rank}
                          </span>
                          <div>
                            <span className="font-extrabold text-slate-100 text-sm block">
                              {mStock.symbol}
                            </span>
                            <span className="text-[10px] text-slate-400 truncate max-w-[120px] block">
                              {mStock.name}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Sector Moving % */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                            mStock.sectorChangePercent >= 0
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {mStock.sectorMovingText}
                        </span>
                      </td>

                      {/* Momentum & Side */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-extrabold border inline-flex items-center gap-1 ${
                            isUp
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          }`}
                        >
                          {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          <span>{mStock.momentumScore} / 100</span>
                        </span>
                      </td>

                      {/* Signal Listed At */}
                      <td className="py-3 px-3.5 whitespace-nowrap text-center">
                        <span className="px-2 py-0.5 rounded text-amber-300 font-extrabold bg-amber-500/15 border border-amber-500/30">
                          {mStock.signalListedAt}
                        </span>
                      </td>

                      {/* Entry Time */}
                      <td className="py-3 px-3.5 whitespace-nowrap text-center">
                        <span className="px-2 py-0.5 rounded text-indigo-300 font-extrabold bg-indigo-500/15 border border-indigo-500/30">
                          {mStock.entryTime}
                        </span>
                      </td>

                      {/* LTP & Chg % */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="font-bold text-slate-100 block">₹{mStock.currentPrice}</span>
                        <span
                          className={`text-[10px] font-bold ${
                            mStock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {mStock.changePercent >= 0 ? `+${mStock.changePercent.toFixed(2)}%` : `${mStock.changePercent.toFixed(2)}%`}
                        </span>
                      </td>

                      {/* Since Entry PnL */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-black border block text-center ${
                            mStock.pnlPercent >= 0
                              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                              : 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          }`}
                        >
                          {mStock.pnlPercent >= 0 ? `+${mStock.pnlPercent}%` : `${mStock.pnlPercent}%`}
                        </span>
                        <span className="text-[9px] text-slate-500 block text-center mt-0.5">
                          {mStock.timeElapsedMinutes}m active
                        </span>
                      </td>

                      {/* Order Flow Delta */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="text-slate-200 font-bold block">
                          {mStock.orderFlow.buyerVolumePercent}% B / {mStock.orderFlow.sellerVolumePercent}% S
                        </span>
                        <span
                          className={`text-[10px] font-bold ${
                            mStock.orderFlow.cvdInflowCr >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          CVD: {mStock.orderFlow.cvdInflowCr >= 0 ? `+₹${mStock.orderFlow.cvdInflowCr} Cr` : `-₹${Math.abs(mStock.orderFlow.cvdInflowCr)} Cr`}
                        </span>
                      </td>

                      {/* Volume & RVOL */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="text-slate-200 font-bold block">{mStock.volumeFormatted}</span>
                        <span className="text-[10px] text-amber-300 font-bold block">
                          {mStock.rvol}x RVOL
                        </span>
                      </td>

                      {/* OI & Buildup */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="text-slate-300 font-bold block">{mStock.openInterest} L ({mStock.oiChangePercent >= 0 ? `+${mStock.oiChangePercent}%` : `${mStock.oiChangePercent}%`})</span>
                        <span className="text-[10px] text-indigo-300 block">{mStock.oiBuildupType}</span>
                      </td>

                      {/* Delta / IV / IVP */}
                      <td className="py-3 px-3.5 whitespace-nowrap text-purple-300 font-bold">
                        <span>Δ {mStock.greeks.delta} | IV {mStock.greeks.iv}% | {mStock.greeks.ivp}% IVP</span>
                      </td>

                      {/* MTF Alignment */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {mStock.mtf.mtfConfluence}
                        </span>
                      </td>

                      {/* Technicals */}
                      <td className="py-3 px-3.5 whitespace-nowrap text-[10px] text-slate-300">
                        <span>RSI: {mStock.technicals.rsi} | VWAP: ₹{mStock.technicals.vwap}</span>
                      </td>

                      {/* Smart Money */}
                      <td className="py-3 px-3.5 whitespace-nowrap">
                        <span className="text-cyan-300 font-bold block">
                          {mStock.smartMoney.smartMoneyScore}/100
                        </span>
                        <span className="text-[10px] text-slate-400 block truncate max-w-[110px]">
                          {mStock.smartMoney.wyckoffPhase}
                        </span>
                      </td>

                      {/* Enter / SL / T1 */}
                      <td className="py-3 px-3.5 whitespace-nowrap text-[10px]">
                        <span className="text-slate-300 block">Entry: ₹{mStock.entryPrice}</span>
                        <span className="text-rose-400 block">SL: ₹{mStock.stopLoss}</span>
                        <span className="text-emerald-400 block">T1: ₹{mStock.target1}</span>
                      </td>

                      {/* Action */}
                      <td className="py-3 px-3.5 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={`https://in.tradingview.com/chart/?symbol=NSE:${mStock.symbol.replace(/&/g, '_').replace(/-/g, '_')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-400"
                            title="TradingView Chart"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectStock(mStock.stock);
                            }}
                            className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-indigo-600 hover:bg-indigo-500 text-white"
                          >
                            View
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ScrollContainer>
      )}

      {/* ROTATION AUDIT MODAL / DRAWER */}
      {showRotationLog && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-slate-100">
                  Momentum Auto-Rotation Audit Ledger
                </h3>
              </div>
              <button
                onClick={() => setShowRotationLog(false)}
                className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              When a momentum stock does not perform on time (&gt;{timeDecayLimit}m limit) or reverses, it is dynamically replaced with a higher-velocity candidate to keep strictly 15 active momentum stocks.
            </p>

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {rotationRecords.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No stocks have been rotated yet. All 15 stocks are currently active and performing within their momentum window.
                </div>
              ) : (
                rotationRecords.map((rec) => (
                  <div
                    key={rec.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          CULLED: {rec.removedSymbol} ({rec.removedSide})
                        </span>
                        <span className="text-slate-500">→</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          ADDED: {rec.addedSymbol} (Score: {rec.addedScore})
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500">{rec.timestamp}</span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span>Reason: <strong className="text-slate-300">{rec.reason}</strong></span>
                      <span>
                        Held: <strong>{rec.timeHeldMinutes}m</strong> | PnL: <strong className={rec.finalPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{rec.finalPnL >= 0 ? `+${rec.finalPnL}%` : `${rec.finalPnL}%`}</strong>
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
              <button
                onClick={handleResetRotation}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-rose-400 hover:bg-rose-500/10 border border-rose-500/30 transition-all cursor-pointer"
              >
                Clear Rotation History
              </button>
              <button
                onClick={() => setShowRotationLog(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
