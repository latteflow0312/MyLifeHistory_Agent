/**
 * Real Google Drive Production Entry.
 *
 * Wires the existing, already-tested `runGeminiProductionEntry()`
 * (scripts/run-production-gemini.mjs) to the actual MyLifeHistory
 * operational paths on Google Drive, per the Phase 11 Task 1
 * Processing State decision:
 *
 *   Input:  G:\내 드라이브\MY_LIFE_HISTORY\01_RAW
 *   Output: G:\내 드라이브\MY_LIFE_HISTORY\02_DAILY
 *   State:  G:\내 드라이브\MY_LIFE_HISTORY\99_SYSTEM\processing_state.json
 *   Prompt: prompts/daily_summary.md (resolved from this file's own
 *           location, not the current working directory)
 *
 * This file adds no new abstraction layer and no Provider Router - it
 * only supplies real paths and a real Asia/Seoul target date to
 * modules that already exist and are already tested (Collector,
 * Normalizer, Daily Package Builder, Processing State,
 * runGeminiProductionEntry). Manual execution only:
 *
 *   node scripts/run-production-real.mjs
 *
 * An optional `--previous-day` CLI flag targets the fixed Asia/Seoul
 * calendar day before today instead of today (see
 * getKstPreviousDateString) - used by the unattended 03:30 Finalize
 * Scheduled Task so a Daily Artifact always covers one fixed calendar
 * day, never a rolling 24-hour window.
 *
 * A Source is only ever included in a Daily Package if its own filename
 * date (leading "YYYY-MM-DD_") matches targetDate exactly - being
 * merely unprocessed is not sufficient (see
 * getSourceDateFromFilename). This prevents a Source written just
 * after midnight from leaking into the previous day's Artifact when
 * the unattended 03:30 Finalize run fires.
 *
 * A scheduled 03:30/05:30 unattended Finalize Attempt goes through
 * runScheduledFinalizeAttempt() instead, which additionally gates on
 * and records a per-targetDate Finalize Run State (see
 * finalizeRunState.mjs) - completely separate from
 * processing_state.json's own "which Source is processed" bookkeeping
 * (Phase 12 Task 8: "하루 독립성 원칙" - a targetDate's own problem is
 * resolved within that targetDate, never Backfilled or carried
 * forward).
 *
 * Not wired into `npm test`.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGeminiProductionEntry } from './run-production-gemini.mjs';
import { collectSources } from '../src/collector/collector.js';
import { normalizeSource } from '../src/normalizer/normalizer.js';
import { buildDailyPackage } from '../src/dailyPackageBuilder/dailyPackageBuilder.js';
import { openProcessingState } from '../src/processingState/processingState.js';
import {
  getFinalizeRunStatePath,
  readFinalizeRunState,
  recordFinalizeAttempt,
  shouldRunFinalizeAttempt,
} from './finalizeRunState.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const GOOGLE_DRIVE_ROOT = 'G:\\내 드라이브\\MY_LIFE_HISTORY';
const RAW_DIR = join(GOOGLE_DRIVE_ROOT, '01_RAW');
const DAILY_DIR = join(GOOGLE_DRIVE_ROOT, '02_DAILY');
const SYSTEM_DIR = join(GOOGLE_DRIVE_ROOT, '99_SYSTEM');
const STATE_FILE_PATH = join(SYSTEM_DIR, 'processing_state.json');
const PROMPT_FILE_PATH = join(__dirname, '..', 'prompts', 'daily_summary.md');

/**
 * Returns today's calendar date in Asia/Seoul as "YYYY-MM-DD".
 * Asia/Seoul has a fixed +09:00 offset (no DST), so this is a simple,
 * deterministic conversion - per Constitution Section 6, the Daily
 * date is always the Asia/Seoul calendar date regardless of where
 * this script happens to run.
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function getKstDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Returns the fixed Asia/Seoul calendar date immediately before today's,
 * as "YYYY-MM-DD" - never a rolling "24 hours ago" instant. Used by
 * scheduled unattended Finalize runs (Constitution: a Daily Artifact
 * always covers one fixed Asia/Seoul calendar day, regardless of what
 * time the run itself happens to fire).
 *
 * Implementation note: Asia/Seoul today's date is read once via
 * getKstDateString(), then one calendar day is subtracted by plain
 * Y/M/D integer arithmetic (via Date.UTC, which normalizes month/year
 * underflow correctly) - not by subtracting 24h from the current
 * instant and reformatting, which would be a rolling-window
 * calculation and is exactly what this function must not do.
 *
 * @param {Date} [date]
 * @returns {string}
 */
