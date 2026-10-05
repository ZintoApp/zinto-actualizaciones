import { google, calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';
import { Request, Response } from 'express';
import { createHash } from 'crypto';
import { storage } from '../storage';
import { CalendarBooking } from '@shared/schema';
import type { CalendarAdvancedSettings } from '@shared/types/calendar-types';
import { isValidAdvancedSettings, getDayName } from '@shared/types/calendar-types';
import { getActiveBreaksForDay, slotIntersectsAnyBreak } from '@shared/utils/calendar-breaks';
import { getZonedDateTimeParts } from '@shared/utils/agent-schedule';
import { calendarAuditLogger } from './calendar-audit-logger';
import { parseInZoneToUTC, validateTimezone, normalizeTimezone } from '../utils/timezone';
import {
  appendOwnershipToDescription,
  buildContactOwnershipPrivateProps,
  eventBelongsToContact,
  filterEventsForContact,
  hasUsableRequesterIdentity,
  sanitizeCalendarEventForContact,
  type CalendarRequesterIdentity,
} from './calendar-contact-privacy';

export type ListGoogleCalendarEventsOptions = {
  requester?: CalendarRequesterIdentity | null;
  /** @deprecated Prefer `requester.email` */
  requesterEmail?: string | null;
  /** Staff UI / internal conflict checks only — never from AI customer tools */
  bypassContactPrivacyFilter?: boolean;
  calendarId?: string;
};

const SCOPES = ['https://www.googleapis.com/auth/calendar'];


const API_TIMEOUT_MS = 10000; // 10 seconds
const MAX_RETRIES = 3;
const RETRY_STATUS_CODES = [408, 429, 500, 502, 503, 504];
const TOKEN_REFRESH_SKEW_MS = 5 * 60_000;

class GoogleCalendarService {
  private refreshPromises = new Map<string, Promise<void>>();
  private oauthClients = new Map<string, OAuth2Client>();

  constructor() {
  }

  /**
   * Helper to wrap API calls with timeout and retry logic
   * Retries on 429, 500, 503 with exponential backoff
   */
  public async withRetry<T>(
    apiCall: () => Promise<T>,
    retryCount: number = 0,
    context?: { userId?: number; companyId?: number; action?: string; retriedUnauthorized?: boolean }
  ): Promise<T> {
    try {

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`API call timed out after ${API_TIMEOUT_MS}ms`));
        }, API_TIMEOUT_MS);
      });


      const result = await Promise.race([apiCall(), timeoutPromise]);
      return result;
    } catch (error: any) {
      const statusCode = error?.response?.status || error?.code;
      if (statusCode === 401 && context?.userId && context?.companyId && !context.retriedUnauthorized) {
        await calendarAuditLogger.log({
          action: 'retry',
          userId: context.userId,
          companyId: context.companyId,
          payload: { action: context.action, statusCode, retryCount, reason: 'unauthorized' },
          result: { retrying: true }
        });
        await this.refreshGoogleTokensForUser(context.userId, context.companyId, true);
        return this.withRetry(apiCall, retryCount, { ...context, retriedUnauthorized: true });
      }

      const shouldRetry =
        retryCount < MAX_RETRIES &&
        (RETRY_STATUS_CODES.includes(statusCode) || error?.message?.includes('timeout'));

      if (shouldRetry) {

        const delayMs = Math.pow(2, retryCount) * 1000 + Math.floor(Math.random() * 250);
        await calendarAuditLogger.log({
          action: 'retry',
          userId: context?.userId,
          companyId: context?.companyId,
          payload: { action: context?.action, statusCode, retryCount, delayMs },
          result: { retrying: true }
        });

        await new Promise(resolve => setTimeout(resolve, delayMs));
        return this.withRetry(apiCall, retryCount + 1, context);
      }


      throw error;
    }
  }

  private async withTimeoutOnly<T>(apiCall: () => Promise<T>): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`API call timed out after ${API_TIMEOUT_MS}ms`));
      }, API_TIMEOUT_MS);
    });

    return Promise.race([apiCall(), timeoutPromise]);
  }

  private getBufferedRange(start: Date, end: Date, bufferMinutes: number = 0): { start: Date; end: Date } {
    const bufferMs = Math.max(0, bufferMinutes || 0) * 60 * 1000;
    return {
      start: new Date(start.getTime() - bufferMs),
      end: new Date(end.getTime() + bufferMs)
    };
  }

  private isValidDate(value: Date): boolean {
    return value instanceof Date && !Number.isNaN(value.getTime());
  }

  private isSameBookingRequest(existing: CalendarBooking, startDate: Date, endDate: Date): boolean {
    return (
      existing.startDateTime.getTime() === startDate.getTime() &&
      existing.endDateTime.getTime() === endDate.getTime()
    );
  }

  private isGoogleNotFound(error: any): boolean {
    const statusCode = error?.response?.status || error?.code;
    return statusCode === 404 || statusCode === 410;
  }

  private async getGoogleEventById(
    calendar: calendar_v3.Calendar,
    userId: number,
    companyId: number,
    eventId: string,
    calendarId: string = 'primary'
  ): Promise<calendar_v3.Schema$Event | null> {
    try {
      const response = await this.withRetry(() =>
        calendar.events.get({
          calendarId,
          eventId
        })
        , 0, { userId, companyId, action: 'events.get' }
      );
      return response.data?.status === 'cancelled' ? null : response.data;
    } catch (error: any) {
      if (this.isGoogleNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  private async findExistingEventByIdempotencyKey(
    calendar: calendar_v3.Calendar,
    userId: number,
    companyId: number,
    calendarId: string,
    idempotencyKey: string,
    startDate: Date,
    endDate: Date
  ): Promise<calendar_v3.Schema$Event | null> {
    const recoveryWindowStart = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
    const recoveryWindowEnd = new Date(endDate.getTime() + 24 * 60 * 60 * 1000);

    const response = await this.withRetry(() =>
      calendar.events.list({
        calendarId,
        privateExtendedProperty: [`bothiveIdempotencyKey=${idempotencyKey}`],
        timeMin: recoveryWindowStart.toISOString(),
        timeMax: recoveryWindowEnd.toISOString(),
        singleEvents: true,
        showDeleted: false,
        maxResults: 10
      })
      , 0, { userId, companyId, action: 'events.list.idempotency_recovery' }
    );

    for (const event of response.data.items || []) {
      if (
        event.id &&
        event.status !== 'cancelled' &&
        event.extendedProperties?.private?.bothiveIdempotencyKey === idempotencyKey
      ) {
        return event;
      }
    }

    return null;
  }

  private async findExistingEventByIdempotencyKeyWithBackoff(
    calendar: calendar_v3.Calendar,
    userId: number,
    companyId: number,
    calendarId: string,
    idempotencyKey: string,
    startDate: Date,
    endDate: Date
  ): Promise<calendar_v3.Schema$Event | null> {
    const recoveryDelaysMs = [0, 500, 1000, 2000];

    for (const delayMs of recoveryDelaysMs) {
      if (delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }

      const existingEvent = await this.findExistingEventByIdempotencyKey(
        calendar,
        userId,
        companyId,
        calendarId,
        idempotencyKey,
        startDate,
        endDate
      );

      if (existingEvent?.id) {
        return existingEvent;
      }
    }

    return null;
  }

  private async insertCalendarEventIdempotently(
    calendar: calendar_v3.Calendar,
    userId: number,
    companyId: number,
    event: calendar_v3.Schema$Event,
    sendUpdates: 'all' | 'none',
    calendarId: string,
    idempotencyKey: string,
    startDate: Date,
    endDate: Date
  ): Promise<{ status?: number; data: calendar_v3.Schema$Event }> {
    const insertOnce = () =>
      this.withTimeoutOnly(() =>
        calendar.events.insert({
          calendarId,
          requestBody: event,
          sendUpdates
        })
      );

    const recoverOrThrow = async (error: any): Promise<{ status?: number; data: calendar_v3.Schema$Event }> => {
      const statusCode = error?.response?.status || error?.code;
      const message = String(error?.message || '').toLowerCase();
      const reason = String(
        error?.response?.data?.error?.errors?.[0]?.reason ||
        error?.errors?.[0]?.reason ||
        ''
      ).toLowerCase();
      const isDuplicateGoogleEventId =
        statusCode === 409 ||
        message.includes('requested identifier already exists') ||
        message.includes('identifier already exists') ||
        reason === 'duplicate' ||
        reason === 'conflict';

      if (isDuplicateGoogleEventId || message.includes('timeout') || RETRY_STATUS_CODES.includes(statusCode)) {
        const recoveryStart = Date.now();
        const existingEvent = await this.findExistingEventByIdempotencyKeyWithBackoff(
          calendar,
          userId,
          companyId,
          calendarId,
          idempotencyKey,
          startDate,
          endDate
        );
        if (existingEvent?.id) {
          await calendarAuditLogger.log({
            action: 'recover',
            userId,
            companyId,
            payload: { calendarId, idempotencyKey, source: 'extended_property_lookup' },
            result: { eventId: existingEvent.id },
            latencyMs: Date.now() - recoveryStart
          });
          return { status: 200, data: existingEvent };
        }

        error.calendarInsertOutcomeUnknown = true;
        error.retryable = true;
      }

      throw error;
    };

    try {
      return await insertOnce();
    } catch (error: any) {
      const statusCode = error?.response?.status || error?.code;
      if (statusCode === 401) {
        await calendarAuditLogger.log({
          action: 'retry',
          userId,
          companyId,
          payload: { action: 'events.insert', statusCode, retryCount: 0, reason: 'unauthorized' },
          result: { retrying: true }
        });
        await this.refreshGoogleTokensForUser(userId, companyId, true);
        try {
          return await insertOnce();
        } catch (retryError: any) {
          return await recoverOrThrow(retryError);
        }
      }

      return await recoverOrThrow(error);
    }
  }

  private async markOrphanedConflictingBookings(
    calendar: calendar_v3.Calendar,
    userId: number,
    companyId: number,
    startDateTime: Date,
    endDateTime: Date,
    calendarId: string = 'primary'
  ): Promise<boolean> {
    const conflicts = await storage.getCalendarBookings(userId, companyId, 'google', startDateTime, endDateTime, calendarId);
    if (conflicts.length === 0) {
      return false;
    }

    let markedAny = false;
    for (const conflict of conflicts) {
      if (!conflict.eventId) {
        continue;
      }

      const remoteEvent = await this.getGoogleEventById(calendar, userId, companyId, conflict.eventId, calendarId);
      if (!remoteEvent) {
        await storage.markBookingOrphaned(conflict.id);
        markedAny = true;
      }
    }

    return markedAny;
  }

  private async listEventConflictsExcluding(
    calendar: calendar_v3.Calendar,
    userId: number,
    companyId: number,
    startDateTime: Date,
    endDateTime: Date,
    excludedEventId: string,
    calendarId: string = 'primary'
  ): Promise<calendar_v3.Schema$Event[]> {
    const conflicts: calendar_v3.Schema$Event[] = [];
    let pageToken: string | undefined;

    do {
      const response = await this.withRetry(() =>
        calendar.events.list({
          calendarId,
          timeMin: startDateTime.toISOString(),
          timeMax: endDateTime.toISOString(),
          singleEvents: true,
          showDeleted: false,
          maxResults: 2500,
          pageToken
        })
        , 0, { userId, companyId, action: 'events.list.conflict_check' }
      );

      for (const event of response.data.items || []) {
        if (event.id && event.id !== excludedEventId && event.status !== 'cancelled') {
          conflicts.push(event);
        }
      }

      pageToken = response.data.nextPageToken || undefined;
    } while (pageToken);

    return conflicts;
  }

  private async refreshGoogleTokensForUser(userId: number, companyId: number, force: boolean = false): Promise<void> {
    const key = `${userId}:${companyId}`;
    const existingRefresh = this.refreshPromises.get(key);
    if (existingRefresh) {
      await existingRefresh;
      return;
    }

    const refreshPromise = (async () => {
      const tokens = await storage.getGoogleTokens(userId, companyId);
      if (!tokens) {
        return;
      }
      if (!tokens.refresh_token) {
        if (!force) return;
        throw new Error('Google refresh token unavailable');
      }

      if (!force && tokens.expiry_date && tokens.expiry_date - Date.now() >= TOKEN_REFRESH_SKEW_MS) {
        return;
      }

      let oauth2Client = this.oauthClients.get(key);
      if (!oauth2Client) {
        const client = await this.getOAuth2Client();
        if (!client) {
          throw new Error('Google Calendar OAuth not configured');
        }
        oauth2Client = client;
        this.oauthClients.set(key, oauth2Client);
      }

      oauth2Client.setCredentials(tokens);
      const { credentials } = await oauth2Client.refreshAccessToken();
      const googleTokens = {
        access_token: credentials.access_token || tokens.access_token || '',
        refresh_token: credentials.refresh_token || tokens.refresh_token,
        id_token: credentials.id_token || tokens.id_token,
        token_type: credentials.token_type || tokens.token_type,
        expiry_date: credentials.expiry_date || tokens.expiry_date,
        scope: credentials.scope || tokens.scope
      };

      await storage.saveGoogleTokens(userId, companyId, googleTokens);
      oauth2Client.setCredentials(googleTokens);
      await calendarAuditLogger.log({
        action: 'auth',
        userId,
        companyId,
        result: { success: true, refreshed: true }
      });
    })().finally(() => {
      this.refreshPromises.delete(key);
    });

    this.refreshPromises.set(key, refreshPromise);
    await refreshPromise;
  }

  /**
   * Get Google OAuth credentials from super admin settings
   */
  private async getApplicationCredentials(): Promise<{
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } | null> {
    try {
      const credentials = await storage.getAppSetting('google_calendar_oauth');

      if (!credentials || !credentials.value) {
        console.error('Google Calendar OAuth not configured in admin settings');
        return null;
      }

      const config = credentials.value as any;
      if (!config.enabled || !config.client_id || !config.client_secret) {
        console.error('Google Calendar OAuth not properly configured or disabled');
        return null;
      }

      return {
        clientId: config.client_id,
        clientSecret: config.client_secret,
        redirectUri: config.redirect_uri || `${process.env.BASE_URL || 'http://localhost:9000'}/api/google/calendar/callback`
      };
    } catch (error) {
      console.error('Error getting application Google credentials:', error);
      return null;
    }
  }

  /**
   * Create a Google OAuth2 client using application credentials
   */
  private async getOAuth2Client(): Promise<OAuth2Client | null> {
    const credentials = await this.getApplicationCredentials();

    if (!credentials) {
      return null;
    }

    return new google.auth.OAuth2(
      credentials.clientId,
      credentials.clientSecret,
      credentials.redirectUri
    );
  }

  /**
   * Generate an authentication URL for Google Calendar
   */
  public async getAuthUrl(userId: number, companyId: number): Promise<string | null> {
    const oauth2Client = await this.getOAuth2Client();

    if (!oauth2Client) {
      return null;
    }

    const state = Buffer.from(JSON.stringify({ userId, companyId })).toString('base64');

    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
      state,
      prompt: 'consent'
    });
  }

  /**
   * Handle the OAuth callback and save tokens
   */
  public async handleAuthCallback(req: Request, res: Response): Promise<void> {
    const code = req.query.code as string;
    const stateParam = req.query.state as string;

    if (!code) {
      res.status(400).send('Authorization code not provided');
      return;
    }

    try {
      const stateData = JSON.parse(Buffer.from(stateParam, 'base64').toString());
      const userId = stateData.userId;
      const companyId = stateData.companyId;

      if (!userId || !companyId) {
        res.status(400).send('User ID or Company ID not found in state parameter');
        return;
      }

      const oauth2Client = await this.getOAuth2Client();

      if (!oauth2Client) {
        res.status(400).send('Google Calendar OAuth not configured in admin settings');
        return;
      }

      const { tokens } = await oauth2Client.getToken(code);

      const googleTokens = {
        access_token: tokens.access_token || '',
        refresh_token: tokens.refresh_token || undefined,
        id_token: tokens.id_token || undefined,
        token_type: tokens.token_type || undefined,
        expiry_date: tokens.expiry_date || undefined,
        scope: tokens.scope || undefined
      };

      await storage.saveGoogleTokens(userId, companyId, googleTokens);

      res.redirect('/settings?google_auth=success');
    } catch (error) {
      console.error('Error handling Google auth callback:', error);
      res.status(500).send('Failed to authenticate with Google');
    }
  }

  /**
   * Get an authorized Google Calendar client for a user
   */
  public async getCalendarClient(userId: number, companyId: number): Promise<calendar_v3.Calendar | null> {
    try {
      await this.refreshGoogleTokensForUser(userId, companyId);
      const tokens = await storage.getGoogleTokens(userId, companyId);

      if (!tokens) {
        console.error(`No Google tokens found for user ${userId} in company ${companyId}`);
        return null;
      }

      const oauth2Client = await this.getOAuth2Client();

      if (!oauth2Client) {
        console.error('Google Calendar OAuth not configured in admin settings');
        return null;
      }

      oauth2Client.setCredentials(tokens);
      this.oauthClients.set(`${userId}:${companyId}`, oauth2Client);

      return google.calendar({ version: 'v3', auth: oauth2Client });
    } catch (error) {
      console.error('Error creating Google Calendar client:', error);
      return null;
    }
  }

  /**
   * Check if a time slot is available before booking
   * Uses Google Calendar freebusy.query API to detect conflicts
   * 
   * @param userId The user ID
   * @param companyId The company ID
   * @param startDateTime ISO string of the event start time
   * @param endDateTime ISO string of the event end time
   * @param bufferMinutes Buffer time to add before/after the event (default 0)
   * @returns Object with available flag and optional conflicting events
   */
  private async checkTimeSlotAvailability(
    userId: number,
    companyId: number,
    startDateTime: string,
    endDateTime: string,
    bufferMinutes: number = 0,
    timeZone: string = 'UTC',
    calendarId: string = 'primary'
  ): Promise<{ available: boolean, conflictingEvents?: any[], error?: string }> {
    try {
      const calendar = await this.getCalendarClient(userId, companyId);

      if (!calendar) {
        console.warn('Google Calendar Service: Calendar client not available for availability check');
        return {
          available: false,
          error: 'Calendar client not available for availability check'
        };
      }

      // Validate date inputs
      const startDate = new Date(startDateTime);
      const endDate = new Date(endDateTime);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.error('Google Calendar Service: Invalid date format in availability check', { startDateTime, endDateTime });
        return {
          available: false,
          error: 'Invalid date format provided'
        };
      }

      if (startDate >= endDate) {
        console.error('Google Calendar Service: Start time must be before end time', { startDateTime, endDateTime });
        return {
          available: false,
          error: 'Start time must be before end time'
        };
      }

      // Apply buffer to time range for query
      const queryStartDate = new Date(startDate);
      queryStartDate.setMinutes(queryStartDate.getMinutes() - bufferMinutes);
      const queryEndDate = new Date(endDate);
      queryEndDate.setMinutes(queryEndDate.getMinutes() + bufferMinutes);

      const requestedStart = queryStartDate.getTime();
      const requestedEnd = queryEndDate.getTime();

      const timeMin = queryStartDate.toISOString();
      const timeMax = queryEndDate.toISOString();

      // Query Google Calendar freebusy API with retry logic
      const busyTimeSlotsResponse = await this.withRetry(() =>
        calendar.freebusy.query({
          requestBody: {
            timeMin: timeMin,
            timeMax: timeMax,
            timeZone,
            items: [{ id: calendarId }],
          },
        })
        , 0, { userId, companyId, action: 'freebusy.check_availability' }
      );

      const busySlots = busyTimeSlotsResponse.data.calendars?.[calendarId]?.busy || [];

      // Check for overlapping busy slots from Google Calendar
      const conflictingSlots = busySlots.filter((busySlot: any) => {
        if (!busySlot.start || !busySlot.end) {
          return false;
        }

        const busyStart = new Date(busySlot.start).getTime();
        const busyEnd = new Date(busySlot.end).getTime();

        return requestedStart < busyEnd && requestedEnd > busyStart;
      });

      if (conflictingSlots.length > 0) {
        return { available: false, conflictingEvents: conflictingSlots };
      }

      return { available: true };
    } catch (error: any) {
      console.error('Google Calendar Service: Error checking time slot availability:', error.message);

      return {
        available: false,
        error: error.message || 'Failed to check availability'
      };
    }
  }

  /**
   * Check if the same user has booked the same slot within the last 2 minutes
   * This prevents duplicate bookings from AI retries or user double-clicks
   * @param userId The user ID
   * @param companyId The company ID
   * @param startDateTime Start datetime ISO string
   * @param endDateTime End datetime ISO string
   * @returns true if a recent booking exists, false otherwise
   */

  /**
   * Create a calendar event
   * Includes conflict detection to prevent double bookings
   * 
   * Buffer time is applied to prevent back-to-back bookings.
   * This allows for overrun/setup time between appointments and ensures proper spacing.
   * 
   * @param userId The user ID
   * @param companyId The company ID
   * @param eventData Event data including start, end, summary, etc.
   * @param eventData.bufferMinutes Optional buffer minutes to respect when checking for conflicts
   *                                 Buffer is applied before and after the event to prevent adjacent bookings
   *                                 CRITICAL: This is the single source of truth for buffer configuration.
   *                                 Must match the bufferMinutes used in getAvailableTimeSlots for consistency.
   * @returns Success status with event ID and link, or error message
   */
  public async createCalendarEvent(
    userId: number,
    companyId: number,
    eventData: any
  ): Promise<{ success: boolean, code?: 'overlap' | 'auth' | 'rate_limit' | 'concurrent_booking_in_progress' | 'unknown', eventId?: string, error?: string, eventLink?: string }> {
    const auditStart = Date.now();
    let lockToken: string | undefined;
    let pendingBookingId: number | undefined;
    const {
      summary,
      description,
      location,
      start,
      end,
      attendees = [],
      send_updates = true,
      organizer_email,
      time_zone,
      colorId
    } = eventData;
    const calendarId = eventData.calendarId || 'primary';
    const lockCalendarType = `google:${calendarId}`;

    const startDateTime = start?.dateTime;
    const endDateTime = end?.dateTime;
    const requestedZone = time_zone || start?.timeZone || end?.timeZone || 'UTC';
    const eventTimeZone = validateTimezone(requestedZone) ? normalizeTimezone(requestedZone) : 'UTC';

    if (!startDateTime || !endDateTime) {
      console.error('Google Calendar Service: Missing start or end time');
      return { success: false, code: 'unknown', error: 'Start and end times are required' };
    }

    const parseCalendarInput = (value: string): Date => {
      return /[zZ]$|[+-]\d{2}:\d{2}$/.test(value.trim())
        ? new Date(value)
        : parseInZoneToUTC(value, eventTimeZone);
    };

    const bufferMinutes = eventData.bufferMinutes || 0;
    let startDate: Date;
    let endDate: Date;
    try {
      startDate = parseCalendarInput(startDateTime);
      endDate = parseCalendarInput(endDateTime);
    } catch (error: any) {
      const result = { success: false as const, code: 'unknown' as const, error: error.message || 'invalid_slot_range' };
      await calendarAuditLogger.log({ action: 'book', userId, companyId, payload: { startDateTime, endDateTime, calendarId }, result, error, latencyMs: Date.now() - auditStart });
      return result;
    }

    if (!this.isValidDate(startDate) || !this.isValidDate(endDate) || startDate.getTime() >= endDate.getTime()) {
      const result = { success: false as const, code: 'unknown' as const, error: 'invalid_slot_range' };
      await calendarAuditLogger.log({ action: 'book', userId, companyId, payload: { startDateTime, endDateTime, calendarId }, result, latencyMs: Date.now() - auditStart });
      return result;
    }

    const bufferedRange = this.getBufferedRange(startDate, endDate, bufferMinutes);
    const attendeeEmail = Array.isArray(attendees)
      ? (typeof attendees[0] === 'string' ? attendees[0] : attendees[0]?.email)
      : undefined;
    const idempotencyKeyMaterial = `${userId}:${companyId}:${calendarId}:${startDate.toISOString()}:${endDate.toISOString()}:${attendeeEmail || ''}`;
    const idempotencyKey = createHash('sha256').update(idempotencyKeyMaterial).digest('base64url');

    try {
      const lockResult = await storage.acquireSlotLock(
        userId,
        companyId,
        lockCalendarType,
        bufferedRange.start,
        bufferedRange.end,
        eventData.traceId || eventData.conversationId || `google-calendar-service:${calendarId}`,
        120
      );

      if (!lockResult.success || !lockResult.lock) {
        const storageError = lockResult.error || 'failed_to_acquire_lock';
        const result = storageError === 'lock_conflict'
          ? { success: false as const, code: 'concurrent_booking_in_progress' as const, error: 'Another booking is in progress for this time slot' }
          : { success: false as const, code: 'unknown' as const, error: storageError };
        await calendarAuditLogger.log({ action: 'book', userId, companyId, payload: { startDateTime, endDateTime, calendarId }, result, latencyMs: Date.now() - auditStart });
        return result;
      }

      lockToken = lockResult.lock.lockToken;

      const { calendarReconciliationService } = await import('./calendar-reconciliation');
      const dayStart = new Date(startDate);
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      const reconcileResult = await calendarReconciliationService.reconcileRange(userId, companyId, dayStart, dayEnd, calendarId);
      if (!reconcileResult.success) {
        const result = { success: false as const, code: 'unknown' as const, error: 'Calendar sync could not be verified. Please try again.' };
        await calendarAuditLogger.log({ action: 'book', userId, companyId, payload: { startDateTime, endDateTime, calendarId }, result, latencyMs: Date.now() - auditStart });
        return result;
      }

      const calendar = await this.getCalendarClient(userId, companyId);

      if (!calendar) {
        console.error('Google Calendar Service: Calendar client not available');
        return { success: false, code: 'auth', error: 'Google Calendar client not available' };
      }

      const recoverExistingBooking = async (
        existingBooking: CalendarBooking | null,
        source: string
      ): Promise<{ success: true; eventId: string; eventLink?: string } | null> => {
        if (!existingBooking || !['pending', 'confirmed'].includes(existingBooking.status)) {
          return null;
        }

        if (!this.isSameBookingRequest(existingBooking, startDate, endDate)) {
          return null;
        }

        const existingEvent = existingBooking.eventId
          ? await this.getGoogleEventById(calendar, userId, companyId, existingBooking.eventId, calendarId)
          : await this.findExistingEventByIdempotencyKey(
            calendar,
            userId,
            companyId,
            calendarId,
            idempotencyKey,
            startDate,
            endDate
          );

        if (!existingEvent?.id) {
          return null;
        }

        if (existingBooking.status !== 'confirmed' || existingBooking.eventId !== existingEvent.id) {
          await storage.markBookingConfirmed(
            existingBooking.id,
            existingEvent.etag || null,
            existingEvent.id,
            existingEvent.htmlLink || null
          );
        }

        const result = {
          success: true as const,
          eventId: existingEvent.id,
          eventLink: existingEvent.htmlLink || undefined
        };
        await calendarAuditLogger.log({
          action: 'book',
          userId,
          companyId,
          payload: { startDateTime, endDateTime, idempotencyKey, calendarId, reusedBookingId: existingBooking.id, source },
          result,
          latencyMs: Date.now() - auditStart
        });
        return result;
      };

      const recoverCurrentIdempotencyKey = async (source: string) => recoverExistingBooking(
        await storage.getCalendarBookingByIdempotencyKey(
          userId,
          companyId,
          'google',
          calendarId,
          idempotencyKey
        ),
        source
      );

      const recoveredBeforeAvailability = await recoverCurrentIdempotencyKey('pre_availability_recovery');
      if (recoveredBeforeAvailability) {
        return recoveredBeforeAvailability;
      }

      const availabilityCheck = await this.checkTimeSlotAvailability(
        userId,
        companyId,
        startDate.toISOString(),
        endDate.toISOString(),
        bufferMinutes,
        eventTimeZone,
        calendarId
      );

      if (!availabilityCheck.available) {
        const recoveredAfterConflict = await recoverCurrentIdempotencyKey('availability_conflict_recovery');
        if (recoveredAfterConflict) {
          return recoveredAfterConflict;
        }

        const existingEvent = await this.findExistingEventByIdempotencyKey(
          calendar,
          userId,
          companyId,
          calendarId,
          idempotencyKey,
          startDate,
          endDate
        );
        if (existingEvent?.id) {
          const recoveredBooking = await storage.createCalendarBooking({
            userId,
            companyId,
            calendarType: 'google',
            calendarId,
            startDateTime: startDate,
            endDateTime: endDate,
            bufferStartDateTime: bufferedRange.start,
            bufferEndDateTime: bufferedRange.end,
            bufferMinutes,
            eventId: existingEvent.id,
            eventLink: existingEvent.htmlLink || undefined,
            status: 'confirmed',
            idempotencyKey,
            etag: existingEvent.etag || undefined
          });

          if (recoveredBooking.success) {
            const result = {
              success: true as const,
              eventId: existingEvent.id,
              eventLink: existingEvent.htmlLink || undefined
            };
            await calendarAuditLogger.log({
              action: 'book',
              userId,
              companyId,
              payload: { startDateTime, endDateTime, idempotencyKey, calendarId, recoveredBookingId: recoveredBooking.bookingId, source: 'availability_conflict_extended_property_lookup' },
              result,
              latencyMs: Date.now() - auditStart
            });
            return result;
          }
        }

        const conflictDetails = availabilityCheck.conflictingEvents?.map((event: any) => 
          `Event (${event.start} - ${event.end})`
        ).join('; ') || availabilityCheck.error || 'Unknown conflict';
        const result = { success: false as const, code: 'overlap' as const, error: `Google Calendar conflict detected. Conflicting event(s): ${conflictDetails}` };
        await calendarAuditLogger.log({ action: 'book', userId, companyId, payload: { startDateTime, endDateTime, bufferMinutes, calendarId }, result, latencyMs: Date.now() - auditStart });
        return result;
      }

      let bookingResult = await storage.createCalendarBooking({
        userId,
        companyId,
        calendarType: 'google',
        calendarId,
        startDateTime: startDate,
        endDateTime: endDate,
        bufferStartDateTime: bufferedRange.start,
        bufferEndDateTime: bufferedRange.end,
        bufferMinutes,
        status: 'pending',
        idempotencyKey
      });

      if (!bookingResult.success && bookingResult.error === 'overlapping_booking') {
        const orphanedConflicts = await this.markOrphanedConflictingBookings(
          calendar,
          userId,
          companyId,
          bufferedRange.start,
          bufferedRange.end,
          calendarId
        );

        if (orphanedConflicts) {
          bookingResult = await storage.createCalendarBooking({
            userId,
            companyId,
            calendarType: 'google',
            calendarId,
            startDateTime: startDate,
            endDateTime: endDate,
            bufferStartDateTime: bufferedRange.start,
            bufferEndDateTime: bufferedRange.end,
            bufferMinutes,
            status: 'pending',
            idempotencyKey
          });
        }
      }

      if (!bookingResult.success && bookingResult.error === 'idempotency_key_conflict') {
        const existingBooking = bookingResult.booking || await storage.getCalendarBookingByIdempotencyKey(
          userId,
          companyId,
          'google',
          calendarId,
          idempotencyKey
        );

        if (existingBooking && ['pending', 'confirmed'].includes(existingBooking.status)) {
          if (!this.isSameBookingRequest(existingBooking, startDate, endDate)) {
            const result = { success: false as const, code: 'overlap' as const, error: 'idempotency_key_conflict' };
            await calendarAuditLogger.log({ action: 'book', userId, companyId, payload: { startDateTime, endDateTime, idempotencyKey, calendarId }, result, latencyMs: Date.now() - auditStart });
            return result;
          }

          const existingEvent = existingBooking.eventId
            ? await this.getGoogleEventById(calendar, userId, companyId, existingBooking.eventId, calendarId)
            : await this.findExistingEventByIdempotencyKey(
              calendar,
              userId,
              companyId,
              calendarId,
              idempotencyKey,
              startDate,
              endDate
            );
          if (existingEvent?.id) {
            if (!existingBooking.eventId) {
              await calendarAuditLogger.log({
                action: 'recover',
                userId,
                companyId,
                payload: { calendarId, idempotencyKey, source: 'extended_property_lookup' },
                result: { eventId: existingEvent.id, reusedBookingId: existingBooking.id },
                latencyMs: Date.now() - auditStart
              });
            }

            if (existingBooking.status !== 'confirmed' || existingBooking.eventId !== existingEvent.id) {
              await storage.markBookingConfirmed(
                existingBooking.id,
                existingEvent.etag || null,
                existingEvent.id,
                existingEvent.htmlLink || null
              );
            }

            const result = {
              success: true,
              eventId: existingEvent.id,
              eventLink: existingEvent.htmlLink || undefined
            };
            await calendarAuditLogger.log({ action: 'book', userId, companyId, payload: { startDateTime, endDateTime, idempotencyKey, calendarId, reusedBookingId: existingBooking.id }, result, latencyMs: Date.now() - auditStart });
            return result;
          }

          if (existingBooking.status === 'confirmed' && existingBooking.eventId) {
            await storage.markBookingOrphaned(existingBooking.id);
            bookingResult = await storage.createCalendarBooking({
              userId,
              companyId,
              calendarType: 'google',
              calendarId,
              startDateTime: startDate,
              endDateTime: endDate,
              bufferStartDateTime: bufferedRange.start,
              bufferEndDateTime: bufferedRange.end,
              bufferMinutes,
              status: 'pending',
              idempotencyKey
            });
          } else {
            bookingResult = { success: true, bookingId: existingBooking.id, booking: existingBooking };
          }
        }
      }

      if (!bookingResult.success || !bookingResult.bookingId) {
        const result = { success: false as const, code: 'overlap' as const, error: bookingResult.error || 'overlapping_booking' };
        await calendarAuditLogger.log({ action: 'book', userId, companyId, payload: { startDateTime, endDateTime, idempotencyKey, calendarId }, result, latencyMs: Date.now() - auditStart });
        return result;
      }
      pendingBookingId = bookingResult.bookingId;

      let processedAttendees: calendar_v3.Schema$EventAttendee[] | undefined;
      if (attendees && attendees.length > 0) {
        if (typeof attendees[0] === 'string') {
          processedAttendees = attendees.map((emailAddress: string) => ({ email: emailAddress }));
        } else {
          processedAttendees = attendees.map((attendee: any) => ({
            email: attendee.email,
            displayName: attendee.displayName || attendee.display_name
          }));
        }
      }

      const ownershipIdentity: CalendarRequesterIdentity | null =
        eventData.contactOwnership && typeof eventData.contactOwnership === 'object'
          ? eventData.contactOwnership
          : null;
      const ownershipProps = ownershipIdentity
        ? buildContactOwnershipPrivateProps(ownershipIdentity)
        : {};
      const normalizedDescription = appendOwnershipToDescription(
        description == null ? '' : String(description).trim(),
        ownershipIdentity || {},
      );
      const event: calendar_v3.Schema$Event = {
        summary,
        description: normalizedDescription,
        location,
        start: {
          dateTime: startDate.toISOString(),
          timeZone: eventTimeZone,
        },
        end: {
          dateTime: endDate.toISOString(),
          timeZone: eventTimeZone,
        },
        attendees: processedAttendees,
        organizer: organizer_email ? { email: organizer_email } : undefined,
        colorId: colorId || undefined,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 },
            { method: 'popup', minutes: 30 },
          ],
        },
        extendedProperties: {
          private: {
            bothiveIdempotencyKey: idempotencyKey,
            ...ownershipProps,
          }
        },
      };

      const sendUpdatesParam = send_updates ? 'all' : 'none';

      const response = await this.insertCalendarEventIdempotently(
        calendar,
        userId,
        companyId,
        event,
        sendUpdatesParam,
        calendarId,
        idempotencyKey,
        startDate,
        endDate
      );

      if (response.status === 200 && response.data.id) {
        await storage.markBookingConfirmed(
          pendingBookingId,
          response.data.etag || null,
          response.data.id,
          response.data.htmlLink || null
        );

        const result: {
          success: boolean;
          eventId?: string;
          eventLink?: string;
        } = {
          success: true,
          eventId: response.data.id
        };

        if (response.data.htmlLink) {
          result.eventLink = response.data.htmlLink;
        }

        await calendarAuditLogger.log({ action: 'book', userId, companyId, payload: { startDateTime, endDateTime, idempotencyKey, calendarId }, result, latencyMs: Date.now() - auditStart });
        return result;
      } else {
        console.error('Google Calendar Service: Unexpected response status:', {
          status: response.status,
          data: response.data,
          startDateTime,
          endDateTime
        });
        await storage.markBookingCancelled(pendingBookingId, 'google_insert_failed');
        return { success: false, code: 'unknown', error: `Failed to create event, status code: ${response.status}` };
      }
    } catch (error: any) {
      if (pendingBookingId && !error?.calendarInsertOutcomeUnknown) {
        await storage.markBookingCancelled(pendingBookingId, 'google_insert_failed');
      }
      console.error('Google Calendar Service: Error creating calendar event:', {
        error: error.message,
        stack: error.stack,
        userId,
        companyId,
        eventData
      });
      const statusCode = error?.response?.status || error?.code;
      const result = {
        success: false,
        code: statusCode === 401 ? 'auth' as const : statusCode === 429 ? 'rate_limit' as const : 'unknown' as const,
        error: error?.calendarInsertOutcomeUnknown
          ? 'Google Calendar insert outcome is pending. Please retry to recover the booking.'
          : error.message || 'Failed to create calendar event'
      };
      await calendarAuditLogger.log({ action: 'book', userId, companyId, payload: { startDateTime, endDateTime, calendarId }, result, error, latencyMs: Date.now() - auditStart });
      return result;
    } finally {
      if (lockToken) {
        await storage.releaseSlotLock(lockToken);
      }
    }
  }

  /**
   * Ensure timed and all-day events expose a consistent shape: optional `date` is kept,
   * `dateTime` is always set for clients that only read dateTime. All-day events use
   * Google's exclusive end date in `end.date` / synthetic `end.dateTime`.
   */
  private normalizeListEventItem(event: any): any {
    if (!event) return event;
    const start = event.start;
    const end = event.end;
    const allDay = !!(start?.date && !start?.dateTime);

    const next = { ...event };
    if (start?.date && !start?.dateTime) {
      next.start = { ...start, dateTime: `${start.date}T00:00:00` };
    }
    if (end?.date && !end?.dateTime) {
      next.end = { ...end, dateTime: `${end.date}T00:00:00` };
    }
    if (allDay) {
      next.allDay = true;
    }
    return next;
  }

  /**
   * List calendar events for a specific time range.
   * AI/customer callers must pass a requester identity (fail-closed).
   * Staff/internal callers must pass `bypassContactPrivacyFilter: true`.
   *
   * Legacy signature still accepts `requesterEmail?: string` as the 6th arg and
   * `calendarId?: string` as the 7th.
   */
  public async listCalendarEvents(
    userId: number,
    companyId: number,
    timeMin: string,
    timeMax: string,
    maxResults: number = 10,
    requesterEmailOrOptions?: string | ListGoogleCalendarEventsOptions,
    calendarIdLegacy: string = 'primary'
  ): Promise<any> {
    try {
      const options: ListGoogleCalendarEventsOptions =
        requesterEmailOrOptions && typeof requesterEmailOrOptions === 'object'
          ? requesterEmailOrOptions
          : {
              requesterEmail:
                typeof requesterEmailOrOptions === 'string' ? requesterEmailOrOptions : undefined,
              calendarId: calendarIdLegacy,
            };
      const calendarId = options.calendarId || calendarIdLegacy || 'primary';
      const requester: CalendarRequesterIdentity | null = options.requester
        ? options.requester
        : options.requesterEmail
          ? { email: String(options.requesterEmail).trim().toLowerCase() }
          : null;

      const calendar = await this.getCalendarClient(userId, companyId);

      if (!calendar) {
        return { success: false, error: 'Google Calendar client not available' };
      }


      let startTime: string;
      let endTime: string;

      if (!timeMin || !timeMax) {
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

        startTime = timeMin ? (typeof timeMin === 'string' ? timeMin : new Date(timeMin).toISOString()) : thirtyDaysAgo.toISOString();
        endTime = timeMax ? (typeof timeMax === 'string' ? timeMax : new Date(timeMax).toISOString()) : thirtyDaysLater.toISOString();

        console.warn('Google Calendar listCalendarEvents: Defaulting list range to ±30 days due to missing timeMin/timeMax');
      } else {
        startTime = typeof timeMin === 'string' ? timeMin : new Date(timeMin).toISOString();
        endTime = typeof timeMax === 'string' ? timeMax : new Date(timeMax).toISOString();
      }

      // Fetch more than maxResults when privacy-filtering so owned events are not truncated away
      const fetchLimit = options.bypassContactPrivacyFilter
        ? maxResults
        : Math.min(Math.max(maxResults * 5, 50), 250);

      const response = await this.withRetry(() =>
        calendar.events.list({
          calendarId,
          timeMin: startTime,
          timeMax: endTime,
          maxResults: fetchLimit,
          singleEvents: true,
          orderBy: 'startTime'
        })
        , 0, { userId, companyId, action: 'events.list' }
      );

      let items = response.data.items || [];

      items = filterEventsForContact(items, requester, {
        bypassContactPrivacyFilter: options.bypassContactPrivacyFilter === true,
      });

      items = items
        .slice(0, maxResults)
        .map((event: any) => this.normalizeListEventItem(event))
        .map((event: any) =>
          options.bypassContactPrivacyFilter ? event : sanitizeCalendarEventForContact(event),
        );

      return {
        success: true,
        items: items,
        nextPageToken: response.data.nextPageToken
      };
    } catch (error: any) {
      console.error('Error listing calendar events:', error);
      return {
        success: false,
        error: error.message || 'Failed to list calendar events',
        items: []
      };
    }
  }

  /** Fetch a single event (for ownership checks before cancel/update). */
  public async getCalendarEvent(
    userId: number,
    companyId: number,
    eventId: string,
    calendarId: string = 'primary'
  ): Promise<{ success: boolean; event?: any; error?: string }> {
    try {
      const calendar = await this.getCalendarClient(userId, companyId);
      if (!calendar) {
        return { success: false, error: 'Google Calendar client not available' };
      }
      const response = await this.withRetry(
        () =>
          calendar.events.get({
            calendarId,
            eventId,
          }),
        0,
        { userId, companyId, action: 'events.get' },
      );
      return { success: true, event: response.data };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get calendar event',
      };
    }
  }

  /** True when the event belongs to the conversation contact (fail-closed). */
  public eventOwnedByRequester(
    event: any,
    requester: CalendarRequesterIdentity | null | undefined,
  ): boolean {
    return eventBelongsToContact(event, requester || {});
  }

  /**
   * Delete (cancel) a calendar event
   * @param userId The user ID
   * @param companyId The company ID
   * @param eventId The ID of the event to delete (optional if eventLink is provided)
   * @param sendUpdates Whether to send cancellation notifications to attendees
   * @param eventLink The event link URL (used to lookup eventId if eventId is not provided)
   */
  public async deleteCalendarEvent(
    userId: number,
    companyId: number,
    eventId?: string,
    sendUpdates: boolean = true,
    eventLink?: string,
    calendarId: string = 'primary'
  ): Promise<{ success: boolean, error?: string }> {
    try {
      const calendar = await this.getCalendarClient(userId, companyId);

      if (!calendar) {
        return { success: false, error: 'Google Calendar client not available' };
      }

      // If eventLink is provided and eventId is not, try direct database lookup first
      let finalEventId: string | null = eventId || null;
      if (eventLink && !eventId) {
        // First try direct lookup by event link (most reliable)
        const booking = await storage.getCalendarBookingByEventLink(userId, companyId, 'google', eventLink, calendarId);
        if (booking && booking.eventId) {
          finalEventId = booking.eventId;
        } else {
          // Fall back to extracting event ID from link if database lookup fails
          finalEventId = storage.extractEventIdFromLink(eventLink);
          if (!finalEventId) {
            return { success: false, error: 'Could not extract event ID from event link' };
          }
        }
      }

      // At this point, finalEventId must be a string (either from eventId or extracted from link)
      if (!finalEventId) {
        return { success: false, error: 'Event ID is required to delete the event' };
      }

      const sendUpdatesParam = sendUpdates ? 'all' : 'none';

      const response = await this.withRetry(() =>
        calendar.events.delete({
          calendarId,
          eventId: finalEventId,
          sendUpdates: sendUpdatesParam
        })
        , 0, { userId, companyId, action: 'events.delete' }
      );

      if (response.status === 204 || response.status === 200) {
        // Also delete the booking record from database
        await storage.deleteCalendarBooking(userId, companyId, 'google', finalEventId, calendarId);
        await calendarAuditLogger.log({
          action: 'cancel',
          userId,
          companyId,
          payload: { eventId: finalEventId, eventLink, calendarId },
          result: { success: true }
        });
        return { success: true };
      } else {
        return {
          success: false,
          error: `Failed to delete event, status code: ${response.status}`
        };
      }
    } catch (error: any) {
      console.error('Error deleting calendar event:', error);
      return {
        success: false,
        error: error.message || 'Failed to delete calendar event'
      };
    }
  }

  /**
   * Get a calendar booking by event link
   * @param userId The user ID
   * @param companyId The company ID
   * @param eventLink The Google Calendar event link
   * @returns The calendar booking if found, null otherwise
   */
  public async getBookingByEventLink(userId: number, companyId: number, eventLink: string, calendarId: string = 'primary'): Promise<CalendarBooking | null> {
    try {
      // First try direct lookup by event link (most reliable)
      const booking = await storage.getCalendarBookingByEventLink(userId, companyId, 'google', eventLink, calendarId);
      if (booking) {
        return booking;
      }

      // Fall back to extracting event ID from link and looking up by event ID
      const eventId = storage.extractEventIdFromLink(eventLink);
      if (!eventId) {
        return null;
      }

      return await storage.getCalendarBookingByEventId(userId, companyId, 'google', eventId, calendarId);
    } catch (error: any) {
      console.error('Error getting booking by event link:', error);
      return null;
    }
  }

  /**
   * Update an existing calendar event
   * @param userId The user ID
   * @param eventId The ID of the event to update
   * @param eventData The updated event data
   */
  public async updateCalendarEvent(
    userId: number,
    companyId: number,
    eventId: string,
    eventData: any,
    calendarId: string = eventData?.calendarId || 'primary'
  ): Promise<{ success: boolean, error?: string, eventId?: string, eventLink?: string }> {
    let lockToken: string | undefined;
    const lockCalendarType = `google:${calendarId}`;
    try {
      const calendar = await this.getCalendarClient(userId, companyId);

      if (!calendar) {
        return { success: false, error: 'Google Calendar client not available' };
      }

      // Fetch existing event first to preserve all fields
      const existingEventResponse = await this.withRetry(() =>
        calendar.events.get({
          calendarId,
          eventId: eventId
        })
        , 0, { userId, companyId, action: 'events.get' }
      );

      if (!existingEventResponse.data) {
        return { success: false, error: 'Event not found' };
      }

      const existingEvent = existingEventResponse.data;

      const { send_updates = true, time_zone, attendees, colorId, ...restEventData } = eventData;


      let processedAttendees: calendar_v3.Schema$EventAttendee[] | undefined;
      if (attendees && attendees.length > 0) {
        if (typeof attendees[0] === 'string') {
          processedAttendees = attendees.map((emailAddress: string) => ({ email: emailAddress }));
        } else {
          processedAttendees = attendees.map((attendee: any) => ({
            email: attendee.email,
            displayName: attendee.displayName || attendee.display_name
          }));
        }
      }

      // Merge existing event with updates, preserving existing fields
      const updatedEventData: any = {
        ...existingEvent,
        ...restEventData,
        summary: restEventData.summary !== undefined ? restEventData.summary : existingEvent.summary,
        description: restEventData.description !== undefined ? restEventData.description : existingEvent.description,
        location: restEventData.location !== undefined ? restEventData.location : existingEvent.location,
      };

      if (time_zone) {
        if (updatedEventData.start) {
          updatedEventData.start.timeZone = time_zone;
        }
        if (updatedEventData.end) {
          updatedEventData.end.timeZone = time_zone;
        }
      }

      if (processedAttendees) {
        updatedEventData.attendees = processedAttendees;
      }

      const newStartValue = updatedEventData.start?.dateTime;
      const newEndValue = updatedEventData.end?.dateTime;
      const oldStartValue = existingEvent.start?.dateTime;
      const oldEndValue = existingEvent.end?.dateTime;
      let updatedStart: Date | undefined;
      let updatedEnd: Date | undefined;
      let updatedBufferedRange: { start: Date; end: Date } | undefined;
      if (newStartValue && newEndValue && (newStartValue !== oldStartValue || newEndValue !== oldEndValue)) {
        const resolvedZone = validateTimezone(time_zone || updatedEventData.start?.timeZone || updatedEventData.end?.timeZone || 'UTC')
          ? normalizeTimezone(time_zone || updatedEventData.start?.timeZone || updatedEventData.end?.timeZone || 'UTC')
          : 'UTC';
        const parseCalendarInput = (value: string): Date => /[zZ]$|[+-]\d{2}:\d{2}$/.test(value.trim())
          ? new Date(value)
          : parseInZoneToUTC(value, resolvedZone);
        let newStart: Date;
        let newEnd: Date;
        try {
          newStart = parseCalendarInput(newStartValue);
          newEnd = parseCalendarInput(newEndValue);
        } catch {
          return { success: false, error: 'invalid_slot_range' };
        }
        if (!this.isValidDate(newStart) || !this.isValidDate(newEnd) || newStart.getTime() >= newEnd.getTime()) {
          return { success: false, error: 'invalid_slot_range' };
        }
        const bufferMinutes = eventData.bufferMinutes || 0;
        const bufferedRange = this.getBufferedRange(newStart, newEnd, bufferMinutes);
        const lockResult = await storage.acquireSlotLock(userId, companyId, lockCalendarType, bufferedRange.start, bufferedRange.end, `update:${calendarId}:${eventId}`, 120);
        if (!lockResult.success || !lockResult.lock) {
          return {
            success: false,
            error: lockResult.error === 'lock_conflict'
              ? 'Another booking is in progress for this time slot'
              : lockResult.error || 'failed_to_acquire_lock'
          };
        }
        lockToken = lockResult.lock.lockToken;

        const conflicts = await this.listEventConflictsExcluding(calendar, userId, companyId, bufferedRange.start, bufferedRange.end, eventId, calendarId);
        if (conflicts.length > 0) {
          return { success: false, error: 'Updated event time overlaps with an existing Google Calendar event' };
        }

        updatedEventData.start.dateTime = newStart.toISOString();
        updatedEventData.end.dateTime = newEnd.toISOString();
        updatedStart = newStart;
        updatedEnd = newEnd;
        updatedBufferedRange = bufferedRange;
      }

      // Update colorId if provided
      if (colorId !== undefined) {
        updatedEventData.colorId = colorId;
      }

      const sendUpdatesParam = send_updates ? 'all' : 'none';

      const response = await this.withRetry(() =>
        calendar.events.update({
          calendarId,
          eventId: eventId,
          requestBody: updatedEventData,
          sendUpdates: sendUpdatesParam
        })
        , 0, { userId, companyId, action: 'events.update' }
      );

      if (response.status === 200) {
        const responseStartValue = response.data.start?.dateTime || response.data.start?.date;
        const responseEndValue = response.data.end?.dateTime || response.data.end?.date;
        if (response.data.id && (updatedStart && updatedEnd || responseStartValue && responseEndValue)) {
          const bookingStart = updatedStart || new Date(responseStartValue as string);
          const bookingEnd = updatedEnd || new Date(responseEndValue as string);
          const bufferMinutes = eventData.bufferMinutes || 0;
          const bookingBufferedRange = updatedBufferedRange || this.getBufferedRange(bookingStart, bookingEnd, bufferMinutes);
          await storage.updateCalendarBookingEvent(userId, companyId, 'google', response.data.id, {
            startDateTime: bookingStart,
            endDateTime: bookingEnd,
            bufferStartDateTime: bookingBufferedRange.start,
            bufferEndDateTime: bookingBufferedRange.end,
            bufferMinutes,
            etag: response.data.etag || null,
            eventLink: response.data.htmlLink || null
          }, calendarId);
        }

        const result: {
          success: boolean,
          eventId?: string,
          eventLink?: string
        } = {
          success: true,
          eventId: response.data.id as string | undefined
        };

        if (response.data.htmlLink) {
          result.eventLink = response.data.htmlLink;
        }

        return result;
      } else {
        return {
          success: false,
          error: `Failed to update event, status code: ${response.status}`
        };
      }
    } catch (error: any) {
      console.error('Error updating calendar event:', error);
      return {
        success: false,
        error: error.message || 'Failed to update calendar event'
      };
    } finally {
      if (lockToken) {
        await storage.releaseSlotLock(lockToken);
      }
    }
  }

  private getNextCalendarDate(date: string): string {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  }

  private getDayOfWeekFromDateLabel(date: string): number {
    const [year, month, day] = date.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).getUTCDay();
  }

  /**
   * Find appointment by date and time
   * Useful for finding an appointment to cancel or update
   * @param userId The user ID
   * @param companyId The company ID
   * @param date The date of the appointment (YYYY-MM-DD)
   * @param time The time of the appointment (HH:MM in 24-hour format)
   * @param emailOrRequester Optional email string or full requester identity (fail-closed for AI)
   * @param timeZone Optional timezone (defaults to UTC)
   */
  public async findAppointmentByDateTime(
    userId: number,
    companyId: number,
    date: string,
    time: string,
    emailOrRequester?: string | CalendarRequesterIdentity,
    timeZone: string = 'UTC',
    calendarId: string = 'primary'
  ): Promise<{ success: boolean, eventId?: string, error?: string }> {
    try {
      const requester: CalendarRequesterIdentity | null =
        emailOrRequester && typeof emailOrRequester === 'object'
          ? emailOrRequester
          : typeof emailOrRequester === 'string' && emailOrRequester.trim()
            ? { email: emailOrRequester.trim().toLowerCase() }
            : null;

      const appointmentDateTime = parseInZoneToUTC(`${date}T${time}:00`, timeZone);
      const timeMin = new Date(appointmentDateTime.getTime() - 30 * 60000).toISOString();
      const timeMax = new Date(appointmentDateTime.getTime() + 30 * 60000).toISOString();

      const events = await this.listCalendarEvents(userId, companyId, timeMin, timeMax, 10, {
        requester,
        calendarId,
        bypassContactPrivacyFilter: false,
      });

      if (!events.success) {
        return { success: false, error: events.error };
      }

      const pickOwned = (items: any[]): string | undefined => {
        if (!items?.length) return undefined;
        if (!hasUsableRequesterIdentity(requester)) {
          return undefined;
        }
        const owned = items.find((event) => eventBelongsToContact(event, requester!));
        return owned?.id;
      };

      let eventId = pickOwned(events.items || []);
      if (eventId) {
        return { success: true, eventId };
      }

      if ((events.items || []).length === 0) {
        const [year, month, day] = date.split('-').map(Number);

        if (month !== day && month <= 12 && day <= 12) {
          const alternateDate = `${year}-${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}`;
          const alternateDateTime = parseInZoneToUTC(`${alternateDate}T${time}:00`, timeZone);
          const altTimeMin = new Date(alternateDateTime.getTime() - 30 * 60000).toISOString();
          const altTimeMax = new Date(alternateDateTime.getTime() + 30 * 60000).toISOString();

          const altEvents = await this.listCalendarEvents(userId, companyId, altTimeMin, altTimeMax, 10, {
            requester,
            calendarId,
            bypassContactPrivacyFilter: false,
          });

          eventId = pickOwned(altEvents.items || []);
          if (eventId) {
            return { success: true, eventId };
          }
        }
      }

      return { success: false, error: 'No appointment found at specified date and time' };
    } catch (error: any) {
      console.error('[findAppointmentByDateTime] Error finding appointment:', error);
      return {
        success: false,
        error: error.message || 'Failed to find appointment'
      };
    }
  }

  /**
   * Check the connection status of the Google Calendar integration
   */
  public async listUserCalendars(
    userId: number,
    companyId: number
  ): Promise<{
    success: boolean;
    calendars: Array<{
      id: string;
      summary: string;
      summaryOverride?: string | null;
      description?: string | null;
      primary: boolean;
      accessRole?: string | null;
      backgroundColor?: string | null;
      foregroundColor?: string | null;
      timeZone?: string | null;
      selected?: boolean | null;
    }>;
    error?: string;
  }> {
    const auditStart = Date.now();
    try {
      const calendar = await this.getCalendarClient(userId, companyId);

      if (!calendar) {
        const result = { success: false as const, calendars: [], error: 'not_connected' };
        await calendarAuditLogger.log({
          action: 'list_calendars',
          userId,
          companyId,
          payload: {},
          result,
          latencyMs: Date.now() - auditStart
        });
        return result;
      }

      const response = await this.withRetry(() =>
        calendar.calendarList.list({
          minAccessRole: 'writer',
          showHidden: false
        })
        , 0, { userId, companyId, action: 'calendarList.list' }
      );

      const calendars = (response.data.items || [])
        .filter((item) => item.id && (item.accessRole === 'owner' || item.accessRole === 'writer'))
        .map((item) => ({
          id: item.id as string,
          summary: item.summary || item.id as string,
          summaryOverride: item.summaryOverride || null,
          description: item.description || null,
          primary: Boolean(item.primary),
          accessRole: item.accessRole || null,
          backgroundColor: item.backgroundColor || null,
          foregroundColor: item.foregroundColor || null,
          timeZone: item.timeZone || null,
          selected: item.selected ?? null
        }));

      const result = { success: true as const, calendars };
      await calendarAuditLogger.log({
        action: 'list_calendars',
        userId,
        companyId,
        payload: {},
        result: { success: true, count: calendars.length },
        latencyMs: Date.now() - auditStart
      });
      return result;
    } catch (error: any) {
      const result = { success: false as const, calendars: [], error: error.message || 'Failed to list calendars' };
      await calendarAuditLogger.log({
        action: 'list_calendars',
        userId,
        companyId,
        payload: {},
        result,
        error,
        latencyMs: Date.now() - auditStart
      });
      return result;
    }
  }

  /**
   * Check the connection status of the Google Calendar integration
   */
  public async checkCalendarConnectionStatus(
    userId: number,
    companyId: number
  ): Promise<{ connected: boolean, message: string }> {
    try {
      const tokens = await storage.getGoogleTokens(userId, companyId);

      if (!tokens) {
        return {
          connected: false,
          message: 'Not connected to Google Calendar'
        };
      }

      const calendar = await this.getCalendarClient(userId, companyId);
      if (!calendar) {
        return {
          connected: false,
          message: 'Connection to Google Calendar failed'
        };
      }

      return {
        connected: true,
        message: 'Connected to Google Calendar'
      };
    } catch (error) {
      console.error('Error checking calendar connection:', error);
      return {
        connected: false,
        message: 'Error checking Google Calendar connection'
      };
    }
  }

  /**
   * Get available time slots from a user's calendar
   * Enhanced to work with both single date and date range
   * @param userId User ID
   * @param companyId Company ID
   * @param date Single date to check (YYYY-MM-DD)
   * @param durationMinutes Duration of each slot in minutes (also used as slot step)
   * @param startDate Start date for range (YYYY-MM-DD)
   * @param endDate End date for range (YYYY-MM-DD)
   * @param businessHoursStart Business hours start (hour, 0-23)
   * @param businessHoursEnd Business hours end (hour, 0-23)
   * @param timeZone Timezone for slot generation (e.g., 'Pakistan/Islamabad')
   * @param bufferMinutes Buffer time to add before/after busy slots
   * @param advancedSettings Advanced settings with day-specific hours and off-days
   */
  public async getAvailableTimeSlots(
    userId: number,
    companyId: number,
    date?: string,
    durationMinutes: number = 60,
    startDate?: string,
    endDate?: string,
    businessHoursStart: number = 9,
    businessHoursEnd: number = 18,
    timeZone: string = 'UTC',
    bufferMinutes: number = 0,
    advancedSettings?: CalendarAdvancedSettings,
    calendarId: string = 'primary'
  ): Promise<{
    success: boolean,
    timeSlots?: Array<{
      date: string,
      slots: string[]
    }>,
    error?: string
  }> {


    try {
      // Determine settings mode
      const agentSettings = await storage.getAgentCalendarSettings(userId, companyId);
      const resolvedAdvancedSettings = advancedSettings || agentSettings?.advancedSettings || undefined;
      const forceAdvancedSettings = agentSettings?.scheduleMode === 'advanced';
      const useAdvancedSettings = Boolean((forceAdvancedSettings || resolvedAdvancedSettings) && resolvedAdvancedSettings && isValidAdvancedSettings(resolvedAdvancedSettings));
      
      if (useAdvancedSettings) {
        console.log('Google Calendar: Using advanced settings mode');
        // Validate that at least one day is enabled
        const enabledDays = resolvedAdvancedSettings!.weeklySchedule.filter(day => day.enabled && !resolvedAdvancedSettings!.offDays.includes(day.dayIndex));
        if (enabledDays.length === 0) {
          console.warn('Google Calendar: All days are disabled in advanced settings, falling back to simple settings');
          // Fall back to simple settings
        }
      } else {
        if (resolvedAdvancedSettings) {
          console.warn('Google Calendar: Advanced settings provided but validation failed, falling back to simple settings');
        }
        console.log('Google Calendar: Using simple settings mode');
      }

      const calendar = await this.getCalendarClient(userId, companyId);

      if (!calendar) {
        console.error('Google Calendar Service: Calendar client not available for availability check');
        return { success: false, error: 'Google Calendar client not available' };
      }


      let startDateTime: string;
      let endDateTime: string;
      let dateArray: string[] = [];

      if (date) {
        startDateTime = parseInZoneToUTC(`${date}T00:00:00`, timeZone).toISOString();
        endDateTime = parseInZoneToUTC(`${this.getNextCalendarDate(date)}T00:00:00`, timeZone).toISOString();
        dateArray = [date];
      } else if (startDate && endDate) {
        startDateTime = parseInZoneToUTC(`${startDate}T00:00:00`, timeZone).toISOString();
        endDateTime = parseInZoneToUTC(`${this.getNextCalendarDate(endDate)}T00:00:00`, timeZone).toISOString();

        dateArray = this.generateDateRange(startDate, endDate);
      } else {
        const formattedToday = new Date().toLocaleDateString('sv-SE', { timeZone });
        startDateTime = parseInZoneToUTC(`${formattedToday}T00:00:00`, timeZone).toISOString();
        endDateTime = parseInZoneToUTC(`${this.getNextCalendarDate(formattedToday)}T00:00:00`, timeZone).toISOString();
        dateArray = [formattedToday];
      }

      const startDateTimeObj = new Date(startDateTime);
      const endDateTimeObj = new Date(endDateTime);
      const expandedStart = new Date(startDateTimeObj);
      expandedStart.setMinutes(expandedStart.getMinutes() - bufferMinutes);
      const expandedEnd = new Date(endDateTimeObj);
      expandedEnd.setMinutes(expandedEnd.getMinutes() + bufferMinutes);

      const activeLocks = await storage.getActiveBookingLocksInRange(
        userId,
        companyId,
        `google:${calendarId}`,
        expandedStart,
        expandedEnd
      );
      // TODO: Once calendar_bookings stores calendarId, scope persisted booking
      // checks by the selected Google calendar in addition to scoped slot locks.

      // Query Google Calendar busy slots
      // As per Google Calendar API best practices, we use freebusy.query to get busy intervals
      // This is more efficient than listing all events and computing gaps
      const busyTimeSlotsResponse = await this.withRetry(() =>
        calendar.freebusy.query({
          requestBody: {
            timeMin: startDateTime,
            timeMax: endDateTime,
            timeZone: timeZone, // Specify timezone for proper interpretation
            items: [{ id: calendarId }],
          },
        })
        , 0, { userId, companyId, action: 'freebusy.available_slots' }
      );

      const busySlots = busyTimeSlotsResponse.data.calendars?.[calendarId]?.busy || [];

      // Apply buffer to Google Calendar busy slots
      const bufferedGoogleBusySlots = busySlots.map((busySlot: any) => {
        const busyStart = new Date(busySlot.start);
        const busyEnd = new Date(busySlot.end);

        busyStart.setMinutes(busyStart.getMinutes() - bufferMinutes);
        busyEnd.setMinutes(busyEnd.getMinutes() + bufferMinutes);

        return {
          start: busyStart.toISOString(),
          end: busyEnd.toISOString()
        };
      });

      const lockBusySlots = activeLocks.map((lock) => ({
        start: lock.startDateTime.toISOString(),
        end: lock.endDateTime.toISOString()
      }));

      const allBusySlots = [...bufferedGoogleBusySlots, ...lockBusySlots];

      // Sort busy slots by start time (as per Google Calendar API best practices)
      allBusySlots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      // Merge overlapping busy periods (as per Google Calendar API documentation)
      // This ensures that back-to-back or overlapping events are treated as a single busy period
      // Handles edge cases:
      // - When buffer time causes slots to appear adjacent but are actually separate
      // - When multiple bookings exist for the same time (shouldn't happen but handle gracefully)
      // - When Google Calendar returns overlapping busy periods (merge them correctly)
      const mergedBusySlots: Array<{start: string, end: string}> = [];
      let cursor: Date | null = null;

      for (const busySlot of allBusySlots) {
        const busyStart = new Date(busySlot.start);
        const busyEnd = new Date(busySlot.end);

        if (cursor === null) {
          // First busy slot
          mergedBusySlots.push({ start: busyStart.toISOString(), end: busyEnd.toISOString() });
          cursor = busyEnd;
        } else {
          // Check if this busy slot overlaps with or is adjacent to the previous one
          // Using <= to handle edge cases where slots are exactly adjacent
          // Buffer time may cause slots to appear adjacent but they should be merged if they touch
          if (busyStart.getTime() <= cursor.getTime()) {
            // Overlapping or adjacent - merge by extending the end time
            const lastSlot = mergedBusySlots[mergedBusySlots.length - 1];
            const lastEnd = new Date(lastSlot.end);
            if (busyEnd.getTime() > lastEnd.getTime()) {
              lastSlot.end = busyEnd.toISOString();
              cursor = busyEnd;
            }
            // If busyEnd <= lastEnd, the current slot is fully contained, so we skip it
            // This handles the case where multiple locks exist for the same time
          } else {
            // Non-overlapping - add as new busy period
            mergedBusySlots.push({ start: busyStart.toISOString(), end: busyEnd.toISOString() });
            cursor = busyEnd;
          }
        }
      }

      const bufferedBusySlots = mergedBusySlots;

      const allAvailableSlots: Array<{date: string, slots: string[]}> = [];

      for (const currentDate of dateArray) {
        const dayOfWeek = this.getDayOfWeekFromDateLabel(currentDate); // 0 = Sunday, 6 = Saturday

        // Filter out off-days if using advanced settings
        if (useAdvancedSettings && resolvedAdvancedSettings) {
          if (resolvedAdvancedSettings.offDays.includes(dayOfWeek)) {
            console.log(`Google Calendar: Skipping ${currentDate} (${getDayName(dayOfWeek)}) - marked as off-day`);
            continue;
          }
        }
        
        const availableSlots: string[] = [];
        
        // Get day-specific hours or use global hours
        let currentBusinessHoursStartHour: number;
        let currentBusinessHoursStartMinute: number;
        let currentBusinessHoursEndHour: number;
        let currentBusinessHoursEndMinute: number;
        
        if (useAdvancedSettings && resolvedAdvancedSettings) {
          const dayConfig = resolvedAdvancedSettings.weeklySchedule[dayOfWeek];
          
          if (!dayConfig || !dayConfig.enabled) {
            console.log(`Google Calendar: Skipping ${currentDate} (${getDayName(dayOfWeek)}) - day is disabled`);
            continue;
          }
          
          // Parse time strings (HH:MM format)
          const [startHour, startMin] = dayConfig.startTime.split(':').map(Number);
          const [endHour, endMin] = dayConfig.endTime.split(':').map(Number);
          
          currentBusinessHoursStartHour = startHour;
          currentBusinessHoursStartMinute = startMin;
          currentBusinessHoursEndHour = endHour;
          currentBusinessHoursEndMinute = endMin;
          
          console.log(`Google Calendar: Using ${getDayName(dayOfWeek)} hours: ${dayConfig.startTime} - ${dayConfig.endTime}`);
        } else {
          currentBusinessHoursStartHour = businessHoursStart;
          currentBusinessHoursStartMinute = 0;
          currentBusinessHoursEndHour = businessHoursEnd;
          currentBusinessHoursEndMinute = 0;
        }
        
        // Convert business hours start/end to UTC for gap computation
        // Following Google Calendar API best practices: compute gaps between merged busy periods
        const businessStart = parseInZoneToUTC(`${currentDate}T${String(currentBusinessHoursStartHour).padStart(2, '0')}:${String(currentBusinessHoursStartMinute).padStart(2, '0')}:00`, timeZone);
        
        const businessEnd = parseInZoneToUTC(`${currentDate}T${String(currentBusinessHoursEndHour).padStart(2, '0')}:${String(currentBusinessHoursEndMinute).padStart(2, '0')}:00`, timeZone);

        // Filter busy slots to only those within business hours for this date
        const dayBusySlots = bufferedBusySlots.filter((busySlot: any) => {
          const busyStart = new Date(busySlot.start);
          const busyEnd = new Date(busySlot.end);
          
          // Include busy slots that overlap with business hours
          return busyStart.getTime() < businessEnd.getTime() && busyEnd.getTime() > businessStart.getTime();
        });

        // Sort busy slots by start time (they should already be sorted and merged, but ensure it)
        dayBusySlots.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

        // Compute available slots using gap-based approach (as per Google Calendar API best practices)
        // This approach: (1) merges overlapping busy periods, (2) computes gaps between them,
        // (3) generates slots at regular intervals that fit within gaps
        
        // Generate candidate slots at regular intervals (every durationMinutes)
        // Then filter to only those that fit in gaps between busy periods
        const slotIntervalMs = durationMinutes * 60 * 1000;
        const slotDurationMs = durationMinutes * 60 * 1000;
        
        // Generate candidate slots starting from business start, at regular intervals
        let candidateSlotStart = new Date(businessStart);

        while (candidateSlotStart.getTime() + slotDurationMs <= businessEnd.getTime()) {
          const candidateSlotEnd = new Date(candidateSlotStart.getTime() + slotDurationMs);

          // Check if this slot is in the past (for today's date)
          // convert candidateSlotStart (which is in UTC relative to the date) to target timezone comparison
          // Since candidateSlotStart is constructed from businessStart which was converted to UTC for the specific date,
          // we should compare it against the current time.
          
          // candidateSlotStart is a UTC timestamp representing the slot start time.
          
          // If we are processing today, we should filter out slots that have already passed.
          // We can compare the UTC timestamp of the slot start with the current UTC timestamp.
          // CRITICAL: Use the user's timezone to determine if it's "today" locally
          const nowInUserTimeZone = new Date().toLocaleDateString('sv-SE', { timeZone });
          const isToday = nowInUserTimeZone === currentDate;
          
          if (isToday) {
             if (candidateSlotStart.getTime() < Date.now()) {
                candidateSlotStart = new Date(candidateSlotStart.getTime() + slotDurationMs);
                continue;
             }
          }

          // Check if this candidate slot (with buffer) fits in a gap (doesn't overlap with any busy period)
          // Following the documentation: a slot is available if it doesn't overlap with any busy period
          // CRITICAL: We must check the effective slot (with buffer) against busy periods
          const slotFitsInGap = !dayBusySlots.some((busySlot: any) => {
            const busyStart = new Date(busySlot.start);
            const busyEnd = new Date(busySlot.end);
            
            // Clip busy period to business hours for accurate comparison
            const clippedBusyStart = busyStart.getTime() < businessStart.getTime() ? businessStart : busyStart;
            const clippedBusyEnd = busyEnd.getTime() > businessEnd.getTime() ? businessEnd : busyEnd;
            
            const hasConflict = candidateSlotStart.getTime() < clippedBusyEnd.getTime() && candidateSlotEnd.getTime() > clippedBusyStart.getTime();
            
            return hasConflict;
          });
          
          if (slotFitsInGap) {
            // Exclude slots that intersect configured break windows for this weekday
            const dayBreaks =
              useAdvancedSettings && resolvedAdvancedSettings
                ? getActiveBreaksForDay(resolvedAdvancedSettings.weeklySchedule[dayOfWeek])
                : [];
            if (dayBreaks.length > 0) {
              const startParts = getZonedDateTimeParts(candidateSlotStart, timeZone);
              const endParts = getZonedDateTimeParts(candidateSlotEnd, timeZone);
              const breakCheckStart = startParts.timeMinutes - bufferMinutes;
              const breakCheckEnd = endParts.timeMinutes + bufferMinutes;
              if (slotIntersectsAnyBreak(breakCheckStart, breakCheckEnd, dayBreaks)) {
                candidateSlotStart = new Date(candidateSlotStart.getTime() + slotIntervalMs);
                continue;
              }
            }

            // Format the time in the target timezone for display
            // Format: 'HH:MM AM/PM' (e.g., '10:00 AM', '02:30 PM')
            let formattedStart = candidateSlotStart.toLocaleTimeString('en-US', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
              timeZone: timeZone
            });
            
            // Normalize the formatted string to ensure consistent format
            // Trim whitespace, ensure single space between time and AM/PM, ensure uppercase AM/PM
            formattedStart = formattedStart.trim().replace(/\s+/g, ' ').toUpperCase();
            
            // Validate the format matches expected pattern
            const formatPattern = /^\d{2}:\d{2} (AM|PM)$/;
            if (!formatPattern.test(formattedStart)) {
              console.warn('Google Calendar: Unexpected time format produced:', {
                original: candidateSlotStart.toISOString(),
                formatted: formattedStart,
                timeZone
              });
            }
            
            availableSlots.push(formattedStart);
          }
          
          // Move to next candidate slot (at regular interval)
          candidateSlotStart = new Date(candidateSlotStart.getTime() + slotIntervalMs);
        }

        allAvailableSlots.push({
          date: currentDate,
          slots: availableSlots
        });
      }

      return {
        success: true,
        timeSlots: allAvailableSlots
      };
    } catch (error: any) {
      console.error('Error getting available time slots:', error);
      return {
        success: false,
        error: error.message || 'Failed to get available time slots'
      };
    }
  }

  /**
   * Generate an array of dates between start and end dates (inclusive)
   */
  private generateDateRange(startDate: string, endDate: string): string[] {
    const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
    const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
    const start = Date.UTC(startYear, startMonth - 1, startDay);
    const end = Date.UTC(endYear, endMonth - 1, endDay);
    const oneDayMs = 24 * 60 * 60 * 1000;
    const dateArray: string[] = [];

    for (let current = start; current <= end; current += oneDayMs) {
      dateArray.push(new Date(current).toISOString().slice(0, 10));
    }

    return dateArray;
  }

}

export const googleCalendarService = new GoogleCalendarService();
export default googleCalendarService;