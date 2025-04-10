/**
 * AI SDK Telemetry Wrappers
 *
 * Provides wrappers around Vercel AI SDK functions with integrated
 * Langfuse telemetry tracking. Maintains the original function interfaces
 * while adding comprehensive telemetry.
 */

import { TraceManager } from './telemetry';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import { telemetry } from './telemetry';
import * as z from 'zod';
import {
  generateText,
  generateObject,
  streamText,
  streamObject,
  type Schema,
  type GenerateObjectResult,
  type JSONValue,
  type CoreMessage
} from 'ai';
import { config } from '../config';
import { getAITelemetryOptions } from './telemetry';
import { countTokensForModel } from './tokenizer';

// Telemetry-specific parameters that can be added to AI SDK function calls
export interface TelemetryParams {
  /**
   * TraceManager instance to use for telemetry operations
   */
  traceManager: TraceManager;

  /**
   * Name of the operation (for organizing in Langfuse UI)
   */
  operationName?: string;

  /**
   * Parent span ID for nested telemetry
   */
  parentSpanId?: string;

  /**
   * Additional metadata to include in telemetry
   */
  metadata?: Record<string, any>;
}

// Common token usage interface
interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// Common parameters for telemetry operations
interface TelemetryOperation {
  traceManager: TraceManager;
  operationName: string;
  parentSpanId?: string;
  modelName: string;
  promptText: string;
  promptTokenCount: number;
  metadata?: Record<string, any>;
  additionalInfo?: Record<string, any>;
}

/**
 * Helper function to start telemetry generation
 */
function startTelemetryGeneration(params: TelemetryOperation) {
  const {
    traceManager,
    operationName,
    parentSpanId,
    modelName,
    promptText,
    metadata,
    additionalInfo = {}
  } = params;

  if (!telemetry.isEnabled || !telemetry.langfuse) return null;

  try {
    return traceManager.startGeneration(
      parentSpanId || traceManager.getTraceId(),
      operationName,
      modelName,
      promptText,
      {
        ...additionalInfo,
        ...metadata
      }
    );
  } catch (error) {
    logger.error(`Error creating telemetry for ${operationName}:`, { error });
    return null;
  }
}

/**
 * Helper function to end telemetry generation
 */
function endTelemetryGeneration(
  traceManager: TraceManager,
  generation: any,
  result: any,
  tokenUsage: TokenUsage,
  success: boolean = true,
  error?: any
) {
  if (!telemetry.isEnabled || !telemetry.langfuse || !generation) return;

  try {
    traceManager.endGeneration(
      generation,
      success ? result : { error: String(error) },
      tokenUsage,
      {
        status: success ? 'success' : 'error',
        ...(error && { error: String(error) }),
        completedAt: new Date().toISOString()
      }
    );

    // Log token usage for debugging
    if (success && config.server.isDevelopment) {
      logger.info(`[Telemetry] Token usage:`, tokenUsage);
    }
  } catch (telemetryError) {
    logger.error('Error in telemetry processing:', { error: telemetryError });
  }
}

/**
 * Helper function to prepare base AI SDK parameters with telemetry
 */
function prepareAIParams(
  params: TelemetryOperation,
  aiParams: any
) {
  const {
    operationName,
    traceManager,
    promptTokenCount,
    modelName,
    parentSpanId,
    metadata,
    additionalInfo = {}
  } = params;

  // Configure AI SDK's built-in telemetry
  const telemetryOptions = getAITelemetryOptions(
    operationName,
    traceManager.getTraceId(),
    {
      ...metadata,
      promptTokens: promptTokenCount,
      modelId: modelName,
      timestamp: new Date().toISOString(),
      parentSpanId,
      ...additionalInfo
    }
  );

  return {
    ...aiParams,
    experimental_telemetry: telemetryOptions
  };
}

/**
 * Helper function to extract common parameters for telemetry
 */
function extractCommonParams(params: any, defaultOpName: string) {
  // Extract telemetry-specific parameters
  const { traceManager, operationName, parentSpanId, metadata, ...aiParams } = params;

  // Create operation name for tracking
  const opName = operationName || defaultOpName;

  // Extract prompt text for token counting
  const promptText = typeof params.prompt === 'string'
    ? params.prompt
    : params.messages
      ? JSON.stringify(params.messages)
      : JSON.stringify(params);

  // Get model name for token counting
  const modelName = params.model?.modelId || config.openai.model;

  // Count tokens using model-specific tokenizer
  const promptTokenCount = countTokensForModel(promptText, modelName);

  return {
    traceManager,
    operationName: opName,
    parentSpanId,
    metadata,
    aiParams,
    promptText,
    modelName,
    promptTokenCount
  };
}

