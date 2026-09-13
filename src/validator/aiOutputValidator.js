const TARGET_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const HEADER_DATE_PATTERN = /^#\s+(\d{4}-\d{2}-\d{2})/m;
const HASH_TOKEN_PATTERN = /sha256:([0-9a-f]{64})/;

/**
 * Builds a lookup of known/input content_hash values.
 *
 * Accepts either:
 *   - a Set<string> or string[] of content_hash values (legacy/simple
 *     form - filename cross-check is skipped for these), or
 *   - an array of { content_hash, filename } objects, which also
 *     enables checking that a Source Reference's filename matches the
 *     filename of the actual input Source it claims to point to.
 *
 * @returns {Map<string, string | null>} content_hash -> filename (or null if unknown)
 */
function buildKnownSourceMap(knownContentHashes) {
  const map = new Map();

  if (knownContentHashes instanceof Set) {
    for (const hash of knownContentHashes) {
      map.set(hash, null);
    }
    return map;
  }

  if (Array.isArray(knownContentHashes)) {
    for (const item of knownContentHashes) {
      if (typeof item === 'string') {
        map.set(item, null);
      } else if (item !== null && typeof item === 'object' && typeof item.content_hash === 'string') {
        map.set(item.content_hash, typeof item.filename === 'string' ? item.filename : null);
      } else {
        throw new Error(
          'validateAiOutput: each item in knownContentHashes must be a content_hash string or { content_hash, filename }'
        );
      }
    }
    return map;
  }

  throw new Error('validateAiOutput: knownContentHashes must be a Set or an array');
}

/**
 * Extracts Source Reference entries from the "## Source" section text.
 * A reference line is any line containing a "sha256:<hash>" token; the
 * part immediately preceding that token (split by "|") is treated as
 * the filename, if present. No specific Local Run Reference label
 * (e.g. "SRC-001") is required.
 *
 * @param {string} sourceSectionText
 * @returns {Array<{ filename: string, hash: string }>}
 */
function extractSourceReferences(sourceSectionText) {
  const references = [];
  const lines = sourceSectionText.split(/\r\n|\r|\n/);

  for (const line of lines) {
    const hashMatch = line.match(HASH_TOKEN_PATTERN);
    if (!hashMatch) {
      continue;
    }

    const parts = line.split('|').map((part) => part.trim());
    const hashPartIndex = parts.findIndex((part) => part.includes('sha256:'));
    const filename = hashPartIndex > 0 ? parts[hashPartIndex - 1] : '';

    references.push({ filename, hash: hashMatch[1] });
  }

  return references;
}

/**
 * Minimal structural Validator for AI-generated Daily output, per
 * Constitution v0.2.0 Section 29 (Validator is a role separate from
 * Writer and Summarizer, and knows nothing about either) and Section
 * 30 (Production Source Reference minimum = filename + full
 * content_hash).
 *
 * This checks only structure and Source Reference integrity:
 *   - output is a non-empty string
 *   - "# YYYY-MM-DD" header matches targetDate
 *   - "## 오늘의 한 문장" / "## Tag" / "## Source" sections exist
 *   - the "## Source" section contains at least one real Source
 *     Reference (merely having the heading is not enough)
 *   - each Source Reference includes both a filename and a full
 *     64-char lowercase SHA-256 content_hash
 *   - each referenced content_hash exists in the caller-supplied set
 *     of known/input content_hash values
 *   - when filename information is available for a known content_hash,
 *     the Source Reference's filename must match it
 *
 * A Local Run Reference label (e.g. "SRC-001") is never required, and
 * no Provider-specific format or new Global ID is introduced.
 *
 * It intentionally does NOT perform per-sentence fact checking,
 * hallucination detection, or emotion/intent analysis - Constitution
 * v0.2.0 explicitly excludes those from this Phase.
 *
 * @param {string} outputText
 * @param {{
 *   targetDate: string,
 *   knownContentHashes: Set<string> | string[] | Array<{ content_hash: string, filename?: string }>,
 * }} options
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAiOutput(outputText, options) {
  if (typeof outputText !== 'string') {
    throw new Error('validateAiOutput: outputText must be a string');
  }
  if (options === null || typeof options !== 'object') {
    throw new Error('validateAiOutput: options must be an object');
  }

  const { targetDate, knownContentHashes } = options;

  if (typeof targetDate !== 'string' || !TARGET_DATE_PATTERN.test(targetDate)) {
    throw new Error('validateAiOutput: targetDate must be a "YYYY-MM-DD" string');
  }

  const knownSourceMap = buildKnownSourceMap(knownContentHashes);

  const errors = [];

  if (outputText.trim().length === 0) {
    errors.push('output is empty');
    return { valid: false, errors };
  }

  const headerMatch = outputText.match(HEADER_DATE_PATTERN);
  if (!headerMatch) {
    errors.push('missing "# YYYY-MM-DD" header');
  } else if (headerMatch[1] !== targetDate) {
    errors.push(`header date "${headerMatch[1]}" does not match targetDate "${targetDate}"`);
  }

  if (!outputText.includes('## 오늘의 한 문장')) {
    errors.push('missing "## 오늘의 한 문장" section');
  }
  if (!outputText.includes('## Tag')) {
    errors.push('missing "## Tag" section');
  }

  const sourceHeadingIndex = outputText.indexOf('## Source');
  if (sourceHeadingIndex === -1) {
    errors.push('missing "## Source" section');
  } else {
    const sourceSectionText = outputText.slice(sourceHeadingIndex);
    const references = extractSourceReferences(sourceSectionText);

    if (references.length === 0) {
      errors.push('"## Source" section must contain at least one Source Reference (filename + content_hash)');
    }

    for (const reference of references) {
      if (!reference.filename) {
        errors.push(`Source Reference missing filename for content_hash: ${reference.hash}`);
      }

      if (!knownSourceMap.has(reference.hash)) {
        errors.push(`unknown content_hash referenced: ${reference.hash}`);
        continue;
      }

      const expectedFilename = knownSourceMap.get(reference.hash);
      if (expectedFilename !== null && reference.filename !== expectedFilename) {
        errors.push(
          `Source Reference filename "${reference.filename}" does not match input Source filename "${expectedFilename}" for content_hash: ${reference.hash}`
        );
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
