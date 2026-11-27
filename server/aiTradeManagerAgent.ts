import { ScannedStock } from '../src/types';
import {
  LOCKED_SYSTEM_RULES,
  LockedSessionWindowStatus,
  getLockedSessionWindowStatus,
  isTimeWithinScanWindow,
  passesRule3Thresholds,
} from './systemFiveRules';
import { sortRowsByListedAtDescZtoA } from './scannerUniversalGate';

export type AiTradeActionStatus =
  | 'HOLD_ACTIVE'
  | 'TRAIL_SL_BREAKEVEN'
  | 'BOOK_PARTIAL_T1'
  | 'TARGET_HIT_EXIT'
  | 'SL_HIT_EXIT'
  | 'TIME_EXIT_1515';

export interface DualAiAgentProfile {
  id: 'ARYAN_HE' | 'ARIA_SHE';
  name: string;
  genderLabel: 'He' | 'She';
  role: string;
  mandate: string;
  status: 'ACTIVE' | 'STANDBY_FLUSHED' | 'POST_MARKET_LOCKED';
}

export interface ManagedAiTrade {
  symbol: string;
  name: string;
  sector: string;
  side: 'BUY' | 'SELL';
  listedAt: string;
  formulaName: string;

  // Live Upstox price & formula metrics
  liveLtp: number;
  changePercent: number;
  rvol: number;
  xTimeVolume: number;
  adx: number;

  // Aryan AI (He — Entry & Momentum Strategist)
  entryAgent: 'Aryan AI (He)';
  entryPrice: number;
  convictionScore: number; // 0..100
  positionQty: number;
  riskCapitalRs: number;
  rrPlanned: string;
  entryVerdict: string;

  // Aria AI (She — Risk, Trailing Stop-Loss & Exit Manager)
  exitAgent: 'Aria AI (She)';
  initialStopLoss: number;
  activeStopLoss: number;
  target1: number;
  target2: number;
  peakFavorablePrice: number;
  liveRMultiple: number;
  livePnlPct: number;
  livePnlRs: number;
  actionStatus: AiTradeActionStatus;
  actionBadge: string;
  exitDirective: string;
  isClosed: boolean;
  /** Rule 4 guarantee: remains locked on dashboard until 23:59:00 IST even after T1/T2/SL exit */
  stickyLockedUntilFlush: true;
}

