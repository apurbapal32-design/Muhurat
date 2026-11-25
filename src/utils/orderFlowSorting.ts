import type { OrderFlowSignalRow } from '../../server/orderFlowScannerEngine';

export type OrderFlowSortColumn =
  | 'time'
  | 'volume'
  | 'priceImpact'
  | 'score'
  | 'delta';

export type SortDirection = 'asc' | 'desc';

export interface OrderFlowSortState {
  column: OrderFlowSortColumn;
  direction: SortDirection;
}

export const DEFAULT_ORDER_FLOW_SORT: OrderFlowSortState = Object.freeze({
  column: 'time',
  direction: 'desc',
});

/**
 * Parses an "HH:MM:SS" IST timestamp into seconds since midnight.
 * Returns 0 when the input is missing or malformed.
 */
export function parseListedTimeSeconds(listedAt: string | undefined): number {
  if (!listedAt || typeof listedAt !== 'string') return 0;
  const parts = listedAt.trim().split(':').map((p) => Number(p));
  if (parts.length < 2 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    return 0;
  }
  const [h, m, s = 0] = parts;
  return h * 3600 + m * 60 + s;
}

/**
 * Computes the next sort state when a user clicks a column header.
 * - Clicking a different column selects it in descending order (highest impact /
 *   highest volume / latest time first).
 * - Clicking the already active column toggles between descending and ascending.
 */
export function toggleOrderFlowSort(
  current: OrderFlowSortState,
  column: OrderFlowSortColumn
): OrderFlowSortState {
  if (current.column === column) {
    return {
      column,
      direction: current.direction === 'desc' ? 'asc' : 'desc',
    };
  }
  return {
    column,
    direction: 'desc',
  };
}

/**
 * Extracts the numeric primary sort metric for a given Order Flow column.
 * - time: listedAtSec (falling back to parsed HH:MM:SS listedAt)
 * - volume: institutional turnoverCr when positive, else volumeProfile.totalVolume, else rvol
 * - priceImpact: absolute percentage move |changePercent| so largest price impacts surface first
 * - score: composite orderFlowScore (0..100)
 * - delta: absolute footprint delta magnitude |buyers - sellers|
 */
export function getOrderFlowSortMetric(
  row: OrderFlowSignalRow,
  column: OrderFlowSortColumn
): number {
  switch (column) {
    case 'time': {
      const sec = Number(row.listedAtSec);
      if (Number.isFinite(sec) && sec > 0) return sec;
      return parseListedTimeSeconds(row.listedAt);
    }
    case 'volume': {
      const turnover = Number(row.turnoverCr);
      if (Number.isFinite(turnover) && turnover > 0) return turnover;
      const profileVol = Number(row.volumeProfile?.totalProfileVolume);
      if (Number.isFinite(profileVol) && profileVol > 0) return profileVol;
      const rvol = Number(row.rvol);
      return Number.isFinite(rvol) ? rvol : 0;
    }
    case 'priceImpact': {
      const chg = Number(row.changePercent);
      return Number.isFinite(chg) ? Math.abs(chg) : 0;
    }
    case 'score': {
      const score = Number(row.orderFlowScore);
      return Number.isFinite(score) ? score : 0;
    }
    case 'delta': {
      const delta = Number(row.signals?.delta?.footprintDelta);
      return Number.isFinite(delta) ? Math.abs(delta) : 0;
    }
    default:
      return 0;
  }
}

/**
 * Returns a new sorted array of OrderFlowSignalRow without mutating input.
 * Deterministic tie-breakers:
 *   1) Latest listedAtSec descending
 *   2) Symbol ascending (lexicographic)
 */
export function sortOrderFlowRows(
  rows: readonly OrderFlowSignalRow[],
  sort: OrderFlowSortState
): OrderFlowSignalRow[] {
  if (!Array.isArray(rows) || rows.length <= 1) {
    return Array.isArray(rows) ? [...rows] : [];
  }
  const dirMult = sort.direction === 'asc' ? 1 : -1;

  return [...rows].sort((a, b) => {
    const valA = getOrderFlowSortMetric(a, sort.column);
    const valB = getOrderFlowSortMetric(b, sort.column);
    if (valA !== valB) {
      return (valA - valB) * dirMult;
    }

    // Secondary tie-breaker for volume: higher RVOL first when turnover matches
    if (sort.column === 'volume') {
      const rvolDiff = (Number(a.rvol) || 0) - (Number(b.rvol) || 0);
      if (rvolDiff !== 0) return rvolDiff * dirMult;
    }

    // Deterministic tie-breaker 1: latest listedAtSec first
    const timeA = getOrderFlowSortMetric(a, 'time');
    const timeB = getOrderFlowSortMetric(b, 'time');
    if (timeA !== timeB) {
      return timeB - timeA;
    }

    // Deterministic tie-breaker 2: symbol A -> Z
    return String(a.symbol || '').localeCompare(String(b.symbol || ''));
  });
}

/**
 * Formats a concise human-readable summary of the active sort for table subheaders.
 */
export function formatOrderFlowSortSummary(sort: OrderFlowSortState): string {
  const dir = sort.direction;
  switch (sort.column) {
    case 'time':
      return dir === 'desc'
        ? 'Sorted by Time (Latest → Earliest)'
        : 'Sorted by Time (Earliest → Latest)';
    case 'volume':
      return dir === 'desc'
        ? 'Sorted by Volume (High → Low)'
        : 'Sorted by Volume (Low → High)';
    case 'priceImpact':
      return dir === 'desc'
        ? 'Sorted by Price Impact (High → Low)'
        : 'Sorted by Price Impact (Low → High)';
    case 'score':
      return dir === 'desc'
        ? 'Sorted by Flow Score (High → Low)'
        : 'Sorted by Flow Score (Low → High)';
    case 'delta':
      return dir === 'desc'
        ? 'Sorted by Delta (High → Low)'
        : 'Sorted by Delta (Low → High)';
    default:
      return 'Sorted by Time (Latest → Earliest)';
  }
}

export function isDefaultOrderFlowSort(sort: OrderFlowSortState): boolean {
  return (
    sort.column === DEFAULT_ORDER_FLOW_SORT.column &&
    sort.direction === DEFAULT_ORDER_FLOW_SORT.direction
  );
}
