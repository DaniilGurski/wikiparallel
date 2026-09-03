/** @typedef {import("../src/search.js").Parallel} Parallel */

/**
 * Build a Parallel for tests, filling any field left unspecified.
 * @param {Partial<Parallel>} [p]
 * @returns {Parallel}
 */
export const makeParallel = (p = {}) => ({
  title: p.title ?? "Untitled",
  url: p.url ?? "https://en.wikipedia.org/wiki/Untitled",
  field: p.field ?? "Science",
  leadSection: p.leadSection ?? "Lead.",
  closeness: p.closeness ?? 50,
});
