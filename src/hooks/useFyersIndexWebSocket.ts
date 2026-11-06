import { useState, useEffect, useCallback, useRef } from 'react';
import {
  FyersWsStatus,
  FyersWsTick,
  IndexCandidateStrike,
  SupportedIndexSymbol,
} from '../types';
import {
  fyersIndexOptionsWebSocket,
  WsTickListener,
} from '../utils/fyersIndexOptionsWebSocket';

interface UseFyersIndexWebSocketOptions {
  indexSymbol?: SupportedIndexSymbol;
  candidateStrikes?: IndexCandidateStrike[];
  enabled?: boolean;
  onTick?: WsTickListener;
}

export function useFyersIndexWebSocket(options: UseFyersIndexWebSocketOptions = {}) {
  const { indexSymbol, candidateStrikes, enabled = true, onTick } = options;

  const [status, setStatus] = useState<FyersWsStatus>(() => fyersIndexOptionsWebSocket.getStatus());
  const [latestTicks, setLatestTicks] = useState<Record<string, FyersWsTick>>({});
  const onTickRef = useRef<WsTickListener | undefined>(onTick);

  useEffect(() => {
    onTickRef.current = onTick;
  }, [onTick]);

  // Connect and bind listeners on mount
  useEffect(() => {
    if (!enabled) return;

    // Connect socket if not connected
    fyersIndexOptionsWebSocket.connect();

    // Bind status listener
    const unsubStatus = fyersIndexOptionsWebSocket.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    // Bind tick listener
    const unsubTick = fyersIndexOptionsWebSocket.onTick((tick) => {
      setLatestTicks((prev) => ({
        ...prev,
        [tick.symbol]: tick,
      }));

      if (onTickRef.current) {
        onTickRef.current(tick);
      }
    });

    return () => {
      unsubStatus();
      unsubTick();
    };
  }, [enabled]);

  // Handle index and strike subscriptions whenever selected index or candidate strikes change
  useEffect(() => {
    if (!enabled || !indexSymbol) return;

    fyersIndexOptionsWebSocket.subscribeIndexOptions(indexSymbol, candidateStrikes);
  }, [indexSymbol, candidateStrikes, enabled]);

  const reconnect = useCallback(() => {
    fyersIndexOptionsWebSocket.disconnect();
    setTimeout(() => {
      fyersIndexOptionsWebSocket.connect();
    }, 100);
  }, []);

  const subscribeCustom = useCallback((symbols: string[]) => {
    fyersIndexOptionsWebSocket.subscribe(symbols);
  }, []);

  const unsubscribeCustom = useCallback((symbols: string[]) => {
    fyersIndexOptionsWebSocket.unsubscribe(symbols);
  }, []);

  return {
    status,
    latestTicks,
    isConnected: status.state === 'CONNECTED',
    ticksPerSecond: status.ticksPerSecond,
    latencyMs: status.latencyMs,
    ticksCount: status.ticksCount,
    reconnect,
    subscribe: subscribeCustom,
    unsubscribe: unsubscribeCustom,
    socket: fyersIndexOptionsWebSocket,
  };
}
