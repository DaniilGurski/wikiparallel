/**
 * Run `worker` over every item with at most `limit` calls in flight at once,
 * returning the results in input order. A tiny pool so a cold Corpus build
 * fetches its ~1,000 articles without either firing 2,000 requests at the
 * MediaWiki API at once or crawling through them one at a time.
 */

/**
 * @template T, R
 * @param {T[]} items
 * @param {number} limit          Maximum concurrent `worker` calls.
 * @param {(item: T) => Promise<R>} worker
 * @returns {Promise<R[]>}         Results aligned to `items` by index.
 */
export async function mapWithConcurrency(items, limit, worker) {
  /** @type {R[]} */
  const results = new Array(items.length);
  const queue = [...items.entries()];

  async function run() {
    for (let entry = queue.shift(); entry !== undefined; entry = queue.shift()) {
      const [index, item] = entry;
      results[index] = await worker(item);
    }
  }

  const workers = Math.max(1, Math.min(limit, items.length));
  await Promise.all(Array.from({ length: workers }, run));
  return results;
}
