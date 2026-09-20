import assert from "node:assert/strict";
import test from "node:test";
import {
  requestExaAnswer,
  ResearchProviderConfigurationError,
  selectResearchProvider,
} from "../server/services/askBaseResearchProvider";

test("provider selection prefers a direct Exa key in every environment", () => {
  assert.equal(selectResearchProvider({ EXA_API_KEY: "key", REPL_ID: "repl", VERCEL: "1" }), "exa-direct");
});

test("provider selection preserves the connector only on Replit", () => {
  assert.equal(selectResearchProvider({ REPL_ID: "repl" }), "replit-connector");
  assert.equal(selectResearchProvider({ VERCEL: "1" }), "unavailable");
  assert.equal(selectResearchProvider({}), "unavailable");
});

test("direct provider calls Exa with the server-side key and answer request", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const response = await requestExaAnswer("ground this", {
    env: { EXA_API_KEY: "secret-test-key", VERCEL: "1" },
    fetchImpl: async (input, init) => {
      request = { url: input.toString(), init };
      return new Response(JSON.stringify({ answer: "Grounded", citations: [] }), { status: 200 });
    },
  });

  assert.equal(response.status, 200);
  assert.equal(request?.url, "https://api.exa.ai/answer");
  assert.equal(new Headers(request?.init?.headers).get("x-api-key"), "secret-test-key");
  assert.deepEqual(JSON.parse(String(request?.init?.body)), { query: "ground this", text: true });
});

test("Replit uses the connector request and never direct fetch without a key", async () => {
  let directCalls = 0;
  let connectorPath = "";
  await requestExaAnswer("question", {
    env: { REPL_ID: "repl" },
    fetchImpl: async () => {
      directCalls += 1;
      throw new Error("direct fetch must not run");
    },
    connectorRequest: async (path) => {
      connectorPath = path;
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(directCalls, 0);
  assert.equal(connectorPath, "/answer");
});

test("a failed direct Exa response is returned without connector fallback", async () => {
  let directCalls = 0;
  let connectorCalls = 0;
  const response = await requestExaAnswer("question", {
    env: { EXA_API_KEY: "key", REPL_ID: "repl" },
    fetchImpl: async () => {
      directCalls += 1;
      return new Response(JSON.stringify({ error: "unavailable" }), { status: 503 });
    },
    connectorRequest: async () => {
      connectorCalls += 1;
      return new Response("{}", { status: 200 });
    },
  });
  assert.equal(response.status, 503);
  assert.equal(directCalls, 1);
  assert.equal(connectorCalls, 0);
});

test("Vercel without EXA_API_KEY fails closed without connector or fetch", async () => {
  let calls = 0;
  await assert.rejects(
    requestExaAnswer("question", {
      env: { VERCEL: "1", REPL_ID: "stale-repl-marker" },
      fetchImpl: async () => {
        calls += 1;
        return new Response();
      },
      connectorRequest: async () => {
        calls += 1;
        return new Response();
      },
    }),
    (error: unknown) => error instanceof ResearchProviderConfigurationError && error.isVercel,
  );
  assert.equal(calls, 0);
});