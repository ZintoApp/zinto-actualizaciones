import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { APP_ICONS } from '@/assets/icons';
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useChannelConnections } from '@/hooks/useChannelConnections';
import { getEffectiveChannelStatus, isChannelAvailable } from '@shared/channel-utils';
import { useAuth } from '@/hooks/use-auth';
import { useTranslation } from '@/hooks/use-translation';
import { TwilioIcon } from '@/components/icons/TwilioIcon';

interface ChannelConnection {
  id: number;
  channelType: string;
  accountName?: string;
  accountId?: string;
  status: string | null;
  lastConnectedAt?: string;
  metadata?: any;
}

interface ActiveChannelContextType {
  activeChannelId: number | null;
  setActiveChannelId: (channelId: number | null) => void;
  activeChannel: ChannelConnection | null;
  availableChannels: ChannelConnection[];
  isLoading: boolean;
  error: Error | null;
}

const ActiveChannelContext = createContext<ActiveChannelContextType | undefined>(undefined);

interface ActiveChannelProviderProps {
  children: ReactNode;
}

const ACTIVE_CHANNEL_STORAGE_KEY = 'bothive_active_channel_id';

export function ActiveChannelProvider({ children }: ActiveChannelProviderProps) {
  const [activeChannelId, setActiveChannelIdState] = useState<number | null>(null);
  const [hasRestoredFromStorage, setHasRestoredFromStorage] = useState(false);
  const { user, company } = useAuth();


  const { data: channels = [], isLoading, error } = useChannelConnections();

  // Normalize status: map non-Baileys channels to 'active', and normalize raw status for Baileys
  const normalizeStatus = (channel: ChannelConnection): 'active' | 'inactive' | 'reconnecting' | 'error' => {
    return getEffectiveChannelStatus(channel);
  };

  const availableChannels = channels
    .filter(channel => isChannelAvailable(channel))
    .map(channel => ({
      ...channel,
      status: normalizeStatus(channel)
    }));
  

  const activeChannel = availableChannels.find(channel => channel.id === activeChannelId)
    ?? (activeChannelId ? channels.find(c => c.id === activeChannelId) ?? null : null);


  useEffect(() => {
    const savedChannelId = localStorage.getItem(ACTIVE_CHANNEL_STORAGE_KEY);
    if (savedChannelId === 'all') {
      setActiveChannelIdState(null);
      setHasRestoredFromStorage(true);
      return;
    }
    if (savedChannelId) {
      const channelId = parseInt(savedChannelId, 10);
      if (!isNaN(channelId)) {
        setActiveChannelIdState(channelId);
      }
    }
    setHasRestoredFromStorage(true);
  }, []);


  useEffect(() => {
    if (!hasRestoredFromStorage) return;
    // Match useChannelConnections `enabled` so we never treat pre-fetch / disabled-query data as authoritative.
    if (!company?.id || !user) return;
    if (isLoading) return;

    // If the persisted/selected numeric ID is not in `channels` at all (e.g. deleted), reset to
    // All Channels regardless of whether other channels exist. If the row still exists but is
    // temporarily inactive/reconnecting, keep selection (validate against all statuses in `channels`).
    if (activeChannelId != null) {
      const selectedStillExists = channels.some(c => c.id === activeChannelId);
      if (!selectedStillExists) {
        setActiveChannelIdState(null);
        localStorage.setItem(ACTIVE_CHANNEL_STORAGE_KEY, 'all');
      }
    }
  }, [activeChannelId, channels, company?.id, user, hasRestoredFromStorage, isLoading]);

  const setActiveChannelId = (channelId: number | null) => {
    setActiveChannelIdState(channelId);

    if (channelId !== null) {
      localStorage.setItem(ACTIVE_CHANNEL_STORAGE_KEY, channelId.toString());
    } else {
      localStorage.setItem(ACTIVE_CHANNEL_STORAGE_KEY, 'all');
    }
  };

  const contextValue: ActiveChannelContextType = {
    activeChannelId,
    setActiveChannelId,
    activeChannel,
    availableChannels,
    isLoading,
    error: error as Error | null,
  };

  return (
    <ActiveChannelContext.Provider value={contextValue}>
      {children}
    </ActiveChannelContext.Provider>
  );
}

export function useActiveChannel(): ActiveChannelContextType {
  const context = useContext(ActiveChannelContext);
  if (context === undefined) {
    throw new Error('useActiveChannel must be used within an ActiveChannelProvider');
  }
  return context;
}


export function useChannelInfo() {
  const { t } = useTranslation();

  const getChannelDisplayName = (channel: ChannelConnection): string => {
    const typeDisplay = getChannelTypeDisplay(channel.channelType);
    if (channel.accountName) {
      return `${typeDisplay} (${channel.accountName})`;
    }
    return typeDisplay;
  };

  const getChannelTypeDisplay = (channelType: string): string => {
    switch (channelType) {
      case 'whatsapp_official':
        return t('contacts.whatsapp_official', 'WhatsApp Official');
      case 'whatsapp_unofficial':
      case 'whatsapp':
        return t('conversations.item.channel.whatsapp', 'WhatsApp');
      case 'messenger':
        return t('conversations.item.channel.messenger', 'Messenger');
      case 'instagram':
        return t('conversations.item.channel.instagram', 'Instagram');
      case 'tiktok':
        return t('conversations.item.channel.tiktok', 'TikTok Business');
      case 'twilio_sms':
        return t('conversations.item.channel.twilio_sms', 'Twilio SMS');
      case 'twilio_voice':
        return t('conversations.item.channel.twilio_voice', 'Voice calls');
      case 'telegram':
        return t('conversations.item.channel.telegram', 'Telegram');
      case 'email':
        return t('conversations.item.channel.email', 'Email');
      case 'webchat':
        return t('conversations.item.channel.webchat', 'WebChat');
      default:
        return channelType;
    }
  };

  const getChannelIcon = (channelType: string) => {
    switch (channelType) {
      case 'whatsapp_official':
        return <i className="ri-whatsapp-line" style={{ color: '#25D366' }} />;
      case 'whatsapp_unofficial':
      case 'whatsapp':
        return <i className="ri-whatsapp-line" style={{ color: '#F59E0B' }} />;
      case 'messenger':
        return <i className="ri-messenger-line" style={{ color: '#1877F2' }} />;
      case 'instagram':
        return <i className="ri-instagram-line" style={{ color: '#E4405F' }} />;
      case 'tiktok':
        return <i className="ri-tiktok-line text-black dark:text-white" />;
      case 'twilio_sms':
      case 'twilio_voice':
        return <TwilioIcon className="w-4 h-4" />;
      case 'telegram':
        return <i className="ri-telegram-line" style={{ color: '#0088CC' }} />;
      case 'email':
        return <i className="ri-mail-line" style={{ color: '#6B7280' }} />;
      case 'webchat':
        return (
          <img
            src={APP_ICONS.webchat}
            alt={t('conversations.item.channel.webchat', 'WebChat')}
            className="h-4 w-4 rounded object-contain"
          />
        );
      default:
        return <InboxConversationIcon className="h-[1em] w-[1em]" style={{ color: '#333235' }} />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-400';
      case 'inactive':
        return 'bg-muted text-muted-foreground';
      case 'error':
        return 'bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-400';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return {
    getChannelDisplayName,
    getChannelTypeDisplay,
    getChannelIcon,
    getStatusColor,
  };
}
