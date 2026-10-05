import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useTranslation } from '@/hooks/use-translation';
import { WeeklyScheduleEditor } from '@/components/flow-builder/WeeklyScheduleEditor';
import { TimezoneSelector } from '@/components/ui/TimezoneSelector';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Calendar as TabIconCalendar,
  SlidersHorizontal as TabIconSlidersHorizontal,
} from 'lucide-react';
import {
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_WEEKLY_SCHEDULE,
  type CalendarAdvancedSettings,
  type DaySchedule,
} from '@shared/types/calendar-types';
import type { AgentInboxAvailabilitySettings } from '@shared/schema';

type ScheduleMode = 'simple' | 'advanced';

type InboxAvailabilitySettingsResponse = {
  settings: AgentInboxAvailabilitySettings | null;
  defaultSchedule: {
    timezone?: string;
  };
  inboxAvailabilityEnabled: boolean;
};

export interface InboxAvailabilitySettingsFormProps {
  presentation?: 'default' | 'profile';
  userId?: number;
  adminMode?: boolean;
  onSaved?: () => void;
}

export function InboxAvailabilitySettingsForm({
  userId,
  adminMode = false,
  onSaved,
  presentation = 'default',
}: InboxAvailabilitySettingsFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('simple');
  const [isScheduleEnabled, setIsScheduleEnabled] = useState(true);
  const [isOnDuty, setIsOnDuty] = useState(true);
  const [timezone, setTimezone] = useState('UTC');
  const [businessHoursStart, setBusinessHoursStart] = useState(DEFAULT_BUSINESS_HOURS.start);
  const [businessHoursEnd, setBusinessHoursEnd] = useState(DEFAULT_BUSINESS_HOURS.end);
  const [weeklySchedule, setWeeklySchedule] = useState<DaySchedule[]>(DEFAULT_WEEKLY_SCHEDULE);
  const [offDays, setOffDays] = useState<number[]>([0, 6]);

  const settingsQueryKey = adminMode && userId
    ? ['agent-inbox-availability-admin', userId]
    : ['agent-inbox-availability-settings'];

  const {
    data,
    isLoading,
    isError,
  } = useQuery<InboxAvailabilitySettingsResponse>({
    queryKey: settingsQueryKey,
    queryFn: async () => {
      if (adminMode && userId) {
        const teamRes = await apiRequest('GET', '/api/company/agents/inbox-availability');
        if (!teamRes.ok) {
          throw new Error('Failed to fetch team availability');
        }
        const teamPayload = await teamRes.json();
        const member = (teamPayload.data || []).find((row: { userId: number }) => row.userId === userId);
        return {
          settings: member?.availabilitySettings ?? null,
          defaultSchedule: teamPayload.defaultSchedule ?? {},
          inboxAvailabilityEnabled: teamPayload.inboxAvailabilityEnabled === true,
        };
      }

      const res = await apiRequest('GET', '/api/agent/inbox-availability/settings');
      if (!res.ok) {
        throw new Error('Failed to fetch inbox availability settings');
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (!data) return;

    const settings = data.settings;
    setTimezone(settings?.timezone || data.defaultSchedule?.timezone || 'UTC');
    setIsOnDuty(settings?.isOnDuty !== false);
    setIsScheduleEnabled(settings?.isScheduleEnabled !== false);
    setBusinessHoursStart(settings?.businessHoursStart || DEFAULT_BUSINESS_HOURS.start);
    setBusinessHoursEnd(settings?.businessHoursEnd || DEFAULT_BUSINESS_HOURS.end);
    setScheduleMode(settings?.scheduleMode === 'advanced' ? 'advanced' : 'simple');

    if (settings?.advancedSettings?.weeklySchedule?.length) {
      setWeeklySchedule(settings.advancedSettings.weeklySchedule);
      setOffDays(settings.advancedSettings.offDays || []);
    } else {
      setWeeklySchedule(DEFAULT_WEEKLY_SCHEDULE);
      setOffDays([0, 6]);
    }
  }, [data]);

  const dutyMutation = useMutation({
    mutationFn: async (nextOnDuty: boolean) => {
      const res = await apiRequest('PATCH', '/api/agent/inbox-availability/duty-status', {
        isOnDuty: nextOnDuty,
      });
      if (!res.ok) {
        throw new Error('Failed to update duty status');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['/api/agents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/company/agents/inbox-availability'] });
    },
    onError: () => {
      toast({
        variant: 'destructive',
        title: t('inbox_availability.duty_error_title', 'Failed to update duty status'),
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const advancedSettings: CalendarAdvancedSettings = {
        weeklySchedule,
        offDays,
      };

      const payload = {
        isScheduleEnabled,
        isOnDuty,
        timezone,
        businessHoursStart,
        businessHoursEnd,
        advancedSettings,
        scheduleMode,
      };

      const endpoint = adminMode && userId
        ? `/api/company/agents/${userId}/inbox-availability`
        : '/api/agent/inbox-availability/settings';
      const method = adminMode && userId ? 'PUT' : 'PUT';

      const res = await apiRequest(method, endpoint, payload);
      if (!res.ok) {
        throw new Error('Failed to save inbox availability settings');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsQueryKey });
      queryClient.invalidateQueries({ queryKey: ['/api/agents'] });
      queryClient.invalidateQueries({ queryKey: ['/api/company/agents/inbox-availability'] });
      toast({
        title: t('inbox_availability.saved_title', 'Availability settings saved'),
      });
      onSaved?.();
    },
    onError: () => {
      toast({
        variant: 'destructive',
        title: t('inbox_availability.save_error_title', 'Failed to save availability settings'),
      });
    },
  });

  const companyFeatureDisabled = data?.inboxAvailabilityEnabled === false;

  const statusBadge = useMemo(() => {
    if (companyFeatureDisabled) {
      return (
        <Badge variant="secondary">
          {t('inbox_availability.company_feature_disabled', 'Company availability routing is off')}
        </Badge>
      );
    }
    if (!isOnDuty) {
      return <Badge variant="destructive">{t('inbox_availability.off_duty', 'Off duty')}</Badge>;
    }
    return <Badge variant="default">{t('inbox_availability.on_duty', 'On duty')}</Badge>;
  }, [companyFeatureDisabled, isOnDuty, t]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t('inbox_availability.load_error', 'Failed to load availability settings.')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="min-w-0 space-y-4 sm:space-y-6">
      <Card className={presentation === 'profile' ? 'profile-card min-w-0 overflow-hidden' : 'min-w-0 overflow-hidden'}>
        <CardHeader className={presentation === 'profile' ? 'profile-card-header' : 'p-4 pb-3 sm:p-6 sm:pb-4'}>
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center sm:gap-4">
            <div className="min-w-0">
              <CardTitle className={presentation === 'profile' ? 'profile-card-title' : undefined}>{t('inbox_availability.title', 'Inbox Availability')}</CardTitle>
              <CardDescription>
                {t(
                  'inbox_availability.description',
                  'Control when you can be assigned conversations in the inbox.'
                )}
              </CardDescription>
            </div>
            <div className="shrink-0">{statusBadge}</div>
          </div>
        </CardHeader>
        <CardContent className={presentation === 'profile' ? 'profile-card-content space-y-6' : 'min-w-0 space-y-5 p-4 pt-0 sm:space-y-6 sm:p-6 sm:pt-0'}>
          {companyFeatureDisabled && (
            <p className="text-sm text-muted-foreground">
              {t(
                'inbox_availability.company_disabled_hint',
                'Your company has not enabled availability-based assignment yet. You can still configure your schedule for when it is turned on.'
              )}
            </p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Switch
                id="inbox-on-duty"
                checked={isOnDuty}
                disabled={adminMode || dutyMutation.isPending}
                onCheckedChange={(checked) => {
                  setIsOnDuty(checked);
                  if (!adminMode) {
                    dutyMutation.mutate(checked);
                  }
                }}
              />
              <Label htmlFor="inbox-on-duty" className="min-w-0 break-words">
                {t('inbox_availability.on_duty_label', 'On duty for inbox assignments')}
              </Label>
            </div>

            <div className="flex min-w-0 items-center gap-3">
              <Switch
                id="inbox-schedule-enabled"
                checked={isScheduleEnabled}
                onCheckedChange={(checked) => setIsScheduleEnabled(!!checked)}
              />
              <Label htmlFor="inbox-schedule-enabled" className="min-w-0 break-words">
                {t('inbox_availability.schedule_enabled_label', 'Use working-hours schedule')}
              </Label>
            </div>
          </div>

          <div className="max-w-md space-y-1">
            <Label htmlFor="inbox-timezone">{t('inbox_availability.timezone', 'Timezone')}</Label>
            <TimezoneSelector
              value={timezone}
              onChange={setTimezone}
              className="w-full"
              placeholder={t('inbox_availability.select_timezone', 'Select timezone')}
              searchPlaceholder={t('timezone.search_placeholder', 'Search timezones...')}
              emptyMessage={t('timezone.not_found', 'No timezone found.')}
            />
          </div>

          <Tabs
            value={scheduleMode}
            onValueChange={(value) => setScheduleMode(value as ScheduleMode)}
            className="min-w-0"
          >
            <TabsList>
              <TabsTrigger icon={TabIconCalendar} value="simple">{t('inbox_availability.simple_mode', 'Simple')}</TabsTrigger>
              <TabsTrigger icon={TabIconSlidersHorizontal} value="advanced">{t('inbox_availability.advanced_mode', 'Advanced')}</TabsTrigger>
            </TabsList>

            <TabsContent value="simple" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
                <div className="space-y-1">
                  <Label htmlFor="business-hours-start">
                    {t('inbox_availability.business_hours_start', 'Start time')}
                  </Label>
                  <Input
                    id="business-hours-start"
                    type="time"
                    value={businessHoursStart}
                    onChange={(event) => setBusinessHoursStart(event.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="business-hours-end">
                    {t('inbox_availability.business_hours_end', 'End time')}
                  </Label>
                  <Input
                    id="business-hours-end"
                    type="time"
                    value={businessHoursEnd}
                    onChange={(event) => setBusinessHoursEnd(event.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="pt-4">
              <WeeklyScheduleEditor
                schedule={weeklySchedule}
                offDays={offDays}
                onScheduleChange={setWeeklySchedule}
                onOffDaysChange={setOffDays}
              />
            </TabsContent>
          </Tabs>

          <div className={presentation === 'profile' ? 'profile-actions' : 'flex justify-stretch sm:justify-end'}>
            <Button
              className="w-full sm:w-auto"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.saving', 'Saving...')}
                </>
              ) : (
                t('common.save_changes', 'Save changes')
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
