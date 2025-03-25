/**
 * AI Telemetry Service
 *
 * Provides centralized telemetry tracking for all AI operations
 * using Langfuse for observability and monitoring.
 */

import { v4 as uuidv4 } from 'uuid';
import { Langfuse } from "langfuse";

import { config } from '../config';
import { logger } from '../utils/logger';

// Maps to track active traces, spans, and generations
const activeTraces = new Map<string, boolean>();
const activeSpans = new Map<string, boolean>();
const activeGenerations = new Map<string, any>();

/**
 * Initialize OpenTelemetry SDK with Langfuse exporter
 */
export const initializeTelemetry = () => {
  if (!config.telemetry.enabled) {
    return {
      langfuse: null,
      isEnabled: false,
    };
  }

  try {
    // Only initialize if all required keys are present
    const publicKey = config.telemetry.langfuse.publicKey;
    const secretKey = config.telemetry.langfuse.secretKey;

    if (!publicKey || !secretKey) {
      logger.warn('Langfuse keys not configured. Telemetry disabled.');
      return {
        sdk: null,
        langfuse: null,
        isEnabled: false,
      };
    }

    // Initialize Langfuse client
    const langfuse = new Langfuse({
      publicKey,
      secretKey,
      baseUrl: config.telemetry.langfuse.baseUrl,
      debug: config.server.isDevelopment || process.env.LANGFUSE_DEBUG === 'true',
      flushAtExit: true,
    });

    logger.info('Langfuse telemetry initialized successfully');
    return {
      langfuse,
      isEnabled: true,
    };
  } catch (error) {
    logger.error('Failed to initialize telemetry:', { error });
    return {
      langfuse: null,
      isEnabled: false,
    };
  }
};

// Initialize telemetry once on module load
export const telemetry = initializeTelemetry();

/**
 * Extract token usage from telemetry spans if available
 *
 * @param spanData The span data from LangfuseExporter
 * @returns Token usage information or undefined if not available
 */
export function extractTokenUsageFromSpan(spanData: any): { promptTokens: number; completionTokens: number; totalTokens: number } | undefined {
  if (!spanData?.attributes) {
    return undefined;
  }

  const attrs = spanData.attributes;

  // Try to find token usage information in standard formats
  if (attrs['ai.usage.promptTokens'] !== undefined && attrs['ai.usage.completionTokens'] !== undefined) {
    return {
      promptTokens: attrs['ai.usage.promptTokens'],
      completionTokens: attrs['ai.usage.completionTokens'],
      totalTokens: attrs['ai.usage.promptTokens'] + attrs['ai.usage.completionTokens']
    };
  }

  // Try gen_ai format
  if (attrs['gen_ai.usage.prompt_tokens'] !== undefined && attrs['gen_ai.usage.completion_tokens'] !== undefined) {
    return {
      promptTokens: attrs['gen_ai.usage.prompt_tokens'],
      completionTokens: attrs['gen_ai.usage.completion_tokens'],
      totalTokens: attrs['gen_ai.usage.prompt_tokens'] + attrs['gen_ai.usage.completion_tokens']
    };
  }

  return undefined;
}

/**
 * TraceManager class for managing hierarchical traces and spans
 *
 * This class simplifies the process of creating and managing connected
 * traces, spans, and generations in a hierarchical structure.
 */
export class TraceManager {
  private traceId: string;
  private sessionId?: string;
  private userId?: string;
  private activeSpans: Map<string, any> = new Map();
  private activeGenerations: Map<string, any> = new Map();
  private defaultModel: string;
  // Store the LangfuseTraceClient for direct access
  private traceClient: any = null;

  /**
   * Create a new TraceManager
   *
   * @param name Name of the root trace
   * @param metadata Initial metadata for the trace
   * @param sessionId Optional session ID for the trace
   * @param userId Optional user ID for the trace
   * @param existingTraceId Optional existing trace ID to use instead of creating a new one
   */
  constructor(
    private name: string,
    private metadata: Record<string, any> = {},
    sessionId?: string,
    userId?: string,
    existingTraceId?: string
  ) {
    this.traceId = existingTraceId || uuidv4();
    this.sessionId = sessionId;
    this.userId = userId;
    this.defaultModel = config.openai.model;

    // Check for duplicate trace
    if (!existingTraceId && activeTraces.has(this.traceId)) {
      logger.warn(`Trace with ID ${this.traceId} already exists, reusing it`);
    } else {
      activeTraces.set(this.traceId, true);
    }

    // Only create root trace if we're not using an existing one
    if (!existingTraceId) {
      this.createRootTrace();
    } else if (telemetry.isEnabled && telemetry.langfuse) {
      // If using existing trace ID, get the trace client
      this.traceClient = telemetry.langfuse.trace({
        id: this.traceId
      });
    }
  }

