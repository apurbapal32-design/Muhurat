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

interface NavTabConfig {
  id: string;
  label: string;
  meta?: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const BEGINNER_NAV_TABS: NavTabConfig[] = [
  { id: 'beginner-home', label: 'Beginner Overview', Icon: Sparkles },
  { id: 'agent-management', label: 'Agent Management', meta: '20', Icon: ShieldCheck },
  { id: 'btst-scanner', label: 'BTST Scanner', meta: '2:45–3:20', Icon: Moon },
  { id: 'order-flow-scanner', label: 'Order Flow', meta: 'VP+FP', Icon: Layers },
  { id: 'momentum-dashboard', label: 'Live Momentum', meta: '15', Icon: Flame },
  { id: 'tredye-dashboard', label: 'Tredye Flow Matrix', Icon: Activity },
  { id: 'quant-screener', label: 'Quant Screener', Icon: BarChart3 },
  { id: 'scanner', label: 'Stock Screener', Icon: Target },
  { id: 'index-options', label: 'Options Radar', Icon: Zap },
  { id: 'sector-performance', label: 'Sector Heatmap', Icon: PieChart },
  { id: 'news', label: 'Market News', Icon: Newspaper },
  { id: 'schedule', label: 'Market Timing', Icon: Clock },
  { id: 'broker', label: 'Broker Account', Icon: Server },
];

const PRO_NAV_TABS: NavTabConfig[] = [
  { id: 'agent-management', label: 'Agent Management', meta: '20', Icon: ShieldCheck },
  { id: 'btst-scanner', label: 'BTST Scanner', meta: '2:45–3:20', Icon: Moon },
  { id: 'order-flow-scanner', label: 'Order Flow', meta: 'VP+FP', Icon: Layers },
  { id: 'v9-vega-greeks', label: 'V9 Vega & Greeks', Icon: Zap },
  { id: 'momentum-dashboard', label: 'Live Momentum', meta: '15', Icon: Flame },
  { id: 'tredye-dashboard', label: 'Tredye Flow Matrix', Icon: Activity },
  { id: 'quant-screener', label: 'Quant Screener', Icon: BarChart3 },
  { id: 'top-volume-fno', label: 'Top-Volume F&O', Icon: Layers },
  { id: 'scanner', label: 'Scanner', Icon: Target },
  { id: 'inst-scanner', label: 'Institutional VWAP & OI', Icon: Building2 },
  { id: 'smart-money-scanner', label: 'Smart Money', Icon: Sparkles },
  { id: 'institutional-deals', label: 'Bulk & Block Deals', Icon: Building2 },
  { id: 'sector-performance', label: 'Sector Heatmap', Icon: PieChart },
  { id: 'gift-nifty', label: 'GIFT Nifty', Icon: Globe },
  { id: 'smf-screener', label: 'SMF Screener', Icon: Flame },
  { id: 'hws-v1', label: 'HWS-V1 Setup', Icon: ShieldCheck },
  { id: 'auction-v2', label: 'Auction Strategy V2', Icon: Award },
  { id: 'gap-rs', label: 'Gap & RS Quant', Icon: BarChart3 },
  { id: 'formula-diagnostics', label: 'Formula Diagnostics', Icon: Activity },
  { id: 'holly', label: 'Holly AI Engine', Icon: Brain },
  { id: 'segment-signals', label: 'Segment Signals', Icon: Target },
  { id: 'correlation-matrix', label: 'Correlation Matrix', Icon: Layers },
  { id: 'ai-analysis', label: 'AI Report', Icon: Zap },
  { id: 'oi-ai', label: 'Live OI & Recs', Icon: Brain },
  { id: 'news', label: 'News & Actions', Icon: Newspaper },
  { id: 'backtest', label: 'Backtest', Icon: History },
  { id: 'schedule', label: 'Hours & Holidays', Icon: Calendar },
  { id: 'strategy-matrix', label: 'Target & SL Matrix', Icon: ShieldAlert },
  { id: 'volatility', label: 'Market Volatility', Icon: BarChart3 },
  { id: 'alerts', label: 'Alerts', Icon: AlertTriangle },
  { id: 'broker', label: 'Broker API', Icon: Server },
  { id: 'python-code', label: 'Python Export', Icon: ShieldCheck },
];

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

