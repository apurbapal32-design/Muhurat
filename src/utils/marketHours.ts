/**
 * Indian Stock Market (NSE/BSE) Hours Validation Helper
 * Validates if the current time is within official intraday trading hours:
 * 09:15 to 15:30 IST (Asia/Kolkata), Monday through Friday.
 */

import { calculateMarketStatus } from '../data/marketSchedule';

export interface MarketHoursStatus {
  isMarketHours: boolean;
  istTime: string;
  weekday: string;
  sessionState: 'REGULAR_HOURS' | 'PRE_OPEN' | 'POST_MARKET' | 'CLOSED_WEEKEND' | 'CLOSED_HOLIDAY' | 'CLOSED_AFTER_HOURS';
  reason?: string;
  statusLabel?: string;
}

/**
 * Returns true if current time is within 09:15 - 15:30 IST on a Monday-Friday trading day (and not a market holiday).
 */
export function isMarketHours(date: Date = new Date()): boolean {
  try {
    const status = calculateMarketStatus(undefined, undefined, date);
    return status.isOpen;
  } catch {
    // Fallback using UTC + 5:30 offset
    const utcTime = date.getTime() + date.getTimezoneOffset() * 60000;
    const istDate = new Date(utcTime + 5.5 * 3600000);
    const day = istDate.getDay();
    if (day === 0 || day === 6) return false;
    const minutes = istDate.getHours() * 60 + istDate.getMinutes();
    return minutes >= 9 * 60 + 15 && minutes <= 15 * 60 + 30;
  }
}

/**
 * Detailed diagnostics on market hours status
 */
export function getMarketHoursDiagnostics(date: Date = new Date()): MarketHoursStatus {
  try {
    const status = calculateMarketStatus(undefined, undefined, date);
    let sessionState: MarketHoursStatus['sessionState'] = 'CLOSED_AFTER_HOURS';

    if (status.session === 'REGULAR') sessionState = 'REGULAR_HOURS';
    else if (status.session === 'PRE_OPEN') sessionState = 'PRE_OPEN';
    else if (status.session === 'POST_MARKET') sessionState = 'POST_MARKET';
    else if (status.session === 'CLOSED_WEEKEND') sessionState = 'CLOSED_WEEKEND';
    else if (status.session === 'CLOSED_HOLIDAY') sessionState = 'CLOSED_HOLIDAY';

    return {
      isMarketHours: status.isOpen,
      istTime: status.currentISTTime,
      weekday: status.currentDate,
      sessionState,
      statusLabel: status.statusLabel,
      reason: status.timeMessage,
    };
  } catch {
    const active = isMarketHours(date);
    return {
      isMarketHours: active,
      istTime: date.toISOString(),
      weekday: 'Weekday',
      sessionState: active ? 'REGULAR_HOURS' : 'CLOSED_AFTER_HOURS',
      statusLabel: active ? 'Market Open (Live)' : 'Market Closed',
      reason: active ? 'Regular trading hours active' : 'Outside trading hours',
    };
  }
}
