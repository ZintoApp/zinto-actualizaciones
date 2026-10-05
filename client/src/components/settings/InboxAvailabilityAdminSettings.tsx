import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useTranslation } from '@/hooks/use-translation';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { WeeklyScheduleEditor } from '@/components/flow-builder/WeeklyScheduleEditor';
import { TimezoneSelector } from '@/components/ui/TimezoneSelector';
import { InboxAvailabilitySettingsForm } from '@/components/inbox/InboxAvailabilitySettingsForm';
import {
  Loader2,
  Clock,
  Calendar as TabIconCalendar,
  SlidersHorizontal as TabIconSlidersHorizontal,
} from 'lucide-react';
import {
  DEFAULT_BUSINESS_HOURS,
  DEFAULT_WEEKLY_SCHEDULE,
  type DaySchedule,
} from '@shared/types/calendar-types';
import type { InboxAvailabilityDefaultSchedule } from '@shared/types/inbox-availability-types';

type TeamAvailabilityMember = {
  userId: number;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  isAvailable: boolean;
  availabilityReason?: string;
  isOnDuty: boolean;
  isScheduleEnabled: boolean;
  timezone: string;
};

type TeamAvailabilityResponse = {
  data: TeamAvailabilityMember[];
  inboxAvailabilityEnabled: boolean;
  defaultSchedule: InboxAvailabilityDefaultSchedule;
};