/**
 * Wrapper for AI SDK's generateText with integrated Langfuse telemetry
 *
 * @param params Original generateText parameters plus telemetry options
 * @returns The result from generateText
 */
export async function generateTextWithTelemetry(
  params: Parameters<typeof generateText>[0] & TelemetryParams
): Promise<ReturnType<typeof generateText>> {
  // Extract common parameters
  const {
    traceManager,
    operationName,
    parentSpanId,
    metadata,
    aiParams,
    promptText,
    modelName,
    promptTokenCount
  } = extractCommonParams(params, 'generate-text');

  // Create generation for telemetry tracking
  const generation = startTelemetryGeneration({
    traceManager,
    operationName,
    parentSpanId,
    modelName,
    promptText,
    promptTokenCount,
    metadata
  });

  // Prepare AI SDK parameters
  const aiSdkParams = prepareAIParams(
    {
      traceManager,
      operationName,
      parentSpanId,
      modelName,
      promptText,
      promptTokenCount,
      metadata
    },
    aiParams
  );

  try {
    // Call the original AI SDK generateText function
    const result = await generateText(aiSdkParams);

    // Complete the generation with the results
    endTelemetryGeneration(
      traceManager,
      generation,
      result.text,
      result.usage
    );

    // Return the original result
    return result;
  } catch (error) {
    // Record error in telemetry if possible
    endTelemetryGeneration(
      traceManager,
      generation,
      null,
      { promptTokens: promptTokenCount, completionTokens: 0, totalTokens: promptTokenCount },
      false,
      error
    );

    // Re-throw the original error
    throw error;
  }
}

/**
 * Wrapper for AI SDK's generateObject with integrated Langfuse telemetry
 *
 * @param params Original generateObject parameters plus telemetry options
 * @returns The result from generateObject
 */
export async function generateObjectWithTelemetry<T extends string>(
  params: Parameters<typeof generateObject>[0] & TelemetryParams & {
    schema: z.Schema<T, z.ZodTypeDef, any> | Schema<T>;
    schemaName?: string;
    schemaDescription?: string;
  }
): Promise<GenerateObjectResult<unknown>> {
  // Extract common parameters
  const {
    traceManager,
    operationName,
    parentSpanId,
    metadata,
    aiParams,
    promptText,
    modelName,
    promptTokenCount
  } = extractCommonParams(params, 'generate-object');

  // Additional schema information for telemetry
  const schemaInfo = params.schema ? {
    schema: JSON.stringify(params.schema),
    schemaName: params.schemaName,
    schemaDescription: params.schemaDescription,
  } : {};

  // Create generation for telemetry tracking
  const generation = startTelemetryGeneration({
    traceManager,
    operationName,
    parentSpanId,
    modelName,
    promptText,
    promptTokenCount,
    metadata,
    additionalInfo: schemaInfo
  });

  // Prepare AI SDK parameters
  const aiSdkParams = prepareAIParams(
    {
      traceManager,
      operationName,
      parentSpanId,
      modelName,
      promptText,
      promptTokenCount,
      metadata,
      additionalInfo: schemaInfo
    },
    aiParams
  );

  try {
    // Call the original AI SDK generateObject function
    const result = await generateObject(aiSdkParams);

    // Complete the generation with the results
    endTelemetryGeneration(
      traceManager,
      generation,
      result.object,
      result.usage
    );

    // Return the original result
    return result;
  } catch (error) {
    // Record error in telemetry if possible
    endTelemetryGeneration(
      traceManager,
      generation,
      null,
      { promptTokens: promptTokenCount, completionTokens: 0, totalTokens: promptTokenCount },
      false,
      error
    );

    // Re-throw the original error
    throw error;
  }
}

/**
 * Wrapper for AI SDK's streamText with integrated Langfuse telemetry
 *
 * @param params Original streamText parameters plus telemetry options
 * @returns The result from streamText with added telemetry
 */
