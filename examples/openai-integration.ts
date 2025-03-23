/**
 * OpenAI 통합 예제
 *
 * OpenAI 프로바이더를 사용하여 텔레메트리 추적하는 예제입니다.
 */

import { initializeTelemetry, OpenAIProvider } from '../src';

// 이 예제에서는 실제 OpenAI 클라이언트를 직접 가져오지 않고,
// 모의 클라이언트를 생성하여 사용합니다.
const mockOpenAIClient = {
  chat: {
    completions: {
      create: async (options: any) => {
        console.log('> OpenAI API 호출 (모의):', options);
        await sleep(500); // API 호출 시뮬레이션
        
        // 모의 응답 반환
        return {
          model: options.model,
          usage: {
            prompt_tokens: 20,
            completion_tokens: 15,
            total_tokens: 35
          },
          choices: [
            {
              message: {
                role: 'assistant',
                content: '이것은 모의 OpenAI 응답입니다. 실제 API 응답을 모방합니다.'
              }
            }
          ]
        };
      }
    }
  }
};

async function main() {
  // 텔레메트리 초기화
  const telemetry = initializeTelemetry({
    enabled: true,
    debug: true,
    appName: 'openai-example'
  });
  
  // OpenAI 프로바이더 초기화
  const openaiProvider = new OpenAIProvider(mockOpenAIClient, {
    defaultModel: 'gpt-3.5-turbo'
  });
  
  // 트레이스 생성
  const trace = telemetry.traceManager.createTrace({
    name: 'openai-workflow',
    metadata: {
      description: 'OpenAI API 호출 예제'
    },
    tags: ['example', 'openai']
  });
  
  console.log(`트레이스 생성됨: ${trace.id}`);
  
  // 사용자 질문 처리 스팬
  const processSpan = trace.startSpan({
    name: 'process-user-question',
    metadata: {
      questionType: 'general'
    }
  });
  
  try {
    console.log('사용자 질문 처리 중...');
    
    // OpenAI API 호출
    const response = await openaiProvider.generateWithTelemetry(
      "What is artificial intelligence?",
      {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 150,
        trace: trace,  // 트레이스 연결
        parentSpanId: processSpan.id,  // 부모 스팬 연결
        metadata: {
          purpose: 'user-question',
          source: 'web-app'
        },
        name: 'ai-definition-query'
      }
    );
    
    console.log('\n> 응답 콘텐츠:', response.content);
    console.log('> 토큰 사용량:', response.usage);
    
    // 스팬 종료
    processSpan.end({
      status: 'success',
      output: response.content,
      metadata: {
        tokenUsage: response.usage,
        responseTime: 500
      }
    });
    
    // 후속 질문 처리
    const followUpSpan = trace.startSpan({
      name: 'follow-up-question',
      metadata: {
        questionType: 'follow-up'
      }
    });
    
    console.log('\n후속 질문 처리 중...');
    
    // 후속 질문을 위한 OpenAI API 호출
    const followUpResponse = await openaiProvider.generateWithTelemetry(
      [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What is artificial intelligence?' },
        { role: 'assistant', content: response.content },
        { role: 'user', content: 'How is AI used in healthcare?' }
      ],
      {
        trace: trace,
        parentSpanId: followUpSpan.id,
        metadata: {
          purpose: 'follow-up-question',
          source: 'web-app'
        },
        name: 'ai-healthcare-query'
      }
    );
    
    console.log('\n> 후속 응답 콘텐츠:', followUpResponse.content);
    console.log('> 후속 토큰 사용량:', followUpResponse.usage);
    
    // 후속 스팬 종료
    followUpSpan.end({
      status: 'success',
      output: followUpResponse.content,
      metadata: {
        tokenUsage: followUpResponse.usage,
        responseTime: 500
      }
    });
    
    // 트레이스 종료
    await trace.end({
      status: 'completed',
      metadata: {
        totalQuestions: 2,
        totalTokens:
          (response.usage?.totalTokens || 0) +
          (followUpResponse.usage?.totalTokens || 0)
      }
    });
  } catch (error) {
    console.error('오류 발생:', error);
    
    // 오류 발생 시 스팬 종료
    if (processSpan) {
      processSpan.end({
        status: 'error',
        error: error,
        metadata: {
          errorType: error instanceof Error ? error.constructor.name : 'UnknownError',
          errorMessage: error instanceof Error ? error.message : String(error)
        }
      });
    }
    
    // 트레이스 종료
    await trace.end({
      status: 'failed',
      metadata: {
        errorReason: error instanceof Error ? error.message : String(error)
      }
    });
  }
  
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