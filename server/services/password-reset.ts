import { randomBytes, createHash } from 'crypto';
import { db } from '../db';
import { storage } from '../storage';
import { passwordResetTokens, users, type InsertPasswordResetToken } from '../../shared/schema';
import { eq, and, gt, lt, isNull } from 'drizzle-orm';
import { sendEmail, sendEmailWithSendGrid } from './email';

export interface PasswordResetRequest {
  email: string;
  ipAddress?: string;
  userAgent?: string;
  baseUrl?: string;
  isAdmin?: boolean;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface PasswordResetResult {
  success: boolean;
  message: string;
  error?: string;
}

/**
 * Password Reset Service
 * Handles secure password reset functionality using tokens
 */
export class PasswordResetService {
  private static readonly TOKEN_EXPIRY_HOURS = 1; // 1 hour expiry
  private static readonly MAX_ATTEMPTS_PER_HOUR = 3; // Rate limiting

  /**
   * Generate a secure random token
   */
  private static generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Hash a token for secure storage
   */
  private static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /**
   * Check rate limiting for password reset requests
   */
  private static async checkRateLimit(userId: number): Promise<boolean> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const recentTokens = await db
      .select()
      .from(passwordResetTokens)
      .where(
        and(
          eq(passwordResetTokens.userId, userId),
          gt(passwordResetTokens.createdAt, oneHourAgo)
        )
      );

    return recentTokens.length < this.MAX_ATTEMPTS_PER_HOUR;
  }

  /**
   * Clean up expired tokens
   */
  private static async cleanupExpiredTokens(): Promise<void> {
    const now = new Date();
    await db
      .delete(passwordResetTokens)
      .where(lt(passwordResetTokens.expiresAt, now));
  }

  /**
   * Request a password reset
   */
  static async requestPasswordReset(request: PasswordResetRequest): Promise<PasswordResetResult> {
    try {

      await this.cleanupExpiredTokens();


      const user = await storage.getUserByUsernameOrEmail(request.email);

      if (!user) {

        const accountType = request.isAdmin ? 'admin account' : 'account';
        return {
          success: true,
          message: `If an ${accountType} with that email exists, a password reset link has been sent.`
        };
      }


      if (request.isAdmin && !user.isSuperAdmin) {

        return {
          success: true,
          message: 'If an admin account with that email exists, a password reset link has been sent.'
        };
      }


      if (!request.isAdmin && user.isSuperAdmin) {

        return {
          success: true,
          message: 'If an account with that email exists, a password reset link has been sent.'
        };
      }


      const canRequest = await this.checkRateLimit(user.id);
      if (!canRequest) {
        return {
          success: false,
          message: 'Too many password reset requests. Please wait before trying again.',
          error: 'RATE_LIMITED'
        };
      }


      const token = this.generateToken();
      const hashedToken = this.hashToken(token);
      const expiresAt = new Date(Date.now() + this.TOKEN_EXPIRY_HOURS * 60 * 60 * 1000);


      const tokenData: InsertPasswordResetToken = {
        userId: user.id,
        token: hashedToken,
        expiresAt,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent
      };

      await db.insert(passwordResetTokens).values(tokenData);


      const baseUrl = request.baseUrl || process.env.FRONTEND_URL || 'http://localhost:9000';
      const resetPath = request.isAdmin ? '/admin/reset-password' : '/reset-password';
      const resetUrl = `${baseUrl}${resetPath}?token=${token}`;
      const emailSent = await this.sendPasswordResetEmail(user.email, user.fullName, resetUrl, request.baseUrl, request.isAdmin);

      if (!emailSent) {

        if (process.env.NODE_ENV === 'development') {


        }

        return {
          success: false,
          message: 'Failed to send password reset email. Please contact support or configure SMTP settings.',
          error: 'EMAIL_FAILED'
        };
      }

      return {
        success: true,
        message: 'If an account with that email exists, a password reset link has been sent.'
      };

    } catch (error) {
      console.error('Error requesting password reset:', error);
      return {
        success: false,
        message: 'An error occurred while processing your request. Please try again.',
        error: 'INTERNAL_ERROR'
      };
    }
  }

