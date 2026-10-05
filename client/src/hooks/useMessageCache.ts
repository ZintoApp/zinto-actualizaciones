/**
 * Message Cache Hook
 * 
 * This hook provides cache-aware message loading functionality that integrates
 * with the existing ConversationContext without breaking existing functionality.
 * 
 * Features:
 * - Cache-first message loading
 * - Intelligent API fallback
 * - Real-time cache synchronization
 * - Backward compatibility
 */

import { useEffect, useCallback, useRef } from 'react';
import { getMessageCache, CachedMessage } from '@/services/message-cache';
import { apiRequest } from '@/lib/queryClient';

export interface CacheAwareMessageResult {
  messages: any[];
  hasMore: boolean;
  total: number;
  fromCache: boolean;
  cacheHitRate?: number;
  staleMediaCount?: number;
}

export interface UseMessageCacheOptions {
  enabled?: boolean;
  cacheFirst?: boolean;
  maxCacheAge?: number;
  prefetchNext?: boolean;
}

export function useMessageCache(options: UseMessageCacheOptions = {}) {
  const messageCacheService = useRef(getMessageCache()).current;
  const {
    enabled = true,
    cacheFirst = true,
    maxCacheAge = 3 * 24 * 60 * 60 * 1000, // 3 days – use cache for conversation + media so second open doesn't refetch from API
    prefetchNext = true
  } = options;

  const initPromise = useRef<Promise<void> | null>(null);
  const isInitialized = useRef(false);


  const initializeCache = useCallback(async () => {
    if (isInitialized.current) return;
    if (initPromise.current) return initPromise.current;

    initPromise.current = messageCacheService.init();
    await initPromise.current;
    isInitialized.current = true;
  }, []);

  useEffect(() => {
    if (enabled) {
      initializeCache().catch(console.error);
    }
  }, [enabled, initializeCache]);

  /**
   * Load messages with cache-first strategy
   */
  const loadMessages = useCallback(async (
    conversationId: number,
    page: number = 1,
    limit: number = 10,
    isGroup: boolean = false,
    forceRefresh: boolean = false
  ): Promise<CacheAwareMessageResult> => {
    if (!enabled) {

      return await loadMessagesFromAPI(conversationId, page, limit, isGroup);
    }

    await initializeCache();

    try {

      if (cacheFirst && !forceRefresh) {
        const cacheResult = await loadMessagesFromCache(conversationId, page, limit);


        if (cacheResult.messages.length > 0) {
          const oldestMessage = cacheResult.messages[cacheResult.messages.length - 1];
          const cacheAge = Date.now() - oldestMessage.cachedAt;

          if (cacheAge < maxCacheAge) {

            if (prefetchNext && cacheResult.hasMore) {
              prefetchNextPage(conversationId, page + 1, limit, isGroup).catch(console.error);
            }

            if (cacheResult.staleMediaCount && cacheResult.staleMediaCount > 0) {
              refreshStaleMediaUrls(cacheResult.messages).catch(console.error);
            }

            const mediaCount = cacheResult.messages.filter((m: any) => m.type && ['image','video','audio','document','sticker'].includes(m.type)).length;
            if (typeof console !== 'undefined' && console.debug) {
              console.debug('[BotHive Cache] Messages from cache', { conversationId, page, count: cacheResult.messages.length, mediaCount });
            }

            return {
              ...cacheResult,
              fromCache: true,
              cacheHitRate: 1.0
            };
          }
        }
      }

      if (forceRefresh) {
        // Do not wipe IndexedDB on refresh — that drops just-sent text rows before the API
        // responds. Skip cache-first read and upsert API results instead.
      }

      const apiResult = await loadMessagesFromAPI(conversationId, page, limit, isGroup);


      if (apiResult.messages.length > 0) {
        await messageCacheService.cacheMessages(conversationId, apiResult.messages);


        await messageCacheService.cachePagination(conversationId, {
          page,
          limit,
          total: apiResult.total,
          hasMore: apiResult.hasMore
        });
      }

      return {
        ...apiResult,
        fromCache: false,
        cacheHitRate: 0.0
      };

    } catch (error) {
      console.error('Error in cache-aware message loading:', error);


      return await loadMessagesFromAPI(conversationId, page, limit, isGroup);
    }
  }, [enabled, cacheFirst, maxCacheAge, prefetchNext, initializeCache]);

  /**
   * Load messages from cache
   */
  const loadMessagesFromCache = useCallback(async (
    conversationId: number,
    page: number,
    limit: number
  ): Promise<CacheAwareMessageResult> => {
    const result = await messageCacheService.getCachedMessages(conversationId, page, limit);
    
    return {
      messages: result.messages,
      hasMore: result.hasMore,
      total: result.total,
      fromCache: true,
      staleMediaCount: result.staleMediaCount
    };
  }, []);

  const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'];

  /**
   * Merge cached mediaUrl into messages that came from API without it (so media doesn't re-load every time).
   * For media with captions, some channels store mediaUrl in metadata – we normalize to top-level so the bubble can use it.
   */
  const mergeCachedMediaIntoMessages = useCallback(async (messages: any[]): Promise<any[]> => {
    if (messages.length === 0) return messages;
    const merged = [...messages];
    for (let i = 0; i < merged.length; i++) {
      const msg = merged[i];
      if (!msg.type || !MEDIA_TYPES.includes(msg.type)) continue;
      const meta = typeof msg.metadata === 'string' ? (msg.metadata ? (() => { try { return JSON.parse(msg.metadata); } catch { return {}; } })() : {}) : (msg.metadata || {});
      const urlFromMeta = meta.mediaUrl || null;
      const hasUrl = msg.mediaUrl || urlFromMeta;
      if (!hasUrl) {
        try {
          const cached = await messageCacheService.getMessageById(msg.id);
          const cachedUrl = cached?.mediaUrl || (cached?.metadata && (typeof cached.metadata === 'object' && (cached.metadata as any).mediaUrl));
          if (cachedUrl && cached?.mediaUrlFetchedAt) {
            merged[i] = { ...msg, mediaUrl: cachedUrl, mediaUrlFetchedAt: cached.mediaUrlFetchedAt, forceInlineMediaLoaded: (cached as any).forceInlineMediaLoaded };
          }
        } catch {
          // ignore
        }
        continue;
      }
      // Normalize: ensure top-level mediaUrl so caption+media bubbles don't re-fetch (e.g. when URL was only in metadata).
      if (!msg.mediaUrl && urlFromMeta) {
        merged[i] = { ...msg, mediaUrl: urlFromMeta, mediaUrlFetchedAt: msg.mediaUrlFetchedAt || Date.now() };
      }
    }
    return merged;
  }, []);

  /**
   * Load messages from API
   */
  const loadMessagesFromAPI = useCallback(async (
    conversationId: number,
    page: number,
    limit: number,
    isGroup: boolean
  ): Promise<CacheAwareMessageResult> => {
    const endpoint = isGroup
      ? `/api/group-conversations/${conversationId}/messages?page=${page}&limit=${limit}`
      : `/api/conversations/${conversationId}/messages?page=${page}&limit=${limit}`;

    const res = await apiRequest('GET', endpoint);
    
    if (!res.ok) {
      throw new Error(`Failed to fetch messages: ${res.status}`);
    }

    const data = await res.json();
    const messages = await mergeCachedMediaIntoMessages(data.messages || []);
    
    return {
      messages,
      hasMore: data.pagination.hasMore,
      total: data.pagination.total,
      fromCache: false
    };
  }, [mergeCachedMediaIntoMessages]);

  /**
   * Prefetch next page of messages
   */
  const prefetchNextPage = useCallback(async (
    conversationId: number,
    page: number,
    limit: number,
    isGroup: boolean
  ): Promise<void> => {
    try {

      const hasCached = await messageCacheService.hasCachedMessages(conversationId, page, limit);
      if (hasCached) return;


      const result = await loadMessagesFromAPI(conversationId, page, limit, isGroup);
      if (result.messages.length > 0) {
        await messageCacheService.cacheMessages(conversationId, result.messages);

      }
    } catch (error) {
      console.error('Error prefetching messages:', error);
    }
  }, [loadMessagesFromAPI]);

  /**
   * Add a new message to cache (for real-time updates)
   */
  const addMessageToCache = useCallback(async (message: any): Promise<void> => {
    if (!enabled) return;

    try {
      await initializeCache();
      await messageCacheService.addMessage(message);
    } catch (error) {
      console.error('Error adding message to cache:', error);
    }
  }, [enabled, initializeCache]);

  /**
   * Update a message in cache
   */
  const updateMessageInCache = useCallback(async (
    messageId: number,
    updates: Partial<CachedMessage>
  ): Promise<void> => {
    if (!enabled) return;

    try {
      await initializeCache();
      await messageCacheService.updateMessage(messageId, updates);
    } catch (error) {
      console.error('Error updating message in cache:', error);
    }
  }, [enabled, initializeCache]);

  /**
   * Remove a message from cache
   */
  const removeMessageFromCache = useCallback(async (messageId: number): Promise<void> => {
    if (!enabled) return;

    try {
      await initializeCache();
      await messageCacheService.removeMessage(messageId);
    } catch (error) {
      console.error('Error removing message from cache:', error);
    }
  }, [enabled, initializeCache]);

  /**
   * Invalidate cache for a conversation
   */
  const invalidateConversationCache = useCallback(async (conversationId: number): Promise<void> => {
    if (!enabled) return;

    try {
      await initializeCache();
      await messageCacheService.invalidateConversation(conversationId);
    } catch (error) {
      console.error('Error invalidating conversation cache:', error);
    }
  }, [enabled, initializeCache]);

  /**
   * Get cache statistics
   */
  const getCacheStats = useCallback(async () => {
    if (!enabled) return null;
    
    try {
      await initializeCache();
      return await messageCacheService.getCacheStats();
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return null;
    }
  }, [enabled, initializeCache]);

  /**
   * Cleanup cache
   */
  const cleanupCache = useCallback(async (): Promise<void> => {
    if (!enabled) return;

    try {
      await initializeCache();
      const needsCleanup = await messageCacheService.needsCleanup();
      if (needsCleanup) {
        await messageCacheService.cleanup();
      }
    } catch (error) {
      console.error('Error cleaning up cache:', error);
    }
  }, [enabled, initializeCache]);

  /**
   * Refresh stale media URLs in background
   */
  const refreshStaleMediaUrls = useCallback(async (messages: any[]): Promise<void> => {
    const staleMessages = messages.filter(msg => messageCacheService.isMediaUrlStale(msg as CachedMessage));

    if (staleMessages.length === 0) return;

    const refreshPromises = staleMessages.map(async (msg) => {
      try {
        const response = await apiRequest('POST', `/api/messages/${msg.id}/download-media`);
        if (response.ok) {
          const data = await response.json();
          if (data.mediaUrl) {
            await messageCacheService.refreshMediaUrl(msg.id, data.mediaUrl);
          }
        }
      } catch (error) {
        console.warn(`Failed to refresh media URL for message ${msg.id}:`, error);
      }
    });

    await Promise.allSettled(refreshPromises);
  }, []);

  /**
   * Refresh media URL for a specific message
   */
  const refreshMediaUrl = useCallback(async (messageId: number): Promise<string | null> => {
    if (!enabled) return null;

    try {
      const response = await apiRequest('POST', `/api/messages/${messageId}/download-media`);
      if (response.ok) {
        const data = await response.json();
        if (data.mediaUrl) {
          await initializeCache();
          await messageCacheService.refreshMediaUrl(messageId, data.mediaUrl);
          return data.mediaUrl;
        }
      }
      return null;
    } catch (error) {
      console.error('Error refreshing media URL:', error);
      return null;
    }
  }, [enabled, initializeCache]);

  return {
    loadMessages,
    addMessageToCache,
    updateMessageInCache,
    removeMessageFromCache,
    invalidateConversationCache,
    getCacheStats,
    cleanupCache,
    refreshMediaUrl,
    isEnabled: enabled
  };
}
