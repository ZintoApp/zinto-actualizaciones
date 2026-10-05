/**
 * Phone number validation utilities.
 * Registration and E.164-sensitive flows use validatePhoneNumber() with libphonenumber-js.
 * Legacy regex-based isValidInternationalPhoneNumber is kept for non-registration use only.
 */

import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

/**
 * Legacy: checks if a phone number matches valid international phone number patterns (regex only).
 * Not used for registration; registration uses validatePhoneNumber() with libphonenumber-js.
 * @param phone - The phone number to validate (digits only)
 */
export function isValidInternationalPhoneNumber(phone: string): boolean {
  const numericOnly = phone.replace(/[^0-9]/g, '');
  if (numericOnly.length < 7 || numericOnly.length > 15) {
    return false;
  }
  const validCountryCodePatterns = [
    /^1[2-9]\d{9}$/, /^44[1-9]\d{8,9}$/, /^49[1-9]\d{8,10}$/, /^33[1-9]\d{8}$/, /^39[0-9]\d{6,10}$/,
    /^34[6-9]\d{8}$/, /^31[1-9]\d{8}$/, /^32[1-9]\d{7,8}$/, /^41[1-9]\d{8}$/, /^43[1-9]\d{6,10}$/,
    /^61[2-9]\d{8}$/, /^81[1-9]\d{8,9}$/, /^82[1-9]\d{7,8}$/, /^86[1-9]\d{9,10}$/, /^91[6-9]\d{9}$/,
    /^55[1-9]\d{8,9}$/, /^52[1-9]\d{9}$/, /^54[1-9]\d{8,9}$/, /^57[1-9]\d{7,9}$/, /^27[1-9]\d{8}$/,
    /^234[7-9]\d{9}$/, /^254[7]\d{8}$/, /^255[6-9]\d{8}$/, /^20[1-9]\d{8,9}$/, /^7[3-9]\d{9}$/,
    /^90[5]\d{9}$/, /^966[5]\d{8}$/, /^971[5]\d{8}$/, /^92[3]\d{9}$/, /^880[1]\d{8,9}$/, /^62[8]\d{8,10}$/,
    /^60[1]\d{7,8}$/, /^66[6-9]\d{8}$/, /^63[9]\d{9}$/, /^84[3-9]\d{8}$/, /^65[6-9]\d{7}$/,
  ];
  return validCountryCodePatterns.some(pattern => pattern.test(numericOnly));
}

export type ValidatePhoneNumberResult = { isValid: boolean; error?: string; e164?: string };

/**
 * Normalizes input for parsing: digits-only (no +) is treated as E.164 national/international
 * digits and prefixed with '+' so libphonenumber-js can parse. Backward-compatible for
 * callers that pass normalized numeric strings without a plus prefix.
 */
function normalizeInputForParsing(trimmed: string): string {
  const numericOnly = trimmed.replace(/[^0-9]/g, '');
  const isDigitsOnly = numericOnly.length > 0 && trimmed.replace(/\s/g, '') === numericOnly;
  if (!trimmed.startsWith('+') && isDigitsOnly) {
    return '+' + numericOnly;
  }
  return trimmed;
}

/**
 * Validates a phone number with libphonenumber-js (country-aware, E.164).
 * Backward-compatible: digits-only input is supported (normalized with '+' before parsing).
 * Registration and E.164 storage should pass international format and use returned e164.
 *
 * @param phone - The phone number to validate (E.164-style with +, or digits-only)
 * @returns Validation result and optional E.164 normalized number when valid
 */
export function validatePhoneNumber(phone: string | null | undefined): ValidatePhoneNumberResult {
  if (!phone) {
    return { isValid: true };
  }

  const trimmed = phone.trim();
  if (!trimmed) {
    return { isValid: true };
  }

  if (trimmed.startsWith('LID-')) {
    return {
      isValid: false,
      error: 'LID format phone numbers are not allowed'
    };
  }

  const parseInput = normalizeInputForParsing(trimmed);

  try {
    const parsed = parsePhoneNumber(parseInput);
    if (!parsed) {
      return { isValid: false, error: 'Invalid phone number' };
    }
    if (!isValidPhoneNumber(parsed.number)) {
      return { isValid: false, error: 'Phone number is not valid for this country or region' };
    }
    const e164 = parsed.format('E.164');
    if (!e164 || e164.length < 8) {
      return { isValid: false, error: 'Invalid phone number' };
    }
    const digits = e164.replace(/\D/g, '');
    if (digits.length > 15) {
      return { isValid: false, error: 'Phone number is too long (maximum 15 digits per E.164)' };
    }
    return { isValid: true, e164 };
  } catch {
    return { isValid: false, error: 'Please enter a valid phone number with country code' };
  }
}

/**
 * Creates a SQL condition to filter out invalid phone numbers
 * @returns SQL condition string for filtering
 */
export function createPhoneValidationSQLCondition(): string {
  return `
    (
      phone IS NULL 
      OR (
        phone NOT LIKE 'LID-%' 
        AND LENGTH(REGEXP_REPLACE(phone, '[^0-9]', '', 'g')) >= 7 
        AND LENGTH(REGEXP_REPLACE(phone, '[^0-9]', '', 'g')) <= 15
        AND NOT (LENGTH(REGEXP_REPLACE(phone, '[^0-9]', '', 'g')) >= 15 AND REGEXP_REPLACE(phone, '[^0-9]', '', 'g') ~ '^120[0-9]+$')
      )
    )
  `;
}

export default {
  isValidInternationalPhoneNumber,
  validatePhoneNumber,
  createPhoneValidationSQLCondition
};
