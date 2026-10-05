import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { storage } from '../../storage';
import { decryptValue, encryptValue } from '../../utils/crypto';

export interface SesConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  fromEmail: string;
  fromName: string;
  enabled: boolean;
  port?: number;
}

let cachedSesConfig: SesConfig | null = null;

function isPositiveIntegerPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port > 0;
}

function buildSesClientConfig(config: { region: string; accessKeyId: string; secretAccessKey: string; port?: number }) {
  const base = {
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey
    }
  };
  if (isPositiveIntegerPort(config.port)) {
    return {
      ...base,
      endpoint: `https://email.${config.region}.amazonaws.com:${config.port}`
    };
  }
  return base;
}

/**
 * Get the current SES configuration - loads from storage if not cached
 */
export async function getSesConfig(): Promise<SesConfig | null> {
  try {
    if (cachedSesConfig) {
      return cachedSesConfig;
    }

    const config = await storage.getSesConfig();
    if (config) {
      const sesConfig = config as any;
      
      // Decrypt secretAccessKey if it's encrypted (contains ':')
      const decryptedSecretKey = sesConfig.secretAccessKey && typeof sesConfig.secretAccessKey === 'string' && sesConfig.secretAccessKey.includes(':')
        ? decryptValue(sesConfig.secretAccessKey)
        : sesConfig.secretAccessKey;

      cachedSesConfig = {
        region: sesConfig.region,
        accessKeyId: sesConfig.accessKeyId,
        secretAccessKey: decryptedSecretKey || sesConfig.secretAccessKey,
        fromEmail: sesConfig.fromEmail,
        fromName: sesConfig.fromName,
        enabled: sesConfig.enabled || false,
        port: sesConfig.port ? Number(sesConfig.port) : undefined
      };
      return cachedSesConfig;
    }

    return null;
  } catch (error) {
    console.error('Error getting SES config:', error);
    return null;
  }
}

/**
 * Update the SES configuration - saves to storage
 */
export async function updateSesConfig(config: SesConfig): Promise<boolean> {
  try {
    // Validate secretAccessKey is a non-empty string before processing
    if (!config.secretAccessKey || typeof config.secretAccessKey !== 'string' || config.secretAccessKey.trim() === '') {
      throw new Error('secretAccessKey is required and must be a non-empty string');
    }

    // Encrypt secretAccessKey before saving
    const configToSave = {
      ...config,
      secretAccessKey: config.secretAccessKey.includes(':') 
        ? config.secretAccessKey // Already encrypted
        : encryptValue(config.secretAccessKey)
    };

    const saved = await storage.saveSesConfig(configToSave);
    if (saved) {
      cachedSesConfig = null; // Invalidate cache
    }
    return saved;
  } catch (error) {
    console.error('Error updating SES config:', error);
    return false;
  }
}

/**
 * Send an email using AWS SES
 */
export async function sendEmailViaSES(
  to: string | string[],
  subject: string,
  html: string,
  text: string,
  fromAddress: string,
  fromName: string
): Promise<boolean> {
  try {
    const config = await getSesConfig();
    
    if (!config || !config.enabled) {
      console.error('SES configuration not found or not enabled');
      return false;
    }

    const sesClient = new SESClient(buildSesClientConfig(config));

    const toAddresses = Array.isArray(to) ? to : [to];

    const command = new SendEmailCommand({
      Source: `"${fromName}" <${fromAddress}>`,
      Destination: {
        ToAddresses: toAddresses
      },
      Message: {
        Subject: {
          Data: subject
        },
        Body: {
          Html: {
            Data: html
          },
          Text: {
            Data: text
          }
        }
      }
    });

    await sesClient.send(command);
    return true;
  } catch (error) {
    console.error('Error sending email via SES:', error);
    return false;
  }
}

/**
 * Test SES configuration by sending a test email
 */
export async function testSesConfig(config: SesConfig, testEmail: string): Promise<void> {
  try {
    // Validate secretAccessKey before processing
    if (!config.secretAccessKey || typeof config.secretAccessKey !== 'string') {
      throw new Error('secretAccessKey is required and must be a non-empty string');
    }

    // Decrypt secretAccessKey if needed
    const decryptedSecretKey = config.secretAccessKey.includes(':')
      ? decryptValue(config.secretAccessKey)
      : config.secretAccessKey;

    const sesClient = new SESClient(
      buildSesClientConfig({ ...config, secretAccessKey: decryptedSecretKey })
    );

    const command = new SendEmailCommand({
      Source: `"${config.fromName}" <${config.fromEmail}>`,
      Destination: {
        ToAddresses: [testEmail]
      },
      Message: {
        Subject: {
          Data: 'SES Configuration Test'
        },
        Body: {
          Html: {
            Data: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4f46e5;">SES Configuration Test</h2>
                <p>This is a test email to verify your SES configuration.</p>
                <div style="margin-top: 20px; padding: 15px; background-color: #f3f4f6; border-radius: 5px;">
                  <p style="margin: 0; font-weight: bold;">Configuration details:</p>
                  <ul style="margin-top: 10px;">
                    <li>Region: ${config.region}</li>
                    <li>Port: ${config.port ?? 'default'}</li>
                    <li>Access Key ID: ${config.accessKeyId}</li>
                    <li>From: ${config.fromName} &lt;${config.fromEmail}&gt;</li>
                  </ul>
                </div>
                <p style="margin-top: 20px;">If you received this email, your SES configuration is working correctly!</p>
              </div>
            `
          },
          Text: {
            Data: 'This is a test email to verify your SES configuration.'
          }
        }
      }
    });

    await sesClient.send(command);
  } catch (error) {
    console.error('Error testing SES configuration:', error);
    throw error;
  }
}
