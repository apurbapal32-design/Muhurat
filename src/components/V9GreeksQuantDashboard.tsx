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
  Clock,
  Compass,
  Cpu,
  Crosshair,
  Download,
  Eye,
  Filter,
  Flame,
  HelpCircle,
  Info,
  Layers,
  Percent,
  Play,
  Radio,
  RefreshCw,
  Rocket,
  Scale,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Table,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  StockV9Data,
  V9IvRegime,
  V9OiRegime,
  V9Verdict,
  V9Conviction,
  ScannedStock,
} from '../types';
import { getAllStocksV9Data, calculateAnalyticalGreeks } from '../utils/v9VegaGreeksEngine';

interface V9GreeksQuantDashboardProps {
  onSelectStockForDeepDive?: (stock: StockV9Data) => void;
  onTradeSetup?: (tradeSetup: any) => void;
  onBackToScanner?: () => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
  liveStocks?: ScannedStock[];
  initialTimeframe?: '1m' | '3m' | '5m' | '15m';
}

export const V9GreeksQuantDashboard: React.FC<V9GreeksQuantDashboardProps> = ({
  onSelectStockForDeepDive,
  onTradeSetup,
  onBackToScanner,
  theme = 'dark',
  liveStocks,
  initialTimeframe = '5m',
}) => {
  const isDark = theme !== 'light';

  // Presets & Timeframe
  const [timeframe, setTimeframe] = useState<'1m' | '3m' | '5m' | '15m'>(initialTimeframe);
  const [universePreset, setUniversePreset] = useState<'BEST_50' | 'ALL_210'>('BEST_50');

  // Load all F&O stocks with full V1->V9 quantitative calculations using live market prices
  const [stocksData, setStocksData] = useState<StockV9Data[]>(() =>
    getAllStocksV9Data(false, liveStocks, initialTimeframe)
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [selectedRegime, setSelectedRegime] = useState<'ALL' | V9IvRegime>('ALL');
  const [selectedVerdict, setSelectedVerdict] = useState<'ALL' | 'CE_BUY' | 'PE_BUY' | 'VEGA_TRAP' | 'HIGH_CONFIDENCE'>('ALL');
  const [lastSyncTime, setLastSyncTime] = useState<string>(() =>
    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  );

  // Sync with live stocks feed automatically when liveStocks updates
  React.useEffect(() => {
    if (liveStocks && liveStocks.length > 0) {
      setStocksData(getAllStocksV9Data(true, liveStocks, timeframe));
      setLastSyncTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  }, [liveStocks, timeframe]);

  // Quantitative Metric Sliders / Filter Thresholds
  const [minGreeksScore, setMinGreeksScore] = useState<number>(0);
  const [minVegaScore, setMinVegaScore] = useState<number>(-5);
  const [maxThetaPenalty, setMaxThetaPenalty] = useState<number>(50); // % of LTP
  const [deltaRange, setDeltaRange] = useState<[number, number]>([0.2, 0.8]);

  // Sorting & Display Modes
  const [sortBy, setSortBy] = useState<
    'greeksScore' | 'vegaMom' | 'ivMom' | 'vegaScore' | 'delta' | 'gamma' | 'thetaPenalty' | 'iv' | 'priceChg'
  >('vegaMom');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [activeView, setActiveView] = useState<'matrix' | 'table' | 'simulator'>('matrix');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Active Simulator Stock (Selected for What-If Analysis)
  const [simulatorStock, setSimulatorStock] = useState<StockV9Data>(() => stocksData[0] || null);
  const [simSpotShiftPct, setSimSpotShiftPct] = useState<number>(1.5);
  const [simIvShiftPct, setSimIvShiftPct] = useState<number>(2.0);
  const [simDaysDecay, setSimDaysDecay] = useState<number>(1);

  // Quick Sector list
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
    }, 350);
  };

  const handleTimeframeChange = (tf: '1m' | '3m' | '5m' | '15m') => {
    setTimeframe(tf);
    setStocksData(getAllStocksV9Data(true, liveStocks, tf));
    setLastSyncTime(new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
  };

  // Filtered & Sorted Stocks Pipeline
  const filteredStocks = useMemo(() => {
    const base = stocksData
      .filter((stock) => {
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchSym = stock.symbol.toLowerCase().includes(q);
          const matchName = stock.name.toLowerCase().includes(q);
          const matchSec = stock.sector.toLowerCase().includes(q);
          if (!matchSym && !matchName && !matchSec) return false;
        }

        // Sector
        if (selectedSector !== 'ALL' && stock.sector !== selectedSector) return false;

        // Regime
        const regime = stock.v9Engine.v3IvVega.ivRegime;
        if (selectedRegime !== 'ALL' && regime !== selectedRegime) return false;

        // Verdict & Filter
        const verdict = stock.v9Engine.v9LiveAlgo.verdict;
        const conviction = stock.v9Engine.v9LiveAlgo.conviction;
        const isVegaTrap = stock.v9Engine.v9LiveAlgo.vegaTrapFilterTriggered;

        if (selectedVerdict === 'CE_BUY' && verdict !== 'CE_BUY') return false;
        if (selectedVerdict === 'PE_BUY' && verdict !== 'PE_BUY') return false;
        if (selectedVerdict === 'VEGA_TRAP' && !isVegaTrap) return false;
        if (
          selectedVerdict === 'HIGH_CONFIDENCE' &&
          conviction !== 'HIGH_CONFIDENCE_CE_BUY' &&
          conviction !== 'HIGH_CONFIDENCE_PE_BUY'
        ) {
          return false;
        }

        // Numerical Quantitative Filter thresholds
        const greeksScore = stock.v9Engine.v2Greeks.greeksScore;
        const vegaScore = stock.v9Engine.v3IvVega.vegaExpansionScore;
        const thetaPenalty = stock.v9Engine.v2Greeks.thetaPenaltyPct;
        const delta = Math.abs(stock.v9Engine.v2Greeks.delta);

        if (greeksScore < minGreeksScore) return false;
        if (vegaScore < minVegaScore) return false;
        if (thetaPenalty > maxThetaPenalty) return false;
        if (delta < deltaRange[0] || delta > deltaRange[1]) return false;

        return true;
      })
      .sort((a, b) => {
        let valA = 0;
        let valB = 0;

        switch (sortBy) {
          case 'greeksScore':
            valA = a.v9Engine.v2Greeks.greeksScore;
            valB = b.v9Engine.v2Greeks.greeksScore;
            break;
          case 'vegaMom':
            valA = a.v9Engine.v3IvVega.vegaMomentumPct;
            valB = b.v9Engine.v3IvVega.vegaMomentumPct;
            break;
          case 'ivMom':
            valA = a.v9Engine.v3IvVega.ivMomentumPct;
            valB = b.v9Engine.v3IvVega.ivMomentumPct;
            break;
          case 'vegaScore':
            valA = a.v9Engine.v3IvVega.vegaExpansionScore;
            valB = b.v9Engine.v3IvVega.vegaExpansionScore;
            break;
          case 'delta':
            valA = Math.abs(a.v9Engine.v2Greeks.delta);
            valB = Math.abs(b.v9Engine.v2Greeks.delta);
            break;
          case 'gamma':
            valA = a.v9Engine.v2Greeks.gamma;
            valB = b.v9Engine.v2Greeks.gamma;
            break;
          case 'thetaPenalty':
            valA = a.v9Engine.v2Greeks.thetaPenaltyPct;
            valB = b.v9Engine.v2Greeks.thetaPenaltyPct;
            break;
          case 'iv':
            valA = a.v9Engine.v3IvVega.atmIv;
            valB = b.v9Engine.v3IvVega.atmIv;
            break;
          case 'priceChg':
            valA = a.changePercent;
            valB = b.changePercent;
            break;
          default:
            valA = a.v9Engine.v8AiScoring.masterScore;
            valB = b.v9Engine.v8AiScoring.masterScore;
        }

        return sortOrder === 'desc' ? valB - valA : valA - valB;
      });

    if (universePreset === 'BEST_50') {
      return base.slice(0, 50);
    }
    return base;
  }, [
    stocksData,
    searchQuery,
    selectedSector,
    selectedRegime,
    selectedVerdict,
    minGreeksScore,
    minVegaScore,
    maxThetaPenalty,
    deltaRange,
    sortBy,
    sortOrder,
    universePreset,
  ]);

  // Aggregate Market Greek Metrics
  const aggregateGreeks = useMemo(() => {
    if (stocksData.length === 0) return { meanIv: 0, avgVegaMom: 0, expansionPct: 0, vegaTrapCount: 0 };

    let totalIv = 0;
    let totalVegaMom = 0;
    let expansionCount = 0;
    let trapCount = 0;

    stocksData.forEach((s) => {
      totalIv += s.v9Engine.v3IvVega.atmIv;
      totalVegaMom += s.v9Engine.v3IvVega.vegaMomentumPct;
      if (
        s.v9Engine.v3IvVega.ivRegime === 'BULLISH_EXPANSION' ||
        s.v9Engine.v3IvVega.ivRegime === 'BEARISH_EXPANSION'
      ) {
        expansionCount++;
      }
      if (s.v9Engine.v9LiveAlgo.vegaTrapFilterTriggered) {
        trapCount++;
      }
    });

    return {
      meanIv: Number((totalIv / stocksData.length).toFixed(1)),
      avgVegaMom: Number((totalVegaMom / stocksData.length).toFixed(2)),
      expansionPct: Number(((expansionCount / stocksData.length) * 100).toFixed(1)),
      vegaTrapCount: trapCount,
      totalCount: stocksData.length,
    };
  }, [stocksData]);

  // Quadrant categorization for the 4 Regimes Scatter Matrix
  const regimeQuadrantData = useMemo(() => {
    const quadrants = {
      bullishExpansion: [] as StockV9Data[],
      bullishContraction: [] as StockV9Data[],
      bearishExpansion: [] as StockV9Data[],
      bearishContraction: [] as StockV9Data[],
    };

    filteredStocks.forEach((s) => {
      const reg = s.v9Engine.v3IvVega.ivRegime;
      if (reg === 'BULLISH_EXPANSION') quadrants.bullishExpansion.push(s);
      else if (reg === 'BULLISH_CONTRACTION') quadrants.bullishContraction.push(s);
      else if (reg === 'BEARISH_EXPANSION') quadrants.bearishExpansion.push(s);
      else if (reg === 'BEARISH_CONTRACTION') quadrants.bearishContraction.push(s);
    });

    return quadrants;
  }, [filteredStocks]);

  // Sector Greeks Rollup
  const sectorRollup = useMemo(() => {
    const map: Record<string, { count: number; sumIv: number; sumVegaMom: number; sumSkew: number; bullishExp: number }> = {};

    stocksData.forEach((s) => {
      if (!s.sector || s.sector === 'Indices') return;
      if (!map[s.sector]) {
        map[s.sector] = { count: 0, sumIv: 0, sumVegaMom: 0, sumSkew: 0, bullishExp: 0 };
      }
      map[s.sector].count++;
      map[s.sector].sumIv += s.v9Engine.v3IvVega.atmIv;
      map[s.sector].sumVegaMom += s.v9Engine.v3IvVega.vegaMomentumPct;
      map[s.sector].sumSkew += s.v9Engine.v3IvVega.ivSkew;
      if (s.v9Engine.v3IvVega.ivRegime === 'BULLISH_EXPANSION') {
        map[s.sector].bullishExp++;
      }
    });

    return Object.entries(map)
      .map(([sec, stats]) => ({
        sector: sec,
        count: stats.count,
        avgIv: Number((stats.sumIv / stats.count).toFixed(1)),
        avgVegaMom: Number((stats.sumVegaMom / stats.count).toFixed(2)),
        avgSkew: Number((stats.sumSkew / stats.count).toFixed(2)),
        expansionRatioPct: Number(((stats.bullishExp / stats.count) * 100).toFixed(0)),
      }))
      .sort((a, b) => b.avgVegaMom - a.avgVegaMom);
  }, [stocksData]);

  // Analytical Greek Simulation Calculator for What-If Engine
  const simulatedOutcome = useMemo(() => {
    if (!simulatorStock) return null;
    const baseSpot = simulatorStock.spotPrice;
    const trade = simulatorStock.v9Engine.v9LiveAlgo.tradeSetup;
    const baseLtp = trade.ltp;
    const strike = trade.strike;
    const isCall = trade.optionType === 'CE';
    const baseIv = trade.iv;
    const days = 3;

    // Shifted parameters
    const newSpot = baseSpot * (1 + simSpotShiftPct / 100);
    const newIv = Math.max(5, baseIv + simIvShiftPct);
    const newDaysToExpiry = Math.max(0.001, (days - simDaysDecay) / 365);

    const calculated = calculateAnalyticalGreeks(
      newSpot,
      strike,
      newDaysToExpiry,
      newIv
    );

    const newOptionPrice = isCall ? calculated.callPrice : calculated.putPrice;
    const priceDiff = Number((newOptionPrice - baseLtp).toFixed(2));
    const pnlPct = Number(((priceDiff / baseLtp) * 100).toFixed(1));

    // Greek PnL attribution components
    const deltaMove = (newSpot - baseSpot) * (isCall ? trade.delta : trade.delta);
    const vegaMove = simIvShiftPct * trade.vega;
    const thetaMove = -(trade.theta * simDaysDecay);

    return {
      baseLtp,
      newOptionPrice,
      priceDiff,
      pnlPct,
      deltaMove: Number(deltaMove.toFixed(2)),
      vegaMove: Number(vegaMove.toFixed(2)),
      thetaMove: Number(thetaMove.toFixed(2)),
      newGreeks: calculated,
    };
  }, [simulatorStock, simSpotShiftPct, simIvShiftPct, simDaysDecay]);

  // Export CSV Handler
  const handleExportCSV = () => {
    const headers = [
      'Symbol',
      'Name',
      'Sector',
      'Spot Price',
      'Change %',
      'ATM IV',
      'IV Rank',
      'IV Skew',
      'Delta',
      'Gamma',
      'Theta/Day',
      'Theta Penalty %',
      'Vega',
      'Normalized Vega %',
      'IV Momentum %',
      'Vega Momentum %',
      'Vega Expansion Score',
      'IV Regime',
      'Vega Trap Triggered',
      'Greeks Score',
      'AI Master Score',
      'Verdict',
      'Recommended Strike',
      'Entry LTP',
      'Stop Loss',
      'Target 1',
    ];

    const rows = filteredStocks.map((s) => [
      s.symbol,
      `"${s.name}"`,
      s.sector,
      s.spotPrice,
      s.changePercent,
      s.v9Engine.v3IvVega.atmIv,
      s.v9Engine.v3IvVega.ivRank,
      s.v9Engine.v3IvVega.ivSkew,
      s.v9Engine.v2Greeks.delta,
      s.v9Engine.v2Greeks.gamma,
      s.v9Engine.v2Greeks.theta,
      s.v9Engine.v2Greeks.thetaPenaltyPct,
      s.v9Engine.v2Greeks.vega,
      s.v9Engine.v2Greeks.normalizedVegaPct,
      s.v9Engine.v3IvVega.ivMomentumPct,
      s.v9Engine.v3IvVega.vegaMomentumPct,
      s.v9Engine.v3IvVega.vegaExpansionScore,
      s.v9Engine.v3IvVega.ivRegime,
      s.v9Engine.v9LiveAlgo.vegaTrapFilterTriggered ? 'YES' : 'NO',
      s.v9Engine.v2Greeks.greeksScore,
      s.v9Engine.v8AiScoring.masterScore,
      s.v9Engine.v9LiveAlgo.verdict,
      s.v9Engine.v9LiveAlgo.tradeSetup.contractName,
      s.v9Engine.v9LiveAlgo.tradeSetup.ltp,
      s.v9Engine.v9LiveAlgo.tradeSetup.stopLoss,
      s.v9Engine.v9LiveAlgo.tradeSetup.target1,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `V9_Greeks_Quant_Dashboard_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4">
      {/* Top Header Cockpit */}
      <div
        className={`p-4 sm:p-5 rounded-2xl border shadow-xl flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 transition-all ${
          isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-slate-950/50' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-600 text-white shadow-lg shadow-purple-500/20">
            <Scale className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black font-mono tracking-tight bg-gradient-to-r from-purple-400 via-pink-400 to-indigo-300 bg-clip-text text-transparent">
                📊 V9 GREEKS QUANTITATIVE DASHBOARD
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black font-mono uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                210+ F&amp;O STOCKS • VEGA MOMENTUM &amp; IV REGIMES
              </span>
            </div>
            <p className="text-xs opacity-70 font-mono flex items-center gap-2 mt-0.5">
              <span>IV, Delta (Δ), Gamma (Γ), Theta (Θ), and Vega (𝒱) Quantitative Engine</span>
              <span className="opacity-40">•</span>
              <span className="text-purple-400">Vega Expansion (VE) &amp; Volatility Quadrants</span>
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Timeframe Switcher */}
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

          {/* Universe Preset Switcher */}
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
              <span>🔥 BEST 50</span>
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
              <span>ALL 210+</span>
            </button>
          </div>

          {onBackToScanner && (
            <button
              onClick={onBackToScanner}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border transition-all ${
                isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              <span>← Scanner</span>
            </button>
          )}

          <button
            onClick={handleExportCSV}
            className="px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border border-emerald-500/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 transition-all shadow-md shadow-emerald-500/10"
            title="Download full quantitative dataset in CSV format"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>

          <button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 border transition-all ${
              isDark ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-md shadow-indigo-600/30' : 'bg-indigo-600 hover:bg-indigo-700 text-white border-indigo-600'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>Live Sync</span>
          </button>
        </div>
      </div>

      {/* Live Market Price & Calibration Strip */}
      <div className="flex items-center justify-between flex-wrap gap-2 px-1 text-xs font-mono">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            LIVE MARKET STOCK PRICES (NSE FEED)
          </span>
          <span className="text-slate-400">
            Last Sync: <strong className="text-slate-200">{lastSyncTime}</strong>
          </span>
          <span className="text-slate-500">•</span>
          <span className="text-cyan-400 font-bold">
            Active: {timeframe.toUpperCase()} Candle Engine
          </span>
        </div>

        <div>
          {universePreset === 'BEST_50' ? (
            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold">
              ⭐ SHOWING TOP 50 BEST F&amp;O STOCKS BY VEGA MOMENTUM &amp; SCORE
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 font-bold">
              🌐 SHOWING ALL {filteredStocks.length} F&amp;O STOCKS
            </span>
          )}
        </div>
      </div>

      {/* Aggregate KPI Summary Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="text-[10px] font-mono uppercase opacity-70 flex items-center justify-between">
            <span>Universe Mean IV</span>
            <Activity className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-xl font-black font-mono text-purple-400 mt-1">
            {aggregateGreeks.meanIv}%
          </div>
          <p className="text-[10px] font-mono opacity-60 mt-0.5">
            Across 210 F&amp;O Equities
          </p>
        </div>

        <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="text-[10px] font-mono uppercase opacity-70 flex items-center justify-between">
            <span>Avg Vega Momentum (Δ𝒱)</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-xl font-black font-mono text-emerald-400 mt-1">
            {aggregateGreeks.avgVegaMom > 0 ? '+' : ''}{aggregateGreeks.avgVegaMom}%
          </div>
          <p className="text-[10px] font-mono opacity-60 mt-0.5">
            Intraday Vega Velocity
          </p>
        </div>

        <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="text-[10px] font-mono uppercase opacity-70 flex items-center justify-between">
            <span>Volatility Expansion Ratio</span>
            <Zap className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl font-black font-mono text-indigo-300 mt-1">
            {aggregateGreeks.expansionPct}%
          </div>
          <p className="text-[10px] font-mono opacity-60 mt-0.5">
            Stocks with Expanding IV
          </p>
        </div>

        <div className={`p-3.5 rounded-xl border ${isDark ? 'bg-amber-950/30 border-amber-500/30 text-amber-200' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          <div className="text-[10px] font-mono uppercase opacity-80 flex items-center justify-between">
            <span>Vega Trap Alert Filter</span>
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl font-black font-mono text-amber-400 mt-1">
            {aggregateGreeks.vegaTrapCount} Stocks Flagged
          </div>
          <p className="text-[10px] font-mono opacity-80 mt-0.5">
            Contraction crush blocked
          </p>
        </div>
      </div>

      {/* Formula & Educational Rule Banner */}
      <div
        className={`p-3.5 rounded-xl border flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 text-xs font-mono ${
          isDark ? 'bg-gradient-to-r from-purple-950/30 via-slate-900 to-indigo-950/30 border-purple-500/30 text-purple-200' : 'bg-purple-50 border-purple-200 text-purple-900'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Brain className="w-5 h-5 text-purple-400 shrink-0" />
          <div>
            <strong className="block font-black text-sm">V9 VEGA &amp; IV REGIME SCORING FORMULA SPECIFICATION</strong>
            <span className="opacity-80 text-[11px]">
              • <strong>Vega Expansion (VE) Score</strong> = (IV Momentum % × 0.60) + (Vega Momentum % × 0.40)
              <br className="hidden sm:inline" />
              {' '}• <strong>Composite Greeks Score</strong> = (Delta Alignment × 0.35) + (VE Score × 0.35) - (Theta Decay Penalty × 0.20) + (Gamma Safety × 0.10)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-end lg:self-center shrink-0">
          <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-black border border-purple-500/40">
            VE &gt; +1.0 = SURGE
          </span>
          <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-black border border-rose-500/40">
            VE &lt; -1.0 = CRUSH
          </span>
        </div>
      </div>

      {/* View Switcher: 4-Quadrant Volatility Matrix vs Detailed Quantitative Table vs What-If Simulator */}
      <div className={`p-2 rounded-xl border flex items-center justify-between gap-2 ${isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setActiveView('matrix')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition-all ${
              activeView === 'matrix' ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Compass className="w-4 h-4 text-purple-300" />
            <span>4-Quadrant Volatility Matrix</span>
          </button>

          <button
            onClick={() => setActiveView('table')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition-all ${
              activeView === 'table' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Table className="w-4 h-4 text-indigo-300" />
            <span>Full F&amp;O Greeks Quant Table ({filteredStocks.length})</span>
          </button>

          <button
            onClick={() => setActiveView('simulator')}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-2 transition-all ${
              activeView === 'simulator' ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Cpu className="w-4 h-4 text-emerald-300" />
            <span>What-If Greek Simulator</span>
          </button>
        </div>

        <div className="text-xs font-mono opacity-60 hidden sm:block">
          Matching: <strong className="text-slate-200">{filteredStocks.length}</strong> / {stocksData.length}
        </div>
      </div>

      {/* Filter & Control Bar */}
      <div className={`p-3.5 rounded-xl border space-y-3 ${isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'}`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* Search Input */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search symbol, company, sector..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-8 pr-3 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                isDark ? 'bg-slate-950 border-slate-700 text-slate-200 placeholder-slate-500' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            />
          </div>

          {/* Sector Selector */}
          <div>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                isDark ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              {sectors.map((sec) => (
                <option key={sec} value={sec}>
                  Sector: {sec}
                </option>
              ))}
            </select>
          </div>

          {/* IV Regime Filter */}
          <div>
            <select
              value={selectedRegime}
              onChange={(e) => setSelectedRegime(e.target.value as any)}
              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                isDark ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="ALL">All Volatility Regimes</option>
              <option value="BULLISH_EXPANSION">🟢 Bullish Volatility Expansion (Call Sweep)</option>
              <option value="BULLISH_CONTRACTION">🟡 Bullish Contraction (Call Writing Trap)</option>
              <option value="BEARISH_EXPANSION">🔴 Bearish Volatility Expansion (Panic Puts)</option>
              <option value="BEARISH_CONTRACTION">🟠 Bearish Contraction (Put Writing Trap)</option>
            </select>
          </div>

          {/* Verdict Filter */}
          <div>
            <select
              value={selectedVerdict}
              onChange={(e) => setSelectedVerdict(e.target.value as any)}
              className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                isDark ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="ALL">All Signal Verdicts</option>
              <option value="HIGH_CONFIDENCE">⭐ High-Confidence Setups Only</option>
              <option value="CE_BUY">🟢 CE Buy Signals</option>
              <option value="PE_BUY">🔴 PE Buy Signals</option>
              <option value="VEGA_TRAP">⚠️ Vega Trap Triggered (Blocked)</option>
            </select>
          </div>

          {/* Sort Column */}
          <div className="flex items-center gap-1">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-mono border focus:outline-none focus:ring-1 focus:ring-purple-500 ${
                isDark ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="vegaMom">Sort: Vega Momentum %</option>
              <option value="ivMom">Sort: IV Momentum %</option>
              <option value="vegaScore">Sort: Vega Expansion Score</option>
              <option value="greeksScore">Sort: Composite Greeks Score</option>
              <option value="delta">Sort: Absolute Delta |Δ|</option>
              <option value="gamma">Sort: Gamma (Γ)</option>
              <option value="thetaPenalty">Sort: Theta Decay Penalty %</option>
              <option value="iv">Sort: Implied Volatility (IV)</option>
              <option value="priceChg">Sort: Price Change %</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className={`px-2 py-1.5 rounded-lg text-xs font-mono font-bold border ${
                isDark ? 'bg-slate-950 border-slate-700 text-slate-300' : 'bg-slate-100 border-slate-300'
              }`}
            >
              {sortOrder === 'desc' ? '↓' : '↑'}
            </button>
          </div>
        </div>

        {/* Sliders Strip for Greeks Sensitivity Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/60 text-xs font-mono">
          {/* Min Greeks Score Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] opacity-80">
              <span>Min Composite Greeks Score:</span>
              <strong className="text-purple-400">{minGreeksScore}/100</strong>
            </div>
            <input
              type="range"
              min="0"
              max="90"
              step="5"
              value={minGreeksScore}
              onChange={(e) => setMinGreeksScore(Number(e.target.value))}
              className="w-full accent-purple-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Min Vega Expansion Score Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] opacity-80">
              <span>Min Vega Expansion Score (VE):</span>
              <strong className="text-indigo-400">{minVegaScore > 0 ? '+' : ''}{minVegaScore}</strong>
            </div>
            <input
              type="range"
              min="-5"
              max="8"
              step="0.5"
              value={minVegaScore}
              onChange={(e) => setMinVegaScore(Number(e.target.value))}
              className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          {/* Max Theta Penalty Slider */}
          <div className="space-y-1">
            <div className="flex justify-between text-[11px] opacity-80">
              <span>Max Theta Decay Penalty (% of LTP):</span>
              <strong className="text-amber-400">{maxThetaPenalty}% / day</strong>
            </div>
            <input
              type="range"
              min="10"
              max="60"
              step="2"
              value={maxThetaPenalty}
              onChange={(e) => setMaxThetaPenalty(Number(e.target.value))}
              className="w-full accent-amber-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* VIEW 1: 4-QUADRANT VOLATILITY REGIME MATRIX */}
      {activeView === 'matrix' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* QUADRANT 1: TOP RIGHT - BULLISH VOLATILITY EXPANSION */}
            <div
              className={`p-4 rounded-2xl border shadow-lg relative overflow-hidden flex flex-col justify-between ${
                isDark ? 'bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-950 border-emerald-500/40' : 'bg-emerald-50/50 border-emerald-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-emerald-500/30">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-400 animate-ping" />
                    <h3 className="font-mono font-black text-sm text-emerald-300">
                      🟢 BULLISH VOLATILITY EXPANSION (Price ↑ + IV ↑)
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    {regimeQuadrantData.bullishExpansion.length} Stocks
                  </span>
                </div>
                <p className="text-[11px] font-mono opacity-80 mt-1.5 text-emerald-200/90">
                  <strong>Institutional Call Sweep / Volatility Breakout:</strong> Call Delta + Vega expanding simultaneously. Prime high-win-rate CE buyer zone!
                </p>

                {/* Stock Chips inside Quadrant */}
                <div className="mt-3 flex flex-wrap gap-1.5 max-h-52 overflow-y-auto custom-scrollbar p-1">
                  {regimeQuadrantData.bullishExpansion.slice(0, 30).map((stk) => (
                    <button
                      key={stk.symbol}
                      onClick={() => {
                        setSimulatorStock(stk);
                        if (onSelectStockForDeepDive) onSelectStockForDeepDive(stk);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-emerald-900/30 hover:bg-emerald-600 hover:text-white text-emerald-300 border border-emerald-500/30 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <span>{stk.symbol}</span>
                      <span className="text-[10px] opacity-75">+{stk.changePercent}%</span>
                      <span className="text-[10px] px-1 py-0.2 rounded bg-emerald-500/30 font-black">
                        VE +{stk.v9Engine.v3IvVega.vegaExpansionScore}
                      </span>
                    </button>
                  ))}
                  {regimeQuadrantData.bullishExpansion.length === 0 && (
                    <div className="text-xs font-mono opacity-50 p-3">No stocks in this regime matching filters</div>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-emerald-500/20 flex items-center justify-between text-[10px] font-mono text-emerald-300/80">
                <span>Delta Bias: Long Delta (0.45 - 0.65)</span>
                <span>Optimal Strategy: Buy ATM/ITM Calls</span>
              </div>
            </div>

            {/* QUADRANT 2: TOP LEFT - BEARISH VOLATILITY EXPANSION */}
            <div
              className={`p-4 rounded-2xl border shadow-lg relative overflow-hidden flex flex-col justify-between ${
                isDark ? 'bg-gradient-to-br from-rose-950/40 via-slate-900 to-slate-950 border-rose-500/40' : 'bg-rose-50/50 border-rose-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-rose-500/30">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-400 animate-ping" />
                    <h3 className="font-mono font-black text-sm text-rose-300">
                      🔴 BEARISH VOLATILITY EXPANSION (Price ↓ + IV ↑)
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    {regimeQuadrantData.bearishExpansion.length} Stocks
                  </span>
                </div>
                <p className="text-[11px] font-mono opacity-80 mt-1.5 text-rose-200/90">
                  <strong>Panic Put Buying / Institutional Hedging Rush:</strong> Put Delta + Vega surging rapidly. Strongest put buyer acceleration!
                </p>

                {/* Stock Chips inside Quadrant */}
                <div className="mt-3 flex flex-wrap gap-1.5 max-h-52 overflow-y-auto custom-scrollbar p-1">
                  {regimeQuadrantData.bearishExpansion.slice(0, 30).map((stk) => (
                    <button
                      key={stk.symbol}
                      onClick={() => {
                        setSimulatorStock(stk);
                        if (onSelectStockForDeepDive) onSelectStockForDeepDive(stk);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-rose-900/30 hover:bg-rose-600 hover:text-white text-rose-300 border border-rose-500/30 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <span>{stk.symbol}</span>
                      <span className="text-[10px] opacity-75">{stk.changePercent}%</span>
                      <span className="text-[10px] px-1 py-0.2 rounded bg-rose-500/30 font-black">
                        VE +{stk.v9Engine.v3IvVega.vegaExpansionScore}
                      </span>
                    </button>
                  ))}
                  {regimeQuadrantData.bearishExpansion.length === 0 && (
                    <div className="text-xs font-mono opacity-50 p-3">No stocks in this regime matching filters</div>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-rose-500/20 flex items-center justify-between text-[10px] font-mono text-rose-300/80">
                <span>Delta Bias: Short Delta (-0.45 to -0.65)</span>
                <span>Optimal Strategy: Buy ATM/ITM Puts</span>
              </div>
            </div>

            {/* QUADRANT 3: BOTTOM RIGHT - BULLISH VOLATILITY CONTRACTION (VEGA TRAP) */}
            <div
              className={`p-4 rounded-2xl border shadow-lg relative overflow-hidden flex flex-col justify-between ${
                isDark ? 'bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-950 border-amber-500/40' : 'bg-amber-50/50 border-amber-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-amber-500/30">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <h3 className="font-mono font-black text-sm text-amber-300">
                      🟡 BULLISH CONTRACTION / VEGA TRAP (Price ↑ + IV ↓)
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    {regimeQuadrantData.bullishContraction.length} Stocks
                  </span>
                </div>
                <p className="text-[11px] font-mono opacity-80 mt-1.5 text-amber-200/90">
                  <strong>Call Writing Absorption / Slow Grind Up:</strong> Price rises, but IV decays and crushes call options. Naked Call Buyers lose money via Vega burn!
                </p>

                {/* Stock Chips inside Quadrant */}
                <div className="mt-3 flex flex-wrap gap-1.5 max-h-52 overflow-y-auto custom-scrollbar p-1">
                  {regimeQuadrantData.bullishContraction.slice(0, 30).map((stk) => (
                    <button
                      key={stk.symbol}
                      onClick={() => {
                        setSimulatorStock(stk);
                        if (onSelectStockForDeepDive) onSelectStockForDeepDive(stk);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-amber-900/30 hover:bg-amber-600 hover:text-slate-950 text-amber-300 border border-amber-500/30 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <span>{stk.symbol}</span>
                      <span className="text-[10px] opacity-75">+{stk.changePercent}%</span>
                      <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/30 font-black">
                        VE {stk.v9Engine.v3IvVega.vegaExpansionScore}
                      </span>
                    </button>
                  ))}
                  {regimeQuadrantData.bullishContraction.length === 0 && (
                    <div className="text-xs font-mono opacity-50 p-3">No stocks in this regime matching filters</div>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-amber-500/20 flex items-center justify-between text-[10px] font-mono text-amber-300/80">
                <span>V9 Filter: ⚠️ VEGA TRAP TRIGGERED</span>
                <span>Optimal Strategy: Futures / Bull Put Spreads</span>
              </div>
            </div>

            {/* QUADRANT 4: BOTTOM LEFT - BEARISH VOLATILITY CONTRACTION (VEGA TRAP) */}
            <div
              className={`p-4 rounded-2xl border shadow-lg relative overflow-hidden flex flex-col justify-between ${
                isDark ? 'bg-gradient-to-br from-orange-950/40 via-slate-900 to-slate-950 border-orange-500/40' : 'bg-orange-50/50 border-orange-200'
              }`}
            >
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-orange-500/30">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-orange-400" />
                    <h3 className="font-mono font-black text-sm text-orange-300">
                      🟠 BEARISH CONTRACTION / VEGA TRAP (Price ↓ + IV ↓)
                    </h3>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-black bg-orange-500/20 text-orange-300 border border-orange-500/40">
                    {regimeQuadrantData.bearishContraction.length} Stocks
                  </span>
                </div>
                <p className="text-[11px] font-mono opacity-80 mt-1.5 text-orange-200/90">
                  <strong>Put Writing Decay / Slow Drift Down:</strong> Price drifts lower, but lack of panic crushes put IV. Naked Put Buyers suffer IV contraction losses!
                </p>

                {/* Stock Chips inside Quadrant */}
                <div className="mt-3 flex flex-wrap gap-1.5 max-h-52 overflow-y-auto custom-scrollbar p-1">
                  {regimeQuadrantData.bearishContraction.slice(0, 30).map((stk) => (
                    <button
                      key={stk.symbol}
                      onClick={() => {
                        setSimulatorStock(stk);
                        if (onSelectStockForDeepDive) onSelectStockForDeepDive(stk);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-mono font-bold bg-orange-900/30 hover:bg-orange-600 hover:text-slate-950 text-orange-300 border border-orange-500/30 transition-all flex items-center gap-1.5 shadow-sm"
                    >
                      <span>{stk.symbol}</span>
                      <span className="text-[10px] opacity-75">{stk.changePercent}%</span>
                      <span className="text-[10px] px-1 py-0.2 rounded bg-orange-500/30 font-black">
                        VE {stk.v9Engine.v3IvVega.vegaExpansionScore}
                      </span>
                    </button>
                  ))}
                  {regimeQuadrantData.bearishContraction.length === 0 && (
                    <div className="text-xs font-mono opacity-50 p-3">No stocks in this regime matching filters</div>
                  )}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-orange-500/20 flex items-center justify-between text-[10px] font-mono text-orange-300/80">
                <span>V9 Filter: ⚠️ VEGA TRAP TRIGGERED</span>
                <span>Optimal Strategy: Bear Call Spreads / Short Futures</span>
              </div>
            </div>
          </div>

          {/* Sector Greeks Rollup Table */}
          <div className={`p-4 rounded-2xl border ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'}`}>
            <h3 className="font-mono font-black text-sm flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-purple-400" />
              <span>SECTOR VOLATILITY &amp; VEGA SKEW HIERARCHY</span>
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {sectorRollup.slice(0, 12).map((sec) => (
                <button
                  key={sec.sector}
                  onClick={() => setSelectedSector(sec.sector)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    selectedSector === sec.sector
                      ? 'border-purple-500 bg-purple-500/20 ring-1 ring-purple-400'
                      : isDark
                      ? 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <div className="text-xs font-mono font-black truncate">{sec.sector}</div>
                  <div className="flex items-center justify-between text-[11px] font-mono mt-1.5">
                    <span className="opacity-60">Avg IV:</span>
                    <strong className="text-purple-400">{sec.avgIv}%</strong>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className="opacity-60">Δ𝒱 Mom:</span>
                    <strong className={sec.avgVegaMom >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                      {sec.avgVegaMom >= 0 ? '+' : ''}{sec.avgVegaMom}%
                    </strong>
                  </div>
                  <div className="mt-1 pt-1 border-t border-slate-800 text-[10px] font-mono text-indigo-300">
                    {sec.expansionRatioPct}% in Expansion
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: FULL F&O GREEKS QUANTITATIVE TABLE */}
      {activeView === 'table' && (
        <div className={`rounded-2xl border shadow-xl overflow-hidden ${isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left font-mono border-collapse">
              <thead>
                <tr className={`text-[10px] uppercase font-black border-b tracking-wider ${isDark ? 'bg-slate-950 text-slate-400 border-slate-800' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                  <th className="p-3">Stock &amp; Sector</th>
                  <th className="p-3 text-right">Spot Price</th>
                  <th className="p-3 text-center">IV &amp; Skew</th>
                  <th className="p-3 text-center">Delta (Δ)</th>
                  <th className="p-3 text-center">Gamma (Γ)</th>
                  <th className="p-3 text-center">Theta (Θ/day)</th>
                  <th className="p-3 text-center">Vega (𝒱 &amp; Mom)</th>
                  <th className="p-3 text-center">VE Score</th>
                  <th className="p-3 text-center">IV Regime</th>
                  <th className="p-3 text-center">Greeks Score</th>
                  <th className="p-3 text-center">V9 Trade Setup</th>
                  <th className="p-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs">
                {filteredStocks.map((stock) => {
                  const g = stock.v9Engine.v2Greeks;
                  const iv = stock.v9Engine.v3IvVega;
                  const trade = stock.v9Engine.v9LiveAlgo.tradeSetup;
                  const isVegaTrap = stock.v9Engine.v9LiveAlgo.vegaTrapFilterTriggered;
                  const verdict = stock.v9Engine.v9LiveAlgo.verdict;

                  return (
                    <tr
                      key={stock.symbol}
                      className={`hover:bg-slate-800/40 transition-colors ${
                        isVegaTrap ? 'bg-amber-950/10' : ''
                      }`}
                    >
                      {/* Stock Symbol */}
                      <td className="p-3">
                        <div className="font-black text-sm text-slate-100 flex items-center gap-1.5">
                          <span>{stock.symbol}</span>
                          {isVegaTrap && (
                            <span className="px-1 py-0.2 rounded text-[9px] bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30">
                              VEGA TRAP
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-purple-400 truncate max-w-[140px]">
                          {stock.sector} • Lot {stock.lotSize}
                        </div>
                      </td>

                      {/* Spot Price & Change */}
                      <td className="p-3 text-right">
                        <div className="font-bold text-slate-100">
                          ₹{stock.spotPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        <div className={`text-[11px] font-bold ${stock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {stock.changePercent >= 0 ? '+' : ''}{stock.changePercent}%
                        </div>
                      </td>

                      {/* IV & Skew */}
                      <td className="p-3 text-center">
                        <div className="font-bold text-purple-300">{iv.atmIv}%</div>
                        <div className="text-[10px] opacity-70">
                          IVR {iv.ivRank} • Skew {iv.ivSkew > 0 ? '+' : ''}{iv.ivSkew}
                        </div>
                      </td>

                      {/* Delta */}
                      <td className="p-3 text-center">
                        <div className="font-bold text-indigo-300">
                          {g.delta > 0 ? '+' : ''}{g.delta}
                        </div>
                        <div className="text-[9px] opacity-60">
                          {Math.abs(g.delta) >= 0.45 && Math.abs(g.delta) <= 0.65 ? '🎯 Sweetspot' : 'Standard'}
                        </div>
                      </td>

                      {/* Gamma */}
                      <td className="p-3 text-center">
                        <div className="font-bold text-cyan-300">{g.gamma}</div>
                        <div className="text-[9px] opacity-60">Acc {g.gammaRiskLevel}</div>
                      </td>

                      {/* Theta */}
                      <td className="p-3 text-center">
                        <div className="font-bold text-rose-300">₹{g.theta}</div>
                        <div className="text-[10px] text-amber-400 font-bold">
                          {g.thetaPenaltyPct}% / day
                        </div>
                      </td>

                      {/* Vega & Vega Momentum */}
                      <td className="p-3 text-center">
                        <div className="font-bold text-emerald-300">₹{g.vega}</div>
                        <div className={`text-[10px] font-bold ${iv.vegaMomentumPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                          Δ𝒱 {iv.vegaMomentumPct >= 0 ? '+' : ''}{iv.vegaMomentumPct}%
                        </div>
                      </td>

                      {/* VE Score */}
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-black ${
                            iv.vegaExpansionScore >= 1.0
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : iv.vegaExpansionScore <= -1.0
                              ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {iv.vegaExpansionScore >= 0 ? '+' : ''}{iv.vegaExpansionScore}
                        </span>
                      </td>

                      {/* IV Regime */}
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            iv.ivRegime === 'BULLISH_EXPANSION'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : iv.ivRegime === 'BEARISH_EXPANSION'
                              ? 'bg-rose-500/20 text-rose-300'
                              : iv.ivRegime === 'BULLISH_CONTRACTION'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-orange-500/20 text-orange-300'
                          }`}
                        >
                          {iv.ivRegime.replace('_', ' ')}
                        </span>
                      </td>

                      {/* Greeks Score */}
                      <td className="p-3 text-center">
                        <div className="font-black text-sm text-indigo-400">{g.greeksScore}/100</div>
                        <div className="w-16 h-1 bg-slate-800 rounded-full mx-auto overflow-hidden mt-0.5">
                          <div
                            className={`h-full ${
                              g.greeksScore >= 70 ? 'bg-emerald-400' : g.greeksScore >= 50 ? 'bg-indigo-400' : 'bg-rose-400'
                            }`}
                            style={{ width: `${g.greeksScore}%` }}
                          />
                        </div>
                      </td>

                      {/* V9 Trade Setup */}
                      <td className="p-3 text-center">
                        <div className="font-bold text-xs text-slate-200">
                          {trade.contractName}
                        </div>
                        <div className="text-[10px] opacity-70">
                          LTP ₹{trade.ltp} • SL ₹{trade.stopLoss} • T1 ₹{trade.target1}
                        </div>
                      </td>

                      {/* Action Buttons */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => {
                              setSimulatorStock(stock);
                              setActiveView('simulator');
                            }}
                            className="px-2 py-1 rounded bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white text-[10px] font-bold border border-indigo-500/30 transition-all"
                            title="Simulate Greeks"
                          >
                            Simulate
                          </button>

                          {onSelectStockForDeepDive && (
                            <button
                              onClick={() => onSelectStockForDeepDive(stock)}
                              className="px-2 py-1 rounded bg-purple-600/20 hover:bg-purple-600 text-purple-300 hover:text-white text-[10px] font-bold border border-purple-500/30 transition-all"
                              title="Inspect V1->V9 Engine Pipeline"
                            >
                              Inspect
                            </button>
                          )}
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

      {/* VIEW 3: WHAT-IF GREEK SENSITIVITY SIMULATOR */}
      {activeView === 'simulator' && simulatorStock && (
        <div className="space-y-4">
          <div
            className={`p-5 rounded-2xl border shadow-xl ${
              isDark ? 'bg-slate-900/95 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            {/* Simulator Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-purple-600/20 text-purple-300 border border-purple-500/40">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-black font-mono">
                      🔬 WHAT-IF GREEK SENSITIVITY SIMULATOR: {simulatorStock.symbol}
                    </h2>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      {simulatorStock.v9Engine.v9LiveAlgo.tradeSetup.contractName}
                    </span>
                  </div>
                  <p className="text-xs font-mono opacity-70">
                    Live Spot: ₹{simulatorStock.spotPrice} • Base LTP: ₹{simulatorStock.v9Engine.v9LiveAlgo.tradeSetup.ltp} • IV: {simulatorStock.v9Engine.v3IvVega.atmIv}%
                  </p>
                </div>
              </div>

              {/* Stock Switcher inside simulator */}
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono opacity-70">Change Target:</span>
                <select
                  value={simulatorStock.symbol}
                  onChange={(e) => {
                    const match = stocksData.find((s) => s.symbol === e.target.value);
                    if (match) setSimulatorStock(match);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border ${
                    isDark ? 'bg-slate-950 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
                  }`}
                >
                  {stocksData.slice(0, 50).map((s) => (
                    <option key={s.symbol} value={s.symbol}>
                      {s.symbol} (₹{s.spotPrice})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Slider Controls for What-If Scenarios */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 my-5 p-4 rounded-xl bg-slate-950/60 border border-slate-800 text-xs font-mono">
              {/* Spot Move Shift Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold flex items-center gap-1.5">
                    <Crosshair className="w-3.5 h-3.5 text-indigo-400" />
                    Simulated Spot Move (%):
                  </span>
                  <strong className={`font-mono text-sm ${simSpotShiftPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {simSpotShiftPct >= 0 ? '+' : ''}{simSpotShiftPct}% (₹{(simulatorStock.spotPrice * (1 + simSpotShiftPct / 100)).toFixed(2)})
                  </strong>
                </div>
                <input
                  type="range"
                  min="-6"
                  max="6"
                  step="0.5"
                  value={simSpotShiftPct}
                  onChange={(e) => setSimSpotShiftPct(Number(e.target.value))}
                  className="w-full accent-indigo-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] opacity-60">
                  <span>-6% (Crash)</span>
                  <span>0% (Flat)</span>
                  <span>+6% (Rally)</span>
                </div>
              </div>

              {/* IV Shift Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold flex items-center gap-1.5">
                    <Scale className="w-3.5 h-3.5 text-purple-400" />
                    Simulated IV Shift (pts):
                  </span>
                  <strong className={`font-mono text-sm ${simIvShiftPct >= 0 ? 'text-purple-400' : 'text-amber-400'}`}>
                    {simIvShiftPct >= 0 ? '+' : ''}{simIvShiftPct} pts (IV {Math.max(5, simulatorStock.v9Engine.v3IvVega.atmIv + simIvShiftPct).toFixed(1)}%)
                  </strong>
                </div>
                <input
                  type="range"
                  min="-8"
                  max="8"
                  step="0.5"
                  value={simIvShiftPct}
                  onChange={(e) => setSimIvShiftPct(Number(e.target.value))}
                  className="w-full accent-purple-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] opacity-60">
                  <span>-8 pts (IV Crush)</span>
                  <span>0 pts (No shift)</span>
                  <span>+8 pts (IV Spike)</span>
                </div>
              </div>

              {/* Time Decay Slider */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-bold flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-rose-400" />
                    Simulated Time Elapsed:
                  </span>
                  <strong className="text-rose-400 font-mono text-sm">
                    {simDaysDecay} Day(s) Decay (Θ)
                  </strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="3"
                  step="0.5"
                  value={simDaysDecay}
                  onChange={(e) => setSimDaysDecay(Number(e.target.value))}
                  className="w-full accent-rose-500 h-2 bg-slate-800 rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] opacity-60">
                  <span>0 Days (Intraday)</span>
                  <span>1 Day (Overnight)</span>
                  <span>3 Days (Weekend)</span>
                </div>
              </div>
            </div>

            {/* Simulated Mathematical Greek Outcome Display */}
            {simulatedOutcome && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* Expected New Premium */}
                  <div className={`p-4 rounded-xl border ${simulatedOutcome.priceDiff >= 0 ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-200' : 'bg-rose-950/30 border-rose-500/40 text-rose-200'}`}>
                    <span className="text-[10px] uppercase font-bold opacity-70 block">Expected Option Premium</span>
                    <div className="text-2xl font-black font-mono mt-1">
                      ₹{simulatedOutcome.newOptionPrice}
                    </div>
                    <div className="text-xs font-bold font-mono mt-0.5">
                      {simulatedOutcome.priceDiff >= 0 ? '+' : ''}₹{simulatedOutcome.priceDiff} ({simulatedOutcome.pnlPct >= 0 ? '+' : ''}{simulatedOutcome.pnlPct}%)
                    </div>
                  </div>

                  {/* Delta Contribution */}
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                    <span className="text-[10px] uppercase font-bold text-indigo-400 block">Delta (Δ) P&amp;L Impact</span>
                    <div className={`text-xl font-black font-mono mt-1 ${simulatedOutcome.deltaMove >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {simulatedOutcome.deltaMove >= 0 ? '+' : ''}₹{simulatedOutcome.deltaMove}
                    </div>
                    <p className="text-[10px] opacity-60 mt-0.5">
                      Spot move ₹{(simulatorStock.spotPrice * (simSpotShiftPct / 100)).toFixed(2)} × Δ {simulatorStock.v9Engine.v2Greeks.delta}
                    </p>
                  </div>

                  {/* Vega Contribution */}
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                    <span className="text-[10px] uppercase font-bold text-purple-400 block">Vega (𝒱) Volatility Impact</span>
                    <div className={`text-xl font-black font-mono mt-1 ${simulatedOutcome.vegaMove >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {simulatedOutcome.vegaMove >= 0 ? '+' : ''}₹{simulatedOutcome.vegaMove}
                    </div>
                    <p className="text-[10px] opacity-60 mt-0.5">
                      IV shift {simIvShiftPct} pts × 𝒱 ₹{simulatorStock.v9Engine.v2Greeks.vega}
                    </p>
                  </div>

                  {/* Theta Decay Loss */}
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-950/40">
                    <span className="text-[10px] uppercase font-bold text-rose-400 block">Theta (Θ) Decay Loss</span>
                    <div className="text-xl font-black font-mono mt-1 text-rose-400">
                      ₹{simulatedOutcome.thetaMove}
                    </div>
                    <p className="text-[10px] opacity-60 mt-0.5">
                      {simDaysDecay} days × -₹{simulatorStock.v9Engine.v2Greeks.theta}/day
                    </p>
                  </div>
                </div>

                {/* Mathematical Synthesis Note */}
                <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs font-mono flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-purple-400 shrink-0" />
                    <span>
                      Total Estimated Premium = Base LTP (₹{simulatedOutcome.baseLtp}) + Delta Move ({simulatedOutcome.deltaMove >= 0 ? '+' : ''}₹{simulatedOutcome.deltaMove}) + Vega Move ({simulatedOutcome.vegaMove >= 0 ? '+' : ''}₹{simulatedOutcome.vegaMove}) - Theta Decay ({Math.abs(simulatedOutcome.thetaMove)}) = <strong>₹{simulatedOutcome.newOptionPrice}</strong>
                    </span>
                  </div>

                  {onSelectStockForDeepDive && (
                    <button
                      onClick={() => onSelectStockForDeepDive(simulatorStock)}
                      className="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shrink-0 transition-all"
                    >
                      Inspect Full Engine Pipeline →
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
