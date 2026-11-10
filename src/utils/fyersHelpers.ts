// Fyers API v3 Ticker & Symbol Helpers for NSE/BSE Indices & F&O Stocks
import { FyersQuote, SupportedIndexSymbol } from '../types';

export interface ParsedFyersSymbol {
  rawSymbol: string;
  cleanName: string;
  isSpot: boolean;
  isOption: boolean;
  isFuture: boolean;
  indexSymbol?: SupportedIndexSymbol;
  strike?: number;
  optionType?: 'CE' | 'PE';
  expiryCode?: string;
}

/**
 * Universal Parser for Fyers Symbols (Spots, Option Strikes, Futures, Equities)
 */
export function parseFyersSymbol(rawSymbol: string): ParsedFyersSymbol {
  const sym = (rawSymbol || '').toUpperCase().trim();

  // 1. Check Spot Indices
  if (
    sym === 'NSE:NIFTY50-INDEX' ||
    sym === 'NSE:NIFTY-INDEX' ||
    sym === 'NIFTY 50' ||
    sym === 'NIFTY50' ||
    sym === 'NIFTY'
  ) {
    return {
      rawSymbol: sym,
      cleanName: 'NIFTY 50',
      isSpot: true,
      isOption: false,
      isFuture: false,
      indexSymbol: 'NIFTY 50',
    };
  }

  if (
    sym === 'NSE:NIFTYBANK-INDEX' ||
    sym === 'BANKNIFTY' ||
    sym === 'NIFTY BANK' ||
    sym === 'NIFTYBANK'
  ) {
    return {
      rawSymbol: sym,
      cleanName: 'BANKNIFTY',
      isSpot: true,
      isOption: false,
      isFuture: false,
      indexSymbol: 'BANKNIFTY',
    };
  }

  if (
    sym === 'NSE:FINNIFTY-INDEX' ||
    sym === 'FINNIFTY' ||
    sym === 'NIFTY FINANCIAL SERVICES' ||
    sym === 'NIFTY FIN SERVICE'
  ) {
    return {
      rawSymbol: sym,
      cleanName: 'FINNIFTY',
      isSpot: true,
      isOption: false,
      isFuture: false,
      indexSymbol: 'FINNIFTY',
    };
  }

  if (
    sym === 'NSE:MIDCPNIFTY-INDEX' ||
    sym === 'NSE:NIFTYMIDSELECT-INDEX' ||
    sym === 'MIDCPNIFTY' ||
    sym === 'NIFTY MIDCAP SELECT' ||
    sym === 'NIFTY MID SELECT'
  ) {
    return {
      rawSymbol: sym,
      cleanName: 'MIDCPNIFTY',
      isSpot: true,
      isOption: false,
      isFuture: false,
      indexSymbol: 'MIDCPNIFTY',
    };
  }

  if (
    sym === 'BSE:SENSEX-INDEX' ||
    sym === 'BSE:SENSEX30-INDEX' ||
    sym === 'SENSEX' ||
    sym === 'BSE SENSEX' ||
    sym === 'SENSEX 30'
  ) {
    return {
      rawSymbol: sym,
      cleanName: 'SENSEX',
      isSpot: true,
      isOption: false,
      isFuture: false,
      indexSymbol: 'SENSEX',
    };
  }

  if (sym === 'NSE:INDIAVIX-INDEX' || sym === 'INDIAVIX' || sym === 'INDIA VIX') {
    return {
      rawSymbol: sym,
      cleanName: 'INDIAVIX',
      isSpot: true,
      isOption: false,
      isFuture: false,
    };
  }

  if (sym === 'NSE:NIFTYIT-INDEX' || sym === 'NIFTYIT' || sym === 'NIFTY IT') {
    return {
      rawSymbol: sym,
      cleanName: 'NIFTYIT',
      isSpot: true,
      isOption: false,
      isFuture: false,
    };
  }

  // 2. Check Option Contracts (e.g. NSE:NIFTY5026AUG24550CE, NSE:NIFTYBANK26AUG52200PE, etc.)
  const optionRegex = /^(?:NSE:|BSE:)?([A-Z0-9_]+?)(\d{2}[A-Z]{3}|\d{5})?(\d{4,6}(?:\.\d+)?)(CE|PE)$/;
  const optMatch = sym.match(optionRegex);

  if (optMatch) {
    const rawUnderlying = optMatch[1];
    const expiryCode = optMatch[2] || '';
    const strike = parseFloat(optMatch[3]);
    const optionType = optMatch[4] as 'CE' | 'PE';

    let indexSymbol: SupportedIndexSymbol | undefined;
    let displayName = rawUnderlying;

    if (rawUnderlying.includes('NIFTY50') || rawUnderlying === 'NIFTY') {
      indexSymbol = 'NIFTY 50';
      displayName = 'NIFTY';
    } else if (rawUnderlying.includes('NIFTYBANK') || rawUnderlying.includes('BANKNIFTY')) {
      indexSymbol = 'BANKNIFTY';
      displayName = 'BANKNIFTY';
    } else if (rawUnderlying.includes('FINNIFTY')) {
      indexSymbol = 'FINNIFTY';
      displayName = 'FINNIFTY';
    } else if (rawUnderlying.includes('MIDSELECT') || rawUnderlying.includes('MIDCPNIFTY')) {
      indexSymbol = 'MIDCPNIFTY';
      displayName = 'MIDCPNIFTY';
    } else if (rawUnderlying.includes('SENSEX')) {
      indexSymbol = 'SENSEX';
      displayName = 'SENSEX';
    }

    return {
      rawSymbol: sym,
      cleanName: `${displayName} ${strike} ${optionType}`,
      isSpot: false,
      isOption: true,
      isFuture: false,
      indexSymbol,
      strike,
      optionType,
      expiryCode,
    };
  }

  // 3. Check Futures (e.g. NSE:NIFTY5026AUGFUT)
  if (sym.endsWith('FUT') || sym.includes('FUT')) {
    return {
      rawSymbol: sym,
      cleanName: sym.replace(/^(NSE|BSE):/, ''),
      isSpot: false,
      isOption: false,
      isFuture: true,
    };
  }

  // 4. Fallback Equity / General Spot
  return {
    rawSymbol: sym,
    cleanName: sym.replace(/^(NSE|BSE):/, '').replace(/-EQ$/, '').replace(/-INDEX$/, ''),
    isSpot: true,
    isOption: false,
    isFuture: false,
  };
}

