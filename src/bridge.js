/**
 * The Bridge generator: given a Challenge and one Parallel, ask a hosted model
 * for a Bridge — the shared structure between the two — and parse the answer
 * into a discriminated result before anything else sees it (issue #14,
 * ADR-0004).
 *
 * The model is given the Challenge and the Parallel's title, Field, Lead Section
 * and section headings. It is deliberately **not** given the Home Field (which
 * hands a people-pleasing model a template to fill in) or the Closeness (which
 * would anchor the weak/strong call on the number that already forced this
 * article in). `generateBridge`'s input carries neither, so there is nothing to
 * leak.
 *
 * The client is injected: {@link createBridgeGenerator} takes a `createClient`
 * dependency and never imports the vendor SDK, so tests drive it with a fake and
 * never touch the network. The browser entry point composes the real client
 * from the stored key, the same way it composes the embedder.
 */

/** @typedef {import("./search.js").Parallel} Parallel */

/**
 * One correspondence in a Bridge: a concrete element of the Challenge paired
 * with the matching element of the article's subject.
 *
 * @typedef {object} Correspondence
 * @property {string} challenge  Something from the Challenge.
 * @property {string} subject    The matching thing from the article's subject.
 */

/**
 * The parsed result the rest of the app sees. A discriminated union: a `bridge`
 * renders a summary paragraph and a list of correspondences; a `weak` verdict
 * renders a short "no real parallel here" message and nothing else. The weak
 * verdict replaces the Bridge; it never decorates one.
 *
 * @typedef {{ kind: "bridge", summary: string, correspondences: Correspondence[] }
 *   | { kind: "weak", reason: string }} BridgeResult
 */

/**
 * The slice of the Anthropic SDK client this module uses: a `messages.create`
 * that takes request params and resolves to a message with `content` blocks.
 * The real client satisfies it; tests pass a fake.
 *
 * @typedef {object} BridgeClient
 * @property {{ create: (params: object) => Promise<any> }} messages
 */

/**
 * @typedef {object} BridgeGeneratorDeps
 * @property {() => BridgeClient} createClient  Builds a client per request, so a
 *   key changed on the settings page takes effect without a reload.
 */

/**
 * @typedef {object} BridgeRequest
 * @property {string} challenge   The person's Challenge, as searched.
 * @property {Parallel} parallel  The one Parallel to bridge to.
 */

/** The model that writes Bridges (issue #12, ADR-0004). */
export const BRIDGE_MODEL = "claude-opus-5";

/**
 * The system prompt. Kept here, not in the app, because prompt assembly is this
 * module's job and nobody else's.
 */
const SYSTEM_PROMPT = [
  "You compare a person's Challenge with one Wikipedia article and describe the",
  "shared structure between them — if there is one.",
  "",
  "A Bridge is one sentence naming the underlying problem that both the Challenge",
  "and the article's subject describe, plus two or three correspondences. Each",
  "correspondence pairs one concrete element of the Challenge with one concrete",
  "element of the article's subject.",
  "",
  "If the two share no real underlying structure — if the only link is loose",
  "wording or a shared topic — do not invent a Bridge. Return a weak verdict with",
  "a one-sentence reason instead. A weak verdict replaces the Bridge; never return",
  "a Bridge you have hedged as weak.",
  "",
  "Reply with a single JSON object and nothing else. For a Bridge:",
  '  {"kind":"bridge","summary":"...","correspondences":[{"challenge":"...","subject":"..."}]}',
  "For a weak verdict:",
  '  {"kind":"weak","reason":"..."}',
].join("\n");

/**
 * The JSON Schema the model answers under. One flat object with a `kind` field:
 * structured output does not carry a discriminated union cleanly, so the union
 * is reconstructed by {@link parseBridgeResult} after the response arrives — the
 * schema is a hint, not something this module trusts.
 *
 * The exact `output_config.format` envelope and the SDK version that accepts it
 * must be checked against the live Anthropic docs before a demo (ADR-0004 says
 * as much for the browser flag). If the envelope is wrong the request is
 * rejected outright; if the SDK simply ignores it, the system prompt still asks
 * for this shape and {@link parseBridgeResult} still copes.
 */
