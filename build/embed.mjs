/**
 * `embedText()` — the one place text becomes an Embedding.
 *
 * A thin wrapper over `@huggingface/transformers` running the `gte-small` model
 * (384-dimensional). The exact same package and pinned version is imported from
 * a CDN in the browser at search time, so a Lead Section Embedding produced here
 * and a Challenge Embedding produced in the browser are directly comparable and
 * their Closeness is meaningful (issue #1, ADR-0001).
 *
 * `gte-small` needs no "query:" / "passage:" prefixes, so the input string is
 * embedded as-is. Mean pooling + L2 normalisation is the model's standard
 * sentence-embedding recipe and makes the output deterministic: embedding the
 * same string twice returns an identical Embedding.
 *
 * Not unit-tested — it is a passthrough to a third-party model. The ranker
 * (issue #3) is the tested seam for retrieval; `npm run embed:selfcheck` is the
 * manual smoke test for this file.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline, env } from "@huggingface/transformers";

/** Hugging Face model id for gte-small with ONNX weights. */
export const MODEL_ID = "Supabase/gte-small";

/** gte-small's output dimensionality. */
export const EMBEDDING_DIM = 384;

// Keep the one-time model download beside the API cache: disposable,
// git-ignored, and anchored to this file so it is reused whatever the cwd.
env.cacheDir = path.join(fileURLToPath(new URL(".", import.meta.url)), "cache", "models");

/**
 * The loaded pipeline, kept as a callable that maps text to a tensor with a
 * numeric `.data`. Typed loosely on purpose: `pipeline`'s full return union is
 * enormous and this module only ever calls it one way.
 *
 * @type {Promise<(text: string, options: object) => Promise<{ data: ArrayLike<number> }>> | undefined}
 */
let extractorPromise;

/** Load the feature-extraction pipeline once and reuse it for every call. */
function getExtractor() {
  extractorPromise ??= /** @type {any} */ (pipeline("feature-extraction", MODEL_ID));
  return /** @type {NonNullable<typeof extractorPromise>} */ (extractorPromise);
}

/**
 * Embed a string into an Embedding: a plain array of {@link EMBEDDING_DIM}
 * numbers.
 *
 * @param {string} text
 * @returns {Promise<number[]>}
 */
export async function embedText(text) {
  const extractor = await getExtractor();
  const output = await extractor(text, { pooling: "mean", normalize: true });
  const embedding = Array.from(/** @type {ArrayLike<number>} */ (output.data), Number);
  if (embedding.length !== EMBEDDING_DIM) {
    throw new Error(`expected a ${EMBEDDING_DIM}-number Embedding, got ${embedding.length}`);
  }
  return embedding;
}
