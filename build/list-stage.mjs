/**
 * The list stage of the build: fetch the Vital Articles list page and parse it
 * into a flat `{ field, title, url }` list. This is the input the Corpus stage
 * (issue #5) consumes.
 */

import { fetchVitalArticlesWikitext } from "./wiki.mjs";
import { parseVitalArticles } from "./parse-vital-articles.mjs";

/** @typedef {import("./parse-vital-articles.mjs").VitalArticle} VitalArticle */

/** The Vital Articles level the build targets unless told otherwise. */
export const DEFAULT_LEVEL = 3;

/**
 * Fetch and parse the Vital Articles list.
 *
 * @param {object} [options]
 * @param {number} [options.level]     Vital Articles level; defaults to 3.
 * @param {string} [options.cacheDir]  API cache directory.
 * @param {import("./cache.mjs").JsonFetch} [options.fetchImpl]
 * @returns {Promise<VitalArticle[]>}
 */
export async function runListStage(options = {}) {
  const { level = DEFAULT_LEVEL, ...fetchOptions } = options;
  const wikitext = await fetchVitalArticlesWikitext(level, fetchOptions);
  const articles = parseVitalArticles(wikitext, { level });
  if (articles.length === 0) {
    throw new Error(`parsed no articles from the Vital Articles level ${level} page`);
  }
  return articles;
}
