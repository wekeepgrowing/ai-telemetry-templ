/**
 * AI SDK Telemetry Wrappers
 *
 * Provides wrappers around Vercel AI SDK functions with integrated
 * Langfuse telemetry tracking. Maintains the original function interfaces
 * while adding comprehensive telemetry.
 */

import { generateText, generateObject } from 'ai';
import { config } from '../config';
import {
  telemetry,
  createGeneration,
  completeGeneration,
  getAITelemetryOptions
} from './telemetry';
import { countTokens, countTokensForModel } from './tokenizer';

// Telemetry-specific parameters that can be added to AI SDK function calls
export interface TelemetryParams {
  /**
   * Trace ID to associate this operation with
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
 * Updates a trace with token usage information
 *
 * @param traceId The trace ID to update
 * @param operationName The name of the operation
 * @param tokenUsage Token usage information
 */
async function updateTraceWithTokenUsage(
  traceId: string,
  operationName: string,
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
): Promise<void> {
  if (!telemetry.isEnabled || !telemetry.langfuse) {
    return;
  }

  try {
    // Get existing trace data if available
    let traceData;
    try {
      traceData = await telemetry.langfuse.fetchTrace(traceId);
    } catch (fetchError) {
      console.error(`Error fetching trace: ${fetchError}`);
      return;
    }

    // Current total tokens in the trace
    const currentTotalTokens = traceData?.data?.metadata?.totalTokens || 0;

    // Update trace with token usage
    await telemetry.langfuse.trace({
      id: traceId,
      update: true,
      metadata: {
        totalTokens: currentTotalTokens + tokenUsage.totalTokens,
        tokenUsage: [
          ...(traceData?.data?.metadata?.tokenUsage || []),
          {
            operation: operationName,
            promptTokens: tokenUsage.promptTokens,
            completionTokens: tokenUsage.completionTokens,
            totalTokens: tokenUsage.totalTokens,
            timestamp: new Date().toISOString()
          }
        ]
      }
    });
  } catch (error) {
    console.error(`Error updating trace with token usage: ${error}`);
  }
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
  const { traceId, operationName, parentSpanId, metadata, ...aiParams } = params;

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

  if (traceId && telemetry.isEnabled && telemetry.langfuse) {
    try {
      generation = createGeneration(
        traceId,
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
    } catch (error) {
      console.error('Error creating telemetry generation:', error);
    }
  }

  // Configure AI SDK's built-in telemetry
  const telemetryOptions = getAITelemetryOptions(
    opName,
    traceId,
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
    if (generation) {
      try {
        // Extract token usage information
        const tokenUsage = result.usage;

        // Update the Langfuse generation
        completeGeneration(generation, result.text, tokenUsage);

        // Update trace with token usage if available
        if (traceId && telemetry.isEnabled && telemetry.langfuse) {
          try {
            await updateTraceWithTokenUsage(
              traceId,
              opName,
              tokenUsage
            );
          } catch (updateError) {
            console.error(`Error updating trace with token usage: ${updateError}`);
          }
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
    if (generation) {
      try {
        completeGeneration(
          generation,
          { error: String(error) },
          { promptTokens: promptTokenCount, completionTokens: 0, totalTokens: promptTokenCount }
        );
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
  const { traceId, operationName, parentSpanId, metadata, ...aiParams } = params;

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

  if (traceId && telemetry.isEnabled && telemetry.langfuse) {
    try {
      generation = createGeneration(
        traceId,
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
    } catch (error) {
      console.error('Error creating telemetry generation:', error);
    }
  }

  // Configure AI SDK's built-in telemetry
  const telemetryOptions = getAITelemetryOptions(
    opName,
    traceId,
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
    if (generation) {
      try {
        // Extract token usage information
        const tokenUsage = result.usage;

        // Update the Langfuse generation
        completeGeneration(generation, result.object, tokenUsage);

        // Update trace with token usage if available
        if (traceId && telemetry.isEnabled && telemetry.langfuse) {
          try {
            await updateTraceWithTokenUsage(
              traceId,
              opName,
              tokenUsage
            );
          } catch (updateError) {
            console.error(`Error updating trace with token usage: ${updateError}`);
          }
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
    if (generation) {
      try {
        completeGeneration(
          generation,
          { error: String(error) },
          { promptTokens: promptTokenCount, completionTokens: 0, totalTokens: promptTokenCount }
        );
      } catch (telemetryError) {
        console.error('Error recording failure in telemetry:', telemetryError);
      }
    }

    // Re-throw the original error
    throw error;
  }
}