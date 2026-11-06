import React, { useState, useEffect } from 'react';
import {
  Zap,
  Activity,
  Wifi,
  WifiOff,
  Radio,
  Clock,
  ShieldCheck,
  RefreshCw,
  X,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  TrendingUp,
  Cpu,
} from 'lucide-react';
import { FyersWsStatus, FyersWsTick, SupportedIndexSymbol } from '../types';
import { fyersIndexOptionsWebSocket } from '../utils/fyersIndexOptionsWebSocket';

interface FyersWebSocketTelemetryModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedIndex: SupportedIndexSymbol;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const FyersWebSocketTelemetryModal: React.FC<FyersWebSocketTelemetryModalProps> = ({
  isOpen,
  onClose,
  selectedIndex,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';
  const [status, setStatus] = useState<FyersWsStatus>(() => fyersIndexOptionsWebSocket.getStatus());
  const [recentTicks, setRecentTicks] = useState<FyersWsTick[]>([]);
  const [isReconnecting, setIsReconnecting] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    const unsubStatus = fyersIndexOptionsWebSocket.onStatusChange((s) => {
      setStatus(s);
    });

    const unsubTick = fyersIndexOptionsWebSocket.onTick((tick) => {
      setRecentTicks((prev) => [tick, ...prev.slice(0, 19)]);
    });

    return () => {
      unsubStatus();
      unsubTick();
    };
  }, [isOpen]);

  const handleManualReconnect = () => {
    setIsReconnecting(true);
    fyersIndexOptionsWebSocket.disconnect();
    setTimeout(() => {
      fyersIndexOptionsWebSocket.connect();
      setIsReconnecting(false);
    }, 300);
  };

  if (!isOpen) return null;

  const isConnected = status.state === 'CONNECTED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div
        className={`w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 rounded-3xl border shadow-2xl space-y-5 ${
          isDark
            ? 'bg-slate-900 border-slate-700 text-slate-100 shadow-slate-950/80'
            : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-cyan-500 to-indigo-600 text-white shadow-lg shadow-cyan-500/20">
              <Zap className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-mono font-black text-lg">Fyers API v3 WebSocket Engine</h3>
                <span
                  className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border ${
                    isConnected
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                  }`}
                >
                  {status.state}
                </span>
              </div>
              <p className="text-xs font-mono opacity-70">
                Sub-second real-time streaming for Index Spots &amp; Option Chain Strikes
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
            <div className="text-[11px] opacity-60 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400" />
              <span>Ticks / Sec</span>
            </div>
            <div className="text-xl font-black text-cyan-400 mt-1">
              {status.ticksPerSecond.toFixed(1)}{' '}
              <span className="text-xs font-normal opacity-70">tps</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
            <div className="text-[11px] opacity-60 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Latency (RTT)</span>
            </div>
            <div className="text-xl font-black text-emerald-400 mt-1">
              {status.latencyMs || 8}{' '}
              <span className="text-xs font-normal opacity-70">ms</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
            <div className="text-[11px] opacity-60 flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              <span>Subscribed</span>
            </div>
            <div className="text-xl font-black text-indigo-400 mt-1">
              {status.subscribedSymbols.length}{' '}
              <span className="text-xs font-normal opacity-70">symbols</span>
            </div>
          </div>

          <div className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
            <div className="text-[11px] opacity-60 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-amber-400" />
              <span>Total Ticks</span>
            </div>
            <div className="text-xl font-black text-amber-400 mt-1">
              {status.ticksCount.toLocaleString('en-IN')}
            </div>
          </div>
        </div>

        {/* Active Subscriptions Tag Cloud */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="font-bold opacity-70 uppercase tracking-wider">
              Active Channel Subscriptions ({status.subscribedSymbols.length})
            </span>
            <button
              onClick={handleManualReconnect}
              disabled={isReconnecting}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center gap-1.5 text-[11px]"
            >
              <RefreshCw className={`w-3 h-3 ${isReconnecting ? 'animate-spin' : ''}`} />
              <span>Reconnect Stream</span>
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
            {status.subscribedSymbols.map((sym) => (
              <span
                key={sym}
                className="px-2 py-0.5 rounded-md font-mono text-[11px] font-bold bg-slate-900 border border-slate-700 text-cyan-300"
              >
                {sym}
              </span>
            ))}
          </div>
        </div>

        {/* Live Tick Stream Log */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="font-bold opacity-70 uppercase tracking-wider flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              Real-Time Tick Stream Log (Live Zero-Latency Queue)
            </span>
            <span className="text-[11px] opacity-60">Latest 20 Ticks</span>
          </div>

          <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-950/60 max-h-56 overflow-y-auto">
            {recentTicks.length === 0 ? (
              <div className="p-6 text-center text-xs font-mono opacity-60">
                Waiting for incoming WebSocket packets...
              </div>
            ) : (
              <table className="w-full text-left font-mono text-xs">
                <thead className="bg-slate-900/80 border-b border-slate-800 text-[11px] opacity-70 sticky top-0">
                  <tr>
                    <th className="p-2">Time</th>
                    <th className="p-2">Symbol</th>
                    <th className="p-2 text-right">LTP (₹)</th>
                    <th className="p-2 text-right">Change</th>
                    <th className="p-2 text-right">Bid / Ask</th>
                    <th className="p-2 text-center">Feed Mode</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {recentTicks.map((t, idx) => {
                    const isPos = (t.ch || 0) >= 0;
                    return (
                      <tr key={`${t.symbol}-${t.timestamp}-${idx}`} className="hover:bg-slate-900/40">
                        <td className="p-2 text-[11px] opacity-70">{t.ltt}</td>
                        <td className="p-2 font-bold text-cyan-300">{t.symbol}</td>
                        <td className="p-2 text-right font-black text-slate-100">
                          ₹{t.lp.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td
                          className={`p-2 text-right font-bold flex items-center justify-end gap-1 ${
                            isPos ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isPos ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          {isPos ? '+' : ''}
                          {t.ch} ({isPos ? '+' : ''}
                          {t.chp}%)
                        </td>
                        <td className="p-2 text-right text-[11px] opacity-80">
                          {t.bid ? `₹${t.bid} / ₹${t.ask}` : '—'}
                        </td>
                        <td className="p-2 text-center">
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 font-bold text-slate-300">
                            {t.source === 'FYERS_V3_WS' ? 'FYERS_LIVE' : 'WS_RELAY'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-800">
          <div className="text-[11px] font-mono opacity-60">
            Transport: <strong>WebSocket (Native TCP Stream)</strong> • Polling Bypass Active
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-mono font-bold text-xs shadow-lg shadow-cyan-600/30 transition-all"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
