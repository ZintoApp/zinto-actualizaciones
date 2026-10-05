import { storage } from '../storage';
import { stampDentalReminderActivation, validateDentalReminderDeliverySettings } from '../../shared/types/dental-reminder-types';
import { getDentalReminderOptions } from './dental-reminder-configuration';
import {
  DENTAL_BOOKING_POLICY_SETTING_KEY,
  createDefaultDentalBookingPolicy,
  parseDentalBookingPolicy,
  validateDentalBookingPolicy,
  type DentalBookingPolicy,
} from '@shared/types/dental-booking-types';

/**
 * Reads the company dental booking policy, falling back to product defaults when the
 * setting has never been written. Never throws on malformed stored JSON — the lenient
 * parser salvages what it can so a bad blob cannot take the schedule down.
 */
export async function getDentalBookingPolicy(companyId: number): Promise<DentalBookingPolicy> {
  const setting = await storage.getCompanySetting(companyId, DENTAL_BOOKING_POLICY_SETTING_KEY);
  if (!setting) return createDefaultDentalBookingPolicy();
  return parseDentalBookingPolicy(setting.value);
}

export type SaveDentalBookingPolicyResult =
  | { success: true; policy: DentalBookingPolicy }
  | { success: false; errors: Array<{ path: string; message: string }> };

/**
 * Strictly validates and persists the policy. Callers get structured errors rather than a
 * thrown ZodError so route handlers can shape their own responses.
 */
export async function saveDentalBookingPolicy(
  companyId: number,
  value: unknown,
): Promise<SaveDentalBookingPolicyResult> {
  const parsed = validateDentalBookingPolicy(value);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  const previous = await getDentalBookingPolicy(companyId);
  const options = parsed.data.automaticReminders.enabled ? await getDentalReminderOptions(companyId) : { connections: [], templates: [] };
  if (parsed.data.automaticReminders.enabled) {
    const applicable = new Set(options.connections.filter(channel => channel.channelType === 'whatsapp_official' &&
      (parsed.data.automaticReminders.channelMode === 'latest_conversation' || channel.id === parsed.data.automaticReminders.channelConnectionId))
      .map(channel => String(channel.id)));
    parsed.data.automaticReminders.rules.forEach(rule => {
      rule.officialTemplates = Object.fromEntries(Object.entries(rule.officialTemplates).filter(([id]) => applicable.has(id)));
    });
  }
  const errors = validateDentalReminderDeliverySettings(parsed.data.automaticReminders, options);
  if (errors.length) return { success: false, errors };
  parsed.data.automaticReminders = stampDentalReminderActivation(parsed.data.automaticReminders, previous.automaticReminders, new Date());
  await storage.saveCompanySetting(companyId, DENTAL_BOOKING_POLICY_SETTING_KEY, parsed.data);
  return { success: true, policy: parsed.data };
}

export { DENTAL_BOOKING_POLICY_SETTING_KEY };
