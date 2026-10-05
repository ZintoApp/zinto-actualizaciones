export const DEFAULT_RECENT_CONTACT_HOURS = 24;

export function getContactUnreadCounts(conversations: Array<{
  contactId: number | null; unreadCount: number | null; companyId: number | null;
  assignedToUserId: number | null; isGroup?: boolean | null; groupJid?: string | null;
}>, user: { id: number; companyId: number | null; role: string; isSuperAdmin?: boolean | null }, canViewAll: boolean): Record<number, number> {
  const counts: Record<number, number> = {};
  for (const conversation of conversations) {
    if (!conversation.contactId || !canOpenFollowUpConversation(conversation, user, canViewAll)) continue;
    counts[conversation.contactId] = (counts[conversation.contactId] ?? 0) + Math.max(0, conversation.unreadCount ?? 0);
  }
  return counts;
}

export function canOpenFollowUpConversation(conversation: {
  companyId: number | null; assignedToUserId: number | null; isGroup?: boolean | null; groupJid?: string | null;
}, user: { id: number; companyId: number | null; role: string; isSuperAdmin?: boolean | null }, canViewAll: boolean): boolean {
  return conversation.companyId === user.companyId && !!user.companyId && !conversation.isGroup && !conversation.groupJid &&
    (user.isSuperAdmin === true || user.role === 'admin' || canViewAll || conversation.assignedToUserId === user.id);
}

export function isHumanContact(message: {
  direction?: string | null; senderType?: string | null; isFromBot?: boolean | null;
  status?: string | null; type?: string | null;
}): boolean {
  return message.direction === 'outbound' && message.senderType === 'user' &&
    message.isFromBot !== true && ['sent', 'delivered', 'read'].includes(message.status ?? '') &&
    !['call', 'system', 'note'].includes(message.type ?? '');
}

export function sortFollowUpQueue<T extends { id: number; createdAt: Date | string; lastContactedAt?: Date | string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aTime = a.lastContactedAt ? new Date(a.lastContactedAt).getTime() : -Infinity;
    const bTime = b.lastContactedAt ? new Date(b.lastContactedAt).getTime() : -Infinity;
    return (aTime === bTime ? 0 : aTime < bTime ? -1 : 1) ||
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() || a.id - b.id;
  });
}

export function orderFollowUpConversations<T extends { id: number; status: string | null; lastMessageAt: Date | string | null }>(items: T[]): T[] {
  const active = (status: string | null) => status === 'open' || status === 'active';
  return [...items].sort((a, b) => Number(active(b.status)) - Number(active(a.status)) ||
    new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime() || b.id - a.id);
}
