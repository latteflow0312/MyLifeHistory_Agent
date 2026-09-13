import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPromptPackage } from '../src/promptPackage/promptPackageBuilder.js';

function makeSource(overrides = {}) {
  return {
    schema_version: '0.1',
    source_name: 'local_file',
    filename: 'a.md',
    content_hash: 'a'.repeat(64),
    content: '원문 내용\n',
    ...overrides,
  };
}

test('buildPromptPackage: date를 그대로 보존한다', () => {
  const dailyPackage = { date: '2026-09-13', sources: [makeSource()] };
  const pkg = buildPromptPackage(dailyPackage, '지침 원문');
  assert.equal(pkg.date, '2026-09-13');
});

test('buildPromptPackage: instructions 원문을 그대로 보존한다 (trailing newline 포함)', () => {
  const instructions = '# 지침\n\n내용\n';
  const dailyPackage = { date: '2026-09-13', sources: [makeSource()] };
  const pkg = buildPromptPackage(dailyPackage, instructions);
  assert.equal(pkg.instructions, instructions);
  assert.ok(pkg.instructions.endsWith('\n'));
});

test('buildPromptPackage: instructions의 CRLF를 변경하지 않는다', () => {
  const instructions = '지침 1\r\n지침 2\r\n';
  const dailyPackage = { date: '2026-09-13', sources: [makeSource()] };
  const pkg = buildPromptPackage(dailyPackage, instructions);
  assert.equal(pkg.instructions, instructions);
});

test('buildPromptPackage: sources를 그대로 보존한다', () => {
  const source = makeSource();
  const dailyPackage = { date: '2026-09-13', sources: [source] };
  const pkg = buildPromptPackage(dailyPackage, '지침');
  assert.deepEqual(pkg.sources[0], source);
});

test('buildPromptPackage: Source 순서를 유지한다', () => {
  const sourceA = makeSource({ filename: 'a.md', content_hash: 'a'.repeat(64) });
  const sourceB = makeSource({ filename: 'b.md', content_hash: 'b'.repeat(64) });
  const sourceC = makeSource({ filename: 'c.md', content_hash: 'c'.repeat(64) });
  const dailyPackage = { date: '2026-09-13', sources: [sourceA, sourceB, sourceC] };
  const pkg = buildPromptPackage(dailyPackage, '지침');
  assert.deepEqual(
    pkg.sources.map((s) => s.filename),
    ['a.md', 'b.md', 'c.md']
  );
});

test('buildPromptPackage: content 원문을 보존한다', () => {
  const content = '  공백과\r\n개행이 섞인\n원문  \n';
  const dailyPackage = { date: '2026-09-13', sources: [makeSource({ content })] };
  const pkg = buildPromptPackage(dailyPackage, '지침');
  assert.equal(pkg.sources[0].content, content);
});

test('buildPromptPackage: content_hash를 보존한다', () => {
  const contentHash = 'f'.repeat(64);
  const dailyPackage = { date: '2026-09-13', sources: [makeSource({ content_hash: contentHash })] };
  const pkg = buildPromptPackage(dailyPackage, '지침');
  assert.equal(pkg.sources[0].content_hash, contentHash);
});

test('buildPromptPackage: filename을 보존한다', () => {
  const dailyPackage = { date: '2026-09-13', sources: [makeSource({ filename: 'my-note.txt' })] };
  const pkg = buildPromptPackage(dailyPackage, '지침');
  assert.equal(pkg.sources[0].filename, 'my-note.txt');
});

test('buildPromptPackage: source_name을 보존한다', () => {
  const dailyPackage = { date: '2026-09-13', sources: [makeSource({ source_name: 'local_file' })] };
  const pkg = buildPromptPackage(dailyPackage, '지침');
  assert.equal(pkg.sources[0].source_name, 'local_file');
});

test('buildPromptPackage: 입력 객체를 수정하지 않는다', () => {
  const source = makeSource();
  const dailyPackage = { date: '2026-09-13', sources: [source] };
  const dailyPackageSnapshot = JSON.parse(JSON.stringify(dailyPackage));
  const instructions = '지침 원문\n';
  buildPromptPackage(dailyPackage, instructions);
  assert.deepEqual(dailyPackage, dailyPackageSnapshot);
});

test('buildPromptPackage: source_name 값과 무관하게 동일하게 동작한다 (Provider-independent)', () => {
  const dailyPackage = {
    date: '2026-09-13',
    sources: [makeSource({ source_name: 'local_file' }), makeSource({ source_name: 'anything_else', content_hash: 'e'.repeat(64) })],
  };
  const pkg = buildPromptPackage(dailyPackage, '지침');
  assert.equal(pkg.sources.length, 2);
});

test('buildPromptPackage: sources가 빈 배열이면 오류를 던진다', () => {
  const dailyPackage = { date: '2026-09-13', sources: [] };
  assert.throws(() => buildPromptPackage(dailyPackage, '지침'));
});

test('buildPromptPackage: 잘못된 date 형식이면 오류를 던진다', () => {
  const dailyPackage = { date: '2026/09/13', sources: [makeSource()] };
  assert.throws(() => buildPromptPackage(dailyPackage, '지침'));
});

test('buildPromptPackage: instructions가 비어있거나 문자열이 아니면 오류를 던진다', () => {
  const dailyPackage = { date: '2026-09-13', sources: [makeSource()] };
  assert.throws(() => buildPromptPackage(dailyPackage, ''));
  assert.throws(() => buildPromptPackage(dailyPackage, undefined));
  assert.throws(() => buildPromptPackage(dailyPackage, 123));
});

test('buildPromptPackage: dailyPackage가 유효하지 않으면 오류를 던진다', () => {
  assert.throws(() => buildPromptPackage(null, '지침'));
  assert.throws(() => buildPromptPackage({ date: '2026-09-13' }, '지침'));
  assert.throws(() => buildPromptPackage({ sources: [makeSource()] }, '지침'));
  assert.throws(() => buildPromptPackage({ date: '2026-09-13', sources: 'not-an-array' }, '지침'));
});
