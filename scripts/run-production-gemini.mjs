/**
 * Gemini Production Entry.
 *
 * This is the only place (besides src/aiAdapter/geminiAdapter.js) where
 * "Gemini" is allowed to appear. It wires a Gemini Adapter into the
 * existing, unmodified Production Pipeline
 * (src/integration/productionPipeline.js) - the Pipeline itself is not
 * aware of Gemini, OpenAI, or any other Provider.
 *
 * Two ways to use this file:
 *
 *   1. As a module - import { runGeminiProductionEntry } and call it
 *      with an injected `aiAdapter` (a Fake/Stub). This is how tests
 *      verify the full wiring with zero network access and zero
 *      credential requirement.
 *
 *   2. As a manually-run script - `node scripts/run-production-gemini.mjs`.
 *      This is NOT wired into `npm test`, not auto-run by anything,
 *      and must only be started by a human. When run this way, no
 *      `aiAdapter` is supplied, so a real Gemini Adapter is
 *      constructed via createGeminiAdapter() -> loadAiCredential()
 *      (Constitution v0.2.1 Section 36). If the credential is
 *      missing, this fails before any network call - it never
 *      silently falls back.
 *
 * There is no Provider Router, no fallback, and no automatic
 * detection here: which Provider gets used is entirely determined by
 * which entry script a human chooses to run. Adding a second Provider
 * means adding a second, equally small entry file - not branching
 * logic inside this one.
 */

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProductionPipeline } from '../src/integration/productionPipeline.js';
import { createGeminiAdapter } from '../src/aiAdapter/geminiAdapter.js';
import { collectSources } from '../src/collector/collector.js';
import { normalizeSource } from '../src/normalizer/normalizer.js';
import { buildDailyPackage } from '../src/dailyPackageBuilder/dailyPackageBuilder.js';
import { initializeProcessingState, openProcessingState } from '../src/processingState/processingState.js';

/**
 * Wires a Gemini (or, for tests, a Fake) AI Adapter into
 * runProductionPipeline() and prints a minimal, secret-free progress
 * report. Never logs a credential value, full Prompt/Source content,
 * or a full AI response - only counts, dates, paths, and the final
 * status string.
 *
 * @param {{
 *   dailyPackage: { date: string, sources: object[] },
 *   promptFilePath: string,
 *   state: { markProcessedBatch: (records: object[]) => void },
 *   outputDirectory: string,
 *   aiAdapter?: { execute: (promptPackage: object) => Promise<unknown> },
 *   model?: string,
 *   timeoutMs?: number,
 *   log?: (line: string) => void,
 * }} options
 * @returns {Promise<ReturnType<typeof runProductionPipeline>>}
 */
export async function runGeminiProductionEntry(options = {}) {
  const { dailyPackage, promptFilePath, state, outputDirectory, model, timeoutMs } = options;
  const log = typeof options.log === 'function' ? options.log : (line) => console.log(line);

  log('Provider: Gemini');

  let aiAdapter = options.aiAdapter;
  if (aiAdapter) {
    log('Credential present: N/A (injected adapter)');
  } else {
    try {
      aiAdapter = createGeminiAdapter({ model, timeoutMs });
      log('Credential present: YES');
    } catch (err) {
      log('Credential present: NO');
      throw err;
    }
  }

  log(`Input date: ${dailyPackage?.date}`);
  log(`Source count: ${Array.isArray(dailyPackage?.sources) ? dailyPackage.sources.length : 0}`);
  log(`Output directory: ${outputDirectory}`);

  const result = await runProductionPipeline({
    dailyPackage,
    promptFilePath,
    aiAdapter,
    state,
    outputDirectory,
  });

  log(`Pipeline status: ${result.status}`);

  return result;
}

// ---------------------------------------------------------------------
// Manual CLI execution only (never runs when this file is imported by
// tests). Builds a fully synthetic Daily Package - via the real
// Collector/Normalizer/Daily Package Builder, so content_hash values
// are genuine SHA-256, not placeholder strings - in OS temp
// directories. Does not touch any real Google Drive path and does not
// decide where Production Processing State should permanently live
// (still an open Human Decision, per Phase 10 Task 1).
// ---------------------------------------------------------------------

export function buildSyntheticWorkspace() {
  const root = mktempRoot();
  const sourceDir = join(root, 'sources');
  const outputDirectory = join(root, 'production-output');
  const promptFilePath = fileURLToPath(new URL('../prompts/daily_summary.md', import.meta.url));
  const stateFilePath = join(root, 'state.json');

  mkdirSync(sourceDir);
  mkdirSync(outputDirectory);
  writeFileSync(
    join(sourceDir, 'gemini-entry-smoke.txt'),
    'Phase 10 Gemini production entry synthetic smoke test.\n',
    'utf8'
  );
  initializeProcessingState(stateFilePath);

  return { root, sourceDir, outputDirectory, promptFilePath, stateFilePath };
}

