/**
 * Evaluation harness: judge WikiParallel's result quality before a demo.
 *
 * It holds eight hand-written Challenges, each paired with a plausible Home
 * Field, embeds each one with the same `embedText()` the build uses, ranks it
 * against the real `corpus.json` with the same `rankParallels()` the browser
 * runs, and prints the first page of Parallels grouped by Field exactly as the
 * UI groups them. No ranking or grouping logic lives here — this file is glue
 * around `src/ranker.js` and `src/grouping.js`.
 *
 * `docs/evaluation.md` records what a run showed. Re-run this script to refresh
 * the numbers behind that write-up.
 *
 * Usage:  node build/eval.mjs
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { embedText } from "./embed.mjs";
import { loadCorpus } from "../src/corpus.js";
import { rankParallels } from "../src/ranker.js";
import { groupByField, PAGE_SIZE } from "../src/grouping.js";
import { fieldsFromCorpus } from "../src/fields.js";

/** @typedef {import("../src/grouping.js").FieldGroup} FieldGroup */

/** `corpus.json` at the repo root, written by `npm run build`. */
const CORPUS_PATH = path.join(fileURLToPath(new URL("..", import.meta.url)), "corpus.json");

/**
 * The eight Challenges under evaluation, each with the Home Field a person
 * posing that Challenge would most likely pick. "handling a sudden surge of
 * users" is the canonical example from issue #1 and stays first.
 *
 * @type {readonly { challenge: string, homeField: string }[]}
 */
export const CHALLENGES = Object.freeze([
  { challenge: "handling a sudden surge of users", homeField: "Technology" },
  { challenge: "keeping a team motivated over a long project", homeField: "Society and social sciences" },
  { challenge: "allocating a scarce resource among competing demands", homeField: "Society and social sciences" },
  { challenge: "detecting a small failure before it cascades into a large one", homeField: "Technology" },
  { challenge: "preserving knowledge so it outlives the people who created it", homeField: "Everyday life" },
  { challenge: "coordinating many independent actors without a central controller", homeField: "Technology" },
  { challenge: "recovering and adapting after a major shock", homeField: "Health, medicine and disease" },
  { challenge: "separating a faint signal from overwhelming noise", homeField: "Science" },
]);

/** The first line of a Lead Section, trimmed and clamped for a one-line preview. */
function firstLine(/** @type {string} */ leadSection, /** @type {number} */ max = 150) {
  const line = leadSection.split("\n", 1)[0]?.trim() ?? "";
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/**
 * Render one Challenge's grouped Parallels as plain text, the way the UI lays
 * them out: a Field heading, then each Parallel's title, Closeness and the first
 * line of its Lead Section.
 *
 * @param {string} challenge
 * @param {string} homeField
 * @param {FieldGroup[]} groups
 * @returns {string}
 */
export function formatChallengeReport(challenge, homeField, groups) {
  const rule = "═".repeat(72);
  const lines = [rule, `Challenge:  ${challenge}`, `Home Field: ${homeField}`, rule, ""];

  if (groups.length === 0) {
    lines.push("(no Parallels)", "");
    return lines.join("\n");
  }

  for (const group of groups) {
    lines.push(group.field);
    for (const p of group.parallels) {
      lines.push(`  [${String(p.closeness).padStart(2)}] ${p.title}`);
      lines.push(`       ${firstLine(p.leadSection)}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** Read `corpus.json` from disk through the app's own `loadCorpus` adapter. */
async function loadCorpusFromDisk() {
  return loadCorpus(async () => {
    let text;
    try {
      text = await readFile(CORPUS_PATH, "utf8");
    } catch {
      return { ok: false, status: 404, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => JSON.parse(text) };
  });
}

async function main() {
  const corpus = await loadCorpusFromDisk();
  const order = fieldsFromCorpus(corpus);
  process.stderr.write(`Corpus: ${corpus.length} articles across ${order.length} Fields\n\n`);

  for (const { challenge, homeField } of CHALLENGES) {
    const challengeEmbedding = await embedText(challenge);
    const { parallels } = rankParallels(
      challengeEmbedding,
      /** @type {any} */ (homeField),
      corpus,
      { pageSize: PAGE_SIZE, offset: 0 },
    );
    const groups = groupByField(parallels, order);
    process.stdout.write(`${formatChallengeReport(challenge, homeField, groups)}\n`);
  }
}

// Only run when invoked directly (`node build/eval.mjs`); `test/eval.test.js`
// imports the formatter and Challenge set without triggering a full run.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
