import { writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const TARGET_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function buildFilename(date) {
  return `${date}_prompt-package.json`;
}

/**
 * Writes a Development Prompt Package as UTF-8 JSON into an externally
 * supplied outputDirectory. Never overwrites an existing file silently
 * (throws instead), uses an atomic write (temp file + rename), and has
 * no knowledge of Processing State - it never calls markProcessed and
 * never touches Google Drive or any Production path.
 *
 * @param {{ date: string, instructions: string, sources: object[] }} promptPackage
 * @param {string} outputDirectory
 * @returns {string} the final file path that was written
 */
export function writeDevelopmentArtifact(promptPackage, outputDirectory) {
  if (promptPackage === null || typeof promptPackage !== 'object') {
    throw new Error('writeDevelopmentArtifact: promptPackage must be an object');
  }
  if (typeof promptPackage.date !== 'string' || !TARGET_DATE_PATTERN.test(promptPackage.date)) {
    throw new Error('writeDevelopmentArtifact: promptPackage.date must be a "YYYY-MM-DD" string');
  }
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    throw new Error('writeDevelopmentArtifact: outputDirectory must be a non-empty string');
  }

  const filename = buildFilename(promptPackage.date);
  const finalPath = join(outputDirectory, filename);
  const tempPath = join(outputDirectory, `${filename}.tmp`);

  if (existsSync(finalPath)) {
    throw new Error(
      `writeDevelopmentArtifact: a file already exists at "${finalPath}"; refusing to overwrite`
    );
  }

  const text = JSON.stringify(promptPackage, null, 2);
  writeFileSync(tempPath, text, 'utf8');

  try {
    if (existsSync(finalPath)) {
      throw new Error(
        `writeDevelopmentArtifact: a file already exists at "${finalPath}"; refusing to overwrite`
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
