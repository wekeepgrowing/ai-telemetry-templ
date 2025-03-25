/**
 * Utilities for streaming AI content with telemetry support
 *
 * Provides utilities for handling streaming content from the AI SDK
 * and converting it to SSE (Server-Sent Events) format with integrated
 * telemetry tracking.
 */

import { countTokensForModel } from './tokenizer';
import { config } from '../config';

/**
 * Creates a TransformStream that accumulates streamed chunks
 * and can provide the accumulated result
 *
 * @returns TransformStream and access to the accumulated result
 */
export function createAccumulatingTransform<T>() {
  let accumulated: any = null;
  let accumulator: Function = (prev: any, chunk: T) => chunk;

  // For text accumulation
  const textAccumulator = (prev: string, chunk: string) =>
    prev ? prev + chunk : chunk;

  // For object merging (deep merge for partial objects)
  const objectAccumulator = (prev: any, chunk: any) => {
    if (!prev) return chunk;
    return deepMerge(prev, chunk);
  };

  // Helper function for deep merging objects
  function deepMerge(target: any, source: any) {
    const result = { ...target };

    for (const key in source) {
      if (typeof source[key] === 'object' && source[key] !== null && target[key]) {
        result[key] = deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }

    return result;
  }

  // Detect type of accumulation needed based on first chunk
  const detectAccumulator = (chunk: T) => {
    if (typeof chunk === 'string') {
      accumulator = textAccumulator;
      accumulated = '';
    } else if (typeof chunk === 'object' && chunk !== null) {
      accumulator = objectAccumulator;
      accumulated = null;
    } else {
      // Default fallback - just take the most recent
      accumulator = (prev: any, chunk: T) => chunk;
    }
  };

  const transformStream = new TransformStream<T, T>({
    transform(chunk, controller) {
      // Set up the accumulator if this is the first chunk
      if (accumulator === detectAccumulator) {
        detectAccumulator(chunk);
      }

      // Update accumulated value
      accumulated = accumulator(accumulated, chunk);

      // Pass the original chunk through
      controller.enqueue(chunk);
    }
  });

  return {
    transform: transformStream,
    getAccumulated: () => accumulated
  };
}

/**
 * Creates a TransformStream that counts tokens in a text stream
 *
 * @param modelName The model name to use for token counting
 * @returns TransformStream and access to the token count
 */
export function createTokenCountingTransform(modelName: string = config.openai.model) {
  let tokenCount = 0;
  let accumulatedText = '';

  const transformStream = new TransformStream<string, string>({
    transform(chunk, controller) {
      if (typeof chunk === 'string') {
        // Add to accumulated text
        accumulatedText += chunk;

        // Update token count based on whole text to ensure accuracy
        tokenCount = countTokensForModel(accumulatedText, modelName);
      }

      // Pass the chunk through unchanged
      controller.enqueue(chunk);
    }
  });

  return {
    transform: transformStream,
    getTokenCount: () => tokenCount,
    getAccumulatedText: () => accumulatedText
  };
}