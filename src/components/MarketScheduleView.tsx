import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  Info,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import {
  DEFAULT_MARKET_HOURS,
  INITIAL_MARKET_HOLIDAYS,
  MarketHoliday,
  MarketSessionConfig,
  MarketStatus,
  calculateMarketStatus,
  formatTime12h,
} from '../data/marketSchedule';

interface MarketScheduleViewProps {
  theme?: 'dark' | 'light';
}

export const MarketScheduleView: React.FC<MarketScheduleViewProps> = ({
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';

  // State for Market Hours
  const [hoursConfig, setHoursConfig] = useState<MarketSessionConfig>(() => {
    const saved = localStorage.getItem('market_hours_config');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse market hours config', e);
      }
    }
    return DEFAULT_MARKET_HOURS;
  });

  // State for Market Holidays
  const [holidays, setHolidays] = useState<MarketHoliday[]>(() => {
    const saved = localStorage.getItem('market_holidays_list');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse market holidays', e);
      }
    }
    return INITIAL_MARKET_HOLIDAYS;
  });

  // Live Status State
  const [marketStatus, setMarketStatus] = useState<MarketStatus>(() =>
    calculateMarketStatus(hoursConfig, holidays)
  );

  // Form states for editing market hours
  const [preOpenStart, setPreOpenStart] = useState(hoursConfig.preOpenStart);
  const [regularOpen, setRegularOpen] = useState(hoursConfig.regularOpen);
  const [regularClose, setRegularClose] = useState(hoursConfig.regularClose);
  const [postMarketEnd, setPostMarketEnd] = useState(hoursConfig.postMarketEnd);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Filters for Holiday Table
  const [yearFilter, setYearFilter] = useState<'ALL' | '2025' | '2026'>('ALL');
  const [exchangeFilter, setExchangeFilter] = useState<'ALL' | 'NSE' | 'BSE' | 'BOTH'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State for Adding New Holiday
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayExchange, setNewHolidayExchange] = useState<'NSE' | 'BSE' | 'BOTH'>('BOTH');
  const [newHolidayType, setNewHolidayType] = useState<'TRADING_HOLIDAY' | 'SPECIAL_SESSION' | 'CLEARING_HOLIDAY'>('TRADING_HOLIDAY');
  const [newHolidayDesc, setNewHolidayDesc] = useState('');

  // Ticker timer for live market status updates every second
  useEffect(() => {
    const interval = setInterval(() => {
      setMarketStatus(calculateMarketStatus(hoursConfig, holidays));
    }, 1000);
    return () => clearInterval(interval);
  }, [hoursConfig, holidays]);

  // Handle Save Hours
  const handleSaveHours = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: MarketSessionConfig = {
      ...hoursConfig,
      preOpenStart,
      preOpenEnd: regularOpen,
      regularOpen,
      regularClose,
      postMarketEnd,
    };
    setHoursConfig(updated);
    localStorage.setItem('market_hours_config', JSON.stringify(updated));
    setSaveSuccessMsg('Market trading opening & closing hours updated successfully!');
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // Handle Reset Hours to Exchange Default
  const handleResetHours = () => {
    setHoursConfig(DEFAULT_MARKET_HOURS);
    setPreOpenStart(DEFAULT_MARKET_HOURS.preOpenStart);
    setRegularOpen(DEFAULT_MARKET_HOURS.regularOpen);
    setRegularClose(DEFAULT_MARKET_HOURS.regularClose);
    setPostMarketEnd(DEFAULT_MARKET_HOURS.postMarketEnd);
    localStorage.removeItem('market_hours_config');
    setSaveSuccessMsg('Reset to standard NSE/BSE trading hours.');
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // Handle Add Holiday
  const handleAddHoliday = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayDate || !newHolidayName) return;

    const dateObj = new Date(newHolidayDate);
    const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });

    const newHol: MarketHoliday = {
      id: `custom-hol-${Date.now()}`,
      date: newHolidayDate,
      day: dayOfWeek,
      name: newHolidayName,
      exchange: newHolidayExchange,
      type: newHolidayType,
      description: newHolidayDesc,
      isCustom: true,
    };

    const updated = [...holidays, newHol].sort((a, b) => a.date.localeCompare(b.date));
    setHolidays(updated);
    localStorage.setItem('market_holidays_list', JSON.stringify(updated));

    // Reset form
    setNewHolidayDate('');
    setNewHolidayName('');
    setNewHolidayDesc('');
    setIsAddModalOpen(false);
    setSaveSuccessMsg(`Added market holiday: ${newHolidayName}`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  // Handle Delete Holiday
  const handleDeleteHoliday = (id: string) => {
    const updated = holidays.filter((h) => h.id !== id);
    setHolidays(updated);
    localStorage.setItem('market_holidays_list', JSON.stringify(updated));
  };

  // Handle Reset All Holidays to Default
  const handleResetHolidays = () => {
    if (confirm('Are you sure you want to reset the holiday calendar to standard NSE/BSE 2025-2026 defaults?')) {
      setHolidays(INITIAL_MARKET_HOLIDAYS);
      localStorage.removeItem('market_holidays_list');
      setSaveSuccessMsg('Holiday calendar reset to default stock exchange schedule.');
      setTimeout(() => setSaveSuccessMsg(null), 3000);
    }
  };

  // Filtered Holidays
  const filteredHolidays = holidays.filter((h) => {
    if (yearFilter !== 'ALL' && !h.date.startsWith(yearFilter)) return false;
    if (exchangeFilter !== 'ALL' && h.exchange !== exchangeFilter && h.exchange !== 'BOTH') return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        h.name.toLowerCase().includes(q) ||
        h.date.includes(q) ||
        h.day.toLowerCase().includes(q) ||
        (h.description && h.description.toLowerCase().includes(q))
      );
    }
    return true;
  });

  return (
    <div className="space-y-6 my-6 font-sans">
      {/* HEADER HERO BANNER */}
      <div
        className={`p-6 rounded-2xl border transition-colors flex flex-col md:flex-row items-start md:items-center justify-between gap-4 ${
          isDark
            ? 'bg-slate-900/90 border-slate-800 text-slate-100 shadow-xl'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`p-3.5 rounded-2xl font-bold flex items-center justify-center ${
              isDark
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            }`}
          >
            <Clock className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-lg font-black italic tracking-tight uppercase">
                NSE / BSE Market Schedule & Holiday Manager
              </h2>
              <span
                className={`px-2.5 py-0.5 text-xs font-mono font-bold rounded-md uppercase border ${marketStatus.statusBadgeColor}`}
              >
                ● {marketStatus.statusLabel}
              </span>
            </div>
            <p className="text-xs font-mono opacity-70 mt-1">
              Indian Standard Time (IST): <strong className="text-indigo-400">{marketStatus.currentISTTime}</strong> | Date: {marketStatus.currentDate}
            </p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all flex items-center gap-1.5 shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Holiday</span>
          </button>
          <button
            onClick={handleResetHolidays}
            className={`px-3 py-2 rounded-xl border font-bold transition-all flex items-center gap-1.5 ${
              isDark
                ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200'
            }`}
            title="Reset holiday calendar to defaults"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Calendar</span>
          </button>
        </div>
      </div>

      {saveSuccessMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* LIVE MARKET SESSION TIMELINE CARD */}
      <div
        className={`p-6 rounded-2xl border transition-colors ${
          isDark
            ? 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-xl'
            : 'bg-white border-slate-200 text-slate-900 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 mb-5 border-b border-slate-800/80 gap-3 font-mono">
          <div>
            <h3 className="text-sm font-black italic tracking-tight uppercase flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Today's Market Session Timeline (IST)</span>
            </h3>
            <p className="text-xs opacity-60 mt-0.5">{marketStatus.timeMessage}</p>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="opacity-60 uppercase text-[10px] font-bold">Timezone:</span>
            <span className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 font-bold border border-indigo-500/20">
              Asia/Kolkata (+05:30)
            </span>
          </div>
        </div>

        {/* Session Progress Visualizer */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 font-mono">
          {/* Pre-open */}
          <div
            className={`p-4 rounded-xl border relative overflow-hidden transition-all ${
              marketStatus.session === 'PRE_OPEN'
                ? 'bg-sky-500/10 border-sky-500 text-sky-300 ring-2 ring-sky-500/30'
                : isDark
                ? 'bg-slate-950/60 border-slate-800 text-slate-400'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">
                1. Pre-Open Session
              </span>
              <span className="text-xs font-bold">{formatTime12h(hoursConfig.preOpenStart)} - {formatTime12h(hoursConfig.preOpenEnd)}</span>
            </div>
            <div className="text-sm font-black mt-1">Order Entry & Matching</div>
            <p className="text-[10px] opacity-60 mt-1">Order collection, price discovery & SL modification</p>
          </div>

          {/* Regular Session */}
          <div
            className={`p-4 rounded-xl border relative overflow-hidden transition-all ${
              marketStatus.session === 'REGULAR'
                ? 'bg-emerald-500/10 border-emerald-500 text-emerald-300 ring-2 ring-emerald-500/30'
                : isDark
                ? 'bg-slate-950/60 border-slate-800 text-slate-400'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">
                2. Regular Trading Hours
              </span>
              <span className="text-xs font-bold text-emerald-400">{formatTime12h(hoursConfig.regularOpen)} - {formatTime12h(hoursConfig.regularClose)}</span>
            </div>
            <div className="text-sm font-black mt-1">Continuous Live Execution</div>
            <p className="text-[10px] opacity-60 mt-1">Normal Equity, F&O, intraday & delivery matching</p>
          </div>

          {/* Post-Market */}
          <div
            className={`p-4 rounded-xl border relative overflow-hidden transition-all ${
              marketStatus.session === 'POST_MARKET'
                ? 'bg-amber-500/10 border-amber-500 text-amber-300 ring-2 ring-amber-500/30'
                : isDark
                ? 'bg-slate-950/60 border-slate-800 text-slate-400'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-70">
                3. Post-Closing Session
              </span>
              <span className="text-xs font-bold">{formatTime12h(hoursConfig.regularClose)} - {formatTime12h(hoursConfig.postMarketEnd)}</span>
            </div>
            <div className="text-sm font-black mt-1">Closing Price Match</div>
            <p className="text-[10px] opacity-60 mt-1">Orders placed at closing price for cash segment</p>
          </div>

          {/* Next Holiday Highlight */}
          <div
            className={`p-4 rounded-xl border transition-all ${
              isDark
                ? 'bg-indigo-950/30 border-indigo-800/50 text-indigo-200'
                : 'bg-indigo-50 border-indigo-200 text-indigo-900'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] uppercase font-bold tracking-wider opacity-80 text-indigo-400">
                Next Market Holiday
              </span>
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            {marketStatus.nextHoliday ? (
              <div>
                <div className="text-xs font-black truncate">{marketStatus.nextHoliday.name}</div>
                <div className="text-[11px] font-mono opacity-80 mt-1">
                  {marketStatus.nextHoliday.date} ({marketStatus.nextHoliday.day})
                </div>
              </div>
            ) : (
              <div className="text-xs opacity-60">No upcoming holidays scheduled</div>
            )}
          </div>
        </div>
      </div>

      {/* GRID: 1. UPDATE MARKET HOURS FORM & 2. HOLIDAY SPOTLIGHT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* EDIT / UPDATE MARKET OPENING & CLOSING TIME FORM */}
        <div
          className={`lg:col-span-5 p-6 rounded-2xl border transition-colors font-mono ${
            isDark
              ? 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-xl'
              : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              <h3 className="text-sm font-black italic tracking-tight uppercase">
                Update Market Hours Configuration
              </h3>
            </div>
            <button
              onClick={handleResetHours}
              className="text-[10px] font-bold text-indigo-400 hover:underline flex items-center gap-1"
              title="Reset to NSE/BSE defaults"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Defaults</span>
            </button>
          </div>

          <form onSubmit={handleSaveHours} className="space-y-4">
            <div>
              <label className="block text-[11px] uppercase font-bold opacity-70 mb-1">
                Pre-Open Session Start Time (IST)
              </label>
              <input
                type="time"
                value={preOpenStart}
                onChange={(e) => setPreOpenStart(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs font-bold ${
                  isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300'
                }`}
                required
              />
              <span className="text-[10px] opacity-50 block mt-0.5">NSE Standard: 09:00 AM IST</span>
            </div>

            <div>
              <label className="block text-[11px] uppercase font-bold opacity-70 mb-1 text-emerald-400">
                Market Regular Opening Time (IST)
              </label>
              <input
                type="time"
                value={regularOpen}
                onChange={(e) => setRegularOpen(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs font-bold text-emerald-400 ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
                }`}
                required
              />
              <span className="text-[10px] opacity-50 block mt-0.5">NSE Standard: 09:15 AM IST</span>
            </div>

            <div>
              <label className="block text-[11px] uppercase font-bold opacity-70 mb-1 text-rose-400">
                Market Regular Closing Time (IST)
              </label>
              <input
                type="time"
                value={regularClose}
                onChange={(e) => setRegularClose(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs font-bold text-rose-400 ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
                }`}
                required
              />
              <span className="text-[10px] opacity-50 block mt-0.5">NSE Standard: 03:30 PM (15:30) IST</span>
            </div>

            <div>
              <label className="block text-[11px] uppercase font-bold opacity-70 mb-1">
                Post-Market Closing Time (IST)
              </label>
              <input
                type="time"
                value={postMarketEnd}
                onChange={(e) => setPostMarketEnd(e.target.value)}
                className={`w-full px-3 py-2 rounded-xl border text-xs font-bold ${
                  isDark ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-300'
                }`}
                required
              />
              <span className="text-[10px] opacity-50 block mt-0.5">NSE Standard: 04:00 PM (16:00) IST</span>
            </div>

            <div className="pt-2 flex items-center gap-3">
              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-xl font-bold text-xs uppercase bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Save Market Hours</span>
              </button>
            </div>
          </form>
        </div>

        {/* MARKET HOLIDAY CALENDAR LIST TABLE */}
        <div
          className={`lg:col-span-7 p-6 rounded-2xl border transition-colors font-mono ${
            isDark
              ? 'bg-slate-900/80 border-slate-800 text-slate-100 shadow-xl'
              : 'bg-white border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 mb-4 border-b border-slate-800/80 gap-3">
            <div>
              <h3 className="text-sm font-black italic tracking-tight uppercase flex items-center gap-2">
                <Calendar className="w-4 h-4 text-emerald-400" />
                <span>Stock Market Trading Holidays ({filteredHolidays.length})</span>
              </h3>
              <p className="text-xs opacity-60 mt-0.5">Official NSE & BSE Exchange Holiday Schedule</p>
            </div>

            <button
              onClick={() => setIsAddModalOpen(true)}
              className="px-3 py-1.5 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all inline-flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Holiday</span>
            </button>
          </div>

          {/* Holiday Search & Filter Controls */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-4 text-xs">
            {/* Search input */}
            <div className="sm:col-span-6 relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
              <input
                type="text"
                placeholder="Search holiday name, date..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-9 pr-3 py-1.5 rounded-xl border focus:outline-none ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-200'
                }`}
              />
            </div>

            {/* Year filter */}
            <div className="sm:col-span-3">
              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value as any)}
                className={`w-full px-2.5 py-1.5 rounded-xl border font-bold focus:outline-none ${
                  isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <option value="ALL">All Years (2025 & 2026)</option>
                <option value="2025">2025 Holidays</option>
                <option value="2026">2026 Holidays</option>
              </select>
            </div>

            {/* Exchange filter */}
            <div className="sm:col-span-3">
              <select
                value={exchangeFilter}
                onChange={(e) => setExchangeFilter(e.target.value as any)}
                className={`w-full px-2.5 py-1.5 rounded-xl border font-bold focus:outline-none ${
                  isDark ? 'bg-slate-950 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                <option value="ALL">All Exchanges</option>
                <option value="NSE">NSE Only</option>
                <option value="BSE">BSE Only</option>
                <option value="BOTH">NSE & BSE Both</option>
              </select>
            </div>
          </div>

          {/* Table list */}
          <div className="overflow-x-auto max-h-[360px] overflow-y-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 z-10">
                <tr
                  className={`uppercase text-[10px] font-bold border-b ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-400'
                      : 'bg-slate-100 border-slate-200 text-slate-600'
                  }`}
                >
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Day</th>
                  <th className="py-2.5 px-3">Holiday Name</th>
                  <th className="py-2.5 px-3">Exchange</th>
                  <th className="py-2.5 px-3">Session Type</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-slate-800/80' : 'divide-slate-200'}`}>
                {filteredHolidays.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center opacity-50 font-mono">
                      No market holidays found matching your search.
                    </td>
                  </tr>
                ) : (
                  filteredHolidays.map((h) => {
                    const isToday = marketStatus.currentDate.startsWith(h.date);
                    return (
                      <tr
                        key={h.id}
                        className={`transition-colors ${
                          isToday
                            ? 'bg-amber-500/10 font-bold'
                            : isDark
                            ? 'hover:bg-slate-800/50'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono font-bold">{h.date}</td>
                        <td className="py-2.5 px-3 opacity-80">{h.day}</td>
                        <td className="py-2.5 px-3 font-bold">
                          <div className="flex items-center gap-1.5">
                            <span>{h.name}</span>
                            {h.isCustom && (
                              <span className="px-1.5 py-0.2 text-[9px] bg-indigo-500/20 text-indigo-400 rounded">
                                Custom
                              </span>
                            )}
                          </div>
                          {h.description && (
                            <div className="text-[10px] opacity-60 font-normal">{h.description}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 text-[10px] bg-slate-800 text-slate-300 font-mono rounded">
                            {h.exchange}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 text-[10px] font-bold rounded uppercase ${
                              h.type === 'SPECIAL_SESSION'
                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            {h.type.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {h.isCustom && (
                            <button
                              onClick={() => handleDeleteHoliday(h.id)}
                              className="p-1 text-rose-400 hover:text-rose-300 transition-colors"
                              title="Delete custom holiday"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL FOR ADDING CUSTOM MARKET HOLIDAY */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4 font-mono">
          <div
            className={`w-full max-w-md rounded-2xl border p-6 shadow-2xl transition-all ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
              <h3 className="text-sm font-black italic tracking-tight uppercase flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-400" />
                <span>Add Custom Market Holiday</span>
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-lg opacity-70 hover:opacity-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddHoliday} className="space-y-4 text-xs">
              <div>
                <label className="block text-[10px] uppercase font-bold opacity-70 mb-1">
                  Holiday Date
                </label>
                <input
                  type="date"
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border font-bold ${
                    isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
                  }`}
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold opacity-70 mb-1">
                  Holiday Title / Occasion Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Regional Festival / Special Exchange Closure"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border font-bold ${
                    isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
                  }`}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold opacity-70 mb-1">
                    Applicable Exchange
                  </label>
                  <select
                    value={newHolidayExchange}
                    onChange={(e) => setNewHolidayExchange(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl border font-bold ${
                      isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="BOTH">NSE & BSE Both</option>
                    <option value="NSE">NSE Only</option>
                    <option value="BSE">BSE Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold opacity-70 mb-1">
                    Session Type
                  </label>
                  <select
                    value={newHolidayType}
                    onChange={(e) => setNewHolidayType(e.target.value as any)}
                    className={`w-full px-3 py-2 rounded-xl border font-bold ${
                      isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
                    }`}
                  >
                    <option value="TRADING_HOLIDAY">Trading Holiday</option>
                    <option value="SPECIAL_SESSION">Special Session (Muhurat)</option>
                    <option value="CLEARING_HOLIDAY">Clearing Holiday</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold opacity-70 mb-1">
                  Description / Timing Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g., Evening session active or settlement closed..."
                  value={newHolidayDesc}
                  onChange={(e) => setNewHolidayDesc(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs ${
                    isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-50 border-slate-300'
                  }`}
                />
              </div>

              <div className="pt-2 flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl border text-xs font-bold uppercase opacity-70 hover:opacity-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold uppercase shadow-md cursor-pointer"
                >
                  Save Holiday
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
