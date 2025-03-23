/**
 * 유틸리티 모듈 진입점
 *
 * 여러 유틸리티 함수와 클래스를 내보냅니다.
 */

export * from './logger';
export * from './errors';

/**
 * UUID 생성 함수
 */
export function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 현재 타임스탬프 가져오기
 */
export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * 객체를 병합하되 중첩된 객체도 제대로 병합
 */
export function deepMerge<T extends Record<string, any>>(target: T, source: Partial<T>): T {
  const result = { ...target };

  for (const key in source) {
    if (source[key] !== undefined) {
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key])
      ) {
        result[key] = deepMerge(result[key] || {} as any, source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }

  return result;
}

/**
 * 문자열이 비어있는지 확인
 */
export function isEmptyString(str: string | null | undefined): boolean {
  return str === null || str === undefined || str.trim() === '';
}

/**
 * 객체가 비어있는지 확인
 */
export function isEmptyObject(obj: Record<string, any> | null | undefined): boolean {
  return obj === null || obj === undefined || Object.keys(obj).length === 0;
}