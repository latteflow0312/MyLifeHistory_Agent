/**
 * Real Collection Runtime (00_INBOX -> 01_RAW).
 *
 * Per README_FOR_FAMILY.md's own description of the real Google Drive
 * folders, 00_INBOX is where newly arrived, not-yet-organized material
 * temporarily gathers, and 01_RAW is the organized original material
 * that Daily processing is built on. Collection's job is exactly that
 * move: relocate each supported file (.md, .txt - the same extensions
 * the Collector already reads) from 00_INBOX into 01_RAW, unchanged.
 *
 * Reuses the existing Collector's file discovery (collectSources) so
 * the supported-extension list stays defined in exactly one place, and
 * reuses run-production-real.mjs's own RAW_DIR constant as the
 * destination so this never drifts from the real Finalize input path.
 *
 * A move is a plain rename within the same Google Drive root (no
 * content is read, rewritten, summarized or interpreted). If a file
 * with the same name already exists in 01_RAW, it is never
 * overwritten - the incoming file is left in 00_INBOX and reported so
 * a human can resolve the name collision.
 *
 * Never calls a Gemini/AI Adapter, never runs the Production/Finalize
 * Pipeline, never touches processing_state.json, and never retries on
 * failure - a single failed run just logs and exits non-zero.
 *
 * Manual or Task Scheduler execution only:
 *
 *   node scripts/run-collection.mjs
 */

import { existsSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { collectSources } from '../src/collector/collector.js';
import { RAW_DIR } from './run-production-real.mjs';

const GOOGLE_DRIVE_ROOT = 'G:\\내 드라이브\\MY_LIFE_HISTORY';
const INBOX_DIR = join(GOOGLE_DRIVE_ROOT, '00_INBOX');

/**
 * Moves every supported file currently in inboxDir into rawDir.
 * Skips (does not overwrite) any file whose name already exists in
 * rawDir.
 *
 * @param {{ inboxDir?: string, rawDir?: string }} [options]
 * @returns {{ moved: string[], skipped: string[] }}
 */
export function runCollection(options = {}) {
  const { inboxDir = INBOX_DIR, rawDir = RAW_DIR } = options;

  const incoming = collectSources(inboxDir);
  const moved = [];
  const skipped = [];

  for (const source of incoming) {
    const destPath = join(rawDir, source.filename);
    if (existsSync(destPath)) {
      skipped.push(source.filename);
      continue;
    }
    renameSync(join(inboxDir, source.filename), destPath);
    moved.push(source.filename);
  }

  return { moved, skipped };
}

function main() {
  const timestamp = new Date().toISOString();
  try {
    const { moved, skipped } = runCollection();
    console.log(`[${timestamp}] Collection: moved=${moved.length} skipped=${skipped.length}`);
    for (const filename of moved) {
      console.log(`  moved: ${filename}`);
    }
    for (const filename of skipped) {
      console.log(`  skipped (already exists in 01_RAW, needs human review): ${filename}`);
    }
  } catch (err) {
    console.log(`[${timestamp}] Collection FAILED: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
