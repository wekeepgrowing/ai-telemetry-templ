/**
 * 오류 처리 유틸리티
 *
 * 텔레메트리 시스템의 오류 처리를 담당합니다.
 */

/**
 * 텔레메트리 오류 기본 클래스
 */
export class TelemetryError extends Error {
  /** 오류 코드 */
  public code: string;
  /** 오류 컨텍스트 정보 */
  public context?: Record<string, any>;

  /**
   * 텔레메트리 오류 생성
   */
  constructor(message: string, code: string = 'TELEMETRY_ERROR', context?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 초기화 오류
 */
export class InitializationError extends TelemetryError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'INIT_ERROR', context);
  }
}

/**
 * 구성 오류
 */
export class ConfigurationError extends TelemetryError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'CONFIG_ERROR', context);
  }
}

/**
 * 트레이스 관련 오류
 */
export class TraceError extends TelemetryError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'TRACE_ERROR', context);
  }
}

/**
 * API 호출 오류
 */
export class APIError extends TelemetryError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 'API_ERROR', context);
  }
}

/**
 * 오류를 안전하게 처리하는 유틸리티 함수
 */
export function safeExecute<T>(fn: () => T, defaultValue: T, errorHandler?: (error: Error) => void): T {
  try {
    return fn();
  } catch (error) {
    if (errorHandler && error instanceof Error) {
      errorHandler(error);
    }
    return defaultValue;
  }
}