export function getKstPreviousDateString(date = new Date()) {
  const [year, month, day] = getKstDateString(date).split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 1, day - 1));
  const pad = (n) => String(n).padStart(2, '0');
  return `${previous.getUTCFullYear()}-${pad(previous.getUTCMonth() + 1)}-${pad(previous.getUTCDate())}`;
}

const SOURCE_DATE_PREFIX_PATTERN = /^(\d{4}-\d{2}-\d{2})[_-]/;

/**
 * Extracts a Source's own attributed calendar date from its filename's
 * leading "YYYY-MM-DD" prefix - the convention every RAW note filename
 * already follows (scripts/new-raw-note.ps1: "YYYY-MM-DD_HHmm_note.md").
 *
 * Returns null when the filename carries no such prefix: such a Source
 * cannot be safely attributed to any specific date and must not be
 * guessed via "it is currently unprocessed, so it must belong to
 * whatever targetDate is running right now" - that guess is exactly
 * the rolling-window bug this function exists to prevent.
 *
 * @param {string} filename
 * @returns {string | null}
 */
export function getSourceDateFromFilename(filename) {
  const match = SOURCE_DATE_PREFIX_PATTERN.exec(filename);
  return match ? match[1] : null;
}

/**
 * Runs one real (or, for tests, fully overridden) Daily Finalization
 * pass: Collector -> Normalizer -> Daily Package Builder -> the
 * existing Gemini Production Entry wiring. Defaults to the real
 * Google Drive operational paths; every path and the target date can
 * be overridden for offline testing.
 *
 * @param {{
 *   rawDir?: string,
 *   dailyDir?: string,
 *   stateFilePath?: string,
 *   promptFilePath?: string,
 *   targetDate?: string,
 *   aiAdapter?: { execute: (promptPackage: object) => Promise<unknown> },
 * }} [options]
 */
export async function runRealProductionEntry(options = {}) {
  const {
    rawDir = RAW_DIR,
    dailyDir = DAILY_DIR,
    stateFilePath = STATE_FILE_PATH,
    promptFilePath = PROMPT_FILE_PATH,
    targetDate = getKstDateString(),
    aiAdapter,
  } = options;

  const state = openProcessingState(stateFilePath);
  const rawSources = collectSources(rawDir);
  const normalized = rawSources.map((source) => normalizeSource(source));

  // Non-negotiable date boundary (Phase 12 Task 6): a Source belongs to
  // targetDate's Daily Package only if its OWN filename date matches
  // targetDate exactly - "currently unprocessed" is never sufficient by
  // itself. A Source whose filename carries no parseable date is
  // excluded from every targetDate rather than guessed.
  const attributedToTargetDate = [];
  for (const source of normalized) {
    const sourceDate = getSourceDateFromFilename(source.filename);
    if (sourceDate === null) {
      console.log(`Skipped (no date prefix in filename): ${source.filename}`);
      continue;
    }
    if (sourceDate === targetDate) {
      attributedToTargetDate.push(source);
    }
  }

  const dailyPackage = buildDailyPackage(attributedToTargetDate, state, targetDate);

  // Empty input must terminate safely without ever constructing a real
  // Adapter (which requires a credential) or making an AI call - checked
  // here, before delegating, because runGeminiProductionEntry builds the
  // Adapter first when none is injected.
  if (dailyPackage.sources.length === 0) {
    console.log('Provider: Gemini');
    console.log(`Input date: ${dailyPackage.date}`);
    console.log('Source count: 0');
    console.log(`Output directory: ${dailyDir}`);
    console.log('Pipeline status: skipped_empty_input');
    return { status: 'skipped_empty_input', artifactPath: null, sourceCount: 0 };
  }

  return runGeminiProductionEntry({
    dailyPackage,
    promptFilePath,
    state,
    outputDirectory: dailyDir,
    aiAdapter,
  });
}

/**
 * Classifies a thrown Error from runRealProductionEntry's internals
 * into one of the fixed Finalize Run State statuses, using only the
 * distinct message prefixes each source already throws - no new Error
 * subclasses, no changes to the modules that throw them.
 *
 * @param {unknown} err
 * @returns {'CREDENTIAL_ERROR' | 'VALIDATOR_REJECTED' | 'WRITER_ERROR' | 'PROVIDER_ERROR'}
 */