function mktempRoot() {
  return mkdtempSync(join(tmpdir(), 'mlh-gemini-production-entry-'));
}

// Provider messages may contain request bodies or secrets. Emit only known
// diagnostic values; unknown text is withheld rather than partially redacted.
export function formatSafeError(err) {
  const names = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'AbortError', 'TimeoutError', 'AiAdapterTimeoutError', 'ApiError', 'AggregateError', 'ConnectTimeoutError', 'HeadersTimeoutError', 'BodyTimeoutError', 'SocketError', 'RequestAbortedError', 'UndiciError']);
  const safeCode = (value) => typeof value === 'string' && value.length <= 64 &&
    /^[A-Z][A-Z0-9_]*$/.test(value) && !/[\r\n]/.test(value) &&
    !/KEY|TOKEN|SECRET|AUTHORIZATION|PASSWORD|BEARER/.test(value)
    ? value : '[withheld]';
  const messages = new Set(['fetch failed', 'socket hang up', 'connect ECONNREFUSED', 'read ECONNRESET', 'certificate has expired', 'self-signed certificate', 'self-signed certificate in certificate chain', 'unable to verify the first certificate', 'unable to get local issuer certificate', 'The operation was aborted', 'This operation was aborted', 'The operation was aborted due to timeout', 'other side closed', 'Connect Timeout Error', 'Headers Timeout Error', 'Body Timeout Error']);
  const safeMessage = (value) => typeof value === 'string' &&
    (messages.has(value) || /^AI Adapter call timed out after [0-9]{1,9}ms$/.test(value))
    ? value : '[withheld]';
  // Extract only a fixed technical phrase, never arbitrary argument values.
  const safeInvalidArgumentMessage = (value) => {
    if (typeof value !== 'string') return '[withheld]';
    const match = /^(invalid (?:headersTimeout|bodyTimeout|signal|dispatcher|headers|header key|request path|request method|connection header|content-length header|transfer-encoding header|keep-alive header|upgrade header|x-goog-api-key header|x-server-timeout header|onError method|onConnect method|onHeaders method|onData method|onComplete method|opts|callback|reset|throwOnError|expectContinue)|signal must be an AbortSignal|Argument agent must implement Agent|headers must be an object or an array|headers array must be even|headers must be in key-value pair format|body must be a string, a Buffer, a Readable stream, an iterable, or an async iterable|method must be a string|path must be a string|path must be an absolute URL or start with a slash|maxRedirections is not supported, use the redirect interceptor)(?=$|[\s:;,])/u.exec(value);
    return match ? match[1] + (match[1].length < value.length ? ' [redacted]' : '') : '[withheld]';
  };
  const lines = ['FAIL', `Error name: ${names.has(err?.name) ? err.name : '[withheld]'}`,
    `Error message: ${safeMessage(err?.message)}`];
  if (err?.code !== undefined) lines.push(`Error code: ${safeCode(err.code)}`);
  let cause = err?.cause;
  const seen = new Set([err]);
  for (let depth = 1; depth <= 2 && cause != null && !seen.has(cause); depth += 1) {
    seen.add(cause);
    const label = depth === 1 ? 'Cause' : 'Cause 2';
    if (cause.name !== undefined) lines.push(label + ' name: ' + (names.has(cause.name) ? cause.name : '[withheld]'));
    const constructorName = cause.constructor?.name;
    if (constructorName !== undefined) lines.push(label + ' constructor name: ' + (names.has(constructorName) ? constructorName : '[withheld]'));
    if (cause.code !== undefined) lines.push(label + ' code: ' + safeCode(cause.code));
    if (cause.message !== undefined && (depth === 1 || cause.code === 'UND_ERR_INVALID_ARG')) {
      lines.push(label + ' message: ' + (cause.code === 'UND_ERR_INVALID_ARG'
        ? safeInvalidArgumentMessage(cause.message) : safeMessage(cause.message)));
    }
    cause = cause.cause;
  }
  return lines.join('\n');
}

async function main() {
  const targetDate = new Date().toISOString().slice(0, 10);
  const ws = buildSyntheticWorkspace();

  try {
    const state = openProcessingState(ws.stateFilePath);
    const rawSources = collectSources(ws.sourceDir);
    const normalized = rawSources.map((source) => normalizeSource(source));
    const dailyPackage = buildDailyPackage(normalized, state, targetDate);

    await runGeminiProductionEntry({
      dailyPackage,
      promptFilePath: ws.promptFilePath,
      state,
      outputDirectory: ws.outputDirectory,
    });
  } catch (err) {
    console.log(formatSafeError(err));
    process.exitCode = 1;
  } finally {
    rmSync(ws.root, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
