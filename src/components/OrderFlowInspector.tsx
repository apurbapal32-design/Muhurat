import React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Layers,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react';
import type { OrderFlowSignalRow } from '../../server/orderFlowScannerEngine';

interface OrderFlowInspectorProps {
  row: OrderFlowSignalRow;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
  onClose?: () => void;
  onInspectStock?: (symbol: string) => void;
}

function fmtInr(v: number): string {
  if (!Number.isFinite(v)) return '₹0.00';
  return `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtCompactVol(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}${(abs / 1e7).toFixed(2)}Cr`;
  if (abs >= 1e5) return `${sign}${(abs / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${Math.round(abs)}`;
}

export const OrderFlowInspector: React.FC<OrderFlowInspectorProps> = ({
  row,
  theme = 'dark',
  onClose,
  onInspectStock,
}) => {
  const isLight = theme === 'light';
  const isBuy = row.direction === 'BUY';
  const vp = row.volumeProfile;
  const fp = row.footprint;
  const sig = row.signals;

  const panelBg = isLight
    ? 'bg-white border-slate-200 text-slate-900'
    : 'bg-[#0f172a] border-slate-800 text-slate-100';
  const subSurface = isLight
    ? 'bg-slate-50 border-slate-200'
    : 'bg-[#0b1120] border-slate-800';
  const mutedText = isLight ? 'text-slate-600' : 'text-slate-400';

  // Pure SVG geometry for Step 1 Volume Profile histogram (zero inline styles)
  const svgW = 360;
  const rowH = 22;
  const padTop = 8;
  const padBottom = 8;
  const priceColW = 74;
  const barAreaX = priceColW + 6;
  const barAreaW = 200;
  const svgH = padTop + vp.bins.length * rowH + padBottom;

  return (
    <section
      data-testid="order-flow-inspector"
      aria-label={`3-Step Order Flow Inspector for ${row.symbol}`}
      className={`rounded-xl border ${panelBg} overflow-hidden`}
    >
      {/* Top Bar: Stock Identity + Rudra AI Trade Plan */}
      <div
        className={`px-4 py-3 border-b ${
          isLight ? 'border-slate-200 bg-slate-50' : 'border-slate-800 bg-[#0b1120]'
        } flex flex-col lg:flex-row lg:items-center justify-between gap-3`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold tracking-tight">
              {row.symbol}
            </span>
            <span className={`text-xs ${mutedText}`}>{row.name}</span>
            <span aria-hidden="true" className={mutedText}>·</span>
            <span
              className={`text-xs font-mono tabular-nums font-semibold ${
                isBuy ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {isBuy ? 'ORDER FLOW UP' : 'ORDER FLOW DOWN'}
            </span>
            <span aria-hidden="true" className={mutedText}>·</span>
            <span className="text-xs font-mono tabular-nums font-semibold">
              {fmtInr(row.price)} ({row.changePercent >= 0 ? '+' : ''}
              {row.changePercent.toFixed(2)}%)
            </span>
            <span aria-hidden="true" className={mutedText}>·</span>
            <span className="text-xs font-mono tabular-nums text-sky-400 font-semibold">
              Score {row.orderFlowScore}/100 ({row.convictionGrade})
            </span>
          </div>
          <p className={`text-xs mt-1 ${mutedText}`}>{row.agentDirective}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0 text-xs">
          {onInspectStock && (
            <button
              type="button"
              onClick={() => onInspectStock(row.symbol)}
              className={`px-3 py-1.5 rounded-lg border font-medium transition-colors cursor-pointer ${
                isLight
                  ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-800'
                  : 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200'
              }`}
            >
              Full Stock Chart
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Order Flow Inspector"
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                isLight
                  ? 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
                  : 'border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-300'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 3-Column Step-by-Step Institutional Breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-12 divide-y xl:divide-y-0 xl:divide-x divide-slate-800">
        {/* ============================================================ */}
        {/* STEP 1: VOLUME PROFILE (VAH, VAL, POC, HVN, LVN)             */}
        {/* ============================================================ */}
        <div className="xl:col-span-4 p-4 space-y-3" data-testid="step1-volume-profile">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-sky-400 font-semibold">
                Step 1 · Volume Profile
              </div>
              <h3 className="text-sm font-semibold mt-0.5">
                VAH, VAL, POC &amp; Volume Nodes
              </h3>
            </div>
            <span className={`text-[11px] font-mono tabular-nums ${mutedText}`}>
              VA {vp.valueAreaVolumePct.toFixed(0)}%
            </span>
          </div>

          {/* Key Volume Profile Anchor Levels */}
          <div
            className={`grid grid-cols-3 divide-x divide-slate-800 border rounded-lg ${subSurface} text-xs`}
          >
            <div className="p-2">
              <div className={`text-[10px] ${mutedText}`}>VAH</div>
              <div className="font-mono tabular-nums font-semibold text-sky-400">
                {fmtInr(vp.vah)}
              </div>
            </div>
            <div className="p-2">
              <div className={`text-[10px] ${mutedText}`}>POC (Max Vol)</div>
              <div className="font-mono tabular-nums font-semibold text-amber-400">
                {fmtInr(vp.poc)}
              </div>
            </div>
            <div className="p-2">
              <div className={`text-[10px] ${mutedText}`}>VAL</div>
              <div className="font-mono tabular-nums font-semibold text-indigo-400">
                {fmtInr(vp.val)}
              </div>
            </div>
          </div>

          {/* Pure SVG Horizontal Volume Profile Histogram */}
          <div className={`rounded-lg border p-2 ${subSurface}`}>
            <svg
              viewBox={`0 0 ${svgW} ${svgH}`}
              className="w-full h-auto block"
              role="img"
              aria-label={`Volume profile histogram for ${row.symbol} showing VAH ${vp.vah}, POC ${vp.poc}, VAL ${vp.val}`}
            >
              {vp.bins.map((bin, idx) => {
                const y = padTop + idx * rowH;
                const totalW = Math.max(4, Math.round((bin.pctOfMax / 100) * barAreaW));
                const buyFrac =
                  bin.totalVolume > 0 ? bin.buyVolume / bin.totalVolume : 0.5;
                const buyW = Math.round(totalW * buyFrac);
                const sellW = Math.max(0, totalW - buyW);
                const barFillBuy = bin.isPoc
                  ? '#f59e0b'
                  : bin.nodeType === 'LVN'
                  ? '#38bdf8'
                  : bin.inValueArea
                  ? '#10b981'
                  : '#334155';
                const barFillSell = bin.isPoc
                  ? '#d97706'
                  : bin.nodeType === 'LVN'
                  ? '#0284c7'
                  : bin.inValueArea
                  ? '#f43f5e'
                  : '#1e293b';

                const tagText = bin.isPoc
                  ? 'POC'
                  : bin.isVah
                  ? 'VAH'
                  : bin.isVal
                  ? 'VAL'
                  : bin.nodeType === 'HVN'
                  ? 'HVN'
                  : bin.nodeType === 'LVN'
                  ? 'LVN'
                  : '';
                const tagFill = bin.isPoc
                  ? '#fbbf24'
                  : bin.isVah
                  ? '#38bdf8'
                  : bin.isVal
                  ? '#818cf8'
                  : bin.nodeType === 'HVN'
                  ? '#34d399'
                  : '#94a3b8';

                return (
                  <g key={`${bin.priceMid}-${idx}`}>
                    {bin.isCurrentPriceBin && (
                      <rect
                        x={0}
                        y={y - 1}
                        width={svgW}
                        height={rowH}
                        rx={3}
                        fill={isLight ? '#e0f2fe' : '#0c4a6e'}
                        fillOpacity={0.38}
                      />
                    )}
                    <text
                      x={priceColW}
                      y={y + 14}
                      textAnchor="end"
                      fill={
                        bin.isCurrentPriceBin
                          ? isLight
                            ? '#0369a1'
                            : '#38bdf8'
                          : isLight
                          ? '#475569'
                          : '#94a3b8'
                      }
                      fontSize="10"
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      fontWeight={bin.isCurrentPriceBin || bin.isPoc ? '700' : '400'}
                    >
                      {bin.priceMid.toFixed(1)}
                    </text>

                    {/* Buy volume segment */}
                    <rect
                      x={barAreaX}
                      y={y + 4}
                      width={buyW}
                      height={rowH - 8}
                      rx={2}
                      fill={barFillBuy}
                      fillOpacity={bin.inValueArea || bin.isPoc ? 0.92 : 0.65}
                    />
                    {/* Sell volume segment */}
                    {sellW > 0 && (
                      <rect
                        x={barAreaX + buyW}
                        y={y + 4}
                        width={sellW}
                        height={rowH - 8}
                        rx={1}
                        fill={barFillSell}
                        fillOpacity={bin.inValueArea || bin.isPoc ? 0.78 : 0.55}
                      />
                    )}

                    {/* Node & Level Label */}
                    {tagText && (
                      <text
                        x={barAreaX + barAreaW + 8}
                        y={y + 14}
                        fill={tagFill}
                        fontSize="10"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        fontWeight="700"
                      >
                        {tagText}
                      </text>
                    )}
                    {bin.isCurrentPriceBin && (
                      <text
                        x={svgW - 4}
                        y={y + 14}
                        textAnchor="end"
                        fill={isLight ? '#0284c7' : '#38bdf8'}
                        fontSize="9"
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        fontWeight="700"
                      >
                        LTP
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className={mutedText}>Auction Position</span>
              <span className="font-mono tabular-nums font-medium">{vp.priceZoneLabel}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={mutedText}>HVN (Acceptance)</span>
              <span className="font-mono tabular-nums text-emerald-400">
                {vp.hvnCount} nodes · Nearest {fmtInr(vp.nearestHvn)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className={mutedText}>LVN (Fast Move)</span>
              <span className="font-mono tabular-nums text-sky-400">
                {vp.lvnCount} nodes · Nearest {fmtInr(vp.nearestLvn)}
              </span>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* STEP 2: FOOTPRINT LADDER (SELLERS LEFT × BUYERS RIGHT)       */}
        {/* ============================================================ */}
        <div className="xl:col-span-4 p-4 space-y-3" data-testid="step2-footprint">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-sky-400 font-semibold">
                Step 2 · Footprint Ladder
              </div>
              <h3 className="text-sm font-semibold mt-0.5">
                Sellers (Left) &times; Buyers (Right)
              </h3>
            </div>
            <span className={`text-[11px] font-mono tabular-nums ${mutedText}`}>
              Tick {fp.tickStep.toFixed(2)}
            </span>
          </div>

          <div className={`rounded-lg border overflow-hidden ${subSurface}`}>
            <table className="w-full text-xs font-mono tabular-nums border-collapse">
              <thead>
                <tr
                  className={`border-b text-[10px] uppercase tracking-wider ${
                    isLight
                      ? 'border-slate-200 bg-slate-100 text-slate-600'
                      : 'border-slate-800 bg-slate-900/70 text-slate-400'
                  }`}
                >
                  <th className="py-2 px-2.5 text-right text-rose-400">
                    Sellers (Bid)
                  </th>
                  <th className="py-2 px-2 text-center">Price</th>
                  <th className="py-2 px-2.5 text-left text-emerald-400">
                    Buyers (Ask)
                  </th>
                  <th className="py-2 px-2 text-right">Delta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {fp.levels.map((lv, idx) => {
                  const rowHighlight = lv.isCurrentPrice
                    ? isLight
                      ? 'bg-sky-50'
                      : 'bg-sky-500/15'
                    : lv.inStackedImbalance
                    ? isBuy
                      ? 'bg-emerald-500/10'
                      : 'bg-rose-500/10'
                    : '';

                  const tag = lv.isCurrentPrice
                    ? 'LTP'
                    : lv.isPoc
                    ? 'POC'
                    : lv.isVah
                    ? 'VAH'
                    : lv.isVal
                    ? 'VAL'
                    : lv.isAbsorptionLevel
                    ? 'ABS'
                    : lv.isExhaustionLevel
                    ? 'EXH'
                    : '';

                  return (
                    <tr key={`${lv.price}-${idx}`} className={rowHighlight}>
                      <td
                        className={`py-1.5 px-2.5 text-right ${
                          lv.sellImbalance
                            ? 'text-rose-300 font-bold bg-rose-500/20'
                            : lv.isAbsorptionLevel && isBuy
                            ? 'text-amber-300 font-bold bg-amber-500/15'
                            : mutedText
                        }`}
                      >
                        {fmtCompactVol(lv.sellersBidVol)}
                        {lv.sellImbalance && (
                          <span className="ml-1 text-[9px] text-rose-400">3×</span>
                        )}
                      </td>

                      <td className="py-1.5 px-2 text-center font-semibold">
                        <span>{lv.price.toFixed(2)}</span>
                        {tag && (
                          <span
                            className={`ml-1 text-[9px] ${
                              tag === 'LTP'
                                ? 'text-sky-400'
                                : tag === 'POC' || tag === 'ABS'
                                ? 'text-amber-400'
                                : tag === 'EXH'
                                ? 'text-rose-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {tag}
                          </span>
                        )}
                      </td>

                      <td
                        className={`py-1.5 px-2.5 text-left ${
                          lv.buyImbalance
                            ? 'text-emerald-300 font-bold bg-emerald-500/20'
                            : lv.isAbsorptionLevel && !isBuy
                            ? 'text-amber-300 font-bold bg-amber-500/15'
                            : mutedText
                        }`}
                      >
                        {fmtCompactVol(lv.buyersAskVol)}
                        {lv.buyImbalance && (
                          <span className="ml-1 text-[9px] text-emerald-400">3×</span>
                        )}
                      </td>

                      <td
                        className={`py-1.5 px-2 text-right ${
                          lv.levelDelta > 0
                            ? 'text-emerald-400'
                            : lv.levelDelta < 0
                            ? 'text-rose-400'
                            : mutedText
                        }`}
                      >
                        {lv.levelDelta > 0 ? '+' : ''}
                        {fmtCompactVol(lv.levelDelta)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-3 gap-2 text-[11px] font-mono tabular-nums">
            <div className={`p-2 rounded-lg border ${subSurface}`}>
              <div className={mutedText}>Sellers Total</div>
              <div className="text-rose-400 font-semibold mt-0.5">
                {fmtCompactVol(fp.totalSellersBidVol)}
              </div>
            </div>
            <div className={`p-2 rounded-lg border ${subSurface}`}>
              <div className={mutedText}>Buyers Total</div>
              <div className="text-emerald-400 font-semibold mt-0.5">
                {fmtCompactVol(fp.totalBuyersAskVol)}
              </div>
            </div>
            <div className={`p-2 rounded-lg border ${subSurface}`}>
              <div className={mutedText}>Stacked Run</div>
              <div
                className={`font-semibold mt-0.5 ${
                  sig.stackedImbalance.passed ? 'text-sky-400' : mutedText
                }`}
              >
                {isBuy ? fp.maxBuyStack : fp.maxSellStack} in a row
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/* STEP 3: 5 INSTITUTIONAL SIGNALS + THE TAPE                   */}
        {/* ============================================================ */}
        <div className="xl:col-span-4 p-4 space-y-3" data-testid="step3-signals-tape">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-[11px] font-mono uppercase tracking-wider text-sky-400 font-semibold">
                Step 3 · 5 Order Flow Signals
              </div>
              <h3 className="text-sm font-semibold mt-0.5">
                Confluence Audit &amp; Live Tape
              </h3>
            </div>
            <span className="text-xs font-mono tabular-nums font-semibold text-emerald-400">
              {sig.confirmedCount} / 5 Active
            </span>
          </div>

          {/* 5 Explicit Signal Rows */}
          <div className={`rounded-lg border divide-y divide-slate-800 ${subSurface} text-xs`}>
            {/* Signal 1: Stacked Imbalance */}
            <div className="p-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>1. Stacked Imbalance (&ge;3)</span>
                </div>
                <p className={`text-[11px] mt-0.5 ${mutedText}`}>
                  {sig.stackedImbalance.summary}
                </p>
              </div>
              <span
                className={`text-[10px] font-mono font-semibold shrink-0 ${
                  sig.stackedImbalance.passed ? 'text-emerald-400' : 'text-slate-500'
                }`}
              >
                {sig.stackedImbalance.passed ? 'CONFIRMED' : 'WATCH'}
              </span>
            </div>

            {/* Signal 2: Absorption */}
            <div className="p-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span>2. Absorption</span>
                </div>
                <p className={`text-[11px] mt-0.5 ${mutedText}`}>
                  {sig.absorption.summary}
                </p>
              </div>
              <span
                className={`text-[10px] font-mono font-semibold shrink-0 ${
                  sig.absorption.detected ? 'text-amber-400' : 'text-slate-500'
                }`}
              >
                {sig.absorption.detected ? 'DETECTED' : 'NONE'}
              </span>
            </div>

            {/* Signal 3: Exhaustion */}
            <div className="p-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold flex items-center gap-1.5">
                  {sig.exhaustion.detected ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                  <span>3. Exhaustion</span>
                </div>
                <p className={`text-[11px] mt-0.5 ${mutedText}`}>
                  {sig.exhaustion.summary}
                </p>
              </div>
              <span
                className={`text-[10px] font-mono font-semibold shrink-0 ${
                  sig.exhaustion.detected ? 'text-rose-400' : 'text-emerald-400'
                }`}
              >
                {sig.exhaustion.detected ? 'TIRED' : 'CLEAR'}
              </span>
            </div>

            {/* Signal 4: Delta (Buyers - Sellers) */}
            <div className="p-2.5 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold flex items-center gap-1.5">
                  {isBuy ? (
                    <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  ) : (
                    <TrendingDown className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  )}
                  <span>4. Delta (Buyers &minus; Sellers)</span>
                </div>
                <p className={`text-[11px] mt-0.5 ${mutedText}`}>
                  {sig.delta.summary}
                </p>
              </div>
              <span
                className={`text-[10px] font-mono font-semibold shrink-0 ${
                  sig.delta.passed
                    ? isBuy
                      ? 'text-emerald-400'
                      : 'text-rose-400'
                    : 'text-slate-500'
                }`}
              >
                {sig.delta.deltaPct >= 0 ? '+' : ''}
                {sig.delta.deltaPct.toFixed(1)}%
              </span>
            </div>

            {/* Signal 5: The Tape */}
            <div className="p-2.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    <span>5. The Tape (Big Prints)</span>
                  </div>
                  <p className={`text-[11px] mt-0.5 ${mutedText}`}>
                    {sig.tape.summary}
                  </p>
                </div>
                <span
                  className={`text-[10px] font-mono font-semibold shrink-0 ${
                    sig.tape.confirmed ? 'text-emerald-400' : 'text-slate-500'
                  }`}
                >
                  {sig.tape.confirmed ? 'CONFIRMED' : 'LIGHT'}
                </span>
              </div>

              {/* Compact Time & Sales Big-Print Feed */}
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] font-mono tabular-nums border-collapse">
                  <thead>
                    <tr className={`border-b border-slate-800/80 text-[10px] ${mutedText}`}>
                      <th className="py-1 text-left">IST</th>
                      <th className="py-1 text-right">Price</th>
                      <th className="py-1 text-right">Qty</th>
                      <th className="py-1 text-right">Value</th>
                      <th className="py-1 text-right">Flow</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/50">
                    {sig.tape.prints.slice(0, 5).map((p) => {
                      const buyFlow = p.side === 'BUY_SWEEP' || p.side === 'ABSORB_BID';
                      return (
                        <tr
                          key={p.id}
                          className={
                            p.isBigPrint
                              ? buyFlow
                                ? 'bg-emerald-500/8'
                                : 'bg-rose-500/8'
                              : ''
                          }
                        >
                          <td className={`py-1 ${mutedText}`}>{p.timeIST}</td>
                          <td className="py-1 text-right">{p.price.toFixed(2)}</td>
                          <td className="py-1 text-right">{fmtCompactVol(p.qty)}</td>
                          <td
                            className={`py-1 text-right ${
                              p.isBigPrint ? 'font-semibold text-sky-400' : mutedText
                            }`}
                          >
                            ₹{p.valueLakhs.toFixed(0)}L
                          </td>
                          <td
                            className={`py-1 text-right font-semibold ${
                              buyFlow ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {p.side === 'BUY_SWEEP'
                              ? 'BUY SWEEP'
                              : p.side === 'SELL_SWEEP'
                              ? 'SELL HIT'
                              : p.side === 'ABSORB_BID'
                              ? 'ABSORB BID'
                              : 'ABSORB ASK'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Rudra AI Risk Plan Footer */}
          <div
            className={`grid grid-cols-4 divide-x divide-slate-800 border rounded-lg ${subSurface} text-[11px] font-mono tabular-nums`}
          >
            <div className="p-2">
              <div className={mutedText}>Entry</div>
              <div className="font-semibold mt-0.5">{fmtInr(row.entryPrice)}</div>
            </div>
            <div className="p-2">
              <div className={mutedText}>SL ({row.slDistancePct.toFixed(1)}%)</div>
              <div className="font-semibold text-rose-400 mt-0.5">{fmtInr(row.stopLoss)}</div>
            </div>
            <div className="p-2">
              <div className={mutedText}>T1 (1.5R)</div>
              <div className="font-semibold text-emerald-400 mt-0.5">{fmtInr(row.target1)}</div>
            </div>
            <div className="p-2">
              <div className={mutedText}>T2 (2.5R)</div>
              <div className="font-semibold text-sky-400 mt-0.5">{fmtInr(row.target2)}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
