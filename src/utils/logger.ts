/**
 * 간단한 로깅 유틸리티
 *
 * 텔레메트리 시스템의 로깅을 담당합니다.
 */

/**
 * 로거 구성 옵션
 */
export interface LoggerOptions {
  /** 디버그 모드 활성화 여부 */
  debug?: boolean;
  /** 로깅을 비활성화할지 여부 */
  silent?: boolean;
  /** 로그 접두사 */
  prefix?: string;
}

/**
 * 로그 레벨
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

/**
 * 텔레메트리 로거 클래스
 */
export class Logger {
  private debug: boolean;
  private silent: boolean;
  private prefix: string;

  /**
   * 새 로거 인스턴스 생성
   */
  constructor(options: LoggerOptions = {}) {
    this.debug = options.debug ?? false;
    this.silent = options.silent ?? false;
    this.prefix = options.prefix ?? '[Telemetry]';
  }

  /**
   * 로그 메시지 형식화
   */
  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString();
    return `${this.prefix} ${timestamp} [${level}] ${message}`;
  }

  /**
   * 디버그 로그 출력
   */
  public logDebug(message: string, ...args: any[]): void {
    if (this.silent || !this.debug) return;
    console.debug(this.formatMessage(LogLevel.DEBUG, message), ...args);
  }

  /**
   * 정보 로그 출력
   */
  public logInfo(message: string, ...args: any[]): void {
    if (this.silent) return;
    console.log(this.formatMessage(LogLevel.INFO, message), ...args);
  }

  /**
   * 경고 로그 출력
   */
  public logWarn(message: string, ...args: any[]): void {
    if (this.silent) return;
    console.warn(this.formatMessage(LogLevel.WARN, message), ...args);
  }

  /**
   * 오류 로그 출력
   */
  public logError(message: string, ...args: any[]): void {
    if (this.silent) return;
    console.error(this.formatMessage(LogLevel.ERROR, message), ...args);
  }

  /**
   * 구성 업데이트
   */
  public updateOptions(options: Partial<LoggerOptions>): void {
    if (options.debug !== undefined) this.debug = options.debug;
    if (options.silent !== undefined) this.silent = options.silent;
    if (options.prefix !== undefined) this.prefix = options.prefix;
  }
}

// 기본 로거 인스턴스 생성
export const defaultLogger = new Logger();