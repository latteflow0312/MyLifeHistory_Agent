import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SUPPORTED_EXTENSIONS = new Set(['.md', '.txt']);

function getExtension(filename) {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === filename.length - 1) {
    return '';
  }
  return filename.slice(lastDot).toLowerCase();
}

/**
 * Reads supported Source files (.md, .txt) from sourceDir.
 * Does not interpret, summarize, judge, move, rename, delete or
 * overwrite any file. Unsupported extensions are silently skipped
 * (not an error).
 *
 * @param {string} sourceDir - path to a directory containing Source files
 * @returns {{ filename: string, rawContent: string }[]}
 */
export function collectSources(sourceDir) {
  if (typeof sourceDir !== 'string' || sourceDir.length === 0) {
    throw new Error('collectSources: sourceDir must be a non-empty string');
  }

  let entries;
  try {
    entries = readdirSync(sourceDir, { withFileTypes: true });
  } catch (err) {
    throw new Error(`collectSources: unable to read directory "${sourceDir}": ${err.message}`);
  }

  const results = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const extension = getExtension(entry.name);
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      continue;
    }

    const filePath = join(sourceDir, entry.name);
    const rawContent = readFileSync(filePath, 'utf8');

    results.push({
      filename: entry.name,
      rawContent,
    });
  }

  return results;
}
