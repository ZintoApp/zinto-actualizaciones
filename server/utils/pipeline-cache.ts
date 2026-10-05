import { storage } from '../storage';
import { PipelineStage, Pipeline } from '@shared/schema';

interface CachedGeneralSettings {
  value: any;
  timestamp: number;
}

interface CachedPipelineStage {
  stage: PipelineStage | null;
  timestamp: number;
}

interface CachedPipeline {
  pipelines: Pipeline[];
  timestamp: number;
}

interface CachedCompanySetting {
  value: boolean;
  timestamp: number;
}

interface CachedCompanySettingNumeric {
  value: number | null;
  timestamp: number;
}

// Cache TTL: 60 seconds
const CACHE_TTL_MS = 60 * 1000;

// In-memory cache for general settings (process-wide)
let generalSettingsCache: CachedGeneralSettings | null = null;

// In-memory cache for initial pipeline stages per company and pipeline (process-wide)
// Key format: "companyId-pipelineId" or "companyId" for backward compatibility
const pipelineStageCache = new Map<string, CachedPipelineStage>();

// Override target stage when autoAddPipelineId + autoAddStageId are set (same TTL as pipeline stage cache)
// Key format: "companyId-pipelineId-stageId"
const targetPipelineStageOverrideCache = new Map<string, CachedPipelineStage>();

// In-memory cache for pipelines per company (process-wide)
const pipelineCache = new Map<number, CachedPipeline>();

// In-memory cache for company settings (process-wide, per company)
const companySettingsCache = new Map<number, Map<string, CachedCompanySetting>>();

// In-memory cache for numeric company settings (process-wide, per company)
const companySettingsNumericCache = new Map<number, Map<string, CachedCompanySettingNumeric>>();

/**
 * Get general settings with caching (60 second TTL)
 * Returns the cached value if available and not expired, otherwise fetches from storage
 */
export async function getCachedGeneralSettings(): Promise<any> {
  const now = Date.now();
  
  // Check if cache is valid
  if (generalSettingsCache && (now - generalSettingsCache.timestamp) < CACHE_TTL_MS) {
    return generalSettingsCache.value;
  }
  
  // Fetch from storage and update cache
  const generalSettings = await storage.getAppSetting('general_settings');
  const settingsValue = generalSettings?.value as any;
  
  generalSettingsCache = {
    value: settingsValue,
    timestamp: now
  };
  
  return settingsValue;
}

/**
 * Get company setting with caching (60 second TTL)
 * Returns the cached value if available and not expired, otherwise fetches from storage
 */
export async function getCachedCompanySetting(companyId: number, key: string): Promise<boolean> {
  const now = Date.now();
  const companyCache = companySettingsCache.get(companyId);
  const cached = companyCache?.get(key);
  
  // Check if cache is valid
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.value;
  }
  
  // Fetch from storage and update cache
  const setting = await storage.getCompanySetting(companyId, key);
  const value = setting?.value !== undefined ? Boolean(setting.value) : false;
  
  if (!companyCache) {
    companySettingsCache.set(companyId, new Map());
  }
  companySettingsCache.get(companyId)!.set(key, {
    value,
    timestamp: now
  });
  
  return value;
}

/**
 * Get a numeric company setting with caching (60 second TTL)
 */
export async function getCachedCompanySettingNumeric(companyId: number, key: string): Promise<number | null> {
  const now = Date.now();
  const companyCache = companySettingsNumericCache.get(companyId);
  const cached = companyCache?.get(key);

  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.value;
  }

  const setting = await storage.getCompanySetting(companyId, key);
  const raw = setting?.value;
  const n = raw === undefined || raw === null ? NaN : Number(raw);
  const value = n && !Number.isNaN(n) ? n : null;

  if (!companyCache) {
    companySettingsNumericCache.set(companyId, new Map());
  }
  companySettingsNumericCache.get(companyId)!.set(key, {
    value,
    timestamp: now,
  });

  return value;
}

/**
 * Get the initial pipeline stage (order = 1) for a company with caching (60 second TTL)
 * Returns the cached value if available and not expired, otherwise fetches from storage
 * If pipelineId is not provided, uses the company's default pipeline
 */
export async function getCachedInitialPipelineStage(companyId: number, pipelineId?: number): Promise<PipelineStage | null> {
  // If pipelineId is not provided, resolve the company's default pipeline
  let targetPipelineId = pipelineId;
  if (!targetPipelineId) {
    const pipelines = await getCachedPipelinesByCompany(companyId);
    const defaultPipeline = pipelines.find(p => p.isDefault === true);
    if (!defaultPipeline) {
      // If no default pipeline exists, return null
      return null;
    }
    targetPipelineId = defaultPipeline.id;
  }

  const now = Date.now();
  // Use a composite key for caching: companyId-pipelineId
  const cacheKey = `${companyId}-${targetPipelineId}`;
  const cached = pipelineStageCache.get(cacheKey);
  
  // Check if cache is valid
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.stage;
  }
  
  // Fetch from storage and update cache
  const pipelineStages = await storage.getPipelineStagesByCompany(companyId, targetPipelineId);
  const initialStage = pipelineStages.find(stage => stage.order === 1) || null;
  
  pipelineStageCache.set(cacheKey, {
    stage: initialStage,
    timestamp: now
  });
  
  return initialStage;
}

