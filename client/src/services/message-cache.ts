/**
 * IndexedDB-based Message Cache Service
 * 
 * This service provides efficient caching for messages, conversations, and media metadata
 * to reduce API calls and improve performance in the inbox system.
 * 
 * Features:
 * - IndexedDB storage for large datasets
 * - Cache versioning for schema changes
 * - Intelligent cache management with size limits
 * - Media metadata caching
 * - Cache invalidation strategies
 * - Offline support
 */

import { instagramMessageMetadata, reconcileInstagramMessages } from '@shared/instagram-message-utils';

export interface CachedMessage {
  id: number;
  conversationId: number;
  externalId?: string | null;
  direction: 'inbound' | 'outbound';
  type: string;
  content: string;
  metadata?: any;
  senderId?: number | null;
  senderType?: string | null;
  status: string;
  sentAt?: string | null;
  readAt?: string | null;
  isFromBot: boolean;
  mediaUrl?: string | null;
  groupParticipantJid?: string | null;
  groupParticipantName?: string | null;
  createdAt: string;

  cachedAt: number;
  lastAccessed: number;
  mediaUrlFetchedAt?: number;
  mediaUrlExpiry?: number;
  forceInlineMediaLoaded?: boolean;
}

export interface CachedConversation {
  id: number;
  companyId: number;
  contactId: number;
  channelType: string;
  channelId: number;
  status: string;
  assignedToUserId?: number | null;
  lastMessageAt: string;
  unreadCount: number;
  botDisabled: boolean;
  isGroup: boolean;
  groupJid?: string | null;
  groupName?: string | null;
  groupDescription?: string | null;
  groupParticipantCount: number;
  createdAt: string;
  updatedAt: string;

  cachedAt: number;
  lastAccessed: number;
}

export interface CachedMediaMetadata {
  url: string;
  type: 'image' | 'video' | 'audio' | 'voice' | 'document';
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  thumbnailUrl?: string;
  duration?: number; // for audio/video
  dimensions?: { width: number; height: number }; // for images/videos
  cachedAt: number;
  lastAccessed: number;
  expiresAt?: number;
}

export interface MessagePagination {
  conversationId: number;
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  lastFetched: number;
}

export interface CacheStats {
  messagesCount: number;
  conversationsCount: number;
  mediaCount: number;
  totalSize: number;
  oldestEntry: number;
  newestEntry: number;
}

function isTelegramBotCredentialMediaUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  return url.includes('/file/bot') || url.includes('api.telegram.org/file/bot');
}

export function isLocalServedMediaUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }

  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return false;
  }

  if (trimmedUrl.startsWith('/uploads/') || trimmedUrl.startsWith('/media/')) {
    return true;
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    return parsedUrl.pathname.startsWith('/uploads/') || parsedUrl.pathname.startsWith('/media/');
  } catch {
    return false;
  }
}

export interface CacheConfig {
  maxMessages: number;
  maxConversations: number;
  maxMediaItems: number;
  maxCacheAge: number; // in milliseconds
  cleanupThreshold: number; // percentage (0-1)
  version: number;
}

const DEFAULT_CONFIG: CacheConfig = {
  maxMessages: 10000,
  maxConversations: 1000,
  maxMediaItems: 2000,
  maxCacheAge: 3 * 24 * 60 * 60 * 1000, // 3 days
  cleanupThreshold: 0.8, // cleanup when 80% full
  version: 1
};

const MEDIA_URL_MAX_AGE = 3 * 24 * 60 * 60 * 1000; // 3 days
const LINK_PREVIEW_CACHE_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

export interface CachedLinkPreview {
  url: string;
  data: { success: boolean; url: string; preview: { title?: string; description?: string; images?: string[]; siteName?: string; mediaType?: string; contentType?: string; favicons?: string[] } };
  cachedAt: number;
}

