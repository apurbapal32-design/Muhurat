import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from 'lucide-react';
import {
  AgentCardViewModel,
  computeAgentSessionPerformance,
  formatInrSigned,
  PerformanceTableSortKey,
  sortAgentSessionPerformanceRows,
} from '../utils/agentManagement';

interface AgentPerformanceSummaryTableProps {
  viewModels: AgentCardViewModel[];
  selectedScannerId: string;
  onSelectAgent: (scannerId: string) => void;
  isLight: boolean;
  loading: boolean;
  isFlushCleared: boolean;
}

export const AgentPerformanceSummaryTable: React.FC<AgentPerformanceSummaryTableProps> = ({
  viewModels,
  selectedScannerId,
  onSelectAgent,
  isLight,
  loading,
  isFlushCleared,
}) => {
  const [sortKey, setSortKey] = useState<PerformanceTableSortKey>('realizedPnlRs');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const { rows, totals } = useMemo(
    () => computeAgentSessionPerformance(viewModels),
    [viewModels]
  );

  const sortedRows = useMemo(
    () => sortAgentSessionPerformanceRows(rows, sortKey, sortDirection),
    [rows, sortKey, sortDirection]
  );

  const handleSort = (key: PerformanceTableSortKey) => {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDirection(key === 'rank' ? 'asc' : 'desc');
    }
  };

  const cardCls = isLight
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-[#0F172A] border-slate-800 text-slate-100';
  const mutedText = isLight ? 'text-slate-500' : 'text-slate-400';
  const dividerCls = isLight ? 'border-slate-200' : 'border-slate-800';
  const theadCls = isLight
    ? 'bg-slate-50/95 text-slate-600 border-b border-slate-200'
    : 'bg-[#0B1120]/95 text-slate-400 border-b border-slate-800';
  const tfootCls = isLight
    ? 'bg-slate-50/95 text-slate-900 border-t border-slate-300'
    : 'bg-[#0B1120]/95 text-slate-100 border-t border-slate-700';

  const renderSortIcon = (key: PerformanceTableSortKey) => {
    if (sortKey !== key) {
      return <ArrowUpDown className="w-3 h-3 opacity-45 shrink-0" aria-hidden="true" />;
    }
    return sortDirection === 'desc' ? (
      <ArrowDown
        className={`w-3 h-3 shrink-0 ${isLight ? 'text-sky-600' : 'text-sky-400'}`}
        aria-hidden="true"
      />
    ) : (
      <ArrowUp
        className={`w-3 h-3 shrink-0 ${isLight ? 'text-sky-600' : 'text-sky-400'}`}
        aria-hidden="true"
      />
    );
  };

  const pnlTextCls = (val: number) => {
    if (val > 0) return isLight ? 'text-emerald-700' : 'text-emerald-400';
    if (val < 0) return isLight ? 'text-rose-700' : 'text-rose-400';
    return mutedText;
  };

  return (
    <section
      data-testid="agent-performance-summary-table"
      aria-label="AI Agents Session Performance Summary"
      className={`rounded-xl border overflow-hidden ${cardCls}`}
    >
      {/* Header Strip */}
      <div
        className={`px-5 py-4 border-b flex flex-col lg:flex-row lg:items-center justify-between gap-3 ${dividerCls}`}
      >
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-base font-semibold tracking-tight">
              Session Performance Summary
            </h2>
            <span className={`text-xs font-mono tabular-nums ${mutedText}`}>
              ({loading ? '20' : rows.length} Agents)
            </span>
          </div>
          <p className={`text-xs mt-0.5 ${mutedText}`}>
            Current trading session Win/Loss ratio and total profit realized (T2 exits, 50% T1
            partial bookings, and closed SL/time exits). Click any column header to sort or select
            an agent row to inspect its Stop-Loss Ladder.
          </p>
        </div>

        <div className="flex items-center gap-5 shrink-0 text-xs">
          <div>
            <div className={`text-[11px] ${mutedText}`}>Fleet Win/Loss Ratio</div>
            <div className="font-mono tabular-nums text-sm font-semibold mt-0.5">
              {loading ? '—' : totals.winLossRatioLabel}
              {!loading && totals.totalTrades > 0 && (
                <span className={`ml-1.5 text-[11px] font-normal ${mutedText}`}>
                  ({totals.wins}W / {totals.losses}L · {totals.winRatePct.toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
          <div className={`w-px h-7 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} aria-hidden="true" />
          <div>
            <div className={`text-[11px] ${mutedText}`}>Total Profit Realized</div>
            <div
              className={`font-mono tabular-nums text-sm font-semibold mt-0.5 ${pnlTextCls(
                totals.realizedPnlRs
              )}`}
            >
              {loading ? '—' : formatInrSigned(totals.realizedPnlRs)}
            </div>
          </div>
        </div>
      </div>

      {/* Table Body */}
      {loading ? (
        <div className="p-6 space-y-2.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className={`h-9 rounded animate-pulse ${
                isLight ? 'bg-slate-100' : 'bg-slate-800/60'
              }`}
            />
          ))}
        </div>
      ) : sortedRows.length === 0 ? (
        <div className={`px-6 py-10 text-center text-xs ${mutedText}`}>
          {isFlushCleared
            ? 'All 20 AI agent session ledgers were cleared by the 23:59 IST auto-flush.'
            : 'No AI agents match the current filter criteria.'}
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[396px] overflow-y-auto custom-scrollbar">
          <table className="w-full text-left border-collapse">
            <thead className={`sticky top-0 z-10 backdrop-blur-sm ${theadCls}`}>
              <tr className="text-[11px] font-display font-semibold tracking-wide">
                <th
                  scope="col"
                  aria-sort={
                    sortKey === 'rank'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className="py-2.5 pl-5 pr-3 whitespace-nowrap"
                >
                  <button
                    type="button"
                    onClick={() => handleSort('rank')}
                    className="inline-flex items-center gap-1.5 hover:text-sky-400 transition-colors cursor-pointer"
                  >
                    <span>AI Agent</span>
                    {renderSortIcon('rank')}
                  </button>
                </th>
                <th scope="col" className="py-2.5 px-3 whitespace-nowrap">
                  Assigned Scanner
                </th>
                <th
                  scope="col"
                  aria-sort={
                    sortKey === 'totalTrades'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className="py-2.5 px-3 text-right whitespace-nowrap"
                >
                  <button
                    type="button"
                    onClick={() => handleSort('totalTrades')}
                    className="inline-flex items-center justify-end gap-1.5 ml-auto hover:text-sky-400 transition-colors cursor-pointer"
                  >
                    <span>Session Trades</span>
                    {renderSortIcon('totalTrades')}
                  </button>
                </th>
                <th scope="col" className="py-2.5 px-3 text-right whitespace-nowrap">
                  Wins / Losses
                </th>
                <th
                  scope="col"
                  aria-sort={
                    sortKey === 'winLossRatio'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className="py-2.5 px-3 text-right whitespace-nowrap"
                >
                  <button
                    type="button"
                    onClick={() => handleSort('winLossRatio')}
                    className="inline-flex items-center justify-end gap-1.5 ml-auto hover:text-sky-400 transition-colors cursor-pointer"
                  >
                    <span>Win/Loss Ratio</span>
                    {renderSortIcon('winLossRatio')}
                  </button>
                </th>
                <th
                  scope="col"
                  aria-sort={
                    sortKey === 'winRatePct'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className="py-2.5 px-3 text-right whitespace-nowrap"
                >
                  <button
                    type="button"
                    onClick={() => handleSort('winRatePct')}
                    className="inline-flex items-center justify-end gap-1.5 ml-auto hover:text-sky-400 transition-colors cursor-pointer"
                  >
                    <span>Win Rate</span>
                    {renderSortIcon('winRatePct')}
                  </button>
                </th>
                <th
                  scope="col"
                  aria-sort={
                    sortKey === 'realizedPnlRs'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className="py-2.5 px-3 text-right whitespace-nowrap"
                >
                  <button
                    type="button"
                    onClick={() => handleSort('realizedPnlRs')}
                    className="inline-flex items-center justify-end gap-1.5 ml-auto hover:text-sky-400 transition-colors cursor-pointer"
                  >
                    <span>Profit Realized</span>
                    {renderSortIcon('realizedPnlRs')}
                  </button>
                </th>
                <th scope="col" className="py-2.5 px-3 text-right whitespace-nowrap">
                  Open P&amp;L
                </th>
                <th
                  scope="col"
                  aria-sort={
                    sortKey === 'totalSessionPnlRs'
                      ? sortDirection === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : 'none'
                  }
                  className="py-2.5 pl-3 pr-5 text-right whitespace-nowrap"
                >
                  <button
                    type="button"
                    onClick={() => handleSort('totalSessionPnlRs')}
                    className="inline-flex items-center justify-end gap-1.5 ml-auto hover:text-sky-400 transition-colors cursor-pointer"
                  >
                    <span>Total Session P&amp;L</span>
                    {renderSortIcon('totalSessionPnlRs')}
                  </button>
                </th>
              </tr>
            </thead>

            <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-slate-800/80'}`}>
              {sortedRows.map((row) => {
                const isSelected = row.scannerId === selectedScannerId;
                const realizedDetail =
                  row.closedTrades > 0 || row.partialT1BookedCount > 0
                    ? `${row.closedTrades} closed${
                        row.partialT1BookedCount > 0 ? ` · ${row.partialT1BookedCount} T1` : ''
                      }`
                    : 'No exits yet';

                return (
                  <tr
                    key={row.scannerId}
                    data-testid={`perf-row-${row.scannerId}`}
                    onClick={() => onSelectAgent(row.scannerId)}
                    className={`text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? isLight
                          ? 'bg-sky-50/80'
                          : 'bg-sky-500/10'
                        : isLight
                        ? 'hover:bg-slate-50'
                        : 'hover:bg-slate-800/45'
                    }`}
                  >
                    <td className="py-2.5 pl-5 pr-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono tabular-nums text-[11px] ${mutedText}`}>
                          {String(row.rank).padStart(2, '0')}
                        </span>
                        <span className="font-display font-semibold">{row.agentName}</span>
                        <span className={`text-[10.5px] font-mono ${mutedText}`}>
                          {row.agentGender}
                        </span>
                        {row.autonomousOptimization && (
                          <span
                            className={`text-[10px] font-mono font-medium ${
                              isLight ? 'text-sky-700' : 'text-sky-400'
                            }`}
                          >
                            Auto-Opt
                          </span>
                        )}
                        {isSelected && (
                          <ChevronRight
                            className={`w-3.5 h-3.5 ${isLight ? 'text-sky-600' : 'text-sky-400'}`}
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 max-w-[240px]">
                      <div className="truncate font-medium" title={row.scannerName}>
                        {row.scannerName}
                      </div>
                      <div className={`text-[10.5px] ${mutedText}`}>{row.categoryLabel}</div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="font-medium">{row.totalTrades}</div>
                      <div className={`text-[10.5px] ${mutedText}`}>
                        {row.closedTrades} closed · {row.openTrades} open
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <span className={isLight ? 'text-emerald-700 font-semibold' : 'text-emerald-400 font-semibold'}>
                        {row.wins}W
                      </span>
                      <span className={`mx-1 ${mutedText}`}>/</span>
                      <span className={isLight ? 'text-rose-700 font-semibold' : 'text-rose-400 font-semibold'}>
                        {row.losses}L
                      </span>
                      {row.breakeven > 0 && (
                        <div className={`text-[10px] ${mutedText}`}>{row.breakeven} flat</div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <span
                        className={`font-semibold ${
                          row.wins > 0 && (row.losses === 0 || row.winLossRatio >= 1.5)
                            ? isLight
                              ? 'text-emerald-700'
                              : 'text-emerald-400'
                            : row.losses > row.wins
                            ? isLight
                              ? 'text-rose-700'
                              : 'text-rose-400'
                            : ''
                        }`}
                      >
                        {row.winLossRatioLabel}
                      </span>
                      {row.wins > 0 && row.losses === 0 && (
                        <div className={`text-[10px] ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                          Zero losses
                        </div>
                      )}
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <span>{row.totalTrades > 0 ? `${row.winRatePct.toFixed(1)}%` : '—'}</span>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <div className={`font-semibold ${pnlTextCls(row.realizedPnlRs)}`}>
                        {formatInrSigned(row.realizedPnlRs)}
                      </div>
                      <div className={`text-[10px] ${mutedText}`}>{realizedDetail}</div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                      <span className={pnlTextCls(row.unrealizedPnlRs)}>
                        {formatInrSigned(row.unrealizedPnlRs)}
                      </span>
                    </td>

                    <td className="py-2.5 pl-3 pr-5 text-right font-mono tabular-nums whitespace-nowrap">
                      <span className={`font-semibold ${pnlTextCls(row.totalSessionPnlRs)}`}>
                        {formatInrSigned(row.totalSessionPnlRs)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot className={`sticky bottom-0 z-10 backdrop-blur-sm ${tfootCls}`}>
              <tr className="text-xs font-semibold">
                <td colSpan={2} className="py-2.5 pl-5 pr-3 font-display">
                  Fleet Session Total ({totals.agentCount} Agents)
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                  {totals.totalTrades}
                  <span className={`ml-1.5 text-[10.5px] font-normal ${mutedText}`}>
                    ({totals.closedTrades}c / {totals.openTrades}o)
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                  <span className={isLight ? 'text-emerald-700' : 'text-emerald-400'}>
                    {totals.wins}W
                  </span>
                  <span className={`mx-1 font-normal ${mutedText}`}>/</span>
                  <span className={isLight ? 'text-rose-700' : 'text-rose-400'}>
                    {totals.losses}L
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                  {totals.winLossRatioLabel}
                </td>
                <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                  {totals.totalTrades > 0 ? `${totals.winRatePct.toFixed(1)}%` : '—'}
                </td>
                <td
                  className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${pnlTextCls(
                    totals.realizedPnlRs
                  )}`}
                >
                  {formatInrSigned(totals.realizedPnlRs)}
                </td>
                <td
                  className={`py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap ${pnlTextCls(
                    totals.unrealizedPnlRs
                  )}`}
                >
                  {formatInrSigned(totals.unrealizedPnlRs)}
                </td>
                <td
                  className={`py-2.5 pl-3 pr-5 text-right font-mono tabular-nums whitespace-nowrap ${pnlTextCls(
                    totals.totalSessionPnlRs
                  )}`}
                >
                  {formatInrSigned(totals.totalSessionPnlRs)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
};
