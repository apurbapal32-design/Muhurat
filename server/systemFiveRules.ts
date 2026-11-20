import { getISTDateParts } from '../src/data/marketSchedule';

/**
 * IMMUTABLE & LOCKED 5 CORE SYSTEM RULES
 * Do not weaken or override these thresholds anywhere in the codebase.
 */
export const LOCKED_SYSTEM_RULES = Object.freeze({
  VERSION: '5.0-LOCKED',
  LOCKED: true as const,

  // RULE 1: Scan Window 09:20:00 -> 15:15:00 IST every market day; Auto-Flush & Empty at 23:59:00 IST same night
  SCAN_START_IST: '09:20:00',
  SCAN_START_SEC: 9 * 3600 + 20 * 60, // 09:20:00 IST
  SCAN_END_IST: '15:15:00',
  SCAN_END_SEC: 15 * 3600 + 15 * 60, // 15:15:00 IST
  DAILY_FLUSH_IST: '23:59:00',
  DAILY_FLUSH_SEC: 23 * 3600 + 59 * 60, // 23:59:00 IST (11:59 PM same night)

  // RULE 2: Best 10 Momentum & Performance UP + Best 10 DOWN strictly per formula (0..10, ZERO fake signals)
  MAX_STOCKS_PER_DIRECTION: 10,
  ZERO_FAKE_SIGNALS: true as const,

  // RULE 3: Universal Formula Gates across every scanner
  // RVOL above 2.00 + Volume Bazaar X-Time Volume above 1.00X (+ ADX >= 25.0)
  MIN_RVOL_STRICT: 2.0,
  MIN_VOL_BAZAAR_XTIME_STRICT: 1.0,
  MIN_ADX: 25.0,

  // RULE 4: Same-day permanent sticky lock (never remove listed stock until 23:59 IST) + LISTED AT Z -> A category-wise
  STICKY_LOCK_UNTIL_FLUSH: true as const,
  SORT_ORDER: 'LISTED_AT_DESC_Z_TO_A' as const,

  // RULE 5: Live Price Data Management via Upstox API
  LIVE_DATA_PROVIDER: 'UPSTOX_API' as const,
});

export type SessionPhase =
  | 'FLUSHED_EMPTY'        // 23:59:00 - 23:59:59 IST or 00:00:00 - 09:19:59 IST on trading day
  | 'LIVE_SCAN_OPEN'       // 09:20:00 - 15:15:00 IST on market day
  | 'POST_SCAN_LOCKED'     // 15:15:01 - 23:58:59 IST on market day (listed stocks stay locked & visible until 23:59)
  | 'OFF_DAY_BROKER_SCAN'; // Weekend/Holiday before 23:59:00 IST (last market session 09:20-15:15 snapshot, flushes at 23:59)

export interface LockedSessionWindowStatus {
  dateIST: string;
  timeIST: string;
  weekday: string;
  secFromMidnight: number;
  phase: SessionPhase;
  /** True during 23:59:00-23:59:59 IST (every day) AND 00:00:00-09:19:59 IST on regular trading days */
  isFlushCleared: boolean;
  /** True strictly during 09:20:00 - 15:15:00 IST on a market trading day */
  isLiveScanWindow: boolean;
  /** True after 15:15:00 IST and before 23:59:00 IST (already-listed stocks stay locked on dashboard) */
  isPostScanLocked: boolean;
  /** True when intraday 15:15 IST square-off alert applies */
  isSquareOffReached: boolean;
  isMarketOffDay: boolean;
  phaseLabel: string;
  nextEventLabel: string;
}

/**
 * Evaluates the exact Rule 1 session state at any timestamp in Asia/Kolkata (IST).
 *
 * Timeline (IST):
 * - 00:00:00 -> 09:19:59 (Market Day): FLUSHED_EMPTY (all scanners 0 rows, awaiting 09:20 AM auto-start)
 * - 09:20:00 -> 15:15:00 (Market Day): LIVE_SCAN_OPEN (admitting Best 10 UP & Best 10 DOWN)
 * - 15:15:01 -> 23:58:59 (Market Day): POST_SCAN_LOCKED (listed stocks remain locked & visible, no late removals)
 * - 23:59:00 -> 23:59:59 (Every Day):  FLUSHED_EMPTY (11:59 PM Auto-Flush empties ALL scanners)
 */
