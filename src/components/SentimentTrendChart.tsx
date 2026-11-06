import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  CheckCircle2,
  Filter,
  Info,
  Layers,
  Newspaper,
  RefreshCw,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import { ScannedStock, StockSentimentTrend } from '../types';

interface SentimentTrendChartProps {
  stocks?: ScannedStock[];
  initialSymbol?: string;
  theme?: 'dark' | 'light';
  onSelectStock?: (stock: ScannedStock) => void;
}

const DEFAULT_POPULAR_STOCKS = [
  { symbol: 'RELIANCE', name: 'Reliance Industries', sector: 'Energy' },
  { symbol: 'TCS', name: 'Tata Consultancy Services', sector: 'IT Services' },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', sector: 'Banking & Financials' },
  { symbol: 'INFY', name: 'Infosys Ltd', sector: 'IT Services' },
  { symbol: 'DMART', name: 'Avenue Supermarts', sector: 'FMCG & Retail' },
  { symbol: 'TVSMOTOR', name: 'TVS Motor Company', sector: 'Automobile' },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', sector: 'Banking & Financials' },
  { symbol: 'SBIN', name: 'State Bank of India', sector: 'Banking & Financials' },
  { symbol: 'TATAMOTORS', name: 'Tata Motors', sector: 'Automobile' },
  { symbol: 'BHARTIARTL', name: 'Bharti Airtel', sector: 'Telecom' },
  { symbol: 'KALYANKJIL', name: 'Kalyan Jewellers India', sector: 'FMCG & Retail' },
];

