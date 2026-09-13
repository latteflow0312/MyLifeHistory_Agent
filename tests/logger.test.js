import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../src/logger/logger.js';

test('logger: 각 상태를 최소 형태로 출력할 수 있다', () => {
  const lines = [];
  const logger = createLogger({ write: (line) => lines.push(line) });

  logger.success('처리 완료');
  logger.skip('지원하지 않는 확장자');
  logger.invalidInput('필수 필드 누락');
  logger.duplicate('동일 content_hash');
  logger.emptyInput('신규 Source 없음');
  logger.error('설정 파일을 읽을 수 없음');

  assert.equal(lines.length, 6);
  assert.match(lines[0], /^\[SUCCESS\] 처리 완료$/);
  assert.match(lines[1], /^\[SKIP\] 지원하지 않는 확장자$/);
  assert.match(lines[2], /^\[INVALID_INPUT\] 필수 필드 누락$/);
  assert.match(lines[3], /^\[DUPLICATE\] 동일 content_hash$/);
  assert.match(lines[4], /^\[EMPTY_INPUT\] 신규 Source 없음$/);
  assert.match(lines[5], /^\[ERROR\] 설정 파일을 읽을 수 없음$/);
});

test('logger: 예외 없이 기본 메시지를 처리한다', () => {
  const lines = [];
  const logger = createLogger({ write: (line) => lines.push(line) });
  assert.doesNotThrow(() => logger.error('테스트 오류 메시지'));
  assert.equal(lines.length, 1);
});

test('logger: write 옵션이 없어도 예외 없이 동작한다 (기본 콘솔 출력)', () => {
  const logger = createLogger();
  assert.doesNotThrow(() => logger.success('기본 콘솔 출력'));
});
