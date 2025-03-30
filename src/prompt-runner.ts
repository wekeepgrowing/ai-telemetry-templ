/**
 * Dynamic Prompt Runner
 *
 * Receives JSON input via stdin with prompt name and variables,
 * executes the prompt using Langfuse, and streams the response to stdout.
 * All logs are directed to stderr.
 */

import * as readline from 'readline';
import { Readable } from 'stream';
import { z } from 'zod';
import { createTraceManager } from './ai/telemetry';
import { logger } from './utils/logger';
import { executePrompt, streamGeneratedText } from './prompts';

// Schema for the input JSON
const PromptRequestSchema = z.object({
  // Name of the prompt in Langfuse
  promptName: z.string(),

  // Variables to pass to the prompt
  variables: z.record(z.any()),

  // Optional temperature for generation
  temperature: z.number().optional().default(0.7),

  // Optional trace ID for telemetry
  traceId: z.string().optional(),

  // Optional operation name for telemetry
  operationName: z.string().optional(),

  // Optional system prompt for direct streaming (backwards compatibility)
  systemPrompt: z.string().optional(),

  // Optional model provider and name (e.g. "openai:gpt-4o", "google:gemini-1.5-pro", "grok:grok-1")
  model: z.string().optional(),

  // Optional user ID for Langfuse telemetry
  userId: z.string().optional(),

  // Optional session ID for Langfuse telemetry
  sessionId: z.string().optional()
});

type PromptRequest = z.infer<typeof PromptRequestSchema>;

/**
 * Stream data directly from a ReadableStream to stdout
 * @param stream The ReadableStream to pipe to stdout
 * @returns Promise that resolves when streaming is complete
 */
async function streamToStdout(stream: ReadableStream<any>): Promise<void> {
  const reader = stream.getReader();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Write the chunk directly to stdout
      process.stdout.write(value);
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Execute a prompt handler based on the request
 */
async function executePromptHandler(request: PromptRequest): Promise<void> {
  try {
    // Create a trace manager for telemetry
    const { traceManager, traceId } = createTraceManager(
      request.operationName || `prompt-${request.promptName}`,
      { promptName: request.promptName, ...request.variables },
      request.sessionId,
      request.userId,
      request.traceId
    );

    logger.debug(`Starting prompt handler: ${request.promptName}`, {
      traceId,
      variables: JSON.stringify(request.variables),
      model: request.model,
      userId: request.userId,
      sessionId: request.sessionId
    });

    let stream: ReadableStream<string>;

    // Handle direct streaming with system prompt (backwards compatibility)
    if (request.systemPrompt) {
      const userPrompt = typeof request.variables.userPrompt === 'string'
        ? request.variables.userPrompt
        : JSON.stringify(request.variables);

      stream = await streamGeneratedText(
        traceManager,
        request.systemPrompt,
        userPrompt,
        request.operationName || 'directStream',
        request.model,
        request.variables
      );
    } else {
      // Execute the Langfuse prompt
      stream = await executePrompt(
        traceManager,
        request.promptName,
        request.variables,
        request.operationName || `execute-${request.promptName}`,
        request.temperature,
        request.model,
        {
          model: request.model,
          ...request.variables,
          userId: request.userId,
          sessionId: request.sessionId
        }
      );
    }

    // Stream directly to stdout without converting to Node.js stream
    await streamToStdout(stream);

    // Finish the trace after streaming completes
    await traceManager.finishTrace('success');
  } catch (error) {
    logger.error('Error executing prompt handler:', { error });
    process.stderr.write(JSON.stringify({ error: String(error) }));
  }
}

/**
 * Process input from stdin
 */
function processStdin(): void {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr, // Use stderr for readline output
    terminal: false
  });

  // Set encoding to UTF-8
  process.stdin.setEncoding('utf8');

  logger.info('Waiting for JSON input on stdin...');

  let inputData = '';

  // Handle input data
  rl.on('line', (line) => {
    inputData += line;

    try {
      // Try to parse the JSON (this will throw if incomplete)
      const data = JSON.parse(inputData);

      // Validate the input against our schema
      const parseResult = PromptRequestSchema.safeParse(data);

      if (parseResult.success) {
        // Close the readline interface as we have valid input
        rl.close();

        // Execute the prompt handler
        executePromptHandler(parseResult.data).catch(error => {
          logger.error('Error in prompt execution:', { error });
          process.exit(1);
        });
      } else {
        // If validation failed, output errors to stderr
        logger.error('Invalid JSON format:', { errors: parseResult.error.format() });
        process.stderr.write(JSON.stringify({ errors: parseResult.error.format() }));
        rl.close();
        process.exit(1);
      }
    } catch (e) {
      // If JSON parsing fails, it might be incomplete - continue reading
      if (!(e instanceof SyntaxError)) {
        logger.error('Error parsing JSON input:', { error: e });
        process.stderr.write(JSON.stringify({ error: String(e) }));
        rl.close();
        process.exit(1);
      }
    }
  });

  // Handle end of input
  rl.on('close', () => {
    if (!inputData.trim()) {
      logger.error('No input received');
      process.stderr.write(JSON.stringify({ error: 'No input received' }));
      process.exit(1);
    }
  });
}

// Start processing if this is the main module
if (require.main === module) {
  processStdin();
}

// Export for external use
export { processStdin, executePromptHandler };