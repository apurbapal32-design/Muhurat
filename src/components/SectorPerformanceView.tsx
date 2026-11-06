import React, { useState, useMemo } from 'react';
import {
  PieChart,
  TrendingUp,
  TrendingDown,
  Layers,
  Search,
  Zap,
  BarChart2,
  ArrowUpDown,
  Filter,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ArrowLeft,
  Activity,
  Info,
  LayoutGrid,
  SlidersHorizontal,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Compass,
  Award,
  Clock,
} from 'lucide-react';
import { ScannedStock } from '../types';
import {
  calculateSectorPerformance,
  getOiDetailedAction,
  getVolumeXTime,
  SectorPerformanceInfo,
} from '../utils/sectorAndOiHelpers';
import { getStockListedAt, getStockEntryTime } from '../utils/timingHelpers';

interface SectorPerformanceViewProps {
  stocks: ScannedStock[];
  onSelectStock: (stock: ScannedStock) => void;
  onBackToScanner?: () => void;
  theme?: 'dark' | 'light';
}

type SizingMetric = 'turnover' | 'volume' | 'rvol' | 'equal';
type SectorViewMode = 'heatmap' | 'relative-strength' | 'cards';
type PerformanceFilter = 'ALL' | 'GAINERS' | 'LOSERS' | 'OUTPERFORMING' | 'EXTREME';
type SectorSortOrder = 'PERFORMANCE' | 'BREADTH' | 'TURNOVER' | 'ALPHABETICAL';

