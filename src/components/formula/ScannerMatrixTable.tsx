import React, { useState, useMemo } from 'react';
import {
  Search,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  ShieldAlert,
  Clock,
  Target,
  Sliders,
  TrendingUp,
  TrendingDown,
  Lock,
} from 'lucide-react';
import { GapRsStockData } from '../../utils/gapRelativeStrengthEngine';

interface ScannerMatrixTableProps {
  stocks: GapRsStockData[];
  selectedSymbol: string;
  onSelectStock: (symbol: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  scoreFilter: 'ALL' | '90_PLUS' | 'QUALIFIED_BUY' | 'QUALIFIED_SELL' | 'WATCHLIST';
  onScoreFilterChange: (f: any) => void;
  isDark: boolean;
}

export const ScannerMatrixTable: React.FC<ScannerMatrixTableProps> = ({
  stocks,
  selectedSymbol,
  onSelectStock,
  searchQuery,
  onSearchChange,
  scoreFilter,
  onScoreFilterChange,
  isDark,
}) => {
  const [sortBy, setSortBy] = useState<'SCORE' | 'RS' | 'RVOL' | 'CHANGE'>('SCORE');

  const filteredAndSorted = useMemo(() => {
    const list = stocks.filter((s) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches =
          s.symbol.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.sector.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (scoreFilter === '90_PLUS') return s.totalScore >= 90;
      if (scoreFilter === 'QUALIFIED_BUY') return s.isBuySetup;
      if (scoreFilter === 'QUALIFIED_SELL') return s.isSellSetup;
      if (scoreFilter === 'WATCHLIST') return s.totalScore >= 70 && s.totalScore < 80;
      return true;
    });

    return list.sort((a, b) => {
      if (sortBy === 'SCORE') return b.totalScore - a.totalScore;
      if (sortBy === 'RS') return b.relativeStrength - a.relativeStrength;
      if (sortBy === 'RVOL') return b.rvol - a.rvol;
      if (sortBy === 'CHANGE') return b.stockChangePercent - a.stockChangePercent;
      return 0;
    });
  }, [stocks, searchQuery, scoreFilter, sortBy]);

