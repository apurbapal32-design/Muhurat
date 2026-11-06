import React, { useState, useMemo } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart2,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Code2,
  Copy,
  Download,
  ExternalLink,
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
import { ScannedStock, Candle } from '../types';
import {
  evaluatePatrickNillAuctionV2,
  generatePatrickNillPineScriptV5,
  PatrickNillAuctionV2Result,
  calculateVolumeWeightedValueArea,
} from '../utils/auctionMarketStrategyV2';
import { generateSyntheticCandles } from '../utils/technicalAnalysis';

interface PatrickNillAuctionV2ViewProps {
  stocks: ScannedStock[];
  selectedSymbol?: string;
  onSelectStock?: (stock: ScannedStock) => void;
  onExecuteTrade?: (stock: ScannedStock, signal: 'BUY' | 'SELL') => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const PatrickNillAuctionV2View: React.FC<PatrickNillAuctionV2ViewProps> = ({
  stocks,
  selectedSymbol: initialSymbol,
  onSelectStock,
  onExecuteTrade,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [gradeFilter, setGradeFilter] = useState<'ALL' | 'QUALIFIED_80' | 'A_PLUS' | 'A' | 'B' | 'VAL_SWEEPS' | 'VAH_SWEEPS'>('ALL');
  const [selectedStockSymbol, setSelectedStockSymbol] = useState<string>(
    initialSymbol || stocks[0]?.symbol || 'RELIANCE'
  );
  const [isPineScriptOpen, setIsPineScriptOpen] = useState<boolean>(false);
  const [isPineCopied, setIsPineCopied] = useState<boolean>(false);
  const [minScoreThreshold, setMinScoreThreshold] = useState<number>(80);

  // Compute auction analysis results for all stocks
  const evaluatedStocks = useMemo(() => {
    return stocks.map((stk) => {
      let auctionData = stk.auctionV2 as PatrickNillAuctionV2Result | undefined;
      if (!auctionData) {
        const dummyCandles = generateSyntheticCandles(stk.price, 40, stk.symbol);
        auctionData = evaluatePatrickNillAuctionV2(
          stk.symbol,
          dummyCandles,
          stk.indicators.marketState === 'BULLISH',
          stk.indicators.pdh,
          stk.indicators.pdl
        );
      }
      return {
        stock: stk,
        auction: auctionData,
      };
    });
  }, [stocks]);

  // Sort evaluated stocks by confluence score descending
  const sortedEvaluated = useMemo(() => {
    return [...evaluatedStocks].sort(
      (a, b) => b.auction.confluenceScore.totalScore - a.auction.confluenceScore.totalScore
    );
  }, [evaluatedStocks]);

  // Filter stocks
  const filteredStocks = useMemo(() => {
    return sortedEvaluated.filter(({ stock, auction }) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        stock.symbol.toLowerCase().includes(q) ||
        stock.name.toLowerCase().includes(q) ||
        stock.sector.toLowerCase().includes(q);

      if (!matchesSearch) return false;

      if (gradeFilter === 'QUALIFIED_80') return auction.confluenceScore.totalScore >= minScoreThreshold;
      if (gradeFilter === 'A_PLUS') return auction.confluenceScore.grade === 'A+';
      if (gradeFilter === 'A') return auction.confluenceScore.grade === 'A';
      if (gradeFilter === 'B') return auction.confluenceScore.grade === 'B';
      if (gradeFilter === 'VAL_SWEEPS') return auction.liquiditySweep.isLongSweep;
      if (gradeFilter === 'VAH_SWEEPS') return auction.liquiditySweep.isShortSweep;

      return true;
    });
  }, [sortedEvaluated, searchQuery, gradeFilter, minScoreThreshold]);

  // Selected Stock for deep dive
  const activeStockEntry = useMemo(() => {
    return (
      sortedEvaluated.find((e) => e.stock.symbol === selectedStockSymbol) ||
      sortedEvaluated[0] ||
      null
    );
  }, [sortedEvaluated, selectedStockSymbol]);

  const activeStock = activeStockEntry?.stock;
  const activeAuction = activeStockEntry?.auction;

  // Handle Copy Pine Script
  const handleCopyPineScript = () => {
    const pineCode = generatePatrickNillPineScriptV5(activeStock?.symbol || 'NIFTY');
    navigator.clipboard.writeText(pineCode);
    setIsPineCopied(true);
    setTimeout(() => setIsPineCopied(false), 2000);
  };

  const handleDownloadPineScript = () => {
    const pineCode = generatePatrickNillPineScriptV5(activeStock?.symbol || 'NIFTY');
    const blob = new Blob([pineCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PatrickNill_AuctionV2_${activeStock?.symbol || 'Strategy'}.pine`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Qualified count (>= 80 score)
  const qualifiedCount = sortedEvaluated.filter(
    (e) => e.auction.confluenceScore.totalScore >= 80
  ).length;

  const aPlusCount = sortedEvaluated.filter(
    (e) => e.auction.confluenceScore.grade === 'A+'
  ).length;

  const sweepCount = sortedEvaluated.filter(
    (e) => e.auction.liquiditySweep.isLongSweep || e.auction.liquiditySweep.isShortSweep
  ).length;

  return (
    <div
      className={`border rounded-2xl p-4 sm:p-6 my-4 transition-colors font-sans ${
        isDark
          ? 'bg-slate-900/95 border-slate-800 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900 shadow-sm'
      }`}
    >
      {/* 1. Header Banner */}
      <div
        className={`flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-3 rounded-2xl ${
              isDark
                ? 'bg-gradient-to-br from-amber-500/20 via-orange-500/20 to-emerald-500/20 text-amber-400 border border-amber-500/30'
                : 'bg-amber-50 text-amber-600 border border-amber-200'
            }`}
          >
            <Award className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black italic tracking-tight uppercase flex items-center gap-2">
                <span>Patrick Nill Auction Strategy V2</span>
              </h1>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-amber-500 text-slate-950 rounded shadow-sm uppercase">
                Auction Market Theory (AMT)
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-emerald-600 text-white rounded shadow-sm">
                True 70% Value Area
              </span>
            </div>
            <p className="text-xs font-mono opacity-70 mt-0.5">
              HTF Regime → True Value (POC/VAH/VAL) → Liquidity Sweep & Reclaim → RVOL → EMA Separation → 100-Pt Confluence Score → Dynamic SL/TP
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 font-mono flex-wrap">
          <button
            onClick={() => setIsPineScriptOpen(!isPineScriptOpen)}
            className={`px-3.5 py-2 text-xs font-bold uppercase rounded-xl border transition-all flex items-center gap-1.5 ${
              isDark
                ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Code2 className="w-3.5 h-3.5 text-amber-400" />
            <span>Pine Script v5</span>
          </button>

          <div
            className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 text-xs ${
              isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span className="text-[10px] uppercase font-bold opacity-60">Min Score:</span>
            <input
              type="number"
              min={60}
              max={95}
              step={5}
              value={minScoreThreshold}
              onChange={(e) => setMinScoreThreshold(Number(e.target.value))}
              className={`w-12 text-center font-bold font-mono rounded px-1 py-0.5 text-xs ${
                isDark ? 'bg-slate-800 text-amber-400 border border-slate-700' : 'bg-white text-amber-600 border border-slate-300'
              }`}
            />
            <span className="text-[10px] font-bold text-emerald-400">≥80 A-Grade</span>
          </div>
        </div>
      </div>

      {/* Pine Script v5 Code Modal / Collapsible */}
      {isPineScriptOpen && (
        <div
          className={`mb-6 p-4 rounded-xl border font-mono text-xs transition-all ${
            isDark ? 'bg-slate-950 border-amber-500/40' : 'bg-slate-50 border-amber-400'
          }`}
        >
          <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <Code2 className="w-4 h-4 text-amber-400" />
              <span className="font-bold uppercase tracking-wider text-amber-400">
                TradingView Pine Script v5 Source Code (Patrick Nill Auction Strategy V2)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyPineScript}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg transition-all flex items-center gap-1 text-[11px]"
              >
                {isPineCopied ? <CheckCircle2 className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                <span>{isPineCopied ? 'Copied' : 'Copy Script'}</span>
              </button>
              <button
                onClick={handleDownloadPineScript}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-lg transition-all flex items-center gap-1 text-[11px] border border-slate-700"
              >
                <Download className="w-3 h-3" />
                <span>.pine</span>
              </button>
            </div>
          </div>
          <pre
            className={`max-h-56 overflow-y-auto p-3 rounded-lg text-[11px] leading-relaxed ${
              isDark ? 'bg-slate-900/90 text-slate-300' : 'bg-white text-slate-800'
            }`}
          >
            {generatePatrickNillPineScriptV5(activeStock?.symbol || 'NIFTY')}
          </pre>
        </div>
      )}

      {/* 2. Top Metric KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 font-mono">
        <div
          className={`p-3 rounded-xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <span className="text-[11px] uppercase tracking-wider opacity-60 flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-amber-400" />
            Qualified Setups (≥80 Pts)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-amber-400">{qualifiedCount}</span>
            <span className="text-xs opacity-60">/ {sortedEvaluated.length} Stocks</span>
          </div>
          <span className="text-[10px] text-emerald-400 font-sans mt-0.5">
            Strict A & A+ Grade Execution Only
          </span>
        </div>

        <div
          className={`p-3 rounded-xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <span className="text-[11px] uppercase tracking-wider opacity-60 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            Apex A+ Setups (≥90 Pts)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-emerald-400">{aPlusCount}</span>
            <span className="text-xs opacity-60">High Probability</span>
          </div>
          <span className="text-[10px] text-emerald-400 font-sans mt-0.5">
            Full 10-point Confluence Alignment
          </span>
        </div>

        <div
          className={`p-3 rounded-xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <span className="text-[11px] uppercase tracking-wider opacity-60 flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            Liquidity Sweeps (VAL/VAH)
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-cyan-400">{sweepCount}</span>
            <span className="text-xs opacity-60">Active Sweeps</span>
          </div>
          <span className="text-[10px] text-cyan-400 font-sans mt-0.5">
            Failed Breakouts & Breakdowns
          </span>
        </div>

        <div
          className={`p-3 rounded-xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <span className="text-[11px] uppercase tracking-wider opacity-60 flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
            Min R:R Target Filter
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-purple-400">≥ 1.5 R:R</span>
            <span className="text-xs opacity-60">Target 3</span>
          </div>
          <span className="text-[10px] text-purple-400 font-sans mt-0.5">
            Dynamic 1R (BE) → 2R (Trail)
          </span>
        </div>
      </div>

      {/* 3. Deep Dive Stock Cockpit */}
      {activeStock && activeAuction && (
        <div
          className={`mb-6 p-4 sm:p-5 rounded-2xl border transition-all ${
            isDark
              ? 'bg-slate-950/80 border-slate-800 shadow-inner'
              : 'bg-slate-50 border-slate-200'
          }`}
        >
          {/* Stock Header Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black tracking-tight">{activeStock.symbol}</h2>
                  <span className="text-xs font-mono opacity-60">{activeStock.name}</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 bg-slate-800 text-slate-300 rounded">
                    {activeStock.sector}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1 font-mono text-xs">
                  <span className="text-base font-black">₹{activeStock.price.toFixed(2)}</span>
                  <span
                    className={`font-bold flex items-center ${
                      activeStock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {activeStock.changePercent >= 0 ? '+' : ''}
                    {activeStock.changePercent.toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Confluence Badge & Grade */}
            <div className="flex items-center gap-2 font-mono">
              <div
                className={`px-3 py-1.5 rounded-xl border flex items-center gap-2 ${
                  activeAuction.confluenceScore.totalScore >= 90
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : activeAuction.confluenceScore.totalScore >= 80
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                <div className="flex flex-col items-end">
                  <span className="text-[9px] uppercase font-bold opacity-70">Confluence Score</span>
                  <span className="text-base font-black leading-tight">
                    {activeAuction.confluenceScore.totalScore} / 100
                  </span>
                </div>
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-black text-sm ${
                    activeAuction.confluenceScore.grade === 'A+'
                      ? 'bg-emerald-500 text-slate-950'
                      : activeAuction.confluenceScore.grade === 'A'
                      ? 'bg-amber-500 text-slate-950'
                      : activeAuction.confluenceScore.grade === 'B'
                      ? 'bg-blue-500 text-slate-950'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {activeAuction.confluenceScore.grade}
                </div>
              </div>

              {/* Trade Execution Button */}
              {onExecuteTrade && activeAuction.signal !== 'NEUTRAL' && (
                <button
                  onClick={() => onExecuteTrade(activeStock, activeAuction.signal === 'BUY' ? 'BUY' : 'SELL')}
                  className={`px-4 py-2 font-black text-xs uppercase rounded-xl transition-all flex items-center gap-1.5 shadow-md ${
                    activeAuction.signal === 'BUY'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30'
                      : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30'
                  }`}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Execute {activeAuction.signal}</span>
                </button>
              )}
            </div>
          </div>

          {/* Core Strategy Grid: 3 Pillars (Value Area, Confluence Items, Dynamic Risk) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Column 1: True Volume Profile Value Area (POC, VAH, VAL) */}
            <div
              className={`p-4 rounded-xl border flex flex-col justify-between font-mono ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
                  <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-amber-400">
                    <BarChart2 className="w-4 h-4" />
                    True Volume-Weighted Value Area
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded">
                    ~70% Volume Zone
                  </span>
                </div>

                {/* Key Value Area Levels */}
                <div className="grid grid-cols-3 gap-2 mb-4 text-center">
                  <div
                    className={`p-2 rounded-lg border ${
                      isDark ? 'bg-rose-500/10 border-rose-500/30' : 'bg-rose-50 border-rose-200'
                    }`}
                  >
                    <span className="text-[10px] uppercase block opacity-70 text-rose-400">VAH (Upper)</span>
                    <span className="text-xs font-black text-rose-400">
                      ₹{activeAuction.valueArea.vah.toFixed(2)}
                    </span>
                  </div>

                  <div
                    className={`p-2 rounded-lg border ${
                      isDark ? 'bg-amber-500/15 border-amber-500/40' : 'bg-amber-50 border-amber-200'
                    }`}
                  >
                    <span className="text-[10px] uppercase block opacity-70 text-amber-400">POC (Peak Vol)</span>
                    <span className="text-xs font-black text-amber-400">
                      ₹{activeAuction.valueArea.poc.toFixed(2)}
                    </span>
                  </div>

                  <div
                    className={`p-2 rounded-lg border ${
                      isDark ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-emerald-50 border-emerald-200'
                    }`}
                  >
                    <span className="text-[10px] uppercase block opacity-70 text-emerald-400">VAL (Lower)</span>
                    <span className="text-xs font-black text-emerald-400">
                      ₹{activeAuction.valueArea.val.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Value Area Price Histogram Bins */}
                <div className="space-y-1 my-3">
                  <span className="text-[10px] uppercase tracking-wider opacity-60 block mb-1">
                    Volume Distribution Profile
                  </span>
                  <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {activeAuction.valueArea.bins.slice(0, 15).map((bin, idx) => {
                      const maxVol = Math.max(...activeAuction.valueArea.bins.map((b) => b.volume), 1);
                      const barWidth = Math.min(100, Math.round((bin.volume / maxVol) * 100));
                      const isCurrentPriceHere =
                        activeStock.price >= bin.priceLow && activeStock.price <= bin.priceHigh;

                      return (
                        <div key={idx} className="flex items-center gap-2 text-[10px]">
                          <span
                            className={`w-14 truncate text-right ${
                              bin.isPoc ? 'text-amber-400 font-bold' : isCurrentPriceHere ? 'text-cyan-400 font-bold' : 'opacity-60'
                            }`}
                          >
                            ₹{bin.price.toFixed(1)}
                          </span>
                          <div className="flex-1 bg-slate-800 rounded-full h-2 overflow-hidden flex items-center">
                            <div
                              className={`h-full rounded-full ${
                                bin.isPoc
                                  ? 'bg-amber-400'
                                  : bin.isInValueArea
                                  ? 'bg-emerald-500/70'
                                  : 'bg-slate-600'
                              }`}
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                          {bin.isPoc && (
                            <span className="text-[9px] font-bold text-amber-400 px-1 bg-amber-500/20 rounded">
                              POC
                            </span>
                          )}
                          {isCurrentPriceHere && !bin.isPoc && (
                            <span className="text-[9px] font-bold text-cyan-400 px-1 bg-cyan-500/20 rounded">
                              CMP
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Liquidity Sweep Status Box */}
                <div
                  className={`p-2.5 rounded-lg border text-xs mt-3 ${
                    activeAuction.liquiditySweep.isLongSweep
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : activeAuction.liquiditySweep.isShortSweep
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                      : 'bg-slate-800/60 border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold mb-0.5">
                    <Zap className="w-3.5 h-3.5 text-amber-400" />
                    <span>{activeAuction.liquiditySweep.details}</span>
                  </div>
                  <div className="text-[10px] opacity-75 font-sans">
                    {activeAuction.liquiditySweep.isLongSweep
                      ? 'Sellers swept below VAL but failed to hold; buyers reclaimed value with high RVOL.'
                      : activeAuction.liquiditySweep.isShortSweep
                      ? 'Buyers swept above VAH but got rejected; sellers pushed back inside value.'
                      : 'Monitoring boundaries for failed breakout/breakdown sweeps.'}
                  </div>
                </div>
              </div>

              {/* Market Regime Badge */}
              <div
                className={`mt-4 p-2 rounded-lg border flex items-center justify-between text-xs ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-300'
                }`}
              >
                <div>
                  <span className="text-[9px] uppercase opacity-60 block">Market Regime</span>
                  <span className="font-bold text-amber-400">{activeAuction.regime}</span>
                </div>
                <div className="text-right">
                  <span className="text-[9px] uppercase opacity-60 block">Recommended Mode</span>
                  <span className="font-bold text-emerald-400">{activeAuction.recommendedMode}</span>
                </div>
              </div>
            </div>

            {/* Column 2: 100-Point Confluence Breakdown */}
            <div
              className={`p-4 rounded-xl border flex flex-col justify-between font-mono ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
                  <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-amber-400">
                    <Award className="w-4 h-4" />
                    100-Point Confluence Score Breakdown
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      activeAuction.confluenceScore.isQualified
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {activeAuction.confluenceScore.isQualified ? 'QUALIFIED (≥80)' : 'UNQUALIFIED (<80)'}
                  </span>
                </div>

                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {activeAuction.confluenceScore.items.map((item) => (
                    <div
                      key={item.id}
                      className={`p-2 rounded-lg border flex items-start justify-between gap-2 transition-all ${
                        item.achieved
                          ? isDark
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-slate-200'
                            : 'bg-emerald-50 border-emerald-200 text-slate-800'
                          : isDark
                          ? 'bg-slate-950/40 border-slate-800/80 text-slate-500'
                          : 'bg-slate-100 border-slate-200 text-slate-400'
                      }`}
                    >
                      <div className="flex items-start gap-1.5 text-[11px] leading-tight">
                        {item.achieved ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-slate-600 shrink-0 mt-0.5" />
                        )}
                        <div>
                          <span className={item.achieved ? 'font-bold' : ''}>{item.condition}</span>
                          <span className="block text-[9px] opacity-70 font-sans mt-0.5">
                            {item.notes}
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-black shrink-0 ${
                          item.achieved ? 'text-emerald-400' : 'text-slate-600'
                        }`}
                      >
                        +{item.points} / {item.maxPoints}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Score Summary Footer */}
              <div
                className={`mt-3 p-2.5 rounded-lg border flex items-center justify-between text-xs ${
                  activeAuction.confluenceScore.totalScore >= 80
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold">
                  <Award className="w-4 h-4" />
                  <span>Total Confluence: {activeAuction.confluenceScore.totalScore} / 100</span>
                </div>
                <span className="font-bold uppercase tracking-wider">
                  Grade {activeAuction.confluenceScore.grade}
                </span>
              </div>
            </div>

            {/* Column 3: Structural Dynamic SL/TP Risk Ladder */}
            <div
              className={`p-4 rounded-xl border flex flex-col justify-between font-mono ${
                isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-800">
                  <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-amber-400">
                    <Target className="w-4 h-4" />
                    Structural SL & Dynamic Targets
                  </span>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                      activeAuction.riskLadder.passesMinRR
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}
                  >
                    R:R {activeAuction.riskLadder.riskRewardT3}x (Req ≥ 1.5)
                  </span>
                </div>

                {/* SL & Entry Strip */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div
                    className={`p-2.5 rounded-lg border ${
                      isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                    }`}
                  >
                    <span className="text-[10px] uppercase opacity-60 block">Entry (CMP)</span>
                    <span className="text-sm font-black text-slate-100">
                      ₹{activeAuction.riskLadder.entryPrice.toFixed(2)}
                    </span>
                  </div>

                  <div
                    className={`p-2.5 rounded-lg border ${
                      isDark ? 'bg-rose-500/10 border-rose-500/30' : 'bg-rose-50 border-rose-200'
                    }`}
                  >
                    <span className="text-[10px] uppercase opacity-70 text-rose-400 block">
                      Structural SL ({activeAuction.riskLadder.slAtrMultiple}x ATR)
                    </span>
                    <span className="text-sm font-black text-rose-400">
                      ₹{activeAuction.riskLadder.structuralSL.toFixed(2)}
                    </span>
                    <span className="text-[9px] opacity-60 block">
                      -₹{activeAuction.riskLadder.slDistance.toFixed(2)} Risk
                    </span>
                  </div>
                </div>

                {/* Dynamic Multi-Tier Targets */}
                <div className="space-y-2 mb-3">
                  {/* Target 1 */}
                  <div
                    className={`p-2 rounded-lg border flex items-center justify-between ${
                      isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] uppercase opacity-60 block">Target 1 (1.0R)</span>
                      <span className="text-xs font-bold text-emerald-400">
                        ₹{activeAuction.riskLadder.target1_1R.toFixed(2)}
                      </span>
                    </div>
                    <span className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-bold">
                      SL → Breakeven
                    </span>
                  </div>

                  {/* Target 2 */}
                  <div
                    className={`p-2 rounded-lg border flex items-center justify-between ${
                      isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] uppercase opacity-60 block">Target 2 (2.0R)</span>
                      <span className="text-xs font-bold text-emerald-400">
                        ₹{activeAuction.riskLadder.target2_2R.toFixed(2)}
                      </span>
                    </div>
                    <span className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-bold">
                      Lock 1R & Trail
                    </span>
                  </div>

                  {/* Target 3: Major Liquidity */}
                  <div
                    className={`p-2.5 rounded-lg border flex items-center justify-between ${
                      isDark
                        ? 'bg-gradient-to-r from-emerald-950/40 to-slate-950 border-emerald-500/40'
                        : 'bg-emerald-50 border-emerald-300'
                    }`}
                  >
                    <div>
                      <span className="text-[10px] uppercase opacity-70 text-emerald-400 block">
                        Target 3 ({activeAuction.riskLadder.target3Name})
                      </span>
                      <span className="text-sm font-black text-emerald-400">
                        ₹{activeAuction.riskLadder.target3_Liquidity.toFixed(2)}
                      </span>
                    </div>
                    <span className="text-xs font-black text-emerald-300">
                      {activeAuction.riskLadder.riskRewardT3}x R:R
                    </span>
                  </div>
                </div>

                {/* Trailing Rule Description */}
                <div
                  className={`p-2 rounded-lg text-[10px] font-sans border ${
                    isDark ? 'bg-slate-950/70 border-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span className="font-bold text-amber-400 font-mono">Trailing Management:</span>{' '}
                  {activeAuction.riskLadder.trailingRule}
                </div>
              </div>

              {/* Indicator Metrics Micro-Strip */}
              <div className="grid grid-cols-4 gap-1 mt-3 pt-3 border-t border-slate-800 text-center text-[10px]">
                <div>
                  <span className="opacity-60 block">RVOL</span>
                  <span
                    className={`font-bold ${
                      activeAuction.metrics.rvolHighQuality
                        ? 'text-emerald-400'
                        : activeAuction.metrics.rvolBaseline
                        ? 'text-amber-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {activeAuction.metrics.rvol}x
                  </span>
                </div>
                <div>
                  <span className="opacity-60 block">ADX</span>
                  <span
                    className={`font-bold ${
                      activeAuction.metrics.adxTrending ? 'text-emerald-400' : 'text-slate-400'
                    }`}
                  >
                    {activeAuction.metrics.adx.toFixed(1)}
                  </span>
                </div>
                <div>
                  <span className="opacity-60 block">EMA Sep</span>
                  <span className="font-bold text-cyan-400">
                    {activeAuction.metrics.ema9_21_Sep.toFixed(2)} ATR
                  </span>
                </div>
                <div>
                  <span className="opacity-60 block">RSI Recov</span>
                  <span
                    className={`font-bold ${
                      activeAuction.metrics.rsiRecoveryLong || activeAuction.metrics.rsiRecoveryShort
                        ? 'text-emerald-400'
                        : 'text-slate-400'
                    }`}
                  >
                    {activeAuction.metrics.rsi.toFixed(0)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. Full Universe Scanner & Filter Table */}
      <div className="space-y-4 font-mono">
        {/* Search & Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border flex-1 ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <Search className="w-4 h-4 opacity-50" />
              <input
                type="text"
                placeholder="Search symbol, sector, company..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-xs w-full font-mono"
              />
            </div>
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 flex-wrap text-xs">
            <button
              onClick={() => setGradeFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg border transition-all ${
                gradeFilter === 'ALL'
                  ? 'bg-slate-200 text-slate-900 font-bold border-slate-300'
                  : isDark
                  ? 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
              }`}
            >
              All ({sortedEvaluated.length})
            </button>

            <button
              onClick={() => setGradeFilter('QUALIFIED_80')}
              className={`px-3 py-1.5 rounded-lg border transition-all ${
                gradeFilter === 'QUALIFIED_80'
                  ? 'bg-amber-500 text-slate-950 font-black border-amber-400 shadow-sm'
                  : isDark
                  ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
              }`}
            >
              Qualified ≥80 ({qualifiedCount})
            </button>

            <button
              onClick={() => setGradeFilter('A_PLUS')}
              className={`px-3 py-1.5 rounded-lg border transition-all ${
                gradeFilter === 'A_PLUS'
                  ? 'bg-emerald-600 text-white font-black border-emerald-500 shadow-sm'
                  : isDark
                  ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              A+ Setups ({aPlusCount})
            </button>

            <button
              onClick={() => setGradeFilter('VAL_SWEEPS')}
              className={`px-3 py-1.5 rounded-lg border transition-all ${
                gradeFilter === 'VAL_SWEEPS'
                  ? 'bg-cyan-600 text-white font-black border-cyan-500 shadow-sm'
                  : isDark
                  ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20'
                  : 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100'
              }`}
            >
              VAL Long Sweeps
            </button>

            <button
              onClick={() => setGradeFilter('VAH_SWEEPS')}
              className={`px-3 py-1.5 rounded-lg border transition-all ${
                gradeFilter === 'VAH_SWEEPS'
                  ? 'bg-rose-600 text-white font-black border-rose-500 shadow-sm'
                  : isDark
                  ? 'bg-rose-500/10 text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
                  : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
              }`}
            >
              VAH Short Sweeps
            </button>
          </div>
        </div>

        {/* Scanner Results Table */}
        <div
          className={`rounded-xl border overflow-x-auto ${
            isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <table className="w-full text-left text-xs">
            <thead
              className={`text-[10px] uppercase font-bold tracking-wider border-b ${
                isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
              }`}
            >
              <tr>
                <th className="p-3">Rank & Stock</th>
                <th className="p-3 text-right">Price / Chg%</th>
                <th className="p-3 text-center">Score / Grade</th>
                <th className="p-3 text-center">Market Regime</th>
                <th className="p-3 text-center">RVOL</th>
                <th className="p-3 text-center">Value Area (VAL - POC - VAH)</th>
                <th className="p-3 text-center">Structural SL</th>
                <th className="p-3 text-center">Target 1 & 2</th>
                <th className="p-3 text-center">Target 3 (Liquidity)</th>
                <th className="p-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredStocks.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center opacity-60">
                    No stocks matching the selected filter criteria.
                  </td>
                </tr>
              ) : (
                filteredStocks.map(({ stock, auction }, idx) => {
                  const isSelected = selectedStockSymbol === stock.symbol;

                  return (
                    <tr
                      key={stock.symbol}
                      onClick={() => {
                        setSelectedStockSymbol(stock.symbol);
                        onSelectStock?.(stock);
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? isDark
                            ? 'bg-amber-500/10 hover:bg-amber-500/15'
                            : 'bg-amber-50 hover:bg-amber-100'
                          : isDark
                          ? 'hover:bg-slate-900/80'
                          : 'hover:bg-slate-100/80'
                      }`}
                    >
                      {/* Rank & Symbol */}
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold opacity-40 w-4">#{idx + 1}</span>
                          <div>
                            <div className="font-bold flex items-center gap-1.5">
                              <span>{stock.symbol}</span>
                              {auction.liquiditySweep.isLongSweep && (
                                <span className="px-1 py-0.2 text-[8px] bg-emerald-500 text-slate-950 font-black rounded uppercase">
                                  VAL SWEEP
                                </span>
                              )}
                              {auction.liquiditySweep.isShortSweep && (
                                <span className="px-1 py-0.2 text-[8px] bg-rose-500 text-white font-black rounded uppercase">
                                  VAH SWEEP
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] opacity-60 block truncate max-w-[120px]">
                              {stock.sector}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Price / Chg% */}
                      <td className="p-3 text-right">
                        <div className="font-bold">₹{stock.price.toFixed(2)}</div>
                        <span
                          className={`text-[10px] font-bold ${
                            stock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {stock.changePercent >= 0 ? '+' : ''}
                          {stock.changePercent.toFixed(2)}%
                        </span>
                      </td>

                      {/* Score / Grade */}
                      <td className="p-3 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          <span
                            className={`font-black text-xs ${
                              auction.confluenceScore.totalScore >= 90
                                ? 'text-emerald-400'
                                : auction.confluenceScore.totalScore >= 80
                                ? 'text-amber-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {auction.confluenceScore.totalScore}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-black rounded ${
                              auction.confluenceScore.grade === 'A+'
                                ? 'bg-emerald-500 text-slate-950'
                                : auction.confluenceScore.grade === 'A'
                                ? 'bg-amber-500 text-slate-950'
                                : auction.confluenceScore.grade === 'B'
                                ? 'bg-blue-500 text-slate-950'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {auction.confluenceScore.grade}
                          </span>
                        </div>
                      </td>

                      {/* Market Regime */}
                      <td className="p-3 text-center">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                            auction.regime === 'TRENDING_UP'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : auction.regime === 'TRENDING_DOWN'
                              ? 'bg-rose-500/20 text-rose-300'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {auction.regime}
                        </span>
                      </td>

                      {/* RVOL */}
                      <td className="p-3 text-center">
                        <span
                          className={`font-bold ${
                            auction.metrics.rvolHighQuality
                              ? 'text-emerald-400'
                              : auction.metrics.rvolBaseline
                              ? 'text-amber-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {auction.metrics.rvol}x
                        </span>
                      </td>

                      {/* Value Area Range */}
                      <td className="p-3 text-center">
                        <div className="text-[10px]">
                          <span className="text-emerald-400">₹{auction.valueArea.val.toFixed(1)}</span>
                          <span className="opacity-40 mx-1">/</span>
                          <span className="text-amber-400 font-bold">₹{auction.valueArea.poc.toFixed(1)}</span>
                          <span className="opacity-40 mx-1">/</span>
                          <span className="text-rose-400">₹{auction.valueArea.vah.toFixed(1)}</span>
                        </div>
                      </td>

                      {/* Structural SL */}
                      <td className="p-3 text-center">
                        <div className="font-bold text-rose-400 text-xs">
                          ₹{auction.riskLadder.structuralSL.toFixed(2)}
                        </div>
                        <span className="text-[9px] opacity-60">
                          {auction.riskLadder.slAtrMultiple}x ATR
                        </span>
                      </td>

                      {/* Target 1 & 2 */}
                      <td className="p-3 text-center">
                        <div className="text-[10px]">
                          <span className="text-emerald-400">T1: ₹{auction.riskLadder.target1_1R.toFixed(1)}</span>
                          <span className="opacity-40 mx-1">|</span>
                          <span className="text-emerald-400">T2: ₹{auction.riskLadder.target2_2R.toFixed(1)}</span>
                        </div>
                      </td>

                      {/* Target 3 */}
                      <td className="p-3 text-center">
                        <div className="font-bold text-emerald-400 text-xs">
                          ₹{auction.riskLadder.target3_Liquidity.toFixed(2)}
                        </div>
                        <span className="text-[9px] opacity-70">
                          {auction.riskLadder.riskRewardT3}x R:R
                        </span>
                      </td>

                      {/* Action */}
                      <td className="p-3 text-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStockSymbol(stock.symbol);
                            onSelectStock?.(stock);
                          }}
                          className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                            isSelected
                              ? 'bg-amber-500 text-slate-950 border-amber-400 font-black'
                              : isDark
                              ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                              : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                          }`}
                        >
                          Deep Dive
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
