import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDevelopmentPipeline } from '../../src/integration/developmentPipeline.js';
import { initializeProcessingState, openProcessingState } from '../../src/processingState/processingState.js';
import { computeContentHash } from '../../src/normalizer/normalizer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_SOURCE_PATH = join(__dirname, '..', '..', 'src', 'integration', 'developmentPipeline.js');

const TARGET_DATE = '2026-09-13';
const PROMPT_TEXT = '# 지침\r\n\r\n테스트용 지침 원문입니다.\n';

function setupWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'mlh-pipeline-'));
  const sourceDir = join(root, 'sources');
  const outputDirectory = join(root, 'dev-output');
  const promptFilePath = join(root, 'daily_summary.md');
  const stateFilePath = join(root, 'state.json');

  mkdirSync(sourceDir);
  mkdirSync(outputDirectory);
  writeFileSync(promptFilePath, PROMPT_TEXT, 'utf8');
  initializeProcessingState(stateFilePath);

  return { root, sourceDir, outputDirectory, promptFilePath, stateFilePath };
}

function teardown(root) {
  rmSync(root, { recursive: true, force: true });
}

test('runDevelopmentPipeline: 전체 흐름이 정상적으로 연결되어 Artifact를 생성한다', () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '첫 번째 기록\n', 'utf8');
    writeFileSync(join(ws.sourceDir, 'b.txt'), '두 번째 기록\n', 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    const result = runDevelopmentPipeline({
      sourceDir: ws.sourceDir,
      promptFilePath: ws.promptFilePath,
      state,
      targetDate: TARGET_DATE,
      outputDirectory: ws.outputDirectory,
    });

    assert.equal(result.status, 'written');
    assert.equal(result.sourceCount, 2);

    const artifactPath = join(ws.outputDirectory, `${TARGET_DATE}_prompt-package.json`);
    assert.equal(result.artifactPath, artifactPath);

    const parsed = JSON.parse(readFileSync(artifactPath, 'utf8'));
    assert.equal(parsed.date, TARGET_DATE);
    assert.equal(parsed.instructions, PROMPT_TEXT);
    const filenames = parsed.sources.map((s) => s.filename).sort();
    assert.deepEqual(filenames, ['a.md', 'b.txt']);
  } finally {
    teardown(ws.root);
  }
});

