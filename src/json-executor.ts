#!/usr/bin/env node
/**
 * JSON Prompt Executor
 * 
 * Main entry point for the Langfuse prompt execution system.
 * Reads JSON from stdin, executes the Langfuse prompt, and streams results to stdout.
 */

import { processStdin } from './prompt-runner';
import { logger } from './utils/logger';

// Log startup information to stderr
logger.info('AI Prompt Executor Starting...');
logger.info('Ready to accept JSON input from stdin');
logger.info('Format: {"promptName": "langfusePromptName", "variables": {...}, "temperature": 0.7, "model": "provider:model"}');
logger.info('Supported model providers: openai, google, grok');
logger.info('Examples: "openai:gpt-4o", "google:gemini-1.5-pro", "grok:grok-1"');

// Start processing stdin
processStdin();

// Handle process termination
process.on('SIGINT', () => {
  logger.info('Process interrupted');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Process terminated');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', { error });
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection:', { reason });
  process.exit(1);
});