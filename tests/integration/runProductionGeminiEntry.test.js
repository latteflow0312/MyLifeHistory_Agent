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
import { buildSyntheticWorkspace, runGeminiProductionEntry, formatSafeError } from '../../scripts/run-production-gemini.mjs';
import { AiAdapterTimeoutError } from '../../src/aiAdapter/withTimeout.js';
import { collectSources } from '../../src/collector/collector.js';
import { normalizeSource } from '../../src/normalizer/normalizer.js';
import { buildDailyPackage } from '../../src/dailyPackageBuilder/dailyPackageBuilder.js';
import { initializeProcessingState, openProcessingState } from '../../src/processingState/processingState.js';
import { createFakeAiAdapter } from '../fakes/fakeAiAdapter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENTRY_SOURCE_PATH = join(__dirname, '..', '..', 'scripts', 'run-production-gemini.mjs');
const PIPELINE_SOURCE_PATH = join(__dirname, '..', '..', 'src', 'integration', 'productionPipeline.js');
const SUMMARIZER_SOURCE_PATH = join(__dirname, '..', '..', 'src', 'summarizer', 'summarizer.js');
const VALIDATOR_SOURCE_PATH = join(__dirname, '..', '..', 'src', 'validator', 'aiOutputValidator.js');
const WRITER_SOURCE_PATH = join(__dirname, '..', '..', 'src', 'artifactWriter', 'productionDailyWriter.js');
const STATE_SOURCE_PATH = join(__dirname, '..', '..', 'src', 'processingState', 'processingState.js');

const TARGET_DATE = '2026-09-13';

function setupWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'mlh-gemini-entry-'));
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

const noopLog = () => {};

test('invalid argument diagnostics preserve technical phrases and redact all trailing payload', () => {
  for (const message of ['invalid headersTimeout', 'invalid signal', 'invalid dispatcher', 'invalid x-goog-api-key header', 'invalid onError method']) {
    assert.ok(formatSafeError({ cause: { code: 'UND_ERR_INVALID_ARG', message } }).endsWith(`Cause message: ${message}`));
    for (const payload of ['AIza' + 'x'.repeat(35), 'Authorization: Bearer secret', 'https://example.com/?key=secret',
      'private prompt and source', '{"request":"secret","response":"secret"}', '\n at private.js:1:1']) {
      const output = formatSafeError({ cause: { code: 'UND_ERR_INVALID_ARG', message: `${message}: ${payload}` } });
      assert.ok(output.endsWith(`Cause message: ${message} [redacted]`));
      assert.ok(!output.includes(payload));
    }
  }
  for (const message of ['secret apiKey=value', 'https://example.com/?key=secret', 'invalid privateSourceContent', 'invalid signalSECRET', 42]) {
    assert.ok(formatSafeError({ cause: { code: 'UND_ERR_INVALID_ARG', message } }).endsWith('Cause message: [withheld]'));
  }
  assert.ok(formatSafeError({ cause: { code: 'OTHER', message: 'invalid signal' } }).endsWith('Cause message: [withheld]'));
  assert.ok(formatSafeError({ cause: { cause: { code: 'UND_ERR_INVALID_ARG', message: 'invalid dispatcher' } } }).endsWith('Cause 2 message: invalid dispatcher'));
});

test('network identifiers: known and new uppercase codes are preserved', () => {
  for (const code of ['ECONNRESET', 'ENOTFOUND', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'EAI_AGAIN', 'UND_ERR_NEW_CODE_2', 'E'.repeat(64)]) {
    const output = formatSafeError({ code, cause: { code } });
    assert.ok(output.includes(`Error code: ${code}\n`));
    assert.ok(output.endsWith(`Cause code: ${code}`));
  }
});

