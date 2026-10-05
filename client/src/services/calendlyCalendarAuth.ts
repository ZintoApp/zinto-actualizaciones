import { apiRequest } from '@/lib/queryClient';

export interface CalendlyCalendarStatus {
  connected: boolean;
  user?: {
    name: string;
    email: string;
    scheduling_url: string;
    timezone: string;
  };
  message: string;
}

/**
 * Service for handling Calendly Calendar authentication
 * Provides methods for OAuth flow, status checking, and disconnection
 */
class CalendlyCalendarAuthService {
  private authPromise: Promise<boolean> | null = null;
  private authWindow: Window | null = null;

  /**
   * Check if user is currently authenticated with Calendly Calendar
   */
  public async checkConnectionStatus(): Promise<CalendlyCalendarStatus> {
    try {
      const response = await apiRequest('GET', '/api/calendly/status');
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const status = await response.json();
      return status;
    } catch (error: any) {
      return {
        connected: false,
        message: error.message || 'Failed to check Calendly Calendar connection status'
      };
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
    this.authWindow = null;
    this.authPromise = null;
  }

  /**
   * Initiate Calendly Calendar OAuth flow
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

  /**
   * Internal method to perform the actual authentication
   */
  private async _performAuthentication(): Promise<boolean> {
    try {

      const authResponse = await apiRequest('GET', '/api/calendly/auth');
      
      if (!authResponse.ok) {
        const errorData = await authResponse.json();
        throw new Error(errorData.error || 'Failed to get Calendly authentication URL');
      }

      const { authUrl } = await authResponse.json();

      if (!authUrl) {
        throw new Error('No authentication URL received from server');
      }


      const popup = window.open(
        authUrl,
        'calendly-oauth',
        'width=600,height=700,scrollbars=yes,resizable=yes'
      );

      if (!popup) {
        throw new Error('Failed to open authentication popup. Please allow popups for this site.');
      }

      this.authWindow = popup;


      return new Promise<boolean>((resolve, reject) => {
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            this.authWindow = null;


            const urlParams = new URLSearchParams(window.location.search);
            const authStatus = urlParams.get('calendly_auth');
            const errorMessage = urlParams.get('message');

            if (authStatus === 'success') {

              const newUrl = window.location.pathname;
              window.history.replaceState({}, document.title, newUrl);
              resolve(true);
            } else if (authStatus === 'error') {

              const newUrl = window.location.pathname;
              window.history.replaceState({}, document.title, newUrl);
              reject(new Error(errorMessage ? decodeURIComponent(errorMessage) : 'Authentication failed'));
            } else {

              reject(new Error('Authentication was cancelled'));
            }
          }
        }, 1000);


        setTimeout(() => {
          if (!popup.closed) {
            popup.close();
            clearInterval(checkClosed);
            this.authWindow = null;
            reject(new Error('Authentication timed out'));
          }
        }, 5 * 60 * 1000);
      });
    } catch (error: any) {
      if (this.authWindow && !this.authWindow.closed) {
        this.authWindow.close();
      }
      this.authWindow = null;

      throw error;
    }
  }

  /**
   * Disconnect the user's Calendly Calendar account
   */
  public async disconnect(): Promise<boolean> {
    try {
      const response = await apiRequest('POST', '/api/calendly/disconnect');
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to disconnect Calendly Calendar');
      }

      return true;
    } catch (error: any) {
      throw error;
    }
  }
}


export const calendlyCalendarAuth = new CalendlyCalendarAuthService();
