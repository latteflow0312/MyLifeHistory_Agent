import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getNotificationStatePath,
  readNotificationState,
  recordNotificationState,
} from '../scripts/notificationState.mjs';

function setupSystemDir() {
  return mkdtempSync(join(tmpdir(), 'mlh-notification-state-'));
}

function teardown(dir) {
  rmSync(dir, { recursive: true, force: true });
}

test('getNotificationStatePath builds the notifications/YYYY-MM-DD.json layout', () => {
  const path = getNotificationStatePath('G:\\root\\99_SYSTEM', '2026-09-13');
  assert.equal(path, join('G:\\root\\99_SYSTEM', 'notifications', '2026-09-13.json'));
});

test('readNotificationState returns null when nothing has been recorded yet', () => {
  const dir = setupSystemDir();
  try {
    assert.equal(readNotificationState(getNotificationStatePath(dir, '2026-09-13')), null);
  } finally {
    teardown(dir);
  }
});

test('recordNotificationState writes atomically and stores only the fixed status fields', () => {
  const dir = setupSystemDir();
  try {
    const path = getNotificationStatePath(dir, '2026-09-13');
    const state = {
      targetDate: '2026-09-13',
      email: 'SUCCESS',
      telegram: 'FAILED',
      notificationStatus: 'PARTIAL_SUCCESS',
    };

    recordNotificationState(path, state);

    assert.equal(existsSync(path), true);
    assert.equal(existsSync(`${path}.tmp`), false);
    assert.deepEqual(readNotificationState(path), state);
    assert.deepEqual(Object.keys(readNotificationState(path)).sort(), [
      'email',
      'notificationStatus',
      'targetDate',
      'telegram',
    ]);
  } finally {
    teardown(dir);
  }
});
