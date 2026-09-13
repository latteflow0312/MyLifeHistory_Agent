import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildMorningReport,
  parseDailyArtifact,
  sendMorningReportNotifications,
} from '../../scripts/run-morning-report.mjs';
import { recordFinalizeAttempt, getFinalizeRunStatePath } from '../../scripts/finalizeRunState.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MORNING_REPORT_SOURCE_PATH = join(__dirname, '..', '..', 'scripts', 'run-morning-report.mjs');

function setupWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'mlh-morning-report-'));
  const systemDir = join(root, '99_SYSTEM');
  const dailyDir = join(root, '02_DAILY');
  mkdirSync(systemDir);
  mkdirSync(dailyDir);
  return { root, systemDir, dailyDir };
}

function teardown(root) {
  rmSync(root, { recursive: true, force: true });
}

function writeArtifact(dailyDir, targetDate) {
  const markdown = [
    `# ${targetDate}`,
    '',
    '- 오늘 있었던 일을 정리했다 [SRC-001].',
    '',
    '## 오늘의 한 문장',
    '',
    '> 오늘 하루를 정리한 한 문장.',
    '',
    '## Tag',
    '',
    '- #DECISION_CONTEXT',
    '- #KNOWLEDGE_LEGACY',
    '',
    '## Source',
    '',
    '- SRC-001 | note.md | sha256:' + '0'.repeat(64),
    '',
  ].join('\n');
  writeFileSync(join(dailyDir, `${targetDate}.md`), markdown, 'utf8');
  return markdown;
}

// --- Case 1: COMPLETE + Artifact -> normal Report -----------------------

test('Case 1: finalStatus COMPLETE + Artifact exists -> a normal COMPLETE Report, no Gemini call', () => {
  const ws = setupWorkspace();
  try {
    const targetDate = '2026-09-13';
    writeArtifact(ws.dailyDir, targetDate);
    recordFinalizeAttempt(getFinalizeRunStatePath(ws.systemDir, targetDate), targetDate, {
      scheduledTime: '03:30',
      status: 'COMPLETE',
    });

    const report = buildMorningReport({ targetDate, systemDir: ws.systemDir, dailyDir: ws.dailyDir });

    assert.equal(report.reportStatus, 'COMPLETE');
    assert.equal(report.targetDate, targetDate);
    assert.equal(report.oneLiner, '오늘 하루를 정리한 한 문장.');
    assert.match(report.summary, /오늘 있었던 일을 정리했다/);
    assert.deepEqual(report.tags, ['#DECISION_CONTEXT', '#KNOWLEDGE_LEGACY']);
    assert.equal(report.dailySaved, true);
    assert.ok(report.artifactPath.endsWith(`${targetDate}.md`));
  } finally {
    teardown(ws.root);
  }
});

// --- Case 2: NO_SOURCE -> incomplete Report ------------------------------

test('Case 2: finalStatus NO_SOURCE -> an INCOMPLETE Report using only recorded status codes, no guessing', () => {
  const ws = setupWorkspace();
  try {
    const targetDate = '2026-09-13';
    const runStatePath = getFinalizeRunStatePath(ws.systemDir, targetDate);
    recordFinalizeAttempt(runStatePath, targetDate, { scheduledTime: '03:30', status: 'NO_SOURCE' });
    recordFinalizeAttempt(runStatePath, targetDate, { scheduledTime: '05:30', status: 'NO_SOURCE' });

    const report = buildMorningReport({ targetDate, systemDir: ws.systemDir, dailyDir: ws.dailyDir });

    assert.equal(report.reportStatus, 'INCOMPLETE');
    assert.equal(report.dailyIncomplete, true);
    assert.equal(report.attempt0330, 'NO_SOURCE');
    assert.equal(report.attempt0530, 'NO_SOURCE');
    assert.equal(report.finalStatus, 'NO_SOURCE');
    assert.equal(report.autoBackfill, false);
    assert.equal(report.humanReviewNeeded, false, 'NO_SOURCE alone is not an error needing review');
  } finally {
    teardown(ws.root);
  }
});

// --- Case 3: RECOVERY_REQUIRED + Artifact exists -> never misreport COMPLETE ---

test('Case 3: RECOVERY_REQUIRED with an existing Artifact must never be reported as COMPLETE', () => {
  const ws = setupWorkspace();
  try {
    const targetDate = '2026-09-13';
    // The Artifact really can exist under RECOVERY_REQUIRED (Writer
    // succeeded, State commit failed) - Artifact existence alone must
    // never be treated as COMPLETE.
    writeArtifact(ws.dailyDir, targetDate);
    recordFinalizeAttempt(getFinalizeRunStatePath(ws.systemDir, targetDate), targetDate, {
      scheduledTime: '03:30',
      status: 'RECOVERY_REQUIRED',
    });

    const report = buildMorningReport({ targetDate, systemDir: ws.systemDir, dailyDir: ws.dailyDir });

    assert.equal(report.reportStatus, 'INCOMPLETE');
    assert.notEqual(report.reportStatus, 'COMPLETE');
    assert.equal(report.finalStatus, 'RECOVERY_REQUIRED');
    assert.equal(report.humanReviewNeeded, true);
  } finally {
    teardown(ws.root);
  }
});

