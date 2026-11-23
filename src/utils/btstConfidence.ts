import type { BtstSignalRow } from '../../server/btstScannerEngine';

export type ConfidenceTier = 'High' | 'Strong' | 'Moderate' | 'Caution';

export interface BtstConfidenceMetrics {
  score: number; // 0..100 integer
  tier: ConfidenceTier;
  passedChecks: number;
  totalChecks: number;
  gapEdgePct: number;
  deliveryCarryPct: number;
  btstFormulaScore: number;
  strokeHex: string;
  textClass: string;
  ariaLabel: string;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Computes a deterministic 0-100 AI Agent Confluence Confidence score for a BTST/STBT stock
 * combining Vedant AI's formula score, 7-factor check confluence, overnight gap probability,
 * and institutional carry conviction.
 */
export function computeBtstConfluenceConfidence(
  row: Pick<
    BtstSignalRow,
    | 'symbol'
    | 'btstScore'
    | 'conditionsMet'
    | 'totalConditions'
    | 'gapEdgeProbabilityPct'
    | 'deliveryConvictionPct'
  >
): BtstConfidenceMetrics {
  const btstFormulaScore = clamp(Number(row.btstScore) || 0, 0, 100);
  const totalChecks = Math.max(1, Number(row.totalConditions) || 7);
  const passedChecks = clamp(Number(row.conditionsMet) || 0, 0, totalChecks);
  const checkRatioPct = (passedChecks / totalChecks) * 100;
  const gapEdgePct = clamp(Number(row.gapEdgeProbabilityPct) || 0, 0, 100);
  const deliveryCarryPct = clamp(Number(row.deliveryConvictionPct) || 0, 0, 100);

  const weighted =
    btstFormulaScore * 0.45 +
    checkRatioPct * 0.25 +
    gapEdgePct * 0.18 +
    deliveryCarryPct * 0.12;

  const score = Math.round(clamp(weighted, 0, 100));

  let tier: ConfidenceTier = 'Caution';
  let strokeHex = '#f43f5e'; // rose-500
  let textClass = 'text-rose-400';

  if (score >= 82) {
    tier = 'High';
    strokeHex = '#10b981'; // emerald-500
    textClass = 'text-emerald-400';
  } else if (score >= 70) {
    tier = 'Strong';
    strokeHex = '#0ea5e9'; // sky-500
    textClass = 'text-sky-400';
  } else if (score >= 55) {
    tier = 'Moderate';
    strokeHex = '#f59e0b'; // amber-500
    textClass = 'text-amber-400';
  }

  return {
    score,
    tier,
    passedChecks,
    totalChecks,
    gapEdgePct: Math.round(gapEdgePct),
    deliveryCarryPct: Math.round(deliveryCarryPct),
    btstFormulaScore: Math.round(btstFormulaScore),
    strokeHex,
    textClass,
    ariaLabel: `${row.symbol} AI confluence confidence ${score} out of 100 (${tier}, ${passedChecks}/${totalChecks} checks)`,
  };
}

/**
 * Computes SVG stroke-dasharray / stroke-dashoffset geometry for a 270-degree institutional arc gauge.
 */
export function computeGaugeArcGeometry(score: number, radius: number): {
  circumference: number;
  arcLength: number;
  trackDashArray: string;
  progressDashOffset: number;
} {
  const safeScore = clamp(Number(score) || 0, 0, 100);
  const circumference = 2 * Math.PI * radius;
  const arcFraction = 0.75; // 270-degree precision instrument arc
  const arcLength = circumference * arcFraction;
  const filledLength = arcLength * (safeScore / 100);
  const progressDashOffset = Number((arcLength - filledLength).toFixed(2));

  return {
    circumference: Number(circumference.toFixed(2)),
    arcLength: Number(arcLength.toFixed(2)),
    trackDashArray: `${arcLength.toFixed(2)} ${circumference.toFixed(2)}`,
    progressDashOffset,
  };
}
