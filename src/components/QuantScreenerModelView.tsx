import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  Plus,
  HelpCircle,
  Play,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Zap,
  Check,
  Search,
  ExternalLink,
  Target,
  SlidersHorizontal,
} from 'lucide-react';
import { ScannedStock } from '../types';
import { getStockListedAt, getStockEntryTime, getStockExitTime } from '../utils/timingHelpers';

interface QuantScreenerModelViewProps {
  stocks: ScannedStock[];
  onSelectStock: (stock: ScannedStock) => void;
  onExecuteTrade?: (stock: ScannedStock, signal: 'BUY' | 'SELL') => void;
  theme?: string;
}

type ModelTab = 'QUANT_ELITE' | 'STRONG_INTRADAY' | 'SONIC_PULSE' | 'TITAN_FLOW' | 'QUANT_ELITE_PRO';

export const QuantScreenerModelView: React.FC<QuantScreenerModelViewProps> = ({
  stocks,
  onSelectStock,
  onExecuteTrade,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';
  const [activeModel, setActiveModel] = useState<ModelTab>('QUANT_ELITE');
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [selectedSector, setSelectedSector] = useState<string>('ALL');

  const toggleWatchlist = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setWatchlist((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        next.add(symbol);
      }
      return next;
    });
  };

  // Filter stocks based on active model strategy parameters
  const { bullishStocks, bearishStocks } = useMemo(() => {
    let filtered = stocks.filter((s) => {
      const matchesSearch =
        searchQuery === '' ||
        s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.sector.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesSector = selectedSector === 'ALL' || s.sector === selectedSector;
      return matchesSearch && matchesSector;
    });

    // Model specific filtering
    if (activeModel === 'QUANT_ELITE') {
      // 80+ AI score, confirmed confluence, strong RVOL
      const bulls = filtered
        .filter((s) => s.signal === 'BUY' && s.aiScore >= 75)
        .sort((a, b) => b.aiScore - a.aiScore);

      const bears = filtered
        .filter((s) => s.signal === 'SELL' && s.aiScore >= 70)
        .sort((a, b) => b.aiScore - a.aiScore);

      return { bullishStocks: bulls, bearishStocks: bears };
    } else if (activeModel === 'STRONG_INTRADAY') {
      // High RVOL (>1.8x) & Momentum breakout
      const bulls = filtered
        .filter((s) => s.signal === 'BUY' && s.indicators.rvol >= 1.5 && s.changePercent > 0.8)
        .sort((a, b) => b.indicators.rvol - a.indicators.rvol);

      const bears = filtered
        .filter((s) => s.signal === 'SELL' && s.indicators.rvol >= 1.5 && s.changePercent < -0.8)
        .sort((a, b) => b.indicators.rvol - a.indicators.rvol);

      return { bullishStocks: bulls, bearishStocks: bears };
    } else if (activeModel === 'SONIC_PULSE') {
      // Rapid RSI momentum & EMA crossovers
      const bulls = filtered
        .filter((s) => s.signal === 'BUY' && s.indicators.rsi >= 60)
        .sort((a, b) => b.indicators.rsi - a.indicators.rsi);

      const bears = filtered
        .filter((s) => s.signal === 'SELL' && s.indicators.rsi <= 40)
        .sort((a, b) => a.indicators.rsi - b.indicators.rsi);

      return { bullishStocks: bulls, bearishStocks: bears };
    } else if (activeModel === 'TITAN_FLOW') {
      // Heavy Order Flow Delta, Put Writing & Institutional Buildup
      const bulls = filtered
        .filter((s) => s.signal === 'BUY' && s.volume > 200000)
        .sort((a, b) => b.volume - a.volume);

      const bears = filtered
        .filter((s) => s.signal === 'SELL' && s.volume > 200000)
        .sort((a, b) => b.volume - a.volume);

      return { bullishStocks: bulls, bearishStocks: bears };
    } else {
      // QUANT_ELITE_PRO: 85+ score + VWAP confirmed
      const bulls = filtered
        .filter((s) => s.signal === 'BUY' && s.aiScore >= 80 && s.price >= s.indicators.vwap)
        .sort((a, b) => b.aiScore - a.aiScore);

      const bears = filtered
        .filter((s) => s.signal === 'SELL' && s.aiScore >= 80 && s.price < s.indicators.vwap)
        .sort((a, b) => b.aiScore - a.aiScore);

      return { bullishStocks: bulls, bearishStocks: bears };
    }
  }, [stocks, activeModel, searchQuery, selectedSector]);

  const sectors = useMemo(() => {
    const set = new Set<string>();
    stocks.forEach((s) => set.add(s.sector));
    return Array.from(set).sort();
  }, [stocks]);

  const renderStockTable = (
    list: ScannedStock[],
    isBullish: boolean,
    title: string,
    modelName: string
  ) => {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between pb-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-black tracking-wide uppercase font-mono text-slate-200">
              {modelName}
            </h3>
            <span
              className={`px-2 py-0.5 rounded text-xs font-black uppercase flex items-center gap-1 ${
                isBullish
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
              }`}
            >
              {isBullish ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              <span>{isBullish ? 'BULLISH ↗' : 'BEARISH ↘'}</span>
            </span>
            <div className="group relative">
              <HelpCircle className="w-3.5 h-3.5 text-slate-500 cursor-pointer hover:text-slate-300" />
              <div className="absolute left-0 bottom-full mb-1.5 hidden group-hover:block z-30 w-64 p-2 text-[10px] font-mono bg-slate-900 border border-slate-700 rounded-lg shadow-xl text-slate-300">
                Stocks qualified through {modelName} algorithmic criteria. Updated dynamically across the trading session.
              </div>
            </div>
            <span className="text-xs text-slate-400 font-mono">({list.length} qualified)</span>
          </div>
        </div>

        {list.length === 0 ? (
          <div className="py-8 px-4 rounded-xl border border-slate-800/80 bg-slate-950/60 text-center">
            <p className="text-xs text-slate-400 font-mono">
              No stocks are on this board right now. Names are added through the session as they qualify, and removed when they stop qualifying.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-950/70 shadow-lg custom-scrollbar">
            <table className="w-full text-left font-mono text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/90 text-[10px] uppercase text-slate-400 font-bold tracking-wider">
                  <th className="py-2.5 px-3 text-center w-12">ADD</th>
                  <th className="py-2.5 px-3">SYMBOL</th>
                  <th className="py-2.5 px-3">SECTOR</th>
                  <th className="py-2.5 px-3 text-center text-amber-400 font-black" title="Time stock was added to the screener board">
                    <div className="flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3 text-amber-400" />
                      <span>LISTED AT</span>
                    </div>
                  </th>
                  <th className="py-2.5 px-3 text-center text-indigo-400 font-black" title="Signal Trigger Entry Time">
                    <span>ENTRY TIME</span>
                  </th>
                  <th className="py-2.5 px-3 text-center text-purple-400 font-black" title="Target / SL / Projected Exit Time">
                    <span>EXIT TIME</span>
                  </th>
                  <th className="py-2.5 px-3 text-right">MARKET PRICE</th>
                  <th className="py-2.5 px-3 text-right">% CHANGE</th>
                  <th className="py-2.5 px-3 text-center text-emerald-400 font-bold">SIGNAL</th>
                  <th className="py-2.5 px-3 text-right">TARGET / SL</th>
                  <th className="py-2.5 px-3 text-center">RVOL</th>
                  <th className="py-2.5 px-3 text-center">SCORE</th>
                  <th className="py-2.5 px-3 text-center">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {list.map((stock) => {
                  const isUp = stock.changePercent >= 0;
                  const inWatch = watchlist.has(stock.symbol);
                  const listedAt = getStockListedAt(stock);
                  const entryTime = getStockEntryTime(stock);
                  const exitTimeInfo = getStockExitTime(stock);

                  return (
                    <tr
                      key={stock.symbol}
                      onClick={() => onSelectStock(stock)}
                      className="hover:bg-slate-800/60 cursor-pointer transition-colors group"
                    >
                      {/* Add to Watchlist */}
                      <td className="py-2 px-3 text-center" onClick={(e) => toggleWatchlist(stock.symbol, e)}>
                        <button
                          className={`w-6 h-6 rounded flex items-center justify-center border transition-all ${
                            inWatch
                              ? 'bg-amber-500 text-slate-950 border-amber-400'
                              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-white hover:border-slate-500'
                          }`}
                          title={inWatch ? 'Remove from Watchlist' : 'Add to Watchlist'}
                        >
                          {inWatch ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                        </button>
                      </td>

                      {/* Symbol */}
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-black text-sm text-slate-100 group-hover:text-indigo-400 transition-colors">
                            {stock.symbol}
                          </span>
                          <a
                            href={`https://in.tradingview.com/chart/?symbol=NSE:${stock.symbol.replace('&', '_')}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-400 hover:text-blue-300"
                            title="Open TradingView Chart ↗"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </td>

                      {/* Sector */}
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-900 border border-slate-700/80 text-slate-300">
                            {stock.sector}
                          </span>
                          <span
                            className={`text-[10px] font-bold ${
                              isUp ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {isUp ? '+' : ''}{stock.changePercent.toFixed(2)}%
                          </span>
                        </div>
                      </td>

                      {/* LISTED AT TIME (e.g. 09:55, 10:00 as seen in quantscreener.in) */}
                      <td className="py-2 px-3 text-center">
                        <span className="px-2 py-0.5 rounded font-mono font-black text-xs bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          {listedAt}
                        </span>
                      </td>

                      {/* ENTRY TIME */}
                      <td className="py-2 px-3 text-center">
                        <span className="px-2 py-0.5 rounded font-mono font-bold text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                          {entryTime}
                        </span>
                      </td>

                      {/* EXIT TIME */}
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] border ${
                            exitTimeInfo.isClosed
                              ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                              : 'bg-slate-900 text-slate-400 border-slate-800'
                          }`}
                          title={exitTimeInfo.statusLabel}
                        >
                          {exitTimeInfo.timeStr}
                        </span>
                      </td>

                      {/* Market Price */}
                      <td className="py-2 px-3 text-right font-black text-slate-100 text-sm">
                        ₹{stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </td>

                      {/* % Change */}
                      <td
                        className={`py-2 px-3 text-right font-black text-xs ${
                          isUp ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {isUp ? '+' : ''}{stock.changePercent.toFixed(2)}%
                      </td>

                      {/* Signal (BUY / SELL) */}
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase border ${
                            stock.signal === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                              : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                          }`}
                        >
                          {stock.signal === 'BUY' ? '🟢 BUY' : '🔴 SELL'}
                        </span>
                      </td>

                      {/* Target / SL */}
                      <td className="py-2 px-3 text-right font-mono text-[11px]">
                        <div className="text-emerald-400 font-bold">
                          T1: ₹{stock.risk?.target1 || (stock.price * (stock.signal === 'BUY' ? 1.02 : 0.98)).toFixed(1)}
                        </div>
                        <div className="text-rose-400 text-[10px]">
                          SL: ₹{stock.risk?.stopLoss || (stock.price * (stock.signal === 'BUY' ? 0.985 : 1.015)).toFixed(1)}
                        </div>
                      </td>

                      {/* RVOL */}
                      <td className="py-2 px-3 text-center font-bold text-slate-300">
                        {stock.indicators.rvol.toFixed(1)}x
                      </td>

                      {/* AI Score */}
                      <td className="py-2 px-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            stock.aiScore >= 80
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : 'bg-indigo-500/20 text-indigo-300'
                          }`}
                        >
                          {stock.aiScore}%
                        </span>
                      </td>

                      {/* Execute Trade */}
                      <td className="py-2 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onExecuteTrade?.(stock, stock.signal === 'SELL' ? 'SELL' : 'BUY')}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase transition-all flex items-center justify-center gap-1 mx-auto cursor-pointer ${
                            stock.signal === 'BUY'
                              ? 'bg-emerald-600 hover:bg-emerald-500 text-slate-950 shadow-md shadow-emerald-600/30'
                              : 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30'
                          }`}
                        >
                          <Play className="w-2.5 h-2.5 fill-current" />
                          <span>{stock.signal === 'BUY' ? 'BUY' : 'SELL'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header Navigation matching quantscreener.in screenshot */}
      <div
        className={`p-4 rounded-2xl border shadow-xl relative overflow-hidden transition-all ${
          isDark
            ? 'bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-950/60 border-slate-800 text-slate-100'
            : 'bg-gradient-to-r from-white via-indigo-50/50 to-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                LIVE QUANT SCREENER BOARD
              </span>
              <span className="text-xs text-slate-500 font-mono">• Both Signals (Bullish &amp; Bearish)</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black font-mono tracking-tight flex items-center gap-2">
              <Zap className="w-6 h-6 text-amber-400" />
              <span>Quant Screener Institutional Models</span>
            </h1>
            <p className="text-xs opacity-75 max-w-2xl font-mono">
              Real-time stock board inspired by QuantScreener. Every strategy displays exact Stock Listed Time, Entry Time, Target/Stop Loss, Exit Time, and Both Buy/Sale signals.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setShowVideoModal(true)}
              className="px-3 py-1.5 rounded-xl border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-xs font-mono font-bold flex items-center gap-1.5 transition-all"
            >
              <Play className="w-3.5 h-3.5 fill-current text-rose-400" />
              <span>Watch intro 0:48</span>
            </button>
          </div>
        </div>

        {/* Strategy Model Tabs matching screenshot */}
        <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-800 overflow-x-auto custom-scrollbar">
          {[
            { id: 'QUANT_ELITE', label: 'Quant Elite', badge: 'POPULAR' },
            { id: 'STRONG_INTRADAY', label: 'Strong Intraday', badge: 'RVOL' },
            { id: 'SONIC_PULSE', label: 'Sonic Pulse', badge: 'MOMENTUM' },
            { id: 'TITAN_FLOW', label: 'Titan Flow', badge: 'ORDER FLOW' },
            { id: 'QUANT_ELITE_PRO', label: 'Quant Elite Pro', badge: 'PRO' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveModel(tab.id as ModelTab)}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-black uppercase transition-all flex items-center gap-2 shrink-0 border ${
                activeModel === tab.id
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/30 ring-2 ring-amber-400/30'
                  : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded text-[9px] ${
                  activeModel === tab.id
                    ? 'bg-slate-950 text-amber-300 font-extrabold'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {tab.badge}
              </span>
            </button>
          ))}
        </div>

        {/* Filter bar: Search & Sector */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-800/60 font-mono text-xs">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search ticker (e.g. SWIGGY, MAXHEALTH, SRF, KEI)..."
              className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-200 focus:outline-none focus:border-amber-500 text-xs"
            />
          </div>

          <div className="flex items-center gap-2">
            <span className="text-slate-400">Sector:</span>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-700 bg-slate-950 text-slate-200 text-xs font-mono"
            >
              <option value="ALL">All Sectors ({stocks.length})</option>
              {sectors.map((sec) => (
                <option key={sec} value={sec}>
                  {sec}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Model Tables: Both Bullish and Bearish as per quantscreener.in format */}
      <div className="space-y-8">
        {/* Bullish Board */}
        {renderStockTable(
          bullishStocks,
          true,
          'Bullish Setups',
          `${activeModel.replace('_', ' ')} Model`
        )}

        {/* Bearish Board */}
        {renderStockTable(
          bearishStocks,
          false,
          'Bearish Setups',
          `${activeModel.replace('_', ' ')} Model`
        )}
      </div>

      {/* Intro explanation video modal */}
      {showVideoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-lg w-full space-y-4 font-mono shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 font-black text-amber-400">
                <Play className="w-4 h-4 fill-current" />
                <span>Quant Screener Architecture Intro</span>
              </div>
              <button
                onClick={() => setShowVideoModal(false)}
                className="text-slate-400 hover:text-white text-xs font-bold px-2 py-1 rounded bg-slate-800"
              >
                ✕ Close
              </button>
            </div>
            <div className="text-xs space-y-2 text-slate-300">
              <p>
                <strong>Quant Screener Board Rules:</strong>
              </p>
              <ul className="list-disc pl-5 space-y-1 text-slate-400 text-[11px]">
                <li>
                  <span className="text-amber-300 font-bold">Listed At:</span> Precise time the stock passed multi-factor algorithmic confirmation.
                </li>
                <li>
                  <span className="text-indigo-300 font-bold">Entry Time:</span> Optimal execution window timing based on VWAP retest and momentum.
                </li>
                <li>
                  <span className="text-purple-300 font-bold">Exit Time:</span> Realized target hit timestamp or projected session close trailing SL.
                </li>
                <li>
                  <span className="text-emerald-400 font-bold">Both Signals:</span> Independent Bullish (Buy) and Bearish (Sell) tables update continuously during market hours.
                </li>
              </ul>
            </div>
            <button
              onClick={() => setShowVideoModal(false)}
              className="w-full py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs uppercase"
            >
              Got it, let&apos;s trade
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
