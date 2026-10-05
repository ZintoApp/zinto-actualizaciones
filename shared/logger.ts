/**
 * Production-safe logger utility
 * 
 * This logger provides a way to include debug information in development
 * while ensuring it's automatically removed in production builds.
 * 
 * Usage:
 *   import { logger } from '@shared/logger';
 *   
 *   logger.debug('Debug info');     // Removed in production
 *   logger.info('Info message');    // Removed in production  
 *   logger.warn('Warning');         // Removed in production
 *   logger.error('Error');          // Preserved in production
 *   logger.production('Always shown'); // Always preserved
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'production';

interface Logger {
  debug: (message: any, ...args: any[]) => void;
  info: (message: any, ...args: any[]) => void;
  warn: (message: any, ...args: any[]) => void;
  error: (message: any, ...args: any[]) => void;
  production: (message: any, ...args: any[]) => void;
}

const isProduction = typeof process !== 'undefined' && process.env.NODE_ENV === 'production';

const createLogger = (): Logger => {
  if (!isProduction) {
    return {
      debug: (message: any, ...args: any[]) => console.log('🐛 [DEBUG]', message, ...args),
      info: (message: any, ...args: any[]) => console.info('ℹ️ [INFO]', message, ...args),
      warn: (message: any, ...args: any[]) => console.warn('⚠️ [WARN]', message, ...args),
      error: (message: any, ...args: any[]) => console.error('❌ [ERROR]', message, ...args),
      production: (message: any, ...args: any[]) => console.log('🚀 [PROD]', message, ...args),
    };
  }

  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: (message: any, ...args: any[]) => console.error('❌ [ERROR]', message, ...args),
    production: (message: any, ...args: any[]) => console.log('🚀 [PROD]', message, ...args),
  };
};

export const logger = createLogger();

export const isDevelopment = !isProduction;
export const isProductionBuild = isProduction;

/**
 * Conditional development-only function execution
 * This entire function call will be removed in production builds
 */
export const devOnly = (fn: () => void): void => {
  if (!isProduction) {
    fn();
  }
};

/**
 * Conditional production-only function execution
 */
export const prodOnly = (fn: () => void): void => {
  if (isProduction) {
    fn();
  }
};

/**
 * Performance timing utility that's removed in production
 */
export const perfTimer = (label: string) => {
  if (!isProduction) {
    console.time(label);
    return () => console.timeEnd(label);
  }
  return () => {};
};

/**
 * Debug object inspection that's removed in production
 */
export const debugObject = (obj: any, label?: string): void => {
  if (!isProduction) {
    if (label) {
      console.group(`🔍 Debug: ${label}`);
    }
    console.dir(obj, { depth: 3, colors: true });
    if (label) {
      console.groupEnd();
    }
  }
};

/**
 * Assert function that's removed in production
 */
export const devAssert = (condition: boolean, message: string): void => {
  if (!isProduction && !condition) {
    console.error('🚨 Assertion failed:', message);
    console.trace();
  }
};

export default logger;
