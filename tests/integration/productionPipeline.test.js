import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProductionPipeline } from '../../src/integration/productionPipeline.js';
import { collectSources } from '../../src/collector/collector.js';
import { normalizeSource } from '../../src/normalizer/normalizer.js';
import { buildDailyPackage } from '../../src/dailyPackageBuilder/dailyPackageBuilder.js';
import { initializeProcessingState, openProcessingState } from '../../src/processingState/processingState.js';
import { createFakeAiAdapter } from '../fakes/fakeAiAdapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PIPELINE_SOURCE_PATH = join(__dirname, '..', '..', 'src', 'integration', 'productionPipeline.js');
const SUMMARIZER_SOURCE_PATH = join(__dirname, '..', '..', 'src', 'summarizer', 'summarizer.js');

const TARGET_DATE = '2026-09-13';

function setupWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'mlh-production-'));
  const sourceDir = join(root, 'sources');
  const outputDirectory = join(root, 'production-output');
  const promptFilePath = join(root, 'daily_summary.md');
  const stateFilePath = join(root, 'state.json');

  mkdirSync(sourceDir);
  mkdirSync(outputDirectory);
  writeFileSync(promptFilePath, '# 지침\n\n테스트용 지침 원문.\n', 'utf8');
  initializeProcessingState(stateFilePath);

  return { root, sourceDir, outputDirectory, promptFilePath, stateFilePath };
}

function teardown(root) {
  rmSync(root, { recursive: true, force: true });
}

function buildDailyPackageFromSourceDir(sourceDir, state, targetDate) {
  const rawSources = collectSources(sourceDir);
  const normalized = rawSources.map((source) => normalizeSource(source));
  return buildDailyPackage(normalized, state, targetDate);
}

test('runProductionPipeline: 정상 흐름은 COMPLETE로 끝난다', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '첫 번째 기록\n', 'utf8');
    writeFileSync(join(ws.sourceDir, 'b.md'), '두 번째 기록\n', 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    const aiAdapter = createFakeAiAdapter();

    const result = await runProductionPipeline({
      dailyPackage,
      promptFilePath: ws.promptFilePath,
      aiAdapter,
      state,
      outputDirectory: ws.outputDirectory,
    });

    assert.equal(result.status, 'complete');
    assert.equal(result.sourceCount, 2);
    assert.equal(result.artifactPath, join(ws.outputDirectory, `${TARGET_DATE}.md`));
    assert.ok(existsSync(result.artifactPath));

    const savedContent = readFileSync(result.artifactPath, 'utf8');
    assert.ok(savedContent.startsWith(`# ${TARGET_DATE}`));
    assert.ok(savedContent.includes('## Source'));

    for (const source of dailyPackage.sources) {
      assert.equal(state.isProcessed(source.content_hash), true);
    }

    assert.equal(aiAdapter.calls.length, 1);
  } finally {
    teardown(ws.root);
  }
});

test('runProductionPipeline: 신규 Source가 없으면 skip한다 (AI 0회, Artifact 없음, State 불변)', async () => {
  const ws = setupWorkspace();
  try {
    const beforeState = readFileSync(ws.stateFilePath, 'utf8');
    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    const aiAdapter = createFakeAiAdapter();

    const result = await runProductionPipeline({
      dailyPackage,
      promptFilePath: ws.promptFilePath,
      aiAdapter,
      state,
      outputDirectory: ws.outputDirectory,
    });

    assert.deepEqual(result, { status: 'skipped_empty_input', artifactPath: null, sourceCount: 0 });
    assert.equal(aiAdapter.calls.length, 0);
    assert.deepEqual(readdirSync(ws.outputDirectory), []);

    const afterState = readFileSync(ws.stateFilePath, 'utf8');
    assert.equal(afterState, beforeState);
  } finally {
    teardown(ws.root);
  }
});

test('runProductionPipeline: 기존 Artifact가 있으면 AI 호출 없이 human_review_required를 반환한다', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록\n', 'utf8');

    const existingContent = '# 2026-09-13\n\n사람이 이미 확정/수정한 기존 Artifact\n';
    writeFileSync(join(ws.outputDirectory, `${TARGET_DATE}.md`), existingContent, 'utf8');

    const beforeState = readFileSync(ws.stateFilePath, 'utf8');
    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    const aiAdapter = createFakeAiAdapter();

    const result = await runProductionPipeline({
      dailyPackage,
      promptFilePath: ws.promptFilePath,
      aiAdapter,
      state,
      outputDirectory: ws.outputDirectory,
    });

    assert.equal(result.status, 'human_review_required');
    assert.equal(aiAdapter.calls.length, 0);

    const afterArtifact = readFileSync(join(ws.outputDirectory, `${TARGET_DATE}.md`), 'utf8');
    assert.equal(afterArtifact, existingContent, '기존 Artifact 내용이 1바이트도 바뀌면 안 된다');

    const afterState = readFileSync(ws.stateFilePath, 'utf8');
    assert.equal(afterState, beforeState);
  } finally {
    teardown(ws.root);
  }
});

