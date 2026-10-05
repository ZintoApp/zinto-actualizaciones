import React, { useEffect, useState } from 'react';
import { Building2, CalendarClock, User, Variable } from 'lucide-react';
import { useTranslation } from '@/hooks/use-translation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { DENTAL_REMINDER_VARIABLES } from '@shared/types/dental-reminder-types';

const variableDetails: Record<typeof DENTAL_REMINDER_VARIABLES[number], [string, string]> = {
  'contact.name': ['Patient name', 'Full name of the patient'],
  'contact.phone': ['Patient phone', 'Phone number of the patient'],
  'contact.email': ['Patient email', 'Email address of the patient'],
  'appointment.date': ['Appointment date', 'Date in the clinic’s time zone'],
  'appointment.start_time': ['Start time', 'Appointment start time'],
  'appointment.end_time': ['End time', 'Appointment end time'],
  'appointment.duration': ['Duration', 'Appointment length in minutes'],
  'appointment.service': ['Service', 'Name of the booked service'],
  'appointment.provider': ['Provider', 'Name of the assigned dentist'],
  'appointment.office': ['Office', 'Office assigned to the appointment'],
  'appointment.status': ['Status', 'Current appointment status'],
  'appointment.notes': ['Notes', 'Notes saved with the appointment'],
  'company.name': ['Clinic name', 'Name of the clinic'],
  'company.timezone': ['Clinic time zone', 'Time zone used for appointment times'],
};

/** Flow Builder's variable-menu presentation, restricted to the reminder renderer's variables. */
export function ReminderVariablePicker({ disabled, onInsert, showLabel = false, domain = 'dental' }: { domain?: 'dental' | 'real_estate'; disabled: boolean; onInsert: (text: string) => void; showLabel?: boolean }) {
  const { t: translate, currentLanguage } = useTranslation();
  const t = (key: string, fallback?: string) => translate(domain === 'real_estate' ? key.replace('erp.dental.reminders','erp.realEstate.reminders') : key, fallback);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const label = t('erp.dental.reminders.variables.insert', currentLanguage?.code?.startsWith('es') ? 'Insertar variable' : 'Insert variable');
  const groups = [
    { prefix: 'contact', label: t('erp.dental.reminders.variables.patient', 'Patient'), Icon: User },
    { prefix: 'appointment', label: t('erp.dental.reminders.variables.appointment', 'Appointment'), Icon: CalendarClock },
    { prefix: 'company', label: t('erp.dental.reminders.variables.clinic', 'Clinic'), Icon: Building2 },
  ];
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  return <Popover open={open && !disabled} onOpenChange={next => {
    setOpen(next && !disabled);
    setSearch('');
  }}>
    <PopoverTrigger asChild>
      <Button type="button" variant="outline" size="sm" className="h-8 px-2 flex items-center gap-1 shrink-0 self-start"
        title={label} aria-label={label} disabled={disabled}>
        <Variable className="w-3 h-3" aria-hidden="true" />
        {showLabel && <span>{label}</span>}
      </Button>
    </PopoverTrigger>
    <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] max-h-[var(--radix-popover-content-available-height)] overflow-hidden p-0" align="end"
      aria-label={label} collisionPadding={16}>
      <Command>
        <div className="flex items-center gap-2 p-2 border-b">
          <CommandInput value={search} onValueChange={setSearch} className="flex-1 min-w-0"
            placeholder={t('erp.dental.reminders.variables.search', 'Search variables...')}
            aria-label={t('erp.dental.reminders.variables.search', 'Search variables...')} />
        </div>
        <CommandList className="max-h-[min(300px,calc(var(--radix-popover-content-available-height)-64px))]">
          <CommandEmpty><span className="text-xs">{t('erp.dental.reminders.variables.empty', 'No variables found.')}</span></CommandEmpty>
          {groups.map(({ prefix, label: groupLabel, Icon }) => <CommandGroup key={prefix}
            heading={<div className="flex items-center gap-2"><Icon className="h-3 w-3" aria-hidden="true" /><span>{groupLabel}</span></div>}>
            {DENTAL_REMINDER_VARIABLES.filter(variable => variable.startsWith(`${prefix}.`)).map(variable => {
              const [fallbackLabel, fallbackDescription] = variableDetails[variable];
              const name = t(`erp.dental.reminders.variables.${variable}.label`, fallbackLabel);
              const description = t(`erp.dental.reminders.variables.${variable}.description`, fallbackDescription);
              return <CommandItem key={variable} value={variable} keywords={[name, description, groupLabel]}
                className="flex items-center gap-3 p-3" disabled={disabled} onSelect={() => {
                  if (disabled) return;
                  onInsert(`{{${variable}}}`);
                  setOpen(false);
                  setSearch('');
                }}>
                <div className="flex min-w-0 items-center gap-2 flex-1">
                  <Icon className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    <div className="font-medium text-xs">{name}</div>
                    <div className="text-xs text-muted-foreground">{description}</div>
                  </div>
                  <Badge variant="secondary" className="max-w-[60%] shrink-0 whitespace-normal break-all text-xs font-mono">{`{{${variable}}}`}</Badge>
                </div>
              </CommandItem>;
            })}
          </CommandGroup>)}
        </CommandList>
      </Command>
    </PopoverContent>
  </Popover>;
}
