import { test } from "node:test";
import assert from "node:assert/strict";

import { search } from "../src/search.js";
import { isField } from "../src/fields.js";

test("search returns a non-trivial list of Parallels", () => {
  const parallels = search("keeping a system stable under sudden load", "Technology");
  assert.ok(parallels.length >= 12, `expected plenty of fixture Parallels, got ${parallels.length}`);
});

test("every Parallel has the shape the UI renders", () => {
  for (const p of search("a hard problem to solve", "Mathematics")) {
    assert.equal(typeof p.title, "string");
    assert.ok(p.title.length > 0);
    assert.match(p.url, /^https:\/\/en\.wikipedia\.org\/wiki\//);
    assert.equal(isField(p.field), true);
    assert.equal(typeof p.leadSection, "string");
    assert.ok(p.leadSection.length > 0);
    assert.equal(Number.isInteger(p.closeness), true);
    assert.ok(p.closeness >= 0 && p.closeness <= 100);
  }
});

test("search excludes every Parallel in the Home Field", () => {
  for (const homeField of ["Science", "History", "Arts"]) {
    const parallels = search("some challenge text here", homeField);
    assert.equal(
      parallels.some((p) => p.field === homeField),
      false,
      `${homeField} should be excluded`,
    );
  }
});

test("the fixture spans enough Fields to exercise grouping", () => {
  const fields = new Set(search("challenge text goes here", "People").map((p) => p.field));
  assert.ok(fields.size >= 5, `expected >=5 distinct Fields, got ${fields.size}`);
});

test("search is deterministic for the same inputs", () => {
  const a = search("identical challenge text", "Technology");
  const b = search("identical challenge text", "Technology");
  assert.deepEqual(a, b);
});
