import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Layers,
  Activity,
  TrendingUp,
  TrendingDown,
  Zap,
  Target,
  BarChart3,
  Search,
  Filter,
  Send,
  Eye,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Award,
  Flame,
  ArrowRight,
  Shield,
  SlidersHorizontal,
  Info,
  Maximize2,
  X,
  Share2,
  Check,
  ChevronDown,
  CheckSquare,
  Square,
  Sliders,
} from 'lucide-react';
import {
  ScannedStock,
  SectorMomentumCluster,
  SignalCorrelationPair,
  SectorCorrelationMatrixData,
  ClusterType,
} from '../types';
import {
  analyzeSignalCorrelationMatrix,
  normalizeSectorName,
} from '../utils/signalCorrelationEngine';

interface SignalCorrelationMatrixViewProps {
  stocks: ScannedStock[];
  onCreateTrade: (trade: {
    symbol: string;
    signal: 'BUY' | 'SELL';
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    target1: number;
    target2: number;
  }) => void;
  onSelectStock: (stock: ScannedStock) => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export type SignalStrengthTier =
  | 'HIGH_CONFIDENCE'
  | 'MEDIUM_CONFIDENCE'
  | 'HIGH_RVOL'
  | 'TREND_FOLLOWING';

export interface SignalStrengthOption {
  id: SignalStrengthTier;
  label: string;
  shortLabel: string;
  description: string;
  badgeColor: string;
}

const SIGNAL_STRENGTH_OPTIONS: SignalStrengthOption[] = [
  {
    id: 'HIGH_CONFIDENCE',
    label: 'High Conviction (AI Score ≥ 75%)',
    shortLabel: 'High Edge (≥75%)',
    description: 'Institutional-grade high probability setups',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  },
  {
    id: 'MEDIUM_CONFIDENCE',
    label: 'Moderate Conviction (AI Score 55% - 74%)',
    shortLabel: 'Moderate (55-74%)',
    description: 'Standard rotational and momentum follow-throughs',
    badgeColor: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
  },
  {
    id: 'HIGH_RVOL',
    label: 'Volume Surge (RVOL ≥ 1.5x)',
    shortLabel: 'RVOL ≥ 1.5x',
    description: 'Heavy institutional buying/selling volume footprint',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  },
  {
    id: 'TREND_FOLLOWING',
    label: 'Trend-Aligned (Above VWAP / Strong Supertrend)',
    shortLabel: 'Trend-Aligned',
    description: 'Intraday price action holding above VWAP & Trend',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
  },
];

export const SignalCorrelationMatrixView: React.FC<SignalCorrelationMatrixViewProps> = ({
  stocks,
  onCreateTrade,
  onSelectStock,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';

  // Sub-tabs navigation
  const [activeTab, setActiveTab] = useState<
    'SECTOR_CLUSTERS' | 'CORRELATION_HEATMAP' | 'SYMPATHY_LEAD_LAG' | 'PAIR_SCANNER'
  >('SECTOR_CLUSTERS');

  // Multi-Select Filters
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]); // empty means ALL sectors
  const [selectedSignalStrengths, setSelectedSignalStrengths] = useState<SignalStrengthTier[]>([]); // empty means ALL tiers
  const [selectedClusterType, setSelectedClusterType] = useState<'ALL' | ClusterType>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [minCorrelation, setMinCorrelation] = useState<number>(0.5);

  // Dropdown open states
  const [isSectorDropdownOpen, setIsSectorDropdownOpen] = useState<boolean>(false);
  const [isStrengthDropdownOpen, setIsStrengthDropdownOpen] = useState<boolean>(false);
  const [sectorSearchInsideDropdown, setSectorSearchInsideDropdown] = useState<string>('');