  /**
   * Create the root trace for this tracking session
   *
   * @returns The trace ID
   */
  private createRootTrace(): string {
    if (!telemetry.isEnabled || !telemetry.langfuse) {
      return this.traceId;
    }

    try {
      logger.debug(`Creating root trace: ${this.traceId}, name: ${this.name}`);

      // Store the trace client for future updates
      this.traceClient = telemetry.langfuse.trace({
        id: this.traceId,
        name: this.name,
        metadata: {
          ...this.metadata,
          startTime: new Date().toISOString(),
          totalTokens: 0,
          tokenUsage: []
        },
        sessionId: this.sessionId,
        userId: this.userId
      });

      return this.traceId;
    } catch (error) {
      logger.error('Failed to create root trace:', { error });
      return this.traceId;
    }
  }

  /**
   * Get the trace ID for this manager
   *
   * @returns The trace ID
   */
  getTraceId(): string {
    return this.traceId;
  }

  /**
   * Start a new span under the root trace
   *
   * @param name Name of the span
   * @param metadata Additional metadata for the span
   * @param parentSpanId Optional parent span ID, if not provided, uses the root trace
   * @returns Span ID string
   */
  startSpan(
    name: string,
    metadata: Record<string, any> = {},
    parentSpanId?: string
  ): string {
    if (!telemetry.isEnabled || !telemetry.langfuse) {
      const spanId = uuidv4();
      this.activeSpans.set(spanId, { name });
      return spanId;
    }

    try {
      const spanId = uuidv4();

      // Check if span already exists
      if (activeSpans.has(spanId)) {
        logger.debug(`Span ${spanId} already exists, updating it`);

        const existingSpan = this.activeSpans.get(spanId);
        if (existingSpan && typeof existingSpan.update === 'function') {
          existingSpan.update({
            metadata: {
              ...metadata,
              updatedAt: new Date().toISOString(),
            }
          });
        }

        return spanId;
      }

      logger.debug(`Creating new span: ${spanId}, name: ${name}, traceId: ${this.traceId}`);

      const span = telemetry.langfuse.span({
        id: spanId,
        name,
        traceId: this.traceId,
        parentObservationId: parentSpanId,
        metadata: {
          ...metadata,
          startTime: new Date().toISOString(),
        }
      });

      activeSpans.set(spanId, true);
      this.activeSpans.set(spanId, span);
      return spanId;
    } catch (error) {
      logger.error(`Failed to start span "${name}":`, { error });
      const spanId = uuidv4();
      this.activeSpans.set(spanId, { name });
      return spanId;
    }
  }

  /**
   * End a span with output data
   *
   * @param spanId ID of the span to end
   * @param output Output data to add to the span
   * @param metadata Additional metadata for the end event
   * @returns True if successful
   */
  endSpan(
    spanId: string,
    output: any = null,
    metadata: Record<string, any> = {}
  ): boolean {
    if (!telemetry.isEnabled || !telemetry.langfuse) {
      this.activeSpans.delete(spanId);
      return false;
    }

    try {
      const span = this.activeSpans.get(spanId);
      if (!span) {
        logger.warn(`Attempted to end unknown span: ${spanId}`);
        return false;
      }

      logger.debug(`Ending span: ${spanId}`);

      if (typeof span.update === 'function') {
        // Update existing span using the client's update method
        span.update({
          output,
          metadata: {
            ...metadata,
            endTime: new Date().toISOString(),
          }
        });
      } else if (span.end && typeof span.end === 'function') {
        // End regular span
        span.end({
          output,
          metadata: {
            ...metadata,
            endTime: new Date().toISOString(),
          }
        });
      }

      this.activeSpans.delete(spanId);
      activeSpans.delete(spanId);
      return true;
    } catch (error) {
      logger.error(`Failed to end span ${spanId}:`, { error });
      this.activeSpans.delete(spanId);
      activeSpans.delete(spanId);
      return false;
    }
  }

