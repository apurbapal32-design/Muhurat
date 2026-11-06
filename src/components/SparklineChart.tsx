import React from 'react';

interface SparklineChartProps {
  data: number[];
  width?: number;
  height?: number;
  isDark?: boolean;
}

export const SparklineChart: React.FC<SparklineChartProps> = ({
  data,
  width = 90,
  height = 26,
  isDark = true,
}) => {
  if (!data || data.length < 2) {
    return (
      <div className="w-[90px] h-[26px] flex items-center justify-center opacity-40 text-[9px] font-mono">
        N/A
      </div>
    );
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 3;
  const usableHeight = height - padding * 2;

  const points = data.map((val, idx) => {
    const x = (idx / (data.length - 1)) * width;
    const y = height - padding - ((val - min) / range) * usableHeight;
    return { x, y, val };
  });

  const pathD = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');

  const areaD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  const firstVal = data[0];
  const lastVal = data[data.length - 1];
  const isUp = lastVal >= firstVal;
  const pctChange = ((lastVal - firstVal) / (firstVal || 1)) * 100;

  const strokeColor = isUp ? '#10b981' : '#f43f5e';
  const gradientId = `spark-grad-${Math.random().toString(36).substr(2, 6)}`;
  const lastPoint = points[points.length - 1];

  return (
    <div className="group/spark inline-relative cursor-pointer">
      <div className="relative flex items-center gap-1">
        <svg
          width={width}
          height={height}
          className="overflow-visible"
          viewBox={`0 0 ${width} ${height}`}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={strokeColor}
                stopOpacity={isDark ? 0.35 : 0.25}
              />
              <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
            </linearGradient>
          </defs>

          {/* Area under line */}
          <path d={areaD} fill={`url(#${gradientId})`} />

          {/* Sparkline Path */}
          <path
            d={pathD}
            fill="none"
            stroke={strokeColor}
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Last Price Endpoint Pulse */}
          <circle
            cx={lastPoint.x}
            cy={lastPoint.y}
            r="2.5"
            fill={strokeColor}
            className="animate-pulse"
          />
        </svg>

        <span
          className={`text-[9px] font-bold font-mono ${
            isUp
              ? isDark
                ? 'text-emerald-400'
                : 'text-emerald-600'
              : isDark
              ? 'text-rose-400'
              : 'text-rose-600'
          }`}
        >
          {isUp ? '+' : ''}
          {pctChange.toFixed(1)}%
        </span>
      </div>

      {/* Hover Tooltip showing 60m detail */}
      <div
        className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover/spark:block z-50 p-2 rounded-lg border text-[10px] font-mono shadow-xl pointer-events-none whitespace-nowrap ${
          isDark
            ? 'bg-slate-900 border-slate-700 text-slate-200 shadow-slate-950/80'
            : 'bg-white border-slate-300 text-slate-800 shadow-slate-300/80'
        }`}
      >
        <div className="font-bold flex items-center justify-between gap-3 border-b pb-1 mb-1 border-slate-700/50">
          <span>60m Trend</span>
          <span className={isUp ? 'text-emerald-400' : 'text-rose-400'}>
            {isUp ? '+' : ''}
            {pctChange.toFixed(2)}%
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 opacity-90 text-[9px]">
          <span className="opacity-60">High (60m):</span>
          <span className="font-semibold text-right">₹{max.toLocaleString('en-IN')}</span>
          <span className="opacity-60">Low (60m):</span>
          <span className="font-semibold text-right">₹{min.toLocaleString('en-IN')}</span>
          <span className="opacity-60">Latest:</span>
          <span className="font-semibold text-right">₹{lastVal.toLocaleString('en-IN')}</span>
        </div>
      </div>
    </div>
  );
};
