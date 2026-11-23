import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  ShieldAlert,
  ShieldCheck,
  Shield,
} from 'lucide-react';
import {
  AgentCardViewModel,
  AgentManagedTrade,
  computeTradeStopLossMetrics,
  formatInrSigned,
  formatPriceInr,
  MarketVolatilityContext,
} from '../utils/agentManagement';

interface AgentStopLossLadderProps {
  agentVm: AgentCardViewModel;
  marketVolatility?: MarketVolatilityContext;
  isFlushCleared: boolean;
  isLight: boolean;
  isTogglingAutoOpt?: boolean;
  onToggleAutonomousOpt?: (nextEnabled: boolean) => void;
  onSelectSymbol?: (symbol: string) => void;
}

export const AgentStopLossLadder: React.FC<AgentStopLossLadderProps> = ({
  agentVm,
  marketVolatility,
  isFlushCleared,
  isLight,
  isTogglingAutoOpt = false,
  onToggleAutonomousOpt,
  onSelectSymbol,
}) => {
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [onlyOpenSl, setOnlyOpenSl] = useState<boolean>(false);

  const { report } = agentVm;
  const autoOptOn = agentVm.autonomousOptimization;

  const displayedTrades = useMemo(() => {
    const base: AgentManagedTrade[] =
      sideFilter === 'BUY'
        ? report.upTrades
        : sideFilter === 'SELL'
        ? report.downTrades
        : report.allTrades;

    if (!onlyOpenSl) return base;
    return base.filter((t) => !t.isClosed);
  }, [report.allTrades, report.downTrades, report.upTrades, sideFilter, onlyOpenSl]);

  const surfaceCls = isLight
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-[#0F172A] border-slate-800 text-slate-100';
  const mutedText = isLight ? 'text-slate-500' : 'text-slate-400';
  const dividerCls = isLight ? 'border-slate-200' : 'border-slate-800';
  const tableHeaderBg = isLight ? 'bg-slate-50 text-slate-600' : 'bg-[#0B1120] text-slate-400';
  const rowHoverCls = isLight ? 'hover:bg-slate-50/90' : 'hover:bg-slate-800/40';
  const segWrapCls = isLight
    ? 'bg-slate-100 border border-slate-200'
    : 'bg-[#090E1A] border border-slate-800';

  return (
    <section
      aria-label={`Stock list and active stop-loss levels for ${report.agent.name}`}
      data-testid="agent-stop-loss-inspector"
      className={`rounded-xl border transition-colors ${surfaceCls}`}
    >
      {/* Inspector Header */}
      <div className={`px-5 py-4 border-b flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${dividerCls}`}>
        <div className="min-w-0">
          <div className={`flex flex-wrap items-center gap-2 text-xs ${mutedText}`}>
            <span className="font-mono tabular-nums font-medium">
              Scanner {String(report.rank).padStart(2, '0')}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{report.agent.agentId}</span>
            <span aria-hidden="true">·</span>
            <span>{agentVm.categoryLabel}</span>
            <span aria-hidden="true">·</span>
            <span
              className={
                agentVm.operationalStatus.tone === 'emerald'
                  ? isLight
                    ? 'text-emerald-700 font-medium'
                    : 'text-emerald-400 font-medium'
                  : agentVm.operationalStatus.tone === 'sky'
                  ? isLight
                    ? 'text-sky-700 font-medium'
                    : 'text-sky-400 font-medium'
                  : agentVm.operationalStatus.tone === 'rose'
                  ? isLight
                    ? 'text-rose-700 font-medium'
                    : 'text-rose-400 font-medium'
                  : mutedText
              }
            >
              {agentVm.operationalStatus.label}
            </span>
          </div>

          <h3 className="text-lg font-semibold tracking-tight mt-1">
            {report.agent.name} ({report.agent.genderLabel}) — {report.scannerName}
          </h3>

          <p className={`text-xs mt-1 leading-relaxed ${mutedText}`}>
            {report.agent.role} · Risk {report.agent.riskPerTradePct}% per trade ·{' '}
            {autoOptOn ? (
              <span className={isLight ? 'text-sky-700 font-medium' : 'text-sky-400 font-medium'}>
                Volatility-Adjusted ATR SL ×
                {(report.agent.effectiveAtrSlMultiplier ?? report.agent.atrSlMultiplier).toFixed(2)}{' '}
                (Base ×{report.agent.atrSlMultiplier} · VIX{' '}
                {marketVolatility ? marketVolatility.indiaVix.toFixed(2) : '—'})
              </span>
            ) : (
              <>ATR SL ×{report.agent.atrSlMultiplier}</>
            )}{' '}
            · Breakeven trail at +{report.agent.trailBreakevenR}R · Targets {report.agent.target1R}R
            / {report.agent.target2R}R
          </p>
        </div>

        {/* Autonomous Optimization Toggle, Side Filter & Open SL Toggle */}
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {onToggleAutonomousOpt && (
            <div
              className={`inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg border text-xs ${
                autoOptOn
                  ? isLight
                    ? 'bg-sky-50 border-sky-300 text-sky-900'
                    : 'bg-sky-500/10 border-sky-500/40 text-sky-200'
                  : isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-700'
                  : 'bg-[#0B1120] border-slate-800 text-slate-300'
              }`}
            >
              <Activity
                className={`w-3.5 h-3.5 shrink-0 ${
                  autoOptOn ? (isLight ? 'text-sky-600' : 'text-sky-400') : mutedText
                }`}
                aria-hidden="true"
              />
              <span className="font-medium whitespace-nowrap">
                Autonomous Opt
                {autoOptOn && (
                  <span className="ml-1.5 font-mono tabular-nums text-[11px] opacity-85">
                    ×{(report.agent.volatilityMultiplier ?? 1).toFixed(2)}
                  </span>
                )}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={autoOptOn}
                aria-label={`Toggle Autonomous Optimization for ${report.agent.name} in Stop-Loss Ladder`}
                data-testid="inspector-auto-opt-toggle"
                disabled={isTogglingAutoOpt}
                onClick={() => onToggleAutonomousOpt(!autoOptOn)}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:opacity-60 ${
                  autoOptOn
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
                    autoOptOn ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          )}

          <div
            role="group"
            aria-label="Filter stock list by direction"
            className={`inline-flex items-center p-1 rounded-lg ${segWrapCls}`}
          >
            {(
              [
                { key: 'ALL', label: `All (${report.summary.totalManaged})` },
                { key: 'BUY', label: `Buy UP (${report.summary.upCount})` },
                { key: 'SELL', label: `Sell DOWN (${report.summary.downCount})` },
              ] as const
            ).map((opt) => {
              const active = sideFilter === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setSideFilter(opt.key)}
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
                  {opt.label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            aria-pressed={onlyOpenSl}
            onClick={() => setOnlyOpenSl((prev) => !prev)}
            className={`px-3 py-2 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
              onlyOpenSl
                ? isLight
                  ? 'bg-sky-50 border-sky-300 text-sky-800'
                  : 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                : isLight
                ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                : 'bg-[#0B1120] border-slate-800 text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            {onlyOpenSl ? 'Showing Open SLs Only' : 'Open Stop-Losses Only'}
          </button>
        </div>
      </div>

      {/* Summary Strip for Selected Agent */}
      <div
        className={`grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x border-b text-xs ${
          isLight ? 'divide-slate-200 border-slate-200 bg-slate-50/50' : 'divide-slate-800 border-slate-800 bg-[#0B1120]/60'
        }`}
      >
        <div className="px-5 py-3">
          <div className={mutedText}>Open Stop-Losses</div>
          <div className="font-mono tabular-nums text-sm font-semibold mt-0.5">
            {agentVm.openStopLossCount} open · {agentVm.trailedStopLossCount} trailed
          </div>
        </div>
        <div className="px-5 py-3">
          <div className={mutedText}>Tightest SL Buffer</div>
          <div
            className={`font-mono tabular-nums text-sm font-semibold mt-0.5 ${
              agentVm.tightestOpenTrade?.metrics.riskProximity === 'CRITICAL'
                ? isLight
                  ? 'text-rose-700'
                  : 'text-rose-400'
                : agentVm.tightestOpenTrade?.metrics.riskProximity === 'WATCH'
                ? isLight
                  ? 'text-amber-700'
                  : 'text-amber-400'
                : ''
            }`}
          >
            {agentVm.tightestOpenTrade
              ? `${agentVm.tightestOpenTrade.symbol} (${agentVm.tightestOpenTrade.metrics.slDistancePct.toFixed(2)}%)`
              : 'No open SL risk'}
          </div>
        </div>
        <div className="px-5 py-3">
          <div className={mutedText}>Targets / SL Exits</div>
          <div className="font-mono tabular-nums text-sm font-semibold mt-0.5">
            {report.summary.targetHitCount} T2 hit · {report.summary.slHitCount} SL hit
          </div>
        </div>
        <div className="px-5 py-3">
          <div className={mutedText}>Agent Live P&amp;L</div>
          <div
            className={`font-mono tabular-nums text-sm font-semibold mt-0.5 ${
              report.summary.totalLivePnlRs >= 0
                ? isLight
                  ? 'text-emerald-700'
                  : 'text-emerald-400'
                : isLight
                ? 'text-rose-700'
                : 'text-rose-400'
            }`}
          >
            {formatInrSigned(report.summary.totalLivePnlRs)} ({report.summary.winRatePct.toFixed(1)}% win)
          </div>
        </div>
      </div>

      {/* Stock List & Active Stop-Loss Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className={`border-b ${dividerCls} ${tableHeaderBg}`}>
              <th className="py-2.5 px-4 font-medium whitespace-nowrap">Stock &amp; Qty</th>
              <th className="py-2.5 px-3 font-medium whitespace-nowrap">Direction</th>
              <th className="py-2.5 px-3 font-medium whitespace-nowrap">Listed At (Z→A)</th>
              <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Entry / LTP</th>
              <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Active SL / Init SL</th>
              <th className="py-2.5 px-3 font-medium whitespace-nowrap min-w-[200px]">
                Stop-Loss Cushion &amp; Ladder
              </th>
              <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Targets (T1 / T2)</th>
              <th className="py-2.5 px-3 font-medium text-right whitespace-nowrap">Live R / P&amp;L</th>
              <th className="py-2.5 px-4 font-medium whitespace-nowrap">Stop-Loss Directive</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isLight ? 'divide-slate-200/80' : 'divide-slate-800/80'}`}>
            {isFlushCleared ? (
              <tr>
                <td colSpan={9} className={`py-10 px-6 text-center ${mutedText}`}>
                  23:59 IST daily flush is active. All 20 AI agents and their stock lists reset cleanly
                  until the next market day scan at 09:20 IST.
                </td>
              </tr>
            ) : displayedTrades.length === 0 ? (
              <tr>
                <td colSpan={9} className={`py-10 px-6 text-center ${mutedText}`}>
                  {onlyOpenSl
                    ? `No open stop-loss positions remain in this filter for ${report.agent.name}.`
                    : `Zero eligible stocks match ${report.scannerName}'s formula and Rule 3 thresholds (RVOL > 2.00, Vol Bazaar X-Time > 1.00X, ADX 25+). No placeholder signals are shown.`}
                </td>
              </tr>
            ) : (
              displayedTrades.map((trade) => {
                const m = computeTradeStopLossMetrics(trade);
                const isBuy = trade.side === 'BUY';
                const pnlPos = trade.livePnlRs >= 0;

                const cushionTextCls =
                  m.riskProximity === 'CLOSED'
                    ? mutedText
                    : m.riskProximity === 'CRITICAL'
                    ? isLight
                      ? 'text-rose-700 font-semibold'
                      : 'text-rose-400 font-semibold'
                    : m.riskProximity === 'WATCH'
                    ? isLight
                      ? 'text-amber-700 font-semibold'
                      : 'text-amber-400 font-semibold'
                    : isLight
                    ? 'text-emerald-700 font-medium'
                    : 'text-emerald-400 font-medium';

                return (
                  <tr
                    key={`${trade.scannerId}-${trade.symbol}-${trade.side}`}
                    className={`transition-colors ${rowHoverCls}`}
                  >
                    <td className="py-3 px-4 align-top">
                      {onSelectSymbol ? (
                        <button
                          type="button"
                          onClick={() => onSelectSymbol(trade.symbol)}
                          className="font-semibold text-left hover:text-sky-400 transition-colors cursor-pointer focus-visible:outline-none focus-visible:underline"
                        >
                          {trade.symbol}
                        </button>
                      ) : (
                        <div className="font-semibold">{trade.symbol}</div>
                      )}
                      <div className={`text-[11px] mt-0.5 font-mono tabular-nums ${mutedText}`}>
                        {trade.sector} · Qty {trade.positionQty}
                      </div>
                    </td>

                    <td className="py-3 px-3 align-top whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 font-medium ${
                          isBuy
                            ? isLight
                              ? 'text-emerald-700'
                              : 'text-emerald-400'
                            : isLight
                            ? 'text-rose-700'
                            : 'text-rose-400'
                        }`}
                      >
                        {isBuy ? (
                          <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <ArrowDownRight className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        {isBuy ? 'Buy (UP)' : 'Sell (DOWN)'}
                      </span>
                    </td>

                    <td className="py-3 px-3 align-top font-mono tabular-nums whitespace-nowrap">
                      <div>{trade.listedAt || '--:--:--'}</div>
                      <div className={`text-[11px] mt-0.5 ${mutedText}`}>
                        RVOL {trade.rvol.toFixed(1)} · ADX {trade.adx.toFixed(0)}
                      </div>
                    </td>

                    <td className="py-3 px-3 align-top text-right font-mono tabular-nums whitespace-nowrap">
                      <div className="font-medium">{formatPriceInr(trade.entryPrice)}</div>
                      <div
                        className={`text-[11px] mt-0.5 ${
                          trade.changePercent >= 0
                            ? isLight
                              ? 'text-emerald-700'
                              : 'text-emerald-400'
                            : isLight
                            ? 'text-rose-700'
                            : 'text-rose-400'
                        }`}
                      >
                        LTP {formatPriceInr(trade.liveLtp)} ({trade.changePercent >= 0 ? '+' : ''}
                        {trade.changePercent.toFixed(2)}%)
                      </div>
                    </td>

                    <td className="py-3 px-3 align-top text-right font-mono tabular-nums whitespace-nowrap">
                      <div
                        data-testid={`inspector-sl-${trade.symbol}`}
                        className={`font-semibold ${
                          trade.volatilityAdjusted
                            ? isLight
                              ? 'text-sky-700'
                              : 'text-sky-400'
                            : m.slTightened
                            ? isLight
                              ? 'text-emerald-700'
                              : 'text-emerald-400'
                            : isLight
                            ? 'text-amber-700'
                            : 'text-amber-400'
                        }`}
                      >
                        {formatPriceInr(trade.activeStopLoss)}
                      </div>
                      {trade.volatilityAdjusted ? (
                        <div
                          className={`text-[10.5px] mt-0.5 ${
                            isLight ? 'text-sky-700' : 'text-sky-300/90'
                          }`}
                        >
                          Vol {trade.slShiftDirection === 'WIDENED' ? 'widened' : 'tightened'} · Base{' '}
                          {formatPriceInr(trade.baseStopLoss ?? trade.initialStopLoss)}
                        </div>
                      ) : (
                        <div className={`text-[11px] mt-0.5 ${mutedText}`}>
                          Init {formatPriceInr(trade.initialStopLoss)}
                        </div>
                      )}
                    </td>

                    <td className="py-3 px-3 align-top">
                      <div className="flex items-center justify-between gap-2 text-[11px] mb-1.5">
                        <span className="inline-flex items-center gap-1 font-medium">
                          {m.slTightened ? (
                            <ShieldCheck
                              className={`w-3.5 h-3.5 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`}
                              aria-hidden="true"
                            />
                          ) : m.riskProximity === 'CRITICAL' ? (
                            <ShieldAlert
                              className={`w-3.5 h-3.5 ${isLight ? 'text-rose-600' : 'text-rose-400'}`}
                              aria-hidden="true"
                            />
                          ) : (
                            <Shield
                              className={`w-3.5 h-3.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`}
                              aria-hidden="true"
                            />
                          )}
                          <span>{m.slStageLabel}</span>
                        </span>
                        <span className={`font-mono tabular-nums ${cushionTextCls}`}>
                          {m.riskProximity === 'CLOSED'
                            ? 'Closed'
                            : `${m.slDistancePct >= 0 ? '+' : ''}${m.slDistancePct.toFixed(2)}% buffer`}
                        </span>
                      </div>

                      {/* Visual Stop-Loss -> Entry -> LTP -> Target2 Track */}
                      <div
                        className={`relative h-2 rounded-full overflow-hidden ${
                          isLight ? 'bg-slate-200' : 'bg-slate-800'
                        }`}
                        role="img"
                        aria-label={`Price position ${m.ltpMarkerPct}% between initial stop-loss and target 2; active stop-loss at ${m.activeSlMarkerPct}%`}
                      >
                        {/* Protected trailed zone between Initial SL and Active SL */}
                        {m.activeSlMarkerPct > 0 && (
                          <div
                            className="absolute inset-y-0 left-0 bg-emerald-500/35"
                            style={{ width: `${m.activeSlMarkerPct}%` }}
                          />
                        )}
                        {/* Active SL marker */}
                        <div
                          className="absolute inset-y-0 w-0.5 bg-amber-400"
                          style={{ left: `${m.activeSlMarkerPct}%` }}
                        />
                        {/* Entry marker */}
                        <div
                          className={`absolute inset-y-0 w-0.5 ${isLight ? 'bg-slate-500' : 'bg-slate-400'}`}
                          style={{ left: `${m.entryMarkerPct}%` }}
                        />
                        {/* Current LTP marker */}
                        <div
                          className={`absolute top-0 bottom-0 w-1.5 rounded-full -ml-[3px] ${
                            m.riskProximity === 'CRITICAL'
                              ? 'bg-rose-500'
                              : pnlPos
                              ? 'bg-emerald-500'
                              : 'bg-sky-400'
                          }`}
                          style={{ left: `${m.ltpMarkerPct}%` }}
                        />
                      </div>
                    </td>

                    <td className="py-3 px-3 align-top text-right font-mono tabular-nums whitespace-nowrap">
                      <div className={mutedText}>T1 {formatPriceInr(trade.target1)}</div>
                      <div className={`mt-0.5 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                        T2 {formatPriceInr(trade.target2)}
                      </div>
                    </td>

                    <td className="py-3 px-3 align-top text-right font-mono tabular-nums whitespace-nowrap">
                      <div
                        className={`font-semibold ${
                          pnlPos
                            ? isLight
                              ? 'text-emerald-700'
                              : 'text-emerald-400'
                            : isLight
                            ? 'text-rose-700'
                            : 'text-rose-400'
                        }`}
                      >
                        {trade.liveRMultiple >= 0 ? '+' : ''}
                        {trade.liveRMultiple.toFixed(2)}R
                      </div>
                      <div
                        className={`text-[11px] mt-0.5 ${
                          pnlPos
                            ? isLight
                              ? 'text-emerald-700'
                              : 'text-emerald-400'
                            : isLight
                            ? 'text-rose-700'
                            : 'text-rose-400'
                        }`}
                      >
                        {formatInrSigned(trade.livePnlRs)}
                      </div>
                    </td>

                    <td className="py-3 px-4 align-top max-w-[260px]">
                      <div className="font-medium truncate" title={trade.actionBadge}>
                        {trade.actionBadge}
                      </div>
                      <div className={`text-[11px] mt-0.5 line-clamp-2 ${mutedText}`} title={trade.agentDirective}>
                        {trade.agentDirective}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};
