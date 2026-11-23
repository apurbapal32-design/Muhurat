import { Candle, ScannedStock } from '../src/types';
import { IntradayCandleBar } from './autonomousPriceService';
import {
  LOCKED_SYSTEM_RULES,
  LockedSessionWindowStatus,
  getLockedSessionWindowStatus,
  isTimeWithinScanWindow,
  passesRule3Thresholds,
} from './systemFiveRules';
import {
  computeUniversalStrongMetrics,
  sortRowsByListedAtDescZtoA,
  CandlesLookup,
} from './scannerUniversalGate';
import { AiTradeActionStatus } from './aiTradeManagerAgent';

export type ScannerCategory20 =
  | 'MOMENTUM'
  | 'ORDER_FLOW'
  | 'FNO_OI'
  | 'PRICE_ACTION'
  | 'MUHURAT_CORE'
  | 'QUANT_AI';

export type ScannerId20 =
  | 'top-momentum'
  | 'money-flow'
  | 'most-active-fno'
  | 'claude-fno'
  | 'smart-money-concepts'
  | 'price-action'
  | 'apex-alpha'
  | 'intraday-stock'
  | 'strong'
  | 'sonic'
  | 'titan'
  | 'elite'
  | 'elite-pro'
  | 'titan-cash'
  | 'cloud-ai'
  | 'world-strategy'
  | 'claude-10skills'
  | 'liquidity'
  | 'vwap-surge'
  | 'oi-short-cover';

export interface AssignedAiAgentSpec {
  agentId: string;
  agentNumber: number; // 1..20
  name: string;
  genderLabel: 'He' | 'She';
  role: string;
  specialty: string;
  riskPerTradePct: number;
  atrSlMultiplier: number;
  trailBreakevenR: number;
  target1R: number;
  target2R: number;
}

export interface ScannerDefinition20 {
  rank: number; // 1..20
  scannerId: ScannerId20;
  scannerName: string;
  shortTag: string;
  tabId: string;
  category: ScannerCategory20;
  formulaSummary: string;
  isNewScanner?: boolean;
  agent: AssignedAiAgentSpec;
}

/**
 * TOTAL 20 SCANNERS — EVERY SCANNER ASSIGNED ITS OWN DEDICATED AI AGENT (TOTAL 20 AI AGENTS: 10 He + 10 She).
 * Every single scanner & AI agent obeys ALL 5 LOCKED SYSTEM RULES.
 */