      {/* Top Brand, Mode & Controls Row */}
      <div className="px-3 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center font-semibold border transition-colors shrink-0 ${
                isDark
                  ? 'bg-slate-900 border-slate-700 text-sky-400'
                  : 'bg-slate-100 border-slate-300 text-sky-700'
              }`}
            >
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display text-base sm:text-lg font-semibold tracking-tight whitespace-nowrap">
                  INTRA-SCAN{' '}
                  <span
                    className={`font-semibold ${
                      isDark ? 'text-sky-400' : 'text-sky-600'
                    }`}
                  >
                    AI v2.4
                  </span>
                </h1>
                <span
                  className={`font-mono text-[10px] font-medium tracking-wider uppercase shrink-0 ${
                    isDark ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  NSE 5M
                </span>
              </div>
              <p className="text-[10.5px] font-display opacity-60 hidden sm:block">
                NSE Nifty 200 Institutional Quant Terminal
              </p>
            </div>
          </div>

          {/* Formal Experience Mode Switcher */}
          {onToggleExperienceMode && (
            <div
              className={`p-0.5 rounded-lg border flex items-center gap-0.5 text-xs font-display shrink-0 ${
                isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-100 border-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => {
                  onToggleExperienceMode('beginner');
                  setActiveTab('beginner-home');
                }}
                className={`h-7 px-2.5 rounded-md transition-[background-color,color] duration-200 flex items-center gap-1.5 cursor-pointer ${
                  experienceMode === 'beginner'
                    ? isDark
                      ? 'bg-slate-800 text-slate-50 font-semibold'
                      : 'bg-white text-slate-950 font-semibold shadow-2xs'
                    : isDark
                    ? 'text-slate-400 hover:text-slate-200 font-medium'
                    : 'text-slate-600 hover:text-slate-950 font-medium'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                <span className="hidden sm:inline">Beginner</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleExperienceMode('pro');
                  if (activeTab === 'beginner-home') setActiveTab('agent-management');
                }}
                className={`h-7 px-2.5 rounded-md transition-[background-color,color] duration-200 flex items-center gap-1.5 cursor-pointer ${
                  experienceMode === 'pro'
                    ? isDark
                      ? 'bg-slate-800 text-slate-50 font-semibold'
                      : 'bg-white text-slate-950 font-semibold shadow-2xs'
                    : isDark
                    ? 'text-slate-400 hover:text-slate-200 font-medium'
                    : 'text-slate-600 hover:text-slate-950 font-medium'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-sky-500" />
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

        {/* Full-Width Formal Unified Navigation Menu Tabs (Dedicated Second Row) */}
        <div
          className={`order-last w-full pt-2.5 border-t ${
            isDark ? 'border-slate-800/80' : 'border-slate-200/80'
          }`}
        >
          <ScrollContainer isDark={isDark} scrollAmount={300}>
            <nav
              role="tablist"
              aria-label="Primary Workspace Navigation"
              className={`flex items-center gap-1 p-1 rounded-xl border font-display transition-colors duration-200 overflow-x-auto max-w-full custom-scrollbar whitespace-nowrap scroll-smooth shrink-0 ${
                isDark
                  ? 'bg-slate-950/85 border-slate-800/90'
                  : 'bg-slate-100/90 border-slate-200/90'
              }`}
            >
              {(experienceMode === 'beginner' ? BEGINNER_NAV_TABS : PRO_NAV_TABS).map(
                ({ id, label, meta, Icon }) => {
                  const isActive = activeTab === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      role="tab"
                      aria-selected={isActive}
                      onClick={() => setActiveTab(id)}
                      className={`group relative h-9 px-3.5 rounded-lg flex items-center gap-2 shrink-0 whitespace-nowrap border text-[12.5px] tracking-[-0.01em] leading-none cursor-pointer transition-[background-color,color,border-color,transform,box-shadow] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/60 ${
                        isActive
                          ? isDark
                            ? 'bg-slate-800/95 text-slate-50 border-slate-700/90 font-semibold shadow-sm'
                            : 'bg-white text-slate-950 border-slate-200/95 font-semibold shadow-sm'
                          : isDark
                          ? 'bg-transparent text-slate-400 border-transparent font-medium hover:text-slate-100 hover:bg-slate-900/80 hover:border-slate-800/80'
                          : 'bg-transparent text-slate-600 border-transparent font-medium hover:text-slate-950 hover:bg-white/70 hover:border-slate-200/70'
                      }`}
                    >
                      <Icon
                        className={`w-3.5 h-3.5 shrink-0 transition-colors duration-200 ${
                          isActive
                            ? isDark
                              ? 'text-sky-400'
                              : 'text-sky-600'
                            : isDark
                            ? 'text-slate-500 group-hover:text-slate-300'
                            : 'text-slate-400 group-hover:text-slate-700'
                        }`}
                      />
                      <span>{label}</span>
                      {meta && (
                        <span
                          className={`font-mono tabular-nums text-[10.5px] font-medium transition-colors duration-200 ${
                            isActive
                              ? isDark
                                ? 'text-sky-400'
                                : 'text-sky-600'
                              : isDark
                              ? 'text-slate-500 group-hover:text-slate-400'
                              : 'text-slate-400 group-hover:text-slate-600'
                          }`}
                        >
                          {meta}
                        </span>
                      )}
                      <span
                        aria-hidden="true"
                        className={`pointer-events-none absolute left-3 right-3 bottom-0 h-[2px] rounded-full transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                          isDark ? 'bg-sky-400' : 'bg-sky-600'
                        } ${isActive ? 'opacity-100 scale-x-100' : 'opacity-0 scale-x-0 group-hover:opacity-35 group-hover:scale-x-75'}`}
                      />
                    </button>
                  );
                }
              )}

              <span
                aria-hidden="true"
                className={`w-px h-5 mx-1 shrink-0 ${isDark ? 'bg-slate-800' : 'bg-slate-300/80'}`}
              />

              {experienceMode === 'beginner' ? (
                <button
                  type="button"
                  onClick={() => {
                    onToggleExperienceMode?.('pro');
                    setActiveTab('agent-management');
                  }}
                  className={`h-9 px-3.5 rounded-lg flex items-center gap-2 shrink-0 whitespace-nowrap border text-[12.5px] font-medium tracking-[-0.01em] leading-none cursor-pointer transition-[background-color,color,border-color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] ${
                    isDark
                      ? 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-950'
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 text-sky-500" />
                  <span>Pro Workspace</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onToggleExperienceMode?.('beginner');
                      setActiveTab('beginner-home');
                    }}
                    className={`h-9 px-3.5 rounded-lg flex items-center gap-2 shrink-0 whitespace-nowrap border text-[12.5px] font-medium tracking-[-0.01em] leading-none cursor-pointer transition-[background-color,color,border-color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] ${
                      isDark
                        ? 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-950'
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Beginner Mode</span>
                  </button>

                  <button
                    type="button"
                    onClick={onOpenUtmModal}
                    className={`h-9 px-3.5 rounded-lg flex items-center gap-2 shrink-0 whitespace-nowrap border text-[12.5px] font-medium tracking-[-0.01em] leading-none cursor-pointer transition-[background-color,color,border-color,transform] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] ${
                      isDark
                        ? 'bg-transparent text-slate-400 border-transparent hover:bg-slate-900/80 hover:text-slate-100 hover:border-slate-800'
                        : 'bg-transparent text-slate-600 border-transparent hover:bg-white/70 hover:text-slate-950 hover:border-slate-200'
                    }`}
                    title="Create UTM links for Mobile or Laptop sharing"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share Link</span>
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

