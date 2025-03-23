/**
 * 텔레메트리 초기화 기능
 *
 * 텔레메트리 시스템을 초기화하고 구성합니다.
 */

import { Langfuse } from 'langfuse';
import type { NodeSDK } from '@opentelemetry/sdk-node';

import { TelemetryConfig, TelemetryInitOptions } from '../config';
import { createConfig } from '../config';
import { InitializationError, Logger } from '../utils';
import { TraceManager, ITraceManager } from '../trace';

/**
 * 텔레메트리 초기화 결과
 */
export interface TelemetryInitResult {
  /** 초기화 성공 여부 */
  isEnabled: boolean;
  /** 트레이스 관리자 */
  traceManager: ITraceManager;
  /** OpenTelemetry SDK (선택적) */
  openTelemetrySDK?: NodeSDK;
  /** Langfuse 클라이언트 (선택적) */
  langfuse?: Langfuse;
  /** 로거 */
  logger: Logger;
  /** 텔레메트리 종료 함수 */
  shutdown: () => Promise<void>;
}

/**
 * Langfuse 클라이언트 초기화
 */
function initializeLangfuse(config: TelemetryConfig, logger: Logger): Langfuse | undefined {
  if (!config.langfuse?.publicKey || !config.langfuse?.secretKey) {
    logger.logWarn('Langfuse keys not configured, Langfuse integration disabled');
    return undefined;
  }
  
  try {
    const langfuse = new Langfuse({
      publicKey: config.langfuse.publicKey,
      secretKey: config.langfuse.secretKey,
      baseUrl: config.langfuse.baseUrl,
      debug: config.debug || false,
      flushAtExit: true,
      batchSize: config.langfuse.batchSize || 10,
      flushInterval: config.langfuse.flushInterval || 5000
    });
    
    logger.logInfo('Langfuse client initialized successfully');
    return langfuse;
  } catch (error) {
    logger.logError('Failed to initialize Langfuse:', error);
    return undefined;
  }
}

/**
 * OpenTelemetry SDK 초기화
 */
function initializeOpenTelemetry(
  config: TelemetryConfig,
  logger: Logger
): NodeSDK | undefined {
  if (!config.openTelemetry?.enabled) {
    return undefined;
  }
  
  try {
    // 동적 가져오기 (선택적 의존성)
    const { NodeSDK } = require('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
    
    // Langfuse가 활성화되었는지 확인
    if (config.langfuse?.publicKey && config.langfuse?.secretKey &&
        config.openTelemetry.exporters?.includes('langfuse')) {
      
      // Langfuse 익스포터 동적 로딩
      const { LangfuseExporter } = require('langfuse-vercel');
      
      // 익스포터 구성
      const langfuseExporter = new LangfuseExporter({
        debug: config.debug || false,
        secretKey: config.langfuse.secretKey,
        publicKey: config.langfuse.publicKey,
        baseUrl: config.langfuse.baseUrl,
      });
      
      // SDK 구성
      const sdk = new NodeSDK({
        traceExporter: langfuseExporter,
        instrumentations: [getNodeAutoInstrumentations()],
      });
      
      // SDK 시작
      sdk.start();
      
      logger.logInfo('OpenTelemetry SDK initialized with Langfuse exporter');
      return sdk;
    } else {
      logger.logWarn('OpenTelemetry enabled but no exporters configured, skipping initialization');
      return undefined;
    }
  } catch (error) {
    logger.logError('Failed to initialize OpenTelemetry:', error);
    return undefined;
  }
}

/**
 * Langfuse로 플러시 콜백 생성
 */
function createLangfuseFlushCallback(
  langfuse: Langfuse | undefined,
  logger: Logger
) {
  if (!langfuse) {
    return undefined;
  }
  
  return async (trace: any) => {
    try {
      // 트레이스 데이터 Langfuse로 전송
      await langfuse.trace({
        id: trace.id,
        name: trace.name,
        userId: trace.userId,
        sessionId: trace.sessionId,
        metadata: trace.metadata,
        tags: trace.tags,
        statusMessage: trace.status,
        ...(trace.endTime && { endTime: trace.endTime }),
      });
      
      // 트레이스에 속한 모든 스팬과 생성도 처리해야 하지만,
      // 이 템플릿에서는 간소화를 위해 생략합니다.
      
      await langfuse.flushAsync();
      logger.logDebug(`Flushed trace ${trace.id} to Langfuse`);
    } catch (error) {
      logger.logError(`Failed to flush trace ${trace.id} to Langfuse:`, error);
    }
  };
}

/**
 * 텔레메트리 초기화
 */
export function initializeTelemetry(options: TelemetryInitOptions = {}): TelemetryInitResult {
  // 설정 생성
  const config = createConfig(options);
  
  // 텔레메트리가 비활성화된 경우 빠른 반환
  if (!config.enabled) {
    const logger = new Logger({ silent: true });
    const traceManager = new TraceManager(logger);
    
    return {
      isEnabled: false,
      traceManager,
      logger,
      shutdown: async () => {}
    };
  }
  
  // 로거 초기화
  const logger = new Logger({
    debug: config.debug,
    prefix: options.appName ? `[${options.appName}]` : '[Telemetry]'
  });
  
  logger.logInfo('Initializing telemetry system...');
  
  try {
    // Langfuse 초기화
    const langfuse = initializeLangfuse(config, logger);
    
    // OpenTelemetry 초기화
    const openTelemetrySDK = initializeOpenTelemetry(config, logger);
    
    // Langfuse 플러시 콜백 생성
    const flushCallback = createLangfuseFlushCallback(langfuse, logger);
    
    // 트레이스 관리자 초기화
    const traceManager = new TraceManager(logger, flushCallback);
    
    logger.logInfo('Telemetry system initialized successfully');
    
    // 종료 함수
    const shutdown = async () => {
      logger.logInfo('Shutting down telemetry system...');
      
      // 트레이스 관리자 종료
      await traceManager.shutdown();
      
      // Langfuse 종료
      if (langfuse) {
        try {
          await langfuse.flushAsync();
          logger.logInfo('Flushed Langfuse data');
        } catch (error) {
          logger.logError('Error flushing Langfuse data:', error);
        }
      }
      
      // OpenTelemetry 종료
      if (openTelemetrySDK) {
        try {
          await openTelemetrySDK.shutdown();
          logger.logInfo('Shut down OpenTelemetry SDK');
        } catch (error) {
          logger.logError('Error shutting down OpenTelemetry SDK:', error);
        }
      }
      
      logger.logInfo('Telemetry system shut down successfully');
    };
    
    return {
      isEnabled: true,
      traceManager,
      openTelemetrySDK,
      langfuse,
      logger,
      shutdown
    };
  } catch (error) {
    logger.logError('Failed to initialize telemetry:', error);
    
    const traceManager = new TraceManager(logger);
    
    if (error instanceof Error) {
      throw new InitializationError(`Telemetry initialization failed: ${error.message}`, {
        originalError: error
      });
    } else {
      throw new InitializationError('Telemetry initialization failed with unknown error');
    }
  }
}