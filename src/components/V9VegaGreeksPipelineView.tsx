import React, { useState, useEffect } from 'react';
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
  ChevronRight,
  Cpu,
  Crosshair,
  Eye,
  Flame,
  Layers,
  Percent,
  Play,
  Radio,
  RefreshCw,
  Scale,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Table,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  IndexIntelligenceData,
  SupportedIndexSymbol,
  V9EnginePipelineData,
  StockV9Data,
  ScannedStock,
} from '../types';
import { V9StockUniverseScannerView } from './V9StockUniverseScannerView';
import { convertStockToIntelligenceData, computeStockV9Pipeline } from '../utils/v9VegaGreeksEngine';
import { NIFTY_200_STOCKS } from '../data/nifty200';

interface V9VegaGreeksPipelineViewProps {
  data: IndexIntelligenceData;
  onSelectStrikeForTrade?: (strikeData: any) => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
  liveStocks?: ScannedStock[];
}

export const V9VegaGreeksPipelineView: React.FC<V9VegaGreeksPipelineViewProps> = ({
  data,
  onSelectStrikeForTrade,
  theme = 'dark',
  liveStocks,
}) => {
  const isDark = theme !== 'light';

  // Universe Tab: All Stocks vs Deep Dive Inspector
  const [v9UniverseTab, setV9UniverseTab] = useState<'ALL_STOCKS' | 'INSPECTOR'>('ALL_STOCKS');
  const [inspectedData, setInspectedData] = useState<IndexIntelligenceData>(data);
  const [activeEngineStep, setActiveEngineStep] = useState<number>(9); // default to V9 Execution
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1m' | '3m' | '5m' | '15m'>('5m');
  const [stockSelectorOpen, setStockSelectorOpen] = useState(false);
  const [quickSearch, setQuickSearch] = useState('');

  // Keep inspectedData updated when parent index data updates (if inspecting an index)
  useEffect(() => {
    if (['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'].includes(inspectedData.symbol)) {
      setInspectedData(data);
    }
  }, [data]);

  const v9 = inspectedData.v9Engine;

  const handleSelectStockForDeepDive = (stock: StockV9Data) => {
    const converted = convertStockToIntelligenceData(stock);
    setInspectedData(converted);
    setV9UniverseTab('INSPECTOR');
    setActiveEngineStep(9);
  };

  const handlePickStockFromDropdown = (symbol: string) => {
    if (symbol === data.symbol) {
      setInspectedData(data);
    } else {
      const found = NIFTY_200_STOCKS.find((s) => s.symbol === symbol);
      if (found) {
        const liveMatch = liveStocks?.find((ls) => ls.symbol.toUpperCase() === symbol.toUpperCase());
        const stockV9 = computeStockV9Pipeline(
          found,
          liveMatch?.price,
          liveMatch?.changePercent,
          liveMatch,
          selectedTimeframe
        );
        const converted = convertStockToIntelligenceData(stockV9);
        setInspectedData(converted);
      }
    }
    setStockSelectorOpen(false);
    setQuickSearch('');
  };

  if (!v9) {
    return (
      <div className="p-8 text-center text-slate-400 font-mono">
        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-400" />
        Initializing V1 → V9 Vega &amp; Greeks Engine Pipeline...
      </div>
    );
  }

  const { v1Data, v2Greeks, v3IvVega, v4OiEngine, v5Technical, v6OrderFlow, v7SmartMoney, v8AiScoring, v9LiveAlgo } = v9;
  const isCe = v9LiveAlgo.tradeSetup.optionType === 'CE';

  return (
    <div className="space-y-4">
      {/* Top Universe Navigation Bar */}
      <div className={`p-2 rounded-xl border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 ${
        isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
          <button
            onClick={() => setV9UniverseTab('ALL_STOCKS')}
            className={`px-3.5 py-2 rounded-lg text-xs font-mono font-black flex items-center gap-2 transition-all shrink-0 ${
              v9UniverseTab === 'ALL_STOCKS'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Building2 className="w-4 h-4 text-indigo-300" />
            <span>📊 ALL 210+ F&amp;O STOCKS SCANNER</span>
          </button>

          <button
            onClick={() => setV9UniverseTab('INSPECTOR')}
            className={`px-3.5 py-2 rounded-lg text-xs font-mono font-black flex items-center gap-2 transition-all shrink-0 ${
              v9UniverseTab === 'INSPECTOR'
                ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Zap className="w-4 h-4 text-purple-300" />
            <span>🔬 V1→V9 DEEP DIVE: {inspectedData.symbol}</span>
          </button>
        </div>

        {/* Quick Stock & Index Switcher */}
        <div className="relative shrink-0">
          <button
            onClick={() => setStockSelectorOpen(!stockSelectorOpen)}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold flex items-center gap-2 border transition-all ${
              isDark
                ? 'bg-slate-950 border-slate-700 text-slate-200 hover:border-indigo-500'
                : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-indigo-500'
            }`}
          >
            <span className="text-slate-400 text-[10px]">Switch Target:</span>
            <strong className="text-indigo-400 font-black">{inspectedData.symbol}</strong>
            <span className="text-[10px] text-slate-400">({inspectedData.spotPrice.toFixed(2)})</span>
            <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${stockSelectorOpen ? 'rotate-90' : ''}`} />
          </button>

          {stockSelectorOpen && (
            <div className={`absolute right-0 top-full mt-2 w-72 max-h-80 rounded-xl border shadow-2xl z-50 overflow-hidden flex flex-col ${
              isDark ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-white border-slate-200 text-slate-800'
            }`}>
              <div className="p-2 border-b border-slate-800 bg-slate-950/80">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search 210+ stocks & indices..."
                    value={quickSearch}
                    onChange={(e) => setQuickSearch(e.target.value)}
                    autoFocus
                    className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs font-mono bg-slate-900 border border-slate-700 text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="overflow-y-auto flex-1 custom-scrollbar p-1">
                <div className="px-2 py-1 text-[10px] font-mono text-indigo-400 font-bold uppercase">Indices</div>
                {['NIFTY', 'BANKNIFTY', 'FINNIFTY', 'MIDCPNIFTY', 'SENSEX'].map((idx) => (
                  <button
                    key={idx}
                    onClick={() => handlePickStockFromDropdown(idx)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-between"
                  >
                    <span>{idx}</span>
                    <span className="text-[10px] opacity-70">Major Index</span>
                  </button>
                ))}

                <div className="px-2 py-1 mt-1 text-[10px] font-mono text-purple-400 font-bold uppercase border-t border-slate-800">
                  F&amp;O Stocks ({NIFTY_200_STOCKS.length})
                </div>
                {NIFTY_200_STOCKS.filter((s) =>
                  !quickSearch ||
                  s.symbol.toLowerCase().includes(quickSearch.toLowerCase()) ||
                  s.name.toLowerCase().includes(quickSearch.toLowerCase())
                ).slice(0, 40).map((stock) => (
                  <button
                    key={stock.symbol}
                    onClick={() => handlePickStockFromDropdown(stock.symbol)}
                    className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold hover:bg-indigo-600 hover:text-white transition-all flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold">{stock.symbol}</div>
                      <div className="text-[10px] opacity-60 truncate max-w-[140px]">{stock.name}</div>
                    </div>
                    <span className="text-[10px] text-purple-300">{stock.sector}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* SUB-VIEW 1: ALL STOCKS SCANNER */}
      {v9UniverseTab === 'ALL_STOCKS' && (
        <V9StockUniverseScannerView
          onSelectStockForDeepDive={handleSelectStockForDeepDive}
          onTradeSetup={onSelectStrikeForTrade}
          theme={theme}
          liveStocks={liveStocks}
          initialTimeframe={selectedTimeframe}
        />
      )}

      {/* SUB-VIEW 2: SINGLE INSTRUMENT DEEP DIVE INSPECTOR */}
      {v9UniverseTab === 'INSPECTOR' && (
        <div className="space-y-5">
          {/* Back button banner if inspecting a single stock */}
          <div className="flex items-center justify-between bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 font-mono text-xs">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setV9UniverseTab('ALL_STOCKS')}
                className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 transition-all font-bold flex items-center gap-1"
              >
                ← Back to All Stocks Table
              </button>
              <span className="text-slate-400">Currently Inspecting:</span>
              <strong className="text-slate-100 font-black text-sm">{inspectedData.symbol}</strong>
              <span className="text-purple-400">({inspectedData.name})</span>
            </div>

            <div className="text-right text-xs">
              Spot: <strong className="text-slate-100 font-mono">{inspectedData.spotPrice.toFixed(2)}</strong> ({inspectedData.changePercent >= 0 ? '+' : ''}{inspectedData.changePercent}%)
            </div>
          </div>
      {/* Top Banner: Master Verdict & AI Probabilities */}
      <div
        className={`p-4 sm:p-5 rounded-xl border relative overflow-hidden ${
          v9LiveAlgo.conviction.includes('HIGH_CONFIDENCE_CE_BUY')
            ? 'bg-gradient-to-r from-emerald-950/80 via-slate-900 to-teal-950/80 border-emerald-500/50 shadow-lg shadow-emerald-950/30'
            : v9LiveAlgo.conviction.includes('HIGH_CONFIDENCE_PE_BUY')
            ? 'bg-gradient-to-r from-rose-950/80 via-slate-900 to-red-950/80 border-rose-500/50 shadow-lg shadow-rose-950/30'
            : v9LiveAlgo.vegaTrapFilterTriggered
            ? 'bg-gradient-to-r from-amber-950/80 via-slate-900 to-orange-950/80 border-amber-500/50 shadow-lg shadow-amber-950/30'
            : isDark
            ? 'bg-slate-900/90 border-slate-800'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 uppercase">
                🚀 V9 VEGA + GREEKS ENGINE
              </span>
              <span className="text-xs font-mono text-slate-400">
                {data.symbol} • Spot: <strong className="text-slate-100 font-bold">{data.spotPrice.toFixed(2)}</strong> ({data.changePercent >= 0 ? '+' : ''}{data.changePercent}%)
              </span>
              {v9LiveAlgo.vegaTrapFilterTriggered && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1 animate-pulse">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  VEGA TRAP FILTER ACTIVE
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl sm:text-2xl font-black font-mono tracking-tight flex items-center gap-2">
                {v9LiveAlgo.verdict === 'CE_BUY' ? (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <TrendingUp className="w-6 h-6" />
                    {v9LiveAlgo.conviction === 'HIGH_CONFIDENCE_CE_BUY' ? 'HIGH-CONFIDENCE CE BUY' : 'CE BUY (CALL OPTION)'}
                  </span>
                ) : v9LiveAlgo.verdict === 'PE_BUY' ? (
                  <span className="text-rose-400 flex items-center gap-1.5">
                    <TrendingDown className="w-6 h-6" />
                    {v9LiveAlgo.conviction === 'HIGH_CONFIDENCE_PE_BUY' ? 'HIGH-CONFIDENCE PE BUY' : 'PE BUY (PUT OPTION)'}
                  </span>
                ) : v9LiveAlgo.vegaTrapFilterTriggered ? (
                  <span className="text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-6 h-6" />
                    NO TRADE (VEGA TRAP DETECTED)
                  </span>
                ) : (
                  <span className="text-slate-400 flex items-center gap-1.5">
                    <Shield className="w-6 h-6 text-slate-400" />
                    NO TRADE (NEUTRAL / RANGE CHOP)
                  </span>
                )}
              </h2>

              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 rounded-md text-xs font-mono font-black bg-slate-800 text-slate-200 border border-slate-700">
                  Master Score: <span className="text-indigo-400 font-bold">{v8AiScoring.masterScore}</span>/100
                </span>
                <span className="px-2 py-1 rounded text-xs font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {v3IvVega.ivRegime.replace('_', ' ')}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-300 font-mono mt-1.5 max-w-3xl leading-relaxed">
              {v9LiveAlgo.tradeSetup.thesis}
            </p>
          </div>

          {/* Probabilities Gauges */}
          <div className="flex items-center gap-3 shrink-0 bg-slate-950/60 p-3 rounded-lg border border-slate-800">
            <div className="text-center px-2">
              <div className="text-[10px] font-mono text-slate-400 uppercase font-bold">CE BUY PROB</div>
              <div className="text-lg font-black font-mono text-emerald-400">
                {v8AiScoring.probabilities.ceBuyPct}%
              </div>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div className="text-center px-2">
              <div className="text-[10px] font-mono text-slate-400 uppercase font-bold">PE BUY PROB</div>
              <div className="text-lg font-black font-mono text-rose-400">
                {v8AiScoring.probabilities.peBuyPct}%
              </div>
            </div>
            <div className="h-8 w-px bg-slate-800" />
            <div className="text-center px-2">
              <div className="text-[10px] font-mono text-slate-400 uppercase font-bold">NO TRADE PROB</div>
              <div className="text-lg font-black font-mono text-amber-400">
                {v8AiScoring.probabilities.noTradePct}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* V1 -> V9 Pipeline Navigation Steps */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="text-xs font-mono font-bold text-slate-400 uppercase flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            <span>Interactive V1 → V9 Architecture Pipeline</span>
          </div>
          <span className="text-[11px] font-mono text-slate-400">Click any engine to inspect mathematical formulas &amp; telemetry</span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-1.5 font-mono">
          {[
            { step: 1, name: 'V1 Data', sub: 'Tick Feed', score: `${v1Data.totalStrikesCount} Strikes`, color: 'slate' },
            { step: 2, name: 'V2 Greeks', sub: 'BSM IV/Δ/Γ/Θ/V', score: `${v2Greeks.greeksScore} pts`, color: 'blue' },
            { step: 3, name: 'V3 IV/Vega', sub: 'Momentum/Skew', score: `${v3IvVega.vegaExpansionScore > 0 ? '+' : ''}${v3IvVega.vegaExpansionScore} VE`, color: 'purple' },
            { step: 4, name: 'V4 OI Engine', sub: 'PCR & Buildups', score: `PCR ${v4OiEngine.pcr}`, color: 'cyan' },
            { step: 5, name: 'V5 Technical', sub: 'VWAP & EMA Stack', score: v5Technical.emaAlignment === 'BULLISH_STACK' ? 'Bullish' : v5Technical.emaAlignment === 'BEARISH_STACK' ? 'Bearish' : 'Chop', color: 'emerald' },
            { step: 6, name: 'V6 Order Flow', sub: 'CVD & Imbalances', score: `${v6OrderFlow.cvd > 0 ? '+' : ''}${v6OrderFlow.cvd}k`, color: 'amber' },
            { step: 7, name: 'V7 Wyckoff', sub: 'SMC & Liquidity', score: v7SmartMoney.smcStructure.replace('_', ' '), color: 'teal' },
            { step: 8, name: 'V8 AI Model', sub: 'Probability Engine', score: `${v8AiScoring.masterScore}/100`, color: 'indigo' },
            { step: 9, name: 'V9 Live Algo', sub: 'Risk & Execution', score: v9LiveAlgo.verdict, color: v9LiveAlgo.verdict === 'CE_BUY' ? 'emerald' : v9LiveAlgo.verdict === 'PE_BUY' ? 'rose' : 'amber' },
          ].map((eng) => {
            const isActive = activeEngineStep === eng.step;
            return (
              <button
                key={eng.step}
                onClick={() => setActiveEngineStep(eng.step)}
                className={`p-2 rounded-lg border text-left transition-all ${
                  isActive
                    ? 'bg-indigo-600/30 border-indigo-400 text-white shadow-md ring-1 ring-indigo-400'
                    : 'bg-slate-950/60 border-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] font-bold">
                  <span className={isActive ? 'text-indigo-300 font-black' : 'text-slate-400'}>{eng.name}</span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-slate-800/80 text-slate-300">
                    {eng.step}
                  </span>
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">{eng.sub}</div>
                <div className="text-[11px] font-black text-slate-200 truncate mt-1">{eng.score}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detailed Engine Inspector Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column (8 Cols): Active Selected Engine Deep Dive */}
        <div className="lg:col-span-8 space-y-4">
          {/* V1 Data Deep Dive */}
          {activeEngineStep === 1 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-bold font-mono text-slate-100 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-400" />
                    V1 — Real-Time Multi-Timeframe Data Normalizer Engine
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Collects spot ticks, futures premium/discount, option chains, strikes, bid/ask spreads, and FII flows.
                  </p>
                </div>
                <div className="flex gap-1">
                  {(['1m', '3m', '5m', '15m'] as const).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setSelectedTimeframe(tf)}
                      className={`px-2 py-1 rounded text-[10px] font-mono font-bold ${
                        selectedTimeframe === tf
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">UNDERLYING SPOT</div>
                  <div className="text-lg font-black font-mono text-slate-100">₹{v1Data.underlyingPrice.toFixed(2)}</div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">Tick Step: ±{v1Data.strikeStep} pts</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">FUTURES PRICE / BASIS</div>
                  <div className="text-lg font-black font-mono text-indigo-300">₹{v1Data.futuresPrice.toFixed(2)}</div>
                  <div className={`text-[10px] font-mono font-bold mt-1 ${v1Data.basisPts >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    Basis: {v1Data.basisPts >= 0 ? '+' : ''}{v1Data.basisPts} pts ({v1Data.basisPct}%)
                  </div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">TOTAL OI &amp; VOLUME</div>
                  <div className="text-lg font-black font-mono text-emerald-300">{v1Data.totalOiLakhs} L OI</div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">Vol: {v1Data.totalVolumeLakhs} Lakhs</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">FII LONG/SHORT RATIO</div>
                  <div className="text-lg font-black font-mono text-amber-300">{v1Data.fiiLongShortRatio.toFixed(2)}x</div>
                  <div className="text-[10px] font-mono text-emerald-400 mt-1 font-bold">
                    {v1Data.fiiLongShortRatio > 1.2 ? 'Institutional Long Bias' : 'Hedging / Short'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* V2 Greeks Deep Dive */}
          {activeEngineStep === 2 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold font-mono text-slate-100 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  V2 — Black-Scholes Greeks Engine (0–100 Greeks Composite Score)
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Calculates exact Delta (Δ), Gamma (Γ), Theta (Θ), Vega (𝒱), Rho (ρ), Normalized Vega, and Theta Penalty.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">DELTA (Δ) SWEETSPOT</div>
                  <div className={`text-xl font-black font-mono ${v9LiveAlgo.activeRuleChecklist.deltaSweetspotPassed ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {v2Greeks.delta > 0 ? `+${v2Greeks.delta}` : v2Greeks.delta}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">Target: ±0.45 to ±0.70</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">VEGA (𝒱) &amp; NORMALIZED</div>
                  <div className="text-xl font-black font-mono text-indigo-300">
                    ₹{v2Greeks.vega} <span className="text-xs text-slate-400 font-normal">({v2Greeks.normalizedVegaPct}%)</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">Per 1% IV shift</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">THETA (Θ) DECAY PENALTY</div>
                  <div className={`text-xl font-black font-mono ${v2Greeks.thetaPenaltyPct > 25 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    ₹{v2Greeks.theta} <span className="text-xs text-slate-400 font-normal">({v2Greeks.thetaPenaltyPct}%/day)</span>
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">
                    {v2Greeks.thetaPenaltyPct > 25 ? '⚠️ High Decay Warning' : '✅ Safe Decay Level'}
                  </div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">GAMMA (Γ) RISK FILTER</div>
                  <div className="text-xl font-black font-mono text-cyan-300">{v2Greeks.gamma.toFixed(5)}</div>
                  <div className="text-[10px] font-mono text-emerald-400 mt-1 font-bold">
                    Risk: {v2Greeks.gammaRiskLevel}
                  </div>
                </div>
              </div>

              {/* Formula Card */}
              <div className="bg-slate-950/90 p-3 rounded-lg border border-slate-800 font-mono text-xs text-slate-300 space-y-1">
                <div className="font-bold text-indigo-300">📐 Mathematical BSM Formula Reference:</div>
                <div className="text-[11px] text-slate-400">
                  d₁ = [ln(S/K) + (r + σ²/2)T] / (σ√T) &nbsp;•&nbsp; Vega = S · √T · N'(d₁) / 100 &nbsp;•&nbsp; Normalized Vega = (Vega / LTP) · 100%
                </div>
              </div>
            </div>
          )}

          {/* V3 IV / Vega Deep Dive */}
          {activeEngineStep === 3 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold font-mono text-slate-100 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-400" />
                  V3 — IV / Vega Momentum &amp; Volatility Expansion Engine
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Tracks IV Rank, IV Percentile, IV Momentum, Vega Momentum, and the 4 Volatility Regimes.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">ATM IV &amp; IV RANK</div>
                  <div className="text-lg font-black font-mono text-purple-300">{v3IvVega.atmIv}%</div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">IV Rank: {v3IvVega.ivRank}% (IVP: {v3IvVega.ivPercentile}%)</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">VEGA MOMENTUM</div>
                  <div className={`text-lg font-black font-mono ${v3IvVega.vegaMomentumPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {v3IvVega.vegaMomentumPct >= 0 ? '+' : ''}{v3IvVega.vegaMomentumPct}%
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">IV Mom: {v3IvVega.ivMomentumPct >= 0 ? '+' : ''}{v3IvVega.ivMomentumPct}%</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">VEGA EXPANSION SCORE</div>
                  <div className={`text-lg font-black font-mono ${v3IvVega.vegaExpansionScore > 1.0 ? 'text-emerald-400' : v3IvVega.vegaExpansionScore < -1.0 ? 'text-rose-400' : 'text-amber-300'}`}>
                    {v3IvVega.vegaExpansionScore > 0 ? '+' : ''}{v3IvVega.vegaExpansionScore}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">
                    {v3IvVega.vegaExpansionScore > 1.0 ? 'Bullish Expansion (> +1.0)' : 'Contraction / Flat'}
                  </div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">IV SKEW (CE - PE)</div>
                  <div className="text-lg font-black font-mono text-slate-200">{v3IvVega.ivSkew > 0 ? '+' : ''}{v3IvVega.ivSkew}%</div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">CE {v3IvVega.ceIv}% / PE {v3IvVega.peIv}%</div>
                </div>
              </div>

              {/* 4 Regimes Matrix */}
              <div className="p-3 bg-slate-950 rounded-lg border border-slate-800">
                <div className="text-xs font-mono font-bold text-slate-300 mb-2">4 Volatility Regimes Interpretation:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                  <div className={`p-2 rounded border ${v3IvVega.ivRegime === 'BULLISH_EXPANSION' ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200' : 'bg-slate-900/60 border-slate-800 text-slate-400'}`}>
                    <strong>1. Price ↑ + IV ↑</strong>: Strong Bullish Volatility Expansion (Call Sweep)
                  </div>
                  <div className={`p-2 rounded border ${v3IvVega.ivRegime === 'BULLISH_CONTRACTION' ? 'bg-blue-950/60 border-blue-500 text-blue-200' : 'bg-slate-900/60 border-slate-800 text-slate-400'}`}>
                    <strong>2. Price ↑ + IV ↓</strong>: Bullish Grind / Call Writing Absorption
                  </div>
                  <div className={`p-2 rounded border ${v3IvVega.ivRegime === 'BEARISH_EXPANSION' ? 'bg-rose-950/60 border-rose-500 text-rose-200' : 'bg-slate-900/60 border-slate-800 text-slate-400'}`}>
                    <strong>3. Price ↓ + IV ↑</strong>: Strong Bearish Volatility Expansion (Panic Puts)
                  </div>
                  <div className={`p-2 rounded border ${v3IvVega.ivRegime === 'BEARISH_CONTRACTION' ? 'bg-amber-950/60 border-amber-500 text-amber-200' : 'bg-slate-900/60 border-slate-800 text-slate-400'}`}>
                    <strong>4. Price ↓ + IV ↓</strong>: Slow Bleed / Put Writing Decay
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* V4 OI Engine Deep Dive */}
          {activeEngineStep === 4 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold font-mono text-slate-100 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-cyan-400" />
                  V4 — Open Interest &amp; PCR Battlefield Engine
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Detects Long Buildup, Short Buildup, Short Covering, Long Unwinding, PCR Rate of Change, and Max Pain.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">PUT-CALL RATIO (PCR)</div>
                  <div className="text-xl font-black font-mono text-cyan-300">{v4OiEngine.pcr}</div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">ΔPCR: {v4OiEngine.pcrMomentum >= 0 ? '+' : ''}{v4OiEngine.pcrMomentum}</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">OI INTERPRETATION</div>
                  <div className="text-sm font-black font-mono text-emerald-400">{v4OiEngine.oiRegime.replace('_', ' ')}</div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">Put Chg: {v4OiEngine.putOiChangeLakhs}L / Call Chg: {v4OiEngine.callOiChangeLakhs}L</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">PUT WALL (FLOOR)</div>
                  <div className="text-xl font-black font-mono text-emerald-300">₹{v4OiEngine.putWallStrike}</div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">Major Institutional Support</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">CALL WALL (CEILING)</div>
                  <div className="text-xl font-black font-mono text-rose-300">₹{v4OiEngine.callWallStrike}</div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">Max Pain: ₹{v4OiEngine.maxPainStrike}</div>
                </div>
              </div>
            </div>
          )}

          {/* V5 Technical Engine Deep Dive */}
          {activeEngineStep === 5 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold font-mono text-slate-100 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  V5 — Technical Engine (VWAP, EMA 13/21/34 Ribbon, RSI &amp; ADX)
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Evaluates price action alignment, moving average ribbon, momentum sweetspots, and RVOL breakout confirmation.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">VWAP &amp; DISTANCE</div>
                  <div className="text-lg font-black font-mono text-slate-100">₹{v5Technical.vwap.toFixed(2)}</div>
                  <div className={`text-[10px] font-mono font-bold mt-1 ${v5Technical.spotVsVwapPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    Spot is {v5Technical.spotVsVwapPct >= 0 ? '+' : ''}{v5Technical.spotVsVwapPct}% vs VWAP ({v5Technical.vwapSlope})
                  </div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">EMA 13 / 21 / 34 RIBBON</div>
                  <div className="text-sm font-black font-mono text-indigo-300">
                    {v5Technical.emaAlignment === 'BULLISH_STACK' ? '🟢 13 > 21 > 34 (Bullish)' : v5Technical.emaAlignment === 'BEARISH_STACK' ? '🔴 13 < 21 < 34 (Bearish)' : '⚠️ Mixed Ribbon'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">
                    EMA13: {v5Technical.ema13} | EMA21: {v5Technical.ema21}
                  </div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">RSI 14 &amp; SWEETSPOT</div>
                  <div className="text-lg font-black font-mono text-amber-300">{v5Technical.rsi}</div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">Status: {v5Technical.rsiStatus}</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">ADX TREND &amp; RVOL</div>
                  <div className="text-lg font-black font-mono text-cyan-300">{v5Technical.adx} <span className="text-xs font-normal text-slate-400">({v5Technical.adxTrend})</span></div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">RVOL: {v5Technical.rvol}x ({v5Technical.rvolConfirmation})</div>
                </div>
              </div>
            </div>
          )}

          {/* V6 Order Flow & CVD Deep Dive */}
          {activeEngineStep === 6 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold font-mono text-slate-100 flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-amber-400" />
                  V6 — Order Flow &amp; Cumulative Volume Delta (CVD) Engine
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Measures aggressive market orders, Delta velocity, Cumulative Volume Delta, and divergences.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">NET DELTA VOLUME</div>
                  <div className={`text-xl font-black font-mono ${v6OrderFlow.netDeltaLakhs >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {v6OrderFlow.netDeltaLakhs >= 0 ? '+' : ''}{v6OrderFlow.netDeltaLakhs} L
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">Buy: {v6OrderFlow.buyVolumeLakhs}L / Sell: {v6OrderFlow.sellVolumeLakhs}L</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">CUMULATIVE DELTA (CVD)</div>
                  <div className={`text-xl font-black font-mono ${v6OrderFlow.cvd >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {v6OrderFlow.cvd >= 0 ? '+' : ''}{v6OrderFlow.cvd}k
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">Trend: {v6OrderFlow.cvdTrend.replace('_', ' ')}</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">CVD DIVERGENCE</div>
                  <div className="text-sm font-black font-mono text-slate-200">{v6OrderFlow.cvdDivergence.replace('_', ' ')}</div>
                  <div className="text-[10px] font-mono text-emerald-400 mt-1">Flow Score: {v6OrderFlow.orderFlowScore}/100</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">NORMALIZED CVD</div>
                  <div className="text-xl font-black font-mono text-indigo-300">{v6OrderFlow.normalizedCvd > 0 ? '+' : ''}{v6OrderFlow.normalizedCvd}</div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">Scale -100 to +100</div>
                </div>
              </div>
            </div>
          )}

          {/* V7 Smart Money & Wyckoff Deep Dive */}
          {activeEngineStep === 7 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold font-mono text-slate-100 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-teal-400" />
                  V7 — Smart Money Concepts (SMC) &amp; Wyckoff Phase Engine
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Identifies Accumulation, Distribution, Spring, Upthrust, Sign of Strength (SOS), Sign of Weakness (SOW), BOS, and CHOCH.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">WYCKOFF PHASE</div>
                  <div className="text-sm font-black font-mono text-teal-300">{v7SmartMoney.wyckoffPhase.replace(/_/g, ' ')}</div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">Institutional Cycle</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">MARKET STRUCTURE</div>
                  <div className="text-sm font-black font-mono text-indigo-300">{v7SmartMoney.smcStructure.replace(/_/g, ' ')}</div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">Break of Structure / CHOCH</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">LIQUIDITY SWEEP</div>
                  <div className={`text-sm font-black font-mono ${v7SmartMoney.liquiditySweepDetected ? 'text-emerald-400' : 'text-slate-400'}`}>
                    {v7SmartMoney.liquiditySweepDetected ? `✅ ${v7SmartMoney.liquiditySweepSide.replace(/_/g, ' ')}` : 'None Active'}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">Stop Run Cleared</div>
                </div>

                <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800">
                  <div className="text-[10px] font-mono text-slate-400">DEMAND / SUPPLY ZONES</div>
                  <div className="text-xs font-black font-mono text-slate-200">
                    D: {v7SmartMoney.demandZone[0]}–{v7SmartMoney.demandZone[1]}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400 mt-1">
                    S: {v7SmartMoney.supplyZone[0]}–{v7SmartMoney.supplyZone[1]}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* V8 AI Scoring Model Deep Dive */}
          {activeEngineStep === 8 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold font-mono text-slate-100 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-indigo-400" />
                  V8 — AI Probabilistic Scoring &amp; Multi-Factor Machine Learning Engine
                </h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Synthesizes all 7 upstream quantitative vectors into a calibrated 0–100 Master Signal Score.
                </p>
              </div>

              <div className="space-y-2 font-mono text-xs">
                {[
                  { name: 'Greeks Composite Vector (Delta, Gamma, Theta Penalty, Vega)', weight: '20%', score: v8AiScoring.componentScores.greeks },
                  { name: 'IV & Vega Volatility Expansion Momentum', weight: '20%', score: v8AiScoring.componentScores.ivVega },
                  { name: 'Open Interest & PCR Velocity Factor', weight: '15%', score: v8AiScoring.componentScores.oiPcr },
                  { name: 'Order Flow & Cumulative Volume Delta (CVD)', weight: '15%', score: v8AiScoring.componentScores.orderFlowCvd },
                  { name: 'Price Action, VWAP & EMA 13/21/34 Ribbon', weight: '15%', score: v8AiScoring.componentScores.priceActionVwap },
                  { name: 'Volume & RVOL Breakout Outlier Score', weight: '10%', score: v8AiScoring.componentScores.volumeRvol },
                  { name: 'Market Regime Alignment Factor', weight: '5%', score: v8AiScoring.componentScores.marketRegime },
                ].map((item, idx) => (
                  <div key={idx} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-200">{item.name}</div>
                      <div className="text-[10px] text-slate-400">Weight: {item.weight}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-indigo-300">{item.score}/100</div>
                      <div className="w-24 bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1">
                        <div className="bg-indigo-500 h-full rounded-full" style={{ width: `${item.score}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* V9 Live Algo & Risk Engine Deep Dive */}
          {activeEngineStep === 9 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 sm:p-5 space-y-4">
              <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold font-mono text-slate-100 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    V9 — Live Execution Algo &amp; Risk Protection Engine
                  </h3>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    Evaluates rule checklists, enforces Vega Trap &amp; Theta filters, and formats ATR trade ladders.
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded text-xs font-mono font-black bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  SCORE: {v8AiScoring.masterScore} / 100
                </span>
              </div>

              {/* 9-Point Execution Rule Checklist */}
              <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 space-y-2">
                <div className="text-xs font-mono font-bold text-slate-300 mb-1 flex items-center gap-1.5">
                  <Crosshair className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Mandatory Algorithmic Execution Checklist:</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-xs">
                  <div className={`p-2 rounded border flex items-center gap-1.5 ${v9LiveAlgo.activeRuleChecklist.totalScorePassed ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-200' : 'bg-slate-900/60 border-slate-800 text-slate-400'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${v9LiveAlgo.activeRuleChecklist.totalScorePassed ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>Total Score &ge; 75 (High &ge; 85)</span>
                  </div>

                  <div className={`p-2 rounded border flex items-center gap-1.5 ${v9LiveAlgo.activeRuleChecklist.vwapRulePassed ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-200' : 'bg-slate-900/60 border-slate-800 text-slate-400'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${v9LiveAlgo.activeRuleChecklist.vwapRulePassed ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>Price vs VWAP Aligned</span>
                  </div>

                  <div className={`p-2 rounded border flex items-center gap-1.5 ${v9LiveAlgo.activeRuleChecklist.emaStackPassed ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-200' : 'bg-slate-900/60 border-slate-800 text-slate-400'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${v9LiveAlgo.activeRuleChecklist.emaStackPassed ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>EMA 13 &gt; 21 &gt; 34 Ribbon</span>
                  </div>

                  <div className={`p-2 rounded border flex items-center gap-1.5 ${v9LiveAlgo.activeRuleChecklist.deltaSweetspotPassed ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-200' : 'bg-slate-900/60 border-slate-800 text-slate-400'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${v9LiveAlgo.activeRuleChecklist.deltaSweetspotPassed ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>Delta in ±0.45 to ±0.70</span>
                  </div>

                  <div className={`p-2 rounded border flex items-center gap-1.5 ${v9LiveAlgo.activeRuleChecklist.ivMomentumPassed ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-200' : 'bg-slate-900/60 border-slate-800 text-slate-400'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${v9LiveAlgo.activeRuleChecklist.ivMomentumPassed ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>IV Momentum &gt; 0</span>
                  </div>

                  <div className={`p-2 rounded border flex items-center gap-1.5 ${v9LiveAlgo.activeRuleChecklist.vegaMomentumPassed ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-200' : 'bg-slate-900/60 border-slate-800 text-slate-400'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${v9LiveAlgo.activeRuleChecklist.vegaMomentumPassed ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>Vega Momentum &gt; 0</span>
                  </div>

                  <div className={`p-2 rounded border flex items-center gap-1.5 ${v9LiveAlgo.activeRuleChecklist.cvdRulePassed ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-200' : 'bg-slate-900/60 border-slate-800 text-slate-400'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${v9LiveAlgo.activeRuleChecklist.cvdRulePassed ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>CVD Directional Alignment</span>
                  </div>

                  <div className={`p-2 rounded border flex items-center gap-1.5 ${v9LiveAlgo.activeRuleChecklist.rvolRulePassed ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-200' : 'bg-slate-900/60 border-slate-800 text-slate-400'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${v9LiveAlgo.activeRuleChecklist.rvolRulePassed ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>RVOL &gt; 1.5 Confirmation</span>
                  </div>

                  <div className={`p-2 rounded border flex items-center gap-1.5 ${v9LiveAlgo.activeRuleChecklist.adxRulePassed ? 'bg-emerald-950/40 border-emerald-600/40 text-emerald-200' : 'bg-slate-900/60 border-slate-800 text-slate-400'}`}>
                    <CheckCircle2 className={`w-3.5 h-3.5 ${v9LiveAlgo.activeRuleChecklist.adxRulePassed ? 'text-emerald-400' : 'text-slate-500'}`} />
                    <span>ADX &gt; 20 (Trending State)</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column (4 Cols): ATR-Based Execution Strike Card */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 font-mono">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5 text-indigo-400" />
                <span>ATR-Based Execution Contract</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-indigo-600 text-white">
                {v9LiveAlgo.tradeSetup.optionType}
              </span>
            </div>

            <div>
              <div className="text-sm font-black text-slate-100">
                {v9LiveAlgo.tradeSetup.contractName}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 flex items-center justify-between">
                <span>LTP: <strong className="text-indigo-300 font-bold">₹{v9LiveAlgo.tradeSetup.ltp}</strong></span>
                <span>Delta: <strong className="text-slate-200">{v9LiveAlgo.tradeSetup.delta > 0 ? `+${v9LiveAlgo.tradeSetup.delta}` : v9LiveAlgo.tradeSetup.delta}</strong></span>
                <span>Vega: <strong className="text-slate-200">₹{v9LiveAlgo.tradeSetup.vega}</strong></span>
              </div>
            </div>

            {/* ATR Execution Ladder */}
            <div className="space-y-1.5 text-xs bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <div className="flex items-center justify-between text-slate-300">
                <span>Entry Zone:</span>
                <span className="font-bold text-indigo-300">
                  ₹{v9LiveAlgo.tradeSetup.entryZone[0]} – ₹{v9LiveAlgo.tradeSetup.entryZone[1]}
                </span>
              </div>

              <div className="flex items-center justify-between text-rose-400">
                <span>Stop Loss (1.2x ATR):</span>
                <span className="font-bold">₹{v9LiveAlgo.tradeSetup.stopLoss} (-{v9LiveAlgo.tradeSetup.stopLossPct}%)</span>
              </div>

              <div className="flex items-center justify-between text-emerald-400">
                <span>Target 1 (1.5x ATR):</span>
                <span className="font-bold">₹{v9LiveAlgo.tradeSetup.target1} (+{v9LiveAlgo.tradeSetup.target1Pct}%)</span>
              </div>

              <div className="flex items-center justify-between text-emerald-300">
                <span>Target 2 (2.5x ATR):</span>
                <span className="font-bold">₹{v9LiveAlgo.tradeSetup.target2} (+{v9LiveAlgo.tradeSetup.target2Pct}%)</span>
              </div>

              <div className="flex items-center justify-between text-emerald-200">
                <span>Target 3 (4.0x ATR):</span>
                <span className="font-bold">₹{v9LiveAlgo.tradeSetup.target3} (+{v9LiveAlgo.tradeSetup.target3Pct}%)</span>
              </div>

              <div className="pt-1 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
                <span>Risk/Reward:</span>
                <span className="font-bold text-slate-200">{v9LiveAlgo.tradeSetup.riskReward}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <button
              onClick={() => onSelectStrikeForTrade && onSelectStrikeForTrade(v9LiveAlgo.tradeSetup)}
              disabled={v9LiveAlgo.verdict === 'NO_TRADE'}
              className={`w-full py-2.5 rounded-lg font-mono font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                v9LiveAlgo.verdict === 'CE_BUY'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/30'
                  : v9LiveAlgo.verdict === 'PE_BUY'
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>
                {v9LiveAlgo.verdict === 'CE_BUY'
                  ? `Execute ${v9LiveAlgo.tradeSetup.contractName}`
                  : v9LiveAlgo.verdict === 'PE_BUY'
                  ? `Execute ${v9LiveAlgo.tradeSetup.contractName}`
                  : 'Awaiting V1-V9 Alignment (No Trade)'}
              </span>
            </button>
          </div>
        </div>
      </div>
        </div>
      )}
    </div>
  );
};
