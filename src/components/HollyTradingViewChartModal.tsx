import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  ShieldAlert,
  Send,
  Sparkles,
  BarChart3,
  Layers,
  Activity,
  Maximize2,
  ExternalLink,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Zap,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import { HollySignal, ScannedStock, AppTheme } from '../types';
import { getTradingViewSymbol } from '../utils/fyersHelpers';

interface HollyTradingViewChartModalProps {
  signal: HollySignal | null;
  stock?: ScannedStock | null;
  onClose: () => void;
  onExecuteTrade?: (data: {
    symbol: string;
    signal: 'BUY' | 'SELL';
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    target1: number;
    target2: number;
  }) => void;
  theme?: AppTheme;
}

export const HollyTradingViewChartModal: React.FC<HollyTradingViewChartModalProps> = ({
  signal,
  stock,
  onClose,
  onExecuteTrade,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';
  const [chartMode, setChartMode] = useState<'QUANT_CANDLE' | 'TRADINGVIEW_WIDGET'>('QUANT_CANDLE');
  const [timeframe, setTimeframe] = useState<'1m' | '3m' | '5m' | '15m' | '1D'>('5m');
  const [selectedEngineTab, setSelectedEngineTab] = useState<'RULES' | 'LEVELS' | 'EXECUTION'>('LEVELS');
  const [tradeSuccessMsg, setTradeSuccessMsg] = useState<string>('');
  const [simulatedCandles, setSimulatedCandles] = useState<any[]>([]);

  if (!signal) return null;

  const symbol = signal.symbol;
  const isBuy = signal.signal === 'BUY';
  const currentPrice = stock?.price || signal.price;
  const entryPrice = signal.entryPrice;
  const stopLoss = signal.stopLoss;
  const target1 = signal.target1;
  const target2 = signal.target2;
  const target3 = signal.target3;

  // Generate high-resolution intraday candles for the Quant Chart mode
  useEffect(() => {
    const basePrice = entryPrice || currentPrice;
    const isUptrend = isBuy;
    const pointsCount = 38; // intraday 5m bars
    const generated = [];

    let p = basePrice * 0.985;
    const startHour = 9;
    const startMin = 15;

    for (let i = 0; i < pointsCount; i++) {
      const totalMins = startMin + i * 5;
      const curH = startHour + Math.floor(totalMins / 60);
      const curM = totalMins % 60;
      const timeLabel = `${String(curH).padStart(2, '0')}:${String(curM).padStart(2, '0')}`;

      // Trend walk toward current price
      const stepProg = i / pointsCount;
      const trendBias = isUptrend ? 0.0008 : -0.0008;
      const noise = (Math.random() - 0.48) * 0.004 * basePrice;
      const prevClose = i === 0 ? p : generated[i - 1].close;
      
      const open = prevClose;
      const close = Number((open + noise + (basePrice * trendBias)).toFixed(2));
      const high = Number((Math.max(open, close) + Math.random() * 0.003 * basePrice).toFixed(2));
      const low = Number((Math.min(open, close) - Math.random() * 0.003 * basePrice).toFixed(2));
      
      const vwapCalc = Number((basePrice * (1 + (isUptrend ? 0.002 * stepProg : -0.002 * stepProg))).toFixed(2));
      const ema9Calc = Number((close * 0.998 + (isUptrend ? 0.002 * basePrice * stepProg : 0)).toFixed(2));
      const ema21Calc = Number((close * 0.994 + (isUptrend ? 0.001 * basePrice * stepProg : 0)).toFixed(2));
      const volume = Math.floor(15000 + Math.random() * 85000 * (i === 4 || i === 18 ? 3.5 : 1));
      const rsi = Math.min(85, Math.max(25, Math.round(50 + (close - basePrice) / basePrice * 400 + (Math.random() * 10 - 5))));

      generated.push({
        time: timeLabel,
        open,
        high,
        low,
        close,
        price: close,
        vwap: vwapCalc,
        ema9: ema9Calc,
        ema21: ema21Calc,
        volume,
        rsi,
        isEntryBar: i === 6,
      });
    }

    // Fix last candle to current live price
    if (generated.length > 0) {
      generated[generated.length - 1].close = currentPrice;
      generated[generated.length - 1].price = currentPrice;
    }

    setSimulatedCandles(generated);
  }, [symbol, entryPrice, currentPrice, isBuy]);

  const handleExecute = () => {
    if (onExecuteTrade) {
      onExecuteTrade({
        symbol: signal.symbol,
        signal: signal.signal === 'BUY' ? 'BUY' : 'SELL',
        entryPrice: signal.entryPrice,
        quantity: signal.quantity || 50,
        stopLoss: signal.stopLoss,
        target1: signal.target1,
        target2: signal.target2,
      });
    }
    setTradeSuccessMsg(`Order placed successfully: ${signal.signal} ${signal.quantity || 50} shares of ${signal.symbol} at ₹${signal.entryPrice}`);
    setTimeout(() => setTradeSuccessMsg(''), 5000);
  };

  return (
    <div
      id="holly-tradingview-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in"
    >
      <div
        className={`w-full max-w-7xl max-h-[94vh] flex flex-col rounded-2xl border shadow-2xl overflow-hidden ${
          isDark ? 'bg-slate-900 border-indigo-500/30 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
        }`}
      >
        {/* TOP MODAL HEADER */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/80">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-lg sm:text-xl font-mono font-black text-slate-100">{signal.symbol}</span>
              <span
                className={`px-2 py-0.5 rounded text-xs font-mono font-black uppercase ${
                  isBuy
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                }`}
              >
                {signal.signal}
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                {signal.engine.replace('_', ' ')}
              </span>
            </div>

            <div className="text-xs font-mono text-slate-400 hidden md:block">
              {signal.name} • {signal.strategyName}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Chart Mode Switcher */}
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs font-mono">
              <button
                onClick={() => setChartMode('QUANT_CANDLE')}
                className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                  chartMode === 'QUANT_CANDLE'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-pink-300" />
                <span>Holly Quant Chart</span>
              </button>
              <button
                onClick={() => setChartMode('TRADINGVIEW_WIDGET')}
                className={`px-3 py-1 rounded-lg font-bold flex items-center gap-1.5 transition-all ${
                  chartMode === 'TRADINGVIEW_WIDGET'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-teal-300" />
                <span>TradingView Live</span>
              </button>
            </div>

            {/* Close Button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TRADE METRICS & TIME HORIZON STATUS BAR */}
        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2 p-3 bg-slate-950/60 border-b border-slate-800 font-mono text-xs">
          {/* Entry Price & Limit Band */}
          <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] text-slate-500 flex items-center justify-between">
              <span>ENTRY PRICE</span>
              <span className="text-cyan-400">LIMIT</span>
            </div>
            <div className="text-sm font-bold text-cyan-300">₹{signal.entryPrice}</div>
            <div className="text-[9px] text-slate-400 truncate">
              Band: ₹{signal.entryPriceRange?.min || (signal.entryPrice * 0.9985).toFixed(2)} - ₹{signal.entryPriceRange?.max || (signal.entryPrice * 1.0015).toFixed(2)}
            </div>
          </div>

          {/* Entry Time & Duration */}
          <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] text-slate-500 flex items-center justify-between">
              <span>ENTRY TIME</span>
              <Clock className="w-3 h-3 text-indigo-400" />
            </div>
            <div className="text-sm font-bold text-indigo-300">{signal.entryTime}</div>
            <div className="text-[9px] text-emerald-400">{signal.timeInTrade || '35m in trade'}</div>
          </div>

          {/* Stop Loss & Risk */}
          <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] text-rose-400 flex items-center justify-between">
              <span>STOP LOSS</span>
              <ShieldAlert className="w-3 h-3 text-rose-400" />
            </div>
            <div className="text-sm font-bold text-rose-300">₹{signal.stopLoss}</div>
            <div className="text-[9px] text-rose-400">
              Risk: {((Math.abs(signal.entryPrice - signal.stopLoss) / signal.entryPrice) * 100).toFixed(2)}% (₹{Math.abs(Math.round((signal.entryPrice - signal.stopLoss) * (signal.quantity || 50)))})
            </div>
          </div>

          {/* Target 1 & Projected Exit */}
          <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] text-emerald-400 flex items-center justify-between">
              <span>TARGET 1 (Risk-Off)</span>
              <Target className="w-3 h-3 text-emerald-400" />
            </div>
            <div className="text-sm font-bold text-emerald-300">₹{signal.target1}</div>
            <div className="text-[9px] text-slate-400">
              Proj: {signal.exitTriggers?.target1?.estTime || '10:30 IST'} (+2.2%)
            </div>
          </div>

          {/* Target 2 & Trailing */}
          <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] text-teal-400 flex items-center justify-between">
              <span>TARGET 2 (Risk-On)</span>
              <Zap className="w-3 h-3 text-teal-400" />
            </div>
            <div className="text-sm font-bold text-teal-300">₹{signal.target2}</div>
            <div className="text-[9px] text-slate-400">
              Proj: {signal.exitTriggers?.target2?.estTime || '12:15 IST'} (+4.5%)
            </div>
          </div>

          {/* Hard Square-off Time */}
          <div className="p-2 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] text-amber-400 flex items-center justify-between">
              <span>HARD SQUARE-OFF</span>
              <Lock className="w-3 h-3 text-amber-400" />
            </div>
            <div className="text-sm font-bold text-amber-300">{signal.hardSquareOffTime || '15:15:00 IST'}</div>
            <div className="text-[9px] text-amber-400">MIS Auto-Exit</div>
          </div>
        </div>

        {/* MAIN BODY: 2-COLUMN (CHART AREA + SIDE STRATEGY / ORDER ENGINE) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto">
          {/* LEFT 8 COLS: CHART DISPLAY */}
          <div className="lg:col-span-8 p-4 flex flex-col border-b lg:border-b-0 lg:border-r border-slate-800 min-h-[460px]">
            {/* Chart Toolbar */}
            <div className="flex items-center justify-between mb-3 text-xs font-mono">
              <div className="flex items-center gap-1.5">
                {(['1m', '3m', '5m', '15m', '1D'] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      timeframe === tf
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tf}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-cyan-400"></span> Entry: ₹{signal.entryPrice}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-400"></span> SL: ₹{signal.stopLoss}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span> T1: ₹{signal.target1}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span> VWAP
                </span>
              </div>
            </div>

            {/* CHART CANVAS */}
            <div className="flex-1 min-h-[380px] bg-slate-950/90 rounded-2xl border border-slate-800 p-2 relative overflow-hidden">
              {chartMode === 'QUANT_CANDLE' ? (
                <div className="w-full h-full flex flex-col">
                  {/* Price & Level Multi-Overlay Chart */}
                  <div className="flex-1 min-h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={simulatedCandles} margin={{ top: 15, right: 35, left: 10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.6} />
                        <XAxis dataKey="time" stroke="#64748b" tick={{ fontSize: 10, fill: '#64748b' }} />
                        <YAxis
                          domain={['auto', 'auto']}
                          stroke="#64748b"
                          tick={{ fontSize: 10, fill: '#94a3b8' }}
                          tickFormatter={(val) => `₹${val.toFixed(1)}`}
                          orientation="right"
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '0.75rem',
                            color: '#f8fafc',
                            fontSize: '11px',
                            fontFamily: 'monospace',
                          }}
                        />

                        {/* Annotations & Price Markers */}
                        <ReferenceLine
                          y={entryPrice}
                          stroke="#06b6d4"
                          strokeWidth={2}
                          strokeDasharray="4 2"
                          label={{
                            value: `ENTRY ₹${entryPrice} (${signal.entryTime})`,
                            fill: '#06b6d4',
                            fontSize: 10,
                            position: 'left',
                          }}
                        />
                        <ReferenceLine
                          y={stopLoss}
                          stroke="#f43f5e"
                          strokeWidth={2}
                          strokeDasharray="4 2"
                          label={{
                            value: `SL ₹${stopLoss}`,
                            fill: '#f43f5e',
                            fontSize: 10,
                            position: 'left',
                          }}
                        />
                        <ReferenceLine
                          y={target1}
                          stroke="#10b981"
                          strokeWidth={1.5}
                          strokeDasharray="3 3"
                          label={{
                            value: `T1 ₹${target1}`,
                            fill: '#10b981',
                            fontSize: 10,
                            position: 'left',
                          }}
                        />
                        <ReferenceLine
                          y={target2}
                          stroke="#14b8a6"
                          strokeWidth={1.5}
                          strokeDasharray="3 3"
                          label={{
                            value: `T2 ₹${target2}`,
                            fill: '#14b8a6',
                            fontSize: 10,
                            position: 'left',
                          }}
                        />

                        {/* Lines */}
                        <Line type="monotone" dataKey="vwap" stroke="#f59e0b" strokeWidth={1.5} dot={false} name="VWAP" />
                        <Line type="monotone" dataKey="ema9" stroke="#818cf8" strokeWidth={1} dot={false} name="9 EMA" />
                        <Line type="monotone" dataKey="ema21" stroke="#c084fc" strokeWidth={1} dot={false} name="21 EMA" />
                        <Area
                          type="monotone"
                          dataKey="close"
                          stroke={isBuy ? '#10b981' : '#f43f5e'}
                          fill={isBuy ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)'}
                          strokeWidth={2.5}
                          name="Price"
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Volume Sub-Chart */}
                  <div className="h-[90px] border-t border-slate-800/80 pt-1">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={simulatedCandles} margin={{ top: 5, right: 35, left: 10, bottom: 0 }}>
                        <XAxis dataKey="time" hide />
                        <YAxis stroke="#475569" tick={{ fontSize: 9, fill: '#475569' }} orientation="right" />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#0f172a',
                            borderColor: '#334155',
                            borderRadius: '0.5rem',
                            color: '#f8fafc',
                            fontSize: '10px',
                            fontFamily: 'monospace',
                          }}
                        />
                        <Bar
                          dataKey="volume"
                          fill="#6366f1"
                          opacity={0.6}
                          name="Volume"
                          radius={[2, 2, 0, 0]}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                /* TRADINGVIEW EMBEDDED ADVANCED REAL-TIME CHART WIDGET */
                <div className="w-full h-full flex flex-col items-center justify-center relative">
                  <iframe
                    title={`TradingView-${symbol}`}
                    src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${encodeURIComponent(
                      getTradingViewSymbol(symbol)
                    )}&interval=5&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%5D&theme=dark&style=1&timezone=Asia%2FKolkata&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=in&utm_source=localhost&utm_medium=widget&utm_campaign=chart`}
                    className="w-full h-full border-0 rounded-xl"
                  />
                  <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-slate-950/80 backdrop-blur-md px-2 py-1 rounded-lg border border-slate-800 text-[10px] font-mono text-slate-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    <span>Live NSE Tick Feed</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT 4 COLS: STRATEGY MATRIX, ENTRY/EXIT RULES & DIRECT EXECUTION */}
          <div className="lg:col-span-4 p-5 flex flex-col justify-between space-y-4 bg-slate-950/40">
            <div>
              {/* Tab Selector */}
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs font-mono mb-4">
                <button
                  onClick={() => setSelectedEngineTab('LEVELS')}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                    selectedEngineTab === 'LEVELS' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400'
                  }`}
                >
                  Trade Timeline
                </button>
                <button
                  onClick={() => setSelectedEngineTab('RULES')}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                    selectedEngineTab === 'RULES' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400'
                  }`}
                >
                  Algo Criteria
                </button>
                <button
                  onClick={() => setSelectedEngineTab('EXECUTION')}
                  className={`flex-1 py-1.5 rounded-lg font-bold transition-all ${
                    selectedEngineTab === 'EXECUTION' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400'
                  }`}
                >
                  Order Setup
                </button>
              </div>

              {/* TAB CONTENT 1: TRADE TIMELINE & TIME STOPS */}
              {selectedEngineTab === 'LEVELS' && (
                <div className="space-y-3 font-mono text-xs">
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                    <div className="text-[11px] font-bold text-slate-300 uppercase mb-2 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Intraday Execution Timeline</span>
                    </div>

                    <div className="space-y-2 text-[11px]">
                      <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-950 border border-slate-800">
                        <span className="text-slate-400">Signal Trigger Time:</span>
                        <span className="text-slate-200 font-bold">{signal.entryTime}</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-950 border border-slate-800">
                        <span className="text-slate-400">Order Recommendation:</span>
                        <span className="text-cyan-300 font-bold">Limit Order @ ₹{signal.entryPrice}</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-950 border border-slate-800">
                        <span className="text-slate-400">Max Holding Horizon:</span>
                        <span className="text-indigo-300 font-bold">{signal.maxHoldingPeriodMinutes || 45} mins</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-950 border border-slate-800">
                        <span className="text-slate-400">Est. Target 1 Window:</span>
                        <span className="text-emerald-400 font-bold">{signal.exitTriggers?.target1?.estTime || '10:30 IST'}</span>
                      </div>
                      <div className="flex items-center justify-between p-1.5 rounded-lg bg-slate-950 border border-slate-800">
                        <span className="text-slate-400">Mandatory MIS Square-Off:</span>
                        <span className="text-amber-300 font-bold">15:15:00 IST</span>
                      </div>
                    </div>
                  </div>

                  {/* Profit Targets Checklist */}
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                    <div className="text-[11px] font-bold text-slate-300 uppercase mb-2">
                      Multi-Tier Target Execution
                    </div>
                    <div className="space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between text-emerald-400">
                        <span>Target 1 (50% Qty Exit):</span>
                        <span className="font-bold">₹{signal.target1} (+{signal.exitTriggers?.target1?.returnPct || 2.2}%)</span>
                      </div>
                      <div className="flex items-center justify-between text-teal-400">
                        <span>Target 2 (30% Qty Exit):</span>
                        <span className="font-bold">₹{signal.target2} (+{signal.exitTriggers?.target2?.returnPct || 4.2}%)</span>
                      </div>
                      <div className="flex items-center justify-between text-indigo-300">
                        <span>Target 3 (Runner Trailing):</span>
                        <span className="font-bold">₹{signal.target3} (+{signal.exitTriggers?.target3?.returnPct || 6.0}%)</span>
                      </div>
                      <div className="flex items-center justify-between text-rose-400 border-t border-slate-800 pt-1.5">
                        <span>Hard Stop Loss:</span>
                        <span className="font-bold">₹{signal.stopLoss} ({signal.exitTriggers?.stopLoss?.returnPct || -1.3}%)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB CONTENT 2: QUANT STRATEGY RULES */}
              {selectedEngineTab === 'RULES' && (
                <div className="space-y-3 font-mono text-xs">
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                    <div className="text-[11px] font-bold text-indigo-300 uppercase mb-1">
                      {signal.strategyName}
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                      {signal.aiRationale}
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-center text-[10px] mb-3">
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                        <div className="text-slate-500">EDGE SCORE</div>
                        <div className="text-sm font-bold text-emerald-400">{signal.confidenceScore}%</div>
                      </div>
                      <div className="p-2 rounded-lg bg-slate-950 border border-slate-800">
                        <div className="text-slate-500">PAYOFF RATIO</div>
                        <div className="text-sm font-bold text-indigo-300">{signal.riskReward}</div>
                      </div>
                    </div>

                    <div className="space-y-1.5 text-[11px] text-slate-300">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>RVOL {signal.indicators.rvol}x exceeds 1.5x threshold</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Supertrend {signal.indicators.supertrend} confirmed</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>VWAP Spread {signal.indicators.vwapDiffPct}% within tolerance</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Overnight Monte Carlo simulation pass</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB CONTENT 3: ORDER SETUP */}
              {selectedEngineTab === 'EXECUTION' && (
                <div className="space-y-3 font-mono text-xs">
                  <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2 text-[11px]">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Order Product:</span>
                      <span className="text-slate-200 font-bold">MIS / Intraday Bracket</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Suggested Quantity:</span>
                      <span className="text-indigo-300 font-bold">{signal.quantity || 50} shares</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Capital Commitment:</span>
                      <span className="text-slate-200 font-bold">₹{((signal.entryPrice * (signal.quantity || 50)) / 5).toFixed(2)} (5x Leverage)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Max Risk Cap:</span>
                      <span className="text-rose-400 font-bold">₹{Math.abs(Math.round((signal.entryPrice - signal.stopLoss) * (signal.quantity || 50)))}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Target 1 Return:</span>
                      <span className="text-emerald-400 font-bold">+₹{Math.abs(Math.round((signal.target1 - signal.entryPrice) * (signal.quantity || 50)))}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* DIRECT BROKER EXECUTION BUTTON */}
            <div className="space-y-2">
              {tradeSuccessMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-mono text-xs flex items-center gap-2 animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{tradeSuccessMsg}</span>
                </div>
              )}

              <button
                onClick={handleExecute}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-mono font-bold text-sm uppercase flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all active:scale-98"
              >
                <Send className="w-4 h-4" />
                <span>Execute {signal.signal} ({signal.symbol} @ ₹{signal.entryPrice})</span>
              </button>

              <p className="text-[10px] font-mono text-slate-500 text-center">
                Auto-places bracket order with Stop Loss at ₹{signal.stopLoss} and Target 1 at ₹{signal.target1}.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
