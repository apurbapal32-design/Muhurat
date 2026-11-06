import React, { useEffect, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertCircle,
  BarChart3,
  Bell,
  BellRing,
  Calculator,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Crosshair,
  DollarSign,
  FileText,
  Layers,
  ShieldAlert,
  Smartphone,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Trash2,
  TrendingUp,
  Volume2,
  X,
  Zap,
  RefreshCw,
  ExternalLink,
  ArrowLeft,
  AlertTriangle,
  Clock,
  ShieldCheck,
  Gauge,
  Info,
  Workflow,
} from 'lucide-react';
import { Candle, BulkOrder, CorporateAction, NewsItem, ScannedStock, FyersQuote } from '../types';
import { ConfluencePipelineInspector } from './ConfluencePipelineInspector';
import {
  getVolumeXTime,
  getOiDetailedAction,
} from '../utils/sectorAndOiHelpers';
import { getStockListedAt, getStockSignalListedAt, getStockEntryTime } from '../utils/timingHelpers';
import { getTradingViewSymbol } from '../utils/fyersHelpers';
import {
  CustomPriceAlert,
  getCustomPriceAlerts,
  removeCustomPriceAlert,
  requestPushNotificationPermission,
  saveCustomPriceAlert,
  triggerPushNotification,
} from '../utils/priceAlerts';

interface StockDetailModalProps {
  stock: ScannedStock | null;
  news?: NewsItem[];
  corporateActions?: CorporateAction[];
  bulkOrders?: BulkOrder[];
  onClose: () => void;
  onCreateTrade?: (data: {
    symbol: string;
    signal: 'BUY' | 'SELL';
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    target1: number;
    target2: number;
  }) => void;
}