  return (
    <div
      className={`p-5 sm:p-6 rounded-3xl border shadow-xl transition-all ${
        isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      {/* Header Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-4 mb-4 border-b border-slate-800/60">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 text-xs font-mono font-bold flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>100-POINT UNIVERSE SCANNER MATRIX</span>
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black italic font-mono tracking-tight">
            NSE 200 Institutional Confluence Screener
          </h2>
        </div>

        {/* Search & Sort */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <input
              type="text"
              placeholder="Search ticker or sector..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500'
                  : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
              }`}
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
            <span className="text-[10px] text-slate-400 px-1.5 uppercase font-bold">Sort:</span>
            <button
              onClick={() => setSortBy('SCORE')}
              className={`px-2 py-1 rounded-lg font-bold transition-all ${
                sortBy === 'SCORE' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Score
            </button>
            <button
              onClick={() => setSortBy('RS')}
              className={`px-2 py-1 rounded-lg font-bold transition-all ${
                sortBy === 'RS' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              RS
            </button>
            <button
              onClick={() => setSortBy('RVOL')}
              className={`px-2 py-1 rounded-lg font-bold transition-all ${
                sortBy === 'RVOL' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              RVOL
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-3 mb-3 border-b border-slate-800/40 text-xs font-mono">
        <button
          onClick={() => onScoreFilterChange('ALL')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
            scoreFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
          }`}
        >
          ALL ({stocks.length})
        </button>
        <button
          onClick={() => onScoreFilterChange('90_PLUS')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
            scoreFilter === '90_PLUS' ? 'bg-emerald-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
          }`}
        >
          🔥 90+ PTS ({stocks.filter((s) => s.totalScore >= 90).length})
        </button>
        <button
          onClick={() => onScoreFilterChange('QUALIFIED_BUY')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
            scoreFilter === 'QUALIFIED_BUY' ? 'bg-emerald-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
          }`}
        >
          🟢 BUY SETUPS ({stocks.filter((s) => s.isBuySetup).length})
        </button>
        <button
          onClick={() => onScoreFilterChange('QUALIFIED_SELL')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
            scoreFilter === 'QUALIFIED_SELL' ? 'bg-rose-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
          }`}
        >
          🔴 SELL SETUPS ({stocks.filter((s) => s.isSellSetup).length})
        </button>
        <button
          onClick={() => onScoreFilterChange('WATCHLIST')}
          className={`px-3 py-1.5 rounded-xl font-bold transition-all shrink-0 ${
            scoreFilter === 'WATCHLIST' ? 'bg-amber-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
          }`}
        >
          🟡 WATCHLIST 70-79 ({stocks.filter((s) => s.totalScore >= 70 && s.totalScore < 80).length})
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950/60">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 text-[11px] uppercase tracking-wider">
              <th className="py-3 px-3">Rank / Symbol</th>
              <th className="py-3 px-3">Sector</th>
              <th className="py-3 px-3">Price &amp; % Change</th>
              <th className="py-3 px-3">100-Point Score</th>
              <th className="py-3 px-3">Vectors (V1-V7)</th>
              <th className="py-3 px-3">RS vs Sector</th>
              <th className="py-3 px-3">RVOL</th>
              <th className="py-3 px-3">Fixed Entry (₹)</th>
              <th className="py-3 px-3">Stop Loss (₹)</th>
              <th className="py-3 px-3">Target 1 (₹)</th>
              <th className="py-3 px-3">Trade Status</th>
              <th className="py-3 px-3 text-right">Cockpit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredAndSorted.map((stk, idx) => {
              const isSelected = stk.symbol === selectedSymbol;
              const isBull = stk.stockChangePercent >= 0;
              const isTargetHit = stk.tradeStatus.startsWith('CLOSED_TARGET');
              const isSLHit = stk.tradeStatus === 'CLOSED_STOP_LOSS';

              return (
                <tr
                  key={stk.symbol}
                  onClick={() => onSelectStock(stk.symbol)}
                  className={`hover:bg-slate-900/60 transition-colors cursor-pointer ${
                    isSelected ? 'bg-indigo-950/30' : ''
                  }`}
                >
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500 font-bold">#{idx + 1}</span>
                      <span className="font-black text-slate-100">{stk.symbol}</span>
                    </div>
                  </td>

                  <td className="py-3 px-3 text-slate-400">{stk.sector}</td>

                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-100">₹{stk.price.toFixed(2)}</div>
                    <div className={`text-[10px] ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {isBull ? '+' : ''}
                      {stk.stockChangePercent.toFixed(2)}%
                    </div>
                  </td>

                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-lg text-xs font-black ${
                        stk.totalScore >= 90
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : stk.totalScore >= 80
                          ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {stk.totalScore} PTS
                    </span>
                  </td>

                  <td className="py-3 px-3">
                    <div className="text-[10px] text-slate-400">
                      M:{stk.v1MarketRegimePts} | S:{stk.v2SectorStrengthPts} | P:{stk.v3StockPriceActionPts} | Mom:{stk.v4MomentumPts}
                    </div>
                  </td>

                  <td className="py-3 px-3 font-bold">
                    <span className={stk.relativeStrength >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {stk.relativeStrength >= 0 ? '+' : ''}
                      {stk.relativeStrength}%
                    </span>
                  </td>

                  <td className="py-3 px-3 text-cyan-400 font-bold">{stk.rvol.toFixed(2)}x</td>

                  <td className="py-3 px-3 text-blue-400 font-bold">
                    ₹{stk.fixedEntryPrice.toFixed(2)}
                  </td>

                  <td className="py-3 px-3 text-rose-400 font-bold">
                    ₹{stk.fixedStopLoss.toFixed(2)}
                  </td>

                  <td className="py-3 px-3 text-emerald-400 font-bold">
                    ₹{stk.fixedTarget1.toFixed(2)}
                  </td>

                  <td className="py-3 px-3">
                    {isTargetHit ? (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                        TARGET HIT
                      </span>
                    ) : isSLHit ? (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                        SL HIT
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40">
                        OPEN
                      </span>
                    )}
                  </td>

                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectStock(stk.symbol);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] transition-all"
                    >
                      Load TV
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
