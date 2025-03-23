/**
 * 트레이스 관리 시스템
 *
 * 트레이스, 스팬 및 생성의 생성과 관리를 담당합니다.
 */

import { generateUUID, getCurrentTimestamp, isEmptyObject, Logger } from '../utils';
import {
  ObjectId,
  TraceOptions,
  SpanOptions,
  GenerationOptions,
  TraceStatus,
  TraceEndInfo,
  SpanResult,
  GenerationResult
} from './types';
import { ISpan, Span, IGeneration, Generation } from './span';
import { TokenUsage, TokenUsageTracker } from '../token';

/**
 * 트레이스 인터페이스
 *
 * 하나의 완전한 작업 흐름을 나타냅니다.
 */
export interface ITrace {
  /** 트레이스 ID */
  id: ObjectId;
  /** 트레이스 이름 */
  name: string;
  /** 사용자 ID */
  userId?: string;
  /** 세션 ID */
  sessionId?: string;
  /** 시작 시간 */
  startTime: string;
  /** 종료 시간 */
  endTime?: string;
  /** 상태 */
  status: TraceStatus;
  /** 메타데이터 */
  metadata: Record<string, any>;
  /** 태그 */
  tags: string[];
  
  /** 스팬 시작 */
  startSpan(options: SpanOptions): ISpan;
  /** 생성 시작 */
  startGeneration(options: GenerationOptions): IGeneration;
  /** 메타데이터 업데이트 */
  updateMetadata(metadata: Record<string, any>): void;
  /** 태그 추가 */
  addTags(tags: string[]): void;
  /** 트레이스 종료 */
  end(info: TraceEndInfo): Promise<void>;
}

/**
 * 트레이스 관리자 인터페이스
 */
export interface ITraceManager {
  /** 트레이스 생성 */
  createTrace(options: TraceOptions): ITrace;
  /** 트레이스 가져오기 */
  getTrace(id: ObjectId): ITrace | undefined;
  /** 활성 트레이스 가져오기 */
  getActiveTraces(): ITrace[];
  /** 모든 자원 정리 */
  shutdown(): Promise<void>;
}

/**
 * 트레이스 구현 클래스
 */
export class Trace implements ITrace {
  public id: ObjectId;
  public name: string;
  public userId?: string;
  public sessionId?: string;
  public startTime: string;
  public endTime?: string;
  public status: TraceStatus;
  public metadata: Record<string, any>;
  public tags: string[];
  
  private spans: Map<ObjectId, ISpan> = new Map();
  private tokenUsage: TokenUsageTracker = new TokenUsageTracker();
  private logger: Logger;
  private flushCallback?: (trace: ITrace) => Promise<void>;
  
  /**
   * 트레이스 생성자
   */
  constructor(
    options: TraceOptions,
    logger: Logger,
    flushCallback?: (trace: ITrace) => Promise<void>
  ) {
    this.id = generateUUID();
    this.name = options.name;
    this.userId = options.userId;
    this.sessionId = options.sessionId;
    this.startTime = getCurrentTimestamp();
    this.status = 'pending';
    this.metadata = options.metadata || {};
    this.tags = options.tags || [];
    this.logger = logger;
    this.flushCallback = flushCallback;
    
    // 메타데이터에 시작 시간 추가
    this.metadata.startTime = this.startTime;
  }
  
  /**
   * 스팬 시작
   */
  public startSpan(options: SpanOptions): ISpan {
    // 이미 종료된 트레이스인지 확인
    if (this.endTime) {
      this.logger.logWarn(`Cannot start span "${options.name}" on already ended trace ${this.id}`);
      throw new Error(`Cannot start span on already ended trace`);
    }
    
    // 상태 업데이트
    if (this.status === 'pending') {
      this.status = 'running';
    }
    
    // 스팬 생성
    const span = new Span(this.id, options);
    this.spans.set(span.id, span);
    
    this.logger.logDebug(`Started span "${span.name}" (${span.id}) in trace ${this.id}`);
    return span;
  }
  
  /**
   * 생성 시작
   */
  public startGeneration(options: GenerationOptions): IGeneration {
    // 이미 종료된 트레이스인지 확인
    if (this.endTime) {
      this.logger.logWarn(`Cannot start generation "${options.name}" on already ended trace ${this.id}`);
      throw new Error(`Cannot start generation on already ended trace`);
    }
    
    // 상태 업데이트
    if (this.status === 'pending') {
      this.status = 'running';
    }
    
    // 생성 인스턴스 생성
    const generation = new Generation(this.id, options);
    this.spans.set(generation.id, generation);
    
    this.logger.logDebug(`Started generation "${generation.name}" (${generation.id}) with model ${generation.model} in trace ${this.id}`);
    return generation;
  }
  
