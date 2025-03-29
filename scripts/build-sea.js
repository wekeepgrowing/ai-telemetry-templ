#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// 기본 경로 설정
const ROOT_DIR = path.resolve(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const BIN_DIR = path.join(ROOT_DIR, 'bin');

// 실행 파일 이름 설정
const EXECUTABLE_NAME = os.platform() === 'win32' ? 'ai-executor.exe' : 'ai-executor';

// 디렉토리 생성
if (!fs.existsSync(BIN_DIR)) {
  fs.mkdirSync(BIN_DIR, { recursive: true });
}

// 디스트 디렉토리 확인
if (!fs.existsSync(DIST_DIR)) {
  fs.mkdirSync(DIST_DIR, { recursive: true });
}

// 스크립트 실행 함수
function runCommand(command) {
  console.log(`실행: ${command}`);
  execSync(command, { stdio: 'inherit', cwd: ROOT_DIR });
}

// 메인 프로세스
async function main() {
  try {
    // 1. 타입스크립트 빌드
    console.log('1. TypeScript 빌드 중...');
    runCommand('npm run build');

    // 2. 번들러로 파일 합치기 (esbuild 사용)
    console.log('2. 단일 JS 파일로 번들링 중...');
    if (!fs.existsSync(path.join(ROOT_DIR, 'node_modules/esbuild'))) {
      runCommand('npm install --no-save esbuild');
    }
    
    runCommand('npx esbuild dist/json-executor.js --bundle --platform=node --target=node23 --outfile=dist/bundled-executor.js');
    
    // 실행 권한 부여
    if (os.platform() !== 'win32') {
      runCommand('chmod +x dist/bundled-executor.js');
    }
    
    // 3. SEA 설정 파일 생성
    console.log('3. Single Executable 설정 파일 생성 중...');
    const seaConfig = {
      main: path.join(DIST_DIR, 'bundled-executor.js'),
      output: path.join(DIST_DIR, 'sea-prep.blob'),
      disableExperimentalSEAWarning: true,
      useSnapshot: false,
      useCodeCache: true
    };
    
    fs.writeFileSync(
      path.join(DIST_DIR, 'sea-config.json'),
      JSON.stringify(seaConfig, null, 2)
    );
    
    // 4. SEA blob 생성
    console.log('4. SEA blob 생성 중...');
    runCommand('node --experimental-sea-config dist/sea-config.json');
    
    // 5. Node 실행 파일 복사
    console.log('5. Node 실행 파일 복사 중...');
    const nodePath = process.execPath;
    const targetPath = path.join(BIN_DIR, EXECUTABLE_NAME);
    
    // 기존 파일이 있으면 삭제
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
    
    fs.copyFileSync(nodePath, targetPath);
    
    // 실행 권한 부여
    if (os.platform() !== 'win32') {
      runCommand(`chmod +x ${targetPath}`);
    }
    
    // 6. 서명 제거 (macOS와 Windows만)
    if (os.platform() === 'darwin') {
      console.log('6. macOS 바이너리 서명 제거 중...');
      try {
        runCommand(`codesign --remove-signature ${targetPath}`);
      } catch (error) {
        console.warn('서명 제거 중 오류가 발생했습니다. 계속 진행합니다:', error.message);
      }
    } else if (os.platform() === 'win32') {
      console.log('6. Windows에서는 서명 제거를 건너뜁니다...');
      // signtool이 있다면 여기서 실행할 수 있음
    }
    
    // 7. postject 설치 및 blob 삽입
    console.log('7. blob 삽입 중...');
    if (!fs.existsSync(path.join(ROOT_DIR, 'node_modules/postject'))) {
      runCommand('npm install --no-save postject');
    }
    
    let postjectCmd = `npx postject "${targetPath}" NODE_SEA_BLOB "${path.join(DIST_DIR, 'sea-prep.blob')}" --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`;
    
    if (os.platform() === 'darwin') {
      postjectCmd += ' --macho-segment-name NODE_SEA';
    }
    
    try {
      runCommand(postjectCmd);
    } catch (error) {
      console.error('postject 실행 중 오류가 발생했습니다:', error.message);
      console.log('권한 문제일 수 있습니다. 수동으로 실행해 보세요:');
      console.log(postjectCmd);
      process.exit(1);
    }
    
    // 8. 바이너리 서명 (macOS와 Windows만)
    if (os.platform() === 'darwin') {
      console.log('8. macOS 바이너리 다시 서명 중...');
      try {
        runCommand(`codesign --sign - "${targetPath}"`);
      } catch (error) {
        console.warn('서명 중 오류가 발생했습니다:', error.message);
      }
    } else if (os.platform() === 'win32') {
      console.log('8. Windows에서는 서명을 건너뜁니다...');
      // signtool이 있다면 여기서 실행할 수 있음
    }
    
    console.log(`빌드 완료! 실행 파일: ${targetPath}`);
    console.log('실행 방법:');
    console.log(`${targetPath} [인자]`);
    
  } catch (error) {
    console.error('빌드 오류:', error);
    process.exit(1);
  }
}

main(); 