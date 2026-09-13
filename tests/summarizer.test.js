import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { summarize } from '../src/summarizer/summarizer.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SUMMARIZER_SOURCE_PATH = join(__dirname, '..', 'src', 'summarizer', 'summarizer.js');

const SAMPLE_PROMPT_PACKAGE = { date: '2026-09-13', instructions: '지침', sources: [] };

test('summarize: aiAdapter.execute를 호출하고 결과 문자열을 그대로 반환한다', async () => {
  const fakeAdapter = {
    async execute(promptPackage) {
      assert.deepEqual(promptPackage, SAMPLE_PROMPT_PACKAGE);
      return '## raw ai output';
    },
  };

  const result = await summarize(SAMPLE_PROMPT_PACKAGE, fakeAdapter);
  assert.equal(result, '## raw ai output');
});

test('summarize: aiAdapter.execute가 실패하면 오류가 그대로 전파된다', async () => {
  const fakeAdapter = {
    async execute() {
      throw new Error('adapter failure');
    },
  };

  await assert.rejects(() => summarize(SAMPLE_PROMPT_PACKAGE, fakeAdapter), /adapter failure/);
});

test('summarize: execute가 없는 adapter는 오류를 던진다', async () => {
  await assert.rejects(() => summarize(SAMPLE_PROMPT_PACKAGE, {}));
});

test('summarize: execute 결과가 문자열이 아니면 오류를 던진다', async () => {
  const fakeAdapter = {
    async execute() {
      return { not: 'a string' };
    },
  };

  await assert.rejects(() => summarize(SAMPLE_PROMPT_PACKAGE, fakeAdapter));
});

test('summarize: promptPackage가 객체가 아니면 오류를 던진다', async () => {
  const fakeAdapter = {
    async execute() {
      return 'x';
    },
  };

  await assert.rejects(() => summarize(null, fakeAdapter));
});

test('summarizer.js: Writer/State/Google Drive를 전혀 참조하지 않는다', () => {
  const source = readFileSync(SUMMARIZER_SOURCE_PATH, 'utf8');
  assert.ok(!/from\s+['"].*processingState/.test(source), 'Processing State를 import해서는 안 된다');
  assert.ok(!/from\s+['"].*artifactWriter/.test(source), 'Artifact Writer를 import해서는 안 된다');
  assert.ok(!source.includes('MY_LIFE_HISTORY'));
});
