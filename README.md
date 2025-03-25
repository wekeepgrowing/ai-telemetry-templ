# AI Telemetry Template

AI 모델 사용의 관찰 가능성(observability)과 모니터링을 위한 완전한 통합 솔루션. 이 템플릿은 [Vercel AI SDK](https://sdk.vercel.ai/)와 [Langfuse](https://langfuse.com/) 통합을 통해 AI 작업의 성능, 토큰 사용량, 지연 시간 등을 추적할 수 있는 도구를 제공합니다.

## 주요 기능

- 🔍 **AI SDK 래퍼 함수**: 텔레메트리가 내장된 AI SDK 함수 래퍼
- 📊 **상세한 메트릭**: 토큰 사용량, 지연 시간, 성공/실패 등 추적
- 🌊 **스트리밍 지원**: 실시간 스트리밍 응답을 위한 완전한 텔레메트리
- 🧩 **계층적 추적**: 복잡한 AI 워크플로를 위한 트레이스, 스팬, 생성 관계 관리
- 🔄 **개체 생성 및 검증**: Zod 스키마 검증과 통합된 구조화된 출력
- 📝 **토큰 카운팅**: 다양한 모델 제공자를 위한 정확한 토큰 카운팅
- 📚 **텍스트 분할**: 대용량 콘텐츠를 효율적으로 분할하는 유틸리티
- 🧪 **실제 예제**: 즉시 사용 가능한 데모 코드 제공

## 시작하기

### 설치

```bash
# 저장소 복제
git clone https://github.com/your-username/ai-telemetry-templ.git
cd ai-telemetry-templ

# 의존성 설치
npm install
```

### 환경 설정

`.env.example` 파일을 `.env`로 복사하고 필요한 API 키와 설정을 구성하세요:

```bash
cp .env.example .env
```

필수 환경 변수:

- `OPENAI_API_KEY`: OpenAI API 키
- `OPENAI_MODEL`: 사용할 기본 모델 (기본값: gpt-4o)
- `LANGFUSE_PUBLIC_KEY`: Langfuse 퍼블릭 키 (텔레메트리)
- `LANGFUSE_SECRET_KEY`: Langfuse 시크릿 키 (텔레메트리)

### 기본 사용 예제

```typescript
import { model, createTraceManager } from './src/ai';
import { generateTextWithTelemetry } from './src/ai/telemetry-wrappers';

async function example() {
  // 텔레메트리 트레이스 생성
  const { traceManager } = createTraceManager('my-ai-operation');
  
  // 텔레메트리를 포함한 텍스트 생성
  const result = await generateTextWithTelemetry({
    model: model,
    prompt: "간단한 파스타 레시피를 알려줘.",
    // 텔레메트리 옵션
    traceManager: traceManager,
    operationName: 'recipe-generation',
  });
  
  console.log(result.text);
}
```

## 프로젝트 구조

```
ai-telemetry-templ/
├── documents/             # 문서 및 통합 가이드
├── src/                   # 소스 코드
│   ├── ai/                # AI 및 텔레메트리 핵심 기능
│   │   ├── text/          # 텍스트 처리 유틸리티
│   │   ├── index.ts       # 기본 내보내기
│   │   ├── telemetry.ts   # 텔레메트리 코어 기능
│   │   ├── telemetry-wrappers.ts # AI SDK 래퍼 함수
│   │   ├── tokenizer.ts   # 토큰 카운팅 유틸리티
│   │   └── stream-utils.ts # 스트리밍 유틸리티
│   ├── config/            # 환경 및 설정 관리
│   ├── examples/          # 사용 예제
│   └── utils/             # 로깅 및 기타 유틸리티
├── .env.example           # 환경 변수 예제
└── package.json           # 프로젝트 의존성 및 스크립트
```

## 주요 컴포넌트

### TraceManager

AI 작업을 위한 계층적 추적을 관리하는 핵심 클래스:

```typescript
// 트레이스 관리자 생성
const { traceManager, traceId } = createTraceManager('operation-name', {
  // 추가 메타데이터
  userId: 'user-123',
  sessionId: 'session-456',
});

// 스팬 생성
const spanId = traceManager.startSpan('sub-operation');

// 스팬 완료
traceManager.endSpan(spanId, result);

// 트레이스 완료
await traceManager.finishTrace('success');
```

### 텔레메트리 래퍼 함수

AI SDK 함수의 텔레메트리 지원 버전:

- `generateTextWithTelemetry`: 텍스트 생성을 위한 래퍼
- `generateObjectWithTelemetry`: 구조화된 객체 생성을 위한 래퍼
- `streamTextWithTelemetry`: 텍스트 스트리밍을 위한 래퍼
- `streamObjectWithTelemetry`: 객체 스트리밍을 위한 래퍼

### 토큰 카운팅

다양한 모델 제공자를 위한 토큰 카운팅 유틸리티:

```typescript
import { countTokens, countTokensForModel } from './src/ai';

// 특정 모델 계열에 대한 토큰 계산
const tokens = countTokens(text, ModelFamily.GPT);

// 모델 이름을 사용한 토큰 계산
const tokens = countTokensForModel(text, 'gpt-4o');
```

### 텍스트 분할

대용량 콘텐츠를 처리하기 위한 유틸리티:

```typescript
import { RecursiveCharacterTextSplitter } from './src/ai/text';

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 1000,
  chunkOverlap: 200,
});

const chunks = splitter.splitText(longText);
```

## 스트리밍 예제

스트리밍 응답을 위한, 텔레메트리 지원 포함:

```typescript
import { streamTextWithTelemetry } from './src/ai/telemetry-wrappers';

async function streamExample() {
  const { traceManager } = createTraceManager('streaming-operation');
  
  const result = await streamTextWithTelemetry({
    model: model,
    prompt: "장편 이야기를 작성해줘",
    traceManager: traceManager,
  });
  
  // 스트림 처리
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
}
```

## Langfuse 통합

1. [Langfuse](https://langfuse.com/)에서 계정 생성
2. API 키 생성
3. `.env` 파일에 Langfuse 키 설정
4. [Langfuse 대시보드](https://cloud.langfuse.com)에서 텔레메트리 데이터 확인

## 활용 사례

- **복잡한 AI 워크플로 추적**: 여러 LLM 호출 및 함수 실행의 계층적 추적
- **성능 모니터링**: 모델, 요청, 사용자별 성능 메트릭 수집
- **토큰 사용량 추적**: 비용 최적화를 위한 토큰 사용량 모니터링
- **스트리밍 응답 분석**: 실시간 응답의 흐름과 속도 추적
- **품질 모니터링**: AI 응답 품질에 대한 데이터 수집

## 문제 해결

일반적인 문제에 대한 해결 방법:

1. **텔레메트리가 표시되지 않음**:
   - 환경 변수가 올바르게 설정되었는지 확인
   - `ENABLE_TELEMETRY=true` 설정 확인

2. **트레이스가 완료되지 않음**:
   - `traceManager.finishTrace()`가 호출되었는지 확인
   - `shutdownTelemetry()`로 종료 시 모든 텔레메트리 플러시

## 기여하기

기여는 환영합니다! 이슈를 제출하거나 PR을 보내주세요.

## 라이선스

Internal Use Only. Growing-UP Co., LTd.