/**
 * Notification State - an OPTIONAL, minimal record of whether a Morning
 * Report's Email/Telegram delivery succeeded, completely separate from
 * processing_state.json and finalize_runs/*.json. Recording this is
 * optional (per Phase 12 Task 9 - "필요하다면 ... 기록 가능"); nothing
 * in this project currently writes it from a real run yet, since real
 * Email/Telegram sending is out of this Task's scope.
 *
 * File shape:
 *   {
 *     "targetDate": "2026-09-13",
 *     "email": "SUCCESS" | "FAILED",
 *     "telegram": "SUCCESS" | "FAILED",
 *     "notificationStatus": "SUCCESS" | "PARTIAL_SUCCESS" | "DELIVERY_FAILED"
 *   }
 *
 * Never stores API keys, bot tokens, credentials, message bodies, or
 * error details - only the fixed status fields above. Daily Production
 * status (finalize_runs) is never modified by a Notification outcome.
 */

import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * @param {string} systemDir - the real 99_SYSTEM directory (or a test stand-in)
 * @param {string} targetDate - "YYYY-MM-DD"
 * @returns {string}
 */
export function getNotificationStatePath(systemDir, targetDate) {
  return join(systemDir, 'notifications', `${targetDate}.json`);
}

/**
 * @param {string} notificationStatePath
 * @returns {{ targetDate: string, email: string, telegram: string, notificationStatus: string } | null}
 */
export function readNotificationState(notificationStatePath) {
  if (!existsSync(notificationStatePath)) {
    return null;
  }
  return JSON.parse(readFileSync(notificationStatePath, 'utf8'));
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
 * Atomically writes (replaces) the Notification State for a targetDate.
 *
 * @param {string} notificationStatePath
 * @param {{ targetDate: string, email: string, telegram: string, notificationStatus: string }} state
 */
export function recordNotificationState(notificationStatePath, state) {
  atomicWriteJson(notificationStatePath, state);
  return state;
}
