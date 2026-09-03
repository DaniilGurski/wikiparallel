/**
 * The eleven Fields: the top-level sections of Wikipedia's Vital Articles
 * Level 3 list, in their list order. Every Corpus article — and so every
 * Parallel — belongs to exactly one of these.
 *
 * In the finished tool these names are read from the live list at build time
 * (see docs/adr/0002). The stubbed UI hard-codes them so the shell can be
 * built and reviewed before the build script exists.
 *
 * @type {readonly string[]}
 */
export const FIELDS = Object.freeze([
  "People",
  "History",
  "Geography",
  "Arts",
  "Philosophy and religion",
  "Everyday life",
  "Society and social sciences",
  "Health and medicine",
  "Science",
  "Technology",
  "Mathematics",
]);

/** One of the eleven Field names. @typedef {(typeof FIELDS)[number]} Field */

const FIELD_SET = new Set(FIELDS);

/**
 * True when `value` is exactly one of the eleven Field names (case-sensitive).
 * @param {unknown} value
 * @returns {value is Field}
 */
export function isField(value) {
  return typeof value === "string" && FIELD_SET.has(value);
}

/**
 * A stable kebab-case token for a Field, used as a CSS class suffix so each
 * Field can carry its own tag colour.
 * @param {string} field
 * @returns {string}
 */
export function fieldSlug(field) {
  return field.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
