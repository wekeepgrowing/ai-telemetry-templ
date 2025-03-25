/**
 * AI SDK Telemetry Wrappers
 *
 * Provides wrappers around Vercel AI SDK functions with integrated
 * Langfuse telemetry tracking. Maintains the original function interfaces
 * while adding comprehensive telemetry.
 */

import {generateText, generateObject, streamText, streamObject, GenerateObjectResult} from 'ai';
import { config } from '../config';
import {
  telemetry,
  getAITelemetryOptions,
  TraceManager
} from './telemetry';
import { countTokens, countTokensForModel } from './tokenizer';
import { createAccumulatingTransform, createTokenCountingTransform } from './stream-utils';
import { v4 as uuidv4 } from 'uuid';
import { Schema, z } from "zod";

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
    console.error(`Error creating telemetry for ${operationName}:`, error);
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
      console.log(`[Telemetry] Token usage:`, tokenUsage);
    }
  } catch (telemetryError) {
    console.error('Error in telemetry processing:', telemetryError);
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

    // Set up token counting and accumulation
    const tokenCounter = createTokenCountingTransform(modelName);

    // Create a new textStream with token counting
    const monitoredTextStream = result.textStream
      .pipeThrough(tokenCounter.transform);

    // Handle final token counting and telemetry completion
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
      console.error('Error processing final text stream result:', error);
    });

    // Set up progress monitoring
    const monitoringInterval = setupStreamMonitoring(
      traceManager,
      tokenCounter,
      promptTokenCount,
      parentSpanId
    );

    // Create a wrapper for the textStream that cleans up monitoring
    const enhancedTextStream = createEnhancedReadableStream(
      monitoredTextStream,
      monitoringInterval
    );

    // Return the modified result with monitored streams
    return {
      ...result,
      textStream: enhancedTextStream
    };
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

    // Initialize accumulator for object accumulation
    const accumulator = createAccumulatingTransform<T>();

    // Create a monitored partialObjectStream
    const monitoredPartialObjectStream = result.partialObjectStream
      .pipeThrough(accumulator.transform);

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
      console.error('Error processing final object stream result:', error);
    });

    // Set up progress monitoring for objects
    const monitoringInterval = setupObjectStreamMonitoring(
      traceManager,
      accumulator,
      modelName,
      promptTokenCount,
      parentSpanId
    );

    // Create a wrapper for the partialObjectStream that cleans up monitoring
    const enhancedPartialObjectStream = createEnhancedReadableStream<T>(
      monitoredPartialObjectStream,
      monitoringInterval
    );

    // Return the modified result with monitored streams
    return {
      ...result,
      partialObjectStream: enhancedPartialObjectStream
    };
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
 * Helper function to set up monitoring for text streams
 */
function setupStreamMonitoring(
  traceManager: TraceManager,
  tokenCounter: ReturnType<typeof createTokenCountingTransform>,
  promptTokenCount: number,
  parentSpanId?: string
) {
  return setInterval(() => {
    if (telemetry.isEnabled && parentSpanId) {
      const currentTokenCount = tokenCounter.getTokenCount();

      const progressData = {
        completionTokensSoFar: currentTokenCount,
        promptTokens: promptTokenCount,
        totalTokensSoFar: promptTokenCount + currentTokenCount,
        textLength: tokenCounter.getAccumulatedText().length
      };

      // Use TraceManager to update metadata
      traceManager.updateTraceMetadata({
        streamingProgress: {
          ...progressData,
          timestamp: new Date().toISOString()
        }
      });
    }
  }, 100);
}

/**
 * Helper function to set up monitoring for object streams
 */
function setupObjectStreamMonitoring<T>(
  traceManager: TraceManager,
  accumulator: ReturnType<typeof createAccumulatingTransform<T>>,
  modelName: string,
  promptTokenCount: number,
  parentSpanId?: string
) {
  return setInterval(() => {
    if (telemetry.isEnabled && parentSpanId) {
      const currentObject = accumulator.getAccumulated();

      // Skip if no accumulated object yet
      if (!currentObject) return;

      // Estimate token usage based on the JSON size of the partial object
      const partialJson = JSON.stringify(currentObject);
      const partialTokens = countTokensForModel(partialJson, modelName);

      const progressData = {
        completionTokensSoFar: partialTokens,
        promptTokens: promptTokenCount,
        totalTokensSoFar: promptTokenCount + partialTokens,
        partialObjectSize: partialJson.length
      };

      // Use TraceManager to update metadata
      traceManager.updateTraceMetadata({
        streamingProgress: {
          ...progressData,
          timestamp: new Date().toISOString()
        }
      });
    }
  }, 100);
}

/**
 * Helper function to create an enhanced readable stream with monitoring cleanup
 */
function createEnhancedReadableStream<T>(
  inputStream: ReadableStream<T>,
  monitoringInterval: NodeJS.Timeout
): ReadableStream<T> {
  return new ReadableStream<T>({
    start(controller) {
      const reader = inputStream.getReader();

      function pump(): unknown {
        return reader.read().then(({ done, value }) => {
          if (done) {
            clearInterval(monitoringInterval);
            controller.close();
            return;
          }

          controller.enqueue(value);
          return pump();
        }).catch(error => {
          clearInterval(monitoringInterval);
          controller.error(error);
        });
      }

      return pump();
    },
    cancel() {
      clearInterval(monitoringInterval);
    }
  });
}