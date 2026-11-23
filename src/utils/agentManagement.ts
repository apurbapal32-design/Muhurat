export type ScannerCategory20 =
  | 'MOMENTUM'
  | 'ORDER_FLOW'
  | 'FNO_OI'
  | 'PRICE_ACTION'
  | 'MUHURAT_CORE'
  | 'QUANT_AI';

export type AgentTradeActionStatus =
  | 'ENTRY_ACTIVE'
  | 'TRAIL_SL_BREAKEVEN'
  | 'BOOK_PARTIAL_T1'
  | 'TARGET_HIT_EXIT'
  | 'SL_HIT_EXIT'
  | 'TIME_EXIT_1515';

export type VolatilityRegime = 'LOW' | 'NORMAL' | 'ELEVATED' | 'EXTREME';
export type SlShiftDirection = 'WIDENED' | 'TIGHTENED' | 'UNCHANGED';

export interface MarketVolatilityContext {
  indiaVix: number;
  regime: VolatilityRegime;
  regimeLabel: string;
  vixMultiplier: number;
  updatedAt: string;
}

export interface FleetGlobalResetState {
  active: boolean;
  resetAtIso: string | null;
  resetAtIST: string | null;
  resetCount: number;
}

export interface AssignedAiAgentPayload {
  agentId: string;
  agentNumber: number;
  name: string;
  genderLabel: 'He' | 'She';
  role: string;
  specialty: string;
  riskPerTradePct: number;
  atrSlMultiplier: number;
  trailBreakevenR: number;
  target1R: number;
  target2R: number;
  status:
    | 'SCANNING'
    | 'LOCKED_MANAGING'
    | 'FLUSH_CLEARED'
    | 'ACTIVE'
    | 'STANDBY_FLUSHED'
    | 'STANDBY_RESET'
    | 'POST_MARKET_LOCKED';
  autonomousOptimization?: boolean;
  volatilityRegime?: VolatilityRegime;
  volatilityMultiplier?: number;
  effectiveAtrSlMultiplier?: number;
  slShiftedCount?: number;
}

export interface AgentManagedTrade {
  scannerId: string;
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
  baseStopLoss?: number;
  activeStopLoss: number;
  volatilityAdjusted?: boolean;
  volatilityMultiplier?: number;
  slShiftRs?: number;
  slShiftPct?: number;
  slShiftDirection?: SlShiftDirection;
  stockAtrPct?: number;
  target1: number;
  target2: number;
  positionQty: number;
  riskCapitalRs: number;
  rrPlanned: string;
  peakFavorablePrice: number;
  liveRMultiple: number;
  livePnlPct: number;
  livePnlRs: number;
  actionStatus: AgentTradeActionStatus;
  actionBadge: string;
  agentDirective: string;
  isClosed: boolean;
  stickyLockedUntilFlush: boolean;
}

export interface AgentScannerSummary {
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
}

export interface AgentScannerReport {
  rank: number;
  scannerId: string;
  scannerName: string;
  shortTag: string;
  tabId: string;
  category: ScannerCategory20;
  formulaSummary: string;
  isNewScanner?: boolean;
  agent: AssignedAiAgentPayload;
  summary: AgentScannerSummary;
  upTrades: AgentManagedTrade[];
  downTrades: AgentManagedTrade[];
  allTrades: AgentManagedTrade[];
}

export interface Fleet20SessionStatus {
  istDateKey?: string;
  timeIST: string;
  phase: string;
  phaseLabel: string;
  isScanWindowActive: boolean;
  isSquareOffReached: boolean;
  isFlushCleared: boolean;
}

export interface Fleet20Response {
  status: string;
  generatedAt: string;
  totalScanners: number;
  totalAiAgents: number;
  heAgentCount: number;
  sheAgentCount: number;
  session: Fleet20SessionStatus;
  marketVolatility?: MarketVolatilityContext;
  globalReset?: FleetGlobalResetState;
  liveFeedProvider: string;
  upstoxConnected: boolean;
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
    autonomousOptimizedAgents?: number;
    volatilityShiftedStopLosses?: number;
  };
  scanners: AgentScannerReport[];
}