export function getLockedSessionWindowStatus(
  now: Date = new Date(),
  isMarketOffDay: boolean = false
): LockedSessionWindowStatus {
  const ist = getISTDateParts(now);
  const secFromMidnight = ist.hour * 3600 + ist.minute * 60 + ist.second;

  // 11:59:00 PM - 11:59:59 PM IST: Hard daily auto-flush EVERY day (Rule 1)
  if (secFromMidnight >= LOCKED_SYSTEM_RULES.DAILY_FLUSH_SEC) {
    return {
      dateIST: ist.dateStr,
      timeIST: ist.timeStr,
      weekday: ist.weekday,
      secFromMidnight,
      phase: 'FLUSHED_EMPTY',
      isFlushCleared: true,
      isLiveScanWindow: false,
      isPostScanLocked: false,
      isSquareOffReached: true,
      isMarketOffDay,
      phaseLabel: '11:59 PM AUTO-FLUSH • ALL SCANNERS EMPTIED',
      nextEventLabel: 'Next Market Day Auto-Scan at 09:20:00 IST',
    };
  }

  // Weekend / Market Holiday / Special Off-Day prior to 23:59:00 IST
  if (isMarketOffDay) {
    return {
      dateIST: ist.dateStr,
      timeIST: ist.timeStr,
      weekday: ist.weekday,
      secFromMidnight,
      phase: 'OFF_DAY_BROKER_SCAN',
      isFlushCleared: false,
      isLiveScanWindow: false,
      isPostScanLocked: true,
      isSquareOffReached: false,
      isMarketOffDay: true,
      phaseLabel: 'MARKET OFF-DAY • UPSTOX LAST-SESSION SNAPSHOT (09:20–15:15)',
      nextEventLabel: 'Auto-Flush at 23:59:00 IST • Next Market Scan 09:20:00 IST',
    };
  }

  // Regular Market Day: 00:00:00 -> 09:19:59 IST stays EMPTY awaiting 09:20:00 IST start
  if (secFromMidnight < LOCKED_SYSTEM_RULES.SCAN_START_SEC) {
    return {
      dateIST: ist.dateStr,
      timeIST: ist.timeStr,
      weekday: ist.weekday,
      secFromMidnight,
      phase: 'FLUSHED_EMPTY',
      isFlushCleared: true,
      isLiveScanWindow: false,
      isPostScanLocked: false,
      isSquareOffReached: false,
      isMarketOffDay: false,
      phaseLabel: 'PRE-SCAN STANDBY • EMPTY UNTIL 09:20:00 IST',
      nextEventLabel: 'Live Formula Scan Starts at 09:20:00 IST',
    };
  }

  // Regular Market Day: 09:20:00 -> 15:15:00 IST LIVE SCAN WINDOW
  if (secFromMidnight <= LOCKED_SYSTEM_RULES.SCAN_END_SEC) {
    return {
      dateIST: ist.dateStr,
      timeIST: ist.timeStr,
      weekday: ist.weekday,
      secFromMidnight,
      phase: 'LIVE_SCAN_OPEN',
      isFlushCleared: false,
      isLiveScanWindow: true,
      isPostScanLocked: false,
      isSquareOffReached: secFromMidnight === LOCKED_SYSTEM_RULES.SCAN_END_SEC,
      isMarketOffDay: false,
      phaseLabel: 'LIVE SCAN ACTIVE (09:20 AM – 03:15 PM IST)',
      nextEventLabel: 'Intraday Scan Cutoff at 15:15:00 IST • Flush at 23:59:00 IST',
    };
  }

  // Regular Market Day: 15:15:01 -> 23:58:59 IST POST-SCAN LOCKED (visible until 11:59 PM flush)
  return {
    dateIST: ist.dateStr,
    timeIST: ist.timeStr,
    weekday: ist.weekday,
    secFromMidnight,
    phase: 'POST_SCAN_LOCKED',
    isFlushCleared: false,
    isLiveScanWindow: false,
    isPostScanLocked: true,
    isSquareOffReached: true,
    isMarketOffDay: false,
    phaseLabel: 'POST-SCAN LOCKED (03:15 PM CUTOFF • VISIBLE UNTIL 11:59 PM IST)',
    nextEventLabel: 'Auto-Flush & Clear ALL Scanners at 23:59:00 IST',
  };
}

/**
 * Parses HH:MM or HH:MM:SS to seconds from midnight. Returns 0 if invalid.
 */
