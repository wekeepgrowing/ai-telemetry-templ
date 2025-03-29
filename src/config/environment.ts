/**
 * Environment configuration with validation
 *
 * This module centralizes all environment variable handling and validation
 * to ensure type safety and configuration consistency.
 */

import { z } from 'zod';

// Environment variable schema with validation
const envSchema = z.object({
  // API and server settings
  PORT: z.string().default('3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // OpenAI settings
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required'),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_ENDPOINT: z.string().url().default('https://api.openai.com/v1'),

  // Anthropic settings
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-3-5-sonnet-20240620'),

  // Google Gemini settings
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_MODEL: z.string().default('gemini-1.5-pro'),
  
  // Grok settings
  GROK_API_KEY: z.string().optional(),
  GROK_MODEL: z.string().default('grok-1'),
  GROK_ENDPOINT: z.string().url().optional(),

  // Other settings
  CONTEXT_SIZE: z.string().transform(val => parseInt(val, 10)).default('128000'),

  // Langfuse telemetry settings
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASEURL: z.string().url().optional(),
  ENABLE_TELEMETRY: z.string().transform(val => val === 'true').default('true'),

  // Logging configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug', 'trace']).optional(),
  ENABLE_FILE_LOGGING: z.string().transform(val => val === 'true').default('false'),
  LOG_DIR: z.string().optional(),
  LOG_MAX_SIZE: z.string().optional(),
  LOG_MAX_FILES: z.string().optional(),
});

// Parse environment variables with validation
function loadEnv() {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.format();
      process.stderr.write(`[ERROR] Environment validation failed: ${JSON.stringify(formattedErrors, null, 2)}\n`);
      process.exit(1);
    }
    throw error;
  }
}

// Export validated environment variables
export const env = loadEnv();

// Export typed environment for use across the application
export type Environment = z.infer<typeof envSchema>;