test('runProductionPipeline: AI 실패 시 Artifact 없음, State 불변', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록\n', 'utf8');
    const beforeState = readFileSync(ws.stateFilePath, 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    const aiAdapter = createFakeAiAdapter({ fail: true, failureMessage: 'forced AI failure' });

    await assert.rejects(
      () =>
        runProductionPipeline({
          dailyPackage,
          promptFilePath: ws.promptFilePath,
          aiAdapter,
          state,
          outputDirectory: ws.outputDirectory,
        }),
      /forced AI failure/
    );

    assert.deepEqual(readdirSync(ws.outputDirectory), []);
    const afterState = readFileSync(ws.stateFilePath, 'utf8');
    assert.equal(afterState, beforeState);
  } finally {
    teardown(ws.root);
  }
});

test('runProductionPipeline: Validator 실패 시 Artifact 없음, State 불변', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록\n', 'utf8');
    const beforeState = readFileSync(ws.stateFilePath, 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    const aiAdapter = createFakeAiAdapter({ output: '형식을 전혀 지키지 않은 출력이다.' });

    await assert.rejects(() =>
      runProductionPipeline({
        dailyPackage,
        promptFilePath: ws.promptFilePath,
        aiAdapter,
        state,
        outputDirectory: ws.outputDirectory,
      })
    );

    assert.deepEqual(readdirSync(ws.outputDirectory), []);
    const afterState = readFileSync(ws.stateFilePath, 'utf8');
    assert.equal(afterState, beforeState);
  } finally {
    teardown(ws.root);
  }
});

test('runProductionPipeline: Writer 실패 시 State가 먼저 변경되지 않고, 최종 Artifact도 생성되지 않는다', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록\n', 'utf8');
    const beforeState = readFileSync(ws.stateFilePath, 'utf8');

    // temp 파일 경로 자리에 디렉터리를 만들어 Writer의 writeFileSync를 실패시킨다.
    mkdirSync(join(ws.outputDirectory, `${TARGET_DATE}.md.tmp`));

    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    const aiAdapter = createFakeAiAdapter();

    await assert.rejects(() =>
      runProductionPipeline({
        dailyPackage,
        promptFilePath: ws.promptFilePath,
        aiAdapter,
        state,
        outputDirectory: ws.outputDirectory,
      })
    );

    assert.equal(existsSync(join(ws.outputDirectory, `${TARGET_DATE}.md`)), false);
    const afterState = readFileSync(ws.stateFilePath, 'utf8');
    assert.equal(afterState, beforeState);
  } finally {
    teardown(ws.root);
  }
});

test('runProductionPipeline: Writer 성공 후 State Commit이 실패하면 recovery_required를 반환하고 Artifact는 유지한다', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록\n', 'utf8');

    const realState = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, realState, TARGET_DATE);
    const beforeState = readFileSync(ws.stateFilePath, 'utf8');

    const failingState = {
      markProcessedBatch: () => {
        throw new Error('forced state commit failure');
      },
    };

    const aiAdapter = createFakeAiAdapter();

    const result = await runProductionPipeline({
      dailyPackage,
      promptFilePath: ws.promptFilePath,
      aiAdapter,
      state: failingState,
      outputDirectory: ws.outputDirectory,
    });

    assert.equal(result.status, 'recovery_required');
    assert.equal(result.sourceCount, 1);
    assert.ok(existsSync(result.artifactPath), 'Artifact는 삭제되지 않고 유지되어야 한다');

    const afterState = readFileSync(ws.stateFilePath, 'utf8');
    assert.equal(afterState, beforeState, '실제 State 파일은 전혀 변경되지 않아야 한다');
  } finally {
    teardown(ws.root);
  }
});

