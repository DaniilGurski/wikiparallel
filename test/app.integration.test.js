import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

import { FIELDS, fieldsFromCorpus } from "../src/fields.js";
import { PAGE_SIZE } from "../src/grouping.js";
import { initApp } from "../src/app.js";
import { CorpusMissingError } from "../src/corpus.js";
import { CHALLENGE, FIXTURE_CORPUS } from "./ranker.fixture.js";

const html = await readFile(fileURLToPath(new URL("../index.html", import.meta.url)), "utf8");

/**
 * A canned Bridge, the default outcome of the fake generator.
 * @type {import("../src/bridge.js").BridgeResult}
 */
const CANNED_BRIDGE = {
  strength: "strong",
  summary: "Both keep a system serving demand it cannot fully meet.",
  correspondences: [
    { challenge: "your users", subject: "the body's cells" },
    { challenge: "your servers", subject: "the regulatory organs" },
  ],
};

/**
 * @typedef {import("../src/bridge.js").BridgeResult | Error | "never"} BridgeOutcome
 */

/**
 * A fake Bridge generator. `outcome` is a value to resolve with, an `Error` to
 * reject with, or `"never"` to return a promise that never settles (for the
 * pending state). An array is a sequence, one entry per call, with the last
 * entry repeating once the sequence runs out — that is how a retry after a
 * failure is driven. Records every request it receives.
 *
 * @param {BridgeOutcome | BridgeOutcome[]} [outcome]
 */
function fakeBridgeGenerator(outcome = CANNED_BRIDGE) {
  /** @type {import("../src/bridge.js").BridgeRequest[]} */
  const calls = [];
  const sequence = Array.isArray(outcome) ? outcome : [outcome];
  const impl = (/** @type {import("../src/bridge.js").BridgeRequest} */ request) => {
    calls.push(request);
    const next = sequence[Math.min(calls.length - 1, sequence.length - 1)];
    if (next === "never") return new Promise(() => {});
    if (next instanceof Error) return Promise.reject(next);
    return Promise.resolve(next);
  };
  return Object.assign(impl, { calls });
}

/**
 * A Bridge generator whose calls are settled by hand. Needed wherever a test has
 * to hold a generation open — two Bridges in flight at once, or a search started
 * while one is still running — which the sequence-driven
 * {@link fakeBridgeGenerator} cannot express.
 */
function controlledBridgeGenerator() {
  /** @type {import("../src/bridge.js").BridgeRequest[]} */
  const calls = [];
  /** @type {((result: any) => void)[]} */
  const open = [];
  const impl = (/** @type {import("../src/bridge.js").BridgeRequest} */ request) => {
    calls.push(request);
    return new Promise((resolve) => open.push(resolve));
  };
  return Object.assign(impl, {
    calls,
    /**
     * Settle the nth call — in the order the clicks were made — with a Bridge.
     * @param {number} n
     * @param {import("../src/bridge.js").BridgeResult} result
     */
    settle(n, result) {
      const resolve = open[n];
      assert.ok(resolve, `call ${n} was never made`);
      resolve(result);
    },
  });
}

/**
 * Load index.html into jsdom and wire {@link initApp} against it with fakes for
 * the three seams that reach the network: the Corpus loader, the in-browser
 * embedder, and the Bridge generator.
 *
 * @param {object} [opts]
 * @param {() => Promise<any[]>} [opts.loadCorpus]
 * @param {(text: string, options?: any) => Promise<number[]>} [opts.embed]
 * @param {ReturnType<typeof fakeBridgeGenerator>} [opts.generateBridge]
 */
async function bootApp(opts = {}) {
  const dom = new JSDOM(html, { url: "https://example.test/" });
  const { window } = dom;
  // render.js reaches for a global `document`; app.js takes one by injection.
  Object.assign(/** @type {any} */ (globalThis), {
    document: window.document,
    DocumentFragment: window.DocumentFragment,
  });

  /** @type {string[]} */
  const embedCalls = [];
  const embed =
    opts.embed ??
    (async (/** @type {string} */ text) => {
      embedCalls.push(text);
      return CHALLENGE;
    });

  const generateBridge = opts.generateBridge ?? fakeBridgeGenerator();

  const app = initApp({
    document: window.document,
    loadCorpus: opts.loadCorpus ?? (async () => FIXTURE_CORPUS.map((a) => ({ ...a }))),
    embed,
    generateBridge,
  });
  await app.corpusLoaded;

  return { window, app, embedCalls, generateBridge };
}

