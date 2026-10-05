import { areJidsSameUser, isJidGroup, type GroupMetadata } from 'baileys';

const GROUP_METADATA_TTL_MS = 5 * 60 * 1000;
const MAX_GROUP_METADATA_ENTRIES_PER_CONNECTION = 500;

type CachedGroupMetadata = {
  metadata: GroupMetadata;
  expiresAt: number;
};

export type WhatsAppQuotedMessageContext = {
  stanzaId: string;
  participant: string | null;
  remoteJid: string | null;
  quotedMessage: Record<string, unknown> | null;
};

/**
 * Extract Baileys' reply context from normalized message content. Context info
 * lives on the concrete message node (extended text, image, audio, etc.), not
 * on the IMessage wrapper itself.
 */
export function extractQuotedMessageContext(
  content: Record<string, unknown> | null | undefined,
): WhatsAppQuotedMessageContext | null {
  if (!content) return null;

  for (const value of Object.values(content)) {
    if (!value || typeof value !== 'object') continue;
    const contextInfo = (value as any).contextInfo;
    if (!contextInfo || typeof contextInfo.stanzaId !== 'string' || !contextInfo.stanzaId.trim()) {
      continue;
    }
    return {
      stanzaId: contextInfo.stanzaId,
      participant: typeof contextInfo.participant === 'string' ? contextInfo.participant : null,
      remoteJid: typeof contextInfo.remoteJid === 'string' ? contextInfo.remoteJid : null,
      quotedMessage: contextInfo.quotedMessage && typeof contextInfo.quotedMessage === 'object'
        ? contextInfo.quotedMessage as Record<string, unknown>
        : null,
    };
  }

  return null;
}

const groupChatsEnabledByConnection = new Map<number, boolean>();
const groupMetadataByConnection = new Map<number, Map<string, CachedGroupMetadata>>();

export function setGroupChatsEnabled(connectionId: number, enabled: boolean): void {
  groupChatsEnabledByConnection.set(connectionId, enabled === true);
  if (!enabled) {
    groupMetadataByConnection.delete(connectionId);
  }
}

export function areGroupChatsEnabled(connectionId: number): boolean {
  return groupChatsEnabledByConnection.get(connectionId) === true;
}

export function shouldIgnoreWhatsAppJid(connectionId: number, jid: string): boolean {
  return isJidGroup(jid) === true && !areGroupChatsEnabled(connectionId);
}

export function getCachedGroupMetadata(
  connectionId: number,
  jid: string,
): GroupMetadata | undefined {
  const entry = groupMetadataByConnection.get(connectionId)?.get(jid);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    groupMetadataByConnection.get(connectionId)?.delete(jid);
    return undefined;
  }
  return entry.metadata;
}

export function cacheGroupMetadata(
  connectionId: number,
  metadata: GroupMetadata,
  ttlMs: number = GROUP_METADATA_TTL_MS,
): void {
  let connectionCache = groupMetadataByConnection.get(connectionId);
  if (!connectionCache) {
    connectionCache = new Map();
    groupMetadataByConnection.set(connectionId, connectionCache);
  }
  if (!connectionCache.has(metadata.id) && connectionCache.size >= MAX_GROUP_METADATA_ENTRIES_PER_CONNECTION) {
    const oldestKey = connectionCache.keys().next().value;
    if (oldestKey) connectionCache.delete(oldestKey);
  }
  connectionCache.set(metadata.id, {
    metadata,
    expiresAt: Date.now() + ttlMs,
  });
}

export function clearGroupSupportState(connectionId: number): void {
  groupChatsEnabledByConnection.delete(connectionId);
  groupMetadataByConnection.delete(connectionId);
}

export function serializeGroupMetadata(metadata: GroupMetadata, selfJid?: string): Record<string, unknown> {
  const selfParticipant = selfJid
    ? metadata.participants.find((participant: any) =>
        [participant.id, participant.phoneNumber, participant.lid]
          .filter(Boolean)
          .some((jid: string) => areJidsSameUser(jid, selfJid)))
    : undefined;
  const canSendMessages = metadata.announce !== true ||
    selfParticipant?.admin === 'admin' || selfParticipant?.admin === 'superadmin';
  return {
    id: metadata.id,
    subject: metadata.subject,
    subjectOwner: metadata.subjectOwner,
    subjectOwnerPn: metadata.subjectOwnerPn,
    subjectOwnerUsername: metadata.subjectOwnerUsername,
    subjectTime: metadata.subjectTime,
    creation: metadata.creation,
    desc: metadata.desc,
    descOwner: metadata.descOwner,
    descOwnerPn: metadata.descOwnerPn,
    descOwnerUsername: metadata.descOwnerUsername,
    descId: metadata.descId,
    descTime: metadata.descTime,
    owner: metadata.owner,
    ownerPn: metadata.ownerPn,
    ownerUsername: metadata.ownerUsername,
    addressingMode: metadata.addressingMode,
    announce: metadata.announce,
    restrict: metadata.restrict,
    memberAddMode: metadata.memberAddMode,
    joinApprovalMode: metadata.joinApprovalMode,
    isCommunity: metadata.isCommunity,
    isCommunityAnnounce: metadata.isCommunityAnnounce,
    linkedParent: metadata.linkedParent,
    size: metadata.size ?? metadata.participants.length,
    ephemeralDuration: metadata.ephemeralDuration,
    canSendMessages,
    participants: metadata.participants.map((participant) => ({ ...participant })),
  };
}
