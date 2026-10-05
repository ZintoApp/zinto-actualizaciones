import * as nodemailer from 'nodemailer';
import type SMTPTransport from 'nodemailer/lib/smtp-transport';
import { storage } from '../storage';
import { decryptValue } from './crypto';

export interface AdminSmtpConfig {
  enabled?: boolean;
  host?: string;
  port?: number;
  security?: 'none' | 'ssl' | 'tls' | 'starttls';
  username?: string;
  password?: string;
  fromName?: string;
  fromEmail?: string;
}

export interface ResolvedSmtpConfig {
  host: string;
  port: number;
  security: 'none' | 'ssl' | 'tls';
  username: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

function normalizeSecurity(security?: AdminSmtpConfig['security']): 'none' | 'ssl' | 'tls' {
  if (security === 'starttls') {
    return 'tls';
  }
  if (security === 'ssl' || security === 'tls' || security === 'none') {
    return security;
  }
  return 'tls';
}

function decryptSmtpPassword(password: string): string {
  if (password.includes(':')) {
    return decryptValue(password);
  }
  return password;
}

export function createSmtpTransporter(config: ResolvedSmtpConfig): nodemailer.Transporter {
  const transportConfig: SMTPTransport.Options = {
    host: config.host,
    port: config.port,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 15000,
  };

  if (config.security === 'ssl') {
    transportConfig.secure = true;
  } else if (config.security === 'tls') {
    transportConfig.secure = false;
    transportConfig.requireTLS = true;
  } else {
    transportConfig.secure = false;
    transportConfig.ignoreTLS = true;
  }

  if (config.username.trim() !== '') {
    transportConfig.auth = {
      user: config.username,
      pass: config.password,
    };
  }

  return nodemailer.createTransport(transportConfig);
}

export function isLegacySmtpConfig(config: Record<string, unknown>): boolean {
  return Boolean(config.auth && typeof config.auth === 'object');
}

export function resolveAdminSmtpConfig(raw: AdminSmtpConfig): ResolvedSmtpConfig | null {
  if (!raw.enabled || !raw.host || !raw.username || !raw.password) {
    return null;
  }

  return {
    host: raw.host,
    port: raw.port || 587,
    security: normalizeSecurity(raw.security),
    username: raw.username,
    password: decryptSmtpPassword(raw.password),
    fromName: raw.fromName || 'BotHivePlus',
    fromEmail: raw.fromEmail || raw.username,
  };
}

export function resolveLegacySmtpConfig(raw: Record<string, unknown>): ResolvedSmtpConfig | null {
  const auth = raw.auth as { user?: string; pass?: string } | undefined;
  if (!raw.host || !auth?.user || !auth?.pass) {
    return null;
  }

  const port = typeof raw.port === 'number' ? raw.port : 465;
  const secure = raw.secure === true;

  return {
    host: String(raw.host),
    port,
    security: secure ? 'ssl' : 'tls',
    username: auth.user,
    password: String(auth.pass),
    fromName: String(raw.senderName || 'BotHivePlus'),
    fromEmail: String(raw.senderEmail || auth.user),
  };
}

export async function loadResolvedSmtpConfig(): Promise<ResolvedSmtpConfig | null> {
  const adminSetting = await storage.getAppSetting('smtp_config');
  if (adminSetting?.value) {
    const resolved = resolveAdminSmtpConfig(adminSetting.value as AdminSmtpConfig);
    if (resolved) {
      return resolved;
    }
  }

  const storedConfig = await storage.getSmtpConfig();
  if (storedConfig && isLegacySmtpConfig(storedConfig)) {
    return resolveLegacySmtpConfig(storedConfig);
  }

  if (storedConfig) {
    return resolveAdminSmtpConfig(storedConfig as AdminSmtpConfig);
  }

  return null;
}