export const SCANNER_FLEET_20_DEFINITIONS: readonly ScannerDefinition20[] = Object.freeze([
  {
    rank: 1,
    scannerId: 'top-momentum',
    scannerName: 'Top Momentum (Order Flow)',
    shortTag: 'UP • DOWN',
    tabId: 'momentum',
    category: 'MOMENTUM',
    formulaSummary: 'VWAP + EMA(13/21) Momentum Thrust + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-01',
      agentNumber: 1,
      name: 'Aryan AI',
      genderLabel: 'He',
      role: 'Momentum Ignition Entry & Exit Manager',
      specialty: 'High-velocity breakout entries, +1R BE lock & momentum runner exits',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.15,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 2,
    scannerId: 'money-flow',
    scannerName: 'Money Flow (ST + HMA55 + OB)',
    shortTag: 'ST • HMA55',
    tabId: 'money-flow',
    category: 'ORDER_FLOW',
    formulaSummary: 'Supertrend(10,2) + Institutional Order Flow + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-02',
      agentNumber: 2,
      name: 'Aria AI',
      genderLabel: 'She',
      role: 'Smart Money Flow SL & Trailing Exit Manager',
      specialty: 'Supertrend trailing stop protection & institutional block profit booking',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.1,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 3,
    scannerId: 'most-active-fno',
    scannerName: 'Most Active FNO & Options',
    shortTag: 'FNO • OPT',
    tabId: 'most-active-fno',
    category: 'FNO_OI',
    formulaSummary: 'High Turnover F&O + PDH/PDL & ORB 15m + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-03',
      agentNumber: 3,
      name: 'Kabir AI',
      genderLabel: 'He',
      role: 'Most Active F&O Entry & Stop-Loss Manager',
      specialty: 'Heavy F&O turnover breakouts with tight ATR stop-loss discipline',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.1,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 4,
    scannerId: 'claude-fno',
    scannerName: 'Claude FNO (10-Point Scorecard)',
    shortTag: '10-PT • 1:2R',
    tabId: 'claude-fno',
    category: 'FNO_OI',
    formulaSummary: '10-Pt Institutional F&O Score + VWAP + OI Confirmation + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-04',
      agentNumber: 4,
      name: 'Ananya AI',
      genderLabel: 'She',
      role: '10-Point Scorecard Risk & Target Manager',
      specialty: 'Confluence scorecard execution with strict 1:2.5 R:R and T1/T2 scaling',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.05,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 5,
    scannerId: 'smart-money-concepts',
    scannerName: 'Smart Money Concepts (ICT)',
    shortTag: 'BOS • FVG • OB',
    tabId: 'smart-money-concepts',
    category: 'PRICE_ACTION',
    formulaSummary: 'ICT BOS/CHoCH + Discount/Premium OB + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-05',
      agentNumber: 5,
      name: 'Rohan AI',
      genderLabel: 'He',
      role: 'ICT Structure & Order Block Trade Manager',
      specialty: 'Liquidity sweep entries anchored below/above institutional order blocks',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.15,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 6,
    scannerId: 'price-action',
    scannerName: 'Price Action (9/9 Institutional)',
    shortTag: '9/9 • D&S',
    tabId: 'price-action',
    category: 'PRICE_ACTION',
    formulaSummary: 'Pure Demand/Supply + Swing Structure Breakout + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-06',
      agentNumber: 6,
      name: 'Diya AI',
      genderLabel: 'She',
      role: 'Price Action Structure & Exit Manager',
      specialty: 'Clean swing-low/swing-high stop placement & structural profit targets',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.1,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 7,
    scannerId: 'apex-alpha',
    scannerName: 'Apex Alpha (VWAP Coil + Reclaim)',
    shortTag: 'PF 1.87 • WIN',
    tabId: 'apex-alpha',
    category: 'QUANT_AI',
    formulaSummary: 'VWAP Compression Coil + PDH/PDL Reclaim + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-07',
      agentNumber: 7,
      name: 'Siddharth AI',
      genderLabel: 'He',
      role: 'Apex Alpha Reclaim & Trail-Lock Manager',
      specialty: 'Coil release execution with early breakeven protection & runner trailing',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.05,
      trailBreakevenR: 0.9,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 8,
    scannerId: 'intraday-stock',
    scannerName: 'Intraday Stock (DFC 5m Secret)',
    shortTag: 'DFC 5m • HL',
    tabId: 'intraday-stock',
    category: 'PRICE_ACTION',
    formulaSummary: '5m Day First Candle High/Low Breakout + PDH/PDL + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-08',
      agentNumber: 8,
      name: 'Kavya AI',
      genderLabel: 'She',
      role: 'DFC 5m Breakout Entry & Square-Off Manager',
      specialty: 'First-candle range breakout execution with strict 15:15 IST close guard',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.1,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 9,
    scannerId: 'strong',
    scannerName: 'Muhurat Strong (ORB 15m)',
    shortTag: 'ORB 15m',
    tabId: 'strong',
    category: 'MUHURAT_CORE',
    formulaSummary: '15m Opening Range Breakout + CPR TC/BC Clear + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-09',
      agentNumber: 9,
      name: 'Arjun AI',
      genderLabel: 'He',
      role: '15m ORB Entry & Stop-Loss Manager',
      specialty: 'Opening range expansion entries with CPR pivot stop-loss guarding',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.15,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 10,
    scannerId: 'sonic',
    scannerName: 'Muhurat Pulse (RVOL • OI)',
    shortTag: 'RVOL • OI',
    tabId: 'sonic',
    category: 'MUHURAT_CORE',
    formulaSummary: 'Abnormal RVOL Spike + Fresh OI Buildup + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-10',
      agentNumber: 10,
      name: 'Nisha AI',
      genderLabel: 'She',
      role: 'Pulse OI Surge Risk & Exit Manager',
      specialty: 'Tracks sudden volume/OI expansion and locks trailing profits rapidly',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.1,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 11,
    scannerId: 'titan',
    scannerName: 'Muhurat Flow (Whales)',
    shortTag: 'WHALES',
    tabId: 'titan',
    category: 'ORDER_FLOW',
    formulaSummary: 'Institutional Whale Order Imbalance + VWAP + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-11',
      agentNumber: 11,
      name: 'Dev AI',
      genderLabel: 'He',
      role: 'Whale Flow Entry & Runner Manager',
      specialty: 'Rides institutional block accumulation with wide trailing profit capture',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.2,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 12,
    scannerId: 'elite',
    scannerName: 'Muhurat Elite (3m Squeeze)',
    shortTag: '3m SQUEEZE',
    tabId: 'elite',
    category: 'MUHURAT_CORE',
    formulaSummary: 'Bollinger Squeeze Release + RSI Momentum + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-12',
      agentNumber: 12,
      name: 'Riya AI',
      genderLabel: 'She',
      role: '3m Squeeze Scalp & Stop-Loss Manager',
      specialty: 'Fast squeeze-release entries with tight initial SL & quick T1 booking',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.0,
      trailBreakevenR: 0.9,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 13,
    scannerId: 'elite-pro',
    scannerName: 'Muhurat Elite Pro (6m Waves)',
    shortTag: '6m WAVES',
    tabId: 'elite-pro',
    category: 'MUHURAT_CORE',
    formulaSummary: 'EMA(13/21/34) Trend Wave + MACD Impulse + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-13',
      agentNumber: 13,
      name: 'Ishaan AI',
      genderLabel: 'He',
      role: '6m Wave Continuation Entry & Exit Manager',
      specialty: 'Multi-wave intraday trend continuation & dynamic trailing stop ratchets',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.15,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 14,
    scannerId: 'titan-cash',
    scannerName: 'Muhurat Flow Cash (Delivery)',
    shortTag: 'DELIVERY DIST',
    tabId: 'titan-cash',
    category: 'ORDER_FLOW',
    formulaSummary: 'High Cash Value Accumulation + Bid-Ask Dominance + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-14',
      agentNumber: 14,
      name: 'Tara AI',
      genderLabel: 'She',
      role: 'Cash Delivery Accumulation Trade Manager',
      specialty: 'Institutional delivery-backed moves with disciplined drawdown protection',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.2,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 15,
    scannerId: 'cloud-ai',
    scannerName: 'Claude AI Trading Skill',
    shortTag: 'AUTO SETUPS',
    tabId: 'cloud-ai',
    category: 'QUANT_AI',
    formulaSummary: 'Multi-Factor AI Confluence Score >= 72 + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-15',
      agentNumber: 15,
      name: 'Nikhil AI',
      genderLabel: 'He',
      role: 'AI Auto-Setup Execution & SL Manager',
      specialty: 'Synthesizes multi-indicator AI scorecards into exact entry & exit levels',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.1,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 16,
    scannerId: 'world-strategy',
    scannerName: 'World #1 Omni-Quantum v4.0',
    shortTag: 'OMNI v4.0',
    tabId: 'world-strategy',
    category: 'QUANT_AI',
    formulaSummary: '6-Layer Quantum CVD + Virgin CPR + VWAP + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-16',
      agentNumber: 16,
      name: 'Priya AI',
      genderLabel: 'She',
      role: 'Omni-Quantum Alpha Entry & Trailing Manager',
      specialty: 'High-conviction 6-layer setups with automated +1R BE & T2 runner exits',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.1,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 17,
    scannerId: 'claude-10skills',
    scannerName: '10-Skill AI & Sentinel',
    shortTag: 'v5.0 PRO',
    tabId: 'claude-10skills',
    category: 'QUANT_AI',
    formulaSummary: '10-Skill Consensus + Trend/Vol/OI Alignment + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-17',
      agentNumber: 17,
      name: 'Vivaan AI',
      genderLabel: 'He',
      role: '10-Skill Sentinel Risk & Execution Manager',
      specialty: 'Zero-error sentinel supervision guarding risk caps & stop-loss integrity',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.1,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 18,
    scannerId: 'liquidity',
    scannerName: 'Market Liquidity (Top Traded)',
    shortTag: 'TOP TRADED',
    tabId: 'liquidity',
    category: 'ORDER_FLOW',
    formulaSummary: 'Top Institutional Value Traded + Directional VWAP + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-18',
      agentNumber: 18,
      name: 'Zoya AI',
      genderLabel: 'She',
      role: 'High-Liquidity Execution & Exit Manager',
      specialty: 'Low-slippage institutional liquidity entries with crisp T1/T2 profit lock',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.15,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 19,
    scannerId: 'vwap-surge',
    scannerName: 'VWAP Deviation & Gamma Surge',
    shortTag: 'NEW #19',
    tabId: 'vwap-surge',
    category: 'MOMENTUM',
    isNewScanner: true,
    formulaSummary: 'VWAP Expansion Band (>±0.6% VWAP) + ATR Surge + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-19',
      agentNumber: 19,
      name: 'Vikram AI',
      genderLabel: 'He',
      role: 'VWAP Gamma Surge Entry & Stop-Loss Manager',
      specialty: 'Captures explosive VWAP deviation surges with VWAP-anchored SL protection',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.05,
      trailBreakevenR: 1.0,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
  {
    rank: 20,
    scannerId: 'oi-short-cover',
    scannerName: 'OI Breakout & Short-Cover Trap',
    shortTag: 'NEW #20',
    tabId: 'oi-short-cover',
    category: 'FNO_OI',
    isNewScanner: true,
    formulaSummary: 'Short-Covering / Long-Unwinding Trap + PCR Shift + RVOL > 2.00 + VolX > 1.00X + ADX 25+',
    agent: {
      agentId: 'AI-AGENT-20',
      agentNumber: 20,
      name: 'Meera AI',
      genderLabel: 'She',
      role: 'OI Trap & Short-Covering Exit Manager',
      specialty: 'Exploits trapped F&O writers with rapid breakeven lock & squeeze exits',
      riskPerTradePct: 1.0,
      atrSlMultiplier: 1.1,
      trailBreakevenR: 0.95,
      target1R: 1.5,
      target2R: 2.5,
    },
  },
]);

export type VolatilityRegime = 'LOW' | 'NORMAL' | 'ELEVATED' | 'EXTREME';

export type SlShiftDirection = 'WIDENED' | 'TIGHTENED' | 'UNCHANGED';

export interface MarketVolatilityContext {
  indiaVix: number;
  regime: VolatilityRegime;
  regimeLabel: string;
  vixMultiplier: number;
  updatedAt: string;
}

export interface FleetManagedTrade {
  scannerId: ScannerId20;
  scannerName: string;
  agentId: string;
  agentName: string;
  agentGender: 'He' | 'She';
  symbol: string;
  name: string;
  sector: string;
  side: 'BUY' | 'SELL';
  listedAt: string;
  formulaReason: string;
  formulaScore: number;
  liveLtp: number;
  changePercent: number;
  rvol: number;
  xTimeVolume: number;
  adx: number;
  entryPrice: number;
  initialStopLoss: number;
  baseStopLoss: number;
  activeStopLoss: number;
  volatilityAdjusted: boolean;
  volatilityMultiplier: number;
  slShiftRs: number;
  slShiftPct: number;
  slShiftDirection: SlShiftDirection;
  stockAtrPct: number;
  target1: number;
  target2: number;
  positionQty: number;
  riskCapitalRs: number;
  rrPlanned: string;
  peakFavorablePrice: number;
  liveRMultiple: number;
  livePnlPct: number;
  livePnlRs: number;
  actionStatus: AiTradeActionStatus;
  actionBadge: string;
  agentDirective: string;
  isClosed: boolean;
  stickyLockedUntilFlush: true;
}

export interface FleetGlobalResetState {
  active: boolean;
  resetAtIso: string | null;
  resetAtIST: string | null;
  resetCount: number;
}

export interface FleetScannerReport {
  rank: number;
  scannerId: ScannerId20;
  scannerName: string;
  shortTag: string;
  tabId: string;
  category: ScannerCategory20;
  formulaSummary: string;
  isNewScanner: boolean;
  agent: AssignedAiAgentSpec & {
    status: 'ACTIVE' | 'STANDBY_FLUSHED' | 'STANDBY_RESET' | 'POST_MARKET_LOCKED';
    autonomousOptimization: boolean;
    volatilityRegime: VolatilityRegime;
    volatilityMultiplier: number;
    effectiveAtrSlMultiplier: number;
    slShiftedCount: number;
  };
  summary: {
    totalManaged: number;
    upCount: number;
    downCount: number;
    activeOpenCount: number;
    trailingProtectedCount: number;
    targetHitCount: number;
    slHitCount: number;
    winCount: number;
    winRatePct: number;
    totalLivePnlRs: number;
    avgRMultiple: number;
  };
  upTrades: FleetManagedTrade[];
  downTrades: FleetManagedTrade[];
  allTrades: FleetManagedTrade[];
}

export interface Fleet20MasterReport {
  status: 'ok';
  generatedAt: string;
  totalScanners: 20;
  totalAiAgents: 20;
  heAgentCount: number;
  sheAgentCount: number;
  session: LockedSessionWindowStatus;
  marketVolatility: MarketVolatilityContext;
  globalReset: FleetGlobalResetState;
  liveFeedProvider: string;
  upstoxConnected: boolean;
  lockedRules: typeof LOCKED_SYSTEM_RULES;
  fleetSummary: {
    totalActiveScanners: number;
    totalManagedPositions: number;
    totalUpPositions: number;
    totalDownPositions: number;
    uniqueManagedSymbols: number;
    totalTrailingProtected: number;
    totalTargetHits: number;
    totalSlHits: number;
    fleetWinRatePct: number;
    fleetLivePnlRs: number;
    avgRMultiple: number;
    autonomousOptimizedAgents: number;
    volatilityShiftedStopLosses: number;
  };
  scanners: FleetScannerReport[];
}

interface PersistedFleetTrade {
  symbol: string;
  name: string;
  sector: string;
  side: 'BUY' | 'SELL';
  listedAt: string;
  formulaReason: string;
  formulaScore: number;
  entryPrice: number;
  initialStopLoss: number;
  activeStopLoss: number;
  target1: number;
  target2: number;
  positionQty: number;
  riskCapitalRs: number;
  peakFavorablePrice: number;
  peakRvol: number;
  peakXTimeVolume: number;
  peakAdx: number;
  lastLtp: number;
  lastChangePercent: number;
  lastAtr: number;
  lastRangePct: number;
  t1Booked: boolean;
  closedStatus?: 'TARGET_HIT_EXIT' | 'SL_HIT_EXIT' | 'TIME_EXIT_1515';
  closedAtPrice?: number;
}

function round2(n: number): number {
  return Number((Number.isFinite(n) ? n : 0).toFixed(2));
}

function clampNum(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/**
 * Classifies India VIX into an institutional volatility regime and baseline SL multiplier.
 * - LOW (<13): Calm compression -> tighten SL (0.85x) to protect gains & avoid drift
 * - NORMAL (13..17): Balanced intraday trend -> 1.00x baseline adaptive scaling
 * - ELEVATED (17..22): High intraday noise -> widen SL (1.22x) to resist stop-hunts
 * - EXTREME (>=22): Volatility shock -> wide protective shield (1.42x)
 */
export function classifyMarketVolatilityRegime(indiaVix: number): {
  indiaVix: number;
  regime: VolatilityRegime;
  regimeLabel: string;
  vixMultiplier: number;
} {
  const vix = round2(clampNum(Number(indiaVix) || 15.0, 7.0, 65.0));
  if (vix < 13.0) {
    return {
      indiaVix: vix,
      regime: 'LOW',
      regimeLabel: 'Low Vol · Tighten SL',
      vixMultiplier: 0.85,
    };
  }
  if (vix < 17.0) {
    return {
      indiaVix: vix,
      regime: 'NORMAL',
      regimeLabel: 'Normal Vol · Adaptive',
      vixMultiplier: 1.0,
    };
  }
  if (vix < 22.0) {
    return {
      indiaVix: vix,
      regime: 'ELEVATED',
      regimeLabel: 'Elevated Vol · Widen SL',
      vixMultiplier: 1.22,
    };
  }
  return {
    indiaVix: vix,
    regime: 'EXTREME',
    regimeLabel: 'Extreme Vol · Wide Shield',
    vixMultiplier: 1.42,
  };
}

export interface VolatilitySlAdjustmentResult {
  adjustedStopLoss: number;
  baseStopLoss: number;
  slShiftRs: number;
  slShiftPct: number;
  shiftDirection: SlShiftDirection;
  volatilityMultiplier: number;
  stockAtrPct: number;
  volatilityRegime: VolatilityRegime;
  reason: string;
}

/**
 * Pure volatility-driven stop-loss optimizer for Autonomous Optimization mode.
 * Blends market-level India VIX regime (65%) with stock-specific ATR% & intraday range (35%)
 * to automatically widen or tighten open stop-loss levels while never degrading a trailed profit lock into a loss.
 */
export function computeVolatilityAdjustedStopLoss(params: {
  side: 'BUY' | 'SELL';
  entryPrice: number;
  initialStopLoss: number;
  baseStopLoss: number;
  liveLtp: number;
  atr: number;
  stockRangePct: number;
  indiaVix: number;
  isClosed: boolean;
}): VolatilitySlAdjustmentResult {
  const {
    side,
    entryPrice,
    initialStopLoss,
    baseStopLoss,
    liveLtp,
    atr,
    stockRangePct,
    indiaVix,
    isClosed,
  } = params;

  const vixMeta = classifyMarketVolatilityRegime(indiaVix);
  const refPrice = liveLtp > 0 ? liveLtp : entryPrice;
  const effectiveAtr = atr > 0 ? atr : refPrice * 0.011;
  const stockAtrPct = refPrice > 0 ? round2((effectiveAtr / refPrice) * 100) : 1.1;
  const rangePct = clampNum(Number(stockRangePct) || stockAtrPct * 1.4, 0.3, 12.0);

  // Stock-level volatility factor anchored around 1.15% average NSE F&O ATR
  const stockFactor = clampNum(
    0.92 + (stockAtrPct - 1.15) * 0.16 + Math.max(0, rangePct - 2.0) * 0.04,
    0.82,
    1.35
  );
  const volatilityMultiplier = round2(
    clampNum(vixMeta.vixMultiplier * 0.65 + stockFactor * 0.35, 0.78, 1.5)
  );

  if (isClosed || refPrice <= 0 || entryPrice <= 0) {
    return {
      adjustedStopLoss: round2(baseStopLoss),
      baseStopLoss: round2(baseStopLoss),
      slShiftRs: 0,
      slShiftPct: 0,
      shiftDirection: 'UNCHANGED',
      volatilityMultiplier,
      stockAtrPct,
      volatilityRegime: vixMeta.regime,
      reason: 'Position closed — exit SL preserved',
    };
  }

  const isBuy = side === 'BUY';
  const baseRisk = Math.max(entryPrice * 0.0035, Math.abs(entryPrice - initialStopLoss));
  const isTrailedPastEntry = isBuy
    ? baseStopLoss >= entryPrice - 0.01
    : baseStopLoss <= entryPrice + 0.01;

  let adjustedStopLoss = baseStopLoss;

  if (!isTrailedPastEntry) {
    // Open initial stop-loss: scale stop-loss cushion directly by composite volatility multiplier
    const scaledRisk = clampNum(
      baseRisk * volatilityMultiplier,
      entryPrice * 0.004,
      entryPrice * 0.045
    );
    if (isBuy) {
      const candidate = round2(entryPrice - scaledRisk);
      // Never cross above live LTP (keep at least 0.35% below LTP so we don't artificially self-trigger)
      const maxSafeSl = round2(Math.min(entryPrice * 0.9965, refPrice * 0.9965));
      adjustedStopLoss = Math.min(candidate, maxSafeSl);
    } else {
      const candidate = round2(entryPrice + scaledRisk);
      const minSafeSl = round2(Math.max(entryPrice * 1.0035, refPrice * 1.0035));
      adjustedStopLoss = Math.max(candidate, minSafeSl);
    }
  } else {
    // Trailed-in-profit position: optimize trailing cushion while strictly guaranteeing >= breakeven lock
    const beFloor = isBuy
      ? round2(entryPrice + baseRisk * 0.05)
      : round2(entryPrice - baseRisk * 0.05);
    const liveTrailGap = Math.max(0.05, isBuy ? refPrice - baseStopLoss : baseStopLoss - refPrice);
    const adjustedTrailGap = clampNum(
      liveTrailGap * volatilityMultiplier,
      refPrice * 0.0025,
      Math.max(liveTrailGap * 1.45, baseRisk * 1.35)
    );
    if (isBuy) {
      const candidate = round2(refPrice - adjustedTrailGap);
      const maxSafeSl = round2(refPrice * 0.997);
      adjustedStopLoss = clampNum(candidate, beFloor, Math.max(beFloor, maxSafeSl));
    } else {
      const candidate = round2(refPrice + adjustedTrailGap);
      const minSafeSl = round2(refPrice * 1.003);
      adjustedStopLoss = clampNum(candidate, Math.min(beFloor, minSafeSl), beFloor);
    }
  }

  adjustedStopLoss = round2(adjustedStopLoss);
  const rawDiff = round2(adjustedStopLoss - baseStopLoss);
  // Determine whether SL moved further away from LTP (WIDENED) or closer to LTP (TIGHTENED)
  const baseCushion = isBuy ? refPrice - baseStopLoss : baseStopLoss - refPrice;
  const newCushion = isBuy ? refPrice - adjustedStopLoss : adjustedStopLoss - refPrice;
  const cushionDelta = round2(newCushion - baseCushion);

  let shiftDirection: SlShiftDirection = 'UNCHANGED';
  if (cushionDelta > 0.02) {
    shiftDirection = 'WIDENED';
  } else if (cushionDelta < -0.02) {
    shiftDirection = 'TIGHTENED';
  }

  const slShiftPct = baseStopLoss > 0 ? round2((rawDiff / baseStopLoss) * 100) : 0;
  const actionVerb =
    shiftDirection === 'WIDENED'
      ? `widened +₹${Math.abs(cushionDelta).toFixed(2)}`
      : shiftDirection === 'TIGHTENED'
      ? `tightened -₹${Math.abs(cushionDelta).toFixed(2)}`
      : 'calibrated';

  return {
    adjustedStopLoss,
    baseStopLoss: round2(baseStopLoss),
    slShiftRs: rawDiff,
    slShiftPct,
    shiftDirection,
    volatilityMultiplier,
    stockAtrPct,
    volatilityRegime: vixMeta.regime,
    reason: `Auto-Opt (${vixMeta.regime} VIX ${vixMeta.indiaVix.toFixed(1)} · ATR ${stockAtrPct.toFixed(2)}% · ${volatilityMultiplier.toFixed(2)}×) ${actionVerb}`,
  };
}

export interface ScannerFormulaEvaluation {
  side: 'BUY' | 'SELL';
  score: number;
  reason: string;
}

/**
 * Pure formula evaluator for each of the 20 Scanners.
 * STRICTLY enforces Rule 3 (RVOL > 2.00, Vol Bazaar X-Time > 1.00X, ADX >= 25.0)
 * AND each scanner's genuine directional criteria — ZERO fake signals!
 */
export function evaluateStockForScanner20(
  scannerId: ScannerId20,
  stock: ScannedStock,
  rvol: number,
  xTimeVolume: number,
  adx: number
): ScannerFormulaEvaluation | null {
  const rule3 = passesRule3Thresholds(rvol, xTimeVolume, adx, true);
  if (!rule3.passedAll) return null;

  const price = Number(stock.price) || 0;
  if (price <= 0) return null;

  const ind = stock.indicators;
  const chg = Number(stock.changePercent) || 0;
  const vwap = Number(ind?.vwap) || price;
  const open = Number(ind?.open) || price;
  const high = Number(ind?.high) || price;
  const low = Number(ind?.low) || price;
  const ema13 = Number(ind?.ema13) || price;
  const ema21 = Number(ind?.ema21) || price;
  const ema34 = Number(ind?.ema34) || price;
  const rsi = Number(ind?.rsi) || 50;
  const macdHist = Number(ind?.macdHist) || 0;
  const pdh = Number(ind?.pdh) || 0;
  const pdl = Number(ind?.pdl) || 0;
  const cprTC = Number(ind?.cprTC) || 0;
  const cprBC = Number(ind?.cprBC) || 0;
  const bbUpper = Number(ind?.bbUpper) || 0;
  const bbLower = Number(ind?.bbLower) || 0;
  const stDir = ind?.supertrendDirection || (chg >= 0 ? 'BUY' : 'SELL');
  const oiState = stock.oiData?.buildup || ind?.oiState || 'NEUTRAL';
  const oiChgPct = Number(stock.oiData?.changeInOIPercent ?? ind?.oiChangePct ?? 0);
  const pcr = Number(stock.oiData?.pcr ?? ind?.pcr ?? 1.0);
  const bidAsk = Number(stock.bidAskRatio) || 1.0;
  const aiScore = Number(stock.aiScore) || 65;
  const turnoverCr = (Number(stock.volume) * price) / 1e7;
  const vwapDistPct = vwap > 0 ? ((price - vwap) / vwap) * 100 : 0;
  const dayRangePct = high > low ? ((price - low) / (high - low)) * 100 : 50;

  // Determine natural directional bias (must clearly move UP or DOWN; flat/neutral rejected)
  const isUpBias = chg > 0.15 && (price >= vwap * 0.999 || stDir === 'BUY');
  const isDownBias = chg < -0.15 && (price <= vwap * 1.001 || stDir === 'SELL');
  if (!isUpBias && !isDownBias) return null;

  const side: 'BUY' | 'SELL' = isUpBias ? 'BUY' : 'SELL';
  const absChg = Math.abs(chg);
  const baseStrength = Math.min(
    99,
    Math.round(
      45 +
        Math.min(18, rvol * 4) +
        Math.min(14, xTimeVolume * 4) +
        Math.min(12, (adx - 20) * 0.5) +
        Math.min(10, absChg * 3)
    )
  );

  switch (scannerId) {
    case 'top-momentum': {
      const ok =
        side === 'BUY'
          ? price > vwap && ema13 >= ema21 * 0.998 && chg >= 0.45
          : price < vwap && ema13 <= ema21 * 1.002 && chg <= -0.45;
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, baseStrength + (absChg >= 1.5 ? 6 : 2)),
        reason: `${side === 'BUY' ? 'VWAP+EMA13/21 Thrust' : 'VWAP+EMA13/21 Breakdown'} • ${chg >= 0 ? '+' : ''}${chg.toFixed(2)}%`,
      };
    }

    case 'money-flow': {
      const ok =
        side === 'BUY'
          ? stDir === 'BUY' && price >= vwap && (bidAsk >= 1.02 || chg >= 0.5)
          : stDir === 'SELL' && price <= vwap && (bidAsk <= 0.98 || chg <= -0.5);
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, baseStrength + (stDir === side ? 5 : 0)),
        reason: `Supertrend ${stDir} + Smart Money Flow • Bid/Ask ${bidAsk.toFixed(2)}`,
      };
    }

    case 'most-active-fno': {
      const ok =
        turnoverCr >= 25 &&
        (side === 'BUY'
          ? price > vwap && (pdh <= 0 || price >= pdh * 0.992 || chg >= 0.6)
          : price < vwap && (pdl <= 0 || price <= pdl * 1.008 || chg <= -0.6));
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, baseStrength + Math.min(8, Math.round(turnoverCr / 40))),
        reason: `Active F&O ₹${turnoverCr.toFixed(0)}Cr • ${oiState.replace('_', ' ')}`,
      };
    }

    case 'claude-fno': {
      const ok =
        aiScore >= 65 &&
        (side === 'BUY'
          ? price > vwap && rsi >= 52 && (oiState === 'LONG_BUILDUP' || oiState === 'SHORT_COVERING' || chg >= 0.6)
          : price < vwap && rsi <= 48 && (oiState === 'SHORT_BUILDUP' || oiState === 'LONG_UNWINDING' || chg <= -0.6));
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, Math.round(baseStrength * 0.6 + aiScore * 0.4)),
        reason: `10-Pt F&O Scorecard (${aiScore}) • RSI ${rsi.toFixed(0)} • ${oiState.replace('_', ' ')}`,
      };
    }

    case 'smart-money-concepts': {
      const ok =
        side === 'BUY'
          ? price > open && dayRangePct >= 62 && price >= ema21 * 0.998
          : price < open && dayRangePct <= 38 && price <= ema21 * 1.002;
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, baseStrength + (side === 'BUY' ? Math.round((dayRangePct - 50) * 0.15) : Math.round((50 - dayRangePct) * 0.15))),
        reason: `ICT ${side === 'BUY' ? 'Bullish BOS/OB' : 'Bearish BOS/OB'} • Range Pos ${dayRangePct.toFixed(0)}%`,
      };
    }

    case 'price-action': {
      const ok =
        side === 'BUY'
          ? price > open && price > vwap && (pdh <= 0 || price >= pdh * 0.995 || dayRangePct >= 68)
          : price < open && price < vwap && (pdl <= 0 || price <= pdl * 1.005 || dayRangePct <= 32);
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, baseStrength + 3),
        reason: `9/9 Price Action ${side === 'BUY' ? 'Demand Breakout' : 'Supply Breakdown'}`,
      };
    }

    case 'apex-alpha': {
      const ok =
        side === 'BUY'
          ? price >= vwap && vwapDistPct >= 0.1 && vwapDistPct <= 3.5 && ema13 >= ema21 * 0.997
          : price <= vwap && vwapDistPct <= -0.1 && vwapDistPct >= -3.5 && ema13 <= ema21 * 1.003;
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, baseStrength + 4),
        reason: `Apex VWAP Coil Reclaim • VWAP Δ ${vwapDistPct >= 0 ? '+' : ''}${vwapDistPct.toFixed(2)}%`,
      };
    }

    case 'intraday-stock': {
      const ok =
        side === 'BUY'
          ? price > open * 1.003 && price > vwap && chg >= 0.4
          : price < open * 0.997 && price < vwap && chg <= -0.4;
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, baseStrength + 2),
        reason: `DFC 5m ${side === 'BUY' ? 'High Breakout' : 'Low Breakdown'} • Open ₹${open.toFixed(1)}`,
      };
    }

    case 'strong': {
      const ok =
        side === 'BUY'
          ? price > vwap && (cprTC <= 0 || price >= cprTC * 0.996) && chg >= 0.5
          : price < vwap && (cprBC <= 0 || price <= cprBC * 1.004) && chg <= -0.5;
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, baseStrength + 3),
        reason: `ORB 15m ${side === 'BUY' ? 'Above CPR TC' : 'Below CPR BC'} • ADX ${adx.toFixed(1)}`,
      };
    }

    case 'sonic': {
      const ok =
        rvol >= 2.25 &&
        (side === 'BUY' ? chg >= 0.35 && oiChgPct >= -5 : chg <= -0.35);
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, baseStrength + Math.min(8, Math.round(rvol * 1.5))),
        reason: `Pulse Surge • RVOL ${rvol.toFixed(2)}x • OI Δ ${oiChgPct >= 0 ? '+' : ''}${oiChgPct.toFixed(1)}%`,
      };
    }

    case 'titan': {
      const ok =
        turnoverCr >= 20 &&
        (side === 'BUY' ? bidAsk >= 1.0 || chg >= 0.6 : bidAsk <= 1.0 || chg <= -0.6);
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, baseStrength + (turnoverCr >= 100 ? 6 : 2)),
        reason: `Whale Flow ₹${turnoverCr.toFixed(0)}Cr • VolX ${xTimeVolume.toFixed(2)}X`,
      };
    }

    case 'elite': {
      const bbBreak =
        side === 'BUY'
          ? (bbUpper > 0 && price >= bbUpper * 0.992) || rsi >= 56
          : (bbLower > 0 && price <= bbLower * 1.008) || rsi <= 44;
      if (!bbBreak) return null;
      return {
        side,
        score: Math.min(99, baseStrength + 3),
        reason: `3m Squeeze Release • RSI ${rsi.toFixed(1)} • ADX ${adx.toFixed(1)}`,
      };
    }

    case 'elite-pro': {
      const ok =
        side === 'BUY'
          ? ema13 >= ema21 * 0.998 && ema21 >= ema34 * 0.996 && macdHist >= -0.2
          : ema13 <= ema21 * 1.002 && ema21 <= ema34 * 1.004 && macdHist <= 0.2;
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, baseStrength + 4),
        reason: `6m EMA(13/21/34) Wave • MACD ${macdHist >= 0 ? '+' : ''}${macdHist.toFixed(2)}`,
      };
    }

    case 'titan-cash': {
      const ok =
        turnoverCr >= 15 &&
        (side === 'BUY' ? chg >= 0.4 && dayRangePct >= 58 : chg <= -0.4 && dayRangePct <= 42);
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, baseStrength + 2),
        reason: `Cash Delivery Flow ₹${turnoverCr.toFixed(0)}Cr • Range ${dayRangePct.toFixed(0)}%`,
      };
    }

    case 'cloud-ai': {
      const ok = aiScore >= 62 && absChg >= 0.35;
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, Math.round(aiScore * 0.55 + baseStrength * 0.45)),
        reason: `Claude AI Auto Setup • Score ${aiScore}/100 • ADX ${adx.toFixed(1)}`,
      };
    }

    case 'world-strategy': {
      const ok =
        aiScore >= 65 &&
        (side === 'BUY'
          ? price > vwap && stDir === 'BUY' && chg >= 0.5
          : price < vwap && stDir === 'SELL' && chg <= -0.5);
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, baseStrength + 5),
        reason: `Omni-Quantum 6-Layer ${side} • VWAP+ST+Flow Aligned`,
      };
    }

    case 'claude-10skills': {
      const ok =
        adx >= 26 &&
        (side === 'BUY' ? price >= vwap && rsi >= 50 : price <= vwap && rsi <= 50);
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, baseStrength + 4),
        reason: `10-Skill Sentinel Confirmed • ADX ${adx.toFixed(1)} • RSI ${rsi.toFixed(0)}`,
      };
    }

    case 'liquidity': {
      const ok = turnoverCr >= 30 && absChg >= 0.3;
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, Math.round(baseStrength * 0.7 + Math.min(30, turnoverCr / 15))),
        reason: `Top Traded Liquidity ₹${turnoverCr.toFixed(0)}Cr • RVOL ${rvol.toFixed(2)}x`,
      };
    }

    case 'vwap-surge': {
      // NEW SCANNER #19: VWAP Deviation & Gamma Surge
      const ok =
        side === 'BUY'
          ? vwapDistPct >= 0.35 && rsi >= 55 && chg >= 0.65
          : vwapDistPct <= -0.35 && rsi <= 45 && chg <= -0.65;
      if (!ok) return null;
      return {
        side,
        score: Math.min(99, baseStrength + Math.min(10, Math.round(Math.abs(vwapDistPct) * 3))),
        reason: `VWAP Gamma Surge (${vwapDistPct >= 0 ? '+' : ''}${vwapDistPct.toFixed(2)}% vs VWAP) • RSI ${rsi.toFixed(0)}`,
      };
    }

    case 'oi-short-cover': {
      // NEW SCANNER #20: OI Breakout & Short-Covering Trap
      const trapBuy =
        side === 'BUY' &&
        (oiState === 'SHORT_COVERING' ||
          oiState === 'LONG_BUILDUP' ||
          pcr >= 0.95 ||
          oiChgPct >= 2.0) &&
        chg >= 0.4;
      const trapSell =
        side === 'SELL' &&
        (oiState === 'LONG_UNWINDING' ||
          oiState === 'SHORT_BUILDUP' ||
          pcr <= 1.05 ||
          oiChgPct <= -1.0 ||
          oiChgPct >= 2.0) &&
        chg <= -0.4;
      if (!trapBuy && !trapSell) return null;
      return {
        side,
        score: Math.min(99, baseStrength + (oiState === 'SHORT_COVERING' || oiState === 'LONG_UNWINDING' ? 7 : 3)),
        reason: `OI Trap (${oiState.replace('_', ' ')}) • PCR ${pcr.toFixed(2)} • OI Δ ${oiChgPct >= 0 ? '+' : ''}${oiChgPct.toFixed(1)}%`,
      };
    }
  }
}

