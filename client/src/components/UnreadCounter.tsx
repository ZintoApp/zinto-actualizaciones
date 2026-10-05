import React, { useState, useEffect } from 'react';
import useSocket from '../hooks/useSocket';

interface UnreadCounterProps {
  conversationId: number;
  initialCount?: number;
  className?: string;
  onClick?: () => void;
}

interface UnreadCountUpdate {
  type: 'unreadCountUpdated';
  data: {
    conversationId: number;
    unreadCount: number;
  };
}

export const UnreadCounter: React.FC<UnreadCounterProps> = ({
  conversationId,
  initialCount = 0,
  className = '',
  onClick
}) => {
  const [unreadCount, setUnreadCount] = useState(initialCount);
  const { onMessage } = useSocket('/ws');


  useEffect(() => {
    setUnreadCount(initialCount);
  }, [initialCount]);


  useEffect(() => {
    const unsubscribe = onMessage('unreadCountUpdated', (data) => {
      if (data.data.conversationId === conversationId) {
        setUnreadCount(data.data.unreadCount);
      }
    });

    return unsubscribe;
  }, [conversationId, onMessage]);


  const markAsRead = async (e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation(); // Prevent event bubbling
    }

    try {
      const response = await fetch(`/api/conversations/${conversationId}/mark-read`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setUnreadCount(0);
      }
    } catch (error) {
      console.error('Error marking conversation as read:', error);
    }


    if (onClick) {
      onClick();
    }
  };


  if (unreadCount === 0) {
    return null;
  }

  return (
    <span
      className={`unread-counter ${className}`}
      onClick={markAsRead}
      style={{
        backgroundColor: '#ff4444',
        color: 'white',
        borderRadius: '50%',
        padding: '2px 6px',
        fontSize: '12px',
        fontWeight: 'bold',
        minWidth: '18px',
        height: '18px',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        userSelect: 'none',
        zIndex: 10
      }}
      title={`${unreadCount} unread message${unreadCount !== 1 ? 's' : ''}`}
    >
      {unreadCount > 99 ? '99+' : unreadCount}
    </span>
  );
};


export const useUnreadCounts = () => {
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({});

  useEffect(() => {

    const fetchUnreadCounts = async () => {
      try {
        const response = await fetch('/api/conversations/unread-counts', {
          credentials: 'include'
        });

        if (response.ok) {
          const counts = await response.json();
          const countsMap: Record<number, number> = {};

          counts.forEach((item: { conversationId: number; unreadCount: number }) => {
            countsMap[item.conversationId] = item.unreadCount;
          });

          setUnreadCounts(countsMap);
        }
      } catch (error) {
        console.error('Error fetching unread counts:', error);
      }
    };

    fetchUnreadCounts();


    const handleWebSocketMessage = (event: MessageEvent) => {
      try {
        const message: UnreadCountUpdate = JSON.parse(event.data);

        if (message.type === 'unreadCountUpdated') {
          setUnreadCounts(prev => ({
            ...prev,
            [message.data.conversationId]: message.data.unreadCount
          }));
        }
      } catch (error) {

      }
    };


    if (window.WebSocket && (window as any).ws) {
      (window as any).ws.addEventListener('message', handleWebSocketMessage);
    }


    return () => {
      if (window.WebSocket && (window as any).ws) {
        (window as any).ws.removeEventListener('message', handleWebSocketMessage);
      }
    };
  }, []);

  const markConversationAsRead = async (conversationId: number) => {
    try {
      const response = await fetch(`/api/conversations/${conversationId}/mark-read`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        setUnreadCounts(prev => ({
          ...prev,
          [conversationId]: 0
        }));
      }
    } catch (error) {
      console.error('Error marking conversation as read:', error);
    }
  };

  const getTotalUnreadCount = () => {
    return Object.values(unreadCounts).reduce((total, count) => total + count, 0);
  };

  return {
    unreadCounts,
    markConversationAsRead,
    getTotalUnreadCount
  };
};

export default UnreadCounter;
