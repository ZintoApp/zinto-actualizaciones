import type { ValidationSection } from './ValidationSummary';
import type { VoiceProviderStack } from '@shared/types/call-types';

export type VoiceConnectionTranslateFn = (key: string, fallback?: string, variables?: Record<string, unknown>) => string;

export function mapVoiceConnectionValidationSections(report: any, t: VoiceConnectionTranslateFn): ValidationSection[] {
  if (!report) return [];
  const telephonyProvider = report.telephony?.provider || t('settings.voiceConnectionForm.fallback.telephony');
  const aiProviderName = report.aiProvider?.provider || t('settings.voiceConnectionForm.fallback.aiProvider');
  const sections = [
    ['telephony', t('settings.voiceConnectionForm.validationSection.telephony', undefined, { provider: telephonyProvider })],
    ['twimlApp', t('settings.voiceConnectionForm.validationSection.twimlApp')],
    ['voiceSdk', t('settings.voiceConnectionForm.validationSection.voiceSdk')],
    ['aiProvider', t('settings.voiceConnectionForm.validationSection.aiProviderSection', undefined, { provider: aiProviderName })],
    ['webhooks', t('settings.voiceConnectionForm.validationSection.webhooks')],
  ] as const;
  return sections.flatMap(([key, label]) => {
    const section = report[key];
    if (!section) return [];
    let status: ValidationSection['status'] = section.valid ? (section.error ? 'warning' : 'valid') : 'error';
    const baseMessage = section.error || section.appName || section.accountInfo?.friendlyName;
    let message: string | undefined = baseMessage;
    if (key === 'twimlApp') {
      const ta = report.twimlApp;
      const mismatch = ta.voiceUrlConfigured === false || ta.voiceUrlMatch === false;
      const aligned = ta.voiceUrlConfigured === true || ta.voiceUrlMatch === true;
      const configured = ta.configuredVoiceUrl ?? ta.voiceUrl;
      if (mismatch && ta.expectedVoiceUrl != null && configured != null) {
        status = 'error';
        const mismatchText = t('settings.voiceConnectionForm.twimlUrlMismatch', undefined, {
          expected: ta.expectedVoiceUrl,
          got: configured,
        });
        message = message ? `${message}. ${mismatchText}` : mismatchText;
      } else if (aligned) {
        const ok = t('settings.voiceConnectionForm.twimlUrlOk');
        message = message ? `${message}. ${ok}` : ok;
      }
    }
    return [{ key, label, status, responseTime: section.responseTime, message, recommendedActions: report.recommendations || [] } as ValidationSection];
  });
}

export function voiceConnectionProviderStackLabelKey(providerStack: VoiceProviderStack): string {
  return providerStack === 'telnyx-vapi'
    ? 'settings.voiceConnectionForm.providerStack.telnyxVapi'
    : 'settings.voiceConnectionForm.providerStack.twilioElevenlabs';
}
