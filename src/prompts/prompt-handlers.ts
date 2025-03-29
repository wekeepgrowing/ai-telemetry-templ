/**
 * AI 프롬프트 핸들러
 * 
 * Langfuse의 getPrompt 함수를 사용하여 각 기능에 맞는 AI 호출 함수를 구현합니다.
 */

import * as path from 'path';
import { TraceManager, createTraceManager } from '../ai/telemetry';
import { config } from '../config';
import { openai } from '@ai-sdk/openai';
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
 * OpenAI 모델 객체를 생성합니다.
 */
function createModelObject() {
  // OpenAI의 API를 사용하여 모델 객체 생성
  return openai("gpt-4o");
}

/**
 * 역할 생성 함수
 * prompts/role 디렉토리의 프롬프트를 사용합니다.
 */
export async function generateRole(
  traceManager: TraceManager,
  toDoList: string,
  targetTask: string
): Promise<string> {
  try {
    // getPrompt에 타입을 명시적으로 전달
    const promptClient = await langfuse.getPrompt('semo-expert-system-prompt', undefined, {
      type: "chat"
    });
    
    const variables = {
      ToDoList: toDoList, 
      TargetTask: targetTask
    };
    
    // 채팅 메시지 배열로 컴파일
    const compiledMessages = promptClient.compile(variables) as CoreMessage[];
    
    const response = await generateTextWithTelemetry({
      model: createModelObject(),
      messages: compiledMessages,
      traceManager,
      operationName: 'generateRole',
      temperature: 0.7,
      metadata: {
        toDoList,
        targetTask
      }
    });
    
    return response.text;
  } catch (error) {
    logger.error('프롬프트 가져오기 오류:', { error });
    throw error;
  }
}

/**
 * 하위 작업 필요성 평가 함수
 * prompts/need-subtask 디렉토리의 프롬프트를 사용합니다.
 */
export async function needSubtask(
  traceManager: TraceManager,
  toDoList: string,
  targetTask: string,
  roleMessage: string
): Promise<boolean> {
  try {
    const promptClient = await langfuse.getPrompt('semo-detailed-document-of-todo', undefined, {
      type: "chat"
    });
    
    const variables = {
      ToDoList: toDoList, 
      TargetTask: targetTask,
      RoleMessage: roleMessage
    };
    
    // 채팅 메시지 배열로 컴파일
    const compiledMessages = promptClient.compile(variables) as CoreMessage[];
    
    const response = await generateTextWithTelemetry({
      model: createModelObject(),
      messages: compiledMessages,
      traceManager,
      operationName: 'needSubtask',
      temperature: 0.3,
      metadata: {
        toDoList,
        targetTask,
        roleMessage
      }
    });
    
    // 응답에서 <|true|> 또는 <|false|> 패턴을 찾습니다
    return response.text.includes('<|true|>');
  } catch (error) {
    logger.error('프롬프트 가져오기 오류:', { error });
    return false;
  }
}

/**
 * 질문 이해 함수
 * prompts/understand-question 디렉토리의 프롬프트를 사용합니다.
 */
export async function understandQuestion(
  traceManager: TraceManager,
  question: string,
  answer: string
): Promise<string> {
  try {
    const promptClient = await langfuse.getPrompt('semo-question-with-think', undefined, {
      type: "chat"
    });
    
    const variables = {
      Question: question, 
      Answer: answer 
    };
    
    // 채팅 메시지 배열로 컴파일
    const compiledMessages = promptClient.compile(variables) as CoreMessage[];
    
    const response = await generateTextWithTelemetry({
      model: createModelObject(),
      messages: compiledMessages,
      traceManager,
      operationName: 'understandQuestion',
      temperature: 0.3,
      metadata: {
        question,
        answer
      }
    });
    
    return response.text;
  } catch (error) {
    logger.error('프롬프트 가져오기 오류:', { error });
    throw error;
  }
}

/**
 * 사전 질문 생성 함수
 * prompts/pre-question 디렉토리의 프롬프트를 사용합니다.
 */
