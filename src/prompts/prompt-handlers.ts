/**
 * AI 프롬프트 핸들러
 *
 * Langfuse의 getPrompt 함수를 사용하여 각 기능에 맞는 AI 호출 함수를 구현합니다.
 */

import * as path from 'path';
import { TraceManager, createTraceManager } from '../ai/telemetry';
import { config } from '../config';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { xai } from '@ai-sdk/xai';
import { LanguageModelV1 } from 'ai';
import { Langfuse, TextPromptClient } from 'langfuse';
import { generateTextWithTelemetry, streamTextWithTelemetry } from '../ai';
import { CoreMessage } from 'ai';
import { logger } from '../utils/logger';

// Langfuse 클라이언트 초기화
const langfuse = new Langfuse({
  publicKey: config.telemetry.langfuse.publicKey,
  secretKey: config.telemetry.langfuse.secretKey,
  baseUrl: config.telemetry.langfuse.baseUrl,
});

/**
 * Create model object based on provider and model name
 *
 * @param modelString Optional model string in format "provider:model"
 * @returns Model object for the AI SDK
 */
function createModelObject(modelString?: string): LanguageModelV1 {
  // Default to OpenAI if no model specified
  if (!modelString) {
    return openai(config.openai.model);
  }

  // Parse the model string to get provider and model name
  const [provider, modelName] = modelString.includes(':')
    ? modelString.split(':', 2)
    : ['openai', modelString];

  // provider가 반드시 존재하도록 처리
  const providerName = provider || 'openai';

  switch (providerName.toLowerCase()) {
    case 'openai':
      return openai(modelName || config.openai.model);
    case 'google':
      if (!config.google.apiKey) {
        logger.warn('Google API key not configured, falling back to OpenAI');
        return openai(config.openai.model);
      }
      return google(modelName || config.google.model);
    case 'xai':
      if (!config.grok.apiKey) {
        logger.warn('Grok API key not configured, falling back to OpenAI');
        return openai(config.openai.model);
      }
      return xai(modelName || config.grok.model);
    case 'anthropic':
      if (!config.anthropic.apiKey) {
        logger.warn('Anthropic API key not configured, falling back to OpenAI');
        return openai(config.openai.model);
      }
      return anthropic(modelName || config.anthropic.model);
    default:
      logger.warn(`Unknown model provider: ${provider}, falling back to OpenAI`);
      return openai(config.openai.model);
  }
}

/**
 * Langfuse 프롬프트 실행 함수
 * Langfuse에서 등록된 프롬프트를 가져와 실행합니다.
 *
 * @param traceManager 텔레메트리 추적 관리자
 * @param promptName Langfuse에 등록된 프롬프트 이름
 * @param variables 프롬프트에 주입할 변수들
 * @param operationName 텔레메트리에 기록될 작업 이름
 * @param temperature 생성 다양성 조절 (기본값: 0.7)
 * @param model 사용할 모델 (provider:model 형식, e.g. "openai:gpt-4o", "google:gemini-1.5-pro")
 * @param metadata 추가 메타데이터
 * @returns 생성된 텍스트 스트림
 */
export async function executePrompt(
  traceManager: TraceManager,
  promptName: string,
  variables: Record<string, any>,
  operationName: string,
  temperature: number = 0.7,
  model?: string,
  metadata: Record<string, any> = {}
): Promise<ReadableStream<string>> {
  try {
    const promptClient = await langfuse.getPrompt(promptName, undefined, {
      type: "chat"
    });

    // 채팅 메시지 배열로 컴파일
    const compiledMessages = promptClient.compile(variables) as CoreMessage[];

    const result = await streamTextWithTelemetry({
      model: createModelObject(model),
      messages: compiledMessages,
      traceManager,
      operationName,
      temperature,
      metadata: {
        ...metadata,
        modelString: model
      }
    });

    return result.textStream;
  } catch (error) {
    logger.error('프롬프트 가져오기 오류:', { error });
    throw error;
  }
}

/**
 * 직접 텍스트를 생성하는 스트림 함수
 *
 * @param traceManager 텔레메트리 추적 관리자
 * @param systemPrompt 시스템 프롬프트
 * @param userPrompt 사용자 프롬프트
 * @param operationName 작업 이름
 * @param model 사용할 모델 (provider:model 형식)
 * @param metadata 메타데이터
 * @returns 생성된 텍스트 스트림
 */
export async function streamGeneratedText(
  traceManager: TraceManager,
  systemPrompt: string,
  userPrompt: string,
  operationName: string,
  model?: string,
  metadata: Record<string, any> = {}
): Promise<ReadableStream<string>> {
  try {
    const messages: CoreMessage[] = [];

    if (systemPrompt) {
      messages.push({
        role: 'system',
        content: systemPrompt
      } as CoreMessage);
    }

    messages.push({
      role: 'user',
      content: userPrompt
    } as CoreMessage);

    const result = await streamTextWithTelemetry({
      model: createModelObject(model),
      messages,
      traceManager,
      operationName,
      metadata: {
        ...metadata,
        modelString: model
      }
    });

    return result.textStream;
  } catch (error) {
    logger.error('텍스트 생성 오류:', { error });
    throw error;
  }
}