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
  createGeneration,
  completeGeneration,
  getAITelemetryOptions,
  createStreamingSpan,
  updateStreamingTelemetry,
  completeStreamingSpan,
  recordStreamingProgress,
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
  traceManager?: TraceManager;
  
  /**
   * Trace ID to associate this operation with (if traceManager not provided)
   */
  traceId?: string;

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
  const { traceManager, traceId, operationName, parentSpanId, metadata, ...aiParams } = params;

  // Create operation name for tracking
  const opName = operationName || 'generate-text';

  // Get effective trace ID - either from traceManager or direct traceId
  const effectiveTraceId = traceManager?.getTraceId() || traceId;

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
  let spanId = parentSpanId;

  if (effectiveTraceId && telemetry.isEnabled && telemetry.langfuse) {
    try {
      // If we have a traceManager, use it to create a span
      if (traceManager) {
        spanId = traceManager.startSpan(opName, {
          operation: 'generate-text',
          promptTokens: promptTokenCount,
          modelName: modelName,
          timestamp: new Date().toISOString(),
          ...metadata
        }, parentSpanId);
        
        // Use TraceManager to create generation
        generation = traceManager.startGeneration(
          spanId,
          opName,
          modelName,
          promptText,
          metadata
        );
      } else {
        // Legacy approach when only traceId is provided
        generation = createGeneration(
          effectiveTraceId,
          modelName,
          promptText,
          {
            operationName: opName,
            promptTokens: promptTokenCount,
            timestamp: new Date().toISOString(),
            ...metadata
          },
          parentSpanId
        );
      }
    } catch (error) {
      console.error('Error creating telemetry generation:', error);
    }
  }

  // Configure AI SDK's built-in telemetry
  const telemetryOptions = getAITelemetryOptions(
    opName,
    effectiveTraceId,
    {
      ...metadata,
      promptTokens: promptTokenCount,
      modelId: modelName,
      timestamp: new Date().toISOString(),
      parentSpanId: spanId
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
    if (effectiveTraceId && telemetry.isEnabled && telemetry.langfuse) {
      try {
        // Extract token usage information
        const tokenUsage = result.usage;

        if (traceManager && spanId) {
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
          
          // End the span
          traceManager.endSpan(spanId, result.text, {
            tokenUsage,
            status: 'success',
            completedAt: new Date().toISOString()
          });
          
          // TraceManager already updates trace token usage internally
        } else if (generation) {
          // Legacy approach
          completeGeneration(generation, result.text, tokenUsage);
        }

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
    if (effectiveTraceId && telemetry.isEnabled && telemetry.langfuse) {
      try {
        if (traceManager && spanId) {
          // End span with error
          traceManager.endSpan(spanId, { error: String(error) }, {
            status: 'error',
            error: String(error),
            completedAt: new Date().toISOString()
          });
          
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
        } else if (generation) {
          // Legacy approach
          completeGeneration(
            generation,
            { error: String(error) },
            { promptTokens: promptTokenCount, completionTokens: 0, totalTokens: promptTokenCount }
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
  const { traceManager, traceId, operationName, parentSpanId, metadata, ...aiParams } = params;

  // Create operation name for tracking
  const opName = operationName || 'generate-object';

  // Get effective trace ID - either from traceManager or direct traceId
  const effectiveTraceId = traceManager?.getTraceId() || traceId;

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
  let spanId = parentSpanId;

  if (effectiveTraceId && telemetry.isEnabled && telemetry.langfuse) {
    try {
      // If we have a traceManager, use it to create a span
      if (traceManager) {
        spanId = traceManager.startSpan(opName, {
          operation: 'generate-object',
          promptTokens: promptTokenCount,
          modelName: modelName,
          ...schemaInfo,
          timestamp: new Date().toISOString(),
          ...metadata
        }, parentSpanId);
        
        // Use TraceManager to create generation
        generation = traceManager.startGeneration(
          spanId,
          opName,
          modelName,
          promptText,
          {
            ...schemaInfo,
            ...metadata
          }
        );
      } else {
        // Legacy approach when only traceId is provided
        generation = createGeneration(
          effectiveTraceId,
          modelName,
          promptText,
          {
            operationName: opName,
            promptTokens: promptTokenCount,
            timestamp: new Date().toISOString(),
            ...schemaInfo,
            ...metadata
          },
          parentSpanId
        );
      }
    } catch (error) {
      console.error('Error creating telemetry generation:', error);
    }
  }

  // Configure AI SDK's built-in telemetry
  const telemetryOptions = getAITelemetryOptions(
    opName,
    effectiveTraceId,
    {
      ...metadata,
      promptTokens: promptTokenCount,
      modelId: modelName,
      timestamp: new Date().toISOString(),
      schema: schemaInfo.schema,
      schemaName: schemaInfo.schemaName,
      schemaDescription: schemaInfo.schemaDescription,
      parentSpanId: spanId
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
    if (effectiveTraceId && telemetry.isEnabled && telemetry.langfuse) {
      try {
        // Extract token usage information
        const tokenUsage = result.usage;

        if (traceManager && spanId) {
          // Use TraceManager to end generation if we have one
          traceManager.endGeneration(
            generation,
            result.object,
            tokenUsage,
            {
              status: 'success',
              completedAt: new Date().toISOString()
            }
          );
          
          // End the span
          traceManager.endSpan(spanId, result.object, {
            tokenUsage,
            status: 'success',
            completedAt: new Date().toISOString()
          });
          
          // TraceManager already updates trace token usage internally
        } else if (generation) {
          // Legacy approach
          completeGeneration(generation, result.object, tokenUsage);
        }

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
    if (effectiveTraceId && telemetry.isEnabled && telemetry.langfuse) {
      try {
        if (traceManager && spanId) {
          // End span with error
          traceManager.endSpan(spanId, { error: String(error) }, {
            status: 'error',
            error: String(error),
            completedAt: new Date().toISOString()
          });
          
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
        } else if (generation) {
          // Legacy approach
          completeGeneration(
            generation,
            { error: String(error) },
            { promptTokens: promptTokenCount, completionTokens: 0, totalTokens: promptTokenCount }
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
  const { traceManager, traceId, operationName, parentSpanId, metadata, ...aiParams } = params;

  // Create operation name for tracking
  const opName = operationName || 'stream-text';

  // Get effective trace ID - either from traceManager or direct traceId
  const effectiveTraceId = traceManager?.getTraceId() || traceId;

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
  let spanId = null;

  if (effectiveTraceId && telemetry.isEnabled && telemetry.langfuse) {
    try {
      // If we have a traceManager, use it directly
      if (traceManager) {
        spanId = traceManager.startSpan(`streaming-${opName}`, {
          operation: 'stream-text',
          streamingOperation: true,
          promptTokens: promptTokenCount,
          modelName: modelName,
          timestamp: new Date().toISOString(),
          ...metadata
        }, parentSpanId);
        
        // Create generation using TraceManager
        generation = traceManager.startGeneration(
          spanId,
          opName,
          modelName,
          promptText,
          {
            streamOperation: true,
            ...metadata
          }
        );
      } else {
        // Legacy approach - create a span and generation directly
        spanId = createStreamingSpan(
          effectiveTraceId,
          opName,
          {
            promptTokens: promptTokenCount,
            timestamp: new Date().toISOString(),
            modelId: modelName,
            ...metadata
          },
          parentSpanId
        );

        // Create generation for more detailed tracking
        generation = createGeneration(
          effectiveTraceId,
          modelName,
          promptText,
          {
            operationName: opName,
            promptTokens: promptTokenCount,
            timestamp: new Date().toISOString(),
            streamOperation: true,
            ...metadata
          },
          spanId
        );
      }
    } catch (error) {
      console.error('Error creating telemetry for text streaming:', error);
    }
  }

  // Configure AI SDK's built-in telemetry
  const telemetryOptions = getAITelemetryOptions(
    opName,
    effectiveTraceId,
    {
      ...metadata,
      promptTokens: promptTokenCount,
      modelId: modelName,
      timestamp: new Date().toISOString(),
      parentSpanId: spanId || parentSpanId,
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
      if (effectiveTraceId && telemetry.isEnabled && telemetry.langfuse) {
        try {
          if (traceManager && spanId) {
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
            
            // End the streaming span
            traceManager.endSpan(spanId, fullText, {
              promptTokens: promptTokenCount,
              completionTokens: finalCompletionTokenCount,
              totalTokens,
              status: 'success',
              streamingCompleted: true,
              completedAt: new Date().toISOString()
            });
            
            // TraceManager already updates trace token usage internally
          } else {
            // Legacy approach
            if (generation) {
              completeGeneration(
                generation,
                fullText,
                {
                  promptTokens: promptTokenCount,
                  completionTokens: finalCompletionTokenCount,
                  totalTokens
                }
              );
            }

            if (spanId) {
              completeStreamingSpan(
                spanId,
                fullText,
                {
                  promptTokens: promptTokenCount,
                  completionTokens: finalCompletionTokenCount,
                  totalTokens,
                  status: 'success',
                  completedAt: new Date().toISOString()
                }
              );
            }
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
      if (effectiveTraceId && telemetry.isEnabled && spanId) {
        const currentTokenCount = tokenCounter.getTokenCount();
        
        const progressData = {
          completionTokensSoFar: currentTokenCount,
          promptTokens: promptTokenCount,
          totalTokensSoFar: promptTokenCount + currentTokenCount,
          textLength: tokenCounter.getAccumulatedText().length
        };
        
        if (traceManager) {
          // Use TraceManager to update metadata
          traceManager.updateTraceMetadata({
            streamingProgress: {
              ...progressData,
              timestamp: new Date().toISOString()
            }
          });
        } else {
          // Legacy approach
          recordStreamingProgress(
            spanId,
            effectiveTraceId,
            progressData,
            lastUpdate,
            500 // Update at most every 500ms
          );
        }
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
    if (effectiveTraceId && telemetry.isEnabled && telemetry.langfuse) {
      try {
        if (traceManager && spanId) {
          // End span with error using TraceManager
          traceManager.endSpan(spanId, { error: String(error) }, {
            status: 'error',
            error: String(error),
            completedAt: new Date().toISOString()
          });
          
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
        } else {
          // Legacy approach
          if (spanId) {
            completeStreamingSpan(
              spanId,
              { error: String(error) },
              {
                promptTokens: promptTokenCount,
                completionTokens: 0,
                totalTokens: promptTokenCount,
                status: 'error',
                error: String(error),
                completedAt: new Date().toISOString()
              }
            );
          }

          if (generation) {
            completeGeneration(
              generation,
              { error: String(error) },
              { promptTokens: promptTokenCount, completionTokens: 0, totalTokens: promptTokenCount }
            );
          }
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
  const { traceManager, traceId, operationName, parentSpanId, metadata, ...aiParams } = params;

  // Create operation name for tracking
  const opName = operationName || 'stream-object';

  // Get effective trace ID - either from traceManager or direct traceId
  const effectiveTraceId = traceManager?.getTraceId() || traceId;

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
  let spanId = null;

  if (effectiveTraceId && telemetry.isEnabled && telemetry.langfuse) {
    try {
      // If we have a traceManager, use it directly
      if (traceManager) {
        spanId = traceManager.startSpan(`streaming-${opName}`, {
          operation: 'stream-object',
          streamingOperation: true,
          promptTokens: promptTokenCount,
          modelName: modelName,
          ...schemaInfo,
          timestamp: new Date().toISOString(),
          ...metadata
        }, parentSpanId);
        
        // Create generation using TraceManager
        generation = traceManager.startGeneration(
          spanId,
          opName,
          modelName,
          promptText,
          {
            streamOperation: true,
            ...schemaInfo,
            ...metadata
          }
        );
      } else {
        // Legacy approach - create a span and generation directly
        spanId = createStreamingSpan(
          effectiveTraceId,
          opName,
          {
            promptTokens: promptTokenCount,
            timestamp: new Date().toISOString(),
            modelId: modelName,
            ...schemaInfo,
            ...metadata
          },
          parentSpanId
        );

        // Create generation for more detailed tracking
        generation = createGeneration(
          effectiveTraceId,
          modelName,
          promptText,
          {
            operationName: opName,
            promptTokens: promptTokenCount,
            timestamp: new Date().toISOString(),
            streamOperation: true,
            ...schemaInfo,
            ...metadata
          },
          spanId
        );
      }
    } catch (error) {
      console.error('Error creating telemetry for object streaming:', error);
    }
  }

  // Configure AI SDK's built-in telemetry
  const telemetryOptions = getAITelemetryOptions(
    opName,
    effectiveTraceId,
    {
      ...metadata,
      promptTokens: promptTokenCount,
      modelId: modelName,
      timestamp: new Date().toISOString(),
      parentSpanId: spanId || parentSpanId,
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
      if (effectiveTraceId && telemetry.isEnabled && telemetry.langfuse) {
        try {
          if (traceManager && spanId) {
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
            
            // End the streaming span
            traceManager.endSpan(spanId, finalObject, {
              promptTokens: promptTokenCount,
              completionTokens: finalCompletionTokenCount,
              totalTokens,
              status: 'success',
              streamingCompleted: true,
              completedAt: new Date().toISOString()
            });
            
            // TraceManager already updates trace token usage internally
          } else {
            // Legacy approach
            if (generation) {
              completeGeneration(
                generation,
                finalObject,
                {
                  promptTokens: promptTokenCount,
                  completionTokens: finalCompletionTokenCount,
                  totalTokens
                }
              );
            }

            if (spanId) {
              completeStreamingSpan(
                spanId,
                finalObject,
                {
                  promptTokens: promptTokenCount,
                  completionTokens: finalCompletionTokenCount,
                  totalTokens,
                  status: 'success',
                  completedAt: new Date().toISOString()
                }
              );
            }
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
      if (effectiveTraceId && telemetry.isEnabled && spanId) {
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
        
        if (traceManager) {
          // Use TraceManager to update metadata
          traceManager.updateTraceMetadata({
            streamingProgress: {
              ...progressData,
              timestamp: new Date().toISOString()
            }
          });
        } else {
          // Legacy approach
          recordStreamingProgress(
            spanId,
            effectiveTraceId,
            progressData,
            lastUpdate,
            500 // Update at most every 500ms
          );
        }
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
    if (effectiveTraceId && telemetry.isEnabled && telemetry.langfuse) {
      try {
        if (traceManager && spanId) {
          // End span with error using TraceManager
          traceManager.endSpan(spanId, { error: String(error) }, {
            status: 'error',
            error: String(error),
            completedAt: new Date().toISOString()
          });
          
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
        } else {
          // Legacy approach
          if (spanId) {
            completeStreamingSpan(
              spanId,
              { error: String(error) },
              {
                promptTokens: promptTokenCount,
                completionTokens: 0,
                totalTokens: promptTokenCount,
                status: 'error',
                error: String(error),
                completedAt: new Date().toISOString()
              }
            );
          }

          if (generation) {
            completeGeneration(
              generation,
              { error: String(error) },
              { promptTokens: promptTokenCount, completionTokens: 0, totalTokens: promptTokenCount }
            );
          }
        }
      } catch (telemetryError) {
        console.error('Error recording object streaming failure in telemetry:', telemetryError);
      }
    }

    // Re-throw the original error
    throw error;
  }
}