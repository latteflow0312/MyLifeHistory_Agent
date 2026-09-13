import { createHash } from 'node:crypto';

const SCHEMA_VERSION = '0.1';
const LOCAL_FILE_SOURCE_NAME = 'local_file';

/**
 * Computes the Normalized Source content_hash: SHA-256 of the exact
 * UTF-8 bytes of `content`, returned as a lowercase 64-char hex string.
 * No normalization (trim, CRLF/LF conversion, whitespace collapse,
 * BOM handling, string reconstruction) is applied before hashing.
 *
 * @param {string} content
 * @returns {string} 64-char lowercase hex SHA-256
 */
export function computeContentHash(content) {
  if (typeof content !== 'string') {
    throw new Error('computeContentHash: content must be a string');
  }
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Builds a Normalized Source object from a Collector output item,
 * following the Constitution v0.1.1 Section 8 minimum schema.
 * Performs no summarization, interpretation, emotion inference,
 * value judgment, fact completion, or time estimation.
 *
 * @param {{ filename: string, rawContent: string }} sourceItem
 * @returns {{
 *   schema_version: string,
 *   source_name: string,
 *   filename: string,
 *   content_hash: string,
 *   content: string,
 * }}
 */
export function normalizeSource(sourceItem) {
  if (
    sourceItem === null ||
    typeof sourceItem !== 'object' ||
    typeof sourceItem.filename !== 'string' ||
    typeof sourceItem.rawContent !== 'string'
  ) {
    throw new Error(
      'normalizeSource: sourceItem must be an object with string filename and rawContent'
    );
  }

  const content = sourceItem.rawContent;

  return {
    schema_version: SCHEMA_VERSION,
    source_name: LOCAL_FILE_SOURCE_NAME,
    filename: sourceItem.filename,
    content_hash: computeContentHash(content),
    content,
  };
}
