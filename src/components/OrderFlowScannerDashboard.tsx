import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type {
  OrderFlowScanReport,
  OrderFlowSignalRow,
} from '../../server/orderFlowScannerEngine';
import {
  DEFAULT_ORDER_FLOW_SORT,
  formatOrderFlowSortSummary,
  isDefaultOrderFlowSort,
  sortOrderFlowRows,
  toggleOrderFlowSort,
  type OrderFlowSortColumn,
  type OrderFlowSortState,
} from '../utils/orderFlowSorting';
import { OrderFlowInspector } from './OrderFlowInspector';

interface OrderFlowScannerDashboardProps {
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
  onSelectSymbol?: (symbol: string) => void;
}

type DirectionFilter = 'ALL' | 'BUY' | 'SELL';
type SignalFilter = 'ALL' | 'STACKED' | 'ABSORPTION' | 'TAPE' | 'FRESH';

function fmtInr(v: number): string {
  if (!Number.isFinite(v)) return '₹0.00';
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtSignedInr(v: number): string {
  const n = Math.round(Number(v) || 0);
  const sign = n > 0 ? '+' : n < 0 ? '-' : '';
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN')}`;
}

function fmtCompactDelta(v: number): string {
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  const abs = Math.abs(v);
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}

export const OrderFlowScannerDashboard: React.FC<OrderFlowScannerDashboardProps> = ({
  theme = 'dark',
  onSelectSymbol,
}) => {
  const isLight = theme === 'light';
  const [report, setReport] = useState<OrderFlowScanReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('ALL');
  const [signalFilter, setSignalFilter] = useState<SignalFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFormula, setShowFormula] = useState<boolean>(false);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);
  const [nextRefreshSec, setNextRefreshSec] = useState<number>(60);
  const [sortState, setSortState] = useState<OrderFlowSortState>(DEFAULT_ORDER_FLOW_SORT);

  const handleSort = useCallback((column: OrderFlowSortColumn) => {
    setSortState((prev) => toggleOrderFlowSort(prev, column));
  }, []);

  const loadReport = useCallback(async (force: boolean = false) => {
    if (force) setRefreshing(true);
    try {
      const res = await fetch(`/api/order-flow-scanner/scan${force ? '?force=1' : ''}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Order Flow engine returned HTTP ${res.status}`);
      const data: OrderFlowScanReport = await res.json();
      setReport(data);
      setError(null);
      setNextRefreshSec(60);
      setSelectedSymbol((prev) => {
        const all = [...(data.upPicks || []), ...(data.downPicks || [])];
        if (prev && all.some((r) => r.symbol === prev)) return prev;
        return all[0]?.symbol || null;
      });
    } catch (err: any) {
      setError(err?.message || 'Unable to sync Order Flow Scanner.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Auto-refresh Order Flow Scanner strictly every 60 seconds with 1s countdown
  useEffect(() => {
    loadReport(false);
    const refreshId = window.setInterval(() => {
      loadReport(false);
    }, 60_000);
    const tickId = window.setInterval(() => {
      setNextRefreshSec((prev) => (prev <= 1 ? 60 : prev - 1));
    }, 1000);
    return () => {
      window.clearInterval(refreshId);
      window.clearInterval(tickId);
    };
  }, [loadReport]);

  const matchesFilters = useCallback(
    (row: OrderFlowSignalRow): boolean => {
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const hay = `${row.symbol} ${row.name} ${row.sector} ${row.headlineSignal} ${row.volumeProfile.priceZoneLabel}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (signalFilter === 'STACKED' && !row.signals.stackedImbalance.passed) return false;
      if (signalFilter === 'ABSORPTION' && !row.signals.absorption.detected) return false;
      if (signalFilter === 'TAPE' && !row.signals.tape.confirmed) return false;
      if (signalFilter === 'FRESH' && !row.signals.exhaustion.clearForContinuation) return false;
      return true;
    },
    [searchQuery, signalFilter]
  );

  const filteredUp = useMemo(
    () => sortOrderFlowRows((report?.upPicks || []).filter(matchesFilters), sortState),
    [report, matchesFilters, sortState]
  );
  const filteredDown = useMemo(
    () => sortOrderFlowRows((report?.downPicks || []).filter(matchesFilters), sortState),
    [report, matchesFilters, sortState]
  );

  const inspectedRow = useMemo(() => {
    const all = [...(report?.upPicks || []), ...(report?.downPicks || [])];
    if (all.length === 0) return null;
    if (selectedSymbol) {
      const found = all.find((r) => r.symbol === selectedSymbol);
      if (found) return found;
    }
    return all[0];
  }, [report, selectedSymbol]);

  const cardBg = isLight
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-[#0f172a] border-slate-800 text-slate-100';
  const innerBg = isLight
    ? 'bg-slate-50 border-slate-200'
    : 'bg-[#0b1120] border-slate-800';
  const mutedText = isLight ? 'text-slate-600' : 'text-slate-400';

  const renderSortableTh = (
    label: string,
    column: OrderFlowSortColumn,
    align: 'left' | 'right' = 'left',
    ariaLabel?: string
  ) => {
    const isActive = sortState.column === column;
    const ariaSort: 'ascending' | 'descending' | 'none' = isActive
      ? sortState.direction === 'asc'
        ? 'ascending'
        : 'descending'
      : 'none';
    return (
      <th
        scope="col"
        aria-sort={ariaSort}
        className={`py-2.5 px-2.5 ${align === 'right' ? 'text-right' : 'text-left'}`}
      >
        <button
          type="button"
          onClick={() => handleSort(column)}
          aria-label={ariaLabel || `Sort by ${label}`}
          data-sort-column={column}
          className={`inline-flex items-center gap-1 font-medium transition-colors cursor-pointer whitespace-nowrap ${
            align === 'right' ? 'justify-end ml-auto' : 'justify-start'
          } ${
            isActive
              ? 'text-sky-400 font-semibold'
              : isLight
              ? 'text-slate-600 hover:text-slate-900'
              : 'text-slate-400 hover:text-slate-100'
          }`}
        >
          <span>{label}</span>
          {isActive ? (
            sortState.direction === 'desc' ? (
              <ArrowDown className="w-3 h-3 shrink-0" aria-hidden="true" />
            ) : (
              <ArrowUp className="w-3 h-3 shrink-0" aria-hidden="true" />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 shrink-0 opacity-50" aria-hidden="true" />
          )}
        </button>
      </th>
    );
  };

  const renderTable = (
    title: string,
    rows: OrderFlowSignalRow[],
    isUp: boolean
  ) => (
    <div
      data-testid={isUp ? 'order-flow-up-table' : 'order-flow-down-table'}
      className={`rounded-xl border overflow-hidden ${cardBg}`}
    >
      <div
        className={`px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2 ${
          isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-[#0b1120]'
        }`}
      >
        <div className="flex items-center gap-2">
          {isUp ? (
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          ) : (
            <TrendingDown className="w-4 h-4 text-rose-400" />
          )}
          <h3
            className={`text-sm font-semibold ${
              isUp ? 'text-emerald-400' : 'text-rose-400'
            }`}
          >
            {title}
          </h3>
          <span className={`text-xs font-mono tabular-nums ${mutedText}`}>
            · {rows.length} / 10 Qualified
          </span>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span
            data-testid={isUp ? 'order-flow-up-sort-status' : 'order-flow-down-sort-status'}
            className={`text-xs font-mono tabular-nums ${mutedText}`}
          >
            {isUp ? 'Above POC · Buyers > Sellers' : 'Below POC · Sellers > Buyers'} ·{' '}
            {formatOrderFlowSortSummary(sortState)}
          </span>
          {!isDefaultOrderFlowSort(sortState) && (
            <button
              type="button"
              onClick={() => setSortState(DEFAULT_ORDER_FLOW_SORT)}
              className="text-[11px] font-mono text-sky-400 hover:text-sky-300 underline underline-offset-2 cursor-pointer"
            >
              Reset to Time
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr
              className={`border-b text-[11px] font-medium ${
                isLight
                  ? 'border-slate-200 bg-slate-50 text-slate-600'
                  : 'border-slate-800 bg-[#0b1120] text-slate-400'
              }`}
            >
              <th scope="col" className="py-2.5 px-3">Stock &amp; Sector</th>
              {renderSortableTh('Flow Score', 'score', 'left', 'Sort by Flow Score')}
              {renderSortableTh('Time', 'time', 'left', 'Sort by Time')}
              {renderSortableTh('Volume', 'volume', 'right', 'Sort by Volume')}
              {renderSortableTh('Price Impact', 'priceImpact', 'right', 'Sort by Price Impact')}
              <th scope="col" className="py-2.5 px-2.5">Step 1: Volume Profile</th>
              <th scope="col" className="py-2.5 px-2.5">Step 2: Footprint</th>
              <th scope="col" className="py-2.5 px-2.5">Step 3: 5 Signals</th>
              {renderSortableTh('Delta (B−S)', 'delta', 'right', 'Sort by Delta')}
              <th scope="col" className="py-2.5 px-2.5 text-right">Rudra Entry / SL</th>
              <th scope="col" className="py-2.5 px-3 text-right">T1 / T2</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/70">
            {loading && rows.length === 0 ? (
              <tr>
                <td colSpan={11} className={`py-8 text-center ${mutedText}`}>
                  Evaluating NSE 200 auction profile, footprint imbalances, and tape prints...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={11} className={`py-8 text-center ${mutedText}`}>
                  {report?.isMidnightCleared
                    ? '23:59 IST Auto-Flush active — awaiting 09:20 IST live Order Flow scan.'
                    : 'Zero fake signals: no symbols currently pass all 3 Order Flow steps + Rule 3 thresholds.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const isSelected = inspectedRow?.symbol === row.symbol;
                const s = row.signals;
                const volumeHeadline =
                  Number(row.turnoverCr) > 0
                    ? `₹${row.turnoverCr.toFixed(1)}Cr`
                    : `${fmtCompactDelta(row.volumeProfile?.totalProfileVolume || 0).replace(/^\+/, '')} sh`;
                return (
                  <tr
                    key={row.symbol}
                    data-symbol={row.symbol}
                    onClick={() => setSelectedSymbol(row.symbol)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? isLight
                          ? 'bg-sky-50'
                          : 'bg-sky-500/12'
                        : isLight
                        ? 'hover:bg-slate-50'
                        : 'hover:bg-slate-800/45'
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <div className="font-semibold flex items-center gap-1.5">
                        <span>{row.symbol}</span>
                        {isSelected && (
                          <span className="text-[10px] font-mono text-sky-400">
                            INSPECTING
                          </span>
                        )}
                      </div>
                      <div className={`text-[11px] ${mutedText}`}>
                        {row.sector}
                      </div>
                    </td>

                    <td className="py-2.5 px-2.5 font-mono tabular-nums">
                      <div className="font-semibold text-sky-400">
                        {row.orderFlowScore}/100
                      </div>
                      <div className={`text-[10px] ${mutedText}`}>{row.convictionGrade}</div>
                    </td>

                    <td className="py-2.5 px-2.5 font-mono tabular-nums">
                      <div>{row.listedAt} IST</div>
                      <div className={`text-[10px] ${mutedText}`}>Locked</div>
                    </td>

                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                      <div className="font-semibold">{volumeHeadline}</div>
                      <div className={`text-[10px] ${mutedText}`}>
                        RVOL {row.rvol.toFixed(1)}× · VolX {row.xTimeVolume.toFixed(1)}×
                      </div>
                    </td>

                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                      <div className="font-semibold">{fmtInr(row.price)}</div>
                      <div
                        className={`text-[11px] font-medium ${
                          row.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {row.changePercent >= 0 ? '+' : ''}
                        {row.changePercent.toFixed(2)}%
                      </div>
                    </td>

                    <td className="py-2.5 px-2.5 font-mono tabular-nums">
                      <div className="font-medium text-slate-200">
                        {row.volumeProfile.priceZone === 'ABOVE_VAH'
                          ? 'Above VAH'
                          : row.volumeProfile.priceZone === 'BELOW_VAL'
                          ? 'Below VAL'
                          : row.volumeProfile.priceZone === 'AT_POC'
                          ? 'At POC'
                          : row.volumeProfile.priceZone === 'INSIDE_VALUE_UPPER'
                          ? 'POC → VAH'
                          : 'VAL → POC'}
                        {row.volumeProfile.inFastLvnZone && (
                          <span className="ml-1 text-sky-400">· LVN Fast</span>
                        )}
                      </div>
                      <div className={`text-[10px] ${mutedText}`}>
                        POC ₹{row.volumeProfile.poc.toFixed(1)} · VAH ₹
                        {row.volumeProfile.vah.toFixed(1)}
                      </div>
                    </td>

                    <td className="py-2.5 px-2.5 font-mono tabular-nums">
                      <div
                        className={
                          s.stackedImbalance.passed
                            ? isUp
                              ? 'text-emerald-400 font-semibold'
                              : 'text-rose-400 font-semibold'
                            : mutedText
                        }
                      >
                        {s.stackedImbalance.count}× Stacked{' '}
                        {isUp ? 'Buy' : 'Sell'}
                      </div>
                      <div className={`text-[10px] ${mutedText}`}>
                        {isUp
                          ? `${row.footprint.buyImbalanceCount} Buy Imb`
                          : `${row.footprint.sellImbalanceCount} Sell Imb`}
                      </div>
                    </td>

                    <td className="py-2.5 px-2.5 font-mono tabular-nums">
                      <div className="font-semibold">
                        {s.confirmedCount}/5 Confirmed
                      </div>
                      <div className={`text-[10px] ${mutedText}`}>
                        {s.absorption.detected ? 'Absorb · ' : ''}
                        {s.tape.confirmed ? 'Big Tape · ' : ''}
                        {s.exhaustion.detected ? 'Tired!' : 'Fresh'}
                      </div>
                    </td>

                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                      <div
                        className={`font-semibold ${
                          s.delta.footprintDelta >= 0
                            ? 'text-emerald-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {fmtCompactDelta(s.delta.footprintDelta)}
                      </div>
                      <div className={`text-[10px] ${mutedText}`}>
                        {s.delta.deltaPct >= 0 ? '+' : ''}
                        {s.delta.deltaPct.toFixed(1)}%
                      </div>
                    </td>

                    <td className="py-2.5 px-2.5 text-right font-mono tabular-nums">
                      <div>{fmtInr(row.entryPrice)}</div>
                      <div className="text-[11px] text-rose-400">
                        SL {fmtInr(row.stopLoss)}
                      </div>
                    </td>

                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <div className="text-emerald-400">{fmtInr(row.target1)}</div>
                      <div className="text-[11px] text-sky-400">
                        T2 {fmtInr(row.target2)}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="space-y-5" data-testid="order-flow-scanner-dashboard">
      {/* Header & Controls Card */}
      <div className={`rounded-xl border p-5 ${cardBg}`}>
        <div
          className={`flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b ${
            isLight ? 'border-slate-200' : 'border-slate-800'
          }`}
        >
          <div>
            <div className={`flex items-center gap-2 flex-wrap text-xs ${mutedText}`}>
              <span>3-Step Institutional Order Flow</span>
              <span aria-hidden="true">/</span>
              <span className="font-mono tabular-nums text-sky-400 font-medium">
                Volume Profile &middot; Footprint &middot; 5 Signals
              </span>
              <span aria-hidden="true">&middot;</span>
              <span className="font-mono tabular-nums">
                {report?.session.phaseLabel || 'Syncing 09:20–15:15 IST Window...'}
              </span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight mt-1">
              Order Flow Scanner &mdash; Who Is Behind the Candles
            </h1>
            <p className={`text-xs mt-1 max-w-3xl leading-relaxed ${mutedText}`}>
              Evaluates every NSE 200 setup through three institutional layers: Step 1 Volume Profile (VAH, VAL, POC, HVN acceptance &amp; LVN fast-move zones), Step 2 Footprint Ladder (Sellers Left &times; Buyers Right), and Step 3 Five Signals (Stacked Imbalance &ge;3, Absorption, Exhaustion, Delta, and The Tape). Managed by{' '}
              <strong className={isLight ? 'text-slate-900' : 'text-slate-200'}>
                Rudra AI (AI-AGENT-ORDERFLOW)
              </strong>
              .
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap text-xs shrink-0">
            <span
              data-testid="order-flow-refresh-timer"
              className={`px-3 py-2 rounded-lg border font-mono tabular-nums whitespace-nowrap ${
                isLight
                  ? 'border-slate-300 bg-slate-50 text-slate-700'
                  : 'border-slate-800 bg-[#0b1120] text-slate-300'
              }`}
            >
              Auto-refresh 60s &middot; {nextRefreshSec}s
            </span>
            <button
              type="button"
              data-testid="order-flow-formula-toggle"
              onClick={() => setShowFormula((v) => !v)}
              className={`px-3.5 py-2 rounded-lg border font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                showFormula
                  ? 'border-sky-500 bg-sky-500/15 text-sky-400'
                  : isLight
                  ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-800'
                  : 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>3-Step Formula</span>
            </button>

            <button
              type="button"
              data-testid="order-flow-scan-btn"
              disabled={refreshing}
              onClick={() => loadReport(true)}
              className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Scanning...' : 'Scan Now'}</span>
            </button>
          </div>
        </div>

        {/* 6-Cell KPI Strip (Single Elevation, Hairline Dividers) */}
        <div
          className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-800 border rounded-lg my-4 ${innerBg}`}
        >
          <div className="p-3.5">
            <div className={`text-[11px] ${mutedText}`}>Assigned AI Agent</div>
            <div className="font-semibold text-sm mt-0.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>{report?.agent.name || 'Rudra AI'} (He)</span>
            </div>
            <div className={`text-[11px] font-mono tabular-nums mt-0.5 ${mutedText}`}>
              AI-AGENT-ORDERFLOW · 1% Risk
            </div>
          </div>

          <div className="p-3.5">
            <div className={`text-[11px] ${mutedText}`}>Order Flow UP</div>
            <div className="text-emerald-400 font-mono tabular-nums font-semibold text-lg mt-0.5">
              {report?.summary.upCount ?? 0} / 10
            </div>
            <div className={`text-[11px] mt-0.5 ${mutedText}`}>Zero Fake Signals</div>
          </div>

          <div className="p-3.5">
            <div className={`text-[11px] ${mutedText}`}>Order Flow DOWN</div>
            <div className="text-rose-400 font-mono tabular-nums font-semibold text-lg mt-0.5">
              {report?.summary.downCount ?? 0} / 10
            </div>
            <div className={`text-[11px] mt-0.5 ${mutedText}`}>Seller Dominance</div>
          </div>

          <div className="p-3.5">
            <div className={`text-[11px] ${mutedText}`}>Stacked Imb (&ge;3)</div>
            <div className="text-sky-400 font-mono tabular-nums font-semibold text-lg mt-0.5">
              {report?.summary.stackedImbalanceCount ?? 0}
            </div>
            <div className={`text-[11px] font-mono tabular-nums mt-0.5 ${mutedText}`}>
              {report?.summary.absorptionCount ?? 0} Absorption ·{' '}
              {report?.summary.tapeConfirmedCount ?? 0} Tape
            </div>
          </div>

          <div className="p-3.5">
            <div className={`text-[11px] ${mutedText}`}>Net Desk Delta</div>
            <div
              className={`font-mono tabular-nums font-semibold text-lg mt-0.5 ${
                (report?.summary.netDeskDelta ?? 0) >= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {fmtCompactDelta(report?.summary.netDeskDelta ?? 0)}
            </div>
            <div className={`text-[11px] font-mono tabular-nums mt-0.5 ${mutedText}`}>
              Avg Score {report?.summary.avgOrderFlowScore ?? 0}/100
            </div>
          </div>

          <div className="p-3.5">
            <div className={`text-[11px] ${mutedText}`}>Rudra Live MTM</div>
            <div
              className={`font-mono tabular-nums font-semibold text-lg mt-0.5 ${
                (report?.summary.totalLivePnlRs ?? 0) >= 0
                  ? 'text-emerald-400'
                  : 'text-rose-400'
              }`}
            >
              {fmtSignedInr(report?.summary.totalLivePnlRs ?? 0)}
            </div>
            <div className={`text-[11px] font-mono tabular-nums mt-0.5 ${mutedText}`}>
              {report?.istTime || 'Syncing IST...'}
            </div>
          </div>
        </div>

        {/* Collapsible 3-Step Order Flow Formula Guide */}
        {showFormula && report?.formulaSteps && (
          <div
            data-testid="order-flow-formula-panel"
            className={`rounded-lg border p-4 mb-4 ${innerBg}`}
          >
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-slate-800">
              <div className="text-xs font-semibold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-sky-400" />
                <span>3-Step Institutional Order Flow Process (Formula Specification)</span>
              </div>
              <div className={`text-[11px] font-mono tabular-nums ${mutedText}`}>
                Rule 3 Gate: RVOL &gt; 2.00 &middot; Vol Bazaar X-Time &gt; 1.00X &middot; ADX 25+ &middot; 09:20–15:15 IST
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3 text-xs">
              {report.formulaSteps.map((s) => (
                <div
                  key={s.code}
                  className={`rounded-lg border p-3 ${
                    isLight
                      ? 'bg-white border-slate-200'
                      : 'bg-[#0f172a] border-slate-800'
                  }`}
                >
                  <div className="font-semibold text-sky-400">{s.title}</div>
                  <p className="mt-1 leading-relaxed">{s.rule}</p>
                  <p className={`text-[11px] mt-1 ${mutedText}`}>{s.interpretation}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 text-xs">
          <div className="relative flex-1 max-w-sm">
            <label htmlFor="order-flow-search" className="sr-only">
              Search Order Flow symbol, sector, or signal
            </label>
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="order-flow-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search symbol, sector, VAH, LVN, stacked..."
              className={`w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs outline-none focus:border-sky-500 ${innerBg}`}
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Signal Quick Filter */}
            <div
              className={`inline-flex items-center p-0.5 rounded-lg border ${innerBg}`}
              role="group"
              aria-label="Filter by Order Flow signal"
            >
              {(
                [
                  ['ALL', 'All Signals'],
                  ['STACKED', 'Stacked ≥3'],
                  ['ABSORPTION', 'Absorption'],
                  ['TAPE', 'Big Tape'],
                  ['FRESH', 'No Exhaustion'],
                ] as Array<[SignalFilter, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSignalFilter(key)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    signalFilter === key
                      ? 'bg-sky-500/20 text-sky-400 font-semibold'
                      : `${mutedText} hover:text-slate-200`
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Direction Filter */}
            <div
              className={`inline-flex items-center p-0.5 rounded-lg border ${innerBg}`}
              role="group"
              aria-label="Filter by direction"
            >
              {(
                [
                  ['ALL', 'All Picks'],
                  ['BUY', 'UP (Best 10)'],
                  ['SELL', 'DOWN (Best 10)'],
                ] as Array<[DirectionFilter, string]>
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDirectionFilter(key)}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    directionFilter === key
                      ? 'bg-sky-500/20 text-sky-400 font-semibold'
                      : `${mutedText} hover:text-slate-200`
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-3 px-3.5 py-2 rounded-lg border border-rose-500/40 bg-rose-500/10 text-rose-300 text-xs flex items-center gap-2">
            <Activity className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* Interactive 3-Step Order Flow Inspector for Active Selected Stock */}
      {inspectedRow && (
        <OrderFlowInspector
          row={inspectedRow}
          theme={theme}
          onInspectStock={onSelectSymbol}
        />
      )}

      {/* Best 10 UP & Best 10 DOWN Tables */}
      {(directionFilter === 'ALL' || directionFilter === 'BUY') &&
        renderTable('Order Flow Bullish Leaders (Best 10 UP)', filteredUp, true)}

      {(directionFilter === 'ALL' || directionFilter === 'SELL') &&
        renderTable('Order Flow Bearish Leaders (Best 10 DOWN)', filteredDown, false)}
    </div>
  );
};
