/**
 * MediaWiki API calls the build script makes against English Wikipedia, each
 * routed through the on-disk cache in {@link module:build/cache}.
 */

import { fetchJsonCached } from "./cache.mjs";

const API_ENDPOINT = "https://en.wikipedia.org/w/api.php";

/**
 * The API URL that returns the wikitext of the Vital Articles list for a level.
 * `redirects=1` follows the `Level/N` → `Level N` redirect the pages use.
 *
 * @param {number} level
 * @returns {string}
 */
export function vitalArticlesUrl(level) {
  const params = new URLSearchParams({
    action: "parse",
    page: `Wikipedia:Vital articles/Level ${level}`,
    prop: "wikitext",
    formatversion: "2",
    redirects: "1",
    format: "json",
  });
  return `${API_ENDPOINT}?${params}`;
}

/**
 * Fetch the raw wikitext of the Vital Articles list page for `level`.
 *
 * @param {number} level
 * @param {{ cacheDir?: string, fetchImpl?: import("./cache.mjs").JsonFetch }} [options]
 * @returns {Promise<string>}
 */
export async function fetchVitalArticlesWikitext(level, options = {}) {
  /** @type {{ parse?: { wikitext?: string } }} */
  const body = await fetchJsonCached(vitalArticlesUrl(level), options);
  const wikitext = body.parse?.wikitext;
  if (typeof wikitext !== "string" || wikitext.trim() === "") {
    throw new Error(`no wikitext in the API response for Vital Articles level ${level}`);
  }
  return wikitext;
}