test('network identifiers: invalid and credential-like codes are withheld', () => {
  for (const code of [42, {}, ['ECONNRESET'], '', 'E'.repeat(65), 'ECONNRESET\n', 'secret apiKey=private',
    'https://example.com/?key=private', 'AIza' + 'x'.repeat(35), 'API_KEY_SECRET', 'BEARER_TOKEN', 'ERR bad']) {
    const output = formatSafeError({ code, cause: { code } });
    assert.ok(output.includes('Error code: [withheld]'));
    assert.ok(output.endsWith('Cause code: [withheld]'));
  }
});

test('nested cause: safe names and constructors are shown only through depth two', () => {
  class ConnectTimeoutError extends Error {}
  const cause = new ConnectTimeoutError('private message');
  cause.name = 'ConnectTimeoutError';
  cause.code = 'UND_ERR_CONNECT_TIMEOUT';
  cause.cause = { name: 'Error', code: 'ENOTFOUND', cause: { code: 'ECONNRESET' } };
  const output = formatSafeError(new TypeError('fetch failed', { cause }));
  assert.ok(output.includes('Cause name: ConnectTimeoutError'));
  assert.ok(output.includes('Cause constructor name: ConnectTimeoutError'));
  assert.ok(output.includes('Cause 2 code: ENOTFOUND'));
  assert.ok(!output.includes('ECONNRESET'));
  assert.ok(!output.includes('private message'));
  cause.cause = cause;
  assert.ok(!formatSafeError({ cause }).includes('Cause 2'));
});

test('nested cause: sensitive metadata, URL, bodies and stack are never dumped', () => {
  const prompt = readFileSync(join(__dirname, '..', '..', 'prompts', 'daily_summary.md'), 'utf8');
  for (const value of ['AIza' + 'x'.repeat(35), 'Authorization: Bearer private', prompt, 'private source content',
    'https://example.com/?key=private', '{"body":"private"}', 'Error: private\n at private.js:1:1']) {
    const inner = { name: value, code: value, constructor: { name: value }, message: value,
      request: { body: value }, response: { body: value }, stack: value };
    const output = formatSafeError({ cause: { ...inner, cause: inner } });
    assert.ok(!output.includes(value));
    assert.ok(output.includes('Cause 2 name: [withheld]'));
    assert.ok(output.includes('Cause 2 constructor name: [withheld]'));
    assert.ok(output.includes('Cause 2 code: [withheld]'));
  }
});

test('safe diagnostics: fetch failed preserves safe cause code and message', () => {
  const err = new TypeError('fetch failed', { cause: Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }) });
  assert.equal(formatSafeError(err), 'FAIL\nError name: TypeError\nError message: fetch failed\nCause name: Error\nCause constructor name: Error\nCause code: ECONNRESET\nCause message: socket hang up');
});

test('safe diagnostics: ordinary Error without cause and non-Error throws are safe', () => {
  assert.equal(formatSafeError(new Error('arbitrary failure')), 'FAIL\nError name: Error\nError message: [withheld]');
  for (const err of [null, undefined, 'private thrown text', 42]) {
    assert.equal(formatSafeError(err), 'FAIL\nError name: [withheld]\nError message: [withheld]');
  }
});

test('safe diagnostics: timeout and top-level code remain useful', () => {
  assert.equal(formatSafeError(new AiAdapterTimeoutError(60000)), 'FAIL\nError name: AiAdapterTimeoutError\nError message: AI Adapter call timed out after 60000ms');
  assert.ok(formatSafeError(Object.assign(new Error('fetch failed'), { code: 'ETIMEDOUT' })).includes('Error code: ETIMEDOUT'));
});

test('safe diagnostics: secrets, prompt, source, bodies and stack never enter output', () => {
  const prompt = readFileSync(join(__dirname, '..', '..', 'prompts', 'daily_summary.md'), 'utf8');
  const sensitive = ['AIza' + 'x'.repeat(35), 'Authorization: Bearer synthetic-secret', prompt,
    'private source content', '{"raw_response":"private"}', 'Error: private\n    at private.js:1:1'];
  for (const value of sensitive) {
    const err = new Error(value, { cause: { code: value, message: value } });
    err.name = value;
    err.code = value;
    err.stack = value;
    err.request = { body: value };
    err.response = { body: value };
    const output = formatSafeError(err);
    assert.equal(output, 'FAIL\nError name: [withheld]\nError message: [withheld]\nError code: [withheld]\nCause constructor name: [withheld]\nCause code: [withheld]\nCause message: [withheld]');
    assert.ok(!output.includes(value));
    assert.ok(!formatSafeError(new Error(`fetch failed ${value}`)).includes(value));
  }
});

