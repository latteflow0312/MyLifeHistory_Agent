import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAiCredential, DEFAULT_CREDENTIAL_ENV_VAR } from '../src/credential/credentialLoader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CREDENTIAL_LOADER_PATH = join(__dirname, '..', 'src', 'credential', 'credentialLoader.js');

const TEST_ENV_VAR = 'MLH_TEST_ONLY_FAKE_CREDENTIAL_VAR';
const FAKE_VALUE = 'unit-test-fake-credential-value-not-a-real-key';

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

test('loadAiCredential: 환경변수가 있으면 값을 반환한다', () => {
  withEnvVar(TEST_ENV_VAR, FAKE_VALUE, () => {
    const value = loadAiCredential({ envVarName: TEST_ENV_VAR });
    assert.equal(value, FAKE_VALUE);
  });
});

test('loadAiCredential: 환경변수가 없으면 명시적으로 실패한다', () => {
  withEnvVar(TEST_ENV_VAR, undefined, () => {
    assert.throws(() => loadAiCredential({ envVarName: TEST_ENV_VAR }), /is not set/);
  });
});

test('loadAiCredential: 환경변수가 빈 문자열/공백뿐이면 명시적으로 실패한다', () => {
  withEnvVar(TEST_ENV_VAR, '   ', () => {
    assert.throws(() => loadAiCredential({ envVarName: TEST_ENV_VAR }), /is not set/);
  });
});

test('loadAiCredential: 오류 메시지에 실제 Credential 값이 포함되지 않는다', () => {
  withEnvVar(TEST_ENV_VAR, undefined, () => {
    try {
      loadAiCredential({ envVarName: TEST_ENV_VAR });
      assert.fail('loadAiCredential이 오류를 던져야 한다');
    } catch (err) {
      assert.ok(!err.message.includes(FAKE_VALUE));
      assert.ok(err.message.includes(TEST_ENV_VAR), '오류 메시지는 변수 이름은 알려줘야 한다');
    }
  });
});

test('loadAiCredential: envVarName을 생략하면 기본 generic 환경변수 이름을 사용한다', () => {
  assert.equal(DEFAULT_CREDENTIAL_ENV_VAR, 'MYLIFEHISTORY_AI_API_KEY');
});

test('credentialLoader.js: 기본 환경변수 이름이 특정 Provider에 종속되지 않는다', () => {
  const source = readFileSync(CREDENTIAL_LOADER_PATH, 'utf8').toLowerCase();
  const providerNames = ['openai', 'anthropic', 'gemini', 'claude', 'gpt'];
  for (const name of providerNames) {
    assert.ok(!source.includes(name), `credentialLoader.js에 Provider 이름이 포함됨: ${name}`);
  }
});

test('credentialLoader.js: 오류 메시지 생성 코드가 실제 Credential 값을 보간하지 않는다', () => {
  const source = readFileSync(CREDENTIAL_LOADER_PATH, 'utf8');
  assert.ok(!/\$\{value\}/.test(source), '오류 메시지 생성 코드가 원본 Credential 값을 절대 보간해서는 안 된다');
});
