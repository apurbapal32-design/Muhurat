import {
  FyersWsClientMessage,
  FyersWsConnectionState,
  FyersWsServerMessage,
  FyersWsStatus,
  FyersWsTick,
  IndexCandidateStrike,
  SupportedIndexSymbol,
} from '../types';
import { getFyersOptionSymbol, getFyersSpotSymbol } from './fyersHelpers';

export type WsTickListener = (tick: FyersWsTick) => void;
export type WsBatchTicksListener = (ticks: FyersWsTick[]) => void;
export type WsStatusListener = (status: FyersWsStatus) => void;

export class FyersIndexOptionsWebSocketManager {
  private ws: WebSocket | null = null;
  private status: FyersWsStatus = {
    state: 'DISCONNECTED',
    isLiveFyers: false,
    subscribedSymbols: [],
    ticksCount: 0,
    ticksPerSecond: 0,
    latencyMs: 0,
    reconnectAttempts: 0,
    transport: 'SERVER_RELAY',
  };

  private tickListeners: Set<WsTickListener> = new Set();
  private batchTickListeners: Set<WsBatchTicksListener> = new Set();
  private statusListeners: Set<WsStatusListener> = new Set();

  private activeSubscriptions: Set<string> = new Set();
  private latestTicksMap: Map<string, FyersWsTick> = new Map();

  private reconnectTimer: any = null;
  private pingIntervalId: any = null;
  private tpsIntervalId: any = null;
  private ticksInCurrentSecond: number = 0;
  private isExplicitlyClosed: boolean = false;
  private lastPingSentTimestamp: number = 0;

  constructor() {
    // Start TPS (ticks per second) meter
    if (typeof window !== 'undefined') {
      this.tpsIntervalId = setInterval(() => {
        this.status.ticksPerSecond = this.ticksInCurrentSecond;
        this.ticksInCurrentSecond = 0;
        this.notifyStatusListeners();
      }, 1000);
    }
  }

