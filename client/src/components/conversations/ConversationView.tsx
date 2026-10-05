import { InboxConversationIcon } from '@/components/icons/InboxConversationIcon';
import { useEffect, useRef, useState } from 'react';
import { reconcileInstagramMessages } from '@shared/instagram-message-utils';
import { getInstagramHandle } from '@shared/instagram-contact';
import { useConversations } from '@/context/ConversationContext';
import { useTranslation } from '@/hooks/use-translation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useBotStatus } from '@/hooks/useBotStatus';
import MessageBubble from './MessageBubble';
import MessageInput from './MessageInput';
import NewConversationModal from './NewConversationModal';
import { EmptyConversationIllustration } from './EmptyConversationIllustration';
import ContactDetails from './ContactDetails';
import DateSeparator from './DateSeparator';
import { GroupInfoPanel } from '@/components/groups/GroupInfoPanel';
import { GroupAvatar } from '@/components/groups/GroupAvatar';
import GroupParticipantsModal from '@/components/groups/GroupParticipantsModal';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { TwilioIcon } from '@/components/icons/TwilioIcon';
import AgentAssignment from './AgentAssignment';
import { InboxDutyStatusToggle } from '@/components/inbox/InboxDutyStatusToggle';
import { FollowUpIndicator } from './FollowUpIndicator';
import BotIcon from '@/components/ui/bot-icon';
import { CallScreenModal } from './CallScreenModal';
import { CallChannelWizard, type CallWizardSelection } from './CallChannelWizard';
import { WhatsAppCallScreenModal } from './WhatsAppCallScreenModal';
import { closeWhatsAppRtcSession } from '@/lib/whatsapp-call-webrtc';
import { useMobileLayout } from '@/contexts/mobile-layout-context';
import { shouldShowDateSeparator, getConversationStartDate, formatMessageDate, formatMessageDateTime } from '@/utils/dateUtils';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useTikTokMessagingWindow } from '@/hooks/useTikTokMessagingWindow';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { normalizeVoiceChannelConnectionData, supportsBrowserVoiceConnection, type VoiceProviderStack } from '@shared/types/call-types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Lightbulb, Loader2, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import './ConversationStyles.css';

