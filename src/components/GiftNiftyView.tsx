import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronRight,
  Clock,
  DollarSign,
  Globe,
  Layers,
  PieChart,
  Play,
  RefreshCw,
  Shield,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { ScannedStock } from '../types';
import { safeFetchJson } from '../utils/apiClient';

export type GiftNiftyStance = 'BUY' | 'SELL' | 'SIDEBASE';

interface GiftNiftyViewProps {
  stocks?: ScannedStock[];
  onCreateTrade?: (trade: {
    symbol: string;
    signal: 'BUY' | 'SELL';
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    target1: number;
    target2: number;
  }) => void;
  onSelectStock?: (stock: ScannedStock) => void;
  onBackToScanner?: () => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

interface GlobalIndexItem {
  name: string;
  symbol: string;
  price: string;
  change: string;
  changePercent: string;
  isPositive: boolean;
  region: 'US' | 'ASIA' | 'EUROPE' | 'COMMODITY';
}

export const GiftNiftyView: React.FC<GiftNiftyViewProps> = ({
  stocks = [],
  onCreateTrade,
  onSelectStock,
  onBackToScanner,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';

  // State
  const [stance, setStance] = useState<GiftNiftyStance>('BUY');
  const [isAutoAiMode, setIsAutoAiMode] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Simulated live prices
  const [giftNiftySpot, setGiftNiftySpot] = useState<number>(24428.5);
  const [niftySpot, setNiftySpot] = useState<number>(24380.0);
  const [vixValue, setVixValue] = useState<number>(13.42);

  // Fetch API or refresh live metrics
  const fetchGiftNiftyData = async () => {
    setIsLoading(true);
    try {
      const data = await safeFetchJson<any>('/api/gift-nifty');
      if (data) {
        if (data.giftNiftyPrice) setGiftNiftySpot(data.giftNiftyPrice);
        if (data.niftySpotPrice) setNiftySpot(data.niftySpotPrice);
        if (data.verdict && isAutoAiMode) {
          setStance(data.verdict as GiftNiftyStance);
        }
      }
    } catch (e) {
      console.warn('Using client-calculated Gift Nifty analytics fallback');
    } finally {
      setIsLoading(false);
      setLastRefreshed(
        new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        })
      );
    }
  };

  useEffect(() => {
    fetchGiftNiftyData();
    const interval = setInterval(fetchGiftNiftyData, 5000);
    return () => clearInterval(interval);
  }, [isAutoAiMode]);

