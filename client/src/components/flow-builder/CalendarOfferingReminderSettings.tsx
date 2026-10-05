import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslation } from '@/hooks/use-translation';
import type { CalendarOfferingSettings, CalendarReminderSettings, ShortNoticePolicy } from '@shared/types/calendar-types';
import {
  createDefaultOfferingSettings,
  createDefaultReminderSettings,
  DEFAULT_MAX_OFFERED_SLOTS,
  MAX_OFFERED_SLOTS_LIMIT,
  MIN_OFFERED_SLOTS_LIMIT,
} from '@shared/types/calendar-types';
import { MESSAGE_TRIGGER_DEFAULT_CHANNEL_FALLBACK } from '@shared/types/node-types';

interface CalendarOfferingReminderSettingsProps {
  offering: CalendarOfferingSettings;
  reminder: CalendarReminderSettings;
  onOfferingChange: (next: CalendarOfferingSettings) => void;
  onReminderChange: (next: CalendarReminderSettings) => void;
  disabled?: boolean;
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp_official: 'WhatsApp Official',
  whatsapp_unofficial: 'WhatsApp Unofficial',
  messenger: 'Messenger',
  instagram: 'Instagram',
  twilio_sms: 'Twilio SMS',
};

export function CalendarOfferingReminderSettings({
  offering,
  reminder,
  onOfferingChange,
  onReminderChange,
  disabled = false,
}: CalendarOfferingReminderSettingsProps) {
  const { t } = useTranslation();
  const safeOffering = offering ?? createDefaultOfferingSettings();
  const safeReminder = reminder ?? createDefaultReminderSettings();

  return (
    <div className="space-y-3 border-t pt-3 mt-3">
      <h4 className="text-xs font-semibold text-foreground">
        {t('flow_builder.ai_calendar_offering_reminders', 'Offering & reminders')}
      </h4>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">
            {t('flow_builder.ai_calendar_max_slots', 'Max time options')}
          </Label>
          <Input data-tour="components-flow-builder-calendarofferingremindersettings.input.flow_builder.ai_calendar_max_slots"
            type="number"
            min={MIN_OFFERED_SLOTS_LIMIT}
            max={MAX_OFFERED_SLOTS_LIMIT}
            value={safeOffering.maxOfferedSlots ?? DEFAULT_MAX_OFFERED_SLOTS}
            disabled={disabled}
            className="h-7 text-xs"
            onChange={(e) => {
              const raw = Number(e.target.value);
              const clamped = Math.min(
                MAX_OFFERED_SLOTS_LIMIT,
                Math.max(MIN_OFFERED_SLOTS_LIMIT, Number.isFinite(raw) ? Math.floor(raw) : DEFAULT_MAX_OFFERED_SLOTS)
              );
              onOfferingChange({ maxOfferedSlots: clamped });
            }}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">
            {t('flow_builder.ai_calendar_reminders_enabled', 'Reminders')}
          </Label>
          <div className="flex items-center h-7">
            <Switch
              checked={safeReminder.enabled !== false}
              disabled={disabled}
              onCheckedChange={(checked) =>
                onReminderChange({ ...safeReminder, enabled: checked })
              }
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">
            {t('flow_builder.ai_calendar_reminder_lead_hours', 'Reminder lead time (hours)')}
          </Label>
          <Input data-tour="components-flow-builder-calendarofferingremindersettings.input.flow_builder.ai_calendar_max_slots"
            type="number"
            min={1}
            value={safeReminder.leadTimeHours ?? 10}
            disabled={disabled || safeReminder.enabled === false}
            className="h-7 text-xs"
            onChange={(e) => {
              const raw = Number(e.target.value);
              onReminderChange({
                ...safeReminder,
                leadTimeHours: Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 10,
              });
            }}
          />
        </div>

        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">
            {t('flow_builder.ai_calendar_short_notice_policy', 'Short-notice policy')}
          </Label>
          <Select
            value={safeReminder.shortNoticePolicy ?? 'skip'}
            disabled={disabled || safeReminder.enabled === false}
            onValueChange={(value: ShortNoticePolicy) =>
              onReminderChange({ ...safeReminder, shortNoticePolicy: value })
            }
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="skip">{t('flow_builder.ai_calendar_policy_skip', 'Skip')}</SelectItem>
              <SelectItem value="immediate">{t('flow_builder.ai_calendar_policy_immediate', 'Immediate')}</SelectItem>
              <SelectItem value="clamp">{t('flow_builder.ai_calendar_policy_clamp', 'Clamp')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {safeReminder.shortNoticePolicy === 'clamp' && (
          <div className="space-y-1">
            <Label className="text-[10px] text-muted-foreground">
              {t('flow_builder.ai_calendar_clamp_floor', 'Clamp floor (minutes before)')}
            </Label>
            <Input data-tour="components-flow-builder-calendarofferingremindersettings.input.flow_builder.ai_calendar_clamp_floor"
              type="number"
              min={1}
              value={safeReminder.clampFloorMinutes ?? 30}
              disabled={disabled || safeReminder.enabled === false}
              className="h-7 text-xs"
              onChange={(e) => {
                const raw = Number(e.target.value);
                onReminderChange({
                  ...safeReminder,
                  clampFloorMinutes: Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 30,
                });
              }}
            />
          </div>
        )}

        <div className="space-y-1 col-span-2">
          <Label className="text-[10px] text-muted-foreground">
            {t('flow_builder.ai_calendar_channel_override', 'Channel override (optional)')}
          </Label>
          <Select
            value={safeReminder.channelOverride || '__same__'}
            disabled={disabled || safeReminder.enabled === false}
            onValueChange={(value) =>
              onReminderChange({
                ...safeReminder,
                channelOverride: value === '__same__' ? null : value,
              })
            }
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__same__">
                {t('flow_builder.ai_calendar_channel_same', '(same as booking conversation)')}
              </SelectItem>
              {MESSAGE_TRIGGER_DEFAULT_CHANNEL_FALLBACK.map((ch) => (
                <SelectItem key={ch} value={ch}>
                  {CHANNEL_LABELS[ch] || ch}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1 col-span-2">
          <Label className="text-[10px] text-muted-foreground">
            {t('flow_builder.ai_calendar_reminder_template', 'Reminder template')}
          </Label>
          <Textarea data-tour="components-flow-builder-calendarofferingremindersettings.textarea.flow_builder.ai_calendar_max_slots"
            rows={3}
            value={safeReminder.messageTemplate}
            disabled={disabled || safeReminder.enabled === false}
            className="text-xs"
            onChange={(e) =>
              onReminderChange({ ...safeReminder, messageTemplate: e.target.value })
            }
            placeholder="Reminder: you have an appointment on {{date}} at {{time}} ({{timezone}})."
          />
          <p className="text-[10px] text-muted-foreground">
            {t(
              'flow_builder.ai_calendar_reminder_placeholders',
              'Placeholders: {{date}}, {{time}}, {{timezone}}, {{title}}'
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
