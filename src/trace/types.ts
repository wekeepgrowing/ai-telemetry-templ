/**
 * 트레이스 관련 타입 정의
 */

/**
 * 오브젝트 ID 타입
 */
export type ObjectId = string;

/**
 * 트레이스 상태
 */
export type TraceStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * 스팬 상태
 */
export type SpanStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

/**
 * 트레이스 생성 옵션
 */
export interface TraceOptions {
  /** 트레이스 이름 */
  name: string;
  /** 사용자 ID */
  userId?: string;
  /** 세션 ID */
  sessionId?: string;
  /** 메타데이터 */
  metadata?: Record<string, any>;
  /** 태그 */
  tags?: string[];
}

/**
 * 스팬 생성 옵션
 */
export interface SpanOptions {
  /** 스팬 이름 */
  name: string;
  /** 부모 스팬 ID */
  parentId?: ObjectId;
  /** 메타데이터 */
  metadata?: Record<string, any>;
  /** 태그 */
  tags?: string[];
}

/**
 * 생성(Generation) 옵션
 */
export interface GenerationOptions {
  /** 생성 이름 */
  name: string;
  /** 모델 이름 */
  model: string;
  /** 입력 프롬프트 */
  input: string | Record<string, any>;
  /** 부모 스팬 ID */
  parentId?: ObjectId;
  /** 메타데이터 */
  metadata?: Record<string, any>;
  /** 태그 */
  tags?: string[];
}

/**
 * 생성(Generation) 결과
 */
export interface GenerationResult {
  /** 출력 결과 */
  output: any;
  /** 토큰 사용량 */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  /** 메타데이터 */
  metadata?: Record<string, any>;
}

/**
 * 스팬 결과
 */
export interface SpanResult {
  /** 상태 */
  status: SpanStatus;
  /** 출력 결과 */
  output?: any;
  /** 오류 정보 */
  error?: any;
  /** 메타데이터 */
  metadata?: Record<string, any>;
}

/**
 * 트레이스 종료 정보
 */
export interface TraceEndInfo {
  /** 상태 */
  status: TraceStatus;
  /** 메타데이터 */
  metadata?: Record<string, any>;
}