// Characterization tests: these document what the extracted code DOES TODAY,
// outside the S3/S4 correction. They are not acceptance requirements.
//
// REPLACED IN THIS BATCH (both pinned unsafe behavior, coverage now asserts the
// opposite in test/plex-runtime.regression.test.mjs):
//   - "characterization: a failed read still produces an entry-only PUT"
//   - "characterization: a concurrent append is silently overwritten"
//
// Also replaced (write-outcome propagation): "characterization: rescue path
// discards the write result" pinned the old silent discard and is now an
// assertion that the outcome is recorded and propagated. The "Please do" gate
// test below is unchanged.

import test from "node:test";
import assert from "node:assert/strict";

import {
  appendPlexFile,
  cleanPath,
  executeRescuedCalls,
  extractTextFunctionCalls,
  isActiveContextFileRequest,
  normalizePlexArchivePath,
  shouldUseTools,
  WriteTracker,
} from "../src/lib/plex-runtime.ts";

function b64(text) {
  return Buffer.from(text, "utf-8").toString("base64");
}

function jsonResponse(payload, ok = true, status = 200) {
  return { ok, status, json: async () => payload, text: async () => JSON.stringify(payload) };
}

function stubFetch(handler) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const entry = {
      url: String(url),
      method: init.method ?? "GET",
      body: init.body ? JSON.parse(init.body) : undefined,
    };
    calls.push(entry);
    return handler(entry, calls.length);
  };
  return {
    calls,
    restore() {
      globalThis.fetch = original;
    },
  };
}

test("characterization: path helpers normalize as they do today", () => {
  assert.equal(cleanPath("/sediment/2026-01-01.md"), "sediment/2026-01-01.md");
  assert.deepEqual(normalizePlexArchivePath("plex/sediment/2026-01-01.md"), { path: "sediment/2026-01-01.md" });
  assert.deepEqual(normalizePlexArchivePath("plex/dreams/2026-01-01.md"), { path: "dreams/2026-01-01.md" });
  assert.equal(
    normalizePlexArchivePath("archive/sediment/2026-01-01.md").error,
    "Invalid archive path. Use sediment/YYYY-MM-DD.md or dreams/YYYY-MM-DD.md."
  );
});

test("characterization: the tool gate ignores conversational assent", () => {
  // The gate sees only the current message, mode, and a detected file request.
  // It has no representation of a preceding offer, so assent alone opens nothing.
  assert.equal(shouldUseTools("Please do.", "relational", null), false);
  assert.equal(shouldUseTools("yes", "relational", null), false);
  assert.equal(shouldUseTools("go ahead", "relational", null), false);

  // An active-context file request does not unlock tools for a bare assent either.
  assert.equal(shouldUseTools("Please do.", "relational", { type: "file", path: "plex-is.txt" }), false);
  assert.equal(isActiveContextFileRequest({ type: "file", path: "/plex-is.txt" }), true);

  // An operational mode, or any file request outside active context, does unlock.
  assert.equal(shouldUseTools("ok", "operational", null), true);
  assert.equal(shouldUseTools("Please do.", "relational", { type: "file", path: "sediment/2026-01-01.md" }), true);
});

test("characterization: text-mode function calls are stripped and parsed", () => {
  const text = 'before <function=write_plex_file>{"path":"sediment/2026-01-01.md","content":"x"}</function> after';
  const { cleaned, calls } = extractTextFunctionCalls(text);
  assert.equal(cleaned.includes("<function="), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "write_plex_file");
  assert.equal(calls[0].args.path, "sediment/2026-01-01.md");

  const broken = extractTextFunctionCalls("<function=write_plex_file>{not json}</function>");
  assert.deepEqual(broken.calls, []);
});

test("characterization: rescue path records the write outcome", async () => {
  // Replaces "rescue path discards the write result", which asserted the old
  // silent discard. Every real assertion moved to the propagation suite; this
  // keeps the same rescue invocation and now requires the outcome to be kept.
  const seen = [];
  const tracker = new WriteTracker();
  const out = await executeRescuedCalls(
    [{ name: "write_plex_file", args: { path: "sediment/2026-01-01.md", content: "NEW" } }],
    {
      writeFile: async (...args) => {
        seen.push(args);
        return { status: "rejected", path: "sediment/2026-01-01.md", code: "conflict" };
      },
      submitRequest: async () => {},
      tracker,
    }
  );

  assert.equal(out.requestSubmitted, undefined);
  assert.equal(seen.length, 1);
  assert.equal(seen[0][2], "plex: write (rescued from text)");

  const outcomes = tracker.outcomes;
  assert.equal(outcomes.length, 1);
  assert.equal(outcomes[0].status, "rejected");
  assert.equal(outcomes[0].code, "conflict");
  assert.equal(JSON.stringify(outcomes).includes("boom"), false);
});

test("characterization: rescue path records submit_request", async () => {
  // Renamed from "... submit_request only": a submit still produces no write
  // outcome, but the return value is no longer the only thing carried.
  const submitted = [];
  const tracker = new WriteTracker();
  const out = await executeRescuedCalls(
    [{ name: "submit_request", args: { request: "raise the token budget", notes: "n" } }],
    {
      writeFile: async () => ({ status: "confirmed", path: "unused.md" }),
      submitRequest: async (request, notes) => submitted.push({ request, notes }),
      tracker,
    }
  );
  assert.equal(out.requestSubmitted, "raise the token budget");
  assert.deepEqual(submitted, [{ request: "raise the token budget", notes: "n" }]);
  assert.deepEqual(tracker.outcomes, []);
});

test("characterization: rescue path swallows a throwing dependency", async () => {
  const tracker = new WriteTracker();
  const out = await executeRescuedCalls(
    [{ name: "submit_request", args: { request: "x" } }],
    {
      writeFile: async () => ({ status: "confirmed", path: "unused.md" }),
      submitRequest: async () => {
        throw new Error("firestore down");
      },
      tracker,
    }
  );
  assert.equal(out.requestSubmitted, undefined);
});

test("characterization: identity safeguard still rejects a short entry", async () => {
  const stub = stubFetch((entry) => {
    if (entry.method === "PUT") return jsonResponse({ content: {} });
    return jsonResponse({ content: b64("X".repeat(300)), sha: "sha-identity" });
  });
  try {
    const result = await appendPlexFile("plex-is.txt", "too short", "plex: write", "tok");
    assert.equal(result.status, "rejected");
    assert.equal(result.code, "identity-too-short");
    assert.equal(stub.calls.filter((c) => c.method === "PUT").length, 0);
  } finally {
    stub.restore();
  }
});

test("characterization: append formatting is unchanged", async () => {
  const stub = stubFetch((entry) => {
    if (entry.method === "PUT") return jsonResponse({ content: {} });
    return jsonResponse({ content: b64("A-ENTRY"), sha: "sha-1" });
  });
  try {
    await appendPlexFile("sediment/2026-01-01.md", "NEW-ENTRY", "plex: write", "tok");
    const put = stub.calls.find((c) => c.method === "PUT");
    assert.equal(Buffer.from(put.body.content, "base64").toString("utf-8"), "A-ENTRY\n\nNEW-ENTRY");
  } finally {
    stub.restore();
  }
});
