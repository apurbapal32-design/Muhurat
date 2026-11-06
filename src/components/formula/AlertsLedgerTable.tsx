import React from 'react';
import {
  Activity,
  CheckCircle2,
  ShieldAlert,
  Clock,
  Target,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Lock,
  ExternalLink,
  Flame,
} from 'lucide-react';
import { GapRsStockData } from '../../utils/gapRelativeStrengthEngine';

interface AlertsLedgerTableProps {
  stocks: GapRsStockData[];
  ledgerFilter: 'ALL' | 'OPEN' | 'TARGET_HIT' | 'SL_HIT';
  onFilterChange: (filter: 'ALL' | 'OPEN' | 'TARGET_HIT' | 'SL_HIT') => void;
  onSelectStock: (symbol: string) => void;
  isDark: boolean;
}

export const AlertsLedgerTable: React.FC<AlertsLedgerTableProps> = ({
  stocks,
  ledgerFilter,
  onFilterChange,
  onSelectStock,
  isDark,
}) => {
  const filteredStocks = stocks.filter((s) => {
    if (ledgerFilter === 'OPEN') return !s.isClosed;
    if (ledgerFilter === 'TARGET_HIT') return s.tradeStatus.startsWith('CLOSED_TARGET');
    if (ledgerFilter === 'SL_HIT') return s.tradeStatus === 'CLOSED_STOP_LOSS';
    return true;
  });

  const totalCount = stocks.length;
  const openCount = stocks.filter((s) => !s.isClosed).length;
  const targetHitCount = stocks.filter((s) => s.tradeStatus.startsWith('CLOSED_TARGET')).length;
  const slHitCount = stocks.filter((s) => s.tradeStatus === 'CLOSED_STOP_LOSS').length;

  return (
    <div
      className={`p-5 sm:p-6 rounded-3xl border shadow-xl transition-all ${
        isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
      }`}
    >
      {/* Header & Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 mb-4 border-b border-slate-800/60">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 text-xs font-mono font-bold flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>LIVE ALERTS &amp; TRADE LIFECYCLE LEDGER</span>
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black italic font-mono tracking-tight">
            Fixed Alerts, Target Hits &amp; Stop Loss Realized History
          </h2>
          <p className="text-xs opacity-70 font-sans mt-0.5">
            Every alert locks entry price, target levels, and stop loss permanently at trigger timestamp. Realized P&amp;L and exit times update in real-time as market crosses levels.
          </p>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 text-xs font-mono shrink-0 overflow-x-auto">
          <button
            onClick={() => onFilterChange('ALL')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              ledgerFilter === 'ALL'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            ALL ({totalCount})
          </button>
          <button
            onClick={() => onFilterChange('OPEN')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 ${
              ledgerFilter === 'OPEN'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
            <span>OPEN ({openCount})</span>
          </button>
          <button
            onClick={() => onFilterChange('TARGET_HIT')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              ledgerFilter === 'TARGET_HIT'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            🎯 TARGET HIT ({targetHitCount})
          </button>
          <button
            onClick={() => onFilterChange('SL_HIT')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
              ledgerFilter === 'SL_HIT'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            🛑 SL HIT ({slHitCount})
          </button>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950/60">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 text-[11px] uppercase tracking-wider">
              <th className="py-3 px-3">Symbol / Sector</th>
              <th className="py-3 px-3">Signal</th>
              <th className="py-3 px-3">100-Pt Score</th>
              <th className="py-3 px-3">Alert / Entry Time</th>
              <th className="py-3 px-3">Fixed Entry (₹)</th>
              <th className="py-3 px-3">Stop Loss (₹)</th>
              <th className="py-3 px-3">Target 1 &amp; 2 (₹)</th>
              <th className="py-3 px-3">Exit Time</th>
              <th className="py-3 px-3">Exit Price (₹)</th>
              <th className="py-3 px-3">Realized P&amp;L</th>
              <th className="py-3 px-3">Trade Status</th>
              <th className="py-3 px-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredStocks.map((stk) => {
              const isBull = stk.stockChangePercent >= 0;
              const isTargetHit = stk.tradeStatus.startsWith('CLOSED_TARGET');
              const isSLHit = stk.tradeStatus === 'CLOSED_STOP_LOSS';
              const isOpen = !stk.isClosed;

              return (
                <tr
                  key={stk.symbol}
                  className="hover:bg-slate-900/60 transition-colors group cursor-pointer"
                  onClick={() => onSelectStock(stk.symbol)}
                >
                  {/* Symbol & Sector */}
                  <td className="py-3 px-3">
                    <div className="font-bold text-slate-100 flex items-center gap-1.5">
                      <span>{stk.symbol}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 font-sans">
                        {stk.sector}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 truncate max-w-[120px] font-sans">
                      {stk.name}
                    </div>
                  </td>

                  {/* Signal */}
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase inline-flex items-center gap-1 ${
                        isBull
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      }`}
                    >
                      {isBull ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      <span>{isBull ? 'BUY' : 'SELL'}</span>
                    </span>
                  </td>

                  {/* 100-Point Score */}
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

                  {/* Entry Time */}
                  <td className="py-3 px-3 text-slate-300">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-indigo-400" />
                      <span>{stk.entryTime}</span>
                    </div>
                  </td>

                  {/* Fixed Entry Price */}
                  <td className="py-3 px-3 font-bold text-blue-400">
                    ₹{stk.fixedEntryPrice.toFixed(2)}
                  </td>

                  {/* Stop Loss */}
                  <td className="py-3 px-3 text-rose-400 font-bold">
                    ₹{stk.fixedStopLoss.toFixed(2)}
                  </td>

                  {/* Targets */}
                  <td className="py-3 px-3 text-emerald-400">
                    <div>T1: ₹{stk.fixedTarget1.toFixed(1)}</div>
                    <div className="text-[10px] text-teal-400">T2: ₹{stk.fixedTarget2.toFixed(1)}</div>
                  </td>

                  {/* Exit Time */}
                  <td className="py-3 px-3">
                    {stk.exitTime ? (
                      <span className="text-slate-200 font-bold">{stk.exitTime}</span>
                    ) : (
                      <span className="text-slate-500 italic">In-Market</span>
                    )}
                  </td>

                  {/* Exit Price */}
                  <td className="py-3 px-3">
                    {stk.exitPrice ? (
                      <span className="font-bold text-slate-200">₹{stk.exitPrice.toFixed(2)}</span>
                    ) : (
                      <span className="text-slate-400">₹{stk.price.toFixed(2)}</span>
                    )}
                  </td>

                  {/* Realized P&L */}
                  <td className="py-3 px-3">
                    <div
                      className={`font-black ${
                        stk.realizedPoints >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {stk.realizedPoints >= 0 ? '+' : ''}
                      {stk.realizedPoints} pts
                    </div>
                    <div
                      className={`text-[10px] ${
                        stk.realizedPct >= 0 ? 'text-emerald-400/80' : 'text-rose-400/80'
                      }`}
                    >
                      ({stk.realizedPct >= 0 ? '+' : ''}
                      {stk.realizedPct}%)
                    </div>
                  </td>

                  {/* Trade Status Pill */}
                  <td className="py-3 px-3">
                    {isTargetHit ? (
                      <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>{stk.tradeStatus.replace('CLOSED_', '')} (CLOSED)</span>
                      </span>
                    ) : isSLHit ? (
                      <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40 inline-flex items-center gap-1">
                        <ShieldAlert className="w-3 h-3 text-rose-400" />
                        <span>SL HIT (CLOSED)</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-xl text-[10px] font-black uppercase bg-blue-500/20 text-blue-300 border border-blue-500/40 inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                        <span>OPEN</span>
                      </span>
                    )}
                  </td>

                  {/* Action */}
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectStock(stk.symbol);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] transition-all"
                    >
                      Chart &amp; TV
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