  /**
   * Create a generation for tracking LLM usage within a span
   *
   * @param spanId Parent span ID
   * @param name Name of the generation
   * @param model Model being used (IMPORTANT: Always specify to avoid undefined model)
   * @param prompt Input prompt text
   * @param metadata Additional metadata
   * @returns Generation ID string
   */
  startGeneration(
    spanId: string,
    name: string,
    model: string = this.defaultModel,
    prompt: string,
    metadata: Record<string, any> = {}
  ): string {
    if (!telemetry.isEnabled || !telemetry.langfuse) {
      return uuidv4();
    }

    try {
      const genId = uuidv4();

      logger.debug(`Creating generation: ${genId}, name: ${name}, parentSpan: ${spanId}`);

      const generation = telemetry.langfuse.generation({
        id: genId,
        name,
        traceId: this.traceId,
        parentObservationId: spanId,
        model, // Explicitly set model
        input: { prompt },
        metadata: {
          ...metadata,
          modelId: model, // Duplicate to ensure it's available in metadata
          startTime: new Date().toISOString(),
        }
      });

      activeGenerations.set(genId, generation);
      this.activeGenerations.set(genId, generation);
      return genId;
    } catch (error) {
      logger.error(`Failed to start generation "${name}":`, { error });
      return uuidv4();
    }
  }

  /**
   * Complete a generation with output and usage data
   *
   * @param generationId ID of the generation
   * @param output Output data
   * @param usage Token usage information
   * @param metadata Additional metadata
   * @returns True if successful
   */
  endGeneration(
    generationId: string,
    output: any,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number },
    metadata: Record<string, any> = {}
  ): boolean {
    if (!telemetry.isEnabled || !telemetry.langfuse) {
      return false;
    }

    try {
      logger.debug(`Ending generation: ${generationId}`);

      const generation = this.activeGenerations.get(generationId);

      if (generation && typeof generation.update === 'function') {
        // Use the update method directly
        generation.update({
          output,
          usage,
          metadata: {
            ...metadata,
            endTime: new Date().toISOString(),
          }
        });
      } else {
        // Fallback to creating a temporary client
        telemetry.langfuse.generation({
          id: generationId,
          update: true,
          output,
          usage,
          metadata: {
            ...metadata,
            endTime: new Date().toISOString(),
          }
        });
      }

      // Update root trace with token usage
      this.updateTraceTokenUsage(generationId, usage);

      this.activeGenerations.delete(generationId);
      activeGenerations.delete(generationId);
      return true;
    } catch (error) {
      logger.error(`Failed to end generation ${generationId}:`, { error });
      this.activeGenerations.delete(generationId);
      activeGenerations.delete(generationId);
      return false;
    }
  }

  /**
   * Update trace token usage information
   *
   * @param generationId Generation ID for reference
   * @param usage Token usage data
   */
  private async updateTraceTokenUsage(
    generationId: string,
    usage: { promptTokens: number; completionTokens: number; totalTokens: number }
  ): Promise<void> {
    if (!telemetry.isEnabled || !telemetry.langfuse || !this.traceClient) {
      return;
    }

    try {
      // Create new usage data
      const newUsage = {
        generationId,
        promptTokens: usage.promptTokens,
        completionTokens: usage.completionTokens,
        totalTokens: usage.totalTokens,
        timestamp: new Date().toISOString()
      };

      // Use the stored traceClient to directly update the trace
      this.traceClient.update({
        metadata: {
          // Add this generation's token usage to the total trace tokens
          totalTokensIncrement: usage.totalTokens,
          // Add the new token usage data to the array
          newTokenUsage: newUsage
        }
      });
    } catch (error) {
      logger.error(`Failed to update trace token usage:`, { error });
    }
  }

  /**
   * Update trace metadata
   *
   * @param metadata Metadata to update or add
   * @returns True if successful
   */
  async updateTraceMetadata(metadata: Record<string, any>): Promise<boolean> {
    if (!telemetry.isEnabled || !telemetry.langfuse || !this.traceClient) {
      return false;
    }

    try {
      // Use the stored traceClient to directly update the trace
      this.traceClient.update({
        metadata: {
          ...metadata,
          updatedAt: new Date().toISOString()
        }
      });

      return true;
    } catch (error) {
      logger.error(`Failed to update trace metadata:`, { error });
      return false;
    }
  }

  /**
   * Finish the trace by marking it as complete
   *
   * @param status Status of the trace (success, error)
   * @param finalMetadata Final metadata for the trace
   */
  async finishTrace(
    status: 'success' | 'error' = 'success',
    finalMetadata: Record<string, any> = {}
  ): Promise<void> {
    // End any remaining active spans
    for (const [spanId, span] of this.activeSpans.entries()) {
      this.endSpan(spanId, null, { earlyTermination: true });
    }

    // End any remaining active generations
    for (const [genId, gen] of this.activeGenerations.entries()) {
      try {
        this.endGeneration(genId, { earlyTermination: true }, { promptTokens: 0, completionTokens: 0, totalTokens: 0 });
      } catch (error) {
        logger.error(`Failed to end generation ${genId} during trace finish:`, { error });
      }
    }

    if (!telemetry.isEnabled || !telemetry.langfuse || !this.traceClient) {
      return;
    }

    try {
      logger.debug(`Finishing trace: ${this.traceId}, status: ${status}`);

      // Update the trace client directly
      this.traceClient.update({
        status,
        metadata: {
          ...finalMetadata,
          completedAt: new Date().toISOString()
        }
      });

      await telemetry.langfuse.flushAsync();
      activeTraces.delete(this.traceId);
    } catch (error) {
      logger.error(`Failed to finish trace:`, { error });
      activeTraces.delete(this.traceId);
    }
  }
}

