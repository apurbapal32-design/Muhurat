import React, { useState, useMemo } from 'react';
import { AppTheme, ScannedStock } from '../types';
import {
  LayoutGrid,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Layers,
  BarChart2,
  TrendingUp,
  TrendingDown,
  Info,
  SlidersHorizontal,
} from 'lucide-react';

interface MarketHeatmapProps {
  stocks: ScannedStock[];
  onSelectStock: (stock: ScannedStock) => void;
  theme?: AppTheme | 'dark' | 'light';
}

type SizingMetric = 'turnover' | 'volume' | 'rvol' | 'equal';
type ViewMode = 'sector' | 'grid';

export const MarketHeatmap: React.FC<MarketHeatmapProps> = ({
  stocks,
  onSelectStock,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';
  const [sizingMetric, setSizingMetric] = useState<SizingMetric>('turnover');
  const [viewMode, setViewMode] = useState<ViewMode>('sector');
  const [selectedSector, setSelectedSector] = useState<string>('ALL');
  const [selectedSignal, setSelectedSignal] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hoveredStock, setHoveredStock] = useState<ScannedStock | null>(null);

  // Extract all sectors
  const sectors = useMemo(() => {
    const set = new Set<string>();
    stocks.forEach((s) => {
      if (s.sector) set.add(s.sector);
    });
    return Array.from(set).sort();
  }, [stocks]);

  // Summary stats
  const stats = useMemo(() => {
    let advances = 0;
    let declines = 0;
    let unchanged = 0;
    let buySignals = 0;
    let sellSignals = 0;

    stocks.forEach((s) => {
      if (s.changePercent > 0) advances++;
      else if (s.changePercent < 0) declines++;
      else unchanged++;

      if (s.signal === 'BUY') buySignals++;
      if (s.signal === 'SELL') sellSignals++;
    });

    return { advances, declines, unchanged, buySignals, sellSignals, total: stocks.length };
  }, [stocks]);

  // Filtered stocks
  const filteredStocks = useMemo(() => {
    return stocks.filter((s) => {
      const matchSector = selectedSector === 'ALL' || s.sector === selectedSector;
      const matchSignal = selectedSignal === 'ALL' || s.signal === selectedSignal;
      const matchSearch =
        !searchQuery ||
        s.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.name.toLowerCase().includes(searchQuery.toLowerCase());

      return matchSector && matchSignal && matchSearch;
    });
  }, [stocks, selectedSector, selectedSignal, searchQuery]);

  // Get tile size weight for a stock
  const getWeight = (stock: ScannedStock): number => {
    if (sizingMetric === 'equal') return 1;
    if (sizingMetric === 'rvol') return Math.max(0.5, stock.indicators.rvol || 1);
    if (sizingMetric === 'volume') return Math.max(1000, stock.volume || 10000);
    // default turnover: price * volume
    const turnover = stock.price * (stock.volume || 10000);
    return Math.max(100000, turnover);
  };

  // Color helper based on changePercent
  const getHeatmapColorClass = (changePercent: number) => {
    if (changePercent >= 3.0) return 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/30';
    if (changePercent >= 1.5) return 'bg-emerald-700/90 hover:bg-emerald-600/90 text-emerald-50 border-emerald-500/30';
    if (changePercent >= 0.5) return 'bg-emerald-800/80 hover:bg-emerald-700/80 text-emerald-100 border-emerald-600/30';
    if (changePercent > 0) return 'bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-200 border-emerald-700/30';
    if (changePercent === 0) return 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700/40';
    if (changePercent > -0.5) return 'bg-rose-950/70 hover:bg-rose-900/80 text-rose-200 border-rose-700/30';
    if (changePercent > -1.5) return 'bg-rose-800/80 hover:bg-rose-700/80 text-rose-100 border-rose-600/30';
    if (changePercent > -3.0) return 'bg-rose-700/90 hover:bg-rose-600/90 text-rose-50 border-rose-500/30';
    return 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400/30';
  };

  // Sector groups
  const sectorGroups = useMemo(() => {
    const groups: Record<string, ScannedStock[]> = {};
    filteredStocks.forEach((s) => {
      const sec = s.sector || 'Others';
      if (!groups[sec]) groups[sec] = [];
      groups[sec].push(s);
    });

    // Sort stocks inside each sector by weight descending
    Object.keys(groups).forEach((sec) => {
      groups[sec].sort((a, b) => getWeight(b) - getWeight(a));
    });

    return groups;
  }, [filteredStocks, sizingMetric]);

  return (
    <div
      className={`mb-8 rounded-2xl border p-5 backdrop-blur-md transition-colors ${
        isDark
          ? 'bg-slate-900/80 border-slate-800/80 text-slate-100 shadow-2xl'
          : 'bg-white border-slate-200/90 text-slate-900 shadow-sm'
      }`}
    >
      {/* Header & Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/30 text-indigo-400">
              <LayoutGrid className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
                Nifty 200 Market Heatmap
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Live Market Depth
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Visualizing volume weight & price momentum across top Nifty 200 constituents
              </p>
            </div>
          </div>
        </div>

        {/* Quick Market Breadth Bar */}
        <div className="flex items-center gap-3 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80 text-xs">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 font-semibold border border-emerald-500/20">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{stats.advances} Advances</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-rose-500/10 text-rose-400 font-semibold border border-rose-500/20">
            <TrendingDown className="w-3.5 h-3.5" />
            <span>{stats.declines} Declines</span>
          </div>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-slate-800/80 text-slate-300 font-medium">
            <span>{stats.unchanged} Flat</span>
          </div>
        </div>
      </div>

      {/* Filter and Configuration Toolbar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Search Input */}
        <div className="relative min-w-[200px] flex-1 sm:flex-initial">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search stock ticker..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950/80 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center bg-slate-950/80 p-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setViewMode('sector')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-all ${
              viewMode === 'sector'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Group by Sector</span>
          </button>
          <button
            onClick={() => setViewMode('grid')}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium transition-all ${
              viewMode === 'grid'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Flat Grid</span>
          </button>
        </div>

        {/* Tile Sizing Metric Toggle */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-slate-400">
          <span className="px-2 text-slate-500 font-medium hidden sm:inline">Tile Size:</span>
          {(
            [
              { id: 'turnover', label: 'Turnover (₹)' },
              { id: 'volume', label: 'Volume' },
              { id: 'rvol', label: 'RVOL' },
              { id: 'equal', label: 'Equal' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              onClick={() => setSizingMetric(m.id)}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                sizingMetric === m.id
                  ? 'bg-slate-800 text-slate-100 font-semibold border border-slate-700'
                  : 'hover:text-slate-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Sector Filter Dropdown */}
        <div className="flex items-center gap-2">
          <select
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value)}
            className="bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Sectors ({sectors.length})</option>
            {sectors.map((sec) => (
              <option key={sec} value={sec}>
                {sec}
              </option>
            ))}
          </select>

          {/* Signal Filter Pills */}
          <select
            value={selectedSignal}
            onChange={(e) => setSelectedSignal(e.target.value as any)}
            className="bg-slate-950/80 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="ALL">All Signals</option>
            <option value="BUY">🟢 BUY Signals ({stats.buySignals})</option>
            <option value="SELL">🔴 SELL Signals ({stats.sellSignals})</option>
          </select>
        </div>
      </div>

      {/* Heatmap Scale Color Legend Bar */}
      <div className="mt-4 flex items-center justify-between gap-2 px-3 py-2 bg-slate-950/40 rounded-xl border border-slate-800/50 text-[11px] text-slate-400">
        <span className="font-medium text-slate-500">Price Change Legend:</span>
        <div className="flex items-center gap-1.5 flex-1 max-w-md mx-2">
          <span className="font-mono text-rose-400 font-bold">&lt;-3.0%</span>
          <div className="h-2.5 flex-1 rounded-full bg-gradient-to-r from-rose-600 via-rose-900 via-50% to-emerald-900 to-emerald-600 border border-slate-800" />
          <span className="font-mono text-emerald-400 font-bold">&gt;+3.0%</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span> Gainers
          </span>
          <span className="flex items-center gap-1 text-rose-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-rose-500"></span> Losers
          </span>
        </div>
      </div>

      {/* Heatmap Canvas Container */}
      <div className="mt-5 relative min-h-[420px]">
        {filteredStocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-500 bg-slate-950/50 rounded-2xl border border-dashed border-slate-800">
            <Filter className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-sm font-medium">No stocks found matching the active filter criteria.</p>
            <button
              onClick={() => {
                setSelectedSector('ALL');
                setSelectedSignal('ALL');
                setSearchQuery('');
              }}
              className="mt-3 text-xs text-indigo-400 hover:underline"
            >
              Reset all filters
            </button>
          </div>
        ) : viewMode === 'sector' ? (
          /* Sector Grouped View */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(Object.entries(sectorGroups) as [string, ScannedStock[]][]).map(([sectorName, sectorStocks]) => {
              if (sectorStocks.length === 0) return null;
              // Calculate average sector change
              const avgSectorChange =
                sectorStocks.reduce((sum, s) => sum + s.changePercent, 0) / sectorStocks.length;

              return (
                <div
                  key={sectorName}
                  className="bg-slate-950/70 rounded-xl border border-slate-800/90 p-3.5 flex flex-col justify-between shadow-lg"
                >
                  <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-slate-800/80">
                    <span className="text-xs font-bold text-slate-200 tracking-wide uppercase">
                      {sectorName}
                    </span>
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${
                        avgSectorChange >= 0
                          ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20'
                          : 'text-rose-400 bg-rose-500/10 border border-rose-500/20'
                      }`}
                    >
                      {avgSectorChange >= 0 ? '+' : ''}
                      {avgSectorChange.toFixed(2)}%
                    </span>
                  </div>

                  {/* Stock Tiles in Sector */}
                  <div className="flex flex-wrap gap-1.5">
                    {sectorStocks.map((stock) => {
                      const weight = getWeight(stock);
                      // Calculate proportional flex growth or size style
                      const isHotScore = stock.aiScore >= 80;
                      const isBuy = stock.signal === 'BUY';
                      const isSell = stock.signal === 'SELL';

                      return (
                        <div
                          key={stock.symbol}
                          onClick={() => onSelectStock(stock)}
                          onMouseEnter={() => setHoveredStock(stock)}
                          onMouseLeave={() => setHoveredStock(null)}
                          style={{
                            flexGrow: Math.max(1, Math.round(weight / 10000000)),
                            flexBasis: `${Math.min(100, Math.max(18, Math.round(weight / 2000000)))}%`,
                          }}
                          className={`group relative min-w-[70px] min-h-[52px] p-2 rounded-lg border transition-all cursor-pointer flex flex-col justify-between overflow-hidden shadow-sm hover:scale-[1.03] hover:z-20 ${getHeatmapColorClass(
                            stock.changePercent
                          )} ${
                            isHotScore
                              ? 'ring-1 ring-amber-400/60 shadow-amber-500/10'
                              : ''
                          }`}
                        >
                          {/* Signal Badge indicator */}
                          {isBuy && (
                            <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400/50" />
                          )}
                          {isSell && (
                            <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-400 animate-pulse shadow-sm shadow-rose-400/50" />
                          )}

                          <div className="flex items-center justify-between gap-1">
                            <span className="font-mono font-bold text-xs tracking-tight truncate leading-none">
                              {stock.symbol}
                            </span>
                            {stock.indicators?.rvol >= 1.5 && (
                              <span className="text-[9px] font-mono px-1 rounded bg-black/40 text-amber-300 border border-amber-500/30">
                                {stock.indicators.rvol.toFixed(1)}x
                              </span>
                            )}
                          </div>

                          <div className="flex items-baseline justify-between mt-1 gap-1">
                            <span className="text-[10px] font-mono opacity-80 leading-none">
                              ₹{stock.price >= 1000 ? Math.round(stock.price) : stock.price.toFixed(1)}
                            </span>
                            <span className="text-[11px] font-mono font-bold leading-none">
                              {stock.changePercent >= 0 ? '+' : ''}
                              {stock.changePercent.toFixed(2)}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Flat Treemap Grid View */
          <div className="flex flex-wrap gap-1.5 p-3 bg-slate-950/70 rounded-xl border border-slate-800">
            {filteredStocks.map((stock) => {
              const weight = getWeight(stock);
              const isHotScore = stock.aiScore >= 80;

              return (
                <div
                  key={stock.symbol}
                  onClick={() => onSelectStock(stock)}
                  onMouseEnter={() => setHoveredStock(stock)}
                  onMouseLeave={() => setHoveredStock(null)}
                  style={{
                    flexGrow: Math.max(1, Math.round(weight / 8000000)),
                    flexBasis: `${Math.min(25, Math.max(8, Math.round(weight / 3000000)))}%`,
                  }}
                  className={`group relative min-w-[85px] min-h-[60px] p-2.5 rounded-lg border transition-all cursor-pointer flex flex-col justify-between overflow-hidden shadow-sm hover:scale-[1.04] hover:z-20 ${getHeatmapColorClass(
                    stock.changePercent
                  )} ${
                    isHotScore
                      ? 'ring-1 ring-amber-400/60 shadow-amber-500/10'
                      : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="font-mono font-bold text-xs tracking-tight truncate">
                      {stock.symbol}
                    </span>
                    <span className="text-[10px] font-mono opacity-70 truncate max-w-[50%]">
                      {stock.sector?.split(' ')[0]}
                    </span>
                  </div>

                  <div className="flex items-baseline justify-between mt-1">
                    <span className="text-[11px] font-mono opacity-90">
                      ₹{stock.price.toLocaleString('en-IN')}
                    </span>
                    <span className="text-xs font-mono font-bold">
                      {stock.changePercent >= 0 ? '+' : ''}
                      {stock.changePercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Floating Quick Detail Tooltip on Hover */}
        {hoveredStock && (
          <div className="fixed bottom-6 right-6 z-50 min-w-[280px] bg-slate-900 border border-slate-700/80 rounded-2xl p-4 shadow-2xl backdrop-blur-xl pointer-events-none animate-in fade-in slide-in-from-bottom-3 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div>
                <h4 className="font-bold font-mono text-base text-slate-100 flex items-center gap-2">
                  {hoveredStock.symbol}
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-mono font-bold ${
                      hoveredStock.signal === 'BUY'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : hoveredStock.signal === 'SELL'
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {hoveredStock.signal}
                  </span>
                </h4>
                <p className="text-xs text-slate-400 truncate max-w-[200px]">
                  {hoveredStock.name}
                </p>
              </div>
              <div className="text-right font-mono">
                <div className="text-sm font-bold text-slate-100">
                  ₹{hoveredStock.price.toLocaleString('en-IN')}
                </div>
                <div
                  className={`text-xs font-bold ${
                    hoveredStock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {hoveredStock.changePercent >= 0 ? '+' : ''}
                  {hoveredStock.changePercent.toFixed(2)}% (₹{hoveredStock.change})
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-mono">
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-[10px] block">AI CONVICTION</span>
                <span className="text-amber-400 font-bold text-sm">
                  {hoveredStock.aiScore}/100
                </span>
              </div>
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-[10px] block">RELATIVE VOL (RVOL)</span>
                <span className="text-slate-200 font-bold text-sm">
                  {hoveredStock.indicators?.rvol?.toFixed(2)}x
                </span>
              </div>
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-[10px] block">RSI (14)</span>
                <span className="text-slate-200 font-bold">
                  {hoveredStock.indicators?.rsi?.toFixed(1)}
                </span>
              </div>
              <div className="bg-slate-950/60 p-2 rounded-lg border border-slate-800">
                <span className="text-slate-500 text-[10px] block">RISK / REWARD</span>
                <span className="text-indigo-400 font-bold">
                  1:{hoveredStock.risk?.riskRewardRatio?.toFixed(1) || '2.0'}
                </span>
              </div>
            </div>

            <div className="mt-2.5 text-[10px] text-slate-400 flex items-center justify-between pt-2 border-t border-slate-800/80">
              <span className="text-indigo-400 flex items-center gap-1">
                <Info className="w-3 h-3" /> Click tile to inspect charts & trade
              </span>
              <span className="text-slate-500">{hoveredStock.sector}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
