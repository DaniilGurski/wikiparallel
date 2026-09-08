import { test } from "node:test";
import assert from "node:assert/strict";

import {
  buildBridgeRequest,
  createBridgeGenerator,
  parseBridgeResult,
  BRIDGE_MODEL,
} from "../src/bridge.js";
import { makeParallel } from "./helpers.js";

/**
 * A fake Anthropic client: records the params it is handed and replies with
 * `reply` (a value to resolve, or an `Error` to reject). No vendor SDK, no
 * network — the whole point of the injection seam.
 *
 * @param {any} reply
 */
function fakeClient(reply) {
  /** @type {any[]} */
  const calls = [];
  const client = {
    messages: {
      create: async (/** @type {any} */ params) => {
        calls.push(params);
        if (reply instanceof Error) throw reply;
        return reply;
      },
    },
  };
  return { client, calls };
}

/** A Messages API response whose single text block is `json`. */
const textResponse = (/** @type {string} */ json) => ({
  content: [{ type: "text", text: json }],
});

/** A well-formed graded Bridge, as JSON, for the tests that need a valid reply. */
const BRIDGE_JSON = JSON.stringify({
  strength: "strong",
  summary: "Both regulate a flow against a set point.",
  correspondences: [{ challenge: "incoming requests", subject: "blood glucose" }],
});

const PARALLEL = makeParallel({
  title: "Homeostasis",
  field: "Science",
  leadSection:
    "Homeostasis is the state of steady internal conditions maintained by living systems.",
  headings: ["Overview", "Feedback loops"],
  closeness: 87,
});

test("the request carries the Challenge, title, Field, Lead Section and headings", () => {
  const params = buildBridgeRequest({
    challenge: "handling a sudden surge of users",
    parallel: PARALLEL,
  });
  assert.equal(params.model, BRIDGE_MODEL);

  const wire = JSON.stringify(params);
  assert.match(wire, /handling a sudden surge of users/);
  assert.match(wire, /Homeostasis/);
  assert.match(wire, /Science/);
  assert.match(wire, /steady internal conditions/);
  assert.match(wire, /Feedback loops/);
});

test("the structured-output envelope is the shape the Messages API accepts", () => {
  const params = buildBridgeRequest({ challenge: "c", parallel: PARALLEL });

  // `output_config.format` for a JSON schema takes exactly `type` and `schema`.
  // A stray `name` is rejected outright: 400 "output_config.format.name: Extra
  // inputs are not permitted".
  assert.deepEqual(Object.keys(params.output_config.format).sort(), [
    "schema",
    "type",
  ]);
  assert.equal(params.output_config.format.type, "json_schema");
});

test("the request carries neither the Home Field nor the Closeness", () => {
  // A Parallel carrying closeness 87, in Field "Science" (which would also be
  // the Home Field for a life-sciences Challenge).
  const params = buildBridgeRequest({
    challenge: "keeping cells alive",
    parallel: PARALLEL,
  });

  const wire = JSON.stringify(params);
  assert.doesNotMatch(wire, /Home Field/i);
  assert.doesNotMatch(wire, /Closeness/i);
  assert.doesNotMatch(
    wire,
    /87/,
    "the Closeness number must not reach the model",
  );
});

test("the client is built per request, so a key changed on the settings page is picked up", async () => {
  const { client } = fakeClient(textResponse(BRIDGE_JSON));
  let created = 0;
  const generateBridge = createBridgeGenerator({
    createClient: () => {
      created += 1;
      return client;
    },
  });

  await generateBridge({ challenge: "c", parallel: PARALLEL });
  await generateBridge({ challenge: "c", parallel: PARALLEL });
  assert.equal(created, 2);
});

test("a strong response parses into a Bridge labelled strong", async () => {
  const body = JSON.stringify({
    strength: "strong",
    summary: "Both regulate a flow against a set point.",
    correspondences: [
      { challenge: "incoming requests", subject: "blood glucose" },
      { challenge: "the load balancer", subject: "the pancreas" },
    ],
  });
  const { client } = fakeClient(textResponse(body));
  const generateBridge = createBridgeGenerator({ createClient: () => client });

  const result = await generateBridge({ challenge: "c", parallel: PARALLEL });
  assert.equal(result.strength, "strong");
  assert.equal(result.summary, "Both regulate a flow against a set point.");
  assert.equal(result.correspondences.length, 2);
});

test("a loose response keeps its correspondences and is labelled loose", async () => {
  // The old behaviour threw this pairing away as a weak verdict. A loose Bridge
  // is still a Bridge: the person gets the correspondences and the label.
  const body = JSON.stringify({
    strength: "loose",
    summary: "Only the vocabulary of 'networks' really carries over.",
    correspondences: [{ challenge: "your servers", subject: "the nerve cells" }],
  });
  const { client } = fakeClient(textResponse(body));
  const generateBridge = createBridgeGenerator({ createClient: () => client });

  const result = await generateBridge({ challenge: "c", parallel: PARALLEL });
  assert.equal(result.strength, "loose");
  assert.equal(result.correspondences.length, 1);
});

test("an unrecognised strength falls back to loose rather than discarding the Bridge", () => {
  const body = JSON.stringify({
    strength: "medium",
    summary: "Both push a system past its designed limit.",
    correspondences: [{ challenge: "traffic", subject: "rainfall" }],
  });
  // "loose" is the humbler of the two labels, so an unreadable label degrades
  // toward understating the Bridge, never overselling it.
  assert.equal(parseBridgeResult(textResponse(body)).strength, "loose");
});

test("a malformed response is an error, not a half-parsed Bridge", () => {
  assert.throws(
    () => parseBridgeResult(textResponse("not json at all")),
    /valid JSON/,
  );
  assert.throws(
    () => parseBridgeResult(textResponse("{}")),
    /no summary or no correspondences/,
  );
  assert.throws(
    () => parseBridgeResult(textResponse('{"strength":"strong","summary":"x"}')),
    /no summary or no correspondences/,
  );
  assert.throws(() => parseBridgeResult({ content: [] }), /empty response/);
});

test("the model is told to grade every Bridge rather than refuse one", () => {
  const params = buildBridgeRequest({ challenge: "c", parallel: PARALLEL });

  const schema = /** @type {any} */ (params.output_config.format.schema);
  assert.deepEqual(schema.required.sort(), [
    "correspondences",
    "strength",
    "summary",
  ]);
  assert.deepEqual(schema.properties.strength.enum, ["strong", "loose"]);
  assert.doesNotMatch(
    params.system,
    /\bweak\b/i,
    "the refusal path is gone from the prompt, not just from the schema",
  );
});

test("a client failure propagates so the card can show a failure", async () => {
  const { client } = fakeClient(new Error("401 unauthorized"));
  const generateBridge = createBridgeGenerator({ createClient: () => client });
  await assert.rejects(
    () => generateBridge({ challenge: "c", parallel: PARALLEL }),
    /401/,
  );
});
