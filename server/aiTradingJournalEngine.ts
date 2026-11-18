import fs from 'fs';
import os from 'os';
import path from 'path';
import { Candle, ScannedStock } from '../src/types';
import { getISTDateParts } from '../src/data/marketSchedule';
import { IntradayCandleBar, UnifiedMarketQuote } from './autonomousPriceService';
import { ApexAlphaRow, buildApexAlphaReport } from './apexAlphaEngine';
import { buildClaudeFnoReport, ClaudeFnoRow } from './claudeFnoEngine';
import { buildMostActiveFnoReport, MostActiveFnoRow } from './mostActiveFnoEngine';

export type JournalTradeSide = 'BUY' | 'SELL';
export type JournalTradeSource = 'AI_AUTO' | 'MANUAL';
export type JournalTradeStatus = 'OPEN' | 'TRAIL_LOCKED' | 'WIN' | 'LOSS' | 'BREAKEVEN';
export type JournalExitReason =
  | 'TARGET_HIT'
  | 'TRAIL_STOP_HIT'
  | 'STOP_LOSS_HIT'
  | 'EOD_SQUARE_OFF'
  | 'MANUAL_CLOSE'
  | 'CARRIED_EOD_CLOSE';

export interface AiJournalConfig {
  autoAiEnabled: boolean;
  dailyMaxTrades: number; // default 5 every day
  capital: number;
  riskPct: number;
  allowSecondTierAfter1015: boolean;
  soundBeepsCount: number; // 5 beeps
}

export interface AiJournalTrade {
  id: string;
  dateIST: string;
  daySlot: number; // 1..dailyMaxTrades for AI_AUTO, 0 for MANUAL
  source: JournalTradeSource;
  strategy: string;
  symbol: string;
  displayName: string;
  sector: string;
  side: JournalTradeSide;
  aiScore: number; // 0..100
  convictionLabel: string;
  entryTimeIST: string;
  entryPrice: number;
  stopLoss: number;
  initialStopLoss: number;
  trailTriggerPrice: number;
  trailLockPrice: number;
  trailLocked: boolean;
  targetPrice: number;
  rrMultiple: number;
  qty: number;
  riskAmount: number;
  currentPrice: number;
  highWatermark: number;
  lowWatermark: number;
  exitTimeIST?: string;
  exitPrice?: number;
  exitReason?: JournalExitReason;
  status: JournalTradeStatus;
  grossPnl: number;
  pnl: number; // realized net P&L when closed, live MTM when open
  rMultiple: number;
  thesis: string;
  createdAtISO: string;
  updatedAtISO: string;
}

export interface AiTradeAlertEvent {
  eventId: string;
  eventType: 'AI_ENTRY' | 'AI_TRAIL_LOCK' | 'AI_EXIT';
  dateIST: string;
  timestampISO: string;
  timeIST: string;
  symbol: string;
  side: JournalTradeSide;
  strategy: string;
  price: number;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  qty: number;
  rrMultiple: number;
  pnl?: number;
  rMultiple?: number;
  exitReason?: string;
  daySlot: number;
  dailyMaxTrades: number;
  thesis: string;
  beepCount: 5;
  shareText: string;
}

export interface AiDailySummaryRow {
  dateIST: string;
  totalTrades: number;
  aiTrades: number;
  manualTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  netPnl: number;
  avgR: number;
}

export interface AiJournalSummary {
  totalTrades: number;
  closedTrades: number;
  openTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRatePct: number;
  profitFactor: number;
  totalRealizedPnl: number;
  todayRealizedPnl: number;
  todayOpenMtm: number;
  todayTotalPnl: number;
  avgRMultiple: number;
  maxDrawdownPct: number;
  todayAiCount: number;
  todayAiRemaining: number;
  todayManualCount: number;
}

export interface AiJournalState {
  version: number;
  config: AiJournalConfig;
  lastScanDateIST: string;
  lastScanTimeIST: string;
  trades: AiJournalTrade[];
  alertEvents: AiTradeAlertEvent[];
}

export interface AiJournalReport {
  status: 'ok';
  dateIST: string;
  istTime: string;
  isMidnightCleared: boolean;
  isMarketOffDay: boolean;
  config: AiJournalConfig;
  summary: AiJournalSummary;
  todayTrades: AiJournalTrade[];
  historyTrades: AiJournalTrade[];
  dailySummaries: AiDailySummaryRow[];
  recentAlerts: AiTradeAlertEvent[];
  lastScanMessage: string;
}

export interface AiCandidateSignal {
  symbol: string;
  displayName: string;
  sector: string;
  side: JournalTradeSide;
  strategy: string;
  aiScore: number;
  convictionLabel: string;
  entryPrice: number;
  stopLoss: number;
  trailTriggerPrice: number;
  trailLockPrice: number;
  targetPrice: number;
  rrMultiple: number;
  qty: number;
  riskAmount: number;
  entryTimeIST: string;
  thesis: string;
  priorityTier: number;
}

const JOURNAL_STORE_VERSION = 1;
const DEFAULT_STORE_FILE = path.join(os.tmpdir(), 'muhurat_ai_trading_journal_v1.json');
const ROUND_TRIP_COST_PCT = 0.0005; // 0.05% slippage + STT + brokerage
const EOD_SQUAREOFF_SEC = 15 * 3600 + 20 * 60; // 15:20 IST

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function parseClockToSec(clockStr: string | undefined): number {
  if (!clockStr) return -1;
  const clean = String(clockStr).replace(/\s*IST$/i, '').trim();
  const m = clean.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return -1;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3] || 0);
}

export function buildShareAlertText(params: {
  eventType: 'AI_ENTRY' | 'AI_TRAIL_LOCK' | 'AI_EXIT';
  symbol: string;
  side: JournalTradeSide;
  strategy: string;
  price: number;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number;
  qty: number;
  rrMultiple: number;
  daySlot: number;
  dailyMaxTrades: number;
  timeIST: string;
  dateIST: string;
  pnl?: number;
  rMultiple?: number;
  exitReason?: string;
  thesis: string;
}): string {
  const dirLabel = params.side === 'BUY' ? '🟢 BUY' : '🔴 SELL';
  const slotTag = params.daySlot > 0 ? `Slot ${params.daySlot}/${params.dailyMaxTrades}` : 'MANUAL';
  if (params.eventType === 'AI_ENTRY') {
    return [
      `🤖 AI TRADING JOURNAL ALERT (${slotTag})`,
      `${dirLabel} ${params.symbol} @ ₹${round2(params.entryPrice)} | Qty: ${params.qty}`,
      `SL: ₹${round2(params.stopLoss)} | Target: ₹${round2(params.targetPrice)} (R:R 1:${round2(params.rrMultiple)})`,
      `Strategy: ${params.strategy} | ${params.dateIST} ${params.timeIST} IST`,
      `Thesis: ${params.thesis}`,
    ].join('\n');
  }
  if (params.eventType === 'AI_TRAIL_LOCK') {
    return [
      `🔒 AI TRAIL LOCK ARMED • ${dirLabel} ${params.symbol}`,
      `LTP: ₹${round2(params.price)} | Entry: ₹${round2(params.entryPrice)} | New SL Locked: ₹${round2(params.stopLoss)}`,
      `Time: ${params.dateIST} ${params.timeIST} IST`,
    ].join('\n');
  }
  const pnlSign = (params.pnl || 0) >= 0 ? '+' : '';
  const rSign = (params.rMultiple || 0) >= 0 ? '+' : '';
  return [
    `🏁 AI TRADE CLOSED (${params.exitReason || 'EXIT'}) • ${dirLabel} ${params.symbol}`,
    `Entry: ₹${round2(params.entryPrice)} -> Exit: ₹${round2(params.price)} | Qty: ${params.qty}`,
    `Net P&L: ${pnlSign}₹${round2(params.pnl || 0)} (${rSign}${round2(params.rMultiple || 0)}R)`,
    `Strategy: ${params.strategy} | ${params.dateIST} ${params.timeIST} IST`,
  ].join('\n');
}

