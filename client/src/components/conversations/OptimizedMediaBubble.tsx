import { useState, useEffect, useRef } from 'react';
import { ImageIcon, Loader2, Mic } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { resolveTrackedMediaUrl, isAppServedMediaPath } from '@/utils/mediaUrl';
import { useConversations } from '@/context/ConversationContext';
import { useMessageCache } from '@/hooks/useMessageCache';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { TranscriptionModal } from './TranscriptionModal';
import { ImageAnalysisModal, type ImageAnalysisResult } from './ImageAnalysisModal';
import { getMediaBubbleAction, getRenderableMediaCaption } from './mediaBubbleActions';
import { FormattedText } from '@/utils/textFormatter';

function TikTokVideoShareCard({ message, mediaUrl, t }: { message: any; mediaUrl?: string; t: (key: string, fallback?: string) => string }) {
  const [imgError, setImgError] = useState(false);
  const meta = typeof message.metadata === 'string' ? ({} as Record<string, unknown>) : (message.metadata || {}) as Record<string, unknown>;
  const coverImageUrl = (meta.cover_image_url || meta.coverImageUrl || mediaUrl) as string | undefined;
  const videoUrl = (meta.video_url || meta.videoUrl) as string | undefined;
  const title = (meta.title) as string | undefined;
  const creatorName = (meta.creator_name || meta.creatorName) as string | undefined;
  const linkUrl = videoUrl || mediaUrl;
  return (
    <div className="message-media tiktok-video-share">
      <div className="rounded-lg border border-border overflow-hidden bg-muted/30 max-w-[280px]">
        {coverImageUrl && !imgError ? (
          <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="block">
            <img
              src={coverImageUrl}
              alt={title || t('message_bubble.tiktok_video', 'TikTok video')}
              className="w-full aspect-video object-cover"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          </a>
        ) : (
          <div className="w-full aspect-video flex items-center justify-center bg-muted">
            <i className="ri-video-line text-4xl text-muted-foreground" />
          </div>
        )}
        <div className="p-2">
          {title && <p className="text-sm font-medium line-clamp-1">{title}</p>}
          {creatorName && <p className="text-xs text-muted-foreground">{creatorName}</p>}
          {linkUrl && (
            <a href={linkUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary mt-1">
              {t('message_bubble.open_in_tiktok', 'Open in TikTok')}
              <i className="ri-external-link-line" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

interface OptimizedMediaBubbleProps {
  message: any;
  mediaUrl?: string;
  fullMediaUrl?: string;
  channelType?: string;
  onMediaLoadError?: () => void;
  onImageAnalysisMediaRecovered?: (mediaUrl: string) => void;
  forceInlineRender?: boolean;
}

const MAX_AUTO_LOAD_SIZE = 50 * 1024 * 1024; // 50MB: larger media stays as a non-inline file card in the bubble
const IMAGE_ANALYSIS_ERROR_TRANSLATION_KEYS: Record<string, string> = {
  IMAGE_ANALYSIS_DISABLED: 'message_bubble.image_analysis_disabled',
  IMAGE_ANALYSIS_INVALID_MESSAGE: 'message_bubble.image_analysis_invalid_message',
  IMAGE_ANALYSIS_MEDIA_UNAVAILABLE: 'message_bubble.image_analysis_media_unavailable',
  IMAGE_ANALYSIS_MISSING_CREDENTIALS: 'message_bubble.image_analysis_missing_credentials',
  IMAGE_ANALYSIS_NOT_FOUND: 'message_bubble.image_analysis_not_found',
  IMAGE_ANALYSIS_PROVIDER_FAILED: 'message_bubble.image_analysis_provider_failed'
};

class ImageAnalysisRequestError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'ImageAnalysisRequestError';
    this.code = code;
  }
}

/** Telegram Bot API file URLs embed the bot token — never load them in the browser; use server `/media/telegram/...` only. */
function isTelegramBotCredentialMediaUrl(url: string | undefined): boolean {
  return typeof url === 'string' && (url.includes('/file/bot') || url.includes('api.telegram.org/file/bot'));
}

type TelegramStickerVariant = 'static' | 'animated' | 'video';

/** Uses inbound Bot API fields when present; falls back to saved file extension for older rows. */
function resolveTelegramStickerVariant(
  channelType: string | undefined,
  meta: Record<string, unknown>,
  mediaUrl: string | undefined
): TelegramStickerVariant {
  if (channelType !== 'telegram') return 'static';
  const v = meta.telegramStickerVariant;
  if (v === 'video' || v === 'animated' || v === 'static') return v;
  const pathOnly = (mediaUrl || '').split('?')[0].toLowerCase();
  if (pathOnly.endsWith('.webm')) return 'video';
  if (pathOnly.endsWith('.tgs')) return 'animated';
  return 'static';
}

function TelegramAnimatedStickerLottie({
  src,
  onLoadError,
}: {
  src?: string;
  onLoadError?: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onLoadErrorRef = useRef(onLoadError);
  onLoadErrorRef.current = onLoadError;

  useEffect(() => {
    if (!src || !containerRef.current) return;
    let anim: { destroy: () => void } | null = null;
    let cancelled = false;
    const el = containerRef.current;
    el.innerHTML = '';

    void (async () => {
      try {
        const lottie = (await import('lottie-web')).default;
        const pako = (await import('pako')).default;
        const res = await fetch(src);
        if (!res.ok) throw new Error('fetch failed');
        const buf = await res.arrayBuffer();
        const jsonStr = pako.inflate(new Uint8Array(buf), { to: 'string' });
        const data = JSON.parse(jsonStr) as object;
        if (cancelled || !containerRef.current) return;
        anim = lottie.loadAnimation({
          container: containerRef.current,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          animationData: data,
        });
      } catch {
        onLoadErrorRef.current?.();
      }
    })();

    return () => {
      cancelled = true;
      try {
        anim?.destroy();
      } catch {
        /* ignore */
      }
      el.innerHTML = '';
    };
  }, [src]);

  return (
    <div
      ref={containerRef}
      className="max-w-[120px] max-h-[120px] [&_svg]:max-w-[120px] [&_svg]:max-h-[120px]"
      aria-label="Animated sticker"
    />
  );
}

export default function OptimizedMediaBubble({ 
  message, 
  mediaUrl: rawMediaUrl, 
  fullMediaUrl: rawFullMediaUrl,
  channelType,
  onMediaLoadError,
  onImageAnalysisMediaRecovered,
  forceInlineRender = false
}: OptimizedMediaBubbleProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const mediaUrl = rawMediaUrl && !isTelegramBotCredentialMediaUrl(rawMediaUrl) ? resolveTrackedMediaUrl(rawMediaUrl) : undefined;
  const fullMediaUrl = rawFullMediaUrl && !isTelegramBotCredentialMediaUrl(rawFullMediaUrl)
    ? resolveTrackedMediaUrl(rawFullMediaUrl)
    : mediaUrl;
  const parsedMetadata = typeof message.metadata === 'string'
    ? (() => { try { return JSON.parse(message.metadata); } catch { return {}; } })()
    : (message.metadata || {});
  const [shouldAutoLoad, setShouldAutoLoad] = useState(false);
  const [mediaSize, setMediaSize] = useState<number | null>(null);
  const [isCheckingSize, setIsCheckingSize] = useState(true);
  const [isNearViewport, setIsNearViewport] = useState(forceInlineRender);
  const [isImageViewerOpen, setIsImageViewerOpen] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionModalOpen, setTranscriptionModalOpen] = useState(false);
  const [localTranscription, setLocalTranscription] = useState<string | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [imageAnalysisModalOpen, setImageAnalysisModalOpen] = useState(false);
  const [localImageAnalysis, setLocalImageAnalysis] = useState<ImageAnalysisResult | null>(null);
  const [summaryByMessageId, setSummaryByMessageId] = useState<Record<number, string>>({});
  const [inlineRenderFailed, setInlineRenderFailed] = useState(false);
  const autoTranscribeAttempted = useRef(false);
  const hasAttemptedOfficialRecovery = useRef(false);
  const viewportRootRef = useRef<HTMLDivElement | null>(null);

  const { transcriptionSettings, imageAnalysisSettings } = useConversations();
  const { updateMessageInCache } = useMessageCache();

  // Only fetch/render media bytes when the bubble is near the visible viewport (or user forced load).
  useEffect(() => {
    if (forceInlineRender) {
      setIsNearViewport(true);
      return;
    }
    const el = viewportRootRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setIsNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { root: null, rootMargin: '120px 0px', threshold: 0.01 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [forceInlineRender, message.id]);

  function shouldRenderInlineGivenSize(
    knownSize: number | null,
    forcedInline: boolean,
    isInstagramCdn: boolean
  ): boolean {
    if (forcedInline) return true;
    if (knownSize !== null && typeof knownSize === 'number') {
      return knownSize <= MAX_AUTO_LOAD_SIZE;
    }
    if (isInstagramCdn) return true;
    return false;
  }

  useEffect(() => {
    setInlineRenderFailed(false);
    hasAttemptedOfficialRecovery.current = false;
  }, [message.id, mediaUrl]);

  useEffect(() => {
    setIsAnalyzingImage(false);
    setImageAnalysisModalOpen(false);
    setLocalImageAnalysis(null);
  }, [message.id]);

  useEffect(() => {
    if (!isNearViewport) {
      setIsCheckingSize(false);
      setShouldAutoLoad(false);
      return;
    }

    if (!mediaUrl) {
      setIsCheckingSize(false);
      return;
    }

    setIsCheckingSize(true);

    const knownSize = typeof parsedMetadata.mediaFileSize === 'number' ? parsedMetadata.mediaFileSize : null;
    const isInstagramCdn = mediaUrl.includes('lookaside.fbsbx.com');
    const skipHeadLikeInstagram = isInstagramCdn || isTelegramBotCredentialMediaUrl(rawMediaUrl);
    const isConversationImageThumbnail =
      message.type === 'image' &&
      mediaUrl.includes('/api/messages/') &&
      mediaUrl.includes('/stream-media') &&
      mediaUrl.includes('thumbnail=1');

    // This is the same bounded thumbnail endpoint used by the media gallery.
    // Render it directly instead of blocking on a HEAD request that proxies may omit.
    if (isConversationImageThumbnail) {
      setShouldAutoLoad(true);
      setIsCheckingSize(false);
      return;
    }

    if (knownSize !== null) {
      setMediaSize(knownSize);
      setShouldAutoLoad(shouldRenderInlineGivenSize(knownSize, forceInlineRender, skipHeadLikeInstagram));
      setIsCheckingSize(false);
      return;
    }

    if (skipHeadLikeInstagram) {
      setShouldAutoLoad(shouldRenderInlineGivenSize(null, forceInlineRender, true));
      setIsCheckingSize(false);
      return;
    }

    checkMediaSize(mediaUrl);
  }, [mediaUrl, forceInlineRender, parsedMetadata.mediaFileSize, isNearViewport]);

  useEffect(() => {
    if ((message.type !== 'audio' && message.type !== 'voice') || message.direction !== 'inbound' || !transcriptionSettings.enabled || !transcriptionSettings.automatic || !message.id) return;
    if (parsedMetadata.transcription || autoTranscribeAttempted.current) return;
    autoTranscribeAttempted.current = true;
    (async () => {
      setIsTranscribing(true);
      try {
        const res = await apiRequest('POST', `/api/messages/${message.id}/transcribe`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Transcription failed');
        }
        const data = await res.json();
        setLocalTranscription(data.transcription);
        await updateMessageInCache(message.id, {
          metadata: { ...parsedMetadata, transcription: data.transcription, transcriptionProvider: data.provider, transcriptionCredentialId: data.credentialId, transcriptionAt: new Date().toISOString() }
        });
      } catch {
        autoTranscribeAttempted.current = false;
      } finally {
        setIsTranscribing(false);
      }
    })();
  }, [message.type, message.direction, message.id, transcriptionSettings.enabled, transcriptionSettings.automatic, parsedMetadata, updateMessageInCache]);

  const canAttemptAutomaticRecovery =
    (channelType === 'whatsapp_official' && Boolean(parsedMetadata?.mediaId)) ||
    (channelType === 'telegram' && Boolean(parsedMetadata?.telegramFileId));
  const canRenderInline = isNearViewport && shouldAutoLoad && !!mediaUrl && !inlineRenderFailed;
  const existingImageAnalysis = (localImageAnalysis ?? parsedMetadata.imageAnalysis ?? null) as ImageAnalysisResult | null;
  const canAnalyzeImage =
    message.type === 'image' &&
    message.direction === 'inbound' &&
    Boolean(message.id) &&
    imageAnalysisSettings.enabled === true;

  const readImageAnalysisResponse = async (response: Response): Promise<ImageAnalysisResult | null> => {
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new ImageAnalysisRequestError(
        err.error || err.message || t('message_bubble.image_analysis_failed', 'Image analysis failed'),
        err.code || err.errorCode
      );
    }
    const data = await response.json();
    return (data.imageAnalysis ?? null) as ImageAnalysisResult | null;
  };

  const getImageAnalysisErrorDescription = (err: unknown): string => {
    const fallback = t('message_bubble.image_analysis_failed', 'Image analysis failed');
    const code = err instanceof ImageAnalysisRequestError ? err.code : undefined;
    const translationKey = code ? IMAGE_ANALYSIS_ERROR_TRANSLATION_KEYS[code] : undefined;
    if (translationKey) return t(translationKey, fallback);

    const message = err instanceof Error ? err.message : '';
    return message && message !== fallback ? message : fallback;
  };

  const persistImageAnalysis = async (imageAnalysis: ImageAnalysisResult) => {
    setLocalImageAnalysis(imageAnalysis);
    await updateMessageInCache(message.id, {
      metadata: {
        ...parsedMetadata,
        imageAnalysis
      }
    });
    if (imageAnalysis.sourceMediaUrl) {
      onImageAnalysisMediaRecovered?.(imageAnalysis.sourceMediaUrl);
    }
  };

  const handleAnalyzeImage = async () => {
    if (!canAnalyzeImage || isAnalyzingImage) return;

    if (existingImageAnalysis) {
      setImageAnalysisModalOpen(true);
      return;
    }

    setIsAnalyzingImage(true);
    try {
      const cachedResponse = await apiRequest('GET', `/api/messages/${message.id}/image-analysis`);
      let imageAnalysis = await readImageAnalysisResponse(cachedResponse);

      if (!imageAnalysis) {
        const analysisResponse = await apiRequest('POST', `/api/messages/${message.id}/image-analysis`);
        imageAnalysis = await readImageAnalysisResponse(analysisResponse);
      }

      if (!imageAnalysis) {
        throw new Error(t('message_bubble.image_analysis_empty', 'No image analysis was returned'));
      }

      await persistImageAnalysis(imageAnalysis);
      setImageAnalysisModalOpen(true);
    } catch (err: any) {
      toast({
        title: t('common.error', 'Error'),
        description: getImageAnalysisErrorDescription(err),
        variant: 'destructive'
      });
    } finally {
      setIsAnalyzingImage(false);
    }
  };

  const renderImageAnalysisAction = () => {
    if (!canAnalyzeImage) return null;
    return (
      <button data-tour="components-conversations-optimizedmediabubble.button.message_bubble.view_image_analysis"
        type="button"
        onClick={handleAnalyzeImage}
        disabled={isAnalyzingImage}
        className="mt-2 flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
      >
        {isAnalyzingImage ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3" />}
        {existingImageAnalysis
          ? t('message_bubble.view_image_analysis', 'View image analysis')
          : t('message_bubble.analyze_image', 'Analyze image')}
      </button>
    );
  };

  const handleInlineMediaError = () => {
    setInlineRenderFailed(true);

    if (canAttemptAutomaticRecovery && onMediaLoadError && !hasAttemptedOfficialRecovery.current) {
      hasAttemptedOfficialRecovery.current = true;
      onMediaLoadError();
    }
  };

  const checkMediaSize = async (url: string) => {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      const contentLength = response.headers.get('content-length');
      const size = contentLength ? parseInt(contentLength, 10) : null;
      const validSize = size !== null && !isNaN(size) ? size : null;
      if (validSize !== null) setMediaSize(validSize);
      setShouldAutoLoad(shouldRenderInlineGivenSize(validSize, forceInlineRender, false));
    } catch (error) {
      console.error('Error checking media size:', error);
      setShouldAutoLoad(shouldRenderInlineGivenSize(null, forceInlineRender, false));
    } finally {
      setIsCheckingSize(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileTypeFromUrl = (url: string): string => {
    const extension = url.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
        return 'Image';
      case 'mp4':
      case 'avi':
      case 'mov':
      case 'wmv':
        return 'Video';
      case 'mp3':
      case 'wav':
      case 'ogg':
      case 'oga':
      case 'aac':
        return 'Audio';
      case 'pdf':
        return 'PDF';
      case 'doc':
      case 'docx':
        return 'Document';
      default:
        return 'File';
    }
  };

  const renderContent = () => {
    const { type = 'text', content } = message;
    const mediaAction = getMediaBubbleAction(type, mediaUrl);
    const omitAnonymousCors =
      isTelegramBotCredentialMediaUrl(rawMediaUrl) ||
      (Boolean(mediaUrl) && isAppServedMediaPath(mediaUrl));
    const mediaCaption = getRenderableMediaCaption(content, channelType, message.direction);
    const renderCaption = () => mediaCaption ? (
      <FormattedText content={mediaCaption} className="mt-2 block whitespace-pre-wrap break-words text-sm" />
    ) : null;

    if (!isNearViewport) {
      return (
        <div className="flex items-center justify-center h-28 w-full bg-muted/50 rounded-md border border-dashed border-border">
          <div className="flex items-center gap-2 text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
            <span className="text-sm">{t('media.scroll_to_load', 'Media loads when visible')}</span>
          </div>
        </div>
      );
    }

    if (isCheckingSize) {
      return (
        <div className="flex items-center justify-center h-32 w-full bg-muted/60 rounded-md border border-border">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">{t('media.checking_size', 'Checking file size...')}</span>
          </div>
        </div>
      );
    }

    switch (type) {
      case 'image':
        if (canRenderInline) {
          return (
            <div className="message-media">
              <div className="relative rounded-md overflow-hidden bg-gray-100 mb-2">
                <img
                  src={mediaUrl}
                  alt={t('message_bubble.image_message', 'Image message')}
                  className="max-w-full rounded-md object-contain"
                  style={{ maxHeight: '240px' }}
                  crossOrigin={omitAnonymousCors ? undefined : 'anonymous'}
                  loading="eager"
                  onClick={() => {
                    setIsImageViewerOpen(true);
                  }}
                  title={t('message_bubble.click_to_open_image', 'Click to open image')}
                  role="button"
                  aria-label={t('message_bubble.click_to_open_image', 'Click to open image')}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setIsImageViewerOpen(true);
                    }
                  }}
                  onError={handleInlineMediaError}
                />
              </div>
              {renderImageAnalysisAction()}
              {renderCaption()}
            </div>
          );
        } else {
          return (
            <div className="message-media">
              <div className="flex flex-col items-center justify-center h-40 w-full bg-muted/70 rounded-md border border-border relative group">
                <i className="ri-image-line text-4xl text-muted-foreground mb-2"></i>
                <div className="text-center mb-3">
                  <p className="text-sm text-foreground font-medium">
                    {getFileTypeFromUrl(mediaUrl || '')}
                  </p>
                  {mediaSize && (
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(mediaSize)}
                    </p>
                  )}
                </div>
              </div>
              {renderImageAnalysisAction()}
              {renderCaption()}
            </div>
          );
        }

      case 'video':
        if (canRenderInline) {
          return (
            <div className="message-media">
              <video
                controls
                className="max-w-full rounded-md"
                style={{ maxHeight: '240px' }}
                crossOrigin={omitAnonymousCors ? undefined : 'anonymous'}
                preload="metadata"
                onError={handleInlineMediaError}
              >
                <source src={mediaUrl} type="video/mp4" />
                <source src={mediaUrl} type="video/webm" />
                <source src={mediaUrl} />
                {t('message_bubble.video_not_supported', 'Your browser does not support the video element.')}
              </video>
              {renderCaption()}
            </div>
          );
        } else {
          return (
            <div className="message-media">
              <div className="flex flex-col items-center justify-center h-40 w-full bg-muted/70 rounded-md border border-border">
                <i className="ri-video-line text-4xl text-muted-foreground mb-2"></i>
                <div className="text-center mb-3">
                  <p className="text-sm text-foreground font-medium">
                    {getFileTypeFromUrl(mediaUrl || '')}
                  </p>
                  {mediaSize && (
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(mediaSize)}
                    </p>
                  )}
                </div>
              </div>
              {renderCaption()}
            </div>
          );
        }

      case 'voice':
      case 'audio':
        if (canRenderInline) {

          const getAudioMimeType = (url: string): string => {
            const extension = url.split('.').pop()?.toLowerCase();
            switch (extension) {
              case 'mp3':
                return 'audio/mpeg';
              case 'ogg':
              case 'oga':
                return 'audio/ogg';
              case 'webm':
                return 'audio/webm';
              case 'aac':
                return 'audio/aac';
              case 'm4a':
                return 'audio/mp4';
              case 'wav':
                return 'audio/wav';
              default:
                return 'audio/mpeg';
            }
          };

          const audioMimeType = getAudioMimeType(mediaUrl);
          const existingTranscription = (localTranscription ?? parsedMetadata.transcription) as string | undefined;
          const transcriptionProvider = parsedMetadata.transcriptionProvider as string | undefined;
          const savedSummary = (summaryByMessageId[message.id] ?? parsedMetadata.transcriptionSummary) as string | undefined;

          const handleTranscribe = async () => {
            if (isTranscribing || !message.id) return;
            setIsTranscribing(true);
            try {
              const res = await apiRequest('POST', `/api/messages/${message.id}/transcribe`);
              if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Transcription failed');
              }
              const data = await res.json();
              setLocalTranscription(data.transcription);
              const updatedMeta = { ...parsedMetadata };
              await updateMessageInCache(message.id, {
                metadata: {
                  ...updatedMeta,
                  transcription: data.transcription,
                  transcriptionProvider: data.provider,
                  transcriptionCredentialId: data.credentialId,
                  transcriptionAt: new Date().toISOString()
                }
              });
              toast({ title: t('message_bubble.transcription_success', 'Transcription complete') });
            } catch (err: any) {
              toast({ title: t('common.error', 'Error'), description: err.message || 'Transcription failed', variant: 'destructive' });
            } finally {
              setIsTranscribing(false);
            }
          };

          return (
            <div className="message-media">
              <audio controls className="max-w-full" crossOrigin={omitAnonymousCors ? undefined : 'anonymous'} preload="metadata" onError={handleInlineMediaError}>
                <source src={mediaUrl} type={audioMimeType} />
                <source src={mediaUrl} type="audio/mpeg" />
                <source src={mediaUrl} type="audio/ogg" />
                <source src={mediaUrl} type="audio/webm" />
                <source src={mediaUrl} />
                {t('message_bubble.audio_not_supported', 'Your browser does not support the audio element.')}
              </audio>
              {transcriptionSettings.enabled && message.direction === 'inbound' && (
                <div className="mt-2 space-y-2">
                  {existingTranscription ? (
                    <>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">{existingTranscription}</p>
                      <button data-tour="components-conversations-optimizedmediabubble.button.message_bubble.view_full_transcription"
                        type="button"
                        onClick={() => setTranscriptionModalOpen(true)}
                        className="text-xs text-primary hover:underline"
                      >
                        {t('message_bubble.view_full_transcription', 'View full transcription')}
                      </button>
                    </>
                  ) : (
                    <button data-tour="components-conversations-optimizedmediabubble.button.message_bubble.transcribe"
                      type="button"
                      onClick={handleTranscribe}
                      disabled={isTranscribing}
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline disabled:opacity-50"
                    >
                      {isTranscribing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Mic className="h-3 w-3" />}
                      {t('message_bubble.transcribe', 'Transcribe')}
                    </button>
                  )}
                </div>
              )}
              <TranscriptionModal
                open={transcriptionModalOpen}
                onOpenChange={setTranscriptionModalOpen}
                transcription={existingTranscription || ''}
                provider={transcriptionProvider}
                messageId={message.id}
                initialSummary={savedSummary ?? null}
                onSummarySaved={async (summaryText) => {
                  setSummaryByMessageId(prev => ({ ...prev, [message.id]: summaryText }));
                  const updatedMeta = { ...parsedMetadata };
                  await updateMessageInCache(message.id, {
                    metadata: { ...updatedMeta, transcriptionSummary: summaryText, transcriptionSummaryAt: new Date().toISOString() }
                  });
                }}
              />
              {renderCaption()}
            </div>
          );
        } else {
          return (
            <div className="message-media">
              <div className="flex items-center rounded-md bg-muted/70 border border-border p-3 w-full">
                <div className="flex items-center">
                  <i className="ri-file-music-line text-xl mr-3 text-muted-foreground"></i>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {getFileTypeFromUrl(mediaUrl || '')}
                    </p>
                    {mediaSize && (
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(mediaSize)}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              {renderCaption()}
            </div>
          );
        }

      case 'document':
        return (
          <div className="message-media">
            <div className="flex items-center justify-between rounded-md bg-muted/70 border border-border p-3 w-full">
              <div className="flex items-center max-w-[70%]">
                <i className="ri-file-text-line text-xl mr-3 text-muted-foreground flex-shrink-0"></i>
                <div className="overflow-hidden">
                  <p className="text-sm font-medium text-foreground truncate">
                    {parsedMetadata?.filename || parsedMetadata?.fileName || t('message_bubble.document', 'Document')}
                  </p>
                  {mediaSize && (
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(mediaSize)}
                    </p>
                  )}
                </div>
              </div>
              {mediaAction ? (
                <a
                  href={mediaAction.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground border border-primary/30 dark:border-primary/40 py-1 px-3 rounded-md text-xs shadow-sm transition-all ml-2 flex-shrink-0"
                >
                  <i className="ri-external-link-line"></i>
                  <span>{t(mediaAction.labelKey, mediaAction.labelFallback)}</span>
                </a>
              ) : null}
            </div>
            {renderCaption()}
          </div>
        );

      case 'tiktok_video_share':
        return (
          <TikTokVideoShareCard
            message={message}
            mediaUrl={mediaUrl}
            t={t}
          />
        );

      case 'sticker': {
        const stickerVariant = resolveTelegramStickerVariant(channelType, parsedMetadata, mediaUrl);
        const isTelegramSticker = channelType === 'telegram';

        if (canRenderInline) {
          if (isTelegramSticker && stickerVariant === 'video' && mediaUrl) {
            return (
              <div className="message-media">
                <video
                  src={mediaUrl}
                  className="max-w-[120px] max-h-[120px] rounded-md object-contain"
                  loop
                  muted
                  playsInline
                  autoPlay
                  crossOrigin={omitAnonymousCors ? undefined : 'anonymous'}
                  preload="metadata"
                  onError={handleInlineMediaError}
                >
                  {t('message_bubble.video_not_supported', 'Your browser does not support the video element.')}
                </video>
                {renderCaption()}
              </div>
            );
          }
          if (isTelegramSticker && stickerVariant === 'animated' && mediaUrl) {
            return (
              <div className="message-media">
                <TelegramAnimatedStickerLottie src={mediaUrl} onLoadError={handleInlineMediaError} />
                {renderCaption()}
              </div>
            );
          }
          return (
            <div className="message-media">
              <img
                src={mediaUrl}
                alt={t('message_bubble.sticker', 'Sticker')}
                className="max-w-[120px] max-h-[120px]"
                crossOrigin={omitAnonymousCors ? undefined : 'anonymous'}
                loading="eager"
                onError={handleInlineMediaError}
              />
              {renderCaption()}
            </div>
          );
        }
        if (isTelegramSticker && (stickerVariant === 'video' || stickerVariant === 'animated')) {
          return (
            <div className="message-media">
              <div className="flex items-center rounded-md bg-muted/70 border border-border p-3 w-full">
                <div className="flex items-center">
                  <i
                    className={
                      stickerVariant === 'video'
                        ? 'ri-video-line text-xl mr-3 text-muted-foreground'
                        : 'ri-movie-2-line text-xl mr-3 text-muted-foreground'
                    }
                  />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {t('message_bubble.sticker', 'Sticker')}
                    </p>
                    {mediaSize && (
                      <p className="text-xs text-muted-foreground">{formatFileSize(mediaSize)}</p>
                    )}
                  </div>
                </div>
              </div>
              {renderCaption()}
            </div>
          );
        }
        return (
          <div className="message-media">
            <div className="flex items-center rounded-md bg-muted/70 border border-border p-3 w-full">
              <div className="flex items-center">
                <i className="ri-sticky-note-line text-xl mr-3 text-muted-foreground"></i>
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {t('message_bubble.sticker', 'Sticker')}
                  </p>
                  {mediaSize && (
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(mediaSize)}
                    </p>
                  )}
                </div>
              </div>
            </div>
            {renderCaption()}
          </div>
        );
      }

      default:
        return <p className="whitespace-pre-wrap">{content}</p>;
    }
  };

  return (
    <div ref={viewportRootRef} className="w-full min-h-[7rem]">
      {renderContent()}
      {isImageViewerOpen && fullMediaUrl && message?.type === 'image' && (
        <div
          className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4 cursor-zoom-out"
          onClick={() => {
            setIsImageViewerOpen(false);
          }}
          role="button"
          aria-label={t('message_bubble.close_image_viewer', 'Close image viewer')}
        >
          <img
            src={fullMediaUrl}
            alt={t('message_bubble.image_message', 'Image message')}
            className="max-w-full max-h-full object-contain rounded-md shadow-2xl"
            crossOrigin={isTelegramBotCredentialMediaUrl(rawMediaUrl) ? undefined : 'anonymous'}
            loading="eager"
          />
        </div>
      )}
      <ImageAnalysisModal
        open={imageAnalysisModalOpen}
        onOpenChange={setImageAnalysisModalOpen}
        imageAnalysis={existingImageAnalysis}
      />
    </div>
  );
}
