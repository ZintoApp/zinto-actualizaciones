/**
 * Helpers for duplicating webhook trigger nodes without reusing routing identifiers.
 */

const WEBHOOK_TRIGGER_SAFE_DATA_KEYS = [
  'label',
  'platform',
  'selectedPreset',
  'selectedEventIds',
  'selectedPresetIds',
  'filterConditions',
  'contactMapping',
  'responseConfig',
  'customVariableMappings',
  'metadata',
] as const;

export function generateWebhookTriggerToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Build node data for a duplicated webhook trigger, with a fresh token and no custom path. */
export function buildDuplicatedWebhookTriggerNodeData(
  sourceData: Record<string, unknown>,
  newToken: string = generateWebhookTriggerToken()
): Record<string, unknown> {
  const safeData: Record<string, unknown> = {};
  for (const key of WEBHOOK_TRIGGER_SAFE_DATA_KEYS) {
    if (sourceData[key] !== undefined) {
      safeData[key] = sourceData[key];
    }
  }
  return {
    ...safeData,
    webhookToken: newToken,
    customPath: undefined,
    useCustomPath: false,
  };
}
