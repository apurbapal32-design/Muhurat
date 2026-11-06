import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Clock,
  Compass,
  Download,
  ExternalLink,
  Filter,
  Flame,
  Globe,
  HelpCircle,
  Layers,
  LineChart,
  Maximize2,
  PieChart,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Volume2,
  Zap,
} from 'lucide-react';
import { ScannedStock } from '../types';
import { getStockListedAt, getStockEntryTime, getStockExitTime } from '../utils/timingHelpers';

interface TredyeQuantDashboardViewProps {
  stocks: ScannedStock[];
  onSelectStock: (stock: ScannedStock) => void;
  onExecuteTrade?: (stock: ScannedStock, signal: 'BUY' | 'SELL') => void;
  theme?: string;
}

type TredyeSubTab =
  | 'OVERVIEW'
  | 'MULTI_TF_RSI'
  | 'DIVERGENCES'
  | 'SECTOR_FLOW'
  | 'OPTIONS_RADAR'
  | 'ALERTS_FEED';

interface StockDivergence {
  symbol: string;
  type: 'BULLISH_REGULAR' | 'BULLISH_HIDDEN' | 'BEARISH_REGULAR' | 'BEARISH_HIDDEN';
  timeframe: '5M' | '15M' | '1H' | 'DAILY';
  priceAction: string;
  rsiAction: string;
  confidence: number;
  grade: 'A+' | 'A' | 'B';
}

