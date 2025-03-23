/**
 * 텔레메트리 구성 모듈
 *
 * 텔레메트리 시스템의 모든 구성을 중앙 집중화합니다.
 */

import { TelemetryConfig, TelemetryInitOptions } from './types';

// 기본값
const DEFAULT_ENABLED = false;
const DEFAULT_DEBUG = false;
const DEFAULT_ENCODER = 'cl100k_base'; // tiktoken 기본값

/**
 * 환경 변수에서 구성 로드
 */
export function loadEnvConfig(): TelemetryConfig {
  return {
    enabled: process.env.ENABLE_TELEMETRY === 'true' || DEFAULT_ENABLED,
    debug: process.env.TELEMETRY_DEBUG === 'true' || DEFAULT_DEBUG,
    langfuse: {
      publicKey: process.env.LANGFUSE_PUBLIC_KEY,
      secretKey: process.env.LANGFUSE_SECRET_KEY,
      baseUrl: process.env.LANGFUSE_BASEURL,
      batchSize: process.env.LANGFUSE_BATCH_SIZE ? parseInt(process.env.LANGFUSE_BATCH_SIZE, 10) : 10,
      flushInterval: process.env.LANGFUSE_FLUSH_INTERVAL ? parseInt(process.env.LANGFUSE_FLUSH_INTERVAL, 10) : 5000
    },
    openTelemetry: {
      enabled: process.env.ENABLE_OPENTELEMETRY === 'true' || false,
      exporters: process.env.OPENTELEMETRY_EXPORTERS?.split(',') || ['langfuse'],
    },
    tokenCounting: {
      enabled: process.env.ENABLE_TOKEN_COUNTING !== 'false', // 기본적으로 활성화
      encoder: process.env.TOKEN_ENCODER || DEFAULT_ENCODER,
    }
  };
}

/**
 * 사용자 지정 설정으로 구성 생성
 */
export function createConfig(customConfig: TelemetryInitOptions = {}): TelemetryConfig {
  const envConfig = loadEnvConfig();
  
  return {
    ...envConfig,
    ...customConfig,
    langfuse: {
      ...envConfig.langfuse,
      ...customConfig.langfuse
    },
    openTelemetry: {
      ...envConfig.openTelemetry,
      ...customConfig.openTelemetry
    },
    tokenCounting: {
      ...envConfig.tokenCounting,
      ...customConfig.tokenCounting
    }
  };
}

export * from './types';