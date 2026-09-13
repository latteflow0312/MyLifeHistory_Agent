import { writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TARGET_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function buildFilename(targetDate) {
  return `${targetDate}.md`;
}

/**
 * Writes a validated Production Daily Artifact (Markdown, verbatim,
 * no modification) as "YYYY-MM-DD.md" into an externally supplied
 * outputDirectory. Never overwrites or appends to an existing file
 * (throws instead), and uses an atomic write (temp file + rename).
 *
 * This Writer has no knowledge of Processing State whatsoever - it
 * never imports processingState.js and never decides which Source is
 * "processed". Per Constitution v0.2.0 Section 29, that separation is
 * intentional.
 *
 * @param {string} content - final Markdown content, written as-is
 * @param {string} targetDate - "YYYY-MM-DD"
 * @param {string} outputDirectory
 * @returns {string} the final file path that was written
 */
export function writeProductionDailyArtifact(content, targetDate, outputDirectory) {
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('writeProductionDailyArtifact: content must be a non-empty string');
  }
  if (typeof targetDate !== 'string' || !TARGET_DATE_PATTERN.test(targetDate)) {
    throw new Error('writeProductionDailyArtifact: targetDate must be a "YYYY-MM-DD" string');
  }
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    throw new Error('writeProductionDailyArtifact: outputDirectory must be a non-empty string');
  }

  const filename = buildFilename(targetDate);
  const finalPath = join(outputDirectory, filename);
  const tempPath = join(outputDirectory, `${filename}.tmp`);

  if (existsSync(finalPath)) {
    throw new Error(
      `writeProductionDailyArtifact: a file already exists at "${finalPath}"; refusing to overwrite`
    );
  }

  writeFileSync(tempPath, content, 'utf8');

  try {
    if (existsSync(finalPath)) {
      throw new Error(
        `writeProductionDailyArtifact: a file already exists at "${finalPath}"; refusing to overwrite`
      );
    }
    renameSync(tempPath, finalPath);
  } catch (err) {
    try {
      unlinkSync(tempPath);
    } catch {
      // best-effort cleanup only; the original error is the one that matters
    }
    throw err;
  }

  return finalPath;
}