test('no Finalize Run State recorded at all -> INCOMPLETE, needs review (never guessed as COMPLETE)', () => {
  const ws = setupWorkspace();
  try {
    const targetDate = '2026-09-13';
    const report = buildMorningReport({ targetDate, systemDir: ws.systemDir, dailyDir: ws.dailyDir });
    assert.equal(report.reportStatus, 'INCOMPLETE');
    assert.equal(report.finalStatus, null);
    assert.equal(report.attempt0330, null);
    assert.equal(report.attempt0530, null);
    assert.equal(report.humanReviewNeeded, true);
  } finally {
    teardown(ws.root);
  }
});

// --- parseDailyArtifact regression coverage (multi-line section bug) ----

test('parseDailyArtifact extracts every Tag line, not just the first (regression)', () => {
  const markdown = writeArtifactMarkdownFixture();
  const parsed = parseDailyArtifact(markdown);
  assert.deepEqual(parsed.tags, ['#DECISION_CONTEXT', '#KNOWLEDGE_LEGACY']);
});

function writeArtifactMarkdownFixture() {
  return [
    '# 2026-09-13',
    '',
    '- line one [SRC-001].',
    '- line two [SRC-001].',
    '',
    '## 오늘의 한 문장',
    '',
    '> one liner.',
    '',
    '## Tag',
    '',
    '- #DECISION_CONTEXT',
    '- #KNOWLEDGE_LEGACY',
    '',
    '## Source',
    '',
    '- SRC-001 | note.md | sha256:' + '0'.repeat(64),
    '',
  ].join('\n');
}

// --- Case 4/5: Notification channel status separation -------------------

function successNotifier() {
  return { send: async () => {} };
}

function failingNotifier() {
  return { send: async () => { throw new Error('simulated delivery failure'); } };
}

test('Case 4: Email SUCCESS + Telegram FAILED -> PARTIAL_SUCCESS, Daily status untouched', async () => {
  const report = { targetDate: '2026-09-13', reportStatus: 'COMPLETE' };
  const result = await sendMorningReportNotifications({
    report,
    emailNotifier: successNotifier(),
    telegramNotifier: failingNotifier(),
  });

  assert.equal(result.email, 'SUCCESS');
  assert.equal(result.telegram, 'FAILED');
  assert.equal(result.notificationStatus, 'PARTIAL_SUCCESS');
  assert.equal(report.reportStatus, 'COMPLETE', 'Notification outcome must never mutate Daily/Report status');
});

test('Case 5: Email FAILED + Telegram FAILED -> DELIVERY_FAILED, Daily status untouched', async () => {
  const report = { targetDate: '2026-09-13', reportStatus: 'COMPLETE' };
  const result = await sendMorningReportNotifications({
    report,
    emailNotifier: failingNotifier(),
    telegramNotifier: failingNotifier(),
  });

  assert.equal(result.email, 'FAILED');
  assert.equal(result.telegram, 'FAILED');
  assert.equal(result.notificationStatus, 'DELIVERY_FAILED');
  assert.equal(report.reportStatus, 'COMPLETE');
});

test('both channels SUCCESS -> SUCCESS', async () => {
  const result = await sendMorningReportNotifications({
    report: { targetDate: '2026-09-13' },
    emailNotifier: successNotifier(),
    telegramNotifier: successNotifier(),
  });
  assert.equal(result.notificationStatus, 'SUCCESS');
});

test('a missing Notifier is treated as FAILED, not a thrown error', async () => {
  const result = await sendMorningReportNotifications({
    report: { targetDate: '2026-09-13' },
    emailNotifier: successNotifier(),
    telegramNotifier: undefined,
  });
  assert.equal(result.email, 'SUCCESS');
  assert.equal(result.telegram, 'FAILED');
  assert.equal(result.notificationStatus, 'PARTIAL_SUCCESS');
});

// --- Case 6: no Gemini call anywhere in this file ------------------------

test('Case 6: run-morning-report.mjs never imports or calls any AI Adapter / Gemini / summarize code (source scan)', () => {
  const source = readFileSync(MORNING_REPORT_SOURCE_PATH, 'utf8');
  // Scan for actual usage syntax (imports/calls), not prose - this file's
  // own comments legitimately explain that it does NOT call Gemini.
  assert.ok(!/from\s+['"][^'"]*gemini[^'"]*['"]/i.test(source), 'must not import anything from a gemini-named module');
  assert.ok(!source.includes('createGeminiAdapter('));
  assert.ok(!source.includes('runGeminiProductionEntry('));
  assert.ok(!source.includes('summarize('));
  assert.ok(!/from\s+['"][^'"]*aiAdapter[^'"]*['"]/i.test(source), 'must not import anything from an aiAdapter module');
});
