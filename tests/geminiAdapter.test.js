import { test } from 'node:test';
import { GoogleGenAI } from '@google/genai';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGeminiAdapter, DEFAULT_MODEL, CREDENTIAL_ENV_VAR } from '../src/aiAdapter/geminiAdapter.js';
import { assertValidAiAdapter } from '../src/aiAdapter/aiAdapterContract.js';
import { AiAdapterTimeoutError } from '../src/aiAdapter/withTimeout.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADAPTER_SOURCE_PATH = join(__dirname, '..', 'src', 'aiAdapter', 'geminiAdapter.js');

test('Gemini SDK request options reach fetch in valid form without network access', async (t) => {
  const fetchMock = t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`);
    assert.deepEqual(Object.keys(init).sort(), ['body', 'headers', 'method', 'signal']);
    assert.equal(init.method, 'POST');
    assert.ok(init.signal instanceof AbortSignal);
    assert.equal(init.signal.aborted, false);
    assert.equal(init.headers.get('x-server-timeout'), '60');
    assert.equal(init.headers.get('content-type'), 'application/json');
    assert.equal(typeof init.body, 'string');
    assert.doesNotThrow(() => JSON.parse(init.body));
    assert.doesNotThrow(() => new Request(url, init));
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'offline response' }] } }] }),
      { headers: { 'content-type': 'application/json' } });
  });
  const client = new GoogleGenAI({ apiKey: 'offline-placeholder-not-a-real-key', vertexai: false,
    httpOptions: { baseUrl: 'https://generativelanguage.googleapis.com/', apiVersion: 'v1beta' } });
  const result = await createGeminiAdapter({ client }).execute(SAMPLE_PROMPT_PACKAGE);
  assert.equal(result, 'offline response');
  assert.equal(fetchMock.mock.callCount(), 1);
});

const SAMPLE_PROMPT_PACKAGE = {
  date: '2026-09-13',
  instructions: '# 지침\n\n오늘의 기록을 정리해줘.',
  sources: [
    {
      schema_version: '0.1',
      source_name: 'local_file',
      filename: 'a.md',
      content_hash: 'a'.repeat(64),
      content: '첫 번째 기록\n',
    },
    {
      schema_version: '0.1',
      source_name: 'local_file',
      filename: 'b.md',
      content_hash: 'b'.repeat(64),
      content: '두 번째 기록\n',
    },
  ],
};

function withEnvVar(name, value, fn) {
  const hadOriginal = Object.prototype.hasOwnProperty.call(process.env, name);
  const original = process.env[name];

  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }

  try {
    return fn();
  } finally {
    if (hadOriginal) {
      process.env[name] = original;
    } else {
      delete process.env[name];
    }
  }
}

// 실제 fetch가 AbortSignal로 취소되는 것을 흉내 낸다.
function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) {
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      const err = new Error('This operation was aborted');
      err.name = 'AbortError';
      reject(err);
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function makeFakeClient({ response, fail, failureMessage, delayMs, text } = {}) {
  const calls = [];
  return {
    calls,
    models: {
      async generateContent(request) {
        calls.push(request);
        const signal = request?.config?.abortSignal;
        if (delayMs) {
          await abortableDelay(delayMs, signal);
        }
        if (fail) {
          throw new Error(failureMessage ?? 'fake Gemini failure');
        }
        if (response !== undefined) {
          return response;
        }
        return { text: text ?? '## fake gemini output' };
      },
    },
  };
}

// ---- Contract ----

test('createGeminiAdapter: assertValidAiAdapter를 통과한다', () => {
  const client = makeFakeClient();
  const adapter = createGeminiAdapter({ client, model: 'test-model' });
  assert.doesNotThrow(() => assertValidAiAdapter(adapter));
});

test('createGeminiAdapter: execute()는 Promise<string>을 반환한다', async () => {
  const client = makeFakeClient({ text: '## 최종 결과' });
  const adapter = createGeminiAdapter({ client, model: 'test-model' });
  const result = await adapter.execute(SAMPLE_PROMPT_PACKAGE);
  assert.equal(typeof result, 'string');
  assert.equal(result, '## 최종 결과');
});

// ---- Request Mapping ----

test('createGeminiAdapter: promptPackage.instructions가 config.systemInstruction으로 전달된다', async () => {
  const client = makeFakeClient();
  const adapter = createGeminiAdapter({ client, model: 'test-model' });
  await adapter.execute(SAMPLE_PROMPT_PACKAGE);

  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].config.systemInstruction, SAMPLE_PROMPT_PACKAGE.instructions);
});

test('createGeminiAdapter: contents에 date/filename/content_hash/content가 모두 포함되고 순서가 보존된다', async () => {
  const client = makeFakeClient();
  const adapter = createGeminiAdapter({ client, model: 'test-model' });
  await adapter.execute(SAMPLE_PROMPT_PACKAGE);

  const contents = client.calls[0].contents;
  assert.ok(contents.includes('2026-09-13'), 'date 포함');
  assert.ok(contents.includes('a.md'), 'filename 포함');
  assert.ok(contents.includes('a'.repeat(64)), 'content_hash 포함');
  assert.ok(contents.includes('첫 번째 기록'), 'content 포함');
  assert.ok(contents.includes('b.md'));
  assert.ok(contents.includes('b'.repeat(64)));
  assert.ok(contents.includes('두 번째 기록'));

  const indexA = contents.indexOf('a.md');
  const indexB = contents.indexOf('b.md');
  assert.ok(indexA < indexB, 'Source 순서가 보존되어야 한다');
});

test('createGeminiAdapter: model은 코드에 하드코딩되지 않고 옵션/기본 상수로 관리된다', async () => {
  const client = makeFakeClient();
  const adapter = createGeminiAdapter({ client, model: 'custom-test-model' });
  await adapter.execute(SAMPLE_PROMPT_PACKAGE);
  assert.equal(client.calls[0].model, 'custom-test-model');
});

test('createGeminiAdapter: model을 지정하지 않으면 DEFAULT_MODEL을 사용한다', async () => {
  const client = makeFakeClient();
  const adapter = createGeminiAdapter({ client });
  await adapter.execute(SAMPLE_PROMPT_PACKAGE);
  assert.equal(client.calls[0].model, DEFAULT_MODEL);
});

// ---- Response Normalization ----

test('createGeminiAdapter: response.text를 그대로 문자열로 반환한다', async () => {
  const client = makeFakeClient({ response: { text: '정확히 이 문자열' } });
  const adapter = createGeminiAdapter({ client, model: 'test-model' });
  const result = await adapter.execute(SAMPLE_PROMPT_PACKAGE);
  assert.equal(result, '정확히 이 문자열');
});

test('createGeminiAdapter: text가 없으면 명시적으로 실패한다', async () => {
  const client = makeFakeClient({ response: { candidates: [] } });
  const adapter = createGeminiAdapter({ client, model: 'test-model' });
  await assert.rejects(() => adapter.execute(SAMPLE_PROMPT_PACKAGE), /text/);
});

test('createGeminiAdapter: text가 문자열이 아니면 명시적으로 실패한다', async () => {
  const client = makeFakeClient({ response: { text: { nested: true } } });
  const adapter = createGeminiAdapter({ client, model: 'test-model' });
  await assert.rejects(() => adapter.execute(SAMPLE_PROMPT_PACKAGE), /text/);
});

test('createGeminiAdapter: response 자체가 없으면 명시적으로 실패한다', async () => {
  const client = makeFakeClient({ response: null });
  const adapter = createGeminiAdapter({ client, model: 'test-model' });
  await assert.rejects(() => adapter.execute(SAMPLE_PROMPT_PACKAGE));
});

// ---- Credential ----

test('createGeminiAdapter: Credential이 없으면 client 생성 시(실제 호출 전) 명시적으로 실패한다', () => {
  withEnvVar(CREDENTIAL_ENV_VAR, undefined, () => {
    assert.throws(() => createGeminiAdapter({ model: 'test-model' }), /environment variable/);
  });
});

test('createGeminiAdapter: Credential이 있으면(fake client 없이도) 실제 Client 생성까지는 성공한다', () => {
  withEnvVar(CREDENTIAL_ENV_VAR, 'unit-test-fake-credential-value-not-a-real-key', () => {
    assert.doesNotThrow(() => createGeminiAdapter({ model: 'test-model' }));
  });
});

test('createGeminiAdapter: client를 주입하면 Credential Loader를 거치지 않는다', () => {
  const client = makeFakeClient();
  assert.doesNotThrow(() => createGeminiAdapter({ client, model: 'test-model' }));
});

test('geminiAdapter.js: 전용 환경변수 MYLIFEHISTORY_GEMINI_API_KEY를 사용한다', () => {
  assert.equal(CREDENTIAL_ENV_VAR, 'MYLIFEHISTORY_GEMINI_API_KEY');
});

test('geminiAdapter.js: Credential을 process.env에서 직접 읽지 않고 credentialLoader만 거친다', () => {
  const source = readFileSync(ADAPTER_SOURCE_PATH, 'utf8');
  assert.ok(
    !/process\.env(\.\w+|\[)/.test(source),
    'Adapter는 process.env를 직접 읽어서는 안 되고 loadAiCredential만 사용해야 한다'
  );
  assert.ok(source.includes('loadAiCredential'), 'Adapter는 loadAiCredential을 사용해야 한다');
});

test('geminiAdapter.js: 오류 메시지 생성 코드가 apiKey 값을 보간하지 않는다', () => {
  const source = readFileSync(ADAPTER_SOURCE_PATH, 'utf8');
  assert.ok(!/\$\{apiKey\}/.test(source));
});

// ---- Timeout ----

test('createGeminiAdapter: timeoutMs 안에 응답하면 정상 반환한다', async () => {
  const client = makeFakeClient({ delayMs: 5, text: '## 빠른 응답' });
  const adapter = createGeminiAdapter({ client, model: 'test-model', timeoutMs: 200 });
  const result = await adapter.execute(SAMPLE_PROMPT_PACKAGE);
  assert.equal(result, '## 빠른 응답');
});

test('createGeminiAdapter: timeoutMs를 초과하면 AiAdapterTimeoutError로 실패한다', async () => {
  const client = makeFakeClient({ delayMs: 200, text: '## 너무 늦음' });
  const adapter = createGeminiAdapter({ client, model: 'test-model', timeoutMs: 20 });

  await assert.rejects(() => adapter.execute(SAMPLE_PROMPT_PACKAGE), (err) => {
    assert.ok(err instanceof AiAdapterTimeoutError);
    return true;
  });
});

test('createGeminiAdapter: timeout 발생 시 Gemini client를 재호출하지 않는다 (Retry 없음)', async () => {
  const client = makeFakeClient({ delayMs: 100 });
  const adapter = createGeminiAdapter({ client, model: 'test-model', timeoutMs: 15 });

  await assert.rejects(() => adapter.execute(SAMPLE_PROMPT_PACKAGE));
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(client.calls.length, 1);
});

test('createGeminiAdapter: timeout 시 실제 request가 취소되도록 AbortSignal을 전달한다', async () => {
  const client = makeFakeClient({ delayMs: 100 });
  const adapter = createGeminiAdapter({ client, model: 'test-model', timeoutMs: 15 });

  await assert.rejects(() => adapter.execute(SAMPLE_PROMPT_PACKAGE));

  assert.equal(client.calls.length, 1);
  const signal = client.calls[0].config.abortSignal;
  assert.ok(signal instanceof AbortSignal, 'Gemini SDK 호출에 실제 AbortSignal이 전달되어야 한다');
  assert.equal(signal.aborted, true, 'timeout 시 signal이 실제로 abort되어야 한다');
});

// ---- Provider Failure ----

test('createGeminiAdapter: Gemini client가 reject하면 그 실패가 그대로 전파된다', async () => {
  const client = makeFakeClient({ fail: true, failureMessage: 'quota exceeded' });
  const adapter = createGeminiAdapter({ client, model: 'test-model' });

  await assert.rejects(() => adapter.execute(SAMPLE_PROMPT_PACKAGE), /quota exceeded/);
});

test('createGeminiAdapter: Provider 오류 메시지에 Prompt 전체 내용이 재출력되지 않는다', async () => {
  const sensitivePackage = {
    date: '2026-09-13',
    instructions: 'SENSITIVE_TEST_MARKER_INSTRUCTIONS',
    sources: [{ filename: 'x.md', content_hash: 'c'.repeat(64), content: 'SENSITIVE_TEST_MARKER_CONTENT' }],
  };
  const client = makeFakeClient({ fail: true, failureMessage: 'authentication failed' });
  const adapter = createGeminiAdapter({ client, model: 'test-model' });

  try {
    await adapter.execute(sensitivePackage);
    assert.fail('오류가 발생해야 한다');
  } catch (err) {
    assert.ok(!err.message.includes('SENSITIVE_TEST_MARKER_INSTRUCTIONS'));
    assert.ok(!err.message.includes('SENSITIVE_TEST_MARKER_CONTENT'));
  }
});

// ---- Retry policy (SDK-level) ----

test('createGeminiAdapter: 매 요청마다 retryOptions.attempts: 1을 전달한다 (SDK 기본 5회 재시도 override)', async () => {
  const client = makeFakeClient();
  const adapter = createGeminiAdapter({ client, model: 'test-model' });
  await adapter.execute(SAMPLE_PROMPT_PACKAGE);

  assert.equal(client.calls[0].config.httpOptions.retryOptions.attempts, 1);
});

test('geminiAdapter.js: 소스에 retryOptions attempts: 1이 명시되어 있다', () => {
  const source = readFileSync(ADAPTER_SOURCE_PATH, 'utf8');
  assert.ok(/attempts:\s*1/.test(source));
});
