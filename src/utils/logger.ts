/**
 * Centralized logging system using Winston
 *
 * Provides structured logging with different transports and log levels
 * based on the environment. Supports console and file logging with
 * appropriate formatting for development and production.
 * All console output goes to stderr to keep stdout clean for AI responses.
 */

import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import { config } from '../config';

// Define custom log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
  trace: 5,
};

// Define colors for each log level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'blue',
  trace: 'cyan',
};

// Add colors to Winston
winston.addColors(colors);

// Define log format for development (human-readable)
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `[${info.timestamp}] ${info.level}: ${info.message}${
      info.metadata && Object.keys(info.metadata).length
        ? '\n' + JSON.stringify(info.metadata, null, 2)
        : ''
    }`
  )
);

// Define log format for production (JSON for easier parsing)
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Determine if file transport should be used based on config
const useFileTransport = config.logging?.enableFileLogging || false;

// Create transports array
const transports = [
  // Always log to stderr instead of console
  new winston.transports.Stream({
    stream: process.stderr,
    format: config.server.isDevelopment
      ? developmentFormat
      : winston.format.combine(
          winston.format.colorize({ all: true }),
          winston.format.simple()
        ),
    level: 'trace', // Log everything to stderr
  })
];

// Add file transports if enabled
if (useFileTransport) {
  // Create logs directory if it doesn't exist
  const logsDir = path.join(process.cwd(), 'logs');

  // Add rotated file transport for all logs
  transports.push(
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      level: config.server.isDevelopment ? 'debug' : 'info',
    })
  );

  // Add rotated file transport specifically for errors
  transports.push(
    new winston.transports.DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      level: 'error',
    })
  );
}

// Get appropriate log level based on environment
const level = () => {
  return config.server.isDevelopment ? 'trace' : config.logging.level;
};

// Create Winston logger instance
const logger = winston.createLogger({
  level: level(),
  levels,
  format: config.server.isDevelopment ? developmentFormat : productionFormat,
  transports,
  exitOnError: false,
});

/**
 * Attach metadata to log messages
 *
 * @param message The log message
 * @param metadata Additional context data
 * @returns Formatted message with metadata
 */
const formatWithMetadata = (message: string, metadata?: Record<string, any>) => {
  if (!metadata || Object.keys(metadata).length === 0) {
    return { message };
  }

  return {
    message,
    metadata
  };
};

// Create the logger interface
const appLogger = {
  error: (message: string, metadata?: Record<string, any>) =>
    logger.error(formatWithMetadata(message, metadata)),

  warn: (message: string, metadata?: Record<string, any>) =>
    logger.warn(formatWithMetadata(message, metadata)),

  info: (message: string, metadata?: Record<string, any>) =>
    logger.info(formatWithMetadata(message, metadata)),

  http: (message: string, metadata?: Record<string, any>) =>
    logger.http(formatWithMetadata(message, metadata)),

  debug: (message: string, metadata?: Record<string, any>) =>
    logger.debug(formatWithMetadata(message, metadata)),

  trace: (message: string, metadata?: Record<string, any>) =>
    logger.log('trace', formatWithMetadata(message, metadata)),
};

export { appLogger as logger };