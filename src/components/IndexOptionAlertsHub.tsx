import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  Flame,
  Layers,
  Percent,
  Play,
  Plus,
  Power,
  RefreshCw,
  Rocket,
  Scale,
  Shield,
  ShieldAlert,
  Sparkles,
  Target,
  Trash2,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import {
  IndexCandidateStrike,
  IndexIntelligenceData,
  IndexOptionAlert,
  IndexPaperTrade,
  IndexStrikeMoneyness,
  SupportedIndexSymbol,
} from '../types';
import {
  createIndexOptionAlert,
  deleteIndexAlert,
  playIndexAlertChime,
  resetTriggeredIndexAlert,
  toggleIndexAlertActive,
} from '../utils/indexOptionsAlertEngine';
import { InstitutionalWritingShiftMonitor } from './InstitutionalWritingShiftMonitor';

interface IndexOptionAlertsHubProps {
  alerts: IndexOptionAlert[];
  indicesData: Record<SupportedIndexSymbol, IndexIntelligenceData>;
  onAlertsUpdated: (updated: IndexOptionAlert[]) => void;
  onOpenCreateModal: () => void;
  onPlacePaperTradeFromAlert: (alert: IndexOptionAlert) => void;
  onTriggerTestAlert: (alert: IndexOptionAlert) => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const IndexOptionAlertsHub: React.FC<IndexOptionAlertsHubProps> = ({
  alerts,
  indicesData,
  onAlertsUpdated,
  onOpenCreateModal,
  onPlacePaperTradeFromAlert,
  onTriggerTestAlert,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';
  const [selectedShiftIndex, setSelectedShiftIndex] = useState<SupportedIndexSymbol>('NIFTY 50');

  // Filters
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'TRIGGERED'>('ALL');
  const [indexFilter, setIndexFilter] = useState<string>('ALL');
  const [moneynessFilter, setMoneynessFilter] = useState<string>('ALL');

  // Filtered Alerts
  const filteredAlerts = alerts.filter((a) => {
    if (statusFilter === 'ACTIVE' && (!a.isActive || a.isTriggered)) return false;
    if (statusFilter === 'TRIGGERED' && !a.isTriggered) return false;
    if (indexFilter !== 'ALL' && a.indexSymbol !== indexFilter) return false;
    if (moneynessFilter !== 'ALL') {
      if (moneynessFilter === 'ATM' && a.moneyness !== 'ATM') return false;
      if (moneynessFilter === 'ITM' && a.moneyness !== 'SLIGHT_ITM' && a.moneyness !== 'DEEP_ITM')
        return false;
      if (moneynessFilter === 'OTM' && a.moneyness !== 'SLIGHT_OTM' && a.moneyness !== 'FAR_OTM')
        return false;
    }
    return true;
  });

  const activeCount = alerts.filter((a) => a.isActive && !a.isTriggered).length;
  const triggeredCount = alerts.filter((a) => a.isTriggered).length;

  const handleToggle = (id: string) => {
    const updated = toggleIndexAlertActive(id);
    onAlertsUpdated(updated);
  };

  const handleDelete = (id: string) => {
    const updated = deleteIndexAlert(id);
    onAlertsUpdated(updated);
  };

  const handleReset = (id: string) => {
    const updated = resetTriggeredIndexAlert(id);
    onAlertsUpdated(updated);
  };

  const handleQuickCreateShiftAlert = (preset: {
    indexSymbol: SupportedIndexSymbol;
    optionType: 'CE' | 'PE';
    action: 'BUY' | 'SELL';
    triggerType: 'INSTITUTIONAL_WRITING_SHIFT';
    triggerTargetValue: number;
  }) => {
    const newAlert = createIndexOptionAlert(
      {
        indexSymbol: preset.indexSymbol,
        moneyness: 'SLIGHT_ITM',
        optionType: preset.optionType,
        action: preset.action,
        triggerType: preset.triggerType,
        triggerTargetValue: preset.triggerTargetValue,
        soundEnabled: true,
        pushEnabled: true,
      },
      indicesData
    );
    const updated = [newAlert, ...alerts];
    localStorage.setItem('index_options_alerts_v2', JSON.stringify(updated));
    onAlertsUpdated(updated);
    playIndexAlertChime(preset.action === 'BUY' ? 'BULLISH' : 'BEARISH');
  };

  const handleTestSound = () => {
    playIndexAlertChime('HIGH');
  };

  return (
    <div id="index-options-alerts-hub-view" className="space-y-6">
      {/* Dedicated Section: Institutional Put/Call Writing Shifts & Positioning Monitor */}
      <InstitutionalWritingShiftMonitor
        indicesData={indicesData}
        selectedIndex={selectedShiftIndex}
        onSelectIndex={setSelectedShiftIndex}
        onQuickCreateShiftAlert={handleQuickCreateShiftAlert}
        theme={theme}
      />

      {/* Top Banner & Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div
          className={`p-4 rounded-2xl border ${
            isDark
              ? 'bg-slate-900/90 border-slate-800/80'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Watchers</span>
            <Bell className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400 font-mono">
            {activeCount}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Scanning multi-vector confluence in real time
          </p>
        </div>

        <div
          className={`p-4 rounded-2xl border ${
            isDark
              ? 'bg-slate-900/90 border-slate-800/80'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Triggered Today</span>
            <Zap className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 font-mono">
            {triggeredCount}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Breakouts & Squeeze conditions reached
          </p>
        </div>

        <div
          className={`p-4 rounded-2xl border ${
            isDark
              ? 'bg-slate-900/90 border-slate-800/80'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Coverage Spectrum</span>
            <Target className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-sm font-black text-slate-200 mt-1 flex items-center gap-1.5">
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
              ATM
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 font-bold border border-blue-500/30">
              ITM
            </span>
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
              OTM
            </span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Strict single-strike recommendation model
          </p>
        </div>

        <div
          className={`p-4 rounded-2xl border flex flex-col justify-between ${
            isDark
              ? 'bg-slate-900/90 border-slate-800/80'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-semibold uppercase tracking-wider">Audio Synthesizer</span>
            <Volume2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={handleTestSound}
              className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-colors"
            >
              <Play className="w-3 h-3 text-emerald-400" />
              <span>Test Chime</span>
            </button>
            <span className="text-[11px] text-emerald-400 font-mono font-medium">
              Web Audio Ready
            </span>
          </div>
        </div>
      </div>

      {/* Control Bar & Filters */}
      <div
        className={`p-3.5 sm:p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-3 ${
          isDark
            ? 'bg-slate-900/80 border-slate-800'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          <div className="flex items-center p-1 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                statusFilter === 'ALL'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({alerts.length})
            </button>
            <button
              onClick={() => setStatusFilter('ACTIVE')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                statusFilter === 'ACTIVE'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Active ({activeCount})
            </button>
            <button
              onClick={() => setStatusFilter('TRIGGERED')}
              className={`px-3 py-1 rounded-lg font-bold transition-all ${
                statusFilter === 'TRIGGERED'
                  ? 'bg-amber-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Triggered ({triggeredCount})
            </button>
          </div>

          {/* Index Filter */}
          <select
            value={indexFilter}
            onChange={(e) => setIndexFilter(e.target.value)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold ${
              isDark
                ? 'bg-slate-800 border-slate-700 text-slate-200'
                : 'bg-slate-50 border-slate-300 text-slate-800'
            }`}
          >
            <option value="ALL">All Indices</option>
            <option value="NIFTY 50">NIFTY 50</option>
            <option value="BANKNIFTY">BANKNIFTY</option>
            <option value="FINNIFTY">FINNIFTY</option>
            <option value="MIDCPNIFTY">MIDCPNIFTY</option>
            <option value="SENSEX">SENSEX</option>
          </select>

          {/* Moneyness Filter */}
          <select
            value={moneynessFilter}
            onChange={(e) => setMoneynessFilter(e.target.value)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold ${
              isDark
                ? 'bg-slate-800 border-slate-700 text-slate-200'
                : 'bg-slate-50 border-slate-300 text-slate-800'
            }`}
          >
            <option value="ALL">All Moneyness (ATM/ITM/OTM)</option>
            <option value="ATM">ATM (At-The-Money)</option>
            <option value="ITM">ITM (In-The-Money)</option>
            <option value="OTM">OTM (Out-Of-The-Money)</option>
          </select>
        </div>

        <button
          id="open-create-index-alert-btn"
          onClick={onOpenCreateModal}
          className="px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/30 flex items-center gap-1.5 transition-all"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Index Alert</span>
        </button>
      </div>

      {/* Alerts Grid */}
      {filteredAlerts.length === 0 ? (
        <div
          className={`p-10 rounded-2xl border text-center ${
            isDark
              ? 'bg-slate-900/60 border-slate-800 text-slate-400'
              : 'bg-white border-slate-200 text-slate-500'
          }`}
        >
          <Bell className="w-12 h-12 mx-auto text-slate-600 mb-3 opacity-50" />
          <h4 className="text-base font-bold text-slate-300">No Index Alerts Found</h4>
          <p className="text-xs text-slate-400 max-w-md mx-auto mt-1 mb-4">
            Create an intelligent alert to track ATM, ITM, or OTM Call/Put strikes on NIFTY, BANKNIFTY, FINNIFTY, MIDCPNIFTY, or SENSEX.
          </p>
          <button
            onClick={onOpenCreateModal}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-500 text-slate-950 hover:bg-emerald-400 transition-all inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Index Alert</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredAlerts.map((alert) => {
            const indexData = indicesData[alert.indexSymbol];
            const isCe = alert.optionType === 'CE';
            const liveStrikeItem = indexData?.battlefieldStrikes.find((s) => s.strike === alert.strike);
            const livePremium = liveStrikeItem
              ? isCe
                ? liveStrikeItem.callLtp
                : liveStrikeItem.putLtp
              : alert.entryPrice;

            const moneynessColorMap: Record<IndexStrikeMoneyness, string> = {
              ATM: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
              SLIGHT_ITM: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
              DEEP_ITM: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
              SLIGHT_OTM: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
              FAR_OTM: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
            };

            const moneynessLabelMap: Record<IndexStrikeMoneyness, string> = {
              ATM: 'ATM (At The Money)',
              SLIGHT_ITM: 'ITM (Optimal ⭐)',
              DEEP_ITM: 'ITM (Deep)',
              SLIGHT_OTM: 'OTM (Slight)',
              FAR_OTM: 'OTM (Far)',
            };

            return (
              <div
                key={alert.id}
                className={`relative rounded-2xl border transition-all overflow-hidden ${
                  alert.isTriggered
                    ? 'border-amber-500/80 bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900 shadow-xl shadow-amber-500/10 ring-2 ring-amber-500/40'
                    : alert.isActive
                    ? 'border-slate-700/80 bg-slate-900/90 hover:border-emerald-500/50'
                    : 'border-slate-800 bg-slate-950/60 opacity-70'
                }`}
              >
                {/* Triggered Banner */}
                {alert.isTriggered && (
                  <div className="bg-gradient-to-r from-amber-500 via-orange-600 to-red-600 px-4 py-1.5 text-white flex items-center justify-between text-xs font-black">
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 animate-bounce fill-current" />
                      <span>ALERT TRIGGERED @ {alert.triggeredAt}</span>
                    </div>
                    <span className="font-mono bg-black/30 px-2 py-0.5 rounded text-[10px]">
                      Trigger Price: ₹{alert.triggeredPrice?.toFixed(2) || alert.entryPrice}
                    </span>
                  </div>
                )}

                <div className="p-4 sm:p-5 space-y-4">
                  {/* Top Badges & Index Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-black text-white">{alert.indexSymbol}</span>
                      
                      {/* BUY / SELL BADGE */}
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-black uppercase ${
                          alert.action === 'BUY'
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-rose-500 text-white'
                        }`}
                      >
                        {alert.action}
                      </span>

                      {/* CALL / PUT BADGE */}
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-black uppercase ${
                          alert.optionType === 'CE'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                        }`}
                      >
                        {alert.optionType === 'CE' ? 'CALL (CE)' : 'PUT (PE)'}
                      </span>

                      {/* MONEYNESS BADGE (ATM, ITM, OTM) */}
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-black uppercase border ${
                          moneynessColorMap[alert.moneyness]
                        }`}
                      >
                        {moneynessLabelMap[alert.moneyness]}
                      </span>

                      {/* EXACT STRIKE BADGE */}
                      <span className="px-2 py-0.5 rounded text-xs font-mono font-black bg-slate-800 text-slate-200 border border-slate-700">
                        Strike {alert.strike}
                      </span>
                    </div>

                    {/* Active toggle */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleToggle(alert.id)}
                        className={`p-1.5 rounded-lg border transition-colors ${
                          alert.isActive
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/30'
                            : 'bg-slate-800 text-slate-500 border-slate-700 hover:text-slate-300'
                        }`}
                        title={alert.isActive ? 'Pause Alert' : 'Resume Alert'}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDelete(alert.id)}
                        className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-rose-400 border border-slate-700 transition-colors"
                        title="Delete Alert"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Contract Title & Trigger Condition */}
                  <div>
                    <h5 className="text-base font-black text-white font-mono flex items-center justify-between">
                      <span>{alert.contractName}</span>
                      <span className="text-emerald-400 text-sm">
                        Live LTP: ₹{livePremium.toFixed(2)}
                      </span>
                    </h5>
                    <div className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/70 mt-2 flex items-start gap-2 text-xs">
                      <Target className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-slate-200">Trigger Condition: </span>
                        <span className="text-slate-300">{alert.triggerConditionLabel}</span>
                        {alert.triggerMessage && (
                          <div className="text-[11px] text-amber-300 mt-1 font-medium bg-amber-950/40 p-1.5 rounded border border-amber-500/20">
                            {alert.triggerMessage}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Pricing Matrix: Entry, SL, Targets & Greeks */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2 rounded-xl bg-slate-800/50 border border-slate-700/50">
                      <span className="text-[10px] text-slate-400 uppercase font-semibold">Entry / Ref</span>
                      <div className="font-mono font-black text-slate-200 mt-0.5">
                        ₹{alert.entryPrice.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-emerald-400 font-medium mt-0.5">
                        R:R {alert.riskReward}
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-rose-950/20 border border-rose-500/20">
                      <span className="text-[10px] text-rose-300 uppercase font-semibold">Stop Loss</span>
                      <div className="font-mono font-black text-rose-400 mt-0.5">
                        ₹{alert.stopLoss.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-rose-300/80 mt-0.5">
                        -{alert.stopLossPercent}%
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-emerald-950/20 border border-emerald-500/20">
                      <span className="text-[10px] text-emerald-300 uppercase font-semibold">Target 1</span>
                      <div className="font-mono font-black text-emerald-400 mt-0.5">
                        ₹{alert.target1.toFixed(2)}
                      </div>
                      <div className="text-[10px] text-emerald-300/80 mt-0.5">
                        T2: ₹{alert.target2.toFixed(2)}
                      </div>
                    </div>

                    <div className="p-2 rounded-xl bg-indigo-950/20 border border-indigo-500/20">
                      <span className="text-[10px] text-indigo-300 uppercase font-semibold">Greeks</span>
                      <div className="font-mono font-bold text-indigo-200 mt-0.5 flex justify-between">
                        <span>Δ {alert.delta.toFixed(2)}</span>
                        <span>Γ {alert.gamma.toFixed(4)}</span>
                      </div>
                      <div className="font-mono text-[10px] text-indigo-300/80 mt-0.5">
                        Θ ₹{Math.abs(alert.theta).toFixed(1)}/d
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                      <Clock className="w-3 h-3" />
                      <span>Created {new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onTriggerTestAlert(alert)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition-colors"
                      >
                        <Zap className="w-3 h-3 text-amber-400" />
                        <span>Test Trigger</span>
                      </button>

                      {alert.isTriggered && (
                        <button
                          onClick={() => handleReset(alert.id)}
                          className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 flex items-center gap-1 transition-colors"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Re-arm</span>
                        </button>
                      )}

                      <button
                        onClick={() => onPlacePaperTradeFromAlert(alert)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-md shadow-emerald-500/20 flex items-center gap-1.5 transition-all"
                      >
                        <Rocket className="w-3.5 h-3.5 fill-current" />
                        <span>1-Click Paper Trade</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
