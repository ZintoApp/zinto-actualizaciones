import axios, { AxiosInstance } from 'axios';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { storage } from '../storage';
import { CalendarBooking } from '@shared/schema';
import type { CalendarAdvancedSettings } from '@shared/types/calendar-types';
import { isValidAdvancedSettings, getDayName } from '@shared/types/calendar-types';
import { getActiveBreaksForDay, slotIntersectsAnyBreak } from '@shared/utils/calendar-breaks';
import {
  appendOwnershipToDescription,
  filterEventsForContact,
  sanitizeCalendarEventForContact,
  type CalendarRequesterIdentity,
} from './calendar-contact-privacy';

export type ListZohoCalendarEventsOptions = {
  requester?: CalendarRequesterIdentity | null;
  bypassContactPrivacyFilter?: boolean;
};

const SCOPES = ['ZohoCalendar.event.ALL', 'ZohoCalendar.calendar.READ'];
const ZOHO_CALENDAR_BASE_URL = 'https://calendar.zoho.com/api/v1';
const ZOHO_ACCOUNTS_BASE_URL = 'https://accounts.zoho.com';
const ZOHO_DATA_CENTERS = [
  'https://accounts.zoho.com',
  'https://accounts.zoho.eu',
  'https://accounts.zoho.in',
  'https://accounts.zoho.com.au',
  'https://accounts.zoho.jp'
];

interface ZohoOAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface ZohoTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  updatedAt?: Date;
}

class ZohoCalendarService {
  private detectedDataCenter: string | null = null;

  constructor() {
  }

  /**
   * Detect the correct Zoho data center for the client ID
   * This helps handle global applications and regional routing
   */
  private async detectDataCenter(clientId: string): Promise<string> {
    if (this.detectedDataCenter) {
      return this.detectedDataCenter;
    }

    for (const dataCenter of ZOHO_DATA_CENTERS) {
      try {
        const testUrl = `${dataCenter}/oauth/v2/auth?response_type=code&client_id=${clientId}&scope=ZohoCalendar.calendar.READ&redirect_uri=https://example.com/callback&state=test`;

        this.detectedDataCenter = ZOHO_ACCOUNTS_BASE_URL;
        return this.detectedDataCenter;
      } catch (error) {
        continue;
      }
    }

    this.detectedDataCenter = ZOHO_ACCOUNTS_BASE_URL;
    return this.detectedDataCenter;
  }

  /**
   * Get Zoho OAuth credentials from super admin settings
   */
  private async getApplicationCredentials(): Promise<ZohoOAuthCredentials | null> {
    try {
      const credentials = await storage.getAppSetting('zoho_calendar_oauth');

      if (!credentials || !credentials.value) {
        console.error('Zoho Calendar OAuth not configured in admin settings');
        return null;
      }

      const config = credentials.value as any;
      if (!config.enabled || !config.client_id || !config.client_secret) {
        console.error('Zoho Calendar OAuth not properly configured or disabled');
        return null;
      }

      return {
        clientId: config.client_id,
        clientSecret: config.client_secret,
        redirectUri: config.redirect_uri || `${process.env.BASE_URL || 'http://localhost:9000'}/api/zoho/calendar/callback`
      };
    } catch (error) {
      console.error('Error getting application Zoho credentials:', error);
      return null;
    }
  }