/**
 * Calculates realistic Black-Scholes approximation for Indian Index Option Strikes
 */
export function calculateTheoreticalOptionPrice(
  spotPrice: number,
  strike: number,
  optionType: 'CE' | 'PE',
  daysToExpiry: number = 2,
  iv: number = 14
): number {
  const intrinsic =
    optionType === 'CE' ? Math.max(0, spotPrice - strike) : Math.max(0, strike - spotPrice);

  const tYears = Math.max(0.005, daysToExpiry / 365);
  const ivDecimal = Math.max(0.1, iv / 100);
  const atmVol = spotPrice * ivDecimal * Math.sqrt(tYears) * 0.4;
  const distancePct = Math.abs(spotPrice - strike) / spotPrice;
  const timeValue = Math.max(12, atmVol * Math.exp(-Math.pow(distancePct * 25, 1.4)));

  const total = Number((intrinsic + timeValue).toFixed(2));
  return Math.max(1.0, total);
}

export function getFyersSpotSymbol(symbol: string): string {
  const clean = symbol
    .toUpperCase()
    .replace(/\.NS$/, '')
    .replace(/^NSE:/, '')
    .replace(/^BSE:/, '')
    .trim();
  if (clean === 'NIFTY' || clean === 'NIFTY50' || clean === 'NIFTY 50' || clean === 'NIFTY_50')
    return 'NSE:NIFTY50-INDEX';
  if (clean === 'BANKNIFTY' || clean === 'NIFTY BANK' || clean === 'NIFTYBANK')
    return 'NSE:NIFTYBANK-INDEX';
  if (
    clean === 'FINNIFTY' ||
    clean === 'NIFTY FINANCIAL SERVICES' ||
    clean === 'NIFTY FIN SERVICE'
  )
    return 'NSE:FINNIFTY-INDEX';
  if (
    clean === 'MIDCPNIFTY' ||
    clean === 'NIFTY MIDCAP SELECT' ||
    clean === 'NIFTY MID SELECT'
  )
    return 'NSE:MIDCPNIFTY-INDEX';
  if (clean === 'SENSEX' || clean === 'BSE SENSEX' || clean === 'SENSEX 30')
    return 'BSE:SENSEX-INDEX';
  if (clean === 'NIFTYIT' || clean === 'NIFTY IT') return 'NSE:NIFTYIT-INDEX';
  if (clean === 'INDIAVIX' || clean === 'INDIA VIX') return 'NSE:INDIAVIX-INDEX';
  return `NSE:${clean}-EQ`;
}