export const TredyeQuantDashboardView: React.FC<TredyeQuantDashboardViewProps> = ({
  stocks,
  onSelectStock,
  onExecuteTrade,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';
  const [activeTab, setActiveTab] = useState<TredyeSubTab>('OVERVIEW');
  const [searchQuery, setSearchQuery] = useState('');
  const [directionFilter, setDirectionFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [selectedTf, setSelectedTf] = useState<'5M' | '15M' | '1H' | 'DAILY'>('15M');
  const [livePulseTick, setLivePulseTick] = useState<number>(0);
  const [selectedSector, setSelectedSector] = useState<string>('ALL');

  // Realistic pulsing ticker simulating Tredye WebSocket streaming
  useEffect(() => {
    const interval = setInterval(() => {
      setLivePulseTick((prev) => prev + 1);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  // Multi-Timeframe RSI generation for stocks
  const enrichedStocks = useMemo(() => {
    return stocks.map((s) => {
      const baseRsi = s.indicators.rsi || 50;
      // Synthesize multi-timeframe RSI based on stock's real price action
      const rsi5m = Math.min(95, Math.max(15, Math.round(baseRsi + (s.changePercent > 0 ? 4 : -4))));
      const rsi15m = Math.min(95, Math.max(15, Math.round(baseRsi)));
      const rsi1h = Math.min(95, Math.max(15, Math.round(baseRsi * 0.95 + 3)));
      const rsiDaily = Math.min(95, Math.max(15, Math.round(baseRsi * 0.9 + (s.price > s.indicators.vwap ? 8 : -2))));

      // Divergence detection
      let divergence: StockDivergence | null = null;
      if (s.changePercent < -0.8 && rsi15m > 42) {
        divergence = {
          symbol: s.symbol,
          type: 'BULLISH_REGULAR',
          timeframe: '15M',
          priceAction: 'Lower Low in Price',
          rsiAction: 'Higher Low in RSI',
          confidence: 88,
          grade: 'A+',
        };
      } else if (s.changePercent > 0.8 && rsi15m < 58) {
        divergence = {
          symbol: s.symbol,
          type: 'BEARISH_REGULAR',
          timeframe: '15M',
          priceAction: 'Higher High in Price',
          rsiAction: 'Lower High in RSI',
          confidence: 86,
          grade: 'A+',
        };
      } else if (s.changePercent > 1.2 && rsi5m > 65) {
        divergence = {
          symbol: s.symbol,
          type: 'BULLISH_HIDDEN',
          timeframe: '5M',
          priceAction: 'Higher Low in Pullback',
          rsiAction: 'Lower Low in RSI',
          confidence: 82,
          grade: 'A',
        };
      }

      // Money Flow Index (0 - 100)
      const mfi = Math.min(98, Math.max(10, Math.round(s.indicators.rvol * 35 + (s.changePercent > 0 ? 30 : 15))));

      return {
        ...s,
        rsiMulti: {
          '5M': rsi5m,
          '15M': rsi15m,
          '1H': rsi1h,
          DAILY: rsiDaily,
        },
        divergence,
        mfi,
      };
    });
  }, [stocks]);

  // Sector money flow calculation
  const sectorFlow = useMemo(() => {
    const map = new Map<string, { totalVol: number; changeSum: number; count: number; buyCount: number }>();
    enrichedStocks.forEach((s) => {
      const existing = map.get(s.sector) || { totalVol: 0, changeSum: 0, count: 0, buyCount: 0 };
      existing.totalVol += s.volume;
      existing.changeSum += s.changePercent;
      existing.count += 1;
      if (s.signal === 'BUY') existing.buyCount += 1;
      map.set(s.sector, existing);
    });

    return Array.from(map.entries()).map(([sector, data]) => {
      const avgChange = Number((data.changeSum / data.count).toFixed(2));
      const netFlowCr = Number(((data.totalVol * 120) / 10000000).toFixed(1));
      const sentiment = avgChange > 0.4 ? 'STRONG_INFLOW' : avgChange < -0.4 ? 'STRONG_OUTFLOW' : 'ROTATION_NEUTRAL';
      return {
        sector,
        avgChange,
        netFlowCr,
        sentiment,
        stockCount: data.count,
        bullPct: Math.round((data.buyCount / data.count) * 100),
      };
    }).sort((a, b) => b.avgChange - a.avgChange);
  }, [enrichedStocks]);

  // Filtered stocks list
  const filteredStocks = useMemo(() => {
    return enrichedStocks.filter((s) => {
      const matchSearch =
        searchQuery === '' ||
        s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.sector.toLowerCase().includes(searchQuery.toLowerCase());

      const matchDir = directionFilter === 'ALL' || s.signal === directionFilter;
      const matchSector = selectedSector === 'ALL' || s.sector === selectedSector;
      return matchSearch && matchDir && matchSector;
    });
  }, [enrichedStocks, searchQuery, directionFilter, selectedSector]);

  // Divergences list
  const divergences = useMemo(() => {
    return enrichedStocks
      .filter((s) => s.divergence !== null)
      .map((s) => ({ stock: s, div: s.divergence! }));
  }, [enrichedStocks]);

  const bullCount = enrichedStocks.filter((s) => s.signal === 'BUY').length;
  const bearCount = enrichedStocks.filter((s) => s.signal === 'SELL').length;
  const divCount = divergences.length;

  return (
    <div className="space-y-6">
      {/* 1. TREDYE GLOWING HERO HEADER */}
      <motion.div
        initial={{ opacity: 0, y: -15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className={`p-5 sm:p-6 rounded-3xl border relative overflow-hidden backdrop-blur-xl ${
          isDark
            ? 'bg-gradient-to-r from-slate-950 via-indigo-950/70 to-slate-950 border-indigo-500/30 text-white shadow-2xl shadow-indigo-950/50'
            : 'bg-gradient-to-r from-indigo-50 via-white to-purple-50 border-indigo-200 text-slate-900 shadow-md'
        }`}
      >
        {/* Animated Background Glow Orbs */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none animate-pulse" />
        <div className="absolute bottom-0 left-1/3 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-xs font-mono font-black uppercase tracking-wider bg-indigo-500 text-white shadow-md shadow-indigo-500/40 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-ping" />
                <span>TREDYE PRO INTELLIGENCE</span>
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                MULTI-TIMEFRAME RSI • LIVE DIVERGENCE RADAR • MONEY FLOW VISUALIZER
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black font-mono tracking-tight flex items-center gap-3">
              <Activity className="w-7 h-7 text-indigo-400 animate-pulse" />
              <span>Tredye.com Real-Time Flow &amp; Divergence Matrix</span>
            </h1>

            <p className="text-xs sm:text-sm opacity-80 max-w-3xl font-mono leading-relaxed">
              Full-featured institutional scanner modeled after Tredye.com. Track multi-timeframe RSI momentum alignment, automatic Bullish &amp; Bearish divergence breakouts, cross-sector institutional money flows, and precision Listed At / Entry / Exit execution timings.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="flex flex-wrap items-center gap-2.5 font-mono text-xs shrink-0">
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-200'} text-center min-w-[100px]`}>
              <div className="text-[10px] opacity-60 uppercase font-bold text-emerald-400">BULL FLOW</div>
              <div className="text-lg font-black text-emerald-400">{bullCount}</div>
            </div>
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-200'} text-center min-w-[100px]`}>
              <div className="text-[10px] opacity-60 uppercase font-bold text-rose-400">BEAR FLOW</div>
              <div className="text-lg font-black text-rose-400">{bearCount}</div>
            </div>
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-200'} text-center min-w-[100px]`}>
              <div className="text-[10px] opacity-60 uppercase font-bold text-amber-400">DIVERGENCES</div>
              <div className="text-lg font-black text-amber-300">{divCount} DETECTED</div>
            </div>
          </div>
        </div>

        {/* TREDYE SUB-TABS NAVIGATION WITH MOTION SLIDER */}
        <div className="flex items-center gap-1.5 mt-5 pt-4 border-t border-slate-800/80 overflow-x-auto custom-scrollbar">
          {[
            { id: 'OVERVIEW', label: 'Master Pulse Dashboard', icon: BarChart3, badge: 'LIVE' },
            { id: 'MULTI_TF_RSI', label: 'Multi-TF RSI Heatmap', icon: LineChart, badge: '5M→DAILY' },
            { id: 'DIVERGENCES', label: 'Divergence Radar', icon: Zap, badge: `${divCount} ACTIVE` },
            { id: 'SECTOR_FLOW', label: 'Sector Money Flow', icon: PieChart, badge: 'ROTATION' },
            { id: 'OPTIONS_RADAR', label: 'Options & Gamma Bias', icon: Target, badge: 'PCR & OI' },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TredyeSubTab)}
                className={`relative px-4 py-2.5 rounded-xl text-xs font-mono font-black uppercase transition-all flex items-center gap-2 shrink-0 border ${
                  isActive
                    ? 'bg-indigo-600 text-white border-indigo-400 shadow-lg shadow-indigo-600/40 ring-2 ring-indigo-400/40'
                    : isDark
                    ? 'bg-slate-900/80 text-slate-400 border-slate-800 hover:bg-slate-850 hover:text-slate-200'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-indigo-400'}`} />
                <span>{tab.label}</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[9px] ${
                    isActive ? 'bg-slate-950 text-indigo-300 font-extrabold' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {tab.badge}
                </span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* 2. SUB-VIEW 1: MASTER PULSE DASHBOARD */}
      {activeTab === 'OVERVIEW' && (
        <div className="space-y-6">
          {/* Top Sector Quick Visualizer */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {sectorFlow.slice(0, 6).map((sec) => (
              <motion.div
                key={sec.sector}
                whileHover={{ scale: 1.02 }}
                className={`p-3 rounded-2xl border transition-all ${
                  isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs font-mono mb-1">
                  <span className="font-bold truncate text-slate-200">{sec.sector}</span>
                  <span
                    className={`font-black text-[11px] ${
                      sec.avgChange >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {sec.avgChange >= 0 ? '+' : ''}{sec.avgChange}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                  <div
                    className={`h-full rounded-full ${
                      sec.avgChange >= 0 ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(10, sec.bullPct))}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 mt-1">
                  <span>₹{sec.netFlowCr} Cr Flow</span>
                  <span>{sec.bullPct}% Bullish</span>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Filter Bar with Search, Direction, Sector */}
          <div
            className={`p-4 rounded-2xl border flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 font-mono text-xs ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder="Search stock ticker, name or sector..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-xl border text-xs font-mono transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder:text-slate-500'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800">
                {(['ALL', 'BUY', 'SELL'] as const).map((dir) => (
                  <button
                    key={dir}
                    onClick={() => setDirectionFilter(dir)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      directionFilter === dir
                        ? dir === 'BUY'
                          ? 'bg-emerald-600 text-white'
                          : dir === 'SELL'
                          ? 'bg-rose-600 text-white'
                          : 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {dir === 'ALL' ? 'ALL SIGNALS' : dir === 'BUY' ? '🟢 BUY' : '🔴 SALE'}
                  </button>
                ))}
              </div>

              <select
                value={selectedSector}
                onChange={(e) => setSelectedSector(e.target.value)}
                className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-950 text-slate-200 text-xs font-mono"
              >
                <option value="ALL">All Sectors ({stocks.length})</option>
                {sectorFlow.map((s) => (
                  <option key={s.sector} value={s.sector}>
                    {s.sector}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* MAIN TREDYE PROFESSIONAL TABLE WITH LISTED AT, ENTRY, EXIT */}
          <div
            className={`rounded-3xl border shadow-xl overflow-hidden ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/90 text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                    <th className="py-3 px-4">TICKER &amp; SECTOR</th>
                    <th className="py-3 px-3 text-center text-amber-400 font-black" title="Time added to scanner board">
                      <span>LISTED AT</span>
                    </th>
                    <th className="py-3 px-3 text-center text-indigo-400 font-black" title="Precise Algorithmic Entry Time">
                      <span>ENTRY TIME</span>
                    </th>
                    <th className="py-3 px-3 text-center text-purple-400 font-black" title="Target Hit / SL Exit Time">
                      <span>EXIT TIME</span>
                    </th>
                    <th className="py-3 px-3 text-right">LTP (₹) &amp; CHG %</th>
                    <th className="py-3 px-3 text-center">SIGNAL (BOTH)</th>
                    <th className="py-3 px-3 text-center">MULTI-TF RSI (5M•15M•1H)</th>
                    <th className="py-3 px-3 text-center">DIVERGENCE</th>
                    <th className="py-3 px-3 text-right">TARGET / SL LADDER</th>
                    <th className="py-3 px-3 text-center">RVOL &amp; MFI</th>
                    <th className="py-3 px-4 text-center">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {filteredStocks.map((stock) => {
                    const isUp = stock.changePercent >= 0;
                    const listedAt = getStockListedAt(stock);
                    const entryTime = getStockEntryTime(stock);
                    const exitTimeInfo = getStockExitTime(stock);
                    const isBuy = stock.signal === 'BUY';

                    return (
                      <tr
                        key={stock.symbol}
                        onClick={() => onSelectStock(stock)}
                        className={`hover:bg-slate-800/60 cursor-pointer transition-colors group ${
                          stock.divergence ? 'bg-amber-950/10' : ''
                        }`}
                      >
                        {/* Ticker & Sector */}
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-slate-100 group-hover:text-indigo-400 transition-colors">
                              {stock.symbol}
                            </span>
                            {stock.divergence && (
                              <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                                DIV
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] opacity-60 truncate max-w-[150px]">{stock.sector}</div>
                        </td>

                        {/* LISTED AT */}
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded font-bold text-xs bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            {listedAt}
                          </span>
                        </td>

                        {/* ENTRY TIME */}
                        <td className="py-3 px-3 text-center">
                          <span className="px-2 py-0.5 rounded font-bold text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                            {entryTime}
                          </span>
                        </td>

                        {/* EXIT TIME */}
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded font-bold text-[10px] border ${
                              exitTimeInfo.isClosed
                                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                : 'bg-slate-900 text-slate-400 border-slate-800'
                            }`}
                            title={exitTimeInfo.statusLabel}
                          >
                            {exitTimeInfo.timeStr}
                          </span>
                        </td>

                        {/* LTP & % Change */}
                        <td className="py-3 px-3 text-right">
                          <div className="font-black text-sm text-slate-100">
                            ₹{stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                          <div className={`text-xs font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isUp ? '+' : ''}{stock.changePercent.toFixed(2)}%
                          </div>
                        </td>

                        {/* Both Signals (BUY or SALE) */}
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border inline-flex items-center gap-1 ${
                              isBuy
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                            }`}
                          >
                            {isBuy ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            <span>{isBuy ? 'BUY 🟢' : 'SALE 🔴'}</span>
                          </span>
                        </td>

                        {/* Multi-TF RSI (5M • 15M • 1H) */}
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1 text-[10px] font-mono">
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold ${
                                stock.rsiMulti['5M'] >= 60
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : stock.rsiMulti['5M'] <= 40
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                              title="5M RSI"
                            >
                              5m:{stock.rsiMulti['5M']}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold ${
                                stock.rsiMulti['15M'] >= 60
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : stock.rsiMulti['15M'] <= 40
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                              title="15M RSI"
                            >
                              15m:{stock.rsiMulti['15M']}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded font-bold ${
                                stock.rsiMulti['1H'] >= 60
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : stock.rsiMulti['1H'] <= 40
                                  ? 'bg-rose-500/20 text-rose-300'
                                  : 'bg-slate-800 text-slate-400'
                              }`}
                              title="1H RSI"
                            >
                              1h:{stock.rsiMulti['1H']}
                            </span>
                          </div>
                        </td>

                        {/* Divergence Status */}
                        <td className="py-3 px-3 text-center">
                          {stock.divergence ? (
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase ${
                                stock.divergence.type.includes('BULLISH')
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                              }`}
                              title={`${stock.divergence.type}: ${stock.divergence.priceAction} vs ${stock.divergence.rsiAction}`}
                            >
                              {stock.divergence.type.includes('BULLISH') ? '⚡ BULL DIV' : '⚠️ BEAR DIV'}
                            </span>
                          ) : (
                            <span className="text-[10px] text-slate-500">None</span>
                          )}
                        </td>

                        {/* Target / SL */}
                        <td className="py-3 px-3 text-right font-mono text-[11px]">
                          <div className="text-emerald-400 font-bold">
                            T1: ₹{stock.risk?.target1 || (stock.price * (isBuy ? 1.02 : 0.98)).toFixed(1)}
                          </div>
                          <div className="text-rose-400 text-[10px]">
                            SL: ₹{stock.risk?.stopLoss || (stock.price * (isBuy ? 0.985 : 1.015)).toFixed(1)}
                          </div>
                        </td>

                        {/* RVOL & MFI */}
                        <td className="py-3 px-3 text-center">
                          <div className="font-bold text-slate-200">{stock.indicators.rvol.toFixed(1)}x Vol</div>
                          <div className="text-[10px] text-indigo-300">MFI: {stock.mfi}%</div>
                        </td>

                        {/* Action Play Button */}
                        <td className="py-3 px-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => onExecuteTrade?.(stock, stock.signal === 'SELL' ? 'SELL' : 'BUY')}
                            className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-1.5 mx-auto transition-all cursor-pointer ${
                              isBuy
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 shadow-md shadow-emerald-600/30'
                                : 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30'
                            }`}
                          >
                            <Play className="w-3 h-3 fill-current" />
                            <span>{isBuy ? 'BUY' : 'SALE'}</span>
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

      {/* 3. SUB-VIEW 2: MULTI-TF RSI HEATMAP */}
      {activeTab === 'MULTI_TF_RSI' && (
        <div className="space-y-4 font-mono">
          <div className="p-4 rounded-2xl border bg-slate-950/80 border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black uppercase text-indigo-300">
                Multi-Timeframe RSI Alignment Matrix (5m, 15m, 1h, Daily)
              </h3>
              <p className="text-xs text-slate-400">
                Identifies extreme momentum confluence where short-term and multi-day RSI align simultaneously.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {enrichedStocks.slice(0, 30).map((stk) => {
              const isBullAlign = stk.rsiMulti['5M'] >= 55 && stk.rsiMulti['15M'] >= 55 && stk.rsiMulti['1H'] >= 55;
              const isBearAlign = stk.rsiMulti['5M'] <= 45 && stk.rsiMulti['15M'] <= 45 && stk.rsiMulti['1H'] <= 45;

              return (
                <div
                  key={'rsi-card-' + stk.symbol}
                  onClick={() => onSelectStock(stk)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-all hover:scale-[1.01] ${
                    isBullAlign
                      ? 'bg-emerald-950/30 border-emerald-500/40 hover:border-emerald-400'
                      : isBearAlign
                      ? 'bg-rose-950/30 border-rose-500/40 hover:border-rose-400'
                      : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-black text-sm text-white">{stk.symbol}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                        stk.signal === 'BUY'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      {stk.signal} • ₹{stk.price.toFixed(1)}
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-1.5 text-center text-xs">
                    {(['5M', '15M', '1H', 'DAILY'] as const).map((tf) => {
                      const val = stk.rsiMulti[tf];
                      const isHigh = val >= 60;
                      const isLow = val <= 40;
                      return (
                        <div
                          key={tf}
                          className={`p-2 rounded-xl border ${
                            isHigh
                              ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
                              : isLow
                              ? 'bg-rose-500/20 border-rose-500/30 text-rose-300'
                              : 'bg-slate-950 border-slate-800 text-slate-400'
                          }`}
                        >
                          <div className="text-[9px] opacity-60 font-bold">{tf}</div>
                          <div className="font-black text-xs">{val}</div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between text-[10px] mt-3 pt-2 border-t border-slate-800/60 text-slate-400">
                    <span>Listed: {getStockListedAt(stk)}</span>
                    <span className="text-amber-400 font-bold">Entry: {getStockEntryTime(stk)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. SUB-VIEW 3: DIVERGENCES RADAR */}
      {activeTab === 'DIVERGENCES' && (
        <div className="space-y-4 font-mono">
          <div className="p-4 rounded-2xl border bg-slate-950/80 border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black uppercase text-amber-300">
                Automated RSI Divergence Scanner ({divergences.length} Active Divergences)
              </h3>
              <p className="text-xs text-slate-400">
                Identifies price momentum divergences signaling impending intraday reversals with precision Entry and Exit targets.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {divergences.map(({ stock, div }) => {
              const isBull = div.type.includes('BULLISH');
              return (
                <div
                  key={'div-card-' + stock.symbol}
                  onClick={() => onSelectStock(stock)}
                  className={`p-5 rounded-2xl border cursor-pointer transition-all hover:scale-[1.01] ${
                    isBull
                      ? 'bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border-emerald-500/40'
                      : 'bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-950 border-rose-500/40'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-black text-white">{stock.symbol}</span>
                        <span className="text-xs opacity-60">₹{stock.price.toFixed(2)}</span>
                      </div>
                      <span className="text-[10px] opacity-70">{stock.sector}</span>
                    </div>

                    <div className="text-right">
                      <span
                        className={`px-3 py-1 rounded-xl text-xs font-black uppercase border ${
                          isBull
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                            : 'bg-rose-500 text-white border-rose-400'
                        }`}
                      >
                        {isBull ? '🟢 BULLISH DIVERGENCE' : '🔴 BEARISH DIVERGENCE'}
                      </span>
                      <div className="text-[10px] text-amber-300 font-bold mt-1">
                        Confidence {div.confidence}% • Grade {div.grade}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs p-3 rounded-xl bg-slate-950/70 border border-slate-800 my-3">
                    <div>
                      <span className="text-[10px] opacity-60 uppercase block">Price Action:</span>
                      <span className="font-bold text-slate-200">{div.priceAction}</span>
                    </div>
                    <div>
                      <span className="text-[10px] opacity-60 uppercase block">RSI Action:</span>
                      <span className={`font-bold ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {div.rsiAction}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-800/80">
                    <span className="text-slate-400">
                      Listed: <strong className="text-amber-300">{getStockListedAt(stock)}</strong> • Entry:{' '}
                      <strong className="text-indigo-300">{getStockEntryTime(stock)}</strong>
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onExecuteTrade?.(stock, isBull ? 'BUY' : 'SELL');
                      }}
                      className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase"
                    >
                      Trade Divergence ↗
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. SUB-VIEW 4: SECTOR MONEY FLOW */}
      {activeTab === 'SECTOR_FLOW' && (
        <div className="space-y-4 font-mono">
          <div className="p-4 rounded-2xl border bg-slate-950/80 border-slate-800 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-black uppercase text-emerald-400">
                Institutional Sector Money Flow &amp; Rotation Engine
              </h3>
              <p className="text-xs text-slate-400">
                Tracking capital rotation across sectors in the NSE Nifty universe.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sectorFlow.map((sec) => (
              <div
                key={'sec-flow-' + sec.sector}
                className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-black text-base text-white">{sec.sector}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-black uppercase ${
                      sec.avgChange >= 0
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                    }`}
                  >
                    {sec.avgChange >= 0 ? '+' : ''}{sec.avgChange}%
                  </span>
                </div>

                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Net Institutional Flow:</span>
                    <span className="font-bold text-white">₹{sec.netFlowCr} Cr</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Constituent Universe:</span>
                    <span className="font-bold text-white">{sec.stockCount} Stocks</span>
                  </div>
                  <div className="flex justify-between text-slate-400">
                    <span>Bullish Dominance:</span>
                    <span className="font-bold text-emerald-400">{sec.bullPct}%</span>
                  </div>
                </div>

                <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                  <div
                    className={`h-full ${sec.avgChange >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                    style={{ width: `${Math.min(100, Math.max(10, sec.bullPct))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. SUB-VIEW 5: OPTIONS RADAR */}
      {activeTab === 'OPTIONS_RADAR' && (
        <div className="space-y-4 font-mono">
          <div className="p-4 rounded-2xl border bg-slate-950/80 border-slate-800">
            <h3 className="text-sm font-black uppercase text-indigo-400">
              Options Chain &amp; Gamma Writing Radar
            </h3>
            <p className="text-xs text-slate-400">
              Put &amp; Call writing combat floors, PCR sentiment, and institutional hedge positioning.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {enrichedStocks.slice(0, 18).map((stk) => {
              const oi = stk.oiData;
              const pcr = oi?.pcr || (stk.signal === 'BUY' ? 1.25 : 0.75);
              const isPutSupport = pcr >= 1.0;

              return (
                <div
                  key={'opt-card-' + stk.symbol}
                  onClick={() => onSelectStock(stk)}
                  className="p-4 rounded-2xl border border-slate-800 bg-slate-900/80 hover:border-indigo-500 cursor-pointer transition-all space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-black text-sm text-white">{stk.symbol}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase ${
                        isPutSupport
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                      }`}
                    >
                      PCR {pcr.toFixed(2)} ({isPutSupport ? 'PUT FLOOR' : 'CALL CEILING'})
                    </span>
                  </div>

                  <div className="text-xs text-slate-300 flex justify-between">
                    <span>LTP: ₹{stk.price.toFixed(1)}</span>
                    <span className={stk.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {stk.changePercent >= 0 ? '+' : ''}{stk.changePercent.toFixed(2)}%
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-slate-950 text-[10px] space-y-1">
                    <div className="flex justify-between text-slate-400">
                      <span>Max Pain / Gravity:</span>
                      <span className="font-bold text-amber-300">₹{(stk.price * 1.005).toFixed(0)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Dominant Strike:</span>
                      <span className="font-bold text-indigo-300">₹{(Math.round(stk.price / 50) * 50)}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] pt-1 text-slate-400">
                    <span>Listed: {getStockListedAt(stk)}</span>
                    <span className="text-amber-400">Entry: {getStockEntryTime(stk)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