/**
 * Pure entry, stop-loss, and target calculation customized for each of the 20 assigned AI Agents.
 */
export function computeAgentEntryPlan(
  stock: ScannedStock,
  side: 'BUY' | 'SELL',
  agent: AssignedAiAgentSpec,
  deskCapitalRs: number = 500_000
): {
  entryPrice: number;
  initialStopLoss: number;
  target1: number;
  target2: number;
  positionQty: number;
  riskCapitalRs: number;
} {
  const liveLtp = Number(stock.price) || 0;
  const entryPrice = round2(
    Number(stock.fixedEntryPrice) > 0
      ? Number(stock.fixedEntryPrice)
      : Number(stock.risk?.entryPrice) > 0
      ? Number(stock.risk!.entryPrice)
      : liveLtp
  );

  const atr = Math.max(
    entryPrice * 0.0055,
    Number(stock.indicators?.atr) || entryPrice * 0.008
  );

  let initialStopLoss =
    Number(stock.fixedStopLoss) > 0
      ? Number(stock.fixedStopLoss)
      : Number(stock.risk?.stopLoss) > 0
      ? Number(stock.risk!.stopLoss)
      : 0;

  if (side === 'BUY') {
    if (!(initialStopLoss > 0 && initialStopLoss < entryPrice * 0.997)) {
      initialStopLoss = round2(entryPrice - atr * agent.atrSlMultiplier);
    }
  } else {
    if (!(initialStopLoss > entryPrice * 1.003)) {
      initialStopLoss = round2(entryPrice + atr * agent.atrSlMultiplier);
    }
  }

  const riskPerShare = Math.max(entryPrice * 0.0035, Math.abs(entryPrice - initialStopLoss));
  const target1 =
    side === 'BUY'
      ? round2(entryPrice + riskPerShare * agent.target1R)
      : round2(entryPrice - riskPerShare * agent.target1R);
  const target2 =
    side === 'BUY'
      ? round2(entryPrice + riskPerShare * agent.target2R)
      : round2(entryPrice - riskPerShare * agent.target2R);

  const riskCapitalRs = round2((deskCapitalRs * agent.riskPerTradePct) / 100);
  const rawQty = Math.floor(riskCapitalRs / Math.max(0.1, riskPerShare));
  const maxCapitalQty =
    entryPrice > 0 ? Math.max(1, Math.floor((deskCapitalRs * 0.2) / entryPrice)) : 1;
  const positionQty = Math.max(1, Math.min(rawQty, maxCapitalQty));

  return {
    entryPrice,
    initialStopLoss: round2(initialStopLoss),
    target1,
    target2,
    positionQty,
    riskCapitalRs,
  };
}

