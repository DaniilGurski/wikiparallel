/**
 * Manual smoke test for `embedText()` (see build/embed.mjs — it is deliberately
 * not part of the automated suite). Downloads gte-small on first run, then
 * checks the two properties the rest of the build relies on:
 *
 *   - the Embedding has 384 numbers;
 *   - embedding the same text twice gives an identical Embedding.
 *
 * Run with:  npm run embed:selfcheck
 */

import { embedText, EMBEDDING_DIM } from "./embed.mjs";

const text = "handling a sudden surge of users without the system falling over";

const first = await embedText(text);
const second = await embedText(text);

const identical = first.length === second.length && first.every((n, i) => n === second[i]);

console.log(`length:        ${first.length} (expected ${EMBEDDING_DIM})`);
console.log(`sample:        [${first.slice(0, 3).map((n) => n.toFixed(6)).join(", ")}, ...]`);
console.log(`deterministic: ${identical}`);

if (first.length !== EMBEDDING_DIM || !identical) {
  console.error("FAIL: embedText did not meet its contract");
  process.exit(1);
}
console.log("OK");
