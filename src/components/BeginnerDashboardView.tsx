import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Zap,
  Calculator,
  HelpCircle,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Play,
  RotateCcw,
  Search,
  Sliders,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Award,
  Layers,
  BarChart2,
  Clock,
  Briefcase,
  XCircle,
  Eye,
} from 'lucide-react';
import { MarketOverview, ScannedStock, TradePosition } from '../types';
import { getStockListedAt, getStockEntryTime, getStockExitTime } from '../utils/timingHelpers';

interface BeginnerDashboardViewProps {
  stocks: ScannedStock[];
  topBuy: ScannedStock[];
  topSell: ScannedStock[];
  overview: MarketOverview;
  trades: TradePosition[];
  onSelectStock: (stock: ScannedStock) => void;
  onCreateTrade: (tradeData: {
    symbol: string;
    signal: 'BUY' | 'SELL';
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    target1: number;
    target2: number;
  }) => void;
  onCloseTrade?: (tradeId: string) => void;
  onSwitchToProMode: (tab?: string) => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
  isScanning?: boolean;
  onRefreshScan?: () => void;
}

export const BeginnerDashboardView: React.FC<BeginnerDashboardViewProps> = ({
  stocks,
  topBuy,
  topSell,
  overview,
  trades,
  onSelectStock,
  onCreateTrade,
  onCloseTrade,
  onSwitchToProMode,
  theme = 'dark',
  isScanning = false,
  onRefreshScan,
}) => {
  const isDark = theme !== 'light';

  // Local state for interactive beginner tools
  const [filterTab, setFilterTab] = useState<'ALL' | 'BUY' | 'SELL' | 'TOP_VOLUME' | 'LOW_RISK'>('BUY');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showGuide, setShowGuide] = useState<boolean>(true);
  const [showCalculator, setShowCalculator] = useState<boolean>(false);

  // Position Sizing Calculator state
  const [calcCapital, setCalcCapital] = useState<number>(25000);
  const [calcRiskPct, setCalcRiskPct] = useState<number>(1.5);
  const [calcSelectedStock, setCalcSelectedStock] = useState<ScannedStock | null>(null);

  // Active stock simulator state
  const [simulatingStock, setSimulatingStock] = useState<ScannedStock | null>(null);
  const [simQty, setSimQty] = useState<number>(25);

  // Selected stock for calculator initial assignment
  const initialStock = useMemo(() => {
    return topBuy[0] || stocks[0] || null;
  }, [topBuy, stocks]);

  const activeCalcStock = calcSelectedStock || initialStock;

  // Calculate safe position sizing
  const calcResults = useMemo(() => {
    if (!activeCalcStock) return { riskAmount: 0, stopLossDistance: 0, maxShares: 0, totalInvestment: 0 };
    const riskAmount = (calcCapital * calcRiskPct) / 100;
    const entry = activeCalcStock.price;
    const sl = activeCalcStock.risk?.stopLoss || entry * 0.985;
    const stopLossDistance = Math.max(0.5, Math.abs(entry - sl));
    const maxSharesByRisk = Math.floor(riskAmount / stopLossDistance);
    const maxSharesByCapital = Math.floor((calcCapital * 0.95) / entry);
    const safeShares = Math.max(1, Math.min(maxSharesByRisk, maxSharesByCapital));
    const totalInvestment = safeShares * entry;
    return {
      riskAmount: Math.round(riskAmount),
      stopLossDistance: Number(stopLossDistance.toFixed(2)),
      maxShares: safeShares,
      totalInvestment: Math.round(totalInvestment),
    };
  }, [calcCapital, calcRiskPct, activeCalcStock]);

  // Market mood determination
  const marketMood = useMemo(() => {
    const niftyChg = overview.nifty50.changePercent;
    if (niftyChg >= 0.6) {
      return {
        label: 'Strong Bullish Market',
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10 border-emerald-500/30',
        badge: 'bg-emerald-500 text-slate-950',
        icon: TrendingUp,
        advice: 'Buyers are in full control today. Focus on Green (Buy) signals for higher win-rate.',
        sentiment: 'POSITIVE',
      };
    } else if (niftyChg <= -0.6) {
      return {
        label: 'Bearish Market Pressure',
        color: 'text-rose-400',
        bg: 'bg-rose-500/10 border-rose-500/30',
        badge: 'bg-rose-500 text-white',
        icon: TrendingDown,
        advice: 'Sellers dominate the broader market. Exercise caution on buys or look for Sell signals.',
        sentiment: 'NEGATIVE',
      };
    }
    return {
      label: 'Balanced / Rangebound Market',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/30',
      badge: 'bg-amber-500 text-slate-950',
      icon: Sparkles,
      advice: 'Indices are consolidating. Stick strictly to confirmed breakout stocks with strong volume.',
      sentiment: 'NEUTRAL',
    };
  }, [overview]);

  // Filter stocks based on beginner criteria
  const filteredStocks = useMemo(() => {
    return stocks.filter((stock) => {
      // Search filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSym = stock.symbol.toLowerCase().includes(q);
        const matchesName = stock.name.toLowerCase().includes(q);
        const matchesSector = stock.sector.toLowerCase().includes(q);
        if (!matchesSym && !matchesName && !matchesSector) return false;
      }

      // Tab filters
      if (filterTab === 'BUY') {
        return stock.signal === 'BUY' && (stock.aiScore || 0) >= 65;
      }
      if (filterTab === 'SELL') {
        return stock.signal === 'SELL' && (stock.aiScore || 0) >= 65;
      }
      if (filterTab === 'TOP_VOLUME') {
        return (stock.indicators?.rvol || 1) >= 1.5;
      }
      if (filterTab === 'LOW_RISK') {
        return (stock.indicators?.atrRatio || 1) <= 1.2 && (stock.aiScore || 0) >= 70;
      }
      return true;
    });
  }, [stocks, filterTab, searchQuery]);

  // Open Trades PnL calculation
  const openTrades = useMemo(() => {
    return trades.filter((t) => t.status === 'OPEN');
  }, [trades]);

  const totalUnrealizedPnL = useMemo(() => {
    return openTrades.reduce((acc, t) => acc + (t.unrealizedPnL || 0), 0);
  }, [openTrades]);

  // Simple beginner rationale generator in plain English
  const getSimpleReason = (stock: ScannedStock): string => {
    const isBuy = stock.signal === 'BUY';
    const rvol = stock.indicators?.rvol || 1.2;
    const vwapAbove = stock.price >= (stock.indicators?.vwap || stock.price);

    if (isBuy) {
      if (rvol >= 2.0 && vwapAbove) {
        return '🔥 High volume surge above intraday average price (VWAP). Strong buyer momentum.';
      }
      if (stock.price > (stock.indicators?.pdh || stock.price * 0.99)) {
        return '🚀 Broke above Previous Day High with healthy buying support.';
      }
      return '🟢 Steady upward momentum with institutional accumulation.';
    } else {
      if (rvol >= 2.0 && !vwapAbove) {
        return '⚠️ Heavy volume selling pressure below intraday average price (VWAP).';
      }
      return '🔴 Downward momentum with aggressive seller dominance.';
    }
  };

  const handleSimulateTradeClick = (stock: ScannedStock) => {
    const recommendedQty = Math.max(5, Math.min(50, Math.floor(10000 / stock.price)));
    setSimulatingStock(stock);
    setSimQty(recommendedQty);
  };

  const handleConfirmSimulateTrade = () => {
    if (!simulatingStock) return;
    const isBuy = simulatingStock.signal === 'BUY';
    const entry = simulatingStock.price;
    const sl = simulatingStock.risk?.stopLoss || (isBuy ? entry * 0.985 : entry * 1.015);
    const t1 = simulatingStock.risk?.target1 || (isBuy ? entry * 1.02 : entry * 0.98);
    const t2 = simulatingStock.risk?.target2 || (isBuy ? entry * 1.035 : entry * 0.965);

    onCreateTrade({
      symbol: simulatingStock.symbol,
      signal: isBuy ? 'BUY' : 'SELL',
      entryPrice: Number(entry.toFixed(2)),
      quantity: simQty,
      stopLoss: Number(sl.toFixed(2)),
      target1: Number(t1.toFixed(2)),
      target2: Number(t2.toFixed(2)),
    });

    setSimulatingStock(null);
  };

  return (
    <div className="space-y-6 pt-2">
      {/* 1. Header Banner & Mode Indicator */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isDark
            ? 'bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-indigo-500/20 shadow-xl'
            : 'bg-gradient-to-r from-indigo-50 via-white to-emerald-50 border-indigo-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                🔰 Simple Beginner Mode Active
              </span>
              <span className="text-xs opacity-60">Zero Jargon • Safe Sizing • Instant Signals</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Intraday Trading Made Simple &amp; Safe
            </h2>
            <p className="text-sm opacity-75 max-w-3xl">
              High-probability stock setups automatically calculated for today&apos;s Indian market.
              Select any pick below to see clear entry, target, and risk-controlled practice trade simulation.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => setShowCalculator(!showCalculator)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 border transition-all cursor-pointer ${
                showCalculator
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                  : isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-xs'
              }`}
            >
              <Calculator className="w-4 h-4 text-indigo-400" />
              <span>Risk &amp; Share Sizing Calculator</span>
            </button>

            <button
              onClick={() => onSwitchToProMode('v9-vega-greeks')}
              className={`px-4 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 border transition-all cursor-pointer ${
                isDark
                  ? 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border-purple-500/40'
                  : 'bg-purple-100 hover:bg-purple-200 text-purple-900 border-purple-300'
              }`}
            >
              <Zap className="w-4 h-4 text-purple-400" />
              <span>Switch to Pro Quant Mode ⚡</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Interactive Risk & Share Sizing Calculator (Expandable) */}
      {showCalculator && (
        <div
          className={`p-5 rounded-2xl border transition-all animate-fadeIn ${
            isDark
              ? 'bg-slate-900/90 border-indigo-500/30 shadow-2xl'
              : 'bg-white border-indigo-200 shadow-md'
          }`}
        >
          <div className="flex items-center justify-between border-b pb-3 mb-4 border-slate-700/50">
            <div className="flex items-center gap-2">
              <Calculator className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-base">Intraday Position &amp; Risk Sizing Calculator</h3>
              <span className="text-xs opacity-60">(Protect your capital from big drawdowns)</span>
            </div>
            <button
              onClick={() => setShowCalculator(false)}
              className="text-xs opacity-60 hover:opacity-100 p-1 cursor-pointer"
            >
              ✕ Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="space-y-1.5">
              <label className="text-xs font-bold opacity-75">Your Total Trading Capital (₹)</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs opacity-60">₹</span>
                <input
                  type="number"
                  value={calcCapital}
                  onChange={(e) => setCalcCapital(Math.max(1000, Number(e.target.value)))}
                  step={5000}
                  className={`w-full pl-7 pr-3 py-2 rounded-xl text-sm font-bold border ${
                    isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold opacity-75">Maximum Risk per Trade</label>
              <select
                value={calcRiskPct}
                onChange={(e) => setCalcRiskPct(Number(e.target.value))}
                className={`w-full px-3 py-2 rounded-xl text-sm font-bold border ${
                  isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              >
                <option value={1.0}>1.0% (Very Safe / Recommended for Beginners)</option>
                <option value={1.5}>1.5% (Balanced)</option>
                <option value={2.0}>2.0% (Standard Intraday)</option>
                <option value={3.0}>3.0% (Aggressive)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold opacity-75">Selected Stock for Sizing</label>
              <select
                value={activeCalcStock?.symbol || ''}
                onChange={(e) => {
                  const s = stocks.find((stk) => stk.symbol === e.target.value);
                  if (s) setCalcSelectedStock(s);
                }}
                className={`w-full px-3 py-2 rounded-xl text-sm font-bold border ${
                  isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              >
                {stocks.slice(0, 30).map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol} - ₹{s.price.toFixed(2)} ({s.signal})
                  </option>
                ))}
              </select>
            </div>

            <div
              className={`p-3 rounded-xl border text-center ${
                isDark ? 'bg-indigo-950/40 border-indigo-500/30' : 'bg-indigo-50 border-indigo-200'
              }`}
            >
              <div className="text-[10px] font-bold uppercase opacity-70 text-indigo-300">Recommended Quantity</div>
              <div className="text-xl font-black text-indigo-400">
                {calcResults.maxShares} Shares
              </div>
              <div className="text-[10px] opacity-75">
                Max Risk: ₹{calcResults.riskAmount} • Total Cost: ₹{calcResults.totalInvestment.toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Market Barometer & 3-Step Intraday Rulebook */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Market Mood Card */}
        <div
          className={`p-4 rounded-2xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold uppercase tracking-wider opacity-60 flex items-center gap-1.5">
              <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
              Today&apos;s Market Barometer
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${marketMood.badge}`}>
              {marketMood.sentiment}
            </span>
          </div>

          <div className="my-3 flex items-center gap-3">
            <div className={`p-3 rounded-2xl border ${marketMood.bg}`}>
              <marketMood.icon className={`w-7 h-7 ${marketMood.color}`} />
            </div>
            <div>
              <h4 className={`text-lg font-black ${marketMood.color}`}>{marketMood.label}</h4>
              <p className="text-xs opacity-75 mt-0.5">{marketMood.advice}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-800/40 text-center font-mono text-xs">
            <div>
              <div className="text-[10px] opacity-60">NIFTY 50</div>
              <div className={`font-bold ${overview.nifty50.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {overview.nifty50.change >= 0 ? '+' : ''}{overview.nifty50.changePercent}%
              </div>
            </div>
            <div>
              <div className="text-[10px] opacity-60">BANK NIFTY</div>
              <div className={`font-bold ${overview.bankNifty.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {overview.bankNifty.change >= 0 ? '+' : ''}{overview.bankNifty.changePercent}%
              </div>
            </div>
            <div>
              <div className="text-[10px] opacity-60">NIFTY IT</div>
              <div className={`font-bold ${overview.niftyIT.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {overview.niftyIT.change >= 0 ? '+' : ''}{overview.niftyIT.changePercent}%
              </div>
            </div>
          </div>
        </div>

        {/* 3-Step Intraday Trading Rulebook */}
        <div
          className={`lg:col-span-2 p-4 rounded-2xl border flex flex-col justify-between ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" />
              Beginner Golden Rulebook (3 Steps to Safe Profits)
            </span>
            <button
              onClick={() => setShowGuide(!showGuide)}
              className="text-xs opacity-60 hover:opacity-100 flex items-center gap-1 cursor-pointer"
            >
              {showGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              <span>{showGuide ? 'Hide Rules' : 'Show Rules'}</span>
            </button>
          </div>

          {showGuide && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-2">
              <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-5 h-5 rounded-full bg-indigo-500 text-white text-[11px] font-black flex items-center justify-center">1</span>
                  <h5 className="font-bold text-xs">Match the Trend</h5>
                </div>
                <p className="text-[11px] opacity-75">
                  If Nifty is green, prefer Green (BUY) signals. If Nifty is falling, avoid buying stocks.
                </p>
              </div>

              <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-slate-950 text-[11px] font-black flex items-center justify-center">2</span>
                  <h5 className="font-bold text-xs">Pick High AI Score</h5>
                </div>
                <p className="text-[11px] opacity-75">
                  Pick stocks with an AI Score of 80% or above and strong volume above 1.5x.
                </p>
              </div>

              <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center">3</span>
                  <h5 className="font-bold text-xs">Never Skip Stop Loss</h5>
                </div>
                <p className="text-[11px] opacity-75">
                  Always set the Stop Loss shown in the card. Exit immediately if price hits Stop Loss.
                </p>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between text-[11px] opacity-70 pt-2 border-t border-slate-800/40">
            <span>💡 Pro Tip: Never risk more than 1% to 2% of your capital on a single trade.</span>
            <span className="font-bold text-indigo-400">Total Scanned: {stocks.length} NSE Stocks</span>
          </div>
        </div>
      </div>

      {/* 4. Top Recommended High-Probability Trade Picks */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-black tracking-tight">
              Today&apos;s Top 4 Recommended Trading Ideas
            </h3>
            <span className="text-xs px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
              Highest Win-Rate Probability
            </span>
          </div>
          <div className="text-xs opacity-60 hidden sm:block">
            Click &ldquo;Practice Trade&rdquo; to simulate risk-free execution
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...topBuy.slice(0, 3), ...topSell.slice(0, 1)].map((stock) => {
            const isBuy = stock.signal === 'BUY';
            const entry = stock.price;
            const sl = stock.risk?.stopLoss || (isBuy ? entry * 0.985 : entry * 1.015);
            const t1 = stock.risk?.target1 || (isBuy ? entry * 1.02 : entry * 0.98);
            const rewardPct = Math.abs(((t1 - entry) / entry) * 100).toFixed(1);
            const riskPct = Math.abs(((entry - sl) / entry) * 100).toFixed(1);

            return (
              <div
                key={stock.symbol}
                className={`p-4 rounded-2xl border transition-all duration-200 flex flex-col justify-between hover:scale-[1.01] hover:shadow-xl ${
                  isBuy
                    ? isDark
                      ? 'bg-gradient-to-b from-emerald-950/20 via-slate-900 to-slate-900 border-emerald-500/30'
                      : 'bg-gradient-to-b from-emerald-50/60 to-white border-emerald-300 shadow-sm'
                    : isDark
                    ? 'bg-gradient-to-b from-rose-950/20 via-slate-900 to-slate-900 border-rose-500/30'
                    : 'bg-gradient-to-b from-rose-50/60 to-white border-rose-300 shadow-sm'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1 ${
                        isBuy
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-rose-500 text-white'
                      }`}
                    >
                      {isBuy ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                      {isBuy ? 'STRONG BUY' : 'STRONG SELL'}
                    </span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Score: {stock.aiScore || 88}%
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-1">
                    <div>
                      <h4 className="text-lg font-black tracking-tight">{stock.symbol}</h4>
                      <p className="text-xs opacity-60 truncate max-w-[150px]">{stock.name}</p>
                    </div>
                    <div className="text-right font-mono">
                      <div className="text-base font-black">₹{stock.price.toFixed(2)}</div>
                      <div
                        className={`text-xs font-bold ${
                          stock.change >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {stock.change >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                      </div>
                    </div>
                  </div>

                  <div
                    className={`mt-3 p-2.5 rounded-xl text-xs ${
                      isDark ? 'bg-slate-950/70' : 'bg-slate-100/90'
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase opacity-60 mb-0.5">Why this pick:</div>
                    <p className="text-[11px] leading-relaxed opacity-90">{getSimpleReason(stock)}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 my-3 text-xs font-mono">
                    <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-white border-slate-200'}`}>
                      <div className="text-[10px] opacity-60 uppercase">Target (Reward)</div>
                      <div className="font-bold text-emerald-400">
                        ₹{t1.toFixed(2)} <span className="text-[10px]">(+{rewardPct}%)</span>
                      </div>
                    </div>
                    <div className={`p-2 rounded-lg border ${isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-white border-slate-200'}`}>
                      <div className="text-[10px] opacity-60 uppercase">Stop Loss (Risk)</div>
                      <div className="font-bold text-rose-400">
                        ₹{sl.toFixed(2)} <span className="text-[10px]">(-{riskPct}%)</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-800/40">
                  <button
                    onClick={() => handleSimulateTradeClick(stock)}
                    className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isBuy
                        ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black shadow-md shadow-emerald-600/30'
                        : 'bg-rose-600 hover:bg-rose-500 text-white font-black shadow-md shadow-rose-600/30'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Practice Trade</span>
                  </button>

                  <button
                    onClick={() => onSelectStock(stock)}
                    className={`p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                      isDark
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                    }`}
                    title="View Detailed Chart & Indicators"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 5. Practice Portfolio Tracker (Open Paper Trades) */}
      {openTrades.length > 0 && (
        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDark
              ? 'bg-gradient-to-r from-slate-900 via-indigo-950/30 to-slate-900 border-indigo-500/30'
              : 'bg-gradient-to-r from-indigo-50 to-emerald-50 border-indigo-200 shadow-sm'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-indigo-400" />
              <h3 className="font-bold text-base">Your Active Practice Portfolio (Paper Trading)</h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {openTrades.length} Active {openTrades.length === 1 ? 'Trade' : 'Trades'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs opacity-70">Total Unrealized P&amp;L:</span>
              <span
                className={`text-lg font-black font-mono px-3 py-1 rounded-xl border ${
                  totalUnrealizedPnL >= 0
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                }`}
              >
                {totalUnrealizedPnL >= 0 ? '+' : ''}₹{totalUnrealizedPnL.toFixed(2)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {openTrades.map((t) => (
              <div
                key={t.id}
                className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                  isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                        t.signal === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'
                      }`}
                    >
                      {t.signal}
                    </span>
                    <span className="font-bold text-sm">{t.symbol}</span>
                    <span className="text-xs opacity-60 font-mono">({t.quantity} Qty)</span>
                  </div>
                  <div className="text-xs font-mono opacity-75 mt-1">
                    Entry: ₹{t.entryPrice.toFixed(2)} • Target: ₹{t.target1.toFixed(2)}
                  </div>
                </div>

                <div className="text-right">
                  <div
                    className={`text-sm font-black font-mono ${
                      t.unrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {t.unrealizedPnL >= 0 ? '+' : ''}₹{(t.unrealizedPnL || 0).toFixed(2)}
                  </div>
                  {onCloseTrade && (
                    <button
                      onClick={() => onCloseTrade(t.id)}
                      className="mt-1 text-[10px] font-bold px-2 py-0.5 rounded bg-slate-800 hover:bg-rose-900/40 text-slate-300 hover:text-rose-300 border border-slate-700 transition-all cursor-pointer"
                    >
                      Exit / Book
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. Beginner-Friendly Stock Radar Table */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
          <div className="space-y-1">
            <h3 className="text-lg font-black tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              Beginner-Friendly Live Scanner Table
            </h3>
            <p className="text-xs opacity-60">
              Clear signals with plain-English rationales, entry targets, and 1-click execution.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Quick Filter Tabs */}
            <div
              className={`p-1 rounded-xl border flex items-center gap-1 text-xs font-bold ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}
            >
              <button
                onClick={() => setFilterTab('BUY')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterTab === 'BUY'
                    ? 'bg-emerald-600 text-slate-950 font-black'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                🟢 Buy Signals ({stocks.filter((s) => s.signal === 'BUY').length})
              </button>
              <button
                onClick={() => setFilterTab('SELL')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterTab === 'SELL'
                    ? 'bg-rose-600 text-white font-black'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                🔴 Sell Signals ({stocks.filter((s) => s.signal === 'SELL').length})
              </button>
              <button
                onClick={() => setFilterTab('TOP_VOLUME')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterTab === 'TOP_VOLUME'
                    ? 'bg-amber-600 text-white font-black'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                🔥 High Volume
              </button>
              <button
                onClick={() => setFilterTab('LOW_RISK')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterTab === 'LOW_RISK'
                    ? 'bg-indigo-600 text-white font-black'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                🛡️ Low Risk
              </button>
              <button
                onClick={() => setFilterTab('ALL')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterTab === 'ALL'
                    ? 'bg-slate-700 text-white font-black'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                All ({stocks.length})
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 opacity-50" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search stock (e.g. RELIANCE)..."
                className={`pl-9 pr-3 py-1.5 rounded-xl text-xs border transition-all ${
                  isDark
                    ? 'bg-slate-950 border-slate-700 text-white focus:border-indigo-500'
                    : 'bg-slate-50 border-slate-300 text-slate-900 focus:border-indigo-600'
                }`}
              />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr
                className={`border-b text-[11px] font-bold uppercase tracking-wider ${
                  isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'
                }`}
              >
                <th className="py-3 px-4">Stock &amp; Sector</th>
                <th className="py-3 px-3 text-center text-amber-400 font-bold" title="Stock Listed Time (quantscreener format)">
                  <span>Listed At</span>
                </th>
                <th className="py-3 px-3 text-center text-indigo-400 font-bold" title="Signal Entry Time">
                  <span>Entry Time</span>
                </th>
                <th className="py-3 px-3 text-center text-purple-400 font-bold" title="Exit Time (Target Hit / SL)">
                  <span>Exit Time</span>
                </th>
                <th className="py-3 px-3 text-right">Price &amp; Change</th>
                <th className="py-3 px-3 text-center">AI Recommendation</th>
                <th className="py-3 px-4">Why Trade This? (Plain English)</th>
                <th className="py-3 px-3 text-center">Target (Profit)</th>
                <th className="py-3 px-3 text-center">Stop Loss (Risk)</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {filteredStocks.slice(0, 20).map((stock) => {
                const isBuy = stock.signal === 'BUY';
                const entry = stock.price;
                const sl = stock.risk?.stopLoss || (isBuy ? entry * 0.985 : entry * 1.015);
                const t1 = stock.risk?.target1 || (isBuy ? entry * 1.02 : entry * 0.98);

                return (
                  <tr
                    key={stock.symbol}
                    className={`transition-colors ${
                      isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <div className="font-bold text-sm flex items-center gap-1.5">
                        <button
                          onClick={() => onSelectStock(stock)}
                          className="hover:text-indigo-400 hover:underline cursor-pointer text-left"
                        >
                          {stock.symbol}
                        </button>
                      </div>
                      <div className="text-[10px] opacity-60 truncate max-w-[140px]">
                        {stock.name} • {stock.sector}
                      </div>
                    </td>

                    {/* Listed At */}
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-amber-500/10 text-amber-300 border border-amber-500/30">
                        {getStockListedAt(stock)}
                      </span>
                    </td>

                    {/* Entry Time */}
                    <td className="py-3 px-3 text-center">
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                        {getStockEntryTime(stock)}
                      </span>
                    </td>

                    {/* Exit Time */}
                    <td className="py-3 px-3 text-center">
                      {(() => {
                        const exitInfo = getStockExitTime(stock);
                        return (
                          <span
                            className={`px-2 py-0.5 rounded font-mono font-bold text-[10px] border ${
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

                    <td className="py-3 px-3 text-right font-mono">
                      <div className="font-bold text-sm">₹{stock.price.toFixed(2)}</div>
                      <div
                        className={`text-[11px] font-bold ${
                          stock.change >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {stock.change >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%
                      </div>
                    </td>

                    <td className="py-3 px-3 text-center">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase inline-flex items-center gap-1 ${
                          isBuy
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {isBuy ? '🟢 Strong Buy' : '🔴 Sell'}
                        <span className="opacity-70 font-mono">({stock.aiScore || 85}%)</span>
                      </span>
                    </td>

                    <td className="py-3 px-4 max-w-xs">
                      <p className="text-[11px] leading-relaxed opacity-85">
                        {getSimpleReason(stock)}
                      </p>
                    </td>

                    <td className="py-3 px-3 text-center font-mono font-bold text-emerald-400">
                      ₹{t1.toFixed(2)}
                      <div className="text-[10px] opacity-60 font-sans font-normal">Target 1</div>
                    </td>

                    <td className="py-3 px-3 text-center font-mono font-bold text-rose-400">
                      ₹{sl.toFixed(2)}
                      <div className="text-[10px] opacity-60 font-sans font-normal">Max Risk Exit</div>
                    </td>

                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleSimulateTradeClick(stock)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer ${
                            isBuy
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black'
                              : 'bg-rose-600 hover:bg-rose-500 text-white font-black'
                          }`}
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Practice</span>
                        </button>

                        <button
                          onClick={() => onSelectStock(stock)}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                            isDark
                              ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                          }`}
                          title="View Chart"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredStocks.length === 0 && (
          <div className="py-12 text-center opacity-60 space-y-2">
            <AlertCircle className="w-8 h-8 mx-auto opacity-50" />
            <p className="text-sm font-bold">No stocks matching your filter.</p>
            <button
              onClick={() => {
                setFilterTab('ALL');
                setSearchQuery('');
              }}
              className="text-xs text-indigo-400 underline cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* 7. Practice Trade Modal */}
      {simulatingStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div
            className={`w-full max-w-md p-6 rounded-2xl border shadow-2xl space-y-4 ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-slate-700/50">
              <div className="flex items-center gap-2">
                <Play className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-base">Confirm Practice Trade (Simulated)</h3>
              </div>
              <button
                onClick={() => setSimulatingStock(null)}
                className="text-xs opacity-60 hover:opacity-100 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300">
              ℹ️ This is a 100% risk-free paper trade to practice intraday execution without real money.
            </div>

            <div className="space-y-3 font-mono text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-800/40">
                <span className="opacity-60">Stock:</span>
                <span className="font-bold text-sm">{simulatingStock.symbol} ({simulatingStock.signal})</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/40">
                <span className="opacity-60">Entry Price:</span>
                <span className="font-bold">₹{simulatingStock.price.toFixed(2)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/40">
                <span className="opacity-60">Target 1 (Profit):</span>
                <span className="font-bold text-emerald-400">
                  ₹{(simulatingStock.risk?.target1 || simulatingStock.price * 1.02).toFixed(2)} (+2.0%)
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800/40">
                <span className="opacity-60">Stop Loss (Risk):</span>
                <span className="font-bold text-rose-400">
                  ₹{(simulatingStock.risk?.stopLoss || simulatingStock.price * 0.985).toFixed(2)} (-1.5%)
                </span>
              </div>

              <div className="pt-2">
                <label className="text-xs font-bold opacity-75 block mb-1 font-sans">
                  Quantity (Shares to Buy):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={simQty}
                    onChange={(e) => setSimQty(Math.max(1, Number(e.target.value)))}
                    className={`flex-1 px-3 py-2 rounded-xl text-sm font-bold border ${
                      isDark ? 'bg-slate-950 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
                    }`}
                  />
                  <span className="text-xs opacity-60">
                    Cost: ₹{(simQty * simulatingStock.price).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-3">
              <button
                onClick={() => setSimulatingStock(null)}
                className={`flex-1 py-2.5 rounded-xl text-xs font-bold border ${
                  isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-300'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSimulateTrade}
                className="flex-1 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-slate-950 shadow-lg shadow-emerald-600/30 transition-all cursor-pointer"
              >
                🚀 Execute Practice Trade
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