  /**
   * Generate an authentication URL for Zoho Calendar
   */
  public async getAuthUrl(userId: number, companyId: number): Promise<string | null> {
    try {
      const credentials = await this.getApplicationCredentials();

      if (!credentials) {
        console.error('Zoho Calendar: No credentials available for auth URL generation');
        return null;
      }

      const accountsUrl = ZOHO_ACCOUNTS_BASE_URL;



      const state = Buffer.from(JSON.stringify({ userId, companyId })).toString('base64');
      const scope = SCOPES.join(',');

      const authUrl = new URL(`${accountsUrl}/oauth/v2/auth`);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', credentials.clientId);
      authUrl.searchParams.set('scope', scope);
      authUrl.searchParams.set('redirect_uri', credentials.redirectUri);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');

      return authUrl.toString();
    } catch (error) {
      console.error('Zoho Calendar: Error generating auth URL:', error);
      return null;
    }
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
      const { userId, companyId } = JSON.parse(Buffer.from(stateParam, 'base64').toString());

      if (!userId || !companyId) {
        res.status(400).send('Invalid state parameter');
        return;
      }

      const credentials = await this.getApplicationCredentials();

      if (!credentials) {
        res.status(400).send('Zoho Calendar OAuth not configured in admin settings');
        return;
      }

      const tokenResponse = await axios.post(`${ZOHO_ACCOUNTS_BASE_URL}/oauth/v2/token`, null, {
        params: {
          code,
          grant_type: 'authorization_code',
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          redirect_uri: credentials.redirectUri,
          scope: SCOPES.join(',')
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });



      const tokens: ZohoTokens = tokenResponse.data;

      const zohoTokens = {
        access_token: tokens.access_token || '',
        refresh_token: tokens.refresh_token || undefined,
        expires_in: tokens.expires_in || undefined,
        token_type: tokens.token_type || undefined,
        scope: tokens.scope || undefined
      };

      await storage.saveZohoTokens(userId, companyId, zohoTokens);

      res.redirect('/settings?zoho_auth=success');
    } catch (error: any) {
      console.error('Error handling Zoho auth callback:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status,
        config: {
          url: error.config?.url,
          params: error.config?.params
        }
      });

      let errorMessage = 'Failed to authenticate with Zoho';
      if (error.response?.data?.error === 'invalid_client') {
        errorMessage = 'Invalid Zoho Client ID. Please check your Zoho Developer Console configuration.';
      } else if (error.response?.data?.error === 'invalid_request') {
        errorMessage = 'Invalid OAuth request. Please check your Zoho application settings.';
      } else if (error.response?.data?.error === 'access_denied') {
        errorMessage = 'Access denied. Please ensure you have the required permissions.';
      }

      res.status(500).send(errorMessage);
    }
  }

  /**
   * Get an authorized Zoho Calendar HTTP client for a user
   */
  public async getCalendarClient(userId: number, companyId: number): Promise<AxiosInstance | null> {
    try {
      const tokens = await storage.getZohoTokens(userId, companyId);

      if (!tokens) {
        console.error(`No Zoho tokens found for user ${userId} in company ${companyId}`);
        return null;
      }

      const credentials = await this.getApplicationCredentials();

      if (!credentials) {
        console.error('Zoho Calendar OAuth not configured in admin settings');
        return null;
      }

      let isExpired = false;
      const tokensWithTimestamp = tokens as any;
      if (tokensWithTimestamp.updatedAt && tokens.expires_in) {
        const tokenIssuedTime = new Date(tokensWithTimestamp.updatedAt).getTime();
        const expiryTime = tokenIssuedTime + (tokens.expires_in * 1000);
        isExpired = expiryTime < Date.now();

      } else {
        isExpired = true;
      }

      if (isExpired && tokens.refresh_token) {
        try {
          const refreshResponse = await axios.post(`${ZOHO_ACCOUNTS_BASE_URL}/oauth/v2/token`, null, {
            params: {
              refresh_token: tokens.refresh_token,
              grant_type: 'refresh_token',
              client_id: credentials.clientId,
              client_secret: credentials.clientSecret,
              redirect_uri: credentials.redirectUri,
              scope: SCOPES.join(',')
            },
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          });



          const newTokens: ZohoTokens = refreshResponse.data;
          const updatedTokens = {
            access_token: newTokens.access_token || tokens.access_token,
            refresh_token: newTokens.refresh_token || tokens.refresh_token,
            expires_in: newTokens.expires_in || tokens.expires_in,
            token_type: newTokens.token_type || tokens.token_type,
            scope: newTokens.scope || tokens.scope
          };

          await storage.saveZohoTokens(userId, companyId, updatedTokens);
          tokens.access_token = updatedTokens.access_token;
        } catch (refreshError) {
          console.error('Error refreshing Zoho token:', refreshError);
          return null;
        }
      }

      const client = axios.create({
        baseURL: ZOHO_CALENDAR_BASE_URL,
        headers: {
          'Authorization': `Zoho-oauthtoken ${tokens.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      return client;
    } catch (error) {
      console.error('Error creating Zoho Calendar client:', error);
      return null;
    }
  }

  /**
   * Get the primary calendar object and ID for a user
   */
  private async getPrimaryCalendar(client: AxiosInstance): Promise<{ calendar: any, id: string } | null> {
    try {
      const response = await client.get('/calendars');

      let calendars = [];
      if (response.data.calendars) {
        calendars = response.data.calendars;
      } else if (Array.isArray(response.data)) {
        calendars = response.data;
      } else if (response.data.data && Array.isArray(response.data.data)) {
        calendars = response.data.data;
      } else {
        console.error('Zoho Calendar: Unexpected response structure:', response.data);
        return null;
      }



      if (calendars.length === 0) {
        console.error('Zoho Calendar: No calendars found for user');
        return null;
      }

      let primaryCalendar = null;

      primaryCalendar = calendars.find((cal: any) => cal.isdefault === true);

      if (!primaryCalendar) {
        primaryCalendar = calendars.find((cal: any) => cal.isprimary === true);
      }

      if (!primaryCalendar) {
        primaryCalendar = calendars.find((cal: any) => cal.is_primary === true);
      }

      if (!primaryCalendar) {
        primaryCalendar = calendars.find((cal: any) => cal.primary === true);
      }

      if (!primaryCalendar) {
        primaryCalendar = calendars.find((cal: any) => cal.owner === true || cal.type === 'owner');
      }

      if (!primaryCalendar && calendars.length > 0) {
        primaryCalendar = calendars[0];
      }

      if (!primaryCalendar) {
        console.error('Zoho Calendar: No suitable calendar found');
        return null;
      }

      const calendarId = primaryCalendar.id ||
                        primaryCalendar.caluid ||
                        primaryCalendar.calendar_id ||
                        primaryCalendar.uid;

      if (!calendarId) {
        console.error('Zoho Calendar: Calendar found but no ID field:', primaryCalendar);
        return null;
      }


      return { calendar: primaryCalendar, id: calendarId };

    } catch (error: any) {
      console.error('Zoho Calendar: Error getting primary calendar:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      return null;
    }
  }

  /**
   * Get the primary calendar ID for a user (legacy method)
   */
  private async getPrimaryCalendarId(client: AxiosInstance): Promise<string | null> {
    try {
      const response = await client.get('/calendars');

      let calendars = [];
      if (response.data.calendars) {
        calendars = response.data.calendars;
      } else if (Array.isArray(response.data)) {
        calendars = response.data;
      } else if (response.data.data && Array.isArray(response.data.data)) {
        calendars = response.data.data;
      } else {
        console.error('Zoho Calendar: Unexpected response structure:', response.data);
        return null;
      }



      if (calendars.length === 0) {
        console.error('Zoho Calendar: No calendars found for user');
        return null;
      }

      let primaryCalendar = null;

      primaryCalendar = calendars.find((cal: any) => cal.isdefault === true);
      if (primaryCalendar) {

      }

      if (!primaryCalendar) {
        primaryCalendar = calendars.find((cal: any) => cal.isprimary === true);
        if (primaryCalendar) {

        }
      }

      if (!primaryCalendar) {
        primaryCalendar = calendars.find((cal: any) => cal.is_primary === true);
        if (primaryCalendar) {

        }
      }

      if (!primaryCalendar) {
        primaryCalendar = calendars.find((cal: any) => cal.primary === true);
        if (primaryCalendar) {

        }
      }

      if (!primaryCalendar) {
        primaryCalendar = calendars.find((cal: any) => cal.owner === true || cal.type === 'owner');
        if (primaryCalendar) {

        }
      }

      if (!primaryCalendar && calendars.length > 0) {
        primaryCalendar = calendars[0];

      }

      if (!primaryCalendar) {
        console.error('Zoho Calendar: No suitable calendar found');
        return null;
      }

      const calendarId = primaryCalendar.id ||
                        primaryCalendar.caluid ||
                        primaryCalendar.calendar_id ||
                        primaryCalendar.uid;

      if (!calendarId) {
        console.error('Zoho Calendar: Calendar found but no ID field:', primaryCalendar);
        return null;
      }


      return calendarId;

    } catch (error: any) {
      console.error('Zoho Calendar: Error getting primary calendar ID:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      return null;
    }
  }

  /**
   * Check if a time slot is available before booking
   * Uses listCalendarEvents to check for overlapping events
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
    bufferMinutes: number = 0
  ): Promise<{ available: boolean, conflictingEvents?: any[], error?: string }> {
    try {
      const client = await this.getCalendarClient(userId, companyId);

      if (!client) {
        return {
          available: true, // Fail-open: if we can't check, allow creation
          error: 'Calendar client not available for availability check'
        };
      }


      // Validate date inputs
      const startDate = new Date(startDateTime);
      const endDate = new Date(endDateTime);
      
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        console.error('Zoho Calendar Service: Invalid date format in availability check', { startDateTime, endDateTime });
        return {
          available: false,
          error: 'Invalid date format provided'
        };
      }

      if (startDate >= endDate) {
        console.error('Zoho Calendar Service: Start time must be before end time', { startDateTime, endDateTime });
        return {
          available: false,
          error: 'Start time must be before end time'
        };
      }

      // Check for existing bookings in database (with buffer applied)
      const bookingStartWithBuffer = new Date(startDate);
      bookingStartWithBuffer.setMinutes(bookingStartWithBuffer.getMinutes() - bufferMinutes);
      const bookingEndWithBuffer = new Date(endDate);
      bookingEndWithBuffer.setMinutes(bookingEndWithBuffer.getMinutes() + bufferMinutes);

      const existingBookings = await storage.getCalendarBookings(
        userId,
        companyId,
        'zoho',
        bookingStartWithBuffer,
        bookingEndWithBuffer
      );

      // Check for conflicts with existing bookings
      const requestedStart = bookingStartWithBuffer.getTime();
      const requestedEnd = bookingEndWithBuffer.getTime();

      const conflictingBookings = existingBookings.filter((booking) => {
        const bookingStart = new Date(booking.startDateTime).getTime();
        const bookingEnd = new Date(booking.endDateTime).getTime();

        // Apply buffer to existing bookings for conflict detection
        const bookingStartWithBuffer = bookingStart - (bufferMinutes * 60 * 1000);
        const bookingEndWithBuffer = bookingEnd + (bufferMinutes * 60 * 1000);

        return (requestedStart <= bookingEndWithBuffer && requestedEnd >= bookingStartWithBuffer);
      });

      if (conflictingBookings.length > 0) {
        return {
          available: false,
          conflictingEvents: conflictingBookings.map(booking => ({
            start: booking.startDateTime.toISOString(),
            end: booking.endDateTime.toISOString()
          }))
        };
      }

      // Also check Zoho Calendar events for conflicts
      const queryStartDate = new Date(startDate);
      queryStartDate.setMinutes(queryStartDate.getMinutes() - bufferMinutes);
      const queryEndDate = new Date(endDate);
      queryEndDate.setMinutes(queryEndDate.getMinutes() + bufferMinutes);

      const timeMin = queryStartDate.toISOString();
      const timeMax = queryEndDate.toISOString();

      const eventsResult = await this.listCalendarEvents(
        userId,
        companyId,
        timeMin,
        timeMax,
        100, // Get up to 100 events to check for conflicts
        { bypassContactPrivacyFilter: true }
      );

      if (!eventsResult.success) {
        // If we can't check events but no lock conflicts, fail-open
        return {
          available: true,
          error: eventsResult.error || 'Failed to list events for availability check'
        };
      }

      const existingEvents = eventsResult.items || [];

      // Check for conflicts with Zoho Calendar events
      const conflictingEvents = existingEvents.filter((event: any) => {
        const eventStart = new Date(event.start?.dateTime || event.start).getTime();
        const eventEnd = new Date(event.end?.dateTime || event.end).getTime();

        // Apply buffer to event times for conflict detection
        const eventStartWithBuffer = eventStart - (bufferMinutes * 60 * 1000);
        const eventEndWithBuffer = eventEnd + (bufferMinutes * 60 * 1000);

        return (requestedStart <= eventEndWithBuffer && requestedEnd >= eventStartWithBuffer);
      });

      if (conflictingEvents.length > 0) {
        return {
          available: false,
          conflictingEvents: conflictingEvents
        };
      }

      return { available: true };
    } catch (error: any) {
      console.error('Zoho Calendar Service: Error checking time slot availability:', error.message);

      return {
        available: true,
        error: error.message || 'Failed to check availability'
      };
    }
  }

  /**
   * Create a calendar event
   * Includes conflict detection to prevent double bookings
   * 
   * @param userId The user ID
   * @param companyId The company ID
   * @param eventData Event data including start, end, summary, etc.
   * @param eventData.bufferMinutes Optional buffer minutes to respect when checking for conflicts
   *                                 CRITICAL: This is the single source of truth for buffer configuration.
   *                                 Must match the bufferMinutes used in getAvailableTimeSlots for consistency.
   * @returns Success status with event ID and link, or error message
   */
  public async createCalendarEvent(
    userId: number,
    companyId: number,
    eventData: any
  ): Promise<{ success: boolean, eventId?: string, error?: string, eventLink?: string }> {

    const { summary, description, location, start, end, attendees } = eventData;
    const startDateTime = start?.dateTime;
    const endDateTime = end?.dateTime;

    if (!startDateTime || !endDateTime) {
      console.error('Zoho Calendar Service: Missing start or end time');
      return { success: false, error: 'Start and end times are required' };
    }

    const bufferMinutes = eventData.bufferMinutes || 0;
    const startDate = new Date(startDateTime);
    const endDate = new Date(endDateTime);
    
    // Check for existing bookings in database (with buffer applied)
    const bookingStartWithBuffer = new Date(startDate);
    bookingStartWithBuffer.setMinutes(bookingStartWithBuffer.getMinutes() - bufferMinutes);
    const bookingEndWithBuffer = new Date(endDate);
    bookingEndWithBuffer.setMinutes(bookingEndWithBuffer.getMinutes() + bufferMinutes);
    
    const hasConflict = await storage.checkBookingConflict(
      userId,
      companyId,
      'zoho',
      bookingStartWithBuffer,
      bookingEndWithBuffer
    );
    
    if (hasConflict) {
      // Get conflicting bookings for detailed logging
      const conflictingBookings = await storage.getCalendarBookings(
        userId,
        companyId,
        'zoho',
        bookingStartWithBuffer,
        bookingEndWithBuffer
      );
      
      const conflictDetails = conflictingBookings.map(booking => 
        `Booking ${booking.id} (${booking.startDateTime.toISOString()} - ${booking.endDateTime.toISOString()}, eventId: ${booking.eventId})`
      ).join('; ');
      
      return {
        success: false,
        error: `Database conflict detected. Conflicting booking(s): ${conflictDetails}`
      };
    }

    // Check Zoho Calendar availability
    const availabilityCheck = await this.checkTimeSlotAvailability(
      userId,
      companyId,
      startDateTime,
      endDateTime,
      bufferMinutes
    );

    if (!availabilityCheck.available) {
      const conflictDetails = availabilityCheck.conflictingEvents?.map((event: any) => 
        `Event (${event.start} - ${event.end})`
      ).join('; ') || 'Unknown conflict';
      
      return {
        success: false,
        error: `Zoho Calendar conflict detected. Conflicting event(s): ${conflictDetails}`
      };
    }

    try {
      const client = await this.getCalendarClient(userId, companyId);

      if (!client) {
        console.error('Zoho Calendar Service: Calendar client not available');
        return { success: false, error: 'Zoho Calendar client not available' };
      }

      const primaryCalendarResult = await this.getPrimaryCalendar(client);
      if (!primaryCalendarResult) {
        console.error('Zoho Calendar Service: Primary calendar not found');
        return { success: false, error: 'Primary calendar not found' };
      }

      const { calendar: primaryCalendar, id: calendarId } = primaryCalendarResult;

      const formatZohoDateTime = (isoDateTime: string): string => {
        const date = new Date(isoDateTime);
        return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
      };

      const ownershipIdentity: CalendarRequesterIdentity | null =
        eventData.contactOwnership && typeof eventData.contactOwnership === 'object'
          ? eventData.contactOwnership
          : null;
      const stampedDescription = appendOwnershipToDescription(
        description || '',
        ownershipIdentity || {},
      );

      const zohoEventData = {
        title: summary,
        description: stampedDescription,
        location: location || '',
        dateandtime: {
          start: formatZohoDateTime(startDateTime),
          end: formatZohoDateTime(endDateTime),
          timezone: start?.timeZone || 'UTC'
        },
        isallday: false,
        isprivate: false,
        attendees: Array.isArray(attendees) ? attendees.map((attendee: any) => ({
          email: typeof attendee === 'string' ? attendee : attendee.email,
          permission: 1
        })) : [],
        reminders: [
          {
            action: 'popup',
            minutes: 15
          }
        ]
      };



      const calendarUid = primaryCalendar.uid;
   

      let response;
      try {
        const formData = new URLSearchParams();
        formData.append('eventdata', JSON.stringify(zohoEventData));

        response = await client.post(`/calendars/${calendarUid}/events`, formData, {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        });

      } catch (error: any) {

        const endpoints = [
          `/calendars/${calendarId}/events`,
          `/calendars/${calendarUid}/events`,
          `/events`,
          `/calendar/${calendarId}/events`,
          `/calendar/${calendarUid}/events`,
          `/event`,
          `/calendars/${calendarId}/event`,
          `/calendar/${calendarId}/event`
        ];

        for (let i = 0; i < endpoints.length; i++) {
        const endpoint = endpoints[i];

        try {
          response = await client.post(endpoint, null, {
            params: {
              eventdata: JSON.stringify(zohoEventData),
              ...(endpoint.includes('/events') ? {} : { calendaruid: calendarId })
            }
          });
          break;
        } catch (error: any) {
          

          try {
            response = await client.post(endpoint, zohoEventData, {
              params: endpoint.includes('/events') ? {} : { calendaruid: calendarId }
            });
            break;
          } catch (error2: any) {
            
            try {
              const formData = new URLSearchParams();
              formData.append('eventdata', JSON.stringify(zohoEventData));
              if (!endpoint.includes('/events')) {
                formData.append('calendaruid', calendarId);
              }

              response = await client.post(endpoint, formData, {
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded'
                }
              });
              break;
            } catch (error3: any) {


              if (endpoint === `/calendars/${calendarId}/events`) {
                try {
                  const alternativeEventData = {
                    eventdata: JSON.stringify(zohoEventData)
                  };

                  response = await client.post(endpoint, alternativeEventData);

                  break;
                } catch (error4: any) {

                }
              }

              if (i === endpoints.length - 1) {
                throw error3;
              }
            }
          }
        }
        }
      }

      if (!response) {
        console.error('Zoho Calendar Service: No successful response from any endpoint');
        return { success: false, error: 'All API endpoints failed' };
      }

      if (response.status === 200 || response.status === 201) {
        const createdEvent = response.data.events?.[0];
        const eventId = createdEvent?.uid || createdEvent?.id;

        // Save booking record after successful event creation
        if (eventId) {
          const bookingResult = await storage.createCalendarBooking({
            userId,
            companyId,
            calendarType: 'zoho',
            startDateTime: startDate,
            endDateTime: endDate,
            eventId: eventId,
            eventLink: createdEvent?.viewEventURL || undefined
          });

          if (!bookingResult.success) {
            console.warn('Zoho Calendar Service: Failed to save booking record, but event was created:', {
              eventId: eventId,
              error: bookingResult.error
            });
          }
        }

        const result = {
          success: true,
          eventId: eventId,
          eventLink: createdEvent?.viewEventURL
        };

        if (result.eventLink) {
          console.log('Calendar booking created with event link:', result.eventLink);
        }

        return result;
      } else {
        console.error('Zoho Calendar Service: Unexpected response status:', response.status);
        return {
          success: false,
          error: `Failed to create event, status code: ${response.status}`
        };
      }
    } catch (error: any) {
      console.error('Zoho Calendar Service: Error creating calendar event:', {
        error: error.message,
        response: error.response?.data,
        userId,
        companyId,
        eventData
      });
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to create calendar event'
      };
    }
  }

  /**
   * List calendar events for a specific time range.
   * AI callers must pass requester (fail-closed). Staff/conflict checks use bypassContactPrivacyFilter.
   */
  public async listCalendarEvents(
    userId: number,
    companyId: number,
    timeMin: string,
    timeMax: string,
    maxResults: number = 10,
    options?: ListZohoCalendarEventsOptions
  ): Promise<any> {
    try {
      const client = await this.getCalendarClient(userId, companyId);

      if (!client) {
        return { success: false, error: 'Zoho Calendar client not available' };
      }

      const primaryCalendarResult = await this.getPrimaryCalendar(client);
      if (!primaryCalendarResult) {
        return { success: false, error: 'Primary calendar not found' };
      }

      const { calendar: primaryCalendar } = primaryCalendarResult;
      const calendarUid = primaryCalendar.uid;

      const formatZohoDate = (isoDateTime: string): string => {
        const date = new Date(isoDateTime);
        return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '').substring(0, 8);
      };

      const startDate = formatZohoDate(timeMin);
      const endDate = formatZohoDate(timeMax);

      let response;
      try {
        response = await client.get(`/calendars/${calendarUid}/events`, {
          params: {
            range: JSON.stringify({
              start: startDate,
              end: endDate
            })
          }
        });

      } catch (error: any) {
        try {
          response = await client.get(`/calendars/${calendarUid}/events`, {
            params: {
              start: startDate,
              end: endDate
            }
          });
        } catch (error2: any) {
          try {
            response = await client.get(`/calendars/${calendarUid}/events`, {
              params: {
                range: `${startDate}-${endDate}`
              }
            });
          } catch (error3: any) {
            response = await client.get(`/calendars/${calendarUid}/events`);
          }
        }
      }

      const events = response.data.events || [];

      const startTime = new Date(timeMin).getTime();
      const endTime = new Date(timeMax).getTime();

      const filteredEvents = events.filter((event: any) => {
        if (!event.dateandtime?.start) return false;

        const eventStart = new Date(this.convertZohoToISODateTime(event.dateandtime.start, event.dateandtime.timezone)).getTime();
        return eventStart >= startTime && eventStart <= endTime;
      });

      const transformedEvents = filteredEvents.map((event: any) => ({
        id: event.uid || event.id,
        summary: event.title,
        description: event.description || '',
        location: event.location || '',
        start: {
          dateTime: event.dateandtime?.start ? this.convertZohoToISODateTime(event.dateandtime.start, event.dateandtime.timezone) : event.start,
          timeZone: event.dateandtime?.timezone || 'UTC'
        },
        end: {
          dateTime: event.dateandtime?.end ? this.convertZohoToISODateTime(event.dateandtime.end, event.dateandtime.timezone) : event.end,
          timeZone: event.dateandtime?.timezone || 'UTC'
        },
        attendees: event.attendees || [],
        created: event.createdtime,
        updated: event.lastmodifiedtime,
        status: 'confirmed',
        htmlLink: event.viewEventURL,
        colorId: 'default'
      }));

      const owned = filterEventsForContact(transformedEvents, options?.requester, {
        bypassContactPrivacyFilter: options?.bypassContactPrivacyFilter === true,
      });

      const sanitized = owned
        .slice(0, maxResults)
        .map((event) =>
          options?.bypassContactPrivacyFilter ? event : sanitizeCalendarEventForContact(event),
        );

      return {
        success: true,
        items: sanitized,
        nextPageToken: null
      };
    } catch (error: any) {
      console.error('Error listing Zoho calendar events:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to list calendar events',
        items: []
      };
    }
  }

  /** Fetch a single Zoho event for ownership checks before cancel/update. */
  public async getCalendarEvent(
    userId: number,
    companyId: number,
    eventId: string,
  ): Promise<{ success: boolean; event?: any; error?: string }> {
    try {
      const client = await this.getCalendarClient(userId, companyId);
      if (!client) {
        return { success: false, error: 'Zoho Calendar client not available' };
      }
      const primaryCalendarResult = await this.getPrimaryCalendar(client);
      if (!primaryCalendarResult) {
        return { success: false, error: 'Primary calendar not found' };
      }
      const calendarUid = primaryCalendarResult.calendar.uid;
      const response = await client.get(`/calendars/${calendarUid}/events/${eventId}`);
      const raw = response.data?.events?.[0] || response.data?.event || response.data;
      if (!raw) {
        return { success: false, error: 'Event not found' };
      }
      const event = {
        id: raw.uid || raw.id || eventId,
        summary: raw.title || raw.summary,
        description: raw.description || '',
        attendees: raw.attendees || [],
        start: {
          dateTime: raw.dateandtime?.start
            ? this.convertZohoToISODateTime(raw.dateandtime.start, raw.dateandtime.timezone)
            : raw.start,
        },
        end: {
          dateTime: raw.dateandtime?.end
            ? this.convertZohoToISODateTime(raw.dateandtime.end, raw.dateandtime.timezone)
            : raw.end,
        },
      };
      return { success: true, event };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to get calendar event',
      };
    }
  }

  /**
   * Convert Zoho datetime format to ISO datetime
   */
  private convertZohoToISODateTime(zohoDateTime: string, _timezone: string = 'UTC'): string {
    try {
      if (zohoDateTime.includes('T')) {
        const year = zohoDateTime.substring(0, 4);
        const month = zohoDateTime.substring(4, 6);
        const day = zohoDateTime.substring(6, 8);
        const hour = zohoDateTime.substring(9, 11);
        const minute = zohoDateTime.substring(11, 13);
        const second = zohoDateTime.substring(13, 15);

        const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;

        if (zohoDateTime.endsWith('Z')) {
          return isoString + 'Z';
        } else if (zohoDateTime.includes('+') || zohoDateTime.includes('-')) {
          const offsetMatch = zohoDateTime.match(/([+-]\d{4})$/);
          if (offsetMatch) {
            const offset = offsetMatch[1];
            return isoString + offset.substring(0, 3) + ':' + offset.substring(3);
          }
        }

        return isoString + 'Z';
      }

      return zohoDateTime;
    } catch (error) {
      console.error('Error converting Zoho datetime:', error);
      return zohoDateTime;
    }
  }

  /**
   * Update an existing calendar event
   */
  public async updateCalendarEvent(
    userId: number,
    companyId: number,
    eventId: string,
    eventData: any
  ): Promise<{ success: boolean, error?: string, eventId?: string, eventLink?: string }> {
    try {
      const client = await this.getCalendarClient(userId, companyId);

      if (!client) {
        return { success: false, error: 'Zoho Calendar client not available' };
      }

      const primaryCalendarResult = await this.getPrimaryCalendar(client);
      if (!primaryCalendarResult) {
        return { success: false, error: 'Primary calendar not found' };
      }

      const { calendar: primaryCalendar } = primaryCalendarResult;
      const calendarUid = primaryCalendar.uid;

      const formatZohoDateTime = (isoDateTime: string): string => {
        let dateStr = isoDateTime;
        if (!dateStr.includes('T')) {
          dateStr += 'T00:00:00';
        }
        if (!dateStr.includes(':') && dateStr.includes('T')) {
          dateStr += ':00:00';
        }
        if (!dateStr.endsWith('Z') && !dateStr.includes('+') && !dateStr.includes('-', 10)) {
          dateStr += 'Z';
        }



        const date = new Date(dateStr);
        const formatted = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');



        return formatted;
      };

      const startDateTime = eventData.startDateTime || eventData.start?.dateTime;
      const endDateTime = eventData.endDateTime || eventData.end?.dateTime;
      const timeZone = eventData.start?.timeZone || 'UTC';



      const zohoEventData = {
        title: eventData.summary,
        description: eventData.description || '',
        location: eventData.location || '',
        dateandtime: {
          start: formatZohoDateTime(startDateTime),
          end: formatZohoDateTime(endDateTime),
          timezone: timeZone
        },
        isallday: false,
        isprivate: false,
        attendees: Array.isArray(eventData.attendees) ? eventData.attendees.map((attendee: any) => ({
          email: attendee.email,
          permission: 1
        })) : []
      };


      let currentEvent;
      try {
        const fetchResponse = await client.get(`/calendars/${calendarUid}/events/${eventId}`);
        currentEvent = fetchResponse.data.events?.[0];

      } catch (fetchError: any) {
        console.error('Error fetching current event for ETAG:', fetchError.response?.data);
        return {
          success: false,
          error: 'Failed to fetch current event for update'
        };
      }

      if (!currentEvent) {
        return {
          success: false,
          error: 'Event not found for update'
        };
      }

      const zohoEventDataWithEtag = {
        ...zohoEventData,
        etag: currentEvent.etag || currentEvent.ctag
      };

      const formData = new URLSearchParams();
      formData.append('eventdata', JSON.stringify(zohoEventDataWithEtag));



      const response = await client.put(`/calendars/${calendarUid}/events/${eventId}`, formData.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      if (response.status === 200) {
        const updatedEvent = response.data.events?.[0];
        return {
          success: true,
          eventId: updatedEvent?.uid || updatedEvent?.id,
          eventLink: updatedEvent?.viewEventURL
        };
      } else {
        return {
          success: false,
          error: `Failed to update event, status code: ${response.status}`
        };
      }
    } catch (error: any) {
      console.error('Error updating Zoho calendar event:', error);
      console.error('Zoho API Error Response:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        errorDetails: JSON.stringify(error.response?.data, null, 2),
        headers: error.response?.headers
      });

      return {
        success: false,
        error: error.response?.data?.error || error.response?.data?.message || error.message || 'Failed to update calendar event'
      };
    }
  }

  /**
   * Delete (cancel) a calendar event
   */
  public async deleteCalendarEvent(
    userId: number,
    companyId: number,
    eventId: string,
    sendUpdates: boolean = true,
    eventLink?: string
  ): Promise<{ success: boolean, error?: string }> {
    try {
      const client = await this.getCalendarClient(userId, companyId);

      if (!client) {
        return { success: false, error: 'Zoho Calendar client not available' };
      }

      // If eventLink is provided and eventId is not, try direct database lookup first
      let finalEventId: string | null = eventId || null;
      if (eventLink && !eventId) {
        // First try direct lookup by event link (most reliable)
        const booking = await storage.getCalendarBookingByEventLink(userId, companyId, 'zoho', eventLink);
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

      console.log('Deleting calendar event:', { eventId: finalEventId, eventLink });

      const primaryCalendarResult = await this.getPrimaryCalendar(client);
      if (!primaryCalendarResult) {
        return { success: false, error: 'Primary calendar not found' };
      }

      const { calendar: primaryCalendar } = primaryCalendarResult;
      const calendarUid = primaryCalendar.uid;

      const response = await client.delete(`/calendars/${calendarUid}/events/${finalEventId}`);

      if (response.status === 204 || response.status === 200) {
        // Also delete the booking record from database
        await storage.deleteCalendarBooking(userId, companyId, 'zoho', finalEventId);
        return { success: true };
      } else {
        return {
          success: false,
          error: `Failed to delete event, status code: ${response.status}`
        };
      }
    } catch (error: any) {
      console.error('Error deleting Zoho calendar event:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to delete calendar event'
      };
    }
  }

  /**
   * Get a calendar booking by event link
   * @param userId The user ID
   * @param companyId The company ID
   * @param eventLink The Zoho Calendar event link
   * @returns The calendar booking if found, null otherwise
   */
  public async getBookingByEventLink(userId: number, companyId: number, eventLink: string): Promise<CalendarBooking | null> {
    try {
      // First try direct lookup by event link (most reliable)
      const booking = await storage.getCalendarBookingByEventLink(userId, companyId, 'zoho', eventLink);
      if (booking) {
        return booking;
      }

      // Fall back to extracting event ID from link and looking up by event ID
      const eventId = storage.extractEventIdFromLink(eventLink);
      if (!eventId) {
        return null;
      }

      return await storage.getCalendarBookingByEventId(userId, companyId, 'zoho', eventId);
    } catch (error: any) {
      console.error('Error getting booking by event link:', error);
      return null;
    }
  }

  /**
   * Check the connection status of the Zoho Calendar integration
   */
  public async checkCalendarConnectionStatus(
    userId: number,
    companyId: number
  ): Promise<{ connected: boolean, message: string }> {
    try {
      const tokens = await storage.getZohoTokens(userId, companyId);

      if (!tokens) {
        return {
          connected: false,
          message: 'Not connected to Zoho Calendar'
        };
      }

      const client = await this.getCalendarClient(userId, companyId);
      if (!client) {
        return {
          connected: false,
          message: 'Connection to Zoho Calendar failed'
        };
      }

      try {

        await client.get('/calendars');

        return {
          connected: true,
          message: 'Connected to Zoho Calendar'
        };
      } catch (testError: any) {
        console.error('Zoho Calendar connection test failed:', {
          status: testError.response?.status,
          statusText: testError.response?.statusText,
          data: testError.response?.data,
          message: testError.message
        });

        if (testError.response?.status === 401) {

          try {
            const newClient = await this.getCalendarClient(userId, companyId);
            if (newClient) {

              await newClient.get('/calendars');

              return {
                connected: true,
                message: 'Connected to Zoho Calendar (token refreshed)'
              };
            }
          } catch (refreshError: any) {
            console.error('Token refresh failed:', refreshError.message);
          }
        }

        return {
          connected: false,
          message: `Zoho Calendar connection test failed: ${testError.response?.status || testError.message}`
        };
      }
    } catch (error) {
      console.error('Error checking Zoho calendar connection:', error);
      return {
        connected: false,
        message: 'Error checking Zoho Calendar connection'
      };
    }
  }

  /**
   * Helper function to convert local time to UTC ISO string
   * @param date Date string in YYYY-MM-DD format
   * @param hour Hour (0-23)
   * @param minute Minute (0-59)
   * @param timeZone IANA timezone identifier
   * @returns UTC ISO string representing that local time
   */
  private convertLocalTimeToUTC(date: string, hour: number, minute: number, timeZone: string): string {
    try {
      const dateTimeString = `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const tempDate = new Date(dateTimeString + 'Z');
      const parts = formatter.formatToParts(tempDate);
      const partsMap = parts.reduce((acc, part) => {
        if (part.type !== 'literal') acc[part.type] = part.value;
        return acc;
      }, {} as Record<string, string>);

      const localYear = parseInt(partsMap.year || '0');
      const localMonth = parseInt(partsMap.month || '0');
      const localDay = parseInt(partsMap.day || '0');
      const localHour = parseInt(partsMap.hour || '0');
      const localMinute = parseInt(partsMap.minute || '0');

      const [year, month, day] = date.split('-').map(Number);
      const wantedMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
      const gotMs = Date.UTC(localYear, localMonth - 1, localDay, localHour, localMinute, 0, 0);
      const offsetMs = wantedMs - gotMs;

      const result = new Date(tempDate.getTime() + offsetMs);
      return result.toISOString();
    } catch (error) {
      console.error('[convertLocalTimeToUTC] Error converting timezone:', error);
      return `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`;
    }
  }

  /**
   * Get available time slots from a user's calendar
   * Note: Zoho Calendar API doesn't have a direct freebusy endpoint like Google,
   * so we'll simulate this by getting existing events and finding gaps
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
    advancedSettings?: CalendarAdvancedSettings
  ): Promise<{
    success: boolean,
    timeSlots?: Array<{
      date: string,
      slots: string[]
    }>,
    error?: string
  }> {
    try {
      const client = await this.getCalendarClient(userId, companyId);

      if (!client) {
        console.error('Zoho Calendar Service: Calendar client not available for availability check');
        return { success: false, error: 'Zoho Calendar client not available' };
      }

      const calendarId = await this.getPrimaryCalendarId(client);
      if (!calendarId) {
        return { success: false, error: 'Primary calendar not found' };
      }

      let startDateTime: string;
      let endDateTime: string;

      if (date) {
        const targetDate = new Date(date);
        startDateTime = targetDate.toISOString().split('T')[0];
        endDateTime = startDateTime;
      } else if (startDate && endDate) {
        startDateTime = startDate;
        endDateTime = endDate;
      } else {
        return { success: false, error: 'Date or date range is required' };
      }

      const eventsResponse = await client.get(`/calendars/${calendarId}/events`, {
        params: {
          range: JSON.stringify({
            start: startDateTime.replace(/-/g, ''),
            end: endDateTime.replace(/-/g, '')
          })
        }
      });

      const existingEvents = eventsResponse.data.events || [];

      const dateArray: string[] = [];
      const currentDate = new Date(startDateTime);
      const endDateObj = new Date(endDateTime);

      while (currentDate <= endDateObj) {
        dateArray.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const allAvailableSlots: Array<{date: string, slots: string[]}> = [];

      // Determine settings mode
      const useAdvancedSettings = advancedSettings && isValidAdvancedSettings(advancedSettings);
      
      if (useAdvancedSettings) {
        console.log('Zoho Calendar: Using advanced settings mode');
        // Validate that at least one day is enabled
        const enabledDays = advancedSettings.weeklySchedule.filter(day => day.enabled && !advancedSettings.offDays.includes(day.dayIndex));
        if (enabledDays.length === 0) {
          console.warn('Zoho Calendar: All days are disabled in advanced settings, falling back to simple settings');
          // Fall back to simple settings
        }
      } else {
        if (advancedSettings) {
          console.warn('Zoho Calendar: Advanced settings provided but validation failed, falling back to simple settings');
        }
        console.log('Zoho Calendar: Using simple settings mode');
      }

      for (const currentDate of dateArray) {
        // Filter out off-days if using advanced settings
        if (useAdvancedSettings && advancedSettings) {
          const dayOfWeek = new Date(currentDate).getDay(); // 0 = Sunday, 6 = Saturday
          if (advancedSettings.offDays.includes(dayOfWeek)) {
            console.log(`Zoho Calendar: Skipping ${currentDate} (${getDayName(dayOfWeek)}) - marked as off-day`);
            continue;
          }
        }
        
        const availableSlots: string[] = [];

        const dayEvents = existingEvents.filter((event: any) => {
          const eventStart = event.dateandtime?.start || event.start;
          if (!eventStart) return false;

          const eventDate = this.convertZohoToISODateTime(eventStart).split('T')[0];
          return eventDate === currentDate;
        });

        // Get day-specific hours or use global hours
        let currentBusinessHoursStartHour: number;
        let currentBusinessHoursStartMinute: number;
        let currentBusinessHoursEndHour: number;
        let currentBusinessHoursEndMinute: number;
        
        if (useAdvancedSettings && advancedSettings) {
          const dayOfWeek = new Date(currentDate).getDay();
          const dayConfig = advancedSettings.weeklySchedule[dayOfWeek];
          
          if (!dayConfig || !dayConfig.enabled) {
            console.log(`Zoho Calendar: Skipping ${currentDate} (${getDayName(dayOfWeek)}) - day is disabled`);
            continue;
          }
          
          // Parse time strings (HH:MM format)
          const [startHour, startMin] = dayConfig.startTime.split(':').map(Number);
          const [endHour, endMin] = dayConfig.endTime.split(':').map(Number);
          
          currentBusinessHoursStartHour = startHour;
          currentBusinessHoursStartMinute = startMin;
          currentBusinessHoursEndHour = endHour;
          currentBusinessHoursEndMinute = endMin;
          
          console.log(`Zoho Calendar: Using ${getDayName(dayOfWeek)} hours: ${dayConfig.startTime} - ${dayConfig.endTime}`);
        } else {
          currentBusinessHoursStartHour = businessHoursStart;
          currentBusinessHoursStartMinute = 0;
          currentBusinessHoursEndHour = businessHoursEnd;
          currentBusinessHoursEndMinute = 0;
        }

        // Generate slots by converting business hours from local timezone to UTC
        let currentHour = currentBusinessHoursStartHour;
        let currentMinute = currentBusinessHoursStartMinute;

        // Convert end time to total minutes for easier comparison
        const endTimeTotalMinutes = currentBusinessHoursEndHour * 60 + currentBusinessHoursEndMinute;

        while (true) {
          const slotEndHour = currentHour;
          const slotEndMinute = currentMinute + durationMinutes;
          const adjustedEndHour = slotEndHour + Math.floor(slotEndMinute / 60);
          const adjustedEndMinute = slotEndMinute % 60;

          // Check if slot end exceeds business hours
          const slotEndTotalMinutes = adjustedEndHour * 60 + adjustedEndMinute;
          if (slotEndTotalMinutes > endTimeTotalMinutes) {
            break;
          }

          // Convert slot start time from local timezone to UTC
          const slotStartUTC = this.convertLocalTimeToUTC(currentDate, currentHour, currentMinute, timeZone);
          const slotStart = new Date(slotStartUTC);

          // Check if this slot is in the past (for today's date)
          // CRITICAL: Use the user's timezone to determine if it's "today" locally
          const nowInUserTimeZone = new Date().toLocaleDateString('sv-SE', { timeZone });
          const isToday = nowInUserTimeZone === currentDate;
          if (isToday) {
             // If the slot start time is before now (plus a small buffer), skip it
             if (slotStart.getTime() < Date.now() + 5 * 60 * 1000) {
                // Move to next slot and continue
                currentMinute += durationMinutes;
                if (currentMinute >= 60) {
                  currentHour += Math.floor(currentMinute / 60);
                  currentMinute = currentMinute % 60;
                }
                continue;
             }
          }

          // Convert slot end time from local timezone to UTC
          const slotEndUTC = this.convertLocalTimeToUTC(currentDate, adjustedEndHour, adjustedEndMinute, timeZone);
          const slotEnd = new Date(slotEndUTC);

          // Apply buffer to candidate slot for accurate conflict detection
          // Apply buffer to candidate slots to ensure they can be booked with the required buffer.
          // A slot at 2:00-2:30 PM needs 1:50-2:40 PM to be free (with 10min buffer).
          // This ensures that slots shown as available can actually be booked with the buffer.
          const effectiveSlotStart = new Date(slotStart);
          effectiveSlotStart.setMinutes(effectiveSlotStart.getMinutes() - bufferMinutes);
          const effectiveSlotEnd = new Date(slotEnd);
          effectiveSlotEnd.setMinutes(effectiveSlotEnd.getMinutes() + bufferMinutes);

          // Check if slot conflicts with existing events
          // Standard interval overlap check: [A,B] overlaps [C,D] if A <= D and B >= C
          // Using <= and >= to handle edge cases where slots are exactly adjacent or overlapping
          // CRITICAL: This must match the logic in checkTimeSlotAvailability and checkBookingConflict
          const hasConflict = dayEvents.some((event: any) => {
            const eventStart = new Date(this.convertZohoToISODateTime(event.dateandtime?.start || event.start));
            const eventEnd = new Date(this.convertZohoToISODateTime(event.dateandtime?.end || event.end));

            // Check for overlap: effective slot (with buffer) conflicts if it shares any time with event
            const conflicts = (
              effectiveSlotStart.getTime() <= eventEnd.getTime() && 
              effectiveSlotEnd.getTime() >= eventStart.getTime()
            );

            return conflicts;
          });

          if (!hasConflict) {
            const dayOfWeekForBreaks = new Date(currentDate + 'T12:00:00').getDay();
            const dayBreaks =
              useAdvancedSettings && advancedSettings
                ? getActiveBreaksForDay(advancedSettings.weeklySchedule[dayOfWeekForBreaks])
                : [];
            const slotStartTotalMinutes = currentHour * 60 + currentMinute;
            const breakCheckStart = slotStartTotalMinutes - bufferMinutes;
            const breakCheckEnd = slotEndTotalMinutes + bufferMinutes;
            if (
              dayBreaks.length > 0 &&
              slotIntersectsAnyBreak(breakCheckStart, breakCheckEnd, dayBreaks)
            ) {
              currentMinute += durationMinutes;
              if (currentMinute >= 60) {
                currentHour += Math.floor(currentMinute / 60);
                currentMinute = currentMinute % 60;
              }
              continue;
            }

            // Format the time in the target timezone for display
            // Format: 'HH:MM AM/PM' (e.g., '10:00 AM', '02:30 PM')
            let formattedStart = slotStart.toLocaleTimeString('en-US', {
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
              console.warn('Zoho Calendar: Unexpected time format produced:', {
                original: slotStart.toISOString(),
                formatted: formattedStart,
                timeZone
              });
            }
            
            availableSlots.push(formattedStart);
          }

          // Move to next slot
          currentMinute += durationMinutes;
          if (currentMinute >= 60) {
            currentHour += Math.floor(currentMinute / 60);
            currentMinute = currentMinute % 60;
          }
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
      console.error('Error getting Zoho calendar availability:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to get available time slots'
      };
    }
  }

  /**
   * Deduplicate busy slots that exist in both database and Zoho Calendar
   * Compares slots by start/end times with small tolerance for timezone rounding (±1 minute)
   * 
   * @param busySlots Array of busy slots with {start: string, end: string}
   * @returns Deduplicated array of busy slots
   */
  private deduplicateBusySlots(busySlots: Array<{start: string, end: string}>): Array<{start: string, end: string}> {
    if (busySlots.length === 0) {
      return [];
    }

    const deduplicated: Array<{start: string, end: string}> = [];
    const toleranceMs = 60 * 1000; // 1 minute tolerance for timezone rounding

    for (const slot of busySlots) {
      const slotStart = new Date(slot.start).getTime();
      const slotEnd = new Date(slot.end).getTime();

      // Check if this slot is a duplicate of any already added slot
      const isDuplicate = deduplicated.some(existing => {
        const existingStart = new Date(existing.start).getTime();
        const existingEnd = new Date(existing.end).getTime();

        // Consider slots duplicates if start and end times are within tolerance
        const startDiff = Math.abs(slotStart - existingStart);
        const endDiff = Math.abs(slotEnd - existingEnd);

        return startDiff <= toleranceMs && endDiff <= toleranceMs;
      });

      if (!isDuplicate) {
        deduplicated.push(slot);
      }
    }

    return deduplicated;
  }
}

const zohoCalendarService = new ZohoCalendarService();
export default zohoCalendarService;
