/**
 * OpenAI 프로바이더 구현
 *
 * OpenAI API 호출에 대한 텔레메트리 통합을 제공합니다.
 */

import {
  BaseAIProvider,
  ProviderOptions,
  ProviderResponse,
  TelemetryParams,
  PromptInput
} from './base';
import {
  calculateTokenUsage,
  extractTokenUsage,
  TokenUsage
} from '../token';
import { generateUUID } from '../utils';

/**
 * OpenAI 생성 옵션
 */
export interface OpenAIGenerateOptions {
  /** 사용할 모델 (기본값이 아닌 경우) */
  model?: string;
  /** 온도 설정 */
  temperature?: number;
  /** 최대 토큰 수 */
  maxTokens?: number;
  /** 시스템 메시지 */
  system?: string;
  /** 함수 호출 구성 */
  functions?: any[];
  /** 기타 OpenAI 매개변수 */
  [key: string]: any;
}

/**
 * OpenAI 응답 처리기 인터페이스
 */
export interface OpenAIResponseHandler<T = any> {
  (response: any, input: PromptInput): T;
}

/**
 * OpenAI 프로바이더 클래스
 */
export class OpenAIProvider extends BaseAIProvider<ProviderResponse, OpenAIGenerateOptions> {
  private client: any;
  private responseHandler: OpenAIResponseHandler | null = null;
  
  /**
   * OpenAI 프로바이더 생성자
   */
  constructor(
    client: any,
    options: ProviderOptions,
    responseHandler?: OpenAIResponseHandler
  ) {
    super('openai', options);
    this.client = client;
    
    if (responseHandler) {
      this.responseHandler = responseHandler;
    }
  }
  
  /**
   * 응답 처리기 설정
   */
  public setResponseHandler(handler: OpenAIResponseHandler): void {
    this.responseHandler = handler;
  }
  
  /**
   * 입력을 OpenAI 형식으로 변환
   */
  private formatInput(input: PromptInput): any {
    if (typeof input === 'string') {
      return { messages: [{ role: 'user', content: input }] };
    }
    
    // 이미 메시지 형식인 경우
    if (Array.isArray(input.messages)) {
      return input;
    }
    
    // content 속성이 있는 경우
    if (input.content) {
      return {
        messages: [{
          role: input.role || 'user',
          content: input.content
        }]
      };
    }
    
    // 그대로 반환
    return input;
  }
  
  /**
   * 응답 처리
   */
  private processResponse(response: any, input: PromptInput): any {
    if (this.responseHandler) {
      return this.responseHandler(response, input);
    }
    
    // 기본 응답 처리
    if (response.choices && response.choices.length > 0) {
      const choice = response.choices[0];
      
      // 채팅 완성 응답
      if (choice.message) {
        return choice.message.content;
      }
      
      // 텍스트 완성 응답
      if (choice.text) {
        return choice.text;
      }
    }
    
    // 응답 구조를 알 수 없는 경우 전체 반환
    return response;
  }
  
  /**
   * 토큰 사용량 추출
   */
  private getTokenUsage(response: any, input: PromptInput, model: string): TokenUsage | undefined {
    // API 응답에서 추출 시도
    const extractedUsage = extractTokenUsage(response, model);
    if (extractedUsage) {
      return extractedUsage;
    }
    
    // 추출 실패 시 계산
    const inputStr = typeof input === 'string' ? input : JSON.stringify(input);
    const outputStr = JSON.stringify(this.processResponse(response, input));
    
    return calculateTokenUsage(inputStr, outputStr, model);
  }
  
  /**
   * 텔레메트리로 생성 요청
   */
  public async generateWithTelemetry(
    input: PromptInput,
    options: OpenAIGenerateOptions & TelemetryParams
  ): Promise<ProviderResponse> {
    const {
      trace,
      parentSpanId,
      metadata = {},
      operationName = 'openai-generate',
      name = 'openai-completion',
      tags = [],
      ...openaiOptions
    } = options;
    
    // 사용할 모델 결정
    const model = openaiOptions.model || this.defaultModel;
    
    // 입력 포맷팅
    const formattedInput = this.formatInput(input);
    
    // 생성 시작 (텔레메트리 추적)
    const generation = trace?.startGeneration({
      name,
      model,
      input: formattedInput,
      parentId: parentSpanId,
      metadata: {
        ...metadata,
        provider: 'openai',
        operationName,
        timestamp: new Date().toISOString()
      },
      tags: [...tags, 'provider:openai', `model:${model}`]
    });
    
    try {
      // OpenAI API 호출 준비
      const apiOptions = {
        ...openaiOptions,
        model
      };
      
      // 실제 API 호출
      let response: any;
      
      // 메시지 배열이 있으면 채팅 완성 사용
      if (formattedInput.messages) {
        response = await this.client.chat.completions.create({
          ...apiOptions,
          messages: formattedInput.messages
        });
      }
      // 그 외에는 일반 완성 사용
      else {
        response = await this.client.completions.create({
          ...apiOptions,
          prompt: formattedInput
        });
      }
      
      // 응답 처리
      const content = this.processResponse(response, input);
      
      // 토큰 사용량 추출 또는 계산
      const usage = this.getTokenUsage(response, input, model);
      
      // 생성 완료 (텔레메트리)
      if (generation) {
        generation.complete({
          output: content,
          usage,
          metadata: {
            completedAt: new Date().toISOString(),
            rawResponse: response
          }
        });
      }
      
      // 응답 반환
      return {
        raw: response,
        content,
        model,
        usage,
        metadata: {
          provider: 'openai',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      // 오류 발생 시 텔레메트리 기록
      if (generation) {
        generation.end({
          status: 'error',
          error,
          metadata: {
            errorTimestamp: new Date().toISOString(),
            errorType: error instanceof Error ? error.constructor.name : 'Unknown Error'
          }
        });
      }
      
      // 오류 다시 던지기
      throw error;
    }
  }
}