/**
 * WikiParallel build script.
 *
 * Two stages behind one entry point:
 *   - `list`  — fetch the Vital Articles list and emit the `{ field, title, url }`
 *               list (to stdout, or a file with `--out`).
 *   - the default — run the list stage, then the Corpus stage (Lead Sections +
 *               section headings → Embeddings) and write `corpus.json`.
 *
 * Usage:
 *   node build/build.mjs [--level N] [--out FILE]         full build → corpus.json
 *   node build/build.mjs list [--level N] [--out FILE]    list stage → stdout / FILE
 *
 * A warm cache makes the full build offline and reproducible: a re-run hits no
 * network and writes an equivalent `corpus.json`.
 */

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runListStage } from "./list-stage.mjs";
import { runCorpusStage } from "./corpus-stage.mjs";

/** Where the full build writes the Corpus: `corpus.json` at the repo root. */
const DEFAULT_CORPUS_PATH = path.join(fileURLToPath(new URL("..", import.meta.url)), "corpus.json");

/**
 * @param {string[]} argv  Arguments after the script name.
 * @returns {{ stage: "build" | "list", level: number | undefined, out: string | null }}
 */
function parseArgs(argv) {
  /** @type {"build" | "list"} */
  let stage = "build";
  let level;
  let out = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "list") {
      stage = "list";
    } else if (arg === "--level") {
      level = Number(argv[++i]);
      if (!Number.isInteger(level) || level < 1) {
        throw new Error(`--level expects a positive integer`);
      }
    } else if (arg === "--out") {
      out = argv[++i] ?? null;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { stage, level, out };
}

/** The number of distinct Fields across `articles`, for the log line. */
function fieldCount(/** @type {{ field: string }[]} */ articles) {
  return new Set(articles.map((a) => a.field)).size;
}

/**
 * A stderr progress reporter: a rewriting line on a TTY, an occasional log line
 * otherwise.
 *
 * @param {string} label
 * @returns {(done: number, total: number) => void}
 */
function progress(label) {
  return (done, total) => {
    if (process.stderr.isTTY) {
      process.stderr.write(`\r${label}: ${done}/${total}`);
      if (done === total) process.stderr.write("\n");
    } else if (done === total || done % 100 === 0) {
      console.error(`${label}: ${done}/${total}`);
    }
  };
}

async function main() {
  const { stage, level, out } = parseArgs(process.argv.slice(2));

  const articles = await runListStage({ level });

  if (stage === "list") {
    const json = `${JSON.stringify(articles, null, 2)}\n`;
    if (out) {
      await writeFile(out, json);
      console.error(`wrote ${articles.length} articles across ${fieldCount(articles)} Fields to ${out}`);
    } else {
      process.stdout.write(json);
    }
    return;
  }

  const target = out ?? DEFAULT_CORPUS_PATH;
  console.error(`list stage: ${articles.length} articles across ${fieldCount(articles)} Fields`);

  const { records, skipped } = await runCorpusStage(articles, {
    onFetch: progress("fetch"),
    onEmbed: progress("embed"),
  });

  if (skipped.length > 0) {
    console.error(`skipped ${skipped.length} with an empty Lead Section: ${skipped.join(", ")}`);
  }

  // Compact JSON on purpose: this file ships to the browser, so it is written
  // for size, not for reading (the list stage stays pretty-printed).
  await writeFile(target, `${JSON.stringify(records)}\n`);
  console.error(`wrote ${records.length} Corpus records to ${target}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
