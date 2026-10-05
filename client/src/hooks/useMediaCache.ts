import { useCallback, useEffect, useRef } from 'react';
import { getMessageCache, CachedMediaMetadata } from '@/services/message-cache';
import { resolveMediaUrl } from '@/utils/mediaUrl';

export interface MediaCacheOptions {
  enabled?: boolean;
  maxCacheAge?: number;
  preloadImages?: boolean;
  preloadThumbnails?: boolean;
}

export interface CachedMediaInfo {
  url: string;
  type: 'image' | 'video' | 'audio' | 'voice' | 'document';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  thumbnailUrl?: string;
  duration?: number;
  dimensions?: { width: number; height: number };
  isCached: boolean;
  cacheAge?: number;
}

export function useMediaCache(options: MediaCacheOptions = {}) {
  const messageCacheService = useRef(getMessageCache()).current;
  const {
    enabled = true,
    maxCacheAge = 3 * 24 * 60 * 60 * 1000, // 3 days
    preloadImages = true,
    preloadThumbnails = true
  } = options;

  const initPromise = useRef<Promise<void> | null>(null);
  const isInitialized = useRef(false);
  const preloadedUrls = useRef<Set<string>>(new Set());

  const initializeCache = useCallback(async () => {
    if (isInitialized.current) return;
    if (initPromise.current) return initPromise.current;

    initPromise.current = messageCacheService.init();
    await initPromise.current;
    isInitialized.current = true;
  }, []);

  useEffect(() => {
    if (enabled) {
      initializeCache().catch(() => {});
    }
  }, [enabled, initializeCache]);

  /**
   * Cache media metadata
   */
  const cacheMediaMetadata = useCallback(async (
    url: string,
    metadata: Omit<CachedMediaMetadata, 'url' | 'cachedAt' | 'lastAccessed'>
  ): Promise<void> => {
    if (!enabled) return;

    try {
      await initializeCache();
      await messageCacheService.cacheMediaMetadata(url, metadata);

    } catch (error) {
    }
  }, [enabled, initializeCache]);

  /**
   * Get cached media metadata
   */
  const getCachedMediaMetadata = useCallback(async (url: string): Promise<CachedMediaInfo | null> => {
    if (!enabled) return null;

    try {
      await initializeCache();
      const cached = await messageCacheService.getCachedMediaMetadata(url);
      
      if (cached) {
        const cacheAge = Date.now() - cached.cachedAt;
        
        if (cacheAge < maxCacheAge) {
          return {
            url: cached.url,
            type: cached.type,
            fileName: cached.fileName,
            fileSize: cached.fileSize,
            mimeType: cached.mimeType,
            thumbnailUrl: cached.thumbnailUrl,
            duration: cached.duration,
            dimensions: cached.dimensions,
            isCached: true,
            cacheAge
          };
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }, [enabled, maxCacheAge, initializeCache]);

  /**
   * Preload media for better user experience
   */
  const preloadMedia = useCallback(async (url: string, type: 'image' | 'video' | 'audio' | 'voice' | 'document'): Promise<void> => {
    if (!enabled) return;

    const resolvedUrl = resolveMediaUrl(url);
    if (!resolvedUrl) return;

    const baseUrl = resolvedUrl.split('?')[0];
    if (preloadedUrls.current.has(baseUrl)) return;

    try {
      preloadedUrls.current.add(baseUrl);

      if (type === 'image' && preloadImages) {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise<void>((resolve, reject) => {
          img.onload = () => {

            cacheMediaMetadata(baseUrl, {
              type: 'image',
              mimeType: 'image/*',
              dimensions: { width: img.naturalWidth, height: img.naturalHeight }
            }).catch(() => {});

            resolve();
          };
          img.onerror = reject;


          img.src = resolvedUrl;
        });


      }
    } catch (error) {
    }
  }, [enabled, preloadImages, cacheMediaMetadata]);

  /**
   * Preload multiple media items
   */
  const preloadMediaBatch = useCallback(async (
    mediaItems: Array<{ url: string; type: 'image' | 'video' | 'audio' | 'voice' | 'document' }>
  ): Promise<void> => {
    if (!enabled) return;

    const preloadPromises = mediaItems.map(item => preloadMedia(item.url, item.type));
    
    try {
      await Promise.allSettled(preloadPromises);

    } catch (error) {
    }
  }, [enabled, preloadMedia]);

  /**
   * Extract media URLs from messages and preload them
   */
  const preloadMessagesMedia = useCallback(async (messages: any[]): Promise<void> => {
    if (!enabled) return;

    const mediaItems: Array<{ url: string; type: 'image' | 'video' | 'audio' | 'voice' | 'document' }> = [];

    messages.forEach(message => {
      if (message.mediaUrl && message.type && message.type !== 'text') {
        const mediaUrlAge = message.mediaUrlFetchedAt ? Date.now() - message.mediaUrlFetchedAt : Infinity;
        const isStale = mediaUrlAge > (3 * 24 * 60 * 60 * 1000); // 3 days
        
        if (!isStale) {
          const mediaType = message.type as 'image' | 'video' | 'audio' | 'voice' | 'document';
          mediaItems.push({ url: message.mediaUrl, type: mediaType });
        }
      }
    });

    if (mediaItems.length > 0) {
      await preloadMediaBatch(mediaItems);
    }
  }, [enabled, preloadMediaBatch]);

  /**
   * Check if media is cached and valid
   */
  const isMediaCached = useCallback(async (url: string): Promise<boolean> => {
    const cached = await getCachedMediaMetadata(url);
    return cached !== null;
  }, [getCachedMediaMetadata]);

  /**
   * Get optimized media URL (returns cached version if available)
   */
  const getOptimizedMediaUrl = useCallback(async (url: string): Promise<string> => {
    if (!enabled) return url;

    try {
      return url;
    } catch (error) {
      return url;
    }
  }, [enabled]);

  /**
   * Clear media cache for specific URLs
   */
  const clearMediaCache = useCallback(async (_urls: string[]): Promise<void> => {
    if (!enabled) return;

    try {
      await initializeCache();

    } catch (error) {
    }
  }, [enabled, initializeCache]);

  /**
   * Get media cache statistics
   */
  const getMediaCacheStats = useCallback(async () => {
    if (!enabled) return null;

    try {
      await initializeCache();
      const stats = await messageCacheService.getCacheStats();
      return {
        mediaCount: stats.mediaCount,
        totalSize: stats.totalSize
      };
    } catch (error) {
      return null;
    }
  }, [enabled, initializeCache]);

  /**
   * Warm up media cache for a conversation
   */
  const warmupConversationMedia = useCallback(async (messages: any[]): Promise<void> => {
    if (!enabled) return;

    await preloadMessagesMedia(messages);
  }, [enabled, preloadMessagesMedia]);

  /**
   * Validate if a media URL is still accessible
   */
  const validateMediaUrl = useCallback(async (url: string): Promise<boolean> => {
    if (!enabled) return true;

    try {
      const resolvedUrl = resolveMediaUrl(url);
      if (!resolvedUrl) return false;
      const response = await fetch(resolvedUrl, {
        method: 'HEAD',
        cache: 'no-cache'
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }, [enabled]);

  /**
   * Get the age of a media URL from cache
   */
  const getMediaUrlAge = useCallback(async (messageId: number): Promise<number | null> => {
    if (!enabled) return null;

    try {
      await initializeCache();
      const transaction = messageCacheService['getTransaction'](['messages'], 'readonly');
      const store = transaction.objectStore('messages');
      const message = await messageCacheService['executeRequest'](store.get(messageId));
      
      if (message && message.mediaUrlFetchedAt) {
        return Date.now() - message.mediaUrlFetchedAt;
      }
      return null;
    } catch (error) {
      return null;
    }
  }, [enabled, initializeCache]);

  return {
    cacheMediaMetadata,
    getCachedMediaMetadata,
    preloadMedia,
    preloadMediaBatch,
    preloadMessagesMedia,
    isMediaCached,
    getOptimizedMediaUrl,
    clearMediaCache,
    getMediaCacheStats,
    warmupConversationMedia,
    validateMediaUrl,
    getMediaUrlAge,
    isEnabled: enabled
  };
}