export function InboxAvailabilityAdminSettings() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canAccessTeam, canManageTeam } = usePermissions();
  const canViewTeam = canAccessTeam();
  const canManageTeamMembers = canManageTeam();

  const [enabled, setEnabled] = useState(false);
  const [scheduleMode, setScheduleMode] = useState<'simple' | 'advanced'>('advanced');
  const [businessHoursStart, setBusinessHoursStart] = useState(DEFAULT_BUSINESS_HOURS.start);
  const [businessHoursEnd, setBusinessHoursEnd] = useState(DEFAULT_BUSINESS_HOURS.end);
  const [timezone, setTimezone] = useState('UTC');
  const [weeklySchedule, setWeeklySchedule] = useState<DaySchedule[]>(DEFAULT_WEEKLY_SCHEDULE);
  const [offDays, setOffDays] = useState<number[]>([0, 6]);
  const [editingUserId, setEditingUserId] = useState<number | null>(null);

  const { data: inboxSettings, isLoading: isLoadingInboxSettings } = useQuery({
    queryKey: ['/api/settings/inbox'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/settings/inbox');
      if (!response.ok) {
        throw new Error('Failed to fetch inbox settings');
      }
      return response.json();
    },
  });

  const { data: teamData, isLoading: isLoadingTeam } = useQuery<TeamAvailabilityResponse>({
    queryKey: ['/api/company/agents/inbox-availability'],
    enabled: canViewTeam,
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/company/agents/inbox-availability');
      if (!response.ok) {
        throw new Error('Failed to fetch team availability');
      }
      return response.json();
    },
  });

  useEffect(() => {
    if (!inboxSettings) return;
    setEnabled(inboxSettings.inboxAvailabilityEnabled === true);

    const defaultSchedule = inboxSettings.inboxAvailabilityDefaultSchedule as InboxAvailabilityDefaultSchedule | undefined;
    if (defaultSchedule) {
      setScheduleMode(defaultSchedule.scheduleMode === 'simple' ? 'simple' : 'advanced');
      setBusinessHoursStart(defaultSchedule.businessHoursStart || DEFAULT_BUSINESS_HOURS.start);
      setBusinessHoursEnd(defaultSchedule.businessHoursEnd || DEFAULT_BUSINESS_HOURS.end);
      setTimezone(defaultSchedule.timezone || 'UTC');
      if (defaultSchedule.advancedSettings?.weeklySchedule?.length) {
        setWeeklySchedule(defaultSchedule.advancedSettings.weeklySchedule);
        setOffDays(defaultSchedule.advancedSettings.offDays || []);
      }
    }
  }, [inboxSettings]);

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        inboxAvailabilityEnabled: enabled,
        inboxAvailabilityDefaultSchedule: {
          scheduleMode,
          businessHoursStart,
          businessHoursEnd,
          timezone,
          isScheduleEnabled: true,
          advancedSettings: {
            weeklySchedule,
            offDays,
          },
        } satisfies InboxAvailabilityDefaultSchedule,
      };

      const response = await apiRequest('PATCH', '/api/settings/inbox', payload);
      if (!response.ok) {
        throw new Error('Failed to save inbox availability settings');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/settings/inbox'] });
      queryClient.invalidateQueries({ queryKey: ['/api/company/agents/inbox-availability'] });
      queryClient.invalidateQueries({ queryKey: ['/api/agents'] });
      toast({
        title: t('inbox_availability.admin_saved_title', 'Agent availability settings saved'),
      });
    },
    onError: () => {
      toast({
        variant: 'destructive',
        title: t('inbox_availability.admin_save_error_title', 'Failed to save agent availability settings'),
      });
    },
  });

  const getStatusBadge = (member: TeamAvailabilityMember) => {
    if (!enabled) {
      return <Badge variant="secondary">{t('inbox_availability.feature_off', 'Feature off')}</Badge>;
    }
    if (!member.isOnDuty) {
      return <Badge variant="destructive">{t('inbox_availability.off_duty', 'Off duty')}</Badge>;
    }
    if (member.isAvailable) {
      return <Badge>{t('inbox_availability.available_now', 'Available')}</Badge>;
    }
    return <Badge variant="outline">{t('inbox_availability.outside_hours', 'Outside hours')}</Badge>;
  };

  if (isLoadingInboxSettings) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className="shadow-none">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-4">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-base font-medium">
              <Clock className="h-5 w-5" />
              {t('inbox_availability.admin_title', 'Agent Availability')}
            </CardTitle>
            <CardDescription>
              {t(
                'inbox_availability.admin_description',
                'Route inbox assignments based on agent working hours and on-duty status.'
              )}
            </CardDescription>
          </div>
          <div className="flex max-w-lg items-center gap-3">
            <div className="hidden text-right sm:block">
              <Label htmlFor="inbox-availability-enabled">
                {t('inbox_availability.enable_routing', 'Enable availability-based assignment')}
              </Label>
              <p className="text-xs text-muted-foreground">
                {t(
                  'inbox_availability.enable_routing_help',
                  'When enabled, assignment prefers agents who are on duty and within their schedule.'
                )}
              </p>
            </div>
            <Switch
              id="inbox-availability-enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 border rounded-lg p-4">
            <div>
              <h4 className="font-medium">
                {t('inbox_availability.default_schedule_title', 'Default schedule for agents without personal settings')}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t(
                  'inbox_availability.default_schedule_help',
                  'Used when an agent has not configured their own inbox availability.'
                )}
              </p>
            </div>

            <div className="max-w-md space-y-1">
              <Label>{t('inbox_availability.timezone', 'Timezone')}</Label>
              <TimezoneSelector
                value={timezone}
                onChange={setTimezone}
                className="w-full"
                placeholder={t('inbox_availability.select_timezone', 'Select timezone')}
                searchPlaceholder={t('timezone.search_placeholder', 'Search timezones...')}
                emptyMessage={t('timezone.not_found', 'No timezone found.')}
              />
            </div>

            <Tabs value={scheduleMode} onValueChange={(value) => setScheduleMode(value as 'simple' | 'advanced')}>
              <TabsList>
                <TabsTrigger icon={TabIconCalendar} data-tour="components-settings-inboxavailabilityadminsettings.tabstrigger.simple" value="simple">{t('inbox_availability.simple_mode', 'Simple')}</TabsTrigger>
                <TabsTrigger icon={TabIconSlidersHorizontal} data-tour="components-settings-inboxavailabilityadminsettings.tabstrigger.advanced" value="advanced">{t('inbox_availability.advanced_mode', 'Advanced')}</TabsTrigger>
              </TabsList>
              <TabsContent data-tour="components-settings-inboxavailabilityadminsettings.tabscontent.simple" value="simple" className="space-y-4 pt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl">
                  <div className="space-y-1">
                    <Label>{t('inbox_availability.business_hours_start', 'Start time')}</Label>
                    <Input data-tour="components-settings-inboxavailabilityadminsettings.input.inbox_availability.business_hours_start" type="time" value={businessHoursStart} onChange={(e) => setBusinessHoursStart(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label>{t('inbox_availability.business_hours_end', 'End time')}</Label>
                    <Input data-tour="components-settings-inboxavailabilityadminsettings.input.inbox_availability.business_hours_start" type="time" value={businessHoursEnd} onChange={(e) => setBusinessHoursEnd(e.target.value)} />
                  </div>
                </div>
              </TabsContent>
              <TabsContent data-tour="components-settings-inboxavailabilityadminsettings.tabscontent.advanced" value="advanced" className="pt-4">
                <WeeklyScheduleEditor
                  schedule={weeklySchedule}
                  offDays={offDays}
                  onScheduleChange={setWeeklySchedule}
                  onOffDaysChange={setOffDays}
                />
              </TabsContent>
            </Tabs>
          </div>

          <div className="flex justify-end">
            <Button data-tour="components-settings-inboxavailabilityadminsettings.button.common.saving" onClick={() => saveSettingsMutation.mutate()} disabled={saveSettingsMutation.isPending}>
              {saveSettingsMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('common.saving', 'Saving...')}
                </>
              ) : (
                t('common.save_changes', 'Save changes')
              )}
            </Button>
          </div>

          <div className="space-y-3">
            <h4 className="font-medium">{t('inbox_availability.team_status_title', 'Team availability status')}</h4>
            {!canViewTeam ? (
              <p className="text-sm text-muted-foreground">
                {t('inbox_availability.team_view_forbidden', 'You need team view permission to see the team roster.')}
              </p>
            ) : isLoadingTeam ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="border rounded-lg divide-y">
                {(teamData?.data || []).map((member) => (
                  <div key={member.userId} className="flex items-center justify-between gap-4 p-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{member.fullName}</div>
                      <div className="text-xs text-muted-foreground">
                        {member.timezone} · {member.role}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {getStatusBadge(member)}
                      {canManageTeamMembers && (
                        <Button data-tour="components-settings-inboxavailabilityadminsettings.button.common.edit" variant="outline" size="sm" onClick={() => setEditingUserId(member.userId)}>
                          {t('common.edit', 'Edit')}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={editingUserId != null} onOpenChange={(open) => !open && setEditingUserId(null)}>
        <DialogContent data-tour="components-settings-inboxavailabilityadminsettings.dialogcontent.inbox_availability.edit_agent_title" className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('inbox_availability.edit_agent_title', 'Edit agent availability')}</DialogTitle>
          </DialogHeader>
          {editingUserId != null && (
            <InboxAvailabilitySettingsForm
              userId={editingUserId}
              adminMode
              onSaved={() => setEditingUserId(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
