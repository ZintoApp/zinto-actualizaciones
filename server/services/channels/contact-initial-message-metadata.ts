import type { Contact, InsertContact } from '@shared/schema';
import type { GetOrCreateContactResult } from '../../storage';

export const CONTACT_INITIAL_MESSAGE_METADATA_KEYS = {
  contactInitialMessage: 'contactInitialMessage',
  contactCreatedByIncomingWebhook: 'contactCreatedByIncomingWebhook',
  initialContactChannelType: 'initialContactChannelType',
} as const;

export const CONTACT_INITIAL_MESSAGE_EXCLUDED_CONVERSATION_STATUSES = [
  'closed',
] as const;

export type ContactInitialMessageMetadataInput = {
  existingMetadata?: unknown;
  channelType: string;
  conversationStatus?: string | null;
  isInboundContactMessage: boolean;
  contactWasCreatedByInboundWebhook: boolean;
  isHistoryOrImport?: boolean;
  isSyntheticOrSystem?: boolean;
};

export type InboundContactResolution = GetOrCreateContactResult;

type ContactStorage = {
  getOrCreateContactResult(contact: InsertContact): Promise<GetOrCreateContactResult>;
};

/** Resolve an inbound contact and whether storage actually inserted a new row. */
export async function resolveInboundContact(
  storage: ContactStorage,
  contactData: InsertContact,
): Promise<InboundContactResolution> {
  return storage.getOrCreateContactResult(contactData);
}

function parseMetadata(existingMetadata: unknown): Record<string, unknown> {
  if (existingMetadata == null) {
    return {};
  }
  if (typeof existingMetadata === 'string') {
    try {
      const parsed = JSON.parse(existingMetadata);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return { ...(parsed as Record<string, unknown>) };
      }
      return {};
    } catch {
      return {};
    }
  }
  if (typeof existingMetadata === 'object' && !Array.isArray(existingMetadata)) {
    return { ...(existingMetadata as Record<string, unknown>) };
  }
  return {};
}

export function shouldAttachContactInitialMessageMetadata(
  input: ContactInitialMessageMetadataInput,
): boolean {
  if (!input.isInboundContactMessage) {
    return false;
  }
  if (!input.contactWasCreatedByInboundWebhook) {
    return false;
  }
  if (input.isHistoryOrImport) {
    return false;
  }
  if (input.isSyntheticOrSystem) {
    return false;
  }
  const status = input.conversationStatus ?? undefined;
  if (
    status &&
    (CONTACT_INITIAL_MESSAGE_EXCLUDED_CONVERSATION_STATUSES as readonly string[]).includes(
      status,
    )
  ) {
    return false;
  }
  return true;
}

export function withContactInitialMessageMetadata(
  input: ContactInitialMessageMetadataInput,
): unknown {
  const { existingMetadata } = input;
  if (!shouldAttachContactInitialMessageMetadata(input)) {
    return existingMetadata;
  }

  const merged = {
    ...parseMetadata(existingMetadata),
    [CONTACT_INITIAL_MESSAGE_METADATA_KEYS.contactInitialMessage]: true,
    [CONTACT_INITIAL_MESSAGE_METADATA_KEYS.contactCreatedByIncomingWebhook]: true,
    [CONTACT_INITIAL_MESSAGE_METADATA_KEYS.initialContactChannelType]:
      input.channelType,
  };

  if (typeof existingMetadata === 'string') {
    return JSON.stringify(merged);
  }
  return merged;
}
