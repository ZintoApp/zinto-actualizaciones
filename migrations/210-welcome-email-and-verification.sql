-- Migration 210: Welcome Email Template and Email Verification for Company Registration
-- This migration adds:
-- 1. Default welcome email template in app_settings
-- 2. email_verification_tokens table for storing verification codes

-- Create email_verification_tokens table
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  token VARCHAR(6) NOT NULL, -- 6-digit verification code
  registration_data JSONB NOT NULL, -- Stores the full registration payload
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for email verification tokens
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_email ON email_verification_tokens(email);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_token ON email_verification_tokens(token);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_expires_at ON email_verification_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_email_verification_tokens_verified ON email_verification_tokens(verified);

-- Insert default welcome email template into app_settings
INSERT INTO app_settings (key, value, created_at, updated_at)
VALUES (
  'welcome_email_template',
  jsonb_build_object(
    'enabled', true,
    'subject', 'Welcome to {{companyName}} - Your Account is Ready!',
    'body', E'<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">\n  <div style="background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">\n    <h1 style="color: #333235; margin-bottom: 20px;">Welcome to {{companyName}}!</h1>\n    \n    <p style="font-size: 16px; color: #555; line-height: 1.6;">Hi {{adminFullName}},</p>\n    \n    <p style="font-size: 16px; color: #555; line-height: 1.6;">\n      Congratulations! Your account has been successfully created. We''re excited to have you on board.\n    </p>\n    \n    <div style="background-color: #f0f7ff; padding: 20px; border-radius: 6px; margin: 25px 0;">\n      <h3 style="color: #333235; margin-top: 0;">Your Account Details:</h3>\n      <ul style="list-style: none; padding: 0;">\n        <li style="margin: 10px 0;"><strong>Company:</strong> {{companyName}}</li>\n        <li style="margin: 10px 0;"><strong>Username:</strong> {{adminUsername}}</li>\n        <li style="margin: 10px 0;"><strong>Email:</strong> {{adminEmail}}</li>\n        <li style="margin: 10px 0;"><strong>Plan:</strong> {{planLabel}}</li>\n      </ul>\n    </div>\n    \n    <div style="margin: 30px 0;">\n      <a href="{{loginUrl}}" style="display: inline-block; background-color: #333235; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Log In Now</a>\n    </div>\n    \n    <p style="font-size: 14px; color: #777; line-height: 1.6; margin-top: 30px;">\n      If you have any questions or need assistance, please don''t hesitate to contact our support team.\n    </p>\n    \n    <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 30px 0;">\n    \n    <p style="font-size: 12px; color: #999; line-height: 1.4;">\n      This is an automated message. Please do not reply to this email.<br>\n      © {{currentYear}} {{companyName}}. All rights reserved.\n    </p>\n  </div>\n</div>'
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT (key) DO NOTHING;

-- Add comment
COMMENT ON TABLE email_verification_tokens IS 'Stores email verification tokens for company registration with 10-minute expiry';
COMMENT ON COLUMN email_verification_tokens.registration_data IS 'Full registration payload including company and admin user data';
