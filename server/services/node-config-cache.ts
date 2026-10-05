/**
 * Short-lived cache for node credential lookups that otherwise scan all company flows.
 * Invalidated when a flow is saved (see storage.updateFlow / createFlow).
 */

const TTL_MS = 60_000;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const pineconeCredentialsCache = new Map<string, CacheEntry<unknown>>();
const nodeCredentialConfigCache = new Map<string, CacheEntry<unknown>>();
const nodeKbSettingsCache = new Map<string, CacheEntry<unknown>>();

function cacheKey(companyId: number, nodeId: string): string {
  return `${companyId}:${nodeId}`;
}

function getCached<T>(map: Map<string, CacheEntry<unknown>>, key: string): T | undefined {
  const entry = map.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    map.delete(key);
    return undefined;
  }
  return entry.value as T;
}

function setCached<T>(map: Map<string, CacheEntry<unknown>>, key: string, value: T): void {
  map.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

export function getCachedPineconeCredentials<T>(
  companyId: number,
  nodeId: string
): T | undefined {
  return getCached<T>(pineconeCredentialsCache, cacheKey(companyId, nodeId));
}

export function setCachedPineconeCredentials<T>(
  companyId: number,
  nodeId: string,
  value: T
): void {
  setCached(pineconeCredentialsCache, cacheKey(companyId, nodeId), value);
}

export function getCachedNodeCredentialConfig<T>(
  companyId: number,
  nodeId: string
): T | undefined {
  return getCached<T>(nodeCredentialConfigCache, cacheKey(companyId, nodeId));
}

export function setCachedNodeCredentialConfig<T>(
  companyId: number,
  nodeId: string,
  value: T
): void {
  setCached(nodeCredentialConfigCache, cacheKey(companyId, nodeId), value);
}

export function getCachedNodeKbSettings<T>(
  companyId: number,
  nodeId: string
): T | undefined {
  return getCached<T>(nodeKbSettingsCache, cacheKey(companyId, nodeId));
}

export function setCachedNodeKbSettings<T>(
  companyId: number,
  nodeId: string,
  value: T
): void {
  setCached(nodeKbSettingsCache, cacheKey(companyId, nodeId), value);
}

/** Drop cached credential lookups for a company (optionally one node). */
export function invalidateNodeCredentialCache(companyId: number, nodeId?: string): void {
  const prefix = `${companyId}:`;
  const suffix = nodeId ? cacheKey(companyId, nodeId) : undefined;

  for (const map of [pineconeCredentialsCache, nodeCredentialConfigCache, nodeKbSettingsCache]) {
    if (suffix) {
      map.delete(suffix);
      continue;
    }
    for (const key of map.keys()) {
      if (key.startsWith(prefix)) {
        map.delete(key);
      }
    }
  }
}

const nodeKbProviderHealthCache = new Map<string, CacheEntry<{
  ok: boolean;
  message?: string;
  recordedAt: string;
}>>();

/** Record knowledge-base vector provider health for UI/diagnostics. */
export function setNodeKbProviderHealth(
  companyId: number,
  nodeId: string,
  health: { ok: boolean; message?: string }
): void {
  setCached(nodeKbProviderHealthCache, cacheKey(companyId, nodeId), {
    ...health,
    recordedAt: new Date().toISOString(),
  });
}

export function getNodeKbProviderHealth(
  companyId: number,
  nodeId: string
): { ok: boolean; message?: string; recordedAt: string } | undefined {
  return getCached(nodeKbProviderHealthCache, cacheKey(companyId, nodeId));
}
