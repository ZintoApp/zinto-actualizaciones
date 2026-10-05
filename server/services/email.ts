import mail from '@sendgrid/mail';
import { storage } from '../storage';
import {
  createSmtpTransporter,
  loadResolvedSmtpConfig,
  type ResolvedSmtpConfig,
} from '../utils/smtp-transport';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  senderEmail: string;
  senderName: string;
}

let cachedSmtpConfig: ResolvedSmtpConfig | null = null;

export function clearSmtpConfigCache(): void {
  cachedSmtpConfig = null;
}

function toLegacySmtpConfig(config: ResolvedSmtpConfig): SmtpConfig {
  return {
    host: config.host,
    port: config.port,
    secure: config.security === 'ssl',
    auth: {
      user: config.username,
      pass: config.password,
    },
    senderEmail: config.fromEmail,
    senderName: config.fromName,
  };
}

/**
 * Update the SMTP configuration - saves to storage
 */
export async function updateSmtpConfig(config: SmtpConfig): Promise<boolean> {
  try {
    clearSmtpConfigCache();
    const saved = await storage.saveSmtpConfig(config);
    return saved;
  } catch (error) {
    console.error('Error updating SMTP config:', error);
    return false;
  }
}

/**
 * Get the current SMTP configuration - loads from storage if not cached
 */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  try {
    if (!cachedSmtpConfig) {
      cachedSmtpConfig = await loadResolvedSmtpConfig();
    }

    return cachedSmtpConfig ? toLegacySmtpConfig(cachedSmtpConfig) : null;
  } catch (error) {
    console.error('Error getting SMTP config:', error);
    return null;
  }
}

/**
 * Send an email using the configured SMTP server
 */
export async function sendEmail(
  to: string | string[],
  subject: string,
  textContent: string,
  htmlContent?: string,
  customConfig?: SmtpConfig
): Promise<boolean> {
  try {
    const config = customConfig
      ? {
          host: customConfig.host,
          port: customConfig.port,
          security: customConfig.secure ? 'ssl' as const : 'tls' as const,
          username: customConfig.auth.user,
          password: customConfig.auth.pass,
          fromName: customConfig.senderName,
          fromEmail: customConfig.senderEmail,
        }
      : cachedSmtpConfig || await loadResolvedSmtpConfig();

    if (!config) {
      console.error('SMTP configuration not found');
      return false;
    }

    const transporter = createSmtpTransporter(config);

    await transporter.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: Array.isArray(to) ? to.join(', ') : to,
      subject,
      text: textContent,
      html: htmlContent || textContent,
    });

    return true;
  } catch (error) {
    console.error('Error sending email:', error);
    return false;
  }
}

/**
 * Test SMTP configuration by sending a test email
 */
export async function testSmtpConfig(config: SmtpConfig, testEmail: string): Promise<boolean> {
  try {
    const transporter = createSmtpTransporter({
      host: config.host,
      port: config.port,
      security: config.secure ? 'ssl' : 'tls',
      username: config.auth.user,
      password: config.auth.pass,
      fromName: config.senderName,
      fromEmail: config.senderEmail,
    });

    await transporter.verify();

    await transporter.sendMail({
      from: `"${config.senderName}" <${config.senderEmail}>`,
      to: testEmail,
      subject: 'SMTP Configuration Test',
      text: 'This is a test email to verify your SMTP configuration.',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4f46e5;">SMTP Configuration Test</h2>
          <p>This is a test email to verify your SMTP configuration.</p>
          <div style="margin-top: 20px; padding: 15px; background-color: #f3f4f6; border-radius: 5px;">
            <p style="margin: 0; font-weight: bold;">Configuration details:</p>
            <ul style="margin-top: 10px;">
              <li>Host: ${config.host}</li>
              <li>Port: ${config.port}</li>
              <li>Secure: ${config.secure ? 'Yes' : 'No'}</li>
              <li>Sender: ${config.senderName} &lt;${config.senderEmail}&gt;</li>
            </ul>
          </div>
          <p style="margin-top: 20px;">If you received this email, your SMTP configuration is working correctly!</p>
        </div>
      `,
    });
    
    
    return true;
  } catch (error) {
    console.error('Error testing SMTP configuration:', error);
    throw error;
  }
}

/**
 * Send an email using SendGrid (alternative method if SMTP is not configured)
 */
export async function sendEmailWithSendGrid(
  to: string | string[],
  subject: string,
  textContent: string,
  htmlContent?: string
): Promise<boolean> {
  try {
    if (!process.env.SENDGRID_API_KEY) {
      console.error('SendGrid API key not found in environment variables');
      return false;
    }
    
    mail.setApiKey(process.env.SENDGRID_API_KEY);
    
    const config = await getSmtpConfig();
    
    const fromEmail = config?.senderEmail || 'noreply@bothive.app';
    const fromName = config?.senderName || 'BotHive';
    
    const msg = {
      to: Array.isArray(to) ? to : to,
      from: {
        email: fromEmail,
        name: fromName
      },
      subject,
      text: textContent,
      html: htmlContent || textContent,
    };
    
    await mail.send(msg);
    return true;
  } catch (error) {
    console.error('Error sending email with SendGrid:', error);
    return false;
  }
}

/**
 * Send an email with team invitation
 */
export async function sendTeamInvitation(
  to: string,
  invitedByName: string,
  companyName: string,
  role: string,
  invitationLink: string
): Promise<boolean> {
  const subject = `You've been invited to join ${companyName} on BotHive`;
  
  const textContent = `
    ${invitedByName} has invited you to join ${companyName} on BotHive as a ${role}.
    
    Click the link below to accept the invitation:
    ${invitationLink}
    
    This invitation will expire in 7 days.
  `;
  
  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4f46e5;">You've Been Invited</h2>
      <p><strong>${invitedByName}</strong> has invited you to join <strong>${companyName}</strong> on BotHive as a <strong>${role}</strong>.</p>
      
      <div style="margin: 30px 0; text-align: center;">
        <a href="${invitationLink}" style="background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Accept Invitation</a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px;">This invitation will expire in 7 days.</p>
    </div>
  `;
  
  const smtpSuccess = await sendEmail(to, subject, textContent, htmlContent);
  
  if (smtpSuccess) {
    return true;
  }
  
  return await sendEmailWithSendGrid(to, subject, textContent, htmlContent);
}