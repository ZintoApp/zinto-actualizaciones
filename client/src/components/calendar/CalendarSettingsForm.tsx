import React, { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/hooks/use-translation";
import { useGoogleCalendarAuth } from "@/hooks/useGoogleCalendarAuth";
import { GoogleCalendarOAuthStatus } from "@/components/flow-builder/GoogleCalendarOAuthStatus";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Calendar as TabIconCalendar,
  SlidersHorizontal as TabIconSlidersHorizontal,
} from "lucide-react";
import {
  CalendarAdvancedSettings,
  DaySchedule,
  DEFAULT_WEEKLY_SCHEDULE,
  DEFAULT_BUSINESS_HOURS,
} from "@shared/types/calendar-types";

type ScheduleMode = "simple" | "advanced";

type AgentCalendarSettingsResponse = {
  isEnabled: boolean;
  timezone: string;
  bufferMinutes: number;
  businessHoursStart: string;
  businessHoursEnd: string;
  scheduleMode: ScheduleMode;
  advancedSettings?: CalendarAdvancedSettings;
};

const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Europe/Madrid",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export interface CalendarSettingsFormProps {
  onSaved?: () => void;
  compact?: boolean;
  /** Hide the Google Calendar Connection card (e.g. in modal where connection is shown on the page) */
  hideConnectionSection?: boolean;
}

