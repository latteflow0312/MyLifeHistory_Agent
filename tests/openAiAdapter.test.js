import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpenAiAdapter, DEFAULT_MODEL } from '../src/aiAdapter/openAiAdapter.js';
import { assertValidAiAdapter } from '../src/aiAdapter/aiAdapterContract.js';
import { AiAdapterTimeoutError } from '../src/aiAdapter/withTimeout.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ADAPTER_SOURCE_PATH = join(__dirname, '..', 'src', 'aiAdapter', 'openAiAdapter.js');

const CREDENTIAL_ENV_VAR = 'MYLIFEHISTORY_AI_API_KEY';

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

// 실제 fetch가 AbortSignal로 취소되는 것을 흉내 낸다: signal이 abort되면
// 대기 중인 delay를 즉시 거부한다(실제 network request 취소와 동일한 모양).
function abortableDelay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    if (!signal) {
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      const err = new Error('Request was aborted.');
      err.name = 'APIUserAbortError';
      reject(err);
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function makeFakeClient({ response, fail, failureMessage, delayMs, output_text } = {}) {
  const calls = [];
  const requestOptionsCalls = [];
  return {
    calls,
    requestOptionsCalls,
    responses: {
      async create(request, requestOptions = {}) {
        calls.push(request);
        requestOptionsCalls.push(requestOptions);
        if (delayMs) {
          await abortableDelay(delayMs, requestOptions.signal);
        }
        if (fail) {
          throw new Error(failureMessage ?? 'fake OpenAI failure');
        }
        if (response !== undefined) {
          return response;
        }
        return { output_text: output_text ?? '## fake ai output' };
      },
    },
  };
}

// ---- Contract ----

test('createOpenAiAdapter: assertValidAiAdapter를 통과한다', () => {
  const client = makeFakeClient();
  const adapter = createOpenAiAdapter({ client, model: 'test-model' });
  assert.doesNotThrow(() => assertValidAiAdapter(adapter));
});

test('createOpenAiAdapter: execute()는 Promise<string>을 반환한다', async () => {
  const client = makeFakeClient({ output_text: '## 최종 결과' });
  const adapter = createOpenAiAdapter({ client, model: 'test-model' });
  const result = await adapter.execute(SAMPLE_PROMPT_PACKAGE);
  assert.equal(typeof result, 'string');
  assert.equal(result, '## 최종 결과');
});

// ---- Request Mapping ----

test('createOpenAiAdapter: promptPackage.instructions가 Responses API instructions로 전달된다', async () => {
  const client = makeFakeClient();
  const adapter = createOpenAiAdapter({ client, model: 'test-model' });
  await adapter.execute(SAMPLE_PROMPT_PACKAGE);

  assert.equal(client.calls.length, 1);
  assert.equal(client.calls[0].instructions, SAMPLE_PROMPT_PACKAGE.instructions);
});

test('createOpenAiAdapter: input에 date/filename/content_hash/content가 모두 포함되고 순서가 보존된다', async () => {
  const client = makeFakeClient();
  const adapter = createOpenAiAdapter({ client, model: 'test-model' });
  await adapter.execute(SAMPLE_PROMPT_PACKAGE);

  const input = client.calls[0].input;
  assert.ok(input.includes('2026-09-13'), 'date 포함');
  assert.ok(input.includes('a.md'), 'filename 포함');
  assert.ok(input.includes('a'.repeat(64)), 'content_hash 포함');
  assert.ok(input.includes('첫 번째 기록'), 'content 포함');
  assert.ok(input.includes('b.md'));
  assert.ok(input.includes('b'.repeat(64)));
  assert.ok(input.includes('두 번째 기록'));

  const indexA = input.indexOf('a.md');
  const indexB = input.indexOf('b.md');
  assert.ok(indexA < indexB, 'Source 순서가 보존되어야 한다');
});

test('createOpenAiAdapter: model은 코드에 하드코딩되지 않고 옵션/기본 상수로 관리된다', async () => {
  const client = makeFakeClient();
  const adapter = createOpenAiAdapter({ client, model: 'custom-test-model' });
  await adapter.execute(SAMPLE_PROMPT_PACKAGE);
  assert.equal(client.calls[0].model, 'custom-test-model');
});

test('createOpenAiAdapter: model을 지정하지 않으면 DEFAULT_MODEL을 사용한다', async () => {
  const client = makeFakeClient();
  const adapter = createOpenAiAdapter({ client });
  await adapter.execute(SAMPLE_PROMPT_PACKAGE);
  assert.equal(client.calls[0].model, DEFAULT_MODEL);
});

// ---- Response Normalization ----

test('createOpenAiAdapter: response.output_text를 그대로 문자열로 반환한다', async () => {
  const client = makeFakeClient({ response: { output_text: '정확히 이 문자열' } });
  const adapter = createOpenAiAdapter({ client, model: 'test-model' });
  const result = await adapter.execute(SAMPLE_PROMPT_PACKAGE);
  assert.equal(result, '정확히 이 문자열');
});

test('createOpenAiAdapter: output_text가 없으면 명시적으로 실패한다', async () => {
  const client = makeFakeClient({ response: { id: 'resp_123' } });
  const adapter = createOpenAiAdapter({ client, model: 'test-model' });
  await assert.rejects(() => adapter.execute(SAMPLE_PROMPT_PACKAGE), /output_text/);
});

test('createOpenAiAdapter: output_text가 문자열이 아니면 명시적으로 실패한다', async () => {
  const client = makeFakeClient({ response: { output_text: { nested: true } } });
  const adapter = createOpenAiAdapter({ client, model: 'test-model' });
  await assert.rejects(() => adapter.execute(SAMPLE_PROMPT_PACKAGE), /output_text/);
});

test('createOpenAiAdapter: response 자체가 없으면 명시적으로 실패한다', async () => {
  const client = makeFakeClient({ response: null });
  const adapter = createOpenAiAdapter({ client, model: 'test-model' });
  await assert.rejects(() => adapter.execute(SAMPLE_PROMPT_PACKAGE));
});

// ---- Credential ----

test('createOpenAiAdapter: Credential이 없으면 client 생성 시(실제 호출 전) 명시적으로 실패한다', () => {
  withEnvVar(CREDENTIAL_ENV_VAR, undefined, () => {
    assert.throws(() => createOpenAiAdapter({ model: 'test-model' }), /environment variable/);
  });
});

test('createOpenAiAdapter: Credential이 있으면(fake client 없이도) 실제 Client 생성까지는 성공한다', () => {
  withEnvVar(CREDENTIAL_ENV_VAR, 'unit-test-fake-credential-value-not-a-real-key', () => {
    assert.doesNotThrow(() => createOpenAiAdapter({ model: 'test-model' }));
  });
});

test('createOpenAiAdapter: client를 주입하면 Credential Loader를 거치지 않는다 (테스트가 실제 Key 없이 가능한 이유)', async () => {
  const client = makeFakeClient();
  assert.doesNotThrow(() => createOpenAiAdapter({ client, model: 'test-model' }));
});

test('openAiAdapter.js: Credential을 process.env에서 직접 읽지 않고 credentialLoader만 거친다', () => {
  const source = readFileSync(ADAPTER_SOURCE_PATH, 'utf8');
  // 설명 주석에서 "process.env"를 언급할 수는 있으므로, 실제 접근 형태
  // (process.env.XXX 또는 process.env[...])만 검사한다.
  assert.ok(
    !/process\.env(\.\w+|\[)/.test(source),
    'Adapter는 process.env를 직접 읽어서는 안 되고 loadAiCredential만 사용해야 한다'
  );
  assert.ok(source.includes('loadAiCredential'), 'Adapter는 loadAiCredential을 사용해야 한다');
});

test('openAiAdapter.js: 오류 메시지 생성 코드가 apiKey 값을 보간하지 않는다', () => {
  const source = readFileSync(ADAPTER_SOURCE_PATH, 'utf8');
  assert.ok(!/\$\{apiKey\}/.test(source));
});

// ---- Timeout ----

test('createOpenAiAdapter: timeoutMs 안에 응답하면 정상 반환한다', async () => {
  const client = makeFakeClient({ delayMs: 5, output_text: '## 빠른 응답' });
  const adapter = createOpenAiAdapter({ client, model: 'test-model', timeoutMs: 200 });
  const result = await adapter.execute(SAMPLE_PROMPT_PACKAGE);
  assert.equal(result, '## 빠른 응답');
});

test('createOpenAiAdapter: timeoutMs를 초과하면 AiAdapterTimeoutError로 실패한다', async () => {
  const client = makeFakeClient({ delayMs: 200, output_text: '## 너무 늦음' });
  const adapter = createOpenAiAdapter({ client, model: 'test-model', timeoutMs: 20 });

  await assert.rejects(() => adapter.execute(SAMPLE_PROMPT_PACKAGE), (err) => {
    assert.ok(err instanceof AiAdapterTimeoutError);
    return true;
  });
});

test('createOpenAiAdapter: timeout 발생 시 OpenAI client를 재호출하지 않는다 (Retry 없음)', async () => {
  const client = makeFakeClient({ delayMs: 100 });
  const adapter = createOpenAiAdapter({ client, model: 'test-model', timeoutMs: 15 });

  await assert.rejects(() => adapter.execute(SAMPLE_PROMPT_PACKAGE));
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(client.calls.length, 1);
});

test('createOpenAiAdapter: timeout 시 실제 network request가 취소되도록 AbortSignal을 전달한다 (Promise.race만으로는 취소되지 않음)', async () => {
  const client = makeFakeClient({ delayMs: 100 });
  const adapter = createOpenAiAdapter({ client, model: 'test-model', timeoutMs: 15 });

  await assert.rejects(() => adapter.execute(SAMPLE_PROMPT_PACKAGE));

  assert.equal(client.requestOptionsCalls.length, 1);
  const signal = client.requestOptionsCalls[0].signal;
  assert.ok(signal instanceof AbortSignal, 'OpenAI SDK 호출에 실제 AbortSignal이 전달되어야 한다');
  assert.equal(signal.aborted, true, 'timeout 시 signal이 실제로 abort되어야(=request가 취소되어야) 한다');
});

// ---- Provider Failure ----

test('createOpenAiAdapter: OpenAI client가 reject하면 그 실패가 그대로 전파된다', async () => {
  const client = makeFakeClient({ fail: true, failureMessage: 'rate limit exceeded' });
  const adapter = createOpenAiAdapter({ client, model: 'test-model' });

  await assert.rejects(() => adapter.execute(SAMPLE_PROMPT_PACKAGE), /rate limit exceeded/);
});

test('createOpenAiAdapter: Provider 오류 메시지에 Prompt 전체 내용이 재출력되지 않는다', async () => {
  const sensitivePackage = {
    date: '2026-09-13',
    instructions: 'SENSITIVE_TEST_MARKER_INSTRUCTIONS',
    sources: [{ filename: 'x.md', content_hash: 'c'.repeat(64), content: 'SENSITIVE_TEST_MARKER_CONTENT' }],
  };
  const client = makeFakeClient({ fail: true, failureMessage: 'authentication failed' });
  const adapter = createOpenAiAdapter({ client, model: 'test-model' });

  try {
    await adapter.execute(sensitivePackage);
    assert.fail('오류가 발생해야 한다');
  } catch (err) {
    assert.ok(!err.message.includes('SENSITIVE_TEST_MARKER_INSTRUCTIONS'));
    assert.ok(!err.message.includes('SENSITIVE_TEST_MARKER_CONTENT'));
  }
});

// ---- Retry policy (SDK-level) ----

test('createOpenAiAdapter: 실제 Client 생성 시 OpenAI SDK maxRetries를 0으로 고정한다 (SDK 기본값 2 override)', () => {
  const source = readFileSync(ADAPTER_SOURCE_PATH, 'utf8');
  assert.ok(/maxRetries:\s*0/.test(source), '실제 OpenAI Client 생성 시 maxRetries: 0이 명시되어야 한다');
});

test('createOpenAiAdapter: 매 요청마다 maxRetries: 0을 명시적으로 전달한다 (per-call override)', async () => {
  const client = makeFakeClient();
  const adapter = createOpenAiAdapter({ client, model: 'test-model' });
  await adapter.execute(SAMPLE_PROMPT_PACKAGE);

  assert.equal(client.requestOptionsCalls.length, 1);
  assert.equal(client.requestOptionsCalls[0].maxRetries, 0);
});
