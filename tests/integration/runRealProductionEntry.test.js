import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runRealProductionEntry,
  runScheduledFinalizeAttempt,
  classifyFinalizeError,
  getKstDateString,
  getKstPreviousDateString,
  getSourceDateFromFilename,
  RAW_DIR,
  DAILY_DIR,
  STATE_FILE_PATH,
  PROMPT_FILE_PATH,
} from '../../scripts/run-production-real.mjs';
import { initializeProcessingState } from '../../src/processingState/processingState.js';
import { createFakeAiAdapter } from '../fakes/fakeAiAdapter.js';
import { getFinalizeRunStatePath, readFinalizeRunState, recordFinalizeAttempt } from '../../scripts/finalizeRunState.mjs';

function setupWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'mlh-real-entry-'));
  const rawDir = join(root, '01_RAW');
  const dailyDir = join(root, '02_DAILY');
  const runStateDir = join(root, '99_SYSTEM');
  const stateFilePath = join(root, 'processing_state.json');
  const promptFilePath = join(root, 'daily_summary.md');

  mkdirSync(rawDir);
  mkdirSync(dailyDir);
  writeFileSync(promptFilePath, '# 지침\n\n테스트용 지침 원문.\n', 'utf8');
  initializeProcessingState(stateFilePath);

  return { root, rawDir, dailyDir, runStateDir, stateFilePath, promptFilePath };
}

function teardown(root) {
  rmSync(root, { recursive: true, force: true });
}

test('real operational path constants point at the actual Google Drive layout and real prompt file', () => {
  assert.ok(RAW_DIR.endsWith(join('MY_LIFE_HISTORY', '01_RAW')));
  assert.ok(DAILY_DIR.endsWith(join('MY_LIFE_HISTORY', '02_DAILY')));
  assert.ok(STATE_FILE_PATH.endsWith(join('MY_LIFE_HISTORY', '99_SYSTEM', 'processing_state.json')));
  assert.ok(PROMPT_FILE_PATH.endsWith(join('prompts', 'daily_summary.md')));
  assert.ok(existsSync(PROMPT_FILE_PATH), 'must resolve to the real repo prompt file, not a synthetic one');
});

test('getKstDateString returns a YYYY-MM-DD string', () => {
  assert.match(getKstDateString(new Date('2026-09-13T20:00:00Z')), /^\d{4}-\d{2}-\d{2}$/);
});

test('getKstPreviousDateString returns the fixed Asia/Seoul calendar day before today, not a rolling 24h window', () => {
  // 2026-09-14T10:00:00Z -> Asia/Seoul (+09:00) -> 2026-09-14 19:00 -> today = 2026-09-14
  assert.equal(getKstPreviousDateString(new Date('2026-09-14T10:00:00Z')), '2026-09-13');
});

test('getKstPreviousDateString normalizes across a month boundary', () => {
  // 2026-09-30T20:00:00Z -> Asia/Seoul -> 2026-10-01 05:00 -> today = 2026-10-01
  assert.equal(getKstPreviousDateString(new Date('2026-09-30T20:00:00Z')), '2026-09-30');
});

test('getKstPreviousDateString normalizes across a year boundary', () => {
  // 2026-12-31T20:00:00Z -> Asia/Seoul -> 2027-01-01 05:00 -> today = 2027-01-01
  assert.equal(getKstPreviousDateString(new Date('2026-12-31T20:00:00Z')), '2026-12-31');
});

test('getKstPreviousDateString returns the identical targetDate for the 03:30 and 05:30 Attempts of the same operational night', () => {
  const at0330 = getKstPreviousDateString(new Date('2026-09-14T18:30:00Z')); // 2026-09-15 03:30 KST
  const at0530 = getKstPreviousDateString(new Date('2026-09-14T20:30:00Z')); // 2026-09-15 05:30 KST
  assert.equal(at0330, '2026-09-14');
  assert.equal(at0530, '2026-09-14');
  assert.equal(at0330, at0530);
});

test('classifyFinalizeError maps known message prefixes to fixed Finalize Run State statuses', () => {
  assert.equal(classifyFinalizeError(new Error('loadAiCredential: environment variable "X" is not set.')), 'CREDENTIAL_ERROR');
  assert.equal(
    classifyFinalizeError(new Error('runProductionPipeline: AI output failed validation: missing section')),
    'VALIDATOR_REJECTED'
  );
  assert.equal(classifyFinalizeError(new Error('writeProductionDailyArtifact: disk full')), 'WRITER_ERROR');
  assert.equal(classifyFinalizeError(new Error('fetch failed')), 'PROVIDER_ERROR');
  assert.equal(classifyFinalizeError({}), 'PROVIDER_ERROR');
});