export function classifyFinalizeError(err) {
  const message = err && typeof err.message === 'string' ? err.message : '';
  if (message.startsWith('loadAiCredential:')) {
    return 'CREDENTIAL_ERROR';
  }
  if (message.startsWith('runProductionPipeline: AI output failed validation')) {
    return 'VALIDATOR_REJECTED';
  }
  if (message.startsWith('writeProductionDailyArtifact:')) {
    return 'WRITER_ERROR';
  }
  return 'PROVIDER_ERROR';
}

/**
 * Maps a runRealProductionEntry() return value's status to a Finalize
 * Run State status.
 *
 * @param {{ status: string }} result
 * @returns {string}
 */
function mapResultStatus(result) {
  switch (result.status) {
    case 'complete':
      return 'COMPLETE';
    case 'skipped_empty_input':
      return 'NO_SOURCE';
    case 'human_review_required':
      return 'HUMAN_REVIEW_REQUIRED';
    case 'recovery_required':
      return 'RECOVERY_REQUIRED';
    default:
      return 'PROVIDER_ERROR';
  }
}

/**
 * Runs one scheduled (03:30 or 05:30) unattended Finalize Attempt for
 * the fixed Asia/Seoul "yesterday" targetDate, gated by that
 * targetDate's Finalize Run State (finalizeRunState.mjs):
 *
 *   - A terminal prior status (COMPLETE / CREDENTIAL_ERROR /
 *     VALIDATOR_REJECTED / RECOVERY_REQUIRED / HUMAN_REVIEW_REQUIRED)
 *     or an existing 2-attempt record skips this call entirely - no
 *     Production call, no Adapter construction, no credential needed.
 *   - Otherwise runs runRealProductionEntry() once, classifies the
 *     outcome, and records exactly one new attempt.
 *
 * Never retries beyond this single call, never Backfills a different
 * date, and never touches processing_state.json's own schema.
 *
 * @param {{
 *   scheduledTime: '03:30' | '05:30',
 *   runStateDir?: string,
 * } & Omit<Parameters<typeof runRealProductionEntry>[0], 'targetDate'> & { targetDate?: string }} [options]
 */
export async function runScheduledFinalizeAttempt(options = {}) {
  const { scheduledTime, runStateDir = SYSTEM_DIR, targetDate: targetDateOverride, ...entryOptions } = options;
  const targetDate = targetDateOverride ?? getKstPreviousDateString();

  const runStatePath = getFinalizeRunStatePath(runStateDir, targetDate);
  const existingState = readFinalizeRunState(runStatePath);

  if (!shouldRunFinalizeAttempt(existingState)) {
    console.log(
      `Finalize attempt skipped for ${targetDate}: prior state is terminal or attempt limit reached ` +
        `(finalStatus=${existingState ? existingState.finalStatus : 'none'}).`
    );
    return { skipped: true, targetDate, existingState };
  }

  let status;
  let result = null;
  try {
    result = await runRealProductionEntry({ ...entryOptions, targetDate });
    status = mapResultStatus(result);
  } catch (err) {
    status = classifyFinalizeError(err);
  }

  const runState = recordFinalizeAttempt(runStatePath, targetDate, { scheduledTime, status });
  console.log(`Finalize attempt recorded: targetDate=${targetDate} scheduledTime=${scheduledTime} status=${status}`);

  return { skipped: false, targetDate, status, result, runState };
}

export { RAW_DIR, DAILY_DIR, SYSTEM_DIR, STATE_FILE_PATH, PROMPT_FILE_PATH };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const scheduledTimeArg = process.argv.find((arg) => arg.startsWith('--scheduled-time='));
  const usePreviousDay = process.argv.includes('--previous-day');

  if (scheduledTimeArg) {
    const scheduledTime = scheduledTimeArg.slice('--scheduled-time='.length);
    runScheduledFinalizeAttempt({ scheduledTime }).catch((err) => {
      console.log(`FAIL: ${err.message}`);
      process.exitCode = 1;
    });
  } else {
    const entryOptions = usePreviousDay ? { targetDate: getKstPreviousDateString() } : {};
    runRealProductionEntry(entryOptions).catch((err) => {
      console.log(`FAIL: ${err.message}`);
      process.exitCode = 1;
    });
  }
}
