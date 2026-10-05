import axios, { AxiosInstance } from 'axios';
import { Request, Response } from 'express';
import { storage } from '../storage';

const SCOPES = ['default'];
const CALENDLY_API_BASE_URL = 'https://api.calendly.com';
const CALENDLY_AUTH_BASE_URL = 'https://auth.calendly.com';

interface CalendlyOAuthCredentials {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface CalendlyTokens {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  updatedAt?: Date;
}

interface CalendlyUser {
  uri: string;
  name: string;
  slug: string;
  email: string;
  scheduling_url: string;
  timezone: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

interface CalendlyEvent {
  uri: string;
  name: string;
  status: string;
  start_time: string;
  end_time: string;
  event_type: string;
  location?: {
    type: string;
    location?: string;
    join_url?: string;
  };
  invitees_counter: {
    total: number;
    active: number;
    limit: number;
  };
  created_at: string;
  updated_at: string;
}

class CalendlyCalendarService {
  constructor() {
  }

  /**
   * Get Calendly OAuth credentials from super admin settings
   */
  private async getApplicationCredentials(): Promise<CalendlyOAuthCredentials | null> {
    try {
      const credentials = await storage.getAppSetting('calendly_oauth');

      if (!credentials || !credentials.value) {
        return null;
      }

      const config = credentials.value as any;

      if (!config.enabled || !config.client_id || !config.client_secret) {
        return null;
      }

      return {
        clientId: config.client_id,
        clientSecret: config.client_secret,
        redirectUri: config.redirect_uri || `${process.env.BASE_URL || 'http://localhost:9000'}/api/calendly/callback`
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Generate an authentication URL for Calendly
   */
  public async getAuthUrl(userId: number, companyId: number): Promise<string | null> {
    try {
      const credentials = await this.getApplicationCredentials();

      if (!credentials) {
        return null;
      }

      const state = Buffer.from(JSON.stringify({ userId, companyId })).toString('base64');
      const scope = SCOPES.join(' ');

      const authUrl = new URL(`${CALENDLY_AUTH_BASE_URL}/oauth/authorize`);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', credentials.clientId);
      authUrl.searchParams.set('scope', scope);
      authUrl.searchParams.set('redirect_uri', credentials.redirectUri);
      authUrl.searchParams.set('state', state);

      return authUrl.toString();
    } catch (error) {
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
        res.status(400).send('Calendly OAuth not configured in admin settings');
        return;
      }

      const tokenResponse = await axios.post(`${CALENDLY_AUTH_BASE_URL}/oauth/token`, {
        grant_type: 'authorization_code',
        code,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        redirect_uri: credentials.redirectUri
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const tokens: CalendlyTokens = tokenResponse.data;

      const calendlyTokens = {
        access_token: tokens.access_token || '',
        refresh_token: tokens.refresh_token || undefined,
        expires_in: tokens.expires_in || undefined,
        token_type: tokens.token_type || undefined,
        scope: tokens.scope || undefined
      };

      await storage.saveCalendlyTokens(userId, companyId, calendlyTokens);

      res.redirect('/settings?calendly_auth=success');
    } catch (error: any) {
      let errorMessage = 'Failed to authenticate with Calendly';
      if (error.response?.data?.error === 'invalid_client') {
        errorMessage = 'Invalid Calendly Client ID. Please check your Calendly Developer Console configuration.';
      } else if (error.response?.data?.error === 'invalid_request') {
        errorMessage = 'Invalid OAuth request. Please check your Calendly application settings.';
      } else if (error.response?.data?.error === 'access_denied') {
        errorMessage = 'Access denied. Please ensure you have the required permissions.';
      }

      res.redirect(`/settings?calendly_auth=error&message=${encodeURIComponent(errorMessage)}`);
    }
  }

  /**
   * Get user's Calendly tokens
   */
  private async getUserTokens(userId: number, companyId: number): Promise<CalendlyTokens | null> {
    try {
      return await storage.getCalendlyTokens(userId, companyId);
    } catch (error) {
      return null;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(userId: number, companyId: number, refreshToken: string): Promise<CalendlyTokens | null> {
    try {
      const credentials = await this.getApplicationCredentials();

      if (!credentials) {
        return null;
      }

      const response = await axios.post(`${CALENDLY_AUTH_BASE_URL}/oauth/token`, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const tokens: CalendlyTokens = response.data;

      const calendlyTokens = {
        access_token: tokens.access_token || '',
        refresh_token: tokens.refresh_token || refreshToken,
        expires_in: tokens.expires_in || undefined,
        token_type: tokens.token_type || undefined,
        scope: tokens.scope || undefined
      };

      await storage.saveCalendlyTokens(userId, companyId, calendlyTokens);

      return calendlyTokens;
    } catch (error: any) {
      return null;
    }
  }

  /**
   * Create an authenticated Axios instance for Calendly API calls
   */
  private async createAuthenticatedClient(userId: number, companyId: number): Promise<AxiosInstance | null> {
    try {
      let tokens = await this.getUserTokens(userId, companyId);

      if (!tokens) {
        return null;
      }


      if (tokens.expires_in && tokens.updatedAt) {
        const expirationTime = new Date(tokens.updatedAt.getTime() + (tokens.expires_in * 1000));
        const now = new Date();

        if (now >= expirationTime && tokens.refresh_token) {
          tokens = await this.refreshAccessToken(userId, companyId, tokens.refresh_token);

          if (!tokens) {
            return null;
          }
        }
      }

      const client = axios.create({
        baseURL: CALENDLY_API_BASE_URL,
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        }
      });

      return client;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get current user information from Calendly
   */
  public async getCurrentUser(userId: number, companyId: number): Promise<CalendlyUser | null> {
    try {
      const client = await this.createAuthenticatedClient(userId, companyId);

      if (!client) {
        return null;
      }

      const response = await client.get('/users/me');
      return response.data.resource;
    } catch (error: any) {
      return null;
    }
  }

  /**
   * Get scheduled events for the authenticated user
   */
  public async getScheduledEvents(userId: number, companyId: number, options: {
    count?: number;
    page_token?: string;
    sort?: string;
    status?: string;
    min_start_time?: string;
    max_start_time?: string;
  } = {}): Promise<{ collection: CalendlyEvent[]; pagination?: any } | null> {
    try {
      const client = await this.createAuthenticatedClient(userId, companyId);

      if (!client) {
        return null;
      }


      const currentUser = await this.getCurrentUser(userId, companyId);
      if (!currentUser) {
        return null;
      }

      const params = new URLSearchParams();
      params.set('user', currentUser.uri);

      if (options.count) params.set('count', options.count.toString());
      if (options.page_token) params.set('page_token', options.page_token);
      if (options.sort) params.set('sort', options.sort);
      if (options.status) params.set('status', options.status);
      if (options.min_start_time) params.set('min_start_time', options.min_start_time);
      if (options.max_start_time) params.set('max_start_time', options.max_start_time);

      const response = await client.get(`/scheduled_events?${params.toString()}`);
      return response.data;
    } catch (error: any) {
      return null;
    }
  }

  /**
   * Get a specific scheduled event by URI
   */
  public async getScheduledEvent(userId: number, companyId: number, eventUri: string): Promise<CalendlyEvent | null> {
    try {
      const client = await this.createAuthenticatedClient(userId, companyId);

      if (!client) {
        return null;
      }


      const eventUuid = eventUri.split('/').pop();
      const response = await client.get(`/scheduled_events/${eventUuid}`);
      return response.data.resource;
    } catch (error: any) {
      return null;
    }
  }

  /**
   * Cancel a scheduled event
   */
  public async cancelScheduledEvent(userId: number, companyId: number, eventUri: string, reason?: string): Promise<boolean> {
    try {
      const client = await this.createAuthenticatedClient(userId, companyId);

      if (!client) {
        return false;
      }


      const eventUuid = eventUri.split('/').pop();

      const payload: any = {};
      if (reason) {
        payload.reason = reason;
      }

      await client.post(`/scheduled_events/${eventUuid}/cancellation`, payload);
      return true;
    } catch (error: any) {
      return false;
    }
  }

  /**
   * Get event types for the authenticated user
   */
  public async getEventTypes(userId: number, companyId: number, options: {
    count?: number;
    page_token?: string;
    sort?: string;
    active?: boolean;
  } = {}): Promise<{ collection: any[]; pagination?: any } | null> {
    try {
      const client = await this.createAuthenticatedClient(userId, companyId);

      if (!client) {
        return null;
      }


      const currentUser = await this.getCurrentUser(userId, companyId);
      if (!currentUser) {
        return null;
      }

      const params = new URLSearchParams();
      params.set('user', currentUser.uri);

      if (options.count) params.set('count', options.count.toString());
      if (options.page_token) params.set('page_token', options.page_token);
      if (options.sort) params.set('sort', options.sort);
      if (options.active !== undefined) params.set('active', options.active.toString());

      const response = await client.get(`/event_types?${params.toString()}`);
      return response.data;
    } catch (error: any) {
      return null;
    }
  }

  /**
   * Check if user has valid Calendly authentication
   */
  public async isAuthenticated(userId: number, companyId: number): Promise<boolean> {
    try {
      const tokens = await this.getUserTokens(userId, companyId);
      if (!tokens) return false;

      const client = await this.createAuthenticatedClient(userId, companyId);
      if (!client) return false;


      const user = await this.getCurrentUser(userId, companyId);
      return !!user;
    } catch (error) {
      return false;
    }
  }

  /**
   * Disconnect user's Calendly account
   */
  public async disconnect(userId: number, companyId: number): Promise<boolean> {
    try {
      return await storage.deleteCalendlyTokens(userId, companyId);
    } catch (error) {
      return false;
    }
  }
}

export const calendlyCalendarService = new CalendlyCalendarService();