test('safe diagnostics: provider error identity propagates once without Artifact or State changes', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), 'synthetic source', 'utf8');
    const state = openProcessingState(ws.stateFilePath);
    const before = readFileSync(ws.stateFilePath, 'utf8');
    const err = new TypeError('fetch failed', { cause: { code: 'ECONNRESET', message: 'socket hang up' } });
    let calls = 0;
    await assert.rejects(runGeminiProductionEntry({
      dailyPackage: buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE),
      promptFilePath: ws.promptFilePath, state, outputDirectory: ws.outputDirectory,
      aiAdapter: { execute: async () => { calls += 1; throw err; } }, log: noopLog,
    }), (caught) => caught === err);
    assert.equal(calls, 1);
    assert.deepEqual(readdirSync(ws.outputDirectory), []);
    assert.equal(readFileSync(ws.stateFilePath, 'utf8'), before);
  } finally { teardown(ws.root); }
});

test('safe diagnostics: CLI uses safe formatter and retains failure exit status', () => {
  const source = readFileSync(ENTRY_SOURCE_PATH, 'utf8');
  assert.match(source, /console\.log\(formatSafeError\(err\)\);\s*process\.exitCode = 1;/);
  assert.ok(!source.includes('FAIL: ${err.message}'));
});

test('buildSyntheticWorkspace: 실제 Production Prompt 경로는 cwd와 무관하고 데이터는 temp에 격리된다', () => {
  const originalCwd = process.cwd();
  let ws;
  try {
    process.chdir(tmpdir());
    ws = buildSyntheticWorkspace();
    assert.equal(ws.promptFilePath, join(__dirname, '..', '..', 'prompts', 'daily_summary.md'));
    assert.equal(dirname(ws.root), tmpdir());
    assert.equal(ws.sourceDir, join(ws.root, 'sources'));
    assert.equal(ws.outputDirectory, join(ws.root, 'production-output'));
    assert.equal(ws.stateFilePath, join(ws.root, 'state.json'));
    assert.deepEqual(readdirSync(ws.root).sort(), ['production-output', 'sources', 'state.json']);
    assert.deepEqual(readdirSync(ws.sourceDir), ['gemini-entry-smoke.txt']);
    assert.equal(readFileSync(join(ws.sourceDir, 'gemini-entry-smoke.txt'), 'utf8'),
      'Phase 10 Gemini production entry synthetic smoke test.\n');
    assert.deepEqual(readdirSync(ws.outputDirectory), []);
  } finally {
    process.chdir(originalCwd);
    if (ws) teardown(ws.root);
  }
});

test('runGeminiProductionEntry: 실제 Production Prompt 전체가 instructions로 전달된다 (offline)', async (t) => {
  const ws = buildSyntheticWorkspace();
  const credentialName = 'MYLIFEHISTORY_GEMINI_API_KEY';
  const originalDescriptor = Object.getOwnPropertyDescriptor(process.env, credentialName);
  delete process.env[credentialName];
  const network = t.mock.method(globalThis, 'fetch', () => {
    throw new Error('Network must not be used by the wiring test');
  });
  try {
    const instructions = readFileSync(ws.promptFilePath, 'utf8');
    for (const heading of ['## 오늘의 한 문장', '## Tag', '## Source']) {
      assert.ok(instructions.includes(heading));
    }
    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    const aiAdapter = createFakeAiAdapter();
    const result = await runGeminiProductionEntry({
      dailyPackage, promptFilePath: ws.promptFilePath, state,
      outputDirectory: ws.outputDirectory, aiAdapter, log: noopLog,
    });
    assert.equal(result.status, 'complete');
    assert.equal(aiAdapter.calls.length, 1);
    assert.equal(aiAdapter.calls[0].instructions, instructions);
    assert.equal(dirname(result.artifactPath), ws.outputDirectory);
    assert.equal(openProcessingState(ws.stateFilePath).isProcessed(dailyPackage.sources[0].content_hash), true);
    assert.equal(network.mock.callCount(), 0);
    assert.equal(existsSync(join(ws.root, 'daily_summary.md')), false);
  } finally {
    if (originalDescriptor) Object.defineProperty(process.env, credentialName, originalDescriptor);
    else delete process.env[credentialName];
    teardown(ws.root);
  }
});