/**
 * Create a research trace manager
 *
 * @param name Name of the trace
 * @param metadata Additional metadata for the trace
 * @param sessionId Optional session ID
 * @param userId Optional user ID
 * @param parentTraceId Optional parent trace ID (if this should be a span instead of root trace)
 * @returns Object containing the trace manager and trace ID
 */
export const createTraceManager = (
  name: string,
  metadata?: Record<string, any>,
  sessionId?: string,
  userId?: string,
  parentTraceId?: string
): { traceManager: TraceManager; traceId: string } => {
  const traceManager = new TraceManager(
    name,
    metadata,
    sessionId,
    userId,
    parentTraceId
  );
  return {
    traceManager,
    traceId: traceManager.getTraceId()
  };
};

/**
 * Get telemetry options for AI operations
 *
 * @param operationName Name of the AI operation
 * @param traceId Parent trace ID to link this operation to
 * @param metadata Additional metadata for the operation
 * @returns Telemetry configuration options
 */
export const getAITelemetryOptions = (
  operationName: string,
  traceId?: string,
  metadata?: Record<string, any>
) => {
  if (!telemetry.isEnabled) {
    return { isEnabled: false };
  }

  const functionId = `${operationName}-${uuidv4().slice(0, 8)}`;

  return {
    isEnabled: true,
    functionId,
    recordInputs: true,
    recordOutputs: true,
    metadata: {
      ...metadata,
      operationId: functionId,
      ...(traceId ? { langfuseTraceId: traceId, langfuseUpdateParent: true } : {}),
    },
  };
};

/**
 * Create a generation directly (for backward compatibility)
 */
export const createGeneration = (
  traceId: string,
  model: string,
  prompt: string,
  metadata?: Record<string, any>,
  parentObservationId?: string
) => {
  if (!telemetry.isEnabled || !telemetry.langfuse) {
    return null;
  }

  try {
    const genId = uuidv4();
    logger.debug(`Creating generation: ${genId}, model: ${model}, parentSpan: ${parentObservationId}`);

    // Prevent duplicate generation creation
    if (activeGenerations.has(genId)) {
      logger.warn(`Generation with ID ${genId} already exists, skipping creation`);
      return null;
    }

    const generation = telemetry.langfuse.generation({
      id: genId,
      name: `${model}-generation`,
      traceId: traceId,
      model: model,
      input: { prompt },
      parentObservationId: parentObservationId,
      metadata: {
        ...metadata,
        modelId: model, // Ensure model ID is in metadata
        timestamp: new Date().toISOString(),
      },
    });

    activeGenerations.set(genId, generation);
    return generation;
  } catch (error) {
    logger.error('Failed to create generation:', { error });
    return null;
  }
};

