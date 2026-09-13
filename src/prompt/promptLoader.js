import { readFileSync } from 'node:fs';

/**
 * Loads a Markdown prompt file and returns its exact UTF-8 content.
 * No trimming, no newline normalization, no BOM post-processing,
 * no content modification of any kind.
 *
 * @param {string} filePath - path to a Markdown prompt file
 * @returns {string} the file content, exactly as stored
 */
export function loadPrompt(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('loadPrompt: filePath must be a non-empty string');
  }

  try {
    return readFileSync(filePath, 'utf8');
  } catch (err) {
    throw new Error(`loadPrompt: unable to read prompt file at "${filePath}": ${err.message}`);
  }
}
