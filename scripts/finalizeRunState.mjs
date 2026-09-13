/**
 * Finalize Run State - tracks how each targetDate's unattended Finalize
 * automation ended, completely separate from processing_state.json
 * (which tracks which Sources have been processed). The two files have
 * different responsibilities and are never merged.
 *
 * Stores only: targetDate, finalStatus, and a list of
 * { scheduledTime, status } attempts - never Source content, Prompt
 * text, credentials, stack traces, or raw Provider responses.
 *
 * File shape:
 *   {
 *     "targetDate": "2026-09-13",
 *     "finalStatus": "COMPLETE",
 *     "attempts": [
 *       { "scheduledTime": "03:30", "status": "PROVIDER_ERROR" },
 *       { "scheduledTime": "05:30", "status": "COMPLETE" }
 *     ]
 *   }
 */

import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

// Statuses that end a targetDate's automation for good - a later
// attempt must never run again once one of these is recorded.
const TERMINAL_STATUSES = new Set([
  'COMPLETE',
  'CREDENTIAL_ERROR',
  'VALIDATOR_REJECTED',
  'RECOVERY_REQUIRED',
  'HUMAN_REVIEW_REQUIRED',
]);

// Maximum Finalize Attempts per targetDate (03:30 + 05:30) - enforced
// here regardless of how many times something happens to invoke this,
// not merely because only two Scheduled Task triggers exist.
const MAX_ATTEMPTS_PER_DATE = 2;

/**
 * @param {string} systemDir - the real 99_SYSTEM directory (or a test stand-in)
 * @param {string} targetDate - "YYYY-MM-DD"
 * @returns {string}
 */
export function getFinalizeRunStatePath(systemDir, targetDate) {
  return join(systemDir, 'finalize_runs', `${targetDate}.json`);
}

/**
 * Reads the Finalize Run State for one targetDate. Returns null when no
 * attempt has been recorded yet (the normal, expected first-attempt
 * condition) - never auto-initializes. A malformed existing file is an
 * Error (Fail-Stop), never silently treated as "no state".
 *
 * @param {string} runStatePath
 * @returns {{ targetDate: string, finalStatus: string, attempts: Array<{ scheduledTime: string, status: string }> } | null}
 */
export function readFinalizeRunState(runStatePath) {
  if (!existsSync(runStatePath)) {
    return null;
  }
  const raw = readFileSync(runStatePath, 'utf8');
  return JSON.parse(raw);
}

function atomicWriteJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  const tempPath = `${path}.tmp`;
  writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  try {
    renameSync(tempPath, path);
  } catch (err) {
    try {
      unlinkSync(tempPath);
    } catch {
      // best-effort cleanup only; the rename error is the one that matters
    }
    throw err;
  }
}

/**
 * Appends one Finalize Attempt to the given targetDate's Run State and
 * writes it atomically (temp file + rename, same pattern as
 * processingState.js). `finalStatus` always reflects the most recent
 * attempt's status.
 *
 * @param {string} runStatePath
 * @param {string} targetDate
 * @param {{ scheduledTime: '03:30' | '05:30', status: string }} attempt
 * @returns {{ targetDate: string, finalStatus: string, attempts: object[] }}
 */
export function recordFinalizeAttempt(runStatePath, targetDate, attempt) {
  const existing = readFinalizeRunState(runStatePath);
  const attempts = existing ? [...existing.attempts, attempt] : [attempt];
  const state = { targetDate, finalStatus: attempt.status, attempts };
  atomicWriteJson(runStatePath, state);
  return state;
}

/**
 * Decides whether a new Finalize Attempt may run for a targetDate,
 * given its existing Run State (or null if none yet):
 *
 *   - No prior state -> run (first attempt of the day).
 *   - Prior finalStatus is terminal (COMPLETE / CREDENTIAL_ERROR /
 *     VALIDATOR_REJECTED / RECOVERY_REQUIRED / HUMAN_REVIEW_REQUIRED)
 *     -> never run again.
 *   - Already at the 2-attempt cap -> never run again, regardless of
 *     status (no Backfill, no third attempt, no carry-forward).
 *   - Otherwise (a retryable status: PROVIDER_ERROR / WRITER_ERROR /
 *     NO_SOURCE, and fewer than 2 attempts so far) -> run.
 *
 * @param {{ finalStatus: string, attempts: object[] } | null} existingState
 * @returns {boolean}
 */
export function shouldRunFinalizeAttempt(existingState) {
  if (existingState === null) {
    return true;
  }
  if (TERMINAL_STATUSES.has(existingState.finalStatus)) {
    return false;
  }
  if (existingState.attempts.length >= MAX_ATTEMPTS_PER_DATE) {
    return false;
  }
  return true;
}
