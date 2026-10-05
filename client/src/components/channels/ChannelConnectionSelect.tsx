import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { APP_ICONS } from '@/assets/icons';
import React from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { getEffectiveChannelStatus } from '@shared/channel-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Wifi } from 'lucide-react';
import { TwilioIcon } from '@/components/icons/TwilioIcon';

export interface ChannelConnectionOption {
  id: number;
  channelType: string;
  accountName?: string;
  accountId?: string;
  status: string | null;
  connectionData?: unknown;
}

/** Inbox and settings share the same labels, icons and status colors. */
export function useChannelPresentation() {
  const { t } = useTranslation();
  const getChannelTypeDisplay = (type: string): string => {
    switch (type) {
      case 'whatsapp_official': return t('contacts.whatsapp_official', 'WhatsApp Official');
      case 'whatsapp_unofficial':
      case 'whatsapp': return t('conversations.item.channel.whatsapp', 'WhatsApp');
      case 'messenger': return t('conversations.item.channel.messenger', 'Messenger');
      case 'instagram': return t('conversations.item.channel.instagram', 'Instagram');
      case 'tiktok': return t('conversations.item.channel.tiktok', 'TikTok Business');
      case 'telegram': return t('conversations.item.channel.telegram', 'Telegram');
      case 'email': return t('conversations.item.channel.email', 'Email');
      case 'twilio_sms': return t('conversations.item.channel.twilio_sms', 'Twilio SMS');
      case 'twilio_voice': return t('conversations.item.channel.twilio_voice', 'Voice calls');
      case 'webchat': return t('conversations.item.channel.webchat', 'WebChat');
      default: return type;
    }
  };
  const getChannelDisplayName = (channel: ChannelConnectionOption) => {
    const type = getChannelTypeDisplay(channel.channelType);
    return channel.accountName ? `${type} (${channel.accountName})` : type;
  };
  const getChannelIcon = (type: string) => {
    switch (type) {
      case 'whatsapp_official':
      case 'whatsapp_unofficial':
      case 'whatsapp': return <i className="ri-whatsapp-line" style={{ color: '#25D366' }} />;
      case 'messenger': return <i className="ri-messenger-line" style={{ color: '#1877F2' }} />;
      case 'instagram': return <i className="ri-instagram-line" style={{ color: '#E4405F' }} />;
      case 'tiktok': return <i className="ri-tiktok-line text-black dark:text-white" />;
      case 'telegram': return <i className="ri-telegram-line" style={{ color: '#0088CC' }} />;
      case 'email': return <i className="ri-mail-line" style={{ color: '#6B7280' }} />;
      case 'twilio_sms':
      case 'twilio_voice': return <TwilioIcon className="w-4 h-4" />;
      case 'webchat': return <img src={APP_ICONS.webchat}
        alt={t('conversations.item.channel.webchat', 'WebChat')} className="h-4 w-4 rounded object-contain" />;
      default: return <InboxConversationIcon className="h-[1em] w-[1em]" style={{ color: '#333235' }} />;
    }
  };
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'reconnecting': return 'bg-amber-100 text-amber-800';
      case 'error': return 'bg-red-100 text-red-800';
      default: return 'bg-muted text-muted-foreground';
    }
  };
  return { getChannelDisplayName, getChannelIcon, getStatusColor };
}

export function ChannelConnectionOptionLabel({ channel, compact = false }: {
  channel: ChannelConnectionOption; compact?: boolean;
}) {
  const { t } = useTranslation();
  const { getChannelDisplayName, getChannelIcon, getStatusColor } = useChannelPresentation();
  const status = getEffectiveChannelStatus(channel);
  return <div className="flex min-w-0 max-w-full items-center gap-2 w-full">
    <span className={compact ? 'shrink-0 text-sm' : 'shrink-0'}>{getChannelIcon(channel.channelType)}</span>
    <div className="flex-1 min-w-0">
      <div className="truncate">{getChannelDisplayName(channel)}</div>
      {!compact && channel.accountId && <div className="text-xs text-muted-foreground truncate">{channel.accountId}</div>}
    </div>
    <Badge variant="secondary" className={`shrink-0 text-xs ${getStatusColor(status)}`}>
      <Wifi className="h-2 w-2 mr-1" />{t(`inbox.channel_status.${status}`, status)}
    </Badge>
  </div>;
}

interface ChannelConnectionSelectProps {
  channels: ChannelConnectionOption[];
  value?: number | null;
  onChange: (id: number | null) => void;
  /** Inbox may retain an unavailable selection while waiting for reconnection. */
  selectedChannel?: ChannelConnectionOption;
  includeAllChannels?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Presentation only: fetching, delivery eligibility and notifications belong to callers. */
export function ChannelConnectionSelect({ channels, value, onChange, selectedChannel,
  includeAllChannels = false, disabled = false, placeholder, className, id,
  'aria-invalid': invalid, 'aria-describedby': describedBy,
}: ChannelConnectionSelectProps) {
  const { t } = useTranslation();
  const { getChannelDisplayName } = useChannelPresentation();
  const selected = selectedChannel ?? channels.find(channel => channel.id === value);
  const all = includeAllChannels && value === null;
  const allLabel = <div className="flex items-center gap-2 w-full">
    <span className="text-sm"><i className="ri-inbox-line text-muted-foreground" /></span>
    <span className="truncate">{t('inbox.all_channels', 'All Channels')}</span>
  </div>;
  return <div className={`flex min-w-0 items-center gap-2 ${className || ''}`}>
    <Select value={all ? 'all' : selected ? String(selected.id) : ''} disabled={disabled}
      onValueChange={next => {
        if (disabled) return;
        if (next === 'all') { if (includeAllChannels) onChange(null); return; }
        const selectedId = Number(next);
        if (channels.some(channel => channel.id === selectedId)) onChange(selectedId);
      }}>
      <SelectTrigger id={id} aria-invalid={invalid} aria-describedby={describedBy}
        className="h-8 w-full min-w-0 text-sm border-border focus:border-primary-300">
        <SelectValue placeholder={placeholder}>
          {all ? allLabel : selected ? <ChannelConnectionOptionLabel channel={selected} compact /> : undefined}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-2rem)]">
        {includeAllChannels && <SelectItem value="all" textValue={t('inbox.all_channels', 'All Channels')}>{allLabel}</SelectItem>}
        {channels.map(channel => <SelectItem key={channel.id} value={String(channel.id)}
          className="[&>span:last-child]:min-w-0 [&>span:last-child]:flex-1"
          textValue={`${getChannelDisplayName(channel)} ${channel.accountId || ''}`}>
          <ChannelConnectionOptionLabel channel={channel} />
        </SelectItem>)}
      </SelectContent>
    </Select>
  </div>;
}
