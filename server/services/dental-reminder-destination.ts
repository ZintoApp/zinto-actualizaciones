import type { DentalAutomaticReminders } from '../../shared/types/dental-reminder-types';
import { isDentalReminderChannelSupported } from '../../shared/types/dental-reminder-types';
import { DentalReminderSkip } from './dental-reminder-engine';

export function selectDentalReminderDestination<Channel extends { id: number; companyId: number | null; channelType: string; status: string | null },
  Conversation extends { id: number; companyId: number | null; contactId: number | null; channelId: number; isGroup: boolean | null; lastMessageAt: Date | string | null }>(
  companyId: number, contactId: number, settings: DentalAutomaticReminders, channels: Channel[], conversations: Conversation[],
): { channel: Channel; conversation?: Conversation } {
  const available = channels.filter(channel => channel.companyId === companyId && ['active', 'connected'].includes(channel.status || '') &&
    isDentalReminderChannelSupported(channel.channelType));
  const candidates = conversations.filter(conversation => conversation.companyId === companyId && conversation.contactId === contactId && !conversation.isGroup &&
    available.some(channel => channel.id === conversation.channelId))
    .sort((a, b) => new Date(b.lastMessageAt || 0).getTime() - new Date(a.lastMessageAt || 0).getTime() || b.id - a.id);
  if (settings.channelMode === 'latest_conversation') {
    const conversation = candidates[0];
    if (!conversation) throw new DentalReminderSkip('No patient conversation on an active supported channel');
    return { channel: available.find(channel => channel.id === conversation.channelId)!, conversation };
  }
  const channel = available.find(channel => channel.id === settings.channelConnectionId);
  if (!channel) throw new DentalReminderSkip('Selected channel connection is unavailable');
  const conversation = candidates.find(conversation => conversation.channelId === channel.id);
  if (!conversation && !['whatsapp', 'whatsapp_unofficial', 'whatsapp_official'].includes(channel.channelType)) {
    throw new DentalReminderSkip('Patient has no conversation on the selected channel');
  }
  return { channel, conversation };
}
