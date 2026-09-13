import { collectSources } from '../collector/collector.js';
import { normalizeSource } from '../normalizer/normalizer.js';
import { buildDailyPackage } from '../dailyPackageBuilder/dailyPackageBuilder.js';
import { buildPromptPackage } from '../promptPackage/promptPackageBuilder.js';
import { writeDevelopmentArtifact } from '../artifactWriter/developmentArtifactWriter.js';
import { loadPrompt } from '../prompt/promptLoader.js';
import { createLogger } from '../logger/logger.js';

/**
 * Wires the Phase 1-4 modules into a single Development Pipeline:
 *
 *   Collector -> Normalizer -> Daily Package Builder
 *     -> Prompt Package Builder -> Development Artifact Writer
 *
 * This function:
 *   - never calls markProcessed (Source is not confirmed "processed"
 *     just because a Development Prompt Package was written)
 *   - never invokes an AI Adapter or performs any network call
 *   - never touches Google Drive or any Production path (all paths
 *     are supplied by the caller)
 *   - never writes an artifact for empty input (no new/unprocessed
 *     source -> pipeline stops before Prompt Package Builder)
 *
 * `state` must already be an opened Processing State handle (see
 * processingState.js openProcessingState) - only `state.isProcessed`
 * is ever called here.
 *
 * @param {{
 *   sourceDir: string,
 *   promptFilePath: string,
 *   state: { isProcessed: (contentHash: string) => boolean },
 *   targetDate: string,
 *   outputDirectory: string,
 *   logger?: ReturnType<typeof createLogger>,
 * }} options
 * @returns {
 *   | { status: 'skipped_empty_input', date: string }
 *   | { status: 'written', date: string, artifactPath: string, sourceCount: number }
 * }
 */
export function runDevelopmentPipeline(options) {
  if (options === null || typeof options !== 'object') {
    throw new Error('runDevelopmentPipeline: options must be an object');
  }

  const { sourceDir, promptFilePath, state, targetDate, outputDirectory } = options;
  const logger = options.logger ?? createLogger();

  try {
    const rawSources = collectSources(sourceDir);
    const normalizedSources = rawSources.map((source) => normalizeSource(source));

    const dailyPackage = buildDailyPackage(normalizedSources, state, targetDate);

    if (dailyPackage.sources.length === 0) {
      logger.emptyInput(`no new/unprocessed source for ${dailyPackage.date}`);
      return { status: 'skipped_empty_input', date: dailyPackage.date };
    }

    const instructions = loadPrompt(promptFilePath);
    const promptPackage = buildPromptPackage(dailyPackage, instructions);
    const artifactPath = writeDevelopmentArtifact(promptPackage, outputDirectory);

    logger.success(`development prompt package written: ${artifactPath}`);

    return {
      status: 'written',
      date: promptPackage.date,
      artifactPath,
      sourceCount: promptPackage.sources.length,
    };
  } catch (err) {
    logger.error(err.message);
    throw err;
  }
}
