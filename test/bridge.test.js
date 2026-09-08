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

const PARALLEL = makeParallel({
  title: "Homeostasis",
  field: "Science",
  leadSection: "Homeostasis is the state of steady internal conditions maintained by living systems.",
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

test("the request carries neither the Home Field nor the Closeness", () => {
  // A Parallel carrying closeness 87, in Field "Science" (which would also be
  // the Home Field for a life-sciences Challenge).
  const params = buildBridgeRequest({ challenge: "keeping cells alive", parallel: PARALLEL });

  const wire = JSON.stringify(params);
  assert.doesNotMatch(wire, /Home Field/i);
  assert.doesNotMatch(wire, /Closeness/i);
  assert.doesNotMatch(wire, /87/, "the Closeness number must not reach the model");
});

test("the client is built per request, so a key changed on the settings page is picked up", async () => {
  const { client } = fakeClient(textResponse('{"kind":"weak","reason":"n/a"}'));
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

test("a well-formed bridge response parses into a discriminated Bridge", async () => {
  const body = JSON.stringify({
    kind: "bridge",
    summary: "Both regulate a flow against a set point.",
    correspondences: [
      { challenge: "incoming requests", subject: "blood glucose" },
      { challenge: "the load balancer", subject: "the pancreas" },
    ],
  });
  const { client } = fakeClient(textResponse(body));
  const generateBridge = createBridgeGenerator({ createClient: () => client });

  const result = await generateBridge({ challenge: "c", parallel: PARALLEL });
  assert.equal(result.kind, "bridge");
  assert.equal(result.kind === "bridge" && result.summary, "Both regulate a flow against a set point.");
  assert.equal(result.kind === "bridge" && result.correspondences.length, 2);
});

test("a well-formed weak response parses into a weak verdict", async () => {
  const { client } = fakeClient(
    textResponse('{"kind":"weak","reason":"They share only the word system."}'),
  );
  const generateBridge = createBridgeGenerator({ createClient: () => client });

  const result = await generateBridge({ challenge: "c", parallel: PARALLEL });
  assert.deepEqual(result, { kind: "weak", reason: "They share only the word system." });
});

test("a malformed response is an error, not a half-parsed Bridge", () => {
  assert.throws(() => parseBridgeResult(textResponse("not json at all")), /valid JSON/);
  assert.throws(() => parseBridgeResult(textResponse("{}")), /neither a Bridge nor a weak/);
  assert.throws(
    () => parseBridgeResult(textResponse('{"kind":"bridge","summary":"x"}')),
    /no summary or no correspondences/,
  );
  assert.throws(() => parseBridgeResult({ content: [] }), /empty response/);
});

test("a client failure propagates so the card can show a failure", async () => {
  const { client } = fakeClient(new Error("401 unauthorized"));
  const generateBridge = createBridgeGenerator({ createClient: () => client });
  await assert.rejects(() => generateBridge({ challenge: "c", parallel: PARALLEL }), /401/);
});
