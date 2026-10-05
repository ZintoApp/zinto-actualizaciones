/**
 * Preservation Property Tests for SMTP Password Decryption Bugfix
 * 
 * **Property 2: Preservation** - Non-Authentication and Non-Buggy Email Flows
 * 
 * **IMPORTANT**: These tests MUST PASS on unfixed code to establish baseline behavior
 * 
 * This test suite verifies that the bugfix does NOT change existing behavior for:
 * 1. No-auth SMTP configurations (username undefined) - verify emails send with auth: undefined
 * 2. Email template rendering - verify variable substitution works correctly
 * 3. Error handling - verify error messages for disabled SMTP or missing config
 * 4. Return format - verify `{ success: boolean; error?: string }` structure preserved
 * 5. Token generation and storage (if applicable)
 * 
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 */

import { test, mock, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Set up environment
process.env.NODE_ENV = 'development';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.SESSION_SECRET = 'test-secret-key-for-testing-only';
process.env.ENCRYPTION_KEY = 'test-encryption-key-32-chars!!';

import { 
  sendVerificationEmail, 
  sendWelcomeEmail,
  generateVerificationCode,
  createVerificationToken
} from './email-verification.js';
import { storage } from '../storage.js';
import nodemailer from 'nodemailer';

describe('Preservation Properties: Non-Authentication Email Flows', () => {
  let originalCreateTransport: any;
  let capturedTransportConfig: any;
  let capturedMailOptions: any;
  let sendMailCalled: boolean;

  beforeEach(() => {
    // Reset test state
    capturedTransportConfig = undefined;
    capturedMailOptions = undefined;
    sendMailCalled = false;

    // Mock nodemailer.createTransport to capture configuration
    originalCreateTransport = nodemailer.createTransport;
    nodemailer.createTransport = mock.fn((config: any) => {
      capturedTransportConfig = config;

      return {
        sendMail: mock.fn(async (mailOptions: any) => {
          sendMailCalled = true;
          capturedMailOptions = mailOptions;
          return { messageId: 'test-message-id-' + Date.now() };
        }),
      };
    }) as any;
  });

  afterEach(() => {
    // Restore original nodemailer.createTransport
    if (originalCreateTransport) {
      nodemailer.createTransport = originalCreateTransport;
    }
  });

  test('Preservation 3.5: No-auth SMTP configurations send emails with auth: undefined', async () => {
    // ARRANGE: SMTP config WITHOUT authentication (username undefined)
    const smtpConfig = {
      enabled: true,
      host: 'smtp.openrelay.com',
      port: 25,
      security: 'none' as const,
      // No username/password defined
      fromName: 'Test System',
      fromEmail: 'noreply@example.com',
    };

    mock.method(storage, 'getAppSetting', async (key: string) => {
      if (key === 'smtp_config') {
        return { id: 1, key: 'smtp_config', value: smtpConfig, createdAt: new Date() };
      }
      return null;
    });

    // ACT: Send verification email with no-auth config
    const result = await sendVerificationEmail(
      'user@example.com',
      '123456',
      'Test Company'
    );

    // ASSERT: Verify auth is undefined (no authentication)
    assert.equal(
      capturedTransportConfig?.auth,
      undefined,
      'Expected auth to be undefined for no-auth SMTP config'
    );

    assert.equal(
      result.success,
      true,
      'Expected sendVerificationEmail to succeed with no-auth SMTP'
    );

    assert.ok(
      sendMailCalled,
      'Expected sendMail to be called'
    );

    console.log('✓ Preservation verified: No-auth SMTP works with auth: undefined');
  });

  test('Preservation 3.5: Multiple no-auth configurations remain unchanged', async () => {
    // Test multiple SMTP configurations without authentication
    const configs = [
      {
        enabled: true,
        host: 'relay1.example.com',
        port: 25,
        security: 'none' as const,
        fromName: 'System 1',
        fromEmail: 'system1@example.com',
      },
      {
        enabled: true,
        host: 'relay2.example.com',
        port: 587,
        security: 'tls' as const,
        fromName: 'System 2',
        fromEmail: 'system2@example.com',
      },
    ];

    for (const config of configs) {
      // Reset captured config
      capturedTransportConfig = undefined;

      mock.method(storage, 'getAppSetting', async (key: string) => {
        if (key === 'smtp_config') {
          return { id: 1, key: 'smtp_config', value: config, createdAt: new Date() };
        }
        return null;
      });

      const result = await sendVerificationEmail(
        'test@example.com',
        '999999',
        'Test Co'
      );

      assert.equal(
        capturedTransportConfig?.auth,
        undefined,
        `Expected auth to be undefined for config with host ${config.host}`
      );

      assert.equal(
        result.success,
        true,
        `Expected success for config with host ${config.host}`
      );
    }

    console.log('✓ Preservation verified: Multiple no-auth configs work correctly');
  });

  test('Preservation 3.3: Email template variable substitution unchanged', async () => {
    // ARRANGE: SMTP config and welcome email template
    const smtpConfig = {
      enabled: true,
      host: 'smtp.test.com',
      port: 25,
      security: 'none' as const,
      fromName: 'Welcome Bot',
      fromEmail: 'welcome@example.com',
    };

    const template = {
      enabled: true,
      subject: 'Welcome to {{companyName}}!',
      body: '<h1>Hello {{adminFullName}}</h1><p>Username: {{adminUsername}}</p><p>Email: {{adminEmail}}</p><p>Plan: {{planLabel}}</p><p><a href="{{loginUrl}}">Login</a></p><p>Year: {{currentYear}}</p>',
    };

    mock.method(storage, 'getAppSetting', async (key: string) => {
      if (key === 'smtp_config') {
        return { id: 1, key: 'smtp_config', value: smtpConfig, createdAt: new Date() };
      }
      if (key === 'welcome_email_template') {
        return { id: 2, key: 'welcome_email_template', value: template, createdAt: new Date() };
      }
      return null;
    });

    const testData = {
      companyName: 'Pointer Softwareoration',
      adminFullName: 'Felix Zona',
      adminUsername: 'felix',
      adminEmail: 'jane@acme.com',
      planLabel: 'Enterprise',
      loginUrl: 'https://app.acme.com/login',
    };

    // ACT: Send welcome email
    const result = await sendWelcomeEmail(testData);

    // ASSERT: Verify template variable substitution
    assert.equal(result.success, true, 'Expected welcome email to send successfully');
    assert.ok(capturedMailOptions, 'Expected mail options to be captured');

    const subject = capturedMailOptions.subject;
    const body = capturedMailOptions.html;

    // Verify all variables were substituted correctly
    assert.ok(
      subject.includes('Pointer Softwareoration'),
      'Expected subject to contain company name'
    );

    assert.ok(
      body.includes('Felix Zona'),
      'Expected body to contain admin full name'
    );

    assert.ok(
      body.includes('felix'),
      'Expected body to contain admin username'
    );

    assert.ok(
      body.includes('jane@acme.com'),
      'Expected body to contain admin email'
    );

    assert.ok(
      body.includes('Enterprise'),
      'Expected body to contain plan label'
    );

    assert.ok(
      body.includes('https://app.acme.com/login'),
      'Expected body to contain login URL'
    );

    const currentYear = new Date().getFullYear().toString();
    assert.ok(
      body.includes(currentYear),
      'Expected body to contain current year'
    );

    // Verify no template variables remain unsubstituted
    assert.ok(
      !body.includes('{{'),
      'Expected no unsubstituted template variables in body'
    );

    console.log('✓ Preservation verified: Template variable substitution works correctly');
  });

  test('Preservation 3.4: Error handling for disabled SMTP unchanged', async () => {
    // ARRANGE: SMTP config with enabled: false
    const smtpConfig = {
      enabled: false,
      host: 'smtp.example.com',
      port: 587,
      security: 'tls' as const,
      username: 'test@example.com',
      password: 'any-password',
      fromName: 'Test',
      fromEmail: 'test@example.com',
    };

    mock.method(storage, 'getAppSetting', async (key: string) => {
      if (key === 'smtp_config') {
        return { id: 1, key: 'smtp_config', value: smtpConfig, createdAt: new Date() };
      }
      return null;
    });

    // ACT: Try to send verification email with disabled SMTP
    const result = await sendVerificationEmail(
      'user@example.com',
      '123456',
      'Test Company'
    );

    // ASSERT: Verify error response format and message
    assert.equal(
      result.success,
      false,
      'Expected sendVerificationEmail to fail with disabled SMTP'
    );

    assert.ok(
      result.error,
      'Expected error message to be present'
    );

    assert.ok(
      result.error.includes('SMTP is disabled'),
      `Expected error to mention SMTP is disabled, got: ${result.error}`
    );

    // Verify return format is preserved
    assert.equal(
      typeof result.success,
      'boolean',
      'Expected success to be boolean'
    );

    assert.equal(
      typeof result.error,
      'string',
      'Expected error to be string'
    );

    console.log('✓ Preservation verified: Error handling for disabled SMTP unchanged');
  });

  test('Preservation 3.4: Error handling for missing SMTP config unchanged', async () => {
    // ARRANGE: No SMTP config in database
    mock.method(storage, 'getAppSetting', async (key: string) => {
      return null; // No config found
    });

    // ACT: Try to send verification email without SMTP config
    const result = await sendVerificationEmail(
      'user@example.com',
      '123456',
      'Test Company'
    );

    // ASSERT: Verify error response format and message
    assert.equal(
      result.success,
      false,
      'Expected sendVerificationEmail to fail without SMTP config'
    );

    assert.ok(
      result.error,
      'Expected error message to be present'
    );

    assert.ok(
      result.error.includes('SMTP is not configured'),
      `Expected error to mention SMTP not configured, got: ${result.error}`
    );

    console.log('✓ Preservation verified: Error handling for missing SMTP config unchanged');
  });

  test('Preservation 3.4: Return format { success: boolean; error?: string } preserved', async () => {
    // Test various scenarios to verify return format consistency

    // Scenario 1: No SMTP config
    mock.method(storage, 'getAppSetting', async () => null);
    const result1 = await sendVerificationEmail('test@test.com', '123456', 'Test');

    assert.equal(typeof result1, 'object', 'Expected result to be object');
    assert.equal(typeof result1.success, 'boolean', 'Expected success to be boolean');
    assert.ok('error' in result1 || result1.success, 'Expected error field or success=true');
    if (!result1.success) {
      assert.equal(typeof result1.error, 'string', 'Expected error to be string when present');
    }

    // Scenario 2: Disabled SMTP
    const disabledConfig = {
      enabled: false,
      host: 'smtp.test.com',
      port: 587,
      security: 'tls' as const,
      fromName: 'Test',
      fromEmail: 'test@test.com',
    };

    mock.method(storage, 'getAppSetting', async (key: string) => {
      if (key === 'smtp_config') {
        return { id: 1, key: 'smtp_config', value: disabledConfig, createdAt: new Date() };
      }
      return null;
    });

    const result2 = await sendVerificationEmail('test@test.com', '123456', 'Test');

    assert.equal(typeof result2, 'object', 'Expected result to be object');
    assert.equal(typeof result2.success, 'boolean', 'Expected success to be boolean');
    if (!result2.success) {
      assert.equal(typeof result2.error, 'string', 'Expected error to be string when present');
    }

    // Scenario 3: Success case (no-auth SMTP)
    const noAuthConfig = {
      enabled: true,
      host: 'smtp.relay.com',
      port: 25,
      security: 'none' as const,
      fromName: 'Test',
      fromEmail: 'test@test.com',
    };

    mock.method(storage, 'getAppSetting', async (key: string) => {
      if (key === 'smtp_config') {
        return { id: 1, key: 'smtp_config', value: noAuthConfig, createdAt: new Date() };
      }
      return null;
    });

    const result3 = await sendVerificationEmail('test@test.com', '123456', 'Test');

    assert.equal(typeof result3, 'object', 'Expected result to be object');
    assert.equal(typeof result3.success, 'boolean', 'Expected success to be boolean');
    assert.equal(result3.success, true, 'Expected success for valid no-auth config');

    console.log('✓ Preservation verified: Return format { success: boolean; error?: string } preserved');
  });

  test('Preservation 3.2: Token generation logic unchanged', async () => {
    // Test verification code generation
    const code1 = generateVerificationCode();
    const code2 = generateVerificationCode();

    // Verify code format (6 digits)
    assert.equal(code1.length, 6, 'Expected verification code to be 6 digits');
    assert.ok(/^\d{6}$/.test(code1), 'Expected verification code to be numeric');
    
    // Verify codes are different (randomness)
    assert.notEqual(code1, code2, 'Expected different codes on subsequent calls');

    // Verify code range (100000 - 999999)
    const codeNum = parseInt(code1, 10);
    assert.ok(codeNum >= 100000 && codeNum <= 999999, 'Expected code in valid range');

    console.log('✓ Preservation verified: Token generation format unchanged');
  });

  test('Preservation 3.2: Token storage with expiry unchanged', async () => {
    // Mock storage token creation
    let capturedTokenData: any;

    mock.method(storage, 'createEmailVerificationToken', async (data: any) => {
      capturedTokenData = data;
      return undefined;
    });

    // Create verification token
    const registrationData = { companyName: 'Test Co', email: 'test@example.com' };
    const result = await createVerificationToken('test@example.com', registrationData);

    // Verify token format
    assert.ok(result.token, 'Expected token to be returned');
    assert.equal(result.token.length, 6, 'Expected token to be 6 digits');
    assert.ok(/^\d{6}$/.test(result.token), 'Expected token to be numeric');

    // Verify expiry time (10 minutes)
    assert.ok(result.expiresAt, 'Expected expiresAt to be returned');
    const expectedExpiry = new Date(Date.now() + 10 * 60 * 1000);
    const timeDiff = Math.abs(result.expiresAt.getTime() - expectedExpiry.getTime());
    assert.ok(timeDiff < 1000, 'Expected expiry to be ~10 minutes from now');

    // Verify storage was called with correct data
    assert.ok(capturedTokenData, 'Expected storage to be called');
    assert.equal(capturedTokenData.email, 'test@example.com', 'Expected email to match');
    assert.equal(capturedTokenData.token, result.token, 'Expected token to match');
    assert.deepEqual(capturedTokenData.registrationData, registrationData, 'Expected registration data to match');

    console.log('✓ Preservation verified: Token storage with 10-minute expiry unchanged');
  });

  test('Preservation 3.6: Verification email HTML structure unchanged', async () => {
    // ARRANGE: No-auth SMTP config to allow email to send
    const smtpConfig = {
      enabled: true,
      host: 'smtp.test.com',
      port: 25,
      security: 'none' as const,
      fromName: 'Test System',
      fromEmail: 'noreply@test.com',
    };

    mock.method(storage, 'getAppSetting', async (key: string) => {
      if (key === 'smtp_config') {
        return { id: 1, key: 'smtp_config', value: smtpConfig, createdAt: new Date() };
      }
      return null;
    });

    // ACT: Send verification email
    const verificationCode = '123456';
    const companyName = 'Test Company';
    const result = await sendVerificationEmail(
      'user@example.com',
      verificationCode,
      companyName
    );

    // ASSERT: Verify email structure
    assert.equal(result.success, true, 'Expected email to send successfully');
    assert.ok(capturedMailOptions, 'Expected mail options to be captured');

    const html = capturedMailOptions.html;

    // Verify email contains key elements
    assert.ok(html.includes('Verify Your Email'), 'Expected email subject in HTML');
    assert.ok(html.includes(companyName), 'Expected company name in email');
    assert.ok(html.includes(verificationCode), 'Expected verification code in email');
    assert.ok(html.includes('10 minutes'), 'Expected expiry time mentioned');
    assert.ok(html.includes('font-family'), 'Expected HTML styling preserved');

    // Verify from address format
    const from = capturedMailOptions.from;
    assert.ok(from.includes(smtpConfig.fromName!), 'Expected from name in from field');
    assert.ok(from.includes(smtpConfig.fromEmail!), 'Expected from email in from field');

    // Verify to address
    assert.equal(capturedMailOptions.to, 'user@example.com', 'Expected to address to match');

    console.log('✓ Preservation verified: Verification email HTML structure unchanged');
  });

  test('Preservation 3.6: Welcome email disabled state handling unchanged', async () => {
    // ARRANGE: SMTP enabled but welcome email template disabled
    const smtpConfig = {
      enabled: true,
      host: 'smtp.test.com',
      port: 25,
      security: 'none' as const,
      fromName: 'Test',
      fromEmail: 'test@test.com',
    };

    const template = {
      enabled: false, // Template disabled
      subject: 'Welcome!',
      body: '<p>Welcome</p>',
    };

    mock.method(storage, 'getAppSetting', async (key: string) => {
      if (key === 'smtp_config') {
        return { id: 1, key: 'smtp_config', value: smtpConfig, createdAt: new Date() };
      }
      if (key === 'welcome_email_template') {
        return { id: 2, key: 'welcome_email_template', value: template, createdAt: new Date() };
      }
      return null;
    });

    // ACT: Try to send welcome email with disabled template
    const result = await sendWelcomeEmail({
      companyName: 'Test Co',
      adminFullName: 'Test User',
      adminUsername: 'testuser',
      adminEmail: 'test@test.com',
      planLabel: 'Basic',
      loginUrl: 'https://app.test.com',
    });

    // ASSERT: Verify disabled template is handled correctly
    assert.equal(
      result.success,
      true,
      'Expected success: true when welcome email is disabled (skip sending)'
    );

    assert.equal(
      sendMailCalled,
      false,
      'Expected sendMail NOT to be called when template is disabled'
    );

    console.log('✓ Preservation verified: Welcome email disabled state skips sending');
  });
});

describe('Preservation Properties: Edge Cases', () => {
  let originalCreateTransport: any;

  beforeEach(() => {
    originalCreateTransport = nodemailer.createTransport;
    nodemailer.createTransport = mock.fn((config: any) => {
      return {
        sendMail: mock.fn(async () => ({ messageId: 'test-id' })),
      };
    }) as any;
  });

  afterEach(() => {
    if (originalCreateTransport) {
      nodemailer.createTransport = originalCreateTransport;
    }
  });

  test('Preservation: Empty password with undefined username works', async () => {
    const smtpConfig = {
      enabled: true,
      host: 'smtp.test.com',
      port: 25,
      security: 'none' as const,
      password: '', // Empty password
      // No username
      fromName: 'Test',
      fromEmail: 'test@test.com',
    };

    mock.method(storage, 'getAppSetting', async (key: string) => {
      if (key === 'smtp_config') {
        return { id: 1, key: 'smtp_config', value: smtpConfig, createdAt: new Date() };
      }
      return null;
    });

    const result = await sendVerificationEmail('test@test.com', '123456', 'Test');

    assert.equal(result.success, true, 'Expected success with empty password and no username');
    console.log('✓ Preservation verified: Empty password with no username handled correctly');
  });

  test('Preservation: Different security modes work consistently', async () => {
    const securityModes = ['none', 'ssl', 'tls', 'starttls'] as const;

    for (const security of securityModes) {
      const smtpConfig = {
        enabled: true,
        host: 'smtp.test.com',
        port: security === 'ssl' ? 465 : 587,
        security,
        fromName: 'Test',
        fromEmail: 'test@test.com',
      };

      mock.method(storage, 'getAppSetting', async (key: string) => {
        if (key === 'smtp_config') {
          return { id: 1, key: 'smtp_config', value: smtpConfig, createdAt: new Date() };
        }
        return null;
      });

      const result = await sendVerificationEmail('test@test.com', '123456', 'Test');

      assert.equal(
        result.success,
        true,
        `Expected success with security mode: ${security}`
      );
    }

    console.log('✓ Preservation verified: All security modes work consistently');
  });
});