export function parseTimeISTToSec(timeStr: string | undefined | null): number {
  if (!timeStr || typeof timeStr !== 'string') return 0;
  const trimmed = timeStr.trim();
  if (!trimmed || trimmed === '--' || trimmed === '--:--:--') return 0;
  const m = trimmed.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return 0;
  const h = parseInt(m[1], 10) || 0;
  const min = parseInt(m[2], 10) || 0;
  const sec = parseInt(m[3] || '0', 10) || 0;
  if (h < 0 || h > 23 || min < 0 || min > 59 || sec < 0 || sec > 59) return 0;
  return h * 3600 + min * 60 + sec;
}

/**
 * Checks whether a candle/signal IST timestamp falls strictly within Rule 1's 09:20:00 - 15:15:00 scan window.
 */
export function isTimeWithinScanWindow(timeStr: string | undefined | null): boolean {
  const sec = parseTimeISTToSec(timeStr);
  return (
    sec >= LOCKED_SYSTEM_RULES.SCAN_START_SEC &&
    sec <= LOCKED_SYSTEM_RULES.SCAN_END_SEC
  );
}

/**
 * Rule 3 Strict Formula Gate Check:
 * - RVOL strictly ABOVE 2.00 (> 2.00)
 * - Volume Bazaar X-Time Volume strictly ABOVE 1.00X (> 1.00)
 * - Wilder's ADX(14) >= 25.0 (when enforced)
 */
export function passesRule3Thresholds(
  rvol: number,
  xTimeVolume: number,
  adx: number,
  requireAdx: boolean = true
): {
  strongRvolPassed: boolean;
  strongXTimeVolPassed: boolean;
  adxPassed: boolean;
  passedAll: boolean;
} {
  const safeRvol = Number.isFinite(rvol) ? rvol : 0;
  const safeXTime = Number.isFinite(xTimeVolume) ? xTimeVolume : 0;
  const safeAdx = Number.isFinite(adx) ? adx : 0;

  const strongRvolPassed = safeRvol > LOCKED_SYSTEM_RULES.MIN_RVOL_STRICT;
  const strongXTimeVolPassed = safeXTime > LOCKED_SYSTEM_RULES.MIN_VOL_BAZAAR_XTIME_STRICT;
  const adxPassed = !requireAdx || safeAdx >= LOCKED_SYSTEM_RULES.MIN_ADX;

  return {
    strongRvolPassed,
    strongXTimeVolPassed,
    adxPassed,
    passedAll: strongRvolPassed && strongXTimeVolPassed && adxPassed,
  };
}

export function getLockedRulesDescriptorList() {
  return [
    {
      id: 1,
      code: 'RULE_1_SCHEDULE',
      title: '09:20 AM – 03:15 PM Scan • 11:59 PM Auto-Flush',
      detail: 'All scanners auto-start every market day at 09:20:00 IST, stop admitting new trades at 15:15:00 IST, and empty ALL stocks at 23:59:00 IST.',
      locked: true,
    },
    {
      id: 2,
      code: 'RULE_2_BEST_10',
      title: 'Best 10 UP & Best 10 DOWN • Zero Fake Signals',
      detail: 'Every scanner displays strictly 0 to 10 formula-eligible momentum/performance stocks per direction (1 eligible = 1 shown, 7 eligible = 7 shown, max 10).',
      locked: true,
    },
    {
      id: 3,
      code: 'RULE_3_RVOL_VOLBAZAAR',
      title: 'RVOL > 2.00 • Vol Bazaar X-Time > 1.00X • ADX 25+',
      detail: 'Universal institutional liquidity & trend strength formula gate applied across every scanner.',
      locked: true,
    },
    {
      id: 4,
      code: 'RULE_4_STICKY_ZTOA',
      title: 'Permanent Same-Day Lock • LISTED AT Z → A',
      detail: 'Once listed on the dashboard, a stock is NEVER removed until 23:59:00 IST flush. Sorted strictly LISTED AT newest-first + Z → A per category.',
      locked: true,
    },
    {
      id: 5,
      code: 'RULE_5_UPSTOX_API',
      title: 'Upstox API Primary Live Price Management',
      detail: 'Real-time LTP, 5m candles, VWAP, volume, and option chain powered by Upstox API v2/v3 with seamless health monitoring.',
      locked: true,
    },
  ];
}