test('run-production-gemini.mjs: placeholder prompt 생성 코드가 없다', () => {
  const source = readFileSync(ENTRY_SOURCE_PATH, 'utf8');
  assert.ok(!source.includes('Return a short markdown response using only the supplied source(s).'));
  assert.ok(!/writeFileSync\(\s*promptFilePath/.test(source));
});

// ---- A. Normal Completion ----

test('runGeminiProductionEntry: 정상 흐름은 complete로 끝난다 (Fake Adapter, 실제 SHA-256 hash 사용)', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '첫 번째 기록\n', 'utf8');
    writeFileSync(join(ws.sourceDir, 'b.md'), '두 번째 기록\n', 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    // Smoke Test의 "synthetic-gemini-smoke-test" 같은 임의 문자열이 아니라
    // 실제 normalizeSource가 계산한 64자리 SHA-256 hash를 사용한다.
    for (const source of dailyPackage.sources) {
      assert.match(source.content_hash, /^[0-9a-f]{64}$/);
    }

    const aiAdapter = createFakeAiAdapter();

    const result = await runGeminiProductionEntry({
      dailyPackage,
      promptFilePath: ws.promptFilePath,
      state,
      outputDirectory: ws.outputDirectory,
      aiAdapter,
      log: noopLog,
    });

    assert.equal(result.status, 'complete');
    assert.equal(result.sourceCount, 2);
    assert.ok(existsSync(result.artifactPath));
    for (const source of dailyPackage.sources) {
      assert.equal(state.isProcessed(source.content_hash), true);
    }
    assert.equal(aiAdapter.calls.length, 1);
  } finally {
    teardown(ws.root);
  }
});

// ---- B. Empty Input ----

test('runGeminiProductionEntry: 신규 Source가 없으면 skipped_empty_input, AI 0회', async () => {
  const ws = setupWorkspace();
  try {
    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    const aiAdapter = createFakeAiAdapter();

    const result = await runGeminiProductionEntry({
      dailyPackage,
      promptFilePath: ws.promptFilePath,
      state,
      outputDirectory: ws.outputDirectory,
      aiAdapter,
      log: noopLog,
    });

    assert.deepEqual(result, { status: 'skipped_empty_input', artifactPath: null, sourceCount: 0 });
    assert.equal(aiAdapter.calls.length, 0);
    assert.deepEqual(readdirSync(ws.outputDirectory), []);
  } finally {
    teardown(ws.root);
  }
});

// ---- C. Existing Artifact ----

test('runGeminiProductionEntry: 기존 Artifact가 있으면 human_review_required, AI 0회, overwrite 없음', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록\n', 'utf8');
    const existingContent = '# 2026-09-13\n\n이미 확정된 기존 Artifact\n';
    writeFileSync(join(ws.outputDirectory, `${TARGET_DATE}.md`), existingContent, 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    const aiAdapter = createFakeAiAdapter();

    const result = await runGeminiProductionEntry({
      dailyPackage,
      promptFilePath: ws.promptFilePath,
      state,
      outputDirectory: ws.outputDirectory,
      aiAdapter,
      log: noopLog,
    });

    assert.equal(result.status, 'human_review_required');
    assert.equal(aiAdapter.calls.length, 0);
    const after = readFileSync(join(ws.outputDirectory, `${TARGET_DATE}.md`), 'utf8');
    assert.equal(after, existingContent, '기존 Artifact가 1바이트도 변경되면 안 된다');
  } finally {
    teardown(ws.root);
  }
});

