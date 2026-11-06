import React, { useState, useMemo, useEffect } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BellOff,
  BellRing,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Cpu,
  DollarSign,
  ExternalLink,
  Flame,
  HelpCircle,
  Layers,
  Lock,
  Maximize2,
  Percent,
  Play,
  Radio,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Workflow,
  Zap,
} from 'lucide-react';
import { ScannedStock } from '../types';
import {
  processGapRelativeStrengthScan,
  calculateSectorPerformances,
  GapRsStockData,
} from '../utils/gapRelativeStrengthEngine';
import { HollyEngineeringFormulaView } from './HollyEngineeringFormulaView';
import { ConfluencePipelineInspector } from './ConfluencePipelineInspector';
import { AlertsLedgerTable } from './formula/AlertsLedgerTable';
import { ScannerMatrixTable } from './formula/ScannerMatrixTable';

interface FormulaDiagnosticsDashboardProps {
  stocks: ScannedStock[];
  selectedSymbol?: string;
  onSelectStock?: (stock: ScannedStock) => void;
  onExecuteTrade?: (stock: ScannedStock, signal: 'BUY' | 'SELL') => void;
  theme?: 'dark' | 'light';
}

interface DiagnosticRuleItem {
  id: string;
  name: string;
  requirement: string;
  actualValue: string;
  passed: boolean;
  pointsEarned: number;
  maxPoints: number;
  explanation: string;
}

interface DiagnosticSection {
  vectorId: string;
  title: string;
  subtitle: string;
  icon: any;
  pointsEarned: number;
  maxPoints: number;
  weightPct: number;
  color: string;
  rules: DiagnosticRuleItem[];
}

