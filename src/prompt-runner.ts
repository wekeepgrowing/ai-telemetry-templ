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
import { executePrompt, streamGeneratedText } from './prompts/prompt-handlers';

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
  model: z.string().optional()
});

type PromptRequest = z.infer<typeof PromptRequestSchema>;

/**
 * Convert a ReadableStream to a Node.js readable stream
 */
function convertReadableStreamToNodeStream(readableStream: ReadableStream): Readable {
  const nodeStream = new Readable({
    read() {} // No-op implementation required
  });

  const reader = readableStream.getReader();
  
  // Pump the ReadableStream into the Node.js Readable
  function pump() {
    reader.read().then(({ done, value }) => {
      if (done) {
        nodeStream.push(null); // Signal end of stream
        return;
      }
      
      nodeStream.push(value);
      pump();
    }).catch(err => {
      logger.error('Error reading from stream:', { error: err });
      nodeStream.emit('error', err);
    });
  }
  
  pump();
  return nodeStream;
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
      undefined,
      undefined,
      request.traceId
    );
    
    logger.debug(`Starting prompt handler: ${request.promptName}`, {
      traceId,
      variables: JSON.stringify(request.variables),
      model: request.model
    });
    
    // Handle direct streaming with system prompt (backwards compatibility)
    if (request.systemPrompt) {
      const userPrompt = typeof request.variables.userPrompt === 'string' 
        ? request.variables.userPrompt 
        : JSON.stringify(request.variables);
      
      const stream = await streamGeneratedText(
        traceManager,
        request.systemPrompt,
        userPrompt,
        request.operationName || 'directStream',
        request.model,
        request.variables
      );
      
      // Convert ReadableStream to Node.js Readable and pipe to stdout
      const nodeStream = convertReadableStreamToNodeStream(stream);
      nodeStream.pipe(process.stdout);
      
      // Wait for stream to end before finishing the trace
      nodeStream.on('end', async () => {
        await traceManager.finishTrace('success');
      });
      
      nodeStream.on('error', async (err) => {
        logger.error('Stream error:', { error: err });
        await traceManager.finishTrace('error', { error: String(err) });
      });
      
      return;
    }
    
    // Execute the Langfuse prompt
    const stream = await executePrompt(
      traceManager,
      request.promptName,
      request.variables,
      request.operationName || `execute-${request.promptName}`,
      request.temperature,
      request.model,
      { model: request.model, ...request.variables }
    );
    
    // Convert ReadableStream to Node.js Readable and pipe to stdout
    const nodeStream = convertReadableStreamToNodeStream(stream);
    nodeStream.pipe(process.stdout);
    
    // Wait for stream to end before finishing the trace
    nodeStream.on('end', async () => {
      await traceManager.finishTrace('success');
    });
    
    nodeStream.on('error', async (err) => {
      logger.error('Stream error:', { error: err });
      await traceManager.finishTrace('error', { error: String(err) });
    });
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