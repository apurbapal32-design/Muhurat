import React, { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  ChevronRight,
  Coins,
  Crosshair,
  Flame,
  Layers,
  Percent,
  Play,
  Rocket,
  Scale,
  Shield,
  ShieldAlert,
  Sparkles,
  Target,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import {
  IndexAlertCreatePayload,
  IndexAlertTriggerType,
  IndexIntelligenceData,
  IndexOptionAlert,
  IndexStrikeMoneyness,
  SupportedIndexSymbol,
} from '../types';
import { INDEX_CONFIGS } from '../utils/indexOptionsEngine';
import {
  createIndexOptionAlert,
  playIndexAlertChime,
  resolveExactIndexStrike,
} from '../utils/indexOptionsAlertEngine';

interface IndexOptionAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  indicesData: Record<SupportedIndexSymbol, IndexIntelligenceData>;
  initialIndex?: SupportedIndexSymbol;
  initialMoneyness?: IndexStrikeMoneyness;
  initialOptionType?: 'CE' | 'PE';
  initialAction?: 'BUY' | 'SELL';
  initialStrike?: number;
  onAlertCreated: (newAlert: IndexOptionAlert) => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const IndexOptionAlertModal: React.FC<IndexOptionAlertModalProps> = ({
  isOpen,
  onClose,
  indicesData,
  initialIndex = 'NIFTY 50',
  initialMoneyness = 'SLIGHT_ITM',
  initialOptionType = 'CE',
  initialAction = 'BUY',
  initialStrike,
  onAlertCreated,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';

  // Form State
  const [indexSymbol, setIndexSymbol] = useState<SupportedIndexSymbol>(initialIndex);
  const [action, setAction] = useState<'BUY' | 'SELL'>(initialAction);
  const [optionType, setOptionType] = useState<'CE' | 'PE'>(initialOptionType);
  const [moneyness, setMoneyness] = useState<IndexStrikeMoneyness>(initialMoneyness);
  const [customStrikeOverride, setCustomStrikeOverride] = useState<number | undefined>(initialStrike);
  const [useCustomStrike, setUseCustomStrike] = useState<boolean>(!!initialStrike);

  // Trigger setup
  const [triggerType, setTriggerType] = useState<IndexAlertTriggerType>('QUANTITATIVE_SIGNAL_FLIP');
  const [minConfidenceScore, setMinConfidenceScore] = useState<number>(75);
  const [targetSpotPrice, setTargetSpotPrice] = useState<number>(() => {
    return indicesData[initialIndex]?.spotPrice || 24500;
  });
  const [targetPremiumPrice, setTargetPremiumPrice] = useState<number>(150);
  const [targetPcrValue, setTargetPcrValue] = useState<number>(1.25);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [pushEnabled, setPushEnabled] = useState<boolean>(true);

  // Update target spot price when index changes
  const currentIndexData = indicesData[indexSymbol] || indicesData['NIFTY 50'];

  // Calculate live resolved ONE strike candidate
  const resolvedStrike = useMemo(() => {
    return resolveExactIndexStrike(
      currentIndexData,
      moneyness,
      optionType,
      action,
      useCustomStrike ? customStrikeOverride : undefined
    );
  }, [currentIndexData, moneyness, optionType, action, useCustomStrike, customStrikeOverride]);

  if (!isOpen) return null;

  const handleIndexChange = (sym: SupportedIndexSymbol) => {
    setIndexSymbol(sym);
    const data = indicesData[sym];
    if (data) {
      setTargetSpotPrice(data.spotPrice);
      setCustomStrikeOverride(undefined);
      setUseCustomStrike(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let triggerTargetValue: number | undefined;
    if (triggerType === 'SPOT_CROSS_ABOVE' || triggerType === 'SPOT_CROSS_BELOW') {
      triggerTargetValue = targetSpotPrice;
    } else if (triggerType === 'PREMIUM_CROSS_ABOVE') {
      triggerTargetValue = targetPremiumPrice;
    } else if (triggerType === 'PCR_BREAKOUT' || triggerType === 'INSTITUTIONAL_WRITING_SHIFT') {
      triggerTargetValue = targetPcrValue;
    }

    const payload: IndexAlertCreatePayload = {
      indexSymbol,
      moneyness,
      optionType,
      action,
      strike: useCustomStrike ? customStrikeOverride : resolvedStrike.strike,
      triggerType,
      triggerTargetValue,
      minConfidenceScore,
      soundEnabled,
      pushEnabled,
    };

    const newAlert = createIndexOptionAlert(payload, indicesData);
    if (soundEnabled) {
      playIndexAlertChime('SUCCESS');
    }
    onAlertCreated(newAlert);
    onClose();
  };

  const moneynessOptions: Array<{
    key: IndexStrikeMoneyness;
    label: string;
    sublabel: string;
    badge: string;
    color: string;
  }> = [
    {
      key: 'DEEP_ITM',
      label: 'Deep ITM',
      sublabel: 'High Delta (Δ ~0.80+), Pure Intrinsic Value, Low Theta Burn',
      badge: 'ITM (Deep)',
      color: 'from-blue-600 to-indigo-700 border-blue-500/40 text-blue-300',
    },
    {
      key: 'SLIGHT_ITM',
      label: 'Slight ITM',
      sublabel: 'Optimal AI Sweetspot (Δ ~0.62), Balanced Leverage & Safety',
      badge: 'ITM (Optimal ⭐)',
      color: 'from-emerald-600 to-teal-700 border-emerald-500/40 text-emerald-300',
    },
    {
      key: 'ATM',
      label: 'At-The-Money (ATM)',
      sublabel: 'Apex Gamma & Liquidity (Δ ~0.50), Fast Scalp Momentum',
      badge: 'ATM (Apex)',
      color: 'from-amber-600 to-yellow-700 border-amber-500/40 text-amber-300',
    },
    {
      key: 'SLIGHT_OTM',
      label: 'Slight OTM',
      sublabel: 'High Percentage ROI (Δ ~0.38), Needs Immediate Direction',
      badge: 'OTM (Slight)',
      color: 'from-purple-600 to-pink-700 border-purple-500/40 text-purple-300',
    },
    {
      key: 'FAR_OTM',
      label: 'Far OTM',
      sublabel: 'Low Capital Lottery (Δ ~0.20), High Theta Decay Risk',
      badge: 'OTM (Far)',
      color: 'from-rose-600 to-red-700 border-rose-500/40 text-rose-300',
    },
  ];

  return (
    <div
      id="index-option-alert-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md overflow-y-auto"
    >
      <div
        id="index-option-alert-modal-card"
        className={`relative w-full max-w-3xl rounded-2xl border shadow-2xl overflow-hidden my-auto transition-all ${
          isDark
            ? 'bg-slate-900 border-slate-700 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className="relative p-4 sm:p-5 bg-gradient-to-r from-emerald-600 via-teal-700 to-indigo-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center shadow-lg">
              <Bell className="w-5 h-5 text-emerald-200 animate-pulse fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black tracking-tight">
                  Create Index Option Alert
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-400/25 border border-emerald-300/40 text-emerald-100 uppercase tracking-wide">
                  ATM • ITM • OTM Precision
                </span>
              </div>
              <p className="text-xs text-emerald-100/90 font-medium">
                Set intelligent triggers for exact CALL/PUT strikes with automated targets, SL & Greeks.
              </p>
            </div>
          </div>
          <button
            id="close-index-alert-modal-btn"
            onClick={onClose}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {/* STEP 1: Select Index */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              1. Select Index Market
            </label>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {(['NIFTY 50', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'] as SupportedIndexSymbol[]).map(
                (sym) => {
                  const isSelected = indexSymbol === sym;
                  const data = indicesData[sym];
                  return (
                    <button
                      key={sym}
                      type="button"
                      onClick={() => handleIndexChange(sym)}
                      className={`p-2.5 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold ring-2 ring-emerald-500/30'
                          : isDark
                          ? 'bg-slate-800/80 border-slate-700 hover:bg-slate-800 text-slate-300'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="text-xs font-black truncate">{sym}</div>
                      <div className="text-[11px] font-mono mt-0.5 opacity-90">
                        ₹{data ? data.spotPrice.toLocaleString('en-IN') : '---'}
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          {/* STEP 2: Select Action & Contract Type */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              2. Select Action & Contract Direction
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAction('BUY');
                  setOptionType('CE');
                }}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
                  action === 'BUY' && optionType === 'CE'
                    ? 'bg-emerald-500/25 border-emerald-400 text-emerald-300 font-black ring-2 ring-emerald-500/30 shadow-lg shadow-emerald-500/20'
                    : isDark
                    ? 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1 text-emerald-400 text-xs font-black">
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  BUY CALL (CE)
                </div>
                <div className="text-[10px] mt-1 text-slate-400 font-medium">
                  Bullish Breakout / Upward Trend
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAction('BUY');
                  setOptionType('PE');
                }}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
                  action === 'BUY' && optionType === 'PE'
                    ? 'bg-rose-500/25 border-rose-400 text-rose-300 font-black ring-2 ring-rose-500/30 shadow-lg shadow-rose-500/20'
                    : isDark
                    ? 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1 text-rose-400 text-xs font-black">
                  <Flame className="w-3.5 h-3.5 fill-current" />
                  BUY PUT (PE)
                </div>
                <div className="text-[10px] mt-1 text-slate-400 font-medium">
                  Bearish Breakdown / Rejection
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAction('SELL');
                  setOptionType('CE');
                }}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
                  action === 'SELL' && optionType === 'CE'
                    ? 'bg-amber-500/25 border-amber-400 text-amber-300 font-black ring-2 ring-amber-500/30 shadow-lg shadow-amber-500/20'
                    : isDark
                    ? 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1 text-amber-400 text-xs font-black">
                  <Coins className="w-3.5 h-3.5" />
                  SELL CALL (CE)
                </div>
                <div className="text-[10px] mt-1 text-slate-400 font-medium">
                  Bearish Wall / Theta Collection
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setAction('SELL');
                  setOptionType('PE');
                }}
                className={`p-3 rounded-xl border flex flex-col items-center justify-center transition-all ${
                  action === 'SELL' && optionType === 'PE'
                    ? 'bg-cyan-500/25 border-cyan-400 text-cyan-300 font-black ring-2 ring-cyan-500/30 shadow-lg shadow-cyan-500/20'
                    : isDark
                    ? 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center gap-1 text-cyan-400 text-xs font-black">
                  <Shield className="w-3.5 h-3.5" />
                  SELL PUT (PE)
                </div>
                <div className="text-[10px] mt-1 text-slate-400 font-medium">
                  Bullish Floor / Put Writing
                </div>
              </button>
            </div>
          </div>

          {/* STEP 3: Choose Moneyness (Which ONE ATM, ITM, OTM) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                3. Choose Moneyness (Which ONE Strike)
              </label>
              <button
                type="button"
                onClick={() => setUseCustomStrike(!useCustomStrike)}
                className="text-[11px] text-emerald-400 hover:underline font-semibold flex items-center gap-1"
              >
                {useCustomStrike ? 'Switch to Auto ATM/ITM/OTM' : 'Custom Strike Override'}
              </button>
            </div>

            {!useCustomStrike ? (
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {moneynessOptions.map((opt) => {
                  const isSelected = moneyness === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setMoneyness(opt.key)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? 'bg-gradient-to-br ' + opt.color + ' border-2 shadow-lg font-bold'
                          : isDark
                          ? 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-black">{opt.label}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <p className="text-[10px] opacity-80 leading-tight">
                        {opt.sublabel}
                      </p>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="p-3 rounded-xl border border-emerald-500/30 bg-emerald-950/20 flex flex-wrap items-center gap-3">
                <span className="text-xs text-emerald-300 font-bold">Select Strike from Chain:</span>
                <select
                  value={customStrikeOverride || resolvedStrike.strike}
                  onChange={(e) => setCustomStrikeOverride(Number(e.target.value))}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-mono font-bold ${
                    isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  {currentIndexData.battlefieldStrikes.map((s) => (
                    <option key={s.strike} value={s.strike}>
                      {s.strike} {s.isAtm ? '(ATM)' : ''} — CE: ₹{s.callLtp} | PE: ₹{s.putLtp}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* HIGHLIGHTED CHOSEN ONE STRIKE LIVE PREVIEW CARD */}
          <div
            id="chosen-one-strike-highlight-card"
            className="p-4 sm:p-5 rounded-2xl border-2 border-emerald-500/60 bg-gradient-to-br from-emerald-950/40 via-slate-900 to-indigo-950/40 shadow-xl space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-500/30 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md text-xs font-black bg-emerald-400 text-slate-950 flex items-center gap-1">
                  <Target className="w-3.5 h-3.5" />
                  THE ONE CHOSEN STRIKE
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[11px] font-black uppercase ${
                    action === 'BUY'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                  }`}
                >
                  {action} {optionType}
                </span>
                <span className="px-2 py-0.5 rounded text-[11px] font-black bg-indigo-500/20 text-indigo-300 border border-indigo-400/40 uppercase">
                  {resolvedStrike.moneyness.replace('_', ' ')}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-400 font-medium">Live Premium LTP:</span>
                <span className="ml-1.5 text-lg font-black text-emerald-400 font-mono">
                  ₹{resolvedStrike.premiumLtp.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                  <span>{resolvedStrike.contractName}</span>
                </h4>
                <p className="text-xs text-slate-300 mt-0.5">
                  {resolvedStrike.rationale}
                </p>
              </div>
            </div>

            {/* Target, SL, and Greeks Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
              <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/80">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Entry Price</span>
                <div className="text-sm font-black text-white font-mono mt-0.5">
                  ₹{resolvedStrike.entryPrice.toFixed(2)}
                </div>
                <div className="text-[10px] text-emerald-400 font-medium mt-0.5">
                  R:R {resolvedStrike.riskReward}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-500/30">
                <span className="text-[10px] text-rose-300 uppercase font-bold">Stop Loss</span>
                <div className="text-sm font-black text-rose-400 font-mono mt-0.5">
                  ₹{resolvedStrike.stopLoss.toFixed(2)}
                </div>
                <div className="text-[10px] text-rose-300/80 font-medium mt-0.5">
                  -{resolvedStrike.stopLossPercent}% risk
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
                <span className="text-[10px] text-emerald-300 uppercase font-bold">Target 1 (Primary)</span>
                <div className="text-sm font-black text-emerald-400 font-mono mt-0.5">
                  ₹{resolvedStrike.target1.toFixed(2)}
                </div>
                <div className="text-[10px] text-emerald-300/80 font-medium mt-0.5">
                  T2: ₹{resolvedStrike.target2.toFixed(2)} | T3: ₹{resolvedStrike.target3.toFixed(2)}
                </div>
              </div>

              <div className="p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-500/30">
                <span className="text-[10px] text-indigo-300 uppercase font-bold">Greeks Snapshot</span>
                <div className="text-xs font-mono font-bold text-indigo-200 mt-0.5 flex items-center justify-between">
                  <span>Δ {resolvedStrike.delta.toFixed(2)}</span>
                  <span>Γ {resolvedStrike.gamma.toFixed(4)}</span>
                </div>
                <div className="text-[10px] text-indigo-300/80 font-mono mt-0.5 flex items-center justify-between">
                  <span>Θ ₹{Math.abs(resolvedStrike.theta).toFixed(1)}/d</span>
                  <span>IV {resolvedStrike.iv}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* STEP 4: Choose Trigger Condition */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              4. Set Alert Trigger Condition
            </label>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label
                  className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                    triggerType === 'QUANTITATIVE_SIGNAL_FLIP'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                      : isDark
                      ? 'bg-slate-800/80 border-slate-700 text-slate-300'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="triggerType"
                    checked={triggerType === 'QUANTITATIVE_SIGNAL_FLIP'}
                    onChange={() => setTriggerType('QUANTITATIVE_SIGNAL_FLIP')}
                    className="mt-0.5 accent-emerald-500"
                  />
                  <div>
                    <div className="text-xs font-bold">AI Quantitative Score Threshold</div>
                    <div className="text-[11px] opacity-75 mt-0.5">
                      Triggers when 5-vector confluence score reaches $\ge$ target
                    </div>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                    triggerType === 'SPOT_CROSS_ABOVE'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                      : isDark
                      ? 'bg-slate-800/80 border-slate-700 text-slate-300'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="triggerType"
                    checked={triggerType === 'SPOT_CROSS_ABOVE'}
                    onChange={() => setTriggerType('SPOT_CROSS_ABOVE')}
                    className="mt-0.5 accent-emerald-500"
                  />
                  <div>
                    <div className="text-xs font-bold">Spot Price Crosses Above</div>
                    <div className="text-[11px] opacity-75 mt-0.5">
                      Triggers when index spot breaks resistance level
                    </div>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                    triggerType === 'SPOT_CROSS_BELOW'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                      : isDark
                      ? 'bg-slate-800/80 border-slate-700 text-slate-300'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="triggerType"
                    checked={triggerType === 'SPOT_CROSS_BELOW'}
                    onChange={() => setTriggerType('SPOT_CROSS_BELOW')}
                    className="mt-0.5 accent-emerald-500"
                  />
                  <div>
                    <div className="text-xs font-bold">Spot Price Crosses Below</div>
                    <div className="text-[11px] opacity-75 mt-0.5">
                      Triggers when index spot breaks support floor
                    </div>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                    triggerType === 'PREMIUM_CROSS_ABOVE'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                      : isDark
                      ? 'bg-slate-800/80 border-slate-700 text-slate-300'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="triggerType"
                    checked={triggerType === 'PREMIUM_CROSS_ABOVE'}
                    onChange={() => setTriggerType('PREMIUM_CROSS_ABOVE')}
                    className="mt-0.5 accent-emerald-500"
                  />
                  <div>
                    <div className="text-xs font-bold">Option Premium Breakout</div>
                    <div className="text-[11px] opacity-75 mt-0.5">
                      Triggers when option LTP hits entry trigger
                    </div>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                    triggerType === 'GAMMA_SQUEEZE'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                      : isDark
                      ? 'bg-slate-800/80 border-slate-700 text-slate-300'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="triggerType"
                    checked={triggerType === 'GAMMA_SQUEEZE'}
                    onChange={() => setTriggerType('GAMMA_SQUEEZE')}
                    className="mt-0.5 accent-emerald-500"
                  />
                  <div>
                    <div className="text-xs font-bold">Gamma Squeeze & Short Covering</div>
                    <div className="text-[11px] opacity-75 mt-0.5">
                      Triggers on trapped writer unwinding cascades
                    </div>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                    triggerType === 'SUPERTREND_CROSSOVER'
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300 font-bold'
                      : isDark
                      ? 'bg-slate-800/80 border-slate-700 text-slate-300'
                      : 'bg-slate-50 border-slate-200 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="triggerType"
                    checked={triggerType === 'SUPERTREND_CROSSOVER'}
                    onChange={() => setTriggerType('SUPERTREND_CROSSOVER')}
                    className="mt-0.5 accent-emerald-500"
                  />
                  <div>
                    <div className="text-xs font-bold">Supertrend (10,3) / CPR Break</div>
                    <div className="text-[11px] opacity-75 mt-0.5">
                      Triggers when trend indicator confirms flip
                    </div>
                  </div>
                </label>

                <label
                  className={`p-3 rounded-xl border flex items-start gap-2.5 cursor-pointer transition-all ${
                    triggerType === 'INSTITUTIONAL_WRITING_SHIFT'
                      ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-bold col-span-1 sm:col-span-2'
                      : isDark
                      ? 'bg-slate-800/80 border-slate-700 text-slate-300 col-span-1 sm:col-span-2'
                      : 'bg-slate-50 border-slate-200 text-slate-700 col-span-1 sm:col-span-2'
                  }`}
                >
                  <input
                    type="radio"
                    name="triggerType"
                    checked={triggerType === 'INSTITUTIONAL_WRITING_SHIFT'}
                    onChange={() => setTriggerType('INSTITUTIONAL_WRITING_SHIFT')}
                    className="mt-0.5 accent-amber-500"
                  />
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <Flame className="w-3.5 h-3.5 text-amber-400" />
                      <span>Institutional Writing Ratio & Positioning Shift</span>
                    </div>
                    <div className="text-[11px] opacity-75 mt-0.5">
                      Monitors rapid shifts in Put/Call writing velocity, FII/Pro floor defense walls, and trapped writer capitulation
                    </div>
                  </div>
                </label>
              </div>

              {/* Dynamic Parameter input */}
              {triggerType === 'INSTITUTIONAL_WRITING_SHIFT' && (
                <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-500/40 space-y-2">
                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-amber-200 font-semibold">
                      Writing Ratio Shift Trigger Threshold:
                    </span>
                    <span className="text-sm font-mono font-black text-amber-400">
                      {targetPcrValue}x {targetPcrValue >= 1.0 ? 'Put Writing Dominance' : 'Call Writing Dominance'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-400 font-mono">0.3x (Call Wall)</span>
                    <input
                      type="range"
                      min="0.3"
                      max="3.0"
                      step="0.1"
                      value={targetPcrValue}
                      onChange={(e) => setTargetPcrValue(Number(e.target.value))}
                      className="flex-1 accent-amber-500"
                    />
                    <span className="text-[10px] text-slate-400 font-mono">3.0x (Put Surge)</span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Triggers immediately when Put-Writing vs Call-Writing velocity exceeds {targetPcrValue}x or institutional positions rotate across key strikes.
                  </p>
                </div>
              )}
              {triggerType === 'QUANTITATIVE_SIGNAL_FLIP' && (
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-300 font-medium">
                    Minimum Quantitative Confidence Score:
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min="60"
                      max="90"
                      step="5"
                      value={minConfidenceScore}
                      onChange={(e) => setMinConfidenceScore(Number(e.target.value))}
                      className="w-32 accent-emerald-500"
                    />
                    <span className="text-sm font-mono font-bold text-emerald-400">
                      {minConfidenceScore}/100
                    </span>
                  </div>
                </div>
              )}

              {(triggerType === 'SPOT_CROSS_ABOVE' || triggerType === 'SPOT_CROSS_BELOW') && (
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-300 font-medium">
                    Target Spot Price Level (₹):
                  </span>
                  <input
                    type="number"
                    value={targetSpotPrice}
                    onChange={(e) => setTargetSpotPrice(Number(e.target.value))}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-mono font-bold w-40 text-right ${
                      isDark ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              )}

              {triggerType === 'PREMIUM_CROSS_ABOVE' && (
                <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 flex items-center justify-between gap-4">
                  <span className="text-xs text-slate-300 font-medium">
                    Option Premium Trigger Price (₹):
                  </span>
                  <input
                    type="number"
                    value={targetPremiumPrice}
                    onChange={(e) => setTargetPremiumPrice(Number(e.target.value))}
                    className={`px-3 py-1.5 rounded-lg border text-sm font-mono font-bold w-40 text-right ${
                      isDark ? 'bg-slate-900 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  />
                </div>
              )}
            </div>
          </div>

          {/* STEP 5: Notification Preferences */}
          <div className="p-3.5 rounded-xl border border-slate-700/60 bg-slate-800/40 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300">
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => setSoundEnabled(e.target.checked)}
                  className="rounded accent-emerald-500"
                />
                <Volume2 className="w-4 h-4 text-emerald-400" />
                <span>Audio Chime Synthesizer</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-300">
                <input
                  type="checkbox"
                  checked={pushEnabled}
                  onChange={(e) => setPushEnabled(e.target.checked)}
                  className="rounded accent-emerald-500"
                />
                <Bell className="w-4 h-4 text-indigo-400" />
                <span>Browser Native Push</span>
              </label>
            </div>

            <button
              type="button"
              onClick={() => playIndexAlertChime('HIGH')}
              className="text-xs text-slate-400 hover:text-emerald-300 flex items-center gap-1 font-mono"
            >
              <Play className="w-3 h-3" />
              Test Sound Chime
            </button>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-700/60">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2.5 rounded-xl border text-xs font-bold transition-all ${
                isDark
                  ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300'
                  : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-700'
              }`}
            >
              Cancel
            </button>

            <button
              id="confirm-create-index-alert-btn"
              type="submit"
              className="px-6 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/30 flex items-center gap-2 transition-all"
            >
              <Bell className="w-4 h-4 fill-current" />
              <span>Create & Arm Alert</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