  /**
   * 메타데이터 업데이트
   */
  public updateMetadata(metadata: Record<string, any>): void {
    if (isEmptyObject(metadata)) return;
    
    // 토큰 사용량 특별 처리
    if (metadata.tokenUsage) {
      this.tokenUsage.addUsage(metadata.tokenUsage);
      
      // 전체 토큰 사용량 계산하여 메타데이터에 저장
      const totalUsage = this.tokenUsage.getTotalUsage();
      this.metadata.totalTokens = totalUsage.totalTokens;
    }
    
    // 일반 메타데이터 병합
    this.metadata = { ...this.metadata, ...metadata };
    
    // 업데이트 타임스탬프 추가
    this.metadata.updatedAt = getCurrentTimestamp();
  }
  
  /**
   * 태그 추가
   */
  public addTags(tags: string[]): void {
    if (!tags.length) return;
    this.tags = [...new Set([...this.tags, ...tags])];
  }
  
  /**
   * 모든 열린 스팬 종료
   */
  private async closeOpenSpans(): Promise<void> {
    const openSpans = Array.from(this.spans.values()).filter(span => !span.endTime);
    
    for (const span of openSpans) {
      span.end({
        status: 'cancelled',
        metadata: { reason: 'trace_ended' }
      });
    }
  }
  
  /**
   * 트레이스 종료
   */
  public async end(info: TraceEndInfo): Promise<void> {
    if (this.endTime) {
      this.logger.logWarn(`Trace ${this.id} already ended, ignoring end call`);
      return;
    }
    
    // 열린 스팬 종료
    await this.closeOpenSpans();
    
    // 트레이스 종료 정보 설정
    this.endTime = getCurrentTimestamp();
    this.status = info.status;
    
    // 토큰 사용량 요약 추가
    const tokenSummary = this.tokenUsage.getModelTotals();
    
    // 메타데이터 업데이트
    this.metadata = {
      ...this.metadata,
      ...info.metadata,
      endTime: this.endTime,
      tokenUsageSummary: tokenSummary
    };
    
    // 실행 시간 계산
    const startMs = new Date(this.startTime).getTime();
    const endMs = new Date(this.endTime).getTime();
    const durationMs = endMs - startMs;
    this.metadata.duration = durationMs;
    this.metadata.durationSeconds = Math.round(durationMs / 1000);
    
    this.logger.logDebug(`Ended trace ${this.id} with status ${this.status}`);
    
    // 콜백 호출 (예: Langfuse에 데이터 전송)
    if (this.flushCallback) {
      try {
        await this.flushCallback(this);
      } catch (error) {
        this.logger.logError(`Failed to flush trace ${this.id}:`, error);
      }
    }
  }
  
  /**
   * 토큰 사용량 기록
   */
  public recordTokenUsage(usage: TokenUsage): void {
    this.tokenUsage.addUsage(usage);
    
    // 전체 토큰 메타데이터 업데이트
    const total = this.tokenUsage.getTotalUsage();
    this.metadata.totalTokens = total.totalTokens;
  }
}

/**
 * 트레이스 관리자 구현
 */
export class TraceManager implements ITraceManager {
  private traces: Map<ObjectId, Trace> = new Map();
  private logger: Logger;
  private flushCallback?: (trace: ITrace) => Promise<void>;
  
  /**
   * 트레이스 관리자 생성자
   */
  constructor(
    logger: Logger,
    flushCallback?: (trace: ITrace) => Promise<void>
  ) {
    this.logger = logger;
    this.flushCallback = flushCallback;
  }
  
  /**
   * 트레이스 생성
   */
  public createTrace(options: TraceOptions): ITrace {
    const trace = new Trace(options, this.logger, this.flushCallback);
    this.traces.set(trace.id, trace);
    
    this.logger.logDebug(`Created trace "${trace.name}" (${trace.id})`);
    return trace;
  }
  
  /**
   * 트레이스 가져오기
   */
  public getTrace(id: ObjectId): ITrace | undefined {
    return this.traces.get(id);
  }
  
  /**
   * 활성 트레이스 가져오기
   */
  public getActiveTraces(): ITrace[] {
    return Array.from(this.traces.values())
      .filter(trace => !trace.endTime);
  }
  
  /**
   * 모든 자원 정리
   */
  public async shutdown(): Promise<void> {
    const activeTraces = this.getActiveTraces();
    
    this.logger.logInfo(`Shutting down, closing ${activeTraces.length} active traces`);
    
    for (const trace of activeTraces) {
      await trace.end({
        status: 'completed',
        metadata: { reason: 'shutdown' }
      });
    }
    
    this.traces.clear();
  }
}