export function createDefaultJournalState(): AiJournalState {
  return {
    version: JOURNAL_STORE_VERSION,
    config: {
      autoAiEnabled: true,
      dailyMaxTrades: 5,
      capital: 100000,
      riskPct: 1.0,
      allowSecondTierAfter1015: true,
      soundBeepsCount: 5,
    },
    lastScanDateIST: '',
    lastScanTimeIST: '',
    trades: [],
    alertEvents: [],
  };
}

export function computeTradeNetPnlAndR(params: {
  side: JournalTradeSide;
  entryPrice: number;
  initialStopLoss: number;
  exitOrCurrentPrice: number;
  qty: number;
  applyFriction: boolean;
}): { grossPnl: number; netPnl: number; rMultiple: number } {
  const { side, entryPrice, initialStopLoss, exitOrCurrentPrice, qty, applyFriction } = params;
  const diff = side === 'BUY' ? exitOrCurrentPrice - entryPrice : entryPrice - exitOrCurrentPrice;
  const grossPnl = round2(diff * qty);
  const frictionCost = applyFriction ? round2((entryPrice + exitOrCurrentPrice) * qty * (ROUND_TRIP_COST_PCT / 2)) : 0;
  const netPnl = round2(grossPnl - frictionCost);
  const riskPerUnit = Math.max(0.05, side === 'BUY' ? entryPrice - initialStopLoss : initialStopLoss - entryPrice);
  const totalRisk = Math.max(1, riskPerUnit * qty);
  const rMultiple = round2(netPnl / totalRisk);
  return { grossPnl, netPnl, rMultiple };
}

export function closeExpiredPreviousDayTrades(
  state: AiJournalState,
  todayDateIST: string,
  priceLookup: Map<string, number>,
  nowISO: string
): AiTradeAlertEvent[] {
  const emitted: AiTradeAlertEvent[] = [];
  for (const t of state.trades) {
    if ((t.status === 'OPEN' || t.status === 'TRAIL_LOCKED') && t.dateIST < todayDateIST) {
      const closePx = round2(priceLookup.get(t.symbol) || t.currentPrice || t.entryPrice);
      const { grossPnl, netPnl, rMultiple } = computeTradeNetPnlAndR({
        side: t.side,
        entryPrice: t.entryPrice,
        initialStopLoss: t.initialStopLoss,
        exitOrCurrentPrice: closePx,
        qty: t.qty,
        applyFriction: true,
      });
      t.currentPrice = closePx;
      t.exitPrice = closePx;
      t.exitTimeIST = '15:25:00';
      t.exitReason = 'CARRIED_EOD_CLOSE';
      t.grossPnl = grossPnl;
      t.pnl = netPnl;
      t.rMultiple = rMultiple;
      t.status = netPnl > 0 ? 'WIN' : netPnl < 0 ? 'LOSS' : 'BREAKEVEN';
      t.updatedAtISO = nowISO;

      const evt: AiTradeAlertEvent = {
        eventId: `evt-close-${t.id}-CARRIED_EOD_CLOSE`,
        eventType: 'AI_EXIT',
        dateIST: t.dateIST,
        timestampISO: nowISO,
        timeIST: '15:25:00',
        symbol: t.symbol,
        side: t.side,
        strategy: t.strategy,
        price: closePx,
        entryPrice: t.entryPrice,
        stopLoss: t.stopLoss,
        targetPrice: t.targetPrice,
        qty: t.qty,
        rrMultiple: t.rrMultiple,
        pnl: netPnl,
        rMultiple,
        exitReason: 'CARRIED_EOD_CLOSE',
        daySlot: t.daySlot,
        dailyMaxTrades: state.config.dailyMaxTrades,
        thesis: t.thesis,
        beepCount: 5,
        shareText: buildShareAlertText({
          eventType: 'AI_EXIT',
          symbol: t.symbol,
          side: t.side,
          strategy: t.strategy,
          price: closePx,
          entryPrice: t.entryPrice,
          stopLoss: t.stopLoss,
          targetPrice: t.targetPrice,
          qty: t.qty,
          rrMultiple: t.rrMultiple,
          daySlot: t.daySlot,
          dailyMaxTrades: state.config.dailyMaxTrades,
          timeIST: '15:25:00',
          dateIST: t.dateIST,
          pnl: netPnl,
          rMultiple,
          exitReason: 'CARRIED_EOD_CLOSE',
          thesis: t.thesis,
        }),
      };
      emitted.push(evt);
    }
  }
  return emitted;
}

