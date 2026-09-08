/**
 * `createBridgeClient()` — the real client the Bridge generator calls, kept out
 * of `bridge.js` so that module stays testable without the vendor SDK.
 *
 * It imports the official `@anthropic-ai/sdk` from a CDN at a pinned version —
 * the same shape `src/embedder.js` uses to import transformers.js — and
 * constructs a client with `dangerouslyAllowBrowser` enabled, because the key is
 * the person's own and the call goes straight from their browser to Anthropic
 * (ADR-0004). This is the one place WikiParallel's data leaves the machine.
 *
 * Not unit-tested: a passthrough to a third-party SDK loaded over the network.
 * `src/bridge.js` takes `createClient` as an injected dependency so the whole
 * feature is testable with a fake.
 */

/**
 * The `@anthropic-ai/sdk` version the browser loads from the CDN. It is not an
 * npm dependency (the SDK is only used browser-side), so this is the only place
 * it is pinned — bump it deliberately, and re-check that this version accepts
 * the `output_config.format` envelope in `bridge.js` and the browser-access
 * flag below.
 */
export const ANTHROPIC_SDK_VERSION = "0.68.0";

/** ESM entry for that version on jsDelivr. */
export const ANTHROPIC_SDK_URL = `https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@${ANTHROPIC_SDK_VERSION}/+esm`;

/** @typedef {import("./bridge.js").BridgeClient} BridgeClient */

/** Load the CDN module once, then reuse it for every client. */
let sdkCtorPromise;
const loadSdkCtor = () => {
  sdkCtorPromise ??= import(ANTHROPIC_SDK_URL).then(
    (mod) => /** @type {new (opts: object) => any} */ (mod.default),
  );
  return sdkCtorPromise;
};

/**
 * Build a {@link BridgeClient} bound to `apiKey`. The SDK module loads lazily on
 * the first Bridge request and is reused after that.
 *
 * @param {string} apiKey  The person's Anthropic API key.
 * @returns {BridgeClient}
 */
export function createBridgeClient(apiKey) {
  return {
    messages: {
      create: async (/** @type {object} */ params) => {
        const Anthropic = await loadSdkCtor();
        const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
        return client.messages.create(params);
      },
    },
  };
}
