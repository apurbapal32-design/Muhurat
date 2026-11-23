import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { BtstScanReport, BtstSignalRow } from '../../server/btstScannerEngine';
import { safeFetchJson } from '../utils/apiClient';
import { computeBtstConfluenceConfidence } from '../utils/btstConfidence';
import { BtstConfidenceGauge } from './BtstConfidenceGauge';

interface BtstScannerDashboardProps {
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
  onSelectSymbol?: (symbol: string) => void;
}

type DirectionFilter = 'ALL' | 'BUY' | 'SELL';

function formatInr(val: number): string {
  const num = Number.isFinite(val) ? val : 0;
  return `₹${num.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatSignedInr(val: number): string {
  const num = Number.isFinite(val) ? Math.round(val) : 0;
  const sign = num > 0 ? '+' : num < 0 ? '-' : '';
  return `${sign}₹${Math.abs(num).toLocaleString('en-IN')}`;
}

export const BtstScannerDashboard: React.FC<BtstScannerDashboardProps> = ({
  theme = 'dark',
  onSelectSymbol,
}) => {
  const isLight = theme === 'light';
  const [report, setReport] = useState<BtstScanReport | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [directionFilter, setDirectionFilter] = useState<DirectionFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showFormula, setShowFormula] = useState<boolean>(false);
  const [selectedPick, setSelectedPick] = useState<BtstSignalRow | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const loadReport = useCallback(async (force = false) => {
    if (inFlightRef.current && !force) return;
    inFlightRef.current = true;
    if (force) setRefreshing(true);
    try {
      const data = await safeFetchJson<BtstScanReport>(
        `/api/btst-scanner/scan${force ? '?force=1' : ''}`
      );
      if (data && data.status === 'ok') {
        setReport(data);
        setError(null);
      } else {
        setError('Unable to load BTST Scanner feed.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to sync BTST Scanner.');
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadReport(false);
    const timer = setInterval(() => loadReport(false), 6000);
    return () => clearInterval(timer);
  }, [loadReport]);

  const filterRows = useCallback(
    (rows: BtstSignalRow[]) => {
      const q = searchQuery.trim().toLowerCase();
      if (!q) return rows;
      return rows.filter(
        (r) =>
          r.symbol.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.sector.toLowerCase().includes(q) ||
          r.buildup.toLowerCase().includes(q)
      );
    },
    [searchQuery]
  );

  const filteredUp = useMemo(
    () => (report ? filterRows(report.upPicks) : []),
    [report, filterRows]
  );
  const filteredDown = useMemo(
    () => (report ? filterRows(report.downPicks) : []),
    [report, filterRows]
  );

  const panelClass = isLight
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-[#0f172a] border-slate-800 text-slate-100';
  const insetClass = isLight
    ? 'bg-slate-50 border-slate-200'
    : 'bg-[#0b1120] border-slate-800';
  const mutedText = isLight ? 'text-slate-600' : 'text-slate-400';

  const renderTable = (rows: BtstSignalRow[], side: 'BUY' | 'SELL') => {
    const isBuy = side === 'BUY';
    return (
      <div className={`rounded-xl border overflow-hidden ${panelClass}`} data-testid={`btst-table-${isBuy ? 'up' : 'down'}`}>
        <div
          className={`px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2 ${
            isLight ? 'border-slate-200 bg-slate-50/70' : 'border-slate-800 bg-[#0b1120]'
          }`}
        >
          <div className="flex items-center gap-2">
            {isBuy ? (
              <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <TrendingDown className="w-4 h-4 text-rose-500 shrink-0" />
            )}
            <h3 className="text-sm font-semibold tracking-tight">
              {isBuy ? 'BTST Upside Leaders (Best 10 UP)' : 'STBT Downside Leaders (Best 10 DOWN)'}
            </h3>
            <span className={`text-xs font-mono tabular-nums ${mutedText}`}>
              · {rows.length} / 10 Qualified
            </span>
          </div>
          <div className={`text-xs font-mono tabular-nums ${mutedText}`}>
            {isBuy ? 'CLV ≥ 68% · Above VWAP' : 'CLV ≤ 32% · Below VWAP'} · Sorted Listed At Z → A
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
                <th className="py-2.5 px-3">Stock &amp; Sector</th>
                <th className="py-2.5 px-2.5">AI Confidence</th>
                <th className="py-2.5 px-2.5">Listed At</th>
                <th className="py-2.5 px-2.5 text-right">LTP / Chg%</th>
                <th className="py-2.5 px-2.5 text-right">Close CLV</th>
                <th className="py-2.5 px-2.5 text-right">RVOL / VolX / ADX</th>
                <th className="py-2.5 px-2.5 text-right">Vedant Entry</th>
                <th className="py-2.5 px-2.5 text-right">Overnight SL</th>
                <th className="py-2.5 px-2.5 text-right">Next-Day T1 / T2</th>
                <th className="py-2.5 px-3">Vedant AI Action</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${isLight ? 'divide-slate-100' : 'divide-slate-800/70'}`}>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className={`py-8 px-4 text-center ${mutedText}`}>
                    {report?.isMidnightCleared
                      ? 'BTST Scanner cleared at 23:59 IST. Awaits next session.'
                      : `No ${isBuy ? 'BTST UP' : 'STBT DOWN'} stocks currently pass all 7 strict institutional gates (Zero Fake Signals enforced).`}
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const isSelected = selectedPick?.symbol === row.symbol;
                  return (
                    <tr
                      key={`${row.direction}-${row.symbol}`}
                      onClick={() => {
                        setSelectedPick(isSelected ? null : row);
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? isLight
                            ? 'bg-sky-50'
                            : 'bg-sky-500/10'
                          : isLight
                          ? 'hover:bg-slate-50'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <div className="font-semibold tracking-tight">{row.symbol}</div>
                        <div className={`text-[11px] truncate max-w-[150px] ${mutedText}`}>
                          {row.sector} · {row.buildup}
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 whitespace-nowrap">
                        <BtstConfidenceGauge row={row} isLight={isLight} size="sm" />
                      </td>
                      <td className="py-2.5 px-2.5 font-mono tabular-nums whitespace-nowrap">
                        <div>{row.listedAt}</div>
                        <div className={`text-[10px] ${mutedText}`}>Qty {row.positionQty}</div>
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold">{formatInr(row.price)}</div>
                        <div
                          className={`text-[11px] font-medium ${
                            row.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {row.changePercent >= 0 ? '+' : ''}
                          {row.changePercent.toFixed(2)}%
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className={isBuy ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
                          {row.clvPct}%
                        </div>
                        <div className={`text-[10px] ${mutedText}`}>
                          {row.vsVwapPct >= 0 ? '+' : ''}
                          {row.vsVwapPct.toFixed(2)}% VWAP
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <div>
                          {row.rvol.toFixed(2)}x · {row.xTimeVolume.toFixed(2)}X
                        </div>
                        <div className={`text-[10px] ${mutedText}`}>
                          ADX {row.adx.toFixed(1)} · Carry {row.deliveryConvictionPct}%
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-medium">{formatInr(row.entryPrice)}</div>
                        <div className={`text-[10px] ${mutedText}`}>
                          {row.entryZoneLow.toFixed(1)}–{row.entryZoneHigh.toFixed(1)}
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="font-semibold text-amber-400">
                          {formatInr(row.activeStopLoss)}
                        </div>
                        <div className={`text-[10px] ${mutedText}`}>
                          -{row.slDistancePct.toFixed(2)}% ({row.plannedRR})
                        </div>
                      </td>
                      <td className="py-2.5 px-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                        <div className="text-emerald-400 font-medium">
                          T1 {formatInr(row.nextDayTarget1)}
                        </div>
                        <div className={`text-[10px] ${mutedText}`}>
                          T2 {formatInr(row.nextDayTarget2)}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 max-w-[230px]">
                        <div className="font-medium text-sky-400 text-[11px] truncate">
                          {row.agentActionBadge}
                        </div>
                        <div className={`text-[10px] truncate ${mutedText}`} title={row.agentDirective}>
                          {row.agentDirective}
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
  };

  return (
    <div className="space-y-5" data-testid="btst-scanner-dashboard">
      {/* Header & Recommended Window Contract */}
      <div className={`rounded-xl border p-5 ${panelClass}`}>
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 border-b border-slate-800/80">
          <div>
            <div className={`flex items-center gap-2 flex-wrap text-xs ${mutedText}`}>
              <span>Overnight Institutional Scanner</span>
              <span aria-hidden="true">/</span>
              <span className="font-mono tabular-nums text-sky-400 font-medium">
                Recommended Scan Window: 2:45 PM – 3:20 PM IST
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {report?.window.phaseLabel || 'Syncing IST Clock...'}
              </span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight mt-1">
              BTST Scanner — Closing Dominance &amp; Overnight Edge
            </h1>
            <p className={`text-xs mt-1 max-w-3xl leading-relaxed ${mutedText}`}>
              Identifies Best 10 UP (BTST) and Best 10 DOWN (STBT) institutional closing-strength stocks passing CLV dominance, Rule 3 liquidity (RVOL &gt; 2.00, Vol Bazaar X-Time &gt; 1.00X, ADX 25+), VWAP/EMA trend authority, and F&amp;O carry conviction. Managed end-to-end by{' '}
              <strong className={isLight ? 'text-slate-900' : 'text-slate-200'}>
                Vedant AI (AI-AGENT-BTST)
              </strong>
              .
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              type="button"
              onClick={() => setShowFormula((v) => !v)}
              className={`px-3.5 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                isLight
                  ? 'border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-800'
                  : 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>{showFormula ? 'Hide Formula' : 'BTST Formula'}</span>
            </button>
            <button
              type="button"
              onClick={() => loadReport(true)}
              disabled={refreshing}
              className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Scanning...' : 'Scan Now'}</span>
            </button>
          </div>
        </div>

        {/* Dedicated Assigned AI Agent & KPI Strip */}
        <div
          className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-800/80 border rounded-lg mt-4 ${insetClass}`}
        >
          <div className="p-3.5">
            <div className={`text-[11px] flex items-center gap-1.5 ${mutedText}`}>
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Assigned AI Agent</span>
            </div>
            <div className="font-semibold text-sm mt-0.5">
              {report?.agent.name || 'Vedant AI'} (He)
            </div>
            <div className={`text-[11px] font-mono tabular-nums ${mutedText}`}>
              {report?.agent.agentId || 'AI-AGENT-BTST'} · 1% Risk
            </div>
          </div>

          <div className="p-3.5">
            <div className={`text-[11px] flex items-center gap-1.5 ${mutedText}`}>
              <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Prime Window (IST)</span>
            </div>
            <div className="font-mono tabular-nums font-semibold text-sm mt-0.5 text-sky-400">
              2:45 PM – 3:20 PM
            </div>
            <div className={`text-[11px] font-mono tabular-nums ${mutedText}`}>
              Now: {report?.istTime || '--:--:--'} IST
            </div>
          </div>

          <div className="p-3.5">
            <div className={`text-[11px] ${mutedText}`}>BTST UP (Best 10)</div>
            <div className="font-mono tabular-nums font-semibold text-lg text-emerald-400 mt-0.5">
              {report?.summary.upCount ?? 0} / 10
            </div>
            <div className={`text-[11px] ${mutedText}`}>Zero Fake Signals</div>
          </div>

          <div className="p-3.5">
            <div className={`text-[11px] ${mutedText}`}>STBT DOWN (Best 10)</div>
            <div className="font-mono tabular-nums font-semibold text-lg text-rose-400 mt-0.5">
              {report?.summary.downCount ?? 0} / 10
            </div>
            <div className={`text-[11px] ${mutedText}`}>Short Overnight Carry</div>
          </div>

          <div className="p-3.5">
            <div className={`text-[11px] ${mutedText}`}>Avg Score / Gap Edge</div>
            <div className="font-mono tabular-nums font-semibold text-lg mt-0.5">
              {report?.summary.avgBtstScore ?? 0} · {report?.summary.avgGapProbabilityPct ?? 0}%
            </div>
            <div className={`text-[11px] font-mono tabular-nums ${mutedText}`}>
              {report?.summary.aPlusCount ?? 0} A+ Prime Picks
            </div>
          </div>

          <div className="p-3.5">
            <div className={`text-[11px] ${mutedText}`}>Vedant Live MTM</div>
            <div
              className={`font-mono tabular-nums font-semibold text-lg mt-0.5 ${
                (report?.summary.totalLivePnlRs ?? 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {formatSignedInr(report?.summary.totalLivePnlRs ?? 0)}
            </div>
            <div className={`text-[11px] font-mono tabular-nums ${mutedText}`}>
              W/L: {report?.summary.winLossRatioLabel || '—'}
            </div>
          </div>
        </div>

        {/* Optional Collapsible 6-Pillar World-Class BTST Formula Breakdown */}
        {showFormula && report?.formulaPillars && (
          <div className={`mt-4 p-4 rounded-lg border ${insetClass}`} data-testid="btst-formula-panel">
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-slate-800/80">
              <div className="text-xs font-semibold">
                World-Class 6-Pillar Institutional BTST / STBT Formula Architecture
              </div>
              <div className={`text-[11px] font-mono tabular-nums ${mutedText}`}>
                Recommended Execution: 2:45 PM – 3:20 PM IST · Overnight SL 1.35×ATR · T1 1.5R / T2 2.6R
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {report.formulaPillars.map((p) => (
                <div key={p.code} className="text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">
                      {String(p.step).padStart(2, '0')}. {p.title}
                    </span>
                    <span className="font-mono tabular-nums text-sky-400">{p.weightPct}%</span>
                  </div>
                  <p className={`text-[11px] leading-relaxed ${mutedText}`}>{p.rule}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Controls Bar: Search & Direction Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mt-4">
          <div className="relative flex-1 max-w-sm">
            <label htmlFor="btst-react-search" className="sr-only">
              Search BTST stock symbol or sector
            </label>
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="btst-react-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search symbol, sector, or buildup..."
              className={`w-full pl-8 pr-3 py-1.5 rounded-lg border text-xs outline-none focus:border-sky-500 ${insetClass}`}
            />
          </div>

          <div
            className={`inline-flex items-center p-0.5 rounded-lg border ${insetClass}`}
            role="group"
            aria-label="Filter BTST picks by direction"
          >
            {(
              [
                { key: 'ALL', label: `All (${filteredUp.length + filteredDown.length})` },
                { key: 'BUY', label: `BTST UP (${filteredUp.length})` },
                { key: 'SELL', label: `STBT DOWN (${filteredDown.length})` },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setDirectionFilter(opt.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  directionFilter === opt.key
                    ? 'bg-sky-500/20 text-sky-400 font-semibold'
                    : `${mutedText} hover:text-slate-200`
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Selected Pick 7-Factor Audit Drawer */}
      {selectedPick && (() => {
        const auditConf = computeBtstConfluenceConfidence(selectedPick);
        return (
        <div className={`rounded-xl border p-4 ${panelClass}`} data-testid="btst-selected-audit">
          <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-3.5 min-w-0">
              <BtstConfidenceGauge
                row={selectedPick}
                isLight={isLight}
                size="lg"
                showDetails={false}
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold flex items-center flex-wrap gap-x-2 gap-y-0.5">
                  <span>
                    {selectedPick.symbol} · {selectedPick.setupType === 'BTST_LONG' ? 'BTST Long Carry' : 'STBT Short Carry'}
                  </span>
                  <span className={`font-mono tabular-nums text-xs ${auditConf.textClass}`}>
                    AI Confidence {auditConf.score}/100 ({auditConf.tier})
                  </span>
                  <span className={`text-xs font-mono tabular-nums ${mutedText}`}>
                    · Formula {selectedPick.btstScore} ({selectedPick.convictionGrade})
                  </span>
                </div>
                <div className={`text-xs mt-0.5 ${mutedText}`}>{selectedPick.agentDirective}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {onSelectSymbol && (
                <button
                  type="button"
                  onClick={() => onSelectSymbol(selectedPick.symbol)}
                  className="px-2.5 py-1 rounded-md bg-sky-500/15 border border-sky-500/40 text-sky-400 hover:bg-sky-500/25 text-xs font-medium cursor-pointer transition-colors"
                >
                  Deep Inspect
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedPick(null)}
                className={`px-2.5 py-1 rounded-md border text-xs cursor-pointer ${insetClass}`}
              >
                Close Audit
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 mt-3">
            {selectedPick.checks.map((chk) => (
              <div key={chk.id} className={`p-2.5 rounded-lg border text-xs ${insetClass}`}>
                <div className={`text-[10px] ${mutedText}`}>{chk.label}</div>
                <div
                  className={`font-mono tabular-nums font-semibold mt-1 ${
                    chk.passed ? 'text-emerald-400' : 'text-amber-400'
                  }`}
                >
                  {chk.value}
                </div>
                <div className={`text-[10px] font-mono ${mutedText}`}>Gate: {chk.threshold}</div>
              </div>
            ))}
          </div>
        </div>
        );
      })()}

      {error && (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">
          {error}
        </div>
      )}

      {loading && !report ? (
        <div className={`rounded-xl border p-8 text-center text-xs ${panelClass} ${mutedText}`}>
          Evaluating NSE 200 universe under 7-factor BTST/STBT Closing Dominance formula...
        </div>
      ) : (
        <div className="space-y-5">
          {(directionFilter === 'ALL' || directionFilter === 'BUY') && renderTable(filteredUp, 'BUY')}
          {(directionFilter === 'ALL' || directionFilter === 'SELL') && renderTable(filteredDown, 'SELL')}
        </div>
      )}
    </div>
  );
};
