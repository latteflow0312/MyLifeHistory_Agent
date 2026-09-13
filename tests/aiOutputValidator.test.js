import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateAiOutput } from '../src/validator/aiOutputValidator.js';

const TARGET_DATE = '2026-09-13';
const KNOWN_HASH_A = 'a'.repeat(64);
const KNOWN_HASH_B = 'b'.repeat(64);
const UNKNOWN_HASH = 'f'.repeat(64);

function makeValidOutput({ date = TARGET_DATE, hash = KNOWN_HASH_A } = {}) {
  return [
    `# ${date}`,
    '',
    '- 오늘 있었던 기록 요약',
    '',
    '## 오늘의 한 문장',
    '',
    '> 그날의 기록을 나타내는 문장',
    '',
    '## Tag',
    '',
    '- #DECISION_CONTEXT',
    '',
    '## Source',
    '',
    `SRC-001 | chat_${date}.md | sha256:${hash}`,
    '',
  ].join('\n');
}

test('validateAiOutput: 정상적인 output은 PASS한다', () => {
  const output = makeValidOutput();
  const result = validateAiOutput(output, {
    targetDate: TARGET_DATE,
    knownContentHashes: new Set([KNOWN_HASH_A, KNOWN_HASH_B]),
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('validateAiOutput: empty output은 FAIL한다', () => {
  const result = validateAiOutput('   \n\n  ', {
    targetDate: TARGET_DATE,
    knownContentHashes: new Set([KNOWN_HASH_A]),
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('empty')));
});

test('validateAiOutput: 날짜 불일치는 FAIL한다', () => {
  const output = makeValidOutput({ date: '2026-09-14' });
  const result = validateAiOutput(output, {
    targetDate: TARGET_DATE,
    knownContentHashes: new Set([KNOWN_HASH_A]),
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('does not match targetDate')));
});

test('validateAiOutput: "## 오늘의 한 문장" 누락은 FAIL한다', () => {
  const output = makeValidOutput().replace('## 오늘의 한 문장', '## 다른 제목');
  const result = validateAiOutput(output, {
    targetDate: TARGET_DATE,
    knownContentHashes: new Set([KNOWN_HASH_A]),
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('오늘의 한 문장')));
});

test('validateAiOutput: "## Tag" 누락은 FAIL한다', () => {
  const output = makeValidOutput().replace('## Tag', '## 다른 제목');
  const result = validateAiOutput(output, {
    targetDate: TARGET_DATE,
    knownContentHashes: new Set([KNOWN_HASH_A]),
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('Tag')));
});

test('validateAiOutput: "## Source" 누락은 FAIL한다', () => {
  const output = makeValidOutput().replace('## Source', '## 다른 제목');
  const result = validateAiOutput(output, {
    targetDate: TARGET_DATE,
    knownContentHashes: new Set([KNOWN_HASH_A]),
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('Source')));
});

test('validateAiOutput: 입력에 없는 가짜 hash가 포함되면 FAIL한다', () => {
  const output = makeValidOutput({ hash: UNKNOWN_HASH });
  const result = validateAiOutput(output, {
    targetDate: TARGET_DATE,
    knownContentHashes: new Set([KNOWN_HASH_A, KNOWN_HASH_B]),
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('unknown content_hash')));
});

test('validateAiOutput: knownContentHashes로 배열도 사용할 수 있다', () => {
  const output = makeValidOutput();
  const result = validateAiOutput(output, {
    targetDate: TARGET_DATE,
    knownContentHashes: [KNOWN_HASH_A],
  });
  assert.equal(result.valid, true);
});

test('validateAiOutput: 여러 오류를 동시에 보고할 수 있다', () => {
  const output = makeValidOutput({ hash: UNKNOWN_HASH })
    .replace('## Tag', '## 다른 제목');
  const result = validateAiOutput(output, {
    targetDate: TARGET_DATE,
    knownContentHashes: new Set([KNOWN_HASH_A]),
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.length >= 2);
});

test('validateAiOutput: targetDate 형식이 잘못되면 오류를 던진다', () => {
  assert.throws(() =>
    validateAiOutput(makeValidOutput(), {
      targetDate: '2026/09/13',
      knownContentHashes: new Set([KNOWN_HASH_A]),
    })
  );
});

test('validateAiOutput: outputText가 문자열이 아니면 오류를 던진다', () => {
  assert.throws(() =>
    validateAiOutput(null, { targetDate: TARGET_DATE, knownContentHashes: new Set() })
  );
});

test('validateAiOutput: "## Source" Section이 비어 있으면(실제 Reference 없음) FAIL한다', () => {
  const output = [
    `# ${TARGET_DATE}`,
    '',
    '- 오늘 있었던 기록 요약',
    '',
    '## 오늘의 한 문장',
    '',
    '> 그날의 기록을 나타내는 문장',
    '',
    '## Tag',
    '',
    '- #DECISION_CONTEXT',
    '',
    '## Source',
    '',
  ].join('\n');

  const result = validateAiOutput(output, {
    targetDate: TARGET_DATE,
    knownContentHashes: new Set([KNOWN_HASH_A]),
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('at least one Source Reference')));
});

test('validateAiOutput: hash만 있고 filename이 없으면 FAIL한다', () => {
  const output = makeValidOutput().replace(
    `SRC-001 | chat_${TARGET_DATE}.md | sha256:${KNOWN_HASH_A}`,
    `sha256:${KNOWN_HASH_A}`
  );

  const result = validateAiOutput(output, {
    targetDate: TARGET_DATE,
    knownContentHashes: new Set([KNOWN_HASH_A]),
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('missing filename')));
});

test('validateAiOutput: filename + full hash가 실제 입력 Source와 일치하면 PASS한다', () => {
  const filename = `chat_${TARGET_DATE}.md`;
  const output = makeValidOutput({ hash: KNOWN_HASH_A });

  const result = validateAiOutput(output, {
    targetDate: TARGET_DATE,
    knownContentHashes: [{ content_hash: KNOWN_HASH_A, filename }],
  });

  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('validateAiOutput: filename과 hash의 실제 입력 Source 조합이 다르면 FAIL한다', () => {
  const output = makeValidOutput({ hash: KNOWN_HASH_A }); // 출력의 filename: chat_2026-09-13.md

  const result = validateAiOutput(output, {
    targetDate: TARGET_DATE,
    // 입력 Source 목록에는 같은 hash가 실제로는 다른 filename에 속해 있음
    knownContentHashes: [{ content_hash: KNOWN_HASH_A, filename: 'completely-different-source.md' }],
  });

  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes('does not match input Source filename')));
});
