import { assertValidAiAdapter } from '../aiAdapter/aiAdapterContract.js';

/**
 * Runs an AI Adapter against a Prompt Package and returns its raw
 * text result.
 *
 * Summarizer knows nothing about Production Writer, outputDirectory,
 * Processing State, markProcessed/markProcessedBatch, Google Drive, or
 * any Production Artifact path - it only turns a Prompt Package into
 * raw AI output via the injected adapter. A successful AI call is not
 * treated as "processed"; that decision belongs to later stages.
 *
 * @param {{ date: string, instructions: string, sources: object[] }} promptPackage
 * @param {{ execute: (promptPackage: object) => Promise<unknown> }} aiAdapter
 * @returns {Promise<string>} raw AI output text
 */
export async function summarize(promptPackage, aiAdapter) {
  if (promptPackage === null || typeof promptPackage !== 'object') {
    throw new Error('summarize: promptPackage must be an object');
  }

  assertValidAiAdapter(aiAdapter);

  const rawText = await aiAdapter.execute(promptPackage);

  if (typeof rawText !== 'string') {
    throw new Error('summarize: aiAdapter.execute must resolve to a string');
  }

  return rawText;
}
