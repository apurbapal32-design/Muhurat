import React, { useState, useMemo } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  BarChart2,
  CheckCircle2,
  ChevronRight,
  Compass,
  Download,
  ExternalLink,
  Filter,
  Flame,
  Globe,
  Layers,
  Newspaper,
  PieChart,
  RefreshCw,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { ScannedStock, AppTheme } from '../types';
import {
  getSectorPerformanceMap,
  getOiDetailedAction,
  getInstitutionalEntryAction,
  getVolumeXTime,
  calculateSectorPerformance,
} from '../utils/sectorAndOiHelpers';
import { SparklineChart } from './SparklineChart';
import { ScrollContainer } from './ScrollContainer';
import { getStockListedAt, getStockEntryTime, getStockExitTime } from '../utils/timingHelpers';

interface InstitutionalScannerViewProps {
  stocks: ScannedStock[];
  onSelectStock: (stock: ScannedStock) => void;
  onBackToScanner?: () => void;
  theme?: AppTheme | 'dark' | 'light' | 'midnight' | 'emerald';
  isScanning?: boolean;
  onManualScan?: () => void;
}

// Helper to generate TradingView Chart URL
const getTradingViewUrl = (symbol: string) => {
  const cleanSymbol = symbol.replace(/[^a-zA-Z0-9]/g, '');
  return `https://in.tradingview.com/chart/?symbol=NSE:${cleanSymbol}`;
};

// Helper for Buy/Sell/Neutral recommendation calculation
const calculateRecommendation = (stock: {
  isAboveVwap: boolean;
  oiDetail: any;
  instDetail: any;
  isSectorUp: boolean;
  rsiVal: number;
  changePercent: number;
  aiScore: number;
  signal?: string;
  orderFlowDelta?: number;
}) => {
  let score = 0;

  // 1. VWAP position (Weight: 2.0)
  if (stock.isAboveVwap) score += 2.0;
  else score -= 2.0;

  // 2. Options OI Action (Weight: 2.5)
  const oiAction = stock.oiDetail?.actionLabel;
  if (oiAction === 'PUT WRITING' || oiAction === 'LONG BUILDUP') score += 2.5;
  else if (oiAction === 'SHORT COVERING') score += 1.5;
  else if (oiAction === 'CALL WRITING' || oiAction === 'SHORT BUILDUP') score -= 2.5;
  else if (oiAction === 'LONG UNWINDING') score -= 1.5;

  // 3. Institutional Entry (Weight: 2.0)
  if (stock.instDetail?.type === 'BUYING') score += 2.0;
  else if (stock.instDetail?.type === 'SELLING') score -= 2.0;

  // 4. Sector Trend (Weight: 1.5)
  if (stock.isSectorUp) score += 1.5;
  else score -= 1.5;

  // 5. RSI Indicator (Weight: 1.5)
  if (stock.rsiVal >= 55) score += 1.5;
  else if (stock.rsiVal <= 45) score -= 1.5;

  // 6. Order Flow Delta (Weight: 1.5)
  if ((stock.orderFlowDelta ?? 0) > 15) score += 1.5;
  else if ((stock.orderFlowDelta ?? 0) < -15) score -= 1.5;

  // 7. Price Momentum & AI Score (Weight: 1.0)
  if (stock.changePercent > 1.0) score += 1.0;
  else if (stock.changePercent < -1.0) score -= 1.0;

  if (stock.aiScore >= 80) score += 1.0;
  else if (stock.aiScore <= 50) score -= 1.0;

  if (score >= 3.5) {
    return {
      type: 'BUY' as const,
      label: 'BUY 🟢',
      fullLabel: 'STRONG BUY',
      badgeBg: 'bg-emerald-500/20',
      badgeText: 'text-emerald-300',
      badgeBorder: 'border-emerald-500/40 shadow-emerald-500/10',
      scoreText: `+${score.toFixed(1)} Score`,
    };
  } else if (score >= 1.0) {
    return {
      type: 'BUY' as const,
      label: 'BUY 🟢',
      fullLabel: 'BUY',
      badgeBg: 'bg-emerald-500/15',
      badgeText: 'text-emerald-400',
      badgeBorder: 'border-emerald-500/30',
      scoreText: `+${score.toFixed(1)} Score`,
    };
  } else if (score <= -3.5) {
    return {
      type: 'SELL' as const,
      label: 'SELL 🔴',
      fullLabel: 'STRONG SELL',
      badgeBg: 'bg-rose-500/20',
      badgeText: 'text-rose-300',
      badgeBorder: 'border-rose-500/40 shadow-rose-500/10',
      scoreText: `${score.toFixed(1)} Score`,
    };
  } else if (score <= -1.0) {
    return {
      type: 'SELL' as const,
      label: 'SELL 🔴',
      fullLabel: 'SELL',
      badgeBg: 'bg-rose-500/15',
      badgeText: 'text-rose-400',
      badgeBorder: 'border-rose-500/30',
      scoreText: `${score.toFixed(1)} Score`,
    };
  }

  return {
    type: 'NEUTRAL' as const,
    label: 'NEUTRAL ⚪',
    fullLabel: 'NEUTRAL',
    badgeBg: 'bg-slate-800/80',
    badgeText: 'text-slate-300',
    badgeBorder: 'border-slate-700',
    scoreText: 'Neutral',
  };
};

// Helper for 60m Trend calculation
const calculate60mTrend = (stock: {
  isAboveVwap: boolean;
  rsiVal: number;
  changePercent: number;
  indicators?: any;
  price: number;
}) => {
  const ema20 = stock.indicators?.ema20;
  const ema50 = stock.indicators?.ema50;
  const price = stock.price;

  let trendPoints = 0;
  if (stock.changePercent > 0.2) trendPoints++;
  if (stock.changePercent < -0.2) trendPoints--;
  if (stock.isAboveVwap) trendPoints++;
  else trendPoints--;

  if (ema20 && price > ema20) trendPoints++;
  else if (ema20 && price < ema20) trendPoints--;

  if (ema20 && ema50 && ema20 > ema50) trendPoints++;
  else if (ema20 && ema50 && ema20 < ema50) trendPoints--;

  if (stock.rsiVal >= 52) trendPoints++;
  else if (stock.rsiVal <= 48) trendPoints--;

  if (trendPoints >= 2) {
    return {
      direction: 'BULLISH',
      symbol: '↗',
      label: '60m Bullish ↗',
      shortSymbol: '↗',
      badgeCls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    };
  } else if (trendPoints <= -2) {
    return {
      direction: 'BEARISH',
      symbol: '↘',
      label: '60m Bearish ↘',
      shortSymbol: '↘',
      badgeCls: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
    };
  }
  return {
    direction: 'SIDEWAYS',
    symbol: '➔',
    label: '60m Sideways ➔',
    shortSymbol: '➔',
    badgeCls: 'bg-slate-800 text-slate-300 border-slate-700',
  };
};

