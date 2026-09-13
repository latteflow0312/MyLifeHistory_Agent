import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { loadPrompt } from '../prompt/promptLoader.js';
import { buildPromptPackage } from '../promptPackage/promptPackageBuilder.js';
import { summarize } from '../summarizer/summarizer.js';
import { validateAiOutput } from '../validator/aiOutputValidator.js';
import { writeProductionDailyArtifact } from '../artifactWriter/productionDailyWriter.js';

const TARGET_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Production Daily Finalization Orchestrator.
 *
 * This is the only module that knows the full success/failure order:
 *
 *   Daily Package -> Summarizer -> AI Adapter -> AI Output Validator
 *     -> Production Daily Writer -> markProcessedBatch -> complete
 *
 * State Commit only ever happens after a successful Artifact write.
 * No individual markProcessed calls are made here - only a single
 * markProcessedBatch covering every Source in the Daily Package.
 *
 * Never calls a real AI Provider, never touches Google Drive, and
 * never hardcodes a Production path - `outputDirectory`, `promptFilePath`
 * and `state` are all supplied by the caller.
 *
 * @param {{
 *   dailyPackage: { date: string, sources: object[] },
 *   promptFilePath: string,
 *   aiAdapter: { execute: (promptPackage: object) => Promise<unknown> },
 *   state: { markProcessedBatch: (records: object[]) => void },
 *   outputDirectory: string,
 * }} options
 * @returns {Promise<
 *   | { status: 'skipped_empty_input', artifactPath: null, sourceCount: 0 }
 *   | { status: 'human_review_required', artifactPath: string, sourceCount: number }
 *   | { status: 'recovery_required', artifactPath: string, sourceCount: number }
 *   | { status: 'complete', artifactPath: string, sourceCount: number }
 * >}
 */
export async function runProductionPipeline(options) {
  if (options === null || typeof options !== 'object') {
    throw new Error('runProductionPipeline: options must be an object');
  }

  const { dailyPackage, promptFilePath, aiAdapter, state, outputDirectory } = options;

  if (dailyPackage === null || typeof dailyPackage !== 'object') {
    throw new Error('runProductionPipeline: dailyPackage must be an object');
  }

  const { date, sources } = dailyPackage;

  if (typeof date !== 'string' || !TARGET_DATE_PATTERN.test(date)) {
    throw new Error('runProductionPipeline: dailyPackage.date must be a "YYYY-MM-DD" string');
  }
  if (!Array.isArray(sources)) {
    throw new Error('runProductionPipeline: dailyPackage.sources must be an array');
  }
  if (typeof outputDirectory !== 'string' || outputDirectory.length === 0) {
    throw new Error('runProductionPipeline: outputDirectory must be a non-empty string');
  }

  // Empty Source -> skip before any AI call, Writer call, or State change.
  if (sources.length === 0) {
    return { status: 'skipped_empty_input', artifactPath: null, sourceCount: 0 };
  }

  // Existing Production Artifact -> Fail-Stop before any AI call.
  const expectedArtifactPath = join(outputDirectory, `${date}.md`);
  if (existsSync(expectedArtifactPath)) {
    return {
      status: 'human_review_required',
      artifactPath: expectedArtifactPath,
      sourceCount: sources.length,
    };
  }

  const instructions = loadPrompt(promptFilePath);
  const promptPackage = buildPromptPackage(dailyPackage, instructions);

  const rawOutput = await summarize(promptPackage, aiAdapter);

  const knownSources = sources.map((source) => ({
    content_hash: source.content_hash,
    filename: source.filename,
  }));
  const validation = validateAiOutput(rawOutput, { targetDate: date, knownContentHashes: knownSources });
  if (!validation.valid) {
    throw new Error(
      `runProductionPipeline: AI output failed validation: ${validation.errors.join('; ')}`
    );
  }

  const artifactPath = writeProductionDailyArtifact(rawOutput, date, outputDirectory);

  const records = sources.map((source) => {
    const record = { content_hash: source.content_hash };
    if (typeof source.filename === 'string') {
      record.filename = source.filename;
    }
    if (typeof source.source_name === 'string') {
      record.source_name = source.source_name;
    }
    return record;
  });

  try {
    state.markProcessedBatch(records);
  } catch {
    // Artifact is already safely written - keep it, do not delete/retry,
    // and surface the inconsistency for a human to resolve.
    return { status: 'recovery_required', artifactPath, sourceCount: sources.length };
  }

  return { status: 'complete', artifactPath, sourceCount: sources.length };
}
