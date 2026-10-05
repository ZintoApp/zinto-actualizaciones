import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { APP_ICONS } from '@/assets/icons';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { getInstagramHandle } from '@shared/instagram-contact';
import { ContactCustomFieldsBadges } from '@/components/contacts/ContactCustomFieldsBadges';
import { useCompanyContactCustomFields } from '@/hooks/use-company-contact-custom-fields';
import { GroupAvatar } from '@/components/groups/GroupAvatar';
import { useQuery } from '@tanstack/react-query';
import { ChannelConnection } from '@shared/schema';
import AgentAssignment from './AgentAssignment';
import { useState, useMemo } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { stripAgentSignature } from '@/utils/messageUtils';
import { stripFormatting } from '@/utils/textFormatter';
import { formatMessageDateTime } from '@/utils/dateUtils';
import BotIcon from '@/components/ui/bot-icon';
import { TwilioIcon } from '@/components/icons/TwilioIcon';
import { Pin, PinOff, Briefcase, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConversationItemProps {
  conversation: any;
  isActive: boolean;
  onClick: () => void;
  searchQuery?: string;
  isPinned?: boolean;
  onTogglePin?: (e: React.MouseEvent) => void;
  showChannelBadge?: boolean;
  showDealAction?: boolean;
  dealActionLoading?: boolean;
  onDealActionClick?: (e: React.MouseEvent) => void;
}

export default function ConversationItem({
  conversation,
  isActive,
  onClick,
  searchQuery,
  isPinned,
  onTogglePin,
  showChannelBadge,
  showDealAction,
  dealActionLoading,
  onDealActionClick
}: ConversationItemProps) {
  const { contact } = conversation;
  const [assignedUserId, setAssignedUserId] = useState(conversation.assignedToUserId);
  const unreadCount = conversation.unreadCount || 0;
  const { t } = useTranslation();
  const { data: companyCustomFields = [] } = useCompanyContactCustomFields();

  const handleClick = () => {
    onClick();
  };

  const { data: connections } = useQuery<ChannelConnection[]>({
    queryKey: ['/api/channel-connections'],
  });

  const getChannelInfo = (channelType: string) => {
    switch(channelType) {
      case 'whatsapp':
      case 'whatsapp_unofficial':
        return { icon: 'ri-whatsapp-line', color: '#25D366', name: t('conversations.item.channel.whatsapp', 'WhatsApp') };
      case 'whatsapp_official':
        return { icon: 'ri-whatsapp-line', color: '#25D366', name: t('conversations.item.channel.whatsapp_business', 'WhatsApp Business') };
      case 'facebook':
      case 'messenger':
        return { icon: 'ri-messenger-line', color: '#1877F2', name: t('conversations.item.channel.messenger', 'Messenger') };
      case 'instagram':
        return { icon: 'ri-instagram-line', color: '#E4405F', name: t('conversations.item.channel.instagram', 'Instagram') };
      case 'tiktok':
        return { icon: 'ri-tiktok-line dark:text-white', color: '#000000', name: t('conversations.item.channel.tiktok', 'TikTok Business') };
      case 'email':
        return { icon: 'ri-mail-line', color: '#333235', name: t('conversations.item.channel.email', 'Email') };
      case 'sms':
        return { icon: InboxConversationIcon, isComponent: true, color: '#10B981', name: t('conversations.item.channel.sms', 'SMS') };
      case 'twilio_sms':
      case 'twilio_voice':
        return { icon: TwilioIcon, isComponent: true, color: '#F22F46', name: t('conversations.item.channel.twilio', 'Twilio') };
      case 'webapp':
        return { icon: 'ri-global-line', color: '#8B5CF6', name: t('conversations.item.channel.web_chat', 'Web Chat') };
      case 'webchat':
        return {
          iconUrl: APP_ICONS.webchat,
          name: t('conversations.item.channel.webchat', 'WebChat'),
        };
      case 'telegram':
        return { icon: 'ri-telegram-line', color: '#0088CC', name: t('conversations.item.channel.telegram', 'Telegram') };
      default:
        return { icon: InboxConversationIcon, isComponent: true, color: '#333235', name: t('conversations.item.channel.chat', 'Chat') };
    }
  };

  const channelInfo = getChannelInfo(conversation.channelType);
  const channelLabel = conversation.channelType === 'instagram'
    ? getInstagramHandle(contact) || t('contacts.instagram_username_unavailable', 'Username unavailable')
    : channelInfo.name;

  const formattedTime = useMemo(() => {
    return formatMessageDateTime(new Date(conversation.lastMessageAt));
  }, [conversation.lastMessageAt]);

  const formatMessagePreview = (message: any) => {
    if (!message) return t('conversations.item.no_messages_yet', 'No messages yet');

    const maxLength = 50;
    let preview = "";
    const isOutbound = message.direction === 'outbound';

    switch (message.type) {
      case 'image':
        preview = message.isFromBot ? t('conversations.item.sent_image', '📷 Sent an image') : t('conversations.item.image', '📷 Image');
        break;
      case 'video':
        preview = message.isFromBot ? t('conversations.item.sent_video', '🎥 Sent a video') : t('conversations.item.video', '🎥 Video');
        break;
      case 'audio':
        preview = message.isFromBot ? t('conversations.item.sent_audio', '🎵 Sent an audio') : t('conversations.item.audio', '🎵 Audio');
        break;
      case 'voice':
        preview = message.isFromBot ? t('conversations.item.sent_voice', '🎤 Sent a voice message') : t('conversations.item.voice', '🎤 Voice message');
        break;
      case 'call':
        preview = t('conversations.item.whatsapp_call', '📞 WhatsApp call');
        break;
      case 'sticker':
        preview = message.isFromBot ? t('conversations.item.sent_sticker', '🎨 Sent a sticker') : t('conversations.item.sticker', '🎨 Sticker');
        break;
      case 'document':
        preview = message.isFromBot ? t('conversations.item.sent_document', '📄 Sent a document') : t('conversations.item.document', '📄 Document');
        break;
      case 'poll':
        preview = isOutbound
          ? t('conversations.item.sent_poll', ' Sent a poll')
          : t('conversations.item.poll', ' Poll');
        break;
      case 'poll_vote':

        if (message.content && message.content.startsWith('poll_vote_selected:')) {
          const indexMatch = message.content.match(/poll_vote_selected:(\d+)/);
          const selectedIndex = indexMatch ? parseInt(indexMatch[1], 10) : 0;
          preview = isOutbound
            ? t('conversations.item.voted_poll', '✅ You voted')
            : t('conversations.item.vote_received', '✅ Voted');
        } else {
          preview = isOutbound
            ? t('conversations.item.voted_poll', '✅ You voted')
            : t('conversations.item.vote_received', '✅ Voted');
        }
        break;
      case 'text':
      default:
        const cleanContent = stripAgentSignature(message.content || "");
        preview = stripFormatting(cleanContent);
        break;
    }


    if (isOutbound && !message.isFromBot) {
      const mePrefix = t('conversations.item.me_prefix', 'Me') + ': ';
      const availableLength = maxLength - mePrefix.length;
      if (preview.length > availableLength) {
        preview = preview.substring(0, availableLength) + "...";
      }
      preview = mePrefix + preview;
    } else if (preview.length > maxLength) {
      preview = preview.substring(0, maxLength) + "...";
    }

    return preview;
  };

  return (
    <div
      className={`border-l-4 min-h-[88px] sm:min-h-[80px] ${
        isActive
          ? 'border-primary-500 bg-primary-50 hover:bg-primary-100'
          : 'border-transparent hover:bg-accent/50'
      } cursor-pointer transition-colors duration-150`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      aria-label={`${t('conversations.item.conversation_with', 'Conversation with')} ${
        conversation.isGroup
          ? (conversation.groupName || t('groups.unnamed_group', 'Unnamed Group'))
          : contact?.name
      }${unreadCount > 0 ? `, ${unreadCount} ${t('conversations.item.unread_messages', 'unread messages')}` : ''}`}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleClick();
        }
      }}
    >
      <div className="px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex justify-between items-start">
          <div className="flex items-center flex-1 min-w-0">
            <div className="relative flex-shrink-0">
              {conversation.isGroup ? (
                <GroupAvatar
                  groupName={conversation.groupName || 'Group'}
                  groupJid={conversation.groupJid}
                  connectionId={conversation.channelId}
                  conversationId={conversation.id}
                  groupMetadata={conversation.groupMetadata}
                  size="md"
                  showRefreshButton={false}
                />
              ) : contact ? (
                <ContactAvatar
                  contact={contact}
                  connectionId={conversation.channelId}
                  showRefreshButton={false}
                  size="md"
                />
              ) : (
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-muted"></div>
              )}
              {!conversation.isGroup && (
                <span className={`absolute bottom-0 right-0 block h-2.5 w-2.5 sm:h-3 sm:w-3 rounded-full ${contact?.isActive ? 'bg-green-500' : 'bg-muted'} border-2 border-background`}></span>
              )}
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm sm:text-base truncate pr-2">
                  {conversation.isGroup
                    ? (conversation.groupName || t('groups.unnamed_group', 'Unnamed Group'))
                    : contact?.name
                  }
                </p>
                {unreadCount > 0 && (
                  <span
                    className="inline-flex items-center justify-center text-xs font-bold leading-none text-white bg-[#21c063] rounded-full min-w-[20px] h-5 flex-shrink-0 px-2"
                    aria-label={`${unreadCount} ${t('conversations.item.unread_messages', 'unread messages')}`}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center text-xs text-muted-foreground mt-1">
                <span
                  className={`flex items-center min-w-0 max-w-full${showChannelBadge ? ' bg-muted/60 rounded-full px-1.5 py-0.5' : ''}`}
                >
                  {channelInfo.isComponent ? (
                    <channelInfo.icon
                      className={`mr-1 ${showChannelBadge ? 'w-3.5 h-3.5' : 'w-3 h-3'}`}
                      style={{ color: channelInfo.color }}
                    />
                  ) : channelInfo.iconUrl ? (
                    <img
                      src={channelInfo.iconUrl}
                      alt={channelInfo.name}
                      className={`mr-1 rounded object-contain ${showChannelBadge ? 'h-3.5 w-3.5' : 'h-3 w-3'}`}
                    />
                  ) : (
                    <i
                      className={`${channelInfo.icon} mr-1 shrink-0${showChannelBadge ? ' text-sm' : ''}`}
                      style={
                        typeof channelInfo.icon === 'string' && channelInfo.icon.includes('tiktok')
                          ? undefined
                          : { color: channelInfo.color }
                      }
                    ></i>
                  )}
                  <span className="truncate" title={channelLabel}>{channelLabel}</span>
                </span>
                {conversation.isGroup && (
                  <>
                    <span className="mx-2">•</span>
                    <span className="truncate">
                      {conversation.groupParticipantCount || 0} {t('groups.participants', 'participants')}
                    </span>
                  </>
                )}
                {!conversation.isGroup && contact?.whatsappUsername && (
                  <>
                    <span className="mx-2">•</span>
                    <span className="truncate">@{contact.whatsappUsername}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {showDealAction && !conversation.isGroup && conversation.contact?.id && onDealActionClick && (
              <Button data-tour="components-conversations-conversationitem.button.contacts.page.contact_actions.add_or_edit_deal"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 flex items-center justify-center text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onDealActionClick(e);
                }}
                disabled={dealActionLoading}
                title={t('contacts.page.contact_actions.add_or_edit_deal', 'Add or edit deal')}
                aria-label={t('contacts.page.contact_actions.add_or_edit_deal', 'Add or edit deal')}
              >
                {dealActionLoading ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Briefcase className="h-3 w-3" />
                )}
              </Button>
            )}
            {onTogglePin && (
              <Button data-tour="components-conversations-conversationitem.button.inbox.unpin_conversation"
                variant={isPinned ? "secondary" : "ghost"}
                size="sm"
                className={`h-7 w-7 p-0 flex items-center justify-center ${isPinned ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={onTogglePin}
                title={isPinned ? t('inbox.unpin_conversation', 'Unpin conversation') : t('inbox.pin_conversation', 'Pin conversation to top')}
              >
                {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </Button>
            )}
            <span className="text-xs text-muted-foreground">{formattedTime}</span>
          </div>
        </div>

        <div className="mt-2 sm:mt-1">
          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
            {formatMessagePreview(conversation.lastMessage)}
          </p>
        </div>

        {contact?.tags && contact.tags.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {contact.tags.slice(0, 5).map((tag: string, idx: number) => {
              const isHighlighted = searchQuery &&
                searchQuery.trim().length > 0 &&
                tag.toLowerCase().includes(searchQuery.toLowerCase().trim());

              return (
                <span
                  key={idx}
                  className={`px-2 py-1 text-xs rounded-full truncate max-w-[80px] ${
                    isHighlighted
                      ? 'bg-yellow-200 text-yellow-900 ring-2 ring-yellow-400'
                      : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {tag}
                </span>
              );
            })}

          </div>
        )}

        <ContactCustomFieldsBadges customFields={contact?.customFields} schema={companyCustomFields} maxVisible={3} className="mt-2" />

        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 flex-wrap">
            {conversation.status === 'open' && !assignedUserId && (
              <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 whitespace-nowrap">
                {t('conversations.item.new_lead', 'New Lead')}
              </span>
            )}

            <span className={`inline-flex items-center px-2 py-1 text-xs rounded-full whitespace-nowrap ${
              conversation.botDisabled
                ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
            }`}>
              <BotIcon className="mr-1" size={12} />
              <span className="hidden sm:inline">{conversation.botDisabled ? t('conversations.item.bot_disabled', 'Bot disabled') : t('conversations.item.bot_enabled', 'Bot enabled')}</span>
              <span className="sm:hidden">{conversation.botDisabled ? t('conversations.item.bot_off', 'Bot off') : t('conversations.item.bot_on', 'Bot on')}</span>
            </span>

            {conversation.status === 'awaiting_reply' && (
              <span className="inline-flex items-center px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800 whitespace-nowrap">
                <i className="ri-time-line mr-1"></i>
                <span className="hidden sm:inline">{t('conversations.item.awaiting_reply', 'Awaiting reply')}</span>
                <span className="sm:hidden">{t('conversations.item.waiting', 'Waiting')}</span>
              </span>
            )}
          </div>

          <div className="flex items-center flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <AgentAssignment
              conversationId={conversation.id}
              currentAssignedUserId={assignedUserId}
              onAssignmentChange={setAssignedUserId}
              variant="badge"
              size="sm"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
