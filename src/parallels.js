import { sortByCloseness, groupByField } from "./grouping.js";

/** @typedef {import("./search.js").Parallel} Parallel */
/** @typedef {import("./grouping.js").FieldGroup} FieldGroup */

/**
 * Rank a full set of Parallels by Closeness, highest first. Called once per
 * search; "Show 6 more" then walks down this ordering without re-ranking.
 *
 * Ticket #3 built the real embedding-similarity ranker as the like-named
 * {@link import("./ranker.js").rankParallels}, which ranks the Corpus against
 * the Challenge Embedding. Ticket #6 wires that in and deletes this stub; until
 * then the stub just orders the fixture.
 *
 * @param {Parallel[]} parallels
 * @returns {Parallel[]}
 */
export function rankParallels(parallels) {
  return sortByCloseness(parallels);
}

/**
 * @typedef {object} PageView
 * @property {FieldGroup[]} groups  The visible Parallels, grouped by Field.
 * @property {boolean} hasMore      Whether "Show 6 more" should be offered.
 */

/**
 * The view for the first `visibleCount` Parallels of a ranked set.
 * @param {Parallel[]} ranked  Output of {@link rankParallels}.
 * @param {number} visibleCount
 * @returns {PageView}
 */
export function pageView(ranked, visibleCount) {
  const shown = ranked.slice(0, visibleCount);
  return { groups: groupByField(shown), hasMore: ranked.length > shown.length };
}