export function updateOpenJournalTrades(params: {
  state: AiJournalState;
  todayDateIST: string;
  nowTimeIST: string;
  nowSecIST: number;
  isMarketOffDay: boolean;
  priceLookup: Map<string, number>;
  nowISO: string;
}): AiTradeAlertEvent[] {
  const { state, todayDateIST, nowTimeIST, nowSecIST, isMarketOffDay, priceLookup, nowISO } = params;
  const emitted: AiTradeAlertEvent[] = [];

  for (const t of state.trades) {
    if (t.status !== 'OPEN' && t.status !== 'TRAIL_LOCKED') continue;
    const livePx = round2(priceLookup.get(t.symbol) || t.currentPrice || t.entryPrice);
    if (livePx <= 0) continue;

    t.currentPrice = livePx;
    t.highWatermark = Math.max(t.highWatermark || livePx, livePx);
    t.lowWatermark = Math.min(t.lowWatermark || livePx, livePx);
    t.updatedAtISO = nowISO;

    const hitSL = t.side === 'BUY' ? livePx <= t.stopLoss : livePx >= t.stopLoss;
    const hitTarget = t.side === 'BUY' ? livePx >= t.targetPrice : livePx <= t.targetPrice;
    const hitTrailTrigger =
      !t.trailLocked &&
      (t.side === 'BUY' ? livePx >= t.trailTriggerPrice : livePx <= t.trailTriggerPrice);
    const hitEodSquareOff = !isMarketOffDay && t.dateIST === todayDateIST && nowSecIST >= EOD_SQUAREOFF_SEC;

    if (hitSL) {
      const exitReason: JournalExitReason = t.trailLocked ? 'TRAIL_STOP_HIT' : 'STOP_LOSS_HIT';
      const { grossPnl, netPnl, rMultiple } = computeTradeNetPnlAndR({
        side: t.side,
        entryPrice: t.entryPrice,
        initialStopLoss: t.initialStopLoss,
        exitOrCurrentPrice: livePx,
        qty: t.qty,
        applyFriction: true,
      });
      t.exitPrice = livePx;
      t.exitTimeIST = nowTimeIST;
      t.exitReason = exitReason;
      t.grossPnl = grossPnl;
      t.pnl = netPnl;
      t.rMultiple = rMultiple;
      t.status = netPnl > 0 ? 'WIN' : netPnl < 0 ? 'LOSS' : 'BREAKEVEN';

      emitted.push({
        eventId: `evt-close-${t.id}-${exitReason}`,
        eventType: 'AI_EXIT',
        dateIST: t.dateIST,
        timestampISO: nowISO,
        timeIST: nowTimeIST,
        symbol: t.symbol,
        side: t.side,
        strategy: t.strategy,
        price: livePx,
        entryPrice: t.entryPrice,
        stopLoss: t.stopLoss,
        targetPrice: t.targetPrice,
        qty: t.qty,
        rrMultiple: t.rrMultiple,
        pnl: netPnl,
        rMultiple,
        exitReason,
        daySlot: t.daySlot,
        dailyMaxTrades: state.config.dailyMaxTrades,
        thesis: t.thesis,
        beepCount: 5,
        shareText: buildShareAlertText({
          eventType: 'AI_EXIT',
          symbol: t.symbol,
          side: t.side,
          strategy: t.strategy,
          price: livePx,
          entryPrice: t.entryPrice,
          stopLoss: t.stopLoss,
          targetPrice: t.targetPrice,
          qty: t.qty,
          rrMultiple: t.rrMultiple,
          daySlot: t.daySlot,
          dailyMaxTrades: state.config.dailyMaxTrades,
          timeIST: nowTimeIST,
          dateIST: t.dateIST,
          pnl: netPnl,
          rMultiple,
          exitReason,
          thesis: t.thesis,
        }),
      });
      continue;
    }

    if (hitTarget) {
      const { grossPnl, netPnl, rMultiple } = computeTradeNetPnlAndR({
        side: t.side,
        entryPrice: t.entryPrice,
        initialStopLoss: t.initialStopLoss,
        exitOrCurrentPrice: livePx,
        qty: t.qty,
        applyFriction: true,
      });
      t.exitPrice = livePx;
      t.exitTimeIST = nowTimeIST;
      t.exitReason = 'TARGET_HIT';
      t.grossPnl = grossPnl;
      t.pnl = netPnl;
      t.rMultiple = rMultiple;
      t.status = netPnl >= 0 ? 'WIN' : 'LOSS';

      emitted.push({
        eventId: `evt-close-${t.id}-TARGET_HIT`,
        eventType: 'AI_EXIT',
        dateIST: t.dateIST,
        timestampISO: nowISO,
        timeIST: nowTimeIST,
        symbol: t.symbol,
        side: t.side,
        strategy: t.strategy,
        price: livePx,
        entryPrice: t.entryPrice,
        stopLoss: t.stopLoss,
        targetPrice: t.targetPrice,
        qty: t.qty,
        rrMultiple: t.rrMultiple,
        pnl: netPnl,
        rMultiple,
        exitReason: 'TARGET_HIT',
        daySlot: t.daySlot,
        dailyMaxTrades: state.config.dailyMaxTrades,
        thesis: t.thesis,
        beepCount: 5,
        shareText: buildShareAlertText({
          eventType: 'AI_EXIT',
          symbol: t.symbol,
          side: t.side,
          strategy: t.strategy,
          price: livePx,
          entryPrice: t.entryPrice,
          stopLoss: t.stopLoss,
          targetPrice: t.targetPrice,
          qty: t.qty,
          rrMultiple: t.rrMultiple,
          daySlot: t.daySlot,
          dailyMaxTrades: state.config.dailyMaxTrades,
          timeIST: nowTimeIST,
          dateIST: t.dateIST,
          pnl: netPnl,
          rMultiple,
          exitReason: 'TARGET_HIT',
          thesis: t.thesis,
        }),
      });
      continue;
    }

    if (hitEodSquareOff) {
      const { grossPnl, netPnl, rMultiple } = computeTradeNetPnlAndR({
        side: t.side,
        entryPrice: t.entryPrice,
        initialStopLoss: t.initialStopLoss,
        exitOrCurrentPrice: livePx,
        qty: t.qty,
        applyFriction: true,
      });
      t.exitPrice = livePx;
      t.exitTimeIST = nowTimeIST;
      t.exitReason = 'EOD_SQUARE_OFF';
      t.grossPnl = grossPnl;
      t.pnl = netPnl;
      t.rMultiple = rMultiple;
      t.status = netPnl > 0 ? 'WIN' : netPnl < 0 ? 'LOSS' : 'BREAKEVEN';

      emitted.push({
        eventId: `evt-close-${t.id}-EOD_SQUARE_OFF`,
        eventType: 'AI_EXIT',
        dateIST: t.dateIST,
        timestampISO: nowISO,
        timeIST: nowTimeIST,
        symbol: t.symbol,
        side: t.side,
        strategy: t.strategy,
        price: livePx,
        entryPrice: t.entryPrice,
        stopLoss: t.stopLoss,
        targetPrice: t.targetPrice,
        qty: t.qty,
        rrMultiple: t.rrMultiple,
        pnl: netPnl,
        rMultiple,
        exitReason: 'EOD_SQUARE_OFF',
        daySlot: t.daySlot,
        dailyMaxTrades: state.config.dailyMaxTrades,
        thesis: t.thesis,
        beepCount: 5,
        shareText: buildShareAlertText({
          eventType: 'AI_EXIT',
          symbol: t.symbol,
          side: t.side,
          strategy: t.strategy,
          price: livePx,
          entryPrice: t.entryPrice,
          stopLoss: t.stopLoss,
          targetPrice: t.targetPrice,
          qty: t.qty,
          rrMultiple: t.rrMultiple,
          daySlot: t.daySlot,
          dailyMaxTrades: state.config.dailyMaxTrades,
          timeIST: nowTimeIST,
          dateIST: t.dateIST,
          pnl: netPnl,
          rMultiple,
          exitReason: 'EOD_SQUARE_OFF',
          thesis: t.thesis,
        }),
      });
      continue;
    }

    if (hitTrailTrigger) {
      t.trailLocked = true;
      t.stopLoss = t.trailLockPrice;
      t.status = 'TRAIL_LOCKED';
      emitted.push({
        eventId: `evt-trail-${t.id}`,
        eventType: 'AI_TRAIL_LOCK',
        dateIST: t.dateIST,
        timestampISO: nowISO,
        timeIST: nowTimeIST,
        symbol: t.symbol,
        side: t.side,
        strategy: t.strategy,
        price: livePx,
        entryPrice: t.entryPrice,
        stopLoss: t.stopLoss,
        targetPrice: t.targetPrice,
        qty: t.qty,
        rrMultiple: t.rrMultiple,
        daySlot: t.daySlot,
        dailyMaxTrades: state.config.dailyMaxTrades,
        thesis: t.thesis,
        beepCount: 5,
        shareText: buildShareAlertText({
          eventType: 'AI_TRAIL_LOCK',
          symbol: t.symbol,
          side: t.side,
          strategy: t.strategy,
          price: livePx,
          entryPrice: t.entryPrice,
          stopLoss: t.stopLoss,
          targetPrice: t.targetPrice,
          qty: t.qty,
          rrMultiple: t.rrMultiple,
          daySlot: t.daySlot,
          dailyMaxTrades: state.config.dailyMaxTrades,
          timeIST: nowTimeIST,
          dateIST: t.dateIST,
          thesis: t.thesis,
        }),
      });
    }

    const mtm = computeTradeNetPnlAndR({
      side: t.side,
      entryPrice: t.entryPrice,
      initialStopLoss: t.initialStopLoss,
      exitOrCurrentPrice: livePx,
      qty: t.qty,
      applyFriction: false,
    });
    t.grossPnl = mtm.grossPnl;
    t.pnl = mtm.netPnl;
    t.rMultiple = mtm.rMultiple;
  }

  return emitted;
}