export const SentimentTrendChart: React.FC<SentimentTrendChartProps> = ({
  stocks = [],
  initialSymbol = 'RELIANCE',
  theme = 'dark',
  onSelectStock,
}) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(initialSymbol);
  const [trendData, setTrendData] = useState<StockSentimentTrend | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState<'ALL' | 'POSITIVE' | 'NEGATIVE' | 'ACTIONS'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const isDark = theme === 'dark';

  const fetchSentimentTrend = async (symbolToFetch: string) => {
    setLoading(true);
    setError(null);
    try {
      const stockMatch = stocks.find((s) => s.symbol === symbolToFetch);
      const payload = {
        symbol: symbolToFetch,
        companyName: stockMatch?.name || symbolToFetch,
        sector: stockMatch?.sector || 'Nifty 200',
        price: stockMatch?.price || 2500,
      };

      const res = await fetch('/api/ai/sentiment-trend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: Failed to fetch sentiment trend`);

      const data = await res.json();
      setTrendData(data);
    } catch (err: any) {
      console.error('Error fetching sentiment trend:', err);
      setError(err.message || 'Failed to analyze Gemini sentiment trend.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSentimentTrend(selectedSymbol);
  }, [selectedSymbol]);

  // Combine available stock universe
  const availableStockList = stocks.length > 0
    ? stocks.map((s) => ({ symbol: s.symbol, name: s.name, sector: s.sector }))
    : DEFAULT_POPULAR_STOCKS;

  const filteredStocks = availableStockList.filter(
    (s) =>
      s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedStockObj = stocks.find((s) => s.symbol === selectedSymbol);

  // Filter Timeline Points
  const filteredPoints = trendData?.points.filter((pt) => {
    if (eventFilter === 'POSITIVE') return pt.sentimentScore > 10 || pt.newsImpactScore > 0;
    if (eventFilter === 'NEGATIVE') return pt.sentimentScore < -10 || pt.newsImpactScore < 0;
    if (eventFilter === 'ACTIONS') return !!pt.corporateActionText;
    return true;
  }) || [];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const ptData = payload[0].payload;
      return (
        <div
          className={`p-3.5 rounded-xl border shadow-2xl text-xs font-sans max-w-xs z-50 ${
            isDark ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'
          }`}
        >
          <div className="flex items-center justify-between border-b border-slate-700 pb-2 mb-2">
            <span className="font-mono font-bold text-slate-400">{label}</span>
            <span
              className={`px-2 py-0.5 rounded font-mono font-bold text-[11px] ${
                ptData.sentimentScore >= 0
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
              }`}
            >
              Score: {ptData.sentimentScore > 0 ? '+' : ''}
              {ptData.sentimentScore}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-[11px]">
              <span className="opacity-70">Price Correlation:</span>
              <span className="font-mono font-bold">₹{ptData.priceCorrelation}</span>
            </div>

            {ptData.newsTitle && (
              <div className="pt-1.5 border-t border-slate-800">
                <div className="flex items-center gap-1.5 font-semibold text-indigo-400 text-[11px] mb-0.5">
                  <Newspaper className="w-3 h-3" />
                  <span>Key News Event</span>
                </div>
                <p className="text-[11px] leading-snug opacity-90">{ptData.newsTitle}</p>
              </div>
            )}

            {ptData.corporateActionText && (
              <div className="pt-1.5 border-t border-slate-800">
                <div className="flex items-center gap-1.5 font-semibold text-amber-400 text-[11px] mb-0.5">
                  <Calendar className="w-3 h-3" />
                  <span>Corporate Action Trigger</span>
                </div>
                <p className="text-[11px] leading-snug opacity-90">{ptData.corporateActionText}</p>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 font-sans">
      {/* Stock Selection & AI Trigger Controls */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isDark
            ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-xl'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`p-3 rounded-xl font-bold ${
                isDark
                  ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                  : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
              }`}
            >
              <Sparkles className="w-5 h-5 text-indigo-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black italic tracking-tight uppercase">
                  Gemini AI 30-Day News & Action Sentiment Trend
                </h2>
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded uppercase border ${
                    isDark
                      ? 'bg-purple-500/10 border-purple-500/30 text-purple-400'
                      : 'bg-purple-50 border-purple-200 text-purple-700'
                  }`}
                >
                  LLM Time-Series Engine
                </span>
              </div>
              <p className="text-xs font-mono opacity-60">
                Deep NLP sentiment analysis combining quarterly earnings, corporate actions, block deals & news impact
              </p>
            </div>
          </div>

          {/* Quick Select & Search */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
              <input
                type="text"
                placeholder="Search Nifty 200..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`pl-8 pr-3 py-1.5 text-xs font-mono rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                  isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              />
            </div>

            <select
              value={selectedSymbol}
              onChange={(e) => setSelectedSymbol(e.target.value)}
              className={`px-3 py-1.5 text-xs font-mono font-bold rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                isDark ? 'bg-slate-950 border-slate-800 text-indigo-300' : 'bg-slate-50 border-slate-300 text-indigo-700'
              }`}
            >
              {filteredStocks.map((s) => (
                <option key={s.symbol} value={s.symbol}>
                  {s.symbol} - {s.name} ({s.sector})
                </option>
              ))}
            </select>

            <button
              onClick={() => fetchSentimentTrend(selectedSymbol)}
              disabled={loading}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition-all ${
                isDark
                  ? 'bg-indigo-600 hover:bg-indigo-500 text-white'
                  : 'bg-indigo-700 hover:bg-indigo-600 text-white'
              } disabled:opacity-50 shadow-md`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Analyzing...' : 'Re-Analyze AI'}</span>
            </button>
          </div>
        </div>

        {/* Popular Quick Chips */}
        <div className="mt-4 pt-3 border-t border-slate-800/50 flex flex-wrap items-center gap-1.5 text-xs font-mono">
          <span className="opacity-50 text-[11px] mr-1">Popular Stocks:</span>
          {DEFAULT_POPULAR_STOCKS.slice(0, 8).map((s) => (
            <button
              key={s.symbol}
              onClick={() => setSelectedSymbol(s.symbol)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-bold border transition-all ${
                selectedSymbol === s.symbol
                  ? isDark
                    ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-300 shadow-sm'
                    : 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : isDark
                  ? 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  : 'bg-slate-100 border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              {s.symbol}
            </button>
          ))}
        </div>
      </div>

      {/* Main Sentiment Dashboard */}
      {loading ? (
        <div
          className={`p-12 rounded-2xl border text-center font-mono ${
            isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-600'
          }`}
        >
          <Sparkles className="w-8 h-8 text-indigo-400 animate-spin mx-auto mb-3" />
          <h3 className="text-sm font-bold text-indigo-400">Gemini 2.5 Flash Processing 30-Day News Stream...</h3>
          <p className="text-xs opacity-60 mt-1">Analyzing NLP sentiments, corporate ex-dates & block deal volumes for {selectedSymbol}</p>
        </div>
      ) : trendData ? (
        <div className="space-y-6">
          {/* Top KPI Metrics Header */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 font-mono">
            {/* 30-Day Score */}
            <div
              className={`p-4 rounded-xl border ${
                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <span className="text-[10px] uppercase opacity-60 font-bold block mb-1">30-Day AI Sentiment Score</span>
              <div className="flex items-baseline gap-2">
                <span
                  className={`text-2xl font-black ${
                    trendData.overall30DayScore >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {trendData.overall30DayScore > 0 ? '+' : ''}
                  {trendData.overall30DayScore}
                </span>
                <span className="text-xs opacity-50">/ 100</span>
              </div>
              <div className="mt-2 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className={`h-full ${trendData.overall30DayScore >= 0 ? 'bg-emerald-500' : 'bg-rose-500'}`}
                  style={{ width: `${Math.min(100, Math.abs(trendData.overall30DayScore))}%` }}
                />
              </div>
            </div>

            {/* Trend Direction */}
            <div
              className={`p-4 rounded-xl border ${
                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <span className="text-[10px] uppercase opacity-60 font-bold block mb-1">Sentiment Trajectory</span>
              <div className="flex items-center gap-2">
                {trendData.trendDirection === 'BULLISH' ? (
                  <div className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    <TrendingUp className="w-5 h-5" />
                  </div>
                ) : trendData.trendDirection === 'BEARISH' ? (
                  <div className="p-1.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">
                    <TrendingDown className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="p-1.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    <Info className="w-5 h-5" />
                  </div>
                )}
                <div>
                  <span
                    className={`text-base font-black uppercase ${
                      trendData.trendDirection === 'BULLISH'
                        ? 'text-emerald-400'
                        : trendData.trendDirection === 'BEARISH'
                        ? 'text-rose-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {trendData.trendDirection}
                  </span>
                  <span className="text-[10px] block opacity-50">30-Day Momentum</span>
                </div>
              </div>
            </div>

            {/* Event Counts */}
            <div
              className={`p-4 rounded-xl border ${
                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <span className="text-[10px] uppercase opacity-60 font-bold block mb-1">News & Event Impact Ratio</span>
              <div className="flex items-center gap-3 text-xs font-bold mt-1">
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  +{trendData.positiveEventsCount} Bullish
                </span>
                <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/30">
                  -{trendData.negativeEventsCount} Bearish
                </span>
              </div>
              <p className="text-[10px] opacity-50 mt-2">{trendData.neutralEventsCount} Neutral sector updates</p>
            </div>

            {/* Live Spot Stock Detail */}
            <div
              className={`p-4 rounded-xl border ${
                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <span className="text-[10px] uppercase opacity-60 font-bold block mb-1">Selected Stock Spot</span>
              <div className="flex items-baseline justify-between">
                <div>
                  <span className="text-xl font-black">
                    ₹{selectedStockObj ? selectedStockObj.price.toLocaleString('en-IN') : '—'}
                  </span>
                  {selectedStockObj && (
                    <span
                      className={`text-xs ml-2 font-bold ${
                        selectedStockObj.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {selectedStockObj.changePercent >= 0 ? '+' : ''}
                      {selectedStockObj.changePercent}%
                    </span>
                  )}
                </div>
                {selectedStockObj && onSelectStock && (
                  <button
                    onClick={() => onSelectStock(selectedStockObj)}
                    className="px-2 py-1 text-[10px] font-bold rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                  >
                    Open Technicals
                  </button>
                )}
              </div>
              <p className="text-[10px] opacity-50 mt-1 truncate">{trendData.companyName} ({trendData.sector})</p>
            </div>
          </div>

          {/* Gemini AI Executive Summary Banner */}
          <div
            className={`p-5 rounded-2xl border ${
              isDark
                ? 'bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border-indigo-800/40 text-slate-100 shadow-lg'
                : 'bg-gradient-to-r from-indigo-50 via-white to-white border-indigo-200 text-slate-900 shadow-sm'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2 font-mono">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400">
                    Gemini AI Executive Sentiment Assessment
                  </h3>
                  <span className="text-[10px] opacity-40">Updated {new Date(trendData.lastUpdated).toLocaleTimeString()}</span>
                </div>
                <p className="text-xs leading-relaxed opacity-90 font-sans">{trendData.aiExecutiveSummary}</p>

                {/* Key Drivers */}
                <div className="pt-2 flex flex-wrap gap-2 text-xs font-mono">
                  {trendData.keyDrivers.map((driver, idx) => (
                    <span
                      key={idx}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium border flex items-center gap-1.5 ${
                        isDark
                          ? 'bg-slate-950/70 border-slate-800 text-slate-300'
                          : 'bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                      <span>{driver}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Recharts 30-Day Sentiment Trend Line Chart */}
          <div
            className={`p-5 rounded-2xl border ${
              isDark ? 'bg-slate-900/90 border-slate-800 shadow-xl' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 font-mono">
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  30-Day Sentiment Score Trajectory vs Price Correlation
                </h3>
                <p className="text-[11px] opacity-50">
                  Historical sentiment score (-100 to +100) overlayed with simulated stock price trend
                </p>
              </div>

              <div className="flex items-center gap-3 text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 inline-block" />
                  <span>Sentiment Score</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-1 bg-indigo-400 inline-block" />
                  <span>Price Correlation</span>
                </div>
              </div>
            </div>

            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendData.points} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.5} />
                  <XAxis
                    dataKey="date"
                    stroke={isDark ? '#94a3b8' : '#64748b'}
                    fontSize={10}
                    tickFormatter={(val) => val.slice(5)}
                  />
                  <YAxis
                    yAxisId="sentiment"
                    domain={[-100, 100]}
                    stroke={isDark ? '#94a3b8' : '#64748b'}
                    fontSize={10}
                  />
                  <YAxis
                    yAxisId="price"
                    orientation="right"
                    domain={['dataMin - 10', 'dataMax + 10']}
                    stroke="#818cf8"
                    fontSize={10}
                    hide
                  />

                  <Tooltip content={<CustomTooltip />} />
                  <ReferenceLine y={0} yAxisId="sentiment" stroke="#64748b" strokeDasharray="3 3" opacity={0.7} />

                  <Area
                    yAxisId="sentiment"
                    type="monotone"
                    dataKey="sentimentScore"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#sentimentGradient)"
                    name="Sentiment Score"
                  />

                  <Line
                    yAxisId="price"
                    type="monotone"
                    dataKey="priceCorrelation"
                    stroke="#818cf8"
                    strokeWidth={1.8}
                    strokeDasharray="4 4"
                    dot={false}
                    name="Price Correlation"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 30-Day News & Corporate Actions Event Timeline */}
          <div
            className={`p-5 rounded-2xl border ${
              isDark ? 'bg-slate-900/90 border-slate-800 shadow-xl' : 'bg-white border-slate-200 shadow-sm'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 font-mono">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                <h3 className="text-xs font-black uppercase tracking-wider">
                  30-Day Event Log & Sentiment Shift Timeline
                </h3>
              </div>

              {/* Timeline Filter */}
              <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-slate-800 text-[11px]">
                <button
                  onClick={() => setEventFilter('ALL')}
                  className={`px-2.5 py-1 rounded font-bold transition-all ${
                    eventFilter === 'ALL'
                      ? 'bg-indigo-600 text-white'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  All (30)
                </button>
                <button
                  onClick={() => setEventFilter('POSITIVE')}
                  className={`px-2.5 py-1 rounded font-bold transition-all ${
                    eventFilter === 'POSITIVE'
                      ? 'bg-emerald-600 text-white'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  Bullish Events
                </button>
                <button
                  onClick={() => setEventFilter('NEGATIVE')}
                  className={`px-2.5 py-1 rounded font-bold transition-all ${
                    eventFilter === 'NEGATIVE'
                      ? 'bg-rose-600 text-white'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  Bearish Events
                </button>
                <button
                  onClick={() => setEventFilter('ACTIONS')}
                  className={`px-2.5 py-1 rounded font-bold transition-all ${
                    eventFilter === 'ACTIONS'
                      ? 'bg-amber-600 text-white'
                      : 'opacity-70 hover:opacity-100'
                  }`}
                >
                  Corporate Actions
                </button>
              </div>
            </div>

            {/* Log Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr
                    className={`border-b text-[10px] uppercase opacity-60 ${
                      isDark ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Sentiment Score</th>
                    <th className="py-2.5 px-3">Primary Trigger Event</th>
                    <th className="py-2.5 px-3">Corporate Action</th>
                    <th className="py-2.5 px-3 text-right">Price Correlation</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40">
                  {filteredPoints.map((pt, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-800/30 transition-colors ${
                        pt.newsTitle || pt.corporateActionText ? 'bg-slate-800/10' : ''
                      }`}
                    >
                      <td className="py-3 px-3 opacity-80 whitespace-nowrap">{pt.date}</td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                            pt.sentimentScore >= 20
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : pt.sentimentScore <= -20
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {pt.sentimentScore > 0 ? '+' : ''}
                          {pt.sentimentScore}
                        </span>
                      </td>
                      <td className="py-3 px-3 max-w-md">
                        {pt.newsTitle ? (
                          <div className="flex items-center gap-2">
                            <Newspaper className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                            <span className="font-sans font-medium text-slate-200 line-clamp-1">{pt.newsTitle}</span>
                          </div>
                        ) : (
                          <span className="opacity-40 italic">Standard sector volatility</span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {pt.corporateActionText ? (
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold text-[11px] flex items-center gap-1.5 w-fit">
                            <Calendar className="w-3 h-3" />
                            {pt.corporateActionText}
                          </span>
                        ) : (
                          <span className="opacity-30">—</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-bold whitespace-nowrap">
                        ₹{pt.priceCorrelation.toLocaleString('en-IN')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-8 text-center opacity-60 font-mono text-xs">
          Select a stock to generate Gemini AI 30-Day Sentiment Analysis.
        </div>
      )}
    </div>
  );
};