// ---- D. Adapter Failure ----

test('runGeminiProductionEntry: Adapter 실패는 그대로 전파되고 Artifact/State 변화가 없다', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록\n', 'utf8');
    const beforeState = readFileSync(ws.stateFilePath, 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    const aiAdapter = createFakeAiAdapter({ fail: true, failureMessage: 'forced adapter failure' });

    await assert.rejects(
      () =>
        runGeminiProductionEntry({
          dailyPackage,
          promptFilePath: ws.promptFilePath,
          state,
          outputDirectory: ws.outputDirectory,
          aiAdapter,
          log: noopLog,
        }),
      /forced adapter failure/
    );

    assert.deepEqual(readdirSync(ws.outputDirectory), []);
    assert.equal(readFileSync(ws.stateFilePath, 'utf8'), beforeState);
  } finally {
    teardown(ws.root);
  }
});

// ---- E. Validator Failure ----

test('runGeminiProductionEntry: Validator 실패 시 Writer가 호출되지 않고 State도 변경되지 않는다', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록\n', 'utf8');
    const beforeState = readFileSync(ws.stateFilePath, 'utf8');

    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    const aiAdapter = createFakeAiAdapter({ output: '형식을 전혀 지키지 않은 출력' });

    await assert.rejects(() =>
      runGeminiProductionEntry({
        dailyPackage,
        promptFilePath: ws.promptFilePath,
        state,
        outputDirectory: ws.outputDirectory,
        aiAdapter,
        log: noopLog,
      })
    );

    assert.deepEqual(readdirSync(ws.outputDirectory), [], 'Writer가 호출되어서는 안 된다');
    assert.equal(readFileSync(ws.stateFilePath, 'utf8'), beforeState);
  } finally {
    teardown(ws.root);
  }
});

// ---- F. Writer Failure ----

test('runGeminiProductionEntry: Writer 실패 시 State가 변경되지 않는다', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록\n', 'utf8');
    const beforeState = readFileSync(ws.stateFilePath, 'utf8');

    // temp 파일 경로 자리에 디렉터리를 만들어 Writer의 writeFileSync를 실패시킨다
    // (기존 productionDailyWriter 테스트와 동일한 패턴, Writer 자체는 무수정).
    mkdirSync(join(ws.outputDirectory, `${TARGET_DATE}.md.tmp`));

    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);
    const aiAdapter = createFakeAiAdapter();

    await assert.rejects(() =>
      runGeminiProductionEntry({
        dailyPackage,
        promptFilePath: ws.promptFilePath,
        state,
        outputDirectory: ws.outputDirectory,
        aiAdapter,
        log: noopLog,
      })
    );

    assert.equal(existsSync(join(ws.outputDirectory, `${TARGET_DATE}.md`)), false);
    assert.equal(readFileSync(ws.stateFilePath, 'utf8'), beforeState);
  } finally {
    teardown(ws.root);
  }
});

// ---- G. State Commit Failure ----

test('runGeminiProductionEntry: Writer 성공 후 State Commit 실패 시 recovery_required, Artifact 유지', async () => {
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

    const result = await runGeminiProductionEntry({
      dailyPackage,
      promptFilePath: ws.promptFilePath,
      state: failingState,
      outputDirectory: ws.outputDirectory,
      aiAdapter,
      log: noopLog,
    });

    assert.equal(result.status, 'recovery_required');
    assert.ok(existsSync(result.artifactPath), 'Artifact는 삭제되지 않고 유지되어야 한다');
    assert.equal(readFileSync(ws.stateFilePath, 'utf8'), beforeState, '실제 State 파일은 변경되지 않아야 한다');
  } finally {
    teardown(ws.root);
  }
});

