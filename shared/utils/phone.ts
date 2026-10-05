/**
 * Normalize phone number to E.164 format for WhatsApp sending
 * This function always enforces E.164 format (with + prefix) for numbers >= 10 digits.
 * Use this for WhatsApp API calls and external messaging.
 * 
 * @param phone The phone number to normalize
 * @returns Normalized phone number in E.164 format
 */
export function normalizePhoneToE164(phone: string): string {
  if (!phone) return '';


  let cleaned = phone.replace(/[^\d+]/g, '');


  if (!cleaned.startsWith('+')) {
    cleaned = cleaned.replace(/^0+/, '');
  }


  if (!cleaned.startsWith('+') && cleaned.length >= 10) {
    cleaned = '+' + cleaned;
  }

  return cleaned;
}

/**
 * Normalize phone number for internal operations (deduplication, matching)
 * This preserves the legacy behavior where numbers <= 10 digits don't get a + prefix.
 * Use this for internal contact deduplication and matching operations.
 * 
 * @param phone The phone number to normalize
 * @returns Normalized phone number (may not have + prefix for short numbers)
 */
export function normalizePhoneForInternal(phone: string): string {
  if (!phone) return '';

  let normalized = phone.replace(/[^\d+]/g, '');

  if (normalized.startsWith('+')) {
    return normalized;
  } else {
    normalized = normalized.replace(/^0+/, ''); // Removes leading zeros
    if (normalized.length > 10) {
      return '+' + normalized;
    }
    return normalized; // Returns without + for numbers <= 10 digits
  }
}

