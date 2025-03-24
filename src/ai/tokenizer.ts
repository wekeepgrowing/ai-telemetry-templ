/**
 * Tokenizer module
 *
 * Provides utilities for token counting across different model providers
 * and context management.
 */

import { getEncoding } from 'js-tiktoken';
import { config } from '../config';

// Tokenizer registry to support different model families
export enum ModelFamily {
  GPT = 'gpt',
  CLAUDE = 'claude',
  LLAMA = 'llama',
  MISTRAL = 'mistral',
  GEMINI = 'gemini',
  COHERE = 'cohere',
  // Add other model families as needed
}

// Mapping model families to their appropriate encodings
const encodingMap: Record<ModelFamily, string> = {
  [ModelFamily.GPT]: 'cl100k_base',     // For GPT-3.5 / GPT-4 models
  [ModelFamily.CLAUDE]: 'cl100k_base',  // Best approximation for Claude models
  [ModelFamily.LLAMA]: 'cl100k_base',   // Approximation for LLaMA
  [ModelFamily.MISTRAL]: 'cl100k_base', // Approximation for Mistral
  [ModelFamily.GEMINI]: 'cl100k_base',  // Approximation for Google Gemini
  [ModelFamily.COHERE]: 'cl100k_base',  // Approximation for Cohere models
};

// Default model family to use if none specified
const DEFAULT_MODEL_FAMILY = ModelFamily.GPT;

// Cache encoders to avoid reloading them
const encoderCache: Record<string, any> = {};

/**
 * Gets the appropriate encoder for a given model family
 *
 * @param modelFamily The model family to get the encoder for
 * @returns The encoder instance
 */
function getEncoderForModelFamily(modelFamily: ModelFamily = DEFAULT_MODEL_FAMILY): any {
  const encodingKey = encodingMap[modelFamily];
  
  if (!encoderCache[encodingKey]) {
    encoderCache[encodingKey] = getEncoding(encodingKey);
  }
  
  return encoderCache[encodingKey];
}

/**
 * Detect model family from model name
 *
 * @param modelName Full name of the model
 * @returns ModelFamily enum value
 */
export function detectModelFamily(modelName: string): ModelFamily {
  const lowerModel = modelName.toLowerCase();
  
  if (lowerModel.includes('gpt')) {
    return ModelFamily.GPT;
  } else if (lowerModel.includes('claude')) {
    return ModelFamily.CLAUDE;
  } else if (lowerModel.includes('llama')) {
    return ModelFamily.LLAMA;
  } else if (lowerModel.includes('mistral')) {
    return ModelFamily.MISTRAL;
  } else if (lowerModel.includes('gemini')) {
    return ModelFamily.GEMINI;
  } else if (lowerModel.includes('cohere') || lowerModel.includes('command')) {
    return ModelFamily.COHERE;
  }
  
  // Default to GPT as fallback
  return DEFAULT_MODEL_FAMILY;
}

/**
 * Count tokens in a text string
 *
 * @param text Text to count tokens for
 * @param modelFamily Optional model family to use for counting
 * @returns Number of tokens
 */
export function countTokens(text: string, modelFamily?: ModelFamily): number {
  if (!text) return 0;
  
  const family = modelFamily || DEFAULT_MODEL_FAMILY;
  const encoder = getEncoderForModelFamily(family);
  
  return encoder.encode(text).length;
}

/**
 * Count tokens in a text string using the model name to detect the family
 *
 * @param text Text to count tokens for
 * @param modelName Name of the model to derive the tokenizer from
 * @returns Number of tokens
 */
export function countTokensForModel(text: string, modelName: string): number {
  const modelFamily = detectModelFamily(modelName);
  return countTokens(text, modelFamily);
}

// Minimum chunk size when trimming prompts
const MIN_CHUNK_SIZE = 140;

/**
 * Trim prompt to maximum context size
 *
 * @param prompt The text prompt to trim
 * @param contextSize Maximum context size (defaults to environment setting)
 * @param modelFamily Optional model family for tokenization
 * @returns Trimmed prompt that fits within context window
 */
export function trimPrompt(
  prompt: string,
  contextSize = config.openai.contextSize,
  modelFamily?: ModelFamily
): string {
  if (!prompt) {
    return '';
  }

  const family = modelFamily || DEFAULT_MODEL_FAMILY;
  const length = countTokens(prompt, family);
  
  if (length <= contextSize) {
    return prompt;
  }

  const overflowTokens = length - contextSize;
  // On average it's 3-4 characters per token, so multiply by 3.5 to get approximate characters
  const chunkSize = prompt.length - Math.ceil(overflowTokens * 3.5);
  
  if (chunkSize < MIN_CHUNK_SIZE) {
    return prompt.slice(0, MIN_CHUNK_SIZE);
  }

  // Use the TextSplitter to intelligently split text
  // We'll import this dynamically to avoid circular references
  const { RecursiveCharacterTextSplitter } = require('./text');

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap: 0,
  });
  
  const trimmedPrompt = splitter.splitText(prompt)[0] ?? '';

  // Last catch: if the trimmed prompt is same length as original,
  // do a hard cut to avoid infinite recursion
  if (trimmedPrompt.length === prompt.length) {
    return trimPrompt(prompt.slice(0, chunkSize), contextSize, family);
  }

  // Recursively trim until prompt is within context size
  return trimPrompt(trimmedPrompt, contextSize, family);
}

/**
 * Clear any loaded encoders from cache
 * Useful for cleaning up resources
 */
export function clearEncoderCache(): void {
  Object.keys(encoderCache).forEach(key => {
    if (encoderCache[key] && typeof encoderCache[key].free === 'function') {
      encoderCache[key].free();
    }
  });
  
  Object.keys(encoderCache).forEach(key => {
    delete encoderCache[key];
  });
}