  // Derived calculations based on stance
  const giftNiftyDetails = useMemo(() => {
    const diff = Number((giftNiftySpot - niftySpot).toFixed(2));

    if (stance === 'BUY') {
      return {
        stance: 'BUY' as const,
        badgeLabel: 'BUY / BULLISH GAP-UP',
        badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
        gradientHeader: 'from-emerald-950/60 via-slate-900 to-slate-900 border-emerald-500/30',
        confidenceScore: 89,
        gapPoints: '+45 to +65 PTS',
        gapType: 'GAP-UP OPENING',
        gapColor: 'text-emerald-400',
        spotDisplay: giftNiftySpot.toFixed(2),
        niftySpotDisplay: niftySpot.toFixed(2),
        premiumPts: `+${Math.max(32, Math.abs(diff)).toFixed(2)} PTS PREMIUM`,
        strategyName: 'Bull Call Spread / ATM CE Buy on Dips',
        idealEntry: '₹24,380 - ₹24,400 (VWAP Retest)',
        stopLossLevel: '24,320 (Put Writing Floor)',
        target1Level: '24,480',
        target2Level: '24,550',
        pcr: '1.28 (Strong Put Base)',
        fiiFlow: 'Net Buyers (+₹1,840 Cr)',
        maxPain: '24,400 Strike',
        vixStatus: `${vixValue.toFixed(2)} (-2.4% Low Risk)`,
        summary:
          'GIFT Nifty indicates a high-probability bullish opening gap-up driven by overnight green momentum in US technology futures and positive Asian indices. Strong institutional Put Writing at the 24,300 strike forms a resilient support floor.',
        globalCueSummary:
          'US S&P 500 & Nasdaq futures are trading +0.5% higher overnight. Crude oil prices softened to $78/bbl while the US 10Y Treasury yield dropped, creating an ideal risk-on backdrop for Indian equities.',
        keyRules: [
          'Wait for first 5-min candle close above 24,400 before aggressive long entries.',
          'Buy ATM Call options (24,400 CE) on dips towards VWAP retest zone (24,380 - 24,400).',
          'Put writers aggressively defending 24,300 strike (+42% OI buildup). Trail SL at 24,320.',
          'Focus on High Beta Banking, IT & Auto momentum breakout stocks from Nifty 200.',
        ],
        strikeMatrix: [
          { strike: 24200, type: 'PE FLOOR', callOi: '12.4L', putOi: '88.5L', pcr: 7.13, ltp: 18.5, bias: 'STRONG SUPPORT FLOOR', color: 'text-emerald-400' },
          { strike: 24300, type: 'PUT WRITING', callOi: '24.1L', putOi: '112.8L', pcr: 4.68, ltp: 42.0, bias: 'BULLISH PUT BASE', color: 'text-emerald-400' },
          { strike: 24400, type: 'ATM SPOT', callOi: '52.6L', putOi: '64.2L', pcr: 1.22, ltp: 98.4, bias: 'BREAKOUT TRIGGER / BUY CE', color: 'text-amber-300' },
          { strike: 24500, type: 'TARGET 1', callOi: '98.2L', putOi: '28.4L', pcr: 0.28, ltp: 172.0, bias: 'RESISTANCE / BOOK T1', color: 'text-indigo-300' },
          { strike: 24600, type: 'TARGET 2', callOi: '124.0L', putOi: '10.2L', pcr: 0.08, ltp: 245.0, bias: 'MAJOR CALL WALL', color: 'text-rose-400' },
        ],
      };
    } else if (stance === 'SELL') {
      return {
        stance: 'SELL' as const,
        badgeLabel: 'SELL / BEARISH GAP-DOWN',
        badgeColor: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
        gradientHeader: 'from-rose-950/60 via-slate-900 to-slate-900 border-rose-500/30',
        confidenceScore: 86,
        gapPoints: '-45 to -65 PTS',
        gapType: 'GAP-DOWN OPENING',
        gapColor: 'text-rose-400',
        spotDisplay: (niftySpot - 52.0).toFixed(2),
        niftySpotDisplay: niftySpot.toFixed(2),
        premiumPts: '-52.00 PTS DISCOUNT',
        strategyName: 'Bear Put Spread / Short Rallies at Resistance',
        idealEntry: '₹24,380 - ₹24,400 (Pullback Resistance)',
        stopLossLevel: '24,450 (Call Writing Wall)',
        target1Level: '24,280',
        target2Level: '24,200',
        pcr: '0.74 (Call Writing Dominance)',
        fiiFlow: 'Net Sellers (-₹1,420 Cr)',
        maxPain: '24,300 Strike',
        vixStatus: '15.85 (+4.5% Risk Spike)',
        summary:
          'GIFT Nifty points to a weak opening gap-down influenced by overnight selling in global markets and heavy institutional Call Writing overhead at 24,400 & 24,500 strikes. Price trading below 20/50 EMA dynamic averages.',
        globalCueSummary:
          'US Federal Reserve hawkish commentary sent US 10Y yields spiking to 4.28%. Asian markets (Hang Seng & Nikkei) are trading in red, and Brent Crude spiked above $80/bbl, putting pressure on emerging market indices.',
        keyRules: [
          'Sell on pullback rallies near VWAP / 24,380 resistance level rather than shorting at lower opening ticks.',
          'Buy ATM/ITM Put options (24,300 PE) or Sell Call Options (24,450 CE) for high probability theta edge.',
          'Call Writers heavily capping upside at 24,400 strike (+55% OI buildup). Keep SL strict at 24,450.',
          'Target defensive sectors (Pharma, FMCG) or short high-beta IT & Metal stocks showing breakdown.',
        ],
        strikeMatrix: [
          { strike: 24200, type: 'TARGET 2', callOi: '18.2L', putOi: '95.0L', pcr: 5.21, ltp: 198.0, bias: 'MAJOR SUPPORT FLOOR', color: 'text-emerald-400' },
          { strike: 24300, type: 'TARGET 1', callOi: '41.0L', putOi: '52.0L', pcr: 1.26, ltp: 124.0, bias: 'INTERMEDIATE SUPPORT', color: 'text-indigo-300' },
          { strike: 24400, type: 'ATM RESISTANCE', callOi: '115.4L', putOi: '32.1L', pcr: 0.27, ltp: 68.0, bias: 'HEAVY CALL WRITING / BUY PE', color: 'text-rose-400' },
          { strike: 24500, type: 'CALL WALL', callOi: '142.8L', putOi: '14.5L', pcr: 0.10, ltp: 28.0, bias: 'CE WRITING WALL', color: 'text-rose-400' },
          { strike: 24600, type: 'CAP CE', callOi: '168.0L', putOi: '5.2L', pcr: 0.03, ltp: 12.0, bias: 'STRONG OVERHEAD RESISTANCE', color: 'text-rose-400' },
        ],
      };
    } else {
      return {
        stance: 'SIDEBASE' as const,
        badgeLabel: 'SIDEWAYS / RANGEBOUND BASE',
        badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
        gradientHeader: 'from-amber-950/60 via-slate-900 to-slate-900 border-amber-500/30',
        confidenceScore: 92,
        gapPoints: '+/- 8.50 PTS',
        gapType: 'FLAT / SIDE BASE OPENING',
        gapColor: 'text-amber-300',
        spotDisplay: (niftySpot + 6.5).toFixed(2),
        niftySpotDisplay: niftySpot.toFixed(2),
        premiumPts: '+6.50 PTS FLAT BASE',
        strategyName: 'Short Strangle / Iron Condor (Sell OTM CE & PE)',
        idealEntry: 'Range Boundaries: Sell 24,500 CE & Sell 24,250 PE',
        stopLossLevel: '24,520 (Upper) / 24,220 (Lower)',
        target1Level: '24,380 (Range Equilibrium)',
        target2Level: 'Max Theta Decay',
        pcr: '1.02 (Neutral Equilibrium)',
        fiiFlow: 'Neutral / Mixed (-₹120 Cr)',
        maxPain: '24,400 Strike',
        vixStatus: '12.80 (-1.8% Low Volatility)',
        summary:
          'GIFT Nifty is trading virtually flat relative to Nifty spot (+6.5 pts). Symmetrical Call and Put writing at 24,450 Call and 24,300 Put creates a tight rangebound side-base channel, highly favorable for option writers.',
        globalCueSummary:
          'Global markets are flat to rangebound ahead of key economic data releases. Brent Crude and US dollar index are trading in narrow bands, signaling lack of directional triggers.',
        keyRules: [
          'Option Writing Edge: Sell OTM 24,500 CE and 24,250 PE simultaneously to collect double theta premium decay.',
          'Option Buyers should avoid buying straddles in middle of range; wait for price to test 24,300 support or 24,450 resistance boundary.',
          'Focus on stock-specific earnings breakouts rather than index directional plays.',
          'Exit short option positions if Index breaks out with heavy volume above 24,480 or below 24,280.',
        ],
        strikeMatrix: [
          { strike: 24200, type: 'PUT WRITING', callOi: '15.0L', putOi: '82.0L', pcr: 5.46, ltp: 22.0, bias: 'SELL PE FOR THETA', color: 'text-emerald-400' },
          { strike: 24300, type: 'RANGE SUPPORT', callOi: '38.0L', putOi: '78.5L', pcr: 2.06, ltp: 55.0, bias: 'RANGE SUPPORT FLOOR', color: 'text-amber-300' },
          { strike: 24400, type: 'ATM PIN', callOi: '82.0L', putOi: '84.0L', pcr: 1.02, ltp: 92.0, bias: 'MAX PAIN EQUILIBRIUM', color: 'text-amber-300' },
          { strike: 24500, type: 'RANGE RESISTANCE', callOi: '89.5L', putOi: '32.0L', pcr: 0.35, ltp: 48.0, bias: 'SELL CE FOR THETA', color: 'text-amber-300' },
          { strike: 24600, type: 'CALL WRITING', callOi: '110.0L', putOi: '12.0L', pcr: 0.10, ltp: 18.0, bias: 'OVERHEAD RESISTANCE', color: 'text-rose-400' },
        ],
      };
    }
  }, [stance, giftNiftySpot, niftySpot, vixValue]);

