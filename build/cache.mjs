/**
 * A tiny on-disk cache for MediaWiki API responses. Every response the build
 * script fetches is written here as JSON, so a second run is fast and works
 * offline: a URL already on disk is never re-fetched (see issue #4).
 *
 * The cache directory is disposable and git-ignored (`build/cache/`); deleting
 * it just forces the next run back onto the network.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Default cache location: `build/cache/` next to this file. Anchored to the
 * module, not `process.cwd()`, so the cache is found no matter which directory
 * the build is run from.
 */
export const DEFAULT_CACHE_DIR = path.join(fileURLToPath(new URL(".", import.meta.url)), "cache");

/**
 * The slice of a `fetch` response this module needs. `fetch` itself satisfies
 * it; tests pass a stub.
 *
 * @typedef {object} JsonResponse
 * @property {boolean} ok
 * @property {number} status
 * @property {string} statusText
 * @property {() => Promise<any>} json
 *
 * @typedef {(url: string) => Promise<JsonResponse>} JsonFetch
 */

/**
 * The filename a URL is cached under: a readable slug from the last path
 * segment, plus a hash of the full URL so query strings stay distinct.
 *
 * @param {string} url
 * @returns {string}
 */
export function cacheFilename(url) {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 16);
  const withoutQuery = url.split(/[?#]/)[0] ?? url;
  const lastSegment = withoutQuery.split("/").filter(Boolean).at(-1) ?? "response";
  const slug = lastSegment.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 40);
  return `${slug || "response"}-${hash}.json`;
}

/**
 * Fetch `url` and parse it as JSON, going through the on-disk cache first.
 *
 * On a cache hit no network call is made. On a miss the response is fetched,
 * parsed, and written to the cache before being returned.
 *
 * @template T
 * @param {string} url
 * @param {object} [options]
 * @param {string} [options.cacheDir]   Defaults to {@link DEFAULT_CACHE_DIR}.
 * @param {JsonFetch} [options.fetchImpl]  Injected for tests; defaults to `fetch`.
 * @param {() => string} [options.now]  Timestamp source for the cache metadata.
 * @returns {Promise<T>}
 */
export async function fetchJsonCached(url, options = {}) {
  const {
    cacheDir = DEFAULT_CACHE_DIR,
    fetchImpl = /** @type {JsonFetch} */ (fetch),
    now = () => new Date().toISOString(),
  } = options;

  const file = path.join(cacheDir, cacheFilename(url));

  const cached = await readCache(file);
  if (cached !== undefined) return cached.body;

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
  }
  const body = await response.json();

  await mkdir(cacheDir, { recursive: true });
  await writeFile(file, `${JSON.stringify({ url, fetchedAt: now(), body }, null, 2)}\n`);

  return body;
}

/**
 * Read a cache entry, or `undefined` when the file is not there. A corrupt file
 * is surfaced rather than silently re-fetched, so the cause is visible.
 *
 * @param {string} file
 * @returns {Promise<{ body: any } | undefined>}
 */
async function readCache(file) {
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`corrupt cache entry ${file}: ${/** @type {Error} */ (error).message}`);
  }
}