/**
 * Complete a generation (for backward compatibility)
 */
export const completeGeneration = (
  generation: any,
  output: any,
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
) => {
  if (!generation) {
    return null;
  }

  try {
    logger.debug(`Completing generation: ${generation.id}`);

    // Determine if generation is a client object or just has an ID
    if (typeof generation.update === 'function') {
      // Client object with update method
      generation.update({
        output: output,
        usage: {
          promptTokens: tokenUsage.promptTokens,
          completionTokens: tokenUsage.completionTokens,
          totalTokens: tokenUsage.totalTokens,
        },
      });
    } else if (generation.end && typeof generation.end === 'function') {
      // Client object with end method
      generation.end({
        output: output,
        usage: {
          promptTokens: tokenUsage.promptTokens,
          completionTokens: tokenUsage.completionTokens,
          totalTokens: tokenUsage.totalTokens,
        },
      });
    } else if (generation.id) {
      // Just has an ID, create a new client
      telemetry.langfuse.generation({
        id: generation.id,
        update: true,
        output: output,
        usage: {
          promptTokens: tokenUsage.promptTokens,
          completionTokens: tokenUsage.completionTokens,
          totalTokens: tokenUsage.totalTokens,
        },
      });
    }

    if (generation.id) {
      activeGenerations.delete(generation.id);
    }
    return generation;
  } catch (error) {
    logger.error('Failed to complete generation:', { error });
    if (generation && generation.id) {
      activeGenerations.delete(generation.id);
    }
    return null;
  }
};

/**
 * Updates a trace with token usage information - revised to use TraceManager
 *
 * @param traceId The trace ID to update
 * @param operationName The name of the operation
 * @param tokenUsage Token usage information
 */
export async function updateTraceWithTokenUsage(
  traceId: string,
  operationName: string,
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number }
): Promise<void> {
  if (!telemetry.isEnabled || !telemetry.langfuse) {
    return;
  }

  try {
    // Create a temporary trace client to update the trace
    const tempTraceClient = telemetry.langfuse.trace({
      id: traceId,
    });

    if (tempTraceClient) {
      // Create new usage data
      const newUsage = {
        operation: operationName,
        promptTokens: tokenUsage.promptTokens,
        completionTokens: tokenUsage.completionTokens,
        totalTokens: tokenUsage.totalTokens,
        timestamp: new Date().toISOString()
      };

      // Update the trace
      tempTraceClient.update({
        metadata: {
          totalTokensIncrement: tokenUsage.totalTokens,
          newTokenUsage: newUsage
        }
      });
    }
  } catch (error) {
    logger.error(`Error updating trace with token usage:`, { error });
  }
}

/**
 * Create a span specifically for streaming operations
 *
 * @param traceId Parent trace ID
 * @param name Name of the span
 * @param metadata Additional metadata
 * @param parentSpanId Optional parent span ID
 * @returns Span ID string
 */
export function createStreamingSpan(
  traceId: string,
  name: string,
  metadata: Record<string, any> = {},
  parentSpanId?: string
): string | null {
  if (!telemetry.isEnabled || !telemetry.langfuse) {
    return null;
  }

  try {
    const spanId = uuidv4();

    logger.debug(`Creating streaming span: ${spanId}, name: ${name}, traceId: ${traceId}`);

    const span = telemetry.langfuse.span({
      id: spanId,
      name: `streaming-${name}`,
      traceId: traceId,
      parentObservationId: parentSpanId,
      metadata: {
        ...metadata,
        streamingOperation: true,
        startTime: new Date().toISOString(),
      }
    });

    activeSpans.set(spanId, span);
    return spanId;
  } catch (error) {
    logger.error(`Failed to create streaming span "${name}":`, { error });
    return null;
  }
}

/**
 * Update a streaming span with progress information
 *
 * @param spanId ID of the span to update
 * @param progressData Progress information
 * @returns True if successful
 */
