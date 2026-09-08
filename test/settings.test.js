import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import { initSettings, readApiKey, API_KEY_STORAGE_KEY } from "../src/settings.js";

const html = await readFile(fileURLToPath(new URL("../settings.html", import.meta.url)), "utf8");

/**
 * A Map-backed stand-in for `localStorage`, so the tests drive the settings
 * module without a real browser store.
 * @param {Record<string, string>} [initial]
 */
function fakeStorage(initial = {}) {
  /** @type {Map<string, string>} */
  const map = new Map(Object.entries(initial));
  return {
    /** @param {string} key */
    getItem: (key) => (map.has(key) ? map.get(key) ?? null : null),
    /** @param {string} key @param {string} value */
    setItem: (key, value) => void map.set(key, String(value)),
    /** @param {string} key */
    removeItem: (key) => void map.delete(key),
  };
}

/**
 * Boot settings.html in jsdom and wire {@link initSettings} against it with the
 * given storage stand-in. Returns the window and a `$` that asserts presence.
 * @param {ReturnType<typeof fakeStorage>} storage
 */
function bootSettings(storage) {
  const dom = new JSDOM(html, { url: "https://example.test/settings.html" });
  const { window } = dom;
  initSettings({ document: window.document, storage });
  const $ = (/** @type {string} */ sel) => {
    const el = window.document.querySelector(sel);
    assert.ok(el, `missing ${sel}`);
    return el;
  };
  return { window, $ };
}

const submitForm = (/** @type {ReturnType<typeof bootSettings>} */ ctx) =>
  ctx.$("#api-key-form").dispatchEvent(new ctx.window.Event("submit"));

test("a key entered and saved is still stored after a reload", () => {
  const storage = fakeStorage();

  const first = bootSettings(storage);
  /** @type {HTMLInputElement} */ (first.$("#api-key")).value = "  sk-ant-secret-key  ";
  submitForm(first);

  assert.equal(readApiKey(storage), "sk-ant-secret-key", "the key is trimmed and stored");

  // "Reload": a fresh page against the same store shows the key still there.
  const reloaded = bootSettings(storage);
  assert.equal(/** @type {HTMLInputElement} */ (reloaded.$("#api-key")).value, "sk-ant-secret-key");
});

test("the forget control erases the stored key, and a reload confirms it is gone", () => {
  const storage = fakeStorage({ [API_KEY_STORAGE_KEY]: "sk-ant-old-key" });

  const ctx = bootSettings(storage);
  assert.equal(/** @type {HTMLInputElement} */ (ctx.$("#api-key")).value, "sk-ant-old-key");

  ctx.$("#forget-key").dispatchEvent(new ctx.window.Event("click"));
  assert.equal(/** @type {HTMLInputElement} */ (ctx.$("#api-key")).value, "");
  assert.equal(readApiKey(storage), "");

  const reloaded = bootSettings(storage);
  assert.equal(/** @type {HTMLInputElement} */ (reloaded.$("#api-key")).value, "");
});

test("saving an empty field forgets any stored key", () => {
  const storage = fakeStorage({ [API_KEY_STORAGE_KEY]: "sk-ant-old-key" });

  const ctx = bootSettings(storage);
  /** @type {HTMLInputElement} */ (ctx.$("#api-key")).value = "   ";
  submitForm(ctx);

  assert.equal(readApiKey(storage), "");
});

test("the forget control is disabled when no key is stored", () => {
  const empty = bootSettings(fakeStorage());
  assert.equal(/** @type {HTMLButtonElement} */ (empty.$("#forget-key")).disabled, true);

  const withKey = bootSettings(fakeStorage({ [API_KEY_STORAGE_KEY]: "sk-ant-key" }));
  assert.equal(/** @type {HTMLButtonElement} */ (withKey.$("#forget-key")).disabled, false);
});

test("the page states that the key is stored in this browser only", () => {
  const { window } = bootSettings(fakeStorage());
  assert.match(window.document.body.textContent ?? "", /stored in this browser only/i);
});

test("the page links to the Anthropic console and says a key needs credit on it", () => {
  const { window, $ } = bootSettings(fakeStorage());
  assert.ok($('a[href*="console.anthropic.com"]'), "a link to the Anthropic console");
  assert.match(window.document.body.textContent ?? "", /credit/i);
});

test("the settings page has navigation back to search", () => {
  const { window } = bootSettings(fakeStorage());
  const backLinks = [...window.document.querySelectorAll("a")].filter((a) =>
    /(^|\/)index\.html$/.test(a.getAttribute("href") ?? ""),
  );
  assert.ok(backLinks.length >= 1, "at least one link back to index.html");
});

test("readApiKey returns an empty string when nothing is stored", () => {
  assert.equal(readApiKey(fakeStorage()), "");
});
