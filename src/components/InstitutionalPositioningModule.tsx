import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  ChevronRight,
  Compass,
  Cpu,
  Eye,
  Flame,
  Gauge,
  HelpCircle,
  Info,
  Layers,
  Percent,
  Plus,
  Radio,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Waves,
  Zap,
} from 'lucide-react';
import {
  IndexIntelligenceData,
  IndexOptionAlert,
  IndexOptionGreeks,
  InstitutionalWritingShiftTelemetry,
  SupportedIndexSymbol,
} from '../types';

interface InstitutionalPositioningModuleProps {
  indexData: IndexIntelligenceData;
  indicesData: Record<SupportedIndexSymbol, IndexIntelligenceData>;
  onSelectIndex: (sym: SupportedIndexSymbol) => void;
  onOpenAlertModal: (preset?: Partial<IndexOptionAlert>) => void;
  isWsConnected?: boolean;
  latencyMs?: number;
  ticksPerSecond?: number;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const InstitutionalPositioningModule: React.FC<InstitutionalPositioningModuleProps> = ({
  indexData,
  indicesData,
  onSelectIndex,
  onOpenAlertModal,
  isWsConnected = true,
  latencyMs = 8,
  ticksPerSecond = 1.4,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';
  const [activeGreekView, setActiveGreekView] = useState<'all' | 'delta' | 'gamma' | 'vega' | 'iv'>('all');
  const [showTooltip, setShowTooltip] = useState<string | null>(null);

  const selectedIndex = indexData.symbol;
  const greeks = indexData.overallGreeks;
  const shiftTelemetry = indexData.institutionalFlow?.writingShiftTelemetry;
  const gammaSqueeze = indexData.institutionalFlow?.gammaSqueezeAlert;
  const fiiFlow = indexData.institutionalFlow;

  // Calculate Put/Call Writing metrics
  const putWritingOi = shiftTelemetry?.putWritingLakhs || 0;
  const callWritingOi = shiftTelemetry?.callWritingLakhs || 0;
  const totalWritingOi = Math.max(0.1, putWritingOi + callWritingOi);
  const putWritingPercent = Number(((putWritingOi / totalWritingOi) * 100).toFixed(1));
  const callWritingPercent = Number(((callWritingOi / totalWritingOi) * 100).toFixed(1));
  const writingRatio = shiftTelemetry?.writingRatio || Number((putWritingOi / Math.max(0.1, callWritingOi)).toFixed(2));

  // ATM Options Greeks calculation
  const atmStrike = indexData.atmStrike;
  const atmItem = indexData.battlefieldStrikes?.find((s) => s.strike === atmStrike);
  const atmCallDelta = atmItem ? atmItem.callDelta : 0.52;
  const atmPutDelta = atmItem ? atmItem.putDelta : -0.48;
  const atmIv = atmItem ? Number(((atmItem.callIv + atmItem.putIv) / 2).toFixed(1)) : greeks.iv;
  
  // Calculate Volatility Skew (OTM Put IV vs OTM Call IV)
  const otmPutItem = indexData.battlefieldStrikes?.find((s) => s.strike === atmStrike - indexData.strikeStep * 2);
  const otmCallItem = indexData.battlefieldStrikes?.find((s) => s.strike === atmStrike + indexData.strikeStep * 2);
  const putIv = otmPutItem?.putIv || atmIv + 1.2;
  const callIv = otmCallItem?.callIv || atmIv - 0.6;
  const ivSkew = Number((putIv - callIv).toFixed(2)); // Positive skew means higher fear/downside protection demand

  // Dealer Gamma Profile: Positive when above gamma flip, negative when below
  const isDealerLongGamma = writingRatio >= 1.0;
  const gammaFlipStrike = indexData.maxPainStrike;

  const getShiftBadge = (type?: InstitutionalWritingShiftTelemetry['shiftType']) => {
    switch (type) {
      case 'BULLISH_PUT_WRITING_SURGE':
        return {
          label: 'Bullish Put Writing Surge',
          bg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
          icon: ShieldCheck,
          accent: 'emerald',
        };
      case 'BEARISH_CALL_WRITING_WALL':
        return {
          label: 'Bearish Call Writing Wall',
          bg: 'bg-rose-500/20 border-rose-500/40 text-rose-300',
          icon: ShieldAlert,
          accent: 'rose',
        };
      case 'CALL_UNWINDING_SHORT_COVER':
        return {
          label: 'Call Short Covering Panic',
          bg: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
          icon: Zap,
          accent: 'cyan',
        };
      case 'PUT_UNWINDING_LONG_PANIC':
        return {
          label: 'Put Long Unwinding Breakdown',
          bg: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
          icon: AlertTriangle,
          accent: 'amber',
        };
      case 'PCR_WRITING_RATIO_SPIKE':
        return {
          label: 'Writing Ratio Velocity Spike',
          bg: 'bg-purple-500/20 border-purple-500/40 text-purple-300',
          icon: Scale,
          accent: 'purple',
        };
      default:
        return {
          label: 'Straddle IV Crush / Rangebound',
          bg: 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300',
          icon: Radio,
          accent: 'indigo',
        };
    }
  };

  const badge = getShiftBadge(shiftTelemetry?.shiftType);
  const BadgeIcon = badge.icon;

  return (
    <div
      id="institutional-positioning-module-container"
      className="space-y-4 animate-in fade-in duration-300"
    >
      {/* 1. TOP COMMAND BAR: REAL-TIME WEBSOCKET STATUS & INDEX SWITCHER */}
      <div
        className={`p-4 rounded-2xl border shadow-xl flex flex-wrap items-center justify-between gap-3 ${
          isDark
            ? 'bg-slate-900/90 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 via-orange-600 to-rose-600 text-slate-950 font-black shadow-lg shadow-amber-500/20 flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black font-mono tracking-tight flex items-center gap-2">
                <span>INSTITUTIONAL POSITIONING &amp; GREEKS RADAR</span>
              </h2>
              {/* WebSocket Telemetry Pill */}
              <div
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                  isWsConnected
                    ? 'bg-cyan-950/60 border-cyan-500/40 text-cyan-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
                title="Live Fyers WebSocket Connection Status"
              >
                <span className="relative flex h-2 w-2">
                  {isWsConnected && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      isWsConnected ? 'bg-cyan-400' : 'bg-slate-500'
                    }`}
                  ></span>
                </span>
                <span>{isWsConnected ? '⚡ WS STREAMING' : 'OFFLINE'}</span>
                <span className="opacity-60">•</span>
                <span>{latencyMs}ms</span>
                <span className="opacity-60">•</span>
                <span>{ticksPerSecond.toFixed(1)} ticks/s</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              Live FII/Pro derivatives exposure, Delta/Gamma/Vega matrix, and Put/Call writing velocity for {selectedIndex}.
            </p>
          </div>
        </div>

        {/* Index Selector Pills */}
        <div className="flex items-center gap-1.5 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
          {(['NIFTY 50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'] as SupportedIndexSymbol[]).map((sym) => {
            const isSelected = selectedIndex === sym;
            const symData = indicesData[sym];
            const symRatio = symData?.institutionalFlow?.writingShiftTelemetry?.writingRatio || 1.0;
            const isBull = symRatio >= 1.2;
            const isBear = symRatio <= 0.8;

            return (
              <button
                key={sym}
                id={`inst-tab-select-${sym.replace(/\s+/g, '-').toLowerCase()}`}
                onClick={() => onSelectIndex(sym)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                  isSelected
                    ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-slate-950 shadow-md shadow-amber-500/20 font-black'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <span>{sym.split(' ')[0]}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    isBull ? 'bg-emerald-400' : isBear ? 'bg-rose-400' : 'bg-amber-400'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. CORE GREEKS COMMAND MATRIX (DELTA, GAMMA, VEGA, IV) */}
      <div
        id="institutional-greeks-command-matrix"
        className={`p-4 sm:p-5 rounded-2xl border transition-all ${
          isDark
            ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-xl'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80 mb-4">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-indigo-400" />
            <h3 className="text-sm font-black font-mono tracking-tight uppercase">
              INSTITUTIONAL GREEKS MATRIX &amp; EXPOSURE PROFILE
            </h3>
            <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
              Live Tick Synchronized
            </span>
          </div>

          <div className="flex items-center gap-1 text-xs font-mono">
            {(['all', 'delta', 'gamma', 'vega', 'iv'] as const).map((view) => (
              <button
                key={view}
                onClick={() => setActiveGreekView(view)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-bold uppercase transition-all ${
                  activeGreekView === view
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {view}
              </button>
            ))}
          </div>
        </div>

        {/* The 4 Greeks Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* GREEK 1: DELTA (Δ) */}
          {(activeGreekView === 'all' || activeGreekView === 'delta') && (
            <div
              id="card-greek-delta"
              className={`p-4 rounded-xl border flex flex-col justify-between relative overflow-hidden transition-all ${
                isDark ? 'bg-slate-950/80 border-slate-800 hover:border-emerald-500/40' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono font-black text-emerald-400 uppercase flex items-center gap-1">
                  <span>DELTA (Δ) EXPOSURE</span>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                  {atmCallDelta >= 0.5 ? 'BULLISH BIAS' : 'BEARISH BIAS'}
                </span>
              </div>

              <div className="my-2">
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl sm:text-3xl font-black font-mono text-slate-100">
                    +{atmCallDelta} <span className="text-xs text-slate-400 font-normal">CE</span>
                  </div>
                  <div className="text-lg font-black font-mono text-rose-400">
                    {atmPutDelta} <span className="text-xs text-slate-400 font-normal">PE</span>
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 font-mono mt-1">
                  Net Directional Velocity: +{((atmCallDelta + atmPutDelta) * 100).toFixed(0)} pts / 100pt move
                </p>
              </div>

              {/* Delta Speed Bar */}
              <div className="pt-2 border-t border-slate-800/80 space-y-1">
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>Put Delta ({atmPutDelta})</span>
                  <span>Call Delta (+{atmCallDelta})</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
                  <div className="bg-rose-500 h-full" style={{ width: `${Math.abs(atmPutDelta) * 100}%` }} />
                  <div className="bg-emerald-500 h-full" style={{ width: `${atmCallDelta * 100}%` }} />
                </div>
              </div>
            </div>
          )}

          {/* GREEK 2: GAMMA (Γ) */}
          {(activeGreekView === 'all' || activeGreekView === 'gamma') && (
            <div
              id="card-greek-gamma"
              className={`p-4 rounded-xl border flex flex-col justify-between relative overflow-hidden transition-all ${
                isDark ? 'bg-slate-950/80 border-slate-800 hover:border-indigo-500/40' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono font-black text-indigo-400 uppercase flex items-center gap-1">
                  <span>GAMMA (Γ) PROFILE</span>
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                    isDealerLongGamma
                      ? 'bg-indigo-500/20 text-indigo-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {isDealerLongGamma ? 'LONG GAMMA' : 'SHORT GAMMA'}
                </span>
              </div>

              <div className="my-2">
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl sm:text-3xl font-black font-mono text-slate-100">
                    {greeks.gamma}
                  </div>
                  <div className="text-xs font-mono text-indigo-300">
                    Flip: ₹{gammaFlipStrike}
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 font-mono mt-1">
                  {isDealerLongGamma
                    ? 'Dealers Long Gamma: Mean-reverting volatility dampening'
                    : 'Dealers Short Gamma: High-speed breakout acceleration'}
                </p>
              </div>

              {/* Gamma Squeeze Indicator */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                <span className="text-slate-400">Squeeze Status:</span>
                <span
                  className={`font-black ${
                    gammaSqueeze?.detected ? 'text-amber-400 animate-pulse flex items-center gap-1' : 'text-slate-400'
                  }`}
                >
                  {gammaSqueeze?.detected ? '⚡ ACTIVE SQUEEZE' : 'STABLE ORDERFLOW'}
                </span>
              </div>
            </div>
          )}

          {/* GREEK 3: VEGA (V) */}
          {(activeGreekView === 'all' || activeGreekView === 'vega') && (
            <div
              id="card-greek-vega"
              className={`p-4 rounded-xl border flex flex-col justify-between relative overflow-hidden transition-all ${
                isDark ? 'bg-slate-950/80 border-slate-800 hover:border-purple-500/40' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono font-black text-purple-400 uppercase flex items-center gap-1">
                  <span>VEGA (V) SENSITIVITY</span>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-mono font-bold">
                  ₹{greeks.vega} / 1% IV
                </span>
              </div>

              <div className="my-2">
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl sm:text-3xl font-black font-mono text-slate-100">
                    ₹{greeks.vega}
                  </div>
                  <div className="text-xs font-mono text-purple-300">
                    Decay: -₹{Math.abs(greeks.theta)}/day
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 font-mono mt-1">
                  Option price swing for every 1.0% shift in index implied volatility.
                </p>
              </div>

              {/* Volatility Harvesting Regime */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] font-mono">
                <span className="text-slate-400">Vega Regime:</span>
                <span className="text-purple-300 font-bold">
                  {greeks.ivPercentile > 60 ? 'Short Vega Harvest' : 'Long Volatility Setup'}
                </span>
              </div>
            </div>
          )}

          {/* GREEK 4: IMPLIED VOLATILITY (IV) & SKEW */}
          {(activeGreekView === 'all' || activeGreekView === 'iv') && (
            <div
              id="card-greek-iv"
              className={`p-4 rounded-xl border flex flex-col justify-between relative overflow-hidden transition-all ${
                isDark ? 'bg-slate-950/80 border-slate-800 hover:border-amber-500/40' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono font-black text-amber-400 uppercase flex items-center gap-1">
                  <span>IV &amp; VOLATILITY SKEW</span>
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono font-bold">
                  IVP {greeks.ivPercentile}%
                </span>
              </div>

              <div className="my-2">
                <div className="flex items-baseline justify-between">
                  <div className="text-2xl sm:text-3xl font-black font-mono text-slate-100">
                    {atmIv}%
                  </div>
                  <div className="text-xs font-mono text-amber-300">
                    Skew: +{ivSkew}%
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 font-mono mt-1">
                  IV Rank: {greeks.ivRank}% • Expected Expiry Move: ±{fiiFlow.expectedExpiryMovePoints} pts
                </p>
              </div>

              {/* IV Percentile Gauge Bar */}
              <div className="pt-2 border-t border-slate-800/80 space-y-1">
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>Low Vol (10%)</span>
                  <span>High Vol (35%)</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-emerald-500 via-amber-500 to-rose-500 h-full"
                    style={{ width: `${greeks.ivPercentile}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. MAIN PUT/CALL WRITING VELOCITY & INSTITUTIONAL FOOTPRINT */}
      {shiftTelemetry && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* LEFT: RATIO & FLOW VELOCITY (Col 5) */}
          <div
            id="institutional-writing-ratio-card"
            className={`lg:col-span-5 p-4 sm:p-5 rounded-2xl border flex flex-col justify-between ${
              isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
                <span className="font-bold flex items-center gap-1.5 text-slate-300">
                  <Scale className="w-4 h-4 text-amber-400" />
                  <span>PUT / CALL WRITING VELOCITY RATIO</span>
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase ${badge.bg}`}>
                  <BadgeIcon className="w-3 h-3 inline mr-1" />
                  {shiftTelemetry.severity.replace('_', ' ')}
                </span>
              </div>

              {/* Huge Ratio Readout */}
              <div className="flex items-baseline gap-3 my-3">
                <div className="text-4xl sm:text-5xl font-black font-mono tracking-tight text-amber-400">
                  {writingRatio}x
                </div>
                <div>
                  <div className="text-xs font-black font-mono uppercase">
                    {writingRatio >= 1.0 ? (
                      <span className="text-emerald-400 flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" />
                        PUT WRITERS DOMINATING (SUPPORT)
                      </span>
                    ) : (
                      <span className="text-rose-400 flex items-center gap-1">
                        <TrendingDown className="w-4 h-4" />
                        CALL WRITERS DOMINATING (RESISTANCE)
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    Institutional confidence: {shiftTelemetry.institutionalConfidenceScore}%
                  </span>
                </div>
              </div>

              {/* Progress Bar of Put vs Call Writing Volume */}
              <div className="space-y-2 mt-4 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                <div className="flex justify-between text-xs font-mono font-bold">
                  <span className="text-emerald-400 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Put Writers: {putWritingOi}L OI ({putWritingPercent}%)
                  </span>
                  <span className="text-rose-400 flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Call Writers: {callWritingOi}L OI ({callWritingPercent}%)
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden flex">
                  <div
                    className="bg-gradient-to-r from-emerald-600 to-emerald-400 h-full transition-all duration-500"
                    style={{ width: `${putWritingPercent}%` }}
                    title={`Put Writing OI: ${putWritingOi} Lakhs`}
                  />
                  <div
                    className="bg-gradient-to-r from-rose-600 to-rose-400 h-full transition-all duration-500"
                    style={{ width: `${callWritingPercent}%` }}
                    title={`Call Writing OI: ${callWritingOi} Lakhs`}
                  />
                </div>
              </div>
            </div>

            {/* Quick Metrics Strip */}
            <div className="grid grid-cols-2 gap-2 pt-4 mt-4 border-t border-slate-800/80 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                  FII Long/Short Futures
                </span>
                <span className="font-black text-indigo-300">
                  {fiiFlow.fiiLongShortRatio}x ({fiiFlow.fiiIndexSentiment.replace('_', ' ')})
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-950/50 border border-slate-800">
                <span className="text-[10px] text-slate-400 block uppercase font-semibold">
                  Combined ATM Straddle
                </span>
                <span className="font-black text-amber-300">
                  ₹{fiiFlow.combinedAtmStraddleLtp} (-₹{fiiFlow.straddleDecayRatePerHour}/hr)
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT: NARRATIVE, IMPACTED STRIKES & 1-CLICK ACTIONS (Col 7) */}
          <div
            id="institutional-positioning-narrative-card"
            className={`lg:col-span-7 p-4 sm:p-5 rounded-2xl border flex flex-col justify-between space-y-4 ${
              isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
                <span className="font-bold flex items-center gap-1.5 text-indigo-300">
                  <Compass className="w-4 h-4 text-indigo-400" />
                  <span>INSTITUTIONAL POSITIONING ANALYSIS</span>
                </span>
                <span className="text-[10px] font-mono">Updated: {shiftTelemetry.timestamp}</span>
              </div>

              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2 mt-1.5">
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    shiftTelemetry.netWritingBias.includes('BULLISH')
                      ? 'bg-emerald-400 animate-ping'
                      : shiftTelemetry.netWritingBias.includes('BEARISH')
                      ? 'bg-rose-400 animate-ping'
                      : 'bg-amber-400'
                  }`}
                />
                <span className="leading-snug">{shiftTelemetry.primaryDriver}</span>
              </h4>

              {/* Actionable Strategy Box */}
              <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-indigo-950/40 via-purple-950/30 to-slate-950/40 border border-indigo-500/30">
                <div className="text-xs font-mono font-bold text-indigo-300 uppercase mb-1 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Institutional Trade Playbook</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">
                  {shiftTelemetry.actionableVerdict}
                </p>
              </div>
            </div>

            {/* Impacted Strikes & 1-Click Alert Setup */}
            <div className="space-y-3 pt-3 border-t border-slate-800/80">
              <div>
                <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block mb-1.5">
                  Key Battlefield Strikes Under Heavy Institutional Pressure
                </span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {shiftTelemetry.keyStrikesImpacted?.map((strikeVal) => (
                    <span
                      key={strikeVal}
                      className="px-2.5 py-1 rounded-lg text-xs font-mono font-black bg-slate-950 border border-slate-700 text-amber-300 shadow-sm flex items-center gap-1"
                    >
                      <span>₹{strikeVal.toLocaleString('en-IN')}</span>
                      <span className="text-[10px] text-slate-400 font-normal">
                        ({strikeVal >= indexData.spotPrice ? 'Res' : 'Supp'})
                      </span>
                    </span>
                  ))}
                  <span className="text-[11px] font-mono text-slate-400 ml-1">
                    (Spot: ₹{indexData.spotPrice.toLocaleString('en-IN')})
                  </span>
                </div>
              </div>

              {/* 1-Click Trigger / Alert Setup */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  id="btn-inst-quick-alert"
                  onClick={() =>
                    onOpenAlertModal({
                      indexSymbol: selectedIndex,
                      optionType: shiftTelemetry.netWritingBias.includes('BULLISH') ? 'CE' : 'PE',
                      action: 'BUY',
                      triggerType: 'INSTITUTIONAL_WRITING_SHIFT',
                      triggerTargetValue: shiftTelemetry.netWritingBias.includes('BULLISH') ? 2.2 : 0.45,
                    })
                  }
                  className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-black font-mono flex items-center justify-center gap-2 shadow-lg transition-all ${
                    shiftTelemetry.netWritingBias.includes('BULLISH')
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-900/30'
                      : shiftTelemetry.netWritingBias.includes('BEARISH')
                      ? 'bg-gradient-to-r from-rose-600 to-orange-600 hover:from-rose-500 hover:to-orange-500 text-white shadow-rose-900/30'
                      : 'bg-gradient-to-r from-amber-600 to-yellow-600 hover:from-amber-500 hover:to-yellow-500 text-slate-950 shadow-amber-900/30'
                  }`}
                >
                  <Bell className="w-3.5 h-3.5 fill-current" />
                  <span>
                    Arm Alert on {selectedIndex} {shiftTelemetry.netWritingBias.includes('BULLISH') ? 'CE Writing Surge' : 'PE Writing Surge'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
