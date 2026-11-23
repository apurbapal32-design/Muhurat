import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import {
  AgentCardViewModel,
  AgentManagementFilterState,
  AgentSortOption,
  AgentStatusFilter,
  buildAgentCardViewModel,
  computeFleetRiskSummary,
  filterAndSortAgents,
  Fleet20Response,
  formatInrSigned,
  formatPriceInr,
  SCANNER_CATEGORY_LABELS,
  ScannerCategory20,
} from '../utils/agentManagement';
import { AgentPerformanceSummaryTable } from './AgentPerformanceSummaryTable';
import { AgentStopLossLadder } from './AgentStopLossLadder';

interface AgentManagementDashboardProps {
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
  onSelectSymbol?: (symbol: string) => void;
}

const DEFAULT_FILTERS: AgentManagementFilterState = {
  search: '',
  gender: 'ALL',
  category: 'ALL',
  status: 'ALL',
  sortBy: 'rank',
};

export const AgentManagementDashboard: React.FC<AgentManagementDashboardProps> = ({
  theme = 'dark',
  onSelectSymbol,
}) => {
  const [fleetData, setFleetData] = useState<Fleet20Response | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedScannerId, setSelectedScannerId] = useState<string>('top-momentum');
  const [filters, setFilters] = useState<AgentManagementFilterState>(DEFAULT_FILTERS);
  const [togglingMap, setTogglingMap] = useState<Record<string, boolean>>({});
  const [bulkToggling, setBulkToggling] = useState<boolean>(false);
  const [showGlobalResetConfirm, setShowGlobalResetConfirm] = useState<boolean>(false);
  const [resettingAll, setResettingAll] = useState<boolean>(false);
  const [resumingFleet, setResumingFleet] = useState<boolean>(false);
  const inspectorRef = useRef<HTMLDivElement>(null);

  const isLight = theme === 'light';

  const fetchFleet = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/api/scanners/fleet-20', { cache: 'no-store' });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Unable to load 20 AI agents`);
      }
      const data: Fleet20Response = await res.json();
      setFleetData(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch live AI agent fleet telemetry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const handleToggleAutonomousOpt = useCallback(
    async (scannerId: string, nextEnabled: boolean) => {
      setTogglingMap((prev) => ({ ...prev, [scannerId]: true }));
      try {
        const res = await fetch(
          `/api/scanners/fleet-20/${encodeURIComponent(scannerId)}/autonomous-optimization`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: nextEnabled }),
          }
        );
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: Unable to update Autonomous Optimization`);
        }
        const data: Fleet20Response = await res.json();
        setFleetData(data);
        setError(null);
      } catch (err: any) {
        setError(err?.message || 'Failed to toggle Autonomous Optimization.');
      } finally {
        setTogglingMap((prev) => ({ ...prev, [scannerId]: false }));
      }
    },
    []
  );

  const handleBulkToggleAutonomousOpt = useCallback(async (nextEnabled: boolean) => {
    setBulkToggling(true);
    try {
      const res = await fetch('/api/scanners/fleet-20/autonomous-optimization/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Unable to update fleet Autonomous Optimization`);
      }
      const data: Fleet20Response = await res.json();
      setFleetData(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to update Autonomous Optimization for fleet.');
    } finally {
      setBulkToggling(false);
    }
  }, []);

  const handleConfirmGlobalReset = useCallback(async () => {
    setResettingAll(true);
    try {
      const res = await fetch('/api/scanners/fleet-20/global-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Unable to perform Global Reset`);
      }
      const data: Fleet20Response = await res.json();
      setFleetData(data);
      setError(null);
      setShowGlobalResetConfirm(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to reset all 20 AI agents.');
    } finally {
      setResettingAll(false);
    }
  }, []);

  const handleResumeLiveFleet = useCallback(async () => {
    setResumingFleet(true);
    try {
      const res = await fetch('/api/scanners/fleet-20/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: Unable to resume live fleet scan`);
      }
      const data: Fleet20Response = await res.json();
      setFleetData(data);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to resume live scanning for 20 AI agents.');
    } finally {
      setResumingFleet(false);
    }
  }, []);

  useEffect(() => {
    if (!showGlobalResetConfirm) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !resettingAll) {
        setShowGlobalResetConfirm(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showGlobalResetConfirm, resettingAll]);

  useEffect(() => {
    fetchFleet(false);
    const interval = setInterval(() => fetchFleet(false), 5000);
    return () => clearInterval(interval);
  }, [fetchFleet]);

  const isFlushCleared = Boolean(fleetData?.session?.isFlushCleared);

  const allViewModels: AgentCardViewModel[] = useMemo(() => {
    if (!fleetData?.scanners) return [];
    return fleetData.scanners.map((report) =>
      buildAgentCardViewModel(report, isFlushCleared)
    );
  }, [fleetData, isFlushCleared]);

  const filteredAgents = useMemo(
    () => filterAndSortAgents(allViewModels, filters),
    [allViewModels, filters]
  );

  const fleetRisk = useMemo(
    () => computeFleetRiskSummary(allViewModels, fleetData),
    [allViewModels, fleetData]
  );

  const selectedAgentVm = useMemo(() => {
    return (
      allViewModels.find((vm) => vm.report.scannerId === selectedScannerId) ||
      filteredAgents[0] ||
      allViewModels[0] ||
      null
    );
  }, [allViewModels, filteredAgents, selectedScannerId]);

  const hasActiveFilters =
    filters.search.trim().length > 0 ||
    filters.gender !== 'ALL' ||
    filters.category !== 'ALL' ||
    filters.status !== 'ALL' ||
    filters.sortBy !== 'rank';

  const handleInspectAgent = (scannerId: string) => {
    setSelectedScannerId(scannerId);
    inspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // Surface styling tokens (60-30-10 neutral slate discipline, single elevation, 1px hairlines)
  const cardCls = isLight
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-[#0F172A] border-slate-800 text-slate-100';
  const mutedText = isLight ? 'text-slate-500' : 'text-slate-400';
  const subtleText = isLight ? 'text-slate-600' : 'text-slate-300';
  const dividerCls = isLight ? 'border-slate-200' : 'border-slate-800';
  const inputCls = isLight
    ? 'bg-white border-slate-200 text-slate-900 placeholder:text-slate-400 focus:border-sky-500'
    : 'bg-[#0B1120] border-slate-800 text-slate-100 placeholder:text-slate-500 focus:border-sky-500';
  const segWrapCls = isLight
    ? 'bg-slate-100 border border-slate-200'
    : 'bg-[#090E1A] border border-slate-800';

  const statusToneText = (tone: AgentCardViewModel['operationalStatus']['tone']) => {
    if (tone === 'emerald') return isLight ? 'text-emerald-700' : 'text-emerald-400';
    if (tone === 'sky') return isLight ? 'text-sky-700' : 'text-sky-400';
    if (tone === 'amber') return isLight ? 'text-amber-700' : 'text-amber-400';
    if (tone === 'rose') return isLight ? 'text-rose-700' : 'text-rose-400';
    return mutedText;
  };

  return (
    <div
      data-testid="agent-management-dashboard"
      className="space-y-6 font-body"
    >
      {/* Top Workspace Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <div className={`flex flex-wrap items-center gap-2 text-xs ${mutedText}`}>
            <span>Autonomous Trade Operations</span>
            <span aria-hidden="true">/</span>
            <span className="font-mono tabular-nums">
              {fleetData?.totalAiAgents ?? 20} Dedicated AI Agents
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {fleetData?.session?.phaseLabel || '09:20–15:15 IST Scan · 23:59 Flush'}
            </span>
            {fleetData?.marketVolatility && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  data-testid="fleet-market-volatility"
                  className={`inline-flex items-center gap-1 font-mono tabular-nums font-medium ${
                    fleetData.marketVolatility.regime === 'EXTREME'
                      ? isLight
                        ? 'text-rose-700'
                        : 'text-rose-400'
                      : fleetData.marketVolatility.regime === 'ELEVATED'
                      ? isLight
                        ? 'text-amber-700'
                        : 'text-amber-400'
                      : isLight
                      ? 'text-sky-700'
                      : 'text-sky-400'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>
                    India VIX {fleetData.marketVolatility.indiaVix.toFixed(2)} (
                    {fleetData.marketVolatility.regimeLabel})
                  </span>
                </span>
              </>
            )}
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight mt-1.5 text-balance">
            Agent Management
          </h1>
          <p className={`text-sm mt-1 max-w-3xl ${mutedText}`}>
            Live oversight of all 20 scanner-assigned AI agents (10 He, 10 She), their active stock
            lists, real-time stop-loss protection levels, and per-agent Autonomous Volatility
            Optimization.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {fleetData?.session?.timeIST && (
            <div className={`text-xs font-mono tabular-nums ${mutedText}`}>
              IST {fleetData.session.timeIST}
            </div>
          )}
          <button
            type="button"
            data-testid="bulk-auto-opt-btn"
            disabled={bulkToggling || loading}
            onClick={() =>
              handleBulkToggleAutonomousOpt(
                fleetRisk.autonomousOptimizedAgents < (fleetRisk.totalAgents || 20)
              )
            }
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-60 ${
              fleetRisk.autonomousOptimizedAgents > 0
                ? isLight
                  ? 'bg-sky-50 border-sky-300 text-sky-800 hover:bg-sky-100'
                  : 'bg-sky-500/15 border-sky-500/40 text-sky-300 hover:bg-sky-500/25'
                : isLight
                ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
                : 'bg-[#0F172A] border-slate-700 text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Activity className="w-3.5 h-3.5" aria-hidden="true" />
            <span>
              {bulkToggling
                ? 'Updating...'
                : fleetRisk.autonomousOptimizedAgents >= (fleetRisk.totalAgents || 20)
                ? 'Disable All Auto-Opt'
                : `Enable All Auto-Opt (${fleetRisk.autonomousOptimizedAgents}/20)`}
            </span>
          </button>
          <button
            type="button"
            data-testid="global-reset-btn"
            disabled={loading || resettingAll}
            onClick={() => setShowGlobalResetConfirm(true)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-60 ${
              isLight
                ? 'bg-rose-50 border-rose-300 text-rose-800 hover:bg-rose-100'
                : 'bg-rose-500/10 border-rose-500/35 text-rose-300 hover:bg-rose-500/20'
            }`}
          >
            <RotateCcw className={`w-3.5 h-3.5 ${resettingAll ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{resettingAll ? 'Resetting...' : 'Global Reset'}</span>
          </button>
          <button
            type="button"
            onClick={() => fetchFleet(true)}
            disabled={refreshing}
            className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
              isLight
                ? 'bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-60'
                : 'bg-sky-500 text-slate-950 hover:bg-sky-400 disabled:opacity-60'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{refreshing ? 'Refreshing...' : 'Refresh Agents'}</span>
          </button>
        </div>
      </div>

      {/* Active Global Reset Banner */}
      {fleetData?.globalReset?.active && (
        <div
          role="status"
          data-testid="global-reset-banner"
          className={`rounded-xl border px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isLight
              ? 'bg-amber-50 border-amber-200 text-amber-950'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-100'
          }`}
        >
          <div className="flex items-start sm:items-center gap-2.5 text-xs sm:text-sm">
            <RotateCcw className={`w-4 h-4 shrink-0 mt-0.5 sm:mt-0 ${isLight ? 'text-amber-700' : 'text-amber-400'}`} aria-hidden="true" />
            <div>
              <span className="font-semibold">Global Reset Active</span>
              <span className={isLight ? ' text-amber-800' : ' text-amber-200/90'}>
                {' '}— All 20 AI agent statuses, stop-loss levels, Autonomous Optimization switches, and profit counters were cleared
                {fleetData.globalReset.resetAtIST ? ` at ${fleetData.globalReset.resetAtIST} IST` : ''}.
              </span>
            </div>
          </div>
          <button
            type="button"
            data-testid="resume-fleet-btn"
            disabled={resumingFleet}
            onClick={handleResumeLiveFleet}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-60 ${
              isLight
                ? 'bg-slate-900 text-white hover:bg-slate-800'
                : 'bg-sky-500 text-slate-950 hover:bg-sky-400'
            }`}
          >
            <Play className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{resumingFleet ? 'Resuming...' : 'Resume Live Scan'}</span>
          </button>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div
          role="alert"
          className={`rounded-xl border px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isLight
              ? 'bg-rose-50 border-rose-200 text-rose-900'
              : 'bg-rose-950/30 border-rose-500/30 text-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5 text-sm">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchFleet(true)}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg border whitespace-nowrap shrink-0 cursor-pointer ${
              isLight
                ? 'bg-white border-rose-300 text-rose-800 hover:bg-rose-100'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-200 hover:bg-rose-500/25'
            }`}
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Fleet KPI Summary Strip (Single Elevation, Hairline Dividers, Zero Nested Cards) */}
      <section
        aria-label="Fleet stop-loss and agent status summary"
        className={`rounded-xl border grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 divide-y md:divide-y-0 md:divide-x ${cardCls} ${
          isLight ? 'divide-slate-200' : 'divide-slate-800'
        }`}
      >
        <div className="p-4">
          <div className={`text-xs ${mutedText}`}>Active Agents</div>
          <div className="font-mono tabular-nums text-xl font-semibold mt-1">
            {loading ? '—' : `${fleetRisk.activeAgents} / ${fleetRisk.totalAgents || 20}`}
          </div>
          <div className={`text-[11px] mt-0.5 ${mutedText}`}>
            {fleetData?.heAgentCount ?? 10} He · {fleetData?.sheAgentCount ?? 10} She
          </div>
        </div>

        <div className="p-4">
          <div className={`text-xs ${mutedText}`}>Managed Stock List</div>
          <div className="font-mono tabular-nums text-xl font-semibold mt-1">
            {loading ? '—' : fleetRisk.totalManagedStocks}
          </div>
          <div className={`text-[11px] mt-0.5 font-mono tabular-nums ${mutedText}`}>
            {fleetData?.fleetSummary?.totalUpPositions ?? 0} UP ·{' '}
            {fleetData?.fleetSummary?.totalDownPositions ?? 0} DOWN
          </div>
        </div>

        <div className="p-4">
          <div className={`text-xs ${mutedText}`}>Open Stop-Losses</div>
          <div className="font-mono tabular-nums text-xl font-semibold mt-1">
            {loading ? '—' : fleetRisk.totalOpenStopLosses}
          </div>
          <div
            data-testid="kpi-auto-opt-summary"
            className={`text-[11px] mt-0.5 font-mono tabular-nums ${
              fleetRisk.autonomousOptimizedAgents > 0
                ? isLight
                  ? 'text-sky-700 font-medium'
                  : 'text-sky-400 font-medium'
                : mutedText
            }`}
          >
            {fleetRisk.autonomousOptimizedAgents > 0
              ? `Auto-Opt ${fleetRisk.autonomousOptimizedAgents}/20 · ${fleetRisk.volatilityShiftedStopLosses} vol-shifted`
              : 'Auto-Opt 0/20 · Fixed ATR SL'}
          </div>
        </div>

        <div className="p-4">
          <div className={`text-xs ${mutedText}`}>Trailing SL Protected</div>
          <div
            className={`font-mono tabular-nums text-xl font-semibold mt-1 ${
              isLight ? 'text-emerald-700' : 'text-emerald-400'
            }`}
          >
            {loading ? '—' : fleetRisk.totalTrailingProtected}
          </div>
          <div className={`text-[11px] mt-0.5 ${mutedText}`}>Breakeven or T1 locked</div>
        </div>

        <div className="p-4">
          <div className={`text-xs ${mutedText}`}>Tight SL Watch (&le;1%)</div>
          <div
            className={`font-mono tabular-nums text-xl font-semibold mt-1 ${
              fleetRisk.totalTightSlAlerts > 0
                ? isLight
                  ? 'text-amber-700'
                  : 'text-amber-400'
                : ''
            }`}
          >
            {loading ? '—' : fleetRisk.totalTightSlAlerts}
          </div>
          <div className={`text-[11px] mt-0.5 ${mutedText}`}>
            {fleetRisk.totalSlExits} SL exits · {fleetRisk.totalTargetExits} T2 exits
          </div>
        </div>

        <div className="p-4">
          <div className={`text-xs ${mutedText}`}>Fleet Live P&amp;L</div>
          <div
            className={`font-mono tabular-nums text-xl font-semibold mt-1 ${
              fleetRisk.fleetLivePnlRs >= 0
                ? isLight
                  ? 'text-emerald-700'
                  : 'text-emerald-400'
                : isLight
                ? 'text-rose-700'
                : 'text-rose-400'
            }`}
          >
            {loading ? '—' : formatInrSigned(fleetRisk.fleetLivePnlRs)}
          </div>
          <div className={`text-[11px] mt-0.5 font-mono tabular-nums ${mutedText}`}>
            {fleetRisk.fleetWinRatePct.toFixed(1)}% win rate
          </div>
        </div>
      </section>

      {/* Filter & Search Toolbar */}
      <section
        aria-label="Filter and sort AI agents"
        className={`rounded-xl border p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3 ${cardCls}`}
      >
        {/* Search Input */}
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <label htmlFor="agent-mgmt-search" className="sr-only">
            Search agent name, scanner, or stock symbol
          </label>
          <Search
            className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${mutedText}`}
            aria-hidden="true"
          />
          <input
            id="agent-mgmt-search"
            type="search"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Search agent, assigned scanner, or stock symbol..."
            className={`w-full pl-9 pr-3 py-2 text-xs rounded-lg border outline-none transition-colors ${inputCls}`}
          />
        </div>

        {/* Segmented Filters & Selects */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Gender Segmented Control */}
          <div
            role="group"
            aria-label="Filter agents by He or She"
            className={`inline-flex items-center p-1 rounded-lg ${segWrapCls}`}
          >
            {(
              [
                { key: 'ALL', label: 'All 20' },
                { key: 'He', label: 'He (10)' },
                { key: 'She', label: 'She (10)' },
              ] as const
            ).map((g) => {
              const active = filters.gender === g.key;
              return (
                <button
                  key={g.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilters((f) => ({ ...f, gender: g.key }))}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                    active
                      ? isLight
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'bg-sky-500/20 text-sky-300'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {g.label}
                </button>
              );
            })}
          </div>

          {/* Operational / SL Status Segmented Control */}
          <div
            role="group"
            aria-label="Filter agents by stop-loss status"
            className={`inline-flex items-center p-1 rounded-lg overflow-x-auto max-w-full ${segWrapCls}`}
          >
            {(
              [
                { key: 'ALL', label: 'All Status' },
                { key: 'ACTIVE_OPEN', label: 'Open SL' },
                { key: 'TRAILING_SL', label: 'Trailing SL' },
                { key: 'WATCH_SL', label: 'Tight SL' },
                { key: 'AUTO_OPT', label: `Auto-Opt (${fleetRisk.autonomousOptimizedAgents})` },
                { key: 'STANDBY', label: 'Standby' },
              ] as Array<{ key: AgentStatusFilter; label: string }>
            ).map((s) => {
              const active = filters.status === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilters((f) => ({ ...f, status: s.key }))}
                  className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                    active
                      ? isLight
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'bg-sky-500/20 text-sky-300'
                      : isLight
                      ? 'text-slate-600 hover:text-slate-900'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* Category Select */}
          <div className="inline-flex items-center gap-1.5">
            <label htmlFor="agent-mgmt-category" className="sr-only">
              Scanner category
            </label>
            <select
              id="agent-mgmt-category"
              value={filters.category}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  category: e.target.value as 'ALL' | ScannerCategory20,
                }))
              }
              className={`px-3 py-2 text-xs font-medium rounded-lg border outline-none cursor-pointer ${inputCls}`}
            >
              <option value="ALL">All Categories</option>
              {(Object.keys(SCANNER_CATEGORY_LABELS) as ScannerCategory20[]).map((cat) => (
                <option key={cat} value={cat}>
                  {SCANNER_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Select */}
          <div className="inline-flex items-center gap-1.5">
            <SlidersHorizontal className={`w-3.5 h-3.5 ${mutedText}`} aria-hidden="true" />
            <label htmlFor="agent-mgmt-sort" className="sr-only">
              Sort agents
            </label>
            <select
              id="agent-mgmt-sort"
              value={filters.sortBy}
              onChange={(e) =>
                setFilters((f) => ({ ...f, sortBy: e.target.value as AgentSortOption }))
              }
              className={`px-3 py-2 text-xs font-medium rounded-lg border outline-none cursor-pointer ${inputCls}`}
            >
              <option value="rank">Sort: Scanner #01–#20</option>
              <option value="pnl_desc">Sort: Highest Live P&amp;L</option>
              <option value="trades_desc">Sort: Most Active Stocks</option>
              <option value="tightest_sl">Sort: Tightest SL Buffer</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isLight
                  ? 'border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'border-slate-700 text-slate-300 hover:bg-slate-800'
              }`}
            >
              Reset
            </button>
          )}
        </div>
      </section>

      {/* Session Performance Summary Table (Win/Loss Ratio & Total Profit Realized per AI Agent) */}
      <AgentPerformanceSummaryTable
        viewModels={filteredAgents}
        selectedScannerId={selectedAgentVm?.report.scannerId || selectedScannerId}
        onSelectAgent={handleInspectAgent}
        isLight={isLight}
        loading={loading}
        isFlushCleared={isFlushCleared}
      />

      {/* 20 AI Agents Grid */}
      <section aria-label="20 AI agents roster">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-base font-semibold">
            Assigned AI Agents ({loading ? '20' : filteredAgents.length} of{' '}
            {fleetData?.totalAiAgents ?? 20})
          </h2>
          <span className={`text-xs ${mutedText}`}>
            Select any agent to inspect its full stock list and stop-loss ladder
          </span>
        </div>

        {loading ? (
          <div
            data-testid="agent-management-skeleton"
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
          >
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className={`rounded-xl border p-4 h-[272px] animate-pulse ${cardCls}`}
              >
                <div className={`h-3 w-28 rounded ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                <div className={`h-5 w-40 rounded mt-3 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                <div className={`h-3 w-48 rounded mt-2 ${isLight ? 'bg-slate-200' : 'bg-slate-800'}`} />
                <div className={`h-24 w-full rounded mt-5 ${isLight ? 'bg-slate-100' : 'bg-slate-800/60'}`} />
              </div>
            ))}
          </div>
        ) : filteredAgents.length === 0 ? (
          <div className={`rounded-xl border p-10 text-center ${cardCls}`}>
            <p className="text-sm font-medium">No AI agents match the current filters.</p>
            <p className={`text-xs mt-1 ${mutedText}`}>
              Try clearing your search query or switching back to All 20 Agents.
            </p>
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className={`mt-4 px-4 py-2 text-xs font-medium rounded-lg cursor-pointer ${
                isLight
                  ? 'bg-slate-900 text-white hover:bg-slate-800'
                  : 'bg-sky-500 text-slate-950 hover:bg-sky-400'
              }`}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div
            data-testid="agent-management-grid"
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
          >
            {filteredAgents.map((vm) => {
              const { report, operationalStatus, stockPreviews } = vm;
              const isSelected = selectedAgentVm?.report.scannerId === report.scannerId;
              const previewRows = stockPreviews.slice(0, 3);
              const extraCount = Math.max(0, stockPreviews.length - previewRows.length);
              const pnlPos = report.summary.totalLivePnlRs >= 0;

              return (
                <article
                  key={report.scannerId}
                  data-testid={`agent-card-${report.scannerId}`}
                  className={`rounded-xl border p-4 flex flex-col justify-between transition-colors ${
                    isSelected
                      ? isLight
                        ? 'bg-sky-50/40 border-sky-500 ring-1 ring-sky-500/30 text-slate-900'
                        : 'bg-[#121E36] border-sky-400 ring-1 ring-sky-400/30 text-slate-100'
                      : isLight
                      ? 'bg-white border-slate-200 hover:border-slate-300 text-slate-900'
                      : 'bg-[#0F172A] border-slate-800 hover:border-slate-700 text-slate-100'
                  }`}
                >
                  <div>
                    {/* Quiet 1-line unboxed metadata kicker */}
                    <div className={`flex items-center justify-between gap-2 text-xs ${mutedText}`}>
                      <span className="font-mono tabular-nums">
                        {String(report.rank).padStart(2, '0')} · {report.agent.genderLabel}
                      </span>
                      <span className={`font-medium truncate ${statusToneText(operationalStatus.tone)}`}>
                        {operationalStatus.label}
                      </span>
                    </div>

                    {/* Agent Name & Assigned Scanner */}
                    <div className="mt-2">
                      <h3 className="font-display text-base font-semibold leading-snug">
                        {report.agent.name}
                      </h3>
                      <div
                        className={`text-xs mt-0.5 truncate ${subtleText}`}
                        title={`Assigned Scanner: ${report.scannerName}`}
                      >
                        Scanner: <span className="font-medium">{report.scannerName}</span>
                      </div>
                      <div className={`text-[11px] mt-0.5 ${mutedText}`}>
                        {vm.categoryLabel} · {report.summary.upCount} UP / {report.summary.downCount}{' '}
                        DOWN
                      </div>
                    </div>

                    {/* Active Stop-Loss Health Line */}
                    <div
                      className={`mt-3 pt-2.5 border-t flex items-center justify-between gap-2 text-[11px] ${dividerCls}`}
                    >
                      <span className={`inline-flex items-center gap-1 ${mutedText}`}>
                        {vm.tightSlAlertCount > 0 ? (
                          <ShieldAlert
                            className={`w-3.5 h-3.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}
                            aria-hidden="true"
                          />
                        ) : vm.trailedStopLossCount > 0 ? (
                          <ShieldCheck
                            className={`w-3.5 h-3.5 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}
                            aria-hidden="true"
                          />
                        ) : (
                          <Shield className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span className="font-mono tabular-nums">
                          {vm.openStopLossCount} Active SL · {vm.trailedStopLossCount} Trailed
                        </span>
                      </span>
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          pnlPos
                            ? isLight
                              ? 'text-emerald-700'
                              : 'text-emerald-400'
                            : isLight
                            ? 'text-rose-700'
                            : 'text-rose-400'
                        }`}
                      >
                        {formatInrSigned(report.summary.totalLivePnlRs)}
                      </span>
                    </div>

                    {/* Autonomous Volatility Optimization Switch Row */}
                    <div
                      className={`mt-2.5 pt-2.5 border-t flex items-center justify-between gap-2 ${dividerCls}`}
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium leading-tight flex items-center gap-1.5">
                          <span>Autonomous Opt</span>
                          {vm.autonomousOptimization && (
                            <span
                              className={`font-mono tabular-nums text-[10px] font-semibold ${
                                isLight ? 'text-sky-700' : 'text-sky-400'
                              }`}
                            >
                              ON
                            </span>
                          )}
                        </div>
                        <div className={`text-[10px] font-mono tabular-nums truncate mt-0.5 ${mutedText}`}>
                          {vm.autonomousOptimization
                            ? `Vol ×${(report.agent.volatilityMultiplier ?? 1).toFixed(2)} · ${vm.slShiftedCount} SL shifted`
                            : `Fixed ATR ×${report.agent.atrSlMultiplier}`}
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={vm.autonomousOptimization}
                        aria-label={`Toggle Autonomous Optimization for ${report.agent.name}`}
                        data-testid={`auto-opt-toggle-${report.scannerId}`}
                        disabled={Boolean(togglingMap[report.scannerId]) || bulkToggling}
                        onClick={() =>
                          handleToggleAutonomousOpt(
                            report.scannerId,
                            !vm.autonomousOptimization
                          )
                        }
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-60 ${
                          vm.autonomousOptimization
                            ? isLight
                              ? 'bg-sky-600 border-sky-600'
                              : 'bg-sky-500 border-sky-400'
                            : isLight
                            ? 'bg-slate-200 border-slate-300'
                            : 'bg-slate-800 border-slate-700'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                            vm.autonomousOptimization ? 'translate-x-4' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Stock List & Active Stop-Loss Preview (Unboxed Tabular Rows) */}
                    <div className={`mt-2.5 pt-2 border-t ${dividerCls}`}>
                      {previewRows.length === 0 ? (
                        <div className={`py-4 text-center text-[11px] ${mutedText}`}>
                          {isFlushCleared
                            ? 'Cleared by 23:59 IST flush'
                            : '0 eligible stocks — zero fake signals'}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div className={`flex items-center justify-between text-[10px] ${mutedText}`}>
                            <span>Stock List</span>
                            <span>{vm.autonomousOptimization ? 'Vol SL · Buffer' : 'Active SL · Buffer'}</span>
                          </div>
                          {previewRows.map((item) => {
                            const isBuy = item.side === 'BUY';
                            return (
                              <div
                                key={`${report.scannerId}-${item.symbol}`}
                                className="flex items-center justify-between gap-2 text-[11px]"
                              >
                                <div className="flex items-center gap-1 min-w-0">
                                  {isBuy ? (
                                    <ArrowUpRight
                                      className={`w-3 h-3 shrink-0 ${
                                        isLight ? 'text-emerald-600' : 'text-emerald-400'
                                      }`}
                                      aria-hidden="true"
                                    />
                                  ) : (
                                    <ArrowDownRight
                                      className={`w-3 h-3 shrink-0 ${
                                        isLight ? 'text-rose-600' : 'text-rose-400'
                                      }`}
                                      aria-hidden="true"
                                    />
                                  )}
                                  <span className="font-medium truncate">{item.symbol}</span>
                                </div>
                                <div className="font-mono tabular-nums text-right shrink-0 flex items-center gap-1.5">
                                  <span
                                    data-testid={`card-sl-${report.scannerId}-${item.symbol}`}
                                    className={
                                      item.volatilityAdjusted
                                        ? isLight
                                          ? 'text-sky-700 font-semibold'
                                          : 'text-sky-400 font-semibold'
                                        : item.metrics.slTightened
                                        ? isLight
                                          ? 'text-emerald-700 font-medium'
                                          : 'text-emerald-400 font-medium'
                                        : isLight
                                        ? 'text-amber-700 font-medium'
                                        : 'text-amber-300 font-medium'
                                    }
                                    title={
                                      item.volatilityAdjusted
                                        ? `Volatility-shifted SL (Base ${formatPriceInr(item.baseStopLoss)}, ${item.slShiftDirection.toLowerCase()})`
                                        : undefined
                                    }
                                  >
                                    {formatPriceInr(item.activeStopLoss)}
                                  </span>
                                  <span className={`text-[10px] ${mutedText}`}>
                                    {item.isClosed
                                      ? 'Exit'
                                      : `${item.metrics.slDistancePct.toFixed(1)}%`}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                          {extraCount > 0 && (
                            <div className={`text-[10px] font-mono tabular-nums pt-0.5 ${mutedText}`}>
                              +{extraCount} more managed {extraCount === 1 ? 'stock' : 'stocks'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Single Primary Card Action */}
                  <div className={`mt-3 pt-2.5 border-t ${dividerCls}`}>
                    <button
                      type="button"
                      onClick={() => handleInspectAgent(report.scannerId)}
                      aria-label={`Inspect stock list and stop-loss levels for ${report.agent.name}`}
                      className={`w-full py-2 px-3 rounded-lg text-xs font-medium inline-flex items-center justify-between transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                        isSelected
                          ? isLight
                            ? 'bg-slate-900 text-white'
                            : 'bg-sky-500 text-slate-950 font-semibold'
                          : isLight
                          ? 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                          : 'bg-slate-800/80 text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <span>{isSelected ? 'Viewing Stop-Loss Ladder' : 'Inspect Stock List & SL'}</span>
                      <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Full Selected Agent Stock List & Active Stop-Loss Ladder */}
      <div ref={inspectorRef}>
        {selectedAgentVm && (
          <AgentStopLossLadder
            agentVm={selectedAgentVm}
            marketVolatility={fleetData?.marketVolatility}
            isFlushCleared={isFlushCleared}
            isLight={isLight}
            isTogglingAutoOpt={
              Boolean(togglingMap[selectedAgentVm.report.scannerId]) || bulkToggling
            }
            onToggleAutonomousOpt={(nextEnabled) =>
              handleToggleAutonomousOpt(selectedAgentVm.report.scannerId, nextEnabled)
            }
            onSelectSymbol={onSelectSymbol}
          />
        )}
      </div>

      {/* Global Reset Confirmation Dialog */}
      {showGlobalResetConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80"
          onClick={(e) => {
            if (e.target === e.currentTarget && !resettingAll) {
              setShowGlobalResetConfirm(false);
            }
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="global-reset-dialog-title"
            aria-describedby="global-reset-dialog-desc"
            data-testid="global-reset-dialog"
            className={`w-full max-w-md rounded-xl border p-6 shadow-2xl ${
              isLight
                ? 'bg-white border-slate-200 text-slate-900'
                : 'bg-[#0F172A] border-slate-700 text-slate-100'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`p-2 rounded-lg border ${
                    isLight
                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                      : 'bg-rose-500/15 border-rose-500/35 text-rose-400'
                  }`}
                >
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                </div>
                <div>
                  <h2
                    id="global-reset-dialog-title"
                    className="font-display text-base font-semibold tracking-tight"
                  >
                    Confirm Global Reset (All 20 Agents)
                  </h2>
                  <p className={`text-xs mt-0.5 ${mutedText}`}>
                    Resets fleet statuses, stop-loss levels, and session profit counters
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close confirmation dialog"
                disabled={resettingAll}
                onClick={() => setShowGlobalResetConfirm(false)}
                className={`p-1 rounded-lg transition-colors cursor-pointer ${
                  isLight
                    ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'
                }`}
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div id="global-reset-dialog-desc" className={`mt-4 space-y-3 text-xs leading-relaxed ${subtleText}`}>
              <p>
                This action will immediately reset all{' '}
                <strong className="font-semibold">20 AI agents</strong> to a clean standby baseline:
              </p>
              <ul
                className={`rounded-lg border p-3.5 space-y-2 font-mono tabular-nums text-[11.5px] ${
                  isLight
                    ? 'bg-slate-50 border-slate-200 text-slate-700'
                    : 'bg-[#0B1120] border-slate-800 text-slate-300'
                }`}
              >
                <li className="flex items-center justify-between gap-2">
                  <span>Agent Statuses</span>
                  <span className="font-semibold">{fleetRisk.activeAgents}/20 → Reset · Standby</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>Active / Trailed Stop-Losses</span>
                  <span className="font-semibold">
                    {fleetRisk.totalOpenStopLosses} open ({fleetRisk.totalTrailingProtected} trailed) → 0
                  </span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>Autonomous Volatility Opt</span>
                  <span className="font-semibold">
                    {fleetRisk.autonomousOptimizedAgents}/20 ON → 0/20 Fixed ATR
                  </span>
                </li>
                <li className="flex items-center justify-between gap-2">
                  <span>Profit &amp; Win/Loss Counters</span>
                  <span className="font-semibold">
                    {formatInrSigned(fleetRisk.fleetLivePnlRs)} → ₹0 (0W / 0L)
                  </span>
                </li>
              </ul>
              <p className={mutedText}>
                Live scanning stays paused in Standby until you click{' '}
                <strong className={subtleText}>Resume Live Scan</strong>.
              </p>
            </div>

            <div className={`mt-5 pt-4 border-t flex items-center justify-end gap-2.5 ${dividerCls}`}>
              <button
                type="button"
                data-testid="global-reset-cancel-btn"
                disabled={resettingAll}
                onClick={() => setShowGlobalResetConfirm(false)}
                className={`px-3.5 py-2 text-xs font-medium rounded-lg border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                    : 'bg-[#0B1120] border-slate-700 text-slate-200 hover:bg-slate-800'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                data-testid="global-reset-confirm-btn"
                disabled={resettingAll}
                onClick={handleConfirmGlobalReset}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-60"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${resettingAll ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span>{resettingAll ? 'Resetting Fleet...' : 'Confirm Global Reset'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