/**
 * Pure Stop-Loss, Breakeven Trail, T1 Partial Booking, T2 Exit & 15:15 Square-Off evaluator
 * personalized with the assigned AI Agent's name and trailing stop rules.
 */
export function evaluateAgentTradeLifecycle(
  rec: PersistedFleetTrade,
  agent: AssignedAiAgentSpec,
  liveLtp: number,
  isSquareOffReached: boolean
): {
  activeStopLoss: number;
  peakFavorablePrice: number;
  liveRMultiple: number;
  livePnlPct: number;
  livePnlRs: number;
  actionStatus: AiTradeActionStatus;
  actionBadge: string;
  agentDirective: string;
  isClosed: boolean;
  t1Booked: boolean;
} {
  const effectivePrice = liveLtp > 0 ? liveLtp : rec.lastLtp || rec.entryPrice;
  const riskPerShare = Math.max(0.05, Math.abs(rec.entryPrice - rec.initialStopLoss));

  let peakFav = rec.peakFavorablePrice || rec.entryPrice;
  if (rec.side === 'BUY') {
    peakFav = Math.max(peakFav, effectivePrice);
  } else {
    peakFav = Math.min(peakFav, effectivePrice);
  }

  const priceMove =
    rec.side === 'BUY' ? effectivePrice - rec.entryPrice : rec.entryPrice - effectivePrice;
  const peakMove =
    rec.side === 'BUY' ? peakFav - rec.entryPrice : rec.entryPrice - peakFav;

  const liveRMultiple = round2(priceMove / riskPerShare);
  const peakR = peakMove / riskPerShare;
  const livePnlPct = rec.entryPrice > 0 ? round2((priceMove / rec.entryPrice) * 100) : 0;
  const livePnlRs = round2(priceMove * rec.positionQty);

  let activeStopLoss = rec.activeStopLoss || rec.initialStopLoss;
  let t1Booked = rec.t1Booked;

  if (peakR >= agent.target1R) {
    t1Booked = true;
    const trailLvl =
      rec.side === 'BUY'
        ? round2(rec.entryPrice + riskPerShare * 0.75)
        : round2(rec.entryPrice - riskPerShare * 0.75);
    activeStopLoss =
      rec.side === 'BUY'
        ? Math.max(activeStopLoss, trailLvl)
        : Math.min(activeStopLoss, trailLvl);
  } else if (peakR >= agent.trailBreakevenR) {
    const beLvl =
      rec.side === 'BUY'
        ? round2(rec.entryPrice + riskPerShare * 0.05)
        : round2(rec.entryPrice - riskPerShare * 0.05);
    activeStopLoss =
      rec.side === 'BUY'
        ? Math.max(activeStopLoss, beLvl)
        : Math.min(activeStopLoss, beLvl);
  }

  if (rec.closedStatus === 'TARGET_HIT_EXIT') {
    const exitP = rec.closedAtPrice || rec.target2;
    const closedMove = rec.side === 'BUY' ? exitP - rec.entryPrice : rec.entryPrice - exitP;
    return {
      activeStopLoss,
      peakFavorablePrice: peakFav,
      liveRMultiple: round2(closedMove / riskPerShare),
      livePnlPct: rec.entryPrice > 0 ? round2((closedMove / rec.entryPrice) * 100) : 0,
      livePnlRs: round2(closedMove * rec.positionQty),
      actionStatus: 'TARGET_HIT_EXIT',
      actionBadge: '🏆 T2 HIT • FULL EXIT',
      agentDirective: `${agent.name} (${agent.genderLabel}) booked 100% T2 exit @ ₹${exitP.toFixed(2)}. Locked till 23:59 IST.`,
      isClosed: true,
      t1Booked: true,
    };
  }

  if (rec.closedStatus === 'SL_HIT_EXIT') {
    const exitP = rec.closedAtPrice || activeStopLoss;
    const closedMove = rec.side === 'BUY' ? exitP - rec.entryPrice : rec.entryPrice - exitP;
    const profitTrail = closedMove >= 0;
    return {
      activeStopLoss,
      peakFavorablePrice: peakFav,
      liveRMultiple: round2(closedMove / riskPerShare),
      livePnlPct: rec.entryPrice > 0 ? round2((closedMove / rec.entryPrice) * 100) : 0,
      livePnlRs: round2(closedMove * rec.positionQty),
      actionStatus: 'SL_HIT_EXIT',
      actionBadge: profitTrail ? '🛡️ TRAIL SL • PROFIT LOCKED' : '🛑 SL HIT • RISK CAPPED',
      agentDirective: profitTrail
        ? `${agent.name} (${agent.genderLabel}) locked profit on Trailing SL @ ₹${exitP.toFixed(2)}.`
        : `${agent.name} (${agent.genderLabel}) executed protective Stop-Loss @ ₹${exitP.toFixed(2)} (1% cap).`,
      isClosed: true,
      t1Booked,
    };
  }

  const hitT2 =
    rec.side === 'BUY' ? effectivePrice >= rec.target2 : effectivePrice <= rec.target2;
  if (hitT2) {
    return {
      activeStopLoss,
      peakFavorablePrice: peakFav,
      liveRMultiple,
      livePnlPct,
      livePnlRs,
      actionStatus: 'TARGET_HIT_EXIT',
      actionBadge: '🏆 T2 HIT • FULL EXIT',
      agentDirective: `${agent.name} (${agent.genderLabel}) booked 100% T2 target @ ₹${effectivePrice.toFixed(2)} (+${liveRMultiple.toFixed(2)}R).`,
      isClosed: true,
      t1Booked: true,
    };
  }

  const hitSl =
    rec.side === 'BUY' ? effectivePrice <= activeStopLoss : effectivePrice >= activeStopLoss;
  if (hitSl) {
    const profitTrail = priceMove >= 0;
    return {
      activeStopLoss,
      peakFavorablePrice: peakFav,
      liveRMultiple,
      livePnlPct,
      livePnlRs,
      actionStatus: 'SL_HIT_EXIT',
      actionBadge: profitTrail ? '🛡️ TRAIL SL • PROFIT LOCKED' : '🛑 SL HIT • RISK CAPPED',
      agentDirective: profitTrail
        ? `${agent.name} (${agent.genderLabel}) triggered Trailing SL profit exit @ ₹${activeStopLoss.toFixed(2)}.`
        : `${agent.name} (${agent.genderLabel}) triggered hard SL guard @ ₹${activeStopLoss.toFixed(2)}.`,
      isClosed: true,
      t1Booked,
    };
  }

  if (isSquareOffReached) {
    return {
      activeStopLoss,
      peakFavorablePrice: peakFav,
      liveRMultiple,
      livePnlPct,
      livePnlRs,
      actionStatus: 'TIME_EXIT_1515',
      actionBadge: '⏰ 03:15 PM EXIT',
      agentDirective: `${agent.name} (${agent.genderLabel}) squared off @ ₹${effectivePrice.toFixed(2)} (15:15 cutoff). Visible till 23:59 IST.`,
      isClosed: true,
      t1Booked,
    };
  }

  if (t1Booked || liveRMultiple >= agent.target1R) {
    return {
      activeStopLoss,
      peakFavorablePrice: peakFav,
      liveRMultiple,
      livePnlPct,
      livePnlRs,
      actionStatus: 'BOOK_PARTIAL_T1',
      actionBadge: '🎯 T1 BOOKED • TRAIL +0.75R',
      agentDirective: `${agent.name} (${agent.genderLabel}) booked 50% at T1 ₹${rec.target1.toFixed(2)} & trailed SL to ₹${activeStopLoss.toFixed(2)}.`,
      isClosed: false,
      t1Booked: true,
    };
  }

  if (peakR >= agent.trailBreakevenR) {
    return {
      activeStopLoss,
      peakFavorablePrice: peakFav,
      liveRMultiple,
      livePnlPct,
      livePnlRs,
      actionStatus: 'TRAIL_SL_BREAKEVEN',
      actionBadge: '🛡️ BREAKEVEN SL LOCKED',
      agentDirective: `${agent.name} (${agent.genderLabel}) shifted SL to risk-free breakeven ₹${activeStopLoss.toFixed(2)}.`,
      isClosed: false,
      t1Booked: false,
    };
  }

  return {
    activeStopLoss,
    peakFavorablePrice: peakFav,
    liveRMultiple,
    livePnlPct,
    livePnlRs,
    actionStatus: 'HOLD_ACTIVE',
    actionBadge: '⚡ ACTIVE • SL GUARDED',
    agentDirective: `${agent.name} (${agent.genderLabel}) guarding SL ₹${activeStopLoss.toFixed(2)} • BE trail arms @ +${agent.trailBreakevenR}R.`,
    isClosed: false,
    t1Booked: false,
  };
}

