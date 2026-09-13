import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeDevelopmentArtifact } from '../src/artifactWriter/developmentArtifactWriter.js';

function makeTempOutputDir() {
  return mkdtempSync(join(tmpdir(), 'mlh-artifact-'));
}

function makePromptPackage(overrides = {}) {
  return {
    date: '2026-09-13',
    instructions: '# 지침\r\n\r\n혼합 개행과\n마지막 줄  \n',
    sources: [
      {
        schema_version: '0.1',
        source_name: 'local_file',
        filename: 'a.md',
        content_hash: 'a'.repeat(64),
        content: '  공백 포함\r\n원문\n',
      },
      {
        schema_version: '0.1',
        source_name: 'local_file',
        filename: 'b.txt',
        content_hash: 'b'.repeat(64),
        content: '두 번째 원문\n',
      },
    ],
    ...overrides,
  };
}

test('writeDevelopmentArtifact: 정상적으로 JSON 파일을 저장한다', () => {
  const dir = makeTempOutputDir();
  try {
    const pkg = makePromptPackage();
    const finalPath = writeDevelopmentArtifact(pkg, dir);
    assert.equal(finalPath, join(dir, '2026-09-13_prompt-package.json'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeDevelopmentArtifact: outputDirectory는 외부에서 주입된다', () => {
  const dirA = makeTempOutputDir();
  const dirB = makeTempOutputDir();
  try {
    writeDevelopmentArtifact(makePromptPackage({ date: '2026-01-01' }), dirA);
    writeDevelopmentArtifact(makePromptPackage({ date: '2026-01-01' }), dirB);
    assert.ok(readdirSync(dirA).includes('2026-01-01_prompt-package.json'));
    assert.ok(readdirSync(dirB).includes('2026-01-01_prompt-package.json'));
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test('writeDevelopmentArtifact: 파일명 규칙은 YYYY-MM-DD_prompt-package.json이다', () => {
  const dir = makeTempOutputDir();
  try {
    writeDevelopmentArtifact(makePromptPackage({ date: '2026-12-31' }), dir);
    const files = readdirSync(dir);
    assert.deepEqual(files, ['2026-12-31_prompt-package.json']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeDevelopmentArtifact: UTF-8 JSON으로 저장되어 파싱 가능하다', () => {
  const dir = makeTempOutputDir();
  try {
    const pkg = makePromptPackage();
    const finalPath = writeDevelopmentArtifact(pkg, dir);
    const raw = readFileSync(finalPath, 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.date, pkg.date);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeDevelopmentArtifact: instructions가 round-trip 후에도 완전히 동일하다', () => {
  const dir = makeTempOutputDir();
  try {
    const pkg = makePromptPackage();
    const finalPath = writeDevelopmentArtifact(pkg, dir);
    const parsed = JSON.parse(readFileSync(finalPath, 'utf8'));
    assert.equal(parsed.instructions, pkg.instructions);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeDevelopmentArtifact: Source content가 round-trip 후에도 완전히 동일하다', () => {
  const dir = makeTempOutputDir();
  try {
    const pkg = makePromptPackage();
    const finalPath = writeDevelopmentArtifact(pkg, dir);
    const parsed = JSON.parse(readFileSync(finalPath, 'utf8'));
    assert.equal(parsed.sources[0].content, pkg.sources[0].content);
    assert.equal(parsed.sources[1].content, pkg.sources[1].content);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeDevelopmentArtifact: Source 순서가 round-trip 후에도 동일하다', () => {
  const dir = makeTempOutputDir();
  try {
    const pkg = makePromptPackage();
    const finalPath = writeDevelopmentArtifact(pkg, dir);
    const parsed = JSON.parse(readFileSync(finalPath, 'utf8'));
    assert.deepEqual(
      parsed.sources.map((s) => s.filename),
      pkg.sources.map((s) => s.filename)
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeDevelopmentArtifact: 동일 파일이 이미 존재하면 오류를 던지고 overwrite하지 않는다', () => {
  const dir = makeTempOutputDir();
  try {
    const pkg = makePromptPackage();
    writeDevelopmentArtifact(pkg, dir);
    const before = readFileSync(join(dir, '2026-09-13_prompt-package.json'), 'utf8');

    const differentPkg = makePromptPackage({ instructions: '다른 지침\n' });
    assert.throws(() => writeDevelopmentArtifact(differentPkg, dir));

    const after = readFileSync(join(dir, '2026-09-13_prompt-package.json'), 'utf8');
    assert.equal(after, before, '기존 파일 내용이 변경되어서는 안 된다');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeDevelopmentArtifact: Atomic Write 후 temp 파일이 남지 않는다', () => {
  const dir = makeTempOutputDir();
  try {
    writeDevelopmentArtifact(makePromptPackage(), dir);
    const tmpFiles = readdirSync(dir).filter((name) => name.endsWith('.tmp'));
    assert.deepEqual(tmpFiles, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeDevelopmentArtifact: 실패한 쓰기 시도 후에도 temp 파일이 남지 않는다', () => {
  const dir = makeTempOutputDir();
  try {
    writeDevelopmentArtifact(makePromptPackage(), dir);
    try {
      writeDevelopmentArtifact(makePromptPackage(), dir);
    } catch {
      // 의도된 실패
    }
    const tmpFiles = readdirSync(dir).filter((name) => name.endsWith('.tmp'));
    assert.deepEqual(tmpFiles, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeDevelopmentArtifact: Processing State나 markProcessed를 전혀 참조하지 않는다', () => {
  const dir = makeTempOutputDir();
  try {
    // writeDevelopmentArtifact의 시그니처는 promptPackage와 outputDirectory 두 개뿐이며
    // state 인자를 받지 않는다는 사실 자체가 계약이다.
    assert.equal(writeDevelopmentArtifact.length, 2);
    writeDevelopmentArtifact(makePromptPackage(), dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeDevelopmentArtifact: 잘못된 promptPackage.date이면 오류를 던진다', () => {
  const dir = makeTempOutputDir();
  try {
    assert.throws(() => writeDevelopmentArtifact(makePromptPackage({ date: '13-09-2026' }), dir));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('writeDevelopmentArtifact: outputDirectory가 비어있으면 오류를 던진다', () => {
  assert.throws(() => writeDevelopmentArtifact(makePromptPackage(), ''));
  assert.throws(() => writeDevelopmentArtifact(makePromptPackage(), undefined));
});