export interface DualAiTradeDeskReport {
  status: 'ok';
  generatedAt: string;
  session: LockedSessionWindowStatus;
  liveFeedProvider: string;
  upstoxConnected: boolean;
  capitalPerDeskRs: number;
  riskPerTradePct: number;
  agents: {
    he: DualAiAgentProfile;
    she: DualAiAgentProfile;
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
  upTrades: ManagedAiTrade[];
  downTrades: ManagedAiTrade[];
  allTrades: ManagedAiTrade[];
}

interface PersistedAgentTradeRecord {
  symbol: string;
  name: string;
  sector: string;
  side: 'BUY' | 'SELL';
  listedAt: string;
  formulaName: string;
  entryPrice: number;
  initialStopLoss: number;
  activeStopLoss: number;
  target1: number;
  target2: number;
  positionQty: number;
  riskCapitalRs: number;
  convictionScore: number;
  peakFavorablePrice: number;
  peakRvol: number;
  peakXTimeVolume: number;
  peakAdx: number;
  lastLtp: number;
  lastChangePercent: number;
  t1Booked: boolean;
  closedStatus?: 'TARGET_HIT_EXIT' | 'SL_HIT_EXIT' | 'TIME_EXIT_1515';
  closedAtPrice?: number;
}

function round2(n: number): number {
  return Number((Number.isFinite(n) ? n : 0).toFixed(2));
}

/**
 * Pure computation of Aryan AI (He) institutional Entry / SL / T1 / T2 / Qty plan.
 */
export function computeAryanEntryPlan(
  stock: ScannedStock,
  side: 'BUY' | 'SELL',
  deskCapitalRs: number = 500_000,
  riskPct: number = 1.0
): {
  entryPrice: number;
  initialStopLoss: number;
  target1: number;
  target2: number;
  positionQty: number;
  riskCapitalRs: number;
  convictionScore: number;
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
    entryPrice * 0.006,
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
      initialStopLoss = round2(entryPrice - atr * 1.15);
    }
  } else {
    if (!(initialStopLoss > entryPrice * 1.003)) {
      initialStopLoss = round2(entryPrice + atr * 1.15);
    }
  }

  const riskPerShare = Math.max(entryPrice * 0.0035, Math.abs(entryPrice - initialStopLoss));
  const target1 =
    side === 'BUY'
      ? round2(
          Number(stock.fixedTarget1) > entryPrice
            ? Number(stock.fixedTarget1)
            : entryPrice + riskPerShare * 1.5
        )
      : round2(
          Number(stock.fixedTarget1) > 0 && Number(stock.fixedTarget1) < entryPrice
            ? Number(stock.fixedTarget1)
            : entryPrice - riskPerShare * 1.5
        );

  const target2 =
    side === 'BUY'
      ? round2(
          Number(stock.risk?.target2) > target1
            ? Number(stock.risk!.target2)
            : entryPrice + riskPerShare * 2.5
        )
      : round2(
          Number(stock.risk?.target2) > 0 && Number(stock.risk!.target2) < target1
            ? Number(stock.risk!.target2)
            : entryPrice - riskPerShare * 2.5
        );

  const riskCapitalRs = round2((deskCapitalRs * riskPct) / 100);
  const rawQty = Math.floor(riskCapitalRs / Math.max(0.1, riskPerShare));
  const maxCapitalQty = entryPrice > 0 ? Math.max(1, Math.floor((deskCapitalRs * 0.25) / entryPrice)) : 1;
  const positionQty = Math.max(1, Math.min(rawQty, maxCapitalQty));

  const rvol = Number(stock.indicators?.rvol) || 0;
  const xTime = Number(stock.indicators?.xTimeVolume) || 0;
  const adx = Number(stock.indicators?.adx) || 0;
  const aiScore = Number(stock.aiScore) || 70;

  const convictionScore = Math.min(
    99,
    Math.max(
      65,
      Math.round(
        aiScore * 0.45 +
          Math.min(25, rvol * 6) +
          Math.min(18, xTime * 5) +
          Math.min(16, adx * 0.4)
      )
    )
  );

  return {
    entryPrice,
    initialStopLoss: round2(initialStopLoss),
    target1,
    target2,
    positionQty,
    riskCapitalRs,
    convictionScore,
  };
}

/**
 * Pure evaluation of Aria AI (She) live Trailing Stop-Loss, Breakeven Lock, T1/T2 Profit Booking & 15:15 Exit.
 */
