/**
 * Collection Check (read-only).
 *
 * Reuses the existing Collector/Normalizer/Processing State to report
 * how many Sources currently sit in the real 01_RAW and how many of
 * those are still unprocessed - nothing more.
 *
 * Never calls a Gemini/AI Adapter, never runs the Production Pipeline,
 * never calls markProcessed/markProcessedBatch (Processing State is
 * opened read-only, via isProcessed only), and never retries on
 * failure - a single failed run just logs and exits non-zero.
 *
 * Manual or Task Scheduler execution only:
 *
 *   node scripts/run-collection-check.mjs
 */

import { collectSources } from '../src/collector/collector.js';
import { normalizeSource } from '../src/normalizer/normalizer.js';
import { openProcessingState } from '../src/processingState/processingState.js';
import { RAW_DIR, STATE_FILE_PATH } from './run-production-real.mjs';

function main() {
  const timestamp = new Date().toISOString();
  try {
    const state = openProcessingState(STATE_FILE_PATH);
    const rawSources = collectSources(RAW_DIR);
    const normalized = rawSources.map((source) => normalizeSource(source));
    const newCount = normalized.filter((source) => !state.isProcessed(source.content_hash)).length;

    console.log(`[${timestamp}] Collection check: total=${normalized.length} new=${newCount}`);
  } catch (err) {
    console.log(`[${timestamp}] Collection check FAILED: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
