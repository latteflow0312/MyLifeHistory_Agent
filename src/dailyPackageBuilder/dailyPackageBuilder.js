const TARGET_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Builds a Daily Package from a candidate list of Normalized Sources,
 * keeping only sources that are new/unprocessed according to the
 * given Processing State.
 *
 * This function is read-only with respect to `state`: it only calls
 * `state.isProcessed(contentHash)` and never `markProcessed`. Being
 * included in a Package does not mean "processed" - that is recorded
 * separately, only after successful downstream handling (Phase 4+).
 *
 * Does not infer any date from file mtime/ctime or system time -
 * targetDate must be supplied explicitly by the caller (KST calendar
 * date, e.g. "2026-09-13").
 *
 * @param {Array<{ content_hash: string }>} sources
 * @param {{ isProcessed: (contentHash: string) => boolean }} state
 * @param {string} targetDate - "YYYY-MM-DD"
 * @returns {{ date: string, sources: Array<object> }}
 */
export function buildDailyPackage(sources, state, targetDate) {
  if (!Array.isArray(sources)) {
    throw new Error('buildDailyPackage: sources must be an array');
  }
  if (state === null || typeof state !== 'object' || typeof state.isProcessed !== 'function') {
    throw new Error('buildDailyPackage: state must provide an isProcessed(contentHash) function');
  }
  if (typeof targetDate !== 'string' || !TARGET_DATE_PATTERN.test(targetDate)) {
    throw new Error('buildDailyPackage: targetDate must be a "YYYY-MM-DD" string');
  }

  const seenInBatch = new Set();
  const selected = [];

  for (const source of sources) {
    if (source === null || typeof source !== 'object' || typeof source.content_hash !== 'string') {
      throw new Error('buildDailyPackage: each source must have a string content_hash');
    }

    const contentHash = source.content_hash;

    if (state.isProcessed(contentHash)) {
      continue;
    }

    if (seenInBatch.has(contentHash)) {
      continue;
    }

    seenInBatch.add(contentHash);
    selected.push(source);
  }

  return {
    date: targetDate,
    sources: selected,
  };
}