export function CalendarSettingsForm({ onSaved, compact, hideConnectionSection }: CalendarSettingsFormProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>("simple");
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [timezone, setTimezone] = useState<string>("UTC");
  const [bufferMinutes, setBufferMinutes] = useState<number>(0);
  const [businessHoursStart, setBusinessHoursStart] = useState<string>(
    DEFAULT_BUSINESS_HOURS.start
  );
  const [businessHoursEnd, setBusinessHoursEnd] = useState<string>(
    DEFAULT_BUSINESS_HOURS.end
  );
  const [weeklySchedule, setWeeklySchedule] =
    useState<DaySchedule[]>(DEFAULT_WEEKLY_SCHEDULE);

  const {
    isConnected,
    isLoadingStatus,
    isAuthenticating,
    authenticate,
    disconnect,
  } = useGoogleCalendarAuth();

  const {
    data: settings,
    isLoading: isLoadingSettings,
    isError: isSettingsError,
  } = useQuery<AgentCalendarSettingsResponse>({
    queryKey: ["agent-calendar-settings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/agent/calendar/settings");
      if (!res.ok) {
        throw new Error("Failed to fetch calendar settings");
      }
      return res.json();
    },
  });

  useEffect(() => {
    if (!settings) return;

    setIsEnabled(settings.isEnabled);
    setTimezone(settings.timezone || "UTC");
    setBufferMinutes(settings.bufferMinutes ?? 0);
    setBusinessHoursStart(
      settings.businessHoursStart || DEFAULT_BUSINESS_HOURS.start
    );
    setBusinessHoursEnd(
      settings.businessHoursEnd || DEFAULT_BUSINESS_HOURS.end
    );
    setScheduleMode(settings.scheduleMode || "simple");

    if (
      settings.advancedSettings &&
      settings.advancedSettings.weeklySchedule?.length
    ) {
      setWeeklySchedule(settings.advancedSettings.weeklySchedule);
    } else {
      setWeeklySchedule(DEFAULT_WEEKLY_SCHEDULE);
    }
  }, [settings]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload = {
        isEnabled,
        timezone,
        bufferMinutes,
        businessHoursStart,
        businessHoursEnd,
        advancedSettings: {
          weeklySchedule,
          offDays: weeklySchedule
            .filter((d) => !d.enabled)
            .map((d) => d.dayIndex),
        },
        scheduleMode,
      };

      const res = await apiRequest(
        "PUT",
        "/api/agent/calendar/settings",
        payload
      );
      if (!res.ok) {
        throw new Error("Failed to update calendar settings");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agent-calendar-settings"] });
      toast({
        title: t(
          "calendar.settings_saved_title",
          "Calendar settings saved successfully"
        ),
        description: t(
          "calendar.settings_saved_description",
          "Your calendar preferences have been updated."
        ),
      });
      onSaved?.();
    },
    onError: () => {
      toast({
        variant: "destructive",
        title: t("calendar.settings_error_title", "Failed to save settings"),
        description: t(
          "calendar.settings_error_description",
          "Please try again or contact support if the issue persists."
        ),
      });
    },
  });

  const handleToggleDay = (index: number, enabled: boolean) => {
    setWeeklySchedule((prev) =>
      prev.map((day, idx) =>
        idx === index
          ? {
              ...day,
              enabled,
            }
          : day
      )
    );
  };

  const handleDayTimeChange = (
    index: number,
    field: "startTime" | "endTime",
    value: string
  ) => {
    setWeeklySchedule((prev) =>
      prev.map((day, idx) =>
        idx === index
          ? {
              ...day,
              [field]: value,
            }
          : day
      )
    );
  };

  const handleSave = () => {
    mutation.mutate();
  };

  const isSaving = mutation.isPending;

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {!hideConnectionSection && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t(
                "calendar.google_calendar_connection",
                "Google Calendar Connection"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <GoogleCalendarOAuthStatus />
              <Button
                variant={isConnected ? "outline" : "default"}
                onClick={() =>
                  isConnected ? disconnect() : authenticate()
                }
                disabled={isAuthenticating || isLoadingStatus}
              >
                {isAuthenticating || isLoadingStatus ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t("calendar.loading", "Loading...")}
                  </>
                ) : isConnected ? (
                  t(
                    "calendar.disconnect_google_calendar",
                    "Disconnect Google Calendar"
                  )
                ) : (
                  t(
                    "calendar.connect_google_calendar",
                    "Connect Google Calendar"
                  )
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {t(
              "calendar.working_hours_availability",
              "Working Hours & Availability"
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center space-x-3">
              <Switch
                id="calendar-enabled"
                checked={isEnabled}
                onCheckedChange={(checked) => setIsEnabled(!!checked)}
              />
              <Label htmlFor="calendar-enabled">
                {t(
                  "calendar.enable_calendar",
                  "Enable calendar for bookings"
                )}
              </Label>
            </div>

            <div className="space-y-1">
              <Label htmlFor="timezone">
                {t("calendar.timezone", "Timezone")}
              </Label>
              <Select
                value={timezone}
                onValueChange={(value) => setTimezone(value)}
              >
                <SelectTrigger id="timezone">
                  <SelectValue placeholder={t(
                    "calendar.select_timezone",
                    "Select timezone"
                  )} />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="bufferMinutes">
                {t(
                  "calendar.buffer_minutes",
                  "Buffer between appointments (minutes)"
                )}
              </Label>
              <Input
                id="bufferMinutes"
                type="number"
                min={0}
                value={bufferMinutes}
                onChange={(e) =>
                  setBufferMinutes(
                    Number.isNaN(parseInt(e.target.value, 10))
                      ? 0
                      : parseInt(e.target.value, 10)
                  )
                }
              />
            </div>
          </div>

          <Tabs
            value={scheduleMode}
            onValueChange={(value) =>
              setScheduleMode(value as ScheduleMode)
            }
          >
            <TabsList>
              <TabsTrigger icon={TabIconCalendar} value="simple">
                {t("calendar.simple", "Simple")}
              </TabsTrigger>
              <TabsTrigger icon={TabIconSlidersHorizontal} value="advanced">
                {t("calendar.advanced", "Advanced")}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="simple" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="businessHoursStart">
                    {t("calendar.start_time", "Start Time")}
                  </Label>
                  <Input
                    id="businessHoursStart"
                    type="time"
                    value={businessHoursStart}
                    onChange={(e) =>
                      setBusinessHoursStart(e.target.value)
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="businessHoursEnd">
                    {t("calendar.end_time", "End Time")}
                  </Label>
                  <Input
                    id="businessHoursEnd"
                    type="time"
                    value={businessHoursEnd}
                    onChange={(e) => setBusinessHoursEnd(e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="advanced" className="space-y-4 pt-4">
              <div className="space-y-3">
                {weeklySchedule.map((day, index) => (
                  <div
                    key={day.dayIndex}
                    className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr] gap-4 items-center"
                  >
                    <div className="flex items-center space-x-3">
                      <Switch
                        id={`day-enabled-${day.dayIndex}`}
                        checked={day.enabled}
                        onCheckedChange={(checked) =>
                          handleToggleDay(index, !!checked)
                        }
                      />
                      <Label htmlFor={`day-enabled-${day.dayIndex}`}>
                        {day.dayName}
                      </Label>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`start-${day.dayIndex}`}>
                        {t("calendar.start_time", "Start Time")}
                      </Label>
                      <Input
                        id={`start-${day.dayIndex}`}
                        type="time"
                        value={day.startTime}
                        disabled={!day.enabled}
                        onChange={(e) =>
                          handleDayTimeChange(
                            index,
                            "startTime",
                            e.target.value
                          )
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`end-${day.dayIndex}`}>
                        {t("calendar.end_time", "End Time")}
                      </Label>
                      <Input
                        id={`end-${day.dayIndex}`}
                        type="time"
                        value={day.endTime}
                        disabled={!day.enabled}
                        onChange={(e) =>
                          handleDayTimeChange(
                            index,
                            "endTime",
                            e.target.value
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {t("calendar.save_settings", "Save Settings")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoadingSettings && (
        <div className="flex items-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          {t(
            "calendar.loading_settings",
            "Loading your calendar settings..."
          )}
        </div>
      )}
      {isSettingsError && (
        <p className="text-sm text-destructive">
          {t(
            "calendar.load_settings_error",
            "We couldn't load your existing calendar settings. You can still configure new ones above."
          )}
        </p>
      )}
    </div>
  );
}