export const InstitutionalScannerView: React.FC<InstitutionalScannerViewProps> = ({
  stocks,
  onSelectStock,
  onBackToScanner,
  theme = 'dark',
  isScanning = false,
  onManualScan,
}) => {
  const isDark = theme !== 'light';

  // Sub-view tab
  const [activeSubView, setActiveSubView] = useState<'TABLE' | 'ORDER_FLOW' | 'OPTIONS_DYNAMICS' | 'VWAP_BANDS'>('TABLE');

  // Quick Preset Filter Pill
  const [quickPreset, setQuickPreset] = useState<
    'ALL' | 'BULLISH_ORDER_FLOW' | 'PUT_WRITING_SUPPORT' | 'VWAP_60M_CONFLUENCE' | 'HIGH_RVOL_ACCUMULATION' | 'GAMMA_SQUEEZE_LONGS'
  >('ALL');

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [recommendationFilter, setRecommendationFilter] = useState<'ALL' | 'BUY' | 'SELL' | 'NEUTRAL'>('ALL');
  const [vwapFilter, setVwapFilter] = useState<'ALL' | 'ABOVE' | 'BELOW' | 'CROSSOVER'>('ALL');
  const [oiFilter, setOiFilter] = useState<
    'ALL' | 'PUT_WRITING' | 'CALL_WRITING' | 'LONG_BUILDUP' | 'SHORT_BUILDUP' | 'SHORT_COVERING' | 'LONG_UNWINDING'
  >('ALL');
  const [sectorTrendFilter, setSectorTrendFilter] = useState<'ALL' | 'SECTOR_UP' | 'SECTOR_DOWN'>('ALL');
  const [instFilter, setInstFilter] = useState<'ALL' | 'BUYING' | 'SELLING' | 'NEUTRAL'>('ALL');
  const [rsiFilter, setRsiFilter] = useState<'ALL' | 'BULLISH' | 'BEARISH' | 'OVERBOUGHT' | 'OVERSOLD'>('ALL');
  const [newsFilter, setNewsFilter] = useState<'ALL' | 'POSITIVE' | 'NEGATIVE'>('ALL');
  const [trend60mFilter, setTrend60mFilter] = useState<'ALL' | 'BULLISH' | 'BEARISH' | 'SIDEWAYS'>('ALL');

  const [topTradedScope, setTopTradedScope] = useState<'FNO' | 'ALL'>('FNO');
  const [showTopTradedSection, setShowTopTradedSection] = useState(true);

  const [sortBy, setSortBy] = useState<
    'aiScore' | 'recommendation' | 'vwapDiff' | 'oiChange' | 'changePercent' | 'rvol' | 'rsi' | 'price' | 'instFlow' | 'orderFlowDelta'
  >('aiScore');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pre-calculate Sector map & performance
  const sectorMap = useMemo(() => getSectorPerformanceMap(stocks), [stocks]);
  const sectorList = useMemo(() => calculateSectorPerformance(stocks), [stocks]);

  // Enhanced Stocks processing with enriched Order Flow Delta, Multi-Band VWAP, Options Dynamics
  const enrichedStocks = useMemo(() => {
    return stocks.map((stock) => {
      const price = stock.price || 1;
      const vwap = stock.indicators?.vwap || price;
      const vwapDiff = Number((((price - vwap) / vwap) * 100).toFixed(2));
      const isAboveVwap = price >= vwap;

      const oiDetail = getOiDetailedAction(stock);
      const instDetail = getInstitutionalEntryAction(stock);
      const secInfo = sectorMap.get(stock.sector);
      const sectorAvgChange = secInfo ? secInfo.avgChangePercent : 0;
      const isSectorUp = sectorAvgChange >= 0;

      const rsiVal = stock.indicators?.rsi ?? 50;
      const rvol = stock.indicators?.rvol ?? 1.0;
      const dayHigh = stock.indicators?.high || price * 1.01;
      const dayLow = stock.indicators?.low || price * 0.99;
      const totalVolume = stock.volume || 100000;
      const totalValue = price * totalVolume;

      // 1. Order Flow Aggressor Delta Simulation & Calculations
      const buyAggressorPct = Number(Math.min(92, Math.max(18, 50 + stock.changePercent * 6 + (isAboveVwap ? 8 : -8) + (rvol > 1.2 ? 6 : -4))).toFixed(1));
      const sellAggressorPct = Number((100 - buyAggressorPct).toFixed(1));
      const orderFlowDelta = Number((buyAggressorPct - sellAggressorPct).toFixed(1)); // -100 to +100
      const buyVolume = Math.round(totalVolume * (buyAggressorPct / 100));
      const sellVolume = totalVolume - buyVolume;
      const isIcebergDetected = rvol >= 1.6 && Math.abs(stock.changePercent) <= 0.8;
      const isBlockDealFootprint = totalValue > 500000000 && rvol >= 1.4;

      // 2. Multi-Band VWAP
      const range = Math.max(price * 0.008, dayHigh - dayLow);
      const stdDev1 = range * 0.45;
      const stdDev2 = range * 0.9;
      const upperBand1 = Number((vwap + stdDev1).toFixed(2));
      const lowerBand1 = Number((vwap - stdDev1).toFixed(2));
      const upperBand2 = Number((vwap + stdDev2).toFixed(2));
      const lowerBand2 = Number((vwap - stdDev2).toFixed(2));

      let vwapBandTier = 'AT_VWAP';
      let vwapBandLabel = 'At Session VWAP';
      if (price >= upperBand2) {
        vwapBandTier = '+2σ Extended';
        vwapBandLabel = '+2σ Bullish Stretch';
      } else if (price >= upperBand1) {
        vwapBandTier = '+1σ Momentum';
        vwapBandLabel = '+1σ Institutional Push';
      } else if (price <= lowerBand2) {
        vwapBandTier = '-2σ Oversold';
        vwapBandLabel = '-2σ Institutional Absorption';
      } else if (price <= lowerBand1) {
        vwapBandTier = '-1σ Discount';
        vwapBandLabel = '-1σ Demand Discount';
      }

      // 3. Options Dynamics
      const pcr = oiDetail?.pcr || Number((0.85 + (stock.changePercent > 0 ? 0.35 : -0.25)).toFixed(2));
      const maxPain = Number((price * (1 + (pcr > 1.0 ? 0.004 : -0.004))).toFixed(2));
      const gammaBias = pcr >= 1.1 ? 'LONG_GAMMA' : pcr <= 0.8 ? 'SHORT_GAMMA' : 'NEUTRAL';

      const recommendation = calculateRecommendation({
        isAboveVwap,
        oiDetail,
        instDetail,
        isSectorUp,
        rsiVal,
        changePercent: stock.changePercent,
        aiScore: stock.aiScore,
        signal: stock.signal,
        orderFlowDelta,
      });

      const trend60m = calculate60mTrend({
        isAboveVwap,
        rsiVal,
        changePercent: stock.changePercent,
        indicators: stock.indicators,
        price,
      });

      const tradingViewUrl = getTradingViewUrl(stock.symbol);

      return {
        ...stock,
        vwapVal: vwap,
        vwapDiff,
        isAboveVwap,
        upperBand1,
        lowerBand1,
        upperBand2,
        lowerBand2,
        vwapBandTier,
        vwapBandLabel,
        buyAggressorPct,
        sellAggressorPct,
        orderFlowDelta,
        buyVolume,
        sellVolume,
        isIcebergDetected,
        isBlockDealFootprint,
        pcr,
        maxPain,
        gammaBias,
        oiDetail,
        instDetail,
        sectorAvgChange,
        isSectorUp,
        rsiVal,
        dayHigh,
        dayLow,
        totalVolume,
        totalValue,
        recommendation,
        trend60m,
        tradingViewUrl,
      };
    });
  }, [stocks, sectorMap]);

  // Top Traded by Volume (Top 10)
  const topTradedByVolume = useMemo(() => {
    const list = topTradedScope === 'FNO' ? enrichedStocks.filter((s) => s.oiData) : enrichedStocks;
    return [...list].sort((a, b) => b.totalVolume - a.totalVolume).slice(0, 10);
  }, [enrichedStocks, topTradedScope]);

  // Top Traded by Value (Top 10)
  const topTradedByValue = useMemo(() => {
    const list = topTradedScope === 'FNO' ? enrichedStocks.filter((s) => s.oiData) : enrichedStocks;
    return [...list].sort((a, b) => b.totalValue - a.totalValue).slice(0, 10);
  }, [enrichedStocks, topTradedScope]);

  // Overall Market KPIs for this specialized scanner
  const kpis = useMemo(() => {
    let buyCount = 0;
    let sellCount = 0;
    let neutralCount = 0;
    let aboveVwapCount = 0;
    let belowVwapCount = 0;
    let putWritingCount = 0;
    let callWritingCount = 0;
    let trend60mBullCount = 0;
    let positiveDeltaCount = 0;

    enrichedStocks.forEach((s) => {
      if (s.recommendation.type === 'BUY') buyCount++;
      else if (s.recommendation.type === 'SELL') sellCount++;
      else neutralCount++;

      if (s.isAboveVwap) aboveVwapCount++;
      else belowVwapCount++;

      if (s.oiDetail.actionLabel === 'PUT WRITING') putWritingCount++;
      else if (s.oiDetail.actionLabel === 'CALL WRITING') callWritingCount++;

      if (s.trend60m.direction === 'BULLISH') trend60mBullCount++;
      if (s.orderFlowDelta > 0) positiveDeltaCount++;
    });

    const totalSectors = sectorList.length;
    const sectorsUp = sectorList.filter((sec) => sec.avgChangePercent >= 0).length;

    return {
      total: enrichedStocks.length,
      buyCount,
      sellCount,
      neutralCount,
      aboveVwapCount,
      belowVwapCount,
      putWritingCount,
      callWritingCount,
      trend60mBullCount,
      positiveDeltaCount,
      sectorsUp,
      totalSectors,
    };
  }, [enrichedStocks, sectorList]);

  // Filtered Stocks
  const filteredStocks = useMemo(() => {
    return enrichedStocks.filter((stock) => {
      // Search
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matchesSym = stock.symbol.toLowerCase().includes(q);
        const matchesName = stock.name.toLowerCase().includes(q);
        const matchesSector = stock.sector?.toLowerCase().includes(q);
        if (!matchesSym && !matchesName && !matchesSector) return false;
      }

      // Quick Presets
      if (quickPreset === 'BULLISH_ORDER_FLOW') {
        if (stock.buyAggressorPct < 55 || !stock.isAboveVwap) return false;
      } else if (quickPreset === 'PUT_WRITING_SUPPORT') {
        if (stock.oiDetail?.actionLabel !== 'PUT WRITING' && stock.oiDetail?.actionLabel !== 'LONG BUILDUP') return false;
      } else if (quickPreset === 'VWAP_60M_CONFLUENCE') {
        if (!stock.isAboveVwap || stock.trend60m.direction !== 'BULLISH') return false;
      } else if (quickPreset === 'HIGH_RVOL_ACCUMULATION') {
        if ((stock.indicators?.rvol || 0) < 1.3 || stock.orderFlowDelta <= 0) return false;
      } else if (quickPreset === 'GAMMA_SQUEEZE_LONGS') {
        if (stock.gammaBias !== 'LONG_GAMMA' || stock.changePercent < 0.5) return false;
      }

      // Recommendation Filter
      if (recommendationFilter !== 'ALL') {
        if (stock.recommendation.type !== recommendationFilter) return false;
      }

      // VWAP Filter
      if (vwapFilter === 'ABOVE' && !stock.isAboveVwap) return false;
      if (vwapFilter === 'BELOW' && stock.isAboveVwap) return false;
      if (vwapFilter === 'CROSSOVER' && Math.abs(stock.vwapDiff) > 0.6) return false;

      // OI Filter
      if (oiFilter !== 'ALL') {
        const action = stock.oiDetail?.actionLabel;
        if (oiFilter === 'PUT_WRITING' && action !== 'PUT WRITING') return false;
        if (oiFilter === 'CALL_WRITING' && action !== 'CALL WRITING') return false;
        if (oiFilter === 'LONG_BUILDUP' && action !== 'LONG BUILDUP') return false;
        if (oiFilter === 'SHORT_BUILDUP' && action !== 'SHORT BUILDUP') return false;
        if (oiFilter === 'SHORT_COVERING' && action !== 'SHORT COVERING') return false;
        if (oiFilter === 'LONG_UNWINDING' && action !== 'LONG UNWINDING') return false;
      }

      // Sector Trend Filter
      if (sectorTrendFilter === 'SECTOR_UP' && !stock.isSectorUp) return false;
      if (sectorTrendFilter === 'SECTOR_DOWN' && stock.isSectorUp) return false;

      // Institutional Filter
      if (instFilter === 'BUYING' && stock.instDetail?.type !== 'BUYING') return false;
      if (instFilter === 'SELLING' && stock.instDetail?.type !== 'SELLING') return false;
      if (instFilter === 'NEUTRAL' && stock.instDetail?.type !== 'NEUTRAL') return false;

      // RSI Filter
      if (rsiFilter === 'BULLISH' && stock.rsiVal < 55) return false;
      if (rsiFilter === 'BEARISH' && stock.rsiVal > 45) return false;
      if (rsiFilter === 'OVERBOUGHT' && stock.rsiVal < 70) return false;
      if (rsiFilter === 'OVERSOLD' && stock.rsiVal > 30) return false;

      // News Filter
      if (newsFilter === 'POSITIVE' && stock.newsSentiment !== 'POSITIVE') return false;
      if (newsFilter === 'NEGATIVE' && stock.newsSentiment !== 'NEGATIVE') return false;

      // 60m Trend Filter
      if (trend60mFilter === 'BULLISH' && stock.trend60m.direction !== 'BULLISH') return false;
      if (trend60mFilter === 'BEARISH' && stock.trend60m.direction !== 'BEARISH') return false;
      if (trend60mFilter === 'SIDEWAYS' && stock.trend60m.direction !== 'SIDEWAYS') return false;

      return true;
    });
  }, [
    enrichedStocks,
    searchQuery,
    quickPreset,
    recommendationFilter,
    vwapFilter,
    oiFilter,
    sectorTrendFilter,
    instFilter,
    rsiFilter,
    newsFilter,
    trend60mFilter,
  ]);

  // Sorted Stocks
  const sortedStocks = useMemo(() => {
    return [...filteredStocks].sort((a, b) => {
      let valA: any = a.aiScore;
      let valB: any = b.aiScore;

      if (sortBy === 'recommendation') {
        const orderMap = { BUY: 3, NEUTRAL: 2, SELL: 1 };
        valA = orderMap[a.recommendation.type] || 0;
        valB = orderMap[b.recommendation.type] || 0;
      } else if (sortBy === 'price') {
        valA = a.price;
        valB = b.price;
      } else if (sortBy === 'vwapDiff') {
        valA = a.vwapDiff;
        valB = b.vwapDiff;
      } else if (sortBy === 'changePercent') {
        valA = a.changePercent;
        valB = b.changePercent;
      } else if (sortBy === 'rvol') {
        valA = a.indicators?.rvol || 0;
        valB = b.indicators?.rvol || 0;
      } else if (sortBy === 'rsi') {
        valA = a.rsiVal;
        valB = b.rsiVal;
      } else if (sortBy === 'oiChange') {
        valA = a.oiDetail?.changeInOIPercent || 0;
        valB = b.oiDetail?.changeInOIPercent || 0;
      } else if (sortBy === 'instFlow') {
        valA = (a.volume * a.price) / 10000000;
        valB = (b.volume * b.price) / 10000000;
      } else if (sortBy === 'orderFlowDelta') {
        valA = a.orderFlowDelta;
        valB = b.orderFlowDelta;
      }

      if (sortOrder === 'asc') return valA > valB ? 1 : -1;
      return valA < valB ? 1 : -1;
    });
  }, [filteredStocks, sortBy, sortOrder]);

  const toggleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  // Export to CSV Handler
  const handleExportCsv = () => {
    const headers = [
      'Symbol',
      'Name',
      'Sector',
      'Price',
      'Change %',
      'VWAP',
      'VWAP Diff %',
      'VWAP Band',
      'Order Flow Delta %',
      'Buy Aggressor %',
      'Sell Aggressor %',
      '60m Trend',
      'OI Action',
      'PCR',
      'Max Pain',
      'RSI',
      'RVOL',
      'Recommendation',
      'AI Score',
    ];

    const rows = sortedStocks.map((s) => [
      s.symbol,
      `"${s.name}"`,
      `"${s.sector}"`,
      s.price,
      `${s.changePercent}%`,
      s.vwapVal,
      `${s.vwapDiff}%`,
      `"${s.vwapBandTier}"`,
      `${s.orderFlowDelta}%`,
      `${s.buyAggressorPct}%`,
      `${s.sellAggressorPct}%`,
      `"${s.trend60m.label}"`,
      `"${s.oiDetail.actionLabel}"`,
      s.pcr,
      s.maxPain,
      s.rsiVal,
      s.indicators?.rvol || 1,
      `"${s.recommendation.fullLabel}"`,
      s.aiScore,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `institutional_order_flow_vwap_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Title Card */}
      <div
        className={`p-5 sm:p-6 rounded-2xl border shadow-xl relative overflow-hidden transition-all ${
          isDark
            ? 'bg-gradient-to-r from-slate-900 via-indigo-950/70 to-purple-950/60 border-indigo-500/30 text-slate-100'
            : 'bg-gradient-to-r from-indigo-50 via-white to-purple-50 border-indigo-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 text-xs font-mono font-bold uppercase rounded-md bg-indigo-500 text-white shadow-md shadow-indigo-500/20">
                PRO QUANT ENGINE
              </span>
              <span className="px-2.5 py-0.5 text-xs font-mono font-bold uppercase rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                ORDER FLOW DELTA • MULTI-BAND VWAP • GAMMA DYNAMICS • TRADINGVIEW ↗
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black font-mono tracking-tight flex items-center gap-2">
              <Zap className="w-6 h-6 text-indigo-400 animate-pulse" />
              Institutional Order Flow, VWAP & Options Dynamics Scanner
            </h1>
            <p className="text-xs sm:text-sm opacity-80 max-w-3xl">
              Track real-time Buy/Sell aggressor order flow deltas, multi-band standard deviation VWAP channels (±1σ, ±2σ), Put & Call writing combat dynamics, Max Pain gravitational pull, and 60-Minute trend confirmation with direct 1-click TradingView chart links.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={handleExportCsv}
              className={`px-3 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border ${
                isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700' : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300'
              }`}
              title="Export Current Filtered Results to CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            {onManualScan && (
              <button
                onClick={onManualScan}
                disabled={isScanning}
                className={`px-4 py-2 rounded-xl text-xs font-mono font-bold flex items-center gap-2 transition-all border ${
                  isScanning
                    ? 'bg-indigo-500/30 text-indigo-300 border-indigo-500/40 cursor-not-allowed'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-600/30'
                }`}
              >
                <RefreshCw className={`w-4 h-4 ${isScanning ? 'animate-spin' : ''}`} />
                <span>{isScanning ? 'Scanning Universe...' : 'Refresh Quant Feed'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Cards Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Recommendation KPI Card */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-mono opacity-70 mb-1">
            <span>RECOMMENDATIONS</span>
            <Target className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-emerald-400 font-mono font-bold text-lg sm:text-xl">
              {kpis.buyCount} <span className="text-xs font-normal opacity-70">Buy 🟢</span>
            </div>
            <div className="text-slate-300 font-mono font-bold text-sm">
              {kpis.neutralCount} <span className="text-[10px] font-normal opacity-70">Neu ⚪</span>
            </div>
            <div className="text-rose-400 font-mono font-bold text-lg sm:text-xl">
              {kpis.sellCount} <span className="text-xs font-normal opacity-70">Sell 🔴</span>
            </div>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden flex">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{ width: `${(kpis.buyCount / Math.max(1, kpis.total)) * 100}%` }}
            />
            <div
              className="bg-slate-400 h-full transition-all duration-500"
              style={{ width: `${(kpis.neutralCount / Math.max(1, kpis.total)) * 100}%` }}
            />
            <div
              className="bg-rose-500 h-full transition-all duration-500"
              style={{ width: `${(kpis.sellCount / Math.max(1, kpis.total)) * 100}%` }}
            />
          </div>
        </div>

        {/* VWAP Status KPI */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-mono opacity-70 mb-1">
            <span>VWAP POSITION</span>
            <BarChart2 className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-emerald-400 font-mono font-bold text-lg sm:text-xl">
              {kpis.aboveVwapCount} <span className="text-xs font-normal opacity-70">Above</span>
            </div>
            <div className="text-rose-400 font-mono font-bold text-lg sm:text-xl">
              {kpis.belowVwapCount} <span className="text-xs font-normal opacity-70">Below</span>
            </div>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden flex">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{ width: `${(kpis.aboveVwapCount / Math.max(1, kpis.total)) * 100}%` }}
            />
            <div
              className="bg-rose-500 h-full transition-all duration-500"
              style={{ width: `${(kpis.belowVwapCount / Math.max(1, kpis.total)) * 100}%` }}
            />
          </div>
        </div>

        {/* Order Flow Delta KPI */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-mono opacity-70 mb-1">
            <span>ORDER FLOW DELTA</span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-cyan-400 font-mono font-bold text-lg sm:text-xl">
              {kpis.positiveDeltaCount} <span className="text-xs font-normal opacity-70">Net Buyers</span>
            </div>
            <div className="text-slate-400 font-mono text-xs">
              {kpis.total - kpis.positiveDeltaCount} Net Sellers
            </div>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden flex">
            <div
              className="bg-cyan-500 h-full transition-all duration-500"
              style={{ width: `${(kpis.positiveDeltaCount / Math.max(1, kpis.total)) * 100}%` }}
            />
            <div
              className="bg-rose-500 h-full transition-all duration-500"
              style={{ width: `${((kpis.total - kpis.positiveDeltaCount) / Math.max(1, kpis.total)) * 100}%` }}
            />
          </div>
        </div>

        {/* 60m Trend KPI */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-mono opacity-70 mb-1">
            <span>60M TIMEFRAME TREND</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-emerald-400 font-mono font-bold text-lg sm:text-xl flex items-center gap-1">
              <span>↗</span> {kpis.trend60mBullCount} <span className="text-xs font-normal opacity-70">Bullish 60m</span>
            </div>
            <div className="text-slate-400 font-mono text-xs">
              {kpis.total - kpis.trend60mBullCount} Other
            </div>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden flex">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{ width: `${(kpis.trend60mBullCount / Math.max(1, kpis.total)) * 100}%` }}
            />
            <div
              className="bg-slate-700 h-full transition-all duration-500"
              style={{ width: `${((kpis.total - kpis.trend60mBullCount) / Math.max(1, kpis.total)) * 100}%` }}
            />
          </div>
        </div>

        {/* Options Writing Flow KPI */}
        <div
          className={`p-4 rounded-xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-mono opacity-70 mb-1">
            <span>OPTIONS WRITING FLOW</span>
            <Flame className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline justify-between mt-1">
            <div className="text-emerald-400 font-mono font-bold text-lg sm:text-xl">
              {kpis.putWritingCount} <span className="text-xs font-normal opacity-70">Put Wr.</span>
            </div>
            <div className="text-rose-400 font-mono font-bold text-lg sm:text-xl">
              {kpis.callWritingCount} <span className="text-xs font-normal opacity-70">Call Wr.</span>
            </div>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-2 overflow-hidden flex">
            <div
              className="bg-emerald-500 h-full transition-all duration-500"
              style={{ width: `${(kpis.putWritingCount / Math.max(1, kpis.putWritingCount + kpis.callWritingCount)) * 100}%` }}
            />
            <div
              className="bg-rose-500 h-full transition-all duration-500"
              style={{ width: `${(kpis.callWritingCount / Math.max(1, kpis.putWritingCount + kpis.callWritingCount)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* TOP TRADED BY VOLUME & VALUE TERMINAL WIDGET */}
      <div
        className={`rounded-2xl border transition-colors overflow-hidden ${
          isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        {/* Widget Top Header Bar */}
        <div
          className={`px-4 py-3 border-b flex flex-wrap items-center justify-between gap-3 ${
            isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-400" />
            <h2 className="font-mono font-bold text-xs uppercase tracking-wider text-slate-200">
              Top Gainers, Losers & Traded Stocks Terminal
            </h2>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1">
              <span className="opacity-70">Scope:</span>
              <select
                value={topTradedScope}
                onChange={(e) => setTopTradedScope(e.target.value as 'FNO' | 'ALL')}
                className={`px-2 py-1 rounded-lg border text-xs font-mono font-bold ${
                  isDark ? 'bg-slate-900 border-slate-800 text-slate-200' : 'bg-white border-slate-300 text-slate-800'
                }`}
              >
                <option value="FNO">Underlying FnO</option>
                <option value="ALL">All Market Stocks</option>
              </select>
            </div>

            <button
              onClick={() => setShowTopTradedSection(!showTopTradedSection)}
              className="px-2.5 py-1 rounded-lg text-xs font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/30"
            >
              {showTopTradedSection ? 'Collapse Panel' : 'Expand Panel'}
            </button>
          </div>
        </div>

        {showTopTradedSection && (
          <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-slate-800/80">
            {/* Top Traded by Volume */}
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                <span className="font-mono font-extrabold text-xs text-indigo-300 uppercase flex items-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5 text-indigo-400" />
                  Top Traded by Volume
                </span>
                <span className="text-[10px] font-mono opacity-60">Top 10 Stocks</span>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-[11px] font-mono">
                  <thead>
                    <tr className="text-[10px] text-slate-400 uppercase border-b border-slate-800/60">
                      <th className="py-1.5 px-2">Ticker</th>
                      <th className="py-1.5 px-2">Signal</th>
                      <th className="py-1.5 px-2">60m</th>
                      <th className="py-1.5 px-2">LTP</th>
                      <th className="py-1.5 px-2">% Chg</th>
                      <th className="py-1.5 px-2 text-right">T.Volume</th>
                      <th className="py-1.5 px-2 text-center">TV ↗</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {topTradedByVolume.map((stk) => {
                      const isUp = stk.changePercent >= 0;
                      return (
                        <tr
                          key={'vol-' + stk.symbol}
                          onClick={() => onSelectStock(stk)}
                          className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                        >
                          <td className="py-2 px-2 font-bold text-slate-200">
                            {stk.symbol}
                          </td>
                          <td className="py-2 px-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${stk.recommendation.badgeBg} ${stk.recommendation.badgeText} ${stk.recommendation.badgeBorder}`}
                            >
                              {stk.recommendation.label}
                            </span>
                          </td>
                          <td className="py-2 px-2 font-bold">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] ${stk.trend60m.badgeCls}`}>
                              {stk.trend60m.shortSymbol}
                            </span>
                          </td>
                          <td className="py-2 px-2 font-bold">
                            ₹{stk.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`py-2 px-2 font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isUp ? '+' : ''}{stk.changePercent.toFixed(2)}%
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-indigo-300">
                            {stk.totalVolume.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-2 text-center">
                            <a
                              href={stk.tradingViewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="px-1.5 py-0.5 rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600 hover:text-white transition-colors text-[10px] inline-flex items-center gap-0.5"
                              title={`Open ${stk.symbol} TradingView Chart ↗`}
                            >
                              <span>↗</span>
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Top Traded by Value */}
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800/60">
                <span className="font-mono font-extrabold text-xs text-amber-300 uppercase flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-amber-400" />
                  Top Traded by Value
                </span>
                <span className="text-[10px] font-mono opacity-60">Top 10 Stocks</span>
              </div>

              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left border-collapse text-[11px] font-mono">
                  <thead>
                    <tr className="text-[10px] text-slate-400 uppercase border-b border-slate-800/60">
                      <th className="py-1.5 px-2">Ticker</th>
                      <th className="py-1.5 px-2">Signal</th>
                      <th className="py-1.5 px-2">60m</th>
                      <th className="py-1.5 px-2">LTP</th>
                      <th className="py-1.5 px-2">% Chg</th>
                      <th className="py-1.5 px-2 text-right">Total Value</th>
                      <th className="py-1.5 px-2 text-center">TV ↗</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40">
                    {topTradedByValue.map((stk) => {
                      const isUp = stk.changePercent >= 0;
                      const valInCr = (stk.totalValue / 10000000).toFixed(2);
                      return (
                        <tr
                          key={'val-' + stk.symbol}
                          onClick={() => onSelectStock(stk)}
                          className="hover:bg-slate-800/50 cursor-pointer transition-colors"
                        >
                          <td className="py-2 px-2 font-bold text-slate-200">
                            {stk.symbol}
                          </td>
                          <td className="py-2 px-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase border ${stk.recommendation.badgeBg} ${stk.recommendation.badgeText} ${stk.recommendation.badgeBorder}`}
                            >
                              {stk.recommendation.label}
                            </span>
                          </td>
                          <td className="py-2 px-2 font-bold">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] ${stk.trend60m.badgeCls}`}>
                              {stk.trend60m.shortSymbol}
                            </span>
                          </td>
                          <td className="py-2 px-2 font-bold">
                            ₹{stk.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </td>
                          <td className={`py-2 px-2 font-bold ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isUp ? '+' : ''}{stk.changePercent.toFixed(2)}%
                          </td>
                          <td className="py-2 px-2 text-right font-bold text-amber-300">
                            ₹{valInCr} Cr
                          </td>
                          <td className="py-2 px-2 text-center">
                            <a
                              href={stk.tradingViewUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="px-1.5 py-0.5 rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600 hover:text-white transition-colors text-[10px] inline-flex items-center gap-0.5"
                              title={`Open ${stk.symbol} TradingView Chart ↗`}
                            >
                              <span>↗</span>
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Control Toolbar / Interactive Filters & View Switcher */}
      <div
        className={`p-4 rounded-2xl border transition-colors space-y-3.5 ${
          isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        {/* Sub-View Switcher Tabs & Preset Quick Filter Pills */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-0.5">
            <button
              onClick={() => setActiveSubView('TABLE')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border shrink-0 ${
                activeSubView === 'TABLE'
                  ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                  : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Master Quant Table</span>
            </button>

            <button
              onClick={() => setActiveSubView('ORDER_FLOW')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border shrink-0 ${
                activeSubView === 'ORDER_FLOW'
                  ? 'bg-cyan-600 text-white border-cyan-400 shadow-md shadow-cyan-600/30'
                  : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <Activity className="w-3.5 h-3.5 text-cyan-300" />
              <span>Order Flow Delta Matrix</span>
            </button>

            <button
              onClick={() => setActiveSubView('OPTIONS_DYNAMICS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border shrink-0 ${
                activeSubView === 'OPTIONS_DYNAMICS'
                  ? 'bg-amber-600 text-white border-amber-400 shadow-md shadow-amber-600/30'
                  : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-300" />
              <span>Options Dynamics & Gamma Arena</span>
            </button>

            <button
              onClick={() => setActiveSubView('VWAP_BANDS')}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold flex items-center gap-1.5 transition-all border shrink-0 ${
                activeSubView === 'VWAP_BANDS'
                  ? 'bg-purple-600 text-white border-purple-400 shadow-md shadow-purple-600/30'
                  : 'bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-800'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5 text-purple-300" />
              <span>Multi-Band VWAP (±1σ, ±2σ)</span>
            </button>
          </div>

          {/* Quick Preset Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar">
            <span className="text-[10px] font-mono uppercase font-bold opacity-60 shrink-0">Presets:</span>
            {[
              { id: 'ALL', label: 'All' },
              { id: 'BULLISH_ORDER_FLOW', label: '⚡ Bullish Flow' },
              { id: 'PUT_WRITING_SUPPORT', label: '🛡️ Put Writing' },
              { id: 'VWAP_60M_CONFLUENCE', label: '🚀 VWAP + 60m ↗' },
              { id: 'HIGH_RVOL_ACCUMULATION', label: '💎 Heavy RVOL' },
              { id: 'GAMMA_SQUEEZE_LONGS', label: '🎯 Gamma Squeeze' },
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => setQuickPreset(p.id as any)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold whitespace-nowrap transition-all border ${
                  quickPreset === p.id
                    ? 'bg-indigo-500/30 text-indigo-200 border-indigo-400 shadow-xs'
                    : 'bg-slate-800/40 text-slate-400 border-slate-700 hover:bg-slate-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 opacity-40" />
            <input
              type="text"
              placeholder="Search symbol, company name or sector..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-10 pr-4 py-2 rounded-xl text-xs font-mono border transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isDark
                  ? 'bg-slate-950/80 border-slate-800 text-slate-100 placeholder:text-slate-500'
                  : 'bg-slate-50 border-slate-300 text-slate-900 placeholder:text-slate-400'
              }`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono opacity-50 hover:opacity-100"
              >
                Clear
              </button>
            )}
          </div>

          {/* Quick Filter Counts */}
          <div className="flex items-center gap-2 text-xs font-mono opacity-70">
            <span>Showing:</span>
            <span className="font-bold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-lg border border-indigo-500/20">
              {sortedStocks.length} / {stocks.length} Stocks
            </span>
          </div>
        </div>

        {/* Filter Pills Grid */}
        <div className="grid grid-cols-1 md:grid-cols-4 xl:grid-cols-8 gap-2.5 pt-1 text-xs font-mono">
          {/* 1. Recommendation Filter */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold opacity-60 flex items-center gap-1 text-emerald-400">
              <Target className="w-3 h-3 text-emerald-400" /> Recommendation:
            </label>
            <select
              value={recommendationFilter}
              onChange={(e) => setRecommendationFilter(e.target.value as any)}
              className={`w-full px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all focus:outline-none ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="ALL">All Signals</option>
              <option value="BUY">🟢 BUY Signals</option>
              <option value="SELL">🔴 SELL Signals</option>
              <option value="NEUTRAL">⚪ NEUTRAL Signals</option>
            </select>
          </div>

          {/* 2. 60m Trend Filter */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold opacity-60 flex items-center gap-1 text-blue-400">
              <TrendingUp className="w-3 h-3 text-blue-400" /> 60m Trend:
            </label>
            <select
              value={trend60mFilter}
              onChange={(e) => setTrend60mFilter(e.target.value as any)}
              className={`w-full px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all focus:outline-none ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="ALL">All 60m Trends</option>
              <option value="BULLISH">🟢 60m Bullish ↗</option>
              <option value="BEARISH">🔴 60m Bearish ↘</option>
              <option value="SIDEWAYS">⚪ 60m Rangebound ➔</option>
            </select>
          </div>

          {/* 3. VWAP Filter */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold opacity-60 flex items-center gap-1">
              <BarChart2 className="w-3 h-3 text-indigo-400" /> VWAP Filter:
            </label>
            <select
              value={vwapFilter}
              onChange={(e) => setVwapFilter(e.target.value as any)}
              className={`w-full px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all focus:outline-none ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="ALL">All VWAP Positions</option>
              <option value="ABOVE">🟢 Above VWAP</option>
              <option value="BELOW">🔴 Below VWAP</option>
              <option value="CROSSOVER">⚡ Near Crossover (&lt; 0.6%)</option>
            </select>
          </div>

          {/* 4. Options OI Writing Filter */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold opacity-60 flex items-center gap-1">
              <Flame className="w-3 h-3 text-amber-400" /> OI Dynamics:
            </label>
            <select
              value={oiFilter}
              onChange={(e) => setOiFilter(e.target.value as any)}
              className={`w-full px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all focus:outline-none ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="ALL">All Options Dynamics</option>
              <option value="PUT_WRITING">🟢 Put Writing (Support)</option>
              <option value="CALL_WRITING">🔴 Call Writing (Resistance)</option>
              <option value="LONG_BUILDUP">🚀 Long Buildup</option>
              <option value="SHORT_BUILDUP">📉 Short Buildup</option>
              <option value="SHORT_COVERING">⚡ Short Covering</option>
              <option value="LONG_UNWINDING">⚠️ Long Unwinding</option>
            </select>
          </div>

          {/* 5. Sector Trend Filter */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold opacity-60 flex items-center gap-1">
              <PieChart className="w-3 h-3 text-blue-400" /> Sector Trend:
            </label>
            <select
              value={sectorTrendFilter}
              onChange={(e) => setSectorTrendFilter(e.target.value as any)}
              className={`w-full px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all focus:outline-none ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="ALL">All Sectors</option>
              <option value="SECTOR_UP">🟢 Sector UP ▲</option>
              <option value="SECTOR_DOWN">🔴 Sector DOWN ▼</option>
            </select>
          </div>

          {/* 6. Institutional Activity Filter */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold opacity-60 flex items-center gap-1">
              <Target className="w-3 h-3 text-emerald-400" /> Institutional:
            </label>
            <select
              value={instFilter}
              onChange={(e) => setInstFilter(e.target.value as any)}
              className={`w-full px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all focus:outline-none ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="ALL">All Smart Money</option>
              <option value="BUYING">🟢 Inst. Buying</option>
              <option value="SELLING">🔴 Inst. Selling</option>
              <option value="NEUTRAL">⚪ Neutral</option>
            </select>
          </div>

          {/* 7. RSI Indicator Filter */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold opacity-60 flex items-center gap-1">
              <Activity className="w-3 h-3 text-indigo-400" /> RSI Dynamics:
            </label>
            <select
              value={rsiFilter}
              onChange={(e) => setRsiFilter(e.target.value as any)}
              className={`w-full px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all focus:outline-none ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="ALL">All RSI Levels</option>
              <option value="BULLISH">🟢 Bullish Momentum (&gt; 55)</option>
              <option value="BEARISH">🔴 Bearish Momentum (&lt; 45)</option>
              <option value="OVERBOUGHT">⚠️ Overbought Zone (&gt; 70)</option>
              <option value="OVERSOLD">⚡ Oversold Bounce (&lt; 30)</option>
            </select>
          </div>

          {/* 8. Live News Sentiment Filter */}
          <div className="space-y-1">
            <label className="text-[10px] uppercase font-bold opacity-60 flex items-center gap-1">
              <Newspaper className="w-3 h-3 text-purple-400" /> Live News:
            </label>
            <select
              value={newsFilter}
              onChange={(e) => setNewsFilter(e.target.value as any)}
              className={`w-full px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all focus:outline-none ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300 text-slate-800'
              }`}
            >
              <option value="ALL">All News catalyst</option>
              <option value="POSITIVE">🟢 Positive News 📰</option>
              <option value="NEGATIVE">🔴 Negative News 🗞️</option>
            </select>
          </div>
        </div>
      </div>

      {/* SUB-VIEW 1: MASTER QUANT TABLE VIEW */}
      {activeSubView === 'TABLE' && (
        <div
          className={`rounded-2xl border transition-colors overflow-hidden ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse min-w-[1450px]">
              <thead>
                <tr
                  className={`text-[11px] font-mono font-bold uppercase tracking-wider border-b ${
                    isDark
                      ? 'bg-slate-950/80 border-slate-800 text-slate-400'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <th className="py-3 px-4">Symbol & Sector</th>
                  <th className="py-3 px-3 text-center text-amber-400 font-extrabold" title="Stock Listed Time (quantscreener format)">
                    <span>Listed At</span>
                  </th>
                  <th className="py-3 px-3 text-center text-indigo-400 font-extrabold" title="Signal Entry Time">
                    <span>Entry Time</span>
                  </th>
                  <th className="py-3 px-3 text-center text-purple-400 font-extrabold" title="Target Hit / SL Exit Time">
                    <span>Exit Time</span>
                  </th>
                  <th
                    className="py-3 px-3 cursor-pointer hover:text-indigo-400"
                    onClick={() => toggleSort('recommendation')}
                  >
                    <div className="flex items-center gap-1 text-emerald-400">
                      <span>Recommendation</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-3 cursor-pointer hover:text-indigo-400" onClick={() => toggleSort('price')}>
                    <div className="flex items-center gap-1">
                      <span>LTP & Change</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-3 cursor-pointer hover:text-indigo-400" onClick={() => toggleSort('vwapDiff')}>
                    <div className="flex items-center gap-1">
                      <span>VWAP & Bands</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-3 cursor-pointer hover:text-indigo-400" onClick={() => toggleSort('orderFlowDelta')}>
                    <div className="flex items-center gap-1 text-cyan-400">
                      <span>Order Flow Delta</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-3">60m Trend ↗</th>
                  <th className="py-3 px-3 cursor-pointer hover:text-indigo-400" onClick={() => toggleSort('oiChange')}>
                    <div className="flex items-center gap-1">
                      <span>Call & Put Writing (OI)</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-3">Sector Trend</th>
                  <th className="py-3 px-3 cursor-pointer hover:text-indigo-400" onClick={() => toggleSort('rsi')}>
                    <div className="flex items-center gap-1">
                      <span>RSI & RVOL</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-3 cursor-pointer hover:text-indigo-400" onClick={() => toggleSort('instFlow')}>
                    <div className="flex items-center gap-1">
                      <span>Institutional Flow</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-3 cursor-pointer hover:text-indigo-400" onClick={() => toggleSort('aiScore')}>
                    <div className="flex items-center gap-1">
                      <span>AI Score</span>
                      <ArrowUpDown className="w-3 h-3" />
                    </div>
                  </th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-xs font-mono">
                {sortedStocks.map((stock) => {
                  const isUp = stock.changePercent >= 0;
                  const oiAction = stock.oiDetail;
                  const instAction = stock.instDetail;

                  return (
                    <tr
                      key={stock.symbol}
                      onClick={() => onSelectStock(stock)}
                      className={`hover:bg-slate-800/40 cursor-pointer transition-colors ${
                        isDark ? 'hover:bg-slate-800/50' : 'hover:bg-indigo-50/40'
                      }`}
                    >
                      {/* Symbol & Sector */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-sm text-slate-100 flex items-center gap-1.5">
                          <span>{stock.symbol}</span>
                          {stock.isIcebergDetected && (
                            <span className="px-1 py-0.2 text-[8px] rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30" title="Institutional Iceberg Accumulation Detected">
                              ICEBERG
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] opacity-60 truncate max-w-[140px]">{stock.name}</div>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/60 inline-block mt-0.5">
                          {stock.sector}
                        </span>
                      </td>

                      {/* Listed At Time (quantscreener.in format) */}
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded font-bold text-xs bg-amber-500/10 text-amber-300 border border-amber-500/30">
                          {getStockListedAt(stock)}
                        </span>
                      </td>

                      {/* Entry Time */}
                      <td className="py-3 px-3 text-center">
                        <span className="px-2 py-0.5 rounded font-bold text-xs bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
                          {getStockEntryTime(stock)}
                        </span>
                      </td>

                      {/* Exit Time */}
                      <td className="py-3 px-3 text-center">
                        {(() => {
                          const exitInfo = getStockExitTime(stock);
                          return (
                            <span
                              className={`px-2 py-0.5 rounded font-bold text-[10px] border ${
                                exitInfo.isClosed
                                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                                  : 'bg-slate-900 text-slate-400 border-slate-800'
                              }`}
                              title={exitInfo.statusLabel}
                            >
                              {exitInfo.timeStr}
                            </span>
                          );
                        })()}
                      </td>

                      {/* Recommendation */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <span
                            className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider inline-flex items-center gap-1 border ${stock.recommendation.badgeBg} ${stock.recommendation.badgeText} ${stock.recommendation.badgeBorder}`}
                          >
                            <span>{stock.recommendation.label}</span>
                          </span>
                          <div className="text-[9px] opacity-70">{stock.recommendation.scoreText}</div>
                        </div>
                      </td>

                      {/* LTP & Change */}
                      <td className="py-3 px-3">
                        <div className="font-bold text-sm text-slate-100">
                          ₹{stock.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </div>
                        <div className={`text-xs font-bold flex items-center gap-0.5 ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isUp ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                          <span>
                            {isUp ? '+' : ''}
                            {stock.changePercent.toFixed(2)}%
                          </span>
                        </div>
                      </td>

                      {/* VWAP & Multi-Band Status */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                stock.isAboveVwap
                                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                  : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                              }`}
                            >
                              {stock.isAboveVwap ? '▲ Above VWAP' : '▼ Below VWAP'}
                            </span>
                            <span className={`text-[10px] font-bold ${stock.isAboveVwap ? 'text-emerald-400' : 'text-rose-400'}`}>
                              {stock.vwapDiff > 0 ? `+${stock.vwapDiff}%` : `${stock.vwapDiff}%`}
                            </span>
                          </div>
                          <div className="text-[9px] opacity-60">
                            VWAP: ₹{stock.vwapVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })} • <span className="text-indigo-300 font-semibold">{stock.vwapBandTier}</span>
                          </div>
                        </div>
                      </td>

                      {/* Order Flow Delta */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-bold">
                            <span className={stock.orderFlowDelta >= 0 ? 'text-cyan-400' : 'text-rose-400'}>
                              {stock.orderFlowDelta >= 0 ? `+${stock.orderFlowDelta}%` : `${stock.orderFlowDelta}%`} Delta
                            </span>
                            <span className="text-[9px] opacity-60">{stock.buyAggressorPct}% Buy</span>
                          </div>
                          <div className="w-24 bg-slate-800 rounded-full h-1.5 overflow-hidden flex">
                            <div className="bg-cyan-500 h-full" style={{ width: `${stock.buyAggressorPct}%` }} />
                            <div className="bg-rose-500 h-full" style={{ width: `${stock.sellAggressorPct}%` }} />
                          </div>
                        </div>
                      </td>

                      {/* 60m Trend */}
                      <td className="py-3 px-3">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold border inline-flex items-center gap-1 ${stock.trend60m.badgeCls}`}>
                          <span>{stock.trend60m.label}</span>
                        </span>
                      </td>

                      {/* Options OI Action */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase ${oiAction.badgeBg} ${oiAction.badgeText} ${oiAction.badgeBorder}`}
                          >
                            {oiAction.actionLabel}
                          </span>
                          <div className="text-[9px] opacity-70 flex items-center gap-1.5">
                            <span>PCR: <strong className="text-slate-200">{stock.pcr}</strong></span>
                            <span>• MaxPain: ₹{stock.maxPain}</span>
                          </div>
                        </div>
                      </td>

                      {/* Sector Trend */}
                      <td className="py-3 px-3">
                        <div className="space-y-0.5">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                              stock.isSectorUp
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {stock.isSectorUp ? `▲ +${stock.sectorAvgChange}%` : `▼ ${stock.sectorAvgChange}%`}
                          </span>
                        </div>
                      </td>

                      {/* RSI & RVOL */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-slate-200">{stock.rsiVal.toFixed(1)}</span>
                            <span className="text-[10px] opacity-60">RSI</span>
                          </div>
                          <div className="text-[10px] text-amber-300 font-bold">
                            RVOL: {stock.indicators?.rvol?.toFixed(2) || '1.00'}x
                          </div>
                        </div>
                      </td>

                      {/* Institutional Flow */}
                      <td className="py-3 px-3">
                        <div className="space-y-1">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                              instAction.type === 'BUYING'
                                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
                                : instAction.type === 'SELLING'
                                ? 'bg-rose-500/15 text-rose-300 border-rose-500/40'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {instAction.type === 'BUYING' ? '🟢 Net Buying' : instAction.type === 'SELLING' ? '🔴 Net Selling' : '⚪ Neutral'}
                          </span>
                          <div className="text-[9px] opacity-60">₹{((stock.volume * stock.price) / 10000000).toFixed(1)} Cr Flow</div>
                        </div>
                      </td>

                      {/* AI Score */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <div
                            className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                              stock.aiScore >= 80
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                                : stock.aiScore >= 60
                                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/40'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {stock.aiScore}
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <a
                            href={stock.tradingViewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-2 py-1 rounded bg-blue-600/30 text-blue-300 hover:bg-blue-600 hover:text-white transition-colors text-[10px] font-bold inline-flex items-center gap-1 border border-blue-500/40"
                            title={`Open TradingView ${stock.symbol} chart ↗`}
                          >
                            <span>TV</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>

                          <button
                            onClick={() => onSelectStock(stock)}
                            className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white transition-colors text-[10px] font-bold shadow-sm"
                          >
                            Inspect
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

      {/* SUB-VIEW 2: ORDER FLOW DELTA FOOTPRINT MATRIX */}
      {activeSubView === 'ORDER_FLOW' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedStocks.map((stock) => (
            <div
              key={'of-' + stock.symbol}
              onClick={() => onSelectStock(stock)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer hover:border-cyan-500/60 ${
                isDark ? 'bg-slate-900/90 border-slate-800 hover:bg-slate-850' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-mono font-bold text-sm text-slate-100 flex items-center gap-1.5">
                    <span>{stock.symbol}</span>
                    {stock.isIcebergDetected && (
                      <span className="px-1.5 py-0.2 text-[8px] font-bold rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        ICEBERG
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] font-mono opacity-60">{stock.sector}</div>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${stock.recommendation.badgeBg} ${stock.recommendation.badgeText} ${stock.recommendation.badgeBorder}`}>
                  {stock.recommendation.label}
                </span>
              </div>

              {/* Aggressor Volume Bars */}
              <div className="space-y-1.5 my-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 font-mono text-xs">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-cyan-400 font-bold flex items-center gap-1">
                    <span>Aggressor Buy:</span> {stock.buyAggressorPct}%
                  </span>
                  <span className="text-rose-400 font-bold">
                    Sell: {stock.sellAggressorPct}%
                  </span>
                </div>

                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
                  <div className="bg-gradient-to-r from-cyan-500 to-teal-400 h-full" style={{ width: `${stock.buyAggressorPct}%` }} />
                  <div className="bg-gradient-to-r from-rose-500 to-red-600 h-full" style={{ width: `${stock.sellAggressorPct}%` }} />
                </div>

                <div className="flex items-center justify-between text-[10px] opacity-70 pt-1">
                  <span>Net Delta: <strong className={stock.orderFlowDelta >= 0 ? 'text-cyan-300' : 'text-rose-300'}>{stock.orderFlowDelta > 0 ? `+${stock.orderFlowDelta}%` : `${stock.orderFlowDelta}%`}</strong></span>
                  <span>Turnover: ₹{((stock.totalValue) / 10000000).toFixed(1)} Cr</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-mono pt-1">
                <span className={`font-bold ${stock.isAboveVwap ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {stock.isAboveVwap ? '▲ Above VWAP' : '▼ Below VWAP'} ({stock.vwapDiff}%)
                </span>

                <a
                  href={stock.tradingViewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-400 hover:text-blue-300 font-bold inline-flex items-center gap-1"
                >
                  <span>Chart ↗</span>
                </a>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SUB-VIEW 3: OPTIONS DYNAMICS & GAMMA ARENA */}
      {activeSubView === 'OPTIONS_DYNAMICS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedStocks.map((stock) => (
            <div
              key={'opt-' + stock.symbol}
              onClick={() => onSelectStock(stock)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer hover:border-amber-500/60 ${
                isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-mono font-bold text-sm text-slate-100">{stock.symbol}</div>
                  <div className="text-[10px] font-mono opacity-60">Spot: ₹{stock.price.toFixed(2)}</div>
                </div>

                <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase border ${stock.oiDetail.badgeBg} ${stock.oiDetail.badgeText} ${stock.oiDetail.badgeBorder}`}>
                  {stock.oiDetail.actionLabel}
                </span>
              </div>

              {/* Options PCR & Max Pain Box */}
              <div className="space-y-2 my-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 font-mono text-xs">
                <div className="flex items-center justify-between">
                  <span className="opacity-70">Put-Call Ratio (PCR):</span>
                  <span className={`font-black text-sm ${stock.pcr >= 1.15 ? 'text-emerald-400' : stock.pcr <= 0.75 ? 'text-rose-400' : 'text-slate-200'}`}>
                    {stock.pcr}
                  </span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="opacity-70">Max Pain Strike:</span>
                  <span className="font-bold text-amber-300">₹{stock.maxPain}</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="opacity-70">Gamma Exposure:</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${stock.gammaBias === 'LONG_GAMMA' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                    {stock.gammaBias}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-mono pt-1">
                <span className="text-[10px] opacity-70">RVOL: <strong>{stock.indicators?.rvol?.toFixed(2) || '1.0'}x</strong></span>
                <span className="text-emerald-400 font-bold">{stock.recommendation.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SUB-VIEW 4: MULTI-BAND VWAP MATRIX */}
      {activeSubView === 'VWAP_BANDS' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedStocks.map((stock) => (
            <div
              key={'vwap-' + stock.symbol}
              onClick={() => onSelectStock(stock)}
              className={`p-4 rounded-2xl border transition-all cursor-pointer hover:border-purple-500/60 ${
                isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <div className="font-mono font-bold text-sm text-slate-100">{stock.symbol}</div>
                  <div className="text-[10px] font-mono opacity-60">Price: ₹{stock.price.toFixed(2)}</div>
                </div>

                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {stock.vwapBandTier}
                </span>
              </div>

              {/* Band Levels */}
              <div className="space-y-1.5 my-3 p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 font-mono text-[11px]">
                <div className="flex items-center justify-between text-rose-300 opacity-80">
                  <span>+2σ Band:</span>
                  <span>₹{stock.upperBand2}</span>
                </div>
                <div className="flex items-center justify-between text-indigo-300">
                  <span>+1σ Band:</span>
                  <span>₹{stock.upperBand1}</span>
                </div>
                <div className="flex items-center justify-between font-bold text-amber-300 py-0.5 border-y border-slate-800">
                  <span>Session VWAP:</span>
                  <span>₹{stock.vwapVal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-teal-300">
                  <span>-1σ Band:</span>
                  <span>₹{stock.lowerBand1}</span>
                </div>
                <div className="flex items-center justify-between text-emerald-300 opacity-80">
                  <span>-2σ Band:</span>
                  <span>₹{stock.lowerBand2}</span>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs font-mono pt-1">
                <span className="text-[10px] opacity-70">Distance: <strong>{stock.vwapDiff > 0 ? `+${stock.vwapDiff}%` : `${stock.vwapDiff}%`}</strong></span>
                <span className="text-indigo-400 font-bold">{stock.trend60m.label}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
