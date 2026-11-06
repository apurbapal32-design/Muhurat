import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  Filter,
  History,
  Layers,
  Percent,
  Play,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { NIFTY_200_STOCKS } from '../data/nifty200';
import { BacktestRequest, BacktestResult, BacktestTrade } from '../types';

interface BacktestViewProps {
  onCreateTrade?: (data: {
    symbol: string;
    signal: 'BUY' | 'SELL';
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    target1: number;
    target2: number;
  }) => void;
  theme?: 'dark' | 'light';
}

export const BacktestView: React.FC<BacktestViewProps> = ({
  onCreateTrade,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';

  // Selection states
  const [selectedSymbol, setSelectedSymbol] = useState<string>('RELIANCE');
  const [timeframe, setTimeframe] = useState<'1M' | '3M' | '6M' | '1Y' | 'YTD'>('3M');
  const [strategyPreset, setStrategyPreset] = useState<'BALANCED' | 'AGGRESSIVE' | 'CONSERVATIVE'>('BALANCED');
  const [initialCapital, setInitialCapital] = useState<number>(100000);
  const [stopLossPercent, setStopLossPercent] = useState<number>(2.0);
  const [target1Percent, setTarget1Percent] = useState<number>(3.5);
  const [target2Percent, setTarget2Percent] = useState<number>(6.0);

  // Search filter for stock selector
  const [stockSearch, setStockSearch] = useState<string>('');
  const [isStockDropdownOpen, setIsStockDropdownOpen] = useState<boolean>(false);

  // Result state
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Trade log filter
  const [tradeFilter, setTradeFilter] = useState<'ALL' | 'WIN' | 'LOSS' | 'BUY' | 'SELL'>('ALL');

  // Filtered stocks for dropdown
  const filteredStocks = NIFTY_200_STOCKS.filter(
    (s) =>
      s.symbol.toLowerCase().includes(stockSearch.toLowerCase()) ||
      s.name.toLowerCase().includes(stockSearch.toLowerCase()) ||
      s.sector.toLowerCase().includes(stockSearch.toLowerCase())
  ).slice(0, 30);

  // Auto update SL/TP when strategy preset changes
  const handleStrategyPresetChange = (preset: 'BALANCED' | 'AGGRESSIVE' | 'CONSERVATIVE') => {
    setStrategyPreset(preset);
    if (preset === 'BALANCED') {
      setStopLossPercent(2.0);
      setTarget1Percent(3.5);
      setTarget2Percent(6.0);
    } else if (preset === 'AGGRESSIVE') {
      setStopLossPercent(3.0);
      setTarget1Percent(5.0);
      setTarget2Percent(10.0);
    } else if (preset === 'CONSERVATIVE') {
      setStopLossPercent(1.5);
      setTarget1Percent(2.5);
      setTarget2Percent(4.5);
    }
  };

  // Run backtest call
  const runBacktest = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const reqPayload: BacktestRequest = {
        symbol: selectedSymbol,
        timeframe,
        initialCapital,
        strategyPreset,
        stopLossPercent,
        target1Percent,
        target2Percent,
      };

      const res = await fetch('/api/backtest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqPayload),
      });

      if (!res.ok) throw new Error('Backtest server request failed');
      const data: BacktestResult = await res.json();
      setResult(data);
    } catch (err: any) {
      console.error('Backtest error:', err);
      setError(err.message || 'Failed to simulate backtest');
    } finally {
      setIsLoading(false);
    }
  };

  // Run initial backtest on load
  useEffect(() => {
    runBacktest();
  }, []);

  // Filtered trade list
  const filteredTrades = (result?.trades || []).filter((t) => {
    if (tradeFilter === 'WIN') return t.pnl > 0;
    if (tradeFilter === 'LOSS') return t.pnl <= 0;
    if (tradeFilter === 'BUY') return t.signal === 'BUY';
    if (tradeFilter === 'SELL') return t.signal === 'SELL';
    return true;
  });

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const selectedStockObj = NIFTY_200_STOCKS.find((s) => s.symbol === selectedSymbol);

  return (
    <div className="space-y-6 my-6 font-sans">
      {/* Top Header Panel */}
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
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
            }`}
          >
            <History className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black italic tracking-tight uppercase">
                AI Scanner Historical Backtesting Engine
              </h2>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded uppercase border ${
                  isDark
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-400'
                    : 'bg-indigo-50 border-indigo-200 text-indigo-700'
                }`}
              >
                Bar-By-Bar OHLC Simulation
              </span>
            </div>
            <p className="text-xs font-mono opacity-60">
              Simulate AI signal accuracy, risk/reward ratios, drawdown metrics & equity curves against historical data
            </p>
          </div>
        </div>

        {/* Quick presets */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="opacity-60 text-[11px] uppercase font-bold">Popular:</span>
          {['RELIANCE', 'TCS', 'TATAMOTORS', 'HDFCBANK', 'INFY'].map((sym) => (
            <button
              key={sym}
              onClick={() => {
                setSelectedSymbol(sym);
              }}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                selectedSymbol === sym
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                  : isDark
                  ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {sym}
            </button>
          ))}
        </div>
      </div>

      {/* CONFIGURATION BAR */}
      <div
        className={`p-5 rounded-2xl border transition-colors grid grid-cols-1 md:grid-cols-12 gap-4 font-mono ${
          isDark
            ? 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-lg'
            : 'bg-white border-slate-200 text-slate-900 shadow-2xs'
        }`}
      >
        {/* 1. Stock Selector */}
        <div className="md:col-span-3 relative">
          <label className="block text-[10px] uppercase font-bold opacity-60 mb-1">
            Target Stock
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsStockDropdownOpen(!isStockDropdownOpen)}
              className={`w-full px-3 py-2 rounded-xl border text-left font-bold text-xs flex items-center justify-between ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-100'
                  : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            >
              <div className="truncate">
                <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded text-[10px] mr-2">
                  {selectedSymbol}
                </span>
                <span>{selectedStockObj?.name || selectedSymbol}</span>
              </div>
              <ChevronRight
                className={`w-4 h-4 transition-transform ${isStockDropdownOpen ? 'rotate-90' : ''}`}
              />
            </button>

            {isStockDropdownOpen && (
              <div
                className={`absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border p-2 shadow-2xl max-h-60 overflow-y-auto ${
                  isDark
                    ? 'bg-slate-950 border-slate-800 text-slate-100'
                    : 'bg-white border-slate-200 text-slate-900'
                }`}
              >
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 opacity-50" />
                  <input
                    type="text"
                    placeholder="Search stock symbol..."
                    value={stockSearch}
                    onChange={(e) => setStockSearch(e.target.value)}
                    className={`w-full pl-8 pr-2 py-1.5 rounded-lg text-xs border focus:outline-none ${
                      isDark ? 'bg-slate-900 border-slate-800' : 'bg-slate-100 border-slate-200'
                    }`}
                  />
                </div>
                <div className="space-y-0.5">
                  {filteredStocks.map((s) => (
                    <button
                      key={s.symbol}
                      onClick={() => {
                        setSelectedSymbol(s.symbol);
                        setIsStockDropdownOpen(false);
                      }}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-xs flex items-center justify-between transition-colors ${
                        selectedSymbol === s.symbol
                          ? 'bg-indigo-600 text-white font-bold'
                          : isDark
                          ? 'hover:bg-slate-800 text-slate-200'
                          : 'hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <span className="font-bold">{s.symbol}</span>
                      <span className="text-[10px] opacity-60 truncate max-w-[120px]">{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 2. Timeframe */}
        <div className="md:col-span-2">
          <label className="block text-[10px] uppercase font-bold opacity-60 mb-1">
            Lookback Range
          </label>
          <div className="flex items-center gap-1">
            {(['1M', '3M', '6M', '1Y', 'YTD'] as const).map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`flex-1 py-2 text-[10px] font-bold rounded-xl border transition-all ${
                  timeframe === tf
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                    : isDark
                    ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>

        {/* 3. Strategy Mode */}
        <div className="md:col-span-2">
          <label className="block text-[10px] uppercase font-bold opacity-60 mb-1">
            Strategy Risk Profile
          </label>
          <select
            value={strategyPreset}
            onChange={(e) =>
              handleStrategyPresetChange(
                e.target.value as 'BALANCED' | 'AGGRESSIVE' | 'CONSERVATIVE'
              )
            }
            className={`w-full px-3 py-2 rounded-xl border text-xs font-bold focus:outline-none ${
              isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300'
            }`}
          >
            <option value="BALANCED">Balanced (2% SL / 3.5% T1)</option>
            <option value="AGGRESSIVE">Aggressive Momentum (3% SL / 5% T1)</option>
            <option value="CONSERVATIVE">Conservative Swing (1.5% SL / 2.5% T1)</option>
          </select>
        </div>

        {/* 4. Capital & SL/TP Settings */}
        <div className="md:col-span-3 grid grid-cols-3 gap-2">
          <div>
            <label className="block text-[9px] uppercase font-bold opacity-60 mb-1">
              Capital (₹)
            </label>
            <input
              type="number"
              value={initialCapital}
              onChange={(e) => setInitialCapital(Number(e.target.value))}
              className={`w-full px-2 py-1.5 rounded-xl border text-xs font-bold text-center ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300'
              }`}
            />
          </div>
          <div>
            <label className="block text-[9px] uppercase font-bold opacity-60 mb-1">
              Stop Loss %
            </label>
            <input
              type="number"
              step="0.1"
              value={stopLossPercent}
              onChange={(e) => setStopLossPercent(Number(e.target.value))}
              className={`w-full px-2 py-1.5 rounded-xl border text-xs font-bold text-center text-rose-400 ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
              }`}
            />
          </div>
          <div>
            <label className="block text-[9px] uppercase font-bold opacity-60 mb-1">
              Target 1 %
            </label>
            <input
              type="number"
              step="0.1"
              value={target1Percent}
              onChange={(e) => setTarget1Percent(Number(e.target.value))}
              className={`w-full px-2 py-1.5 rounded-xl border text-xs font-bold text-center text-emerald-400 ${
                isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
              }`}
            />
          </div>
        </div>

        {/* 5. Run Action Button */}
        <div className="md:col-span-2 flex items-end">
          <button
            onClick={runBacktest}
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-xl font-bold text-xs uppercase bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Simulating...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Run Backtest</span>
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-mono flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {/* BACKTEST PERFORMANCE DASHBOARD */}
      {result && (
        <div className="space-y-6">
          {/* Key Metric Highlights Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 font-mono">
            {/* Total Return Card */}
            <div
              className={`p-4 rounded-2xl border transition-all ${
                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
              }`}
            >
              <span className="text-[10px] uppercase font-bold opacity-60 block">Total Strategy Return</span>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`text-2xl font-black ${
                    result.totalReturnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {result.totalReturnPercent >= 0 ? `+${result.totalReturnPercent}%` : `${result.totalReturnPercent}%`}
                </span>
                {result.totalReturnPercent >= 0 ? (
                  <TrendingUp className="w-5 h-5 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-5 h-5 text-rose-400" />
                )}
              </div>
              <span className="text-xs block opacity-60 mt-1">
                Profit: {formatCurrency(result.finalCapital - result.initialCapital)}
              </span>
            </div>

            {/* Win Rate Card */}
            <div
              className={`p-4 rounded-2xl border transition-all ${
                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
              }`}
            >
              <span className="text-[10px] uppercase font-bold opacity-60 block">Accuracy Win Rate</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-black text-indigo-400">{result.winRatePercent}%</span>
                <CheckCircle2 className="w-5 h-5 text-indigo-400" />
              </div>
              <span className="text-xs block opacity-60 mt-1">
                {result.winningTrades} Wins / {result.losingTrades} Losses ({result.totalTrades} Total)
              </span>
            </div>

            {/* Profit Factor Card */}
            <div
              className={`p-4 rounded-2xl border transition-all ${
                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
              }`}
            >
              <span className="text-[10px] uppercase font-bold opacity-60 block">Profit Factor</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-black text-amber-400">{result.profitFactor}</span>
                <Layers className="w-5 h-5 text-amber-400" />
              </div>
              <span className="text-xs block opacity-60 mt-1">
                Avg Trade: {result.averageTradeReturnPercent >= 0 ? `+${result.averageTradeReturnPercent}%` : `${result.averageTradeReturnPercent}%`}
              </span>
            </div>

            {/* Max Drawdown Card */}
            <div
              className={`p-4 rounded-2xl border transition-all ${
                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
              }`}
            >
              <span className="text-[10px] uppercase font-bold opacity-60 block">Max Peak Drawdown</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-2xl font-black text-rose-400">-{result.maxDrawdownPercent}%</span>
                <Shield className="w-5 h-5 text-rose-400" />
              </div>
              <span className="text-xs block opacity-60 mt-1">Controlled Capital Exposure</span>
            </div>

            {/* Final Portfolio Capital Card */}
            <div
              className={`p-4 rounded-2xl border transition-all ${
                isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
              }`}
            >
              <span className="text-[10px] uppercase font-bold opacity-60 block">Final Portfolio Value</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xl font-black text-slate-100">{formatCurrency(result.finalCapital)}</span>
              </div>
              <span className="text-xs block opacity-60 mt-1">
                Initial: {formatCurrency(result.initialCapital)}
              </span>
            </div>
          </div>

          {/* EQUITY CURVE VS BENCHMARK RECHARTS CHART */}
          <div
            className={`p-6 rounded-2xl border transition-colors ${
              isDark
                ? 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-xl'
                : 'bg-white border-slate-200 text-slate-900 shadow-sm'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 mb-4 border-b border-slate-800/80 gap-2 font-mono">
              <div>
                <h3 className="text-sm font-black italic tracking-tight uppercase flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-400" />
                  <span>Cumulative Equity Curve vs Nifty 50 Benchmark</span>
                </h3>
                <p className="text-xs opacity-60 mt-0.5">
                  Simulated growth of ₹{result.initialCapital.toLocaleString('en-IN')} over {result.timeframe} lookback ({result.startDate} to {result.endDate})
                </p>
              </div>

              <div className="flex items-center gap-4 text-xs font-bold">
                <div className="flex items-center gap-1.5 text-indigo-400">
                  <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
                  <span>AI Scanner Strategy</span>
                </div>
                <div className="flex items-center gap-1.5 text-amber-400">
                  <div className="w-3 h-3 rounded-full bg-amber-500"></div>
                  <span>Nifty 50 Proxy</span>
                </div>
              </div>
            </div>

            <div className="h-[320px] w-full font-mono text-xs">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={result.equityCurve} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="benchmarkGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e2e8f0'} opacity={0.5} />
                  <XAxis dataKey="date" stroke={isDark ? '#94a3b8' : '#64748b'} tick={{ fontSize: 10 }} />
                  <YAxis
                    stroke={isDark ? '#94a3b8' : '#64748b'}
                    tick={{ fontSize: 10 }}
                    domain={['auto', 'auto']}
                    tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#cbd5e1',
                      borderRadius: '0.75rem',
                      fontSize: '11px',
                    }}
                    formatter={(value: any) => [`₹${Number(value).toLocaleString('en-IN')}`, 'Portfolio Value']}
                  />
                  <Area
                    type="monotone"
                    dataKey="equity"
                    name="Strategy Equity"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#equityGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="benchmark"
                    name="Nifty Benchmark"
                    stroke="#f59e0b"
                    strokeWidth={1.8}
                    strokeDasharray="4 4"
                    fillOpacity={1}
                    fill="url(#benchmarkGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* EXECUTED TRADES LOG TABLE */}
          <div
            className={`p-6 rounded-2xl border transition-colors ${
              isDark
                ? 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-xl'
                : 'bg-white border-slate-200 text-slate-900 shadow-sm'
            }`}
          >
            <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 mb-4 border-b border-slate-800/80 gap-3 font-mono">
              <div>
                <h3 className="text-sm font-black italic tracking-tight uppercase flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  <span>Historical Trade Simulation Executions ({result.trades.length} Trades)</span>
                </h3>
                <p className="text-xs opacity-60 mt-0.5">
                  Detailed entry/exit prices, AI conviction score & profit/loss audit log
                </p>
              </div>

              {/* Trade Filter Tabs */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs font-bold uppercase">
                {(['ALL', 'WIN', 'LOSS', 'BUY', 'SELL'] as const).map((filterKey) => (
                  <button
                    key={filterKey}
                    onClick={() => setTradeFilter(filterKey)}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      tradeFilter === filterKey
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {filterKey}
                  </button>
                ))}
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
                    <th className="py-3 px-3">Trade ID</th>
                    <th className="py-3 px-3">Entry Date</th>
                    <th className="py-3 px-3">Signal</th>
                    <th className="py-3 px-3">AI Pattern & Score</th>
                    <th className="py-3 px-3">Entry Price</th>
                    <th className="py-3 px-3">Exit Price</th>
                    <th className="py-3 px-3">Exit Reason</th>
                    <th className="py-3 px-3">Holding (Days)</th>
                    <th className="py-3 px-3">Return %</th>
                    <th className="py-3 px-3">PnL (₹)</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
                  {filteredTrades.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center opacity-50 font-mono">
                        No trade executions match the selected filter.
                      </td>
                    </tr>
                  ) : (
                    filteredTrades.map((t) => (
                      <tr
                        key={t.id}
                        className={`transition-colors ${
                          isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-3 px-3 font-bold opacity-80">{t.id}</td>
                        <td className="py-3 px-3 font-medium">{t.date}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                              t.signal === 'BUY'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                          >
                            {t.signal}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-bold">{t.patternName}</div>
                          <div className="text-[10px] text-indigo-400">AI Score: {t.aiScore}/100</div>
                        </td>
                        <td className="py-3 px-3 font-bold">₹{t.entryPrice.toFixed(2)}</td>
                        <td className="py-3 px-3 font-bold">₹{t.exitPrice.toFixed(2)}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                              t.exitReason === 'TARGET_1' || t.exitReason === 'TARGET_2'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : t.exitReason === 'STOP_LOSS'
                                ? 'bg-rose-500/20 text-rose-400'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {t.exitReason.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-medium">{t.holdingPeriodDays} days</td>
                        <td
                          className={`py-3 px-3 font-bold ${
                            t.returnPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {t.returnPercent >= 0 ? `+${t.returnPercent}%` : `${t.returnPercent}%`}
                        </td>
                        <td
                          className={`py-3 px-3 font-black ${
                            t.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {t.pnl >= 0 ? `+₹${t.pnl}` : `₹${t.pnl}`}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {onCreateTrade && (
                            <button
                              onClick={() =>
                                onCreateTrade({
                                  symbol: result.symbol,
                                  signal: t.signal,
                                  entryPrice: t.entryPrice,
                                  quantity: 100,
                                  stopLoss: Number((t.entryPrice * 0.98).toFixed(2)),
                                  target1: Number((t.entryPrice * 1.035).toFixed(2)),
                                  target2: Number((t.entryPrice * 1.06).toFixed(2)),
                                })
                              }
                              className="px-2.5 py-1 text-[10px] font-bold uppercase rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-all inline-flex items-center gap-1"
                            >
                              <Zap className="w-3 h-3" />
                              <span>Copy Trade</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