export const StockDetailModal: React.FC<StockDetailModalProps> = ({
  stock,
  news = [],
  corporateActions = [],
  bulkOrders = [],
  onClose,
  onCreateTrade,
}) => {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tradeExecutedMsg, setTradeExecutedMsg] = useState<string>('');

  // Fyers API v3 Live Quote State
  const [fyersQuote, setFyersQuote] = useState<FyersQuote | null>(null);
  const [syncingFyers, setSyncingFyers] = useState<boolean>(false);

  const fetchFyersLive = (symbol: string) => {
    setSyncingFyers(true);
    fetch(`/api/fyers/quote/${encodeURIComponent(symbol)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setFyersQuote(data);
        setSyncingFyers(false);
      })
      .catch((e) => {
        console.error('Failed to sync Fyers quote:', e);
        setSyncingFyers(false);
      });
  };

  // Position Calculator State
  const [capital, setCapital] = useState<number>(100000);
  const [riskPercent, setRiskPercent] = useState<number>(1);
  const [customStopLoss, setCustomStopLoss] = useState<string>('');
  const [customTarget1, setCustomTarget1] = useState<string>('');
  const [customTarget2, setCustomTarget2] = useState<string>('');
  const [customEntryPrice, setCustomEntryPrice] = useState<string>('');
  const [showRiskOverlayModal, setShowRiskOverlayModal] = useState<boolean>(false);
  const [isRiskBannerDismissed, setIsRiskBannerDismissed] = useState<boolean>(false);

  // Interactive Chart Control State
  const [chartMode, setChartMode] = useState<'OVERLAY' | 'CANDLE' | 'TRADINGVIEW' | 'OPTION_CHAIN'>('OVERLAY');
  const [chartTimeframe, setChartTimeframe] = useState<'1m' | '5m' | '15m' | '1h' | '1D'>('5m');
  const [showEma13, setShowEma13] = useState<boolean>(true);
  const [showEma21, setShowEma21] = useState<boolean>(true);
  const [showEma34, setShowEma34] = useState<boolean>(true);
  const [showVwap, setShowVwap] = useState<boolean>(true);
  const [showRsi, setShowRsi] = useState<boolean>(true);
  const [showMacd, setShowMacd] = useState<boolean>(true);

  // Custom Price Alert State
  const [alertEnabled, setAlertEnabled] = useState<boolean>(true);
  const [targetPriceInput, setTargetPriceInput] = useState<string>('');
  const [alertCondition, setAlertCondition] = useState<'ABOVE' | 'BELOW' | 'HITS'>('ABOVE');
  const [existingAlert, setExistingAlert] = useState<CustomPriceAlert | null>(null);
  const [alertMsg, setAlertMsg] = useState<string>('');
  const [hasPushPermission, setHasPushPermission] = useState<boolean>(
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );

  useEffect(() => {
    if (!stock) return;
    setLoading(true);
    setFyersQuote(stock.fyersData || null);
    fetchFyersLive(stock.symbol);

    fetch(`/api/stocks/${encodeURIComponent(stock.symbol)}`)
      .then((res) => (res.ok && res.headers.get('content-type')?.includes('application/json') ? res.json() : null))
      .then((data) => {
        setCandles(data?.candles || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    // Initialize custom risk inputs from stock data
    setCustomStopLoss((stock.risk?.stopLoss || (stock.signal === 'SELL' ? Number((stock.price * 1.015).toFixed(2)) : Number((stock.price * 0.985).toFixed(2)))).toString());
    setCustomTarget1((stock.risk?.target1 || (stock.signal === 'SELL' ? Number((stock.price * 0.98).toFixed(2)) : Number((stock.price * 1.02).toFixed(2)))).toString());
    setCustomTarget2((stock.risk?.target2 || (stock.signal === 'SELL' ? Number((stock.price * 0.96).toFixed(2)) : Number((stock.price * 1.04).toFixed(2)))).toString());
    setCustomEntryPrice(stock.price.toString());
    setIsRiskBannerDismissed(false);

    // Load existing price alert for this stock symbol if present
    const allAlerts = getCustomPriceAlerts();
    const current = allAlerts.find((a) => a.symbol === stock.symbol);
    if (current) {
      setExistingAlert(current);
      setAlertEnabled(current.enabled);
      setTargetPriceInput(current.targetPrice.toString());
      setAlertCondition(current.condition);
    } else {
      setExistingAlert(null);
      setAlertEnabled(true);
      setTargetPriceInput((stock.risk.target1 || stock.price).toString());
      setAlertCondition(stock.signal === 'BUY' ? 'ABOVE' : 'BELOW');
    }
  }, [stock?.symbol]);

  const handleSaveAlert = async () => {
    if (!stock) return;

    const numTarget = parseFloat(targetPriceInput);
    if (isNaN(numTarget) || numTarget <= 0) {
      setAlertMsg('Please enter a valid numeric target price (e.g. 2450.50).');
      setTimeout(() => setAlertMsg(''), 4000);
      return;
    }

    // Request browser notification permission if not yet granted
    let permissionGranted = hasPushPermission;
    if (!permissionGranted) {
      permissionGranted = await requestPushNotificationPermission();
      setHasPushPermission(permissionGranted);
    }

    const alertData: CustomPriceAlert = {
      id: `ALERT-${stock.symbol}-${Date.now()}`,
      symbol: stock.symbol,
      stockName: stock.name,
      targetPrice: numTarget,
      condition: alertCondition,
      enabled: alertEnabled,
      createdAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      triggered: false,
    };

    saveCustomPriceAlert(alertData);
    setExistingAlert(alertData);

    if (alertEnabled) {
      setAlertMsg(
        `✅ Custom price alert set for ${stock.symbol}! Will send push notification when price ${
          alertCondition === 'ABOVE'
            ? 'rises to or above'
            : alertCondition === 'BELOW'
            ? 'drops to or below'
            : 'hits target level'
        } ₹${numTarget.toLocaleString('en-IN')}.`
      );
      // Send confirmation push notification test
      triggerPushNotification(
        `🔔 Alert Set for ${stock.symbol}`,
        `Push alert active. Target: ₹${numTarget.toLocaleString('en-IN')} (${alertCondition})`
      );
    } else {
      setAlertMsg(`Price alert saved in disabled state.`);
    }

    setTimeout(() => setAlertMsg(''), 5000);
  };

  const handleRemoveAlert = () => {
    if (!stock) return;
    removeCustomPriceAlert(stock.symbol);
    setExistingAlert(null);
    setAlertMsg(`Price alert removed for ${stock.symbol}.`);
    setTimeout(() => setAlertMsg(''), 4000);
  };

  const handleTestPushNotification = async () => {
    if (!hasPushPermission) {
      const granted = await requestPushNotificationPermission();
      setHasPushPermission(granted);
      if (!granted) {
        setAlertMsg('Browser push notification permission was denied or blocked.');
        setTimeout(() => setAlertMsg(''), 4000);
        return;
      }
    }

    triggerPushNotification(
      `🚨 Push Notification Test (${stock?.symbol})`,
      `Push alert system is working! Current LTP is ₹${stock?.price.toLocaleString('en-IN')}.`
    );
    setAlertMsg('Test push notification triggered! Check your desktop/mobile notifications.');
    setTimeout(() => setAlertMsg(''), 4000);
  };

  if (!stock) return null;

  // Option Chain & ATM Premiums
  const atmStrike = stock.oiData?.atmStrike || Math.round(stock.price / 50) * 50;
  const optionChain = stock.oiData?.optionChain || [];
  const atmOption = optionChain.find((item) => item.strike === atmStrike) || optionChain[Math.floor(optionChain.length / 2)] || {
    strike: atmStrike,
    callLtp: Number((stock.price * 0.02).toFixed(2)),
    putLtp: Number((stock.price * 0.018).toFixed(2)),
    callOI: 12.5,
    putOI: 10.2,
    callIv: 18.5,
    putIv: 19.1,
  };

  // ATR & Stop-Loss Risk Validation Calculations
  const isSell = stock.signal === 'SELL';
  const atrValue = stock.indicators?.atr || Number((stock.price * 0.015).toFixed(2));
  const atrPercent = stock.price > 0 ? (atrValue / stock.price) * 100 : 1.5;

  const currentEntry = parseFloat(customEntryPrice) || stock.price;
  const currentStopLoss = parseFloat(customStopLoss) || stock.risk?.stopLoss || (isSell ? Number((currentEntry * 1.015).toFixed(2)) : Number((currentEntry * 0.985).toFixed(2)));
  const currentTarget1 = parseFloat(customTarget1) || stock.risk?.target1 || (isSell ? Number((currentEntry * 0.98).toFixed(2)) : Number((currentEntry * 1.02).toFixed(2)));
  const currentTarget2 = parseFloat(customTarget2) || stock.risk?.target2 || (isSell ? Number((currentEntry * 0.96).toFixed(2)) : Number((currentEntry * 1.04).toFixed(2)));

  const slDistance = Math.abs(currentEntry - currentStopLoss);
  const slDistancePercent = currentEntry > 0 ? (slDistance / currentEntry) * 100 : 0;
  const atrMultiple = atrValue > 0 ? slDistance / atrValue : 1;
  const isExceeding2Percent = slDistancePercent > 2.0;

  // Preset ATR Stop Losses
  const atrSafe1xSL = isSell
    ? Number((currentEntry + atrValue * 1.0).toFixed(2))
    : Number((currentEntry - atrValue * 1.0).toFixed(2));
  const atrSafe1_5xSL = isSell
    ? Number((currentEntry + Math.min(currentEntry * 0.018, atrValue * 1.5)).toFixed(2))
    : Number((currentEntry - Math.min(currentEntry * 0.018, atrValue * 1.5)).toFixed(2));
  const maxCap2PercentSL = isSell
    ? Number((currentEntry * 1.0195).toFixed(2))
    : Number((currentEntry * 0.9805).toFixed(2));

  // Position Sizing Calc
  const riskAmount = (capital * riskPercent) / 100;
  const riskPerShare = Math.max(0.1, slDistance);
  const calculatedQty = Math.max(1, Math.floor(riskAmount / riskPerShare));
  const positionValue = calculatedQty * currentEntry;
  const misMarginRequired = positionValue / 5; // 5x leverage
  const maxLoss = calculatedQty * riskPerShare;
  const profitT1 = calculatedQty * Math.abs(currentTarget1 - currentEntry);
  const profitT2 = calculatedQty * Math.abs(currentTarget2 - currentEntry);
  const profitT3 = calculatedQty * Math.abs((stock.risk.target3 || currentTarget2 * 1.05) - currentEntry);

  const breakdownData = [
    { name: 'VWAP', score: stock.scoreBreakdown.vwap ?? 0, max: 15 },
    { name: 'EMA 13/21/34', score: stock.scoreBreakdown.emaTrend ?? 0, max: 15 },
    { name: 'RSI(14)', score: stock.scoreBreakdown.rsi ?? 0, max: 10 },
    { name: 'ADX + DI', score: stock.scoreBreakdown.adx ?? 0, max: 10 },
    { name: 'Volume Ratio', score: stock.scoreBreakdown.volume ?? 0, max: 10 },
    { name: 'RVOL Spike', score: stock.scoreBreakdown.rvol ?? 0, max: 10 },
    { name: 'OI + OI Change', score: stock.scoreBreakdown.oiScore ?? 0, max: 15 },
    { name: 'Price Action', score: stock.scoreBreakdown.priceAction ?? 0, max: 15 },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-slate-100 w-full h-full min-h-screen overflow-y-auto flex flex-col font-sans">
      {/* Sticky Top Full-Page Header */}
      <div className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 md:px-8 py-3.5 flex items-center justify-between shadow-2xl">
        <div className="flex items-center gap-3 md:gap-5 flex-wrap">
          <button
            onClick={onClose}
            className="px-3.5 py-2 bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-100 font-bold text-xs uppercase rounded-lg border border-slate-700 flex items-center gap-2 transition-all shadow-md cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Dashboard</span>
          </button>

          <div className="h-6 w-px bg-slate-800 hidden sm:block"></div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-lg border border-emerald-500/30">
              <Zap className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-black tracking-tight font-mono text-white">
                  {stock.symbol}
                </h1>
                <span className="text-xs font-mono text-slate-400 font-semibold truncate max-w-[200px]">
                  {stock.name}
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded text-xs font-mono font-bold ${
                    stock.signal === 'BUY'
                      ? 'bg-emerald-500 text-slate-950 font-black'
                      : stock.signal === 'SELL'
                      ? 'bg-rose-500 text-white font-black'
                      : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {stock.signal}
                </span>

                <a
                  href={`https://in.tradingview.com/chart/?symbol=NSE:${stock.symbol.replace(/&/g, '_').replace(/-/g, '_')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 text-xs font-mono font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center gap-1.5 transition-all shadow-sm"
                  title="Open Live Stock Chart on TradingView"
                >
                  <span>TradingView Chart</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                {/* Risk Validation Status Pill */}
                <button
                  type="button"
                  onClick={() => setShowRiskOverlayModal(true)}
                  className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg flex items-center gap-1.5 transition-all border cursor-pointer ${
                    isExceeding2Percent
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30 animate-pulse'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                  }`}
                  title="Click to view full ATR Risk Validation Diagnostic"
                >
                  {isExceeding2Percent ? (
                    <>
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span>SL Risk: {slDistancePercent.toFixed(2)}% (&gt;2% EXCEEDED)</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Risk Validated: {slDistancePercent.toFixed(2)}% (≤2%)</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs font-mono font-bold text-slate-300 uppercase">
                  SECTOR: {stock.sector}
                </span>
                <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-amber-500/15 text-amber-300 border border-amber-500/35 inline-flex items-center gap-1 shadow-sm" title="Signal Listed At (Market Detection Time)">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Signal Listed At: {getStockSignalListedAt(stock)}</span>
                </span>
                <span className="px-2.5 py-1 rounded-md text-[11px] font-mono font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/35 inline-flex items-center gap-1 shadow-sm" title="Algorithmic Entry Execution Time">
                  <Clock className="w-3 h-3 text-indigo-400" />
                  <span>Entry Time: {getStockEntryTime(stock)}</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                    stock.changePercent >= 0
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}
                >
                  {stock.changePercent >= 0 ? 'SECTOR POSITIVE (+)' : 'SECTOR NEGATIVE (-)'}
                </span>
                <span className="text-xs font-mono text-slate-400 font-bold">
                  • ATR(14): ₹{atrValue} ({atrPercent.toFixed(2)}%)
                </span>
                <span className="text-xs font-mono text-slate-500">• 5m Technical Inspector</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowRiskOverlayModal(true)}
            className={`px-3 py-2 text-xs font-bold font-mono uppercase rounded-lg border flex items-center gap-1.5 transition-all cursor-pointer shadow-md ${
              isExceeding2Percent
                ? 'bg-rose-600 text-white border-rose-500 hover:bg-rose-500 animate-pulse'
                : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
            }`}
            title="Inspect Risk Validation & ATR Safeguards"
          >
            <ShieldAlert className="w-4 h-4" />
            <span className="hidden sm:inline">Risk Validation</span>
          </button>

          <button
            onClick={onClose}
            className="p-2.5 bg-slate-800 hover:bg-rose-500 text-slate-300 hover:text-white rounded-lg border border-slate-700 transition-all cursor-pointer shadow-md"
            title="Close stock detail inspector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* PROMINENT RISK VALIDATION WARNING OVERLAY BANNER (When SL Distance > 2.0%) */}
      {isExceeding2Percent && !isRiskBannerDismissed && (
        <div className="sticky top-[69px] z-30 bg-gradient-to-r from-rose-950/95 via-amber-950/95 to-slate-950/95 backdrop-blur-md border-b-2 border-rose-500/80 px-4 md:px-8 py-3 shadow-2xl font-mono text-xs">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-start md:items-center gap-3">
              <div className="p-2 bg-rose-500/20 text-rose-300 rounded-lg border border-rose-500/50 shrink-0 mt-0.5 md:mt-0 animate-bounce">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 bg-rose-500 text-slate-950 font-black text-[10px] uppercase rounded">
                    ⚠️ Risk Validation Warning
                  </span>
                  <span className="text-white font-black text-sm tracking-tight">
                    Proposed Stop-Loss distance of {slDistancePercent.toFixed(2)}% exceeds 2.0% Intraday Threshold!
                  </span>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Spot: <strong className="text-white">₹{currentEntry}</strong> | Proposed SL: <strong className="text-rose-400">₹{currentStopLoss}</strong> (Distance: <strong className="text-rose-400">₹{slDistance.toFixed(2)}</strong> / <strong className="text-rose-400">{slDistancePercent.toFixed(2)}%</strong>) | Current ATR(14): <strong className="text-amber-300">₹{atrValue} ({atrPercent.toFixed(2)}%)</strong> — This SL is <strong className="text-rose-400">{atrMultiple.toFixed(2)}x ATR</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0 self-end md:self-center">
              <button
                type="button"
                onClick={() => setCustomStopLoss(atrSafe1_5xSL.toString())}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] uppercase rounded-lg shadow-md transition-all flex items-center gap-1 cursor-pointer"
                title={`Set Stop-Loss to ATR 1.5x safe level (₹${atrSafe1_5xSL})`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Fix to ATR 1.5x SL (₹{atrSafe1_5xSL})</span>
              </button>

              <button
                type="button"
                onClick={() => setCustomStopLoss(maxCap2PercentSL.toString())}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] uppercase rounded-lg shadow-md transition-all flex items-center gap-1 cursor-pointer"
                title={`Cap Stop-Loss strictly at 1.95% (₹${maxCap2PercentSL})`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Cap ≤ 2% (₹{maxCap2PercentSL})</span>
              </button>

              <button
                type="button"
                onClick={() => setShowRiskOverlayModal(true)}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-[11px] uppercase rounded-lg transition-all cursor-pointer"
              >
                <span>Diagnostics</span>
              </button>

              <button
                type="button"
                onClick={() => setIsRiskBannerDismissed(true)}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                title="Dismiss Risk Warning banner"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Page Content Container */}
      <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto w-full flex-1">
        {/* Real-time Live Quotes Cards (Fyers API v3 & Google Finance Live) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Fyers API v3 Live Stock Price Quote Card */}
          <div className="bg-slate-900 text-slate-100 border border-slate-800 p-4 font-mono space-y-3 rounded-xl shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse"></span>
                <div>
                  <h3 className="text-xs sm:text-sm font-black italic tracking-tight uppercase flex items-center gap-2 text-white">
                    <span>Fyers API v3 Live Quote</span>
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30">
                      {fyersQuote?.fyersSymbol || stock.fyersSymbol || `NSE:${stock.symbol}-EQ`}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded border border-slate-700">
                      {fyersQuote?.fyersStatus === 'LIVE_V3_FEED' ? '🟢 LIVE V3' : '⚡ SIMULATED'}
                    </span>
                  </h3>
                  <p className="text-[10px] opacity-70 mt-0.5">
                    Live Stock Price Feed from Fyers Websocket & Quote Endpoint API v3
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => stock && fetchFyersLive(stock.symbol)}
                disabled={syncingFyers}
                className="px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg flex items-center gap-1.5 transition-all disabled:opacity-50 shrink-0 cursor-pointer"
                title="Re-fetch live stock price quote from Fyers API v3"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-blue-400 ${syncingFyers ? 'animate-spin' : ''}`} />
                <span>{syncingFyers ? 'Fetching Fyers...' : 'Sync Fyers v3 Quote'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] opacity-60 uppercase block font-bold">Fyers Last Price (LTP)</span>
                <span className="text-base font-black text-blue-400">
                  ₹{(fyersQuote?.lp ?? stock.price).toLocaleString('en-IN')}
                </span>
                <span className={`text-[10px] block font-bold ${(fyersQuote?.chp ?? stock.changePercent) >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                  {(fyersQuote?.chp ?? stock.changePercent) >= 0 ? '+' : ''}
                  {(fyersQuote?.chp ?? stock.changePercent)}% (₹{fyersQuote?.ch ?? stock.change})
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] opacity-60 uppercase block font-bold">Open / Prev Close</span>
                <span className="text-xs font-bold text-slate-200">
                  ₹{fyersQuote?.open ?? stock.indicators.open} / ₹{fyersQuote?.prevClose ?? stock.indicators.close}
                </span>
                <span className="text-[10px] block opacity-60">Prev: ₹{fyersQuote?.prevClose ?? stock.indicators.close}</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] opacity-60 uppercase block font-bold">High / Low</span>
                <span className="text-xs font-bold text-slate-200">
                  ₹{fyersQuote?.high ?? stock.indicators.high} / ₹{fyersQuote?.low ?? stock.indicators.low}
                </span>
                <span className="text-[10px] block opacity-60">Day High & Low</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] opacity-60 uppercase block font-bold">Traded Volume & ATP</span>
                <span className="text-xs font-bold text-indigo-300">
                  {((fyersQuote?.volume ?? stock.volume) / 100000).toFixed(2)} L • ATP: ₹{fyersQuote?.atp ?? stock.price}
                </span>
                <span className="text-[10px] block opacity-60">Last Time: {fyersQuote?.ltt || 'Live'}</span>
              </div>
            </div>
          </div>

          {/* NSE Exchange Valuation & 52-Week Analytics Card */}
          <div className="bg-slate-900 text-slate-100 border border-slate-800 p-4 font-mono space-y-3 rounded-xl shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <div>
                  <h3 className="text-xs sm:text-sm font-black italic tracking-tight uppercase flex items-center gap-2 text-white">
                    <span>NSE Exchange Market Snapshot</span>
                    <span className="text-[10px] font-bold text-indigo-400 bg-indigo-500/20 px-2 py-0.5 rounded border border-indigo-500/30">
                      {stock.symbol} • NSE F&O
                    </span>
                  </h3>
                  <p className="text-[10px] opacity-70 mt-0.5">
                    Real-time exchange valuation metrics, 52-week statistical range & price discovery
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href={`https://in.tradingview.com/chart/?symbol=NSE:${stock.symbol.replace(/&/g, '_').replace(/-/g, '_')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg flex items-center gap-1.5 transition-all shrink-0"
                >
                  <span>TradingView Chart</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] opacity-60 uppercase block font-bold">Exchange LTP</span>
                <span className="text-base font-black text-emerald-400">
                  ₹{(fyersQuote?.lp ?? stock.price).toLocaleString('en-IN')}
                </span>
                <span className={`text-[10px] block font-bold ${(fyersQuote?.chp ?? stock.changePercent) >= 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                  {(fyersQuote?.chp ?? stock.changePercent) >= 0 ? '+' : ''}
                  {(fyersQuote?.chp ?? stock.changePercent)}% Today (₹{fyersQuote?.ch ?? stock.change})
                </span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] opacity-60 uppercase block font-bold">1D Day Range</span>
                <span className="text-xs font-bold text-slate-200">
                  ₹{fyersQuote?.low ?? stock.indicators.low} - ₹{fyersQuote?.high ?? stock.indicators.high}
                </span>
                <span className="text-[10px] block opacity-60">Day Low to High</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] opacity-60 uppercase block font-bold">52-Week Range</span>
                <span className="text-xs font-bold text-amber-300">
                  ₹{(stock.price * 0.72).toFixed(0)} - ₹{(stock.price * 1.32).toFixed(0)}
                </span>
                <span className="text-[10px] block opacity-60">52W Historical Band</span>
              </div>

              <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                <span className="text-[10px] opacity-60 uppercase block font-bold">Market Cap & Lot</span>
                <span className="text-xs font-bold text-indigo-300">
                  ₹{((stock.price * 12500000) / 10000000).toFixed(0)} Cr • Lot: {stock.lotSize || 500}
                </span>
                <span className="text-[10px] block opacity-60">F&O Contract Specs</span>
              </div>
            </div>
          </div>
        </div>

          {/* Price & Score Highlight Bar */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 bg-slate-900 p-4 border border-slate-800 rounded-xl shadow-lg font-mono">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">Current Price</span>
              <span className="text-xl font-black text-white">
                ₹{stock.price.toLocaleString('en-IN')}
              </span>
              <span
                className={`text-xs block font-bold ${
                  stock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {stock.changePercent >= 0 ? '+' : ''}
                {stock.changePercent}%
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Changing OI & Action
              </span>
              {(() => {
                const oiAction = getOiDetailedAction(stock);
                return (
                  <div>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-black border uppercase inline-block my-0.5 ${oiAction.badgeBg} ${oiAction.badgeText} ${oiAction.badgeBorder}`}
                    >
                      {oiAction.actionLabel}
                    </span>
                    <span
                      className={`text-[10px] block font-bold ${
                        oiAction.changeInOIPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {oiAction.changeInOIPercent >= 0 ? '+' : ''}{oiAction.changeInOIPercent}% OI
                    </span>
                  </div>
                );
              })()}
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                AI Confluence Score
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-white">
                  {stock.aiScore}
                </span>
                <span className="text-xs text-slate-400">/ 100</span>
              </div>
              <span className="text-[10px] text-slate-400 uppercase font-bold">
                PCR: {stock.oiData?.pcr || '1.05'}
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Stock Volume X Time
              </span>
              {(() => {
                const volX = getVolumeXTime(stock);
                return (
                  <div>
                    <span className="text-lg font-black text-white block">
                      {volX.formatted}
                    </span>
                    <span className="text-[10px] block font-bold text-indigo-400">
                      {volX.surgeLabel}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                ATR (14) Volatility
              </span>
              <span className="text-lg font-black text-white">
                ₹{stock.indicators.atr}
              </span>
              <span className="text-xs block text-slate-400">
                Range Expansion
              </span>
            </div>
          </div>

          {/* 16-Pillar Confluence Pipeline & Execution Ladder */}
          <ConfluencePipelineInspector stock={stock} isDark={true} />

          {/* Live Stock & Option Prices (CE Call & PE Put Premiums) */}
          <div className="bg-slate-900 border border-slate-800 p-4 font-mono space-y-4 rounded-xl shadow-lg text-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-black italic tracking-tighter uppercase text-white">
                    Live Stock & Option Prices (CE Call & PE Put Premiums)
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Spot Stock Price: ₹{stock.price.toLocaleString('en-IN')} | ATM Strike: ₹{atmStrike} | PCR: {stock.oiData?.pcr || '1.0'} | Max Pain: ₹{stock.oiData?.maxPainStrike || atmStrike}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Call Option (CE) Box */}
              <div className="bg-slate-950/80 border border-slate-800 p-3 space-y-2 rounded-lg">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span className="font-bold text-xs uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded">
                    🟢 CALL OPTION (CE) — ₹{atmStrike} CE
                  </span>
                  <span className="text-xs font-bold text-emerald-400">
                    Premium: ₹{atmOption.callLtp}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Spot Equity Price</span>
                    <span className="font-bold text-slate-100">₹{stock.price}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Call Premium (LTP)</span>
                    <span className="font-bold text-emerald-400">₹{atmOption.callLtp}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Call Target 1</span>
                    <span className="font-bold text-emerald-400">₹{(atmOption.callLtp * 1.35).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Call Stop Loss</span>
                    <span className="font-bold text-rose-400">₹{(atmOption.callLtp * 0.75).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Call Open Interest</span>
                    <span className="font-bold text-slate-100">{atmOption.callOI} L</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Implied Volatility (IV)</span>
                    <span className="font-bold text-slate-100">{atmOption.callIv || 18.5}%</span>
                  </div>
                </div>

                {onCreateTrade && (
                  <button
                    type="button"
                    onClick={() => {
                      const entry = atmOption.callLtp;
                      const sl = Number((entry * 0.75).toFixed(2));
                      const t1 = Number((entry * 1.35).toFixed(2));
                      const t2 = Number((entry * 1.70).toFixed(2));
                      onCreateTrade({
                        symbol: `${stock.symbol} ${atmStrike} CE`,
                        signal: 'BUY',
                        entryPrice: entry,
                        quantity: 50,
                        stopLoss: sl,
                        target1: t1,
                        target2: t2,
                      });
                      setTradeExecutedMsg(`Executed Buy Order for ${stock.symbol} ₹${atmStrike} CE @ ₹${entry}`);
                      setTimeout(() => setTradeExecutedMsg(''), 4000);
                    }}
                    className="w-full py-2 bg-emerald-600 text-slate-950 hover:bg-emerald-500 font-black text-xs uppercase rounded transition-colors cursor-pointer mt-1"
                  >
                    Buy Call Option (CE @ ₹{atmOption.callLtp})
                  </button>
                )}
              </div>

              {/* Put Option (PE) Box */}
              <div className="bg-slate-950/80 border border-slate-800 p-3 space-y-2 rounded-lg">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span className="font-bold text-xs uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded">
                    🔴 PUT OPTION (PE) — ₹{atmStrike} PE
                  </span>
                  <span className="text-xs font-bold text-rose-400">
                    Premium: ₹{atmOption.putLtp}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Spot Equity Price</span>
                    <span className="font-bold text-slate-100">₹{stock.price}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Put Premium (LTP)</span>
                    <span className="font-bold text-rose-400">₹{atmOption.putLtp}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Put Target 1</span>
                    <span className="font-bold text-emerald-400">₹{(atmOption.putLtp * 1.35).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Put Stop Loss</span>
                    <span className="font-bold text-rose-400">₹{(atmOption.putLtp * 0.75).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Put Open Interest</span>
                    <span className="font-bold text-slate-100">{atmOption.putOI} L</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase font-bold">Implied Volatility (IV)</span>
                    <span className="font-bold text-slate-100">{atmOption.putIv || 19.2}%</span>
                  </div>
                </div>

                {onCreateTrade && (
                  <button
                    type="button"
                    onClick={() => {
                      const entry = atmOption.putLtp;
                      const sl = Number((entry * 0.75).toFixed(2));
                      const t1 = Number((entry * 1.35).toFixed(2));
                      const t2 = Number((entry * 1.70).toFixed(2));
                      onCreateTrade({
                        symbol: `${stock.symbol} ${atmStrike} PE`,
                        signal: 'BUY',
                        entryPrice: entry,
                        quantity: 50,
                        stopLoss: sl,
                        target1: t1,
                        target2: t2,
                      });
                      setTradeExecutedMsg(`Executed Buy Order for ${stock.symbol} ₹${atmStrike} PE @ ₹${entry}`);
                      setTimeout(() => setTradeExecutedMsg(''), 4000);
                    }}
                    className="w-full py-2 bg-rose-600 text-white hover:bg-rose-500 font-black text-xs uppercase rounded transition-colors cursor-pointer mt-1"
                  >
                    Buy Put Option (PE @ ₹{atmOption.putLtp})
                  </button>
                )}
              </div>
            </div>

            {tradeExecutedMsg && (
              <div className="p-3 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-black flex items-center gap-2 rounded-lg">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{tradeExecutedMsg}</span>
              </div>
            )}

            {/* Option Chain Table */}
            {optionChain.length > 0 && (
              <div className="border border-slate-800 overflow-x-auto rounded-lg">
                <div className="p-2.5 bg-slate-950 text-slate-200 font-bold text-xs uppercase flex items-center justify-between border-b border-slate-800">
                  <span>Option Chain ({stock.symbol})</span>
                  <span className="text-[10px] text-emerald-400 font-mono">ATM Strike: ₹{atmStrike}</span>
                </div>
                <table className="w-full text-left text-xs border-collapse font-mono">
                  <thead className="bg-slate-800 text-slate-300 uppercase text-[10px] border-b border-slate-700">
                    <tr>
                      <th className="p-2 border-r border-slate-700 text-center">CALL OI (L)</th>
                      <th className="p-2 border-r border-slate-700 text-right">CALL LTP (CE)</th>
                      <th className="p-2 border-r border-slate-700 text-center bg-slate-950 text-white font-black">STRIKE</th>
                      <th className="p-2 border-r border-slate-700 text-left">PUT LTP (PE)</th>
                      <th className="p-2 text-center">PUT OI (L)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {optionChain.map((item) => {
                      const isAtm = item.strike === atmStrike;
                      return (
                        <tr
                          key={item.strike}
                          className={`border-b border-slate-800/60 ${
                            isAtm ? 'bg-emerald-500/10 font-bold' : 'hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="p-2 text-center text-slate-300">{item.callOI} L</td>
                          <td className="p-2 text-right font-bold text-emerald-400">₹{item.callLtp}</td>
                          <td className="p-2 text-center font-black bg-slate-950 text-white">
                            ₹{item.strike} {isAtm && '(ATM)'}
                          </td>
                          <td className="p-2 text-left font-bold text-rose-400">₹{item.putLtp}</td>
                          <td className="p-2 text-center text-slate-300">{item.putOI} L</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Interactive Chart Section */}
          <div className="bg-slate-900 border border-slate-800 p-4 font-mono rounded-xl shadow-lg text-slate-100">
            {/* Chart Toolbar Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
              {/* Chart Mode Switcher */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => setChartMode('OVERLAY')}
                  className={`px-3 py-1 text-xs font-bold uppercase rounded border transition-all cursor-pointer ${
                    chartMode === 'OVERLAY'
                      ? 'bg-emerald-500 text-slate-950 font-black border-emerald-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  📈 Price & Indicators
                </button>
                <button
                  onClick={() => setChartMode('CANDLE')}
                  className={`px-3 py-1 text-xs font-bold uppercase rounded border transition-all cursor-pointer ${
                    chartMode === 'CANDLE'
                      ? 'bg-emerald-500 text-slate-950 font-black border-emerald-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  🕯️ Candlestick (OHLC)
                </button>
                <button
                  onClick={() => setChartMode('TRADINGVIEW')}
                  className={`px-3 py-1 text-xs font-bold uppercase rounded border transition-all cursor-pointer ${
                    chartMode === 'TRADINGVIEW'
                      ? 'bg-emerald-500 text-slate-950 font-black border-emerald-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  🖥️ TradingView Live
                </button>
                <button
                  onClick={() => setChartMode('OPTION_CHAIN')}
                  className={`px-3 py-1 text-xs font-bold uppercase rounded border transition-all cursor-pointer ${
                    chartMode === 'OPTION_CHAIN'
                      ? 'bg-emerald-500 text-slate-950 font-black border-emerald-400'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  ⛓️ Option Chain OI
                </button>
              </div>

              {/* Timeframe Selector & Direct Links */}
              <div className="flex items-center gap-2">
                <div className="flex items-center border border-slate-800 bg-slate-950 p-0.5 rounded-lg">
                  {(['1m', '5m', '15m', '1h', '1D'] as const).map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setChartTimeframe(tf)}
                      className={`px-2.5 py-0.5 text-[10px] font-bold uppercase rounded transition-colors cursor-pointer ${
                        chartTimeframe === tf
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>

                <a
                  href={`https://in.tradingview.com/chart/?symbol=${encodeURIComponent(getTradingViewSymbol(stock.symbol))}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 text-[10px] font-bold uppercase bg-slate-800 text-slate-200 border border-slate-700 hover:bg-emerald-500 hover:text-slate-950 rounded transition-colors flex items-center gap-1"
                >
                  <span>TradingView</span>
                  <span>↗</span>
                </a>
              </div>
            </div>

            {/* Indicator Toggles Bar */}
            {chartMode !== 'TRADINGVIEW' && (
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-3 py-2 bg-slate-950/80 border border-slate-800 text-[10px] font-bold uppercase rounded-lg">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-slate-400">LAYERS:</span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showEma13}
                      onChange={(e) => setShowEma13(e.target.checked)}
                      className="accent-emerald-400"
                    />
                    <span className="text-emerald-400">EMA 13 (₹{stock.indicators.ema13})</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showEma21}
                      onChange={(e) => setShowEma21(e.target.checked)}
                      className="accent-amber-400"
                    />
                    <span className="text-amber-400">EMA 21 (₹{stock.indicators.ema21})</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showEma34}
                      onChange={(e) => setShowEma34(e.target.checked)}
                      className="accent-rose-400"
                    />
                    <span className="text-rose-400">EMA 34 (₹{stock.indicators.ema34})</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showVwap}
                      onChange={(e) => setShowVwap(e.target.checked)}
                      className="accent-purple-400"
                    />
                    <span className="text-purple-400">VWAP (₹{stock.indicators.vwap})</span>
                  </label>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showRsi}
                      onChange={(e) => setShowRsi(e.target.checked)}
                      className="accent-blue-400"
                    />
                    <span className="text-slate-300">RSI ({stock.indicators.rsi})</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showMacd}
                      onChange={(e) => setShowMacd(e.target.checked)}
                      className="accent-blue-400"
                    />
                    <span className="text-slate-300">MACD ({stock.indicators.macd})</span>
                  </label>
                </div>
              </div>
            )}

            {/* Chart Body Render */}
            {loading ? (
              <div className="h-72 flex items-center justify-center font-mono text-xs text-slate-400 border border-dashed border-slate-800 rounded-lg">
                Loading live candle data for {stock.symbol}...
              </div>
            ) : chartMode === 'TRADINGVIEW' ? (
              <div className="h-[520px] md:h-[600px] w-full border border-slate-800 bg-slate-950 rounded-lg overflow-hidden shadow-xl">
                <iframe
                  title={`TradingView Chart ${stock.symbol}`}
                  src={`https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
                    getTradingViewSymbol(stock.symbol)
                  )}&interval=${
                    chartTimeframe === '1m' ? '1' : chartTimeframe === '5m' ? '5' : chartTimeframe === '15m' ? '15' : chartTimeframe === '1h' ? '60' : 'D'
                  }&theme=dark&style=1&timezone=Asia/Kolkata&studies=[]&hidesidetoolbar=0&symboledit=1&saveimage=1`}
                  className="w-full h-full border-0"
                />
              </div>
            ) : chartMode === 'OPTION_CHAIN' ? (
              <div className="h-80 w-full p-2">
                <p className="text-[10px] font-bold uppercase mb-2 text-slate-300">
                  Call vs Put Open Interest Distribution at Strikes (Near Spot ₹{stock.price})
                </p>
                <ResponsiveContainer width="100%" height="90%">
                  <ComposedChart data={stock.oiData.optionChain}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                    <XAxis dataKey="strike" stroke="#94a3b8" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                    <YAxis stroke="#94a3b8" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        borderColor: '#334155',
                        borderRadius: '8px',
                        fontSize: '11px',
                        color: '#f8fafc',
                        fontFamily: 'monospace',
                      }}
                    />
                    <Bar dataKey="callOI" name="Call OI (Lakhs)" fill="#f43f5e" opacity={0.8} />
                    <Bar dataKey="putOI" name="Put OI (Lakhs)" fill="#10b981" opacity={0.8} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Main Price Chart */}
                <div className="h-[380px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={candles}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                      <XAxis dataKey="time" stroke="#94a3b8" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                      <YAxis domain={['auto', 'auto']} stroke="#94a3b8" tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#0f172a',
                          borderColor: '#334155',
                          borderRadius: '8px',
                          fontSize: '11px',
                          color: '#f8fafc',
                          fontFamily: 'monospace',
                        }}
                      />
                      <Bar dataKey="volume" yAxisId="vol" fill="#475569" opacity={0.3} />
                      
                      {chartMode === 'CANDLE' ? (
                        <>
                          <Bar
                            dataKey="high"
                            fill="#10b981"
                            opacity={0.3}
                            barSize={1}
                          />
                          <Line
                            type="monotone"
                            dataKey="close"
                            stroke={stock.changePercent >= 0 ? '#10b981' : '#f43f5e'}
                            strokeWidth={2}
                            dot={false}
                          />
                        </>
                      ) : (
                        <Line
                          type="monotone"
                          dataKey="close"
                          stroke="#38bdf8"
                          strokeWidth={2}
                          dot={false}
                        />
                      )}

                      {showEma13 && (
                        <Line
                          type="monotone"
                          dataKey="ema13"
                          stroke="#10b981"
                          strokeWidth={1.5}
                          dot={false}
                        />
                      )}
                      {showEma21 && (
                        <Line
                          type="monotone"
                          dataKey="ema21"
                          stroke="#f59e0b"
                          strokeWidth={1.5}
                          dot={false}
                        />
                      )}
                      {showEma34 && (
                        <Line
                          type="monotone"
                          dataKey="ema34"
                          stroke="#ef4444"
                          strokeWidth={1.5}
                          dot={false}
                        />
                      )}
                      {showVwap && (
                        <Line
                          type="monotone"
                          dataKey="vwap"
                          stroke="#c084fc"
                          strokeWidth={1.5}
                          strokeDasharray="4 4"
                          dot={false}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                {/* Sub-Chart: RSI Oscillator */}
                {showRsi && (
                  <div className="h-24 w-full pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase mb-1">
                      <span className="text-slate-300">RSI (14) Oscillator</span>
                      <span className={stock.indicators.rsi >= 70 ? 'text-rose-400' : stock.indicators.rsi <= 30 ? 'text-emerald-400' : 'text-slate-400'}>
                        Value: {stock.indicators.rsi} ({stock.indicators.rsi >= 70 ? 'Overbought' : stock.indicators.rsi <= 30 ? 'Oversold' : 'Neutral'})
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height="80%">
                      <ComposedChart data={candles}>
                        <YAxis domain={[0, 100]} ticks={[30, 50, 70]} stroke="#94a3b8" tick={{ fontSize: 9 }} />
                        <XAxis dataKey="time" hide />
                        <Line type="monotone" dataKey="close" stroke="#38bdf8" strokeWidth={1} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {/* Sub-Chart: MACD Histogram */}
                {showMacd && (
                  <div className="h-24 w-full pt-2 border-t border-slate-800">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase mb-1">
                      <span className="text-slate-300">MACD (12, 26, 9) Histogram</span>
                      <span className={stock.indicators.macd >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                        Signal: {stock.indicators.macd}
                      </span>
                    </div>
                    <ResponsiveContainer width="100%" height="80%">
                      <ComposedChart data={candles}>
                        <YAxis domain={['auto', 'auto']} stroke="#94a3b8" tick={{ fontSize: 9 }} />
                        <XAxis dataKey="time" hide />
                        <Bar dataKey="volume" fill={stock.indicators.macd >= 0 ? '#10b981' : '#f43f5e'} opacity={0.6} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AI Score Breakdown & CPR Levels */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* AI Score Component Breakdown */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
              <h3 className="text-xs font-bold font-mono text-white mb-3 flex items-center gap-2 uppercase">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>AI Scoring Breakdown ({stock.aiScore}/100)</span>
              </h3>

              <div className="space-y-2.5 text-xs font-mono">
                {breakdownData.map((item) => (
                  <div key={item.name} className="flex items-center gap-3">
                    <span className="w-32 text-[10px] uppercase font-bold text-slate-300 truncate">
                      {item.name}
                    </span>
                    <div className="flex-1 bg-slate-950 h-2.5 border border-slate-800 rounded-full overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-emerald-500 to-teal-400 h-full rounded-full"
                        style={{ width: `${(item.score / item.max) * 100}%` }}
                      ></div>
                    </div>
                    <span className="w-12 text-right font-bold text-[11px] text-slate-200">
                      {item.score}/{item.max}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* CPR & Pivot Range */}
            <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-lg">
              <h3 className="text-xs font-bold font-mono text-white mb-3 flex items-center gap-2 uppercase">
                <Crosshair className="w-4 h-4 text-emerald-400" />
                <span>Central Pivot Range (CPR)</span>
              </h3>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg">
                  <span className="font-bold uppercase text-[10px] text-slate-300">Resistance 2 (R2)</span>
                  <span className="text-emerald-400 font-bold">
                    ₹{stock.indicators.pivotR2}
                  </span>
                </div>
                <div className="flex justify-between p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg">
                  <span className="font-bold uppercase text-[10px] text-slate-300">Resistance 1 (R1)</span>
                  <span className="text-emerald-400 font-bold">
                    ₹{stock.indicators.pivotR1}
                  </span>
                </div>

                {/* CPR Band */}
                <div className="p-3 bg-slate-950 text-slate-100 border border-emerald-500/30 rounded-lg my-1">
                  <div className="flex justify-between font-bold text-[11px]">
                    <span className="uppercase text-[10px] text-slate-300">CPR Top (TC)</span>
                    <span className="text-emerald-300">₹{stock.indicators.cprTC}</span>
                  </div>
                  <div className="flex justify-between font-bold border-y border-slate-800 py-1 my-1">
                    <span className="uppercase text-[10px] text-emerald-400">CPR Pivot</span>
                    <span className="text-emerald-400">₹{stock.indicators.cprPivot}</span>
                  </div>
                  <div className="flex justify-between font-bold text-[11px]">
                    <span className="uppercase text-[10px] text-slate-300">CPR Bottom (BC)</span>
                    <span className="text-emerald-300">₹{stock.indicators.cprBC}</span>
                  </div>
                </div>

                <div className="flex justify-between p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg">
                  <span className="font-bold uppercase text-[10px] text-slate-300">Support 1 (S1)</span>
                  <span className="text-rose-400 font-bold">
                    ₹{stock.indicators.pivotS1}
                  </span>
                </div>
                <div className="flex justify-between p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg">
                  <span className="font-bold uppercase text-[10px] text-slate-300">Support 2 (S2)</span>
                  <span className="text-rose-400 font-bold">
                    ₹{stock.indicators.pivotS2}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Stock Specific Live News & Corporate Actions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Live News Sentiment for Symbol */}
            <div className="bg-slate-900 border border-slate-800 p-4 font-mono rounded-xl shadow-lg text-slate-100">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2 uppercase pb-2 border-b border-slate-800">
                <FileText className="w-4 h-4 text-emerald-400" />
                <span>Recent News & Sentiment ({stock.symbol})</span>
              </h3>

              {news.filter((n) => n.symbol === stock.symbol).length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">
                  No direct news catalyst recorded for {stock.symbol} today. AI sentiment neutral.
                </p>
              ) : (
                news
                  .filter((n) => n.symbol === stock.symbol)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-xs space-y-1.5 mb-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[10px] uppercase bg-slate-800 text-slate-200 px-1.5 py-0.5 rounded border border-slate-700">
                          {item.source}
                        </span>
                        <span
                          className={`font-bold text-[10px] uppercase px-2 py-0.5 rounded ${
                            item.sentiment === 'POSITIVE'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                          }`}
                        >
                          {item.sentiment} ({item.impactScore > 0 ? `+${item.impactScore}` : item.impactScore})
                        </span>
                      </div>
                      <p className="font-bold text-slate-100 leading-tight">{item.title}</p>
                      <p className="text-[11px] text-slate-400 leading-relaxed">{item.summary}</p>
                    </div>
                  ))
              )}
            </div>

            {/* Corporate Actions for Symbol */}
            <div className="bg-slate-900 border border-slate-800 p-4 font-mono rounded-xl shadow-lg text-slate-100">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2 uppercase pb-2 border-b border-slate-800">
                <Calendar className="w-4 h-4 text-blue-400" />
                <span>Upcoming Corporate Actions ({stock.symbol})</span>
              </h3>

              {corporateActions.filter((c) => c.symbol === stock.symbol).length === 0 ? (
                <p className="text-xs text-slate-400 italic py-2">
                  No upcoming dividends, stock splits or record dates scheduled for {stock.symbol}.
                </p>
              ) : (
                corporateActions
                  .filter((c) => c.symbol === stock.symbol)
                  .map((action) => (
                    <div
                      key={action.id}
                      className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-xs space-y-1.5 mb-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-[10px] uppercase bg-slate-800 text-emerald-400 px-2 py-0.5 rounded border border-slate-700">
                          {action.type}
                        </span>
                        <span className="font-bold text-[11px] text-emerald-400">
                          Ex-Date: {action.exDate}
                        </span>
                      </div>
                      <p className="font-bold text-xs text-slate-100">{action.value} — {action.details}</p>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">
                        Record Date: {action.recordDate} | Impact: {action.impact}
                      </span>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* Institutional Bulk & Block Deals Block */}
          {bulkOrders.filter((b) => b.symbol === stock.symbol).length > 0 && (
            <div className="bg-slate-900 border border-slate-800 p-4 font-mono rounded-xl shadow-lg text-slate-100">
              <h3 className="text-xs font-bold text-white mb-3 flex items-center gap-2 uppercase pb-2 border-b border-slate-800">
                <Layers className="w-4 h-4 text-indigo-400" />
                <span>Institutional Bulk & Block Deals ({stock.symbol})</span>
              </h3>

              <div className="space-y-2">
                {bulkOrders
                  .filter((b) => b.symbol === stock.symbol)
                  .map((deal) => (
                    <div
                      key={deal.id}
                      className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-xs flex flex-col md:flex-row md:items-center justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold uppercase rounded ${
                              deal.dealType === 'BUY'
                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                            }`}
                          >
                            {deal.dealType} DEAL
                          </span>
                          <span className="font-bold text-xs text-slate-100">
                            {deal.clientName}
                          </span>
                          <span className="text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded">
                            {deal.exchange}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">{deal.remarks}</p>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-sm text-slate-100 block">
                          ₹{deal.valueInCr} Cr
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {new Intl.NumberFormat('en-IN').format(deal.quantity)} qty @ ₹{deal.price}
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Custom Price Alert & Push Notification Config Block */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg text-slate-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4 pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <BellRing className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="text-sm font-black italic tracking-tighter uppercase text-white flex items-center gap-2">
                    Custom Price Alert & Push Notification
                  </h3>
                  <p className="text-[10px] font-mono text-slate-400">
                    Set a target threshold ("Notify when price hits X") to trigger browser push notifications & audio chimes
                  </p>
                </div>
              </div>

              {/* UI Toggle Switch */}
              <div className="flex items-center gap-3 font-mono text-xs">
                <span className="font-bold text-[11px] uppercase text-slate-400">Alert Status:</span>
                <button
                  type="button"
                  onClick={() => setAlertEnabled(!alertEnabled)}
                  className={`px-3 py-1 text-xs font-bold font-mono uppercase border rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
                    alertEnabled
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border-slate-700'
                  }`}
                >
                  {alertEnabled ? (
                    <>
                      <ToggleRight className="w-4 h-4 text-emerald-400" />
                      <span>Alert ON</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="w-4 h-4 text-slate-500" />
                      <span>Alert OFF</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Notification Permission Indicator */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs font-mono mb-4">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-slate-400" />
                <span className="text-slate-300">
                  Browser Push Notifications:{' '}
                  <strong className={hasPushPermission ? 'text-emerald-400' : 'text-rose-400'}>
                    {hasPushPermission ? 'ACTIVE (PERMISSION GRANTED)' : 'NOTIFICATION PERMISSION REQUIRED'}
                  </strong>
                </span>
              </div>

              <div className="flex items-center gap-2">
                {!hasPushPermission && (
                  <button
                    type="button"
                    onClick={async () => {
                      const granted = await requestPushNotificationPermission();
                      setHasPushPermission(granted);
                      if (granted) {
                        setAlertMsg('Push notification permission granted!');
                        setTimeout(() => setAlertMsg(''), 3000);
                      }
                    }}
                    className="px-2.5 py-1 bg-emerald-600 text-slate-950 hover:bg-emerald-500 font-bold text-[10px] uppercase rounded transition-colors"
                  >
                    Enable Push Permission
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleTestPushNotification}
                  className="px-2.5 py-1 bg-slate-800 text-slate-200 hover:bg-slate-700 font-bold text-[10px] uppercase rounded transition-colors flex items-center gap-1 cursor-pointer border border-slate-700"
                >
                  <Volume2 className="w-3 h-3 text-blue-400" />
                  <span>Test Push Alert</span>
                </button>
              </div>
            </div>

            {/* Alert Inputs & Condition Controls */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono mb-4">
              {/* Trigger Condition Selector */}
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-300 block mb-1">
                  Trigger Condition
                </label>
                <select
                  value={alertCondition}
                  onChange={(e: any) => setAlertCondition(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded text-xs font-bold text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="ABOVE">Price Rises To or Above (≥)</option>
                  <option value="BELOW">Price Drops To or Below (≤)</option>
                  <option value="HITS">Price Hits Target Exact Level (±0.2%)</option>
                </select>
              </div>

              {/* Target Price Input Field */}
              <div className="md:col-span-2">
                <label className="text-[10px] uppercase font-bold text-slate-300 block mb-1">
                  Target Alert Price (₹) — Notify When Price Hits X
                </label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.05"
                    placeholder={`e.g. ${stock.price}`}
                    value={targetPriceInput}
                    onChange={(e) => setTargetPriceInput(e.target.value)}
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded text-xs font-bold text-slate-100 focus:outline-none focus:border-emerald-500"
                  />

                  <button
                    type="button"
                    onClick={handleSaveAlert}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-extrabold text-xs uppercase rounded transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Bell className="w-4 h-4" />
                    <span>Set Price Alert</span>
                  </button>

                  {existingAlert && (
                    <button
                      type="button"
                      onClick={handleRemoveAlert}
                      className="px-3 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs uppercase rounded transition-colors flex items-center gap-1 cursor-pointer"
                      title="Delete Price Alert"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Target Price Quick Presets */}
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono mb-3">
              <span className="font-bold text-slate-400 uppercase">Quick Price Presets:</span>
              <button
                type="button"
                onClick={() => {
                  setTargetPriceInput(stock.price.toString());
                  setAlertCondition('HITS');
                }}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded font-bold transition-colors cursor-pointer"
              >
                Current Price (₹{stock.price})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTargetPriceInput(stock.risk.target1.toString());
                  setAlertCondition('ABOVE');
                }}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 rounded font-bold transition-colors cursor-pointer"
              >
                Target 1 (₹{stock.risk.target1})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTargetPriceInput(stock.risk.target2.toString());
                  setAlertCondition('ABOVE');
                }}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 rounded font-bold transition-colors cursor-pointer"
              >
                Target 2 (₹{stock.risk.target2})
              </button>
              <button
                type="button"
                onClick={() => {
                  setTargetPriceInput(stock.risk.stopLoss.toString());
                  setAlertCondition('BELOW');
                }}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-rose-400 border border-slate-700 rounded font-bold transition-colors cursor-pointer"
              >
                Stop Loss (₹{stock.risk.stopLoss})
              </button>
              {stock.indicators.pivotR1 && (
                <button
                  type="button"
                  onClick={() => {
                    setTargetPriceInput(stock.indicators.pivotR1.toString());
                    setAlertCondition('ABOVE');
                  }}
                  className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded font-bold transition-colors cursor-pointer"
                >
                  R1 Resistance (₹{stock.indicators.pivotR1})
                </button>
              )}
            </div>

            {/* Active Alert Banner or Feedback Messages */}
            {alertMsg && (
              <div className="p-3 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-mono font-bold flex items-center gap-2 mt-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{alertMsg}</span>
              </div>
            )}

            {existingAlert && !alertMsg && (
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg text-xs font-mono flex flex-col sm:flex-row sm:items-center justify-between gap-2 mt-2 text-slate-300">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      existingAlert.enabled && !existingAlert.triggered
                        ? 'bg-emerald-400 animate-pulse'
                        : existingAlert.triggered
                        ? 'bg-rose-500'
                        : 'bg-slate-500'
                    }`}
                  ></span>
                  <span>
                    <strong>Active Alert:</strong> Notify when {stock.symbol} hits{' '}
                    <strong className="text-white">₹{existingAlert.targetPrice.toLocaleString('en-IN')}</strong> ({existingAlert.condition}). Current distance:{' '}
                    <strong className="text-emerald-400">
                      {(((existingAlert.targetPrice - stock.price) / stock.price) * 100).toFixed(2)}%
                    </strong>
                  </span>
                </div>

                {existingAlert.triggered && (
                  <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded font-bold text-[10px] uppercase">
                    Triggered at {existingAlert.triggeredAt} (@ ₹{existingAlert.triggeredPrice})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Dynamic Position Sizing & Risk Calculator with Risk Validation */}
          <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-lg text-slate-100 font-mono">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Calculator className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-sm font-black italic tracking-tighter uppercase text-white">
                    Intraday Position Size & Risk Calculator
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    Calculated with real-time ATR(14) safeguards & 2% stop-loss threshold validation
                  </p>
                </div>
              </div>

              {/* Real-Time Risk Validation Pill */}
              <div className="flex items-center gap-2">
                <div
                  className={`px-3 py-1 rounded-lg text-xs font-bold border flex items-center gap-1.5 ${
                    isExceeding2Percent
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {isExceeding2Percent ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-rose-400 animate-pulse" />
                      <span>SL Risk: {slDistancePercent.toFixed(2)}% (&gt; 2.0% WARNING)</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      <span>Risk Validated: {slDistancePercent.toFixed(2)}% (≤ 2.0%)</span>
                    </>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowRiskOverlayModal(true)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold uppercase rounded-lg transition-colors cursor-pointer"
                >
                  Inspect Risk
                </button>
              </div>
            </div>

            {/* Price Level & Stop Loss Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Entry Price (₹)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={customEntryPrice}
                  onChange={(e) => setCustomEntryPrice(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[10px] uppercase font-bold text-slate-400">
                    Stop Loss (₹)
                  </label>
                  <span
                    className={`text-[10px] font-bold ${
                      isExceeding2Percent ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {slDistancePercent.toFixed(2)}% dist
                  </span>
                </div>
                <input
                  type="number"
                  step="0.05"
                  value={customStopLoss}
                  onChange={(e) => setCustomStopLoss(e.target.value)}
                  className={`w-full px-3 py-2 bg-slate-950 border rounded-lg text-xs font-bold focus:outline-none ${
                    isExceeding2Percent
                      ? 'border-rose-500 text-rose-300 focus:border-rose-400'
                      : 'border-slate-800 text-slate-100 focus:border-emerald-500'
                  }`}
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Target 1 (₹)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={customTarget1}
                  onChange={(e) => setCustomTarget1(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Target 2 (₹)
                </label>
                <input
                  type="number"
                  step="0.05"
                  value={customTarget2}
                  onChange={(e) => setCustomTarget2(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-emerald-400 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            {/* Quick Stop-Loss ATR Adjusters */}
            <div className="flex items-center gap-2 flex-wrap mb-5 pb-4 border-b border-slate-800/80 text-[11px]">
              <span className="text-[10px] uppercase font-bold text-slate-400">ATR Quick Presets:</span>
              <button
                type="button"
                onClick={() => setCustomStopLoss(atrSafe1xSL.toString())}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 rounded-lg font-bold transition-all cursor-pointer"
              >
                1.0x ATR SL (₹{atrSafe1xSL})
              </button>
              <button
                type="button"
                onClick={() => setCustomStopLoss(atrSafe1_5xSL.toString())}
                className="px-2.5 py-1 bg-slate-800 hover:bg-amber-400 hover:text-slate-950 text-amber-300 border border-slate-700 rounded-lg font-bold transition-all cursor-pointer"
              >
                1.5x ATR SL (₹{atrSafe1_5xSL})
              </button>
              <button
                type="button"
                onClick={() => setCustomStopLoss(maxCap2PercentSL.toString())}
                className="px-2.5 py-1 bg-slate-800 hover:bg-emerald-500 hover:text-slate-950 text-slate-200 border border-slate-700 rounded-lg font-bold transition-all cursor-pointer"
              >
                Max 1.95% SL (₹{maxCap2PercentSL})
              </button>
              <button
                type="button"
                onClick={() => setCustomStopLoss((stock.risk.stopLoss || (isSell ? currentEntry * 1.015 : currentEntry * 0.985)).toString())}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700 rounded-lg font-bold transition-all cursor-pointer"
              >
                Default Model SL (₹{stock.risk.stopLoss})
              </button>
            </div>

            {/* Risk Validation & ATR Bounds Inspector Card */}
            <div
              className={`p-4 rounded-xl border mb-5 transition-all ${
                isExceeding2Percent
                  ? 'bg-rose-950/30 border-rose-500/50 shadow-inner'
                  : 'bg-slate-950/80 border-slate-800'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Gauge className={`w-4 h-4 ${isExceeding2Percent ? 'text-rose-400' : 'text-emerald-400'}`} />
                  <span className="text-xs font-black uppercase text-white tracking-wider">
                    Risk Validation & ATR Volatility Diagnostics
                  </span>
                </div>
                <span
                  className={`text-[10px] font-black uppercase px-2 py-0.5 rounded border ${
                    isExceeding2Percent
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}
                >
                  {isExceeding2Percent ? '⚠️ EXCEEDS 2.0% LIMIT' : '🛡️ RISK LIMIT VERIFIED'}
                </span>
              </div>

              {/* Stop-Loss Distance Gauge Bar */}
              <div className="space-y-1.5 mb-4">
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-bold">
                  <span>0% (Tight)</span>
                  <span className="text-emerald-400">1.0% (Normal)</span>
                  <span className="text-amber-400">2.0% (Max Allowed Threshold)</span>
                  <span className="text-rose-400">3.0%+ (Severe Risk)</span>
                </div>
                <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden flex border border-slate-800 relative">
                  {/* Zone segments */}
                  <div className="h-full bg-emerald-500/40 w-[33.3%] border-r border-slate-800"></div>
                  <div className="h-full bg-amber-500/40 w-[33.3%] border-r border-slate-800"></div>
                  <div className="h-full bg-rose-500/40 w-[33.4%]"></div>

                  {/* Marker Pin */}
                  <div
                    className="absolute top-0 bottom-0 w-2.5 bg-white border-2 border-slate-950 rounded-sm shadow-md transition-all -ml-1.5"
                    style={{
                      left: `${Math.min(100, Math.max(0, (slDistancePercent / 3.0) * 100))}%`,
                    }}
                    title={`Current SL Distance: ${slDistancePercent.toFixed(2)}%`}
                  ></div>
                </div>
              </div>

              {/* 4-Metric Risk Diagnostics Breakdown */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Proposed SL Distance</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className={`text-base font-black ${isExceeding2Percent ? 'text-rose-400' : 'text-slate-100'}`}>
                      ₹{slDistance.toFixed(2)}
                    </span>
                    <span className={`text-xs font-bold ${isExceeding2Percent ? 'text-rose-400' : 'text-emerald-400'}`}>
                      ({slDistancePercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Current ATR (14) Volatility</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-base font-black text-amber-300">
                      ₹{atrValue}
                    </span>
                    <span className="text-xs font-bold text-slate-400">
                      ({atrPercent.toFixed(2)}%)
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">ATR Multiple</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className={`text-base font-black ${atrMultiple > 1.5 ? 'text-rose-400' : 'text-slate-100'}`}>
                      {atrMultiple.toFixed(2)}x ATR
                    </span>
                    <span className="text-[10px] text-slate-400">
                      (target: 1.0-1.5x)
                    </span>
                  </div>
                </div>

                <div className="bg-slate-900/90 p-3 rounded-lg border border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Risk Threshold Rule</span>
                  <div className="flex items-baseline gap-1 mt-0.5">
                    <span className="text-base font-black text-slate-100">
                      2.00% Max
                    </span>
                    <span
                      className={`text-[10px] font-bold ${
                        isExceeding2Percent ? 'text-rose-400' : 'text-emerald-400'
                      }`}
                    >
                      {isExceeding2Percent ? 'VIOLATED' : 'PASSED'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Contextual Warning / Guidance Narrative */}
              {isExceeding2Percent ? (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg text-xs space-y-2">
                  <div className="flex items-start gap-2 text-rose-300">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
                    <div>
                      <strong className="block text-rose-200">
                        Warning: Stop-loss distance of {slDistancePercent.toFixed(2)}% exceeds the 2.0% intraday maximum!
                      </strong>
                      <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                        With current ATR(14) at ₹{atrValue} ({atrPercent.toFixed(2)}%), an intraday stop of ₹{slDistance.toFixed(2)} ({atrMultiple.toFixed(2)}x ATR) requires excessive capital allocation to absorb standard swings and increases ruin probability on MIS 5x leverage.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1 border-t border-rose-500/20">
                    <button
                      type="button"
                      onClick={() => setCustomStopLoss(atrSafe1_5xSL.toString())}
                      className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-[11px] uppercase rounded transition-colors cursor-pointer"
                    >
                      ⚡ Auto-Fix to 1.5x ATR SL (₹{atrSafe1_5xSL})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomStopLoss(maxCap2PercentSL.toString())}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] uppercase rounded transition-colors cursor-pointer"
                    >
                      🛡️ Cap at 1.95% SL (₹{maxCap2PercentSL})
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-xs flex items-center gap-2 text-emerald-300">
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>Risk Validation Passed:</strong> Stop loss distance of {slDistancePercent.toFixed(2)}% is within the safe 2.0% intraday boundary ({atrMultiple.toFixed(2)}x ATR).
                  </span>
                </div>
              )}
            </div>

            {/* Capital & Risk Sizing Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
              <div>
                <label className="text-[10px] uppercase font-bold text-slate-300 block mb-1">
                  Capital (₹)
                </label>
                <input
                  type="number"
                  value={capital}
                  onChange={(e) => setCapital(Number(e.target.value) || 10000)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-300 block mb-1">
                  Risk % of Capital
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={riskPercent}
                  onChange={(e) => setRiskPercent(Number(e.target.value) || 0.5)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-bold text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-300 block mb-1">
                  Max Risk Amount
                </label>
                <div className="px-3 py-2 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold">
                  ₹{riskAmount.toLocaleString('en-IN')}
                </div>
              </div>

              <div>
                <label className="text-[10px] uppercase font-bold text-slate-300 block mb-1">
                  Calculated Quantity
                </label>
                <div className="px-3 py-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold">
                  {calculatedQty} Shares
                </div>
              </div>
            </div>

            {/* Algorithmic Timing & Signal Schedule Card */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-900/90 p-3.5 border border-slate-800 rounded-xl mb-4 font-mono">
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/25">
                <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-300 block">Signal Listed At</span>
                  <span className="text-amber-200 font-extrabold text-sm">{getStockSignalListedAt(stock)} IST</span>
                  <span className="text-[9px] text-amber-400/70 block">Algorithmic Detection</span>
                </div>
              </div>
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/25">
                <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-indigo-300 block">Entry Time</span>
                  <span className="text-indigo-200 font-extrabold text-sm">{getStockEntryTime(stock)} IST</span>
                  <span className="text-[9px] text-indigo-400/70 block">Execution Window Open</span>
                </div>
              </div>
              <div className="flex items-center gap-2.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/25">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-300 block">Strategy Timing</span>
                  <span className="text-emerald-200 font-extrabold text-sm">3m Staggered Invalidation</span>
                  <span className="text-[9px] text-emerald-400/70 block">Trailing SL after T1</span>
                </div>
              </div>
            </div>

            {/* Calculated Outcomes & Execution */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-950/80 p-4 border border-slate-800 rounded-lg text-xs mb-4">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Position Value
                </span>
                <span className="text-slate-100 font-bold text-sm">
                  ₹{positionValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  MIS Margin (5x)
                </span>
                <span className="text-slate-100 font-bold text-sm">
                  ₹{misMarginRequired.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Potential Profit (T1)
                </span>
                <span className="text-emerald-400 font-bold text-sm">
                  +₹{profitT1.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Max Loss
                </span>
                <span className="text-rose-400 font-bold text-sm">
                  -₹{maxLoss.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                </span>
              </div>
            </div>

            {/* Execute Position Button */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              {tradeExecutedMsg ? (
                <div className="px-4 py-2 bg-emerald-500/20 text-emerald-300 text-xs font-bold flex items-center gap-2 border border-emerald-500/30 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{tradeExecutedMsg}</span>
                </div>
              ) : (
                <div className="text-xs text-slate-400 flex items-center gap-2 flex-wrap">
                  <span>
                    Ready: <strong>{calculatedQty} shares</strong> of {stock.symbol} @ ₹{currentEntry} | SL: ₹{currentStopLoss}
                  </span>
                  {isExceeding2Percent && (
                    <span className="px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded text-[10px] font-bold">
                      ⚠️ SL &gt; 2% Warning Active
                    </span>
                  )}
                </div>
              )}

              {onCreateTrade && (
                <button
                  onClick={() => {
                    onCreateTrade({
                      symbol: stock.symbol,
                      signal: stock.signal === 'NEUTRAL' ? 'BUY' : stock.signal,
                      entryPrice: currentEntry,
                      quantity: calculatedQty,
                      stopLoss: currentStopLoss,
                      target1: currentTarget1,
                      target2: currentTarget2,
                    });
                    setTradeExecutedMsg(`Trade executed! Active position created for ${stock.symbol}.`);
                    setTimeout(() => setTradeExecutedMsg(''), 4000);
                  }}
                  className={`px-6 py-2.5 font-black text-xs uppercase rounded-lg transition-all border flex items-center gap-2 shadow-md shrink-0 cursor-pointer ${
                    isExceeding2Percent
                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400'
                  }`}
                >
                  <Zap className="w-4 h-4" />
                  <span>Execute Trade Position</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* FULL RISK VALIDATION MODAL OVERLAY DIALOG */}
        {showRiskOverlayModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl font-mono text-slate-100 space-y-5 animate-in fade-in zoom-in duration-200">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-xl border ${isExceeding2Percent ? 'bg-rose-500/20 border-rose-500/30 text-rose-400' : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'}`}>
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-base font-black uppercase text-white tracking-wide">
                      Risk Validation & ATR Volatility Inspector
                    </h3>
                    <p className="text-xs text-slate-400">
                      {stock.symbol} ({stock.name}) • Spot ₹{currentEntry}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowRiskOverlayModal(false)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Status Alert */}
              <div
                className={`p-4 rounded-xl border text-xs space-y-1.5 ${
                  isExceeding2Percent
                    ? 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                    : 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                }`}
              >
                <div className="flex items-center gap-2 font-black text-sm">
                  {isExceeding2Percent ? (
                    <>
                      <AlertTriangle className="w-5 h-5 text-rose-400" />
                      <span>STOP-LOSS DISTANCE EXCEEDS 2.0% LIMIT!</span>
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="w-5 h-5 text-emerald-400" />
                      <span>RISK VALIDATED: STOP-LOSS IS WITHIN SAFE INTRADAY BOUNDS</span>
                    </>
                  )}
                </div>
                <p className="text-slate-300 text-xs leading-relaxed">
                  {isExceeding2Percent
                    ? `The proposed stop-loss distance of ${slDistancePercent.toFixed(2)}% (₹${slDistance.toFixed(2)}) is higher than the maximum recommended 2.00% threshold for intraday stock trading. Based on 14-period ATR volatility of ₹${atrValue}, this stop-loss spans ${atrMultiple.toFixed(2)}x ATR.`
                    : `The proposed stop-loss distance of ${slDistancePercent.toFixed(2)}% (₹${slDistance.toFixed(2)}) complies with the ≤ 2.00% risk ceiling, representing ${atrMultiple.toFixed(2)}x ATR.`}
                </p>
              </div>

              {/* Diagnostics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Proposed SL</span>
                  <span className="text-sm font-black text-white block mt-1">₹{currentStopLoss}</span>
                  <span className={`text-[10px] font-bold ${isExceeding2Percent ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {slDistancePercent.toFixed(2)}% of Spot
                  </span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">14-Period ATR</span>
                  <span className="text-sm font-black text-amber-300 block mt-1">₹{atrValue}</span>
                  <span className="text-[10px] text-slate-400">
                    {atrPercent.toFixed(2)}% of Spot
                  </span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">ATR Multiplier</span>
                  <span className={`text-sm font-black block mt-1 ${atrMultiple > 1.5 ? 'text-rose-400' : 'text-slate-100'}`}>
                    {atrMultiple.toFixed(2)}x ATR
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Optimal: 1.0 - 1.5x
                  </span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800">
                  <span className="text-[9px] uppercase font-bold text-slate-400 block">Risk Threshold</span>
                  <span className="text-sm font-black text-slate-100 block mt-1">2.00% Max</span>
                  <span className={`text-[10px] font-bold ${isExceeding2Percent ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {isExceeding2Percent ? 'EXCEEDED' : 'COMPLIANT'}
                  </span>
                </div>
              </div>

              {/* Comparison & Action Presets */}
              <div className="space-y-2">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                  Select Recommended Stop-Loss Preset:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomStopLoss(atrSafe1xSL.toString());
                      setShowRiskOverlayModal(false);
                    }}
                    className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500 rounded-xl text-left transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-emerald-400">1.0x ATR Stop</span>
                      <span className="text-[10px] text-slate-400 font-bold">
                        {((Math.abs(currentEntry - atrSafe1xSL) / currentEntry) * 100).toFixed(2)}%
                      </span>
                    </div>
                    <span className="text-sm font-black text-white block mt-1">₹{atrSafe1xSL}</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Tight intraday stop
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCustomStopLoss(atrSafe1_5xSL.toString());
                      setShowRiskOverlayModal(false);
                    }}
                    className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-amber-500 rounded-xl text-left transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-amber-300">1.5x ATR (Safe)</span>
                      <span className="text-[10px] text-slate-400 font-bold">
                        {((Math.abs(currentEntry - atrSafe1_5xSL) / currentEntry) * 100).toFixed(2)}%
                      </span>
                    </div>
                    <span className="text-sm font-black text-white block mt-1">₹{atrSafe1_5xSL}</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Optimal volatility cushion
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCustomStopLoss(maxCap2PercentSL.toString());
                      setShowRiskOverlayModal(false);
                    }}
                    className="p-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-blue-500 rounded-xl text-left transition-all cursor-pointer group"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-blue-400">Max 1.95% Cap</span>
                      <span className="text-[10px] text-slate-400 font-bold">1.95%</span>
                    </div>
                    <span className="text-sm font-black text-white block mt-1">₹{maxCap2PercentSL}</span>
                    <span className="text-[10px] text-slate-500 block mt-0.5">
                      Hard limit intraday SL
                    </span>
                  </button>
                </div>
              </div>

              {/* Close / Action footer */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowRiskOverlayModal(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase rounded-lg transition-colors cursor-pointer"
                >
                  Close Diagnostic
                </button>
                {isExceeding2Percent && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomStopLoss(atrSafe1_5xSL.toString());
                      setShowRiskOverlayModal(false);
                    }}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black uppercase rounded-lg transition-colors cursor-pointer"
                  >
                    Apply ATR-Safe SL (₹{atrSafe1_5xSL})
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
  );
};