  /**
   * Confirm password reset with token
   */
  static async confirmPasswordReset(request: PasswordResetConfirm): Promise<PasswordResetResult> {
    try {

      await this.cleanupExpiredTokens();


      const hashedToken = this.hashToken(request.token);


      const tokenRecord = await db
        .select({
          id: passwordResetTokens.id,
          userId: passwordResetTokens.userId,
          expiresAt: passwordResetTokens.expiresAt,
          usedAt: passwordResetTokens.usedAt
        })
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, hashedToken))
        .limit(1);

      if (tokenRecord.length === 0) {
        return {
          success: false,
          message: 'Invalid or expired password reset token.',
          error: 'INVALID_TOKEN'
        };
      }

      const token = tokenRecord[0];


      if (new Date() > token.expiresAt) {
        return {
          success: false,
          message: 'Password reset token has expired. Please request a new one.',
          error: 'TOKEN_EXPIRED'
        };
      }


      if (token.usedAt) {
        return {
          success: false,
          message: 'This password reset token has already been used.',
          error: 'TOKEN_USED'
        };
      }


      const passwordUpdated = await storage.updateUserPassword(token.userId, request.newPassword);
      
      if (!passwordUpdated) {
        return {
          success: false,
          message: 'Failed to update password. Please try again.',
          error: 'PASSWORD_UPDATE_FAILED'
        };
      }


      await db
        .update(passwordResetTokens)
        .set({ usedAt: new Date() })
        .where(eq(passwordResetTokens.id, token.id));


      await db
        .delete(passwordResetTokens)
        .where(
          and(
            eq(passwordResetTokens.userId, token.userId),
            isNull(passwordResetTokens.usedAt)
          )
        );

