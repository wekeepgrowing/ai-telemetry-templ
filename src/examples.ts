/**
 * AI 프롬프트 핸들러 사용 예제
 * 
 * 각 함수의 사용 방법을 보여주는, 실제 호출 예제를 담고 있습니다.
 */

import { createTraceManager } from './ai/telemetry';
import {
  generateRole,
  needSubtask,
  understandQuestion,
  generatePreQuestion,
  generateSubtask,
  analyzeTaskDependency,
  streamGeneratedText
} from './prompts/prompt-handlers';
import { logger } from './utils/logger';

/**
 * 모든 AI 호출 함수를 순차적으로 실행해보는 예제 함수입니다.
 */
export async function runAIExamples() {
  // TraceManager 인스턴스 생성 (Langfuse 원격 분석)
  const { traceManager } = createTraceManager('ai-examples');
  
  try {
    logger.info('== AI 함수 호출 예제 시작 ==');
    
    // 1. 역할 생성 예제
    const toDoList = `
      - 웹사이트 디자인 만들기
      - 사용자 인터페이스 개발
      - 백엔드 API 구현
    `;
    const targetTask = '웹사이트 디자인 만들기';
    
    logger.info('\n1. 역할 생성 호출 중...');
    const roleMessage = await generateRole(traceManager, toDoList, targetTask);
    logger.info('역할 생성 결과:\n', { roleMessage });
    
    // 2. 하위 작업 필요성 평가 예제
    logger.info('\n2. 하위 작업 필요성 평가 호출 중...');
    const needsSubtasks = await needSubtask(traceManager, toDoList, targetTask, roleMessage);
    logger.info('하위 작업 필요 여부:', { needsSubtasks });
    
    // 3. 질문 이해 예제
    logger.info('\n3. 질문 이해 호출 중...');
    const question = '웹사이트 디자인은 어떤 스타일이어야 하나요?';
    const answer = '모던하고 미니멀한 디자인이 좋을 것 같습니다.';
    const understanding = await understandQuestion(traceManager, question, answer);
    logger.info('질문 이해 결과:\n', { understanding });
    
    // 4. 사전 질문 생성 예제
    logger.info('\n4. 사전 질문 생성 호출 중...');
    const userInput = '웹사이트 디자인을 만들어야 합니다.';
    const preQuestions = await generatePreQuestion(traceManager, userInput);
    logger.info('사전 질문 결과:\n', { preQuestions });
    
    // 5. 하위 작업 생성 예제
    logger.info('\n5. 하위 작업 생성 호출 중...');
    const subtasks = await generateSubtask(traceManager, toDoList, targetTask, roleMessage);
    logger.info('하위 작업 결과:\n', { subtasks });
    
    // 6. 작업 의존성 분석 예제
    logger.info('\n6. 작업 의존성 분석 호출 중...');
    const taskList = subtasks || `
      - 웹사이트 컬러 팔레트 선택
      - 타이포그래피 결정
      - 레이아웃 디자인
      - 와이어프레임 생성
    `;
    const dependencies = await analyzeTaskDependency(traceManager, taskList);
    logger.info('작업 의존성 분석 결과:\n', { dependencies });
    
    // 7. 스트리밍 텍스트 생성 예제
    logger.info('\n7. 스트리밍 텍스트 생성 호출 중...');
    const systemPrompt = '당신은 웹사이트 디자인에 대한 전문가입니다.';
    const userPrompt = '웹사이트 디자인 트렌드에 대해 간략히 설명해주세요.';
    const stream = await streamGeneratedText(
      traceManager,
      systemPrompt,
      userPrompt,
      'websiteDesignTrends',
      { context: 'design_trends' }
    );
    
    logger.info('스트림 결과 받는 중...');
    const reader = stream.getReader();
    let streamedText = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      streamedText += value;
      // 실시간 출력은 주석 처리 (너무 많은 로그 방지)
      // process.stdout.write(value);
    }
    
    logger.info('스트리밍 결과 (전체):\n', { streamedText });
    
    logger.info('\n== AI 함수 호출 예제 완료 ==');
  } catch (error) {
    logger.error('AI 예제 실행 중 오류 발생:', { error });
  } finally {
    // 트레이스 완료
    await traceManager.finishTrace('success', { 
      completionStatus: 'example completed',
      timestamp: new Date().toISOString()
    });
  }
}

// 직접 실행되는 경우 예제 실행
if (require.main === module) {
  logger.info('AI 예제 실행 중...');
  runAIExamples()
    .then(() => logger.info('완료'))
    .catch(err => logger.error('오류:', { error: err }));
} 