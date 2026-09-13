/**
 * Minimal, Provider-independent AI Adapter contract for MyLifeHistory
 * Core v0.1.
 *
 * This module defines only the boundary an AI Adapter must satisfy:
 * it receives a Prompt Package and returns a result. It intentionally
 * contains no concrete provider wiring and no vendor- or
 * transport-specific configuration of any kind.
 */

/**
 * Throws unless `adapter` exposes an `execute(promptPackage)` function.
 * Used to validate that a future concrete Adapter satisfies the
 * minimum contract, without knowing anything about which Provider it
 * wraps.
 *
 * @param {{ execute: (promptPackage: object) => Promise<unknown> }} adapter
 * @returns {true}
 */
export function assertValidAiAdapter(adapter) {
  if (adapter === null || typeof adapter !== 'object') {
    throw new Error('assertValidAiAdapter: adapter must be an object');
  }
  if (typeof adapter.execute !== 'function') {
    throw new Error('assertValidAiAdapter: adapter must implement execute(promptPackage)');
  }
  return true;
}

/**
 * Abstract base for a future concrete AI Adapter. Core v0.1 does not
 * implement any Provider - calling execute() on this base class
 * always throws.
 */
export class AiAdapterContract {
  async execute(_promptPackage) {
    throw new Error(
      'AiAdapterContract.execute: not implemented - Phase 4 defines the contract only, no Provider is wired'
    );
  }
}
