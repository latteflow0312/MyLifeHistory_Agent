import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertValidAiAdapter, AiAdapterContract } from '../src/aiAdapter/aiAdapterContract.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTRACT_SOURCE_PATH = join(__dirname, '..', 'src', 'aiAdapter', 'aiAdapterContract.js');

// A fake Adapter defined only inside this test file - never in src/,
// so no Provider-specific implementation is ever added to Production code.
function makeFakeAdapter(result) {
  return {
    async execute(promptPackage) {
      return { received: promptPackage, result };
    },
  };
}

test('assertValidAiAdapter: execute(promptPackage)를 구현한 Adapter는 통과한다', () => {
  const fakeAdapter = makeFakeAdapter('ok');
  assert.equal(assertValidAiAdapter(fakeAdapter), true);
});

test('assertValidAiAdapter: execute가 없는 Adapter는 오류를 던진다', () => {
  assert.throws(() => assertValidAiAdapter({}));
});

test('assertValidAiAdapter: 객체가 아니면 오류를 던진다', () => {
  assert.throws(() => assertValidAiAdapter(null));
  assert.throws(() => assertValidAiAdapter('not-an-object'));
});

test('AiAdapterContract: 기본 구현은 execute 호출 시 명확히 미구현임을 알린다', async () => {
  const contract = new AiAdapterContract();
  await assert.rejects(() => contract.execute({ date: '2026-09-13' }));
});

test('fake adapter: Prompt Package를 입력받고 결과를 반환하는 최소 형태를 확인한다', async () => {
  const promptPackage = { date: '2026-09-13', instructions: '지침', sources: [] };
  const fakeAdapter = makeFakeAdapter('fake-result');
  const response = await fakeAdapter.execute(promptPackage);
  assert.deepEqual(response.received, promptPackage);
  assert.equal(response.result, 'fake-result');
});

test('aiAdapterContract.js: Provider 이름을 하드코딩하지 않는다', () => {
  const source = readFileSync(CONTRACT_SOURCE_PATH, 'utf8');
  const providerNames = ['openai', 'anthropic', 'gemini', 'google', 'claude', 'gpt'];
  const lowerSource = source.toLowerCase();
  for (const name of providerNames) {
    assert.ok(!lowerSource.includes(name), `계약 파일에 Provider 이름이 포함됨: ${name}`);
  }
});

test('aiAdapterContract.js: 외부 모듈을 import하지 않는다 (SDK/네트워크 라이브러리 없음)', () => {
  const source = readFileSync(CONTRACT_SOURCE_PATH, 'utf8');
  assert.ok(!/^\s*import\s/m.test(source), '계약 파일은 어떤 모듈도 import하지 않아야 한다');
  assert.ok(!source.includes('require('), '계약 파일은 require()를 사용하지 않아야 한다');
});

test('aiAdapterContract.js: 실제 network 호출 코드가 없다', () => {
  const source = readFileSync(CONTRACT_SOURCE_PATH, 'utf8');
  const networkTerms = ['fetch(', 'XMLHttpRequest', 'http.request', 'https.request', 'axios'];
  for (const term of networkTerms) {
    assert.ok(!source.includes(term), `계약 파일에 network 호출 흔적이 포함됨: ${term}`);
  }
});
