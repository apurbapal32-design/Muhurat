import React, { useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Shield,
  Sparkles,
  Target,
  Zap,
} from 'lucide-react';
import { AppTheme, ScannedStock } from '../types';
import { getSectorPerformanceMap } from '../utils/sectorAndOiHelpers';

interface TopPickCardsProps {
  topBuy: ScannedStock[];
  topSell: ScannedStock[];
  onSelectStock: (stock: ScannedStock) => void;
  theme?: AppTheme | 'dark' | 'light';
}

export const TopPickCards: React.FC<TopPickCardsProps> = ({
  topBuy,
  topSell,
  onSelectStock,
  theme = 'dark',
}) => {
  const [activeTab, setActiveTab] = useState<'BUY' | 'SELL'>('BUY');
  const isDark = theme !== 'light';

  const allStocks = React.useMemo(() => [...topBuy, ...topSell], [topBuy, topSell]);
  const sectorMap = React.useMemo(() => getSectorPerformanceMap(allStocks), [allStocks]);

  const currentList = activeTab === 'BUY' ? topBuy : topSell;

  return (
    <div
      className={`p-6 rounded-2xl border mb-8 transition-colors ${
        isDark
          ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-xl shadow-black/20'
          : 'bg-white border-slate-200/90 text-slate-900 shadow-sm'
      }`}
    >
      {/* Header with Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-800/40">
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl border ${
              isDark
                ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                : 'bg-indigo-50 border-indigo-200 text-indigo-600'
            }`}
          >
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black italic tracking-tight uppercase">
              Top 10 Quantitative Opportunities
            </h2>
            <p className="text-xs font-mono opacity-60">
              Multi-indicator AI confluence score (0–100)
            </p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div
          className={`flex items-center p-1 rounded-xl border text-xs font-mono font-bold uppercase ${
            isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}
        >
          <button
            onClick={() => setActiveTab('BUY')}
            className={`px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'BUY'
                ? isDark
                  ? 'bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20'
                  : 'bg-emerald-600 text-white shadow-sm'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>Top 10 BUY ({topBuy.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('SELL')}
            className={`px-4 py-2 rounded-lg transition-all flex items-center gap-1.5 ${
              activeTab === 'SELL'
                ? isDark
                  ? 'bg-rose-500 text-white shadow-md shadow-rose-500/20'
                  : 'bg-rose-600 text-white shadow-sm'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <ArrowDownRight className="w-3.5 h-3.5" />
            <span>Top 10 SELL ({topSell.length})</span>
          </button>
        </div>
      </div>

      {/* Cards Grid */}
      {currentList.length === 0 ? (
        <div className="text-center py-12 font-mono text-xs opacity-60">
          No high-probability {activeTab} signals detected in current scan window.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5">
          {currentList.slice(0, 10).map((stock, idx) => {
            const isBuy = stock.signal === 'BUY';
            return (
              <div
                key={stock.symbol}
                onClick={() => onSelectStock(stock)}
                className={`p-4 rounded-xl border cursor-pointer transition-all relative flex flex-col justify-between group ${
                  isDark
                    ? 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-950 shadow-md'
                    : 'bg-slate-50 border-slate-200/90 hover:border-slate-300 hover:bg-white shadow-2xs'
                }`}
              >
                {/* Rank Badge */}
                <div
                  className={`absolute top-3 right-3 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                    isDark
                      ? 'bg-slate-900 border-slate-800 text-slate-300'
                      : 'bg-white border-slate-300 text-slate-700'
                  }`}
                >
                  #{idx + 1}
                </div>

                {/* Stock Title & Price */}
                <div className="mb-3 pr-8">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black italic tracking-tight">
                      {stock.symbol}
                    </span>
                    <span
                      className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                        isBuy
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {stock.signal}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <span className="text-[10px] font-mono font-bold opacity-70 uppercase">
                      {stock.sector}
                    </span>
                    {sectorMap.has(stock.sector) && (() => {
                      const sec = sectorMap.get(stock.sector)!;
                      const isSecPos = sec.avgChangePercent >= 0;
                      return (
                        <span
                          className={`px-1.5 py-0.2 rounded text-[8px] font-mono font-bold border ${
                            isSecPos
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {isSecPos ? 'SECTOR (+)' : 'SECTOR (-)'} {isSecPos ? '+' : ''}{sec.avgChangePercent}%
                        </span>
                      );
                    })()}
                  </div>
                </div>

                {/* Price & Change */}
                <div
                  className={`flex items-baseline justify-between mb-3 p-2.5 rounded-lg border font-mono ${
                    isDark
                      ? 'bg-slate-900/90 border-slate-800'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <span className="text-sm font-bold">
                    ₹{stock.price.toLocaleString('en-IN')}
                  </span>
                  <span
                    className={`text-xs font-bold ${
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
                  </span>
                </div>

                {/* AI Score */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs font-mono mb-1">
                    <span className="text-[10px] opacity-60 uppercase font-bold">
                      AI CONFIDENCE
                    </span>
                    <span
                      className={`font-bold ${
                        isBuy
                          ? isDark
                            ? 'text-emerald-400'
                            : 'text-emerald-600'
                          : isDark
                          ? 'text-rose-400'
                          : 'text-rose-600'
                      }`}
                    >
                      {stock.aiScore}
                    </span>
                  </div>
                  <div
                    className={`w-full h-2 rounded-full overflow-hidden border ${
                      isDark
                        ? 'bg-slate-900 border-slate-800'
                        : 'bg-slate-200 border-slate-300'
                    }`}
                  >
                    <div
                      className={`h-full transition-all ${
                        isBuy ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${stock.aiScore}%` }}
                    ></div>
                  </div>
                </div>

                {/* Risk Management Details */}
                <div
                  className={`grid grid-cols-2 gap-2 text-[10px] font-mono p-2 rounded-lg border mb-3 ${
                    isDark
                      ? 'bg-slate-900/80 border-slate-800'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div>
                    <span className="opacity-50 block uppercase">STOP LOSS</span>
                    <span className="text-rose-400 font-bold">₹{stock.risk.stopLoss}</span>
                  </div>
                  <div>
                    <span className="opacity-50 block uppercase">TARGET 1</span>
                    <span className="text-emerald-400 font-bold">
                      ₹{stock.risk.target1}
                    </span>
                  </div>
                </div>

                {/* Triggers Tags */}
                <div className="space-y-1 mb-3">
                  {stock.keyTriggers.slice(0, 2).map((trig, i) => (
                    <div
                      key={i}
                      className={`text-[9px] font-mono px-2 py-1 rounded border flex items-center gap-1.5 truncate ${
                        isDark
                          ? 'bg-slate-900/60 border-slate-800 text-slate-300'
                          : 'bg-white border-slate-200 text-slate-700'
                      }`}
                    >
                      <CheckCircle2
                        className={`w-2.5 h-2.5 shrink-0 ${
                          isBuy ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      />
                      <span className="truncate">{trig}</span>
                    </div>
                  ))}
                </div>

                {/* Bottom inspect link */}
                <div className="pt-2 border-t border-slate-800/40 flex items-center justify-between text-[10px] font-mono font-bold">
                  <span className="opacity-70">RVOL: {stock.indicators.rvol}x</span>
                  <span className="text-indigo-400 group-hover:text-indigo-300 flex items-center gap-1 font-bold">
                    <span>📈 Chart</span>
                    <ChevronRight className="w-3.5 h-3.5 transform group-hover:translate-x-1 transition" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

