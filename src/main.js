import { normalizeChallenge, challengeReady } from "./challenge.js";
import { PAGE_SIZE } from "./grouping.js";
import { search } from "./search.js";
import { rankParallels, pageView } from "./parallels.js";
import { populateHomeFieldOptions, renderGroups } from "./render.js";

/** @typedef {import("./search.js").Parallel} Parallel */

const form = /** @type {HTMLFormElement} */ (document.getElementById("search-form"));
const challengeInput = /** @type {HTMLTextAreaElement} */ (document.getElementById("challenge"));
const homeFieldSelect = /** @type {HTMLSelectElement} */ (document.getElementById("home-field"));
const searchButton = /** @type {HTMLButtonElement} */ (document.getElementById("search-button"));
const parallelsRegion = /** @type {HTMLElement} */ (document.getElementById("parallels"));
const emptyNote = /** @type {HTMLParagraphElement} */ (document.getElementById("parallels-empty"));
const showMoreButton = /** @type {HTMLButtonElement} */ (document.getElementById("show-more"));

/** @type {{ ranked: Parallel[], visibleCount: number }} */
const state = { ranked: [], visibleCount: 0 };

populateHomeFieldOptions(homeFieldSelect);

function syncSearchButton() {
  searchButton.disabled = !challengeReady({
    challenge: challengeInput.value,
    homeField: homeFieldSelect.value,
  });
}

function paint() {
  const view = pageView(state.ranked, state.visibleCount);
  renderGroups(parallelsRegion, view.groups);
  showMoreButton.hidden = !view.hasMore;
}

function runSearch() {
  const challenge = normalizeChallenge(challengeInput.value);
  challengeInput.value = challenge;
  if (!challengeReady({ challenge, homeField: homeFieldSelect.value })) return;

  emptyNote.remove();
  parallelsRegion.setAttribute("aria-busy", "true");
  state.ranked = rankParallels(search(challenge, homeFieldSelect.value));
  state.visibleCount = PAGE_SIZE;
  paint();
  parallelsRegion.setAttribute("aria-busy", "false");
}

challengeInput.addEventListener("input", syncSearchButton);
homeFieldSelect.addEventListener("change", syncSearchButton);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runSearch();
});

// Enter runs the search from either control. The textarea would otherwise
// insert a newline (Shift+Enter still does); the select would otherwise do
// nothing in some browsers.
form.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || event.shiftKey) return;
  const target = event.target;
  if (target === challengeInput || target === homeFieldSelect) {
    event.preventDefault();
    runSearch();
  }
});

showMoreButton.addEventListener("click", () => {
  state.visibleCount += PAGE_SIZE;
  paint();
});

syncSearchButton();
