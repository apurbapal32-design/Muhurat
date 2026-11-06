import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  Share2,
  Copy,
  Check,
  Smartphone,
  Laptop,
  Globe,
  QrCode,
  ExternalLink,
  Sparkles,
  X,
  MessageSquare,
  Send,
  Twitter,
  Linkedin,
  Mail,
  Info,
  Layers,
  Search,
  Filter,
  CheckCircle2,
  ArrowLeft,
} from 'lucide-react';
import { ScannedStock } from '../types';

interface UtmGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  stocks?: ScannedStock[];
}

type DeviceTarget = 'mobile' | 'laptop' | 'all';

export const UtmGeneratorModal: React.FC<UtmGeneratorModalProps> = ({
  isOpen,
  onClose,
  stocks = [],
}) => {
  const [baseUrl, setBaseUrl] = useState<string>('');
  const [deviceTarget, setDeviceTarget] = useState<DeviceTarget>('mobile');
  const [utmSource, setUtmSource] = useState<string>('whatsapp');
  const [utmMedium, setUtmMedium] = useState<string>('mobile_app');
  const [utmCampaign, setUtmCampaign] = useState<string>('nifty200_intraday');
  const [utmContent, setUtmContent] = useState<string>('buy_signals');
  const [utmTerm, setUtmTerm] = useState<string>('nse_breakout');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');

  const [copied, setCopied] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [activeSessionUtm, setActiveSessionUtm] = useState<Record<string, string> | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize Base URL and detect active incoming UTMs on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const currentOrigin = window.location.origin + window.location.pathname;
      setBaseUrl(currentOrigin);

      // Check incoming UTM params in URL
      const params = new URLSearchParams(window.location.search);
      const detected: Record<string, string> = {};
      ['utm_source', 'utm_medium', 'utm_campaign', 'utm_device', 'utm_content', 'utm_term', 'symbol'].forEach((key) => {
        const val = params.get(key);
        if (val) detected[key] = val;
      });

      if (Object.keys(detected).length > 0) {
        setActiveSessionUtm(detected);
      }
    }
  }, []);

  // Update UTM parameters when Device Target changes
  const handleDeviceSelect = (device: DeviceTarget) => {
    setDeviceTarget(device);
    if (device === 'mobile') {
      setUtmMedium('mobile_app');
      setUtmSource('whatsapp');
      setUtmContent('mobile_quick_scan');
    } else if (device === 'laptop') {
      setUtmMedium('desktop_web');
      setUtmSource('direct_bookmark');
      setUtmContent('laptop_trader_desk');
    } else {
      setUtmMedium('social');
      setUtmSource('twitter');
      setUtmContent('market_overview');
    }
  };

  // Preset Template loader
  const applyPreset = (preset: 'whatsapp_mobile' | 'telegram_mobile' | 'laptop_desk' | 'twitter_social') => {
    switch (preset) {
      case 'whatsapp_mobile':
        setDeviceTarget('mobile');
        setUtmSource('whatsapp');
        setUtmMedium('mobile_chat');
        setUtmCampaign('nifty200_breakout_alert');
        setUtmContent('mobile_share_link');
        break;
      case 'telegram_mobile':
        setDeviceTarget('mobile');
        setUtmSource('telegram');
        setUtmMedium('mobile_channel');
        setUtmCampaign('intraday_buy_signals');
        setUtmContent('telegram_scanner');
        break;
      case 'laptop_desk':
        setDeviceTarget('laptop');
        setUtmSource('trading_desk');
        setUtmMedium('laptop_browser');
        setUtmCampaign('nifty200_quant_dashboard');
        setUtmContent('desktop_screener');
        break;
      case 'twitter_social':
        setDeviceTarget('all');
        setUtmSource('twitter');
        setUtmMedium('social_post');
        setUtmCampaign('daily_market_heatmap');
        setUtmContent('top_picks');
        break;
    }
  };

  // Build full final URL
  const generateFullUrl = (): string => {
    try {
      const urlObj = new URL(baseUrl || window.location.href);
      if (utmSource) urlObj.searchParams.set('utm_source', utmSource.trim());
      if (utmMedium) urlObj.searchParams.set('utm_medium', utmMedium.trim());
      if (utmCampaign) urlObj.searchParams.set('utm_campaign', utmCampaign.trim());
      if (deviceTarget !== 'all') urlObj.searchParams.set('utm_device', deviceTarget);
      if (utmContent) urlObj.searchParams.set('utm_content', utmContent.trim());
      if (utmTerm) urlObj.searchParams.set('utm_term', utmTerm.trim());
      if (selectedSymbol) urlObj.searchParams.set('symbol', selectedSymbol.trim());

      return urlObj.toString();
    } catch {
      return `${baseUrl}?utm_source=${utmSource}&utm_medium=${utmMedium}&utm_campaign=${utmCampaign}&utm_device=${deviceTarget}`;
    }
  };

  const finalGeneratedUrl = generateFullUrl();

  // Generate QR code whenever the URL changes
  useEffect(() => {
    if (finalGeneratedUrl) {
      QRCode.toDataURL(finalGeneratedUrl, {
        width: 220,
        margin: 2,
        color: {
          dark: '#00FF00',
          light: '#0a0a0a',
        },
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.error('QR code error:', err));
    }
  }, [finalGeneratedUrl]);

  // Copy URL to Clipboard
  const handleCopy = () => {
    navigator.clipboard.writeText(finalGeneratedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Web Share API
  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Intra-Scan Nifty 200 Live Scanner',
          text: `Check out the Nifty 200 AI Scanner for Live Market Signals & Heatmap (${deviceTarget.toUpperCase()} optimized):`,
          url: finalGeneratedUrl,
        });
      } catch (e) {
        console.log('Share canceled or failed', e);
      }
    } else {
      handleCopy();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl text-slate-100 flex flex-col custom-scrollbar">
        {/* Header */}
        <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 text-emerald-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2 font-mono">
                UTM Link Generator
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-sans font-medium">
                  Mobile & Laptop Tracking
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Create custom UTM campaign links optimized for Mobile devices or Laptop/Desktop screens
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-mono font-bold flex items-center gap-1.5 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-indigo-400" />
              <span>Back / Close</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition"
              title="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6">
          {/* Active incoming UTM detector badge */}
          {activeSessionUtm && (
            <div className="p-3.5 bg-indigo-950/40 border border-indigo-500/30 rounded-xl text-xs flex items-start gap-3">
              <Info className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold text-indigo-300">Active UTM Session Detected: </span>
                <span className="text-slate-300 font-mono">
                  {Object.entries(activeSessionUtm)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(' | ')}
                </span>
              </div>
            </div>
          )}

          {/* Device Target Selection */}
          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2 font-mono">
              1. Select Target Device / Platform
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleDeviceSelect('mobile')}
                className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                  deviceTarget === 'mobile'
                    ? 'bg-emerald-500/10 border-emerald-500 text-emerald-400 font-bold shadow-lg shadow-emerald-500/5'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <Smartphone className="w-6 h-6" />
                <span className="text-xs">Mobile App / Browser</span>
                <span className="text-[10px] opacity-70 font-mono">utm_device=mobile</span>
              </button>

              <button
                type="button"
                onClick={() => handleDeviceSelect('laptop')}
                className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                  deviceTarget === 'laptop'
                    ? 'bg-indigo-500/10 border-indigo-500 text-indigo-400 font-bold shadow-lg shadow-indigo-500/5'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <Laptop className="w-6 h-6" />
                <span className="text-xs">Laptop / Desktop</span>
                <span className="text-[10px] opacity-70 font-mono">utm_device=laptop</span>
              </button>

              <button
                type="button"
                onClick={() => handleDeviceSelect('all')}
                className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-2 transition-all ${
                  deviceTarget === 'all'
                    ? 'bg-purple-500/10 border-purple-500 text-purple-400 font-bold shadow-lg shadow-purple-500/5'
                    : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                }`}
              >
                <Globe className="w-6 h-6" />
                <span className="text-xs">Universal / Multi-Device</span>
                <span className="text-[10px] opacity-70 font-mono">All Platforms</span>
              </button>
            </div>
          </div>

          {/* Quick Preset Buttons */}
          <div>
            <label className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2 font-mono">
              2. Quick Campaign Templates
            </label>
            <div className="flex flex-wrap gap-2 text-xs">
              <button
                type="button"
                onClick={() => applyPreset('whatsapp_mobile')}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-emerald-400 hover:bg-emerald-500/10 hover:border-emerald-500/40 transition flex items-center gap-1.5"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>WhatsApp Mobile Share</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('telegram_mobile')}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-sky-400 hover:bg-sky-500/10 hover:border-sky-500/40 transition flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Telegram Mobile Channel</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('laptop_desk')}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-indigo-400 hover:bg-indigo-500/10 hover:border-indigo-500/40 transition flex items-center gap-1.5"
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>Laptop Trading Desk</span>
              </button>

              <button
                type="button"
                onClick={() => applyPreset('twitter_social')}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-blue-400 hover:bg-blue-500/10 hover:border-blue-500/40 transition flex items-center gap-1.5"
              >
                <Twitter className="w-3.5 h-3.5" />
                <span>Twitter / X Social</span>
              </button>
            </div>
          </div>

          {/* Custom Parameters Form Grid */}
          <div className="space-y-4 bg-slate-900/60 p-4 rounded-xl border border-slate-800">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
              3. Configure UTM Parameters
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono">
              <div>
                <label className="text-slate-400 block mb-1">
                  Base Website URL <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://your-scanner-domain.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  Optional Stock Direct Link
                </label>
                <select
                  value={selectedSymbol}
                  onChange={(e) => setSelectedSymbol(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- No Specific Stock (All Nifty 200) --</option>
                  {stocks.map((s) => (
                    <option key={s.symbol} value={s.symbol}>
                      {s.symbol} - {s.name} (₹{s.price})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  UTM Source (<code className="text-emerald-400">utm_source</code>)
                </label>
                <input
                  type="text"
                  value={utmSource}
                  onChange={(e) => setUtmSource(e.target.value)}
                  placeholder="e.g. whatsapp, twitter, email"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  UTM Medium (<code className="text-emerald-400">utm_medium</code>)
                </label>
                <input
                  type="text"
                  value={utmMedium}
                  onChange={(e) => setUtmMedium(e.target.value)}
                  placeholder="e.g. mobile_app, desktop_web, cpc"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  UTM Campaign (<code className="text-emerald-400">utm_campaign</code>)
                </label>
                <input
                  type="text"
                  value={utmCampaign}
                  onChange={(e) => setUtmCampaign(e.target.value)}
                  placeholder="e.g. nifty200_live_scan"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">
                  UTM Content (<code className="text-emerald-400">utm_content</code>)
                </label>
                <input
                  type="text"
                  value={utmContent}
                  onChange={(e) => setUtmContent(e.target.value)}
                  placeholder="e.g. header_button, top_pick_buy"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>
          </div>

          {/* Generated Link Result & QR Code Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-stretch">
            {/* Formatted URL Box */}
            <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Generated UTM Tracking Link
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
                    Ready to share
                  </span>
                </div>

                <div className="p-3 bg-slate-950 border border-slate-800 rounded-lg font-mono text-xs text-emerald-400 break-all select-all leading-relaxed max-h-[100px] overflow-y-auto">
                  {finalGeneratedUrl}
                </div>
              </div>

              {/* Share & Copy Action Buttons */}
              <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className={`flex-1 min-w-[140px] px-4 py-2.5 rounded-lg font-mono text-xs font-bold transition flex items-center justify-center gap-2 ${
                    copied
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30'
                  }`}
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Copied to Clipboard!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy UTM Link</span>
                    </>
                  )}
                </button>

                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button
                    type="button"
                    onClick={handleNativeShare}
                    className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-bold transition flex items-center gap-2"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Mobile Share</span>
                  </button>
                )}

                <a
                  href={finalGeneratedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                  title="Test Link in New Tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>

              {/* Direct Social Share Row */}
              <div className="mt-3 flex items-center justify-between text-xs text-slate-400 pt-2 border-t border-slate-800/80">
                <span>One-Click Share:</span>
                <div className="flex items-center gap-2">
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                      `Nifty 200 Scanner: ${finalGeneratedUrl}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition"
                    title="Share to WhatsApp"
                  >
                    <MessageSquare className="w-4 h-4" />
                  </a>
                  <a
                    href={`https://t.me/share/url?url=${encodeURIComponent(
                      finalGeneratedUrl
                    )}&text=${encodeURIComponent('Nifty 200 Intraday AI Scanner')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 transition"
                    title="Share to Telegram"
                  >
                    <Send className="w-4 h-4" />
                  </a>
                  <a
                    href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(
                      `Nifty 200 Live Market Scanner (${deviceTarget}): `
                    )}&url=${encodeURIComponent(finalGeneratedUrl)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition"
                    title="Share to Twitter / X"
                  >
                    <Twitter className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>

            {/* Mobile Scan QR Code Box */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-between text-center">
              <div>
                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-slate-200 font-mono mb-2">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  <span>Scan on Mobile</span>
                </div>
                <p className="text-[11px] text-slate-400 mb-3">
                  Scan this QR code with your smartphone camera to open on mobile
                </p>

                {qrDataUrl ? (
                  <div className="p-2 bg-slate-950 rounded-xl border border-slate-800 inline-block shadow-inner">
                    <img
                      src={qrDataUrl}
                      alt="UTM Mobile QR Code"
                      className="w-36 h-36 mx-auto rounded-lg"
                    />
                  </div>
                ) : (
                  <div className="w-36 h-36 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-center text-slate-600 text-xs">
                    Generating...
                  </div>
                )}
              </div>

              <div className="mt-3 text-[10px] text-slate-500 font-mono">
                Device Target: <span className="text-emerald-400 font-bold">{deviceTarget.toUpperCase()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>UTM Parameters URL-encoded and validated for Google Analytics & Mixpanel</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-mono font-bold transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