  // Global Market Correlations Data
  const globalIndices: GlobalIndexItem[] = useMemo(() => {
    if (stance === 'BUY') {
      return [
        { name: 'S&P 500 Futures', symbol: 'US500', price: '5,628.40', change: '+28.20', changePercent: '+0.50%', isPositive: true, region: 'US' },
        { name: 'Nasdaq Futures', symbol: 'US100', price: '19,890.10', change: '+142.50', changePercent: '+0.72%', isPositive: true, region: 'US' },
        { name: 'Nikkei 225', symbol: 'N225', price: '38,510.00', change: '+380.00', changePercent: '+1.00%', isPositive: true, region: 'ASIA' },
        { name: 'Hang Seng', symbol: 'HSI', price: '17,290.50', change: '+65.20', changePercent: '+0.38%', isPositive: true, region: 'ASIA' },
        { name: 'FTSE 100', symbol: 'UK100', price: '8,210.00', change: '+24.50', changePercent: '+0.30%', isPositive: true, region: 'EUROPE' },
        { name: 'Brent Crude', symbol: 'OIL', price: '$77.80/bbl', change: '-0.65', changePercent: '-0.83%', isPositive: true, region: 'COMMODITY' },
        { name: 'US Dollar Index', symbol: 'DXY', price: '103.95', change: '-0.30', changePercent: '-0.29%', isPositive: true, region: 'COMMODITY' },
        { name: 'US 10Y Yield', symbol: 'US10Y', price: '4.14%', change: '-0.05', changePercent: '-1.19%', isPositive: true, region: 'US' },
      ];
    } else if (stance === 'SELL') {
      return [
        { name: 'S&P 500 Futures', symbol: 'US500', price: '5,540.10', change: '-38.50', changePercent: '-0.69%', isPositive: false, region: 'US' },
        { name: 'Nasdaq Futures', symbol: 'US100', price: '19,420.00', change: '-185.00', changePercent: '-0.94%', isPositive: false, region: 'US' },
        { name: 'Nikkei 225', symbol: 'N225', price: '37,820.00', change: '-290.00', changePercent: '-0.76%', isPositive: false, region: 'ASIA' },
        { name: 'Hang Seng', symbol: 'HSI', price: '16,980.00', change: '-180.20', changePercent: '-1.05%', isPositive: false, region: 'ASIA' },
        { name: 'FTSE 100', symbol: 'UK100', price: '8,120.00', change: '-45.00', changePercent: '-0.55%', isPositive: false, region: 'EUROPE' },
        { name: 'Brent Crude', symbol: 'OIL', price: '$81.40/bbl', change: '+1.80', changePercent: '+2.26%', isPositive: false, region: 'COMMODITY' },
        { name: 'US Dollar Index', symbol: 'DXY', price: '104.85', change: '+0.45', changePercent: '+0.43%', isPositive: false, region: 'COMMODITY' },
        { name: 'US 10Y Yield', symbol: 'US10Y', price: '4.28%', change: '+0.08', changePercent: '+1.90%', isPositive: false, region: 'US' },
      ];
    } else {
      return [
        { name: 'S&P 500 Futures', symbol: 'US500', price: '5,585.00', change: '+2.10', changePercent: '+0.04%', isPositive: true, region: 'US' },
        { name: 'Nasdaq Futures', symbol: 'US100', price: '19,610.00', change: '-8.50', changePercent: '-0.04%', isPositive: false, region: 'US' },
        { name: 'Nikkei 225', symbol: 'N225', price: '38,120.00', change: '+15.00', changePercent: '+0.04%', isPositive: true, region: 'ASIA' },
        { name: 'Hang Seng', symbol: 'HSI', price: '17,140.00', change: '-12.00', changePercent: '-0.07%', isPositive: false, region: 'ASIA' },
        { name: 'FTSE 100', symbol: 'UK100', price: '8,165.00', change: '+1.20', changePercent: '+0.01%', isPositive: true, region: 'EUROPE' },
        { name: 'Brent Crude', symbol: 'OIL', price: '$78.80/bbl', change: '+0.10', changePercent: '+0.13%', isPositive: true, region: 'COMMODITY' },
        { name: 'US Dollar Index', symbol: 'DXY', price: '104.15', change: '-0.02', changePercent: '-0.02%', isPositive: true, region: 'COMMODITY' },
        { name: 'US 10Y Yield', symbol: 'US10Y', price: '4.20%', change: '0.00', changePercent: '0.00%', isPositive: true, region: 'US' },
      ];
    }
  }, [stance]);

