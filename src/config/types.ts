/**
 * 텔레메트리 구성을 위한 타입 정의
 */

/**
 * 텔레메트리 기본 구성 옵션
 */
export interface TelemetryConfig {
  /** 텔레메트리 활성화 여부 */
  enabled: boolean;
  /** 디버그 모드 활성화 여부 */
  debug: boolean;
  /** Langfuse 관련 구성 */
  langfuse?: LangfuseConfig;
  /** OpenTelemetry 관련 구성 */
  openTelemetry?: OpenTelemetryConfig;
  /** 토큰 카운팅 관련 구성 */
  tokenCounting?: TokenCountingConfig;
}

/**
 * Langfuse 관련 구성
 */
export interface LangfuseConfig {
  /** Langfuse 공개 키 */
  publicKey?: string;
  /** Langfuse 비밀 키 */
  secretKey?: string;
  /** Langfuse 기본 URL */
  baseUrl?: string;
  /** 이벤트 배치 크기 */
  batchSize?: number;
  /** 배치 플러시 간격 (밀리초) */
  flushInterval?: number;
}

/**
 * OpenTelemetry 관련 구성
 */
export interface OpenTelemetryConfig {
  /** OpenTelemetry 활성화 여부 */
  enabled: boolean;
  /** 사용할 익스포터 목록 */
  exporters?: string[];
}

/**
 * 토큰 카운팅 관련 구성
 */
export interface TokenCountingConfig {
  /** 토큰 카운팅 활성화 여부 */
  enabled: boolean;
  /** 사용할 인코더 */
  encoder?: string;
}

/**
 * 텔레메트리 초기화 옵션
 */
export interface TelemetryInitOptions extends Partial<TelemetryConfig> {
  /** 애플리케이션 이름 */
  appName?: string;
  /** 환경 (development, production 등) */
  environment?: string;
}

/**
 * 텔레메트리 시스템 상태 인터페이스
 */
export interface TelemetryStatus {
  /** 텔레메트리가 활성화되었는지 여부 */
  isEnabled: boolean;
  /** 초기화 상태 */
  isInitialized: boolean;
  /** 초기화 타임스탬프 */
  initTimestamp?: string;
  /** 활성 트레이스 수 */
  activeTraces: number;
  /** 활성 스팬 수 */
  activeSpans: number;
  /** 활성 생성 수 */
  activeGenerations: number;
}