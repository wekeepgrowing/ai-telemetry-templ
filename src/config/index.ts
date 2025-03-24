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
};

// Export environment for direct access if needed
export { env };