      return {
        success: true,
        message: 'Password has been successfully reset. You can now log in with your new password.'
      };

    } catch (error) {
      console.error('Error confirming password reset:', error);
      return {
        success: false,
        message: 'An error occurred while resetting your password. Please try again.',
        error: 'INTERNAL_ERROR'
      };
    }
  }

  /**
   * Convert relative URL to absolute URL for email clients
   */
  private static convertToAbsoluteUrl(url: string, requestBaseUrl?: string): string {
    if (!url) return '';

    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }


    let baseUrl = requestBaseUrl || process.env.APP_URL || process.env.BASE_URL || process.env.PUBLIC_URL;

    if (!baseUrl) {
      const basePort = process.env.PORT || '9000';
      const host = process.env.HOST || 'localhost';
      const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';

      if (host === 'localhost' || host === '127.0.0.1') {
        baseUrl = `${protocol}://${host}:${basePort}`;
      } else {
        baseUrl = `${protocol}://${host}`;
      }
    }


    baseUrl = baseUrl.replace(/\/$/, '');
    const cleanUrl = url.startsWith('/') ? url : `/${url}`;

    return `${baseUrl}${cleanUrl}`;
  }

  /**
   * Get branding settings for email templates
   */
  private static async getBrandingSettings(): Promise<{ appName: string; logoUrl?: string }> {
    try {
      const brandingSetting = await storage.getAppSetting('branding');
      const logoSetting = await storage.getAppSetting('branding_logo');

      let brandingValue = brandingSetting?.value;
      if (typeof brandingValue === 'string') {
        try {
          brandingValue = JSON.parse(brandingValue);
        } catch (e) {
          brandingValue = {};
        }
      }

      return {
        appName: (brandingValue as any)?.appName || 'BotHive',
        logoUrl: logoSetting?.value as string
      };
    } catch (error) {
      console.error('Error getting branding settings:', error);
      return { appName: 'BotHive' };
    }
  }

  /**
   * Send password reset email using super admin SMTP configuration
   */
  private static async sendPasswordResetEmail(
    to: string,
    fullName: string,
    resetUrl: string,
    requestBaseUrl?: string,
    isAdmin: boolean = false
  ): Promise<boolean> {
    const branding = await this.getBrandingSettings();
    const accountType = isAdmin ? 'Admin' : '';
    const subject = `${accountType} Password Reset Request - ${branding.appName}`.trim();
    
    const accountDescription = isAdmin ? `${branding.appName} admin account` : `${branding.appName} account`;
    const securityNote = isAdmin ?
      'This is an admin password reset request. If you did not request this, please contact your system administrator immediately.' :
      'If you did not request this password reset, please ignore this email and your password will remain unchanged.';

    const textContent = `
Hello ${fullName},

You have requested to reset your password for your ${accountDescription}.

Click the link below to reset your password:
${resetUrl}

This link will expire in ${this.TOKEN_EXPIRY_HOURS} hour(s) for security reasons.

${securityNote}

Best regards,
${branding.appName} Team
    `.trim();


    const logoUrl = branding.logoUrl ? this.convertToAbsoluteUrl(branding.logoUrl, requestBaseUrl) : null;

    const logoSection = logoUrl
      ? `<img src="${logoUrl}" alt="${branding.appName}" style="height: 40px; margin-bottom: 10px;">`
      : `<div style="height: 40px; margin-bottom: 10px; display: flex; align-items: center; justify-content: center;">
           <h2 style="color: white; margin: 0; font-size: 24px;">${branding.appName}</h2>
         </div>`;

    const headerTitle = isAdmin ? 'Admin Password Reset Request' : 'Password Reset Request';
    const adminBadge = isAdmin ?
      '<div style="background: #dc2626; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; display: inline-block; margin-bottom: 15px;">ADMIN ACCOUNT</div>' :
      '';

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Password Reset Request</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
    ${logoSection}
    <h1 style="color: white; margin: 0; font-size: 28px;">${headerTitle}</h1>
  </div>

  <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
    ${adminBadge}
    <p style="font-size: 16px; margin-bottom: 20px;">Hello <strong>${fullName}</strong>,</p>

    <p style="font-size: 16px; margin-bottom: 20px;">
      You have requested to reset your password for your ${accountDescription}.
    </p>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" 
         style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
                color: white; 
                padding: 15px 30px; 
                text-decoration: none; 
                border-radius: 5px; 
                font-weight: bold; 
                font-size: 16px;
                display: inline-block;">
        Reset Your Password
      </a>
    </div>
    
    <p style="font-size: 14px; color: #6c757d; margin-bottom: 20px;">
      This link will expire in <strong>${this.TOKEN_EXPIRY_HOURS} hour(s)</strong> for security reasons.
    </p>
    
    <p style="font-size: 14px; color: #6c757d; margin-bottom: 20px;">
      ${securityNote}
    </p>
    
    <hr style="border: none; border-top: 1px solid #e9ecef; margin: 30px 0;">
    
    <p style="font-size: 14px; color: #6c757d; text-align: center; margin: 0;">
      Best regards,<br>
      <strong>${branding.appName} Team</strong>
    </p>
  </div>
</body>
</html>
    `.trim();

    try {

      const smtpSent = await sendEmail(to, subject, textContent, htmlContent);
      if (smtpSent) {
        return true;
      }

      return await sendEmailWithSendGrid(to, subject, textContent, htmlContent);
    } catch (error) {
      console.error('Error sending password reset email:', error);
      return false;
    }
  }

  /**
   * Validate token without using it (for checking if token is valid)
   */
  static async validateToken(token: string): Promise<{ valid: boolean; userId?: number }> {
    try {
      await this.cleanupExpiredTokens();

      const hashedToken = this.hashToken(token);

      const tokenRecord = await db
        .select({
          userId: passwordResetTokens.userId,
          expiresAt: passwordResetTokens.expiresAt,
          usedAt: passwordResetTokens.usedAt
        })
        .from(passwordResetTokens)
        .where(eq(passwordResetTokens.token, hashedToken))
        .limit(1);

      if (tokenRecord.length === 0) {
        return { valid: false };
      }

      const tokenData = tokenRecord[0];

      if (new Date() > tokenData.expiresAt || tokenData.usedAt) {
        return { valid: false };
      }

      return { valid: true, userId: tokenData.userId };
    } catch (error) {
      console.error('Error validating token:', error);
      return { valid: false };
    }
  }
}
