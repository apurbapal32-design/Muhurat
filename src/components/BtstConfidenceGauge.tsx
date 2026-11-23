import React from 'react';
import type { BtstSignalRow } from '../../server/btstScannerEngine';
import {
  computeBtstConfluenceConfidence,
  computeGaugeArcGeometry,
} from '../utils/btstConfidence';

interface BtstConfidenceGaugeProps {
  row: BtstSignalRow;
  isLight?: boolean;
  size?: 'sm' | 'lg';
  showDetails?: boolean;
}

export const BtstConfidenceGauge: React.FC<BtstConfidenceGaugeProps> = ({
  row,
  isLight = false,
  size = 'sm',
  showDetails = true,
}) => {
  const metrics = computeBtstConfluenceConfidence(row);
  const isLarge = size === 'lg';
  const px = isLarge ? 56 : 40;
  const strokeWidth = isLarge ? 4.5 : 3.5;
  const center = px / 2;
  const radius = center - strokeWidth - 1;
  const geom = computeGaugeArcGeometry(metrics.score, radius);
  const trackStroke = isLight ? '#e2e8f0' : '#1e293b';

  return (
    <div
      className="inline-flex items-center gap-2.5 shrink-0"
      role="meter"
      aria-valuenow={metrics.score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={metrics.ariaLabel}
      data-testid={`confidence-gauge-${row.symbol}`}
      data-confidence-score={metrics.score}
      title={`AI Confluence Confidence: ${metrics.score}/100 (${metrics.tier}) · ${metrics.passedChecks}/${metrics.totalChecks} checks · Formula ${metrics.btstFormulaScore} · Gap Edge ${metrics.gapEdgePct}%`}
    >
      <div
        className={`relative flex items-center justify-center shrink-0 ${
          isLarge ? 'w-14 h-14' : 'w-10 h-10'
        }`}
      >
        <svg
          width={px}
          height={px}
          viewBox={`0 0 ${px} ${px}`}
          className="block"
          aria-hidden="true"
        >
          <g transform={`rotate(135 ${center} ${center})`}>
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={trackStroke}
              strokeWidth={strokeWidth}
              strokeDasharray={geom.trackDashArray}
              strokeLinecap="round"
            />
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={metrics.strokeHex}
              strokeWidth={strokeWidth}
              strokeDasharray={geom.trackDashArray}
              strokeDashoffset={geom.progressDashOffset}
              strokeLinecap="round"
              className="transition-[stroke-dashoffset] duration-200 ease-out"
            />
          </g>
        </svg>
        <span
          className={`absolute font-mono tabular-nums font-semibold leading-none ${
            isLarge ? 'text-sm' : 'text-[11px]'
          } ${isLight ? 'text-slate-900' : 'text-slate-100'}`}
        >
          {metrics.score}
        </span>
      </div>

      {showDetails && (
        <div className="min-w-0 leading-tight text-left">
          <div className={`text-[11px] font-semibold ${metrics.textClass}`}>
            {metrics.tier}
            <span
              className={`ml-1 font-mono tabular-nums font-normal ${
                isLight ? 'text-slate-500' : 'text-slate-400'
              }`}
            >
              {metrics.passedChecks}/{metrics.totalChecks}
            </span>
          </div>
          <div
            className={`text-[10px] font-mono tabular-nums whitespace-nowrap ${
              isLight ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            Gap {metrics.gapEdgePct}% · {row.convictionGrade}
          </div>
        </div>
      )}
    </div>
  );
};