/** @type {import("jsdom").DOMWindow} */
let window;
/** @type {import("../src/app.js").AppHandle} */
let app;
/** @type {string[]} */
let embedCalls;

beforeEach(async () => {
  ({ window, app, embedCalls } = await bootApp());
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

/** Let queued microtasks and the embed promise executor run. */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** Run a search and wait for the async pipeline to settle. */
const runSearch = async (/** @type {string} */ challenge, /** @type {string} */ homeField) => {
  typeChallenge(challenge);
  pickHomeField(homeField);
  submit();
  await app.idle();
};

test("the Home Field dropdown lists the Corpus's Fields; the button starts disabled", () => {
  const options = [...$("#home-field").querySelectorAll("option")]
    .map((o) => o.value)
    .filter(Boolean);
  assert.deepEqual(options, fieldsFromCorpus(FIXTURE_CORPUS));
  assert.equal(/** @type {HTMLButtonElement} */ ($("#search-button")).disabled, true);
  assert.ok($("#challenge"));
});

test("before the Corpus loads, the dropdown shows the fallback Field list", () => {
  const dom = new JSDOM(html, { url: "https://example.test/" });
  Object.assign(/** @type {any} */ (globalThis), {
    document: dom.window.document,
    DocumentFragment: dom.window.DocumentFragment,
  });
  // A Corpus load that never settles: the shell must still be usable.
  initApp({
    document: dom.window.document,
    loadCorpus: () => new Promise(() => {}),
    embed: async () => CHALLENGE,
    generateBridge: fakeBridgeGenerator(),
  });
  const options = [...dom.window.document.querySelectorAll("#home-field option")]
    .map((o) => /** @type {HTMLOptionElement} */ (o).value)
    .filter(Boolean);
  assert.deepEqual(options, [...FIELDS]);
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

test("a search renders a page of real Parallels grouped by Field, none in the Home Field", async () => {
  await runSearch("handling a sudden surge of users", "Technology");

  const groups = [...window.document.querySelectorAll(".field-group")];
  assert.ok(groups.length >= 2, "expected several Field groups");
  assert.equal(window.document.querySelectorAll(".parallel").length, PAGE_SIZE);

  const headings = groups.map((g) => g.querySelector(".field-group__heading")?.textContent);
  assert.equal(headings.includes("Technology"), false);

  const firstGroup = groups[0];
  assert.ok(firstGroup);
  const closeness = [...firstGroup.querySelectorAll(".parallel__closeness")].map((el) =>
    Number(el.textContent?.replace(/\D/g, "")),
  );
  assert.deepEqual(closeness, [...closeness].sort((a, b) => b - a));

  const firstCard = window.document.querySelector(".parallel");
  assert.ok(firstCard);
  assert.match(
    firstCard.querySelector(".parallel__title a")?.getAttribute("href") ?? "",
    /wikipedia\.org/,
  );
  assert.ok((firstCard.querySelector(".parallel__lead")?.textContent ?? "").length > 0);
});

test("a search reaches the in-browser embedder and never calls fetch", async () => {
  // A *search* is client-only (ADR-0001): the Challenge is embedded and ranked
  // in the browser and nothing goes to the network. Bridges do call out
  // (ADR-0004), so this is narrowed to "a search never calls fetch" — no Bridge
  // is requested here — rather than "the app never calls fetch".
  const originalFetch = /** @type {any} */ (globalThis).fetch;
  /** @type {any} */ (globalThis).fetch = () => assert.fail("a search must not call fetch");
  try {
    await runSearch("handling a sudden surge of users", "Technology");
    assert.deepEqual(embedCalls, ["handling a sudden surge of users"]);
  } finally {
    /** @type {any} */ (globalThis).fetch = originalFetch;
  }
});

test("first search shows the model-download progress bar; a later search does not", async () => {
  /** @type {(() => void)[]} */
  const releases = [];
  const slowEmbed = (/** @type {string} */ text, /** @type {any} */ options = {}) =>
    new Promise((resolve) => {
      options.onProgress?.({ status: "progress", file: "model.onnx", progress: 55 });
      releases.push(() => resolve(CHALLENGE));
    });

  ({ window, app } = await bootApp({ embed: slowEmbed }));

  typeChallenge("handling a sudden surge of users");
  pickHomeField("Technology");
  submit();
  await tick(); // let the embed promise executor run

  const status = /** @type {HTMLElement} */ ($("#model-status"));
  const bar = /** @type {HTMLProgressElement} */ ($("#model-status-bar"));
  assert.equal(status.hidden, false, "progress bar is visible while the model downloads");
  assert.equal(bar.value, 55);

  releases.shift()?.();
  await app.idle();
  assert.equal(status.hidden, true, "progress bar is hidden once the model is ready");

  // Second search: the model is ready, so no progress bar this time.
  typeChallenge("a completely different problem statement");
  pickHomeField("Mathematics");
  submit();
  await tick();
  assert.equal(status.hidden, true);
  releases.shift()?.();
  await app.idle();
});

test("'Show 6 more' fetches further Parallels and stops when the Corpus is exhausted", async () => {
  await runSearch("keeping a system stable under load", "Technology");

  const showMore = /** @type {HTMLButtonElement} */ ($("#show-more"));
  // 13 non-Technology candidates in FIXTURE_CORPUS → pages of 6, 6, 1.
  const total = FIXTURE_CORPUS.filter((a) => a.field !== "Technology").length;

  let seen = PAGE_SIZE;
  assert.equal(showMore.hidden, false);

  while (!showMore.hidden) {
    showMore.dispatchEvent(new window.Event("click"));
    await app.idle();
    seen = Math.min(seen + PAGE_SIZE, total);
    assert.equal(window.document.querySelectorAll(".parallel").length, seen);
  }

  assert.equal(seen, total);
  assert.equal(window.document.querySelectorAll(".parallel").length, total);
});

test("'Show 6 more' does not re-embed the Challenge", async () => {
  await runSearch("keeping a system stable under load", "Technology");
  assert.equal(embedCalls.length, 1);

  $("#show-more").dispatchEvent(new window.Event("click"));
  await app.idle();
  assert.equal(embedCalls.length, 1, "the second page reuses the Challenge Embedding");
});

test("a failed second search clears the stale results and hides 'Show 6 more'", async () => {
  let calls = 0;
  const embed = async (/** @type {string} */ text) => {
    calls += 1;
    if (calls === 1) return CHALLENGE;
    throw new Error("embed blew up");
  };
  ({ window, app } = await bootApp({ embed }));

  await runSearch("handling a sudden surge of users", "Technology");
  assert.equal(/** @type {HTMLButtonElement} */ ($("#show-more")).hidden, false);

  await runSearch("a completely different problem statement", "Mathematics");
  assert.equal(window.document.querySelectorAll(".parallel").length, 0);
  assert.equal(/** @type {HTMLButtonElement} */ ($("#show-more")).hidden, true);
  assert.match(/** @type {HTMLElement} */ ($("#parallels")).textContent ?? "", /went wrong/);
});

test("a second Challenge replaces the first set without reload", async () => {
  await runSearch("handling a sudden surge of users", "Technology");
  const first = [...window.document.querySelectorAll(".parallel__title")].map((el) => el.textContent);

  await runSearch("a completely different problem statement", "Health, medicine and disease");
  const second = [...window.document.querySelectorAll(".parallel__title")].map((el) => el.textContent);

  assert.notDeepEqual(first, second);
  assert.equal(window.document.querySelectorAll(".parallel").length, PAGE_SIZE);
  const fields = [...window.document.querySelectorAll(".field-group__heading")].map((h) => h.textContent);
  assert.equal(fields.includes("Health, medicine and disease"), false);
});

const pressEnter = (/** @type {string} */ sel) =>
  $(sel).dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
  );

test("Enter runs the search from the Challenge box", async () => {
  typeChallenge("handling a sudden surge of users");
  pickHomeField("Technology");
  pressEnter("#challenge");
  await app.idle();
  assert.equal(window.document.querySelectorAll(".parallel").length, PAGE_SIZE);
});

test("Enter runs the search from the Home Field dropdown", async () => {
  typeChallenge("handling a sudden surge of users");
  pickHomeField("Technology");
  pressEnter("#home-field");
  await app.idle();
  assert.equal(window.document.querySelectorAll(".parallel").length, PAGE_SIZE);
});

test("the Challenge is trimmed and length-capped on search", async () => {
  const input = /** @type {HTMLTextAreaElement} */ ($("#challenge"));
  typeChallenge("   surge   of   users   " + "x".repeat(400));
  pickHomeField("Technology");
  submit();
  await app.idle();
  assert.equal(input.value.length <= 300, true);
  assert.equal(input.value.startsWith("surge"), true);
});

test("with corpus.json absent, the app shows an explicit build-the-Corpus message", async () => {
  ({ window, app } = await bootApp({
    loadCorpus: async () => {
      throw new CorpusMissingError("corpus.json is missing. Run `npm run build`.");
    },
  }));

  const region = /** @type {HTMLElement} */ ($("#parallels"));
  assert.match(region.textContent ?? "", /npm run build/);
  assert.equal(/** @type {HTMLButtonElement} */ ($("#search-button")).disabled, true);

  // Even if the person forces a search, it stays a message, not a crash.
  typeChallenge("handling a sudden surge of users");
  pickHomeField("Technology");
  submit();
  await app.idle();
  assert.match(region.textContent ?? "", /npm run build/);
  assert.equal(window.document.querySelectorAll(".parallel").length, 0);
});

test("the CC BY-SA attribution notice is on the page", () => {
  assert.match($(".colophon").textContent ?? "", /CC BY-SA/);
});

test("the search page links to the settings page", () => {
  const hrefs = [...window.document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  assert.ok(
    hrefs.some((h) => /(^|\/)settings\.html$/.test(h ?? "")),
    "a link to settings.html",
  );
});

/* Bridge ------------------------------------------------------------------- */

/** The nth Parallel card on the page (default first). */
const cardAt = (n = 0) => {
  const card = window.document.querySelectorAll(".parallel")[n];
  assert.ok(card, `no card ${n}`);
  return card;
};

/** Click the "ask for a Bridge" control on the nth Parallel card (default first). */
const clickBridge = (n = 0) => {
  const button = cardAt(n).querySelector(".parallel__bridge-button");
  assert.ok(button, "no Bridge control on the card");
  button.dispatchEvent(new window.Event("click", { bubbles: true }));
};

test("every Parallel card carries a control that asks for a Bridge", async () => {
  await runSearch("handling a sudden surge of users", "Technology");
  const cards = [...window.document.querySelectorAll(".parallel")];
  assert.equal(cards.length, PAGE_SIZE);
  for (const card of cards) {
    assert.ok(card.querySelector(".parallel__bridge-button"), "each card has the control");
  }
});

test("clicking the control shows a pending state until the Bridge arrives", async () => {
  let release = () => {};
  const slow = fakeBridgeGenerator("never");
  // Swap in a generator we control: pending until we resolve it.
  const controlled = Object.assign(
    (/** @type {any} */ request) => {
      slow.calls.push(request);
      return new Promise((resolve) => {
        release = () => resolve(CANNED_BRIDGE);
      });
    },
    { calls: slow.calls },
  );
  ({ window, app } = await bootApp({ generateBridge: /** @type {any} */ (controlled) }));

  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge();
  await tick();

  const card = window.document.querySelector(".parallel");
  assert.match(card?.textContent ?? "", /Building a Bridge/);
  assert.equal(card?.querySelector(".parallel__bridge-button"), null, "the control is gone while pending");

  release();
  await app.bridgesSettled();
  assert.doesNotMatch(window.document.querySelector(".parallel")?.textContent ?? "", /Building a Bridge/);
});

test("a Bridge renders its summary as a paragraph, its correspondences as a list, and the AI-generated line", async () => {
  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge();
  await app.bridgesSettled();

  const card = window.document.querySelector(".parallel");
  assert.ok(card);
  const summary = card.querySelector(".parallel__bridge-summary");
  assert.equal(summary?.tagName, "P");
  assert.match(summary?.textContent ?? "", /keep a system serving demand/);

  const items = [...card.querySelectorAll(".parallel__bridge-correspondences li")];
  assert.equal(items.length, 2);
  assert.match(items[0]?.textContent ?? "", /your users ↔ the body's cells/);

  const note = card.querySelector(".parallel__bridge-note");
  assert.match(note?.textContent ?? "", /AI/);
  assert.match(note?.textContent ?? "", /lead section/i);
  assert.match(note?.textContent ?? "", /check it against the article/i);
});

test("a loose Bridge is marked loose but still renders its correspondences", async () => {
  const loose = fakeBridgeGenerator({
    strength: "loose",
    summary: "Only the vocabulary of 'networks' really carries over.",
    correspondences: [{ challenge: "your servers", subject: "the nerve cells" }],
  });
  ({ window, app } = await bootApp({ generateBridge: loose }));

  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge();
  await app.bridgesSettled();

  const card = window.document.querySelector(".parallel");
  assert.ok(card, "a card is on the page");
  assert.ok(card.querySelector(".parallel__bridge-strength--loose"), "the card marks the Bridge loose");
  assert.match(card.textContent ?? "", /Only the vocabulary/);
  const items = [...card.querySelectorAll(".parallel__bridge-correspondences li")];
  assert.equal(items.length, 1, "a loose Bridge is still a Bridge — no dead-end card");
  assert.ok(card.querySelector(".parallel__bridge-note"), "generated-text line stays on a loose Bridge");
});

test("a strong Bridge carries no Strength marker", async () => {
  ({ window, app } = await bootApp({ generateBridge: fakeBridgeGenerator() }));

  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge();
  await app.bridgesSettled();

  const card = window.document.querySelector(".parallel");
  assert.equal(card?.querySelector(".parallel__bridge-strength"), null);
});

test("the generator is asked for the clicked Parallel with the Challenge, and not the Home Field", async () => {
  const gen = fakeBridgeGenerator();
  ({ window, app } = await bootApp({ generateBridge: gen }));

  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge();
  await app.bridgesSettled();

  assert.equal(gen.calls.length, 1);
  const [request] = gen.calls;
  assert.deepEqual(Object.keys(request ?? {}).sort(), ["challenge", "parallel"]);
  assert.equal(request?.challenge, "handling a sudden surge of users");
  assert.ok(request?.parallel.title);
  // The Home Field never reaches the generator: it is not on the request at all.
  // (What the *prompt* carries is asserted in test/bridge.test.js.)
});

test("'Show 6 more' does not wipe an open Bridge", async () => {
  await runSearch("keeping a system stable under load", "Technology");
  clickBridge();
  await app.bridgesSettled();
  assert.match(window.document.querySelector(".parallel")?.textContent ?? "", /keep a system serving demand/);

  const firstUrl = window.document.querySelector(".parallel__title a")?.getAttribute("href");
  $("#show-more").dispatchEvent(new window.Event("click"));
  await app.idle();

  const stillThere = [...window.document.querySelectorAll(".parallel")].find(
    (c) => c.querySelector(".parallel__title a")?.getAttribute("href") === firstUrl,
  );
  assert.match(stillThere?.textContent ?? "", /keep a system serving demand/, "the Bridge survived the repaint");
});

test("two cards can hold a Bridge at the same time", async () => {
  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge(0);
  clickBridge(1);
  await app.bridgesSettled();

  const cards = [...window.document.querySelectorAll(".parallel")];
  assert.match(cards[0]?.textContent ?? "", /keep a system serving demand/);
  assert.match(cards[1]?.textContent ?? "", /keep a system serving demand/);
});

test("a new search clears the Bridges from the previous one", async () => {
  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge();
  await app.bridgesSettled();
  assert.match(window.document.querySelector(".parallel")?.textContent ?? "", /keep a system serving demand/);

  await runSearch("a completely different problem statement", "Mathematics");
  for (const card of window.document.querySelectorAll(".parallel")) {
    assert.doesNotMatch(card.textContent ?? "", /keep a system serving demand/);
    assert.ok(card.querySelector(".parallel__bridge-button"), "the fresh cards are back to just the control");
  }
});

/* Bridge failures (issue #15) ---------------------------------------------- */

/** The Bridge area of the nth Parallel card (default first). */
const bridgeArea = (n = 0) => {
  const area = cardAt(n).querySelector(".parallel__bridge");
  assert.ok(area, `no Bridge area on card ${n}`);
  return area;
};

test("a failed Bridge shows one message with a retry control, and keeps the Parallels", async () => {
  const failing = fakeBridgeGenerator(new Error("401 invalid x-api-key"));
  ({ window, app } = await bootApp({ generateBridge: failing }));

  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge();
  await app.bridgesSettled();

  const area = bridgeArea();
  const message = area.querySelector(".parallel__bridge-error");
  assert.ok(message, "the failure renders one message");
  assert.match(message.textContent ?? "", /Bridge/);
  assert.ok(area.querySelector(".parallel__bridge-button"), "the message offers a retry control");
  assert.equal(area.querySelector(".parallel__bridge-summary"), null, "no half-rendered Bridge");

  // The Parallels are untouched and a second search runs fine.
  assert.equal(window.document.querySelectorAll(".parallel").length, PAGE_SIZE);
  await runSearch("keeping a system stable under load", "Technology");
  assert.equal(window.document.querySelectorAll(".parallel").length, PAGE_SIZE);
});

test("every failure renders the same message, whatever went wrong", async () => {
  // Two unrelated failures — a missing key and an unparseable reply — on two
  // cards. The person sees one message, not a per-case variant.
  const failing = fakeBridgeGenerator([
    new Error("No Anthropic API key is stored [marker-no-key]."),
    new Error("The model’s response was not valid JSON [marker-parse]."),
  ]);
  ({ window, app } = await bootApp({ generateBridge: failing }));

  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge(0);
  clickBridge(1);
  await app.bridgesSettled();

  const first = bridgeArea(0).querySelector(".parallel__bridge-error")?.textContent;
  const second = bridgeArea(1).querySelector(".parallel__bridge-error")?.textContent;
  assert.ok(first);
  assert.equal(first, second);
  // Neither error's own words leak into the card.
  assert.doesNotMatch(first ?? "", /marker-/);
});

test("the failure message names the settings page as text, not as a link", async () => {
  ({ window, app } = await bootApp({ generateBridge: fakeBridgeGenerator(new Error("boom")) }));

  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge();
  await app.bridgesSettled();

  const area = bridgeArea();
  assert.match(area.textContent ?? "", /settings page/i);
  assert.equal(area.querySelector("a"), null, "the Bridge area holds no link");
});

test("retrying after a failure asks again and renders the Bridge that comes back", async () => {
  const flaky = fakeBridgeGenerator([new Error("rate limited"), CANNED_BRIDGE]);
  ({ window, app } = await bootApp({ generateBridge: flaky }));

  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge();
  await app.bridgesSettled();
  assert.equal(flaky.calls.length, 1);

  clickBridge(); // the retry control sits where the "ask" control was
  await app.bridgesSettled();

  assert.equal(flaky.calls.length, 2, "the retry asks the generator again");
  const area = bridgeArea();
  assert.equal(area.querySelector(".parallel__bridge-error"), null, "the message is gone");
  assert.match(area.textContent ?? "", /keep a system serving demand/);
  assert.equal(area.querySelectorAll(".parallel__bridge-correspondences li").length, 2);
});

test("a retry that comes back loose renders the loose Bridge, not the message", async () => {
  // The retry renders whatever the second attempt returns, and a loose Bridge is
  // an outcome like any other (ADR-0005) — not a second kind of failure.
  const flaky = fakeBridgeGenerator([
    new Error("network down"),
    {
      strength: "loose",
      summary: "Only the vocabulary of 'networks' really carries over.",
      correspondences: [{ challenge: "your servers", subject: "the nerve cells" }],
    },
  ]);
  ({ window, app } = await bootApp({ generateBridge: flaky }));

  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge();
  await app.bridgesSettled();
  clickBridge();
  await app.bridgesSettled();

  const area = bridgeArea();
  assert.equal(area.querySelector(".parallel__bridge-error"), null);
  assert.ok(area.querySelector(".parallel__bridge-strength--loose"), "marked loose");
  assert.match(area.textContent ?? "", /Only the vocabulary/);
  assert.equal(area.querySelectorAll(".parallel__bridge-correspondences li").length, 1);
});

test("a retry that fails again shows the same message and can be retried once more", async () => {
  const failing = fakeBridgeGenerator(new Error("still down"));
  ({ window, app } = await bootApp({ generateBridge: failing }));

  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge();
  await app.bridgesSettled();
  const first = bridgeArea().querySelector(".parallel__bridge-error")?.textContent;

  clickBridge();
  await app.bridgesSettled();

  assert.equal(failing.calls.length, 2);
  const area = bridgeArea();
  assert.equal(area.querySelector(".parallel__bridge-error")?.textContent, first);
  assert.ok(area.querySelector(".parallel__bridge-button"), "the retry control is still offered");
});

test("with no key stored, search, 'Show 6 more' and Lead Sections all behave normally", async () => {
  // A browser with no key: every generation rejects, exactly as main.js arranges.
  const noKey = fakeBridgeGenerator(new Error("No Anthropic API key is stored."));
  ({ window, app } = await bootApp({ generateBridge: noKey }));

  await runSearch("keeping a system stable under load", "Technology");
  assert.equal(window.document.querySelectorAll(".parallel").length, PAGE_SIZE);
  for (const lead of window.document.querySelectorAll(".parallel__lead")) {
    assert.ok((lead.textContent ?? "").length > 0, "every card still shows its Lead Section");
  }

  clickBridge();
  await app.bridgesSettled();

  $("#show-more").dispatchEvent(new window.Event("click"));
  await app.idle();
  assert.equal(window.document.querySelectorAll(".parallel").length, PAGE_SIZE * 2);
  assert.ok(
    bridgeArea().querySelector(".parallel__bridge-error"),
    "the failed card survives the repaint as a failed card",
  );

  // And a fresh search still works.
  await runSearch("a completely different problem statement", "Mathematics");
  assert.equal(window.document.querySelectorAll(".parallel").length, PAGE_SIZE);
});

/* Bridge lifecycle and concurrency (issue #16) ----------------------------- */

/** Click the collapse/expand control on the nth Parallel card (default first). */
const clickBridgeToggle = (n = 0) => {
  const button = cardAt(n).querySelector(".parallel__bridge-toggle");
  assert.ok(button, "no collapse control on the card");
  button.dispatchEvent(new window.Event("click", { bubbles: true }));
};

test("collapsing a Bridge and opening it again never asks the generator twice", async () => {
  const gen = fakeBridgeGenerator();
  ({ window, app } = await bootApp({ generateBridge: gen }));

  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge();
  await app.bridgesSettled();
  assert.equal(gen.calls.length, 1);
  assert.match(bridgeArea().textContent ?? "", /keep a system serving demand/);

  clickBridgeToggle();
  assert.equal(
    bridgeArea().querySelector(".parallel__bridge-summary"),
    null,
    "collapsed: the Bridge is off the card",
  );

  clickBridgeToggle();
  await app.bridgesSettled();
  assert.match(bridgeArea().textContent ?? "", /keep a system serving demand/);
  assert.equal(
    bridgeArea().querySelectorAll(".parallel__bridge-correspondences li").length,
    2,
    "the whole Bridge came back, not a fragment",
  );
  assert.equal(gen.calls.length, 1, "re-expanding costs neither a wait nor a paid request");
});

test("a collapsed Bridge stays collapsed through a 'Show 6 more' repaint", async () => {
  await runSearch("keeping a system stable under load", "Technology");
  clickBridge();
  await app.bridgesSettled();
  clickBridgeToggle();

  const url = cardAt().querySelector(".parallel__title a")?.getAttribute("href");
  $("#show-more").dispatchEvent(new window.Event("click"));
  await app.idle();

  const card = [...window.document.querySelectorAll(".parallel")].find(
    (c) => c.querySelector(".parallel__title a")?.getAttribute("href") === url,
  );
  assert.ok(card, "the card is still on the page");
  assert.equal(card.querySelector(".parallel__bridge-summary"), null, "still collapsed");
  assert.ok(card.querySelector(".parallel__bridge-toggle"), "and can still be opened again");
});

test("two Bridges generate at the same time, each landing in its own card", async () => {
  const gen = controlledBridgeGenerator();
  ({ window, app } = await bootApp({ generateBridge: gen }));

  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge(0);
  clickBridge(1);
  await tick();

  assert.equal(gen.calls.length, 2, "both cards asked, neither waiting on the other");
  assert.match(bridgeArea(0).textContent ?? "", /Building a Bridge/);
  assert.match(bridgeArea(1).textContent ?? "", /Building a Bridge/);

  // Settle out of order: each Bridge belongs to its own card, not to the queue.
  gen.settle(1, { ...CANNED_BRIDGE, summary: "The second card's Bridge." });
  gen.settle(0, { ...CANNED_BRIDGE, summary: "The first card's Bridge." });
  await app.bridgesSettled();

  assert.match(bridgeArea(0).textContent ?? "", /The first card's Bridge/);
  assert.doesNotMatch(bridgeArea(0).textContent ?? "", /The second card's Bridge/);
  assert.match(bridgeArea(1).textContent ?? "", /The second card's Bridge/);
});

test("a new search runs while a Bridge is still generating, and is not delayed by it", async () => {
  const gen = controlledBridgeGenerator();
  ({ window, app } = await bootApp({ generateBridge: gen }));

  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge();
  await tick();
  assert.match(bridgeArea().textContent ?? "", /Building a Bridge/);

  // The generation is never settled. If Bridges shared the search chain this
  // would hang instead of rendering the new Parallels.
  await runSearch("a completely different problem statement", "Mathematics");

  assert.equal(window.document.querySelectorAll(".parallel").length, PAGE_SIZE);
  assert.equal(gen.calls.length, 1, "the abandoned generation was not retried");
  for (const card of window.document.querySelectorAll(".parallel")) {
    assert.doesNotMatch(card.textContent ?? "", /Building a Bridge/);
  }
});

test("a Bridge that arrives after a new search never renders into the new set", async () => {
  const gen = controlledBridgeGenerator();
  ({ window, app } = await bootApp({ generateBridge: gen }));

  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge();
  await tick();

  await runSearch("a completely different problem statement", "Mathematics");
  // The orphan lands after its card is gone.
  gen.settle(0, { ...CANNED_BRIDGE, summary: "A Bridge for the Challenge you replaced." });
  await app.bridgesSettled();

  for (const card of window.document.querySelectorAll(".parallel")) {
    assert.doesNotMatch(card.textContent ?? "", /Challenge you replaced/);
    assert.ok(card.querySelector(".parallel__bridge-button"), "every fresh card is back to the ask control");
  }
});

test("a Bridge is never written to browser storage", async () => {
  await runSearch("handling a sudden surge of users", "Technology");
  clickBridge();
  await app.bridgesSettled();
  assert.match(bridgeArea().textContent ?? "", /keep a system serving demand/);

  // The claim is about Bridges, not about the app storing nothing at all — the
  // settings page legitimately stores a key. So look for the Bridge's own words
  // in everything either store holds.
  const stored = [window.localStorage, window.sessionStorage].flatMap((store) =>
    Array.from({ length: store.length }, (_, i) => store.getItem(store.key(i) ?? "") ?? ""),
  );
  for (const value of stored) {
    assert.doesNotMatch(value, /keep a system serving demand/, "no Bridge text reaches storage");
  }
});
