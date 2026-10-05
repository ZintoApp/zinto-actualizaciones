
/**
 * Baileys WhatsApp channel types that require a real-time connection status.
 */
export const BAILEYS_CHANNEL_TYPES = ['whatsapp', 'whatsapp_unofficial'] as const;

/**
 * Checks if a channel type is a Baileys WhatsApp channel.
 */
export function isBaileysChannel(channelType: string): boolean {
  return (BAILEYS_CHANNEL_TYPES as readonly string[]).includes(channelType);
}

/**
 * Normalizes a raw channel connection status to a standard set of values.
 * Baileys channels use this to map various internal states to normalized ones.
 */
export function normalizeChannelStatus(status: string | null): 'active' | 'inactive' | 'reconnecting' | 'error' {
  // Truly usable states
  if (status === 'connected' || status === 'active') {
    return 'active';
  }

  // Transitional states
  if (status === 'connecting' || status === 'reconnecting') {
    return 'reconnecting';
  }

  // Explicit error state
  if (status === 'error') {
    return 'error';
  }

  // All other states are considered inactive/unavailable.
  // This includes setup states (qr_code, pending, null) and 
  // terminal disconnected states (disconnected, loggedout, not_connected, inactive).
  return 'inactive';
}

/**
 * Resolves the effective status of a channel connection based on its type and raw status.
 * Direct Instagram connections retain actionable errors; other non-Baileys channels keep their legacy status behavior.
 */
export function getEffectiveChannelStatus(channel: { channelType: string; status: string | null; connectionData?: unknown }): 'active' | 'inactive' | 'reconnecting' | 'error' {
  if (channel.channelType === 'whatsapp_official' && (channel.connectionData as any)?.partnerManaged) {
    const data = channel.connectionData as any;
    if (data.coexistenceStatus === 'offboarded') return 'reconnecting';
    if (data.coexistenceStatus === 'disconnected') return 'inactive';
    if (data.onboardingStatus === 'webhook_failed') return 'error';
    return normalizeChannelStatus(channel.status);
  }
  if (channel.channelType === 'instagram' && (channel.connectionData as { authMethod?: string } | null)?.authMethod === 'instagram_login') {
    return normalizeChannelStatus(channel.status);
  }
  if (!isBaileysChannel(channel.channelType)) {
    return 'active';
  }
  return normalizeChannelStatus(channel.status);
}

/**
 * Determines if a channel is available for selection or interaction.
 */
export function isChannelAvailable(channel: { channelType: string; status: string | null; connectionData?: unknown }): boolean {
  return getEffectiveChannelStatus(channel) === 'active';
}
