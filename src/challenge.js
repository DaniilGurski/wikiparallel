import { isField } from "./fields.js";

/**
 * The longest Challenge the tool accepts. Stray paste or a wall of text is
 * truncated to this before it is embedded, so odd input cannot break search.
 */
export const MAX_CHALLENGE_LENGTH = 300;

/** The fewest words a Challenge needs before a search can run. */
export const MIN_CHALLENGE_WORDS = 3;

/**
 * Trim surrounding whitespace and cap the Challenge at {@link MAX_CHALLENGE_LENGTH}.
 * Non-string input becomes the empty string.
 * @param {unknown} raw
 * @returns {string}
 */
export function normalizeChallenge(raw) {
  if (typeof raw !== "string") return "";
  return raw.trim().slice(0, MAX_CHALLENGE_LENGTH);
}

/**
 * Count whitespace-separated words in `text`.
 * @param {string} text
 * @returns {number}
 */
export function countWords(text) {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/**
 * Whether a search may run: the Challenge has at least
 * {@link MIN_CHALLENGE_WORDS} words and a real Home Field is chosen.
 * @param {{ challenge: string, homeField: string }} input
 * @returns {boolean}
 */
export function challengeReady({ challenge, homeField }) {
  return (
    countWords(normalizeChallenge(challenge)) >= MIN_CHALLENGE_WORDS && isField(homeField)
  );
}