export type AgentOperationalStatusCode =
  | 'FLUSH_CLEARED'
  | 'STANDBY'
  | 'TRAILING_LOCKED'
  | 'ACTIVE_GUARDING'
  | 'TARGETS_BOOKED'
  | 'SL_DEFENSIVE';

export interface AgentOperationalStatus {
  code: AgentOperationalStatusCode;
  label: string;
  tone: 'emerald' | 'sky' | 'amber' | 'rose' | 'slate';
}

export type StopLossProximity = 'SAFE' | 'WATCH' | 'CRITICAL' | 'CLOSED';

export interface TradeStopLossMetrics {
  slDistancePct: number;
  slDistanceAbs: number;
  slTightened: boolean;
  slStageLabel: string;
  riskProximity: StopLossProximity;
  entryMarkerPct: number;
  activeSlMarkerPct: number;
  ltpMarkerPct: number;
}

export interface AgentStockPreviewItem {
  symbol: string;
  side: 'BUY' | 'SELL';
  liveLtp: number;
  activeStopLoss: number;
  baseStopLoss: number;
  initialStopLoss: number;
  volatilityAdjusted: boolean;
  slShiftDirection: SlShiftDirection;
  slShiftRs: number;
  listedAt: string;
  liveRMultiple: number;
  livePnlRs: number;
  actionStatus: AgentTradeActionStatus;
  isClosed: boolean;
  metrics: TradeStopLossMetrics;
}

export interface AgentCardViewModel {
  report: AgentScannerReport;
  operationalStatus: AgentOperationalStatus;
  categoryLabel: string;
  stockPreviews: AgentStockPreviewItem[];
  openStopLossCount: number;
  trailedStopLossCount: number;
  tightSlAlertCount: number;
  tightestOpenTrade: AgentStockPreviewItem | null;
  totalRiskCapitalRs: number;
  autonomousOptimization: boolean;
  slShiftedCount: number;
}

export type AgentSortOption = 'rank' | 'pnl_desc' | 'trades_desc' | 'tightest_sl';
export type AgentStatusFilter =
  | 'ALL'
  | 'ACTIVE_OPEN'
  | 'TRAILING_SL'
  | 'WATCH_SL'
  | 'AUTO_OPT'
  | 'STANDBY';

export interface AgentManagementFilterState {
  search: string;
  gender: 'ALL' | 'He' | 'She';
  category: 'ALL' | ScannerCategory20;
  status: AgentStatusFilter;
  sortBy: AgentSortOption;
}

export interface AgentFleetRiskSummary {
  totalAgents: number;
  activeAgents: number;
  standbyAgents: number;
  totalManagedStocks: number;
  totalOpenStopLosses: number;
  totalTrailingProtected: number;
  totalTightSlAlerts: number;
  totalTargetExits: number;
  totalSlExits: number;
  fleetWinRatePct: number;
  fleetLivePnlRs: number;
  autonomousOptimizedAgents: number;
  volatilityShiftedStopLosses: number;
}

export const SCANNER_CATEGORY_LABELS: Record<ScannerCategory20, string> = {
  MOMENTUM: 'Momentum',
  ORDER_FLOW: 'Order Flow',
  FNO_OI: 'F&O & OI',
  PRICE_ACTION: 'Price Action',
  MUHURAT_CORE: 'Muhurat Core',
  QUANT_AI: 'Quant AI',
};

