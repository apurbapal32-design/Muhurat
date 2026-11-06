import React, { useState, useMemo } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Code2,
  Copy,
  Crosshair,
  Download,
  Eye,
  FileCode,
  Flame,
  Layers,
  LogOut,
  RefreshCw,
  Search,
  ShieldAlert,
  Sliders,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  User,
  X,
  Zap,
} from 'lucide-react';
import { ScannedStock } from '../types';
import {
  INITIAL_SMF_STOCKS,
  SmfStockItem,
  SmfRecommendation,
  computeSmfStockRecommendation,
} from '../data/smfScreenData';
import {
  generateSmfPineScript,
  generateSmfPythonScannerCode,
} from '../utils/smfInstitutionalEngine';

interface SmfInstitutionalScreenerViewProps {
  stocks?: ScannedStock[];
  selectedSymbol?: string;
  onSelectStock?: (stock: ScannedStock) => void;
  onExecuteTrade?: (stock: ScannedStock, signal: 'BUY' | 'SELL') => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const SmfInstitutionalScreenerView: React.FC<SmfInstitutionalScreenerViewProps> = ({
  stocks = [],
  selectedSymbol,
  onSelectStock,
  onExecuteTrade,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';

  // State
  const [activeMainTab, setActiveMainTab] = useState<'STOCKS' | 'SECTORS'>('STOCKS');
  const [selectedDate, setSelectedDate] = useState<string>('21 Jul 2026');
  const [isCustomDateOpen, setIsCustomDateOpen] = useState<boolean>(false);
  const [customDateInput, setCustomDateInput] = useState<string>('2026-07-21');
  const [quickFilter, setQuickFilter] = useState<
    'ALL' | 'HOT' | 'MULTIDAY' | 'SURGE' | 'FO_ONLY' | 'BUY_RECS' | 'STRONG_BUY' | 'SELL_RECS'
  >('ALL');
  const [minScore, setMinScore] = useState<number>(0.0);
  const [min4DayAvg, setMin4DayAvg] = useState<number>(0.0);
  const [selectedSector, setSelectedSector] = useState<string>('All Sectors');
  const [selectedSegment, setSelectedSegment] = useState<string>('All');
  const [selectedMarketCap, setSelectedMarketCap] = useState<string>('All Caps');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Sort State
  const [sortField, setSortField] = useState<keyof SmfStockItem>('scoreSelectedDay');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Deep dive modal & trade toast
  const [inspectedStock, setInspectedStock] = useState<SmfStockItem | null>(null);
  const [showCodeModal, setShowCodeModal] = useState<boolean>(false);
  const [activeCodeTab, setActiveCodeTab] = useState<'PINE' | 'PYTHON'>('PINE');
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [tradeToast, setTradeToast] = useState<{
    symbol: string;
    action: 'BUY' | 'SELL';
    price: number;
    message: string;
  } | null>(null);

  // Trigger trade with visual feedback
  const handleExecuteTradeAction = (stk: SmfStockItem, action: 'BUY' | 'SELL') => {
    if (onExecuteTrade) {
      const matched = stocks.find((s) => s.symbol === stk.symbol);
      if (matched) {
        onExecuteTrade(matched, action);
      } else {
        // Fallback construct
        onExecuteTrade(
          {
            symbol: stk.symbol,
            name: stk.name,
            sector: stk.sector,
            price: stk.price,
            change: stk.change,
            changePercent: stk.changePercent,
            volume: stk.volume,
            aiScore: Math.round(stk.scoreSelectedDay * 3),
            signal: action,
            confidence: stk.recommendation?.confidence || 85,
            timestamp: new Date().toLocaleTimeString(),
          } as unknown as ScannedStock,
          action
        );
      }
    }

    setTradeToast({
      symbol: stk.symbol,
      action: action,
      price: stk.price,
      message: `${action === 'BUY' ? '⚡ BUY / LONG' : '🔴 SELL / SHORT'} order submitted for ${stk.symbol} at ₹${stk.price.toFixed(2)} (Target: ₹${stk.recommendation?.target1 || (stk.price * 1.05).toFixed(2)})`,
    });

    setTimeout(() => {
      setTradeToast(null);
    }, 4000);
  };

  // Combine mock stocks and mapped scanned stocks with computed recommendations
  const allSmfStocks = useMemo(() => {
    // Start with the exact list from the screenshot
    const map = new Map<string, SmfStockItem>();
    INITIAL_SMF_STOCKS.forEach((item) => {
      const rec = computeSmfStockRecommendation(item);
      map.set(item.symbol, { ...item, recommendation: rec });
    });

    // Supplement with any dynamic stocks from live scan
    stocks.forEach((s) => {
      if (!map.has(s.symbol)) {
        const smfRes = s.smfResult;
        const score = smfRes ? Number((smfRes.smfScore * 0.25).toFixed(2)) : Number((s.aiScore * 0.22).toFixed(2));
        const prev = Number((s.changePercent * 2.1).toFixed(2));
        const fourD = Number((score * 0.72).toFixed(2));
        const tenD = Number((score * 0.52).toFixed(2));
        const streakNum = smfRes?.streakDays || (s.changePercent > 0 ? 2 : 1);

        const baseItem: SmfStockItem = {
          symbol: s.symbol,
          name: s.name,
          sector: s.sector || 'General',
          segment: s.symbol.length <= 6 ? 'FO' : 'EQ',
          marketCapTier: s.price > 3000 ? 'L' : s.price > 1000 ? 'M' : s.price > 100 ? 'S' : 'μ',
          marketCapStr: s.price > 3000 ? `L ₹${(s.price * 30).toFixed(0)}k Cr` : s.price > 1000 ? `M ₹${(s.price * 10).toFixed(0)} Cr` : `S ₹${(s.price * 5).toFixed(0)} Cr`,
          marketCapValCr: s.price * 10,
          price: s.price,
          change: s.change,
          changePercent: s.changePercent,
          scoreSelectedDay: score,
          prevDayChange: prev,
          fourDayAvg: fourD,
          tenDayAvg: tenD,
          streak: `${streakNum}d`,
          streakNum: streakNum,
          tenDayTrend: [
            Number((tenD * 0.6).toFixed(1)),
            Number((tenD * 0.7).toFixed(1)),
            Number((tenD * 0.8).toFixed(1)),
            Number((tenD * 0.9).toFixed(1)),
            Number((fourD * 0.7).toFixed(1)),
            Number((fourD * 0.8).toFixed(1)),
            Number((fourD * 0.9).toFixed(1)),
            Number((fourD * 1.0).toFixed(1)),
            Number((fourD * 1.1).toFixed(1)),
            score,
          ],
          signals: [
            ...(score >= 12 ? [{ type: 'surge' as const, label: '⚡ surge', variant: 'orange' as const }] : []),
            { type: 'above_avg' as const, label: '↑ above avg', variant: 'cyan' as const },
            ...(streakNum >= 2 ? [{ type: 'streak' as const, label: `⚓ ${streakNum}d`, variant: 'green' as const }] : []),
            ...(score >= 20 ? [{ type: 'hot' as const, label: '🔥 hot', variant: 'amber' as const }] : []),
          ],
          isSurge: score >= 12,
          isHot: score >= 20 && streakNum >= 2,
          rvol: s.indicators?.rvol || 2.1,
          cmf: s.changePercent > 0 ? 0.28 : -0.15,
          adx: s.indicators?.adx || 28.5,
          volume: s.volume || 1000000,
          vwap: s.indicators?.vwap || s.price * 0.995,
          open: s.indicators?.open || s.price * 0.99,
          high: s.indicators?.high || s.price * 1.01,
          low: s.indicators?.low || s.price * 0.985,
          close: s.price,
          oiBuildup: s.oiData?.buildup || 'LONG_BUILDUP',
          breakdown: {
            priceAccumulation: Number((score * 0.25).toFixed(1)),
            volumeAbnormality: Number((score * 0.25).toFixed(1)),
            moneyFlow: Number((score * 0.18).toFixed(1)),
            trendStrength: Number((score * 0.16).toFixed(1)),
            multiDayPersistence: Number((score * 0.10).toFixed(1)),
            surgeDetection: Number((score * 0.08).toFixed(1)),
            oiDerivatives: Number((score * 0.04).toFixed(1)),
            relativeStrength: Number((score * 0.04).toFixed(1)),
          },
        };

        baseItem.recommendation = computeSmfStockRecommendation(baseItem);
        map.set(s.symbol, baseItem);
      }
    });

    return Array.from(map.values());
  }, [stocks]);

  // Unique sectors for dropdown
  const allSectorsList = useMemo(() => {
    const set = new Set<string>();
    allSmfStocks.forEach((s) => set.add(s.sector));
    return ['All Sectors', ...Array.from(set).sort()];
  }, [allSmfStocks]);

  // Filtered stocks
  const filteredStocks = useMemo(() => {
    return allSmfStocks
      .filter((stk) => {
        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const match =
            stk.symbol.toLowerCase().includes(q) ||
            stk.name.toLowerCase().includes(q) ||
            stk.sector.toLowerCase().includes(q);
          if (!match) return false;
        }

        // Quick Filters
        if (quickFilter === 'HOT' && !stk.isHot && stk.scoreSelectedDay < 20) return false;
        if (quickFilter === 'MULTIDAY' && stk.streakNum < 2) return false;
        if (quickFilter === 'SURGE' && !stk.isSurge) return false;
        if (quickFilter === 'FO_ONLY' && stk.segment !== 'FO') return false;
        if (quickFilter === 'BUY_RECS' && stk.recommendation?.signalType !== 'BUY') return false;
        if (quickFilter === 'STRONG_BUY' && stk.recommendation?.action !== 'STRONG_BUY') return false;
        if (quickFilter === 'SELL_RECS' && stk.recommendation?.signalType !== 'SELL') return false;

        // Sliders (Apply only if user specifically raised them above 0 and not filtering specifically for sells)
        if (quickFilter !== 'SELL_RECS' && stk.recommendation?.signalType !== 'SELL') {
          if (minScore > 0 && stk.scoreSelectedDay < minScore) return false;
          if (min4DayAvg > 0 && stk.fourDayAvg < min4DayAvg) return false;
        }

        // Sector
        if (selectedSector !== 'All Sectors' && stk.sector !== selectedSector) return false;

        // Segment
        if (selectedSegment !== 'All' && stk.segment !== selectedSegment) return false;

        // Market Cap
        if (selectedMarketCap !== 'All Caps') {
          if (selectedMarketCap === 'Large Cap (L)' && stk.marketCapTier !== 'L') return false;
          if (selectedMarketCap === 'Mid Cap (M)' && stk.marketCapTier !== 'M') return false;
          if (selectedMarketCap === 'Small Cap (S)' && stk.marketCapTier !== 'S') return false;
          if (selectedMarketCap === 'Micro Cap (μ)' && stk.marketCapTier !== 'μ') return false;
        }

        return true;
      })
      .sort((a, b) => {
        const valA = a[sortField];
        const valB = b[sortField];
        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortAsc ? valA - valB : valB - valA;
        }
        if (typeof valA === 'string' && typeof valB === 'string') {
          return sortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
      });
  }, [
    allSmfStocks,
    searchQuery,
    quickFilter,
    minScore,
    min4DayAvg,
    selectedSector,
    selectedSegment,
    selectedMarketCap,
    sortField,
    sortAsc,
  ]);

  // Sector Aggregations for Sectors Tab
  const sectorAggregates = useMemo(() => {
    const map = new Map<
      string,
      {
        sector: string;
        count: number;
        avgScore: number;
        totalScore: number;
        surgeCount: number;
        streakCount: number;
        topStock: SmfStockItem;
      }
    >();

    allSmfStocks.forEach((stk) => {
      const existing = map.get(stk.sector);
      if (!existing) {
        map.set(stk.sector, {
          sector: stk.sector,
          count: 1,
          avgScore: stk.scoreSelectedDay,
          totalScore: stk.scoreSelectedDay,
          surgeCount: stk.isSurge ? 1 : 0,
          streakCount: stk.streakNum >= 2 ? 1 : 0,
          topStock: stk,
        });
      } else {
        existing.count += 1;
        existing.totalScore += stk.scoreSelectedDay;
        existing.avgScore = Number((existing.totalScore / existing.count).toFixed(2));
        if (stk.isSurge) existing.surgeCount += 1;
        if (stk.streakNum >= 2) existing.streakCount += 1;
        if (stk.scoreSelectedDay > existing.topStock.scoreSelectedDay) {
          existing.topStock = stk;
        }
      }
    });

    return Array.from(map.values()).sort((a, b) => b.avgScore - a.avgScore);
  }, [allSmfStocks]);

  // Handle column sorting toggle
  const handleSort = (field: keyof SmfStockItem) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const handleCopyCode = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleDownloadCode = (text: string, filename: string) => {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 font-sans p-2 sm:p-4 md:p-6 space-y-6 select-none">
      {/* -------------------------------------------------------------------- */}
      {/* 1. HERO BRANDING & BANNER                                            */}
      {/* -------------------------------------------------------------------- */}
      <div className="relative pt-2 pb-4 overflow-hidden">
        {/* Subtle Candlestick Background Artwork */}
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-15 pointer-events-none flex items-center justify-end">
          <svg className="w-full h-full text-teal-500" viewBox="0 0 400 120" fill="none">
            <path
              d="M10 90 L50 85 L90 95 L130 60 L170 65 L210 40 L250 45 L290 20 L330 25 L370 5"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeDasharray="4 4"
            />
            <rect x="45" y="75" width="10" height="20" fill="currentColor" opacity="0.6" />
            <rect x="125" y="50" width="10" height="25" fill="currentColor" opacity="0.8" />
            <rect x="205" y="30" width="10" height="25" fill="currentColor" opacity="0.8" />
            <rect x="285" y="15" width="10" height="20" fill="currentColor" opacity="0.9" />
            <rect x="365" y="5" width="10" height="25" fill="#f59e0b" />
          </svg>
        </div>

        {/* Title Matching Screenshot */}
        <div className="relative z-10 space-y-1">
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight leading-tight text-transparent bg-clip-text bg-gradient-to-r from-[#ffe4a0] via-[#f7c752] to-[#e6a817] drop-shadow-[0_4px_24px_rgba(245,158,11,0.3)]">
            Start Following
            <br />
            Institutional Activity.
          </h1>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 2. SUB-BAR: LOGO, TITLE, USER & LOGOUT                              */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-800/80">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-[#00f0ff] shadow-[0_0_10px_#00f0ff] animate-pulse" />
          <span className="text-base sm:text-lg font-black tracking-wider text-[#00f0ff] uppercase font-mono">
            SMF SCREENER
          </span>
          <span className="text-xs sm:text-sm text-slate-400 font-medium pl-1">
            Smart Money Footprint — Institutional Activity Scanner !
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-900/90 border border-slate-700/60 text-xs text-slate-300 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Rahul • user • approved</span>
          </div>
          <button
            onClick={() => setShowCodeModal(true)}
            className="px-3 py-1 rounded-md bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-slate-300 hover:text-white transition-colors uppercase flex items-center gap-1"
          >
            <Code2 className="w-3.5 h-3.5 text-[#00f0ff]" />
            CODE
          </button>
          <button
            onClick={() => {}}
            className="px-3 py-1 rounded-md bg-slate-900/90 hover:bg-rose-950/60 border border-slate-700 hover:border-rose-500/50 text-xs font-mono font-bold text-slate-300 hover:text-rose-400 transition-colors uppercase flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            LOGOUT
          </button>
        </div>
      </div>

      {/* Toast Notification for Trade Executions */}
      {tradeToast && (
        <div className="fixed top-4 right-4 z-50 bg-[#091624] border border-cyan-500/80 rounded-xl p-4 shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="p-2 rounded-lg bg-cyan-950 text-[#00f0ff]">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-mono font-black text-white flex items-center gap-2">
              <span className={tradeToast.action === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}>
                {tradeToast.action === 'BUY' ? '● ORDER PLACED (BUY)' : '● ORDER PLACED (SELL)'}
              </span>
              <span className="text-slate-400">|</span>
              <span>{tradeToast.symbol}</span>
            </div>
            <div className="text-xs text-slate-300 font-mono mt-0.5">{tradeToast.message}</div>
          </div>
          <button
            onClick={() => setTradeToast(null)}
            className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 3. TOP METRICS RIBBON (7 TILES)                                      */}
      {/* -------------------------------------------------------------------- */}
      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
        <div className="bg-[#0b121e] border border-slate-800/80 rounded-lg p-3 text-center transition-all hover:border-slate-700">
          <div className="text-xl sm:text-2xl font-black font-mono text-slate-100">2055</div>
          <div className="text-[10px] font-mono tracking-wider text-slate-400 uppercase font-semibold">
            UNIVERSE
          </div>
        </div>

        <div className="bg-[#0b121e] border border-slate-800/80 rounded-lg p-3 text-center transition-all hover:border-slate-700">
          <div className="text-xl sm:text-2xl font-black font-mono text-[#00f0ff]">{filteredStocks.length}</div>
          <div className="text-[10px] font-mono tracking-wider text-slate-400 uppercase font-semibold">
            FILTERED
          </div>
        </div>

        <div className="bg-[#0b121e] border border-slate-800/80 rounded-lg p-3 text-center transition-all hover:border-slate-700 col-span-2 sm:col-span-1">
          <div className="text-base sm:text-lg font-black font-mono text-slate-200 mt-0.5">{selectedDate}</div>
          <div className="text-[10px] font-mono tracking-wider text-slate-400 uppercase font-semibold">
            SELECTED DATE
          </div>
        </div>

        <div className="bg-[#0b121e] border border-slate-800/80 rounded-lg p-3 text-center transition-all hover:border-slate-700">
          <div className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
            {allSmfStocks.filter((s) => s.recommendation?.signalType === 'BUY').length}
          </div>
          <div className="text-[10px] font-mono tracking-wider text-slate-400 uppercase font-semibold">
            BUY SIGNALS
          </div>
        </div>

        <div className="bg-[#0b121e] border border-slate-800/80 rounded-lg p-3 text-center transition-all hover:border-slate-700">
          <div className="text-xl sm:text-2xl font-black font-mono text-rose-400">
            {allSmfStocks.filter((s) => s.recommendation?.signalType === 'SELL').length}
          </div>
          <div className="text-[10px] font-mono tracking-wider text-slate-400 uppercase font-semibold">
            SELL SIGNALS
          </div>
        </div>

        <div className="bg-[#0b121e] border border-slate-800/80 rounded-lg p-3 text-center transition-all hover:border-slate-700">
          <div className="text-xl sm:text-2xl font-black font-mono text-amber-400">
            {allSmfStocks.filter((s) => s.isSurge).length}
          </div>
          <div className="text-[10px] font-mono tracking-wider text-slate-400 uppercase font-semibold">
            SURGE DAY
          </div>
        </div>

        <div className="bg-[#0b121e] border border-teal-500/30 rounded-lg p-3 text-center transition-all flex flex-col justify-center items-center">
          <div className="flex items-center gap-1.5 text-emerald-400 font-mono font-bold text-sm">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>● LIVE</span>
          </div>
          <div className="text-[10px] font-mono tracking-wider text-slate-400 uppercase font-semibold mt-0.5">
            MODE
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 4. DATE SELECTOR BAR                                                 */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#0a101b] border border-slate-800/90 rounded-lg p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 text-xs font-mono font-bold text-slate-400 uppercase">
            <Calendar className="w-3.5 h-3.5 text-rose-400" />
            <span>DATE</span>
          </div>

          {[
            { label: 'Today (02 Sep 2026)', value: '02 Sep 2026' },
            { label: '21 Jul 2026', value: '21 Jul 2026' },
            { label: '1 Week Ago', value: '26 Aug 2026' },
            { label: '1 Month Ago', value: '02 Aug 2026' },
            { label: '3 Months Ago', value: '02 Jun 2026' },
            { label: '6 Months Ago', value: '02 Mar 2026' },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => setSelectedDate(item.value)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-all ${
                selectedDate === item.value
                  ? 'bg-teal-950/80 text-[#00f0ff] border border-[#00f0ff] shadow-[0_0_12px_rgba(0,240,255,0.25)]'
                  : 'bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700'
              }`}
            >
              {item.label}
            </button>
          ))}

          <div className="relative">
            <button
              onClick={() => setIsCustomDateOpen(!isCustomDateOpen)}
              className="px-3 py-1.5 rounded-md text-xs font-mono font-bold bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700 flex items-center gap-1"
            >
              <span>Custom Date</span>
              <ChevronDown className={`w-3 h-3 transition-transform ${isCustomDateOpen ? 'rotate-180' : ''}`} />
            </button>

            {isCustomDateOpen && (
              <div className="absolute left-0 top-full mt-2 z-30 bg-[#0c1422] border border-slate-700 rounded-lg p-3 shadow-xl flex items-center gap-2">
                <input
                  type="date"
                  value={customDateInput}
                  onChange={(e) => setCustomDateInput(e.target.value)}
                  className="bg-[#070d18] border border-slate-700 rounded px-2 py-1 text-xs font-mono text-white focus:outline-none focus:border-[#00f0ff]"
                />
                <button
                  onClick={() => {
                    if (customDateInput) {
                      const [y, m, d] = customDateInput.split('-');
                      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                      const formatted = `${d} ${months[parseInt(m, 10) - 1]} ${y}`;
                      setSelectedDate(formatted);
                      setIsCustomDateOpen(false);
                    }
                  }}
                  className="px-2.5 py-1 bg-[#00f0ff] text-slate-950 font-mono font-bold text-xs rounded hover:bg-cyan-300"
                >
                  Set
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="text-xs font-mono font-bold text-slate-300 pr-2">
          Viewing: <span className="text-white font-black">{selectedDate}</span>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 5. QUICK FILTERS, SLIDERS & CONTROLS BAR                             */}
      {/* -------------------------------------------------------------------- */}
      <div className="space-y-3 bg-[#0a101b] border border-slate-800/90 rounded-xl p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-mono font-bold text-slate-400 uppercase pr-1">
              QUICK FILTERS
            </span>

            <button
              onClick={() => setQuickFilter('ALL')}
              className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-all ${
                quickFilter === 'ALL'
                  ? 'bg-slate-800 text-white border border-slate-600 shadow-sm'
                  : 'bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800'
              }`}
            >
              All ({allSmfStocks.length})
            </button>

            <button
              onClick={() => setQuickFilter('BUY_RECS')}
              className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                quickFilter === 'BUY_RECS'
                  ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                  : 'bg-slate-900 text-slate-400 hover:text-emerald-400 border border-slate-800'
              }`}
            >
              <Target className="w-3.5 h-3.5 text-emerald-400" />
              <span>🟢 Buy Signals ({allSmfStocks.filter((s) => s.recommendation?.signalType === 'BUY').length})</span>
            </button>

            <button
              onClick={() => setQuickFilter('STRONG_BUY')}
              className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                quickFilter === 'STRONG_BUY'
                  ? 'bg-teal-950/90 text-[#00f0ff] border border-[#00f0ff] shadow-[0_0_12px_rgba(0,240,255,0.35)]'
                  : 'bg-slate-900 text-slate-400 hover:text-[#00f0ff] border border-slate-800'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-[#00f0ff]" />
              <span>🚀 Strong Buys ({allSmfStocks.filter((s) => s.recommendation?.action === 'STRONG_BUY').length})</span>
            </button>

            <button
              onClick={() => setQuickFilter('SELL_RECS')}
              className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
                quickFilter === 'SELL_RECS'
                  ? 'bg-rose-950/90 text-rose-300 border border-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.3)]'
                  : 'bg-slate-900 text-slate-400 hover:text-rose-400 border border-slate-800'
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
              <span>🔴 Sell / Short ({allSmfStocks.filter((s) => s.recommendation?.signalType === 'SELL').length})</span>
            </button>

            <button
              onClick={() => setQuickFilter('HOT')}
              className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-all flex items-center gap-1 ${
                quickFilter === 'HOT'
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.25)]'
                  : 'bg-slate-900 text-slate-400 hover:text-amber-400 border border-slate-800'
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-amber-400 fill-current" />
              <span>Hot</span>
            </button>

            <button
              onClick={() => setQuickFilter('MULTIDAY')}
              className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-all flex items-center gap-1 ${
                quickFilter === 'MULTIDAY'
                  ? 'bg-teal-950/80 text-teal-300 border border-teal-500 shadow-[0_0_10px_rgba(20,184,166,0.25)]'
                  : 'bg-slate-900 text-slate-400 hover:text-teal-300 border border-slate-800'
              }`}
            >
              <span>☑ Multi-Day</span>
            </button>

            <button
              onClick={() => setQuickFilter('SURGE')}
              className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-all flex items-center gap-1 ${
                quickFilter === 'SURGE'
                  ? 'bg-orange-950/80 text-orange-300 border border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.25)]'
                  : 'bg-slate-900 text-slate-400 hover:text-orange-400 border border-slate-800'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-orange-400 fill-current" />
              <span>Surge</span>
            </button>

            <button
              onClick={() => setQuickFilter('FO_ONLY')}
              className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-all ${
                quickFilter === 'FO_ONLY'
                  ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.25)]'
                  : 'bg-slate-900 text-slate-400 hover:text-indigo-300 border border-slate-800'
              }`}
            >
              F&O Only
            </button>
          </div>

          {/* Sliders matching the screenshot */}
          <div className="flex flex-wrap items-center gap-6">
            {/* Min Score Slider */}
            <div className="flex items-center gap-3">
              <div className="text-xs font-mono">
                <span className="text-slate-400 uppercase font-semibold">MIN SCORE </span>
                <span className="text-[#00f0ff] font-black">{minScore.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="35"
                step="0.5"
                value={minScore}
                onChange={(e) => setMinScore(parseFloat(e.target.value))}
                className="w-24 sm:w-28 accent-[#00f0ff] bg-slate-800 h-1.5 rounded-lg cursor-pointer"
              />
            </div>

            {/* Min 4-Day Avg Slider */}
            <div className="flex items-center gap-3">
              <div className="text-xs font-mono">
                <span className="text-slate-400 uppercase font-semibold">MIN 4-DAY AVG </span>
                <span className="text-[#00f0ff] font-black">{min4DayAvg.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="20"
                step="0.5"
                value={min4DayAvg}
                onChange={(e) => setMin4DayAvg(parseFloat(e.target.value))}
                className="w-24 sm:w-28 accent-[#00f0ff] bg-slate-800 h-1.5 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* Dropdowns & Search Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2 border-t border-slate-800/60">
          {/* Sector Dropdown */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
              SECTOR
            </label>
            <select
              value={selectedSector}
              onChange={(e) => setSelectedSector(e.target.value)}
              className="w-full bg-[#070d18] border border-slate-700/80 rounded-md px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-[#00f0ff]"
            >
              {allSectorsList.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Segment Dropdown */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
              SEGMENT
            </label>
            <select
              value={selectedSegment}
              onChange={(e) => setSelectedSegment(e.target.value)}
              className="w-full bg-[#070d18] border border-slate-700/80 rounded-md px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-[#00f0ff]"
            >
              <option value="All">All</option>
              <option value="EQ">EQ (Equity)</option>
              <option value="FO">FO (Futures & Options)</option>
              <option value="SM">SM (SME Segment)</option>
            </select>
          </div>

          {/* Market Cap Dropdown */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
              MARKET CAP
            </label>
            <select
              value={selectedMarketCap}
              onChange={(e) => setSelectedMarketCap(e.target.value)}
              className="w-full bg-[#070d18] border border-slate-700/80 rounded-md px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-[#00f0ff]"
            >
              <option value="All Caps">All Caps</option>
              <option value="Large Cap (L)">Large Cap (L)</option>
              <option value="Mid Cap (M)">Mid Cap (M)</option>
              <option value="Small Cap (S)">Small Cap (S)</option>
              <option value="Micro Cap (μ)">Micro Cap (μ)</option>
            </select>
          </div>

          {/* Search Input */}
          <div className="space-y-1">
            <label className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
              SEARCH
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Symbol..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#070d18] border border-slate-700/80 rounded-md pl-8 pr-3 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-[#00f0ff]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 6. TAB SELECTOR (STOCKS vs SECTORS)                                 */}
      {/* -------------------------------------------------------------------- */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setActiveMainTab('STOCKS')}
          className={`px-4 py-2 rounded-lg text-xs font-mono font-black transition-all flex items-center gap-2 ${
            activeMainTab === 'STOCKS'
              ? 'bg-[#1b4382] text-white border border-blue-400/60 shadow-lg shadow-blue-500/20'
              : 'bg-[#0b121e] text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <span>📦 STOCKS</span>
          <span className="px-1.5 py-0.2 rounded bg-blue-900/60 text-blue-200 text-[10px]">
            {filteredStocks.length}
          </span>
        </button>

        <button
          onClick={() => setActiveMainTab('SECTORS')}
          className={`px-4 py-2 rounded-lg text-xs font-mono font-black transition-all flex items-center gap-2 ${
            activeMainTab === 'SECTORS'
              ? 'bg-[#1b4382] text-white border border-blue-400/60 shadow-lg shadow-blue-500/20'
              : 'bg-[#0b121e] text-slate-400 hover:text-slate-200 border border-slate-800'
          }`}
        >
          <span>⚙ SECTORS</span>
          <span className="px-1.5 py-0.2 rounded bg-blue-900/60 text-blue-200 text-[10px]">
            {sectorAggregates.length}
          </span>
        </button>
      </div>

      {/* -------------------------------------------------------------------- */}
      {/* 7. MAIN DATA TABLE (STOCKS VIEW)                                     */}
      {/* -------------------------------------------------------------------- */}
      {activeMainTab === 'STOCKS' ? (
        <div className="bg-[#090e18] border border-slate-800/90 rounded-xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-[#070b14] text-[11px] font-mono font-black text-slate-400 uppercase tracking-wider">
                  <th
                    onClick={() => handleSort('symbol')}
                    className="py-3 px-3.5 cursor-pointer hover:text-[#00f0ff] whitespace-nowrap"
                  >
                    SYMBOL ⇅
                  </th>
                  <th
                    onClick={() => handleSort('sector')}
                    className="py-3 px-3.5 cursor-pointer hover:text-[#00f0ff] whitespace-nowrap"
                  >
                    SECTOR ⇅
                  </th>
                  <th className="py-3 px-2 whitespace-nowrap text-center">SEG</th>
                  <th
                    onClick={() => handleSort('marketCapValCr')}
                    className="py-3 px-3.5 cursor-pointer hover:text-[#00f0ff] whitespace-nowrap text-right"
                  >
                    MKT CAP ⇅
                  </th>
                  <th
                    onClick={() => handleSort('scoreSelectedDay')}
                    className="py-3 px-4 cursor-pointer hover:text-[#00f0ff] whitespace-nowrap text-right text-[#00f0ff]"
                  >
                    SCORE (SELECTED DAY) ⇅
                  </th>
                  <th
                    onClick={() => handleSort('prevDayChange')}
                    className="py-3 px-3.5 cursor-pointer hover:text-[#00f0ff] whitespace-nowrap text-right"
                  >
                    PREV DAY ⇅
                  </th>
                  <th
                    onClick={() => handleSort('fourDayAvg')}
                    className="py-3 px-3.5 cursor-pointer hover:text-[#00f0ff] whitespace-nowrap text-right"
                  >
                    4-DAY AVG
                  </th>
                  <th
                    onClick={() => handleSort('tenDayAvg')}
                    className="py-3 px-3.5 cursor-pointer hover:text-[#00f0ff] whitespace-nowrap text-right"
                  >
                    10-DAY AVG ⇅
                  </th>
                  <th
                    onClick={() => handleSort('streakNum')}
                    className="py-3 px-3 cursor-pointer hover:text-[#00f0ff] whitespace-nowrap text-center"
                  >
                    STREAK
                  </th>
                  <th className="py-3 px-3.5 whitespace-nowrap text-center">10-DAY TREND</th>
                  <th className="py-3 px-3.5 whitespace-nowrap">SIGNALS</th>
                  <th className="py-3 px-3.5 whitespace-nowrap text-center">RECOMMENDATION / ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-xs">
                {filteredStocks.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="py-12 text-center text-slate-500 font-sans">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <AlertCircle className="w-8 h-8 text-slate-600" />
                        <p className="text-sm font-semibold">No stocks match the current filter criteria</p>
                        <p className="text-xs text-slate-600">
                          Try lowering the MIN SCORE or MIN 4-DAY AVG sliders, or switch QUICK FILTERS to "All".
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredStocks.map((stk, idx) => {
                    const isEven = idx % 2 === 0;
                    const rec = stk.recommendation;
                    return (
                      <tr
                        key={stk.symbol}
                        onClick={() => setInspectedStock(stk)}
                        className={`transition-colors cursor-pointer group ${
                          isEven ? 'bg-[#080d17]' : 'bg-[#060a12]'
                        } hover:bg-[#0e1828]`}
                      >
                        {/* 1. SYMBOL */}
                        <td className="py-3.5 px-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-slate-100 group-hover:text-[#00f0ff] transition-colors">
                              {stk.symbol}
                            </span>
                          </div>
                        </td>

                        {/* 2. SECTOR */}
                        <td className="py-3.5 px-3.5 whitespace-nowrap text-slate-400 group-hover:text-slate-300">
                          {stk.sector}
                        </td>

                        {/* 3. SEGMENT */}
                        <td className="py-3.5 px-2 whitespace-nowrap text-center">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              stk.segment === 'FO'
                                ? 'bg-indigo-950/80 text-indigo-300 border border-indigo-700/50'
                                : stk.segment === 'SM'
                                ? 'bg-purple-950/80 text-purple-300 border border-purple-700/50'
                                : 'bg-slate-800/80 text-slate-300 border border-slate-700/50'
                            }`}
                          >
                            {stk.segment}
                          </span>
                        </td>

                        {/* 4. MKT CAP */}
                        <td className="py-3.5 px-3.5 whitespace-nowrap text-right font-medium text-slate-300">
                          <span className="opacity-80">{stk.marketCapStr}</span>
                        </td>

                        {/* 5. SCORE (SELECTED DAY) */}
                        <td className="py-3.5 px-4 whitespace-nowrap text-right font-black text-sm text-[#00f0ff] drop-shadow-[0_0_8px_rgba(0,240,255,0.4)]">
                          {stk.scoreSelectedDay.toFixed(2)}
                        </td>

                        {/* 6. PREV DAY */}
                        <td className="py-3.5 px-3.5 whitespace-nowrap text-right font-bold">
                          <span
                            className={
                              stk.prevDayChange >= 0
                                ? 'text-emerald-400 flex items-center justify-end gap-0.5'
                                : 'text-rose-400 flex items-center justify-end gap-0.5'
                            }
                          >
                            {stk.prevDayChange >= 0 ? '▲ +' : '▼ '}
                            {stk.prevDayChange.toFixed(2)}
                          </span>
                        </td>

                        {/* 7. 4-DAY AVG */}
                        <td className="py-3.5 px-3.5 whitespace-nowrap text-right font-bold text-slate-200">
                          {stk.fourDayAvg.toFixed(2)}
                        </td>

                        {/* 8. 10-DAY AVG */}
                        <td className="py-3.5 px-3.5 whitespace-nowrap text-right text-slate-300">
                          {stk.tenDayAvg.toFixed(2)}
                        </td>

                        {/* 9. STREAK */}
                        <td className="py-3.5 px-3 whitespace-nowrap text-center font-bold text-slate-300">
                          {stk.streak}
                        </td>

                        {/* 10. 10-DAY TREND SPARKLINE BARS */}
                        <td className="py-3.5 px-3.5 whitespace-nowrap">
                          <div className="flex items-end justify-center gap-[3px] h-6 w-24 mx-auto">
                            {stk.tenDayTrend.map((val, i) => {
                              const maxVal = Math.max(...stk.tenDayTrend, 15);
                              const heightPct = Math.max(15, Math.min(100, (val / maxVal) * 100));
                              const isLast = i === stk.tenDayTrend.length - 1;
                              const isPeak = val >= 10;

                              return (
                                <div
                                  key={i}
                                  style={{ height: `${heightPct}%` }}
                                  title={`Day ${i + 1}: ${val.toFixed(2)}`}
                                  className={`w-1.5 rounded-t-sm transition-all ${
                                    isLast
                                      ? 'bg-[#00f0ff] shadow-[0_0_6px_#00f0ff]'
                                      : isPeak
                                      ? 'bg-amber-400'
                                      : 'bg-teal-700/60 group-hover:bg-teal-600/80'
                                  }`}
                                />
                              );
                            })}
                          </div>
                        </td>

                        {/* 11. SIGNALS */}
                        <td className="py-3.5 px-3.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            {stk.signals.map((sig, sIdx) => {
                              if (sig.variant === 'orange') {
                                return (
                                  <span
                                    key={sIdx}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#26150a] text-orange-400 border border-orange-700/50 flex items-center gap-1"
                                  >
                                    <span>{sig.label}</span>
                                  </span>
                                );
                              }
                              if (sig.variant === 'cyan') {
                                return (
                                  <span
                                    key={sIdx}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#081f26] text-[#00f0ff] border border-cyan-700/50"
                                  >
                                    {sig.label}
                                  </span>
                                );
                              }
                              if (sig.variant === 'green') {
                                return (
                                  <span
                                    key={sIdx}
                                    className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#0c2419] text-emerald-400 border border-emerald-700/50 flex items-center gap-1"
                                  >
                                    <span>{sig.label}</span>
                                  </span>
                                );
                              }
                              if (sig.variant === 'amber') {
                                return (
                                  <span
                                    key={sIdx}
                                    className="px-2 py-0.5 rounded text-[10px] font-black bg-[#2d1b06] text-amber-300 border border-amber-600/50 flex items-center gap-1"
                                  >
                                    <Flame className="w-2.5 h-2.5 fill-current text-amber-400" />
                                    <span>{sig.label}</span>
                                  </span>
                                );
                              }
                              if (sig.variant === 'rose') {
                                return (
                                  <span
                                    key={sIdx}
                                    className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-950/90 text-rose-300 border border-rose-600/60 flex items-center gap-1 shadow-[0_0_8px_rgba(244,63,94,0.2)]"
                                  >
                                    <TrendingDown className="w-2.5 h-2.5 text-rose-400" />
                                    <span>{sig.label}</span>
                                  </span>
                                );
                              }
                              return (
                                <span
                                  key={sIdx}
                                  className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700"
                                >
                                  {sig.label}
                                </span>
                              );
                            })}
                          </div>
                        </td>

                        {/* 12. RECOMMENDATION / ACTION */}
                        <td
                          className="py-3.5 px-3.5 whitespace-nowrap text-center"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-center gap-2">
                            {rec && (
                              <div className="flex flex-col items-center">
                                <span
                                  className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                                    rec.action === 'STRONG_BUY'
                                      ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                                      : rec.action === 'BUY'
                                      ? 'bg-teal-950/90 text-teal-300 border border-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.25)]'
                                      : rec.action === 'ACCUMULATE'
                                      ? 'bg-cyan-950/90 text-[#00f0ff] border border-cyan-500 shadow-[0_0_8px_rgba(0,240,255,0.2)]'
                                      : rec.action === 'PROFIT_SELL' || rec.action === 'STRONG_SELL'
                                      ? 'bg-rose-950/90 text-rose-300 border border-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.25)]'
                                      : 'bg-amber-950/90 text-amber-300 border border-amber-500'
                                  }`}
                                >
                                  {rec.action === 'STRONG_BUY' && <Sparkles className="w-2.5 h-2.5 text-emerald-400" />}
                                  {rec.action === 'BUY' && <CheckCircle2 className="w-2.5 h-2.5 text-teal-400" />}
                                  {rec.action === 'ACCUMULATE' && <Target className="w-2.5 h-2.5 text-cyan-400" />}
                                  {(rec.action === 'PROFIT_SELL' || rec.action === 'STRONG_SELL') && (
                                    <TrendingDown className="w-2.5 h-2.5 text-rose-400" />
                                  )}
                                  <span>
                                    {rec.action.replace('_', ' ')} {rec.confidence}%
                                  </span>
                                </span>
                                <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                                  T1: ₹{rec.target1.toFixed(0)} | SL: ₹{rec.stopLoss.toFixed(0)}
                                </span>
                              </div>
                            )}

                            {/* Quick Execution Buttons */}
                            <div className="flex items-center gap-1 pl-1">
                              <button
                                title={`Execute BUY on ${stk.symbol} (Target: ₹${rec?.target1.toFixed(0) || ''})`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExecuteTradeAction(stk, 'BUY');
                                }}
                                className="px-2 py-1 rounded bg-emerald-600/90 hover:bg-emerald-500 text-slate-950 font-mono font-black text-[10px] transition-transform active:scale-95 shadow-sm"
                              >
                                BUY
                              </button>
                              <button
                                title={`Execute SELL on ${stk.symbol}`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleExecuteTradeAction(stk, 'SELL');
                                }}
                                className="px-2 py-1 rounded bg-rose-600/80 hover:bg-rose-500 text-white font-mono font-black text-[10px] transition-transform active:scale-95 shadow-sm"
                              >
                                SELL
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ------------------------------------------------------------------ */
        /* 8. SECTORS VIEW TAB                                                */
        /* ------------------------------------------------------------------ */
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {sectorAggregates.map((sec) => (
              <div
                key={sec.sector}
                className="bg-[#090e18] border border-slate-800/90 rounded-xl p-4 space-y-3 hover:border-slate-700 transition-all shadow-lg"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-black font-mono text-slate-100">{sec.sector}</h3>
                  <span className="px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800 text-[10px] font-mono font-bold">
                    {sec.count} Stocks
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 py-2 border-y border-slate-800 text-center font-mono">
                  <div>
                    <div className="text-[10px] text-slate-400">AVG SCORE</div>
                    <div className="text-base font-black text-[#00f0ff]">{sec.avgScore.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">SURGE DAYS</div>
                    <div className="text-base font-black text-amber-400">{sec.surgeCount}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400">2D+ STREAKS</div>
                    <div className="text-base font-black text-emerald-400">{sec.streakCount}</div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs font-mono pt-1">
                  <span className="text-slate-400">Top Institutional Mover:</span>
                  <button
                    onClick={() => setInspectedStock(sec.topStock)}
                    className="font-black text-[#00f0ff] hover:underline flex items-center gap-1"
                  >
                    <span>{sec.topStock.symbol}</span>
                    <span className="text-emerald-400">({sec.topStock.scoreSelectedDay.toFixed(2)})</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 9. STOCK INSPECTOR & INSTITUTIONAL DEEP-DIVE MODAL                   */}
      {/* -------------------------------------------------------------------- */}
      {inspectedStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#090e18] border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto custom-scrollbar shadow-2xl p-4 sm:p-6 space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-black font-mono text-white flex items-center gap-2">
                    <span>{inspectedStock.symbol}</span>
                    <span className="px-2 py-0.5 text-xs bg-slate-800 text-slate-300 rounded font-normal">
                      {inspectedStock.segment}
                    </span>
                    {inspectedStock.isHot && (
                      <span className="px-2 py-0.5 text-xs bg-amber-500 text-slate-950 font-black rounded flex items-center gap-1">
                        <Flame className="w-3 h-3 fill-current" />
                        HOT
                      </span>
                    )}
                  </h2>
                </div>
                <p className="text-xs text-slate-400 font-sans mt-0.5">{inspectedStock.name} • {inspectedStock.sector}</p>
                <div className="text-sm font-mono font-bold mt-1 text-slate-200">
                  ₹{inspectedStock.price.toFixed(2)}{' '}
                  <span
                    className={
                      inspectedStock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }
                  >
                    ({inspectedStock.changePercent >= 0 ? '+' : ''}
                    {inspectedStock.changePercent.toFixed(2)}%)
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <div className="text-[10px] font-mono text-slate-400 uppercase">SMF SCORE</div>
                  <div className="text-2xl font-black font-mono text-[#00f0ff]">
                    {inspectedStock.scoreSelectedDay.toFixed(2)}
                  </div>
                </div>
                <button
                  onClick={() => setInspectedStock(null)}
                  className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* 10-Day Historical Trend */}
            <div className="space-y-2 bg-[#070b14] border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300 font-bold uppercase">10-Day Institutional Score Progression</span>
                <span className="text-[#00f0ff]">Selected Day: {inspectedStock.scoreSelectedDay.toFixed(2)}</span>
              </div>
              <div className="flex items-end justify-between gap-2 h-28 pt-4">
                {inspectedStock.tenDayTrend.map((val, i) => {
                  const maxVal = Math.max(...inspectedStock.tenDayTrend, 20);
                  const hPct = Math.max(12, Math.min(100, (val / maxVal) * 100));
                  const isToday = i === inspectedStock.tenDayTrend.length - 1;

                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <span className="text-[9px] font-mono text-slate-400">{val.toFixed(1)}</span>
                      <div
                        style={{ height: `${hPct}%` }}
                        className={`w-full rounded-t-md transition-all ${
                          isToday
                            ? 'bg-[#00f0ff] shadow-[0_0_12px_#00f0ff]'
                            : val >= 10
                            ? 'bg-amber-400'
                            : 'bg-teal-700/80'
                        }`}
                      />
                      <span className="text-[8px] font-mono text-slate-500">
                        {isToday ? 'Today' : `D-${10 - i}`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 8-Component Breakdown Grid */}
            <div className="space-y-2">
              <h3 className="text-xs font-mono font-bold text-slate-300 uppercase">
                8-Component Mathematical Breakdown
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">PRICE / ACCUMULATION (20)</div>
                  <div className="text-base font-bold text-indigo-400">
                    {inspectedStock.breakdown.priceAccumulation.toFixed(2)} pts
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">VOLUME ABNORMALITY (20)</div>
                  <div className="text-base font-bold text-teal-400">
                    {inspectedStock.breakdown.volumeAbnormality.toFixed(2)} pts
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">MONEY FLOW CMF (15)</div>
                  <div className="text-base font-bold text-emerald-400">
                    {inspectedStock.breakdown.moneyFlow.toFixed(2)} pts
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">TREND STRENGTH (15)</div>
                  <div className="text-base font-bold text-blue-400">
                    {inspectedStock.breakdown.trendStrength.toFixed(2)} pts
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">MULTI-DAY PERSISTENCE (10)</div>
                  <div className="text-base font-bold text-purple-400">
                    {inspectedStock.breakdown.multiDayPersistence.toFixed(2)} pts
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">SURGE DETECTION (10)</div>
                  <div className="text-base font-bold text-amber-400">
                    {inspectedStock.breakdown.surgeDetection.toFixed(2)} pts
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">OI / DERIVATIVES (5)</div>
                  <div className="text-base font-bold text-rose-400">
                    {inspectedStock.breakdown.oiDerivatives.toFixed(2)} pts
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
                  <div className="text-[10px] text-slate-400">RELATIVE STRENGTH (5)</div>
                  <div className="text-base font-bold text-cyan-400">
                    {inspectedStock.breakdown.relativeStrength.toFixed(2)} pts
                  </div>
                </div>
              </div>
            </div>

            {/* Institutional Buy / Sell Recommendation Engine Box */}
            {inspectedStock.recommendation && (
              <div className="p-4 rounded-xl bg-gradient-to-br from-[#0c1626] to-[#070e1b] border border-cyan-500/40 space-y-3 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${
                        inspectedStock.recommendation.action === 'STRONG_BUY'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.3)]'
                          : inspectedStock.recommendation.action === 'BUY'
                          ? 'bg-teal-950 text-teal-300 border border-teal-500'
                          : inspectedStock.recommendation.action === 'ACCUMULATE'
                          ? 'bg-cyan-950 text-[#00f0ff] border border-cyan-500'
                          : inspectedStock.recommendation.action === 'PROFIT_SELL' ||
                            inspectedStock.recommendation.action === 'STRONG_SELL'
                          ? 'bg-rose-950 text-rose-300 border border-rose-500'
                          : 'bg-amber-950 text-amber-300 border border-amber-500'
                      }`}
                    >
                      {inspectedStock.recommendation.signalType === 'BUY' ? (
                        <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                      )}
                      <span>
                        {inspectedStock.recommendation.action.replace('_', ' ')} RECOMMENDATION
                      </span>
                    </span>

                    <span className="text-xs font-mono font-bold text-slate-300 bg-slate-900 px-2 py-0.5 rounded border border-slate-700">
                      Confidence: {inspectedStock.recommendation.confidence}%
                    </span>

                    <span className="text-xs font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      Horizon: {inspectedStock.recommendation.timeHorizon}
                    </span>
                  </div>

                  <div className="text-xs font-mono font-bold text-slate-300">
                    Risk / Reward:{' '}
                    <span className="text-emerald-400 font-mono font-black">
                      {inspectedStock.recommendation.riskReward}
                    </span>
                  </div>
                </div>

                {/* Recommendation Target Matrix */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono pt-1">
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <Crosshair className="w-3 h-3 text-cyan-400" />
                      ENTRY ZONE
                    </div>
                    <div className="text-sm font-bold text-slate-100 mt-0.5">
                      {inspectedStock.recommendation.entryRange}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-700/50">
                    <div className="text-[10px] text-emerald-400 flex items-center gap-1">
                      <Target className="w-3 h-3 text-emerald-400" />
                      TARGET 1 (+{(((inspectedStock.recommendation.target1 - inspectedStock.price) / inspectedStock.price) * 100).toFixed(1)}%)
                    </div>
                    <div className="text-sm font-black text-emerald-300 mt-0.5">
                      ₹{inspectedStock.recommendation.target1.toFixed(2)}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-teal-950/40 border border-teal-700/50">
                    <div className="text-[10px] text-teal-400 flex items-center gap-1">
                      <Target className="w-3 h-3 text-teal-400" />
                      TARGET 2 (+{(((inspectedStock.recommendation.target2 - inspectedStock.price) / inspectedStock.price) * 100).toFixed(1)}%)
                    </div>
                    <div className="text-sm font-black text-teal-300 mt-0.5">
                      ₹{inspectedStock.recommendation.target2.toFixed(2)}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg bg-rose-950/40 border border-rose-700/50">
                    <div className="text-[10px] text-rose-400 flex items-center gap-1">
                      <ShieldAlert className="w-3 h-3 text-rose-400" />
                      STOP LOSS (-{(((inspectedStock.price - inspectedStock.recommendation.stopLoss) / inspectedStock.price) * 100).toFixed(1)}%)
                    </div>
                    <div className="text-sm font-black text-rose-300 mt-0.5">
                      ₹{inspectedStock.recommendation.stopLoss.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Rationale explanation */}
                <div className="p-3 rounded-lg bg-[#070d18] border border-slate-800 text-xs font-sans text-slate-300 leading-relaxed">
                  <span className="font-mono font-bold text-cyan-400 text-[11px] uppercase mr-1.5">
                    Institutional Thesis:
                  </span>
                  {inspectedStock.recommendation.rationale}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
              <button
                onClick={() => {
                  setShowCodeModal(true);
                  setInspectedStock(null);
                }}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5"
              >
                <Code2 className="w-4 h-4 text-[#00f0ff]" />
                Export TradingView / Python Code
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => {
                    handleExecuteTradeAction(inspectedStock, 'SELL');
                    setInspectedStock(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-rose-950/80 hover:bg-rose-900 border border-rose-700 text-rose-200 font-mono font-bold text-xs transition-all shadow-md flex items-center gap-1.5"
                >
                  <TrendingDown className="w-3.5 h-3.5 text-rose-400" />
                  Execute SELL / Short (₹{inspectedStock.price.toFixed(2)})
                </button>

                <button
                  onClick={() => {
                    handleExecuteTradeAction(inspectedStock, 'BUY');
                    setInspectedStock(null);
                  }}
                  className="px-5 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-mono font-black text-xs transition-all shadow-lg flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5 fill-current" />
                  Execute BUY / Long (₹{inspectedStock.price.toFixed(2)})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* -------------------------------------------------------------------- */}
      {/* 10. TRADINGVIEW PINE SCRIPT & PYTHON EXPORT MODAL                     */}
      {/* -------------------------------------------------------------------- */}
      {showCodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#090e18] border border-slate-700/80 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="p-4 sm:p-6 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="p-2 rounded-lg bg-slate-800 text-[#00f0ff]">
                  <Code2 className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-lg font-black font-mono text-white">
                    SMF Institutional Screener Script Exporter
                  </h3>
                  <p className="text-xs text-slate-400">
                    Complete 8-Component Formula ready for TradingView Pine Script v5 and Python Scanner
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCodeModal(false)}
                className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Code Tabs */}
            <div className="flex items-center justify-between px-6 pt-3 bg-[#070b14] border-b border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveCodeTab('PINE')}
                  className={`px-4 py-2 text-xs font-mono font-bold border-b-2 transition-colors ${
                    activeCodeTab === 'PINE'
                      ? 'border-[#00f0ff] text-[#00f0ff]'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  TradingView Pine Script v5
                </button>
                <button
                  onClick={() => setActiveCodeTab('PYTHON')}
                  className={`px-4 py-2 text-xs font-mono font-bold border-b-2 transition-colors ${
                    activeCodeTab === 'PYTHON'
                      ? 'border-[#00f0ff] text-[#00f0ff]'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Python Institutional Scanner
                </button>
              </div>

              <div className="flex items-center gap-2 pb-2">
                <button
                  onClick={() =>
                    handleCopyCode(
                      activeCodeTab === 'PINE'
                        ? generateSmfPineScript()
                        : generateSmfPythonScannerCode()
                    )
                  }
                  className="px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-slate-200 flex items-center gap-1.5"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() =>
                    handleDownloadCode(
                      activeCodeTab === 'PINE'
                        ? generateSmfPineScript()
                        : generateSmfPythonScannerCode(),
                      activeCodeTab === 'PINE'
                        ? 'SMF_Institutional_Indicator.pine'
                        : 'smf_institutional_scanner.py'
                    )
                  }
                  className="px-3 py-1.5 rounded-md bg-[#00f0ff]/20 hover:bg-[#00f0ff]/30 text-[#00f0ff] border border-[#00f0ff]/40 text-xs font-mono font-bold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </button>
              </div>
            </div>

            {/* Code Body */}
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto bg-[#05080f] font-mono text-xs text-slate-300">
              <pre className="whitespace-pre overflow-x-auto selection:bg-[#00f0ff]/30 leading-relaxed">
                {activeCodeTab === 'PINE'
                  ? generateSmfPineScript()
                  : generateSmfPythonScannerCode()}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
