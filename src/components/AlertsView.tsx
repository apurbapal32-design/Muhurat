import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Crosshair,
  DollarSign,
  Lock,
  Mail,
  MessageSquare,
  Newspaper,
  PieChart,
  Play,
  PlusCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Target,
  BookOpen,
  Layers,
  Sliders,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';
import { AlertConfig, AlertLogItem, ScannedStock, NewsItem, TradePosition } from '../types';
import { getMarketHoursAlertTime } from '../data/marketSchedule';
import { getInstitutionalEntryAction, getOiDetailedAction } from '../utils/sectorAndOiHelpers';

interface AlertsViewProps {
  config: AlertConfig;
  logs: AlertLogItem[];
  trades: TradePosition[];
  stocks?: ScannedStock[];
  news?: NewsItem[];
  onUpdateConfig: (newConfig: Partial<AlertConfig>) => void;
  onSendTestAlert: () => void;
  onCreateTrade?: (data: {
    symbol: string;
    signal: 'BUY' | 'SELL';
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    target1: number;
    target2: number;
  }) => void;
  onCloseTrade?: (tradeId: string) => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const AlertsView: React.FC<AlertsViewProps> = ({
  config,
  logs,
  trades,
  stocks,
  news,
  onUpdateConfig,
  onSendTestAlert,
  onCreateTrade,
  onCloseTrade,
  theme = 'dark',
}) => {
  const [subTab, setSubTab] = useState<'logs' | 'formula' | 'config'>('logs');
  const [formData, setFormData] = useState<AlertConfig>(config);
  const [savedMessage, setSavedMessage] = useState<string>('');
  const [logCategoryFilter, setLogCategoryFilter] = useState<'ALL' | 'ACCURACY_90' | 'GAP_UP' | 'GAP_DOWN' | 'LARGE_ORDER_QTY' | 'AI_SCORE'>('ALL');
  const [only90AccuracyOnly, setOnly90AccuracyOnly] = useState<boolean>(false);

  React.useEffect(() => {
    setFormData(config);
  }, [config]);

  const isDark = theme === 'dark';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateConfig(formData);
    setSavedMessage('Alert configuration saved successfully!');
    setTimeout(() => setSavedMessage(''), 3000);
  };

  // Helper to format ISO timestamp into readable Alert Create Time (Market Open Hours Restricted)
  const formatCreateTime = (isoString: string) => {
    if (!isoString) return '—';
    const marketTime = getMarketHoursAlertTime(isoString);
    const d = new Date(isoString);
    const dateStr = isNaN(d.getTime())
      ? 'Today'
      : d.toLocaleDateString('en-IN', {
          month: 'short',
          day: 'numeric',
        });
    return `${marketTime} (${dateStr})`;
  };

