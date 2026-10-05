/**
 * Bug Fix Verification Test for SMTP Password Decryption
 * 
 * **Property 1: Expected Behavior** - SMTP Authentication Succeeds with Decrypted Password
 * 
 * This test verifies that sendVerificationEmail and sendWelcomeEmail correctly
 * decrypt passwords before passing them to nodemailer, ensuring SMTP authentication
 * succeeds with the plaintext credentials.
 * 
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
 */

import { test, mock, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import 'dotenv/config';

import { sendVerificationEmail, sendWelcomeEmail } from './email-verification.js';
import { storage } from '../storage.js';
import nodemailer from 'nodemailer';

// Import encryption utilities for test setup (matching the ones in admin-routes)
import { createCipheriv, createDecipheriv, randomBytes as cryptoRandomBytes } from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production-32-chars';
const ALGORITHM = 'aes-256-cbc';

function getEncryptionKey(): Buffer {
  const key = ENCRYPTION_KEY;
  let finalKey: string;
  if (key.length === 32) {
    finalKey = key;
  } else if (key.length > 32) {
    finalKey = key.substring(0, 32);
  } else {
    finalKey = key.padEnd(32, '0');
  }
  return Buffer.from(finalKey, 'utf8');
}

function encryptPassword(password: string): string {
  const iv = cryptoRandomBytes(16);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptPassword(encryptedPassword: string): string {
  const [ivHex, encrypted] = encryptedPassword.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

describe('Bug Fix Verification: SMTP Password Decryption', () => {
  let originalCreateTransport: any;
  let capturedAuthPassword: string | undefined;
  let sendMailCalled: boolean;

  beforeEach(() => {
    // Reset test state
    capturedAuthPassword = undefined;
    sendMailCalled = false;

    // Mock nodemailer.createTransport to capture what password is passed
    originalCreateTransport = nodemailer.createTransport;
    nodemailer.createTransport = mock.fn((config: any) => {
      // Capture the password that was passed to auth.pass
      if (config.auth && config.auth.pass) {
        capturedAuthPassword = config.auth.pass;
      }

      // Return a mock transporter that simulates SMTP behavior
      return {
        sendMail: mock.fn(async (mailOptions: any) => {
          sendMailCalled = true;
          
          // Simulate SMTP authentication failure when password looks encrypted
          // Encrypted passwords have the format: "hexIV:hexEncryptedData"
          if (capturedAuthPassword && capturedAuthPassword.includes(':') && 
              /^[0-9a-f]+:[0-9a-f]+$/.test(capturedAuthPassword)) {
            // This looks like an encrypted password - simulate auth failure
            throw new Error('Invalid login: 535 5.7.8 Authentication failed');
          }

          // If password is plaintext (or auth is undefined), simulate success
          return { messageId: 'test-message-id' };
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

  test('sendVerificationEmail SUCCEEDS with decrypted SMTP password (Fixed Behavior)', async () => {
    // ARRANGE: Set up SMTP config with encrypted password (as stored in database)
    const plaintextPassword = 'mySecurePassword123';
    const encryptedPassword = encryptPassword(plaintextPassword);
    
    const smtpConfig = {
      enabled: true,
      host: 'smtp.gmail.com',
      port: 587,
      security: 'tls' as const,
      username: 'test@example.com',
      password: encryptedPassword, // Encrypted password as stored in DB
      fromName: 'Test Company',
      fromEmail: 'noreply@example.com',
    };

    // Mock storage to return SMTP config with encrypted password
    mock.method(storage, 'getAppSetting', async (key: string) => {
      if (key === 'smtp_config') {
        return { id: 1, key: 'smtp_config', value: smtpConfig, createdAt: new Date() };
      }
      return null;
    });

    // ACT: Call sendVerificationEmail with encrypted password in config
    const result = await sendVerificationEmail(
      'user@example.com',
      '123456',
      'Test Company'
    );

    // ASSERT: Verify fixed behavior
    
    // 1. Verify that PLAINTEXT password (not encrypted) was passed to nodemailer
    assert.ok(
      capturedAuthPassword,
      'Expected password to be captured from nodemailer.createTransport call'
    );
    
    assert.equal(
      capturedAuthPassword,
      plaintextPassword,
      'Fix verified: Plaintext password passed to nodemailer after decryption'
    );
    
    assert.ok(
      !capturedAuthPassword!.includes(':') || !/^[0-9a-f]+:[0-9a-f]+$/.test(capturedAuthPassword!),
      'Expected captured password to be plaintext (not in encrypted hex:hex format)'
    );

    // 2. Verify that sendMail was called (email was sent)
    assert.ok(
      sendMailCalled,
      'Expected sendMail to be called'
    );

    // 3. Verify that the function returns success
    assert.equal(
      result.success,
      true,
      'Expected sendVerificationEmail to return success: true after decryption fix'
    );

    // 4. Verify no error message
    assert.equal(
      result.error,
      undefined,
      'Expected no error message on successful email send'
    );

    console.log('✓ Fixed behavior confirmed for sendVerificationEmail:');
    console.log(`  - Plaintext password was passed to nodemailer: ${plaintextPassword}`);
    console.log(`  - SMTP authentication succeeded`);
    console.log(`  - Function returned success: true`);
  });

  test('sendWelcomeEmail SUCCEEDS with decrypted SMTP password (Fixed Behavior)', async () => {
    // ARRANGE: Set up SMTP config with encrypted password
    const plaintextPassword = 'anotherSecurePass456';
    const encryptedPassword = encryptPassword(plaintextPassword);
    
    const smtpConfig = {
      enabled: true,
      host: 'smtp.example.com',
      port: 465,
      security: 'ssl' as const,
      username: 'welcome@example.com',
      password: encryptedPassword, // Encrypted password as stored in DB
      fromName: 'Welcome Team',
      fromEmail: 'welcome@example.com',
    };

    const welcomeTemplate = {
      enabled: true,
      subject: 'Welcome to {{companyName}}!',
      body: '<h1>Welcome {{adminFullName}}!</h1><p>Your account is ready.</p>',
    };

    // Mock storage to return SMTP config and welcome template
    mock.method(storage, 'getAppSetting', async (key: string) => {
      if (key === 'smtp_config') {
        return { id: 1, key: 'smtp_config', value: smtpConfig, createdAt: new Date() };
      }
      if (key === 'welcome_email_template') {
        return { id: 2, key: 'welcome_email_template', value: welcomeTemplate, createdAt: new Date() };
      }
      return null;
    });

    // ACT: Call sendWelcomeEmail with encrypted password in config
    const result = await sendWelcomeEmail({
      companyName: 'Pointer Software',
      adminFullName: 'John Doe',
      adminUsername: 'johndoe',
      adminEmail: 'john@acme.com',
      planLabel: 'Professional',
      loginUrl: 'https://app.example.com/login',
    });

    // ASSERT: Verify fixed behavior
    
    // 1. Verify that PLAINTEXT password (not encrypted) was passed to nodemailer
    assert.ok(
      capturedAuthPassword,
      'Expected password to be captured from nodemailer.createTransport call'
    );
    
    assert.equal(
      capturedAuthPassword,
      plaintextPassword,
      'Fix verified: Plaintext password passed to nodemailer after decryption'
    );
    
    assert.ok(
      !capturedAuthPassword!.includes(':') || !/^[0-9a-f]+:[0-9a-f]+$/.test(capturedAuthPassword!),
      'Expected captured password to be plaintext (not in encrypted hex:hex format)'
    );

    // 2. Verify that sendMail was called (email was sent)
    assert.ok(
      sendMailCalled,
      'Expected sendMail to be called'
    );

    // 3. Verify that the function returns success
    assert.equal(
      result.success,
      true,
      'Expected sendWelcomeEmail to return success: true after decryption fix'
    );

    // 4. Verify no error message
    assert.equal(
      result.error,
      undefined,
      'Expected no error message on successful email send'
    );

    console.log('✓ Fixed behavior confirmed for sendWelcomeEmail:');
    console.log(`  - Plaintext password was passed to nodemailer: ${plaintextPassword}`);
    console.log(`  - SMTP authentication succeeded`);
    console.log(`  - Function returned success: true`);
  });

  test('Contrast: SMTP config without authentication works fine (No Bug Condition)', async () => {
    // ARRANGE: Set up SMTP config WITHOUT authentication (username undefined)
    const smtpConfig = {
      enabled: true,
      host: 'smtp.relay.com',
      port: 25,
      security: 'none' as const,
      // No username/password - open relay
      fromName: 'Test System',
      fromEmail: 'system@example.com',
    };

    // Mock storage to return SMTP config without auth
    mock.method(storage, 'getAppSetting', async (key: string) => {
      if (key === 'smtp_config') {
        return { id: 1, key: 'smtp_config', value: smtpConfig, createdAt: new Date() };
      }
      return null;
    });

    // ACT: Call sendVerificationEmail with no-auth config
    const result = await sendVerificationEmail(
      'user@example.com',
      '654321',
      'Test Company'
    );

    // ASSERT: Verify no-auth SMTP works (no bug condition)
    
    // 1. Verify that no password was captured (auth should be undefined)
    assert.equal(
      capturedAuthPassword,
      undefined,
      'Expected no password to be passed for no-auth SMTP config'
    );

    // 2. Verify email was attempted
    assert.ok(
      sendMailCalled,
      'Expected sendMail to be called'
    );

    // 3. Verify success (no auth failure)
    assert.equal(
      result.success,
      true,
      'Expected sendVerificationEmail to succeed with no-auth SMTP'
    );

    console.log('✓ No-auth SMTP works correctly (no bug condition):');
    console.log(`  - No password was passed to nodemailer (auth: undefined)`);
    console.log(`  - Email sent successfully`);
  });
});
