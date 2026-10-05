import { google } from 'googleapis';
import { JWT } from 'google-auth-library';
import { OAuth2Client } from 'google-auth-library';
import { storage } from '../storage';

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.readonly', 
];

export interface GoogleSheetsConfig {
  serviceAccountJson: string;
  spreadsheetId: string;
  sheetName: string;
}

export interface AppendRowOptions {
  columnMappings: Record<string, any>;
  duplicateCheck?: {
    enabled: boolean;
    columns: string[];
    caseSensitive?: boolean;
    onDuplicate: 'skip' | 'update' | 'add_anyway';
  };
  /** Filled from AI delegation (manual task) args when the node has no static column mappings */
  delegationUserRequest?: string;
}

export interface ReadRowsOptions {
  filterColumn?: string;
  filterValue?: any;
  startRow?: number;
  maxRows?: number;
}

export interface UpdateRowOptions {
  matchColumn: string;
  matchValue: any;
  columnMappings: Record<string, any>;
}

export interface GoogleSheetsResponse {
  success: boolean;
  data?: any;
  error?: string;
  rowsAffected?: number;
}

/** Remove leading "… sheet: " so "Field - value" pairs parse reliably after LLM tool args. */
function stripSheetIntentPrefix(userRequest: string): string {
  const trimmed = (userRequest || '').trim();
  if (!trimmed) return trimmed;
  return trimmed.replace(/^[\s\S]*?\bsheet\s*:\s*/i, '').trim() || trimmed;
}

/**
 * Infer column labels and values from a natural-language user_request (agent delegation).
 */
export function inferFieldsFromUserRequest(userRequest: string): { orderedKeys: string[]; values: Record<string, string> } {
  const orderedKeys: string[] = [];
  const values: Record<string, string> = {};
  const cleaned = stripSheetIntentPrefix(userRequest);
  const segments = cleaned.split(/[,\n\r]+/).map((s) => s.trim()).filter(Boolean);
  for (const seg of segments) {
    const m = seg.match(/^([A-Za-z][A-Za-z0-9 _]*?)\s*[-–—:]\s*(.+)$/);
    if (m) {
      const k = m[1].trim();
      const v = m[2].trim();
      if (!(k in values)) orderedKeys.push(k);
      values[k] = v;
    }
  }
  return { orderedKeys, values };
}

/**
 * Map user_request fields onto existing sheet headers (case-sensitive keys preferred; matching uses header text).
 */
export function parseUserRequestIntoColumnMappings(userRequest: string, headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (!userRequest || !headers.length) return out;
  const cleaned = stripSheetIntentPrefix(userRequest);
  const lines = cleaned.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const rawHeader of headers) {
    const h = rawHeader.trim();
    if (!h) continue;
    const escaped = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const lineRe = new RegExp(`^${escaped}\\s*[-–—:]\\s*(.+)$`, 'i');
    for (const line of lines) {
      const m = line.match(lineRe);
      if (m) {
        out[h] = m[1].trim();
        break;
      }
    }
  }
  for (const rawHeader of headers) {
    const h = rawHeader.trim();
    if (!h || out[h]) continue;
    if (/^(timestamp|date\s*added|created\s*at)$/i.test(h)) {
      out[h] = new Date().toISOString();
    }
  }
  return out;
}

