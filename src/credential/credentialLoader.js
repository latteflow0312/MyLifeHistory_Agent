const DEFAULT_CREDENTIAL_ENV_VAR = 'MYLIFEHISTORY_AI_API_KEY';

/**
 * Reads the Production AI credential from an environment variable
 * only. Never reads config/settings.json, never hardcodes a value,
 * and never logs or otherwise echoes the credential itself.
 *
 * Constitution v0.2.1 Section 36: if the credential is missing or
 * empty, this fails explicitly and loudly before any real AI call is
 * attempted - it never falls back to a placeholder or a cached value.
 * The thrown error message names only the environment variable, never
 * its (absent) value.
 *
 * This is intentionally Provider-independent: the same generic
 * environment variable is used regardless of which AI Provider a
 * future Real Adapter wraps.
 *
 * @param {{ envVarName?: string }} [options] - envVarName override,
 *   for tests only; Production callers should omit it.
 * @returns {string} the credential value, exactly as read
 */
export function loadAiCredential(options = {}) {
  const envVarName =
    typeof options.envVarName === 'string' && options.envVarName.length > 0
      ? options.envVarName
      : DEFAULT_CREDENTIAL_ENV_VAR;

  const value = process.env[envVarName];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(
      `loadAiCredential: environment variable "${envVarName}" is not set. ` +
        'A Production AI credential must be provided via an environment variable before calling a real AI Adapter.'
    );
  }

  return value;
}

export { DEFAULT_CREDENTIAL_ENV_VAR };
