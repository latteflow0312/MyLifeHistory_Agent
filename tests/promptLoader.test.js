import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPrompt } from '../src/prompt/promptLoader.js';

function makeTempPromptFile(content) {
  const dir = mkdtempSync(join(tmpdir(), 'mlh-prompt-'));
  const filePath = join(dir, 'daily_summary.md');
  writeFileSync(filePath, content, 'utf8');
  return { dir, filePath };
}

test('loadPrompt: UTF-8 Markdown을 정상적으로 로드한다', () => {
  const content = '# 제목\n\n한글 본문입니다.\n';
  const { dir, filePath } = makeTempPromptFile(content);
  try {
    assert.equal(loadPrompt(filePath), content);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPrompt: 원문을 정확히 보존한다 (trim/개행 변환 없음)', () => {
  const content = '  앞뒤 공백과\r\n혼합 개행이 있는 내용  \n\n';
  const { dir, filePath } = makeTempPromptFile(content);
  try {
    assert.equal(loadPrompt(filePath), content);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPrompt: 마지막 개행을 포함한 원문을 보존한다', () => {
  const content = '마지막 줄 다음에 개행이 있다.\n';
  const { dir, filePath } = makeTempPromptFile(content);
  try {
    const result = loadPrompt(filePath);
    assert.equal(result, content);
    assert.ok(result.endsWith('\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPrompt: 입력 파일을 수정하지 않는다', () => {
  const content = '변경되면 안 되는 원본 내용\n';
  const { dir, filePath } = makeTempPromptFile(content);
  try {
    loadPrompt(filePath);
    const after = readFileSync(filePath, 'utf8');
    assert.equal(after, content);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPrompt: 존재하지 않는 파일이면 오류를 던진다', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mlh-prompt-missing-'));
  const missingPath = join(dir, 'does-not-exist.md');
  try {
    assert.throws(() => loadPrompt(missingPath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadPrompt: OS temp 경로를 매개변수로 전달할 수 있다', () => {
  const content = 'temp 경로 테스트';
  const { dir, filePath } = makeTempPromptFile(content);
  try {
    assert.ok(filePath.startsWith(dir));
    assert.equal(loadPrompt(filePath), content);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
