import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './AuthContext';

const WebSocketContext = createContext(null);

export const WebSocketProvider = ({ children }) => {
  const { token, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [connectionStatus, setConnectionStatus] = useState('disconnected'); // 'connected' | 'connecting' | 'disconnected'
  const [lastEvent, setLastEvent] = useState(null);
  const [lastDeliveryUpdate, setLastDeliveryUpdate] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const pingIntervalRef = useRef(null);

  // Compute WebSocket URL based on current host & port
  const getWebSocketUrl = useCallback(() => {
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    let wsBase = apiBase.replace(/^http/, 'ws');
    return `${wsBase}/ws/events?token=${encodeURIComponent(token || '')}`;
  }, [token]);

  const connect = useCallback(() => {
    if (!isAuthenticated || !token) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnectionStatus('disconnected');
      return;
    }

    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    setConnectionStatus('connecting');
    const url = getWebSocketUrl();
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus('connected');

      // Heartbeat ping every 25s to keep connection alive
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 25000);
    };

    ws.onmessage = (event) => {
      if (event.data === 'pong') return;

      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'event.created') {
          const newEvent = msg.data;
          setLastEvent(newEvent);

          // Update TanStack Query cache in place for immediate row appearance (<1s)
          queryClient.setQueriesData(
            { queryKey: ['endpointEvents', newEvent.endpoint_id] },
            (old) => {
              if (!old) return old;
              // Check if already in items
              if (old.items?.some((i) => i.id === newEvent.id)) return old;

              return {
                ...old,
                total: (old.total || 0) + 1,
                items: [newEvent, ...(old.items || [])],
              };
            }
          );

          // Invalidate endpoints summary so counts refresh
          queryClient.invalidateQueries({ queryKey: ['endpoints'] });
        } else if (msg.type === 'delivery.updated') {
          const update = msg.data;
          setLastDeliveryUpdate(update);

          // Update deliveries cache for the modal
          queryClient.invalidateQueries({ queryKey: ['eventDeliveries', update.event_id] });

          // Update item in endpointEvents page cache
          queryClient.setQueriesData(
            { queryKey: ['endpointEvents', update.endpoint_id] },
            (old) => {
              if (!old || !old.items) return old;
              return {
                ...old,
                items: old.items.map((item) => {
                  if (item.id === update.event_id) {
                    return {
                      ...item,
                      delivery_status: update.status,
                      delivery_status_code: update.last_status_code,
                      delivery_latency_ms: update.latency_ms,
                      delivery_attempts: update.attempt_count,
                    };
                  }
                  return item;
                }),
              };
            }
          );
        }
      } catch {
        // Plain string message or ping
      }
    };

    ws.onclose = () => {
      setConnectionStatus('disconnected');
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      // Auto reconnect after 3 seconds if still authenticated
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        if (isAuthenticated) {
          connect();
        }
      }, 3000);
    };

    ws.onerror = () => {
      setConnectionStatus('disconnected');
    };
  }, [isAuthenticated, token, getWebSocketUrl, queryClient]);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [connect]);

  return (
    <WebSocketContext.Provider
      value={{
        connectionStatus,
        isConnected: connectionStatus === 'connected',
        lastEvent,
        lastDeliveryUpdate,
        reconnect: connect,
      }}
    >
      {children}
    </WebSocketContext.Provider>
  );
};

export const useEventWebSocket = () => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useEventWebSocket must be used within a WebSocketProvider');
  }
  return context;
};
