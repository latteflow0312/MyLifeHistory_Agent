import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/config/configLoader.js';

function makeTempConfigFile(content) {
  const dir = mkdtempSync(join(tmpdir(), 'mlh-config-'));
  const filePath = join(dir, 'settings.json');
  writeFileSync(filePath, content, 'utf8');
  return { dir, filePath };
}

const VALID_CONFIG = {
  google_drive_root: 'Z:\\nonexistent\\path\\MY_LIFE_HISTORY',
  inbox_folder: '00_INBOX',
  raw_folder: '01_RAW',
  daily_folder: '02_DAILY',
  review_folder: '03_REVIEW',
  system_folder: '99_SYSTEM',
  timezone: 'Asia/Seoul',
};

test('loadConfig: 정상 설정을 로드한다', () => {
  const { dir, filePath } = makeTempConfigFile(JSON.stringify(VALID_CONFIG, null, 2));
  try {
    const config = loadConfig(filePath);
    assert.equal(config.timezone, 'Asia/Seoul');
    assert.equal(config.inbox_folder, '00_INBOX');
    assert.equal(config.google_drive_root, VALID_CONFIG.google_drive_root);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig: 필수 필드가 없으면 오류를 던진다', () => {
  const incomplete = { ...VALID_CONFIG };
  delete incomplete.raw_folder;
  const { dir, filePath } = makeTempConfigFile(JSON.stringify(incomplete));
  try {
    assert.throws(() => loadConfig(filePath), /raw_folder/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig: 잘못된 JSON이면 오류를 던진다', () => {
  const { dir, filePath } = makeTempConfigFile('{ not valid json');
  try {
    assert.throws(() => loadConfig(filePath), /JSON/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig: timezone이 Asia/Seoul이 아니면 오류를 던진다', () => {
  const wrongTz = { ...VALID_CONFIG, timezone: 'UTC' };
  const { dir, filePath } = makeTempConfigFile(JSON.stringify(wrongTz));
  try {
    assert.throws(() => loadConfig(filePath), /timezone/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig: 입력 설정 파일을 수정하지 않는다', () => {
  const original = JSON.stringify(VALID_CONFIG, null, 2);
  const { dir, filePath } = makeTempConfigFile(original);
  try {
    loadConfig(filePath);
    const after = readFileSync(filePath, 'utf8');
    assert.equal(after, original);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig: OS temp 경로를 매개변수로 전달할 수 있다', () => {
  const { dir, filePath } = makeTempConfigFile(JSON.stringify(VALID_CONFIG));
  try {
    assert.ok(filePath.startsWith(dir));
    assert.doesNotThrow(() => loadConfig(filePath));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('loadConfig: google_drive_root 값에 대해 실제 파일시스템 접근을 하지 않는다', () => {
  const configWithFakePath = {
    ...VALID_CONFIG,
    google_drive_root: 'Q:\\this\\path\\definitely\\does\\not\\exist\\MY_LIFE_HISTORY',
  };
  const { dir, filePath } = makeTempConfigFile(JSON.stringify(configWithFakePath));
  try {
    const config = loadConfig(filePath);
    assert.equal(config.google_drive_root, configWithFakePath.google_drive_root);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