const BRIDGE_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["bridge", "weak"] },
    summary: {
      type: "string",
      description: "For a bridge: one sentence naming the shared underlying problem.",
    },
    correspondences: {
      type: "array",
      description: "For a bridge: two or three Challenge ↔ subject pairings.",
      items: {
        type: "object",
        properties: {
          challenge: { type: "string" },
          subject: { type: "string" },
        },
        required: ["challenge", "subject"],
        additionalProperties: false,
      },
    },
    reason: {
      type: "string",
      description: "For a weak verdict: one sentence on why there is no real parallel.",
    },
  },
  required: ["kind"],
  additionalProperties: false,
};

/** The structured-output envelope passed as `output_config.format`. */
const RESPONSE_FORMAT = { type: "json_schema", name: "bridge", schema: BRIDGE_SCHEMA };

/**
 * Build the request params for one Bridge. Split out so a test can assert what
 * the model is and is not told without a live client.
 *
 * @param {BridgeRequest} request
 * @returns {{ model: string, max_tokens: number, system: string,
 *   output_config: object, messages: { role: string, content: string }[] }}
 */
export function buildBridgeRequest({ challenge, parallel }) {
  const headings =
    parallel.headings.length > 0 ? parallel.headings.join("; ") : "(none listed)";

  const userText = [
    `Challenge:\n${challenge}`,
    "",
    "Wikipedia article:",
    `Title: ${parallel.title}`,
    `Field: ${parallel.field}`,
    `Section headings: ${headings}`,
    "",
    `Lead section:\n${parallel.leadSection}`,
  ].join("\n");

  return {
    // Opus 5 runs adaptive thinking by default and those tokens count against
    // max_tokens, so this is well clear of the few hundred a low-effort Bridge
    // needs rather than a tight fit that could truncate the JSON.
    model: BRIDGE_MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    output_config: { effort: "low", format: RESPONSE_FORMAT },
    messages: [{ role: "user", content: userText }],
  };
}

/**
 * Pull the JSON object out of a Messages API response and narrow it to a
 * {@link BridgeResult}. A well-formed response becomes a Bridge or a weak
 * verdict; anything else throws, so the card shows a failure rather than a
 * half-rendered Bridge.
 *
 * @param {any} message
 * @returns {BridgeResult}
 */
export function parseBridgeResult(message) {
  /** @type {any[]} */
  const blocks = Array.isArray(message?.content) ? message.content : [];
  const text = blocks
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("")
    .trim();

  if (!text) throw new Error("The model returned an empty response.");

  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("The model’s response was not valid JSON.");
  }

  if (!raw || typeof raw !== "object") {
    throw new Error("The model’s response was not an object.");
  }

  if (raw.kind === "weak") {
    return {
      kind: "weak",
      reason: typeof raw.reason === "string" ? raw.reason.trim() : "",
    };
  }

  if (raw.kind === "bridge") {
    const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
    /** @type {any[]} */
    const rawPairs = Array.isArray(raw.correspondences) ? raw.correspondences : [];
    const correspondences = rawPairs
      .map((pair) => ({
        challenge: typeof pair?.challenge === "string" ? pair.challenge.trim() : "",
        subject: typeof pair?.subject === "string" ? pair.subject.trim() : "",
      }))
      .filter((pair) => pair.challenge !== "" && pair.subject !== "");

    if (summary === "" || correspondences.length === 0) {
      throw new Error("The model’s Bridge had no summary or no correspondences.");
    }
    return { kind: "bridge", summary, correspondences };
  }

  throw new Error("The model’s response named neither a Bridge nor a weak verdict.");
}

/**
 * Build the Bridge generator: `generateBridge(request)` resolves to a
 * {@link BridgeResult} or rejects. It creates a client per call (so a key
 * changed on the settings page is picked up), sends one request, and parses the
 * reply.
 *
 * @param {BridgeGeneratorDeps} deps
 * @returns {(request: BridgeRequest) => Promise<BridgeResult>}
 */
export function createBridgeGenerator({ createClient }) {
  return async function generateBridge(request) {
    const client = createClient();
    const message = await client.messages.create(buildBridgeRequest(request));
    return parseBridgeResult(message);
  };
}
