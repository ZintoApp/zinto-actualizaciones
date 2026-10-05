import React from "react";
import { useTranslation } from "@/hooks/use-translation";
import { useAuth } from "@/hooks/use-auth";
import Header from "@/components/layout/Header";
import { CalendarSettingsForm } from "@/components/calendar/CalendarSettingsForm";

export default function MyCalendarSettings() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <div className="flex flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
      <Header />
      <main className="flex-1 overflow-y-auto p-6 space-y-6 max-w-5xl mx-auto w-full">
          <div className="flex items-center justify-between">
            <div>
              <h1 data-tour="pages-my-calendar-settings.h1.calendar.my_calendar_settings" className="text-2xl">
                {t("calendar.my_calendar_settings", "My Calendar Settings")}
              </h1>
              {user?.fullName && (
                <p className="text-sm text-muted-foreground">
                  {t(
                    "calendar.my_calendar_settings_subtitle",
                    "Configure your personal availability and calendar connection."
                  )}
                </p>
              )}
            </div>
          </div>

          <CalendarSettingsForm />
        </main>
    </div>
  );
}
