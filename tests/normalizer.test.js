import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeContentHash, normalizeSource } from '../src/normalizer/normalizer.js';

// Known SHA-256 vectors (UTF-8 bytes -> lowercase 64-char hex),
// independently reproducible via node:crypto.
const KNOWN_VECTORS = [
  { content: '', hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'.slice(0, 64) },
  { content: 'abc', hash: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad' },
  { content: 'line1\nline2\n', hash: '2751a3a2f303ad21752038085e2b8c5f98ecff61a2e4ebbd43506a941725be80'.slice(0, 64) },
  { content: 'line1\r\nline2\r\n', hash: '4ad3ef64dfb83f7a8f789bce6f30cc1f8d18491b14db4c875309b150d2a7d213'.slice(0, 64) },
  { content: 'hello', hash: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'.slice(0, 64) },
  { content: 'hello\n', hash: '5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03'.slice(0, 64) },
];

test('computeContentHash: 알려진 SHA-256 벡터와 정확히 일치한다', () => {
  for (const { content, hash } of KNOWN_VECTORS) {
    assert.equal(computeContentHash(content), hash);
  }
});

test('computeContentHash: 64자리 lowercase hex를 반환한다', () => {
  const hash = computeContentHash('아무 내용');
  assert.equal(hash.length, 64);
  assert.match(hash, /^[0-9a-f]{64}$/);
});

test('computeContentHash: 같은 content는 같은 hash를 만든다', () => {
  const content = '동일한 내용입니다.\n';
  assert.equal(computeContentHash(content), computeContentHash(content));
});

test('computeContentHash: 한 글자만 달라도 hash가 달라진다', () => {
  const a = computeContentHash('동일한 내용입니다.');
  const b = computeContentHash('동일한 내용입니다!');
  assert.notEqual(a, b);
});

test('computeContentHash: LF와 CRLF는 서로 다른 content로 취급되어 hash가 다르다', () => {
  const lf = computeContentHash('line1\nline2\n');
  const crlf = computeContentHash('line1\r\nline2\r\n');
  assert.notEqual(lf, crlf);
});

test('computeContentHash: 마지막 개행 유무에 따라 hash가 다르다', () => {
  const withoutNl = computeContentHash('hello');
  const withNl = computeContentHash('hello\n');
  assert.notEqual(withoutNl, withNl);
});

test('normalizeSource: Constitution Section 8 최소 Schema를 만족한다', () => {
  const normalized = normalizeSource({ filename: 'a.md', rawContent: '내용\n' });
  assert.deepEqual(Object.keys(normalized).sort(), [
    'content',
    'content_hash',
    'filename',
    'schema_version',
    'source_name',
  ]);
});

test('normalizeSource: schema_version은 "0.1"이다', () => {
  const normalized = normalizeSource({ filename: 'a.md', rawContent: '내용\n' });
  assert.equal(normalized.schema_version, '0.1');
});

test('normalizeSource: filename을 그대로 보존한다', () => {
  const normalized = normalizeSource({ filename: 'my-note.txt', rawContent: '내용\n' });
  assert.equal(normalized.filename, 'my-note.txt');
});

test('normalizeSource: source_name은 단순한 Provider-independent 값이다', () => {
  const normalized = normalizeSource({ filename: 'a.md', rawContent: '내용\n' });
  assert.equal(normalized.source_name, 'local_file');
});

test('normalizeSource: content는 원문과 동일하다', () => {
  const rawContent = '  공백과\r\n개행이 섞인\n원문 그대로  \n';
  const normalized = normalizeSource({ filename: 'a.md', rawContent });
  assert.equal(normalized.content, rawContent);
});

test('normalizeSource: content_hash는 content 필드와 동일한 문자열을 해시한 값이다', () => {
  const rawContent = '해시 대상과 저장 문자열이 같아야 한다.\n';
  const normalized = normalizeSource({ filename: 'a.md', rawContent });
  assert.equal(normalized.content_hash, computeContentHash(normalized.content));
});

test('normalizeSource: filename이 달라도 content가 같으면 content_hash가 같다', () => {
  const rawContent = '같은 내용, 다른 파일명\n';
  const a = normalizeSource({ filename: 'a.md', rawContent });
  const b = normalizeSource({ filename: 'b.txt', rawContent });
  assert.equal(a.content_hash, b.content_hash);
  assert.notEqual(a.filename, b.filename);
});

test('normalizeSource: 같은 filename이라도 content가 다르면 content_hash가 다르다', () => {
  const a = normalizeSource({ filename: 'same.md', rawContent: '버전 1\n' });
  const b = normalizeSource({ filename: 'same.md', rawContent: '버전 2\n' });
  assert.equal(a.filename, b.filename);
  assert.notEqual(a.content_hash, b.content_hash);
});
