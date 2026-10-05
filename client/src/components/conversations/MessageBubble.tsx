import { getMediaDownloadUrl, getMediaInlineUrl, getMediaPreviewUrl } from './mediaBubbleActions';
import { MediaDownloadButton } from './ConversationMediaGallery';
import { format } from 'date-fns';
import { useState, useEffect, useRef } from 'react';
import { Download, Loader2, Trash2, Reply, MoreHorizontal, Mail, ArrowRight, Phone, Bot } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { useBranding } from '@/contexts/branding-context';
import { useConversations } from '@/context/ConversationContext';
import QuotedMessagePreview from './QuotedMessagePreview';
import OptimizedMediaBubble from './OptimizedMediaBubble';
import { GroupParticipantAvatar } from '@/components/groups/GroupParticipantAvatar';
import { ContactAvatar } from '@/components/contacts/ContactAvatar';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';
import { stripAgentSignature } from '@/utils/messageUtils';
import { instagramTextQuoteParts } from '@shared/instagram-message-utils';
import { INSTAGRAM_SHARED_TYPES } from '@shared/instagram-message-context';
import InstagramMessageContext from './InstagramMessageContext';
import { resolveMediaUrl, toSameOriginAppMediaUrl, isAppServedMediaPath } from '@/utils/mediaUrl';
import { FormattedText, extractUrls } from '@/utils/textFormatter';
import PollMessage from './PollMessage';
import LinkPreview from './LinkPreview';
import PollResponse from './PollResponse';
import { useQuery } from '@tanstack/react-query';
import { formatMessageDateTime } from '@/utils/dateUtils';
import BotIcon from '@/components/ui/bot-icon';
import { useMessageCache } from '@/hooks/useMessageCache';
import './QuotedMessage.css';


