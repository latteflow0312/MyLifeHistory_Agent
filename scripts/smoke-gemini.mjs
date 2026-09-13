/**
 * Manual, Human-triggered Smoke Test for the Gemini Real Adapter.
 *
 * NOT part of `npm test`. NOT auto-run by anything. NOT wired into
 * src/integration/productionPipeline.js, the Summarizer, the
 * Validator, the Production Artifact Writer, or Processing State -
 * this script calls the Adapter directly and nothing else.
 *
 * Run manually, and only after explicit Human Approval, with:
 *
 *   node scripts/smoke-gemini.mjs
 *
 * Requires MYLIFEHISTORY_GEMINI_API_KEY to be set in the current shell
 * session (Constitution v0.2.1 Section 36). This script never prints
 * the credential value, its length, or any masked fragment of it -
 * only whether it is present.
 *
 * Uses the Gemini API Free Tier (gemini-3.5-flash-lite by default).
 * Makes at most ONE real request per run. Never retries automatically.
 * Uses only synthetic, non-personal input - no Production data.
 */

import { createGeminiAdapter, DEFAULT_MODEL } from '../src/aiAdapter/geminiAdapter.js';

const MODEL = DEFAULT_MODEL;
const TIMEOUT_MS = 60_000;
const CREDENTIAL_ENV_VAR = 'MYLIFEHISTORY_GEMINI_API_KEY';

const SYNTHETIC_PROMPT_PACKAGE = {
  date: '2026-09-13',
  instructions: 'Return a short response using only the supplied source.',
  sources: [
    {
      schema_version: '0.1',
      source_name: 'local_file',
      filename: 'gemini-smoke-test.txt',
      content_hash: 'synthetic-gemini-smoke-test',
      content: 'Phase 9 Gemini adapter smoke test.',
    },
  ],
};

function log(line) {
  console.log(line);
}

function fail(message) {
  log(`FAIL: ${message}`);
  process.exitCode = 1;
}

async function main() {
  log('=== Gemini Real Adapter Smoke Test (Free Tier) ===');
  log('Smoke test 시작');

  const rawCredential = process.env[CREDENTIAL_ENV_VAR];
  const credentialPresent = typeof rawCredential === 'string' && rawCredential.trim().length > 0;

  // Dry Check - Credential 값/길이/마스킹 조각은 절대 출력하지 않는다.
  log(`Credential present: ${credentialPresent ? 'YES' : 'NO'}`);
  log(`Model: ${MODEL}`);
  log(`Timeout: ${TIMEOUT_MS}`);
  log('Retry: 0 (attempts: 1, no automatic retry)');
  log('Production Pipeline: NO');
  log('Artifact Writer: NO');
  log('Processing State: NO');

  if (!credentialPresent) {
    fail(`${CREDENTIAL_ENV_VAR} 환경변수가 설정되어 있지 않습니다. 실제 API 호출을 수행하지 않습니다.`);
    return;
  }

  let adapter;
  try {
    adapter = createGeminiAdapter({ model: MODEL, timeoutMs: TIMEOUT_MS });
  } catch (err) {
    fail(`Adapter 생성 실패 (Credential 값은 노출하지 않음): ${err.message}`);
    return;
  }

  log('Dry Check 통과. 실제 API 호출을 딱 1회 수행합니다.');

  let callCount = 0;
  let result;
  try {
    callCount += 1;
    result = await adapter.execute(SYNTHETIC_PROMPT_PACKAGE);
  } catch (err) {
    log(`API Call Count: ${callCount}`);
    fail(`API 호출 실패: ${err.message}`);
    log('실패했더라도 자동으로 재호출하지 않습니다. 두 번째 호출은 새로운 Human Approval이 필요합니다.');
    return;
  }

  log(`API Call Count: ${callCount}`);
  log(`Result type: ${typeof result}`);
  log(`Result length: ${typeof result === 'string' ? result.length : 'N/A'}`);

  const isNonEmptyString = typeof result === 'string' && result.length > 0;
  if (isNonEmptyString) {
    log('PASS');
  } else {
    fail('반환값이 비어있거나 string이 아닙니다.');
  }
}

main().catch((err) => {
  fail(`예상치 못한 오류: ${err.message}`);
});