export function selectDailyAiCandidates(params: {
  apexRows: ApexAlphaRow[];
  claudeFnoRows: ClaudeFnoRow[];
  mostActiveRows: MostActiveFnoRow[];
  existingTodaySymbols: Set<string>;
  existingSectorCounts: Map<string, number>;
  slotsRemaining: number;
  capital: number;
  riskPct: number;
  nowSecIST: number;
  allowSecondTierAfter1015: boolean;
  isMarketOffDay: boolean;
}): AiCandidateSignal[] {
  const {
    apexRows,
    claudeFnoRows,
    mostActiveRows,
    existingTodaySymbols,
    existingSectorCounts,
    slotsRemaining,
    capital,
    riskPct,
    nowSecIST,
    allowSecondTierAfter1015,
    isMarketOffDay,
  } = params;

  if (slotsRemaining <= 0) return [];

  const pool: AiCandidateSignal[] = [];
  const riskAmount = round2(capital * (riskPct / 100));

  const addApexCandidate = (r: ApexAlphaRow, tier: number) => {
    if (!r || !r.symbol || existingTodaySymbols.has(r.symbol)) return;
    if (r.entryPrice <= 0 || r.stopRiskPct < 0.25 || r.stopRiskPct > 2.0) return;
    const riskPerUnit = Math.max(0.05, r.side === 'BUY' ? r.entryPrice - r.stopLoss : r.stopLoss - r.entryPrice);
    const qty = r.positionSize > 0 ? r.positionSize : Math.max(1, Math.floor(riskAmount / riskPerUnit));
    const strategy =
      r.setupType === 'VWAP_COIL'
        ? 'Apex Alpha Coil (PF 1.87)'
        : r.setupType === 'PDH_RECLAIM' || r.setupType === 'PDL_BREAKDOWN'
          ? 'Apex Alpha Reclaim (PF 1.87)'
          : 'Apex Alpha 7/8 Confluence';

    pool.push({
      symbol: r.symbol,
      displayName: r.displayName || r.symbol,
      sector: r.sector || 'NSE F&O',
      side: r.side,
      strategy,
      aiScore: Math.round((r.score / 8) * 100),
      convictionLabel: `${r.score}/8 ${r.setupType.replace(/_/g, ' ')}`,
      entryPrice: round2(r.price > 0 ? r.price : r.entryPrice),
      stopLoss: round2(r.stopLoss),
      trailTriggerPrice: round2(r.trailTriggerPrice),
      trailLockPrice: round2(r.trailLockPrice),
      targetPrice: round2(r.targetPrice),
      rrMultiple: round2(r.rrMultiple),
      qty,
      riskAmount,
      entryTimeIST: r.listedAt || '09:35:00',
      thesis: `${r.setupLabel} · RS ${r.rsVsNifty >= 0 ? '+' : ''}${r.rsVsNifty}% vs NIFTY · Sector ${r.sectorChangePct >= 0 ? '+' : ''}${r.sectorChangePct}% · RVOL ${r.rvol5m}x · B/A ${r.bidAskRatio}x`,
      priorityTier: tier,
    });
  };

  // Tier 1: Exact 8/8 Qualified Apex Alpha setups (empirical #1 strategy)
  for (const r of apexRows) {
    if (r.isQualified) {
      addApexCandidate(r, 1);
    }
  }

  // Tier 2: High-conviction 7/8 Apex Alpha + Claude FNO / Most Active FNO after 10:15 IST (or Off-Day scan)
  const secondTierWindowOpen = isMarketOffDay || (allowSecondTierAfter1015 && nowSecIST >= 10 * 3600 + 15 * 60);
  if (secondTierWindowOpen) {
    for (const r of apexRows) {
      if (!r.isQualified && r.score >= 7 && r.stopRiskPct >= 0.3 && r.stopRiskPct <= 1.8) {
        addApexCandidate(r, 2);
      }
    }

    for (const c of claudeFnoRows) {
      if (!c || !c.symbol || c.category !== 'EQUITY_FNO' || existingTodaySymbols.has(c.symbol)) continue;
      const cEntry = Number(c.tradeMath?.entry || c.price || 0);
      const cSl = Number(c.tradeMath?.sl || 0);
      const cTarget = Number(c.tradeMath?.target || 0);
      if (!c.isQualifiedTrade || c.score < 8 || cEntry <= 0 || cSl <= 0 || cTarget <= 0) continue;
      const side: JournalTradeSide = 'BUY';
      const riskPerUnit = Math.max(0.05, cEntry - cSl);
      const stopPct = (riskPerUnit / cEntry) * 100;
      if (stopPct < 0.25 || stopPct > 2.2) continue;
      const rrMultiple = round2(Math.abs(cTarget - cEntry) / riskPerUnit);
      if (rrMultiple < 1.35) continue;
      const trailTriggerPrice = round2(cEntry + riskPerUnit * 0.9);
      const trailLockPrice = round2(cEntry + riskPerUnit * 0.15);
      const qty = Math.max(1, Math.floor(riskAmount / riskPerUnit));
      pool.push({
        symbol: c.symbol,
        displayName: c.displayName || c.symbol,
        sector: c.sector || 'NSE F&O',
        side,
        strategy: 'Claude FNO 10-Pt (PF 1.45)',
        aiScore: Math.round((c.score / 10) * 100),
        convictionLabel: `${c.score}/10 CLAUDE FNO`,
        entryPrice: round2(c.price > 0 ? c.price : cEntry),
        stopLoss: round2(cSl),
        trailTriggerPrice,
        trailLockPrice,
        targetPrice: round2(cTarget),
        rrMultiple,
        qty,
        riskAmount,
        entryTimeIST: c.listedAt || '10:15:00',
        thesis: `Claude FNO ${c.score}/10 (${c.cycleBuildup}) · Sector ${c.sectorChangePct >= 0 ? '+' : ''}${c.sectorChangePct}% · VolRatio ${round2(c.slotVolumeRatio || 1)}x · B/A ${c.bidAskRatio}x`,
        priorityTier: 3,
      });
    }

    for (const m of mostActiveRows) {
      if (!m || !m.symbol || m.category !== 'EQUITY_FNO' || existingTodaySymbols.has(m.symbol)) continue;
      if (!m.isFormulaQualified || m.formulaPassedCount < 6 || m.entryPrice <= 0 || m.stopLoss <= 0 || m.target1 <= 0) continue;
      const side: JournalTradeSide = m.direction === 'SELL' ? 'SELL' : 'BUY';
      const riskPerUnit = Math.max(0.05, side === 'BUY' ? m.entryPrice - m.stopLoss : m.stopLoss - m.entryPrice);
      const stopPct = (riskPerUnit / m.entryPrice) * 100;
      if (stopPct < 0.25 || stopPct > 2.2) continue;
      const rrMultiple = round2(Math.abs(m.target1 - m.entryPrice) / riskPerUnit);
      if (rrMultiple < 1.35) continue;
      const trailTriggerPrice = round2(
        side === 'BUY' ? m.entryPrice + riskPerUnit * 0.9 : Math.max(0.05, m.entryPrice - riskPerUnit * 0.9)
      );
      const trailLockPrice = round2(
        side === 'BUY' ? m.entryPrice + riskPerUnit * 0.15 : Math.max(0.05, m.entryPrice - riskPerUnit * 0.15)
      );
      const qty = Math.max(1, Math.floor(riskAmount / riskPerUnit));
      pool.push({
        symbol: m.symbol,
        displayName: m.displayName || m.symbol,
        sector: m.sector || 'NSE F&O',
        side,
        strategy: 'Most Active FNO (PF 1.41)',
        aiScore: Math.round((m.formulaPassedCount / 7) * 100),
        convictionLabel: `${m.formulaPassedCount}/7 MOST ACTIVE`,
        entryPrice: round2(m.price > 0 ? m.price : m.entryPrice),
        stopLoss: round2(m.stopLoss),
        trailTriggerPrice,
        trailLockPrice,
        targetPrice: round2(m.target1),
        rrMultiple,
        qty,
        riskAmount,
        entryTimeIST: m.listedAt || '10:15:00',
        thesis: `Most Active ${m.formulaPassedCount}/7 · ${m.actionBadge} · Turnover ₹${m.tradedValueCr}Cr · B/A ${m.bidAskRatio}x`,
        priorityTier: 4,
      });
    }
  }

  // Deduplicate by symbol keeping lowest priorityTier then highest aiScore
  const bestBySymbol = new Map<string, AiCandidateSignal>();
  for (const cand of pool) {
    const prev = bestBySymbol.get(cand.symbol);
    if (
      !prev ||
      cand.priorityTier < prev.priorityTier ||
      (cand.priorityTier === prev.priorityTier && cand.aiScore > prev.aiScore)
    ) {
      bestBySymbol.set(cand.symbol, cand);
    }
  }

  const ranked = Array.from(bestBySymbol.values()).sort((a, b) => {
    if (a.priorityTier !== b.priorityTier) return a.priorityTier - b.priorityTier;
    if (b.aiScore !== a.aiScore) return b.aiScore - a.aiScore;
    return b.rrMultiple - a.rrMultiple;
  });

  // Enforce sector cap of max 2 per sector per day first, then fill remaining if needed
  const chosen: AiCandidateSignal[] = [];
  const tempSec = new Map(existingSectorCounts);
  for (const cand of ranked) {
    if (chosen.length >= slotsRemaining) break;
    const sc = tempSec.get(cand.sector) || 0;
    if (sc < 2) {
      chosen.push(cand);
      tempSec.set(cand.sector, sc + 1);
    }
  }
  if (chosen.length < slotsRemaining) {
    const pickedSyms = new Set(chosen.map((c) => c.symbol));
    for (const cand of ranked) {
      if (chosen.length >= slotsRemaining) break;
      if (!pickedSyms.has(cand.symbol)) {
        chosen.push(cand);
        pickedSyms.add(cand.symbol);
      }
    }
  }
  return chosen;
}

