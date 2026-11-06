import React from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Flame,
  Layers,
  Percent,
  Plus,
  Radio,
  Scale,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  IndexIntelligenceData,
  IndexOptionAlert,
  InstitutionalWritingShiftTelemetry,
  SupportedIndexSymbol,
} from '../types';

interface InstitutionalWritingShiftMonitorProps {
  indicesData: Record<SupportedIndexSymbol, IndexIntelligenceData>;
  selectedIndex: SupportedIndexSymbol;
  onSelectIndex: (sym: SupportedIndexSymbol) => void;
  onQuickCreateShiftAlert: (preset: {
    indexSymbol: SupportedIndexSymbol;
    optionType: 'CE' | 'PE';
    action: 'BUY' | 'SELL';
    triggerType: 'INSTITUTIONAL_WRITING_SHIFT';
    triggerTargetValue: number;
  }) => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const InstitutionalWritingShiftMonitor: React.FC<InstitutionalWritingShiftMonitorProps> = ({
  indicesData,
  selectedIndex,
  onSelectIndex,
  onQuickCreateShiftAlert,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';
  const currentData = indicesData[selectedIndex];
  const shiftTelemetry = currentData?.institutionalFlow?.writingShiftTelemetry;

  const getShiftBadge = (type?: InstitutionalWritingShiftTelemetry['shiftType']) => {
    switch (type) {
      case 'BULLISH_PUT_WRITING_SURGE':
        return {
          label: 'Bullish Put Writing Surge',
          bg: 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300',
          icon: ShieldCheck,
        };
      case 'BEARISH_CALL_WRITING_WALL':
        return {
          label: 'Bearish Call Writing Wall',
          bg: 'bg-rose-500/20 border-rose-500/40 text-rose-300',
          icon: ShieldAlert,
        };
      case 'CALL_UNWINDING_SHORT_COVER':
        return {
          label: 'Call Short Covering Panic',
          bg: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
          icon: Zap,
        };
      case 'PUT_UNWINDING_LONG_PANIC':
        return {
          label: 'Put Long Unwinding Breakdown',
          bg: 'bg-amber-500/20 border-amber-500/40 text-amber-300',
          icon: AlertTriangle,
        };
      case 'PCR_WRITING_RATIO_SPIKE':
        return {
          label: 'Writing Ratio Velocity Spike',
          bg: 'bg-purple-500/20 border-purple-500/40 text-purple-300',
          icon: Scale,
        };
      default:
        return {
          label: 'Straddle IV Crush / Rangebound',
          bg: 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300',
          icon: Radio,
        };
    }
  };

  const badge = getShiftBadge(shiftTelemetry?.shiftType);
  const BadgeIcon = badge.icon;

  return (
    <div
      id="institutional-writing-shift-monitor-section"
      className={`rounded-2xl border transition-all p-4 sm:p-5 relative overflow-hidden ${
        isDark
          ? 'bg-gradient-to-br from-slate-900 via-indigo-950/20 to-slate-900 border-amber-500/30 shadow-xl'
          : 'bg-gradient-to-br from-amber-50/60 via-white to-indigo-50/40 border-amber-200 shadow-md'
      }`}
    >
      {/* Glow Accent */}
      <div className="absolute top-0 right-0 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-amber-500/20 relative z-10">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-slate-950 font-black shadow-lg shadow-amber-500/30 flex items-center justify-center">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black font-mono tracking-tight flex items-center gap-1.5">
                <span>INSTITUTIONAL PUT/CALL WRITING SHIFT RADAR</span>
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400/20 border border-amber-400/40 text-amber-300 uppercase tracking-wide flex items-center gap-1">
                <Radio className="w-3 h-3 animate-pulse" />
                Live Positioning Stream
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time monitoring of Put-to-Call writing velocity, institutional floor creation, and unwinding cascades across Indian Indices.
            </p>
          </div>
        </div>

        {/* Index Selector Pills inside Monitor */}
        <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-xl border border-slate-700/80">
          {(['NIFTY 50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'] as SupportedIndexSymbol[]).map(
            (sym) => {
              const isSelected = selectedIndex === sym;
              const symShift = indicesData[sym]?.institutionalFlow?.writingShiftTelemetry;
              const isBull = symShift?.netWritingBias.includes('BULLISH');
              const isBear = symShift?.netWritingBias.includes('BEARISH');

              return (
                <button
                  key={sym}
                  onClick={() => onSelectIndex(sym)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition-all ${
                    isSelected
                      ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>{sym.split(' ')[0]}</span>
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isBull ? 'bg-emerald-400' : isBear ? 'bg-rose-400' : 'bg-slate-500'
                    }`}
                  />
                </button>
              );
            }
          )}
        </div>
      </div>

      {/* Main Radar Card Grid */}
      {shiftTelemetry ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mt-4 relative z-10">
          {/* Left Column: Ratio & Dominance Dial */}
          <div
            className={`lg:col-span-4 p-4 rounded-xl border flex flex-col justify-between ${
              isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
                <span className="font-bold flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5 text-amber-400" />
                  PUT / CALL WRITING RATIO
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-black border uppercase ${badge.bg}`}
                >
                  <BadgeIcon className="w-3 h-3 inline mr-1" />
                  {shiftTelemetry.severity.replace('_', ' ')}
                </span>
              </div>

              <div className="flex items-baseline gap-3 my-2">
                <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-amber-400">
                  {shiftTelemetry.writingRatio}x
                </div>
                <div className="text-xs font-bold font-mono">
                  {shiftTelemetry.writingRatio >= 1.0 ? (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      PUT WRITING DOMINANT
                    </span>
                  ) : (
                    <span className="text-rose-400 flex items-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5" />
                      CALL WRITING DOMINANT
                    </span>
                  )}
                </div>
              </div>

              {/* Progress Bar of Put vs Call Writing Volume */}
              <div className="space-y-1.5 mt-3">
                <div className="flex justify-between text-[11px] font-mono font-bold">
                  <span className="text-emerald-400">
                    Put Writers: {shiftTelemetry.putWritingLakhs}L OI
                  </span>
                  <span className="text-rose-400">
                    Call Writers: {shiftTelemetry.callWritingLakhs}L OI
                  </span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden flex">
                  <div
                    className="bg-emerald-500 h-full transition-all duration-500"
                    style={{
                      width: `${
                        (shiftTelemetry.putWritingLakhs /
                          Math.max(1, shiftTelemetry.putWritingLakhs + shiftTelemetry.callWritingLakhs)) *
                        100
                      }%`,
                    }}
                  />
                  <div
                    className="bg-rose-500 h-full transition-all duration-500"
                    style={{
                      width: `${
                        (shiftTelemetry.callWritingLakhs /
                          Math.max(1, shiftTelemetry.putWritingLakhs + shiftTelemetry.callWritingLakhs)) *
                        100
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Quick Stats Pill Strip */}
            <div className="grid grid-cols-2 gap-2 pt-3 mt-3 border-t border-slate-800/80 text-[11px] font-mono">
              <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  Institutional Confidence
                </span>
                <span className="font-black text-amber-300">
                  {shiftTelemetry.institutionalConfidenceScore}%
                </span>
              </div>
              <div className="p-2 rounded-lg bg-slate-900/80 border border-slate-800">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">
                  FII Flow Alignment
                </span>
                <span className="font-bold text-slate-200 truncate block">
                  {shiftTelemetry.fiiDiiAlignment.split(' ')[0]} {shiftTelemetry.fiiDiiAlignment.split(' ')[1]}
                </span>
              </div>
            </div>
          </div>

          {/* Middle Column: Positioning Shift Narrative & Actionable Playbook */}
          <div
            className={`lg:col-span-5 p-4 rounded-xl border flex flex-col justify-between space-y-3 ${
              isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div>
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1">
                <span className="font-bold flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-indigo-400" />
                  INSTITUTIONAL POSITIONING ANALYSIS
                </span>
                <span className="text-[10px] font-mono">Synced: {shiftTelemetry.timestamp}</span>
              </div>

              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2 mt-1">
                <span
                  className={`w-2 h-2 rounded-full ${
                    shiftTelemetry.netWritingBias.includes('BULLISH')
                      ? 'bg-emerald-400 animate-ping'
                      : shiftTelemetry.netWritingBias.includes('BEARISH')
                      ? 'bg-rose-400 animate-ping'
                      : 'bg-amber-400'
                  }`}
                />
                <span>{shiftTelemetry.primaryDriver}</span>
              </h4>

              <p className="text-xs text-slate-300 mt-2 leading-relaxed bg-indigo-950/30 p-2.5 rounded-lg border border-indigo-500/20">
                <strong className="text-indigo-300 font-mono">Actionable Strategy: </strong>
                {shiftTelemetry.actionableVerdict}
              </p>
            </div>

            {/* Impacted Key Battlefield Strikes */}
            <div className="pt-2 border-t border-slate-800/80">
              <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block mb-1.5">
                Key Strikes Impacted by Shift
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {shiftTelemetry.keyStrikesImpacted.map((str) => (
                  <span
                    key={str}
                    className="px-2 py-0.5 rounded-md text-xs font-mono font-black bg-slate-800 border border-slate-700 text-amber-300"
                  >
                    ₹{str.toLocaleString('en-IN')}
                  </span>
                ))}
                <span className="text-[10px] font-mono text-slate-400 ml-1">
                  (Spot: ₹{currentData.spotPrice.toLocaleString('en-IN')})
                </span>
              </div>
            </div>
          </div>

          {/* Right Column: 1-Click Guard & Alert Creator */}
          <div
            className={`lg:col-span-3 p-4 rounded-xl border flex flex-col justify-between bg-gradient-to-br ${
              shiftTelemetry.netWritingBias.includes('BULLISH')
                ? 'from-emerald-950/40 to-slate-900 border-emerald-500/40'
                : shiftTelemetry.netWritingBias.includes('BEARISH')
                ? 'from-rose-950/40 to-slate-900 border-rose-500/40'
                : 'from-amber-950/40 to-slate-900 border-amber-500/40'
            }`}
          >
            <div>
              <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-amber-300 mb-1">
                <Zap className="w-3.5 h-3.5" />
                <span>1-CLICK SMART TRIGGER</span>
              </div>
              <p className="text-xs text-slate-300 leading-snug mt-1">
                Deploy an active Alert Engine watcher to sound alarms if institutional writing flips or exceeds the ratio threshold.
              </p>
            </div>

            <div className="space-y-2 mt-4">
              <button
                onClick={() =>
                  onQuickCreateShiftAlert({
                    indexSymbol: selectedIndex,
                    optionType: shiftTelemetry.netWritingBias.includes('BULLISH') ? 'CE' : 'PE',
                    action: 'BUY',
                    triggerType: 'INSTITUTIONAL_WRITING_SHIFT',
                    triggerTargetValue:
                      shiftTelemetry.netWritingBias.includes('BULLISH') ? 2.2 : 0.45,
                  })
                }
                className={`w-full py-2.5 px-3 rounded-xl text-xs font-black font-mono flex items-center justify-center gap-2 shadow-lg transition-all ${
                  shiftTelemetry.netWritingBias.includes('BULLISH')
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/30'
                    : shiftTelemetry.netWritingBias.includes('BEARISH')
                    ? 'bg-rose-500 hover:bg-rose-400 text-white shadow-rose-500/30'
                    : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/30'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>
                  Track {selectedIndex} {shiftTelemetry.netWritingBias.includes('BULLISH') ? 'CE Shift' : 'PE Shift'}
                </span>
              </button>

              <div className="text-[10px] text-center text-slate-400 font-mono">
                Auto-evaluates with Audio Chime on shift
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-6 text-center text-xs text-slate-400">
          Calculating institutional writing ratio telemetry...
        </div>
      )}
    </div>
  );
};
