/**
 * Configuration module
 *
 * Centralizes all application configuration in one place
 */

import { env } from './environment';

/**
 * Application configuration derived from environment and constants
 */
export const config = {
  // Server settings
  server: {
    port: parseInt(env.PORT, 10),
    environment: env.NODE_ENV,
    isDevelopment: env.NODE_ENV === 'development',
    isProduction: env.NODE_ENV === 'production',
    isTest: env.NODE_ENV === 'test',
  },

  // OpenAI configuration
  openai: {
    apiKey: env.OPENAI_API_KEY,
    model: env.OPENAI_MODEL,
    baseUrl: env.OPENAI_ENDPOINT,
    contextSize: env.CONTEXT_SIZE,
  },

  // Telemetry configuration
  telemetry: {
    enabled: env.ENABLE_TELEMETRY,
    langfuse: {
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      secretKey: env.LANGFUSE_SECRET_KEY,
      baseUrl: env.LANGFUSE_BASEURL,
    },
  },

  // Logging configuration
  logging: {
    level: env.LOG_LEVEL || (env.NODE_ENV === 'development' ? 'debug' : 'info'),
    enableFileLogging: env.ENABLE_FILE_LOGGING,
    logDir: env.LOG_DIR || 'logs',
    maxSize: env.LOG_MAX_SIZE || '20m',
    maxFiles: env.LOG_MAX_FILES || '14d',
  },
};

// Export environment for direct access if needed
export { env };