export function computeJournalSummaryAndDays(
  trades: AiJournalTrade[],
  todayDateIST: string,
  dailyMaxTrades: number,
  capital: number
): {
  summary: AiJournalSummary;
  todayTrades: AiJournalTrade[];
  historyTrades: AiJournalTrade[];
  dailySummaries: AiDailySummaryRow[];
} {
  const sorted = [...trades].sort((a, b) => {
    if (b.dateIST !== a.dateIST) return b.dateIST.localeCompare(a.dateIST);
    if (b.daySlot !== a.daySlot) return b.daySlot - a.daySlot;
    return b.createdAtISO.localeCompare(a.createdAtISO);
  });

  const todayTrades = sorted.filter((t) => t.dateIST === todayDateIST);
  const historyTrades = sorted.filter((t) => t.dateIST !== todayDateIST);

  const closed = sorted.filter((t) => t.status === 'WIN' || t.status === 'LOSS' || t.status === 'BREAKEVEN');
  const open = sorted.filter((t) => t.status === 'OPEN' || t.status === 'TRAIL_LOCKED');

  const wins = closed.filter((t) => t.status === 'WIN').length;
  const losses = closed.filter((t) => t.status === 'LOSS').length;
  const breakevens = closed.filter((t) => t.status === 'BREAKEVEN').length;
  const winRatePct = closed.length > 0 ? round2((wins / closed.length) * 100) : 0;

  let grossWin = 0;
  let grossLoss = 0;
  let sumR = 0;
  for (const t of closed) {
    if (t.pnl > 0) grossWin += t.pnl;
    else if (t.pnl < 0) grossLoss += Math.abs(t.pnl);
    sumR += t.rMultiple || 0;
  }
  const profitFactor =
    grossLoss > 0 ? round2(grossWin / grossLoss) : grossWin > 0 ? 9.99 : 0;
  const avgRMultiple = closed.length > 0 ? round2(sumR / closed.length) : 0;

  // Max drawdown across chronological closed trades
  const chrono = [...closed].sort((a, b) => a.createdAtISO.localeCompare(b.createdAtISO));
  let equity = Math.max(10000, capital);
  let peak = equity;
  let maxDd = 0;
  for (const t of chrono) {
    equity += t.pnl;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDd) maxDd = dd;
  }

  const totalRealizedPnl = round2(closed.reduce((acc, t) => acc + (t.pnl || 0), 0));
  const todayClosed = todayTrades.filter((t) => t.status === 'WIN' || t.status === 'LOSS' || t.status === 'BREAKEVEN');
  const todayOpen = todayTrades.filter((t) => t.status === 'OPEN' || t.status === 'TRAIL_LOCKED');
  const todayRealizedPnl = round2(todayClosed.reduce((acc, t) => acc + (t.pnl || 0), 0));
  const todayOpenMtm = round2(todayOpen.reduce((acc, t) => acc + (t.pnl || 0), 0));
  const todayTotalPnl = round2(todayRealizedPnl + todayOpenMtm);

  const todayAiCount = todayTrades.filter((t) => t.source === 'AI_AUTO').length;
  const todayManualCount = todayTrades.filter((t) => t.source === 'MANUAL').length;
  const todayAiRemaining = Math.max(0, dailyMaxTrades - todayAiCount);

  // Per-day summary aggregation
  const byDay = new Map<string, AiJournalTrade[]>();
  for (const t of sorted) {
    const arr = byDay.get(t.dateIST) || [];
    arr.push(t);
    byDay.set(t.dateIST, arr);
  }
  const dailySummaries: AiDailySummaryRow[] = Array.from(byDay.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([dateIST, list]) => {
      const dClosed = list.filter((t) => t.status === 'WIN' || t.status === 'LOSS' || t.status === 'BREAKEVEN');
      const dWins = dClosed.filter((t) => t.status === 'WIN').length;
      const dLosses = dClosed.filter((t) => t.status === 'LOSS').length;
      const dPnl = round2(list.reduce((acc, t) => acc + (t.pnl || 0), 0));
      const dAvgR = dClosed.length > 0 ? round2(dClosed.reduce((a, t) => a + (t.rMultiple || 0), 0) / dClosed.length) : 0;
      return {
        dateIST,
        totalTrades: list.length,
        aiTrades: list.filter((t) => t.source === 'AI_AUTO').length,
        manualTrades: list.filter((t) => t.source === 'MANUAL').length,
        openTrades: list.filter((t) => t.status === 'OPEN' || t.status === 'TRAIL_LOCKED').length,
        wins: dWins,
        losses: dLosses,
        winRatePct: dClosed.length > 0 ? round2((dWins / dClosed.length) * 100) : 0,
        netPnl: dPnl,
        avgR: dAvgR,
      };
    });

  return {
    summary: {
      totalTrades: sorted.length,
      closedTrades: closed.length,
      openTrades: open.length,
      wins,
      losses,
      breakevens,
      winRatePct,
      profitFactor,
      totalRealizedPnl,
      todayRealizedPnl,
      todayOpenMtm,
      todayTotalPnl,
      avgRMultiple,
      maxDrawdownPct: round2(maxDd),
      todayAiCount,
      todayAiRemaining,
      todayManualCount,
    },
    todayTrades,
    historyTrades,
    dailySummaries,
  };
}