export function evaluateAriaExitManagement(
  rec: PersistedAgentTradeRecord,
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
  exitDirective: string;
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
    rec.side === 'BUY'
      ? effectivePrice - rec.entryPrice
      : rec.entryPrice - effectivePrice;
  const peakMove =
    rec.side === 'BUY'
      ? peakFav - rec.entryPrice
      : rec.entryPrice - peakFav;

  const liveRMultiple = round2(priceMove / riskPerShare);
  const peakR = peakMove / riskPerShare;
  const livePnlPct = rec.entryPrice > 0 ? round2((priceMove / rec.entryPrice) * 100) : 0;
  const livePnlRs = round2(priceMove * rec.positionQty);

  // Compute Aria AI Trailing Stop-Loss (ratchets only in favorable direction)
  let activeStopLoss = rec.activeStopLoss || rec.initialStopLoss;
  let t1Booked = rec.t1Booked;

  if (peakR >= 1.5) {
    t1Booked = true;
    const trailLvl =
      rec.side === 'BUY'
        ? round2(rec.entryPrice + riskPerShare * 0.75)
        : round2(rec.entryPrice - riskPerShare * 0.75);
    activeStopLoss =
      rec.side === 'BUY'
        ? Math.max(activeStopLoss, trailLvl)
        : Math.min(activeStopLoss, trailLvl);
  } else if (peakR >= 1.0) {
    // Move SL strictly to Breakeven (+0.05R buffer) once +1.0R achieved
    const beLvl =
      rec.side === 'BUY'
        ? round2(rec.entryPrice + riskPerShare * 0.05)
        : round2(rec.entryPrice - riskPerShare * 0.05);
    activeStopLoss =
      rec.side === 'BUY'
        ? Math.max(activeStopLoss, beLvl)
        : Math.min(activeStopLoss, beLvl);
  }

  // Respect already-closed terminal status from earlier in the day
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
      actionBadge: '🏆 T2 HIT • FULL PROFIT BOOKED',
      exitDirective: `Aria AI booked 100% exit at ₹${exitP.toFixed(2)} (T2 target hit). Locked on dashboard until 23:59 IST.`,
      isClosed: true,
      t1Booked: true,
    };
  }

  if (rec.closedStatus === 'SL_HIT_EXIT') {
    const exitP = rec.closedAtPrice || activeStopLoss;
    const closedMove = rec.side === 'BUY' ? exitP - rec.entryPrice : rec.entryPrice - exitP;
    const isProfitTrailStop = closedMove >= 0;
    return {
      activeStopLoss,
      peakFavorablePrice: peakFav,
      liveRMultiple: round2(closedMove / riskPerShare),
      livePnlPct: rec.entryPrice > 0 ? round2((closedMove / rec.entryPrice) * 100) : 0,
      livePnlRs: round2(closedMove * rec.positionQty),
      actionStatus: 'SL_HIT_EXIT',
      actionBadge: isProfitTrailStop ? '🛡️ TRAILING SL HIT • PROFIT LOCKED' : '🛑 SL HIT • RISK CAPPED',
      exitDirective: isProfitTrailStop
        ? `Aria AI exited on Trailing SL ₹${exitP.toFixed(2)} with profit protected. Locked on dashboard until 23:59 IST.`
        : `Aria AI enforced strict Stop-Loss exit at ₹${exitP.toFixed(2)} (1% max risk). Locked on dashboard until 23:59 IST.`,
      isClosed: true,
      t1Booked,
    };
  }

  // Check live T2 Hit
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
      actionBadge: '🏆 T2 HIT • FULL PROFIT BOOKED',
      exitDirective: `Aria AI booked full T2 target at ₹${effectivePrice.toFixed(2)} (+${liveRMultiple.toFixed(2)}R).`,
      isClosed: true,
      t1Booked: true,
    };
  }

  // Check live Stop-Loss breach
  const hitSl =
    rec.side === 'BUY'
      ? effectivePrice <= activeStopLoss
      : effectivePrice >= activeStopLoss;
  if (hitSl) {
    const isProfitTrailStop = priceMove >= 0;
    return {
      activeStopLoss,
      peakFavorablePrice: peakFav,
      liveRMultiple,
      livePnlPct,
      livePnlRs,
      actionStatus: 'SL_HIT_EXIT',
      actionBadge: isProfitTrailStop ? '🛡️ TRAILING SL HIT • PROFIT LOCKED' : '🛑 SL HIT • RISK CAPPED',
      exitDirective: isProfitTrailStop
        ? `Aria AI triggered profit-protected Trailing SL at ₹${activeStopLoss.toFixed(2)}.`
        : `Aria AI triggered protective SL exit at ₹${activeStopLoss.toFixed(2)} to guard capital.`,
      isClosed: true,
      t1Booked,
    };
  }

  // Check Rule 1 15:15 IST Intraday Square-Off Cutoff
  if (isSquareOffReached) {
    return {
      activeStopLoss,
      peakFavorablePrice: peakFav,
      liveRMultiple,
      livePnlPct,
      livePnlRs,
      actionStatus: 'TIME_EXIT_1515',
      actionBadge: '⏰ 03:15 PM SQUARE-OFF EXIT',
      exitDirective: `Aria AI issued mandatory 15:15 IST intraday square-off at ₹${effectivePrice.toFixed(2)}. Visible until 23:59 IST flush.`,
      isClosed: true,
      t1Booked,
    };
  }

  // Active live trailing / partial booking states
  if (t1Booked || liveRMultiple >= 1.5) {
    return {
      activeStopLoss,
      peakFavorablePrice: peakFav,
      liveRMultiple,
      livePnlPct,
      livePnlRs,
      actionStatus: 'BOOK_PARTIAL_T1',
      actionBadge: '🎯 T1 HIT • TRAIL SL +0.75R',
      exitDirective: `Aria AI booked 50% at T1 (₹${rec.target1.toFixed(2)}) & trailed SL to ₹${activeStopLoss.toFixed(2)} for T2 runner.`,
      isClosed: false,
      t1Booked: true,
    };
  }

  if (peakR >= 1.0) {
    return {
      activeStopLoss,
      peakFavorablePrice: peakFav,
      liveRMultiple,
      livePnlPct,
      livePnlRs,
      actionStatus: 'TRAIL_SL_BREAKEVEN',
      actionBadge: '🛡️ SL MOVED TO BREAKEVEN',
      exitDirective: `Aria AI locked risk-free breakeven SL at ₹${activeStopLoss.toFixed(2)} (+1R milestone reached).`,
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
    exitDirective: `Aria AI guarding initial SL ₹${activeStopLoss.toFixed(2)} • Breakeven trail arms at +1.0R.`,
    isClosed: false,
    t1Booked: false,
  };
}

