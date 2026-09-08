import { initApp } from "./app.js";
import { loadCorpus } from "./corpus.js";
import { createEmbedder } from "./embedder.js";
import { createBridgeGenerator } from "./bridge.js";
import { createBridgeClient } from "./anthropic-client.js";
import { readApiKey } from "./settings.js";

/**
 * Browser entry point: hand {@link initApp} the real Corpus loader, the real
 * in-browser embedder, and the real Bridge generator. Everything testable lives
 * in `app.js` and its seams.
 *
 * The Bridge generator reads the stored key fresh on every request, so a key
 * added or changed on the settings page takes effect without a reload — and a
 * key added after a failed Bridge makes the card's retry succeed. The app never
 * sees the key: a missing one is thrown here and surfaces as a failed Bridge,
 * indistinguishable from any other failure, which is why the card's one message
 * names the settings page (issue #15). Nothing reads the thrown message — the
 * card writes its own — so it exists only to name the cause in a debugger.
 */
const embedder = createEmbedder();

const generateBridge = createBridgeGenerator({
  createClient: () => {
    const apiKey = readApiKey();
    if (apiKey === "") {
      throw new Error("No Anthropic API key is stored. Add one on the settings page.");
    }
    return createBridgeClient(apiKey);
  },
});

initApp({
  document,
  loadCorpus: () => loadCorpus(),
  embed: (text, options) => embedder.embed(text, options),
  generateBridge,
});
