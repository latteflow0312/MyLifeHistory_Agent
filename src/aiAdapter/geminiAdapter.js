import { GoogleGenAI } from '@google/genai';
import { loadAiCredential } from '../credential/credentialLoader.js';
import { AiAdapterTimeoutError, DEFAULT_TIMEOUT_MS } from './withTimeout.js';

const CREDENTIAL_ENV_VAR = 'MYLIFEHISTORY_GEMINI_API_KEY';

// gemini-3.5-flash-lite: the lightest, most cost-efficient, Free Tier
// text-generation model currently listed as stable on the official
// Gemini API pricing page (ai.google.dev/gemini-api/docs/pricing,
// checked 2026-09-13). Connection/Contract verification does not need
// a higher-capability model. The SDK's own bundled doc examples still
// reference `gemini-2.0-flash`, but that model (and Flash-Lite 2.0)
// were shut down on 2026-06-01, so that example was not used here.
const DEFAULT_MODEL = 'gemini-3.5-flash-lite';

/**
 * Renders a Prompt Package's date and sources into a deterministic,
 * human-readable text block for the Gemini `contents` field. Preserves
 * Source order exactly and never omits or summarizes filename /
 * content_hash / content - this is pure formatting, not Business
 * Logic. Identical in shape to the OpenAI Adapter's mapping so both
 * Providers receive equivalent input.
 *
 * @param {{ date: string, sources: Array<{ filename: string, content_hash: string, content: string }> }} promptPackage
 * @returns {string}
 */
function buildInputText(promptPackage) {
  const sourceBlocks = promptPackage.sources.map(
    (source, index) =>
      `[Source ${index + 1}]\n` +
      `Filename: ${source.filename}\n` +
      `Content Hash: ${source.content_hash}\n` +
      `Content:\n${source.content}`
  );

  return `Target Date: ${promptPackage.date}\n\nSources:\n\n${sourceBlocks.join('\n\n')}`;
}

/**
 * Extracts the final text from a Gemini generateContent response,
 * without leaking the Provider-specific response envelope beyond this
 * module. Does not reject an empty string - that remains
 * aiOutputValidator's responsibility, not the Adapter's.
 *
 * @param {unknown} response
 * @returns {string}
 */
function extractOutputText(response) {
  if (response === null || typeof response !== 'object') {
    throw new Error('createGeminiAdapter: Gemini response was empty or missing');
  }
  const text = response.text;
  if (typeof text !== 'string') {
    throw new Error('createGeminiAdapter: Gemini response did not include a string text field');
  }
  return text;
}

/**
 * Builds a real Gemini client using a credential obtained only via
 * loadAiCredential({ envVarName: 'MYLIFEHISTORY_GEMINI_API_KEY' })
 * (per Constitution v0.2.1 Section 36) - never reads process.env
 * directly here.
 *
 * @returns {GoogleGenAI}
 */
function createRealClient() {
  const apiKey = loadAiCredential({ envVarName: CREDENTIAL_ENV_VAR });
  return new GoogleGenAI({ apiKey });
}

/**
 * Creates a Real AI Adapter backed by the Gemini API (`@google/genai`,
 * `models.generateContent`). Satisfies the existing, unmodified AI
 * Adapter Contract:
 *
 *   execute(promptPackage) => Promise<string>
 *
 * Credential flow: Environment(MYLIFEHISTORY_GEMINI_API_KEY) ->
 * loadAiCredential() -> Gemini Client. If `options.client` is not
 * supplied, the credential is loaded (and, if missing, this throws
 * immediately - before any network call) to construct a real client.
 * Supplying `options.client` (a Fake/Stub) bypasses credential loading
 * entirely, which is how tests avoid ever needing a real key.
 *
 * Timeout & cancellation: this Adapter drives its own AbortController
 * (default 60000ms, DEFAULT_TIMEOUT_MS reused unmodified from
 * withTimeout.js) and passes its signal as `config.abortSignal`, which
 * the installed @google/genai SDK merges into its own per-attempt
 * AbortController (see node_modules/@google/genai/dist/node/index.mjs
 * - `createAttemptSignal`), so aborting here does tear down the
 * client-side HTTP request rather than leaving it running in the
 * background. The SDK's own doc comment on `abortSignal` and
 * `httpOptions` warns this is "client-only" and will not stop
 * in-progress work or billing on Google's servers - that limitation is
 * the SDK's, not something this Adapter can close, and is reported as
 * a known Gap rather than silently assumed away. `config.httpOptions`
 * is also set (`timeout`, `retryOptions.attempts: 1`) as defense in
 * depth and to disable the SDK's own automatic retry. Any rejection
 * that occurs once our timer has fired is normalized to the
 * project-wide AiAdapterTimeoutError so callers identify a timeout the
 * same way regardless of Provider. There is no retry on timeout or on
 * any other failure.
 *
 * @param {{
 *   client?: { models: { generateContent: (request: object) => Promise<unknown> } },
 *   model?: string,
 *   timeoutMs?: number,
 * }} [options]
 * @returns {{ execute: (promptPackage: object) => Promise<string> }}
 */
export function createGeminiAdapter(options = {}) {
  const model = typeof options.model === 'string' ? options.model : DEFAULT_MODEL;
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const client = options.client ?? createRealClient();

  return {
    async execute(promptPackage) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await client.models.generateContent({
          model,
          contents: buildInputText(promptPackage),
          config: {
            systemInstruction: promptPackage.instructions,
            abortSignal: controller.signal,
            httpOptions: {
              timeout: timeoutMs,
              retryOptions: { attempts: 1 },
            },
          },
        });

        return extractOutputText(response);
      } catch (err) {
        if (controller.signal.aborted) {
          throw new AiAdapterTimeoutError(timeoutMs);
        }
        throw err;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export { DEFAULT_MODEL, CREDENTIAL_ENV_VAR };
