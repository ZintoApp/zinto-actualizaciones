import { useEffect, useState, useRef, useCallback } from 'react';
import { useToast } from './use-toast';
import { useAuth } from './use-auth';

type MessageHandler = (data: any) => void;

export default function useSocket(url: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<any>(null);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const socketRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const { user, isLoading } = useAuth();
  const messageHandlers = useRef<Record<string, MessageHandler[]>>({});
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const lastConnectAttemptRef = useRef(0);
  const hasConnectedRef = useRef(false);

  useEffect(() => {
    if (isLoading || !user) {
      return;
    }

    // Reset reconnect counter for a clean slate each connection cycle
    reconnectAttemptsRef.current = 0;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";



    const wsHost = window.location.host;

    const wsUrl = `${protocol}//${wsHost}${url}`;

    let disposed = false;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      if (disposed) return;
      setIsConnected(true);
      hasConnectedRef.current = true;
      reconnectAttemptsRef.current = 0;
      lastConnectAttemptRef.current = Date.now();

      socket.send(JSON.stringify({
        type: 'authenticate',
        userId: user.id
      }));

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }

      const heartbeatInterval = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);

      (socket as any).heartbeatInterval = heartbeatInterval;
    });

    socket.addEventListener('close', () => {
      if (disposed) return;
      setIsConnected(false);

      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if (user && reconnectAttemptsRef.current < maxReconnectAttempts) {
        reconnectAttemptsRef.current++;

        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current - 1), 30000);

        reconnectTimeoutRef.current = setTimeout(() => {
          setReconnectTrigger((prev) => prev + 1);
        }, delay);
      } 
    });

    socket.addEventListener('error', (error) => {
      if (disposed) return;
      console.error('WebSocket error:', error);
      setIsConnected(false);


      if (window.location.pathname.includes('/email/')) {
        toastRef.current({
          title: "Real-time Updates Disabled",
          description: "Email processing is working normally. Use the refresh button (📥) to check for new emails manually.",
          variant: "default",
        });
      }
    });

    socket.addEventListener('message', (event) => {
      if (disposed) return;
      try {
        const data = JSON.parse(event.data);
        if (['callStatusUpdate', 'callCompleted', 'callFailed'].includes(data.type)) {
          console.log('[useSocket][DEBUG] call event received:', data.type, data.data);
        }
        setLastMessage(data);


        if (data.type === 'newMessage' && data.data?.channelType === 'email') {

        }
        if (data.type === 'conversationUpdated' && data.data?.channelType === 'email') {

        }

        if (data.type === 'authError') {
          toastRef.current({
            title: "Authentication Error",
            description: data.message || "Failed to authenticate WebSocket connection",
            variant: "destructive"
          });
          socket.close();
          return;
        }

        if (data.type === 'batchedEvents' && Array.isArray(data.data?.events)) {

          for (const evt of data.data.events) {
            if (evt?.type && messageHandlers.current[evt.type]) {
              messageHandlers.current[evt.type].forEach(handler => handler(evt));
            }
          }
          return;
        }

        if (data.type && messageHandlers.current[data.type]) {
          messageHandlers.current[data.type].forEach(handler => {
            handler(data);
          });
        }
      } catch (err) {
        console.error('Error parsing WebSocket message:', err);
      }
    });

    return () => {
      disposed = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }

      if ((socket as any).heartbeatInterval) {
        clearInterval((socket as any).heartbeatInterval);
      }

      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }

      hasConnectedRef.current = false;
    };
  }, [url, user, isLoading, reconnectTrigger]);



  const onMessage = useCallback((type: string, handler: MessageHandler) => {
    if (!messageHandlers.current[type]) {
      messageHandlers.current[type] = [];
    }

    messageHandlers.current[type].push(handler);

    return () => {
      const handlers = messageHandlers.current[type];
      if (!handlers) {
        return;
      }

      messageHandlers.current[type] = handlers.filter(h => h !== handler);
      if (messageHandlers.current[type].length === 0) {
        delete messageHandlers.current[type];
      }
    };
  }, []);

  const sendMessage = useCallback((data: any) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  return { isConnected, lastMessage, sendMessage, onMessage };
}
