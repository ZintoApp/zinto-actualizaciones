import React from 'react';
import { useTranslation } from '@/hooks/use-translation';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ReminderVariablePicker } from './ReminderVariablePicker';
import { dentalTemplateDefinitions, type DentalReminderOptions, type DentalReminderRule } from '@shared/types/dental-reminder-types';
import { mappingToTemplateExpression } from '@shared/whatsapp-template-variables';

export function ReminderTemplateFields({ rule, options, channelMode, channelConnectionId, disabled, onChange, domain = 'dental' }: {
  rule: Pick<DentalReminderRule, 'id' | 'officialTemplates'>; options: DentalReminderOptions;
  domain?: 'dental' | 'real_estate'; channelMode: string; channelConnectionId: number | null; disabled: boolean;
  onChange: (templates: DentalReminderRule['officialTemplates']) => void;
}) {
  const { t } = useTranslation();
  const officials = options.connections.filter(c => c.channelType === 'whatsapp_official' &&
    (channelMode === 'latest_conversation' || channelConnectionId === c.id));
  return <>{officials.map(channel => {
    const mapping = rule.officialTemplates[String(channel.id)];
    const templates = options.templates.filter(template => template.connectionId === channel.id);
    const selected = templates.find(template => template.id === mapping?.templateId);
    return <div key={channel.id} className="min-w-0 space-y-3 border-t pt-4 [overflow-wrap:anywhere]">
      <Label htmlFor={`official-${rule.id}-${channel.id}`}>{channel.accountName} — {t('erp.dental.reminders.approvedTemplate', 'Approved WhatsApp template')}</Label>
      <Select value={mapping ? String(mapping.templateId) : ''} disabled={disabled} onValueChange={id => {
        const nextTemplate = templates.find(template => template.id === Number(id));
        onChange({
          ...rule.officialTemplates, [channel.id]: {
            templateId: Number(id),
            values: nextTemplate ? Object.fromEntries(dentalTemplateDefinitions(nextTemplate).map(definition => [
              definition.id,
              mappingToTemplateExpression(nextTemplate.whatsappTemplateVariableMappings?.[definition.id]),
            ]).filter(([, value]) => value)) : {},
          },
        });
      }}>
        <SelectTrigger data-tour="components-erp-dental-remindertemplatefields.selecttrigger.erp.dental.reminders.chooseTemplate" id={`official-${rule.id}-${channel.id}`}><SelectValue placeholder={t('erp.dental.reminders.chooseTemplate', 'Choose an approved text template')} /></SelectTrigger>
        <SelectContent>{templates.map(template => <SelectItem key={template.id} value={String(template.id)}>{template.name} ({template.whatsappTemplateLanguage || 'en'})</SelectItem>)}</SelectContent>
      </Select>
      {!templates.length && <p className="text-xs text-amber-700 dark:text-amber-400">{t('erp.dental.reminders.noTemplates', 'No approved text templates are available for this connection. Create or sync a template before enabling reminders.')}</p>}
      {selected && <p className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{selected.content}</p>}
      {selected && dentalTemplateDefinitions(selected).map(definition => {
        const setValue = (value: string) => onChange({ ...rule.officialTemplates,
          [channel.id]: { ...mapping, values: { ...mapping.values, [definition.id]: value } } });
        return <div key={definition.id} className="space-y-2">
          <Label htmlFor={`template-${rule.id}-${channel.id}-${definition.id}`}>{definition.id}</Label>
          <div className="flex min-w-0 items-center gap-2">
            <Input className="min-w-0 flex-1" id={`template-${rule.id}-${channel.id}-${definition.id}`} value={mapping?.values[definition.id] || ''}
              disabled={disabled} placeholder="{{appointment.start_time}}" onChange={event => setValue(event.target.value)} />
            <ReminderVariablePicker domain={domain} disabled={disabled} onInsert={text => setValue((mapping?.values[definition.id] || '') + text)} />
          </div>
        </div>;
      })}
      <p className="text-xs text-muted-foreground">{t('erp.dental.reminders.templateHelp', 'WhatsApp Official always uses this approved template, even inside the 24-hour messaging window. Map every variable using placeholders or fixed text.')}</p>
    </div>;
  })}</>;
}
