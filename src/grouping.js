import { FIELDS } from "./fields.js";

/** @typedef {import("./search.js").Parallel} Parallel */

/** How many Parallels a search shows at once, and how many "Show 6 more" adds. */
export const PAGE_SIZE = 6;

const fieldOrder = new Map(FIELDS.map((field, i) => [field, i]));

/**
 * A copy of `parallels` ordered by Closeness, highest first. Ties break by
 * title so the order is stable across runs.
 * @param {Parallel[]} parallels
 * @returns {Parallel[]}
 */
export function sortByCloseness(parallels) {
  return [...parallels].sort(
    (a, b) => b.closeness - a.closeness || a.title.localeCompare(b.title),
  );
}

/**
 * @typedef {object} FieldGroup
 * @property {string} field
 * @property {Parallel[]} parallels  Ordered by Closeness, highest first.
 */

/**
 * Bucket Parallels by Field for display. Each group's Parallels are ordered by
 * Closeness, highest first; the groups themselves follow the canonical Field
 * order, so a group keeps its place on the page as "Show 6 more" adds Parallels.
 * @param {Parallel[]} parallels
 * @returns {FieldGroup[]}
 */
export function groupByField(parallels) {
  /** @type {Map<string, Parallel[]>} */
  const buckets = new Map();
  for (const p of parallels) {
    const bucket = buckets.get(p.field);
    if (bucket) bucket.push(p);
    else buckets.set(p.field, [p]);
  }

  return [...buckets.entries()]
    .map(([field, group]) => ({ field, parallels: sortByCloseness(group) }))
    .sort((a, b) => (fieldOrder.get(a.field) ?? 0) - (fieldOrder.get(b.field) ?? 0));
}
