-- Migration 220: Update default welcome email template to use {{appName}}
-- This migration updates the default welcome email template in app_settings
-- to use {{appName}} instead of {{companyName}} in the subject, main heading, and copyright footer.
-- It only updates the template if the subject is currently set to the default.

UPDATE app_settings
SET value = jsonb_set(
  jsonb_set(
    value,
    '{subject}',
    '"Welcome to {{appName}} - Your Account is Ready!"'
  ),
  '{body}',
  to_jsonb(replace(
    replace(
      value->>'body',
      '<h1 style="color: #333235; margin-bottom: 20px;">Welcome to {{companyName}}!</h1>',
      '<h1 style="color: #333235; margin-bottom: 20px;">Welcome to {{appName}}!</h1>'
    ),
    '© {{currentYear}} {{companyName}}. All rights reserved.',
    '© {{currentYear}} {{appName}}. All rights reserved.'
  ))
),
updated_at = CURRENT_TIMESTAMP
WHERE key = 'welcome_email_template'
  AND value->>'subject' = 'Welcome to {{companyName}} - Your Account is Ready!';