/**
 * Dual AI Trade Management Desk ("He & She" — Aryan AI & Aria AI)
 * Manages whole-system Entry, Trailing Stop-Loss, and Exit strictly under the 5 Locked Rules.
 */
export class DualAiTradeManagerDesk {
  private sessionDateIST: string = '';
  private hasHydratedSession: boolean = false;
  private upBook: Map<string, PersistedAgentTradeRecord> = new Map();
  private downBook: Map<string, PersistedAgentTradeRecord> = new Map();
  private readonly deskCapitalRs = 500_000;
  private readonly riskPerTradePct = 1.0;

  public resetAll(): void {
    this.upBook.clear();
    this.downBook.clear();
    this.hasHydratedSession = false;
  }

  private ensureSession(session: LockedSessionWindowStatus): void {
    if (session.isFlushCleared) {
      if (this.upBook.size > 0 || this.downBook.size > 0) {
        this.resetAll();
      }
      this.sessionDateIST = session.dateIST;
      return;
    }
    if (this.sessionDateIST && this.sessionDateIST !== session.dateIST) {
      this.resetAll();
    }
    this.sessionDateIST = session.dateIST;
  }

  public syncAndBuildReport(params: {
    topBuyStocks: ScannedStock[];
    topSellStocks: ScannedStock[];
    allStocks: ScannedStock[];
    now?: Date;
    isMarketOffDay?: boolean;
    liveFeedProvider?: string;
    upstoxConnected?: boolean;
    forceCleared?: boolean;
  }): DualAiTradeDeskReport {
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
          phaseLabel: '11:59 PM AUTO-FLUSH • ALL SCANNERS EMPTIED',
        }
      : baseSession;

    this.ensureSession(session);

    const agentStatus: DualAiAgentProfile['status'] = session.isFlushCleared
      ? 'STANDBY_FLUSHED'
      : session.isLiveScanWindow
      ? 'ACTIVE'
      : 'POST_MARKET_LOCKED';

    const agents = {
      he: {
        id: 'ARYAN_HE' as const,
        name: 'Aryan AI',
        genderLabel: 'He' as const,
        role: 'Lead Entry & Momentum Strategist',
        mandate: 'Locks Best 10 UP & Best 10 DOWN entries strictly per formula (RVOL > 2.00, Vol Bazaar X-Time > 1.00X, ADX 25+) between 09:20–15:15 IST with 1% position sizing.',
        status: agentStatus,
      },
      she: {
        id: 'ARIA_SHE' as const,
        name: 'Aria AI',
        genderLabel: 'She' as const,
        role: 'Risk, Trailing Stop-Loss & Exit Manager',
        mandate: 'Monitors live Upstox LTP, auto-trails SL to Breakeven at +1R, books 50% at T1 (+1.5R) & 100% at T2 (+2.5R), enforces hard SL & 15:15 IST exit without ever removing listed stocks.',
        status: agentStatus,
      },
    };

