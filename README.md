```
echo '{
  "promptName": "semo-expert-system-prompt",
  "variables": {
    "TodoList": "# 비타 500 같은 브랜드 만들기",
    "SelectedTodo": "비타 500 같은 브랜드 만들기"
  },
  "model": "openai:gpt-4o-mini"
}' | npx tsx --env-file=.env src/json-executor.ts
```