test('empty 01_RAW safely skips with no AI call and no state/output change', async () => {
  const ws = setupWorkspace();
  try {
    const adapter = createFakeAiAdapter();
    const result = await runRealProductionEntry({
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      targetDate: '2026-09-13',
      aiAdapter: adapter,
    });

    assert.equal(result.status, 'skipped_empty_input');
    assert.equal(result.artifactPath, null);
    assert.equal(adapter.calls.length, 0);
    assert.equal(existsSync(join(ws.dailyDir, '2026-09-13.md')), false);
  } finally {
    teardown(ws.root);
  }
});

test('empty 01_RAW skips safely even with no injected adapter and no credential set (never constructs a real Adapter)', async () => {
  const ws = setupWorkspace();
  const savedCredential = process.env.MYLIFEHISTORY_GEMINI_API_KEY;
  delete process.env.MYLIFEHISTORY_GEMINI_API_KEY;
  try {
    const result = await runRealProductionEntry({
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      targetDate: '2026-09-13',
    });

    assert.equal(result.status, 'skipped_empty_input');
  } finally {
    if (savedCredential !== undefined) {
      process.env.MYLIFEHISTORY_GEMINI_API_KEY = savedCredential;
    }
    teardown(ws.root);
  }
});

test('a new Source in 01_RAW is collected, normalized, and reaches complete via the real prompt-wiring path', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.rawDir, '2026-09-13_entry.txt'), 'Real production entry wiring test source.\n', 'utf8');
    const adapter = createFakeAiAdapter();

    const result = await runRealProductionEntry({
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      targetDate: '2026-09-13',
      aiAdapter: adapter,
    });

    assert.equal(result.status, 'complete');
    assert.equal(adapter.calls.length, 1);
    assert.equal(existsSync(join(ws.dailyDir, '2026-09-13.md')), true);
  } finally {
    teardown(ws.root);
  }
});

// --- Phase 12 Task 6: Source Date Boundary Enforcement -----------------

test('getSourceDateFromFilename extracts the leading YYYY-MM-DD date prefix', () => {
  assert.equal(getSourceDateFromFilename('2026-09-13_2315_note.md'), '2026-09-13');
  assert.equal(getSourceDateFromFilename('2026-09-13_mylifehistory_first_production.md'), '2026-09-13');
});

test('getSourceDateFromFilename returns null when the filename has no date prefix', () => {
  assert.equal(getSourceDateFromFilename('entry.txt'), null);
  assert.equal(getSourceDateFromFilename('notes.md'), null);
});

test('Case 1: a Source whose filename date matches targetDate is included', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.rawDir, '2026-09-13_note.md'), 'Written on the target date.\n', 'utf8');
    const adapter = createFakeAiAdapter();

    const result = await runRealProductionEntry({
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      targetDate: '2026-09-13',
      aiAdapter: adapter,
    });

    assert.equal(result.status, 'complete');
    assert.equal(adapter.calls.length, 1);
  } finally {
    teardown(ws.root);
  }
});

test('Case 2: a Source written the next day is excluded from the previous day\'s Finalize run', async () => {
  const ws = setupWorkspace();
  try {
    // Simulates a note written at 00:15 KST "today", present in 01_RAW
    // when the 03:30 Finalize for "yesterday" (targetDate) fires.
    writeFileSync(join(ws.rawDir, '2026-09-14_0015_note.md'), 'Written just after midnight, the next day.\n', 'utf8');
    const adapter = createFakeAiAdapter();

    const result = await runRealProductionEntry({
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      targetDate: '2026-09-13',
      aiAdapter: adapter,
    });

    assert.equal(result.status, 'skipped_empty_input');
    assert.equal(adapter.calls.length, 0);
    assert.equal(existsSync(join(ws.dailyDir, '2026-09-13.md')), false);
  } finally {
    teardown(ws.root);
  }
});

test('Case 3: a Source already processed on a prior run is excluded even though its filename date still matches targetDate', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.rawDir, '2026-09-13_note.md'), 'Processed on the first run.\n', 'utf8');
    const adapter = createFakeAiAdapter();

    const first = await runRealProductionEntry({
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      targetDate: '2026-09-13',
      aiAdapter: adapter,
    });
    assert.equal(first.status, 'complete');

    const second = await runRealProductionEntry({
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      targetDate: '2026-09-13',
      aiAdapter: adapter,
    });

    assert.equal(second.status, 'skipped_empty_input');
    assert.equal(adapter.calls.length, 1, 'the adapter must not be called again for an already-processed Source');
  } finally {
    teardown(ws.root);
  }
});

