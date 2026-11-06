import React, { useEffect } from 'react';
import {
  Bell,
  CheckCircle2,
  ChevronRight,
  Flame,
  Rocket,
  Shield,
  Volume2,
  X,
  Zap,
} from 'lucide-react';
import { IndexOptionAlert, IndexStrikeMoneyness } from '../types';

interface IndexAlertToastBannerProps {
  alert: IndexOptionAlert | null;
  onDismiss: () => void;
  onTradeNow: (alert: IndexOptionAlert) => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const IndexAlertToastBanner: React.FC<IndexAlertToastBannerProps> = ({
  alert,
  onDismiss,
  onTradeNow,
  theme = 'dark',
}) => {
  useEffect(() => {
    if (!alert) return;
    const timer = setTimeout(() => {
      onDismiss();
    }, 12000); // auto dismiss after 12s
    return () => clearTimeout(timer);
  }, [alert, onDismiss]);

  if (!alert) return null;

  const moneynessColorMap: Record<IndexStrikeMoneyness, string> = {
    ATM: 'bg-amber-400 text-slate-950',
    SLIGHT_ITM: 'bg-emerald-400 text-slate-950',
    DEEP_ITM: 'bg-blue-400 text-slate-950',
    SLIGHT_OTM: 'bg-purple-400 text-slate-950',
    FAR_OTM: 'bg-rose-400 text-slate-950',
  };

  const moneynessLabelMap: Record<IndexStrikeMoneyness, string> = {
    ATM: 'ATM',
    SLIGHT_ITM: 'SLIGHT ITM',
    DEEP_ITM: 'DEEP ITM',
    SLIGHT_OTM: 'SLIGHT OTM',
    FAR_OTM: 'FAR OTM',
  };

  return (
    <div
      id="index-alert-live-toast-banner"
      className="fixed top-20 right-4 z-50 max-w-md w-full animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto"
    >
      <div className="rounded-2xl border-2 border-amber-400 bg-slate-950/95 text-white shadow-2xl shadow-amber-500/25 overflow-hidden backdrop-blur-xl ring-2 ring-amber-400/40">
        {/* Header Ribbon */}
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-600 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
            <span className="text-xs font-black tracking-wider uppercase flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 fill-current" />
              INDEX OPTION ALERT FIRED
            </span>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded-md bg-black/20 hover:bg-black/40 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-black text-emerald-400">{alert.indexSymbol}</span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-black uppercase ${
                alert.action === 'BUY' ? 'bg-emerald-500 text-slate-950' : 'bg-rose-500 text-white'
              }`}
            >
              {alert.action}
            </span>
            <span className="px-2 py-0.5 rounded text-[11px] font-black bg-indigo-500/30 text-indigo-200 border border-indigo-400/40">
              {alert.optionType === 'CE' ? 'CALL (CE)' : 'PUT (PE)'}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-black uppercase ${
                moneynessColorMap[alert.moneyness]
              }`}
            >
              {moneynessLabelMap[alert.moneyness]}
            </span>
          </div>

          <div>
            <div className="text-base font-black text-white font-mono">
              {alert.contractName}
            </div>
            <div className="text-xs text-amber-200/90 font-medium mt-1">
              {alert.triggerMessage || alert.triggerConditionLabel}
            </div>
          </div>

          {/* Quick Metrics */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs py-1">
            <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-slate-400 uppercase">Entry LTP</span>
              <div className="font-mono font-black text-emerald-400">
                ₹{alert.entryPrice.toFixed(2)}
              </div>
            </div>
            <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-rose-300 uppercase">Stop Loss</span>
              <div className="font-mono font-black text-rose-400">
                ₹{alert.stopLoss.toFixed(2)}
              </div>
            </div>
            <div className="p-1.5 rounded-lg bg-slate-900 border border-slate-800">
              <span className="text-[10px] text-emerald-300 uppercase">Target 1</span>
              <div className="font-mono font-black text-emerald-400">
                ₹{alert.target1.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Action Button */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={() => {
                onTradeNow(alert);
                onDismiss();
              }}
              className="w-full py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 transition-all"
            >
              <Rocket className="w-4 h-4 fill-current" />
              <span>Execute 1-Click Paper Trade</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
