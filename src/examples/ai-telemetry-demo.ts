/**
 * Improved AI Telemetry Demo
 *
 * Demonstrates the use of the telemetry wrapper functions for AI SDK.
 */

import { model, shutdownTelemetry, createTraceManager } from '../ai';
import { generateTextWithTelemetry, generateObjectWithTelemetry } from '../ai/telemetry-wrappers';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {generateObject} from "ai";

async function runImprovedTelemetryDemo() {
  console.log('Starting Improved AI Telemetry Demo...');

  try {
    // Create a trace manager for this session
    const { traceManager, traceId } = createTraceManager('ai-telemetry-demo', {
      demoRun: true,
      timestamp: new Date().toISOString()
    });

    console.log(`Created trace: ${traceId}`);

    // 1. Simple text generation with telemetry
    const textSpanId = traceManager.startSpan('text-generation', {
      operation: 'generate-text',
      timestamp: new Date().toISOString()
    });

    const textPrompt = "Explain the benefits of AI telemetry systems in 3-4 sentences.";
    console.log(`\nGenerating text with prompt: "${textPrompt}"`);

    // Use the wrapper function directly
    const textResult = await generateTextWithTelemetry({
      model: model,
      prompt: textPrompt,
      // Telemetry options
      traceId: traceId,
      operationName: 'text-generation',
      parentSpanId: textSpanId,
      metadata: {
        requestId: uuidv4(),
        prompt: textPrompt
      }
    });

    console.log('\nGenerated Text:');
    console.log(textResult.text);

    // End the operation span
    traceManager.endSpan(textSpanId, {
      status: 'success',
      output: textResult.text,
      completedAt: new Date().toISOString()
    });

    // 2. Structured object generation with telemetry
    const objectSpanId = traceManager.startSpan('object-generation', {
      operation: 'generate-object',
      timestamp: new Date().toISOString()
    });

    // Define a schema for our object generation
    const recipeSchema = z.object({
      recipe: z.object({
        name: z.string(),
        difficulty: z.string(),
        preparationTime: z.string().describe('Preparation time in minutes'),
        ingredients: z.string(),
        steps: z.string()
      })
    });

    console.log('\nGenerating a structured recipe object...');

    // Use the wrapper function directly
    const objectResult = await generateObjectWithTelemetry({
      model: model,
      schema: recipeSchema,
      prompt: "Generate a simple pasta recipe with garlic and tomatoes.",
      // Telemetry options
      traceId: traceId,
      operationName: 'object-generation',
      parentSpanId: objectSpanId,
      metadata: {
        requestId: uuidv4(),
        schemaType: 'recipe'
      }
    });

    console.log('\nGenerated Recipe Object:');
    console.log(JSON.stringify(objectResult.object, null, 2));

    // End the operation span
    traceManager.endSpan(objectSpanId, {
      status: 'success',
      output: objectResult.object,
      completedAt: new Date().toISOString()
    });

    // Finish the trace
    await traceManager.finishTrace('success', {
      completedAt: new Date().toISOString()
    });

    console.log(`\nTrace ${traceId} completed successfully.`);
    console.log('Telemetry data has been sent to Langfuse.');

  } catch (error) {
    console.error('Error in AI Telemetry Demo:', error);
  } finally {
    // Always shut down telemetry to flush all pending events
    await shutdownTelemetry();
    console.log('Telemetry shut down. Demo complete.');
  }
}

// Run the demo if this file is executed directly
if (require.main === module) {
  runImprovedTelemetryDemo().catch(console.error);
}

export { runImprovedTelemetryDemo };