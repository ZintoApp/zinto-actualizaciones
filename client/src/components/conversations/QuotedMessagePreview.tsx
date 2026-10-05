import { useState, useEffect } from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { stripAgentSignature } from '@/utils/messageUtils';
import { stripFormatting } from '@/utils/textFormatter';
import { getMessageCache } from '@/services/message-cache';
import { resolveMediaUrl } from '@/utils/mediaUrl';
import { instagramTextQuoteParts } from '@shared/instagram-message-utils';

interface QuotedMessagePreviewProps {
  quotedMessageId: string;
  fallbackContent?: string;
  quotedStory?: { id?: string; url?: string };
  conversationId?: number;
  isInbound: boolean;
  /** 1:1 thread contact display name; used when the quoted inbound sender is the customer */
  conversationContactName?: string | null;
  onQuotedMessageClick?: (quotedMessageId: string) => void;
}

interface QuotedMessage {
  id: number;
  content: string;
  type: string;
  senderType: 'user' | 'contact';
  senderId: number;
  direction: 'inbound' | 'outbound';
  mediaUrl?: string;
  metadata?: any;
  groupParticipantName?: string | null;
  isFromBot?: boolean;
}

const QuotedMessagePreview = ({
  quotedMessageId,
  fallbackContent,
  quotedStory,
  conversationId,
  isInbound,
  conversationContactName,
  onQuotedMessageClick
}: QuotedMessagePreviewProps) => {
  const messageCacheService = useState(getMessageCache)[0];
  const [quotedMessage, setQuotedMessage] = useState<QuotedMessage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    const loadQuotedMessage = async () => {
      setQuotedMessage(null);
      if (quotedStory) {
        setQuotedMessage({ id: 0, content: '', type: 'story', direction: 'outbound', senderType: 'user', senderId: 0 });
        setError(null); setIsLoading(false); return;
      }
      if (!quotedMessageId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        setError(null);

        await messageCacheService.init();
        const cached = await messageCacheService.getMessageByExternalId(quotedMessageId, conversationId);
        if (cancelled) return;
        if (cached) {
          setQuotedMessage(cached as QuotedMessage);
          setIsLoading(false);
          return;
        }

        const conversationQuery = conversationId ? `?conversationId=${conversationId}` : '';
        const response = await fetch(`/api/messages/${encodeURIComponent(quotedMessageId)}${conversationQuery}`, {
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error('Failed to fetch quoted message');
        }

        const message = await response.json();
        if (cancelled) return;
        setQuotedMessage(message);
        await messageCacheService.addMessage(message);
      } catch (err: any) {
        if (cancelled) return;
        console.error('Error fetching quoted message:', err);
        setError(err.message);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    loadQuotedMessage();
    return () => { cancelled = true; };
  }, [quotedMessageId, conversationId, quotedStory?.id, quotedStory?.url]);

  const getQuotedMessageSender = () => {
    if (!quotedMessage) return t('quoted_message.unknown_sender', 'Unknown');

    if (quotedMessage.direction === 'outbound') {
      if (quotedMessage.isFromBot) return t('quoted_message.assistant', 'Assistant');
      if (quotedMessage.senderType === 'user') {
        return t('quoted_message.you', 'You');
      } else {
        return t('quoted_message.sender', 'Sender');
      }
    } else if (quotedMessage.direction === 'inbound') {
      const fromGroup =
        typeof quotedMessage.groupParticipantName === 'string'
          ? quotedMessage.groupParticipantName.trim()
          : '';
      const fromConversation =
        typeof conversationContactName === 'string' ? conversationContactName.trim() : '';
      const displayName = fromGroup || fromConversation;
      return displayName || t('quoted_message.contact', 'Contact');
    } else {
      return t('quoted_message.unknown_sender', 'Unknown');
    }
  };

  const getQuotedMessageContent = () => {
    if (!quotedMessage) return '';

    const { type, content } = quotedMessage;

    switch (type) {
      case 'image':
        return t('quoted_message.image', '📷 Image');
      case 'video':
        return t('quoted_message.video', '🎥 Video');
      case 'audio':
        return t('quoted_message.audio', '🎵 Audio');
      case 'document':
      case 'file':
        return t('quoted_message.document', '📄 Document');
      case 'story':
        return t('quoted_message.instagram_story', 'Instagram story');
      case 'sticker':
        return t('quoted_message.sticker', 'Sticker');
      case 'text':
      default:
        if (content && typeof content === 'string' && content.trim().length > 0) {
          const priorQuote = instagramTextQuoteParts(content, quotedMessage.metadata);
          const cleanContent = stripAgentSignature(priorQuote ? priorQuote.reply || priorQuote.excerpt : content);
          const displayContent = stripFormatting(cleanContent);
          if (displayContent.length > 160) {
            return displayContent.substring(0, 160) + '...';
          }
          return displayContent;
        }
        return t('quoted_message.message', 'Message');
    }
  };

  const handleClick = () => {
    if (onQuotedMessageClick) {
      onQuotedMessageClick(quotedMessageId);
    }
  };

  const renderMediaThumbnail = () => {
    if (!quotedMessage?.mediaUrl) return null;
    const mediaUrl = resolveMediaUrl(quotedMessage.mediaUrl);

    if (quotedMessage.type === 'image') {
      return <img className="quoted-media-thumbnail" src={mediaUrl} alt="" loading="lazy" />;
    }
    if (quotedMessage.type === 'video') {
      return <video className="quoted-media-thumbnail" src={mediaUrl} muted preload="metadata" />;
    }
    return null;
  };

  if (isLoading) {
    return (
      <div className={`quoted-message-preview ${isInbound ? 'inbound' : 'outbound'} loading`}>
        <div className="quoted-border"></div>
        <div className="quoted-content">
          <div className="quoted-sender">
            <div className="loading-shimmer h-3 w-16 rounded"></div>
          </div>
          <div className="quoted-text">
            <div className="loading-shimmer h-4 w-32 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if ((error || !quotedMessage) && !fallbackContent) {
    return (
      <div className={`quoted-message-preview ${isInbound ? 'inbound' : 'outbound'} error`}>
        <div className="quoted-border"></div>
        <div className="quoted-content">
          <div className="quoted-sender text-gray-500">
            {t('quoted_message.deleted_sender', 'Unknown')}
          </div>
          <div className="quoted-text text-gray-500 italic">
            {t('quoted_message.unavailable_message', 'Original message unavailable')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className={`quoted-message-preview ${isInbound ? 'inbound' : 'outbound'} ${onQuotedMessageClick ? 'clickable' : ''}`}
      onClick={handleClick}
      role={onQuotedMessageClick ? 'button' : undefined}
      tabIndex={onQuotedMessageClick ? 0 : undefined}
      onKeyDown={event => {
        if (onQuotedMessageClick && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault(); handleClick();
        }
      }}
    >
      <div className="quoted-border"></div>
      <div className="quoted-content">
        <div className="quoted-sender">
          {quotedMessage ? getQuotedMessageSender() : t('quoted_message.original_message', 'Original message')}
        </div>
        <div className="quoted-text">
          {quotedMessage ? getQuotedMessageContent() : fallbackContent}
        </div>
      </div>
      {renderMediaThumbnail()}
    </div>
  );
};

export default QuotedMessagePreview;