export class AiTradingJournalService {
  private storeFile: string;
  private state: AiJournalState;
  private lastScanMessage = 'AI Trading Journal ready — monitoring daily 5-trade BUY/SELL quota.';

  constructor(storeFile: string = DEFAULT_STORE_FILE) {
    this.storeFile = storeFile;
    this.state = this.loadState();
  }

  private loadState(): AiJournalState {
    try {
      if (fs.existsSync(this.storeFile)) {
        const parsed = JSON.parse(fs.readFileSync(this.storeFile, 'utf-8'));
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.trades)) {
          return {
            version: JOURNAL_STORE_VERSION,
            config: {
              ...createDefaultJournalState().config,
              ...(parsed.config || {}),
              soundBeepsCount: 5,
            },
            lastScanDateIST: String(parsed.lastScanDateIST || ''),
            lastScanTimeIST: String(parsed.lastScanTimeIST || ''),
            trades: parsed.trades,
            alertEvents: Array.isArray(parsed.alertEvents) ? parsed.alertEvents : [],
          };
        }
      }
    } catch {
      // Fall back cleanly
    }
    return createDefaultJournalState();
  }

  private saveState() {
    try {
      fs.writeFileSync(this.storeFile, JSON.stringify(this.state, null, 2));
    } catch {
      // Non-fatal
    }
  }

  public getConfig(): AiJournalConfig {
    return { ...this.state.config };
  }

  public updateConfig(patch: Partial<AiJournalConfig>): AiJournalConfig {
    const next = { ...this.state.config };
    if (typeof patch.autoAiEnabled === 'boolean') next.autoAiEnabled = patch.autoAiEnabled;
    if (patch.dailyMaxTrades !== undefined) {
      next.dailyMaxTrades = Math.max(1, Math.min(10, Math.round(Number(patch.dailyMaxTrades) || 5)));
    }
    if (patch.capital !== undefined) {
      next.capital = Math.max(5000, Number(patch.capital) || 100000);
    }
    if (patch.riskPct !== undefined) {
      next.riskPct = Math.max(0.25, Math.min(10, Number(patch.riskPct) || 1.0));
    }
    if (typeof patch.allowSecondTierAfter1015 === 'boolean') {
      next.allowSecondTierAfter1015 = patch.allowSecondTierAfter1015;
    }
    next.soundBeepsCount = 5;
    this.state.config = next;
    this.saveState();
    return { ...next };
  }

  private pushAlertEvents(events: AiTradeAlertEvent[]) {
    if (events.length === 0) return;
    const seenIds = new Set(this.state.alertEvents.map((e) => e.eventId));
    const fresh = events.filter((e) => !seenIds.has(e.eventId));
    if (fresh.length === 0) return;
    this.state.alertEvents = [...fresh.reverse(), ...this.state.alertEvents].slice(0, 120);
  }

  public syncWithMarket(params: {
    stocks: ScannedStock[];
    getExtendedBarsFn: (sym: string) => IntradayCandleBar[] | undefined;
    candlesMap: Map<string, Candle[]>;
    indexQuotes?: Record<string, UnifiedMarketQuote>;
    isMidnightCleared: boolean;
    isMarketOffDay: boolean;
    forceScan?: boolean;
  }): { report: AiJournalReport; newEvents: AiTradeAlertEvent[] } {
    const ist = getISTDateParts();
    const nowSecIST = parseClockToSec(ist.timeStr);
    const nowISO = new Date().toISOString();

    const priceLookup = new Map<string, number>();
    for (const s of params.stocks) {
      if (s && s.symbol && s.price > 0) {
        priceLookup.set(s.symbol, Number(s.price));
      }
    }

    const newEvents: AiTradeAlertEvent[] = [];

    // 1. Archive & close any unclosed trades from prior dates
    const carriedEvents = closeExpiredPreviousDayTrades(this.state, ist.dateStr, priceLookup, nowISO);
    newEvents.push(...carriedEvents);

    // 2. Update live MTM, Trail Lock (+0.90R -> +0.15R), Target, SL, and 15:20 EOD Square-off
    if (!params.isMidnightCleared && params.stocks.length > 0) {
      const mtmEvents = updateOpenJournalTrades({
        state: this.state,
        todayDateIST: ist.dateStr,
        nowTimeIST: ist.timeStr,
        nowSecIST,
        isMarketOffDay: params.isMarketOffDay,
        priceLookup,
        nowISO,
      });
      newEvents.push(...mtmEvents);
    }

    // 3. Auto AI Daily 5-Stock Entry Execution
    const todayAiTrades = this.state.trades.filter(
      (t) => t.dateIST === ist.dateStr && t.source === 'AI_AUTO'
    );
    const slotsRemaining = Math.max(0, this.state.config.dailyMaxTrades - todayAiTrades.length);
    const entryWindowOpen =
      params.isMarketOffDay || (nowSecIST >= 9 * 3600 + 25 * 60 && nowSecIST <= 14 * 3600 + 45 * 60);

    if (
      !params.isMidnightCleared &&
      params.stocks.length > 0 &&
      (this.state.config.autoAiEnabled || params.forceScan) &&
      slotsRemaining > 0 &&
      (entryWindowOpen || params.forceScan)
    ) {
      const apexReport = buildApexAlphaReport({
        stocks: params.stocks,
        getExtendedBarsFn: params.getExtendedBarsFn,
        candlesMap: params.candlesMap,
        indexQuotes: params.indexQuotes,
        isMidnightCleared: false,
        isMarketOffDay: params.isMarketOffDay,
        capital: this.state.config.capital,
        riskPct: this.state.config.riskPct,
      });

      const vixVal = Number(params.indexQuotes?.['INDIAVIX']?.lp || 15);
      const safeExtBars = (sym: string) => params.getExtendedBarsFn(sym) || [];

      const claudeReport = buildClaudeFnoReport({
        stocks: params.stocks,
        getExtendedBarsFn: safeExtBars,
        candlesMap: params.candlesMap,
        indexQuotes: params.indexQuotes,
        optionChainsByIndex: {},
        indiaVix: vixVal,
        isMidnightCleared: false,
        isMarketOffDay: params.isMarketOffDay,
        capital: this.state.config.capital,
      });

      const mostActiveReport = buildMostActiveFnoReport({
        stocks: params.stocks,
        getExtendedBarsFn: safeExtBars,
        candlesMap: params.candlesMap,
        indexQuotes: params.indexQuotes,
        optionChainsByIndex: {},
        indiaVix: vixVal,
        isMidnightCleared: false,
        isMarketOffDay: params.isMarketOffDay,
      });

      const apexAll: ApexAlphaRow[] = [
        ...apexReport.categories.qualifiedAlpha,
        ...apexReport.categories.buySetups,
        ...apexReport.categories.sellSetups,
      ];
      const claudeAll: ClaudeFnoRow[] = [
        ...(claudeReport.categories?.qualifiedTrades || []),
        ...(claudeReport.categories?.equitiesFno || []),
      ];
      const mostActiveAll: MostActiveFnoRow[] = [
        ...(mostActiveReport.categories?.mostActiveEquities || []),
        ...(mostActiveReport.categories?.rankedEquities || []),
      ];

      const existingTodaySymbols = new Set(
        this.state.trades.filter((t) => t.dateIST === ist.dateStr).map((t) => t.symbol)
      );
      const existingSectorCounts = new Map<string, number>();
      for (const t of todayAiTrades) {
        existingSectorCounts.set(t.sector, (existingSectorCounts.get(t.sector) || 0) + 1);
      }

      const picks = selectDailyAiCandidates({
        apexRows: apexAll,
        claudeFnoRows: claudeAll,
        mostActiveRows: mostActiveAll,
        existingTodaySymbols,
        existingSectorCounts,
        slotsRemaining,
        capital: this.state.config.capital,
        riskPct: this.state.config.riskPct,
        nowSecIST,
        allowSecondTierAfter1015: this.state.config.allowSecondTierAfter1015 || Boolean(params.forceScan),
        isMarketOffDay: params.isMarketOffDay,
      });

      let nextSlot = todayAiTrades.length + 1;
      for (const p of picks) {
        const tradeId = `ai-${ist.dateStr}-${p.symbol}-${p.side}-${nextSlot}`;
        const trade: AiJournalTrade = {
          id: tradeId,
          dateIST: ist.dateStr,
          daySlot: nextSlot,
          source: 'AI_AUTO',
          strategy: p.strategy,
          symbol: p.symbol,
          displayName: p.displayName,
          sector: p.sector,
          side: p.side,
          aiScore: p.aiScore,
          convictionLabel: p.convictionLabel,
          entryTimeIST: ist.timeStr,
          entryPrice: p.entryPrice,
          stopLoss: p.stopLoss,
          initialStopLoss: p.stopLoss,
          trailTriggerPrice: p.trailTriggerPrice,
          trailLockPrice: p.trailLockPrice,
          trailLocked: false,
          targetPrice: p.targetPrice,
          rrMultiple: p.rrMultiple,
          qty: p.qty,
          riskAmount: p.riskAmount,
          currentPrice: p.entryPrice,
          highWatermark: p.entryPrice,
          lowWatermark: p.entryPrice,
          status: 'OPEN',
          grossPnl: 0,
          pnl: 0,
          rMultiple: 0,
          thesis: p.thesis,
          createdAtISO: nowISO,
          updatedAtISO: nowISO,
        };
        this.state.trades.unshift(trade);
        const evt: AiTradeAlertEvent = {
          eventId: `evt-entry-${tradeId}`,
          eventType: 'AI_ENTRY',
          dateIST: ist.dateStr,
          timestampISO: nowISO,
          timeIST: ist.timeStr,
          symbol: trade.symbol,
          side: trade.side,
          strategy: trade.strategy,
          price: trade.entryPrice,
          entryPrice: trade.entryPrice,
          stopLoss: trade.stopLoss,
          targetPrice: trade.targetPrice,
          qty: trade.qty,
          rrMultiple: trade.rrMultiple,
          daySlot: trade.daySlot,
          dailyMaxTrades: this.state.config.dailyMaxTrades,
          thesis: trade.thesis,
          beepCount: 5,
          shareText: buildShareAlertText({
            eventType: 'AI_ENTRY',
            symbol: trade.symbol,
            side: trade.side,
            strategy: trade.strategy,
            price: trade.entryPrice,
            entryPrice: trade.entryPrice,
            stopLoss: trade.stopLoss,
            targetPrice: trade.targetPrice,
            qty: trade.qty,
            rrMultiple: trade.rrMultiple,
            daySlot: trade.daySlot,
            dailyMaxTrades: this.state.config.dailyMaxTrades,
            timeIST: ist.timeStr,
            dateIST: ist.dateStr,
            thesis: trade.thesis,
          }),
        };
        newEvents.push(evt);
        nextSlot += 1;
      }

      this.state.lastScanDateIST = ist.dateStr;
      this.state.lastScanTimeIST = ist.timeStr;
      this.lastScanMessage =
        picks.length > 0
          ? `AI executed ${picks.length} new trade(s) today (${todayAiTrades.length + picks.length}/${this.state.config.dailyMaxTrades} daily slots used).`
          : `AI scanned 218 F&O stocks (${todayAiTrades.length}/${this.state.config.dailyMaxTrades} daily slots used) — waiting for qualifying high-R:R setups.`;
    } else if (params.isMidnightCleared) {
      this.lastScanMessage = `Midnight Auto-Flush active — Daily 5-stock AI Journal armed for 09:25 AM IST market open (${todayAiTrades.length}/${this.state.config.dailyMaxTrades} used).`;
    } else if (slotsRemaining === 0) {
      this.lastScanMessage = `Daily AI quota complete (${this.state.config.dailyMaxTrades}/${this.state.config.dailyMaxTrades} trades logged today) — managing open MTM & Trail Locks.`;
    }

    this.pushAlertEvents(newEvents);
    if (newEvents.length > 0 || !params.isMidnightCleared) {
      this.saveState();
    }

    return {
      report: this.getReport(params.isMidnightCleared, params.isMarketOffDay),
      newEvents,
    };
  }

  public addManualTrade(input: {
    symbol: string;
    side: JournalTradeSide;
    entryPrice: number;
    stopLoss: number;
    targetPrice: number;
    qty?: number;
    setup?: string;
    sector?: string;
    thesis?: string;
  }): { trade: AiJournalTrade; event: AiTradeAlertEvent; report: AiJournalReport } {
    const ist = getISTDateParts();
    const nowISO = new Date().toISOString();
    const symbol = String(input.symbol || '').trim().toUpperCase();
    const side: JournalTradeSide = input.side === 'SELL' ? 'SELL' : 'BUY';
    const entryPrice = round2(Number(input.entryPrice));
    const stopLoss = round2(Number(input.stopLoss));
    const targetPrice = round2(Number(input.targetPrice));

    if (!symbol) throw new Error('Symbol is required');
    if (!(entryPrice > 0) || !(stopLoss > 0) || !(targetPrice > 0)) {
      throw new Error('Entry, Stop Loss, and Target prices must be positive numbers');
    }
    if (side === 'BUY' && (stopLoss >= entryPrice || targetPrice <= entryPrice)) {
      throw new Error('For BUY trade: Stop Loss must be below Entry and Target above Entry');
    }
    if (side === 'SELL' && (stopLoss <= entryPrice || targetPrice >= entryPrice)) {
      throw new Error('For SELL trade: Stop Loss must be above Entry and Target below Entry');
    }

    const riskPerUnit = Math.max(0.05, side === 'BUY' ? entryPrice - stopLoss : stopLoss - entryPrice);
    const riskAmount = round2(this.state.config.capital * (this.state.config.riskPct / 100));
    const qty = Math.max(1, Math.round(Number(input.qty) || Math.floor(riskAmount / riskPerUnit)));
    const rrMultiple = round2(Math.abs(targetPrice - entryPrice) / riskPerUnit);
    const trailTriggerPrice = round2(
      side === 'BUY' ? entryPrice + riskPerUnit * 0.9 : Math.max(0.05, entryPrice - riskPerUnit * 0.9)
    );
    const trailLockPrice = round2(
      side === 'BUY' ? entryPrice + riskPerUnit * 0.15 : Math.max(0.05, entryPrice - riskPerUnit * 0.15)
    );
    const id = `manual-${ist.dateStr}-${symbol}-${side}-${Date.now()}`;
    const strategy = String(input.setup || 'Manual Journal Trade').trim();
    const thesis = String(
      input.thesis || `Manual ${side} setup logged at ₹${entryPrice} (SL ₹${stopLoss}, Target ₹${targetPrice})`
    ).trim();

    const trade: AiJournalTrade = {
      id,
      dateIST: ist.dateStr,
      daySlot: 0,
      source: 'MANUAL',
      strategy,
      symbol,
      displayName: symbol,
      sector: String(input.sector || 'NSE F&O'),
      side,
      aiScore: 100,
      convictionLabel: 'MANUAL ENTRY',
      entryTimeIST: ist.timeStr,
      entryPrice,
      stopLoss,
      initialStopLoss: stopLoss,
      trailTriggerPrice,
      trailLockPrice,
      trailLocked: false,
      targetPrice,
      rrMultiple,
      qty,
      riskAmount: round2(riskPerUnit * qty),
      currentPrice: entryPrice,
      highWatermark: entryPrice,
      lowWatermark: entryPrice,
      status: 'OPEN',
      grossPnl: 0,
      pnl: 0,
      rMultiple: 0,
      thesis,
      createdAtISO: nowISO,
      updatedAtISO: nowISO,
    };

    const event: AiTradeAlertEvent = {
      eventId: `evt-entry-${id}`,
      eventType: 'AI_ENTRY',
      dateIST: ist.dateStr,
      timestampISO: nowISO,
      timeIST: ist.timeStr,
      symbol,
      side,
      strategy,
      price: entryPrice,
      entryPrice,
      stopLoss,
      targetPrice,
      qty,
      rrMultiple,
      daySlot: 0,
      dailyMaxTrades: this.state.config.dailyMaxTrades,
      thesis,
      beepCount: 5,
      shareText: buildShareAlertText({
        eventType: 'AI_ENTRY',
        symbol,
        side,
        strategy,
        price: entryPrice,
        entryPrice,
        stopLoss,
        targetPrice,
        qty,
        rrMultiple,
        daySlot: 0,
        dailyMaxTrades: this.state.config.dailyMaxTrades,
        timeIST: ist.timeStr,
        dateIST: ist.dateStr,
        thesis,
      }),
    };

    this.state.trades.unshift(trade);
    this.pushAlertEvents([event]);
    this.saveState();
    return {
      trade,
      event,
      report: this.getReport(false, false),
    };
  }

  public closeTradeManually(
    tradeId: string,
    exitPrice?: number
  ): { trade: AiJournalTrade; event: AiTradeAlertEvent; report: AiJournalReport } {
    const trade = this.state.trades.find((t) => t.id === tradeId);
    if (!trade) throw new Error(`Trade not found: ${tradeId}`);
    if (trade.status !== 'OPEN' && trade.status !== 'TRAIL_LOCKED') {
      throw new Error('Trade is already closed');
    }

    const ist = getISTDateParts();
    const nowISO = new Date().toISOString();
    const closePx = round2(Number(exitPrice) > 0 ? Number(exitPrice) : trade.currentPrice || trade.entryPrice);
    const { grossPnl, netPnl, rMultiple } = computeTradeNetPnlAndR({
      side: trade.side,
      entryPrice: trade.entryPrice,
      initialStopLoss: trade.initialStopLoss,
      exitOrCurrentPrice: closePx,
      qty: trade.qty,
      applyFriction: true,
    });

    trade.currentPrice = closePx;
    trade.exitPrice = closePx;
    trade.exitTimeIST = ist.timeStr;
    trade.exitReason = 'MANUAL_CLOSE';
    trade.grossPnl = grossPnl;
    trade.pnl = netPnl;
    trade.rMultiple = rMultiple;
    trade.status = netPnl > 0 ? 'WIN' : netPnl < 0 ? 'LOSS' : 'BREAKEVEN';
    trade.updatedAtISO = nowISO;

    const event: AiTradeAlertEvent = {
      eventId: `evt-close-${trade.id}-MANUAL_CLOSE`,
      eventType: 'AI_EXIT',
      dateIST: trade.dateIST,
      timestampISO: nowISO,
      timeIST: ist.timeStr,
      symbol: trade.symbol,
      side: trade.side,
      strategy: trade.strategy,
      price: closePx,
      entryPrice: trade.entryPrice,
      stopLoss: trade.stopLoss,
      targetPrice: trade.targetPrice,
      qty: trade.qty,
      rrMultiple: trade.rrMultiple,
      pnl: netPnl,
      rMultiple,
      exitReason: 'MANUAL_CLOSE',
      daySlot: trade.daySlot,
      dailyMaxTrades: this.state.config.dailyMaxTrades,
      thesis: trade.thesis,
      beepCount: 5,
      shareText: buildShareAlertText({
        eventType: 'AI_EXIT',
        symbol: trade.symbol,
        side: trade.side,
        strategy: trade.strategy,
        price: closePx,
        entryPrice: trade.entryPrice,
        stopLoss: trade.stopLoss,
        targetPrice: trade.targetPrice,
        qty: trade.qty,
        rrMultiple: trade.rrMultiple,
        daySlot: trade.daySlot,
        dailyMaxTrades: this.state.config.dailyMaxTrades,
        timeIST: ist.timeStr,
        dateIST: trade.dateIST,
        pnl: netPnl,
        rMultiple,
        exitReason: 'MANUAL_CLOSE',
        thesis: trade.thesis,
      }),
    };

    this.pushAlertEvents([event]);
    this.saveState();
    return {
      trade,
      event,
      report: this.getReport(false, false),
    };
  }

  public deleteTrade(tradeId: string): AiJournalReport {
    this.state.trades = this.state.trades.filter((t) => t.id !== tradeId);
    this.saveState();
    return this.getReport(false, false);
  }

  public getReport(isMidnightCleared: boolean, isMarketOffDay: boolean): AiJournalReport {
    const ist = getISTDateParts();
    const agg = computeJournalSummaryAndDays(
      this.state.trades,
      ist.dateStr,
      this.state.config.dailyMaxTrades,
      this.state.config.capital
    );

    return {
      status: 'ok',
      dateIST: ist.dateStr,
      istTime: `${ist.timeStr} IST`,
      isMidnightCleared,
      isMarketOffDay,
      config: { ...this.state.config },
      summary: agg.summary,
      todayTrades: agg.todayTrades,
      historyTrades: agg.historyTrades,
      dailySummaries: agg.dailySummaries,
      recentAlerts: this.state.alertEvents.slice(0, 30),
      lastScanMessage: this.lastScanMessage,
    };
  }
}

export const aiTradingJournalService = new AiTradingJournalService();
