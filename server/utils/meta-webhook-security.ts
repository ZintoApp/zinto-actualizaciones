/**
 * Meta webhook signature verification helpers.
 * Unsigned webhooks are rejected by default; bypass requires an explicit dev-only flag.
 */
export function isMetaWebhookSignatureBypassAllowed(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.META_ALLOW_UNSIGNED_WEBHOOKS === 'true'
  );
}

export function isMetaLegacyTokenOnboardingAllowed(): boolean {
  return (
    process.env.NODE_ENV !== 'production' &&
    process.env.META_ALLOW_LEGACY_TOKEN_ONBOARDING === 'true'
  );
}

export function requireMetaWebhookSignature(signature: string | undefined): void {
  if (!signature?.trim() && !isMetaWebhookSignatureBypassAllowed()) {
    throw new Error('Missing x-hub-signature-256 header');
  }
}

export function requireMetaWebhookRawPayload(
  signature: string | undefined,
  rawPayload: string | undefined
): void {
  requireMetaWebhookSignature(signature);

  if (signature?.trim() && !rawPayload?.length && !isMetaWebhookSignatureBypassAllowed()) {
    throw new Error('Raw payload unavailable for webhook signature verification');
  }
}
