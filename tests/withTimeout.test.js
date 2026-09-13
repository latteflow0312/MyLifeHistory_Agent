import { test } from 'node:test';
import assert from 'node:assert/strict';
import { withTimeout, AiAdapterTimeoutError, DEFAULT_TIMEOUT_MS } from '../src/aiAdapter/withTimeout.js';
import { assertValidAiAdapter } from '../src/aiAdapter/aiAdapterContract.js';

function delay(ms, value) {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function neverSettles() {
  return new Promise(() => {});
}

test('withTimeout: 기본 Timeout은 60000ms(60초)이다', () => {
  assert.equal(DEFAULT_TIMEOUT_MS, 60_000);
});

test('withTimeout: 정상 Promise는 timeout 이전에 resolve된다', async () => {
  const fastAdapter = {
    async execute() {
      return delay(5, '## fast result');
    },
  };

  const wrapped = withTimeout(fastAdapter, { timeoutMs: 200 });
  const result = await wrapped.execute({ date: '2026-09-13' });
  assert.equal(result, '## fast result');
});

test('withTimeout: 지연 Promise는 timeoutMs 안에 응답하지 않으면 AiAdapterTimeoutError로 실패한다', async () => {
  const slowAdapter = {
    async execute() {
      return delay(200, '## too late');
    },
  };

  const wrapped = withTimeout(slowAdapter, { timeoutMs: 20 });

  await assert.rejects(() => wrapped.execute({ date: '2026-09-13' }), (err) => {
    assert.ok(err instanceof AiAdapterTimeoutError);
    return true;
  });
});

test('withTimeout: timeout error는 name으로 명확히 식별 가능하다', async () => {
  const stuckAdapter = { execute: neverSettles };
  const wrapped = withTimeout(stuckAdapter, { timeoutMs: 15 });

  try {
    await wrapped.execute({ date: '2026-09-13' });
    assert.fail('timeout 오류가 발생해야 한다');
  } catch (err) {
    assert.equal(err.name, 'AiAdapterTimeoutError');
    assert.equal(err.timeoutMs, 15);
  }
});

test('withTimeout: timeout 후에도 원래 adapter를 자동으로 다시 호출하지 않는다 (Retry 없음)', async () => {
  let callCount = 0;
  const stuckAdapter = {
    async execute() {
      callCount += 1;
      return neverSettles();
    },
  };

  const wrapped = withTimeout(stuckAdapter, { timeoutMs: 15 });

  await assert.rejects(() => wrapped.execute({ date: '2026-09-13' }));
  // timeout 시점 이후 약간의 여유를 두고도 추가 호출이 없는지 확인한다.
  await delay(30);
  assert.equal(callCount, 1);
});

test('withTimeout: 일반 Adapter 실패는 timeout과 무관하게 그대로 전파된다', async () => {
  const failingAdapter = {
    async execute() {
      throw new Error('provider rejected the request');
    },
  };

  const wrapped = withTimeout(failingAdapter, { timeoutMs: 200 });

  await assert.rejects(() => wrapped.execute({ date: '2026-09-13' }), /provider rejected the request/);
});

test('withTimeout: timeout 오류 메시지에 Prompt Package 내용이 노출되지 않는다', async () => {
  const sensitivePromptPackage = {
    date: '2026-09-13',
    instructions: 'SENSITIVE_TEST_MARKER_INSTRUCTIONS',
    sources: [{ content: 'SENSITIVE_TEST_MARKER_CONTENT' }],
  };
  const stuckAdapter = { execute: neverSettles };
  const wrapped = withTimeout(stuckAdapter, { timeoutMs: 15 });

  try {
    await wrapped.execute(sensitivePromptPackage);
    assert.fail('timeout 오류가 발생해야 한다');
  } catch (err) {
    assert.ok(!err.message.includes('SENSITIVE_TEST_MARKER_INSTRUCTIONS'));
    assert.ok(!err.message.includes('SENSITIVE_TEST_MARKER_CONTENT'));
  }
});

test('withTimeout: 감싼 결과도 여전히 기존 AI Adapter Contract를 만족한다', () => {
  const fakeAdapter = {
    async execute() {
      return 'ok';
    },
  };
  const wrapped = withTimeout(fakeAdapter);
  assert.doesNotThrow(() => assertValidAiAdapter(wrapped));
});

test('withTimeout: execute가 없는 adapter는 즉시 오류를 던진다', () => {
  assert.throws(() => withTimeout({}));
  assert.throws(() => withTimeout(null));
});