// ---- Credential Boundary ----

test('runGeminiProductionEntry: Credential이 없으면 실제 Adapter 호출 전에 안전하게 실패한다 (아직 aiAdapter 미주입 시)', async () => {
  const ws = setupWorkspace();
  const CREDENTIAL_ENV_VAR = 'MYLIFEHISTORY_GEMINI_API_KEY';
  const hadOriginal = Object.prototype.hasOwnProperty.call(process.env, CREDENTIAL_ENV_VAR);
  const original = process.env[CREDENTIAL_ENV_VAR];
  delete process.env[CREDENTIAL_ENV_VAR];

  try {
    writeFileSync(join(ws.sourceDir, 'a.md'), '기록\n', 'utf8');
    const state = openProcessingState(ws.stateFilePath);
    const dailyPackage = buildDailyPackageFromSourceDir(ws.sourceDir, state, TARGET_DATE);

    await assert.rejects(
      () =>
        runGeminiProductionEntry({
          dailyPackage,
          promptFilePath: ws.promptFilePath,
          state,
          outputDirectory: ws.outputDirectory,
          log: noopLog,
          // aiAdapter 의도적으로 미주입 -> 실제 createGeminiAdapter() 경로를 타야 함
        }),
      /environment variable/
    );

    assert.deepEqual(readdirSync(ws.outputDirectory), []);
  } finally {
    if (hadOriginal) {
      process.env[CREDENTIAL_ENV_VAR] = original;
    } else {
      delete process.env[CREDENTIAL_ENV_VAR];
    }
    teardown(ws.root);
  }
});

// ---- Source Scan: Provider Boundary ----

test('run-production-gemini.mjs: Gemini 관련 코드는 이 파일과 geminiAdapter.js에만 존재한다', () => {
  const productionFiles = [
    PIPELINE_SOURCE_PATH,
    SUMMARIZER_SOURCE_PATH,
    VALIDATOR_SOURCE_PATH,
    WRITER_SOURCE_PATH,
    STATE_SOURCE_PATH,
  ];
  for (const filePath of productionFiles) {
    const source = readFileSync(filePath, 'utf8');
    assert.ok(!/gemini/i.test(source), `${filePath}에 Gemini 관련 코드가 있어서는 안 된다`);
  }
});

test('run-production-gemini.mjs: Provider Router/switch/fallback 로직이 없다', () => {
  const source = readFileSync(ENTRY_SOURCE_PATH, 'utf8');
  // 설명 주석에서 "Gemini, OpenAI, or any other Provider"처럼 다른 Provider를
  // 언급할 수는 있으므로, 실제 import/호출 형태만 검사한다.
  assert.ok(!/createOpenAiAdapter/.test(source), 'Gemini 전용 Entry가 다른 Provider Adapter를 호출해서는 안 된다');
  assert.ok(!/from\s+['"].*openAiAdapter/.test(source), 'Gemini 전용 Entry가 다른 Provider Adapter를 import해서는 안 된다');
  assert.ok(!/switch\s*\(/.test(source), 'Provider 선택을 위한 switch 분기가 없어야 한다');
});

test('run-production-gemini.mjs: Credential을 process.env에서 직접 읽지 않는다', () => {
  const source = readFileSync(ENTRY_SOURCE_PATH, 'utf8');
  assert.ok(
    !/process\.env(\.\w+|\[)/.test(source),
    'Entry는 process.env를 직접 읽지 않고 createGeminiAdapter()/loadAiCredential()에 위임해야 한다'
  );
});

test('run-production-gemini.mjs: 자동 Retry 루프가 없다', () => {
  const source = readFileSync(ENTRY_SOURCE_PATH, 'utf8');
  assert.ok(!/for\s*\(.*retry/i.test(source));
  assert.ok(!/while\s*\(/.test(source));
});
