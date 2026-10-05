/**
 * WhatsApp Group Chat Filter Utility
 * 
 * This utility provides functions to identify and filter out WhatsApp group chat messages
 * from the inbox system to prevent group chat data from being displayed in the chat list.
 */

/**
 * Checks whether an identifier is an actual WhatsApp group JID.
 *
 * @param phoneNumber - The phone number or identifier to check
 * @returns true if it matches WhatsApp group chat ID pattern
 */
export function isWhatsAppGroupChatId(phoneNumber: string | null | undefined): boolean {
  if (!phoneNumber || typeof phoneNumber !== 'string') {
    return false;
  }


  return phoneNumber.trim().toLowerCase().endsWith('@g.us');
}

/**
 * Checks if a group JID matches WhatsApp group chat pattern
 * 
 * @param groupJid - The group JID to check (e.g., "120363300968753311@g.us")
 * @returns true if it matches WhatsApp group chat pattern
 */
export function isWhatsAppGroupJid(groupJid: string | null | undefined): boolean {
  if (!groupJid) {
    return false;
  }


  return isWhatsAppGroupChatId(groupJid);
}

/**
 * Creates a SQL condition to filter out WhatsApp group chats from conversations
 * This can be used in database queries to exclude group chat conversations
 * 
 * @returns SQL condition string for filtering
 */
export function createGroupChatFilterCondition(): string {
  return `
    NOT (
      conversations.is_group = true 
      OR conversations.group_jid LIKE '%@g.us'
    )
  `;
}

/**
 * Filters an array of conversations to remove WhatsApp group chats
 *
 * @param conversations - Array of conversation objects
 * @returns Filtered array without group chat conversations
 */
export function filterGroupChatsFromConversations(conversations: any[]): any[] {
  if (!Array.isArray(conversations)) {
    console.warn('[WhatsApp Group Filter] Invalid conversations array provided');
    return [];
  }

  return conversations.filter(conversation => {
    if (!conversation) {
      return false;
    }


    if (conversation.is_group === true || conversation.isGroup === true) {
      logGroupChatFiltered(conversation.id || 'unknown', 'isGroup flag');
      return false;
    }


    if (conversation.group_jid || conversation.groupJid) {
      logGroupChatFiltered(conversation.group_jid || conversation.groupJid, 'groupJid presence');
      return false;
    }


    if (conversation.contact) {
      const phone = conversation.contact.phone || conversation.contact.identifier;
      if (isWhatsAppGroupChatId(phone)) {
        logGroupChatFiltered(phone, 'contact phone/identifier');
        return false;
      }
    }


    if (conversation.phone && isWhatsAppGroupChatId(conversation.phone)) {
      logGroupChatFiltered(conversation.phone, 'conversation phone');
      return false;
    }

    if (conversation.identifier && isWhatsAppGroupChatId(conversation.identifier)) {
      logGroupChatFiltered(conversation.identifier, 'conversation identifier');
      return false;
    }


    if (conversation.contactId === null && !conversation.isGroup && !conversation.is_group) {

      const suspiciousId = conversation.groupJid || conversation.group_jid ||
                          conversation.phone || conversation.identifier;
      if (suspiciousId && isWhatsAppGroupChatId(suspiciousId)) {
        logGroupChatFiltered(suspiciousId, 'suspicious null contactId');
        return false;
      }
    }

    return true;
  });
}

/**
 * Filters an array of contacts to remove WhatsApp group chat contacts
 *
 * @param contacts - Array of contact objects
 * @returns Filtered array without group chat contacts
 */
export function filterGroupChatsFromContacts(contacts: any[]): any[] {
  if (!Array.isArray(contacts)) {
    console.warn('[WhatsApp Group Filter] Invalid contacts array provided');
    return [];
  }

  return contacts.filter(contact => {
    if (!contact) {
      return false;
    }


    if (contact.phone && isWhatsAppGroupChatId(contact.phone)) {
      logGroupChatFiltered(contact.phone, 'contact phone');
      return false;
    }


    if (contact.identifier && isWhatsAppGroupChatId(contact.identifier)) {
      logGroupChatFiltered(contact.identifier, 'contact identifier');
      return false;
    }

    return true;
  });
}

/**
 * Logs when a group chat is filtered out (for debugging purposes)
 *
 * @param identifier - The group chat identifier that was filtered
 * @param context - Context where the filtering occurred
 */
export function logGroupChatFiltered(identifier: string, context: string): void {
  if (process.env.NODE_ENV === 'development') {

  }
}

/**
 * Validates if a conversation object should be treated as a group conversation
 * This is a comprehensive check that looks at all possible indicators
 *
 * @param conversation - The conversation object to validate
 * @returns true if the conversation is definitely a group conversation
 */
export function isGroupConversation(conversation: any): boolean {
  if (!conversation) {
    return false;
  }


  if (conversation.is_group === true || conversation.isGroup === true) {
    return true;
  }


  if (conversation.group_jid || conversation.groupJid) {
    return true;
  }


  if (conversation.contact) {
    const phone = conversation.contact.phone || conversation.contact.identifier;
    if (isWhatsAppGroupChatId(phone)) {
      return true;
    }
  }


  if (conversation.phone && isWhatsAppGroupChatId(conversation.phone)) {
    return true;
  }

  if (conversation.identifier && isWhatsAppGroupChatId(conversation.identifier)) {
    return true;
  }

  return false;
}

export default {
  isWhatsAppGroupChatId,
  isWhatsAppGroupJid,
  createGroupChatFilterCondition,
  filterGroupChatsFromConversations,
  filterGroupChatsFromContacts,
  logGroupChatFiltered,
  isGroupConversation
};
