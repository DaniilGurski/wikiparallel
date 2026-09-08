/**
 * Settings page: store the Anthropic API key that Bridges are generated with, or
 * forget it. Kept off the search screen so that screen stays uncluttered.
 *
 * The key lives in `localStorage` (ADR-0004, issue #12) so it survives a reload;
 * `sessionStorage` was rejected because a settings page that forgets every visit
 * has no reason to exist. Nothing here consumes the key yet — the Bridge
 * generator (issue #14) reads it back from the same place via {@link readApiKey}.
 */

/** The `localStorage` key under which the Anthropic API key is held. */
export const API_KEY_STORAGE_KEY = "wikiparallel:anthropic-api-key";

/**
 * The slice of the Web Storage API this module needs. `localStorage` satisfies
 * it; tests pass a stand-in so they never touch a real browser store.
 * @typedef {Pick<Storage, "getItem" | "setItem" | "removeItem">} KeyStorage
 */

/** @returns {KeyStorage} */
function browserStorage() {
  return /** @type {KeyStorage} */ (globalThis.localStorage);
}

/**
 * The Anthropic API key currently stored, or `""` when none is.
 * @param {KeyStorage} [storage]  Injected for tests; defaults to `localStorage`.
 * @returns {string}
 */
export function readApiKey(storage = browserStorage()) {
  return storage.getItem(API_KEY_STORAGE_KEY) ?? "";
}

/**
 * Wire the settings page: show any stored key, save a trimmed key on submit,
 * and let the "Forget key" control erase it. The forget control is disabled
 * while there is nothing to forget.
 *
 * @param {object} deps
 * @param {Document} deps.document
 * @param {KeyStorage} [deps.storage]  Injected for tests; defaults to `localStorage`.
 */
export function initSettings({ document, storage = browserStorage() }) {
  const form = /** @type {HTMLFormElement} */ (document.getElementById("api-key-form"));
  const input = /** @type {HTMLInputElement} */ (document.getElementById("api-key"));
  const forgetButton = /** @type {HTMLButtonElement} */ (document.getElementById("forget-key"));
  const status = /** @type {HTMLElement} */ (document.getElementById("settings-status"));

  input.value = readApiKey(storage);
  syncForgetButton();

  function syncForgetButton() {
    forgetButton.disabled = readApiKey(storage) === "";
  }

  /** @param {string} message */
  function announce(message) {
    status.textContent = message;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const key = input.value.trim();
    input.value = key;
    if (key === "") {
      storage.removeItem(API_KEY_STORAGE_KEY);
      announce("No key stored. Bridges stay disabled until you add one.");
    } else {
      storage.setItem(API_KEY_STORAGE_KEY, key);
      announce("Key saved in this browser.");
    }
    syncForgetButton();
  });

  forgetButton.addEventListener("click", () => {
    storage.removeItem(API_KEY_STORAGE_KEY);
    input.value = "";
    announce("Key forgotten. Bridges are disabled until you add a key.");
    syncForgetButton();
  });
}
