import React, { useState, useMemo } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  BarChart3,
  Bot,
  Brain,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Cpu,
  Crosshair,
  Download,
  ExternalLink,
  Eye,
  Filter,
  Flame,
  Layers,
  Percent,
  Play,
  Radio,
  RefreshCw,
  Rocket,
  Search,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { StockV9Data, V9IvRegime, V9OiRegime, ScannedStock } from '../types';
import { getAllStocksV9Data } from '../utils/v9VegaGreeksEngine';

interface V9StockUniverseScannerViewProps {
  onSelectStockForDeepDive?: (stock: StockV9Data) => void;
  onTradeSetup?: (tradeSetup: any) => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
  liveStocks?: ScannedStock[];
  initialTimeframe?: '1m' | '3m' | '5m' | '15m';
}

export const V9StockUniverseScannerView: React.FC<V9StockUniverseScannerViewProps> = ({
  onSelectStockForDeepDive,
  onTradeSetup,
  theme = 'dark',
  liveStocks,
  initialTimeframe = '5m',
}) => {
  const isDark = theme !== 'light';

  // Timeframe and Universe Presets
  const [timeframe, setTimeframe] = useState<'1m' | '3m' | '5m' | '15m'>(initialTimeframe);
  const [universePreset, setUniversePreset] = useState<'BEST_50' | 'ALL_210'>('BEST_50');

  // Load all 210+ stocks through V1->V9 Quant Engine with live market prices & 5M timeframe
  const [stocksData, setStocksData] = useState<StockV9Data[]>(() =>
    getAllStocksV9Data(false, liveStocks, initialTimeframe)
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [signalFilter, setSignalFilter] = useState<'ALL' | 'CE_BUY' | 'PE_BUY' | 'HIGH_CONFIDENCE' | 'VEGA_TRAP' | 'NEUTRAL'>('ALL');
  const [ivRegimeFilter, setIvRegimeFilter] = useState<'ALL' | V9IvRegime>('ALL');
  const [oiRegimeFilter, setOiRegimeFilter] = useState<'ALL' | V9OiRegime>('ALL');
  const [sortBy, setSortBy] = useState<'score' | 'change' | 'price' | 'delta' | 'ivMom' | 'cvd' | 'pcr'>('score');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>(() =>
    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );

  // Sync with live stocks feed automatically when liveStocks prop updates or timeframe changes
  React.useEffect(() => {
    if (liveStocks && liveStocks.length > 0) {
      setStocksData(getAllStocksV9Data(true, liveStocks, timeframe));
      setLastSyncTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  }, [liveStocks, timeframe]);

  // Quick Sector List
  const sectors = useMemo(() => {
    const set = new Set<string>();
    stocksData.forEach((s) => {
      if (s.sector && s.sector !== 'Indices') set.add(s.sector);
    });
    return ['ALL', ...Array.from(set)];
  }, [stocksData]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setStocksData(getAllStocksV9Data(true, liveStocks, timeframe));
      setLastSyncTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      setIsRefreshing(false);
    }, 400);
  };

  const handleTimeframeChange = (tf: '1m' | '3m' | '5m' | '15m') => {
    setTimeframe(tf);
    setStocksData(getAllStocksV9Data(true, liveStocks, tf));
    setLastSyncTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  };

  // Filter & Sort Pipeline (incorporating Best 50 F&O ranking)
  const filteredStocks = useMemo(() => {
    // 1. Initial filter
    let results = stocksData.filter((stock) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchSymbol = stock.symbol.toLowerCase().includes(q);
        const matchName = stock.name.toLowerCase().includes(q);
        const matchSector = stock.sector.toLowerCase().includes(q);
        if (!matchSymbol && !matchName && !matchSector) return false;
      }

      // Sector
      if (selectedSector !== 'ALL' && stock.sector !== selectedSector) {
        return false;
      }

      // Signal Filter
      const verdict = stock.v9Engine.v9LiveAlgo.verdict;
      const conviction = stock.v9Engine.v9LiveAlgo.conviction;
      const isVegaTrap = stock.v9Engine.v9LiveAlgo.vegaTrapFilterTriggered;

      if (signalFilter === 'CE_BUY' && verdict !== 'CE_BUY') return false;
      if (signalFilter === 'PE_BUY' && verdict !== 'PE_BUY') return false;
      if (signalFilter === 'HIGH_CONFIDENCE') {
        if (conviction !== 'HIGH_CONFIDENCE_CE_BUY' && conviction !== 'HIGH_CONFIDENCE_PE_BUY') return false;
      }
      if (signalFilter === 'VEGA_TRAP' && !isVegaTrap) return false;
      if (signalFilter === 'NEUTRAL' && verdict !== 'NO_TRADE') return false;

      // IV Regime Filter
      if (ivRegimeFilter !== 'ALL' && stock.v9Engine.v3IvVega.ivRegime !== ivRegimeFilter) {
        return false;
      }

      // OI Regime Filter
      if (oiRegimeFilter !== 'ALL' && stock.v9Engine.v4OiEngine.oiRegime !== oiRegimeFilter) {
        return false;
      }

      return true;
    });

    // 2. Sort by chosen criterion or default master score
    results.sort((a, b) => {
      let valA = 0;
      let valB = 0;

      switch (sortBy) {
        case 'score':
          valA = a.v9Engine.v8AiScoring.masterScore;
          valB = b.v9Engine.v8AiScoring.masterScore;
          break;
        case 'change':
          valA = a.changePercent;
          valB = b.changePercent;
          break;
        case 'price':
          valA = a.spotPrice;
          valB = b.spotPrice;
          break;
        case 'delta':
          valA = Math.abs(a.v9Engine.v2Greeks.delta);
          valB = Math.abs(b.v9Engine.v2Greeks.delta);
          break;
        case 'ivMom':
          valA = a.v9Engine.v3IvVega.ivMomentumPct;
          valB = b.v9Engine.v3IvVega.ivMomentumPct;
          break;
        case 'cvd':
          valA = a.v9Engine.v6OrderFlow.netDeltaLakhs;
          valB = b.v9Engine.v6OrderFlow.netDeltaLakhs;
          break;
        case 'pcr':
          valA = a.v9Engine.v4OiEngine.pcr;
          valB = b.v9Engine.v4OiEngine.pcr;
          break;
      }

      return sortOrder === 'desc' ? valB - valA : valA - valB;
    });

    // 3. Best 50 constraint when selected
    if (universePreset === 'BEST_50') {
      return results.slice(0, 50);
    }

    return results;
  }, [stocksData, searchQuery, selectedSector, signalFilter, ivRegimeFilter, oiRegimeFilter, sortBy, sortOrder, universePreset]);

  // Key KPI Metrics
  const metrics = useMemo(() => {
    let ceBuys = 0;
    let peBuys = 0;
    let highConf = 0;
    let vegaTraps = 0;
    let totalScoreSum = 0;
    let topStock: StockV9Data | null = null;

    stocksData.forEach((s) => {
      const score = s.v9Engine.v8AiScoring.masterScore;
      totalScoreSum += score;
      if (s.v9Engine.v9LiveAlgo.verdict === 'CE_BUY') ceBuys++;
      if (s.v9Engine.v9LiveAlgo.verdict === 'PE_BUY') peBuys++;
      if (s.v9Engine.v9LiveAlgo.conviction.includes('HIGH_CONFIDENCE')) highConf++;
      if (s.v9Engine.v9LiveAlgo.vegaTrapFilterTriggered) vegaTraps++;

      if (!topStock || score > topStock.v9Engine.v8AiScoring.masterScore) {
        topStock = s;
      }
    });

    return {
      total: stocksData.length,
      ceBuys,
      peBuys,
      highConf,
      vegaTraps,
      avgScore: Math.round(totalScoreSum / (stocksData.length || 1)),
      topStock,
    };
  }, [stocksData]);

  // Export to CSV
  const handleExportCsv = () => {
    const headers = [
      'Symbol',
      'Name',
      'Sector',
      'Spot Price',
      'Change %',
      'V9 Verdict',
      'Master Score',
      'CE Win %',
      'PE Win %',
      'Delta',
      'Vega',
      'Theta Decay %',
      'IV Regime',
      'IV Mom %',
      'OI Regime',
      'PCR',
      'CVD Net Delta (L)',
      'Wyckoff Phase',
      'Recommended Strike',
      'Contract',
      'Entry Zone',
      'Stop Loss (1.2x ATR)',
      'Target 1 (1.5x ATR)',
      'Target 2 (2.5x ATR)',
      'Target 3 (4.0x ATR)',
      'Risk Reward',
    ];

    const rows = filteredStocks.map((s) => {
      const v9 = s.v9Engine;
      return [
        `"${s.symbol}"`,
        `"${s.name}"`,
        `"${s.sector}"`,
        s.spotPrice,
        s.changePercent,
        `"${v9.v9LiveAlgo.conviction}"`,
        v9.v8AiScoring.masterScore,
        v9.v8AiScoring.probabilities.ceBuyPct,
        v9.v8AiScoring.probabilities.peBuyPct,
        v9.v2Greeks.delta,
        v9.v2Greeks.vega,
        v9.v2Greeks.thetaPenaltyPct,
        `"${v9.v3IvVega.ivRegime}"`,
        v9.v3IvVega.ivMomentumPct,
        `"${v9.v4OiEngine.oiRegime}"`,
        v9.v4OiEngine.pcr,
        v9.v6OrderFlow.netDeltaLakhs,
        `"${v9.v7SmartMoney.wyckoffPhase}"`,
        v9.v9LiveAlgo.tradeSetup.strike,
        `"${v9.v9LiveAlgo.tradeSetup.contractName}"`,
        `"${v9.v9LiveAlgo.tradeSetup.entryZone.join(' - ')}"`,
        v9.v9LiveAlgo.tradeSetup.stopLoss,
        v9.v9LiveAlgo.tradeSetup.target1,
        v9.v9LiveAlgo.tradeSetup.target2,
        v9.v9LiveAlgo.tradeSetup.target3,
        `"${v9.v9LiveAlgo.tradeSetup.riskReward}"`,
      ].join(',');
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `V9_Stock_Universe_Telemetry_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Fast KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono mb-1">
            <span>F&amp;O UNIVERSE</span>
            <Building2 className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl font-mono font-black text-slate-100">{metrics.total} Stocks</div>
          <div className="text-[10px] font-mono text-indigo-400 mt-0.5">NSE Derivative List</div>
        </div>

        <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono mb-1">
            <span>CE BREAKOUTS</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-mono font-black text-emerald-400">{metrics.ceBuys} Setups</div>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5">Bullish Volatility Expansion</div>
        </div>

        <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono mb-1">
            <span>PE BREAKDOWNS</span>
            <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl font-mono font-black text-rose-400">{metrics.peBuys} Setups</div>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5">Bearish Volatility Expansion</div>
        </div>

        <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono mb-1">
            <span>HIGH CONVICTION</span>
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-mono font-black text-amber-400">{metrics.highConf} Apex</div>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5">Master Score 85+</div>
        </div>

        <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono mb-1">
            <span>VEGA TRAPS BLOCKED</span>
            <AlertTriangle className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div className="text-xl font-mono font-black text-orange-400">{metrics.vegaTraps} Blocked</div>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5">IV Crush Protected</div>
        </div>

        <div className={`p-3 rounded-xl border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center justify-between text-slate-400 text-[11px] font-mono mb-1">
            <span>APEX STOCK TODAY</span>
            <Rocket className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-base font-mono font-black text-purple-300 truncate">
            {metrics.topStock?.symbol || 'NIFTY'} ({metrics.topStock?.v9Engine.v8AiScoring.masterScore} pts)
          </div>
          <div className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">
            {metrics.topStock?.v9Engine.v9LiveAlgo.verdict}
          </div>
        </div>
      </div>

      {/* Control Bar: Search, Filters & Export */}
      <div
        className={`p-3.5 rounded-xl border space-y-3 ${
          isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Stock Symbol or Company Name (e.g. RELIANCE, HDFCBANK, INFY, TCS)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-4 py-2 rounded-xl text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-200 placeholder-slate-500'
                  : 'bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs font-mono"
              >
                Clear
              </button>
            )}
          </div>

          {/* Timeframe & Universe Presets & Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* 5M Timeframe Switcher */}
            <div className="flex items-center rounded-xl p-0.5 border border-slate-800 bg-slate-950">
              <span className="text-[10px] font-mono text-slate-400 px-2 font-bold flex items-center gap-1">
                <Activity className="w-3 h-3 text-cyan-400" /> TF:
              </span>
              {(['1m', '3m', '5m', '15m'] as const).map((tf) => (
                <button
                  key={tf}
                  onClick={() => handleTimeframeChange(tf)}
                  className={`px-2 py-1 rounded-lg text-xs font-mono font-bold transition-all uppercase ${
                    timeframe === tf
                      ? 'bg-cyan-600 text-white shadow-sm font-black'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tf === '5m' ? '5M ★' : tf}
                </button>
              ))}
            </div>

            {/* Best 50 vs All 210 Switcher */}
            <div className="flex items-center rounded-xl p-0.5 border border-slate-800 bg-slate-950">
              <button
                onClick={() => setUniversePreset('BEST_50')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                  universePreset === 'BEST_50'
                    ? 'bg-amber-600 text-white shadow-sm font-black'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-amber-300" />
                <span>🔥 BEST 50 STOCKS</span>
              </button>
              <button
                onClick={() => setUniversePreset('ALL_210')}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                  universePreset === 'ALL_210'
                    ? 'bg-indigo-600 text-white shadow-sm font-black'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 text-indigo-300" />
                <span>ALL 210+ F&amp;O</span>
              </button>
            </div>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`px-3 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-400' : ''}`} />
              <span>Live Refresh</span>
            </button>

            <button
              onClick={handleExportCsv}
              className={`px-3 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border ${
                isDark
                  ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
              }`}
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>Export CSV</span>
            </button>

            <div className="flex items-center rounded-xl p-0.5 border border-slate-800 bg-slate-950">
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  viewMode === 'table' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Table View
              </button>
              <button
                onClick={() => setViewMode('grid')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                  viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Card Grid
              </button>
            </div>
          </div>
        </div>

        {/* Live Status & Calibration Bar */}
        <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-800/60 text-[11px] font-mono">
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              LIVE MARKET STOCK PRICES (NSE FEED)
            </span>
            <span className="text-slate-400">
              Last Sync: <strong className="text-slate-200">{lastSyncTime}</strong>
            </span>
            <span className="text-slate-500">•</span>
            <span className="text-cyan-400 font-bold">
              Active Timeframe: {timeframe.toUpperCase()} Candle Calculus
            </span>
          </div>

          <div className="flex items-center gap-2">
            {universePreset === 'BEST_50' ? (
              <span className="px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold">
                ⭐ TOP 50 APEX CONVICTION STOCKS
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-bold">
                🌐 COMPLETE 210+ F&amp;O UNIVERSE
              </span>
            )}
          </div>
        </div>

        {/* Filter Pills Row */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar text-xs font-mono">
          <span className="text-slate-400 shrink-0 flex items-center gap-1 font-bold">
            <Filter className="w-3 h-3 text-indigo-400" /> V9 Signal:
          </span>
          {[
            { id: 'ALL', label: 'All Signals' },
            { id: 'HIGH_CONFIDENCE', label: '⭐ High-Confidence Only' },
            { id: 'CE_BUY', label: '🟢 CE Buy (Calls)' },
            { id: 'PE_BUY', label: '🔴 PE Buy (Puts)' },
            { id: 'VEGA_TRAP', label: '⚠️ Vega Traps Filtered' },
            { id: 'NEUTRAL', label: '🛡️ Neutral / No Trade' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setSignalFilter(item.id as any)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-all border ${
                signalFilter === item.id
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                  : isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Sector Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar text-xs font-mono">
          <span className="text-slate-400 shrink-0 font-bold">Sector:</span>
          {sectors.map((sec) => (
            <button
              key={sec}
              onClick={() => setSelectedSector(sec)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 transition-all border ${
                selectedSector === sec
                  ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
                  : isDark
                  ? 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              {sec}
            </button>
          ))}
        </div>
      </div>

      {/* Result Count Banner */}
      <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-1">
        <div>
          Showing <strong className="text-slate-200">{filteredStocks.length}</strong> of {stocksData.length} F&amp;O Stocks
          {selectedSector !== 'ALL' && <span> in <strong className="text-purple-400">{selectedSector}</strong></span>}
          {signalFilter !== 'ALL' && <span> with filter <strong className="text-indigo-400">{signalFilter}</strong></span>}
        </div>
        <div className="flex items-center gap-2">
          <span>Sort by:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className={`px-2 py-1 rounded-lg text-xs font-mono border focus:outline-none ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
            }`}
          >
            <option value="score">AI Master Score</option>
            <option value="change">% Change</option>
            <option value="price">Spot Price</option>
            <option value="delta">Option Delta</option>
            <option value="ivMom">IV Momentum %</option>
            <option value="cvd">CVD Net Delta</option>
            <option value="pcr">Put-Call Ratio (PCR)</option>
          </select>
          <button
            onClick={() => setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
            className={`px-2 py-1 rounded-lg text-xs font-mono border ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-300' : 'bg-white border-slate-200 text-slate-700'
            }`}
          >
            {sortOrder === 'desc' ? 'High → Low' : 'Low → High'}
          </button>
        </div>
      </div>

      {/* VIEW MODE 1: COMPREHENSIVE STOCK DATA TABLE */}
      {viewMode === 'table' && (
        <div className={`rounded-xl border overflow-hidden ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs font-mono">
              <thead>
                <tr className={`border-b ${isDark ? 'bg-slate-950/80 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                  <th className="py-3 px-3 font-bold">STOCK &amp; SECTOR</th>
                  <th className="py-3 px-3 font-bold text-right">SPOT / CHG</th>
                  <th className="py-3 px-3 font-bold text-center">V9 VERDICT</th>
                  <th className="py-3 px-3 font-bold text-center">AI SCORE (0-100)</th>
                  <th className="py-3 px-3 font-bold text-center">V2 GREEKS (Δ / VEGA / Θ)</th>
                  <th className="py-3 px-3 font-bold text-center">V3 IV REGIME</th>
                  <th className="py-3 px-3 font-bold text-center">V4 OI / PCR</th>
                  <th className="py-3 px-3 font-bold text-center">V5 VWAP &amp; EMA</th>
                  <th className="py-3 px-3 font-bold text-center">V6 CVD / V7 WYCKOFF</th>
                  <th className="py-3 px-3 font-bold text-center">V9 TRADE CONTRACT</th>
                  <th className="py-3 px-3 font-bold text-right">ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40">
                {filteredStocks.map((stock, index) => {
                  const v9 = stock.v9Engine;
                  const isBull = stock.changePercent >= 0;
                  const isCe = v9.v9LiveAlgo.tradeSetup.optionType === 'CE';
                  const isHighConf = v9.v9LiveAlgo.conviction.includes('HIGH_CONFIDENCE');
                  const isVegaTrap = v9.v9LiveAlgo.vegaTrapFilterTriggered;
                  const rank = index + 1;

                  return (
                    <tr
                      key={stock.symbol}
                      className={`hover:bg-indigo-950/20 transition-colors group ${
                        isHighConf
                          ? isCe
                            ? 'bg-emerald-950/10'
                            : 'bg-rose-950/10'
                          : ''
                      }`}
                    >
                      {/* 1. Symbol & Sector with Rank Badge */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black ${
                              rank === 1
                                ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                                : rank <= 3
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                : rank <= 10
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            #{rank}
                          </span>
                          <button
                            onClick={() => onSelectStockForDeepDive?.(stock)}
                            className="font-black text-slate-100 hover:text-indigo-400 transition-colors text-sm flex items-center gap-1 group-hover:underline"
                          >
                            {stock.symbol}
                            <ChevronRight className="w-3.5 h-3.5 opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                          </button>
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-[140px] mt-0.5">{stock.name}</div>
                        <div className="text-[9px] text-purple-400 uppercase tracking-wider">{stock.sector}</div>
                      </td>

                      {/* 2. Spot & % Change (Live Market Price) */}
                      <td className="py-3 px-3 text-right font-mono">
                        <div className="font-black text-slate-100 flex items-center justify-end gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                          <span>₹{stock.spotPrice.toFixed(2)}</span>
                        </div>
                        <div
                          className={`text-xs font-bold flex items-center justify-end gap-0.5 ${
                            isBull ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {isBull ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          <span>{isBull ? '+' : ''}{stock.changePercent}%</span>
                        </div>
                        <div className="text-[10px] text-slate-500">
                          Lot: {stock.lotSize}
                        </div>
                      </td>

                      {/* 3. V9 Verdict */}
                      <td className="py-3 px-3 text-center">
                        {v9.v9LiveAlgo.verdict === 'CE_BUY' ? (
                          <div className={`px-2 py-1 rounded-lg text-[10px] font-black inline-flex items-center gap-1 border ${
                            isHighConf
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm shadow-emerald-900/40'
                              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                          }`}>
                            <TrendingUp className="w-3 h-3" />
                            <span>{isHighConf ? 'APEX CE BUY' : 'CE BUY'}</span>
                          </div>
                        ) : v9.v9LiveAlgo.verdict === 'PE_BUY' ? (
                          <div className={`px-2 py-1 rounded-lg text-[10px] font-black inline-flex items-center gap-1 border ${
                            isHighConf
                              ? 'bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm shadow-rose-900/40'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                          }`}>
                            <TrendingDown className="w-3 h-3" />
                            <span>{isHighConf ? 'APEX PE BUY' : 'PE BUY'}</span>
                          </div>
                        ) : isVegaTrap ? (
                          <div className="px-2 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 bg-amber-500/20 text-amber-300 border border-amber-500/40">
                            <AlertTriangle className="w-3 h-3" />
                            <span>VEGA TRAP</span>
                          </div>
                        ) : (
                          <div className="px-2 py-1 rounded-lg text-[10px] font-bold inline-flex items-center gap-1 bg-slate-800/60 text-slate-400 border border-slate-700">
                            <span>NO TRADE</span>
                          </div>
                        )}
                        <div className="text-[9px] text-slate-500 mt-0.5">
                          {isCe ? `CE Win: ${v9.v8AiScoring.probabilities.ceBuyPct}%` : `PE Win: ${v9.v8AiScoring.probabilities.peBuyPct}%`}
                        </div>
                      </td>

                      {/* 4. AI Master Score */}
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex flex-col items-center">
                          <span
                            className={`text-base font-black font-mono ${
                              v9.v8AiScoring.masterScore >= 80
                                ? 'text-emerald-400'
                                : v9.v8AiScoring.masterScore >= 65
                                ? 'text-indigo-400'
                                : v9.v8AiScoring.masterScore >= 50
                                ? 'text-amber-400'
                                : 'text-slate-400'
                            }`}
                          >
                            {v9.v8AiScoring.masterScore}
                            <span className="text-[10px] text-slate-500">/100</span>
                          </span>
                          <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                            <div
                              className={`h-full ${
                                v9.v8AiScoring.masterScore >= 80
                                  ? 'bg-emerald-400'
                                  : v9.v8AiScoring.masterScore >= 65
                                  ? 'bg-indigo-400'
                                  : 'bg-amber-400'
                              }`}
                              style={{ width: `${v9.v8AiScoring.masterScore}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* 5. V2 Greeks */}
                      <td className="py-3 px-3 text-center font-mono">
                        <div className="text-xs font-bold text-slate-200">
                          Δ {v9.v2Greeks.delta >= 0 ? '+' : ''}{v9.v2Greeks.delta.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center justify-center gap-2 mt-0.5">
                          <span>Veg: {v9.v2Greeks.vega.toFixed(1)}</span>
                          <span className="opacity-40">•</span>
                          <span className="text-rose-400">Θ: {v9.v2Greeks.thetaPenaltyPct}%</span>
                        </div>
                      </td>

                      {/* 6. V3 IV Regime */}
                      <td className="py-3 px-3 text-center font-mono">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase tracking-wider ${
                            v9.v3IvVega.ivRegime === 'BULLISH_EXPANSION'
                              ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                              : v9.v3IvVega.ivRegime === 'BEARISH_EXPANSION'
                              ? 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                              : 'bg-slate-800/40 text-slate-400 border-slate-700'
                          }`}
                        >
                          {v9.v3IvVega.ivRegime.replace('_', ' ')}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          IV: {v9.v3IvVega.atmIv}% (Δ {v9.v3IvVega.ivMomentumPct >= 0 ? '+' : ''}{v9.v3IvVega.ivMomentumPct}%)
                        </div>
                      </td>

                      {/* 7. V4 OI / PCR */}
                      <td className="py-3 px-3 text-center font-mono">
                        <div className="text-xs font-bold text-slate-200">
                          PCR: <strong className={v9.v4OiEngine.pcr >= 1.0 ? 'text-emerald-400' : 'text-rose-400'}>{v9.v4OiEngine.pcr}</strong>
                        </div>
                        <div className="text-[10px] text-indigo-300 mt-0.5 uppercase">
                          {v9.v4OiEngine.oiRegime.replace('_', ' ')}
                        </div>
                      </td>

                      {/* 8. V5 VWAP & EMA */}
                      <td className="py-3 px-3 text-center font-mono">
                        <div className="text-xs text-slate-200">
                          VWAP: {v9.v5Technical.vwap} ({v9.v5Technical.spotVsVwapPct >= 0 ? '+' : ''}{v9.v5Technical.spotVsVwapPct}%)
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          EMA: <span className={v9.v5Technical.emaAlignment === 'BULLISH_STACK' ? 'text-emerald-400' : 'text-rose-400'}>{v9.v5Technical.emaAlignment}</span>
                        </div>
                      </td>

                      {/* 9. V6 CVD & V7 Wyckoff */}
                      <td className="py-3 px-3 text-center font-mono">
                        <div className="text-xs text-slate-200 flex items-center justify-center gap-1">
                          <span>CVD:</span>
                          <strong className={v9.v6OrderFlow.netDeltaLakhs >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                            {v9.v6OrderFlow.netDeltaLakhs >= 0 ? '+' : ''}{v9.v6OrderFlow.netDeltaLakhs}L
                          </strong>
                        </div>
                        <div className="text-[9px] text-purple-300 mt-0.5 uppercase truncate max-w-[120px] mx-auto">
                          {v9.v7SmartMoney.wyckoffPhase.replace('ACCUMULATION_', '').replace('DISTRIBUTION_', '')}
                        </div>
                      </td>

                      {/* 10. V9 Trade Contract */}
                      <td className="py-3 px-3 text-center font-mono">
                        <div className="text-xs font-black text-slate-100">
                          {v9.v9LiveAlgo.tradeSetup.strike} {v9.v9LiveAlgo.tradeSetup.optionType}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          Entry: ₹{v9.v9LiveAlgo.tradeSetup.ltp} • SL: ₹{v9.v9LiveAlgo.tradeSetup.stopLoss}
                        </div>
                        <div className="text-[9px] text-emerald-400">
                          T1: ₹{v9.v9LiveAlgo.tradeSetup.target1} • R:R {v9.v9LiveAlgo.tradeSetup.riskReward.split('/')[0]}
                        </div>
                      </td>

                      {/* 11. Actions */}
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => onSelectStockForDeepDive?.(stock)}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1 transition-all shadow-sm"
                            title="Inspect complete V1 -> V9 Quantitative Pipeline"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>V1→V9</span>
                          </button>

                          <button
                            onClick={() => onTradeSetup?.(v9.v9LiveAlgo.tradeSetup)}
                            className={`px-2 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-1 transition-all border ${
                              isCe
                                ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                                : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40'
                            }`}
                            title="Execute Paper Trade with calculated Stop Loss and Targets"
                          >
                            <Play className="w-3 h-3" />
                            <span>Trade</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: RESPONSIVE CARD GRID */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredStocks.map((stock, index) => {
            const v9 = stock.v9Engine;
            const isBull = stock.changePercent >= 0;
            const isCe = v9.v9LiveAlgo.tradeSetup.optionType === 'CE';
            const isHighConf = v9.v9LiveAlgo.conviction.includes('HIGH_CONFIDENCE');
            const isVegaTrap = v9.v9LiveAlgo.vegaTrapFilterTriggered;
            const rank = index + 1;

            return (
              <div
                key={stock.symbol}
                className={`p-4 rounded-xl border transition-all hover:border-indigo-500/60 ${
                  isHighConf
                    ? isCe
                      ? 'bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border-emerald-500/40 shadow-md shadow-emerald-950/20'
                      : 'bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-950 border-rose-500/40 shadow-md shadow-rose-950/20'
                    : isDark
                    ? 'bg-slate-900/80 border-slate-800'
                    : 'bg-white border-slate-200'
                }`}
              >
                {/* Card Top */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-black ${
                          rank === 1
                            ? 'bg-amber-500/30 text-amber-300 border border-amber-500/50'
                            : rank <= 3
                            ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                            : rank <= 10
                            ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        #{rank}
                      </span>
                      <span className="font-black text-base text-slate-100 font-mono">{stock.symbol}</span>
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                        {stock.sector}
                      </span>
                    </div>
                    <div className="text-xs text-slate-400 font-mono truncate max-w-[200px] mt-0.5">{stock.name}</div>
                  </div>

                  <div className="text-right font-mono">
                    <div className="text-base font-black text-slate-100 flex items-center justify-end gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping inline-block" />
                      <span>₹{stock.spotPrice.toFixed(2)}</span>
                    </div>
                    <div
                      className={`text-xs font-bold flex items-center justify-end gap-0.5 ${
                        isBull ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {isBull ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      <span>{isBull ? '+' : ''}{stock.changePercent}%</span>
                    </div>
                  </div>
                </div>

                {/* Score & Verdict Banner */}
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60 font-mono mb-3">
                  <div>
                    <div className="text-[10px] text-slate-500 font-bold">V9 VERDICT</div>
                    <div className="text-xs font-black">
                      {v9.v9LiveAlgo.verdict === 'CE_BUY' ? (
                        <span className="text-emerald-400 flex items-center gap-1">
                          <TrendingUp className="w-3.5 h-3.5" />
                          {isHighConf ? 'APEX CE BUY' : 'CE BUY'}
                        </span>
                      ) : v9.v9LiveAlgo.verdict === 'PE_BUY' ? (
                        <span className="text-rose-400 flex items-center gap-1">
                          <TrendingDown className="w-3.5 h-3.5" />
                          {isHighConf ? 'APEX PE BUY' : 'PE BUY'}
                        </span>
                      ) : isVegaTrap ? (
                        <span className="text-amber-400 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          VEGA TRAP
                        </span>
                      ) : (
                        <span className="text-slate-400">NO TRADE</span>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] text-slate-500 font-bold">AI MASTER SCORE</div>
                    <div className="text-base font-black text-indigo-400">
                      {v9.v8AiScoring.masterScore} <span className="text-[10px] text-slate-500">/100</span>
                    </div>
                  </div>
                </div>

                {/* Quant Matrix Highlights */}
                <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3">
                  <div className="p-2 rounded-lg bg-slate-950/40 border border-slate-800/40">
                    <div className="text-[10px] text-slate-500">V2 GREEKS</div>
                    <div className="font-bold text-slate-200">Δ {v9.v2Greeks.delta.toFixed(2)}</div>
                    <div className="text-[10px] text-slate-400">Vega: {v9.v2Greeks.vega.toFixed(1)}</div>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-950/40 border border-slate-800/40">
                    <div className="text-[10px] text-slate-500">V3 IV REGIME</div>
                    <div className="font-bold text-purple-300 truncate text-[11px]">
                      {v9.v3IvVega.ivRegime.replace('_', ' ')}
                    </div>
                    <div className="text-[10px] text-slate-400">IV: {v9.v3IvVega.atmIv}%</div>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-950/40 border border-slate-800/40">
                    <div className="text-[10px] text-slate-500">V4 OI / PCR</div>
                    <div className="font-bold text-slate-200">PCR {v9.v4OiEngine.pcr}</div>
                    <div className="text-[10px] text-slate-400 truncate">{v9.v4OiEngine.oiRegime}</div>
                  </div>

                  <div className="p-2 rounded-lg bg-slate-950/40 border border-slate-800/40">
                    <div className="text-[10px] text-slate-500">V6 CVD FLOW</div>
                    <div className={`font-bold ${v9.v6OrderFlow.netDeltaLakhs >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {v9.v6OrderFlow.netDeltaLakhs >= 0 ? '+' : ''}{v9.v6OrderFlow.netDeltaLakhs}L
                    </div>
                    <div className="text-[10px] text-slate-400">CVD: {v9.v6OrderFlow.orderFlowScore} pts</div>
                  </div>
                </div>

                {/* Trade Setup Contract Box */}
                <div className="p-2.5 rounded-lg bg-indigo-950/30 border border-indigo-500/30 font-mono text-xs mb-3">
                  <div className="flex items-center justify-between font-bold text-indigo-300 mb-1">
                    <span>{v9.v9LiveAlgo.tradeSetup.contractName}</span>
                    <span>LTP: ₹{v9.v9LiveAlgo.tradeSetup.ltp}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-300">
                    <span>SL: <strong className="text-rose-400">₹{v9.v9LiveAlgo.tradeSetup.stopLoss}</strong></span>
                    <span>T1: <strong className="text-emerald-400">₹{v9.v9LiveAlgo.tradeSetup.target1}</strong></span>
                    <span>T2: <strong className="text-emerald-400">₹{v9.v9LiveAlgo.tradeSetup.target2}</strong></span>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => onSelectStockForDeepDive?.(stock)}
                    className="flex-1 py-2 rounded-xl text-xs font-mono font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-1.5 transition-all shadow-sm"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Inspect V1→V9 Pipeline</span>
                  </button>

                  <button
                    onClick={() => onTradeSetup?.(v9.v9LiveAlgo.tradeSetup)}
                    className={`px-3 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1 transition-all border ${
                      isCe
                        ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border-emerald-500/40'
                        : 'bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border-rose-500/40'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>Trade</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
