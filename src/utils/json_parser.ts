import * as readline from 'readline';
import { logger } from './logger';

// readline 인터페이스 생성
const rl: readline.Interface = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// 사용자에게 JSON 입력 안내
logger.info('JSON을 한 줄로 입력하세요:');

// 한 줄만 읽어서 처리
rl.once('line', (line: string): void => {
  try {
    // 입력된 한 줄을 JSON으로 파싱
    const jsonObject: unknown = JSON.parse(line);
    
    // 파싱된 객체 출력
    logger.info('파싱된 JSON 객체:', { parsedObject: JSON.stringify(jsonObject) });
  } catch (error) {
    if (error instanceof Error) {
      logger.error('JSON 파싱 오류:', { message: error.message });
    } else {
      logger.error('알 수 없는 오류 발생');
    }
    logger.info('입력된 문자열:', { input: line });
  } finally {
    // 처리 완료 후 readline 인터페이스 종료
    rl.close();
  }
});