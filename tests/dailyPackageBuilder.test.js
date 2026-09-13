import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyPackage } from '../src/dailyPackageBuilder/dailyPackageBuilder.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_C = 'c'.repeat(64);
const TARGET_DATE = '2026-09-13';

function makeFakeState(processedHashes = []) {
  const processed = new Set(processedHashes);
  let markProcessedCalled = false;
  return {
    isProcessed: (hash) => processed.has(hash),
    markProcessed: () => {
      markProcessedCalled = true;
      throw new Error('buildDailyPackage must never call markProcessed');
    },
    wasMarkProcessedCalled: () => markProcessedCalled,
  };
}

test('buildDailyPackage: 모든 Source가 신규이면 전부 포함한다', () => {
  const state = makeFakeState([]);
  const sources = [
    { content_hash: HASH_A, filename: 'a.md' },
    { content_hash: HASH_B, filename: 'b.md' },
  ];
  const pkg = buildDailyPackage(sources, state, TARGET_DATE);
  assert.equal(pkg.sources.length, 2);
});

test('buildDailyPackage: 일부 Source가 이미 processed면 제외한다', () => {
  const state = makeFakeState([HASH_A]);
  const sources = [
    { content_hash: HASH_A, filename: 'a.md' },
    { content_hash: HASH_B, filename: 'b.md' },
  ];
  const pkg = buildDailyPackage(sources, state, TARGET_DATE);
  assert.equal(pkg.sources.length, 1);
  assert.equal(pkg.sources[0].content_hash, HASH_B);
});

test('buildDailyPackage: 모든 Source가 processed이면 빈 결과를 반환한다', () => {
  const state = makeFakeState([HASH_A, HASH_B]);
  const sources = [
    { content_hash: HASH_A, filename: 'a.md' },
    { content_hash: HASH_B, filename: 'b.md' },
  ];
  const pkg = buildDailyPackage(sources, state, TARGET_DATE);
  assert.deepEqual(pkg.sources, []);
});

test('buildDailyPackage: 빈 입력이면 빈 sources를 반환한다', () => {
  const state = makeFakeState([]);
  const pkg = buildDailyPackage([], state, TARGET_DATE);
  assert.deepEqual(pkg, { date: TARGET_DATE, sources: [] });
});

test('buildDailyPackage: filename이 달라도 content_hash가 같으면 판정 기준은 hash다', () => {
  const state = makeFakeState([]);
  const sources = [{ content_hash: HASH_A, filename: 'first-name.md' }];
  const pkg = buildDailyPackage(sources, state, TARGET_DATE);
  assert.equal(pkg.sources.length, 1);
  assert.equal(pkg.sources[0].filename, 'first-name.md');
});

test('buildDailyPackage: filename이 같아도 content_hash가 다르면 둘 다 포함한다', () => {
  const state = makeFakeState([]);
  const sources = [
    { content_hash: HASH_A, filename: 'same.md' },
    { content_hash: HASH_B, filename: 'same.md' },
  ];
  const pkg = buildDailyPackage(sources, state, TARGET_DATE);
  assert.equal(pkg.sources.length, 2);
});

test('buildDailyPackage: 동일 Batch 내 동일 content_hash 중복은 한 건만 포함한다', () => {
  const state = makeFakeState([]);
  const sources = [
    { content_hash: HASH_A, filename: 'a-copy-1.md' },
    { content_hash: HASH_A, filename: 'a-copy-2.md' },
    { content_hash: HASH_B, filename: 'b.md' },
  ];
  const pkg = buildDailyPackage(sources, state, TARGET_DATE);
  assert.equal(pkg.sources.length, 2);
  const hashes = pkg.sources.map((s) => s.content_hash).sort();
  assert.deepEqual(hashes, [HASH_A, HASH_B]);
});

test('buildDailyPackage: 동일 Batch 중복 시 먼저 등장한 항목을 유지한다', () => {
  const state = makeFakeState([]);
  const sources = [
    { content_hash: HASH_A, filename: 'first.md' },
    { content_hash: HASH_A, filename: 'second.md' },
  ];
  const pkg = buildDailyPackage(sources, state, TARGET_DATE);
  assert.equal(pkg.sources.length, 1);
  assert.equal(pkg.sources[0].filename, 'first.md');
});

test('buildDailyPackage: Source 객체 자체를 수정하지 않는다', () => {
  const state = makeFakeState([]);
  const source = { content_hash: HASH_A, filename: 'a.md', content: '원문\n' };
  const snapshot = JSON.parse(JSON.stringify(source));
  buildDailyPackage([source], state, TARGET_DATE);
  assert.deepEqual(source, snapshot);
});

test('buildDailyPackage: Processing State를 변경하지 않는다 (markProcessed 미호출)', () => {
  const state = makeFakeState([]);
  const sources = [
    { content_hash: HASH_A, filename: 'a.md' },
    { content_hash: HASH_B, filename: 'b.md' },
  ];
  buildDailyPackage(sources, state, TARGET_DATE);
  assert.equal(state.wasMarkProcessedCalled(), false);
});

test('buildDailyPackage: targetDate를 그대로 Package에 보존한다', () => {
  const state = makeFakeState([]);
  const pkg = buildDailyPackage([], state, '2026-01-05');
  assert.equal(pkg.date, '2026-01-05');
});

test('buildDailyPackage: 잘못된 targetDate 형식이면 오류를 던진다', () => {
  const state = makeFakeState([]);
  assert.throws(() => buildDailyPackage([], state, '2026/09/13'));
  assert.throws(() => buildDailyPackage([], state, '13-09-2026'));
  assert.throws(() => buildDailyPackage([], state, ''));
  assert.throws(() => buildDailyPackage([], state, undefined));
});

test('buildDailyPackage: source_name과 무관하게 동일한 규칙으로 동작한다 (Provider-independent)', () => {
  const state = makeFakeState([]);
  const sources = [
    { content_hash: HASH_A, filename: 'a.md', source_name: 'local_file' },
    { content_hash: HASH_C, filename: 'c.md', source_name: 'some_other_source_type' },
  ];
  const pkg = buildDailyPackage(sources, state, TARGET_DATE);
  assert.equal(pkg.sources.length, 2);
});

test('buildDailyPackage: Empty Input 결과는 파일 저장/AI 호출 없이 메모리 결과만 반환한다', () => {
  const state = makeFakeState([HASH_A]);
  const sources = [{ content_hash: HASH_A, filename: 'a.md' }];
  const pkg = buildDailyPackage(sources, state, TARGET_DATE);
  assert.deepEqual(pkg, { date: TARGET_DATE, sources: [] });
  assert.equal(state.wasMarkProcessedCalled(), false);
});