export function getFyersFutSymbol(
  symbol: string,
  expiryCode: string = '26AUG'
): string {
  const clean = symbol
    .toUpperCase()
    .replace(/\.NS$/, '')
    .replace(/^NSE:/, '')
    .replace(/^BSE:/, '')
    .trim();
  if (clean === 'NIFTY' || clean === 'NIFTY50' || clean === 'NIFTY 50')
    return `NSE:NIFTY50${expiryCode}FUT`;
  if (clean === 'BANKNIFTY' || clean === 'NIFTY BANK')
    return `NSE:NIFTYBANK${expiryCode}FUT`;
  if (clean === 'FINNIFTY') return `NSE:FINNIFTY${expiryCode}FUT`;
  if (clean === 'MIDCPNIFTY' || clean === 'NIFTY MIDCAP SELECT')
    return `NSE:NIFTYMIDSELECT${expiryCode}FUT`;
  if (clean === 'SENSEX' || clean === 'BSE SENSEX')
    return `BSE:SENSEX${expiryCode}FUT`;
  return `NSE:${clean}${expiryCode}FUT`;
}

export function getFyersOptionSymbol(
  symbol: string,
  strike: number,
  type: 'CE' | 'PE',
  expiryCode: string = '26AUG'
): string {
  const clean = symbol
    .toUpperCase()
    .replace(/\.NS$/, '')
    .replace(/^NSE:/, '')
    .replace(/^BSE:/, '')
    .trim();

  let exchange = 'NSE';
  let prefix = clean;

  if (clean === 'NIFTY' || clean === 'NIFTY50' || clean === 'NIFTY 50') {
    prefix = 'NIFTY50';
  } else if (clean === 'BANKNIFTY' || clean === 'NIFTY BANK') {
    prefix = 'NIFTYBANK';
  } else if (clean === 'FINNIFTY') {
    prefix = 'FINNIFTY';
  } else if (clean === 'MIDCPNIFTY' || clean === 'NIFTY MIDCAP SELECT') {
    prefix = 'NIFTYMIDSELECT';
  } else if (clean === 'SENSEX' || clean === 'BSE SENSEX') {
    exchange = 'BSE';
    prefix = 'SENSEX';
  }

  return `${exchange}:${prefix}${expiryCode}${Math.round(strike)}${type}`;
}

export function getFyersHeaderAuth(
  appId: string,
  accessToken: string
): Record<string, string> {
  return {
    Authorization: `${appId}:${accessToken}`,
    'Content-Type': 'application/json',
  };
}

export function getTradingViewSymbol(symbol: string): string {
  const clean = symbol
    .toUpperCase()
    .replace(/\.NS$/, '')
    .replace(/^NSE:/, '')
    .replace(/^BSE:/, '')
    .trim();
  if (clean === 'NIFTY' || clean === 'NIFTY50' || clean === 'NIFTY 50')
    return 'NSE:NIFTY';
  if (clean === 'BANKNIFTY' || clean === 'NIFTY BANK') return 'NSE:BANKNIFTY';
  if (clean === 'FINNIFTY') return 'NSE:FINNIFTY';
  if (clean === 'MIDCPNIFTY') return 'NSE:MIDCPNIFTY';
  if (clean === 'SENSEX' || clean === 'BSE SENSEX') return 'BSE:SENSEX';
  if (clean === 'M&M') return 'NSE:M_M';
  if (clean === 'M&MFIN') return 'NSE:M_MFIN';
  if (clean === 'L&T' || clean === 'LT') return 'NSE:LT';
  if (clean === 'L&TFH' || clean === 'LTF') return 'NSE:LTF';
  if (clean === 'BAJAJ-AUTO') return 'NSE:BAJAJ_AUTO';
  if (clean === 'MCDOWELL-N') return 'NSE:UNITDSPR';
  const sanitized = clean.replace(/&/g, '_').replace(/-/g, '_');
  return `NSE:${sanitized}`;
}

/**
 * Fetch Live Indian Index Quotes from Server API (Upstox API + Autonomous Live Engine)
 */
export async function fetchLiveIndexQuotes(): Promise<Record<SupportedIndexSymbol, FyersQuote>> {
  try {
    const headers: Record<string, string> = {};
    if (typeof window !== 'undefined') {
      const accessToken = localStorage.getItem('upstox_access_token');
      if (accessToken) headers['x-upstox-access-token'] = accessToken;
    }

    const res = await fetch('/api/market/index-quotes', { headers });
    if (!res.ok) {
      throw new Error(`Failed to fetch index quotes: ${res.statusText}`);
    }
    const data = await res.json();
    return data;
  } catch (err) {
    console.warn('[Market Client] Error fetching live index quotes:', err);
    throw err;
  }
}

/**
 * Validate Upstox API Credentials
 */
export async function testFyersCredentials(
  apiKey: string,
  accessToken: string
): Promise<{ success: boolean; message: string; data?: any }> {
  try {
    const res = await fetch('/api/upstox/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey, accessToken }),
    });
    const data = await res.json();
    return {
      success: Boolean(data.connected || data.status === 'ok'),
      message: data.message || 'Upstox API check complete',
      data: data.profile,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to connect to Upstox API gateway',
    };
  }
}


