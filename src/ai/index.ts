/**
 * AI module index
 *
 * Centralizes exports for AI-related functionality
 */

// Export tokenizer functionality
export * from './tokenizer';

// Export telemetry functionality
export * from './telemetry';

// Export text utilities
export * from './text';

// Export telemetry wrapper functions
export * from './telemetry-wrappers';

// Export stream utilities
export * from './stream-utils';

// Re-export common utilities for token counting and telemetry
export { countTokens, countTokensForModel, detectModelFamily } from './tokenizer';
export {
  createGeneration,
  completeGeneration,
  createStreamingSpan,
  completeStreamingSpan,
  updateStreamingTelemetry,
  recordStreamingProgress,
  TraceManager // Export TraceManager type for use in function signatures
} from './telemetry';

// Set up a default OpenAI model
import { openai } from '@ai-sdk/openai';
import { config } from '../config';

// Export the configured model
export const model = openai(config.openai.model, {
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseUrl
});