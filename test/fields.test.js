import { test } from "node:test";
import assert from "node:assert/strict";

import { FIELDS, isField, fieldSlug } from "../src/fields.js";

test("there are exactly eleven Fields, in Vital Articles order", () => {
  assert.deepEqual(FIELDS, [
    "People",
    "History",
    "Geography",
    "Arts",
    "Philosophy and religion",
    "Everyday life",
    "Society and social sciences",
    "Health and medicine",
    "Science",
    "Technology",
    "Mathematics",
  ]);
});

test("isField recognises a Field and rejects anything else", () => {
  assert.equal(isField("Science"), true);
  assert.equal(isField("science"), false);
  assert.equal(isField(""), false);
  assert.equal(isField("Cooking"), false);
  assert.equal(isField(null), false);
});

test("fieldSlug is a stable kebab-case token usable as a CSS class", () => {
  assert.equal(fieldSlug("Philosophy and religion"), "philosophy-and-religion");
  assert.equal(fieldSlug("Society and social sciences"), "society-and-social-sciences");
  assert.equal(fieldSlug("Arts"), "arts");
});
