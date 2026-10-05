import { apiRequest } from '@/lib/queryClient';

export interface ZohoCalendarStatus {
  connected: boolean;
  message: string;
}

export interface ZohoAuthData {
  authUrl: string;
}

/**
 * Centralized Zoho Calendar Authentication Service
 * Provides unified authentication management for both calendar page and flow builder nodes
 */
export class ZohoCalendarAuthService {
  private static instance: ZohoCalendarAuthService;
  private authWindow: Window | null = null;
  private authPromise: Promise<boolean> | null = null;

  private constructor() {}

  public static getInstance(): ZohoCalendarAuthService {
    if (!ZohoCalendarAuthService.instance) {
      ZohoCalendarAuthService.instance = new ZohoCalendarAuthService();
    }
    return ZohoCalendarAuthService.instance;
  }

  /**
   * Check if user's Zoho Calendar is connected
   */
  public async checkConnectionStatus(): Promise<ZohoCalendarStatus> {
    try {
      const response = await apiRequest('GET', '/api/zoho/calendar/status');
      return await response.json();
    } catch (error) {
      console.error('Error checking Zoho Calendar status:', error);
      return {
        connected: false,
        message: 'Error checking connection status'
      };
    }
  }

  /**
   * Get Zoho OAuth authentication URL
   */
  public async getAuthUrl(): Promise<string | null> {
    try {
      const response = await apiRequest('GET', '/api/zoho/auth');
      const data: ZohoAuthData = await response.json();
      return data.authUrl;
    } catch (error) {
      console.error('Error getting Zoho auth URL:', error);
      return null;
    }
  }

  /**
   * Initiate Zoho Calendar OAuth flow
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
        throw new Error('Failed to get authentication URL. Please ensure Zoho Calendar integration is configured by the platform administrator.');
      }


      this.authWindow = window.open(
        authUrl,
        'zoho_auth',
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
   * Disconnect Zoho Calendar
   */
  public async disconnect(): Promise<boolean> {
    try {
      const response = await apiRequest('DELETE', '/api/zoho/calendar');
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Error disconnecting Zoho Calendar:', error);
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


export const zohoCalendarAuth = ZohoCalendarAuthService.getInstance();
