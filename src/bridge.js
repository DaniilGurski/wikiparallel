/**
 * The Bridge generator: given a Challenge and one Parallel, ask a hosted model
 * for a Bridge — the shared structure between the two, and how far that
 * structure actually holds — and parse the answer into a single result shape
 * before anything else sees it (issue #14, ADR-0004, ADR-0005).
 *
 * The model is given the Challenge and the Parallel's title, Field, Lead Section
 * and section headings. It is deliberately **not** given the Home Field (which
 * hands a people-pleasing model a template to fill in) or the Closeness (which
 * would anchor the loose/strong call on the number that already forced this
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
 * How far the Bridge's shared structure actually holds. `strong` means the two
 * share a real underlying mechanism; `loose` means the link is partial or rests
 * on a shared topic rather than a shared mechanism. Most Bridges are `loose`,
 * and that is a useful answer rather than a failed one (ADR-0005).
 *
 * @typedef {"strong" | "loose"} BridgeStrength
 */

/**
 * The parsed result the rest of the app sees. One shape, always: every Bridge
 * carries a summary, its correspondences, and the Strength saying how far the
 * shared structure holds. There is no refusal — a Bridge the model thinks little
 * of still shows its reasoning, marked `loose`, rather than becoming a dead end.
 *
 * @typedef {object} BridgeResult
 * @property {BridgeStrength} strength
 * @property {string} summary
 * @property {Correspondence[]} correspondences
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
  "You compare a person's Challenge with one Wikipedia article and describe what",
  "the person could borrow from that article.",
  "",
  "Always produce a Bridge: one sentence naming the underlying problem that both",
  "the Challenge and the article's subject face, plus two or three",
  "correspondences. Each correspondence pairs one concrete element of the",
  "Challenge with one concrete element of the article's subject.",
  "",
  "Then judge your own Bridge and label how far its shared structure holds:",
  '  "strong" — the two share a real underlying mechanism, and the',
  "    correspondences hold up under scrutiny.",
  '  "loose"  — the shared structure is partial, or rests on a shared topic or',
  "    shared wording rather than a shared mechanism. Say so plainly in the",
  "    summary instead of overselling it, and still give the correspondences: a",
  "    loose Bridge is a starting point to think with, not a claim about the",
  "    world.",
  "",
  "Most pairings are loose. That is expected and useful, so never upgrade a loose",
  "Bridge to strong to seem more helpful.",
  "",
  "Reply with a single JSON object and nothing else:",
  '  {"strength":"strong"|"loose","summary":"...",',
  '   "correspondences":[{"challenge":"...","subject":"..."}]}',
].join("\n");

/**
 * The JSON Schema the model answers under. Every field is required, because
 * every Bridge has all three — there is no branch of this schema that omits the
 * correspondences.
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
    strength: {
      type: "string",
      enum: ["strong", "loose"],
      description: "How far the shared structure actually holds.",
    },
    summary: {
      type: "string",
      description: "One sentence naming the shared underlying problem.",
    },
    correspondences: {
      type: "array",
      description: "Two or three Challenge ↔ subject pairings.",
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
  },
  required: ["strength", "summary", "correspondences"],
  additionalProperties: false,
};

/**
 * The structured-output envelope passed as `output_config.format`. For a JSON
 * schema the Messages API takes exactly `type` and `schema` — a `name` alongside
 * them is rejected with `400 output_config.format.name: Extra inputs are not
 * permitted`.
 */
const RESPONSE_FORMAT = { type: "json_schema", schema: BRIDGE_SCHEMA };

/**
 * Build the request params for one Bridge. Split out so a test can assert what
 * the model is and is not told without a live client.
 *
 * @param {BridgeRequest} request
 * @returns {{ model: string, max_tokens: number, system: string,
 *   output_config: { effort: string, format: { type: string, schema: object } },
 *   messages: { role: string, content: string }[] }}
 */
export function buildBridgeRequest({ challenge, parallel }) {
  const headings =
    parallel.headings.length > 0
      ? parallel.headings.join("; ")
      : "(none listed)";

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
 * {@link BridgeResult}. A response missing the substance of a Bridge — no
 * summary, or no usable correspondences — throws, so the card shows a failure
 * rather than a half-rendered Bridge. An unreadable `strength` does not throw:
 * the Bridge itself is intact, so it degrades to `loose`, the label that
 * understates rather than oversells.
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

  const summary = typeof raw.summary === "string" ? raw.summary.trim() : "";
  /** @type {any[]} */
  const rawPairs = Array.isArray(raw.correspondences) ? raw.correspondences : [];
  const correspondences = rawPairs
    .map((pair) => ({
      challenge:
        typeof pair?.challenge === "string" ? pair.challenge.trim() : "",
      subject: typeof pair?.subject === "string" ? pair.subject.trim() : "",
    }))
    .filter((pair) => pair.challenge !== "" && pair.subject !== "");

  if (summary === "" || correspondences.length === 0) {
    throw new Error("The model’s Bridge had no summary or no correspondences.");
  }

  return {
    strength: raw.strength === "strong" ? "strong" : "loose",
    summary,
    correspondences,
  };
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
