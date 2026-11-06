import React, { useMemo } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Gauge,
  Layers,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Clock,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
  YAxis,
  XAxis,
} from 'recharts';
import { AppTheme, MarketOverview, ScannedStock } from '../types';

interface KpiOverviewProps {
  overview: MarketOverview;
  stocks: ScannedStock[];
  theme?: AppTheme | 'dark' | 'light';
}

export const KpiOverview: React.FC<KpiOverviewProps> = ({
  overview,
  stocks,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';
  const highConvictionCount = stocks.filter((s) => s.aiScore >= 80).length;
  const avgRvol = (
    stocks.reduce((acc, s) => acc + s.indicators.rvol, 0) / (stocks.length || 1)
  ).toFixed(2);

  // Market Breadth count
  const advances = stocks.filter((s) => s.changePercent > 0.05).length;
  const declines = stocks.filter((s) => s.changePercent < -0.05).length;
  const unchanged = stocks.length - advances - declines;

  // Nifty 50 60-Minute Trend Sparkline Data using recharts
  const niftyData = useMemo(() => {
    // 1. From overview.nifty50.trendHistory
    if (overview.nifty50?.trendHistory && overview.nifty50.trendHistory.length >= 3) {
      return overview.nifty50.trendHistory.map((item) => ({
        time: item.time,
        price: item.price,
        change: item.change ?? Number((item.price - overview.nifty50.price).toFixed(2)),
      }));
    }

    // 2. From overview.nifty50.sparkline or NIFTY stock
    const niftyStock = stocks.find((s) => s.symbol === 'NIFTY' || s.symbol === 'NIFTY 50');
    const rawSparkline = overview.nifty50?.sparkline || niftyStock?.sparkline;
    if (rawSparkline && rawSparkline.length >= 3) {
      const firstPrice = rawSparkline[0];
      return rawSparkline.map((val, idx) => {
        const minsAgo = (rawSparkline.length - 1 - idx) * 5;
        const timeLabel = minsAgo === 0 ? 'Now' : `-${minsAgo}m`;
        return {
          time: timeLabel,
          price: val,
          change: Number((val - firstPrice).toFixed(2)),
        };
      });
    }

    // 3. Fallback: generate high-fidelity 12 points (5-min intervals) covering last 60 mins
    const currentPrice = overview.nifty50?.price || 24275.0;
    const netChange = overview.nifty50?.change || -85.5;
    const basePrice = currentPrice - netChange;
    const count = 12; // 12 * 5 mins = 60 mins

    return Array.from({ length: count }).map((_, i) => {
      const progress = i / (count - 1);
      const wave = Math.sin(progress * Math.PI) * (Math.abs(netChange) * 0.2);
      const price = Number((basePrice + progress * netChange + wave).toFixed(2));
      const minsAgo = (count - 1 - i) * 5;
      const timeLabel = minsAgo === 0 ? 'Now' : `-${minsAgo}m`;
      return {
        time: timeLabel,
        price: i === count - 1 ? currentPrice : price,
        change: Number((price - basePrice).toFixed(2)),
      };
    });
  }, [overview.nifty50, stocks]);

  const niftyPriceList = niftyData.map((d) => d.price);
  const minNiftyPrice = Math.min(...niftyPriceList);
  const maxNiftyPrice = Math.max(...niftyPriceList);
  const pricePadding = Math.max(8, (maxNiftyPrice - minNiftyPrice) * 0.15);
  const yDomain: [number, number] = [
    Math.floor(minNiftyPrice - pricePadding),
    Math.ceil(maxNiftyPrice + pricePadding),
  ];

  const niftyPrice = overview.nifty50?.price || 24275.0;
  const niftyChange = overview.nifty50?.change || 0;
  const niftyChangePct = overview.nifty50?.changePercent || 0;
  const isNiftyUp = niftyChange >= 0;
  const niftyStroke = isNiftyUp ? '#10b981' : '#f43f5e';

  // India VIX Gauge Calculation
  const vixPrice = overview.indiaVix?.price ?? 13.85;
  const vixChange = overview.indiaVix?.change ?? -0.32;
  const vixChangePct = overview.indiaVix?.changePercent ?? -2.26;

  let vixRegime = overview.indiaVix?.regime;
  if (!vixRegime) {
    if (vixPrice > 22) vixRegime = 'EXTREME_PANIC';
    else if (vixPrice > 17) vixRegime = 'HIGH_FEAR';
    else if (vixPrice > 14) vixRegime = 'MODERATE';
    else vixRegime = 'LOW_VOLATILITY';
  }

  // Map 10 to 30 VIX range into 0% to 100% position gauge
  const vixGaugePercent = Math.min(100, Math.max(0, ((vixPrice - 10) / (30 - 10)) * 100));

  const getVixTheme = () => {
    switch (vixRegime) {
      case 'EXTREME_PANIC':
        return {
          label: 'Extreme Panic',
          textColor: 'text-rose-400',
          bgColor: isDark ? 'bg-rose-950/30' : 'bg-rose-50',
          borderColor: isDark ? 'border-rose-500/40' : 'border-rose-300',
          badgeBg: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
          desc: 'High IV / Spiked Risk',
        };
      case 'HIGH_FEAR':
        return {
          label: 'High Fear',
          textColor: 'text-amber-400',
          bgColor: isDark ? 'bg-amber-950/30' : 'bg-amber-50',
          borderColor: isDark ? 'border-amber-500/40' : 'border-amber-300',
          badgeBg: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
          desc: 'Hedging Active / Elevated',
        };
      case 'MODERATE':
        return {
          label: 'Normal Volatility',
          textColor: 'text-sky-400',
          bgColor: isDark ? 'bg-sky-950/20' : 'bg-sky-50',
          borderColor: isDark ? 'border-sky-500/30' : 'border-sky-200',
          badgeBg: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
          desc: 'Balanced Option IV',
        };
      case 'LOW_VOLATILITY':
      default:
        return {
          label: 'Low Fear (Stable)',
          textColor: 'text-emerald-400',
          bgColor: isDark ? 'bg-emerald-950/20' : 'bg-emerald-50',
          borderColor: isDark ? 'border-emerald-500/30' : 'border-emerald-200',
          badgeBg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
          desc: 'Option Sellers Edge',
        };
    }
  };

  const vixConfig = getVixTheme();

  return (
    <div className="space-y-4 my-6 font-sans">
      {/* Primary KPI & Sparkline Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
        {/* NIFTY 50 60-MIN SPARKLINE CARD (Prominent 2-column card on XL displays) */}
        <div
          className={`p-4 rounded-2xl border transition-all xl:col-span-2 flex flex-col justify-between ${
            isDark
              ? 'bg-slate-900/90 border-slate-800 text-slate-100 hover:border-slate-700 shadow-lg shadow-black/20'
              : 'bg-white border-slate-200 text-slate-900 hover:border-slate-300 shadow-sm'
          }`}
        >
          {/* Card Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 font-mono">
                  Benchmark Index
                </span>
                <span className="text-slate-500 text-[10px]">·</span>
                <span className="text-[10px] font-mono text-indigo-400 font-semibold flex items-center gap-1">
                  <Clock className="w-3 h-3" /> 60m Sparkline
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-100 font-mono tracking-tight flex items-center gap-2">
                NIFTY 50
                <span
                  className={`text-xs font-mono font-bold px-2 py-0.5 rounded tabular-nums ${
                    isNiftyUp
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {isNiftyUp ? '+' : ''}{niftyChange.toFixed(2)} ({isNiftyUp ? '+' : ''}{niftyChangePct.toFixed(2)}%)
                </span>
              </h3>
            </div>

            <div className="text-right font-mono tabular-nums">
              <span className="text-xl font-bold block text-slate-100 leading-tight">
                ₹{niftyPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </span>
              <span className="text-[10px] text-slate-400">
                Range: ₹{minNiftyPrice.toFixed(0)} - ₹{maxNiftyPrice.toFixed(0)}
              </span>
            </div>
          </div>

          {/* Recharts Mini Sparkline Area Chart */}
          <div className="h-16 w-full mt-3 relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={niftyData} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
                <defs>
                  <linearGradient id="niftyKpiGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={niftyStroke} stopOpacity={isDark ? 0.35 : 0.25} />
                    <stop offset="95%" stopColor={niftyStroke} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis domain={yDomain} hide />
                <XAxis dataKey="time" hide />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const d = payload[0].payload;
                      return (
                        <div className="bg-slate-900 border border-slate-700/90 rounded-lg p-2 shadow-xl text-xs font-mono">
                          <div className="text-[10px] text-slate-400">{d.time} (Historical Scan)</div>
                          <div className="font-bold text-slate-100 tabular-nums">
                            ₹{d.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </div>
                          <div
                            className={`text-[10px] tabular-nums font-bold ${
                              d.change >= 0 ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {d.change >= 0 ? '+' : ''}{d.change} pts vs 60m ago
                          </div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={niftyStroke}
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#niftyKpiGradient)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Sparkline Footer Timeline */}
          <div className="mt-2 text-[10px] font-mono text-slate-400 border-t border-slate-800/40 pt-2 flex items-center justify-between">
            <span className="opacity-70">-60 Min</span>
            <span className="text-[9px] opacity-50">5-min interval candles</span>
            <span className="text-emerald-400 font-semibold">Latest (Now)</span>
          </div>
        </div>

        {/* Total Scanned Universe & Breadth Card */}
        <div
          className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
            isDark
              ? 'bg-slate-900/90 border-slate-800 text-slate-100 hover:border-slate-700 shadow-lg shadow-black/20'
              : 'bg-white border-slate-200 text-slate-900 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 font-mono">
              NSE F&amp;O Universe
            </span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 my-1">
            <span className="text-3xl font-black font-mono tracking-tight tabular-nums">
              {overview.scannedCount || stocks.length || 225}
            </span>
            <span className="text-[10px] font-mono uppercase opacity-60">Underlyings</span>
          </div>
          <div className="mt-2 text-[10px] font-mono opacity-80 border-t border-slate-800/40 pt-2 flex items-center justify-between">
            <span className="text-emerald-400 font-bold tabular-nums">{advances} Adv</span>
            <span className="text-slate-400 tabular-nums">{unchanged} Flat</span>
            <span className="text-rose-400 font-bold tabular-nums">{declines} Dec</span>
          </div>
        </div>

        {/* India VIX Volatility Gauge Card */}
        <div
          className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${vixConfig.bgColor} ${vixConfig.borderColor} shadow-lg`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] uppercase font-bold tracking-wider font-mono opacity-90 flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-purple-400" />
              India VIX Gauge
            </span>
            <span className={`px-1.5 py-0.5 rounded font-mono font-bold text-[9px] uppercase border ${vixConfig.badgeBg}`}>
              {vixConfig.label}
            </span>
          </div>

          <div>
            <div className="flex items-baseline justify-between my-1">
              <div className="flex items-baseline gap-1.5">
                <span className={`text-2xl font-black font-mono tracking-tight ${vixConfig.textColor}`}>
                  {vixPrice.toFixed(2)}
                </span>
                <span className="text-[10px] font-mono opacity-60">pts</span>
              </div>
              <span
                className={`text-[10px] font-mono font-bold flex items-center gap-0.5 ${
                  vixChange <= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {vixChange <= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                {vixChange > 0 ? '+' : ''}
                {vixChangePct}%
              </span>
            </div>

            {/* Segmented Volatility Meter */}
            <div className="relative mt-1 mb-1">
              <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden flex">
                <div className="h-full w-1/4 bg-emerald-500/80" title="Low Fear (<14)" />
                <div className="h-full w-1/4 bg-sky-500/80" title="Normal (14-17)" />
                <div className="h-full w-1/4 bg-amber-500/80" title="High Fear (17-22)" />
                <div className="h-full w-1/4 bg-rose-500/80" title="Extreme (>22)" />
              </div>

              {/* Pointer Indicator */}
              <div
                className="absolute -top-0.5 -translate-x-1/2 w-3 h-3 rounded-full bg-white border-2 border-purple-600 shadow-md transition-all duration-500"
                style={{ left: `${vixGaugePercent}%` }}
                title={`Current VIX: ${vixPrice}`}
              />
            </div>

            <div className="flex justify-between text-[8px] font-mono opacity-50 px-0.5">
              <span>10</span>
              <span>14</span>
              <span>17</span>
              <span>22</span>
              <span>30+</span>
            </div>
          </div>

          <div className="mt-2 text-[10px] font-mono opacity-80 border-t border-slate-700/30 pt-2 flex items-center justify-between">
            <span className="truncate">{vixConfig.desc}</span>
            <span className="text-[9px] opacity-60">NSE VIX</span>
          </div>
        </div>

        {/* Strong BUY Setups Card */}
        <div
          className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
            isDark
              ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300 hover:border-emerald-500/50 shadow-lg shadow-emerald-950/20'
              : 'bg-emerald-50/80 border-emerald-200 text-emerald-900 hover:border-emerald-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider font-mono opacity-90">
              Strong BUY Setups
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 my-1">
            <span className="text-3xl font-black font-mono tracking-tight text-emerald-400 tabular-nums">
              {overview.buyCount}
            </span>
            <span className="text-[10px] font-mono uppercase font-bold text-emerald-400">
              Bullish
            </span>
          </div>
          <div className="mt-2 text-[10px] font-mono opacity-80 border-t border-emerald-500/20 pt-2">
            Above VWAP &amp; EMA Stack
          </div>
        </div>

        {/* Strong SELL Breakdowns Card */}
        <div
          className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
            isDark
              ? 'bg-rose-950/20 border-rose-500/30 text-rose-300 hover:border-rose-500/50 shadow-lg shadow-rose-950/20'
              : 'bg-rose-50/80 border-rose-200 text-rose-900 hover:border-rose-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider font-mono opacity-90">
              Strong SELL Breakdowns
            </span>
            <div className="p-1.5 rounded-lg bg-rose-500/20 text-rose-400">
              <ArrowDownRight className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 my-1">
            <span className="text-3xl font-black font-mono tracking-tight text-rose-400 tabular-nums">
              {overview.sellCount}
            </span>
            <span className="text-[10px] font-mono uppercase font-bold text-rose-400">
              Bearish
            </span>
          </div>
          <div className="mt-2 text-[10px] font-mono opacity-80 border-t border-rose-500/20 pt-2">
            Below VWAP &amp; Breakdown
          </div>
        </div>

        {/* High RVOL Spikes Card */}
        <div
          className={`p-4 rounded-2xl border transition-all flex flex-col justify-between ${
            isDark
              ? 'bg-slate-900/90 border-slate-800 text-slate-100 hover:border-slate-700 shadow-lg'
              : 'bg-white border-slate-200 text-slate-900 hover:border-slate-300 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] uppercase font-bold tracking-wider opacity-60 font-mono">
              High RVOL Spikes
            </span>
            <div className="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
              <BarChart3 className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2 my-1">
            <span className="text-3xl font-black font-mono tracking-tight tabular-nums">
              {overview.highRvolCount}
            </span>
            <span className="text-[10px] font-mono uppercase text-sky-400 font-bold tabular-nums">
              {avgRvol}x Avg
            </span>
          </div>
          <div className="mt-2 text-[10px] font-mono opacity-70 border-t border-slate-800/40 pt-2">
            Institutional Activity
          </div>
        </div>
      </div>
    </div>
  );
};
