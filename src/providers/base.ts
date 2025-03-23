/**
 * 기본 프로바이더 인터페이스
 *
 * AI 프로바이더 구현의 기본 인터페이스를 정의합니다.
 */

import { ITrace } from '../trace';
import { TokenUsage } from '../token';

/**
 * 프로바이더 옵션 인터페이스
 */
export interface ProviderOptions {
  /** 기본 모델 */
  defaultModel: string;
  /** 추가 설정 */
  settings?: Record<string, any>;
}

/**
 * 기본 텔레메트리 매개변수
 */
export interface TelemetryParams {
  /** 연결할 트레이스 */
  trace?: ITrace;
  /** 부모 스팬 ID */
  parentSpanId?: string;
  /** 추가 메타데이터 */
  metadata?: Record<string, any>;
  /** 작업 이름 */
  operationName?: string;
  /** 사용자 정의 이름 */
  name?: string;
  /** 태그 */
  tags?: string[];
}

/**
 * 입력 프롬프트 타입 (유니온 타입으로 확장 가능)
 */
export type PromptInput = string | Record<string, any>;

/**
 * AI 프로바이더 기본 인터페이스
 */
export interface IAIProvider<TResult = any, TOptions = any> {
  /**
   * 프로바이더 이름 가져오기
   */
  getName(): string;
  
  /**
   * 기본 모델 가져오기
   */
  getDefaultModel(): string;
  
  /**
   * 텔레메트리로 생성 요청
   */
  generateWithTelemetry(
    input: PromptInput,
    options: TOptions & TelemetryParams
  ): Promise<TResult>;
  
  /**
   * 여러 요청 일괄 처리
   */
  batchGenerateWithTelemetry(
    inputs: PromptInput[],
    options: TOptions & TelemetryParams
  ): Promise<TResult[]>;
}

/**
 * 프로바이더 레스폰스 인터페이스
 */
export interface ProviderResponse<TContent = any> {
  /** 원시 응답 */
  raw: any;
  /** 처리된 콘텐츠 */
  content: TContent;
  /** 모델 정보 */
  model: string;
  /** 토큰 사용량 */
  usage?: TokenUsage;
  /** 응답 메타데이터 */
  metadata?: Record<string, any>;
}

/**
 * 기본 AI 프로바이더 클래스
 */
export abstract class BaseAIProvider<TResult = any, TOptions = any> implements IAIProvider<TResult, TOptions> {
  protected name: string;
  protected defaultModel: string;
  protected settings: Record<string, any>;
  
  /**
   * 프로바이더 생성자
   */
  constructor(name: string, options: ProviderOptions) {
    this.name = name;
    this.defaultModel = options.defaultModel;
    this.settings = options.settings || {};
  }
  
  /**
   * 프로바이더 이름 가져오기
   */
  public getName(): string {
    return this.name;
  }
  
  /**
   * 기본 모델 가져오기
   */
  public getDefaultModel(): string {
    return this.defaultModel;
  }
  
  /**
   * 텔레메트리로 생성 요청 (추상 메서드)
   */
  public abstract generateWithTelemetry(
    input: PromptInput,
    options: TOptions & TelemetryParams
  ): Promise<TResult>;
  
  /**
   * 여러 요청 일괄 처리
   */
  public async batchGenerateWithTelemetry(
    inputs: PromptInput[],
    options: TOptions & TelemetryParams
  ): Promise<TResult[]> {
    const results: TResult[] = [];
    
    for (const input of inputs) {
      const result = await this.generateWithTelemetry(input, options);
      results.push(result);
    }
    
    return results;
  }
}