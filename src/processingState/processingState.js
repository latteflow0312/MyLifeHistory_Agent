import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const STATE_SCHEMA_VERSION = '0.1';
const CONTENT_HASH_PATTERN = /^[0-9a-f]{64}$/;

function validateContentHash(contentHash) {
  if (typeof contentHash !== 'string' || !CONTENT_HASH_PATTERN.test(contentHash)) {
    throw new Error(
      'processingState: content_hash must be a 64-char lowercase hexadecimal string'
    );
  }
}

function validateStateShape(parsed, stateFilePath) {
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`processingState: state file at "${stateFilePath}" must contain a JSON object`);
  }
  if (parsed.schema_version !== STATE_SCHEMA_VERSION) {
    throw new Error(
      `processingState: state file at "${stateFilePath}" has unsupported schema_version "${parsed.schema_version}"`
    );
  }
  if (parsed.processed === null || typeof parsed.processed !== 'object' || Array.isArray(parsed.processed)) {
    throw new Error(
      `processingState: state file at "${stateFilePath}" is missing a valid "processed" object`
    );
  }
  for (const [hash, record] of Object.entries(parsed.processed)) {
    if (!CONTENT_HASH_PATTERN.test(hash)) {
      throw new Error(
        `processingState: state file at "${stateFilePath}" contains an invalid content_hash key "${hash}"`
      );
    }
    if (record === null || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error(
        `processingState: state file at "${stateFilePath}" has an invalid record for "${hash}"`
      );
    }
  }
}

function atomicWrite(stateFilePath, data) {
  const dir = dirname(stateFilePath);
  const tempPath = join(dir, `${basenameOf(stateFilePath)}.tmp`);
  const text = JSON.stringify(data, null, 2);

  writeFileSync(tempPath, text, 'utf8');
  try {
    renameSync(tempPath, stateFilePath);
  } catch (err) {
    try {
      unlinkSync(tempPath);
    } catch {
      // best-effort cleanup only; the rename error is the one that matters
    }
    throw err;
  }
}

function basenameOf(filePath) {
  const parts = filePath.split(/[\\/]/);
  return parts[parts.length - 1];
}

/**
 * Explicitly creates a brand-new Processing State file.
 * Refuses to run if a state file already exists at stateFilePath -
 * a new AI agent must never assume "no file yet" and silently
 * overwrite an existing state.
 *
 * @param {string} stateFilePath
 */
export function initializeProcessingState(stateFilePath) {
  if (typeof stateFilePath !== 'string' || stateFilePath.length === 0) {
    throw new Error('initializeProcessingState: stateFilePath must be a non-empty string');
  }

  if (existsSync(stateFilePath)) {
    throw new Error(
      `initializeProcessingState: a state file already exists at "${stateFilePath}"; refusing to overwrite`
    );
  }

  atomicWrite(stateFilePath, { schema_version: STATE_SCHEMA_VERSION, processed: {} });
}

/**
 * Opens an existing Processing State file and returns a handle with
 * isProcessed/markProcessed. Never auto-initializes: a missing file,
 * corrupted JSON, or invalid structure is always an Error.
 *
 * @param {string} stateFilePath
 */
export function openProcessingState(stateFilePath) {
  if (typeof stateFilePath !== 'string' || stateFilePath.length === 0) {
    throw new Error('openProcessingState: stateFilePath must be a non-empty string');
  }

  let rawText;
  try {
    rawText = readFileSync(stateFilePath, 'utf8');
  } catch (err) {
    throw new Error(
      `openProcessingState: unable to read state file at "${stateFilePath}": ${err.message}`
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new Error(
      `openProcessingState: state file at "${stateFilePath}" is not valid JSON: ${err.message}`
    );
  }

  validateStateShape(parsed, stateFilePath);

  const processed = parsed.processed;

  return {
    /**
     * @param {string} contentHash
     * @returns {boolean}
     */
    isProcessed(contentHash) {
      validateContentHash(contentHash);
      return Object.prototype.hasOwnProperty.call(processed, contentHash);
    },

    /**
     * Records a Source as processed, keyed only by content_hash.
     * filename/source_name are accepted only as optional reference
     * metadata and are never used for duplicate detection.
     * Calling this repeatedly with the same content_hash does not
     * grow the state - the record is simply kept/replaced in place.
     *
     * @param {{ content_hash: string, filename?: string, source_name?: string }} record
     */
    markProcessed(record) {
      if (record === null || typeof record !== 'object') {
        throw new Error('markProcessed: record must be an object');
      }
      validateContentHash(record.content_hash);

      const entry = {};
      if (typeof record.filename === 'string') {
        entry.filename = record.filename;
      }
      if (typeof record.source_name === 'string') {
        entry.source_name = record.source_name;
      }

      processed[record.content_hash] = entry;
      atomicWrite(stateFilePath, { schema_version: STATE_SCHEMA_VERSION, processed });
    },

    /**
     * Records multiple Sources as processed in a single Atomic Batch
     * Commit. All records are validated before anything is written -
     * if any record is invalid, no write is attempted and neither the
     * state file nor the in-memory state is changed (no partial
     * commit). The new "processed" map is built in memory first, then
     * written via the same atomic (temp file + rename) mechanism as
     * markProcessed; the in-memory state is only updated after that
     * write succeeds.
     *
     * @param {Array<{ content_hash: string, filename?: string, source_name?: string }>} records
     */
    markProcessedBatch(records) {
      if (!Array.isArray(records)) {
        throw new Error('markProcessedBatch: records must be an array');
      }

      for (const record of records) {
        if (record === null || typeof record !== 'object') {
          throw new Error('markProcessedBatch: each record must be an object');
        }
        validateContentHash(record.content_hash);
      }

      const nextProcessed = { ...processed };
      for (const record of records) {
        const entry = {};
        if (typeof record.filename === 'string') {
          entry.filename = record.filename;
        }
        if (typeof record.source_name === 'string') {
          entry.source_name = record.source_name;
        }
        nextProcessed[record.content_hash] = entry;
      }

      atomicWrite(stateFilePath, { schema_version: STATE_SCHEMA_VERSION, processed: nextProcessed });

      for (const [hash, entry] of Object.entries(nextProcessed)) {
        processed[hash] = entry;
      }
    },
  };
}