class MessageCacheService {
  private db: IDBDatabase | null = null;
  private retired = false;
  private config: CacheConfig;
  private isInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor(config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the IndexedDB database
   */
  retire() {
    this.retired = true;
    this.db?.close();
  }

  async init(): Promise<void> {
    if (this.retired) throw new DOMException('Workspace changed', 'AbortError');
    if (this.isInitialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._initDatabase();
    await this.initPromise;
    this.isInitialized = true;
  }

  private async _initDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('BotHivePlusCache', this.config.version);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        if (this.retired) { request.result.close(); reject(new DOMException('Workspace changed', 'AbortError')); return; }
        this.db = request.result;

        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this._createObjectStores(db);
      };
    });
  }

  private _createObjectStores(db: IDBDatabase): void {

    if (!db.objectStoreNames.contains('messages')) {
      const messagesStore = db.createObjectStore('messages', { keyPath: 'id' });
      messagesStore.createIndex('conversationId', 'conversationId', { unique: false });
      messagesStore.createIndex('cachedAt', 'cachedAt', { unique: false });
      messagesStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
      messagesStore.createIndex('externalId', 'externalId', { unique: false });
    }


    if (!db.objectStoreNames.contains('conversations')) {
      const conversationsStore = db.createObjectStore('conversations', { keyPath: 'id' });
      conversationsStore.createIndex('companyId', 'companyId', { unique: false });
      conversationsStore.createIndex('cachedAt', 'cachedAt', { unique: false });
      conversationsStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
      conversationsStore.createIndex('lastMessageAt', 'lastMessageAt', { unique: false });
    }


    if (!db.objectStoreNames.contains('media')) {
      const mediaStore = db.createObjectStore('media', { keyPath: 'url' });
      mediaStore.createIndex('type', 'type', { unique: false });
      mediaStore.createIndex('cachedAt', 'cachedAt', { unique: false });
      mediaStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
      mediaStore.createIndex('expiresAt', 'expiresAt', { unique: false });
    }


    if (!db.objectStoreNames.contains('pagination')) {
      const paginationStore = db.createObjectStore('pagination', { keyPath: 'conversationId' });
      paginationStore.createIndex('lastFetched', 'lastFetched', { unique: false });
    }


    if (!db.objectStoreNames.contains('metadata')) {
      const metadataStore = db.createObjectStore('metadata', { keyPath: 'key' });
    }


  }

  /**
   * Ensure database is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.init();
    }
    if (!this.db) {
      throw new Error('Database not initialized');
    }
  }

  /**
   * Get a transaction for the specified stores
   */
  private getTransaction(storeNames: string[], mode: IDBTransactionMode = 'readonly'): IDBTransaction {
    if (this.retired) throw new DOMException('Workspace changed', 'AbortError');
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db.transaction(storeNames, mode);
  }

  /**
   * Execute a request and return a promise
   */
  private executeRequest<T>(request: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * Cache messages for a conversation.
   * Preserves existing mediaUrl/mediaUrlFetchedAt when API response omits them so media
   * messages don't re-fetch every time after conversation load.
   */
  async cacheMessages(conversationId: number, messages: any[]): Promise<void> {
    await this.ensureInitialized();

    if (messages.length === 0) {
      return;
    }

    const transaction = this.getTransaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');
    const now = Date.now();
    const mediaTypes = ['image', 'video', 'audio', 'voice', 'document', 'sticker'];

    for (const msg of messages) {
      const isMediaMessage = msg.type && mediaTypes.includes(msg.type);
      const meta = msg.metadata && (typeof msg.metadata === 'string' ? (() => { try { return JSON.parse(msg.metadata); } catch { return {}; } })() : msg.metadata) || {};
      const urlFromMeta = (meta as any).mediaUrl;
      let effectiveMediaUrl = msg.mediaUrl || (isMediaMessage ? urlFromMeta : null);
      if (isTelegramBotCredentialMediaUrl(effectiveMediaUrl)) {
        effectiveMediaUrl = null;
      }
      let toCache: CachedMessage = {
        ...msg,
        cachedAt: now,
        lastAccessed: now,
        mediaUrl: effectiveMediaUrl,
        mediaUrlFetchedAt: isMediaMessage && effectiveMediaUrl ? (msg.mediaUrlFetchedAt || now) : undefined
      };
      const existing = await this.executeRequest(store.get(msg.id)) as CachedMessage | undefined;
      if (existing && isMediaMessage && !toCache.mediaUrl) {
        const existingUrlRaw =
          existing.mediaUrl ||
          (existing.metadata && typeof existing.metadata === 'object' && (existing.metadata as any).mediaUrl);
        const existingUrl = isTelegramBotCredentialMediaUrl(existingUrlRaw) ? null : existingUrlRaw;
        if (existingUrl && existing.mediaUrlFetchedAt) {
          toCache = { ...toCache, mediaUrl: existingUrl, mediaUrlFetchedAt: existing.mediaUrlFetchedAt };
          if ((existing as any).forceInlineMediaLoaded) (toCache as any).forceInlineMediaLoaded = true;
        }
      }
      if (existing && (meta.channelType === 'instagram' || instagramMessageMetadata(existing.metadata).channelType === 'instagram')) {
        toCache = reconcileInstagramMessages([existing, toCache])[0];
      }
      await this.executeRequest(store.put(toCache));
    }
  }

  /**
   * Get cached messages for a conversation with pagination
   */
  async getCachedMessages(
    conversationId: number, 
    page: number = 1, 
    limit: number = 10
  ): Promise<{ messages: CachedMessage[]; hasMore: boolean; total: number; staleMediaCount: number }> {
    await this.ensureInitialized();
    
    const transaction = this.getTransaction(['messages'], 'readonly');
    const store = transaction.objectStore('messages');
    const index = store.index('conversationId');
    
    const allMessages = await this.executeRequest(
      index.getAll(IDBKeyRange.only(conversationId))
    );

    allMessages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    const total = allMessages.length;
    const offset = (page - 1) * limit;
    const paginatedMessages = allMessages.slice(offset, offset + limit);

    const messages = paginatedMessages.reverse();
    const hasMore = offset + paginatedMessages.length < total;

    const mediaTypes = ['image', 'video', 'audio', 'voice', 'document', 'sticker'];
    messages.forEach((msg: CachedMessage) => {
      if (msg.type && mediaTypes.includes(msg.type) && !msg.mediaUrl && msg.metadata) {
        const meta = typeof msg.metadata === 'string' ? (() => { try { return JSON.parse(msg.metadata); } catch { return {}; } })() : (msg.metadata || {});
        const urlFromMeta = (meta as any).mediaUrl;
        if (urlFromMeta && !isTelegramBotCredentialMediaUrl(urlFromMeta)) {
          (msg as any).mediaUrl = urlFromMeta;
          if (!(msg as any).mediaUrlFetchedAt) (msg as any).mediaUrlFetchedAt = Date.now();
        }
      }
    });

    let staleMediaCount = 0;
    const now = Date.now();
    messages.forEach(msg => {
      if (this.isMediaUrlStale(msg)) {
        staleMediaCount++;
      }
    });

    if (messages.length > 0) {
      const updateTransaction = this.getTransaction(['messages'], 'readwrite');
      const updateStore = updateTransaction.objectStore('messages');
      
      const updatePromises = messages.map(msg => {
        msg.lastAccessed = now;
        return this.executeRequest(updateStore.put(msg));
      });
      
      await Promise.all(updatePromises);
    }

    return { messages, hasMore, total, staleMediaCount };
  }

  /**
   * Newest cached message for inbox list preview. Omits IndexedDB bookkeeping fields.
   */
  async getLatestCachedMessageForPreview(
    conversationId: number
  ): Promise<Omit<CachedMessage, 'cachedAt' | 'lastAccessed'> | null> {
    const { messages } = await this.getCachedMessages(conversationId, 1, 1);
    if (!messages.length) return null;
    const latest = messages[messages.length - 1];
    const { cachedAt, lastAccessed, ...rest } = latest;
    return rest;
  }

  /**
   * Check if messages are cached for a conversation page
   */
  async hasCachedMessages(conversationId: number, page: number = 1, limit: number = 10): Promise<boolean> {
    await this.ensureInitialized();

    const transaction = this.getTransaction(['messages'], 'readonly');
    const store = transaction.objectStore('messages');
    const index = store.index('conversationId');

    const count = await this.executeRequest(index.count(IDBKeyRange.only(conversationId)));
    const requiredMessages = page * limit;

    return count >= requiredMessages;
  }

  /**
   * Add a single message to cache (for real-time updates)
   */
  async addMessage(message: any): Promise<void> {
    await this.ensureInitialized();

    const transaction = this.getTransaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');
    const now = Date.now();

    const mediaTypes = ['image', 'video', 'audio', 'voice', 'document', 'sticker'];
    const isMediaMessage = message.type && mediaTypes.includes(message.type);
    const safeMediaUrl =
      message.mediaUrl && isTelegramBotCredentialMediaUrl(message.mediaUrl) ? null : message.mediaUrl;

    const cachedMessage: CachedMessage = {
      ...message,
      mediaUrl: safeMediaUrl,
      cachedAt: now,
      lastAccessed: now,
      mediaUrlFetchedAt: isMediaMessage && safeMediaUrl ? now : undefined
    };

    const existing = await this.executeRequest(store.get(message.id)) as CachedMessage | undefined;
    const isInstagram = instagramMessageMetadata(message.metadata).channelType === 'instagram' ||
      instagramMessageMetadata(existing?.metadata).channelType === 'instagram';
    const reconciled = existing && isInstagram
      ? reconcileInstagramMessages([existing, cachedMessage])[0]
      : cachedMessage;
    await this.executeRequest(store.put(reconciled));
  }

  /**
   * Update a message in cache (for status updates, etc.)
   */
  async updateMessage(messageId: number, updates: Partial<CachedMessage>): Promise<void> {
    await this.ensureInitialized();

    const transaction = this.getTransaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');

    const existingMessage = await this.executeRequest(store.get(messageId));
    if (existingMessage) {
      const safeUpdates = { ...updates };
      if (safeUpdates.mediaUrl != null && isTelegramBotCredentialMediaUrl(safeUpdates.mediaUrl)) {
        delete (safeUpdates as any).mediaUrl;
      }

      const updatedMessage = {
        ...existingMessage,
        ...safeUpdates,
        lastAccessed: Date.now()
      };

      if (safeUpdates.mediaUrl && !isTelegramBotCredentialMediaUrl(safeUpdates.mediaUrl)) {
        updatedMessage.mediaUrlFetchedAt = Date.now();
      }

      await this.executeRequest(store.put(updatedMessage));
    }
  }

  /**
   * Get a single message by id (e.g. to merge cached mediaUrl into API response)
   */
  async getMessageById(messageId: number): Promise<CachedMessage | null> {
    if (!messageId) return null;
    await this.ensureInitialized();
    const transaction = this.getTransaction(['messages'], 'readonly');
    const message = await this.executeRequest(transaction.objectStore('messages').get(messageId));
    return message ?? null;
  }

  /**
   * Get a single message by external ID (e.g. for quoted/reference message preview)
   */
  async getMessageByExternalId(externalId: string, conversationId?: number): Promise<CachedMessage | null> {
    if (!externalId) return null;
    await this.ensureInitialized();

    const transaction = this.getTransaction(['messages'], 'readonly');
    const store = transaction.objectStore('messages');
    const index = store.index('externalId');
    const messages = await this.executeRequest(index.getAll(externalId));
    const message = conversationId
      ? messages.find((candidate) => candidate.conversationId === conversationId)
      : messages[0];
    return message ?? null;
  }

  /**
   * Remove a message from cache
   */
  async removeMessage(messageId: number): Promise<void> {
    await this.ensureInitialized();

    const transaction = this.getTransaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');

    await this.executeRequest(store.delete(messageId));
  }

  /**
   * Get cached link preview by URL (for reuse in conversation view)
   */
  async getLinkPreview(url: string): Promise<CachedLinkPreview['data'] | null> {
    if (!url) return null;
    await this.ensureInitialized();

    const transaction = this.getTransaction(['metadata'], 'readonly');
    const store = transaction.objectStore('metadata');
    const key = `linkpreview:${url}`;
    const entry = await this.executeRequest(store.get(key)) as (CachedLinkPreview & { key: string }) | undefined;
    if (!entry?.data) return null;
    if (Date.now() - entry.cachedAt > LINK_PREVIEW_CACHE_MAX_AGE) {
      const writeTx = this.getTransaction(['metadata'], 'readwrite');
      await this.executeRequest(writeTx.objectStore('metadata').delete(key));
      return null;
    }
    return entry.data;
  }

  /**
   * Cache link preview result
   */
  async cacheLinkPreview(url: string, data: CachedLinkPreview['data']): Promise<void> {
    if (!url || !data) return;
    await this.ensureInitialized();

    const transaction = this.getTransaction(['metadata'], 'readwrite');
    const store = transaction.objectStore('metadata');
    const key = `linkpreview:${url}`;
    await this.executeRequest(store.put({ key, url, data, cachedAt: Date.now() }));
  }

  /**
   * Check if a media URL is stale and needs refresh
   */
  isMediaUrlStale(message: CachedMessage): boolean {
    if (!message.mediaUrl || !message.type) {
      return false;
    }

    if (isLocalServedMediaUrl(message.mediaUrl)) {
      return false;
    }

    const mediaTypes = ['image', 'video', 'audio', 'voice', 'document', 'sticker'];
    if (!mediaTypes.includes(message.type)) {
      return false;
    }

    if (!message.mediaUrlFetchedAt) {
      return true;
    }

    const age = Date.now() - message.mediaUrlFetchedAt;
    return age > MEDIA_URL_MAX_AGE;
  }

  /**
   * Refresh media URL for a message
   */
  async refreshMediaUrl(messageId: number, newMediaUrl: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      if (isTelegramBotCredentialMediaUrl(newMediaUrl)) {
        return false;
      }

      const transaction = this.getTransaction(['messages'], 'readwrite');
      const store = transaction.objectStore('messages');

      const message = await this.executeRequest(store.get(messageId));
      if (!message) {
        return false;
      }

      const updatedMessage = {
        ...message,
        mediaUrl: newMediaUrl,
        mediaUrlFetchedAt: Date.now(),
        lastAccessed: Date.now()
      };

      await this.executeRequest(store.put(updatedMessage));
      return true;
    } catch (error) {
      console.error('Error refreshing media URL:', error);
      return false;
    }
  }

  /**
   * Cache conversation metadata
   */
  async cacheConversation(conversation: any): Promise<void> {
    await this.ensureInitialized();

    const transaction = this.getTransaction(['conversations'], 'readwrite');
    const store = transaction.objectStore('conversations');
    const now = Date.now();

    const cachedConversation: CachedConversation = {
      ...conversation,
      cachedAt: now,
      lastAccessed: now
    };

    await this.executeRequest(store.put(cachedConversation));

  }

  /**
   * Get cached conversation
   */
  async getCachedConversation(conversationId: number): Promise<CachedConversation | null> {
    await this.ensureInitialized();

    const transaction = this.getTransaction(['conversations'], 'readwrite');
    const store = transaction.objectStore('conversations');

    const conversation = await this.executeRequest(store.get(conversationId));

    if (conversation) {

      conversation.lastAccessed = Date.now();
      await this.executeRequest(store.put(conversation));
      return conversation;
    }

    return null;
  }

  /**
   * Cache media metadata
   */
  async cacheMediaMetadata(url: string, metadata: Omit<CachedMediaMetadata, 'url' | 'cachedAt' | 'lastAccessed'>): Promise<void> {
    await this.ensureInitialized();

    const transaction = this.getTransaction(['media'], 'readwrite');
    const store = transaction.objectStore('media');
    const now = Date.now();

    const cachedMedia: CachedMediaMetadata = {
      url,
      ...metadata,
      cachedAt: now,
      lastAccessed: now
    };

    await this.executeRequest(store.put(cachedMedia));

  }

  /**
   * Get cached media metadata
   */
  async getCachedMediaMetadata(url: string): Promise<CachedMediaMetadata | null> {
    await this.ensureInitialized();

    const transaction = this.getTransaction(['media'], 'readwrite');
    const store = transaction.objectStore('media');

    const media = await this.executeRequest(store.get(url));

    if (media) {

      if (media.expiresAt && Date.now() > media.expiresAt) {
        await this.executeRequest(store.delete(url));
        return null;
      }


      media.lastAccessed = Date.now();
      await this.executeRequest(store.put(media));
      return media;
    }

    return null;
  }

  /**
   * Cache pagination metadata
   */
  async cachePagination(conversationId: number, pagination: Omit<MessagePagination, 'conversationId' | 'lastFetched'>): Promise<void> {
    await this.ensureInitialized();

    const transaction = this.getTransaction(['pagination'], 'readwrite');
    const store = transaction.objectStore('pagination');

    const paginationData: MessagePagination = {
      conversationId,
      ...pagination,
      lastFetched: Date.now()
    };

    await this.executeRequest(store.put(paginationData));
  }

  /**
   * Get cached pagination metadata
   */
  async getCachedPagination(conversationId: number): Promise<MessagePagination | null> {
    await this.ensureInitialized();

    const transaction = this.getTransaction(['pagination'], 'readonly');
    const store = transaction.objectStore('pagination');

    return await this.executeRequest(store.get(conversationId));
  }

  /**
   * Clear all cached messages for a conversation
   */
  async clearConversationCache(conversationId: number): Promise<void> {
    await this.ensureInitialized();

    const transaction = this.getTransaction(['messages', 'pagination'], 'readwrite');
    const messagesStore = transaction.objectStore('messages');
    const paginationStore = transaction.objectStore('pagination');
    const index = messagesStore.index('conversationId');


    const messages = await this.executeRequest(index.getAll(IDBKeyRange.only(conversationId)));
    const deletePromises = messages.map(msg => this.executeRequest(messagesStore.delete(msg.id)));
    await Promise.all(deletePromises);


    await this.executeRequest(paginationStore.delete(conversationId));


  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<CacheStats> {
    await this.ensureInitialized();

    const transaction = this.getTransaction(['messages', 'conversations', 'media'], 'readonly');
    const messagesStore = transaction.objectStore('messages');
    const conversationsStore = transaction.objectStore('conversations');
    const mediaStore = transaction.objectStore('media');

    const [messagesCount, conversationsCount, mediaCount] = await Promise.all([
      this.executeRequest(messagesStore.count()),
      this.executeRequest(conversationsStore.count()),
      this.executeRequest(mediaStore.count())
    ]);


    const messagesIndex = messagesStore.index('cachedAt');
    const oldestCursor = await this.executeRequest(messagesIndex.openCursor());
    const newestCursor = await this.executeRequest(messagesIndex.openCursor(null, 'prev'));

    const oldestEntry = oldestCursor?.value?.cachedAt || Date.now();
    const newestEntry = newestCursor?.value?.cachedAt || Date.now();

    return {
      messagesCount,
      conversationsCount,
      mediaCount,
      totalSize: messagesCount + conversationsCount + mediaCount,
      oldestEntry,
      newestEntry
    };
  }

  /**
   * Cleanup old cache entries based on configuration
   */
  async cleanup(): Promise<void> {
    await this.ensureInitialized();

    const stats = await this.getCacheStats();
    const now = Date.now();
    const maxAge = this.config.maxCacheAge;




    await this._cleanupExpiredEntries(now, maxAge);


    if (stats.messagesCount > this.config.maxMessages * this.config.cleanupThreshold) {
      await this._cleanupMessagesBySize();
    }

    if (stats.conversationsCount > this.config.maxConversations * this.config.cleanupThreshold) {
      await this._cleanupConversationsBySize();
    }

    if (stats.mediaCount > this.config.maxMediaItems * this.config.cleanupThreshold) {
      await this._cleanupMediaBySize();
    }



  }

  private async _cleanupExpiredEntries(now: number, maxAge: number): Promise<void> {
    const cutoffTime = now - maxAge;


    const messagesTransaction = this.getTransaction(['messages'], 'readwrite');
    const messagesStore = messagesTransaction.objectStore('messages');
    const messagesIndex = messagesStore.index('lastAccessed');

    const expiredMessages = await this.executeRequest(
      messagesIndex.getAll(IDBKeyRange.upperBound(cutoffTime))
    );

    await Promise.all(expiredMessages.map(msg => this.executeRequest(messagesStore.delete(msg.id))));


    const conversationsTransaction = this.getTransaction(['conversations'], 'readwrite');
    const conversationsStore = conversationsTransaction.objectStore('conversations');
    const conversationsIndex = conversationsStore.index('lastAccessed');

    const expiredConversations = await this.executeRequest(
      conversationsIndex.getAll(IDBKeyRange.upperBound(cutoffTime))
    );

    await Promise.all(expiredConversations.map(conv => this.executeRequest(conversationsStore.delete(conv.id))));


    const mediaTransaction = this.getTransaction(['media'], 'readwrite');
    const mediaStore = mediaTransaction.objectStore('media');
    const mediaIndex = mediaStore.index('lastAccessed');

    const expiredMedia = await this.executeRequest(
      mediaIndex.getAll(IDBKeyRange.upperBound(cutoffTime))
    );

    await Promise.all(expiredMedia.map(media => this.executeRequest(mediaStore.delete(media.url))));


  }

  private async _cleanupMessagesBySize(): Promise<void> {
    const transaction = this.getTransaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');
    const index = store.index('lastAccessed');


    const allMessages = await this.executeRequest(index.getAll());
    const excessCount = allMessages.length - this.config.maxMessages;

    if (excessCount > 0) {
      const messagesToDelete = allMessages.slice(0, excessCount);
      await Promise.all(messagesToDelete.map(msg => this.executeRequest(store.delete(msg.id))));

    }
  }

  private async _cleanupConversationsBySize(): Promise<void> {
    const transaction = this.getTransaction(['conversations'], 'readwrite');
    const store = transaction.objectStore('conversations');
    const index = store.index('lastAccessed');

    const allConversations = await this.executeRequest(index.getAll());
    const excessCount = allConversations.length - this.config.maxConversations;

    if (excessCount > 0) {
      const conversationsToDelete = allConversations.slice(0, excessCount);
      await Promise.all(conversationsToDelete.map(conv => this.executeRequest(store.delete(conv.id))));

    }
  }

  private async _cleanupMediaBySize(): Promise<void> {
    const transaction = this.getTransaction(['media'], 'readwrite');
    const store = transaction.objectStore('media');
    const index = store.index('lastAccessed');

    const allMedia = await this.executeRequest(index.getAll());
    const excessCount = allMedia.length - this.config.maxMediaItems;

    if (excessCount > 0) {
      const mediaToDelete = allMedia.slice(0, excessCount);
      await Promise.all(mediaToDelete.map(media => this.executeRequest(store.delete(media.url))));

    }
  }

  /**
   * Clear all cached media messages from IndexedDB
   * This should be called on initialization to remove any previously cached media messages
   */
  async clearMediaMessages(): Promise<void> {
    await this.ensureInitialized();

    const transaction = this.getTransaction(['messages'], 'readwrite');
    const store = transaction.objectStore('messages');


    const allMessages = await this.executeRequest(store.getAll());


    const mediaTypes = ['image', 'video', 'audio', 'voice', 'document', 'sticker'];
    const mediaMessages = allMessages.filter(msg => msg.type && mediaTypes.includes(msg.type));

    if (mediaMessages.length > 0) {

      await Promise.all(mediaMessages.map(msg => this.executeRequest(store.delete(msg.id))));
    }
  }

  /**
   * Clear all cache data
   */
  async clearAll(): Promise<void> {
    await this.ensureInitialized();

    const transaction = this.getTransaction(['messages', 'conversations', 'media', 'pagination', 'metadata'], 'readwrite');

    await Promise.all([
      this.executeRequest(transaction.objectStore('messages').clear()),
      this.executeRequest(transaction.objectStore('conversations').clear()),
      this.executeRequest(transaction.objectStore('media').clear()),
      this.executeRequest(transaction.objectStore('pagination').clear()),
      this.executeRequest(transaction.objectStore('metadata').clear())
    ]);


  }

  /**
   * Check if cache needs cleanup
   */
  async needsCleanup(): Promise<boolean> {
    const stats = await this.getCacheStats();
    const now = Date.now();
    const maxAge = this.config.maxCacheAge;

    return (
      stats.messagesCount > this.config.maxMessages * this.config.cleanupThreshold ||
      stats.conversationsCount > this.config.maxConversations * this.config.cleanupThreshold ||
      stats.mediaCount > this.config.maxMediaItems * this.config.cleanupThreshold ||
      (now - stats.oldestEntry) > maxAge
    );
  }

  /**
   * Invalidate cache entries for a specific conversation
   */
  async invalidateConversation(conversationId: number): Promise<void> {
    await this.clearConversationCache(conversationId);
  }

  /**
   * Warm up cache with recent conversations
   */
  async warmupCache(conversationIds: number[]): Promise<void> {




  }
}


export let messageCacheService = new MessageCacheService();
export function getMessageCache() { return messageCacheService; }
export async function resetMessageCache() {
  messageCacheService.retire();
  messageCacheService = new MessageCacheService();
  await messageCacheService.clearAll();
}
export { messageCacheService as default };
