import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import { FIELDS } from "../src/fields.js";
import { FIXTURE_PARALLELS } from "../src/fixtures.js";
import { PAGE_SIZE } from "../src/grouping.js";

const html = await readFile(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

/** Load index.html into jsdom and run main.js against it. */
async function bootApp() {
  const dom = new JSDOM(html, { url: "https://example.test/", runScripts: "outside-only" });
  const { window } = dom;

  // Hand main.js a real DOM without letting jsdom fetch ./src/main.js itself.
  Object.assign(/** @type {any} */ (globalThis), {
    window,
    document: window.document,
    DocumentFragment: window.DocumentFragment,
  });

  // Fresh module each boot so per-run state does not leak between tests.
  await import(`../src/main.js?t=${Date.now()}`);
  return window;
}

/** @type {import("jsdom").DOMWindow} */
let window;

beforeEach(async () => {
  window = await bootApp();
});

const $ = (/** @type {string} */ sel) => {
  const el = window.document.querySelector(sel);
  assert.ok(el, `missing ${sel}`);
  return el;
};

const typeChallenge = (/** @type {string} */ text) => {
  const input = /** @type {HTMLTextAreaElement} */ ($("#challenge"));
  input.value = text;
  input.dispatchEvent(new window.Event("input"));
};

const pickHomeField = (/** @type {string} */ field) => {
  const select = /** @type {HTMLSelectElement} */ ($("#home-field"));
  select.value = field;
  select.dispatchEvent(new window.Event("change"));
};

const submit = () => $("#search-form").dispatchEvent(new window.Event("submit"));

test("the shell shows the input, all eleven Fields, and a disabled button", () => {
  const options = [...$("#home-field").querySelectorAll("option")]
    .map((o) => o.value)
    .filter(Boolean);
  assert.deepEqual(options, [...FIELDS]);
  assert.equal(/** @type {HTMLButtonElement} */ ($("#search-button")).disabled, true);
  assert.ok($("#challenge"));
});

test("the button enables only with >=3 words and a Home Field", () => {
  const button = /** @type {HTMLButtonElement} */ ($("#search-button"));

  typeChallenge("two words");
  assert.equal(button.disabled, true);

  typeChallenge("three whole words");
  assert.equal(button.disabled, true, "still no Home Field");

  pickHomeField("Technology");
  assert.equal(button.disabled, false);

  typeChallenge("   ");
  assert.equal(button.disabled, true);
});

test("running a search renders ~6 Parallels grouped by Field, ordered by Closeness", () => {
  typeChallenge("handling a sudden surge of users");
  pickHomeField("Technology");
  submit();

  const groups = [...window.document.querySelectorAll(".field-group")];
  assert.ok(groups.length >= 2, "expected several Field groups");

  const shown = [...window.document.querySelectorAll(".parallel")];
  assert.equal(shown.length, PAGE_SIZE);

  // No Parallel from the Home Field.
  const headings = groups.map((g) => g.querySelector(".field-group__heading")?.textContent);
  assert.equal(headings.includes("Technology"), false);

  // Within the first group, Closeness is descending.
  const firstGroup = groups[0];
  assert.ok(firstGroup);
  const firstGroupCloseness = [...firstGroup.querySelectorAll(".parallel__closeness")].map((el) =>
    Number(el.textContent?.replace(/\D/g, "")),
  );
  const sorted = [...firstGroupCloseness].sort((a, b) => b - a);
  assert.deepEqual(firstGroupCloseness, sorted);

  // Each card has a linked title and a lead section.
  const firstCard = shown[0];
  assert.ok(firstCard);
  assert.match(firstCard.querySelector(".parallel__title a")?.getAttribute("href") ?? "", /wikipedia\.org/);
  assert.ok((firstCard.querySelector(".parallel__lead")?.textContent ?? "").length > 0);
});

test("'Show 6 more' appends the next set and then hides itself", () => {
  typeChallenge("keeping a system stable under load");
  pickHomeField("Mathematics");
  submit();

  const showMore = /** @type {HTMLButtonElement} */ ($("#show-more"));
  const total = FIXTURE_PARALLELS.filter((p) => p.field !== "Mathematics").length;

  let seen = PAGE_SIZE;
  assert.equal(showMore.hidden, false);

  while (!showMore.hidden) {
    showMore.dispatchEvent(new window.Event("click"));
    seen = Math.min(seen + PAGE_SIZE, total);
    assert.equal(window.document.querySelectorAll(".parallel").length, seen);
  }

  assert.equal(seen, total, "all Parallels revealed before the button vanished");
  assert.equal(window.document.querySelectorAll(".parallel").length, total);
});

test("a second Challenge replaces the first set without reload", () => {
  typeChallenge("handling a sudden surge of users");
  pickHomeField("Technology");
  submit();
  const first = [...window.document.querySelectorAll(".parallel__title")].map((el) => el.textContent);

  typeChallenge("a completely different problem statement");
  pickHomeField("Health and medicine");
  submit();
  const second = [...window.document.querySelectorAll(".parallel__title")].map((el) => el.textContent);

  assert.notDeepEqual(first, second);
  assert.equal(window.document.querySelectorAll(".parallel").length, PAGE_SIZE);
  // Home Field switched: no Health and medicine now, Technology allowed again.
  const fields = [...window.document.querySelectorAll(".field-group__heading")].map((h) => h.textContent);
  assert.equal(fields.includes("Health and medicine"), false);
});

const pressEnter = (/** @type {string} */ sel) =>
  $(sel).dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
  );

test("Enter runs the search from the Challenge box", () => {
  typeChallenge("handling a sudden surge of users");
  pickHomeField("Technology");
  pressEnter("#challenge");
  assert.equal(window.document.querySelectorAll(".parallel").length, PAGE_SIZE);
});

test("Enter runs the search from the Home Field dropdown", () => {
  typeChallenge("handling a sudden surge of users");
  pickHomeField("Technology");
  pressEnter("#home-field");
  assert.equal(window.document.querySelectorAll(".parallel").length, PAGE_SIZE);
});

test("the Challenge is trimmed and length-capped on search", () => {
  const input = /** @type {HTMLTextAreaElement} */ ($("#challenge"));
  typeChallenge("   surge   of   users   " + "x".repeat(400));
  pickHomeField("Technology");
  submit();
  assert.equal(input.value.length <= 300, true);
  assert.equal(input.value.startsWith("surge"), true);
});

test("the CC BY-SA attribution notice is on the page", () => {
  assert.match($(".colophon").textContent ?? "", /CC BY-SA/);
});
