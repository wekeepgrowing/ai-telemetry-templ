# AI 텔레메트리 템플릿

## CLI 사용법

```bash
echo '{
  "promptName": "semo-expert-system-prompt",
  "variables": {
    "TodoList": "# 비타 500 같은 브랜드 만들기",
    "SelectedTodo": "비타 500 같은 브랜드 만들기"
  },
  "model": "openai:gpt-4o-mini"
}' | npx tsx --env-file=.env src/json-executor.ts
```

## 단일 실행 애플리케이션 (SEA)

이 프로젝트는 Node.js v23.10.0 이상에서 단일 실행 애플리케이션을 지원합니다.

### 빌드 방법

1. 관리자 권한으로 빌드 (권장):

```bash
npm run build:sea:sudo
```

2. 일반 권한으로 빌드:

```bash
npm run build:sea
```

### 사용 방법

빌드 후 생성된 실행 파일을 직접 실행할 수 있습니다:

```bash
# JSON 입력을 파이프로 전달
echo '{"promptName": "semo-expert-system-prompt", "variables": {"TodoList": "샘플 할일", "SelectedTodo": "샘플 할일"}, "model": "openai:gpt-4o-mini"}' | ./bin/ai-executor

# 또는 파일에서 입력 받기
cat input.json | ./bin/ai-executor
```

환경 변수는 .env 파일을 통해 설정하거나 명령줄에서 직접 설정할 수 있습니다:

```bash
OPENAI_API_KEY=your-key ./bin/ai-executor < input.json
```