function readMessageMetadata(metadata: unknown): Record<string, any> | null {
  if (!metadata) return null;
  if (typeof metadata === 'string') {
    try {
      const parsed = JSON.parse(metadata);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof metadata === 'object' && !Array.isArray(metadata) ? metadata as Record<string, any> : null;
}

function readMetadataTimestampMs(metadata: unknown): number | null {
  const ts = readMessageMetadata(metadata)?.timestamp;
  if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
  if (typeof ts === 'string' && ts.trim()) {
    const parsed = new Date(ts).getTime();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Median createdAt-vs-provider skew (e.g. TZ-naive DB timestamps).
 * Only use inbound messages — outbound app timestamps (Date.now) must not pollute skew. */
function estimateCreatedAtSkewMs(messages: any[]): number {
  const deltas: number[] = [];
  for (const message of messages) {
    if (message?.direction !== 'inbound') continue;
    const metaMs = readMetadataTimestampMs(message?.metadata);
    if (metaMs == null || !message?.createdAt) continue;
    const createdMs = new Date(message.createdAt).getTime();
    if (!Number.isFinite(createdMs)) continue;
    const delta = createdMs - metaMs;
    if (Math.abs(delta) >= 30 * 60 * 1000) deltas.push(delta);
  }
  if (!deltas.length) return 0;
  deltas.sort((a, b) => a - b);
  return deltas[Math.floor(deltas.length / 2)];
}

function resolveMessageSortTime(message: any, createdAtSkewMs = 0): number {
  const metaMs = readMetadataTimestampMs(message?.metadata);
  if (metaMs != null) return metaMs;
  if (message?.sentAt) {
    const sentMs = new Date(message.sentAt).getTime();
    if (Number.isFinite(sentMs)) return sentMs - createdAtSkewMs;
  }
  if (message?.createdAt) {
    const createdMs = new Date(message.createdAt).getTime();
    if (Number.isFinite(createdMs)) return createdMs - createdAtSkewMs;
  }
  return 0;
}

export default function ConversationView({ focused = false }: { focused?: boolean }) {
  const {
    activeConversationId,
    messages,
    messagesPagination,
    loadMoreMessages,
    setReplyToMessage,
    conversations,
    groupConversations
  } = useConversations();
  const { t, currentLanguage } = useTranslation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(true);
  const [prevMessageCount, setPrevMessageCount] = useState(0);
  const [connectionStatus, setConnectionStatus] = useState<string>('unknown');
  const [assignedUserId, setAssignedUserId] = useState<number | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [lastActiveConversationId, setLastActiveConversationId] = useState<number | null>(null);
  const [shouldScrollOnLoad, setShouldScrollOnLoad] = useState(false);
  const [isParticipantsModalOpen, setIsParticipantsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isInitiatingCall, setIsInitiatingCall] = useState(false);
  const [isCallScreenOpen, setIsCallScreenOpen] = useState(false);
  const [isCallTypeModalOpen, setIsCallTypeModalOpen] = useState(false);
  const [isNewConversationModalOpen, setIsNewConversationModalOpen] = useState(false);
  const [selectedCallType, setSelectedCallType] = useState<'direct' | 'ai-powered' | null>(null);
  const [activeCallData, setActiveCallData] = useState<{
    callId: string;
    contactName: string;
    contactPhone: string;
    contactAvatar?: string;
    conferenceName?: string;
    channelId?: number;
    callType?: 'direct' | 'ai-powered';
    providerStack?: VoiceProviderStack;
    supportsBrowserDirect?: boolean;
    provider?: 'whatsapp' | 'twilio' | 'telnyx';
    rtcSessionKey?: string;
  } | null>(null);

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentResultIndex, setCurrentResultIndex] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const {
    isMobile,
    isTablet,
    isContactDetailsOpen,
    toggleConversationList,
    toggleContactDetails
  } = useMobileLayout();

  const isGroupConversation = (conversationId: number): boolean => {
    const groupConv = groupConversations.find(conv => conv.id === conversationId);
    if (groupConv) return true;

    const regularConv = conversations.find(conv => conv.id === conversationId);
    if (regularConv && (regularConv.isGroup || regularConv.groupJid)) return true;

    return false;
  };

  const { data: activeConversation, isLoading, error: conversationError } = useQuery({
    queryKey: (() => {
      if (!activeConversationId) return ['/api/conversations', null];
      const isGroup = isGroupConversation(activeConversationId);
      return isGroup
        ? ['/api/group-conversations', activeConversationId]
        : ['/api/conversations', activeConversationId];
    })(),
    enabled: !!activeConversationId,
    queryFn: async ({ queryKey }) => {
      const conversationId = queryKey[1] as number;
      const isGroupEndpoint = queryKey[0] === '/api/group-conversations';

      const endpoint = isGroupEndpoint
        ? `/api/group-conversations/${conversationId}`
        : `/api/conversations/${conversationId}`;

      const response = await fetch(endpoint);
      if (!response.ok) throw new Error('Failed to fetch conversation');
      return response.json();
    }
  });

  const { data: channelConnection } = useQuery({
    queryKey: ['/api/channel-connections', activeConversation?.channelId],
    enabled: !!activeConversation?.channelId && activeConversation?.channelType === 'twilio_voice',
    queryFn: async ({ queryKey }) => {
      const connectionId = queryKey[1] as number;
      const response = await fetch(`/api/channel-connections/${connectionId}`);
      if (!response.ok) throw new Error('Failed to fetch channel connection');
      return response.json();
    }
  });
  const voiceConnectionData = normalizeVoiceChannelConnectionData(channelConnection?.connectionData);
  const voiceProviderStack = voiceConnectionData.providerStack;
  const voiceSupportsBrowserDirect = supportsBrowserVoiceConnection(voiceConnectionData);

  const isWhatsApp = activeConversation?.channelType === 'whatsapp' ||
                    activeConversation?.channelType === 'whatsapp_unofficial' ||
                    activeConversation?.channelType === 'whatsapp_official';

  const { data: whatsAppStatus } = useQuery({
    queryKey: ['/api/whatsapp/status', activeConversation?.channelId],
    enabled: !!activeConversation?.channelId && isWhatsApp,
    queryFn: async ({ queryKey }) => {
      const connectionId = queryKey[1] as number;
      const response = await fetch(`/api/whatsapp/status/${connectionId}`);
      if (!response.ok) throw new Error('Failed to fetch WhatsApp status');
      return response.json();
    },
    refetchInterval: 30000
  });

  const { isBotDisabled, toggleBot, isToggling } = useBotStatus(activeConversationId);

  const tiktokWindow = useTikTokMessagingWindow(
    activeConversationId,
    activeConversation?.channelType,
    activeConversation?.groupMetadata
  );

  const handleDeleteContact = async () => {
    if (!contact || !activeConversationId) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/contacts/${contact.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to delete contact');
      }

      toast({
        title: t('contacts.delete.success_title', 'Contact Deleted'),
        description: t('contacts.delete.success_message', 'Contact and all associated data have been permanently deleted.'),
      });


      queryClient.invalidateQueries({ queryKey: ['/api/conversations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/contacts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/conversations', activeConversationId, 'messages'] });


      setIsDeleteModalOpen(false);
      setLocation('/inbox');
    } catch (error: any) {
      console.error('Error deleting contact:', error);
      toast({
        title: t('contacts.delete.error_title', 'Delete Failed'),
        description: error.message || t('contacts.delete.error_message', 'Failed to delete contact. Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const initiateCallMutation = useMutation({
    mutationFn: async (selection: CallWizardSelection) => {
      if (!activeConversationId) {
        throw new Error('No active conversation');
      }
      
      const response = await apiRequest(
        'POST',
        `/api/conversations/${activeConversationId}/initiate-call`,
        {
          channelId: selection.channel.id,
          callType: selection.callType,
          recording: selection.recording,
          transcription: selection.transcription,
          sdpOffer: selection.sdpOffer,
        }
      );
      
      return response.json();
    },
    onMutate: () => {
      setIsInitiatingCall(true);
    },
    onSuccess: (data, selection) => {
      toast({
        title: t('conversations.call.success_title', 'Call Initiated'),
        description: t('conversations.call.success_message', 'Outbound call has been initiated successfully.'),
      });
      
      // Set active call data and open call screen modal
      if (data.success && data.callId) {
        setActiveCallData({
          callId: data.callId,
          contactName: contact?.name || contact?.phone || 'Unknown',
          contactPhone: contact?.phone || '',
          contactAvatar: contact?.avatar,
          conferenceName: data.conferenceName,
          channelId: data.channelId,
          callType: data.callType || data.metadata?.callType || 'direct',
          providerStack: data.providerStack || data.metadata?.providerStack || selection.channel.providerStack,
          supportsBrowserDirect: data.supportsBrowserDirect ?? data.metadata?.supportsBrowserDirect ?? selection.channel.supportsBrowserDirect,
          provider: data.provider || (selection.channel.channelType === 'whatsapp_official' ? 'whatsapp' : undefined),
          rtcSessionKey: selection.rtcSessionKey,
        });
        setIsCallScreenOpen(true);
      }
      
      // Invalidate call logs to refresh the list
      queryClient.invalidateQueries({ queryKey: ['/api/call-logs'] });
    },
    onError: (error: Error & { errorCode?: string }, selection) => {
      if (selection.rtcSessionKey) closeWhatsAppRtcSession(selection.rtcSessionKey);
      toast({
        title: t('conversations.call.error_title', 'Call Failed'),
        description: error.errorCode
          ? t(`calling.errors.${error.errorCode}`, error.message)
          : error.message || t('conversations.call.error_message', 'Failed to initiate call. Please try again.'),
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsInitiatingCall(false);
    }
  });

  const handleInitiateCall = async () => {
    if (activeConversation?.isGroup) {
      toast({
        title: t('conversations.call.group_not_supported_title', 'Not Supported'),
        description: t('conversations.call.group_not_supported_message', 'Calls are not supported for group conversations.'),
        variant: 'destructive',
      });
      return;
    }

    // Always open the call type selection modal so the user can choose Talk Directly or Use AI Agent
    setIsCallTypeModalOpen(true);
  };

  const handleCallTypeSelected = (selection: CallWizardSelection) => {
    setIsCallTypeModalOpen(false);
    setSelectedCallType(selection.callType);
    initiateCallMutation.mutate(selection);
  };

  useEffect(() => {
    if (whatsAppStatus && whatsAppStatus.status) {
      setConnectionStatus(whatsAppStatus.status);
    }
  }, [whatsAppStatus]);

  const rawActiveMessages = activeConversationId ? (messages[activeConversationId] || []) : [];
  const activeMessages = conversations.find(c => c.id === activeConversationId)?.channelType === 'instagram'
    ? reconcileInstagramMessages(rawActiveMessages) : rawActiveMessages;

  const isInstagramThread = conversations.find(c => c.id === activeConversationId)?.channelType === 'instagram';
  const createdAtSkewMs = isInstagramThread ? estimateCreatedAtSkewMs(activeMessages) : 0;
  const getMsgTime = (m: any) => resolveMessageSortTime(m, createdAtSkewMs);

  const searchResults = (() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    const allMessages = activeMessages
      .filter((message, index, self) => index === self.findIndex(m => m.id === message.id))
      .sort((a, b) => {
        const ta = getMsgTime(a);
        const tb = getMsgTime(b);
        if (ta !== tb) return ta - tb;
        const idA = typeof a.id === 'number' ? a.id : Number.MAX_SAFE_INTEGER;
        const idB = typeof b.id === 'number' ? b.id : Number.MAX_SAFE_INTEGER;
        return idA - idB;
      });
    const filtered = allMessages.filter(m => m.type !== 'reaction');
    const matchContent = (m: any) => {
      const content = (m.content ?? '').toString().toLowerCase();
      return content.includes(q);
    };
    return filtered.filter(matchContent).map(m => m.externalId ?? String(m.id));
  })();

  const totalSearchResults = searchResults.length;
  const currentExternalId = totalSearchResults > 0 && currentResultIndex >= 0 && currentResultIndex < totalSearchResults
    ? searchResults[currentResultIndex]
    : null;

  useEffect(() => {
    if (!currentExternalId || !messagesContainerRef.current) return;
    const el = document.querySelector(`[data-external-id="${currentExternalId}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.querySelectorAll('.highlighted-message').forEach(n => n.classList.remove('highlighted-message'));
      el.classList.add('highlighted-message');
    }
  }, [currentExternalId, isSearchOpen]);

  useEffect(() => {
    if (totalSearchResults > 0 && currentResultIndex >= totalSearchResults) {
      setCurrentResultIndex(totalSearchResults - 1);
    }
    if (currentResultIndex < 0) setCurrentResultIndex(0);
  }, [totalSearchResults, currentResultIndex]);

  useEffect(() => {
    if (!isSearchOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setSearchQuery('');
        setCurrentResultIndex(0);
        return;
      }
      if (e.key === 'Enter' && searchQuery.trim()) {
        e.preventDefault();
        if (e.shiftKey) {
          setCurrentResultIndex(i => (i <= 0 ? totalSearchResults - 1 : i - 1));
        } else {
          setCurrentResultIndex(i => (i >= totalSearchResults - 1 ? 0 : i + 1));
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isSearchOpen, searchQuery, totalSearchResults]);

  useEffect(() => {
    if (isSearchOpen) searchInputRef.current?.focus();
  }, [isSearchOpen]);

  useEffect(() => {
    setCurrentResultIndex(0);
  }, [searchQuery]);

  const goToNextResult = () => {
    setCurrentResultIndex(i => (i >= totalSearchResults - 1 ? 0 : i + 1));
  };

  const goToPreviousResult = () => {
    setCurrentResultIndex(i => (i <= 0 ? totalSearchResults - 1 : i - 1));
  };

  const closeSearch = () => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setCurrentResultIndex(0);
    document.querySelectorAll('.highlighted-message').forEach(n => n.classList.remove('highlighted-message'));
  };

  useEffect(() => {
    if (!isSearchOpen) {
      document.querySelectorAll('.highlighted-message').forEach(n => n.classList.remove('highlighted-message'));
    }
  }, [isSearchOpen]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
      const isNearTop = scrollTop < 100;

      if (shouldScrollToBottom !== isNearBottom) {
        setShouldScrollToBottom(isNearBottom);
      }

      if (isNearTop && activeConversationId && !isLoadingMore) {
        const pagination = messagesPagination[activeConversationId];
        if (pagination && pagination.hasMore && !pagination.loading) {
          setIsLoadingMore(true);
          const previousScrollHeight = scrollHeight;

          loadMoreMessages(activeConversationId).then(() => {
            setTimeout(() => {
              const newScrollHeight = container.scrollHeight;
              const scrollDiff = newScrollHeight - previousScrollHeight;
              container.scrollTop = scrollTop + scrollDiff;
              setIsLoadingMore(false);
            }, 100);
          }).catch(() => {
            setIsLoadingMore(false);
          });
        }
      }
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [shouldScrollToBottom, activeConversationId, messagesPagination, loadMoreMessages, isLoadingMore]);

  useEffect(() => {
    if (activeConversationId !== lastActiveConversationId) {
      setPrevMessageCount(0);
      setShouldScrollToBottom(true);
      setShouldScrollOnLoad(true);
      setAssignedUserId(null);
      setLastActiveConversationId(activeConversationId);
    }
  }, [activeConversationId, lastActiveConversationId]);

  useEffect(() => {
    if (activeConversation) {
      setAssignedUserId(activeConversation.assignedToUserId || null);
    }
  }, [activeConversation]);

  useEffect(() => {
    if (shouldScrollOnLoad && messagesEndRef.current) {
      const timeoutId = setTimeout(() => {
        if (messagesEndRef.current) {
          messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
          setShouldScrollOnLoad(false);
          setShouldScrollToBottom(true);
        }
      }, activeMessages.length > 0 ? 150 : 300);

      return () => clearTimeout(timeoutId);
    }
  }, [activeMessages, shouldScrollOnLoad]);

  useEffect(() => {
    const currentMessageCount = activeMessages.length;

    if (currentMessageCount > prevMessageCount && !shouldScrollOnLoad) {
      const lastMessage = activeMessages[activeMessages.length - 1];
      const lastMessageIsOutbound = lastMessage?.direction === 'outbound';
      const shouldScroll = shouldScrollToBottom || lastMessageIsOutbound;

      if (shouldScroll && messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        if (lastMessageIsOutbound) setShouldScrollToBottom(true);
      }
    }

    setPrevMessageCount(currentMessageCount);
  }, [activeMessages, prevMessageCount, shouldScrollToBottom, shouldScrollOnLoad]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
      setShouldScrollToBottom(true);
    }
  };

  const handleReplyToMessage = (message: any) => {
    setReplyToMessage(message);
  };

  const handleQuotedMessageClick = (quotedMessageId: string) => {
    const messageElement = document.querySelector(`[data-external-id="${quotedMessageId}"]`);
    if (messageElement) {
      messageElement.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });

      messageElement.classList.add('highlighted-message');
      setTimeout(() => {
        messageElement.classList.remove('highlighted-message');
      }, 2000);
    }
  };

  const renderMessagesWithDateSeparators = () => {
    const allMessages = activeMessages
      .filter((message, index, self) => {
        const isFirstOccurrenceById = index === self.findIndex(m => m.id === message.id);
        return isFirstOccurrenceById;
      })
      .sort((a, b) => {
        const ta = getMsgTime(a);
        const tb = getMsgTime(b);
        if (ta !== tb) return ta - tb;

        const idA = typeof a.id === 'number' ? a.id : Number.MAX_SAFE_INTEGER;
        const idB = typeof b.id === 'number' ? b.id : Number.MAX_SAFE_INTEGER;
        return idA - idB;
      });



    const filteredMessages = allMessages.filter(message => message.type !== 'reaction');
    const reactionMessages = allMessages.filter(message => message.type === 'reaction');

    const reactionsByTarget = reactionMessages.reduce((acc, reaction) => {
      const targetMessageId = reaction.metadata?.targetMessageId;
      if (targetMessageId) {
        if (!acc[targetMessageId]) {
          acc[targetMessageId] = [];
        }
        acc[targetMessageId].push(reaction);
      }
      return acc;
    }, {} as Record<string, any[]>);

    const elements: JSX.Element[] = [];


    if (filteredMessages.length > 0) {
      const firstMessageDate = new Date(filteredMessages[0].sentAt || filteredMessages[0].createdAt);
      elements.push(
        <div key="conversation-start" className="flex justify-center mb-4">
          <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-3 py-1 rounded-full">
            {t('inbox.conversation_started_via', 'Conversation started via {{channel}}', { channel: channelInfo.name })}
          </span>
        </div>
      );
    }

    filteredMessages.forEach((message, index) => {
      const previousMessage = index > 0 ? filteredMessages[index - 1] : null;
      

      if (shouldShowDateSeparator(message, previousMessage)) {
        const messageDate = new Date(message.sentAt || message.createdAt);
        elements.push(
          <DateSeparator key={`date-${message.id}`} date={messageDate} />
        );
      }



      const messageReactions = reactionsByTarget[message.externalId] || [];

      elements.push(
        <MessageBubble
          key={message.id}
          message={message}
          contact={contact}
          channelType={activeConversation?.channelType}
          onReply={handleReplyToMessage}
          onQuotedMessageClick={handleQuotedMessageClick}
          conversation={activeConversation}
          reactions={messageReactions}
        />
      );
    });

    return elements;
  };

  if (!activeConversationId) {
    return (
      <div className="flex-1 flex flex-col bg-background">
        {isMobile && (
          <div className="sticky top-0 z-10 bg-card border-b border-border flex items-center justify-between px-3 py-3" style={{ position: 'sticky', top: 0, zIndex: 10 }}>
            <div className="flex items-center">
              <button data-tour="components-conversations-conversationview.button.inbox.show_conversations"
                onClick={toggleConversationList}
                className="p-2 rounded-md hover:bg-accent mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label={t('inbox.show_conversations', 'Show conversations')}
              >
                <i className="ri-menu-line text-lg text-muted-foreground"></i>
              </button>
              <h1 data-tour="components-conversations-conversationview.h1.inbox.conversations" className="text-lg font-semibold text-foreground">{t('inbox.conversations', 'Conversations')}</h1>
            </div>
          </div>
        )}

        <div className="relative flex flex-1 items-center justify-center overflow-y-auto p-4 sm:p-8">
          <div
            className="relative flex w-full max-w-4xl flex-col items-center overflow-hidden rounded-[2rem] border border-border bg-card/70 px-6 py-10 text-center shadow-2xl backdrop-blur-sm sm:px-12 sm:py-14"
            style={{
              backgroundImage: 'radial-gradient(circle at 1px 1px, hsl(var(--muted-foreground) / 0.13) 1px, transparent 0)',
              backgroundSize: '18px 18px',
            }}
          >
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-primary/[0.025] via-transparent to-background/20" />
            <div className="relative mb-5 flex h-44 w-52 items-center justify-center sm:h-52 sm:w-60">
              <EmptyConversationIllustration className="h-full w-full" />
            </div>

            <div className="relative z-10 flex w-full max-w-xl flex-col items-center">
              <h2 data-tour="components-conversations-conversationview.h2.inbox.no_conversation_selected" className="mb-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                {t('inbox.no_conversation_selected', 'No Conversation Selected')}
              </h2>
              <p className="mb-7 text-base text-muted-foreground sm:text-lg">
                {t('inbox.select_conversation_hint', 'Select a conversation from the list to view messages')}
              </p>

              <div className="flex w-full items-start gap-3 rounded-xl border border-border bg-background/55 px-4 py-3 text-left text-sm text-muted-foreground sm:px-5 sm:text-base">
                <Lightbulb className="mt-0.5 h-6 w-6 shrink-0 text-primary" />
                <p>{t('inbox.empty_state_tip', 'Tip: Use search or filters to quickly find the conversation you’re looking for.')}</p>
              </div>

              <div className="my-5 flex w-full items-center gap-4 text-sm text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <span>{t('inbox.empty_state_or', 'or')}</span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <Button data-tour="components-conversations-conversationview.button.inbox.start_new_conversation"
                type="button"
                variant="outline"
                className="h-11 w-full max-w-sm rounded-full border-primary/50 bg-background/40 hover:border-primary hover:bg-primary/10"
                onClick={() => setIsNewConversationModalOpen(true)}
              >
                <Plus className="mr-2 h-4 w-4" />
                {t('inbox.start_new_conversation', 'Start New Conversation')}
              </Button>

              {isMobile && (
                <Button data-tour="components-conversations-conversationview.button.inbox.show_conversations" type="button" variant="ghost" className="mt-3" onClick={toggleConversationList}>
                  {t('inbox.show_conversations', 'Show conversations')}
                </Button>
              )}
            </div>
          </div>
        </div>
        <NewConversationModal
          isOpen={isNewConversationModalOpen}
          onClose={() => setIsNewConversationModalOpen(false)}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-64"></div>
          <div className="h-32 bg-muted rounded w-96"></div>
          <div className="h-8 bg-muted rounded w-48"></div>
        </div>
      </div>
    );
  }

  if (focused && conversationError) {
    return <div role="alert" className="p-4 text-sm text-muted-foreground">
      {t('pipeline.follow_up.unavailable', 'This conversation is unavailable or you do not have access.')}
    </div>;
  }
  const contact = activeConversation?.contact;

  const getChannelInfo = (channelType: string) => {
    switch(channelType) {
      case 'whatsapp':
      case 'whatsapp_unofficial':
        return { icon: 'ri-whatsapp-line', color: '#25D366', name: t('conversations.view.channel.whatsapp', 'WhatsApp') };
      case 'whatsapp_official':
        return { icon: 'ri-whatsapp-line', color: '#25D366', name: t('conversations.view.channel.whatsapp_business', 'WhatsApp Business') };
      case 'facebook':
      case 'messenger':
        return { icon: 'ri-messenger-line', color: '#1877F2', name: t('conversations.view.channel.messenger', 'Messenger') };
      case 'instagram':
        return { icon: 'ri-instagram-line', color: '#E4405F', name: t('conversations.view.channel.instagram', 'Instagram') };
      case 'tiktok':
        return { icon: 'ri-tiktok-line dark:text-white', color: '#000000', name: t('conversations.view.channel.tiktok', 'TikTok Business') };
      case 'telegram':
        return { icon: 'ri-telegram-line', color: '#0088CC', name: t('conversations.item.channel.telegram', 'Telegram') };
      case 'email':
        return { icon: 'ri-mail-line', color: '#333235', name: t('conversations.view.channel.email', 'Email') };
      case 'sms':
        return { icon: InboxConversationIcon, color: '#10B981', name: t('conversations.view.channel.sms', 'SMS') };
      case 'twilio_sms':
        return { icon: TwilioIcon, color: '#F22F46', name: t('conversations.view.channel.twilio_sms', 'Twilio SMS') };
      case 'twilio_voice':
        return { icon: TwilioIcon, color: '#F22F46', name: t('conversations.view.channel.voice_calls', 'Voice Calls') };
      case 'webapp':
        return { icon: 'ri-global-line', color: '#8B5CF6', name: t('conversations.view.channel.web_chat', 'Web Chat') };
      default:
        return { icon: InboxConversationIcon, color: '#333235', name: t('conversations.view.channel.chat', 'Chat') };
    }
  };

  const channelInfo = getChannelInfo(activeConversation?.channelType);
  const channelLabel = activeConversation?.channelType === 'instagram'
    ? getInstagramHandle(contact) || t('contacts.instagram_username_unavailable', 'Username unavailable')
    : channelInfo.name;

  const getLastActiveTime = () => {
    if (!activeConversation) return '';
    

    const lastMessage = activeMessages[activeMessages.length - 1];
    if (lastMessage) {
      const lastMessageDate = new Date(lastMessage.sentAt || lastMessage.createdAt);
      return formatMessageDateTime(lastMessageDate, activeConversation.isGroup ? {
        locale: currentLanguage?.code,
        today: t('common.today', 'Today'),
        yesterday: t('conversations.item.yesterday', 'Yesterday'),
      } : undefined);
    }
    

    if (activeConversation.updatedAt) {
      const updatedDate = new Date(activeConversation.updatedAt);
      return formatMessageDateTime(updatedDate, activeConversation.isGroup ? {
        locale: currentLanguage?.code,
        today: t('common.today', 'Today'),
        yesterday: t('conversations.item.yesterday', 'Yesterday'),
      } : undefined);
    }
    
    return t('inbox.last_active_unknown', 'Last active unknown');
  };



  return (
    <div className="flex-1 flex flex-col bg-background overflow-hidden h-full min-h-0 min-w-0">
      <div className="top-0 flex-shrink-0 bg-card border-b border-border flex items-center justify-between px-3 sm:px-4 py-3" style={{ position: 'sticky' }}>
        <div className="flex items-center flex-1 min-w-0">
          {isMobile && !focused && (
            <button data-tour="components-conversations-conversationview.button.inbox.show_conversations"
              onClick={toggleConversationList}
              className="p-2 rounded-md hover:bg-accent mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
              aria-label={t('inbox.show_conversations', 'Show conversations')}
            >
              <i className="ri-menu-line text-lg text-muted-foreground"></i>
            </button>
          )}

          <div className="relative flex-shrink-0">
            {activeConversation?.isGroup ? (
              <GroupAvatar
                groupName={activeConversation.groupName || 'Group'}
                groupJid={activeConversation.groupJid}
                connectionId={activeConversation.channelId}
                conversationId={activeConversation.id}
                groupMetadata={activeConversation.groupMetadata}
                size="md"
                showRefreshButton={isWhatsApp && connectionStatus === 'active'}
              />
            ) : contact ? (
              <ContactAvatar
                contact={contact}
                connectionId={activeConversation.channelId}
                channelType={activeConversation.channelType}
                size="md"
                showRefreshButton={
                  (isWhatsApp || activeConversation.channelType === 'instagram') &&
                  connectionStatus === 'active'
                }
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted"></div>
            )}
            {!activeConversation?.isGroup && (
              <span className={`absolute bottom-0 right-0 block h-2.5 w-2.5 rounded-full ${contact?.isActive ? 'bg-green-500' : 'bg-muted'} border-2 border-background`}></span>
            )}
          </div>

          <div className="ml-3 flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 data-tour="components-conversations-conversationview.h2.groups.unnamed_group" className="text-base sm:text-lg font-semibold text-foreground truncate">
                {activeConversation?.isGroup
                  ? (activeConversation.groupName || t('groups.unnamed_group', 'Unnamed Group'))
                  : contact?.name
                }
              </h2>
              {activeConversation?.status === 'open' && !assignedUserId && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 whitespace-nowrap">
                  {t('inbox.new_lead', 'New Lead')}
                </span>
              )}
              {activeConversation?.channelType === 'tiktok' && (
                <span
                  className={`px-2 py-0.5 text-xs rounded-full whitespace-nowrap ${
                    tiktokWindow.status === 'active'
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                      : tiktokWindow.status === 'expiring_soon'
                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'
                        : 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
                  }`}
                  title={
                    tiktokWindow.expiresAt
                      ? t('conversations.tiktok_window_expires', 'Window expires: {{date}}', {
                          date: new Date(tiktokWindow.expiresAt).toLocaleString()
                        })
                      : tiktokWindow.status === 'expired'
                        ? t('conversations.tiktok_window_expired', 'Messaging window has expired')
                        : t('conversations.tiktok_window_active', 'Messaging window active')
                  }
                >
                  {tiktokWindow.status === 'active'
                    ? t('conversations.tiktok_badge_active', 'Active')
                    : tiktokWindow.status === 'expiring_soon'
                      ? t('conversations.tiktok_badge_expiring', 'Expiring Soon')
                      : t('conversations.tiktok_badge_expired', 'Expired')}
                </span>
              )}
              {activeConversationId && !isMobile && !activeConversation?.isGroup && (
                <AgentAssignment
                  conversationId={activeConversationId}
                  currentAssignedUserId={assignedUserId}
                  onAssignmentChange={setAssignedUserId}
                  variant="badge"
                  size="sm"
                />
              )}
              {activeConversationId && !isMobile && (
                <FollowUpIndicator conversationId={activeConversationId} />
              )}
            </div>
            <div className="flex items-center text-xs sm:text-sm text-muted-foreground mt-1">
              <span className="flex items-center min-w-0 max-w-[45%]">
                {typeof channelInfo.icon === 'string' ? (
                  <i className={channelInfo.icon + " mr-1 shrink-0"} style={channelInfo.icon.includes('tiktok') ? undefined : { color: channelInfo.color }}></i>
                ) : (
                  <channelInfo.icon className="mr-1 h-4 w-4" style={{ color: channelInfo.color }} />
                )}
                <span className="truncate" title={channelLabel}>{channelLabel}</span>
              </span>
              {activeConversation?.isGroup && (
                <>
                  <span className="mx-2">•</span>
                  <button data-tour="components-conversations-conversationview.button.groups.participants.view_all"
                    onClick={() => setIsParticipantsModalOpen(true)}
                    className="truncate hover:text-primary hover:underline cursor-pointer transition-colors"
                    title={t('groups.participants.view_all', 'View all participants')}
                  >
                    {activeConversation.groupParticipantCount || 0} {t('groups.participants', 'participants')}
                  </button>
                </>
              )}
              <span className="mx-2 hidden sm:inline">•</span>
              <span className="hidden sm:inline truncate">{getLastActiveTime()}</span>
              {activeConversationId && (
                <>
                  <span className="mx-2 hidden sm:inline">•</span>
                  <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button data-tour="components-conversations-conversationview.button.inbox.ai_tooltip_disabled"
                        type="button"
                        onClick={() => toggleBot()}
                        disabled={isToggling}
                        className={`
                          inline-flex items-center justify-center text-sm rounded p-1 sm:px-1.5 sm:py-0.5 sm:-mx-1 transition-colors
                          ${isBotDisabled
                            ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-900/50'
                            : 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                          }
                          disabled:opacity-60 disabled:pointer-events-none
                        `}
                        aria-label={isBotDisabled
                          ? t('inbox.ai_tooltip_disabled', 'AI is off. Click to enable automated responses.')
                          : t('inbox.ai_tooltip_enabled', 'AI is on. Click to disable automated responses.')
                        }
                      >
                        {isToggling ? (
                          <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" />
                        ) : (
                          <BotIcon className="sm:mr-1.5" size={16} />
                        )}
                        <span className="hidden sm:inline">
                          {isBotDisabled
                            ? activeConversation?.disableReason === 'bot_loop_rate_limit'
                              ? t('conversations.bot_loop_stopped', 'Automation stopped: rate limit reached')
                              : t('conversations.bot_disabled', 'Bot disabled')
                            : t('conversations.bot_enabled', 'Bot enabled')}
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-xs text-xs">
                      {isBotDisabled
                        ? activeConversation?.disableReason === 'bot_loop_rate_limit'
                          ? t('conversations.bot_loop_stopped_tooltip', 'Automation stopped because the message rate limit was reached. A human reply will reset protection based on Inbox Settings.')
                          : t('inbox.ai_tooltip_disabled', 'AI is off. Click to enable automated responses.')
                        : t('inbox.ai_tooltip_enabled', 'AI is on. Click to disable automated responses.')
                      }
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-1 sm:space-x-2 ml-2">
          {/* Export Participants button for group conversations */}
          {activeConversation?.isGroup && (
            <button data-tour="components-conversations-conversationview.button.groups.participants.export_participants"
              onClick={() => setIsParticipantsModalOpen(true)}
              className="p-2 sm:p-1.5 rounded-md hover:bg-accent min-h-[44px] min-w-[44px] sm:min-h-auto sm:min-w-auto flex items-center justify-center text-muted-foreground hidden sm:flex"
              aria-label={t('groups.participants.export_participants', 'Export Participants')}
              title={t('groups.participants.export_participants', 'Export Participants')}
            >
              <i className="ri-download-line text-lg sm:text-base"></i>
            </button>
          )}

          {!focused && <InboxDutyStatusToggle />}

          <button data-tour="components-conversations-conversationview.button.contacts.details.close_details"
            hidden={focused}
            onClick={toggleContactDetails}
            className={`${focused ? 'hidden' : 'flex'} p-2 sm:p-1.5 rounded-md hover:bg-accent min-h-[44px] min-w-[44px] sm:min-h-auto sm:min-w-auto items-center justify-center ${
              isContactDetailsOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
            }`}
            aria-label={isContactDetailsOpen ? t('contacts.details.close_details', 'Close contact details') : t('contacts.details.show_details', 'Show contact details')}
          >
            <i className="ri-information-line text-lg sm:text-base"></i>
          </button>

          <button data-tour="components-conversations-conversationview.button.conversations.view.search_messages"
            onClick={() => {
              setIsSearchOpen(true);
              setSearchQuery('');
              setCurrentResultIndex(0);
              setTimeout(() => searchInputRef.current?.focus(), 100);
            }}
            className={`p-2 sm:p-1.5 rounded-md hover:bg-accent min-h-[44px] min-w-[44px] sm:min-h-auto sm:min-w-auto flex items-center justify-center ${
              isSearchOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
            }`}
            aria-label={t('conversations.view.search_messages', 'Search messages')}
          >
            <i className="ri-search-line text-lg sm:text-base"></i>
          </button>

          {!activeConversation?.isGroup && contact && (
            <button data-tour="components-conversations-conversationview.button.conversations.view.start_call"
              onClick={handleInitiateCall}
              disabled={isInitiatingCall}
              className="p-2 sm:p-1.5 rounded-md hover:bg-accent min-h-[44px] min-w-[44px] sm:min-h-auto sm:min-w-auto flex items-center justify-center hidden sm:flex disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label={t('conversations.view.start_call', 'Start Call')}
            >
              {isInitiatingCall ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <i className="ri-phone-line text-muted-foreground"></i>
              )}
            </button>
          )}

          {/* Delete Contact Button - Only visible to admins */}
          {!focused && (user?.role === 'admin' || user?.isSuperAdmin) && contact && (
            <button data-tour="components-conversations-conversationview.button.conversations.view.delete_contact"
              onClick={() => setIsDeleteModalOpen(true)}
              className="p-2 sm:p-1.5 rounded-md hover:bg-destructive/10 min-h-[44px] min-w-[44px] sm:min-h-auto sm:min-w-auto flex items-center justify-center hidden sm:flex"
              aria-label={t('conversations.view.delete_contact', 'Delete Contact')}
              disabled={isDeleting}
            >
              <i className={`ri-delete-bin-line ${isDeleting ? 'text-muted-foreground' : 'text-destructive'}`}></i>
            </button>
          )}

          <button data-tour="components-conversations-conversationview.button.contacts.details.close_details"
            hidden={focused}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleContactDetails();
            }}
            className={`${focused ? 'hidden' : 'flex'} p-2 sm:p-1.5 rounded-md hover:bg-accent min-h-[44px] min-w-[44px] sm:min-h-auto sm:min-w-auto items-center justify-center transition-colors duration-200 ${
              isContactDetailsOpen ? 'bg-primary/10 text-primary' : 'text-muted-foreground'
            }`}
            aria-label={isContactDetailsOpen ? t('contacts.details.close_details', 'Close contact details') : t('contacts.details.show_details', 'Show contact details')}
          >
            <i className={`ri-more-2-fill transition-transform duration-200 ${isContactDetailsOpen ? 'rotate-90' : ''}`}></i>
          </button>
        </div>
      </div>

      {isSearchOpen && (
        <div className="conversation-search-bar border-b border-border bg-card px-3 py-2 flex items-center gap-2">
          <Input data-tour="components-conversations-conversationview.input.conversations.view.search_messages_placeholder"
            ref={searchInputRef}
            type="search"
            placeholder={t('conversations.view.search_messages_placeholder', 'Search messages...')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 h-9"
            autoFocus
          />
          {searchQuery.trim() && totalSearchResults === 0 && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {t('conversations.view.no_results', 'No results found')}
            </span>
          )}
          {searchQuery.trim() && totalSearchResults > 0 && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {currentResultIndex + 1} {t('common.of', 'of')} {totalSearchResults}
            </span>
          )}
          {searchQuery.trim() && totalSearchResults > 0 && (
            <>
              <button data-tour="components-conversations-conversationview.button.conversations.view.previous_result"
                type="button"
                onClick={goToPreviousResult}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground disabled:opacity-50 disabled:pointer-events-none"
                aria-label={t('conversations.view.previous_result', 'Previous result')}
                disabled={totalSearchResults <= 1}
              >
                <i className="ri-arrow-up-s-line text-lg"></i>
              </button>
              <button data-tour="components-conversations-conversationview.button.conversations.view.next_result"
                type="button"
                onClick={goToNextResult}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground disabled:opacity-50 disabled:pointer-events-none"
                aria-label={t('conversations.view.next_result', 'Next result')}
                disabled={totalSearchResults <= 1}
              >
                <i className="ri-arrow-down-s-line text-lg"></i>
              </button>
            </>
          )}
          <button data-tour="components-conversations-conversationview.button.common.close"
            type="button"
            onClick={closeSearch}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground"
            aria-label={t('common.close', 'Close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="flex-1 flex flex-col overflow-hidden relative min-h-0 min-w-0">
          <div
            ref={messagesContainerRef}
            className="flex-1 min-h-0 p-4 overflow-y-auto overflow-x-hidden overscroll-y-contain scroll-smooth conversation-background messages-container mobile-scroll"
            id="conversation-messages"
          >
            {activeConversationId && messagesPagination[activeConversationId]?.loading && (
              <div className="flex justify-center mb-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted px-3 py-2 rounded-full">
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-muted-foreground"></div>
                  {t('inbox.loading_messages', 'Loading more messages...')}
                </div>
              </div>
            )}

            {renderMessagesWithDateSeparators()}

            <div ref={messagesEndRef} />
          </div>

          {!shouldScrollToBottom && activeMessages.length > 5 && (
            <button data-tour="components-conversations-conversationview.button.inbox.scroll_to_bottom"
              onClick={scrollToBottom}
              className="absolute top-30 right-5 w-10 h-10 bg-brand-primary rounded-full shadow-md text-white flex items-center justify-center hover:bg-primary-600 transition-all z-10"
              aria-label={t('inbox.scroll_to_bottom', 'Scroll to bottom')}
            >
              <i className="ri-arrow-down-s-line text-lg text-white"></i>
            </button>
          )}

          <MessageInput
            key={activeConversationId}
            conversationId={activeConversationId}
            conversation={activeConversation}
            contact={contact}
          />
        </div>

        {activeConversation?.isGroup ? (
          <GroupInfoPanel
            conversation={activeConversation}
            className={`${
              isContactDetailsOpen ? 'flex' : 'hidden'
            } flex-col fixed top-0 right-0 h-full z-50 lg:static lg:z-0 w-full max-w-sm sm:max-w-md lg:w-80 bg-card border-l border-border shadow-lg lg:shadow-none transition-all duration-300 ease-in-out overflow-y-auto`}
          />
        ) : (
          <ContactDetails
            contact={contact}
            conversation={activeConversation}
            className={`${
              isContactDetailsOpen ? 'flex' : 'hidden'
            } flex-col fixed top-0 right-0 h-full z-50 lg:static lg:z-0 w-full max-w-sm sm:max-w-md lg:w-80 bg-card border-l border-border shadow-lg lg:shadow-none transition-all duration-300 ease-in-out overflow-y-auto`}
          />
        )}
      </div>

      {/* Group Participants Modal */}
      {activeConversation?.isGroup && (
        <GroupParticipantsModal
          isOpen={isParticipantsModalOpen}
          onClose={() => setIsParticipantsModalOpen(false)}
          conversationId={activeConversationId!}
          groupName={activeConversation.groupName}
          connectionId={activeConversation.channelId}
        />
      )}

      {/* Delete Contact Confirmation Modal */}
      <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
        <DialogContent data-tour="components-conversations-conversationview.dialogcontent.contacts.delete.confirm_title" className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              {t('contacts.delete.confirm_title', 'Delete Contact')}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('contacts.delete.confirm_message',
                'This action will permanently delete this contact and ALL associated data including:'
              )}
              <ul className="mt-2 ml-4 list-disc text-sm text-foreground">
                <li>{t('contacts.delete.conversations', 'All conversations with this contact')}</li>
                <li>{t('contacts.delete.messages', 'All messages in those conversations')}</li>
                <li>{t('contacts.delete.media', 'All media files (images, documents, audio, video)')}</li>
                <li>{t('contacts.delete.notes', 'All notes and deals associated with this contact')}</li>
              </ul>
              <p className="mt-3 font-semibold text-destructive">
                {t('contacts.delete.warning', 'This action cannot be undone!')}
              </p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button data-tour="components-conversations-conversationview.button.common.cancel"
              variant="outline"
              onClick={() => setIsDeleteModalOpen(false)}
              disabled={isDeleting}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
            <Button data-tour="components-conversations-conversationview.button.contacts.delete.deleting"
              variant="destructive"
              onClick={handleDeleteContact}
              disabled={isDeleting}
              className="min-w-[100px]"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('contacts.delete.deleting', 'Deleting...')}
                </>
              ) : (
                t('contacts.delete.confirm_button', 'Delete Contact')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Call Screen Modal */}
      {isCallScreenOpen && activeCallData && (activeCallData.provider === 'whatsapp' ? (
        <WhatsAppCallScreenModal
          isOpen={isCallScreenOpen}
          onClose={() => { setIsCallScreenOpen(false); setActiveCallData(null); }}
          callId={Number(activeCallData.callId)}
          contactName={activeCallData.contactName}
          rtcSessionKey={activeCallData.rtcSessionKey}
        />
      ) : (
        <CallScreenModal
          isOpen={isCallScreenOpen}
          onClose={() => {
            setIsCallScreenOpen(false);
            setActiveCallData(null);
          }}
          callId={activeCallData.callId}
          contactName={activeCallData.contactName}
          contactPhone={activeCallData.contactPhone}
          contactAvatar={activeCallData.contactAvatar}
          conferenceName={activeCallData.conferenceName}
          channelId={activeCallData.channelId || channelConnection?.id}
          callType={activeCallData.callType}
          providerStack={activeCallData.providerStack}
          supportsBrowserDirect={activeCallData.supportsBrowserDirect}
        />
      ))}

      {/* Call Type Selection Modal */}
      <CallChannelWizard
        isOpen={isCallTypeModalOpen}
        onClose={() => setIsCallTypeModalOpen(false)}
        onStart={handleCallTypeSelected}
        contactId={contact?.id}
        conversationId={activeConversationId || undefined}
        contactName={contact?.name || contact?.phone}
        isStarting={isInitiatingCall}
      />
    </div>
  );
}
