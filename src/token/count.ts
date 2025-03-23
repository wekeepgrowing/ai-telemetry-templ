/**
 * 토큰 카운팅 유틸리티
 *
 * 다양한 LLM에 대한 토큰 계산을 제공합니다.
 */

// 토큰 계산기 인터페이스
export interface TokenCounter {
  /**
   * 문자열의 토큰 수 계산
   */
  countTokens(text: string): number;
  
  /**
   * 사용한 인코더 정보 반환
   */
  getEncoderInfo(): { name: string; model?: string };
}

/**
 * 근사값 기반 토큰 계산기
 *
 * 모델별 토큰 계산 라이브러리가 없을 때 사용할 수 있는 간단한 추정기입니다.
 * (tiktoken 등이 설치되지 않은 환경에서 사용)
 */
export class ApproximateTokenCounter implements TokenCounter {
  // 모델별 평균 문자당 토큰 비율
  private static MODEL_RATIOS: Record<string, number> = {
    'default': 0.25,       // 일반적인 영어 텍스트 (4자당 약 1토큰)
    'gpt-4': 0.25,         // GPT-4 모델
    'gpt-3.5-turbo': 0.25, // GPT-3.5 모델
    'claude-3': 0.25,      // Claude-3 모델
    'multilingual': 0.35,  // 다국어 텍스트 (더 많은 토큰 사용)
    'code': 0.3            // 코드 텍스트 (공백과 특수문자가 많음)
  };

  private modelName: string;
  private ratio: number;

  /**
   * 근사 토큰 계산기 생성
   */
  constructor(modelName: string = 'default') {
    this.modelName = modelName;
    this.ratio = ApproximateTokenCounter.MODEL_RATIOS[modelName] ||
                ApproximateTokenCounter.MODEL_RATIOS.default;
  }

  /**
   * 근사적인 토큰 수 계산
   */
  public countTokens(text: string): number {
    if (!text) return 0;
    
    // 문자당 토큰 비율로 개략적 계산
    const tokenCount = Math.ceil(text.length * this.ratio);
    
    // 최소 토큰은 1개
    return Math.max(1, tokenCount);
  }

  /**
   * 인코더 정보 반환
   */
  public getEncoderInfo(): { name: string; model?: string } {
    return {
      name: 'approximate',
      model: this.modelName
    };
  }
}

/**
 * 문자 기반 토큰 계산기
 *
 * 특정 구분자에 기반한 단순 토큰 계산기입니다.
 */
export class CharacterBasedTokenCounter implements TokenCounter {
  private delimiter: string | RegExp;
  private name: string;

  /**
   * 문자 기반 토큰 계산기 생성
   */
  constructor(delimiter: string | RegExp = /\s+/, name: string = 'character-based') {
    this.delimiter = delimiter;
    this.name = name;
  }

  /**
   * 구분자로 나누어 토큰 수 계산
   */
  public countTokens(text: string): number {
    if (!text) return 0;
    
    // 구분자로 나누고 빈 항목 제거
    const tokens = text.split(this.delimiter).filter(t => t.length > 0);
    return tokens.length;
  }

  /**
   * 인코더 정보 반환
   */
  public getEncoderInfo(): { name: string; model?: string } {
    return {
      name: this.name
    };
  }
}

/**
 * 토큰 계산기 팩토리
 *
 * 다양한 모델에 대한 토큰 계산기를 생성합니다.
 */
export class TokenCounterFactory {
  /**
   * 모델에 맞는 토큰 계산기 생성
   */
  public static createCounter(model: string): TokenCounter {
    // 이곳에 tiktoken 등의 정확한 토큰 계산기를 추가할 수 있습니다.
    // 현재는 근사값 계산기만 반환합니다.
    
    if (model.startsWith('gpt-4')) {
      return new ApproximateTokenCounter('gpt-4');
    } else if (model.startsWith('gpt-3.5')) {
      return new ApproximateTokenCounter('gpt-3.5-turbo');
    } else if (model.includes('claude')) {
      return new ApproximateTokenCounter('claude-3');
    } else if (model.includes('code')) {
      return new ApproximateTokenCounter('code');
    }
    
    return new ApproximateTokenCounter();
  }
}