function PollMessageWithData({
  message,
  pollContext,
  displayContent,
  isInbound,
  showPollResults,
  setShowPollResults
}: {
  message: any;
  pollContext: any;
  displayContent: string;
  isInbound: boolean;
  showPollResults: boolean;
  setShowPollResults: (show: boolean) => void;
}) {

  const { data: pollVoteData, isLoading } = useQuery({
    queryKey: ['poll-votes', message.id],
    queryFn: async () => {
      const response = await fetch(`/api/poll-votes/${message.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch poll votes');
      }
      return response.json();
    },
    enabled: showPollResults, // Only fetch when results are requested
    staleTime: 30000, // Cache for 30 seconds
  });

  const handleViewVotes = () => {
    setShowPollResults(!showPollResults);
  };


  const options = showPollResults && pollVoteData
    ? pollVoteData.options
    : pollContext.pollOptions?.map((option: string, index: number) => ({
        text: option,
        value: `option${index + 1}`,
        votes: 0
      })) || [];

  const totalVotes = showPollResults && pollVoteData ? pollVoteData.totalVotes : 0;

  return (
    <PollMessage
      question={pollContext.pollName || displayContent}
      options={options}
      totalVotes={totalVotes}
      isOutbound={!isInbound}
      showResults={showPollResults}
      onViewVotes={handleViewVotes}
      isLoadingVotes={isLoading}
    />
  );
}


function PollVoteWithData({
  message,
  displayContent,
  isInbound
}: {
  message: any;
  displayContent: string;
  isInbound: boolean;
}) {

  const { pollVote } = (() => {
    try {
      const metadata = typeof message.metadata === 'string'
        ? JSON.parse(message.metadata)
        : message.metadata || {};
      return {
        pollVote: metadata.pollVote
      };
    } catch (error) {
      console.error('Error parsing poll vote metadata:', error);
      return { pollVote: null };
    }
  })();


  let selectedIndex = 0;
  if (displayContent.startsWith('poll_vote_selected:')) {
    const indexMatch = displayContent.match(/poll_vote_selected:(\d+)/);
    if (indexMatch) {
      selectedIndex = parseInt(indexMatch[1], 10);
    }
  }


  const { data: originalPollData } = useQuery({
    queryKey: ['original-poll', pollVote?.pollCreationMessageKey?.id],
    queryFn: async () => {
      if (!pollVote?.pollCreationMessageKey?.id) {
        throw new Error('No poll creation message key found');
      }

      const response = await fetch(`/api/messages/by-external-id/${pollVote.pollCreationMessageKey.id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch original poll message');
      }
      return response.json();
    },
    enabled: !!pollVote?.pollCreationMessageKey?.id,
    staleTime: 300000, // Cache for 5 minutes
  });


  let selectedOption = `Option ${selectedIndex + 1}`;
  let pollQuestion = 'Poll';

  if (originalPollData?.metadata?.pollContext) {
    const pollContext = originalPollData.metadata.pollContext;
    if (pollContext.pollOptions && pollContext.pollOptions[selectedIndex]) {
      selectedOption = pollContext.pollOptions[selectedIndex];
    }
    if (pollContext.pollName) {
      pollQuestion = pollContext.pollName;
    }
  }

  return (
    <PollResponse
      selectedOption={selectedOption}
      selectedIndex={selectedIndex}
      pollQuestion={pollQuestion}
      isOutbound={!isInbound}
    />
  );
}

interface ChannelCapabilities {
  supportsReply: boolean;
  supportsDelete: boolean;
  supportsQuotedMessages: boolean;
  deleteTimeLimit?: number;
  replyFormat: 'quoted' | 'threaded' | 'mention';
  supportsReactions?: boolean;
}

interface MessageBubbleProps {
  message: any;
  contact: any;
  channelType?: string;
  onReply?: (message: any) => void;
  onQuotedMessageClick?: (quotedMessageId: string) => void;
  conversation?: any; // Add conversation prop for group chat context
  reactions?: any[]; // Array of reaction messages for this message
}

interface MessageSenderProfile {
  id: number;
  fullName: string;
  avatarUrl?: string | null;
}

export default function MessageBubble({ message, contact, channelType, onReply, onQuotedMessageClick, conversation, reactions = [] }: MessageBubbleProps) {

  if (message.type === 'reaction') {
    return null;
  }
  const [isRecoveringMedia, setIsRecoveringMedia] = useState(false);
  const [localMediaUrl, setLocalMediaUrl] = useState<string | null>(null);
  const [mediaStreamRevision, setMediaStreamRevision] = useState<number | undefined>(undefined);
  const [userRequestedInlineMediaLoad, setUserRequestedInlineMediaLoad] = useState(false);
  const [persistedInlineMediaLoad, setPersistedInlineMediaLoad] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [channelCapabilities, setChannelCapabilities] = useState<ChannelCapabilities | null>(null);
  const [isLoadingCapabilities, setIsLoadingCapabilities] = useState(false);
  const [emailAttachments, setEmailAttachments] = useState<any[]>([]);
  const [isLoadingAttachments, setIsLoadingAttachments] = useState(false);
  const [showPollResults, setShowPollResults] = useState(false);
  const mediaDownloadUrl = getMediaDownloadUrl(message.type, message.id);
  const canDownloadMedia = !!mediaDownloadUrl;
  const { toast } = useToast();
  const { t, currentLanguage } = useTranslation();
  const { branding } = useBranding();
  const { user } = useAuth();
  const { activeConversationId } = useConversations();
  const { updateMessageInCache } = useMessageCache();
  
  const isInbound = message.direction === 'inbound';
  const isGroupConversation = conversation?.isGroup === true;

  const { data: agents = [] } = useQuery<MessageSenderProfile[]>({
    queryKey: ['/api/agents'],
    queryFn: async () => {
      const response = await fetch('/api/agents', { credentials: 'include' });
      if (!response.ok) throw new Error('Failed to fetch message sender profiles');
      return response.json();
    },
    enabled: !isInbound && message.senderType === 'user',
    staleTime: 5 * 60 * 1000,
  });

  const senderProfile = message.senderType === 'user'
    ? (message.senderId === user?.id ? user : agents.find(agent => agent.id === message.senderId))
    : undefined;

  const senderInitials = senderProfile?.fullName
    ? senderProfile.fullName
        .trim()
        .split(/\s+/)
        .map(part => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'A';
  



  const isFromBot = message.isFromBot === true || message.senderType === 'bot';
  const timestamp = message.sentAt || 
                   (message.metadata?.timestamp 
                     ? new Date(message.metadata.timestamp) 
                     : message.createdAt);
  
  const formattedTime = formatMessageDateTime(
    new Date(timestamp),
    isGroupConversation ? {
      locale: currentLanguage?.code,
      today: t('common.today', 'Today'),
      yesterday: t('conversations.item.yesterday', 'Yesterday'),
    } : undefined,
  );

  useEffect(() => {
    const mediaTypes = ['image', 'video', 'audio', 'voice', 'sticker'];
    if (!message?.id || !mediaTypes.includes(message?.type)) {
      setPersistedInlineMediaLoad(false);
      return;
    }

    try {
      const key = `pc:inline-media:${message.id}`;
      const stored = window.localStorage.getItem(key);
      const isPersisted = stored === '1';
      setPersistedInlineMediaLoad(isPersisted);
    } catch {
      setPersistedInlineMediaLoad(false);
    }
  }, [message?.id, message?.type]);

  useEffect(() => {
    const fetchChannelCapabilities = async () => {
      if (!activeConversationId) return;

      setIsLoadingCapabilities(true);
      try {
        const response = await fetch(`/api/conversations/${activeConversationId}/capabilities`, {
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          setChannelCapabilities(data.capabilities);
        } else {
          console.error('Failed to fetch channel capabilities');
          setChannelCapabilities({
            supportsReply: true,
            supportsDelete: true,
            supportsQuotedMessages: false,
            replyFormat: 'mention'
          });
        }
      } catch (error) {
        console.error('Error fetching channel capabilities:', error);
        setChannelCapabilities({
          supportsReply: true,
          supportsDelete: true,
          supportsQuotedMessages: false,
          replyFormat: 'mention'
        });
      } finally {
        setIsLoadingCapabilities(false);
      }
    };

    fetchChannelCapabilities();
  }, [activeConversationId]);

  useEffect(() => {
    const fetchEmailAttachments = async () => {
      if (channelType === 'email' && message.id) {
        setIsLoadingAttachments(true);
        try {
          const response = await fetch(`/api/v1/messages/${message.id}/email-attachments`);
          if (response.ok) {
            const data = await response.json();
            setEmailAttachments(data.attachments || []);
          }
        } catch (error) {
          console.error('Error fetching email attachments:', error);
        } finally {
          setIsLoadingAttachments(false);
        }
      }
    };

    fetchEmailAttachments();
  }, [channelType, message.id]);

  const getMediaUrlFromMetadata = () => {
    if (!message.metadata) return null;

    try {
      const metadata = typeof message.metadata === 'string'
        ? JSON.parse(message.metadata)
        : message.metadata;

      const u = metadata.mediaUrl || null;
      if (u && typeof u === 'string' && (u.includes('/file/bot') || u.includes('api.telegram.org/file/bot'))) {
        return null;
      }
      return u;
    } catch (e) {
      return null;
    }
  };


  const getCacheBustedMediaUrl = (url: string | null): string | undefined => {
    if (!url) return undefined;
    // Local /uploads and /media are immutable — keep a stable same-origin URL so
    // browser disk cache survives refresh (no ?t= busting).
    if (isAppServedMediaPath(url)) {
      return toSameOriginAppMediaUrl(url);
    }
    const absolute = resolveMediaUrl(url);
    const timestamp = new Date(message.createdAt).getTime();
    const separator = absolute.includes('?') ? '&' : '?';
    return `${absolute}${separator}t=${timestamp}`;
  };

  const applyRecoveredMediaUrl = (mediaUrl: string, notify = true) => {
    setLocalMediaUrl(mediaUrl);
    setMediaStreamRevision(Date.now());
    setUserRequestedInlineMediaLoad(true);
    setPersistedInlineMediaLoad(true);

    updateMessageInCache(message.id, {
      mediaUrl,
      mediaUrlFetchedAt: Date.now(),
      forceInlineMediaLoaded: true as any
    }).catch(console.error);

    try {
      if (['image', 'video', 'audio', 'voice', 'sticker'].includes(message.type)) {
        window.localStorage.setItem(`pc:inline-media:${message.id}`, '1');
      }
    } catch {}

    if (notify) {
      toast({
        title: t('message_bubble.media_ready', 'Media ready'),
        description: t('message_bubble.media_ready_desc', 'Media is now available for viewing'),
        variant: 'default'
      });
    }
  };
  
  const recoverMediaForInlineRender = async (forceRefresh = false, notify = true) => {
    if (isRecoveringMedia) return;

    setIsRecoveringMedia(true);
    try {
      const response = await fetch(`/api/messages/${message.id}/download-media`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ force: forceRefresh })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('message_bubble.media_load_failed', 'Failed to load media'));
      }

      const data = await response.json();

      if (data.error && data.canRetry) {
        if (notify) {
          toast({
            title: t('message_bubble.media_unavailable', 'Media unavailable'),
            description: data.message || t('message_bubble.media_retry', 'Media could not be loaded right now. You can try again later.'),
            variant: 'destructive'
          });
        }
        return;
      }

      if (data.mediaUrl) {
        applyRecoveredMediaUrl(data.mediaUrl, notify);
      } else {
        throw new Error(t('message_bubble.media_load_failed', 'Failed to load media'));
      }

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('message_bubble.media_load_failed', 'Failed to load media');

      if (notify) {
        toast({
          title: t('message_bubble.media_unavailable', 'Media unavailable'),
          description: errorMessage,
          variant: 'destructive'
        });
      }
    } finally {
      setIsRecoveringMedia(false);
    }
  };

  const telegramAutoFetchAttempted = useRef(false);

  useEffect(() => {
    telegramAutoFetchAttempted.current = false;
  }, [message.id]);

  useEffect(() => {
    if (channelType !== 'telegram') {
      return;
    }
    const mediaTypes = ['image', 'video', 'audio', 'voice', 'document', 'sticker'];
    if (!message?.id || !mediaTypes.includes(message?.type || '')) {
      return;
    }

    const meta =
      typeof message.metadata === 'string'
        ? (() => {
            try {
              return JSON.parse(message.metadata);
            } catch {
              return {};
            }
          })()
        : message.metadata || {};
    if (!meta.telegramFileId) {
      return;
    }

    const raw = message.mediaUrl || localMediaUrl || getMediaUrlFromMetadata();
    if (raw && !raw.includes('/file/bot') && !raw.includes('api.telegram.org/file/bot')) {
      return;
    }

    if (telegramAutoFetchAttempted.current) {
      return;
    }
    telegramAutoFetchAttempted.current = true;
    void recoverMediaForInlineRender(false, false);
  }, [channelType, message.id, message.type, message.mediaUrl, message.metadata]);

  const handleDeleteMessage = async () => {
    if (!message.id) return;

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/messages/${message.id}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || t('message_bubble.delete_failed', 'Failed to delete message'));
      }

      toast({
        title: t('message_bubble.message_deleted', 'Message deleted'),
        description: t('message_bubble.delete_success', 'Message has been deleted successfully'),
        variant: 'default'
      });

      setShowDeleteConfirm(false);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('message_bubble.delete_failed', 'Failed to delete message');

      toast({
        title: t('message_bubble.delete_failed_title', 'Delete failed'),
        description: errorMessage,
        variant: 'destructive'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReplyToMessage = () => {
    if (onReply) {
      onReply(message);
    }
  };

  const isMessageTooOldToDelete = () => {
    if (!channelCapabilities?.deleteTimeLimit) return false;

    const messageAge = Date.now() - new Date(message.sentAt || message.createdAt).getTime();
    const timeLimitMs = channelCapabilities.deleteTimeLimit * 60 * 1000;

    return messageAge > timeLimitMs;
  };

  const getAvailableActions = () => {
    if (!channelCapabilities) return { canReply: false, canDelete: false };

    const canReply = channelCapabilities.supportsReply;
    const canDelete = channelCapabilities.supportsDelete && !isMessageTooOldToDelete();

    return { canReply, canDelete };
  };

  const { canReply, canDelete } = getAvailableActions();

  const getQuotedMessageInfo = () => {
    try {
      if (!message.metadata) return null;

      let metadata;
      if (typeof message.metadata === 'string') {
        metadata = JSON.parse(message.metadata);
      } else {
        metadata = message.metadata;
      }

      if (metadata.isQuotedMessage && metadata.quotedMessageId) {
        return {
          isQuotedMessage: true,
          quotedMessageId: metadata.quotedMessageId
        };
      }

      if (metadata.instagramReplyTo?.story) {
        return { isQuotedMessage: true, quotedMessageId: metadata.instagramReplyTo.story.id || 'instagram-story',
          quotedStory: metadata.instagramReplyTo.story };
      }

      // Older group messages retained the complete Baileys payload but were
      // saved before the explicit quote fields were added. Read contextInfo so
      // those already-stored replies render correctly without a migration.
      const whatsappContent = metadata?.whatsappMessage?.message;
      if (whatsappContent && typeof whatsappContent === 'object') {
        for (const node of Object.values(whatsappContent) as any[]) {
          const stanzaId = node?.contextInfo?.stanzaId;
          if (typeof stanzaId === 'string' && stanzaId) {
            return { isQuotedMessage: true, quotedMessageId: stanzaId };
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error parsing message metadata for quoted message detection:', error);
      return null;
    }
  };

  const quotedInfo = getQuotedMessageInfo();
  const textQuoteParts = quotedInfo ? instagramTextQuoteParts(message.content, message.metadata) : null;

  const handleDeleteConfirm = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  const isWhatsAppMessage = () => {
    return channelType === 'whatsapp' ||
           channelType === 'whatsapp_unofficial' ||
           channelType === 'whatsapp_official';
  };

  const isMessageTooOld = () => {
    if (!message.createdAt) return false;
    const messageAge = Date.now() - new Date(message.createdAt).getTime();
    const maxAge = 72 * 60 * 1000;
    return messageAge > maxAge;
  };


  const isGroupChat = () => isGroupConversation;

  const getParticipantInfo = () => {
    if (!isGroupChat() || !isInbound) return null;

    return {
      jid: message.groupParticipantJid,
      name: message.groupParticipantName,
      phone: message.groupParticipantJid?.split('@')[0]
    };
  };

  const formatParticipantName = (participantInfo: any) => {
    if (!participantInfo) return '';

    if (participantInfo.name && participantInfo.name !== participantInfo.phone) {
      return participantInfo.name;
    }


    const phone = participantInfo.phone;
    if (phone && phone.length > 10) {
      return `+${phone.slice(0, -10)} ${phone.slice(-10, -7)} ${phone.slice(-7, -4)} ${phone.slice(-4)}`;
    }

    return phone || participantInfo.jid || t('groups.unknown_participant', 'Unknown Participant');
  };

  const renderEmailContent = () => {
    const { emailSubject, emailHtml, emailPlainText, emailFrom, emailTo, emailInReplyTo, emailReferences } = message;


    const isThreaded = emailInReplyTo || (emailReferences && emailReferences.length > 0);
    const isReply = emailSubject && (emailSubject.startsWith('Re:') || emailSubject.startsWith('RE:'));

    // Helper function to extract plain text from HTML
    const extractPlainTextFromHtml = (html: string): string => {
      if (!html) return '';
      // Create a temporary DOM element to parse HTML
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      return tempDiv.textContent || tempDiv.innerText || '';
    };

    // Get email content for link preview extraction
    // If emailPlainText is missing but emailHtml is present, extract plain text from HTML
    const getEmailContentForLinkPreview = (): string => {
      if (emailPlainText) {
        return emailPlainText;
      }
      if (emailHtml) {
        return extractPlainTextFromHtml(emailHtml);
      }
      return stripAgentSignature(message.content || '');
    };

    return (
      <div className="email-message">
        {/* Email Threading Indicator */}
        {isThreaded && (
          <div className="email-thread-indicator mb-2 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
            <Mail className="w-3 h-3" />
            <ArrowRight className="w-3 h-3" />
            <span>{isReply ? t('message_bubble.email.reply_in_thread', 'Reply in thread') : t('message_bubble.email.part_of_thread', 'Part of email thread')}</span>
          </div>
        )}

        {/* Email Subject */}
        {emailSubject && (
          <div className="email-subject mb-2 pb-2 border-b border-border">
            <h4 className="font-semibold text-sm text-foreground flex items-center gap-2">
              {isReply && <Reply className="w-4 h-4 text-blue-600 dark:text-blue-400" />}
              {emailSubject}
            </h4>
          </div>
        )}

        {/* Email Headers */}
        <div className="email-headers mb-3 text-xs text-muted-foreground space-y-1">
          {emailFrom && (
            <div>
              <span className="font-medium">{t('message_bubble.email.from', 'From')}:</span> {emailFrom}
            </div>
          )}
          {emailTo && (
            <div>
              <span className="font-medium">{t('message_bubble.email.to', 'To')}:</span> {emailTo}
            </div>
          )}
          {isThreaded && emailInReplyTo && (
            <div className="text-blue-600 dark:text-blue-400">
              <span className="font-medium">{t('message_bubble.email.in_reply_to', 'In reply to')}:</span> {emailInReplyTo}
            </div>
          )}
        </div>

        {/* Email Content */}
        <div className="email-content">
          {emailHtml ? (
            <div
              className="email-html-content prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{
                __html: emailHtml.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
              }}
            />
          ) : emailPlainText ? (
            <div className="whitespace-pre-wrap break-words text-sm">
              {emailPlainText}
            </div>
          ) : (
            <div className="whitespace-pre-wrap break-words text-sm">
              {stripAgentSignature(message.content || '')}
            </div>
          )}
        </div>

        {/* Link Previews for Email Content */}
        {(() => {
          const emailContent = getEmailContentForLinkPreview();
          const urlsToPreview = extractUrls(emailContent);
          return urlsToPreview.length > 0 ? (
            <div className="mt-2 space-y-2">
              {urlsToPreview.map(url => (
                <LinkPreview key={url} url={url} isInbound={isInbound} />
              ))}
            </div>
          ) : null;
        })()}

        {/* Email Attachments */}
        {emailAttachments.length > 0 && (
          <div className="email-attachments mt-3 pt-3 border-t border-border">
            <div className="text-xs text-muted-foreground mb-2 font-medium">
              <i className="ri-attachment-line mr-1"></i>
              {t('message_bubble.email.attachments', 'Attachments')} ({emailAttachments.length})
            </div>
            <div className="space-y-2">
              {emailAttachments.map((attachment: any, index: number) => (
                <div key={index} className="flex items-center justify-between bg-muted p-2 rounded text-xs">
                  <div className="flex items-center flex-1 min-w-0">
                    <i className="ri-file-line mr-2 text-muted-foreground flex-shrink-0"></i>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{attachment.filename}</div>
                      <div className="text-muted-foreground">
                        {attachment.contentType} • {Math.round(attachment.size / 1024)}KB
                      </div>
                    </div>
                  </div>
                  <MediaDownloadButton url={`/api/messages/${message.id}/stream-media?attachmentId=${attachment.id}`} />
                </div>
              ))}
            </div>
          </div>
        )}

        {isLoadingAttachments && (
          <div className="email-attachments mt-3 pt-3 border-t border-border">
            <div className="flex items-center text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin mr-2" />
              {t('message_bubble.email.loading_attachments', 'Loading attachments...')}
            </div>
          </div>
        )}
      </div>
    );
  };


  const parsePollData = () => {
    try {
      const metadata = typeof message.metadata === 'string' 
        ? JSON.parse(message.metadata) 
        : message.metadata || {};
      
      return {
        pollContext: metadata.pollContext,
        pollVote: metadata.pollVote,
        whatsappMessage: metadata.whatsappMessage
      };
    } catch (error) {
      console.error('Error parsing poll metadata:', error);
      return { pollContext: null, pollVote: null, whatsappMessage: null };
    }
  };

  const getExternalAdReply = () => {
    try {
      const metadata = typeof message.metadata === 'string' 
        ? JSON.parse(message.metadata) 
        : message.metadata || {};
      
      return metadata.externalAdReply || null;
    } catch (error) {
      console.error('Error parsing externalAdReply metadata:', error);
      return null;
    }
  };

  const renderAdPreview = (adReply: any) => {
    if (!adReply) return null;

    const handleCardClick = () => {
      if (adReply.sourceUrl) {
        window.open(adReply.sourceUrl, '_blank', 'noopener,noreferrer');
      }
    };

    const displayTitle = adReply.title || '';
    const displayBody = adReply.body || '';
    const displayThumbnail = adReply.thumbnail;
    const displaySiteName = adReply.sourceUrl ? (() => {
      try {
        const url = new URL(adReply.sourceUrl);
        return url.hostname.replace('www.', '');
      } catch {
        return adReply.sourceUrl;
      }
    })() : '';

    return (
      <div
        className={`link-preview-card ${isInbound ? 'inbound' : 'outbound'}`}
        onClick={handleCardClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCardClick();
          }
        }}
      >
        {displayThumbnail && (
          <div className="link-preview-image-container">
            <img
              src={displayThumbnail}
              alt={displayTitle}
              className="link-preview-image"
              loading="lazy"
              crossOrigin="anonymous"
            />
          </div>
        )}
        <div className="link-preview-content">
          {adReply.showAdAttribution && (
            <div className="link-preview-site-name" style={{ fontSize: '0.7rem', opacity: 0.7 }}>
              Ad
            </div>
          )}
          {displaySiteName && (
            <div className="link-preview-site-name" title={displaySiteName}>
              {displaySiteName.length > 50 ? `${displaySiteName.substring(0, 50)}...` : displaySiteName}
            </div>
          )}
          {displayTitle && (
            <div className="link-preview-title" title={displayTitle}>
              {displayTitle}
            </div>
          )}
          {displayBody && (
            <div className="link-preview-description" title={displayBody}>
              {displayBody}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderTemplateMessage = () => {
    const displayContent = message.content || '';
    const metadata = typeof message.metadata === 'string' 
      ? JSON.parse(message.metadata) 
      : message.metadata || {};

    const templateName = metadata.templateName || 'Template';
    const templateComponents = metadata.templateComponents || [];
    const headerImage = metadata.headerImage;
    const headerVideo = metadata.headerVideo;
    const headerDocument = metadata.headerDocument;


    const canShowImage = !!headerImage;
    const canShowVideo = !!headerVideo;
    const canShowDocument = !!headerDocument;

    return (
      <div className="template-message">
        {/* Template badge */}
        <div className="flex items-center gap-2 mb-2 pb-2 border-b border-border">
          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          <span className="text-xs font-medium text-muted-foreground">
            {t('message_bubble.template_message', 'Template Message')}
          </span>
        </div>

        {/* Header media */}
        {canShowImage && (
          <div className="mb-3">
            <img 
              src={headerImage} 
              alt="Template header" 
              className="rounded-lg max-w-full h-auto"
              loading="lazy"
            />
          </div>
        )}
        {canShowVideo && (
          <div className="mb-3">
            <video 
              src={headerVideo} 
              controls 
              className="rounded-lg max-w-full h-auto"
            />
          </div>
        )}
        {canShowDocument && (
          <div className="mb-3 p-3 bg-muted rounded-lg flex items-center gap-2">
            <i className="ri-file-text-line text-xl text-muted-foreground"></i>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                {metadata.documentFilename || 'Document'}
              </p>
              <a 
                href={headerDocument} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t('message_bubble.view_document', 'View Document')}
              </a>
            </div>
          </div>
        )}

        {/* Template content */}
        <FormattedText content={displayContent} className="whitespace-pre-wrap break-words" />

        {/* Link Previews for Template Content */}
        {(() => {
          const urlsToPreview = extractUrls(displayContent);
          return urlsToPreview.length > 0 ? (
            <div className="mt-2 space-y-2">
              {urlsToPreview.map(url => (
                <LinkPreview key={url} url={url} isInbound={isInbound} />
              ))}
            </div>
          ) : null;
        })()}

        {/* Buttons (if any) */}
        {metadata.buttons && metadata.buttons.length > 0 && (
          <div className="mt-3 space-y-2">
            {metadata.buttons.map((button: any, index: number) => (
              <div 
                key={index}
                className="p-2 border border-border rounded-lg text-center text-sm text-foreground bg-background"
              >
                {button.text || button.title || `Button ${index + 1}`}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderMessageContent = () => {
    const { type = 'text', content } = message;
    const msgChannelType = message.channelType || channelType;
    const rawMediaUrl = localMediaUrl || message.mediaUrl || getMediaUrlFromMetadata();
    const storedMediaUrl = getCacheBustedMediaUrl(rawMediaUrl);
    const mediaUrl = getMediaPreviewUrl(type, message.id, mediaStreamRevision) || storedMediaUrl;
    const fullMediaUrl = getMediaInlineUrl(type, message.id, mediaStreamRevision) || storedMediaUrl;
    const metadata = typeof message.metadata === 'string' ? (message.metadata ? JSON.parse(message.metadata) : {}) : (message.metadata || {});
    const shareType = metadata?.share_type ?? metadata?.shareType;
    const effectiveType = (msgChannelType === 'tiktok' && (shareType === 'video_share' || type === 'tiktok_video_share')) ? 'tiktok_video_share' : type;
    // Only force inline when the user explicitly asked — not merely because a URL was cached.
    // Otherwise every media bubble eagerly hits the network when the thread opens.
    const forceInlineRender = userRequestedInlineMediaLoad || persistedInlineMediaLoad || Boolean((message as any)?.forceInlineMediaLoaded);

    if (msgChannelType === 'email' && (message.emailHtml || message.emailPlainText || message.emailSubject)) {
      return renderEmailContent();
    }

    const displayContent = textQuoteParts ? textQuoteParts.reply : content || '';
    if (msgChannelType === 'instagram' && INSTAGRAM_SHARED_TYPES.has(type) && displayContent === `[${type.toUpperCase()}]`) return null;

    if (type === 'call') {
      const status = String(message.status || metadata.status || 'unknown');
      const ai = metadata.callType === 'ai-powered';
      return <div className="min-w-[220px] rounded-lg border border-border/70 bg-background/60 p-3">
        <div className="flex items-center gap-2 font-medium">{ai ? <Bot className="h-4 w-4" /> : <Phone className="h-4 w-4" />}{t('calling.timeline.whatsapp_call', 'WhatsApp call')}</div>
        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>{t('calling.timeline.direction', 'Direction')}</span><span>{t(`call_logs.direction.${message.direction}`, message.direction)}</span>
          <span>{t('calling.timeline.status', 'Status')}</span><span>{t(`calling.status.${status}`, status)}</span>
          <span>{t('calling.timeline.handler', 'Handled by')}</span><span>{ai ? t('calling.mode.ai', 'AI agent') : t('calling.mode.direct', 'Human agent')}</span>
        </div>
      </div>;
    }

    if (effectiveType === 'tiktok_video_share') {
      return (
        <OptimizedMediaBubble
          message={{ ...message, type: 'tiktok_video_share', metadata: metadata }}
          mediaUrl={mediaUrl}
          fullMediaUrl={fullMediaUrl}
          channelType={msgChannelType}
          onMediaLoadError={() => recoverMediaForInlineRender(true)}
          onImageAnalysisMediaRecovered={(mediaUrl) => applyRecoveredMediaUrl(mediaUrl, false)}
          forceInlineRender={forceInlineRender}
        />
      );
    }

    if (['image', 'video', 'audio', 'voice', 'document', 'sticker'].includes(type)) {
      return (
        <OptimizedMediaBubble
          message={message}
          mediaUrl={mediaUrl}
          fullMediaUrl={fullMediaUrl}
          channelType={msgChannelType}
          onMediaLoadError={() => recoverMediaForInlineRender(true)}
          onImageAnalysisMediaRecovered={(mediaUrl) => applyRecoveredMediaUrl(mediaUrl, false)}
          forceInlineRender={forceInlineRender}
        />
      );
    }


    if (type === 'poll') {
      const { pollContext } = parsePollData();

      if (pollContext) {
        return <PollMessageWithData
          message={message}
          pollContext={pollContext}
          displayContent={displayContent}
          isInbound={isInbound}
          showPollResults={showPollResults}
          setShowPollResults={setShowPollResults}
        />;
      }


      return (
        <div className="poll-fallback bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-4 h-4 rounded-full bg-green-600"></div>
            <span className="text-sm font-medium text-green-800 dark:text-green-300">Poll</span>
          </div>
          <p className="text-sm text-foreground">{displayContent}</p>
        </div>
      );
    }


    if (type === 'poll_vote' || displayContent.startsWith('poll_vote_selected:')) {
      return <PollVoteWithData
        message={message}
        displayContent={displayContent}
        isInbound={isInbound}
      />;
    }


    if (type === 'template') {
      return renderTemplateMessage();
    }


    switch (type) {
      case 'reaction':


        return null;

      case 'text':
      default:
        const externalAdReply = getExternalAdReply();
        const urlsToPreview = extractUrls(displayContent);
        return (
          <>
            <FormattedText content={displayContent} className="whitespace-pre-wrap break-words" />
            {externalAdReply ? (
              <div className="mt-2">
                {renderAdPreview(externalAdReply)}
              </div>
            ) : urlsToPreview.length > 0 && (
              <div className="mt-2 space-y-2">
                {urlsToPreview.map(url => (
                  <LinkPreview key={url} url={url} isInbound={isInbound} />
                ))}
              </div>
            )}
          </>
        );
    }
  };


  const renderReactions = () => {
    if (channelCapabilities?.supportsReactions === false) return null;
    if (!reactions || reactions.length === 0) {
      return null;
    }


    const reactionGroups = reactions.reduce((acc, reaction) => {
      const emoji = reaction.content || reaction.metadata?.emoji || '👍';
      if (!acc[emoji]) {
        acc[emoji] = [];
      }
      acc[emoji].push(reaction);
      return acc;
    }, {} as Record<string, any[]>);

    return (
      <div className="flex flex-wrap gap-1 mt-2">
        {Object.entries(reactionGroups).map(([emoji, reactionList]) => {
          const reactions = reactionList as any[];
          return (
            <div
              key={emoji}
              className="inline-flex items-center gap-1 bg-muted hover:bg-muted/80 rounded-full px-2 py-1 text-xs cursor-pointer transition-colors"
              title={`${reactions.length} reaction${reactions.length > 1 ? 's' : ''}`}
            >
              <span className="text-sm">{emoji}</span>
              {reactions.length > 1 && (
                <span className="text-muted-foreground font-medium">{reactions.length}</span>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  if (isInbound) {
    const participantInfo = getParticipantInfo();

    return (
      <div className="flex mb-4" data-external-id={message.externalId}>
        <div className="flex-shrink-0 mr-2">
          {isGroupChat() && participantInfo ? (
            <GroupParticipantAvatar
              participantJid={participantInfo.jid}
              participantName={participantInfo.name}
              connectionId={conversation?.channelId}
              conversationId={conversation?.id}
              size="md"
              enableAutoFetch={true}
            />
          ) : (
            contact && (
              <ContactAvatar
                contact={contact}
                size="sm"
                showRefreshButton={false}
              />
            )
          )}
        </div>
        <div className="max-w-[75%] md:max-w-[70%]">
          {isGroupChat() && participantInfo && (
            <div className="mb-1">
              <span className="text-xs font-medium text-muted-foreground">
                {formatParticipantName(participantInfo)}
              </span>
            </div>
          )}
          <div
            className="relative group"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div className="bg-card dark:bg-card p-3 rounded-lg chat-bubble-contact shadow-sm">
              {quotedInfo && (
                <QuotedMessagePreview
                  quotedMessageId={quotedInfo.quotedMessageId}
                  fallbackContent={textQuoteParts?.excerpt}
                  quotedStory={'quotedStory' in quotedInfo ? quotedInfo.quotedStory : undefined}
                  conversationId={conversation?.id}
                  isInbound={true}
                  conversationContactName={contact?.name}
                  onQuotedMessageClick={onQuotedMessageClick}
                />
              )}
              {renderMessageContent()}
              {channelType === 'instagram' && <InstagramMessageContext message={message} />}
              {renderReactions()}
              <div className="flex items-end justify-between mt-1 gap-2">
                <div className="flex-1"></div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0">
                  {channelType === 'tiktok' && (
                    <i className="ri-tiktok-line text-muted-foreground" title={t('conversations.view.channel.tiktok', 'TikTok')} />
                  )}
                  <span className="message-time">{formattedTime}</span>
                  {message.status && message.status !== 'delivered' && (
                    <span className="message-status">
                      {message.status === 'read' && <i className="ri-eye-line"></i>}
                      {message.status === 'failed' && <i className="ri-error-warning-line text-red-500"></i>}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {(canDownloadMedia || isHovered || showDeleteConfirm) && (canReply || canDelete || canDownloadMedia) && (
              <div className="absolute top-13 right-0 flex items-center gap-1 bg-card dark:bg-card rounded-lg shadow-lg border border-border p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 z-10">
                {canDownloadMedia && <MediaDownloadButton compact url={mediaDownloadUrl!} />}
                {canReply && (
                  <button data-tour="components-conversations-messagebubble.button.message_bubble.reply"
                    onClick={handleReplyToMessage}
                    className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                    title={t('message_bubble.reply', 'Reply to this message')}
                    aria-label={t('message_bubble.reply', 'Reply to this message')}
                  >
                    <Reply className="h-4 w-4" />
                  </button>
                )}
                {canDelete && (
                  <button data-tour="components-conversations-messagebubble.button.message_bubble.delete"
                    onClick={handleDeleteConfirm}
                    className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                    title={t('message_bubble.delete', 'Delete this message')}
                    aria-label={t('message_bubble.delete', 'Delete this message')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex mb-4 justify-end" data-external-id={message.externalId}>
      <div className="max-w-[75%] md:max-w-[70%]">
        
        <div
          className="relative group"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="bg-sky-500 dark:bg-[#005c4b] p-3 rounded-lg chat-bubble-user text-white shadow-sm">
            {quotedInfo && (
              <QuotedMessagePreview
                quotedMessageId={quotedInfo.quotedMessageId}
                fallbackContent={textQuoteParts?.excerpt}
                quotedStory={'quotedStory' in quotedInfo ? quotedInfo.quotedStory : undefined}
                conversationId={conversation?.id}
                isInbound={false}
                conversationContactName={contact?.name}
                onQuotedMessageClick={onQuotedMessageClick}
              />
            )}
            {renderMessageContent()}
            {channelType === 'instagram' && <InstagramMessageContext message={message} />}
            {renderReactions()}
            <div className="flex items-end justify-between mt-1 gap-2">
              <div className="flex-1"></div>
              <div className="flex items-center gap-1 text-xs flex-shrink-0">
                {channelType === 'tiktok' && (
                  <i className="ri-tiktok-line opacity-80" title={t('conversations.view.channel.tiktok', 'TikTok')} />
                )}
                <span className="message-time">{formattedTime}</span>
                {message.status && message.status !== 'sent' && (
                  <span className="message-status">
                    {message.status === 'delivered' && <i className="ri-check-double-line"></i>}
                    {message.status === 'read' && <i className="ri-check-double-line font-bold"></i>}
                    {message.status === 'sending' && <i className="ri-time-line"></i>}
                    {message.status === 'failed' && <i className="ri-error-warning-line"></i>}
                  </span>
                )}
              </div>
            </div>
          </div>

          {(canDownloadMedia || isHovered || showDeleteConfirm) && (canReply || canDelete || canDownloadMedia) && (
            <div className="absolute top-13 left-2 flex items-center gap-1 bg-card dark:bg-card rounded-lg shadow-lg border border-border p-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200 z-10">
              {canDownloadMedia && <MediaDownloadButton compact url={mediaDownloadUrl!} />}
              {canReply && (
                <button data-tour="components-conversations-messagebubble.button.message_bubble.reply"
                  onClick={handleReplyToMessage}
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                  title={t('message_bubble.reply', 'Reply to this message')}
                  aria-label={t('message_bubble.reply', 'Reply to this message')}
                >
                  <Reply className="h-4 w-4" />
                </button>
              )}
              {canDelete && (
                <button data-tour="components-conversations-messagebubble.button.message_bubble.delete"
                  onClick={handleDeleteConfirm}
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                  title={t('message_bubble.delete', 'Delete this message')}
                  aria-label={t('message_bubble.delete', 'Delete this message')}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex-shrink-0 ml-2">
        {isFromBot ? (
          <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
            <BotIcon size={16} color="#7c3aed" />
          </div>
        ) : message.senderType === 'user' ? (
          <Avatar className="h-8 w-8 shrink-0">
            {senderProfile?.avatarUrl && (
              <AvatarImage
                src={senderProfile.avatarUrl}
                alt={senderProfile.fullName || t('message_bubble.agent_avatar', 'Agent profile')}
                className="object-cover"
              />
            )}
            <AvatarFallback className="bg-sky-200 font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
              {senderInitials}
            </AvatarFallback>
          </Avatar>
        ) : channelType === 'instagram' ? (
          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center" title={t('message.sent_from_instagram', 'Sent from Instagram')}>
            <i className="ri-instagram-line text-muted-foreground" />
          </div>
        ) : (
          <div className="w-8 h-8 rounded-full bg-sky-100 dark:bg-sky-900/30 flex items-center justify-center">
            <i className="ri-customer-service-2-line text-sky-600 dark:text-sky-400"></i>
          </div>
        )}
      </div>

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-card dark:bg-card rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center mb-4">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div className="ml-4">
                  <h3 className="text-lg font-medium text-foreground">
                    {isWhatsAppMessage()
                      ? (isGroupChat()
                          ? t('message_bubble.confirm_delete_whatsapp_group_title', 'Delete Group Message for Everyone')
                          : t('message_bubble.confirm_delete_whatsapp_title', 'Delete Message for Everyone')
                        )
                      : t('message_bubble.confirm_delete_title', 'Delete Message')
                    }
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {isWhatsAppMessage()
                      ? (isMessageTooOld()
                          ? (isGroupChat()
                              ? t('message_bubble.confirm_delete_whatsapp_group_old', `This group message is too old to be deleted from WhatsApp (72-minute limit). It will only be deleted from ${branding.appName}.`, { appName: branding.appName })
                              : t('message_bubble.confirm_delete_whatsapp_old', `This message is too old to be deleted from WhatsApp (72-minute limit). It will only be deleted from ${branding.appName}.`, { appName: branding.appName })
                            )
                          : (isGroupChat()
                              ? t('message_bubble.confirm_delete_whatsapp_group_message', `This message will be deleted from both ${branding.appName} and all group participants' WhatsApp chats. This action cannot be undone.`, { appName: branding.appName })
                              : t('message_bubble.confirm_delete_whatsapp_message', `This message will be deleted from both ${branding.appName} and the recipient's WhatsApp chat. This action cannot be undone.`, { appName: branding.appName })
                            )
                        )
                      : t('message_bubble.confirm_delete_message', 'Are you sure you want to delete this message? This action cannot be undone.')
                    }
                  </p>
                </div>
              </div>

              <div className="bg-muted p-3 rounded-md mb-4">
                <p className="text-sm text-foreground line-clamp-3">
                  {stripAgentSignature(textQuoteParts ? textQuoteParts.reply || textQuoteParts.excerpt : message.content || '') || t('message_bubble.media_message', 'Media message')}
                </p>
              </div>

              <div className="flex justify-end space-x-3">
                <button data-tour="components-conversations-messagebubble.button.common.cancel"
                  onClick={handleDeleteCancel}
                  className="px-4 py-2 text-sm font-medium text-foreground bg-background border border-input rounded-md hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  disabled={isDeleting}
                >
                  {t('common.cancel', 'Cancel')}
                </button>
                <button data-tour="components-conversations-messagebubble.button.message_bubble.deleting"
                  onClick={handleDeleteMessage}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      {t('message_bubble.deleting', 'Deleting...')}
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t('message_bubble.delete_confirm', 'Delete')}
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
