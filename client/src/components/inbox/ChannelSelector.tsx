import React, { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { useChannelConnections } from '@/hooks/useChannelConnections';
import { isChannelAvailable } from '@shared/channel-utils';
import { ChannelConnectionSelect, useChannelPresentation } from '@/components/channels/ChannelConnectionSelect';
import { AlertCircle } from 'lucide-react';

interface ChannelSelectorProps {
  activeChannelId?: number | null;
  onChannelChange: (channelId: number | null) => void;
  className?: string;
}

export function ChannelSelector({ activeChannelId, onChannelChange, className }: ChannelSelectorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { getChannelDisplayName } = useChannelPresentation();
  const [selectedChannelId, setSelectedChannelId] = useState<number | null | undefined>(
    activeChannelId !== undefined ? activeChannelId : null
  );


  const { data: channels = [], isLoading, error } = useChannelConnections();

  const activeChannels = channels.filter(channel => isChannelAvailable(channel));


  useEffect(() => {
    if (activeChannels.length === 0 && selectedChannelId) {
      // All channels unavailable - keep selection and wait for reconnection (no toast)
      const selectedStillExists = channels.some(c => c.id === selectedChannelId);
      if (!selectedStillExists) {
        setSelectedChannelId(undefined);
      }
    }
  }, [activeChannels, selectedChannelId, channels]);


  useEffect(() => {
    const parentVal = activeChannelId ?? null;
    const localVal = selectedChannelId === undefined ? null : selectedChannelId;
    if (parentVal !== localVal) {
      setSelectedChannelId(parentVal);
    }
  }, [activeChannelId]);

  const handleChannelChange = (channelId: string) => {
    if (channelId === 'all') {
      setSelectedChannelId(null);
      onChannelChange(null);
      toast({
        title: t('inbox.showing_all_channels', 'Showing all channels'),
        description: t('inbox.showing_all_channels_desc', 'Conversations from every connected channel are shown.'),
      });
      return;
    }
    const numericChannelId = parseInt(channelId, 10);
    setSelectedChannelId(numericChannelId);
    onChannelChange(numericChannelId);

    const selectedChannel = activeChannels.find(c => c.id === numericChannelId);
    if (selectedChannel) {
      toast({
        title: t('inbox.channel_switched', 'Channel switched'),
        description: t('inbox.channel_switched_desc', 'Now using {{channelName}} for messages.', {
          channelName: getChannelDisplayName(selectedChannel)
        }),
      });
    }
  };

  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="animate-pulse flex items-center gap-2">
          <div className="w-4 h-4 bg-muted rounded"></div>
          <div className="w-32 h-6 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <AlertCircle className="h-4 w-4 text-red-500" />
        <span className="text-sm text-red-600">
          {t('inbox.no_active_channels', 'No active channels available')}
        </span>
      </div>
    );
  }

  const selectedChannel = activeChannels.find(c => c.id === selectedChannelId)
    ?? channels.find(c => c.id === selectedChannelId);

  const channelsToShow = activeChannels.length > 0 ? activeChannels : channels;

  return <ChannelConnectionSelect
    value={selectedChannelId}
    onChange={channelId => handleChannelChange(channelId === null ? 'all' : String(channelId))}
    channels={channelsToShow}
    selectedChannel={selectedChannel}
    includeAllChannels
    className={className}
  />;
}