test('Case 4: month-end and year-end filename dates are matched by exact string equality, not by proximity', async () => {
  const ws = setupWorkspace();
  try {
    writeFileSync(join(ws.rawDir, '2026-09-30_note.md'), 'Last day of September.\n', 'utf8');
    writeFileSync(join(ws.rawDir, '2026-12-31_note.md'), 'Last day of the year.\n', 'utf8');
    const adapter = createFakeAiAdapter();

    // targetDate is the day AFTER each boundary date - neither source
    // may be swept in just because it is "close" to targetDate.
    const octoberFirst = await runRealProductionEntry({
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      targetDate: '2026-10-01',
      aiAdapter: adapter,
    });
    assert.equal(octoberFirst.status, 'skipped_empty_input');

    const newYearsDay = await runRealProductionEntry({
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      targetDate: '2027-01-01',
      aiAdapter: adapter,
    });
    assert.equal(newYearsDay.status, 'skipped_empty_input');
    assert.equal(adapter.calls.length, 0);

    // The exact matching date for each boundary file still works.
    const septemberThirty = await runRealProductionEntry({
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      targetDate: '2026-09-30',
      aiAdapter: adapter,
    });
    assert.equal(septemberThirty.status, 'complete');
  } finally {
    teardown(ws.root);
  }
});

// --- Phase 12 Task 8: Finalize Run State gate (runScheduledFinalizeAttempt) ---

test('runScheduledFinalizeAttempt: 03:30 COMPLETE -> 05:30 skips without calling the Adapter again', async () => {
  const ws = setupWorkspace();
  try {
    const targetDate = '2026-09-13';
    writeFileSync(join(ws.rawDir, `${targetDate}_note.md`), 'Attempt 1 source.\n', 'utf8');
    const adapter = createFakeAiAdapter();

    const first = await runScheduledFinalizeAttempt({
      scheduledTime: '03:30',
      targetDate,
      runStateDir: ws.runStateDir,
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      aiAdapter: adapter,
    });
    assert.equal(first.skipped, false);
    assert.equal(first.status, 'COMPLETE');
    assert.equal(adapter.calls.length, 1);

    const second = await runScheduledFinalizeAttempt({
      scheduledTime: '05:30',
      targetDate,
      runStateDir: ws.runStateDir,
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      aiAdapter: adapter,
    });
    assert.equal(second.skipped, true);
    assert.equal(adapter.calls.length, 1, 'the Adapter must not be called again once COMPLETE is recorded');

    const runState = readFinalizeRunState(getFinalizeRunStatePath(ws.runStateDir, targetDate));
    assert.equal(runState.finalStatus, 'COMPLETE');
    assert.equal(runState.attempts.length, 1);
  } finally {
    teardown(ws.root);
  }
});

test('runScheduledFinalizeAttempt: 03:30 PROVIDER_ERROR -> 05:30 retries and can reach COMPLETE', async () => {
  const ws = setupWorkspace();
  try {
    const targetDate = '2026-09-13';
    writeFileSync(join(ws.rawDir, `${targetDate}_note.md`), 'Attempt source.\n', 'utf8');
    const failingAdapter = createFakeAiAdapter({ fail: true, failureMessage: 'simulated network failure' });

    const first = await runScheduledFinalizeAttempt({
      scheduledTime: '03:30',
      targetDate,
      runStateDir: ws.runStateDir,
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      aiAdapter: failingAdapter,
    });
    assert.equal(first.skipped, false);
    assert.equal(first.status, 'PROVIDER_ERROR');

    const workingAdapter = createFakeAiAdapter();
    const second = await runScheduledFinalizeAttempt({
      scheduledTime: '05:30',
      targetDate,
      runStateDir: ws.runStateDir,
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      aiAdapter: workingAdapter,
    });
    assert.equal(second.skipped, false, '05:30 must be allowed to run after a PROVIDER_ERROR');
    assert.equal(second.status, 'COMPLETE');
    assert.equal(workingAdapter.calls.length, 1);

    const runState = readFinalizeRunState(getFinalizeRunStatePath(ws.runStateDir, targetDate));
    assert.equal(runState.finalStatus, 'COMPLETE');
    assert.deepEqual(runState.attempts.map((a) => a.status), ['PROVIDER_ERROR', 'COMPLETE']);
    assert.deepEqual(runState.attempts.map((a) => a.scheduledTime), ['03:30', '05:30']);
    assert.equal(runState.targetDate, targetDate);
  } finally {
    teardown(ws.root);
  }
});

