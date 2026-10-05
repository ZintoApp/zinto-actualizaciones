import { eq } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { calendarBookings } from "@shared/schema";
import type { CalendarAdvancedSettings } from "@shared/types/calendar-types";
import { calendarAuditLogger } from "./calendar-audit-logger";
import { googleCalendarService } from "./google-calendar";

const FULL_SYNC_PAST_DAYS = 90;
const FULL_SYNC_FUTURE_DAYS = 365;
const RECONCILE_INTERVAL_MS = 2 * 60 * 1000;

export type ReconciliationResult = {
  success: boolean;
  completedAllPages: boolean;
  eventsSeen: number;
  error?: string;
};

export function getSyncToken(settings: any, calendarId: string): string | undefined {
  const advancedSettings = (settings?.advancedSettings || {}) as CalendarAdvancedSettings & Record<string, unknown>;
  const tokens = advancedSettings.googleSyncTokens;
  if (tokens && typeof tokens === 'object' && typeof (tokens as Record<string, unknown>)[calendarId] === 'string') {
    return (tokens as Record<string, string>)[calendarId];
  }
  return calendarId === 'primary' && typeof advancedSettings.googleSyncToken === 'string'
    ? advancedSettings.googleSyncToken
    : undefined;
}

export function withSyncToken(settings: any, calendarId: string, syncToken: string | undefined): Partial<any> {
  const currentAdvancedSettings = (settings?.advancedSettings || {}) as CalendarAdvancedSettings & Record<string, unknown>;
  const advancedSettingsWithoutLegacyToken = { ...currentAdvancedSettings };
  delete advancedSettingsWithoutLegacyToken.googleSyncToken;
  const googleSyncTokens = {
    ...((currentAdvancedSettings.googleSyncTokens && typeof currentAdvancedSettings.googleSyncTokens === 'object')
      ? currentAdvancedSettings.googleSyncTokens as Record<string, string>
      : {})
  };
  if (
    typeof currentAdvancedSettings.googleSyncToken === 'string' &&
    typeof googleSyncTokens.primary !== 'string'
  ) {
    googleSyncTokens.primary = currentAdvancedSettings.googleSyncToken;
  }
  if (syncToken) {
    googleSyncTokens[calendarId] = syncToken;
  } else {
    delete googleSyncTokens[calendarId];
  }
  const advancedSettings = {
    ...advancedSettingsWithoutLegacyToken,
    googleSyncTokens
  };
  return { advancedSettings };
}

function normalizeEventTime(event: any): { start?: Date; end?: Date } {
  const startValue = event.start?.dateTime || event.start?.date;
  const endValue = event.end?.dateTime || event.end?.date;
  return {
    start: startValue ? new Date(startValue) : undefined,
    end: endValue ? new Date(endValue) : undefined
  };
}

class CalendarReconciliationService {
  private interval: NodeJS.Timeout | null = null;

  async reconcileForUser(userId: number, companyId: number): Promise<void> {
    const now = new Date();
    await this.reconcileRange(
      userId,
      companyId,
      new Date(now.getTime() - FULL_SYNC_PAST_DAYS * 24 * 60 * 60 * 1000),
      new Date(now.getTime() + FULL_SYNC_FUTURE_DAYS * 24 * 60 * 60 * 1000)
    );
  }

