const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Dedicated error type for AI Adapter timeouts, so a caller can tell a
 * timeout apart from any other Provider/network error.
 *
 * The message never includes Prompt Package content or a Credential
 * value - only the configured timeout duration.
 */
export class AiAdapterTimeoutError extends Error {
  constructor(timeoutMs) {
    super(`AI Adapter call timed out after ${timeoutMs}ms`);
    this.name = 'AiAdapterTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Wraps an AI Adapter so that execute(promptPackage) rejects with an
 * AiAdapterTimeoutError if the wrapped adapter does not settle within
 * timeoutMs (default 60000ms, per Constitution v0.2.1 Section 36's
 * companion Timeout Policy). The existing
 * `execute(promptPackage) => Promise<string>` contract is preserved
 * exactly - this only adds a race against a timer.
 *
 * No retry is performed on timeout or on any other failure; the
 * rejection is simply passed through to the caller, unchanged from
 * how a plain AI Adapter failure already propagates.
 *
 * @param {{ execute: (promptPackage: object) => Promise<unknown> }} adapter
 * @param {{ timeoutMs?: number }} [options]
 * @returns {{ execute: (promptPackage: object) => Promise<unknown> }}
 */
export function withTimeout(adapter, options = {}) {
  if (adapter === null || typeof adapter !== 'object' || typeof adapter.execute !== 'function') {
    throw new Error('withTimeout: adapter must implement execute(promptPackage)');
  }

  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : DEFAULT_TIMEOUT_MS;

  return {
    async execute(promptPackage) {
      let timer;
      const timeoutPromise = new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new AiAdapterTimeoutError(timeoutMs)), timeoutMs);
      });

      try {
        return await Promise.race([adapter.execute(promptPackage), timeoutPromise]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

export { DEFAULT_TIMEOUT_MS };
