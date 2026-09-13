/**
 * Test-only Fake AI Adapter and Markdown builder. Never imported by
 * Production src - lives entirely under tests/.
 */

/**
 * Builds a Daily Markdown output that satisfies aiOutputValidator's
 * structural checks, using the exact date/filename/content_hash of a
 * given Prompt Package (so Source Reference provenance matches by
 * construction).
 *
 * @param {{ date: string, sources: Array<{ filename: string, content_hash: string }> }} promptPackage
 * @returns {string}
 */
export function buildFakeDailyMarkdown(promptPackage) {
  const sourceLines = promptPackage.sources
    .map(
      (source, index) =>
        `SRC-${String(index + 1).padStart(3, '0')} | ${source.filename} | sha256:${source.content_hash}`
    )
    .join('\n');

  return [
    `# ${promptPackage.date}`,
    '',
    '- 오늘 있었던 신규 기록을 정리했다.',
    '',
    '## 오늘의 한 문장',
    '',
    '> 오늘 하루를 정리한 한 문장.',
    '',
    '## Tag',
    '',
    '- #DECISION_CONTEXT',
    '',
    '## Source',
    '',
    sourceLines,
    '',
  ].join('\n');
}

/**
 * Creates a Fake AI Adapter for tests. By default it returns a valid
 * Daily Markdown built from the Prompt Package it receives. Pass
 * `fail: true` to force a rejection, or `output` (string or a
 * function of the Prompt Package) to control the returned text.
 *
 * @param {{ fail?: boolean, failureMessage?: string, output?: string | ((promptPackage: object) => string) }} [options]
 */
export function createFakeAiAdapter(options = {}) {
  const { fail = false, failureMessage = 'fake AI adapter forced failure', output } = options;
  const calls = [];

  return {
    calls,
    async execute(promptPackage) {
      calls.push(promptPackage);

      if (fail) {
        throw new Error(failureMessage);
      }

      if (typeof output === 'function') {
        return output(promptPackage);
      }
      if (typeof output === 'string') {
        return output;
      }
      return buildFakeDailyMarkdown(promptPackage);
    },
  };
}
