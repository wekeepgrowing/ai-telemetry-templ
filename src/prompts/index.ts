/**
 * 프롬프트 핸들러 모듈
 * 
 * LLM 호출과 Langfuse 원격 분석을 통합한 AI 프롬프트 핸들러 함수를 제공합니다.
 * 각 함수는 특정 목적에 맞게 설계된 프롬프트 템플릿을 사용합니다.
 */

import {
  generateRole,
  needSubtask,
  understandQuestion,
  generatePreQuestion,
  generateSubtask,
  analyzeTaskDependency,
  streamGeneratedText
} from './prompt-handlers';

import { createTraceManager } from '../ai/telemetry';
import { runAIExamples } from '../examples';

// 기본 사용법
export {
  // 핵심 AI 함수
  generateRole,
  needSubtask,
  understandQuestion,
  generatePreQuestion,
  generateSubtask,
  analyzeTaskDependency,
  streamGeneratedText,
  
  // 원격 분석 유틸리티
  createTraceManager,
  
  // 예제
  runAIExamples
}

// 기본 사용법 문서화
/** 
 * # 프롬프트 핸들러 사용법
 * 
 * 이 모듈은 다양한 AI 작업을 수행하기 위한 함수들을 제공합니다.
 * 
 * ## 기본 사용 예제
 * 
 * ```typescript
 * import { createTraceManager, generateRole } from './prompts';
 * 
 * async function example() {
 *   // 원격 분석을 위한 TraceManager 생성
 *   const { traceManager } = createTraceManager('my-trace');
 *   
 *   // AI 함수 호출
 *   const toDoList = '- 웹사이트 디자인\n- 백엔드 개발';
 *   const targetTask = '웹사이트 디자인';
 *   
 *   const roleMessage = await generateRole(traceManager, toDoList, targetTask);
 *   console.log(roleMessage);
 *   
 *   // 작업 완료 시 트레이스 종료
 *   await traceManager.finishTrace('success');
 * }
 * ```
 * 
 * ## 스트리밍 예제
 * 
 * ```typescript
 * import { createTraceManager, streamGeneratedText } from './prompts';
 * 
 * async function streamExample() {
 *   const { traceManager } = createTraceManager('stream-example');
 *   
 *   const stream = await streamGeneratedText(
 *     traceManager,
 *     '당신은 도움이 되는 AI 조수입니다.',
 *     '마케팅 전략을 제안해주세요.'
 *   );
 *   
 *   const reader = stream.getReader();
 *   
 *   while (true) {
 *     const { done, value } = await reader.read();
 *     if (done) break;
 *     process.stdout.write(value);
 *   }
 *   
 *   await traceManager.finishTrace('success');
 * }
 * ```
 */ 