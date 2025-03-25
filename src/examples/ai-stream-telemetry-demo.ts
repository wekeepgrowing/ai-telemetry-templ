/**
 * AI Stream Telemetry Demo
 *
 * Demonstrates the use of telemetry wrapper functions for AI streaming.
 */

import { anthropic } from '@ai-sdk/anthropic'
import { createTraceManager, shutdownTelemetry } from '../ai';
import { streamTextWithTelemetry, streamObjectWithTelemetry } from '../ai/telemetry-wrappers';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

async function runStreamExample() {
  logger.info('Running text stream example...');

  // Create a trace for this example
  const { traceManager, traceId } = createTraceManager('stream-telemetry-demo', {
    demoRun: true,
    timestamp: new Date().toISOString()
  });

  logger.info(`Created trace: ${traceId}`);

  // Create a span for the text streaming operation
  const textStreamingSpanId = traceManager.startSpan('text-streaming-test', {
    operation: 'stream-text',
    timestamp: new Date().toISOString()
  });

  const textPrompt = "Write a short story about an AI assistant who helps a programmer debug their code. Make it funny.";
  logger.info(`Streaming text with prompt: "${textPrompt}"`);

  try {
    // Use the wrapper function for streaming text
    const textResult = await streamTextWithTelemetry({
      model: anthropic("claude-3-5-haiku-latest"),
      prompt: textPrompt,
      // Telemetry options
      traceId: traceId,
      operationName: 'text-streaming-example',
      parentSpanId: textStreamingSpanId,
      metadata: {
        requestId: uuidv4(),
        prompt: textPrompt
      }
    });

    logger.info('Streaming text chunks:');

    let fullText = '';
    for await (const chunk of textResult.textStream) {
      process.stdout.write(chunk);
      fullText += chunk;
    }

    logger.info(`\nFinal text length: ${fullText.length}`);

    // End the streaming span
    traceManager.endSpan(textStreamingSpanId, {
      status: 'success',
      output: fullText,
      completedAt: new Date().toISOString()
    });

    // Now demonstrate object streaming
    logger.info('Running object stream example...');

    // Create a span for the object streaming operation
    const objectStreamingSpanId = traceManager.startSpan('object-streaming-test', {
      operation: 'stream-object',
      timestamp: new Date().toISOString()
    });

    // Define a schema for object streaming
    const storySchema = z.object({
      story: z.object({
        title: z.string(),
        genre: z.string(),
        characters: z.array(z.object({
          name: z.string(),
          role: z.string(),
          description: z.string().optional()
        })),
        setting: z.string(),
        plot: z.string()
      })
    });

    logger.info('Streaming a structured story object...');

    // Use the wrapper function for streaming objects
    const objectResult = await streamObjectWithTelemetry({
      model: anthropic("claude-3-5-haiku-latest"),
      schema: storySchema,
      prompt: "Generate a short story about debugging an AI model.",
      // Telemetry options
      traceId: traceId,
      operationName: 'object-streaming-example',
      parentSpanId: objectStreamingSpanId,
      metadata: {
        requestId: uuidv4(),
        schemaType: 'story'
      }
    });

    logger.info('Streaming object updates:');

    for await (const partialObject of objectResult.partialObjectStream) {
      // Clear console and show latest object state
      console.clear();
      console.log(JSON.stringify(partialObject, null, 2));
    }

    logger.info('Final object result:');
    const finalObject = await objectResult.object;
    logger.debug(JSON.stringify(finalObject, null, 2));

    // End the streaming span
    traceManager.endSpan(objectStreamingSpanId, {
      status: 'success',
      output: finalObject,
      completedAt: new Date().toISOString()
    });

    // Finish the trace
    await traceManager.finishTrace('success', {
      completedAt: new Date().toISOString()
    });

    logger.info(`Trace ${traceId} completed successfully.`);
    logger.info('Telemetry data has been sent to Langfuse.');

  } catch (error) {
    logger.error('Error in streaming examples:', { error });

    // End spans in case of error
    traceManager.endSpan(textStreamingSpanId, {
      status: 'error',
      error: String(error),
      completedAt: new Date().toISOString()
    });

    // Finish the trace with error
    await traceManager.finishTrace('error', {
      error: String(error),
      completedAt: new Date().toISOString()
    });
  } finally {
    // Always shut down telemetry to flush all pending events
    await shutdownTelemetry();
    logger.info('Telemetry shut down. Stream example complete.');
  }
}

// Run both examples if this file is executed directly
if (require.main === module) {
  // Choose which example to run, or run both
  const exampleType = process.argv[2] || 'both';

  if (exampleType === 'console' || exampleType === 'both') {
    runStreamExample().catch(error => logger.error('Uncaught error:', { error }));
  }
}

export { runStreamExample };