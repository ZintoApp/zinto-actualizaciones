export interface ConversationBotState {
  assignedToUserId?: number | null;
  botDisabled?: boolean | null;
  disabledAt?: Date | string | null;
  disableDuration?: number | null;
}

/**
 * Returns whether automation is currently paused for a conversation.
 * Assignment is intentionally not part of bot state: it controls ownership only.
 */
export function isConversationBotPauseActive(
  conversation: ConversationBotState,
  now: Date = new Date(),
): boolean {
  if (conversation.botDisabled !== true) {
    return false;
  }

  if (conversation.disableDuration && conversation.disabledAt) {
    const disabledAtMs = new Date(conversation.disabledAt).getTime();
    if (Number.isFinite(disabledAtMs)) {
      const expiresAtMs = disabledAtMs + conversation.disableDuration * 60 * 1000;
      if (now.getTime() > expiresAtMs) {
        return false;
      }
    }
  }

  return true;
}
