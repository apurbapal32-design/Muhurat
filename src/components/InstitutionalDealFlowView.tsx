import React, { useState, useMemo } from 'react';
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart2,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Filter,
  Flame,
  Layers,
  PieChart as PieChartIcon,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  INITIAL_INSTITUTIONAL_DEALS,
  InstitutionalDeal,
} from '../data/institutionalDealsData';
import { ScannedStock } from '../types';

interface InstitutionalDealFlowViewProps {
  stocks?: ScannedStock[];
  onSelectStock?: (stock: ScannedStock) => void;
  onNavigateToDiagnostics?: (symbol: string) => void;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
}

export const InstitutionalDealFlowView: React.FC<InstitutionalDealFlowViewProps> = ({
  stocks = [],
  onSelectStock,
  onNavigateToDiagnostics,
  theme = 'dark',
}) => {
  const isDark = theme !== 'light';

  const [deals, setDeals] = useState<InstitutionalDeal[]>(INITIAL_INSTITUTIONAL_DEALS);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sideFilter, setSideFilter] = useState<'ALL' | 'BUY' | 'SELL'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'BLOCK_DEAL' | 'BULK_DEAL'>('ALL');
  const [clientCategoryFilter, setClientCategoryFilter] = useState<'ALL' | 'FII' | 'DII' | 'PROMOTER'>('ALL');
  const [minVolumeFilter, setMinVolumeFilter] = useState<number>(0);
  const [sortBy, setSortBy] = useState<'VOLUME' | 'VALUE' | 'TIME' | 'IMPACT'>('VOLUME');
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isSimulateModalOpen, setIsSimulateModalOpen] = useState<boolean>(false);

  // New deal form state
  const [newSymbol, setNewSymbol] = useState<string>('RELIANCE');
  const [newClient, setNewClient] = useState<string>('Morgan Stanley Asia Pte');
  const [newClientCat, setNewClientCat] = useState<'FII' | 'DII' | 'PROMOTER'>('FII');
  const [newDealType, setNewDealType] = useState<'BLOCK_DEAL' | 'BULK_DEAL'>('BLOCK_DEAL');
  const [newTradeType, setNewTradeType] = useState<'BUY' | 'SELL'>('BUY');
  const [newQuantity, setNewQuantity] = useState<number>(5000000);
  const [newPrice, setNewPrice] = useState<number>(3000);
  const [newSector, setNewSector] = useState<string>('Energy & Retail');
  const [newStrategicIntent, setNewStrategicIntent] = useState<string>('Institutional block deal accumulation at key VWAP support.');

  // Manual refresh simulator
  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      // randomly update current market prices slightly to show live updates
      setDeals((prev) =>
        prev.map((d) => {
          const delta = (Math.random() - 0.45) * 0.4;
          const newMkt = Math.round((d.marketPrice * (1 + delta / 100)) * 10) / 10;
          const newImpact = Math.round(((newMkt - d.price) / d.price) * 10000) / 100;
          return {
            ...d,
            marketPrice: newMkt,
            priceImpactPct: newImpact,
          };
        })
      );
      setIsRefreshing(false);
    }, 600);
  };

  // Add simulated deal
  const handleAddDeal = (e: React.FormEvent) => {
    e.preventDefault();
    const valueInCr = Math.round(((newQuantity * newPrice) / 10000000) * 100) / 100;
    const nowIso = new Date().toISOString();
    const newDealItem: InstitutionalDeal = {
      id: `DEAL-${Date.now()}`,
      symbol: newSymbol.toUpperCase().trim(),
      companyName: `${newSymbol.toUpperCase()} India Ltd.`,
      sector: newSector,
      clientName: newClient,
      clientCategory: newClientCat,
      dealType: newDealType,
      dealWindow: newDealType === 'BLOCK_DEAL' ? 'SPECIAL_BLOCK_WINDOW_1' : 'CONTINUOUS_MARKET',
      tradeType: newTradeType,
      quantity: Number(newQuantity),
      price: Number(newPrice),
      valueInCr: valueInCr,
      exchange: 'NSE',
      timestamp: nowIso,
      timeFormatted: new Date(nowIso).toLocaleTimeString('en-IN', { hour12: false }) + ' IST',
      marketPrice: Number(newPrice) * 1.01,
      priceImpactPct: 1.0,
      percentOfEquity: 0.85,
      strategicIntent: newStrategicIntent,
      sentiment: newTradeType === 'BUY' ? 'VERY_BULLISH' : 'BEARISH',
      rvolMultiplier: 3.5,
    };

    setDeals([newDealItem, ...deals]);
    setIsSimulateModalOpen(false);
  };

  // Filtered & Sorted Deals
  const filteredAndSortedDeals = useMemo(() => {
    const list = deals.filter((d) => {
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const matches =
          d.symbol.toLowerCase().includes(q) ||
          d.companyName.toLowerCase().includes(q) ||
          d.clientName.toLowerCase().includes(q) ||
          d.sector.toLowerCase().includes(q) ||
          d.strategicIntent.toLowerCase().includes(q);
        if (!matches) return false;
      }
      if (sideFilter !== 'ALL' && d.tradeType !== sideFilter) return false;
      if (typeFilter !== 'ALL' && d.dealType !== typeFilter) return false;
      if (clientCategoryFilter !== 'ALL' && d.clientCategory !== clientCategoryFilter) return false;
      if (minVolumeFilter > 0 && d.quantity < minVolumeFilter) return false;
      return true;
    });

    return list.sort((a, b) => {
      if (sortBy === 'VOLUME') return b.quantity - a.quantity; // Default sorted by volume
      if (sortBy === 'VALUE') return b.valueInCr - a.valueInCr;
      if (sortBy === 'TIME') return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      if (sortBy === 'IMPACT') return Math.abs(b.priceImpactPct) - Math.abs(a.priceImpactPct);
      return 0;
    });
  }, [deals, searchQuery, sideFilter, typeFilter, clientCategoryFilter, minVolumeFilter, sortBy]);

  // Aggregate Metrics
  const totalVolumeShares = useMemo(
    () => deals.reduce((acc, d) => acc + d.quantity, 0),
    [deals]
  );
  const totalTurnoverCr = useMemo(
    () => deals.reduce((acc, d) => acc + d.valueInCr, 0),
    [deals]
  );
  const totalBuyCr = useMemo(
    () => deals.filter((d) => d.tradeType === 'BUY').reduce((acc, d) => acc + d.valueInCr, 0),
    [deals]
  );
  const totalSellCr = useMemo(
    () => deals.filter((d) => d.tradeType === 'SELL').reduce((acc, d) => acc + d.valueInCr, 0),
    [deals]
  );
  const netInstitutionalFlowCr = totalBuyCr - totalSellCr;

  // Chart Data: Top 10 by Volume (Shares in Millions)
  const topVolumeChartData = useMemo(() => {
    return [...deals]
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 8)
      .map((d) => ({
        symbol: d.symbol,
        volumeM: Math.round((d.quantity / 1000000) * 100) / 100, // Millions of shares
        valueCr: d.valueInCr,
        side: d.tradeType,
        client: d.clientName,
      }));
  }, [deals]);

  // Chart Data: Net Inflow/Outflow by Sector (₹ Cr)
  const sectorFlowChartData = useMemo(() => {
    const sectorMap: Record<string, { buy: number; sell: number; net: number }> = {};
    deals.forEach((d) => {
      const s = d.sector || 'Other';
      if (!sectorMap[s]) sectorMap[s] = { buy: 0, sell: 0, net: 0 };
      if (d.tradeType === 'BUY') sectorMap[s].buy += d.valueInCr;
      else sectorMap[s].sell += d.valueInCr;
      sectorMap[s].net = sectorMap[s].buy - sectorMap[s].sell;
    });

    return Object.entries(sectorMap)
      .map(([sector, val]) => ({
        sector,
        buyCr: Math.round(val.buy),
        sellCr: Math.round(val.sell),
        netCr: Math.round(val.net),
      }))
      .sort((a, b) => b.buyCr + b.sellCr - (a.buyCr + a.sellCr))
      .slice(0, 6);
  }, [deals]);

  // Chart Data: Client Category Breakdown
  const clientCategoryChartData = useMemo(() => {
    const map: Record<string, number> = { FII: 0, DII: 0, PROMOTER: 0, HNI_AIF: 0 };
    deals.forEach((d) => {
      map[d.clientCategory] = (map[d.clientCategory] || 0) + d.valueInCr;
    });

    return [
      { name: 'FII (Foreign Institutional)', value: Math.round(map.FII), color: '#3b82f6' },
      { name: 'DII (Domestic Mutual Funds)', value: Math.round(map.DII), color: '#10b981' },
      { name: 'Promoters & Syndicate', value: Math.round(map.PROMOTER), color: '#f59e0b' },
      { name: 'HNI & AIF Funds', value: Math.round(map.HNI_AIF), color: '#8b5cf6' },
    ].filter((c) => c.value > 0);
  }, [deals]);

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Timestamp',
      'Symbol',
      'Company Name',
      'Sector',
      'Deal Type',
      'Side',
      'Client Name',
      'Client Category',
      'Quantity (Shares)',
      'Deal Price (INR)',
      'Turnover (INR Cr)',
      'Exchange',
      'Price Impact %',
      'Strategic Intent',
    ];

    const rows = filteredAndSortedDeals.map((d) => [
      `"${d.timeFormatted}"`,
      `"${d.symbol}"`,
      `"${d.companyName}"`,
      `"${d.sector}"`,
      `"${d.dealType}"`,
      `"${d.tradeType}"`,
      `"${d.clientName.replace(/"/g, '""')}"`,
      `"${d.clientCategory}"`,
      d.quantity,
      d.price,
      d.valueInCr,
      `"${d.exchange}"`,
      d.priceImpactPct,
      `"${d.strategicIntent.replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Nifty200_Institutional_Deals_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 font-sans">
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP HEADER & CONTROLS BANNER */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`p-5 sm:p-6 rounded-3xl border shadow-xl backdrop-blur-md transition-all ${
          isDark
            ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-indigo-950/20'
            : 'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-5 border-b border-slate-800/60">
          <div>
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="px-2.5 py-0.5 text-xs font-mono font-black rounded-lg bg-blue-600 text-white uppercase tracking-wider shadow-xs flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-blue-200" />
                <span>NIFTY 200 INSTITUTIONAL FLOW ENGINE</span>
              </span>
              <span className="px-2.5 py-0.5 text-xs font-mono font-bold rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                <Zap className="w-3 h-3 text-emerald-400" />
                <span>NSE / BSE Block &amp; Bulk Deal Feed</span>
              </span>
              <span className="px-2.5 py-0.5 text-xs font-mono font-bold rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                <Flame className="w-3 h-3 text-amber-400" />
                <span>Sorted by Volume</span>
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black italic tracking-tight font-mono flex items-center gap-2">
              <span>Institutional Bulk &amp; Block Deal Flows</span>
            </h1>
            <p className="text-xs sm:text-sm opacity-70 font-sans mt-0.5 max-w-3xl">
              Track and visualize large-scale institutional smart-money flows, block transactions, and fund accumulation/distribution across the Nifty 200 universe, sorted by volume to pinpoint market-moving positions.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className={`px-3.5 py-2 rounded-xl text-xs font-mono font-bold border transition-all flex items-center gap-1.5 ${
                isDark
                  ? 'bg-slate-800 border-slate-700 hover:bg-slate-700 text-slate-200'
                  : 'bg-slate-100 border-slate-300 hover:bg-slate-200 text-slate-800'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-blue-400' : ''}`} />
              <span>{isRefreshing ? 'Syncing...' : 'Refresh Feed'}</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition-all flex items-center gap-1.5 shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => setIsSimulateModalOpen(true)}
              className="px-3.5 py-2 rounded-xl text-xs font-mono font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Model New Deal</span>
            </button>
          </div>
        </div>

        {/* ------------------------------------------------------------- */}
        {/* KPI CARDS: FLOW TOTALS & METRICS */}
        {/* ------------------------------------------------------------- */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-4 font-mono text-xs">
          {/* Total Deal Volume */}
          <div
            className={`p-3.5 rounded-2xl border ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="text-[10px] uppercase font-bold opacity-60 flex items-center gap-1">
              <BarChart2 className="w-3 h-3 text-blue-400" />
              <span>TOTAL DEAL VOLUME</span>
            </div>
            <div className="text-lg font-black text-blue-400 mt-1">
              {(totalVolumeShares / 10000000).toFixed(2)} Cr
              <span className="text-[10px] text-slate-400 font-normal ml-1">shares</span>
            </div>
            <div className="text-[10px] opacity-60 mt-0.5">
              {totalVolumeShares.toLocaleString('en-IN')} units
            </div>
          </div>

          {/* Gross Deal Turnover */}
          <div
            className={`p-3.5 rounded-2xl border ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="text-[10px] uppercase font-bold opacity-60 flex items-center gap-1">
              <Wallet className="w-3 h-3 text-indigo-400" />
              <span>GROSS TURNOVER</span>
            </div>
            <div className="text-lg font-black text-indigo-400 mt-1">
              ₹{totalTurnoverCr.toFixed(1)} Cr
            </div>
            <div className="text-[10px] opacity-60 mt-0.5">Across {deals.length} major deals</div>
          </div>

          {/* Net Institutional Flow */}
          <div
            className={`p-3.5 rounded-2xl border ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="text-[10px] uppercase font-bold opacity-60 flex items-center gap-1">
              {netInstitutionalFlowCr >= 0 ? (
                <ArrowUpRight className="w-3 h-3 text-emerald-400" />
              ) : (
                <ArrowDownRight className="w-3 h-3 text-rose-400" />
              )}
              <span>NET SMART FLOW</span>
            </div>
            <div
              className={`text-lg font-black mt-1 ${
                netInstitutionalFlowCr >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {netInstitutionalFlowCr >= 0 ? '+' : ''}₹{netInstitutionalFlowCr.toFixed(1)} Cr
            </div>
            <div className="text-[10px] opacity-70 mt-0.5">
              {netInstitutionalFlowCr >= 0 ? '🟢 Net Accumulation' : '🔴 Net Distribution'}
            </div>
          </div>

          {/* Institutional Buy vs Sell Ratio */}
          <div
            className={`p-3.5 rounded-2xl border ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="text-[10px] uppercase font-bold opacity-60 flex items-center gap-1">
              <Layers className="w-3 h-3 text-cyan-400" />
              <span>BUY / SELL TURNOVER</span>
            </div>
            <div className="text-xs font-black text-slate-200 mt-1">
              <span className="text-emerald-400">₹{totalBuyCr.toFixed(0)} Cr</span> /{' '}
              <span className="text-rose-400">₹{totalSellCr.toFixed(0)} Cr</span>
            </div>
            <div className="text-[10px] opacity-60 mt-0.5">
              {Math.round((totalBuyCr / (totalTurnoverCr || 1)) * 100)}% Buyers
            </div>
          </div>

          {/* Block vs Bulk Deals */}
          <div
            className={`p-3.5 rounded-2xl border col-span-2 sm:col-span-1 ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="text-[10px] uppercase font-bold opacity-60 flex items-center gap-1">
              <Users className="w-3 h-3 text-purple-400" />
              <span>WINDOW DISTRIBUTION</span>
            </div>
            <div className="text-xs font-black text-slate-200 mt-1">
              <span className="text-blue-400">
                {deals.filter((d) => d.dealType === 'BLOCK_DEAL').length} Blocks
              </span>{' '}
              /{' '}
              <span className="text-purple-400">
                {deals.filter((d) => d.dealType === 'BULK_DEAL').length} Bulks
              </span>
            </div>
            <div className="text-[10px] opacity-60 mt-0.5">Special Window &amp; Continuous</div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. VISUAL CHARTS SECTION: TOP VOLUME & SECTOR FLOWS */}
      {/* ------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Top 8 Deals by Volume (Shares in Millions) */}
        <div
          className={`lg:col-span-7 p-5 sm:p-6 rounded-3xl border shadow-xl transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800/60">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-blue-400" />
                <h3 className="text-base font-black italic font-mono uppercase tracking-tight">
                  Top Institutional Deals by Volume (Million Shares)
                </h3>
              </div>
              <p className="text-xs opacity-60 mt-0.5">
                Stocks experiencing highest institutional share transactions today
              </p>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
              Sorted by Vol
            </span>
          </div>

          <div className="h-64 sm:h-72 w-full font-mono text-xs">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topVolumeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis dataKey="symbol" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl shadow-xl text-slate-100 font-mono text-xs space-y-1">
                          <div className="font-black text-sm flex items-center justify-between gap-2">
                            <span>{data.symbol}</span>
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                data.side === 'BUY'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-rose-500/20 text-rose-400'
                              }`}
                            >
                              {data.side}
                            </span>
                          </div>
                          <div className="text-slate-400 text-[11px] truncate max-w-xs">{data.client}</div>
                          <div className="text-blue-400 font-bold">
                            Volume: {data.volumeM} Million Shares
                          </div>
                          <div className="text-indigo-400">Turnover: ₹{data.valueCr} Cr</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="volumeM" radius={[8, 8, 0, 0]}>
                  {topVolumeChartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.side === 'BUY' ? '#10b981' : '#f43f5e'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-2 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500" />
              <span className="text-slate-400">Institutional Buy / Accumulation</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-rose-500" />
              <span className="text-slate-400">Institutional Sell / Distribution</span>
            </div>
          </div>
        </div>

        {/* Sector Flow Breakdown (₹ Cr) & Client Pie */}
        <div
          className={`lg:col-span-5 p-5 sm:p-6 rounded-3xl border shadow-xl transition-all ${
            isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
          }`}
        >
          <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800/60">
            <div>
              <div className="flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-emerald-400" />
                <h3 className="text-base font-black italic font-mono uppercase tracking-tight">
                  Net Institutional Flow by Sector (₹ Cr)
                </h3>
              </div>
              <p className="text-xs opacity-60 mt-0.5">Inflow vs Outflow distribution across sectors</p>
            </div>
          </div>

          <div className="space-y-3 font-mono text-xs">
            {sectorFlowChartData.map((sec) => {
              const maxTurnover = Math.max(...sectorFlowChartData.map((s) => s.buyCr + s.sellCr)) || 1;
              const buyPct = Math.round((sec.buyCr / maxTurnover) * 100);
              const sellPct = Math.round((sec.sellCr / maxTurnover) * 100);

              return (
                <div key={sec.sector} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200">{sec.sector}</span>
                    <span
                      className={`font-black ${
                        sec.netCr >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {sec.netCr >= 0 ? '+' : ''}₹{sec.netCr} Cr Net
                    </span>
                  </div>
                  <div className="h-2.5 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                    <div
                      style={{ width: `${buyPct}%` }}
                      className="bg-emerald-500 h-full transition-all"
                      title={`Buy: ₹${sec.buyCr} Cr`}
                    />
                    <div
                      style={{ width: `${sellPct}%` }}
                      className="bg-rose-500 h-full transition-all"
                      title={`Sell: ₹${sec.sellCr} Cr`}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] opacity-60 font-sans">
                    <span>Buy: ₹{sec.buyCr} Cr</span>
                    <span>Sell: ₹{sec.sellCr} Cr</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* FII vs DII vs Promoter Share Summary */}
          <div className="mt-4 pt-3 border-t border-slate-800/60 grid grid-cols-3 gap-2 text-center text-xs font-mono">
            <div className="p-2 rounded-xl bg-blue-950/40 border border-blue-500/20">
              <div className="text-[10px] text-blue-400 uppercase font-bold">FII Flow</div>
              <div className="font-black text-slate-100">
                ₹{clientCategoryChartData.find((c) => c.name.includes('FII'))?.value || 0} Cr
              </div>
            </div>
            <div className="p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/20">
              <div className="text-[10px] text-emerald-400 uppercase font-bold">DII Mutual Funds</div>
              <div className="font-black text-slate-100">
                ₹{clientCategoryChartData.find((c) => c.name.includes('DII'))?.value || 0} Cr
              </div>
            </div>
            <div className="p-2 rounded-xl bg-amber-950/40 border border-amber-500/20">
              <div className="text-[10px] text-amber-400 uppercase font-bold">Promoter / AIF</div>
              <div className="font-black text-slate-100">
                ₹{(clientCategoryChartData.find((c) => c.name.includes('Promoters'))?.value || 0) +
                  (clientCategoryChartData.find((c) => c.name.includes('HNI'))?.value || 0)}{' '}
                Cr
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 3. SEARCH, FILTER & SORTING BAR */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`p-5 rounded-3xl border shadow-xl transition-all space-y-3 ${
          isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Search Box */}
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <input
              type="text"
              placeholder="Search ticker, fund name, sector..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 text-xs font-mono rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                isDark
                  ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500'
                  : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
              }`}
            />
          </div>

          {/* Primary Sort Selector */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 text-xs font-mono shrink-0 overflow-x-auto">
            <span className="text-[10px] text-slate-400 px-2 uppercase font-bold">Sort By:</span>
            <button
              onClick={() => setSortBy('VOLUME')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 ${
                sortBy === 'VOLUME' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <BarChart2 className="w-3.5 h-3.5" />
              <span>Volume (Shares)</span>
            </button>
            <button
              onClick={() => setSortBy('VALUE')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 ${
                sortBy === 'VALUE' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Wallet className="w-3.5 h-3.5" />
              <span>Turnover (₹ Cr)</span>
            </button>
            <button
              onClick={() => setSortBy('TIME')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 ${
                sortBy === 'TIME' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Time</span>
            </button>
            <button
              onClick={() => setSortBy('IMPACT')}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1 ${
                sortBy === 'IMPACT' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Price Impact %</span>
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-mono">
          <span className="text-[10px] text-slate-400 uppercase font-bold shrink-0">Filter:</span>
          <button
            onClick={() => setSideFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 ${
              sideFilter === 'ALL' ? 'bg-blue-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
            }`}
          >
            ALL SIDES ({deals.length})
          </button>
          <button
            onClick={() => setSideFilter('BUY')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 flex items-center gap-1 ${
              sideFilter === 'BUY' ? 'bg-emerald-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
            }`}
          >
            <ArrowUpRight className="w-3 h-3" />
            <span>BUY ACCUMULATION ({deals.filter((d) => d.tradeType === 'BUY').length})</span>
          </button>
          <button
            onClick={() => setSideFilter('SELL')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 flex items-center gap-1 ${
              sideFilter === 'SELL' ? 'bg-rose-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
            }`}
          >
            <ArrowDownRight className="w-3 h-3" />
            <span>SELL DISTRIBUTION ({deals.filter((d) => d.tradeType === 'SELL').length})</span>
          </button>

          <span className="text-slate-600">|</span>

          <button
            onClick={() => setTypeFilter('ALL')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 ${
              typeFilter === 'ALL' ? 'bg-indigo-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
            }`}
          >
            ALL WINDOWS
          </button>
          <button
            onClick={() => setTypeFilter('BLOCK_DEAL')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 ${
              typeFilter === 'BLOCK_DEAL' ? 'bg-indigo-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
            }`}
          >
            BLOCK DEALS ({deals.filter((d) => d.dealType === 'BLOCK_DEAL').length})
          </button>
          <button
            onClick={() => setTypeFilter('BULK_DEAL')}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 ${
              typeFilter === 'BULK_DEAL' ? 'bg-indigo-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
            }`}
          >
            BULK DEALS ({deals.filter((d) => d.dealType === 'BULK_DEAL').length})
          </button>

          <span className="text-slate-600">|</span>

          <button
            onClick={() => setMinVolumeFilter(minVolumeFilter === 0 ? 2000000 : 0)}
            className={`px-2.5 py-1 rounded-lg font-bold transition-all shrink-0 ${
              minVolumeFilter > 0 ? 'bg-amber-600 text-white' : 'bg-slate-800/60 text-slate-400 hover:bg-slate-800'
            }`}
          >
            🔥 VOLUME &gt; 2M SHARES ({deals.filter((d) => d.quantity >= 2000000).length})
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 4. INSTITUTIONAL BULK & BLOCK DEALS MATRIX TABLE */}
      {/* ------------------------------------------------------------- */}
      <div
        className={`p-5 sm:p-6 rounded-3xl border shadow-xl transition-all ${
          isDark ? 'bg-slate-900/90 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800/60 flex-wrap">
          <div>
            <h3 className="text-base font-black italic font-mono uppercase tracking-tight flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Real-Time Institutional Deal Flow Ledger</span>
            </h3>
            <p className="text-xs opacity-60 font-sans mt-0.5">
              Showing {filteredAndSortedDeals.length} filtered deals • Click on any ticker to launch diagnostics &amp; live chart
            </p>
          </div>
          <div className="text-xs font-mono opacity-70">
            Current Order: <span className="font-bold text-blue-400">{sortBy} (DESCENDING)</span>
          </div>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-800/80 bg-slate-950/60">
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/90 text-slate-400 text-[11px] uppercase tracking-wider">
                <th className="py-3 px-3">Time &amp; Exch</th>
                <th className="py-3 px-3">Symbol / Company</th>
                <th className="py-3 px-3">Sector</th>
                <th className="py-3 px-3">Client Name / Category</th>
                <th className="py-3 px-3">Side</th>
                <th className="py-3 px-3 text-right">Deal Volume (Shares)</th>
                <th className="py-3 px-3 text-right">Price (₹)</th>
                <th className="py-3 px-3 text-right">Turnover (₹ Cr)</th>
                <th className="py-3 px-3 text-right">% Float</th>
                <th className="py-3 px-3">Impact %</th>
                <th className="py-3 px-3">Strategic Thesis</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredAndSortedDeals.map((deal) => {
                const isBuy = deal.tradeType === 'BUY';
                const isBlock = deal.dealType === 'BLOCK_DEAL';
                const isHighVolume = deal.quantity >= 3000000;

                return (
                  <tr
                    key={deal.id}
                    className="hover:bg-slate-900/60 transition-colors group cursor-pointer"
                    onClick={() => {
                      if (onNavigateToDiagnostics) onNavigateToDiagnostics(deal.symbol);
                    }}
                  >
                    {/* Time & Exchange */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div className="font-bold text-slate-200 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-blue-400" />
                        <span>{deal.timeFormatted}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <span className="px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-bold font-sans">
                          {deal.exchange}
                        </span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                            isBlock ? 'bg-indigo-500/20 text-indigo-300' : 'bg-purple-500/20 text-purple-300'
                          }`}
                        >
                          {isBlock ? 'BLOCK' : 'BULK'}
                        </span>
                      </div>
                    </td>

                    {/* Symbol & Company */}
                    <td className="py-3 px-3">
                      <div className="font-black text-slate-100 flex items-center gap-1.5">
                        <span>{deal.symbol}</span>
                        {isHighVolume && (
                          <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-black">
                            WHALE
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[130px] font-sans">
                        {deal.companyName}
                      </div>
                    </td>

                    {/* Sector */}
                    <td className="py-3 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                      {deal.sector}
                    </td>

                    {/* Client Name & Category */}
                    <td className="py-3 px-3 max-w-[200px]">
                      <div className="font-bold text-slate-200 truncate">{deal.clientName}</div>
                      <div className="text-[10px] flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`px-1.5 py-0.2 rounded font-bold text-[9px] ${
                            deal.clientCategory === 'FII'
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                              : deal.clientCategory === 'DII'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}
                        >
                          {deal.clientCategory}
                        </span>
                        <span className="text-slate-400 text-[10px]">RVOL {deal.rvolMultiplier}x</span>
                      </div>
                    </td>

                    {/* Side (BUY / SELL) */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded-lg text-[10px] font-black uppercase inline-flex items-center gap-1 ${
                          isBuy
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        {isBuy ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        <span>{isBuy ? 'BUY' : 'SELL'}</span>
                      </span>
                    </td>

                    {/* Deal Volume (Shares) */}
                    <td className="py-3 px-3 text-right">
                      <div className="font-black text-blue-400 text-sm">
                        {(deal.quantity / 1000000).toFixed(2)}M
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {deal.quantity.toLocaleString('en-IN')} shares
                      </div>
                    </td>

                    {/* Execution Price (₹) */}
                    <td className="py-3 px-3 text-right font-bold text-slate-200">
                      ₹{deal.price.toFixed(2)}
                    </td>

                    {/* Turnover (₹ Cr) */}
                    <td className="py-3 px-3 text-right">
                      <div className="font-black text-indigo-400">
                        ₹{deal.valueInCr.toFixed(2)} Cr
                      </div>
                    </td>

                    {/* % of Free Float */}
                    <td className="py-3 px-3 text-right text-slate-300 font-bold">
                      {deal.percentOfEquity.toFixed(2)}%
                    </td>

                    {/* Price Impact % */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <div
                        className={`font-black flex items-center gap-1 ${
                          deal.priceImpactPct >= 0 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {deal.priceImpactPct >= 0 ? '+' : ''}
                        {deal.priceImpactPct.toFixed(2)}%
                      </div>
                      <div className="text-[10px] text-slate-400">CMP: ₹{deal.marketPrice}</div>
                    </td>

                    {/* Strategic Thesis */}
                    <td className="py-3 px-3 max-w-[220px]">
                      <div className="text-[11px] text-slate-300 font-sans line-clamp-2">
                        {deal.strategicIntent}
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3 px-3 text-right whitespace-nowrap">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onNavigateToDiagnostics) onNavigateToDiagnostics(deal.symbol);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-[10px] transition-all inline-flex items-center gap-1 shadow-xs"
                      >
                        <span>Diagnostics</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 5. SIMULATE / MODEL NEW DEAL MODAL */}
      {/* ------------------------------------------------------------- */}
      {isSimulateModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            className={`w-full max-w-xl p-6 rounded-3xl border shadow-2xl space-y-4 ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/60">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-400" />
                <h3 className="text-lg font-black font-mono italic">
                  Model Institutional Bulk / Block Deal
                </h3>
              </div>
              <button
                onClick={() => setIsSimulateModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 font-mono text-xs px-2 py-1 rounded-lg bg-slate-800"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleAddDeal} className="space-y-4 font-mono text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Stock Symbol
                  </label>
                  <input
                    type="text"
                    value={newSymbol}
                    onChange={(e) => setNewSymbol(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Sector
                  </label>
                  <input
                    type="text"
                    value={newSector}
                    onChange={(e) => setNewSector(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Client / Fund Name
                  </label>
                  <input
                    type="text"
                    value={newClient}
                    onChange={(e) => setNewClient(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Client Category
                  </label>
                  <select
                    value={newClientCat}
                    onChange={(e) => setNewClientCat(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="FII">FII (Foreign Institutional)</option>
                    <option value="DII">DII (Domestic Mutual Fund)</option>
                    <option value="PROMOTER">Promoter / Group</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Deal Type
                  </label>
                  <select
                    value={newDealType}
                    onChange={(e) => setNewDealType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="BLOCK_DEAL">BLOCK DEAL (Special Window)</option>
                    <option value="BULK_DEAL">BULK DEAL (Continuous Market)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Trade Side
                  </label>
                  <select
                    value={newTradeType}
                    onChange={(e) => setNewTradeType(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="BUY">BUY (Accumulation)</option>
                    <option value="SELL">SELL (Distribution)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Deal Volume (Quantity in Shares)
                  </label>
                  <input
                    type="number"
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(Number(e.target.value))}
                    required
                    min={1000}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                    Execution Price (₹)
                  </label>
                  <input
                    type="number"
                    step="0.05"
                    value={newPrice}
                    onChange={(e) => setNewPrice(Number(e.target.value))}
                    required
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1">
                  Strategic Intent / Analyst Thesis
                </label>
                <textarea
                  value={newStrategicIntent}
                  onChange={(e) => setNewStrategicIntent(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-100 font-sans focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/30 flex items-center justify-between">
                <span className="text-slate-300">Estimated Deal Turnover:</span>
                <span className="font-black text-blue-400 text-sm">
                  ₹{(((newQuantity * newPrice) / 10000000)).toFixed(2)} Cr
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSimulateModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-black shadow-md shadow-blue-600/30"
                >
                  Inject Deal to Feed
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
