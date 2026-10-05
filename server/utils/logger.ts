import { createLogger } from "vite";


export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  VERBOSE = 4
}


const getLogLevel = (): LogLevel => {
  const level = process.env.LOG_LEVEL?.toUpperCase();
  switch (level) {
    case 'ERROR': return LogLevel.ERROR;
    case 'WARN': return LogLevel.WARN;
    case 'INFO': return LogLevel.INFO;
    case 'DEBUG': return LogLevel.DEBUG;
    case 'VERBOSE': return LogLevel.VERBOSE;
    default:

      return process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG;
  }
};

const currentLogLevel = getLogLevel();


const formatTime = (): string => {
  return new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
};


const log = (level: LogLevel, source: string, message: string, ...args: any[]) => {
  if (level <= currentLogLevel) {
    const timestamp = formatTime();
    const levelName = LogLevel[level];
    const prefix = `${timestamp} [${source}]`;

    switch (level) {
      case LogLevel.ERROR:
        console.error(`${prefix} ERROR: ${message}`, ...args);
        break;
      case LogLevel.WARN:
        
        break;
      case LogLevel.INFO:
        
        break;
      case LogLevel.DEBUG:
        
        break;
      case LogLevel.VERBOSE:
        
        break;
    }
  }
};


export const logger = {
  error: (source: string, message: string, ...args: any[]) =>
    log(LogLevel.ERROR, source, message, ...args),

  warn: (source: string, message: string, ...args: any[]) =>
    log(LogLevel.WARN, source, message, ...args),

  info: (source: string, message: string, ...args: any[]) =>
    log(LogLevel.INFO, source, message, ...args),

  debug: (source: string, message: string, ...args: any[]) =>
    log(LogLevel.DEBUG, source, message, ...args),

  verbose: (source: string, message: string, ...args: any[]) =>
    log(LogLevel.VERBOSE, source, message, ...args),


  express: (message: string, ...args: any[]) =>
    log(LogLevel.INFO, 'express', message, ...args),

  websocket: (message: string, ...args: any[]) =>
    log(LogLevel.DEBUG, 'websocket', message, ...args),

  whatsapp: (message: string, ...args: any[]) =>
    log(LogLevel.DEBUG, 'whatsapp', message, ...args),

  qrcode: (message: string, ...args: any[]) =>
    log(LogLevel.VERBOSE, 'qrcode', message, ...args),

  database: (message: string, ...args: any[]) =>
    log(LogLevel.INFO, 'database', message, ...args),

  migration: (message: string, ...args: any[]) =>
    log(LogLevel.INFO, 'migration', message, ...args),


  isEnabled: (level: LogLevel): boolean => level <= currentLogLevel,


  getLevel: (): LogLevel => currentLogLevel
};


export const legacyLog = (message: string, source = "express") => {
  logger.info(source, message);
};