export function SectorPerformanceView({
  stocks,
  onSelectStock,
  onBackToScanner,
  theme = 'dark',
}: SectorPerformanceViewProps) {
  const isDark = theme === 'dark';

  const [viewMode, setViewMode] = useState<SectorViewMode>('heatmap');
  const [sizingMetric, setSizingMetric] = useState<SizingMetric>('turnover');
  const [performanceFilter, setPerformanceFilter] = useState<PerformanceFilter>('ALL');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sectorSort, setSectorSort] = useState<SectorSortOrder>('PERFORMANCE');
  const [hoveredStock, setHoveredStock] = useState<ScannedStock | null>(null);
  const [expandedSector, setExpandedSector] = useState<string | null>(null);

  // Calculate Nifty Benchmark baseline (e.g. NIFTY index or average change of all stocks)
  const benchmarkChange = useMemo(() => {
    const niftyStock = stocks.find((s) => s.symbol === 'NIFTY' || s.symbol === 'NIFTY 50');
    if (niftyStock) return niftyStock.changePercent;
    if (stocks.length === 0) return 0;
    const avg = stocks.reduce((acc, s) => acc + s.changePercent, 0) / stocks.length;
    return Number(avg.toFixed(2));
  }, [stocks]);

  // Compute overall sector performances with Relative Strength metrics
  const sectors = useMemo(() => {
    const baseSectors = calculateSectorPerformance(stocks);
    return baseSectors.map((sec) => {
      // Relative Strength vs Benchmark = Sector Avg % - Benchmark Avg %
      const relativeStrength = Number((sec.avgChangePercent - benchmarkChange).toFixed(2));
      const sectorStocks = stocks.filter((s) => s.sector === sec.sectorName);

      // Turnover in ₹ Crores (turnover = price * volume / 10,000,000)
      const totalTurnoverCr = Number(
        (
          sectorStocks.reduce((sum, s) => sum + s.price * (s.volume || 10000), 0) / 10000000
        ).toFixed(1)
      );

      // Breadth ratio
      const breadthRatio = sec.totalStocks > 0 ? (sec.positiveCount / sec.totalStocks) * 100 : 50;

      // Classify sector momentum category
      let momentumCategory: 'LEADER' | 'IMPROVING' | 'WEAKENING' | 'LAGGING' = 'IMPROVING';
      if (relativeStrength >= 0.3 && breadthRatio >= 60) {
        momentumCategory = 'LEADER';
      } else if (relativeStrength < -0.3 && breadthRatio <= 40) {
        momentumCategory = 'LAGGING';
      } else if (relativeStrength >= 0) {
        momentumCategory = 'WEAKENING';
      } else {
        momentumCategory = 'IMPROVING';
      }

      return {
        ...sec,
        relativeStrength,
        totalTurnoverCr,
        breadthRatio,
        momentumCategory,
      };
    });
  }, [stocks, benchmarkChange]);

  // Extract unique sector names for filter dropdown
  const allSectorNames = useMemo(() => {
    const names = sectors.map((s) => s.sectorName);
    return names.sort();
  }, [sectors]);

  // Sorted and filtered sectors list
  const filteredAndSortedSectors = useMemo(() => {
    let list = sectors.filter((sec) => {
      // Sector filter
      if (selectedSector !== 'ALL' && sec.sectorName !== selectedSector) return false;

      // Text search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesSector = sec.sectorName.toLowerCase().includes(query);
        const matchesStock = stocks.some(
          (s) =>
            s.sector === sec.sectorName &&
            (s.symbol.toLowerCase().includes(query) || s.name.toLowerCase().includes(query))
        );
        if (!matchesSector && !matchesStock) return false;
      }

      // Performance filter
      if (performanceFilter === 'GAINERS' && sec.avgChangePercent <= 0) return false;
      if (performanceFilter === 'LOSERS' && sec.avgChangePercent >= 0) return false;
      if (performanceFilter === 'OUTPERFORMING' && sec.relativeStrength <= 0) return false;
      if (performanceFilter === 'EXTREME' && Math.abs(sec.avgChangePercent) < 1.0) return false;

      return true;
    });

    // Sort order
    return list.sort((a, b) => {
      if (sectorSort === 'PERFORMANCE') {
        return b.avgChangePercent - a.avgChangePercent;
      }
      if (sectorSort === 'BREADTH') {
        return b.breadthRatio - a.breadthRatio;
      }
      if (sectorSort === 'TURNOVER') {
        return b.totalTurnoverCr - a.totalTurnoverCr;
      }
      if (sectorSort === 'ALPHABETICAL') {
        return a.sectorName.localeCompare(b.sectorName);
      }
      return 0;
    });
  }, [sectors, stocks, selectedSector, searchQuery, performanceFilter, sectorSort]);

  // Overall Market Breadth
  const overallBreadth = useMemo(() => {
    let posCount = 0;
    let negCount = 0;
    let flatCount = 0;
    let totalVolume = 0;
    let totalTurnoverCr = 0;

    stocks.forEach((s) => {
      if (s.changePercent > 0.05) posCount++;
      else if (s.changePercent < -0.05) negCount++;
      else flatCount++;

      totalVolume += s.volume || 10000;
      totalTurnoverCr += (s.price * (s.volume || 10000)) / 10000000;
    });

    const total = stocks.length || 1;
    const posPercent = Math.round((posCount / total) * 100);
    const negPercent = Math.round((negCount / total) * 100);

    const sortedByChange = [...sectors].sort((a, b) => b.avgChangePercent - a.avgChangePercent);
    const topSector = sortedByChange[0];
    const bottomSector = sortedByChange[sortedByChange.length - 1];

    return {
      posCount,
      negCount,
      flatCount,
      posPercent,
      negPercent,
      topSector,
      bottomSector,
      totalVolume,
      totalTurnoverCr: Math.round(totalTurnoverCr),
    };
  }, [stocks, sectors]);

  // Sizing weight calculation for individual stock tiles
  const getStockTileWeight = (stock: ScannedStock): number => {
    if (sizingMetric === 'equal') return 1;
    if (sizingMetric === 'rvol') return Math.max(0.5, stock.indicators.rvol || 1.0);
    if (sizingMetric === 'volume') return Math.max(10000, stock.volume || 10000);
    // default: Turnover = price * volume
    const turnover = stock.price * (stock.volume || 10000);
    return Math.max(200000, turnover);
  };

  // Color gradient calculation based on stock change %
  const getStockHeatmapColor = (changePercent: number) => {
    if (changePercent >= 3.0) {
      return isDark
        ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/40 shadow-emerald-900/30'
        : 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-500 shadow-sm';
    }
    if (changePercent >= 1.5) {
      return isDark
        ? 'bg-emerald-700/90 hover:bg-emerald-600/90 text-emerald-50 border-emerald-500/30'
        : 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-600';
    }
    if (changePercent >= 0.5) {
      return isDark
        ? 'bg-emerald-800/80 hover:bg-emerald-700/80 text-emerald-100 border-emerald-600/30'
        : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-900 border-emerald-300';
    }
    if (changePercent > 0.05) {
      return isDark
        ? 'bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-200 border-emerald-800/30'
        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200';
    }
    if (changePercent >= -0.05 && changePercent <= 0.05) {
      return isDark
        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700/40'
        : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200';
    }
    if (changePercent > -0.5) {
      return isDark
        ? 'bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 border-rose-800/30'
        : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border-rose-200';
    }
    if (changePercent > -1.5) {
      return isDark
        ? 'bg-rose-800/80 hover:bg-rose-700/80 text-rose-100 border-rose-600/30'
        : 'bg-rose-100 hover:bg-rose-200 text-rose-900 border-rose-300';
    }
    if (changePercent > -3.0) {
      return isDark
        ? 'bg-rose-700/90 hover:bg-rose-600/90 text-rose-50 border-rose-500/30'
        : 'bg-rose-500 hover:bg-rose-600 text-white border-rose-600';
    }
    return isDark
      ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400/40 shadow-rose-900/30'
      : 'bg-rose-600 hover:bg-rose-500 text-white border-rose-500 shadow-sm';
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Top Banner & KPI Header */}
      <div
        className={`p-6 rounded-2xl border transition-all relative overflow-hidden ${
          isDark
            ? 'bg-gradient-to-br from-slate-900 via-indigo-950/40 to-slate-900 border-slate-800 text-slate-100 shadow-xl'
            : 'bg-gradient-to-br from-slate-50 via-indigo-50/40 to-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <PieChart className="w-3.5 h-3.5" /> SECTOR-WISE PERFORMANCE HEATMAP
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-[11px] font-mono text-slate-400">
                {sectors.length} Sectors Mapped
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-[11px] font-mono text-slate-400">
                Benchmark Nifty: <strong className={benchmarkChange >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{benchmarkChange >= 0 ? '+' : ''}{benchmarkChange}%</strong>
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 flex items-center gap-2">
              Sector Relative Strength &amp; Industry Heatmap
            </h1>
            <p className="text-xs font-mono text-slate-400 mt-1 max-w-3xl">
              Real-time sector rotation matrix mapping all Nifty 200 constituents to industry groups. Color-graded by price change percentage, sized by institutional turnover or volume, with relative strength (RS) alpha benchmarking.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onBackToScanner && (
              <button
                onClick={onBackToScanner}
                className="px-4 py-2 text-xs font-semibold font-mono bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/25 transition-all"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Scanner</span>
              </button>
            )}
          </div>
        </div>

        {/* Macro Sector Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-slate-800/60">
          <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
            <span className="text-[10px] font-mono font-medium uppercase text-slate-400 block">Leading Bullish Sector</span>
            {overallBreadth.topSector ? (
              <div className="mt-1 font-mono">
                <div className="text-sm font-bold text-emerald-400 flex items-center gap-1.5 truncate">
                  <TrendingUp className="w-4 h-4 shrink-0" />
                  <span className="truncate">{overallBreadth.topSector.sectorName}</span>
                </div>
                <div className="text-[11px] text-emerald-300/90 mt-0.5 tabular-nums">
                  +{overallBreadth.topSector.avgChangePercent}% · RS +{overallBreadth.topSector.relativeStrength}% ({overallBreadth.topSector.positiveCount} Gainers)
                </div>
              </div>
            ) : (
              <span className="text-xs text-slate-500 font-mono">—</span>
            )}
          </div>

          <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
            <span className="text-[10px] font-mono font-medium uppercase text-slate-400 block">Lagging Drag Sector</span>
            {overallBreadth.bottomSector ? (
              <div className="mt-1 font-mono">
                <div className="text-sm font-bold text-rose-400 flex items-center gap-1.5 truncate">
                  <TrendingDown className="w-4 h-4 shrink-0" />
                  <span className="truncate">{overallBreadth.bottomSector.sectorName}</span>
                </div>
                <div className="text-[11px] text-rose-300/90 mt-0.5 tabular-nums">
                  {overallBreadth.bottomSector.avgChangePercent}% · RS {overallBreadth.bottomSector.relativeStrength}% ({overallBreadth.bottomSector.negativeCount} Losers)
                </div>
              </div>
            ) : (
              <span className="text-xs text-slate-500 font-mono">—</span>
            )}
          </div>

          <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
            <span className="text-[10px] font-mono font-medium uppercase text-slate-400 block">Market Breadth Ratio</span>
            <div className="flex items-center justify-between font-mono font-semibold text-xs mt-1 tabular-nums">
              <span className="text-emerald-400">{overallBreadth.posCount} Advance</span>
              <span className="text-slate-400">{overallBreadth.flatCount} Flat</span>
              <span className="text-rose-400">{overallBreadth.negCount} Decline</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden flex">
              <div className="bg-emerald-500 h-full transition-all" style={{ width: `${overallBreadth.posPercent}%` }}></div>
              <div className="bg-slate-600 h-full transition-all" style={{ width: `${100 - overallBreadth.posPercent - overallBreadth.negPercent}%` }}></div>
              <div className="bg-rose-500 h-full transition-all" style={{ width: `${overallBreadth.negPercent}%` }}></div>
            </div>
          </div>

          <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
            <span className="text-[10px] font-mono font-medium uppercase text-slate-400 block">F&amp;O Sector Turnover</span>
            <div className="text-sm font-bold text-indigo-400 font-mono mt-1 tabular-nums">
              ₹{overallBreadth.totalTurnoverCr.toLocaleString('en-IN')} Cr
            </div>
            <span className="text-[10px] block text-slate-400 font-mono mt-0.5">
              Across {stocks.length} active universe stocks
            </span>
          </div>
        </div>
      </div>

      {/* Primary Toolbar & Navigation Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 rounded-xl border bg-slate-950/80 border-slate-800 font-mono text-xs">
        {/* Left: View Mode Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-lg border border-slate-800">
          <button
            onClick={() => setViewMode('heatmap')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
              viewMode === 'heatmap'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Sector Heatmap</span>
          </button>

          <button
            onClick={() => setViewMode('relative-strength')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
              viewMode === 'relative-strength'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BarChart2 className="w-3.5 h-3.5" />
            <span>RS Leaderboard</span>
          </button>

          <button
            onClick={() => setViewMode('cards')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
              viewMode === 'cards'
                ? 'bg-indigo-600 text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Sector Cards</span>
          </button>
        </div>

        {/* Right: Sizing, Sorting, and Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Tile Size Mode (Only relevant for heatmap) */}
          {viewMode === 'heatmap' && (
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-slate-400">
              <span className="px-2 text-[11px] text-slate-500 font-medium hidden sm:inline">Size:</span>
              {(
                [
                  { id: 'turnover', label: 'Turnover (₹)' },
                  { id: 'volume', label: 'Volume' },
                  { id: 'rvol', label: 'RVOL' },
                  { id: 'equal', label: 'Equal' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  onClick={() => setSizingMetric(m.id)}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition-all ${
                    sizingMetric === m.id
                      ? 'bg-slate-800 text-slate-100 font-semibold'
                      : 'hover:text-slate-200'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}

          {/* Sector Selector */}
          <select
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Sectors ({sectors.length})</option>
            {allSectorNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>

          {/* Performance Filter */}
          <select
            value={performanceFilter}
            onChange={(e) => setPerformanceFilter(e.target.value as PerformanceFilter)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Stocks</option>
            <option value="GAINERS">🟢 Gainers Only</option>
            <option value="LOSERS">🔴 Losers Only</option>
            <option value="OUTPERFORMING">⚡ Outperforming Nifty (RS &gt; 0)</option>
            <option value="EXTREME">🔥 Movers &gt; 1%</option>
          </select>

          {/* Sort Order */}
          <select
            value={sectorSort}
            onChange={(e) => setSectorSort(e.target.value as SectorSortOrder)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 text-xs focus:outline-none focus:border-indigo-500"
          >
            <option value="PERFORMANCE">Sort: Performance %</option>
            <option value="BREADTH">Sort: Gainer Breadth %</option>
            <option value="TURNOVER">Sort: Turnover Volume</option>
            <option value="ALPHABETICAL">Sort: Sector Name (A-Z)</option>
          </select>

          {/* Quick Search */}
          <div className="relative min-w-[160px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search ticker or sector..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Heatmap Color Scale Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-950/60 rounded-xl border border-slate-800/60 text-xs font-mono text-slate-400">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400 uppercase font-medium">Performance Heatmap Color Legend:</span>
        </div>

        <div className="flex items-center gap-2 flex-1 max-w-lg mx-2">
          <span className="text-rose-400 font-bold tabular-nums text-[11px]">&le; -3.0%</span>
          <div className="h-2.5 flex-1 rounded-full bg-gradient-to-r from-rose-600 via-rose-900 via-50% to-emerald-950 to-emerald-600 border border-slate-800" />
          <span className="text-emerald-400 font-bold tabular-nums text-[11px]">&ge; +3.0%</span>
        </div>

        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-emerald-400">● Bullish Flow</span>
          <span className="text-slate-500">·</span>
          <span className="text-slate-400">● Neutral</span>
          <span className="text-slate-500">·</span>
          <span className="text-rose-400">● Bearish Pressure</span>
        </div>
      </div>

      {/* Main View Display Area */}
      {viewMode === 'heatmap' && (
        <div className="space-y-4">
          {filteredAndSortedSectors.length === 0 ? (
            <div className="p-12 text-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 text-slate-400 font-mono">
              <Filter className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm font-semibold">No sectors or stocks matched your active filter.</p>
              <button
                onClick={() => {
                  setSelectedSector('ALL');
                  setPerformanceFilter('ALL');
                  setSearchQuery('');
                }}
                className="mt-3 text-xs text-indigo-400 hover:underline"
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filteredAndSortedSectors.map((sec) => {
                const sectorStocks = stocks.filter((s) => s.sector === sec.sectorName);
                if (sectorStocks.length === 0) return null;

                // Filter stocks according to performanceFilter
                const visibleStocks = sectorStocks.filter((s) => {
                  if (performanceFilter === 'GAINERS' && s.changePercent <= 0) return false;
                  if (performanceFilter === 'LOSERS' && s.changePercent >= 0) return false;
                  if (performanceFilter === 'OUTPERFORMING' && s.changePercent <= benchmarkChange) return false;
                  if (performanceFilter === 'EXTREME' && Math.abs(s.changePercent) < 1.0) return false;
                  if (searchQuery.trim()) {
                    const q = searchQuery.toLowerCase().trim();
                    return s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
                  }
                  return true;
                });

                // Sort stocks inside each sector container by weight descending
                visibleStocks.sort((a, b) => getStockTileWeight(b) - getStockTileWeight(a));

                const isPositive = sec.avgChangePercent >= 0;
                const isOutperforming = sec.relativeStrength > 0;

                return (
                  <div
                    key={sec.sectorName}
                    className={`p-4 rounded-xl border flex flex-col justify-between transition-all ${
                      isDark
                        ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-md'
                        : 'bg-white border-slate-200 text-slate-900 shadow-sm'
                    }`}
                  >
                    {/* Sector Cluster Header */}
                    <div className="pb-3 border-b border-slate-800/80 mb-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-sm text-slate-100 font-mono tracking-tight uppercase truncate">
                              {sec.sectorName}
                            </h3>
                            <span
                              className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold tabular-nums ${
                                isOutperforming
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                              }`}
                            >
                              RS {sec.relativeStrength >= 0 ? '+' : ''}{sec.relativeStrength}%
                            </span>
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                            <span>{sec.totalStocks} Stocks</span>
                            <span>·</span>
                            <span>₹{sec.totalTurnoverCr} Cr Turnover</span>
                            <span>·</span>
                            <span>{sec.positiveCount} Adv / {sec.negativeCount} Dec</span>
                          </div>
                        </div>

                        {/* Sector Avg Return */}
                        <div className="text-right font-mono shrink-0">
                          <span
                            className={`text-base font-bold tabular-nums block leading-tight ${
                              isPositive ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isPositive ? '+' : ''}{sec.avgChangePercent.toFixed(2)}%
                          </span>
                          <span className="text-[10px] text-slate-500 block">Avg Change</span>
                        </div>
                      </div>

                      {/* Breadth Mini Progress Bar */}
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2.5 overflow-hidden flex">
                        <div
                          className="bg-emerald-500 h-full transition-all"
                          style={{ width: `${sec.breadthRatio}%` }}
                        />
                        <div
                          className="bg-rose-500 h-full transition-all"
                          style={{ width: `${100 - sec.breadthRatio}%` }}
                        />
                      </div>
                    </div>

                    {/* Stock Heat Tiles Container */}
                    <div className="flex flex-wrap gap-1.5 flex-1 items-start content-start min-h-[110px]">
                      {visibleStocks.length === 0 ? (
                        <div className="w-full py-6 text-center text-xs text-slate-500 font-mono">
                          No stocks matched filter criteria in this sector.
                        </div>
                      ) : (
                        visibleStocks.map((stock) => {
                          const weight = getStockTileWeight(stock);
                          const isLeader = stock.changePercent >= sec.avgChangePercent + 0.8;
                          const volX = getVolumeXTime(stock);
                          const listedAt = getStockListedAt(stock);
                          const entryTime = getStockEntryTime(stock);

                          return (
                            <div
                              key={stock.symbol}
                              onClick={() => onSelectStock(stock)}
                              onMouseEnter={() => setHoveredStock(stock)}
                              onMouseLeave={() => setHoveredStock(null)}
                              style={{
                                flexGrow: sizingMetric === 'equal' ? 1 : Math.max(1, Math.round(weight / 6000000)),
                                flexBasis: sizingMetric === 'equal' ? '28%' : `${Math.min(48, Math.max(22, Math.round(weight / 1800000)))}%`,
                              }}
                              className={`group relative min-w-[76px] min-h-[50px] p-2 rounded-lg border transition-all cursor-pointer flex flex-col justify-between overflow-hidden shadow-xs hover:scale-[1.03] hover:z-20 ${getStockHeatmapColor(
                                stock.changePercent
                              )}`}
                            >
                              {/* Top row: Symbol and leader/surge indicator */}
                              <div className="flex items-center justify-between gap-1 leading-none">
                                <span className="font-mono font-bold text-xs tracking-tight truncate">
                                  {stock.symbol}
                                </span>
                                {isLeader && (
                                  <span className="text-[9px] font-mono text-amber-300 font-bold" title="Sector Outperformer">
                                    ★
                                  </span>
                                )}
                              </div>

                              {/* Bottom row: Price and Change % */}
                              <div className="flex items-baseline justify-between mt-1 gap-1 leading-none font-mono">
                                <span className="text-[10px] opacity-80 tabular-nums">
                                  ₹{stock.price >= 1000 ? Math.round(stock.price) : stock.price.toFixed(1)}
                                </span>
                                <span className="text-[11px] font-bold tabular-nums">
                                  {stock.changePercent >= 0 ? '+' : ''}
                                  {stock.changePercent.toFixed(2)}%
                                </span>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    {/* Sector Footer Quick Info */}
                    <div className="pt-2.5 mt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>
                        Top: <strong className="text-emerald-400">{sec.topGainer?.symbol || '—'}</strong> ({sec.topGainer ? `+${sec.topGainer.changePercent}%` : '—'})
                      </span>
                      <span>
                        Low: <strong className="text-rose-400">{sec.topLoser?.symbol || '—'}</strong> ({sec.topLoser ? `${sec.topLoser.changePercent}%` : '—'})
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Relative Strength Leaderboard & Rotation Radar Mode */}
      {viewMode === 'relative-strength' && (
        <div className="space-y-6">
          {/* Quadrant Breakdown Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 font-mono">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-emerald-400 uppercase flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5" /> Leading Sectors
                </span>
                <span className="text-xs text-emerald-300 font-bold">
                  {sectors.filter((s) => s.momentumCategory === 'LEADER').length}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Strong alpha, RS &gt; 0.3% vs Nifty with broad constituent participation (&gt;60% gainers).
              </p>
            </div>

            <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-950/20 font-mono">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-blue-400 uppercase flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5" /> Improving / Rotational
                </span>
                <span className="text-xs text-blue-300 font-bold">
                  {sectors.filter((s) => s.momentumCategory === 'IMPROVING').length}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Accumulation underway, increasing breadth and momentum turning positive.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/20 font-mono">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-amber-400 uppercase flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5" /> Weakening Momentum
                </span>
                <span className="text-xs text-amber-300 font-bold">
                  {sectors.filter((s) => s.momentumCategory === 'WEAKENING').length}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Mildly positive or flat but losing relative speed against the benchmark.
              </p>
            </div>

            <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-950/20 font-mono">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-rose-400 uppercase flex items-center gap-1.5">
                  <TrendingDown className="w-3.5 h-3.5" /> Lagging Sectors
                </span>
                <span className="text-xs text-rose-300 font-bold">
                  {sectors.filter((s) => s.momentumCategory === 'LAGGING').length}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Underperforming benchmark with heavy selling pressure and distribution.
              </p>
            </div>
          </div>

          {/* Detailed Relative Strength Ranked Table */}
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden font-mono text-xs">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-tight">
                  NSE Industry Relative Strength Matrix
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Ranked by relative strength alpha against Benchmark Nifty ({benchmarkChange >= 0 ? '+' : ''}{benchmarkChange}%)
                </p>
              </div>
              <span className="text-xs text-slate-400">{filteredAndSortedSectors.length} Sectors</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-950/80 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Rank &amp; Sector Name</th>
                    <th className="py-3 px-4 text-center">Momentum Status</th>
                    <th className="py-3 px-4 text-right">Avg Return %</th>
                    <th className="py-3 px-4 text-right">RS vs Benchmark</th>
                    <th className="py-3 px-4 text-center">Gainer Breadth</th>
                    <th className="py-3 px-4 text-right">Turnover</th>
                    <th className="py-3 px-4">Sector Star Leader</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredAndSortedSectors.map((sec, idx) => {
                    const isPositive = sec.avgChangePercent >= 0;
                    const isOutperforming = sec.relativeStrength > 0;

                    return (
                      <tr
                        key={sec.sectorName}
                        className="hover:bg-slate-800/40 transition-colors"
                      >
                        <td className="py-3 px-4 font-bold text-slate-200">
                          <div className="flex items-center gap-2">
                            <span className="text-slate-500 text-[10px] tabular-nums w-4">
                              #{idx + 1}
                            </span>
                            <span>{sec.sectorName}</span>
                            <span className="text-[10px] text-slate-500 font-normal">
                              ({sec.totalStocks} stocks)
                            </span>
                          </div>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              sec.momentumCategory === 'LEADER'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : sec.momentumCategory === 'IMPROVING'
                                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                : sec.momentumCategory === 'WEAKENING'
                                ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                                : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {sec.momentumCategory}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right font-bold tabular-nums">
                          <span className={isPositive ? 'text-emerald-400' : 'text-rose-400'}>
                            {isPositive ? '+' : ''}{sec.avgChangePercent.toFixed(2)}%
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right font-bold tabular-nums">
                          <span className={isOutperforming ? 'text-emerald-400' : 'text-rose-400'}>
                            {sec.relativeStrength >= 0 ? '+' : ''}{sec.relativeStrength.toFixed(2)}%
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <div className="w-28 mx-auto space-y-1">
                            <div className="flex justify-between text-[10px] tabular-nums text-slate-400">
                              <span className="text-emerald-400">{sec.positiveCount}</span>
                              <span className="text-rose-400">{sec.negativeCount}</span>
                            </div>
                            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
                              <div
                                className="bg-emerald-500 h-full"
                                style={{ width: `${sec.breadthRatio}%` }}
                              />
                              <div
                                className="bg-rose-500 h-full"
                                style={{ width: `${100 - sec.breadthRatio}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        <td className="py-3 px-4 text-right tabular-nums text-slate-300">
                          ₹{sec.totalTurnoverCr} Cr
                        </td>

                        <td className="py-3 px-4">
                          {sec.topGainer ? (
                            <button
                              onClick={() => onSelectStock(sec.topGainer!)}
                              className="text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1.5 font-bold"
                            >
                              <span>{sec.topGainer.symbol}</span>
                              <span className="text-emerald-400 text-[10px] font-normal tabular-nums">
                                (+{sec.topGainer.changePercent}%)
                              </span>
                            </button>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => {
                              setSelectedSector(sec.sectorName);
                              setViewMode('heatmap');
                            }}
                            className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[11px] transition-colors"
                          >
                            Inspect Heatmap
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Classic Sector Cards View */}
      {viewMode === 'cards' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAndSortedSectors.map((sec) => {
            const isPositive = sec.avgChangePercent >= 0;
            const isExpanded = expandedSector === sec.sectorName;
            const sectorConstituents = stocks.filter((s) => s.sector === sec.sectorName);

            return (
              <div
                key={sec.sectorName}
                className={`p-5 rounded-2xl border transition-all ${
                  isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900 shadow-sm'
                }`}
              >
                {/* Card Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-base uppercase tracking-tight font-mono">
                        {sec.sectorName}
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase border ${
                          isPositive
                            ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                        }`}
                      >
                        {isPositive ? 'POSITIVE' : 'NEGATIVE'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                      {sec.totalStocks} Stocks · ₹{sec.totalTurnoverCr} Cr · Score: {sec.avgScore}/100
                    </span>
                  </div>

                  <div className="text-right font-mono">
                    <span
                      className={`text-lg font-bold tabular-nums block ${
                        isPositive ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isPositive ? '+' : ''}
                      {sec.avgChangePercent}%
                    </span>
                    <span className="text-[10px] text-slate-500">Avg Sector Change</span>
                  </div>
                </div>

                {/* Progress Bar for Sector Breadth */}
                <div className="space-y-1 mb-4 font-mono">
                  <div className="flex items-center justify-between text-[10px] font-bold tabular-nums">
                    <span className="text-emerald-400">{sec.positiveCount} Positive</span>
                    <span className="text-slate-500">{sec.neutralCount} Flat</span>
                    <span className="text-rose-400">{sec.negativeCount} Negative</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden flex">
                    <div
                      className="bg-emerald-500 h-full"
                      style={{ width: `${(sec.positiveCount / sec.totalStocks) * 100}%` }}
                    />
                    <div
                      className="bg-slate-600 h-full"
                      style={{ width: `${(sec.neutralCount / sec.totalStocks) * 100}%` }}
                    />
                    <div
                      className="bg-rose-500 h-full"
                      style={{ width: `${(sec.negativeCount / sec.totalStocks) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Top Gainer & Loser */}
                <div className="grid grid-cols-2 gap-2 mb-4 font-mono text-xs">
                  <div
                    onClick={() => sec.topGainer && onSelectStock(sec.topGainer)}
                    className={`p-2.5 rounded-xl border cursor-pointer hover:border-emerald-500/50 transition-all ${
                      isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <span className="text-[9px] uppercase font-bold text-emerald-400 block">Top Gainer</span>
                    {sec.topGainer ? (
                      <div>
                        <span className="font-bold text-slate-200 text-xs block truncate">{sec.topGainer.symbol}</span>
                        <span className="text-[10px] text-emerald-400 font-bold tabular-nums">
                          +{sec.topGainer.changePercent}% (₹{sec.topGainer.price})
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs opacity-50">—</span>
                    )}
                  </div>

                  <div
                    onClick={() => sec.topLoser && onSelectStock(sec.topLoser)}
                    className={`p-2.5 rounded-xl border cursor-pointer hover:border-rose-500/50 transition-all ${
                      isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <span className="text-[9px] uppercase font-bold text-rose-400 block">Top Loser</span>
                    {sec.topLoser ? (
                      <div>
                        <span className="font-bold text-slate-200 text-xs block truncate">{sec.topLoser.symbol}</span>
                        <span className="text-[10px] text-rose-400 font-bold tabular-nums">
                          {sec.topLoser.changePercent}% (₹{sec.topLoser.price})
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs opacity-50">—</span>
                    )}
                  </div>
                </div>

                {/* Toggle Constituent List */}
                <button
                  onClick={() => setExpandedSector(isExpanded ? null : sec.sectorName)}
                  className={`w-full py-2 px-3 rounded-xl text-xs font-mono font-semibold border flex items-center justify-between transition-all ${
                    isDark
                      ? 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-200'
                      : 'bg-slate-100 hover:bg-slate-200 border-slate-200 text-slate-800'
                  }`}
                >
                  <span>{isExpanded ? 'Hide Stocks List' : `View ${sectorConstituents.length} Sector Stocks`}</span>
                  <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </button>

                {/* Expanded Stock Constituents */}
                {isExpanded && (
                  <div className="mt-3 pt-3 border-t border-slate-800/60 space-y-2 font-mono">
                    {sectorConstituents.map((stock) => {
                      const volX = getVolumeXTime(stock);
                      const oiAction = getOiDetailedAction(stock);
                      const listedAt = getStockListedAt(stock);
                      const entryTime = getStockEntryTime(stock);

                      return (
                        <div
                          key={stock.symbol}
                          onClick={() => onSelectStock(stock)}
                          className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 cursor-pointer transition-all hover:border-indigo-500/50 ${
                            isDark ? 'bg-slate-950/80 border-slate-800/80' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold text-xs text-indigo-400 hover:underline">{stock.symbol}</span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[9px] font-bold border ${oiAction.badgeBg} ${oiAction.badgeText} ${oiAction.badgeBorder}`}
                              >
                                {oiAction.actionLabel}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2">
                              <span>Entry: {entryTime}</span>
                              <span>·</span>
                              <span className={`px-1.5 py-0.2 rounded font-bold border ${volX.badgeColor}`}>
                                {volX.formatted}
                              </span>
                            </div>
                          </div>

                          <div className="text-right tabular-nums">
                            <span className="font-bold text-xs block text-slate-200">
                              ₹{stock.price.toLocaleString('en-IN')}
                            </span>
                            <span
                              className={`text-[10px] font-bold block ${
                                stock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {stock.changePercent >= 0 ? '+' : ''}
                              {stock.changePercent}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Floating Stock Hover Tooltip */}
      {hoveredStock && (
        <div className="fixed bottom-6 right-6 z-50 min-w-[300px] bg-slate-900 border border-slate-700/80 rounded-2xl p-4 shadow-2xl backdrop-blur-xl pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-150 font-mono">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <div>
              <h4 className="font-bold text-base text-slate-100 flex items-center gap-2">
                {hoveredStock.symbol}
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                    hoveredStock.signal === 'BUY'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : hoveredStock.signal === 'SELL'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {hoveredStock.signal}
                </span>
              </h4>
              <p className="text-xs text-slate-400 truncate max-w-[200px]">
                {hoveredStock.name}
              </p>
            </div>
            <div className="text-right tabular-nums">
              <div className="text-sm font-bold text-slate-100">
                ₹{hoveredStock.price.toLocaleString('en-IN')}
              </div>
              <div
                className={`text-xs font-bold ${
                  hoveredStock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {hoveredStock.changePercent >= 0 ? '+' : ''}
                {hoveredStock.changePercent.toFixed(2)}%
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block">INDUSTRY SECTOR</span>
              <span className="text-indigo-400 font-bold truncate block">
                {hoveredStock.sector}
              </span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block">RELATIVE STRENGTH</span>
              <span className="text-emerald-400 font-bold tabular-nums">
                {hoveredStock.changePercent >= benchmarkChange ? 'Outperforming' : 'Lagging'}
              </span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block">ENTRY / TIMING</span>
              <span className="text-slate-200 font-bold tabular-nums">
                {getStockEntryTime(hoveredStock)} (Lst {getStockListedAt(hoveredStock)})
              </span>
            </div>
            <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
              <span className="text-slate-500 text-[10px] block">RVOL / PACE</span>
              <span className="text-amber-400 font-bold tabular-nums">
                {hoveredStock.indicators?.rvol?.toFixed(2) || '1.00'}x
              </span>
            </div>
          </div>

          <div className="mt-2.5 text-[10px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/80">
            <span className="text-indigo-400 flex items-center gap-1 font-semibold">
              <Info className="w-3 h-3" /> Click tile to inspect 16-pillar charts
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
