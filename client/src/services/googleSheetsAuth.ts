import { apiRequest } from '@/lib/queryClient';

export interface GoogleSheetsStatus {
  connected: boolean;
  message: string;
}

export interface GoogleAuthData {
  authUrl: string;
}

/**
 * Centralized Google Sheets Authentication Service
 * Provides unified authentication management for Google Sheets integration
 */
export class GoogleSheetsAuthService {
  private static instance: GoogleSheetsAuthService;
  private authWindow: Window | null = null;
  private authPromise: Promise<boolean> | null = null;

  private constructor() {}

  public static getInstance(): GoogleSheetsAuthService {
    if (!GoogleSheetsAuthService.instance) {
      GoogleSheetsAuthService.instance = new GoogleSheetsAuthService();
    }
    return GoogleSheetsAuthService.instance;
  }

  /**
   * Check if user's Google Sheets is connected
   */
  public async checkConnectionStatus(): Promise<GoogleSheetsStatus> {
    try {
      const response = await apiRequest('GET', '/api/google/sheets/status');
      return await response.json();
    } catch (error) {
      console.error('Error checking Google Sheets status:', error);
      return {
        connected: false,
        message: 'Error checking connection status'
      };
    }
  }

  /**
   * Get Google OAuth authentication URL for Sheets
   */
  public async getAuthUrl(): Promise<string | null> {
    try {
      const response = await apiRequest('GET', '/api/google/sheets/auth');
      const data: GoogleAuthData = await response.json();
      return data.authUrl;
    } catch (error) {
      console.error('Error getting Google Sheets auth URL:', error);
      return null;
    }
  }

  /**
   * Initiate Google Sheets OAuth flow
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
        throw new Error('Failed to get authentication URL. Please ensure Google Sheets integration is configured by the platform administrator.');
      }


      this.authWindow = window.open(
        authUrl,
        'google_sheets_auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      if (!this.authWindow) {
        throw new Error('Failed to open authentication window. Please allow popups for this site.');
      }


      return new Promise((resolve, reject) => {
        const checkClosed = setInterval(() => {
          if (this.authWindow?.closed) {
            clearInterval(checkClosed);
            

            const checkAuthStatus = async (attempt = 1, maxAttempts = 5) => {
              try {

                const status = await this.checkConnectionStatus();

                if (status.connected) {

                  resolve(true);
                } else if (attempt < maxAttempts) {

                  setTimeout(() => checkAuthStatus(attempt + 1, maxAttempts), 1500);
                } else {

                  resolve(false);
                }
              } catch (error) {
                console.error(`Error checking auth status (attempt ${attempt}):`, error);
                if (attempt < maxAttempts) {
                  setTimeout(() => checkAuthStatus(attempt + 1, maxAttempts), 1500);
                } else {
                  reject(error);
                }
              }
            };


            setTimeout(() => checkAuthStatus(), 1500);
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
      console.error('Google Sheets authentication error:', error);
      throw error;
    }
  }

  /**
   * Disconnect Google Sheets
   */
  public async disconnect(): Promise<boolean> {
    try {
      const response = await apiRequest('DELETE', '/api/google/sheets');
      const result = await response.json();
      return result.success;
    } catch (error) {
      console.error('Error disconnecting Google Sheets:', error);
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


export const googleSheetsAuth = GoogleSheetsAuthService.getInstance();