interface ScannerBookState {
  upBook: Map<string, PersistedFleetTrade>;
  downBook: Map<string, PersistedFleetTrade>;
}

/**
 * 20-Scanner × 20-AI-Agent Autonomous Trade Management Fleet.
 * Every one of the 20 Scanners has its own dedicated AI Agent managing its
 * Stock List, Entry, Initial SL, Trailing SL, T1/T2 Targets & Exits strictly
 * under the 5 Locked System Rules.
 */
export class ScannerFleet20Manager {
  private sessionDateIST: string = '';
  private books: Map<ScannerId20, ScannerBookState> = new Map();
  private autonomousOptimizationMap: Map<ScannerId20, boolean> = new Map();
  private globalResetState: FleetGlobalResetState = {
    active: false,
    resetAtIso: null,
    resetAtIST: null,
    resetCount: 0,
  };
  private readonly deskCapitalRs = 500_000;

  constructor() {
    for (const def of SCANNER_FLEET_20_DEFINITIONS) {
      this.books.set(def.scannerId, {
        upBook: new Map(),
        downBook: new Map(),
      });
      this.autonomousOptimizationMap.set(def.scannerId, false);
    }
  }

  public isAutonomousOptimizationEnabled(scannerId: ScannerId20): boolean {
    return Boolean(this.autonomousOptimizationMap.get(scannerId));
  }

