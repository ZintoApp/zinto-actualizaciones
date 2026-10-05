/**
 * Pipeline-board deal visibility: matches DatabaseStorage.buildDealFilterConditions().
 */
export function isPipelineBoardDealStatus(status: string): boolean {
  return status !== 'archived';
}

export function shouldRefreshPipelineAudienceBeforeQueue(input: {
  status: string;
  pipelineStageIds: unknown;
}): boolean {
  if (input.status === 'completed' || input.status === 'cancelled') {
    return false;
  }

  if (!Array.isArray(input.pipelineStageIds) || input.pipelineStageIds.length === 0) {
    return false;
  }

  return input.pipelineStageIds.some((value) => {
    if (typeof value === 'number') {
      return Number.isSafeInteger(value) && value > 0;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed !== '' && /^\d+$/.test(trimmed) && Number(trimmed) > 0;
    }
    return false;
  });
}

/**
 * Audience refresh adds eligible contacts with no existing recipient row.
 * Skipped (and all other existing) rows are preserved and never revived.
 */
export function filterContactsWithoutExistingRecipients<T extends { id: number }>(
  eligibleContacts: T[],
  existingRecipients: Array<{ contactId: number | null }>,
): T[] {
  const existingContactIds = new Set(
    existingRecipients
      .map((recipient) => recipient.contactId)
      .filter((contactId): contactId is number => contactId != null),
  );

  return eligibleContacts.filter((contact) => !existingContactIds.has(contact.id));
}