/**
 * Resolves the pipeline stage used when auto-adding contacts: company override or default pipeline's first stage.
 */
export async function getCachedTargetPipelineStage(companyId: number): Promise<PipelineStage | null> {
  const autoAddPipelineId = await getCachedCompanySettingNumeric(companyId, 'autoAddPipelineId');
  const autoAddStageId = await getCachedCompanySettingNumeric(companyId, 'autoAddStageId');

  if (autoAddPipelineId !== null && autoAddStageId !== null) {
    const now = Date.now();
    const overrideKey = `${companyId}-${autoAddPipelineId}-${autoAddStageId}`;
    const cachedOverride = targetPipelineStageOverrideCache.get(overrideKey);
    if (cachedOverride && (now - cachedOverride.timestamp) < CACHE_TTL_MS) {
      return cachedOverride.stage;
    }

    const pipelineStages = await storage.getPipelineStagesByCompany(companyId, autoAddPipelineId);
    const matched = pipelineStages.find((stage) => stage.id === autoAddStageId);
    if (matched) {
      targetPipelineStageOverrideCache.set(overrideKey, {
        stage: matched,
        timestamp: now,
      });
      return matched;
    }
  }

  return getCachedInitialPipelineStage(companyId);
}

/**
 * Invalidate the general settings cache
 * Call this when general settings are updated
 */
export function invalidateGeneralSettingsCache(): void {
  generalSettingsCache = null;
}

/**
 * Get pipelines for a company with caching (60 second TTL)
 * Returns the cached value if available and not expired, otherwise fetches from storage
 */
export async function getCachedPipelinesByCompany(companyId: number): Promise<Pipeline[]> {
  const now = Date.now();
  const cached = pipelineCache.get(companyId);
  
  // Check if cache is valid
  if (cached && (now - cached.timestamp) < CACHE_TTL_MS) {
    return cached.pipelines;
  }
  
  // Fetch from storage and update cache
  const pipelines = await storage.getPipelinesByCompany(companyId);
  
  pipelineCache.set(companyId, {
    pipelines,
    timestamp: now
  });
  
  return pipelines;
}

/**
 * Invalidate the pipeline stage cache for a specific company
 * Call this when pipeline stages are updated for a company
 */
export function invalidatePipelineStageCache(companyId: number): void {
  // Delete all cache entries for this company (matching "companyId-" or "companyId-pipelineId")
  for (const key of pipelineStageCache.keys()) {
    if (key.startsWith(`${companyId}-`)) {
      pipelineStageCache.delete(key);
    }
  }
  // Also invalidate parent pipeline cache for coherence (clears override target cache too)
  invalidatePipelineCache(companyId);
}

/**
 * Invalidate all pipeline stage caches
 * Call this when pipeline stages are updated globally
 */
export function invalidateAllPipelineStageCaches(): void {
  pipelineStageCache.clear();
  targetPipelineStageOverrideCache.clear();
}

/**
 * Invalidate the pipeline cache for a specific company
 * Call this when pipelines are updated for a company
 */
export function invalidatePipelineCache(companyId: number): void {
  pipelineCache.delete(companyId);
  // Also invalidate related stage caches for coherence
  // Stage cache keys are strings in format "companyId-pipelineId", so we need to remove all matching keys
  for (const key of pipelineStageCache.keys()) {
    if (key.startsWith(`${companyId}-`)) {
      pipelineStageCache.delete(key);
    }
  }
  invalidateTargetPipelineStageOverrideCache(companyId);
}

/**
 * Invalidate all pipeline caches
 * Call this when pipelines are updated globally
 */
export function invalidateAllPipelineCaches(): void {
  pipelineCache.clear();
  invalidateAllPipelineStageCaches();
}

/**
 * Invalidate cached auto-add override target stages for a company
 */
export function invalidateTargetPipelineStageOverrideCache(companyId: number): void {
  for (const key of targetPipelineStageOverrideCache.keys()) {
    if (key.startsWith(`${companyId}-`)) {
      targetPipelineStageOverrideCache.delete(key);
    }
  }
}

/**
 * Invalidate the company setting cache for a specific company and key
 * Call this when a company setting is updated
 */
export function invalidateCompanySettingCache(companyId: number, key: string): void {
  const companyCache = companySettingsCache.get(companyId);
  if (companyCache) {
    companyCache.delete(key);
  }
}

/**
 * Invalidate the numeric company setting cache for a specific company and key
 */
export function invalidateCompanySettingNumericCache(companyId: number, key: string): void {
  const companyCache = companySettingsNumericCache.get(companyId);
  if (companyCache) {
    companyCache.delete(key);
  }
  if (key === 'autoAddPipelineId' || key === 'autoAddStageId') {
    invalidateTargetPipelineStageOverrideCache(companyId);
  }
}

/**
 * Invalidate all company setting caches for a specific company
 * Call this when company settings are updated
 */
export function invalidateAllCompanySettingCaches(companyId: number): void {
  companySettingsCache.delete(companyId);
}