  /**
   * Determine WebSocket URL based on current browser window location
   */
  private getWsUrl(): string {
    if (typeof window === 'undefined') return 'ws://localhost:3000/ws/market';
    const isHttps = window.location.protocol === 'https:';
    const protocol = isHttps ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws/market`;
  }

  /**
   * Connect to Fyers WebSocket Server
   */
  public connect() {
    if (typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.isExplicitlyClosed = false;
    this.updateStatus({ state: 'CONNECTING', error: undefined });

    try {
      const url = this.getWsUrl();
      console.log(`[Fyers WS Client] Connecting to dedicated WebSocket at ${url}...`);

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[Fyers WS Client] 🟢 Dedicated WebSocket Connection ESTABLISHED');
        this.status.reconnectAttempts = 0;
        this.updateStatus({
          state: 'CONNECTED',
          connectedAt: new Date().toISOString(),
          error: undefined,
        });

        // Start heartbeat ping
        this.startHeartbeat();

        // Resubscribe to all active symbols
        if (this.activeSubscriptions.size > 0) {
          this.sendSubscription(Array.from(this.activeSubscriptions));
        }
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : '';
          if (!raw) return;
          const msg = JSON.parse(raw) as FyersWsServerMessage;
          this.handleServerMessage(msg);
        } catch (err) {
          console.warn('[Fyers WS Client] Error parsing incoming WebSocket packet:', err);
        }
      };

      this.ws.onclose = (event) => {
        this.stopHeartbeat();
        console.log(`[Fyers WS Client] 🔴 WebSocket Closed (code: ${event.code})`);

        if (!this.isExplicitlyClosed) {
          this.updateStatus({ state: 'RECONNECTING' });
          this.scheduleReconnect();
        } else {
          this.updateStatus({ state: 'DISCONNECTED' });
        }
      };

      this.ws.onerror = (event) => {
        console.warn('[Fyers WS Client] WebSocket Error:', event);
        this.updateStatus({
          state: 'ERROR',
          error: 'Connection error with Fyers WebSocket stream',
        });
      };
    } catch (err: any) {
      console.error('[Fyers WS Client] Connection initialization failed:', err);
      this.updateStatus({
        state: 'ERROR',
        error: err.message || 'Failed to initialize WebSocket',
      });
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect WebSocket
   */
  public disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    if (this.ws) {
      this.ws.close(1000, 'Client closed connection');
      this.ws = null;
    }
    this.updateStatus({ state: 'DISCONNECTED' });
  }

  /**
   * Subscribe to specific Fyers Symbols
   */
  public subscribe(symbols: string[]) {
    if (!symbols || symbols.length === 0) return;
    symbols.forEach((sym) => this.activeSubscriptions.add(sym.toUpperCase()));
    this.status.subscribedSymbols = Array.from(this.activeSubscriptions);
    this.notifyStatusListeners();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendSubscription(symbols);
    } else if (!this.ws || this.ws.readyState === WebSocket.CLOSED) {
      this.connect();
    }
  }

  /**
   * Helper to subscribe to an Index and its Candidate Strikes
   */
  public subscribeIndexOptions(
    indexSymbol: SupportedIndexSymbol,
    candidateStrikes?: IndexCandidateStrike[]
  ) {
    const symbolsToSub: string[] = [];

    // Spot Symbol
    const spotSym = getFyersSpotSymbol(indexSymbol);
    symbolsToSub.push(spotSym);

    // Strikes
    if (candidateStrikes && candidateStrikes.length > 0) {
      candidateStrikes.forEach((c) => {
        if (c.fyersSymbol) {
          symbolsToSub.push(c.fyersSymbol);
        } else {
          const optSym = getFyersOptionSymbol(indexSymbol, c.strike, c.optionType);
          symbolsToSub.push(optSym);
        }
      });
    }

    this.subscribe(symbolsToSub);
  }

  /**
   * Unsubscribe from symbols
   */
  public unsubscribe(symbols: string[]) {
    if (!symbols || symbols.length === 0) return;
    symbols.forEach((sym) => this.activeSubscriptions.delete(sym.toUpperCase()));
    this.status.subscribedSymbols = Array.from(this.activeSubscriptions);
    this.notifyStatusListeners();

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const msg: FyersWsClientMessage = {
        type: 'unsubscribe',
        symbols,
      };
      this.ws.send(JSON.stringify(msg));
    }
  }

  private sendSubscription(symbols: string[]) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const msg: FyersWsClientMessage = {
      type: 'subscribe',
      symbols,
      mode: 'FULL_QUOTE',
    };
    this.ws.send(JSON.stringify(msg));
  }

  private handleServerMessage(msg: FyersWsServerMessage) {
    const now = Date.now();

    if (msg.type === 'tick' && msg.tick) {
      this.processTick(msg.tick, now);
    } else if (msg.type === 'ticks_batch' && msg.ticks && Array.isArray(msg.ticks)) {
      msg.ticks.forEach((t) => this.processTick(t, now));
      this.batchTickListeners.forEach((listener) => listener(msg.ticks!));
    } else if (msg.type === 'pong') {
      if (msg.clientTimestamp) {
        this.status.latencyMs = Math.max(1, now - msg.clientTimestamp);
      }
      this.notifyStatusListeners();
    } else if (msg.type === 'status' && msg.status) {
      this.updateStatus(msg.status);
    } else if (msg.type === 'subscribed' && msg.symbols) {
      this.status.subscribedSymbols = msg.symbols;
      this.notifyStatusListeners();
    }
  }

  private processTick(tick: FyersWsTick, now: number) {
    this.latestTicksMap.set(tick.symbol, tick);
    this.status.ticksCount++;
    this.ticksInCurrentSecond++;
    this.status.lastTickTime = tick.ltt || new Date(now).toLocaleTimeString('en-IN');

    // Immediate callback dispatch for zero UI latency
    this.tickListeners.forEach((listener) => {
      try {
        listener(tick);
      } catch (err) {
        console.error('[Fyers WS Client] Error in tick listener:', err);
      }
    });
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    this.pingIntervalId = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.lastPingSentTimestamp = Date.now();
        const pingMsg: FyersWsClientMessage = {
          type: 'ping',
          clientTimestamp: this.lastPingSentTimestamp,
        };
        this.ws.send(JSON.stringify(pingMsg));
      }
    }, 10000);
  }

  private stopHeartbeat() {
    if (this.pingIntervalId) {
      clearInterval(this.pingIntervalId);
      this.pingIntervalId = null;
    }
  }

  private scheduleReconnect() {
    if (this.isExplicitlyClosed) return;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    this.status.reconnectAttempts++;
    const backoffMs = Math.min(1000 * Math.pow(1.5, this.status.reconnectAttempts), 8000);
    console.log(`[Fyers WS Client] Scheduling reconnection in ${backoffMs}ms (attempt #${this.status.reconnectAttempts})...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, backoffMs);
  }

  private updateStatus(partial: Partial<FyersWsStatus>) {
    this.status = { ...this.status, ...partial };
    this.notifyStatusListeners();
  }

  private notifyStatusListeners() {
    this.statusListeners.forEach((listener) => {
      try {
        listener(this.status);
      } catch (err) {
        console.error('[Fyers WS Client] Error in status listener:', err);
      }
    });
  }

  // Listener management
  public onTick(listener: WsTickListener): () => void {
    this.tickListeners.add(listener);
    return () => {
      this.tickListeners.delete(listener);
    };
  }

  public onBatchTicks(listener: WsBatchTicksListener): () => void {
    this.batchTickListeners.add(listener);
    return () => {
      this.batchTickListeners.delete(listener);
    };
  }

  public onStatusChange(listener: WsStatusListener): () => void {
    this.statusListeners.add(listener);
    listener(this.status); // emit current status immediately
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public getStatus(): FyersWsStatus {
    return { ...this.status };
  }

  public getLatestTick(symbol: string): FyersWsTick | undefined {
    return this.latestTicksMap.get(symbol.toUpperCase());
  }

  public getLatestTicks(): Map<string, FyersWsTick> {
    return new Map(this.latestTicksMap);
  }
}

// Global Singleton Instance for easy import throughout application
export const fyersIndexOptionsWebSocket = new FyersIndexOptionsWebSocketManager();
