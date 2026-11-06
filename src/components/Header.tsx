import React, { useEffect, useState, useRef } from 'react';
import {
  Activity,
  AlertTriangle,
  Award,
  BarChart3,
  Brain,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Crosshair,
  Flame,
  History,
  Layers,
  Moon,
  Newspaper,
  Palette,
  Play,
  RefreshCw,
  Server,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Target,
  Volume2,
  VolumeX,
  Zap,
  Sparkles,
  FileSpreadsheet,
  Globe,
  PieChart,
  Scale,
} from 'lucide-react';
import { BrokerConfig, MarketOverview } from '../types';
import { calculateMarketStatus, formatTime12h } from '../data/marketSchedule';
import { ScrollContainer } from './ScrollContainer';

interface HeaderProps {
  overview: MarketOverview;
  broker: BrokerConfig;
  onRefreshScan: () => void;
  isScanning: boolean;
  soundEnabled: boolean;
  onToggleSound: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenUtmModal: () => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
  onSelectTheme?: (theme: 'dark' | 'light' | 'midnight' | 'emerald') => void;
  onToggleTheme?: () => void;
  experienceMode?: 'beginner' | 'pro';
  onToggleExperienceMode?: (mode: 'beginner' | 'pro') => void;
}

export const Header: React.FC<HeaderProps> = ({
  overview,
  broker,
  onRefreshScan,
  isScanning,
  soundEnabled,
  onToggleSound,
  activeTab,
  setActiveTab,
  onOpenUtmModal,
  theme = 'dark',
  onSelectTheme,
  onToggleTheme,
  experienceMode = 'beginner',
  onToggleExperienceMode,
}) => {
  const [countdown, setCountdown] = useState<number>(60);
  const [scanProgress, setScanProgress] = useState<number>(0);
  const [marketStatus, setMarketStatus] = useState(() => calculateMarketStatus());
  const [isThemePickerOpen, setIsThemePickerOpen] = useState<boolean>(false);
  const themePickerRef = useRef<HTMLDivElement>(null);

  const isDark = theme !== 'light';

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (themePickerRef.current && !themePickerRef.current.contains(e.target as Node)) {
        setIsThemePickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          return 60;
        }
        return prev - 1;
      });
      setMarketStatus(calculateMarketStatus());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Handle smooth scan progress simulation during manual scan loop
  useEffect(() => {
    let progressInterval: NodeJS.Timeout | null = null;
    if (isScanning) {
      setScanProgress(5);
      const startTime = Date.now();
      const estimatedDuration = 2200; // estimated ms to complete batch scan
      progressInterval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const pct = Math.min(95, Math.floor((elapsed / estimatedDuration) * 100));
        setScanProgress(pct);
      }, 80);
    } else {
      if (scanProgress > 0) {
        setScanProgress(100);
        const timeout = setTimeout(() => {
          setScanProgress(0);
        }, 800);
        return () => clearTimeout(timeout);
      }
    }
    return () => {
      if (progressInterval) clearInterval(progressInterval);
    };
  }, [isScanning]);

  const resetTimer = () => {
    setCountdown(60);
    onRefreshScan();
  };

  const totalStocks = overview.scannedCount || 114;
  const currentScannedStockCount = Math.min(
    totalStocks,
    Math.round((scanProgress / 100) * totalStocks)
  );

  return (
    <header
      className={`sticky top-0 z-40 transition-colors border-b ${
        isDark
          ? 'bg-slate-900/95 border-slate-800 text-slate-100 backdrop-blur-md'
          : 'bg-white/95 border-slate-200 text-slate-900 shadow-sm backdrop-blur-md'
      }`}
    >
      {/* Top Banner: Benchmark Indices & Live Server Status */}
      <div
        className={`px-3 sm:px-6 py-2 border-b text-xs flex flex-col md:flex-row md:items-center justify-between gap-2 font-mono transition-colors max-w-full overflow-hidden ${
          isDark
            ? 'bg-slate-950/80 border-slate-800/80 text-slate-300'
            : 'bg-slate-100/90 border-slate-200 text-slate-700'
        }`}
      >
        <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto py-0.5 custom-scrollbar max-w-full shrink whitespace-nowrap">
          <div className="flex items-center gap-2 shrink-0">
            <span className="opacity-60 text-[10px] uppercase font-bold tracking-wider">
              NIFTY 50:
            </span>
            <span className="font-bold">
              ₹{overview.nifty50.price.toLocaleString('en-IN')}
            </span>
            <span
              className={`flex items-center text-[11px] font-bold ${
                overview.nifty50.change >= 0
                  ? isDark
                    ? 'text-emerald-400'
                    : 'text-emerald-600'
                  : isDark
                  ? 'text-rose-400'
                  : 'text-rose-600'
              }`}
            >
              {overview.nifty50.change >= 0 ? '+' : ''}
              {overview.nifty50.change} ({overview.nifty50.changePercent}%)
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="opacity-60 text-[10px] uppercase font-bold tracking-wider">
              BANK NIFTY:
            </span>
            <span className="font-bold">
              ₹{overview.bankNifty.price.toLocaleString('en-IN')}
            </span>
            <span
              className={`flex items-center text-[11px] font-bold ${
                overview.bankNifty.change >= 0
                  ? isDark
                    ? 'text-emerald-400'
                    : 'text-emerald-600'
                  : isDark
                  ? 'text-rose-400'
                  : 'text-rose-600'
              }`}
            >
              {overview.bankNifty.change >= 0 ? '+' : ''}
              {overview.bankNifty.change} ({overview.bankNifty.changePercent}%)
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="opacity-60 text-[10px] uppercase font-bold tracking-wider">
              NIFTY IT:
            </span>
            <span className="font-bold">
              ₹{overview.niftyIT.price.toLocaleString('en-IN')}
            </span>
            <span
              className={`flex items-center text-[11px] font-bold ${
                overview.niftyIT.change >= 0
                  ? isDark
                    ? 'text-emerald-400'
                    : 'text-emerald-600'
                  : isDark
                  ? 'text-rose-400'
                  : 'text-rose-600'
              }`}
            >
              {overview.niftyIT.change >= 0 ? '+' : ''}
              {overview.niftyIT.change} ({overview.niftyIT.changePercent}%)
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 text-[11px] overflow-x-auto custom-scrollbar py-0.5 shrink-0 max-w-full whitespace-nowrap">
          {/* Market Status Badge */}
          <button
            onClick={() => setActiveTab('schedule')}
            className={`flex items-center gap-1.5 px-2.5 py-1 uppercase rounded-md border font-mono transition-all hover:scale-[1.02] cursor-pointer shrink-0 ${marketStatus.statusBadgeColor}`}
            title="Click to view Market Schedule & Holiday Calendar"
          >
            <Clock className="w-3.5 h-3.5" />
            <span className="font-bold">{marketStatus.statusLabel}</span>
            <span className="opacity-70 text-[10px] hidden sm:inline">
              ({formatTime12h(marketStatus.hoursConfig.regularOpen)} - {formatTime12h(marketStatus.hoursConfig.regularClose)})
            </span>
          </button>

          <div
            className={`flex items-center gap-1.5 px-2.5 py-1 uppercase rounded border font-mono shrink-0 ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-slate-300'
                : 'bg-white border-slate-300 text-slate-700 shadow-2xs'
            }`}
          >
            <Server className={`w-3.5 h-3.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
            <span className="opacity-60 text-[10px]">BROKER:</span>
            <span className="font-bold">{broker.selectedBroker}</span>
            <span
              className={`w-2 h-2 rounded-full animate-pulse ${
                isDark ? 'bg-emerald-400' : 'bg-emerald-500'
              }`}
            ></span>
          </div>

          <div className="flex items-center gap-1 shrink-0 text-[10px]">
            <Clock className="w-3.5 h-3.5 opacity-60" />
            <span className="opacity-60 uppercase">UPDATED:</span>
            <span className="font-bold">
              {new Date(overview.lastScanTime).toLocaleTimeString('en-IN')}
            </span>
          </div>
        </div>
      </div>

      {/* Main Navigation bar */}
      <div className="px-3 sm:px-6 py-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-md transition-all shrink-0 ${
                isDark
                  ? 'bg-gradient-to-br from-indigo-500 to-emerald-500 text-slate-950 shadow-indigo-500/10'
                  : 'bg-gradient-to-br from-indigo-600 to-emerald-600 text-white shadow-indigo-500/20'
              }`}
            >
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black italic tracking-tight uppercase whitespace-nowrap">
                  INTRA-SCAN{' '}
                  <span
                    className={`not-italic font-bold ${
                      isDark ? 'text-emerald-400' : 'text-emerald-600'
                    }`}
                  >
                    AI v2.4
                  </span>
                </h1>
                <span
                  className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded tracking-widest uppercase border shrink-0 ${
                    isDark
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : 'bg-emerald-50 border-emerald-300 text-emerald-700'
                  }`}
                >
                  NSE 5M
                </span>
              </div>
              <p className="text-[10px] font-mono opacity-60 tracking-[0.18em] uppercase hidden sm:block">
                NSE: NIFTY 200 UNIVERSE QUANT SCAN
              </p>
            </div>
          </div>

          {/* Experience Mode Switcher (Pills) */}
          {onToggleExperienceMode && (
            <div
              className={`p-1 rounded-xl border flex items-center gap-1 text-xs font-bold shrink-0 ${
                isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-100 border-slate-300'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  onToggleExperienceMode('beginner');
                  setActiveTab('beginner-home');
                }}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  experienceMode === 'beginner'
                    ? 'bg-emerald-500 text-slate-950 font-black shadow-sm'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Beginner</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleExperienceMode('pro');
                  if (activeTab === 'beginner-home') setActiveTab('v9-vega-greeks');
                }}
                className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  experienceMode === 'pro'
                    ? 'bg-purple-600 text-white font-black shadow-sm'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Pro Quant</span>
              </button>
            </div>
          )}

          {/* Quick theme/sound toggles for small screens */}
          <div className="flex xl:hidden items-center gap-1.5">
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className={`p-2 rounded-lg border transition-all flex items-center justify-center ${
                  isDark
                    ? 'bg-slate-800/80 border-slate-700 text-amber-300'
                    : 'bg-slate-100 border-slate-300 text-indigo-600'
                }`}
              >
                {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            )}
            <button
              onClick={onToggleSound}
              className={`p-2 rounded-lg border transition-all flex items-center justify-center ${
                isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-slate-100 border-slate-300'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className={`w-4 h-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`} />
              ) : (
                <VolumeX className="w-4 h-4 opacity-40" />
              )}
            </button>
          </div>
        </div>

        {/* Tab Navigation buttons */}
        <div className="flex-1 max-w-full min-w-0">
          <ScrollContainer isDark={isDark} scrollAmount={280}>
            <nav
              className={`flex items-center gap-1 p-1 rounded-xl border text-xs font-mono font-bold uppercase transition-colors overflow-x-auto max-w-full custom-scrollbar whitespace-nowrap scroll-smooth shrink-0 ${
                isDark
                  ? 'bg-slate-950/80 border-slate-800'
                  : 'bg-slate-100 border-slate-200'
              }`}
            >
              {experienceMode === 'beginner' ? (
                <>
                  <button
                    onClick={() => setActiveTab('beginner-home')}
                    className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                      activeTab === 'beginner-home'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md font-black ring-2 ring-emerald-400/40'
                        : isDark
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                        : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 fill-current" />
                    <span>🌟 Beginner Dashboard</span>
                    <span className="px-1.5 py-0.2 text-[9px] bg-slate-950 text-emerald-400 font-black rounded uppercase">
                      EASY
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('momentum-dashboard')}
                    className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                      activeTab === 'momentum-dashboard'
                        ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-slate-950 border-amber-300 shadow-md font-black ring-2 ring-amber-400/40'
                        : isDark
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                        : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5 text-amber-400 fill-current animate-bounce" />
                    <span>⚡ Live Momentum Cockpit</span>
                    <span className="px-1.5 py-0.2 text-[9px] bg-slate-950 text-amber-300 font-black rounded uppercase">
                      TOP 15
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('tredye-dashboard')}
                    className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                      activeTab === 'tredye-dashboard'
                        ? 'bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-600 text-white border-indigo-400 shadow-md font-black ring-2 ring-indigo-400/40'
                        : isDark
                        ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/20'
                        : 'bg-indigo-50 text-indigo-800 border-indigo-300 hover:bg-indigo-100'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                    <span>⚡ Tredye Flow Matrix</span>
                    <span className="px-1.5 py-0.2 text-[9px] bg-slate-950 text-indigo-300 font-black rounded uppercase">
                      PRO UI/UX
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('quant-screener')}
                    className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                      activeTab === 'quant-screener'
                        ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-black ring-2 ring-amber-400/40'
                        : isDark
                        ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                        : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                    }`}
                  >
                    <Flame className="w-3.5 h-3.5 text-amber-400 fill-current animate-pulse" />
                    <span>🔥 Quant Screener Board</span>
                    <span className="px-1.5 py-0.2 text-[9px] bg-slate-950 text-amber-400 font-black rounded uppercase">
                      BUY/SALE
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('scanner')}
                    className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                      activeTab === 'scanner'
                        ? isDark
                          ? 'bg-indigo-600 text-white shadow-md'
                          : 'bg-white text-indigo-700 shadow-sm border-slate-200'
                        : 'opacity-70 hover:opacity-100 border-transparent'
                    }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>Stock Screener</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('index-options')}
                    className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                      activeTab === 'index-options'
                        ? 'bg-cyan-600 text-white border-cyan-400 shadow-md font-black'
                        : isDark
                        ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20'
                        : 'bg-cyan-50 text-cyan-800 border-cyan-300 hover:bg-cyan-100'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-cyan-300" />
                    <span>Options Radar</span>
                    <span className="px-1.5 py-0.2 text-[9px] bg-cyan-400 text-slate-950 font-black rounded uppercase">
                      CALL / PUT
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('sector-performance')}
                    className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                      activeTab === 'sector-performance'
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30 font-black'
                        : isDark
                        ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20'
                        : 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100'
                    }`}
                  >
                    <PieChart className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Sector Heatmap &amp; RS</span>
                    <span className="px-1.5 py-0.2 text-[9px] bg-indigo-500 text-white font-black rounded uppercase">
                      HEATMAP
                    </span>
                  </button>

                  <button
                    onClick={() => setActiveTab('news')}
                    className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                      activeTab === 'news'
                        ? 'bg-amber-600 text-white border-amber-400 shadow-md font-black'
                        : 'opacity-70 hover:opacity-100 border-transparent'
                    }`}
                  >
                    <Newspaper className="w-3.5 h-3.5" />
                    <span>Live Market News</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('schedule')}
                    className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                      activeTab === 'schedule'
                        ? 'bg-slate-700 text-white border-slate-500 shadow-md font-black'
                        : 'opacity-70 hover:opacity-100 border-transparent'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Market Timing</span>
                  </button>

                  <button
                    onClick={() => setActiveTab('broker')}
                    className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                      activeTab === 'broker'
                        ? 'bg-slate-700 text-white border-slate-500 shadow-md font-black'
                        : 'opacity-70 hover:opacity-100 border-transparent'
                    }`}
                  >
                    <Server className="w-3.5 h-3.5" />
                    <span>Broker Account</span>
                  </button>

                  <button
                    onClick={() => {
                      onToggleExperienceMode?.('pro');
                      setActiveTab('v9-vega-greeks');
                    }}
                    className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ml-2 ${
                      isDark
                        ? 'bg-purple-600/20 text-purple-300 border-purple-500/40 hover:bg-purple-600/30'
                        : 'bg-purple-100 text-purple-900 border-purple-300 hover:bg-purple-200'
                    }`}
                  >
                    <Zap className="w-3.5 h-3.5 text-purple-400" />
                    <span>Switch to Pro Quant Mode ⚡</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      onToggleExperienceMode?.('beginner');
                      setActiveTab('beginner-home');
                    }}
                    className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border mr-1 ${
                      isDark
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                    <span>🔰 Beginner Mode</span>
                  </button>
              <button
                onClick={() => setActiveTab('v9-vega-greeks')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'v9-vega-greeks'
                    ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-emerald-600 text-white border-purple-400 shadow-md shadow-purple-500/30 font-black ring-2 ring-purple-400/40'
                    : isDark
                    ? 'bg-purple-500/15 text-purple-300 border-purple-500/40 hover:bg-purple-500/25'
                    : 'bg-purple-50 text-purple-900 border-purple-300 hover:bg-purple-100'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-purple-300 animate-pulse" />
                <span>🚀 V9 Vega + Greeks Engine</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-gradient-to-r from-purple-400 to-emerald-400 text-slate-950 font-black rounded uppercase">
                  V1→V9 QUANT
                </span>
              </button>

              <button
                onClick={() => setActiveTab('momentum-dashboard')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'momentum-dashboard'
                    ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-slate-950 border-amber-300 shadow-md shadow-amber-500/30 font-black ring-2 ring-amber-400/50'
                    : isDark
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                    : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-amber-400 fill-current animate-bounce" />
                <span>⚡ Live Momentum Cockpit</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-slate-950 text-amber-300 font-black rounded uppercase">
                  TOP 15 DYNAMIC
                </span>
              </button>

              <button
                onClick={() => setActiveTab('tredye-dashboard')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'tredye-dashboard'
                    ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 text-white border-indigo-400 shadow-md shadow-indigo-600/30 font-black ring-2 ring-indigo-400/50'
                    : isDark
                    ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40 hover:bg-indigo-500/25'
                    : 'bg-indigo-50 text-indigo-900 border-indigo-300 hover:bg-indigo-100'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-indigo-300 animate-pulse" />
                <span>⚡ Tredye Flow &amp; Divergence Matrix</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-indigo-400 text-slate-950 font-black rounded uppercase">
                  TREDYE
                </span>
              </button>

              <button
                onClick={() => setActiveTab('quant-screener')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'quant-screener'
                    ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-950 border-amber-300 shadow-md font-black ring-2 ring-amber-400/50'
                    : isDark
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                    : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-amber-400 fill-current animate-pulse" />
                <span>🔥 Quant Screener (Listed / Entry / Exit)</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-slate-950 text-amber-400 font-black rounded uppercase">
                  5 MODELS
                </span>
              </button>

              <button
                onClick={() => setActiveTab('top-volume-fno')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'top-volume-fno'
                    ? 'bg-gradient-to-r from-amber-500 via-orange-600 to-indigo-600 text-white border-amber-400 shadow-md shadow-amber-500/30 font-black'
                    : isDark
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                    : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-amber-400 fill-current animate-pulse" />
                <span>Top-Volume F&amp;O Engine</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-amber-400 text-slate-950 font-black rounded uppercase">
                  TOP N
                </span>
              </button>

              <button
                onClick={() => setActiveTab('scanner')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  activeTab === 'scanner'
                    ? isDark
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Scanner</span>
              </button>

              <button
                onClick={() => setActiveTab('inst-scanner')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'inst-scanner'
                    ? 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/30 font-black'
                    : isDark
                    ? 'bg-purple-500/10 text-purple-300 border-purple-500/30 hover:bg-purple-500/20'
                    : 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-purple-300 animate-pulse" />
                <span>Institutional VWAP & OI Scanner</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-purple-500 text-white font-black rounded uppercase">
                  PRO
                </span>
              </button>

              <button
                onClick={() => setActiveTab('smart-money-scanner')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'smart-money-scanner'
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/30 font-black'
                    : isDark
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Smart Money &amp; Accumulation Scanner</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-emerald-400 text-slate-950 font-black rounded uppercase">
                  WYCKOFF + SMC
                </span>
              </button>

              <button
                onClick={() => setActiveTab('institutional-deals')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'institutional-deals'
                    ? 'bg-blue-600 text-white border-blue-400 shadow-md shadow-blue-600/30 font-black'
                    : isDark
                    ? 'bg-blue-500/15 text-blue-300 border-blue-500/40 hover:bg-blue-500/25'
                    : 'bg-blue-50 text-blue-800 border-blue-300 hover:bg-blue-100'
                }`}
              >
                <Building2 className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                <span>Bulk &amp; Block Deals</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-blue-400 text-slate-950 font-black rounded uppercase">
                  FLOW
                </span>
              </button>

              <button
                onClick={() => setActiveTab('sector-performance')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'sector-performance'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30 font-black'
                    : isDark
                    ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/20'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100'
                }`}
              >
                <PieChart className="w-3.5 h-3.5 text-indigo-400" />
                <span>Sector Heatmap &amp; RS</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-indigo-500 text-white font-black rounded uppercase">
                  HEATMAP
                </span>
              </button>

              <button
                onClick={() => setActiveTab('gift-nifty')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'gift-nifty'
                    ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/30 font-black'
                    : isDark
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                    : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                }`}
              >
                <Globe className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>GIFT Nifty AI</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-amber-400 text-slate-950 font-black rounded uppercase">
                  LIVE
                </span>
              </button>

              <button
                onClick={() => setActiveTab('smf-screener')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'smf-screener'
                    ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-rose-600 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/40 font-black ring-2 ring-amber-400/50'
                    : isDark
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                    : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                }`}
              >
                <Flame className="w-3.5 h-3.5 text-amber-400 fill-current animate-pulse" />
                <span>SMF Institutional Screener</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-gradient-to-r from-amber-400 to-orange-400 text-slate-950 font-black rounded uppercase">
                  100 PTS • 8C
                </span>
              </button>

              <button
                onClick={() => setActiveTab('hws-v1')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'hws-v1'
                    ? 'bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 text-white border-emerald-400 shadow-lg shadow-emerald-600/40 font-black ring-2 ring-emerald-400/40'
                    : isDark
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/25'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />
                <span>HWS-V1 Institutional Setup</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-gradient-to-r from-emerald-400 to-teal-300 text-slate-950 font-black rounded uppercase">
                  100 PTS • 5P
                </span>
              </button>

              <button
                onClick={() => setActiveTab('auction-v2')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'auction-v2'
                    ? 'bg-gradient-to-r from-amber-600 via-orange-600 to-emerald-600 text-white border-amber-400 shadow-lg shadow-amber-600/40 font-black'
                    : isDark
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
                    : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                }`}
              >
                <Award className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                <span>Auction Strategy V2</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-gradient-to-r from-amber-400 to-emerald-400 text-slate-950 font-black rounded uppercase">
                  AMT 70%
                </span>
              </button>

              <button
                onClick={() => setActiveTab('gap-rs')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'gap-rs'
                    ? 'bg-amber-600 text-white border-amber-500 shadow-md shadow-amber-600/30 font-black'
                    : isDark
                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                    : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                <span>Gap &amp; RS Quant Scanner</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-emerald-400 text-slate-950 font-black rounded uppercase">
                  100 PTS
                </span>
              </button>

              <button
                onClick={() => setActiveTab('formula-diagnostics')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'formula-diagnostics'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30 font-black'
                    : isDark
                    ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30 hover:bg-indigo-500/20'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-300 hover:bg-indigo-100'
                }`}
              >
                <Activity className="w-3.5 h-3.5 text-indigo-300 animate-pulse" />
                <span>Formula Diagnostics</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-indigo-400 text-slate-950 font-black rounded uppercase">
                  7 VECTORS
                </span>
              </button>

              <button
                onClick={() => setActiveTab('holly')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'holly'
                    ? 'bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 text-white border-purple-400 shadow-lg shadow-purple-600/40 font-black'
                    : isDark
                    ? 'bg-purple-500/15 text-purple-300 border-purple-500/40 hover:bg-purple-500/25'
                    : 'bg-purple-50 text-purple-700 border-purple-300 hover:bg-purple-100'
                }`}
              >
                <Brain className="w-3.5 h-3.5 text-pink-300 animate-pulse" />
                <span>Holly AI Engine</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-gradient-to-r from-pink-400 to-purple-400 text-slate-950 font-black rounded uppercase">
                  AI QUANT
                </span>
              </button>

              <button
                onClick={() => setActiveTab('segment-signals')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'segment-signals'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/30 font-black'
                    : isDark
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100'
                }`}
              >
                <Target className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />
                <span>Segment Signals (BUY/SELL)</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-amber-400 text-slate-950 font-black rounded uppercase">
                  90%+ ACC
                </span>
              </button>

              <button
                onClick={() => setActiveTab('correlation-matrix')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap border ${
                  activeTab === 'correlation-matrix'
                    ? 'bg-gradient-to-r from-teal-600 via-cyan-600 to-indigo-600 text-white border-cyan-400 shadow-lg shadow-cyan-600/30 font-black'
                    : isDark
                    ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/20'
                    : 'bg-cyan-50 text-cyan-800 border-cyan-300 hover:bg-cyan-100'
                }`}
              >
                <Layers className="w-3.5 h-3.5 text-cyan-300 animate-pulse" />
                <span>Signal Correlation Matrix</span>
                <span className="px-1.5 py-0.2 text-[9px] bg-cyan-400 text-slate-950 font-black rounded uppercase">
                  CLUSTERS
                </span>
              </button>

              <button
                onClick={() => setActiveTab('ai-analysis')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  activeTab === 'ai-analysis'
                    ? isDark
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>AI Report</span>
              </button>

              <button
                onClick={() => setActiveTab('oi-ai')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  activeTab === 'oi-ai'
                    ? isDark
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <Brain className="w-3.5 h-3.5 text-indigo-400" />
                <span>Live OI & AI Recs</span>
              </button>

              <button
                onClick={() => setActiveTab('news')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  activeTab === 'news'
                    ? isDark
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <Newspaper className="w-3.5 h-3.5" />
                <span>News & Actions</span>
              </button>

              <button
                onClick={() => setActiveTab('backtest')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  activeTab === 'backtest'
                    ? isDark
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Backtest</span>
              </button>

              <button
                onClick={() => setActiveTab('schedule')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  activeTab === 'schedule'
                    ? isDark
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Hours & Holidays</span>
              </button>

              <button
                onClick={() => setActiveTab('strategy-matrix')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  activeTab === 'strategy-matrix'
                    ? isDark
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>Target & SL Matrix</span>
              </button>

              <button
                onClick={() => setActiveTab('volatility')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  activeTab === 'volatility'
                    ? isDark
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Market Volatility</span>
              </button>

              <button
                onClick={() => setActiveTab('alerts')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  activeTab === 'alerts'
                    ? isDark
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Alerts</span>
              </button>

              <button
                onClick={() => setActiveTab('broker')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  activeTab === 'broker'
                    ? isDark
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>Broker API</span>
              </button>

              <button
                onClick={() => setActiveTab('python-code')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  activeTab === 'python-code'
                    ? isDark
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'bg-white text-indigo-700 shadow-sm border border-slate-200/80'
                    : 'opacity-70 hover:opacity-100'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Python Export</span>
              </button>

              <button
                onClick={onOpenUtmModal}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-lg transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                  isDark
                    ? 'text-emerald-400 hover:bg-emerald-500/10'
                    : 'text-emerald-700 hover:bg-emerald-100'
                }`}
                title="Create UTM links for Mobile or Laptop sharing"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>UTM Link</span>
              </button>
            </>
          )}
            </nav>
          </ScrollContainer>
        </div>

        {/* Action & Control Buttons */}
        <div className="flex items-center gap-2.5 shrink-0 justify-end">
          {/* Theme Palette Dropdown */}
          <div className="relative" ref={themePickerRef}>
            <button
              type="button"
              onClick={() => setIsThemePickerOpen(!isThemePickerOpen)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                isDark
                  ? 'bg-slate-800/80 border-slate-700 text-amber-300 hover:bg-slate-800 shadow-sm'
                  : 'bg-slate-100 border-slate-300 text-indigo-700 hover:bg-slate-200'
              }`}
              title="Change UI Theme"
            >
              <Palette className="w-3.5 h-3.5 text-indigo-400" />
              <span className="hidden sm:inline font-mono capitalize">{theme}</span>
            </button>

            {isThemePickerOpen && (
              <div
                className={`absolute right-0 mt-2 w-56 rounded-2xl border shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-150 ${
                  isDark
                    ? 'bg-slate-900 border-slate-700/80 text-slate-100 shadow-black/60'
                    : 'bg-white border-slate-200 text-slate-800 shadow-slate-300/50'
                }`}
              >
                <div className="px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider opacity-60 border-b border-slate-700/40 mb-1 flex items-center justify-between">
                  <span>Select Color Theme</span>
                  <Palette className="w-3 h-3 text-indigo-400" />
                </div>

                <div className="space-y-1">
                  {[
                    {
                      id: 'dark',
                      name: 'Dark Obsidian',
                      desc: 'Classic Dark Slate & Indigo',
                      bgClass: 'bg-slate-950 border-indigo-500/40',
                      badgeColor: 'bg-indigo-500',
                    },
                    {
                      id: 'midnight',
                      name: 'Midnight Cyber',
                      desc: 'Deep Navy & Cyan Glow',
                      bgClass: 'bg-[#0a0e1a] border-cyan-500/40',
                      badgeColor: 'bg-cyan-500',
                    },
                    {
                      id: 'emerald',
                      name: 'Emerald Trader',
                      desc: 'Dark Mint & Amber Desk',
                      bgClass: 'bg-[#051311] border-emerald-500/40',
                      badgeColor: 'bg-emerald-500',
                    },
                    {
                      id: 'light',
                      name: 'Light Modern',
                      desc: 'Clean High-Contrast White',
                      bgClass: 'bg-slate-100 border-slate-300',
                      badgeColor: 'bg-indigo-600',
                    },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => {
                        if (onSelectTheme) onSelectTheme(item.id as any);
                        setIsThemePickerOpen(false);
                      }}
                      className={`w-full text-left p-2 rounded-xl flex items-center justify-between transition-all border ${
                        theme === item.id
                          ? isDark
                            ? 'bg-slate-800 border-indigo-500/60 font-bold'
                            : 'bg-indigo-50 border-indigo-300 font-bold'
                          : isDark
                          ? 'border-transparent hover:bg-slate-800/60'
                          : 'border-transparent hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className={`w-3.5 h-3.5 rounded-full border ${item.bgClass} flex shrink-0 items-center justify-center`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${item.badgeColor}`} />
                        </span>
                        <div>
                          <div className="text-xs font-semibold">{item.name}</div>
                          <div className="text-[9px] opacity-60 font-mono">{item.desc}</div>
                        </div>
                      </div>
                      {theme === item.id && <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sound Toggle (Desktop) */}
          <button
            onClick={onToggleSound}
            className={`hidden xl:flex p-2.5 rounded-xl border transition-all items-center justify-center ${
              isDark
                ? 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
            }`}
            title={soundEnabled ? 'Mute audio alerts' : 'Enable audio alerts'}
          >
            {soundEnabled ? (
              <Volume2
                className={`w-4 h-4 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}
              />
            ) : (
              <VolumeX className="w-4 h-4 opacity-40" />
            )}
          </button>

          {/* Scan Progress / Timer */}
          {isScanning || scanProgress > 0 ? (
            <div
              className={`flex items-center gap-2.5 border px-3 py-1.5 text-xs font-mono rounded-xl transition-all ${
                isDark
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-emerald-300 bg-emerald-50'
              }`}
            >
              <RefreshCw
                className={`w-3.5 h-3.5 animate-spin ${
                  isDark ? 'text-emerald-400' : 'text-emerald-600'
                }`}
              />
              <div className="flex flex-col min-w-[120px]">
                <div
                  className={`flex items-center justify-between gap-2 text-[10px] font-bold ${
                    isDark ? 'text-emerald-400' : 'text-emerald-700'
                  }`}
                >
                  <span>UNIVERSE SCAN</span>
                  <span>{scanProgress}%</span>
                </div>
                <div
                  className={`w-full h-1.5 rounded-full overflow-hidden border mt-0.5 ${
                    isDark
                      ? 'bg-slate-900 border-emerald-500/30'
                      : 'bg-slate-200 border-emerald-300'
                  }`}
                >
                  <div
                    className={`h-full transition-all duration-150 ${
                      isDark ? 'bg-emerald-400 shadow-[0_0_8px_#10B981]' : 'bg-emerald-600'
                    }`}
                    style={{ width: `${scanProgress}%` }}
                  />
                </div>
                <div className="text-[9px] opacity-70 mt-0.5 font-sans">
                  {currentScannedStockCount}/{totalStocks} stocks
                </div>
              </div>
            </div>
          ) : (
            <div
              className={`flex items-center gap-2 border px-3 py-2 text-xs font-mono rounded-xl ${
                isDark
                  ? 'border-slate-800 bg-slate-950/60'
                  : 'border-slate-200 bg-slate-50'
              }`}
            >
              <span className="opacity-60 uppercase text-[10px]">AUTO-SCAN:</span>
              <span
                className={`font-bold w-6 text-center ${
                  isDark ? 'text-emerald-400' : 'text-emerald-600'
                }`}
              >
                {countdown}s
              </span>
            </div>
          )}

          {/* Trigger Scan Button */}
          <button
            onClick={resetTimer}
            disabled={isScanning}
            className={`px-4 py-2.5 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all flex items-center gap-2 shadow-md disabled:opacity-50 ${
              isDark
                ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20'
                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
            <span>{isScanning ? `${scanProgress}%` : 'Scan Now'}</span>
          </button>
        </div>
      </div>

      {/* Global Full-Width Scan Progress Bar Strip */}
      {(isScanning || scanProgress > 0) && (
        <div
          className={`w-full h-1.5 relative overflow-hidden border-t ${
            isDark ? 'bg-slate-950 border-emerald-500/30' : 'bg-slate-100 border-emerald-300'
          }`}
        >
          <div
            className={`h-full transition-all duration-150 ease-out ${
              isDark
                ? 'bg-gradient-to-r from-emerald-500/40 via-emerald-400 to-emerald-400 shadow-[0_0_12px_#10B981]'
                : 'bg-gradient-to-r from-emerald-500 via-emerald-600 to-emerald-600'
            }`}
            style={{ width: `${scanProgress}%` }}
          />
        </div>
      )}
    </header>
  );
};