test('runScheduledFinalizeAttempt: 03:30 NO_SOURCE -> 05:30 re-checks and can find a newly synced Source', async () => {
  const ws = setupWorkspace();
  try {
    const targetDate = '2026-09-13';

    const first = await runScheduledFinalizeAttempt({
      scheduledTime: '03:30',
      targetDate,
      runStateDir: ws.runStateDir,
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      aiAdapter: createFakeAiAdapter(),
    });
    assert.equal(first.skipped, false);
    assert.equal(first.status, 'NO_SOURCE');

    writeFileSync(join(ws.rawDir, `${targetDate}_note.md`), 'Synced late.\n', 'utf8');
    const adapter = createFakeAiAdapter();
    const second = await runScheduledFinalizeAttempt({
      scheduledTime: '05:30',
      targetDate,
      runStateDir: ws.runStateDir,
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      aiAdapter: adapter,
    });
    assert.equal(second.skipped, false, '05:30 must re-check after a NO_SOURCE at 03:30');
    assert.equal(second.status, 'COMPLETE');
    assert.equal(adapter.calls.length, 1);
  } finally {
    teardown(ws.root);
  }
});

test('runScheduledFinalizeAttempt: NO_SOURCE at both 03:30 and 05:30 ends the targetDate (no third attempt, no Backfill)', async () => {
  const ws = setupWorkspace();
  try {
    const targetDate = '2026-09-13';
    const adapter = createFakeAiAdapter();
    const common = {
      targetDate,
      runStateDir: ws.runStateDir,
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      aiAdapter: adapter,
    };

    await runScheduledFinalizeAttempt({ ...common, scheduledTime: '03:30' });
    const second = await runScheduledFinalizeAttempt({ ...common, scheduledTime: '05:30' });
    assert.equal(second.skipped, false);
    assert.equal(second.status, 'NO_SOURCE');

    const runState = readFinalizeRunState(getFinalizeRunStatePath(ws.runStateDir, targetDate));
    assert.equal(runState.finalStatus, 'NO_SOURCE');
    assert.equal(runState.attempts.length, 2);

    // A hypothetical third invocation must also be refused by the code
    // itself, not merely by there being no third Scheduled Task trigger.
    const third = await runScheduledFinalizeAttempt({ ...common, scheduledTime: '05:30' });
    assert.equal(third.skipped, true);
    assert.equal(adapter.calls.length, 0);
  } finally {
    teardown(ws.root);
  }
});

test('runScheduledFinalizeAttempt: a recorded RECOVERY_REQUIRED blocks the next Attempt entirely (Human Review, never auto-retried)', async () => {
  const ws = setupWorkspace();
  try {
    const targetDate = '2026-09-13';
    const runStatePath = getFinalizeRunStatePath(ws.runStateDir, targetDate);
    recordFinalizeAttempt(runStatePath, targetDate, { scheduledTime: '03:30', status: 'RECOVERY_REQUIRED' });

    writeFileSync(join(ws.rawDir, `${targetDate}_note.md`), 'Should never be picked up.\n', 'utf8');
    const adapter = createFakeAiAdapter();

    const second = await runScheduledFinalizeAttempt({
      scheduledTime: '05:30',
      targetDate,
      runStateDir: ws.runStateDir,
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      aiAdapter: adapter,
    });

    assert.equal(second.skipped, true);
    assert.equal(adapter.calls.length, 0);
    const runState = readFinalizeRunState(runStatePath);
    assert.equal(runState.attempts.length, 1, 'no second attempt may be recorded once RECOVERY_REQUIRED is terminal');
  } finally {
    teardown(ws.root);
  }
});

test('runScheduledFinalizeAttempt: 03:30 CREDENTIAL_ERROR (no stored credential) blocks 05:30 entirely', async () => {
  const ws = setupWorkspace();
  const savedCredential = process.env.MYLIFEHISTORY_GEMINI_API_KEY;
  delete process.env.MYLIFEHISTORY_GEMINI_API_KEY;
  try {
    const targetDate = '2026-09-13';
    writeFileSync(join(ws.rawDir, `${targetDate}_note.md`), 'Needs a real Adapter, no credential available.\n', 'utf8');

    const first = await runScheduledFinalizeAttempt({
      scheduledTime: '03:30',
      targetDate,
      runStateDir: ws.runStateDir,
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
      // no aiAdapter injected -> forces real createGeminiAdapter() -> credential load fails
    });
    assert.equal(first.skipped, false);
    assert.equal(first.status, 'CREDENTIAL_ERROR');

    const second = await runScheduledFinalizeAttempt({
      scheduledTime: '05:30',
      targetDate,
      runStateDir: ws.runStateDir,
      rawDir: ws.rawDir,
      dailyDir: ws.dailyDir,
      stateFilePath: ws.stateFilePath,
      promptFilePath: ws.promptFilePath,
    });
    assert.equal(second.skipped, true);

    const runState = readFinalizeRunState(getFinalizeRunStatePath(ws.runStateDir, targetDate));
    assert.equal(runState.finalStatus, 'CREDENTIAL_ERROR');
    assert.equal(runState.attempts.length, 1);
  } finally {
    if (savedCredential !== undefined) {
      process.env.MYLIFEHISTORY_GEMINI_API_KEY = savedCredential;
    }
    teardown(ws.root);
  }
});