test('runDevelopmentPipeline: 이미 처리된 Source는 제외하고 신규만 포함한다', () => {
  const ws = setupWorkspace();
  try {
    const contentA = '이미 처리된 기록\n';
    const contentB = '아직 처리되지 않은 기록\n';
    writeFileSync(join(ws.sourceDir, 'a.md'), contentA, 'utf8');
    writeFileSync(join(ws.sourceDir, 'b.md'), contentB, 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    state.markProcessed({ content_hash: computeContentHash(contentA) });

    const result = runDevelopmentPipeline({
      sourceDir: ws.sourceDir,
      promptFilePath: ws.promptFilePath,
      state,
      targetDate: TARGET_DATE,
      outputDirectory: ws.outputDirectory,
    });

    assert.equal(result.status, 'written');
    assert.equal(result.sourceCount, 1);

    const artifactPath = join(ws.outputDirectory, `${TARGET_DATE}_prompt-package.json`);
    const parsed = JSON.parse(readFileSync(artifactPath, 'utf8'));
    assert.deepEqual(parsed.sources.map((s) => s.filename), ['b.md']);
  } finally {
    teardown(ws.root);
  }
});

test('runDevelopmentPipeline: 모든 Source가 이미 처리되었으면 Artifact를 생성하지 않는다', () => {
  const ws = setupWorkspace();
  try {
    const content = '이미 처리된 기록\n';
    writeFileSync(join(ws.sourceDir, 'a.md'), content, 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    state.markProcessed({ content_hash: computeContentHash(content) });

    const result = runDevelopmentPipeline({
      sourceDir: ws.sourceDir,
      promptFilePath: ws.promptFilePath,
      state,
      targetDate: TARGET_DATE,
      outputDirectory: ws.outputDirectory,
    });

    assert.deepEqual(result, { status: 'skipped_empty_input', date: TARGET_DATE });
    assert.deepEqual(readdirSync(ws.outputDirectory), []);
  } finally {
    teardown(ws.root);
  }
});

test('runDevelopmentPipeline: 소스 디렉터리가 비어있으면 Artifact를 생성하지 않는다', () => {
  const ws = setupWorkspace();
  try {
    const state = openProcessingState(ws.stateFilePath);
    const result = runDevelopmentPipeline({
      sourceDir: ws.sourceDir,
      promptFilePath: ws.promptFilePath,
      state,
      targetDate: TARGET_DATE,
      outputDirectory: ws.outputDirectory,
    });

    assert.deepEqual(result, { status: 'skipped_empty_input', date: TARGET_DATE });
    assert.deepEqual(readdirSync(ws.outputDirectory), []);
  } finally {
    teardown(ws.root);
  }
});

test('runDevelopmentPipeline: 기존 Artifact가 있으면 재실행 시 오류를 던지고 overwrite하지 않는다', () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록\n', 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    runDevelopmentPipeline({
      sourceDir: ws.sourceDir,
      promptFilePath: ws.promptFilePath,
      state,
      targetDate: TARGET_DATE,
      outputDirectory: ws.outputDirectory,
    });

    const artifactPath = join(ws.outputDirectory, `${TARGET_DATE}_prompt-package.json`);
    const before = readFileSync(artifactPath, 'utf8');

    assert.throws(() =>
      runDevelopmentPipeline({
        sourceDir: ws.sourceDir,
        promptFilePath: ws.promptFilePath,
        state,
        targetDate: TARGET_DATE,
        outputDirectory: ws.outputDirectory,
      })
    );

    const after = readFileSync(artifactPath, 'utf8');
    assert.equal(after, before, '기존 Artifact 내용이 변경되어서는 안 된다');
  } finally {
    teardown(ws.root);
  }
});

test('runDevelopmentPipeline: 실행 후 Processing State 파일이 변경되지 않는다 (markProcessed 미호출)', () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록\n', 'utf8');
    const before = readFileSync(ws.stateFilePath, 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    runDevelopmentPipeline({
      sourceDir: ws.sourceDir,
      promptFilePath: ws.promptFilePath,
      state,
      targetDate: TARGET_DATE,
      outputDirectory: ws.outputDirectory,
    });

    const after = readFileSync(ws.stateFilePath, 'utf8');
    assert.equal(after, before, 'Processing State 파일이 변경되어서는 안 된다');
  } finally {
    teardown(ws.root);
  }
});

test('runDevelopmentPipeline: markProcessed를 호출하려 하면 실패하는 spy state로도 안전하게 통과한다', () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록\n', 'utf8');

    const realState = openProcessingState(ws.stateFilePath);
    const spyState = {
      isProcessed: (hash) => realState.isProcessed(hash),
      markProcessed: () => {
        throw new Error('markProcessed must never be called by the pipeline');
      },
    };

    const result = runDevelopmentPipeline({
      sourceDir: ws.sourceDir,
      promptFilePath: ws.promptFilePath,
      state: spyState,
      targetDate: TARGET_DATE,
      outputDirectory: ws.outputDirectory,
    });

    assert.equal(result.status, 'written');
  } finally {
    teardown(ws.root);
  }
});

