import { readFileSync } from 'node:fs';

const REQUIRED_STRING_FIELDS = [
  'google_drive_root',
  'inbox_folder',
  'raw_folder',
  'daily_folder',
  'review_folder',
  'system_folder',
  'timezone',
];

const REQUIRED_TIMEZONE = 'Asia/Seoul';

/**
 * Loads and validates the MyLifeHistory config JSON at filePath.
 * Does not perform any filesystem access on the values inside the
 * config (e.g. google_drive_root) - only the config file itself is read.
 *
 * @param {string} filePath - path to a settings JSON file
 * @returns {{
 *   google_drive_root: string,
 *   inbox_folder: string,
 *   raw_folder: string,
 *   daily_folder: string,
 *   review_folder: string,
 *   system_folder: string,
 *   timezone: string,
 * }}
 */
export function loadConfig(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('loadConfig: filePath must be a non-empty string');
  }

  let rawText;
  try {
    rawText = readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`loadConfig: unable to read config file at "${filePath}": ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new Error(`loadConfig: config file at "${filePath}" is not valid JSON: ${err.message}`);
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`loadConfig: config file at "${filePath}" must contain a JSON object`);
  }

  for (const field of REQUIRED_STRING_FIELDS) {
    const value = parsed[field];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`loadConfig: missing or invalid required field "${field}"`);
    }
  }

  if (parsed.timezone !== REQUIRED_TIMEZONE) {
    throw new Error(
      `loadConfig: timezone must be "${REQUIRED_TIMEZONE}", got "${parsed.timezone}"`
    );
  }

  return {
    google_drive_root: parsed.google_drive_root,
    inbox_folder: parsed.inbox_folder,
    raw_folder: parsed.raw_folder,
    daily_folder: parsed.daily_folder,
    review_folder: parsed.review_folder,
    system_folder: parsed.system_folder,
    timezone: parsed.timezone,
  };
}
