/**
 * 스팬 관리 모듈
 *
 * 트레이스 내 스팬의 생성 및 관리를 담당합니다.
 */

import { generateUUID, getCurrentTimestamp } from '../utils';
import {
  ObjectId,
  SpanOptions,
  SpanResult,
  SpanStatus,
  GenerationOptions,
  GenerationResult
} from './types';

/**
 * 스팬 인터페이스
 *
 * 트레이스 내에서 특정 작업을 나타내는 스팬입니다.
 */
export interface ISpan {
  /** 스팬 ID */
  id: ObjectId;
  /** 스팬 이름 */
  name: string;
  /** 트레이스 ID */
  traceId: ObjectId;
  /** 부모 스팬 ID */
  parentId?: ObjectId;
  /** 스팬 시작 시간 */
  startTime: string;
  /** 스팬 종료 시간 */
  endTime?: string;
  /** 스팬 상태 */
  status: SpanStatus;
  /** 스팬 메타데이터 */
  metadata: Record<string, any>;
  /** 스팬 태그 */
  tags: string[];
  
  /** 스팬에 메타데이터 추가 */
  addMetadata(metadata: Record<string, any>): void;
  /** 스팬 태그 추가 */
  addTags(tags: string[]): void;
  /** 스팬 종료 */
  end(result: SpanResult): void;
}

/**
 * 생성(Generation) 인터페이스
 *
 * AI 모델 호출을 나타내는 특수한 스팬입니다.
 */
export interface IGeneration extends ISpan {
  /** 사용된 모델 */
  model: string;
  /** 입력 프롬프트 */
  input: any;
  /** 출력 결과 */
  output?: any;
  /** 토큰 사용량 */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  
  /** 생성 완료 */
  complete(result: GenerationResult): void;
}

/**
 * 기본 스팬 구현
 */
export class Span implements ISpan {
  public id: ObjectId;
  public name: string;
  public traceId: ObjectId;
  public parentId?: ObjectId;
  public startTime: string;
  public endTime?: string;
  public status: SpanStatus;
  public metadata: Record<string, any>;
  public tags: string[];
  
  /**
   * 스팬 생성자
   */
  constructor(traceId: ObjectId, options: SpanOptions) {
    this.id = generateUUID();
    this.name = options.name;
    this.traceId = traceId;
    this.parentId = options.parentId;
    this.startTime = getCurrentTimestamp();
    this.status = 'running';
    this.metadata = options.metadata || {};
    this.tags = options.tags || [];
    
    // 시작 시간을 메타데이터에 추가
    this.metadata.startTime = this.startTime;
  }
  
  /**
   * 스팬에 메타데이터 추가
   */
  public addMetadata(metadata: Record<string, any>): void {
    this.metadata = { ...this.metadata, ...metadata };
  }
  
  /**
   * 스팬에 태그 추가
   */
  public addTags(tags: string[]): void {
    this.tags = [...new Set([...this.tags, ...tags])];
  }
  
  /**
   * 스팬 종료
   */
  public end(result: SpanResult): void {
    if (this.endTime) {
      return; // 이미 종료된 스팬
    }
    
    this.endTime = getCurrentTimestamp();
    this.status = result.status;
    
    // 메타데이터 업데이트
    this.metadata = {
      ...this.metadata,
      ...result.metadata,
      endTime: this.endTime
    };
    
    // 오류 정보 추가
    if (result.error) {
      this.metadata.error = typeof result.error === 'object'
        ? result.error
        : { message: String(result.error) };
    }
    
    // 출력 추가
    if (result.output !== undefined) {
      this.metadata.output = result.output;
    }
  }
}

/**
 * 생성(Generation) 구현
 */
export class Generation extends Span implements IGeneration {
  public model: string;
  public input: any;
  public output?: any;
  public usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  
  /**
   * 생성 생성자
   */
  constructor(traceId: ObjectId, options: GenerationOptions) {
    super(traceId, {
      name: options.name,
      parentId: options.parentId,
      metadata: {
        ...options.metadata,
        model: options.model
      },
      tags: options.tags
    });
    
    this.model = options.model;
    this.input = options.input;
    
    // 추가 메타데이터
    this.metadata.model = options.model;
    this.metadata.generationType = 'llm';
  }
  
  /**
   * 생성 완료
   */
  public complete(result: GenerationResult): void {
    this.output = result.output;
    this.usage = result.usage;
    
    // 스팬 종료
    this.end({
      status: 'success',
      output: result.output,
      metadata: {
        ...result.metadata,
        usage: result.usage
      }
    });
  }
}