  async reconcileRange(userId: number, companyId: number, fromUTC: Date, toUTC: Date, calendarId: string = 'primary'): Promise<ReconciliationResult> {
    const start = Date.now();
    const calendar = await googleCalendarService.getCalendarClient(userId, companyId);
    if (!calendar) {
      await calendarAuditLogger.log({
        action: 'reconcile',
        userId,
        companyId,
        payload: { fromUTC: fromUTC.toISOString(), toUTC: toUTC.toISOString(), calendarId },
        result: { success: false, code: 'auth' },
        latencyMs: Date.now() - start
      });
      return { success: false, completedAllPages: false, eventsSeen: 0, error: 'auth' };
    }

    const settings = await storage.getAgentCalendarSettings(userId, companyId);
    const syncToken = getSyncToken(settings, calendarId);
    const seenEventIds = new Set<string>();
    let nextSyncToken: string | undefined;
    let completedAllPages = false;

    try {
      let pageToken: string | undefined;

      do {
        const response = await googleCalendarService.withRetry(() =>
          calendar.events.list({
            calendarId,
            singleEvents: true,
            showDeleted: true,
            maxResults: 2500,
            pageToken,
            ...(syncToken
              ? { syncToken }
              : {
                  timeMin: fromUTC.toISOString(),
                  timeMax: toUTC.toISOString()
                })
          })
          , 0, { userId, companyId, action: 'events.list.reconcile' }
        );

        for (const event of response.data.items || []) {
          if (!event.id) continue;
          seenEventIds.add(event.id);

          const existing = await storage.getCalendarBookingByEventId(userId, companyId, 'google', event.id, calendarId);
          if (event.status === 'cancelled') {
            if (existing) {
              await storage.markBookingCancelled(existing.id, 'google_cancelled');
            }
            continue;
          }

          const { start: eventStart, end: eventEnd } = normalizeEventTime(event);
          if (!eventStart || !eventEnd) continue;

          if (existing) {
            await db
              .update(calendarBookings)
              .set({
                startDateTime: eventStart,
                endDateTime: eventEnd,
                bufferStartDateTime: eventStart,
                bufferEndDateTime: eventEnd,
                bufferMinutes: 0,
                eventLink: event.htmlLink || existing.eventLink,
                etag: event.etag || existing.etag,
                status: 'confirmed',
                lastSyncedAt: new Date(),
                cancelledAt: null
              })
              .where(eq(calendarBookings.id, existing.id));
          } else {
            await storage.createCalendarBooking({
              userId,
              companyId,
              calendarType: 'google',
              calendarId,
              startDateTime: eventStart,
              endDateTime: eventEnd,
              bufferStartDateTime: eventStart,
              bufferEndDateTime: eventEnd,
              bufferMinutes: 0,
              eventId: event.id,
              eventLink: event.htmlLink || undefined,
              etag: event.etag || undefined,
              status: 'confirmed'
            });
          }
        }

        pageToken = response.data.nextPageToken || undefined;
        nextSyncToken = response.data.nextSyncToken || nextSyncToken;
      } while (pageToken);

      completedAllPages = true;

      if (!syncToken) {
        const dbRows = await storage.getCalendarBookings(userId, companyId, 'google', fromUTC, toUTC, calendarId);
        for (const row of dbRows) {
          if (row.eventId && !seenEventIds.has(row.eventId)) {
            await storage.markBookingOrphaned(row.id);
          }
        }
      }

      if (settings && nextSyncToken) {
        await storage.saveAgentCalendarSettings(userId, companyId, withSyncToken(settings, calendarId, nextSyncToken));
      }

      await calendarAuditLogger.log({
        action: 'reconcile',
        userId,
        companyId,
        payload: { fromUTC: fromUTC.toISOString(), toUTC: toUTC.toISOString(), calendarId, incremental: Boolean(syncToken) },
        result: { success: true, eventsSeen: seenEventIds.size, completedAllPages },
        latencyMs: Date.now() - start
      });
      return { success: true, completedAllPages, eventsSeen: seenEventIds.size };
    } catch (error: any) {
      if (error?.response?.status === 410 && settings) {
        await storage.saveAgentCalendarSettings(userId, companyId, withSyncToken(settings, calendarId, undefined));
        return this.reconcileRange(userId, companyId, fromUTC, toUTC, calendarId);
      }

      await calendarAuditLogger.log({
        action: 'reconcile',
        userId,
        companyId,
        payload: { fromUTC: fromUTC.toISOString(), toUTC: toUTC.toISOString(), calendarId },
        result: { success: false },
        error,
        latencyMs: Date.now() - start
      });
      return { success: false, completedAllPages: false, eventsSeen: seenEventIds.size, error: error?.message || 'reconcile_failed' };
    }
  }

  startBackgroundReconciliation(): void {
    if (this.interval) return;

    this.interval = setInterval(async () => {
      try {
        const companies = await storage.getAllCompanies();
        for (const company of companies) {
          const members = await storage.getTeamMembersWithCalendarConnected(company.id);
          for (const agent of members) {
            if (agent.isCalendarConnected && agent.calendarSettings?.isEnabled) {
              await this.reconcileForUser(agent.userId, company.id);
            }
          }
        }
      } catch (error) {
        await calendarAuditLogger.log({
          action: 'reconcile',
          result: { success: false, phase: 'background' },
          error
        });
      }
    }, RECONCILE_INTERVAL_MS);
  }
}

export const calendarReconciliationService = new CalendarReconciliationService();
