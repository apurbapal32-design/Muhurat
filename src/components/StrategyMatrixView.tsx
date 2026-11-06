import React, { useState } from 'react';
import {
  ShieldAlert,
  Target,
  TrendingUp,
  Percent,
  DollarSign,
  Calculator,
  CheckCircle2,
  Sliders,
  Layers,
  Sparkles,
  ArrowRight,
  Flame,
  Zap,
  BookOpen,
  Activity,
  Award,
  AlertTriangle,
} from 'lucide-react';
import { ScannedStock } from '../types';

interface StrategyMatrixViewProps {
  stocks?: ScannedStock[];
  onSelectStock?: (stock: ScannedStock) => void;
  theme?: 'dark' | 'light';
}

export const StrategyMatrixView: React.FC<StrategyMatrixViewProps> = ({
  stocks = [],
  onSelectStock,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';

  // Calculator state
  const [tradeType, setTradeType] = useState<
    'AUCTION_V2' | 'EQUITY_INTRADAY' | 'SWING' | 'FUTURES_ATR' | 'OPTION_BUY' | 'OPTION_SELL'
  >('AUCTION_V2');

  const [accountCapital, setAccountCapital] = useState<number>(100000); // Default ₹1 Lakh
  const [riskPercent, setRiskPercent] = useState<number>(1.0); // 1% per trade default
  const [entryPrice, setEntryPrice] = useState<number>(500);
  const [atrPoints, setAtrPoints] = useState<number>(80);
  const [optionPremium, setOptionPremium] = useState<number>(100);
  const [selectedStockSymbol, setSelectedStockSymbol] = useState<string>('');

  // Auto populate values when user selects a scanned stock
  const handleSelectScannedStock = (symbol: string) => {
    setSelectedStockSymbol(symbol);
    const stock = stocks.find((s) => s.symbol === symbol);
    if (stock) {
      setEntryPrice(stock.price);
      if (stock.indicators.atr) {
        setAtrPoints(Number(stock.indicators.atr.toFixed(2)));
      }
    }
  };

  // Compute calculated targets and stop losses based on strategy formulas
  const calculateStrategyResults = () => {
    const maxRiskAmount = (accountCapital * riskPercent) / 100;

    if (tradeType === 'AUCTION_V2') {
      // Patrick Nill Auction Strategy V2: Sweep Low - 0.2 ATR, Bounded [1.0x, 2.0x ATR]
      const rawAtrRisk = Math.max(1.0 * atrPoints, Math.min(2.0 * atrPoints, 1.2 * atrPoints));
      const slPrice = Number((entryPrice - rawAtrRisk).toFixed(2));
      const riskPerShare = entryPrice - slPrice;
      const tgt1 = Number((entryPrice + 1.0 * riskPerShare).toFixed(2)); // 1R
      const tgt2 = Number((entryPrice + 2.0 * riskPerShare).toFixed(2)); // 2R
      const tgt3 = Number((entryPrice + 3.0 * riskPerShare).toFixed(2)); // Major Liquidity
      const maxQty = Math.floor(maxRiskAmount / (riskPerShare || 1));
      const totalPositionValue = maxQty * entryPrice;

      return {
        strategyName: 'Patrick Nill Auction Strategy V2 (AMT 70% Value Area)',
        slPercent: `${((riskPerShare / entryPrice) * 100).toFixed(2)}% (${riskPerShare.toFixed(1)} pts)`,
        slPrice,
        riskPerShare: Number(riskPerShare.toFixed(2)),
        tgt1,
        tgt2,
        tgt3,
        rrRatio: '1:1.0 (T1) / 1:2.0 (T2) / 1:3.0+ (T3)',
        maxQty,
        totalPositionValue,
        maxRiskAmount,
        expectedProfitT1: Number((maxQty * (tgt1 - entryPrice)).toFixed(2)),
        expectedProfitT2: Number((maxQty * (tgt2 - entryPrice)).toFixed(2)),
        expectedProfitT3: Number((maxQty * (tgt3 - entryPrice)).toFixed(2)),
        exitRules:
          'Hit Target 1 (1R) → Move SL to Breakeven. Hit Target 2 (2R) → Lock 1R profit & trail remainder with 13 EMA. Hit Target 3 → Exit full at nearest major liquidity level (PDH/PDL/VAH/VAL).',
      };
    } else if (tradeType === 'EQUITY_INTRADAY') {
      const slPrice = Number((entryPrice * 0.99).toFixed(2)); // 1% SL
      const riskPerShare = entryPrice - slPrice;
      const tgt1 = Number((entryPrice + riskPerShare * 2).toFixed(2)); // 2% (1:2)
      const tgt2 = Number((entryPrice + riskPerShare * 3).toFixed(2)); // 3% (1:3)
      const maxQty = Math.floor(maxRiskAmount / (riskPerShare || 1));
      const totalPositionValue = maxQty * entryPrice;

      return {
        strategyName: 'Equity (Cash) Intraday Breakout',
        slPercent: '1.0%',
        slPrice,
        riskPerShare: Number(riskPerShare.toFixed(2)),
        tgt1,
        tgt2,
        rrRatio: '1:2 (T1) / 1:3 (T2)',
        maxQty,
        totalPositionValue,
        maxRiskAmount,
        expectedProfitT1: Number((maxQty * (tgt1 - entryPrice)).toFixed(2)),
        expectedProfitT2: Number((maxQty * (tgt2 - entryPrice)).toFixed(2)),
        exitRules:
          'Move Stop Loss to Entry price (Cost) immediately after Target 1 is reached. Book 50% profit at T1.',
      };
    } else if (tradeType === 'SWING') {
      const slPrice = Number((entryPrice * 0.96).toFixed(2)); // 4% SL
      const riskPerShare = entryPrice - slPrice;
      const tgt1 = Number((entryPrice * 1.10).toFixed(2)); // 10% TGT
      const tgt2 = Number((entryPrice * 1.15).toFixed(2)); // 15% TGT
      const maxQty = Math.floor(maxRiskAmount / (riskPerShare || 1));
      const totalPositionValue = maxQty * entryPrice;

      return {
        strategyName: 'Equity Swing Trading',
        slPercent: '4.0% (3-5% band)',
        slPrice,
        riskPerShare: Number(riskPerShare.toFixed(2)),
        tgt1,
        tgt2,
        rrRatio: '1:2.5 (T1) / 1:3.75 (T2)',
        maxQty,
        totalPositionValue,
        maxRiskAmount,
        expectedProfitT1: Number((maxQty * (tgt1 - entryPrice)).toFixed(2)),
        expectedProfitT2: Number((maxQty * (tgt2 - entryPrice)).toFixed(2)),
        exitRules:
          'Hold position multi-day. Move SL to breakeven after +6% gain. Exit full at 15% or trailing 20 EMA.',
      };
    } else if (tradeType === 'FUTURES_ATR') {
      const slPoints = atrPoints * 1; // 1 x ATR
      const slPrice = Number((entryPrice - slPoints).toFixed(2));
      const tgt1 = Number((entryPrice + atrPoints * 2).toFixed(2)); // 2 x ATR
      const tgt2 = Number((entryPrice + atrPoints * 3).toFixed(2)); // 3 x ATR
      const maxQty = Math.floor(maxRiskAmount / (slPoints || 1));
      const totalPositionValue = maxQty * entryPrice;

      return {
        strategyName: 'Futures Volatility (1x ATR SL / 2x ATR TGT)',
        slPercent: `${((slPoints / entryPrice) * 100).toFixed(2)}% (${slPoints} pts)`,
        slPrice,
        riskPerShare: Number(slPoints.toFixed(2)),
        tgt1,
        tgt2,
        rrRatio: '1:2 (T1) / 1:3 (T2)',
        maxQty,
        totalPositionValue,
        maxRiskAmount,
        expectedProfitT1: Number((maxQty * (tgt1 - entryPrice)).toFixed(2)),
        expectedProfitT2: Number((maxQty * (tgt2 - entryPrice)).toFixed(2)),
        exitRules:
          'Trail stop loss after 1 ATR profit gain. Lock 50% at 2x ATR. Trail remainder with 13 EMA.',
      };
    } else if (tradeType === 'OPTION_BUY') {
      // Option buying % band
      let slPct = 0.15; // 15%
      let tgt1Pct = 0.35; // 35%
      let tgt2Pct = 0.60; // 60%

      if (optionPremium <= 60) {
        slPct = 0.10;
        tgt1Pct = 0.30;
        tgt2Pct = 0.60;
      } else if (optionPremium <= 150) {
        slPct = 0.125;
        tgt1Pct = 0.30;
        tgt2Pct = 0.65;
      } else {
        slPct = 0.15;
        tgt1Pct = 0.30;
        tgt2Pct = 0.50;
      }

      const slPrice = Number((optionPremium * (1 - slPct)).toFixed(2));
      const riskPerContract = optionPremium - slPrice;
      const tgt1 = Number((optionPremium * (1 + tgt1Pct)).toFixed(2));
      const tgt2 = Number((optionPremium * (1 + tgt2Pct)).toFixed(2));
      const maxQty = Math.floor(maxRiskAmount / (riskPerContract || 1));
      const totalPositionValue = maxQty * optionPremium;

      return {
        strategyName: 'Options Buying Premium Risk Band',
        slPercent: `${(slPct * 100).toFixed(0)}%`,
        slPrice,
        riskPerShare: Number(riskPerContract.toFixed(2)),
        tgt1,
        tgt2,
        rrRatio: `1:${(tgt1Pct / slPct).toFixed(1)} (T1) / 1:${(tgt2Pct / slPct).toFixed(1)} (T2)`,
        maxQty,
        totalPositionValue,
        maxRiskAmount,
        expectedProfitT1: Number((maxQty * (tgt1 - optionPremium)).toFixed(2)),
        expectedProfitT2: Number((maxQty * (tgt2 - optionPremium)).toFixed(2)),
        exitRules:
          'Options decay fast! Book 50% at +30-35%. Trail stop loss to cost immediately. Exit if setup momentum stalls.',
      };
    } else {
      // OPTION_SELL
      const slPct = 0.15; // 15% SL
      const tgtPct = 0.35; // 35% decay profit target
      const slPrice = Number((optionPremium * (1 + slPct)).toFixed(2));
      const riskPerContract = slPrice - optionPremium;
      const tgt1 = Number((optionPremium * (1 - tgtPct)).toFixed(2));
      const tgt2 = Number((optionPremium * (1 - 0.50)).toFixed(2));
      const maxQty = Math.floor(maxRiskAmount / (riskPerContract || 1));
      const totalPositionValue = maxQty * optionPremium;

      return {
        strategyName: 'Options Selling Theta Decay & Delta Hedge',
        slPercent: '15.0%',
        slPrice,
        riskPerShare: Number(riskPerContract.toFixed(2)),
        tgt1,
        tgt2,
        rrRatio: '1:2.3 Decay Target',
        maxQty,
        totalPositionValue,
        maxRiskAmount,
        expectedProfitT1: Number((maxQty * (optionPremium - tgt1)).toFixed(2)),
        expectedProfitT2: Number((maxQty * (optionPremium - tgt2)).toFixed(2)),
        exitRules:
          'Exit immediately if IV spikes or price breaks technical support/resistance setup.',
      };
    }
  };

  const results = calculateStrategyResults();

  return (
    <div className="space-y-6">
      {/* Top Banner Header */}
      <div
        className={`p-6 rounded-2xl border font-mono transition-colors ${
          isDark
            ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-xl'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                Quantitative Risk Engine
              </span>
              <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                Cash & F&O Matrix
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black italic tracking-tight uppercase flex items-center gap-2.5">
              <ShieldAlert className="w-6 h-6 text-indigo-400" />
              <span>Target & Stop-Loss Strategy Matrix</span>
            </h2>
            <p className="text-xs font-mono opacity-70 mt-1 max-w-3xl">
              Professional volatility-based (ATR) risk sizing, percentage rules for Stock Intraday/Swing & F&O (Options Buying/Selling & Futures), and 1% account risk manager.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right font-mono">
              <span className="text-[10px] opacity-60 uppercase block font-bold">1% Rule Max Trade Risk</span>
              <span className="text-lg font-black text-emerald-400">
                ₹{((accountCapital * riskPercent) / 100).toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        </div>

        {/* 6-Point High Probability Strategy Rules Summary Bar */}
        <div className="mt-4 pt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px] font-mono">
          <div className={`p-2 rounded border flex items-center gap-2 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div>
              <span className="block font-bold">13 &gt; 21 &gt; 34 EMA</span>
              <span className="text-[9px] opacity-60">Trend Stack</span>
            </div>
          </div>

          <div className={`p-2 rounded border flex items-center gap-2 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div>
              <span className="block font-bold">Price &gt; VWAP</span>
              <span className="text-[9px] opacity-60">Intraday Bias</span>
            </div>
          </div>

          <div className={`p-2 rounded border flex items-center gap-2 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div>
              <span className="block font-bold">RSI(14) &gt; 60</span>
              <span className="text-[9px] opacity-60">Long Momentum</span>
            </div>
          </div>

          <div className={`p-2 rounded border flex items-center gap-2 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div>
              <span className="block font-bold">ADX &gt; 25</span>
              <span className="text-[9px] opacity-60">Trend Strength</span>
            </div>
          </div>

          <div className={`p-2 rounded border flex items-center gap-2 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <div>
              <span className="block font-bold">RVOL &gt; 1.5x</span>
              <span className="text-[9px] opacity-60">Volume Breakout</span>
            </div>
          </div>

          <div className={`p-2 rounded border flex items-center gap-2 ${isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <div>
              <span className="block font-bold">1x ATR SL / 2x ATR TGT</span>
              <span className="text-[9px] opacity-60">Dynamic Volatility</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Interactive Position Sizing Engine + Strategy Selector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 font-mono">
        {/* Left Column: Interactive Calculator Controls (5 Cols) */}
        <div
          className={`lg:col-span-5 p-6 rounded-2xl border transition-colors space-y-5 ${
            isDark
              ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-xl'
              : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <h3 className="text-sm font-black italic uppercase flex items-center gap-2">
              <Calculator className="w-4 h-4 text-emerald-400" />
              <span>Interactive Position Sizer</span>
            </h3>
            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
              Live Calculation
            </span>
          </div>

          {/* Strategy Mode Tabs */}
          <div>
            <label className="text-xs font-bold uppercase opacity-70 block mb-2">
              Select Asset / Trade Type:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800 text-[10px] font-bold">
              <button
                onClick={() => setTradeType('AUCTION_V2')}
                className={`px-2.5 py-2 rounded transition-all text-center ${
                  tradeType === 'AUCTION_V2'
                    ? 'bg-gradient-to-r from-amber-600 to-emerald-600 text-white shadow-md font-black'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                Auction V2 (AMT)
              </button>
              <button
                onClick={() => setTradeType('EQUITY_INTRADAY')}
                className={`px-2.5 py-2 rounded transition-all text-center ${
                  tradeType === 'EQUITY_INTRADAY'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                Equity Intraday
              </button>
              <button
                onClick={() => setTradeType('SWING')}
                className={`px-2.5 py-2 rounded transition-all text-center ${
                  tradeType === 'SWING'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                Swing Trading
              </button>
              <button
                onClick={() => setTradeType('FUTURES_ATR')}
                className={`px-2.5 py-2 rounded transition-all text-center ${
                  tradeType === 'FUTURES_ATR'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                Futures (ATR)
              </button>
              <button
                onClick={() => setTradeType('OPTION_BUY')}
                className={`px-2.5 py-2 rounded transition-all text-center ${
                  tradeType === 'OPTION_BUY'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                Option Buying
              </button>
              <button
                onClick={() => setTradeType('OPTION_SELL')}
                className={`px-2.5 py-2 rounded transition-all text-center ${
                  tradeType === 'OPTION_SELL'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                Option Selling
              </button>
            </div>
          </div>

          {/* Quick Scanned Stock Picker */}
          {stocks.length > 0 && (
            <div>
              <label className="text-xs font-bold uppercase opacity-70 block mb-1.5">
                Load Scanned Stock Price & ATR:
              </label>
              <select
                value={selectedStockSymbol}
                onChange={(e) => handleSelectScannedStock(e.target.value)}
                className={`w-full px-3 py-2 rounded-lg border font-bold text-xs focus:outline-none ${
                  isDark
                    ? 'bg-slate-950 border-slate-700 text-emerald-400'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              >
                <option value="">-- Choose Stock from Live Scan --</option>
                {stocks.map((s) => (
                  <option key={s.symbol} value={s.symbol}>
                    {s.symbol} (₹{s.price} | ATR: {s.indicators.atr?.toFixed(1) || 'N/A'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Account Capital Input */}
          <div>
            <div className="flex justify-between items-center mb-1.5 text-xs">
              <label className="font-bold uppercase opacity-70">Total Trading Capital (₹):</label>
              <span className="font-bold text-emerald-400">
                ₹{accountCapital.toLocaleString('en-IN')}
              </span>
            </div>
            <input
              type="number"
              step="10000"
              min="10000"
              value={accountCapital}
              onChange={(e) => setAccountCapital(Number(e.target.value))}
              className={`w-full px-3 py-2 rounded-lg border font-bold text-xs focus:outline-none ${
                isDark
                  ? 'bg-slate-950 border-slate-700 text-slate-100'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
            <div className="flex gap-2 mt-2">
              {[50000, 100000, 250000, 500000].map((cap) => (
                <button
                  key={cap}
                  type="button"
                  onClick={() => setAccountCapital(cap)}
                  className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${
                    accountCapital === cap
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-400'
                      : 'bg-slate-100 border-slate-300 text-slate-700'
                  }`}
                >
                  ₹{(cap / 1000).toFixed(0)}k
                </button>
              ))}
            </div>
          </div>

          {/* Risk Percent per Trade Input */}
          <div>
            <div className="flex justify-between items-center mb-1.5 text-xs">
              <label className="font-bold uppercase opacity-70">Max Risk % per Trade:</label>
              <span className="font-bold text-emerald-400">{riskPercent}%</span>
            </div>
            <input
              type="range"
              min="0.5"
              max="3.0"
              step="0.25"
              value={riskPercent}
              onChange={(e) => setRiskPercent(Number(e.target.value))}
              className="w-full accent-indigo-500 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] opacity-60 mt-1 font-bold">
              <span>0.5% (Conservative)</span>
              <span>1.0% (Professional Standard)</span>
              <span>2.0% (Max Limit)</span>
            </div>
          </div>

          {/* Entry Price or Option Premium */}
          {tradeType === 'OPTION_BUY' || tradeType === 'OPTION_SELL' ? (
            <div>
              <label className="text-xs font-bold uppercase opacity-70 block mb-1.5">
                Option Premium Price (₹):
              </label>
              <input
                type="number"
                step="5"
                min="1"
                value={optionPremium}
                onChange={(e) => setOptionPremium(Number(e.target.value))}
                className={`w-full px-3 py-2 rounded-lg border font-bold text-xs focus:outline-none ${
                  isDark
                    ? 'bg-slate-950 border-slate-700 text-amber-300'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
              <div className="flex gap-2 mt-2">
                {[50, 100, 200, 350].map((prem) => (
                  <button
                    key={prem}
                    type="button"
                    onClick={() => setOptionPremium(prem)}
                    className={`px-2 py-1 text-[10px] font-bold rounded border ${
                      optionPremium === prem
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : isDark
                        ? 'bg-slate-950 border-slate-800 text-slate-400'
                        : 'bg-slate-100 border-slate-300 text-slate-700'
                    }`}
                  >
                    ₹{prem} Premium
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs font-bold uppercase opacity-70 block mb-1.5">
                Stock / Future Entry Price (₹):
              </label>
              <input
                type="number"
                step="5"
                min="1"
                value={entryPrice}
                onChange={(e) => setEntryPrice(Number(e.target.value))}
                className={`w-full px-3 py-2 rounded-lg border font-bold text-xs focus:outline-none ${
                  isDark
                    ? 'bg-slate-950 border-slate-700 text-emerald-400'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </div>
          )}

          {/* ATR Points for Futures Mode */}
          {tradeType === 'FUTURES_ATR' && (
            <div>
              <label className="text-xs font-bold uppercase opacity-70 block mb-1.5">
                ATR (14) Volatility Points:
              </label>
              <input
                type="number"
                step="1"
                min="1"
                value={atrPoints}
                onChange={(e) => setAtrPoints(Number(e.target.value))}
                className={`w-full px-3 py-2 rounded-lg border font-bold text-xs focus:outline-none ${
                  isDark
                    ? 'bg-slate-950 border-slate-700 text-indigo-300'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
              <p className="text-[10px] opacity-60 mt-1">
                Stop Loss = 1 x ATR ({atrPoints} pts). Target = 2 x ATR ({atrPoints * 2} pts).
              </p>
            </div>
          )}
        </div>

        {/* Right Column: Dynamic Matrix Calculations & Output Results (7 Cols) */}
        <div
          className={`lg:col-span-7 p-6 rounded-2xl border transition-colors space-y-5 ${
            isDark
              ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-xl'
              : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div>
              <span className="text-[10px] font-bold uppercase text-indigo-400 tracking-wider">
                Strategy Calculation Output
              </span>
              <h3 className="text-base font-black italic uppercase flex items-center gap-2">
                <Award className="w-4 h-4 text-emerald-400" />
                <span>{results.strategyName}</span>
              </h3>
            </div>

            <div className="text-right">
              <span className="text-[10px] opacity-60 uppercase block font-bold">Risk Reward Ratio</span>
              <span className="text-xs font-black text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                {results.rrRatio}
              </span>
            </div>
          </div>

          {/* Key Output Metrics Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {/* Recommended Quantity */}
            <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <span className="text-[10px] opacity-60 uppercase block font-bold">Max Order Qty</span>
              <span className="text-lg font-black text-amber-400">
                {results.maxQty.toLocaleString('en-IN')} <span className="text-xs font-normal opacity-70">Qty</span>
              </span>
            </div>

            {/* Stop Loss Price */}
            <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <span className="text-[10px] opacity-60 uppercase block font-bold">Stop Loss ({results.slPercent})</span>
              <span className="text-lg font-black text-rose-400">
                ₹{results.slPrice}
              </span>
            </div>

            {/* Target 1 Price */}
            <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <span className="text-[10px] opacity-60 uppercase block font-bold">Target 1 (50% Profit)</span>
              <span className="text-lg font-black text-emerald-400">
                ₹{results.tgt1}
              </span>
            </div>

            {/* Target 2 Price */}
            <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <span className="text-[10px] opacity-60 uppercase block font-bold">Target 2 (100% Exit)</span>
              <span className="text-lg font-black text-emerald-300">
                ₹{results.tgt2}
              </span>
            </div>
          </div>

          {/* PnL Potential & Position Value */}
          <div className={`p-4 rounded-xl border font-mono space-y-2.5 ${isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800/60">
              <span className="opacity-70 font-bold uppercase">Max Allowed Capital Risk (1%):</span>
              <span className="font-bold text-rose-400">₹{results.maxRiskAmount.toLocaleString('en-IN')}</span>
            </div>

            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800/60">
              <span className="opacity-70 font-bold uppercase">Estimated Position Value:</span>
              <span className="font-bold text-slate-100">₹{results.totalPositionValue.toLocaleString('en-IN')}</span>
            </div>

            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800/60">
              <span className="opacity-70 font-bold uppercase">Expected Profit at Target 1:</span>
              <span className="font-bold text-emerald-400">+₹{results.expectedProfitT1.toLocaleString('en-IN')}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="opacity-70 font-bold uppercase">Expected Profit at Target 2:</span>
              <span className="font-bold text-emerald-300">+₹{results.expectedProfitT2.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* Mandatory Exit & Trailing Execution Rule */}
          <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
            <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold uppercase block mb-0.5">Execution Rule & Trailing Strategy:</span>
              <p className="opacity-90 leading-relaxed text-[11px]">{results.exitRules}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Comprehensive Professional Reference Matrix Table */}
      <div
        className={`p-6 rounded-2xl border font-mono transition-colors ${
          isDark
            ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-xl'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80">
          <div>
            <h3 className="text-base font-black italic uppercase flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-400" />
              <span>Professional Target & Stop-Loss Matrix Guide</span>
            </h3>
            <p className="text-xs opacity-60 mt-0.5">
              Standardized risk guidelines across Cash (Stocks), Futures & Options Trading
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className={`border-b text-[10px] uppercase font-bold tracking-wider ${isDark ? 'border-slate-800 text-slate-400 bg-slate-950/60' : 'border-slate-200 text-slate-500 bg-slate-50'}`}>
                <th className="py-3 px-4">Trade Category</th>
                <th className="py-3 px-4">Stop Loss Rule</th>
                <th className="py-3 px-4">Target Rule</th>
                <th className="py-3 px-4">Risk:Reward</th>
                <th className="py-3 px-4">Exit & Trailing Mechanism</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
              <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                <td className="py-3 px-4 font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  <span>Equity Intraday (Breakout)</span>
                </td>
                <td className="py-3 px-4 font-bold text-rose-400">1%</td>
                <td className="py-3 px-4 font-bold text-emerald-400">2% – 3%</td>
                <td className="py-3 px-4 font-bold">1:2 or 1:3</td>
                <td className="py-3 px-4 text-[11px] opacity-80">Book 50% at T1, move SL to Entry price</td>
              </tr>

              <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                <td className="py-3 px-4 font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                  <span>Equity Intraday (EMA + VWAP)</span>
                </td>
                <td className="py-3 px-4 font-bold text-rose-400">Below 20 EMA / VWAP</td>
                <td className="py-3 px-4 font-bold text-emerald-400">2x Risk Distance</td>
                <td className="py-3 px-4 font-bold">1:2</td>
                <td className="py-3 px-4 text-[11px] opacity-80">Trail along 20 EMA or VWAP line</td>
              </tr>

              <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                <td className="py-3 px-4 font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                  <span>Swing Trading</span>
                </td>
                <td className="py-3 px-4 font-bold text-rose-400">3% – 5%</td>
                <td className="py-3 px-4 font-bold text-emerald-400">8% – 15%</td>
                <td className="py-3 px-4 font-bold">1:3</td>
                <td className="py-3 px-4 text-[11px] opacity-80">Hold multi-day; trail with 20-day EMA</td>
              </tr>

              <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                <td className="py-3 px-4 font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                  <span>Futures (F&O)</span>
                </td>
                <td className="py-3 px-4 font-bold text-rose-400">1 x ATR (14)</td>
                <td className="py-3 px-4 font-bold text-emerald-400">2 x ATR (14)</td>
                <td className="py-3 px-4 font-bold">1:2</td>
                <td className="py-3 px-4 text-[11px] opacity-80">Trail stop loss after 1 ATR profit gain</td>
              </tr>

              <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                <td className="py-3 px-4 font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                  <span>Option Buying (₹50 Premium)</span>
                </td>
                <td className="py-3 px-4 font-bold text-rose-400">10% (₹45 SL)</td>
                <td className="py-3 px-4 font-bold text-emerald-400">30% – 60% (₹65–₹80)</td>
                <td className="py-3 px-4 font-bold">1:3 to 1:6</td>
                <td className="py-3 px-4 text-[11px] opacity-80">Fast momentum required; exit if theta stalls</td>
              </tr>

              <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                <td className="py-3 px-4 font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                  <span>Option Buying (₹100 Premium)</span>
                </td>
                <td className="py-3 px-4 font-bold text-rose-400">10% – 15% (₹90 SL)</td>
                <td className="py-3 px-4 font-bold text-emerald-400">30% – 65% (₹130 / ₹165)</td>
                <td className="py-3 px-4 font-bold">1:3 to 1:4.3</td>
                <td className="py-3 px-4 text-[11px] opacity-80">Book 50% at ₹130, trail rest to cost</td>
              </tr>

              <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                <td className="py-3 px-4 font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                  <span>Option Buying (₹200 Premium)</span>
                </td>
                <td className="py-3 px-4 font-bold text-rose-400">10% – 20% (₹160 SL)</td>
                <td className="py-3 px-4 font-bold text-emerald-400">30% – 50% (₹260–₹300)</td>
                <td className="py-3 px-4 font-bold">1:2.5 to 1:3</td>
                <td className="py-3 px-4 text-[11px] opacity-80">Move SL to cost after Target 1</td>
              </tr>

              <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                <td className="py-3 px-4 font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                  <span>Option Selling (Theta Decay)</span>
                </td>
                <td className="py-3 px-4 font-bold text-rose-400">10% – 15%</td>
                <td className="py-3 px-4 font-bold text-emerald-400">25% – 40%</td>
                <td className="py-3 px-4 font-bold">1:2.5</td>
                <td className="py-3 px-4 text-[11px] opacity-80">Exit instantly if IV spikes or support breaks</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
