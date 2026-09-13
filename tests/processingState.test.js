import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  initializeProcessingState,
  openProcessingState,
} from '../src/processingState/processingState.js';

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'mlh-state-'));
}

test('initializeProcessingState: 명시적으로 새 State를 생성한다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    assert.ok(existsSync(stateFilePath));
    const parsed = JSON.parse(readFileSync(stateFilePath, 'utf8'));
    assert.equal(parsed.schema_version, '0.1');
    assert.deepEqual(parsed.processed, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('initializeProcessingState: 이미 State가 존재하면 overwrite하지 않고 오류를 던진다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);
    state.markProcessed({ content_hash: HASH_A });
    const before = readFileSync(stateFilePath, 'utf8');

    assert.throws(() => initializeProcessingState(stateFilePath));

    const after = readFileSync(stateFilePath, 'utf8');
    assert.equal(after, before, '초기화 재시도가 기존 State를 훼손해서는 안 된다');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('openProcessingState: 기존 State를 정상적으로 연다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);
    assert.equal(state.isProcessed(HASH_A), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('openProcessingState: State 파일이 없으면 오류를 던지고 자동 생성하지 않는다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'missing-state.json');
  try {
    assert.throws(() => openProcessingState(stateFilePath));
    assert.equal(existsSync(stateFilePath), false, '자동으로 State 파일을 생성해서는 안 된다');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('openProcessingState: 손상된 JSON이면 오류를 던진다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'corrupt.json');
  writeFileSync(stateFilePath, '{ this is not valid json', 'utf8');
  try {
    assert.throws(() => openProcessingState(stateFilePath), /JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('openProcessingState: 잘못된 State 구조(schema_version 없음)면 오류를 던진다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'bad-schema.json');
  writeFileSync(stateFilePath, JSON.stringify({ processed: {} }), 'utf8');
  try {
    assert.throws(() => openProcessingState(stateFilePath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('openProcessingState: 잘못된 State 구조(processed가 객체가 아님)면 오류를 던진다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'bad-processed.json');
  writeFileSync(
    stateFilePath,
    JSON.stringify({ schema_version: '0.1', processed: 'not-an-object' }),
    'utf8'
  );
  try {
    assert.throws(() => openProcessingState(stateFilePath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('isProcessed: markProcessed 이전에는 false를 반환한다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);
    assert.equal(state.isProcessed(HASH_A), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('markProcessed: 기록 이후 isProcessed가 true를 반환한다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);
    state.markProcessed({ content_hash: HASH_A });
    assert.equal(state.isProcessed(HASH_A), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('markProcessed: 동일 content_hash를 반복 등록해도 State가 무한 증가하지 않는다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);
    state.markProcessed({ content_hash: HASH_A });
    state.markProcessed({ content_hash: HASH_A });
    state.markProcessed({ content_hash: HASH_A });

    const parsed = JSON.parse(readFileSync(stateFilePath, 'utf8'));
    assert.equal(Object.keys(parsed.processed).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('markProcessed: 다른 content_hash는 별도로 정상 등록된다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);
    state.markProcessed({ content_hash: HASH_A });
    state.markProcessed({ content_hash: HASH_B });

    assert.equal(state.isProcessed(HASH_A), true);
    assert.equal(state.isProcessed(HASH_B), true);

    const parsed = JSON.parse(readFileSync(stateFilePath, 'utf8'));
    assert.equal(Object.keys(parsed.processed).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('filename은 중복 판정 Key로 사용되지 않는다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);
    state.markProcessed({ content_hash: HASH_A, filename: 'a.md' });
    state.markProcessed({ content_hash: HASH_A, filename: 'completely-different-name.txt' });

    const parsed = JSON.parse(readFileSync(stateFilePath, 'utf8'));
    assert.equal(Object.keys(parsed.processed).length, 1, 'filename이 달라도 같은 hash는 한 건이어야 한다');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('source_name은 중복 판정 Key로 사용되지 않는다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);
    state.markProcessed({ content_hash: HASH_A, source_name: 'local_file' });
    state.markProcessed({ content_hash: HASH_A, source_name: 'another_source_type' });

    const parsed = JSON.parse(readFileSync(stateFilePath, 'utf8'));
    assert.equal(Object.keys(parsed.processed).length, 1, 'source_name이 달라도 같은 hash는 한 건이어야 한다');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('State는 content 원문을 저장하지 않는다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);
    state.markProcessed({ content_hash: HASH_A, filename: 'a.md', source_name: 'local_file' });

    const parsed = JSON.parse(readFileSync(stateFilePath, 'utf8'));
    const record = parsed.processed[HASH_A];
    assert.deepEqual(Object.keys(record).sort(), ['filename', 'source_name']);
    assert.ok(!('content' in record));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('State 경로는 외부에서 주입되며 하드코딩되지 않는다', () => {
  const dirA = makeTempDir();
  const dirB = makeTempDir();
  try {
    initializeProcessingState(join(dirA, 'state.json'));
    initializeProcessingState(join(dirB, 'state.json'));
    assert.ok(existsSync(join(dirA, 'state.json')));
    assert.ok(existsSync(join(dirB, 'state.json')));
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test('Atomic Write: markProcessed 이후 State 파일이 유효한 JSON으로 남는다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);
    state.markProcessed({ content_hash: HASH_A });

    const parsed = JSON.parse(readFileSync(stateFilePath, 'utf8'));
    assert.equal(parsed.schema_version, '0.1');
    assert.ok(HASH_A in parsed.processed);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Atomic Write: 쓰기 완료 후 임시 파일이 남지 않는다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);
    state.markProcessed({ content_hash: HASH_A });

    const files = readdirSync(dir);
    const tmpFiles = files.filter((name) => name.endsWith('.tmp'));
    assert.deepEqual(tmpFiles, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('markProcessedBatch: 여러 content_hash를 한 번에 정상 처리한다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);

    state.markProcessedBatch([
      { content_hash: HASH_A, filename: 'a.md' },
      { content_hash: HASH_B, filename: 'b.md' },
    ]);

    assert.equal(state.isProcessed(HASH_A), true);
    assert.equal(state.isProcessed(HASH_B), true);

    const parsed = JSON.parse(readFileSync(stateFilePath, 'utf8'));
    assert.equal(Object.keys(parsed.processed).length, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('markProcessedBatch: 기존 markProcessed로 기록된 항목과 함께 정상 동작한다 (회귀 없음)', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  const HASH_C = 'c'.repeat(64);
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);

    state.markProcessed({ content_hash: HASH_A });
    state.markProcessedBatch([{ content_hash: HASH_B }, { content_hash: HASH_C }]);

    assert.equal(state.isProcessed(HASH_A), true);
    assert.equal(state.isProcessed(HASH_B), true);
    assert.equal(state.isProcessed(HASH_C), true);

    const parsed = JSON.parse(readFileSync(stateFilePath, 'utf8'));
    assert.equal(Object.keys(parsed.processed).length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('markProcessedBatch: 일부 record가 유효하지 않으면 아무것도 반영되지 않는다 (Partial Commit 없음)', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);
    const before = readFileSync(stateFilePath, 'utf8');

    assert.throws(() =>
      state.markProcessedBatch([
        { content_hash: HASH_A },
        { content_hash: 'not-a-valid-hash' },
      ])
    );

    const after = readFileSync(stateFilePath, 'utf8');
    assert.equal(after, before, '검증 실패 시 State 파일이 전혀 변경되어서는 안 된다');
    assert.equal(state.isProcessed(HASH_A), false, '유효했던 항목도 함께 반영되지 않아야 한다');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('markProcessedBatch: Atomic Write 자체가 실패하면 기존 State 파일이 그대로 유지된다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);
    const before = readFileSync(stateFilePath, 'utf8');

    // temp 파일 경로 자리에 디렉터리를 미리 만들어 writeFileSync가 실패하도록 강제한다.
    const tempPathBlocker = join(dir, 'state.json.tmp');
    mkdirSync(tempPathBlocker);

    assert.throws(() => state.markProcessedBatch([{ content_hash: HASH_A }]));

    const after = readFileSync(stateFilePath, 'utf8');
    assert.equal(after, before, 'Atomic Write가 실패해도 기존 State 파일은 훼손되지 않아야 한다');
    assert.equal(state.isProcessed(HASH_A), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('markProcessedBatch: records가 배열이 아니면 오류를 던진다', () => {
  const dir = makeTempDir();
  const stateFilePath = join(dir, 'state.json');
  try {
    initializeProcessingState(stateFilePath);
    const state = openProcessingState(stateFilePath);
    assert.throws(() => state.markProcessedBatch('not-an-array'));
    assert.throws(() => state.markProcessedBatch(null));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
