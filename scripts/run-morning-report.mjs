/**
 * 07:30 Morning Report Foundation.
 *
 * Builds a Morning Report for the fixed Asia/Seoul "yesterday"
 * targetDate by reading two already-existing, already-real files -
 * never by calling Gemini again and never by touching
 * processing_state.json or finalize_runs/*.json:
 *
 *   1. G:\...\99_SYSTEM\finalize_runs\YYYY-MM-DD.json (Finalize Run State)
 *   2. G:\...\02_DAILY\YYYY-MM-DD.md                  (Daily Artifact)
 *
 * A Daily Artifact existing is NEVER by itself treated as COMPLETE -
 * both the Finalize Run State's finalStatus being exactly "COMPLETE"
 * AND the Artifact existing must hold (e.g. RECOVERY_REQUIRED can
 * leave a real Artifact behind while the day is still not COMPLETE).
 *
 * This file also exposes a minimal, provider-agnostic Notification
 * interface (`sendMorningReportNotifications`) - Email/Telegram are
 * plain `{ send(report) => Promise<void> }` objects supplied by the
 * caller. No real Gmail/Telegram SDK, credential, or network code
 * exists here; wiring real Adapters in is a later Task. Sending never
 * changes Daily Production status - Notification outcome is tracked
 * completely separately (see notificationState.mjs).
 *
 * Manual execution only:
 *
 *   node scripts/run-morning-report.mjs
 *
 * The CLI entry only builds and prints the Report (safe fields only -
 * this is the user's own already-summarized Daily content, not raw
 * Source/Prompt/credential material); it does not attempt any real
 * notification send, since no real channel exists yet.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getKstPreviousDateString, SYSTEM_DIR, DAILY_DIR } from './run-production-real.mjs';
import { getFinalizeRunStatePath, readFinalizeRunState } from './finalizeRunState.mjs';

// Recorded statuses that mean "something needs a human to look" - used
// only to set a fixed, derived flag on the Report. Never a guess about
// *why* something failed; only the recorded status code is consulted.
const NEEDS_REVIEW_STATUSES = new Set([
  'CREDENTIAL_ERROR',
  'VALIDATOR_REJECTED',
  'RECOVERY_REQUIRED',
  'HUMAN_REVIEW_REQUIRED',
  'PROVIDER_ERROR',
  'WRITER_ERROR',
]);

// (?![\s\S]) asserts true end-of-string regardless of the 'm' flag -
// plain "$" would (with 'm') also match right before ANY "\n", which
// truncated a multi-line section after its first line.
const END_OF_STRING = '(?![\\s\\S])';

function extractSection(markdown, headingText) {
  const pattern = new RegExp(`^##\\s+${headingText}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|${END_OF_STRING})`, 'm');
  const match = pattern.exec(markdown);
  return match ? match[1].trim() : null;
}

function extractSummary(markdown) {
  const withoutDateHeader = markdown.replace(/^#\s*\d{4}-\d{2}-\d{2}\s*\n/, '');
  const match = new RegExp(`^([\\s\\S]*?)(?=\\n##\\s|${END_OF_STRING})`).exec(withoutDateHeader);
  return match ? match[1].trim() : '';
}

function extractTags(tagSection) {
  if (!tagSection) {
    return [];
  }
  return tagSection
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-'))
    .map((line) => line.replace(/^-+\s*/, '').trim())
    .filter(Boolean);
}

/**
 * Parses the parts of a Daily Artifact a Morning Report needs, reusing
 * the Artifact's own existing text verbatim - no new summarization, no
 * AI call.
 *
 * @param {string} markdown
 * @returns {{ summary: string, oneLiner: string, tags: string[] }}
 */
export function parseDailyArtifact(markdown) {
  const oneLinerSection = extractSection(markdown, '오늘의 한 문장');
  return {
    summary: extractSummary(markdown),
    oneLiner: oneLinerSection ? oneLinerSection.replace(/^>\s*/, '') : '',
    tags: extractTags(extractSection(markdown, 'Tag')),
  };
}

/**
 * Builds one targetDate's Morning Report by reading the Finalize Run
 * State and the Daily Artifact - no Gemini call, no state mutation.
 *
 * @param {{ targetDate?: string, systemDir?: string, dailyDir?: string }} [options]
 * @returns {object} a COMPLETE report or an INCOMPLETE report (see module docs)
 */
export function buildMorningReport(options = {}) {
  const {
    targetDate = getKstPreviousDateString(),
    systemDir = SYSTEM_DIR,
    dailyDir = DAILY_DIR,
  } = options;

  const runStatePath = getFinalizeRunStatePath(systemDir, targetDate);
  const runState = readFinalizeRunState(runStatePath);
  const artifactPath = join(dailyDir, `${targetDate}.md`);
  const artifactExists = existsSync(artifactPath);
  const finalStatus = runState ? runState.finalStatus : null;

  if (finalStatus === 'COMPLETE' && artifactExists) {
    const markdown = readFileSync(artifactPath, 'utf8');
    const parsed = parseDailyArtifact(markdown);
    return {
      targetDate,
      reportStatus: 'COMPLETE',
      oneLiner: parsed.oneLiner,
      summary: parsed.summary,
      tags: parsed.tags,
      dailySaved: true,
      artifactPath,
    };
  }

  const findAttempt = (scheduledTime) =>
    runState ? (runState.attempts.find((a) => a.scheduledTime === scheduledTime)?.status ?? null) : null;

  return {
    targetDate,
    reportStatus: 'INCOMPLETE',
    dailyIncomplete: true,
    attempt0330: findAttempt('03:30'),
    attempt0530: findAttempt('05:30'),
    finalStatus,
    autoBackfill: false,
    humanReviewNeeded: finalStatus === null || NEEDS_REVIEW_STATUSES.has(finalStatus),
  };
}

async function tryNotify(notifier, report) {
  if (!notifier) {
    return { success: false };
  }
  try {
    await notifier.send(report);
    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * Sends a Morning Report through independent Email/Telegram Notifiers
 * and reports each channel's outcome plus a combined status. Delivery
 * failure of either or both channels never changes Daily Production
 * status - that already lives entirely in `report`/finalize_runs and
 * is untouched here.
 *
 * @param {{
 *   report: object,
 *   emailNotifier?: { send: (report: object) => Promise<void> },
 *   telegramNotifier?: { send: (report: object) => Promise<void> },
 * }} options
 * @returns {Promise<{ email: 'SUCCESS' | 'FAILED', telegram: 'SUCCESS' | 'FAILED', notificationStatus: 'SUCCESS' | 'PARTIAL_SUCCESS' | 'DELIVERY_FAILED' }>}
 */
export async function sendMorningReportNotifications({ report, emailNotifier, telegramNotifier }) {
  const emailResult = await tryNotify(emailNotifier, report);
  const telegramResult = await tryNotify(telegramNotifier, report);

  let notificationStatus;
  if (emailResult.success && telegramResult.success) {
    notificationStatus = 'SUCCESS';
  } else if (!emailResult.success && !telegramResult.success) {
    notificationStatus = 'DELIVERY_FAILED';
  } else {
    notificationStatus = 'PARTIAL_SUCCESS';
  }

  return {
    email: emailResult.success ? 'SUCCESS' : 'FAILED',
    telegram: telegramResult.success ? 'SUCCESS' : 'FAILED',
    notificationStatus,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = buildMorningReport();
  console.log(JSON.stringify(report, null, 2));
}