export async function streamTextWithTelemetry(
  params: Parameters<typeof streamText>[0] & TelemetryParams
): Promise<ReturnType<typeof streamText>> {
  // Extract common parameters
  const {
    traceManager,
    operationName,
    parentSpanId,
    metadata,
    aiParams,
    promptText,
    modelName,
    promptTokenCount
  } = extractCommonParams(params, 'stream-text');

  // Create generation for telemetry tracking
  const generation = startTelemetryGeneration({
    traceManager,
    operationName,
    parentSpanId,
    modelName,
    promptText,
    promptTokenCount,
    metadata,
    additionalInfo: { streamOperation: true }
  });

  // Prepare AI SDK parameters
  const aiSdkParams = prepareAIParams(
    {
      traceManager,
      operationName,
      parentSpanId,
      modelName,
      promptText,
      promptTokenCount,
      metadata,
      additionalInfo: { streamOperation: true }
    },
    aiParams
  );

  try {
    // Call the original AI SDK streamText function
    const result = await streamText(aiSdkParams);

    // Handle final token counting and telemetry completion on text promise resolution
    result.text.then(async (fullText) => {
      // Get final completion token count
      const finalCompletionTokenCount = countTokensForModel(fullText, modelName);
      const totalTokens = promptTokenCount + finalCompletionTokenCount;

      // Complete telemetry
      endTelemetryGeneration(
        traceManager,
        generation,
        fullText,
        {
          promptTokens: promptTokenCount,
          completionTokens: finalCompletionTokenCount,
          totalTokens
        }
      );
    }).catch(error => {
      logger.error('Error processing final text stream result:', { error });
    });

    // Set up metadata updating for progress in the background
    setupBackgroundTelemetryUpdates(traceManager, result.textStream, modelName, promptTokenCount, parentSpanId);

    // Return the original streaming result directly without wrapping
    return result;
  } catch (error) {
    // Record error in telemetry if possible
    endTelemetryGeneration(
      traceManager,
      generation,
      null,
      { promptTokens: promptTokenCount, completionTokens: 0, totalTokens: promptTokenCount },
      false,
      error
    );

    // Re-throw the original error
    throw error;
  }
}

/**
 * Wrapper for AI SDK's streamObject with integrated Langfuse telemetry
 *
 * @param params Original streamObject parameters plus telemetry options
 * @returns The result from streamObject with added telemetry
 */
export async function streamObjectWithTelemetry<T>(
  params: Parameters<typeof streamObject>[0] & TelemetryParams & {
    schema: z.Schema<T, z.ZodTypeDef, any> | Schema<T>;
    schemaName?: string;
    schemaDescription?: string;
  }
): Promise<ReturnType<typeof streamObject>> {
  // Extract common parameters
  const {
    traceManager,
    operationName,
    parentSpanId,
    metadata,
    aiParams,
    promptText,
    modelName,
    promptTokenCount
  } = extractCommonParams(params, 'stream-object');

  // Additional schema information for telemetry
  const schemaInfo = params.schema ? {
    schema: typeof params.schema === 'string' ? params.schema : JSON.stringify(params.schema),
    schemaName: params.schemaName,
    schemaDescription: params.schemaDescription,
  } : {};

  // Create generation for telemetry tracking
  const generation = startTelemetryGeneration({
    traceManager,
    operationName,
    parentSpanId,
    modelName,
    promptText,
    promptTokenCount,
    metadata,
    additionalInfo: { ...schemaInfo, streamOperation: true }
  });

  // Prepare AI SDK parameters
  const aiSdkParams = prepareAIParams(
    {
      traceManager,
      operationName,
      parentSpanId,
      modelName,
      promptText,
      promptTokenCount,
      metadata,
      additionalInfo: { ...schemaInfo, streamOperation: true }
    },
    aiParams
  );

  try {
    // Call the original AI SDK streamObject function
    const result = await streamObject<T>(aiSdkParams);

    // Handle final token counting and telemetry completion
    result.object.then(async (finalObject) => {
      const finalJson = JSON.stringify(finalObject);
      const finalCompletionTokenCount = countTokensForModel(finalJson, modelName);
      const totalTokens = promptTokenCount + finalCompletionTokenCount;

      // Complete telemetry
      endTelemetryGeneration(
        traceManager,
        generation,
        finalObject,
        {
          promptTokens: promptTokenCount,
          completionTokens: finalCompletionTokenCount,
          totalTokens
        }
      );
    }).catch(error => {
      logger.error('Error processing final object stream result:', { error });
    });

    // Set up object metadata updates in the background
    setupBackgroundObjectTelemetryUpdates(traceManager, result as any, modelName, promptTokenCount, parentSpanId);

    // Return the original result directly without wrapping
    return result as any;
  } catch (error) {
    // Record error in telemetry if possible
    endTelemetryGeneration(
      traceManager,
      generation,
      null,
      { promptTokens: promptTokenCount, completionTokens: 0, totalTokens: promptTokenCount },
      false,
      error
    );

    // Re-throw the original error
    throw error;
  }
}