export async function generatePreQuestion(
  traceManager: TraceManager,
  userInput: string
): Promise<string> {
  try {
    const promptClient = await langfuse.getPrompt('semo-question-with-think', undefined, {
      type: "chat"
    });
    
    const variables = { 
      UserInput: userInput
    };
    
    // 채팅 메시지 배열로 컴파일
    const compiledMessages = promptClient.compile(variables) as CoreMessage[];
    
    const response = await generateTextWithTelemetry({
      model: createModelObject(),
      messages: compiledMessages,
      traceManager,
      operationName: 'generatePreQuestion',
      temperature: 0.7,
      metadata: {
        userInput
      }
    });
    
    return response.text;
  } catch (error) {
    logger.error('프롬프트 가져오기 오류:', { error });
    throw error;
  }
}

/**
 * 하위 작업 생성 함수
 * prompts/subtask 디렉토리의 프롬프트를 사용합니다.
 */
export async function generateSubtask(
  traceManager: TraceManager,
  toDoList: string,
  targetTask: string,
  roleMessage: string
): Promise<string> {
  try {
    const promptClient = await langfuse.getPrompt('semo-detailed-document-of-todo', undefined, {
      type: "chat"
    });
    
    const variables = { 
      ToDoList: toDoList, 
      TargetTask: targetTask,
      RoleMessage: roleMessage
    };
    
    // 채팅 메시지 배열로 컴파일
    const compiledMessages = promptClient.compile(variables) as CoreMessage[];
    
    const response = await generateTextWithTelemetry({
      model: createModelObject(),
      messages: compiledMessages,
      traceManager,
      operationName: 'generateSubtask',
      temperature: 0.7,
      metadata: {
        toDoList,
        targetTask,
        roleMessage
      }
    });
    
    return response.text;
  } catch (error) {
    logger.error('프롬프트 가져오기 오류:', { error });
    throw error;
  }
}

/**
 * 작업 의존성 분석 함수
 * prompts/task-dependency 디렉토리의 프롬프트를 사용합니다.
 */
export async function analyzeTaskDependency(
  traceManager: TraceManager,
  taskList: string
): Promise<string> {
  try {
    const promptClient = await langfuse.getPrompt('semo-generate-dependency', undefined, {
      type: "chat"
    });
    
    const variables = {
      TaskList: taskList
    };
    
    // 채팅 메시지 배열로 컴파일
    const compiledMessages = promptClient.compile(variables) as CoreMessage[];
    
    const response = await generateTextWithTelemetry({
      model: createModelObject(),
      messages: compiledMessages,
      traceManager,
      operationName: 'analyzeTaskDependency',
      temperature: 0.5,
      metadata: {
        taskList
      }
    });
    
    return response.text;
  } catch (error) {
    logger.error('프롬프트 가져오기 오류:', { error });
    throw error;
  }
}

/**
 * 스트리밍 텍스트 생성 함수
 * 일반적인 텍스트 생성에 사용할 수 있는 스트리밍 함수입니다.
 */
export async function streamGeneratedText(
  traceManager: TraceManager,
  systemPrompt: string,
  userPrompt: string,
  operationName: string = 'streamGeneratedText',
  metadata: Record<string, any> = {}
): Promise<ReadableStream<string>> {
  try {
    const promptClient = await langfuse.getPrompt('semo-document-system-prompt', undefined, {
      type: "chat"
    });
    
    const variables = {
      SystemPrompt: systemPrompt,
      UserPrompt: userPrompt
    };
    
    // 채팅 메시지 배열로 컴파일
    const compiledMessages = promptClient.compile(variables) as CoreMessage[];
    
    const result = await streamTextWithTelemetry({
      model: createModelObject(),
      messages: compiledMessages,
      traceManager,
      operationName,
      temperature: 0.7,
      metadata
    });
    
    return result.textStream;
  } catch (error) {
    logger.error('프롬프트 가져오기 오류:', { error });
    throw error;
  }
} 