  public setAutonomousOptimization(scannerId: ScannerId20, enabled: boolean): boolean {
    if (!this.books.has(scannerId)) return false;
    this.autonomousOptimizationMap.set(scannerId, Boolean(enabled));
    return true;
  }

  public setAllAutonomousOptimization(enabled: boolean): void {
    const val = Boolean(enabled);
    for (const def of SCANNER_FLEET_20_DEFINITIONS) {
      this.autonomousOptimizationMap.set(def.scannerId, val);
    }
  }

  public getGlobalResetState(): FleetGlobalResetState {
    return { ...this.globalResetState };
  }

  public performGlobalReset(now: Date = new Date()): FleetGlobalResetState {
    this.resetAll();
    this.setAllAutonomousOptimization(false);
    const sessionSnap = getLockedSessionWindowStatus(now, false);
    this.globalResetState = {
      active: true,
      resetAtIso: now.toISOString(),
      resetAtIST: sessionSnap.timeIST,
      resetCount: this.globalResetState.resetCount + 1,
    };
    return { ...this.globalResetState };
  }

  public resumeFromGlobalReset(): FleetGlobalResetState {
    this.globalResetState = {
      ...this.globalResetState,
      active: false,
    };
    return { ...this.globalResetState };
  }

  public resetAll(): void {
    for (const state of this.books.values()) {
      state.upBook.clear();
      state.downBook.clear();
    }
  }

  private ensureSession(session: LockedSessionWindowStatus): void {
    if (session.isFlushCleared) {
      this.resetAll();
      this.globalResetState = {
        ...this.globalResetState,
        active: false,
      };
      this.sessionDateIST = session.dateIST;
      return;
    }
    if (this.sessionDateIST && this.sessionDateIST !== session.dateIST) {
      this.resetAll();
      this.globalResetState = {
        ...this.globalResetState,
        active: false,
      };
    }
    this.sessionDateIST = session.dateIST;
  }

