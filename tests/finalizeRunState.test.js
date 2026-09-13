import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  getFinalizeRunStatePath,
  readFinalizeRunState,
  recordFinalizeAttempt,
  shouldRunFinalizeAttempt,
} from '../scripts/finalizeRunState.mjs';

function setupSystemDir() {
  return mkdtempSync(join(tmpdir(), 'mlh-finalize-run-state-'));
}

function teardown(dir) {
  rmSync(dir, { recursive: true, force: true });
}

test('getFinalizeRunStatePath builds the documented finalize_runs/YYYY-MM-DD.json layout', () => {
  const path = getFinalizeRunStatePath('G:\\root\\99_SYSTEM', '2026-09-13');
  assert.equal(path, join('G:\\root\\99_SYSTEM', 'finalize_runs', '2026-09-13.json'));
});

test('readFinalizeRunState returns null when no attempt has been recorded yet', () => {
  const dir = setupSystemDir();
  try {
    const path = getFinalizeRunStatePath(dir, '2026-09-13');
    assert.equal(readFinalizeRunState(path), null);
  } finally {
    teardown(dir);
  }
});

test('shouldRunFinalizeAttempt: no prior state -> run (first attempt of the day)', () => {
  assert.equal(shouldRunFinalizeAttempt(null), true);
});

test('shouldRunFinalizeAttempt: terminal statuses never run again', () => {
  for (const finalStatus of [
    'COMPLETE',
    'CREDENTIAL_ERROR',
    'VALIDATOR_REJECTED',
    'RECOVERY_REQUIRED',
    'HUMAN_REVIEW_REQUIRED',
  ]) {
    const state = { targetDate: '2026-09-13', finalStatus, attempts: [{ scheduledTime: '03:30', status: finalStatus }] };
    assert.equal(shouldRunFinalizeAttempt(state), false, `${finalStatus} must block a further attempt`);
  }
});

test('shouldRunFinalizeAttempt: retryable statuses (PROVIDER_ERROR / WRITER_ERROR / NO_SOURCE) allow one more attempt', () => {
  for (const finalStatus of ['PROVIDER_ERROR', 'WRITER_ERROR', 'NO_SOURCE']) {
    const state = { targetDate: '2026-09-13', finalStatus, attempts: [{ scheduledTime: '03:30', status: finalStatus }] };
    assert.equal(shouldRunFinalizeAttempt(state), true, `${finalStatus} must allow a retry`);
  }
});

test('shouldRunFinalizeAttempt: the 2-attempt cap blocks a third attempt regardless of status', () => {
  const state = {
    targetDate: '2026-09-13',
    finalStatus: 'PROVIDER_ERROR',
    attempts: [
      { scheduledTime: '03:30', status: 'PROVIDER_ERROR' },
      { scheduledTime: '05:30', status: 'PROVIDER_ERROR' },
    ],
  };
  assert.equal(shouldRunFinalizeAttempt(state), false);
});

test('recordFinalizeAttempt writes the documented shape and appends across calls', () => {
  const dir = setupSystemDir();
  try {
    const path = getFinalizeRunStatePath(dir, '2026-09-13');

    const afterFirst = recordFinalizeAttempt(path, '2026-09-13', { scheduledTime: '03:30', status: 'PROVIDER_ERROR' });
    assert.deepEqual(afterFirst, {
      targetDate: '2026-09-13',
      finalStatus: 'PROVIDER_ERROR',
      attempts: [{ scheduledTime: '03:30', status: 'PROVIDER_ERROR' }],
    });
    assert.deepEqual(readFinalizeRunState(path), afterFirst);

    const afterSecond = recordFinalizeAttempt(path, '2026-09-13', { scheduledTime: '05:30', status: 'COMPLETE' });
    assert.deepEqual(afterSecond, {
      targetDate: '2026-09-13',
      finalStatus: 'COMPLETE',
      attempts: [
        { scheduledTime: '03:30', status: 'PROVIDER_ERROR' },
        { scheduledTime: '05:30', status: 'COMPLETE' },
      ],
    });
    assert.deepEqual(readFinalizeRunState(path), afterSecond);
  } finally {
    teardown(dir);
  }
});

test('recordFinalizeAttempt only ever stores targetDate/finalStatus/attempts - no Source/Prompt/Credential content', () => {
  const dir = setupSystemDir();
  try {
    const path = getFinalizeRunStatePath(dir, '2026-09-13');
    const state = recordFinalizeAttempt(path, '2026-09-13', { scheduledTime: '03:30', status: 'COMPLETE' });
    assert.deepEqual(Object.keys(state).sort(), ['attempts', 'finalStatus', 'targetDate']);
    assert.deepEqual(Object.keys(state.attempts[0]).sort(), ['scheduledTime', 'status']);
  } finally {
    teardown(dir);
  }
});

test('recordFinalizeAttempt writes atomically: no leftover .tmp file after a successful write', () => {
  const dir = setupSystemDir();
  try {
    const path = getFinalizeRunStatePath(dir, '2026-09-13');
    recordFinalizeAttempt(path, '2026-09-13', { scheduledTime: '03:30', status: 'COMPLETE' });

    assert.equal(existsSync(path), true);
    assert.equal(existsSync(`${path}.tmp`), false);

    const written = JSON.parse(readFileSync(path, 'utf8'));
    assert.equal(written.finalStatus, 'COMPLETE');

    const filesInDir = readdirSync(join(dir, 'finalize_runs'));
    assert.deepEqual(filesInDir, ['2026-09-13.json']);
  } finally {
    teardown(dir);
  }
});
