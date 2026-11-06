import React, { useState, useMemo } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  BarChart2,
  CheckCircle2,
  ChevronRight,
  Compass,
  Download,
  ExternalLink,
  Filter,
  Flame,
  Globe,
  Layers,
  Newspaper,
  PieChart,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { ScannedStock, SmartMoneyStockAnalysis, AppTheme } from '../types';
import {
  analyzeAllStocksSmartMoney,
  calculateSmartMoneyKpis,
  filterSmartMoneyAnalyses,
  exportSmartMoneyToCsv,
} from '../utils/smartMoneyAccumulationEngine';
import { getStockListedAt, getStockEntryTime, getStockExitTime } from '../utils/timingHelpers';

interface SmartMoneyAccumulationScannerViewProps {
  stocks: ScannedStock[];
  onSelectStock: (stock: ScannedStock) => void;
  onBackToScanner?: () => void;
  theme?: AppTheme | 'dark' | 'light' | 'midnight' | 'emerald';
  isScanning?: boolean;
  onManualScan?: () => void;
  onCreateTrade?: (stock: ScannedStock, tradeType: 'BUY' | 'SELL') => void;
}

export const SmartMoneyAccumulationScannerView: React.FC<SmartMoneyAccumulationScannerViewProps> = ({
  stocks,
  onSelectStock,
  onBackToScanner,
  theme = 'dark',
  isScanning = false,
  onManualScan,
  onCreateTrade,
}) => {
  const isDark = theme !== 'light';

  // Active Sub-View Mode
  const [activeSubView, setActiveSubView] = useState<'CARDS' | 'WYCKOFF_MATRIX' | 'SMC_TRACKER' | 'DELIVERY_TABLE'>('CARDS');

  // Filter and Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState('ALL');
  const [quickPreset, setQuickPreset] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<'ratingScore' | 'wyckoffConfidence' | 'deliveryPercent' | 'instFlow' | 'changePercent' | 'price'>('ratingScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Quant Engine Analyses Generation
  const analyses = useMemo(() => {
    return analyzeAllStocksSmartMoney(stocks);
  }, [stocks]);

  // Overall Market KPIs
  const kpis = useMemo(() => {
    return calculateSmartMoneyKpis(analyses);
  }, [analyses]);

  // Unique Sectors
  const sectors = useMemo(() => {
    const set = new Set<string>();
    stocks.forEach((s) => {
      if (s.sector) set.add(s.sector);
    });
    return Array.from(set).sort();
  }, [stocks]);

  // Filtered Analyses
  const filteredAnalyses = useMemo(() => {
    return filterSmartMoneyAnalyses(analyses, quickPreset, searchQuery, selectedSector);
  }, [analyses, quickPreset, searchQuery, selectedSector]);

  // Sorted Analyses
  const sortedAnalyses = useMemo(() => {
    return [...filteredAnalyses].sort((a, b) => {
      let valA: any = a.accumulation.ratingScore;
      let valB: any = b.accumulation.ratingScore;

      if (sortBy === 'ratingScore') {
        valA = a.accumulation.ratingScore;
        valB = b.accumulation.ratingScore;
      } else if (sortBy === 'wyckoffConfidence') {
        valA = a.wyckoff.confidence;
        valB = b.wyckoff.confidence;
      } else if (sortBy === 'deliveryPercent') {
        valA = a.deliveryPercent;
        valB = b.deliveryPercent;
      } else if (sortBy === 'instFlow') {
        valA = a.accumulation.institutionalFlowCr;
        valB = b.accumulation.institutionalFlowCr;
      } else if (sortBy === 'changePercent') {
        valA = a.changePercent;
        valB = b.changePercent;
      } else if (sortBy === 'price') {
        valA = a.price;
        valB = b.price;
      }

      if (sortOrder === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });
  }, [filteredAnalyses, sortBy, sortOrder]);

  const toggleSort = (col: typeof sortBy) => {
    if (sortBy === col) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortOrder('desc');
    }
  };

  // CSV Export Handler
  const handleExportCsv = () => {
    const csvContent = 'data:text/csv;charset=utf-8,' + exportSmartMoneyToCsv(sortedAnalyses);
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `smart_money_accumulation_analysis_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Python Algo Export Handler
  const handleExportPython = () => {
    const pythonCode = `# Indian Smart Money & Institutional Accumulation Engine
# Generated on: ${new Date().toISOString()}
import pandas as pd
import numpy as np

# Candidates matching Smart Money Accumulation Criteria
symbols = [${sortedAnalyses.map((s) => `"${s.symbol}"`).join(', ')}]

def execute_smart_money_scan():
    print(f"Executing Smart Money Scan on {len(symbols)} Indian Equities...")
    # Wyckoff Phase C Spring & Bullish Order Block filter
    for sym in symbols:
        print(f"Monitoring {sym} for Order Block retest & Session VWAP confirmation.")

if __name__ == '__main__':
    execute_smart_money_scan()
`;
    const blob = new Blob([pythonCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `smart_money_quant_strategy_${new Date().toISOString().slice(0, 10)}.py`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Title Card */}
      <div
        className={`p-5 sm:p-6 rounded-2xl border shadow-xl relative overflow-hidden transition-all ${
          isDark
            ? 'bg-gradient-to-r from-slate-900 via-emerald-950/60 to-indigo-950/70 border-emerald-500/30 text-slate-100'
            : 'bg-gradient-to-r from-emerald-50 via-white to-indigo-50 border-emerald-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 text-xs font-mono font-bold uppercase rounded-md bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20">
                INDIAN MARKET QUANT ENGINE
              </span>
              <span className="px-2.5 py-0.5 text-xs font-mono font-bold uppercase rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                WYCKOFF PHASES (A-E) • SMC ORDER BLOCKS • CMF FLOW • DELIVERY SPIKES ↗
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black font-mono tracking-tight flex items-center gap-2">
              <Sparkles className="w-6 h-6 text-emerald-400 animate-pulse" />
              Indian-Market Smart Money + Institutional Accumulation/Distribution Scanner
            </h1>
            <p className="text-xs sm:text-sm opacity-80 max-w-3xl">
              Advanced institutional footprint detection tracking Wyckoff Phase Contractions (Springs, Sign of Strength Creek Breakouts), Smart Money Concepts (Bullish Order Blocks, Fair Value Gaps, Liquidity Sweeps), Chaikin Money Flow (CMF), and high-volume delivery accumulation spikes across NSE equities.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleExportCsv}
              className={`px-3 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border ${
                isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
              }`}
              title="Export Smart Money Analyses to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={handleExportPython}
              className={`px-3 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border ${
                isDark ? 'bg-slate-800 hover:bg-slate-700 text-teal-300 border-teal-500/40' : 'bg-white hover:bg-slate-100 text-teal-800 border-teal-300'
              }`}
              title="Export Python Quant Script"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>Python Algo</span>
            </button>

            {onManualScan && (
              <button
                onClick={onManualScan}
                disabled={isScanning}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all border ${
                  isScanning
                    ? 'bg-emerald-500/30 text-emerald-300 border-emerald-500/40 cursor-not-allowed'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black border-emerald-500 shadow-lg shadow-emerald-600/30'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Analyzing Universe...' : 'Refresh Smart Money'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5 font-mono">
        {/* Net Inst Flow KPI */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-xs opacity-70 mb-1">
            <span>INSTITUTIONAL NET FLOW</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className={`font-bold text-lg sm:text-xl ${kpis.totalInstFlowCr >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {kpis.totalInstFlowCr >= 0 ? `+₹${kpis.totalInstFlowCr} Cr` : `-₹${Math.abs(kpis.totalInstFlowCr)} Cr`}
            </div>
            <span className="text-[10px] text-slate-400">Est. Today</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden flex">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(15, (kpis.heavyAccumulationCount / Math.max(1, kpis.total)) * 100))}%` }}
            />
          </div>
        </div>

        {/* Wyckoff Phase C Spring KPI */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-xs opacity-70 mb-1">
            <span>WYCKOFF SPRING (PHASE C)</span>
            <Sparkles className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-emerald-400 font-bold text-lg sm:text-xl">
              {kpis.springCount} <span className="text-xs font-normal opacity-70">Stocks</span>
            </div>
            <span className="text-[10px] text-emerald-300 font-bold bg-emerald-500/20 px-1.5 py-0.5 rounded">High R:R</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden flex">
            <div
              className="bg-emerald-500 h-full"
              style={{ width: `${(kpis.springCount / Math.max(1, kpis.total)) * 100}%` }}
            />
          </div>
        </div>

        {/* Wyckoff Phase D SOS Breakout KPI */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-xs opacity-70 mb-1">
            <span>SOS CREEK BREAKOUTS</span>
            <TrendingUp className="w-4 h-4 text-teal-400" />
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-teal-400 font-bold text-lg sm:text-xl">
              {kpis.sosBreakoutCount} <span className="text-xs font-normal opacity-70">Phase D</span>
            </div>
            <span className="text-[10px] text-teal-300 font-bold bg-teal-500/20 px-1.5 py-0.5 rounded">Breakouts</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden flex">
            <div
              className="bg-teal-500 h-full"
              style={{ width: `${(kpis.sosBreakoutCount / Math.max(1, kpis.total)) * 100}%` }}
            />
          </div>
        </div>

        {/* SMC Order Blocks KPI */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-xs opacity-70 mb-1">
            <span>BULLISH ORDER BLOCKS</span>
            <Layers className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-indigo-400 font-bold text-lg sm:text-xl">
              {kpis.orderBlockCount} <span className="text-xs font-normal opacity-70">Zones</span>
            </div>
            <span className="text-[10px] text-indigo-300 font-bold bg-indigo-500/20 px-1.5 py-0.5 rounded">Demand Base</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden flex">
            <div
              className="bg-indigo-500 h-full"
              style={{ width: `${(kpis.orderBlockCount / Math.max(1, kpis.total)) * 100}%` }}
            />
          </div>
        </div>

        {/* High Delivery Spikes KPI */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-xs opacity-70 mb-1">
            <span>DELIVERY ACCUMULATION</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-amber-400 font-bold text-lg sm:text-xl">
              {kpis.deliverySpikeCount} <span className="text-xs font-normal opacity-70">Spikes</span>
            </div>
            <span className="text-[10px] text-amber-300 font-bold">Avg {kpis.avgDeliveryPct}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden flex">
            <div
              className="bg-amber-500 h-full"
              style={{ width: `${(kpis.deliverySpikeCount / Math.max(1, kpis.total)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Interactive Toolbar, Sub-Views & Preset Quick Filters */}
      <div
        className={`p-4 rounded-2xl border transition-colors space-y-3.5 ${
          isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        {/* Sub-View Switcher Tabs */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5">
            <button
              onClick={() => setActiveSubView('CARDS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border shrink-0 ${
                activeSubView === 'CARDS'
                  ? 'bg-emerald-600 text-slate-950 font-black border-emerald-400 shadow-md shadow-emerald-600/30'
                  : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Smart Money Visualizer</span>
            </button>

            <button
              onClick={() => setActiveSubView('WYCKOFF_MATRIX')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border shrink-0 ${
                activeSubView === 'WYCKOFF_MATRIX'
                  ? 'bg-teal-600 text-white border-teal-400 shadow-md shadow-teal-600/30'
                  : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Wyckoff Phase Matrix (A-E)</span>
            </button>

            <button
              onClick={() => setActiveSubView('SMC_TRACKER')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border shrink-0 ${
                activeSubView === 'SMC_TRACKER'
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                  : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>SMC Order Block & FVG Tracker</span>
            </button>

            <button
              onClick={() => setActiveSubView('DELIVERY_TABLE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border shrink-0 ${
                activeSubView === 'DELIVERY_TABLE'
                  ? 'bg-amber-600 text-white border-amber-400 shadow-md shadow-amber-600/30'
                  : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Institutional Flow & Delivery Table</span>
            </button>
          </div>

          {/* Quick Preset Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
            <span className="text-[10px] font-mono uppercase font-bold opacity-60 shrink-0">Presets:</span>
            {[
              { id: 'ALL', label: 'All' },
              { id: 'WYCKOFF_SPRING_SOS', label: '💎 Spring & SOS' },
              { id: 'BULLISH_ORDER_BLOCKS', label: '🧱 Order Blocks' },
              { id: 'FVG_IMBALANCE', label: '🧲 FVG Retest' },
              { id: 'HIGH_DELIVERY_ACCUMULATION', label: '🌊 High Delivery (>55%)' },
              { id: 'PUT_WRITING_SUPPORT', label: '🛡️ Put Writing' },
              { id: 'TOP_RR_SETUPS', label: '🎯 Top R:R (1:3+)' },
              { id: 'DISTRIBUTION_WARNING', label: '⚠️ UTAD Warning' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setQuickPreset(p.id)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold whitespace-nowrap transition-all border ${
                  quickPreset === p.id
                    ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400 shadow-xs'
                    : 'bg-slate-800/40 text-slate-400 border-slate-700 hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search and Sector Selection */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 font-mono text-xs">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
            <input
              type="text"
              placeholder="Search symbol, stock name or sector..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs border transition-all focus:outline-none focus:ring-2 focus:ring-emerald-500 ${
                isDark
                  ? 'bg-slate-950/80 border-slate-800 text-slate-100 placeholder:text-slate-500'
                  : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-100"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="opacity-60">Sector:</span>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className={`px-2.5 py-1.5 rounded-xl border text-xs font-bold ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="ALL">All Sectors ({stocks.length})</option>
              {sectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>

            <span className="text-emerald-400 font-bold px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              {sortedAnalyses.length} Stocks Found
            </span>
          </div>
        </div>
      </div>

      {/* SUB-VIEW 1: SMART MONEY SETUP CARDS & VISUALIZER */}
      {activeSubView === 'CARDS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedAnalyses.map((analysis) => {
            const rawStock = stocks.find((s) => s.symbol === analysis.symbol);
            const isUp = analysis.changePercent >= 0;

            return (
              <div
                key={analysis.symbol}
                onClick={() => rawStock && onSelectStock(rawStock)}
                className={`p-5 rounded-2xl border transition-all cursor-pointer hover:border-emerald-500/60 font-mono ${
                  isDark ? 'bg-slate-900/90 border-slate-800 hover:bg-slate-850' : 'bg-white border-slate-200 shadow-sm'
                }`}
              >
                {/* Card Top: Symbol & Wyckoff Phase */}
                <div className="flex items-center justify-between mb-2.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-black text-slate-100">{analysis.symbol}</span>
                      {analysis.isDeliverySpike && (
                        <span className="px-1.5 py-0.2 text-[9px] font-black rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          ⚡ DELIVERY SPIKE
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] opacity-60 truncate max-w-[170px]">{analysis.name} • {analysis.sector}</div>
                  </div>

                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${analysis.tradeSetup.biasBadgeCls}`}>
                    {analysis.tradeSetup.bias}
                  </span>
                </div>

                {/* Price & Wyckoff Badge */}
                <div className="flex items-center justify-between my-2 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80">
                  <div>
                    <div className="text-sm font-bold text-slate-100">
                      ₹{analysis.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </div>
                    <div className={`text-xs font-bold flex items-center gap-0.5 ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      <span>{isUp ? '+' : ''}{analysis.changePercent.toFixed(2)}%</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border inline-block ${analysis.wyckoff.phaseBadgeCls}`}>
                      {analysis.wyckoff.phaseLabel}
                    </span>
                    <div className="text-[9px] opacity-60 mt-0.5">{analysis.wyckoff.confidence}% Confidence</div>
                  </div>
                </div>

                {/* SMC & Accumulation Details */}
                <div className="space-y-2 my-2.5 text-xs">
                  {/* SMC Setup */}
                  <div className="flex items-center justify-between">
                    <span className="opacity-60 text-[11px]">SMC Setup:</span>
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${analysis.smc.setupBadgeCls}`}>
                      {analysis.smc.setupLabel}
                    </span>
                  </div>

                  {/* Order Block Demand Zone */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="opacity-60">Order Block Zone:</span>
                    <span className="font-bold text-indigo-300">
                      ₹{analysis.smc.orderBlockRange[0]} - ₹{analysis.smc.orderBlockRange[1]}
                    </span>
                  </div>

                  {/* CMF & Rating */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="opacity-60">Chaikin Money Flow (CMF):</span>
                    <span className={`font-bold ${analysis.accumulation.cmf >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {analysis.accumulation.cmfLabel} ({analysis.accumulation.ratingLabel})
                    </span>
                  </div>

                  {/* Delivery % Bar */}
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="opacity-60">Delivery Volume %:</span>
                      <span className="font-bold text-amber-300">{analysis.deliveryPercent}%</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden flex">
                      <div
                        className={`h-full ${analysis.isDeliverySpike ? 'bg-amber-400' : 'bg-emerald-500'}`}
                        style={{ width: `${analysis.deliveryPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Trade Execution Plan Levels */}
                <div className="mt-3 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[10px] space-y-1">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-emerald-300">Entry: ₹{analysis.tradeSetup.entryZone[0]} - ₹{analysis.tradeSetup.entryZone[1]}</span>
                    <span className="text-rose-400">SL: ₹{analysis.tradeSetup.stopLoss}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span>T1: ₹{analysis.tradeSetup.target1} • T2: ₹{analysis.tradeSetup.target2}</span>
                    <span className="text-emerald-400 font-bold">R:R {analysis.tradeSetup.riskRewardRatio}</span>
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-800/60" onClick={(e) => e.stopPropagation()}>
                  <a
                    href={analysis.tradingViewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2 py-1 rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600 hover:text-white transition-colors text-[10px] font-bold inline-flex items-center gap-1 border border-blue-500/40"
                    title={`Open TradingView ${analysis.symbol} Chart ↗`}
                  >
                    <span>TradingView</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>

                  <div className="flex items-center gap-1.5">
                    {onCreateTrade && rawStock && (
                      <button
                        onClick={() => onCreateTrade(rawStock, analysis.tradeSetup.bias.includes('BUY') ? 'BUY' : 'SELL')}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black transition-colors text-[10px]"
                      >
                        Paper Trade
                      </button>
                    )}

                    <button
                      onClick={() => rawStock && onSelectStock(rawStock)}
                      className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-colors text-[10px]"
                    >
                      Analyze
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* SUB-VIEW 2: WYCKOFF PHASE MATRIX (A-E) */}
      {activeSubView === 'WYCKOFF_MATRIX' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 font-mono">
          {/* Phase C (Spring & Test) Column */}
          <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-950/20 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-500/30">
              <span className="text-xs font-black text-emerald-300 uppercase flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Phase C: Spring & Test (Highest R:R)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                {sortedAnalyses.filter((a) => a.wyckoff.phase === 'PHASE_C_SPRING_TEST').length} Stocks
              </span>
            </div>

            <div className="space-y-2.5 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
              {sortedAnalyses
                .filter((a) => a.wyckoff.phase === 'PHASE_C_SPRING_TEST')
                .map((a) => (
                  <div
                    key={'wyck-c-' + a.symbol}
                    onClick={() => {
                      const raw = stocks.find((s) => s.symbol === a.symbol);
                      if (raw) onSelectStock(raw);
                    }}
                    className="p-3 rounded-xl bg-slate-900/90 border border-emerald-500/40 hover:border-emerald-400 cursor-pointer transition-all space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-100">{a.symbol}</span>
                      <span className="text-xs font-bold text-emerald-400">₹{(a.price ?? 0).toFixed(2)} ({(a.changePercent ?? 0) >= 0 ? '+' : ''}{(a.changePercent ?? 0).toFixed(2)}%)</span>
                    </div>
                    <div className="text-[10px] opacity-70">{a.wyckoff.description}</div>
                    <div className="flex items-center justify-between text-[10px] pt-1">
                      <span className="text-teal-300 font-bold">CMF: {a.accumulation.cmfLabel}</span>
                      <span className="text-amber-300 font-bold">Delivery: {a.deliveryPercent}%</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Phase D (SOS Breakout) Column */}
          <div className="p-4 rounded-2xl border border-teal-500/30 bg-teal-950/20 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-teal-500/30">
              <span className="text-xs font-black text-teal-300 uppercase flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-teal-400" />
                Phase D: Sign of Strength (Creek SOS)
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 font-bold">
                {sortedAnalyses.filter((a) => a.wyckoff.phase === 'PHASE_D_SOS_BREAKOUT').length} Stocks
              </span>
            </div>

            <div className="space-y-2.5 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
              {sortedAnalyses
                .filter((a) => a.wyckoff.phase === 'PHASE_D_SOS_BREAKOUT')
                .map((a) => (
                  <div
                    key={'wyck-d-' + a.symbol}
                    onClick={() => {
                      const raw = stocks.find((s) => s.symbol === a.symbol);
                      if (raw) onSelectStock(raw);
                    }}
                    className="p-3 rounded-xl bg-slate-900/90 border border-teal-500/40 hover:border-teal-400 cursor-pointer transition-all space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-100">{a.symbol}</span>
                      <span className="text-xs font-bold text-teal-400">₹{(a.price ?? 0).toFixed(2)} ({(a.changePercent ?? 0) >= 0 ? '+' : ''}{(a.changePercent ?? 0).toFixed(2)}%)</span>
                    </div>
                    <div className="text-[10px] opacity-70">{a.wyckoff.description}</div>
                    <div className="flex items-center justify-between text-[10px] pt-1">
                      <span className="text-indigo-300 font-bold">BOS Confirmed: YES</span>
                      <span className="text-emerald-300 font-bold">R:R {a.tradeSetup.riskRewardRatio}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>

          {/* Phase E (Active Markup) Column */}
          <div className="p-4 rounded-2xl border border-indigo-500/30 bg-indigo-950/20 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-indigo-500/30">
              <span className="text-xs font-black text-indigo-300 uppercase flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-indigo-400" />
                Phase E: Active Markup Trend
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                {sortedAnalyses.filter((a) => a.wyckoff.phase === 'PHASE_E_MARKUP').length} Stocks
              </span>
            </div>

            <div className="space-y-2.5 max-h-[600px] overflow-y-auto custom-scrollbar pr-1">
              {sortedAnalyses
                .filter((a) => a.wyckoff.phase === 'PHASE_E_MARKUP')
                .map((a) => (
                  <div
                    key={'wyck-e-' + a.symbol}
                    onClick={() => {
                      const raw = stocks.find((s) => s.symbol === a.symbol);
                      if (raw) onSelectStock(raw);
                    }}
                    className="p-3 rounded-xl bg-slate-900/90 border border-indigo-500/40 hover:border-indigo-400 cursor-pointer transition-all space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-slate-100">{a.symbol}</span>
                      <span className="text-xs font-bold text-indigo-400">₹{(a.price ?? 0).toFixed(2)} ({(a.changePercent ?? 0) >= 0 ? '+' : ''}{(a.changePercent ?? 0).toFixed(2)}%)</span>
                    </div>
                    <div className="text-[10px] opacity-70">{a.wyckoff.description}</div>
                    <div className="flex items-center justify-between text-[10px] pt-1">
                      <span className="text-teal-300 font-bold">Tier: {a.vwapBands.tierLabel}</span>
                      <span className="text-emerald-300 font-bold">PCR: {a.optionsDynamics.pcr}</span>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* SUB-VIEW 3: SMC ORDER BLOCK & FVG TRACKER */}
      {activeSubView === 'SMC_TRACKER' && (
        <div
          className={`rounded-2xl border transition-colors overflow-hidden font-mono ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1300px] text-xs">
              <thead>
                <tr
                  className={`text-[11px] font-bold uppercase tracking-wider border-b ${
                    isDark
                      ? 'bg-slate-950/80 border-slate-800 text-slate-400'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <th className="py-3 px-4">Symbol & Sector</th>
                  <th className="py-3 px-3 text-center text-amber-400 font-extrabold" title="Stock Listed Time (quantscreener format)">
                    <span>Listed At</span>
                  </th>
                  <th className="py-3 px-3 text-center text-indigo-400 font-extrabold" title="Signal Entry Time">
                    <span>Entry Time</span>
                  </th>
                  <th className="py-3 px-3 text-center text-purple-400 font-extrabold" title="Target Hit / SL Exit Time">
                    <span>Exit Time</span>
                  </th>
                  <th className="py-3 px-3">LTP & % Change</th>
                  <th className="py-3 px-3">SMC Setup Type</th>
                  <th className="py-3 px-3">Order Block Demand Zone</th>
                  <th className="py-3 px-3">Fair Value Gap (FVG)</th>
                  <th className="py-3 px-3">Liquidity Sweep Level</th>
                  <th className="py-3 px-3">Proximity to OB</th>
                  <th className="py-3 px-3">CHoCH Confirmed</th>
                  <th className="py-3 px-4 text-right">TradingView ↗</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {sortedAnalyses.map((a) => {
                  const raw = stocks.find((s) => s.symbol === a.symbol);
                  return (
                    <tr
                      key={'smc-tbl-' + a.symbol}
                      onClick={() => raw && onSelectStock(raw)}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-sm text-slate-100">{a.symbol}</div>
                        <div className="text-[10px] opacity-60">{a.sector}</div>
                      </td>

                      {/* Listed At */}
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded font-bold text-xs bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          {getStockListedAt(raw || { symbol: a.symbol })}
                        </span>
                      </td>

                      {/* Entry Time */}
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded font-bold text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                          {getStockEntryTime(raw || { symbol: a.symbol })}
                        </span>
                      </td>

                      {/* Exit Time */}
                      <td className="py-3 px-3 text-center">
                        {(() => {
                          const exitInfo = getStockExitTime(raw || { symbol: a.symbol });
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

                      <td className="py-3 px-3 font-bold">
                        <div>₹{a.price.toFixed(2)}</div>
                        <span className={a.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {a.changePercent >= 0 ? '+' : ''}{a.changePercent.toFixed(2)}%
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${a.smc.setupBadgeCls}`}>
                          {a.smc.setupLabel}
                        </span>
                      </td>

                      <td className="py-3 px-3 font-bold text-indigo-300">
                        ₹{a.smc.orderBlockRange[0]} - ₹{a.smc.orderBlockRange[1]}
                      </td>

                      <td className="py-3 px-3 text-amber-300 font-bold">
                        {a.smc.fvgRange ? `₹${a.smc.fvgRange[0]} - ₹${a.smc.fvgRange[1]}` : 'N/A'}
                      </td>

                      <td className="py-3 px-3 text-purple-300 font-bold">
                        {a.smc.liquiditySweepLevel ? `₹${a.smc.liquiditySweepLevel}` : 'N/A'}
                      </td>

                      <td className="py-3 px-3">
                        <span className={`font-bold ${a.smc.isInObZone ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {a.smc.isInObZone ? '⚡ INSIDE OB' : `${a.smc.proximityToObPercent}%`}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${a.smc.isChochConfirmed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>
                          {a.smc.isChochConfirmed ? 'YES ✅' : 'PENDING ⏳'}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <a
                          href={a.tradingViewUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2 py-1 rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600 hover:text-white transition-colors text-[10px] font-bold inline-flex items-center gap-1"
                        >
                          <span>Chart</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-VIEW 4: INSTITUTIONAL FLOW & DELIVERY TABLE */}
      {activeSubView === 'DELIVERY_TABLE' && (
        <div
          className={`rounded-2xl border transition-colors overflow-hidden font-mono ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1380px] text-xs">
              <thead>
                <tr
                  className={`text-[11px] font-bold uppercase tracking-wider border-b ${
                    isDark
                      ? 'bg-slate-950/80 border-slate-800 text-slate-400'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <th className="py-3 px-4">Symbol & Sector</th>
                  <th className="py-3 px-3 cursor-pointer hover:text-emerald-400" onClick={() => toggleSort('price')}>
                    <div className="flex items-center gap-1">
                      <span>LTP & Change</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-3 cursor-pointer hover:text-emerald-400" onClick={() => toggleSort('deliveryPercent')}>
                    <div className="flex items-center gap-1 text-amber-300">
                      <span>Delivery Volume %</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-3">Total Turnover</th>
                  <th className="py-3 px-3 cursor-pointer hover:text-emerald-400" onClick={() => toggleSort('instFlow')}>
                    <div className="flex items-center gap-1 text-emerald-400">
                      <span>Inst. Net Flow (₹ Cr)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-3">CMF Score</th>
                  <th className="py-3 px-3">VSA Pattern</th>
                  <th className="py-3 px-3">FII/DII Sentiment</th>
                  <th className="py-3 px-3 cursor-pointer hover:text-emerald-400" onClick={() => toggleSort('ratingScore')}>
                    <div className="flex items-center gap-1">
                      <span>Accumulation Score</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {sortedAnalyses.map((a) => {
                  const raw = stocks.find((s) => s.symbol === a.symbol);
                  return (
                    <tr
                      key={'del-tbl-' + a.symbol}
                      onClick={() => raw && onSelectStock(raw)}
                      className="hover:bg-slate-800/40 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                          <span>{a.symbol}</span>
                          {a.isDeliverySpike && (
                            <span className="px-1.5 py-0.2 text-[8px] rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              SPIKE
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] opacity-60">{a.sector}</div>
                      </td>

                      <td className="py-3 px-3 font-bold">
                        <div>₹{a.price.toFixed(2)}</div>
                        <span className={a.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {a.changePercent >= 0 ? '+' : ''}{a.changePercent.toFixed(2)}%
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between font-bold">
                            <span className={a.isDeliverySpike ? 'text-amber-300' : 'text-slate-200'}>{a.deliveryPercent}%</span>
                            <span className="text-[9px] opacity-60">+{a.deliveryVs20DayAvgPct}% vs avg</span>
                          </div>
                          <div className="w-24 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                            <div className="bg-amber-400 h-full" style={{ width: `${a.deliveryPercent}%` }} />
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3 font-bold text-indigo-300">
                        ₹{a.totalValueCr} Cr
                      </td>

                      <td className="py-3 px-3 font-bold">
                        <span className={a.accumulation.institutionalFlowCr >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                          {a.accumulation.institutionalFlowCr >= 0 ? `+₹${a.accumulation.institutionalFlowCr} Cr` : `-₹${Math.abs(a.accumulation.institutionalFlowCr)} Cr`}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span className={`font-bold ${a.accumulation.cmf >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {a.accumulation.cmfLabel}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span className="text-[10px] opacity-90">{a.vsa.patternLabel}</span>
                      </td>

                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${a.accumulation.fiiDiiBadgeCls}`}>
                          {a.accumulation.fiiDiiSentiment}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${a.accumulation.ratingBadgeCls}`}>
                          {a.accumulation.ratingScore}/100
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          <a
                            href={a.tradingViewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600 hover:text-white transition-colors text-[10px] font-bold inline-flex items-center gap-1"
                          >
                            <span>TV</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>

                          <button
                            onClick={() => raw && onSelectStock(raw)}
                            className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px]"
                          >
                            Inspect
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