    if (session.isFlushCleared) {
      return {
        status: 'ok',
        generatedAt: new Date().toISOString(),
        session,
        liveFeedProvider: params.liveFeedProvider || 'UPSTOX_API_V2',
        upstoxConnected: Boolean(params.upstoxConnected),
        capitalPerDeskRs: this.deskCapitalRs,
        riskPerTradePct: this.riskPerTradePct,
        agents,
        summary: {
          totalManaged: 0,
          upCount: 0,
          downCount: 0,
          activeOpenCount: 0,
          trailingProtectedCount: 0,
          targetHitCount: 0,
          slHitCount: 0,
          winCount: 0,
          winRatePct: 0,
          totalLivePnlRs: 0,
          avgRMultiple: 0,
        },
        upTrades: [],
        downTrades: [],
        allTrades: [],
      };
    }

    const liveMap = new Map<string, ScannedStock>();
    for (const s of params.allStocks || []) {
      if (s?.symbol) liveMap.set(s.symbol.toUpperCase(), s);
    }

    const admitDirection = (
      candidates: ScannedStock[],
      book: Map<string, PersistedAgentTradeRecord>,
      side: 'BUY' | 'SELL'
    ) => {
      for (const stock of candidates || []) {
        const sym = String(stock?.symbol || '').toUpperCase().trim();
        if (!sym) continue;

        const rvol = Number(stock.indicators?.rvol) || 0;
        const xTime = Number(stock.indicators?.xTimeVolume) || 0;
        const adx = Number(stock.indicators?.adx) || 0;
        const rule3 = passesRule3Thresholds(rvol, xTime, adx, true);

        const existing = book.get(sym);
        if (existing) {
          existing.peakRvol = Math.max(existing.peakRvol, rvol);
          existing.peakXTimeVolume = Math.max(existing.peakXTimeVolume, xTime);
          existing.peakAdx = Math.max(existing.peakAdx, adx);
          if (stock.price > 0) {
            existing.lastLtp = stock.price;
            existing.lastChangePercent = Number(stock.changePercent) || existing.lastChangePercent;
          }
          continue;
        }

        // Rule 2 & Rule 4: Strictly MAX 10 per direction; already-locked entries are NEVER evicted
        if (book.size >= LOCKED_SYSTEM_RULES.MAX_STOCKS_PER_DIRECTION) {
          continue;
        }
        if (!rule3.passedAll) continue;

        const plan = computeAryanEntryPlan(stock, side, this.deskCapitalRs, this.riskPerTradePct);
        if (plan.entryPrice <= 0) continue;

        const resolvedListedAt =
          this.hasHydratedSession && session.isLiveScanWindow
            ? session.timeIST
            : stock.listedAt && stock.listedAt !== '--' && isTimeWithinScanWindow(stock.listedAt)
            ? stock.listedAt
            : isTimeWithinScanWindow(session.timeIST)
            ? session.timeIST
            : LOCKED_SYSTEM_RULES.SCAN_END_IST;

        book.set(sym, {
          symbol: sym,
          name: stock.name || sym,
          sector: stock.sector || 'NSE F&O',
          side,
          listedAt: resolvedListedAt,
          formulaName: stock.formulaName || (side === 'BUY' ? 'Momentum Breakout' : 'Momentum Breakdown'),
          entryPrice: plan.entryPrice,
          initialStopLoss: plan.initialStopLoss,
          activeStopLoss: plan.initialStopLoss,
          target1: plan.target1,
          target2: plan.target2,
          positionQty: plan.positionQty,
          riskCapitalRs: plan.riskCapitalRs,
          convictionScore: plan.convictionScore,
          peakFavorablePrice: stock.price > 0 ? stock.price : plan.entryPrice,
          peakRvol: rvol,
          peakXTimeVolume: xTime,
          peakAdx: adx,
          lastLtp: stock.price > 0 ? stock.price : plan.entryPrice,
          lastChangePercent: Number(stock.changePercent) || 0,
          t1Booked: false,
        });
      }
    };