/**
 * Sets up background telemetry updates for text streams without wrapping the stream
 * Uses a tee to monitor the stream without modifying it
 */
function setupBackgroundTelemetryUpdates(
  traceManager: TraceManager,
  textStream: ReadableStream<string>,
  modelName: string,
  promptTokenCount: number,
  parentSpanId?: string
) {
  if (!telemetry.isEnabled || !parentSpanId) return;

  try {
    // Clone the stream to observe it without consuming it
    const [originalStream, monitorStream] = textStream.tee();

    // Replace the original stream with our cloned one
    Object.defineProperty(textStream, 'getReader', {
      value: () => originalStream.getReader(),
      configurable: true
    });

    // Create a background update process
    let accumulatedText = '';
    const reader = monitorStream.getReader();

    const updateInterval = setInterval(() => {
      // This interval function will periodically update metadata
      if (accumulatedText) {
        const currentTokenCount = countTokensForModel(accumulatedText, modelName);

        const progressData = {
          completionTokensSoFar: currentTokenCount,
          promptTokens: promptTokenCount,
          totalTokensSoFar: promptTokenCount + currentTokenCount,
          textLength: accumulatedText.length
        };

        // Update trace metadata
        traceManager.updateTraceMetadata({
          streamingProgress: {
            ...progressData,
            timestamp: new Date().toISOString()
          }
        });
      }
    }, 100);

    // Read from the monitor stream to observe data without affecting the original
    function readChunks() {
      reader.read().then((result: ReadableStreamReadResult<any>) => {
        const { done, value } = result;
        if (done) {
          clearInterval(updateInterval);
          return;
        }
        
        // Accumulate text for token counting
        accumulatedText += value;
        readChunks();
      }).catch((err: Error) => {
        clearInterval(updateInterval);
        logger.error('Error reading from monitor stream:', { error: err });
      });
    }

    // Start reading
    readChunks();
  } catch (error) {
    logger.error('Error setting up stream monitoring:', { error });
  }
}

/**
 * Sets up background telemetry updates for object streams
 */
function setupBackgroundObjectTelemetryUpdates<T>(
  traceManager: TraceManager,
  result: ReturnType<typeof streamObject<T>>,
  modelName: string,
  promptTokenCount: number,
  parentSpanId?: string
) {
  if (!telemetry.isEnabled || !parentSpanId) return;

  try {
    // Clone the stream to observe it without consuming it
    const [originalStream, monitorStream] = result.partialObjectStream.tee();

    // Replace the original stream with our cloned one
    Object.defineProperty(result.partialObjectStream, 'getReader', {
      value: () => originalStream.getReader(),
      configurable: true
    });

    // Create a background update process
    let latestObject: any = null;
    const reader = monitorStream.getReader();

    const updateInterval = setInterval(() => {
      // This interval function will periodically update metadata
      if (latestObject) {
        const partialJson = JSON.stringify(latestObject);
        const partialTokens = countTokensForModel(partialJson, modelName);

        const progressData = {
          completionTokensSoFar: partialTokens,
          promptTokens: promptTokenCount,
          totalTokensSoFar: promptTokenCount + partialTokens,
          partialObjectSize: partialJson.length
        };

        // Update trace metadata
        traceManager.updateTraceMetadata({
          streamingProgress: {
            ...progressData,
            timestamp: new Date().toISOString()
          }
        });
      }
    }, 100);

    // Read from the monitor stream to observe data without affecting the original
    function readChunks() {
      reader.read().then((result: ReadableStreamReadResult<any>) => {
        const { done, value } = result;
        if (done) {
          clearInterval(updateInterval);
          return;
        }
        
        // Update latest object state
        if (typeof value === 'object' && value !== null) {
          latestObject = value;
        }

        readChunks();
      }).catch((err: Error) => {
        clearInterval(updateInterval);
        logger.error('Error reading from monitor stream:', { error: err });
      });
    }

    // Start reading
    readChunks();
  } catch (error) {
    logger.error('Error setting up object stream monitoring:', { error });
  }
}