/**
 * Gamma API Proxy Routes
 * 
 * Server-side proxy endpoints for Gamma API calls (theme/folder fetching).
 * Keeps API keys secure (server-side only, never exposed to client).
 */

import { Router } from 'express';
import { ensureAuthenticated } from '../middleware';
import { z } from 'zod';
import { getThemes, getFolders, type GammaTheme, type GammaFolder } from '../services/gamma-api-client';
import { logger } from '../utils/logger';
import crypto from 'crypto';

const router = Router();

// In-memory cache for theme/folder lists
// Key: SHA256 hash of API key (for privacy)
// Value: { data: Array<Theme|Folder>, expiresAt: number }
const cache = new Map<string, { data: any; expiresAt: number }>();

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Hash API key for use as cache key (don't store plaintext in memory)
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Get from cache if valid and not expired
 */
function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now > entry.expiresAt) {
    cache.delete(key);
    return null;
  }

  return entry.data as T;
}

/**
 * Set cache entry with TTL
 */
function setCache<T>(key: string, data: T): void {
  const expiresAt = Date.now() + CACHE_TTL_MS;
  cache.set(key, { data, expiresAt });
}

/**
 * Periodic cleanup of expired cache entries (runs every 10 minutes)
 */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now > entry.expiresAt) {
      cache.delete(key);
    }
  }
}, 10 * 60 * 1000);

// Schema for POST body
const gammaProxyRequestSchema = z.object({
  gammaApiKey: z.string().min(1, 'Gamma API key is required'),
  force: z.boolean().optional(),
});

/**
 * POST /api/gamma/themes
 * 
 * Fetch available Gamma themes for the provided API key.
 * Results are cached for 5 minutes.
 */
router.post('/themes', ensureAuthenticated, async (req: any, res) => {
  try {
    const parseResult = gammaProxyRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.issues,
      });
    }

    const { gammaApiKey, force } = parseResult.data;
    const cacheKey = `themes:${hashApiKey(gammaApiKey)}`;

    // Check cache first
    if (!force) {
      const cached = getFromCache<GammaTheme[]>(cacheKey);
      if (cached) {
        logger.info('gamma-routes', 'Returning cached themes');
        return res.json({ themes: cached });
      }
    }

    // Fetch from Gamma API
    logger.info('gamma-routes', 'Fetching themes from Gamma API');
    const themes = await getThemes(gammaApiKey);

    // Cache the result
    setCache(cacheKey, themes);

    return res.json({ themes });
  } catch (error: any) {
    logger.error('gamma-routes', 'Error fetching themes', error);

    // Map common errors to user-friendly messages
    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(401).json({
        error: 'Invalid Gamma API key',
      });
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again later.',
      });
    }

    return res.status(500).json({
      error: 'Failed to fetch themes from Gamma API',
      message: error.message,
    });
  }
});

/**
 * POST /api/gamma/folders
 * 
 * Fetch available Gamma folders for the provided API key.
 * Results are cached for 5 minutes.
 */
router.post('/folders', ensureAuthenticated, async (req: any, res) => {
  try {
    const parseResult = gammaProxyRequestSchema.safeParse(req.body);

    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request',
        details: parseResult.error.issues,
      });
    }

    const { gammaApiKey, force } = parseResult.data;
    const cacheKey = `folders:${hashApiKey(gammaApiKey)}`;

    // Check cache first
    if (!force) {
      const cached = getFromCache<GammaFolder[]>(cacheKey);
      if (cached) {
        logger.info('gamma-routes', 'Returning cached folders');
        return res.json({ folders: cached });
      }
    }

    // Fetch from Gamma API
    logger.info('gamma-routes', 'Fetching folders from Gamma API');
    const folders = await getFolders(gammaApiKey);

    // Cache the result
    setCache(cacheKey, folders);

    return res.json({ folders });
  } catch (error: any) {
    logger.error('gamma-routes', 'Error fetching folders', error);

    // Map common errors to user-friendly messages
    if (error.response?.status === 401 || error.response?.status === 403) {
      return res.status(401).json({
        error: 'Invalid Gamma API key',
      });
    }

    if (error.response?.status === 429) {
      return res.status(429).json({
        error: 'Rate limit exceeded. Please try again later.',
      });
    }

    return res.status(500).json({
      error: 'Failed to fetch folders from Gamma API',
      message: error.message,
    });
  }
});

export default router;
