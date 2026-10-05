
import type {
  MetaChannelsOnboardingMode,
  MetaPartnerAvailabilityConfig,
  MetaPartnerChannel,
} from '@shared/types/meta-partner';
import { resolveMetaLoginConfigId } from '@shared/types/meta-partner';

let configCache: {
  config: MetaPartnerAvailabilityConfig;
  timestamp: number;
} | null = null;

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch Meta Partner Configuration from database
 * Uses in-memory caching to avoid repeated API calls
 */
export async function fetchMetaPartnerConfig(): Promise<MetaPartnerAvailabilityConfig | null> {

  if (configCache && Date.now() - configCache.timestamp < CACHE_TTL) {
    return configCache.config;
  }

  try {
    const response = await fetch('/api/partner-configurations/meta/availability');
    
    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error('Failed to fetch Meta partner configuration');
    }

    const data = await response.json();
    
    if (!data.isAvailable || !data.config) {
      return null;
    }


    configCache = {
      config: data.config,
      timestamp: Date.now()
    };

    return data.config;
  } catch (error) {
    console.error('Error fetching Meta partner configuration:', error);
    

    if (import.meta.env.VITE_FACEBOOK_APP_ID && import.meta.env.VITE_WHATSAPP_CONFIG_ID) {
      console.warn('Using environment variables as fallback. This is for development only.');
      const whatsAppConfigId = import.meta.env.VITE_WHATSAPP_CONFIG_ID;
      return {
        partnerApiKey: import.meta.env.VITE_FACEBOOK_APP_ID,
        configId: whatsAppConfigId,
        whatsAppConfigId,
        apiVersion: 'v25.0'
      };
    }
    
    return null;
  }
}

/**
 * Clear configuration cache (useful for refresh)
 */
export function clearConfigCache(): void {
  configCache = null;
}

function isPlaceholder(value: string | null | undefined, placeholders: string[]): boolean {
  if (!value) return true;
  return placeholders.includes(value);
}

function isConfiguredLoginConfigId(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

/** Classify unified Meta Channels onboarding: one shared login vs two official flows */
export function resolveMetaChannelsOnboardingMode(
  config: MetaPartnerAvailabilityConfig | null | undefined
): MetaChannelsOnboardingMode {
  if (!config) return 'unavailable';
  if (isConfiguredLoginConfigId(config.metaChannelsConfigId)) return 'single';
  if (
    isConfiguredLoginConfigId(config.messengerConfigId) &&
    isConfiguredLoginConfigId(config.instagramConfigId)
  ) {
    return 'two_step';
  }
  return 'unavailable';
}

/**
 * Validate Facebook/Meta configuration for a specific channel.
 * @param config - Optional config object. If not provided, will fetch from API
 * @param channel - Channel to validate (defaults to whatsapp for backward compatibility)
 */
export async function validateFacebookConfig(
  config?: MetaPartnerAvailabilityConfig | null,
  channel: MetaPartnerChannel = 'whatsapp'
): Promise<{
  isValid: boolean;
  missingFields: string[];
  config?: MetaPartnerAvailabilityConfig;
  guidance?: string;
  devFallback?: boolean;
}> {
  const missingFields: string[] = [];
  let configToValidate = config;


  if (!configToValidate) {
    configToValidate = await fetchMetaPartnerConfig();
  }

  if (!configToValidate) {

    if (import.meta.env.VITE_FACEBOOK_APP_ID && import.meta.env.VITE_WHATSAPP_CONFIG_ID) {
      const whatsAppConfigId = import.meta.env.VITE_WHATSAPP_CONFIG_ID;
      configToValidate = {
        partnerApiKey: import.meta.env.VITE_FACEBOOK_APP_ID,
        configId: whatsAppConfigId,
        whatsAppConfigId,
        apiVersion: 'v25.0'
      };
    } else {
      missingFields.push('Meta Partner Configuration');
      return {
        isValid: false,
        missingFields,
        guidance: 'configuration_missing',
      };
    }
  }

  if (!configToValidate.partnerApiKey || configToValidate.partnerApiKey === 'YOUR_FB_APP_ID') {
    missingFields.push('App ID (partnerApiKey)');
  }

  switch (channel) {
    case 'whatsapp':
      if (isPlaceholder(configToValidate.configId, ['YOUR_WHATSAPP_CONFIG_ID'])) {
        missingFields.push('WhatsApp Configuration ID (configId)');
      }
      break;
    case 'instagram':
    case 'messenger': {
      const loginConfigId = resolveMetaLoginConfigId(
        configToValidate,
        channel === 'messenger' ? 'messenger' : 'instagram'
      );
      if (!loginConfigId) {
        const hasPartnerApiKey =
          Boolean(configToValidate.partnerApiKey) &&
          configToValidate.partnerApiKey !== 'YOUR_FB_APP_ID';
        const allowDevFallback = !import.meta.env.PROD && hasPartnerApiKey;

        if (!allowDevFallback) {
          const label =
            channel === 'messenger'
              ? 'Messenger Configuration ID (metaChannelsConfigId or messengerConfigId)'
              : 'Instagram Configuration ID (metaChannelsConfigId or instagramConfigId)';
          missingFields.push(label);
        }
      }
      break;
    }
    case 'meta_channels': {
      const mode = resolveMetaChannelsOnboardingMode(configToValidate);
      if (mode === 'unavailable') {
        const hasPartnerApiKey =
          Boolean(configToValidate.partnerApiKey) &&
          configToValidate.partnerApiKey !== 'YOUR_FB_APP_ID';
        const allowDevFallback = !import.meta.env.PROD && hasPartnerApiKey;

        if (!allowDevFallback) {
          missingFields.push(
            'Meta Channels Configuration ID (metaChannelsConfigId, or both messengerConfigId and instagramConfigId)'
          );
        }
      }
      break;
    }
  }

  let guidance: string | undefined;
  if (missingFields.length > 0) {
    guidance = 'configuration_missing';
  }

  const hasPartnerApiKey =
    Boolean(configToValidate.partnerApiKey) &&
    configToValidate.partnerApiKey !== 'YOUR_FB_APP_ID';
  const loginConfigId =
    channel === 'instagram' || channel === 'messenger'
      ? resolveMetaLoginConfigId(
          configToValidate,
          channel === 'messenger' ? 'messenger' : 'instagram'
        )
      : undefined;
  const metaChannelsMode =
    channel === 'meta_channels' ? resolveMetaChannelsOnboardingMode(configToValidate) : undefined;
  const devFallback =
    missingFields.length === 0 &&
    !loginConfigId &&
    !import.meta.env.PROD &&
    hasPartnerApiKey &&
    (channel === 'instagram' ||
      channel === 'messenger' ||
      (channel === 'meta_channels' && metaChannelsMode === 'unavailable'));

  return {
    isValid: missingFields.length === 0,
    missingFields,
    config: configToValidate,
    guidance,
    devFallback,
  };
}

/** Resolve the Facebook Login for Business config_id for Instagram or Messenger */
export function resolveChannelLoginConfigId(
  config: MetaPartnerAvailabilityConfig | null | undefined,
  channel: 'instagram' | 'messenger'
): string | undefined {
  return resolveMetaLoginConfigId(config, channel);
}

export const FACEBOOK_APP_CONFIG = {
  appId: import.meta.env.VITE_FACEBOOK_APP_ID || 'YOUR_FB_APP_ID',
  whatsAppConfigId: import.meta.env.VITE_WHATSAPP_CONFIG_ID || 'YOUR_WHATSAPP_CONFIG_ID',
  apiVersion: 'v25.0'
};
