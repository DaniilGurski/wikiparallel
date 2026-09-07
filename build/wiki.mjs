/**
 * MediaWiki API calls the build script makes against English Wikipedia, each
 * routed through the on-disk cache in {@link module:build/cache}.
 *
 * Live requests go through {@link politeFetch}: it sends the descriptive
 * User-Agent the Wikimedia API policy asks for and backs off on HTTP 429, so the
 * Corpus stage's ~2,000 cold fetches don't get throttled. Tests inject their own
 * `fetchImpl` and never reach it.
 */

import { fetchJsonCached } from "./cache.mjs";

const API_ENDPOINT = "https://en.wikipedia.org/w/api.php";

/** Identifies the build script to the Wikimedia API, per its User-Agent policy. */
const USER_AGENT =
  "WikiParallel/0.0 (https://github.com/DaniilGurski/wikiparallel; build script) node-fetch";

/**
 * `fetch` with the Wikimedia User-Agent set and a bounded exponential backoff on
 * HTTP 429. A `Retry-After` header, when present, wins over the backoff. After
 * the last attempt the 429 response is returned as-is so the caller surfaces it.
 *
 * @type {import("./cache.mjs").JsonFetch}
 */
async function politeFetch(url) {
  const maxAttempts = 5;
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url, {
      headers: { "user-agent": USER_AGENT, "api-user-agent": USER_AGENT },
    });
    if (response.status !== 429 || attempt >= maxAttempts) return response;

    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 2 ** attempt * 250;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

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
  const body = await fetchJsonCached(vitalArticlesUrl(level), { fetchImpl: politeFetch, ...options });
  const wikitext = body.parse?.wikitext;
  if (typeof wikitext !== "string" || wikitext.trim() === "") {
    throw new Error(`no wikitext in the API response for Vital Articles level ${level}`);
  }
  return wikitext;
}

/**
 * The API URL for an article's Lead Section as plain text: the `extracts` module
 * with `exintro` (the part before the first heading) and `explaintext` (HTML
 * stripped). `redirects=1` resolves a redirect title to its target.
 *
 * @param {string} title
 * @returns {string}
 */
export function articleLeadUrl(title) {
  const params = new URLSearchParams({
    action: "query",
    prop: "extracts",
    exintro: "1",
    explaintext: "1",
    redirects: "1",
    titles: title,
    formatversion: "2",
    format: "json",
  });
  return `${API_ENDPOINT}?${params}`;
}

/**
 * The API URL for an article's section list (`action=parse&prop=sections`),
 * again following redirects.
 *
 * @param {string} title
 * @returns {string}
 */
export function articleSectionsUrl(title) {
  const params = new URLSearchParams({
    action: "parse",
    page: title,
    prop: "sections",
    redirects: "1",
    formatversion: "2",
    format: "json",
  });
  return `${API_ENDPOINT}?${params}`;
}

/**
 * Fetch an article's Lead Section as plain text. Returns `""` when the API
 * carries nothing — a missing page, or an article whose intro is empty — so the
 * caller can drop it rather than embed nothing.
 *
 * @param {string} title
 * @param {{ cacheDir?: string, fetchImpl?: import("./cache.mjs").JsonFetch }} [options]
 * @returns {Promise<string>}
 */
export async function fetchArticleLead(title, options = {}) {
  /** @type {{ query?: { pages?: Array<{ extract?: string }> } }} */
  const body = await fetchJsonCached(articleLeadUrl(title), { fetchImpl: politeFetch, ...options });
  const lead = body.query?.pages?.[0]?.extract;
  return typeof lead === "string" ? lead.trim() : "";
}

/**
 * Fetch an article's section headings, in page order. The API's `line` field is
 * HTML (`<i>`, `&amp;`, ...), so it is reduced to plain text; empty headings are
 * dropped. Returns `[]` for an article with no sections or a missing page.
 *
 * @param {string} title
 * @param {{ cacheDir?: string, fetchImpl?: import("./cache.mjs").JsonFetch }} [options]
 * @returns {Promise<string[]>}
 */
export async function fetchArticleHeadings(title, options = {}) {
  /** @type {{ parse?: { sections?: Array<{ line?: string }> } }} */
  const body = await fetchJsonCached(articleSectionsUrl(title), { fetchImpl: politeFetch, ...options });
  const sections = body.parse?.sections ?? [];
  return sections.map((section) => plainText(section.line ?? "")).filter((line) => line !== "");
}

/**
 * Strip the HTML a MediaWiki section `line` can carry down to plain text: tags
 * removed, the handful of entities the field uses decoded, whitespace collapsed.
 *
 * @param {string} html
 * @returns {string}
 */
function plainText(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