  public syncAll20Scanners(params: {
    allStocks: ScannedStock[];
    getExtendedBarsFn?: (sym: string) => IntradayCandleBar[] | undefined;
    candlesMap?: CandlesLookup;
    now?: Date;
    isMarketOffDay?: boolean;
    liveFeedProvider?: string;
    upstoxConnected?: boolean;
    forceCleared?: boolean;
    indiaVix?: number;
  }): Fleet20MasterReport {
    const baseSession = getLockedSessionWindowStatus(
      params.now || new Date(),
      Boolean(params.isMarketOffDay)
    );
    const session: LockedSessionWindowStatus = params.forceCleared
      ? {
          ...baseSession,
          phase: 'FLUSHED_EMPTY',
          isFlushCleared: true,
          isLiveScanWindow: false,
          phaseLabel: '11:59 PM AUTO-FLUSH • ALL 20 SCANNERS & 20 AI AGENTS EMPTIED',
        }
      : baseSession;

    this.ensureSession(session);

    const vixRegime = classifyMarketVolatilityRegime(
      Number.isFinite(Number(params.indiaVix)) && Number(params.indiaVix) > 0
        ? Number(params.indiaVix)
        : 16.5
    );
    const marketVolatility: MarketVolatilityContext = {
      ...vixRegime,
      updatedAt: (params.now || new Date()).toISOString(),
    };

    const isManuallyReset = this.globalResetState.active && !session.isFlushCleared;
    const isFleetEmptyMode = session.isFlushCleared || isManuallyReset;

    const agentStatus: 'ACTIVE' | 'STANDBY_FLUSHED' | 'STANDBY_RESET' | 'POST_MARKET_LOCKED' =
      session.isFlushCleared
        ? 'STANDBY_FLUSHED'
        : isManuallyReset
        ? 'STANDBY_RESET'
        : session.isLiveScanWindow
        ? 'ACTIVE'
        : 'POST_MARKET_LOCKED';

    const heAgentCount = SCANNER_FLEET_20_DEFINITIONS.filter(
      (d) => d.agent.genderLabel === 'He'
    ).length;
    const sheAgentCount = SCANNER_FLEET_20_DEFINITIONS.filter(
      (d) => d.agent.genderLabel === 'She'
    ).length;

    const liveMap = new Map<string, ScannedStock>();
    const metricsCache = new Map<string, { rvol: number; xTimeVolume: number; adx: number }>();

    const lookupBars = (sym: string): IntradayCandleBar[] | Candle[] | undefined => {
      const ext = params.getExtendedBarsFn?.(sym);
      if (ext && ext.length > 0) return ext;
      if (!params.candlesMap) return undefined;
      if (params.candlesMap instanceof Map) {
        return params.candlesMap.get(sym) || params.candlesMap.get(sym.toUpperCase());
      }
      return params.candlesMap[sym] || params.candlesMap[sym.toUpperCase()];
    };

    if (!isFleetEmptyMode) {
      for (const stock of params.allStocks || []) {
        const sym = String(stock?.symbol || '').toUpperCase().trim();
        if (!sym) continue;
        liveMap.set(sym, stock);
        const bars = lookupBars(sym);
        const m = computeUniversalStrongMetrics(
          bars,
          Number(stock.indicators?.rvol) || 0,
          Number(stock.indicators?.adx) || 0,
          Number(stock.indicators?.xTimeVolume) || 0
        );
        metricsCache.set(sym, {
          rvol: m.rvol,
          xTimeVolume: m.xTimeVolume,
          adx: m.adx,
        });
      }
    }

    const scannerReports: FleetScannerReport[] = [];
    const uniqueSymbols = new Set<string>();
    let totalManagedPositions = 0;
    let totalUpPositions = 0;
    let totalDownPositions = 0;
    let totalTrailingProtected = 0;
    let totalTargetHits = 0;
    let totalSlHits = 0;
    let totalWinPositions = 0;
    let fleetLivePnlRs = 0;
    let totalRSum = 0;
    let autonomousOptimizedAgents = 0;
    let volatilityShiftedStopLosses = 0;

    for (const def of SCANNER_FLEET_20_DEFINITIONS) {
      const bookState = this.books.get(def.scannerId)!;

      if (!isFleetEmptyMode) {
        // Gather eligible BUY & SELL candidates for this specific scanner formula
        const buyCandidates: Array<{
          stock: ScannedStock;
          evalRes: ScannerFormulaEvaluation;
          rvol: number;
          xTimeVolume: number;
          adx: number;
        }> = [];
        const sellCandidates: Array<{
          stock: ScannedStock;
          evalRes: ScannerFormulaEvaluation;
          rvol: number;
          xTimeVolume: number;
          adx: number;
        }> = [];

        for (const stock of params.allStocks || []) {
          const sym = String(stock?.symbol || '').toUpperCase().trim();
          if (!sym) continue;
          const met = metricsCache.get(sym);
          if (!met) continue;

          const evalRes = evaluateStockForScanner20(
            def.scannerId,
            stock,
            met.rvol,
            met.xTimeVolume,
            met.adx
          );
          if (!evalRes) continue;
          if (evalRes.side === 'BUY') {
            buyCandidates.push({ stock, evalRes, ...met });
          } else {
            sellCandidates.push({ stock, evalRes, ...met });
          }
        }

        // Rank by formula score + momentum performance so Best 10 fill open slots
        buyCandidates.sort(
          (a, b) =>
            b.evalRes.score - a.evalRes.score ||
            Math.abs(b.stock.changePercent) - Math.abs(a.stock.changePercent)
        );
        sellCandidates.sort(
          (a, b) =>
            b.evalRes.score - a.evalRes.score ||
            Math.abs(b.stock.changePercent) - Math.abs(a.stock.changePercent)
        );

        const admitToBook = (
          cands: typeof buyCandidates,
          book: Map<string, PersistedFleetTrade>,
          side: 'BUY' | 'SELL'
        ) => {
          for (const item of cands) {
            const sym = item.stock.symbol.toUpperCase().trim();
            const existing = book.get(sym);
            if (existing) {
              existing.peakRvol = Math.max(existing.peakRvol, item.rvol);
              existing.peakXTimeVolume = Math.max(existing.peakXTimeVolume, item.xTimeVolume);
              existing.peakAdx = Math.max(existing.peakAdx, item.adx);
              existing.formulaScore = Math.max(existing.formulaScore, item.evalRes.score);
              if (item.stock.price > 0) {
                existing.lastLtp = item.stock.price;
                existing.lastChangePercent = Number(item.stock.changePercent) || existing.lastChangePercent;
              }
              continue;
            }
            // RULE 2 & RULE 4: Strictly max 10 per direction; never evict already-listed stocks!
            if (book.size >= LOCKED_SYSTEM_RULES.MAX_STOCKS_PER_DIRECTION) {
              continue;
            }
            const plan = computeAgentEntryPlan(item.stock, side, def.agent, this.deskCapitalRs);
            if (plan.entryPrice <= 0) continue;

            // RULE 1: listedAt must ALWAYS fall strictly inside the 09:20:00 - 15:15:00 IST scan window
            let resolvedListedAt = '';
            if (item.stock.listedAt && isTimeWithinScanWindow(item.stock.listedAt)) {
              resolvedListedAt = item.stock.listedAt;
            } else {
              const symBars = lookupBars(sym);
              if (symBars && symBars.length > 0) {
                for (let bIdx = symBars.length - 1; bIdx >= 0; bIdx--) {
                  const rawT = String((symBars[bIdx] as any).timeIST || (symBars[bIdx] as any).time || '');
                  const m = rawT.match(/(\d{2}:\d{2}(?::\d{2})?)/);
                  const candidateT = m ? (m[1].length === 5 ? `${m[1]}:00` : m[1]) : '';
                  if (candidateT && isTimeWithinScanWindow(candidateT)) {
                    resolvedListedAt = candidateT;
                    break;
                  }
                }
              }
              if (!resolvedListedAt) {
                resolvedListedAt = isTimeWithinScanWindow(session.timeIST)
                  ? session.timeIST
                  : LOCKED_SYSTEM_RULES.SCAN_END_IST;
              }
            }

            const stockPriceRef = item.stock.price > 0 ? item.stock.price : plan.entryPrice;
            const stockHigh = Number(item.stock.indicators?.high) || stockPriceRef;
            const stockLow = Number(item.stock.indicators?.low) || stockPriceRef;
            const stockAtr =
              Number(item.stock.indicators?.atr) || Math.max(stockPriceRef * 0.009, (stockHigh - stockLow) * 0.5);
            const stockRangePct =
              stockPriceRef > 0 && stockHigh > stockLow
                ? round2(((stockHigh - stockLow) / stockPriceRef) * 100)
                : round2((stockAtr / Math.max(1, stockPriceRef)) * 140);

            book.set(sym, {
              symbol: sym,
              name: item.stock.name || sym,
              sector: item.stock.sector || 'NSE F&O',
              side,
              listedAt: resolvedListedAt,
              formulaReason: item.evalRes.reason,
              formulaScore: item.evalRes.score,
              entryPrice: plan.entryPrice,
              initialStopLoss: plan.initialStopLoss,
              activeStopLoss: plan.initialStopLoss,
              target1: plan.target1,
              target2: plan.target2,
              positionQty: plan.positionQty,
              riskCapitalRs: plan.riskCapitalRs,
              peakFavorablePrice: stockPriceRef,
              peakRvol: item.rvol,
              peakXTimeVolume: item.xTimeVolume,
              peakAdx: item.adx,
              lastLtp: stockPriceRef,
              lastChangePercent: Number(item.stock.changePercent) || 0,
              lastAtr: round2(stockAtr),
              lastRangePct: stockRangePct,
              t1Booked: false,
            });
          }
        };

        admitToBook(buyCandidates, bookState.upBook, 'BUY');
        admitToBook(sellCandidates, bookState.downBook, 'SELL');
      }

      const autoOptEnabled = this.isAutonomousOptimizationEnabled(def.scannerId);
      if (autoOptEnabled) {
        autonomousOptimizedAgents += 1;
      }

      const materialize = (book: Map<string, PersistedFleetTrade>): FleetManagedTrade[] => {
        if (isFleetEmptyMode) return [];
        const rows: FleetManagedTrade[] = [];
        for (const rec of book.values()) {
          const live = liveMap.get(rec.symbol);
          const met = metricsCache.get(rec.symbol);
          const ltp = live && live.price > 0 ? live.price : rec.lastLtp || rec.entryPrice;
          const chgPct = live ? Number(live.changePercent) || 0 : rec.lastChangePercent;
          const rvol = Math.max(rec.peakRvol, met?.rvol || 0);
          const xTimeVolume = Math.max(rec.peakXTimeVolume, met?.xTimeVolume || 0);
          const adx = Math.max(rec.peakAdx, met?.adx || 0);

          const liveHigh = Number(live?.indicators?.high) || ltp;
          const liveLow = Number(live?.indicators?.low) || ltp;
          const liveAtr =
            Number(live?.indicators?.atr) ||
            rec.lastAtr ||
            Math.max(ltp * 0.009, (liveHigh - liveLow) * 0.5);
          const liveRangePct =
            ltp > 0 && liveHigh > liveLow
              ? round2(((liveHigh - liveLow) / ltp) * 100)
              : rec.lastRangePct || round2((liveAtr / Math.max(1, ltp)) * 140);

          rec.lastAtr = round2(liveAtr);
          rec.lastRangePct = liveRangePct;

          const lifecycle = evaluateAgentTradeLifecycle(
            rec,
            def.agent,
            ltp,
            session.isSquareOffReached
          );
          // Persist the base unshifted SL so toggling Autonomous Optimization ON/OFF is 100% reversible
          rec.activeStopLoss = lifecycle.activeStopLoss;
          rec.peakFavorablePrice = lifecycle.peakFavorablePrice;
          rec.lastLtp = ltp;
          rec.lastChangePercent = chgPct;
          rec.t1Booked = lifecycle.t1Booked;
          if (
            !rec.closedStatus &&
            (lifecycle.actionStatus === 'TARGET_HIT_EXIT' ||
              lifecycle.actionStatus === 'SL_HIT_EXIT' ||
              lifecycle.actionStatus === 'TIME_EXIT_1515')
          ) {
            rec.closedStatus = lifecycle.actionStatus;
            rec.closedAtPrice = ltp;
          }

          const baseStopLoss = lifecycle.activeStopLoss;
          let finalActiveStopLoss = baseStopLoss;
          let volatilityAdjusted = false;
          let volatilityMultiplier = 1.0;
          let slShiftRs = 0;
          let slShiftPct = 0;
          let slShiftDirection: SlShiftDirection = 'UNCHANGED';
          let stockAtrPct = ltp > 0 ? round2((liveAtr / ltp) * 100) : 1.1;
          let finalDirective = lifecycle.agentDirective;

          if (autoOptEnabled) {
            const volAdj = computeVolatilityAdjustedStopLoss({
              side: rec.side,
              entryPrice: rec.entryPrice,
              initialStopLoss: rec.initialStopLoss,
              baseStopLoss,
              liveLtp: ltp,
              atr: liveAtr,
              stockRangePct: liveRangePct,
              indiaVix: marketVolatility.indiaVix,
              isClosed: lifecycle.isClosed,
            });
            finalActiveStopLoss = volAdj.adjustedStopLoss;
            volatilityMultiplier = volAdj.volatilityMultiplier;
            slShiftRs = volAdj.slShiftRs;
            slShiftPct = volAdj.slShiftPct;
            slShiftDirection = volAdj.shiftDirection;
            stockAtrPct = volAdj.stockAtrPct;
            volatilityAdjusted = !lifecycle.isClosed && volAdj.shiftDirection !== 'UNCHANGED';
            if (!lifecycle.isClosed) {
              finalDirective = `${volAdj.reason} · SL ₹${finalActiveStopLoss.toFixed(2)} (Base ₹${baseStopLoss.toFixed(2)})`;
            }
          }

          rows.push({
            scannerId: def.scannerId,
            scannerName: def.scannerName,
            agentId: def.agent.agentId,
            agentName: def.agent.name,
            agentGender: def.agent.genderLabel,
            symbol: rec.symbol,
            name: rec.name,
            sector: rec.sector,
            side: rec.side,
            listedAt: rec.listedAt,
            formulaReason: rec.formulaReason,
            formulaScore: rec.formulaScore,
            liveLtp: round2(ltp),
            changePercent: round2(chgPct),
            rvol: round2(rvol),
            xTimeVolume: round2(xTimeVolume),
            adx: round2(adx),
            entryPrice: rec.entryPrice,
            initialStopLoss: rec.initialStopLoss,
            baseStopLoss: round2(baseStopLoss),
            activeStopLoss: round2(finalActiveStopLoss),
            volatilityAdjusted,
            volatilityMultiplier,
            slShiftRs,
            slShiftPct,
            slShiftDirection,
            stockAtrPct,
            target1: rec.target1,
            target2: rec.target2,
            positionQty: rec.positionQty,
            riskCapitalRs: rec.riskCapitalRs,
            rrPlanned: `1:${def.agent.target2R}`,
            peakFavorablePrice: round2(lifecycle.peakFavorablePrice),
            liveRMultiple: lifecycle.liveRMultiple,
            livePnlPct: lifecycle.livePnlPct,
            livePnlRs: lifecycle.livePnlRs,
            actionStatus: lifecycle.actionStatus,
            actionBadge: lifecycle.actionBadge,
            agentDirective: finalDirective,
            isClosed: lifecycle.isClosed,
            stickyLockedUntilFlush: true,
          });
        }
        return sortRowsByListedAtDescZtoA(rows, (r) => r.symbol);
      };

      const upTrades = materialize(bookState.upBook);
      const downTrades = materialize(bookState.downBook);
      const allTrades = sortRowsByListedAtDescZtoA([...upTrades, ...downTrades], (r) => r.symbol);

      const slShiftedCount = allTrades.filter((t) => t.volatilityAdjusted).length;
      const openVolTrades = allTrades.filter((t) => !t.isClosed);
      const agentVolMultiplier = autoOptEnabled
        ? openVolTrades.length > 0
          ? round2(
              openVolTrades.reduce((acc, t) => acc + t.volatilityMultiplier, 0) /
                openVolTrades.length
            )
          : marketVolatility.vixMultiplier
        : 1.0;
      const effectiveAtrSlMultiplier = round2(def.agent.atrSlMultiplier * agentVolMultiplier);

      volatilityShiftedStopLosses += slShiftedCount;

      const activeOpenCount = allTrades.filter((t) => !t.isClosed).length;
      const trailingProtectedCount = allTrades.filter(
        (t) => t.actionStatus === 'TRAIL_SL_BREAKEVEN' || t.actionStatus === 'BOOK_PARTIAL_T1'
      ).length;
      const targetHitCount = allTrades.filter((t) => t.actionStatus === 'TARGET_HIT_EXIT').length;
      const slHitCount = allTrades.filter((t) => t.actionStatus === 'SL_HIT_EXIT').length;
      const winCount = allTrades.filter((t) => t.livePnlRs > 0).length;
      const winRatePct = allTrades.length > 0 ? round2((winCount / allTrades.length) * 100) : 0;
      const totalLivePnlRs = round2(allTrades.reduce((acc, t) => acc + t.livePnlRs, 0));
      const avgRMultiple =
        allTrades.length > 0
          ? round2(allTrades.reduce((acc, t) => acc + t.liveRMultiple, 0) / allTrades.length)
          : 0;

      for (const t of allTrades) {
        uniqueSymbols.add(t.symbol);
        totalRSum += t.liveRMultiple;
      }
      totalManagedPositions += allTrades.length;
      totalUpPositions += upTrades.length;
      totalDownPositions += downTrades.length;
      totalTrailingProtected += trailingProtectedCount;
      totalTargetHits += targetHitCount;
      totalSlHits += slHitCount;
      totalWinPositions += winCount;
      fleetLivePnlRs = round2(fleetLivePnlRs + totalLivePnlRs);

      scannerReports.push({
        rank: def.rank,
        scannerId: def.scannerId,
        scannerName: def.scannerName,
        shortTag: def.shortTag,
        tabId: def.tabId,
        category: def.category,
        formulaSummary: def.formulaSummary,
        isNewScanner: Boolean(def.isNewScanner),
        agent: {
          ...def.agent,
          status: agentStatus,
          autonomousOptimization: autoOptEnabled,
          volatilityRegime: marketVolatility.regime,
          volatilityMultiplier: agentVolMultiplier,
          effectiveAtrSlMultiplier,
          slShiftedCount,
        },
        summary: {
          totalManaged: allTrades.length,
          upCount: upTrades.length,
          downCount: downTrades.length,
          activeOpenCount,
          trailingProtectedCount,
          targetHitCount,
          slHitCount,
          winCount,
          winRatePct,
          totalLivePnlRs,
          avgRMultiple,
        },
        upTrades,
        downTrades,
        allTrades,
      });
    }

    return {
      status: 'ok',
      generatedAt: new Date().toISOString(),
      totalScanners: 20,
      totalAiAgents: 20,
      heAgentCount,
      sheAgentCount,
      session,
      marketVolatility,
      globalReset: { ...this.globalResetState },
      liveFeedProvider: params.liveFeedProvider || 'UPSTOX_API_V2',
      upstoxConnected: Boolean(params.upstoxConnected),
      lockedRules: LOCKED_SYSTEM_RULES,
      fleetSummary: {
        totalActiveScanners: scannerReports.filter((s) => s.summary.totalManaged > 0).length,
        totalManagedPositions,
        totalUpPositions,
        totalDownPositions,
        uniqueManagedSymbols: uniqueSymbols.size,
        totalTrailingProtected,
        totalTargetHits,
        totalSlHits,
        fleetWinRatePct:
          totalManagedPositions > 0 ? round2((totalWinPositions / totalManagedPositions) * 100) : 0,
        fleetLivePnlRs,
        avgRMultiple:
          totalManagedPositions > 0 ? round2(totalRSum / totalManagedPositions) : 0,
        autonomousOptimizedAgents,
        volatilityShiftedStopLosses,
      },
      scanners: scannerReports,
    };
  }
}

export const scannerFleet20Manager = new ScannerFleet20Manager();
