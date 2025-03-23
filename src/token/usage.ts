/**
 * 토큰 사용량 추적 기능
 *
 * LLM API 호출에서 토큰 사용량을 추출하고 집계합니다.
 */

import { TokenCounterFactory } from './count';

/**
 * 토큰 사용량 정보 인터페이스
 */
export interface TokenUsage {
  /** 프롬프트 토큰 수 */
  promptTokens: number;
  /** 완성 토큰 수 */
  completionTokens: number;
  /** 총 토큰 수 */
  totalTokens: number;
  /** 사용한 모델 */
  model?: string;
  /** 추정 여부 */
  isEstimated?: boolean;
}

/**
 * 토큰 사용량 관리 클래스
 */
export class TokenUsageTracker {
  // 최근 호출 사용량 목록
  private usageHistory: TokenUsage[] = [];
  // 모델별 총 사용량
  private modelTotals: Record<string, TokenUsage> = {};

  /**
   * 토큰 사용량 추가
   */
  public addUsage(usage: TokenUsage): void {
    // 사용량 기록 추가
    this.usageHistory.push(usage);
    
    // 모델별 총계 업데이트
    const model = usage.model || 'unknown';
    if (!this.modelTotals[model]) {
      this.modelTotals[model] = {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        model
      };
    }
    
    this.modelTotals[model].promptTokens += usage.promptTokens;
    this.modelTotals[model].completionTokens += usage.completionTokens;
    this.modelTotals[model].totalTokens += usage.totalTokens;
  }

  /**
   * 모델별 총 사용량 가져오기
   */
  public getModelTotals(): Record<string, TokenUsage> {
    return { ...this.modelTotals };
  }

  /**
   * 전체 사용량 가져오기
   */
  public getTotalUsage(): TokenUsage {
    return Object.values(this.modelTotals).reduce(
      (total, usage) => {
        return {
          promptTokens: total.promptTokens + usage.promptTokens,
          completionTokens: total.completionTokens + usage.completionTokens,
          totalTokens: total.totalTokens + usage.totalTokens,
          model: 'all-models'
        };
      },
      { promptTokens: 0, completionTokens: 0, totalTokens: 0, model: 'all-models' }
    );
  }

  /**
   * 사용량 기록 가져오기
   */
  public getHistory(): TokenUsage[] {
    return [...this.usageHistory];
  }

  /**
   * 모든 기록 초기화
   */
  public reset(): void {
    this.usageHistory = [];
    this.modelTotals = {};
  }
}

/**
 * API 응답에서 토큰 사용량 추출
 */
export function extractTokenUsage(
  response: any,
  model?: string
): TokenUsage | undefined {
  // API 응답에서 토큰 사용량 찾기
  if (!response) return undefined;

  // 1. OpenAI 형식 확인
  if (response.usage) {
    return {
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      totalTokens: response.usage.total_tokens,
      model: model || response.model,
      isEstimated: false
    };
  }

  // 2. OpenAI JS SDK 형식 확인
  if (response.response?.usage) {
    return {
      promptTokens: response.response.usage.prompt_tokens,
      completionTokens: response.response.usage.completion_tokens,
      totalTokens: response.response.usage.total_tokens,
      model: model || response.response.model,
      isEstimated: false
    };
  }

  // 3. AI-SDK 또는 다른 형식 확인
  if (response.attributes) {
    // ai.usage 패턴 검색
    if (
      response.attributes['ai.usage.promptTokens'] !== undefined &&
      response.attributes['ai.usage.completionTokens'] !== undefined
    ) {
      return {
        promptTokens: response.attributes['ai.usage.promptTokens'],
        completionTokens: response.attributes['ai.usage.completionTokens'],
        totalTokens:
          response.attributes['ai.usage.promptTokens'] +
          response.attributes['ai.usage.completionTokens'],
        model: model || response.attributes['ai.usage.model'],
        isEstimated: false
      };
    }

    // gen_ai 패턴 검색
    if (
      response.attributes['gen_ai.usage.prompt_tokens'] !== undefined &&
      response.attributes['gen_ai.usage.completion_tokens'] !== undefined
    ) {
      return {
        promptTokens: response.attributes['gen_ai.usage.prompt_tokens'],
        completionTokens: response.attributes['gen_ai.usage.completion_tokens'],
        totalTokens:
          response.attributes['gen_ai.usage.prompt_tokens'] +
          response.attributes['gen_ai.usage.completion_tokens'],
        model: model || response.attributes['gen_ai.usage.model'],
        isEstimated: false
      };
    }
  }

  // 아무것도 찾지 못했으면 undefined 반환
  return undefined;
}

/**
 * 입력과 출력으로 토큰 사용량 계산
 */
export function calculateTokenUsage(
  prompt: string | Record<string, any>,
  output: any,
  model: string = 'default'
): TokenUsage {
  const counter = TokenCounterFactory.createCounter(model);
  
  // 입력 토큰 계산
  const promptText = typeof prompt === 'string' ? prompt : JSON.stringify(prompt);
  const promptTokens = counter.countTokens(promptText);
  
  // 출력 토큰 계산
  const outputText = typeof output === 'string' ? output : JSON.stringify(output);
  const completionTokens = counter.countTokens(outputText);
  
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    model,
    isEstimated: true
  };
}