test('runDevelopmentPipeline: 실행 후 Source 원본 파일이 변경되지 않는다', () => {
  const ws = setupWorkspace();
  try {
    const contentA = '원본이 유지되어야 하는 기록\n';
    writeFileSync(join(ws.sourceDir, 'a.md'), contentA, 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    runDevelopmentPipeline({
      sourceDir: ws.sourceDir,
      promptFilePath: ws.promptFilePath,
      state,
      targetDate: TARGET_DATE,
      outputDirectory: ws.outputDirectory,
    });

    const after = readFileSync(join(ws.sourceDir, 'a.md'), 'utf8');
    assert.equal(after, contentA);
  } finally {
    teardown(ws.root);
  }
});

test('runDevelopmentPipeline: 잘못된 targetDate 형식이면 오류를 전파한다', () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록\n', 'utf8');
    const state = openProcessingState(ws.stateFilePath);

    assert.throws(() =>
      runDevelopmentPipeline({
        sourceDir: ws.sourceDir,
        promptFilePath: ws.promptFilePath,
        state,
        targetDate: '2026/09/13',
        outputDirectory: ws.outputDirectory,
      })
    );
    assert.deepEqual(readdirSync(ws.outputDirectory), []);
  } finally {
    teardown(ws.root);
  }
});

test('runDevelopmentPipeline: 로그 이벤트를 통해 success/empty_input을 확인할 수 있다', () => {
  const ws = setupWorkspace();
  try {
    const lines = [];
    const fakeLogger = {
      success: (msg) => lines.push(`[SUCCESS] ${msg}`),
      skip: () => {},
      invalidInput: () => {},
      duplicate: () => {},
      emptyInput: (msg) => lines.push(`[EMPTY_INPUT] ${msg}`),
      error: (msg) => lines.push(`[ERROR] ${msg}`),
    };

    const state = openProcessingState(ws.stateFilePath);

    // 1) 빈 입력 -> empty_input 로그
    const emptyResult = runDevelopmentPipeline({
      sourceDir: ws.sourceDir,
      promptFilePath: ws.promptFilePath,
      state,
      targetDate: TARGET_DATE,
      outputDirectory: ws.outputDirectory,
      logger: fakeLogger,
    });
    assert.equal(emptyResult.status, 'skipped_empty_input');

    // 2) 신규 Source 추가 후 -> success 로그
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록\n', 'utf8');
    const writtenResult = runDevelopmentPipeline({
      sourceDir: ws.sourceDir,
      promptFilePath: ws.promptFilePath,
      state,
      targetDate: TARGET_DATE,
      outputDirectory: ws.outputDirectory,
      logger: fakeLogger,
    });
    assert.equal(writtenResult.status, 'written');

    assert.ok(lines.some((line) => line.startsWith('[EMPTY_INPUT]')));
    assert.ok(lines.some((line) => line.startsWith('[SUCCESS]')));
  } finally {
    teardown(ws.root);
  }
});

test('developmentPipeline.js: 실제 AI Adapter를 import하거나 실행하지 않는다', () => {
  const source = readFileSync(PIPELINE_SOURCE_PATH, 'utf8');
  assert.ok(!source.includes('aiAdapter'), 'Pipeline이 AI Adapter를 import해서는 안 된다');
  assert.ok(!source.includes('.execute('), 'Pipeline이 AI 실행을 호출해서는 안 된다');
});

test('developmentPipeline.js: Google Drive 경로를 하드코딩하지 않는다', () => {
  const source = readFileSync(PIPELINE_SOURCE_PATH, 'utf8');
  assert.ok(!source.includes('내 드라이브'));
  assert.ok(!source.includes('MY_LIFE_HISTORY'));
  assert.ok(!/[A-Za-z]:\\\\/.test(source));
});

test('developmentPipeline.js: markProcessed를 호출하는 코드가 없다', () => {
  const source = readFileSync(PIPELINE_SOURCE_PATH, 'utf8');
  // 설명 주석에서 "markProcessed를 호출하지 않는다"를 언급할 수는 있으므로,
  // 실제 메서드 호출 형태(예: state.markProcessed(...))만 검사한다.
  assert.ok(!/\.markProcessed\s*\(/.test(source));
});