test('runProductionPipeline: 여러 Source가 하나의 Batch로 한 번에 처리 완료된다', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록 A\n', 'utf8');
    writeFileSync(join(ws.sourceDir, 'b.md'), '기록 B\n', 'utf8');
    writeFileSync(join(ws.sourceDir, 'c.md'), '기록 C\n', 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    const aiAdapter = createFakeAiAdapter();

    const result = await runProductionPipeline({
      dailyPackage,
      promptFilePath: ws.promptFilePath,
      aiAdapter,
      state,
      outputDirectory: ws.outputDirectory,
    });

    assert.equal(result.status, 'complete');
    assert.equal(result.sourceCount, 3);

    const parsed = JSON.parse(readFileSync(ws.stateFilePath, 'utf8'));
    assert.equal(Object.keys(parsed.processed).length, 3);
    for (const source of dailyPackage.sources) {
      assert.ok(source.content_hash in parsed.processed);
    }
  } finally {
    teardown(ws.root);
  }
});

test('runProductionPipeline: 생성된 Artifact의 Source Reference가 입력 Daily Package와 일치한다', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록 A\n', 'utf8');
    writeFileSync(join(ws.sourceDir, 'b.md'), '기록 B\n', 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    const aiAdapter = createFakeAiAdapter();

    const result = await runProductionPipeline({
      dailyPackage,
      promptFilePath: ws.promptFilePath,
      aiAdapter,
      state,
      outputDirectory: ws.outputDirectory,
    });

    const savedContent = readFileSync(result.artifactPath, 'utf8');
    for (const source of dailyPackage.sources) {
      assert.ok(
        savedContent.includes(`${source.filename} | sha256:${source.content_hash}`),
        `Artifact에 ${source.filename}의 Source Reference가 정확히 포함되어야 한다`
      );
    }
  } finally {
    teardown(ws.root);
  }
});

test('runProductionPipeline: 실행 후 입력 Source 파일이 변경되지 않는다', async () => {
  const ws = setupWorkspace();
  try {
    const contentA = '원본이 유지되어야 하는 기록\n';
    writeFileSync(join(ws.sourceDir, 'a.md'), contentA, 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    const aiAdapter = createFakeAiAdapter();

    await runProductionPipeline({
      dailyPackage,
      promptFilePath: ws.promptFilePath,
      aiAdapter,
      state,
      outputDirectory: ws.outputDirectory,
    });

    const after = readFileSync(join(ws.sourceDir, 'a.md'), 'utf8');
    assert.equal(after, contentA);
  } finally {
    teardown(ws.root);
  }
});

test('productionPipeline.js / summarizer.js: 개별 markProcessed( 호출이 없다 (Batch만 사용)', () => {
  const pipelineSource = readFileSync(PIPELINE_SOURCE_PATH, 'utf8');
  const summarizerSource = readFileSync(SUMMARIZER_SOURCE_PATH, 'utf8');
  assert.ok(!/\.markProcessed\(/.test(pipelineSource), 'productionPipeline.js는 개별 markProcessed(를 호출해서는 안 된다');
  assert.ok(!/\.markProcessed\(/.test(summarizerSource), 'summarizer.js는 개별 markProcessed(를 호출해서는 안 된다');
  assert.ok(pipelineSource.includes('markProcessedBatch'), 'productionPipeline.js는 markProcessedBatch를 사용해야 한다');
});

test('productionPipeline.js / summarizer.js: 실제 AI Provider나 네트워크 호출이 없다', () => {
  const pipelineSource = readFileSync(PIPELINE_SOURCE_PATH, 'utf8').toLowerCase();
  const summarizerSource = readFileSync(SUMMARIZER_SOURCE_PATH, 'utf8').toLowerCase();
  const combined = pipelineSource + summarizerSource;

  // "google"은 제외한다 - "Google Drive에 접근하지 않는다"는 설명 주석에서
  // 정당하게 등장할 수 있으므로, AI Provider 자체를 가리키는 이름만 검사한다.
  const providerNames = ['openai', 'anthropic', 'gemini', 'claude', 'gpt'];
  for (const name of providerNames) {
    assert.ok(!combined.includes(name), `Provider 이름이 포함됨: ${name}`);
  }

  const networkTerms = ['fetch(', 'xmlhttprequest', 'http.request', 'https.request', 'axios'];
  for (const term of networkTerms) {
    assert.ok(!combined.includes(term), `network 호출 흔적이 포함됨: ${term}`);
  }
});

test('productionPipeline.js / summarizer.js: Google Drive 경로를 하드코딩하지 않는다', () => {
  const pipelineSource = readFileSync(PIPELINE_SOURCE_PATH, 'utf8');
  const summarizerSource = readFileSync(SUMMARIZER_SOURCE_PATH, 'utf8');
  const combined = pipelineSource + summarizerSource;

  assert.ok(!combined.includes('내 드라이브'));
  assert.ok(!combined.includes('MY_LIFE_HISTORY'));
  assert.ok(!combined.includes('02_DAILY'));
});