export const FormulaDiagnosticsDashboard: React.FC<FormulaDiagnosticsDashboardProps> = ({
  stocks,
  selectedSymbol: initialSymbol,
  onSelectStock,
  onExecuteTrade,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';

  // Process all stocks through the 100-Point World-Class Trader Formula v2 Engine
  const processedStocks: GapRsStockData[] = useMemo(() => {
    return processGapRelativeStrengthScan(stocks);
  }, [stocks]);

  // Global Nifty Benchmark change proxy
  const niftyBenchmarkChange = useMemo(() => {
    if (!stocks || stocks.length === 0) return 0;
    return Number(
      (stocks.reduce((acc, s) => acc + s.changePercent, 0) / stocks.length).toFixed(2)
    );
  }, [stocks]);

  // Sector performance map
  const sectorPerfMap = useMemo(() => {
    return calculateSectorPerformances(stocks);
  }, [stocks]);

  // Active Selected Stock
  const [selectedSymbol, setSelectedSymbol] = useState<string>(() => {
    if (initialSymbol && processedStocks.some((s) => s.symbol === initialSymbol)) {
      return initialSymbol;
    }
    if (processedStocks.length > 0) {
      // Default to highest scoring stock
      const sorted = [...processedStocks].sort((a, b) => b.totalScore - a.totalScore);
      return sorted[0].symbol;
    }
    return '';
  });

  const selectedStock = useMemo(() => {
    return stocks.find((s) => s.symbol === selectedSymbol) || stocks[0];
  }, [stocks, selectedSymbol]);

  // Sync selectedSymbol if initialSymbol changes from parent
  React.useEffect(() => {
    if (initialSymbol && processedStocks.some((s) => s.symbol === initialSymbol)) {
      setSelectedSymbol(initialSymbol);
    }
  }, [initialSymbol, processedStocks]);

  const [formulaEngineMode, setFormulaEngineMode] = useState<'16_PILLAR_CONFLUENCE' | 'WORLD_CLASS_V2' | 'HOLLY_ENGINEERING'>('16_PILLAR_CONFLUENCE');
  const [dashboardTab, setDashboardTab] = useState<'SEVEN_VECTORS' | 'ALERTS_LEDGER' | 'SCANNER_MATRIX'>('SEVEN_VECTORS');
  const [ledgerFilter, setLedgerFilter] = useState<'ALL' | 'OPEN' | 'TARGET_HIT' | 'SL_HIT'>('ALL');

  // Search & Filter State for stock switcher
  const [searchQuery, setSearchQuery] = useState('');
  const [scoreFilter, setScoreFilter] = useState<'ALL' | '90_PLUS' | 'QUALIFIED_BUY' | 'QUALIFIED_SELL' | 'WATCHLIST'>('ALL');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    V1: true,
    V2: true,
    V3: true,
    V4: true,
    V5: true,
    V6: true,
    V7: true,
  });
  const [showTelemetryTable, setShowTelemetryTable] = useState(true);

  // Per-Indicator Alert Toggle State (persisted in localStorage)
  const [indicatorAlerts, setIndicatorAlerts] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('formula_indicator_alerts');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load indicator alerts:', e);
    }
    return {}; // Empty object means all indicators enabled by default
  });

  const [alertToast, setAlertToast] = useState<{ message: string; type: 'enabled' | 'muted' } | null>(null);

  const isAlertEnabled = (ruleId: string): boolean => {
    return indicatorAlerts[ruleId] !== false; // Default true if undefined
  };

  const toggleIndicatorAlert = (ruleId: string, ruleName: string) => {
    const currentState = isAlertEnabled(ruleId);
    const nextState = !currentState;
    setIndicatorAlerts((prev) => {
      const updated = { ...prev, [ruleId]: nextState };
      try {
        localStorage.setItem('formula_indicator_alerts', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    // Show instant feedback toast
    setAlertToast({
      message: nextState
        ? `🔔 Alert ENABLED for: ${ruleName}`
        : `🔕 Alert MUTED for: ${ruleName}`,
      type: nextState ? 'enabled' : 'muted',
    });

    setTimeout(() => {
      setAlertToast(null);
    }, 2800);
  };

  const enableAllIndicatorAlerts = () => {
    const allRuleIds = diagnosticSections.flatMap((sec) => sec.rules.map((r) => r.id));
    const updated: Record<string, boolean> = {};
    allRuleIds.forEach((id) => {
      updated[id] = true;
    });
    setIndicatorAlerts(updated);
    try {
      localStorage.setItem('formula_indicator_alerts', JSON.stringify(updated));
    } catch (e) {}

    setAlertToast({
      message: `🔔 All ${allRuleIds.length} Indicator Alerts ENABLED`,
      type: 'enabled',
    });
    setTimeout(() => setAlertToast(null), 2800);
  };

  const disableAllIndicatorAlerts = () => {
    const allRuleIds = diagnosticSections.flatMap((sec) => sec.rules.map((r) => r.id));
    const updated: Record<string, boolean> = {};
    allRuleIds.forEach((id) => {
      updated[id] = false;
    });
    setIndicatorAlerts(updated);
    try {
      localStorage.setItem('formula_indicator_alerts', JSON.stringify(updated));
    } catch (e) {}

    setAlertToast({
      message: `🔕 All Indicator Alerts MUTED`,
      type: 'muted',
    });
    setTimeout(() => setAlertToast(null), 2800);
  };

  const toggleVectorAlerts = (vectorTitle: string, vectorRules: DiagnosticRuleItem[]) => {
    const anyEnabled = vectorRules.some((r) => isAlertEnabled(r.id));
    const targetState = !anyEnabled;
    setIndicatorAlerts((prev) => {
      const updated = { ...prev };
      vectorRules.forEach((r) => {
        updated[r.id] = targetState;
      });
      try {
        localStorage.setItem('formula_indicator_alerts', JSON.stringify(updated));
      } catch (e) {}
      return updated;
    });

    setAlertToast({
      message: targetState
        ? `🔔 Enabled all alerts in ${vectorTitle}`
        : `🔕 Muted all alerts in ${vectorTitle}`,
      type: targetState ? 'enabled' : 'muted',
    });
    setTimeout(() => setAlertToast(null), 2800);
  };

  const toggleSection = (vId: string) => {
    setExpandedSections((prev) => ({ ...prev, [vId]: !prev[vId] }));
  };

  const expandAll = () => {
    setExpandedSections({ V1: true, V2: true, V3: true, V4: true, V5: true, V6: true, V7: true });
  };

  const collapseAll = () => {
    setExpandedSections({ V1: false, V2: false, V3: false, V4: false, V5: false, V6: false, V7: false });
  };

  // Find currently selected stock data
  const currentStockData = useMemo<GapRsStockData | undefined>(() => {
    return processedStocks.find((s) => s.symbol === selectedSymbol) || processedStocks[0];
  }, [processedStocks, selectedSymbol]);

  // Filtered stocks list for quick selector
  const filteredStockList = useMemo(() => {
    return processedStocks.filter((s) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches =
          s.symbol.toLowerCase().includes(q) ||
          s.name.toLowerCase().includes(q) ||
          s.sector.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (scoreFilter === '90_PLUS') return s.totalScore >= 90;
      if (scoreFilter === 'QUALIFIED_BUY') return s.isBuySetup;
      if (scoreFilter === 'QUALIFIED_SELL') return s.isSellSetup;
      if (scoreFilter === 'WATCHLIST') return s.totalScore >= 70 && s.totalScore < 80;
      return true;
    });
  }, [processedStocks, searchQuery, scoreFilter]);

  // Filtered ledger stocks list
  const ledgerStocks = useMemo(() => {
    return processedStocks.filter((s) => {
      if (ledgerFilter === 'OPEN') return !s.isClosed;
      if (ledgerFilter === 'TARGET_HIT') return s.tradeStatus.startsWith('CLOSED_TARGET');
      if (ledgerFilter === 'SL_HIT') return s.tradeStatus === 'CLOSED_STOP_LOSS';
      return true;
    });
  }, [processedStocks, ledgerFilter]);

  // Build granular 7-Section Diagnostic Breakdown for the selected stock
  const diagnosticSections = useMemo<DiagnosticSection[]>(() => {
    if (!currentStockData) return [];

    const isBull = currentStockData.stockChangePercent >= 0 || currentStockData.relativeStrength >= 0;
    const s = currentStockData;
    const p = s.price;
    const oiChangePct =
      s.stock.oiData?.changeInOIPercent ??
      s.stock.indicators?.oiChangePct ??
      (isBull ? 3.5 : 2.8);

    // =========================================================
    // V1 — MARKET REGIME (15 Pts Max)
    // =========================================================
    const v1Rules: DiagnosticRuleItem[] = isBull
      ? [
          {
            id: 'v1_nifty_vwap',
            name: 'NIFTY Benchmark vs VWAP',
            requirement: 'NIFTY Index Change ≥ 0.00% (Trading Above VWAP)',
            actualValue: `NIFTY Change: ${niftyBenchmarkChange >= 0 ? '+' : ''}${niftyBenchmarkChange}%`,
            passed: niftyBenchmarkChange >= 0,
            pointsEarned: niftyBenchmarkChange >= 0 ? 5 : 0,
            maxPoints: 5,
            explanation: 'Institutional buyers dominate when benchmark NIFTY trades above intraday VWAP equilibrium.',
          },
          {
            id: 'v1_nifty_ema',
            name: 'NIFTY Trend vs 20-EMA',
            requirement: 'NIFTY Change ≥ +0.20% (Above 20-Period EMA)',
            actualValue: `${niftyBenchmarkChange >= 0 ? '+' : ''}${niftyBenchmarkChange}%`,
            passed: niftyBenchmarkChange >= 0.2,
            pointsEarned: niftyBenchmarkChange >= 0.2 ? 3 : 0,
            maxPoints: 3,
            explanation: 'Benchmark trend above short-term EMA provides institutional tailwind for long momentum.',
          },
          {
            id: 'v1_nifty_rsi',
            name: 'Market Momentum RSI Sweet Spot',
            requirement: 'RSI in 50 – 68 Bullish Momentum Zone',
            actualValue: `RSI: ${s.rsi.toFixed(1)}`,
            passed: s.rsi >= 50 && s.rsi <= 68,
            pointsEarned: s.rsi >= 50 && s.rsi <= 68 ? 2 : 0,
            maxPoints: 2,
            explanation: 'RSI between 50 and 68 indicates constructive bullish impulse without extreme overbought exhaustion.',
          },
          {
            id: 'v1_nifty_adx',
            name: 'Trend Direction Strength (ADX)',
            requirement: 'ADX(14) > 20 (Active Trending Regime)',
            actualValue: `ADX: ${s.adx.toFixed(1)}`,
            passed: s.adx > 20,
            pointsEarned: s.adx > 20 ? 2 : 0,
            maxPoints: 2,
            explanation: 'ADX above 20 filters out choppy sideways intraday consolidation.',
          },
          {
            id: 'v1_nifty_5m',
            name: '5-Minute Index Confirmation',
            requirement: '5-min Benchmark Trend Positive',
            actualValue: `${niftyBenchmarkChange >= 0 ? 'Bullish Impulse ▲' : 'Bearish Impulse ▼'}`,
            passed: niftyBenchmarkChange > 0,
            pointsEarned: niftyBenchmarkChange > 0 ? 3 : 0,
            maxPoints: 3,
            explanation: 'Intraday multi-timeframe alignment across 5m and 15m index candles.',
          },
        ]
      : [
          {
            id: 'v1_nifty_vwap',
            name: 'NIFTY Benchmark vs VWAP',
            requirement: 'NIFTY Index Change < 0.00% (Trading Below VWAP)',
            actualValue: `NIFTY Change: ${niftyBenchmarkChange >= 0 ? '+' : ''}${niftyBenchmarkChange}%`,
            passed: niftyBenchmarkChange < 0,
            pointsEarned: niftyBenchmarkChange < 0 ? 5 : 0,
            maxPoints: 5,
            explanation: 'Sellers control index when NIFTY benchmark breaks below intraday VWAP.',
          },
          {
            id: 'v1_nifty_ema',
            name: 'NIFTY Trend vs 20-EMA',
            requirement: 'NIFTY Change ≤ -0.20% (Below 20-Period EMA)',
            actualValue: `${niftyBenchmarkChange >= 0 ? '+' : ''}${niftyBenchmarkChange}%`,
            passed: niftyBenchmarkChange <= -0.2,
            pointsEarned: niftyBenchmarkChange <= -0.2 ? 3 : 0,
            maxPoints: 3,
            explanation: 'Benchmark weakness below 20 EMA empowers short breakdown momentum.',
          },
          {
            id: 'v1_nifty_rsi',
            name: 'Market Momentum RSI Sweet Spot',
            requirement: 'RSI in 35 – 50 Bearish Expansion Zone',
            actualValue: `RSI: ${s.rsi.toFixed(1)}`,
            passed: s.rsi >= 35 && s.rsi <= 50,
            pointsEarned: s.rsi >= 35 && s.rsi <= 50 ? 2 : 0,
            maxPoints: 2,
            explanation: 'RSI between 35 and 50 confirms bearish breakdown without oversold bounce risk.',
          },
          {
            id: 'v1_nifty_adx',
            name: 'Trend Direction Strength (ADX)',
            requirement: 'ADX(14) > 20 (Active Trending Regime)',
            actualValue: `ADX: ${s.adx.toFixed(1)}`,
            passed: s.adx > 20,
            pointsEarned: s.adx > 20 ? 2 : 0,
            maxPoints: 2,
            explanation: 'ADX above 20 confirms directional trending velocity.',
          },
          {
            id: 'v1_nifty_5m',
            name: '5-Minute Index Confirmation',
            requirement: '5-min Benchmark Trend Negative',
            actualValue: `${niftyBenchmarkChange < 0 ? 'Bearish Impulse ▼' : 'Bullish Impulse ▲'}`,
            passed: niftyBenchmarkChange < 0,
            pointsEarned: niftyBenchmarkChange < 0 ? 3 : 0,
            maxPoints: 3,
            explanation: 'Short-term multi-timeframe sync on 5m breakdown candles.',
          },
        ];

    // =========================================================
    // V2 — SECTOR RELATIVE STRENGTH (15 Pts Max)
    // =========================================================
    const v2Rules: DiagnosticRuleItem[] = isBull
      ? [
          {
            id: 'v2_sec_vwap',
            name: 'Sector Index vs VWAP',
            requirement: 'Sector Average % Change > 0.00%',
            actualValue: `${s.sector}: ${s.sectorChangePercent >= 0 ? '+' : ''}${s.sectorChangePercent}%`,
            passed: s.sectorChangePercent > 0,
            pointsEarned: s.sectorChangePercent > 0 ? 4 : 0,
            maxPoints: 4,
            explanation: 'Top performing sectors draw institutional capital rotation.',
          },
          {
            id: 'v2_sec_ema',
            name: 'Sector 20/50 EMA Bullish Alignment',
            requirement: 'Sector % Change ≥ +0.30% (Sector EMA 20 > EMA 50)',
            actualValue: `Sector Change: ${s.sectorChangePercent >= 0 ? '+' : ''}${s.sectorChangePercent}%`,
            passed: s.sectorChangePercent >= 0.3,
            pointsEarned: s.sectorChangePercent >= 0.3 ? 3 : 0,
            maxPoints: 3,
            explanation: 'Sector breadth confirms sustained institutional leadership.',
          },
          {
            id: 'v2_sec_rs',
            name: 'Stock Relative Strength vs Sector',
            requirement: 'RS = (Stock % - Sector %) > 0.00%',
            actualValue: `RS: ${s.relativeStrength >= 0 ? '+' : ''}${s.relativeStrength}%`,
            passed: s.relativeStrength > 0,
            pointsEarned: s.relativeStrength > 0 ? 3 : 0,
            maxPoints: 3,
            explanation: 'True market leaders outperform their own sector basket.',
          },
          {
            id: 'v2_sec_rvol',
            name: 'Sector Volume Expansion (RVOL)',
            requirement: 'Stock RVOL ≥ 1.2x (Participation Volume)',
            actualValue: `RVOL: ${s.rvol.toFixed(2)}x`,
            passed: s.rvol >= 1.2,
            pointsEarned: s.rvol >= 1.2 ? 2 : 0,
            maxPoints: 2,
            explanation: 'Above-average volume confirms aggressive institutional accumulation.',
          },
          {
            id: 'v2_sec_mom',
            name: 'Sector Momentum Velocity',
            requirement: 'Sector Change > +0.10% (Green Confirmation)',
            actualValue: `Sector Change: ${s.sectorChangePercent >= 0 ? '+' : ''}${s.sectorChangePercent}%`,
            passed: s.sectorChangePercent > 0.1,
            pointsEarned: s.sectorChangePercent > 0.1 ? 3 : 0,
            maxPoints: 3,
            explanation: 'Positive sector slope prevents false breakout traps.',
          },
        ]
      : [
          {
            id: 'v2_sec_vwap',
            name: 'Sector Index vs VWAP',
            requirement: 'Sector Average % Change < 0.00%',
            actualValue: `${s.sector}: ${s.sectorChangePercent >= 0 ? '+' : ''}${s.sectorChangePercent}%`,
            passed: s.sectorChangePercent < 0,
            pointsEarned: s.sectorChangePercent < 0 ? 4 : 0,
            maxPoints: 4,
            explanation: 'Lagging sectors trigger widespread institutional liquidation.',
          },
          {
            id: 'v2_sec_ema',
            name: 'Sector 20/50 EMA Bearish Alignment',
            requirement: 'Sector % Change ≤ -0.30% (Sector EMA 20 < EMA 50)',
            actualValue: `Sector Change: ${s.sectorChangePercent >= 0 ? '+' : ''}${s.sectorChangePercent}%`,
            passed: s.sectorChangePercent <= -0.3,
            pointsEarned: s.sectorChangePercent <= -0.3 ? 3 : 0,
            maxPoints: 3,
            explanation: 'Sector-wide breakdown accelerates individual stock drops.',
          },
          {
            id: 'v2_sec_rs',
            name: 'Stock Relative Weakness vs Sector',
            requirement: 'RS = (Stock % - Sector %) < 0.00%',
            actualValue: `RS: ${s.relativeStrength >= 0 ? '+' : ''}${s.relativeStrength}%`,
            passed: s.relativeStrength < 0,
            pointsEarned: s.relativeStrength < 0 ? 3 : 0,
            maxPoints: 3,
            explanation: 'Stocks falling faster than their sector represent premier short candidates.',
          },
          {
            id: 'v2_sec_rvol',
            name: 'Sector Volume Expansion (RVOL)',
            requirement: 'Stock RVOL ≥ 1.2x (Participation Volume)',
            actualValue: `RVOL: ${s.rvol.toFixed(2)}x`,
            passed: s.rvol >= 1.2,
            pointsEarned: s.rvol >= 1.2 ? 2 : 0,
            maxPoints: 2,
            explanation: 'Heavy volume verifies active supply unloading.',
          },
          {
            id: 'v2_sec_mom',
            name: 'Sector Momentum Velocity',
            requirement: 'Sector Change < -0.10% (Red Confirmation)',
            actualValue: `Sector Change: ${s.sectorChangePercent >= 0 ? '+' : ''}${s.sectorChangePercent}%`,
            passed: s.sectorChangePercent < -0.1,
            pointsEarned: s.sectorChangePercent < -0.1 ? 3 : 0,
            maxPoints: 3,
            explanation: 'Negative sector velocity removes upward support cushions.',
          },
        ];

    // =========================================================
    // V3 — STOCK PRICE ACTION & RIBBON (20 Pts Max)
    // =========================================================
    const v3Rules: DiagnosticRuleItem[] = isBull
      ? [
          {
            id: 'v3_stock_vwap',
            name: 'Price vs VWAP Equilibrium',
            requirement: 'Spot Price > Intraday VWAP (Bullish Dominance)',
            actualValue: `Price: ₹${p} | VWAP: ₹${s.vwap.toFixed(2)}`,
            passed: p > s.vwap,
            pointsEarned: p > s.vwap ? 4 : 0,
            maxPoints: 4,
            explanation: 'Price above VWAP proves smart-money accumulation above average institutional traded price.',
          },
          {
            id: 'v3_stock_ema',
            name: 'Exponential Moving Average Ribbon (13 / 21 / 34)',
            requirement: 'EMA 13 > EMA 21 > EMA 34 (Aligned Bullish Fan)',
            actualValue: `13: ₹${s.ema13.toFixed(1)} | 21: ₹${s.ema21.toFixed(1)} | 34: ₹${s.ema34.toFixed(1)}`,
            passed: s.ema13 > s.ema21 && s.ema21 > s.ema34,
            pointsEarned: s.ema13 > s.ema21 && s.ema21 > s.ema34 ? 5 : s.ema13 > s.ema21 ? 3 : 0,
            maxPoints: 5,
            explanation: 'Triple EMA alignment acts as a moving dynamic support floor.',
          },
          {
            id: 'v3_stock_hh_hl',
            name: 'Trend Structure (Higher Highs / Higher Lows)',
            requirement: 'Stock % Change > 0.00% (Uptrend Structure)',
            actualValue: `${s.stockChangePercent >= 0 ? '+' : ''}${s.stockChangePercent}%`,
            passed: s.stockChangePercent > 0,
            pointsEarned: s.stockChangePercent > 0 ? 3 : 0,
            maxPoints: 3,
            explanation: 'Classic Dow theory market structure establishing higher value area.',
          },
          {
            id: 'v3_stock_breakout',
            name: 'Resistance Breakout Magnitude',
            requirement: 'Day Gain ≥ +1.50% (Resistance Clearing Move)',
            actualValue: `${s.stockChangePercent >= 0 ? '+' : ''}${s.stockChangePercent}%`,
            passed: s.stockChangePercent >= 1.5,
            pointsEarned: s.stockChangePercent >= 1.5 ? 4 : 0,
            maxPoints: 4,
            explanation: 'Clears key supply zones and triggers stop-run momentum.',
          },
          {
            id: 'v3_stock_5m_close',
            name: '5-Minute Breakout Candle Confirmation',
            requirement: '5-min Price Change > 0.00% (Candle Closes at Highs)',
            actualValue: `5m Change: ${s.priceChange5m >= 0 ? '+' : ''}${s.priceChange5m}%`,
            passed: s.priceChange5m > 0,
            pointsEarned: s.priceChange5m > 0 ? 4 : 0,
            maxPoints: 4,
            explanation: 'Ensures candle closes above resistance rather than producing a long upper wick rejection.',
          },
        ]
      : [
          {
            id: 'v3_stock_vwap',
            name: 'Price vs VWAP Equilibrium',
            requirement: 'Spot Price < Intraday VWAP (Bearish Dominance)',
            actualValue: `Price: ₹${p} | VWAP: ₹${s.vwap.toFixed(2)}`,
            passed: p < s.vwap,
            pointsEarned: p < s.vwap ? 4 : 0,
            maxPoints: 4,
            explanation: 'Price below VWAP demonstrates relentless institutional distribution and selling pressure.',
          },
          {
            id: 'v3_stock_ema',
            name: 'Exponential Moving Average Ribbon (13 / 21 / 34)',
            requirement: 'EMA 13 < EMA 21 < EMA 34 (Aligned Bearish Fan)',
            actualValue: `13: ₹${s.ema13.toFixed(1)} | 21: ₹${s.ema21.toFixed(1)} | 34: ₹${s.ema34.toFixed(1)}`,
            passed: s.ema13 < s.ema21 && s.ema21 < s.ema34,
            pointsEarned: s.ema13 < s.ema21 && s.ema21 < s.ema34 ? 5 : s.ema13 < s.ema21 ? 3 : 0,
            maxPoints: 5,
            explanation: 'Triple EMA downward cascade caps all attempted intraday counter-rallies.',
          },
          {
            id: 'v3_stock_hh_hl',
            name: 'Trend Structure (Lower Highs / Lower Lows)',
            requirement: 'Stock % Change < 0.00% (Downtrend Structure)',
            actualValue: `${s.stockChangePercent >= 0 ? '+' : ''}${s.stockChangePercent}%`,
            passed: s.stockChangePercent < 0,
            pointsEarned: s.stockChangePercent < 0 ? 3 : 0,
            maxPoints: 3,
            explanation: 'Structural supply dominance forming consecutive lower lows.',
          },
          {
            id: 'v3_stock_breakout',
            name: 'Support Breakdown Magnitude',
            requirement: 'Day Drop ≤ -1.50% (Support Breakdown Move)',
            actualValue: `${s.stockChangePercent >= 0 ? '+' : ''}${s.stockChangePercent}%`,
            passed: s.stockChangePercent <= -1.5,
            pointsEarned: s.stockChangePercent <= -1.5 ? 4 : 0,
            maxPoints: 4,
            explanation: 'Shatters key support floors, forcing long liquidation.',
          },
          {
            id: 'v3_stock_5m_close',
            name: '5-Minute Breakdown Candle Confirmation',
            requirement: '5-min Price Change < 0.00% (Candle Closes at Lows)',
            actualValue: `5m Change: ${s.priceChange5m >= 0 ? '+' : ''}${s.priceChange5m}%`,
            passed: s.priceChange5m < 0,
            pointsEarned: s.priceChange5m < 0 ? 4 : 0,
            maxPoints: 4,
            explanation: 'Prevents false breakdown traps by requiring a clean 5-minute candle close.',
          },
        ];

    // =========================================================
    // V4 — MOMENTUM OSCILLATORS & ADX (15 Pts Max)
    // =========================================================
    const v4Rules: DiagnosticRuleItem[] = isBull
      ? [
          {
            id: 'v4_rsi',
            name: 'RSI(14) Momentum Sweet Spot',
            requirement: 'RSI in 55 – 70 Optimal Acceleration Zone',
            actualValue: `RSI: ${s.rsi.toFixed(1)}`,
            passed: s.rsi >= 55 && s.rsi <= 70,
            pointsEarned: s.rsi >= 55 && s.rsi <= 70 ? 4 : s.rsi >= 50 && s.rsi < 55 ? 2 : 0,
            maxPoints: 4,
            explanation: 'RSI between 55 and 70 signals explosive bullish expansion with ample room before overbought exhaustion.',
          },
          {
            id: 'v4_macd_cross',
            name: 'MACD Zero-Line / Signal Crossover',
            requirement: 'MACD Histogram > 0 (Bullish Momentum)',
            actualValue: `Histogram: ${s.macdHist >= 0 ? '+' : ''}${s.macdHist.toFixed(2)}`,
            passed: s.macdHist > 0,
            pointsEarned: s.macdHist > 0 ? 3 : 0,
            maxPoints: 3,
            explanation: 'Positive MACD histogram proves moving average momentum divergence is accelerating higher.',
          },
          {
            id: 'v4_macd_exp',
            name: 'MACD Histogram Expansion',
            requirement: '5-min Price Velocity Positive (Histogram Expanding)',
            actualValue: `5m Velocity: ${s.priceChange5m >= 0 ? '+' : ''}${s.priceChange5m}%`,
            passed: s.priceChange5m > 0,
            pointsEarned: s.priceChange5m > 0 ? 2 : 0,
            maxPoints: 2,
            explanation: 'Expanding histogram bars confirm active buying participation.',
          },
          {
            id: 'v4_adx',
            name: 'ADX(14) Trend Power',
            requirement: 'ADX ≥ 25 (High-Conviction Trend Strength)',
            actualValue: `ADX: ${s.adx.toFixed(1)}`,
            passed: s.adx >= 25,
            pointsEarned: s.adx >= 25 ? 3 : 0,
            maxPoints: 3,
            explanation: 'ADX ≥ 25 is the gold-standard benchmark for institutional momentum trends.',
          },
          {
            id: 'v4_di',
            name: 'Directional Movement Dominance (+DI vs -DI)',
            requirement: '+DI > -DI (Buyers Outweigh Sellers)',
            actualValue: `+DI: ${s.plusDI.toFixed(1)} | -DI: ${s.minusDI.toFixed(1)}`,
            passed: s.plusDI > s.minusDI,
            pointsEarned: s.plusDI > s.minusDI ? 3 : 0,
            maxPoints: 3,
            explanation: '+DI supremacy verifies positive directional buying pressure across all ticks.',
          },
        ]
      : [
          {
            id: 'v4_rsi',
            name: 'RSI(14) Momentum Sweet Spot',
            requirement: 'RSI in 30 – 45 Bearish Acceleration Zone',
            actualValue: `RSI: ${s.rsi.toFixed(1)}`,
            passed: s.rsi >= 30 && s.rsi <= 45,
            pointsEarned: s.rsi >= 30 && s.rsi <= 45 ? 4 : s.rsi > 45 && s.rsi <= 50 ? 2 : 0,
            maxPoints: 4,
            explanation: 'RSI between 30 and 45 confirms strong downside trend acceleration without oversold stall risk.',
          },
          {
            id: 'v4_macd_cross',
            name: 'MACD Zero-Line / Signal Crossover',
            requirement: 'MACD Histogram < 0 (Bearish Momentum)',
            actualValue: `Histogram: ${s.macdHist >= 0 ? '+' : ''}${s.macdHist.toFixed(2)}`,
            passed: s.macdHist < 0,
            pointsEarned: s.macdHist < 0 ? 3 : 0,
            maxPoints: 3,
            explanation: 'Negative MACD confirms downside price momentum dominance.',
          },
          {
            id: 'v4_macd_exp',
            name: 'MACD Histogram Expansion',
            requirement: '5-min Price Velocity Negative (Histogram Expanding Negative)',
            actualValue: `5m Velocity: ${s.priceChange5m >= 0 ? '+' : ''}${s.priceChange5m}%`,
            passed: s.priceChange5m < 0,
            pointsEarned: s.priceChange5m < 0 ? 2 : 0,
            maxPoints: 2,
            explanation: 'Expanding negative histogram bars indicate accelerating selloff pressure.',
          },
          {
            id: 'v4_adx',
            name: 'ADX(14) Trend Power',
            requirement: 'ADX ≥ 25 (High-Conviction Trend Strength)',
            actualValue: `ADX: ${s.adx.toFixed(1)}`,
            passed: s.adx >= 25,
            pointsEarned: s.adx >= 25 ? 3 : 0,
            maxPoints: 3,
            explanation: 'ADX ≥ 25 eliminates whipsaws and false breakdowns.',
          },
          {
            id: 'v4_di',
            name: 'Directional Movement Dominance (-DI vs +DI)',
            requirement: '-DI > +DI (Sellers Outweigh Buyers)',
            actualValue: `-DI: ${s.minusDI.toFixed(1)} | +DI: ${s.plusDI.toFixed(1)}`,
            passed: s.minusDI > s.plusDI,
            pointsEarned: s.minusDI > s.plusDI ? 3 : 0,
            maxPoints: 3,
            explanation: '-DI dominance demonstrates decisive institutional selling conviction.',
          },
        ];

    // =========================================================
    // V5 — VOLUME & RVOL SURGE (10 Pts Max)
    // =========================================================
    const v5Rules: DiagnosticRuleItem[] = [
      {
        id: 'v5_rvol',
        name: 'Relative Volume (RVOL) Threshold',
        requirement: 'RVOL ≥ 1.5x (Institutional Surge)',
        actualValue: `RVOL: ${s.rvol.toFixed(2)}x`,
        passed: s.rvol >= 1.5,
        pointsEarned: s.rvol >= 1.5 ? 4 : s.rvol >= 1.2 ? 2 : 0,
        maxPoints: 4,
        explanation: 'RVOL ≥ 1.5x represents high abnormal institutional volume versus the 20-day historical average.',
      },
      {
        id: 'v5_vol_rank',
        name: 'Universe Volume Liquidity Rank',
        requirement: 'Volume Rank in Top 50 of F&O / Nifty Universe',
        actualValue: `Vol Rank: #${s.volumeRank} | Vol: ${(s.tradedVolume / 100000).toFixed(2)}L shares`,
        passed: s.volumeRank <= 50,
        pointsEarned: s.volumeRank <= 50 ? 3 : 0,
        maxPoints: 3,
        explanation: 'Ensures the stock is among the most actively traded assets in the market.',
      },
      {
        id: 'v5_breakout_vol',
        name: 'Breakout Volume Confirmation Surge',
        requirement: 'RVOL ≥ 1.8x OR Top 20 Traded Volume Rank',
        actualValue: `RVOL: ${s.rvol.toFixed(2)}x (Rank #${s.volumeRank})`,
        passed: s.rvol >= 1.8 || s.volumeRank <= 20,
        pointsEarned: s.rvol >= 1.8 || s.volumeRank <= 20 ? 3 : 0,
        maxPoints: 3,
        explanation: 'Guarantees breakout moves have backing from Tier-1 institutions and mutual funds.',
      },
    ];

    // =========================================================
    // V6 — FUTURES & OPEN INTEREST (15 Pts Max)
    // =========================================================
    const v6Rules: DiagnosticRuleItem[] = isBull
      ? [
          {
            id: 'v6_buildup',
            name: 'Derivative Buildup Classification',
            requirement: 'Price ↑ + OI ↑ = Long Buildup (or Put Writing)',
            actualValue: `Price ${s.stockChangePercent >= 0 ? '▲' : '▼'} | OI: +${oiChangePct}%`,
            passed: s.stockChangePercent > 0 && oiChangePct > 0,
            pointsEarned: s.stockChangePercent > 0 && oiChangePct > 0 ? 5 : 2,
            maxPoints: 5,
            explanation: 'Long buildup proves fresh money and long contracts are entering the futures market.',
          },
          {
            id: 'v6_fut_vol',
            name: 'Futures Volume Inflow Rank',
            requirement: 'Futures/Cash Traded Value in Top 20',
            actualValue: `Value Rank: #${s.valueRank} (₹${(s.tradedValue / 10000000).toFixed(1)} Cr)`,
            passed: s.valueRank <= 20,
            pointsEarned: s.valueRank <= 20 ? 3 : 0,
            maxPoints: 3,
            explanation: 'High rupee turnover prevents illiquidity slippage and confirms institutional participation.',
          },
          {
            id: 'v6_oi_mom',
            name: 'Open Interest Expansion Velocity',
            requirement: 'OI Increase ≥ +2.00% Today',
            actualValue: `OI Change: +${oiChangePct}%`,
            passed: oiChangePct >= 2.0,
            pointsEarned: oiChangePct >= 2.0 ? 2 : 0,
            maxPoints: 2,
            explanation: 'Substantial OI expansion validates aggressive positional buildup.',
          },
          {
            id: 'v6_basis',
            name: 'Intraday Cash-to-Futures Basis',
            requirement: 'Spot Price > Open (Positive Basis Structure)',
            actualValue: `Price: ₹${p} | Open: ₹${s.open.toFixed(2)}`,
            passed: p > s.open,
            pointsEarned: p > s.open ? 2 : 0,
            maxPoints: 2,
            explanation: 'Intraday basis confirmation guarantees the green body of the daily candlestick.',
          },
          {
            id: 'v6_divergence',
            name: 'OI Divergence Risk Check',
            requirement: 'No Major Bearish OI Divergence (RS ≥ 0%)',
            actualValue: `RS: ${s.relativeStrength >= 0 ? '+' : ''}${s.relativeStrength}%`,
            passed: s.relativeStrength >= 0,
            pointsEarned: s.relativeStrength >= 0 ? 3 : 0,
            maxPoints: 3,
            explanation: 'Ensures no heavy Call writing ceiling or hidden short buildup is lurking.',
          },
        ]
      : [
          {
            id: 'v6_buildup',
            name: 'Derivative Buildup Classification',
            requirement: 'Price ↓ + OI ↑ = Short Buildup (or Call Writing)',
            actualValue: `Price ${s.stockChangePercent < 0 ? '▼' : '▲'} | OI: +${oiChangePct}%`,
            passed: s.stockChangePercent < 0 && oiChangePct > 0,
            pointsEarned: s.stockChangePercent < 0 && oiChangePct > 0 ? 5 : 2,
            maxPoints: 5,
            explanation: 'Short buildup confirms institutional short aggressive positioning.',
          },
          {
            id: 'v6_fut_vol',
            name: 'Futures Volume Inflow Rank',
            requirement: 'Futures/Cash Traded Value in Top 20',
            actualValue: `Value Rank: #${s.valueRank} (₹${(s.tradedValue / 10000000).toFixed(1)} Cr)`,
            passed: s.valueRank <= 20,
            pointsEarned: s.valueRank <= 20 ? 3 : 0,
            maxPoints: 3,
            explanation: 'High liquidity provides clean execution and tight spreads.',
          },
          {
            id: 'v6_oi_mom',
            name: 'Open Interest Expansion Velocity',
            requirement: 'OI Increase ≥ +2.00% Today',
            actualValue: `OI Change: +${oiChangePct}%`,
            passed: oiChangePct >= 2.0,
            pointsEarned: oiChangePct >= 2.0 ? 2 : 0,
            maxPoints: 2,
            explanation: 'Significant short OI accumulation keeps downward momentum going.',
          },
          {
            id: 'v6_basis',
            name: 'Intraday Cash-to-Futures Basis',
            requirement: 'Spot Price < Open (Negative Basis Structure)',
            actualValue: `Price: ₹${p} | Open: ₹${s.open.toFixed(2)}`,
            passed: p < s.open,
            pointsEarned: p < s.open ? 2 : 0,
            maxPoints: 2,
            explanation: 'Price below daily open ensures continuous bearish daily candle formation.',
          },
          {
            id: 'v6_divergence',
            name: 'OI Divergence Risk Check',
            requirement: 'No Major Bullish OI Divergence (RS ≤ 0%)',
            actualValue: `RS: ${s.relativeStrength >= 0 ? '+' : ''}${s.relativeStrength}%`,
            passed: s.relativeStrength <= 0,
            pointsEarned: s.relativeStrength <= 0 ? 3 : 0,
            maxPoints: 3,
            explanation: 'Verifies no aggressive Put writing support floor is absorbing selling pressure.',
          },
        ];

    // =========================================================
    // V7 — RISK MANAGEMENT & VOLATILITY (10 Pts Max)
    // =========================================================
    const vwapDistPct = Number((Math.abs(p - s.vwap) / (s.vwap || 1) * 100).toFixed(2));
    const slDistRatio = Number((s.atr / (p || 1)).toFixed(4));

    const v7Rules: DiagnosticRuleItem[] = [
      {
        id: 'v7_atr',
        name: 'ATR Intraday Range Movement Available',
        requirement: 'ATR(14) > ₹0.00 (Adequate Range Potential)',
        actualValue: `ATR(14): ₹${s.atr.toFixed(2)} (${((s.atr / p) * 100).toFixed(2)}% of Price)`,
        passed: s.atr > 0,
        pointsEarned: s.atr > 0 ? 3 : 0,
        maxPoints: 3,
        explanation: 'ATR provides the mathematical volatility boundary required for minimum 1:2 Risk/Reward.',
      },
      {
        id: 'v7_liquidity',
        name: 'Bid-Ask Liquidity & Execution Safety',
        requirement: 'Volume Rank & Value Rank ≤ 50',
        actualValue: `Vol Rank #${s.volumeRank} | Val Rank #${s.valueRank}`,
        passed: s.volumeRank <= 50 && s.valueRank <= 50,
        pointsEarned: s.volumeRank <= 50 && s.valueRank <= 50 ? 2 : 0,
        maxPoints: 2,
        explanation: 'Guarantees sub-second order fill with virtually zero bid-ask market impact.',
      },
      {
        id: 'v7_vwap_ext',
        name: 'VWAP Extension / Over-Extension Guard',
        requirement: 'Distance from VWAP ≤ 2.50% (Prevents Chasing)',
        actualValue: `VWAP Distance: ${vwapDistPct}%`,
        passed: vwapDistPct <= 2.5,
        pointsEarned: vwapDistPct <= 2.5 ? 2 : 0,
        maxPoints: 2,
        explanation: 'Protects against buying at the extreme top of an exhausted impulse wave.',
      },
      {
        id: 'v7_sl_dist',
        name: 'Stop Loss Feasibility (Risk Per Share)',
        requirement: 'ATR / Price ≤ 3.00% (Controlled Drawdown)',
        actualValue: `Risk Ratio: ${(slDistRatio * 100).toFixed(2)}%`,
        passed: slDistRatio <= 0.03,
        pointsEarned: slDistRatio <= 0.03 ? 3 : 0,
        maxPoints: 3,
        explanation: 'Tight, realistic stop loss allows optimal position sizing within standard 1% risk rules.',
      },
    ];

    return [
      {
        vectorId: 'V1',
        title: 'Section 1: Market Regime',
        subtitle: 'Benchmark NIFTY 50 trend, VWAP, momentum & market breadth confirmation',
        icon: Activity,
        pointsEarned: s.v1MarketRegimePts,
        maxPoints: 15,
        weightPct: 15,
        color: 'indigo',
        rules: v1Rules,
      },
      {
        vectorId: 'V2',
        title: 'Section 2: Sector Strength & RS',
        subtitle: 'Sector leadership, sector RS vs NIFTY & volume expansion filter',
        icon: Layers,
        pointsEarned: s.v2SectorStrengthPts,
        maxPoints: 15,
        weightPct: 15,
        color: 'blue',
        rules: v2Rules,
      },
      {
        vectorId: 'V3',
        title: 'Section 3: Stock Price Action',
        subtitle: 'VWAP relationship, EMA 13/21/34 ribbon, resistance breakout & 5m confirmation',
        icon: TrendingUp,
        pointsEarned: s.v3StockPriceActionPts,
        maxPoints: 20,
        weightPct: 20,
        color: 'emerald',
        rules: v3Rules,
      },
      {
        vectorId: 'V4',
        title: 'Section 4: Momentum & Oscillators',
        subtitle: 'RSI sweet spot (55–70 / 30–45), MACD histogram, ADX ≥ 25 & +DI/-DI dominance',
        icon: Zap,
        pointsEarned: s.v4MomentumPts,
        maxPoints: 15,
        weightPct: 15,
        color: 'amber',
        rules: v4Rules,
      },
      {
        vectorId: 'V5',
        title: 'Section 5: Volume & RVOL Surge',
        subtitle: 'RVOL ≥ 1.5x, 20-bar SMA surge & universe liquidity rankings',
        icon: BarChart3,
        pointsEarned: s.v5VolumeRvolPts,
        maxPoints: 10,
        weightPct: 10,
        color: 'cyan',
        rules: v5Rules,
      },
      {
        vectorId: 'V6',
        title: 'Section 6: Futures & Open Interest',
        subtitle: 'Derivative buildup classification, cash-futures basis & OI expansion velocity',
        icon: Target,
        pointsEarned: s.v6FuturesOiPts,
        maxPoints: 15,
        weightPct: 15,
        color: 'purple',
        rules: v6Rules,
      },
      {
        vectorId: 'V7',
        title: 'Section 7: Risk Management & Volatility',
        subtitle: 'ATR boundary sizing, VWAP extension filter (≤2.5%) & controlled stop loss',
        icon: ShieldCheck,
        pointsEarned: s.v7RiskVolatilityPts,
        maxPoints: 10,
        weightPct: 10,
        color: 'rose',
        rules: v7Rules,
      },
    ];
  }, [currentStockData, niftyBenchmarkChange]);

  if (!currentStockData) {
    return (
      <div className={`p-8 text-center rounded-2xl border font-mono ${isDark ? 'bg-slate-900 border-slate-800 text-slate-400' : 'bg-white border-slate-200'}`}>
        <Activity className="w-10 h-10 mx-auto text-indigo-400 animate-spin mb-3" />
        <p className="font-bold uppercase">Loading Formula Diagnostics Engine...</p>
      </div>
    );
  }

  const isBullish = currentStockData.stockChangePercent >= 0 || currentStockData.relativeStrength >= 0;
  const isHighScore = currentStockData.totalScore >= 80;
  const isQualified = currentStockData.isBuySetup || currentStockData.isSellSetup;

  const totalRulesCount = useMemo(() => {
    return diagnosticSections.reduce((acc, sec) => acc + sec.rules.length, 0);
  }, [diagnosticSections]);

  const activeAlertsCount = useMemo(() => {
    return diagnosticSections.reduce(
      (acc, sec) => acc + sec.rules.filter((r) => isAlertEnabled(r.id)).length,
      0
    );
  }, [diagnosticSections, indicatorAlerts]);

  return (
    <div className="space-y-6 font-sans">
      {/* Interactive Alert Feedback Toast */}
      {alertToast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce">
          <div
            className={`px-4 py-3 rounded-2xl border shadow-2xl flex items-center gap-3 text-xs font-mono font-bold backdrop-blur-md ${
              alertToast.type === 'enabled'
                ? 'bg-emerald-950/95 border-emerald-500/60 text-emerald-200 shadow-emerald-950/50'
                : 'bg-slate-900/95 border-slate-700 text-slate-300 shadow-slate-950/50'
            }`}
          >
            {alertToast.type === 'enabled' ? (
              <BellRing className="w-4 h-4 text-emerald-400 animate-pulse" />
            ) : (
              <BellOff className="w-4 h-4 text-slate-400" />
            )}
            <span>{alertToast.message}</span>
          </div>
        </div>
      )}
      {/* ============================================================= */}
      {/* 0. FORMULA ENGINE SELECTOR (16-PILLAR CONFLUENCE vs V2 vs HOLLY) */}
      {/* ============================================================= */}
      <div
        className={`p-2 rounded-2xl border flex items-center gap-2 flex-wrap lg:flex-nowrap ${
          isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
        }`}
      >
        <button
          onClick={() => setFormulaEngineMode('16_PILLAR_CONFLUENCE')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-mono font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
            formulaEngineMode === '16_PILLAR_CONFLUENCE'
              ? 'bg-gradient-to-r from-indigo-600 via-purple-600 to-emerald-600 text-white shadow-md shadow-indigo-600/30 ring-2 ring-indigo-400/40'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
        >
          <Workflow className="w-4 h-4 text-emerald-300 animate-pulse" />
          <span>16-PILLAR CONFLUENCE ENGINE (NIFTY 200)</span>
          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            MASTER
          </span>
        </button>

        <button
          onClick={() => setFormulaEngineMode('WORLD_CLASS_V2')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-mono font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
            formulaEngineMode === 'WORLD_CLASS_V2'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
        >
          <Flame className="w-4 h-4 text-amber-300" />
          <span>100-PT TRADER FORMULA V2 (7 VECTORS)</span>
        </button>

        <button
          onClick={() => setFormulaEngineMode('HOLLY_ENGINEERING')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs font-mono font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
            formulaEngineMode === 'HOLLY_ENGINEERING'
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/30'
              : isDark
              ? 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              : 'text-slate-600 hover:text-slate-900 hover:bg-white'
          }`}
        >
          <Cpu className="w-4 h-4 text-pink-300" />
          <span>HOLLY AI QUANT ENGINEERING (6 VECTORS)</span>
        </button>
      </div>

      {formulaEngineMode === '16_PILLAR_CONFLUENCE' ? (
        <div className="space-y-6">
          {/* Stock Quick Picker Bar */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-mono font-bold uppercase text-slate-400">Select Symbol:</span>
              <div className="relative">
                <input
                  type="text"
                  placeholder="SEARCH..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-700 text-white text-xs font-mono px-3 py-1 rounded-lg uppercase w-32 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <div className="flex items-center gap-1.5 overflow-x-auto max-w-xl py-1">
                {stocks
                  .filter((s) => !searchQuery || s.symbol.toLowerCase().includes(searchQuery.toLowerCase()))
                  .slice(0, 10)
                  .map((stk) => (
                    <button
                      key={stk.symbol}
                      onClick={() => {
                        setSelectedSymbol(stk.symbol);
                        if (onSelectStock) onSelectStock(stk);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold uppercase transition-all ${
                        selectedStock?.symbol === stk.symbol
                          ? 'bg-indigo-600 text-white shadow'
                          : 'bg-slate-950 text-slate-300 hover:bg-slate-800 border border-slate-800'
                      }`}
                    >
                      {stk.symbol}
                    </button>
                  ))}
              </div>
            </div>

            {selectedStock && (
              <div className="text-xs font-mono flex items-center gap-3">
                <span className="text-slate-400">Current: <strong className="text-white">{selectedStock.symbol}</strong></span>
                <span className="text-indigo-300">₹{selectedStock.price.toFixed(2)}</span>
                <span className={selectedStock.changePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                  {selectedStock.changePercent >= 0 ? '+' : ''}{selectedStock.changePercent.toFixed(2)}%
                </span>
              </div>
            )}
          </div>

          {/* Render ConfluencePipelineInspector for selected stock */}
          {selectedStock ? (
            <ConfluencePipelineInspector
              stock={selectedStock}
              isDark={isDark}
              onExecuteTrade={onExecuteTrade}
            />
          ) : (
            <div className="p-8 text-center text-slate-400 font-mono">
              Please select a stock from Nifty 200 to inspect the 16-Pillar Confluence Pipeline.
            </div>
          )}
        </div>
      ) : formulaEngineMode === 'HOLLY_ENGINEERING' ? (
        <HollyEngineeringFormulaView
          stocks={stocks}
          selectedSymbol={selectedSymbol}
          onSelectStock={(stock) => {
            setSelectedSymbol(stock.symbol);
            if (onSelectStock) onSelectStock(stock);
          }}
          onExecuteTrade={onExecuteTrade}
          theme={isDark ? 'dark' : 'light'}
        />
      ) : (
        <>
          {/* ------------------------------------------------------------- */}
          {/* 1. TOP HEADER & STOCK QUICK SELECTOR */}
          {/* ------------------------------------------------------------- */}
          <div
            className={`p-5 sm:p-6 rounded-3xl border shadow-xl backdrop-blur-md transition-all ${
              isDark
                ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-indigo-950/20'
                : 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
            }`}
          >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-800/60">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2.5 py-0.5 text-xs font-mono font-black rounded-lg bg-indigo-600 text-white uppercase tracking-wider shadow-sm flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-amber-300" />
                <span>World-Class Trader Formula v2</span>
              </span>
              <span className="px-2.5 py-0.5 text-xs font-mono font-bold rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                100-Point Triple Confluence Model
              </span>
              <span className="px-2.5 py-0.5 text-xs font-mono font-bold rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" />
                <span>Live Real-Time Telemetry</span>
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black italic tracking-tight flex items-center gap-2">
              <span>Formula Diagnostics Dashboard</span>
            </h1>
            <p className="text-xs sm:text-sm opacity-70 font-sans mt-0.5 max-w-3xl">
              Inspect the exact mathematical inputs, boolean conditions, and point breakdowns across all 7 institutional vectors (Market, Sector, Price Action, Momentum, Volume, Derivatives OI, and Risk Limits).
            </p>
          </div>

          {/* Quick Actions / Execute Order */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={() => {
                if (onExecuteTrade && currentStockData) {
                  onExecuteTrade(
                    currentStockData.stock,
                    isBullish ? 'BUY' : 'SELL'
                  );
                }
              }}
              className={`px-4 py-2.5 rounded-xl font-mono font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg transition-all ${
                isBullish
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                  : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>Execute {isBullish ? 'BUY' : 'SELL'} Signal</span>
            </button>
            <button
              onClick={expandAll}
              className={`px-3 py-2 rounded-xl text-xs font-mono font-bold border transition-all ${
                isDark ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-800'
              }`}
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className={`px-3 py-2 rounded-xl text-xs font-mono font-bold border transition-all ${
                isDark ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-800'
              }`}
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Stock Selector Filter Bar */}
        <div className="pt-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <input
              type="text"
              placeholder="Search stock (e.g. RELIANCE, TCS)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500'
                  : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
              }`}
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1">
            <button
              onClick={() => setScoreFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all shrink-0 ${
                scoreFilter === 'ALL'
                  ? 'bg-indigo-600 text-white'
                  : isDark
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              ALL ({processedStocks.length})
            </button>
            <button
              onClick={() => setScoreFilter('90_PLUS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all shrink-0 ${
                scoreFilter === '90_PLUS'
                  ? 'bg-emerald-600 text-white'
                  : isDark
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              🔥 90+ PTS ({processedStocks.filter((s) => s.totalScore >= 90).length})
            </button>
            <button
              onClick={() => setScoreFilter('QUALIFIED_BUY')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all shrink-0 ${
                scoreFilter === 'QUALIFIED_BUY'
                  ? 'bg-emerald-600 text-white'
                  : isDark
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              🟢 QUALIFIED BUY ({processedStocks.filter((s) => s.isBuySetup).length})
            </button>
            <button
              onClick={() => setScoreFilter('QUALIFIED_SELL')}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all shrink-0 ${
                scoreFilter === 'QUALIFIED_SELL'
                  ? 'bg-rose-600 text-white'
                  : isDark
                  ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              🔴 QUALIFIED SELL ({processedStocks.filter((s) => s.isSellSetup).length})
            </button>
          </div>
        </div>

        {/* Horizontal Quick-Pick Stock Buttons */}
        <div className="mt-3 pt-3 border-t border-slate-800/40 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          <span className="text-[11px] font-mono uppercase opacity-60 shrink-0">SELECT STOCK:</span>
          {filteredStockList.slice(0, 18).map((stk) => {
            const isSelected = stk.symbol === selectedSymbol;
            const isBull = stk.stockChangePercent >= 0;
            return (
              <button
                key={stk.symbol}
                onClick={() => {
                  setSelectedSymbol(stk.symbol);
                  if (onSelectStock) onSelectStock(stk.stock);
                }}
                className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 border ${
                  isSelected
                    ? isDark
                      ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                      : 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                    : isDark
                    ? 'bg-slate-950/80 border-slate-800 hover:border-slate-700 text-slate-300'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300 text-slate-800'
                }`}
              >
                <span>{stk.symbol}</span>
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-black ${
                    stk.totalScore >= 80
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : stk.totalScore >= 70
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-slate-700 text-slate-300'
                  }`}
                >
                  {stk.totalScore} PTS
                </span>
                <span className={`text-[10px] ${isBull ? 'text-emerald-400' : 'text-rose-400'}`}>
                  {isBull ? '▲' : '▼'}
                </span>
              </button>
            );
          })}
        </div>

        {/* DASHBOARD VIEW MODE SELECTOR TABS */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 mt-4 pt-4 border-t border-slate-800/60 text-xs font-mono">
          <button
            onClick={() => setDashboardTab('SEVEN_VECTORS')}
            className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shrink-0 ${
              dashboardTab === 'SEVEN_VECTORS'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : isDark
                ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4 text-emerald-400" />
            <span>7-VECTOR DIAGNOSTIC DEEP-DIVE</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">100 PTS</span>
          </button>

          <button
            onClick={() => setDashboardTab('ALERTS_LEDGER')}
            className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shrink-0 ${
              dashboardTab === 'ALERTS_LEDGER'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : isDark
                ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Zap className="w-4 h-4 text-amber-400" />
            <span>ALERTS &amp; CLOSED TRADES LEDGER</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">
              {processedStocks.filter((s) => s.isClosed).length} CLOSED
            </span>
          </button>

          <button
            onClick={() => setDashboardTab('SCANNER_MATRIX')}
            className={`px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 shrink-0 ${
              dashboardTab === 'SCANNER_MATRIX'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : isDark
                ? 'bg-slate-800/80 text-slate-300 hover:bg-slate-800'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <BarChart3 className="w-4 h-4 text-cyan-400" />
            <span>200-STOCK UNIVERSE MATRIX</span>
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300">
              {processedStocks.length}
            </span>
          </button>
        </div>
      </div>

      {/* TAB 2: ALERTS & CLOSED TRADES LEDGER */}
      {dashboardTab === 'ALERTS_LEDGER' && (
        <AlertsLedgerTable
          stocks={processedStocks}
          ledgerFilter={ledgerFilter}
          onFilterChange={setLedgerFilter}
          onSelectStock={(sym) => {
            setSelectedSymbol(sym);
            setDashboardTab('SEVEN_VECTORS');
          }}
          isDark={isDark}
        />
      )}

      {/* TAB 3: 200-STOCK UNIVERSE SCANNER MATRIX */}
      {dashboardTab === 'SCANNER_MATRIX' && (
        <ScannerMatrixTable
          stocks={processedStocks}
          selectedSymbol={selectedSymbol}
          onSelectStock={(sym) => {
            setSelectedSymbol(sym);
            setDashboardTab('SEVEN_VECTORS');
          }}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          scoreFilter={scoreFilter}
          onScoreFilterChange={setScoreFilter}
          isDark={isDark}
        />
      )}

      {/* TAB 1: 7-VECTOR DIAGNOSTIC DEEP-DIVE & MASTER DIAGNOSTIC CARD */}
      {dashboardTab === 'SEVEN_VECTORS' && (
        <div id="formula-7-vectors-section" className="space-y-6">
      {/* ------------------------------------------------------------- */}
      {/* 2. SELECTED STOCK MASTER DIAGNOSTIC CARD */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`p-6 rounded-3xl border shadow-xl relative overflow-hidden transition-all ${
          isDark
            ? 'bg-slate-900/90 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Subtle Background Accent */}
        <div
          className={`absolute top-0 right-0 w-96 h-96 rounded-full blur-3xl opacity-10 pointer-events-none ${
            isBullish ? 'bg-emerald-500' : 'bg-rose-500'
          }`}
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left Column: Stock Identity, Sector, Price & Gap info (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-3 flex-wrap">
                  <h2 className="text-3xl sm:text-4xl font-black italic tracking-tight font-mono">
                    {currentStockData.symbol}
                  </h2>
                  <span className="px-3 py-1 text-xs font-mono font-bold uppercase rounded-xl bg-slate-800 text-slate-200 border border-slate-700">
                    {currentStockData.sector}
                  </span>
                  <span
                    className={`px-3 py-1 text-xs font-mono font-black uppercase rounded-xl border flex items-center gap-1.5 ${
                      isBullish
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                        : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                    }`}
                  >
                    {isBullish ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                    <span>{isBullish ? 'BULLISH BIAS' : 'BEARISH BIAS'}</span>
                  </span>
                </div>
                <div className="text-sm opacity-70 font-sans mt-1">{currentStockData.name}</div>
              </div>

              {/* Price & Change Display */}
              <div className="text-right">
                <div className="text-2xl sm:text-3xl font-mono font-black">
                  ₹{currentStockData.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div
                  className={`text-sm font-mono font-black flex items-center justify-end gap-1 ${
                    isBullish ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  <span>
                    {currentStockData.stockChangePercent >= 0 ? '+' : ''}
                    {currentStockData.stockChangePercent.toFixed(2)}%
                  </span>
                  <span>({isBullish ? '▲' : '▼'})</span>
                </div>
              </div>
            </div>

            {/* Badges Row: Signal Tier, Qualification, Institutional Entry */}
            <div className="flex items-center gap-2 flex-wrap text-xs font-mono">
              {/* Signal Tier Badge */}
              <span
                className={`px-3 py-1.5 rounded-xl font-black uppercase border flex items-center gap-1.5 ${
                  currentStockData.totalScore >= 90
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-md shadow-emerald-600/20'
                    : currentStockData.totalScore >= 80
                    ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                    : currentStockData.totalScore >= 70
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                <Flame className="w-4 h-4 text-amber-400" />
                <span>{currentStockData.signalTier}</span>
              </span>

              {/* Setup Qualification */}
              <span
                className={`px-3 py-1.5 rounded-xl font-bold uppercase border flex items-center gap-1.5 ${
                  isQualified
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : currentStockData.totalScore >= 70
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {isQualified ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-200" />
                    <span>QUALIFIED 100% SETUP</span>
                  </>
                ) : currentStockData.totalScore >= 70 ? (
                  <>
                    <Clock className="w-4 h-4 text-amber-300" />
                    <span>WATCHLIST (SCORE ≥ 70)</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    <span>SCORE &lt; 70 (NO TRADE)</span>
                  </>
                )}
              </span>

              {/* Institutional Entry Confirmation */}
              {currentStockData.instConfirmation !== 'NEUTRAL' && (
                <span className="px-3 py-1.5 rounded-xl font-bold uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                  <span>{currentStockData.instConfirmation}</span>
                </span>
              )}
            </div>

            {/* Gap Filter Notice if any */}
            {currentStockData.gapFilterNotice && (
              <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <span>{currentStockData.gapFilterNotice}</span>
              </div>
            )}

            {/* Quick Metrics Bar: Gap %, Relative Strength, RVOL, Traded Value */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-xs">
              <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="opacity-50 text-[10px] uppercase font-bold">GAP % CLASSIFICATION:</div>
                <div className="font-black text-sm flex items-center gap-1 mt-0.5">
                  <span className={currentStockData.gapPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {currentStockData.gapPct >= 0 ? '+' : ''}{currentStockData.gapPct}%
                  </span>
                  <span className="text-[10px] opacity-70">({currentStockData.gapClassification})</span>
                </div>
              </div>

              <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="opacity-50 text-[10px] uppercase font-bold">RELATIVE STRENGTH (RS):</div>
                <div className="font-black text-sm flex items-center gap-1 mt-0.5">
                  <span className={currentStockData.relativeStrength >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {currentStockData.relativeStrength >= 0 ? '+' : ''}{currentStockData.relativeStrength}%
                  </span>
                  <span className="text-[10px] opacity-70">vs Sector</span>
                </div>
              </div>

              <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="opacity-50 text-[10px] uppercase font-bold">RVOL (20-BAR):</div>
                <div className="font-black text-sm mt-0.5 text-cyan-400">
                  {currentStockData.rvol.toFixed(2)}x
                  <span className="text-[10px] opacity-70 ml-1">Surge</span>
                </div>
              </div>

              <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
                <div className="opacity-50 text-[10px] uppercase font-bold">TRADED VALUE:</div>
                <div className="font-black text-sm mt-0.5 text-amber-300">
                  ₹{(currentStockData.tradedValue / 10000000).toFixed(1)} Cr
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Giant 100-Points Score Gauge & Radial Breakdown (5 cols) */}
          <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 rounded-2xl bg-gradient-to-b from-indigo-950/40 to-slate-950/60 border border-indigo-500/20 text-center">
            <div className="text-xs font-mono font-bold uppercase tracking-widest text-indigo-300 mb-1 flex items-center gap-1.5">
              <Target className="w-4 h-4 text-indigo-400" />
              <span>100-POINT FORMULA SCORE</span>
            </div>

            {/* Giant Score Number */}
            <div className="relative my-2">
              <div
                className={`text-6xl sm:text-7xl font-black font-mono tracking-tight ${
                  currentStockData.totalScore >= 90
                    ? 'text-emerald-400 drop-shadow-[0_0_25px_rgba(52,211,153,0.4)]'
                    : currentStockData.totalScore >= 80
                    ? 'text-indigo-300 drop-shadow-[0_0_20px_rgba(129,140,248,0.3)]'
                    : currentStockData.totalScore >= 70
                    ? 'text-amber-300'
                    : 'text-rose-400'
                }`}
              >
                {currentStockData.totalScore}
                <span className="text-2xl sm:text-3xl font-bold opacity-60">/100</span>
              </div>
            </div>

            {/* Score Progress Bar */}
            <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden p-0.5 border border-slate-700/80 my-2">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  currentStockData.totalScore >= 90
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-300 shadow-md shadow-emerald-500/50'
                    : currentStockData.totalScore >= 80
                    ? 'bg-gradient-to-r from-indigo-500 to-cyan-400'
                    : currentStockData.totalScore >= 70
                    ? 'bg-gradient-to-r from-amber-500 to-yellow-300'
                    : 'bg-gradient-to-r from-rose-500 to-red-400'
                }`}
                style={{ width: `${Math.min(100, currentStockData.totalScore)}%` }}
              />
            </div>

            {/* 7 Section Quick Pts Pills */}
            <div className="grid grid-cols-7 gap-1 w-full mt-3 text-[10px] font-mono">
              <div className="p-1 rounded bg-slate-900 border border-slate-800">
                <div className="opacity-50">V1</div>
                <div className="font-bold text-indigo-300">{currentStockData.v1MarketRegimePts}/15</div>
              </div>
              <div className="p-1 rounded bg-slate-900 border border-slate-800">
                <div className="opacity-50">V2</div>
                <div className="font-bold text-blue-300">{currentStockData.v2SectorStrengthPts}/15</div>
              </div>
              <div className="p-1 rounded bg-slate-900 border border-slate-800">
                <div className="opacity-50">V3</div>
                <div className="font-bold text-emerald-300">{currentStockData.v3StockPriceActionPts}/20</div>
              </div>
              <div className="p-1 rounded bg-slate-900 border border-slate-800">
                <div className="opacity-50">V4</div>
                <div className="font-bold text-amber-300">{currentStockData.v4MomentumPts}/15</div>
              </div>
              <div className="p-1 rounded bg-slate-900 border border-slate-800">
                <div className="opacity-50">V5</div>
                <div className="font-bold text-cyan-300">{currentStockData.v5VolumeRvolPts}/10</div>
              </div>
              <div className="p-1 rounded bg-slate-900 border border-slate-800">
                <div className="opacity-50">V6</div>
                <div className="font-bold text-purple-300">{currentStockData.v6FuturesOiPts}/15</div>
              </div>
              <div className="p-1 rounded bg-slate-900 border border-slate-800">
                <div className="opacity-50">V7</div>
                <div className="font-bold text-rose-300">{currentStockData.v7RiskVolatilityPts}/10</div>
              </div>
            </div>

            {/* Score Verdict */}
            <div className="mt-3 text-xs font-mono opacity-80">
              {currentStockData.totalScore >= 90
                ? '🏆 Institutional Triple-Confluence Breakout Signal'
                : currentStockData.totalScore >= 80
                ? '🟢 High-Probability Grade-A Quant Trade Setup'
                : currentStockData.totalScore >= 70
                ? '🟡 Qualified Watchlist Candidate — Monitor VWAP Pullback'
                : '❌ Low Conviction / Filter Criteria Failed'}
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. EXECUTION & TIMING ENGINE CARD (ENTRY, SL, TARGETS) */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`p-5 sm:p-6 rounded-3xl border shadow-lg transition-all ${
          isDark ? 'bg-slate-900/80 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800/60 flex-wrap">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-black italic font-mono uppercase tracking-tight">
              Execution Timing &amp; Dynamic Exit Matrix (1R, 1.5R, 2R)
            </h3>
          </div>
          <div className="text-xs font-mono font-bold text-amber-300 flex items-center gap-1.5">
            <span className="opacity-60">Cutoff Exit:</span>
            <span>⏱️ 15:15 IST (Auto Intraday Square-off)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 font-mono text-xs">
          {/* Entry Range */}
          <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="opacity-50 text-[10px] font-bold uppercase">ENTRY RANGE:</div>
            <div className="font-black text-sm text-indigo-400 mt-1">
              ₹{currentStockData.recommendedEntryPrice}
            </div>
            <div className="text-[10px] opacity-60 mt-0.5">
              [₹{currentStockData.entryRange[0]} – ₹{currentStockData.entryRange[1]}]
            </div>
          </div>

          {/* Stop Loss */}
          <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="opacity-50 text-[10px] font-bold uppercase">STOP LOSS (1R RISK):</div>
            <div className="font-black text-sm text-rose-400 mt-1">
              ₹{currentStockData.stopLossExit}
            </div>
            <div className="text-[10px] opacity-60 mt-0.5">
              Risk/Share: ₹{currentStockData.riskPerShare}
            </div>
          </div>

          {/* Target 1 */}
          <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="opacity-50 text-[10px] font-bold uppercase">TARGET 1 (1.0R):</div>
            <div className="font-black text-sm text-emerald-400 mt-1">
              ₹{currentStockData.target1Exit}
            </div>
            <div className="text-[10px] opacity-60 mt-0.5">Book 50% &amp; Move SL to Entry</div>
          </div>

          {/* Target 2 */}
          <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="opacity-50 text-[10px] font-bold uppercase">TARGET 2 (1.5R):</div>
            <div className="font-black text-sm text-emerald-400 mt-1">
              ₹{currentStockData.target2Exit}
            </div>
            <div className="text-[10px] opacity-60 mt-0.5">Trail SL to Target 1</div>
          </div>

          {/* Target 3 */}
          <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
            <div className="opacity-50 text-[10px] font-bold uppercase">TARGET 3 (2.0R):</div>
            <div className="font-black text-sm text-emerald-400 mt-1">
              ₹{currentStockData.target3Exit}
            </div>
            <div className="text-[10px] opacity-60 mt-0.5">Runner Trail with 13-EMA</div>
          </div>
        </div>

        {/* Real-time Status Banner */}
        <div className="mt-3 p-3 rounded-2xl bg-indigo-950/40 border border-indigo-500/30 flex items-center justify-between text-xs font-mono flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="opacity-60">TIMING WINDOW:</span>
            <span className="font-bold text-indigo-300">{currentStockData.perfectEntryTime}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="opacity-60">LIVE EXIT STATUS:</span>
            <span className="font-bold text-amber-300">{currentStockData.perfectExitTime}</span>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. THE 7 SECTIONS DIAGNOSTIC BREAKDOWN ACCORDION */}
      {/* ------------------------------------------------------------- */}
      <div className="space-y-4">
        {/* PER-INDICATOR ALERT CONTROL BAR */}
        <div
          className={`p-4 sm:p-5 rounded-3xl border shadow-md flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition-all ${
            isDark
              ? 'bg-gradient-to-r from-indigo-950/60 via-slate-900/90 to-slate-900/95 border-indigo-500/30 text-slate-100'
              : 'bg-gradient-to-r from-indigo-50 via-white to-slate-50 border-indigo-200 text-slate-900'
          }`}
        >
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center shrink-0">
              <BellRing className="w-5 h-5 text-indigo-400 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-sm font-black font-mono tracking-tight uppercase">
                  Per-Indicator Live Alert Engine
                </span>
                <span className="px-2.5 py-0.5 text-[10px] font-mono font-black rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {activeAlertsCount} / {totalRulesCount} ALERTS ACTIVE
                </span>
              </div>
              <p className="text-xs opacity-70 font-sans mt-0.5 max-w-xl">
                Enable or mute individual technical &amp; quantitative criteria. When stock telemetry satisfies enabled conditions, real-time alert triggers fire immediately.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <button
              onClick={enableAllIndicatorAlerts}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <Bell className="w-3.5 h-3.5" />
              <span>Enable All</span>
            </button>

            <button
              onClick={disableAllIndicatorAlerts}
              className={`px-3.5 py-2 rounded-xl border font-mono text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                isDark
                  ? 'bg-slate-800/80 hover:bg-slate-800 text-slate-300 border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-300'
              }`}
            >
              <BellOff className="w-3.5 h-3.5" />
              <span>Mute All</span>
            </button>

            <button
              onClick={() => {
                localStorage.removeItem('formula_indicator_alerts');
                setIndicatorAlerts({});
                setAlertToast({ message: '🔄 Reset all indicator alerts to default (All ON)', type: 'enabled' });
                setTimeout(() => setAlertToast(null), 2800);
              }}
              className={`p-2 rounded-xl border font-mono text-xs font-bold flex items-center justify-center transition-all cursor-pointer ${
                isDark
                  ? 'bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border-slate-700'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
              }`}
              title="Reset alerts to default"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div>
            <h3 className="text-lg sm:text-xl font-black italic font-mono uppercase tracking-tight flex items-center gap-2">
              <Sliders className="w-5 h-5 text-indigo-400" />
              <span>7 Institutional Vectors: Itemized Points Breakdown</span>
            </h3>
            <p className="text-xs opacity-70 font-sans mt-0.5">
              Click any section to inspect specific mathematical conditions, live parameter inputs, and configure indicator alerts.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {diagnosticSections.map((sec) => {
            const isExpanded = !!expandedSections[sec.vectorId];
            const Icon = sec.icon;
            const pctEarned = Math.round((sec.pointsEarned / sec.maxPoints) * 100);
            const activeRulesInSec = sec.rules.filter((r) => isAlertEnabled(r.id)).length;

            return (
              <div
                key={sec.vectorId}
                className={`rounded-2xl border transition-all overflow-hidden ${
                  isDark
                    ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-md'
                    : 'bg-white border-slate-200 text-slate-900 shadow-sm'
                }`}
              >
                {/* Accordion Header */}
                <button
                  onClick={() => toggleSection(sec.vectorId)}
                  className={`w-full p-4 sm:p-5 flex items-center justify-between gap-4 text-left transition-colors ${
                    isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div
                      className={`p-2.5 rounded-xl border flex items-center justify-center shrink-0 ${
                        isDark ? 'bg-slate-950 border-slate-800 text-indigo-400' : 'bg-slate-100 border-slate-300 text-indigo-600'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm sm:text-base font-black font-mono tracking-tight">{sec.title}</span>
                        <span className="px-2 py-0.5 text-[10px] font-mono font-bold rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {sec.weightPct}% Weight
                        </span>
                      </div>
                      <div className="text-xs opacity-60 font-sans truncate mt-0.5">{sec.subtitle}</div>
                    </div>
                  </div>

                  {/* Right Score Progress & Expand Chevron */}
                  <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                    {/* Quick Vector Alert Toggle */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleVectorAlerts(sec.title, sec.rules);
                      }}
                      className="px-2.5 py-1 rounded-xl text-[10px] font-mono font-bold bg-slate-800/90 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all cursor-pointer"
                      title="Click to toggle all indicator alerts in this section"
                    >
                      {activeRulesInSec > 0 ? (
                        <>
                          <Bell className="w-3 h-3 text-indigo-400" />
                          <span>
                            {activeRulesInSec}/{sec.rules.length} On
                          </span>
                        </>
                      ) : (
                        <>
                          <BellOff className="w-3 h-3 text-slate-500" />
                          <span className="text-slate-500">Muted</span>
                        </>
                      )}
                    </div>

                    <div className="text-right font-mono">
                      <div className="text-base font-black">
                        <span className={sec.pointsEarned === sec.maxPoints ? 'text-emerald-400' : sec.pointsEarned > 0 ? 'text-amber-300' : 'text-rose-400'}>
                          {sec.pointsEarned}
                        </span>
                        <span className="opacity-60 text-xs"> / {sec.maxPoints} PTS</span>
                      </div>
                      <div className="text-[10px] opacity-60">({pctEarned}% Confluence)</div>
                    </div>

                    <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </button>

                {/* Accordion Content: Rules Table */}
                {isExpanded && (
                  <div className="p-4 sm:p-5 pt-0 border-t border-slate-800/60 font-mono text-xs">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="border-b border-slate-800/60 opacity-60 text-[10px] uppercase">
                            <th className="py-2 pr-3">Rule / Requirement Condition</th>
                            <th className="py-2 px-3">Live Telemetry Input</th>
                            <th className="py-2 px-3">Status</th>
                            <th className="py-2 px-3 text-right">Points Earned</th>
                            <th className="py-2 pl-3 text-center">Alert Trigger Switch</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                          {sec.rules.map((r) => (
                            <tr key={r.id} className="hover:bg-slate-800/20 transition-colors">
                              <td className="py-3 pr-3">
                                <div className="font-bold text-slate-100">{r.name}</div>
                                <div className="text-[11px] opacity-70 text-indigo-300 font-sans mt-0.5">{r.requirement}</div>
                                <div className="text-[10px] opacity-50 font-sans mt-0.5">{r.explanation}</div>
                              </td>
                              <td className="py-3 px-3 font-bold text-amber-300 whitespace-nowrap">
                                {r.actualValue}
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-bold inline-flex items-center gap-1 ${
                                    r.passed
                                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                  }`}
                                >
                                  {r.passed ? (
                                    <>
                                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                                      <span>PASSED</span>
                                    </>
                                  ) : (
                                    <>
                                      <ShieldAlert className="w-3 h-3 text-rose-400" />
                                      <span>FAILED</span>
                                    </>
                                  )}
                                </span>
                              </td>
                              <td className="py-3 px-3 text-right font-black whitespace-nowrap">
                                <span className={r.pointsEarned > 0 ? 'text-emerald-400' : 'text-slate-500'}>
                                  +{r.pointsEarned}
                                </span>
                                <span className="opacity-50 text-[10px]"> / {r.maxPoints} pts</span>
                              </td>
                              <td className="py-3 pl-3 text-center whitespace-nowrap">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleIndicatorAlert(r.id, r.name);
                                    }}
                                    className={`group relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                      isAlertEnabled(r.id) ? 'bg-indigo-600' : 'bg-slate-700'
                                    }`}
                                    role="switch"
                                    aria-checked={isAlertEnabled(r.id)}
                                    title={isAlertEnabled(r.id) ? 'Alert Active: Click to Mute' : 'Alert Muted: Click to Enable'}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out flex items-center justify-center ${
                                        isAlertEnabled(r.id) ? 'translate-x-5' : 'translate-x-0'
                                      }`}
                                    >
                                      {isAlertEnabled(r.id) ? (
                                        <Bell className="w-2.5 h-2.5 text-indigo-600" />
                                      ) : (
                                        <BellOff className="w-2.5 h-2.5 text-slate-500" />
                                      )}
                                    </span>
                                  </button>

                                  <span
                                    className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded-md flex items-center gap-1.5 ${
                                      isAlertEnabled(r.id)
                                        ? r.passed
                                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                          : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                        : 'bg-slate-800 text-slate-500 border border-slate-700'
                                    }`}
                                  >
                                    {isAlertEnabled(r.id) ? (
                                      r.passed ? (
                                        <>
                                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                          <span>FIRING</span>
                                        </>
                                      ) : (
                                        <>
                                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                                          <span>ARMED</span>
                                        </>
                                      )
                                    ) : (
                                      <>
                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                        <span>MUTED</span>
                                      </>
                                    )}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 5. ALL 16 REAL-TIME RAW INPUT TELEMETRY PARAMETERS TABLE */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`p-5 sm:p-6 rounded-3xl border shadow-lg transition-all ${
          isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800/60 flex-wrap">
          <div>
            <h3 className="text-lg font-black italic font-mono uppercase tracking-tight flex items-center gap-2">
              <Activity className="w-5 h-5 text-emerald-400" />
              <span>Full Real-Time Input Telemetry (16 Core Quant Parameters)</span>
            </h3>
            <p className="text-xs opacity-70 font-sans mt-0.5">
              Live technical and derivative sensor values feeding the scoring algorithms for {currentStockData.symbol}.
            </p>
          </div>
          <button
            onClick={() => setShowTelemetryTable((prev) => !prev)}
            className="text-xs font-mono font-bold text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
          >
            {showTelemetryTable ? 'Hide Raw Matrix ▲' : 'Show Raw Matrix ▼'}
          </button>
        </div>

        {showTelemetryTable && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 font-mono text-xs">
            {/* 1. Traded Volume */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">1. TRADED VOLUME:</div>
              <div className="font-bold text-sm text-slate-100 mt-1">
                {(currentStockData.tradedVolume).toLocaleString('en-IN')} shares
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">Universe Rank #{currentStockData.volumeRank}</div>
            </div>

            {/* 2. Traded Value */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">2. TRADED VALUE:</div>
              <div className="font-bold text-sm text-amber-300 mt-1">
                ₹{(currentStockData.tradedValue / 10000000).toFixed(2)} Crores
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">Universe Rank #{currentStockData.valueRank}</div>
            </div>

            {/* 3. Sector % Change */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">3. SECTOR % CHANGE:</div>
              <div className={`font-bold text-sm mt-1 ${currentStockData.sectorChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {currentStockData.sectorChangePercent >= 0 ? '+' : ''}{currentStockData.sectorChangePercent}%
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">{currentStockData.sectorConfirmation}</div>
            </div>

            {/* 4. Stock % Change */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">4. STOCK % CHANGE:</div>
              <div className={`font-bold text-sm mt-1 ${currentStockData.stockChangePercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {currentStockData.stockChangePercent >= 0 ? '+' : ''}{currentStockData.stockChangePercent}%
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">Day Movement Range</div>
            </div>

            {/* 5. Previous Close */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">5. PREVIOUS CLOSE:</div>
              <div className="font-bold text-sm text-slate-100 mt-1">
                ₹{currentStockData.previousClose.toFixed(2)}
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">Base reference level</div>
            </div>

            {/* 6. Today's Open */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">6. TODAY'S OPEN:</div>
              <div className="font-bold text-sm text-slate-100 mt-1">
                ₹{currentStockData.open.toFixed(2)}
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">Market opening tick</div>
            </div>

            {/* 7. Current Price */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">7. CURRENT PRICE:</div>
              <div className="font-bold text-sm text-indigo-400 mt-1">
                ₹{currentStockData.price.toFixed(2)}
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">Live spot execution quote</div>
            </div>

            {/* 8. 5-Min Volume */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">8. 5-MIN CANDLE VOLUME:</div>
              <div className="font-bold text-sm text-cyan-400 mt-1">
                {currentStockData.vol5m.toLocaleString('en-IN')} shares
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">Latest 5-min surge velocity</div>
            </div>

            {/* 9. 5-Min Price Change */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">9. 5-MIN PRICE CHANGE:</div>
              <div className={`font-bold text-sm mt-1 ${currentStockData.priceChange5m >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {currentStockData.priceChange5m >= 0 ? '+' : ''}{currentStockData.priceChange5m}%
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">Candle close velocity</div>
            </div>

            {/* 10. Gap % */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">10. GAP % &amp; TYPE:</div>
              <div className={`font-bold text-sm mt-1 ${currentStockData.gapPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {currentStockData.gapPct >= 0 ? '+' : ''}{currentStockData.gapPct}%
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">{currentStockData.gapClassification}</div>
            </div>

            {/* 11. Relative Strength vs Sector */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">11. RELATIVE STRENGTH:</div>
              <div className={`font-bold text-sm mt-1 ${currentStockData.relativeStrength >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {currentStockData.relativeStrength >= 0 ? '+' : ''}{currentStockData.relativeStrength}%
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">Stock % minus Sector %</div>
            </div>

            {/* 12. Intraday VWAP */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">12. INTRADAY VWAP:</div>
              <div className="font-bold text-sm text-indigo-300 mt-1">
                ₹{currentStockData.vwap.toFixed(2)}
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">
                {currentStockData.price > currentStockData.vwap ? 'Price Above VWAP ▲' : 'Price Below VWAP ▼'}
              </div>
            </div>

            {/* 13. EMA Ribbon (13, 21, 34) */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">13. EMA RIBBON (13/21/34):</div>
              <div className="font-bold text-xs text-slate-200 mt-1">
                13: ₹{currentStockData.ema13.toFixed(1)} | 21: ₹{currentStockData.ema21.toFixed(1)}
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">34: ₹{currentStockData.ema34.toFixed(1)}</div>
            </div>

            {/* 14. Momentum: RSI, MACD, ADX */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">14. MOMENTUM METRICS:</div>
              <div className="font-bold text-xs text-amber-300 mt-1">
                RSI: {currentStockData.rsi.toFixed(1)} | ADX: {currentStockData.adx.toFixed(1)}
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">
                MACD Hist: {currentStockData.macdHist >= 0 ? '+' : ''}{currentStockData.macdHist.toFixed(2)}
              </div>
            </div>

            {/* 15. Directional Index (+DI vs -DI) */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">15. DIRECTIONAL (+DI / -DI):</div>
              <div className="font-bold text-xs text-cyan-300 mt-1">
                +DI: {currentStockData.plusDI.toFixed(1)} | -DI: {currentStockData.minusDI.toFixed(1)}
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">
                {currentStockData.plusDI > currentStockData.minusDI ? 'Buyers in Control' : 'Sellers in Control'}
              </div>
            </div>

            {/* 16. Volatility ATR(14) */}
            <div className={`p-3 rounded-2xl border ${isDark ? 'bg-slate-950/70 border-slate-800' : 'bg-slate-50 border-slate-200'}`}>
              <div className="opacity-50 text-[10px] uppercase font-bold">16. VOLATILITY ATR(14):</div>
              <div className="font-bold text-sm text-emerald-400 mt-1">
                ₹{currentStockData.atr.toFixed(2)}
              </div>
              <div className="text-[10px] opacity-60 mt-0.5">
                {((currentStockData.atr / currentStockData.price) * 100).toFixed(2)}% Daily Range
              </div>
            </div>
          </div>
        )}
      </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
