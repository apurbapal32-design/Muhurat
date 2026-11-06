import React, { useState } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Eye,
  Flame,
  Layers,
  Percent,
  Play,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Workflow,
  Zap,
} from 'lucide-react';
import { ConfluenceEngineData, ConfluencePillar, ScannedStock } from '../types';
import { calculate16PillarConfluence } from '../utils/confluenceEngine';

interface ConfluencePipelineInspectorProps {
  stock: ScannedStock;
  isDark?: boolean;
  onExecuteTrade?: (stock: ScannedStock, signal: 'BUY' | 'SELL') => void;
  compact?: boolean;
}

export const ConfluencePipelineInspector: React.FC<ConfluencePipelineInspectorProps> = ({
  stock,
  isDark = true,
  onExecuteTrade,
  compact = false,
}) => {
  const confluenceData: ConfluenceEngineData = stock.confluence || calculate16PillarConfluence({
    symbol: stock.symbol,
    price: stock.price,
    open: stock.indicators?.open || stock.price,
    high: stock.indicators?.high || stock.price * 1.01,
    low: stock.indicators?.low || stock.price * 0.99,
    close: stock.price,
    prevClose: stock.price / (1 + (stock.changePercent || 0) / 100),
    volume: stock.volume,
    avgVolume20: stock.indicators?.avgVolume20 || stock.volume,
    changePercent: stock.changePercent,
    indicators: stock.indicators,
    oiData: stock.oiData,
    greeks: stock.greeks,
    sector: stock.sector,
  });

  const [activeTab, setActiveTab] = useState<'PILLARS' | 'WORKFLOW' | 'EXECUTION_LADDER'>('WORKFLOW');
  const [selectedPillarId, setSelectedPillarId] = useState<string | null>(null);

  const stage = confluenceData.stage;
  const score = confluenceData.confluenceScore;
  const isBuy = stock.signal === 'BUY' || confluenceData.signal === 'BUY';
  const isSell = stock.signal === 'SELL' || confluenceData.signal === 'SELL';

  const stageColor =
    stage === 'CONFIRMED'
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
      : stage === 'SETUP'
      ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40'
      : 'bg-amber-500/20 text-amber-400 border-amber-500/40';

  const stageBadgeText =
    stage === 'CONFIRMED'
      ? 'CONFIRMED (75–100)'
      : stage === 'SETUP'
      ? 'SETUP (60–74)'
      : 'WATCH (40–59)';

  return (
    <div
      className={`rounded-2xl border transition-all ${
        isDark
          ? 'bg-slate-950/90 border-slate-800 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900 shadow-sm'
      } ${compact ? 'p-4' : 'p-6'}`}
    >
      {/* Top Banner: Master Confluence Flow Visualizer */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-800/60">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center gap-1">
              <Workflow className="w-3 h-3 text-indigo-400" />
              16-Pillar Confluence Pipeline
            </span>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase tracking-wider border ${stageColor}`}>
              Stage: {stageBadgeText}
            </span>
            <span className="text-xs font-mono font-bold text-slate-400">
              {stock.symbol} • ₹{stock.price.toFixed(2)} ({stock.changePercent >= 0 ? '+' : ''}{stock.changePercent.toFixed(2)}%)
            </span>
          </div>

          <h2 className="text-lg md:text-xl font-black italic tracking-tight uppercase mt-1 flex items-center gap-2">
            <span>Nifty 200 Quantitative Confluence Engine</span>
            <span className="text-xs font-mono font-bold text-indigo-400 not-italic">
              Score {score}/100
            </span>
          </h2>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800 text-xs font-mono">
          <button
            onClick={() => setActiveTab('WORKFLOW')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeTab === 'WORKFLOW'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Workflow Flowchart
          </button>
          <button
            onClick={() => setActiveTab('PILLARS')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeTab === 'PILLARS'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            16 Pillars Breakdown ({confluenceData.bullishPillarsCount} Bull / {confluenceData.bearishPillarsCount} Bear)
          </button>
          <button
            onClick={() => setActiveTab('EXECUTION_LADDER')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeTab === 'EXECUTION_LADDER'
                ? 'bg-indigo-600 text-white shadow'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Ladder (SL / T1 / T2 / T3 / Exit)
          </button>
        </div>
      </div>

      {/* TAB 1: Master Workflow Flowchart */}
      {activeTab === 'WORKFLOW' && (
        <div className="mt-5 space-y-6">
          {/* Step-by-Step Interactive Pipeline Diagram */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[11px] font-mono uppercase font-bold text-slate-400 mb-3 flex items-center justify-between">
              <span>Deterministic Flow Hierarchy</span>
              <span className="text-indigo-400 font-bold">16 Inputs → Confluence → Decision Ladder</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2 mb-4">
              {confluenceData.pillars.map((p, idx) => {
                const isBull = p.status === 'BULLISH';
                const isBear = p.status === 'BEARISH';
                return (
                  <div
                    key={p.id}
                    onClick={() => {
                      setSelectedPillarId(p.id);
                      setActiveTab('PILLARS');
                    }}
                    className={`p-2 rounded-lg border text-center cursor-pointer transition-all hover:scale-105 ${
                      isBull
                        ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                        : isBear
                        ? 'bg-rose-950/40 border-rose-500/40 text-rose-300'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400'
                    }`}
                    title={`${p.name}: ${p.description}`}
                  >
                    <div className="text-[9px] font-mono uppercase font-bold truncate opacity-70">
                      #{idx + 1} {p.category.replace(/_/g, ' ')}
                    </div>
                    <div className="text-xs font-black font-mono mt-0.5">
                      {p.score.toFixed(1)} <span className="text-[9px] opacity-60">/6.25</span>
                    </div>
                    <div className="text-[8px] font-mono font-bold mt-0.5 truncate">
                      {p.status}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pipeline Downward Arrow Connectors */}
            <div className="flex flex-col items-center gap-2 text-center my-3 font-mono">
              <div className="flex items-center gap-2 text-indigo-400 font-extrabold text-xs">
                <span>↓ CONFLUENCE ENGINE COMPILATION ↓</span>
              </div>
              <div className="px-4 py-2 rounded-xl bg-indigo-950/60 border border-indigo-500/40 inline-flex items-center gap-3">
                <Cpu className="w-4 h-4 text-indigo-400 animate-pulse" />
                <span className="text-xs font-black text-indigo-200">
                  Calculated Score: {score} / 100
                </span>
                <span className="text-[10px] text-slate-300">
                  ({confluenceData.bullishPillarsCount} Bullish, {confluenceData.bearishPillarsCount} Bearish, {confluenceData.neutralPillarsCount} Neutral)
                </span>
              </div>

              <div className="text-indigo-400 font-extrabold text-xs mt-1">
                <span>↓ STAGE CLASSIFICATION ↓</span>
              </div>

              {/* Stage Selection Display */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-2xl mt-1">
                {/* Watch */}
                <div
                  className={`p-3 rounded-xl border text-center transition-all ${
                    stage === 'WATCH'
                      ? 'bg-amber-950/60 border-amber-500 text-amber-200 ring-2 ring-amber-500/40 shadow-lg'
                      : 'bg-slate-950/40 border-slate-800 text-slate-500 opacity-60'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase font-mono">1. Watch (40-59)</div>
                  <div className="text-xs font-black mt-0.5">Early Base Building</div>
                  <div className="text-[9px] mt-1 opacity-80">Track on watchlist; await liquidity/volume trigger</div>
                </div>

                {/* Setup */}
                <div
                  className={`p-3 rounded-xl border text-center transition-all ${
                    stage === 'SETUP'
                      ? 'bg-cyan-950/60 border-cyan-500 text-cyan-200 ring-2 ring-cyan-500/40 shadow-lg'
                      : 'bg-slate-950/40 border-slate-800 text-slate-500 opacity-60'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase font-mono">2. Setup (60-74)</div>
                  <div className="text-xs font-black mt-0.5">Structure Formed</div>
                  <div className="text-[9px] mt-1 opacity-80">Order block tested; prepare limit order ladder</div>
                </div>

                {/* Confirmed */}
                <div
                  className={`p-3 rounded-xl border text-center transition-all ${
                    stage === 'CONFIRMED'
                      ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 ring-2 ring-emerald-500/40 shadow-lg'
                      : 'bg-slate-950/40 border-slate-800 text-slate-500 opacity-60'
                  }`}
                >
                  <div className="text-[10px] font-bold uppercase font-mono">3. Confirmed (75-100)</div>
                  <div className="text-xs font-black mt-0.5">Institutional Trigger</div>
                  <div className="text-[9px] mt-1 opacity-80">High volume + multi-pillar confluence confirmed</div>
                </div>
              </div>

              <div className="text-indigo-400 font-extrabold text-xs mt-2">
                <span>↓ SIGNAL & EXECUTION LADDER ↓</span>
              </div>

              {/* Actionable Signal & Execution Ladder Cards */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 w-full mt-1">
                {/* Entry */}
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-left">
                  <div className="text-[9px] font-mono font-bold uppercase text-slate-400">Execution Entry</div>
                  <div className="text-sm font-black font-mono text-indigo-400 mt-0.5">
                    ₹{confluenceData.ladder.entryPrice.toFixed(2)}
                  </div>
                  <div className="text-[9px] font-mono text-slate-500 mt-1">
                    Signal: <span className={isBuy ? 'text-emerald-400 font-bold' : isSell ? 'text-rose-400 font-bold' : 'text-slate-400'}>{confluenceData.signal}</span>
                  </div>
                </div>

                {/* Stop Loss */}
                <div className="p-3 rounded-xl bg-slate-950 border border-rose-900/40 text-left">
                  <div className="text-[9px] font-mono font-bold uppercase text-rose-400">Stop Loss (SL)</div>
                  <div className="text-sm font-black font-mono text-rose-400 mt-0.5">
                    ₹{confluenceData.ladder.stopLoss.toFixed(2)}
                  </div>
                  <div className="text-[9px] font-mono text-rose-300 mt-1">
                    Risk: {confluenceData.ladder.stopLossPercent}% (1.2× ATR)
                  </div>
                </div>

                {/* Target 1 */}
                <div className="p-3 rounded-xl bg-slate-950 border border-emerald-900/40 text-left">
                  <div className="text-[9px] font-mono font-bold uppercase text-emerald-400">Target 1 (T1)</div>
                  <div className="text-sm font-black font-mono text-emerald-400 mt-0.5">
                    ₹{confluenceData.ladder.target1.toFixed(2)}
                  </div>
                  <div className="text-[9px] font-mono text-emerald-300 mt-1">
                    +{confluenceData.ladder.target1Percent}% • Book 50% & SL to BE
                  </div>
                </div>

                {/* Target 2 */}
                <div className="p-3 rounded-xl bg-slate-950 border border-emerald-900/40 text-left">
                  <div className="text-[9px] font-mono font-bold uppercase text-emerald-400">Target 2 (T2)</div>
                  <div className="text-sm font-black font-mono text-emerald-400 mt-0.5">
                    ₹{confluenceData.ladder.target2.toFixed(2)}
                  </div>
                  <div className="text-[9px] font-mono text-emerald-300 mt-1">
                    +{confluenceData.ladder.target2Percent}% • Book 30% & Trail
                  </div>
                </div>

                {/* Target 3 */}
                <div className="p-3 rounded-xl bg-slate-950 border border-emerald-900/40 text-left">
                  <div className="text-[9px] font-mono font-bold uppercase text-emerald-400">Target 3 (T3)</div>
                  <div className="text-sm font-black font-mono text-emerald-400 mt-0.5">
                    ₹{confluenceData.ladder.target3.toFixed(2)}
                  </div>
                  <div className="text-[9px] font-mono text-emerald-300 mt-1">
                    +{confluenceData.ladder.target3Percent}% • Final Runner Exit
                  </div>
                </div>
              </div>

              {/* Dynamic Exit Rule Banner */}
              <div className="p-3 rounded-xl bg-purple-950/40 border border-purple-500/30 text-left w-full mt-2">
                <div className="flex items-center gap-2 text-purple-300 text-xs font-bold font-mono">
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                  <span>EXIT &amp; TRAILING PROTOCOL</span>
                </div>
                <div className="text-[11px] font-mono text-slate-300 mt-1">
                  {confluenceData.ladder.exitStrategy}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Detailed 16 Pillars Grid */}
      {activeTab === 'PILLARS' && (
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {confluenceData.pillars.map((pillar) => {
              const isBull = pillar.status === 'BULLISH';
              const isBear = pillar.status === 'BEARISH';
              const isSelected = selectedPillarId === pillar.id;

              return (
                <div
                  key={pillar.id}
                  onClick={() => setSelectedPillarId(pillar.id)}
                  className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected ? 'ring-2 ring-indigo-500' : ''
                  } ${
                    isBull
                      ? 'bg-emerald-950/20 border-emerald-500/30 text-slate-100 hover:bg-emerald-950/40'
                      : isBear
                      ? 'bg-rose-950/20 border-rose-500/30 text-slate-100 hover:bg-rose-950/40'
                      : 'bg-slate-900/60 border-slate-800 text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono font-bold uppercase text-slate-400 truncate">
                      {pillar.name}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-extrabold border ${
                        isBull
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : isBear
                          ? 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}
                    >
                      {pillar.status}
                    </span>
                  </div>

                  <div className="text-sm font-black font-mono mt-1 text-slate-100">
                    {pillar.valueDisplay}
                  </div>

                  <div className="w-full bg-slate-950 h-1.5 rounded-full overflow-hidden my-2 border border-slate-800">
                    <div
                      className={`h-full rounded-full ${
                        isBull
                          ? 'bg-emerald-500'
                          : isBear
                          ? 'bg-rose-500'
                          : 'bg-indigo-500'
                      }`}
                      style={{ width: `${(pillar.score / pillar.maxScore) * 100}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span>Points: {pillar.score.toFixed(2)} / {pillar.maxScore.toFixed(2)}</span>
                    <span className="text-[9px] opacity-70">Wt: {pillar.weight}%</span>
                  </div>

                  <p className="text-[10px] text-slate-400 font-sans mt-2 line-clamp-2 leading-relaxed">
                    {pillar.description}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: Execution Ladder & Trailing Rules */}
      {activeTab === 'EXECUTION_LADDER' && (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Risk Box */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
              <div className="text-xs font-mono font-bold uppercase text-slate-400 flex items-center gap-1.5 mb-2">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                <span>Capital &amp; Risk Sizing</span>
              </div>
              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="opacity-70">Execution Price:</span>
                  <span className="font-bold text-indigo-300">₹{confluenceData.ladder.entryPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="opacity-70">Stop Loss:</span>
                  <span className="font-bold text-rose-400">₹{confluenceData.ladder.stopLoss.toFixed(2)} ({confluenceData.ladder.stopLossPercent}%)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="opacity-70">Risk : Reward:</span>
                  <span className="font-bold text-emerald-400">{confluenceData.ladder.riskRewardRatio}</span>
                </div>
              </div>
            </div>

            {/* Target Execution Matrix */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 md:col-span-2">
              <div className="text-xs font-mono font-bold uppercase text-slate-400 flex items-center gap-1.5 mb-2">
                <Target className="w-4 h-4 text-emerald-400" />
                <span>Multi-Target Profit Realization Matrix</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono mt-3">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-emerald-900/30">
                  <div className="font-bold text-emerald-400">Target 1: ₹{confluenceData.ladder.target1.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-400 mt-1">+{confluenceData.ladder.target1Percent}% from entry</div>
                  <div className="text-[9px] text-emerald-300 font-bold mt-1.5">{confluenceData.ladder.target1Action}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-emerald-900/30">
                  <div className="font-bold text-emerald-400">Target 2: ₹{confluenceData.ladder.target2.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-400 mt-1">+{confluenceData.ladder.target2Percent}% from entry</div>
                  <div className="text-[9px] text-emerald-300 font-bold mt-1.5">{confluenceData.ladder.target2Action}</div>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950 border border-emerald-900/30">
                  <div className="font-bold text-emerald-400">Target 3: ₹{confluenceData.ladder.target3.toFixed(2)}</div>
                  <div className="text-[10px] text-slate-400 mt-1">+{confluenceData.ladder.target3Percent}% from entry</div>
                  <div className="text-[9px] text-emerald-300 font-bold mt-1.5">{confluenceData.ladder.target3Action}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Trade Execution Trigger */}
          {onExecuteTrade && (
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => onExecuteTrade(stock, isBuy ? 'BUY' : 'SELL')}
                className={`px-5 py-2.5 rounded-xl font-bold font-mono text-xs uppercase flex items-center gap-2 shadow-lg transition-all ${
                  isBuy
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/30'
                    : 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-900/30'
                }`}
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Execute {isBuy ? 'Buy' : 'Sell'} Trade with Confluence Ladder</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