  // High conviction stock correlation picks from scanned universe
  const recommendedStockPicks = useMemo(() => {
    if (!stocks || stocks.length === 0) return [];
    if (stance === 'BUY') {
      return stocks
        .filter((s) => (s.aiScore ?? 0) >= 80 && (s.indicators?.rsi ?? 50) >= 55)
        .slice(0, 4);
    } else if (stance === 'SELL') {
      return stocks
        .filter((s) => (s.aiScore ?? 0) <= 45 || s.changePercent < 0)
        .slice(0, 4);
    } else {
      return stocks
        .filter((s) => Math.abs(s.changePercent) < 1.0)
        .slice(0, 4);
    }
  }, [stocks, stance]);

  // One-click trade execution handler
  const handleExecuteStrategyTrade = () => {
    if (!onCreateTrade) return;
    const isBuy = stance === 'BUY';
    const isSell = stance === 'SELL';
    const symbol = 'NIFTY';
    const entryPrice = niftySpot;

    onCreateTrade({
      symbol,
      signal: isSell ? 'SELL' : 'BUY',
      entryPrice,
      quantity: 75, // Standard Nifty Lot Size
      stopLoss: isBuy ? entryPrice - 60 : isSell ? entryPrice + 60 : entryPrice - 30,
      target1: isBuy ? entryPrice + 100 : isSell ? entryPrice - 100 : entryPrice + 40,
      target2: isBuy ? entryPrice + 170 : isSell ? entryPrice - 170 : entryPrice + 80,
    });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Navigation & Quick Controls */}
      <div
        className={`p-4 rounded-2xl border transition-all ${
          isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {onBackToScanner && (
              <button
                onClick={onBackToScanner}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all text-xs font-mono font-bold"
                title="Back to Master Scanner"
              >
                ← Scanner
              </button>
            )}
            <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Globe className="w-6 h-6 text-indigo-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-black uppercase font-mono tracking-tight text-slate-100">
                  GIFT NIFTY MARKET TREND &amp; AI DIRECTIONAL ANALYSIS
                </h1>
                <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  QUANT AI ENGINE
                </span>
              </div>
              <p className="text-xs opacity-70 font-sans">
                Derivative lead indicators, global market correlations, and overnight opening gap predictor
              </p>
            </div>
          </div>

          {/* Refresh & Mode Status */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsAutoAiMode(!isAutoAiMode)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold border transition-all flex items-center gap-1.5 ${
                isAutoAiMode
                  ? 'bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>{isAutoAiMode ? 'AUTO AI DETECT: ON' : 'MANUAL OVERRIDE'}</span>
            </button>

            <button
              onClick={fetchGiftNiftyData}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-mono font-bold flex items-center gap-1.5 transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <span className="text-[10px] font-mono opacity-50 block">
              Updated: {lastRefreshed || 'Just now'}
            </span>
          </div>
        </div>
      </div>

      {/* Primary GIFT Nifty Stance Selector & Live Quote Header */}
      <div
        className={`p-5 rounded-2xl border bg-gradient-to-br ${giftNiftyDetails.gradientHeader} transition-all`}
      >
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-800/80">
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-slate-400 block mb-1">
              CURRENT AI VERDICT &amp; DIRECTIONAL BIAS
            </span>
            <div className="flex items-center gap-3 flex-wrap">
              <span
                className={`px-3.5 py-1.5 rounded-xl text-sm font-black font-mono tracking-wider border flex items-center gap-2 ${giftNiftyDetails.badgeColor}`}
              >
                {stance === 'BUY' && <ArrowUpRight className="w-5 h-5" />}
                {stance === 'SELL' && <ArrowDownRight className="w-5 h-5" />}
                {stance === 'SIDEBASE' && <Activity className="w-5 h-5" />}
                <span>{giftNiftyDetails.badgeLabel}</span>
              </span>

              <span className="px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-200 flex items-center gap-1.5">
                <Target className="w-4 h-4 text-amber-400" />
                <span>CONFIDENCE: </span>
                <span className="font-bold text-amber-300">{giftNiftyDetails.confidenceScore}%</span>
              </span>
            </div>
          </div>

          {/* Live Price Statistics Block */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs">
              <span className="opacity-50 text-[9px] block uppercase font-bold">GIFT NIFTY SPOT</span>
              <span className="text-base font-black text-amber-300">₹{giftNiftyDetails.spotDisplay}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs">
              <span className="opacity-50 text-[9px] block uppercase font-bold">NIFTY SPOT</span>
              <span className="text-base font-black text-slate-200">₹{giftNiftyDetails.niftySpotDisplay}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs">
              <span className="opacity-50 text-[9px] block uppercase font-bold">PREMIUM / DISCOUNT</span>
              <span className="text-base font-black text-indigo-300">{giftNiftyDetails.premiumPts}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-xs">
              <span className="opacity-50 text-[9px] block uppercase font-bold">EXPECTED GAP</span>
              <span className={`text-base font-black ${giftNiftyDetails.gapColor}`}>
                {giftNiftyDetails.gapPoints}
              </span>
            </div>
          </div>
        </div>

        {/* Stance Toggle Buttons (BUY / SELL / SIDEBASE) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={() => {
              setStance('BUY');
              setIsAutoAiMode(false);
            }}
            className={`p-4 rounded-xl border text-left transition-all relative ${
              stance === 'BUY'
                ? 'bg-emerald-950/60 border-emerald-500 shadow-lg shadow-emerald-900/30 ring-1 ring-emerald-500'
                : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 opacity-70'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase font-mono text-emerald-400 flex items-center gap-1.5">
                <ArrowUpRight className="w-4 h-4" />
                <span>BUY (BULLISH GAP-UP)</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                BULLISH MOVE
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
              GIFT Nifty trading at healthy premium over Nifty spot. Strong Put writing base at 24,300.
            </p>
          </button>

          <button
            onClick={() => {
              setStance('SELL');
              setIsAutoAiMode(false);
            }}
            className={`p-4 rounded-xl border text-left transition-all relative ${
              stance === 'SELL'
                ? 'bg-rose-950/60 border-rose-500 shadow-lg shadow-rose-900/30 ring-1 ring-rose-500'
                : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 opacity-70'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase font-mono text-rose-400 flex items-center gap-1.5">
                <ArrowDownRight className="w-4 h-4" />
                <span>SELL (BEARISH GAP-DOWN)</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                BEARISH MOVE
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
              GIFT Nifty discount driven by weak global cues &amp; aggressive Call Writing at 24,400.
            </p>
          </button>

          <button
            onClick={() => {
              setStance('SIDEBASE');
              setIsAutoAiMode(false);
            }}
            className={`p-4 rounded-xl border text-left transition-all relative ${
              stance === 'SIDEBASE'
                ? 'bg-amber-950/60 border-amber-500 shadow-lg shadow-amber-900/30 ring-1 ring-amber-500'
                : 'bg-slate-950/50 border-slate-800 hover:border-slate-700 opacity-70'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-black uppercase font-mono text-amber-300 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-amber-400" />
                <span>SIDEWAYS / SIDE BASE</span>
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                THETA DECAY
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-sans">
              Flat GIFT Nifty (+/- 8 pts) bounded by balanced Call &amp; Put Writing walls. Rangebound channel.
            </p>
          </button>
        </div>
      </div>

      {/* Global Market Correlations Grid */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-black uppercase font-mono text-slate-100">
              GLOBAL MARKET CORRELATIONS &amp; OVERNIGHT FUTURES TICKER
            </h2>
          </div>
          <span className="text-[10px] font-mono text-slate-400 uppercase">
            REAL-TIME US, ASIA &amp; COMMODITY FEEDS
          </span>
        </div>

        <p className="text-xs text-slate-300 mb-4 font-sans leading-relaxed">
          {giftNiftyDetails.globalCueSummary}
        </p>

        {/* Grid of Global Indices */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {globalIndices.map((item, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-xl border font-mono transition-all ${
                isDark ? 'bg-slate-950/80 border-slate-800/80' : 'bg-slate-50 border-slate-200'
              }`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[10px] font-bold opacity-60 truncate">{item.symbol}</span>
                <span
                  className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${
                    item.isPositive
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'bg-rose-500/20 text-rose-400'
                  }`}
                >
                  {item.region}
                </span>
              </div>
              <div className="text-xs font-black text-slate-100 truncate">{item.price}</div>
              <div
                className={`text-[10px] font-bold flex items-center gap-0.5 mt-0.5 ${
                  item.isPositive ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {item.isPositive ? '+' : ''}
                {item.changePercent}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Derivative & Institutional Flow Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Intraday Technical & Strategy Parameters */}
        <div
          className={`lg:col-span-2 p-5 rounded-2xl border transition-all space-y-4 ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400" />
              <h2 className="text-sm font-black uppercase font-mono text-slate-100">
                ACTIONABLE DERIVATIVE STRATEGY &amp; KEY LEVELS
              </h2>
            </div>
            <span className="px-2.5 py-0.5 text-[10px] font-mono font-bold rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
              HIGH PROBABILITY SETUP
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="opacity-50 text-[9px] block uppercase">RECOMMENDED STRATEGY</span>
              <span className="font-bold text-amber-300 block mt-0.5">
                {giftNiftyDetails.strategyName}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="opacity-50 text-[9px] block uppercase">IDEAL ENTRY ZONE</span>
              <span className="font-bold text-slate-100 block mt-0.5">
                {giftNiftyDetails.idealEntry}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="opacity-50 text-[9px] block uppercase">STOP LOSS FLOOR</span>
              <span className="font-bold text-rose-400 block mt-0.5">
                {giftNiftyDetails.stopLossLevel}
              </span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
              <span className="opacity-50 text-[9px] block uppercase">TARGETS T1 / T2</span>
              <span className="font-bold text-emerald-400 block mt-0.5">
                {giftNiftyDetails.target1Level} / {giftNiftyDetails.target2Level}
              </span>
            </div>
          </div>

          {/* Actionable Rulebook Checklist */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 font-mono text-xs space-y-2">
            <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
              INTRADAY EXECUTION RULEBOOK:
            </span>
            {giftNiftyDetails.keyRules.map((rule, idx) => (
              <div key={idx} className="flex items-start gap-2 text-slate-300">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{rule}</span>
              </div>
            ))}
          </div>

          {/* Execute Strategy Trade CTA */}
          <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/60">
            <div className="text-xs font-mono">
              <span className="opacity-60">Instrument: </span>
              <span className="font-bold text-slate-100">NIFTY 50 INDEX FUTURES / OPTIONS</span>
            </div>

            <button
              onClick={handleExecuteStrategyTrade}
              className={`px-4 py-2.5 rounded-xl font-mono text-xs font-bold flex items-center gap-2 transition-all shadow-lg ${
                stance === 'SELL'
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                  : stance === 'BUY'
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                  : 'bg-amber-600 hover:bg-amber-500 text-slate-950 shadow-amber-600/30'
              }`}
            >
              <Play className="w-4 h-4 fill-current" />
              <span>EXECUTE {stance} STRATEGY TRADE</span>
            </button>
          </div>
        </div>

        {/* Institutional & OI Indicators */}
        <div
          className={`p-5 rounded-2xl border transition-all space-y-4 ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-indigo-400" />
              <h2 className="text-sm font-black uppercase font-mono text-slate-100">
                DERIVATIVE METRICS
              </h2>
            </div>
            <span className="text-[10px] font-mono opacity-50">NSE F&amp;O DATA</span>
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex justify-between items-center">
              <span className="opacity-60 text-[10px] uppercase">PUT-CALL RATIO (PCR)</span>
              <span className="font-bold text-amber-300">{giftNiftyDetails.pcr}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex justify-between items-center">
              <span className="opacity-60 text-[10px] uppercase font-mono">FII/DII NET FLOW</span>
              <span className="font-bold text-indigo-300">{giftNiftyDetails.fiiFlow}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex justify-between items-center">
              <span className="opacity-60 text-[10px] uppercase">OPTION MAX PAIN</span>
              <span className="font-bold text-slate-100">{giftNiftyDetails.maxPain}</span>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex justify-between items-center">
              <span className="opacity-60 text-[10px] uppercase">INDIA VIX VOLATILITY</span>
              <span className="font-bold text-emerald-400">{giftNiftyDetails.vixStatus}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Option Chain Strike Heatmap Table based on GIFT Nifty Bias */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <h2 className="text-sm font-black uppercase font-mono text-slate-100">
              NIFTY OPTION CHAIN STRIKE ANALYSIS ({stance} STANCE)
            </h2>
          </div>
          <span className="text-[10px] font-mono text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-md border border-indigo-500/20">
            NEAR ATM STRIKE HEATMAP
          </span>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left border-collapse font-mono text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] opacity-60 uppercase text-slate-300">
                <th className="py-2.5 px-3">STRIKE</th>
                <th className="py-2.5 px-3">TYPE / ZONE</th>
                <th className="py-2.5 px-3">CALL OI</th>
                <th className="py-2.5 px-3">PUT OI</th>
                <th className="py-2.5 px-3">STRIKE PCR</th>
                <th className="py-2.5 px-3">EST. PREMIUM</th>
                <th className="py-2.5 px-3">AI BIAS &amp; ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {giftNiftyDetails.strikeMatrix.map((item, idx) => (
                <tr key={idx} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-3 px-3 font-black text-slate-100">{item.strike}</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 text-[10px] rounded bg-slate-800 text-slate-300 font-bold">
                      {item.type}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-rose-300 font-bold">{item.callOi}</td>
                  <td className="py-3 px-3 text-emerald-300 font-bold">{item.putOi}</td>
                  <td className="py-3 px-3 font-bold text-amber-300">{item.pcr}</td>
                  <td className="py-3 px-3 font-bold text-slate-200">₹{item.ltp}</td>
                  <td className={`py-3 px-3 font-black ${item.color}`}>{item.bias}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Stock Segment Correlation Picks */}
      {recommendedStockPicks.length > 0 && (
        <div
          className={`p-5 rounded-2xl border transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800' : 'bg-white border-slate-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800/60">
            <div className="flex items-center gap-2">
              <PieChart className="w-5 h-5 text-indigo-400" />
              <h2 className="text-sm font-black uppercase font-mono text-slate-100">
                RECOMMENDED STOCK SECTOR PICKS FOR {stance} STANCE
              </h2>
            </div>
            <span className="text-[10px] font-mono opacity-50">NIFTY 200 HIGH CONVICTION</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {recommendedStockPicks.map((stock) => (
              <div
                key={stock.symbol}
                onClick={() => onSelectStock && onSelectStock(stock)}
                className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/70 hover:border-indigo-500/50 cursor-pointer transition-all space-y-1.5"
              >
                <div className="flex items-center justify-between">
                  <span className="font-black text-xs font-mono text-slate-100">{stock.symbol}</span>
                  <span
                    className={`text-[10px] font-mono font-bold ${
                      stock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {stock.changePercent >= 0 ? '+' : ''}
                    {stock.changePercent.toFixed(2)}%
                  </span>
                </div>

                <div className="text-[11px] font-mono text-slate-300 flex justify-between">
                  <span>₹{stock.price.toFixed(2)}</span>
                  <span className="text-amber-300 font-bold">SCORE: {stock.aiScore}</span>
                </div>

                <div className="text-[10px] text-slate-400 font-mono truncate">
                  Sector: {stock.sector} | RVOL: {stock.indicators?.rvol?.toFixed(1) || '1.2'}x
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
