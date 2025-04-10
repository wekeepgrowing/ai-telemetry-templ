#!/bin/bash

# 전체 경로 설정
ROOT_DIR=$(cd "$(dirname "$0")/.." && pwd)
DIST_DIR="$ROOT_DIR/dist"
BIN_DIR="$ROOT_DIR/bin"

echo "단일 실행 애플리케이션 빌드 스크립트"
echo "-----------------------------------"
echo "이 스크립트는 Node.js SEA(Single Executable Application)를 생성합니다."
echo "관리자 권한(sudo)이 필요할 수 있습니다."
echo

# Node.js 버전 확인
NODE_VERSION=$(node --version)
echo "Node.js 버전: $NODE_VERSION"

# 1. TypeScript 빌드
echo "1. 프로젝트 빌드 중..."
npm run build

# 2. SEA 빌드 실행
echo "2. 단일 실행 파일 생성 중..."
node scripts/build-sea.js

# 3. 실패한 경우 수동으로 postject 실행
if [ $? -ne 0 ]; then
  echo "빌드에 실패했습니다. 권한 문제일 수 있으므로 관리자 권한으로 다시 시도합니다."
  
  # macOS인 경우
  if [ "$(uname)" == "Darwin" ]; then
    # 파일 존재 확인
    if [ -f "$DIST_DIR/sea-prep.blob" ] && [ -f "$BIN_DIR/ai-executor" ]; then
      echo "sudo 권한으로 postject 실행 중..."
      sudo npx postject "$BIN_DIR/ai-executor" NODE_SEA_BLOB "$DIST_DIR/sea-prep.blob" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA
      
      echo "sudo 권한으로 바이너리 서명 중..."
      sudo codesign --sign - "$BIN_DIR/ai-executor"
      
      echo "실행 권한 설정..."
      sudo chmod +x "$BIN_DIR/ai-executor"
      
      echo "소유권 변경..."
      sudo chown "$(whoami)" "$BIN_DIR/ai-executor"
    else
      echo "필요한 파일이 생성되지 않았습니다. 빌드 과정을 확인해주세요."
      exit 1
    fi
  # Linux인 경우
  elif [ "$(uname)" == "Linux" ]; then
    if [ -f "$DIST_DIR/sea-prep.blob" ] && [ -f "$BIN_DIR/ai-executor" ]; then
      echo "sudo 권한으로 postject 실행 중..."
      sudo npx postject "$BIN_DIR/ai-executor" NODE_SEA_BLOB "$DIST_DIR/sea-prep.blob" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
      
      echo "실행 권한 설정..."
      sudo chmod +x "$BIN_DIR/ai-executor"
      
      echo "소유권 변경..."
      sudo chown "$(whoami)" "$BIN_DIR/ai-executor"
    else
      echo "필요한 파일이 생성되지 않았습니다. 빌드 과정을 확인해주세요."
      exit 1
    fi
  else
    echo "Windows는 현재 이 스크립트에서 지원하지 않습니다. 수동으로 시도해주세요."
    exit 1
  fi
fi

echo
echo "빌드 완료! 실행 파일: $BIN_DIR/ai-executor"
echo "실행 방법: $BIN_DIR/ai-executor [인자]"
echo 