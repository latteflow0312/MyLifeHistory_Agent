const TARGET_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Builds a Provider-independent Development Prompt Package from a
 * Daily Package and the daily_summary.md instructions text.
 *
 * Does not modify instructions or source content in any way, does
 * not reorder sources, does not add artifact_created_at, and does
 * not generate a Local Run Reference (SRC-001 etc). Refuses to build
 * a package when there are no sources - "no new source" must never
 * silently become a valid, empty prompt package.
 *
 * @param {{ date: string, sources: object[] }} dailyPackage
 * @param {string} instructions - raw daily_summary.md content
 * @returns {{ date: string, instructions: string, sources: object[] }}
 */
export function buildPromptPackage(dailyPackage, instructions) {
  if (dailyPackage === null || typeof dailyPackage !== 'object') {
    throw new Error('buildPromptPackage: dailyPackage must be an object');
  }

  const { date, sources } = dailyPackage;

  if (typeof date !== 'string' || !TARGET_DATE_PATTERN.test(date)) {
    throw new Error('buildPromptPackage: dailyPackage.date must be a "YYYY-MM-DD" string');
  }

  if (!Array.isArray(sources)) {
    throw new Error('buildPromptPackage: dailyPackage.sources must be an array');
  }

  if (typeof instructions !== 'string' || instructions.length === 0) {
    throw new Error('buildPromptPackage: instructions must be a non-empty string');
  }

  if (sources.length === 0) {
    throw new Error(
      'buildPromptPackage: dailyPackage.sources is empty; no prompt package is built for empty input'
    );
  }

  return {
    date,
    instructions,
    sources: sources.slice(),
  };
}
