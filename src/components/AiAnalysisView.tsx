import React, { useState } from 'react';
import {
  AlertCircle,
  BrainCircuit,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react';
import { ScannedStock } from '../types';

interface AiAnalysisViewProps {
  topBuy: ScannedStock[];
  topSell: ScannedStock[];
  theme?: 'dark' | 'light';
}

export const AiAnalysisView: React.FC<AiAnalysisViewProps> = ({
  topBuy,
  topSell,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';
  const [analysisText, setAnalysisText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const generateReport = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/analyze', { method: 'POST' });
      if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Invalid response from AI server');
      }
      const data = await res.json();
      setAnalysisText(data.analysis || 'No analysis available.');
      setLastUpdated(data.timestamp || new Date().toISOString());
    } catch (err: any) {
      setAnalysisText('Failed to generate Gemini AI Market Synthesis.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`border rounded-2xl p-4 sm:p-6 my-4 sm:my-6 transition-colors ${
        isDark
          ? 'bg-slate-900 border-slate-800 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900 shadow-sm'
      }`}
    >
      {/* Header */}
      <div
        className={`flex flex-wrap items-center justify-between gap-4 mb-6 pb-4 border-b ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl ${
              isDark ? 'bg-slate-950 text-indigo-400' : 'bg-indigo-50 text-indigo-600'
            }`}
          >
            <BrainCircuit className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black italic tracking-tight uppercase flex items-center gap-2 flex-wrap">
              <span>Gemini AI Intraday Market Synthesis</span>
              <span className="text-[10px] font-mono font-bold bg-indigo-600 text-white px-2 py-0.5 rounded shadow-sm">
                Gemini 2.5 Flash
              </span>
            </h2>
            <p className="text-xs font-mono opacity-60">
              Executive quantitative analysis, sector breadth, and risk execution guidance
            </p>
          </div>
        </div>

        <button
          onClick={generateReport}
          disabled={loading}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-mono font-bold uppercase rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 shadow-md"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>{loading ? 'Analyzing Market...' : 'Generate AI Report'}</span>
        </button>
      </div>

      {/* Main Report Body */}
      {!analysisText && !loading ? (
        <div
          className={`text-center py-12 p-6 sm:p-8 rounded-xl border ${
            isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <Sparkles className="w-8 h-8 text-indigo-400 mx-auto mb-3" />
          <h3 className="text-sm font-black italic uppercase tracking-tight mb-1">
            Real-Time Market Intelligence
          </h3>
          <p className="text-xs font-mono opacity-60 max-w-md mx-auto mb-4">
            Gemini AI will analyze top Nifty 200 scanners, sector breadth, and indicators to output trade setups.
          </p>
          <button
            onClick={generateReport}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-mono font-bold uppercase rounded-xl transition-all shadow-md"
          >
            Start Analysis
          </button>
        </div>
      ) : loading ? (
        <div
          className={`text-center py-16 rounded-xl border ${
            isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
          }`}
        >
          <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto mb-3" />
          <p className="text-xs font-mono font-bold">
            Analyzing 200 Nifty stocks with Gemini AI...
          </p>
          <p className="text-[10px] font-mono opacity-60 mt-1">
            Processing VWAP, EMA stacks, RSI, and RVOL momentum
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div
            className={`text-xs font-mono flex flex-wrap items-center justify-between px-4 py-2.5 rounded-xl border gap-2 ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <span>Context: Nifty 200 5m Scan</span>
            <span>Generated: {new Date(lastUpdated).toLocaleTimeString('en-IN')}</span>
          </div>

          <div
            className={`text-xs font-mono leading-relaxed p-4 sm:p-6 rounded-xl border whitespace-pre-wrap ${
              isDark ? 'bg-slate-950/90 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            {analysisText}
          </div>
        </div>
      )}
    </div>
  );
};
