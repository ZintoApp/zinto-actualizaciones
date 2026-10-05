import { storage } from '../storage';
import { defaultSubjectEn, defaultBodyEn, defaultSubjectEs, defaultBodyEs, isDefaultTemplate } from './welcome-email-templates';
import nodemailer from 'nodemailer';
import { randomInt } from 'crypto';
import { decryptPassword } from '../admin-routes';
import { createSmtpTransporter, resolveAdminSmtpConfig } from '../utils/smtp-transport';

interface SMTPConfig {
  enabled: boolean;
  host?: string;
  port?: number;
  security?: 'none' | 'ssl' | 'tls' | 'starttls';
  username?: string;
  password?: string;
  fromName?: string;
  fromEmail?: string;
}

interface WelcomeEmailTemplate {
  enabled: boolean;
  subject: string;
  body: string;
}

interface WelcomeEmailData {
  companyName: string;
  adminFullName: string;
  adminUsername: string;
  adminEmail: string;
  planLabel: string;
  loginUrl: string;
  language?: string;
}

/**
 * Generate a 6-digit verification code
 */
export function generateVerificationCode(): string {
  return randomInt(100000, 999999).toString();
}

/**
 * Store verification token in database with 10-minute expiry
 */
export async function createVerificationToken(
  email: string,
  registrationData: any
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateVerificationCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  await storage.createEmailVerificationToken({
    email,
    token,
    registrationData,
    expiresAt,
  });

  return { token, expiresAt };
}

/**
 * Verify email verification code
 */
export async function verifyCode(email: string, code: string): Promise<boolean> {
  return await storage.verifyEmailToken(email, code);
}

/**
 * Get registration data from verified token
 */
export async function getVerifiedRegistrationData(email: string, token: string): Promise<any | null> {
  const verificationToken = await storage.getEmailVerificationToken(email, token);
  
  if (!verificationToken || !verificationToken.verified) {
    return null;
  }

  return verificationToken.registrationData;
}

/**
 * Send verification code email
 */
export async function sendVerificationEmail(
  email: string,
  code: string,
  companyName: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const smtpSetting = await storage.getAppSetting('smtp_config');
    
    if (!smtpSetting) {
      throw new Error('SMTP is not configured');
    }

    const smtpConfig = smtpSetting.value as SMTPConfig;

    if (!smtpConfig.enabled) {
      throw new Error('SMTP is disabled');
    }

    // Use the proper SMTP transporter utility
    const resolvedConfig = resolveAdminSmtpConfig(smtpConfig);
    
    if (!resolvedConfig) {
      throw new Error('Failed to resolve SMTP configuration');
    }

    const transporter = createSmtpTransporter(resolvedConfig);

    const mailOptions = {
      from: `"${resolvedConfig.fromName}" <${resolvedConfig.fromEmail}>`,
      to: email,
      subject: 'Verify Your Email - Company Registration',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background-color: #f9f9f9; padding: 30px; border-radius: 8px;">
            <h1 style="color: #333235; margin-bottom: 20px;">Verify Your Email</h1>
            
            <p style="font-size: 16px; color: #555; line-height: 1.6;">
              Thank you for registering <strong>${companyName}</strong>!
            </p>
            
            <p style="font-size: 16px; color: #555; line-height: 1.6;">
              Please use the following 6-digit verification code to complete your registration:
            </p>
            
            <div style="background-color: white; padding: 20px; border-radius: 6px; margin: 25px 0; text-align: center;">
              <div style="font-size: 36px; font-weight: bold; color: #333235; letter-spacing: 8px; font-family: 'Courier New', monospace;">
                ${code}
              </div>
            </div>
            
            <p style="font-size: 14px; color: #777; line-height: 1.6;">
              This code will expire in 10 minutes.
            </p>
            
            <p style="font-size: 14px; color: #777; line-height: 1.6;">
              If you didn't request this code, please ignore this email.
            </p>
            
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #999; line-height: 1.4;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    return { success: true };
  } catch (error) {
    console.error('Error sending verification email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Send welcome email with customizable template
 */
export async function sendWelcomeEmail(data: WelcomeEmailData): Promise<{ success: boolean; error?: string }> {
  try {
    // Get SMTP config
    const smtpSetting = await storage.getAppSetting('smtp_config');
    
    if (!smtpSetting) {
      throw new Error('SMTP is not configured');
    }

    const smtpConfig = smtpSetting.value as SMTPConfig;

    if (!smtpConfig.enabled) {
      throw new Error('SMTP is disabled');
    }

    // Get welcome email template
    const templateSetting = await storage.getAppSetting('welcome_email_template');
    
    if (!templateSetting) {
      throw new Error('Welcome email template is not configured');
    }

    const template = templateSetting.value as WelcomeEmailTemplate;

    if (!template.enabled) {
      console.log('Welcome email is disabled, skipping...');
      return { success: true };
    }

    // Get branding / appName
    const brandingSetting = await storage.getAppSetting('branding');
    const brandingValue = brandingSetting?.value as { appName?: string } | undefined;
    const appName = typeof brandingValue?.appName === 'string' && brandingValue.appName.trim()
      ? brandingValue.appName.trim()
      : 'BotHive';

    // Replace variables in template
    const variables = {
      companyName: data.companyName,
      adminFullName: data.adminFullName,
      adminUsername: data.adminUsername,
      adminEmail: data.adminEmail,
      planLabel: data.planLabel,
      loginUrl: data.loginUrl,
      currentYear: new Date().getFullYear().toString(),
      appName: appName,
    };

    const isSpanish = data.language?.toLowerCase().startsWith('es');

    const subjectRaw = template.subject;
    const bodyRaw = template.body;

    // Use the shared helper — avoids cross-language false positives.
    const uncustomized = isDefaultTemplate(subjectRaw, bodyRaw);

    let subject = uncustomized ? (isSpanish ? defaultSubjectEs : defaultSubjectEn) : subjectRaw;
    let body = uncustomized ? (isSpanish ? defaultBodyEs : defaultBodyEn) : bodyRaw;

    // Replace all variables
    for (const [key, value] of Object.entries(variables)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, value);
      body = body.replace(regex, value);
    }

    // Use the proper SMTP transporter utility
    const resolvedConfig = resolveAdminSmtpConfig(smtpConfig);
    
    if (!resolvedConfig) {
      throw new Error('Failed to resolve SMTP configuration');
    }

    const transporter = createSmtpTransporter(resolvedConfig);

    const mailOptions = {
      from: `"${resolvedConfig.fromName}" <${resolvedConfig.fromEmail}>`,
      to: data.adminEmail,
      subject,
      html: body,
    };

    await transporter.sendMail(mailOptions);

    return { success: true };
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Clean up expired verification tokens (should be called periodically)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  return await storage.deleteExpiredEmailVerificationTokens();
}
