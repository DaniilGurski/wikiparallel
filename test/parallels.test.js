import { test } from "node:test";
import assert from "node:assert/strict";

import { rankParallels, pageView } from "../src/parallels.js";
import { PAGE_SIZE } from "../src/grouping.js";
import { makeParallel as parallel } from "./helpers.js";

const many = (/** @type {number} */ n) =>
  Array.from({ length: n }, (_, i) =>
    parallel({ title: `p${i}`, closeness: 100 - i, field: i % 2 ? "Arts" : "Science" }),
  );

test("rankParallels sorts the whole set by Closeness once", () => {
  const ranked = rankParallels([
    parallel({ title: "low", closeness: 10 }),
    parallel({ title: "high", closeness: 90 }),
  ]);
  assert.deepEqual(ranked.map((p) => p.title), ["high", "low"]);
});

test("pageView groups only the first `visibleCount` Parallels", () => {
  const ranked = many(20);
  const view = pageView(ranked, PAGE_SIZE);
  const shown = view.groups.flatMap((g) => g.parallels);
  assert.equal(shown.length, PAGE_SIZE);
  assert.deepEqual(new Set(shown.map((p) => p.title)), new Set(["p0", "p1", "p2", "p3", "p4", "p5"]));
});

test("pageView reports more Parallels are available until the set is exhausted", () => {
  const ranked = many(14);
  assert.equal(pageView(ranked, 6).hasMore, true);
  assert.equal(pageView(ranked, 12).hasMore, true);
  assert.equal(pageView(ranked, 18).hasMore, false);
  assert.equal(pageView(ranked, 14).hasMore, false);
});

test("pageView clamps an over-large visibleCount to what exists", () => {
  const ranked = many(4);
  const view = pageView(ranked, 999);
  assert.equal(view.groups.flatMap((g) => g.parallels).length, 4);
  assert.equal(view.hasMore, false);
});