    admitDirection(params.topBuyStocks, this.upBook, 'BUY');
    admitDirection(params.topSellStocks, this.downBook, 'SELL');
    if ((params.allStocks?.length || 0) > 0) {
      this.hasHydratedSession = true;
    }

    const materializeBook = (book: Map<string, PersistedAgentTradeRecord>): ManagedAiTrade[] => {
      const list: ManagedAiTrade[] = [];
      for (const rec of book.values()) {
        const live = liveMap.get(rec.symbol);
        const ltp = live && live.price > 0 ? live.price : rec.lastLtp || rec.entryPrice;
        const chgPct = live ? Number(live.changePercent) || 0 : rec.lastChangePercent;
        const rvol = Math.max(rec.peakRvol, Number(live?.indicators?.rvol) || 0);
        const xTime = Math.max(rec.peakXTimeVolume, Number(live?.indicators?.xTimeVolume) || 0);
        const adx = Math.max(rec.peakAdx, Number(live?.indicators?.adx) || 0);

        const evalRes = evaluateAriaExitManagement(rec, ltp, session.isSquareOffReached);
        rec.activeStopLoss = evalRes.activeStopLoss;
        rec.peakFavorablePrice = evalRes.peakFavorablePrice;
        rec.lastLtp = ltp;
        rec.lastChangePercent = chgPct;
        rec.t1Booked = evalRes.t1Booked;
        if (
          !rec.closedStatus &&
          (evalRes.actionStatus === 'TARGET_HIT_EXIT' ||
            evalRes.actionStatus === 'SL_HIT_EXIT' ||
            evalRes.actionStatus === 'TIME_EXIT_1515')
        ) {
          rec.closedStatus = evalRes.actionStatus;
          rec.closedAtPrice = ltp;
        }

        list.push({
          symbol: rec.symbol,
          name: rec.name,
          sector: rec.sector,
          side: rec.side,
          listedAt: rec.listedAt,
          formulaName: rec.formulaName,
          liveLtp: round2(ltp),
          changePercent: round2(chgPct),
          rvol: round2(rvol),
          xTimeVolume: round2(xTime),
          adx: round2(adx),
          entryAgent: 'Aryan AI (He)',
          entryPrice: rec.entryPrice,
          convictionScore: rec.convictionScore,
          positionQty: rec.positionQty,
          riskCapitalRs: rec.riskCapitalRs,
          rrPlanned: '1:2.5',
          entryVerdict: `Aryan AI locked ${rec.side} @ ₹${rec.entryPrice.toFixed(2)} • Qty ${rec.positionQty} • RVOL ${rvol.toFixed(2)} • VolX ${xTime.toFixed(2)}X`,
          exitAgent: 'Aria AI (She)',
          initialStopLoss: rec.initialStopLoss,
          activeStopLoss: evalRes.activeStopLoss,
          target1: rec.target1,
          target2: rec.target2,
          peakFavorablePrice: round2(evalRes.peakFavorablePrice),
          liveRMultiple: evalRes.liveRMultiple,
          livePnlPct: evalRes.livePnlPct,
          livePnlRs: evalRes.livePnlRs,
          actionStatus: evalRes.actionStatus,
          actionBadge: evalRes.actionBadge,
          exitDirective: evalRes.exitDirective,
          isClosed: evalRes.isClosed,
          stickyLockedUntilFlush: true,
        });
      }
      // Rule 4: Strictly sort every category by LISTED AT Z -> A
      return sortRowsByListedAtDescZtoA(list, (r) => r.symbol);
    };

    const upTrades = materializeBook(this.upBook);
    const downTrades = materializeBook(this.downBook);
    const allTrades = sortRowsByListedAtDescZtoA([...upTrades, ...downTrades], (r) => r.symbol);

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

    return {
      status: 'ok',
      generatedAt: new Date().toISOString(),
      session,
      liveFeedProvider: params.liveFeedProvider || 'UPSTOX_API_V2',
      upstoxConnected: Boolean(params.upstoxConnected),
      capitalPerDeskRs: this.deskCapitalRs,
      riskPerTradePct: this.riskPerTradePct,
      agents,
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
    };
  }
}

export const dualAiTradeManagerDesk = new DualAiTradeManagerDesk();