function round2(n: number): number {
  return Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

export function deriveAgentOperationalStatus(
  report: AgentScannerReport,
  isFlushCleared: boolean
): AgentOperationalStatus {
  if (isFlushCleared || report.agent.status === 'FLUSH_CLEARED') {
    return {
      code: 'FLUSH_CLEARED',
      label: 'Cleared (23:59 Flush)',
      tone: 'slate',
    };
  }

  if (report.agent.status === 'STANDBY_RESET') {
    return {
      code: 'STANDBY',
      label: 'Reset · Standby',
      tone: 'slate',
    };
  }

  const { summary } = report;
  if (summary.totalManaged === 0) {
    return {
      code: 'STANDBY',
      label: 'Standby (0 Eligible)',
      tone: 'slate',
    };
  }

  if (summary.trailingProtectedCount > 0) {
    return {
      code: 'TRAILING_LOCKED',
      label: 'Trailing SL Active',
      tone: 'emerald',
    };
  }

  if (summary.activeOpenCount > 0) {
    return {
      code: 'ACTIVE_GUARDING',
      label: 'Guarding Active SL',
      tone: 'sky',
    };
  }

  if (summary.targetHitCount > 0 && summary.targetHitCount >= summary.slHitCount) {
    return {
      code: 'TARGETS_BOOKED',
      label: 'Targets Booked',
      tone: 'emerald',
    };
  }

  if (summary.slHitCount > 0) {
    return {
      code: 'SL_DEFENSIVE',
      label: 'SL Exits Logged',
      tone: 'rose',
    };
  }

  return {
    code: 'ACTIVE_GUARDING',
    label: 'Session Managed',
    tone: 'amber',
  };
}

export function computeTradeStopLossMetrics(trade: AgentManagedTrade): TradeStopLossMetrics {
  const isBuy = trade.side === 'BUY';
  const ltp = Number(trade.liveLtp) || Number(trade.entryPrice) || 0;
  const activeSl = Number(trade.activeStopLoss) || Number(trade.initialStopLoss) || 0;
  const initSl = Number(trade.initialStopLoss) || activeSl;
  const entry = Number(trade.entryPrice) || ltp;
  const target2 = Number(trade.target2) || entry;

  // Positive distance means price is safely on the favorable side of activeStopLoss
  const rawSignedDiff = isBuy ? ltp - activeSl : activeSl - ltp;
  const slDistanceAbs = round2(rawSignedDiff);
  const slDistancePct = ltp > 0 ? round2((rawSignedDiff / ltp) * 100) : 0;

  const slTightened = isBuy
    ? activeSl > initSl + 0.005
    : activeSl < initSl - 0.005;

  let slStageLabel = 'Initial SL';
  if (trade.actionStatus === 'TARGET_HIT_EXIT') {
    slStageLabel = 'T2 Exited';
  } else if (trade.actionStatus === 'SL_HIT_EXIT') {
    slStageLabel = 'SL Triggered';
  } else if (trade.actionStatus === 'TIME_EXIT_1515') {
    slStageLabel = '15:15 Exit';
  } else if (trade.actionStatus === 'BOOK_PARTIAL_T1') {
    slStageLabel = 'T1 Trail (+0.75R)';
  } else if (trade.actionStatus === 'TRAIL_SL_BREAKEVEN' || slTightened) {
    slStageLabel = 'Breakeven Trail';
  }

  let riskProximity: StopLossProximity = 'SAFE';
  if (trade.isClosed) {
    riskProximity = 'CLOSED';
  } else if (slDistancePct <= 0.45) {
    riskProximity = 'CRITICAL';
  } else if (slDistancePct <= 1.0) {
    riskProximity = 'WATCH';
  }

  // Normalized 0..100 coordinate along [initialStopLoss -> target2]
  const span = isBuy ? target2 - initSl : initSl - target2;
  const toPct = (price: number): number => {
    if (span <= 0.0001) return 50;
    const progress = isBuy ? (price - initSl) / span : (initSl - price) / span;
    return round2(clamp(progress * 100, 0, 100));
  };

  return {
    slDistancePct,
    slDistanceAbs,
    slTightened,
    slStageLabel,
    riskProximity,
    entryMarkerPct: toPct(entry),
    activeSlMarkerPct: toPct(activeSl),
    ltpMarkerPct: toPct(ltp),
  };
}

export function buildAgentCardViewModel(
  report: AgentScannerReport,
  isFlushCleared: boolean
): AgentCardViewModel {
  const operationalStatus = deriveAgentOperationalStatus(report, isFlushCleared);
  const allTrades = Array.isArray(report.allTrades) ? report.allTrades : [];

  const stockPreviews: AgentStockPreviewItem[] = allTrades.map((t) => ({
    symbol: t.symbol,
    side: t.side,
    liveLtp: t.liveLtp,
    activeStopLoss: t.activeStopLoss,
    baseStopLoss: Number(t.baseStopLoss ?? t.activeStopLoss),
    initialStopLoss: t.initialStopLoss,
    volatilityAdjusted: Boolean(t.volatilityAdjusted),
    slShiftDirection: t.slShiftDirection || 'UNCHANGED',
    slShiftRs: Number(t.slShiftRs || 0),
    listedAt: t.listedAt,
    liveRMultiple: t.liveRMultiple,
    livePnlRs: t.livePnlRs,
    actionStatus: t.actionStatus,
    isClosed: t.isClosed,
    metrics: computeTradeStopLossMetrics(t),
  }));

  const openItems = stockPreviews.filter((item) => !item.isClosed);
  const trailedStopLossCount = stockPreviews.filter(
    (item) =>
      !item.isClosed &&
      (item.metrics.slTightened ||
        item.actionStatus === 'TRAIL_SL_BREAKEVEN' ||
        item.actionStatus === 'BOOK_PARTIAL_T1')
  ).length;
  const tightSlAlertCount = openItems.filter(
    (item) => item.metrics.riskProximity === 'CRITICAL' || item.metrics.riskProximity === 'WATCH'
  ).length;

  let tightestOpenTrade: AgentStockPreviewItem | null = null;
  for (const item of openItems) {
    if (
      !tightestOpenTrade ||
      item.metrics.slDistancePct < tightestOpenTrade.metrics.slDistancePct
    ) {
      tightestOpenTrade = item;
    }
  }

  const totalRiskCapitalRs = round2(
    allTrades.reduce((sum, t) => sum + (Number(t.riskCapitalRs) || 0), 0)
  );
  const autonomousOptimization = Boolean(report.agent.autonomousOptimization);
  const slShiftedCount =
    Number(report.agent.slShiftedCount) ||
    stockPreviews.filter((item) => item.volatilityAdjusted).length;

  return {
    report,
    operationalStatus,
    categoryLabel: SCANNER_CATEGORY_LABELS[report.category] || report.category,
    stockPreviews,
    openStopLossCount: openItems.length,
    trailedStopLossCount,
    tightSlAlertCount,
    tightestOpenTrade,
    totalRiskCapitalRs,
    autonomousOptimization,
    slShiftedCount,
  };
}

export function filterAndSortAgents(
  viewModels: AgentCardViewModel[],
  filters: AgentManagementFilterState
): AgentCardViewModel[] {
  const query = filters.search.trim().toLowerCase();

  const filtered = viewModels.filter((vm) => {
    const { report } = vm;
    if (filters.gender !== 'ALL' && report.agent.genderLabel !== filters.gender) {
      return false;
    }
    if (filters.category !== 'ALL' && report.category !== filters.category) {
      return false;
    }
    if (filters.status === 'ACTIVE_OPEN' && vm.openStopLossCount === 0) {
      return false;
    }
    if (filters.status === 'TRAILING_SL' && vm.trailedStopLossCount === 0) {
      return false;
    }
    if (filters.status === 'WATCH_SL' && vm.tightSlAlertCount === 0) {
      return false;
    }
    if (filters.status === 'AUTO_OPT' && !vm.autonomousOptimization) {
      return false;
    }
    if (filters.status === 'STANDBY' && report.summary.totalManaged > 0) {
      return false;
    }

    if (query) {
      const inAgent =
        report.agent.name.toLowerCase().includes(query) ||
        report.agent.agentId.toLowerCase().includes(query) ||
        report.agent.role.toLowerCase().includes(query);
      const inScanner =
        report.scannerName.toLowerCase().includes(query) ||
        report.scannerId.toLowerCase().includes(query) ||
        vm.categoryLabel.toLowerCase().includes(query);
      const inStocks = vm.stockPreviews.some((s) =>
        s.symbol.toLowerCase().includes(query)
      );
      if (!inAgent && !inScanner && !inStocks) {
        return false;
      }
    }

    return true;
  });

  const sorted = [...filtered];
  sorted.sort((a, b) => {
    if (filters.sortBy === 'pnl_desc') {
      return (b.report.summary.totalLivePnlRs || 0) - (a.report.summary.totalLivePnlRs || 0);
    }
    if (filters.sortBy === 'trades_desc') {
      return (b.report.summary.totalManaged || 0) - (a.report.summary.totalManaged || 0);
    }
    if (filters.sortBy === 'tightest_sl') {
      const aDist = a.tightestOpenTrade ? a.tightestOpenTrade.metrics.slDistancePct : Number.POSITIVE_INFINITY;
      const bDist = b.tightestOpenTrade ? b.tightestOpenTrade.metrics.slDistancePct : Number.POSITIVE_INFINITY;
      if (aDist !== bDist) return aDist - bDist;
      return a.report.rank - b.report.rank;
    }
    return a.report.rank - b.report.rank;
  });

  return sorted;
}

export function computeFleetRiskSummary(
  viewModels: AgentCardViewModel[],
  fleetData?: Fleet20Response | null
): AgentFleetRiskSummary {
  const totalAgents = viewModels.length;
  const activeAgents = viewModels.filter((vm) => vm.report.summary.totalManaged > 0).length;
  const standbyAgents = Math.max(0, totalAgents - activeAgents);
  const totalManagedStocks = viewModels.reduce(
    (sum, vm) => sum + vm.report.summary.totalManaged,
    0
  );
  const totalOpenStopLosses = viewModels.reduce(
    (sum, vm) => sum + vm.openStopLossCount,
    0
  );
  const totalTrailingProtected = viewModels.reduce(
    (sum, vm) => sum + vm.trailedStopLossCount,
    0
  );
  const totalTightSlAlerts = viewModels.reduce(
    (sum, vm) => sum + vm.tightSlAlertCount,
    0
  );
  const totalTargetExits = viewModels.reduce(
    (sum, vm) => sum + vm.report.summary.targetHitCount,
    0
  );
  const totalSlExits = viewModels.reduce(
    (sum, vm) => sum + vm.report.summary.slHitCount,
    0
  );
  const totalWins = viewModels.reduce(
    (sum, vm) => sum + vm.report.summary.winCount,
    0
  );
  const fleetLivePnlRs = round2(
    fleetData?.fleetSummary?.fleetLivePnlRs ??
      viewModels.reduce((sum, vm) => sum + vm.report.summary.totalLivePnlRs, 0)
  );
  const fleetWinRatePct =
    fleetData?.fleetSummary?.fleetWinRatePct ??
    (totalManagedStocks > 0 ? round2((totalWins / totalManagedStocks) * 100) : 0);

  const autonomousOptimizedAgents =
    fleetData?.fleetSummary?.autonomousOptimizedAgents ??
    viewModels.filter((vm) => vm.autonomousOptimization).length;
  const volatilityShiftedStopLosses =
    fleetData?.fleetSummary?.volatilityShiftedStopLosses ??
    viewModels.reduce((sum, vm) => sum + vm.slShiftedCount, 0);

  return {
    totalAgents,
    activeAgents,
    standbyAgents,
    totalManagedStocks,
    totalOpenStopLosses,
    totalTrailingProtected,
    totalTightSlAlerts,
    totalTargetExits,
    totalSlExits,
    fleetWinRatePct,
    fleetLivePnlRs,
    autonomousOptimizedAgents,
    volatilityShiftedStopLosses,
  };
}

export function formatInrSigned(value: number): string {
  const n = Number(value) || 0;
  const sign = n >= 0 ? '+' : '-';
  return `${sign}₹${Math.abs(Math.round(n)).toLocaleString('en-IN')}`;
}

export function formatPriceInr(value: number): string {
  const n = Number(value) || 0;
  return `₹${n.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export type PerformanceTableSortKey =
  | 'rank'
  | 'totalTrades'
  | 'winLossRatio'
  | 'winRatePct'
  | 'realizedPnlRs'
  | 'totalSessionPnlRs';

export interface AgentSessionPerformanceRow {
  rank: number;
  scannerId: string;
  scannerName: string;
  categoryLabel: string;
  agentId: string;
  agentName: string;
  agentGender: 'He' | 'She';
  operationalStatus: AgentOperationalStatus;
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  partialT1BookedCount: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** Numeric Win/Loss ratio (wins / losses). Infinity when wins > 0 and losses === 0; 0 when no wins. */
  winLossRatio: number;
  winLossRatioLabel: string;
  winRatePct: number;
  realizedPnlRs: number;
  unrealizedPnlRs: number;
  totalSessionPnlRs: number;
  avgRMultiple: number;
  autonomousOptimization: boolean;
}

export interface AgentSessionPerformanceTotals {
  agentCount: number;
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  partialT1BookedCount: number;
  wins: number;
  losses: number;
  breakeven: number;
  winLossRatio: number;
  winLossRatioLabel: string;
  winRatePct: number;
  realizedPnlRs: number;
  unrealizedPnlRs: number;
  totalSessionPnlRs: number;
}

/**
 * Computes realized P&L (INR) for a single managed trade in the current session:
 * - Closed trades (T2 Target Exit, SL Exit, 15:15 Time Exit): 100% of livePnlRs is realized.
 * - Partial T1 Booked trades (BOOK_PARTIAL_T1): 50% of position qty booked at Target 1.
 * - Open unbooked trades: ₹0 realized.
 */
export function computeTradeRealizedPnlRs(trade: AgentManagedTrade): number {
  if (trade.isClosed) {
    return round2(Number(trade.livePnlRs) || 0);
  }
  if (trade.actionStatus === 'BOOK_PARTIAL_T1') {
    const entry = Number(trade.entryPrice) || 0;
    const target1 = Number(trade.target1) || entry;
    const qty = Number(trade.positionQty) || 0;
    const t1Move = trade.side === 'BUY' ? target1 - entry : entry - target1;
    return round2(t1Move * (qty * 0.5));
  }
  return 0;
}

export function formatWinLossRatio(wins: number, losses: number): string {
  const w = Math.max(0, Math.floor(Number(wins) || 0));
  const l = Math.max(0, Math.floor(Number(losses) || 0));
  if (w === 0 && l === 0) return '—';
  if (l === 0) return `${w} : 0`;
  return `${(w / l).toFixed(2)} : 1`;
}

export function computeAgentSessionPerformance(
  viewModels: AgentCardViewModel[]
): {
  rows: AgentSessionPerformanceRow[];
  totals: AgentSessionPerformanceTotals;
} {
  let sumTotalTrades = 0;
  let sumClosedTrades = 0;
  let sumOpenTrades = 0;
  let sumPartialT1 = 0;
  let sumWins = 0;
  let sumLosses = 0;
  let sumBreakeven = 0;
  let sumRealized = 0;
  let sumTotalSession = 0;

  const rows: AgentSessionPerformanceRow[] = viewModels.map((vm) => {
    const { report } = vm;
    const trades = Array.isArray(report.allTrades) ? report.allTrades : [];

    let closedTrades = 0;
    let partialT1BookedCount = 0;
    let wins = 0;
    let losses = 0;
    let breakeven = 0;
    let realizedPnlRs = 0;
    let totalSessionPnlRs = 0;

    for (const t of trades) {
      const pnl = Number(t.livePnlRs) || 0;
      totalSessionPnlRs += pnl;
      if (t.isClosed) {
        closedTrades += 1;
      } else if (t.actionStatus === 'BOOK_PARTIAL_T1') {
        partialT1BookedCount += 1;
      }

      realizedPnlRs += computeTradeRealizedPnlRs(t);

      if (pnl > 0) {
        wins += 1;
      } else if (pnl < 0) {
        losses += 1;
      } else {
        breakeven += 1;
      }
    }

    const totalTrades = trades.length;
    const openTrades = Math.max(0, totalTrades - closedTrades);
    const roundedRealized = round2(realizedPnlRs);
    const roundedTotalSession = round2(
      trades.length > 0 ? totalSessionPnlRs : Number(report.summary.totalLivePnlRs) || 0
    );
    const unrealizedPnlRs = round2(roundedTotalSession - roundedRealized);

    const winLossRatio =
      losses > 0 ? round2(wins / losses) : wins > 0 ? Number.POSITIVE_INFINITY : 0;
    const winRatePct = totalTrades > 0 ? round2((wins / totalTrades) * 100) : 0;

    sumTotalTrades += totalTrades;
    sumClosedTrades += closedTrades;
    sumOpenTrades += openTrades;
    sumPartialT1 += partialT1BookedCount;
    sumWins += wins;
    sumLosses += losses;
    sumBreakeven += breakeven;
    sumRealized += roundedRealized;
    sumTotalSession += roundedTotalSession;

    return {
      rank: report.rank,
      scannerId: report.scannerId,
      scannerName: report.scannerName,
      categoryLabel: vm.categoryLabel,
      agentId: report.agent.agentId,
      agentName: report.agent.name,
      agentGender: report.agent.genderLabel,
      operationalStatus: vm.operationalStatus,
      totalTrades,
      closedTrades,
      openTrades,
      partialT1BookedCount,
      wins,
      losses,
      breakeven,
      winLossRatio,
      winLossRatioLabel: formatWinLossRatio(wins, losses),
      winRatePct,
      realizedPnlRs: roundedRealized,
      unrealizedPnlRs,
      totalSessionPnlRs: roundedTotalSession,
      avgRMultiple: Number(report.summary.avgRMultiple) || 0,
      autonomousOptimization: vm.autonomousOptimization,
    };
  });

  const totalRealizedRounded = round2(sumRealized);
  const totalSessionRounded = round2(sumTotalSession);
  const totalUnrealizedRounded = round2(totalSessionRounded - totalRealizedRounded);
  const fleetWinLossRatio =
    sumLosses > 0
      ? round2(sumWins / sumLosses)
      : sumWins > 0
      ? Number.POSITIVE_INFINITY
      : 0;
  const fleetWinRatePct =
    sumTotalTrades > 0 ? round2((sumWins / sumTotalTrades) * 100) : 0;

  return {
    rows,
    totals: {
      agentCount: rows.length,
      totalTrades: sumTotalTrades,
      closedTrades: sumClosedTrades,
      openTrades: sumOpenTrades,
      partialT1BookedCount: sumPartialT1,
      wins: sumWins,
      losses: sumLosses,
      breakeven: sumBreakeven,
      winLossRatio: fleetWinLossRatio,
      winLossRatioLabel: formatWinLossRatio(sumWins, sumLosses),
      winRatePct: fleetWinRatePct,
      realizedPnlRs: totalRealizedRounded,
      unrealizedPnlRs: totalUnrealizedRounded,
      totalSessionPnlRs: totalSessionRounded,
    },
  };
}

export function sortAgentSessionPerformanceRows(
  rows: AgentSessionPerformanceRow[],
  sortKey: PerformanceTableSortKey,
  direction: 'asc' | 'desc' = 'desc'
): AgentSessionPerformanceRow[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (sortKey === 'rank') {
      return (a.rank - b.rank) * factor;
    }
    if (sortKey === 'winLossRatio') {
      const aInf = !Number.isFinite(a.winLossRatio);
      const bInf = !Number.isFinite(b.winLossRatio);
      if (aInf && bInf) {
        if (a.wins !== b.wins) return (a.wins - b.wins) * factor;
        return a.rank - b.rank;
      }
      if (aInf) return 1 * factor;
      if (bInf) return -1 * factor;
      if (a.winLossRatio !== b.winLossRatio) {
        return (a.winLossRatio - b.winLossRatio) * factor;
      }
      if (a.wins !== b.wins) return (a.wins - b.wins) * factor;
      return a.rank - b.rank;
    }
    const diff = (a[sortKey] - b[sortKey]) * factor;
    if (diff !== 0) return diff;
    return a.rank - b.rank;
  });
}
