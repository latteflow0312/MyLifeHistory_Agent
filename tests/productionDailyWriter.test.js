import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeProductionDailyArtifact } from '../src/artifactWriter/productionDailyWriter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WRITER_SOURCE_PATH = join(__dirname, '..', 'src', 'artifactWriter', 'productionDailyWriter.js');

const TARGET_DATE = '2026-09-13';
const SAMPLE_CONTENT = '# 2026-09-13\n\n- 기록\n\n## 오늘의 한 문장\n\n> 문장\n';

function makeTempOutputDir() {
  return mkdtempSync(join(tmpdir(), 'mlh-production-writer-'));
}

test('writeProductionDailyArtifact: 정상적으로 YYYY-MM-DD.md를 저장한다', () => {
  const dir = makeTempOutputDir();
  try {
    const finalPath = writeProductionDailyArtifact(SAMPLE_CONTENT, TARGET_DATE, dir);
    assert.equal(finalPath, join(dir, '2026-09-13.md'));
    const saved = readFileSync(finalPath, 'utf8');
    assert.equal(saved, SAMPLE_CONTENT);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeProductionDailyArtifact: outputDirectory는 외부에서 주입된다', () => {
  const dirA = makeTempOutputDir();
  const dirB = makeTempOutputDir();
  try {
    writeProductionDailyArtifact(SAMPLE_CONTENT, TARGET_DATE, dirA);
    writeProductionDailyArtifact(SAMPLE_CONTENT, TARGET_DATE, dirB);
    assert.ok(readdirSync(dirA).includes('2026-09-13.md'));
    assert.ok(readdirSync(dirB).includes('2026-09-13.md'));
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test('writeProductionDailyArtifact: 기존 Artifact가 있으면 overwrite하지 않고 오류를 던진다', () => {
  const dir = makeTempOutputDir();
  try {
    writeProductionDailyArtifact(SAMPLE_CONTENT, TARGET_DATE, dir);
    const before = readFileSync(join(dir, '2026-09-13.md'), 'utf8');

    assert.throws(() =>
      writeProductionDailyArtifact('다른 내용으로 덮어쓰려는 시도\n', TARGET_DATE, dir)
    );

    const after = readFileSync(join(dir, '2026-09-13.md'), 'utf8');
    assert.equal(after, before, '기존 Production Artifact 내용이 변경되어서는 안 된다');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeProductionDailyArtifact: Atomic Write 후 temp 파일이 남지 않는다', () => {
  const dir = makeTempOutputDir();
  try {
    writeProductionDailyArtifact(SAMPLE_CONTENT, TARGET_DATE, dir);
    const tmpFiles = readdirSync(dir).filter((name) => name.endsWith('.tmp'));
    assert.deepEqual(tmpFiles, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeProductionDailyArtifact: 실패한 쓰기 시도 후에도 temp 파일이 남지 않는다', () => {
  const dir = makeTempOutputDir();
  try {
    writeProductionDailyArtifact(SAMPLE_CONTENT, TARGET_DATE, dir);
    try {
      writeProductionDailyArtifact(SAMPLE_CONTENT, TARGET_DATE, dir);
    } catch {
      // 의도된 실패
    }
    const tmpFiles = readdirSync(dir).filter((name) => name.endsWith('.tmp'));
    assert.deepEqual(tmpFiles, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeProductionDailyArtifact: 잘못된 targetDate/content/outputDirectory는 오류를 던진다', () => {
  const dir = makeTempOutputDir();
  try {
    assert.throws(() => writeProductionDailyArtifact('', TARGET_DATE, dir));
    assert.throws(() => writeProductionDailyArtifact(SAMPLE_CONTENT, '13-09-2026', dir));
    assert.throws(() => writeProductionDailyArtifact(SAMPLE_CONTENT, TARGET_DATE, ''));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('productionDailyWriter.js: Processing State를 import하거나 호출하지 않는다', () => {
  const source = readFileSync(WRITER_SOURCE_PATH, 'utf8');
  // 설명 주석에서 "Processing State를 모른다"를 언급할 수는 있으므로,
  // 실제 import/호출 형태만 검사한다.
  assert.ok(!/from\s+['"].*processingState/.test(source), 'processingState 모듈을 import해서는 안 된다');
  assert.ok(!/\.markProcessed/.test(source), 'markProcessed(Batch)를 호출해서는 안 된다');
});

test('productionDailyWriter.js: Google Drive/02_DAILY 실제 경로를 하드코딩하지 않는다', () => {
  const source = readFileSync(WRITER_SOURCE_PATH, 'utf8');
  assert.ok(!source.includes('내 드라이브'));
  assert.ok(!source.includes('MY_LIFE_HISTORY'));
  assert.ok(!source.includes('02_DAILY'));
});