  return (
    <div className="space-y-6 my-6 font-sans">
      {/* View Header & Sub-Tab Bar */}
      <div
        className={`p-5 rounded-2xl border transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
          isDark
            ? 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-xl'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-3 rounded-xl font-bold flex items-center justify-center ${
              isDark
                ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                : 'bg-amber-50 text-amber-600 border border-amber-200'
            }`}
          >
            <Target className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black italic tracking-tight uppercase">
                Stock Alerts, Target Logs & Dispatch Rules
              </h2>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded uppercase border ${
                  isDark
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                    : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                }`}
              >
                Live Feed
              </span>
            </div>
            <p className="text-xs font-mono opacity-60">
              Track real-time alert creation time, live target 1/2 hits, and configure dispatch rules
            </p>
          </div>
        </div>

        {/* Navigation Sub-Tabs */}
        <div
          className={`flex items-center p-1 rounded-xl border text-xs font-mono font-bold uppercase ${
            isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}
        >
          <button
            onClick={() => setSubTab('logs')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 ${
              subTab === 'logs'
                ? isDark
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Alert History ({logs.length})</span>
          </button>

          <button
            onClick={() => setSubTab('formula')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 ${
              subTab === 'formula'
                ? isDark
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Stock Formula</span>
          </button>

          <button
            onClick={() => setSubTab('config')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 ${
              subTab === 'config'
                ? isDark
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" />
            <span>Dispatch Rules</span>
          </button>
        </div>
      </div>

      {/* ALERT DISPATCH LOG & TARGET HITS TAB */}
      {subTab === 'logs' && (
        <div
          className={`p-6 rounded-2xl border transition-colors ${
            isDark
              ? 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-xl'
              : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-800/80">
            <div>
              <h3 className="text-sm font-black italic tracking-tight uppercase flex items-center gap-2">
                <Clock className="w-4 h-4 text-emerald-400" />
                <span>Alert Creation Log, {(formData.minOrderSizeQty ?? 50000) >= 1000 ? `${Math.round((formData.minOrderSizeQty ?? 50000) / 1000)}k+` : `${formData.minOrderSizeQty ?? 50000}+`} Qty Orders & Target Hits</span>
              </h3>
              <p className="text-xs font-mono opacity-60 mt-0.5">
                Displays exact alert create time, {(formData.minOrderSizeQty ?? 50000).toLocaleString('en-IN')}+ Qty Purchase/Sale surges, RVol spikes, and live target hits
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div
                className={`flex items-center p-1 rounded-lg border text-[11px] font-mono font-bold uppercase ${
                  isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}
              >
                <button
                  onClick={() => setLogCategoryFilter('ACCURACY_90')}
                  className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                    logCategoryFilter === 'ACCURACY_90'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-300" />
                  <span>🎯 90%+ Accuracy ({logs.filter((l) => (l.accuracyScore || l.aiScore || 0) >= 90).length})</span>
                </button>
                <button
                  onClick={() => setLogCategoryFilter('GAP_UP')}
                  className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                    logCategoryFilter === 'GAP_UP'
                      ? 'bg-emerald-600 text-white shadow-md'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-300" />
                  <span>🟢 Gap Up ({logs.filter((l) => l.gapType === 'STRONG_GAP_UP' || l.gapType === 'GAP_UP' || (l.gapPct && l.gapPct > 0)).length})</span>
                </button>
                <button
                  onClick={() => setLogCategoryFilter('GAP_DOWN')}
                  className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                    logCategoryFilter === 'GAP_DOWN'
                      ? 'bg-rose-600 text-white shadow-md'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <TrendingUp className="w-3.5 h-3.5 text-rose-300 rotate-180" />
                  <span>🔴 Gap Down ({logs.filter((l) => l.gapType === 'STRONG_GAP_DOWN' || l.gapType === 'GAP_DOWN' || (l.gapPct && l.gapPct < 0)).length})</span>
                </button>
                <button
                  onClick={() => setLogCategoryFilter('ALL')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    logCategoryFilter === 'ALL'
                      ? 'bg-indigo-600 text-white'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  All ({logs.length})
                </button>
                <button
                  onClick={() => setLogCategoryFilter('LARGE_ORDER_QTY')}
                  className={`px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                    logCategoryFilter === 'LARGE_ORDER_QTY'
                      ? 'bg-amber-600 text-white'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  <Zap className="w-3 h-3 text-amber-300" />
                  <span>{(formData.minOrderSizeQty ?? 50000) >= 1000 ? `${Math.round((formData.minOrderSizeQty ?? 50000) / 1000)}k+` : `${formData.minOrderSizeQty ?? 50000}+`} Qty ({logs.filter((l) => l.alertCategory === 'LARGE_ORDER_QTY' || l.orderQty).length})</span>
                </button>
                <button
                  onClick={() => setLogCategoryFilter('AI_SCORE')}
                  className={`px-2.5 py-1 rounded transition-colors ${
                    logCategoryFilter === 'AI_SCORE'
                      ? 'bg-indigo-600 text-white'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  AI Score ({logs.filter((l) => !l.alertCategory || l.alertCategory === 'AI_SCORE').length})
                </button>
              </div>

              <button
                onClick={onSendTestAlert}
                className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold uppercase rounded transition-colors flex items-center gap-1.5 shadow-md"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Test Alert</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr
                  className={`uppercase text-[10px] font-bold border-b ${
                    isDark ? 'bg-slate-950/80 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <th className="py-2.5 px-3">Alert Create Time</th>
                  <th className="py-2.5 px-3">Symbol</th>
                  <th className="py-2.5 px-3">Accuracy Score</th>
                  <th className="py-2.5 px-3">Alert Type & Deal</th>
                  <th className="py-2.5 px-3 text-indigo-400 font-extrabold">Current Price</th>
                  <th className="py-2.5 px-3 text-emerald-400 font-extrabold">AI Alerts Price</th>
                  <th className="py-2.5 px-3 text-blue-400">60m Trend</th>
                  <th className="py-2.5 px-3">SL</th>
                  <th className="py-2.5 px-3">Target 1</th>
                  <th className="py-2.5 px-3">Target 2</th>
                  <th className="py-2.5 px-3">Target Hit Status</th>
                  <th className="py-2.5 px-3">Channels</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
                {logs.filter((item) => {
                  if (logCategoryFilter === 'ACCURACY_90') return (item.accuracyScore || item.aiScore || 0) >= 90;
                  if (logCategoryFilter === 'GAP_UP') return item.gapType === 'STRONG_GAP_UP' || item.gapType === 'GAP_UP' || (item.gapPct && item.gapPct > 0);
                  if (logCategoryFilter === 'GAP_DOWN') return item.gapType === 'STRONG_GAP_DOWN' || item.gapType === 'GAP_DOWN' || (item.gapPct && item.gapPct < 0);
                  if (logCategoryFilter === 'LARGE_ORDER_QTY') return item.alertCategory === 'LARGE_ORDER_QTY' || Boolean(item.orderQty);
                  if (logCategoryFilter === 'AI_SCORE') return !item.alertCategory || item.alertCategory === 'AI_SCORE';
                  return true;
                }).length === 0 ? (
                  <tr>
                    <td colSpan={13} className="py-8 text-center opacity-50 font-mono">
                      No alerts match the selected filter. Live scans check for AI Accuracy &ge; {formData.minScoreToAlert}% and {(formData.minOrderSizeQty ?? 50000).toLocaleString('en-IN')}+ Quantity Purchase/Sale.
                    </td>
                  </tr>
                ) : (
                  logs
                    .filter((item) => {
                      if (logCategoryFilter === 'ACCURACY_90') return (item.accuracyScore || item.aiScore || 0) >= 90;
                      if (logCategoryFilter === 'GAP_UP') return item.gapType === 'STRONG_GAP_UP' || item.gapType === 'GAP_UP' || (item.gapPct && item.gapPct > 0);
                      if (logCategoryFilter === 'GAP_DOWN') return item.gapType === 'STRONG_GAP_DOWN' || item.gapType === 'GAP_DOWN' || (item.gapPct && item.gapPct < 0);
                      if (logCategoryFilter === 'LARGE_ORDER_QTY') return item.alertCategory === 'LARGE_ORDER_QTY' || Boolean(item.orderQty);
                      if (logCategoryFilter === 'AI_SCORE') return !item.alertCategory || item.alertCategory === 'AI_SCORE';
                      return true;
                    })
                    .map((item, index) => {
                      const matchedStock = stocks?.find((s) => s.symbol === item.symbol);
                      const currentPrice = matchedStock?.price || item.price;
                      const sectorName = item.sector || matchedStock?.sector || 'General Market';
                      const secStatus = item.sectorStatus || (matchedStock && matchedStock.changePercent >= 0 ? 'POSITIVE' : 'NEGATIVE');
                      const secChg = item.sectorChangePercent ?? matchedStock?.changePercent ?? 1.2;
                      const isSecPos = secStatus === 'POSITIVE' || secChg >= 0;

                      const oiVal = item.oi || (matchedStock?.oiData ? `${(matchedStock.oiData.openInterest || 0).toFixed(2)}L` : '1.45M');
                      const oiChg = item.oiChangePercent ?? matchedStock?.oiData?.changeInOIPercent ?? 3.5;
                      const volX = item.volumeX || (matchedStock ? `${matchedStock.indicators.rvol || 1.5}x Vol` : '2.0x Vol');

                      const rsiVal = item.rsi ?? matchedStock?.indicators.rsi ?? 64.2;
                      const vwapVal = item.vwap ?? matchedStock?.indicators.vwap ?? Number((item.price * 0.995).toFixed(1));
                      const vwapPos = item.vwapStatus || (item.price >= vwapVal ? 'ABOVE' : 'BELOW');

                      const newsSent = item.newsSentiment || matchedStock?.newsSentiment || (item.signal === 'BUY' ? 'POSITIVE' : 'NEGATIVE');
                      const newsHeadline = item.newsTitle || matchedStock?.newsTitle || `${item.symbol} news sentiment & intraday market catalyst`;

                      const rationale = item.purchaseRationale || item.reason || (
                        item.signal === 'BUY' || item.dealType === 'PURCHASE'
                          ? `High Conviction Purchase: AI Score ${item.aiScore || 88}%, ${volX} surge, trading ${vwapPos === 'ABOVE' ? 'Above VWAP' : 'Below VWAP'} (₹${vwapVal}), RSI at ${rsiVal} (${rsiVal >= 60 ? 'Strong Bullish' : 'Neutral'}), Sector ${sectorName} (${isSecPos ? '+' : ''}${secChg}%), and Live News catalyst ${newsSent}.`
                          : `Bearish Sale Signal: AI Score ${item.aiScore || 85}%, trading ${vwapPos === 'ABOVE' ? 'Above VWAP' : 'Below VWAP'}, RSI ${rsiVal}, and Sector ${sectorName} pressure.`
                      );

                      return (
                        <React.Fragment key={`${item.id}-${index}`}>
                          <tr
                            className={`transition-colors border-b-0 ${
                              isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'
                            }`}
                          >
                            <td className="py-2.5 px-3 opacity-80 text-[11px] whitespace-nowrap">
                              <div className="flex items-center gap-1.5" title="Alert creation time restricted to market open hours (09:15 AM - 03:30 PM IST)">
                                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                                <span>{formatCreateTime(item.timestamp)}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-3 font-bold text-sm">
                              <div className="flex items-center gap-1.5">
                                <span>{item.symbol}</span>
                                {(item.alertCategory === 'LARGE_ORDER_QTY' || item.orderQty) && (
                                  <span className="px-1.5 py-0.5 text-[9px] bg-amber-500/20 text-amber-300 font-bold rounded border border-amber-500/30">
                                    {item.orderQty ? (item.orderQty >= 1000 ? `${Math.round(item.orderQty / 1000)}k+` : `${item.orderQty}+`) : '50k+'} Qty
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 text-[10px] font-bold rounded border inline-flex items-center gap-1 ${
                                  (item.accuracyScore || item.aiScore || 0) >= 90
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                }`}
                              >
                                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                                <span>🎯 {item.accuracyScore || item.aiScore || 92}% Accuracy</span>
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              {item.alertCategory === 'LARGE_ORDER_QTY' || item.dealType ? (
                                <div className="flex items-center gap-1">
                                  <span
                                    className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                                      item.dealType === 'PURCHASE' || item.signal === 'BUY'
                                        ? 'bg-emerald-500 text-slate-950'
                                        : 'bg-rose-500 text-white'
                                    }`}
                                  >
                                    {item.dealType || item.signal} SURGE
                                  </span>
                                  {item.orderQty && (
                                    <span className="text-[10px] font-bold text-amber-400">
                                      ({item.orderQty.toLocaleString('en-IN')} Qty)
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span
                                  className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                                    item.signal === 'BUY'
                                      ? 'bg-emerald-500 text-slate-950'
                                      : 'bg-rose-500 text-white'
                                  }`}
                                >
                                  {item.signal}
                                </span>
                              )}
                            </td>
                            {/* Current Price */}
                            <td className="py-2.5 px-3 font-extrabold text-indigo-300">₹{currentPrice.toLocaleString('en-IN')}</td>
                            {/* AI Alert Price */}
                            <td className="py-2.5 px-3 font-extrabold text-emerald-400">₹{item.price.toLocaleString('en-IN')}</td>
                            {/* 60m Trend TV Chart Link */}
                            <td className="py-2.5 px-3">
                              <button
                                onClick={() =>
                                  window.open(
                                    `https://in.tradingview.com/chart/?symbol=NSE:${item.symbol.replace('&', '_')}`,
                                    '_blank'
                                  )
                                }
                                className="px-2 py-0.5 text-[10px] font-bold rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors flex items-center gap-1 shrink-0"
                                title={`Open 60m TradingView Chart for ${item.symbol}`}
                              >
                                <span>📈 60m Chart</span>
                                <span className="text-[8px]">↗</span>
                              </button>
                            </td>
                            <td className="py-2.5 px-3 text-rose-400 font-bold">₹{item.stopLoss}</td>
                            <td className="py-2.5 px-3 text-emerald-400 font-bold">₹{item.target1}</td>
                            <td className="py-2.5 px-3 text-emerald-300 font-bold">₹{item.target2 || (item.target1 * 1.015).toFixed(1)}</td>
                            <td className="py-2.5 px-3">
                              {item.targetHitStatus === 'TARGET_1_HIT' && (
                                <span className="px-2 py-1 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1 w-fit">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                  <span>TARGET 1 HIT</span>
                                </span>
                              )}
                              {item.targetHitStatus === 'TARGET_2_HIT' && (
                                <span className="px-2 py-1 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 w-fit">
                                  <CheckCircle2 className="w-3 h-3 text-amber-400" />
                                  <span>TARGET 2 HIT</span>
                                </span>
                              )}
                              {item.targetHitStatus === 'STOP_LOSS_HIT' && (
                                <span className="px-2 py-1 text-[10px] font-bold rounded bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1 w-fit">
                                  <XCircle className="w-3 h-3 text-rose-400" />
                                  <span>STOP LOSS HIT</span>
                                </span>
                              )}
                              {(!item.targetHitStatus || item.targetHitStatus === 'ACTIVE') && (
                                <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1 w-fit">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-ping"></span>
                                  <span>ACTIVE TRACKING</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 opacity-60 text-[11px]">
                              {item.sentVia.join(', ')}
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              {onCreateTrade && (
                                <button
                                  onClick={() =>
                                    onCreateTrade({
                                      symbol: item.symbol,
                                      signal: item.signal === 'SELL' ? 'SELL' : 'BUY',
                                      entryPrice: item.price,
                                      quantity: 100,
                                      stopLoss: item.stopLoss,
                                      target1: item.target1,
                                      target2: item.target2 || Number((item.target1 * 1.015).toFixed(1)),
                                    })
                                  }
                                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold uppercase rounded transition-colors"
                                >
                                  Execute Trade
                                </button>
                              )}
                            </td>
                          </tr>

                          {/* Sub-row detailing all 6 required metrics */}
                          <tr
                            className={`border-b ${
                              isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-100/50 border-slate-200'
                            }`}
                          >
                            <td colSpan={13} className="py-2 px-3 font-mono">
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-2 flex-wrap text-[10px]">
                                  {/* i. Institutional Entry Buying or Selling */}
                                  {(() => {
                                    const inst = matchedStock
                                      ? getInstitutionalEntryAction(matchedStock)
                                      : {
                                          type: (item.dealType === 'PURCHASE' || item.signal === 'BUY' ? 'BUYING' : 'SELLING') as 'BUYING' | 'SELLING',
                                          label: (item.dealType === 'PURCHASE' || item.signal === 'BUY' ? 'INSTITUTIONAL BUYING' : 'INSTITUTIONAL SELLING') as 'INSTITUTIONAL BUYING' | 'INSTITUTIONAL SELLING',
                                          badgeBg: item.dealType === 'PURCHASE' || item.signal === 'BUY' ? 'bg-emerald-500/15' : 'bg-rose-500/15',
                                          badgeText: item.dealType === 'PURCHASE' || item.signal === 'BUY' ? 'text-emerald-400' : 'text-rose-400',
                                          badgeBorder: item.dealType === 'PURCHASE' || item.signal === 'BUY' ? 'border-emerald-500/30' : 'border-rose-500/30',
                                          description: 'Institutional block deal action',
                                          qtyLabel: item.orderQty ? `${item.orderQty.toLocaleString('en-IN')} Qty` : '50k+ Qty',
                                        };
                                    return (
                                      <div
                                        className={`px-2 py-0.5 rounded border font-bold flex items-center gap-1 ${inst.badgeBg} ${inst.badgeText} ${inst.badgeBorder}`}
                                        title={inst.description}
                                      >
                                        <Zap className="w-3 h-3 shrink-0" />
                                        <span>INSTITUTIONAL ENTRY: {inst.label.replace('INSTITUTIONAL ', '')}</span>
                                        <span>•</span>
                                        <span>{inst.qtyLabel}</span>
                                      </div>
                                    );
                                  })()}

                                  {/* ii. OI Change: Put Writing or Call Writing */}
                                  {(() => {
                                    const oiAction = matchedStock
                                      ? getOiDetailedAction(matchedStock)
                                      : {
                                          actionLabel: item.signal === 'BUY' ? ('PUT WRITING' as const) : ('CALL WRITING' as const),
                                          badgeBg: item.signal === 'BUY' ? 'bg-emerald-500/15' : 'bg-rose-500/15',
                                          badgeText: item.signal === 'BUY' ? 'text-emerald-400' : 'text-rose-400',
                                          badgeBorder: item.signal === 'BUY' ? 'border-emerald-500/30' : 'border-rose-500/30',
                                          changeInOIPercent: oiChg,
                                        };
                                    return (
                                      <div
                                        className={`px-2 py-0.5 rounded border font-bold flex items-center gap-1 ${oiAction.badgeBg} ${oiAction.badgeText} ${oiAction.badgeBorder}`}
                                      >
                                        <Activity className="w-3 h-3 shrink-0" />
                                        <span>OI CHANGE: {oiAction.actionLabel}</span>
                                        <span>({oiAction.changeInOIPercent >= 0 ? '+' : ''}{oiAction.changeInOIPercent}% OI)</span>
                                      </div>
                                    );
                                  })()}

                                  {/* iii. Sector in every stock & sign mention sector positive or negative */}
                                  <div className={`px-2 py-0.5 rounded border font-bold flex items-center gap-1 ${
                                    isSecPos ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                                  }`}>
                                    <PieChart className="w-3 h-3 shrink-0" />
                                    <span>SECTOR: {sectorName}</span>
                                    <span>•</span>
                                    <span>{isSecPos ? 'SECTOR POSITIVE (+)' : 'SECTOR NEGATIVE (-)'}</span>
                                    <span>({isSecPos ? '+' : ''}{secChg}%)</span>
                                  </div>

                                  {/* iv. RSI value */}

                                  <div className={`px-2 py-0.5 rounded border font-bold flex items-center gap-1 ${
                                    rsiVal >= 60 ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : rsiVal <= 40 ? 'bg-rose-500/10 border-rose-500/30 text-rose-300' : 'bg-blue-500/10 border-blue-500/30 text-blue-300'
                                  }`}>
                                    <Activity className="w-3 h-3 text-blue-400 shrink-0" />
                                    <span>RSI: {rsiVal}</span>
                                    <span>({rsiVal >= 60 ? 'Bullish' : rsiVal <= 40 ? 'Bearish' : 'Neutral'})</span>
                                  </div>

                                  {/* iv. VWAP above and down */}
                                  <div className={`px-2 py-0.5 rounded border font-bold flex items-center gap-1 ${
                                    vwapPos === 'ABOVE' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                                  }`}>
                                    <TrendingUp className="w-3 h-3 shrink-0" />
                                    <span>{vwapPos === 'ABOVE' ? '🟢 ABOVE VWAP' : '🔴 BELOW VWAP'}</span>
                                    <span>(₹{vwapVal})</span>
                                  </div>

                                  {/* v. Live stock news api negative or positive */}
                                  <div className={`px-2 py-0.5 rounded border font-bold flex items-center gap-1 ${
                                    newsSent === 'POSITIVE' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                                  }`} title={newsHeadline}>
                                    <Newspaper className="w-3 h-3 shrink-0" />
                                    <span>NEWS: {newsSent === 'POSITIVE' ? '🟢 POSITIVE (+)' : '🔴 NEGATIVE (-)'}</span>
                                  </div>
                                </div>

                                {/* vi. Why purchase the stock */}
                                <div className={`p-2 rounded-lg border text-[11px] leading-relaxed flex items-start gap-2 ${
                                  isDark ? 'bg-indigo-950/30 border-indigo-500/30 text-indigo-200' : 'bg-indigo-50 border-indigo-200 text-indigo-950'
                                }`}>
                                  <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-bold text-indigo-300 mr-1.5 uppercase tracking-wider text-[10px]">Why Purchase / Trade Rationale:</span>
                                    <span className="opacity-95">{rationale}</span>
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        </React.Fragment>
                      );
                    })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. ALERTS STOCK FORMULA & 100,000+ QTY PURCHASE/SALE MATRIX TAB */}
      {subTab === 'formula' && (
        <div className="space-y-6 font-mono">
          {/* Top Banner Header */}
          <div
            className={`p-6 rounded-2xl border transition-colors ${
              isDark
                ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-xl'
                : 'bg-white border-slate-200 text-slate-900 shadow-sm'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      Quantitative Signal Criteria
                    </span>
                    <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {(formData.minOrderSizeQty ?? 50000).toLocaleString('en-IN')}+ Qty Surge Engine
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black italic tracking-tight uppercase flex items-center gap-2 mt-1">
                    <span>Stock Alert Formula & Indicator Matrix</span>
                  </h2>
                </div>
              </div>

              <button
                onClick={onSendTestAlert}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold uppercase rounded transition-colors flex items-center gap-2 shadow-md shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Test Alert Dispatch</span>
              </button>
            </div>

            <p className="text-xs opacity-75 mt-3 max-w-4xl leading-relaxed">
              Standardized high-conviction breakout and volume surge formula. Scans stock candles for 13 &gt; 21 &gt; 34 EMA trend alignment, VWAP dominance, ADX trend strength (&gt;25), volume spikes (&gt;2x avg), RSI momentum (55–75), MACD bullish crossover, and Institutional {(formData.minOrderSizeQty ?? 50000).toLocaleString('en-IN')}+ share purchase/sale block deals.
            </p>
          </div>

          {/* Quick Indicator Formula Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <span className="text-[10px] uppercase font-bold text-amber-400 block mb-1">{(formData.minOrderSizeQty ?? 50000) >= 1000 ? `${Math.round((formData.minOrderSizeQty ?? 50000) / 1000)}k+` : `${formData.minOrderSizeQty ?? 50000}+`} Qty Surge</span>
              <span className="text-sm font-black text-slate-100">Block Order &ge;{(formData.minOrderSizeQty ?? 50000) >= 1000 ? `${Math.round((formData.minOrderSizeQty ?? 50000) / 1000)}k` : `${formData.minOrderSizeQty ?? 50000}`}</span>
              <span className="text-[10px] opacity-60 block mt-0.5">Purchase / Sale Surge</span>
            </div>

            <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <span className="text-[10px] uppercase font-bold text-indigo-400 block mb-1">EMA Trend Stack</span>
              <span className="text-sm font-black text-slate-100">13 &gt; 21 &gt; 34 EMA</span>
              <span className="text-[10px] opacity-60 block mt-0.5">Bullish Alignment</span>
            </div>

            <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <span className="text-[10px] uppercase font-bold text-emerald-400 block mb-1">VWAP Bias</span>
              <span className="text-sm font-black text-slate-100">Price Above VWAP</span>
              <span className="text-[10px] opacity-60 block mt-0.5">Intraday Buyers</span>
            </div>

            <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <span className="text-[10px] uppercase font-bold text-sky-400 block mb-1">Volume & RVOL</span>
              <span className="text-sm font-black text-slate-100">2x Avg / RVOL &gt;1.5</span>
              <span className="text-[10px] opacity-60 block mt-0.5">High Volume Surge</span>
            </div>

            <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <span className="text-[10px] uppercase font-bold text-purple-400 block mb-1">RSI & ADX</span>
              <span className="text-sm font-black text-slate-100">RSI 55–75 | ADX &gt;25</span>
              <span className="text-[10px] opacity-60 block mt-0.5">Momentum & Trend</span>
            </div>

            <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'}`}>
              <span className="text-[10px] uppercase font-bold text-rose-400 block mb-1">Target & SL</span>
              <span className="text-sm font-black text-slate-100">2-3x Risk / 1x ATR</span>
              <span className="text-[10px] opacity-60 block mt-0.5">Risk Management</span>
            </div>
          </div>

          {/* Main User Requested Formula Table */}
          <div
            className={`p-6 rounded-2xl border transition-colors ${
              isDark
                ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-xl'
                : 'bg-white border-slate-200 text-slate-900 shadow-sm'
            }`}
          >
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80">
              <div>
                <h3 className="text-base font-black italic uppercase flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  <span>Alerts Stock Formula Criteria & Conditions Matrix</span>
                </h3>
                <p className="text-xs opacity-60 mt-0.5">
                  {(formData.minOrderSizeQty ?? 50000).toLocaleString('en-IN')}+ Quantity Purchase/Sale & Technical Indicators Filter Blueprint
                </p>
              </div>

              <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-lg border border-emerald-500/20">
                14 Active Rules Mapped
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr
                    className={`uppercase text-[10px] font-bold tracking-wider border-b ${
                      isDark ? 'bg-slate-950/80 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                  >
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Indicator / Trigger</th>
                    <th className="py-3 px-4">Condition / Threshold</th>
                    <th className="py-3 px-4">Market Rationale</th>
                    <th className="py-3 px-4 text-right">System Action</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
                  <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-bold opacity-60">01</td>
                    <td className="py-3 px-4 font-bold text-amber-300 flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <span>{(formData.minOrderSizeQty ?? 50000).toLocaleString('en-IN')}+ Qty Purchase/Sale</span>
                    </td>
                    <td className="py-3 px-4 font-bold text-amber-400">Order Qty &ge; {(formData.minOrderSizeQty ?? 50000).toLocaleString('en-IN')} Shares</td>
                    <td className="py-3 px-4 opacity-80 text-[11px]">Identifies Institutional Big Money & Block Deal Accumulation/Distribution</td>
                    <td className="py-3 px-4 text-right font-bold text-amber-400">Trigger Priority Alert</td>
                  </tr>

                  <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-bold opacity-60">02</td>
                    <td className="py-3 px-4 font-bold text-slate-200">Trend</td>
                    <td className="py-3 px-4 font-bold text-emerald-400">13 EMA &gt; 21 EMA &gt; 34 EMA</td>
                    <td className="py-3 px-4 opacity-80 text-[11px]">Strict bullish short-to-mid term moving average stack</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-400">+20 AI Score</td>
                  </tr>

                  <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-bold opacity-60">03</td>
                    <td className="py-3 px-4 font-bold text-slate-200">VWAP</td>
                    <td className="py-3 px-4 font-bold text-emerald-400">Price above VWAP</td>
                    <td className="py-3 px-4 opacity-80 text-[11px]">Confirms buyers control the institutional intraday benchmark</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-400">+15 AI Score</td>
                  </tr>

                  <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-bold opacity-60">04</td>
                    <td className="py-3 px-4 font-bold text-slate-200">OI Change</td>
                    <td className="py-3 px-4 font-bold text-emerald-400">Above 10%</td>
                    <td className="py-3 px-4 opacity-80 text-[11px]">Signals strong Open Interest expansion (Long Builtup)</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-400">F&O Signal Boost</td>
                  </tr>

                  <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-bold opacity-60">05</td>
                    <td className="py-3 px-4 font-bold text-slate-200">Volume</td>
                    <td className="py-3 px-4 font-bold text-emerald-400">Above 2&times; average</td>
                    <td className="py-3 px-4 opacity-80 text-[11px]">Massive volume participation confirming price breakout move</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-400">+10 AI Score</td>
                  </tr>

                  <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-bold opacity-60">06</td>
                    <td className="py-3 px-4 font-bold text-slate-200">RVOL</td>
                    <td className="py-3 px-4 font-bold text-emerald-400">Above 1.5</td>
                    <td className="py-3 px-4 opacity-80 text-[11px]">Relative Volume ratio &gt; 1.5x compared to 20-period baseline</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-400">+10 AI Score</td>
                  </tr>

                  <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-bold opacity-60">07</td>
                    <td className="py-3 px-4 font-bold text-slate-200">ADX</td>
                    <td className="py-3 px-4 font-bold text-emerald-400">Above 25</td>
                    <td className="py-3 px-4 opacity-80 text-[11px]">Validates high directional trend strength (Avoids sideways chop)</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-400">+10 AI Score</td>
                  </tr>

                  <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-bold opacity-60">08</td>
                    <td className="py-3 px-4 font-bold text-slate-200">RSI</td>
                    <td className="py-3 px-4 font-bold text-emerald-400">55–75</td>
                    <td className="py-3 px-4 opacity-80 text-[11px]">Optimal bullish momentum zone before entering extreme overbought (&gt;80)</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-400">+10 AI Score</td>
                  </tr>

                  <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-bold opacity-60">09</td>
                    <td className="py-3 px-4 font-bold text-slate-200">MACD</td>
                    <td className="py-3 px-4 font-bold text-emerald-400">Bullish crossover</td>
                    <td className="py-3 px-4 opacity-80 text-[11px]">MACD Line cuts above Signal Line with positive histogram expansion</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-400">+15 AI Score</td>
                  </tr>

                  <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-bold opacity-60">10</td>
                    <td className="py-3 px-4 font-bold text-slate-200">Breakout</td>
                    <td className="py-3 px-4 font-bold text-emerald-400">Above previous day's high</td>
                    <td className="py-3 px-4 opacity-80 text-[11px]">Key price action breakout clearing previous day resistance level</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-400">+5 AI Score</td>
                  </tr>

                  <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-bold opacity-60">11</td>
                    <td className="py-3 px-4 font-bold text-slate-200">Target</td>
                    <td className="py-3 px-4 font-bold text-emerald-400">2–3&times; risk</td>
                    <td className="py-3 px-4 opacity-80 text-[11px]">Target 1 at 2x Risk (Book 50%) and Target 2 at 3x Risk (Full Exit)</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-300">Target 1/2 Hit Track</td>
                  </tr>

                  <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-bold opacity-60">12</td>
                    <td className="py-3 px-4 font-bold text-slate-200">Stop Loss</td>
                    <td className="py-3 px-4 font-bold text-rose-400">1 &times; ATR</td>
                    <td className="py-3 px-4 opacity-80 text-[11px]">Dynamic volatility-adjusted stop distance based on 14-period ATR</td>
                    <td className="py-3 px-4 text-right font-bold text-rose-400">Auto Stop Protection</td>
                  </tr>

                  <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-bold opacity-60">13</td>
                    <td className="py-3 px-4 font-bold text-emerald-300 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-emerald-400" />
                      <span>Gap Up Formula</span>
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-400">Open &ge; Prev Close +1.0% (Strong &ge; +2.0%)</td>
                    <td className="py-3 px-4 opacity-80 text-[11px]">Overnight bullish demand, institutional pre-market accumulation &amp; VWAP hold</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-400">Trigger Gap Up Alert</td>
                  </tr>

                  <tr className={isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50'}>
                    <td className="py-3 px-4 font-bold opacity-60">14</td>
                    <td className="py-3 px-4 font-bold text-rose-300 flex items-center gap-1.5">
                      <TrendingUp className="w-4 h-4 text-rose-400 rotate-180" />
                      <span>Gap Down Formula</span>
                    </td>
                    <td className="py-3 px-4 font-bold text-rose-400">Open &le; Prev Close -1.0% (Strong &le; -2.0%)</td>
                    <td className="py-3 px-4 opacity-80 text-[11px]">Overnight bearish distribution, institutional short buildup &amp; below VWAP breakdown</td>
                    <td className="py-3 px-4 text-right font-bold text-rose-400">Trigger Gap Down Alert</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. DISPATCH CONFIGURATION TAB */}
      {subTab === 'config' && (
        <div
          className={`p-6 rounded-2xl border transition-colors ${
            isDark
              ? 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-xl'
              : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div
                className={`p-2.5 rounded-xl font-bold ${
                  isDark ? 'bg-indigo-500/10 text-indigo-400' : 'bg-indigo-50 text-indigo-700'
                }`}
              >
                <AlertTriangle className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-base font-black italic tracking-tight uppercase">
                  Real-Time Dispatch Rules & Webhooks
                </h2>
                <p className="text-xs font-mono opacity-60">
                  Instant notifications via Telegram, WhatsApp, or Email when AI Score &ge; Threshold
                </p>
              </div>
            </div>

            <button
              onClick={async () => {
                await onSendTestAlert();
                setSubTab('logs');
                setLogCategoryFilter('ALL');
                setSavedMessage('Test alert dispatched and logged into Alert History!');
                setTimeout(() => setSavedMessage(''), 3500);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-bold uppercase rounded transition-colors flex items-center gap-2 shadow-md"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Test Alert</span>
            </button>
          </div>

          {savedMessage && (
            <div className="mb-4 p-3 bg-emerald-600 text-white font-mono text-xs rounded border flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{savedMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Min Score Threshold Slider */}
            <div
              className={`p-4 rounded-xl border font-mono ${
                isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold flex items-center gap-2 uppercase">
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                  <span>Minimum AI Score to Trigger Alert</span>
                </label>
                <span className="text-sm font-bold text-white bg-indigo-600 px-3 py-0.5 rounded">
                  {formData.minScoreToAlert} / 100
                </span>
              </div>
              <input
                type="range"
                min="60"
                max="95"
                step="5"
                value={formData.minScoreToAlert}
                onChange={(e) =>
                  setFormData({ ...formData, minScoreToAlert: Number(e.target.value) })
                }
                className="w-full accent-indigo-500 cursor-pointer"
              />
              <p className="text-[10px] opacity-60 mt-1">
                Recommended: 80+ for high confluence setups.
              </p>
            </div>

            {/* 100,000+ Quantity Order Size & RVol Purchase/Sale Alert Rules Card */}
            <div
              className={`p-5 rounded-xl border font-mono transition-colors ${
                isDark
                  ? 'bg-slate-950/90 border-amber-500/30 text-slate-100'
                  : 'bg-amber-50/50 border-amber-200 text-slate-900'
              }`}
            >
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 mb-4 border-b border-amber-500/20">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-amber-500/20 text-amber-400 rounded-lg border border-amber-500/30 font-bold">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                      <span>Volume & RVol {(formData.minOrderSizeQty ?? 50000).toLocaleString('en-IN')}+ Quantity Alert Engine</span>
                      <span className="px-2 py-0.5 text-[9px] bg-amber-500/20 text-amber-300 rounded border border-amber-500/40 font-bold">
                        Institutional Spike
                      </span>
                    </h3>
                    <p className="text-[11px] opacity-70">
                      Generates instant alerts when order size &ge; {(formData.minOrderSizeQty ?? 50000).toLocaleString('en-IN')} Quantity for Purchase or Sale with High Relative Volume (RVol)
                    </p>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-lg border bg-amber-500/10 border-amber-500/30 text-amber-300 font-bold text-xs uppercase">
                  <input
                    type="checkbox"
                    checked={formData.enableOrderQtyAlert !== false}
                    onChange={(e) =>
                      setFormData({ ...formData, enableOrderQtyAlert: e.target.checked })
                    }
                    className="w-4 h-4 accent-amber-500 cursor-pointer"
                  />
                  <span>Enable {(formData.minOrderSizeQty ?? 50000) >= 1000 ? `${Math.round((formData.minOrderSizeQty ?? 50000) / 1000)}k+` : `${formData.minOrderSizeQty ?? 50000}+`} Qty Alerts</span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Order Quantity Threshold */}
                <div>
                  <label className="opacity-70 font-bold uppercase block mb-1.5">
                    Order Size Quantity Threshold:
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="5000"
                      min="5000"
                      value={formData.minOrderSizeQty ?? 50000}
                      onChange={(e) =>
                        setFormData({ ...formData, minOrderSizeQty: Number(e.target.value) })
                      }
                      className={`w-full px-3 py-2 rounded border font-bold text-xs focus:outline-none ${
                        isDark ? 'bg-slate-900 border-slate-700 text-amber-300' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                    <span className="font-bold opacity-60 text-[10px] uppercase whitespace-nowrap">Shares</span>
                  </div>
                  <p className="text-[10px] opacity-60 mt-1">
                    Triggers when estimated transaction or candle surge &ge; { (formData.minOrderSizeQty ?? 50000).toLocaleString('en-IN') } Qty
                  </p>
                </div>

                {/* Min RVol Multiplier */}
                <div>
                  <label className="opacity-70 font-bold uppercase block mb-1.5">
                    Minimum RVol (Relative Volume):
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.1"
                      min="1.0"
                      max="10.0"
                      value={formData.minRvolForOrderAlert ?? 1.5}
                      onChange={(e) =>
                        setFormData({ ...formData, minRvolForOrderAlert: Number(e.target.value) })
                      }
                      className={`w-full px-3 py-2 rounded border font-bold text-xs focus:outline-none ${
                        isDark ? 'bg-slate-900 border-slate-700 text-emerald-400' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                    <span className="font-bold opacity-60 text-[10px] uppercase whitespace-nowrap">x Multiplier</span>
                  </div>
                  <p className="text-[10px] opacity-60 mt-1">
                    Relative volume must be &ge; {formData.minRvolForOrderAlert ?? 1.5}x average 20-candle volume
                  </p>
                </div>

                {/* Order Side Filter */}
                <div>
                  <label className="opacity-70 font-bold uppercase block mb-1.5">
                    Order Side Filter:
                  </label>
                  <select
                    value={formData.orderTypeFilter ?? 'BOTH'}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        orderTypeFilter: e.target.value as 'BOTH' | 'PURCHASE_ONLY' | 'SALE_ONLY',
                      })
                    }
                    className={`w-full px-3 py-2 rounded border font-bold text-xs focus:outline-none ${
                      isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="BOTH">🟢 Purchase & 🔴 Sale (Both)</option>
                    <option value="PURCHASE_ONLY">🟢 Purchase Only (Buy Surges)</option>
                    <option value="SALE_ONLY">🔴 Sale Only (Sell Dumps)</option>
                  </select>
                  <p className="text-[10px] opacity-60 mt-1">
                    Filter alert delivery by direction
                  </p>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="mt-4 pt-3 border-t border-amber-500/20 flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase opacity-60 mr-1">Quick Presets:</span>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      enableOrderQtyAlert: true,
                      minOrderSizeQty: 50000,
                      minRvolForOrderAlert: 1.5,
                      orderTypeFilter: 'BOTH',
                    })
                  }
                  className="px-2.5 py-1 text-[10px] font-bold uppercase bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 rounded border border-amber-500/30 transition-colors"
                >
                  ⚡ 50k Qty + 1.5x RVol (Standard Baseline)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      enableOrderQtyAlert: true,
                      minOrderSizeQty: 100000,
                      minRvolForOrderAlert: 2.0,
                      orderTypeFilter: 'BOTH',
                    })
                  }
                  className="px-2.5 py-1 text-[10px] font-bold uppercase bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30 transition-colors"
                >
                  🔥 100k Qty + 2.0x RVol (High Vol)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setFormData({
                      ...formData,
                      enableOrderQtyAlert: true,
                      minOrderSizeQty: 250000,
                      minRvolForOrderAlert: 2.5,
                      orderTypeFilter: 'BOTH',
                    })
                  }
                  className="px-2.5 py-1 text-[10px] font-bold uppercase bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 rounded border border-emerald-500/30 transition-colors"
                >
                  🚀 250k Qty + 2.5x RVol (Institutional Block)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono">
              {/* Telegram Settings */}
              <div
                className={`p-4 rounded-xl border ${
                  isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 font-bold text-xs uppercase">
                    <MessageSquare className="w-4 h-4 text-indigo-400" />
                    <span>Telegram Bot</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.enableTelegram}
                    onChange={(e) =>
                      setFormData({ ...formData, enableTelegram: e.target.checked })
                    }
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="opacity-60 block mb-1 uppercase text-[10px] font-bold">Bot Token</label>
                    <input
                      type="password"
                      placeholder="123456789:ABCdef..."
                      value={formData.telegramBotToken}
                      onChange={(e) =>
                        setFormData({ ...formData, telegramBotToken: e.target.value })
                      }
                      className={`w-full px-3 py-1.5 rounded border text-xs font-bold focus:outline-none ${
                        isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="opacity-60 block mb-1 uppercase text-[10px] font-bold">Chat ID</label>
                    <input
                      type="text"
                      placeholder="-100123456789"
                      value={formData.telegramChatId}
                      onChange={(e) =>
                        setFormData({ ...formData, telegramChatId: e.target.value })
                      }
                      className={`w-full px-3 py-1.5 rounded border text-xs font-bold focus:outline-none ${
                        isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* WhatsApp Business API */}
              <div
                className={`p-4 rounded-xl border ${
                  isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 font-bold text-xs uppercase">
                    <Smartphone className="w-4 h-4 text-emerald-400" />
                    <span>WhatsApp Cloud API</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.enableWhatsapp}
                    onChange={(e) =>
                      setFormData({ ...formData, enableWhatsapp: e.target.checked })
                    }
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="opacity-60 block mb-1 uppercase text-[10px] font-bold">Phone (+91...)</label>
                    <input
                      type="text"
                      placeholder="+919876543210"
                      value={formData.whatsappPhone}
                      onChange={(e) =>
                        setFormData({ ...formData, whatsappPhone: e.target.value })
                      }
                      className={`w-full px-3 py-1.5 rounded border text-xs font-bold focus:outline-none ${
                        isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="opacity-60 block mb-1 uppercase text-[10px] font-bold">API Access Key</label>
                    <input
                      type="password"
                      placeholder="EAAB..."
                      value={formData.whatsappApiKey}
                      onChange={(e) =>
                        setFormData({ ...formData, whatsappApiKey: e.target.value })
                      }
                      className={`w-full px-3 py-1.5 rounded border text-xs font-bold focus:outline-none ${
                        isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>
              </div>

              {/* Email SMTP */}
              <div
                className={`p-4 rounded-xl border ${
                  isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2 font-bold text-xs uppercase">
                    <Mail className="w-4 h-4 text-amber-400" />
                    <span>Email Dispatch</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formData.enableEmail}
                    onChange={(e) =>
                      setFormData({ ...formData, enableEmail: e.target.checked })
                    }
                    className="w-4 h-4 accent-indigo-600 cursor-pointer"
                  />
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="opacity-60 block mb-1 uppercase text-[10px] font-bold">Recipient Email</label>
                    <input
                      type="email"
                      placeholder="trader@domain.com"
                      value={formData.emailRecipient}
                      onChange={(e) =>
                        setFormData({ ...formData, emailRecipient: e.target.value })
                      }
                      className={`w-full px-3 py-1.5 rounded border text-xs font-bold focus:outline-none ${
                        isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="opacity-60 block mb-1 uppercase text-[10px] font-bold">SMTP Host</label>
                    <input
                      type="text"
                      placeholder="smtp.gmail.com:587"
                      value={formData.emailSmtpHost}
                      onChange={(e) =>
                        setFormData({ ...formData, emailSmtpHost: e.target.value })
                      }
                      className={`w-full px-3 py-1.5 rounded border text-xs font-bold focus:outline-none ${
                        isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-2 font-mono">
              <button
                type="submit"
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase rounded transition-colors shadow-md"
              >
                Save Alert Preferences
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
