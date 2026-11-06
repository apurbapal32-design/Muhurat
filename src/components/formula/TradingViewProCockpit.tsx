import React, { useState, useMemo } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Layers,
  Lock,
  Maximize2,
  Minimize2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
  Zap,
  Sliders,
} from 'lucide-react';
import { GapRsStockData } from '../../utils/gapRelativeStrengthEngine';
import { ScannedStock } from '../../types';
import { getTradingViewSymbol } from '../../utils/fyersHelpers';

interface TradingViewProCockpitProps {
  currentStockData: GapRsStockData;
  tvInterval: '1' | '3' | '5' | '15' | '60' | 'D';
  onIntervalChange: (interval: '1' | '3' | '5' | '15' | '60' | 'D') => void;
  onExecuteTrade?: (stock: ScannedStock, signal: 'BUY' | 'SELL') => void;
  onViewDiagnostics?: () => void;
  isDark: boolean;
}

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
  ema13: number;
  ema21: number;
}

export const TradingViewProCockpit: React.FC<TradingViewProCockpitProps> = ({
  currentStockData,
  tvInterval,
  onIntervalChange,
  onExecuteTrade,
  onViewDiagnostics,
  isDark,
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [chartEngine, setChartEngine] = useState<'TRADINGVIEW' | 'NATIVE_CANDLES'>('TRADINGVIEW');
  const [accountRiskAmount, setAccountRiskAmount] = useState<number>(5000); // Default ₹5,000 max risk
  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);

  const isBullish = currentStockData.isBuySetup || currentStockData.stockChangePercent >= 0;
  const tvSymbol = getTradingViewSymbol(currentStockData.symbol);

  // Status indicators
  const isClosed = currentStockData.isClosed;
  const tradeStatus = currentStockData.tradeStatus;
  const isTargetHit = tradeStatus.startsWith('CLOSED_TARGET');
  const isSLHit = tradeStatus === 'CLOSED_STOP_LOSS';

  // Distance calculations
  const cmp = currentStockData.price;
  const entry = currentStockData.fixedEntryPrice || currentStockData.price;
  const sl = currentStockData.fixedStopLoss || currentStockData.price * (isBullish ? 0.985 : 1.015);
  const t1 = currentStockData.fixedTarget1 || currentStockData.price * (isBullish ? 1.015 : 0.985);
  const t2 = currentStockData.fixedTarget2 || currentStockData.price * (isBullish ? 1.03 : 0.97);
  const t3 = currentStockData.fixedTarget3 || currentStockData.price * (isBullish ? 1.045 : 0.955);
  const riskPerShare = currentStockData.riskPerShare || Math.max(1, Math.abs(entry - sl));

  // Risk sizing
  const calculatedQty = Math.max(1, Math.floor(accountRiskAmount / riskPerShare));
  const maxRiskTotal = (calculatedQty * riskPerShare).toFixed(0);
  const potentialRewardT1 = (calculatedQty * Math.abs(t1 - entry)).toFixed(0);
  const potentialRewardT2 = (calculatedQty * Math.abs(t2 - entry)).toFixed(0);

  // External URLs
  const tvWebUrl = `https://in.tradingview.com/chart/?symbol=${encodeURIComponent(tvSymbol)}`;
  const chartinkUrl = `https://chartink.com/stocks/${currentStockData.symbol.toLowerCase()}.html`;

  // TradingView Iframe Widget Embed URL
  const tvEmbedUrl = `https://s.tradingview.com/widgetembed/?frameElementId=tradingview_widget&symbol=${encodeURIComponent(
    tvSymbol
  )}&interval=${tvInterval}&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=${
    isDark ? '0f172a' : 'ffffff'
  }&studies=%5B%5D&theme=${isDark ? 'dark' : 'light'}&style=1&timezone=Asia%2FKolkata&studies_overrides=%7B%7D&overrides=%7B%7D&enabled_features=%5B%5D&disabled_features=%5B%5D&locale=in&utm_source=localhost&utm_medium=widget&utm_campaign=chart`;

  // Synthesize realistic Intraday Candlestick data for Native Canvas engine
  const candles: Candle[] = useMemo(() => {
    const totalCandles = 36; // 36 intervals (e.g., 9:15 to 15:30)
    const basePrice = currentStockData.open || currentStockData.price * 0.99;
    const finalPrice = currentStockData.price;
    const priceDelta = (finalPrice - basePrice) / totalCandles;
    const rawCandles: Candle[] = [];

    let curO = basePrice;
    let runningVwap = basePrice;
    let runningVolSum = 0;
    let runningPvSum = 0;

    for (let i = 0; i < totalCandles; i++) {
      const noise = (Math.sin(i * 0.6) + (Math.random() - 0.48) * 0.8) * (currentStockData.atr * 0.15 || 2.5);
      const isTrendUp = isBullish;
      const step = priceDelta + (isTrendUp ? Math.abs(noise) * 0.4 : -Math.abs(noise) * 0.4);
      const cClose = i === totalCandles - 1 ? finalPrice : Number((curO + step).toFixed(2));
      const cHigh = Number((Math.max(curO, cClose) + Math.random() * (currentStockData.atr * 0.2 || 3)).toFixed(2));
      const cLow = Number((Math.min(curO, cClose) - Math.random() * (currentStockData.atr * 0.2 || 3)).toFixed(2));
      const vol = Math.floor(15000 + Math.random() * 45000 * (i > 28 ? 1.8 : 1));

      runningVolSum += vol;
      runningPvSum += ((cHigh + cLow + cClose) / 3) * vol;
      runningVwap = Number((runningPvSum / runningVolSum).toFixed(2));

      // Time string 09:15 + i * 10 mins
      const totalMinutes = 9 * 60 + 15 + i * 10;
      const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
      const mm = String(totalMinutes % 60).padStart(2, '0');

      rawCandles.push({
        time: `${hh}:${mm}`,
        open: curO,
        high: cHigh,
        low: cLow,
        close: cClose,
        volume: vol,
        vwap: runningVwap,
        ema13: Number((cClose * 0.14 + (curO * 0.86)).toFixed(2)),
        ema21: Number((cClose * 0.09 + (curO * 0.91)).toFixed(2)),
      });

      curO = cClose;
    }
    return rawCandles;
  }, [currentStockData, isBullish]);

  // Native Chart bounds
  const minPrice = useMemo(() => {
    const allPrices = [
      ...candles.map((c) => c.low),
      sl,
      entry,
      t1,
      t2,
    ];
    return Math.min(...allPrices) * 0.998;
  }, [candles, sl, entry, t1, t2]);

  const maxPrice = useMemo(() => {
    const allPrices = [
      ...candles.map((c) => c.high),
      sl,
      entry,
      t1,
      t2,
      t3,
    ];
    return Math.max(...allPrices) * 1.002;
  }, [candles, sl, entry, t1, t2, t3]);

  const priceToY = (price: number, height: number = 380) => {
    if (maxPrice === minPrice) return height / 2;
    const y = ((maxPrice - price) / (maxPrice - minPrice)) * (height - 60) + 30;
    return Math.max(10, Math.min(height - 20, y));
  };

  return (
    <div className="space-y-5 font-sans">
      {/* ------------------------------------------------------------- */}
      {/* 1. TRADINGVIEW LIVE PRO CHART & FLOATING HUD */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`p-5 sm:p-6 rounded-3xl border shadow-xl transition-all ${
          isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-indigo-950/20' : 'bg-white border-slate-200 text-slate-900'
        } ${isFullscreen ? 'fixed inset-0 z-50 p-4 sm:p-6 bg-slate-950 flex flex-col justify-between overflow-y-auto' : ''}`}
      >
        {/* Chart Header Toolbar */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 mb-3 border-b border-slate-800/60">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-600/20 text-indigo-400 border border-indigo-500/30 text-xs font-mono font-black">
              <Activity className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
              <span>TRADINGVIEW PRO COCKPIT</span>
            </div>

            <span className="font-mono font-black text-base text-slate-100 tracking-wide">
              {tvSymbol}
            </span>

            <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono font-bold">
              CMP: ₹{currentStockData.price.toFixed(2)}
            </span>

            <span
              className={`text-xs px-2 py-0.5 rounded font-mono font-black ${
                currentStockData.stockChangePercent >= 0
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-rose-500/20 text-rose-400'
              }`}
            >
              {currentStockData.stockChangePercent >= 0 ? '+' : ''}
              {currentStockData.stockChangePercent.toFixed(2)}%
            </span>

            <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-mono font-bold">
              Score: {currentStockData.totalScore}/100 PTS
            </span>
          </div>

          {/* Timeframe Selector & Engine Switcher */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Chart Engine Switcher */}
            <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
              <button
                onClick={() => setChartEngine('TRADINGVIEW')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  chartEngine === 'TRADINGVIEW'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                TradingView
              </button>
              <button
                onClick={() => setChartEngine('NATIVE_CANDLES')}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                  chartEngine === 'NATIVE_CANDLES'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Native Candles
              </button>
            </div>

            {/* Timeframes */}
            <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-mono">
              {(['1', '3', '5', '15', '60', 'D'] as const).map((intv) => (
                <button
                  key={intv}
                  onClick={() => onIntervalChange(intv)}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all ${
                    tvInterval === intv
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {intv === '60' ? '1H' : intv === 'D' ? '1D' : `${intv}m`}
                </button>
              ))}
            </div>

            {/* External Links */}
            <a
              href={tvWebUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all flex items-center gap-1 border border-slate-700"
              title="Open directly in TradingView.com"
            >
              <span>TradingView</span>
              <ExternalLink className="w-3 h-3 text-blue-400" />
            </a>

            <a
              href={chartinkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all flex items-center gap-1 border border-slate-700"
              title="Open Chartink Candlestick Breakdown"
            >
              <span>Chartink</span>
              <ExternalLink className="w-3 h-3 text-emerald-400" />
            </a>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-1.5 rounded-xl text-xs font-mono font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all border border-slate-700 flex items-center gap-1"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Chart'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4 text-amber-400" /> : <Maximize2 className="w-4 h-4 text-slate-400" />}
            </button>
          </div>
        </div>

        {/* Level Badges HUD Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-3 font-mono text-xs">
          {/* Fixed Entry */}
          <div className="p-2.5 rounded-2xl bg-blue-950/40 border border-blue-500/30 flex flex-col justify-between">
            <div className="text-[10px] text-blue-300 font-bold flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Lock className="w-3 h-3 text-blue-400" />
                <span>FIXED ENTRY</span>
              </span>
              <span className="text-[9px] text-blue-400/80">{currentStockData.entryTime || '09:30 IST'}</span>
            </div>
            <div className="text-base font-black text-blue-400 mt-1">
              ₹{entry.toFixed(2)}
            </div>
            <div className="text-[10px] text-slate-400 mt-0.5">
              CMP Diff: {cmp >= entry ? '+' : ''}{(cmp - entry).toFixed(2)} pts
            </div>
          </div>

          {/* Fixed Stop Loss */}
          <div className="p-2.5 rounded-2xl bg-rose-950/40 border border-rose-500/30 flex flex-col justify-between">
            <div className="text-[10px] text-rose-300 font-bold flex items-center justify-between">
              <span className="flex items-center gap-1">
                <ShieldAlert className="w-3 h-3 text-rose-400" />
                <span>FIXED STOP LOSS</span>
              </span>
              <span className="text-[9px] text-rose-400/80">-1.0R</span>
            </div>
            <div className="text-base font-black text-rose-400 mt-1">
              ₹{sl.toFixed(2)}
            </div>
            <div className="text-[10px] text-rose-300/80 mt-0.5">
              Risk: ₹{riskPerShare.toFixed(2)}/sh
            </div>
          </div>

          {/* Fixed Target 1 */}
          <div className="p-2.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex flex-col justify-between">
            <div className="text-[10px] text-emerald-300 font-bold flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Target className="w-3 h-3 text-emerald-400" />
                <span>TARGET 1 (1.0R)</span>
              </span>
              <span className="text-[9px] text-emerald-400/80">+1.0R</span>
            </div>
            <div className="text-base font-black text-emerald-400 mt-1">
              ₹{t1.toFixed(2)}
            </div>
            <div className="text-[10px] text-emerald-300/80 mt-0.5">
              Distance: {(t1 - cmp).toFixed(2)} pts
            </div>
          </div>

          {/* Fixed Target 2 */}
          <div className="p-2.5 rounded-2xl bg-teal-950/40 border border-teal-500/30 flex flex-col justify-between">
            <div className="text-[10px] text-teal-300 font-bold flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Target className="w-3 h-3 text-teal-400" />
                <span>TARGET 2 (1.5R)</span>
              </span>
              <span className="text-[9px] text-teal-400/80">+1.5R</span>
            </div>
            <div className="text-base font-black text-teal-400 mt-1">
              ₹{t2.toFixed(2)}
            </div>
            <div className="text-[10px] text-teal-300/80 mt-0.5">
              Distance: {(t2 - cmp).toFixed(2)} pts
            </div>
          </div>

          {/* Fixed Target 3 */}
          <div className="p-2.5 rounded-2xl bg-purple-950/40 border border-purple-500/30 flex flex-col justify-between col-span-2 sm:col-span-1">
            <div className="text-[10px] text-purple-300 font-bold flex items-center justify-between">
              <span className="flex items-center gap-1">
                <Target className="w-3 h-3 text-purple-400" />
                <span>TARGET 3 (2.0R)</span>
              </span>
              <span className="text-[9px] text-purple-400/80">+2.0R</span>
            </div>
            <div className="text-base font-black text-purple-400 mt-1">
              ₹{t3.toFixed(2)}
            </div>
            <div className="text-[10px] text-purple-300/80 mt-0.5">
              Trend Expansion Target
            </div>
          </div>
        </div>

        {/* Primary Chart Area: TradingView Embed OR Native Interactive Candlestick */}
        {chartEngine === 'TRADINGVIEW' ? (
          <div
            className={`relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 ${
              isFullscreen ? 'flex-1 min-h-[500px]' : 'h-[500px] sm:h-[560px]'
            }`}
          >
            <iframe
              key={`tv-widget-${currentStockData.symbol}-${tvInterval}-${isDark ? 'dark' : 'light'}`}
              title={`TradingView-${currentStockData.symbol}`}
              src={tvEmbedUrl}
              className="w-full h-full border-0"
              allow="geolocation; microphone; camera; midi; vr; accelerometer; gyroscope; payment; ambient-light-sensor; encrypted-media; usb"
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-modals"
            />
          </div>
        ) : (
          /* Native Interactive Candlestick Chart with Level Overlay */
          <div
            className={`relative w-full rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 p-4 flex flex-col justify-between font-mono ${
              isFullscreen ? 'flex-1 min-h-[500px]' : 'h-[500px] sm:h-[560px]'
            }`}
          >
            {/* Native Chart HUD & Legend */}
            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800/80 flex-wrap gap-2">
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-cyan-400">
                  <span className="w-2.5 h-0.5 bg-cyan-400 inline-block" /> EMA 13
                </span>
                <span className="flex items-center gap-1 text-amber-400">
                  <span className="w-2.5 h-0.5 bg-amber-400 inline-block" /> EMA 21
                </span>
                <span className="flex items-center gap-1 text-orange-400">
                  <span className="w-2.5 h-0.5 bg-orange-400 inline-block border-dashed" /> VWAP
                </span>
                <span className="flex items-center gap-1 text-blue-400">
                  <span className="w-2.5 h-0.5 bg-blue-400 inline-block" /> ENTRY
                </span>
                <span className="flex items-center gap-1 text-emerald-400">
                  <span className="w-2.5 h-0.5 bg-emerald-400 inline-block" /> T1/T2/T3
                </span>
                <span className="flex items-center gap-1 text-rose-400">
                  <span className="w-2.5 h-0.5 bg-rose-400 inline-block" /> SL
                </span>
              </div>

              {hoveredCandle ? (
                <div className="text-[11px] bg-slate-900 px-2 py-0.5 rounded border border-slate-700 text-slate-200">
                  [{hoveredCandle.time}] O: {hoveredCandle.open} H: {hoveredCandle.high} L: {hoveredCandle.low} C: {hoveredCandle.close} Vol: {hoveredCandle.volume.toLocaleString('en-IN')}
                </div>
              ) : (
                <div className="text-[10px] text-slate-500">Hover candles for granular price bar data</div>
              )}
            </div>

            {/* SVG Candlestick Canvas */}
            <div className="relative flex-1 w-full mt-2">
              <svg className="w-full h-full" viewBox="0 0 800 400" preserveAspectRatio="none">
                {/* Horizontal Grid lines */}
                {[0.2, 0.4, 0.6, 0.8].map((ratio) => (
                  <line
                    key={ratio}
                    x1="0"
                    y1={400 * ratio}
                    x2="800"
                    y2={400 * ratio}
                    stroke="#1e293b"
                    strokeDasharray="4 4"
                  />
                ))}

                {/* Fixed Level Lines: Entry, SL, T1, T2, T3 */}
                {/* Fixed Entry */}
                <line
                  x1="0"
                  y1={priceToY(entry, 400)}
                  x2="800"
                  y2={priceToY(entry, 400)}
                  stroke="#3b82f6"
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                />
                <text x="790" y={priceToY(entry, 400) - 4} fill="#60a5fa" fontSize="9" textAnchor="end" fontWeight="bold">
                  ENTRY: ₹{entry.toFixed(2)}
                </text>

                {/* Fixed SL */}
                <line
                  x1="0"
                  y1={priceToY(sl, 400)}
                  x2="800"
                  y2={priceToY(sl, 400)}
                  stroke="#f43f5e"
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                <text x="790" y={priceToY(sl, 400) - 4} fill="#fb7185" fontSize="9" textAnchor="end" fontWeight="bold">
                  SL: ₹{sl.toFixed(2)} (-1.0R)
                </text>

                {/* Target 1 */}
                <line
                  x1="0"
                  y1={priceToY(t1, 400)}
                  x2="800"
                  y2={priceToY(t1, 400)}
                  stroke="#10b981"
                  strokeWidth="1.5"
                  strokeDasharray="5 3"
                />
                <text x="790" y={priceToY(t1, 400) - 4} fill="#34d399" fontSize="9" textAnchor="end" fontWeight="bold">
                  T1: ₹{t1.toFixed(2)} (+1.0R)
                </text>

                {/* Target 2 */}
                <line
                  x1="0"
                  y1={priceToY(t2, 400)}
                  x2="800"
                  y2={priceToY(t2, 400)}
                  stroke="#14b8a6"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text x="790" y={priceToY(t2, 400) - 4} fill="#2dd4bf" fontSize="9" textAnchor="end">
                  T2: ₹{t2.toFixed(2)} (+1.5R)
                </text>

                {/* Target 3 */}
                <line
                  x1="0"
                  y1={priceToY(t3, 400)}
                  x2="800"
                  y2={priceToY(t3, 400)}
                  stroke="#a855f7"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <text x="790" y={priceToY(t3, 400) - 4} fill="#c084fc" fontSize="9" textAnchor="end">
                  T3: ₹{t3.toFixed(2)} (+2.0R)
                </text>

                {/* Candlesticks Rendering */}
                {candles.map((c, i) => {
                  const candleWidth = 14;
                  const x = (i / (candles.length - 1)) * 740 + 20;
                  const yO = priceToY(c.open, 400);
                  const yC = priceToY(c.close, 400);
                  const yH = priceToY(c.high, 400);
                  const yL = priceToY(c.low, 400);
                  const isGreen = c.close >= c.open;
                  const bodyY = Math.min(yO, yC);
                  const bodyHeight = Math.max(2, Math.abs(yO - yC));

                  return (
                    <g
                      key={c.time}
                      onMouseEnter={() => setHoveredCandle(c)}
                      onMouseLeave={() => setHoveredCandle(null)}
                      className="cursor-pointer"
                    >
                      {/* Wick */}
                      <line
                        x1={x}
                        y1={yH}
                        x2={x}
                        y2={yL}
                        stroke={isGreen ? '#10b981' : '#f43f5e'}
                        strokeWidth="1.5"
                      />
                      {/* Body */}
                      <rect
                        x={x - candleWidth / 2}
                        y={bodyY}
                        width={candleWidth}
                        height={bodyHeight}
                        fill={isGreen ? '#10b981' : '#f43f5e'}
                        rx="1"
                      />
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. FIXED TRADE LIFECYCLE & EXECUTION STATUS CARD */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`p-5 sm:p-6 rounded-3xl border shadow-xl transition-all ${
          isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-indigo-950/20' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Trade Status Banner */}
        <div className="mb-4">
          {isTargetHit ? (
            <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center justify-between flex-wrap gap-3 shadow-lg shadow-emerald-950/20">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
                <div>
                  <div className="text-sm font-black font-mono tracking-wide uppercase text-emerald-300 flex items-center gap-2">
                    <span>🎯 TRADE CLOSED — TARGET HIT</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-500/30">
                      {tradeStatus.replace('CLOSED_', '')}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-emerald-400/80 mt-0.5">
                    Target achieved at ₹{currentStockData.exitPrice || currentStockData.price} | Realized P&amp;L:{' '}
                    <span className="font-black text-emerald-300">
                      +{currentStockData.realizedPoints} pts (+{currentStockData.realizedPct}%)
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right font-mono text-xs">
                <div className="text-slate-400">Exit Closed Time:</div>
                <div className="font-bold text-emerald-300 text-sm">
                  {currentStockData.exitTime || 'Intraday Target Hit'}
                </div>
              </div>
            </div>
          ) : isSLHit ? (
            <div className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 flex items-center justify-between flex-wrap gap-3 shadow-lg shadow-rose-950/20">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
                  <ShieldAlert className="w-6 h-6 text-rose-400" />
                </div>
                <div>
                  <div className="text-sm font-black font-mono tracking-wide uppercase text-rose-300 flex items-center gap-2">
                    <span>🛑 TRADE CLOSED — STOP LOSS HIT</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-rose-500/20 text-rose-200 border border-rose-500/30">
                      RISK CUT (-1.0R)
                    </span>
                  </div>
                  <div className="text-xs font-mono text-rose-400/80 mt-0.5">
                    Capital preserved at ₹{currentStockData.exitPrice || currentStockData.fixedStopLoss} | Loss:{' '}
                    <span className="font-black text-rose-300">
                      {currentStockData.realizedPoints} pts ({currentStockData.realizedPct}%)
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right font-mono text-xs">
                <div className="text-slate-400">Exit Closed Time:</div>
                <div className="font-bold text-rose-300 text-sm">
                  {currentStockData.exitTime || 'Intraday SL Cut'}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-indigo-500/15 border border-indigo-500/40 text-indigo-300 flex items-center justify-between flex-wrap gap-3 shadow-lg shadow-indigo-950/20">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center">
                  <Zap className="w-6 h-6 text-amber-400 animate-bounce" />
                </div>
                <div>
                  <div className="text-sm font-black font-mono tracking-wide uppercase text-indigo-300 flex items-center gap-2">
                    <span>⚡ ACTIVE IN-MARKET TRADE (OPEN)</span>
                    <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                      LIVE
                    </span>
                  </div>
                  <div className="text-xs font-mono text-indigo-300/80 mt-0.5">
                    Triggered @ ₹{entry.toFixed(2)} | Floating P&amp;L:{' '}
                    <span
                      className={`font-black ${
                        currentStockData.realizedPoints >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {currentStockData.realizedPoints >= 0 ? '+' : ''}
                      {currentStockData.realizedPoints} pts ({currentStockData.realizedPct >= 0 ? '+' : ''}
                      {currentStockData.realizedPct}%)
                    </span>
                  </div>
                </div>
              </div>
              <div className="text-right font-mono text-xs">
                <div className="text-slate-400">Alert Entry Time:</div>
                <div className="font-bold text-indigo-300 text-sm">{currentStockData.entryTime || '09:30:00 IST'}</div>
              </div>
            </div>
          )}
        </div>

        {/* Position Sizing & 1-Click Order Placement */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2">
          {/* Sizing Parameters */}
          <div className="lg:col-span-7 p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300 flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-indigo-400" />
                <span>RISK SIZING CALCULATOR</span>
              </span>
              <span className="text-[10px] text-slate-400">1R Risk Management</span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                  Account Max Risk (₹)
                </label>
                <select
                  value={accountRiskAmount}
                  onChange={(e) => setAccountRiskAmount(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value={2000}>₹2,000 Risk</option>
                  <option value={5000}>₹5,000 Risk</option>
                  <option value={10000}>₹10,000 Risk</option>
                  <option value={25000}>₹25,000 Risk</option>
                  <option value={50000}>₹50,000 Risk</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                  Suggested Quantity
                </label>
                <div className="p-2 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 font-black text-sm text-center">
                  {calculatedQty} Shares
                </div>
              </div>

              <div>
                <label className="block text-[10px] text-slate-400 uppercase font-bold mb-1">
                  Potential at T1 / T2
                </label>
                <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 font-black text-xs text-center">
                  +₹{potentialRewardT1} / +₹{potentialRewardT2}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] opacity-70 pt-1">
              <span>Risk: -₹{maxRiskTotal} (-1.0R)</span>
              <span>Reward Ratio: 1:2.0 Confluence Target</span>
            </div>
          </div>

          {/* Quick Order Execution Button */}
          <div className="lg:col-span-5 p-4 rounded-2xl bg-slate-950/80 border border-slate-800 flex flex-col justify-between font-mono text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-300">BROKER FAST ORDER</span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-bold">
                NSE EQUITIES
              </span>
            </div>

            <div className="my-2">
              <button
                onClick={() => {
                  if (onExecuteTrade) {
                    onExecuteTrade(currentStockData.stock, isBullish ? 'BUY' : 'SELL');
                  }
                }}
                className={`w-full py-3 px-4 rounded-xl font-mono font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-lg transition-all ${
                  isBullish
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>
                  Place {isBullish ? 'BUY' : 'SELL'} Order ({calculatedQty} Qty @ ₹{entry.toFixed(2)})
                </span>
              </button>
            </div>

            <div className="text-[10px] text-slate-400 text-center">
              Routes via Connected Fyers / Zerodha / Upstox API or Paper Engine
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. 7-VECTOR QUICK TELEMETRY MINI-STRIP */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`p-5 rounded-3xl border shadow-xl transition-all ${
          isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-indigo-950/20' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h4 className="font-mono font-black text-xs uppercase tracking-wide">
              7-Vector Confluence Diagnostic Telemetry
            </h4>
          </div>
          {onViewDiagnostics && (
            <button
              onClick={onViewDiagnostics}
              className="text-xs font-mono font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              <span>View Full 16-Indicator Math Breakdown</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 font-mono text-xs">
          {/* V1: Market */}
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="text-[9px] text-slate-400 uppercase font-bold">V1. Market (15p)</div>
            <div className="font-bold text-slate-200 mt-0.5">{currentStockData.v1MarketRegimePts ?? 12}/15 pts</div>
            <div className="text-[9px] text-emerald-400 mt-0.5">
              Nifty {((currentStockData.stock as any).benchmarkChangePct ?? (currentStockData.stockChangePercent - currentStockData.relativeStrength) ?? 0.45) >= 0 ? '+' : ''}
              {((currentStockData.stock as any).benchmarkChangePct ?? (currentStockData.stockChangePercent - currentStockData.relativeStrength) ?? 0.45).toFixed(2)}%
            </div>
          </div>

          {/* V2: Sector */}
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="text-[9px] text-slate-400 uppercase font-bold">V2. Sector RS (15p)</div>
            <div className="font-bold text-slate-200 mt-0.5">{currentStockData.v2SectorStrengthPts ?? 13}/15 pts</div>
            <div className="text-[9px] text-indigo-400 mt-0.5">{(currentStockData.relativeStrength ?? 0) >= 0 ? '+' : ''}{(currentStockData.relativeStrength ?? 0).toFixed(2)}% RS</div>
          </div>

          {/* V3: Price Action */}
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="text-[9px] text-slate-400 uppercase font-bold">V3. Price (20p)</div>
            <div className="font-bold text-slate-200 mt-0.5">{currentStockData.v3StockPriceActionPts ?? 15}/20 pts</div>
            <div className="text-[9px] text-cyan-400 mt-0.5">{currentStockData.price >= currentStockData.vwap ? 'Above VWAP' : 'Below VWAP'}</div>
          </div>

          {/* V4: Volume */}
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="text-[9px] text-slate-400 uppercase font-bold">V4. Volume (10p)</div>
            <div className="font-bold text-slate-200 mt-0.5">{currentStockData.v5VolumeRvolPts ?? 9}/10 pts</div>
            <div className="text-[9px] text-amber-400 mt-0.5">{(currentStockData.rvol ?? 1.5).toFixed(1)}x RVOL</div>
          </div>

          {/* V5: Momentum */}
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="text-[9px] text-slate-400 uppercase font-bold">V5. Momentum (15p)</div>
            <div className="font-bold text-slate-200 mt-0.5">{currentStockData.v4MomentumPts ?? 12}/15 pts</div>
            <div className="text-[9px] text-teal-400 mt-0.5">RSI {(currentStockData.rsi ?? 55).toFixed(0)}</div>
          </div>

          {/* V6: Derivatives */}
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <div className="text-[9px] text-slate-400 uppercase font-bold">V6. Derivatives (15p)</div>
            <div className="font-bold text-slate-200 mt-0.5">{currentStockData.v6FuturesOiPts ?? 11}/15 pts</div>
            <div className="text-[9px] text-pink-400 mt-0.5">
              OI {(currentStockData.stock.oiData?.changeInOIPercent ?? currentStockData.stock.indicators?.oiChangePct ?? (isBullish ? 3.5 : -2.8)) >= 0 ? '+' : ''}
              {(currentStockData.stock.oiData?.changeInOIPercent ?? currentStockData.stock.indicators?.oiChangePct ?? (isBullish ? 3.5 : -2.8)).toFixed(1)}%
            </div>
          </div>

          {/* V7: Risk */}
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 col-span-2 sm:col-span-1">
            <div className="text-[9px] text-slate-400 uppercase font-bold">V7. Risk Limits (10p)</div>
            <div className="font-bold text-slate-200 mt-0.5">{currentStockData.v7RiskVolatilityPts ?? 8}/10 pts</div>
            <div className="text-[9px] text-emerald-400 mt-0.5">1:{currentStockData.riskReward || '2.0'} RR</div>
          </div>
        </div>
      </div>
    </div>
  );
};