class GoogleSheetsService {
  /**
   * Get Google OAuth credentials from super admin settings
   */
  private async getApplicationCredentials(): Promise<{
    clientId: string;
    clientSecret: string;
    redirectUri: string;
  } | null> {
    try {
      const credentials = await storage.getAppSetting('google_sheets_oauth');

      if (!credentials || !credentials.value) {
        console.error('Google Sheets OAuth not configured in admin settings');
        return null;
      }

      const config = credentials.value as any;
      if (!config.enabled || !config.client_id || !config.client_secret) {
        console.error('Google Sheets OAuth not properly configured or disabled');
        return null;
      }

      return {
        clientId: config.client_id,
        clientSecret: config.client_secret,
        redirectUri: config.redirect_uri || `${process.env.BASE_URL || 'http://localhost:9000'}/api/google/sheets/callback`
      };
    } catch (error) {
      console.error('Error getting application Google Sheets credentials:', error);
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
   * Legacy method for service account authentication (backward compatibility)
   */
  private getAuthClient(serviceAccountJson: string): JWT {
    try {
      const credentials = JSON.parse(serviceAccountJson);

      return new JWT({
        email: credentials.client_email,
        key: credentials.private_key,
        scopes: [
          'https://www.googleapis.com/auth/spreadsheets',
          'https://www.googleapis.com/auth/drive.file'
        ]
      });
    } catch (error) {
      throw new Error(`Invalid service account JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get authenticated Sheets client using OAuth tokens
   */
  private async getSheetsClientWithOAuth(userId: number, companyId: number) {
    const oauth2Client = await this.getOAuth2Client();

    if (!oauth2Client) {
      throw new Error('Google Sheets OAuth not configured');
    }


    const tokens = await storage.getGoogleTokens(userId, companyId);
    if (!tokens) {
      throw new Error('User not authenticated with Google Sheets');
    }

    oauth2Client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date
    });


    if (tokens.expiry_date && tokens.expiry_date < Date.now() && tokens.refresh_token) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();


        const updatedTokens = {
          access_token: credentials.access_token || tokens.access_token,
          refresh_token: credentials.refresh_token || tokens.refresh_token,
          id_token: credentials.id_token || tokens.id_token,
          token_type: credentials.token_type || tokens.token_type,
          expiry_date: credentials.expiry_date || tokens.expiry_date,
          scope: credentials.scope || tokens.scope
        };

        await storage.saveGoogleTokens(userId, companyId, updatedTokens);


        oauth2Client.setCredentials(credentials);
      } catch (error) {
        console.error('Error refreshing Google Sheets tokens:', error);
        throw new Error('Token refresh failed. Please re-authenticate.');
      }
    }

    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    return sheets;
  }

  /**
   * Legacy method for service account authentication (backward compatibility)
   */
  private async getSheetsClient(config: GoogleSheetsConfig) {
    const auth = this.getAuthClient(config.serviceAccountJson);
    const sheets = google.sheets({ version: 'v4', auth });
    return sheets;
  }

  /**
   * Generate an authentication URL for Google Sheets
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
   * Handle OAuth callback for Google Sheets
   */
  public async handleAuthCallback(req: any, res: any): Promise<void> {
    try {
      const { code, state, error } = req.query;

      if (error) {
        res.status(400).send(`Authentication error: ${error}`);
        return;
      }

      if (!code || !state) {
        res.status(400).send('Missing authorization code or state');
        return;
      }

      const { userId, companyId } = JSON.parse(Buffer.from(state, 'base64').toString());

      const oauth2Client = await this.getOAuth2Client();

      if (!oauth2Client) {
        res.status(400).send('Google Sheets OAuth not configured in admin settings');
        return;
      }

      const { tokens } = await oauth2Client.getToken(code);
      

      if (!tokens.access_token) {
        console.error('No access token received from Google OAuth');
        res.status(400).send('Authentication failed: No access token received');
        return;
      }


      const tokenData = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || undefined,
        id_token: tokens.id_token || undefined,
        token_type: tokens.token_type || undefined,
        expiry_date: tokens.expiry_date || undefined,
        scope: tokens.scope || undefined
      };


      const saveResult = await storage.saveGoogleTokens(userId, companyId, tokenData);

      if (!saveResult) {
        console.error('Failed to save Google Sheets tokens');
        res.status(500).send('Error saving authentication tokens');
        return;
      }



      res.send(`
        <html>
          <body>
            <h1>Google Sheets Connected Successfully!</h1>
            <p>You can now close this window and return to BotHivePlus.</p>
            <script>window.close();</script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error('Error handling Google Sheets auth callback:', error);
      res.status(500).send(`
        <html>
          <body>
            <h1>Authentication Error</h1>
            <p>There was an error completing your Google Sheets authentication.</p>
            <p>Please close this window and try again.</p>
            <script>
              setTimeout(() => {
                window.close();
              }, 3000);
            </script>
          </body>
        </html>
      `);
    }
  }

  /**
   * Check if user has valid Google Sheets authentication
   */
  public async checkUserAuthentication(userId: number, companyId: number): Promise<{ connected: boolean; message: string }> {
    try {

      const tokens = await storage.getGoogleTokens(userId, companyId);

      if (!tokens) {

        return {
          connected: false,
          message: 'Not connected to Google Sheets'
        };
      }




      if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
        if (tokens.refresh_token) {


          try {
            const oauth2Client = await this.getOAuth2Client();
            if (oauth2Client) {
              oauth2Client.setCredentials({
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expiry_date: tokens.expiry_date
              });

              const { credentials } = await oauth2Client.refreshAccessToken();


              const updatedTokens = {
                access_token: credentials.access_token || tokens.access_token,
                refresh_token: credentials.refresh_token || tokens.refresh_token,
                id_token: credentials.id_token || tokens.id_token,
                token_type: credentials.token_type || tokens.token_type,
                expiry_date: credentials.expiry_date || tokens.expiry_date,
                scope: credentials.scope || tokens.scope
              };

              await storage.saveGoogleTokens(userId, companyId, updatedTokens);


              return {
                connected: true,
                message: 'Connected to Google Sheets'
              };
            }
          } catch (refreshError) {
            console.error('Token refresh failed:', refreshError);
            await storage.deleteGoogleTokens(userId, companyId);
            return {
              connected: false,
              message: 'Authentication expired, please reconnect'
            };
          }
        } else {

          await storage.deleteGoogleTokens(userId, companyId);
          return {
            connected: false,
            message: 'Authentication expired, please reconnect'
          };
        }
      }


      return {
        connected: true,
        message: 'Connected to Google Sheets'
      };
    } catch (error) {
      console.error('Error checking Google Sheets authentication:', error);
      return {
        connected: false,
        message: 'Error checking authentication status'
      };
    }
  }

  /**
   * List user's Google Sheets
   */
  async listUserSheets(userId: number, companyId: number): Promise<{ success: boolean; sheets?: Array<{id: string, name: string}>; error?: string }> {
    try {
      const sheets = await this.getSheetsClientWithOAuth(userId, companyId);
      const drive = google.drive({ version: 'v3', auth: sheets.context._options.auth });

      const response = await drive.files.list({
        q: "mimeType='application/vnd.google-apps.spreadsheet'",
        fields: 'files(id, name)',
        pageSize: 100,
        orderBy: 'modifiedTime desc'
      });

      const sheetsList = response.data.files?.map(file => ({
        id: file.id!,
        name: file.name!
      })) || [];

      return {
        success: true,
        sheets: sheetsList
      };
    } catch (error) {
      console.error('Error listing Google Sheets:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Get sheet names from a specific spreadsheet
   */
  async getSheetNames(userId: number, companyId: number, spreadsheetId: string): Promise<{ success: boolean; sheetNames?: string[]; error?: string }> {
    try {
      const sheets = await this.getSheetsClientWithOAuth(userId, companyId);

      const response = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'sheets.properties.title'
      });

      const sheetNames = response.data.sheets?.map(sheet => sheet.properties?.title).filter(Boolean) as string[] || [];

      return {
        success: true,
        sheetNames
      };
    } catch (error) {
      console.error('Error getting sheet names:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Test connection using OAuth authentication
   */
  async testConnectionWithOAuth(userId: number, companyId: number, spreadsheetId: string, sheetName: string = 'Sheet1'): Promise<GoogleSheetsResponse> {
    try {
      const sheets = await this.getSheetsClientWithOAuth(userId, companyId);

      const response = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: 'properties.title,sheets.properties'
      });

      const sheetExists = response.data.sheets?.some(
        sheet => sheet.properties?.title === sheetName
      );

      if (!sheetExists) {
        return {
          success: false,
          error: `Sheet "${sheetName}" not found in spreadsheet`
        };
      }

      return {
        success: true,
        data: {
          spreadsheetTitle: response.data.properties?.title,
          sheetName: sheetName,
          message: 'Connection successful'
        }
      };
    } catch (error) {
      console.error('Error testing Google Sheets connection with OAuth:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      };
    }
  }

  /**
   * Test connection to Google Sheets (legacy method for backward compatibility)
   */
  async testConnection(config: GoogleSheetsConfig): Promise<GoogleSheetsResponse> {
    try {
      const sheets = await this.getSheetsClient(config);
      
      const response = await sheets.spreadsheets.get({
        spreadsheetId: config.spreadsheetId,
        fields: 'properties.title,sheets.properties'
      });

      const sheetExists = response.data.sheets?.some(
        sheet => sheet.properties?.title === config.sheetName
      );

      if (!sheetExists) {
        return {
          success: false,
          error: `Sheet "${config.sheetName}" not found in spreadsheet`
        };
      }

      return {
        success: true,
        data: {
          spreadsheetTitle: response.data.properties?.title,
          sheetName: config.sheetName,
          message: 'Connection successful'
        }
      };
    } catch (error: any) {
      console.error('Google Sheets connection test failed:', error);

      let errorMessage = 'Connection test failed';

      if (error.status === 403 || error.code === 403) {
        errorMessage = 'Permission denied. Please ensure:\n' +
          '1. The service account email has been shared with the Google Sheet\n' +
          '2. The service account has "Editor" or "Viewer" permissions\n' +
          '3. The Google Sheets API is enabled in your Google Cloud project';
      } else if (error.status === 404 || error.code === 404) {
        errorMessage = 'Spreadsheet not found. Please check:\n' +
          '1. The Spreadsheet ID is correct\n' +
          '2. The spreadsheet exists and is accessible';
      } else if (error.status === 401 || error.code === 401) {
        errorMessage = 'Authentication failed. Please check:\n' +
          '1. The Service Account JSON is valid\n' +
          '2. The service account key has not expired';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Add test data to Google Sheets
   */
  async addTestData(config: GoogleSheetsConfig): Promise<GoogleSheetsResponse> {
    try {
      const sheets = await this.getSheetsClient(config);

      const timestamp = new Date().toISOString();
      const testData = [
        [
          'Test',
          'test@app.com',
          '+1234567890',
          'Test message from google sheets node',
          timestamp,
          'Connection test successful'
        ]
      ];

      let range = `${config.sheetName}!A:F`;

      try {
        const headerResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: config.spreadsheetId,
          range: `${config.sheetName}!1:1`
        });

        const hasHeaders = headerResponse.data.values && headerResponse.data.values.length > 0;

        if (!hasHeaders) {
          const headers = [
            ['Name', 'Email', 'Phone', 'Message', 'Timestamp', 'Status']
          ];

          await sheets.spreadsheets.values.update({
            spreadsheetId: config.spreadsheetId,
            range: `${config.sheetName}!A1:F1`,
            valueInputOption: 'RAW',
            requestBody: {
              values: headers
            }
          });
        }
      } catch (headerError) {

      }

      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: config.spreadsheetId,
        range: range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: testData
        }
      });

      return {
        success: true,
        data: {
          range: response.data.updates?.updatedRange,
          rowsAdded: response.data.updates?.updatedRows,
          message: 'Test data added successfully'
        }
      };
    } catch (error: any) {
      console.error('Google Sheets add test data failed:', error);

      let errorMessage = 'Failed to add test data';

      if (error.status === 403 || error.code === 403) {
        errorMessage = 'Permission denied. The service account needs "Editor" permissions to add data.';
      } else if (error.status === 404 || error.code === 404) {
        errorMessage = 'Sheet not found. Please check the sheet name.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Add test data to Google Sheets using OAuth authentication
   */
  async addTestDataWithOAuth(userId: number, companyId: number, spreadsheetId: string, sheetName: string): Promise<GoogleSheetsResponse> {
    try {
      const sheets = await this.getSheetsClientWithOAuth(userId, companyId);

      const timestamp = new Date().toISOString();
      const testData = [
        [
          'Test',
          'test@app.com',
          '+1234567890',
          'Test message from google sheets node',
          timestamp,
          'Connection test successful'
        ]
      ];

      let range = `${sheetName}!A:F`;

      try {

        const headerResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: spreadsheetId,
          range: `${sheetName}!1:1`
        });

        const hasHeaders = headerResponse.data.values && headerResponse.data.values.length > 0;

        if (!hasHeaders) {

          const headers = [
            ['Name', 'Email', 'Phone', 'Message', 'Timestamp', 'Status']
          ];

          await sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A1:F1`,
            valueInputOption: 'RAW',
            requestBody: {
              values: headers
            }
          });
        }
      } catch (headerError) {

      }


      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: range,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: testData
        }
      });

      return {
        success: true,
        data: {
          range: response.data.updates?.updatedRange,
          rowsAdded: response.data.updates?.updatedRows,
          message: 'Test data added successfully'
        }
      };
    } catch (error: any) {
      console.error('Google Sheets add test data with OAuth failed:', error);

      let errorMessage = 'Failed to add test data';

      if (error.status === 403 || error.code === 403) {
        errorMessage = 'Permission denied. Please ensure your Google account has edit permissions for this sheet.';
      } else if (error.status === 404 || error.code === 404) {
        errorMessage = 'Sheet not found. Please check the sheet name.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get sheet information including headers
   */
  async getSheetInfo(config: GoogleSheetsConfig): Promise<GoogleSheetsResponse> {
    try {
      const sheets = await this.getSheetsClient(config);
      
      const metadataResponse = await sheets.spreadsheets.get({
        spreadsheetId: config.spreadsheetId,
        fields: 'properties,sheets.properties'
      });

      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: `${config.sheetName}!1:1`
      });

      const headers = headerResponse.data.values?.[0] || [];
      const sheetProperties = metadataResponse.data.sheets?.find(
        sheet => sheet.properties?.title === config.sheetName
      )?.properties;

      return {
        success: true,
        data: {
          spreadsheetTitle: metadataResponse.data.properties?.title,
          sheetName: config.sheetName,
          headers,
          rowCount: sheetProperties?.gridProperties?.rowCount || 0,
          columnCount: sheetProperties?.gridProperties?.columnCount || 0
        }
      };
    } catch (error) {
      console.error('Error getting sheet info:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get sheet info'
      };
    }
  }

  /**
   * Append a new row to the sheet with optional duplicate checking
   */
  async appendRow(config: GoogleSheetsConfig, options: AppendRowOptions): Promise<GoogleSheetsResponse> {
    try {
      const sheets = await this.getSheetsClient(config);

      const delegationReq =
        typeof options.delegationUserRequest === 'string' && options.delegationUserRequest.trim()
          ? options.delegationUserRequest
          : '';
      let effectiveMappings: Record<string, any> = { ...(options.columnMappings || {}) };

      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: `${config.sheetName}!1:1`
      });

      let headers = headerResponse.data.values?.[0] || [];
      

      if (headers.length === 0) {
        let columnNames = Object.keys(effectiveMappings);
        if (columnNames.length === 0 && delegationReq) {
          const inferred = inferFieldsFromUserRequest(delegationReq);
          if (inferred.orderedKeys.length > 0) {
            columnNames = inferred.orderedKeys;
            effectiveMappings = { ...inferred.values };
          }
        }
        if (columnNames.length > 0) {

          await sheets.spreadsheets.values.update({
            spreadsheetId: config.spreadsheetId,
            range: `${config.sheetName}!A1:${String.fromCharCode(65 + columnNames.length - 1)}1`,
            valueInputOption: 'RAW',
            requestBody: {
              values: [columnNames]
            }
          });
          
          headers = columnNames;
        } else {
          return {
            success: false,
            error: 'No headers found in the sheet and no column mappings provided to create headers automatically.'
          };
        }
      } else {
        const hasConfiguredValues = Object.values(effectiveMappings).some(
          (v) => v !== undefined && v !== null && String(v).trim() !== ''
        );
        if ((!hasConfiguredValues || Object.keys(effectiveMappings).length === 0) && delegationReq) {
          const parsed = parseUserRequestIntoColumnMappings(delegationReq, headers as string[]);
          effectiveMappings = { ...parsed, ...effectiveMappings };
        }
      }

      const rowData: any[] = new Array(headers.length).fill('');

      for (const [columnName, value] of Object.entries(effectiveMappings)) {
        const keyNorm = columnName.trim().toLowerCase();
        const columnIndex = headers.findIndex(
          (header) => header.toString().trim().toLowerCase() === keyNorm
        );

        if (columnIndex !== -1) {
          rowData[columnIndex] = value;
        }
      }

      const saFilled = rowData.filter((value: any) => String(value ?? '').trim().length > 0).length;
      const saAllBlank = saFilled === 0;

      if (saAllBlank) {
        return {
          success: false,
          error:
            'No values to append: row is empty. Pass column mappings or delegation text with field lines matching headers.'
        };
      }

      if (options.duplicateCheck?.enabled) {
        const duplicateResult = await this.checkForDuplicates(
          config,
          headers,
          rowData,
          options.duplicateCheck
        );

        if (duplicateResult.isDuplicate) {
          switch (options.duplicateCheck.onDuplicate) {
            case 'skip':
              return {
                success: true,
                data: {
                  action: 'skipped',
                  reason: 'Duplicate found',
                  duplicateRow: duplicateResult.duplicateRowNumber,
                  message: `Row skipped - duplicate found at row ${duplicateResult.duplicateRowNumber}`
                },
                rowsAffected: 0
              };

            case 'update':
              return await this.updateExistingRow(
                config,
                headers,
                rowData,
                duplicateResult.duplicateRowNumber!
              );

            case 'add_anyway':

              break;
          }
        }
      }

      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: config.spreadsheetId,
        range: `${config.sheetName}!A:A`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [rowData]
        }
      });

      const result: GoogleSheetsResponse = {
        success: true,
        data: {
          updatedRange: response.data.updates?.updatedRange,
          updatedRows: response.data.updates?.updatedRows || 1,
          action: 'appended'
        } as any,
        rowsAffected: 1
      };


      if (options.duplicateCheck?.enabled && options.duplicateCheck.onDuplicate === 'add_anyway') {
        const duplicateResult = await this.checkForDuplicates(
          config,
          headers,
          rowData,
          options.duplicateCheck
        );
        if (duplicateResult.isDuplicate) {
          (result.data as any).warning = `Duplicate detected at row ${duplicateResult.duplicateRowNumber} but added anyway`;
        }
      }

      return result;
    } catch (error) {
      console.error('Error appending row:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to append row'
      };
    }
  }

  /**
   * Check for duplicate rows based on specified columns
   */
  private async checkForDuplicates(
    config: GoogleSheetsConfig,
    headers: any[],
    newRowData: any[],
    duplicateCheck: NonNullable<AppendRowOptions['duplicateCheck']>
  ): Promise<{ isDuplicate: boolean; duplicateRowNumber?: number }> {
    try {
      const sheets = await this.getSheetsClient(config);


      const dataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: `${config.sheetName}!2:1000` // Start from row 2, limit to 1000 rows for performance
      });

      const existingRows = dataResponse.data.values || [];


      const checkColumnIndices = duplicateCheck.columns.map(columnName => {
        const index = headers.findIndex(header =>
          header.toString().toLowerCase() === columnName.toLowerCase()
        );
        return { columnName, index };
      }).filter(col => col.index !== -1);

      if (checkColumnIndices.length === 0) {
        return { isDuplicate: false };
      }


      for (let rowIndex = 0; rowIndex < existingRows.length; rowIndex++) {
        const existingRow = existingRows[rowIndex];
        let isMatch = true;

        for (const { index } of checkColumnIndices) {
          const existingValue = existingRow[index]?.toString() || '';
          const newValue = newRowData[index]?.toString() || '';

          const comparison = duplicateCheck.caseSensitive
            ? existingValue === newValue
            : existingValue.toLowerCase() === newValue.toLowerCase();

          if (!comparison) {
            isMatch = false;
            break;
          }
        }

        if (isMatch) {
          return {
            isDuplicate: true,
            duplicateRowNumber: rowIndex + 2 // +2 because we start from row 2 and rows are 1-indexed
          };
        }
      }

      return { isDuplicate: false };
    } catch (error) {
      console.error('Error checking for duplicates:', error);
      return { isDuplicate: false };
    }
  }

  /**
   * Update an existing row with new data
   */
  private async updateExistingRow(
    config: GoogleSheetsConfig,
    headers: any[],
    newRowData: any[],
    rowNumber: number
  ): Promise<GoogleSheetsResponse> {
    try {
      const sheets = await this.getSheetsClient(config);

      const response = await sheets.spreadsheets.values.update({
        spreadsheetId: config.spreadsheetId,
        range: `${config.sheetName}!${rowNumber}:${rowNumber}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [newRowData]
        }
      });

      return {
        success: true,
        data: {
          updatedRange: response.data.updatedRange,
          updatedRows: response.data.updatedRows || 1,
          action: 'updated',
          message: `Row ${rowNumber} updated successfully`
        },
        rowsAffected: 1
      };
    } catch (error) {
      console.error('Error updating existing row:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update existing row'
      };
    }
  }

  /**
   * Read rows from the sheet with optional filtering
   */
  async readRows(config: GoogleSheetsConfig, options: ReadRowsOptions = {}): Promise<GoogleSheetsResponse> {
    try {
      const sheets = await this.getSheetsClient(config);
      
      const startRow = options.startRow || 2;
      const maxRows = options.maxRows || 100;
      const endRow = startRow + maxRows - 1;

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: `${config.sheetName}!${startRow}:${endRow}`
      });

      let rows = response.data.values || [];

      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: `${config.sheetName}!1:1`
      });
      const headers = headerResponse.data.values?.[0] || [];

      if (options.filterColumn && options.filterValue !== undefined) {
        const filterColumnIndex = headers.findIndex(header => 
          header.toString().toLowerCase() === options.filterColumn!.toLowerCase()
        );
        
        if (filterColumnIndex !== -1) {
          rows = rows.filter(row => 
            row[filterColumnIndex]?.toString().toLowerCase() === 
            options.filterValue?.toString().toLowerCase()
          );
        }
      }

      const data = rows.map((row, index) => {
        const rowObject: Record<string, any> = { _rowNumber: startRow + index };
        headers.forEach((header, colIndex) => {
          rowObject[header] = row[colIndex] || '';
        });
        return rowObject;
      });

      return {
        success: true,
        data: {
          rows: data,
          totalRows: data.length,
          headers
        }
      };
    } catch (error) {
      console.error('Error reading rows:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to read rows'
      };
    }
  }

  /**
   * Update existing row(s) based on match criteria
   */
  async updateRow(config: GoogleSheetsConfig, options: UpdateRowOptions): Promise<GoogleSheetsResponse> {
    try {
      const sheets = await this.getSheetsClient(config);
      
      const dataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: config.spreadsheetId,
        range: `${config.sheetName}!A:ZZ`
      });

      const allRows = dataResponse.data.values || [];
      if (allRows.length < 2) {
        return {
          success: false,
          error: 'No data rows found in sheet'
        };
      }

      const headers = allRows[0];
      const dataRows = allRows.slice(1);

      const matchColumnIndex = headers.findIndex(header => 
        header.toString().toLowerCase() === options.matchColumn.toLowerCase()
      );

      if (matchColumnIndex === -1) {
        return {
          success: false,
          error: `Match column "${options.matchColumn}" not found`
        };
      }

      const matchingRowIndices: number[] = [];
      dataRows.forEach((row, index) => {
        if (row[matchColumnIndex]?.toString().toLowerCase() === 
            options.matchValue?.toString().toLowerCase()) {
          matchingRowIndices.push(index + 2);
        }
      });

      if (matchingRowIndices.length === 0) {
        return {
          success: false,
          error: `No rows found matching ${options.matchColumn} = ${options.matchValue}`
        };
      }

      let updatedRows = 0;
      for (const rowIndex of matchingRowIndices) {
        const currentRow = [...(allRows[rowIndex - 1] || [])];
        
        for (const [columnName, value] of Object.entries(options.columnMappings)) {
          const columnIndex = headers.findIndex(header => 
            header.toString().toLowerCase() === columnName.toLowerCase()
          );
          
          if (columnIndex !== -1) {
            while (currentRow.length <= columnIndex) {
              currentRow.push('');
            }
            currentRow[columnIndex] = value;
          }
        }

        await sheets.spreadsheets.values.update({
          spreadsheetId: config.spreadsheetId,
          range: `${config.sheetName}!${rowIndex}:${rowIndex}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: {
            values: [currentRow]
          }
        });

        updatedRows++;
      }

      return {
        success: true,
        data: {
          matchingRows: matchingRowIndices.length,
          updatedRows
        },
        rowsAffected: updatedRows
      };
    } catch (error) {
      console.error('Error updating row:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update row'
      };
    }
  }

  /**
   * Append row to Google Sheets using OAuth authentication
   */
  async appendRowWithOAuth(userId: number, companyId: number, spreadsheetId: string, sheetName: string, options: any): Promise<GoogleSheetsResponse> {
    try {
      const sheets = await this.getSheetsClientWithOAuth(userId, companyId);

      const { columnMappings: rawMappings = {}, duplicateCheck, delegationUserRequest } = options;
      let effectiveMappings: Record<string, string> = { ...rawMappings };
      const delegationReq =
        typeof delegationUserRequest === 'string' && delegationUserRequest.trim() ? delegationUserRequest : '';

      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!1:1`
      });

      let headers = headerResponse.data.values?.[0] || [];
      

      if (headers.length === 0) {
        let columnNames = Object.keys(effectiveMappings);
        if (columnNames.length === 0 && delegationReq) {
          const inferred = inferFieldsFromUserRequest(delegationReq);
          if (inferred.orderedKeys.length > 0) {
            columnNames = inferred.orderedKeys;
            effectiveMappings = { ...inferred.values };
          }
        }
        if (columnNames.length > 0) {

          await sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A1:${String.fromCharCode(65 + columnNames.length - 1)}1`,
            valueInputOption: 'RAW',
            requestBody: {
              values: [columnNames]
            }
          });
          
          headers = columnNames;
        } else {
          return {
            success: false,
            error: 'No headers found in the sheet and no column mappings provided to create headers automatically.'
          };
        }
      } else {
        const hasConfiguredValues = Object.values(effectiveMappings).some(
          (v) => v !== undefined && v !== null && String(v).trim() !== ''
        );
        if ((!hasConfiguredValues || Object.keys(effectiveMappings).length === 0) && delegationReq) {
          const parsed = parseUserRequestIntoColumnMappings(delegationReq, headers as string[]);
          effectiveMappings = { ...parsed, ...effectiveMappings };
        }
      }


      if (duplicateCheck?.enabled) {
        const allDataResponse = await sheets.spreadsheets.values.get({
          spreadsheetId: spreadsheetId,
          range: `${sheetName}!A:${String.fromCharCode(65 + headers.length - 1)}`
        });

        const allRows = allDataResponse.data.values || [];
        const dataRows = allRows.slice(1); // Skip header row


        const checkColumns = duplicateCheck.columns || [];
        if (checkColumns.length > 0) {
          const isDuplicate = dataRows.some((row: any[]) => {
            return checkColumns.every((colName: string) => {
              const colIndex = headers.indexOf(colName);
              if (colIndex === -1) return false;

              const existingValue = row[colIndex] || '';
              const newValue = effectiveMappings[colName] ?? effectiveMappings[colName.trim()] ?? '';

              if (duplicateCheck.caseSensitive === false) {
                return existingValue.toString().toLowerCase() === newValue.toString().toLowerCase();
              }
              return existingValue.toString() === newValue.toString();
            });
          });

          if (isDuplicate) {
            if (duplicateCheck.onDuplicate === 'skip') {
              return {
                success: true,
                data: {
                  message: 'Row skipped due to duplicate check',
                  duplicateFound: true
                }
              };
            } else if (duplicateCheck.onDuplicate === 'error') {
              return {
                success: false,
                error: 'Duplicate row found'
              };
            }
          }
        }
      }


      const rowData: any[] = new Array(headers.length).fill('');
      for (const [columnName, value] of Object.entries(effectiveMappings)) {
        const keyNorm = columnName.trim().toLowerCase();
        const columnIndex = headers.findIndex((header) => header.toString().trim().toLowerCase() === keyNorm);
        if (columnIndex !== -1) {
          rowData[columnIndex] = value;
        }
      }

      const filledCount = rowData.filter((value: any) => String(value ?? '').trim().length > 0).length;
      const isAllBlank = filledCount === 0;

      if (isAllBlank) {
        return {
          success: false,
          error:
            'No values to append: row is empty. Pass a `row` object keyed by headers, or include user field lines (Name:/Phone:/Message:) in tool args; the server can use the chat message as fallback.'
        };
      }

      const response = await sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!A:${String.fromCharCode(65 + headers.length - 1)}`,
        valueInputOption: 'RAW',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [rowData]
        }
      });

      return {
        success: true,
        data: {
          range: response.data.updates?.updatedRange,
          rowsAdded: response.data.updates?.updatedRows
        },
        rowsAffected: response.data.updates?.updatedRows || 0
      };
    } catch (error: any) {
      console.error('Error appending row with OAuth:', error);
      return {
        success: false,
        error: error.message || 'Failed to append row'
      };
    }
  }

  /**
   * Read rows from Google Sheets using OAuth authentication
   */
  async readRowsWithOAuth(userId: number, companyId: number, spreadsheetId: string, sheetName: string, options: any): Promise<GoogleSheetsResponse> {
    try {
      const sheets = await this.getSheetsClientWithOAuth(userId, companyId);

      const { filterColumn, filterValue, startRow = 2, maxRows = 100 } = options;


      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!1:1`
      });

      const headers = headerResponse.data.values?.[0] || [];
      if (headers.length === 0) {
        return {
          success: false,
          error: 'No headers found in the sheet'
        };
      }


      const endColumn = String.fromCharCode(65 + headers.length - 1);
      const endRow = startRow + maxRows - 1;
      const range = `${sheetName}!A${startRow}:${endColumn}${endRow}`;

      const response = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: range
      });

      let rows = response.data.values || [];


      if (filterColumn && filterValue !== undefined) {
        const filterColumnIndex = headers.indexOf(filterColumn);
        if (filterColumnIndex !== -1) {
          rows = rows.filter((row: any[]) => {
            const cellValue = row[filterColumnIndex] || '';
            return cellValue.toString().toLowerCase().includes(filterValue.toString().toLowerCase());
          });
        }
      }


      const processedRows = rows.map((row: any[]) => {
        const rowObject: Record<string, any> = {};
        headers.forEach((header: string, index: number) => {
          rowObject[header] = row[index] || '';
        });
        return rowObject;
      });

      return {
        success: true,
        data: {
          headers,
          rows: processedRows,
          totalRows: processedRows.length,
          range: range
        }
      };
    } catch (error: any) {
      console.error('Error reading rows with OAuth:', error);
      return {
        success: false,
        error: error.message || 'Failed to read rows'
      };
    }
  }

  /**
   * Update row in Google Sheets using OAuth authentication
   */
  async updateRowWithOAuth(userId: number, companyId: number, spreadsheetId: string, sheetName: string, options: any): Promise<GoogleSheetsResponse> {
    try {
      const sheets = await this.getSheetsClientWithOAuth(userId, companyId);

      const { matchColumn, matchValue, columnMappings } = options;


      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!1:1`
      });

      let headers = headerResponse.data.values?.[0] || [];
      

      if (headers.length === 0) {
        const columnNames = Object.keys(columnMappings);
        if (columnNames.length > 0) {

          await sheets.spreadsheets.values.update({
            spreadsheetId: spreadsheetId,
            range: `${sheetName}!A1:${String.fromCharCode(65 + columnNames.length - 1)}1`,
            valueInputOption: 'RAW',
            requestBody: {
              values: [columnNames]
            }
          });
          
          headers = columnNames;
        } else {
          return {
            success: false,
            error: 'No headers found in the sheet and no column mappings provided to create headers automatically.'
          };
        }
      }

      const matchColumnIndex = headers.indexOf(matchColumn);
      if (matchColumnIndex === -1) {
        return {
          success: false,
          error: `Match column '${matchColumn}' not found in headers`
        };
      }


      const endColumn = String.fromCharCode(65 + headers.length - 1);
      const allDataResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!A:${endColumn}`
      });

      const allRows = allDataResponse.data.values || [];
      const dataRows = allRows.slice(1); // Skip header row


      const matchingRowIndices: number[] = [];
      dataRows.forEach((row: any[], index: number) => {
        const cellValue = row[matchColumnIndex] || '';
        if (cellValue.toString() === matchValue.toString()) {
          matchingRowIndices.push(index + 2); // +2 because we skipped header and arrays are 0-indexed
        }
      });

      if (matchingRowIndices.length === 0) {
        return {
          success: false,
          error: `No rows found with ${matchColumn} = '${matchValue}'`
        };
      }

      let updatedRows = 0;


      for (const rowIndex of matchingRowIndices) {
        const currentRow = allRows[rowIndex - 1] || []; // -1 because allRows includes header


        const updatedRowData = [...currentRow];


        while (updatedRowData.length < headers.length) {
          updatedRowData.push('');
        }


        Object.entries(columnMappings).forEach(([columnName, value]) => {
          const columnIndex = headers.indexOf(columnName);
          if (columnIndex !== -1) {
            updatedRowData[columnIndex] = value;
          }
        });


        await sheets.spreadsheets.values.update({
          spreadsheetId: spreadsheetId,
          range: `${sheetName}!A${rowIndex}:${endColumn}${rowIndex}`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [updatedRowData]
          }
        });

        updatedRows++;
      }

      return {
        success: true,
        data: {
          matchingRows: matchingRowIndices.length,
          updatedRows
        },
        rowsAffected: updatedRows
      };
    } catch (error: any) {
      console.error('Error updating row with OAuth:', error);
      return {
        success: false,
        error: error.message || 'Failed to update row'
      };
    }
  }

  /**
   * Get sheet information using OAuth authentication
   */
  async getSheetInfoWithOAuth(userId: number, companyId: number, spreadsheetId: string, sheetName: string): Promise<GoogleSheetsResponse> {
    try {
      const sheets = await this.getSheetsClientWithOAuth(userId, companyId);

      const metadataResponse = await sheets.spreadsheets.get({
        spreadsheetId: spreadsheetId,
        fields: 'properties,sheets.properties'
      });

      const headerResponse = await sheets.spreadsheets.values.get({
        spreadsheetId: spreadsheetId,
        range: `${sheetName}!1:1`
      });

      const headers = headerResponse.data.values?.[0] || [];
      const spreadsheetTitle = metadataResponse.data.properties?.title || 'Unknown';


      const sheetProperties = metadataResponse.data.sheets?.find(
        sheet => sheet.properties?.title === sheetName
      )?.properties;

      return {
        success: true,
        data: {
          title: spreadsheetTitle,
          sheetName: sheetName,
          headers: headers,
          sheetId: sheetProperties?.sheetId,
          rowCount: sheetProperties?.gridProperties?.rowCount,
          columnCount: sheetProperties?.gridProperties?.columnCount
        }
      };
    } catch (error: any) {
      console.error('Error getting sheet info with OAuth:', error);

      let errorMessage = 'Failed to get sheet information';
      if (error.status === 403 || error.code === 403) {
        errorMessage = 'Permission denied. Please ensure you have access to this spreadsheet.';
      } else if (error.status === 404 || error.code === 404) {
        errorMessage = 'Spreadsheet or sheet not found.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Create a two-tab workbook: "Orders" (full columns + status dropdown on column J)
   * and "Customer Lookup" (VLOOKUP by Order ID in B1 against Orders!A:K).
   * Mirrors the openpyxl/VLOOKUP template pattern for Google Sheets.
   */
  async createCustomerOrdersWorkbookWithOAuth(
    userId: number,
    companyId: number,
    title?: string
  ): Promise<{
    success: boolean;
    spreadsheetId?: string;
    spreadsheetUrl?: string;
    error?: string;
  }> {
    try {
      const sheets = await this.getSheetsClientWithOAuth(userId, companyId);
      const spreadTitle = (title && String(title).trim()) || 'Customer Orders';

      const createRes = await sheets.spreadsheets.create({
        requestBody: {
          properties: { title: spreadTitle },
          sheets: [
            {
              properties: {
                title: 'Orders',
                gridProperties: { rowCount: 4000, columnCount: 12 }
              }
            },
            {
              properties: {
                title: 'Customer Lookup',
                gridProperties: { rowCount: 80, columnCount: 6 }
              }
            }
          ]
        }
      });

      const spreadsheetId = createRes.data.spreadsheetId;
      if (!spreadsheetId) {
        return { success: false, error: 'No spreadsheet ID returned' };
      }

      const sheetList = createRes.data.sheets || [];
      const ordersMeta = sheetList.find((s) => s.properties?.title === 'Orders');
      const ordersSheetId = ordersMeta?.properties?.sheetId ?? 0;

      const orderHeaders = [
        'Order ID',
        'Order Date',
        'Customer Name',
        'Email',
        'Phone',
        'Product Name',
        'Quantity',
        'Price per Unit',
        'Total Price',
        'Order Status',
        'Notes'
      ];

      const sampleOrders: (string | number)[][] = [
        [
          'ORD-1001',
          '2026-03-15',
          'Abid Shafi',
          'abid@pointer.pk',
          '+92 305 9002132',
          'Wireless Earbuds Pro',
          2,
          49.99,
          99.98,
          'Shipped',
          'Sample: noise-cancelling earbuds, 24h case'
        ],
        [
          'ORD-1002',
          '2026-03-18',
          'Niamat Shakran',
          'niamat@pointer.pk',
          '+92 300 052443',
          'Stainless Steel Water Bottle 1L',
          1,
          24.5,
          24.5,
          'Processing',
          'Sample: vacuum insulated, matte black'
        ],
        [
          'ORD-1003',
          '2026-03-20',
          'Haider',
          'haider@pointer.pk',
          '+92 314 1899043',
          'USB-C Hub 7-Port',
          1,
          39,
          39,
          'Pending',
          'Sample: HDMI + SD + 3x USB-A, pass-through charge'
        ]
      ];

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: 'Orders!A1:K4',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [orderHeaders, ...sampleOrders] }
      });

      const lookupFields: Array<{ label: string; vlookupIndex: number }> = [
        { label: 'Order Date', vlookupIndex: 2 },
        { label: 'Customer Name', vlookupIndex: 3 },
        { label: 'Product Name', vlookupIndex: 6 },
        { label: 'Quantity', vlookupIndex: 7 },
        { label: 'Total Price', vlookupIndex: 9 },
        { label: 'Order Status', vlookupIndex: 10 }
      ];

      const lookupValues: (string | number | boolean)[][] = [
        ['Enter Your Order ID:', ''],
        ['', ''],
        ['Order Details', ''],
        ['Field', 'Value']
      ];
      for (const f of lookupFields) {
        lookupValues.push([
          f.label,
          `=IFERROR(VLOOKUP($B$1,Orders!$A:$K,${f.vlookupIndex},FALSE),"Not Found")`
        ]);
      }

      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `'Customer Lookup'!A1:B${lookupValues.length}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: lookupValues }
      });

      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: [
            {
              setDataValidation: {
                range: {
                  sheetId: ordersSheetId,
                  startRowIndex: 1,
                  endRowIndex: 1000,
                  startColumnIndex: 9,
                  endColumnIndex: 10
                },
                rule: {
                  condition: {
                    type: 'ONE_OF_LIST',
                    values: [
                      { userEnteredValue: 'Pending' },
                      { userEnteredValue: 'Processing' },
                      { userEnteredValue: 'Shipped' },
                      { userEnteredValue: 'Delivered' },
                      { userEnteredValue: 'Cancelled' }
                    ]
                  },
                  strict: true,
                  showCustomUi: true
                }
              }
            }
          ]
        }
      });

      const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
      return { success: true, spreadsheetId, spreadsheetUrl };
    } catch (error: any) {
      console.error('createCustomerOrdersWorkbookWithOAuth:', error);
      return {
        success: false,
        error: error?.message || 'Failed to create customer orders workbook'
      };
    }
  }
}

export default new GoogleSheetsService();
