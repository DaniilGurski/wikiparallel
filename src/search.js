import { FIXTURE_PARALLELS } from "./fixtures.js";

/** @typedef {import("./fixtures.js").Parallel} Parallel */

/**
 * Stubbed search. Returns a fixed fixture list of Parallels with the Home Field
 * removed, ignoring the Challenge text itself. This defines the Parallel shape
 * the rest of the app renders; ticket #6 swaps in the real embedding pipeline
 * behind the same signature.
 *
 * @param {string} _challengeText  The normalized Challenge (unused by the stub).
 * @param {string} homeField       The Field to exclude from the Parallels.
 * @returns {Parallel[]}
 */
export function search(_challengeText, homeField) {
  return FIXTURE_PARALLELS.filter((p) => p.field !== homeField).map((p) => ({ ...p }));
}
