import React, { useState, useMemo } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  ChevronRight,
  Clock,
  Crosshair,
  Filter,
  Layers,
  Newspaper,
  RotateCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  PieChart,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { SECTORS } from '../data/nifty200';
import { getMarketHoursAlertTime } from '../data/marketSchedule';
import { getStockListedAt, getStockSignalListedAt, getStockEntryTime, getStockExitTime } from '../utils/timingHelpers';
import { AppTheme, ConfluenceStage, ScanFilter, ScannedStock } from '../types';
import { SparklineChart } from './SparklineChart';
import { ScrollContainer } from './ScrollContainer';
import { ConfluencePipelineInspector } from './ConfluencePipelineInspector';
import {
  getSectorPerformanceMap,
  getVolumeXTime,
  getOiDetailedAction,
  getInstitutionalEntryAction,
  getStockGreeksAndOptionChain,
} from '../utils/sectorAndOiHelpers';

interface MasterScannerTableProps {
  stocks: ScannedStock[];
  onSelectStock: (stock: ScannedStock) => void;
  onSwitchToInstScanner?: () => void;
  theme?: AppTheme | 'dark' | 'light';
  isScanning?: boolean;
  onManualScan?: () => void;
  lastScanTime?: string;
}

export const MasterScannerTable: React.FC<MasterScannerTableProps> = ({
  stocks,
  onSelectStock,
  onSwitchToInstScanner,
  theme = 'dark',
  isScanning = false,
  onManualScan,
  lastScanTime,
}) => {
  const isDark = theme !== 'light';
  
  // Compute sector map for quick stock lookup
  const sectorMap = useMemo(() => getSectorPerformanceMap(stocks), [stocks]);

  const [stageFilter, setStageFilter] = useState<'ALL' | ConfluenceStage>('ALL');
  const [inspectingStock, setInspectingStock] = useState<ScannedStock | null>(null);
  const [showWorkflowBanner, setShowWorkflowBanner] = useState<boolean>(true);

  const [filter, setFilter] = useState<ScanFilter>({
    searchQuery: '',
    signalFilter: 'ALL',
    minScore: 0,
    sectorFilter: 'ALL',
    sortBy: 'aiScore',
    sortOrder: 'desc',
  });

  // Filter & Search logic
  const filteredStocks = stocks.filter((stock) => {
    const matchesSearch =
      stock.symbol.toLowerCase().includes(filter.searchQuery.toLowerCase()) ||
      stock.name.toLowerCase().includes(filter.searchQuery.toLowerCase()) ||
      stock.sector.toLowerCase().includes(filter.searchQuery.toLowerCase());

    const matchesSignal =
      filter.signalFilter === 'ALL' || stock.signal === filter.signalFilter;

    const matchesScore = stock.aiScore >= filter.minScore;

    const matchesSector =
      filter.sectorFilter === 'ALL' || stock.sector === filter.sectorFilter;

    const stockStage = stock.confluenceStage || (stock.aiScore >= 75 ? 'CONFIRMED' : stock.aiScore >= 60 ? 'SETUP' : 'WATCH');
    const matchesStage = stageFilter === 'ALL' || stockStage === stageFilter;

    return matchesSearch && matchesSignal && matchesScore && matchesSector && matchesStage;
  });

  // Stage counters
  const confirmedCount = useMemo(() => {
    return stocks.filter((s) => (s.confluenceStage === 'CONFIRMED' || s.aiScore >= 75)).length;
  }, [stocks]);

  const setupCount = useMemo(() => {
    return stocks.filter((s) => (s.confluenceStage === 'SETUP' || (s.aiScore >= 60 && s.aiScore < 75))).length;
  }, [stocks]);

  const watchCount = useMemo(() => {
    return stocks.filter((s) => (s.confluenceStage === 'WATCH' || s.aiScore < 60)).length;
  }, [stocks]);

  // Sorting logic
  const sortedStocks = [...filteredStocks].sort((a, b) => {
    let valA: number = 0;
    let valB: number = 0;

    switch (filter.sortBy) {
      case 'aiScore':
        valA = a.aiScore;
        valB = b.aiScore;
        break;
      case 'rvol':
        valA = a.indicators.rvol;
        valB = b.indicators.rvol;
        break;
      case 'changePercent':
        valA = a.changePercent;
        valB = b.changePercent;
        break;
      case 'price':
        valA = a.price;
        valB = b.price;
        break;
      case 'volume':
        valA = a.volume;
        valB = b.volume;
        break;
      default:
        valA = a.aiScore;
        valB = b.aiScore;
    }

    return filter.sortOrder === 'desc' ? valB - valA : valA - valB;
  });

  const toggleSort = (field: ScanFilter['sortBy']) => {
    if (filter.sortBy === field) {
      setFilter((prev) => ({
        ...prev,
        sortOrder: prev.sortOrder === 'asc' ? 'desc' : 'asc',
      }));
    } else {
      setFilter((prev) => ({ ...prev, sortBy: field, sortOrder: 'desc' }));
    }
  };

  const getSparklineData = (stock: ScannedStock): number[] => {
    if (stock.sparkline && stock.sparkline.length >= 2) {
      return stock.sparkline;
    }
    const base = stock.price;
    const pct = stock.changePercent / 100;
    const startPrice = base / (1 + pct * 0.4);
    const totalDiff = base - startPrice;

    let hash = 0;
    for (let i = 0; i < stock.symbol.length; i++) {
      hash = (hash << 5) - hash + stock.symbol.charCodeAt(i);
      hash |= 0;
    }

    const points: number[] = [];
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      const trend = startPrice + totalDiff * t;
      const seed = Math.sin(hash + i * 1.7) * 0.0015 * base;
      points.push(Number((trend + seed).toFixed(2)));
    }
    points[11] = base;
    return points;
  };

  return (
    <div
      className={`p-6 rounded-2xl border transition-colors ${
        isDark
          ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-xl shadow-black/20'
          : 'bg-white border-slate-200/90 text-slate-900 shadow-sm'
      }`}
    >
      {/* Control bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800/40">
        <div>
          <h2 className="text-base font-black italic tracking-tight uppercase flex items-center gap-2 flex-wrap">
            <span>Nifty 200 Real-Time Master Scanner</span>
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full border ${
                isDark
                  ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                  : 'bg-indigo-50 border-indigo-200 text-indigo-600'
              }`}
            >
              {sortedStocks.length} / {stocks.length} Stocks
            </span>
          </h2>
          <div className="flex items-center gap-3 text-xs font-mono opacity-60 mt-1">
            <span>Quantitative Screener • Auto-scan: 3s</span>
            {lastScanTime && (
              <span className="text-[10px] opacity-75">
                • Last Sync: {getMarketHoursAlertTime(lastScanTime)}
              </span>
            )}
          </div>
        </div>

        {/* Filter Toolbar & Manual Rescan Button */}
        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto font-mono text-xs">
          {onSwitchToInstScanner && (
            <button
              onClick={onSwitchToInstScanner}
              className="px-3 py-1.5 rounded-lg font-bold uppercase transition-all flex items-center gap-1.5 border shadow-sm bg-purple-600 hover:bg-purple-500 border-purple-500 text-white"
              title="Switch to Institutional VWAP, Call/Put Writing & Sector Scanner"
            >
              <Zap className="w-3.5 h-3.5 text-purple-200 animate-pulse" />
              <span>Institutional Flow Scanner</span>
              <span className="px-1.5 py-0.2 text-[9px] bg-purple-900 text-purple-200 font-extrabold rounded uppercase">
                PRO
              </span>
            </button>
          )}
          {onManualScan && (
            <button
              onClick={onManualScan}
              disabled={isScanning}
              className={`px-3.5 py-1.5 rounded-lg font-bold uppercase transition-all flex items-center gap-1.5 border shadow-sm ${
                isDark
                  ? 'bg-indigo-600 hover:bg-indigo-500 border-indigo-500 text-white disabled:opacity-50'
                  : 'bg-indigo-600 hover:bg-indigo-700 border-indigo-600 text-white disabled:opacity-50'
              }`}
              title="Trigger instant real-time scan cycle for Nifty 200"
            >
              <RotateCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
              <span>{isScanning ? 'Scanning...' : 'Rescan Now'}</span>
            </button>
          )}
          {/* Search Box */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 opacity-50 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="SEARCH SYMBOL..."
              value={filter.searchQuery}
              onChange={(e) =>
                setFilter((prev) => ({ ...prev, searchQuery: e.target.value }))
              }
              className={`w-full pl-9 pr-3 py-1.5 rounded-lg border text-xs font-bold uppercase transition-colors focus:outline-none focus:ring-1 ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500 focus:border-indigo-500 focus:ring-indigo-500'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:ring-indigo-500'
              }`}
            />
          </div>

          {/* Signal Filter */}
          <select
            value={filter.signalFilter}
            onChange={(e) =>
              setFilter((prev) => ({
                ...prev,
                signalFilter: e.target.value as any,
              }))
            }
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase focus:outline-none ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-200'
                : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}
          >
            <option value="ALL">ALL SIGNALS</option>
            <option value="BUY">BUY ONLY</option>
            <option value="SELL">SELL ONLY</option>
          </select>

          {/* Sector Filter */}
          <select
            value={filter.sectorFilter}
            onChange={(e) =>
              setFilter((prev) => ({ ...prev, sectorFilter: e.target.value }))
            }
            className={`px-3 py-1.5 rounded-lg border text-xs font-bold uppercase max-w-[150px] focus:outline-none ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-200'
                : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}
          >
            <option value="ALL">ALL SECTORS</option>
            {SECTORS.map((sec) => (
              <option key={sec} value={sec}>
                {sec}
              </option>
            ))}
          </select>

          {/* Score Slider Filter */}
          <div
            className={`flex items-center gap-2 border px-3 py-1.5 rounded-lg text-xs ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-200'
                : 'bg-slate-50 border-slate-200 text-slate-900'
            }`}
          >
            <span className="opacity-60 text-[10px] uppercase font-bold">MIN SCORE:</span>
            <input
              type="range"
              min="0"
              max="90"
              step="5"
              value={filter.minScore}
              onChange={(e) =>
                setFilter((prev) => ({
                  ...prev,
                  minScore: Number(e.target.value),
                }))
              }
              className="w-16 accent-indigo-500 cursor-pointer"
            />
            <span className="font-bold w-5">{filter.minScore}</span>
          </div>
        </div>
      </div>

      {/* Stage Selector Pills & Formula Workflow Toggle Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] font-mono font-bold uppercase text-slate-400 flex items-center gap-1 mr-1">
            <Workflow className="w-3.5 h-3.5 text-indigo-400" />
            <span>Confluence Stage:</span>
          </span>

          <button
            onClick={() => setStageFilter('ALL')}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase transition-all ${
              stageFilter === 'ALL'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            All Stocks ({stocks.length})
          </button>

          <button
            onClick={() => setStageFilter('CONFIRMED')}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 ${
              stageFilter === 'CONFIRMED'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/40 border border-emerald-500/30'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>CONFIRMED (75–100)</span>
            <span className="px-1.5 py-0.2 bg-emerald-900/80 rounded text-[10px]">
              {confirmedCount}
            </span>
          </button>

          <button
            onClick={() => setStageFilter('SETUP')}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 ${
              stageFilter === 'SETUP'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'bg-cyan-950/40 text-cyan-300 hover:bg-cyan-900/40 border border-cyan-500/30'
            }`}
          >
            <span>SETUP (60–74)</span>
            <span className="px-1.5 py-0.2 bg-cyan-900/80 rounded text-[10px]">
              {setupCount}
            </span>
          </button>

          <button
            onClick={() => setStageFilter('WATCH')}
            className={`px-3 py-1 rounded-lg text-xs font-mono font-bold uppercase transition-all flex items-center gap-1.5 ${
              stageFilter === 'WATCH'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-amber-950/40 text-amber-300 hover:bg-amber-900/40 border border-amber-500/30'
            }`}
          >
            <span>WATCH (40–59)</span>
            <span className="px-1.5 py-0.2 bg-amber-900/80 rounded text-[10px]">
              {watchCount}
            </span>
          </button>
        </div>

        <button
          onClick={() => setShowWorkflowBanner(!showWorkflowBanner)}
          className="text-xs font-mono font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1 ml-auto"
        >
          <span>{showWorkflowBanner ? '▲ Hide Formula Pipeline' : '▼ View 16-Pillar Formula Pipeline'}</span>
        </button>
      </div>

      {/* 16-Pillar Confluence Pipeline Workflow Banner */}
      {showWorkflowBanner && (
        <div className="mb-5 p-4 rounded-xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-purple-950/60 border border-indigo-500/30 text-xs font-mono">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 font-black text-indigo-300 uppercase tracking-tight">
              <Workflow className="w-4 h-4 text-indigo-400" />
              <span>Nifty 200 Real-Time Master Scanner 16-Pillar Confluence Formula</span>
            </div>
            <span className="text-[10px] text-slate-400 font-bold">16 Inputs → Engine → Stage → Execution Ladder</span>
          </div>

          {/* 16 Pillars Flow Tags */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-slate-200 py-1">
            {[
              'PRICE',
              'VOLUME',
              'VWAP',
              'MARKET STRUCTURE',
              'LIQUIDITY',
              'SMC',
              'WYCKOFF PHASE',
              'DELTA',
              'CVD',
              'FUTURES OI',
              'OPTION OI',
              'OPTION PREMIUM',
              'IV',
              'GREEKS',
              'SECTOR REGIME',
              'NIFTY REGIME',
            ].map((pillar, i) => (
              <React.Fragment key={pillar}>
                <span className="px-2 py-0.5 rounded bg-slate-950/80 border border-indigo-500/30 text-indigo-200 shadow-sm">
                  {pillar}
                </span>
                {i < 15 && <span className="text-indigo-400 font-black">+</span>}
              </React.Fragment>
            ))}
          </div>

          {/* Downward flow to Stages and Ladder */}
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-indigo-500/20 text-[10px] font-bold flex-wrap">
            <span className="text-indigo-400 font-black">↓</span>
            <span className="px-2 py-0.5 rounded bg-indigo-600 text-white font-black">
              CONFLUENCE ENGINE
            </span>
            <span className="text-indigo-400 font-black">↓</span>
            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-indigo-300">
              0–100 SCORE
            </span>
            <span className="text-indigo-400 font-black">↓</span>
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
              WATCH (40-59)
            </span>
            <span className="text-indigo-400 font-black">→</span>
            <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
              SETUP (60-74)
            </span>
            <span className="text-indigo-400 font-black">→</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              CONFIRMED (75-100)
            </span>
            <span className="text-indigo-400 font-black">↓</span>
            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
              BUY / SELL
            </span>
            <span className="text-indigo-400 font-black">↓</span>
            <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-700 text-indigo-200">
              ENTRY
            </span>
            <span className="text-indigo-400 font-black">→</span>
            <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
              SL
            </span>
            <span className="text-indigo-400 font-black">→</span>
            <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              T1 / T2 / T3
            </span>
            <span className="text-indigo-400 font-black">↓</span>
            <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">
              EXIT &amp; TRAIL
            </span>
          </div>
        </div>
      )}

      {/* Main Scanner Table */}
      <ScrollContainer isDark={isDark} scrollAmount={350}>
        <div className="overflow-x-auto rounded-xl border border-slate-800/40">
          <table className="w-full text-left text-xs border-collapse font-mono">
            <thead>
              <tr
                className={`border-b uppercase text-[10px] font-bold ${
                  isDark
                    ? 'border-slate-800 bg-slate-950/80 text-slate-400'
                    : 'border-slate-200 bg-slate-100 text-slate-600'
                }`}
              >
                <th className="py-3 px-3.5">Symbol / Sector</th>
              <th className="py-3 px-3.5 text-amber-400 font-extrabold" title="Signal Listed At (Market Detection Time)">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Signal Listed At</span>
                </div>
              </th>
              <th className="py-3 px-3.5 text-indigo-400 font-extrabold" title="Exact Algorithmic Signal Entry Time">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-indigo-400" />
                  <span>Entry Time</span>
                </div>
              </th>
              <th className="py-3 px-3.5 text-purple-400 font-extrabold" title="Target Hit or Stop Loss / Session Close Exit Time">
                <div className="flex items-center gap-1">
                  <span>Exit Time</span>
                </div>
              </th>
              <th className="py-3 px-3.5">
                <div className="flex items-center gap-1">
                  <Newspaper className="w-3 h-3 opacity-60" />
                  <span>News Sentiment</span>
                </div>
              </th>
              <th
                className="py-3 px-3.5 cursor-pointer hover:underline"
                onClick={() => toggleSort('aiScore')}
              >
                <div className="flex items-center gap-1">
                  <span>Score (0-100)</span>
                  <ArrowUpDown className="w-3 h-3 opacity-50" />
                </div>
              </th>
              <th className="py-3 px-3.5 text-indigo-400 font-extrabold" title="Confluence Engine Stage: WATCH (40-59), SETUP (60-74), CONFIRMED (75-100)">
                <div className="flex items-center gap-1">
                  <Workflow className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Confluence Stage</span>
                </div>
              </th>
              <th className="py-3 px-3.5">Signal</th>
              <th className="py-3 px-3.5">Institutional Entry</th>
              <th
                className="py-3 px-3.5 cursor-pointer hover:underline text-indigo-400 font-extrabold"
                onClick={() => toggleSort('price')}
              >
                <div className="flex items-center gap-1">
                  <span>Current Price</span>
                  <ArrowUpDown className="w-3 h-3 opacity-50" />
                </div>
              </th>
              <th className="py-3 px-3.5 text-emerald-400 font-extrabold">
                <div className="flex items-center gap-1">
                  <span>AI Alerts Price</span>
                </div>
              </th>
              <th
                className="py-3 px-3.5 cursor-pointer hover:underline"
                onClick={() => toggleSort('changePercent')}
              >
                <div className="flex items-center gap-1">
                  <span>Chg %</span>
                  <ArrowUpDown className="w-3 h-3 opacity-50" />
                </div>
              </th>
              <th className="py-3 px-3.5 text-blue-400">
                <div className="flex items-center gap-1" title="Click chart to open TradingView 60m Chart">
                  <span>60m Trend</span>
                  <span className="text-[9px]">↗</span>
                </div>
              </th>
              <th className="py-3 px-3.5">OI Action (Put/Call Writing)</th>
              <th className="py-3 px-3.5 text-purple-400 font-extrabold" title="Greeks (Delta Δ, Gamma Γ, Vega V) & Put/Call Writing Ratio Institutional Context">
                <div className="flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-purple-400" />
                  <span>Greeks &amp; P/C Ratio</span>
                </div>
              </th>

              <th
                className="py-3 px-3.5 cursor-pointer hover:underline"
                onClick={() => toggleSort('rvol')}
              >
                <div className="flex items-center gap-1">
                  <span>RVOL</span>
                  <ArrowUpDown className="w-3 h-3 opacity-50" />
                </div>
              </th>
              <th className="py-3 px-3.5">RSI</th>
              <th className="py-3 px-3.5">VWAP</th>
              <th className="py-3 px-3.5">Stop Loss</th>
              <th className="py-3 px-3.5">Target 1</th>
              <th className="py-3 px-3.5">Target 2</th>
              <th className="py-3 px-3.5">Target 3</th>
              <th className="py-3 px-3.5">Exit Strategy</th>
              <th className="py-3 px-3.5">R : R</th>
              <th className="py-3 px-3.5 text-right">Inspect</th>
            </tr>
          </thead>

          <tbody
            className={`divide-y ${
              isDark ? 'divide-slate-800/60' : 'divide-slate-200/80'
            }`}
          >
            {sortedStocks.length === 0 ? (
              <tr>
                <td colSpan={18} className="py-12 text-center opacity-50 font-mono">
                  No stocks match the selected filter criteria.
                </td>
              </tr>
            ) : (
              sortedStocks.map((stock) => {
                const isBuy = stock.signal === 'BUY';
                const isSell = stock.signal === 'SELL';
                const sparkData = getSparklineData(stock);

                return (
                  <tr
                    key={stock.symbol}
                    onClick={() => onSelectStock(stock)}
                    className={`cursor-pointer transition-colors group ${
                      isDark
                        ? 'hover:bg-slate-800/60'
                        : 'hover:bg-slate-100/80'
                    }`}
                  >
                    {/* Symbol & Sector with Sector Performance */}
                    <td className="py-3 px-3.5">
                      <div className="font-bold text-xs flex items-center gap-1.5">
                        <span>{stock.symbol}</span>
                      </div>
                      <div className="flex flex-col gap-1 mt-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {sectorMap.has(stock.sector) ? (() => {
                            const sec = sectorMap.get(stock.sector)!;
                            const isSecPos = sec.avgChangePercent >= 0;
                            return (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border flex items-center gap-1 ${
                                  isSecPos
                                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                    : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                                }`}
                                title={`Sector ${sec.sectorName}: ${isSecPos ? '+' : ''}${sec.avgChangePercent}% (${sec.positiveCount} Gainers / ${sec.negativeCount} Losers)`}
                              >
                                <span className="uppercase">{stock.sector}</span>
                                <span>•</span>
                                <span>{isSecPos ? 'SECTOR POSITIVE (+)' : 'SECTOR NEGATIVE (-)'}</span>
                                <span>({isSecPos ? '+' : ''}{sec.avgChangePercent}%)</span>
                              </span>
                            );
                          })() : (
                            <span className="text-[10px] font-bold opacity-70 uppercase truncate">
                              {stock.sector}
                            </span>
                          )}
                        </div>
                        <a
                          href={`https://in.tradingview.com/chart/?symbol=NSE:${stock.symbol.replace(/&/g, '_').replace(/-/g, '_')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[9px] font-bold text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-0.5 shrink-0"
                          title={`View ${stock.symbol} live on TradingView`}
                        >
                          <span>Chart</span>
                          <span className="text-[8px]">↗</span>
                        </a>
                      </div>
                    </td>

                    {/* Signal Listed At (Market Detection Time) */}
                    <td className="py-3 px-3.5 font-mono text-[11px] whitespace-nowrap text-center">
                      <span className="px-2.5 py-1 rounded-md font-bold text-amber-300 bg-amber-500/15 border border-amber-500/35 inline-flex items-center gap-1 shadow-sm" title="Signal Listed At (Market Detection Time)">
                        <Clock className="w-2.5 h-2.5 text-amber-400" />
                        {getStockSignalListedAt(stock)}
                      </span>
                    </td>

                    {/* Algorithmic Signal Entry Time */}
                    <td className="py-3 px-3.5 font-mono text-[11px] whitespace-nowrap text-center">
                      <span className="px-2.5 py-1 rounded-md font-bold text-indigo-300 bg-indigo-500/15 border border-indigo-500/35 inline-flex items-center gap-1 shadow-sm" title="Algorithmic Signal Entry Time (Execution Window)">
                        <Clock className="w-2.5 h-2.5 text-indigo-400" />
                        {getStockEntryTime(stock)}
                      </span>
                    </td>

                    {/* Exit Time (Target Hit / Stop Loss / EOD) */}
                    <td className="py-3 px-3.5 font-mono text-[11px] whitespace-nowrap text-center">
                      {(() => {
                        const exitInfo = getStockExitTime(stock);
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

                    {/* Live Stock News API Sentiment */}
                    <td className="py-3 px-3.5 font-mono text-[11px] whitespace-nowrap">
                      {(() => {
                        const sent = stock.newsSentiment || (stock.changePercent >= 0 ? 'POSITIVE' : 'NEGATIVE');
                        const isPos = sent === 'POSITIVE';
                        const isNeg = sent === 'NEGATIVE';
                        return (
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-flex items-center gap-1 ${
                              isPos
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                : isNeg
                                ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                                : 'bg-slate-500/20 text-slate-300 border-slate-500/30'
                            }`}
                            title={stock.newsTitle || `${stock.symbol} live news catalyst: ${sent}`}
                          >
                            <span>{isPos ? '🟢 POSITIVE (+)' : isNeg ? '🔴 NEGATIVE (-)' : '⚪ NEUTRAL'}</span>
                          </span>
                        );
                      })()}
                    </td>

                    {/* Score (0-100) */}
                    <td className="py-3 px-3.5 font-bold">
                      <span
                        className={
                          stock.aiScore >= 75
                            ? isDark
                              ? 'text-emerald-400 font-extrabold'
                              : 'text-emerald-600 font-extrabold'
                            : stock.aiScore >= 60
                            ? 'text-cyan-400 font-bold'
                            : 'text-amber-400 font-bold'
                        }
                      >
                        {stock.aiScore}
                      </span>
                    </td>

                    {/* Confluence Stage */}
                    <td className="py-3 px-3.5">
                      {(() => {
                        const stg = stock.confluenceStage || (stock.aiScore >= 75 ? 'CONFIRMED' : stock.aiScore >= 60 ? 'SETUP' : 'WATCH');
                        const isConfirmed = stg === 'CONFIRMED';
                        const isSetup = stg === 'SETUP';
                        return (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectingStock(stock);
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-all flex items-center gap-1 hover:scale-105 ${
                              isConfirmed
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                                : isSetup
                                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            }`}
                            title={`Click to inspect 16 Confluence Pillars for ${stock.symbol}`}
                          >
                            {isConfirmed && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                            <span>{stg}</span>
                            <span className="text-[8px] opacity-70">🔍</span>
                          </button>
                        );
                      })()}
                    </td>

                    {/* Signal */}
                    <td className="py-3 px-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          isBuy
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : isSell
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : isDark
                            ? 'bg-slate-800 text-slate-300'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {stock.signal}
                      </span>
                    </td>

                    {/* Institutional Entry Column */}
                    <td className="py-3 px-3.5">
                      {(() => {
                        const instInfo = getInstitutionalEntryAction(stock);
                        return (
                          <span
                            className={`px-2 py-0.5 text-[9px] font-bold rounded border uppercase inline-block whitespace-nowrap ${instInfo.badgeBg} ${instInfo.badgeText} ${instInfo.badgeBorder}`}
                            title={instInfo.description}
                          >
                            🏛️ {instInfo.label}
                          </span>
                        );
                      })()}
                    </td>

                    {/* Current Price */}
                    <td className="py-3 px-3.5 font-extrabold text-indigo-300">
                      ₹{stock.price.toLocaleString('en-IN')}
                    </td>

                    {/* AI Alerts Price */}
                    <td className="py-3 px-3.5 font-extrabold text-emerald-400">
                      ₹{(stock.risk?.entryPrice || stock.price).toLocaleString('en-IN')}
                    </td>

                    {/* Change % */}
                    <td
                      className={`py-3 px-3.5 font-bold ${
                        stock.changePercent >= 0
                          ? isDark
                            ? 'text-emerald-400'
                            : 'text-emerald-600'
                          : isDark
                          ? 'text-rose-400'
                          : 'text-rose-600'
                      }`}
                    >
                      {stock.changePercent >= 0 ? '+' : ''}
                      {stock.changePercent}%
                    </td>

                    {/* 60m Trend Sparkline & TradingView Chart Link */}
                    <td
                      className="py-2.5 px-3.5 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(
                          `https://in.tradingview.com/chart/?symbol=NSE:${stock.symbol.replace('&', '_')}`,
                          '_blank'
                        );
                      }}
                      title={`Click to open 60m TradingView chart for ${stock.symbol}`}
                    >
                      <SparklineChart data={sparkData} isDark={isDark} />
                      <div className="flex items-center justify-center gap-0.5 mt-1 text-[9px] font-bold text-blue-400 hover:text-blue-300">
                        <span>60m TV Chart</span>
                        <span>↗</span>
                      </div>
                    </td>

                    {/* OI Chg % & Changing OI Action (Put Writing / Call Writing) */}
                    <td className="py-3 px-3.5 font-bold">
                      {(() => {
                        const oiAction = getOiDetailedAction(stock);
                        return (
                          <div className="flex flex-col gap-1">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black border uppercase inline-block w-max ${oiAction.badgeBg} ${oiAction.badgeText} ${oiAction.badgeBorder}`}
                              title={oiAction.description}
                            >
                              {oiAction.actionLabel}
                            </span>
                            <div className="text-[10px] opacity-80 flex items-center gap-1 font-mono">
                              <span className={oiAction.changeInOIPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                                {oiAction.changeInOIPercent >= 0 ? '+' : ''}{oiAction.changeInOIPercent}% OI
                              </span>
                              <span className="opacity-40">•</span>
                              <span className="opacity-70">PCR {oiAction.pcr}</span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Greeks (Delta, Gamma, Vega) & Option Chain Data (Put/Call Writing Ratio) */}
                    <td className="py-2.5 px-3.5 font-mono">
                      {(() => {
                        const greeks = getStockGreeksAndOptionChain(stock);
                        const isPutDominant = greeks.writingDominance === 'PUT_WRITING_DOMINANT';
                        const isCallDominant = greeks.writingDominance === 'CALL_WRITING_DOMINANT';
                        const isPosDelta = greeks.delta >= 0;

                        return (
                          <div className="flex flex-col gap-1 min-w-[190px]" title={greeks.biasSummary}>
                            {/* Top row: Greeks metrics */}
                            <div className="flex items-center gap-1.5 text-[10px] font-bold">
                              <span
                                className={`px-1.5 py-0.5 rounded font-mono ${
                                  isPosDelta
                                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                    : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                                }`}
                                title={`Delta (Δ): ${greeks.delta > 0 ? '+' : ''}${greeks.delta} (Directional sensitivity)`}
                              >
                                Δ {greeks.delta > 0 ? '+' : ''}{greeks.delta}
                              </span>
                              <span
                                className="px-1.5 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-mono"
                                title={`Gamma (Γ): ${greeks.gamma} (Delta acceleration rate)`}
                              >
                                Γ {greeks.gamma}
                              </span>
                              <span
                                className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono"
                                title={`Vega (V): ₹${greeks.vega} / 1% IV change (Theta: -₹${Math.abs(greeks.theta)}/day)`}
                              >
                                V {greeks.vega}
                              </span>
                            </div>

                            {/* Middle row: Put/Call Writing Ratio & Dominance */}
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-black border uppercase inline-flex items-center gap-1 ${
                                  isPutDominant
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : isCallDominant
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                    : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                                }`}
                              >
                                <span>P/C Write: {greeks.putCallWritingRatio}x</span>
                                <span className="opacity-60 text-[8px]">
                                  ({isPutDominant ? '🟢 PUT DOM' : isCallDominant ? '🔴 CALL DOM' : '⚪ BAL'})
                                </span>
                              </span>
                            </div>

                            {/* Bottom row: Institutional Positioning Context */}
                            <div className="flex items-center gap-1 text-[9px]">
                              <span
                                className={`font-sans font-bold truncate max-w-[190px] ${
                                  greeks.institutionalOptionBias === 'INSTITUTIONAL_PUT_WRITING'
                                    ? 'text-emerald-400'
                                    : greeks.institutionalOptionBias === 'INSTITUTIONAL_CALL_WRITING'
                                    ? 'text-rose-400'
                                    : greeks.institutionalOptionBias === 'LONG_GAMMA_MOMENTUM'
                                    ? 'text-amber-300'
                                    : 'text-slate-400'
                                }`}
                              >
                                {greeks.institutionalOptionBias === 'INSTITUTIONAL_PUT_WRITING' && '🏦 Inst. Put Floor (Support)'}
                                {greeks.institutionalOptionBias === 'INSTITUTIONAL_CALL_WRITING' && '🏦 Inst. Call Ceiling (Cap)'}
                                {greeks.institutionalOptionBias === 'LONG_GAMMA_MOMENTUM' && '⚡ Long Gamma Velocity'}
                                {greeks.institutionalOptionBias === 'SHORT_VEGA_HARVESTING' && '🛡️ Vega Harvest (Theta)'}
                                {greeks.institutionalOptionBias === 'NEUTRAL_STRADDLE' && '⚖️ Balanced Straddle'}
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Stock Volume X Time */}
                    <td className="py-3 px-3.5 font-bold">
                      {(() => {
                        const volX = getVolumeXTime(stock);
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black border inline-block w-max ${volX.badgeColor}`}
                              title={`Volume x Time Pace: ${volX.formatted} (${volX.surgeLabel})`}
                            >
                              {volX.formatted}
                            </span>
                            <span className="text-[9px] opacity-60 font-mono">
                              {(stock.volume / 100000).toFixed(1)}L Qty
                            </span>
                          </div>
                        );
                      })()}
                    </td>

                    {/* RSI */}
                    <td className="py-3 px-3.5 opacity-80">
                      {stock.indicators.rsi}
                    </td>

                    {/* VWAP */}
                    <td className="py-3 px-3.5 font-mono text-[11px] whitespace-nowrap">
                      {(() => {
                        const isAbove = stock.price >= stock.indicators.vwap;
                        return (
                          <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-slate-200">₹{stock.indicators.vwap}</span>
                            <span
                              className={`px-1.5 py-0.5 text-[9px] font-extrabold rounded border inline-flex items-center gap-0.5 w-max ${
                                isAbove
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                              }`}
                              title={`Price ₹${stock.price} is ${isAbove ? 'Above' : 'Below'} VWAP ₹${stock.indicators.vwap}`}
                            >
                              <span>{isAbove ? '🟢 ABOVE VWAP' : '🔴 BELOW VWAP'}</span>
                            </span>
                          </div>
                        );
                      })()}
                    </td>

                    {/* Stop Loss */}
                    <td className="py-3 px-3.5 text-rose-400 font-bold">
                      ₹{stock.confluence?.ladder?.stopLoss?.toFixed(2) || stock.risk.stopLoss}
                    </td>

                    {/* Target 1 */}
                    <td className="py-3 px-3.5 text-emerald-400 font-bold">
                      ₹{stock.confluence?.ladder?.target1?.toFixed(2) || stock.risk.target1}
                    </td>

                    {/* Target 2 */}
                    <td className="py-3 px-3.5 text-emerald-400 font-bold opacity-80">
                      ₹{stock.confluence?.ladder?.target2?.toFixed(2) || stock.risk.target2}
                    </td>

                    {/* Target 3 */}
                    <td className="py-3 px-3.5 text-emerald-400 font-bold opacity-60">
                      ₹{stock.confluence?.ladder?.target3?.toFixed(2) || stock.risk.target3 || (stock.risk.target2 * 1.05).toFixed(2)}
                    </td>

                    {/* Exit Strategy */}
                    <td className="py-3 px-3.5 text-[10px] font-mono text-purple-300 font-bold max-w-[140px] truncate" title={stock.confluence?.ladder?.exitStrategy || 'Book 50% at T1, trail SL to Breakeven'}>
                      {stock.confluence?.ladder?.exitStrategy || 'Trail at T1/T2/T3'}
                    </td>

                    {/* Risk Reward Ratio */}
                    <td className="py-3 px-3.5 font-bold">
                      {stock.confluence?.ladder?.riskRewardRatio || `1:${stock.risk.riskRewardRatio}`}
                    </td>

                    {/* Action */}
                    <td className="py-3 px-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setInspectingStock(stock);
                          }}
                          className={`px-2 py-1 text-[10px] font-bold rounded-md border transition-all flex items-center gap-1 ${
                            isDark
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 hover:bg-purple-500/40'
                              : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                          }`}
                          title={`Inspect 16 Confluence Pillars for ${stock.symbol}`}
                        >
                          <Workflow className="w-3 h-3 text-purple-400" />
                          <span>16 Pillars</span>
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectStock(stock);
                          }}
                          className={`px-2.5 py-1 text-[10px] font-bold rounded-md border transition-all flex items-center gap-1 ${
                            isDark
                              ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/40'
                              : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                          }`}
                          title={`Open live technical chart for ${stock.symbol}`}
                        >
                          <span>📈 Chart</span>
                          <ChevronRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      </ScrollContainer>

      {/* 16-Pillars Confluence Inspector Modal */}
      {inspectingStock && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 md:p-8 overflow-y-auto">
          <div className="relative w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl border border-slate-700 bg-slate-950">
            <button
              onClick={() => setInspectingStock(null)}
              className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-slate-900 text-slate-300 hover:text-white hover:bg-rose-600 transition-all border border-slate-700"
              title="Close Confluence Inspector"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="p-2">
              <ConfluencePipelineInspector
                stock={inspectingStock}
                isDark={isDark}
                onExecuteTrade={() => {
                  onSelectStock(inspectingStock);
                  setInspectingStock(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

