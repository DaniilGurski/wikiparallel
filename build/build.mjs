/**
 * WikiParallel build script.
 *
 * Today it runs the list stage only — fetch the Vital Articles list and emit a
 * `{ field, title, url }` list. Issue #5 adds the Corpus stage (Lead Sections +
 * Embeddings → `corpus.json`) to this same entry point.
 *
 * Usage:
 *   node build/build.mjs [list] [--level N] [--out FILE]
 *
 * With no `--out` the list is written to stdout. `list` is accepted as an
 * explicit no-op so the command reads the same once issue #5 adds sibling
 * stages.
 */

import { writeFile } from "node:fs/promises";

import { runListStage } from "./list-stage.mjs";

/**
 * @param {string[]} argv  Arguments after the script name.
 * @returns {{ level: number | undefined, out: string | null }}
 */
function parseArgs(argv) {
  let level;
  let out = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "list") {
      continue;
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
  return { level, out };
}

async function main() {
  const { level, out } = parseArgs(process.argv.slice(2));

  const articles = await runListStage({ level });
  const json = `${JSON.stringify(articles, null, 2)}\n`;

  if (out) {
    await writeFile(out, json);
    const fields = new Set(articles.map((a) => a.field));
    console.error(`wrote ${articles.length} articles across ${fields.size} Fields to ${out}`);
  } else {
    process.stdout.write(json);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
