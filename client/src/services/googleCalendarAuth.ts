import { apiRequest } from '@/lib/queryClient';

export interface GoogleCalendarStatus {
  connected: boolean;
  message: string;
}

export interface GoogleAuthData {
  authUrl: string;
}

export interface GoogleCalendarListItem {
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
}

export interface GoogleCalendarListResponse {
  success: boolean;
  calendars: GoogleCalendarListItem[];
  error?: string;
}

/**
 * Centralized Google Calendar Authentication Service
 * Provides unified authentication management for both calendar page and flow builder nodes
 */
export class GoogleCalendarAuthService {
  private static instance: GoogleCalendarAuthService;
  private authWindow: Window | null = null;
  private authPromise: Promise<boolean> | null = null;

  private constructor() {}

  public static getInstance(): GoogleCalendarAuthService {
    if (!GoogleCalendarAuthService.instance) {
      GoogleCalendarAuthService.instance = new GoogleCalendarAuthService();
    }
    return GoogleCalendarAuthService.instance;
  }

  /**
   * Check if user's Google Calendar is connected
   */
  public async checkConnectionStatus(): Promise<GoogleCalendarStatus> {
    try {
      const response = await apiRequest('GET', '/api/google/calendar/status');
      return await response.json();
    } catch (error) {
      console.error('Error checking Google Calendar status:', error);
      return {
        connected: false,
        message: 'Error checking connection status'
      };
    }
  }

  public async listCalendars(options?: { assignmentStrategy?: string; targetAgentUserId?: number | null }): Promise<GoogleCalendarListResponse> {
    try {
      const params = new URLSearchParams();
      if (options?.assignmentStrategy) {
        params.set('assignmentStrategy', options.assignmentStrategy);
      }
      if (options?.targetAgentUserId != null) {
        params.set('targetAgentUserId', options.targetAgentUserId.toString());
      }
      const query = params.toString();
      const response = await apiRequest('GET', `/api/google/calendar/calendars${query ? `?${query}` : ''}`);
      return await response.json();
    } catch (error) {
      console.error('Error listing Google Calendars:', error);
      return {
        success: false,
        calendars: [],
        error: 'Failed to list calendars'
      };
    }
  }

  /**
   * Get Google OAuth authentication URL
   */
  public async getAuthUrl(): Promise<string | null> {
    try {
      const response = await apiRequest('GET', '/api/google/auth');
      const data: GoogleAuthData = await response.json();
      return data.authUrl;
    } catch (error) {
      console.error('Error getting Google auth URL:', error);
      return null;
    }
  }

  /**
   * Initiate Google Calendar OAuth flow
   * Returns a promise that resolves when authentication is complete
   */
  public async authenticate(): Promise<boolean> {

    if (this.authPromise) {
      return this.authPromise;
    }

    this.authPromise = this._performAuthentication();
    
    try {
      const result = await this.authPromise;
      return result;
    } finally {
      this.authPromise = null;
    }
  }

  private async _performAuthentication(): Promise<boolean> {
    try {
      const authUrl = await this.getAuthUrl();
      
      if (!authUrl) {
        throw new Error('Failed to get authentication URL. Please ensure Google Calendar integration is configured by the platform administrator.');
      }


      this.authWindow = window.open(
        authUrl,
        'google_auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      if (!this.authWindow) {
        throw new Error('Failed to open authentication window. Please allow popups for this site.');
      }


      return new Promise((resolve, reject) => {
        const checkClosed = setInterval(() => {
          if (this.authWindow?.closed) {
            clearInterval(checkClosed);
            

            setTimeout(async () => {
              try {
                const status = await this.checkConnectionStatus();
                resolve(status.connected);
              } catch (error) {
                reject(error);
              }
            }, 1000);
          }
        }, 1000);


        setTimeout(() => {
          clearInterval(checkClosed);
          if (this.authWindow && !this.authWindow.closed) {
            this.authWindow.close();
          }
          reject(new Error('Authentication timeout'));
        }, 5 * 60 * 1000);
      });

    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }

  /**
   * Disconnect Google Calendar
   */
  public async disconnect(): Promise<boolean> {
    try {
      const response = await apiRequest('DELETE', '/api/google/calendar');
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Error disconnecting Google Calendar:', error);
      return false;
    }
  }

  /**
   * Check if authentication is currently in progress
   */
  public isAuthenticating(): boolean {
    return this.authPromise !== null;
  }

  /**
   * Cancel ongoing authentication
   */
  public cancelAuthentication(): void {
    if (this.authWindow && !this.authWindow.closed) {
      this.authWindow.close();
    }
    this.authPromise = null;
  }
}


export const googleCalendarAuth = GoogleCalendarAuthService.getInstance();
