/**
 * Parse the wikitext of a Wikipedia "Vital articles" list page into a flat list
 * of articles, each tagged with the Field (top-level section) it sits under.
 *
 * This is the fiddly, tested seam of the build script (see issue #4): the page
 * mixes column templates, quality-icon templates, bold "also on Level 2" links
 * and nested bullet lists, and its Field names and ordering are read from the
 * live page rather than hard-coded (docs/adr/0002).
 */

/**
 * One article as the list stage emits it. `title` is the Wikipedia article
 * title (the wikilink target); `url` is its canonical English Wikipedia URL.
 *
 * @typedef {object} VitalArticle
 * @property {string} field  The top-level section the article appears under.
 * @property {string} title  The Wikipedia article title.
 * @property {string} url    Canonical `https://en.wikipedia.org/wiki/...` URL.
 */

/** Matches a wikitext heading line, capturing its `=` run and inner text. */
const HEADING = /^(={1,6})[ \t]*(.*?)[ \t]*\1[ \t]*$/;

/** Matches a bullet-list line at any nesting depth (`*`, `**`, `***`, ...). */
const LIST_ITEM = /^\*+[ \t]/;

/**
 * Matches a single `[[target]]` or `[[target|display]]` wikilink. The display
 * half may itself contain `|` (from nested templates like `{{mvar|e}}`), so the
 * target is captured up to the first `|` or `]]` only.
 */
const WIKILINK = /\[\[[ \t]*([^\]|#]+?)[ \t]*(?:\|[^\]]*)?\]\]/g;

/**
 * Parse Vital Articles wikitext into `{ field, title, url }` records.
 *
 * Rules:
 *   - Only content inside the "Level N vital articles" top-level section counts;
 *     the daily quality-summary table above it is ignored.
 *   - Each `==` heading inside that section opens a Field. Field names and their
 *     order come straight from the page.
 *   - Deeper headings (`===`, `====`) are sub-headings: their articles flatten
 *     onto the enclosing Field.
 *   - Every bullet line, at any nesting depth, contributes its first non-
 *     namespaced wikilink (skipping `[[Wikipedia:...]]` / `[[Category:...]]`
 *     back-links and quality icons).
 *   - A title seen twice is kept only the first time.
 *
 * @param {string} wikitext
 * @param {{ level?: number }} [options]  Vital Articles level; defaults to 3.
 *   Used to pick the right top-level section when the page names its level.
 * @returns {VitalArticle[]}
 */
export function parseVitalArticles(wikitext, { level = 3 } = {}) {
  /** @type {VitalArticle[]} */
  const articles = [];
  const seen = new Set();

  let inList = false;
  /** @type {string | null} */
  let field = null;

  for (const line of String(wikitext).split(/\r?\n/)) {
    const heading = line.match(HEADING);
    if (heading) {
      const [, marker = "", rawText = ""] = heading;
      const depth = marker.length;
      const text = cleanHeadingText(rawText);
      if (depth === 1) {
        inList = opensList(text, level);
        field = null;
      } else if (depth === 2 && inList) {
        field = text;
      }
      // depth >= 3 is a sub-heading: leave `field` as the enclosing Field.
      continue;
    }

    if (!inList || field === null || !LIST_ITEM.test(line)) continue;

    const title = firstArticleTitle(line);
    if (title === null || seen.has(title)) continue;
    seen.add(title);
    articles.push({ field, title, url: wikiUrl(title) });
  }

  return articles;
}

/**
 * Whether a top-level (`=`) heading opens the list body. The page's heading is
 * "Level 3 vital articles"; when a level is named it must match the level we
 * asked for, so pointing the build at level 4 does not silently parse a level 3
 * page that happens to be cached.
 *
 * @param {string} text
 * @param {number} level
 * @returns {boolean}
 */
function opensList(text, level) {
  if (!/\bvital articles\b/i.test(text)) return false;
  if (!/\blevel\s*\d+/i.test(text)) return true;
  return new RegExp(String.raw`\blevel\s*0*${level}\b`, "i").test(text);
}

/**
 * The first wikilink on a bullet line that points at an actual article — not a
 * `[[Wikipedia:...]]` / `[[Category:...]]` cross-reference (those carry a
 * namespace colon).
 *
 * @param {string} line
 * @returns {string | null}
 */
function firstArticleTitle(line) {
  for (const match of line.matchAll(WIKILINK)) {
    const target = (match[1] ?? "").trim();
    if (target === "" || target.includes(":")) continue;
    return normalizeTitle(target);
  }
  return null;
}

/**
 * Canonicalise a wikilink target the way MediaWiki does for titles: underscores
 * to spaces, whitespace collapsed, first letter upper-cased.
 *
 * @param {string} target
 * @returns {string}
 */
function normalizeTitle(target) {
  const title = target.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return title.charAt(0).toUpperCase() + title.slice(1);
}

/**
 * The canonical English Wikipedia URL for an article title.
 *
 * @param {string} title
 * @returns {string}
 */
export function wikiUrl(title) {
  const path = title
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[?#%]/g, encodeURIComponent);
  return `https://en.wikipedia.org/wiki/${path}`;
}

/**
 * Strip the wikitext decoration a heading can carry — HTML comments, bold/italic
 * quotes, wikilinks (kept as their display text) and a trailing "(NN articles)"
 * count — so the Field name is the plain section title.
 *
 * @param {string} text
 * @returns {string}
 */
function cleanHeadingText(text) {
  return text
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\[\[[^\]|]*\|([^\]]*)\]\]/g, "$1")
    .replace(/\[\[([^\]]*)\]\]/g, "$1")
    .replace(/'{2,}/g, "")
    .replace(/\s*\(\s*\d[\d,]*\s+articles?\s*\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
