/**
 * 기본 사용법 예제
 *
 * 텔레메트리 시스템의 기본적인 사용법을 보여줍니다.
 */

import { initializeTelemetry } from '../src';

async function main() {
  // 텔레메트리 초기화
  const telemetry = initializeTelemetry({
    enabled: true,
    debug: true,
    appName: 'basic-example'
  });
  
  console.log('텔레메트리 활성화 상태:', telemetry.isEnabled);
  
  // 트레이스 생성
  const trace = telemetry.traceManager.createTrace({
    name: 'basic-workflow',
    metadata: {
      description: '기본 워크플로우 예제'
    },
    tags: ['example', 'basic']
  });
  
  console.log(`트레이스 생성됨: ${trace.id}`);
  
  // 스팬 시작
  const span1 = trace.startSpan({
    name: 'data-processing',
    metadata: {
      dataSize: 1024,
      format: 'json'
    }
  });
  
  // 작업 시뮬레이션
  console.log('데이터 처리 중...');
  await sleep(500);
  
  // 메타데이터 추가
  span1.addMetadata({
    processingTime: 500,
    itemsProcessed: 42
  });
  
  // 스팬 종료
  span1.end({
    status: 'success',
    output: { processedItems: 42 },
    metadata: {
      completionInfo: '모든 아이템 처리 완료'
    }
  });
  
  // 하위 스팬 시작
  const span2 = trace.startSpan({
    name: 'result-analysis',
    parentId: span1.id,
    metadata: {
      analysisType: 'statistical'
    }
  });
  
  console.log('결과 분석 중...');
  await sleep(300);
  
  // 오류 시뮬레이션
  const hasError = Math.random() > 0.7;
  
  if (hasError) {
    console.log('분석 중 오류 발생!');
    span2.end({
      status: 'error',
      error: new Error('분석 실패'),
      metadata: {
        errorType: 'ProcessingError',
        errorDetail: '데이터 형식 오류'
      }
    });
  } else {
    console.log('분석 완료!');
    span2.end({
      status: 'success',
      output: { analysisResult: 'positive' }
    });
  }
  
  // 트레이스 메타데이터 업데이트
  trace.updateMetadata({
    completed: true,
    processingTime: 800,
    summary: '모든 단계 완료'
  });
  
  // 트레이스 종료
  await trace.end({
    status: hasError ? 'failed' : 'completed',
    metadata: {
      finalStatus: hasError ? '오류로 종료' : '성공적으로 완료',
      processingTime: 800
    }
  });
  
  console.log('트레이스 종료됨');
  
  // 텔레메트리 시스템 종료
  await telemetry.shutdown();
  console.log('텔레메트리 시스템 종료됨');
}

// 유틸리티 함수
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 예제 실행
main().catch(console.error);