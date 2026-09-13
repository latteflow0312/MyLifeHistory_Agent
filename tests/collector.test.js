import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectSources } from '../src/collector/collector.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, 'fixtures', 'sample-sources');

function makeTempSourceDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'mlh-collector-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content, 'utf8');
  }
  return dir;
}

test('collectSources: .md 파일을 읽는다', () => {
  const dir = makeTempSourceDir({ 'a.md': '# 제목\n내용\n' });
  try {
    const results = collectSources(dir);
    assert.equal(results.length, 1);
    assert.equal(results[0].filename, 'a.md');
    assert.equal(results[0].rawContent, '# 제목\n내용\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectSources: .txt 파일을 읽는다', () => {
  const dir = makeTempSourceDir({ 'b.txt': '일반 텍스트\n' });
  try {
    const results = collectSources(dir);
    assert.equal(results.length, 1);
    assert.equal(results[0].filename, 'b.txt');
    assert.equal(results[0].rawContent, '일반 텍스트\n');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectSources: .md와 .txt를 동시에 수집한다', () => {
  const dir = makeTempSourceDir({ 'a.md': '마크다운\n', 'b.txt': '텍스트\n' });
  try {
    const results = collectSources(dir);
    const filenames = results.map((r) => r.filename).sort();
    assert.deepEqual(filenames, ['a.md', 'b.txt']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectSources: 지원하지 않는 확장자는 건너뛴다', () => {
  const dir = makeTempSourceDir({
    'a.md': '마크다운\n',
    'ignore.json': '{"x":1}',
    'ignore.png': 'binary-ish',
  });
  try {
    const results = collectSources(dir);
    assert.equal(results.length, 1);
    assert.equal(results[0].filename, 'a.md');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectSources: 빈 디렉터리는 빈 배열을 반환한다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mlh-collector-empty-'));
  try {
    const results = collectSources(dir);
    assert.deepEqual(results, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectSources: 존재하지 않는 디렉터리는 오류를 던진다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mlh-collector-missing-'));
  const missingDir = join(dir, 'does-not-exist');
  try {
    assert.throws(() => collectSources(missingDir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectSources: Source 원문을 그대로 보존한다 (개행/공백 변경 없음)', () => {
  const content = '  앞뒤 공백  \r\nCRLF 줄바꿈\r\n\n빈 줄 포함\n';
  const dir = makeTempSourceDir({ 'raw.txt': content });
  try {
    const results = collectSources(dir);
    assert.equal(results[0].rawContent, content);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectSources: Source 파일 자체를 수정하지 않는다', () => {
  const content = '변경되면 안 되는 원본\n';
  const dir = makeTempSourceDir({ 'keep.md': content });
  try {
    collectSources(dir);
    const after = readFileSync(join(dir, 'keep.md'), 'utf8');
    assert.equal(after, content);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectSources: 입력 디렉터리에 아무 것도 기록하지 않는다', () => {
  const dir = makeTempSourceDir({ 'a.md': '내용\n' });
  try {
    const before = readdirSync(dir).sort();
    collectSources(dir);
    const after = readdirSync(dir).sort();
    assert.deepEqual(after, before);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('collectSources: fixtures/sample-sources 디렉터리를 정상적으로 읽는다', () => {
  const results = collectSources(FIXTURES_DIR);
  const filenames = results.map((r) => r.filename).sort();
  assert.ok(filenames.includes('note1.md'));
  assert.ok(filenames.includes('note2.txt'));
  assert.ok(!filenames.includes('ignore-me.json'));
});
