import OpenAI from 'openai';
import { loadAiCredential } from '../credential/credentialLoader.js';
import { AiAdapterTimeoutError, DEFAULT_TIMEOUT_MS } from './withTimeout.js';

const DEFAULT_MODEL = 'gpt-5';

/**
 * Renders a Prompt Package's date and sources into a deterministic,
 * human-readable text block for the OpenAI Responses API `input`
 * field. Preserves Source order exactly and never omits or summarizes
 * filename / content_hash / content - this is pure formatting, not
 * Business Logic.
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
 * Extracts the final text from an OpenAI Responses API response,
 * without leaking the Provider-specific response envelope beyond this
 * module. Does not reject an empty string - that remains
 * aiOutputValidator's responsibility, not the Adapter's.
 *
 * @param {unknown} response
 * @returns {string}
 */
function extractOutputText(response) {
  if (response === null || typeof response !== 'object') {
    throw new Error('createOpenAiAdapter: OpenAI response was empty or missing');
  }
  if (typeof response.output_text !== 'string') {
    throw new Error('createOpenAiAdapter: OpenAI response did not include a string output_text');
  }
  return response.output_text;
}

/**
 * Builds a real OpenAI client using a credential obtained only via
 * loadAiCredential() (Environment Variable, per Constitution v0.2.1
 * Section 36) - never reads process.env directly here.
 *
 * maxRetries is pinned to 0: the OpenAI SDK defaults to retrying
 * failed requests twice (see node_modules/openai/client.js -
 * `this.maxRetries = options.maxRetries ?? 2`), which would silently
 * reintroduce Application-level Retry behavior this project
 * explicitly forbids (Task 2 Timeout Policy: no automatic Retry).
 *
 * @returns {OpenAI}
 */
function createRealClient() {
  const apiKey = loadAiCredential();
  return new OpenAI({ apiKey, maxRetries: 0 });
}

/**
 * Creates a Real AI Adapter backed by the OpenAI Responses API. This
 * satisfies the existing, unmodified AI Adapter Contract:
 *
 *   execute(promptPackage) => Promise<string>
 *
 * Credential flow: Environment -> loadAiCredential() -> OpenAI Client.
 * If `options.client` is not supplied, the credential is loaded (and,
 * if missing, this throws immediately - before any network call) to
 * construct a real OpenAI client. Supplying `options.client` (a
 * Fake/Stub) bypasses credential loading entirely, which is how tests
 * avoid ever needing a real key.
 *
 * Timeout & cancellation: unlike the generic withTimeout() wrapper
 * (which only stops the caller from waiting - it cannot cancel a
 * Promise it did not create), this Adapter drives its own
 * AbortController and passes `signal` straight into
 * `client.responses.create()`. The OpenAI SDK honors a caller-supplied
 * signal internally (see node_modules/openai/client.js -
 * parseResponseWithTimeout wires `props.options.signal` into its own
 * cancellation/timeout race), so aborting here actually tears down the
 * underlying HTTP request instead of leaving it running in the
 * background after we stop waiting on it. Any rejection that occurs
 * once our own timer has fired is normalized to the project-wide
 * AiAdapterTimeoutError (reused from withTimeout.js, unmodified) so
 * callers identify a timeout the same way regardless of Provider.
 * Default timeout is 60000ms (DEFAULT_TIMEOUT_MS, also reused
 * unmodified); there is no retry on timeout or on any other failure.
 *
 * @param {{
 *   client?: { responses: { create: (request: object, requestOptions?: object) => Promise<unknown> } },
 *   model?: string,
 *   timeoutMs?: number,
 * }} [options]
 * @returns {{ execute: (promptPackage: object) => Promise<string> }}
 */
export function createOpenAiAdapter(options = {}) {
  const model = typeof options.model === 'string' ? options.model : DEFAULT_MODEL;
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
  const client = options.client ?? createRealClient();

  return {
    async execute(promptPackage) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await client.responses.create(
          {
            model,
            instructions: promptPackage.instructions,
            input: buildInputText(promptPackage),
          },
          { signal: controller.signal, maxRetries: 0 }
        );

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

export { DEFAULT_MODEL };
