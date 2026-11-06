import React, { useState } from 'react';
import {
  CheckCircle2,
  Key,
  Lock,
  RefreshCw,
  Server,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { BrokerConfig } from '../types';

interface BrokerConfigViewProps {
  broker: BrokerConfig;
  onUpdateBroker: (newConfig: Partial<BrokerConfig>) => void;
  theme?: 'dark' | 'light';
}

export const BrokerConfigView: React.FC<BrokerConfigViewProps> = ({
  broker,
  onUpdateBroker,
  theme = 'dark',
}) => {
  const isDark = theme === 'dark';
  const [formData, setFormData] = useState<BrokerConfig>(broker);
  const [saveStatus, setSaveStatus] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateBroker(formData);
    setSaveStatus('Broker integration saved successfully!');
    setTimeout(() => setSaveStatus(''), 3000);
  };

  return (
    <div
      className={`border rounded-2xl p-4 sm:p-6 my-4 sm:my-6 transition-colors ${
        isDark
          ? 'bg-slate-900 border-slate-800 text-slate-100'
          : 'bg-white border-slate-200 text-slate-900 shadow-sm'
      }`}
    >
      <div
        className={`flex flex-wrap items-center justify-between pb-4 mb-6 border-b gap-3 ${
          isDark ? 'border-slate-800' : 'border-slate-200'
        }`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`p-2.5 rounded-xl ${
              isDark ? 'bg-slate-950 text-emerald-400' : 'bg-slate-100 text-emerald-600'
            }`}
          >
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-black italic tracking-tight uppercase">
              Broker Feed Integration
            </h2>
            <p className="text-xs font-mono opacity-60">
              Connect to Dhan HQ, Fyers API v3, Zerodha Kite Connect, Upstox v2, Angel One, or Live Simulator
            </p>
          </div>
        </div>

        <div
          className={`flex items-center gap-2 px-3 py-1.5 text-xs font-mono rounded-lg border ${
            isDark
              ? 'bg-slate-950 border-slate-800 text-slate-300'
              : 'bg-slate-50 border-slate-200 text-slate-700'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="opacity-60">Status:</span>
          <span className="font-bold text-emerald-500 uppercase">{broker.status}</span>
        </div>
      </div>

      {saveStatus && (
        <div className="mb-4 p-3 bg-emerald-600 text-white font-mono text-xs rounded-xl flex items-center gap-2 shadow-md">
          <CheckCircle2 className="w-4 h-4" />
          <span>{saveStatus}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Broker Selector Grid */}
        <div>
          <label className="text-xs font-mono font-bold uppercase block mb-3 opacity-80">
            Active Data Provider
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 font-mono">
            {[
              { id: 'simulator', label: 'Live Simulator', desc: 'NSE Real-Time Walk' },
              { id: 'dhan', label: 'Dhan HQ', desc: 'Dhan API v2 Feed' },
              { id: 'zerodha', label: 'Zerodha Kite', desc: 'Kite Connect API' },
              { id: 'fyers', label: 'Fyers API v3', desc: 'Fyers Websocket' },
              { id: 'upstox', label: 'Upstox v2', desc: 'Upstox Feed' },
              { id: 'angelone', label: 'Angel One', desc: 'SmartAPI Connector' },
            ].map((b) => (
              <button
                type="button"
                key={b.id}
                onClick={() =>
                  setFormData({ ...formData, selectedBroker: b.id as any })
                }
                className={`p-3 rounded-xl border text-left transition-all ${
                  formData.selectedBroker === b.id
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-md font-bold'
                    : isDark
                    ? 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <div className="font-bold text-xs uppercase">{b.label}</div>
                <div className="text-[10px] opacity-70 mt-1">{b.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Credentials Form */}
        {formData.selectedBroker !== 'simulator' && (
          <div
            className={`p-4 sm:p-5 rounded-xl border space-y-4 font-mono ${
              isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-slate-50 border-slate-200'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-black uppercase">
                {formData.selectedBroker === 'dhan'
                  ? 'DHAN HQ API V2'
                  : formData.selectedBroker.toUpperCase()}{' '}
                CREDENTIALS
              </h3>
              {formData.selectedBroker === 'dhan' && (
                <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold rounded uppercase">
                  ⚡ DHAN HQ CONNECT READY
                </span>
              )}
              {formData.selectedBroker === 'fyers' && (
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 border border-blue-500/30 text-[10px] font-bold rounded uppercase">
                  ⚡ FYERS API V3 & LIVE REAL MARKET FEED READY
                </span>
              )}
            </div>

            {formData.selectedBroker === 'fyers' && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[11px] space-y-1.5 text-blue-300 font-sans">
                <div className="font-bold uppercase tracking-wider text-[10px] text-blue-400">
                  📍 FYERS API DASHBOARD SETTINGS (COPY & PASTE INTO FYERS DASHBOARD)
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[10px]">
                  <span>Redirect URL: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-emerald-400 select-all">{window.location.origin}/api/fyers/callback</code></span>
                  <span>Webhook URL: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-amber-400 select-all">{window.location.origin}/api/webhook</code></span>
                </div>
                <p className="text-[10px] text-slate-400">
                  * Note: If Access Token is blank, the platform automatically streams live quotes & tick data using high-frequency real-time NSE market feeds!
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="opacity-60 block mb-1 uppercase text-[10px] font-bold">
                  {formData.selectedBroker === 'dhan'
                    ? 'Dhan Client ID / User ID'
                    : formData.selectedBroker === 'fyers'
                    ? 'Fyers App ID (e.g. XY12345-100)'
                    : 'API Key / Client ID'}
                </label>
                <input
                  type="text"
                  placeholder={
                    formData.selectedBroker === 'dhan'
                      ? 'e.g. 1000349821'
                      : formData.selectedBroker === 'fyers'
                      ? 'e.g. KC18090-100'
                      : 'Enter API Key'
                  }
                  value={formData.fyersAppId || formData.apiKey}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      apiKey: e.target.value,
                      fyersAppId: e.target.value,
                    })
                  }
                  className={`w-full px-3 py-2 rounded-lg border font-bold focus:outline-none ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-slate-100'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="opacity-60 block mb-1 uppercase text-[10px] font-bold">
                  {formData.selectedBroker === 'dhan'
                    ? 'Dhan API Secret'
                    : formData.selectedBroker === 'fyers'
                    ? 'Fyers Secret ID'
                    : 'API Secret'}
                </label>
                <input
                  type="password"
                  placeholder="Enter API Secret"
                  value={formData.apiSecret}
                  onChange={(e) =>
                    setFormData({ ...formData, apiSecret: e.target.value })
                  }
                  className={`w-full px-3 py-2 rounded-lg border font-bold focus:outline-none ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-slate-100'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>

              <div>
                <label className="opacity-60 block mb-1 uppercase text-[10px] font-bold">
                  {formData.selectedBroker === 'dhan'
                    ? 'Access Token / JWT'
                    : formData.selectedBroker === 'fyers'
                    ? 'Fyers Access Token (v3)'
                    : 'Access Token'}
                </label>
                <input
                  type="password"
                  placeholder={
                    formData.selectedBroker === 'dhan'
                      ? 'Dhan Access Token'
                      : formData.selectedBroker === 'fyers'
                      ? 'v3 Access Token'
                      : 'Enter Access Token'
                  }
                  value={formData.fyersAccessToken || formData.accessToken}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      accessToken: e.target.value,
                      fyersAccessToken: e.target.value,
                    })
                  }
                  className={`w-full px-3 py-2 rounded-lg border font-bold focus:outline-none ${
                    isDark
                      ? 'bg-slate-900 border-slate-700 text-slate-100'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-end font-mono">
          <button
            type="submit"
            className="px-5 py-2.5 bg-[#141414] text-[#E4E3E0] hover:bg-[#00FF00] hover:text-[#141414] font-bold text-xs uppercase transition-colors border border-[#141414]"
          >
            Save Broker Settings
          </button>
        </div>
      </form>
    </div>
  );
};