export function updateStreamingTelemetry(
  spanId: string,
  progressData: Record<string, any>
): boolean {
  if (!telemetry.isEnabled || !telemetry.langfuse || !spanId) {
    return false;
  }

  try {
    // Check if we have the span cached
    const existingSpan = activeSpans.get(spanId);
    if (existingSpan && typeof existingSpan.update === 'function') {
      // Use the existing client
      existingSpan.update({
        metadata: {
          ...progressData,
          updatedAt: new Date().toISOString(),
        }
      });
    } else {
      // Create a temporary span client to update
      const spanClient = telemetry.langfuse.span({
        id: spanId,
      });

      if (spanClient) {
        spanClient.update({
          metadata: {
            ...progressData,
            updatedAt: new Date().toISOString(),
          }
        });
      }
    }

    return true;
  } catch (error) {
    logger.error(`Failed to update streaming span ${spanId}:`, { error });
    return false;
  }
}

/**
 * Complete a streaming span with output data
 *
 * @param spanId ID of the span to complete
 * @param output Output data to add to the span
 * @param metadata Additional metadata for completion
 * @returns True if successful
 */
export function completeStreamingSpan(
  spanId: string,
  output: any = null,
  metadata: Record<string, any> = {}
): boolean {
  if (!telemetry.isEnabled || !telemetry.langfuse || !spanId) {
    return false;
  }

  try {
    logger.debug(`Completing streaming span: ${spanId}`);

    // Check if we have the span cached
    const existingSpan = activeSpans.get(spanId);
    if (existingSpan && typeof existingSpan.update === 'function') {
      // Use the existing client
      existingSpan.update({
        metadata: {
          ...metadata,
          output: typeof output === 'object' ? JSON.stringify(output) : output,
          streamingCompleted: true,
          endTime: new Date().toISOString(),
        }
      });
    } else {
      // Create a temporary span client to update
      const spanClient = telemetry.langfuse.span({
        id: spanId,
      });

      if (spanClient) {
        spanClient.update({
          metadata: {
            ...metadata,
            output: typeof output === 'object' ? JSON.stringify(output) : output,
            streamingCompleted: true,
            endTime: new Date().toISOString(),
          }
        });
      }
    }

    activeSpans.delete(spanId);
    return true;
  } catch (error) {
    logger.error(`Failed to complete streaming span ${spanId}:`, { error });
    activeSpans.delete(spanId);
    return false;
  }
}

/**
 * Record streaming progress in telemetry at appropriate intervals
 *
 * @param spanId ID of the streaming span to update
 * @param traceId ID of the trace for this operation
 * @param progressData Current progress data
 * @param lastUpdate Reference to last update timestamp
 * @param updateInterval Minimum interval between updates in ms
 * @returns Whether an update was performed
 */
export function recordStreamingProgress(
  spanId: string | null,
  traceId: string | null,
  progressData: Record<string, any>,
  lastUpdate: { timestamp: number },
  updateInterval: number = 500
): boolean {
  if (!telemetry.isEnabled || !telemetry.langfuse || (!spanId && !traceId)) {
    return false;
  }

  const now = Date.now();
  if (now - lastUpdate.timestamp < updateInterval) {
    return false;
  }

  try {
    // Update span if available
    if (spanId) {
      updateStreamingTelemetry(spanId, {
        ...progressData,
        streamProgress: 'in-progress',
        updateTimestamp: new Date().toISOString()
      });
    }

    // Update trace if available
    if (traceId) {
      // Check if we have the trace client cached
      const traceClient = telemetry.langfuse.trace({
        id: traceId,
      });

      if (traceClient) {
        traceClient.update({
          metadata: {
            streamingProgress: {
              ...progressData,
              timestamp: new Date().toISOString()
            }
          }
        });
      }
    }

    lastUpdate.timestamp = now;
    return true;
  } catch (error) {
    logger.error('Error recording streaming progress:', { error });
    return false;
  }
}

/**
 * Clean up telemetry resources
 * This should be called during application shutdown
 */
export const shutdownTelemetry = async () => {
  if (telemetry.isEnabled) {
    if (telemetry.langfuse) {
      try {
        await telemetry.langfuse.flushAsync();
        logger.info('Langfuse data flushed successfully');
      } catch (error) {
        logger.error('Error flushing Langfuse data:', { error });
      }
    }
  }

  // Clear trace, span, generation maps
  activeTraces.clear();
  activeSpans.clear();
  activeGenerations.clear();
};