  const sectorDropdownRef = useRef<HTMLDivElement>(null);
  const strengthDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (sectorDropdownRef.current && !sectorDropdownRef.current.contains(event.target as Node)) {
        setIsSectorDropdownOpen(false);
      }
      if (strengthDropdownRef.current && !strengthDropdownRef.current.contains(event.target as Node)) {
        setIsStrengthDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Modal for Pair Inspection
  const [selectedPair, setSelectedPair] = useState<SignalCorrelationPair | null>(null);

  // All available unique sectors in universe
  const allAvailableSectors = useMemo(() => {
    const sectorSet = new Set<string>();
    stocks.forEach((s) => {
      sectorSet.add(normalizeSectorName(s.sector));
    });
    return Array.from(sectorSet).sort();
  }, [stocks]);

  // Sector stock counts map
  const sectorStockCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    stocks.forEach((s) => {
      const sec = normalizeSectorName(s.sector);
      counts[sec] = (counts[sec] || 0) + 1;
    });
    return counts;
  }, [stocks]);

  // 1. Filter raw stocks by Signal Strength multi-select criteria
  const signalFilteredStocks = useMemo(() => {
    if (selectedSignalStrengths.length === 0) {
      return stocks;
    }

    return stocks.filter((stock) => {
      const aiScore = stock.aiScore || 50;
      const rvol = stock.indicators?.rvol || 1.0;
      const vwap = stock.indicators?.vwap || stock.price;
      const isTrendAligned =
        stock.price >= vwap && (stock.indicators?.rsi || 50) >= 50;

      // Check if stock satisfies ANY of the active selected signal strength criteria (OR relationship across selected tiers)
      return selectedSignalStrengths.some((tier) => {
        if (tier === 'HIGH_CONFIDENCE') return aiScore >= 75;
        if (tier === 'MEDIUM_CONFIDENCE') return aiScore >= 55 && aiScore < 75;
        if (tier === 'HIGH_RVOL') return rvol >= 1.5;
        if (tier === 'TREND_FOLLOWING') return isTrendAligned;
        return true;
      });
    });
  }, [stocks, selectedSignalStrengths]);

  // 2. Compute Signal Correlation Matrix on the signal-filtered universe
  const matrixData: SectorCorrelationMatrixData = useMemo(() => {
    return analyzeSignalCorrelationMatrix(signalFilteredStocks);
  }, [signalFilteredStocks]);

  // 3. Filtered clusters (by Sector Multi-Select, Cluster Type, and Search Query)
  const filteredClusters = useMemo(() => {
    return matrixData.clusters.filter((cluster) => {
      // Sector multi-select check
      if (selectedSectors.length > 0 && !selectedSectors.includes(cluster.sectorName)) {
        return false;
      }
      // Cluster type check
      if (selectedClusterType !== 'ALL' && cluster.clusterType !== selectedClusterType) {
        return false;
      }
      // Search query check
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSector = cluster.sectorName.toLowerCase().includes(q);
        const matchesStocks = cluster.stocks.some(
          (s) => s.symbol.toLowerCase().includes(q) || s.name?.toLowerCase().includes(q)
        );
        if (!matchesSector && !matchesStocks) return false;
      }
      return true;
    });
  }, [matrixData.clusters, selectedSectors, selectedClusterType, searchQuery]);

  // 4. Filtered Heatmap Sectors
  const heatmapSectors = useMemo(() => {
    if (selectedSectors.length === 0) {
      return matrixData.sectors;
    }
    const filtered = matrixData.sectors.filter((sec) => selectedSectors.includes(sec));
    return filtered.length > 0 ? filtered : matrixData.sectors;
  }, [matrixData.sectors, selectedSectors]);

  // 5. Filtered Pairs
  const filteredPairs = useMemo(() => {
    return matrixData.topPairs.filter((pair) => {
      if (Math.abs(pair.correlation) < minCorrelation) return false;
      if (
        selectedSectors.length > 0 &&
        !selectedSectors.includes(pair.sectorA) &&
        !selectedSectors.includes(pair.sectorB)
      ) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          pair.symbolA.toLowerCase().includes(q) ||
          pair.symbolB.toLowerCase().includes(q) ||
          pair.nameA.toLowerCase().includes(q) ||
          pair.nameB.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [matrixData.topPairs, minCorrelation, selectedSectors, searchQuery]);

  // Multi-Select Handlers: Sector
  const toggleSector = (sectorName: string) => {
    setSelectedSectors((prev) =>
      prev.includes(sectorName) ? prev.filter((s) => s !== sectorName) : [...prev, sectorName]
    );
  };

  const handleSelectAllSectors = () => {
    setSelectedSectors([]);
  };

  const handleClearAllSectors = () => {
    setSelectedSectors(['__NONE__']); // will match none until user picks
  };

  // Multi-Select Handlers: Signal Strength
  const toggleSignalStrength = (tier: SignalStrengthTier) => {
    setSelectedSignalStrengths((prev) =>
      prev.includes(tier) ? prev.filter((t) => t !== tier) : [...prev, tier]
    );
  };

  const handleSelectAllStrengths = () => {
    setSelectedSignalStrengths([]);
  };

  const handleClearAllFilters = () => {
    setSelectedSectors([]);
    setSelectedSignalStrengths([]);
    setSelectedClusterType('ALL');
    setSearchQuery('');
    setMinCorrelation(0.5);
  };

  const hasActiveFilters =
    selectedSectors.length > 0 ||
    selectedSignalStrengths.length > 0 ||
    selectedClusterType !== 'ALL' ||
    searchQuery.trim() !== '' ||
    minCorrelation !== 0.5;

  // Quick Trade Handler for Leader or Sympathy stock
  const handleQuickExecute = (
    stockData: { symbol: string; signal: 'BUY' | 'SELL'; price: number },
    targetMultiplier: number = 1.03,
    stopLossMultiplier: number = 0.985
  ) => {
    const isBuy = stockData.signal === 'BUY';
    const entry = stockData.price;
    const stopLoss = isBuy
      ? Number((entry * stopLossMultiplier).toFixed(2))
      : Number((entry * (2 - stopLossMultiplier)).toFixed(2));
    const target1 = isBuy
      ? Number((entry * targetMultiplier).toFixed(2))
      : Number((entry * (2 - targetMultiplier)).toFixed(2));
    const target2 = isBuy
      ? Number((entry * (targetMultiplier + 0.02)).toFixed(2))
      : Number((entry * (2 - (targetMultiplier + 0.02))).toFixed(2));

    const riskPerShare = Math.max(1, Math.abs(entry - stopLoss));
    const quantity = Math.max(1, Math.floor(10000 / riskPerShare));

    onCreateTrade({
      symbol: stockData.symbol,
      signal: stockData.signal,
      entryPrice: entry,
      quantity,
      stopLoss,
      target1,
      target2,
    });
  };

  // Execute Full Sector Basket
  const handleExecuteClusterBasket = (cluster: SectorMomentumCluster) => {
    handleQuickExecute(cluster.leaderStock, 1.035, 0.985);
    handleQuickExecute(cluster.sympathyStock, 1.045, 0.98);
  };

  // Heatmap Color Helper
  const getCorrelationColor = (val: number) => {
    if (val >= 0.8) return 'bg-emerald-500 text-slate-950 font-black';
    if (val >= 0.6) return 'bg-emerald-500/80 text-white font-bold';
    if (val >= 0.4) return 'bg-teal-600/70 text-white font-semibold';
    if (val >= 0.2) return 'bg-teal-800/50 text-slate-200';
    if (val >= -0.2) return 'bg-slate-800/60 text-slate-400';
    if (val >= -0.5) return 'bg-purple-900/60 text-purple-200';
    return 'bg-rose-600 text-white font-bold';
  };

  return (
    <div className="space-y-6">
      {/* 1. HERO HEADER & QUANT SUMMARY BANNER */}
      <div
        className={`p-5 sm:p-6 rounded-2xl border transition-all ${
          isDark
            ? 'bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border-indigo-500/30 shadow-xl'
            : 'bg-gradient-to-r from-indigo-50 via-white to-indigo-50 border-indigo-200 shadow-md'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div className="flex items-start sm:items-center gap-4">
            <div className="relative p-3.5 rounded-2xl bg-gradient-to-br from-indigo-500 via-cyan-600 to-emerald-500 text-white shadow-lg shadow-indigo-500/25 flex-shrink-0">
              <Layers className="w-8 h-8" />
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-400 border-2 border-slate-900 rounded-full animate-pulse" />
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                  <span>SIGNAL CORRELATION MATRIX</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    MULTI-SEGMENT CLUSTERS
                  </span>
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1 max-w-2xl">
                Real-time co-occurrence and cross-asset signal synchronicity engine across Nifty 200. Filter by specific sector baskets and high-confidence signal strengths to pinpoint institutional accumulation waves and sympathy catch-up trades.
              </p>
            </div>
          </div>

          {/* Top Metric Highlights */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-center">
              <div className="text-[10px] text-slate-500">APEX CLUSTER</div>
              <div className="text-xs sm:text-sm font-bold text-emerald-400 truncate max-w-[140px]">
                {matrixData.apexBullishCluster}
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-center">
              <div className="text-[10px] text-slate-500">ACTIVE UNIVERSE</div>
              <div className="text-xs sm:text-sm font-bold text-cyan-300">
                {signalFilteredStocks.length} / {stocks.length} Stocks
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-center">
              <div className="text-[10px] text-slate-500">RALLY BREADTH</div>
              <div className="text-xs sm:text-sm font-bold text-indigo-300">
                {matrixData.broadBasedRallyScore}/100
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. ADVANCED MULTI-SELECT FILTER TOOLBAR */}
      <div
        className={`p-4 rounded-2xl border flex flex-col gap-3.5 transition-all ${
          isDark ? 'bg-slate-900/95 border-slate-800 shadow-md' : 'bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap w-full lg:w-auto">
            {/* 1. SECTOR MULTI-SELECT DROPDOWN */}
            <div className="relative" ref={sectorDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsSectorDropdownOpen(!isSectorDropdownOpen);
                  setIsStrengthDropdownOpen(false);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 border transition-all ${
                  selectedSectors.length > 0 && !selectedSectors.includes('__NONE__')
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                    : isDark
                    ? 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-indigo-400" />
                <span>
                  Sectors (
                  {selectedSectors.length === 0
                    ? 'All'
                    : selectedSectors.includes('__NONE__')
                    ? '0'
                    : `${selectedSectors.length}/${allAvailableSectors.length}`}
                  )
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 opacity-70 transition-transform ${
                    isSectorDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Sector Dropdown Menu */}
              {isSectorDropdownOpen && (
                <div
                  className={`absolute left-0 mt-2 w-72 sm:w-80 rounded-2xl border shadow-2xl z-50 p-3 font-mono text-xs ${
                    isDark ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                    <span className="font-bold text-slate-100 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Select Target Sectors</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleSelectAllSectors}
                        className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-[10px] hover:bg-indigo-500/30"
                      >
                        All
                      </button>
                      <button
                        onClick={handleClearAllSectors}
                        className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] hover:bg-slate-700"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  {/* Search inside sector dropdown */}
                  <div className="relative mb-2">
                    <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      placeholder="Search sectors..."
                      value={sectorSearchInsideDropdown}
                      onChange={(e) => setSectorSearchInsideDropdown(e.target.value)}
                      className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px] focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* Sectors Checkbox List */}
                  <div className="max-h-56 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                    {allAvailableSectors
                      .filter((sec) =>
                        sec.toLowerCase().includes(sectorSearchInsideDropdown.toLowerCase())
                      )
                      .map((sec) => {
                        const isSelected =
                          selectedSectors.length === 0 || selectedSectors.includes(sec);
                        return (
                          <div
                            key={sec}
                            onClick={() => toggleSector(sec)}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                              isSelected
                                ? isDark
                                  ? 'bg-indigo-950/40 text-indigo-300 font-bold'
                                  : 'bg-indigo-50 text-indigo-700 font-bold'
                                : isDark
                                ? 'hover:bg-slate-800 text-slate-400'
                                : 'hover:bg-slate-100 text-slate-600'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate pr-2">
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-indigo-400 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-600 shrink-0" />
                              )}
                              <span className="truncate">{sec}</span>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 shrink-0">
                              {sectorStockCounts[sec] || 0}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>

            {/* 2. SIGNAL STRENGTH MULTI-SELECT DROPDOWN */}
            <div className="relative" ref={strengthDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  setIsStrengthDropdownOpen(!isStrengthDropdownOpen);
                  setIsSectorDropdownOpen(false);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 border transition-all ${
                  selectedSignalStrengths.length > 0
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30'
                    : isDark
                    ? 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  Signal Strength (
                  {selectedSignalStrengths.length === 0
                    ? 'All Tiers'
                    : `${selectedSignalStrengths.length} selected`}
                  )
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 opacity-70 transition-transform ${
                    isStrengthDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {/* Signal Strength Dropdown Menu */}
              {isStrengthDropdownOpen && (
                <div
                  className={`absolute left-0 mt-2 w-80 sm:w-96 rounded-2xl border shadow-2xl z-50 p-3 font-mono text-xs ${
                    isDark ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800 mb-2">
                    <span className="font-bold text-slate-100 flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Select Signal Confidence Tiers</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={handleSelectAllStrengths}
                        className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] hover:bg-emerald-500/30"
                      >
                        All
                      </button>
                      <button
                        onClick={() => setSelectedSignalStrengths([])}
                        className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] hover:bg-slate-700"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    {SIGNAL_STRENGTH_OPTIONS.map((opt) => {
                      const isSelected =
                        selectedSignalStrengths.length === 0 ||
                        selectedSignalStrengths.includes(opt.id);
                      return (
                        <div
                          key={opt.id}
                          onClick={() => toggleSignalStrength(opt.id)}
                          className={`p-2.5 rounded-xl border cursor-pointer transition-all ${
                            isSelected
                              ? isDark
                                ? 'bg-slate-950 border-emerald-500/40 text-slate-100'
                                : 'bg-emerald-50/70 border-emerald-300 text-slate-900'
                              : isDark
                              ? 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-slate-600 shrink-0" />
                              )}
                              <span className="font-bold">{opt.label}</span>
                            </div>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-bold border ${opt.badgeColor}`}
                            >
                              {opt.shortLabel}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 pl-6 mt-1">
                            {opt.description}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Correlation Threshold Selector */}
            <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono">
              <span className="text-slate-500 px-2 text-[10px]">CORR |ρ|:</span>
              {[0.5, 0.65, 0.8].map((th) => (
                <button
                  key={th}
                  onClick={() => setMinCorrelation(th)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-all ${
                    minCorrelation === th
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  &ge; {th}
                </button>
              ))}
            </div>
          </div>

          {/* Search and Reset All Filters */}
          <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
            <div className="relative flex-1 lg:flex-none">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filter symbol or sector..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-full sm:w-52"
              />
            </div>

            {hasActiveFilters && (
              <button
                onClick={handleClearAllFilters}
                className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-mono font-bold flex items-center gap-1.5 transition-all shrink-0"
                title="Reset all multi-select and keyword filters"
              >
                <RotateCcw className="w-3 h-3" />
                <span className="hidden sm:inline">Reset Filters</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Filters Badges Strip */}
        {hasActiveFilters && (
          <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-800/60 text-[11px] font-mono">
            <span className="text-slate-500 text-[10px] uppercase font-bold flex items-center gap-1 mr-1">
              <Filter className="w-3 h-3 text-indigo-400" />
              Active Filters:
            </span>

            {/* Selected Sectors Chips */}
            {selectedSectors.length > 0 && !selectedSectors.includes('__NONE__') && (
              selectedSectors.map((sec) => (
                <span
                  key={sec}
                  className="px-2 py-0.5 rounded-lg bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1"
                >
                  <span>Sector: {sec}</span>
                  <button
                    onClick={() => toggleSector(sec)}
                    className="hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))
            )}

            {/* Selected Signal Strengths Chips */}
            {selectedSignalStrengths.map((tier) => {
              const opt = SIGNAL_STRENGTH_OPTIONS.find((o) => o.id === tier);
              return (
                <span
                  key={tier}
                  className="px-2 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1"
                >
                  <Zap className="w-2.5 h-2.5 text-emerald-400" />
                  <span>{opt?.shortLabel || tier}</span>
                  <button
                    onClick={() => toggleSignalStrength(tier)}
                    className="hover:text-white"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              );
            })}

            {/* Cluster Type Badge */}
            {selectedClusterType !== 'ALL' && (
              <span className="px-2 py-0.5 rounded-lg bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1">
                <span>Cluster: {selectedClusterType.replace(/_/g, ' ')}</span>
                <button
                  onClick={() => setSelectedClusterType('ALL')}
                  className="hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}

            {/* Search Query Badge */}
            {searchQuery && (
              <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                <span>Search: "{searchQuery}"</span>
                <button
                  onClick={() => setSearchQuery('')}
                  className="hover:text-white"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* 3. KPI METRICS RIBBON */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>FILTERED CLUSTERS</span>
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-lg sm:text-xl font-mono font-black text-slate-100">
            {filteredClusters.length}
          </div>
          <div className="text-[10px] text-emerald-400 font-mono mt-1">
            {filteredClusters.filter((c) => c.clusterType === 'BULLISH_SURGE').length} Bullish Surges
          </div>
        </div>

        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>BUY CO-OCCURRENCE</span>
            <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-lg sm:text-xl font-mono font-black text-emerald-400">
            {matrixData.marketWideCoOccurrenceIndex}%
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">Nifty 200 Advancing</div>
        </div>

        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>CORRELATED PAIRS</span>
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-lg sm:text-xl font-mono font-black text-cyan-300">
            {filteredPairs.length}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">|ρ| &ge; {minCorrelation} Sync</div>
        </div>

        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>APEX BULL CLUSTER</span>
            <Flame className="w-3.5 h-3.5 text-orange-400" />
          </div>
          <div className="text-xs sm:text-sm font-mono font-bold text-orange-300 truncate">
            {matrixData.apexBullishCluster}
          </div>
          <div className="text-[10px] text-emerald-400 font-mono mt-1">Leading Inflow Today</div>
        </div>

        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>RALLY SYNC SCORE</span>
            <Award className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-lg sm:text-xl font-mono font-black text-amber-300">
            {matrixData.broadBasedRallyScore}%
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">
            {matrixData.broadBasedRallyScore >= 70 ? 'Broad Expansion' : 'Selective Dispersion'}
          </div>
        </div>

        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono mb-1">
            <span>INTRA-SECTOR CORR</span>
            <BarChart3 className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-lg sm:text-xl font-mono font-black text-purple-300">
            +0.72
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">Average Intra-Sector ρ</div>
        </div>
      </div>

      {/* 4. NAVIGATION TABS */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('SECTOR_CLUSTERS')}
            className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 ${
              activeTab === 'SECTOR_CLUSTERS'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>SECTOR MOMENTUM CLUSTERS ({filteredClusters.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('CORRELATION_HEATMAP')}
            className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 ${
              activeTab === 'CORRELATION_HEATMAP'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span>CROSS-SECTOR HEATMAP MATRIX</span>
          </button>

          <button
            onClick={() => setActiveTab('SYMPATHY_LEAD_LAG')}
            className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 ${
              activeTab === 'SYMPATHY_LEAD_LAG'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800'
            }`}
          >
            <Target className="w-4 h-4" />
            <span>SYMPATHY BREAKOUT RADAR</span>
          </button>

          <button
            onClick={() => setActiveTab('PAIR_SCANNER')}
            className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold uppercase transition-all flex items-center gap-2 ${
              activeTab === 'PAIR_SCANNER'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 bg-slate-900/60 border border-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>CORRELATED PAIRS ({filteredPairs.length})</span>
          </button>
        </div>

        {/* Cluster Type Selector (Quick pill toggles) */}
        {activeTab === 'SECTOR_CLUSTERS' && (
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono">
            <button
              onClick={() => setSelectedClusterType('ALL')}
              className={`px-2 py-1 rounded font-bold ${
                selectedClusterType === 'ALL' ? 'bg-indigo-600 text-white' : 'text-slate-400'
              }`}
            >
              ALL
            </button>
            <button
              onClick={() => setSelectedClusterType('BULLISH_SURGE')}
              className={`px-2 py-1 rounded font-bold ${
                selectedClusterType === 'BULLISH_SURGE' ? 'bg-emerald-600 text-white' : 'text-slate-400'
              }`}
            >
              BULL SURGE
            </button>
            <button
              onClick={() => setSelectedClusterType('ROTATION_INFLOW')}
              className={`px-2 py-1 rounded font-bold ${
                selectedClusterType === 'ROTATION_INFLOW' ? 'bg-teal-600 text-white' : 'text-slate-400'
              }`}
            >
              ROTATION
            </button>
            <button
              onClick={() => setSelectedClusterType('BEARISH_LIQUIDATION')}
              className={`px-2 py-1 rounded font-bold ${
                selectedClusterType === 'BEARISH_LIQUIDATION' ? 'bg-rose-600 text-white' : 'text-slate-400'
              }`}
            >
              BEAR
            </button>
          </div>
        )}
      </div>

      {/* 5. MAIN VIEW CONTENT */}

      {/* VIEW 1: SECTOR MOMENTUM CLUSTERS */}
      {activeTab === 'SECTOR_CLUSTERS' && (
        <div className="space-y-4">
          {filteredClusters.length === 0 ? (
            <div
              className={`p-12 text-center rounded-2xl border ${
                isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <Layers className="w-12 h-12 text-slate-600 mx-auto mb-3 animate-pulse" />
              <h3 className="text-base font-mono font-bold text-slate-300">
                No Sector Clusters Matching Active Multi-Select Filters
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Try selecting more sectors or expanding the signal confidence tiers.
              </p>
              <button
                onClick={handleClearAllFilters}
                className="mt-4 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-mono font-bold"
              >
                Reset All Filters
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {filteredClusters.map((cluster) => {
                return (
                  <div
                    key={cluster.id}
                    className={`p-5 rounded-2xl border transition-all hover:scale-[1.005] ${
                      isDark
                        ? 'bg-slate-900/95 border-slate-800 hover:border-indigo-500/40 shadow-lg'
                        : 'bg-white border-slate-200 shadow-sm'
                    }`}
                  >
                    {/* Top Row: Sector Name, Intensity & Cluster Type */}
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-base sm:text-lg font-mono font-black text-slate-100">
                            {cluster.sectorName}
                          </h3>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-black uppercase ${
                              cluster.clusterType === 'BULLISH_SURGE'
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : cluster.clusterType === 'ROTATION_INFLOW'
                                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                                : cluster.clusterType === 'BEARISH_LIQUIDATION'
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {cluster.clusterType.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 font-mono mt-0.5">
                          {cluster.totalStocks} Stocks in Sector • Avg RVOL: {cluster.avgRvol}x • Avg Return: {cluster.avgChangePct > 0 ? '+' : ''}{cluster.avgChangePct}%
                        </div>
                      </div>

                      {/* Cluster Intensity Gauge */}
                      <div className="text-right font-mono">
                        <div
                          className={`text-lg font-black ${
                            cluster.clusterIntensity >= 75
                              ? 'text-emerald-400'
                              : cluster.clusterIntensity >= 50
                              ? 'text-cyan-400'
                              : 'text-amber-400'
                          }`}
                        >
                          {cluster.clusterIntensity}
                          <span className="text-xs text-slate-500">/100</span>
                        </div>
                        <div className="text-[10px] text-slate-500 uppercase">CLUSTER INTENSITY</div>
                      </div>
                    </div>

                    {/* Signal Co-Occurrence Breadth Progress Bar */}
                    <div className="mt-3.5 space-y-1 font-mono">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">Signal Synchronicity (Co-Occurrence):</span>
                        <span className="font-bold text-slate-200">{cluster.signalCoOccurrenceRate}%</span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden flex">
                        <div
                          style={{ width: `${(cluster.buySignalsCount / cluster.totalStocks) * 100}%` }}
                          className="bg-emerald-500 h-full"
                          title={`BUY Signals: ${cluster.buySignalsCount}`}
                        />
                        <div
                          style={{ width: `${(cluster.neutralCount / cluster.totalStocks) * 100}%` }}
                          className="bg-slate-700 h-full"
                          title={`Neutral: ${cluster.neutralCount}`}
                        />
                        <div
                          style={{ width: `${(cluster.sellSignalsCount / cluster.totalStocks) * 100}%` }}
                          className="bg-rose-500 h-full"
                          title={`SELL Signals: ${cluster.sellSignalsCount}`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                        <span className="text-emerald-400">BUY: {cluster.buySignalsCount}</span>
                        <span>Neutral: {cluster.neutralCount}</span>
                        <span className="text-rose-400">SELL: {cluster.sellSignalsCount}</span>
                      </div>
                    </div>

                    {/* Leader vs Lagging Sympathy Stock Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                      {/* 1. SECTOR LEADER (APEX BREAKOUT) */}
                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono">
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                          <span className="flex items-center gap-1 text-emerald-400 font-bold">
                            <Flame className="w-3.5 h-3.5" />
                            <span>SECTOR LEADER</span>
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                            {cluster.leaderStock.aiScore}% Edge
                          </span>
                        </div>

                        <div className="flex items-center justify-between mt-1.5">
                          <div>
                            <div className="text-sm font-black text-slate-100">
                              {cluster.leaderStock.symbol}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              ₹{cluster.leaderStock.price} • RVOL {cluster.leaderStock.rvol}x
                            </div>
                          </div>
                          <div className="text-right">
                            <div
                              className={`text-sm font-black ${
                                cluster.leaderStock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {cluster.leaderStock.changePercent >= 0 ? '+' : ''}
                              {cluster.leaderStock.changePercent}%
                            </div>
                            <div className="text-[10px] text-slate-500">Breakout Apex</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => handleQuickExecute(cluster.leaderStock)}
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1 transition-all"
                          >
                            <Send className="w-3 h-3" />
                            <span>Trade Leader</span>
                          </button>
                          <button
                            onClick={() => {
                              const st = stocks.find((s) => s.symbol === cluster.leaderStock.symbol);
                              if (st) onSelectStock(st);
                            }}
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300"
                            title="Inspect Chart"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* 2. LAGGING SYMPATHY (CATCH-UP PLAY) */}
                      <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono">
                        <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                          <span className="flex items-center gap-1 text-cyan-400 font-bold">
                            <Target className="w-3.5 h-3.5" />
                            <span>SYMPATHY PLAY</span>
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-bold">
                            +{cluster.sympathyStock.potentialCatchUpPct}% Catch-Up
                          </span>
                        </div>

                        <div className="flex items-center justify-between mt-1.5">
                          <div>
                            <div className="text-sm font-black text-slate-100">
                              {cluster.sympathyStock.symbol}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              ₹{cluster.sympathyStock.price} • RVOL {cluster.sympathyStock.rvol}x
                            </div>
                          </div>
                          <div className="text-right">
                            <div
                              className={`text-sm font-black ${
                                cluster.sympathyStock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                              }`}
                            >
                              {cluster.sympathyStock.changePercent >= 0 ? '+' : ''}
                              {cluster.sympathyStock.changePercent}%
                            </div>
                            <div className="text-[10px] text-cyan-400">Imminent Follow</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => handleQuickExecute(cluster.sympathyStock, 1.045, 0.98)}
                            className="flex-1 py-1.5 px-2.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-1 transition-all"
                          >
                            <Send className="w-3 h-3" />
                            <span>Trade Sympathy</span>
                          </button>
                          <button
                            onClick={() => {
                              const st = stocks.find((s) => s.symbol === cluster.sympathyStock.symbol);
                              if (st) onSelectStock(st);
                            }}
                            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300"
                            title="Inspect Chart"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* AI Cluster Insight */}
                    <div className="mt-3.5 p-3 rounded-xl bg-indigo-950/40 border border-indigo-500/20 text-xs font-mono text-slate-300 leading-relaxed flex items-start gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold text-indigo-300 uppercase">Quant Cluster Verdict: </span>
                        <span>{cluster.aiClusterInsight}</span>
                      </div>
                    </div>

                    {/* Component Stocks Chips & Execute Basket CTA */}
                    <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-slate-800/80">
                      <div className="flex items-center gap-1.5 flex-wrap overflow-hidden max-h-8">
                        {cluster.stocks.slice(0, 5).map((stk) => (
                          <button
                            key={stk.symbol}
                            onClick={() => onSelectStock(stk)}
                            className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[10px] font-mono text-slate-300 hover:border-indigo-500 transition-all"
                          >
                            {stk.symbol} ({(stk.changePercent || 0) > 0 ? '+' : ''}
                            {stk.changePercent?.toFixed(1)}%)
                          </button>
                        ))}
                        {cluster.stocks.length > 5 && (
                          <span className="text-[10px] font-mono text-slate-500">
                            +{cluster.stocks.length - 5} more
                          </span>
                        )}
                      </div>

                      <button
                        onClick={() => handleExecuteClusterBasket(cluster)}
                        className="py-1.5 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-mono font-bold text-xs uppercase flex items-center gap-1.5 shadow-md shadow-indigo-600/20 shrink-0 transition-all active:scale-95"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Execute Basket</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW 2: CROSS-SECTOR CORRELATION HEATMAP MATRIX */}
      {activeTab === 'CORRELATION_HEATMAP' && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-2xl border ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-base font-mono font-black text-slate-100 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-400" />
                  <span>Inter-Sector Momentum Correlation Matrix (Pearson ρ)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Quantifies cross-sector signal synchronization. Values close to +1.0 indicate sectors moving in locked tandem; values &le; -0.3 indicate flight-to-safety or rotational capital divergence.
                </p>
              </div>

              {/* Heatmap Legend */}
              <div className="flex items-center gap-1.5 text-[10px] font-mono">
                <span className="text-slate-500">LEGEND:</span>
                <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white font-bold">&lt; -0.3 (Divergence)</span>
                <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">0.0 (Uncorrelated)</span>
                <span className="px-1.5 py-0.5 rounded bg-teal-600 text-white">+0.4</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 font-black">+0.8+ (Strong Sync)</span>
              </div>
            </div>
          </div>

          {/* Matrix Grid Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/90 p-4 shadow-xl">
            <table className="w-full border-collapse font-mono text-xs">
              <thead>
                <tr>
                  <th className="p-2.5 text-left text-slate-400 border-b border-slate-800 bg-slate-900/80 sticky left-0 z-10">
                    SECTORS
                  </th>
                  {heatmapSectors.map((sec) => (
                    <th
                      key={sec}
                      className="p-2.5 text-center text-slate-300 border-b border-slate-800 min-w-[90px] max-w-[120px] truncate"
                      title={sec}
                    >
                      {sec.split(' ')[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {heatmapSectors.map((secA) => (
                  <tr key={secA} className="hover:bg-slate-900/40 transition-colors">
                    <td className="p-2.5 font-bold text-slate-200 border-b border-slate-800/60 bg-slate-900/80 sticky left-0 z-10 whitespace-nowrap">
                      {secA}
                    </td>
                    {heatmapSectors.map((secB) => {
                      const val = matrixData.matrix[secA]?.[secB] ?? (secA === secB ? 1.0 : 0.5);
                      return (
                        <td
                          key={secB}
                          className="p-2 text-center border-b border-slate-800/40"
                        >
                          <div
                            className={`p-2 rounded-lg text-center transition-transform hover:scale-110 cursor-pointer ${getCorrelationColor(
                              val
                            )}`}
                            title={`${secA} vs ${secB}: Correlation ρ = ${val.toFixed(2)}`}
                          >
                            {val.toFixed(2)}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* VIEW 3: SYMPATHY BREAKOUT RADAR */}
      {activeTab === 'SYMPATHY_LEAD_LAG' && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-2xl border ${
              isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-cyan-400" />
              <h2 className="text-base font-mono font-black text-slate-100">
                Live Lead-Lag Sympathy Play Radar
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Identifies apex sector leaders that have already broken out, matched with highly correlated sector peers that have not yet expanded. These sympathy plays offer tight stop-losses with high risk-to-reward catch-up expansion.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredClusters
              .filter((c) => c.leaderStock.symbol !== c.sympathyStock.symbol)
              .map((c) => (
                <div
                  key={c.id}
                  className={`p-5 rounded-2xl border font-mono transition-all hover:scale-[1.005] ${
                    isDark ? 'bg-slate-900/95 border-slate-800' : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-black text-slate-100">{c.sectorName}</span>
                    <span className="text-xs font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/30">
                      +{c.sympathyStock.potentialCatchUpPct}% Spread Runway
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-950 border border-slate-800">
                    {/* Leader */}
                    <div className="flex-1 text-center">
                      <div className="text-[10px] text-emerald-400 font-bold">1. BREAKOUT LEADER</div>
                      <div className="text-base font-black text-slate-100 mt-1">{c.leaderStock.symbol}</div>
                      <div className="text-xs font-bold text-emerald-400">
                        {c.leaderStock.changePercent > 0 ? '+' : ''}{c.leaderStock.changePercent}%
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">₹{c.leaderStock.price}</div>
                    </div>

                    <ArrowRight className="w-5 h-5 text-indigo-400 shrink-0" />

                    {/* Sympathy */}
                    <div className="flex-1 text-center">
                      <div className="text-[10px] text-cyan-400 font-bold">2. SYMPATHY RUNNER</div>
                      <div className="text-base font-black text-slate-100 mt-1">{c.sympathyStock.symbol}</div>
                      <div className="text-xs font-bold text-cyan-300">
                        {c.sympathyStock.changePercent > 0 ? '+' : ''}{c.sympathyStock.changePercent}%
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">₹{c.sympathyStock.price}</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      onClick={() => handleQuickExecute(c.sympathyStock, 1.045, 0.98)}
                      className="py-2 px-3 rounded-xl bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-md shadow-cyan-600/20"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Execute Sympathy</span>
                    </button>
                    <button
                      onClick={() => {
                        const st = stocks.find((s) => s.symbol === c.sympathyStock.symbol);
                        if (st) onSelectStock(st);
                      }}
                      className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Inspect Chart</span>
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* VIEW 4: CORRELATED PAIRS SCANNER */}
      {activeTab === 'PAIR_SCANNER' && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950/90 shadow-xl">
            <table className="w-full border-collapse font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400">
                  <th className="p-3 text-left">PAIR ASSETS</th>
                  <th className="p-3 text-left">SECTOR CLASSIFICATION</th>
                  <th className="p-3 text-center">CORRELATION (ρ)</th>
                  <th className="p-3 text-center">RELATIONSHIP</th>
                  <th className="p-3 text-center">SPREAD %</th>
                  <th className="p-3 text-center">LEAD vs LAG</th>
                  <th className="p-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredPairs.map((pair) => (
                  <tr key={pair.id} className="hover:bg-slate-900/50 transition-colors">
                    <td className="p-3 font-bold text-slate-100">
                      <div className="flex items-center gap-2">
                        <span className="text-emerald-400">{pair.symbolA}</span>
                        <span className="text-slate-600">⇄</span>
                        <span className="text-cyan-400">{pair.symbolB}</span>
                      </div>
                      <div className="text-[10px] text-slate-500 font-normal">
                        {pair.changePctA > 0 ? '+' : ''}{pair.changePctA}% vs {pair.changePctB > 0 ? '+' : ''}{pair.changePctB}%
                      </div>
                    </td>

                    <td className="p-3 text-slate-400">
                      <div>{pair.sectorA}</div>
                      {pair.isSameSector ? (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                          INTRA-SECTOR
                        </span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                          CROSS-SECTOR
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-1 rounded text-xs font-black ${
                          pair.correlation >= 0.75
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : pair.correlation <= -0.5
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-indigo-500/20 text-indigo-300'
                        }`}
                      >
                        {pair.correlation > 0 ? '+' : ''}
                        {pair.correlation.toFixed(2)}
                      </span>
                    </td>

                    <td className="p-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          pair.relationship === 'STRONG_MOMENTUM_SYNC'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : pair.relationship === 'INVERSE_HEDGE'
                            ? 'bg-purple-500/20 text-purple-300'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {pair.relationship.replace(/_/g, ' ')}
                      </span>
                    </td>

                    <td className="p-3 text-center font-bold text-slate-200">
                      {pair.spreadPct}%
                    </td>

                    <td className="p-3 text-center">
                      <span className="text-emerald-400 font-bold">{pair.leadStock}</span>
                      <span className="text-slate-500 mx-1">&rarr;</span>
                      <span className="text-cyan-400">{pair.lagStock}</span>
                    </td>

                    <td className="p-3 text-right">
                      <button
                        onClick={() => setSelectedPair(pair)}
                        className="py-1 px-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all"
                      >
                        Inspect Spread
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. PAIR SPREAD & MOMENTUM INSPECTION MODAL */}
      {selectedPair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div
            className={`w-full max-w-2xl p-6 rounded-2xl border font-mono shadow-2xl transition-all ${
              isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                <h3 className="text-lg font-bold text-slate-100">
                  Pair Correlation Inspector: {selectedPair.symbolA} ⇄ {selectedPair.symbolB}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPair(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4 text-center">
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-xs text-slate-500">CORRELATION COEFFICIENT</div>
                <div className="text-xl font-black text-emerald-400 mt-1">
                  {selectedPair.correlation > 0 ? '+' : ''}
                  {selectedPair.correlation.toFixed(2)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  {selectedPair.coOccurrenceScore}% Co-occurrence Intensity
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div className="text-xs text-slate-500">CURRENT MOMENTUM SPREAD</div>
                <div className="text-xl font-black text-cyan-300 mt-1">
                  {selectedPair.spreadPct}%
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5">
                  Lead: {selectedPair.leadStock} • Lag: {selectedPair.lagStock}
                </div>
              </div>
            </div>

            <div className="mt-4 p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 leading-relaxed">
              <div className="font-bold text-indigo-300 mb-1">PAIR STATISTICAL BREAKDOWN:</div>
              <p>
                {selectedPair.symbolA} ({selectedPair.sectorA}) and {selectedPair.symbolB} ({selectedPair.sectorB}) demonstrate a correlation coefficient of ρ = {selectedPair.correlation.toFixed(2)}. With a divergence spread of {selectedPair.spreadPct}%, {selectedPair.lagStock} presents a high-probability mean-reversion catch-up expansion if {selectedPair.leadStock} sustains intraday breakout levels.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-800">
              <button
                onClick={() => setSelectedPair(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
              >
                Close
              </button>
              <button
                onClick={() => {
                  const stockLag = stocks.find((s) => s.symbol === selectedPair.lagStock);
                  if (stockLag) {
                    handleQuickExecute({
                      symbol: stockLag.symbol,
                      signal: (stockLag.changePercent || 0) >= 0 ? 'BUY' : 'SELL',
                      price: stockLag.price,
                    });
                    setSelectedPair(null);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white text-xs font-bold shadow-md shadow-emerald-600/30 flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Execute Lagging Sympathy Trade</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
