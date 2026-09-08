/**
 * The Corpus stage of the build: turn the list stage's `{ field, title, url }`
 * records into Corpus records.
 *
 * For each article it fetches the Lead Section and the list of section headings
 * (same on-disk cache as the list stage, see issue #4), then embeds
 * `leadText + "\n" + headings.join("\n")` into one Embedding with `embedText()`.
 * Articles whose Lead Section comes back empty are dropped, not embedded.
 *
 * Output order follows the input order, which the list stage makes
 * deterministic, so a warm-cache re-run reproduces an equivalent `corpus.json`.
 */

import { fetchArticleLead, fetchArticleHeadings } from "./wiki.mjs";
import { embedText } from "./embed.mjs";
import { mapWithConcurrency } from "./concurrency.mjs";

/** @typedef {import("./parse-vital-articles.mjs").VitalArticle} VitalArticle */

/**
 * One Corpus record, as written to `corpus.json`.
 *
 * @typedef {object} CorpusRecord
 * @property {string} title
 * @property {string} field       One of the eleven Fields.
 * @property {string} url         Canonical English Wikipedia URL.
 * @property {string} leadText    The article's Lead Section (non-empty).
 * @property {string[]} headings  The article's section headings, in page order.
 * @property {number[]} embedding 384-number Embedding of lead + headings.
 */

/**
 * How many articles to fetch at once on a cold cache — each article is two API
 * calls (lead + sections), so this is ~2x requests in flight. Kept low on
 * purpose: the Wikimedia API throttles bursts, and
 * {@link module:build/wiki~politeFetch} already backs off on 429, so a modest
 * pool finishes a cold build without a throttling spiral.
 */
export const DEFAULT_CONCURRENCY = 4;

/**
 * Build Corpus records for `articles`.
 *
 * @param {VitalArticle[]} articles
 * @param {object} [options]
 * @param {number} [options.concurrency]  Concurrent fetches; defaults to {@link DEFAULT_CONCURRENCY}.
 * @param {(text: string) => Promise<number[]>} [options.embed]  Injected for tests; defaults to `embedText`.
 * @param {(done: number, total: number) => void} [options.onFetch]  Progress after each article is fetched.
 * @param {(done: number, total: number) => void} [options.onEmbed]  Progress after each article is embedded.
 * @param {string} [options.cacheDir]  API cache directory.
 * @param {import("./cache.mjs").JsonFetch} [options.fetchImpl]
 * @returns {Promise<{ records: CorpusRecord[], skipped: string[] }>}
 */
export async function runCorpusStage(articles, options = {}) {
  const {
    concurrency = DEFAULT_CONCURRENCY,
    embed = embedText,
    onFetch,
    onEmbed,
    ...fetchOptions
  } = options;

  let done = 0;
  const fetched = await mapWithConcurrency(articles, concurrency, async (article) => {
    const [leadText, headings] = await Promise.all([
      fetchArticleLead(article.title, fetchOptions),
      fetchArticleHeadings(article.title, fetchOptions),
    ]);
    onFetch?.(++done, articles.length);
    return { article, leadText, headings };
  });

  const withLead = fetched.filter((f) => f.leadText !== "");
  const skipped = fetched.filter((f) => f.leadText === "").map((f) => f.article.title);

  /** @type {CorpusRecord[]} */
  const records = [];
  for (const { article, leadText, headings } of withLead) {
    const embedding = await embed(`${leadText}\n${headings.join("\n")}`);
    records.push({ title: article.title, field: article.field, url: article.url, leadText, headings, embedding });
    onEmbed?.(records.length, withLead.length);
  }

  return { records, skipped };
}
