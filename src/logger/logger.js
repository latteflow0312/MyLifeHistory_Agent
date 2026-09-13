const LEVELS = ['success', 'skip', 'invalid_input', 'duplicate', 'empty_input', 'error'];

function toMethodName(level) {
  return level.replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function formatLine(level, message) {
  return `[${level.toUpperCase()}] ${message}`;
}

/**
 * Minimal, console-based logger.
 * Provides one method per Phase 1 state: success, skip, invalidInput,
 * duplicate, emptyInput, error. No files, no rotation, no external
 * logging package, no remote transport.
 *
 * @param {{ write?: (line: string) => void }} [options]
 */
export function createLogger(options = {}) {
  const write = typeof options.write === 'function' ? options.write : (line) => console.log(line);

  const logger = {};
  for (const level of LEVELS) {
    logger[toMethodName(level)] = (message) => {
      write(formatLine(level, String(message)));
    };
  }
  return logger;
}
