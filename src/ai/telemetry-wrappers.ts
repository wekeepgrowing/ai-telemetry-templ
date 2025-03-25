/**
 * AI SDK Telemetry Wrappers
 *
 * Provides wrappers around Vercel AI SDK functions with integrated
 * Langfuse telemetry tracking. Maintains the original function interfaces
 * while adding comprehensive telemetry.
 */

import { generateText, generateObject, streamText, streamObject } from 'ai';
import { config } from '../config';
import {
  telemetry,
  getAITelemetryOptions,
  TraceManager
} from './telemetry';
import { countTokens, countTokensForModel } from './tokenizer';
import { createAccumulatingTransform, createTokenCountingTransform } from './stream-utils';
import { v4 as uuidv4 } from 'uuid';

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

/**
 * Wrapper for AI SDK's generateText with integrated Langfuse telemetry
 *
 * @param params Original generateText parameters plus telemetry options
 * @returns The result from generateText
 */
export async function generateTextWithTelemetry(
  params: Parameters<typeof generateText>[0] & TelemetryParams
): Promise<ReturnType<typeof generateText>> {
  // Extract telemetry-specific parameters
  const { traceManager, operationName, parentSpanId, metadata, ...aiParams } = params;

  // Create operation name for tracking
  const opName = operationName || 'generate-text';

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

  // Create generation for telemetry tracking
  let generation = null;

  if (telemetry.isEnabled && telemetry.langfuse) {
    try {
      // Use TraceManager to create generation
      generation = traceManager.startGeneration(
        parentSpanId || traceManager.getTraceId(),
        opName,
        modelName,
        promptText,
        metadata
      );
    } catch (error) {
      console.error('Error creating telemetry generation:', error);
    }
  }

  // Configure AI SDK's built-in telemetry
  const telemetryOptions = getAITelemetryOptions(
    opName,
    traceManager.getTraceId(),
    {
      ...metadata,
      promptTokens: promptTokenCount,
      modelId: modelName,
      timestamp: new Date().toISOString(),
      parentSpanId
    }
  );

  const aiSdkParams = {
    ...aiParams,
    experimental_telemetry: telemetryOptions
  };

  try {
    // Call the original AI SDK generateText function
    const result = await generateText(aiSdkParams);

    // Complete the generation with the results
    if (telemetry.isEnabled && telemetry.langfuse) {
      try {
        // Extract token usage information
        const tokenUsage = result.usage;

        // Use TraceManager to end generation if we have one
        traceManager.endGeneration(
          generation,
          result.text,
          tokenUsage,
          {
            status: 'success',
            completedAt: new Date().toISOString()
          }
        );

        // Log token usage for debugging
        if (config.server.isDevelopment) {
          console.log(`[Telemetry] Operation: ${opName}, Token usage:`, tokenUsage);
        }
      } catch (error) {
        console.error('Error in telemetry processing:', error);
      }
    }

    // Return the original result
    return result;
  } catch (error) {
    // Record error in telemetry if possible
    if (telemetry.isEnabled && telemetry.langfuse) {
      try {
        // End generation with error if it exists
        if (generation) {
          traceManager.endGeneration(
            generation,
            { error: String(error) },
            { promptTokens: promptTokenCount, completionTokens: 0, totalTokens: promptTokenCount },
            {
              status: 'error',
              error: String(error),
              completedAt: new Date().toISOString()
            }
          );
        }
      } catch (telemetryError) {
        console.error('Error recording failure in telemetry:', telemetryError);
      }
    }

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
export async function generateObjectWithTelemetry(
  params: Parameters<typeof generateObject<string>>[0] & TelemetryParams
): Promise<ReturnType<typeof generateObject>> {
  // Extract telemetry-specific parameters
  const { traceManager, operationName, parentSpanId, metadata, ...aiParams } = params;

  // Create operation name for tracking
  const opName = operationName || 'generate-object';

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

  // Additional schema information for telemetry
  const schemaInfo = params.schema ? {
    schema: JSON.stringify(params.schema),
    schemaName: params.schemaName,
    schemaDescription: params.schemaDescription,
  } : {};

  // Create generation for telemetry tracking
  let generation = null;

  if (telemetry.isEnabled && telemetry.langfuse) {
    try {
      // Use TraceManager to create generation
      generation = traceManager.startGeneration(
        parentSpanId || traceManager.getTraceId(),
        opName,
        modelName,
        promptText,
        {
          ...schemaInfo,
          ...metadata
        }
      );
    } catch (error) {
      console.error('Error creating telemetry generation:', error);
    }
  }

  // Configure AI SDK's built-in telemetry
  const telemetryOptions = getAITelemetryOptions(
    opName,
    traceManager.getTraceId(),
    {
      ...metadata,
      promptTokens: promptTokenCount,
      modelId: modelName,
      timestamp: new Date().toISOString(),
      schema: schemaInfo.schema,
      schemaName: schemaInfo.schemaName,
      schemaDescription: schemaInfo.schemaDescription,
      parentSpanId
    }
  );

  const aiSdkParams = {
    ...aiParams,
    experimental_telemetry: telemetryOptions
  };

  try {
    // Call the original AI SDK generateObject function
    const result = await generateObject(aiSdkParams);

    // Complete the generation with the results
    if (telemetry.isEnabled && telemetry.langfuse) {
      try {
        // Extract token usage information
        const tokenUsage = result.usage;

        // Use TraceManager to end generation
        traceManager.endGeneration(
          generation,
          result.object,
          tokenUsage,
          {
            status: 'success',
            completedAt: new Date().toISOString()
          }
        );

        // Log token usage for debugging
        if (config.server.isDevelopment) {
          console.log(`[Telemetry] Operation: ${opName}, Token usage:`, tokenUsage);
        }
      } catch (error) {
        console.error('Error in telemetry processing:', error);
      }
    }

    // Return the original result
    return result;
  } catch (error) {
    // Record error in telemetry if possible
    if (telemetry.isEnabled && telemetry.langfuse) {
      try {
        // End generation with error if it exists
        if (generation) {
          traceManager.endGeneration(
            generation,
            { error: String(error) },
            { promptTokens: promptTokenCount, completionTokens: 0, totalTokens: promptTokenCount },
            {
              status: 'error',
              error: String(error),
              completedAt: new Date().toISOString()
            }
          );
        }
      } catch (telemetryError) {
        console.error('Error recording failure in telemetry:', telemetryError);
      }
    }

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
  // Extract telemetry-specific parameters
  const { traceManager, operationName, parentSpanId, metadata, ...aiParams } = params;

  // Create operation name for tracking
  const opName = operationName || 'stream-text';

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

  // Create generation for telemetry tracking
  let generation = null;

  if (telemetry.isEnabled && telemetry.langfuse) {
    try {
      // Create generation using TraceManager
      generation = traceManager.startGeneration(
        parentSpanId || traceManager.getTraceId(),
        opName,
        modelName,
        promptText,
        {
          streamOperation: true,
          ...metadata
        }
      );
    } catch (error) {
      console.error('Error creating telemetry for text streaming:', error);
    }
  }

  // Configure AI SDK's built-in telemetry
  const telemetryOptions = getAITelemetryOptions(
    opName,
    traceManager.getTraceId(),
    {
      ...metadata,
      promptTokens: promptTokenCount,
      modelId: modelName,
      timestamp: new Date().toISOString(),
      parentSpanId,
      streamOperation: true
    }
  );

  const aiSdkParams = {
    ...aiParams,
    experimental_telemetry: telemetryOptions
  };

  try {
    // Call the original AI SDK streamText function
    const result = await streamText(aiSdkParams);

    // Set up token counting and accumulation
    const tokenCounter = createTokenCountingTransform(modelName);
    const lastUpdate = { timestamp: Date.now() };

    // Create a new textStream with token counting
    const monitoredTextStream = result.textStream
      .pipeThrough(tokenCounter.transform);

    // Handle final token counting and telemetry completion
    result.text.then(async (fullText) => {
      // Get final completion token count
      const finalCompletionTokenCount = countTokensForModel(fullText, modelName);
      const totalTokens = promptTokenCount + finalCompletionTokenCount;

      // Complete telemetry
      if (telemetry.isEnabled && telemetry.langfuse) {
        try {
          // Complete generation using TraceManager
          if (generation) {
            traceManager.endGeneration(
              generation,
              fullText,
              {
                promptTokens: promptTokenCount,
                completionTokens: finalCompletionTokenCount,
                totalTokens
              },
              {
                status: 'success',
                completedAt: new Date().toISOString()
              }
            );
          }

          // Log token usage for debugging
          if (config.server.isDevelopment) {
            console.log(`[Telemetry] Stream text operation: ${opName}, Token usage:`, {
              promptTokens: promptTokenCount,
              completionTokens: finalCompletionTokenCount,
              totalTokens
            });
          }
        } catch (error) {
          console.error('Error finalizing text streaming telemetry:', error);
        }
      }
    }).catch(error => {
      console.error('Error processing final text stream result:', error);
    });

    // Set up a monitoring interval to track progress periodically
    const monitoringInterval = setInterval(() => {
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
    }, 100); // Check frequently but only update when needed

    // Create a wrapper for the textStream that cleans up monitoring
    const enhancedTextStream = new ReadableStream({
      start(controller) {
        const reader = monitoredTextStream.getReader();

        function pump() {
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

    // Wait for the full result before returning the textStream
    return {
      ...result,
      textStream: enhancedTextStream
    };
  } catch (error) {
    // Record error in telemetry if possible
    if (telemetry.isEnabled && telemetry.langfuse) {
      try {
        // End generation with error if it exists
        if (generation) {
          traceManager.endGeneration(
            generation,
            { error: String(error) },
            {
              promptTokens: promptTokenCount,
              completionTokens: 0,
              totalTokens: promptTokenCount
            },
            {
              status: 'error',
              error: String(error),
              completedAt: new Date().toISOString()
            }
          );
        }
      } catch (telemetryError) {
        console.error('Error recording streaming failure in telemetry:', telemetryError);
      }
    }

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
export async function streamObjectWithTelemetry<T = any>(
  params: Parameters<typeof streamObject<T>>[0] & TelemetryParams
): Promise<ReturnType<typeof streamObject<T>>> {
  // Extract telemetry-specific parameters
  const { traceManager, operationName, parentSpanId, metadata, ...aiParams } = params;

  // Create operation name for tracking
  const opName = operationName || 'stream-object';

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

  // Additional schema information for telemetry
  const schemaInfo = params.schema ? {
    schema: typeof params.schema === 'string' ? params.schema : JSON.stringify(params.schema),
    schemaName: params.schemaName,
    schemaDescription: params.schemaDescription,
  } : {};

  // Create generation for telemetry tracking
  let generation = null;

  if (telemetry.isEnabled && telemetry.langfuse) {
    try {
      // Create generation using TraceManager
      generation = traceManager.startGeneration(
        parentSpanId || traceManager.getTraceId(),
        opName,
        modelName,
        promptText,
        {
          streamOperation: true,
          ...schemaInfo,
          ...metadata
        }
      );
    } catch (error) {
      console.error('Error creating telemetry for object streaming:', error);
    }
  }

  // Configure AI SDK's built-in telemetry
  const telemetryOptions = getAITelemetryOptions(
    opName,
    traceManager.getTraceId(),
    {
      ...metadata,
      promptTokens: promptTokenCount,
      modelId: modelName,
      timestamp: new Date().toISOString(),
      parentSpanId,
      schema: schemaInfo.schema,
      schemaName: schemaInfo.schemaName,
      schemaDescription: schemaInfo.schemaDescription,
      streamOperation: true
    }
  );

  const aiSdkParams = {
    ...aiParams,
    experimental_telemetry: telemetryOptions
  };

  try {
    // Call the original AI SDK streamObject function
    const result = await streamObject(aiSdkParams);

    // Initialize accumulator for object accumulation
    const accumulator = createAccumulatingTransform<T>();
    const lastUpdate = { timestamp: Date.now() };

    // Create a monitored partialObjectStream
    const monitoredPartialObjectStream = result.partialObjectStream
      .pipeThrough(accumulator.transform);

    // Handle final token counting and telemetry completion
    result.object.then(async (finalObject) => {
      const finalJson = JSON.stringify(finalObject);
      const finalCompletionTokenCount = countTokensForModel(finalJson, modelName);
      const totalTokens = promptTokenCount + finalCompletionTokenCount;

      // Complete telemetry
      if (telemetry.isEnabled && telemetry.langfuse) {
        try {
          // Complete generation using TraceManager
          if (generation) {
            traceManager.endGeneration(
              generation,
              finalObject,
              {
                promptTokens: promptTokenCount,
                completionTokens: finalCompletionTokenCount,
                totalTokens
              },
              {
                status: 'success',
                completedAt: new Date().toISOString()
              }
            );
          }

          // Log token usage for debugging
          if (config.server.isDevelopment) {
            console.log(`[Telemetry] Stream object operation: ${opName}, Token usage:`, {
              promptTokens: promptTokenCount,
              completionTokens: finalCompletionTokenCount,
              totalTokens
            });
          }
        } catch (error) {
          console.error('Error finalizing object streaming telemetry:', error);
        }
      }
    }).catch(error => {
      console.error('Error processing final object stream result:', error);
    });

    // Set up a monitoring interval to track progress periodically
    const monitoringInterval = setInterval(() => {
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
    }, 100); // Check frequently but only update when needed

    // Create a wrapper for the partialObjectStream that cleans up monitoring
    const enhancedPartialObjectStream = new ReadableStream<T>({
      start(controller) {
        const reader = monitoredPartialObjectStream.getReader();

        function pump() {
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

    // Return the modified result with monitored streams
    return {
      ...result,
      partialObjectStream: enhancedPartialObjectStream
    };
  } catch (error) {
    // Record error in telemetry if possible
    if (telemetry.isEnabled && telemetry.langfuse) {
      try {
        // End generation with error if it exists
        if (generation) {
          traceManager.endGeneration(
            generation,
            { error: String(error) },
            {
              promptTokens: promptTokenCount,
              completionTokens: 0,
              totalTokens: promptTokenCount
            },
            {
              status: 'error',
              error: String(error),
              completedAt: new Date().toISOString()
            }
          );
        }
      } catch (telemetryError) {
        console.error('Error recording object streaming failure in telemetry:', telemetryError);
      }
    }

    // Re-throw the original error
    throw error;
  }
}