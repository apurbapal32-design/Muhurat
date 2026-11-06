import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  ExternalLink,
  FileText,
  Filter,
  Globe,
  Layers,
  Newspaper,
  PieChart,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { BulkOrder, CorporateAction, NewsItem, ScannedStock } from '../types';
import { SentimentTrendChart } from './SentimentTrendChart';

interface LiveNewsCorporateActionsViewProps {
  news: NewsItem[];
  corporateActions: CorporateAction[];
  bulkOrders?: BulkOrder[];
  stocks?: ScannedStock[];
  onCreateTrade?: (data: {
    symbol: string;
    signal: 'BUY' | 'SELL';
    entryPrice: number;
    quantity: number;
    stopLoss: number;
    target1: number;
    target2: number;
  }) => void;
  onSelectStock?: (stock: ScannedStock) => void;
  theme?: 'dark' | 'light';
}

export const LiveNewsCorporateActionsView: React.FC<LiveNewsCorporateActionsViewProps> = ({
  news,
  corporateActions,
  bulkOrders = [],
  stocks = [],
  onCreateTrade,
  onSelectStock,
  theme = 'dark',
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'news' | 'bulk' | 'actions' | 'sentiment-trend'>('news');
  const [newsSentimentFilter, setNewsSentimentFilter] = useState<'ALL' | 'POSITIVE' | 'NEGATIVE'>('ALL');
  const [newsCategoryFilter, setNewsCategoryFilter] = useState<string>('ALL');
  const [newsSourceFilter, setNewsSourceFilter] = useState<string>('ALL');
  const [actionTypeFilter, setActionTypeFilter] = useState<string>('ALL');
  const [bulkTypeFilter, setBulkTypeFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [bulkExchangeFilter, setBulkExchangeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const isDark = theme === 'dark';

  // Filtered News
  const filteredNews = news.filter((item) => {
    const matchesSearch =
      item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (item.dealDetails && item.dealDetails.clientName.toLowerCase().includes(searchQuery.toLowerCase()));

    const matchesSentiment =
      newsSentimentFilter === 'ALL' || item.sentiment === newsSentimentFilter;

    const matchesCategory =
      newsCategoryFilter === 'ALL' || item.category === newsCategoryFilter;

    const matchesSource =
      newsSourceFilter === 'ALL' ||
      (newsSourceFilter === 'MONEYCONTROL' && item.source.toLowerCase().includes('moneycontrol')) ||
      (newsSourceFilter === 'ET_MARKETS' && (item.source.toLowerCase().includes('economic times') || item.source.toLowerCase().includes('et markets'))) ||
      (newsSourceFilter === 'UPSTOX' && item.source.toLowerCase().includes('upstox')) ||
      (newsSourceFilter === 'STOXIM' && (item.source.toLowerCase().includes('stoxim') || item.source.toLowerCase().includes('nse') || item.source.toLowerCase().includes('bse')));

    return matchesSearch && matchesSentiment && matchesCategory && matchesSource;
  });

  // Filtered Bulk Orders
  const filteredBulkOrders = bulkOrders.filter((item) => {
    const matchesSearch =
      item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.clientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.remarks.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = bulkTypeFilter === 'ALL' || item.dealType === bulkTypeFilter;
    const matchesExchange = bulkExchangeFilter === 'ALL' || item.exchange === bulkExchangeFilter;

    return matchesSearch && matchesType && matchesExchange;
  });

  // Filtered Corporate Actions
  const filteredActions = corporateActions.filter((item) => {
    const matchesSearch =
      item.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.companyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.details.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesType = actionTypeFilter === 'ALL' || item.type === actionTypeFilter;

    return matchesSearch && matchesType;
  });

  const positiveNewsCount = news.filter((n) => n.sentiment === 'POSITIVE').length;
  const negativeNewsCount = news.filter((n) => n.sentiment === 'NEGATIVE').length;
  const bulkOrdersCount = bulkOrders.length;
  const totalBulkValueCr = bulkOrders.reduce((sum, b) => sum + (b.valueInCr || 0), 0).toFixed(1);

  const formatTime = (isoString: string) => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-IN').format(num);
  };

  return (
    <div className="space-y-6 my-6 font-sans">
      {/* Header & View Switcher Bar */}
      <div
        className={`p-5 rounded-2xl border transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
          isDark
            ? 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-xl'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-3 rounded-xl font-bold flex items-center justify-center ${
              isDark
                ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20'
                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
            }`}
          >
            <Newspaper className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black italic tracking-tight uppercase">
                Market Intelligence, Bulk Deals & Corporate Actions
              </h2>
              <span
                className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded uppercase border ${
                  isDark
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                }`}
              >
                Live Exchange Stream
              </span>
            </div>
            <p className="text-xs font-mono opacity-60">
              Institutional bulk/block orders, NLP sentiment news classification & scheduled corporate events
            </p>
          </div>
        </div>

        {/* View Switcher Tabs */}
        <div
          className={`flex items-center p-1 rounded-xl border text-xs font-mono font-bold uppercase ${
            isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-100 border-slate-200'
          }`}
        >
          <button
            onClick={() => setActiveSubTab('news')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'news'
                ? isDark
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <Newspaper className="w-3.5 h-3.5" />
            <span>Live News ({news.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('bulk')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'bulk'
                ? isDark
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Bulk Deals ({bulkOrdersCount})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('actions')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'actions'
                ? isDark
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-white text-indigo-700 shadow-sm border border-slate-200'
                : 'opacity-70 hover:opacity-100'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" />
            <span>Corporate Actions ({corporateActions.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('sentiment-trend')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-2 ${
              activeSubTab === 'sentiment-trend'
                ? isDark
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'bg-purple-600 text-white shadow-sm'
                : 'opacity-80 hover:opacity-100 text-purple-400'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-purple-300 animate-pulse" />
            <span>30-Day AI Sentiment Trend</span>
          </button>
        </div>
      </div>

      {/* Architecture & AI Scoring Engine Flow Diagram */}
      <div
        className={`p-5 rounded-2xl border transition-all ${
          isDark
            ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-xl'
            : 'bg-slate-50 border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800/60">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400 animate-pulse" />
            <h3 className="text-xs font-black italic uppercase tracking-wider text-indigo-300">
              News & Actions Data Architecture & AI Scoring Engine
            </h3>
          </div>
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
            Real-Time Pipeline
          </span>
        </div>

        {/* Responsive Flow Pipeline */}
        <div className="flex flex-col items-center space-y-4 font-mono text-xs">
          {/* Level 1: NIFTY 200 Source */}
          <div className="flex flex-col items-center">
            <div className="px-6 py-2 rounded-xl bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 text-white font-black text-sm shadow-lg border border-indigo-400/40 tracking-wider flex items-center gap-2">
              <Globe className="w-4 h-4 text-indigo-200" />
              NIFTY 200
            </div>
            <span className="text-[10px] opacity-60 mt-1 font-sans">200 High Liquidity F&O Market Universe</span>
            {/* Downward Connector Line */}
            <div className="w-0.5 h-6 bg-gradient-to-b from-indigo-500 to-slate-700 my-1"></div>
          </div>

          {/* Level 2: Ingestion Feeds Grid (Moneycontrol, ET Markets, Upstox, Stoxim, FYERS) */}
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {/* Feed 1: Upstox News API */}
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col items-center text-center shadow-md">
              <div className="px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 font-bold text-[10px] border border-blue-500/30 mb-1 flex items-center gap-1">
                <Newspaper className="w-3 h-3" />
                Upstox News API
              </div>
              <span className="text-[9px] opacity-60 mb-1.5">Tick NLP Stream</span>
              <div className="w-0.5 h-2 bg-blue-500/40 my-0.5"></div>
              <div className="w-full py-1 px-1 rounded bg-blue-950/40 border border-blue-500/20 text-blue-300 font-extrabold text-[10px]">
                NEWS SENTIMENT
              </div>
            </div>

            {/* Feed 2: Moneycontrol News API */}
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col items-center text-center shadow-md">
              <div className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-400 font-bold text-[10px] border border-rose-500/30 mb-1 flex items-center gap-1">
                <Newspaper className="w-3 h-3" />
                Moneycontrol
              </div>
              <span className="text-[9px] opacity-60 mb-1.5">Market News & Analysts</span>
              <div className="w-0.5 h-2 bg-rose-500/40 my-0.5"></div>
              <div className="w-full py-1 px-1 rounded bg-rose-950/40 border border-rose-500/20 text-rose-300 font-extrabold text-[10px]">
                NEWS SENTIMENT
              </div>
            </div>

            {/* Feed 3: ET Markets Feed */}
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col items-center text-center shadow-md">
              <div className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 font-bold text-[10px] border border-amber-500/30 mb-1 flex items-center gap-1">
                <Globe className="w-3 h-3" />
                ET Markets
              </div>
              <span className="text-[9px] opacity-60 mb-1.5">Macro & Industry Trends</span>
              <div className="w-0.5 h-2 bg-amber-500/40 my-0.5"></div>
              <div className="w-full py-1 px-1 rounded bg-amber-950/40 border border-amber-500/20 text-amber-300 font-extrabold text-[10px]">
                NEWS SENTIMENT
              </div>
            </div>

            {/* Feed 4: Stoxim NSE/BSE Announcements */}
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col items-center text-center shadow-md">
              <div className="px-2 py-0.5 rounded bg-purple-500/15 text-purple-400 font-bold text-[10px] border border-purple-500/30 mb-1 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                Stoxim NSE/BSE
              </div>
              <span className="text-[9px] opacity-60 mb-1.5">Corporate Filings</span>
              <div className="w-0.5 h-2 bg-purple-500/40 my-0.5"></div>
              <div className="w-full py-1 px-1 rounded bg-purple-950/40 border border-purple-500/20 text-purple-300 font-extrabold text-[10px]">
                EVENTS
              </div>
            </div>

            {/* Feed 5: FYERS Live Data */}
            <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-col items-center text-center shadow-md">
              <div className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-bold text-[10px] border border-emerald-500/30 mb-1 flex items-center gap-1">
                <Zap className="w-3 h-3" />
                FYERS Live Data
              </div>
              <span className="text-[9px] opacity-60 mb-1.5">Ticks, OI & VWAP</span>
              <div className="w-0.5 h-2 bg-emerald-500/40 my-0.5"></div>
              <div className="w-full py-1 px-1 rounded bg-emerald-950/40 border border-emerald-500/20 text-emerald-300 font-extrabold text-[10px]">
                PRICE / OI
              </div>
            </div>
          </div>

          {/* Level 3: Convergence into AI Scoring Engine */}
          <div className="w-full flex flex-col items-center pt-1">
            <div className="w-0.5 h-5 bg-gradient-to-b from-slate-700 to-indigo-500"></div>
            
            <div className="w-full max-w-lg p-3 rounded-xl bg-gradient-to-r from-indigo-950/90 via-slate-900 to-purple-950/90 border border-indigo-500/40 text-center shadow-xl">
              <div className="flex items-center justify-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-indigo-400 animate-spin" />
                <span className="text-sm font-black italic tracking-wider text-indigo-200 uppercase">
                  AI SCORING ENGINE
                </span>
                <Sparkles className="w-4 h-4 text-indigo-400 animate-spin" />
              </div>
              <p className="text-[10px] opacity-70 font-sans">
                Synthesizes Sentiment NLP + Exchange Events + Live OI & VWAP technicals
              </p>
            </div>

            <div className="w-0.5 h-5 bg-gradient-to-b from-indigo-500 to-emerald-500"></div>

            {/* Level 4: Final Signal Output */}
            <div className="px-6 py-2.5 rounded-xl bg-slate-950 border border-emerald-500/40 text-center shadow-lg">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5">Quantum Recommendation Signal</span>
              <div className="flex items-center justify-center gap-3 font-black text-sm">
                <span className="text-emerald-400 flex items-center gap-1">
                  <TrendingUp className="w-4 h-4" /> BUY
                </span>
                <span className="text-slate-600">/</span>
                <span className="text-rose-400 flex items-center gap-1">
                  <TrendingDown className="w-4 h-4" /> SELL
                </span>
                <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 text-xs border border-indigo-500/30">
                  SCORE 0–100
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 font-mono">
        <div
          className={`p-4 rounded-xl border transition-colors ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
          }`}
        >
          <span className="text-[10px] uppercase font-bold opacity-60 block">Institutional Bulk Deals Volume</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xl font-black text-amber-400">₹{totalBulkValueCr} Cr</span>
            <Layers className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-xs block opacity-60 mt-1">{bulkOrdersCount} Block window executions</span>
        </div>

        <div
          className={`p-4 rounded-xl border transition-colors ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
          }`}
        >
          <span className="text-[10px] uppercase font-bold opacity-60 block">Positive Sentiment Catalyst</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xl font-black text-emerald-400">{positiveNewsCount} Articles</span>
            <TrendingUp className="w-4 h-4 text-emerald-400" />
          </div>
          <span className="text-xs block opacity-60 mt-1">Bullish news drivers</span>
        </div>

        <div
          className={`p-4 rounded-xl border transition-colors ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
          }`}
        >
          <span className="text-[10px] uppercase font-bold opacity-60 block">Negative Market Sentiment</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xl font-black text-rose-400">{negativeNewsCount} Articles</span>
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
          <span className="text-xs block opacity-60 mt-1">Bearish drag or selling</span>
        </div>

        <div
          className={`p-4 rounded-xl border transition-colors ${
            isDark ? 'bg-slate-900/80 border-slate-800' : 'bg-white border-slate-200 shadow-2xs'
          }`}
        >
          <span className="text-[10px] uppercase font-bold opacity-60 block">Upcoming Corporate Events</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xl font-black text-indigo-400">{corporateActions.length} Scheduled</span>
            <Calendar className="w-4 h-4 text-indigo-400" />
          </div>
          <span className="text-xs block opacity-60 mt-1">Dividends & Stock Splits</span>
        </div>
      </div>

      {/* SEARCH AND FILTERS TOOLBAR */}
      <div
        className={`p-4 rounded-2xl border transition-colors flex flex-wrap items-center justify-between gap-4 font-mono text-xs ${
          isDark
            ? 'bg-slate-900/80 border-slate-800 text-slate-100'
            : 'bg-white border-slate-200 text-slate-900 shadow-2xs'
        }`}
      >
        {/* Search Field */}
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
          <input
            type="text"
            placeholder={
              activeSubTab === 'bulk'
                ? 'Search symbol, institution name or remarks...'
                : 'Search stock symbol, company or keywords...'
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full pl-9 pr-4 py-2 rounded-xl border focus:outline-none ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500'
                : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
            }`}
          />
        </div>

        {activeSubTab === 'news' && (
          /* News Filters */
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 opacity-60" />
              <span className="opacity-60 text-[11px] font-bold uppercase">Sentiment:</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setNewsSentimentFilter('ALL')}
                className={`px-3 py-1 rounded-lg font-bold uppercase text-[11px] ${
                  newsSentimentFilter === 'ALL'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setNewsSentimentFilter('POSITIVE')}
                className={`px-3 py-1 rounded-lg font-bold uppercase text-[11px] flex items-center gap-1 ${
                  newsSentimentFilter === 'POSITIVE'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                }`}
              >
                <TrendingUp className="w-3 h-3" />
                Positive
              </button>
              <button
                onClick={() => setNewsSentimentFilter('NEGATIVE')}
                className={`px-3 py-1 rounded-lg font-bold uppercase text-[11px] flex items-center gap-1 ${
                  newsSentimentFilter === 'NEGATIVE'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                }`}
              >
                <TrendingDown className="w-3 h-3" />
                Negative
              </button>
            </div>

            <select
              value={newsCategoryFilter}
              onChange={(e) => setNewsCategoryFilter(e.target.value)}
              className={`px-3 py-1.5 rounded-xl border focus:outline-none font-bold ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300'
              }`}
            >
              <option value="ALL">All Categories</option>
              <option value="BULK_ORDER">Bulk Orders & Deals</option>
              <option value="BLOCK_DEAL">Block Window Trades</option>
              <option value="EARNINGS">Earnings & Guidance</option>
              <option value="ORDER_WIN">Order Wins & Contracts</option>
              <option value="REGULATORY">Regulatory & Compliance</option>
            </select>

            <select
              value={newsSourceFilter}
              onChange={(e) => setNewsSourceFilter(e.target.value)}
              className={`px-3 py-1.5 rounded-xl border focus:outline-none font-bold text-indigo-300 ${
                isDark ? 'bg-slate-950 border-indigo-500/40 text-slate-200' : 'bg-slate-50 border-slate-300'
              }`}
            >
              <option value="ALL">All News Sources</option>
              <option value="MONEYCONTROL">Moneycontrol</option>
              <option value="ET_MARKETS">ET Markets (Economic Times)</option>
              <option value="UPSTOX">Upstox News API</option>
              <option value="STOXIM">Stoxim NSE/BSE</option>
            </select>
          </div>
        )}

        {activeSubTab === 'bulk' && (
          /* Bulk Order Filters */
          <div className="flex flex-wrap items-center gap-3">
            <span className="opacity-60 text-[11px] font-bold uppercase">Deal Side:</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setBulkTypeFilter('ALL')}
                className={`px-3 py-1 rounded-lg font-bold uppercase text-[11px] ${
                  bulkTypeFilter === 'ALL'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setBulkTypeFilter('BUY')}
                className={`px-3 py-1 rounded-lg font-bold uppercase text-[11px] flex items-center gap-1 ${
                  bulkTypeFilter === 'BUY'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20'
                }`}
              >
                <TrendingUp className="w-3 h-3" />
                Institutional Buy
              </button>
              <button
                onClick={() => setBulkTypeFilter('SELL')}
                className={`px-3 py-1 rounded-lg font-bold uppercase text-[11px] flex items-center gap-1 ${
                  bulkTypeFilter === 'SELL'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-500/10 text-rose-400 hover:bg-rose-500/20'
                }`}
              >
                <TrendingDown className="w-3 h-3" />
                Institutional Sell
              </button>
            </div>

            <select
              value={bulkExchangeFilter}
              onChange={(e) => setBulkExchangeFilter(e.target.value)}
              className={`px-3 py-1.5 rounded-xl border focus:outline-none font-bold ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300'
              }`}
            >
              <option value="ALL">All Exchanges</option>
              <option value="NSE">NSE Only</option>
              <option value="BSE">BSE Only</option>
            </select>
          </div>
        )}

        {activeSubTab === 'actions' && (
          /* Corporate Action Filters */
          <div className="flex flex-wrap items-center gap-3">
            <span className="opacity-60 text-[11px] font-bold uppercase">Action Type:</span>
            <select
              value={actionTypeFilter}
              onChange={(e) => setActionTypeFilter(e.target.value)}
              className={`px-3 py-1.5 rounded-xl border focus:outline-none font-bold ${
                isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-300'
              }`}
            >
              <option value="ALL">All Action Types</option>
              <option value="DIVIDEND">Dividends</option>
              <option value="SPLIT">Stock Splits</option>
              <option value="BONUS">Bonus Issues</option>
              <option value="EARNINGS_RELEASE">Earnings Release</option>
            </select>
          </div>
        )}
      </div>

      {/* SUB-TAB 1: LIVE NEWS FEED WITH SENTIMENT */}
      {activeSubTab === 'news' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-sans">
          {filteredNews.length === 0 ? (
            <div
              className={`col-span-2 p-12 text-center rounded-2xl border font-mono ${
                isDark ? 'bg-slate-900/80 border-slate-800 opacity-60' : 'bg-white border-slate-200 opacity-60'
              }`}
            >
              No news articles found matching the selected sentiment or category filters.
            </div>
          ) : (
            filteredNews.map((item) => (
              <div
                key={item.id}
                className={`p-5 rounded-2xl border transition-all hover:scale-[1.01] ${
                  isDark
                    ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700 text-slate-100 shadow-lg'
                    : 'bg-white border-slate-200 hover:border-slate-300 text-slate-900 shadow-sm'
                }`}
              >
                {/* Header Badge Strip */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 font-mono">
                    <span className="px-2.5 py-0.5 font-black text-xs rounded bg-indigo-600 text-white">
                      {item.symbol}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase border ${
                        item.category === 'BULK_ORDER' || item.category === 'BLOCK_DEAL'
                          ? 'bg-amber-500/20 text-amber-400 border-amber-500/40'
                          : isDark
                          ? 'bg-slate-800 border-slate-700 text-slate-300'
                          : 'bg-slate-100 border-slate-200 text-slate-700'
                      }`}
                    >
                      {item.category.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Sentiment Badge */}
                  {item.sentiment === 'POSITIVE' ? (
                    <span className="px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span>POSITIVE ({item.impactScore > 0 ? `+${item.impactScore}` : item.impactScore})</span>
                    </span>
                  ) : item.sentiment === 'NEGATIVE' ? (
                    <span className="px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5" />
                      <span>NEGATIVE ({item.impactScore})</span>
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 text-[11px] font-mono font-bold rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                      NEUTRAL
                    </span>
                  )}
                </div>

                {/* Article Title */}
                <h3 className="text-sm font-bold leading-snug mb-2 hover:text-indigo-400 transition-colors cursor-pointer">
                  {item.title}
                </h3>

                {/* Article Summary */}
                <p className="text-xs leading-relaxed opacity-70 mb-3">
                  {item.summary}
                </p>

                {/* Deal Details Box if Bulk Order */}
                {item.dealDetails && (
                  <div
                    className={`p-3 rounded-xl border mb-4 text-xs font-mono ${
                      isDark
                        ? 'bg-slate-950/80 border-slate-800 text-slate-200'
                        : 'bg-slate-50 border-slate-200 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold mb-1">
                      <span className="text-[10px] uppercase opacity-60">Institutional Client:</span>
                      <span
                        className={`px-2 py-0.5 text-[10px] rounded uppercase font-black ${
                          item.dealDetails.dealType === 'BUY'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-rose-500/20 text-rose-400'
                        }`}
                      >
                        {item.dealDetails.dealType} DEAL
                      </span>
                    </div>
                    <div className="font-bold text-xs mb-2 text-indigo-400">
                      {item.dealDetails.clientName}
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[11px] border-t border-slate-800/60 pt-2">
                      <div>
                        <span className="block opacity-50 text-[9px] uppercase">Quantity</span>
                        <span className="font-bold">{formatNumber(item.dealDetails.quantity)}</span>
                      </div>
                      <div>
                        <span className="block opacity-50 text-[9px] uppercase">Execution Price</span>
                        <span className="font-bold">₹{item.dealDetails.price}</span>
                      </div>
                      <div>
                        <span className="block opacity-50 text-[9px] uppercase">Deal Value</span>
                        <span className="font-bold text-amber-400">₹{item.dealDetails.valueInCr} Cr</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Footer Metadata & Action Button */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between font-mono text-[11px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                        item.source.toLowerCase().includes('moneycontrol')
                          ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                          : item.source.toLowerCase().includes('economic times') || item.source.toLowerCase().includes('et markets')
                          ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                          : item.source.toLowerCase().includes('upstox')
                          ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                          : item.source.toLowerCase().includes('stoxim')
                          ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                          : 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                      }`}
                    >
                      <Globe className="w-3 h-3" />
                      <span>{item.source}</span>
                    </span>
                    <span className="flex items-center gap-1 opacity-70 text-[10px]">
                      <Clock className="w-3 h-3 text-indigo-400" />
                      <span>{formatTime(item.timestamp)}</span>
                    </span>
                  </div>

                  {onCreateTrade && (
                    <button
                      onClick={() =>
                        onCreateTrade({
                          symbol: item.symbol,
                          signal: item.sentiment === 'POSITIVE' ? 'BUY' : 'SELL',
                          entryPrice: item.dealDetails?.price || 1500,
                          quantity: 100,
                          stopLoss: Number(((item.dealDetails?.price || 1500) * 0.98).toFixed(2)),
                          target1: Number(((item.dealDetails?.price || 1500) * 1.03).toFixed(2)),
                          target2: Number(((item.dealDetails?.price || 1500) * 1.06).toFixed(2)),
                        })
                      }
                      className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded transition-all flex items-center gap-1 ${
                        item.sentiment === 'POSITIVE'
                          ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                          : 'bg-rose-600 hover:bg-rose-500 text-white'
                      }`}
                    >
                      <Zap className="w-3 h-3" />
                      <span>{item.sentiment === 'POSITIVE' ? 'Trade Buy' : 'Trade Sell'}</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* SUB-TAB 2: BULK & BLOCK DEALS DEDICATED TABLE */}
      {activeSubTab === 'bulk' && (
        <div
          className={`p-6 rounded-2xl border transition-colors ${
            isDark
              ? 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-xl'
              : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 mb-4 border-b border-slate-800/80 gap-2">
            <div>
              <h3 className="text-sm font-black italic tracking-tight uppercase flex items-center gap-2">
                <Layers className="w-4 h-4 text-amber-400" />
                <span>Live Exchange Bulk Orders & Institutional Block Trades</span>
              </h3>
              <p className="text-xs font-mono opacity-60 mt-0.5">
                Tracks large institutional deals (&gt;0.5% equity or &gt;₹10 Cr value) executed on NSE & BSE
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="px-2.5 py-1 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-bold">
                Total Value: ₹{totalBulkValueCr} Cr
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr
                  className={`uppercase text-[10px] font-bold border-b ${
                    isDark ? 'bg-slate-950/80 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <th className="py-3 px-3">Symbol</th>
                  <th className="py-3 px-3">Institutional Client</th>
                  <th className="py-3 px-3">Deal Type</th>
                  <th className="py-3 px-3">Quantity</th>
                  <th className="py-3 px-3">Trade Price</th>
                  <th className="py-3 px-3">Deal Value (Cr)</th>
                  <th className="py-3 px-3">Exch.</th>
                  <th className="py-3 px-3">Time</th>
                  <th className="py-3 px-3">Remarks / Insight</th>
                  <th className="py-3 px-3 text-right">Instant Trade</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
                {filteredBulkOrders.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center opacity-50 font-mono">
                      No bulk or block deals match your current search and filters.
                    </td>
                  </tr>
                ) : (
                  filteredBulkOrders.map((item) => (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3.5 px-3 font-bold text-sm">
                        <span className="px-2 py-0.5 bg-indigo-600 text-white rounded">
                          {item.symbol}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-bold text-slate-200 max-w-xs">
                        <div>{item.clientName}</div>
                        <div className="text-[10px] opacity-50 font-normal">{item.companyName}</div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`px-2 py-1 text-[10px] font-bold rounded uppercase border ${
                            item.dealType === 'BUY'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                          }`}
                        >
                          {item.dealType}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-bold">{formatNumber(item.quantity)}</td>
                      <td className="py-3.5 px-3 font-bold">₹{item.price.toFixed(2)}</td>
                      <td className="py-3.5 px-3 font-black text-amber-400">₹{item.valueInCr} Cr</td>
                      <td className="py-3.5 px-3 font-bold">
                        <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-800 text-slate-300">
                          {item.exchange}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 opacity-80">{formatTime(item.timestamp)}</td>
                      <td className="py-3.5 px-3 opacity-70 text-[11px] max-w-xs">{item.remarks}</td>
                      <td className="py-3.5 px-3 text-right">
                        {onCreateTrade && (
                          <button
                            onClick={() =>
                              onCreateTrade({
                                symbol: item.symbol,
                                signal: item.dealType === 'BUY' ? 'BUY' : 'SELL',
                                entryPrice: item.price,
                                quantity: 100,
                                stopLoss: Number((item.price * (item.dealType === 'BUY' ? 0.98 : 1.02)).toFixed(2)),
                                target1: Number((item.price * (item.dealType === 'BUY' ? 1.03 : 0.97)).toFixed(2)),
                                target2: Number((item.price * (item.dealType === 'BUY' ? 1.06 : 0.94)).toFixed(2)),
                              })
                            }
                            className={`px-2.5 py-1 text-[10px] font-bold uppercase rounded transition-all inline-flex items-center gap-1 ${
                              item.dealType === 'BUY'
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                                : 'bg-rose-600 hover:bg-rose-500 text-white'
                            }`}
                          >
                            <Zap className="w-3 h-3" />
                            <span>Trade {item.dealType}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: CORPORATE ACTIONS */}
      {activeSubTab === 'actions' && (
        <div
          className={`p-6 rounded-2xl border transition-colors ${
            isDark
              ? 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-xl'
              : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80">
            <div>
              <h3 className="text-sm font-black italic tracking-tight uppercase flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-400" />
                <span>Upcoming Corporate Actions & Ex-Dates</span>
              </h3>
              <p className="text-xs font-mono opacity-60 mt-0.5">
                Track dividend ex-dates, stock splits, bonus announcements & earnings schedules
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse font-mono">
              <thead>
                <tr
                  className={`uppercase text-[10px] font-bold border-b ${
                    isDark ? 'bg-slate-950/80 border-slate-800 text-slate-400' : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <th className="py-3 px-3">Symbol</th>
                  <th className="py-3 px-3">Company Name</th>
                  <th className="py-3 px-3">Action Type</th>
                  <th className="py-3 px-3">Value / Ratio</th>
                  <th className="py-3 px-3">Ex-Date</th>
                  <th className="py-3 px-3">Record Date</th>
                  <th className="py-3 px-3">Impact Level</th>
                  <th className="py-3 px-3">Details</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800' : 'divide-slate-200'}`}>
                {filteredActions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center opacity-50 font-mono">
                      No corporate actions found for the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredActions.map((item) => (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isDark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50'
                      }`}
                    >
                      <td className="py-3.5 px-3 font-bold text-sm">
                        <span className="px-2 py-0.5 bg-indigo-600 text-white rounded">
                          {item.symbol}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-medium text-xs">{item.companyName}</td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`px-2 py-1 text-[10px] font-bold rounded uppercase border ${
                            item.type === 'DIVIDEND'
                              ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                              : item.type === 'SPLIT'
                              ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                              : item.type === 'BONUS'
                              ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                              : 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
                          }`}
                        >
                          {item.type.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 font-bold text-indigo-400">{item.value || '—'}</td>
                      <td className="py-3.5 px-3 font-bold text-emerald-400">{item.exDate}</td>
                      <td className="py-3.5 px-3 opacity-80">{item.recordDate}</td>
                      <td className="py-3.5 px-3">
                        <span
                          className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                            item.impact === 'HIGH'
                              ? 'bg-rose-500/20 text-rose-400'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {item.impact} IMPACT
                        </span>
                      </td>
                      <td className="py-3.5 px-3 opacity-70 text-[11px] max-w-xs">{item.details}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 30-Day AI Sentiment Trend View */}
      {activeSubTab === 'sentiment-trend' && (
        <SentimentTrendChart
          stocks={stocks}
          theme={theme}
          onSelectStock={onSelectStock}
        />
      )}
    </div>
  );
};
